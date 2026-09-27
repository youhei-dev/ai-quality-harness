<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r6-for-claude (1).md、ChatGPT、2026-09-27 受領、15,386 バイト、対象範囲 v0.5.7..v0.5.8）をそのまま収録した。
最初の依頼ではパケットが添付されず、レビュー未実施の出力が返ったため、新しいチャットで依頼し直した。収録したのは依頼し直した回の出力。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: d88ec280684508673bef9ed2f7f2520f8f61ebafdbaff646c6b6372f176a71df
-->

# independent review — M2-2 R6

## 1. 総評

v0.5.7..v0.5.8 の変更について、Request の「特に見てほしい点」1〜7、変更されたテストコード、`tests/helpers.ts`、新規回帰テスト、`docs/ARCHITECTURE.md` の差分を独立に確認した。

前回指摘 **M2-2-R5-001 は「解消」**と判断する。修正対象の各テストでは、プロセス等を開始した直後・最初の `await` より前に `stopper` を登録し、temp directory の cleanup より後に登録することで `runCleanups()` の LIFO 順序で「実行中のものを止めて確定を待つ → directory を消す」が成立している。タイムアウトや precondition failure でも `afterEach` が同じ cleanup を通る。

`stopper` / `runCleanups` / `waitReady` の実装についても、今回要求された「未確定なら止める」「上限を超えたら失敗」「確定済みなら signal を送らない」「後から積んだ cleanup から順に全件実行」「準備失敗を `precondition:` とする」を満たしている。修正対象の通常成功経路の assert も弱められていない。

**新しい指摘は High 0件 / Medium 0件 / Low 0件。**

レビュー用パケットは完全な repository checkout ではないため、フルテストスイート自体は独立再実行していない。Verification の PASS は結論の根拠には用いず、パケットに収録された実コード・diff・テストを読んで判断した。

---

## 2. 前回指摘の解消状況

### M2-2-R5-001 — 解消

**主な対象**
- `tests/helpers.ts:93-161`
- `tests/regression-m2-2-flake-001-timeout-after-abort.test.ts:21-54`
- `tests/regression-r2-cli-signal.test.ts:12-40`
- `tests/regression-r3-cli.test.ts:22-25, 51-53, 85-115`
- `tests/regression-r4-report.test.ts:19-22, 32-59, 66-106`
- `tests/regression-m2-2-r5-001-test-cleanup.test.ts:18-101`

### 根拠

前回問題だったのは、precondition failure や test timeout が起きた場合、test 本体で後続する abort / kill に到達せず、開始済みの runner / CLI が残り得ることだった。

今回、各 runner test は共通して次の構造になっている。

```ts
const pending = executeCommand(...);
cleanups.push(
  stopper(
    pending,
    () => controller.abort("clean-up"),
    ...,
    "the run",
  ),
);
await waitReady(...);
```

つまり `executeCommand()` の開始後、**最初の readiness wait / assertion より前**に stopper が登録されている。

また temp directory cleanup は先に登録され、

```ts
cleanups.push(t.cleanup);
...
cleanups.push(stopper(...));
```

`runCleanups()` は配列末尾から実行する。

```ts
while (cleanups.length > 0) {
  try {
    await cleanups.pop()?.();
  } catch (err) {
    errors.push(err);
  }
}
```

したがって failure / timeout の afterEach では、

1. stopper で runner / CLI を停止して確定を待つ
2. その後に temp directory を削除する

という順になる。

#### M2-2-FLAKE-001

`tests/regression-m2-2-flake-001-timeout-after-abort.test.ts:41-54` では `executeCommand()` の直後に stopper を登録し、その後に `waitReady()` と abort timing の precondition がある。

前回指摘した「ready が遅い」「abort timing assertion が落ちる」場合でも、afterEach の stopper が AbortController を通して run を終了させる。

#### regression-r4-report scenario A

`tests/regression-r4-report.test.ts:40-52` も同様に、10秒の readiness wait より前に stopper を登録した。前回の「readiness failure で pending run が残る」経路は閉じている。

さらに readiness failure は `waitReady()` に統一され、`precondition: ...` になる。

#### regression-r4-report scenario B

`tests/regression-r4-report.test.ts:77-99` では 20秒 grace の run に対し stopper を先に登録し、上限を `20秒 + SETTLE_MARGIN_MS(5秒)` としている。

ready marker、timeout の SIGTERM marker、`settled === false` の precondition のいずれで失敗しても afterEach が runner を通して cleanup する。

#### regression-r2-cli-signal

`tests/regression-r2-cli-signal.test.ts:28-40` では、cleanup 専用 `AbortController` を `executeCommand()` に追加し、stopper を readiness wait より前に登録している。

通常成功経路では従来どおり、

```ts
await terminateActiveChildren(300);
...
const r = await running;
```

を実行する。cleanup controller は test failure / timeout のためだけに使われ、正常経路の `terminateActiveChildren()` の検証を置き換えていない。

#### regression-r3-cli

`tests/regression-r3-cli.test.ts:92-115` では CLI spawn 後、最初の非同期 wait より前に CLI handle を使う stopper を登録する。

