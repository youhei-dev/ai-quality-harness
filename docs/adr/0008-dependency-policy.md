# ADR-0008: 依存パッケージは最小限・バージョン固定とする

- 状態: 採用
- 日付: 2026-09-15。追記: 2026-10-30（v0.17.1。`package-lock.json` のルートの version は npm が書いた値のまま、リリースで `package.json` と揃える。下の「追記（v0.17.1）」）、2026-11-07（v0.18.1。範囲の外の開発用の依存と `@types/node`、moderate の勧告の受け入れ。末尾の「追記（v0.18.1）」）

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

## 追記（v0.18.1: 範囲の外の開発用の依存を上げる。人間の決定 B4-Q5 = B、B4-D-Q1 = A。設計〈最終〉§2.5）

### 文脈

- batch4 の着手前の見直し（2026-11-07）: `npm outdated` の Wanted はすべて Current と同じで、範囲の中の更新先は無かった。範囲の外には、7 日を満たす開発用の新しい版があった。実行時の依存 3 つ（commander・jsonc-parser・zod）は、範囲の中でも外でも最新
- `npm audit` の moderate 10 件（minimatch の GHSA-g3hv-75wg-m249。開発用の lint の系統）は、どの更新でも消えない（依存元の最新版がまだ minimatch 10 系を求める）。今回の更新は勧告への対応ではなく、範囲を最新に近づける保守
- 人間の決定（2026-11-07）: 範囲の外の開発用の依存を v0.18.1 で上げる（B4-Q5 = B）。ただし `@types/node` は上げない（B4-D-Q1 = A）

### 決定

1. 上げるもの（`package.json` の範囲は今までと同じ `~`）:
   - eslint `~10.10.0` → `~10.14.0`（10.14.0 は 2026-10-30T14:12Z 公開）
   - typescript-eslint `~8.70.0` → `~8.72.1`（2026-10-26 公開）
   - vite `~8.2.4` → `~8.3.5`（2026-10-21 公開。vitest 5.0.5 の peer は `^6.4.0 || ^7.0.0 || ^8.0.0`）
2. 上げないもの: `@eslint/js`（10.0.1 が最新）、typescript（5.9 系の方針。ADR-0001）、vitest（5.1.0 は 2026-11-09T16:12Z まで 7 日を満たさない）、`@types/node`（下の 4）
3. 確かめ（設計の段に使い捨ての作業場所で実測し、実装の版の各 commit でもう一度）:
   - `npm install` が `min-release-age=7`・`ignore-scripts=true` の下で通る
   - lock の全欄の比べ: 変わるのは開発用の項目の版だけ（設計の段の実測で 33 項目。追加・削除 0、`dev` の印は変わらず、実行時の依存 3 つの項目は同じ。ルートの `version` は npm が書いたまま〈v0.17.1 の追記〉）
   - `npm audit --audit-level=high` が 0、moderate の件数が変わらない（10）
   - typecheck・lint（新しい指摘 0）・全テスト・`npm run verify`・`npm run verify:dist`
4. **`@types/node` は、自己 CI と手元が実行する Node の版（`ci.yml` の `node-version`、今は 24.13.1）を超えて上げない**。型が実行の Node より新しいと、実行の Node に無い API を使うコードが型検査を通り、テストが通らない道で気づけない。Node の版を上げるときに、型も同じ版の系に上げる
5. **moderate の勧告を受け入れる理由と、再確認**: 10 件は、開発用の lint の系統（eslint・typescript-eslint とその依存の minimatch 10.2.6）だけで、配布物の実行時の依存には入らない（再利用ワークフローは `npm ci --omit=dev`）。直った版（minimatch 11.0.1）を、依存元の最新版がまだ許さない。自己 verify の dependency の check は `npm audit --audit-level=high` で、moderate では落ちない。各 commit の worktree の検証、PR の run、main の run で、high が 0 であることと moderate の件数を記録する。依存元が minimatch 11 を許したら、その時の版で上げる（B4-Q5 の C の考え）

### 既知の限界

- `engines` の下限（`>=24.0.0`）より新しい API は、24.13 の型でもすでに許されている。型で守れるのは「CI の Node」までで、`engines` の下限までではない
- moderate の勧告は、上の 5 の理由で受け入れている。消えるまで、各版の記録に件数が残る

### 適用先への影響

- 無い見込み: 再利用ワークフローは aiqh の依存を `npm ci --omit=dev` で入れる（`.github/workflows/verify.yml:107`）ので、開発用の依存は適用先の run に入らない。lock の変更は開発用の項目だけ
