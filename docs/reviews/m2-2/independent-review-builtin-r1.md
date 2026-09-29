<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-builtin-r1-for-claude.md、ChatGPT、2026-09-28 受領、20,292 バイト、対象範囲 v0.5.16..v0.5.17）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: ff85cc8c3cddbb55867e577fcee60e09a986704c26f5e821f2283d150d7242a8
-->

# independent review — M2-2 BUILTIN R1

## 1. 総評

対象範囲 `v0.5.16..v0.5.17` について、Request、前回レビュー原文、変更 diff、変更後の
`tests/structure/output-guard.ts` と
`tests/regression-m2-2-r4-002-builtin-allowlist.test.ts` の全文、
およびパケットに参考資料として収録された型検査 helper・既存 fixture・`tsconfig.json`・依存ポリシーと、
ADR-0019 / ARCHITECTURE / response-r4 / ROADMAP / CHANGELOG の該当箇所を独立に確認した。

前回指摘 **M2-2-R4-002 は「部分的に解消」**と判断する。

`process.getBuiltinModule` の直接参照、別名、分割代入、文字列リテラルの要素アクセス、
`globalThis.process`、`node:process` import など、今回追加された主要 fixture は検出できる構造になっている。
また、runtime module の allowlist を追加したことで、`node:worker_threads`・`node:repl`・`node:module`・URL import・
`src/` 外の相対 module・bare builtin 等、R4 時点の大きな抜けも塞がれている。

しかし、`process` holder の要素アクセスを処理する既存 branch が、新しく追加された `PROCESS_MEMBERS`
を判定していない。そのため、**文字列リテラル型を持つ変数を key にした
`process[key]`** では `getBuiltinModule` / `report` / `emitWarning` 等を取得できるのに、guard が違反を報告しない。
Request は「変数・要素アクセスを含むどの書き方でも」を確認対象としており、ADR-0019 も
「要素アクセスのキーのどれでも」検出すると記載しているため、前回指摘は完全解消ではない。

新規指摘は **High 0 / Medium 1 / Low 0**。

---

## 2. 前回指摘 M2-2-R4-002 の解消状況

### 判定: 部分的に解消

**主な対象**
- `tests/structure/output-guard.ts:97-114`
- `tests/structure/output-guard.ts:221-275`
- `tests/regression-m2-2-r4-002-builtin-allowlist.test.ts:20-37`
- `tests/regression-m2-2-r4-002-builtin-allowlist.test.ts:179-196`
- `docs/adr/0019-builtin-allowlist-process-members.md:22-44`

### 解消できている部分

`processMember()` が追加され、symbol が `PROCESS_MEMBERS` に入り、かつ宣言が
`@types/node/process.d.ts` にある場合に `process.<name>` を返す。

```ts
function processMember(sym: ts.Symbol | undefined): string | null {
  if (sym === undefined || !PROCESS_MEMBERS.has(sym.name)) return null;
  return (sym.declarations ?? []).some(
    (d) => PROCESS_TYPES.test(d.getSourceFile().fileName),
  )
    ? `process.${sym.name}`
    : null;
}
```

identifier scan にも追加されているため、

```ts
process.getBuiltinModule(...)
```

の property name identifier、別名へ取るときの元 property、`node:process` の named import の利用等は
declaration symbol を通じて検出される。

object binding pattern も、

```ts
const { getBuiltinModule } = process;
```

の property symbol を `processMember()` へ渡す。

文字列リテラル要素アクセス、

```ts
process["getBuiltinModule"]
```

についても、element access の argument location から property symbol が得られる通常形を回帰 fixture で確認している。

さらに runtime module allowlist により、

- allowlist 外の `node:` builtin
- `node:` 無し builtin
- URL module
- `src/` の source file でない relative / absolute module
- runtime dependencies に無い package
- computed `import()`
- `import = require()`

を違反にする構造が追加されている。

