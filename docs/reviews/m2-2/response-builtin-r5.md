# M2-2 BUILTIN R5 の独立レビューへの対応記録（response-builtin-r5）— v0.5.22

- 対象レビュー: `docs/reviews/m2-2/independent-review-builtin-r5.md`（受領ファイル名 `independent-review-m2-2-builtin-r5-for-claude.md`、ChatGPT、2026-10-02 受領、
  SHA-256 b5a25aa4…cea6f7c、34,932 バイト。対象 v0.5.21 = commit e39ff47 / tag object 2b3cde6、範囲 v0.5.20..v0.5.21）
- 対応日: 2026-10-02
- 結果（レビュアー）: 前回の R4-001〜006 は、解消 5（001・002・004・005・006）、部分的に解消 1（003）、未解消 0。新しい指摘は **High 2（R5-001・002）/ Medium 1（R5-003）/ Low 1（R5-004）**。
  4 件とも「不注意で書ける形」、`src/` の該当は 0（レビュアーが全 36 ファイルで数えた）。レビュアーは「レビューを終了してよい状態とは判断しない」とした。
  レビュアーは今回も対象コード・fixture・テストを実行していない（静的な読みの主張）
- 人間の判断（SP1 の報告への回答。SP2 の仕様）
  1. **方式は「入口を塞ぐ」**（SP1 の前の判断）。**箱の仕分けは SP1 §7-1 のとおり**。R5-001（案 A）、R5-002（案 B）、R5-003 の直接解決できる形（案 C）、R5-004（案 D）、docs の 2 点を直す。
     (a) 追加の入口 z01（`new Utf8Stream`）を直す（`FORBIDDEN_FS_CLASSES`）、(b) `createReadStream` を B に含める（`FD_OPTION_APIS`）、(c) C は `prependOnceListener` を含めて 5 つ。
     箱 2（既知の限界）: R5-003 の Record・要素アクセスの先（(ii)。r12）、総称型の cast と別の値（(ii)）。箱 3: B・A の代償を受け入れる
  2. **既存の規則は全部残す**: R4-003 の要素アクセス・module の分割代入の規則、`fdBranch`、規則 K（`f06_cost_mkdir_record` は「報告される」のまま）。外す判断は r6 の後
  3. **既存の期待値の変更 13 件を承認**（下の表）。`ct07_dynamic_import_allowed` は「報告される」へ（動的 import の許可と fs の namespace の値の禁止は両立しない。`node:crypto` などへの差し替えはしない）
  4. **ROADMAP の「レビューを終える基準」**: SP1 の案を採り、3 点目（入口の表にない入口が見つかったら表に 1 行足して規則を足す。レビューの回は増やさない）も入れる。**r6 を最後の 1 回とし、r7 は依頼しない**。(iii) 端末へ届かない誤検出の分類も書く
  5. **docs**: SP1 §6 の案を土台にし、**ADR-0019 に入口の表を載せる**（r6 の指摘を表の行に紐づけるため）。許可の分岐の全数など ADR の保証でない記録は、この response に置く
  6. **r6 は最後の回**。パケットには `src/` の全文、ADR（入口の表を含む）、この response、レビュー原文の収録を含める

## 指摘の判定（SP1 の実測。fixture 70 件。v0.5.21 のガードに当てた）

SP1 では、v0.5.21 の commit を SHA 指定した一時 worktree に作り、fixture を 1 つの Program に載せて当てた。実行時の到達は fixture を単体で実行して測った（53 件。バイト数と終了コードだけ。macOS・Node v24.13.1）。

| ID | 重大度 | 判定 | 分類 | 箱 | `src/` の該当 | 実行時（実測） |
|---|---|---|---|---|---|---|
| R5-001 | High | **部分的に VALID** | 不注意で書ける形 | 1（案 A） | 0 | 届く（stdout 1 バイト。child の `stdio: inherit` も） |
| R5-002 | High | **部分的に VALID** | 不注意で書ける形 | 1（案 B） | 0 | `createWriteStream` は届く。`createReadStream` は読み取りで 0 バイト |
| R5-003 | Medium | VALID | 直接: 不注意で書ける形（`this` の型を注釈した関数だけ (i)）／Record の先: (ii) | 直接 1（案 C）／Record の先 2 | 0 | 届く（1 バイト）。Record 形も届く（r12） |
| R5-004 | Low | VALID（誤検出） | 不注意で書ける形の誤検出 | 1（案 D） | 0 | 届かない（0 バイト） |
| docs 指摘 2 点 | — | 妥当 | — | 1 | — | — |
| z01（入口の表で発見） | — | 実在 | 不注意で書ける形に近い（実験的 API の `dest`） | 1 | 0 | 届く（1 バイト） |

