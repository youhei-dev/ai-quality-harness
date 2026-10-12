# CI と Branch Protection の手順書

最終更新: 2026-10-12（波 2〈M3 の前半〉の 1 つ目。ADR-0025）

本体リポジトリ自身の CI（自己 CI）と、main を守る設定の手順をまとめる。決定の根拠は ADR-0025。
この文書の時点では、ワークフローは**まだ GitHub で一度も走っていない**（push の前）。

## 1. CI の中身（`.github/workflows/ci.yml`）

| ジョブ（名前） | runner | いつ走るか | 手順 | 失敗したとき |
|---|---|---|---|---|
| `verify (ubuntu)` | `ubuntu-24.04` | main への push、main への pull request、手動（`workflow_dispatch`） | checkout → setup-node（Node 24.13.1）→ `npm ci` → `npm run verify`（手元と同じ 8 チェック） | 実行が赤になる。**まだ必須チェックではない**（下の §2） |
| `measure (windows)` | `windows-2025` | main への push と手動だけ（pull request では走らない。分数の節約） | 同じ | `continue-on-error`: 実行は赤にならない。測定だけ（Windows は対象外。ADR-0005） |

共通:
- トークンの権限は `contents: read` だけ（最上位で決め、ジョブで広げない）。checkout は `persist-credentials: false`。secrets は使わない。`pull_request_target` は使わない
- アクション（`actions/checkout`・`actions/setup-node`）は完全な commit SHA で固定し、行末のコメントに版を書く。SHA は GitHub API で、タグが指す commit を引いて確かめた（ADR-0025）
- キャッシュは使わない（setup-node の自動キャッシュも `package-manager-cache: false` で止める）。成果物（verify のレポート）はアップロードしない
- 同時実行: pull request は同じ ref の古い実行を取り消す。main への push と手動の実行は取り消さない
- ジョブ名 `verify (ubuntu)` は、後で必須チェックに指定するときの名前なので変えない（変えると、必須チェックが「報告を待つ」のまま進まなくなる）

CI が置き換えないもの: リリースの判定の根拠は、これまでどおり手元の SHA 固定の worktree での検証（プロジェクトの `CLAUDE.md` のリリース手順）。CI は条件を足すもので、置き換えない。

### npm の保護設定と CI

手元の npm の保護設定（`min-release-age=7`・`allow-git=none`・`ignore-scripts=true`）は利用者の `~/.npmrc` にあり、リポジトリには無い。**runner では効かない**（runner の既定は `null`・`all`・`false`。手元で空の設定を指定して確かめた）。

- `npm ci` は `package-lock.json` のとおりに入れる。lockfile の 160 のパッケージはすべて `registry.npmjs.org` から integrity 付きで、git の依存は無い
- インストールスクリプトを持つのは `fsevents` だけで、macOS 専用（Linux・Windows では入らない見込み [推定]）
- そのため、いまの lockfile では差は小さい見込み [推定]。ワークフローでは変えていない（変えるなら別の決定）。案: `npm ci --ignore-scripts`、またはジョブの環境変数 `npm_config_ignore_scripts: "true"`

## 2. 必須にする条件（案。決定は人間）

人間の決定（2026-10-12）: 最初は必須にしない。Ubuntu で落ちる箇所を直して緑が続いてから、タグの前の条件にする（後の版で）。

案:
1. `verify (ubuntu)` が、main への push で**続けて 5 回**緑（再実行での緑は数えない。少なくとも 2 つの版にまたがる）になったら、タグの前の条件に足す
2. タグの前の条件の確かめ方: release の commit の SHA について、`gh run list --workflow ci.yml --commit <SHA>` で `verify (ubuntu)` が `success` であることを読む（読み取りだけ）
3. 赤になったら: Ubuntu だけの失敗は原因を切り分ける。テストの直しは同じ波で、製品（信号の経路など）に及ぶものは別の版で独立レビュー。`npm audit` の勧告だけで赤になったときは、依存関係の判断として人間に渡す
4. Branch Protection が使えるようになったら（§3）、`verify (ubuntu)` を必須チェックにする
5. `measure (windows)` は必須にしない（測定だけ）

