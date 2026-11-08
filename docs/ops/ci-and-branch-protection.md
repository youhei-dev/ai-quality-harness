# CI と Branch Protection の手順書

最終更新: 2026-11-08（v0.18.2 の後の記録。§3 の「確かめたこと」に、2 回目のタグの作成〈v0.18.2 のタグ〉と rule insights。消すこと・付け替えることは試していないまま）。その前: 2026-11-07（v0.18.1 の後の記録。§3 の「試していないこと」から、新しいタグを作れたこと〈v0.18.1 のタグ〉を「確かめたこと」に移した。消すこと・付け替えることは試していないまま）。その前: 2026-11-07（v0.18.1。§3 に PR #28 の CI の run と rule insights。§8 の手順 7 を、タグを作る一続きの手順に〈batch4 の設計〈最終〉§2.2〉。§8-2 に batch4 の着手前の見直し）。その前: 2026-11-07（batch3 の B3-Q7。§3 にタグの ruleset `tag-protection` と `sha_pinning_required: true` の「実施済み（2026-11-07）」。§3-3・§8・§8-2 に注記。§8 の手順 7 に、タグを付ける前の確かめ）。その前: 2026-10-30（v0.17.1 とその記録。§8-2 のアクションの SHA の更新。この行は、その版では直していなかった）、2026-10-26（v0.15.1。§8-1 に、時間を確かめるテストの測り方〈ROADMAP の項目 53〉）。その前: 2026-10-22（v0.13.2。§8-1 にテストの時間の予算 T1〜T4〈ROADMAP の項目 41〉。§1 のリリースの手順の参照先を、この文書の §8 に直した〈項目 43〉。§8 の手順 8 に、着手前の `npm audit --audit-level=high`〈依存の勧告の教訓〉）。その前: 2026-10-19（v0.12.1。§4 と §5 に、運用テンプレート〈設定の変更・見張る項目〉への参照）。その前: 2026-10-17（v0.9.2。§3 を pull request の必須・必須チェック 2 つ・Bypass なしに。§8 にリリースの手順。ADR-0032）、2026-10-16（v0.9.0。§1 に `reusable (self)`）、2026-10-16（v0.8.4。Public にした後、§3 の ruleset を設定した。§3 の「実施済み」）、2026-10-16（v0.8.3。下の注記）、2026-10-13（v0.6.1 の後。必須にする条件に届き、プロジェクトの `CLAUDE.md` のリリースの手順に入れた。ADR-0025 の追記）

注記（v0.8.3）: この文書が指すプロジェクトの `CLAUDE.md` は、v0.8.3 から git の追跡外（作業者のローカルの決まり）。リリースの手順に足した一文は 2-1 に同じ文で写してある。

本体リポジトリ自身の CI（自己 CI）と、main を守る設定の手順をまとめる。決定の根拠は ADR-0025。
最初の 2 回（v0.5.45 の前。push の run 38241926903 と手動の run 38243300245）は、`verify (ubuntu)` が 2 回とも緑だった（結果は ADR-0025 の「追記（v0.5.45）」と ROADMAP の M3「進み」）。

## 1. CI の中身（`.github/workflows/ci.yml`）

| ジョブ（名前） | runner | いつ走るか | 手順 | 失敗したとき |
|---|---|---|---|---|
| `verify (ubuntu)` | `ubuntu-24.04` | main への push、main への pull request、手動（`workflow_dispatch`） | checkout → setup-node（Node 24.13.1）→ `npm ci` → `npm run verify`（手元と同じ 8 チェック） | 実行が赤になる。必須チェック（v0.9.2 から。ruleset `main-protection`、ADR-0032。§2・§3） |
| `reusable (self)` | `ubuntu-24.04`（呼ばれた `verify.yml` の中） | `verify (ubuntu)` と同じ | `uses: ./.github/workflows/verify.yml`（`setup-command: npm ci`）。再利用ワークフローを、このリポジトリ自身を対象に呼ぶ（v0.9.0、ADR-0031。手順は `docs/ops/reusable-workflow.md`） | 実行が赤になる。必須チェック（v0.9.2 から。ADR-0032）。check の名前は `reusable (self) / aiqh verify` |
| `measure (windows)` | `windows-2025` | **手動（`workflow_dispatch`）のときだけ**（main への push と pull request では走らない。分数の節約: Windows の分数は多く数えられ [推定]、POSIX 前提のテストで 30 分の上限まで走りうる） | 同じ | `continue-on-error`: 実行は赤にならない。測定だけ（Windows は対象外。ADR-0005） |

共通:
- トークンの権限は `contents: read` だけ（最上位で決め、ジョブで広げない）。checkout は `persist-credentials: false`。secrets は使わない。`pull_request_target` は使わない
- アクション（`actions/checkout`・`actions/setup-node`）は完全な commit SHA で固定し、行末のコメントに版を書く。SHA は GitHub API で、タグが指す commit を引いて確かめた（ADR-0025）
- キャッシュは使わない（setup-node の自動キャッシュも `package-manager-cache: false` で止める）。成果物（verify のレポート）はアップロードしない
- npm の保護設定: 最上位の `env:` に `npm_config_ignore_scripts: "true"` を書いた（下の「npm の保護設定と CI」）
- 同時実行: pull request は同じ ref の古い実行を取り消す。main への push と手動の実行は取り消さない
- ジョブ名 `verify (ubuntu)` は、後で必須チェックに指定するときの名前なので変えない（変えると、必須チェックが「報告を待つ」のまま進まなくなる）

