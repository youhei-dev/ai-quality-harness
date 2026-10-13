# ADR-0025: 自己 CI は Ubuntu の verify から始め、最初は必須にしない

- 状態: 採用（M3 の前半〈rest2 の計画の波 2〉。ROADMAP の M3「本体リポジトリ自身の CI」、R-011 の後半〈Linux での検証〉、R-006 の候補 1〈CODEOWNERS の手順〉の始まり。ADR-0005 の Windows の扱いは変えない）
- 日付: 2026-10-12（v0.5.45 の予定。ワークフローは、この ADR の時点では GitHub で一度も走っていない）。追記: 2026-10-12（v0.5.45。最初の結果と、必須にする条件〈決定 7〉・時間の見張り〈決定 8〉。下の「追記（v0.5.45）」）、2026-10-13（v0.6.1 の後。決定 7 の条件に届き、プロジェクトの `CLAUDE.md` のリリースの手順に入れた。下の「追記（決定 7 の条件に届いた）」）

## 文脈
- 本体の検証は M0 から手元の macOS だけ。Linux は「設計上は対応」で、実際には確かめていない（R-011 の後半。ADR-0022・ADR-0023 にも「Linux 未確認」）。Windows は対象外（ADR-0005）
- 人間の決定（2026-10-12）: リポジトリは非公開のまま（波 4 の配布で再判断）。CI の結果は Claude Code が `gh` で読んでよい（読み取りだけ）。Windows は測定のジョブだけ（失敗しても止めない。2026-10-12 の 2 回目の決定で、手動の実行のときだけにした）。npm の保護設定は CI でも手元と同じにする（ワークフローに環境変数で書く）。Ubuntu の CI は最初は必須にせず、Ubuntu で落ちる箇所を直して緑が続いてから、タグの前の条件にする（後の版で）
- 前提の調査（2026-10-12、GET だけ）: Actions は有効（`allowed_actions: all`、`sha_pinning_required: false`、既定の `GITHUB_TOKEN` の権限は `read`）。Branch Protection と rulesets の GET はどちらも HTTP 403（`Upgrade to GitHub Pro or make this repository public to enable this feature.`）。個人のアカウントの非公開のリポジトリ

## 決定
1. **ワークフローは 1 つ**（`.github/workflows/ci.yml`）。トリガーは main への push、main への pull request、`workflow_dispatch`。`pull_request_target` は使わない
2. **Ubuntu の verify**: ジョブ名 `verify (ubuntu)`（後で必須チェックに指定する名前。変えない）、`ubuntu-24.04`、30 分。checkout → setup-node（Node は手元と同じ 24.13.1）→ `npm ci` → `npm run verify`。手元と同じ 8 チェックを同じ CLI で走らせる（別の実行経路を作らない。ADR-0005）
3. **最初は必須にしない**。必須にする条件は手順書（`docs/ops/ci-and-branch-protection.md` の §2）に案を書き、決定は人間。リリースの判定の根拠は、これまでどおり手元の SHA 固定の worktree での検証で、CI は条件を足すもの（置き換えない）
4. **Windows は測定だけ**: ジョブ名 `measure (windows)`、`windows-2025`、30 分、`continue-on-error: true`。**`workflow_dispatch`（手動の実行）のときだけ走らせる**（人間の決定。分数の節約: Windows の分数は多く数えられ [推定]、POSIX 前提のテストで 30 分の上限まで走りうる。main への push と pull request では走らせない）。Windows を対象にする決定ではない（ADR-0005 のまま）
5. **権限と供給元の固定**:
   - トークンの権限は最上位の `permissions: contents: read` だけで、ジョブで広げない。checkout は `persist-credentials: false`。secrets と秘密の環境変数は使わない。外部のスクリプトを取ってきて実行しない
   - アクションはタグでなく完全な commit SHA で固定し、行末のコメントに版を書く。SHA は GitHub API の GET（`git/ref/tags/<tag>` と `commits/<tag>`）で、タグが指す commit を確かめる
   - 今回の版: `actions/checkout` v7.0.1（`3d3c42e5aac5ba805825da76410c181273ba90b1`）、`actions/setup-node` v7.0.0（`820762786026740c76f36085b0efc47a31fe5020`）。どちらも最新の安定版のメジャー（v7）の中で、公開から 7 日以上たった最新のリリース（setup-node の v7.1.0 は公開から 4 日だった。手元の npm の `min-release-age=7` と同じ考え）
   - **npm の保護設定を環境変数で写す**（人間の決定）: 手元の保護設定（利用者の `~/.npmrc` の `ignore-scripts=true`・`min-release-age=7`・`allow-git=none`）のうち、runner の npm が読めるものを、ワークフローの最上位の `env:` に書く。Node 24.13.1 に同梱の npm 11.8.0 で、HOME と userconfig を空にして確かめると、`npm_config_ignore_scripts=true` は読まれ、`npm_config_min_release_age`・`npm_config_allow_git` は `Unknown env config` の警告になった（11.8.0 はこの 2 つの設定を知らない）。そのため **`npm_config_ignore_scripts: "true"` だけを書いた**。npm を上げる手は取らない（人間の決定）
   - キャッシュは使わない（setup-node の自動キャッシュも `package-manager-cache: false` で止める）。verify のレポートを成果物としてアップロードしない（マスク済みでも、レポートを runner の外へ出さない）
   - 同時実行: pull request は同じ ref の古い実行を取り消す。main への push と手動の実行は、実行ごとの group で取り消さない
