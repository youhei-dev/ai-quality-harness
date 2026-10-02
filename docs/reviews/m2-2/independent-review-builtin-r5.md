<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-builtin-r5-for-claude.md、ChatGPT、2026-10-02 受領、34,932 バイト、対象範囲 v0.5.20..v0.5.21）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。
無改変の原文の SHA-256: b5a25aa43f4344690cf33832c1b5d5170fd42ff18225cb2a638757738cea6f7c
-->

# independent review — M2-2 BUILTIN R5

対象: `v0.5.20..v0.5.21`

レビュー方法: 添付 ZIP を展開し、Request、Previous Reviews、Commits、Changed Files、Diff、変更ファイル全文、ADR-0019、ROADMAP、response-builtin-r4、新旧の回帰テスト、`src/` 全36ファイルを静的に読んで判断した。依頼どおり、対象コード・fixture・テストは実行していない。

整合性確認:

- ZIP: **1,163,382 bytes** / SHA-256 `35c2cc4f3629203466c96a7ce162874749d357d9074373deb5fb796541fe40c7` — 依頼文と一致。
- 内部 Markdown: **1,163,220 bytes / 14,036 lines** / SHA-256 `4e12dbc6c39fff1ddba696b2ee0bb2480e57ddfd9094f97a56626168bfa525de` — 依頼文と一致。

---

## 1. 結論

### 前回 M2-2-BUILTIN-R4-001〜006

- **解消**: R4-001, R4-002, R4-004, R4-005, R4-006
- **部分的に解消**: R4-003
- **未解消**: 0 件

### 新しい指摘

- **High: 2 件**
- **Medium: 1 件**
- **Low: 1 件**

分類は、4件とも **「不注意で書ける形」**。新規の (i) / (ii) は 0 件とする。

v0.5.21 は R4 の具体的な fixture にはかなり正確に対応している。特に、fs target と `fd` option の union / intersection / 型パラメーターの constraint の分解、`stdio` 後続 computed property、括弧・`!`・options wrapper の誤検出修正は妥当である。

ただし、レビューを終了してよい状態とは判断しない。理由は次の2つの **High が、型の偽装を必要とせず普通の抽象化・値の受け渡しで起こり得る**ためである。

1. fs / child_process の関数参照を「Identifier・要素アクセス・変数宣言の分割代入」という構文の列挙で追っているため、**parameter の分割代入や非リテラル element key など、同じ関数値を得る別の普通の構文**が残る。
2. `fd` option の検出は static type に `fd` が見えるか、または open key かを見るため、**実行時 object が `fd` を持つのに、helper の parameter / return type で `fd` が見えなくなった普通の structural typing の形**を見逃す。

また、既知の限界のうち EventEmitter の unbound method を一括して (ii) とする分類は広すぎる。ADR 自身が、直接解決できる listener の `this` 使用だけを見る狭い規則は `src/` 違反 0・誤検出なしだったと記録している。したがって、**直接解決できる unbound method** と、**Record / element access の先に隠れた listener** は分けるべきである。

---

## 2. M2-2-BUILTIN-R4-001〜006 の判定