CI が置き換えないもの: リリースの判定の根拠は、これまでどおり手元の SHA 固定の worktree での検証（この文書の「8. リリースの手順」。v0.13.2 で参照先を直した）。CI は条件を足すもので、置き換えない。

### npm の保護設定と CI

人間の決定（2026-10-12）: CI でも手元と同じにする（ワークフローに環境変数で書く）。手元の npm の保護設定（`ignore-scripts=true`・`min-release-age=7`・`allow-git=none`）は利用者の `~/.npmrc` にあり、リポジトリには無いので、そのままでは runner で効かない。

- runner の npm が読めるものだけを、ワークフローの最上位の `env:` に書いた: **`npm_config_ignore_scripts: "true"`**
- 確かめ方: Node 24.13.1 に同梱の npm 11.8.0（runner で使われる見込みの版）で、HOME と userconfig を空のディレクトリにして `npm config get` を見た。`npm_config_ignore_scripts=true` は `true` として読まれた。`npm_config_min_release_age=7`・`npm_config_allow_git=none` は `npm warn Unknown env config "min-release-age"`（`allow-git` も同じ）になった。11.8.0 はこの 2 つの設定を知らないので、書いていない
- npm を上げて 2 つを効かせる手は取らない（人間の決定）。`npm ci` は `package-lock.json` のとおりに入れ（lockfile の 160 のパッケージはすべて `registry.npmjs.org` から integrity 付き、git の依存は無い）、新しい版を解決しないので、`min-release-age` と `allow-git` が無くても入るものは変わらない見込み [推定]
- インストールスクリプトを持つのは `fsevents` だけで、macOS 専用（Linux・Windows では入らない見込み [推定]）。`ignore-scripts` はそれも止める
- `ignore-scripts` は、`npm run verify` のような明示した script の実行は止めない（手元でも同じ設定で verify が通っている）
- lockfile を変えるとき（依存関係の更新）は、手元の npm の保護設定で行う

## 2. 必須にする条件（決定。ADR-0025 の決定 7）

人間の決定（2026-10-12）: 最初は必須にしない。**`verify (ubuntu)` が main への push で続けて 5 回緑**になったら、タグの前の条件にする。

1. **数えるもの**: main への push で始まった実行の `verify (ubuntu)`。手動の実行（`workflow_dispatch`）と pull request は数えない。再実行での緑も数えない
2. **数え始め**: v0.5.45 の release commit の push が 1 回目（その前の 2 回は数えない）。**赤が 1 回でもあれば 0 から数え直す**
3. **数え方**: push のたびに `gh run list --workflow ci.yml --event push --limit 5` で実行を特定し、`gh run view <run-id>` で `verify (ubuntu)` の結論を読む（読み取りだけ）。結果は ROADMAP の M3「進み」の表に、記録の commit などで足していく
4. **5 回に届いたら**: プロジェクトの `CLAUDE.md` のリリースの手順に「タグの前に、その commit の `verify (ubuntu)` が緑」を足す（届いたときの指示で行う）。**2026-10-13 に届き、足した**（下の 2-1）。確かめ方は、release の commit の SHA について `gh run list --workflow ci.yml --commit <SHA>` で `verify (ubuntu)` が `success` であることを読む（読み取りだけ）
5. 赤になったら: Ubuntu だけの失敗は原因を切り分ける。テストの直しは同じ波で、製品（信号の経路など）に及ぶものは別の版で独立レビュー。`npm audit` の勧告だけで赤になったときは、依存関係の判断として人間に渡す。再実行は `gh` の書き込みなので、人間の承認の後に行う
6. Branch Protection が使えるようになったら（§3）、`verify (ubuntu)` を必須チェックにする（注記〈2026-10-16、v0.8.4〉: Public にして使えるようになったが、必須チェックはまだ入れていない。足すときは改めて人間の承認を得る。§3 の「実施済み」と ROADMAP の項目 44）
7. `measure (windows)` は必須にしない（測定だけ）
8. 時間の見張り（ADR-0025 の決定 8）: `unit`・`unit-minpath` のどちらかがチェックの上限 600 秒の 80%（480 秒）を超えたら、対策を決める。最初の 2 回は約 56%（5m30s〜5m40s）

### 2-1. 届いた記録と、手順に入れたこと（2026-10-13）

- 5 回とも success: 1 回目 `35ee9e7`（run 38315238218）、2 回目 `d751427`（38319589345）、3 回目 `c3f454f`（38337593923）、4 回目 `a4bb7ec`（38344644237）、5 回目 `c322eb3`（38381026032。v0.6.1 の release。タグはこれが success になってから付けた）
- プロジェクトの `CLAUDE.md` のリリースの手順に足した一文: 「注釈付きタグを付ける前に、その release commit の push で始まった `verify (ubuntu)`（`.github/workflows/ci.yml`）が success であることを `gh` で確かめる。success でなければタグを付けない」
- Branch Protection が使えない（§3）ので、これは**人の手順**として守る。記録の commit の push の後も、結果を読んで報告に書く
- 注記（v0.9.2）: `verify (ubuntu)` と `reusable (self) / aiqh verify` を必須チェックにした（§3、ADR-0032）。pull request の run で 2 つが緑でないと merge できない。タグの前には、merge の後の main への push の run の 2 つの success も確かめる（§8）
- 時間の見張り: 5 回目の `unit` 約 5 分 48 秒が一番長い（上限 600 秒の約 58%）

