# batch2-v0160-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.16.0 の記録

- 対象レビュー: `docs/reviews/batch2-v0160-impl/review-r1.md`（受領ファイル名 `independent-review-batch2-v0160-impl-r1-for-claude.md`、2026-10-29 受領、6,560 バイト、SHA-256 `5a07f3946d3817f9f3e8fe30dd418967d50eccb70262dc73f71c489b719e062f`、
  LF 66 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 層 (c) の文字なし / 文字参照と HTML のタグ・コメントなし / 秘密の形〈`scanString`〉なし / URL なし / レビュアーの側の作業場所を指すリンク〈`sandbox:`〉の行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.16.0（batch2 の 2 版目。ROADMAP の項目 52 の runId〈ADR-0038〉と、v0.15.1 の実装レビューの B2-I151-R1-001 の直し〈テストの部品 `tests/structure/typescript.ts`〉、v0.15.1 の記録）。範囲 `98d7ddf8d3ee9724d83ad4f8d995fccc1d809ed9..3b6b1c31d0569665f51ff12ee885af34d71e9603`（5 commit、変わったファイル 33 個。merge の commit は含めない）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-batch2-v0160-impl-r1.zip`（1,502,822 バイト、SHA-256 `0520a3eb6ac99abcc8ddefcc58362236084353b91fcfd5b3f571f6e79ac7e9c7`。中は `review-packet-batch2-v0160-impl.md` の 1 ファイル、1,502,656 バイト、SHA-256 `e9bb45e281f42bae8e44084ed476f27909b7e619fc77ecceec57d6cbdb942b3a`）
  - 依頼文 `review-request-batch2-v0160-impl-r1.md`（27,392 バイト、SHA-256 `cdbe4f7c91ce599b08756c3d2ae517c8cd7aceea9876a4b5ea1b99ffa64cd3c7`。問いは 7、読むときの固定の URL は「必ず開く」6 項目〈TypeScript の `program.ts` の項目は 2 つの行の範囲の URL を持つので、URL では 7 本〉と「必要なら」10 項目。パケットの中にバイト単位で同一で 1 回入っている）
- 対応日: 2026-10-29
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（指摘なし）。レビュアーはパケットと「必ず開く」の固定の URL を静的に読み、コードとテストは実行していない。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に達したので、**batch2-v0160-impl のレビューは R1 で終える**
- **`aiqh review-import` でそのまま取り込めた**: v0.17.0 の作業 branch（`release/v0.17.0`、`29d582d` の上）の最初の commit で、`aiqh review-import <受領ファイルの写し> --label batch2-v0160-impl --round 1 --id-prefix B2-I160`（写しは受領ファイルと SHA-256 が同じ。aiqh は 0.16.0 の src）。exit 0、`High 0 / Medium 0 / Low 0; open 0`、最後の 2 行は `REVIEW LOOP: complete` と `REVIEW IMPORT: written`。禁止文字と秘密の形の件数の行は出なかった。`findings` と `previous` は空（label `batch2-v0160-impl` の 1 回目）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## 判定表

指摘が 0 件なので、判定・対応・`fixedIn` は無い（findings の実装者の欄に書くものも無い）。**対応なし**。

## レビュアーの判定の要約（実装者の評価ではない）

依頼文の問い 1・2 で確かめを頼んだもの:

| 対象 | 由来 | 判定 | レビュアーの主な根拠（原文の要約） |
|---|---|---|---|
| B2-I151-R1-001（問い 1） | batch2-v0151-impl R1（v0.16.0 の `3ff8b52` で直した） | 解消 | `PARSE_KEYS` が 3 つの欄を認め、`conditionOf` が `setExternalModuleIndicator` の有り無し・位置の配列・scope のディレクトリと package.json の中身のハッシュを鍵に入れる。`sameModuleIndicator` が使い回す前に計算し直し、違えば host の解析に戻す。T50-8a〜8g が条件の違い・形の分からない値・TypeScript 自身の条件を扱う。関数そのものを鍵に入れない方針は、値の等しさと前の計算し直しを組み合わせる作りとして妥当。TypeScript 5.9.3 のソースとも整合する |
| B2-D-R1-001（問い 2） | batch2-design R1 | 解消 | キャッシュの鍵の不足は、上の条件の追加と使い回す前の確かめで補われた |
| B2-D-R2-003（問い 2） | batch2-design R2 | 部分的に解消 | `text` の一致だけでは AST のノードだけの外からの書き換えを見つけない制約を明記し、解析の条件の取りこぼしには対処した。AST の書き換えを見つける機能そのものは無い。依頼文が既知の残余として受け入れたもので、新しい指摘にはしない |

**B2-D-R2-003 の「部分的に解消」の扱い**: AST だけの書き換え（`text` は同じ）を見つけないことは、設計の独立レビュー R2 の後に、50-B の残る制限として明記すると決めた（設計（最終）§1.6、`docs/reviews/batch2-design/response-r2.md`。理由: TypeScript 自身が束縛のときに共有の SourceFile のノードへ書き込むので凍らせられず、正当な書き込みと呼び手の書き込みを見分けられない。全ノードの照らしは使い回しの利益の大半を消す）。今回の評価は、その決定のとおりの状態を述べたもので、新しい作業は要らない。B2-D-R2-003 の状態（`resolved`、`fixedIn` は v0.15.1 の `7460e65`）は変えず、`note` にこの評価を書き足した。

問い 3〜7 は、どれも「指摘なし」。要点:

- 問い 3（項目 52 の実装）: `runVerify` が始めの後・check の前に `randomUUID()` を 1 回作り、必須の `BuildReportInput.runId` に渡す。`buildReport` は値を作らず、最上位の `startedAt` の直前に置く。Markdown は `Started` の直前に `Run ID`、history は同じレポートを書く。中断の R6 と UUID の版 4 の R3 のテストがあり、端末に出さないこともテストしている。`VerificationReport.runId` は型の上で任意なので、古い形のレポートも読める
- 問い 4（同じミリ秒の組と古い読み手）: 47-c-3 は `startedAt` が同じでも A と B が別の `runId` を持ち、組の食い違いを見分けられること、history が 1 つに絞れることを確かめる。食い違いそのものを直したとは書いていない。新しい `aiqh history` は `runId` の無い history を同じに読む（R5）。`src/run-history/read.ts` と `src/review/packet.ts` は知らない上位の欄を保存せずに読む作りで、`runId` の追加は読みを壊さない向き。古い版の `aiqh history` で新しいレポートを読む実行は実装者の記録で、レビュアーは再実行していない
- 問い 5（テストを弱めていないか）: 変わったのは最上位のキーの並び・数、47-c-2・47-c-3、`buildReport` の呼び出しの引数の追加。47-c-3 は「`startedAt` では分からない」の期待を残したまま `runId` の確かめを足していて、既存の守りを消していない
- 問い 6（利用者への影響の書き方）: README・CHANGELOG・ADR-0038・ARCHITECTURE は、JSON に `runId` が増えること、Markdown と Job Summary に `Run ID` が出ること、`schemaVersion: 1` を保つこと、古いデータは `startedAt` の約束で読むこと、並行の更新は未解決であることを分けて書いている。追加の欄を拒む外の厳しい読み手には、互換の注意が要る
- 問い 7（文書と記録）: ADR-0038 の採用版、ADR-0003・ADR-0034 の注記、ROADMAP の 47・50・52、v0.15.1・v0.16.0、関係する findings と response を実装と照らし、新しい重要度つきの指摘は無い

## 既知の残余として受け入れたもの（新しい指摘ではない）

レビュアーは、結論が静的なレビューであり、次を独立には確かめていないと明記した。これらは新しい指摘ではなく、既知の残余として受け入れる（人間の指示 2026-10-29）。

- **固定の URL の一部の未照合**: 「必ず開く」の 7 本の URL（`src/report/write.ts`・`src/run-history/read.ts`・`src/review/packet.ts`・`tests/regression-item47-latest-pair-started-at.test.ts`、TypeScript の `program.ts` の 2 か所と `utilities.ts`）はすべて開いた。「必要なら」の 10 項目は個別には開いていない。TypeScript 5.9.3 の文書の表・`parser.ts`・compiler options の一覧などの全経路を、独自に追ってはいない
- **独立の実行なし**: TypeScript の配布物の実行時の挙動、古い版の CLI の実行の互換、実装者の変異の試し、CI の PASS は再実行していない。実装者が報告した `getSourceFile` の 39,415 回の記録と 8 つの変異の成績は、ログが添付されていないので独立に追認していない。どちらも実装者の記録（`docs/reviews/batch2-v0151-impl/response-r1.md`、CHANGELOG・ROADMAP の v0.16.0 の項）に依る
- **ログの未確認**: 直す前の FAIL のログ、AST・構文の解析の違いを確かめる変異の生のログ、適用先の実データ、古い版の aiqh の実行の試し、CI の再実行は確かめていない
- **残る制限**: SourceFile のノードだけを書き換えた場合は、既知の限界として残る（上の B2-D-R2-003 の扱い）
- PR #21 の run 40302815054 と main の run 40303680562 が success であることは、この記録の commit の前に `gh run view` で確かめ、CHANGELOG・ROADMAP の v0.16.0 の項に書いた

## 読めた範囲（レビュアーの原文の要約）

ZIP の 1 ファイル `review-packet-batch2-v0160-impl.md` の変更ファイルの全文と差分、関係するテストの全文（主に `src/commands/verify.ts`・`src/report/build-report.ts`・`src/report/markdown.ts`・`src/types.ts`・`tests/structure/typescript.ts`・`tests/structure-typescript-reuse.test.ts`・`tests/regression-item52-run-id.test.ts`・`tests/regression-item47-latest-pair-race.test.ts`、変わった最上位のキーのテスト、ADR・CHANGELOG・README）と、上の「必ず開く」の固定の URL（GitHub の固定の commit または固定のタグ）を読んだ。

## 取り込みと review-check

- `aiqh review-import`（0.16.0 の src。`tool.version` は 0.16.0）: `findings-r1.json`（指摘 0 件）。exit 0、`REVIEW IMPORT: written`
- `aiqh review-check --label batch2-v0160-impl`: R1 は open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）
- `aiqh review-check --label batch2-design`: 状態は変えていない（`note` に v0.16.0 の評価を書き足しただけ）。open は B2-D-R1-002・B2-D-R2-001 の 2 件のまま（v0.17.0 の項目 54）

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/batch2-v0160-impl/review-r1.md`（原文の収録）・`findings-r1.json`（取り込み）・`response-r1.md`（この記録）
- `docs/reviews/batch2-design/findings-r1.json`・`findings-r2.json`: B2-D-R1-001・B2-D-R2-003 の `note` に、v0.16.0 の実装レビューの評価を書き足した（状態と `fixedIn` は変えていない）
- CHANGELOG の v0.16.0 の見出しの SHA と記録の行・実装レビューの行、ROADMAP の v0.16.0 の項の CI・PR・タグ・実装レビューの行と、最終更新の日付
