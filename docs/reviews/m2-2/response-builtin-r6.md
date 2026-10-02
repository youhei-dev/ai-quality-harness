# M2-2 BUILTIN R6 の独立レビューへの対応記録（response-builtin-r6）— v0.5.23

- 対象レビュー: `docs/reviews/m2-2/independent-review-builtin-r6.md`（受領ファイル名 `independent-review-m2-2-builtin-r6-for-claude.md`、ChatGPT、2026-10-02 受領、
  SHA-256 0264655c…e59dcbe、30,657 バイト。対象 v0.5.22 = commit 4c6d430 / tag object 0447d81、範囲 v0.5.21..v0.5.22）
- 対応日: 2026-10-02
- 結果（レビュアー）: 前回の R5-001〜004 は、解消 2（R5-002・004）、部分的に解消 2（R5-001・003）、未解消 0。新しい指摘は **High 4（R6-001〜004）/ Medium 0 / Low 0**。
  4 件とも「不注意で書ける形」、`src/` の該当は 0。レビュアーは、最終回でも **4 件を (i)/(ii)/(iii) の限界に分類し直さず**、レビュー回を増やさずに最終修正で閉じるよう勧めた。
  レビュアーは今回も対象コード・fixture・テストを実行していない（R6-002 は確信度「中」）
- **この最終修正（v0.5.23）は、独立した再レビューを受けていない**。r6 が最後のレビューで、r7 は依頼しない。自己 verify と回帰テスト（fixture は修正前のガードで見逃し・端末への到達を実測した形）で確認した

## 人間の判断（この作業の仕様）

1. 4 件を、**独立レビューを増やさず、その場で直す**。「最後だから (i)/(ii)/(iii) に分類し直して限界にする」処理はしない。ROADMAP の項目 2・3 の文言が 4 件の扱いを決めていなかったので、ROADMAP を直して明記した
2. **実測してから直す**（本物の型検査器で、SHA 指定の一時 worktree に v0.5.22 のガードを当てた fixture）。確認できた形（とそれと同じ入口の形）だけを直す
3. R6-001: fs・child_process の関数の**名前での再 export を違反**にする（`export type`・`{ type x }` は許す）。再 export 先をたどる規則は作らない。`p18_named_reexport`（対照）を「報告される」へ変える（承認済み）
4. R6-002: `Utf8Stream` を**値として import・再 export する形を違反**にする（型は許す）。`new Utf8Stream` の検出は多重の防御として残す。constructor の来歴をたどる規則は作らない
5. R6-003: 登録 method を、property access に加えて**ソース上の文字列リテラルの要素アクセス**でも同じ規則に入れる。非リテラルは既存の holder の規則が違反にしているので追加しない
6. R6-004: 別名の追跡を、shorthand property・initializer を持つ class field に広げ、固定の深さ 3 を**訪問済みの宣言の集合で循環を防ぐ追跡**に置き換える。Record・配列・非リテラルの要素アクセス・parameter・戻り値の先は追わない
7. 入口の表に 3 行を足す・直す。停止規則（型を許可の根拠にする新しい系統）に当たらない。**既存の規則は全部残す**

## 指摘の判定（実測。fixture 55 件。v0.5.22 のガードに当てた）