## 3. Branch Protection（または rulesets）

**いまの状態**（2026-10-12 に GET で確かめた）: `GET repos/youhei-dev/ai-quality-harness/branches/main/protection` と `GET …/rulesets` は、どちらも HTTP 403 `Upgrade to GitHub Pro or make this repository public to enable this feature.`。**非公開のまま・いまのプランでは使えない**。
以下は、使えるようになったとき（Public にするか、有料のプランにしたとき）の手順。

**実施済み（2026-10-16、v0.8.4）**: 2026-10-16 の 13:50 ごろ（JST）に人間がリポジトリを Public に切り替え、`GET …/branches/main/protection` は HTTP 404（`Branch not protected`）になった（403 ではなくなった）。その後、次の ruleset を API で作った（人間の指示。classic の Branch Protection は使っていない）。上の「いまの状態」の文は、書いた時点の記録として残す。

- ruleset `main-protection`（id 25218296）: target `branch`、enforcement `active`、対象 `~DEFAULT_BRANCH`（main）。作り方: `gh api --method POST repos/youhei-dev/ai-quality-harness/rulesets --input <JSON のファイル>`（JSON の欄は name・target・enforcement・conditions・rules・bypass_actors）
- 規則: `deletion`（3-1 の 2）と `non_fast_forward`（3-1 の 3）だけ
- Bypass list: Repository admin の役割（`RepositoryRole` の id 5、`bypass_mode: always`。3-3）
- 入れていないもの: 必須チェック（3-1 の 4。§2 の条件〈main への push で続けて 5 回緑〉を見て、足すときは改めて人間の承認を得る。ROADMAP の項目 44）、pull request の必須（3-1 の 5。いまは 3-2 の案 B の形）、承認の数、Code Owners のレビュー、tag ruleset（3-3 の最後）
- 確かめ（読み取りだけ）: `gh api repos/youhei-dev/ai-quality-harness/rules/branches/main --jq '[.[].type]'` → `["deletion","non_fast_forward"]`。`gh api repos/youhei-dev/ai-quality-harness/rulesets --jq 'length'` → 1

**実施済み（2026-10-17、v0.9.2。ADR-0032）**: 人間の決定で、同じ ruleset を pull request の必須に切り替えた（3-2 の案 A）。上の v0.8.4 の箇条は、書いた時点の記録として残す。

- 変え方: `gh api --method PUT repos/youhei-dev/ai-quality-harness/rulesets/25218296 --input <JSON のファイル>` を 1 回（JSON の欄は name・target・enforcement・conditions・rules・bypass_actors）
- 規則（いまの状態）:
  - `deletion`（削除の禁止）・`non_fast_forward`（force push の禁止）
  - `pull_request`: 承認の数 0、Code Owners のレビューは必須にしない、merge の方式は **merge commit だけ**（`allowed_merge_methods: ["merge"]`）
  - `required_status_checks`: **`verify (ubuntu)` と `reusable (self) / aiqh verify`**（どちらも GitHub Actions の check。integration の id 15368）、**strict**（branch が最新であること）
- Bypass list: **空**（`current_user_can_bypass: never`）。締め出されたときの止め方は 3-3
- `measure (windows)` は必須にしない（手動の実行だけ。ADR-0025 の決定 4）
- API が既定の値で足した項目: `require_extra_approval_for_unattributed_changes: true`・`required_reviewers: []`・`do_not_enforce_on_create: false`
- リポジトリの merge の設定（変えていない）: `allow_merge_commit: true`（squash と rebase もリポジトリでは許されたまま。ruleset が merge commit だけに絞る）、`delete_branch_on_merge: false`、`allow_update_branch: false`
- 確かめ（読み取りだけ）: `gh api repos/youhei-dev/ai-quality-harness/rules/branches/main --jq '[.[].type]'` → `["deletion","non_fast_forward","pull_request","required_status_checks"]`
- **main への直接の push はできない**（admin も）。リリースは §8 の流れで入れる

**実施済み（2026-11-07。batch3 の B3-Q7。手順と確かめ方の正本は batch3 の設計〈最終〉`docs/reviews/batch3-design/design-final.md` の §8）**: 人間の承認の後に、版とは別に、次の 2 つを API で設定した。上の v0.8.4 の箇条の「入れていないもの: … tag ruleset」は、書いた時点の記録として残す。

- タグの ruleset `tag-protection`（id 26732066。2026-11-07 の 07:32 ごろ〈JST〉に作った）: target `tag`、enforcement `active`、対象 `refs/tags/v*`（`exclude` は空。既存のタグ v0.1.0〜v0.18.0 の 98 個は、すべて `v` で始まり、対象になる）
  - 作り方: `gh api --method POST repos/youhei-dev/ai-quality-harness/rulesets --input <JSON のファイル>` を 1 回（JSON の欄は name・target・enforcement・bypass_actors・conditions・rules）
  - 規則: `deletion`（対象のタグを消せない）と `update`（同じ名前のタグを別の object に付け替えられない）だけ。**`creation` の規則は付けていない**（新しいタグは作れる。§8 の手順 7 のタグの push のため）。`non_fast_forward` も付けていない（Bypass が無いので、`update` だけで、既存のタグの付け替えは force かどうかに関係なく誰もできない）
  - 送った `update` の規則は `parameters` に `update_allows_fetch_and_merge: false` を持っていたが、GitHub は `{"type":"update"}`（`parameters` なし）として保存した（POST の応答と GET の読み直しの両方）。この欄は branch のための欄（fork が上流から同期できるか）で、target `tag` の ruleset では保存されないと判断し、人間が受け入れた
  - Bypass list: **空**（`current_user_can_bypass: never`。`main-protection` と同じ）。止めるのは人間（3-3）
