<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-builtin-r2-for-claude.md、ChatGPT、2026-09-30 受領、21,136 バイト、対象範囲 v0.5.17..v0.5.18）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: e36e3e126cfb78aa7fb0fb13bc840fae2a316e8903ddfd53489591c76f5b81be
-->

# independent review — M2-2 BUILTIN R2

## 1. 結論

対象範囲 `v0.5.17..v0.5.18` について、Request、Previous Reviews、変更 diff、変更後の
`tests/structure/output-guard.ts`、新規回帰テスト
`tests/regression-m2-2-builtin-r1-001-literal-typed-key.test.ts`、
およびパケットに全文が載っている ADR-0019、ARCHITECTURE、
`response-builtin-r1.md`、既存 r4-002 回帰テスト、`tests/structure/typescript.ts`
を独立に確認した。

前回指摘 **M2-2-BUILTIN-R1-001 は「解消」**と判断する。

前回の具体的な問題だった、

```ts
const key: "getBuiltinModule" = "getBuiltinModule";
process[key]
```

のように、**キー式自身は process の宣言へ解決しないが、キーの型が危険メンバー1個に決まる形**は、
今回の修正で `processMember()` まで到達し、`process.getBuiltinModule` 等の名前で違反になる。

一方、独立確認では新たに **High 1件**を確認した。

今回の新しい規則は「キー式の TypeScript 上の型が1つの安全な文字列リテラルなら、その安全なプロパティを読む」と信頼する。
しかし TypeScript の型注釈・型アサーション・`any` 等は実行時値と一致する保証がない。
そのため、**実行時のキーは `getBuiltinModule` なのに、型だけを `"platform"` と見せると、
guard は `process.platform` と判断して要素アクセスを許可する**。

その取得値を通常の関数型へ型付けし直す形も、現行 guard の別規則には当たらず、
`process.getBuiltinModule("node:console")` 相当へ実行時に到達できる。

これは今回の判断基準の

> High: 実際に出力の出口を迂回できる

に該当すると判断する。

### 新規指摘件数

| 重要度 | 件数 |
|---|---:|
| High | 1 |
| Medium | 0 |
| Low | 0 |

**合計: 1件**

---

# 2. M2-2-BUILTIN-R1-001 の判定と根拠

## 判定: 解消

### 対象

- `tests/structure/output-guard.ts:146-149`
- `tests/structure/output-guard.ts:256-270`
- `tests/regression-m2-2-builtin-r1-001-literal-typed-key.test.ts:26-50`
- `docs/adr/0019-builtin-allowlist-process-members.md:32-40`

### 根拠

前回 R1-001 では、holder の要素アクセス処理が、

```ts
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
```

となっており、キーの型から危険な process property が取れても
`processMember()` を確認していなかった。

v0.5.18 では、

```ts
const key = literalKey(checker, parent.argumentExpression);
const prop =
  key === null
    ? undefined
    : resolved(
        checker,
        checker
          .getNonNullableType(checker.getTypeAtLocation(n))
          .getProperty(key),
      );

const member = processMember(prop);

if (member !== null) add(parent, member);
else if (
  prop === undefined ||
  terminalSymbol(prop) !== null
)
  add(parent, `dynamic access to ${holder}`);
```

となった。

`literalKey()` は、

```ts
function literalKey(
  checker: ts.TypeChecker,
  e: ts.Expression,
): string | null {
  const t = checker.getTypeAtLocation(e);
  return t.isStringLiteral() ? t.value : null;
}
```

なので、

```ts
const key: "getBuiltinModule" = "getBuiltinModule";
process[key]
```

では、

1. `key` の型から `"getBuiltinModule"` を得る
2. holder の `Process` 型から `getBuiltinModule` property を得る
3. property symbol を `resolved()` する
4. `processMember()` が `@types/node/process.d.ts` の宣言を確認
5. `process.getBuiltinModule` として報告

となる。

新しい回帰テストでも、

