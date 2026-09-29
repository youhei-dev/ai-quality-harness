# M2-2 BUILTIN R1 の独立レビューへの対応記録（response-builtin-r1）— v0.5.18

- 対象レビュー: `docs/reviews/m2-2/independent-review-builtin-r1.md`（受領ファイル名 `independent-review-m2-2-builtin-r1-for-claude.md`、ChatGPT、2026-09-28 受領、
  SHA-256 ff85cc8c…42a8、20,292 バイト。対象 v0.5.17 = commit 830c4f5 / tag object 91a88f9、範囲 v0.5.16..v0.5.17）
- 対応日: 2026-09-30
- 結果（レビュアー）: 前回の M2-2-R4-002 は「部分的に解消」。新しい指摘は High 0 / Medium 1 / Low 0（M2-2-BUILTIN-R1-001）
- 人間の判断
  - M2-2-BUILTIN-R1-001 は v0.5.18 で直す。修正の形は案 A（キーの型でメンバーが分かるときは、メンバーの名前で報告する）
  - 修正の後に独立レビュー m2-2-builtin-r2（範囲 v0.5.17..v0.5.18）を行う
  - レビューの「特に見てほしい点」2〜4 は、レビューの記述をそのまま「問題なし」として記録する。「未確認の範囲」5.1〜5.5 は新しい作業を起こさず、記録だけにする
  - バックログは項目も番号も変えない

## 指摘の判定

| ID | 重要度 | 判定 | 補足 |
|---|---|---|---|
| M2-2-BUILTIN-R1-001 | Medium | **VALID**（指摘のとおり） | キーの型が 1 つの文字列リテラルに決まる要素アクセスで、`process` の 6 つのメンバーを取っても違反にならなかった |

### 根拠の行（確認: v0.5.17）

- 要素アクセスの処理（`tests/structure/output-guard.ts:234-240`）は、キーの式そのものを `getSymbolAtLocation` で宣言に解決し、`terminalSymbol` と `processMember` を
  当てる。キーが文字列リテラル（`process["getBuiltinModule"]`）なら、型検査器はプロパティの宣言を返すので検出する。キーが変数なら変数の宣言になるので、当たらない
- `process`・`globalThis`・`node:process` を扱う枝（`:256-275`）の要素アクセスの部分（`:263-266`）は、キーの型の値（`literalKey`。型が 1 つの文字列リテラルのときだけ値を
  返す）でプロパティを取るが、`prop === undefined || terminalSymbol(…) !== null` のときだけ `dynamic access to …` を足す。`processMember` は当てていなかった
- 上の 2 つのどちらにも当たらないため、「キーの値は型で分かるのに、キーの式そのものは宣言に解決しない」形では、`PROCESS_MEMBERS` を取っても違反にならなかった

### 再現（実測: 一時 worktree の v0.5.17）

| 形 | v0.5.17 のガード |
|---|---|
| `const key: "getBuiltinModule" = "getBuiltinModule"; process[key]("node:console").log(…)`（レビューの 1） | 報告しない（違反 0 件） |
| `const key = "report" as const; process[key].writeReport("stdout")`（レビューの 2） | 報告しない（違反 0 件） |

### 実行時の到達（実測: 一時 worktree の中）

`const key = "getBuiltinModule"; process[key]("node:console").log("<印>")` を子プロセスで実行した（タイムアウト 10 秒、回収は SIGKILL）。exit 0、標準出力に 7 バイト
（印あり）、標準エラー 0 バイト。端末に届く。今の `src/` は `process[…]`・`process?.[…]`・`globalThis[…]` の形を使わない（0 か所。修正後のガードを本物の `src/` に
当てた違反も 0 件）ので、実害は無く、ガードの保証（ADR-0019 の決定 2）と実装の食い違いだった。

## 修正

