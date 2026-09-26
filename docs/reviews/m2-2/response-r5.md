# M2-2 独立レビュー R5 への対応記録（response-r5）— v0.5.7（テストの不安定と M2-2-FLAKE-001 の作業の区切り）

- 対象レビュー: `docs/reviews/m2-2/independent-review-r5.md`（受領ファイル名 `independent-review-m2-2-r5-for-claude.md`、ChatGPT、2026-09-26 受領、SHA-256 776fb34c…。
  対象 v0.5.6 = commit 6def387 / tag object 0efff5c、範囲 v0.5.5..v0.5.6、パケット `review-packet-m2-2-r5.md`）
- 対応日: 2026-09-26
- 結果（レビュアー）: 前回の指摘で判定の対象は無し。新しい指摘は High 0 / Medium 1（M2-2-R5-001）/ Low 1（M2-2-R5-002）
- 人間の判断: 完了基準「High が無ければ区切り、Medium 以下はバックログへ」に従い、テストの不安定と M2-2-FLAKE-001 の作業（v0.5.6）を v0.5.7 で区切る。
  R5-001 は **Medium のままバックログの先頭（1）へ（v0.5.7 では修正しない）**。R5-002 は Low で、docs の文言をこの版で直した。v0.5.7 は docs だけの版。
  区切る前に R5-001 の前提を実測した（M2-2-R1-007 の教訓）

## 前回の指摘の判定（レビュアーの判定）

対象なし。M2-2-R4-001・M2-2-R4-002 はバックログのまま（v0.5.7 の番号で 2・3）で、この回の範囲の外。

## M2-2-R5-001（Medium）— 前提の確認（実装 AI、2026-09-26。`tmp/m2-2/r5-record/`。`src/`・`tests/` は変えていない）

### 確かめ方

- 一時 worktree（v0.5.6 = commit 6def387）のテストの写しだけに、子の準備の前の遅れ（`Atomics.wait`）と記録（テストと子の出来事の時刻、子の `exit` のコード、
  未捕捉の例外）を足した。await・assert・後始末の流れは変えていない。遅れ 0 では 3 件とも PASS した（記録を足しても壊れない）
- 子のプロセスは一時ディレクトリの接頭辞で見分け、`ps` で 100 ms ごとに記録した。vitest の終了の後も最大 60 秒追い、残っていれば SIGKILL する形にしたが、
  その必要は 6 回とも無かった
- 各実行の前の負荷平均（1 分）は 3.12〜7.54（8 以下を待ってから実行）

### 再現（テスト 1 ファイルだけの実行）

時間は、テストが失敗した時刻からの長さ。子の終わりは、子が書いた `exit` の記録の時刻（sh はその直後に終わった）。

| ケース | 作り方 | 失敗の文言 | 失敗から子・孫が消えるまで | vitest の終了の後の残り | 子の終わり方 | 後続への影響 |
|---|---|---|---|---|---|---|
| A: `regression-r4-report.test.ts` のシナリオ A | 子の準備の前に 12 秒の遅れ | `no valid pid in $TMPDIR/aiqh-…/ready.pid within 10000ms (last content: file missing)`（**「precondition: …」ではない**） | 約 2.0 秒 | 無し（vitest の終了の約 1.0 秒前に消えた） | 遅れの後に準備の印を書こうとして ENOENT（afterEach が一時ディレクトリを消していた）の未捕捉の例外で exit 1 | 同じファイルの後続（シナリオ B）は PASS |
| A2（補足）: 同じ。遅れが runner のタイムアウト 20 秒を超える | 25 秒の遅れ | 同上 | 約 15.0 秒 | **約 12.0 秒** | 同上（spawn から約 25 秒で exit 1）。runner の 20 秒のタイムアウトは働かなかった（ワーカーは spawn から約 13 秒で止められた）。sh は launchd（ppid 1）に引き取られていた | 同じファイルの後続は PASS |
| B: `regression-m2-2-flake-001-timeout-after-abort.test.ts` | 子の準備の前に 2650 ms の遅れ（準備完了は spawn から約 2.68 秒） | `precondition: the abort is sent well before the timeout: expected 2707.6… to be less than 2500`（前提の文言） | **約 30.0 秒** | **約 30.0 秒** | 自分の寿命（準備の後の `setTimeout` 30 秒）の終わりで exit 0。runner のタイムアウト 3 秒・猶予 4 秒は働かなかった（ワーカーは spawn から約 2.7 秒で止められた）。sh は launchd に引き取られていた | 同じファイルに後続のテストは無い |

