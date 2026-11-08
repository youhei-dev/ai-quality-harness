# ci 手順書（`docs/ops/ci-and-branch-protection.md`）の文案（最終。v0.18.3: §3 の tag-protection・sha_pinning、§5 と §8 の gh CLI）

行番号は 2026-11-08 の `d4f1697` の時点。人間の決定 B5-Q5 = A・B5-Q6・B5-Q11 = A。設計〈最終〉§2.2 の 2〜4。R2 で (3) を直した（B5-D-R1-002）。(1)・(2) は R1 から変えていない。最終: R2 の案と同じ中身（参照の書き方だけ直した）。どれも docs だけ（GitHub の設定・ruleset は変えない）。

## (1) §3 の `:99`（rule insights の箇条の末尾の「… 未確認」）: sha_pinning（B5-Q11 = A。記録して閉じる）

`:99` の文は変えず、その下に 1 段下げて足す:

> - 注記（v0.18.3。batch5 の B5-Q11 = A。記録して閉じた）: 適用先の run に、どちらのリポジトリの `sha_pinning_required` が当たるか
>   - 設定の読み（2026-11-08。`GET repos/<owner>/<repo>/actions/permissions`、持ち主のトークンで読んだ。書いていない）: aiqh は `sha_pinning_required: true`、**適用先 A・B は `false`**（`enabled`・`allowed_actions` は 3 つとも同じ `true`・`all`）
>   - GitHub の文書（2026-11-08 に読んだ要約。原文の一字一句は照らしていない）: SHA の固定は Actions の「allowed actions」の方針の中の設定で、有効なら、完全な commit SHA で固定していないアクションを使うワークフローは失敗する。再利用ワークフローはタグでも参照できる。再利用ワークフローを使うには、呼ぶ側のリポジトリの Actions の許可の設定が、そのアクションと再利用ワークフローの使用を許す必要がある。**呼ぶ側・呼ばれる側のどちらの `sha_pinning_required` が当たるかは書かれていない**
>   - 推定: 方針は呼ぶ側の設定で評価される（呼ぶ側 = 適用先 A・B の `false` が当たる）。確かめていない（確かめるには、aiqh と適用先の両方に、使い捨ての branch とワークフローを書く必要がある。人間の決定で行わない）
>   - **どちらが当たっても、今の結果は同じ**: `verify.yml` が使う外のアクションは 4 行（checkout 2・setup-node 1・setup-python 1）で、どれも 40 桁の commit SHA。`tests/reusable-workflow.test.ts:105-112`（「pins every action to a 40-character commit SHA with the version in a trailing comment」）が固定している。適用先 A・B の `quality.yml` の `uses:` は、この再利用ワークフローの 1 行だけで、40 桁の SHA で書いている（ADR-0025 の決定 9）。違いが出るのは、`verify.yml` にタグで参照するアクションを入れたときだけで、それはテストと ADR-0025 が止める

## (2) §3 の `:105`（「試していないこと: 消すこと・付け替えることが拒まれるかは …」）: tag-protection（B5-Q5 = A。設定と文書の読みで閉じる）

`:105` の文は変えず、その下に 1 段下げて足す:

> - 注記（v0.18.3。batch5 の B5-Q5 = A。設定と文書の読みで記録して閉じた。実地では試さない）
>   - **確かめた範囲**（2026-11-08。どれも GET だけ）:
>     - ruleset（`GET …/rulesets/26732066`）: name `tag-protection`、target `tag`、source_type `Repository`、enforcement `active`、conditions の include `["refs/tags/v*"]`・exclude `[]`、rules `deletion` と `update`（どちらも `parameters` なし）、`bypass_actors: []`、`current_user_can_bypass: "never"`。作成と更新の時刻は同じ 2026-11-07T07:32:03+09:00（設定した後に変わっていない）。ruleset は `main-protection`（25218296）と合わせて 2 つ
>     - rule insights（`GET …/rulesets/rule-suites?time_period=month`）: 37 件がすべて `pass`（`fail` 0）。タグは 2 件（`refs/tags/v0.18.1`・`refs/tags/v0.18.2`。どちらも before が 40 桁の 0 = 作成）で、`tag-protection` の `update` と `deletion` が評価されて `pass`（上の 2 つの「確かめたこと」）。`time_period` を付けない読みは直近の短い期間の件数だけ（2026-11-08 は 6 件）で、`:99` の「1 件」も、その読みの値と見られる（推定）
>     - GitHub の文書（Available rules for rulesets。2026-11-08 に読んだ要約。原文の一字一句は照らしていない）: 「Restrict deletions」は、bypass の権限を持つ人だけが、対象の名前の branch・タグを消せる。「Restrict updates」は、bypass の権限を持つ人だけが、対象の名前の branch・タグに push できる。違反した push の結果（エラーの文）は書かれていない
>     - → 設定は、文書の条件（bypass を持つ人だけが消せる・付け替えられる）に合い、bypass を持つ人はいない（自分も `never`）。タグの push のたびに、この ruleset が実際に評価されている
>   - **確かめていない範囲**: 消すこと・付け替えることが実際に拒まれること、拒まれたときのエラーの文、経路ごとの違い（`git push` の削除・force push、REST API の `DELETE …/git/refs/tags/…`、Web の画面のタグ・release の削除）、後の GitHub の変更
>   - **閉じる理由**: この文書の §8 の手順 7 は、タグを消す・付け替える操作をそもそも使わない（送った後に誤りに気づいたら、次の版を出す）。拒まれるかどうかを頼りにする場面が無い。実地で試すと、拒まれても拒まれなくても、公開のリポジトリに取り返しのつかない跡が残る（本物のタグ・使い捨てのタグ）か、別の公開リポジトリと ruleset の作成が要る。人間の決定で、ここまでで閉じる

