# batch2-v0170-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.17.0 の記録

- 対象レビュー: `docs/reviews/batch2-v0170-impl/review-r1.md`（受領ファイル名 `independent-review-batch2-v0170-impl-r1-for-claude.md`、2026-10-30 受領、7,700 バイト、SHA-256 `491b2faff25b4240f0286178f3fd36eecb3215ece3efd87fbc7d11b6a7dbbcfa`、
  LF 62 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 層 (c) の文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし / URL なし / レビュアーの側の作業場所を指すリンク〈`sandbox:`〉の行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.17.0（batch2 の 3 版目、最後の版。ROADMAP の項目 54〈ADR-0039〉と、v0.16.0 の実装レビューの取り込みと v0.16.0 の記録）。範囲 `29d582d89fc46b05cb74cdb9ce7420d9bcac992e..baecd63c3b5f7f405d16830d39a9ddc9865f5e82`（4 commit、変わったファイル 28 個。merge の commit は含めない）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-batch2-v0170-impl-r1.zip`（1,627,211 バイト、SHA-256 `0043b7fb36fd99d0021098f963fc4a8cb921cd69c5ab7a481139ac2ce3525a91`。中は `review-packet-batch2-v0170-impl.md` の 1 ファイル、1,627,045 バイト、SHA-256 `e506534a87afc0211f89e3b4bcdd5f8ba43eef1635df804a6a97426ccd357c24`。このパケットの作成も、v0.17.0 の新しい判断を通った）
  - 依頼文 `review-request-batch2-v0170-impl-r1.md`（31,058 バイト、SHA-256 `33402cdb232e680710991d9a2cf2c51f41cfb80929e918843e2057e5c29cdcfc`。問いは 8、読むときの固定の URL は「必ず開く」6 項目〈URL では 8 本〉と「必要なら」7 項目。パケットの中にバイト単位で同一で 1 回入っている）
- 対応日: 2026-10-30
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（指摘なし）。レビュアーはパケットと「必ず開く」の固定の URL を静的に読み、コード・テストは実行していない。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に達したので、**batch2-v0170-impl のレビューは R1 で終える**
- **`aiqh review-import` でそのまま取り込めた**: v0.17.0 の後の記録の branch（`docs/v0.17.0-record`、`a2bf78c` の上）の commit で、`aiqh review-import <受領ファイルの写し> --label batch2-v0170-impl --round 1 --id-prefix B2-I170`（写しは受領ファイルと SHA-256 が同じ。aiqh は 0.17.0）。exit 0、`High 0 / Medium 0 / Low 0; open 0`、最後の 2 行は `REVIEW LOOP: complete` と `REVIEW IMPORT: written`。件数の行（禁止文字・層 (c)・秘密の形）は出なかった。取り込みの前に、写しを取り込みの検査の本体 `readReview`（ファイルに触れない関数）で確かめた（問題 0 件、指摘 0 件）。`findings` と `previous` は空（label `batch2-v0170-impl` の 1 回目）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## 判定表

指摘が 0 件なので、判定・対応・`fixedIn` は無い（findings の実装者の欄に書くものも無い）。**対応なし**。

## レビュアーの判定の要約（実装者の評価ではない）

依頼文の問い 1・2 で確かめを頼んだ設計の独立レビューの 2 件:

| 対象 | 由来 | 判定 | レビュアーの主な根拠（原文の要約） |
|---|---|---|---|
| B2-D-R1-002（問い 1） | batch2-design R1（v0.17.0 の `c537c66` で直した） | 解消 | `findDisplayRawChars` は元の文字列を LF で分け、各行を `final: true` で `decideRawChars` に渡す。`jsonForFile` は必要なときだけ `JSON.stringify` の結果を値に戻し、値の文字列とキーに判断を当てる。BMP の外は UTF-16 の単位ごとの JSON の escape で、読み戻した値を保つ。表示の `escapeRawChars` と保存の `jsonForFile` を分けた。N4 が入れ子・キー・片方だけのサロゲート・RGI・表記の字面などを試す |
| B2-D-R2-001（問い 2） | batch2-design R2（同じ） | 解消 | `lineHits` は行の最後の U+000D を `decideRawChars` に渡さない。禁止の集合の走査は元の行に対して行うので、その CR はパケットの拒みと表示の表記に残る。`LineAssembler` も LF の前の CR とファイルの最後の CR を行の中身から外すので、層 (c) の判断が一致する。行の途中の CR は `control`。N8 が CR LF・単独の CR・CR CR LF・終わりの CR・長い行の窓の境目を比べる |

問い 3〜8 は、どれも「指摘なし」。要点:

- 問い 3（設計への一致）: `checkText`・`checkValue`・パスのオプションが同じ判断を使い、依頼文・レビューの原文・commit のメッセージ・全文・差分・検証のレポート・パケットの全体の再検査につながっている。`security.allow` は当てない。`rawCharDetail` は禁止の集合を符号位置だけ、足した文字を分類つき。review-import は拒まず、数え、`jsonForFile` で保存する（N2・N3・N5）
- 問い 4（拾いすぎ・拾い漏れ）: High・Medium なし。`writeAtomic` の Markdown・HTML の最後の表記は、生の文字を残す向きには傾かない。JSON は禁止の集合の最後の門を保ち、`writeReports` と review-import は `jsonForFile` を呼ぶ。1 行目の BOM と、`escapeInline` の前の `checkValue` の関係もコードに合う。入力の全探索はしていない
- 問い 5（性能）: 指摘なし。候補の無い文字列は早く返り、`jsonForFile` は通常 `JSON.stringify` だけで返る。線形のテストは仕事の量の数えと 4 倍の比で、壁時計だけより安定する。独立の計測はしていない
- 問い 6（テストの検出力と既存のテスト）: 指摘なし。item49 の L7/L17 と L12 の書き換え（`scanString` の守りは残した）、backlog9 を変えない判断（別の関数 `escapeRawCharsAsJson` の仕様を試すため）に合う
- 問い 7（利用者への影響）: 指摘なし。パケットが厳しくなること、`security.allow` でパケットは緩まないこと、`--exclude`、端末の JSON とファイルの JSON の違いが書かれている
- 問い 8（文書と記録）: 指摘なし。ADR-0039 の案（最終）からの違い、ADR-0014・0016・0020・0036・0037 の注記、ROADMAP・CHANGELOG の v0.16.0・v0.17.0、設計の findings の状態、questions-final の L12 の承認をパケットで確かめた

## 生き残った 2 つの変異の同値性についてのレビュアーの評価（原文の問い 6 のとおり）

v0.17.0 の 21 個の変異のうち、落ちなかった 2 個（`escapeInline` の判断を外す、`jsonForFile` の速い道を通らない）を、実装者は「届かない所」と「結果の同じ形」と判断した（ADR-0039 の「案（最終）からの違い」の 6・7）。レビュアーは、変異の生のログは見ていないと明記したうえで、次のように評価した（原文のまま）:

> 生き残った二つの変異の同値性は、`escapeInline` がチェック済み値を受け取ることと、速い道を通らなくても同じJSON値を生成することから、現在の観測可能な仕様に関して支持できる。

この記録では、この判断を「今の観測できる仕様についての同値」として扱う。`escapeInline` が `checkValue` を通っていない値を受け取るようになったとき、または `jsonForFile` の速い道の前提（禁止の集合と層 (c) の BMP の符号位置が、すべて security の check の表に入ること）が変わったときは、この 2 つが同値かを見直す。

## 既知の残余として受け入れたもの（新しい指摘ではない）

レビュアーは、結論が静的なレビューであり、次を独立には確かめていないと明記した。これらは新しい指摘ではなく、既知の残余として受け入れる（人間の指示 2026-10-30）。

- **固定の URL の一部の未照合**: 「必ず開く」の 8 本の URL（設計（最終）、ADR-0039 の案（最終）、設計レビューの原文 2 つ、`src/security/scan.ts` の 3 つの行の範囲、backlog9 のテスト）は開いた。「必要なら」の 7 項目は開いていない。必ず開く URL の全文全行の読破は主張していない。差分に含まれない変えていないコードの広い再監査はしていない
- **独立の実行なし**: コード・全テスト・変異・性能のテスト・CI は実行していない。独立の時間の計測はしていない。CI の success は、v0.17.0 の報告と、この記録の PR の前に `gh run view` で確かめた（CHANGELOG・ROADMAP の v0.17.0 の項）
- **ログの未添付**: 直す前の FAIL・実行のログ・変異の生のログは添付していないので、報告した数は実装者の記録として区別された（ADR-0039 の「案（最終）からの違い」、CHANGELOG・ROADMAP の v0.17.0 の項）
- 非公開の適用先 A・B の中身は確かめていない（実測の件数は実装者の記録）

## 読めた範囲（レビュアーの原文の要約）

依頼文と出力の約束、ZIP の 1 ファイル `review-packet-batch2-v0170-impl.md` のメタデータ・差分・実装の 7 ファイルの全文・2 つのテストの全文・ADR-0039・CHANGELOG・README・CONFIG_SPEC・ROADMAP・設計の findings と questions-final の関係する所と、上の「必ず開く」の固定の URL（release の commit `baecd63` に固定）を読んだ。

## 取り込みと review-check

- `aiqh review-import`（0.17.0）: `findings-r1.json`（指摘 0 件）。exit 0、`REVIEW IMPORT: written`
- `aiqh review-check --label batch2-v0170-impl`: R1 は open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）
- `aiqh review-check --label batch2-design`: 状態は変えていない（B2-D-R1-002・B2-D-R2-001 の `note` に v0.17.0 の評価を書き足しただけ）。前と同じく open none、警告 2、`REVIEW LOOP: complete`・`REVIEW CHECK: passed`
- これで batch2 は、設計の独立レビュー（batch2-design、R1・R2）と、3 つの版の実装の独立レビュー（batch2-v0151-impl・batch2-v0160-impl・batch2-v0170-impl）のループがすべて閉じた

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/batch2-v0170-impl/review-r1.md`（原文の収録）・`findings-r1.json`（取り込み）・`response-r1.md`（この記録）
- `docs/reviews/batch2-design/findings-r1.json`・`findings-r2.json`: B2-D-R1-002・B2-D-R2-001 の `note` に、v0.17.0 の実装レビューの評価を書き足した（状態と `fixedIn` は変えていない）
- CHANGELOG の v0.17.0 の見出しの SHA と記録の行・実装レビューの行、ROADMAP の v0.17.0 の項の CI・PR・タグ・実装レビュー・batch2 の締めの行と、最終更新の日付
