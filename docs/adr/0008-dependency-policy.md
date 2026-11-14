# ADR-0008: 依存パッケージは最小限・バージョン固定とする

- 状態: 採用
- 日付: 2026-09-15。追記: 2026-10-30（v0.17.1。`package-lock.json` のルートの version は npm が書いた値のまま、リリースで `package.json` と揃える。下の「追記（v0.17.1）」）、2026-11-07（v0.18.1。範囲の外の開発用の依存と `@types/node`、moderate の勧告の受け入れ。末尾から 2 つ目の「追記（v0.18.1）」）、2026-11-14（v0.18.3。vitest を範囲の外へ、vite を範囲の中で上げる。版の選び方〈範囲の中で公開から 7 日を満たす最新の版〉と `npm audit` の基準〈high・critical 0、moderate は着手時の値から増えない〉を人間の決定で改めた。末尾の「追記（v0.18.3）」）

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

## 追記（v0.18.3: vitest を範囲の外へ、vite を範囲の中で上げる。commander 15.1.0 は見張り。人間の決定 B5-Q2 = A。設計〈最終〉§2.1。版の選び方と `npm audit` の基準は人間の決定 2026-11-14 で改めた）

### 文脈

- batch5 の範囲の洗い出し（npm の registry の読み。取得 2026-11-08T01:43:37Z）: 開発用の vitest は範囲 `~5.0.3`（入っているのは 5.0.5）の外に 5.1.0（2026-11-02T16:12Z 公開）、vite は範囲 `~8.3.5`（v0.18.1 の追記で決めた範囲。入っているのは 8.3.5）の中に 8.3.6（2026-11-05T05:40Z 公開）があった。その時点では、どちらも、それより新しい版は出ていなかった
- 実行時の依存の commander は、範囲 `~15.0.0`（入っているのは 15.0.0）の外に 15.1.0（2026-11-07T01:27Z 公開。`engines.node >=22.12.0`）が出た。jsonc-parser・zod は最新
- `@types/node` は 24.13.6（24.13.x の最新）。minimatch は 10.2.6 のままで、勧告 GHSA-g3hv-75wg-m249（2026-11-08 の時点で moderate 10 件）は、依存元（eslint 10.14.0 `^10.2.6`、`@eslint/config-array` 0.23.5 `^10.2.4`、`@typescript-eslint/typescript-estree` 8.72.1 `^10.2.2`）のその時点の最新が minimatch 11 系を許さないので、その時点のどの更新でも消えない
- 人間の決定（2026-11-08）: vitest 5.1.0（範囲を `~5.1.0` に）と vite 8.3.6（範囲は変えず lock だけ）を v0.18.3 で上げる。着手は、2 つとも公開から 7 日を満たす 2026-11-12T05:40Z（JST 11-12 14:40）以降。commander 15.1.0 は見張り、`@types/node` は 24.13.6 のまま、minimatch は依存元待ち（B5-Q2 = A）
- **着手時の読み（2026-11-14）**: 1 回目の着手（registry の取得 2026-11-14T01:51Z）で、vite に 8.3.6 より新しい 8.3.7（2026-11-09T10:25:29Z 公開）と 8.3.8（2026-11-11T02:49:46Z 公開。`latest`）が出ていて、どちらも範囲 `~8.3.5` の中で、公開から 7 日に届いていなかった。設計の決まり（新しい版が出ていたら、試しの前に止めて人間が選ぶ）のとおりに止まった。あわせて、`npm audit` の moderate が、lock は同じまま 10 件から 9 件になっていた（勧告のデータの側の変化。下の決定 6）

### 決定

1. 上げるもの:
   - vitest `~5.0.3` → `~5.1.0`（5.1.0 は範囲の外。`npm install --save-dev vitest@~5.1.0`）
   - vite は範囲 `~8.3.5` のまま、lock だけを 8.3.6 に（`npm update vite`。`package.json` は変えない）
   - vitest 5.1.0 の peer の vite は `^6.4.0 || ^7.0.0 || ^8.0.0`（範囲の洗い出しの読み）で、vite 8.3.6 と合う
