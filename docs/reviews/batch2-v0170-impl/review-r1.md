> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch2-v0170-impl-r1-for-claude.md`（2026-10-30 受領、7,700 バイト、LF 62・CR 0・TAB 0・U+FFFD なし・生の文字〈層 (c) を含む〉なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `491b2faff25b4240f0286178f3fd36eecb3215ece3efd87fbc7d11b6a7dbbcfa`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.17.0 の後の記録の branch の `aiqh review-import` でそのまま取り込めた）。

---

# aiqh v0.17.0 独立実装レビュー R1

対象: `29d582d89fc46b05cb74cdb9ce7420d9bcac992e..baecd63c3b5f7f405d16830d39a9ddc9865f5e82`。label `batch2-v0170-impl`、round 1。レビュー対象は項目 54 の実装および v0.16.0 の記録。コードを実行せず、パケットに含まれる全文・差分と、指定された固定 URL のソースを静的に照合した。実装者の検証結果は独立再現した結果とみなさない。

## 全体の結論

件数: High 0 / Medium 0 / Low 0

**確認した範囲で、High・Medium の指摘はなく、今回のレビュー終了基準を満たす。** これはテスト実行や全入力での正しさを実証した意味ではない。新しい文字判定の再利用、JSON の値保存、CR の扱い、パケットの拒否と review-import の非拒否をコードとテストで照らした。残る既知の限界は依頼文に示された範囲として再指摘しない。

### 問い 1 — B2-D-R1-002

**解消。** `findDisplayRawChars` は元の文字列を LF 区切りで扱い、`decideRawChars` に各行を `final: true` として渡す。`jsonForFile` は `JSON.stringify` の結果を必要な場合に JSON.parse で値へ戻し、値の各文字列とキーに判断を適用する。`jsonStringForFile` は BMP 外を UTF-16 の各単位の JSON escape にし、JSON.parse 後の値を保持する。表示用の `escapeRawChars` と、保存用の `jsonForFile` を区別した。N4 は入れ子・キー・孤立サロゲート・RGI・表記の字面などを試している。固定設計と ADR-0039 の方針に合う。

### 問い 2 — B2-D-R2-001

**解消。** `lineHits` は末尾の U+000D を `decideRawChars` に渡さない。一方、禁止集合の走査は元の `content` に対して行うので、末尾の CR はパケット拒否および表示用の表記に残る。`LineAssembler` は LF の前の CR とファイル末尾の CR を行の内容から除外するため、層 (c) の判断が一致する。行内の CR は残り、`control` として扱われる。N8 は CR LF、単独 CR、CR CR LF、末尾 CR、長い行の CR LF の窓境界を比較する。行の分割そのものは固定ソースと照合した。

### 問い 3 — 項目 54 の設計への一致

**指摘なし。** パケットの `checkText` は `findDisplayRawChars` で全件を finding にし、`checkValue` とオプションのパス判定にも同じ判断を使う。依頼文、レビュー原文、commit メッセージ、全文、差分、検証レポートの読み込み、パケット完成時の再検査へ接続されている。`security.allow` は層 (c) の拒否に適用しない。`rawCharDetail` は従来の禁止文字を符号位置のみ、新規の対象を分類つきとする。review-import は取り込みを拒まず、件数を数え、findings を `jsonForFile` で保存する。N2・N3・N5 でこれらを検証する。

### 問い 4 — 拾いすぎと拾い漏れ

**High・Medium の指摘なし。** `findDisplayRawChars` が禁止集合とスキャンの判断を合わせ、`escapeRawChars` と `checkText` が共有している。`writeAtomic` の Markdown と HTML は最後に表示の escape を行い、誤って生の文字を残す方向に傾かない。`writeAtomic` の JSON は従来の禁止集合の最後の門を維持し、製品側の `writeReports` と review-import は値を変えない `jsonForFile` を呼ぶ。1 行目 BOM の扱いと `escapeInline` の前の `checkValue` の関係も、コードに整合する。追加で検証できなかった入力の全探索は未確認範囲に明記する。

### 問い 5 — 性能

**指摘なし。ただし独立計測は未実施。** `firstRawUnit` は候補が無い文字列を早期に返す。候補がある場合は行ごとに `decideRawChars` の結果を取得し、走査位置と findings を前方に進める。`jsonForFile` は通常は `JSON.stringify` だけで返し、対象を含む場合に再構築する。N の線形テストは作業量カウンタと 4 倍入力の比を使用しており、壁時計のみの判定より安定する。非常に大きい JSON や多量の候補を含む入力の独立ベンチマークをしたわけではない。

### 問い 6 — テストの検出力と既存テスト

**指摘なし。** `regression-item54-display-raw-chars.test.ts` は N1〜N8 と線形性を試す。既存 item49 の L7/L17 はパス表示の期待を更新し、L12 は従来の許容から新しいパケット拒否に更新しつつ、`scanString` の守りを残す。既存 backlog9 のテストは `escapeRawCharsAsJson` という別関数の仕様を試すため、そのままにする判断に整合する。実装者が報告した21件の変異試験と事前の FAIL の数値は、元ログが付いていないため独立確認していない。生き残った二つの変異の同値性は、`escapeInline` がチェック済み値を受け取ることと、速い道を通らなくても同じJSON値を生成することから、現在の観測可能な仕様に関して支持できる。

### 問い 7 — 利用者への影響

**指摘なし。** CHANGELOG、README、CONFIG_SPEC、ADR-0039 は、パケットが厳しくなること、`security.allow` ではパケットを緩められないこと、`--exclude` の利用、端末 JSON とファイル JSON の違いを記述する。端末の `--json` は表示用で値が表記に変わりうるが、保存されたJSONは読み戻せるという区別が重要。既存の機械処理にはファイルの JSON を使うべきことが伝わる。

### 問い 8 — 文書と記録

**指摘なし。** 採用 ADR-0039 の最終案との違い、ADR-0014・0016・0020・0036・0037 の追記、ROADMAP と CHANGELOG の v0.16.0・v0.17.0、設計 findings の状態、questions-final の L12 の承認をパケットで確認した。変更した資料とコードの大きな矛盾は確認しなかった。

### 実際に読めた範囲

- 添付 `review-request-batch2-v0170-impl-r1.md` の依頼と出力契約。ZIP `review-packet-batch2-v0170-impl-r1.zip` 内の `review-packet-batch2-v0170-impl.md` を展開し、メタデータ、変更差分、実装7ファイルの全文、2つのテストの全文、ADR-0039・CHANGELOG・README・CONFIG_SPEC・ROADMAP・設計 findings と questions-final の関係箇所を読んだ。
- GitHub 固定 SHA `baecd63c3b5f7f405d16830d39a9ddc9865f5e82` の必須 URL は全8指定を開いた。内訳は `design-final.md`、`adr-0039-draft-final.md`、`review-r1.md`、`review-r2.md`、`src/security/scan.ts`（行範囲3指定）、`tests/regression-backlog9-report-file-notation.test.ts`。GitHub の HTML 表示から該当のコード・設計を照らした。

### 読めなかった・読まなかった範囲と未確認事項

- 「必要なら」の URL 群は開いていない。必須 URL の全文全行の読破を主張しない。差分に含まれない未変更コードの広範囲な再監査も行っていない。
- コード、全テスト、変異試験、性能テスト、CI をこちらで実行していない。独立の実測時間や適用先A・Bのソースは確認していない。
- パケットの記載した事前 FAIL、実行ログ、変異の生ログ、非公開リポジトリの内容は添付されていないため、報告された数値は実装者の記録として区別した。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch2-v0170-impl",
  "round": 1,
  "summary": { "high": 0, "medium": 0, "low": 0 },
  "findings": []
}
```