- 型注釈 const
- `as const`
- inferred const
- literal 型の parameter
- readonly property
- tuple element
- template literal
- narrowed union
- `keyof` の narrowing
- `globalThis.process`
- `globalThis[p][key]`
- optional chain
- parenthesized / non-null
- `satisfies`
- `emitWarning`
- `dlopen`
- `execve`
- `stdin`
- `node:process` default import

を member 名で報告することを要求している。

`getBuiltinModule` 以外の5メンバーについても、実装は member ごとの特別処理ではなく、

```ts
processMember(prop)
```

という共通処理なので、同じ宣言条件を満たす限り同じ規則が適用される。

したがって **前回指摘そのものは解消**と判断する。

ただし、今回新たに導入・明確化された
「キーの型が安全な1文字列リテラルなら安全なproperty accessとして許す」
という判断には、下記 R2-001 が残る。

---

# 3. 特に見てほしい点 1〜6

## 1. M2-2-BUILTIN-R1-001 の解消

**結果: 前回指摘は解消。ただし新規 M2-2-BUILTIN-R2-001 あり。**

危険メンバー名そのものを1文字列リテラル型として持つ key は、
`processMember(prop)` によって member 名で報告される。

確認した主な形:

- `process[key]`
- `globalThis.process[key]`
- `globalThis[p][key]`
- `node:process` default import の `proc[key]`
- direct / alias / destructuring / named import は既存の declaration-based rule

`getBuiltinModule` 以外の、

- `dlopen`
- `report`
- `emitWarning`
- `execve`
- `stdin`

も `PROCESS_MEMBERS` + `processMember()` の同じ経路で処理される。

ただし、**TypeScript 上の key 型と実行時 key 値が食い違う形**では安全な property と誤認できる。

→ **M2-2-BUILTIN-R2-001**

---

## 2. キーの型が1つに決まらない形

**結果: この観点単体では問題なし。関連する別問題は R2-001。**

次のように key type が1つの string literal ではない場合、

- `"platform" | "getBuiltinModule"`
- `keyof typeof process`
- generic `K extends keyof NodeJS.Process`
- `string`
- `any`
- `never` 等、property が1個に確定しない型

`literalKey()` は `null` を返す。

holder branch では、

```ts
prop === undefined
```

となるため、

```ts
dynamic access to process
```

等の違反になる。

したがって「型が1つに決まらない key がそのまま危険メンバーへ届く」という
R1-001 と同じ種類の見逃しは確認しなかった。

`Reflect.get(process, key)`、
`Object.getOwnPropertyDescriptor(process, key)`、
`Object.entries(process)`、
計算プロパティの分割代入なども、
process holder を value として使う既存規則で違反になる。

ただし今回見つけた R2-001 は逆方向で、
**型が1つの安全な literal に決まっているように見えるが、
実行時値だけが危険メンバーになる**形である。

---

## 3. 報告文言の変更

**結果: 確認した範囲では問題なし。**

今回、

```text
dynamic access to process
```

だった一部の形が、

```text
process.getBuiltinModule
process.report
...
```

のような member 名で報告される。

この変更は、実際に TypeScript checker が得た process property declarationを
`processMember()` が確認できた場合だけである。

terminal property (`stdout` / `stderr`) は、

```ts
terminalSymbol(prop)
```

側の既存規則に残る。

key type が1つに決まらなければ、従来どおり、

```text
dynamic access to ...
```

になる。

また dedupe key が、

```ts
where + what + node.pos
```

なので、同じ node で同じ member 名を複数経路から追加する場合も同一報告はまとめられる。

今回の +6/-2 行によって、
既存の terminal / process-as-value の意味を弱める変更は確認しなかった。

---

## 4. 対照の妥当性

**結果: R2-001 を除けば問題なし。**

新しい controls は、

- `process["platform"]` 相当の safe member
- 同名 property を持つ普通の object
- type position
- `process.exitCode` assignment
- `globalThis["process"].platform`

を違反にしない。