| ID | 判定 | 分類 | `src/` の該当（ガード／形の走査） | 実行時（実測） | 直したか |
|---|---|---|---|---|---|
| R6-001 | **確認できた**（a01〜a07 を v0.5.22 は見逃す。child_process も同じ） | 不注意で書ける形 | 0／0 | 届く（stdout 1 バイト） | 直した |
| R6-002 | **確認できた**（局所の construct signature を通す形 b01・b02・b05 を見逃す）。レビュアーの限定どおり、`const C = Utf8Stream`（b03）と `import { Utf8Stream as X }`（b04）は v0.5.22 でも検出される | 不注意で書ける形 | 0／0 | 届く（`dest: "/dev/stdout"` で 1 バイト） | 直した |
| R6-003 | **確認できた**（c01〜c06・c08 を見逃す）。`(process as NodeJS.Process)["on"]`（c07）は holder の規則が既に違反にしている | 不注意で書ける形 | 0／0 | 届く（1 バイト） | 直した |
| R6-004 | **確認できた**（shorthand property d01、class field d02・d03、別名 4 段 d07・5 段 d08、プロパティの 4 段 d09 を見逃す。3 段までの別名 d05・d06 は検出される） | 不注意で書ける形 | 0／0 | 届く（1 バイト） | 直した |
| 追加の確認 | `import { x }; export { x }`（from の無い再 export。a06・a07）も R6-001 と同じ入口で、v0.5.22 は見逃す | 不注意で書ける形 | 0／0 | 届く | R6-001 と同じ規則で直した |
| 直さなかった形 | getter が function を返す listener（d11）、Record・配列・parameter・戻り値の先（d12〜d15） | (ii)（getter は同じ系統として限界に書く） | 0／0（`process.on` は Record の要素アクセスが 2 か所） | 届く（1 バイト） | 直さない（承認文のとおり） |

- レビュアーの主張と実測の食い違い: (1) R6-002 の「`plain const C = Utf8Stream` は捕捉できる可能性」→ 実測でも検出される。外れるのは局所の construct signature に持ち替える形。 (2) R6-003 の列挙に含まれる `(process as NodeJS.Process)["on"]` は、listener の規則ではなく holder の規則（`process` の `as` 付きの使用）で既に違反。 (3) R6-004 の「4 段以上」は、実測では**変数 3 つ + method の参照（別名 3 段）までは検出され、変数 4 つから外れる**（固定の深さ 3 のため）
- 4 件すべてが確認できたので、以降の Step は 4 件で進めた

### fixture ごとの結果（形 × v0.5.22 × 実装後 × 端末への到達）

数字は違反の件数。区分の「見逃しの主張」は v0.5.22 で 0 なら再現。