6. **Branch Protection は、いまは使えない**: 非公開・いまのプランでは GET が 403。手順書に、使えるようになったとき（Public 化か有料のプラン）の手順を書く。`.github/CODEOWNERS` は持ち主の記録として置くが、いまは強制されない

## 代替案
- `ubuntu-latest`・`windows-latest`: 版が黙って変わり、失敗の原因が分かりにくくなる。採らない
- アクションをタグ（`@v7` など）で参照する: タグは動かせる。採らない
- 最初から必須チェックにする: Ubuntu で一度も走っていないので、どこが落ちるか分からない。いまのプランでは必須チェック自体が使えない
- npm のキャッシュを使う: 最初の版は毎回 clean に入れ、キャッシュの鍵と汚染を考えなくて済むようにする。時間が問題になってから考える
- verify のレポートを成果物として上げる: 失敗の手がかりは増えるが、レポートを外へ出す。必要になったら、範囲と保存期間を決めてから
- Windows を pull request や main への push でも走らせる: Windows の分数は多く数えられる [推定]。測定は手動の実行で足りる

## 既知の限界
- **npm の保護設定は、runner では `ignore-scripts` だけが効く**: 手元の保護設定は利用者の `~/.npmrc` にあり、リポジトリには無い（runner の既定は無効。手元で空の設定を指定して確かめた）。ワークフローの `env:` で `ignore-scripts` を写したが、`min-release-age=7`・`allow-git=none` は runner の npm（11.8.0 の見込み）が知らない設定なので写していない。`npm ci` は lockfile のとおり（160 のパッケージがすべて registry から integrity 付き、git の依存なし）に入れるので、新しい版を解決することは無く、git の依存も無い。lockfile を変えるとき（依存関係の更新）は、手元の npm の保護設定で行う
- runner の npm は Node 24.13.1 に同梱の版（手元の `/usr/local` の同梱は 11.8.0）で、手元で使っている npm（11.18.0。利用者が別に入れたもの）と違う [推定: runner の版は、最初の実行のログで確かめる]
- Branch Protection が使えないので、CI が赤でも main への push は止まらない。タグの前の確認は人の手順（§2 の案）
- CI で落ちたときの手がかりは、ジョブのログ（verify の端末の出力。マスク済み）だけ
- Actions の分数の上限は API で取れなかった（`user` のスコープが要る）
- アクションの SHA を更新する手順（いつ・誰が）は決めていない
- Ubuntu・Windows での実際の結果は、最初の push（Ubuntu）と 1 回の手動の実行（Windows）の後でないと分からない。落ちうる箇所の推定は手順書の §7

## 影響
- 新規: `.github/workflows/ci.yml`、`.github/CODEOWNERS`、`docs/ops/ci-and-branch-protection.md`
- ARCHITECTURE（§3 の構成、§8 のディレクトリ規約、対応プラットフォームの「Linux CI は M3」に注記）、ROADMAP（M3 と「次:」）、README（開発の節に CI の 1 文）
- `src/`・`tests/`・`scripts/`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合・手元の npm の保護設定は変えない（CI には `ignore-scripts` を環境変数で写した）

## 追記（v0.5.45: 最初の結果と、必須にする条件）

### 最初の結果（`f3cfeb7`。v0.5.45 の release commit の前の 2 回）
- **Ubuntu は 2 回とも緑**: push の run 38241926903（`verify (ubuntu)` success、ジョブ 11 分 45 秒、verify 11 分 27 秒）と、手動の run 38243300245（success、11 分 50 秒、verify 11 分 32 秒）。8 チェックすべて PASS、失敗したテスト 0、ログの警告 0
- runner: イメージ `ubuntu-24.04`（20261004.327.1、Ubuntu 24.04.5）。setup-node のログで Node v24.13.1・**npm 11.8.0**（既知の限界の見込みのとおり）。`npm_config_ignore_scripts: true` は各ステップの環境に入っていた
- 時間: `unit` 5m38s〜5m40s、`unit-minpath` 5m30s〜5m33s で、手元（1m10s・1m29s）の 4〜5 倍。どちらもチェックの上限 600 秒の約 56%
- Windows（手動の run 38243300245 の `measure (windows)`。測定だけ）: verify は 3 チェックが FAIL（`unit` のタイムアウト、`unit-minpath` が `git.exe` を見つけない、`package` が `npm.cmd` を起動できない）。見えた失敗は 4 種類（時間、シグナル・プロセスグループ、コマンドの解決、ファイル名の制御文字）。全数は分からない。記録は ROADMAP の M3「Windows での挙動確認」。Windows を対象にするかは後で決める（人間の決定）
- スキップの確かめ（静的）: `tests/` の飛ばす条件は、root で動いているか（13 ファイル・35 か所）と `tests/zip-interop.test.ts` の `unzip`・`python3`（2 か所）だけ。runner では `unit` の中でどれも飛ばない見込み（root でない〈推定〉、`unzip`・`python3` は runner のイメージの一覧にある）。`unit-minpath` で zip のテストが飛ぶのは手元と同じ（設計どおり）

