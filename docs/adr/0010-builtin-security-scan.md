# ADR-0010: Security Scan は内蔵実装とし、masker とパターン定義を共有する

- 状態: 採用
- 日付: 2026-09-18

## 文脈
M0 の 7 分類のうち security は NOT APPLICABLE のままだった。外部ツール（gitleaks / semgrep 等）は対象リポジトリに無いものを
無理に導入しない方針。R-012（masker と scanner の検出仕様の整合）が持ち越しになっていた。

## 決定
- `aiqh security-scan` を内蔵する（Node 標準 + `git` のみ）。対象は **git 管理下のファイル**（`git ls-files`）。バイナリ（先頭 8KB に NUL）と 1MiB 超はスキップして件数だけ報告
- 検出 3 種: (1) 秘密情報パターン、(2) git 管理下の `.env` 系（`.env.example` / `.env.sample` / `.env.template` / `.env.dist` は example として情報のみ）、(3) `.gitignore` の `.env` / `.env.*` 欠落
- **値は出力しない**: 結果は分類・パス・行番号・件数のみ。マッチ文字列も行内容も持たない
- パターン定義は `src/security/patterns.ts` に一本化し、masker（レポートのマスク）と scanner が同じ定義を使う。各定義は `scan` フラグを持つ:
  - `scan: true`: private-key / url-credential / anthropic / openai / aws / github / slack / google / gitlab / jwt
  - `scan: false`（マスク専用）: bearer / basic / key-value。ソースコード中の `password=` / `Bearer …` は誤検出が多く、値の漏洩防止はレポート側のマスクで担保する。scanner は未走査分類と理由を**必ず表示**する
- 走査前に aiqh 自身の正規マーカー `[REDACTED:<category>]` を除去する（レポートやテストに正当に現れ、URL 内では認証情報の形になるため）。マーカーの後ろに実際の秘密が続く行は検出を維持
- 互換テスト（R-012）: 実行時連結で生成した合成資格情報コーパスを masker と scanner の両方に入力し、`scan: true` の全分類で「マスクされる」かつ「同じ分類で検出される」、平文は両方で無反応、結果に値が含まれないことを検証
- 既定は必須チェック。終了コードは 0 / 1 / 2（非 git は fail closed）

## 代替案
- 外部ツールの呼び出し: 対象ごとの導入が前提になり、検出仕様の整合も保てない
- key-value を走査に含める: 誤検出が多すぎる。M2 で `security.allow` と抑制方式を設計して再検討

## 影響
- push 前 hook（共通設定）とは別の実装であり、一致は保証しない（hook は変更しない）
- 対象リポジトリのテスト内ダミーキーは検出される。連結方式へ直すか、M2 の `security.allow` で許容する
