# 再利用ワークフロー（verify.yml）の手順書

最終更新: 2026-10-26（v0.15.1。§2 の `job-summary` と §3 の手順 7・8: Job Summary は、その run だけの一時のディレクトリのレポートを読む〈ROADMAP の項目 51〉）。その前: 2026-10-23（v0.14.0。§8 の pytest の件数〈ROADMAP の項目 39〉）。その前: 2026-10-19（v0.12.1。§6 と §7 に、運用テンプレート〈前の版に戻す・見張る項目・設定の変更〉への参照）。その前: 2026-10-17（v0.9.1。Python の対象の例〈§1.1〉と、適用で分かった注意〈§8〉）。初版: 2026-10-16（v0.9.0）

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
- SHA は v0.9.0（`7f2146da61702e859f0fddf0834a4f6414b0b6fb`）のままでよい。`verify.yml` は v0.9.1 で変わらない（v0.9.1 は docs と version だけ）ので、v0.9.1 の SHA で呼んでも動きは同じ（`aiqh --version` が 0.9.1 を出すことだけが違う）
- 呼び出す側の check の名前は `<呼び出す側の job の名前> / aiqh verify`（上の例では `aiqh / aiqh verify`）
- Python の対象は、下の §1.1 の例を見る（`python-version` を足し、`setup-command` で依存を入れる）

### 1.1 Python の対象の例（v0.9.1）

設定のコマンドが、`.venv/bin/python -m pytest -q tests/` のように、リポジトリの中の `.venv` を使う形のとき:

```yaml
jobs:
  aiqh:
    uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@<40 桁の commit SHA> # v0.9.0
    with:
      python-version: "3.13"
      setup-command: python -m venv .venv && .venv/bin/pip install -r requirements.txt
```

- setup-python が入れた `python` で、作業ディレクトリに `.venv` を作り、依存を入れる。設定のコマンドの `.venv/bin/python` は、その `.venv` を指す
- `.venv/` は、呼び出す側の `.gitignore` で ignore しておく（security の走査が、未追跡のファイルとして読まないように）
- `on:`・`permissions:` などは、上の例と同じ
- 適用の前に、§8 の注意（`.env` と手元の venv に頼らない、依存の版の固定）を確かめる

## 2. inputs

| 名前 | 型 | 既定 | 意味 |
|---|---|---|---|
| `node-version` | string | `24.13.1` | Node.js の版。aiqh は 24 以上が要り、24 未満なら job は失敗する（`aiqh needs Node.js 24 or later`） |
| `python-version` | string | 空 | 空でなければ `actions/setup-python` でその版を入れる |
| `setup-command` | string | 空 | verify の前に、作業ディレクトリで走らせるコマンド（例: `npm ci`）。空なら何もしない |
| `working-directory` | string | `.` | 呼び出す側のリポジトリの中の、verify を走らせる場所。`..` を含むもの、絶対パス、リポジトリの外に解決されるもの（symlink を含む）は止める |
| `config` | string | `aiqh.config.jsonc` | 設定ファイルのパス（作業ディレクトリからの相対） |
| `job-summary` | boolean | `false` | `true` のときだけ、その run の `latest.md`（マスク済み）を Job Summary に足す。このとき verify は、レポートを作業ディレクトリの `artifacts/verification/` ではなく、その run だけの一時のディレクトリ（`$RUNNER_TEMP` の下）に書く（v0.15.1。下の §3 の 7・8） |

artifact のアップロードは無い。レポートは、既定では job の外に出ない。

## 3. ワークフローがすること

1. 呼び出す側のリポジトリを `target/` に checkout する（`persist-credentials: false`）
2. `working-directory` を確かめる（上の表の条件。違えば止める）
3. aiqh を `aiqh-src/` に checkout する（`repository: ${{ job.workflow_repository }}`・`ref: ${{ job.workflow_sha }}`、`persist-credentials: false`）
4. Node.js を入れ、版が 24 以上かを確かめる。`python-version` があれば Python も入れる
5. `aiqh-src/` の `git rev-parse HEAD` が `job.workflow_sha` と同じかを確かめる（**空か食い違いなら止める**）。同じなら `npm ci --omit=dev`（aiqh の lockfile のとおり、実行時の依存だけ）を入れ、`node <aiqh-src>/src/cli.ts` を起動する `aiqh` を PATH に置く
6. `setup-command` を作業ディレクトリで走らせる
7. `aiqh --version` と `aiqh verify --config <config>` を走らせる。verify が FAILED（終了コード非ゼロ）なら job も失敗する
   - `job-summary: true` のときだけ（v0.15.1。ROADMAP の項目 51）: verify の前に `mktemp -d "$RUNNER_TEMP/aiqh-verification.XXXXXX"` でその run だけの空のディレクトリを作り、手順の出力 `report-dir` に書いてから、`aiqh verify --config <config> --output-dir <そのディレクトリ>` で、レポート（`latest.json`・`latest.md`・`history/`）をそこへ書かせる。設定の場所（下のディレクトリ）や `output.dir` によらず、その run のレポートが Job Summary に届く。作業ディレクトリの `artifacts/verification/` には書かれず、ログの `report:` の行はその一時のディレクトリを指す。`job-summary: false`（既定）なら今までどおり（`--output-dir` を渡さない）