- レビュアーの「見逃す」主張に当たる 35 形のうち、v0.5.21 が実際に見逃したのは **34 形**。**p01・p05・q02 は主張より狭い条件でしか外れない**:
  - p01: parameter の分割代入でも、型が `@types/node` の関数型（`Pick<typeof fs, "writeFileSync">`）のままなら今でも検出される。外れるのは局所の関数型を通した後（p02）
  - p05: 変数のキーの要素アクセスを直接呼ぶ形は検出される。外れるのは別の関数型を通した後（p04）
  - q02: helper の parameter へ `fd` を持つ変数をそのまま渡す形は、呼び出しの引数の型に `fd` が見えて検出される。外れるのは、戻り値・注釈・設定の view で先に狭めた後（q01・q03・q05）
- 「誤検出」の主張 5 形（s01〜s05）はすべて実在（実行時 0 バイト）。TypeScript は literal の同名キーの重複（s07・s09）を拒むので、wrapper を剥がしても新しい穴にならない
- child_process の options は R5-002 の系統に当たらない（変数の options は今でも違反。q07）

## 修正（v0.5.22。`tests/` と docs だけ。`src/` は変えない）

| 案 | 内容 | 本体の行数 |
|---|---|---|
| A（R5-001） | `fs`・`child_process`・`fs/promises` の default import・`import * as`・`{ default as x }`・`{ promises }`（関数を持つ namespace かを宣言で判定。`constants` は影響なし）・`export *`・`export * as x`・再 export の `default` / `promises`・動的 `import()` を違反にする。名前付き import の関数だけを入口とする | +25 |
| B（R5-002、z01） | `createReadStream`・`createWriteStream` の options を、省略・文字列リテラル・新しい object literal（全プロパティ名がソース上の名前、`fd` なし、spread なし）に限る。`new Utf8Stream` を違反にする。API の一覧（`FD_OPTION_APIS`・`FORBIDDEN_FS_CLASSES`）が `@types/node` の宣言と一致することを回帰テストで両方向に確かめる | +41 |
| C（R5-003） | `process.on`・`once`・`addListener`・`prependListener`・`prependOnceListener` の listener が、関数式・関数宣言・method の参照（変数・オブジェクトのプロパティを 3 段まで経由）で、`this` を使う、または `this` parameter（`this: void` を除く）を宣言するときに違反 | +37 |
| D（R5-004） | `stdioProblem` の `stdio` の探索と後ろの計算された名前、規則 K、`fd` の計算された名前を `writtenKey(unwrapped(…))` で読む（`propKey`）。`writtenKey` 自体は変えない（holder の `process["platform" as const]` は違反のまま） | +10 / −4 |

- ガード全体: `tests/structure/output-guard.ts` 本体 **+107 / −4 行**、先頭の説明コメント **+16 / −5 行**（合計 +123 / −9）。`brand-guard.ts` は変えていない
- **試作との違い**: コード部分は SP1 の試作 ALL（`protoALL.patch`）と同一の内容（`git apply` で適用でき、適用後の `src/` の違反は 0）。違いは先頭の説明コメントだけ（試作 +9 / −1 → +16 / −5）で、listener の対象を 5 つに明記し、`fd` の項を読みやすく書き直し、決定 7 の言い方（入口を先に塞ぐ、object literal の形も構文）を足した。試作が含めていなかった点は無い
- 既存の規則は全部残した: 要素アクセス・module の分割代入の規則（SP1 の実測では、外した版でも R4-003 の fixture は A が先に塞いで全部報告されたままだった）、`fdBranch`、規則 K

## 回帰テスト

- 新しい `tests/regression-m2-2-builtin-r5-entrance-forms.test.ts` **75 件**: 単独のファイルの 66 形（R5-001 26、R5-002 12、R5-003 16、R5-004 9、入口の表 3）、2 ファイルの 2 形（p08・p09。`src/` 直下の仮想ファイル）、TypeScript が拒む 2 形（s07・s09）、fixture の型検査 2、`fd` を取る API の一覧が `@types/node` と両方向に一致するテスト 2、`src/` の違反 0（output-guard・brand-guard）
- **v0.5.21 のガードでは 75 件中 41 件 FAIL**（実測。見逃していた形 34、誤検出だった形 5、API の一覧のテスト 2）。SP1 の見積もり（34 + 5）と一致
- 期待値: 見逃しだった形は `reported: true`、誤検出だった形 s01〜s05 は `false`、対照は期待どおり。**r12（Record の要素アクセス経由の listener）は「報告されない」限界の記録**
- 既存の 1,107 件: 下の 13 件を除いて期待値を変えていない。合計 **1,182 件（109 ファイル）全 PASS**

### 期待値を変えた既存テスト 13 件（承認済み）

