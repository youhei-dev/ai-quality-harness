<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-cli-catch-r1-for-claude.md、ChatGPT、2026-09-27 受領、17,734 バイト、対象範囲 v0.5.13..v0.5.14）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 246093d76e5ba7425b0245915fc537c5a031023391892e9b5426a17d8fe74a0f
-->

# independent review — M2-2 CLI Catch R1

## 1. 総評

v0.5.13..v0.5.14 の変更について、Request の「特に見てほしい点」1〜7、`src/cli.ts` の現行全文、新規回帰テスト `tests/regression-m2-2-cli-catch-001-thrown-value.test.ts`、およびパケットに含まれる docs 差分を独立に確認した。

CLI 最上位 catch の修正そのものは、今回の目的に対して妥当である。`process.exitCode = 2` を投げられた値の検査より先に設定し、`instanceof`・`message` 読み取り・`String()`・テンプレート組み立ては `unexpectedErrorLine()` 内の try に閉じ込めている。失敗後は固定文字列だけを返し、元の値や検査中に投げられた値を再度参照しない。`writeError()` も行ごとの `tryWriteError()` で包まれているため、1行目の書き込みが失敗しても判定行を試行し、catch handler 自体から例外を再送出しない。

一方、新規回帰テストは CLI 子プロセスを `execFile()` で起動するが、プロジェクトで v0.5.8 に定めた「失敗・テストタイムアウトでも `afterEach` の中で開始したプロセスを止める」後始末機構を使っていない。通常経路では CLI は短時間で終了するが、回帰・ハング・テストタイムアウト時には worker の寿命に cleanup を依存し得るため、**Medium 1件**を指摘する。

**新規指摘件数: High 0 / Medium 1 / Low 0**

---

## 2. 新しい指摘

### ID: M2-2-CLI-CATCH-R1-001

- **重要度:** Medium
- **種別:** テスト / 後始末 / 回帰テストの堅牢性
- **対象:**
  - `tests/regression-m2-2-cli-catch-001-thrown-value.test.ts:91-130`
  - `docs/ARCHITECTURE.md:440-443`

### 内容

新規回帰テストが `execFile()` で実物 CLI を起動しているにもかかわらず、開始した `ChildProcess` handle を保持して `afterEach` で停止・確定待ちする仕組みを持たない。

このリポジトリでは v0.5.8 で、

> テストの後始末は、失敗・タイムアウトの経路でも `afterEach` の中で終える。ワーカーの寿命に任せない。

という方針を定めており、`tests/helpers.ts` の `stopper` / `runCleanups` を使う設計になっている。

今回のテストは `execFile()` の `timeout: 20_000` と `killSignal: "SIGKILL"` だけに依存している。これは通常実行時には安全弁になるが、テスト自体が先に timeout したり Vitest worker が終了した場合、その worker 内の Node timer / callback が後始末を実行することを保証できない。これは M2-2-R5-001 で実測して修正した問題と同種である。

### 根拠

新規テストは temp directory を `afterAll` でのみ消す。

```ts
const tmp = makeTempDir("aiqh-cli-catch-");
afterAll(() => tmp.cleanup());
```

CLI の起動は `run()` 内の `execFile()`。

```ts
const started = new Promise<Run>((resolve) => {
  execFile(
    process.execPath,
    ["--import", pathToFileURL(preload).href, CLI, "security-scan", "--json"],
    {
      cwd: tmp.dir,
      env: { ... },
      timeout: CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    },
    ...
  );
});
```

しかし `execFile()` が返す `ChildProcess` handle を保存せず、`afterEach` cleanup に登録していない。

一方、現在の `docs/ARCHITECTURE.md:440-443` は明示的に次を要求している。

```text
テストの後始末は、失敗・タイムアウトの経路でも afterEach の中で終える
（ワーカーの寿命に任せない）。
止めるのは runner の AbortController か ChildProcess の handle だけ。
```

M2-2-R5-001 の調査では、Vitest は test timeout 後に test 本体の cleanup を保証せず、file 終了時に worker が止まるため、worker 内の後始末 timer に依存すると子プロセスが残り得ることが既に実測されている。

この新規テストはその後に追加されたが、同じ共通 cleanup 方針を使っていない。