`tests/structure/output-guard.ts` の 1 か所（+6 / −2 行）。`process`・`globalThis`・`node:process` を扱う枝の要素アクセスの部分で、キーの型が 1 つの文字列リテラルに
決まるとき、取れたプロパティを宣言に解決し、`PROCESS_MEMBERS` のメンバー（`processMember`）ならメンバーの名前（`process.getBuiltinModule` など）で報告する。
そうでなく、プロパティが取れない（キーの型が 1 つに決まらない）か端末（`terminalSymbol`）なら、従来どおり `dynamic access to …` で報告する。ほかの規則は変えない。
`src/` は変えない。

- 案 B（レビューの単純な案: 条件に `processMember(…) !== null` を足し、文言は `dynamic access` のまま）は、何を取ったかが報告から分からないので採らない。
  案 C（要素アクセスの処理〈`:234-240`〉でもキーの型からプロパティを取る）は、同じ判定を 2 か所で行うことになるので採らない
- `processMember` は宣言のファイル（`@types/node` の `process.d.ts`）を確かめるので、同じ名前のプロパティを持つ普通の object や、`globalThis` の同名のキーは当たらない
  （レビューの修正案の注意点。対照 c02 で実測）

### 同じ種類の形の洗い出し（実測。31 形 + 対照 5 + 宣言でない分割代入 1）

方法: fixture を文字列にして型検査器のプログラムに入れ、v0.5.17 のガードと修正後のガードに当てた。「キーの値は型で分かるのに、キーの式そのものは宣言に解決しない」形を
中心に洗い出した。回帰テストの ID は表の左端と同じ。「修正前」は v0.5.17、「修正後」は v0.5.18 の報告の文言。

| # | 形 | 修正前 | 修正後 |
|---|---|---|---|
| k01 | 型注釈の const `const key: "getBuiltinModule" = …; process[key]`（レビューの 1） | **見逃し** | `process.getBuiltinModule` |
| k02 | `as const` の `report`（レビューの 2） | **見逃し** | `process.report` |
| k03 | 注釈なしの const（型は文字列リテラル） | **見逃し** | `process.getBuiltinModule` |
| k04 | 文字列リテラル型の引数 | **見逃し** | `process.getBuiltinModule` |
| k05 | `as const` の object の readonly のプロパティ `process[keys.g]` | **見逃し** | `process.getBuiltinModule` |
| k06 | `as const` のタプルの要素 `process[keys[0]]` | **見逃し** | `process.getBuiltinModule` |
| k07 | 置換の無いテンプレートリテラルのキー | 検出（キーの式が宣言に解決する） | `process.getBuiltinModule` |
| k08 | 置換つきのテンプレートリテラル（`as const`） | **見逃し** | `process.getBuiltinModule` |
| k09 | ユニオン型のキー（絞り込みなし） | 検出（`dynamic access to process`） | 同じ |
| k10 | ユニオン型のキーを `if` で絞り込む | **見逃し** | `process.getBuiltinModule` |
| k11 | `keyof typeof process` の引数（絞り込みなし） | 検出（`dynamic access to process`） | 同じ |
| k12 | `keyof typeof process` の `let` に代入して絞り込む | **見逃し** | `process.getBuiltinModule` |
| k13 | `enum` のメンバー | 型検査で止まる（`erasableSyntaxOnly`） | 同じ |
| k14 | 計算プロパティ名の分割代入 `const { [key]: g } = process` | 検出（`destructuring of process with a computed key or a rest element`） | 同じ |
| k15 | `globalThis.process[k]`（レビューの回帰テスト案 2） | **見逃し** | `process.getBuiltinModule` |
| k16 | `globalThis[k1][k2]`（k1 は `"process"`） | **見逃し** | `process.getBuiltinModule` |
| k17 | `globalThis[k].getBuiltinModule`（k は `"process"`） | 検出（名前の参照） | 同じ |
| k18 | `process?.[k]` | **見逃し** | `process.getBuiltinModule` |
| k19 | `(process)[k]` | **見逃し** | `process.getBuiltinModule` |
| k20 | `process![k]` | 検出（`process used as a value (NonNullExpression)` だけ。メンバーの名前は無い） | `process.getBuiltinModule` |
| k21 | キーに `satisfies` | **見逃し** | `process.getBuiltinModule` |
| k22 | `emitWarning`（レビューの回帰テスト案 4） | **見逃し** | `process.emitWarning` |
| k23 | `dlopen` | **見逃し** | `process.dlopen` |
| k24 | `execve` | **見逃し** | `process.execve` |
| k25 | `stdin` | **見逃し** | `process.stdin` |
| k26 | `node:process` の default import の `proc[k]` | 検出（allowlist の `node:process` だけ。要素アクセスそのものは見逃し） | `process.getBuiltinModule` |
| k27 | 総称型のキー | 検出（`dynamic access to process`） | 同じ |
| k28 | `Reflect.get(process, key)` | 検出（`process used as a value (CallExpression)`） | 同じ |
| k29 | `Object.getOwnPropertyDescriptor(process, key)` | 検出（同上） | 同じ |
| k30 | `Object.entries(process)` | 検出（同上） | 同じ |
| k31 | 対照の端末: `const key: "stdout" = …; process[key].write` | 検出（`dynamic access to process`） | 同じ |
| k32 | 対照の端末: `globalThis.process[k]` の `stderr` | 検出（`dynamic access to globalThis.process`） | 同じ |
| k33 | 宣言でない分割代入 `({ [key]: g } = process)`（SP2 で追加して実測） | 検出（`process used as a value (BinaryExpression)`） | 同じ |

