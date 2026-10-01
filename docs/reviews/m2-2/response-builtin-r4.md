# M2-2 BUILTIN R4 の独立レビューへの対応記録（response-builtin-r4）— v0.5.21

- 対象レビュー: `docs/reviews/m2-2/independent-review-builtin-r4.md`（受領ファイル名 `independent-review-m2-2-builtin-r4-for-claude.md`、ChatGPT、2026-09-30 受領、
  SHA-256 074436e2…bbff25、26,025 バイト。対象 v0.5.20 = commit d669b5e / tag object dc967e2、範囲 v0.5.19..v0.5.20）
- 対応日: 2026-10-02
- 結果（レビュアー）: 前回の R3-001〜008 は、解消 5（001・002・004・007・008）、部分的に解消 3（003・005・006）、未解消 0。新しい指摘は **High 4（R4-001〜004）/ Medium 2（R4-005・006）/ Low 0**。
  レビュアーは High 4 件を「不注意で書ける形」と分類し、「レビューを終了できる状態とは判断しない」とした
- 人間の判断（SP1 の報告への回答。SP2 の仕様）
  1. **箱の仕分け**: R4-001〜004 の全形を直す（箱 1）。**規則 K**（fs の呼び出しの、キーが静的に分からない引数を違反にする）を採り、動的な計算された名前 `{ [k]: 1 }` と `Record<string, number>`（b09・b10）を塞ぐ。
     **INV-1**（総称型の cast の `as T | undefined`・`NonNullable<T>`）は両ガードで直す。`Awaited<T>` などの条件型・mapped type（x11・x12）は箱 2（根拠は (ii): 型の形を全部たどる規則は将来の書き方に追いつかず、
     `JSON.parse(s) as T[]` などの普通の形と衝突する。`src/` に無い）。R4-004 の method（d07）は箱 3（実行時にエラーで届かない。試作の規則は違反にする。そのまま）
  2. **R4-005 は直す**: fs の先頭の引数の括弧・`!` と、child の options の括弧・`satisfies`・`as const` を誤検出にしない。`xb25_stdio_options_paren` の期待値だけ `reported: true` → `false` に変える（この 1 件だけ、既存テストの期待値の変更を承認）
  3. **R4-006 は案 2**（範囲を狭く明記する）
  4. **ROADMAP の「レビューを終える基準」を直す**: (i) 意図的な偽装が要る形、(ii) 塞ぐ規則が `src/` と両立しない形で代償を ADR に書いたもの。箱 2 には 1 行の根拠を付け、不注意で書ける形を (i) に入れない。
     既存の箱 2 の分類も見直す: R3-005 の残り（`JSON.parse` の any を `string` の注釈へ）と EventEmitter の unbound method は (ii)、`function (this: 偽の型)` は (i)
  5. 回帰テストに取り込む fixture は SP1 の 89 形すべて（見逃し 48・誤検出 6・対照 20・記録 15）。棚卸しの 2 巡目はしない（教訓 §2-7 の基準。下の「棚卸しの結果」のとおり、残った × は 2 次的）。
     r5（範囲 v0.5.20..v0.5.21）は次の承認で行い、lock の差分のテキストはこの文書の中（下の節）に収録して `--doc` で載るようにする
  - 修正の後に独立レビュー m2-2-builtin-r5（範囲 v0.5.20..v0.5.21）を行う（パケットには `src/` の全文も足す）

## 指摘の判定（SP1 の実測。fixture 89 形。v0.5.20 のガードに当てた）

実測 = 動かして確かめた。「届く」は、fixture を実行して標準出力・標準エラーに届いたバイト数で確かめた（本体の作業ツリーの外）。

