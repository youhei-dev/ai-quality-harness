<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r7-for-claude.md、ChatGPT、2026-09-27 受領、23,055 バイト、対象範囲 v0.5.9..v0.5.10）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 70f6de9a78353f2e3011a6567862d2a90fcdfba0ba638560ca9a16cf67f6a8e1
-->

# independent review — M2-2 R7

## 1. 総評

v0.5.9..v0.5.10 の変更について、Request の「特に見てほしい点」1〜8、`src/output.ts`、新規回帰テスト、既存 R3-002 回帰テスト、ADR-0018 / ADR-0017 / ARCHITECTURE の該当箇所を独立に確認した。

前回指摘 **M2-2-R4-001 は「解消」**と判断する。v0.5.9 の直接原因だった「写しに callable な `toJSON` 等が残り、`JSON.stringify()` が利用者由来コードを呼んで未処理の値を出す」経路は、JSON data 以外を拒否し、descriptor の値から plain array / null-prototype object の新しい写しを作る方式によって閉じている。回帰テストも、前回指摘の `toJSON` 系と追加で洗い出した callback 形を修正前に失敗する形で直接検証している。

一方、独立確認では **High 0件 / Medium 3件 / Low 0件** の新規指摘がある。いずれも元の `toJSON` 出力漏れそのものではないが、今回新設した「JSON data だけを受け付ける」「Proxy の `get` は使わず descriptor を1回だけ読む」「拒否メッセージは種類だけ」という新しい契約に対する不足である。

レビュー用パケットは完全な repository checkout ではないため、フルテストスイート自体は独立再実行していない。M2-2-R7-001 / 002 については、同じ JavaScript reflective operations を使う Node.js 最小再現で挙動を確認した。M2-2-R7-003 の aiqh 本体経路は未実行で、コード読解による。

---

## 2. 前回指摘の解消状況

### M2-2-R4-001 — 解消

**対象**
- `src/output.ts:61-127`
- `tests/regression-m2-2-r4-001-json-data.test.ts:24-227`

### 根拠

前回指摘の本質は、v0.5.9 の `jsonSafe()` が非 JSON data を写しに残し、`JSON.stringify()` がその中の callable `toJSON` を実行できたことだった。

v0.5.10 では primitive を明示的に限定し、

```ts
if (value === null || typeof value === "boolean") return value;
if (typeof value === "string") ...
if (typeof value === "number") {
  if (!Number.isFinite(value)) throw ...
  return value;
}
if (typeof value !== "object") throw ...
```

として、function / symbol / bigint / undefined 等を写しへ残さない。

object / array は prototype と own properties を検査したうえで、新しい container へ再帰的に写す。

```ts
const out: unknown[] = [];
...
const out = Object.create(null) as Record<string, unknown>;
```

object の値は `Object.getOwnPropertyDescriptor()` の data descriptor から取得し、accessor は拒否する。

```ts
const d = Object.getOwnPropertyDescriptor(o, key);
if (d === undefined) ...
if (!("value" in d)) ...
if (d.enumerable !== true) ...
return d.value;
```

したがって通常の object について、getter / `toJSON` を呼ばず、写しへ function 等を残さない。

また object の写しは null prototype なので、入力の `"toJSON"` という文字列キーに JSON data が入っていても method hook にはならない。array の写しも新規 plain array で、入力側の subclass / replaced species は写しに引き継がれない。

新しい回帰テストは少なくとも、

- own `toJSON` function
- enumerable getter returning `toJSON`
- null-prototype object の callable `toJSON`
- `toJSON` を持つ function / class
- getter returning such a function
- Array subclass
- replaced `Symbol.species`
- Proxy が見せる `toJSON`
- Proxy array element
- callable Proxy
- function / symbol / bigint / undefined
- `Date` / `Map` / `Set` / `Buffer` / `Uint8Array` 等
- cycle / depth

を top-level / object property / array element / nested position、両 line mode で確認している。

前回の「`JSON.stringify()` が写しの callable value を呼び、未処理値を出す」という直接経路は閉じているため、**M2-2-R4-001 自体は解消**と判断する。

以下の3件は、今回追加された JSON-data validator の別問題として新規指摘する。

---

## 3. 新しい指摘

### ID: M2-2-R7-001

- **重大度:** Medium
- **対象:**
  - `src/output.ts:96-104`
  - `tests/regression-m2-2-r4-001-json-data.test.ts:108-129`
  - `docs/adr/0018-safejson-json-data-only.md:31-33`
  - `docs/adr/0018-safejson-json-data-only.md:48-50`