2. 上げないもの:
   - **commander 15.1.0（見張り）**: 実行時の依存（配布物の `dependencies`。再利用ワークフローの `npm ci --omit=dev` にも入る）なので、上げると配布物の中身が変わり、適用先が呼び出しの SHA を上げたときに適用先の aiqh が変わる（人間の決定 H11 の対象）。今は上げる理由（直し・勧告）が確かめられていない（changelog を読んでいない）。v0.18.3 と v0.18.4 は H11 を行わない（B5-Q3 = A）。上げるなら、公開から 7 日を満たす 2026-11-14T01:27Z 以降に、changelog を読み、実行時の依存の確かめ（ADR-0008 の決定）と H11 を伴う版で、別に決める
   - `@types/node`: 24.13.6 のまま（v0.18.1 の追記の決定 4: 自己 CI と手元の Node〈24.13.1〉を超えて上げない。24.13.x の最新でもある）
   - typescript: 5.9 系のまま（ADR-0001。TypeScript 7 は typescript-eslint の peer の外: ADR-0001 の注記〈batch5 の記録の PR〉）
   - minimatch: 依存元待ち（v0.18.1 の追記の決定 5 のとおり、moderate の勧告を受け入れたまま、各版の記録に件数を書く）
   - vite 8.3.7・8.3.8: 着手の時点で公開から 7 日に届かないので選ばない（下の決定 5。7 日を満たすのは 8.3.7 が 2026-11-16T10:25:29Z、8.3.8 が 2026-11-18T02:49:46Z）。次の batch で、同じ決め方で上げる
3. 確かめ（v0.18.3 の依存の commit の SHA 固定の worktree で。設計〈最終〉§2.1.3 の完了条件 D1〜D13）:
   - **着手時に版を固定する**: npm の registry を読み（`npm view vitest time dist-tags --json`・`npm view vite time dist-tags --json`。取得の時刻を記録）、下の決定 5 の決め方で、選ぶ版を決めて固定する（v0.18.3 では vitest 5.1.0・vite 8.3.6。取得 2026-11-14T01:59Z）。選ばなかった新しい版は、版・公開の時刻・7 日を満たす時刻を記録する
   - **版の到達を合否の条件にする**（R2）: `package-lock.json` の `node_modules/vitest` が 5.1.0、`node_modules/vite` が 8.3.6（どちらも、着手時に選んだ版）、`npm ls vitest vite --depth=0 --json` の版が同じ、`package.json` の範囲が vitest `~5.1.0`・vite `~8.3.5` のまま。試しの worktree、release の branch の作業ツリー、依存の commit の SHA 固定の worktree の 3 か所で確かめる（CI の log には版が出ないので、CI の版は lock と `npm ci` の決まりに依る）
   - `npm install`・`npm update` が `min-release-age=7`・`ignore-scripts=true` の下で通る
   - `package.json` の差は vitest の範囲の 1 行だけ。lock の全欄の比べで、変わるのは開発用の項目の版だけ（追加・削除・`dev` の印の変化・実行時の依存 3 つの項目の変化が 0、ルートの `version` は npm が書いたまま〈v0.17.1 の追記〉）
   - `npm audit --audit-level=high` が 0（high・critical が 0）、moderate の件数が、着手時の main の値（v0.18.3 では 9）から増えない（下の決定 6）
   - typecheck・lint（新しい指摘 0）・全テスト 3 回・`npm run verify`・`npm run verify:dist`
   - **golden fixture の 4 つの期待値（`tests/fixtures/report-golden/`）が 1 バイトも変わらない**（依存の更新で出力が動かない）。aiqh 自身の verify の端末の `parsed: vitest` の行の形が変わらない（vitest の出力パーサが 5.1.0 の要約を読める）。全テストの終わりの、上限に近いテストの reporter（`tests/support/near-limit-reporter.ts`）の行が出る
