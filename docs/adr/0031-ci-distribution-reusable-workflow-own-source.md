# ADR-0031: CI での aiqh の配布は、再利用ワークフローが自分と同じ commit のソースを使う形にする（案 D）

- 状態: 採用（v0.9.0。ADR-0009 の「M3 で再評価」の結果のうち CI の部分。手元の `npm link` は ADR-0009 のまま）
- 日付: 2026-10-16（v0.9.0）。注記: 2026-10-17（v0.9.1。適用で確かめたこと。下の「注記（v0.9.1: 適用で確かめたこと）」）。注記: 2026-10-26（v0.15.1。決定 6 の Job Summary の読む場所。末尾の「注記（v0.15.1: Job Summary の場所）」）

## 文脈
- 波 4（M3 の後半）では、aiqh の配布の方式・他のリポジトリから呼ぶ再利用ワークフロー・個人のリポジトリ 2 つ（`youhei-dev/trim-manager`・`youhei-dev/ai-tutor-browser`）への適用を決める。適用先は 2 つとも private で、ワークフローは無い（SP1、2026-10-16）
- ADR-0009（M1 の配布は `npm link`）は「M3 で再評価」だった。論点は次の 4 つ
  - 対象ごとに版を固定できない
  - CI では `npm link` が使えない
  - 公開配布にすると、手元の `min-release-age=7` で 7 日遅れる
  - git 依存は `allow-git=none` で入らない
- **SP1 の要点**（読み取りだけの調査。報告 `claude提出_aiqh_wave4_sp1_20261016-1539.md`）:
  - package: lifecycle のスクリプトは無く、`dist/` は追跡外。`npm pack` は 108 エントリ。tarball のバイト（integrity）は、ビルドした木の `dist/cli.js` の権限で変わる
  - 手元の npm（11.18.0）は `ignore-scripts=true`・`min-release-age=7`・`allow-git=none`・`allow-remote=none`。npm 12 では `allow-git`・`allow-remote` の既定が `none`
  - 再利用ワークフローは `owner/repo/.github/workflows/file.yml@ref` で呼ぶ。ref は commit SHA が「最も安全」（GitHub の文書）。runner と料金は呼び出す側で決まり、呼び出す側のワークフローの `env` は引き継がれない
  - 呼ばれた側のジョブは、`job.workflow_repository`・`job.workflow_sha`（GitHub が 2026-09 に足した context）で、自分のリポジトリと commit を知ることができる
- 4 つの案:
  - A: GitHub Releases に tarball を置く
  - B: npm に公開する
  - C: git のタグから入れる（`github:youhei-dev/ai-quality-harness#vX.Y.Z`）
  - D: 配布物を作らない。再利用ワークフローが、自分と同じ commit の aiqh のソースを checkout して使う

## 決定（人間の決定。2026-10-16）
1. **CI での配布は案 D**。tarball も npm のパッケージも作らない
   - `.github/workflows/verify.yml`（`on: workflow_call` だけ）が、`job.workflow_repository` の `job.workflow_sha` を `aiqh-src/` に checkout する
   - `npm ci --omit=dev` で、aiqh の lockfile のとおり実行時の依存 3 つだけを入れる
   - `node <aiqh-src>/src/cli.ts` を起動する小さなスクリプトを、`$RUNNER_TEMP/aiqh-bin/aiqh` に置いて PATH に足す
2. **fail closed の照合**: 入れる手順の最初に、checkout した `git rev-parse HEAD` が `job.workflow_sha` と同じかを確かめる。空か食い違いなら、job を失敗させる
3. **呼び出す側は 40 桁の commit SHA で固定**し、行末に版のコメントを付ける（`uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@<SHA> # vX.Y.Z`）。タグでは固定しない。この 1 つの SHA が、ワークフローと aiqh の両方を決める
4. **ワークフローの形**:
   - 権限は `contents: read` だけ
   - アクションは、すべて 40 桁の commit SHA で固定し、行末に版を書く。checkout・setup-node は `ci.yml` と同じ。setup-python は v7.0.0 = `5fda3b95a4ea91299a34e894583c3862153e4b97`（GitHub API の GET で、タグが指す commit を確かめた。公開から 7 日以上。ADR-0025 の決定 5 と同じ考え）
   - job の `env:` に `npm_config_ignore_scripts: "true"` を書く（呼び出す側のワークフローの env は引き継がれない）
   - checkout は 2 つとも `persist-credentials: false`。対象は `target/`、aiqh は `aiqh-src/` に分ける。対象の中に aiqh を置くと、対象の `security-scan`（追跡外のファイルも走査する）が aiqh まで走査するため
   - 入力の値は `env:` を通して script に渡し、`run:` に式を埋め込まない