### 内容

array の `length` だけは descriptor ではなく、

```ts
const length = value.length;
```

で読んでいるため、**Proxy array の `get` trap を実行する**。

これは今回の設計契約である、

- 「各プロパティを記述子で1回だけ読む」
- 「getter / `toJSON` を呼ばない」
- ADR の「`get` trap は使わない」

と一致しない。

`length` の `get` trap は arbitrary JavaScript を実行できるので、`safeJson()` が JSON data を検査するだけのつもりでも利用者側 callback が走る。元の M2-2-R4-001 のように `JSON.stringify()` 後に未処理値が出る問題ではないが、今回採用した「callback を呼ばずに snapshot を作る」という防御境界を破っている。

### 根拠

array branch:

```ts
if (Array.isArray(value)) {
  if (proto !== Array.prototype) throw ...
  const length = value.length;
  if (keys.length !== length + 1) throw ...
  ...
}
```

一方、ADR-0018 は次の方式を採用している。

```text
各プロパティを記述子（Object.getOwnPropertyDescriptor）で1回だけ読み、検査してから写す。
getter と toJSON を呼ばず、map() を使わない。
```

既知の限界でも、

```text
get のトラップは使わないので、get と記述子が食い違う Proxy では、記述子が見せるデータが出る
```

としている。

しかし Proxy array の `length` は実際に `get` trap を通る。

既存回帰テスト `tests/regression-m2-2-r4-001-json-data.test.ts:108-129` は、Proxy の element `"0"` について `get` と descriptor が違う場合を確認しているが、`length` の `get` trap は確認していない。

### 再現条件

**aiqh 本体では未実行。Node.js 最小再現で確認済み。**

1. plain array `[1]` を Proxy で包む。
2. `get` trap で key が `"length"` のとき counter を増やして通常 length を返す。
3. `safeJson()` 相当の現行 array branch を通す。
4. array 自体は通常の `[1]` として受理される。
5. しかし validation 中に `get("length")` が1回呼ばれる。

期待:
- `length` も own data descriptor から読み、Proxy の `get` trap を呼ばない。

実際:
- `value.length` が `get` trap を実行する。

### 修正案

array の `length` も descriptor から取得する専用処理にする。

`length` は通常の array element と異なり non-enumerable なので `ownDataValue()` をそのまま使わず、

- own descriptor が存在
- data descriptor
- value が有効な array length
- descriptor が array の標準 `length` として期待する属性

を確認する専用 helper を作る。

以後の validation では `value.length` を直接読まない。

### 回帰テスト案

Proxy array の `get` trap で `length` を読まれたら counter を増やす、または例外を投げる fixture を追加する。

- descriptor は通常の array data を返す
- `safeJson()` が成功する
- `get` trap の呼出回数が0

を要求する。

修正前コードでは FAIL する。

---

### ID: M2-2-R7-002

- **重大度:** Medium
- **対象:**
  - `src/output.ts:97-105`
  - `tests/regression-m2-2-r4-001-json-data.test.ts:143-177`
  - `docs/adr/0018-safejson-json-data-only.md:25-26`
  - `docs/adr/0018-safejson-json-data-only.md:48-50`

### 内容

array の own keys を **「個数」しか検査しておらず、`keys` の内容そのものを検査していない**。

そのため Proxy array が、

- `ownKeys()` では `length` と symbol / non-index key を見せる
- `getOwnPropertyDescriptor("0")` では index `"0"` の data descriptor を見せる

という食い違う view を返すと、`keys.length === length + 1` を満たしたまま、**symbol key / non-index key を持つと見せている array が JSON data として受理される**。

Request は「Proxy のトラップが矛盾した答えを返したとき、安全側に倒れるか」を明示的に確認対象としている。このケースでは fail closed にならない。

### 根拠

現行 array validation:

```ts
const keys = Reflect.ownKeys(value);
...
const length = value.length;
if (keys.length !== length + 1)
  throw notJsonData("an array with a hole or a key that is not an index");

const out: unknown[] = [];
for (let i = 0; i < length; i++)
  out.push(
    jsonSafe(
      ownDataValue(value, String(i), "an array with a hole"),
      mode,
      ancestors,
    ),
  );
```

ここでは `keys` に実際に、

