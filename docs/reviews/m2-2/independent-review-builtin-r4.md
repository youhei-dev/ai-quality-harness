<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-builtin-r4-for-claude.md、ChatGPT、2026-09-30 受領、26,025 バイト、対象範囲 v0.5.19..v0.5.20）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 074436e263d9b1115542cddbc173ffd84bc5da66f894b0d64842cd6e3ebbff25
-->

# independent review — M2-2 BUILTIN R4

対象: `v0.5.19..v0.5.20` (`be06222ee1a3..d669b5e0ff42`)

レビュー方法: 添付 ZIP を展開し、Request、Previous Reviews、Diff、変更後全文、Documents、Integrity を静的に読んで判断した。対象コード・fixture・テストは実行していない。ZIP と内部 Markdown の SHA-256 / バイト数は依頼文の値と一致した。

## 1. 結論

### 新しい指摘

- **High: 4 件**
- **Medium: 2 件**
- **Low: 0 件**

### 前回 R3-001〜008

- **解消**: R3-001, R3-002, R3-004, R3-007, R3-008
- **部分的に解消**: R3-003, R3-005, R3-006
- **未解消**: 0 件

v0.5.20 は前回の具体例をかなり正確に閉じている。writer の正確な組と全枝 `Safe`、同名の局所 declaration、optional/default/rest/callback による generic cast、`stdio` の後続 spread、`.constructor` の wrapper、fs writer の data 引数の誤検出は、コード上で前回より明確に改善している。

一方で、**レビューをここで終了できる状態とは判断しない**。新規 High には、型の偽装を必要としない、通常の union 型、options の union、namespace の要素アクセス、computed property といった「不注意で書ける形」が含まれる。

また、ROADMAP の「新しい指摘が意図的な偽装を要る形だけなら終了」という基準自体は理解できるが、現在の既知の限界にも、EventEmitter に unbound method を渡す形や R3-005 の `any`→`string` 注釈のように、必ずしも意図的なガード回避を必要としない形がある。したがって「箱2 = すべて意図的」とは扱わない方がよい。

---

## 2. M2-2-BUILTIN-R3-001〜008 の判定

| ID | 判定 | 根拠 |
|---|---|---|
| **R3-001** writer / `Safe` | **解消** | `WRITER_CALLS` が `emitOut` と `emitErr` の terminal call を別々に限定し (`tests/structure/output-guard.ts:75-80`)、`allSafe()` が union は全枝、intersection は少なくとも1枝を要求する (`:194-199`)。`writerCall()` は1引数・正確な member・全枝 Safe を要求する (`:401-410`)。現 `src/output.ts:173-180` もこの4組だけ。 |
| **R3-002** owner 名だけの認可 | **解消** | `topOwnerName()` は SourceFile 直下の function/class/variable まで上がるため、同名の局所関数・method は認可されない (`tests/structure/typescript.ts:65-81`)。output creator は `output-guard.ts:432-435`、brand creator / issuer caller は `brand-guard.ts:101-115,128-132` でこれを使う。TypeScript の同一 top-level value scope で別の実行可能 declaration を同名で置く通常形もない。 |
| **R3-003** generic cast | **部分的に解消** | optional/default/rest/`T[]`/callback などは外れ、required・defaultなし・restでない「型が T そのもの」の parameter だけを carrier とする (`output-guard.ts:414-422`, `brand-guard.ts:109-115`)。ただし `T` の正当な値を別 parameter で受けながら、別の raw 値を `as T` する形は値の流れを追わないため残る。ADR-0019:113 に明記されている。 |
| **R3-004** `stdio` の後続 spread | **解消** | `stdio` より後ろの `SpreadAssignment` を明示的に違反にする (`output-guard.ts:221-231`)。前の spread は最後の直接 `stdio` が上書きするため許可する。なお、spread 以外の後続 computed property は別の新規指摘 R4-004。 |
| **R3-005** runtime fd を path 型に見せる | **部分的に解消** | call-site の assertion / `satisfies` は `unwrapped(first) !== first` で追加検出する (`output-guard.ts:363-370`)。しかし static type を `string` にした変数は既知の限界 (`ADR-0019:110-112`)。さらに、新規 R4-001 の `string | number` のように static type 自体が fd を含む自然な union も見逃す。 |
| **R3-006** fs / child function の持ち替え | **部分的に解消** | `@types/node` の fs / child_process function を指す **Identifier** は direct callee 以外で違反になる (`output-guard.ts:283-292`)。named import の retype、`.call` / `.apply` / `Reflect.apply` には効く。しかし element access で関数を得る形は Identifier ルールに入らず、新規 R4-003 が残る。 |
| **R3-007** `.constructor` wrapper | **解消** | `unwrapped()` が parentheses / `as` / type assertion / `satisfies` / non-null を剥がし (`output-guard.ts:176-181`)、`.constructor` の element key 判定で使われる (`:316-317`)。名前を組み立てる形は ADR の既知の限界のままで、今回の対象外。 |
| **R3-008** fs の全引数を device path 扱い | **解消** | `FS_WRITERS` は先頭引数だけ、それ以外の fs API は全引数を見る (`output-guard.ts:371-375`)。write data が `/dev/...` に見えるだけの誤検出は解消。read-only API の device path 誤検出は ADR-0019:116 に意図的に残している。 |