- 見逃し: 18 形（k01〜k06、k08、k10、k12、k15、k16、k18、k19、k21〜k25）。k20・k26 は別の規則で検出していたが、メンバーの名前では報告していなかった
- k33 は SP1 で未実測だった形で、修正の前も後も `process` が値として使われる規則で違反になる（試作でしか検出できない形ではない）。既知の限界には足さない
  （`({ [key]: g } = process)` の対照として `platform` を取る形も同じ規則で違反になる。安全側の誤検出で、`src/` は使わない）

対照（違反にしてはいけない形。修正前・修正後とも報告 0 件）

| # | 形 |
|---|---|
| c01 | `const k = "platform" as const; process[k]` |
| c02 | 同じ名前のプロパティを持つ普通の object の `obj[k]` |
| c03 | 型の中の参照（`(typeof process)["getBuiltinModule"]`、`(typeof process)[typeof key]`、`NodeJS.Process["report"]`） |
| c04 | `const k = "exitCode" as const; process[k] = 1` |
| c05 | `globalThis[k].platform`（k は `"process"`） |

## 修正の前後の実測

| 実測 | v0.5.17 のガード | v0.5.18 のガード |
|---|---|---|
| 新しい回帰テスト 39 件（`tests/regression-m2-2-builtin-r1-001-literal-typed-key.test.ts`） | **20 件 FAIL**（見逃していた 18 形と、名前で報告されていなかった k20・k26）/ 19 PASS | 39 PASS |
| 既存のガードのテスト（r2-001、r3-003、r4-002 の 3 ファイル 89 件） | — | 89 PASS（期待値は変えていない） |
| 本物の `src/` への違反 | 0 | 0 |

回帰テストの中身: 名前で報告される形 22（k01〜k08、k10、k12、k15〜k26）、報告される形 10（k09、k11、k14、k27〜k33）、対照 5、fixture の型検査 1（`enum` だけが型検査で止まる）、
`src/` の違反 0 が 1。テスト件数は 761（104 ファイル）から 800（105 ファイル）。

## 「特に見てほしい点」1〜6（レビューの結果と、この版での扱い）

