<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r8-for-claude.md、ChatGPT、2026-09-27 受領、15,943 バイト、対象範囲 v0.5.11..v0.5.12）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 83d6e0f5520818b37d9835c1d909a448d6f2a64efd85c508583bd6aebdb7d16f
-->

# independent review — M2-2 R8

## 1. 総評

v0.5.11..v0.5.12 の変更について、Request の「特に見てほしい点」1〜7、`src/output.ts`、新規回帰テスト `tests/regression-m2-2-r7-json-data-proxy.test.ts`、ADR-0018、ARCHITECTURE の該当変更を独立に確認した。

前回指摘 **M2-2-R7-001 / M2-2-R7-002 / M2-2-R7-003 は、いずれも「解消」**と判断する。

- R7-001: 配列 `length` は `value.length` ではなく own data descriptor から読まれ、Proxy の `get` trap を使わない。
- R7-002: 配列の own key は「個数」だけでなく、各 key が `"length"` または `length` 未満の canonical index であることを確認する。重複 key は ECMAScript engine 側が `Reflect.ownKeys()` で拒否するため、`length + 1` 個という条件と合わせて exact set になる。
- R7-003: `getPrototypeOf` / `ownKeys` / `Array.isArray` / `getOwnPropertyDescriptor` はすべて `inspect()` に包まれ、trap 自身の例外・engine の TypeError・revoked Proxy を固定の拒否へ変換する。`catch` に binding がなく、元の thrown value を message / cause に保持していない。

独立確認では **新しい High / Medium / Low の指摘は 0 件**。  
ただし、パケットに含まれない既存ファイル・既存テストの全文については「未確認の範囲」として最後に分離した。

---

## 2. 前回指摘の解消状況

### M2-2-R7-001 — 解消

**対象**
- `src/output.ts:71-77`
- `src/output.ts:98-103`
- `src/output.ts:129-143`
- `tests/regression-m2-2-r7-json-data-proxy.test.ts:42-55`

### 根拠

前回は array branch が `value.length` を読むため、Proxy array の `get` trap が発火していた。

v0.5.12 では専用の `arrayLength()` が追加され、

```ts
function arrayLength(a: object): number {
  const d = inspect(() => Object.getOwnPropertyDescriptor(a, "length"));
  const n: unknown =
    d !== undefined && "value" in d && d.enumerable === false
      ? d.value
      : undefined;

  if (
    typeof n !== "number" ||
    !Number.isInteger(n) ||
    n < 0 ||
    n > MAX_ARRAY_LENGTH
  )
    throw notJsonData(
      "an array whose length is not a valid array length",
    );

  return n;
}
```

として own descriptor から length を取得している。

array branch 自体も、

```ts
const length = arrayLength(value);
```

となり、`value.length` は使っていない。

さらに `arrayLength()` 内の `Object.getOwnPropertyDescriptor()` は `inspect()` に包まれているため、

- Proxy の descriptor trap
- trap lookup 中の利用者コード
- revoked Proxy
- engine が trap の回答を検査して投げる TypeError

のいずれが throw しても固定拒否に変わる。

新規回帰テストでは Proxy array に、

```ts
get: () => {
  gets += 1;
  throw new Error(...);
}
```

を設定した上で `safeJson()` を成功させ、`gets === 0` を確認している。

この test は修正前の `value.length` 実装では FAIL し、修正後では PASS する構造になっている。

### 判定

**解消**

---

### M2-2-R7-002 — 解消

**対象**
- `src/output.ts:88-92`
- `src/output.ts:134-143`
- `tests/regression-m2-2-r7-json-data-proxy.test.ts:58-69`

### 根拠

前回は、

```ts
keys.length === length + 1
```

しか見ず、`ownKeys()` が symbol / non-index key を見せながら descriptor trap が別の index を見せる Proxy を受理できた。

v0.5.12 ではまず canonical index を、

```ts
const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;
```