### 再現条件

**未実行（コード読解による）。**

例えば一時的な回帰または fixture の変更により、起動した CLI が正常終了せず 20秒以上待つ状態にする。

1. `run(kind)` が `execFile()` で CLI を起動する。
2. CLI が終了せず、Promise が pending のままになる。
3. Vitest の当該 test の timeout / file cleanup が `execFile` 側の20秒 timeoutより先に作用する、または worker が停止する。
4. `afterEach` に child cleanup は登録されていない。
5. `afterAll` は directory cleanupしか持たない。
6. child の終了が、worker 内の `execFile` timeout timerに依存する。

**期待:**
- assertion failure / test timeout のどちらでも、その test の `afterEach` 内で ChildProcess handle を停止する。
- 終了を bounded に待つ。
- その後に temp directory を消す。

**実際:**
- child cleanup を `afterEach` で保証していない。
- temp directory cleanup と child lifecycle の順序も保証していない。

### 修正案

既存の M2-2-R5-001 の方針へ合わせる。

- `execFile()` が返す `ChildProcess` handle を保持する。
- file/test 単位の cleanup stack を作り、CLI 起動直後・最初の await より前に stopper を登録する。
- `afterEach` で `runCleanups()` を実行する。
- CLI が未確定なら ChildProcess handle に signal を送り、bounded に exit を待つ。
- cleanup 完了後に temp directory を削除する。
- PID file 等から読み取った PID には signal を送らない。
- `execFile` 自身の timeout は二重の安全弁として残してもよいが、主 cleanup にしない。

共有 `runs` map を維持する場合は、同じ child を複数 test が参照する設計との整合を慎重に扱う必要がある。より単純には、1 kind の結果を file-level setup で全て収集してから assertion test を行うか、各 run の lifecycle owner を明示する。

### 回帰テスト案

CLI fixture を意図的に終了しない状態にした test-only scenario を用意し、

1. test body を precondition failure または短い timeout で失敗させる。
2. `afterEach` が child を停止する。
3. afterEach終了時に child が終了済みである。
4. temp directory が child 停止後に削除される。
5. timeout safety valve に到達する前に cleanup が完了する。

ことを検証する。

---

## 3. Request「特に見てほしい点」1〜7 の確認結果

### 1. catch から例外が出ないか

**製品コードの変更について確認したが問題なし。**

`src/cli.ts:103-108` は次の順序。

```ts
program.parseAsync(process.argv).catch((err: unknown) => {
  process.exitCode = EXIT_ERROR;
  tryWriteError(unexpectedErrorLine(err));
  tryWriteError("VERIFY ERROR (internal error)");
});
```

`EXIT_ERROR` は固定の数値 2 であり、通常の Node runtime ではこの代入は投げられた値を調べない。

その後呼ぶ2関数は、それぞれ自分の内部で例外源を try に閉じ込めている。

`unexpectedErrorLine()` (`src/cli.ts:85-91`) は、

```ts
try {
  return `aiqh: unexpected error: ${
    err instanceof Error ? err.message : String(err)
  }`;
} catch {
  return UNINSPECTABLE_THROWN_LINE;
}
```

となっており、次を同じ try で覆う。

- `instanceof`
- `Error.message` の property read
- `String(err)`
- ternary result の template interpolation / ToString
- 1行目文字列の組み立て

したがって Proxy の `getPrototypeOf`、message getter、`toString`、`Symbol.toPrimitive`、symbol の template conversion 等が投げても固定 primitive string を返す。

`tryWriteError()` (`src/cli.ts:94-100`) も `writeError()` 全体を try で包み、その例外を束縛せずに捨てる。

投げられた値に依存して top-level catch callback から再度例外を出す経路は、今回確認したコードでは見つけなかった。

なお、`process` 自体や Node built-in を同一process内の別コードが改変するような runtime-wide tampering は、今回の「投げられた値」のレビュー範囲とは別であり確認していない。

---

### 2. 失敗後に値を読み直さないか

**確認したが問題なし。**

`unexpectedErrorLine()` の catch は binding を持たない。

```ts
catch {
  return UNINSPECTABLE_THROWN_LINE;
}
```

