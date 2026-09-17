# ADR-0003: レポートを JSON（機械）+ Markdown（人間）の 2 形式にする

- 状態: 採用
- 日付: 2026-09-15

## 文脈
verify の結果は CI・履歴 DB・レビューパケット生成（機械）と、人間・レビューAI（可読）の両方が使う。

## 決定
- `artifacts/verification/latest.json`: 機械可読。`schemaVersion` を持ち、後方互換の変更のみ許す
- `artifacts/verification/latest.md`: 人間可読。JSON から生成し、内容は JSON の部分集合
- `artifacts/verification/history/<YYYYMMDDTHHmmssZ>.json`: 実行ごとの履歴。`latest.json` と同一内容
- 最低限の項目: 実行日時、git commit / branch / dirty、実行 check 一覧、各 check の PASS / FAIL / SKIPPED、
  所要時間、エラー要約、最終判定、終了コード
- 各 check の stdout / stderr は末尾 N 行（既定 200 行、上限 64KB）を保存し、切り詰めた場合は `outputTruncated: true`
- 7 分類（lint / typecheck / unit / build / security / dependency / e2e）の固定キーを `categories` に持ち、
  設定に無い分類は `NOT_APPLICABLE`

## 根拠
- JSON は Node 標準で読み書きでき、追加依存がない
- Markdown は GitHub の Job Summary（M3）とレビューパケット（M2）にそのまま埋め込める
- 履歴ファイル名を UTC のタイムスタンプにすることで、ソート順＝時系列になり、ファイルシステムで衝突しない
- 出力全文を保存すると履歴が肥大化し、秘密情報の残留リスクも増えるため末尾のみとする
- 補足（v0.1.4 / v0.1.5）: 実行時のメモリ上限（ストリームごと 10MiB）はバイト単位で先頭から切り詰め、UTF-8 のコードポイント境界に
  揃えるため、保持量は上限より最大 3 バイト少なくなることがある

## 代替案
- JUnit XML: CI ツールとの互換は高いが、分類別サマリや git 情報を表現しにくい。M3 で必要なら追加出力とする
- SQLite に直接保存: M4 の履歴 DB で扱う。verify 自体は依存を増やさずファイル出力に留める

## 影響
- レポートの構造変更は `schemaVersion` を上げ、旧版の読込互換を M4 の履歴取り込みで考慮する
