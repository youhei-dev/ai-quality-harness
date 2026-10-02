# independent review — backlog 9 / 10 R1

対象: `v0.5.23..v0.5.24`

レビュー方法: 添付 ZIP を展開し、Request、Diff、変更後ソース、ADR-0020、関連 ADR、追加テスト、Documents にある `src/` 全37ファイルを静的に読んで判断した。依頼どおり、対象コード・fixture・テストは実行していない。

整合性確認:

- ZIP: **1,238,042 bytes** / SHA-256 `825631947a8d5d8798e9588139e09e5c82c942f169ab929441265224088253a8` — 依頼文と一致。
- 内部 Markdown: **1,237,880 bytes / 15,737 lines** / SHA-256 `327f6f3e52797206523eaa664fe13e7591d935c7df08f46cf9ecc206858737d9` — 依頼文と一致。

## 1. 結論

### 新しい指摘

- **High: 2件**
- **Medium: 1件**
- **Low: 1件**

分類:

- **不注意で書ける形**: High 2 / Medium 1
- **(i) 意図的な偽装が要る形**: 0
- **(ii) 塞ぐと `src/` の正当なコードや普通の書き方まで壊れる形**: 0
- **(iii) 実際にはファイルにも端末にも生の禁止文字が残らない誤検出・過剰な変換**: Low 1

現在の `src/` 37ファイルを読む限り、今回対象になった **verify の3つのレポートと init の `aiqh.config.jsonc` に、生の禁止文字が残る現行の書き込み漏れは見つからなかった**。

`writeAtomic()` は JSON / Markdown の両方を最後の `writeFileSync()` の直前で変換し、init の config も書く直前に `escapeRawCharsAsJson()` を通している。review-packet を fail closed の別系統にした分類も、現在の実装と ADR-0014 の設計に合っている。

一方、ADR-0020 が「新しい書き込み箇所を見せる」として導入した `tests/file-write-sites.test.ts` は、機械的な将来防止策としてはまだ不十分である。

特に、

1. Node fs の書き込み API を列挙し切れておらず、既存 ADR-0019 が書き込み系として明示している `writev` / `writevSync` すら対象外で、stream / `FileHandle` の method 型の書き込みも列挙できない。
2. 「門あり」の判定が、書き込む第2引数の source text に `escapeRawCharsAsJson(` または `escapeForDisplay(` という文字列が含まれるかだけなので、引数の一部分だけを変換した形でも「門あり」になり得る。また `createWriteStream` / `copyFile` / `cpSync` では第2引数は書き込む content ではなく、この判定モデル自体が API と一致しない。

この2件は、実装 AI が新しいファイル出力を普通に追加するときに起こり得るため、**不注意で書ける High** とする。

ROADMAP の方針では「High が出たときだけ2回目」としているため、**この結果なら backlog-9-10-r2 を行う条件に該当する**。

---

## 2. 特に見てほしい点 1〜9

1. **書き込みの出口の漏れ** — **指摘あり（BACKLOG-9-10-R1-001, BACKLOG-9-10-R1-002）**
2. **記法の曖昧さ** — **指摘あり（BACKLOG-9-10-R1-003）**
3. **Markdown の構造** — **指摘なし**
4. **JSON** — **指摘なし**
5. **環境 (`checkEnv`)** — **指摘あり（BACKLOG-9-10-R1-004）**
6. **複数行のコマンド表示の変更** — **指摘なし**
7. **「通常のレポートは v0.5.23 とバイト単位で同じ」** — **指摘なし**
8. **テスト115件・既知の限界** — **指摘あり（BACKLOG-9-10-R1-001, BACKLOG-9-10-R1-002, BACKLOG-9-10-R1-003, BACKLOG-9-10-R1-004）**
9. **ROADMAP のレビュー方針** — **指摘なし**

---

## 3. 指摘の一覧

## BACKLOG-9-10-R1-001

- **重大度: High**
- **分類: 不注意で書ける形**
- **分類の根拠:** 新しい fs 書き込みを実装するときに `writev`、stream、`FileHandle` などを普通に選ぶだけで成立し、型偽装やガード回避の意図を必要としない。
- **確信の度合い: 高**
- **場所:**
  - `tests/file-write-sites.test.ts:12-39`
  - 特に `CONTENT_WRITERS` と `CallExpression` / `FunctionDeclaration` だけを見る部分
  - `docs/adr/0019-builtin-allowlist-process-members.md:108-115`
  - `docs/adr/0020-file-output-notation-and-check-env.md:40-41`