| ID | 重要度 | 判定 | 再現 | 不注意か意図的か | `src/` の該当 | 実行時に届くか | 箱 |
|---|---|---|---|---|---|---|---|
| R4-001 fs の writer の先頭の引数が union | High | VALID | 13/13 形（`string \| number`、`PathOrFileDescriptor`、`<T extends number>`、ブランド付き number、device path の union など） | 不注意で書ける（`PathOrFileDescriptor`・`Parameters<typeof writeFileSync>[0]` は Node の API の型そのもの） | 0 | 届く（1 バイト） | 1 |
| R4-002 fd option が union・型パラメーターの枝 | High | VALID | 11/11 形（省略可能な options 引数 `o?: { fd?: number }` だけで外れる。intersection・条件式・spread も） | 不注意で書ける | 0 | 届く | 1（b09・b10 は規則 K） |
| R4-003 fs・child の関数を要素アクセスなどで得る | High | VALID | 11/11 形（`fs["writeFileSync"]` の別の関数型への注釈、`.call`・DI・`Reflect.apply`、型注釈つきの分割代入、`fs/promises`） | 不注意で書ける | 0 | 届く | 1 |
| R4-004 `stdio` の後ろの computed property | High（確信「中」→ 実測で確定） | VALID | 型検査を通る 6 形はすべて届く。リテラルの名前の重複は TypeScript が拒む（4 形） | 不注意で書ける（動的なキーを置く形。頻度は低い） | 0 | 届く（method の d07 だけ `ERR_INVALID_ARG_VALUE` で届かない） | 1（d07 は 3） |
| R4-005 wrapper の扱いの不整合 | Medium | VALID（誤検出、2 方向） | 6/6 形（レビュアーの括弧に加えて、`satisfies`・`as const` を options に付けた形） | 不注意で書ける安全な形が違反になる | 0 | 届かない（0 バイト） | 1 |
| R4-006 決定 7 の表と原則文 | Medium | VALID（docs） | 表は 7 行で、許可の分岐 53 のうち 12 を表す | — | N/A | N/A | 1（案 2） |
| INV-1（棚卸しで発見）総称型の cast の `as T \| undefined` | — | 新規 | 3/3 形（x07・x08・x09） | 不注意で書ける（`m.get(k) as T \| undefined`） | 0 | 単独では届かない（`Safe` を受ける書き込み口が `src/output.ts` の外に無い。偽造した `Checked` は実行時に `UncheckedValueError`） | 1（条件型・mapped type は 2） |

## 修正（v0.5.21。`tests/` と docs だけ。`src/` は変えない）

- `tests/structure/output-guard.ts`: R4-001（number の枝・device path の literal の枝を union・intersection・型パラメーターの constraint まで集める）、R4-002（`fd` を持つ枝）、R4-003（参照の元を Identifier・要素アクセス・
  分割代入にし、宣言のファイルに `fs/promises.d.ts` を足す）、R4-004（`stdio` の後ろの、ソース上で別名と書かれていない計算された名前）、R4-005（括弧・`!` だけの fs の先頭の引数、child の options の wrapper）、
  規則 K（fs の呼び出しの引数に、文字列の index signature・計算された名前を持つ object literal）、INV-1（総称型の cast の型を union・intersection の枝まで見て、型パラメーターの枝ごとに carrier を要求）
- `tests/structure/brand-guard.ts`: INV-1（同上）
- 新しい回帰テスト `tests/regression-m2-2-builtin-r4-union-and-element-forms.test.ts`（91 件: 85 形 + 型検査で止まる 4 形 + fixture の型検査 + `src/` の違反 0）。v0.5.20 のガードでは 62 件 FAIL
- 既存のテスト: `tests/regression-m2-2-builtin-r3-allow-branches.test.ts` の `xb25_stdio_options_paren` の期待値だけ `reported: true` → `false`（R4-005 が指摘した「誤検出を期待値に固定した」テスト。人間の承認）。ほかの期待値は変えていない
- **試作との違い**: 規則（コード）は SP1 の試作（`r4.patch` → `inv-output.patch` → `inv-brand.patch`）と一致した（`cmp` で確認）。違うのは先頭の説明コメントだけ（output-guard.ts +27 / −15、brand-guard.ts +3 / −2）。
  コード部分は output-guard.ts +82 / −20、brand-guard.ts +6 / −4（試作の見積もりと同じ）

## 代償として違反になる形（`src/` には無い。受け入れる。回帰テストの COST の 6 形で記録）

| 規則 | 違反になる、端末へ届かない書きやすい形 | 形 |
|---|---|---|
| R4-001 | `PathOrFileDescriptor`（または `Parameters<typeof writeFileSync>[0]`）を受けて path だけを渡す wrapper | f01 |
| R4-002 | `createWriteStream` の options を省略可能で受ける wrapper（fd を渡さなくても。型が `fd` を持つ引数は v0.5.20 から違反で、代償が union にも広がる） | f02 |
| R4-003 | namespace の分割代入 `const { readFileSync } = fs`（読み取りの関数でも。`const r = fs.readFileSync` が v0.5.20 で違反なのと同じ扱い） | f03 |
| R4-004 | `stdio` の後ろに動的なキーを置く options（実行時に `stdio` でなくても） | f04 |
| INV-1 | 総称型の helper の `m.get(k) as T \| undefined`（`Safe` などを作らなくても。`as T` だけの形は v0.5.20 でも違反） | f05 |
| 規則 K | fs の呼び出しに `Record<string, unknown>` 型の options | f06 |

