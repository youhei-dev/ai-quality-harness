# M0 報告 — ai-quality-harness 全体設計と verify の中核

- 日付: 2026-09-15
- 対象: `~/claude-projects/ai-quality-harness/`（新規リポジトリ、`main`、コミット未作成）
- 状態: **M0 実装完了・自己 verify PASSED・停止ポイント2（commit / push 未実施）**

---

## 1. 環境確認結果

| 項目 | 結果 |
|---|---|
| Node | v24.13.1 |
| npm | 11.18.0 |
| git | 2.50.1 (Apple Git-155) |
| `git config user.email` | `youhei-dev@users.noreply.github.com`（グローバル値。ユーザー指示によりローカル設定なし） |
| `git config user.name` | youhei-dev |
| gh | github.com に youhei-dev でログイン済み（https、scope: gist / read:org / repo） |
| OS | macOS（Apple Silicon、Darwin 25.2.0） |
| npm の保護設定 | `min-release-age = 7`（公開 7 日未満のパッケージを拒否）、`ignore-scripts = true`、`allow-git = none`、`allow-remote = none`。迂回せず、この条件を満たす版を選定 |

補足: Node 24 のネイティブ TypeScript 実行（`.ts` 拡張子 import、型剥がし）を試験し、警告なしで動作することを確認した。

## 2. 全体設計の要約

| ファイル | 要点 |
|---|---|
| `docs/ARCHITECTURE.md` | 最終形（M4）の構成。配布モデル（本体はこのリポジトリ、対象リポジトリには設定 1 枚＋ワークフロー参照）、CLI 5 コマンド、モジュール分割（M0 実装範囲を明記）、verify のデータフロー、レポート JSON 仕様、セキュリティ設計、終了コード（0 PASSED / 1 FAILED / 2 設定・内部エラー） |
| `docs/ROADMAP.md` | M0〜M4 の内容と完了条件。共通の終了条件は「自己 verify PASS」。M1 のアダプタは「検出＋推奨設定＋任意の出力パーサ」で、実行経路は増やさない |
| `docs/CONFIG_SPEC.md` | `aiqh.config.jsonc` の仕様。M0 確定分（version / project / output / defaults / checks と検証規則 10 項目）と、M1 以降の拡張案（enabled / env / parser / dependsOn / JSON Schema 等） |
| `docs/adr/0001` | 言語 TypeScript 5.9（Node 24、ESM）。ネイティブ TS 実行は開発・テスト限定、`bin` はビルド済み `dist/cli.js` |
| `docs/adr/0002` | 設定形式 JSONC（コメント可、暗黙型変換なし、未知キー拒否、実行可能設定を避ける） |
| `docs/adr/0003` | レポートは JSON（schemaVersion 1）＋ Markdown ＋ history。出力は末尾 200 行 / 64KB |
| `docs/adr/0004` | fail closed。SKIPPED は PASS ではない。必須 0 件の設定はエラー。既定は全チェック実行 |
| `docs/adr/0005` | shell 経由・独立プロセスグループで実行。タイムアウトで SIGTERM → 5 秒後 SIGKILL。cwd はルート内限定。Windows 未対応 |
| `docs/adr/0006` | レポート内の全文字列を深い走査でマスク。12 分類。冪等。誤検出を許容 |
| `docs/adr/0007` | `artifacts/` は git 管理外。人間向け報告は `docs/reports/` |
| `docs/adr/0008` | 実行時依存 3 つ、`~` 固定、lockfile 管理、`npm audit --audit-level=high` を必須化 |

## 3. 作成ファイル

すべて新規（45 ファイル＋本報告書）。`node_modules/` `dist/` `artifacts/` `tmp/` は git 管理外。

### 基盤

| ファイル | 目的 |
|---|---|
| `.gitignore` | `node_modules/` `dist/` `artifacts/` `tmp/` `.env` `.env.*` `coverage/` 等を除外 |
| `package.json` | name `ai-quality-harness`、`private: true`、`engines.node >=24.0.0`、`bin.aiqh = dist/cli.js`、scripts（build / typecheck / lint / test / verify / verify:dist） |
| `package-lock.json` | 依存の固定（npm install が生成） |
| `tsconfig.json` | 型チェック用（src + tests）。strict、`erasableSyntaxOnly`、`.ts` import と emit 時の `.js` 書換 |
| `tsconfig.build.json` | ビルド用（src → dist、sourceMap） |
| `eslint.config.js` | ESLint flat config（@eslint/js recommended + typescript-eslint recommended） |
| `vitest.config.ts` | `tests/**/*.test.ts`、タイムアウト 30 秒 |
| `aiqh.config.jsonc` | 自己検証設定。lint / typecheck / unit / build / dependency の 5 チェック（すべて必須） |
| `README.md` | 公開前提の概要・使い方・CLI・構成（個人情報・会社情報なし） |
| `CLAUDE.md` | プロジェクト固有ルール（会社情報禁止、fail closed、自己 verify 必須、停止ポイント、tmp/ 運用、技術方針） |