- **`src/` 実在:** **0か所**。全37ファイルで、今回挙げる未列挙の `writev` / `writevSync`、`FileHandle.write*`、stream `.write()` によるファイル内容書き込みは見つからない。

### 内容

`tests/file-write-sites.test.ts` は、

```text
CONTENT_WRITERS =
writeFileSync / appendFileSync / writeSync / write /
writeFile / appendFile / createWriteStream /
copyFileSync / copyFile / cpSync
```

だけを「内容を書く fs 関数」として列挙している。

しかし同じリポジトリの ADR-0019 の入口表は、`node:fs` の書き込み系として **`writev` と `writevSync` を明示的に列挙**している。この2つは `CONTENT_WRITERS` に無い。

さらに探索は `CallExpression` だけで、resolved declaration を親へたどって **`FunctionDeclaration`** の名前を探す。このため、`FileHandle.write()` / `writeFile()` / `appendFile()` のような method declaration、stream の `.write()` / `.end()`、constructor / object を経由する書き込みは、この列挙方法では「新しい書き込み箇所」として現れない。

`createWriteStream` は列挙されているが、実際のファイル内容は後続の stream `.write()` / `.end()` から来る。したがって `createWriteStream` の call だけを「content writer」と数えても、内容の変換を保証できない。

### なぜファイルに生の禁止文字が残り得るか

将来の実装が、利用者由来の文字列や check の出力を `writev` / `writevSync`、`FileHandle.writeFile()`、または write stream の `.write()` に渡した場合、その content が `escapeRawCharsAsJson()` / `escapeForDisplay()` を通っていなくても、この inventory test がその書き込みを列挙しない形がある。

その場合、書かれる値に禁止文字が含まれていれば、write API 自体は値をそのままファイルへ送るので、生の禁止文字が残る。

### 同じ系統

残る。

少なくとも次を同系統として扱う必要がある。

- `writev`, `writevSync`
- `FileHandle.write`, `FileHandle.writeFile`, `FileHandle.appendFile`
- `FileHandle.createWriteStream` の後続 `.write()` / `.end()`
- `createWriteStream` の後続 stream `.write()` / `.end()`
- constructor / method declaration を使う別の Node fs 書き込み形

また、child process の shell redirection など「fs API ではないファイル書き込み」は、このテストの設計上そもそも列挙対象にならない。そこまでを対象にしないなら、ADR-0020 の「新しい書き込み箇所」という文言を **「Node fs の列挙対象 API による書き込み箇所」**まで狭めた方が正確である。

### 修正案

`CONTENT_WRITERS` を手書きで部分列挙するのでなく、少なくとも Node の型宣言から write-capable な function / method / stream 入口を棚卸しし、両方向に一致するテストにする。

最低限、ADR-0019 が既に書き込み系と認識している `writev` / `writevSync` は同じ一覧に入れる。

stream / `FileHandle` まで機械的に追わないのであれば、その限界を ADR-0020 に既知の限界として明記し、「すべての新しい書き込みを見せる」とは書かない。

---

## BACKLOG-9-10-R1-002

- **重大度: High**
- **分類: 不注意で書ける形**
- **分類の根拠:** 新しい書き込みで「固定の prefix + 変換済み本文」のように一部分だけを変換する書き方は普通に起こり得て、回避の意図を必要としない。
- **確信の度合い: 高**
- **場所:**
  - `tests/file-write-sites.test.ts:14-37`
  - `GATE = /escapeRawCharsAsJson\(|escapeForDisplay\(/`
  - `content = n.arguments[1]`
  - `GATE.test(content.getText(sf))`
  - `docs/adr/0020-file-output-notation-and-check-env.md:40-41`
- **`src/` 実在:** **0か所**。現在「gated」とされる2箇所は、init config が content 全体を `escapeRawCharsAsJson(configText)` に渡し、`writeAtomic` も JSON / Markdown の content 全体をそれぞれ gate に渡している。

### 内容

書き込み箇所テストの「門あり」判定は、データフローを見ていない。

第2引数の source text のどこかに、

- `escapeRawCharsAsJson(`
- `escapeForDisplay(`

が含まれれば `gated: true` になる。

したがって、書き込む expression の一部分だけを変換し、別の部分は生の利用者値のまま、という形でもテスト上は「門あり」になり得る。