```text
"0", "1", ..., String(length - 1), "length"
```

だけが入っていることを確認していない。

ADR-0018 の定義は、

```text
自分のキーは 0〜length-1 の添字と length だけ
（穴・添字でないキー・symbol のキーは拒否）
```

であり、現コードは Proxy の場合この定義を満たさない値を受理できる。

### 再現条件

**aiqh 本体では未実行。Node.js 最小再現で確認済み。**

length 1 の array を Proxy で包み、概念的に次の view を返す。

- `Array.isArray(proxy) === true`
- prototype は `Array.prototype`
- `ownKeys()` → `["length", Symbol(...)]`
- `length` → `1`
- `getOwnPropertyDescriptor("0")` → enumerable data property `1`

Node.js 上でこの Proxy shape 自体が成立することを確認した。

現行ロジックでは、

- `keys.length === 2`
- `length + 1 === 2`
- loop は `"0"` の descriptor を取得可能

なので `[1]` の copy を作り、入力を受理する。

期待:
- `ownKeys()` に symbol / non-index key が見えた時点で拒否。
- さらに `"0".."length-1"` と `"length"` の集合と完全一致しなければ拒否。

実際:
- key の個数だけが合えば受理し得る。

### 修正案

array branch で `Reflect.ownKeys()` の集合を明示的に検査する。

少なくとも、

- symbol key が1つでもあれば拒否
- `"length"` が正確に1つ存在
- その他は canonical index string のみ
- index 集合が `0..length-1` と完全一致
- 各 index descriptor は enumerable data property
- `length` descriptor は専用規則で検証

を確認する。

Proxy trap 間の食い違いをより厳しく扱うなら、`ownKeys()` に出なかった index を descriptor trap が後から見せても拒否できるよう、**descriptor を読む対象は ownKeys で得た exact set と一致させる**。

### 回帰テスト案

少なくとも次の Proxy array fixture を追加する。

1. `ownKeys()` が `["length", Symbol(...)]`、descriptor trap は `"0"` を見せる。
2. `ownKeys()` が `["length", "extra"]`、descriptor trap は `"0"` を見せる。
3. `ownKeys()` が index を欠く一方、descriptor trap は欠けた index を後から見せる。

すべて `JSON output refused: ... is not JSON data` で拒否されることを確認する。

修正前コードでは FAIL する。

---

### ID: M2-2-R7-003

- **重大度:** Medium
- **対象:**
  - `src/output.ts:61-72`
  - `src/output.ts:96-114`
  - `tests/regression-m2-2-r4-001-json-data.test.ts:24-40`
  - `docs/adr/0018-safejson-json-data-only.md:34-35`

### 内容

Proxy の reflective trap 自体が例外を投げた場合、その例外を `notJsonData()` の固定メッセージへ変換せず、そのまま外へ伝播する。

そのため、今回の要求である

```text
拒否のメッセージには種類だけを載せ、キー・値・パスは載せない
```

を、Proxy failure path では保証できない。

例えば `getPrototypeOf` / `ownKeys` / `getOwnPropertyDescriptor` trap が利用者由来文字列を含む `Error` を投げると、`safeJson()` はその message をそのまま投げる。

terminal に至る CLI の最上位境界では既存の `writeError()` が禁止文字表記・秘密形状maskを行うため、今回確認した範囲ではこれを High の「生の秘密・禁止文字が端末へ出る」問題とは判定しない。ただし、**「種類だけの固定拒否メッセージ」という Request / ADR の契約には違反**する。

### 根拠

以下はすべて Proxy trap を実行し得るが、try/catch で標準拒否へ変換していない。

```ts
const d = Object.getOwnPropertyDescriptor(o, key);
...
const proto: unknown = Object.getPrototypeOf(value);
const keys = Reflect.ownKeys(value);
```

`notJsonData()` は validator 自身が検出したケースでしか使われない。

新規 `expectRefused()` は、

```ts
expect(...).toThrow(/^JSON output refused: .+ is not JSON data$/);
```

を要求しているが、fixture は validator 自身が拒否する値だけで、**trap が投げる例外**を含まない。

ADR-0018 は、

```text
拒否は JSON output refused: <種類> is not JSON data の例外。
種類は固定の語で、キー・値・パスは載せない。
```

としている。

### 再現条件

**未実行（コード読解による）。**

1. plain object を Proxy で包む。
2. `getPrototypeOf()` trap で、利用者由来 marker を message に含む `Error` を throw する。
3. `safeJson(proxy)` を呼ぶ。

