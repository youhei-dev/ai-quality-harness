<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r4-for-claude.md、ChatGPT、2026-09-25 付、23,310 バイト、対象範囲 v0.5.3..v0.5.4）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 320190bcba5a88dc7b41dce8321e5534fb0c898e496a6a27e5592d4a9befa562
-->

# independent review — M2-2 R4

## 1. 総評

v0.5.3..v0.5.4 の変更について、Request の「特に見てほしい点」1〜8、前回指摘 M2-2-R3-001〜003、変更コード、回帰テスト、ADR-0017 を独立に確認した。

前回 3 件の判定は、**R3-001: 解消、R3-002: 部分的に解消、R3-003: 部分的に解消**である。LF / TAB の line / block 分離は実装と回帰テストの双方で前回原因を直接潰している。一方、JSON の安全なコピーには `toJSON` という特殊キーの callable value による `JSON.stringify` の再解釈が残り、構造ガードには `process.getBuiltinModule(...)` 経由の組み込みモジュール取得が残る。

新しい指摘は **High 0件 / Medium 2件 / Low 0件**。どちらも、現時点で aiqh の通常 CLI が利用者入力だけから直接到達する経路は確認できなかったため High ではなく、共通出力境界 / 再発防止テストの要件未達として Medium とした。

レビュー用パケットは完全な repository checkout ではないため、プロジェクトのフルテストスイートは再実行していない。ただし、次の 2 点はローカル Node.js の最小確認を実行した。

- `JSON.stringify()` は、own property の `toJSON` が関数ならそれを呼び、その戻り値に U+202E が含まれていても生の code point のまま結果文字列へ保持し得る。
- `process.getBuiltinModule("node:console")` は `log` を、`process.getBuiltinModule("node:vm")` は `runInThisContext` を取得できる。

---

## 2. 前回指摘の解消状況

### M2-2-R3-001 — 解消

**対象**
- `src/output.ts:45-55`
- `src/output.ts:123-132`
- `src/output.ts:140-170`
- `src/config/generate.ts:30-36`
- `src/config/generate.ts:65-79`
- `tests/regression-m2-2-r3-001-line-breaks.test.ts:82-299`

前回の原因は、既定 text 出力が LF / TAB を保持し、利用者由来のパス、ファイル名、check 出力、Commander が引用する argv が端末上で別行 / 別列を作れたことだった。

v0.5.4 では、1 行出力は `safeText(..., "line")` が `escapeRawChars()` を通す。

```ts
export function safeText(s: string, shape: TextShape = "line"): Safe {
  return maskSecrets(
    shape === "line"
      ? escapeRawChars(s)
      : s.split("\n").map(escapeRawChars).join("\n"),
  ) as Safe;
}
```

したがって line では LF / TAB も表記に変わる。

複数行を許すものは明示的に `block` / `errorBlock` に分離されている。

```ts
block: (text) => out(safeText(text, "block")),
errorBlock: (text) => err(safeText(text, "block")),
```

block は LF の境界だけを保存し、各行に `escapeRawChars()` を適用するので、TAB と禁止文字はそのまま通らない。

init の設定案のコメント値も、設定案を組み立てる時点で、

```ts
function commentValue(s: string): string {
  return maskSecrets(escapeRawChars(s));
}
```

を通すため、コメント内の値が block の新しい行を作らない。端末に出す proposal と `--write` のファイルで、コメント値は同じ表記になる。

Commander の usage error については `commanderError()` が、末尾 LF と Commander 自身の suggestion 行の前の LF だけを残し、それ以外の LF を表記に変える。

回帰テストでは少なくとも、

- LF を含むファイル名
- TAB を含むファイル名
- LF を含む `--cwd`
- check output 内の TAB
- init proposal のコメント値
- config error の summary と block
- unknown option / unknown command / too many arguments
- fake suggestion に見える argv

を直接検証している。

前回指摘の原因となる経路は今回のコードで閉じているため、**解消**と判断する。

---

### M2-2-R3-002 — 部分的に解消

**対象**
- `src/output.ts:57-80`
- `tests/regression-m2-2-r3-002-json-keys.test.ts:40-107`
- `docs/adr/0017-output-lines-blocks-keys-guard.md:34-36`

通常の JSON object key については前回指摘を直接修正している。

```ts
for (const [k, v] of Object.entries(value)) {
  const key = maskSecrets(escapeForDisplay(k, mode));
  if (Object.hasOwn(out, key)) {
    throw new Error(...);
  }
  out[key] = jsonSafe(v, mode);
}
```