### 後続のファイルへの影響（全体の実行、99 ファイル 619 件）

| 実行 | 遅れ | 結果 | A の子（失敗から消えるまで） | B の子（失敗から消えるまで） |
|---|---|---|---|---|
| F1 | A 12 秒、B 2650 ms | 2 failed / 617 passed（ファイルは 2 failed / 97 passed）。失敗は狙った 2 件だけ | 約 2.1 秒 | 約 30.0 秒（その間、ほかのファイルの実行と重なった） |
| F2 | A 25 秒、B 2650 ms | 同上 | 約 15.0 秒 | 約 30.0 秒 |

- 同じファイルの後続（r4 のシナリオ B）は、単独の実行 2 回と全体の実行 2 回の 4 回とも PASS

### レビューの前提との違い: 失敗の後は runner の後始末も働かない

レビューは、後始末が runner に任され、子は「runner の 20 秒のタイムアウトまで」（A）、「タイムアウト 3 秒 + 猶予 4 秒の間」（B）残りうるとした。実際には、
vitest 5.0（既定の `isolate: true`、pool forks）は**テストファイルが終わるたびにそのワーカーを SIGTERM で止める**（`node_modules/vitest` の `ForksPoolWorker.stop()`）。
runner のタイマーはワーカーの中にあるので、ファイルが終わると SIGTERM → 猶予 → SIGKILL は行われない。子のプロセスグループは `detached` で別なので、
ワーカーが止められても signal は届かず、**子は自分の寿命まで残る**（ワーカーの子だった sh は launchd に引き取られる）。runner のタイマーが働くのは、
同じファイルの後続のテストがワーカーを生かしている間だけ。

### High の基準の判定

| 基準 | 結果 |
|---|---|
| 失敗の経路で、子・孫が自分の寿命を超えて残り続ける、または vitest の終了後も無期限に残る | 当たらない。6 回の実行すべてで、子・孫は自分の予定で終わった（B: `setTimeout` 30 秒の終わりで exit 0。A: 遅れの終わりに ENOENT で exit 1）。監視の SIGKILL は 0 回。残る長さの上限は子の寿命（遅れ + 最長 30 秒） |
| 後続のテスト・ファイルの結果が変わる | 当たらない。同じファイルの後続は 4 回とも PASS。全体の実行 2 回で、ほかの 617 件はすべて PASS |

→ High の基準に当たらない。テストの後始末の穴として Medium のまま。

### 同じ種類の洗い出し（`tests/` 全体）

`executeCommand()` を直接・間接に呼んだ後、確定を待つ前に失敗しうる assert・待ちがあり、その失敗の経路で実行中の処理を止めない箇所。行番号は v0.5.6。