8. `job-summary: true` なら、手順の出力 `report-dir` の `latest.md` を Job Summary に足す（verify が FAILED でも足す）。無ければ（verify がレポートを書かずに終わったなど）、決まった 1 行 `aiqh: latest.md was not written (see the log of the aiqh verify step)` を足す。作業ディレクトリの古い `latest.md` は読まない
   - 同じ job の後の手順への影響: 再利用ワークフローの job には、呼び出す側から手順を足せない。`verify.yml` の中で、Job Summary の手順の後にレポートを読む手順は無い。呼び出す側の別の job は、もとから作業ディレクトリのレポートを読めない（job ごとに別の runner）

- 権限は `contents: read` だけ。job の `env:` で `npm_config_ignore_scripts: "true"` を設定する（呼び出す側のワークフローの `env` は引き継がれないため）
- アクションは、すべて 40 桁の commit SHA で固定している（checkout v7.0.1、setup-node v7.1.0、setup-python v7.1.0）
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
- 公開の aiqh を、呼び出す側の既定のトークンで checkout できる [確認: 2026-10-17、private の呼び出し側 2 つで。v0.9.0 の時点では、GitHub の文書の例からの推定だった]。トークンは渡さない

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
- 上げた後に aiqh の側の原因で困ったら、前の版の SHA に戻す（`docs/ops/rollback.md`）。タグを消したり動かしたりして戻さない

## 7. 失敗したときの手がかり

| ログの文言 | 意味 |
|---|---|
| `working-directory must not contain '..'` / `must be a relative path` / `resolves outside the caller's repository` | `working-directory` の入力が条件に合わない |
| `aiqh needs Node.js 24 or later` | `node-version` が 24 未満 |
| `the aiqh checkout is not the commit of this workflow (job.workflow_sha)` | aiqh の checkout が、ワークフローの commit と違う（`job.workflow_sha` が空のときも）。fail closed で止めた |
| `VERIFY FAILED` | 対象のチェックが失敗した（aiqh の判定どおり） |

何を見たら何をするかの表は `docs/ops/monitoring.md` の §3、`with:` の `config` などを変えるときの手順は `docs/ops/policy-change.md`。

## 8. 適用で分かった注意（v0.9.1）

2026-10-17 の、個人のリポジトリ 2 つ（private）への適用で分かったこと。

- **CI には `.env` も手元の venv も無い**。テストや設定のコマンドが、それに頼らないようにする。たとえば、`.env` の値が無いと import のときに終わるモジュールを、テストが値を置かずに import すると、pytest は 1 件も走らずに止まる。適用の前に、追跡しているファイルだけの clone（`.env` なし）と新しい venv で、テストが通るかを手元で確かめる
- **依存は版を固定しておく**。`>=` だけだと、CI はその日の最新を入れ、手元と違う版になる（実際に、新しい版の依存が、テストの import するパッケージを連れてこなくなり、集める途中で止まった）。少なくとも直接の依存は `==` で固定し、テストが直接 import するパッケージも requirements に書く
- **pytest の件数はログに出なかった**（v0.13.x まで）。aiqh は PASS のチェックの出力を表示せず、pytest の出力の読み取りも無かった（ROADMAP の項目 39）。**v0.14.0 から**、呼び出す SHA を v0.14.0 以降にすると、pytest の要約が端末の `parsed: pytest — …` の行（PASS のチェックにも出る）と `latest.md` の Parsed Output に出て、`job-summary: true` なら Job Summary にも入る。読むのは、コマンドが pytest を実行する単純コマンド 1 つ（`.venv/bin/python -m pytest -q tests/` など。前に `cd <1 語>` を置いてよい）のときだけ（`docs/CONFIG_SPEC.md` の §5.3a）
- **`actions/runs/<id>/timing` の `billable` は 0 を返した**（private の呼び出し側 2 つの run。`run_duration_ms` は 51,000）。0 の意味は確かめていない。呼び出す側の分数は、GitHub の請求の画面で確かめる（ROADMAP の項目 46）
- 1 回の job の時間の目安（2026-10-17）: Node の対象（5 チェック）で 46〜47 秒、Python の対象（2 チェック。venv と pip を含む）で 41〜47 秒
