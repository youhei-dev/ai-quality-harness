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
| [0012](0012-security-allow.md) | `security.allow` による例外指定と key-value 走査の方針 | 採用（追記の一部を 0016 で置換） | 2026-09-20 |
| [0013](0013-window-scan-completeness.md) | 窓走査の完全性不変条件と有界アンカー | 採用 | 2026-09-23 |
| [0014](0014-review-packet.md) | review-packet は機械的に得た事実だけで作り、検査に通らなければ出さない | 採用 | 2026-09-23 |
| [0015](0015-review-packet-exit-priority.md) | review-packet の終了コードは「検査不能 → 検出 → 出力しない判断」の順に決める | 採用 | 2026-09-25 |
| [0016](0016-output-boundary.md) | 端末への出力は 1 つの出口を通し、禁止文字を表記にしてから秘密の形をマスクする | 採用（決定 3 と既知の限界を 0017 で置換） | 2026-09-25 |
| [0017](0017-output-lines-blocks-keys-guard.md) | 端末への 1 回の書き出しは 1 行、複数行はコマンド自身の block。JSON のキーも出口を通し、端末には 2 つの基本関数だけが書く | 採用（決定 3 の JSON のデータについての但し書きと既知の限界の M2-2-R4-001 を 0018 で置換） | 2026-09-25 |
| [0018](0018-safejson-json-data-only.md) | `safeJson()` は JSON のデータだけを受け付け、それ以外は出力の前に拒否する | 採用 | 2026-09-27 |
