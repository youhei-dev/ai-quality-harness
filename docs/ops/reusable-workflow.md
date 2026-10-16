# 再利用ワークフロー（verify.yml）の手順書

最終更新: 2026-10-16（v0.9.0。新規）

ほかのリポジトリの CI から `aiqh verify` を走らせるための再利用ワークフロー `.github/workflows/verify.yml` の使い方。決定の根拠は ADR-0031（CI での配布は案 D）。aiqh は、tarball や npm のパッケージとしては配らない。ワークフローが、自分と同じ commit の aiqh のソースを使う。

## 1. 呼び出す側の最小の例

対象リポジトリのルートに `aiqh.config.jsonc` があり、依存は `npm ci` で入る場合（`.github/workflows/quality.yml` など）:

```yaml
name: quality
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  aiqh:
    uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@<40 桁の commit SHA> # v0.9.0
    with:
      setup-command: npm ci
```

- `@` の後ろは **40 桁の commit SHA** にし、行末に版のコメントを付ける（タグやブランチにしない）。この SHA が、ワークフローと aiqh のソースの両方を決める
- 呼び出す側の check の名前は `<呼び出す側の job の名前> / aiqh verify`（上の例では `aiqh / aiqh verify`）
- Python の対象では、`python-version` を足し、`setup-command` に依存を入れるコマンド（例: `python -m pip install -r requirements.txt`）を書く。設定のコマンドが手元の venv を前提にしていないかは、適用の前に確かめる

## 2. inputs

| 名前 | 型 | 既定 | 意味 |
|---|---|---|---|
| `node-version` | string | `24.13.1` | Node.js の版。aiqh は 24 以上が要り、24 未満なら job は失敗する（`aiqh needs Node.js 24 or later`） |
| `python-version` | string | 空 | 空でなければ `actions/setup-python` でその版を入れる |
| `setup-command` | string | 空 | verify の前に、作業ディレクトリで走らせるコマンド（例: `npm ci`）。空なら何もしない |
| `working-directory` | string | `.` | 呼び出す側のリポジトリの中の、verify を走らせる場所。`..` を含むもの、絶対パス、リポジトリの外に解決されるもの（symlink を含む）は止める |
| `config` | string | `aiqh.config.jsonc` | 設定ファイルのパス（作業ディレクトリからの相対） |
| `job-summary` | boolean | `false` | `true` のときだけ、`artifacts/verification/latest.md`（マスク済み）を Job Summary に足す |

artifact のアップロードは無い。レポートは、既定では job の外に出ない。

## 3. ワークフローがすること

1. 呼び出す側のリポジトリを `target/` に checkout する（`persist-credentials: false`）
2. `working-directory` を確かめる（上の表の条件。違えば止める）
3. aiqh を `aiqh-src/` に checkout する（`repository: ${{ job.workflow_repository }}`・`ref: ${{ job.workflow_sha }}`、`persist-credentials: false`）
4. Node.js を入れ、版が 24 以上かを確かめる。`python-version` があれば Python も入れる
5. `aiqh-src/` の `git rev-parse HEAD` が `job.workflow_sha` と同じかを確かめる（**空か食い違いなら止める**）。同じなら `npm ci --omit=dev`（aiqh の lockfile のとおり、実行時の依存だけ）を入れ、`node <aiqh-src>/src/cli.ts` を起動する `aiqh` を PATH に置く
6. `setup-command` を作業ディレクトリで走らせる
7. `aiqh --version` と `aiqh verify --config <config>` を走らせる。verify が FAILED（終了コード非ゼロ）なら job も失敗する
8. `job-summary: true` なら、`latest.md` を Job Summary に足す

- 権限は `contents: read` だけ。job の `env:` で `npm_config_ignore_scripts: "true"` を設定する（呼び出す側のワークフローの `env` は引き継がれないため）
- アクションは、すべて 40 桁の commit SHA で固定している（checkout v7.0.1、setup-node v7.0.0、setup-python v7.0.0）
- 入力の値は `env:` を通して script に渡す（`run:` に式を埋め込まない）
- `setup-command` は、呼び出す側が書いたコマンドを、そのまま呼び出す側の job で走らせる（設定ファイルと同じく、呼び出す側の信頼された入力）

## 4. SHA の見つけ方