R4-005 を直した後に残る誤検出: `process["platform" as const]`（holder のキーは wrapper を剥がさない。v0.5.20 から。安全側）と、型アサーション・`satisfies` を付けた fs の writer の先頭の引数（実行時の値を型が決めるので
違反のまま。対照 e07〜e09）。括弧・`!` だけの fs の先頭の引数と、child の options の wrapper は、誤検出でなくなった。

## INV-1 の残りと d07 の扱い

- **INV-1 の残り（箱 2、根拠は (ii)）**: `as Awaited<T>`（条件型、x11）と `as Partial<T>`（mapped type、x12）は報告しない。型の形を全部たどる規則は将来の書き方に追いつかず、塞ぐなら「型の構文の中に T が現れる cast をすべて
  違反にする」規則が要るが、`JSON.parse(s) as T[]` などの普通の形と衝突する。`src/` に無い。回帰テストは「報告されない」限界の記録として固定した
- **d07（箱 3）**: `stdio: "pipe"` の後ろの計算された名前の method は、実行時に `stdio` が関数になって `ERR_INVALID_ARG_VALUE` で終わる（標準出力に届かない）。試作の規則は、計算された名前の後続をすべて違反にするので d07 も違反にする。
  誤検出だが、method を `stdio` の後ろに動的な名前で置く形に実用が無いので、そのままにする（回帰テストは `reported: true` の記録）

## 棚卸しの結果（SP1 の 1 巡。**ADR の保証ではなく、棚卸しの記録**）

R4-001・002 は、型の最上位の flag だけを見て union・型パラメーターの枝を見ない、R4-003・004 は、構文の形を 1 種類（Identifier、SpreadAssignment）しか見ない、という同じ系統だった。
同じ系統の指摘が続く前に、教訓 §2-7（許可の分岐を全部数える）を**違反を見つける側**に当てた（SP1 の 1 巡。2 巡目は人間の判断でしない）。結果:

- 型・構文の形で絞る箇所 **51**（output-guard 35、brand-guard 10、process-guard 4、typescript.ts 2）。型の最上位の flag だけを見る検出の箇所は 5 つ（O10 `literalKey`・O13/O30 fd option・O28 fs の書き込み先・O32 `genericCast`・G5 brand の型アサーション）で、R4-001・002 と INV-1 がこれに当たる。
  構文を 1 種類しか見ない検出の箇所は 2 つ（O15 `stdioProblem` の後ろの spread だけ、O20 Identifier だけ）で、R4-003・004 がこれに当たる。ほかの × は 2 次的（別の規則が先に塞ぐ）か、端末に届かない brand・tests/ の箇所
- 残った × と、2 巡目をしない理由: O14（holder の union）、O27（`Function` の union）、G9・G10（brand の `obj.render`・widened-container。K3 の既知の限界）、Q3（tests/ の `shell`）は、どれも 2 次的か端末に届かない
- 許可の分岐の全数（v0.5.20）: **53**（構文 24、型 15、名前〈一覧・最上位の宣言〉6、宣言の解決 6、範囲・上限 2）。ADR-0019 決定 7 の表が表すのは 12 で、残り 41 は表にない（モジュールの一覧、`import type`、holder の読み取りなど）。
  これが R4-006 の指摘の根拠で、案 2 では ADR に全数を書かず、この記録に置く。**数え方は 1 人の実装側の読み（確認）で、機械的な列挙ではない**

下の 3 つの表は、SP1 の報告の写し（行番号は v0.5.20 の `tests/structure/output-guard.ts`〈OG〉、`brand-guard.ts`〈BG〉、`process-guard.ts`〈PG〉、`typescript.ts`〈TS〉）。

### 型・構文の形で絞る箇所の一覧（51 か所）

