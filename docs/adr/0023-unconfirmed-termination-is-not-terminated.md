# ADR-0023: 確認できなかった終了を、終了したことにしない

- 状態: 採用（ADR-0005 の「猶予後も生存していれば SIGKILL」の後に、消滅の確認と有界時間を足す。ADR-0005 は変えない。ARCHITECTURE §8 の「タイムアウト後の後始末ライフサイクル」の確定の条件を置き換える）
- 日付: 2026-10-05（M2-2、v0.5.33。ROADMAP のバックログ 16・2）

## 文脈
- 原則は ADR-0022 と同じ向き: **確認できなかったものを、確認できたことにしない**。子プロセスを止めるときは、「シグナルを送った」ことと「グループが消えた」ことは別の事実
- v0.5.32 のコード（`src/runner/execute.ts`）は、タイムアウトまたは中断の後、SIGTERM → 猶予 → SIGKILL と送り、SIGKILL を送った後は `close` が来れば**グループの消滅を確かめずに確定**した。
  `close` が来なければ、タイムアウトの経路には上限が無かった。レポートの文言は、確認の有無にかかわらず常に `(process group terminated)` だった
- 実測（v0.5.32、SP1。`executeCommand` と実 CLI。macOS）:
  - **16**: (1) SIGKILL の経路は、返った時点でグループがまだ残っていた（5 回中 5 回。消えたのは 3〜6 ms 後）。(2) SIGTERM の直後に `close` が来て、グループが 0.4 秒後に消えるとき、猶予の終わりまで待った
    （猶予 3 秒で 4.5 秒。消滅は約 1.9 秒）。(3) 別のプロセスグループ（`detached`）の孫が stdout / stderr の pipe を握ると、**SIGKILL はその孫に届かず、孫が終わるまで返らなかった**
    （タイムアウトの経路。孫の寿命 20 秒で、CLI は 20.3 秒後に返った。中断の経路は CLI の安全弁〈猶予 + 3 秒 = 8 秒〉で終わるが、レポートを書かずに終了した）。(4) 文言 `(process group terminated)` は、(1)〜(3) でも出た
  - **2**: グループへの kill も子への kill も EPERM のとき（同じプロセスの中で模擬。本物の EPERM は再現していない）、`child.kill()` が出す `error` イベントを `spawn failed: kill EPERM` として扱い、**1.0 秒で確定した。
    子は動き続けていた**。`error` は `killTree` の中で同期的に出るため、確定の時点では SIGKILL のタイマーがまだ無く、確定の後も残って kill を試み続けた。タイムアウトの文言は `failed to start: spawn failed: kill EPERM`（起動していないかのような文言）
- fail closed は元から保たれていた（タイムアウトは FAIL、中断は SKIPPED・verdict ERROR で、終了コードは 1 / 130 / 143）。問題は、**確認していないことを確認したように書くこと**と、**待ちに上限が無いこと**

## 決定
1. **確定の条件**（タイムアウトまたは中断の後）: `close` が来て、かつ `kill(-pgid, 0)` が ESRCH（グループ消滅）を返したとき。25 ms ごとに確認する。`close` の後にグループが残っていれば、猶予の終わりを待たず、消えた時点で確定する
2. **有界時間**: SIGKILL を送った後（SIGKILL の前にグループが消えたのに `close` が来ないときは、消えたと分かった時点から）、最大 `confirmMs`（既定 2,000 ms、`DEFAULT_CONFIRM_MS`。`terminateActiveChildren` の消滅待ちと同じ）待つ。
   それでも確定しなければ、stdout / stderr の pipe と子の handle を解放して確定する（`close` を待ち続けない）。`confirmMs` は `ExecuteOptions` の任意の項目だけで、config・CLI オプションにしない
3. **打ち切りの結果**: グループが残っていれば、結果（`ExecutionResult`）に内部の任意の欄 `terminationUnconfirmed: { waitedMs, killError }` を付ける。グループが消えていて `close` だけが来ないとき（別のグループの孫が pipe を握っている）は付けない（こちらのグループは終了している）。
   この欄は `CheckResult`（レポートの JSON・Markdown）にはコピーしない
4. **文言**（`src/runner/run-checks.ts`）: 消滅を確認できたときは従来どおり `(process group terminated)`。確認できなかったときだけ、`(process group still present 2000ms after SIGKILL)`、
   シグナルを送れなかった（EPERM 等）ときは `(process group could not be signalled (EPERM) and was still present after 2000ms)`。数値と errno の識別子（`^[A-Z][A-Z0-9_]{1,15}$` に合うものだけ。他は `UNKNOWN`）以外の外部の文字列は入れない。
   `errorSummary` は従来どおりレポートの出口（ADR-0006・ADR-0016・ADR-0017・ADR-0020）を通る。中断の SKIPPED では、出力もシグナルも無くても、確認できなかったことは文言に出す（`ran` に含める）
5. **終了コードとレポートの欄は変えない**: 「消えていない」が付くのは、すでに FAIL（タイムアウト → 1）か中断（130 / 143）の経路だけ。EPERM の経路も、以前の `spawnError`（FAIL）から、タイムアウトの FAIL へ変わるだけで 1 のまま。
   「確認できなかった」を終了コード 2（ツールの異常）にはしない（1 → 2 の変化が生じ、CI の `== 1` の扱いを変えるため）
