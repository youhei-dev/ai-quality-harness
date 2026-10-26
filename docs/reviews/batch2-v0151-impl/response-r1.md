# batch2-v0151-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.16.0 の最初の commit

- 対象レビュー: `docs/reviews/batch2-v0151-impl/review-r1.md`（受領ファイル名 `independent-review-batch2-v0151-impl-r1-for-claude.md`、2026-10-26 受領、8,856 バイト、SHA-256 `76b087771efce8ffb8bdb3ec1c51efb91651e7b1c59445d36544034fd291bead`、LF 78 / CR 0 / TAB 0 / U+FFFD なし / 禁止文字と層 (c) の文字なし / 文字参照と HTML のタグ・コメントなし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけ）
- 対象: v0.15.1（batch2 の 1 版目。ROADMAP の項目 53・50・51・55。src は変えない版）。範囲 `8650a72355e8b606af0ee815044a525b5350e5bd..1960630ccdfd203a6a37e313c20653d5c6d0a8fd`（6 commit、変わったファイル 30 個）
- レビュー用に作って人間に渡したもの（送付は人間が行った）: パケット `review-packet-batch2-v0151-impl-r1.zip`（1,694,699 バイト、SHA-256 `dba05f4a01ce9f3a51581586be60a7364e40e9abbbc5b4d34a02de3754857444`。中は `review-packet-batch2-v0151-impl.md` の 1 ファイル）、依頼文 `review-request-batch2-v0151-impl-r1.md`（31,917 バイト、SHA-256 `4794f5fe36da9707062c1fb63ed9bf45ea9e4e360326353f3ed92e68ce87ebe1`）
- 対応日: 2026-10-26
- 結果（レビュアー）: **High 0 / Medium 1 / Low 0**。依頼文に先に書いた基準（High・Medium が 0 なら終える）には達していない。人間の決定（2026-10-26）: B2-I151-R1-001 を v0.16.0 の最初の commit で直し、確かめは v0.16.0 の実装レビューで行う（R2 は出さない）
- **v0.16.0 の作業 branch の `aiqh review-import` でそのまま取り込めた**: `aiqh review-import <受領ファイルの写し> --label batch2-v0151-impl --round 1 --id-prefix B2-I151`（exit 0、`High 0 / Medium 1 / Low 0; open 1`、`REVIEW IMPORT: written`）

## 判定表

| ID | 重要度 | 判定 | 対応 | 直した commit |
|---|---|---|---|---|
| B2-I151-R1-001 | Medium | VALID | 受け入れ。直し方 B（値の意味を保つ同一性を鍵に入れる） | `3ff8b522f9c336e7665318c84556febcaf649a3f`（v0.16.0 の最初の commit） |

## B2-I151-R1-001: SourceFile の使い回しの鍵から、解析の条件の 3 つが抜けている

### 指摘の要約

`tests/structure/typescript.ts` の `conditionOf` は、`setExternalModuleIndicator`・`packageJsonLocations`・`packageJsonScope` を知っている欄として受けながら、鍵には `languageVersion`・`impliedNodeFormat`・`jsDocParsingMode` だけを入れていた。この 3 つだけが違う解析の条件でも、同じ SourceFile を使い回しうる。

### 調べたこと（TypeScript 5.9.3。`package-lock.json` の版）

配布物 `node_modules/typescript/lib/typescript.js` を読んだ（行はその版のもの）。

- `getCreateSourceFileOptions`（:128596）は、program がファイルを読むたびに呼ばれ、次を渡す
  - `setExternalModuleIndicator`: 毎回。`getSetExternalModuleIndicator(options)`（:21870）が options から作る関数
    - `moduleDetection` の計算（:21946）が `module`・`target` から決まる
    - 関数の中身（:21867）は `moduleDetection`・`jsx`・`module`（`getImpliedNodeFormatForEmitWorker`、:129721）と、ファイルの `impliedNodeFormat` だけを読む
    - どの options も使い回しの鍵の 11 の options に入っている
  - `packageJsonLocations`・`packageJsonScope`: package.json を探す形のときだけ（`getImpliedNodeFormatForFileWorker`、:126804）
    - 探すのは、module resolution が node16〜nodenext のとき、または node_modules の中のファイルで、拡張子が `.ts`・`.tsx`・`.d.ts`・`.js`・`.jsx` のとき
    - `.mts`・`.cts`・`.mjs`・`.cjs` などは、数（`impliedNodeFormat`）だけを返す