5. **inputs は最小の 6 つ**:
   - `node-version`: 既定 24.13.1。24 未満は、分かる文言で失敗させる
   - `python-version`: 空なら準備しない
   - `setup-command`: 作業ディレクトリで、verify の前に走らせる
   - `working-directory`: `..` と絶対パスを止め、対象の外に解決されるもの（symlink を含む）も止める。この確かめは、作業ディレクトリを使うどの手順よりも前に置く
   - `config`
   - `job-summary`
6. **レポート**: 既定では job の外に出さない。`job-summary: true` のときだけ、`artifacts/verification/latest.md`（マスク済み）を Job Summary に足す。artifact には上げない（ADR-0025 の自己 CI と同じ考え）
7. **自己適用**: `ci.yml` に job `reusable (self)` を足し、`uses: ./.github/workflows/verify.yml`（`setup-command: npm ci`）で、aiqh 自身を対象に呼ぶ
   - aiqh 自身の設定は、8 チェックすべてが npm の script と `npm audit` で、PATH の `aiqh` に頼らない
   - トリガーは `verify (ubuntu)` と同じ。必須チェックにはしない（ROADMAP の項目 44。波 4 の後で決める）
8. `package.json` の `private: true` は変えない。npm にも Releases にも出さない

## ADR-0009 との関係
- **手元**（利用者の Mac）: ADR-0009 のとおり、`npm link` で PATH に置いた `aiqh` のまま。対象の `package.json` に依存は足さない
- **CI**（GitHub Actions）: この ADR の案 D
- ADR-0009 の論点のうち「CI では `npm link` が使えない」と「対象ごとに版を固定できない」は、CI の上では、呼び出す側の SHA で解く。手元で対象ごとに版を固定することは、引き続きできない（必要になったら A を再評価する）

## 代替案（採らなかった理由）
- **A（Releases の tarball）**: `private: true` のままにでき、Immutable releases と SHA-256 の照合で改ざんに強くできる。ただ、版ごとの手作業が増える（tarball を決まった場所で作る、Release を作る、ハッシュを記録する）。手元の `allow-remote=none` で、URL からは入らない
- **B（npm）**: `private: true` を外し、名前の確保・アカウントの保護・公開の取り消しにくさを負う。手元は `min-release-age=7` で 7 日遅れる
- **C（git のタグ）**: `dist/` が追跡外で `prepare` も無いので、入れても bin が無い見込み。手元は `allow-git=none` で入らない。使うには、`dist/` を git に入れるか、`prepare` で build する必要がある（後者は `ignore-scripts` と衝突する）

## 結果と未確認の点
- この版で確かめたこと（SP1 §10 のうち）:
  - `npm ci --omit=dev` だけの写し（手元の macOS、`tmp/` の中）で、依存は commander・jsonc-parser・zod の 3 つだけが入り、起動用のスクリプト経由の `aiqh --version` が動いた
  - `verify.yml` と `ci.yml` の形は、新しいテスト 2 ファイル（YAML のテキストを読む）で固定した
- v0.9.0 の push の CI（`reusable (self)`）で確かめること（結果は、次の記録の commit で ROADMAP と CHANGELOG に書く）:
  - `job.workflow_sha` の実際の値と照合
  - `target/` での aiqh 自身の verify
  - 自分のリポジトリの checkout が `repository: ${{ job.workflow_repository }}` で通るか
- 残るもの（適用のときに確かめる）:
  - private の呼び出し側から、公開の aiqh の再利用ワークフローを呼び、そのリポジトリを checkout できるか（公式の例からの推定）
  - 適用先の設定のコマンドが CI で動くか（とくに Python の venv の前提）
  - Bypass が `always` のときの必須チェックの扱い（項目 44）