また `CONTENT_WRITERS` には `createWriteStream`、`copyFile` / `copyFileSync`、`cpSync` が含まれるが、これらでは第2引数は一般的な「書き込む本文」ではない。

- `createWriteStream(path, options)` の第2引数は options。
- `copyFile(src, dest)` / `cpSync(src, dest)` の第2引数は destination。

つまり、`n.arguments[1]` を全 writer 共通の content とする前提も成立していない。

### なぜファイルに生の禁止文字が残り得るか

例えば将来の writer が、

- 生の prefix / header
- gate を通した本文

を連結して書く場合、argument text には gate の名前が含まれるため `gated: true` になり得る。一方、生の prefix に禁止文字があれば、その部分はそのままファイルへ残る。

同様に conditional / helper / comma expression 等で、gate call と実際に選ばれる raw 値が同じ argument の source text に共存する場合も、文字列検索だけでは「書かれる全 content が gate を通った」ことを証明できない。

### 同じ系統

残る。

- concatenation の片側だけ gate
- template literal の一部だけ gate
- conditional の一枝だけ gate
- helper call の別引数だけ gate
- gate の結果を使わない expression
- gate 済みの変数を別行で作る安全な形は、逆に `gated: false` になる

つまり現在の方法には **false negative と false positive の両方**がある。

### 修正案

このテストを「門の正しさを証明する」ものにしない。

最も堅い方法は、書き込み site inventory と gate verification を分けること。

- inventory: すべての対象 writer を機械的に列挙し、新しい site を見えるようにする。
- gate verification: 各既知 site ごとに、owner / writer / content source を明示した allowlist を持ち、「この site は `writeAtomic` の出口」「この site は config 全体を gate」と個別に検査する。

少なくとも、`GATE.test(content.getText(...))` を「content 全体が変換済み」の証拠には使わない方がよい。

---

## BACKLOG-9-10-R1-003

- **重大度: Low**
- **分類: (iii) 実際にはファイルにも端末にも生の禁止文字が残らない誤検出・過剰な変換**
- **分類の根拠:** 生の禁止文字の漏れではなく、Markdown の人向け表記が元データに対して1対1ではないという表示・記録上の曖昧さである。
- **確信の度合い: 高**
- **場所:**
  - `src/security/raw-chars.ts:53-64`
  - `src/report/write.ts` の Markdown branch
  - `docs/adr/0020-file-output-notation-and-check-env.md:22-31`
- **`src/` 実在:** **1つの現行経路**。verify の `latest.md` は check stdout / stderr 等をこの表記へ変換するため、入力に同じ literal notation があれば現在でも起こり得る。

### 内容

JSON と Markdown では性質が違う。

#### JSON

JSON 側は区別できる。

元データが「バックスラッシュ + `u007f`」という6文字なら、`JSON.stringify()` によりバックスラッシュ自体が escape される。

一方、元データが実際の U+007F なら、file exit が JSON の `\u007f` escape にする。

したがって JSON を `JSON.parse()` すれば、

- 元が literal notation だった値
- 元が禁止文字だった値

は別の値として戻る。ADR の「読み戻したデータは同一」は正しい。

#### Markdown

Markdown は区別できない。

元の check output が literal text `\u{1B}` だった場合、その文字列はそのまま Markdown に出る。

元の check output が実際の ESC だった場合も、`escapeRawChars()` / `escapeForDisplay()` により `\u{1B}` になる。

結果の Markdown だけを読むと、この2つは同じ表示になる。

### 影響

生の ESC 等は残らないので、安全上の backlog 9 の目的は満たす。

ただし「表記にして残す」を「元に何があったかを Markdown だけから一意に復元できる」という意味にはできない。

ADR-0020 は「忠実さが要るのはデータ（JSON）だけ」と書いているため、設計そのものはこの tradeoff をかなり示している。より誤解を避けるなら既知の限界へ、

> Markdown の `\u{HEX}` は display-safe な表記で、literal に同じ文字列が元からあった場合との区別はできない。元データの忠実な確認には JSON を使う。

と明記するとよい。

### 同じ系統

すべての Markdown / terminal の `\u{HEX}` display notation に共通する。

---

## BACKLOG-9-10-R1-004

- **重大度: Medium**
- **分類: 不注意で書ける形**
- **分類の根拠:** `executeCommand()` の caller が既存の `env` option を普通に使うだけで `checkEnv()` を丸ごと迂回でき、ガード回避の意図は不要。
- **確信の度合い: 高**
- **場所:**
  - `src/runner/env.ts:8-13`
  - `src/runner/execute.ts:15`
  - `src/runner/execute.ts:108-116`
  - `docs/adr/0020-file-output-notation-and-check-env.md:42-45`