6. **kill の失敗（バックログ 2）**: グループへ送り、失敗（ESRCH 以外）なら子へ `process.kill(child.pid, signal)`（`child.kill()` は失敗を `error` イベントにするので使わない）。子へは、Node がまだ回収していない（`exitCode`・`signalCode` が null）間だけ送る。
   どちらにも送れなければ errno を覚え、決定 2 の打ち切りで `killError` に入れる。`child.on("error")` は、pid が無い（起動に失敗した）ときだけ `spawn failed` として確定する。起動の後の `error` は確定の理由にしない
7. **CLI の安全弁との関係**: 猶予（5 秒）+ 確認（2 秒）= 7 秒 < 猶予 + 3 秒（8 秒、`SAFETY_VALVE_EXTRA_MS`。`src/cli-signals.ts`）。中断の経路は、runner が先に確認を終えて返り、レポートを書いて終了する（以前は、別グループの孫が pipe を握ると安全弁で終了し、レポートは無かった）。
   この関係はテストで固定する（`DEFAULT_CONFIRM_MS` を export）
8. **変えないもの**: `terminateActiveChildren`（CLI は待たない。中断の確認は `executeCommand` が行う）、Windows の `groupAlive`（常に false の分岐。Windows は対象外で、macOS / Linux が対象）、ADR-0005 の他の決定

## 代替案
- 文言・コメント・文書だけを「送った」までの主張に直す: 無限待ちが残る（20 秒返らなかった）。確認できたときも文言が変わり、既存テスト 1 件（`regression-m2-2-flake-001-timeout-after-abort.test.ts`）の期待値が変わる。採らない
- 確認できなかったときに終了コード 2: 上の決定 5 のとおり採らない
- 有界時間を 1,000 ms にする: 安全弁との余裕は増えるが、遅い環境で、実際には消えるものを「消えていない」と書きやすい。3,000 ms 以上は中断の経路で安全弁が先に動く
- 有界時間を設定項目にする: 設定の契約を増やす（M2-2 の範囲外）。`ExecuteOptions` の任意の項目だけにした
- EPERM のとき `error` を握りつぶすだけ（`child.kill` のまま）: 早い確定は直るが、`close` が来ないときの無限待ちが残る。有界時間とセットで直す
- 子へのシグナルを `process.kill` に変えるだけで有界時間を足さない: EPERM のとき永久に待つ。**kill の失敗の扱い（決定 6）は、有界時間（決定 2）に依存する**

## 既知の限界
- **別のプロセスグループへ移った子孫（`setsid` 相当）は止められない**: aiqh が止めるのは、チェックのプロセスグループだけ。確定しても、その子孫は残る（実測: 寿命 10 秒の孫は、返った後も約 10 秒生きた）。決定の対象外
- 通常に終わった（終了コード 0 など）チェックの後に、同じグループに残った子孫は見ない（確認は、タイムアウトと中断の後だけ）
- 打ち切りの後に出た stdout / stderr は取らない（別のグループの孫が pipe を握っているときなど）。取得済みの出力（末尾）はそのまま `stdoutTail` / `stderrTail` に入る
- `kill(-pgid, 0)` は、同じ id の別のグループがあると「ある」と答える（pgid の再利用）。そのときは 2 秒待って「消えていない」と書く（実際より悪い向きの誤りで、終了コードは変わらない）。EPERM も「ある」と数える
- 確認の粒度は 25 ms。通常の SIGKILL の経路は +10 ms 前後（実測: 中央値 2,505 → 2,517 ms）。1 回、負荷の下で 2,784 ms を観測した
- 本物の EPERM は再現していない（通常ユーザーで安全に起こせない）。EPERM の挙動は、同じプロセスの中の模擬（`process.kill` と `ChildProcess.prototype.kill`）で確かめた
- テスト「SIGKILL の経路: 返った時点でグループが消えている」は、v0.5.32 では結果が決定的でない（グループは SIGKILL の数 ms 後に消えるため）。この版以後に PASS し続けることを守るガードで、v0.5.32 での FAIL は保証しない

## 影響
- 利用者に見える変更: 確認できなかったときの `errorSummary` の文言（上の決定 4）。別のグループの孫が pipe を握るときと、SIGTERM の後にグループが遅れて消えるときの所要時間（前者は有界に、後者は短く）。終了コード・レポートの JSON・Markdown の欄は変わらない
- 実測（SP1、timeout 1.5 秒・猶予 1 秒の `executeCommand`）: 孫が SIGTERM で終わる 1,508 → 1,507 ms、SIGKILL の経路 2,505 → 2,517 ms、孫が SIGTERM の 400 ms 後に終わる（猶予 3 秒）4,505 → 1,922 ms、別のグループの孫が pipe を握る（寿命 10 秒）10,116 → 4,520 ms。
  実 CLI（timeout 2 秒）: 同じ孫（寿命 20 秒）20,254 → 9,229 ms、中断（SIGINT）で 8,017 ms（安全弁・レポートなし）→ 7,050 ms（レポートあり）
- 最悪の増え方: 確認できないチェック 1 件につき、猶予の後に最大 +2 秒（以前は上限なし）
- テスト: `tests/regression-backlog16-confirm-termination.test.ts`（12 件）。v0.5.32 の `src/` に当てると 9 件が FAIL（決定的 8 件＋競合に依存するガード 1 件）、3 件（対照）が PASS
- 関連（この ADR の範囲外）: ROADMAP 項目 5（`test:minpath` をプロセスグループで起動する案）は、vitest を別グループにすると runner のグループごとの SIGKILL が vitest に届かなくなる（実測: 8 件残り、2 件は 40 秒後も走った）ので、この版では直さない
