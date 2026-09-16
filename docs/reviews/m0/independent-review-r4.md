## R4-001

- **ID:** R4-001
- **重要度:** High
- **種別:** バグ
- **対象:** `src/cli.ts` — SIGINT/SIGTERM handler、`src/commands/verify.ts` — finalization
- **内容:** 最後のcheck終了後から正常終了までの同期処理中にSIGINT/SIGTERMが届くと、中断を認識しないまま `VERIFY PASSED` / exit 0 で終了できるraceが残っている。
- **根拠:** `runVerify()` は `await runChecks()` が終了した直後に一度だけ `options.signal.aborted` を読んで `interruptedBy` を決定し、その後はreport生成・書込み・最終ログ・returnまでawaitがない。したがって、その同期区間中にOS signalが届いてもNodeのsignal callbackはすぐ実行できず、正常reportを確定できる。
  
  CLI handler側も、signalを処理した時点で `process.exitCode` を130/143へ設定していない。行っているのはAbortControllerのabort、cleanup開始、`unref()`された安全弁timerの登録だけである。
  
  独立確認として、同じ構造の最小Nodeプログラムで「最後のawait後の同期処理中にSIGINTを送る」ケースを再現したところ、signal handlerがprocess終了前に処理されず、**exit 0のまま終了**した。`setImmediate`等でevent loopへ一度制御を戻すとSIGINTを認識してexit 130にできることも確認した。
  
  R3 regression testはcheck 1が10秒sleepしている最中にsignalを送るため、この「検証終了直前」の窓はテストしていない。
- **修正案:** 「検証完了を確定するcommit point」を明示する。
  1. 最終PASSED/FAILED確定前に少なくとも1回event loopへyieldし、pending signalを処理する。
  2. signal handlerではbackupとして `process.exitCode = 130 / 143` を即設定する。
  3. verification完了後はsignal handlerを解除する、または`finalized`状態を持たせる。
  4. report書込みの同期区間中にsignalが届いた場合にも、最終的にERROR reportへ更新するか、「report確定以降はrun完了」とする境界を明文化する。
  
  回帰テストとして、正常check終了後のfinalization中にSIGINT/SIGTERMを送り、exit 0 / `VERIFY PASSED`にならないことを確認する。

---

## R4-002