- `sha_pinning_required: true`（2026-11-07 の 07:34 ごろ〈JST〉）: `gh api --method PUT repos/youhei-dev/ai-quality-harness/actions/permissions --input <JSON のファイル>` に `{"enabled":true,"allowed_actions":"all","sha_pinning_required":true}`（HTTP 204。`enabled`・`allowed_actions` は前の値のまま送った）。ワークフローの `uses:` の 9 行のうち、外のアクションの 8 行はすべて完全な commit SHA、残りの 1 行は同じリポジトリの再利用ワークフロー（`./.github/workflows/verify.yml`。GitHub の文書は、この設定について「Reusable workflows can still be referenced by tag.」と書く）
- 確かめ（読み取りだけ。設定の前と後の GET を比べた）: 変わったのは `GET …/rulesets` の件数（1 から 2。`main-protection` の行は前と同じ）と、`GET …/actions/permissions` の `sha_pinning_required`（false から true）だけ。`GET …/rulesets/25218296`・`…/rules/branches/main`・`…/actions/permissions/workflow`・`…/actions/permissions/artifact-and-log-retention`・`…/actions/permissions/fork-pr-contributor-approval`・リポジトリの merge の設定は、前とバイト単位で同じ
  - `gh api repos/youhei-dev/ai-quality-harness/rulesets --jq '[.[].name]'` → `["main-protection","tag-protection"]`
  - `gh api repos/youhei-dev/ai-quality-harness/rulesets/26732066 --jq '[.target, .enforcement, .conditions.ref_name.include, [.rules[].type], (.bypass_actors|length)]'` → `["tag","active",["refs/tags/v*"],["deletion","update"],0]`
  - `gh api repos/youhei-dev/ai-quality-harness/actions/permissions` → `{"enabled":true,"allowed_actions":"all","sha_pinning_required":true}`
  - rule insights（`gh api repos/youhei-dev/ai-quality-harness/rulesets/rule-suites`）は、public のリポジトリで読める（2026-11-07 に HTTP 200。PR #28 の merge の push の `pass` が 1 件。batch3 の設計〈最終〉§8.1 の [要確認] の答え）。適用先の run に、どちらのリポジトリの `sha_pinning_required` が当たるか（同 §8.2 の (2)）は未確認
  - CI での確かめ: `sha_pinning_required: true` の後の最初の run は、この記録の pull request（branch `docs/github-settings`）の run と、その merge の後の main への push の run。必須の 2 つが success になることで、ローカルの再利用ワークフローが止まらないことを確かめる。結果（v0.18.1 で記入）: PR #28 の run 42309130764（head `5a7a7a9`）と、merge の commit `3a6295a3ae2ce15d3a1329f50cb825529d9c72c5` の main への push の run 42309849263 で、必須の 2 つが success（アクションは SHA で取得され、SHA の固定による注釈は 0）
- 確かめたこと（v0.18.1。2026-11-07）: **新しいタグを作れる**。`v0.18.1`（commit `7f4bd8fa15ec17bfd741dbf9c7d568fb83b8efd8` / tag object `e7a7936577a45f28033dd7ed28579e06356c4c4e`）を §8 の手順 7 で作り、2026-11-07 12:25:30（JST）に `git push origin refs/tags/v0.18.1` を 1 回だけ送った: exit 0（`* [new tag]`）。送る前の 3 の確かめ（手元 99・リモート 98 の名前の集合で、手元にだけあるのが `refs/tags/v0.18.1` の 1 つ。送る対象の 5 点）と、送った後の 5 の `git ls-remote` の 2 行（tag object と commit）が合った。§8 の手順 7 の 6（失敗・結果が分からない）は使わなかった
  - rule insights（`gh api repos/youhei-dev/ai-quality-harness/rulesets/rule-suites`。HTTP 200）に、タグの push の記録が載った: `refs/tags/v0.18.1`、2026-11-07T12:25:32+09:00、before が 40 桁の 0、after が tag object `e7a7936`、result `pass`。詳細（`…/rulesets/rule-suites/4964913454`）では、`tag-protection`（id 26732066）の `update` と `deletion` が評価されて、どちらも `pass`（新しい名前の作成なので、どちらの規則にも当たらない）。secret scanning も `pass`。batch4 の設計〈最終〉§2.6 の「rule insights にタグの push が載るかは未確認」は、載ると分かった
- 確かめたこと（v0.18.2。2026-11-07）: **2 回目の作成**。`v0.18.2`（commit `0c25b023e976fab31f8d8753490425dc0070e99c` / tag object `c72794bd551e60a002f0d931f553d80642a0e6e1`）を §8 の手順 7 で作り、2026-11-07 16:53:59〜16:54:02（JST）に `git push origin refs/tags/v0.18.2` を 1 回だけ送った: exit 0（`* [new tag]`）。送る前の 3 の確かめ（手元 100・リモート 99 の名前の集合で、手元にだけあるのが `refs/tags/v0.18.2` の 1 つ。送る対象の 5 点）と、送った後の 5 の `git ls-remote` の 2 行（tag object と commit）が合った（送った後の集合は手元 100・リモート 100）。§8 の手順 7 の 6 は使わなかった
  - rule insights（HTTP 200）: `refs/tags/v0.18.2`、2026-11-07T16:54:01+09:00、before が 40 桁の 0、after が tag object `c72794b`、result `pass`。詳細（`…/rulesets/rule-suites/4966974421`）では、`tag-protection` の `update` と `deletion` が評価されて、どちらも `pass`。secret scanning も `pass`