### 決定 7: 必須にする条件（人間の決定）
- `verify (ubuntu)` が **main への push で続けて 5 回緑**になったら、タグの前の条件にする。手動の実行（`workflow_dispatch`）と pull request は数えない。赤が 1 回でもあれば 0 から数え直す
- v0.5.45 の release commit の push を 1 回目として数え始める（その前の 2 回は数えない）。数え方の表は ROADMAP の M3「進み」に、記録の commit などで足していく
- 5 回に届いたら、プロジェクトの `CLAUDE.md` のリリースの手順に「タグの前に、その commit の `verify (ubuntu)` が緑」を足す（届いたときの指示で行う）。Branch Protection の必須チェックは、いまのプランでは使えないまま（決定 6）

### 決定 8: 時間の見張り（人間の決定: いまは変えない）
- `unit`・`unit-minpath` のどちらかが、チェックの上限（`aiqh.config.jsonc` の `timeoutSec` 600 秒）の **80%（480 秒）を超えたら**、対策を決める（上限を上げる設定の変更〈人間の承認〉か、テストの作業量を減らす〈ROADMAP の項目 36 の記録〉）

### 既知の限界（追記）
- 時間の判断の根拠は 2 回の実行だけで、日ごとのばらつきは分からない
- 「続けて 5 回」は人の手順で数える（Branch Protection が使えないので、赤でも main への push は止まらない）
- runner でテストが飛ばないことは静的な確かめで、実行の件数（スキップの数）はレポートを runner の外に出していないので見ていない

## 追記（決定 7 の条件に届いた。2026-10-13、v0.6.1 の後）

### 5 回の記録（main への push で始まった実行の `verify (ubuntu)`。手動の実行と pull request は数えていない）
| 回 | commit（push の先頭） | run | 結論 | ジョブの時間 |
|---|---|---|---|---|
| 1 | `35ee9e7`（v0.5.45 の release） | 38315238218 | success | 11 分 32 秒 |
| 2 | `d751427`（v0.5.45 の後の記録） | 38319589345 | success | 11 分 42 秒 |
| 3 | `c3f454f`（v0.6.0 の release） | 38337593923 | success | 8 分 37 秒 |
| 4 | `a4bb7ec`（v0.6.0 の後の記録） | 38344644237 | success | 11 分 58 秒 |
| 5 | `c322eb3`（v0.6.1 の release） | 38381026032 | success | 12 分 09 秒 |

- 赤は 1 回も無かった。**決定 7 の条件（続けて 5 回の緑）に届いた**。v0.6.1 のタグは、5 回目が success になってから付けた
- 時間の見張り（決定 8）: 5 回の中で一番長いのは 5 回目の `unit` 約 5 分 48 秒（チェックの上限 600 秒の約 58%）。80%（480 秒）は超えていない

### プロジェクトの `CLAUDE.md` に足したこと（人間の決定。2026-10-13）
- リリースの手順に次の一文を足した: 「注釈付きタグを付ける前に、その release commit の push で始まった `verify (ubuntu)`（`.github/workflows/ci.yml`）が success であることを `gh` で確かめる。success でなければタグを付けない」
- 確かめ方（読み取りだけ）: `gh run list --workflow ci.yml --commit <release commit の SHA>` で実行を特定し、`gh run view <run-id>` で `verify (ubuntu)` の結論が `success` であることを読む。release の commit が push の先頭でないとき（ほかの commit と一緒に push したとき）は、実行は push の先頭の commit に 1 回なので、その実行を読む
- 共通の規則（`~/claude-projects/CLAUDE.md`）は変えていない
- CI は条件を**足す**もので、手元の SHA 固定の worktree での検証（各 commit の単体検証・最終 HEAD の検証）を置き換えない（決定 7 の前からの方針）

### Branch Protection は引き続き使えない
- 非公開のまま・いまのプランでは、Branch Protection も rulesets も使えない（決定 6。2026-10-12 に確かめた HTTP 403）。そのため `verify (ubuntu)` を必須チェックにはできず、**タグの前の確かめは人の手順として守る**。赤でも main への push とタグの作成は技術的には止まらない
- 使えるようになったら（波 4 の公開の判断の後）、`verify (ubuntu)` を必須チェックにする（`docs/ops/ci-and-branch-protection.md` の §3）

### 既知の限界（追記）
- 手順は release の commit の push だけを見る。記録の commit（docs だけ）の push の赤は、次のタグまで気づかないことがありうる（記録の commit の後も、push のたびに結果を読んで報告に書く運用は続ける）
- 5 回の判断の根拠は 2026-10-12〜13 の 2 日分の実行だけで、長い期間のばらつきは分からない