- **ID:** R4-002
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/runner/run-checks.ts` — `toCheckResult()`
- **内容:** 中断されたcheckでは、実行結果に記録されている `outputTruncated` と `timedOut` が失われ、reportに誤った情報が残る。
- **根拠:** `exec.interruptedBy !== null` のbranchでは、まず `skippedResult()` を生成している。この初期値は `timedOut: false`、`outputTruncated: false`。その後上書きしているのは `startedAt`、`durationMs`、`signal`、stdout/stderr tailだけで、`exec.timedOut`、`exec.stdoutTruncated`、`exec.stderrTruncated`、tail側のtruncate状態を反映していない。
  
  そのため、例えば大量出力したcheckへSIGINTを送れば、実際にはoutput bufferが切り詰められていてもreportは `outputTruncated: false` となる。またtimeout開始後にsignal interruptionが重なると、`ExecutionResult.timedOut=true`でもCheckResultではfalseになる。
- **修正案:** interrupted branchでも通常branchと同じようにtail情報を一度計算し、
  `timedOut: exec.timedOut`
  と
  `outputTruncated: exec.stdoutTruncated || exec.stderrTruncated || stdoutTail.truncated || stderrTail.truncated`
  を保持する。
  
  回帰テストとして、
  - 出力上限を超えたcheckを中断 → `outputTruncated === true`
  - timeout発生後にabortが重なる → raw factとして `timedOut === true`
  
  を追加する。

---

## R4-003

- **ID:** R4-003
- **重要度:** Low
- **種別:** バグ
- **対象:** `src/runner/run-checks.ts` — `runChecks()` / `src/commands/verify.ts`
- **内容:** signal受信後にprocess自体は起動しないが、`onCheckStart` がabort判定より先に呼ばれるため、CLI上では後続checkが「開始された」ように表示される。
- **根拠:** loop先頭でまず `options.onCheckStart?.(...)` を呼び、その後で `options.signal?.aborted` を確認してSKIPPEDにしている。
  
  `runVerify()` の `onCheckStart` は `[n/total] check-name` と実コマンド `$ ...` を出力するため、実際にはspawnしていないcheckでも、中断後に開始ログとcommandが表示される。
  
  R3テストはcheck 2のmarker fileが存在しないことを確認しているため「processは起動していない」ことは証明しているが、console表示の整合性までは確認していない。
- **修正案:** abort判定を `onCheckStart` より先へ移す。SKIPPEDも進捗表示したいなら、`onCheckSkip`を分けるか、`onCheckFinish`だけで `SKIP` を表示する。
  
  signal後の出力に後続checkの `$ command` が含まれないことをテストする。

---

# R3-001〜R3-003 の判定

### R3-001 — 解消

`[REDACTED:` で始まるだけの値は例外扱いせず、値全体が既知のcanonical markerと完全一致するときだけ再マスクを回避する変更になっている。suffix付き・fake category等も回帰テストされているため、前回の具体的bypassは解消した。

なお、「実際のpasswordそのものが `[REDACTED:github]` 等と完全一致する」場合は文字列上区別不能だが、今回は明示的に採用されたcanonical-marker仕様なので、新規指摘にはしていない。

### R3-002 — 前回raceは解消、ただしR4-001/R4-002/R4-003あり

AbortSignalを `CLI → runVerify → runChecks → executeCommand` へ渡し、spawn直前・直後にもabortを確認する構造は妥当。前回問題にした「cleanup開始後にcheck 2がspawnされる」経路は塞がれている。

実CLIへSIGINT/SIGTERMを送り、check 2未起動・子孫消滅・ERROR report・130/143まで確認するテストも、前回より大幅に強い。

ただし「全check終了後〜finalization」のsignal raceがR4-001として残るため、R3-002全体を完全closeとはしない。

### R3-003 — 解消

installed `package.json` の `bin.aiqh === "dist/cli.js"` を明示的に確認し、POSIXでは `.bin/aiqh` のsymlinkを `readlinkSync` → realpath比較している。

実package smoke側からこの検査を呼び、さらにshebang、runtime dependency、version、consumerからの `npx --no-install aiqh verify` も維持している。

前回のR3-003は十分に解消している。

---

# 指摘なしと判断した観点

- R3-001のsuffix付き `[REDACTED:...]` bypass対策
- canonical category集合を`RULES`から導出する設計
- R3-002のAbortSignalによる新規spawn防止
- spawn前後のabort race対策
- 実行中process groupのTERM→KILL escalation
- SIGINT=130 / SIGTERM=143
- 中断時reportの `verdict: ERROR`
- `interruptedBy` のreport記録
- 後続checkをSKIPPEDとしてreportに残す方針
- R3-003の`bin.aiqh` exact assertion
- POSIX `.bin/aiqh` symlink target検証
- tarballの`dist/cli.js`
- shebang
- runtime dependencies
- installed package version
- consumerからの実`npx aiqh verify`

packet上ではR1/R2を含む133テスト、source/built両方のself verifyがPASSしたと記録されており、今回掲載された変更との矛盾は見当たらない。これは実装側の実行記録であり、今回こちらで133件を再実行したという意味ではない。

# 見ていない範囲

今回のZIPにはrepository一式ではなく `review-packet-m0-r3.md` が入っており、packetに全文掲載された変更コードをレビューした。

独立実行していないもの:

- GitHub上のcommit `24ed514` とpacketのbyte-level一致
- 133件のVitest suiteそのもの
- `npm run verify` / `verify:dist`
- 実tarballの中身
- npm audit
- push / tag実在
- Linux / Windows
- safety valveのEPERM / SIGKILL不能ケース
- maskerとpre-push guardの一致（R-012 / M1）
- R3で変更されていないrepository全体

R4-001については、**同じsignal-handler構造を持つ最小Nodeプログラムで、最後のawait後の同期処理中にSIGINTを送るとexit 0で終了できることを独立再現**した。

# 結論

**M0完了前にR4-001は修正を推奨します。**

R4-002もreportの監査精度に関わるため一緒に直す価値があります。R4-003は軽微ですが修正は小さいです。

R3までで主要なマスク・process-group・symlink・package配布問題はかなり堅くなっています。今回の中心は、機能そのものではなく「終了直前のsignal race」と「中断時reportの事実精度」です。