| ID | 判定 | 根拠 |
|---|---|---|
| **R4-001** fs writer の first argument の union / intersection / type parameter | **解消** | `literalValues()` は string-literal branch を union / intersection / type parameter constraint まで再帰する (`tests/structure/output-guard.ts:203-209`)。`mayBeNumber()` も number branch を同じ範囲まで再帰する (`:211-217`)。call 側は writer first argument に `mayBeNumber()` と `literalValues()` を使う (`:433-445`)。新しい回帰テスト `R4_001` には `string \| number`、`PathOrFileDescriptor`、conditional、property union、type parameter、branded number、device literal union がある (`tests/regression-m2-2-builtin-r4-union-and-element-forms.test.ts:27-46`)。前回の指摘そのものは閉じている。 |
| **R4-002** `fd` option の branch / rule K | **解消** | `fdBranch()` は union / intersection / type parameter constraint を再帰する (`output-guard.ts:258-264`)。`openKeys()` も同じ枝をたどり、string index signature と source 上で文字列と確定しない computed name を fs call で fail closed にする (`:246-256`, `:446-447`)。回帰テストも optional options、intersection、type parameter、spread、dynamic key、`Record` を含む (`regression...:48-64`)。ただし「static type から runtime の余分な `fd` property が消えている形」は別問題として R5-002。 |
| **R4-003** fs / child_process function の element access / destructuring / fs-promises | **部分的に解消** | literal element access、variable declaration の object destructuring、`fs/promises` の declaration は追加された (`output-guard.ts:343-363`, `NODE_FUNCTIONS` `:109-110`)。R4 fixture の `fs["writeFileSync"]`、`.call`、DI、`Reflect.apply`、variable declaration destructuring、promises member は対象になっている (`regression...:66-82`)。しかし検出は依然として構文を3種類に列挙しており、parameter の BindingElement は対象外、nonliteral element key は key variable の symbol を見るため Node function declaration へ解決しない。R5-001 の同系統が残る。 |
| **R4-004** `stdio` 後続 computed property | **解消** | `stdioProblem()` は direct `stdio` より後ろの spread を違反にし、さらに computed name が source 上で別名と書かれていない場合を違反にする (`output-guard.ts:278-291`)。dynamic key / union key / accessor / method / execSync 等を回帰 fixture に追加している (`regression...:84-96`)。安全な computed literal の wrapper には別の誤検出が残るが、R4-004 の terminal bypass は閉じている。 |
| **R4-005** parentheses / `!` / options wrapper の false positive | **解消** | `typeWrapped()` は parentheses と non-null だけでは true にせず、`as` / type assertion / `satisfies` がある場合だけ type-changing wrapper とする (`output-guard.ts:219-225`)。`stdioProblem()` は arguments を `unwrapped()` してから options object を探す (`:281`)。新しい controls は parentheses、`!`、`satisfies`、`as const` を安全側として固定 (`regression...:98-111`)。 |
| **R4-006** ADR 決定7の表と原則文 | **解消** | ADR は表を「決定7の対象として棚卸しした許可の分岐」であり、`tests/structure/` 全許可一覧ではないと明記 (`docs/adr/0019...:60-65`)。原則も構文・最上位宣言名・declaration resolution を挙げ、型を許可根拠にする例外を writer の all-`Safe` と generic carrier の2つに限定して記述 (`:53-59`, `:69-81`)。現コードの writer / generic の許可と対応している。R5-002 のような「検出側が static type で runtime property を見失う限界」は別途追加記述が必要。 |

---

## 3. Request の「特に見てほしい点」1〜6

### 1. R4-001〜006 の解消

上表のとおり、**5件解消 / 1件部分的に解消 / 未解消0件**。

R4-003 は、前回提示した literal element access と variable declaration destructuring は閉じたが、「fs / child_process function の値の provenance」という根本問題を構文の列挙で解いているため、同じ値を得る別構文が残る。

### 2. 追加規則と `src/` / 対照、6つの false-positive cost

`src/` 全36ファイルを対象に、今回の規則と関係する fs / child_process import、`createWriteStream`、fd option、process listener を確認した。

- fs / child_process は **named import** で使われており、`import * as fs`、default fs namespace、`node:fs/promises` の namespace 利用は 0。
- `createWriteStream` は **0か所**。
- `fd` という実変数は `src/security/scan.ts` に read 用の `openSync` / `readSync` 系があるが、今回の `fd` options 経路ではない。
- `process.on` は `src/cli.ts:66` と `src/cli-signals.ts:30`。`beforeHandlers` / `afterHandlers` の実値は arrow function (`src/cli.ts:58-64`) で、危険な unbound method は 0。

ADR / regression に記録された6つの cost は、いずれも「現在の src では 0、fail closed の代償」として整合している。

