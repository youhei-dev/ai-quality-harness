# ai-quality-harness (`aiqh`)

AI 駆動開発のための **fail-closed な Quality Gate 実行基盤**。

Claude Code などの実装 AI と、独立したレビュー AI の両方が「問題ありません」と言っても、
それだけでは合格にしません。Lint / 型チェック / ユニットテスト / ビルド / セキュリティスキャン /
依存関係スキャン / E2E といった **機械的に再現可能な結果** だけを判定の根拠にし、
必須チェックが 1 つでも失敗すれば `VERIFY FAILED`（終了コード非ゼロ）で止めます。

> **English summary** — `aiqh` is a small TypeScript CLI that runs a repository's quality checks
> from a single JSONC config, fails closed (any required failure ⇒ non-zero exit), writes JSON +
> Markdown reports with secret masking, and is designed to be applied to itself first.
> Only milestone 0 (the `verify` core) is implemented so far; see `docs/ROADMAP.md`.

## 設計思想

```
人間 → 実装AI → 独立レビューAI → 自動 Quality Gate（aiqh verify） → 人間の業務確認 → 本番
```

- **機械的根拠**: AI の回答は判定材料にしない。テスト・型・静的解析・ビルド・スキャンの結果だけを使う
- **fail closed**: 必須チェックの失敗・タイムアウト・起動失敗・設定不正はすべて非ゼロ終了
- **自己適用**: このリポジトリ自身が最初の適用対象。自分の verify を通せない状態でマイルストーンを終えない
- **設定に秘密を置けない**: 設定はコマンドと構造化フィールドのみ。レポートはパターンマスクを通してから保存

詳細は `docs/ARCHITECTURE.md`、判断の根拠は `docs/adr/` を参照してください。

## 現在の状態

マイルストーン 0（M0）完了時点。実装済みなのは `aiqh verify` の中核です。

| 機能 | 状態 |
|---|---|
| `aiqh verify`（設定読込・順次実行・fail closed・JSON/Markdown レポート・秘密情報マスク） | M0 実装済み |
| チェックアダプタ（lint / typecheck / unit / build / security / dependency / e2e の検出と推奨設定） | M1 予定 |
| `aiqh init`（対象リポジトリの監査と設定生成） | M1 予定 |
| `aiqh review-packet` / `aiqh review-import`（独立レビューAI とのループ） | M2 予定 |
| GitHub Actions 再利用ワークフロー | M3 予定 |
| 履歴 DB・ローカルダッシュボード | M4 予定 |

## 必要環境

- Node.js 24 以上（開発時はネイティブ TypeScript 実行を使うため）
- 自己 verify の `package` チェック（配布 smoke test）は `npm pack` した tarball を一時ディレクトリへ
  `npm install --prefer-offline` するため、実行時依存 3 つ（commander / jsonc-parser / zod）が **npm キャッシュにあるか、
  レジストリへ到達できる**必要があります。オフラインかつキャッシュなしの環境ではこのチェックは FAIL になります
  （fail closed）。`npm audit` も同様にレジストリへの到達が必要です

## 対応プラットフォーム（Supported Platforms）

| プラットフォーム | 状態 |
|---|---|
| macOS（POSIX） | 対応。M0 の検証環境 |
| Linux（POSIX） | 対応（設計上）。CI での検証は M3 で追加 |
| Windows | M0 対象外。プロセスグループ制御と realpath 判定が POSIX 前提のため |

## 信頼境界（Trust Boundary）

`aiqh.config.jsonc` は**リポジトリ所有者が管理する信頼された入力**です。設定に書いたコマンドはそのまま
shell で実行されます（`package.json` の scripts と同じ信頼レベル）。aiqh が保証する fail closed は
「現在読み込んだ設定に対して」のものであり、**改変された設定や弱体化されたスクリプトに対する独立性は
提供しません**。設定ファイルの変更はコードレビューと Branch Protection で守ってください。
設定改変への対策候補は `docs/ROADMAP.md`（M3 / M4）を参照してください。

## 使い方

### このリポジトリ自身を検証する

```bash
# 依存関係の導入
npm install

# 自己 verify（src/ を Node のネイティブ TypeScript 実行で直接起動）
npm run verify

# ビルド済み JS（配布物）で同じことを行う
npm run verify:dist
```

結果は `artifacts/verification/` に出力されます（git 管理外）。

```
artifacts/verification/
  latest.json            # 機械可読（schemaVersion 1）
  latest.md              # 人間・レビューAI 向け
  history/<UTC timestamp>.json
```

### 対象リポジトリで使う（M1 で確定予定）

対象リポジトリのルートに `aiqh.config.jsonc` を 1 枚置きます。

```jsonc
{
  "version": 1,
  "project": { "name": "my-app", "type": "node" },
  "defaults": { "timeoutSec": 600 },
  "checks": [
    { "name": "lint",       "kind": "lint",       "command": "npm run lint" },
    { "name": "typecheck",  "kind": "typecheck",  "command": "npx tsc --noEmit" },
    { "name": "unit",       "kind": "unit",       "command": "npm test" },
    { "name": "build",      "kind": "build",      "command": "npm run build", "timeoutSec": 900 },
    { "name": "dependency", "kind": "dependency", "command": "npm audit --audit-level=high" }
    // security / e2e を登録しなければ NOT_APPLICABLE として報告される
  ]
}
```

```bash
# 配布物は dist/cli.js（package.json の bin）。導入方法は M1 で確定する
npx aiqh verify
```

仕様は `docs/CONFIG_SPEC.md` を参照してください。

## CLI

```
aiqh verify [options]
  -c, --config <path>      設定ファイル（既定: ./aiqh.config.jsonc）
      --cwd <dir>          設定ファイルを探す基準ディレクトリ
  -o, --output-dir <dir>   レポート出力先の上書き
      --fail-fast          必須チェックの最初の失敗で停止（以降は SKIPPED）
  -v, --verbose            失敗チェックの出力を全文表示
```

終了コード（最終行の文言と 1 対 1）: `0` = `VERIFY PASSED`、`1` = `VERIFY FAILED`、`2` = `VERIFY ERROR`（設定エラー・レポート書込エラー・内部エラー）。

## 開発

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build       # tsc → dist/
```

`npm run verify` は上記に `npm run smoke:package`（配布 smoke test）と `npm audit --audit-level=high` を加えた
6 つを順に実行します。

```bash
# 配布 smoke test 単体（npm pack → 一時ディレクトリへ install → npx --no-install aiqh verify）
npm run smoke:package
```

Ctrl+C（SIGINT）/ SIGTERM で中断すると、実行中のチェックのプロセスグループへ SIGTERM → 最大 5 秒 → SIGKILL の順で
後始末してから、それぞれ終了コード 130 / 143 で終了します。

## リポジトリ構成

```
src/                 CLI 本体（TypeScript, ESM）
tests/               Vitest（ユニット + CLI 結合テスト）
docs/                ARCHITECTURE / ROADMAP / CONFIG_SPEC / adr / reports
aiqh.config.jsonc    このリポジトリ自身の検証設定
artifacts/           verify 出力・レビューパケット（git 管理外）
```

## ライセンス

未定（Public 化の際に決定します）。