期待:
- fail closed。
- 例外は `JSON output refused: <固定の種類> is not JSON data` の形。
- marker は message に含まれない。

実際:
- `Object.getPrototypeOf(value)` の例外がそのまま伝播するため、trap の message がそのまま `safeJson()` の例外 message になる。

同じことは `ownKeys` / `getOwnPropertyDescriptor` trap でも起こり得る。

### 修正案

Proxy trap が関わる reflective operations を小さな helper で包み、

- `Object.getPrototypeOf`
- `Reflect.ownKeys`
- `Object.getOwnPropertyDescriptor`
- array length descriptor の取得

が例外を投げた場合、元エラーの message を再利用せず、

```text
JSON output refused: an object whose structure could not be inspected is not JSON data
```

のような固定種類へ変換する。

validator 自身の既存 `notJsonData()` はそのまま保持する。

### 回帰テスト案

それぞれの trap が利用者由来 marker を含む Error を throw する Proxy fixture を追加する。

- `getPrototypeOf`
- `ownKeys`
- `getOwnPropertyDescriptor`

について、

- safeJson が拒否する
- error message が標準の `JSON output refused: ... is not JSON data`
- marker を含まない
- `createOutput(...).json()` が writer を一度も呼ばない

ことを確認する。

---

## 4. Request「特に見てほしい点」1〜8 の確認結果

### 1. JSON のデータでない値が拒否されず写しに入る経路

primitive / ordinary object / ordinary array については、今回の validator でかなり明確に閉じている。

確認した内容:

- function / symbol / bigint / undefined は `typeof !== "object"` で拒否
- 非有限数を拒否
- class instance、Date、Map、Set、RegExp、Error、Buffer、typed array 等は prototype で拒否
- ordinary object は symbol key / accessor / non-enumerable property を拒否
- ordinary array は hole / extra own key を key count と index descriptor で拒否
- `toJSON` という名前自体は、値が JSON data なら null-prototype copy の普通のキーになる

ただし Proxy array では key **集合**ではなく key **数**だけを確認するため、symbol / non-index key を見せながら受理される経路がある。

→ **M2-2-R7-002**

---

### 2. 1 回の読み取りの保証 / Proxy の矛盾

ordinary object の各値は `Object.getOwnPropertyDescriptor()` の返した `value` をそのまま再帰処理し、後から `value[key]` を再読していない。この点は正しい。

新規回帰テストの「descriptor は `"ok"`、`get` は function を返す」Proxy も、descriptor 側だけが出力されることを確認している。

ただし array の `length` は descriptor ではなく `value.length` であり、Proxy `get` trap が実行される。

→ **M2-2-R7-001**

また `ownKeys()` と descriptor trap が矛盾する array について exact key set を照合しない。

→ **M2-2-R7-002**

trap 自体が throw する場合の固定 refusal message も担保していない。

→ **M2-2-R7-003**

---

### 3. 写しと `JSON.stringify()`

前回の問題に対する中心修正は正しい。

ordinary object copy は `Object.create(null)`、array copy は新しい plain array で、入力側の own `toJSON`、class / function、Array subclass、replaced species 等を写しへ引き継がない。

再帰処理で function / accessor 等を拒否するため、今回の threat model（同一processでの prototype pollution は範囲外）では、**写し自身の user-controlled callable `toJSON` が `JSON.stringify()` に呼ばれる経路は見つけなかった**。

M2-2-R4-001 はこの点で解消。

---

### 4. 循環参照と深さ

祖先列方式は、現在の構造では正しい。

```ts
if (ancestors.includes(value)) ...
ancestors.push(value);
...
ancestors.pop();
```

なので、現在の再帰 path 上に同じ object がある cycle は拒否する一方、兄弟 branch から同じ object を共有しているだけなら、最初の branch 終了時に pop され、2回目も通常どおり写される。

例外時に `ancestors.pop()` が実行されない点は確認したが、その例外は `safeJson()` 全体から外へ伝播し、その同じ `ancestors` array を使って処理を継続する recovery path はない。したがって現在のコードでは別の誤判定へはつながらない。

深さ100の boundaryについて、MAX 未満の control と MAX+1 の拒否 test がある。

この項目で新規指摘はない。

---

### 5. 失敗の形

validator 自身が認識した non-JSON case では、`notJsonData()` が固定の種類だけを出し、key / value / path は載せない。

