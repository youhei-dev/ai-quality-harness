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
  対応範囲が `<6.1.0` であり、対象リポジトリ（適用先 A〈node:test〉）も 5.9 系のため
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
  - 注記（batch5 の記録の PR〈版なし。2026-11-08〉。batch5 の C-19 の一部。人間の決定 B5-Q10 = A）: 2026-11-08（npm の registry の読み。取得 2026-11-08T01:43:37Z）の事実: typescript-eslint 8.72.1 と `@typescript-eslint/typescript-estree` 8.72.1 の peer の範囲は `typescript >=4.8.4 <6.1.0`。TypeScript の最新は 7.0.2（2026-07-08 公開。ほかに 7.1.0-beta）で、**TypeScript 7 は、このリポジトリの lint（typescript-eslint）の peer の範囲の外**。TypeScript 6.0.3（2026-04-16 公開）は範囲の中。したがって「周辺ツールの対応が追いついていない」は、2026-11-08 の時点でも、少なくとも typescript-eslint について当たっている。5.9 系に固定する決定（上の「決定」の 1 つめの箇条）は変えない
    - 確かめていないこと: TypeScript の公式の 7.0 の発表の中身（周辺ツールの対応の記述）と、typescript-eslint の文書の対応する TypeScript の版の説明（Dependency Versions）は読んでいない。typescript-eslint 以外の周辺ツール（vitest・vite の型の扱い、エディタ）の TypeScript 7 の対応も見ていない。これらを読んで閉じるかは、外の文書を読む別の依頼（C-07 の残り・C-51 と同じ扱い）で決める
    - TypeScript 6 系に上げるかは、この注記では決めない（範囲の中だが、ADR-0001 の決定は 5.9 系。上げるなら依存の更新として別に決める）

## 影響
- Node 24 未満では動作しない（`engines` に明記）
- tsx 等のトランスパイラ依存が不要になる一方、enum / namespace / パラメータプロパティは使えない