`BUILTIN_ALLOWED` と現行 `src/` が実際に読む `node:` builtin の集合一致、
6メンバーが `@types/node/process.d.ts` に解決することも自己検査している。

### 残っている問題

`process` / `globalThis` / `node:process` holder の element access branch では、
literal key から property symbolを取ったあと、**terminal symbol かどうかしか確認していない**。

```ts
} else if (
  ts.isElementAccessExpression(parent) &&
  parent.expression === n
) {
  const key = literalKey(checker, parent.argumentExpression);
  const prop =
    key === null
      ? undefined
      : checker
          .getNonNullableType(checker.getTypeAtLocation(n))
          .getProperty(key);

  if (
    prop === undefined ||
    terminalSymbol(resolved(checker, prop)) !== null
  )
    add(parent, `dynamic access to ${holder}`);
}
```

ここで、例えば key の型が文字列リテラル `"getBuiltinModule"` なら、

- `literalKey(...)` は `"getBuiltinModule"` を返す
- `prop` は `process.getBuiltinModule` の property symbol
- `terminalSymbol(prop)` は null
- よって holder rule は違反を追加しない

一方、element-access 専用処理は argument expression 自体の symbol を見る。

```ts
const keySym = resolved(
  checker,
  checker.getSymbolAtLocation(n.argumentExpression),
);
...
const member = processMember(keySym);
```

argument が `"getBuiltinModule"` という**リテラルそのもの**なら property symbol に解決し得るため既存 fixture
`process["getBuiltinModule"]` は検出できるが、argument が、

```ts
const key: "getBuiltinModule" = "getBuiltinModule";
process[key]
```

のような variable identifier なら `keySym` は local variable `key` の symbol であり、
`processMember(keySym)` は null になる。

したがって「要素アクセスのキー」全般を塞いだわけではない。

→ **M2-2-BUILTIN-R1-001**

---

## 3. 新しい指摘

### ID: M2-2-BUILTIN-R1-001

- **重要度:** Medium
- **種別:** 構造ガード / 検査漏れ / 回帰テスト不足
- **対象:**
  - `tests/structure/output-guard.ts:233-275`
  - `tests/regression-m2-2-r4-002-builtin-allowlist.test.ts:20-37`
  - `tests/regression-m2-2-r4-002-builtin-allowlist.test.ts:179-196`
  - `docs/adr/0019-builtin-allowlist-process-members.md:32-40`

### 内容

`process` の危険メンバーを、**文字列リテラル型を持つ変数を key にした要素アクセス**で取得すると、
`output-guard` が見逃す。

代表例は、

```ts
const key: "getBuiltinModule" = "getBuiltinModule";

export const f = (): void => {
  process[key]("node:console").log("x");
};
```

同じ構造で `report`、`emitWarning`、`dlopen`、`execve`、`stdin` 等にも到達できる。

これは M2-2-R4-002 の中心だった `process.getBuiltinModule(...)` の取得方法を変えただけであり、
ADR-0019 が保証するとしている「要素アクセスのキーでも検出」に含まれる。

### 根拠

element access 自身の検査は argument expression の symbol を見る。

```ts
if (ts.isElementAccessExpression(n)) {
  const keySym = resolved(
    checker,
    checker.getSymbolAtLocation(n.argumentExpression),
  );
  const what = terminalSymbol(keySym);
  if (what !== null) add(n, what, true);
  const member = processMember(keySym);
  if (member !== null) add(n, member);
}
```

`process["getBuiltinModule"]` のような literal では TypeScript checker が property symbol を返す形を
既存 fixture が確認している。

しかし、

```ts
const key: "getBuiltinModule" = "getBuiltinModule";
process[key]
```

では `n.argumentExpression` は local identifier `key`。
その symbol は `@types/node/process.d.ts` の `getBuiltinModule` declaration ではないため、
`processMember(keySym)` は null。

その後の holder rule は literal type の値を使って property symbol を解決する。