これにより、

- key も「表記 → mask」
- 変換後 key の衝突は例外
- copy object は `Object.create(null)`
- `__proto__` が prototype mutation として扱われない

ことを確認した。

しかし `jsonSafe()` は function value を変換せずそのまま残すため、特殊キー `toJSON` の値が関数の場合、`JSON.stringify()` がその関数を呼び、`jsonSafe()` が処理していない戻り値で object 全体を置き換えられる。

→ **M2-2-R4-001**

したがって R3-002 の一般的な key escaping / collision 問題は直っているが、「特別な名前のキーを含めても safeJson が最終出力を支配する」という保証は完全ではなく、**部分的に解消**とする。

---

### M2-2-R3-003 — 部分的に解消

**対象**
- `src/output.ts:40-55`
- `src/output.ts:83-95`
- `tests/structure/output-guard.ts:146-295`
- `tests/regression-m2-2-r3-003-output-guard.test.ts:23-156`
- `docs/adr/0017-output-lines-blocks-keys-guard.md:37-54`
- `docs/adr/0017-output-lines-blocks-keys-guard.md:67-72`

前回直接指摘した、

- `process[key]`
- `globalThis[key]`
- Reflect / property descriptor
- type assertion / alias / rest destructuring
- `src/output.ts` 内で Safe を通さない直接 write
- Safe の cast / type predicate / `any`
- fd / device path
- child process の terminal inheritance
- `Function` / `eval` / `require` / `createRequire` / dynamic import / `node:vm`

の多くは構造ガードに追加され、fixture でも確認されている。

また現在の `src/` に terminal reference が `emitOut` / `emitErr` 以外に無いことを検査する test も追加されている。

ただし、Node の `process.getBuiltinModule(...)` を使うと、import declaration、`require`、`createRequire`、dynamic `import()` を経由せずに `node:console` や `node:vm` を取得できる。現行 guard はこの API を特別扱いしていない。

→ **M2-2-R4-002**

そのため前回の具体的な `process[key]` 等は解消しているが、「型検査で見えない / 別経路で terminal へ到達する構造を guard が防ぐ」という R3-003 全体としては **部分的に解消**とする。

---

## 3. 新しい指摘

### ID: M2-2-R4-001

- **重大度:** Medium
- **対象:**
  - `src/output.ts:63-80`
  - `tests/regression-m2-2-r3-002-json-keys.test.ts:40-107`
  - `docs/adr/0017-output-lines-blocks-keys-guard.md:34-36`

### 内容

`safeJson()` の安全なコピーに own property `toJSON` が callable value として残ると、`JSON.stringify()` がその関数を実行し、その戻り値を **`jsonSafe()` を通さず**最終 JSON に使用する。

そのため `toJSON` の戻り値に禁止文字や秘密形状が含まれている場合、共通 JSON 出力境界を迂回できる。

現在の aiqh の `--json` が組み立てる値は plain data であり、利用者入力から function value を生成する経路は確認できなかった。そのため現状 CLI から直接発火する High ではなく、共通境界の保証と回帰テストの不足として Medium とする。

### 根拠

`jsonSafe()` は string / array / object だけを変換し、function はそのまま返す。

```ts
function jsonSafe(value: unknown, mode: LineMode): unknown {
  if (typeof value === "string")
    return maskSecrets(escapeForDisplay(value, mode));

  if (Array.isArray(value))
    return value.map((v: unknown) => jsonSafe(v, mode));

  if (value !== null && typeof value === "object") {
    const out = Object.create(null) as Record<string, unknown>;
    for (const [k, v] of Object.entries(value)) {
      const key = maskSecrets(escapeForDisplay(k, mode));
      if (Object.hasOwn(out, key)) throw new Error(...);
      out[key] = jsonSafe(v, mode);
    }
    return out;
  }

  return value;
}
```

そして `safeJson()` はその copy をそのまま `JSON.stringify()` に渡す。

```ts
export function safeJson(value: unknown, mode: LineMode = "keep"): Safe {
  return JSON.stringify(jsonSafe(value, mode), null, 2) as Safe;
}
```

したがって概念的に、

```ts
const value = {
  toJSON: () => someUncheckedString
};
```

を渡すと、copy 側にも callable な `toJSON` が残る。

`Object.create(null)` は prototype pollution を防ぐが、`JSON.stringify()` が own `toJSON` method を呼ぶ仕様までは無効化しない。

