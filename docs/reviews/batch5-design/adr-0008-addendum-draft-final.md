# ADR-0008 の追記の案（最終。v0.18.3: 開発用の依存〈vitest 5.1.0 と、範囲の中の vite 8.3.6〉と、見張りにするもの）

対象: `docs/adr/0008-dependency-policy.md` の末尾（`:85` の後。行番号は 2026-11-08 の `d4f1697` の時点）に、新しい追記の節を足す。人間の決定 B5-Q2 = A、B5-D-Q7 = A（R1 の条件つき）。設計〈最終〉§2.1。R2 で決定 3・4 を直した（B5-D-R1-001: 版の到達を合否の条件にした）。最終: R2 の案と同じ中身（参照の書き方だけ直した）。

## 追記（v0.18.3: vitest を範囲の外へ、vite を範囲の中で上げる。commander 15.1.0 は見張り。人間の決定 B5-Q2 = A。設計〈最終〉§2.1）

### 文脈

- batch5 の範囲の洗い出し（npm の registry の読み。取得 2026-11-08T01:43:37Z）: 開発用の vitest は範囲 `~5.0.3`（入っているのは 5.0.5）の外に 5.1.0（2026-11-02T16:12Z 公開）、vite は範囲 `~8.3.5`（v0.18.1 の追記で決めた範囲。入っているのは 8.3.5）の中に 8.3.6（2026-11-05T05:40Z 公開）があった。どちらも、それより新しい版は出ていない
- 実行時の依存の commander は、範囲 `~15.0.0`（入っているのは 15.0.0）の外に 15.1.0（2026-11-07T01:27Z 公開。`engines.node >=22.12.0`）が出た。jsonc-parser・zod は最新
- `@types/node` は 24.13.6（24.13.x の最新）。minimatch は 10.2.6 のままで、勧告 GHSA-g3hv-75wg-m249（moderate 10 件）は、依存元（eslint 10.14.0 `^10.2.6`、`@eslint/config-array` 0.23.5 `^10.2.4`、`@typescript-eslint/typescript-estree` 8.72.1 `^10.2.2`）の最新が minimatch 11 系を許さないので、どの更新でも消えない
- 人間の決定（2026-11-08）: vitest 5.1.0（範囲を `~5.1.0` に）と vite 8.3.6（範囲は変えず lock だけ）を v0.18.3 で上げる。着手は、2 つとも公開から 7 日を満たす 2026-11-12T05:40Z（JST 11-12 14:40）以降。commander 15.1.0 は見張り、`@types/node` は 24.13.6 のまま、minimatch は依存元待ち（B5-Q2 = A）

### 決定

1. 上げるもの:
   - vitest `~5.0.3` → `~5.1.0`（5.1.0 は範囲の外。`npm install --save-dev vitest@~5.1.0`）
   - vite は範囲 `~8.3.5` のまま、lock だけを 8.3.6 に（`npm update vite`。`package.json` は変えない）
   - vitest 5.1.0 の peer の vite は `^6.4.0 || ^7.0.0 || ^8.0.0`（範囲の洗い出しの読み）で、vite 8.3.6 と合う
2. 上げないもの:
   - **commander 15.1.0（見張り）**: 実行時の依存（配布物の `dependencies`。再利用ワークフローの `npm ci --omit=dev` にも入る）なので、上げると配布物の中身が変わり、適用先が呼び出しの SHA を上げたときに適用先の aiqh が変わる（人間の決定 H11 の対象）。今は上げる理由（直し・勧告）が確かめられていない（changelog を読んでいない）。v0.18.3 と v0.18.4 は H11 を行わない（B5-Q3 = A）。上げるなら、公開から 7 日を満たす 2026-11-14T01:27Z 以降に、changelog を読み、実行時の依存の確かめ（ADR-0008 の決定）と H11 を伴う版で、別に決める
   - `@types/node`: 24.13.6 のまま（v0.18.1 の追記の決定 4: 自己 CI と手元の Node〈24.13.1〉を超えて上げない。24.13.x の最新でもある）
   - typescript: 5.9 系のまま（ADR-0001。TypeScript 7 は typescript-eslint の peer の外: ADR-0001 の注記〈v0.18.3〉）
   - minimatch: 依存元待ち（v0.18.1 の追記の決定 5 のとおり、moderate 10 件を受け入れたまま、各版の記録に件数を書く）
