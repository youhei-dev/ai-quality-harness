# ADR-0007: `artifacts/` を git 管理外にする

- 状態: 採用
- 日付: 2026-09-15。注記: 2026-10-17（v0.10.0。根拠の「CI の artifact・履歴 DB」の注記）

## 文脈
`artifacts/verification/`（verify 出力）と `artifacts/ai-review/`（レビューパケット・指摘）を
git で管理するかどうかを決める必要がある。

## 決定
`artifacts/` は git 管理外（`.gitignore`）とする。人間向けのマイルストーン報告は `docs/reports/` に置き、
こちらは管理する。

## 根拠
- verify 出力は実行ごとに変わる生成物であり、diff がノイズになる
- コマンド出力の末尾を含むため、マスクを経ていても秘密情報の残留リスクをゼロにできない。
  管理外にすれば、万一の残留が履歴に固定されない
- `history/` は実行回数に比例して増え、リポジトリを肥大化させる
- CI ではワークフロー artifact（M3）、ローカルでは履歴 DB（M4）が保存先になる
  - 注記（2026-10-17、v0.10.0）: 「CI ではワークフロー artifact（M3）、ローカルでは履歴 DB（M4）が保存先になる」は、どちらもそのとおりにはならなかった。CI のレポートは artifact に上げない（ADR-0025・0031）。M4 は DB を持たず、各プロジェクトの `history/*.json` を読み取りだけで集計する（ROADMAP の M4。決定の ADR は `aiqh history` の版で足す）。`artifacts/` を git 管理外にする決定は変えない。
- レビューパケットは「レビューAI に渡す一時的な入力」であり、結論は `docs/reports/` と ADR に残す

## 代替案
- `artifacts/verification/latest.md` だけ管理する: 「最後に PASS した証拠」を残せるが、PR ごとに衝突する。
  M3 で Job Summary に出す方が適切

## 影響
- レビューパケットのパスは報告書に明記し、必要ならユーザーが手動で保存する
- M0 の `review-packet-m0.md` は管理外のまま（依頼どおり）