| # | 場所 | 何を見ているか | 役割 |
|---|---|---|---|
| O1 | OG:99-101 `resolved` | alias の記号を解決 | 共通 |
| O2 | OG:108-115 `terminalSymbol` | 記号の宣言のファイル（`@types/node` の globals・console・process） | 検出 |
| O3 | OG:118-121 `processMember` | 同上（process.d.ts） | 検出 |
| O4 | OG:124-135 `moduleProblem` | 指定子の文字列、`getSymbolAtLocation(spec).valueDeclaration` | 許可・検出 |
| O5 | OG:138-144 `fsFunction` | `getResolvedSignature(call).getDeclaration()` のファイル | 検出の範囲 |
| O6 | OG:147-153 `inTypePosition` | 構文（型の中か） | 許可 |
| O7 | OG:156-167 `nameOnly` | 構文の種類（宣言の名前） | 許可 |
| O8 | OG:170-174 `writtenKey` | 構文（文字列リテラル・置換の無いテンプレート、括弧） | 許可 |
| O9 | OG:177-181 `unwrapped` | 構文（括弧・`as`・`<T>`・`satisfies`・`!`） | 共通 |
| O10 | OG:184-187 `literalKey` | 型 `isStringLiteral()`（最上位） | 検出 |
| O11 | OG:189-192 `hasSafe` | 型（union・intersection は some） | 検出 |
| O12 | OG:195-199 `allSafe` | 型（union は every、intersection は some） | 許可（writer） |
| O13 | OG:202-207 `hasFdProperty` | 計算された `"fd"`、型の flag `Object` + `getPropertyOfType` | 検出 |
| O14 | OG:210-218 `holderOf` | `getNonNullableType` + `getPropertiesOfType` | 検出（holder の判定） |
| O15 | OG:221-232 `stdioProblem` | 構文（最後の ObjectLiteral の引数、PropertyAssignment、SpreadAssignment、配列の要素） | 許可・検出 |
| O16 | OG:256-265 import 宣言 | 構文（`import type`） | 検出・許可 |
| O17 | OG:266-269 `export … from` | 構文（`export type`） | 検出・許可 |
| O18 | OG:270 `import = require` | 構文 | 検出 |
| O19 | OG:271-282 Identifier の記号 | `isIdentifier` + 記号（端末・メンバー・eval など） | 検出 |
| O20 | OG:284-293 fs・child の関数の参照 | `isIdentifier` + 宣言のファイルの正規表現 | 検出（R3-006） |
| O21 | OG:295-301 要素アクセスのキーの記号 | `isElementAccessExpression` + `getSymbolAtLocation(key)` | 検出 |
| O22 | OG:303-315 分割代入 | `isObjectBindingPattern`、キーは Identifier・StringLiteral、初期値の型の `getProperty` | 検出 |
| O23 | OG:317 `.constructor` | PropertyAccess の名前、要素アクセスの `writtenKey(unwrapped)` | 検出 |
| O24 | OG:319-346 holder の使い方 | 親の構文の種類 | 許可・検出 |
| O25 | OG:349-357 `import()` | 構文（文字列リテラル） | 検出 |
| O26 | OG:359 any の呼び出し | callee の型の flag `Any` | 検出 |
| O27 | OG:361-362 `Function` 型の呼び出し | callee の型の `getSymbol()` の名前 | 検出 |
| O28 | OG:363-376 fs の書き込み先 | 型の flag `Any`・`NumberLike`（最上位）、`unwrapped`、`literalKey` | 検出 |
| O29 | OG:377-379 child の stdio | `starter`（解決した signature）+ O15 | 検出 |
| O30 | OG:383-385 fd option | O13 を call・new の全引数に | 検出 |
| O31 | OG:401-411 `writerCall` | `topOwnerName`、member のテキスト、引数の数、`allSafe` | 許可 |
| O32 | OG:414-423 `genericCast` | `getTypeFromTypeNode` の flag `TypeParameter`（最上位）、carrier は TypeReference | 検出・許可 |
| O33 | OG:432 `Safe` の型アサーション | `hasSafe(getTypeFromTypeNode)`、`topOwnerName` | 検出・許可 |
| O34 | OG:436 `Safe` の型述語 | `hasSafe` | 検出 |
| O35 | OG:437-440 `Safe` の文脈の any | flag `Any` + `getContextualType` + `hasSafe` | 検出 |
| G1 | BG:43-57 `hasBrand` | union・intersection は some、型引数、プロパティ（深さ 4・40 個） | 検出 |
| G2 | BG:60-63 `isBrandedString` | union は every、intersection の StringLike | 許可（container の検査を外す） |
| G3 | BG:65-67 `takesBrand` | `getCallSignatures` | 検出 |
| G4 | BG:98 ts-directive | テキストの正規表現 | 検出 |
| G5 | BG:102-116 型アサーション | `as const` のテキスト、`hasBrand`・flag `Any`・`Never`・`TypeParameter`（最上位）、`topOwnerName`、carrier | 検出・許可 |
| G6 | BG:117 型述語 | `hasBrand` | 検出 |
| G7 | BG:118-121 any-into-brand | flag `Any` + 文脈の `hasBrand` | 検出 |
| G8 | BG:122-133 issuer-call・md-not-tag | `isIdentifier` + FunctionDeclaration、親の構文 | 検出・許可 |
| G9 | BG:134-137 widened-renderer | `isIdentifier`（プロパティアクセスの名前は除く）、`takesBrand`、文脈の型 | 検出 |
| G10 | BG:139-159 widened-container | 親の構文 4 種、`isArrayType`・`isTupleType`・readonly | 検出・許可 |
| Q1 | PG:34-46 `starter` | `getResolvedSignature` の宣言のファイル | 検出の範囲（OG も使う） |
| Q2 | PG:48-55 `commandOf` | `process.execPath` の構文、型 `isStringLiteral()` | 許可（tests/ のみ） |
| Q3 | PG:57-60 `usesShell` | 引数の ObjectLiteral の PropertyAssignment `shell` | 検出（tests/ のみ） |
| Q4 | PG:63-110 guard・probe | 構文 + リテラル型 | 許可（tests/ のみ） |
| Y1 | TS:70-81 `topOwnerName` | 構文（SourceFile 直下の宣言） | 許可の定義 |
| Y2 | TS:48-51 `filesUnder` | 宣言ファイル・node_modules を外す | 範囲 |