また `createOutput().json()` は `safeJson()` の返り値が完成してから sink を呼ぶため、validation 途中で失敗した場合 JSON document の部分書き込みは起きない。

一方、Proxy reflective trap が throw した場合は固定 refusal へ変換されない。

→ **M2-2-R7-003**

CLI exit 2 については、今回変更された `safeJson()` 自身に exit code 処理はなく、既存最上位 unexpected-error handling に依存する。パケット上のコードと既存設計からその経路は整合しているが、新規 regression は safeJson / createOutput 直接呼び出し中心であり、non-JSON rejection を CLI end-to-end で発生させる test は確認できなかった。現在の各 command の `--json` が JSON data のみという前提では実 CLI 入力だけでこの拒否を作りにくいため、これ単独は新規指摘にはしない。

review-packet について ADR-0018 は、packet を書いた後の terminal JSON rejection なら packet は既に存在したまま exit 2 になる、と明記している。現在値では rejection が起きないという前提である。

---

### 6. 通常の出力の不変

JSON data の control では v0.5.9 相当の `safeJson` を test 内で再構築し、両 line mode で byte-for-byte equality を確認している。

control に、

- string / finite number
- `-0`
- boolean / null
- array / object
- null-prototype object
- `"__proto__"` / `"constructor"` / `"prototype"` / `"toJSON"` の文字列キー
- shared reference
- depth limit 内の nested data

が入っている。

`-0` は従来どおり JSON text では `0`。

今回の変更で ordinary JSON data の出力差は見つけなかった。

---

### 7. 回帰テスト

M2-2-R4-001 の直接再現に対する test は強い。

v0.5.9 の callback forms を複数列挙し、top-level / nested positions / both modes で拒否する。修正前の `Object.entries` / `map` ベースでは、少なくとも複数の callback form が未処理で出るため FAIL し、修正後に PASS する構造になっている。

`expectRefused()` は、

- 標準 refusal message
- forbidden marker / secret / key marker が message に入らない
- `createOutput().json()` の sink が0回

を確認する。

ただし今回独立確認で見つけた、

- Proxy array の `length` get trap
- ownKeys の exact set と descriptor の矛盾
- reflective trap 自体の throw

は fixture にない。

→ **M2-2-R7-001〜003**

R3-002 の既存 control から `endLine: undefined` を外した変更は、今回「undefined は JSON data ではなく拒否」という新仕様に合わせるために必要であり、R3-002 の本来の「JSON key の escape / mask」と command JSON の identifier key 検証を弱める変更とは判断しない。

---

### 8. docs とコードの一致

ADR-0018 の主な方針、

- JSON data only
- ordinary object / array の prototype 制限
- accessor / symbol / non-enumerable rejection
- descriptor で snapshot
- null-prototype object copy
- cycle / depth
- file output は範囲外
- same-process prototype pollution は既知の限界

は概ね実装に対応している。

ただし次の2点は一致しない。

1. ADR は「各プロパティを descriptor で読む」「`get` trap は使わない」とするが、array `length` は `value.length` で読む。
   → **M2-2-R7-001**
2. ADR の array 定義は exact index set + `length` だけだが、実装は `keys.length` しか検証しないため、Proxy の矛盾した ownKeys view で定義外の arrayを受理し得る。
   → **M2-2-R7-002**

また固定 refusal message の記述に対し reflective trap exception は正規化されない。
→ **M2-2-R7-003**

---

## 確認範囲

主に以下を確認した。

- `src/output.ts`
- `tests/regression-m2-2-r4-001-json-data.test.ts`
- `tests/regression-m2-2-r3-002-json-keys.test.ts`
- `docs/adr/0018-safejson-json-data-only.md`
- `docs/adr/0017-output-lines-blocks-keys-guard.md`
- `docs/ARCHITECTURE.md`
- v0.5.9..v0.5.10 の diff
- packet の Verification（PASS 自体は正しさの根拠には使用していない）

Previous Reviews、commit message、response、CHANGELOG、ADR / ARCHITECTURE の実装 AI による結論は正しさの根拠にはせず、確認対象を特定するための索引としてのみ利用した。

Request で既知の範囲外とされたファイル出力側 JSON、same-process prototype pollution、Proxy 自体を検出しないこと、M2-2-R4-002、ROADMAP backlog、Windows、過去記録、所要時間は新規指摘対象から除外した。