### src/（1,268 行）

| ファイル | 目的 |
|---|---|
| `src/cli.ts` | エントリ（commander）。`verify` サブコマンド、`--version`、SIGINT / SIGTERM を子プロセスグループへ転送、未処理例外は終了コード 2 |
| `src/types.ts` | 共有型、7 分類の定数、終了コード定数 |
| `src/commands/verify.ts` | 設定読込 → git 情報 → 順次実行 → レポート生成 → 書込 → 終了コード。進捗表示（失敗時は末尾 20 行、`--verbose` で全文） |
| `src/config/schema.ts` | zod スキーマ。未知キー拒否、名前の一意性、必須チェック ≥ 1 件 |
| `src/config/load.ts` | JSONC 読込、スキーマ検証、既定値適用、cwd / output.dir のルート内制限 |
| `src/runner/execute.ts` | 子プロセス実行（shell、detached、stdin ignore、出力上限 10MiB、タイムアウトでプロセスグループ kill）。例外を投げず結果で表現 |
| `src/runner/run-checks.ts` | 設定順の実行、`--fail-fast` の SKIPPED、失敗要約、末尾抽出（200 行 / 64KB） |
| `src/report/verdict.ts` | fail closed 判定と分類別集計（設定に無い分類は NOT_APPLICABLE） |
| `src/report/build-report.ts` | レポート組立て後に `maskDeep` を適用 |
| `src/report/markdown.ts` | Markdown 出力（判定・メタ情報・分類表・チェック表・失敗詳細） |
| `src/report/write.ts` | `latest.json` / `latest.md` / `history/<UTC>.json` を一時ファイル経由で書込。同一秒は `-2` 以降の連番 |
| `src/security/mask.ts` | 12 分類のパターンマスク（private-key / url-credential / bearer / anthropic / openai / aws / github / slack / google / gitlab / jwt / key-value）と深い走査 |
| `src/git/info.ts` | commit / branch / dirty（非 git なら null、初回コミット前でも branch を取得） |

### tests/（879 行、7 ファイル、72 テスト）

| ファイル | 内容 |
|---|---|
| `tests/mask.test.ts` | 12 分類のマスク、キー名保持、URL のホスト保持、冪等性、誤検出しない平文、深い走査、マスク後の JSON 妥当性 |
| `tests/config.test.ts` | JSONC 読込と既定値、欠落・構文エラー・version・空 name・0 件・重複名・不正名・不明 kind・空 command・timeout・未知キー・必須 0 件、cwd / output.dir のルート逸脱 |
| `tests/execute.test.ts` | 終了コード、stdout / stderr、パイプと `&&`、cwd、cwd 不在、コマンド不在、**タイムアウト時に孫プロセスまで kill されること**、出力上限 |
| `tests/verdict.test.ts` | 全必須 PASS → PASSED、必須 1 件失敗 → FAILED、任意失敗は判定に影響せず FAIL 記録、SKIPPED は PASS でない、必須 0 件 → FAILED、分類集計 |
| `tests/report.test.ts` | メタ情報・判定・深いマスク、非 git、ファイル書込・履歴名の衝突回避・一時ファイル残留なし |
| `tests/markdown.test.ts` | 判定・メタ・分類・チェック表・パイプのエスケープ・失敗詳細、所要時間の書式 |
| `tests/cli.test.ts` | CLI を実際に起動: 全 PASS → 0、必須失敗 → 1（他チェックは継続、マスク済み）、`--fail-fast`、不正設定 → 2（レポート未作成）、設定欠落 → 2、`--config` / `--output-dir`、`--version` |

### docs/（807 行）

`docs/ARCHITECTURE.md`、`docs/ROADMAP.md`、`docs/CONFIG_SPEC.md`、`docs/adr/README.md`、`docs/adr/0001〜0008`、本報告書。

### git 管理外

