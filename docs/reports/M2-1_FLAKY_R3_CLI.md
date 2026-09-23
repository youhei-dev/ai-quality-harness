# M2-1 準備: 不安定テスト（regression-r3-cli）の調査と修正 — v0.3.5

- 対象: `tests/regression-r3-cli.test.ts` の「R3-002 CLI signal handling cancels the pipeline > SIGTERM: check 2 never starts, check 1's descendants are gone, exit 143, no PASSED」
  （v0.3.4 時点の 115 行目 `expect(alive(r.onePid)).toBe(false)`）
- 発生: v0.3.4 の commit 単位の worktree 検証で、`npm run verify` の unit チェック（aiqh の中で vitest のフルスイート）として 1 回だけ FAIL（`expected true to be false`）。
  同じ worktree の直接の `npx vitest run` とやり直しの `npm run verify` は PASS
- 対応日: 2026-09-23。修正はテストのみ（`src/` の変更なし）

## 原因

テスト側の読み取りの競合。`runScenario` は pid ファイルが**存在する**ことだけを待ち、直後に `Number(readFileSync(...))` で読んでいた。
書き手（check 1 の node）の `writeFileSync` は「作成（O_CREAT | O_TRUNC）→ 書き込み」の 2 段なので、その間に読むと中身は空文字になる。

- `Number("") === 0`。`process.kill(0, 0)` は**呼び出し元のプロセスグループ宛て**で必ず成功するため、`alive(0)` は true になり、115 行目が失敗する
- この経路は失敗時の特徴（exit 143 と check 2 未起動の判定は通過、CLI は猶予 5 秒を待たずに終了、それでも alive が true）をすべて説明する
- 後始末の `killIfAlive` も同じ読み方で、pid ファイルが空のままなら `process.kill(0, "SIGKILL")` となり、vitest 自身のプロセスグループを終了させ得た
  （遅延を注入した再現で実際に発生し、vitest と呼び出し元のシェルが終了した）
- 製品（`aiqh verify` の中断処理）の不具合ではない

確度は中〜高。自然に起きた失敗で pid が 0 だったことは直接観測していない（失敗ログに値が無く、再計測でも自然発生しなかった）。
今後の再発に備えて、判定の失敗メッセージに `pid=<値>` を出すようにした。

## 否定した仮説と証拠の要約

| 仮説 | 結論 | 証拠（計測） |
|---|---|---|
| `kill(pid, 0)` がゾンビにも成功する | 前提は成り立つが原因ではない | macOS では、ゾンビだけのグループへの `kill(-pgid, 0)` は EPERM を返し、`groupAlive` はこれを生存扱いする。実シナリオを無負荷 200 回・CPU 負荷下 200 回、1ms 刻みで観測し、状態は常に「生存 → EPERM → 両方 ESRCH」の順。グループは消えたのに pid が見える逆転は 0 / 400 |
| 子孫の終了より先に CLI が終わる | 今回の SIGTERM 経路では起きない | `tryFinish` はグループが消えるまで確定しない。実物の `executeCommand` で、SIGTERM で死ぬ子 30 / 30、SIGTERM を無視する子（SIGKILL 経路）30 / 30 とも、resolve 直後のグループは消えていた。ただし SIGKILL 経路はコード上は消滅を確認していない（ROADMAP のバックログに記録） |
| PID の再利用 | 否定 | macOS の PID は +1 の連番割当（300 回 spawn で差分はすべて 1）。同じ PID に戻るには約 10 万回の割当が必要で、判定までの約 0.3 秒では起きない |
| シグナルから判定までの時間 | 否定 | SIGTERM から消滅まで p99 3.6ms（無負荷）/ 22ms（負荷）、最大 26.7ms。テストは CLI 終了後さらに 300ms 待ってから判定する |
| pid ファイルの空読み | **原因と判断** | 実テストと同じ形（別プロセスの node が書き、存在確認の直後に読む）で、1ms 間隔の読み取りでは 300 回中 1 回 `""` を読んだ。25ms 間隔（テストと同じ）では 0 / 300 で、まれにしか起きないことと合う |