### 形を分解しているか

凡例: ○ 見る / × 見ない（見逃しうる）/ 安 見ないが違反になる（安全側）/ 他 別の規則が塞ぐ / − 該当しない / 未 未実測。列: U = union、I = intersection、TP = 型パラメーター（constraint 付き）、AL = 型エイリアス、CI = 条件型・indexed access、W = 括弧・`as`・`satisfies`・`!`、EA = 要素アクセス、PA = プロパティアクセス、OC = optional chaining、NS = namespace import・`import = require`・分割代入。形を分解する対象でない箇所（O1〜O9、O16〜O18、O25、G4、Y1、Y2 など、名前・宣言・範囲の判定）は省く。

| # | U | I | TP | AL | CI | W | EA | PA | OC | NS | 備考（× の中身） |
|---|---|---|---|---|---|---|---|---|---|---|---|
| O10 literalKey（device path） | × | × | × | ○ | ○ | ○ | − | − | − | − | R4-001（a11・a12・x03・x06） |
| O11 hasSafe | ○ | ○ | 他 | ○ | ○ | − | − | − | − | − | TP は O32 が塞ぐ |
| O12 allSafe（許可） | ○ | ○ | 未 | ○ | ○ | − | − | − | − | − | 許可の側。全枝を要求 |
| O13/O30 fd option | × | × | × | ○ | ○ | ○ | ○ | ○ | ○ | − | R4-002。動的な計算された名前・index signature も × |
| O14 holderOf | × | ○ | 未 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | union は共通のプロパティだけ見る。ただし holder の値を得る時点（`process` を値として使う）で O24 が違反にするので 2 次的 |
| O15 stdioProblem | − | − | − | − | − | 安 | − | − | − | 安 | options の wrapper（R4-005）。後ろの spread ○・計算された名前 ×（R4-004）。変数の options は安 |
| O19/O21/O22 端末・メンバー | − | − | − | − | − | 他 | ○ | ○ | ○ | ○ | 計算されたキーの分割代入は O24 が安、`import =` は O18 が安 |
| O20 fs・child の関数 | − | − | − | − | − | ○ | × | ○ | × | × | R4-003: 要素アクセス・型注釈つきの分割代入・`fs/promises` の宣言 |
| O23 `.constructor` | − | − | − | − | − | ○ | ○ | ○ | ○ | − | 計算されたキーは既知の限界 |
| O24 holder | − | − | − | − | − | 安 | ○ | ○ | ○ | ○ | 括弧は ○、`as`・`!`・`satisfies` は安 |
| O26 any の呼び出し | ○ | − | − | ○ | − | − | − | − | − | − | union の any は any に吸収される |
| O27 `Function` の呼び出し | × | − | − | ○ | − | − | − | − | − | − | `Function \| undefined` は `getSymbol()` が無い。`Function` を得る名前・`.constructor` が違反なので 2 次的（名前を書かない経路は既知の限界） |
| O28 fs の書き込み先 | × | × | × | ○ | ○ | 安 | − | − | − | − | R4-001・R4-005（括弧・`!` は安 = 誤検出）。spread の引数は R4 の試作で union として ○ |
| O29/Q1 starter・fsFunction | 他 | − | 他 | ○ | − | ○ | ○ | ○ | ○ | ○ | callee が条件式・union の関数なら O20 が callee 以外の参照として違反にする |
| O32 genericCast | × | × | ○ | ○ | × | − | − | − | − | − | INV-1: `as T \| undefined`・`as NonNullable<T>`・`as Awaited<T>` |
| G1 hasBrand | ○ | ○ | 未 | ○ | ○ | − | − | − | − | − | 深さ 4 は既知の限界（K3） |
| G5 brand の型アサーション | × | × | ○ | ○ | × | − | − | − | − | − | INV-1（brand 側）。端末へは届かない |
| G9 widened-renderer | − | − | − | − | − | − | − | × | − | − | `obj.render` を渡す形。brand だけで、端末へは届かない |
| G10 widened-container | − | − | − | − | − | − | − | − | − | − | 親 4 種以外（式本体のアロー・object のプロパティ・配列の要素）は ×（K3 の既知の限界）。端末へは届かない |
| Q3 usesShell | − | − | − | − | − | × | − | − | − | × | `({ shell: true })`・変数の options。tests/ だけで ADR-0019 の範囲外（最小 PATH のテストが補う） |