- 試していないこと: 消すこと・付け替えることが拒まれるかは、本物のタグで試していない（試すとタグが残るか消える。取り返しがつかない）。v0.18.1・v0.18.2 で確かめたのは作ることだけ。送るのが失敗した・結果が分からないときは、§8 の手順 7 の 6 のとおり、送り直さずに止まり、`git ls-remote` の読み取りで 3 つの状態のどれかを人間に知らせる（v0.18.1 で書き直した。「断られたらタグはできない」とは決めない: batch4 の設計〈最終〉§2.6）
- 戻し方（するかは人間が決める）: ruleset は Enforcement を Disabled にする（`gh api --method PUT repos/youhei-dev/ai-quality-harness/rulesets/26732066` に `{"enforcement":"disabled"}`。消さない）。`sha_pinning_required` は `gh api --method PUT repos/youhei-dev/ai-quality-harness/actions/permissions` に `{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}`。画面では Settings → Rules → Rulesets → `tag-protection` と、Settings → Actions → General の「Require actions to be pinned to a full-length commit SHA」

### 3-1. 設定する内容（rulesets の場合。Settings → Rules → Rulesets → New branch ruleset）

1. 対象: main（Default branch）。Enforcement status: Active
2. **Restrict deletions**（削除の禁止）: 有効
3. **Block force pushes**（force push の禁止）: 有効（`--force-with-lease` も止まる）
4. **Require status checks to pass**: `verify (ubuntu)` を足す（§2 の条件を満たしてから。一度走ったジョブの名前を一覧から選ぶ）
5. **Require a pull request before merging**: 1 人のリポジトリでの扱いを決める（下の 3-2）
6. Bypass list: 自分（Repository admin の役割）を入れる（下の 3-3）

classic の Branch Protection を使う場合も、同じ 4 つ（削除の禁止・force push の禁止・必須チェック・PR の扱い）を設定する。

### 3-2. pull request を必須にするか（1 人のリポジトリ）

- いまの作業の流れは、main への直接の push（commit → worktree での検証 → push）
- **必須チェックは、直接の push と相性が悪い**: 必須チェックを付けると、チェックを通っていない commit を main に push できなくなる（チェックは push の後に走るため）。必須チェックを使うなら、pull request の流れにする必要がある
- 案 A: pull request を必須にし、承認の数は 0（自分の pull request は自分で承認できない）。`verify (ubuntu)` を必須チェックにする。マージは CI が緑になってから
- 案 B: 直接の push を続け、ruleset は削除の禁止と force push の禁止だけにする。CI はタグの前の条件（§2）で使う
- どちらにするかは人間が決める（波 4 の公開の判断と一緒に）
- **決定（2026-10-17、v0.9.2。ADR-0032）: 案 A**。必須チェックは `verify (ubuntu)` と `reusable (self) / aiqh verify` の 2 つ、承認 0、merge commit だけ、Bypass なし。流れは §8

### 3-3. 自分が締め出されないための注意

- Bypass list に自分（Repository admin）を入れておく。誤った設定でも、管理者は ruleset を無効にできる
  - 注記（v0.9.2）: ADR-0032 の決定で、Bypass は外した。締め出されたとき（必須チェックが報告されない、など）は、人間が Settings → Rules → Rulesets → `main-protection` で Enforcement を Disabled にする（admin は ruleset を変えられる）
- 必須チェックの名前は、実際に走ったジョブの名前を一覧から選ぶ（打ち間違えると、チェックが永遠に「報告を待つ」になり、マージできない）
- 承認の数を 1 以上にしない（1 人では満たせない）。Code Owners のレビューを必須にしない（同じ理由）
- まず削除の禁止と force push の禁止だけで有効にし、必須チェックは後から足す
- タグも守るなら、tag ruleset で `v*` の削除と更新を禁止する（プロジェクトの規則「タグを消さない・上書きしない」と同じ）
  - 注記（2026-11-07）: ruleset `tag-protection` で入れた（§3 の「実施済み（2026-11-07）」）。Bypass は無いので、止めるときは `main-protection` と同じく、人間が Enforcement を Disabled にする

## 4. CODEOWNERS（`.github/CODEOWNERS`）

- 持ち主を `@youhei-dev` にしたもの: `.github/`、`aiqh.config.jsonc`、`package.json`、`package-lock.json`、`tsconfig.json`・`tsconfig.build.json`、`eslint.config.js`、`vitest.config.ts`、`.gitignore`、`scripts/`、`tests/structure/`（検証のしかたを決めるファイル。ROADMAP の R-006 の候補 1）
- **いまは強制されない**: 非公開のリポジトリで、いまのプランでは Branch Protection も rulesets も使えない（§3）。Code Owners のレビューを必須にするには、Branch Protection か ruleset が要る
  - 注記（2026-10-16、v0.8.4）: Public にした後も、ruleset（§3 の「実施済み」）は Code Owners のレビューを必須にしていないので、強制されないまま
- 1 人のリポジトリでは、自分の pull request に自分は承認を出せないので、Code Owners のレビューを必須にすると締め出される（3-3）。持ち主の記録として置く
- これらのファイル（品質ポリシー）を変える pull request の手順は `docs/ops/policy-change.md`（R-006 の候補 3。aiqh は承認を強制しない）

