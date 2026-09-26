<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r5-for-claude.md、ChatGPT、2026-09-26 受領、15,680 バイト、対象範囲 v0.5.5..v0.5.6）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 776fb34ccd96c368f49b320693e00e113cce87310ebee7677ec55a067ee51211
-->

# independent review — M2-2 R5

## 1. 総評

v0.5.5..v0.5.6 の変更について、Request の「特に見てほしい点」1〜7、`src/runner/execute.ts`、新規回帰テスト、変更された 4 つの timing test、`docs/ARCHITECTURE.md` を独立に確認した。

runner 本体の修正は、`onAbort()` で未発火の timeout timer を取り消すだけの最小変更であり、`timedOut` を「中断前に runner が timeout を処理したか」とする定義に整合している。timeout callback が先なら `timedOut=true` のまま、abort callback が先なら timeout は取り消される。spawn 前に既に abort 済みの場合と、spawn〜listener 登録の間に abort された場合の両経路も fail-safe になっている。

新規指摘は **High 0件 / Medium 1件 / Low 1件**。Medium は、負荷時の前提崩れを検出するために直した test 自身の一部 failure path で、pending child / process group を確実に止めず、かつ 1 箇所は `precondition:` で識別できない点。Low は、`stdoutTail` / `stderrTail` の docs が「process group が終わるまで」と書く一方、実装は `SIGKILL` 送信後なら group がまだ存在しても `close` 済みで settle できるという狭い文言差である。

レビュー用パケットは完全な repository checkout ではないため、フルテストスイートは再実行していない。以下で「未実行」と記載した再現はコード読解による。

---

## 2. 前回指摘の解消状況

**対象なし。**

M2-2-R4-001 / M2-2-R4-002 は Request でバックログ扱い・今回範囲外と明記されているため、今回の判定対象にはしていない。

---

## 3. 新しい指摘

### ID: M2-2-R5-001

- **重大度:** Medium
- **対象:**
  - `tests/regression-r4-report.test.ts:40-67`
  - `tests/regression-m2-2-flake-001-timeout-after-abort.test.ts:58-62`

### 内容

負荷で timing precondition が崩れたとき、一部の test が **pending `executeCommand()` を必ず停止する cleanup を持たない**。また `regression-r4-report` の scenario A は readiness 待ちの 10 秒制限が残っているのに、その失敗が `precondition: ...` として識別されない。

今回の変更目的は「負荷依存を、観測可能な marker と明示的な precondition failure に置き換える」ことだが、この 2 箇所では前提崩れ時に test が先に失敗し、child / process group が runner の timeout / grace まで残り得る。

### 根拠

`regression-r4-report` の scenario A は、20 秒 timeout の run を開始した後に readiness を 10 秒だけ待つ。

```ts
const pending = executeCommand({
  command,
  cwd: t.dir,
  timeoutMs: 20_000,
  killGraceMs: 200,
  maxOutputBytes: 4096,
  signal: controller.signal,
});
await waitForPid(ready, 10_000);
controller.abort("SIGINT");
const exec = await pending;
```

ここで `waitForPid()` が 10 秒で失敗すると `controller.abort()` に到達しない。`afterEach` に登録されているのは temp directory cleanup だけであり、この scenario には child PID cleanup もない。

したがって、child がまだ生きている場合、test 本体は失敗しても `executeCommand()` の 20 秒 timeout（+ 200 ms grace）まで process group が残り得る。またこの `waitForPid()` は `waitReady()` の wrapper を通していないため、失敗メッセージも `precondition: ...` にならない。

新規 M2-2-FLAKE-001 regression にも、より短いが同じ failure-path cleanup の穴がある。

```ts
await waitReady(ready);
const abortAt = performance.now() - started;
expect(
  abortAt,
  "precondition: the abort is sent well before the timeout",
).toBeLessThan(READY_MARGIN_MS - 500);
controller.abort("SIGINT");
```

child が ready になった時点が 2500〜3000 ms の間なら、`waitReady()` 自体は成功するが precondition assert が失敗し、`controller.abort()` に到達しない。child はその後 timeout 3 秒 + grace 4 秒の runner cleanup に任される。

どちらも最終的には runner 自身が kill する設計なので恒久的 orphan を作るとは限らないが、**負荷時に失敗した test が後続 test と数秒〜十数秒重なり、さらに flake / suite delay を誘発できる**。今回の修正テーマそのものに反する。

### 再現条件

**未実行（コード読解による）。**

ケース A:

1. `regression-r4-report` scenario A の child の ready marker が 10 秒以内に現れない。
2. ただし child / shell process group 自体はまだ動いている。
3. `waitForPid(ready, 10_000)` が reject。
4. test は即失敗し、`controller.abort()` は未実行。
5. `afterEach` は temp dir cleanup のみ。
6. runner の 20 秒 timeout まで child group が残り得る。

