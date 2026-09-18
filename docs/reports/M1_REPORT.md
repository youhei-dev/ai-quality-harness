# M1 報告 — チェックアダプタ、`aiqh init`、Security Scan、2 リポジトリへの適用

- 日付: 2026-09-18
- 基準: M0 最終版 v0.1.7（commit b49dddb）。M1 のタグは `v0.2.0`（commit SHA はタグ付与後に `git rev-list -n1 v0.2.0` で確認し CHANGELOG / 最終報告に記載）
- 対象リポジトリの固有情報（パス・行番号・設定値・脆弱性の詳細）は本書に書かない。件数と分類のみ。詳細は Downloads に保存した最終報告

## 1. M1 で作ったもの

| 領域 | 内容 |
|---|---|
| アダプタ（`src/adapters/`） | `Adapter.detect(ctx)` が検出と推奨だけを返す。Node 7（eslint / tsc / vitest / jest / build / npm・pnpm・yarn audit / playwright）、Python 7（ruff / mypy / pyright / pytest / build 非該当 / pip-audit / playwright）、内蔵 1（security）。`RepoContext` は読み取り専用で `.env*` を読まない。`OutputParser` は型のみ（M2） |
| `aiqh init` | 監査表と `aiqh.config.jsonc` 案（コメント付き JSONC）を表示。`--write`（既存は `--force` なしで拒否）、`--write-gitignore`、`--write-scripts`（未定義キーのみ）、`--json`。`aiqh` の PATH 解決元と version を表示。`$schema` は対象から解決できる場合のみ。検出 0 件なら exit 2 |
| `aiqh security-scan` | git 管理下ファイルの秘密情報パターン、追跡 `.env` 系、`.gitignore` の `.env` / `.env.*` 欠落。値は出力しない。未走査分類（bearer / basic / key-value）と理由を必ず表示。正規マーカー `[REDACTED:<category>]` は除去してから走査。exit 0 / 1 / 2 |
| パターン共有（R-012） | `src/security/patterns.ts` に一本化。masker は導出、scanner は `scan: true` の分類。合成コーパスを両方に入力する互換テスト |
| JSON Schema | `schema/aiqh.config.schema.json`（zod から生成、`npm run schema:gen`、テストで同期を固定、`files` に同梱） |
| 配布 | `npm link`（ADR-0009）。本体 `npm run build && npm link` → 対象で `aiqh` |
| 自己適用 | `aiqh.config.jsonc` に `security`（`npm run security`）を追加 → 7 チェック。Security は NOT APPLICABLE → PASS |
| docs / ADR | ROADMAP（M1 完了、M2 に key-value 走査＋`security.allow`）、ARCHITECTURE、CONFIG_SPEC、README、ADR-0009 / 0010 / 0011、CHANGELOG v0.2.0、CLAUDE.md（version とタグの一致ルール） |

## 2. 検証

- テスト先行: fixtures 5 種と 8 テストファイルを先に書き、現状コードで全 FAIL を記録してから実装。実装後の自己スキャンで見つけた「マーカーが URL 認証情報の形に一致する」問題も、テスト → FAIL → 修正の順で対応
- テスト: 33 ファイル 197 件（M0 の 148 件に退行なし）、10 回連続 PASS
- 自己 verify: `npm run verify` / `npm run verify:dist` とも VERIFY PASSED（7 チェック）。リンク済み `aiqh verify` も PASSED
- `package.json` version 0.2.0（`aiqh --version`、package smoke test の照合とも 0.2.0）

## 3. 対象 2 リポジトリへの適用（件数のみ。対象では commit / push をしていない）

| 対象 | 書き込んだもの | verify の結果 |
|---|---|---|
| Node 系（React + Vite、tsconfig 参照構成、lint / test 未導入） | `aiqh.config.jsonc`（typecheck / build / security / dependency）、`.gitignore` に `artifacts/`、`package.json` scripts に `verify` | typecheck PASS、build PASS、**security FAIL**（`.gitignore` の `.env.*` 欠落 1 件。既存由来）、**dependency FAIL**（`npm audit`: 既存依存の脆弱性 9 件。既存由来）。lint / unit / e2e NOT APPLICABLE |
| Python 系（FastAPI + venv、pytest のみ） | `aiqh.config.jsonc`（unit / security）、`.gitignore` に `artifacts/` | unit PASS、**security FAIL**（テスト内の anthropic 分類 17 件＝うち 5 件は人間確認済みダミー、12 件は未確認。`.gitignore` の `.env.*` 欠落 1 件。既存由来）。lint / typecheck / build / dependency / e2e NOT APPLICABLE |

既存由来の失敗は報告のみ。`.gitignore` の追加、テスト内ダミー値の連結方式化、依存の更新は人間が別作業として判断する。

## 4. M2 への持ち帰り

- key-value 分類の走査（誤検出抑制の設計）と `security.allow`（例外指定）
- 出力パーサの実装（vitest / pytest / eslint / npm audit）
- 配布のローカル導入化（ADR-0009 の論点）は M3