## 5. CI の結果の読み方（読み取りだけ）

人間の決定（2026-10-12）: Claude Code は `gh` で CI の結果を読んでよい（読み取りだけ）。

```bash
gh run list --workflow ci.yml --limit 5            # 最近の実行の一覧（状態・結論・commit）
gh run view <run-id>                               # 1 つの実行のジョブと結論
gh run view <run-id> --log-failed                  # 失敗した手順のログだけ
```

再実行・取り消し・手動の実行（`gh run rerun`・`gh run cancel`・`gh workflow run`）は書き込みなので、人間の承認の後に行う。

結論と時間のほかに何を見張り、何を見たら何をするかは `docs/ops/monitoring.md`。

## 6. ワークフローを初めて push するとき

- `.github/workflows/` の下のファイルを HTTPS で push するには、使う資格情報（OAuth のトークンや PAT）に `workflow` の権限が要る。無いと GitHub が push を拒む
- このリポジトリの push の認証（2026-10-12 の人間の設定）: このリポジトリの `.git/config`（local）で、github.com 用の credential helper を空の値と `!gh auth git-credential` の 2 つにした（system の `osxkeychain` をこのリポジトリの github.com では使わず、gh の資格情報を使う。Mac 全体の `gh auth setup-git` は使わない）。gh のトークンには `workflow` のスコープを足した
- 最初の push で Actions の実行が始まる（§1 の表のとおり。main への push なので `verify (ubuntu)` だけ。`measure (windows)` は手動の実行のときだけ）

## 7. 確かめていないこと

- （v0.5.45 で注記: Ubuntu は 2 回とも緑で、この推定の 5 つはどれも失敗として現れなかった。Windows は手動の 1 回で 3 チェックが FAIL〈ROADMAP の M3〉）v0.5.45 の前の推定（rest2 の SP1）: dash でのシェルの構文、回収前のゾンビの扱い（`src/runner/execute.ts` の `groupAlive`）、vCPU が少ないことによる時間の余裕の小さいテスト、初めて走る unzip・python3 のテスト（`tests/zip-interop.test.ts`）、`npm audit` の勧告
- Actions の分数の上限（API は `user` のスコープが要り、取れなかった）
- CODEOWNERS がいまのプランで何もしないこと（GitHub の文書による [推定]）
- （v0.9.2）`require_extra_approval_for_unattributed_changes: true`（API の既定の値）が、承認 0 の設定でどう働くか。strict で main が先に進んだときの branch の更新のしかた（`allow_update_branch` は false）。ruleset を止める手順は試していない

## 8. リリースの手順（v0.9.2 から: pull request で入れる。ADR-0032）

main への直接の push は、ruleset で拒まれる（admin も）。版を出すときも、記録だけのときも、次の流れにする。

1. origin/main から作業の branch を作る（版を出すときは `release/vX.Y.Z`、記録だけなら `docs/<topic>`）
2. branch に目的ごとの commit を作り、各 commit を SHA 固定の worktree で検証する（typecheck・lint・全テスト・`npm run verify`。テストと verify は、下の 8-1 の T1 の負荷のゲートを通してから始める）
3. push の前に走査し（範囲は `origin/main..HEAD`）、branch を push する
4. pull request を作り（base は main）、必須の 2 つの checks（`verify (ubuntu)`・`reusable (self) / aiqh verify`）が緑になるのを待つ
5. `gh pr merge <番号> --merge --match-head-commit <branch の先頭の SHA> --delete-branch` で merge する（`--admin` は使わない。`--match-head-commit` で、確かめた commit 以外を merge しない）
6. main への push の run（merge の commit）の、必須の 2 つが success になるのを確かめる
7. 手元の main を fast-forward し（`git switch main && git merge --ff-only origin/main`）、版を出すときは、release の commit（branch の commit。merge の後も main の履歴に残る）に注釈付きタグを付けて送る。タグは ruleset `tag-protection`（§3）により、送った後は消せず、付け替えられない。次の順で一続きに行う（batch4 の設計〈最終〉§2.2。v0.18.1）
   1. 指す commit を確かめる: release の commit の 40 桁の SHA（merge で `--match-head-commit` に渡した SHA）を `<SHA>` とする。`git log -1 --format=%s <SHA>` が release の commit のメッセージ、`git merge-base --is-ancestor <SHA> origin/main` が 0
   2. 付ける: `git tag -a vX.Y.Z <SHA> -m "vX.Y.Z: <要約>"`（SHA を明示する。HEAD は merge の commit なので HEAD に付けない）
   3. 送る前に確かめる:
      - 手元だけのタグ: `git for-each-ref --format='%(refname)' 'refs/tags/v*'` と `git ls-remote --tags --refs origin 'refs/tags/v*'` の ref の名前を集合として比べ、手元にだけあるのが `refs/tags/vX.Y.Z` の 1 つだけ（`--refs` は剥がした行〈`^{}`〉を出さない。`git tag --no-contains origin/main` では見分けられないので使わない）
      - 送る対象: 完全な ref の名前が `refs/tags/vX.Y.Z`、`git cat-file -t refs/tags/vX.Y.Z` が `tag`、タグの object の SHA（`git rev-parse refs/tags/vX.Y.Z`）を書き留める、`git rev-parse 'refs/tags/vX.Y.Z^{commit}'` が `<SHA>`、`git ls-remote --tags origin refs/tags/vX.Y.Z` が空（リモートに同じ名前が無い）
   4. 送る: `git push origin refs/tags/vX.Y.Z`（このタグ 1 つだけを完全な名前で）。`git push --tags`・`--follow-tags`・`--mirror` は使わない（手元の別の `v*` のタグも送られ、作ることは止められないので、消せないまま残る）
   5. 送った後に確かめる: `git ls-remote --tags origin refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'` の 2 行が、3 で書き留めたタグの object の SHA と `<SHA>`
   6. 送るのが失敗した・時間切れになった・結果が分からないときは、送り直さず、手元もリモートも変えずに止まる（言い換えて送り直さない）。読み取りだけの `git ls-remote --tags origin refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'` で、**未作成**（同じ名前が無い）・**正しく作成済み**（2 行が 3 で書き留めた値と同じ）・**別の対象、または確認できない**（値が違う、`ls-remote` が失敗した）のどれかを確かめて、人間に知らせる。終了コードだけで「タグは無い」と決めない。ruleset を無効にするか・どうするかは人間が決める
   - 送る前に誤りに気づいたら: 手元のタグを付け直すには `git tag -d vX.Y.Z` が要る。削除の操作なので、人間の確認を取ってから
   - 送った後に誤りに気づいたら: 直せない。次の版を出す