---

## 3. Request の「特に見てほしい点」1〜6

### 1. R3-001〜008

上表のとおり。5件解消、3件部分的に解消。

### 2. ADR-0019 決定7の「許可の分岐の表」

**問題あり: M2-2-BUILTIN-R4-006。**

表は R3 の主要な許可をかなり正確に説明しているが、「`tests/structure/` の許可 = 違反を返さない判断を表と1対1」と読むには不足し、表の前後の原則文とも矛盾する。

### 3. 追加規則と `src/` / 対照の誤検出

現行の関連 `src/` との適合は概ね良い。

- `src/output.ts:173-180`: writer は規定の4組だけ。
- `src/cli-signals.ts:28-33`: handler は引数として渡すが、ここ自身は `this` を使わない。
- `src/cli.ts:58-66`: 実際の signal handler は arrow function。
- `src/security/mask.ts:26-38`: `maskDeep<T>(value: T)` は required の exact `T` parameter を持つため、新 generic rule と両立。
- `src/review/checked.ts:46-58,87`: `issue` と `REJECTED` は想定した top-level declaration。

ただし **R4-005** のとおり、fs target の単なる parentheses / non-null と、child options object の parentheses に安全側の誤検出が残り、後者は回帰テスト自身が `reported: true` として固定している。

### 4. 既知の限界の記述

記述そのものは、以前よりかなり正確で、R3-005、generic cast の残り、EventEmitter `this`、brand-guard の広げ、read-only device path を明示している点は良い。

ただし分類には注意が必要。

- **R3-005**: `JSON.parse()` 等の `any` を `string` 注釈へ入れる形は、意図的な型偽装でなくても起こり得る。
- **EventEmitter `this`**: `function (this: 偽の型)` は意図的寄りだが、object/class method を unbound listener として渡す形は、通常の JavaScript/TypeScript のミスとしても起こり得る。`tests/regression-m2-2-builtin-r3-allow-branches.test.ts:175-181` のうち method-reference 系は、必ずしも「意図的な偽装が要る」とは言えない。
- **brand-guard K3**: expression-bodied arrow で container を広げる形も、文法としては自然で、常に意図的な回避とは限らない。ただしこれは Checked/Md 側で、今回の新規 terminal bypass 件数には数えていない。
- **read-only device path**: fail-closed の誤検出として明確に書かれており、過大保証ではない。

したがって、`docs/ROADMAP.md:338-343` の「箱2の性質 = 意図的な偽装」と、箱2に入っている全形を同一視しない方が安全。

### 5. 指定された `src/` 全文との適合

上記の5ファイルでは、今回の新規 finding の形は **0か所**。ただしパケットには repository の `src/` 全ファイル全文が入っているわけではないため、以下の各 finding の「src/ 0」は **Request が関連 source として全文掲載した範囲での 0** とする。repository-wide の厳密な件数は、このパケットだけからは独立確認できない。

