<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-builtin-r6-for-claude.md、ChatGPT、2026-10-02 受領、30,657 バイト、対象範囲 v0.5.21..v0.5.22）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。
無改変の原文の SHA-256: 0264655cc7efbed70df97fed559a2fa9367c0f305bc4bda487543e9c3e59dcbe
-->

# independent review — M2-2 BUILTIN R6

対象: `v0.5.21..v0.5.22`

レビュー方法: 添付 ZIP を展開し、Request、Previous Reviews、Diff、変更後全文、ADR-0019、ROADMAP、response、既存・新規の回帰テスト、Documents にある `src/` 全36ファイルを静的に読んで判断した。依頼どおり、対象コード・fixture・テストは実行していない。

整合性確認:

- ZIP: **1,351,082 bytes** / SHA-256 `2d771a0fcf9c489dcf36f576c0914c1ea149b65bfffcddeb494f245353c44042` — 依頼文と一致。
- 内部 Markdown: **1,350,920 bytes / 15,255 lines** / SHA-256 `ca4e2384f7fa3ff8fbd0af750701030d7a25dc4aa84070e1dbe8b32382fa89ec` — 依頼文と一致。

## 1. 結論

### 前回 M2-2-BUILTIN-R5-001〜004

- **部分的に解消**: R5-001, R5-003
- **解消**: R5-002, R5-004
- **未解消**: 0件

### 新しい指摘

- **High: 4件**
- **Medium: 0件**
- **Low: 0件**

4件とも **「不注意で書ける形」** と判定する。(i)・(ii)・(iii) の新規指摘は 0件。

v0.5.22 は R5 の具体例をかなり広く閉じている。特に `createReadStream` / `createWriteStream` の options を構文で絞った R5-002 と、computed key の wrapper を局所的に剥がした R5-004 は妥当である。

しかし、「入口を先に塞ぐ」という新しい方針にも4つの穴が残る。重要なのは、その4つがいずれも `any`、二重 assertion、虚偽の型注釈のような意図的偽装を必要としないことである。

1. `node:fs` / `node:child_process` の**名前付き再 export**を許したまま、ローカル module namespace としてまとめ直せる。
2. `Utf8Stream` を compatible なローカル constructor abstraction 経由で `new` すると、`@types/node` の class declaration への解決を失える。
3. listener 登録を `process["on"]` のような **element access** で書くと、listener の `this` 規則自体に入らない。
4. listener を shorthand property / class field / 4段以上の alias 経由で渡すと、`listenerUsesThis()` の resolver が宣言まで届かない。

このため、最終回という前提は尊重するが、**4件を (i)/(ii)/(iii) に押し込めて既知の限界扱いにはしない方がよい**。ROADMAP の方針に従い、r7 は増やさず、この最終レビューの修正として規則・回帰テスト・入口表/ADR を更新するのが妥当である。

---

## 2. M2-2-BUILTIN-R5-001〜004 の判定

| ID | 判定 | 根拠 |
|---|---|---|
| **R5-001** fs / child_process / fs-promises の関数値の入口 | **部分的に解消** | direct の default import、namespace import、`{ default as }`、`{ promises }`、`export *`、namespace export、default/promises の再 export、direct dynamic import は閉じた（`tests/structure/output-guard.ts:411-430, 519-528`）。ただし `p18_named_reexport` は名前付き function の再 export を明示的に許しており（`tests/regression-m2-2-builtin-r5-entrance-forms.test.ts:47`）、そのローカル module を namespace としてまとめ直す二段入口が残る。新規 R6-001。 |
| **R5-002** createReadStream / createWriteStream options の structural view | **解消** | `closedOptions()` は options を「省略・文字列リテラル・fresh object literal」に限定し、variable / parameter / return value / spread を型に関係なく違反にする（`output-guard.ts:181-188, 553-557`）。前回の narrower static view で runtime `fd` が消えない問題を、型でなく構文に寄せて閉じている。 |
| **R5-003** EventEmitter の direct listener `this` | **部分的に解消** | direct property access の `process.on` 等と、関数式・関数宣言・method・一部の variable / PropertyAssignment alias は検査する（`output-guard.ts:199-229, 530-534`）。しかし登録 method 自体を element access で書く形と、resolver が扱わない ShorthandPropertyAssignment / PropertyDeclaration / 深い alias が残る。新規 R6-003 / R6-004。 |
| **R5-004** stdio / 規則Kの computed key wrapper | **解消** | `propKey()` と該当箇所が runtime-transparent wrapper を剥がして computed literal key を読むようになっている（`output-guard.ts:271-275, 328-342, 364-377`）。新しい controls (`s01`〜`s11`) も方針と一致する。holder の `process["platform" as const]` は意図的に fail closed のままで、別扱いが明記されている。 |