1. `PathOrFileDescriptor` wrapper: 型に number branch がある以上、実際は path だけでも報告する。妥当な安全側コスト。
2. optional stream options wrapper: options 型が fd branch を持つため、実際は flags だけでも報告する。妥当な安全側コスト。
3. namespace destructuring of a read function: read-only function でも function-value 持ち替えを一律報告する。安全側コスト。ただし R5-001 のとおり、構文の列挙はまだ完全ではない。
4. `stdio` 後ろの dynamic key: 実際には `stdio` でなくても報告する。安全側コスト。
5. generic `as T | undefined`: `Safe` と無関係な普通の generic helper も報告する。安全側コスト。
6. `Record` options: string index signature がある fs argument を報告する。安全側コスト。

現在の `src/` にこれら6形は見当たらない。

### 3. `xb25_stdio_options_paren` の期待値変更

**`reported: true` → `false` は妥当。**

対象は、child options の object literal を括弧で囲んだだけの形で、runtime の options は変わらず `stdio: "pipe"` のまま。v0.5.21 の `stdioProblem()` は argument を `unwrapped()` して object literal を見つけ、その `stdio` value も `unwrapped()` し、最終的に source literal `"pipe"` / `"ignore"` を確認する。括弧そのものを違反理由にする根拠はない。

したがって、この1件だけ旧 expectation を false に変えた判断に問題はない。

### 4. 既知の限界の記述・分類

#### 条件型 / mapped type (`Awaited<T>`, `Partial<T>`)

**(ii) は概ね妥当。**

現 guard は union / intersection の枝だけを明示的にたどり、conditional / mapped type の内部までは一般化していない。すべての「type syntax の中に T が現れる cast」を禁止すると、ADR が挙げる `JSON.parse(...) as T[]` のような普通の generic code まで巻き込む。現在の `src/` には該当 0 だが、普通の書き方との衝突という (ii) の根拠は成立する。

#### R3-005 の残り

**(ii) は妥当。**

`JSON.parse` 等の runtime number を plain `string` annotation に入れる形自体は意図的でなくても起こり得るが、分類は (i) ではなく (ii) なので、今回の基準には合う。静的 `string` target をすべて疑う規則は、`src/` の通常の file path と衝突する。重要なのは「この形が意図的だから (ii)」ではなく、「一般的に塞ぐ規則が正当な string path と区別できないから (ii)」と理解すること。

#### `function (this: 偽の型)`

**(i) は妥当。**

`process` という runtime `this` を別型として扱わせるために明示的な偽装を置く形であり、普通の listener の書き方から自然に発生する形ではない。

#### EventEmitter の unbound method

**一括して (ii) とするのは不正確。M2-2-BUILTIN-R5-003。**

ADR-0019:125-126 は、`process.on` / `once` / `addListener` / `prependListener` に直接渡された listener の body が runtime-bound `this` を使うときだけ報告する狭い規則を既に試作し、`src/` 違反0・誤検出なしだったと記録している。残ったのは Record に入れて element access で登録する indirect form。

したがって、少なくとも次の2群に分けるべきである。

- **直接 declaration を解決できる unbound method / function body**: 不注意で書ける。src-compatible な狭い規則で閉じられる候補。
- **Record / element access 等の間接経路の先で初めて method が分かる形**: 全面禁止は現在の `src/cli-signals.ts:30`、`src/cli.ts:66` の普通の Record access と衝突するため (ii) 候補。

#### `stdio` 後ろの method

記述は妥当。packet の説明どおり、最終 `stdio` が function になるため Node 側で拒否され、terminal へ届かない false positive。安全側として残す判断に問題はない。

#### 補足: generic carrier と別 raw value

ADR-0019:121 は、required exact-T carrier が存在しても、cast する値が別なら value flow を追わないため残ることを明記している。一方、ADR-0019:131 の「既知の限界は (i)/(ii) のどちらかに分ける」という規則に対して、この項には明示的な `(i)` / `(ii)` ラベルが付いていない。