- 既知の限界:
  - `job.workflow_*` は新しい context で、GitHub Enterprise Server では使えない
  - Node の TypeScript の実行（型を消して動かす）に頼るので、Node 24 以上でしか動かない（`engines` と同じ）。対象のビルドに 24 未満の Node が要るときは、この形では使えない
  - `setup-command` は、呼び出す側が書いたコマンドを、呼び出す側の job でそのまま走らせる（設定ファイルと同じく、呼び出す側の信頼された入力）
- private の呼び出し側では、実行は非公開の runner（2 CPU）で、分数は呼び出す側の無料枠から引かれる（runner と料金は呼び出す側で決まる）

## 注記（v0.9.1: 適用で確かめたこと）
2026-10-17 に、個人のリポジトリ 2 つ（`youhei-dev/trim-manager`・`youhei-dev/ai-tutor-browser`。どちらも private）へ適用した（ROADMAP の M3 の「波 4」）。上の「結果と未確認の点」のうち、次を確かめた。決定は変えない。
- ほかのリポジトリ（private）から、公開の aiqh の `verify.yml` を 40 桁の commit SHA で呼べる（`uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@7f2146da61702e859f0fddf0834a4f6414b0b6fb # v0.9.0`）
- `job.workflow_repository` と `job.workflow_sha` は、呼ばれた側（`youhei-dev/ai-quality-harness`・`7f2146d…`）を指す。aiqh の checkout はその commit で、`git rev-parse HEAD` との照合が通った
- private の呼び出し側の既定のトークンで、公開の aiqh を checkout できる（トークンは渡していない）
- `python-version` の経路（setup-python。CPython 3.13 系）が動く。設定のコマンドが `.venv/bin/python` を使う形でも、`setup-command` で `.venv` を作れば動く
- `working-directory` が既定の `.` の経路が動く
- run: trim-manager の PR #2 の `38985874746`・main の `38986865678`、ai-tutor-browser の PR #1 の `38989579565`・main の `38990545338`。どれも success

残る未確認の点:
- `workflow_dispatch`（手動の実行）と、呼び出す側の `concurrency` の取り消しの動き
- Node 24 未満のときの文言（`aiqh needs Node.js 24 or later`）
- `job.workflow_sha` が空、または aiqh の checkout と食い違うときに止まる経路
- GitHub Enterprise Server（`job.workflow_*` が使えない）
- CI で通っていない入力の経路: `job-summary: true`、`working-directory` が `.` 以外
- Bypass が `always` のときの必須チェックの扱い（ROADMAP の項目 44）

分かった制約（ROADMAP の項目 39・45・46）:
- CI のログに pytest の件数が出ない（PASS のチェックの出力は表示されず、pytest の読み取りが無い）
- `actions/runs/<id>/timing` の `billable` が 0 を返した。呼び出す側の分数は、請求の画面で確かめる
- `aiqh init` が node:test を unit として検出しない

## 注記（v0.15.1: Job Summary の場所。ROADMAP の項目 51。2026-10-26）
決定 6（レポートは job の外に出さない。`job-summary: true` のときだけ `latest.md` を Job Summary に足す）は変えない。足す `latest.md` の場所だけを直した（人間の決定 batch2 の B2-Q3・B2-Q4 の A。設計は `docs/reviews/batch2-design/design-final.md` の §2）。
- 今までは作業ディレクトリの `artifacts/verification/latest.md` だけを読んだ。設定が下のディレクトリにあるときと `output.dir` を変えたときは、何も足されず（エラーにもならず）、作業ディレクトリに古い `latest.md` があれば、それが足された（batch2 の設計の段で、手元でワークフローの本文を走らせて確かめた）
- v0.15.1 から、`job-summary: true` のときだけ、手順「aiqh verify」が `$RUNNER_TEMP` の下にその run だけの空のディレクトリ（`mktemp -d`）を作り、手順の出力 `report-dir` に書いてから、verify に `--output-dir` でそこへ書かせる。要約の手順はその `latest.md` だけを読み、無ければ決まった 1 行を足す。`job-summary: false` の呼び出しは変わらない。src は変えていない（`--output-dir` は前からある）
- 自己適用（`reusable (self)`）に `job-summary: true` を足し、CI の毎回の run でこの手順を通す（上の「残る未確認の点」の `job-summary: true` の経路）。2 つの手順の本文は、手元のテスト（`tests/reusable-workflow-run.test.ts`。bash で本文を走らせる 7 つの場面）でも確かめる