---

## 3. 「特に見てほしい点」1〜7

### 3.1 R5-001〜004

上表のとおり、**解消2件 / 部分的に解消2件 / 未解消0件**。

R5-001 と R5-003 は、前回提示した具体例の多くは直っているため「未解消」ではない。一方、同じ根本原因の普通の構文が残るため「解消」とも判定しない。

### 3.2 ADR-0019「入口の表」の網羅性と `src/` の値

`src/` 全36ファイルを読み、import の使い方を照合した。

本文から直接数えられる値は一致している。

- `node:fs`: value の名前付き import **34 specifier / 16名**、namespace/default/dynamic import/re-export は 0。
- `node:child_process`: value import **5 specifier**。本文上の call は `execFileSync` 5、`spawnSync` 1、`spawn` 1で計7。
- `node:crypto`: 3 specifier。
- `node:path`: default import 9。
- `node:string_decoder`: 1。
- `node:zlib`: 1。
- `commander`: 1。
- `jsonc-parser`: value specifier 2。
- `zod`: 4。
- `createReadStream` / `createWriteStream` / `Utf8Stream`: 現 `src/` では 0。

一方、表の `node:fs 151 export`、`node:child_process 49 export`、`node:fs/promises 45 export`、PathLike を取る関数62、fd parameter を持つ関数24、fs call 58といった **TypeScript checker / `@types/node` 24.13.3 に依存する実測値**は、パケットに `@types/node` の宣言全文が無く、かつ今回は checker を実行しない条件なので独立再計算できない。この値については「パケットからは独立確認できない」とする。

入口表には、新規 R6-001 の **「ローカル source module が、許可された named re-export を namespace として再び束ねる入口」**が無い。これは表の direct fs/child bundle 行に近いが、実際の module specifier は `./local-module` なので現規則の対象外である。

また R6-002 は表の `Utf8Stream` 行には載っているが、「`new Utf8Stream` を違反」とする規則が declaration provenance を失った constructor abstraction まで覆っていないため、**表にある入口の規則漏れ**である。

R6-003 / R6-004 は許可モジュール表ではなく global `process` / EventEmitter の入口である。したがって入口表には行が無い。Decision 7 の許可分岐表には listener 行があるため、最終回の扱いを明確にするなら、「global process / EventEmitter」を入口表に追加するか、入口表の対象外である global entrance の別表を明示するのがよい。

### 3.3 追加規則の誤検出、`FD_OPTION_APIS` / `FORBIDDEN_FS_CLASSES`

R5-002 の literal-only options は意図的に強い fail-closed であり、現在の `src/` とは両立している。

具体的には、

- options variable に実際は `fd` が無くても違反 (`b14`)。
- `createReadStream` は読み取り専用でも `fd` options を同じ規則で絞る。
- direct dynamic `import("node:fs")` は、その具体的な利用が読み取りだけでも違反。
- `new Utf8Stream` は options に危険値が無くても一律違反。

という代償がある。これは ADR の影響節に明記されており、「誤検出なし」とは主張していないため、設計上は整合している。

`FD_OPTION_APIS` と `FORBIDDEN_FS_CLASSES` については、回帰テスト `fdApisOfFs()` が、