| ファイル | テスト | 失敗しうる箇所 | 後始末 | 子の寿命（runner の上限は、ワーカーが生きている間だけ働く） |
|---|---|---|---|---|
| `regression-r4-report.test.ts` | シナリオ A「outputTruncated stays true when a chatty check is interrupted」 | 58 行 `waitForPid(ready, 10_000)`（文言は precondition でない） | **無し**（afterEach は一時ディレクトリの削除だけ。`controller.abort()` に届かない） | 子: 準備の後 `setTimeout` 30 秒（SIGTERM を無視）。runner: タイムアウト 20 秒 + 猶予 200 ms。**実測: 上の A・A2** |
| `regression-m2-2-flake-001-timeout-after-abort.test.ts` | 「abort first; the timeout expires during the grace period …」 | (1) 58 行 `waitReady(ready)`: 待つ間（10 秒）に runner のタイムアウト 3 秒が働き、確定する（残らない） (2) 60 行 `abortAt` の前提（2500 ms 未満） | **無し**（(2) で `controller.abort()` に届かない） | 子: 準備の後 `setTimeout` 30 秒（SIGTERM を無視）。runner: タイムアウト 3 秒 + 猶予 4 秒。**実測: 上の B** |
| `regression-r4-report.test.ts` | シナリオ B「timedOut stays true when an abort overlaps a timeout」 | (1) 104 行 `waitReady(ready)`: 待つ間に runner のタイムアウト 3 秒が働き、確定する (2) 105 行 `waitForPid(term, 10_000)` (3) 106 行 `expect(settled, "precondition: …")` | (2)(3): afterEach が `childPid` に SIGKILL。(3) は実行が確定した後（通常はグループが消えた後）にも送る（PID の再利用の点で見直す） | 子: 準備の後 `setTimeout` 30 秒（SIGTERM を無視）。runner: タイムアウト 3 秒 + 猶予 20 秒 |
| `regression-r2-cli-signal.test.ts` | 「SIGKILLs TERM-ignoring descendants of every active check …」 | 27 行 `waitForPid(pidFile, 8000)`（`terminateActiveChildren()` に届かない） | **無し** | 孫: `setTimeout` 8 秒（SIGTERM を無視、stdio を閉じる）。runner: タイムアウト 20 秒 + 猶予 5 秒（既定） |
| `regression-r3-cli.test.ts` | SIGINT・SIGTERM・「pid file created empty …」の 3 件（`runScenario`） | CLI（`node src/cli.ts verify`、非同期の子プロセス）を起こした後の 121 行 `waitFor(one.started, 8000)`、123 行 `waitForPid(one.pid, 8000)`、127 行 `await exited`（上限はテストの 20 秒） | 一部: afterEach は check 1・2 の pid ファイルがあれば、その pid に SIGKILL（空のファイルは pid の検査で止まる）。**CLI のプロセスは止めない** | CLI: check 1（10 秒）→ check 2（8 秒、SIGTERM を無視）を順に実行して終わる（各 `timeoutSec` 30）。CLI はワーカーと同じプロセスグループで、ワーカーを止める signal は届かない |
| `execute.test.ts`（タイムアウトの 1 件）、`regression-r1-runner.test.ts`、`regression-r2-runner.test.ts` | 孫までタイムアウトで止める各 1 件 | 該当しない（`await executeCommand()` の直後に assert。確定の後）。製品が孫を止め損なったときだけ、最後の `process.kill(pid, 0)` の assert が失敗し、孫は自分の寿命まで残る | — | 孫: `setTimeout` 30 秒 |
| `execute.test.ts`（ほか 6 件）、`regression-r4-output-tail.test.ts`、`regression-r5-utf8-tail.test.ts` | — | 該当しない（すぐ await。子は短命） | — | — |
| `regression-r4-finalize.test.ts`、`regression-r1-verify.test.ts`、`regression-m2-2-r2-001-output-boundary.test.ts`、`regression-m2-2-r3-001-line-breaks.test.ts`、`cli.test.ts` | `runVerify()`・CLI の実行 | 該当しない（`runVerify()`・`execFile` をすぐ await。`spawnSync` は同期） | — | — |

## M2-2-R5-002（Low）— docs の文言（この版で直した）

`src/runner/execute.ts` の確定の条件（`tryFinish()`、127〜131 行）は「`close` の後、中断・タイムアウトの後は、加えて SIGKILL を送信済み、またはグループが消滅」。
SIGKILL の送信で確定するときは、グループの消滅を確かめない。docs の関係する文（行番号は v0.5.6）:

| # | 場所 | 文 | 実装 | 判定 | 対応 |
|---|---|---|---|---|---|
| 1 | `docs/ARCHITECTURE.md:170` | timeoutSec 超過 → プロセスグループへ SIGTERM → 猶予後 SIGKILL → status FAIL(timedOut) | `escalate()`（136〜144 行） | 合う | そのまま |
| 2 | `docs/ARCHITECTURE.md:394` | 「SIGKILL 送信済み」または `kill(-pgid, 0)` が ESRCH（グループ消滅）を返すまで、runner の Promise は解決しない | `tryFinish()` | 合う（レビュアーも一致と判定） | そのまま |
| 3 | `docs/ARCHITECTURE.md:395` | leader の `close` だけでは解決しない（孫が stdout/stderr を閉じていても、後始末が完了するまで待つ） | SIGKILL の送信で確定し、消滅は確かめない | 「後始末が完了するまで」はグループの消滅までと読める | 直した |
| 4 | `docs/ARCHITECTURE.md:401-402` | `terminateActiveChildren`: SIGTERM → 猶予 5 秒 → SIGKILL → 消滅確認。実行中の `executeCommand` 自身も abort を受けて同じエスカレーションを行う | `terminateActiveChildren()` の消滅確認は最大 2 秒（46 行）。`executeCommand()` は SIGKILL の送信で確定し、消滅は確かめない | 「同じエスカレーション」は `executeCommand()` も消滅を確かめると読める。消滅確認の上限も書いていない | 直した |
| 5 | `docs/ARCHITECTURE.md:431` | `stdoutTail` / `stderrTail` はプロセスグループが終わるまでに取得した出力の末尾 | 出力は stdout / stderr が閉じる（`close`）までに取得したもの。確定は `close` の後、グループの消滅または SIGKILL の送信 | 合わない（M2-2-R5-002） | 直した |
| 6 | `docs/ARCHITECTURE.md:435` | `executeCommand` は子の `exit` ではなく `close` で結果を確定する | `close` は確定の必要条件（中断・タイムアウトの後は、加えて消滅か SIGKILL の送信） | 合う（exit と close の区別の説明） | そのまま |
| 7 | `docs/ARCHITECTURE.md:493`（§10 の表） | 実行中のグループへ SIGTERM → 最大 5 秒 → SIGKILL → 消滅確認の後に終了 | CLI は `terminateActiveChildren()` を待たない（`src/cli.ts:39` の `void`）。`executeCommand()` は SIGKILL の送信で確定する | 合わない。既知（バックログ 18。v0.5.6 の番号で 17）で、コードで確かめるか文書を直すかは着手時に決める | 変えない（バックログ 18 のまま） |
| 8 | `docs/ROADMAP.md:200`（M2-2 の節の v0.5.6 の記録）、`CHANGELOG.md:27`（v0.5.6 の項） | 出力の末尾の文言（プロセスグループが終わるまでに取得した出力。実装に合わせた） | — | 過去の版の記録 | 変えない（v0.5.7 の項に訂正を書いた） |
| 9 | `docs/reports/M0_COMPLETION.md:12`、`docs/reports/M2-1_FLAKY_R3_CLI.md:28` | 「… SIGKILL → グループ消滅確認」、「`tryFinish` はグループが消えるまで確定しない（ただし SIGKILL 経路はコード上は消滅を確認していない）」 | — | 過去の報告書（後者は注記つき） | 変えない |
| 10 | `src/runner/execute.ts:133`、`src/cli.ts:24`（コードのコメント） | SIGTERM → grace → SIGKILL → group gone | — | グループの消滅まで待つと読める | この版は `src/` を変えない。バックログ 18 で合わせる |

直した文（`docs/ARCHITECTURE.md`）:

- 3: 「（孫が stdout/stderr を閉じていても、SIGKILL の送信かグループの消滅まで待つ。SIGKILL の送信で解決するときは、グループの消滅を確かめない。v0.5.7 で文言を
  実装に合わせた）」
- 4: 「（`terminateActiveChildren`: SIGTERM → 猶予 5 秒 → SIGKILL → 消滅確認〈最大 2 秒〉。実行中の `executeCommand` 自身も abort を受けて SIGTERM → 猶予 → SIGKILL を行い、
  上の 4 の条件で確定する〈SIGKILL の後の消滅は確かめない〉）」
- 5: 「`stdoutTail` / `stderrTail` は stdout / stderr が閉じる（`close`）までに取得した出力の末尾（中断の後、後始末の猶予の間に取得できた出力を含む。runner は `close` の後、
  プロセスグループの消滅、または SIGKILL の送信で結果を確定し、SIGKILL の送信で確定するときはグループの消滅を待たない。v0.5.6・v0.5.7 で実装に合わせて文言を直した）」

## v0.5.6 の SP2 で観測した r4 の B の 23 秒（失敗ではない）

- 起きたこと: v0.5.6 の確かめ (b)（起動の嵐 16 の下で 1 ファイルずつ 393 回）のうち 1 回、`tests/regression-r4-report.test.ts` のシナリオ B が 23,009 ms かかった
  （ほかの回は 3.0〜3.04 秒）。PASS。起動の嵐の立ち上がりの時期（負荷平均 10.64 → 45.21）