## 3. Branch Protection（または rulesets）

**いまの状態**（2026-10-12 に GET で確かめた）: `GET repos/youhei-dev/ai-quality-harness/branches/main/protection` と `GET …/rulesets` は、どちらも HTTP 403 `Upgrade to GitHub Pro or make this repository public to enable this feature.`。**非公開のまま・いまのプランでは使えない**。
以下は、使えるようになったとき（Public にするか、有料のプランにしたとき）の手順。

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

### 3-3. 自分が締め出されないための注意

- Bypass list に自分（Repository admin）を入れておく。誤った設定でも、管理者は ruleset を無効にできる
- 必須チェックの名前は、実際に走ったジョブの名前を一覧から選ぶ（打ち間違えると、チェックが永遠に「報告を待つ」になり、マージできない）
- 承認の数を 1 以上にしない（1 人では満たせない）。Code Owners のレビューを必須にしない（同じ理由）
- まず削除の禁止と force push の禁止だけで有効にし、必須チェックは後から足す
- タグも守るなら、tag ruleset で `v*` の削除と更新を禁止する（プロジェクトの規則「タグを消さない・上書きしない」と同じ）

## 4. CODEOWNERS（`.github/CODEOWNERS`）

- 持ち主を `@youhei-dev` にしたもの: `.github/`、`aiqh.config.jsonc`、`package.json`、`package-lock.json`、`tsconfig.json`・`tsconfig.build.json`、`eslint.config.js`、`vitest.config.ts`、`.gitignore`、`scripts/`、`tests/structure/`（検証のしかたを決めるファイル。ROADMAP の R-006 の候補 1）
- **いまは強制されない**: 非公開のリポジトリで、いまのプランでは Branch Protection も rulesets も使えない（§3）。Code Owners のレビューを必須にするには、Branch Protection か ruleset が要る
- 1 人のリポジトリでは、自分の pull request に自分は承認を出せないので、Code Owners のレビューを必須にすると締め出される（3-3）。持ち主の記録として置く

## 5. CI の結果の読み方（読み取りだけ）

人間の決定（2026-10-12）: Claude Code は `gh` で CI の結果を読んでよい（読み取りだけ）。

```bash
gh run list --workflow ci.yml --limit 5            # 最近の実行の一覧（状態・結論・commit）
gh run view <run-id>                               # 1 つの実行のジョブと結論
gh run view <run-id> --log-failed                  # 失敗した手順のログだけ
```

再実行・取り消し・手動の実行（`gh run rerun`・`gh run cancel`・`gh workflow run`）は書き込みなので、人間の承認の後に行う。

## 6. ワークフローを初めて push するとき

- `.github/workflows/` の下のファイルを HTTPS で push するには、使う資格情報（OAuth のトークンや PAT）に `workflow` の権限が要る。無いと GitHub が push を拒む
- このリポジトリの push は、git の `credential.helper`（`osxkeychain`）が保存した資格情報を使う（`gh` の資格情報の仲介は設定されていない。2026-10-12）。`gh auth status` のスコープは `gist`・`read:org`・`repo` で、`workflow` は無い
- 最初の push で Actions の実行が始まる（§1 の表のとおり。main への push なので、`verify (ubuntu)` と `measure (windows)` の両方）

## 7. 確かめていないこと

- Ubuntu・Windows で一度も走っていない。落ちうる箇所の推定（rest2 の SP1）: dash でのシェルの構文、回収前のゾンビの扱い（`src/runner/execute.ts` の `groupAlive`）、vCPU が少ないことによる時間の余裕の小さいテスト、初めて走る unzip・python3 のテスト（`tests/zip-interop.test.ts`）、`npm audit` の勧告
- Actions の分数の上限（API は `user` のスコープが要り、取れなかった）
- CODEOWNERS がいまのプランで何もしないこと（GitHub の文書による [推定]）