## (3) §5（CI の結果の読み方）: gh CLI の版と telemetry（B5-Q6。B5-D-Q2 = A、R1 の条件つき。R2 で確かめの順を直した: B5-D-R1-002）

§5 の最初の段落（`:148`「人間の決定（2026-10-12）: Claude Code は `gh` で CI の結果を読んでよい（読み取りだけ）。」）の後に足す:

> 手元の gh（v0.18.3。2026-11-08）:
>
> - **telemetry を止めている**: gh は 2.91.0 から、既定で使い方の情報（仮名の端末の ID・OS・版・コマンドの名前など）を送る。止め方は 2 つで、両方にしている: シェルの起動の設定の環境変数 `GH_TELEMETRY=false` と、`gh config set telemetry disabled`。**環境変数が設定より優先する**（GitHub CLI の telemetry の文書。2026-11-08 に読んだ要約）。そのため、設定が `disabled` でも、環境変数が無効の値でなければ止まっていない
> - **gh を使う前の確かめ（この順。gh のどのコマンドよりも先に 1 を読む）**:
>   1. `printenv GH_TELEMETRY` が `false`・`0`・`disabled` のどれか。未設定・空・`enabled`・`log`・`1`・`true`・そのほかの値なら、**gh を一度も走らせずに止まる**（承認していない外への送信、または `log` の値による標準エラーへの出力になる）。文書の要約では空の値と `DO_NOT_TRACK=true` でも無効になるが、この手順では空を止める側に置き、`DO_NOT_TRACK` には頼らない
>   2. 同じシェルから起こす子のシェル（`zsh -c 'printenv GH_TELEMETRY'`、テストと verify に使う `caffeinate -i zsh -c 'printenv GH_TELEMETRY'`）でも同じ値。worktree の中のコマンドも同じシェルから起こす（環境変数は作業の場所によらず、起こしたプロセスから継承される）。サブエージェントに gh を使わせるときは、その依頼文に同じ確かめを書く
>   3. `gh config get telemetry` が `disabled`
>   4. `gh --version` が 2.99.0 以上（確かめた版は 2.103.3。2026-10-26 の release。Homebrew。人が 2026-11-08 に 2.89.0 から上げた）
> - 環境変数は対話のシェルの設定で入る（2026-11-08 の確かめ: 変数を外して非対話のシェルを起こすと空、対話のシェルでは `false`）。対話のシェルを通らない起動経路（GUI のアプリなど）は、この手順の外。そこでは設定の `disabled` だけが残る
> - 2.89.0 からの直しのうち、この文書の手順で使うコマンドに関わるもの（release notes の読み。試していない）:
>   - v2.92.0: `gh run view --log`・`--log-failed` が、ワークフローの log の中の端末のエスケープの並びを、無害にせずに出していた（GHSA-crc3-h8v6-qh57）
>   - v2.97.0: `gh api`・`gh pr diff` などが、外から来た中身の端末のエスケープの並びを無害にせずに出していた（GHSA-3m3g-3wcr-px46）。URL のパスの部品のエスケープ漏れで、別の資源に向くことがあった（GHSA-4fjg-2h4q-fwg3）。`gh auth status` がトークンの一部を出す形があった（GHSA-cg6r-mpgc-h9mm）
>   - v2.99.0: `gh pr merge --delete-branch` を、linked worktree のあるリポジトリで安全に扱う（§8 の手順 5 は `--delete-branch` を使い、検証は worktree で行う）
>   - `--match-head-commit`・`gh run list`・`gh pr list`・`gh pr create`・`gh pr view` の振る舞いの変更の記載は見つからなかった

§8 の手順 8 の末尾に 1 文足す:

> あわせて、gh を使う前に §5 の確かめを、その順で行う（`printenv GH_TELEMETRY` が無効の値〈`false`・`0`・`disabled`〉で子のシェルでも同じ、`gh config get telemetry` が `disabled`、`gh --version` が 2.99.0 以上。1 つでも違えば、gh を使わずに止まる。v0.18.3）