- 推定（未確認）: テストが子を SIGKILL した後、runner が `close` を処理した時点で `kill(-pgid, 0)` がグループをまだ「ある」と判定し（回収の前）、確定が猶予の終わり
  （タイムアウト 3,000 ms + 猶予 20,000 ms）の SIGKILL のタイマーまで延びた。`tryFinish()` は `close` の後にグループが残っていると、消滅を確かめ直さずに
  SIGKILL のタイマーを待つ（今の設計どおりの動き）
- 人間の判断（v0.5.6 の SP2 の承認）: このままにする（記録だけ）。テストの上限 30 秒に対して余裕は約 7 秒
- 関連: バックログ 18（v0.5.6 の番号で 17。SIGKILL の経路のグループの消滅の確認）。`close` の後にグループが残っているとき、消滅を確かめ直さずに
  SIGKILL のタイマーまで待つ動きは、同じ項目で扱う

## 対応

- M2-2-R5-001: **Medium のままバックログの先頭（1）へ（v0.5.7 では修正しない）**。重大度はレビュアーの判定のまま
  1. テストの失敗の経路でも、実行中の `executeCommand()` を `try/finally` で止める（未中断なら abort し、確定を上限つきで待つ）。失敗の後は runner の後始末も働かない
     （上の実測）ので、後始末はテストの中で終える
  2. シナリオ A の準備の待ちを、前提の文言（「precondition: …」）つきの待ちにする
  3. 上の同じ種類の表の箇所も扱う（`regression-r2-cli-signal.test.ts` の準備の待ち、`regression-r3-cli.test.ts` の CLI の子プロセス、r4 のシナリオ B の前提の失敗の後の SIGKILL）
  4. 止めた後の pid に後追いで signal を送らない（PID の再利用）
  - 先頭に置く理由: 直前の作業（テストの不安定）の続きで、変更が `tests/` だけに収まる見込みのため
- M2-2-R5-002: Low。ARCHITECTURE の runner の節の 3 か所（上の表の 3・4・5）を実装の確定の条件に合わせて直した。コードは変えていない。§10 の表（表の 7）と
  コードのコメント（表の 10）は、既存のバックログ 18 で扱う
- バックログの番号: M2-2-R5-001 を先頭に足し、既存の項目は 1 つずつ下がった（v0.5.6 の 1〜19 → 2〜20）。ADR-0017・ARCHITECTURE・ROADMAP の M2-2 の節の参照は
  v0.5.7 の番号に直した。CHANGELOG の過去の版の項と `docs/reviews/` は当時の番号のまま

## テストの不安定と M2-2-FLAKE-001 の作業の区切り

v0.5.5 のリリースの検証で見つかった unit-minpath の不安定なテストから始まった作業を v0.5.7 で区切る。

| 版 | 内容 | 独立レビュー | 指摘（High / Medium / Low） |
|---|---|---|---|
| v0.5.5 | リリースの検証で見つかった不安定なテストをバックログの先頭へ（docs だけ） | — | — |
| v0.5.6 | 不安定の原因を確定し、テストを事象の観測の順に直した。調査で見つけた runner の M2-2-FLAKE-001 を修正 | m2-2-r5（v0.5.5..v0.5.6） | 0 / 1 / 1 |
| v0.5.7 | docs だけ（R5 の記録、R5-002 の文言、バックログ） | — | — |

- テスト件数: 618（v0.5.5）→ 619（v0.5.6、99 ファイル）→ 619（v0.5.7、docs だけ）
- 残り（M2-2-R5-001、M2-2-R4-001・002、kill の EPERM の経路など）は ROADMAP のバックログの順に扱う

## 教訓

- **テストの後始末を、テストを動かす仕組みの寿命に任せない**: vitest はテストファイルが終わるとワーカーを止めるので、ワーカーの中の runner のタイマーは、失敗の後に
  働かないことがある。実行中の処理は、失敗の経路でもテストの中で止め、確定を上限つきで待つ