8. 次の版の着手前の確認では、HEAD = origin/main = リモートの main、開いている pull request が 0、作業の branch が残っていないことを確かめる。あわせて `npm audit --audit-level=high` が通ること（自己 verify の dependency の check と同じ）を確かめ、通らなければ、実装の前に依存の更新を決める（v0.13.2 の教訓: 勧告は外で増えるので、前の版の CI が PASS でも、実装の後の検証で初めて分かると、全部の commit を作り直すことになる）

- merge は merge commit だけ（squash・rebase は ruleset で許していない）。branch の commit の SHA が、そのまま main の履歴に入るので、検証と記録に書いた SHA を使える
- strict なので、main が先に進んだときは、branch を最新にしてから merge する
- タグの push は、ruleset `main-protection` の対象（branch）の外
  - 注記（2026-11-07）: タグには、別の ruleset `tag-protection`（§3 の「実施済み（2026-11-07）」）が当たる。`refs/tags/v*` を消すことと付け替えることを止め、作るのは止めない
- 版を上げる（release の commit。v0.17.1 から。ADR-0008 の追記）: `npm version <新しい版> --no-git-tag-version` で、`package.json` の `version` と `package-lock.json` のルートの 2 つの `version` を同時に上げる（commit とタグは作らない。手で `package.json` だけを書き換えない）。lock の全欄の比べで、ルートの 2 つのほかが変わっていないことを確かめる。`tests/regression-m2-1-r2-008-version-consistency.test.ts` が、3 つ（と CHANGELOG・README の版）の一致を確かめる
- 依存を更新した commit では、npm が書いたルートの `version`（そのときの `package.json` の版）をそのまま commit する（v0.13.2・v0.14.1 のように 0.5.35 に手で戻さない。v0.17.1 から）

### 8-1. テストの時間の予算（T1〜T4。v0.13.2、ROADMAP の項目 41）

負荷のもとで時間切れになるテストがあった（ROADMAP の項目 41。全テストを 2 本同時に走らせた再現で、型を読むガードのテスト 3 件が時間切れ）。次の 4 つを分けて決める。判定（verify の合否）には関わらない、テストの作りと手元の運用の決まり。

| 予算 | 決まり | 根拠 |
|---|---|---|
| T1 負荷のゲート（手元） | テストと verify（各 commit の worktree の検証を含む）を始める前に、1 分平均 8 以下かつ 5 分平均 12 以下が 20 秒おきに 3 回続くのを待つ（最長 90 分）。リリースの検証で 15 分平均が高いときは、1 分平均 6 以下かつ 5 分平均 8 以下。始めたときの値を記録に書く。CI には置かない（job ごとに別の runner） | 8 CPU の機械で全テストを 2 本同時に走らせると、1 分平均が 300 を超え、型を読むガードのテストが時間切れになった（batch1 の再現） |
| T2 並列数 | 1 台の機械で同時に走らせる全テストは 1 本。vitest の worker の数は変えない（vitest 5 の既定は、watch でないとき CPU の数 − 1） | 2 本を同時に走らせると worker が倍になる。verify は check を 1 つずつ走らせる（`src/runner/run-checks.ts`）ので、unit と unit-minpath は重ならない |
| T3 各テストの上限 | 負荷で伸びるテスト（負荷のもとで静かなときの 2 倍以上になったもの）の上限は、max(30 秒, 静かなときの時間 × 12 を 10 秒単位に切り上げ)。式が 200 秒を超えるテストは分ける。上限はテストの中に書き、その行に式の値の注記を付ける。ループや `it.each` の中のテストは、ケースの中で最も大きい値を 1 つ付ける | 12 = 観測した最大の倍率 10.33 に約 16% の余裕。200 秒は T4 の 1/3。待つ時間で決まるテスト（倍率がほぼ 1）は対象外 |
| T4 suite の予算 | unit・unit-minpath の check の `timeoutSec` 600（`aiqh.config.jsonc`） | CI の時間は ROADMAP の項目 42 で見張る。50%（300 秒）を超えたら、ROADMAP の項目 50（型を読むガードのテストの並列の抑制と、TypeScript の program の再利用）を早める |

