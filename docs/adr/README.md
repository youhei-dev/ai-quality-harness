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
| [0017](0017-output-lines-blocks-keys-guard.md) | 端末への 1 回の書き出しは 1 行、複数行はコマンド自身の block。JSON のキーも出口を通し、端末には 2 つの基本関数だけが書く | 採用（決定 3 の JSON のデータについての但し書きと既知の限界の M2-2-R4-001 を 0018 で、既知の限界の構造ガードの項を 0019 で置換） | 2026-09-25 |
| [0018](0018-safejson-json-data-only.md) | `safeJson()` は JSON のデータだけを受け付け、それ以外は出力の前に拒否する | 採用 | 2026-09-27 |
| [0019](0019-builtin-allowlist-process-members.md) | `src/` が実行時に読み込むモジュールを一覧で限り、`process` の 6 つのメンバーを使わない（構造ガード） | 採用 | 2026-09-28 |
| [0020](0020-file-output-notation-and-check-env.md) | ファイルへの出力は書き込みの出口で形式別に禁止文字を表記にする。check の環境から色の強制を除く | 採用（ADR-0016 の「ファイルへの出力は対象外」を引き継ぐ） | 2026-10-02 |
| [0021](0021-usage-errors-are-exit-2.md) | 使い方エラーは全コマンドで exit 2 にする（1 は finding・検査の失敗専用） | 採用（ADR-0014 決定 11 を全コマンドと本体へ広げる） | 2026-10-03 |
| [0022](0022-unreadable-is-not-absent.md) | 読めないものを「無い」としない: パスの包含と書込の前提 | 採用（ADR-0010・0015 の「ENOENT だけが無い」を、設定のパスの包含判定と init の書込の前提へ広げる） | 2026-10-04 |
| [0023](0023-unconfirmed-termination-is-not-terminated.md) | 確認できなかった終了を、終了したことにしない: タイムアウト・中断の後のグループの消滅の確認と有界時間 | 採用（ADR-0005 の「猶予後 SIGKILL」の後に確認を足す） | 2026-10-05 |
| [0024](0024-unhandled-exceptions-exit-2.md) | 処理されなかった例外・拒否は、出口を通して exit 2 で終え、動いている子を片付ける | 採用（ADR-0019 の既知の限界のうち CLI の終わり方を決める。シグナルが先なら 130 / 143 のまま） | 2026-10-11 |
| [0025](0025-self-ci-ubuntu-verify-not-required-yet.md) | 自己 CI は Ubuntu の verify から始め、最初は必須にしない（Windows は測定だけ、アクションは commit SHA で固定、権限は読み取りだけ） | 採用（M3 の前半。ADR-0005 の Windows の扱いは変えない。非公開のままでは Branch Protection は使えない） | 2026-10-12 |