- **`src/` 実在:** `executeCommand()` に bypass branch が **1か所**ある。ただし現在の production `src/runner/run-checks.ts` は `env` を渡しておらず、**現行 CLI の production call site で bypass している箇所は0**。

### 内容

ADR-0020 は `checkEnv()` を、

> check の環境を1か所で作る  
> nothing else may build one

という位置づけにしている。

しかし実装は、

`env: options.env ?? checkEnv()`

なので、`ExecuteOptions.env` が渡された場合は `checkEnv()` をまったく通らない。

したがって `options.env` に `FORCE_COLOR` / `PY_COLORS` が入っていれば、そのまま child check に渡る。

これは現在の CLI の通常経路では起きない。`runChecks()` は `executeCommand()` に env を渡していないため、利用者の `aiqh verify` は `checkEnv()` を通る。

ただし export された runner API としては、「ここだけで check env を作る」という不変条件にはなっていない。

### ファイル / 端末への到達

この形でも backlog 9 の writer と ADR-0016 の terminal boundary があるため、ESC 等が **生のまま** report / terminal に残るとは考えない。

ただし forced color が復活すると、check の captured stdout / stderr に ANSI sequence が入り、レポートには `\u{1B}...` の notation が並ぶ。つまり backlog 10 の「色の強制を除いて読みやすくする」という目的は迂回される。

### 同じ系統

今後 `executeCommand({ ..., env })` を使うすべての production caller が同じ bypass になる。

バックログ 6 で `checkEnv()` を「最小環境」に広げても、この `options.env` branch を残したままだと、その最小化も同様に丸ごと迂回できる。

### 修正案

`env` を「完成した child env」ではなく「checkEnv に渡す parent env」と定義できるなら、

`checkEnv(options.env ?? process.env)`

の形にするのが単純。

既存テストが sanitization 前の完全な env を child に渡す必要があるなら、test-only / lower-level の別 API に分けた方が、「production check は必ず checkEnv を通る」という設計を機械的に保ちやすい。

少なくとも ADR の「何も else may build one」は、現実装のままなら「通常の `runChecks` 経路では」に狭めるべきである。

---

## 4. 書き込み出口の現在の実装

現在の対象 site 自体については、次の判断。

### verify report

`src/report/write.ts` は、

- report を一度 JSON / Markdown に render
- `writeAtomic()` の最後で
  - JSON → `escapeRawCharsAsJson(content)`
  - Markdown → `escapeForDisplay(content, "keep")`
- その結果だけを `writeFileSync()`

としており、今回の「最後の出口で変換」という方針に合う。

新しい report field を追加しても、既存 `writeReports()` を使う限り forbidden set の文字は最後に変換される。

### init の `aiqh.config.jsonc`

`src/commands/init.ts` は config 全体を parser / resolver で検証した後、

`writeFileSync(configFile, escapeRawCharsAsJson(configText), "utf8")`

としている。

generated JSONC の利用者由来 JSON values は JSON string なので、現在の forbidden set の raw code point は JSON escape に変わる。

comment の利用者値は `generateConfigJsonc()` 側ですでに `escapeRawChars()` を通り、raw forbidden character を持たない。

### `.gitignore` / `package.json`

ADR が明示する対象外として実装と一致する。

`package.json` は existing user data を parse / stringify して書き直すため、その中に DEL / C1 / bidi 等があればそのまま残り得るが、ADR-0020 が明示的に「利用者の既存内容は素通し」としているため、今回それ自体を新規 finding にはしていない。

### review-packet

packet 本文は書き込み直前の escape ではなく、ADR-0014 の inspection / fail-closed で raw forbidden character を拒否する別設計になっている。

今回の review-packet source を読む限り、この分類は妥当。

---

## 5. Markdown の構造

今回確認した範囲では、新規指摘なし。

### 1行フィールド

利用者由来になり得る主要な inline fields は `oneLine()` / `cell()` を通る。

- `project.name`
- git commit / branch
- config path
- check name
- command
- cwd
- error summary

`oneLine()` は `escapeRawChars()` を使うため、forbidden set に加えて LF / TAB も notation になる。

`cell()` はその後 `|` を `\|` にする。

### code fence