| id | 形 | 区分 | v0.5.22 | 実装後 | 実行時（stdout バイト） |
|---|---|---|---|---|---|
| `a01_reexport_ns_to_interface` | export { writeFileSync } from "node:fs" のローカル module を import * で受け、局所の interface の helper へ渡す | 見逃しの主張 | 0 | 1 | 1 |
| `a02_reexport_renamed` | export { writeFileSync as wf } from "node:fs"（別名で再 export） | 見逃しの主張 | 0 | 1 | 1 |
| `a03_child_reexport` | export { spawnSync } from "node:child_process"（stdio: inherit） | 見逃しの主張 | 0 | 1 | 1 |
| `a04_reexport_dynamic_import` | 再 export したローカル module を動的 import() で受ける | 見逃しの主張 | 0 | 1 | 1 |
| `a05_reexport_chain` | 再 export の連鎖（a が再 export、c が export * で連結、b が c の namespace を渡す） | 見逃しの主張 | 0 | 1 | 1 |
| `a06_import_then_export` | import { writeFileSync } from "node:fs"; export { writeFileSync };（from の無い再 export。同じ入口） | 見逃しの主張 | 0 | 1 | 1 |
| `a07_import_then_export_alias` | import { writeFileSync } from "node:fs"; export { writeFileSync as wf }; | 見逃しの主張 | 0 | 1 | 1 |
| `a08_read_function_reexport` | 読み取りの関数の再 export export { readFileSync } from "node:fs"（端末へは届かない。承認文は fs の関数を一律に禁止） | 記録 | 0 | 1 | 測らない |
| `a09_named_import_of_reexport_call` | 対照: 再 export を名前付き import で受けて直接呼ぶ（呼び出しの規則で device path が検出される） | 対照（違反になるべき） | 1 | 2 | 1 |
| `a10_export_type` | 対照: export type { Stats } from "node:fs"（許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `a11_export_inline_type` | 対照: export { type Stats } from "node:fs"（許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `a12_path_reexport` | 対照: export { join } from "node:path"（関数の束の module ではない。許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `a13_local_const_reexport` | 対照: export { x } from "./local"（関数でない値。許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `a14_crypto_reexport` | 対照: export { createHash } from "node:crypto"（端末へ届かない module。許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `b01_ctor_param_interface` | Utf8Stream を局所の construct signature の interface の parameter に渡して new する（dest: /dev/stdout） | 見逃しの主張 | 0 | 1 | 1 |
| `b02_ctor_di_slot` | DI の slot（型は局所の Ctor）に入れて new する | 見逃しの主張 | 0 | 1 | 1 |
| `b03_const_alias` | const C = Utf8Stream; new C({ dest })（型は @types/node のまま） | 記録 | 1 | 2 | 1 |
| `b04_import_alias` | import { Utf8Stream as X }; new X({ dest }) | 見逃しの主張 | 1 | 2 | 1 |
| `b05_factory_helper` | constructor を返す局所の helper を経由して new する | 見逃しの主張 | 0 | 1 | 1 |
| `b06_direct_new` | 対照: 直接の new Utf8Stream（今でも違反） | 対照（違反になるべき） | 1 | 2 | 1 |
| `b07_import_type` | 対照: import type { Utf8Stream }（型だけ。許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `b08_inline_type_import` | 対照: import { type Utf8Stream }（型だけ。許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `b09_value_import_type_use` | 代償: 値の import で型としてだけ使う import { Utf8Stream }（import type に直す必要がある） | 記録 | 0 | 1 | 測らない |
| `b10_reexport_value` | export { Utf8Stream } from "node:fs"（値の再 export） | 見逃しの主張 | 0 | 1 | 測らない |
| `b11_reexport_type` | 対照: export type { Utf8Stream } from "node:fs"（許す） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `c01_on_element` | process["on"](…, r.onEvent) | 見逃しの主張 | 0 | 1 | 1 |
| `c02_once_element` | process["once"] | 見逃しの主張 | 0 | 1 | 1 |
| `c03_addListener_element` | process["addListener"] | 見逃しの主張 | 0 | 1 | 1 |
| `c04_prependListener_element` | process["prependListener"] | 見逃しの主張 | 0 | 1 | 1 |
| `c05_prependOnceListener_element` | process["prependOnceListener"] | 見逃しの主張 | 0 | 1 | 1 |
| `c06_globalthis_process_element` | globalThis.process["once"] | 見逃しの主張 | 0 | 1 | 1 |
| `c07_as_node_process_element` | (process as NodeJS.Process)["on"] | 見逃しの主張 | 1 | 2 | 1 |
| `c08_template_key` | process[`on`]（置換のないテンプレートリテラル） | 見逃しの主張 | 0 | 1 | 1 |
| `c09_as_const_key` | process["on" as const]（wrapper 付きのリテラルのキー。holder の規則は違反にする） | 対照（違反になるべき） | 1 | 2 | 1 |
| `c10_property_access_control` | 対照: process.on(…, r.onEvent)（今でも違反） | 対照（違反になるべき） | 1 | 1 | 1 |
| `c11_element_bind_control` | 対照: process["on"](…, r.onEvent.bind(r))（this は r。違反にならない） | 対照（違反にならないべき） | 0 | 0 | 0 |
| `c12_element_arrow_control` | 対照: process["on"](…, () => r.onEvent())（違反にならない） | 対照（違反にならないべき） | 0 | 0 | 0 |
| `c13_element_no_this_control` | 対照: process["on"] に this を使わない関数（違反にならない） | 対照（違反にならないべき） | 0 | 0 | 0 |
| `c14_dynamic_key_control` | 対照: 非リテラルのキー process[k]（holder の規則で今でも違反） | 対照（違反になるべき） | 1 | 1 | 測らない |
| `d01_shorthand_property` | const h = r.onEvent; const box = { h }; process.on(…, box.h)（shorthand property） | 見逃しの主張 | 0 | 1 | 1 |
| `d02_class_field_method_ref` | class field の initializer に method の参照（h = new Reporter().onEvent）を持つ class を new して .h を渡す | 見逃しの主張 | 0 | 1 | 1 |
| `d03_class_field_function_expression` | class field の initializer の関数式（this: …） | 見逃しの主張 | 0 | 1 | 1 |
| `d04_class_field_arrow_control` | 対照: class field の arrow（this は instance。違反にならない） | 対照（違反にならないべき） | 0 | 0 | 0 |
| `d05_alias_2` | 別名 2 段（変数 2 つ + method の参照） | 対照（違反になるべき） | 1 | 1 | 1 |
| `d06_alias_3` | 別名 3 段 | 対照（違反になるべき） | 1 | 1 | 1 |
| `d07_alias_4` | 別名 4 段 | 見逃しの主張 | 0 | 1 | 1 |
| `d08_alias_5` | 別名 5 段 | 見逃しの主張 | 0 | 1 | 1 |
| `d09_property_chain_4` | object のプロパティを重ねる 4 段（{ a: r.onEvent } → { b: o1.a } → …） | 見逃しの主張 | 0 | 1 | 1 |
| `d10_cycle` | 循環（var a: F = b; var b: F = a）。ガードが止まること（違反の有無は問わない。this を使う method は含まない） | 対照（違反にならないべき） | 0 | 0 | 測らない |
| `d11_getter` | getter が function を返す（直さない形。報告のみ） | 記録 | 0 | 0 | 1 |
| `d12_record_control` | 対照: Record の要素アクセス（追わない。src/cli-signals.ts:30 と同じ形で this を使う method） | 対照（違反にならないべき） | 0 | 0 | 1 |
| `d13_array_control` | 対照: 配列の要素（追わない） | 対照（違反にならないべき） | 0 | 0 | 1 |
| `d14_parameter_control` | 対照: parameter の先（追わない） | 対照（違反にならないべき） | 0 | 0 | 1 |
| `d15_return_control` | 対照: 関数の戻り値の先（追わない） | 対照（違反にならないべき） | 0 | 0 | 1 |
| `d16_src_form_control` | 対照: src/cli-signals.ts と同じ形（アロー関数の Record。違反にならない） | 対照（違反にならないべき） | 0 | 0 | 測らない |