版 `vX.Y.Z` の SHA は、タグが指す **commit** の SHA を使う（注釈付きタグのオブジェクトの SHA ではない）:

```bash
git fetch origin --tags                     # 手元の clone で、タグを取り込む
git rev-parse 'vX.Y.Z^{commit}'             # タグが指す commit の 40 桁の SHA
gh api repos/youhei-dev/ai-quality-harness/commits/vX.Y.Z --jq .sha   # clone が無いときは API で（同じ値）
```

CHANGELOG の各版の見出しにも、`commit <SHA> / tag object <SHA>` の形で書いてある（前の SHA を使う）。

## 5. 呼び出す側の Actions の設定の注意

- 呼び出す側の Actions の設定が、アクションと再利用ワークフローの使用を許していること（`allowed_actions: all` なら、そのままでよい）
- `selected` にしているときは、`youhei-dev/ai-quality-harness/.github/workflows/verify.yml@*` か `youhei-dev/*` の形の許可が要る [確認: GitHub の文書]。ワークフローの中で使うアクション（`actions/checkout`・`actions/setup-node`・`actions/setup-python`）も、呼び出す側の設定で許す必要がある見込み [推定]
- 個人のアカウントで `local_only` にしたとき、同じ利用者の別のリポジトリの再利用ワークフローが許されるかは、文書に明記が無い [未確認]
- `sha_pinning_required`（アクションを完全な commit SHA で固定することを強制する設定）は、再利用ワークフローの参照そのものには効かない [確認: GitHub の文書]。このワークフローの中のアクションは、すべて SHA で固定してある
- runner の割り当てと料金は、いつも**呼び出す側**で決まる [確認]。**private の呼び出し側では、非公開の runner（2 CPU）で走り、分数は呼び出す側のアカウントの無料枠（GitHub Free は月 2,000 分）から引かれる**。公開リポジトリの標準の runner は無料
- 公開の aiqh を、呼び出す側の既定のトークンで checkout できるのは推定（GitHub の文書の例が、トークンを渡さずに自分のソースを checkout している）。private の呼び出し側からは、最初の適用のときに確かめる

参考（2026-10-16 の SP1 で読んだ GitHub の文書）:
- 再利用ワークフローの呼び出し方と ref（SHA が最も安全）: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- 呼べる組み合わせ・権限・env・runner と料金: https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
- Actions の設定（`selected` の書き方・`sha_pinning_required`）: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- `job.workflow_repository`・`job.workflow_sha`: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- runner の仕様: https://docs.github.com/en/actions/reference/runners/github-hosted-runners 、料金: https://docs.github.com/en/billing/concepts/product-billing/github-actions

## 6. タグの運用

- 版は semver の `v0.x.y`。`package.json` の `version` とタグを一致させる
- タグは**注釈付きタグ**。release の commit の push で始まった `verify (ubuntu)` が success になってから付ける（`docs/ops/ci-and-branch-protection.md` の 2-1。v0.9.0 では、指示により `reusable (self)` の success も確かめてから付けた）。付けたタグを動かさない・消さない
- 文書では、タグが指す commit の SHA（`git rev-list -n1 <tag>`）を主に書き、注釈付きタグのオブジェクトの SHA は `/ tag object <SHA>` と添える
- **呼び出す側は、タグではなく、タグが指す commit の 40 桁の SHA で固定し、行末に版のコメント（`# vX.Y.Z`）を付ける**。タグは動かせるが、commit の SHA は中身を決める
- 上げるときは、新しい版の SHA に書き換え、コメントの版も直す。CHANGELOG で、その版の変化（とくに inputs と既定値）を確かめる

## 7. 失敗したときの手がかり

| ログの文言 | 意味 |
|---|---|
| `working-directory must not contain '..'` / `must be a relative path` / `resolves outside the caller's repository` | `working-directory` の入力が条件に合わない |
| `aiqh needs Node.js 24 or later` | `node-version` が 24 未満 |
| `the aiqh checkout is not the commit of this workflow (job.workflow_sha)` | aiqh の checkout が、ワークフローの commit と違う（`job.workflow_sha` が空のときも）。fail closed で止めた |
| `VERIFY FAILED` | 対象のチェックが失敗した（aiqh の判定どおり） |