普通の object については `processMember()` が property nameだけでなく、
宣言元が `@types/node/process.d.ts` かを確認するため、同名 property では違反にならない。

type position は `inTypePosition()` により process member rule から除外される。

一方、control の

```ts
const key = "platform" as const;
process[key];
```

を「安全」とみなす方針そのものが、
R2-001 の runtime/type mismatch を可能にする。

つまり c01 自体の普通の値は問題ないが、

> key の TypeScript 型が `"platform"` なら runtime も `"platform"` である

という保証にはならない。

---

## 5. 回帰テストの網羅性

**結果: 前回 R1-001 の直接再現には十分。ただし R2-001 の形が欠ける。**

39件は、前回指摘された
「key expression の symbol は process member declarationへ解決しないが、
key type なら1個の member 名が分かる」
という問題をかなり広く固定している。

特に、

- const / as const
- parameter
- readonly property
- tuple
- template literal
- narrowed union
- `keyof` narrowing
- globalThis
- optional chain
- satisfies
- 5つの他 process member
- default import
- non-single-literal key
- Reflect / descriptor / entries
- terminal controls
- safe property controls

が入っている。

「v0.5.17 で20件 FAIL」の内訳も、

- 本当に見逃していた18形
- 別規則では報告していたが member 名を出せなかった2形

という今回の変更目的と整合する。

しかし次の threat model は入っていない。

```ts
const runtimeKey = "getBuiltinModule";
const key = runtimeKey as "platform";
```

つまり、

> inferred / annotated type は safe literal だが、
> runtime value は別の property 名

という TypeScript の unsoundness を利用した key。

この欠落が **M2-2-BUILTIN-R2-001**。

---

## 6. docs とコードの一致

**結果: R2-001 に関して保証が強すぎる。**

ADR-0019:32-37 は、

> キーの式の型が1つの文字列リテラルに決まるときは、
> その property を member 名で判定する。
> key type が1つに決まらなければ dynamic access とする。

という設計を明記しており、
今回のコードそのものとは一致する。

ただし同じ ADR は、

> process の6つの member を使わない

という security guarantee として書かれている。

現行コードは **TypeScript の型と runtime property key が一致することを暗黙に信頼**しているため、
型だけ安全な literal へ偽装された key で runtime dangerous member へ到達できる。

したがって docs は実装のアルゴリズム説明としては合うが、
**実際の保証範囲を過大に見せる**。

ARCHITECTURE / response-builtin-r1 / CHANGELOG の
「キーの型で member が分かる形を塞いだ」という記録も、
前回 R1-001 の直接再現については正しい。

一方、「これで process 6 member の element access を塞いだ」と読むなら R2-001 が残る。

→ **M2-2-BUILTIN-R2-001**

---

# 4. 指摘一覧

## M2-2-BUILTIN-R2-001

- **重要度:** High
- **種別:** 構造ガード / 実行時迂回 / 型情報の過信 / 回帰テスト不足
- **対象:**
  - `tests/structure/output-guard.ts:146-149`
  - `tests/structure/output-guard.ts:256-270`
  - `tests/regression-m2-2-builtin-r1-001-literal-typed-key.test.ts:69-75`
  - `docs/adr/0019-builtin-allowlist-process-members.md:32-41`

### 内容

holder の要素アクセスを許可する判定が、
**runtime key ではなく TypeScript 上の key typeだけを信頼している**。

そのため runtime では危険メンバー名なのに、
TypeScript 上だけ安全な member (`"platform"` 等) と見せると、
`process[key]` / `globalThis.process[key]` が違反にならない。

その取得値を通常の call signature へ型付けし直せば、
`process.getBuiltinModule()` 相当へ実行時に到達できる。

これは構造ガードが守るべき端末出力経路を実際に迂回する。

### 根拠

安全 / 危険の判定は `literalKey()` に依存する。