そのため検査途中に投げられた値を変数へ保持しない。

catch 後に使うのは固定 lexical constantだけで、元の `err` を、

- 再度 `instanceof`
- property read
- `String`
- log
- cause
- error wrapping

へ渡す処理は無い。

`tryWriteError()` も `writeError()` が投げた値を binding せず、再度調べない。

新規テストは handler 自身を Proxy にした watched value を使い、最初の `"fail"` 以後の trap log が空であることを複数形で確認している。特に「message getter が hostile Proxy を投げる」形は、元の throw 値だけでなく**検査途中に投げられた値**の再読も検出できる。

問題は見つけなかった。

---

### 3. 普通の値の出力の不変

**コード上確認したが問題なし。**

v0.5.13 の式は、

```ts
const message =
  err instanceof Error ? err.message : String(err);

writeError(`aiqh: unexpected error: ${message}`);
```

新コードの成功経路は、

```ts
return `aiqh: unexpected error: ${
  err instanceof Error ? err.message : String(err)
}`;
```

である。

ordinary case では評価順序は同じ。

1. `err instanceof Error`
2. trueなら `err.message` を1回読む、falseなら `String(err)` を1回呼ぶ
3. 得られた値を template に埋め込む
4. `writeError()` へ1回渡す

特に Error.message が object の場合も、

- 旧: objectを `message` に代入 → template interpolationでToString
- 新: ternary resultとしてobject → 同じtemplate interpolationでToString

であり、変換回数・順序は変わらない。

新規 test は、

- Error
- string
- `toString` を持つ object
- symbol
- `message` が `toString` object の Error

について stderr bytes を固定し、exit 2 / stdout empty まで確認している。

変更コード上、普通の値の出力差は見つけなかった。

---

### 4. `writeError()` が投げたときの扱い

**設計意図とコードは一致しており、製品コードの新規指摘はなし。**

1行目と判定行を別々の `tryWriteError()` で呼ぶため、

- 1行目の `writeError()` が失敗
- その例外は読まずに捨てる
- `VERIFY ERROR (internal error)` の出力を別の try で試す

という fail-safe になる。

新規 test の `console-error-throws` は1行目だけ `console.error` をthrowさせ、

- exit 2
- stdout empty
- 1行目なし
- verdict lineあり
- `writeError` が投げた hostile value を再読しない

を確認している。

この方式には Request に明記されたとおり、output-boundary 自体に不具合がある場合に原因の例外を黙って捨てるため、診断情報が「1行目が無い」ことしか残らない性質がある。

しかし、最終 catch がその例外を検査して再び生の文字列を出すより安全側であり、この handler の目的（exit 2を守り、追加漏えいを起こさない）には整合する。

新規指摘にはしない。

---

### 5. テストの作り

#### preload の注入が空振りしないか

**通常経路について確認したが問題なし。**

preload は `process.cwd()` を差し替え、stack に `/src/commands/security-scan.ts` がある場合だけ、

```ts
note("thrown");
throw values[kind]();
```

を行う。

各 result assertion の最初に、

```ts
expect(r.log[0]).toBe("thrown");
```

があるため、注入が空振りした run は PASS できない。

ordinary cases はさらに expected marker が stderr に現れるので、選んだ値が実際に top-level report に使われたことも確認できる。

#### 修正前にFAIL / 修正後にPASSか

パケットの test sourceを読む限り、修正前の top-level catchでは hostile values の複数形が catch 内で再throwになり、

- exit code 1
- fixed line不一致
- verdict line欠落
- raw markerの出力

のいずれかで FAIL する。

新コードではこれらを固定 line / exit 2 にする。

回帰の向きは妥当。

#### 読み直しの数え方

watched target の handler 自体を Proxy にし、trap取得を含めて記録する設計は、Proxy に対する reflective operationを広く観測できる。

また `getter-throws-hostile` は検査中に投げられた hostile Proxy の再読まで観測する。

この点は問題なし。

#### 新しい問題

ただし、**テスト自身の child-process cleanup が既存の test policyを満たさない**。

→ **M2-2-CLI-CATCH-R1-001**

---

### 6. `src/` 全体の棚卸しの結論

**この項目は一部のみ独立確認できた。repo全体の結論は未確認。**