これは今回の新しい terminal bypass としては数えないが、レビュー終了基準を分類で運用するなら、次回 docs 更新時に分類を明記した方がよい。単純に carrier 付き generic cast を全部禁止すると、現 `src/security/mask.ts:26-38` の `maskDeep<T>(value: T): T` の正当な cast と衝突するため、単純規則なら (ii) 寄りである。ただし value-flow analysis を行えば理論上は分離可能である。

### 5. ADR-0019 決定7の原則文と実コード

**R4-006 の過大な「全許可一覧」主張は直っており、原則文は概ねコードと一致する。**

- syntax による許可: literal key、stdio literal、wrapper の扱い。
- top-level declaration name: writer / Safe creator / brand creator。
- declaration resolution: fs / child_process call・function reference。
- 型を許可根拠にする明示例外: writer argument の all-`Safe`、generic carrier exact T。

ただし、R5-002 は「型を違反検出に使う」側の新しい限界である。`fdBranch()` / `openKeys()` で dangerous property が **見えない static view** になっただけで runtime property が消えるわけではない。ADR-0019:76 の「型を偽られると外れる」だけでは、意図的な偽装だけのように読めるので、ordinary structural narrowing / helper parameter / return type でも runtime extra property が消えないことを既知の限界へ追記すると正確になる。

### 6. ROADMAP の「レビューを終える基準」

**今回の結果では、この基準で終了しない。**

新規 High 2件がともに「不注意で書ける形」なので、ROADMAP のどちらの終了条件にも当てはまらない。

さらに、基準の文言自体は少し直した方がよい。

現在は概ね、

- High が 0 なら終える
- または、新しい指摘が (i)/(ii) だけなら ADR に限界として書いて終える

という OR になっている。このままだと、**Medium の「不注意で書ける terminal bypass」だけが残った場合、High=0 を理由に終了できる**。今回の R5-003 はまさに「既知の形だが分類を誤ると accidental bypass を (ii) として受け入れられる」例である。

終了基準は、重大度だけでなく分類を主にして、例えば次のようにする方が安全である。

> 未解消の「不注意で書ける、terminal へ到達する形」が 0。残るものが (i)、(ii)、または terminal 非到達の明示的な false positive だけで、各限界と代償が ADR に記録されている場合に終了する。

High / Medium は修正優先度には使えるが、「High=0」だけを独立した終了条件にしない方がよい。

---

## 4. 新しい指摘

## M2-2-BUILTIN-R5-001

