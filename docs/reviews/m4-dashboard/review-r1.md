> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-m4-dashboard-r1-for-claude.md`（2026-10-19 受領、4,582 バイト、LF 35・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `e533cbc694b24af973f017cbc23e8114779e798ee0c8f1e8114ce76cee83ee62`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.12.0 の `aiqh review-import` でそのまま取り込めた）。

---

# m4-dashboard 独立レビュー R1

## 前の指摘の確かめ

- M4-H-R1-001: 解消。`src/output.ts` の `within` は `Safe` 化後の各出力単位の UTF-8 バイト数に改行 1 バイトを足し、上限判定後だけ書く。表の最終行と `HISTORY INCOMPLETE`、JSON の末尾改行も対象。`tests/history-output-bytes.test.ts` の上限一致・1 バイト超過・最終行・改行・書き手別・CLI 実測の検証と、既存テストの期待値 3 か所の変更も整合する。
- M4-D-R1-004: 解消。`HTML_SHOWN` と `HTML_NOT_SHOWN` を明示し、数値の本文と `data-k` に JSON の実パスを付与している。テストは数値の葉の排他的な分類、表示値の照合、キーの一意性、SVG の日別グループと有効値の点数を確認する。
- M4-D-R2-001: 解消。HTML の UTF-8 バイト長を書き込み前に確認し、標準出力のバイト上限も通過したときにだけ `beforeWrite` で `writeAtomic` を呼ぶ。`h()` と固定テンプレートの出力に対して最終ファイル書き込み時の禁止文字処理で差が生じない構成であり、境界と双方の非書き込みをテストする。v0.11.2 の標準出力側も上記のとおり解消。
- M4-D-R2-002: 解消。`projects.*.checks.*.lastTimeoutSec` は `HTML_NOT_SHOWN` にあり、`project()` の表示対象にない。テストは当該数値の目印が HTML 中に現れないことも検証する。

## 全体の結論

件数: High 0 / Medium 0 / Low 0

指定されたコードとテストをパケットの差分・全文に基づいて独立に照合した範囲では、High・Medium の指摘はなく、Low の追加指摘もない。実装者による解消宣言や verify PASS のみを根拠とした判定ではない。

- 問い 1: 指摘なし。最終行、改行、上限境界、既定の `console.log` とテストの `log`・`write` の対応、期待値変更を確認。
- 問い 2: 指摘なし。数値対応表、許可リスト、`data-k` の一意性、SVG の構造と計数、HTML ファイルの上限、`lastTimeoutSec` の非表示を確認。
- 問い 3: 指摘なし。`h()` におけるマスク、禁止文字の表記、HTML 文字参照の順序、本文と二重引用符属性だけへの値の挿入を確認。固定テンプレート内の CSS とその SHA-256、CSP の配置、SVG の固定タグ・属性も整合する。`HtmlText` はコンパイル時の型による規約であることは既知の限界。
- 問い 4: 指摘なし。HTML に投影する集計フィールドを追跡し、パス、コマンド、出力、解析項目名等の直接表示を認めなかった。`dashboard:` と新しいエラー文言は出力先のパスを含まない。
- 問い 5: 指摘なし。HTML の計量と `writeAtomic`、両方の上限を通した後のファイル先行書き込み、symlink・ファイル種別・履歴ディレクトリの検査を確認。書き込み前後の第三者による差し替えは指定された既知の限界。
- 問い 6: 指摘なし。JSON の数値葉を対応表または許可リストの一方だけに分類するテスト、同一入力での数値照合、注入文字列、禁止フィールドの目印、SVG の構造、出力境界を確認。
- 問い 7: この範囲では M4 の全完了条件を満たさない。`docs/ROADMAP.md` の運用テンプレートの条件が未チェックで、`docs/ops/` の追加は別版の予定。その他の HTML・JSON・集計・レポートハッシュの完了条件については実装とテスト、記録上の根拠がある。自己 verify はパケット記録で PASS。PR の必須 checks の成功はパケットの記録を確認したが、外部 CI の実表示を独立照会していない。

未確認範囲: このレビューではコード・テストを実行していない。パケットに含まれない未変更の `src/run-history/aggregate.ts`、`src/security/mask.ts`、`src/security/raw-chars.ts`、`tests/structure/output-guard.ts`、fixture・helper 全文、および設計 R3 の全文については独立に再検査していない。`8ccd994` の自己 verify 結果はパケット内の記録を参照した。ブラウザごとの CSP 適用、実画面、および変更を競合させる攻撃は既知の限界として対象外。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "m4-dashboard",
  "round": 1,
  "summary": { "high": 0, "medium": 0, "low": 0 },
  "findings": [],
  "previous": []
}
```