1. `@types/node` で `fd` を取る API がリストから漏れていないか
2. リストにある API が実際に `fd` を取り、argument index / class 判定も一致するか

を**両方向**で比較する実装になっている（`tests/regression-m2-2-builtin-r5-entrance-forms.test.ts:195-233`）。テストの構造は妥当。

ただし、実際の `@types/node` 宣言全文が packet に無いため、`FD_OPTION_APIS = {createReadStream:1, createWriteStream:1}` と `FORBIDDEN_FS_CLASSES = {Utf8Stream}` が本当に宣言と完全一致するかは、静的読解だけでは独立確認不能。テストを実行したという実装側記録を、独立確認の代わりにはしない。

### 3.4 既存テストの期待値変更13件

**13件の変更方針は妥当**と判断する。ただし、その意味は2種類に分けるべきである。

- EventEmitter 11件 (`x25`・`x26`・`x36`・`x37`・`g06`、`ee01`〜`ee06`): `process.on` / `once` 等が listener を emitter を `this` として呼ぶという今回の threat model に直接対応するため、「報告される」への変更は妥当。
- `b14_control_optional_no_fd`: その fixture の static type に `fd` は無いが、literal-only options 方針では variable/parameter を許さない。その**代償としての false positive**を固定する変更であり、方針と一致。
- `ct07_dynamic_import_allowed` → `di05_fs_dynamic_import_namespace`: fixture 自体は `readFileSync` だけで端末へ書かないが、`import("node:fs")` が fs function bundle を値として返す入口を一律禁止するための**入口側の false-positive cost**。これも選んだ方針とは整合する。

したがって、13件を「すべて terminal-reaching fixture に変わった」と解釈してはいけないが、v0.5.22 の fail-closed policy の期待値変更としては妥当。

### 3.5 既知の限界と分類

既存の次の分類は概ね妥当。

- R3-005 の static `string` に隠れた runtime fd: **(ii)**。一般に閉じると普通の string path と衝突する。
- generic cast の carrier と cast 対象が別: **(ii)**。単純な全面禁止は `src/security/mask.ts` の正当な `maskDeep<T>` と衝突する。
- conditional / mapped type の generic cast: **(ii)**。一般化した規則は普通の generic code と衝突する。
- `stdio` 後ろの computed method: **(iii)**。実行時には stdio が function となり Node が拒否し、terminal に届かない。
- listener が Record / array / element access の先で初めて分かる形: **(ii)**。現 `src/cli-signals.ts:30` と `src/cli.ts:66` が `handlers[signal]` 型の普通の書き方を使うため、広い element-access 禁止とは両立しない。

ただし ADR の「残る EventEmitter は indirect form だけ」という記述は、R6-003 / R6-004 により過大である。特に shorthand property や element-access registration method は、Record の先を追う問題とは別で、普通の direct-ish form である。

### 3.6 Decision 7 の原則文

「許可の根拠は構文・最上位宣言名・declaration resolution、型で許可する明示例外は2つ」という記述自体は、今回読んだ主要分岐と概ね一致する。

問題は **「fs・child_process の関数は値の入口を先に塞ぐ」**という実装上の完成度である。

- R6-001: direct fs/child module の入口は塞いだが、許可した named re-export の先で local source module namespace を作る二段入口が残る。
- R6-002: function bundle ではない class (`Utf8Stream`) は、constructor value の provenance を失うと table row の規則が外れる。

したがって原則そのものより、**入口の定義がまだ1段狭い**。外部 module specifier だけでなく、「terminal-capable value が source module / local abstraction を経由して新しい bundle / constructor view になる入口」まで、表の境界をどこに置くか明文化した方がよい。

### 3.7 ROADMAP の「r6 を最後にする」基準

r6 で終えるという回数上限自体は、プロジェクト運営上の判断として問題ない。

ただし、今回の4件はすべて **`src/` 0か所だが、不注意で書ける terminal-reaching shape** である。ROADMAP の item 2 は `src/` 0 の残りを (i)/(ii)/(iii) に分類して終える、と書いているため、この4件を無理に item 2 へ入れるのは分類規則と矛盾する。