パケットには response-r7 の v0.5.14 節として、

- `catch (err)` 29か所
- `AbortSignal.reason` 3か所
- throw site の種類
- `child.on("error")`
- `abortReason` / `describeAbort`

の棚卸し結果が記載されている。

しかし、今回の review packet の「Full Source of Changed Files」に含まれる `src/` の全文は **`src/cli.ts` だけ**である。変更していない、

- `commands/review-packet.ts`
- `commands/security-scan.ts`
- `commands/verify.ts`
- `commands/init.ts`
- `config/load.ts`
- `security/scan.ts`
- `review/packet.ts`
- `runner/execute.ts`
- `runner/run-checks.ts`

等の現行全文はパケットに収録されていない。

したがって、

> 利用者入力から「調べると例外になる値」が届く箇所は0

という repo-wide の結論を、response の説明だけを根拠に独立確認したとは言えない。

今回変更された top-level catch が hostile thrown valueを安全に処理できることは確認したが、**棚卸しの網羅性そのものは未確認の範囲**とする。

これはパケット外の事実を推測で否定するものではなく、今回の資料から独立検証できないという意味である。

---

### 7. docs とコードの一致

**今回含まれた変更箇所について確認したが問題なし。**

#### ADR-0018

v0.5.14 の追記は、

- exit 2を先に決める
- thrown value inspectionをtry内に置く
- failure時は固定文
- 値を再読しない
- 書けない行は飛ばし、verdict lineを試す
- ordinary outputは変わらない

としており、`src/cli.ts:76-108` と一致する。

#### ARCHITECTURE

CLI top-level catch の既知問題を v0.5.14 で解消した記述はコードと一致する。

#### ROADMAP

旧 backlog 1 を完了記録へ移し、旧 2〜20 を 1〜19 へ繰り上げる変更が入っている。ADR-0017 / ADR-0018 / ARCHITECTURE の現在番号参照も差分上更新されている。

過去版の番号を履歴として残す部分は Request で意図された扱いであり、今回の現在状態との矛盾とは判断しない。

#### response-r7 / response-r8

response-r7 の v0.5.14 節は実装内容と一致する。ただし前述のとおり、そこで記載された repo-wide throw-site inventory の正しさ自体は、変更されていない source全文が無いため独立確認していない。

response-r8 の追記は「未確認だったCLI catchをv0.5.14で扱った」という記録で、今回の作業と整合する。

---

## 4. 未確認の範囲

ユーザーの指定に従い、パケットに含まれない範囲について断定しない。

### 4.1 `src/` 全体の throw / catch / AbortSignal.reason の棚卸し

今回独立に全文を読めた現行 product source は `src/cli.ts` のみ。

response-r7 には32箇所の棚卸し表があるが、その元となる変更されていない source 全文はパケットにない。

したがって以下は独立未確認。

- throw site の列挙が本当に全件か
- catchで調べる29箇所が本当に全件か
- AbortSignal.reasonを読む3箇所が本当に全件か
- `child.on("error")` の現行コード
- それらに利用者入力から hostile object が到達しないという repo-wide data-flow 結論

### 4.2 `src/output.ts` の現行全文

今回の `tryWriteError()` は既存 `writeError()` を利用する。

実 CLI test によって現在の `writeError()` 経路を通った出力は確認できるが、`src/output.ts` 自体の現行全文は changed-source packet に含まれていないため、内部実装を今回改めて全文レビューしてはいない。

### 4.3 既知の範囲外

Requestに従い次は指摘対象外。

- global `uncaughtException` / `unhandledRejection` handlerを設けないこと
- ファイル出力の禁止文字
- M2-2-R4-002 その他ROADMAP backlog
- `safeJson()` の再レビュー
- Windows
- 過去記録の文言
- verify / test の所要時間

---

## 5. 新規指摘件数

| 重要度 | 件数 |
|---|---:|
| High | 0 |
| Medium | 1 |
| Low | 0 |

**合計: 1件**

製品コード `src/cli.ts` の今回の top-level catch 修正については新しい不具合を確認しなかった。新規指摘1件は、追加された回帰テストの child-process 後始末が既存のテストcleanup方針を満たしていない点である。
