# ADR-0009: M1 の配布は `npm link` によるローカル配布とする

- 状態: 採用（M3 で再評価）
- 日付: 2026-09-18

## 文脈
対象リポジトリから `aiqh` を使う経路が必要。本機の npm 設定は `allow-git=none`（git 依存の導入不可）、`min-release-age=7`
（レジストリへ公開しても 7 日間は導入不可）。対象リポジトリの `package.json` を汚したくない。

## 決定
- 本体で `npm run build && npm link`（`~/.local/bin/aiqh -> …/ai-quality-harness/dist/cli.js`）。対象では PATH の `aiqh` を使う
- 対象の `package.json` に依存は追加しない。`aiqh.config.jsonc` の `security` チェックは `aiqh security-scan` として PATH に依存する
- `aiqh init` の監査レポートは、`aiqh` を PATH のどこから解決したか（リンクのパス、実体のパス、version）を表示する
- 解除は `npm unlink -g ai-quality-harness`。`bin` はビルド済み `dist/cli.js`（ADR-0001）

## M3 でローカル導入に切り替える際の論点
- 対象ごとに version を固定できない（PATH の `aiqh` は常に本体の最新ビルド）。再現性のためには対象の lockfile で固定したい
- CI（GitHub Actions）では `npm link` が使えない。Actions 内で本体を checkout してビルドするか、公開パッケージが必要
- 公開パッケージにすると `min-release-age=7` により本機では 7 日遅れで導入される。名前空間（`ai-quality-harness` / `aiqh`）の確保
- `security` チェックのコマンドを `npx --no-install aiqh security-scan`（ローカル導入）へ切り替える場合、既存の生成済み config の移行手順が要る
- `$schema` はローカル導入があれば `./node_modules/ai-quality-harness/schema/…` を書けるようになる

## 代替案
- git 依存（`github:youhei-dev/ai-quality-harness#v0.2.0`）: `allow-git=none` で不可
- 即時 publish: `min-release-age=7` で本機に入らない。Public 化の判断（M3）が先