### 分解していない形の実測（x01〜x12。うち対照 2。不注意で書け、端末へ届き得るものを優先）

表の × のうち、§3-1 の fixture に無い形を x01〜x12 として測った（回帰テストの INV の群）。

- **x01**（wrapper の rest 引数 `writeFileSync(...a)`、`a: Parameters<typeof writeFileSync>`）・**x02**（`createWriteStream(...a)`）・**x04**（`createWriteStream(p, cfg.stream)`、`cfg.stream?: { fd?: number }`）: v0.5.20 で違反 0、標準出力へ 1 バイト。R4-001・002 の試作（union の分解）だけで塞がる（spread の引数の型は tuple の要素の union になる）
- **x03**（writer でない `copyFileSync` の先の device path の union）: v0.5.20 で違反 0。macOS では `copyfile` が EINVAL で終わり、届かない（Linux は未実測）。R4-001 の試作（`literalValues`）で塞がる
- **x06**（`<P extends "/dev/stdout" | "/dev/stderr">`）: 書く理由が乏しい記録用。届く（1 バイト）。R4-001 の試作で塞がる
- **x07・x08・x09（INV-1）**: `m.get(k) as T | undefined`・`v as NonNullable<T>` で `Safe` / `Checked` を作る形は、両ガードとも違反 0（OG:416 と BG:109 が型の最上位の flag だけを見る）。`as T` だけの対照（x10）は違反になる。実行時: `Safe` を受ける書き込み口（`emitOut` / `emitErr`）は `src/output.ts` の外に export されていないので、偽造した `Safe` は単独では端末へ届かない。偽造した `Checked` を `inlineCode` に渡すと `UncheckedValueError` で止まった（実行時の二重の防御）
- **x11**（`as Awaited<T>`、条件型）: 試作 I の後も違反 0（残る）。**x12**（`as Partial<T>`）も違反 0（`Safe` には使えない形の記録）
- 棚卸しの結論: 型の最上位の flag だけを見る**検出**の箇所は O10・O13・O28・O32・G5 の 5 つで、R4-001・002 と INV-1 がこれに当たる。構文を 1 種類しか見ない**検出**の箇所は O15（後ろの spread だけ）・O20（Identifier だけ）で、R4-003・004 がこれに当たる。ほかの × は 2 次的（別の規則が先に塞ぐ）か、端末に届かない brand・tests/ の箇所

### 許可の分岐の全数（v0.5.20、53。R4-006 の材料）

「許可」= ガードが調べた構文に対して違反を返さない判断。根拠: 構文 / 名前（一覧・最上位の宣言）/ 宣言の解決 / 型 / 範囲。「表」= ADR-0019 決定 7 の v0.5.20 の表にあるか。