```ts
cleanups.push(
  stopper(
    exited,
    () => cli.kill("SIGTERM"),
    CLI_EXIT_BOUND_MS + SETTLE_MARGIN_MS,
    "the CLI",
    () => cli.kill("SIGKILL"),
  ),
);
```

ファイルから読んだ PID を cleanup で signal する旧 `killIfAlive()` は削除されている。

通常 cleanup は CLI 自身の SIGTERM handling を通す。指定上限内に CLI が exit しなければ `onLate` の SIGKILL が実行され、stopper 自身が cleanup error を投げるため、少なくとも cleanup failure を黙って PASS にする経路ではない。

製品側が自分の descendant を止め損なう場合だけ残る問題は Request の「既知の範囲外」に明示されているため、今回の指摘対象にはしていない。

以上から、M2-2-R5-001 の直接原因と同種の修正対象経路は閉じていると判断する。

---

## 3. 新しい指摘

**新しい指摘なし。**

今回の変更範囲について、指摘基準に該当する新しい High / Medium / Low は確認しなかった。

なお、Request の「既知の範囲外」に明示された以下は新規指摘にしていない。

- M2-2-R4-001 / R4-002
- kill の EPERM 経路
- 孫までタイムアウトで止めるテスト等の追加 backlog
- signal 0 probe の誤判定
- 製品が descendant cleanup を失敗した場合だけ残る test cleanup
- Windows
- verify / test の所要時間

---

## 4. Request「特に見てほしい点」1〜7 の確認結果

### 1. 後始末の網羅

**問題を見つけなかった。**

修正対象のプロセスを開始するテストでは、temp directory cleanup と stopper の登録順を確認した。

- `regression-m2-2-flake-001-timeout-after-abort.test.ts`
  - temp cleanup 登録
  - `executeCommand`
  - stopper 登録
  - 最初の `await waitReady`
- `regression-r2-cli-signal.test.ts`
  - temp cleanup 登録
  - `executeCommand`
  - stopper 登録
  - 最初の `await waitReady`
- `regression-r4-report.test.ts` scenario A / B
  - 同じ順序
- `regression-r3-cli.test.ts`
  - `project()` 内で temp cleanup を登録
  - CLI spawn
  - stdout/stderr listener と `exited` promise を作成
  - stopper 登録
  - 最初の readiness wait

したがって、**process を開始した後、stopper 登録前に asynchronous precondition failure / test timeout に入る箇所は確認できなかった**。

`runCleanups()` が LIFO なので、stopper が temp directory cleanup より先に実行される。

また、各 test は module-level cleanup array を使うが、process を開始した後に cleanup を登録するまで `await` を挟まないため、「test timeout の afterEach が先に cleanup array を空にし、その後で test 本体が stopper を追加する」形にもなっていない。

---

### 2. `stopper` と `runCleanups` の正しさ

**今回要求された範囲では問題を見つけなかった。**

#### 確定済み判定

`stopper()` は `done.then(success, rejection)` の両方で `settled = true` にする。

```ts
const ended = done.then(
  () => { settled = true; },
  () => { settled = true; },
);

return async () => {
  if (settled) return;
  ...
};
```

fulfilled / rejected のどちらでも確定済みなら stop を呼ばない。

#### 未確定の場合

未確定なら `stop()` を呼び、`ended` と timeout を `Promise.race()` する。

```ts
stop();
...
const outcome = await Promise.race([
  ended.then(() => "ended" as const),
  late,
]);
```

#### 上限超過

timeout 側が勝った場合は、任意の `onLate` を実行した後、必ず error を投げる。

```ts
if (outcome === "late") {
  onLate?.();
  throw new Error(...);
}
```

黙って cleanup success にはしない。

#### timer cleanup

`ended` 側が先なら `clearTimeout(timer)` を実行する。timeout 側が先の場合は timer は既に発火済みである。

今回の実装で pending timeout を残す経路は見つけなかった。

#### `runCleanups`

後から積んだ cleanup から順に `await` し、1件が失敗しても残りを実行する。

```ts
while (cleanups.length > 0) {
  try {
    await cleanups.pop()?.();
  } catch (err) {
    errors.push(err);
  }
}
if (errors.length > 0) throw errors[0];
```

このため stopper が失敗しても temp cleanup などの残りは実行され、その後 cleanup failure として test を失敗させる。

#### hookTimeout との関係

今回の修正対象で最長の stopper bound は r4 scenario B の

- kill grace: 20,000 ms
- settle margin: 5,000 ms
- 合計: 25,000 ms

であり、Request に記載された hookTimeout 30,000 ms 未満。

修正対象 test 1件あたり、25秒級 stopper を複数直列に積む構成も確認できなかった。

---

### 3. PID の再利用

**今回の修正による問題を見つけなかった。**

r3-cli の旧 cleanup は PID file を読み、後からその PID へ SIGKILL していたが、今回その経路は削除された。

cleanup の signal は、

- runner: `AbortController`
- CLI: `ChildProcess.kill()`

を通す。