```ts
function literalKey(
  checker: ts.TypeChecker,
  e: ts.Expression,
): string | null {
  const t = checker.getTypeAtLocation(e);
  return t.isStringLiteral() ? t.value : null;
}
```

holder の要素アクセスでは、

```ts
const key = literalKey(checker, parent.argumentExpression);

const prop =
  key === null
    ? undefined
    : resolved(
        checker,
        checker
          .getNonNullableType(checker.getTypeAtLocation(n))
          .getProperty(key),
      );

const member = processMember(prop);

if (member !== null) add(parent, member);
else if (
  prop === undefined ||
  terminalSymbol(prop) !== null
)
  add(parent, `dynamic access to ${holder}`);
```

となる。

例えば runtime 値が `"getBuiltinModule"` でも、
key の static type を `"platform"` にすれば、

```ts
literalKey(...) === "platform"
```

となる。

その結果、

```ts
prop === process.platform
member === null
terminalSymbol(prop) === null
```

で、違反が追加されない。

### 再現の形

最小 fixture の一例:

```ts
const raw = "getBuiltinModule";
const key = raw as "platform";

const load =
  process[key] as unknown as (name: string) => Console;

export const f = (): void => {
  load("node:console").log("x");
};
```

TypeScript checker から見ると、

```ts
process[key]
```

は `process.platform` (string) を読んでいる。

runtime では key value は `"getBuiltinModule"` のままなので、
実際には `process.getBuiltinModule` function を取得する。

その後の type assertion は **process holder 自体への cast ではなく、
取得済み値への cast**なので、現行 holder ruleには当たらない。

`safeForgeries()` が禁止するのも `Safe` brand の偽造だけであり、
この function type assertionは対象外。

### 実行確認

**実行済み。ただし完全な repository checkout ではなく、
パケットから抽出した current `output-guard.ts` / `typescript.ts`
を使った最小再現環境。**

確認したこと:

1. 上記と同型の fixture は TypeScript type error **0件**
2. パケット内の current guard の `outputViolations(...)` は **空配列**
3. `globalThis.process[key]` 版も **空配列**
4. Node runtime では runtime key `"getBuiltinModule"` により
   `process.getBuiltinModule` function を取得でき、
   `node:console` の出力関数へ到達できる

環境は完全な aiqh checkout / 正式な全テスト実行ではないため、
リポジトリ全体での再現は未実行。

ただし bypass の原因は packet の current branch:

```ts
literalKey(checker, keyExpression)
```

を runtime value proof として扱っていることそのものなので、
コード読解上も同じ結果になる。

### なぜ High か

今回の判断基準は、

> High: 実際に出力の出口を迂回できる

である。

この形は単なる docs の曖昧さではなく、

- guard: 0 violation
- runtime: `getBuiltinModule("node:console")` 相当へ到達

という実際の guard bypass になるため High と判断する。

### 修正案

最も安全で単純なのは、
**process / globalThis / node:process holder の element accessについて、
key expression が構文上の literal でない限り dynamic access として違反にする**
方針へ戻すこと。

例えば許可対象を、

```ts
process["platform"]
process[`platform`]
```

のように runtime value が source text 上で確定する形だけにする。

危険 literal:

```ts
process["getBuiltinModule"]
```

は従来どおり `process.getBuiltinModule` として報告する。

一方、

```ts
const key = "platform" as const;
process[key]
```

は、TypeScript 型が `"platform"` でも
runtime 値の完全性を型だけでは保証できないため、

```text
dynamic access to process
```

とする。

この場合、現在の control `c01_platform` / `c05` や ADR の許容範囲は更新が必要。

### より精密に許可したい場合

const / readonly property / parameter 等を安全として残したい場合は、
単なる TypeScript typeでは不十分。

少なくとも、

- initializer が実 literal
- 書き換え無し
- `as` / angle-bracket assertion無し
- `any` / `unknown` 由来でない
- function parameter / external input でない
- getter / call result / JSON.parse 等でない
- property / tuple なら provenance を再帰的に確認

といった **value provenance analysis** が必要。