`src/review/packet.ts` の `issueMd` 本体も Documents に全文掲載されていないため、その creator の現行実装との適合は未確認。

### 6. `package-lock.json` の `brace-expansion` が1か所だけか

**パケットからは確認できない。**

確認できるのは次まで。

- Commits 表では `1e3e18edbc70` が `package-lock.json` 1ファイルだけを変更している。
- Changed Files では lock の最終サイズは 84,020 bytes。
- Integrity には最終 SHA-256 `9e300028...639121` がある。
- CHANGELOG / response は `brace-expansion 5.0.9 → 5.0.12` の1か所だけと説明している。

しかし packet tool の仕様で lock の Diff / Full Source が無いため、「lock 内の変更が本当にその1か所だけ」は独立に照合できない。実装側の記述だけを根拠に「問題なし」とはしない。

---

## 4. 新しい指摘

## M2-2-BUILTIN-R4-001

- **重大度: High**
- **分類: 不注意で書ける形**
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:363-375`
- **関連:** `tests/regression-m2-2-builtin-r3-allow-branches.test.ts:86-91`（既存 R5 は単独 number / assertion までで union はない）
- **src/ 実在:** 関連して全文掲載された5ファイルでは 0。全 `src/` の repository-wide 件数はパケットから未確認。

### 内容

fs writer の先頭引数が `string | number`、`PathLike | number`、あるいは `1 | string` のような **union** のとき、実行時に fd 1/2 になり得ても数値 fd として検出されない。

### なぜすり抜けるか

`output-guard.ts:366-370` は first argument の型そのものについて `Any` または `NumberLike` を見る。TypeScript の union type は `Union` であり、union 本体に `NumberLike` flag は立たない。続く device path 判定 (`:372-375`) も、union の string literal constituent を分解しない。

したがって、型が自然に `string | number` になった first argument は、数値枝を含むのに fd 判定を通らない。

これは型を偽る必要がない。Node の fs API 自体が path と fd の両方を受けるため、その union を parameter や条件式の型として持つのは普通にあり得る。

### 標準出力・標準エラーへ届く根拠

パケット自身の R3 fixture `r5e_number_typed_fd` (`regression...:90`) は、数値 fd を fs writer の先頭へ渡す形を terminal 経路として違反にしている。union の実行時値が同じ数値 fd なら、呼ばれる Node API と runtime value は同じである。静的型だけが union になったことでガードが外れる。

### 修正案

fd 判定を top-level flags だけでなく「**その型が runtime number になり得るか**」として実装する。少なくとも union は constituent を再帰して、1枝でも `NumberLike` なら違反にする。必要なら constrained type parameter も base constraint を同じ helper で見る。

---

## M2-2-BUILTIN-R4-002

- **重大度: High**
- **分類: 不注意で書ける形**
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:201-207,381-384`
- **関連:** `tests/regression-m2-2-builtin-r3-allow-branches.test.ts:132-150`
- **src/ 実在:** 関連して全文掲載された5ファイルでは 0。全 `src/` は未確認。

### 内容

K1 の `fd` option 検出は、通常の object type には効くが、**union / type parameter など「object の1枝が fd を持つ」型を分解しない**。

たとえば options が「fd を持つ枝」と「通常の flags だけの枝」の union であれば、runtime では fd を持つ枝になれるが、`hasFdProperty()` は見逃す。

### なぜすり抜けるか

`hasFdProperty()` は、object literal の computed literal `"fd"` を特別扱いした後、

`(t.flags & ts.TypeFlags.Object) !== 0 && checker.getPropertyOfType(t, "fd") !== undefined`

だけを見る (`:201-207`)。

union は `TypeFlags.Union`、type parameter は `TypeFlags.TypeParameter` であり、この `Object` gate に入らない。したがって constituent / constraint に `fd` があっても検出しない。

同様に、実行時にキーが `"fd"` になり得る computed property でも、ソース上の literal `"fd"` でなく、型にも concrete `fd` property が出なければ残る。