- `createSourceFile`（:33019）は、3 つのうち `setExternalModuleIndicator` だけを使う（解析の後に `externalModuleIndicator` を決める）。`packageJsonLocations`・`packageJsonScope` は読まない
- program は `getSourceFile` が返した後で、`file.packageJsonLocations` と `file.packageJsonScope` を、その program の値で SourceFile に書く（:128715-128716）
  - `packageJsonScope` は、後で `getImpliedNodeFormatForEmitWorker` が SourceFile から読む（module が node16〜nodenext でないとき）
  - 解析の間は、まだ書かれていない
- 言語サービスの文書の表（`acquireOrUpdateDocument`、:143956）も、SourceFile を program の間で共有するときの鍵は `sourceFileAffectingCompilerOptions` と `impliedNodeFormat` だけで、3 つの値の同一性は鍵に入れていない

aiqh の全テストの program での記録（`98d7ddf` の写しの worktree の helper に記録の仕掛けを入れ、全テスト 185 ファイル・2,774 件を走らせた。追跡しているファイルは変えていない。記録は git 管理外）:

- `getSourceFile` の呼び出し 39,415 回（16 のプロセス、612 のファイル）。どれも解析の条件をオブジェクトで渡していた
- `setExternalModuleIndicator` は 39,410 回で関数だった。残る 5 回は T50-7 が手で渡す呼び出し
- 関数の中身（ソースの字面）は、options の鍵ごとに 1 つだった
- `packageJsonLocations`・`packageJsonScope` は 32,486 回（`.ts` 16,428、`.d.ts` 16,058）。無いのは `.d.cts` 6,080・`.d.mts` 832 と一時のプロジェクトの `.ts` 17 で、配布物を読んだとおりだった
- v0.15.1 の鍵（846 通り）のどれにも、3 つの値の組（locations、scope のディレクトリ、package.json の中身）が 2 通り以上ある場合は無かった（今のテストでは、食い違いを同じものとして使い回した例は 0）
- 使い回した SourceFile を、渡された `setExternalModuleIndicator` で計算し直すと、`externalModuleIndicator` は 39,410 回すべて同じだった

### 直し方の選び

| 案 | 中身 | 評価 |
|---|---|---|
| A | 3 つのどれかが渡されたら使い回さない（fail closed） | `setExternalModuleIndicator` は毎回渡されるので、使い回しが全く効かなくなる（項目 50 の 50-B を外すのと同じ）。採らない |
| **B（採った）** | 3 つの値の意味を保つ同一性を、鍵か使い回す前の確かめに入れる | 使い回しを保ったまま、3 つのどれかが違えば使い回さない。形の分からない値は使い回さない |

B の中身:
- `packageJsonLocations`: 文字列の配列を、そのまま鍵に入れる。配列でない・文字列でない要素があれば使い回さない
- `packageJsonScope`: ディレクトリ（`path.resolve`）と、package.json の中身（`contents.packageJsonContent`）の JSON の SHA-256 を鍵に入れる。無いときは空。ディレクトリが文字列でない・中身が無いときは使い回さない
- `setExternalModuleIndicator`: 有り無しを鍵に入れる。使い回す前に、渡された関数でそのファイルの `externalModuleIndicator` を計算し直し、今の値と違えば使い回さない。そのときは host が解析し、表の古いものは残す
  - 計算はその SourceFile の上のオブジェクト（`Object.create`）で行い、SourceFile 自体は変えない
  - program が書いた `packageJsonScope` は、解析のときにはまだ無いので、計算のときも隠す
  - 関数でない値は使い回さない（このとき host の解析は、TypeScript 自身と同じく投げる）
- 形の分からない値は表に入れない（同じ値を 2 回渡しても、2 つの SourceFile になる）

### テスト（テストを先に。`98d7ddf` の SHA 固定の worktree で直す前を記録）

`tests/structure-typescript-reuse.test.ts` に 9 件を足した。直す前は 21 件中 5 件が FAIL。

