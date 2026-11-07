# ADR-0008 の追記の案（最終。v0.18.1: 範囲の外の開発用の依存の更新）

対象: `docs/adr/0008-dependency-policy.md` の末尾に足す節。日付の行に「追記: 2026-11-xx（v0.18.1。範囲の外の開発用の依存）」を足す。B4-D-Q1 = A（確定。`@types/node` は上げない）。**R1 からの変更**: B を選んだときの差し替えの文を消した。moderate の勧告を受け入れる理由と、CI での再確認を足した（R1 の問い 2）。

---

## 追記（v0.18.1: 範囲の外の開発用の依存を上げる。人間の決定 B4-Q5 = B、B4-D-Q1 = A）

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