既存回帰テストは特殊キーとして `__proto__` を確認しているが、`toJSON` は確認していない。

```ts
it("a key named __proto__ stays a key ...", ...)
```

### 再現条件

**一部実行済み（Node.js 最小確認）。aiqh 本体の `safeJson()` は review packet のため未実行。**

1. `toJSON` という own property を function value として持つ object を作る。
2. その function が、runtime で組み立てた U+202E を含む string を返す。
3. `safeJson()` に渡す。
4. **期待:** 最終的に `JSON.stringify()` が見るすべての string は `jsonSafe()` の処理済みであり、生の U+202E が残らない。あるいは callable / non-JSON value を fail-closed で拒否する。
5. **実際:** `jsonSafe()` は function をそのまま copy へ残すため、`JSON.stringify()` が own `toJSON` を呼び、その戻り値を最終 JSON に使える。

ローカル Node.js の最小確認では、null prototype の object であっても own `toJSON` が関数なら呼ばれ、その戻り値中の U+202E が結果文字列に生で保持されることを確認した。

### 修正案

`safeJson()` の入力を「JSON data」に限定し、serialization 前の copy に callable value が残らないようにする。

方針例:

- `typeof value === "function" | "symbol" | "bigint"` 等、JSON data ではない値を明示的に拒否する。
- object copy の key が `toJSON` で、value が callable の場合も通常の data として扱える representation に変換するか、より単純に fail-closed にする。
- より堅牢には `JSON.stringify()` の user hook に依存せず、JSON data tree を厳密に検証してから serialization する。

現在の command outputs が JSON data のみであることも structure / runtime test で固定するとよい。

### 回帰テスト案

`safeJson()` に、

- own key `toJSON`
- value が function
- function の戻り値に runtime 生成した U+202E
- function の戻り値に secret-shaped string

を含む fixture を渡す。

期待する方針を、

- `safeJson()` が例外で拒否する、または
- callable を実行せず data として安全に serialise する

のどちらかに固定し、**生の U+202E や秘密形状が返らない**ことを確認する。

修正前は FAIL する。

---

### ID: M2-2-R4-002

- **重大度:** Medium
- **対象:**
  - `tests/structure/output-guard.ts:160-175`
  - `tests/structure/output-guard.ts:192-236`
  - `tests/regression-m2-2-r3-003-output-guard.test.ts:23-125`
  - `docs/adr/0017-output-lines-blocks-keys-guard.md:40-54`
  - `docs/adr/0017-output-lines-blocks-keys-guard.md:67-72`
  - `package.json:7-9`

### 内容

構造ガードが `process.getBuiltinModule(...)` を検出しない。

Node のこの API を使うと、構造ガードが明示的に禁止している `node:console` や `node:vm` を、import / `require` / `createRequire` / dynamic `import()` を使わず取得できる。

そのため、例えば `process.getBuiltinModule("node:console")` から terminal write へ、または `process.getBuiltinModule("node:vm")` から動的コードへ到達するコードを追加しても、現行 guard の列挙では検出されない可能性が高い。

現在の `src/` にこの API の使用は確認できないので、現時点の直接漏えいではなく、R3-003 の再発防止テストの取りこぼしとして Medium とする。

### 根拠

guard は import declaration について、

```ts
if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
  const m = n.moduleSpecifier.text;
  if (m === "console" || m === "node:console")
    add(n, "import node:console");
  if (VM_MODULES.has(m))
    add(n, "dynamic code: node:vm");
}
```

を検査する。

identifier については、

```ts
if ((sym.name === "Function" || sym.name === "eval") && ...)
  ...

if ((sym.name === "require" || sym.name === "createRequire") && ...)
  ...
```

を検査する。

dynamic `import()` も別途検査している。

一方 `process.getBuiltinModule` は、holder である `process` に対する **名前付き property access** なので、holder rule では許可される。

```ts
if (
  ts.isPropertyAccessExpression(parent) &&
  parent.expression === n
) {
  // reading a property by its name
}
```

その call の戻り値が `node:console` / `node:vm` であっても、`getBuiltinModule` という API 自体を検査する分岐は無い。

fixture も、

- import `node:vm`
- `createRequire`
- computed import
- Function
- eval

等は持つが、`process.getBuiltinModule(...)` は無い。