```ts
const key = literalKey(checker, parent.argumentExpression);
const prop =
  key === null
    ? undefined
    : checker
        .getNonNullableType(checker.getTypeAtLocation(n))
        .getProperty(key);
```

ここまでは `getBuiltinModule` propertyを正しく得る。

ところが判定は、

```ts
if (
  prop === undefined ||
  terminalSymbol(resolved(checker, prop)) !== null
)
  add(parent, `dynamic access to ${holder}`);
```

であり、`processMember(prop)` を確認していない。

`getBuiltinModule` は `stdout` / `stderr` ではないので `terminalSymbol()` は null。
よってこの branch も通過する。

既存の GET_BUILTIN fixture には、

- direct property
- module name variable
- built module name
- alias
- destructuring
- literal element access
- globalThis
- node:process import

はあるが、**property key 自体を literal-typed variable にした fixture は無い**。

自己検査も、6 member の declaration と直接 reference が報告されることは確認するが、この element-access variation を確認しない。

### 再現条件

**未実行（コード読解による）。**

fixture に次を追加する。

```ts
const key: "getBuiltinModule" = "getBuiltinModule";

export const f = (): void => {
  process[key]("node:console").log("x");
};
```

または、

```ts
const key = "report" as const;

export const f = (): string => {
  return process[key].writeReport("stdout");
};
```

期待:

- `outputViolations()` が `process.getBuiltinModule` または `process.report` 相当の違反を返す。

現行コードで予想される実際:

1. element access branch は local variable `key` の symbol を見るため `processMember` にならない。
2. holder branch は literal type から process property symbol を取得する。
3. しかし terminalSymbol しか確認しない。
4. dangerous `PROCESS_MEMBERS` でも違反にならない。

### 修正案

holder の element access branchで、取得済み `prop` に対して
`processMember(resolved(checker, prop))` も確認する。

単純には、

```ts
const resolvedProp = resolved(checker, prop);

if (
  prop === undefined ||
  terminalSymbol(resolvedProp) !== null ||
  processMember(resolvedProp) !== null
) {
  add(parent, `dynamic access to ${holder}`);
}
```

とする。

より診断を正確にするなら、`processMember(resolvedProp)` が非 null の場合は
その文字列 (`process.getBuiltinModule` 等) を `add()` する。

ただし holder には `globalThis` も含まれるため、
「その holder の literal key がたまたま同名」というだけで process member と誤判定しないことを fixture で確認する。
`processMember()` は declaration file を確認するので、その条件を保てばよい。

### 回帰テスト案

少なくとも次を追加する。

1. `const k: "getBuiltinModule" = "getBuiltinModule"; process[k](...)`
2. `const k = "getBuiltinModule" as const; globalThis.process[k](...)`
3. `const k = "report" as const; process[k].writeReport(...)`
4. `const k = "emitWarning" as const; process[k](...)`
5. `const k = "platform" as const; process[k]` は control として違反にしない
6. 同名 property を持つ普通の object の `obj[k]` は違反にしない

修正前は少なくとも 1〜4 が FAIL し、修正後に報告されることを固定する。

---

## 4. Request「特に見てほしい点」1〜6 の確認結果

### 1. M2-2-R4-002 の解消

**部分的に解消。**

確認できた主要形:

- `process.getBuiltinModule("node:console")`
- module名を引数変数にする
- module名を式で組み立てる
- propertyの別名
- object destructuring
- literal element access
- `globalThis.process`
- `globalThis` destructuring経由
- `node:process` named import

は、今回の `processMember()` と既存 holder rule / module allowlist の組み合わせで違反になる。

ただし property key を literal-typed variableにする element access が残る。

→ **M2-2-BUILTIN-R1-001**

したがって完全な「解消」ではない。

---

### 2. 洗い出しの網羅性

#### `process` の他メンバー

今回指定された、

- getBuiltinModule
- dlopen
- report
- emitWarning
- execve
- stdin