- **「〜まで残りうる」という指摘は、テストを動かす仕組みまで含めて実測する**: 「runner のタイムアウトまで」は、実際には「子の寿命まで」だった
- **確定の条件を docs に書くときは、何を待つかと、何を待たないかを両方書く**: 「プロセスグループが終わるまで」は、SIGKILL の送信で確定する経路を落としていた

## M2-2-R5-001 の対応（v0.5.8、2026-09-26。`tests/` だけ）

SP1（洗い出し・再現・vitest の動きの確認・設計）の後、人間の承認を得て実装した。作業の記録は `tmp/m2-2/r5-001/`（git 管理外）。

### vitest の動きと、後始末の置き場所

- vitest 5.0.0 は、テストの本体が失敗したときは `finally`（await を含めて最後まで）→ `afterEach` → `onTestFinished` → `onTestFailed` の順に実行する
- テストのタイムアウトでは本体を止めずに `afterEach` へ進み、ファイルが終わるとワーカーを止める（stop → SIGTERM → 500 ms で SIGKILL。`teardownTimeout` はログを出すだけ）。
  写しの合成テストで、タイムアウトしたテストの `finally` は、ファイルの最後のテストでは実行されず、途中のテストでは次のテストの実行中に遅れて実行された
- そのため、v0.5.7 の案（`try/finally`）ではなく、後始末を `afterEach` に置いた（タイムアウトの直後にも実行され、完了を待たれる。上限は `hookTimeout` 30 秒）

### 修正の中身

- `tests/helpers.ts`: `runCleanups`（後から積んだものから順に await し、1 つが投げても残りをすべて実行して最初のエラーを投げる）、`stopper`（確定済みなら何もしない。
  未確定なら止めて、確定を上限まで待ち、超えたら失敗）、`waitReady`（「precondition: …」の待ち。r4-report と M2-2-FLAKE-001 の回帰テストにあった同じ定義を 1 つにした）、
  `SETTLE_MARGIN_MS`（5 秒）。上限は止める相手の猶予 ＋ 5 秒（r4 A 5.2 秒、M2-2-FLAKE-001 9 秒、r2-cli-signal 10 秒、r4 B 25 秒、r3-cli の CLI 13 秒）
- 止めるのは runner の AbortController か ChildProcess の handle だけ。ファイルから読んだ pid には signal を送らない（r3-cli の `killIfAlive` と、r4 の B の後始末の SIGKILL を
  やめた。r4 の B でテスト自身が子を SIGKILL する 1 か所は、子が生きていると言える時点〈SIGTERM を無視、実行は未確定、runner の SIGKILL は 20 秒先〉なので残した）
- 各テストは起動の直後に後始末を登録する。`afterEach` は `runCleanups` を await するので、子を止めてから一時ディレクトリを消す
- 準備の待ちの失敗を「precondition: …」の文言にした（r4 の A、r2-cli-signal の孫の準備、r3-cli の check 1 の開始と pid、r4 の B の SIGTERM の印）
- r2-cli-signal: 後始末のためだけの AbortController を足した（テスト対象の `terminateActiveChildren()` は後始末に使わない。PASS の回では abort しない）
- r3-cli の CLI の止め方（人間の判断）: CLI は、CLI 自身の SIGTERM の処理（テスト対象の経路）で止める。r2-cli-signal で「テスト対象に頼らない」とした判断とは逆向きだが、
  壊れていれば SIGKILL と後始末のエラーで失敗として見える（そのとき check は自分の寿命、最長 10 秒まで残りうる）ので了承した
- 製品の動きの期待値（assert の値）は変えていない。新しい単体テスト `tests/regression-m2-2-r5-001-test-cleanup.test.ts`（M2-2-R5-001、5 件）は、変更前の `tests/helpers.ts`
  （v0.5.7）では 5 件とも FAIL（関数が無い）

### SP1 の洗い出しで見つけた、v0.5.7 の表に無かった事実

- r3-cli の `afterEach` は、PASS した回でも、消えた後の check 1 の pid に SIGKILL を送っていた（記録で毎回 ESRCH。PID の再利用の危険）
- r3-cli が失敗すると、孤立した CLI が check を最後まで実行し、`afterEach` が消した一時ディレクトリを作り直してレポートを書き、`$TMPDIR/aiqh-r3-cli-*` が期限なく残った
  （プロセスではなくファイル。mkdtemp の名前なので後続のテストには影響しない。人間の判断で R5-001 の記録に含めた）