- **重大度: High**
- **分類: 不注意で書ける形** — module namespace / dependency object を helper に渡す、parameter で分割代入する、key variable で member を取る、という普通の抽象化で成立し、`any` や虚偽の型アサーションは不要。
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:151-158`, `:343-363`, `:417-451`
- **関連テスト:** `tests/regression-m2-2-builtin-r4-union-and-element-forms.test.ts:66-82`
- **`src/` 実在:** **0か所**（全36ファイル）。現 `src/` の fs / child_process は named import で、namespace import / parameter destructuring / dynamic namespace element を使っていない。

### 内容

R4-003 の修正は、fs / child_process function の reference を、

1. Identifier
2. ElementAccessExpression
3. **variable declaration** の ObjectBindingPattern

の3種類で個別に拾う (`output-guard.ts:343-357`)。

このため、同じ Node function value を得る別の普通の構文が残る。

特に確実なのは **function parameter の object destructuring**。BindingElement 分岐は `ts.isVariableDeclaration(n.parent.parent)` を要求するため parameter の BindingElement は対象にならない。helper が structural type の parameter から `writeFileSync` や `spawnSync` 相当の member を受け取り、その helper に fs / child_process namespace を渡す形では、helper 内の member symbol は local parameter type の declaration であり、`NODE_FUNCTIONS` の Node declaration ではない。

もう1つは **nonliteral element key**。ElementAccess 分岐の symbol は `n.argumentExpression`、すなわち key expression の symbol から取る (`:350-352`)。key が local variable なら、その symbol は Node function declaration ではない。値を local interface / function signature に受け渡した後の call は、`fsFunction()` が call signature の local declaration を見るため (`:151-158`)、fs writer / child starter として扱われない。

### なぜ terminal へ届くと考えるか

runtime に保持される値は、元の Node の fs / child_process function そのもの。R4 の既存 fixture で terminal 経路とされた literal element / retyped copy と、実行時に呼ばれる function は同じである。違うのは「その function をどの AST 構文で取り出したか」だけ。

したがって、fs writer なら runtime target が fd / device path のとき stdout / stderr へ、child_process starter なら runtime options が terminal passthrough になるとき child output が parent terminal へ届く。後段 call が local signature に見えることで、現在の fs/child call rule が実行されない。

### 同じ系統がほかに残っているか

**残っている。** 少なくとも、

- parameter の object destructuring
- nonliteral element key
- module namespace object を一度 local structural interface / helper に渡してから member を取る形

は、現在の「関数を指す構文を列挙する」方式では同じ問題になる。

assignment destructuring 等も同じ系統として確認対象に入れるべきである。個々の syntax を追加し続けるより、module namespace / Node function value の provenance を一つの helper で扱う方が堅い。

### 修正案

現在 `src/` は fs / child_process の namespace import を使っていないので、最も単純な fail-closed 案は、**Node の fs / child_process module namespace value 自体を sensitive value とし、review 済みの direct member call 以外の value use を違反**にすること。

より一般化するなら、PropertyAccess / ElementAccess / BindingElement / parameter binding などから「最終的に `@types/node` の fs / child_process function declaration を値として得ているか」を1つの provenance helper で解決し、callee 以外なら違反にする。

---

## M2-2-BUILTIN-R5-002

- **重大度: High**
- **分類: 不注意で書ける形** — TypeScript の通常の structural typing や helper の狭い parameter / return type で runtime の余分な property が static view から消えるだけで成立し、`as any` 等の偽装は不要。
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:239-264`, `:433-457`
- **関連:** R4-002 regression `tests/regression-m2-2-builtin-r4-union-and-element-forms.test.ts:48-64`
- **`src/` 実在:** **0か所**（全36ファイル）。`createWriteStream` 自体が 0 か所。

### 内容

v0.5.21 の `fd` rule は、argument の **static type** に `fd` property が見える branch を `fdBranch()` で拾い、string index signature / source 上で不明な computed key は `openKeys()` で拾う。

しかし、runtime object が `fd` を持っていても、その値が **fs call に到達する前に** helper の return type、設定オブジェクトの view、または既に狭い parameter type で `{ flags?: ... }` のような **closed-looking narrower static view** になっている場合、runtime の余分な `fd` property は消えない一方、checker 上は `fd` も string index signature も見えない。

これは TypeScript の普通の structural typing で起こる。例えば、関数内部では `flags` と `fd` を持つ変数を作り、その関数の公開 return type は flags だけを表す、という形では、return 時に object の runtime property は削除されない。caller は narrower return type だけを見るため、その値を `createWriteStream` へ渡す時点では guard から `fd` が見えない。JSON / config 由来の object を狭い options interface として保持する形も同系統である。

`hasFdProperty()` はその narrowed type に `fd` がないため false (`:239-244`, `:258-264`)。`openKeys()` も string index signature がなく、argument expression が dynamic computed property の object literal でなければ false (`:246-256`)。そのため `createWriteStream` 等に同じ runtime object が渡っても、`:446-457` のどちらも発火しない。

### なぜ terminal へ届くと考えるか

R4-002 の既存 fixture は、`createWriteStream` に runtime `fd` option が渡る形を terminal route として扱っている。今回の形でも runtime object 自体から `fd` は削除されておらず、変わるのは static view だけである。