は `PROCESS_MEMBERS` にあり、通常の property referenceでは declaration ベースで検出する。

未宣言の、

- binding
- _linkedBinding
- _rawDebug

も future用に名前が一覧にあり、現在はそれらを使うための cast 自体を既存 rule が違反にする設計。

ただし上記 literal-typed key の抜けがある。

#### package.json の `imports` (`#x`)

`moduleProblem()` では `#x` は、

- builtinではない
- relative / absoluteではない
- runtime package名にも一致しない

ため `a package that is not a runtime dependency` として拒否される。

現在の policy が「package.json imports mapping を許す」ではなく、
runtime destination を approved builtin / src / dependency の直接指定へ絞るものなので、fail-closed として整合する。

#### パスの別名

現行 `tsconfig.json` には `baseUrl` / `paths` は無い。

一般の bare specifierで dependency名でない alias は runtime dependency check で拒否される。

TypeScript `paths` の任意の将来設定まで含めた runtime resolution policy は今回の packetからは独立に保証できないが、
**現行設定で source が path alias を利用する経路は確認できない**。

#### `.d.ts` だけがある JS file

relative / absolute specifierは、resolverの targetが、

- `ts.SourceFile`
- `!target.isDeclarationFile`
- repository-relativeで `src/` 配下

を全て満たさないと拒否する。

したがって `.d.ts` だけに解決される moduleは拒否される。

#### `export * from`

`export * from "..."` は `ts.ExportDeclaration` であり、

```ts
ts.isExportDeclaration(n) &&
!n.isTypeOnly &&
n.moduleSpecifier !== undefined
```

に入るため module allowlist の対象。

`export type ... from` は runtime loadではないので除外する。

この観点では、M2-2-BUILTIN-R1-001 以外の新しい具体的 bypass は確認しなかった。

---

### 3. 宣言での判定の前提

**現在固定されている6メンバーについては確認したが問題なし。**

`processMember()` は単に名前を見るのではなく、

```ts
/[\\/]@types[\\/]node[\\/]process\.d\.ts$/
```

に declaration があることを要求する。

これにより、ユーザーコードの同名 property を誤って `process` member と扱うことを避けている。

回帰 test は6メンバーを1回ずつ referenceした synthetic sourceから process typeを取り、

```ts
type.getProperty(name)?.declarations
```

が現在の `process.d.ts` にあることを全6件確認する。

さらに、

- その6件が `PROCESS_MEMBERS` に存在
- 各referenceがguardに報告される

ことまで確認する。

よって現在の `@types/node` layoutに対して rule が黙って無効になる問題は検出できる。

`binding` / `_linkedBinding` / `_rawDebug` は現在宣言されておらず6件の自己検査対象ではない。
これは docs にも現在の前提として明記されている。
将来 declaration が追加された場合の完全な future-proofingまでは今回の testは保証しないが、現行コードの不具合としては指摘しない。

---

### 4. 対照の妥当性

**確認したが、M2-2-BUILTIN-R1-001 以外に問題なし。**

#### 許可済みbuiltin 6つ

control が実際の src と同種のAPI利用を行い、違反0を要求している。

#### `import type`

`importClause.isTypeOnly === true` は moduleProblem を通さない。
runtime loadが無いため妥当。

#### `import { type X }`

`ImportDeclaration` 自体の `importClause.isTypeOnly` は false なので moduleProblem を通す。

`verbatimModuleSyntax` の現在設定では inline type specifierだけでも module declarationが runtime importの形を残し得るため、
単純な `import type` と同じ扱いにしない方針は docs と一致する。

#### process の通常利用

`exitCode`、`on`、signal 0 の `kill`、platform / pid / execPath / env は controlとして許可される。

SIGUSR1自己送信等はADR-0019の既知限界として明示され、今回範囲外。

#### dependencies 3つ

`commander` / `jsonc-parser` / `zod` が runtime dependencyとして許可される。

#### src relative import