と定義し、array branch で、

```ts
if (keys.length !== length + 1)
  throw notJsonData(...);

for (const k of keys) {
  if (
    k !== "length" &&
    (
      typeof k !== "string" ||
      !ARRAY_INDEX.test(k) ||
      Number(k) >= length
    )
  )
    throw notJsonData(...);
}
```

としている。

`Reflect.ownKeys()` の返す key list は重複 key を含められず、Proxy trap が重複 key を返すと engine が TypeError を投げる。その TypeError 自体も `inspect()` で固定拒否になる。

したがって、

- key 数 = `length + 1`
- 許容可能な key の全集合 = `"length"` + `0..length-1`
- duplicate 不可

の3条件により、受理される key set は exact set になる。

回帰テストでは少なくとも、

- symbol
- `"extra"`
- index欠落を別keyでpadding
- `"01"`
- `"1.0"`
- `"-0"`
- `length` 以上の index

を拒否する。

独立の Node.js 最小確認でも、

- `"01"`, `"1.0"`, `"-0"`, `"+1"`, `"1e3"` は regex 不一致
- `"4294967294"` は canonical decimal
- `"4294967295"` も lexical には canonical だが、実際の受理可否は `Number(k) < length` で制約

となることを確認した。

### 境界について

`MAX_ARRAY_LENGTH` は `2 ** 32 - 1`。array index として有効なのは、ある `length` に対して `0..length-1` だけなので、

- `length = 2^32 - 1`
- 最大 index = `2^32 - 2`

という関係になる。

コードは `Number(k) >= length` を拒否するため、この境界条件と一致する。

### 判定

**解消**

---

### M2-2-R7-003 — 解消

**対象**
- `src/output.ts:61-77`
- `src/output.ts:80-85`
- `src/output.ts:98-103`
- `src/output.ts:129-132`
- `tests/regression-m2-2-r7-json-data-proxy.test.ts:71-127`

### 根拠

新しい `inspect()` は、

```ts
function inspect<T>(op: () => T): T {
  try {
    return op();
  } catch {
    throw notJsonData(
      "a value whose structure could not be inspected",
    );
  }
}
```

となっている。

重要なのは `catch` に variable binding が無いことで、元の thrown value を、

- `.message` で読む
- `String(...)` へ渡す
- `cause` へ格納する
- error message へ連結する

処理が無い。

`jsonSafe()` 内で利用者コードや Proxy trap を起動し得る主要な reflective operation は今回の範囲では、

```ts
Object.getPrototypeOf(value)
Reflect.ownKeys(value)
Array.isArray(value)
Object.getOwnPropertyDescriptor(...)
```

であり、すべて `inspect()` 経由になっている。

`getOwnPropertyDescriptor()` は、

- ordinary object property
- array length
- array element

のすべてで wrapper を通る。

回帰テストは、

- trap が user text を含む `Error` を throw
- string を throw
- `toString` を持つ object を throw
- 調べるとさらに throw する hostile Proxy を throw
- `message` getter が throw する Error を throw
- Proxy handler 自身が Proxy
- `ownKeys` trap の返す array-like の access で throw
- descriptor object の getter で throw
- engine invariant violation TypeError
- revoked Proxy
- nested Proxy

を検証している。

特に、

```ts
expect(touched).toBe(0);
```

で hostile thrown value が読み直されていないことも確認している。

### 判定

**解消**

---

## 3. 新しい指摘

**新しい指摘なし。**

今回の変更範囲について、指摘基準に該当する新しい High / Medium / Low は確認しなかった。

---

## 4. Request「特に見てほしい点」1〜7 の確認結果

### 1. M2-2-R7-001〜003 の再現条件

**確認したが問題なし。**

#### R7-001

`value.length` は無くなり、`Object.getOwnPropertyDescriptor(..., "length")` を `inspect()` 経由で読む。

Proxy `get` trap を呼ぶ経路は、今回確認した array length 処理には残っていない。