期待:
- timing assumption の崩れは `precondition: ...` で FAIL。
- FAIL 経路でも pending run を `abort()` / `SIGKILL` 等で確実に収束させてから test を終了。

実際:
- generic `waitForPid` failure になり得る。
- child group の cleanup は runner の後続 timeout に任される。

ケース B:

1. M2-2-FLAKE-001 test で ready marker が spawn 後 2500〜3000 ms の間に現れる。
2. `waitReady()` は成功。
3. `abortAt < 2500` の precondition assertion が FAIL。
4. `controller.abort()` は実行されない。
5. pending run は timeout / grace まで残る。

### 修正案

test の pending runner lifecycle を `try/finally` で囲み、precondition assert がどこで失敗しても cleanup する。

例えば方針として:

- `AbortController` を作った test は `finally` で未 abort なら abort。
- 必要なら pending promise を bounded に await し、process group cleanup 完了を待つ。
- scenario A の readiness wait も `waitReady()` 相当の helper を使い、timeout failure を `precondition: ...` として明示する。
- cleanup 自体が PID の再利用に対して安全であることを維持する（既存 scenario B のように、無条件の後追い `kill(pid)` は避ける）。

### 回帰テスト案

test helper / synthetic fixture で readiness を意図的に遅らせ、

1. scenario A の readiness limit を超えさせる。
2. test が `precondition:` を含む失敗になることを確認する。
3. failure 後、対象 process group が残っていないことを確認する。

M2-2-FLAKE-001 では ready を「2500 ms より後、3000 ms より前」に意図的に出す fixture を作り、

1. `abortAt` precondition が FAIL。
2. それでも cleanup が実行される。
3. child / grandchild が残らない。

ことを確認する。

---

### ID: M2-2-R5-002

- **重大度:** Low
- **対象:**
  - `src/runner/execute.ts:126-143`
  - `docs/ARCHITECTURE.md:429-436`

### 内容

`ARCHITECTURE.md` の `stdoutTail` / `stderrTail` の説明は「プロセスグループが終わるまでに取得した出力」と読めるが、実装上の settle 条件は厳密には **「group が消滅した、または SIGKILL を送信済み」** である。

通常は SIGKILL 後すぐ group が消えるため実害はほぼないが、docs の文言は runner が group disappearance を必ず待つように読める。

### 根拠

`tryFinish()` は次の条件。

```ts
if (closeResult === null) return;
if ((timedOut || interruptedBy !== null) && !sigkillSent && groupAlive(pgid)) return;
finish({ ...closeResult, timedOut, spawnError: null });
```

SIGKILL timer は、

```ts
killTree(child, pgid, "SIGKILL");
sigkillSent = true;
tryFinish();
```

なので、`closeResult` が既にあり `sigkillSent=true` なら、`groupAlive(pgid)` が true でも finish できる。

一方 docs は、

```text
stdoutTail / stderrTail はプロセスグループが終わるまでに取得した出力の末尾
```

と記載している。

同じ docs の cleanup lifecycle では「SIGKILL 送信済み **または** group 消滅」が settle 条件と説明しており、こちらはコードと一致している。したがって output-tail の一文だけが少し強い。

### 再現条件

**未実行（コード読解による）。**

1. leader / stdio は close 済み。
2. timeout / interruption cleanup で SIGKILL を送信。
3. `kill(-pgid, 0)` は直後にはまだ group alive を返す。
4. `sigkillSent=true` のため runner は settle 可能。

期待される docs:
- 「close までに捕捉できた出力。cleanup grace 中の出力を含む」
- または「group 消滅または SIGKILL 送信による settle まで」

現在の docs:
- 「process group が終わるまで」と読める。

### 修正案

コードを変える必要はない。`ARCHITECTURE.md` の output-tail 文言だけを、実装の settle 条件に合わせて狭める。

例えば「中断後の cleanup grace 中に stdout/stderr pipe から取得できた出力を含む。runner は group 消滅または SIGKILL 送信済みの条件で settle する」とする。

### 回帰テスト案

docs-only のため必須ではない。もし contract test を置くなら、runner の settle 条件について `sigkillSent` 後に group probe 完了を必須としていないことをコード側の既存 test / static assertion と対応付ける。

---

## 4. Request「特に見てほしい点」1〜7 の確認結果

### 1. runner の修正

**基本的に問題なし。**

`onAbort()` の最初の abort で `interruptedBy` を固定し、未発火の `timeoutTimer` を `clearTimeout()` してから既存の `escalate()` を使う構造は、要求された定義に合う。

- timeout callback が先に処理された場合: 先に `timedOut=true`、`escalate()`。その後 abort が来ても true のまま。
- abort callback が先に処理された場合: timeout timer を cancel して `timedOut=false` のまま。
- JS callback 内に await / 非同期境界がないため、`timedOut=true` と `escalate()` の間へ abort callback が割り込む経路はない。
- spawn 前に signal が既に aborted なら `notStarted(..., timedOut:false)` で spawn しない。
- pre-check 後〜listener 登録までに aborted になった場合も、listener 登録直後の `if (options.signal?.aborted) onAbort()` が拾う。
- SIGKILL timer は timeout / abort 共通の `escalate()` で 1 本だけ作られ、abort が timeout 後に来ても二重 escalation しない。
- settle 条件も今回の変更で悪化していない。

