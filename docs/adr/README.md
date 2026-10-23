# ADR（Architecture Decision Records）

1 件 1 ファイル。番号は追加順。状態は `提案` / `採用` / `置換（→ 番号）` / `廃止`。

| 番号 | タイトル | 状態 | 日付 |
|---|---|---|---|
| [0001](0001-language-typescript-node.md) | 本体の言語を TypeScript（Node）にする | 採用 | 2026-09-15 |
| [0002](0002-config-format-jsonc.md) | 設定ファイル形式を JSONC にする | 採用 | 2026-09-15 |
| [0003](0003-report-format-json-markdown.md) | レポートを JSON（機械）+ Markdown（人間）の 2 形式にする | 採用 | 2026-09-15 |
| [0004](0004-fail-closed-verdict.md) | 最終判定は fail closed とし、必須チェック 0 件を許さない | 採用 | 2026-09-15 |
| [0005](0005-child-process-execution.md) | チェックは shell 経由・プロセスグループ管理で実行する | 採用（注記〈v0.10.1〉: `timeoutSec` の上限 2,147,483 秒） | 2026-09-15 |
| [0006](0006-secret-masking.md) | 出力の秘密情報はパターンマスクし、値を保存しない | 採用（注記〈v0.10.0〉: CI ではレポートを artifact に上げない） | 2026-09-15 |
| [0007](0007-artifacts-untracked.md) | `artifacts/` を git 管理外にする | 採用（注記〈v0.10.0〉: CI の artifact と履歴 DB は、そのとおりにはならなかった） | 2026-09-15 |
| [0008](0008-dependency-policy.md) | 依存パッケージは最小限・バージョン固定とする | 採用 | 2026-09-15 |
| [0009](0009-distribution-npm-link.md) | M1 の配布は `npm link` によるローカル配布とする | 採用（M3 で再評価。注記〈v0.9.0〉: CI は ADR-0031 の案 D、手元は `npm link` のまま） | 2026-09-18 |
| [0010](0010-builtin-security-scan.md) | Security Scan は内蔵実装とし、masker とパターン定義を共有する | 採用 | 2026-09-18 |
| [0011](0011-adapter-boundary.md) | アダプタは検出＋推奨に限定し、`init` の書込は別フラグに分ける | 採用（出力パーサの型の項を 0028 で置換。v0.14.0 で node:test の検出〈script の本文を証拠にする。ROADMAP の項目 45〉） | 2026-09-18 |
| [0012](0012-security-allow.md) | `security.allow` による例外指定と key-value 走査の方針 | 採用（追記の一部を 0016 で置換） | 2026-09-20 |
| [0013](0013-window-scan-completeness.md) | 窓走査の完全性不変条件と有界アンカー | 採用 | 2026-09-23 |
| [0014](0014-review-packet.md) | review-packet は機械的に得た事実だけで作り、検査に通らなければ出さない | 採用 | 2026-09-23 |
| [0015](0015-review-packet-exit-priority.md) | review-packet の終了コードは「検査不能 → 検出 → 出力しない判断」の順に決める | 採用 | 2026-09-25 |
| [0016](0016-output-boundary.md) | 端末への出力は 1 つの出口を通し、禁止文字を表記にしてから秘密の形をマスクする | 採用（決定 3 と既知の限界を 0017 で置換。注記〈v0.11.0〉: `Output` の口 `jsonWithin`。注記〈v0.11.2〉: 口 `linesWithin`・書き手 `write`。注記〈v0.12.0〉: `beforeWrite`） | 2026-09-25 |
| [0017](0017-output-lines-blocks-keys-guard.md) | 端末への 1 回の書き出しは 1 行、複数行はコマンド自身の block。JSON のキーも出口を通し、端末には 2 つの基本関数だけが書く | 採用（決定 3 の JSON のデータについての但し書きと既知の限界の M2-2-R4-001 を 0018 で、既知の限界の構造ガードの項を 0019 で置換） | 2026-09-25 |
| [0018](0018-safejson-json-data-only.md) | `safeJson()` は JSON のデータだけを受け付け、それ以外は出力の前に拒否する | 採用 | 2026-09-27 |
| [0019](0019-builtin-allowlist-process-members.md) | `src/` が実行時に読み込むモジュールを一覧で限り、`process` の 6 つのメンバーを使わない（構造ガード） | 採用 | 2026-09-28 |
| [0020](0020-file-output-notation-and-check-env.md) | ファイルへの出力は書き込みの出口で形式別に禁止文字を表記にする。check の環境から色の強制を除く | 採用（ADR-0016 の「ファイルへの出力は対象外」を引き継ぐ。注記〈v0.12.0〉: `html` の形） | 2026-10-02 |
| [0021](0021-usage-errors-are-exit-2.md) | 使い方エラーは全コマンドで exit 2 にする（1 は finding・検査の失敗専用） | 採用（ADR-0014 決定 11 を全コマンドと本体へ広げる） | 2026-10-03 |
| [0022](0022-unreadable-is-not-absent.md) | 読めないものを「無い」としない: パスの包含と書込の前提 | 採用（ADR-0010・0015 の「ENOENT だけが無い」を、設定のパスの包含判定と init の書込の前提へ広げる） | 2026-10-04 |
| [0023](0023-unconfirmed-termination-is-not-terminated.md) | 確認できなかった終了を、終了したことにしない: タイムアウト・中断の後のグループの消滅の確認と有界時間 | 採用（ADR-0005 の「猶予後 SIGKILL」の後に確認を足す） | 2026-10-05 |
| [0024](0024-unhandled-exceptions-exit-2.md) | 処理されなかった例外・拒否は、出口を通して exit 2 で終え、動いている子を片付ける | 採用（ADR-0019 の既知の限界のうち CLI の終わり方を決める。シグナルが先なら 130 / 143 のまま） | 2026-10-11 |
| [0025](0025-self-ci-ubuntu-verify-not-required-yet.md) | 自己 CI は Ubuntu の verify から始め、最初は必須にしない（Windows は測定だけ、アクションは commit SHA で固定、権限は読み取りだけ） | 採用（M3 の前半。ADR-0005 の Windows の扱いは変えない。非公開のままでは Branch Protection は使えない。注記〈v0.8.4〉: Public にした後、main の ruleset〈削除と force push の禁止。必須チェックは未設定〉。注記〈v0.9.0〉: 再利用ワークフロー `verify.yml` と自己適用の job〈ADR-0031〉。注記〈v0.9.2〉: main は pull request 必須、必須チェック 2 つ〈ADR-0032〉） | 2026-10-12 |
| [0026](0026-review-import-json-block-fail-closed.md) | review-import は、レビューの中の決まった JSON のブロックを正本にし、本文と食い違えば何も書かない | 採用（ARCHITECTURE の findings の置き場所〈`artifacts/ai-review/`〉を `docs/reviews/<label>/findings-r<N>.json` に置き換える。終了コードは 0 / 2 のまま） | 2026-10-13 |
| [0027](0027-review-check-state-and-loop.md) | review-check は findings の状態を読み取りだけで検査し、ループ未完了を表示する（終了コードは検査の誤りだけ） | 採用（ADR-0026 の D11 の v2。D1〜D18 は変えない） | 2026-10-13 |
| [0028](0028-output-parsers-display-only.md) | verify は check の出力を表示のためだけに読む（出力パーサ）。security-scan の項目も同じ欄に入れる。判定と終了コードは変えない | 採用（ADR-0011 の出力パーサの型の項を置換。`schemaVersion` は 1 のまま。v0.14.0 で pytest のパーサ〈決定 12。選び方は語の位置で見る。ROADMAP の項目 39〉） | 2026-10-14 |
| [0029](0029-key-value-false-positive-record.md) | key-value の誤検出を、何と呼び、どこに・どの形で記録し続けるか（定義だけ。実装しない） | 採用（ADR-0010・0012 の走査の方針は変えない。注記〈v0.11.0〉: M4 はルールごとの回数を数えず、security-scan の数の推移だけ） | 2026-10-14 |
| [0030](0030-public-as-is-mit-claude-md-untracked.md) | このリポジトリを、履歴を書き換えずにそのまま Public にする（MIT。プロジェクトの `CLAUDE.md` は追跡外） | 採用（v0.8.3 は準備まで。切り替えは人間。切り替えの後、ADR-0025 の決定 6 の前提が変わる。2026-10-16 に切り替えた〈v0.8.4 の注記〉） | 2026-10-16 |
| [0031](0031-ci-distribution-reusable-workflow-own-source.md) | CI での aiqh の配布は、再利用ワークフローが自分と同じ commit のソースを使う形にする（案 D。呼び出す側は 40 桁の commit SHA で固定） | 採用（v0.9.0。ADR-0009 の CI の部分。手元の `npm link` は変えない） | 2026-10-16 |
| [0032](0032-main-requires-pull-requests-two-required-checks.md) | 本体リポジトリの main は pull request を必須にする（必須チェックは `verify (ubuntu)` と `reusable (self) / aiqh verify`、merge commit だけ、Bypass なし） | 採用（v0.9.2。ADR-0025 の決定 3 を終え、決定 6・7 の後を決めた。ROADMAP の項目 44） | 2026-10-17 |
| [0033](0033-config-sha256-recorded-not-pinned.md) | verify のレポートに、設定ファイルのバイト列の SHA-256 を `configSha256` として記録する（固定ではなく記録） | 採用（v0.10.0。R-006 の対策候補 2 を「記録」として入れる。候補 3 は docs の手順） | 2026-10-17 |
| [0034](0034-history-aggregate-without-database.md) | `aiqh history` — 履歴を DB 無しで、読み取りだけで集計する（端末の表と `--json`） | 採用（v0.11.0。ARCHITECTURE の「履歴 DB」を置き換える。ディレクトリの差し替えは検出だけ。v0.11.2 で出力の上限を実際に書くバイトに。HTML は ADR-0035） | 2026-10-18 |
| [0035](0035-history-dashboard-static-html.md) | 静的 HTML のダッシュボード（`aiqh history --html`） | 採用（v0.12.0。script・外の資源・イベントの属性なし。CSP の meta。値はすべて `h()`。数は `data-k` で `--json` と照合。v0.12.1 で文字の値の列の見出しを左寄せに） | 2026-10-18 |
| [0036](0036-security-scan-raw-bidi-controls-and-line-separators.md) | security の check は、生の双方向の制御文字と行区切りを、出現ごとに finding にする（既定で FAIL、分類を明示した allow でだけ外せる） | 採用（v0.13.0。ROADMAP の項目 48。11 の符号位置〈`FORBIDDEN_RANGES` の部分集合〉。中身とパス名。`scanString`・review-packet は変えない。設計の独立レビューは `docs/reviews/item48-design/`。v0.13.1 で、未マージの index で同じパスを 1 回だけ扱う〈`docs/reviews/item48-impl/`〉） | 2026-10-19 |