- r2-cli-signal の準備の待ちの失敗も、r4 の A と同じ形だった（文言が precondition でなく、孫が自分の寿命まで残る）

### 修正の前後の実測（写しで準備を遅らせる・テスト側で待つ。本体のテストに仕掛けは入れていない）

時間はテストの失敗から、子・孫・CLI が消えるまで。修正の後は、すべてそのテストの `afterEach` の中で消え、vitest の終了後の残りは 0、一時ディレクトリの残りは 0、
消えた pid への signal は 0、監視の SIGKILL は 0 だった。

| ケース | 修正の前（v0.5.7） | 修正の後（v0.5.8 の commit 1） |
|---|---|---|
| r4 の A、準備を 12 秒遅らせる | 文言が precondition でない。約 2.0 秒 | 「precondition: the child was not ready within 10000 ms …」。止めて 3 ms で確定 |
| r4 の A、25 秒 | 約 15.0 秒、vitest の終了後 約 12.0 秒 | 同じ文言。22 ms で確定 |
| r4 の A、テストのタイムアウト（abort の前にテスト側で 16 秒待つ） | —（`finally` では止まらない） | `Test timed out in 15000ms.`。`afterEach` で 205 ms で確定。後続の B は PASS |
| M2-2-FLAKE-001、準備を 2,650 ms 遅らせる | 約 30.0 秒、vitest の終了後 約 30.0 秒 | 同じ文言（precondition）。4,006 ms で確定（猶予 4 秒） |
| r2-cli-signal、孫の準備を 12 秒遅らせる | 文言が precondition でない。約 4.0 秒、vitest の終了後 約 4.0 秒 | 「precondition: the grandchild was not ready within 8000 ms …」。3 ms で確定 |
| r3-cli、check 1 の開始の印を 12 秒遅らせる | 文言は `expected false to be true` だけ。約 4.2 秒、vitest の終了後 約 2.4 秒。一時ディレクトリが作り直されて残った | 「precondition: check 1 did not start within 8000 ms …」。CLI は 57 ms で exit。残り 0 |
| r3-cli、pid の書き込みを 12 秒遅らせる | 約 4.0 秒、vitest の終了後 約 2.1 秒。`afterEach` も `refusing to signal pid 0` を投げた。一時ディレクトリが残った | 「precondition: check 1 did not write its pid within 8000 ms …」。CLI は 60 ms で exit。残り 0 |
| r4 の B、settled を確かめる前にテスト側で 21 秒待つ | 子は runner の SIGKILL で消えていたが、`afterEach` がその約 1.0 秒後に同じ pid へ SIGKILL を送った（ESRCH） | 同じ文言（precondition）。確定済みなので何も送らない |
| r4 の B、準備の直後に人為的に失敗させる（後始末の待ちが最も長い経路） | — | 20,005 ms で確定（上限 25,000 ms）。`afterEach` は約 20.0 秒で、`hookTimeout` 30 秒に収まる |

- 同じ写しで遅れ 0 の実行は、直した 4 ファイルと新しい単体テストの 12 件すべて PASS（後始末は「確定済みで何もしない」）
- 低の項目（孫までタイムアウトで止めるテストで製品が孫を止め損なったとき、CLI をすぐ await するテストで CLI が終わらないとき、signal 0 の probe の誤判定）は
  v0.5.8 では変えず、ROADMAP のバックログ 20 にまとめた

### 教訓（v0.5.8）

- **テストのタイムアウトは本体を止めない**: vitest はタイムアウトで外側の Promise を失敗にするだけで、テストの中の `finally` は後で遅れて、ファイルの最後では
  実行されない。後始末は、タイムアウトの後にも待たれる `afterEach` に置く
- **PASS の回の後始末も記録で確かめる**: r3-cli の `afterEach` は、失敗の経路だけでなく毎回、消えた後の pid に SIGKILL を送っていた
- **止める相手が消した場所を作り直すことがある**: 孤立した CLI は、消された一時ディレクトリを作り直してレポートを書いた。子を止めてから、場所を消す