今回の 3 行の runner 修正から、新しい High / Medium の product bug は見つけなかった。

### 2. 中断後の猶予中に変わる他の result 項目

確認した。

- `interruptedBy`: 最初の abort で固定。後続 abort では変わらない。
- `stdout` / `stderr` と truncation: `close` まで data listener が取り込み、cleanup grace 中の出力も含む。docs の意図と概ね一致。
- `exitCode` / `signal`: raw execution fact として `closeResult` に保持される。中断された check の report 変換は既存 `toCheckResult()` 側の責務で、今回の変更はそこを触っていない。
- `durationMs`: `finish()` 時点までを測り、cleanup duration を含む。今回の timeout cancel によって不自然に書き換わる項目ではない。
- `spawnError`: abort cleanup 中に今回新たに変化させる処理はない。kill EPERM の既知経路は Request で範囲外。

`timedOut` 以外に、今回と同種の「abort 後の猶予中に本来固定すべき値が timer により後から変わる」新規問題は見つけなかった。

### 3. M2-2-FLAKE-001 回帰テスト

主要な成功経路は要件を検証できている。

- ready marker の後に abort。
- `abortAt < timeout - 500 ms` で abort-first を限定。
- `durationMs >= timeoutMs` で、旧実装なら timeout callback が発火する時間窓まで run が続いたことを限定。
- grace は timeout より長いため、修正前コードなら timeout が cleanup 中に発火して `timedOut=true` になる。
- 修正後は false。
- `toCheckResult()` の `status`, `timedOut`, `errorSummary` まで確認。

したがって「旧コードで FAIL / 新コードで PASS」にする構造は妥当。

ただし precondition failure 時の cleanup に M2-2-R5-001 がある。

### 4. 直した 4 ファイルの test

`execute.test.ts`、`regression-r1-runner.test.ts`、`regression-r2-runner.test.ts` は timeout を 3 秒へ広げ、grandchild の自然終了を 30 秒へ延ばしたため、`elapsed < 10s` でも「runner の escalation で終了した」ことと自然終了を区別できる。

したがって 4000 ms → 10000 ms の緩和だけで本来の regression purpose が失われたとは判断しない。

`regression-r4-report` scenario B は、timeout の SIGTERM を `term.pid` で観測してから abort するため、「timeout first」を時刻の推測でなく事実として確認するようになっている。これは改善。

scenario A も ready marker 後に abort する方向は改善だが、10 秒 readiness failure の扱いと cleanup に M2-2-R5-001 が残る。

### 5. test の後始末

通常 PASS path については、runner が process group cleanup を行い、scenario B の手動 SIGKILL では PID 再利用を避けるため `childPid = null` にして後追い cleanup で再 signal しない設計を確認した。

R1 / R2 / execute の終了後 probe は `process.kill(pid, 0)` だけで、再利用 PID を誤って kill する処理ではない。

一方、precondition failure path では pending runner を必ず収束させない箇所がある。

→ **M2-2-R5-001**

### 6. docs とコード

ほぼ一致している。

- timeout / abort がほぼ同時: JS event loop で先に処理した方。
- abort-first: pending timeout を cancel。
- timeout-first: `timedOut=true` を保持。
- exit と close の間に abort: `close` 前なので interrupted run として扱う設計。
- cleanup grace 中の出力も capture 対象。

ただし output tail を「process group が終わるまで」とする一文は、`sigkillSent` だけでも settle できるコードより少し強い。

→ **M2-2-R5-002**

### 7. test が要件を検証できているか

Verification の PASS だけには依存せず test source を確認した。

M2-2-FLAKE-001 の core regression は、旧実装の failure mechanism を直接作っているため有効。scenario B の marker 化も timeout-first を直接観測しており有効。

一方で、負荷による precondition failure を明示的に扱うという今回の test policy は、すべての failure path で徹底されてはいない。

→ **M2-2-R5-001**

---

## 確認範囲

主に以下を確認した。

- `src/runner/execute.ts`
- `tests/execute.test.ts`
- `tests/regression-m2-2-flake-001-timeout-after-abort.test.ts`
- `tests/regression-r1-runner.test.ts`
- `tests/regression-r2-runner.test.ts`
- `tests/regression-r4-report.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `package.json`
- packet 内の変更 diff / full source / Verification

Previous Reviews、commit message、CHANGELOG、ROADMAP、ADR の結論は正しさの根拠にはせず、確認箇所の索引としてのみ扱った。

Request で既知の範囲外とされた M2-2-R4-001 / R4-002、kill EPERM、`regression-r2-cli-signal`、時計 / timer injection、Windows、過去記録等は新規指摘対象から除外した。