特に、

```ts
const key: "platform" =
  JSON.parse(...);
```

のように assertion を使わず `any` から safe literal typeへ入る形もあるため、
「key expressionの `as` だけ禁止」では不十分。

防御ツールとしては、
非literal element accessを fail closedにする方が単純で堅牢。

### 回帰テスト案

少なくとも次を追加する。

#### 1. type assertion で safe literal に偽装

```ts
const raw = "getBuiltinModule";
const key = raw as "platform";
const load =
  process[key] as unknown as (name: string) => Console;
```

→ 違反必須。

#### 2. `any` から safe literal annotation

```ts
const raw: any = "getBuiltinModule";
const key: "platform" = raw;
```

→ 違反必須。

#### 3. parameter の runtime provenance が保証されない

```ts
function f(key: "platform") {
  return process[key];
}
```

を許可し続けるなら、
caller が `any` / assertion から渡す形を含め、
本当に安全と証明できる規則が必要。

証明できないなら `process[key]` 自体を dynamic violation にする。

#### 4. 対照

構文 literal:

```ts
process["platform"]
```

→ 許可。

構文 literal dangerous:

```ts
process["getBuiltinModule"]
```

→ `process.getBuiltinModule`。

plain object:

```ts
obj[key]
```

→ process rule の対象外。

---

# 5. 良い点

- 前回 R1-001 の直接原因へ対する変更は小さく、既存 holder branchへ `processMember()` を追加する形に収まっている
- 危険 member 名の報告が `dynamic access` より具体的になり、レビュー時に原因を追いやすい
- 回帰 test は const / parameter / readonly / tuple / template / narrowing / globalThis / optional chain 等を広く含む
- `processMember()` は名前だけでなく `@types/node/process.d.ts` の宣言元を確認するため、普通の object の同名 property を誤検出しにくい
- key type が union / generic / `keyof` 等で一意でなければ fail closed (`dynamic access`) にする設計自体は安全側
- `src/` 実物への違反0を regression に含め、guard 強化が現行 production source を壊さないことを確認している

---

# 6. 未確認の範囲

Request の指定に従い、次は今回の新規指摘対象にしていない、または独立確認していない。

## 6.1 Request で既知の範囲外とされたもの

- ROADMAP backlog 1〜20
- ADR-0019 の既知の限界
  - runtime生成 fs path
  - self SIGUSR1
  - dependency内部の出力
  - childが自分でterminalを開くこと
  - network
- 前回レビューの未確認範囲 5.1〜5.5
- `src/` の機能内容
- 参考資料のうち今回変更と無関係な部分
- 過去記録の言い回し
- Windows
- verify / test の所要時間

## 6.2 完全 checkout での独立 test suite 実行

パケット記載の Verification は PASS しているが、
その PASS 自体を correctness の根拠にはしていない。

今回、完全な aiqh checkout で

```text
npm test
npm run verify
```

等を独立再実行したわけではない。

R2-001 については packet source を抽出した最小 TypeScript programで
guard result と runtime reachabilityを確認した。

## 6.3 実装側の「31形 / 18見逃し / 20 FAIL」の実測値

fixture / table / test sourceとの整合は確認したが、
v0.5.17 worktreeを再構築して同じ31形を全件再実行したわけではない。

---

# 7. 最終まとめ

- **M2-2-BUILTIN-R1-001: 解消**
- **新規 High: 1**
- **新規 Medium: 0**
- **新規 Low: 0**

今回の修正は前回の literal-typed dangerous key の見逃しを正しく直している。

ただしその修正が前提にする、

> TypeScript 上の literal type = runtime property key

という仮定は、TypeScript の assertion / `any` 等では成立しない。

このため、安全な literal type を装った runtime dangerous key で
`process.getBuiltinModule` 等へ到達でき、現行 output guard は違反0になり得る。

したがって、今回の版を
「process の危険メンバーへの element access を塞いだ」
という最終状態にはしない方がよい。