最終処理は次が自然である。

- R6-001: 「入口表にない入口」なので ROADMAP item 3 に従い、表＋規則を追加。
- R6-002: 表にある `Utf8Stream` 行の規則漏れなので、その行の規則を補強。
- R6-003 / R6-004: module entrance table外の global process/EventEmitter 入口。Decision 7 の listener 規則を補強し、必要なら入口表に global process 行を追加。
- いずれも `src/` 0なので production code の修正は不要。r7 は増やさず、最終 patch の self-verify / regression で閉じる。

つまり「最後のレビュー」という判断は維持できるが、**最後だから accidental finding を known limit に分類し直す、という処理だけは避けるべき**である。

---

## 4. 新しい指摘

### M2-2-BUILTIN-R6-001

- **重大度: High**
- **分類: 不注意で書ける形**
- **分類の根拠:** barrel / re-export と local namespace import は普通の module 整理方法であり、型偽装やガード回避を意識した値操作を必要としない。
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:411-430, 444-464, 519-528`; `tests/regression-m2-2-builtin-r5-entrance-forms.test.ts:47`; ADR-0019 Decision 7 `:73`、入口表 `:113`
- **入口の表:** **直接の行なし**。最も近いのは「fs・child_process・fs/promises の関数の束としての import の形」（ADR-0019 入口表 `:113`）だが、その行は direct `node:fs` / `node:child_process` 等の bundle entrance だけを扱い、local source module を経由して再び namespace に束ねる入口を載せていない。
- **`src/` 実在:** **0か所**。全36ファイルに `node:fs` / `node:child_process` の re-export は無く、local namespace import も無い。

#### 内容

v0.5.22 は direct module から default / namespace / promises 等の function bundle を得る入口を禁止した一方、**名前付き function の再 export は許可**している。新テストも `p18_named_reexport` を `reported: false` としている。

その名前付き再 export を持つローカル source module は、別ファイルから見ると通常の module namespace になる。現 `FUNCTION_MODULES` は module specifier が直接 `node:fs` / `node:child_process` / `fs/promises` のときしか入口規則を適用しないため、`./local-wrapper` の namespace は規則に入らない。

その namespace を local structural interface の helper に渡すと、helper 内の function declaration は local interface 側に解決され、従来の fs/child call rule も外れる。これは R5-001 で問題になった「関数値を local type に持ち替える」状態を、許可された re-export の先で再生成できることを意味する。

#### terminal へ届く根拠

runtime namespace が保持する function は元の Node fs / child_process function そのもの。fs writer に fd/device path が渡る場合、または child starter に terminal-passthrough stdio が渡る場合、runtime の endpoint は direct import の場合と変わらない。違うのは static declaration が local interface に見える点だけである。

#### 同じ系統

残る。

- named function re-export → local namespace import
- named function re-export → local dynamic import
- local barrel をさらに `export *` で連結した後の namespace
- fs だけでなく child_process の named function re-export

#### 修正案

現 `src/` に Node terminal-capable function の re-export は 0 なので、最も単純なのは **fs / child_process の terminal-sensitive function の named re-export も禁止**すること。そうすれば `p18_named_reexport` は control ではなく violation になる。

named re-export を残したいなら、local source module の export graph をたどり、Node function を含む module namespace を sensitive bundle として扱う必要があり、現在の入口戦略より複雑になる。

---

### M2-2-BUILTIN-R6-002

- **重大度: High**
- **分類: 不注意で書ける形**
- **分類の根拠:** class constructor を compatible な local constructor interface / helper parameter に抽象化するのは通常の dependency injection / factory の書き方で、`any` や虚偽 assertion は不要。
- **確信の度合い: 中**
- **場所:** `tests/structure/output-guard.ts:191-197, 563-570`; ADR-0019 Decision 7 `:77`; 入口表 `:108`; `tests/regression-m2-2-builtin-r5-entrance-forms.test.ts:111-113`
- **入口の表:** **`node:fs` の `Utf8Stream` 行（ADR-0019:108）に該当**。表には入口があるが、規則が direct declaration resolution に依存しているため抜けがある。
- **`src/` 実在:** **0か所**。全36ファイルで `Utf8Stream` は使われていない。

#### 内容

表は `new Utf8Stream` を一律違反と説明するが、実装の `fsClass()` は `new` expression の resolved signature declaration が直接 `@types/node/fs.d.ts` にあるときだけ class 名を返す。

`Utf8Stream` constructor value を compatible な **local construct-signature abstraction** に渡し、その local constructor view を `new` すると、runtime value は元の `Utf8Stream` のままでも、call-site の construct signature declaration は local declaration 側になり得る。その場合 `fsClass()` は null となる。

options に `dest` だけを使う形では、後段の generic `fd` option rule も発火しない。device path rule も fs `CallExpression` 用で、`NewExpression` の `dest` には適用されない。

#### terminal へ届く根拠

入口表自身が、`Utf8Stream` は `dest: "/dev/stdout"` または `fd` により書き込み先を選ぶと記録している。constructor abstraction は runtime constructor を変更しないため、`dest` が terminal device を指す場合の runtime behavior は direct `new Utf8Stream` と同じである。

#### 同じ系統

残る可能性が高い。

- constructor を local construct signature の parameter に渡す
- factory / DI container の constructor slot に入れる
- local constructor-returning helper を経由する

plain `const C = Utf8Stream` のように checker が元 declaration を保つ形は現規則で捕捉できる可能性があるため、本指摘は **declaration provenance を local construct signature が置き換える形**に限定する。

#### 修正案

`Utf8Stream` を「new expression の resolved declaration」だけでなく、**constructor value 自体の sensitive provenance**として扱う。現 `src/` では使わないため、簡単な方法は `Utf8Stream` value を direct `new` callee 以外へ渡す・代入する形を fail closed にし、direct `new` も従来どおり違反にすること。

確信度を「中」としたのは、依頼に従い TypeScript checker を実行して local construct-signature 経由の resolved declaration を実測していないためである。

---

### M2-2-BUILTIN-R6-003

- **重大度: High**
- **分類: 不注意で書ける形**
- **分類の根拠:** `obj["method"](...)` は通常の JavaScript/TypeScript 構文であり、型偽装も値の隠蔽も必要ない。
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:489-508, 530-534`; ADR-0019 Decision 7 listener 行 `:78`; 既知の限界 `:138-155`
- **入口の表:** **行なし**。入口表は許可モジュール用で global `process` / EventEmitter を載せていない。Decision 7 の許可分岐表には `process.on` listener 行がある。
- **`src/` 実在:** **0か所**。現 `src/` の登録は `process.on(...)` の property access であり、`process["on"](...)` 等は無い。