- 時間を確かめるテストの測り方（v0.15.1。ROADMAP の項目 53）: 製品の時間の上限に届かないこと・線形であることを確かめるテストは、作業量の時計か、そのスレッドの CPU 時間（`process.threadCpuUsage()`。絶対の上限と、入力の大きさを 4 倍にしたときの比）で確かめる。壁時計の絶対の上限は使わない。待つ時間（スレッドが止まる・CPU を待つ）は、テストの timeout（T3）と suite の上限（T4）が受け持つ。例: `tests/parse-output.test.ts` の P3（各形・各道具で 256 KiB と 1 MiB を 3 回ずつ読み、最小どうしで `t(1 MiB) ≤ 8 × t(256 KiB) + 20 ms`。線形なら約 4 倍、二乗なら約 16 倍）。同じ形の `tests/regression-backlog35-url-credential-linear.test.ts` の壁時計の確かめは、記録で外れていないので替えていない（batch2 の設計の B2-Q8）
- 上限に近い遅さの記録（v0.13.2）: 全テストの終わりに、vitest の reporter（`tests/support/near-limit-reporter.ts`）が、上限の 50% を超えたテストを割合の大きい順に最大 20 行と、件数の行を 1 行、stderr に出す。判定は変えない。PASS の check の出力は端末に出ないが、`latest.json` の `checks[].stderrTail` に残る（上限は各テストの timeout、時間は vitest の時間で `beforeEach`・`afterEach` を含む。上限の分からないテストは件数の行の `unknown-limit` に数える）

### 8-2. アクションの SHA の更新（v0.17.1。ADR-0025 の決定 9）

ワークフローのアクション（今は `actions/checkout`・`actions/setup-node`・`actions/setup-python`）は、完全な commit SHA と `# vX.Y.Z` のコメントで固定している（ADR-0025 の決定 5、ADR-0031）。次の手順で上げる。

1. **いつ**: batch の最初の版の着手前の確認（上の手順 8）で、使っているアクションの最新のリリースを見る（`gh api repos/<owner>/<名前>/releases/latest`）。ほかに、アクションの勧告・非推奨（実行環境の Node の版の終わりなど）を知ったとき
2. **SHA の取り方**: タグの ref を `gh api repos/<owner>/<名前>/git/ref/tags/<タグ>` で読む。object の type が `tag`（注釈付きタグ）なら `gh api repos/<owner>/<名前>/git/tags/<sha>` で commit まで剥がす。`uses:` に書くのは commit の SHA
3. **条件**: 公開から 7 日を満たす版だけ（npm の `min-release-age=7` と同じ考え）。前の版と `action.yml` を比べる（`runs.using`・入力・出力・`post`）。リリースの記述を読む
4. **承認**: アクションごとに、今と新しい SHA・版・公開日・`action.yml` の違いの一覧を出し、人間が承認する（依存の更新と同じ扱い）
5. **直す所**: `.github/workflows/` のすべての同じアクションを、同じ SHA と `# vX.Y.Z` にする。テストは SHA を固定していない
   - 版の名前を書いた文書も直す（例: `docs/ops/reusable-workflow.md` の §3 の後の箇条）。古い SHA（40 桁）と古い版の名前（`vX.Y.Z`）の両方で `git grep` し、当たった行を batch3 の設計（最終）§2.5 の規則で分ける（日付・版・注記の無い、今の状態を書く文は直す。CHANGELOG・ROADMAP の記録・ADR の本文と注記・`docs/reviews/` は残す）
   - 更新対象（ワークフローの `uses:` の行と、直す文書の行）を一覧にし、commit の前に `git diff` で、一覧の行だけが変わったことを確かめる
   - この 2 つは v0.17.1 の記録で足した（v0.17.1 で `docs/ops/reusable-workflow.md` の版の名前を直し漏れた。実装の独立レビュー batch3-v0171-impl R1 の提案）
6. **確かめ**: pull request の run で必須の 2 つが success。再利用ワークフロー `verify.yml` の変更は、適用先が呼び出しの SHA を上げるまで適用先には届かない（人間の決定 H11 の回に含める）
7. **記録**: CHANGELOG に、前と後の SHA と版

- v0.17.1 の更新: setup-node v7.0.0（`820762786026740c76f36085b0efc47a31fe5020`）→ v7.1.0（`949feb2413d6458794dcd2491c4babbbce0c15c1`、2026-10-08 公開）、setup-python v7.0.0（`5fda3b95a4ea91299a34e894583c3862153e4b97`）→ v7.1.0（`6d4fd22b20465ccc0f7354476588e8df7c9ca0e0`、2026-10-22 公開）。どちらも軽量タグ。`runs.using` は `node24` のまま、入力が増えただけ（aiqh は使わない）。checkout は v7.0.1 が最新で変えない
- `sha_pinning_required`（完全な SHA を強制する GitHub の設定）は、版とは別に、人間の承認の後に入れる（batch3 の設計〈最終〉§8.2）
  - 注記（2026-11-07）: 入れた（§3 の「実施済み（2026-11-07）」）。これからは、外のアクションの `uses:` を完全な commit SHA で書かないと、そのワークフローは走らない（上の手順の 2・5 は、もともと commit SHA を求めている）
- batch4 の着手前の見直し（2026-11-07。v0.18.1。B3-D-Q12）: checkout v7.0.1・setup-node v7.1.0・setup-python v7.1.0 は、どれも最新の release と同じ commit で、勧告 0 件。更新なし