したがって runtime の fd が stdout / stderr の descriptor なら、Node API が使う fd は R4-002 fixture と同じで、書き込みは terminal に到達する。

### 同じ系統がほかに残っているか

**残っている。** これは union branch の分解問題ではなく、「static structural type が runtime extra property の不在を保証しない」という系統。

同じ系統には、

- 既に狭い static view になった値を helper parameter で受ける
- function return type で property を狭く見せる
- runtime data を index signature の無い interface に読み込む
- base / view type を通して extra property が見えなくなる

などがある。

ADR-0019:76 の「型を偽られると外れる」より広く、悪意がなくても起こる。

### 修正案

完全な value-flow をしないなら、fd-capable な options position では、**static type に `fd` が無いことを runtime の不存在証明として扱わない**方針が必要。

例えば、review 済みの fresh object literal で key がすべて閉じており `fd` が無い場合だけ許可し、variable / helper result のように runtime extra property を否定できない options は fail closed にする方法がある。ただし普通の options variable も報告するため、false-positive cost を ADR に明示する必要がある。

より精密にするなら、argument の value provenance を追って object creation / spread / return / parameter の流れまで確認する必要がある。

---

## M2-2-BUILTIN-R5-003

- **重大度: Medium**
- **分類: 不注意で書ける形** — object / class method を EventEmitter listener として unbound で渡すこと自体は普通の JavaScript/TypeScript のミスとして起こり得る。
- **確信の度合い: 高**
- **場所:** `docs/adr/0019-builtin-allowlist-process-members.md:110-126`; `src/cli-signals.ts:28-33`; `src/cli.ts:57-66`
- **`src/` 実在:** **0か所**（危険な unbound method は 0）。現在の実 handler 値は arrow function。

### 内容

ADR-0019:114 は EventEmitter の unbound method をまとめて **(ii)「塞ぐ規則が src と両立しない形」**と分類している。

しかし同じ ADR の `:125-126` は、`process.on` / `once` / `addListener` / `prependListener` に渡す listener の body が runtime-bound `this` を使うときだけ報告する **狭い規則を既に試作**し、

- `src/` と両立
- `src` 違反 0
- 誤検出なし

だったと記録している。採用しなかった理由は、Record に入れて element access で登録する indirect listener が残るため。

「一部の indirect form が残る」ことと、「直接解決できる accidental form も閉じられない」ことは別である。

### なぜ terminal へ届くと考えるか

ADR が記録する runtime semantics は、`process.on` 等が listener を `process` を `this` として呼ぶ、というもの。unbound object / class method の body が `this.stdout` 相当を参照すれば、source に `process` を書かなくても runtime `this` は process になり、その stdout へ届く。

この terminal route 自体は既知の限界として既に認識されている。本指摘は route の新発見ではなく、**そのうち直接解決できる accidental form まで (ii) に入れてレビュー終了可能な限界として扱っている分類**が広すぎる、というもの。

### 同じ系統がほかに残っているか

**2群に分かれる。**

- direct function / method declaration を解決できる listener: prototype 済みの narrow rule で閉じられる。これは「不注意で書ける形」として残すべきではない。
- Record / element access / callback container の先に隠れた listener: 現 `src` 自身が `to[signal]` / `beforeHandlers[signal]` を使うため、広い element-access 禁止は両立しない。こちらは (ii) が妥当。

### 修正案

ADR の分類を分割する。さらに、v0.5.20 で既に src-compatible と確認した **direct listener body の runtime-bound `this` rule** は採用する価値がある。

indirect Record form が残ることは、その残りだけを (ii) として文書化すればよい。構造ガードは完全な悪意対策ではなく「不注意を止める」ものなので、100%閉じられないことは、閉じられる accidental form を閉じない理由にはならない。

---

## M2-2-BUILTIN-R5-004