| # | 点 | 結果（レビュアー） | この版での扱い |
|---|---|---|---|
| 1 | M2-2-R4-002 の解消 | 部分的に解消（主要な形は検出する。キーが文字列リテラル型の変数の要素アクセスが残る） | M2-2-BUILTIN-R1-001 として v0.5.18 で修正 |
| 2 | 洗い出しの網羅性 | M2-2-BUILTIN-R1-001 のほかは問題なし（`process` の他メンバー、`imports`〈`#x`〉、パスの別名、`.d.ts` だけの JS ファイル、`export * from` を確かめた） | レビューの記述をそのまま「問題なし」として記録する |
| 3 | 宣言での判定の前提 | 問題なし（`processMember()` は `@types/node/process.d.ts` の宣言を要求する。回帰テストが 6 メンバーの宣言への解決を固定する） | 同上 |
| 4 | 対照の妥当性 | M2-2-BUILTIN-R1-001 のほかは問題なし | 同上 |
| 5 | 既知の限界の文 | M2-2-BUILTIN-R1-001 による未記載の実装差を除き、過度な保証は無い | ADR-0019 の決定 2 を実装に合わせて正確にし、v0.5.17 の実装の不足を注記する。既知の限界には足さない（洗い出した形はどれも検出するか型検査で止まる） |
| 6 | docs とコードの一致 | 1 点の不一致（ADR-0019 の決定 2 の「要素アクセスのキーのどれでも」） | 決定 2 と ARCHITECTURE を直す |

## レビュアーの「未確認の範囲」の扱い（新しい作業は起こさない）

人間の判断で、次のとおり記録する。

1. **5.1 `src/` の機能内容**: 記録だけにする。この版は `src/` を変えない
2. **5.2 ADR-0019 の既知の限界として明示された経路**（実行時に組み立てた fs のパス、自分自身への SIGUSR1、依存の中の出力、子が自分で端末を開くこと、ネットワーク）: 記録だけにする
3. **5.3 コールバックの中の未処理の例外**: ROADMAP のバックログ 20。この版では直さない
4. **5.4 ROADMAP のバックログ 2〜19**: 対象外
5. **5.5 Windows、verify・test の所要時間、過去の記録の表現**: 対象外

## 対応

- M2-2-BUILTIN-R1-001: 修正済み（`tests/structure/output-guard.ts` の +6 / −2 行と、新しい回帰テスト 39 件。v0.5.18）
- ADR-0019 の決定 2 を実装に合わせて正確にし、影響の節に v0.5.18 を足した。ARCHITECTURE の出力の出口の節にも同じ内容を足した
- バックログは項目も番号も変えていない。`src/` は変えていない

## 学んだこと（v0.5.18）

- **「キーの式が宣言に解決しない」形は、名前の一致ではなく、型の値で見る**。v0.5.17 の要素アクセスの規則は、キーの式を宣言に解決する経路（文字列リテラル）と、キーの型の値で
  プロパティを取る経路（端末だけを見る）の 2 つに分かれ、後者に新しい一覧（`PROCESS_MEMBERS`）を足し忘れた。一覧を足す変更では、その一覧を使う経路を全部数え、
  同じ意味の判定を 1 か所に寄せる（今回は、キーの型から取ったプロパティに `processMember` を当てる 1 か所で足りる）
- **ガードの保証の文（ADR）は、文にある言葉（「要素アクセスのキーのどれでも」）を 1 つずつ fixture にする**。r4-002 の fixture は文字列リテラルのキーだけで、
  文の広さに追いついていなかった。洗い出しは、書き方（const、`as const`、引数、絞り込み、テンプレート、`satisfies`、`?.`、`!`、括弧、`globalThis` 経由）の軸で網羅する
- **修正前の FAIL の件数は、新しいテストだけを v0.5.17 の写しで動かして実測する**（今回は 39 件中 20 件。SP1 の下書き 38 件の 20 件と一致し、追加の 1 件は修正前から PASS）