ADR-0017 の既知の限界には worker_threads、repl、node:test、tty、debuglog、emitWarning、runtime device path 等が挙げられているが、`process.getBuiltinModule` は記録されていない。さらに ADR 本文では `node:vm` を検出対象として明示しているため、この経路は既知の範囲外には含めにくい。

`package.json` は Node `>=24.0.0` を要求しており、この種の modern Node API を構造ガードの前提から外す理由もない。

### 再現条件

**一部実行済み（Node.js runtime で API availability を確認）。output-guard 自体は packet のため未実行。**

fixture として概念的に次を追加する。

```ts
export const f = (): void => {
  const c = process.getBuiltinModule("node:console");
  c.log("x");
};
```

または、

```ts
export const f = (): void => {
  const vm = process.getBuiltinModule("node:vm");
  vm.runInThisContext("...");
};
```

期待:

- 前者は共通出力境界を迂回できる terminal route として violation
- 後者は dynamic code として violation

実際:

- `process` の `.getBuiltinModule` は named property access として holder rule を通る。
- import / require / dynamic import の detector にも該当しない。
- `node:console` / `node:vm` の取得自体を示す AST pattern を検査していない。

ローカル Node.js では `process.getBuiltinModule("node:console").log` と `process.getBuiltinModule("node:vm").runInThisContext` が利用可能であることを確認した。

### 修正案

少なくとも次のいずれかを行う。

1. `process.getBuiltinModule` の call を原則 violation とする。
2. literal module name を解析し、許可 module の allowlist を設ける。
3. ADR-0017 にある「src が読み込める組み込みモジュールの一覧を限定する」方式を実装し、import / require / getBuiltinModule を同じ policy で検査する。

防御ツールとしては 2 または 3 が分かりやすい。

### 回帰テスト案

R3-003 fixture に少なくとも、

- `process.getBuiltinModule("node:console").log(...)`
- `process.getBuiltinModule("node:vm").runInThisContext(...)`
- module 名を変数から渡す `process.getBuiltinModule(name)`

を追加し、すべて guard violation になることを確認する。

control として、必要なら明示的に許可した safe builtin を取得する fixture を置き、allowlist 方針の誤検出も確認する。

修正前は FAIL する。

---

## 4. Request「特に見てほしい点」1〜8 の確認結果

### 1. 1 回の書き出し = 1 行

確認した。

通常の command output は `output.log()` / `output.error()` が `safeText()` の既定 `"line"` を通り、LF / TAB / 禁止文字は `escapeRawChars()` で表記になる。

security-scan の file name、各 command の cwd / path、verify の check tail の各行など、前回具体的に問題になった値は line 単位で処理されている。

回帰テストも LF filename、TAB filename、LF cwd、check output TAB を含む。

今回のコードから、利用者由来の値が line writer を通って生 LF / TAB で新しい端末行 / 列を作る経路は見つけなかった。

**この点は問題なし。R3-001 は解消。**

---

### 2. block

確認した。

block は、

```ts
s.split("\n").map(escapeRawChars).join("\n")
```

なので、block 自身の行境界だけが残り、各行内の TAB / 禁止文字は表記になる。

意図的 block は主に、

- init proposal
- config validation details
- Commander help / version / usage suggestion

へ限定されている。

init proposal の comment value は `commentValue()` で事前に `escapeRawChars()` → masker を通すため、値自身の LF で block の行数を増やさない。

config validation details は ADR の明示どおり trusted config を前提とし、今回の scope では妥当。

Commander usage error は `commanderError()` が最後の LF と実際の suggestion 前の LF 以外を表記にする。回帰テストには、引数内に `(Did you mean --json?)` に見える文字列を入れるケースも含まれている。

現在のコードから、利用者 argv が fake suggestion 行を block として残す経路は見つけなかった。

**この点は問題なし。**

---

### 3. JSON のキー

通常の key 処理については、

1. `escapeForDisplay`
2. `maskSecrets`
3. 同一 object 内で `Object.hasOwn` による衝突検査
4. null prototype object への copy

の順序で、要求どおり。

`__proto__` の regression もあり、prototype mutation は防がれている。

値については v0.5.3 の処理を再構成した control と比較しており、string value の従来出力を維持する意図は確認できる。

ただし **特殊キー `toJSON` + callable value** は `JSON.stringify()` の hook になり、copy 後に再び object 全体を置き換えられる。

→ **M2-2-R4-001**

したがってこの項目は「通常の key は問題なし、特殊 key には追加問題あり」。

---

### 4. brand 型と 2 つの基本関数