- **重大度: Low**
- **分類: 不注意で書ける形** — runtime-transparent な `as const` / `satisfies` 等を literal computed key に付けるだけの安全な形が違反になる。
- **確信の度合い: 高**
- **場所:** `tests/structure/output-guard.ts:183-188`, `:239-256`, `:278-291`
- **`src/` 実在:** **0か所**（全36ファイル）。

### 内容

R4-005 では runtime-transparent wrapper を fs target / child options object / `stdio` value について整理したが、**computed property name** では `writtenKey()` が parentheses しか剥がさない (`output-guard.ts:183-188`)。

そのため、安全な literal key に `as const` / `satisfies` 等を付けた場合、runtime key は変わらないのに unknown computed key として扱われる。

例として、direct `stdio: "pipe"` の後ろに runtime key が明らかに `cwd` である computed property を置いても、その key expression が `"cwd" as const` のような wrapper 付きなら `writtenKey()` は null になり、`:286-287` が「stdio を上書きし得る」と報告する。

同様に fs options の computed safe key でも `openKeys()` の `:249` が unknown key として rule K を発火させる。

さらに、options の `stdio` 自体を computed literal property (`["stdio"]`) として書いた場合、`:282` の finder は Identifier / StringLiteral property name だけを見るため、安全な `stdio: "pipe"` 相当でも「stdio が無い」となる。

### terminal へ届く根拠

**届かない。これは false positive。**

runtime-transparent wrapper を除けば key は `cwd` 等の安全な別名で、direct `stdio: "pipe"` が最終 `stdio` のまま。computed literal `["stdio"]` + `"pipe"` も runtime では通常の stdio property と同じである。

### 同じ系統がほかに残っているか

**残る。** `as const`、`satisfies`、type assertion、non-null 等、`unwrapped()` が既に runtime-transparent と認識している wrapper と computed literal key の組み合わせが同系統。

holder の `process["platform" as const]` は ADR が意図的に fail closed としているので、そこまで一律に変えてはいけない。今回の修正対象は、R4-004 / R4-005 で runtime-preserving wrapper を既に許す方針にした `stdioProblem()` / fs options rule K の局所に限るべきである。

### 修正案

`writtenKey()` 自体の意味は変えず、`stdioProblem()` と `openKeys()` の computed property name だけ `writtenKey(unwrapped(expr))` を使う。

また `stdio` property finder は、Identifier / StringLiteral に加えて、computed name でも `writtenKey(unwrapped(name.expression)) === "stdio"` のときは direct stdio property として扱う。

---

## 5. `package-lock.json` の前回未確認点

今回の packet には `docs/reviews/m2-2/response-builtin-r4.md` の中に `v0.5.19..v0.5.20` の lock diff が収録されている。

**パケットに収録された diff の内容を読む限り**、hunk は1つ、`+3 / -3` で、`node_modules/brace-expansion` の次の3行だけが変わっている。

- `version`: 5.0.9 → 5.0.12
- `resolved`
- `integrity`

`dev: true` 以降は変更なし。さらに v0.5.20..v0.5.21 の Changed Files に `package-lock.json` は無い。

したがって、**今回提供された packet の証拠の範囲では、「前回の lock 更新は brace-expansion のその1か所だけ」という記録と差分内容は一致している**。

ただし、これは packet に埋め込まれた `git diff` テキストを検査した結論であり、手元に repository 本体がある状態で `git diff` を再実行して独立再生成したものではない。

---

## 6. 良い点

- R4-001 / R4-002 は「top-level flag だけを見る」問題を helper にまとめて branch decomposition した。前回の指摘に対して局所修正ではなく同系統を広げた点は良い。
- `typeWrapped()` を `unwrapped()` から分離し、括弧・`!` と type-changing wrapper を区別した R4-005 の修正は分かりやすい。
- `stdioProblem()` で options object 自体も unwrap するようにしたため、`xb25_stdio_options_paren` の旧 false positive は正しく消えた。
- ADR-0019 の表を「すべての許可」と言わず、対象範囲を明記した R4-006 の修正は妥当。
- false-positive cost 6形を regression と ADR に明示している点は、fail-closed rule の代償を隠さずレビュー可能にしている。
- `src/` 全36ファイルを packet に入れたため、今回は新規 finding の実在件数を repository の `src/` 全体で 0 と確認できた。