### 標準出力・標準エラーへ届く根拠

既存 fixture `xc02_fd_option_variable` と `xb21_fd_direct_control` (`regression...:135,150`) は、`createWriteStream` の options に fd 1 がある形を terminal 経路として扱っている。union の runtime branch が同じ `{ fd: 1 }` なら、stream が使う runtime fd は同じである。

### 修正案

`hasFdProperty()` を union / intersection / constrained type parameter に再帰させ、「どれか1枝で fd を持ち得る」なら fail closed にする。computed key は、literal `"fd"` だけでなく、`fd` になり得ることを静的に否定できない動的 computed name をどう扱うかも ADR で決める。

---

## M2-2-BUILTIN-R4-003

- **重大度: High**
- **分類: 不注意で書ける形**
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:283-292,137-143,363-379`
- **関連:** `tests/regression-m2-2-builtin-r3-allow-branches.test.ts:94-107`
- **src/ 実在:** 関連して全文掲載された5ファイルでは 0。全 `src/` は未確認。

### 内容

R3-006 の「fs / child_process function は callee としてだけ使う」規則が、**関数を指す Identifier だけ**を追っている。そのため namespace object から element access で関数を取り出す形、たとえば `fs["writeFileSync"]` のような参照を local function type へ入れると、callee-only rule を通らない。

これは named import をわざと `any` にするような型偽装を必要としない。namespace import と bracket access、通常の function type annotation / DI の組み合わせで起こり得る。

### なぜすり抜けるか

R3-006 の追加規則は `ts.isIdentifier(n)` から始まる (`:283-292`)。element access の property name は Identifier ではなく、`fs` 側の Identifier は module namespace を指すので Node の fs function declaration ではない。

その値を local function type に保持した後の call は、`fsFunction()` (`:137-143`) が `getResolvedSignature(call).getDeclaration()` を見ると local 側の signature に解決するため、fs call と認識されない。

### 標準出力・標準エラーへ届く根拠

runtime value は元の `writeFileSync` / `spawnSync` そのものなので、危険な path / stdio を渡した場合の runtime behavior は R3-006 の既存 retype fixture と変わらない。違うのは、元 function を得る構文が named Identifier でなく element access である点だけ。

### 修正案

「Identifier が Node function declaration に解決するか」ではなく、**値として参照された expression 自体の provenance** を見る。最低限、PropertyAccessExpression / ElementAccessExpression の property symbol が `@types/node` の fs / child_process function declaration に解決する場合も、direct callee 以外なら違反にする。

`node:fs` の `promises` sub-namespace など declaration file が別になる経路も、同じ provenance helper で扱う方が漏れにくい。

---

## M2-2-BUILTIN-R4-004

- **重大度: High**
- **分類: 不注意で書ける形**
- **確信の度合い: 中**（runtime の property overwrite は確実。今回 fixture を実行していないため、個々の computed-key 型の TypeScript 受理形までは実測していない）
- **場所:** `tests/structure/output-guard.ts:220-231`
- **関連:** `tests/regression-m2-2-builtin-r3-allow-branches.test.ts:77-81`
- **src/ 実在:** 関連して全文掲載された5ファイルでは 0。全 `src/` は未確認。

### 内容

`stdio: "pipe"` の後ろを検査するのは **SpreadAssignment だけ**で、後ろの computed property が runtime で `stdio` を上書きする形を見ない。

### なぜすり抜けるか

`stdioProblem()` は最初の直接 `stdio` PropertyAssignment を見つけ (`:224-226`)、その後ろに SpreadAssignment があるかだけを見る (`:227`)。後続の computed PropertyAssignment / accessor / method が `stdio` という key になる可能性は検査しない。

その後、最初に見つけた `stdio` initializer が `"pipe"` / `"ignore"` なら `null` を返す (`:228-231`)。

JavaScript の object literal は後から評価された同名 property が最終値になるため、後続 computed key が実行時に `stdio` なら、ガードが確認した `"pipe"` は最終値ではない。

### 標準出力・標準エラーへ届く根拠

既存 R3-004 fixture は、後続 spread が `stdio` を `inherit` に上書きすると child が parent terminal に届くことを前提にしている。computed property でも object の最終 `stdio` が `inherit` になれば、child_process に渡る options の runtime shape は同じになる。

### 修正案

direct `stdio` より後ろについて、SpreadAssignment だけでなく **`stdio` を上書きし得る computed property** も fail closed にする。ソース上の literal で別名と証明できる computed key だけ許可する、という単純な方針が現在の threat model と整合する。

---

## M2-2-BUILTIN-R4-005

- **重大度: Medium**
- **分類: 不注意で書ける形**
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:176-180,220-231,363-370`
- **関連:** `tests/regression-m2-2-builtin-r3-allow-branches.test.ts:154` (`xb25_stdio_options_paren`)
- **src/ 実在:** 関連して全文掲載された5ファイルでは 0。全 `src/` は未確認。