#### R7-002

array key は、

- exact count
- canonical index syntax
- `< length`
- `"length"`

の組み合わせで検証される。

重複 key は engine の Proxy invariant check で拒否され、その例外も固定拒否になる。

前回の symbol / extra / missing-index-padding / noncanonical-index の形はいずれも拒否される。

#### R7-003

reflective operation の failure はすべて `inspect()` で固定拒否へ変換される。

元の thrown value を読む処理は確認できなかった。

---

### 2. 投げられた値を「読まない」こと

**確認したが問題なし。**

`inspect()` の `catch` は binding を持たない。

```ts
catch {
  throw notJsonData(...);
}
```

なので、元の値を名前に束縛していない。

また、

- `cause`
- error chaining
- logging
- string conversion
- property access

も無い。

回帰テストの hostile thrown value は、読まれた場合に counter が増える設計だが、期待値0になっている。

今回確認した `jsonSafe()` 内の reflective operation はすべて wrapper 経由。

ただし「同一process内の任意コードが global built-in 自体を書き換える」といった脅威は Request / ADR の既知範囲外に近く、今回の新規指摘にはしていない。

---

### 3. `ARRAY_INDEX` と `length` の境界

**コード上は問題なし。**

`length`:

```ts
0 <= n <= 2^32 - 1
```

かつ整数のみ。

拒否される代表例:

- `1.5`
- `-1`
- `2^32`
- `NaN`

回帰テストにも入っている。

canonical index:

```ts
0
[1-9][0-9]*
```

なので、

- `"01"`
- `"1.0"`
- `"-0"`
- `"+1"`
- `"1e3"`

は拒否。

さらに lexical に数字であっても、

```ts
Number(k) >= length
```

なら拒否する。

`length = 2^32 - 1` のとき、最大許容 index は `2^32 - 2` になるため、array index の境界とも整合する。

なお `2^32 - 1` 要素を完全に埋めた巨大配列を使った positive end-to-end test はパケットの新規テストには無い。実メモリ上現実的ではなく、今回のコード判定自体に矛盾は確認しなかったため指摘にはしていない。

---

### 4. CLI 最上位 catch を既知の限界として残した扱い

**今回の前提の範囲では妥当と判断する。**

今回の `safeJson()` 経路では hostile reflective failure が `inspect()` で通常の `Error` に変換されるため、R7-003 の直接経路から CLI 最上位 catch の弱点へ hostile thrown value が到達しなくなった。

一方、CLI catch 自体が「調べると例外になる thrown value」を安全に扱えない問題は一般問題として残る。

Request では、

- 今回は修正しない
- ROADMAP backlog 1
- 現在の利用者入力からそのような値を作る経路は無い

と明示されている。

したがって今回の修正範囲を広げず、独立 backlog に残す扱いは合理的。

ただし `src/cli.ts` の現行全文は今回の changed-source packet には含まれていないため、「現在のすべての throw site から hostile value が絶対に到達しない」ことまでは独立確認していない。これは下の「未確認の範囲」に分離する。

---

### 5. 通常の出力の不変

**変更コードの範囲では問題なし。**

ordinary JSON data に対する変化は、

- array length の取得元が `value.length` → descriptor
- array keys の validation が厳密化
- reflective failure の error normalization

であり、plain object / plain array の成功時 copy の作り方と string/key の escape → mask は変わっていない。

新規 test でも、

```ts
safeJson(new Proxy(value, {})) === safeJson(value)
```

および forward trap Proxy が plain data と同じ JSON になることを確認している。

v0.5.11 と byte-for-byte 比較する既存の広い regression test の全文は今回のパケットには入っていないため、その test 自体の内容は今回再読していない。ただし `src/output.ts` の成功時変換ロジックの差分から、ordinary JSON data の bytes を変える変更は確認できなかった。

---

### 6. 回帰テスト

**M2-2-R7-001〜003 の直接再現については十分に機能している。**