4. 1 つでも外れたら（版の不一致〈更新されていない・着手時に選んだ版と別の版・範囲の書き方の違い〉、着手時に選ぶ版が registry の値から決まらない、lint の新しい指摘、golden の差、`parsed: vitest` の形の変化、テストの失敗、moderate の件数の増加）、規則やテストを緩めて通さず、依存の commit を外して止め、人間が決める（B5-D-Q7 = A。版の不一致を停止の条件に含めるのは R1 の条件）
5. **版の選び方を改める**（人間の決定 2026-11-14）: 着手の時点で、`package.json` の範囲（vitest は変更後の `~5.1.0`、vite は `~8.3.5`）の中で、公開から 7 日を満たしている版のうち、最も新しいものを選ぶ。7 日を満たさない新しい版と、範囲の外の新しい版は、選ばずに記録だけする（版・公開の時刻・7 日を満たす時刻）。範囲の中で 7 日を満たす最新の版が、読んだ registry の値から決まらないとき（読めない、矛盾するなど）だけ、試しの前に止める
   - 今までの決まり（設計〈最終〉§2.1.3 の 2、B5-Q2、B5-D-Q7）: 選ぶ版より新しい版が 1 つでも出ていたら、試しの前に止めて人間が選ぶ
   - 理由: 「最新でなければ止まる」決め方では、待つ間にまた新しい版が出て、着手できない。npm の `min-release-age=7` の目的（公開から 7 日たった版だけを使う）に合わせる。7 日の待ちの中の版は、次の batch で同じ決め方で上げる
   - 変わらないもの: 選んだ版に実際に届いたことの確かめ（上の 3 の版の到達。3 か所）と、届かなければ止めること（上の 4）。`min-release-age=7` の設定は迂回しない
6. **`npm audit` の基準を改める**（人間の決定 2026-11-14）: high・critical が 0 で、moderate は着手時の main の値から増えない。着手時の main の値を着手前の確かめで記録し、それを基準にする（v0.18.3 では 9）。CI の `parsed: npm-audit` の行も、同じ基準（着手時の値と同じか少ない、high・critical 0）で読む。減ったときは、理由（勧告のデータの側か、依存の変化か）を分かる範囲で記録する
   - 今までの決まり（設計〈最終〉§2.1.3 の D4）: moderate が 10 のまま
   - 理由: moderate の件数は、lock が同じでも、勧告のデータと依存元の新しい版で動く。決まった数を条件にすると、依存と関係のない変化で止まる
   - v0.18.3 の着手時（2026-11-14）の 9 件: lock は同じまま（minimatch 10.2.6）、数えられるパッケージから `@eslint/js` が外れた。`npm audit --json` の eslint の影響の範囲が `>=10.0.0-alpha.0` から `10.0.0-alpha.0 - 10.14.0` に変わっていて、eslint 10.15.0（2026-11-13T21:33Z 公開。minimatch `^11.0.5`）が出たことによる見込み（registry の読み。`npm audit` の数え方そのものは確かめていない）。eslint 10.15.0 は範囲 `~10.14.0` の外で、公開から 7 日に届かない。この版では上げない

### 既知の限界

- vitest 5.1.0 の中身（changelog）は、設計の段では読んでいない（着手時に読む: 設計〈最終〉§2.1.3 の 3。R1 の案は §2.1.2 と書いていたが、changelog を読む手順は §2.1.3 にある）。設計の段では、5.1.0 を入れて試していない（`min-release-age=7` の待ちの中）。着手時（2026-11-14）に、vitest v5.1.0 の release notes と vite 8.3.6 の changelog を読んだ: 破壊的な変更の節は無く、既定の reporter の要約の行（`Test Files`・`Tests`）に触れる記載は無かった（release notes の読みで、原文の一字一句と実装は照らしていない。出力の形は、上の 3 の確かめで見る）
- commander 15.1.0 を見張りにする理由は「上げる理由が確かめられていない」ことで、15.1.0 に問題があると分かったからではない
- moderate の勧告は、v0.18.1 の追記の決定 5 の理由で受け入れたまま
- 決定 5 の決め方では、着手の時点の `latest` より古い版を入れることがある（v0.18.3 の vite は 8.3.6 で、`latest` は 8.3.8）。7 日の待ちの中の版の直しは、次の batch まで入らない。入れた版に high 以上の勧告が出れば、自己 verify の dependency の check（`npm audit --audit-level=high`）で落ちる
- 決定 6 の基準では、moderate の件数が同じでも中身（勧告・パッケージ）が入れ替わる場合を、件数だけでは見分けない。各版の記録に、件数と勧告の ID を書く

### 適用先への影響

- 無い見込み: vitest・vite は開発用の依存で、再利用ワークフローは aiqh の依存を `npm ci --omit=dev` で入れる（`.github/workflows/verify.yml:107`）。v0.18.3 は H11 を行わない（適用先 A・B の呼び出しは v0.18.2 のまま）
