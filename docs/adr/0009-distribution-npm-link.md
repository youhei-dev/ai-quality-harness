# ADR-0009: M1 の配布は `npm link` によるローカル配布とする

- 状態: 採用（M3 で再評価）
- 日付: 2026-09-18。注記: 2026-10-16（v0.9.0。M3 での再評価の結果。下の「注記（v0.9.0）」）

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

## 注記（v0.9.0: M3 での再評価の結果）
- 2026-10-16 の人間の決定で、**CI での配布は ADR-0031 の案 D** にした: 再利用ワークフロー `.github/workflows/verify.yml` が、自分と同じ commit の aiqh のソースを checkout して使う。呼び出す側は、そのワークフローを 40 桁の commit SHA で固定する
- **手元は、この ADR のとおり `npm link` のまま**。対象の `package.json` に依存は足さない
- 上の「M3 でローカル導入に切り替える際の論点」のうち、「CI では `npm link` が使えない」と「対象ごとに version を固定できない」は、CI の上では ADR-0031（呼び出す側の SHA）で解いた。公開パッケージ（npm）・git 依存・GitHub Releases の tarball は採らなかった（理由は ADR-0031 の代替案）。手元で対象ごとに版を固定することは、引き続きできない
- この ADR の文は、書いた時点の記録として変えない
