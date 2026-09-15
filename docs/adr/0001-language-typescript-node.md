# ADR-0001: 本体の言語を TypeScript（Node）にする

- 状態: 採用
- 日付: 2026-09-15

## 文脈
ハーネスは Node 系（React/Vite、Next.js）と Python 系（FastAPI、bot）の両方に横断適用する。
将来 E2E に Playwright を使う。対象リポジトリへの配布は設定ファイルとワークフロー参照だけにしたい。

## 決定
本体は TypeScript（Node 24 系、ESM）で実装する。Python 系プロジェクトは設定ファイルから
`ruff` / `pytest` 等のコマンドを呼ぶ形で扱い、本体に Python 実装は持たない。

- TypeScript は 5.9 系に固定する。2026-09-15 時点の最新は 7.0.2 だが、typescript-eslint の
  対応範囲が `<6.1.0` であり、対象リポジトリ（trim-manager）も 5.9 系のため
- 開発時は Node 24 のネイティブ TypeScript 実行（型剥がし）で `src/cli.ts` を直接起動する。
  このため TypeScript の「消去可能な構文のみ」（`erasableSyntaxOnly`）に制限し、
  相対 import は `.ts` 拡張子付きで書き、ビルド時に `.js` へ書き換える（`rewriteRelativeImportExtensions`）
- 配布用のビルドは `tsc` で `dist/` に出力する。**`package.json` の `bin` は `dist/cli.js` を指す**。
  ネイティブ TypeScript 実行は開発・テスト時（`npm run verify`、Vitest からの CLI 起動）に限定し、
  対象リポジトリから使う配布物（M1 以降）はビルド済み JS を正とする。`npm run verify:dist` で
  ビルド済み JS による自己 verify も行える

## 根拠
- Playwright が Node 純正であり、E2E アダプタ（M1）で追加ランタイムが不要
- 対象プロジェクトに React/TypeScript があり、同じ言語で保守できる
- `npx` で配布でき、対象リポジトリに本体コードを置かなくてよい
- 型検査自体が Quality Gate の 1 つとして自己適用できる

## 代替案
- Python: 対象の半数が Python だが、Playwright と npm 配布の点で劣る。Python 側はコマンド呼び出しで十分
- Go / Rust の単一バイナリ: 配布は楽だが、対象リポジトリの開発者（TypeScript / Python）が保守しにくい
- TypeScript 7.0: ネイティブコンパイラで高速だが、周辺ツールの対応が追いついていない。M1 以降に再評価する

## 影響
- Node 24 未満では動作しない（`engines` に明記）
- tsx 等のトランスパイラ依存が不要になる一方、enum / namespace / パラメータプロパティは使えない