3. 確かめ（v0.18.3 の依存の commit の SHA 固定の worktree で。設計〈最終〉§2.1.3 の完了条件 D1〜D13）:
   - **着手時に版を固定する**: npm の registry を読み（`npm view vitest time dist-tags --json`・`npm view vite time dist-tags --json`。取得の時刻を記録）、5.1.0・8.3.6 が公開から 7 日を過ぎていること、どちらにもそれより新しい版が無いことを確かめる。新しい版が出ていたら、試しの前に止めて人間が選ぶ
   - **版の到達を合否の条件にする**（R2）: `package-lock.json` の `node_modules/vitest` が 5.1.0、`node_modules/vite` が 8.3.6、`npm ls vitest vite --depth=0 --json` の版が同じ、`package.json` の範囲が vitest `~5.1.0`・vite `~8.3.5` のまま。試しの worktree、release の branch の作業ツリー、依存の commit の SHA 固定の worktree の 3 か所で確かめる（CI の log には版が出ないので、CI の版は lock と `npm ci` の決まりに依る）
   - `npm install`・`npm update` が `min-release-age=7`・`ignore-scripts=true` の下で通る
   - `package.json` の差は vitest の範囲の 1 行だけ。lock の全欄の比べで、変わるのは開発用の項目の版だけ（追加・削除・`dev` の印の変化・実行時の依存 3 つの項目の変化が 0、ルートの `version` は npm が書いたまま〈v0.17.1 の追記〉）
   - `npm audit --audit-level=high` が 0、moderate の件数が 10 のまま
   - typecheck・lint（新しい指摘 0）・全テスト 3 回・`npm run verify`・`npm run verify:dist`
   - **golden fixture の 4 つの期待値（`tests/fixtures/report-golden/`）が 1 バイトも変わらない**（依存の更新で出力が動かない）。aiqh 自身の verify の端末の `parsed: vitest` の行の形が変わらない（vitest の出力パーサが 5.1.0 の要約を読める）。全テストの終わりの、上限に近いテストの reporter（`tests/support/near-limit-reporter.ts`）の行が出る
4. 1 つでも外れたら（版の不一致〈更新されていない・別の版・範囲の書き方の違い〉、着手時の新しい版、lint の新しい指摘、golden の差、`parsed: vitest` の形の変化、テストの失敗）、規則やテストを緩めて通さず、依存の commit を外して止め、人間が決める（B5-D-Q7 = A。版の不一致を停止の条件に含めるのは R1 の条件）

### 既知の限界

- vitest 5.1.0 の中身（changelog）は、設計の段では読んでいない（着手時に読む: 設計〈最終〉§2.1.3 の 3。R1 の案は §2.1.2 と書いていたが、changelog を読む手順は §2.1.3 にある）。設計の段では、5.1.0 を入れて試していない（`min-release-age=7` の待ちの中）
- commander 15.1.0 を見張りにする理由は「上げる理由が確かめられていない」ことで、15.1.0 に問題があると分かったからではない
- moderate の勧告は、v0.18.1 の追記の決定 5 の理由で受け入れたまま

### 適用先への影響

- 無い見込み: vitest・vite は開発用の依存で、再利用ワークフローは aiqh の依存を `npm ci --omit=dev` で入れる（`.github/workflows/verify.yml:107`）。v0.18.3 は H11 を行わない（適用先 A・B の呼び出しは v0.18.2 のまま）