| # | 場所 | 許可の内容 | 根拠 | 表 |
|---|---|---|---|---|
| 1 | OG:126 | `node:` 付きで `BUILTIN_ALLOWED` の組み込み | 名前 | − |
| 2 | OG:129-131 | 相対・絶対の指定子が `src/` の宣言ファイルでない `.ts` に解決 | 宣言の解決 | − |
| 3 | OG:133-134 | package.json の `dependencies` のパッケージ | 名前 | − |
| 4 | OG:261 | `import type` は読み込みとして数えない | 構文 | − |
| 5 | OG:266 | `export type` は数えない | 構文 | − |
| 6 | OG:275・278 | 型の中の参照（`process` のメンバー、eval など） | 構文 | − |
| 7 | OG:279-280 | `eval`・`Function`・`require`・`createRequire` は TS lib・`@types/node` の宣言に解決するときだけ違反（同名の局所の宣言は許可） | 宣言の解決 | − |
| 8 | OG:118-121 | `PROCESS_MEMBERS` は `process.d.ts` の宣言に解決するときだけ違反 | 宣言の解決 | − |
| 9 | OG:108-115 | 端末は `@types/node` の宣言に解決するときだけ（同名の別の記号は許可） | 宣言の解決 | − |
| 10 | OG:287 | fs・child の関数の import・export specifier | 構文 | ○ |
| 11 | OG:291 | fs・child の関数を callee として使う | 構文 | ○ |
| 12 | OG:319 | 宣言の名前（`nameOnly`）・括弧の中の式は holder の判定をしない | 構文 | − |
| 13 | OG:323 | holder の名前でのプロパティの読み取り | 構文 | − |
| 14 | OG:323 | holder の捨てる値（式文・`void`） | 構文 | − |
| 15 | OG:326-336 | holder のソース上のリテラルのキー（危険なメンバー・端末以外） | 構文 | ○ |
| 16 | OG:337-341 | holder の通常の分割代入（Identifier・文字列リテラルのキー、rest なし） | 構文 | − |
| 17 | OG:210-218 | 端末のプロパティを持たない型は holder でない | 型 | − |
| 18 | OG:359 | callee の型が `any` でない呼び出し | 型 | − |
| 19 | OG:361-362 | callee の型が `Function` でない呼び出し | 型 | − |
| 20 | OG:363-364 | `@types/node` の fs の宣言に解決しない呼び出しには fs の規則を当てない | 宣言の解決 | − |
| 21 | OG:368 | fs の writer の先頭の引数に wrapper が無い、または wrapper の中が文字列リテラル | 構文 | − |
| 22 | OG:369-370 | fs の writer の先頭の引数の型が number・any でない（R4-001 の穴） | 型 | − |
| 23 | OG:372 | `FS_WRITERS` は先頭の引数だけ device path を見る | 構文 + 名前 | ○ |
| 24 | OG:373-374 | 型が文字列リテラルでないパス（組み立てたパスは既知の限界） | 型 | − |
| 25 | OG:223 | `STDIO_REQUIRED` でない child の関数（`exec`・`execFile` の非同期）は stdio を見ない | 宣言の解決 + 名前 | − |
| 26 | OG:228-230 | stdio がソース上の `"pipe"`・`"ignore"`（wrapper を剥がす） | 構文 | ○ |
| 27 | OG:227 | stdio より前の spread | 構文 | ○ |
| 28 | OG:383 | 型に `fd` プロパティを持たない引数（R4-002 の穴） | 型 | − |
| 29 | OG:401-411 | writer の組の呼び出し（ファイル + 最上位の宣言 + member のテキスト + 引数 1 つ + 全枝 `Safe`） | 名前（+ 型） | ○ |
| 30 | OG:415-416 | 型アサーションの対象が型パラメーターでない（INV-1 の穴） | 型 | − |
| 31 | OG:421-422 | 総称型の cast の carrier | 構文 + 記号 | ○ |
| 32 | OG:432 | `Safe` の型アサーションを `safeText`・`safeJson`（最上位の宣言）の中で | 名前 | ○ |
| 33 | OG:437-440 | 文脈の型が `Safe` でない any | 型 | − |
| 34 | OG:317 | ソース上のリテラルでないキーは `.constructor` と見ない（既知の限界） | 構文 | − |
| 35 | OG:351 | 文字列リテラルの `import()`（行き先は 1〜3） | 構文 | − |
| 36 | BG:102 | `as const` | 構文 | − |
| 37 | BG:104-106 | ブランドの型アサーションを `CREATORS`（最上位の宣言）の中で | 名前 | ○ |
| 38 | BG:107-109 | 対象がブランド・any・never・型パラメーターでない型アサーション | 型 | − |
| 39 | BG:113-114 | 総称型の cast の carrier | 構文 + 記号 | ○ |
| 40 | BG:117 | 型述語の対象がブランドを持たない | 型 | − |
| 41 | BG:118-120 | 文脈の型がブランドを持たない any | 型 | − |
| 42 | BG:124-126 | 宣言の名前・import・export・プロパティアクセスの名前は issuer の参照と見ない | 構文 | − |
| 43 | BG:131 | issuer を `callers`（最上位の宣言）の中で直接呼ぶ | 名前 | ○ |
| 44 | BG:132 | `md` をタグとして使う | 構文 | − |
| 45 | BG:134 | callee・宣言は widened-renderer を見ない | 構文 | − |
| 46 | BG:136 | 文脈の型がブランドを取る関数 | 型 | − |
| 47 | BG:141 | ブランド付きの文字列そのもの（container でない） | 型 | − |
| 48 | BG:144-146 | 親が 4 種以外（式本体のアロー関数など。K3 の既知の限界） | 構文 | − |
| 49 | BG:147 | 対象の型がブランド・any・unknown を持つ | 型 | − |
| 50 | BG:148-156 | `ReadonlyArray`・tuple・readonly だけの object | 型 | − |
| 51 | BG:44・51 | 深さ 4・プロパティ 40 の上限（K3 の既知の限界） | 範囲 | − |
| 52 | TS:70-81 | 最上位の宣言の定義（`topOwnerName`）: SourceFile 直下の function・class・variable | 構文 | （表の前提の定義） |
| 53 | TS:50 | 宣言ファイル・node_modules を走査しない | 範囲 | − |

