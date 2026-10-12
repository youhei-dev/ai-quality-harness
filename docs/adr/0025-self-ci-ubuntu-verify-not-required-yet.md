# ADR-0025: 自己 CI は Ubuntu の verify から始め、最初は必須にしない

- 状態: 採用（M3 の前半〈rest2 の計画の波 2〉。ROADMAP の M3「本体リポジトリ自身の CI」、R-011 の後半〈Linux での検証〉、R-006 の候補 1〈CODEOWNERS の手順〉の始まり。ADR-0005 の Windows の扱いは変えない）
- 日付: 2026-10-12（v0.5.45 の予定。ワークフローは、この ADR の時点では GitHub で一度も走っていない）

## 文脈
- 本体の検証は M0 から手元の macOS だけ。Linux は「設計上は対応」で、実際には確かめていない（R-011 の後半。ADR-0022・ADR-0023 にも「Linux 未確認」）。Windows は対象外（ADR-0005）
- 人間の決定（2026-10-12）: リポジトリは非公開のまま（波 4 の配布で再判断）。CI の結果は Claude Code が `gh` で読んでよい（読み取りだけ）。Windows は測定のジョブだけ（失敗しても止めない）。Ubuntu の CI は最初は必須にせず、Ubuntu で落ちる箇所を直して緑が続いてから、タグの前の条件にする（後の版で）
- 前提の調査（2026-10-12、GET だけ）: Actions は有効（`allowed_actions: all`、`sha_pinning_required: false`、既定の `GITHUB_TOKEN` の権限は `read`）。Branch Protection と rulesets の GET はどちらも HTTP 403（`Upgrade to GitHub Pro or make this repository public to enable this feature.`）。個人のアカウントの非公開のリポジトリ

## 決定
1. **ワークフローは 1 つ**（`.github/workflows/ci.yml`）。トリガーは main への push、main への pull request、`workflow_dispatch`。`pull_request_target` は使わない
2. **Ubuntu の verify**: ジョブ名 `verify (ubuntu)`（後で必須チェックに指定する名前。変えない）、`ubuntu-24.04`、30 分。checkout → setup-node（Node は手元と同じ 24.13.1）→ `npm ci` → `npm run verify`。手元と同じ 8 チェックを同じ CLI で走らせる（別の実行経路を作らない。ADR-0005）
3. **最初は必須にしない**。必須にする条件は手順書（`docs/ops/ci-and-branch-protection.md` の §2）に案を書き、決定は人間。リリースの判定の根拠は、これまでどおり手元の SHA 固定の worktree での検証で、CI は条件を足すもの（置き換えない）
4. **Windows は測定だけ**: ジョブ名 `measure (windows)`、`windows-2025`、30 分、`continue-on-error: true`。main への push と `workflow_dispatch` だけで走らせる（pull request では走らせない。分数の節約）。Windows を対象にする決定ではない（ADR-0005 のまま）
5. **権限と供給元の固定**:
   - トークンの権限は最上位の `permissions: contents: read` だけで、ジョブで広げない。checkout は `persist-credentials: false`。secrets と秘密の環境変数は使わない。外部のスクリプトを取ってきて実行しない
   - アクションはタグでなく完全な commit SHA で固定し、行末のコメントに版を書く。SHA は GitHub API の GET（`git/ref/tags/<tag>` と `commits/<tag>`）で、タグが指す commit を確かめる
   - 今回の版: `actions/checkout` v7.0.1（`3d3c42e5aac5ba805825da76410c181273ba90b1`）、`actions/setup-node` v7.0.0（`820762786026740c76f36085b0efc47a31fe5020`）。どちらも最新の安定版のメジャー（v7）の中で、公開から 7 日以上たった最新のリリース（setup-node の v7.1.0 は公開から 4 日だった。手元の npm の `min-release-age=7` と同じ考え）
   - キャッシュは使わない（setup-node の自動キャッシュも `package-manager-cache: false` で止める）。verify のレポートを成果物としてアップロードしない（マスク済みでも、レポートを runner の外へ出さない）
   - 同時実行: pull request は同じ ref の古い実行を取り消す。main への push と手動の実行は、実行ごとの group で取り消さない
6. **Branch Protection は、いまは使えない**: 非公開・いまのプランでは GET が 403。手順書に、使えるようになったとき（Public 化か有料のプラン）の手順を書く。`.github/CODEOWNERS` は持ち主の記録として置くが、いまは強制されない

## 代替案
- `ubuntu-latest`・`windows-latest`: 版が黙って変わり、失敗の原因が分かりにくくなる。採らない
- アクションをタグ（`@v7` など）で参照する: タグは動かせる。採らない
- 最初から必須チェックにする: Ubuntu で一度も走っていないので、どこが落ちるか分からない。いまのプランでは必須チェック自体が使えない
- npm のキャッシュを使う: 最初の版は毎回 clean に入れ、キャッシュの鍵と汚染を考えなくて済むようにする。時間が問題になってから考える
- verify のレポートを成果物として上げる: 失敗の手がかりは増えるが、レポートを外へ出す。必要になったら、範囲と保存期間を決めてから
- Windows を pull request でも走らせる: Windows の分数は多く数えられる [推定]。測定は main への push と手動で足りる

## 既知の限界
- **npm の保護設定は runner では効かない**: `min-release-age=7`・`allow-git=none`・`ignore-scripts=true` は利用者の `~/.npmrc` にあり、リポジトリには無い（runner の既定は `null`・`all`・`false`。手元で空の設定を指定して確かめた）。`npm ci` は lockfile のとおり（160 のパッケージがすべて registry から integrity 付き、git の依存なし）に入れ、インストールスクリプトを持つのは macOS 専用の `fsevents` だけ。ワークフローでは変えていない（変えるなら別の決定。案は手順書）
- runner の npm は Node 24.13.1 に同梱の版（手元の `/usr/local` の同梱は 11.8.0）で、手元で使っている npm（11.18.0。利用者が別に入れたもの）と違う [推定: runner の版は確かめていない]
- Branch Protection が使えないので、CI が赤でも main への push は止まらない。タグの前の確認は人の手順（§2 の案）
- CI で落ちたときの手がかりは、ジョブのログ（verify の端末の出力。マスク済み）だけ
- Actions の分数の上限は API で取れなかった（`user` のスコープが要る）
- アクションの SHA を更新する手順（いつ・誰が）は決めていない
- Ubuntu・Windows での実際の結果は、最初の push の後でないと分からない。落ちうる箇所の推定は手順書の §7

## 影響
- 新規: `.github/workflows/ci.yml`、`.github/CODEOWNERS`、`docs/ops/ci-and-branch-protection.md`
- ARCHITECTURE（§3 の構成、§8 のディレクトリ規約、対応プラットフォームの「Linux CI は M3」に注記）、ROADMAP（M3 と「次:」）、README（開発の節に CI の 1 文）
- `src/`・`tests/`・`scripts/`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合・npm の保護設定は変えない