#### 内容

listener rule は CallExpression の callee が `PropertyAccessExpression` のときだけ実行される。

一方、holder rule は `process["on"]` の `"on"` をソース上の安全な literal property access として許可する。`on` は `PROCESS_MEMBERS` の危険 member でも terminal symbol でもないため、この element access 自体は違反にならない。

その結果、**登録 method を element access で書くと、listener argument が direct method reference で `this` を使っていても `listenerUsesThis()` が呼ばれない**。

これは ADR が既知の限界とする「listener argument が Record / element access の先で初めて分かる形」とは別問題である。listener 自体は直接解決できても、登録 method 側の AST 形だけで rule が外れる。

#### terminal へ届く根拠

element access による method call でも receiver は `process` のままで、登録される EventEmitter は同じ。ADR と既存 regression が前提としているとおり、EventEmitter は unbound listener を emitter (`process`) を `this` として呼ぶため、listener body の `this.stdout` 相当は process stdout に到達する。

#### 同じ系統

残る。

- `process["on"]`
- `process["once"]`
- `process["addListener"]`
- `process["prependListener"]`
- `process["prependOnceListener"]`
- 同じ literal element call を `globalThis.process` に対して行う形

非リテラル key は holder の dynamic-access rule が既に fail closed なので、修正対象は source-written literal の listener method に限定できる。