### 内容

runtime-transparent wrapper の扱いが2方向で不整合になり、**安全な普通の書き方を違反にする**。

1. fs writer の first argument は `unwrapped(first) !== first` なら「type was set by an assertion」と扱うため、単なる parentheses や non-null (`!`) も assertion と同じ違反になる。
2. 逆に child の options object 自体は `unwrapped()` せず `ts.isObjectLiteralExpression` を直接探すため、安全な object literal を parentheses で囲むだけで「stdio が無い」と扱う。回帰テスト `xb25_stdio_options_paren` はこの安全側の違反を期待値にしている。

### 誤検出になる理由

`unwrapped()` (`:176-180`) は parentheses、`as`、type assertion、`satisfies`、non-null を全部剥がす。しかし R3-005 の追加条件 (`:367-368`) は「剥がれたか」だけを見て、**本当に type-changing wrapper があったか**を区別しない。

一方 `stdioProblem()` の options 検索 (`:224`) は outer parentheses / assertion を剥がさない。

### 標準出力・標準エラーへ届く根拠

**なし。この指摘は bypass ではなく誤検出。** ordinary path への write や `stdio: "pipe"` のままなので、ここで問題なのは安全なコードを拒否すること。

### 修正案

- fs target 用に「type-changing wrapper が存在するか」の helper を分ける。parentheses / non-null は単独では R3-005 の violation にしない。外側を剥がしながら途中に `as` / type assertion / `satisfies` があった場合だけ違反にする。
- `stdioProblem()` は、options argument についても runtime-transparent wrapper を剥がしてから object literal を探す。その中の最終 `stdio` 判定は現在の fail-closed 方針を維持する。

---

## M2-2-BUILTIN-R4-006

- **重大度: Medium**
- **分類: 不注意で書ける形**（将来の guard 修正・レビューで、表に無い許可を見落とすリスク）
- **確信の度合い: 高**
- **場所:** `docs/adr/0019-builtin-allowlist-process-members.md:55-75`; `tests/structure/output-guard.ts:124-134,194-199,323-341,401-422`
- **src/ 実在:** N/A（docs / guard inventory の不一致）

### 内容

ADR-0019 決定7の冒頭は、

> 許可の根拠は、構文か最上位の宣言の名前にする。型は、違反を見つけるために使う

と書き、さらに「許可の分岐の表」を `tests/structure/` の許可と定義している (`ADR-0019:55-60`)。しかし実コードと表自身が、この原則の例外を持つ。

### 具体的な食い違い

1. **writer は型を許可根拠に使う。** `writerCall()` は `allSafe(checker.getTypeAtLocation(first))` が true のとき terminal finding を除外する (`output-guard.ts:401-410`)。表の writer 行も「型が全枝 Safe」と正しく書いている (`ADR:66`)。したがって「型は違反検出だけ」という冒頭文とは一致しない。
2. **generic cast も型を許可根拠に使う。** required parameter の type node が対象 type parameter symbol そのものかで `as T` を許可する (`output-guard.ts:414-422`; `ADR:69`)。
3. **fs / child direct call は declaration resolution を許可根拠に使う。** `fsFunction()` / `starter()` は `getResolvedSignature(...).getDeclaration()` に依存する。これは「構文か top-level declaration name」の二択ではない。
4. 「`tests/structure/` の許可を1対1」と読むなら、`moduleProblem()` の allowlist (`output-guard.ts:124-134`) や holder の named property read / discarded value / ordinary destructuring (`:323-341`) なども表にない。