表にある（○）のは 12（10・11・15・23・26・27・29・31・32・37・39・43）。52 は表の 3 行の前提の定義として数えていない。`process-guard.ts` の tests/ 向けの 4 つ（`fork`・`process.execPath`・文字列リテラル型のコマンド、`DECLARED`、`PROBED` の probe・guard、`shell: false`）は ADR-0019 の範囲外として数えていない。数え方は 1 人の実装側の読み（確認）で、機械的な列挙ではない。

## 教訓の候補（`tasks/lessons.md`・CLAUDE.md・共通ルールには足していない。人間の判断）

### 2026-09-30: 型・構文で絞る検出が、最上位の flag か 1 種類の構文だけを見て、同じ系統の指摘が続いた（R4-001〜004）
- 根本原因: R3 の教訓 §2-7「許可の分岐を全部数える」を、**許可する側**にだけ当てた。違反を**見つける側**（型の flag、`isIdentifier`、`isSpreadAssignment`）は、最上位の形だけを見る規則が残っていた
- 再発防止: 型を検出に使う箇所は、最上位の flag でなく、union・intersection・型パラメーターの constraint の枝まで分解する helper を通す（どれか 1 枝でも危険なら違反）。構文で絞る箇所は、同じ値を得る構文
  （Identifier・要素アクセス・分割代入・optional chaining・namespace の要素）を並べて表にしてから規則を書く。型・構文で絞る箇所を全部数えて表にするのは、新しい検出規則を足す commit ごとに 1 巡行う

## `package-lock.json` の差分（v0.5.19..v0.5.20）

レビューパケットは lock ファイルの本文・差分を載せない（kind `lock`）。レビュアーが確認できる形にするため、実行した差分の全文をここに置く。

- コマンド: `git diff v0.5.19..v0.5.20 -- package-lock.json`
- 差分のテキストの SHA-256: `630805ed3187f4f95d2028276f4f2a2d7f166467fca4286f0ced71b044853690`、755 バイト（hunk 1 つ、+3 / −3）
- 変わったのは `node_modules/brace-expansion` の `version`（5.0.9 → 5.0.12）・`resolved`・`integrity` の 3 行だけ（`"dev": true`）。lock を変えた commit は `1e3e18e`（`chore(deps): npm audit fix — brace-expansion high advisories`）だけで、
  v0.5.20 の release commit `d669b5e` は `package.json` の version だけを変えた。lock の先頭の `version` は 0.1.0 のまま。v0.5.20..v0.5.21 では lock は変わらない

```diff
diff --git a/package-lock.json b/package-lock.json
index de1373d..48a502a 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -982,9 +982,9 @@
       }
     },
     "node_modules/brace-expansion": {
-      "version": "5.0.9",
-      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.9.tgz",
-      "integrity": "sha512-ScQ4IuvIEF1TMlP7Zt+vjJ//9zlPb2SDcxWxM3bk8s6t6GGdJ7KO1dCcTidOPJKePW30LE/2cT7wCyPho9/Wxg==",
+      "version": "5.0.12",
+      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz",
+      "integrity": "sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
```