- `src/` の形の走査（型検査器で全 36 ファイルを歩いた。走査器の感度は同じ走査を fixture に当てて確認した: 名前での export 9、`Utf8Stream` の値の使用 6、literal の要素アクセスによる登録 11、登録 28）: 名前での export **0**、fs・child_process の `export … from` **0**、`Utf8Stream` の値の使用 **0**、literal の要素アクセスによる登録 **0**。listener の登録は 4 か所（`process.on` 2 か所は `src/cli-signals.ts:30`・`src/cli.ts:66` の Record の要素アクセス、`child.on` 2 か所は `src/runner/execute.ts:188,201` のアロー関数）

## 修正（v0.5.23。`tests/` と docs だけ。`src/` は変えない）

| 指摘 | 規則 |
|---|---|
| R6-001 | `ExportSpecifier`（`from` の有無を問わない）が `@types/node` の fs・child_process・fs/promises の関数の宣言に解決するとき違反（`export type`・`{ type x }` は除く）。再 export 先の module はたどらない |
| R6-002 | `import { Utf8Stream }`（`as X` を含む）・`export { Utf8Stream } from "node:fs"` を違反（`import type`・`{ type Utf8Stream }` は許す）。`new Utf8Stream` の検出は残す |
| R6-003 | 登録 method（`on`・`once`・`addListener`・`prependListener`・`prependOnceListener`）を、`x.on` に加えて `x["on"]`（キーはソース上の文字列リテラルで、`as const`・`satisfies`・括弧は剥がす）でも同じ規則（`listenerUsesThis`）に入れる |
| R6-004 | `listenerUsesThis` の追跡を、`ShorthandPropertyAssignment`（値の symbol を追う）、initializer を持つ `PropertyDeclaration` に広げ、固定の深さ 3 を、訪問済みの宣言の集合に置き換えた（何段でも追い、循環で止まる） |