`fenceFor()` は content 中の backtick run の最大長 + 1、最低3なので、content 自身の backticks が fence を早く閉じる形は防いでいる。

opening fence も closing fence も同じ長さで、stdout / stderr はその fence の内側に置かれる。

### `<details>`

stdout / stderr の本文は dynamic fence の内側に入る。今回の目的である「output の backticks / heading が fence の外へ出る」形は閉じている。

### program-generated values

`verdict`、status、kind、signal、timestamps、tool name/version、category labels 等を `oneLine()` にしていない区分は、現 CLI では program / OS generated の bounded value であり、今回利用者値の付け忘れとは判断しなかった。

---

## 6. JSON の判断

新規指摘なし。

`escapeRawCharsAsJson()` は serialized JSON text 全体を走査するが、現在の report JSON は `JSON.stringify()` から作られる。

現在の forbidden set で JSON.stringify が raw のまま残し得る DEL、C1、U+2028/U+2029、bidi controls、U+FEFF は、正常な JSON document では string の中に現れるものなので、現在の用途では syntax 部分を壊す変換になっていない。

C0 controls は JSON.stringify がもともと escape するため、生の C0 は serialized JSON string に残らない。

### surrogate pair

現在の75 code point はすべて BMP 内で、`escapeRawCharsAsJson()` の `\uXXXX` 1個で表せる。

supplementary character は forbidden set 外なのでそのまま。

lone surrogate は今回の forbidden set 外であり、JSON.stringify 側の well-formed JSON escape に任せられる。

将来 forbidden set に U+FFFF より上を追加する場合は、現在の helper は `\uXXXX` 1個という前提を見直す必要があるが、Request が明示するとおり「集合を変える」のは今回の範囲外。

### BOM / U+2028 / U+2029

string 内で `\uXXXX` になり、`JSON.parse()` 後は元 code point に戻る。

新規テストが全75 code point について round-trip を確認する設計も、この性質を直接見ている。

### `copyJson`

現 report schema の普通の値について、旧 `maskDeep` と serialized result を変えるものは見つからなかった。

差になるのは意図した hardening 側:

- function / undefined / non-finite / getter / cycle 等を拒否
- `__proto__` key を key として保持
- key にも masker
- prototype を持たない copy

現在の report keys は固定なので、key masking による通常 output の差はない。

---

## 7. 複数行 command の表示変更

**戻す必要はない**。

旧 `escapeCell()` は embedded LF を空白へ置き換えていたため、

- 本当に space があった command
- LF があった command

を report 上で区別できなかった。

v0.5.24 の `cell(oneLine(command))` は LF を `\u{A}` として残すので、1行の table structure を保ちながら情報を失わない側の変更である。

backlog 9 の方針とも整合する。

---

## 8. 「通常のレポートは v0.5.23 とバイト単位で同じ」

この定義の範囲では、静的に見て反例は見つからなかった。

変更点を追うと、

- `oneLine()` は forbidden / LF / TAB が無ければ入力を変えない。
- `cell()` の pipe escape は旧 `escapeCell()` と同じ。
- backtick run が 0〜2なら fence は旧来と同じ3 backticks。
- JSON file exit は forbidden character が無ければ content を変えない。
- `copyJson()` は現在の正常な report dataでは JSON serialization の値・key orderを変えない。

したがって Request が定義する、

- forbidden character なし
- 1行 field の LF/TAB なし
- fence を変える長い backtick run なし

という normal case については、source diff からも byte equality の主張と矛盾する形を確認できなかった。

ただし追加テストの「ordinary report」1件は current `renderMarkdown()` と current writer の一致を主に見ており、**v0.5.23 の golden bytes を自動で固定する cross-version regression ではない**。

よって「実装の正しさ」の反例ではないが、互換性主張を将来もテストで固定したいなら v0.5.23 の representative golden fixture を保存する方が強い。

今回は Low finding には数えない。

---

## 9. `checkEnv()` の変更自体

R1-004 の `options.env` を除けば、変更の基本形は Request と一致する。

`checkEnv(parent)` は parent を copy し、

- `NO_COLOR = "1"`
- `FORCE_COLOR` delete
- `PY_COLORS` delete
- その他は保持

で、引数自身を mutate しない。

利用者の通常の `aiqh verify` では `runChecks()` が `executeCommand()` に env を渡さないので、この sanitize を通る。

`FORCE_COLOR` / `PY_COLORS` を意図的に継承したい check は挙動が変わるが、それは backlog 10 の採用判断そのもの。

