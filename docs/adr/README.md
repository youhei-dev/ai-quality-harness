# ADR（Architecture Decision Records）

1 件 1 ファイル。番号は追加順。状態は `提案` / `採用` / `置換（→ 番号）` / `廃止`。

| 番号 | タイトル | 状態 | 日付 |
|---|---|---|---|
| [0001](0001-language-typescript-node.md) | 本体の言語を TypeScript（Node）にする | 採用 | 2026-09-15 |
| [0002](0002-config-format-jsonc.md) | 設定ファイル形式を JSONC にする | 採用 | 2026-09-15 |
| [0003](0003-report-format-json-markdown.md) | レポートを JSON（機械）+ Markdown（人間）の 2 形式にする | 採用 | 2026-09-15 |
| [0004](0004-fail-closed-verdict.md) | 最終判定は fail closed とし、必須チェック 0 件を許さない | 採用 | 2026-09-15 |
| [0005](0005-child-process-execution.md) | チェックは shell 経由・プロセスグループ管理で実行する | 採用 | 2026-09-15 |
| [0006](0006-secret-masking.md) | 出力の秘密情報はパターンマスクし、値を保存しない | 採用 | 2026-09-15 |
| [0007](0007-artifacts-untracked.md) | `artifacts/` を git 管理外にする | 採用 | 2026-09-15 |
| [0008](0008-dependency-policy.md) | 依存パッケージは最小限・バージョン固定とする | 採用 | 2026-09-15 |
| [0009](0009-distribution-npm-link.md) | M1 の配布は `npm link` によるローカル配布とする | 採用（M3 で再評価） | 2026-09-18 |
| [0010](0010-builtin-security-scan.md) | Security Scan は内蔵実装とし、masker とパターン定義を共有する | 採用 | 2026-09-18 |
| [0011](0011-adapter-boundary.md) | アダプタは検出＋推奨に限定し、`init` の書込は別フラグに分ける | 採用 | 2026-09-18 |