## 再現方法

check 1 が pid ファイルを**空で作成し、遅れて pid を書く**ようにすると、修正前の待ち方では確実に失敗する。
v0.3.5 でこれを回帰ケースとして追加した（`pidWriteDelayMs: 400`、SIGTERM）。書き手は意図して非原子的なままにし、読み手の待ち方を検証し続ける。

- 修正前（pid ガードのみ入れ、待ち方は v0.3.4 のまま）: 対象ファイル単独で 1 failed / 2 passed。読んだ pid は 0（`expected 0 to be greater than 0`）、
  後始末はガードが `refusing to signal pid 0` で止めた（自分のグループへの SIGKILL は起きない）
- 修正後: 3 passed

## 修正内容（テストのみ）

- `tests/helpers.ts`: `parsePid`（正の安全な整数でなければ null）、`waitForPid(file, ms)`（中身が有効な pid になるまで待ち、時間内に得られなければ最後に読んだ中身を添えて例外）、
  `assertSignalablePid`（0 以下・NaN・安全な整数でない値を例外で拒否）
- `tests/regression-r3-cli.test.ts`: `waitForPid` で読む。`alive` / `killIfAlive` にガード。判定に `pid=<値>` のメッセージ。後始末は例外が出ても一時ディレクトリを消し、
  全クロージャを実行してから最初の例外を再送出する。遅延書き込みの回帰ケースを追加
- 同じ危険のある箇所の置き換え（下の洗い出し）
- 待ち時間・タイムアウトの延長、retry、skip、期待値の緩和はしていない

## 洗い出し（tests/ 全体、v0.3.4 の行番号）

| ファイル:行 | パターン | 危険 | 対応 |
|---|---|---|---|
| `regression-r3-cli.test.ts:93-94` | 存在を待った直後に pid を読む（書き手は生存中） | あり（空読み → pid 0 → 自分のグループへ signal 0） | `waitForPid` に置換 |
| `regression-r3-cli.test.ts:21-29`（`killIfAlive`） | pid ファイルを読んで `process.kill(pid, "SIGKILL")` | あり（pid 0 なら自分のグループを SIGKILL） | ガード |
| `regression-r3-cli.test.ts:31-38`（`alive`） | `process.kill(pid, 0)` | あり（pid 0 で常に true） | ガード |
| `regression-r2-cli-signal.test.ts:27-28` | `while (!existsSync)` の直後に pid を読む（書き手は生存中） | あり（同上） | `waitForPid` に置換（上限 8000ms。従来は上限なし） |
| `execute.test.ts:98`、`regression-r1-runner.test.ts:40`、`regression-r2-runner.test.ts:44` | 実行の終了後に pid を読み `process.kill(pid, 0)` が throw することを確かめる | あり（書き手が書き込み途中で終了させられると空 → pid 0 → 自分のグループへの signal 0 が成功し、誤った失敗になる） | `waitForPid` に置換 |
| `regression-r4-finalize.test.ts:59, 82` | `process.kill(process.pid, "SIGUSR2")` | なし（自分の pid を意図して使う） | 変更なし |
| `regression-r4-finalize.test.ts:39-41`、`regression-r3-cli.test.ts` のレポート読み取り | 存在確認の直後に JSON を読む | なし（種類が違う。レポートは一時ファイルから rename で置かれ〈`src/report/write.ts:48-49`〉、読むのは CLI の終了後） | 変更なし |

## 失敗率

| 条件 | 修正前（v0.3.4 のテスト） | 修正後（v0.3.5 のテスト） |
|---|---|---|
| (a) 対象ファイル単独 × 50 | 0 / 50 | 0 / 50 |
| (b) フルスイート × 10 | 0 / 10 | 0 / 10 |
| (c) CPU 負荷下（`yes` をコア数ぶん）で単独 × 30 | 0 / 30 | 0 / 30 |
| 既知の自然発生 | `npm run verify` の中で 1 回 | — |

自然発生はまれで、計測回数では発生しなかった。修正の確認は遅延書き込みの回帰ケース（修正前は確実に FAIL）で行う。