任意の check が `NO_COLOR` を業務ロジックとして読む可能性や、未測定の tool が別の color variable を使う可能性はあるが、backlog 9 が raw output safety を担当し、10 は readability 改善である、という ADR の分離は妥当。

---

## 10. ROADMAP のレビュー方針

方針そのものに新規指摘なし。

今回のルールは、

- まず1回レビュー
- High が出た場合だけ2回目
- 上限2回
- `src/` 実在は直す
- `src/` 0の accidental shape を (i) に押し込めない
- inventory / table の穴は表と規則を直す

となっており、今回のような boundary change には妥当。

今回 **High 2件**なので、この方針をそのまま適用すると **2回目を実施する**ことになる。

R2 では特に、

1. file writer inventory が `writev` / method / stream 系をどう扱ったか
2. gate 判定を source-text regex からどう変えたか

の2点を重点確認すればよい。

---

## 11. 新しい指摘の件数

| 分類 | High | Medium | Low | 合計 |
|---|---:|---:|---:|---:|
| **不注意で書ける形** | **2** | **1** | 0 | **3** |
| **(i) 意図的な偽装が要る形** | 0 | 0 | 0 | 0 |
| **(ii) 塞ぐと `src/` の正当なコードや普通の書き方まで壊れる形** | 0 | 0 | 0 | 0 |
| **(iii) 生の禁止文字が残らない誤検出・過剰な変換** | 0 | 0 | **1** | **1** |
| **合計** | **2** | **1** | **1** | **4** |

---

## 12. 良い点

- report の JSON / Markdown を field ごとではなく **最終 writer で変換**した方針は、新しい report field の追加に強い。
- JSON は表示用 notation にデータ自体を変えず、JSON escape として保存した点が適切。
- init config を parse / resolve で受理確認してから最後に JSON escape へ変換している。
- Markdown で1行 fields と code-block tails を分け、tail の LF/TAB は保持しつつ inline field だけ LF/TAB を notation にした区分は妥当。
- dynamic fence は以前の固定 triple-backtick より明確に堅い。
- `copyJson()` を `safeJson()` と同じ JSON-data-only copy にしたため、`maskDeep()` の function / accessor / `__proto__` 問題を file report 側にも残していない。
- backlog 9 と10を分離し、10だけでは arbitrary ESC output を止められないことを既知の限界としている。
- `.gitignore` / `package.json` / review-packet を一律同じ変換へ押し込まず、理由を分けている。

---

## 13. 未確認・読み切らなかった範囲

1. **対象コード・fixture・テストは一切実行していない。** 依頼どおり静的読解のみ。
2. Request、Diff、変更後8つの `src/` ファイル、ADR-0020、関連する ADR-0019 の fs 入口表、新しい5テスト、Documents の `src/` 全37ファイルについて、file write / report / environment に関係する箇所を確認した。
3. `src/` 全37ファイルは、fs の書き込み API、runner の child env、report builder / writer、init / review-packet の書き込み経路を横断確認したが、今回の backlog 9 / 10 と無関係な業務ロジックを全行別目的でレビューしたわけではない。
4. v0.5.23 の checkout を別環境で実行して byte comparison はしていない。通常 report の互換性は、packet の diff と current / previous code の静的比較で判断した。
5. 実端末、Markdown renderer、各 external tool の color behavior は実行確認していない。ADR が「実端末での害は推測」「ruff / mypy / Playwright 未測定」としている範囲は、そのまま未確認。
6. Node のすべての fs API を外部ドキュメントから再列挙したわけではない。ただし R1-001 の `writev` / `writevSync` の漏れは、この packet 自身の ADR-0019 入口表が書き込み系として明示しているため、packet 内の証拠だけで確認できる。

---

## 最終判断

バックログ9の **現在の report / generated config の出口実装そのものは、静的に読む限り良好**で、生の禁止文字が現行対象ファイルに残る明確な漏れは見つからなかった。

今回の主問題は、その状態を将来維持するための `file-write-sites` inventory / gate test が、ADR-0020 の説明ほど網羅的・意味論的ではないことである。

特に R1-001 は、同じ repository の ADR-0019 がすでに `writev` / `writevSync` を書き込み系として認識しているのに、新しい inventory から抜けているため、修正優先度が高い。

**High が2件あるため、依頼文と ROADMAP の方針に従えば backlog-9-10-r2 を行う。**