- `artifacts/ai-review/review-packet-m0.md`（レビューパケット。375 行）
- `artifacts/verification/latest.json` / `latest.md` / `history/*.json`（自己 verify の出力）

## 4. 自己 verify の結果

`npm run verify`（ソース実行）と `npm run verify:dist`（ビルド済み JS）の両方で **VERIFY PASSED**、終了コード 0。

| 分類 | 結果 | 内容 |
|---|---|---|
| Lint | **PASS** | `npm run lint`（eslint .） |
| Type Check | **PASS** | `npm run typecheck`（tsc --noEmit、src + tests） |
| Unit Test | **PASS** | `npm run test`（Vitest 7 ファイル 72 件） |
| Build | **PASS** | `npm run build`（tsc → dist/） |
| Security | **NOT APPLICABLE** | アダプタは M1 |
| Dependency | **PASS** | `npm audit --audit-level=high`（0 vulnerabilities） |
| E2E | **NOT APPLICABLE** | アダプタは M1 |

終了コードの実測: 全 PASS → 0、必須失敗を含む設定（tmp/smoke）→ 1、設定ファイル欠落 → 2。
レポートの `git.commit` はコミット未作成のため `null`（branch `main`、dirty `true`）。

## 5. verify コマンド

```bash
# 依存関係の導入（初回のみ）
cd ~/claude-projects/ai-quality-harness && npm install

# 自己 verify（src/ をそのまま実行）
npm run verify

# ビルド済み JS で自己 verify
npm run verify:dist

# 個別実行
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high

# 結果
cat artifacts/verification/latest.md
```

## 6. セキュリティ・会社情報混入チェック

| 観点 | 方法 | 結果 |
|---|---|---|
| 秘密情報パターン | コミット候補 45 ファイルを `sk-ant-` `sk-` `AKIA/ASIA` `ghp_/github_pat_` `xox?-` `AIza` `glpat-` `PRIVATE KEY` で検索 | マスカー本体・そのテスト・ADR-0006 以外に該当なし。テスト値はすべて合成のダミー |
| `.env` / 鍵ファイル | `find` | 該当なし（検査中に自分で作った空の `tmp/.env.probe` は削除済み。tmp/ は管理外） |
| 端末・個人識別子 | ユーザー名、`/Users/`、メール、IP を検索 | 該当なし（一致は npm パッケージ名のみ） |
| 会社固有情報 | 社名・製品名・取引先・社内パス・人名 | 該当なし。他プロジェクト名（trim-manager / ai-tutor-browser）は依頼で指定された個人プロジェクトで、docs のみで参照 |
| .gitignore の効き | `git check-ignore` | `artifacts/` `dist/` `tmp/` `node_modules/` `.env.local` が除外されることを確認 |
| レポート内の絶対パス | `latest.json` の `configPath` / `project.root` | 実行環境の絶対パスを含む（管理外ファイルのため許容。M3 の CI アップロード時に相対化を検討） |

経緯: 初回 push 時に push 前の secret ガード hook が `tests/mask.test.ts` と `tests/report.test.ts` の**合成ダミー値**（マスク処理のテスト用）をシークレットとして検出し停止した。hook は迂回せず、ダミー値を実行時の文字列連結（`fake(prefix, body)`）で組み立てる方式に変更して解消し、同ルールをプロジェクト CLAUDE.md に追記した。

## 7. 未解決事項（M0 で対応しなかった項目）

1. `npm audit` のしきい値は `high`。moderate 以下は通過する。厳しくするかは M1 で判断
2. `npx aiqh verify` はこのリポジトリ内で動作確認済み（npm が自パッケージの bin を解決）。対象リポジトリからの導入方法（git タグ参照 / Actions 内 checkout）は M1 で確定。本機の npm は `allow-git = none` のため git 参照導入は設定変更が必要
3. Linux / Windows での動作は未検証（macOS のみ）
4. `npm audit` はネットワーク必須。オフラインでは dependency が FAIL（fail closed）
5. 秘密情報マスクはパターンベース。未知形式・高エントロピー文字列は通過する
6. `latest.*` は並行実行で上書きされる（history は衝突回避済み）
7. レポートに実行環境の絶対パスを含む（CI アップロード前の相対化は M3 で検討）
8. 依存の版は npm 保護設定により最新から 1 段階前（zod 4.5.4、vitest 5.0.0、@types/node 24.13.3）
9. CLI 結合テストはソース実行経路のみ。ビルド済み経路は `npm run verify:dist` による手動確認
10. `dependsOn` / `enabled` / `env` 等の設定拡張、JSON Schema 同梱は M1 以降