| テスト | 中身 | 直す前 |
|---|---|---|
| T50-8a | `packageJsonLocations` だけが違う → 別の SourceFile。最初のものは表に残る | FAIL |
| T50-8b | `packageJsonScope` の package.json だけが違う → 別の SourceFile | FAIL |
| T50-8c | `setExternalModuleIndicator` だけが違う（script を module にする）→ 別の SourceFile で、module | FAIL |
| T50-8d（守り） | 同じ値の新しいオブジェクトと、同じ効果の新しい関数 → 同じ SourceFile（使い回しを保つ） | PASS |
| T50-8e | 形の分からない値 → 使い回さない。同じ値を 2 回渡しても表に入らない | FAIL |
| T50-8f | `setExternalModuleIndicator` の有り無しだけが違う（module にした後、無し）→ 別の SourceFile で、script | FAIL |
| T50-8g（守り） | TypeScript 自身の条件で、node_modules の中の script と `"type": "module"` の package.json（module esnext）でも、次の program が使い回す | PASS |
| T50-9a（守り） | 表の有り無しで、リポジトリの program のすべての SourceFile（500 超。宣言のファイルと node_modules を含む）の解析の結果が同じ | PASS |
| T50-9b（守り） | 表の有り無しで、ガードの fixture の program のすべての SourceFile（fixture を含む）の解析の結果が同じ | PASS |

- 解析の結果として比べたもの: `languageVersion`、`impliedNodeFormat`、module かどうか（`ts.isExternalModule`）、`packageJsonLocations`、`packageJsonScope` のディレクトリ、構文の診断
- T50-6a〜6d（型の誤りとガードの答え）は今までどおり

検出力の確かめ（使い捨ての worktree で、足した条件を 1 つずつ外した）:

| 変異 | 落ちたテスト |
|---|---|
| M151-1 locations を鍵から外す | T50-8a |
| M151-2 scope を鍵から外す | T50-8b |
| M151-3 関数の有り無しを鍵から外す | T50-8f |
| M151-4 使い回す前の計算し直しを外す | T50-8c |
| M151-5 locations の形の確かめを外す | T50-8e |
| M151-6 scope の形の確かめを外す | T50-8e |
| M151-7 scope の同一性から package.json の中身を外す | T50-8b |
| M151-8 計算し直しで program の scope を隠さない | T50-8g |

- 最初の当て方では、M151-3・M151-5・M151-6・M151-8 の 4 つが落ちなかった
- T50-8f・T50-8g と、T50-8e の「同じ値を 2 回」を足し、8 つとも 1 件 FAIL するようにした

### 使い回しの効果

全テストを、program の数を数える形（`ts.sys.readFile` で tsconfig を読んだ回数）で走らせた。

- program を作る 15 ファイルの時間の和
  - v0.15.1 の記録: 122.4 秒（直す前）→ 84.2 秒（v0.15.1）
  - この commit: 74.6 秒
- builtin-r3 は 12.3 秒 → 12.4 秒。使い回しの効果は保たれた
- 数は負荷で揺れる。この記録は 1 回の run

### 文書

`tests/structure/typescript.ts` の説明、設計（最終）§1.6 の鍵の 3 と「使い回さないとき」、ROADMAP の項目 50 を、直した形に合わせた。

## レビュアーの判定の要約（実装者の評価ではない）

- 問い 1（B2-D-R2-002）: 解消
- 問い 3: B2-D-R2-003 と B2-D-R1-001 の残りは、この指摘のために「部分的に解消」
  - batch2-design の findings の note に、この評価と v0.16.0 の直しを書き足した。状態と `fixedIn` は変えていない
- 問い 2・5・6・8・9: 指摘なし
- 問い 4・7: この指摘のほかは指摘なし

## 既知の残余（レビュアーが明記した、読めなかった・確かめなかった範囲）

新しい指摘ではなく、既知の残余として受け入れる。

- 「必要なら」の固定の URL 4 件は開いていない
- パケットの全行の逐語の照合、テストの独立の実行、変異と負荷のログの検証、GitHub Actions の実物の操作はしていない
- TypeScript の配布物を、レビュアーの環境で確かめていない
  - この点は、上の「調べたこと」に配布物の行と全テストの記録を書いた
  - v0.16.0 の実装レビューの依頼文に、根拠の引用を入れる