type checkerが解決した target source fileが `src/` 配下・non-declarationであることを確認するので controlは許可される。

#### type位置

`typeof process.getBuiltinModule` / `typeof process.report` は runtime referenceでないため除外。
`inTypePosition()` と controlの意図は一致する。

#### allowlisted dynamic import

literal `import("node:fs")` は allowlist内なので許可。

computed dynamic importは従来ruleで違反。

#### import.meta.resolve

moduleを実際にloadする操作ではなく、controlとして許可される。
取得結果を computed `import()` 等へ渡せば別ruleが違反にする。

---

### 5. 既知の限界の文

**今回確認した範囲では、M2-2-BUILTIN-R1-001 による未記載の実装差を除き、列挙された限界は過度な保証にはなっていない。**

ADR-0019 は、guardが扱わないものとして、

- runtimeで組み立てた fs device path
- 自身への SIGUSR1
- callback内の uncaught exception
- dependency package内部の出力
- child processが自力でterminalを開く
- network

を明示する。

特に、

- dependency package自体はallowlistできても内部sourceはscanしない
- child_processのruleは渡すstdioだけ
- builtinsをrestrictしてもglobal fetch等までは禁止しない

と保証範囲を狭く書いている。

ただし ADR の「processの6メンバーは要素アクセスのキーでも検出」という保証は
literal-typed variable key では成立しない。

これは既知限界として明記されていないので、同じ **M2-2-BUILTIN-R1-001** の docs不一致も含む。

---

### 6. docs とコードの一致

**大部分は一致するが、1点不一致あり。**

一致を確認した主な項目:

- BUILTIN_ALLOWEDは6件
- runtime dependencyはpackage.jsonの`dependencies`
- relative moduleはsrc source / non-declarationへ解決する必要がある
- import type除外、inline type importはチェック
- export declarationとliteral dynamic importをチェック
- process 6 memberをdeclarationベースで判定
- allowlist変更時の自己検査
- srcは今回変更していない
- ADRの既知限界
- ROADMAP backlog 1をresolvedのまま残し、20を追加する構成

不一致:

ADR-0019:32-33 は、

> 別名、分割代入、要素アクセスのキー、globalThis.process、node:process の import のどれでも

検出するとしている。

しかし literal-typed variableをkeyにしたelement accessは現コードで抜ける。

→ **M2-2-BUILTIN-R1-001**

---

## 5. 未確認の範囲

パケットに無い範囲、またはRequestで明示的に範囲外とされたものについては断定しない。

### 5.1 `src/` の機能内容

今回 `src/` は変更されておらず、Requestでも内容自体は範囲外。

回帰testが `src/` にguard違反が0であること、および `BUILTIN_ALLOWED` が現行srcのnode builtin import集合と一致することは確認するが、
各product moduleの機能的安全性を今回再レビューしたわけではない。

### 5.2 ADR-0019 の既知限界として明示された経路

以下はRequestに従い新規指摘対象外。

- runtimeで組み立てたfs device path
- self SIGUSR1
- dependency内部の出力
- childが自力でterminalを開く
- network

### 5.3 callback内の未処理例外

ROADMAP backlog 20として今回修正対象外。

### 5.4 ROADMAP backlog 2〜19

今回対象外。

### 5.5 Windows / verify・test時間 / 過去記録の表現

Requestにより対象外。

---

## 6. 新規指摘件数

| 重要度 | 件数 |
|---|---:|
| High | 0 |
| Medium | 1 |
| Low | 0 |

**合計: 1件**

---

## 7. 結論

- **M2-2-R4-002: 部分的に解消**
- **新規 High: 0**
- **新規 Medium: 1**
- **新規 Low: 0**

主要な `process.getBuiltinModule` 取得形と runtime module allowlist は大幅に強化されているが、
literal-typed variableをkeyにした `process[key]` で `PROCESS_MEMBERS` を取得する形が残るため、
M2-2-R4-002を完全解消とは判定しない。