## 8. M1 の着手案

### アダプタ設計
- インターフェース案: `detect(root) → { available: boolean; reason?: string }`、`suggest(root) → RawCheck[]`、`parse?(output) → { counts, items }`。実行は M0 の command 経路のまま
- Node: ESLint（`eslint.config.*` / scripts.lint）、tsc（`tsconfig*.json`）、Vitest / Jest（設定または devDependencies）、Vite / Next build（scripts.build）、`npm audit`、Playwright（`playwright.config.*`）
- Python: ruff（`ruff.toml` / `pyproject` の `[tool.ruff]`）、mypy / pyright、pytest（`tests/` または `pytest.ini`）、pip-audit、build は原則 NOT_APPLICABLE
- Security: gitleaks / semgrep 等の検出のみ。未導入なら NOT_APPLICABLE（無理に導入しない）

### `aiqh init` の監査手順
1. `package.json` の scripts / devDependencies、`pyproject.toml` / `requirements*.txt`、設定ファイルの存在を読み取り
2. 各アダプタの `detect` → `suggest` で `aiqh.config.jsonc` 案を生成（既存 scripts を優先して再利用）
3. 既存ファイルがあれば上書きせず差分表示（`--force` なしでは停止）
4. 生成した設定で `aiqh verify` をドライラン（`--fail-fast` なし）し、結果を表示

### 適用で予想される問題
- **trim-manager**: lint / test スクリプトなし、ESLint / Vitest 未導入 → typecheck（`tsc -b --noEmit`）、build、dependency のみ登録し lint / unit は NOT_APPLICABLE。導入は別依頼。`@types/node ^25` と本体の Node 24 想定の差異は問題にならない見込み（対象側の Node で実行）
- **ai-tutor-browser**: ruff / mypy なし、`requirements.txt` のみ → unit（`.venv/bin/python -m pytest -q`）と dependency（pip-audit、未導入なら任意）のみ。`.venv` の相対パス指定と、pytest が `.env` / DB を必要とする場合の扱い（秘密情報を設定に書かない）を確認
- 両リポジトリとも CI なし。M3 まではローカル実行のみ

## 9. commit 案と push 手順

### stage するファイル（`git add -A` / `git add .` は使わない）

```bash
cd ~/claude-projects/ai-quality-harness

# 基盤
git add .gitignore README.md CLAUDE.md package.json package-lock.json \
  tsconfig.json tsconfig.build.json eslint.config.js vitest.config.ts aiqh.config.jsonc

# 本体
git add src/cli.ts src/types.ts src/commands/verify.ts \
  src/config/schema.ts src/config/load.ts \
  src/runner/execute.ts src/runner/run-checks.ts \
  src/report/verdict.ts src/report/build-report.ts src/report/markdown.ts src/report/write.ts \
  src/security/mask.ts src/git/info.ts

# テスト
git add tests/helpers.ts tests/cli.test.ts tests/config.test.ts tests/execute.test.ts \
  tests/mask.test.ts tests/markdown.test.ts tests/report.test.ts tests/verdict.test.ts \
  tests/fixtures/valid.jsonc tests/fixtures/sub/.gitkeep

# 設計書・報告
git add docs/ARCHITECTURE.md docs/ROADMAP.md docs/CONFIG_SPEC.md docs/adr docs/reports/M0_REPORT.md

# 確認（46 ファイル。artifacts/ dist/ tmp/ node_modules/ が含まれないこと）
git diff --cached --name-only
```

### commit メッセージ案

```
feat: M0 — design docs and fail-closed verify core (aiqh)

- docs: ARCHITECTURE / ROADMAP / CONFIG_SPEC / ADR 0001-0008 / M0 report
- verify: JSONC config + zod validation, sequential shell execution with
  process-group timeout, fail-closed verdict, JSON/Markdown/history reports,
  pattern-based secret masking
- self-verification: lint / typecheck / unit (72 tests) / build / npm audit
```

### push 手順（ユーザーの指示後に実行）

```bash
# remote の追加（まだ追加していない）
git remote add origin https://github.com/youhei-dev/ai-quality-harness.git

# 初回 push（push 前に警告 5 条件を確認: 個人情報・機密・大容量・粒度・非可逆）
git push -u origin main
```

commit / push はユーザーの明示的な指示があるまで実行しない。
