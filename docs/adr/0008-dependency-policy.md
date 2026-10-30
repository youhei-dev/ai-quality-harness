# ADR-0008: 依存パッケージは最小限・バージョン固定とする

- 状態: 採用
- 日付: 2026-09-15。追記: 2026-10-30（v0.17.1。`package-lock.json` のルートの version は npm が書いた値のまま、リリースで `package.json` と揃える。下の「追記（v0.17.1）」）

## 文脈
Quality Gate のツール自身が多数の依存を持つと、Dependency Scan で自分が引っかかり、
サプライチェーンの攻撃面も増える。

## 決定
- 実行時依存は 3 つに限定する: `commander`（CLI）、`jsonc-parser`（設定読込）、`zod`（スキーマ検証）
- 子プロセス、ファイル、git 情報取得は Node 標準 API のみで実装する
- `package.json` は `~`（パッチのみ）で固定し、`package-lock.json` を管理する
- 依存の追加は停止ポイントで承認された一覧の範囲だけ。追加が必要になったら停止して報告する
- `npm audit --audit-level=high` を自己 verify の必須 check にする

## 根拠
- 上記 3 つはいずれも自身の依存が 0 で、広く使われている
- `execa` / `tsx` / `yaml` 等は Node 標準や採用済み形式で代替できる

## 代替案
- 依存ゼロ（`util.parseArgs` + 自前 JSONC + 自前検証）: 可能だが、サブコマンドが増える M2 以降で
  CLI と検証の自前実装が負債になる

## 影響
- `npm audit` はレジストリへの通信を伴う。オフラインでは FAIL になる（fail closed）

## 追記（v0.17.1: `package-lock.json` のルートの `version`。人間の決定 B3-Q9・B3-D-Q9。2026-10-30）

### 文脈
- `package-lock.json` の最上位の `version` と、ルートの項（`packages[""]`）の `version` は、npm が lock を書き換えるとき（`npm install`・`npm update`・`npm audit fix`・`npm version`）に、`package.json` の今の版に揃えられる
- ルートの version は、M0 で 0.1.0、v0.5.35 のころの依存の更新で npm が 0.5.35 に揃えた。v0.13.2・v0.14.1 の依存の更新では、npm が書いた値を手で 0.5.35 に戻した。その理由は「前からの食い違いは、その版では直さない」（その版の範囲を、承認した依存の変更に絞るため）で、0.5.35 であることに意味がある、という記録は無い
- batch3 の設計の段の実測（範囲の中の `npm update` の後。3 つの形）:
  - A（`package.json` 0.17.1、ルート 0.5.35）・B1（0.17.0、0.17.0）・B2（0.17.1、0.17.1）のどれでも、`npm ci` は exit 0・警告なしで lock を書き換えず、入る `node_modules` は同じ（133 の package.json の名前と版が一致）。`npm pack` の中身（4 ファイル）に lock は入らず、tarball の版は `package.json` の版。lint・型検査・全テストの結果も同じ
  - 違いは 1 つだけ: A の lock は、その後の `npm install` でルートの 2 行が書き直される（npm が同じ lock を作り直せない）。B1・B2 は書き直されない
  - `npm version 0.17.1 --no-git-tag-version` は、`package.json` の `version` の 1 行と、lock のルートの 2 行だけを変え、commit もタグも作らない（npm 11.18.0）

### 決定（人間の決定 2026-10-30: B3-D-Q9 = B、B3-D-Q15 = A。独立レビュー R2 は B を支持〈R1 の B3-D-R1-003 は「解消」〉）
- ルートの 2 つの `version` は、**npm が書いた値のままにする**（手で戻さない）。依存の commit では、npm が書いた値（そのときの `package.json` の版）をそのまま commit する
- リリースの commit では、`npm version <新しい版> --no-git-tag-version` で、`package.json` の `version` と lock のルートの 2 つを同時に上げる（手で `package.json` だけを書き換えない）。ほかの欄が変わっていないことを、lock の全欄の比べで確かめる
- 守り: `tests/regression-m2-1-r2-008-version-consistency.test.ts` に、lock のルートの 2 つの `version` が `package.json` の `version` と同じであることを足す（B3-D-Q15）。リリースの commit で揃え忘れると、その commit の検証で落ちる
- v0.17.1 で揃える: 依存の commit で npm が 0.17.0 にし（`package.json` は 0.17.0 のまま）、release の commit で `npm version 0.17.1 --no-git-tag-version` により両方が 0.17.1 になる

### 理由
- 0.5.35 を守る理由が記録に無く、実測で、ルートの version は `npm ci`・入る依存・配布物・テストに影響しなかった
- npm が自分で作り直せる lock になる（A では、`npm install` のたびに 2 行の差分が出て、手で戻す作業が要る）
- 手の作業（npm の出力の書き換え）が無くなる。`package.json` と lock の版が食い違わない

### 既知の限界
- リリースの commit ごとに lock のルートの 2 行が変わる（release の commit に `package-lock.json` が入る）。依存の木（版・`resolved`・`integrity`）は変わらない
- 過去の版の CHANGELOG の「`package-lock.json` の `version` は 0.5.35 のまま」は、書いた時点の記録として残す
- `npm version` の振る舞いは手元の npm 11.18.0 で確かめた。CI の npm（11.8.0 の見込み）では打たない（CI は `npm ci` だけ）
- `npm version` は `preversion`・`version`・`postversion` の script を走らせる（このリポジトリには無い。手元の設定 `ignore-scripts=true` でも走らない）