| テスト | 変更 | 理由 |
|---|---|---|
| `regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts` の `x25_this_carrier_listener`・`x26_this_carrier_object_method`・`x36_this_carrier_class_method`・`x37_this_carrier_once_function_expression`・`g06_this_carrier_process_from_globalthis`（5 件） | 「報告されない」限界の記録（`LIMITS`）→「報告される」（新しい `LISTENERS`） | 案 C が直接解決できる listener を違反にする |
| `regression-m2-2-builtin-r3-allow-branches.test.ts` の `ee01`〜`ee06`（6 件） | `reported: false` → `true`。`ee07`（Record）と対照 `ee08`〜`ee11` は変更なし | 同上 |
| `regression-m2-2-builtin-r4-union-and-element-forms.test.ts` の `b14_control_optional_no_fd` | `reported: false` → `true` | 案 B の代償（`fd` を持たない型の options の変数も、literal でなければ報告する） |
| `regression-m2-2-r4-002-builtin-allowlist.test.ts` の `ct07_dynamic_import_allowed` | 対照 → 報告される形 `di05_fs_dynamic_import_namespace`（名前も実態に合わせた） | 動的 import の許可と fs の namespace の値の禁止は両立しない（案 A の代償） |

`xb25_stdio_options_paren`（v0.5.21 で `reported: false` にした 1 件）は変更なし。

## 代償として違反になる形（`src/` には無い。受け入れる）

- `fs`・`child_process`・`fs/promises` の default import・`import * as`・`{ promises }`・`export *`・動的 `import()`（`node:path`・`crypto`・`zlib` は影響なし。`constants` の名前付き import も影響なし）
- `createReadStream`・`createWriteStream` の options を変数・parameter で渡す形（実際は `fd` が無くても。b14）。`new Utf8Stream`
- `this` を使う method を unbound で `process.on` などに渡す形、`this` parameter を宣言した listener（`this: void` を除く）
- 減る誤検出: `stdio` の後ろ・規則 K の計算されたキーの `as const`・`satisfies`・`!`

## 既知の限界として残したもの

- R5-003 の Record・要素アクセス・parameter・戻り値の先の listener（(ii)。根拠: `src/cli-signals.ts:30`・`src/cli.ts:66` が同じ形を使う。r12 は標準出力へ 1 バイト届く）
- 総称型の cast と別の値（(ii)。根拠: `maskDeep<T>` の正当な cast と衝突する）
- R3-005 の残り（(ii)）、条件型・mapped type の総称型の cast（(ii)）は変更なし。`function (this: 偽の型)`（(i)）は案 C が同じ規則で閉じる

## 許可の分岐の全数について

v0.5.21 の許可の分岐の全数（53）と型・構文で絞る箇所（51）は `response-builtin-r4.md` に置いた（ADR の保証ではない）。今回は棚卸しの巡をしていない。許可モジュールごとの入口は、ADR-0019 の入口の表（1 回だけ作った）に載せた。

## 教訓の候補（`tasks/lessons.md`・CLAUDE.md・共通ルールには足していない。人間の判断）

### 2026-10-02: 値の来歴を構文ごとに追う規則を足し続け、同じ系統の指摘が続いた（R4-003 → R5-001）

- 根本原因: fs・child の関数の参照を、Identifier・要素アクセス・変数宣言の分割代入の 3 構文で個別に拾ったので、parameter の分割代入・代入の分割代入・namespace を局所の型で受ける helper など、同じ値を得る別の構文が残った
- 再発防止: 「関数の値を得る構文」を並べる前に、**値の入口**（どの import・どの export で関数の束が得られるか）を先に塞ぎ、入口を許可モジュールごとの表に 1 回だけ載せる。新しい構文を足す前に、入口の表に載っているかを確かめる

### 2026-10-02: 静的な型を「実行時にその property が無い」ことの証明に使った（R4-002 → R5-002）

- 根本原因: `fd` option を、引数の型に `fd` が見えるかで検出した。構造的部分型により、実行時の `fd` は戻り値・parameter・注釈の狭い型の後ろで見えなくなる
- 再発防止: 型に危険な property が無いことを理由に許す判断は、普通の書き方でも外れる。`fd` を取る API を `@types/node` から列挙して構文（新しい object literal）に寄せ、API の一覧が宣言と一致することを回帰テストで確かめる

### 2026-10-02: レビュアーの静的な読みの主張は、実測で「外れる条件」を分けてから直す

- 根本原因: 主張のうち p01・p05・q02 は、主張より狭い条件でしか外れなかった。条件を分けずに構文を足すと、過剰な規則になる
- 再発防止: 各形を fixture にして、v0.5.21 のガード・実行時の到達・`src/` の該当を分けて測る。新しい入口（z01 `new Utf8Stream`）も、入口の表を作る過程で見つかった

## 停止規則・`package-lock.json`

- 停止規則（教訓 §2-7: 型を許可の根拠にする新しい系統になる変更は実装せず停止）には当たらなかった。A は import の形（構文）と、`promises` が関数の束かの判定（宣言の解決）。B は object literal の形（構文）と API の名前。C は構文と宣言の解決。D は構文
- `package-lock.json` は変えていない（`version` は 0.1.0 のまま。依存関係の変更なし）。`src/` は変えていない（`git diff v0.5.21 HEAD -- src` が空）