#### R7-001

Proxy array の `get` trap を「呼ばれたら throw」にし、成功と `gets === 0` を要求する。

修正前は `value.length` で失敗する。

#### R7-002

前回指摘した矛盾した Proxy view を直接 fixture 化している。

特に、

- symbol
- extra string
- missing index padded by extra key
- `"01"`
- `"1.0"`
- `"-0"`
- index >= length

を持つ。

修正前は少なくとも前回再現した複数形を受理するため FAIL する。

#### R7-003

単なる `Error` だけではなく、

- string
- custom object
- hostile Proxy
- hostile `message` getter
- engine invariant error
- revoked Proxy

まで含み、固定 message と output sink 0 回を確認している。

修正前は trap exception がそのまま伝播するため FAIL する。

#### 対照

plain Proxy / forwarding Proxy が plain data と同じ JSON を出す control があり、「Proxy なら全部拒否する」だけの修正では通らない。

この点も対照として有効。

---

### 7. docs とコードの一致

**今回確認した範囲では問題なし。**

ADR-0018 の v0.5.12 注記は、

- length を descriptor から読む
- exact key set を確認
- reflective operation failure を固定拒否
- thrown value を読まない

と記述し、コードと一致する。

ARCHITECTURE も、

- property を descriptor で読む
- getter / `toJSON` / Proxy `get` trap を呼ばない
- reflective inspection failure は固定種類
- CLI top-level catch の一般問題は別 backlog

という整理になっている。

また ADR の v0.5.11 記録は「当時の状態」として残し、その直後に v0.5.12 で解消したと追記しているため、履歴として矛盾していない。

---

## 5. 未確認の範囲

ユーザーの指示どおり、パケットに含まれていない範囲については断定しない。

今回独立に全文を確認できた主な対象は、

- `src/output.ts`
- `tests/regression-m2-2-r7-json-data-proxy.test.ts`
- `docs/adr/0018-safejson-json-data-only.md`
- `docs/ARCHITECTURE.md` の変更差分
- v0.5.11..v0.5.12 の changed-file diff

である。

以下は今回のパケットに現行全文が無い、または変更対象外のため、独立再確認していない。

1. **`src/cli.ts` の現行全文**
   - CLI 最上位 catch の既知問題自体は Request で範囲外。
   - backlog とする扱いの妥当性は上記の範囲で確認したが、repo 全体の全 throw site から hostile thrown value が絶対に到達しないことまでは未確認。

2. **既存の byte-for-byte output regression test の現行全文**
   - ADR が参照する v0.5.4 の 42 通りの比較 test は今回の changed-source packetには含まれていない。
   - Verification の PASS だけを根拠にはしていない。
   - 変更コードを読んだ限り ordinary JSON data の成功時 bytes を変える箇所は見つからないが、既存 test 自体の assertion 内容は今回再読していない。

3. **変更されていない command 実装の全 `--json` payload**
   - Request / ADR は現行 command payload が JSON data のみとするが、今回の packet はそれら command 全文を含まない。
   - したがって全 command の runtime payload が現在も必ず JSON data であることは今回独立再確認していない。

4. **既知の範囲外**
   - CLI top-level catch の修正そのもの
   - file output 側 JSON / `maskDeep()`
   - same-process prototype pollution
   - Proxy を Proxy として検出しない設計
   - M2-2-R4-002 その他 ROADMAP backlog
   - Windows
   - verify / test 所要時間

これらは Request の指定に従い、新規指摘対象にはしていない。

---

## 6. 結論

- **M2-2-R7-001: 解消**
- **M2-2-R7-002: 解消**
- **M2-2-R7-003: 解消**
- **新規 High: 0件**
- **新規 Medium: 0件**
- **新規 Low: 0件**

今回パケットに含まれる v0.5.11..v0.5.12 の変更範囲では、追加修正を要求する新しい不具合は確認しなかった。