#### 修正案

listener registration の method 名を `PropertyAccessExpression` だけで読むのではなく、callee が PropertyAccess / ElementAccess の双方で source-written listener method 名に解決できる helper にする。element access の base について従来どおり `holderOf()` を確認すればよい。

最終回の「表に無い入口は追加」の扱いを厳密に適用するなら、global `process` / EventEmitter の入口を入口表へ1行追加する。

---

### M2-2-BUILTIN-R6-004

- **重大度: High**
- **分類: 不注意で書ける形**
- **分類の根拠:** shorthand property、class field、数段の local alias は通常の整理・リファクタリングで現れ、ガード回避を意図する必要がない。
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:208-229, 530-534`; ADR-0019 Decision 7 listener 行 `:78`; 既知の限界 `:138-155`; `tests/regression-m2-2-builtin-r5-entrance-forms.test.ts:89-93`
- **入口の表:** **行なし**。R6-003 と同じ global process/EventEmitter entrance。Decision 7 listener 行には「変数・object のプロパティを3段まで」と書かれており、本件はむしろその行の実装漏れ。
- **`src/` 実在:** **0か所**。現 `src` の危険な unbound method 登録は0。`src/cli-signals.ts:30` と `src/cli.ts:66` は Record element の先にある arrow handler で、ADR が別途 (ii) として扱う既知の形。

#### 内容

`listenerUsesThis()` が alias を追うとき、symbol declaration の initializer を取り出す対象は **PropertyAssignment と VariableDeclaration だけ**である。

そのため、例えば method reference を一度 variable に入れ、それを object の **shorthand property** にした後 `box.h` を listener に渡すと、`box.h` の property symbol の declaration は ShorthandPropertyAssignment になり、resolver は initializer を追わない。

同じ問題は、initializer を持つ **PropertyDeclaration（class field）**にもある。

さらに resolver は alias を `depth < 3` で打ち切るため、普通の variable / property alias を4段以上重ねると declaration まで到達しない。ADR は「3段まで」と明記しているものの、3段を超える形を (i)/(ii) の既知の限界として分類していない。

新テストの `r13_property_indirect` は `{ h: r.onEvent }` という PropertyAssignment なので捕捉できるが、shorthand property はテストされていない。

#### terminal へ届く根拠

alias / shorthand / field は function object 自体を bind しないため、runtime で登録される値は元の unbound method のまま。EventEmitter が `process` を `this` として呼ぶため、元 method が `this.stdout` 相当を使えば、direct method reference と同じ経路で stdout に到達する。

#### 同じ系統

残る。

- ShorthandPropertyAssignment
- PropertyDeclaration / class field initializer
- 4段以上の variable / property alias
- getter や別の declaration kind が function value を返す場合

Record / array / dynamic element access のように現在の `src` と衝突する既知の (ii) と、これらの **静的に declaration を解決できる普通の形**は分けるべきである。

#### 修正案

少なくとも、

- ShorthandPropertyAssignment は shorthand value symbol / 元 variable を追う
- initializer を持つ PropertyDeclaration を追う
- 固定深度ではなく、visited-symbol / visited-node set で cycle を防ぎながら alias を追う

形にすると、Record element の動的 value flow に踏み込まずに direct-resolvable accidental forms を広く閉じられる。

---

## 5. 新しい指摘の件数

| 分類 | High | Medium | Low | 合計 |
|---|---:|---:|---:|---:|
| **不注意で書ける形** | **4** | 0 | 0 | **4** |
| **(i) 意図的な偽装が要る形** | 0 | 0 | 0 | 0 |
| **(ii) 塞ぐ規則が `src/` と両立しない形** | 0 | 0 | 0 | 0 |
| **(iii) 端末へ届かない誤検出** | 0 | 0 | 0 | 0 |
| **合計** | **4** | **0** | **0** | **4** |

既存 ADR に記録済みの (i)/(ii)/(iii) と、v0.5.22 が意図的に受け入れた false-positive cost は、この「新しい指摘」の件数には含めていない。

---

## 6. 良い点

- R5-002 を「型をもっと賢く見る」のではなく、`fd` を取る stream API の options を syntax で閉じたのは、前回の根本原因に合っている。
- direct fs / child_process module bundle を入口で止める方針は、従来の AST 構文を1個ずつ追う方式より理解しやすい。
- EventEmitter の direct listener を「全部禁止」ではなく、宣言を解決して `this` を使う body だけ止めたのは、現 `src` の handler table と両立する狭い規則になっている。
- computed key の wrapper 修正を holder の `process[...]` へ広げず、stdio / rule K の局所に限定したのは、R5-004 の意図に合う。
- 13件の expectation change を明示し、false-positive cost を ADR に残しているため、fail-closed の代償を隠していない。
- `src/` 全36ファイルを packet に含めたことで、今回は各 finding の現 `src` 実在数を 0 と独立に確認できた。

---

## 7. 未確認・読み切らなかった範囲

1. **対象コード・fixture・テストは一切実行していない。** すべて静的読解である。
2. Request、Previous R5 review、v0.5.22 の Diff、変更後 `tests/structure/output-guard.ts` 全文、新しい R5 regression、期待値を変えた既存 regression、ADR-0019、ROADMAP の終了基準、response の今回対応部分、`src/` 全36ファイルの関連 import / call / listener は確認した。
3. `src/` 全36ファイルについて、今回の terminal entrance に関係する import / export / fs / child_process / process listener / class usageは横断確認したが、**terminal guard と関係しない業務ロジックを36ファイルすべて1行ずつ別目的でレビューしたわけではない**。
4. `@types/node` 24.13.3 の declaration files 自体は packet に全文収録されていない。そのため、入口表の export 総数、PathLike / fd parameter の総数、`FD_OPTION_APIS` / `FORBIDDEN_FS_CLASSES` の値そのものは独立再計算していない。両方向テストの実装が妥当であることまで確認した。
5. `tests/regression-m2-2-builtin-r5-entrance-forms.test.ts` の `fdApisOfFs()` も実行していない。
6. R6-002 は TypeScript の通常の construct-signature resolution から判断したが、local constructor interface を用いた新 fixture をコンパイルして確認していないため、確信度を「中」とした。
7. 15,255行の packet に重複して収録されている古い CHANGELOG 全履歴や、今回の R5 修正・入口表と無関係な過去マイルストーンの全行は再レビューしていない。今回の判断に必要な current source / current docs /指定された回帰テストを優先した。

---

## 8. 最終判断

**R5-001 と R5-003 は部分的に解消、R5-002 と R5-004 は解消。新規 High 4件はいずれも不注意で書ける形、現 `src/` では0か所。**

したがって production `src/` に今すぐ存在する terminal bypass は今回の4件からは確認されない。一方、構造ガードの将来の不注意防止という目的では、4件を既知の (i)/(ii)/(iii) として受け入れるのは適切ではない。

この回を最後にするなら、次の順で **レビュー回を増やさず最終修正**するのがよい。

1. R6-001: sensitive named re-export の扱いを決め、入口表に local re-bundle の入口を追加するか、named re-export 自体を禁止。
2. R6-002: `Utf8Stream` を constructor declaration だけでなく sensitive constructor value として扱う。
3. R6-003: listener registration method の literal element access も direct property access と同じ規則へ入れる。
4. R6-004: listener resolver に shorthand / property declaration を追加し、固定3段を cycle-aware traversal に置き換える。
5. ADR-0019 の「残る EventEmitter は indirect form だけ」を修正後の実装に合わせ、ROADMAP ではこの4件を「不注意」のまま処理したことを残す。

この形なら、r7 を依頼しないという人間側の上限を守りつつ、「最後だから分類を緩める」のではなく、最終レビューで見つかった accidental gap をその場で閉じる、という基準を維持できる。