PID file から読んだ値は readiness / liveness assertion のためには使われるが、r3 cleanup の signal target には使われない。

#### r4 scenario B の手動 SIGKILL

`tests/regression-r4-report.test.ts:90-99` を確認した。

test は、

1. child 自身が ready PID を書いたことを確認
2. runner timeout の SIGTERM を child が受け、child 自身が `term.pid` を書いたことを確認
3. `settled === false` を確認
4. runner の SIGKILL grace は 20秒
5. child は SIGTERM handler で SIGTERM を無視し、30秒 timer で生存
6. その直後に、その test 本体だけが一度 `process.kill(childPid, "SIGKILL")`

という順になっている。

通常の fixture 動作では、この時点で child が生存しているという前提はコードと一致する。cleanup 側はこの PID を再度 signal しない。

外部要因等でこの fixture process 自体が予期せず消えるケースまで一般化することは、今回の要求範囲ではないと判断した。

---

### 4. テスト対象に頼る後始末（r3-cli）

**依頼で了承された方針の範囲では問題を見つけなかった。**

r3-cli の cleanup は CLI の `ChildProcess` handle に SIGTERM を送り、CLI自身の SIGTERM pathによる runner cleanup と report finalize を待つ。

CLI が指定時間内に exit しない場合、

```ts
onLate: () => cli.kill("SIGKILL")
```

を実行した上で stopper が cleanup error を投げる。

したがって CLI の signal handling が壊れて「時間内に exit しない」場合は test failure として見える。

CLI が exit したのに内部 descendant だけを止め損なうケースは、製品自身の descendant cleanup failure に該当し、Request で今回の既知の範囲外とされている。

今回の cleanup 変更がそれを「成功」に偽装する新しい経路は確認しなかった。

---

### 5. テストが要件を検証し続けているか

**assert を弱める変更は確認しなかった。**

特に `regression-r2-cli-signal.test.ts` では AbortController が追加されたが、正常経路の検証は従来どおり、

```ts
await terminateActiveChildren(300);
...
expect(() => process.kill(grandchildPid, 0)).toThrow();
const r = await running;
```

である。

cleanup controller は最初の readiness/precondition 等で test が失敗した場合の afterEach 用であり、PASS path で `terminateActiveChildren()` の代わりにはならない。

M2-2-FLAKE-001 も、

- abort が timeout より十分前
- run が timeout 時刻以後まで cleanup 中
- `interruptedBy === "SIGINT"`
- `timedOut === false`
- report conversion 後も SKIPPED / timedOut false

という元の目的を維持している。

r4 A/B、r3-cli の既存結果 assert にも、今回 cleanup 対応のための削除・緩和は確認しなかった。

---

### 6. 新しい単体テスト

**今回要求された helper contract は検証できている。**

`tests/regression-m2-2-r5-001-test-cleanup.test.ts` で次を確認している。

#### stopper が未確定対象を止め、確定まで待つ

`18-35`:

- stop 回数を数える
- stop 後 50 ms で `done` を resolve
- cleanup を await
- stop が1回であることを確認

#### 上限で失敗する

`37-55`:

- 永久 pending promise
- 200 ms bound
- timeout error の文言
- stop が1回
- `onLate` が1回

を確認。

#### 確定済みなら何もしない

`57-71`:

- fulfilled
- rejected

の双方について、done の確定後に cleanup を呼び、stop 回数 0 を確認。

#### `runCleanups` の順序と error

`73-92`:

- newest → middle → oldest
- newest がthrowしても middle / oldest を実行
- middle もthrowする
- 最終的に最初に集めた `newest failed` をthrow
- cleanup array が空

を確認。

#### `waitReady`

`94-101`:

readiness timeout が `precondition:` で始まる failure になることを確認している。

今回 Request に列挙された helper 要件について、明らかな未検証項目は見つけなかった。

---

### 7. docs とコードの一致

**問題を見つけなかった。**

`docs/ARCHITECTURE.md` の v0.5.8 追記は、

- test failure / timeout でも afterEach 内で cleanup
- runner の AbortController または ChildProcess handle だけを signal
- file から読んだ PID を cleanup で signal しない
- `stopper` / `runCleanups` を使用
- 止めた相手の grace + 5秒まで確定を待ち、超過時は test failure

という方針を記載している。

これは `tests/helpers.ts:93-149` と、今回修正された test の使い方に一致する。

---

## 確認範囲

主に以下を確認した。

- `tests/helpers.ts`
- `tests/regression-m2-2-flake-001-timeout-after-abort.test.ts`
- `tests/regression-m2-2-r5-001-test-cleanup.test.ts`
- `tests/regression-r2-cli-signal.test.ts`
- `tests/regression-r3-cli.test.ts`
- `tests/regression-r4-report.test.ts`
- `docs/ARCHITECTURE.md` の変更差分
- 変更 diff
- Verification 節（PASS 自体は正しさの根拠には使用していない）

Previous Reviews、commit message、response、CHANGELOG、ADR、ARCHITECTURE の実装 AI による説明は結論の根拠にはせず、確認対象の場所を特定するための索引としてのみ扱った。