---

## 7. 新しい指摘の件数

| 分類 | High | Medium | Low | 合計 |
|---|---:|---:|---:|---:|
| **不注意で書ける形** | **2** | **1** | **1** | **4** |
| **(i) 意図的な偽装が要る形** | 0 | 0 | 0 | 0 |
| **(ii) 塞ぐ規則が `src/` と両立しない形** | 0 | 0 | 0 | 0 |
| **合計** | **2** | **1** | **1** | **4** |

既存の known limits には (i)/(ii) があるが、それらは今回新たに発見した指摘の件数には含めていない。

---

## 8. 未確認・読み切らなかった範囲

1. **対象コード・fixture・テストは一切実行していない。** 依頼どおり、すべて静的読解による判断。
2. packet の Request、Previous R4 review、今回の Diff、`tests/structure/output-guard.ts` / `brand-guard.ts` の変更後全文、新しい R4 regression、変更された旧 regression、ADR-0019、ROADMAP の M2-2 / review-end 部分、response-builtin-r4 の判定・棚卸し・lock diff、`src/` 全36ファイルの関連 API / 構文は確認した。
3. `src/` 全36ファイル（6,204行）は対象に含め、fs / child_process import、namespace / dynamic import、`createWriteStream` / fd option、process listener 等を横断確認したが、**terminal guard と無関係な業務ロジックまで36ファイルを1行ずつ意味論レビューしたわけではない**。
4. 14,036行の packet に重複収録されている古い CHANGELOG 全履歴、今回の R4 対応と直接関係しない過去マイルストーンの説明、古い ADR / docs の全行は、行単位では再レビューしていない。今回の判断に必要な current Diff / changed full source / Request 指定 Documents を優先した。
5. R5-001 の parameter destructuring と nonliteral element-key の判断は TypeScript AST / checker をコードから読んだ静的判断であり、依頼に従って新しい fixture を作成・コンパイル・実行してはいない。
6. R5-002 は TypeScript の structural typing により runtime object の extra property が narrower parameter / return viewでも残ることと、現 guard が argument の static type / syntaxだけを見ることから判断した。新しい fixture は実行していない。

---

## 最終判断

**v0.5.21 で R4-001 / 002 / 004 / 005 / 006 は解消、R4-003 は部分的に解消。**

しかし、新規に **High 2件の「不注意で書ける形」**が残るため、m2-2-builtin の独立レビューをここで終了することには反対する。

次の優先順位を推奨する。

1. **R5-001**: fs / child_process function を syntax 列挙ではなく value provenance で扱う。少なくとも parameter destructuring / nonliteral element / namespace value の受け渡しを回帰化する。
2. **R5-002**: fd-capable options で、static type から property が消えただけの runtime extra `fd` をどう扱うか決める。簡単な fail-closed rule を採るなら false-positive cost を明記する。
3. **R5-003**: EventEmitter unbound method の分類を direct-resolvable と Record-indirect に分け、既に src-compatible と記録されている狭い `this` rule の採用を再検討する。
4. **R5-004**: `stdio` / rule K の computed literal key だけ runtime-transparent wrapper を局所的に unwrap し、安全な false positive を減らす。
5. ROADMAP の終了条件を「High=0」中心ではなく、**未解消の accidental terminal-reach finding が0**であることを中心に書き換える。

R5-001 が示すとおり、今回の実装側の教訓「同じ値を得る構文を並べてから規則を書く」は方向として正しいが、Identifier / element / variable destructuring の列挙で止めたため、まだ1段抽象度が足りない。ここは **「構文を増やす」より「危険な module/function value の provenance を追う」**へ切り替えるのが、同じ系統の R6 を防ぐ上で重要である。