- `tests/structure/output-guard.ts`: 本体 **+54／−17 行**、先頭の説明コメント **+11／−7 行**。`brand-guard.ts` は変えていない
- 新しい `tests/regression-m2-2-builtin-r6-reexport-and-listener-forms.test.ts` **58 件**: 単独の 45 形（R6-001 4、R6-002 11、R6-003 14、R6-004 16）、複数ファイルの 10 形（`src/` 直下の仮想ファイル）、fixture の型検査 2、`src/` の違反 0（output-guard・brand-guard）。**v0.5.22 のガードでは 58 件中 26 件が FAIL**（実測）。既存の 1,182 件は `p18_named_reexport` の 1 件を除いて期待値を変えていない。合計 **1,240 件（110 ファイル）**。`FD_OPTION_APIS`・`FORBIDDEN_FS_CLASSES` の両方向テストは変えず PASS
- 期待値を変えた既存テスト 1 件: `regression-m2-2-builtin-r5-entrance-forms.test.ts` の `p18_named_reexport`（`export { writeFileSync } from "node:fs"`）を `reported: false` → `true`（承認済み。名前での再 export が R6-001 の入口だから）

## 代償として違反になる形（`src/` には無い。受け入れる）

- fs・child_process の関数を名前で export する形（読み取りの関数 `readFileSync` の再 export も。a08。`export type` は許す）
- `Utf8Stream` を値として import する形（型だけに使うなら `import type` に書く。b09）

## 直さなかった形・既知の限界

- getter が function を返す listener（d11。実測で標準出力へ届く。同じ系統として直さない）、Record・配列・非リテラルの要素アクセス・parameter・関数の戻り値の先の listener（(ii)。`src/cli-signals.ts:30`・`src/cli.ts:66` と両立しない）
- ADR-0019 の「残る EventEmitter は indirect form だけ」は、登録 method の literal の要素アクセス・shorthand property・class field・4 段以上の別名で過大だったので、実装に合わせて直した

## 教訓の候補（`tasks/lessons.md`・CLAUDE.md・共通ルールには足していない。人間の判断）

### 2026-10-02: 入口を module の指定子で塞ぐだけでは、許可した export の先で入口が再生成される（R5-001 → R6-001）

- 根本原因: `node:fs` の関数の束を直接得る import を禁止したが、名前付きの関数の再 export は許していたので、再 export したローカル module が新しい関数の束になった。「入口の表」は module の指定子の行しか持っていなかった
- 再発防止: 許可した export が**他のファイルから見て新しい束になるか**を入口の表で確かめる。入口は「import の形」だけでなく「export の形」も表に載せる

### 2026-10-02: 「Nまで追う」固定の深さと declaration の種類の列挙は、同じ列挙の問題に戻る（R5-003 → R6-004）

- 根本原因: listener の別名を、PropertyAssignment と VariableDeclaration だけ・深さ 3 まで追ったので、shorthand property・class field・4 段以上が外れた
- 再発防止: 追跡は固定の深さでなく訪問済みの集合で止め、値を渡す declaration の種類（variable・property・shorthand・field）は表にして漏れを確かめる

### 2026-10-02: 一度作った規則の「呼び出しの形」を 1 種類だけ見ない（R5-003 → R6-003）

- 根本原因: listener の規則を `x.on(…)` の property access でだけ起動したので、`x["on"](…)` で外れた
- 再発防止: 規則の起動条件に使う callee の形は、property access と literal の要素アクセスの両方（wrapper を剥がして）で書く

## 停止規則・`package-lock.json`

- 停止規則（教訓 §2-7）には当たらなかった。4 つの規則は、export／import の形、要素アクセスの形、宣言の種類（構文）と名前（`Utf8Stream`・登録 method）、宣言の解決だけで、型を許可の根拠にしていない
- `package-lock.json` は変えていない（`version` は 0.1.0 のまま。依存関係の変更なし）。`src/` は変えていない（`git diff v0.5.22 HEAD -- src` が空）