### 標準出力・標準エラーへ届く根拠

**この finding 自体は docs / inventory の不一致なので、直接の runtime terminal reach はない。** ただし R3 で「広い保証を書いたため別の許可分岐を見逃した」ことの再発防止策としてこの表を導入しているため、棚卸し表の定義が曖昧なままだと将来のレビューで実害のある分岐を見落とす。

### 修正案

次のどちらかにする。

- **本当に全許可の表にする**: module allowlist、holder の安全な named access、writer の Safe-type authorization、generic carrier、declaration-resolution 系などを含めて全数を載せる。
- **範囲を狭く明記する**: 表題を「決定7で今回棚卸しした許可分岐」に変え、「全 `tests/structure/` の許可」とは書かない。

さらに原則文は、少なくとも「構文・top-level declaration name・declaration resolution・表に明示した Safe/generic の型条件」に合わせる。writer の `Safe` は safeForgeries と組み合わせて信頼する、という設計なら、その例外を明示する方が正確。

---

## 5. 良い点

- R3-001 の修正はよい。writer 名だけでなく **writer と terminal member の組**を固定し、union の Safe 判定を全枝にしたのは、前回の穴に直接対応している。
- `topOwnerName()` による R3-002 の修正は、局所の同名 declaration を許可しないという目的に対して小さく分かりやすい。
- R3-003 は `maskDeep<T>(value: T)` という現 `src/` の正当形を残しながら、optional/default/rest/callback を閉じている。
- R3-004 の「後続 spread」、R3-007 の wrapper、R3-008 の writer first argument 限定はいずれも、前回の具体的指摘に対して局所的で追いやすい。
- 既知の限界を ADR に明示し、「悪意あるコードへの完全保証ではない」としている点は適切。特に R3-005 の残りを解消済みと装っていないのは良い。
- Request に指定された関連 `src/` を読む限り、今回の強化と現在の実装は概ね両立している。

---

## 6. 未確認の範囲

1. **対象コード・fixture・テストは実行していない。** 依頼どおり静的読解のみ。
2. パケットは repository の **全 `src/` の全文を収録していない**。そのため各新規 finding の repository-wide の実在件数は独立に数えられない。Request が関連 source として全文掲載した5ファイルでは 0。
3. `src/review/packet.ts` の `issueMd` 本体は全文未収録のため、R3-002 の creator 適合のその1点は未確認。
4. R4-004 の computed-property 形は JavaScript の runtime overwrite と guard の分岐はコードから確実に判断できるが、具体的な computed-key の各型が repository の tsconfig でどこまで受理されるかは、fixture を実行しない条件のため実測していない。確信を「中」とした。
5. `package-lock.json` は Diff / Full Source 非掲載なので、`brace-expansion` の変更が lock 内で本当に1か所だけかは確認不能。最終 hash / bytes と「commit が lock 1ファイルだけを触った」ことまで確認した。

---

## 最終判断

v0.5.20 は R3 の主要な修正としては前進しており、特に R3-001・002・004・007・008 は解消と判断する。しかし、**不注意で書ける High が新たに4件**あるため、今回の builtin guard のレビューを終了する条件にはまだ達していない。

優先順位は、

1. R4-001: fs target の union 中の numeric fd
2. R4-002: fd option の union / constrained type
3. R4-003: fs / child function の element-access provenance
4. R4-004: `stdio` の後続 computed-property override
5. R4-005: wrapper の誤検出整理
6. R4-006: ADR の許可分岐表と原則文の整合

の順がよい。

特に R4-001 と R4-002 は、「型を偽る」必要がなく、Node の API 型に自然に出てくる union だけで成立するため、今回の Request がいう **不注意で書ける形**に明確に該当する。
