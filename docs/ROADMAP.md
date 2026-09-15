# ROADMAP — ai-quality-harness

最終更新: 2026-09-15

各マイルストーンは「自分自身の verify が PASS している」ことを共通の終了条件とする。
M1 以降の内容は現時点の案であり、着手時に依頼範囲を再確認する。

---

## M0 — 全体設計・リポジトリ基盤・verify の中核（今回）

### 内容
- 全体設計（ARCHITECTURE / ROADMAP / CONFIG_SPEC / ADR）
- リポジトリ基盤（git init、.gitignore、README、package.json、tsconfig、ESLint、Vitest、プロジェクト CLAUDE.md）
- `aiqh verify` の中核
  - JSONC 設定の読込とスキーマ検証（不正なら終了コード 2 で停止）
  - チェックの順次実行（子プロセス、stdout/stderr 取得、終了コード、タイムアウト、所要時間）
  - fail closed 判定（必須 1 件でも失敗で FAILED、終了コード 1）
  - 任意チェックの失敗は判定に影響させず FAIL として記録
  - `latest.json` / `latest.md` / `history/<timestamp>.json` の出力
  - 秘密情報らしき文字列のパターンマスク
- 自己適用: Lint / Type Check / Unit Test / Build / Dependency を実チェックとして登録。Security / E2E は NOT_APPLICABLE
- 手動のレビューパケット `artifacts/ai-review/review-packet-m0.md`

### 完了条件
- [ ] `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/CONFIG_SPEC.md`, `docs/adr/*.md` が存在する
- [ ] `npm run verify` でこのリポジトリ自身の Lint / Type Check / Unit Test / Build / Dependency が実行される
- [ ] VERIFY PASSED / FAILED が明確で、FAILED 時の終了コードが非ゼロ（テストで検証）
- [ ] `artifacts/verification/latest.json` / `latest.md` / `history/` が生成される
- [ ] 秘密情報マスクが単体テストで検証されている
- [ ] 秘密情報・会社固有情報を含まない
- [ ] レビューパケット（手動）とプロジェクト CLAUDE.md がある
- [ ] `docs/reports/M0_REPORT.md` がある

### M0 でやらないこと
アダプタ、`init`、`review-packet` / `review-import` コマンド、GitHub Actions、履歴 DB、外部 API 接続、LICENSE、Public 化、承認前の commit / push。

---

## M1 — チェックアダプタ・`aiqh init`・2 リポジトリへの適用

### 内容
- アダプタ（lint / typecheck / unit / build / security / dependency / e2e）
  - 各アダプタは「検出（このツールがあるか）」「推奨 check 定義（command / timeout / required の既定）」「任意の出力パーサ（件数抽出）」の 3 要素。実行経路は M0 の command 実行 1 本のまま
  - Node 系: ESLint / tsc / Vitest・Jest / Vite・Next build / npm audit / Playwright
  - Python 系: ruff / mypy・pyright / pytest / （build は `python -m compileall` または NOT_APPLICABLE）/ pip-audit / Playwright
  - Security Scan: 候補は gitleaks・semgrep 等だが、**無いものは無理に導入しない**。未導入なら NOT_APPLICABLE
- `aiqh init`
  - 対象リポジトリを読み取りで監査（package.json scripts、設定ファイル、pyproject / requirements、tests/ の有無、CI の有無）
  - 既存の lint / test / build 設定を最大限再利用した `aiqh.config.jsonc` を提案し、差分表示のうえ配置
  - 既存ファイルを上書きしない（`--force` 無しでは停止）
- trim-manager（React + TypeScript + Vite）と ai-tutor-browser（Python + FastAPI）への適用
  - 2026-09-15 時点の読み取り調査では、両リポジトリとも lint / typecheck / test の専用スクリプトや CI が未整備。
    init は「無いものは NOT_APPLICABLE」で設定を出し、導入は別依頼として提案にとどめる
- 設定の JSON Schema 出力（`aiqh schema` またはリポジトリ同梱）でエディタ補完・検証を可能にする

### 完了条件
- [ ] 7 分類すべてにアダプタがあり、検出不可時に NOT_APPLICABLE を返す
- [ ] `aiqh init` が本体リポジトリ自身に対して既存の `aiqh.config.jsonc` と同等の提案を出す
- [ ] trim-manager / ai-tutor-browser でそれぞれ `aiqh verify` が実行でき、レポートが生成される（PASS/FAIL は各リポジトリの現状による）
- [ ] 本体の自己 verify PASS

---

## M2 — 独立レビューループ

### 内容
- `aiqh review-packet`: 依頼文（ファイルまたは標準入力）、変更ファイル一覧、`git diff`（サイズ上限あり）、ADR / docs の要約、最新 verify 結果、既知の懸念から Markdown パケットを生成。実装AI の「正しい」という結論は含めない
- `aiqh review-import`: レビューAI の Markdown 指摘を構造化（severity / file / kind / status）して保存。同一 id での再取り込みは status を引き継ぐ
- 再修正 → 再 verify → 再パケットのループ手順を docs に明文化

### 完了条件
- [ ] M0 で手動作成したパケットと同等以上の内容が `aiqh review-packet` で自動生成される
- [ ] 指摘 JSON に未対応（open）が残る間はループ未完了と表示される
- [ ] 本体の自己 verify PASS

---

## M3 — GitHub Actions 再利用ワークフローと Branch Protection

### 内容
- `.github/workflows/verify.yml`（`workflow_call`）: 対象リポジトリはタグ固定で参照するだけ
- 入力: Node / Python バージョン、作業ディレクトリ、設定パス。出力: verify 結果を workflow artifact としてアップロード、Job Summary に latest.md を表示
- 本体リポジトリ自身の CI（自己 verify を PR ごとに実行）
- Branch Protection の手順書（必須ステータスチェック、レビュー必須、force push 禁止）

### 完了条件
- [ ] 本体リポジトリの PR で verify が自動実行され、FAILED でマージ不可になる
- [ ] 対象リポジトリ向けの最小 workflow 例（10 行程度）が docs にある
- [ ] タグ運用（semver、`v0.x.y`）が docs にある

---

## M4 — 履歴 DB・ローカルダッシュボード・運用テンプレート

### 内容
- `aiqh history`: 複数プロジェクトの `history/*.json` を取り込み、PASS/FAIL 推移、所要時間、失敗しやすいチェックを集計。保存先はユーザーローカル 1 箇所
- ローカルダッシュボード（静的 HTML。外部送信なし）
- ロールバック手順・監視項目の設計テンプレート（docs）

### 完了条件
- [ ] 2 つ以上のプロジェクトの履歴が 1 画面で見える
- [ ] 集計が JSON でも取得できる
- [ ] 本体の自己 verify PASS

---

## 非目標（全マイルストーン共通）

- レビューAI の判断を自動で合否に反映すること（人間が介在する）
- 外部サービスへの verify 結果の自動送信
- 対象リポジトリへの lint / test ツールの無断導入