`Safe` は unique symbol brand で、

```ts
export type Safe = string & { readonly [safeBrand]: true };
```

terminal writer は、

```ts
function emitOut(text: Safe, ...)
function emitErr(text: Safe, ...)
```

のみ。

`safeForgeries()` は、

- Safe への type assertion
- Safe の type predicate
- Safe が期待される位置の `any`

を検査する。

回帰 fixture も cast / predicate / `JSON.parse` の any を含む。

現行 `src/output.ts` の terminal reference は `emitOut` / `emitErr` 内だけという control もある。

今回確認した現在の source では、raw string を Safe として作って terminal writer に渡す経路は見つけなかった。

ただし terminal そのものへ別 API で到達する構造ガードの穴は R4-002。

---

### 5. 構造ガード

前回の `process[key]`、reflection、cast、rest destructuring、fd、device path、stdio、dynamic import、vm、eval 等への拡張は確認した。

fixture も前回よりかなり広い。

一方、`process.getBuiltinModule(...)` が漏れている。

→ **M2-2-R4-002**

ADR-0017 の「既知の限界」にはこの API が書かれておらず、むしろ `node:vm` は guard 対象として記述されているため、docs の保証と guard 実装にもずれがある。

---

### 6. init の設定案のコメントの値

確認した。

comment value は、

```ts
maskSecrets(escapeRawChars(s))
```

で生成時に安全化され、その同じ `configText` が、

- terminal: `output.block(configText.trimEnd())`
- file: `writeFileSync(configFile, configText, "utf8")`

へ使われる。

したがってコメントの値については、LF / TAB / 禁止文字 / secret shape の表記が terminal と `--write` で一致する。

回帰テストも modified Resolution を作って、LF / TAB / U+202E を comment reason / note / hint に注入し、line count、禁止文字、parse 結果、書いた file と terminal lines の一致を確認している。

**問題なし。**

---

### 7. 通常の出力の不変

コード上は、禁止文字・secret shape・利用者由来 LF / TAB を含まない line では、

```ts
safeText(line)
```

が文字列内容を変更しない。

block でも各通常行はそのままで、LF の join も保存される。

JSON value については v0.5.3 の処理を test 内で再構成して比較している。

Commander の代表的 usage error、help、config error、init proposal、verify failure output に v0.5.3 相当の具体的 assertion がある。

ただし「全 command / 全 branch を v0.5.3 の実 binary と snapshot 比較する」レベルの網羅テストではなく、代表ケース + 変換関数の性質で担保している。

今回変更された通常入力経路について、実装上バイト差を生む追加問題は見つけなかったので、**新規指摘にはしない**。

---

### 8. テストが要件を検証できているか

R3-001 の regression は、修正前の具体例だった LF filename / TAB / Commander argv を直接含むので、修正前コードでは失敗する形になっている。

R3-002 も、

- U+202E / U+2028 / U+2029 / CR key
- LF / TAB key
- secret-shaped key
- `__proto__`
- key collision
- mask collision

を持ち、修正前の「key untouched」では失敗する。

R3-003 も `process[key]`、reflection、Safe forgery、src/output.ts 内 bypass 等、前回指摘そのものには有効。

一方、今回見つけた未検証点は、

- `toJSON` callable key
- `process.getBuiltinModule(...)`

である。

この 2 件は現行 test では対照になっておらず、追加 regression が必要。

---

## 確認範囲

主に次を確認した。

- `src/output.ts`
- `src/cli-program.ts`
- `src/commands/init.ts`
- `src/commands/security-scan.ts`
- `src/commands/verify.ts`
- `src/commands/review-packet.ts`
- `src/config/generate.ts`
- `src/config/load.ts`
- `tests/regression-m2-2-r3-001-line-breaks.test.ts`
- `tests/regression-m2-2-r3-002-json-keys.test.ts`
- `tests/regression-m2-2-r3-003-output-guard.test.ts`
- `tests/structure/output-guard.ts`
- `tests/structure/process-guard.ts`
- `docs/adr/0017-output-lines-blocks-keys-guard.md`
- `docs/adr/0016-output-boundary.md`
- `docs/ARCHITECTURE.md`
- `package.json`

Previous Reviews、commit message、response、CHANGELOG、ADR の結論は正しさの根拠にはせず、確認箇所を特定するための索引としてのみ扱った。

Request の「既知の範囲外」に指定された項目は、新規指摘対象から除外した。
