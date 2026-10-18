# Changelog

M0（verify の中核）の各タグと、対応した独立レビューのラウンド。詳細は `docs/reviews/m0/` と `docs/reports/`。

表記規約（R6-002）: 各タグの主表記は**タグが指す commit の SHA**（`git rev-list -n1 <tag>`、peeled）。注釈付きタグのオブジェクト SHA（`git rev-parse <tag>`）は
`/ tag object <SHA>` として併記する。

## v0.10.1 — timeoutSec at most 2,147,483 seconds, the longest wait of a Node.js timer (Q12 of the M4 design R3)

- **設定の `timeoutSec` の上限**（人間の決定。2026-10-18）。branch `release/v0.10.1`、4 commit: `e4cb40e`（v0.10.0 の記録）・`eaeabaf`（テストと実装）・`4681c2e`（docs）・この release の commit
- check の `timeoutSec` と `defaults.timeoutSec` は 1 以上 2,147,483 以下（2,147,483,647 ms を 1000 で割って切り捨てた値）。超える値は設定の誤り（exit 2、レポートは書かない）で、文言に上限とタイマーの理由が入る
  - v0.10.0 までは、超える値が `setTimeout` に渡り、Node.js がそれを 1 ms にして（`TimeoutOverflowWarning` を標準エラーに出して）、check がすぐ時間切れ（FAIL）になっていた。判定が PASS になることは無かった
  - `schema/aiqh.config.schema.json` を生成し直した（`maximum` が 2147483）
- テスト: `tests/config-timeout-max.test.ts`（新規、10 件）。変更の前の `9599db9` で 6 件 FAIL（2,147,484 で verify が exit 1）・4 件 PASS（上限ちょうどの値が読め、タイマーの警告なしに動く対照）。既存のテストの期待値は変えていない
- docs: `docs/CONFIG_SPEC.md` の §3・§4、ADR-0005 の注記と ADR の一覧、ROADMAP（v0.10.0 の CI の記録、v0.10.1 の項）、CHANGELOG の v0.10.0 の見出しの SHA
- 利用者に見える変化: `timeoutSec` が 2,147,484 以上の設定は、設定の誤り（exit 2）になる（それまでは、check がすぐ時間切れの FAIL）。ほかは v0.10.0 と同じ
- 依存関係・`package-lock.json`・`.github/`・`tests/structure/` は v0.10.0 と同一
- `package.json` version 0.10.1（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.10.0 — commit a9c8e13674706ba4b81076f5a1522611b4b516ff / tag object 64d69f790546debb876e624e4ef17ffa71c16c05 — configSha256: the SHA-256 of the config file's bytes, recorded at the top level of the report (ADR-0033; the first version of M4)

- **M4 の最初の版**（人間の決定 D9・D10・Q9。2026-10-17）。branch `release/v0.10.0`、4 commit: `e02aa0f`（設計のレビューの記録）・`4e1331d`（ADR と計画の docs）・`89844b3`（テストと実装）・この release の commit
- **verify のレポートに `configSha256`**（`latest.json`・`history/<ts>.json` の最上位、`configPath` の直後）: verify が読んだ設定ファイルのバイト列の SHA-256（小文字 16 進 64 桁）。人は `shasum -a 256 aiqh.config.jsonc` で同じ値を出せる
  - 設定ファイルは 1 回だけ、バイト列として読む。同じ Buffer から、設定の文字列（それまでの `readFileSync(path, "utf8")` と同じ復号）と SHA-256 を作る。読み込みの誤りの扱いと文言は変えない
  - 値が無いときは欄を書かない（`null` にしない）。v0.10.0 より前のレポートには無い。`schemaVersion` は 1 のまま
  - **記録であって固定ではない**: 期待の値はどこにも置かず、判定は変わらない。設定の外の変更（`package.json` の scripts・テスト・道具の設定・環境変数・依存の版）は値に表れない。R-006 の対策候補 2 を「記録」として入れた（候補 3〈品質ポリシーの変更の別承認〉は M4 の運用テンプレートの docs の手順）
  - `latest.md` と端末の出力は変えない（Q9）。review-packet は `latest.json` の知らない欄を読まないので変わらない
- テスト: `tests/config-sha256.test.ts`（新規、19 件）。変更の前の `fe8de3a` では 11 件が FAIL、8 件が PASS（変わらないことを確かめる対照）。既存のテストの期待値の変更は、人間が承認した 3 か所だけ（`tests/regression-backlog9-report-json-copy.test.ts` の最上位のキーの配列と補助関数の設定、`tests/parse-verify.test.ts` の `REPORT_KEYS` とテストの名前）
- M4 の設計の独立レビュー（label `m4-design`）: R1 は High 0 / Medium 4 / Low 1、R2 は High 0 / Medium 3 / Low 0（R1 の 5 件は解消 3・部分的に解消 2）。R3 は依頼しない（人間の決定。R2 の 3 件は v0.11.0 の実装レビューで確かめる）。`docs/reviews/m4-design/` に、原文の収録・`aiqh review-import` で取り込んだ findings（8 件とも `open`。直す版は v0.11.0・v0.12.0）・対応記録・設計 R3
- docs: ADR-0033（新規）、ADR-0006・0007 の注記（CI ではレポートを artifact に上げない。M4 は履歴 DB を持たない）、ADR の一覧、ARCHITECTURE の §7.1、CONFIG_SPEC の §1、ROADMAP（M4 の節の書き直し、項目 47〈R-010 の行き先〉、v0.10.0 の項）、README（いまの状態と機能の表）
- 利用者に見える変化: `latest.json`・`history/<ts>.json` の最上位の欄が 1 つ増える（`configSha256`）。最上位のキーの並びを固定して読む利用者は、15 個になることに注意。`verify.yml`・CLI の引数・終了コード・`latest.md`・端末は変わらない
- 依存関係・`package-lock.json`・`.github/`・`tests/structure/` は v0.9.2 と同一。組み込みのモジュールの一覧（ADR-0019）と書き込みの出口（ADR-0020）も変わらない
- `package.json` version 0.10.0（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.9.2 — commit 549ccda597028c58b5912e93e186c7f0fe361a3f / tag object 5cc8c596deecc3b5b8bed18f1fdc7d3a05732e89 — main requires pull requests: two required checks (verify (ubuntu), reusable (self) / aiqh verify), merge commits only, no bypass (ADR-0032; docs and version only)

- **本体の main を pull request 必須にした**（人間の決定。2026-10-17）。この版が、新しい運用の最初の pull request（branch `release/v0.9.2`）。3 commit: `f78d881`・`e256acb`・この release の commit
- ruleset `main-protection`（id 25218296）を `gh api --method PUT` で 1 回切り替えた:
  - `pull_request`: 承認 0、Code Owners のレビューなし、merge の方式は merge commit だけ（`allowed_merge_methods: ["merge"]`。branch の commit の SHA を保つ）
  - `required_status_checks`: `verify (ubuntu)` と `reusable (self) / aiqh verify`（GitHub Actions、integration 15368）、strict。`measure (windows)` は入れない
  - Bypass は外した（`bypass_actors: []`）。困ったときは、人間が Settings から ruleset を止める
  - `deletion`・`non_fast_forward` はそのまま
- merge は、必須チェックが緑になった後に `gh pr merge --merge --match-head-commit <SHA> --delete-branch`（`--admin` は使わない）。タグは release の commit（branch の commit）に付ける
- docs: ADR-0032（新規）、ADR-0025 の注記、ADR の一覧、手順書 `docs/ops/ci-and-branch-protection.md` の §3（いまの設定）と §8（リリースの手順）、ROADMAP（項目 44 を閉じた、M3 の完了条件の 1 つめに注記、v0.9.1 の CI の記録）、README（いまの状態と CI の文）。CHANGELOG の v0.9.1 の見出しの SHA
- 利用者に見える変化: 無い（CLI と `verify.yml` は v0.9.0 と同じ）。このリポジトリへの変更は、pull request でしか入らない
- `src/`・`tests/`・`tests/structure/`・`.github/`・依存関係・`package-lock.json` は v0.9.1 と同一。docs と version だけの版なので、HEAD の 10 回連続と `verify:dist` は省いた（人間の指示）
- `package.json` version 0.9.2（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.9.1 — commit d013e892f8b151187d491705606eaf833e382787 / tag object d78775bbd88e0a55a153c25ead98c73c4147373d — wave 4 closeout: the application of the reusable workflow to two personal repositories recorded (docs and version only)

- **波 4 の締めの記録**（docs と version だけ。コード変更なし）。2 commit: `532251e`・この release の commit
- 波 4 の適用（2026-10-17。個人のリポジトリ 2 つ。どちらも直しと CI を 1 つの PR に入れ、merge は人間）:
  - `youhei-dev/trim-manager`: PR #2（merge の commit `1d23e76`）。PR の run `38985874746`（5 チェック PASSED）・main の run `38986865678` が success。npm audit の high 5 件を `overrides` で 0 件に（`@grpc/grpc-js` 1.9.16 → 1.14.6・`source-map-js` 1.2.1 → 1.2.2。GHSA-m9gg-hp2v-232j・GHSA-f596-whhp-79r4・GHSA-68fv-2mgg-jv7q）、unit のチェック（`npm test`）を足した
  - `youhei-dev/ai-tutor-browser`: PR #1（merge の commit `c65c405`）。PR の run `38989579565`（2 チェック PASSED）・main の run `38990545338` が success。テストが `.env` に頼らないようにし、直接の依存を固定して httpx を足した。Python の経路（setup-python 3.13 と `setup-command` の venv）が CI で動いた
  - どちらも `uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@7f2146da61702e859f0fddf0834a4f6414b0b6fb # v0.9.0`
- ADR-0031 に「注記（v0.9.1: 適用で確かめたこと）」: private の呼び出し側から SHA で呼べる、`job.workflow_repository`・`job.workflow_sha` は呼ばれた側を指す、既定のトークンで公開の aiqh を checkout できる、`python-version` の経路と `working-directory` の既定の経路が動く。残る未確認の点（`workflow_dispatch` と concurrency の取り消し、Node 24 未満の文言、`job.workflow_sha` が空・食い違いのとき、GHES など）も書いた
- `docs/ops/reusable-workflow.md`: Python の対象の例（§1.1）、適用で分かった注意（§8: `.env` と手元の venv に頼らない、依存の版の固定、pytest の件数はログに出ない、timing の API の `billable`）、v0.9.1 の SHA で呼んでも `verify.yml` は同じであること
- ROADMAP: v0.9.0 の CI の記録（run `38883693702`、`unit` 156 秒〈26.0%〉・`unit-minpath` 153 秒〈25.5%〉、`reusable (self)` 5 分 55 秒・8/8）、波 4 の適用の記録と完了、項目 39 の注記、新しい項目 45（`aiqh init` が node:test を検出しない）・46（timing の `billable` が 0。記録だけ）、適用先の側の残り、「次:」（項目 44 と本体リポジトリの PR の運用の決定、その後に M4）
- CHANGELOG の v0.9.0 の見出しの SHA
- 利用者に見える変化: 無い（`verify.yml` と CLI は v0.9.0 と同じ。v0.9.1 の SHA で呼んでも動きは同じで、`aiqh --version` が 0.9.1 を出す）
- `src/`・`tests/`・`tests/structure/`・`.github/`・依存関係・`package-lock.json` は v0.9.0 と同一。docs と version だけの版なので、HEAD の 10 回連続と `verify:dist` は省いた（人間の指示）
- `package.json` version 0.9.1（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.9.0 — commit 7f2146da61702e859f0fddf0834a4f6414b0b6fb / tag object d67144a32b8878b27b2c2ec3baa848e217244df0 — the reusable workflow .github/workflows/verify.yml (distribution D: aiqh from the workflow's own commit; callers pin a commit SHA) and the self-application job reusable (self) (ADR-0031)

- **波 4 の最初の版**（人間の決定: CI での配布は案 D、呼び出す側は 40 桁の commit SHA で固定。ADR-0031）。適用先 2 つには触れていない。5 commit: `71bfc27`・`d794c9b`・`8bd758c`・`c713578`・この release の commit
- `.github/workflows/verify.yml`（新規）: `on: workflow_call` だけ、権限は `contents: read` だけ、アクションはすべて 40 桁の commit SHA（setup-python v7.0.0 = `5fda3b95a4ea91299a34e894583c3862153e4b97`）
  - 対象は `target/`、aiqh は `aiqh-src/` に `job.workflow_repository` の `job.workflow_sha` で checkout する（どちらも `persist-credentials: false`）
  - `git rev-parse HEAD` が `job.workflow_sha` と同じでなければ止める（空も止める。fail closed）。同じなら `npm ci --omit=dev`（実行時の依存だけ）と、`node <aiqh-src>/src/cli.ts` を起動する `aiqh` を PATH に置く
  - inputs は 6 つ（`node-version` 既定 24.13.1・`python-version`・`setup-command`・`working-directory`・`config`・`job-summary`）。入力は `env:` を通して script に渡す。`working-directory` の `..`・絶対パス・外への解決は止める。Node 24 未満は失敗する
  - job の `env:` に `npm_config_ignore_scripts: "true"`。artifact は上げない。`job-summary: true` のときだけ `latest.md` を Job Summary に足す
- `ci.yml`: job `reusable (self)`（`uses: ./.github/workflows/verify.yml`、`setup-command: npm ci`）で、aiqh 自身を対象に再利用ワークフローを走らせる。必須チェックではない（ROADMAP の項目 44）。`measure (windows)` のコメントと `.github/CODEOWNERS` の 2〜4 行目を、公開の後の文に直した
- テスト: 新しい 2 ファイル（`tests/reusable-workflow.test.ts` 11 件、`tests/reusable-workflow-self.test.ts` 2 件。YAML のテキストを読む）。実装の前に `54ab7aa` の上で 13 件中 12 件の FAIL を記録した
- docs: ADR-0031（新規）、ADR-0009・ADR-0025 の注記、ADR の一覧、ARCHITECTURE §3（配布モデル。呼び出す側の例をタグから SHA に）、`docs/ops/reusable-workflow.md`（新規。最小の例・inputs・SHA の見つけ方・呼び出す側の設定の注意・タグの運用）、手順書の §1、ROADMAP（M3 の完了条件 2 つ、波 4 の SP1 と決定と残り、v0.8.4 の CI の記録）、README。CHANGELOG の v0.8.4 の見出しの SHA
- 利用者に見える変化: 他のリポジトリの CI から `uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@<40 桁の commit SHA>` で `aiqh verify` を走らせられる。CLI の動きは変わらない
- `src/`・既存のテスト・`tests/structure/`・依存関係・`package-lock.json` は v0.8.4 と同一。テスト 2,170 → 2,183 件（161 → 163 ファイル）。テストを足す版なので、HEAD の 10 回連続と `verify:dist` も行う
- `package.json` version 0.9.0（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.8.4 — commit 54ab7aae0be8ab4d4c6df3dac2f93bf4a166a4ea / tag object f2e98df510d37c28411b1d334beef02f16ff724c — after the public switch: the main ruleset, the description and the topics recorded; the external-organization application plan cancelled; items 43 and 44

- **公開の後の設定の記録**（docs と version だけ。コード変更なし）。2026-10-16 の 13:50 ごろ（JST）に人間が GitHub の画面でリポジトリを Public に切り替えた（ADR-0030 の決定 7）。その後、人間の指示で `gh api` により設定した: main の ruleset `main-protection`（id 25218296。既定のブランチ、active、規則は `deletion` と `non_fast_forward`、Bypass は Repository admin。必須チェックは未設定）、description（「AI 駆動開発のための fail-closed な品質ゲート CLI（TypeScript / Node.js）」）、topics（`ai-assisted-development`・`ci`・`cli`・`quality-gate`・`typescript`）。4 commit: `12e147a`・`70487d0`・`de806d4`・この release の commit
- ADR-0025 に注記（決定 6 の前提が変わった。必須チェックを足す条件は決定 7 の「main への push で続けて 5 回緑」）。ADR-0030 に注記。ADR の一覧の 2 行。手順書 `docs/ops/ci-and-branch-protection.md` の §3 に「実施済み」、§2 の 6・§4 に注記。ARCHITECTURE の CODEOWNERS の行
- 適用先の予定の取り消し（人間の決定）: 適用先は個人のリポジトリ 2 つ（`youhei-dev/trim-manager`・`youhei-dev/ai-tutor-browser`）だけ。ARCHITECTURE の構成図の対象リポジトリの例を書き換え、ROADMAP の M3 の「内容」と v0.8.4 の記録に書いた
- ROADMAP: 新しい項目 43（`tests/` の 7 つのファイルのコメント「see CLAUDE.md」。Low）・44（必須チェック `verify (ubuntu)` を ruleset に足す。条件は ADR-0025 の決定 7。人間の承認）。v0.8.3 の CI の記録、公開の後の作業のチェック、「次:」
- CHANGELOG の v0.8.3 の見出しの SHA。README の「現在の状態」: v0.8.4、次は波 4
- 利用者に見える変化: CLI の動きは変わらない
- コード変更なし（`src/`・`tests/`・`scripts/`・依存関係・`package-lock.json` は v0.8.3 と同一）。テスト 2,170 件（161 ファイル）。docs と version だけの版なので、HEAD の 10 回連続と `verify:dist` は省く（人間の指示）
- `package.json` version 0.8.4（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.8.3 — commit 1f708ac7d7893fe78335543637d5d6ed9bbde87b / tag object c97685389870cfa7e96f83d2703dab647c77588c — public preparation: the MIT license, the repository fields of package.json, the README for a public repository, the project CLAUDE.md untracked (ADR-0030; the visibility is not switched)

- **公開の準備**（人間の決定: 案 1〈いまのリポジトリを、履歴を書き換えずにそのまま Public に〉・MIT・プロジェクトの `CLAUDE.md` は追跡外。ADR-0030）。**Visibility の切り替えはしていない**（人間が GitHub の画面で行う）。5 commit: `80e13a8`・`76b2047`・`864ced8`・`fb51c4d`・この release の commit
- `LICENSE`: MIT の標準の本文、`Copyright (c) 2026 youhei-dev`（GitHub のアカウント名）。`npm pack` の tarball にも入る
- `package.json`: `license`（MIT）・`repository`・`bugs`・`homepage`。`private: true`・`files` は変えない
- プロジェクトの `CLAUDE.md` を追跡外にした（`git rm --cached`。作業者のローカルのファイルとして残す）。`.gitignore` に `/CLAUDE.md`。文書が `CLAUDE.md` を指す箇所に注記（ARCHITECTURE・ADR-0012・ADR-0025・`docs/ops/ci-and-branch-protection.md`・`docs/ops/review-loop.md`）。過去の記録は変えない
- README: 冒頭に aiqh がすること・しないこと、新しい英語の要約、CI のバッジ。「現在の状態」を短くした（版ごとの経緯は CHANGELOG・ROADMAP・完了報告へ）。`npm link` の手順は `<clone した場所>`。独立レビューの運用の節、ライセンスの節（MIT）
- ADR-0030（公開の決定・点検の要約〈値は書かない〉・受け入れたもの・代替案）。ROADMAP: 公開の判断と公開の後の作業、v0.8.2 の CI の記録、「次:」。CHANGELOG の v0.8.2 の見出しの SHA
- 利用者に見える変化: CLI の動きは変わらない。tarball に LICENSE が入る
- コード変更なし（`src/`・`tests/`・`scripts/`・依存関係・`package-lock.json` は v0.8.2 と同一）。テスト 2,170 件（161 ファイル）。docs と設定だけの版なので、HEAD の 10 回連続と `verify:dist` は省く（人間の指示）
- `package.json` version 0.8.3（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.8.2 — commit 5abdf0a6234697ad7289cf8c720b7ec29567c763 / tag object 862ba85f8cdffbbbea7ce68206cd91ea91dfd4b8 — M2-2 complete — completion record (docs and version only; no code change)

- **M2-2 を完了とした**（人間の決定。m2-2-parsers R2 の報告の §7〈完了条件 3 つを満たした〉を見て）。完了ベースライン v0.8.1（commit a467093a44da5e50297c44d11af19f5adcb6bbca / tag object 2e9d10ec5a88ea9ad836145982d9ab23b079d537）、完了記録は本タグ。前例（M2-0 の v0.3.4、M2-1 の v0.4.4）と同じ形。2 commit: `ecbbc80`（完了報告と ROADMAP）とこの release の commit
- 完了報告 `docs/reports/M2-2_COMPLETION.md`: 完了条件ごとの根拠、内容と項目 15、波 3〈v0.6.0〜v0.8.1〉の版と独立レビュー、ADR-0026〜0029、後に回したもの、テストの件数と CI の時間の推移、波 3 の運用で学んだこと
- ROADMAP: M2-2 の見出しを「完了」、完了条件を「（すべて達成）」に。新しい項目 41（負荷に弱いテスト `tests/regression-backlog16-r2-confirm-origin.test.ts`。準備の順序の確かめが要る）・42（CI の `unit`・`unit-minpath` の時間の見張りの線: 上限 600 秒の 72% で対処の案、80% で対処）。次は、公開の前の履歴の点検の結果を見て Public 化の判断（人間）→ 波 4（M3 の後半: 配布・再利用ワークフロー）の設計
- README の「現在の状態」: M2-2 完了（v0.8.2）
- コード変更なし（`src/`・`tests/`・`scripts/`・依存関係・`package-lock.json` は v0.8.1 と同一）。テスト 2,170 件（161 ファイル）。docs と version だけの版なので、HEAD の 10 回連続と `verify:dist` は省く（人間の指示）
- `package.json` version 0.8.2（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.8.1 — commit a467093a44da5e50297c44d11af19f5adcb6bbca / tag object 2e9d10ec5a88ea9ad836145982d9ab23b079d537 — latest.md: the parsed names in a code block, the failure summary in a code span (m2-2-parsers R1, M2-2-PS-R1-001)

- **独立レビュー（m2-2-parsers）R1 の Medium 1 件を直した**（VALID。人間の決定: 案 A・範囲 S2。4 commit: `b147f9d`・`0648dbe`・`7a34fba` とこの release の commit。ADR-0028 の追記〈決定 10・11〉）
  - **M2-2-PS-R1-001**（`src/report/markdown.ts`）: latest.md の `## Parsed Output` の check ごとの名前の一覧を、1 つのコードブロック（info string `text`、fence は出力の末尾と同じ `fenceFor`）の行にした。ツールの出力から来る名前の中のリンク・画像・インライン HTML・文字参照・強調・自動リンクは、Markdown の構文として読まれない（数値の文字参照が、表示のときに禁止文字に戻ることもない）
  - **範囲 S2**: Failure Details の `- Summary:` の行（`errorSummary`: ツールの出力の最初の行。M0 から）を、1 つの行内のコード（code span）にした
    - 区切りは、中の最長のバッククォートの並び +1
    - 中身がバッククォートで始まるか終わるとき、または空白で始まって空白で終わる（空白だけではない）ときは、両端に空白を 1 つずつ足す。CommonMark 0.31.2 の §6.1 がちょうどそれを取るので、表示は元の文字列と同じ
    - 要約が無いときは従来どおり `-`
  - `latest.json`・端末・判定・終了コード・`schemaVersion` は変わらない
- `docs/reviews/m2-2-parsers/findings-r1.json` の 1 件を `resolved` にした（`fixedIn`・`regressionTest`・`action`・`destination`・`note`）。`review-check --label m2-2-parsers` は `REVIEW LOOP: complete`
- 利用者に見える変化: latest.md の名前の一覧が、箇条書きからコードブロック（等幅の文字）になる。失敗の詳細の Summary が行内のコードになる。ほかは変わらない
- テスト 2,141 → 2,170 件（160 → 161 ファイル）
  - 先に書いた `tests/regression-m2-2-ps-r1-001-markdown-names.test.ts` の 29 件は、直す前の `2e7d2b0` で 27 件 FAIL・2 件 PASS（PASS は対照）
  - src を 8 通りに壊すと、どれも 1〜24 件 FAIL
  - 既存テストの期待値は変えていない
- `package.json` version 0.8.1（`package-lock.json` の `version` は 0.5.35 のまま）
- 注記: v0.8.0 の見出しの SHA は、v0.8.0 の後の記録の commit（`2e7d2b0`）で記入済み

## v0.8.0 — commit 89475fa2937f52498252ecd0d5b77c95e3288bfa / tag object 7572eb78f343d13f66650fa0b273eba5ce8431d7 — output parsers for display only: vitest, eslint, npm audit and the aiqh security-scan entries in checks[].parsed; the key-value false positive record defined (ADR-0028, ADR-0029)

- **出力パーサ**（M2-2 の残り。Q1。ADR-0028）: verify が各 check の出力の末尾を読み、レポートの各 check の最後に `parsed` の欄を書く。**表示のためだけで、判定・分類・終了コード・check のほかの欄は見ない**（P1）。読む関数は例外を投げない（P2）。6 commit: `b93f6f5`（Q1）・`4e6e585`（Q2）・`a145b53`（ADR-0028）・`78f9adb`（ADR-0029）・`3648544`（P3 のテストの時計）・この release の commit
  - `parsed`: `tool`（`vitest` / `eslint` / `npm-audit` / `aiqh-security-scan` / null）、`status`（`parsed` / `unparsed` / `not-applicable`）、`reason`（決まった語だけ）、`truncated`、`counts`（ツールごとの決まったキー）、`items`（`{ kind, name }`、最大 50）、`itemsOmitted`
  - **パーサの選び方**: コマンドの語（`vitest`・`eslint`・`npm … audit`・`aiqh`/`cli.ts`/`cli.js` と `security-scan`）。コマンドが 1 つの `npm run <script>` / `npm test` なら、作業ディレクトリの package.json の script（1 段）。**設定の欄は無く、コマンドは書き換えない**（P5）。合うツールが無い・2 つ以上なら `not-applicable`。package.json が読めない（リンク・ディレクトリ・1 MiB 超・不正な JSON・ENOENT 以外の失敗）なら `unparsed`（`script-unreadable`。ADR-0022）
  - **vitest**: 要約の行（`Test Files` と `Tests`。vitest の語だけ、内訳は合計以下）と `Errors` の行。失敗の名前は `Failed Tests` / `Failed Suites` の節の `FAIL` の行。**eslint**（stylish）: `✖ N problems (E errors, W warnings)`、何も出さず終了コード 0 なら 0 件、error の位置とルールを名前に。**npm audit**（テキスト）: 3 つの要約の形、`Severity:` の行が続くパッケージを名前に。語や数が合わない要約は `unexpected-summary`（別のツールの出力を件数として出さない）
  - **上限**（P3）: 各ストリームの末尾 1 MiB（切った最初の部分行は読まない）・1 行 4,096・名前 50 × 300・1,000 ms（1,024 行ごとに時計を見る）・数は 15 桁まで。どれも 1 回の走査。敵対的な 12 の形で 1 MiB でも数十 ms
  - **マスクと表記**（P4）: 名前は 1 行まるごとをマスクしてから切る。レポート・Markdown・端末は従来の出口を通る（入力全体はマスクしない: masker の超線形の形があるため。項目 40）
  - 端末: 各 check の状態の行の直後に `parsed: <tool> — <要約>` と名前を最大 10。`not-applicable` は何も出さない。latest.md: どれかが読まれたときだけ `## Parsed Output`
  - `schemaVersion` は 1 のまま（足すだけ。最上位のキーは変えない。review-packet の Verification の節は変わらない）。M1 の型の下書き `OutputParser` は消した（`src/parse/tool.ts` に置き換え。ADR-0011 の状態の行）
- **security-scan の項目**（Q2）: security の check が `aiqh security-scan` のとき、oversized-candidate・`security.allow` で許したもの・使われた／期限切れ／使われないルール・各 finding を `parsed.items` に（種類は `kind`。判定に効く finding と効かない許可が混ざるので「警告」とは呼ばない）。scan の終了コードは変えない（oversized-candidate はいままでどおり finding）
- **key-value 誤検出の継続記録の定義**（Q3。ADR-0029。実装はしない）: 何を誤検出と呼ぶか、扱いの順（書き換え → 狭い `security.allow`〈`reason` は `key-value false positive: <分類>: <理由>`〉→ パターンの変更は ADR）、記録の場所（`reason` と、最初の 1 件で作る `docs/ops/key-value-false-positives.md`。値は書かない）、見直しの契機
- 利用者に見える変化: レポートの各 check の `parsed`、latest.md の `## Parsed Output`、verify の端末の `parsed:` の行（パーサの合う check だけ）。判定・終了コード・ほかの欄・設定の仕様は変わらない。推奨: 各ツールは既定のテキストの出力のまま使う（JSON の出力は `unparsed`）
- テスト 2,036 → 2,141 件（156 → 160 ファイル）。先に書いたテスト 105 件（parse-output 48・parse-select 41・parse-verify 8・parse-security 8）は `91ee0fc` で 4 ファイルとも読み込めずに FAIL、Q2 に関わる 13 件は Q1 の `b93f6f5` で FAIL。src を 8 通りに壊すと、それぞれ関係するテストが落ちることを確かめた。P3 の「線形の読みは時間の上限に届かない」は、パーサが時計を見るたびに進む時計で確かめる（機械の負荷に依らない。壁時計の上限 3 秒は別に確かめる）。fixture は実際の出力の写し（ホームのパスは `/work/...` に置き換えた）。既存テストの期待値は変えていない。`package.json` version 0.8.0（`package-lock.json` の `version` は 0.5.35 のまま）。依存関係・`tests/structure/`・書き込み箇所の表・禁止文字の集合・npm の保護設定は変えていない

## v0.7.0 — commit f9258c838050bd55ab02204555449b439631070e / tag object b6d6755be9f2e8514911f140d04f838377b18cab — aiqh review-check (review-import v2): the state of the findings files checked read only, the review loop shown; the re-fix loop procedure; formatDuration carries; the hasBrand cut pinned (ADR-0027)

- **`aiqh review-check` を足した**（review-import の v2。M2-2。6 commit: `4fd561f`・`040ae08`・`b2a557b`・`0767236`・`14f8b23`・この release の commit。ADR-0027）
  - `aiqh review-check --label <label> [--cwd <dir>]`。`docs/reviews/<label>/findings-r*.json` だけを読み、**何も書かない**
  - **exit 2**（すべて並べて出す）: findings のファイルが無い・名前の形が違う・回が欠ける、読めない（ADR-0022）・不正な JSON・スキーマ違反、中の label・回が違う、回で接頭辞が違う、ID の欠番・重複、`summary` が数と違う、状態に要る欄が無い（`resolved`: git が commit と答える 40 桁の `fixedIn` と `regressionTest`。`deferred`: `destination`。`accepted`・`invalid`: `note`）、`verdict` が状態に合わない、`resolved` があるのに git が答えない（fail closed）、`previous` が前の回の指摘を指さない・重なる
  - **exit 0**: `open` の数にかかわらない（D7・非目標）。回ごとの重要度と状態の数、`open` の ID、前の回の評価（先頭の語だけ: 解消・部分的に解消・未解消・その他）、警告（評価と状態の食い違い、評価の無い指摘。終了コードに反映しない）、`REVIEW LOOP: complete` / `incomplete (open N)`、`REVIEW CHECK: passed`。レビュアーの文章は出さない
  - review-import は、書いた後に同じ label の `REVIEW LOOP: …` の行（検査に通らなければ `unknown`）を出す（最後の行と終了コードは変わらない）
  - 細部: `fixedIn` は commit そのものの SHA（注釈付きタグの object の SHA は通さない）、16 進は小文字だけ
- **再修正ループの手順書** `docs/ops/review-loop.md`（依頼文とパケット → 人間が渡す → 取り込み → 収録 → 実装者の欄 → 直す〈テストを先に〉→ `resolved` → review-check → 次の回。終える基準・ループ未完了の意味・止まったときの対処）
- **項目 38**: `formatDuration` が全体を表示の単位で丸めてから分と秒に分ける（`3m60s`・`60.0s` が `4m00s`・`1m00s` になる。ほかの値の表示は変わらない）。verify の端末の行と Markdown のレポートの、繰り上がりの値だけが変わる
- **項目 37（B21-R1-001）**: brand-guard の `hasBrand()` の 50,000 型の打ち切りの向き（source 側 true・target 側 false）と、打ち切った答えを memo に残さないことをテストで固定した（`tests/structure/` は変えていない。直す前の `3ad0781` でも PASS する、いまの振る舞いのテスト）
- 利用者に見える変化: 新しいコマンド `review-check`、review-import の `REVIEW LOOP:` の 1 行、繰り上がりの時間の表示。ほかのコマンドの判定・終了コード・レポートの欄は変わらない
- テスト 1,941 → 2,036 件（152 → 156 ファイル）。先に書いたテスト: P1（review-check）70 件は `3ad0781` で全件 FAIL（63 件はモジュールが無く読み込めない、7 件は実行して FAIL）、項目 38 の 17 件は 7 件 FAIL・10 件 PASS（繰り上がりの無い値の対照）、項目 37 の 8 件は 8 件 PASS（いまの振る舞いの固定）。既存テストの期待値は変えていない。`package.json` version 0.7.0（`package-lock.json` の `version` は 0.5.35 のまま）。依存関係・`tests/structure/`・書き込み箇所の表・禁止文字の集合は変えていない

## v0.6.1 — commit c322eb3080ff6dc8f96135bbd51979f663b1e311 / tag object ea4df37ebf41516ce2a4f0811ebf07030a3d41ca — review-import: refuse named character references, look for IDs with HTML removed, check the same review imported again; writeAtomic takes a random temporary name exclusively and does not follow links (m2-2-review-import R1)

- **独立レビュー（m2-2-review-import）R1 の Medium 3 件を直した**（3 件とも VALID。5 commit: `a546839`・`76af3d9`・`259e093`・`7d99cd4`・`beb3009` とこの release の commit。ADR-0026 の追記〈決定 13〜17〉）
  - **M2-2-RI-R1-001**（`src/review/import.ts`）: 名前付きの文字参照は `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` だけを許し、ほかが本文・JSON のブロックの行・JSON を解析した後の文字列のどこかにあれば、**exit 2 で何も書かない**（新しい種類 `[entity]`。行番号だけを出す）。`;` の無い古い形は、ID の文字になりうる 10 個（`sup2`・`frac12`・`shy` など）を止める（CommonMark は `;` の無い形を参照として読まない）。数値の文字参照はブラウザの読み方で戻す（`;` なし・128〜159 の表）。その回の ID は、書いたとおりの形に加えて、**HTML のコメントとタグを取り除いた 2 つの形**（CommonMark 0.31.2 の Raw HTML の形と、局所の形）でも探す。タグは止めない（`Array<string>` は通る）。線形の時間
  - **M2-2-RI-R1-002**（`src/report/write.ts`）: `writeAtomic` の一時ファイルを、同じディレクトリの**ランダムな名前**（`.<名前>.tmp-<16 桁の 16 進数>`）で**排他的に作り**（`O_EXCL`、使えれば `O_NOFOLLOW`）、閉じてから数値の flag `O_WRONLY | O_TRUNC | O_NOFOLLOW`（作成しない）で開き直して書き、rename する（人間の決定 B-2）。以前の予測できる名前のリンクは追わない。開き直しの前のリンクへの差し替えは ELOOP、名前の削除は ENOENT。失敗したときは自分が作った名前だけを消す。verify のレポート・履歴の名前・中身・exit 2 は変わらない
  - **M2-2-RI-R1-003**（`src/commands/review-import.ts`）: 同じ原文の再取り込みでも、既存のファイルの label・回・接頭辞と、前の回の findings のファイル（ENOENT・読めない・スキーマ・label / 回 / 接頭辞）を、通常の取り込みと同じ規則で確かめてから exit 0。食い違えば exit 2、何も書かない
- 依頼文のひな形に、レビュアーの出力の形 7「文字参照と HTML のタグ・コメントを使わない」を足した。README と ADR-0026 に、`<review.md>` の相対パスは `--cwd` を基準に解決されることを書いた（v0.6.0 の Low の気づき）
- `docs/reviews/m2-2-review-import/findings-r1.json` の 3 件を `resolved` にした（`fixedIn`・`regressionTest`・`guard`・`note`）
- 利用者に見える変化: review-import が、名前付きの文字参照（5 つを除く）のあるレビューを `[entity]` で止める（v0.6.0 で取り込めた R1 の原文も止まる）。一時ファイルの名前が `.<名前>.tmp-<16 桁の 16 進数>` になる（強制終了で残ったときの名前）。ほかのコマンドの判定・終了コード・レポートは変わらない
- テスト 1,880 → 1,941 件（149 → 152 ファイル）。先に書いたテスト 61 件は直す前の `a4bb7ec` で 48 件 FAIL・13 件 PASS（対照と正常系の fixture）。既存テストは `tests/review-import.test.ts` の 1 件の塞ぎ方だけを変えた（人間の決定 A-1。期待値の行は変えていない）。`package.json` version 0.6.1（`package-lock.json` の `version` は 0.5.35 のまま）。依存関係・`tests/structure/`・書き込み箇所の表・禁止文字の集合は変えていない
- 注記: v0.6.0 の見出しの SHA は、v0.6.0 の後の記録の commit（`a4bb7ec`）で記入済み

## v0.6.0 — commit c3f454fa7d9a3fc729a1d10f183b907284ed19a4 / tag object cbf5c4e51025a6d8f37127adb2d39b431562913c — aiqh review-import v1: the aiqh-findings JSON block of a review against its body; any disagreement is exit 2 and writes nothing (ADR-0026)

- **`aiqh review-import` を足した**（M2-2 の本体〈項目 15〉の最初の部品。rest2 の計画の波 3。3 commit: `61d6039`・`1124dde`・この release の commit。人間の決定 D1〜D12〈波 3 の SP1 の推奨どおり。直した状態の名前は `resolved`〉。ADR-0026）
  - `aiqh review-import <review.md> --label <label> --round <n> --id-prefix <prefix> [--allow-missing-previous] [--cwd <dir>]`。独立レビューの md の中の **`aiqh-findings` の JSON のブロック 1 つ**（schema version 1）を正本にし、`docs/reviews/<label>/findings-r<N>.json`（git 管理）に、すべて `open` で書く
  - **本文との突き合わせ**: `### <ID>` の見出し（ID だけ）が JSON の ID とちょうど同じ、`## 全体の結論` の中に `件数: High <n> / Medium <n> / Low <n>` の行がちょうど 1 行（節の外には無い）で JSON の summary と同じ、ID だけの見出しが `### <ID>` の形、**その回の ID の形がレビューのどこにあっても（本文・JSON の文字列）JSON の指摘である**（全角・小文字・ハイフンの形・文字参照・Markdown のエスケープ・強調の記号・ゼロ幅の文字を寄せて探す）。JSON の ID は 001 から欠番・重複なし、summary は指摘の数と同じ
  - **食い違い・読めない入力はすべて exit 2 で、何も書かない**（警告して続けない。見つかった食い違いはすべて並べる）。端末には条件・ID・行番号だけを出し、レビュアーの文章は出さない。**`open` の件数は表示するだけで、終了コードには反映しない**（0 / 2。非目標）
  - 同じ原文の再取り込みは exit 0 で何も書かない、違う原文は exit 2。回が 2 以上で前の回の findings のファイルが無い（ENOENT）ときは `--allow-missing-previous` でだけ通す。読めない・不正・別の label / 回 / 接頭辞は、オプションがあっても exit 2（ADR-0022）
  - 保存する文字列はマスクを通し、禁止文字は JSON の表記にする（ADR-0020）。秘密の形と禁止文字は、件数と行番号を端末に出す
  - 依頼文のひな形 `docs/ops/review-request-template.md`（レビュアーの出力の形の約束。v0.6.0 自身の独立レビューから使う）
- `src/report/write.ts` の `writeAtomic` を export し、書き込みか rename に失敗したときに一時ファイルを消すようにした（以前は残った。verify のレポートの書き込みにも効く）
- 先に書いたテスト 95 件（`tests/review-import.test.ts` 89 件・`tests/cli-review-import.test.ts` 6 件。SP1 で見つかった読み落としの危険な形をすべて fixture にした。正常系は、SP1 で厳しく読めた 6 件の原文に件数の行と JSON のブロックを足した `tests/fixtures/review-import/`）は、v0.5.45 の後の `d751427` で 95 件すべて FAIL（89 件はモジュールが無く読み込めない、6 件は実行して FAIL）
- 利用者に見える変化: 新しいコマンド `review-import`。ほかのコマンドの判定・終了コード・レポートは変わらない
- テスト 1,785 → 1,880 件（147 → 149 ファイル）。既存テストの期待値は変えていない。`package.json` version 0.6.0（`package-lock.json` の `version` は 0.5.35 のまま）。依存関係・`tests/structure/`・禁止文字の集合は変えていない
- 注記: v0.5.45 の見出しの SHA は、v0.5.45 の後の記録の commit（`d751427`）で記入済み

## v0.5.45 — commit 35ee9e7983617e872c5311e61de0e0d5172f31ae / tag object 9e36d6045f6dc73505f52e72ceb67edb018ca603 — Self CI: verify on Ubuntu (not a required check yet), Windows measurement on manual runs; CODEOWNERS; CI and branch protection procedures (ADR-0025)

- **本体リポジトリの自己 CI を足した**（rest2 の計画の波 2〈M3 の前半〉。4 commit: `50946eb`・`0c916cd`・`f3cfeb7`・この release の commit。`src/`・`tests/`・`scripts/`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない。ADR-0025）
  - `.github/workflows/ci.yml`: main への push・main への pull request・手動の実行で、**`verify (ubuntu)`**（`ubuntu-24.04`、Node 24.13.1、`npm ci` → `npm run verify`。手元と同じ 8 チェックを同じ CLI で）。**まだ必須チェックではない**。**`measure (windows)`**（`windows-2025`）は手動の実行のときだけで、失敗しても実行を赤にしない（測定だけ。Windows は対象外のまま）
  - 安全: トークンの権限は `contents: read` だけ、`persist-credentials: false`、secrets なし、`pull_request_target` なし、アクションは完全な commit SHA で固定（`actions/checkout` v7.0.1、`actions/setup-node` v7.0.0。GitHub API でタグが指す commit を確かめた）、キャッシュとレポートのアップロードなし
  - npm の保護設定: 手元の `~/.npmrc` の設定のうち、runner の npm 11.8.0 が読める `ignore-scripts` だけを環境変数で写した（`min-release-age`・`allow-git` は 11.8.0 が知らない設定）
  - `.github/CODEOWNERS`（検証のしかたを決めるファイルの持ち主。非公開・いまのプランでは強制されない）、手順書 `docs/ops/ci-and-branch-protection.md`（CI の中身、必須にする条件と数え方、Branch Protection / rulesets の手順〈いまのプランでは HTTP 403 で使えない。使えるようになったときの手順〉、`gh` での結果の読み方）
- **最初の CI の結果**（`f3cfeb7`）: `verify (ubuntu)` は push の run 38241926903 と手動の run 38243300245 で 2 回とも緑（ジョブ 11 分 45 秒・11 分 50 秒。`unit`・`unit-minpath` はチェックの上限 600 秒の約 56%）。`measure (windows)` は手動の 1 回で 3 チェックが FAIL（記録だけ。ROADMAP の M3）
- **必須にする条件**（人間の決定。ADR-0025 の決定 7）: main への push で続けて 5 回緑。手動の実行は数えない。この版の release の commit の push を 1 回目として数え始める。時間の見張り（決定 8）: 上限の 80% を超えたら対策を決める
- 利用者に見える変化: なし（CLI の動き・判定・終了コード・レポートは変わらない）
- テスト 1,785 件（147 ファイル）は変わらない。`package.json` version 0.5.45（`package-lock.json` の `version` は 0.5.35 のまま）。v0.5.44 の見出しの SHA は、v0.5.44 の後の記録の commit（3577a48）で記入済み

## v0.5.44 — commit 3dc5ce13dc6336fdbd505351e9cc99c0e1a5b5ae / tag object 84599acab87e898cea2bbce2ee73ae3aa22d9951 — Independent review (backlog 20) R1, B20-R1-001: refuse to start under --unhandled-rejections=warn and --abort-on-uncaught-exception (ADR-0024, decision 6)

- **v0.5.42 の独立レビュー（バックログ 20）R1（High 1・Medium 0・Low 0）に対応した**（4 commit。`src/` は `src/cli.ts` と新しい `src/node-options.ts`。`src/runner/execute.ts`・`src/cli-signals.ts`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない。原文と対応記録は `docs/reviews/backlog-20/`）
  - **B20-R1-001（High）**: Node を `--unhandled-rejections=warn` で動かすと、`unhandledRejection` のハンドラがマスクした 1 行を出しても、Node 自身が拒否の理由とスタックを生のまま出す（`NODE_OPTIONS` からも指定できる）。ADR-0024 の「必ず出口を通る」が成り立たなかった。Node v24.13.1 で再現した。v0.5.41 でも同じ警告が出た（v0.5.42 で悪くなったものではない）
  - 実測で、**`--abort-on-uncaught-exception` でも同じ種類の漏れ**が見つかった（例外のとき、ハンドラより先に V8 が例外を生のまま出して SIGTRAP で異常終了し、check の子が残る。strict と併用すると拒否でも）。ほかの起動オプション（`--trace-uncaught`・`--trace-warnings`・`--report-uncaught-exception` など 8 つ）は生の値を出さなかった
  - **直し方（人間の決定）**: どちらの下でも起動を拒否する（fail closed）。`process.execArgv` と `NODE_OPTIONS` を調べ、`unhandled-rejections` のモード `warn` が 1 つでもある、`abort-on-uncaught-exception` の名前が出る（否定の形も）、`NODE_OPTIONS` が `unhandled-rejections` を一通りに読めない形で書いている（引用符・`\`・モードの欠けなど）、のどれかで拒否する。名前の `-` と `_` は同じに扱う（Node と同じ）。Node の解釈（後の指定が勝つ・否定）はまねしないので、安全な形まで拒否する（仕様。ADR-0024 決定 6）
  - 拒否するとき: 理由の 1 行（`aiqh: refusing to start: …`）を出口から出して exit 2。コマンドを読まず、check を起動せず、レポートを書かない。`aiqh verify` は、設定の誤りと同じく `VERIFY ERROR (Node option error)` の行も出す
  - 先に書いたテスト: 実際の CLI を起動するテスト 20 件（拒否される 14 の形、拒否しない対照 6）と、規則だけの単体テスト 57 件。v0.5.43 では CLI のテストの 14 件が FAIL（そのうち 10 件は偽の値が生のまま出た）、対照 6 件は PASS、単体テストはモジュールが無いので読み込めずに FAIL
- 利用者に見える変化: Node を上の起動オプションで動かしたとき、aiqh は何も実行せずに exit 2 で終わる（以前は動いて、値が生のまま出ることがあった）。それ以外の判定・終了コード・レポートは変わらない
- テスト 1,708 → 1,785 件（145 → 147 ファイル）。既存テストの期待値は変えていない。`package.json` version 0.5.44（`package-lock.json` の `version` は 0.5.35 のまま）
- 注記: v0.5.43 の見出しに commit 6ec3c3e620c1034f68ee10f1a839fafcc7130c4d / tag object 7bf640b2283eef3dfb527e0f8055c9818341e0fd を記入した。v0.5.43 の項の本文は書き換えていない

## v0.5.43 — commit 6ec3c3e620c1034f68ee10f1a839fafcc7130c4d / tag object 7bf640b2283eef3dfb527e0f8055c9818341e0fd — The brand guard compares a branded container with the contextual type of every place and looks for a brand at any depth (backlog 21)

- **波 1 の 4 つ目（最後）の版**（3 commit。`src/` は変えていない。`tests/structure/` は `brand-guard.ts` だけ〈人間の承認〉。依存関係・`package-lock.json`・禁止文字の集合・判定・終了コードは変えていない）
  - **バックログ 21**: brand-guard の widened-container は、`Checked` / `Md` を持つ入れ物を、親が 4 種（型注釈つきの変数宣言・`=` の右辺・呼び出しの引数・`return` 文）の位置でだけ比べ、ブランドを深さ 4 まで・最初の 40 個のプロパティまで・宣言のあるプロパティでだけ探していた。いまは、文脈の型のあるすべての式で比べ（式本体のアロー関数の戻り値、object literal のプロパティ・省略形、array literal の要素、条件式の枝、引数の既定値、型アサーションのオペランドなど。括弧はオペランドで 1 回、spread のオペランドとプロパティの名前は比べない）、ブランドは深さの上限なしに、すべてのプロパティ（写像型のプロパティも）・型引数・union・intersection の枝で探す。1 回の問いで 50,000 型を超えて歩いたら、fail closed の答え（報告する向き）にする。ほかの規則（assertion など）も同じ探索を使う
  - **既存テストの期待値の変更は 3 件（人間の承認）**: `regression-m2-2-builtin-r3-allow-branches` の bd01・bd02・bd04 を「検出しない」→「検出する」（群の題も合わせた）。それ以外の既存テストの期待値は変えていない。`src/` は違反にならない
  - 先に書いたテスト（新しいファイル 20 件）: 報告される 11 の形（件数まで）、対照 6、既知の限界の固定 1（写像型の target は書き込めると判定しないので報告しない）、fixture の型検査、`src/` の違反なし。v0.5.42 の brand-guard では、2 つのファイルの 149 件のうち 14 件が FAIL（11 の形と bd01・bd02・bd04）
  - 試作の途中で、`src/review/packet.ts:1120` が新しく報告された（誤検出）。原因は、プロパティの名前の識別子まで比べていたことと、写像型（`Record<…, Checked | Rejected>`）の target のプロパティの型を見ずに「ブランドが無い」としていたこと。両方を直した（後者は元からの見落とし）
  - ROADMAP の項目 21 を解消にした。ADR-0019 の既知の限界に注記。22（process-guard）は変えていない。独立レビュー（label `backlog-21`）を付ける
- 利用者に見える変化: 無し（構造ガードはテストの中だけ）
- テスト 1,688 → 1,708 件（144 → 145 ファイル）。`package.json` version 0.5.43（`package-lock.json` の `version` は 0.5.35 のまま）
- 注記: v0.5.42 の見出しに commit 423eb260d778d85b9eea6d4ddb2ba4d161e828e4 / tag object d061f48f3203fd0a437355586f691069461a8a2a を記入した。v0.5.42 の項の本文は書き換えていない。v0.5.43 の SHA は次の記録の commit で記入する

## v0.5.42 — commit 423eb260d778d85b9eea6d4ddb2ba4d161e828e4 / tag object d061f48f3203fd0a437355586f691069461a8a2a — An unhandled exception or rejection ends the CLI with exit 2 through the output boundary, after the clean-up (backlog 20, minimal version; ADR-0024)

- **波 1 の 3 つ目の版**（3 commit。`src/` は `src/cli.ts` だけ。`src/runner/execute.ts`・`src/cli-signals.ts`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない）
  - **バックログ 20（最小版。人間の判断）**: コールバックの中で投げられた例外と、処理されなかった promise の拒否は、最上位の catch に届かず、Node の既定の表示で生のメッセージとソースの行が出口を通らずに出て（マスクされない）exit 1 で終わり、実行中のチェックはそれぞれのプロセスグループに残った。`src/cli.ts` が `uncaughtException`・`unhandledRejection` を受け、最初の 1 回で `aiqh: unexpected error: …` の 1 行を出口から出す。シグナルが先に中断していたときは、それだけで、中断の経路が 130 / 143 で終える。それ以外は、終了コード 2、`VERIFY ERROR (internal error)`、理由 `"internal error"` で中断（新しいチェックを起動しない）、`terminateActiveChildren` でシグナルと同じ順に片付けてから `process.exit(2)`。安全弁はシグナルと同じ 8 秒。2 回目以降の例外と、最初の例外の後のシグナルは何も変えない。判定の確定の後（PASSED を書いた後）でも 2（0 にしない）。項目 29 とは別に扱った。ADR-0024 を足し、ADR-0019 の既知の限界に注記
    - 先に書いたテスト（6 件）: 実際の CLI を Node の `--import` で起動し、テストの一時ディレクトリに書いたモジュールが、チェックの pid が書かれた後にタイマーから投げる（または拒否を作る）。`src/` にテスト専用の入口は無い。v0.5.41 では 6 件すべてが FAIL（exit 1）
    - 子が残らないことの実験（`--import` で例外を起こし、チェックの子孫〈SIGTERM を無視する子を含む〉を pid と開始時刻で記録）: v0.5.41 は exit 1（724 ms）で子孫 3 つが CLI より長く残った。直した後は exit 2（5,738 ms。猶予の後の SIGKILL を含む）で、CLI の終了の時点で生きている子孫は 0
  - ROADMAP の項目 20 を解消にした。独立レビュー（label `backlog-20`）を付ける
- 利用者に見える変化: 処理されなかった例外・拒否での終了コードが 1 → 2、標準エラーの出力が Node の既定の表示 → 出口を通した 1 行と `VERIFY ERROR (internal error)`。実行中のチェックが残らない。それ以外の判定・終了コード・レポートの欄は変わらない
- テスト 1,682 → 1,688 件（143 → 144 ファイル）。既存テストの期待値は変えていない。`package.json` version 0.5.42（`package-lock.json` の `version` は 0.5.35 のまま）
- 注記: v0.5.41 の見出しに commit 3d8f0851d66807aa367b554b83bdacdb5c89b183 / tag object fb85c3e9f8129f168e9c4c768327ceb172db8345 を記入した。v0.5.41 の項の本文は書き換えていない

## v0.5.41 — commit 3d8f0851d66807aa367b554b83bdacdb5c89b183 / tag object fb85c3e9f8129f168e9c4c768327ceb172db8345 — The masker finds url-credential matches in linear time (backlog 35); the history name is taken exclusively (N1)

- **波 1 の 2 つ目の版**（4 commit。`src/` は `src/security/mask.ts`・`src/security/patterns.ts`〈コメントだけ〉・`src/report/write.ts`。依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合・判定・終了コード・scanner は変えていない）
  - **バックログ 35**: masker の url-credential の正規表現は、単語の境界ごとに scheme の文字の連なりを最後まで読んで戻るため、長い連なりで時間が入力の 2 乗になった（64 KiB の「a.」の繰り返しで `maskSecrets` 全体 3,427 ms）。`maskSecrets` はこの正規表現を実行せず、「://」を手がかりにした線形の走査で、同じ一致・同じ置換を求める（rest2 の SP1 の案 C2。scheme の長さは無制限のまま〈ADR-0013 の R3-002「masker は狭めない」を保つ〉）。正規表現は `patterns.ts` に定義として残す。scanner の `scanPattern`・`URL_ANCHOR` の `{0,63}` は変えない（項目 14 の記録は変わらない）。ADR-0013 に追記
    - 先に書いたテスト（24 件のうち 21 件）: (a) 旧い正規表現を正解にして、固定の seed のランダム入力 40,000 件（置換が起きるもの 10,000 件超、2 か所以上の一致 2,000 件超）、既存の url-credential の同値性の入力、走査の弱点を狙った 6 つの形、2 乗の 3 つの形で出力の完全一致。(a) は v0.5.40 でも PASS（そこでは正解が masker そのもの）。(b) 64 KiB で 1,000 ms 未満: v0.5.40 で 2 乗の 3 つの形が FAIL（3,584・2,348・3,496 ms）
    - 直した後の計測: その 3 つの形は 0.25〜0.59 ms、9 つの形で最大 1.99 ms
  - **N1**（rest2 の SP1 で見つけた）: 履歴の名前を `existsSync` で決めて後で `rename` していたので、同じ秒に始まった 2 つの verify が同じ名前を選ぶと、後の rename が前の履歴を黙って上書きしえた。名前を `wx` で排他的に作ってから、中身を rename で置く。取られている名前は既存の規則（`-2`・`-3` …）で次へ。ほかの誤りは投げ、レポートは書かれず CLI は exit 2 のまま。rename に失敗したら確保した空のファイルを消してから投げる（最終の名前に空のファイルを残さない）。確保から rename までの間に強制終了されると、空のファイルが残る（既知の限界。ARCHITECTURE）
    - 先に書いたテスト（3 件）: 自分の rename の直前に、別の node のプロセスで別の実行の `writeReports()` を最後まで走らせる。v0.5.40 では履歴が 1 つしか残らない（FAIL）。対照の 2 件（他の実行の名前は飛ばして残す、rename の失敗で最終の名前にファイルを残さない）は前後とも PASS
  - ROADMAP の項目 35 を解消にした。独立レビュー（label `backlog-35-n1`）を付ける
- 利用者に見える変化: 判定・終了コード・レポートの欄・文言は変わらない。長い出力の末尾のマスクが速くなる。同じ秒に始まった 2 つの verify の履歴が両方残る
- テスト 1,658 → 1,682 件（141 → 143 ファイル）。既存テストの期待値は変えていない。`package.json` version 0.5.41（`package-lock.json` の `version` は 0.5.35 のまま）
- 注記: v0.5.40 の見出しに commit 5105176b751aaba1fad291702893172a8a6788da / tag object 235a2384aa02ea2e67f07d593212edb53d557034 を記入した。v0.5.40 の項の本文は書き換えていない

## v0.5.40 — commit 5105176b751aaba1fad291702893172a8a6788da / tag object 235a2384aa02ea2e67f07d593212edb53d557034 — Wave 1 begins (rest2 plan): records only — backlog 36 closed by measurement, notes on the 13 and 19(c) numbers, the CONFIG_SPEC review row dropped (N3), dates and an example (N4), the project CLAUDE.md masking line (N2)

- **rest2 の SP1 の計画（5 つの波）の、波 1 の最初の版**（人間の判断。SP1 の §3-6 の推奨をすべて採用）。記録の整理だけ（4 commit。docs と `CLAUDE.md` だけ。`src/`・`tests/`・`scripts/`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない）
  - **36 を記録で閉じた**: 全テストの git の起動は 5,906 回（68 ファイル）。うち fixture の準備が 25.1%、製品自身の問い合わせが 74.9%。1 回は約 11 ms。共通の fixture で減るのは多くて 1 回の全テストで 2〜3 秒（推定）。自己 verify の二重実行（unit と unit-minpath）は、保証を弱めないためにいまのまま
  - **13・19 の (c) の記録の数字に注記を足した**（記録の本文は書き換えていない）: 最長の行は `README.md` の 30 行目で JS の文字数 11,184（UTF-8 で 21,418 バイト。記録の 19,817 はいまの値ではない）。テストの signal 0 の probe は 5 か所でなく 7 ファイルの 9 か所
  - **N3**: CONFIG_SPEC の §6 の表から `review`（パケット生成の入力パス、diff の上限。M2）を外した。不要（review-packet は CLI のオプションで出荷済み）。外した理由は表の下に 1 行
  - **N4**: ROADMAP・ARCHITECTURE（と、この版で変えた CONFIG_SPEC）の「最終更新」の日付。ARCHITECTURE §3 の例 `verify.yml@v0.3.0`（そのタグに verify.yml は無い）を `@vX.Y.Z` にし、verify.yml は M3 で足すと注記
  - **N2**: プロジェクトの `CLAUDE.md` の「レポートに書く文字列は必ず `maskDeep` を通す」を、実装に合わせた（レポートは `copyJson(report, maskSecrets)`〈v0.5.24 から。ADR-0020 の決定 5〉、それ以外の出力は出口の `maskSecrets`）。ADR-0006 は書き換えていない（決定の「深い走査でマスク」は変わらず、`maskDeep` の名前を書いていない）
  - ROADMAP の「次:」を 5 つの波の計画にした（波 1 → 波 2〈M3 の前半〉→ 波 3〈15〉→ 波 4〈M3 の後半〉→ 波 5〈M4〉。閉じたままの項目と、N1 を v0.5.41 で直す予定）
- 利用者に見える変化: 無し（動きは変えていない）
- テスト 1,658 件（141 ファイル。変わらない）。`package.json` version 0.5.40（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.5.39 — commit e93db63fffe6b20d5efd99d7072097c94b3f118e / tag object f4b7fdca3a49ed565d68e86e274558f6be39f818 — Independent review (28, 5, 34) R1, B28-R1-001: the 25 ms / 50 ms probe intervals are timer settings, not upper bounds (documents and comments only)

- **v0.5.38 の独立レビュー（28・5・34）R1（High 0・Medium 1・Low 0）に対応した**（3 commit。文書と `src/`・`tests/` のコメントだけ。動き・定数・テストの期待値・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない。原文と対応記録は `docs/reviews/backlog-28-5/`）
  - **B28-R1-001（Medium）**: v0.5.38 の項（下）と文書は、項目 28 の残る窓を「**消滅から 25 ms 以内の再利用は残る**」と、上限のように書いていた。25 ms（`CONFIRM_POLL_MS`）と `terminateActiveChildren` の 50 ms は `setTimeout` の設定値で、上限ではない。
    窓は、グループの消滅（または最後の確認）から、次の確認・送信が実際に走るまでで、イベントループやスケジューラの遅れの分だけ長くなりうる。v0.5.37 より窓は大きく縮んだが、上限は保証しない。v0.5.34 からの「最後の確認から送信までの 25 ms／50 ms」も同じ書き方だった（ADR-0023 の既知の限界「確認のタイマーは上限ではない」と「範囲（v0.5.39 で追記）」）
  - 現在の仕様の記述（ADR-0023 の決定 9 の補足と既知の限界、ARCHITECTURE、README、`src/runner/execute.ts` とテストのコメント）はその場で直し、過去の版の記録（ADR-0023 の各「範囲」節、ROADMAP、`docs/reviews/backlog-16-2-19/`）は本文を書き換えず注記を足した。v0.5.38 の項は書き換えていない
  - レビューは、ESRCH の後の送信、見張り役の `kill(0)`、止め方・後始末・終了コード、テストの期待値の変更を、問題なしと判断した。依頼文の基準（High・Medium が 0 なら終える）に達していないので、訂正だけを確かめる軽い R2 を付ける（人間の判断）
- 利用者に見える変化: 無し（動きは変えていない）
- テスト 1,658 件（141 ファイル。変わらない）。`package.json` version 0.5.39（`package-lock.json` の `version` は 0.5.35 のまま）
- 注記: v0.5.38 の見出しに commit 6a1c8b6f07385b4660f1b8f20a093bc01883253e / tag object deb297a0e8decd85ff649ebde019b77e99e9404e を記入した。v0.5.38 の項の本文は書き換えていない

## v0.5.38 — commit 6a1c8b6f07385b4660f1b8f20a093bc01883253e / tag object deb297a0e8decd85ff649ebde019b77e99e9404e — Backlog cleanup, version B (signal path): probe a group after its leader exited (28), the leaderGone comment (34), stop test:minpath through a watchdog group (5, N3); boundary tests from the backlog 23 review (B23-R1-001)

- **信号の経路に触れる残りのバックログを片付けた**（版 B。6 commit。`src/` は `src/runner/execute.ts` だけ。依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない）
  - **バックログ 28**: leader が先に終わり `close` が未着のあいだ、leader の `exit` から 25 ms ごとに signal 0 でグループを確かめ、消えたら最初のシグナルの前に `gone` を立てる（以前はタイムアウト・中断まで確かめず、最初の SIGTERM と猶予の後の SIGKILL を確認なしで番号へ送った）。
    差し替えの実験で、再利用されたことにした番号へ届いた回数は、v0.5.37 で 21/21、v0.5.38 では消滅から 25 ms 以上後の再利用で 0/12。**消滅から 25 ms 以内の再利用は残る**（閉じてはいない）。終了コード・レポートの欄・`errorSummary`・待ちの時間は変わらない（ADR-0023 の「範囲（v0.5.38 で追記）」）。
    **既存テストの期待値を 1 件変えた**（人間の承認）: B16-R2 の対照「自分で終わるコマンドには何も送らない」を、「0 以外のシグナルを送らない、leader の pid へは何も送らない」に
  - **バックログ 34**: `GroupState` の説明の 1 文を「It is set on Windows too; without a pgid there is no pid to signal at all」に直した（コメントだけ）
  - **バックログ 5 と N3**: `test:minpath` は、vitest を見張り役（`scripts/minpath-watchdog.ts`）が先頭の別のプロセスグループで動かす。スクリプトがどう終わっても（単独の SIGINT・SIGTERM、runner のグループへの SIGKILL も）、見張り役が一時ディレクトリ `aiqh-minpath-*` を消し、自分のグループへ SIGKILL を送る
    （以前は、単独で止めると vitest の worker などが最大約 30 秒残り、SIGKILL のときは一時ディレクトリが残った）。見張り役は自分がグループの先頭でなければ何も起動せずに exit 2。vitest がシグナル n で終わったときの終了コードは 128 + n（以前は 2）。テストが自分で別のグループにした子は止めない（以前と同じ）
- **バックログ 23 の独立レビュー R1（High 0・Medium 0・Low 1）**: 依頼文に先に書いた基準により、23 のレビューは R1 で終えた（人間の判断）。B23-R1-001（Low。境界の回帰テストの不足）は、テストだけを足した（根自体が symlink、外へ出る相対リンク、二段のリンク。7 件。v0.5.37 の `src/` でも PASS）。原文と対応記録は `docs/reviews/backlog-23/`
- 利用者に見える変化: verify の判定・終了コード・レポートの欄・文言は変わらない。開発用の `test:minpath` の止まり方と、vitest がシグナルで終わったときの終了コード（2 → 128 + n）
- テスト 1,638 → 1,658 件（138 → 141 ファイル）。既存テストの期待値の変更は 1 件（28）。`package.json` version 0.5.38（`package-lock.json` の `version` は 0.5.35 のまま）
- 訂正: v0.5.37 は **9 commit**（8 個と、push の前に足した文書だけの 9 個目 `ff8c6bc`）。v0.5.37 の項の「8 commit」は、9 個目を足す前の記述（本文は書き換えていない）
- 注記: v0.5.37 の見出しに commit ff8c6bc0a86dd8887fdc6c3fe1bbc79e31fce330 / tag object e4b6a54da73f7f3bc861e0efe1c08b4365a7bce2 を記入した。v0.5.37 の項の本文は書き換えていない

## v0.5.37 — commit ff8c6bc0a86dd8887fdc6c3fe1bbc79e31fce330 / tag object e4b6a54da73f7f3bc861e0efe1c08b4365a7bce2 — Backlog cleanup, version A (no signal path): package.json shape, security-scan root, git unknown, review-packet symlink, init symlink outside the root, a minimal environment for test:minpath; the rest closed by record

- **残りのバックログのうち、信号の経路に触れないものを片付けた**（backlog-rest の SP1〈棚卸し・調査〉の後。8 commit。信号の経路〈`src/runner/execute.ts`・`src/cli.ts`・`src/cli-signals.ts`、`scripts/test-minimal-path.ts` の止める・時間切れの行〉は変えていない。依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない）
  - **バックログ 26**: JSON としては正しいが形が違う `package.json`（トップが `null`・配列・文字列・数値・真偽値、`scripts`・`dependencies`・`devDependencies` がオブジェクトでない）は、O6 と同じく調べられない入口として `init` が exit 2 で止まる（以前は `null` と `scripts` が数値は生の TypeError〈`unexpected error`〉、配列・文字列などは空の `package.json` として黙って受け入れた。ADR-0022）
  - **バックログ 24**: `security-scan` で git が失敗したとき、root が無い・ディレクトリでない・調べられないなら、init の root の確認と同じ文言（`directory not found` など）で言う（以前は git の失敗として言った。終了コードは 2 のまま）
  - **バックログ 25**: verify の `git:` の行で、git の失敗を `(commit: unknown)`・`(branch: unknown)` と表示する（以前は git の答えと同じ `(no commit)`・`(detached)`）。区別は終了コードだけで付く（実装の前に実測: コミットが無いとき `rev-parse --verify --quiet HEAD` は exit 1、detached で `symbolic-ref -q` は exit 1、失敗は exit 128）。**レポートの `git` は形も値も変えない**
  - **バックログ 17**: review-packet で、表示する側のモードが 120000 のシンボリックリンクを kind `symlink` にした（全文なし、差分〈リンク先〉は載せて検査する。lock の名前より先に判定。ADR-0014 決定 4）
  - **バックログ 23 と N1**: `init` の 3 つの書込先（`aiqh.config.jsonc`・`.gitignore`・`--write-scripts` の `package.json`）が、root の外を指す symlink なら、書かずに exit 2（`--force` でも。O7・O8 と同じ形）。root の中を指す symlink は従来どおり書く。`--write-scripts` には symlink の検査が何も無かった（N1）ので、dangling の拒否も揃えた。**既存テストの期待値を 1 件変えた**（人間の承認）
  - **バックログ 6**: `test:minpath` が vitest に渡す環境を、PATH（node と git）・`NO_COLOR`・`FORCE_COLOR` だけにした（以前は全部を引き継いだ）。実測で、ほかの変数は要らなかった。絶対パスでの起動は保証の外と決めた。利用者の check の環境（`checkEnv()`）は変えていない
  - 記録で閉じた: 12（再定義して 36）、13・14（ADR-0013 に追記）、19 の (c)、20・29（直すなら一緒に設計）、21・22（`tests/structure/` を変えない制約による保留）、27（記述の訂正）、30（M3 の「Windows での挙動確認」を新設して移した）。15・18 の古い参照に注記。35（masker の url-credential の超線形。Low）を足した
  - ADR の注記と日付の行を揃えた（文書だけ。9 個目の commit）
- 利用者に見える変化: `init` の拒否（上の 26・23）、`security-scan` と verify の `git:` の行の文言（24・25）、review-packet の kind（17）。verify の判定・レポートの欄・終了コードの意味は変わらない
- テスト 1,600 → 1,638 件（133 → 138 ファイル）。既存テストの期待値の変更は 1 件（23: 外の既存の `.gitignore` への symlink に追記できる、を exit 2 に）。`package.json` version 0.5.37（`package-lock.json` の `version` は 0.5.35 のまま）

## v0.5.36 — commit 52e923e109eba7622a2fb9f245dce4212fe7552b / tag object f8941d5c1b817153244728e65ee8ff9bb8435085 — Independent review R3 of v0.5.35 (B16-R3-001) and the implementer's self-review (S-1 to S-6): the group's errno is kept when the child is gone; every target is probed; no direct signal to a leader pid seen gone

- **v0.5.35 の独立レビュー R3（High 0・Medium 0・Low 1）と、v0.5.35 の実装者の自レビュー S-1〜S-6（独立ではない）に対応した**（`src/` は `src/runner/execute.ts` だけ〈`killTree`・`terminateActiveChildren`・`GroupState`〉。6 commit。lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない。
  原文と対応記録は `docs/reviews/backlog-16-2-19/`〈`independent-review-r3.md`・`response-r3.md`〉。新しい ADR は作らず、ADR-0023 に追記した〈範囲の v0.5.36〉）。R3 は R2 の 2 件をどちらも解消と判定した。**このバックログ（16・2・19）の独立レビューは R1〜R3 で終えた**（人間の判断）
  - **利用者に見える変更**: 終了コード・status・verdict・レポートの欄・待ちの時間は変わらない。グループへの送信が EPERM などで失敗し、子は既に無い（ESRCH）形でだけ、`errorSummary` が `process group still present … after SIGKILL` から
    `process group could not be signalled (EPERM) and was still present after …` に変わる（`process.kill` の差し替えでしか作れない状態）
    - **B16-R3-001（Low）**: その形で `killTree` が `null` を返し、グループの errno を捨てていた（v0.5.33 から。errno を返す `killTree` は v0.5.33 から）。今は子が ESRCH のときはグループの errno を返す。グループ経路が無い分岐〈Windows・pgid なし〉は、これまでどおり
    - **S-1**: `terminateActiveChildren` は、猶予の間、全 target を調べてから判定する（以前は `some` で短絡し、先の target が生きている間、後ろの target を調べず、消えた後ろの target の番号へ猶予の後に SIGKILL を送った。CLI は 1 つずつ動かすので到達しない）
    - **leader の pid**（実装者が信号の経路の一覧の作成中に見つけた。レビューの指摘ではない）: 子の pid への直接送信が ESRCH を返しても記録しなかったので、グループへの送信が失敗し続けると、同じ pid へもう一度送った（v0.5.33 から。差し替えで、CLI の中断の順で 4 回）。
      今は `GroupState.leaderGone` を立て、以後その pid へは直接送らない（1 回だけ）。実際の Node では、この状態は JS から見えないと見る（推定。B16-R2-001 と同じ構造）
  - **信号を送る・調べる経路の棚卸し**: `grep` のコマンドと出力を `response-r3.md` に載せた（R3 の未確認範囲 5〈変更していないファイル〉への答え。timeout の無い `git` の呼び出しも足した）。**ESRCH を見た後に、番号（負の pgid・正の pid）へ何かが届く経路は 0**
  - 新しいテスト 8 件（`tests/regression-backlog16-r3-group-errno.test.ts` 6 件、`tests/regression-backlog16-r3-probe-every-target.test.ts` 2 件）。v0.5.35 の `src/` に当てると 3 件が FAIL、leader の pid の 4 件は S-1 までの修正の `src/` で FAIL。残りは対照。
    **v0.5.35 までにある既存テストの期待値の変更は 0 件**。`tests/regression-backlog16-r1-pgid-reuse.test.ts` は、`AbortController` の受け渡し（S-3）と時間の余裕（S-4。期待値は同じ）だけを直した（v0.5.33 の `src/` では以前と同じ 4 件が FAIL）
- docs: ADR-0023（「範囲（v0.5.36 で追記）」、決定 9 の v0.5.36 の補足、S-5 の訂正の注記、S-6〈手元の実測の一覧〉、既知の限界、影響）、ARCHITECTURE（後始末ライフサイクル）、README（中断の説明に安全弁の注意〈S-2〉、状態）、
  レビュー記録（`docs/reviews/backlog-16-2-19/independent-review-r3.md`・`response-r3.md`、`response-r1.md` の訂正の節〈S-5〉）、ROADMAP（v0.5.36 の記録、項目 31〜33 の解消、レビューのサイクルの終了、「次:」の更新）、CHANGELOG
- テスト 1,600 件（133 ファイル。1,592 ＋ 8）。`package.json` version 0.5.36（`package-lock.json` の `version` は 0.5.35 のまま。npm が書いたロックを手で直さない）
- 注記: v0.5.35 の見出しに commit 484703fc8efbf8b53b71044d9272f526553e5203 / tag object 2932869d628a4ca28eb58f80cf87ee9630539dc4 を記入した。v0.5.35 の項の本文は書き換えていない

## v0.5.35 — commit 484703fc8efbf8b53b71044d9272f526553e5203 / tag object 2932869d628a4ca28eb58f80cf87ee9630539dc4 — Independent review R2 of v0.5.34 (B16-R2-001, B16-R2-002): no direct signal to the leader of a process group seen gone; the wording of where the wait for `close` counts from is corrected

- **v0.5.34 の独立レビュー R2（High 1・Medium 1）に対応した**（`src/` は `src/runner/execute.ts` +6／−2 だけ〈`killTree`〉。停止ポイントで判定・再現し、実装した〈3 commit〉。この 3 commit では lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない〈依存関係の更新は 4 つ目の commit。下の deps〉。
  原文と対応記録は `docs/reviews/backlog-16-2-19/`〈`independent-review-r2.md`・`response-r2.md`〉。新しい ADR は作らず、ADR-0023 に追記した〈決定 9 の補足、範囲の v0.5.35〉）
  - **利用者に見える変更は無い**（終了コード・レポートの JSON・Markdown の欄・`errorSummary` の文言・待ちの時間は同じ）。変わるのは次の 1 点だけ
    - **一度「消えた」と確認した process group の leader へも、子の pid への直接送信をしない**（B16-R2-001、High）。v0.5.34 の `killTree` は、`gone` のグループへの送信を飛ばした後、そのまま子の pid への直接送信に落ちた（ガードは `exitCode`・`signalCode` だけ）。`executeCommand` の後始末が ESRCH を見た後に `terminateActiveChildren` が同じ状態で入ると〈CLI の中断はこの順〉、leader の pid へ SIGTERM が届きうる。
      `process.kill` の差し替えで、2 つの順のどちらも SIGTERM 1 回を再現した（v0.5.33 は 0 回。**この経路は v0.5.34 が新しく開けた**）。今は、グループ経路があるとき〈POSIX で pgid がある〉、`gone` なら何も送らない。子へ直接送るのは、グループへの送信が ESRCH 以外〈EPERM など〉で失敗したときだけ。グループ経路が無い分岐〈Windows・pgid なし〉は変わらない
  - **到達しやすさ（事実）**: 実際の Node では**観測されず、構造上も起きにくい**。macOS では、leader が終わって Node が回収していない間、`kill(-pgid, 0)` は ESRCH にならず EPERM か成功を返し、Node は回収と同じコールバックで `exitCode` を設定する。実際の子 360 個・約 77 万回の標本で、「ESRCH なのに `exitCode` が null」は 0 回だった〈手元の実測。Linux は未確認〉。
    古いガード〈`exitCode === null`〉が実際には止めていたと見られ、実害は起きにくい〈推定〉。**到達しにくいが、グループが消えたと分かっているなら、何も送らない方が単純で安全**なので直した
  - **信号を送る全経路の棚卸し**: `src/` の `process.kill`〈signal 0 を含む〉・`child.kill`・`spawn` 系の `timeout` を全部調べた（`response-r2.md` の M3）。ESRCH の後に届く経路は、上の 1 つだけだった
  - **B16-R2-002（Medium）: v0.5.34 の記述の訂正（実装は変えていない）**。v0.5.34 の ADR・この CHANGELOG・依頼文は、`close` 未着の待ちを「消滅の最初の確認から `confirmMs`」と書いたが、コードは `anchor = sigkillSentAt ?? goneAt`。**正しくは**: SIGKILL のタイマーが発火する前にグループが消えたときは、消滅の最初の確認から。
    SIGKILL を送った後は、SIGKILL の時刻から〈SIGKILL の後にグループが消えても、起点は SIGKILL〉。文書の方が長く書いていたので、実際の上限は、文書より短いか同じ。この形はテストで固定した。`GroupState` に時刻まで共有させる変更は、大きく得るものが小さいので採らなかった
  - 既存テストの期待値の変更は 0 件。新しいテスト 7 件（`tests/regression-backlog16-r2-direct-signal.test.ts` 6 件、`tests/regression-backlog16-r2-confirm-origin.test.ts` 1 件）。v0.5.34 の `src/` に当てると 2 件が FAIL〈B16-R2-001 の 2 つの順〉、5 件は対照・固定として PASS。
    起点の固定のテストは、起点を入れ替えた誤った実装で FAIL する。時間に依存する〈期待 約 1.2 秒、境界 1.7 秒〉。新しい 2 ファイルは、負荷ゲートを通して 10 回連続で PASS を確認した
  - 見つけて直していないこと（ROADMAP の項目 31〜33）: `terminateActiveChildren` が後ろの target を猶予の間調べない形（実装者の自レビュー〈独立ではない〉の指摘。CLI は到達しない）、README の中断の説明に安全弁の注意が無いこと・記録の言い回し・実測がリポジトリから検証できないこと、テストの小さな不備。再レビューの要否は、人間が決める
- docs: ADR-0023（決定 9 の補足、「範囲（v0.5.35 で追記）」、v0.5.34 の 2 か所の訂正、既知の限界、影響）、ARCHITECTURE（後始末ライフサイクル 4）、レビュー記録（`docs/reviews/backlog-16-2-19/independent-review-r2.md`・`response-r2.md`）、README、ROADMAP（v0.5.35 の記録、項目 31〜33 を追加、「次:」の更新。番号は詰めない）、CHANGELOG
- deps: devDependency（推移的）の `source-map-js` を 1.2.1 から 1.2.2 へ更新（`npm audit` の high の勧告 GHSA-68fv-2mgg-jv7q。実行時の依存ではない。`package.json` は変更なし）。同じ操作で、`package-lock.json` のルートの版の記録（`0.1.0` のままだった）を npm が 0.5.35 に合わせた。
  v0.5.35 の最初の 3 commit は依存関係を v0.5.34 から変えていないが、この勧告が GitHub でレビュー済みになった後（2026-10-06）に検証したため、単体で `verify` を実行すると `dependency` が FAIL する（ほかの 7 チェックは PASS）
- テスト 1,592 件（131 ファイル。1,585 ＋ 7）。`package.json` version 0.5.35（`package-lock.json` の `version` は、上の deps の commit で npm が 0.5.35 に合わせた）
- 注記: v0.5.34 の見出しに commit e5a350f2060a0439e6c86796f520de2baa01ab43 / tag object 2b520e2e4ac7b7aad466fb1100408d1cdcc61af3 を記入した。v0.5.34 の項の本文は書き換えていない（記録。起点の記述の訂正は上の B16-R2-002）

## v0.5.34 — commit e5a350f2060a0439e6c86796f520de2baa01ab43 / tag object 2b520e2e4ac7b7aad466fb1100408d1cdcc61af3 — Independent review R1 of v0.5.33 (B16-R1-001, B16-R1-002): a process group seen gone is not probed or signalled again — the same property existed in v0.5.32

- **v0.5.33 の独立レビュー R1（High 1・Medium 1）に対応した**（`src/` は `src/runner/execute.ts` +42／−18 と、コメントだけの `src/cli.ts`〈1 行。行数は同じ〉・`src/cli-signals.ts`〈2 行〉。停止ポイント1で `process.kill` の差し替えによる決定的な再現と、一時 worktree での試作を行い、人間の決定の後に実装した〈3 commit〉。
  lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない。原文と対応記録は `docs/reviews/backlog-16-2-19/`。新しい ADR は作らず、ADR-0023 に追記した〈決定 9、範囲の v0.5.34〉）
  - **利用者に見える変更は無い**（終了コード・レポートの JSON・Markdown の欄・`errorSummary` の文言は同じ）。変わるのは次の 2 点だけ
    - **一度「消えた」と確認した process group へ、以後 signal 0 も SIGKILL も送らない**（B16-R1-001、High）。以前は、消えたと分かっているグループの番号へ、SIGKILL のタイマーと `terminateActiveChildren` が SIGKILL を送り、signal 0 も 25 ms ごとに送り続けた。OS が同じ番号を別のグループへ再利用していれば、無関係なグループへ SIGKILL が届きうる。
      **v0.5.32 から同じ性質があり**（実測: 5 つの形のすべてで、消えたグループの番号へ SIGKILL を送った）、**v0.5.33 は露出する条件を狭めたが（`close` が先に来る形では送らなくなった）、「消えたと分かっているのに送る」形が残っていた**。v0.5.33 の ADR-0023 の既知の限界は、これを「消えていない」と書くだけの誤りと説明していて、SIGKILL を落としていた（訂正した）
    - **`close` 未着で消滅を確認したときの待ちは、消滅の最初の確認から `confirmMs`**（決定 2 の文書どおり）。v0.5.33 のコードは、SIGKILL のタイマーが先に発火すると、SIGKILL を実際に送った時刻から数えていた。この形で短くなる（実測: 2.5 秒 → 1.7 秒、既定値で 7.0 秒 → 5.5 秒）
  - 中身（`src/runner/execute.ts`）: `GroupState { pgid, gone }` を `activeChildren` に持ち、`executeCommand` の後始末と `terminateActiveChildren` が共有する。`gone` は signal 0 またはグループへのシグナルが ESRCH になったとき 1 度だけ立て、戻さない。`gone` のグループは調べず、送らない。SIGKILL のタイマーは `gone` なら何もしない（`sigkillSentAt` も設定しない）。
    **Windows の分岐は変わらない**（調べるグループが無いので `gone` を立てず、SIGKILL を子の pid へ送る。対照テストで固定し、「win32 でも `gone` を立てる」変異で FAIL することを確かめた）
  - **B16-R1-002（Medium）**: 「猶予 5 秒 + 確認 2 秒 = 7 秒 < 安全弁 8 秒」は**定数の関係で、レポートが先に書かれる保証ではない**（安全弁はシグナル受信から固定、確認は SIGKILL のタイマーが実際に動いた時刻から、レポートの書き込みは runner が返った後で上限が無い）。実測: 1.5 秒のイベントループの停止で、安全弁が 8,018 ms に先に動き、レポートが書かれなかった（終了コードは 130 のまま）。
    ADR-0023 決定 7・ARCHITECTURE・コメント・テスト名の表現を狭めた。**実装の動きは変えていない**。v0.5.33 の項の「猶予 + 確認 < 猶予 + 3 秒（8 秒）をテストで固定した」は、定数の関係についての記述
  - 実測（`process.kill` の差し替え。最初の ESRCH の後に、その番号へ送られたもの）: v0.5.33 は `close` 未着で signal 0 が 71 回と SIGKILL 1 回、`terminateActiveChildren` で 53 回と SIGKILL 1 回、最初のシグナルが ESRCH のとき 99 回と SIGKILL 1 回、既定値で 137 回と SIGKILL 1 回。この版はすべて 0 回（最初のシグナルは、確認なしに送る）
  - 既存テストの期待値の変更は 0 件（既存の 1 件のテストの名前とコメントだけを言い換えた）。新しいテスト 7 件（`tests/regression-backlog16-r1-pgid-reuse.test.ts` 6 件、`tests/regression-backlog16-r1-win32-branch.test.ts` 1 件）。v0.5.33 の `src/` に当てると 4 件が FAIL（残りの 3 件は対照）。待ちの境界のテストは時間に依存する（期待 1.9 秒、v0.5.33 は 3.0 秒、境界 2.6 秒。5 回連続で PASS を確認）。最小 PATH の実行（`unit-minpath`）でも通る
  - 見つけて直していないこと（ROADMAP の項目 28〜30）: 最初のシグナルの前に消滅を確認しない（leader が先に終わり `close` が来ないとき、タイムアウトまでに番号が再利用されうる。実測で同じ性質を確認）、安全弁をフェーズごとの期限にする案、Windows では v0.5.33 から消滅の確認の起点が最初のポーリングになること。再レビューは 1 回（r2、範囲 `v0.5.33..v0.5.34`）
- docs: ADR-0023（既知の限界の書き直し、決定 7 を狭める、決定 9、「範囲（v0.5.34 で追記）」、代替案、影響）、ARCHITECTURE（後始末ライフサイクル 4、中断機構 2・5、§10 の表）、レビュー記録（`docs/reviews/backlog-16-2-19/independent-review-r1.md`・`response-r1.md`）、README、ROADMAP（v0.5.34 の記録、項目 28〜30 を追加、「次:」の更新。番号は詰めない）、CHANGELOG
- テスト 1,585 件（129 ファイル。1,578 ＋ 7）。`package.json` version 0.5.34（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.33 の見出しに commit f90c150c331d87bf69043a606aa2794e9d2fbb9d / tag object 5fea67b4c2faa81123d47ef13279e6596e57221f を記入した。v0.5.33 の項の本文は書き換えていない（記録）

## v0.5.33 — commit f90c150c331d87bf69043a606aa2794e9d2fbb9d / tag object 5fea67b4c2faa81123d47ef13279e6596e57221f — Backlog 16, 2, 19 (a, b): an end that was not confirmed is not reported as terminated — a terminated command is settled when its process group is gone (within a bound), and a failed kill is not a spawn failure

- **バックログ 16・2 を解消し、19 の (a)(b) を直した**（`src/` は 5 ファイル +124／−34: `src/runner/execute.ts` +95／−29、`src/runner/run-checks.ts` +15／−3、`src/types.ts` +6、`src/cli-signals.ts` +6、`src/cli.ts` +2／−2。SP1 で `executeCommand` と実 CLI で再現し〈本物の EPERM は安全に起こせないので、同じプロセスの中で模擬した〉、
  一時 worktree で案 V・P と案 D・C を試作して全テストと自己 verify を実行し、人間の決定の後に実装した〈4 commit〉。lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない。独立レビューは 1 回付ける〈範囲 v0.5.32..v0.5.33、観点は項目 16・2〉）。
  新しい ADR: ADR-0023（確認できなかった終了を、終了したことにしない）。ADR-0005 には参照を 1 行足した
  - **利用者に見える変更**:
    - **タイムアウト・中断の後の確認**: aiqh は、チェックのプロセスグループが消えたことを確かめてから結果を確定する。SIGKILL を送った後は最大 2 秒だけ待ち、消えていなければ `errorSummary` に `process group still present 2000ms after SIGKILL` と書く
      （以前は、確認の有無にかかわらず常に `process group terminated` と書いた。確認できたときの文言は従来のまま）。グループが SIGTERM の後に遅れて消えるときは、猶予の終わりを待たず、消えたらすぐ返る（実測: 4.5 秒 → 1.9 秒）
    - **別のプロセスグループへ移った子孫が出力の pipe を握っているとき**: 以前は、その子孫が終わるまで返らなかった（実測: タイムアウト 2 秒のチェックで 20.3 秒。子孫が終わらなければ返らない）。今は SIGKILL の後 2 秒で返る（9.2 秒）。中断（Ctrl+C）では、以前は CLI の安全弁（8 秒）で終了して**レポートが書かれなかった**が、今はレポートが書かれる（7.1 秒）
    - **kill が EPERM で失敗するとき**: 以前は `failed to start: spawn failed: kill EPERM`（起動していないかのような文言）で早く確定し、子は動き続けていた。今は有界時間の後に `process group could not be signalled (EPERM) and was still present after 2000ms` と書く
    - **終了コードは変わらない**（確認できなかったときも、タイムアウトの FAIL は 1、中断は 130 / 143 のまま）。レポートの JSON・Markdown に新しい欄は無い。変わるのは `errorSummary` の文言だけ。`== 1` の注意は不要（1 → 2 のケースは無い）
    - **保証の外（文書に明記）**: 別のプロセスグループへ移った子孫（`setsid` 相当）は、aiqh では止められない。確定しても残る（実測: 寿命 10 秒の孫は、返った後も約 10 秒生きた）。通常に終わったチェックの後に残る子孫も見ない。Windows は対象外（macOS / Linux が対象。変わらない）
  - 16・2 の中身（`src/runner/execute.ts`）: 確定の条件を「`close` が来て、かつグループが消えた」にし、25 ms ごとに確認する。SIGKILL の後（グループが消えたのに `close` が来ないときは、消えたと分かった時点から）最大 `confirmMs`（既定 2,000 ms、`DEFAULT_CONFIRM_MS`。`ExecuteOptions` の任意の項目だけ）で打ち切り、
    pipe と handle を解放して確定する。グループが残っていれば `ExecutionResult` の内部の任意の欄 `terminationUnconfirmed` を付ける（`CheckResult` にはコピーしない）。子へのシグナルは `process.kill(pid)`（`child.kill()` の失敗は `error` イベントになり、spawn の失敗と取り違えていた）。
    `error` で確定するのは起動に失敗したときだけ。**kill の失敗の扱い（2）は有界時間（16）に依存する**（無いと、EPERM のとき永久に待つ）。`SAFETY_VALVE_EXTRA_MS` は `src/cli-signals.ts` へ移して export し、猶予 + 確認 < 猶予 + 3 秒（8 秒）をテストで固定した
  - 実測（SP1、timeout 1.5 秒・猶予 1 秒の `executeCommand`）: SIGKILL の経路 2,505 → 2,517 ms（SIGKILL の返却時点で、以前は 5 回中 5 回グループが残り、今は 0 回）、孫が SIGTERM の 400 ms 後に終わる（猶予 3 秒）4,505 → 1,922 ms、別のグループの孫が pipe を握る（寿命 10 秒）10,116 → 4,520 ms。
    EPERM（模擬）は 1,009 ms で確定（誤り）→ 4,020 ms で確定（1 + 1 + 2 秒）。通常に終わるチェックの所要時間は変わらない。最悪の増え方は、確認できないチェック 1 件につき猶予の後に +2 秒（以前は上限なし）
  - **19 の (a)(b)**（テストだけ。`tests/` 7 ファイル +28／−12）: (a) テストが起こす孫は、pid ファイルが消えたら自分で終わる（`tests/helpers.ts` の `exitWhenRemoved`）。製品が止め損なったときの孫の残りが、テストの失敗の後 約 15 秒 → 約 0.6 秒（r1・r2 の 2 件。実測）。
    (b) CLI を呼ぶ `runCli`・`cli` に `timeout: 25_000`・`killSignal: "SIGKILL"`（テストの時間切れの 30 秒より前）。終わらない CLI が、テストの後も 15.4 秒残っていたのが 0 になる（実測）。**(c) signal 0 の probe は直さない**（ROADMAP の項目 19 に理由を残した: pid の 1 周は約 2 分、probe は孫の死の数百 ms 後、誤る向きはテストの失敗側で、利益が小さい）
  - 既存テストの期待値の変更は 0 件。新しいテスト 12 件（`tests/regression-backlog16-confirm-termination.test.ts`）。v0.5.32 の `src/` に当てると 9 件が FAIL（決定的 8 件＋競合に依存するガード 1 件）、3 件（対照）が PASS。ガード「SIGKILL の経路: 返った時点でグループが消えている」は、v0.5.32 では結果が決定的でない
    （全件実行で 2 回とも FAIL、単独実行では 5 回とも PASS）。この版以後に PASS し続けることを守る。最小 PATH の実行（`unit-minpath`）でも通る
  - 見つけて直していないこと: 項目 5（`test:minpath` をプロセスグループで起動する案は、runner のグループごとの SIGKILL が vitest に届かなくなる〈実測: 8 件が残り、2 件は 40 秒後も走った〉ので、この版では直さない。実測は項目 5 に追記した）、項目 19 の (c)
- docs: ADR-0023（新規）、ADR-0005（参照の 1 行）、ADR の一覧、ARCHITECTURE（流れの図、後始末ライフサイクルの 4〜7、中断機構の 2、`stdoutTail` の注記、§10 の表）、CONFIG_SPEC（`timeoutSec`）、README（Ctrl+C の段落、現在の状態）、ROADMAP（項目 2・16 を解消、19 の (a)(b) を解消して (c) を理由つきで残す、項目 5 に実測を追記、項目 8 の見出しを打ち消し、v0.5.33 の記録、「次:」の更新。番号は詰めない）、CHANGELOG
- テスト 1,578 件（127 ファイル。1,566 ＋ 12）。`package.json` version 0.5.33（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.32 の見出しに commit 5adcbbc2d421067c16a845b951557514dcc11b8e / tag object a88ccc4effce7475c1bbd97a5b591eacce2a6de0 を記入した

## v0.5.32 — commit 5adcbbc2d421067c16a845b951557514dcc11b8e / tag object a88ccc4effce7475c1bbd97a5b591eacce2a6de0 — Backlog 8 D (O6): an entry that cannot be examined is not absent — init stops instead of auditing a repository as if its package.json were not there

- **バックログ 8 の D グループ（O6。バックログ 8 の最後）を解消**（`src/` は 2 ファイル +66／−37: `src/adapters/context.ts` +52／−33、`src/commands/init.ts` +14／−4。SP1 で実 CLI で再現し、一時 worktree で 2 案〈例外にする・理由を集める〉を試作して、全テストと自己 verify を実行し、人間の決定の後に実装した〈C1〜C3 の 3 commit〉。
  lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない。独立レビューは付けない〈人間の判断〉）。新しい ADR は作らず、ADR-0022 に追記した（決定 9、範囲の D）。**これでバックログ 8 は完了**
  - **利用者に見える変更**:
    - **init**: `package.json`・`tsconfig.json`・`pyproject.toml` などが、読めない（EACCES など）・dangling symlink・ディレクトリ・JSON として不正のとき、または root の一覧・通常ファイルの下の入口が調べられないとき、`aiqh init: cannot audit <root>: <entry> …` で **exit 2**
      （以前は exit 0 で、その入口が無いものとして監査した。`--write` は lint・typecheck・build などを含まない設定を書き、`--write-scripts` は何も言わずに終わった）。何も監査せず、何も書かない
    - 影響しないもの: `verify`・`security-scan`・`review-packet`、既存の設定ファイル、健全なリポジトリの `init`
    - `== 1` の注意は不要（1 → 2 のケースは無い）。終了コードが変わるのは、調べられない入口があるリポジトリの `init`（0 → 2）だけ
  - O6: アダプタが見る `RepoContext`（`src/adapters/context.ts`）の `exists()`・`readText()`・`listTopLevel()` は、ENOENT だけを「無い」とする。読みの ENOENT でも lstat で入口があれば（dangling symlink）、通常ファイルの下の入口（ENOTDIR）、JSON として不正な `package.json` は、`ExaminationError` を投げ、`init` が監査を止める。
    実行できない入口（x ビットが無い、dangling な venv の python）は、そのものの性質で、`isExecutable()` は false のまま。`RepoContext` の型は変えない
  - 実測（SP1。実 CLI、v0.5.31 → この版の試作）: `package.json` が EACCES・dangling・輪・ディレクトリ・不正な JSON のどれでも、v0.5.31 の `init` は `package.json` が本当に無いときと同じ出力（exit 0、project `other`）だった。dangling または不正な JSON で `init --write` は `security` だけの設定を書き、その設定の `aiqh verify` は、健全なとき（lint 失敗）の FAILED から PASSED になった。
    この版では、いずれも exit 2 で、設定は書かれない
  - 既存テストの期待値の変更は 0 件。新しいテスト 22 件（`tests/regression-backlog8d-o6-context-throw.test.ts`）。v0.5.31 の `src/` に当てると 14 件が FAIL（残りの 8 件は対照）。最小 PATH の実行（`unit-minpath`）でも通る（テストは外部コマンドを使わない）
  - 見つけて直していないこと（ADR-0022 の既知の限界）: 項目 26（形が違う `package.json`）、項目 27（`exists()` が入口の種類を見ない）。ENOTDIR・一覧できない root で `init` が止まること、root が辿れないときの文言（最初に調べた入口の名前が出る）は、人間の判断。項目 24・25 も直していない
- docs: ADR-0022（追記: 決定 9、範囲の D、決定 5・範囲 C の更新、既知の限界、影響。ADR-0011 は変えない）、ARCHITECTURE（init の行、`context.ts`、§6.1b）、CONFIG_SPEC（§5.3c）、README、ROADMAP（項目 8 の O6 を解消してバックログ 8 を完了、v0.5.32 の記録、「次:」の更新、項目 26・27 を追加。番号は詰めない）、CHANGELOG
- テスト 1,566 件（126 ファイル。1,544 ＋ 22）。`package.json` version 0.5.32（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.31 の見出しに commit 6786d04 / tag object 47578e3 を記入した

## v0.5.31 — commit 6786d04 / tag object 47578e3 — Backlog 8 C (O3, O4, O5, O9): a failure is not "no" — git that cannot answer, a working directory that cannot be examined, a .gitignore or .git that is a link, and a root that is not a directory

- **バックログ 8 の C グループ（O3・O4・O5・O9）を解消**（`src/` は 7 ファイル +128／−24: `src/git/info.ts` +48／−9、`src/commands/init.ts` +38／−4、`src/review/packet.ts` +19／−3、`src/runner/execute.ts` +8／−2、`src/config/load.ts` +7／−2、`src/commands/verify.ts` +6／−3、`src/report/markdown.ts` +2／−1。
  SP1 で 4 項目を実 CLI で再現し、一時 worktree での試作・全テストと自己 verify の実行を行い、人間の決定の後に実装した〈C1〜C3 の 3 commit〉。lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない。
  独立レビューは付けない〈人間の判断。判定を緩める変更ではなく、強める側だけ〉）。新しい ADR は作らず、ADR-0022 に追記した（決定 8、範囲の C）
  - **利用者に見える変更**:
    - **verify**: git が実行できない・timeout・失敗（「違う」以外の終了）のとき、標準出力は `git: unavailable (<理由>)`（`git could not be run (<code>)`・`git timed out after 10 s`・`git exited <N>: <git の 1 行>`）。以前は `git: not a git repository`。git が「違う」と答えたときは従来のまま。
      **報告の JSON の `git` は null のまま**（契約は変わらない）。Markdown のセルは `(not a git repository, git unavailable, or no commit)`。終了コードは変わらない
    - **review-packet**: git が ref の解決・work-tree の確認で失敗したとき、git の 1 行つきのメッセージ（`--range: <side> revision "<ref>" could not be resolved (git exit N: …)`、`could not tell whether <cwd> is inside a git work tree (git exit N: …)`。以前は `does not name a commit` / `not inside a git work tree`）。
      git の「違う」（無効な ref、非リポジトリ）の文は従来のまま。終了コードは 2 のまま
    - **check の cwd**: 読込の後で辿れなくなったとき（権限の変更、通常ファイルへの置き換え、symlink の輪）は `working directory cannot be examined: <dir> (<code>)`（以前は `does not exist`）。ENOENT だけ `does not exist`。check は FAIL のまま（verify は exit 1）
    - **init**: root が辿れないとき `directory cannot be examined: <root> (<code>)`（以前は `directory not found`）、**通常ファイルのときは `not a directory: <root>` で exit 2**（以前は exit 0 で、ファイルをリポジトリとして監査した）。
      提案の説明が、dangling や輪の `.gitignore`・`.git` を「無い」「not a git repository」と言わない（`.gitignore cannot be examined (<code>): …`、または git の判断。dry-run の終了コードは 0 のまま）
    - **設定の読込のエラー（O2）**: `<path> — <entry> cannot be examined` で同じパスが 2 回出ていた文面を 1 回にした（終了コードは 2 のまま）
    - **CI への影響**: `== 1` の注意は不要（1 → 2 のケースは無い）。終了コードが変わるのは、通常ファイルを `--cwd` に渡した init の 0 → 2 だけ
  - O3: `lookupGit()`（`getGitInfo()` は同じ署名のまま）が、git の「違う」（`rev-parse --verify --quiet` の exit 1、`rev-parse --is-inside-work-tree` の `false` または exit 128 の `fatal: not a git repository`）と git の失敗を分ける。`resolveCommit()` と work-tree の確認も同じ規則（B の P3 が回した失敗の文言）
  - O4: `checkDirectory()` は ENOENT だけ `does not exist`、他の stat の失敗は `cannot be examined (<code>)`（ENOTDIR も後者）。O5: `proposeGitignore()` の `existsSync()` を lstat の判定（`entryState`）に。O9: `runInit()` の root を stat で分類（`describeRootProblem`）
  - 実測（実 CLI、v0.5.30 → この版）: git が実行できない・exit 128（shim）・timeout の 3 ケースで `git: not a git repository` → `git: unavailable (…)`、報告の `git` は null のまま、verify は exit 0。非リポジトリと git 自身の「違う」は変わらない。
    読込の後で権限が変わる cwd・置き換わる cwd・symlink の輪の 3 ケースが `does not exist` → `cannot be examined (EACCES / ENOTDIR / ELOOP)`、exit 1 のまま。通常ファイルの `init --cwd` が exit 0 → 2。dangling `.git` の audit の行と提案の説明の食い違いが解消した
  - 既存テストの期待値の変更は **1 件**（`tests/regression-backlog8a-o2-untraversable-path.test.ts` の EACCES の `output.dir` の正規表現。O2 の文面の重複の解消に伴う。人間の承認）。ほかの既存テストは変更なしで通る。
    新しいテスト 48 件（`tests/regression-backlog8c-o3-git-failure.test.ts` 21 件、`…-o4-cwd-examination.test.ts` 9 件、`…-o5-o9-init-examination.test.ts` 18 件）。v0.5.30 の `src/` に当てると 26 件が FAIL（残りの 22 件は対照）。最小 PATH の実行（`unit-minpath`）でも通る（テストの外部コマンドは node と git だけ）
  - 見つけて直していないこと（ADR-0022 の既知の限界）: `rev-parse HEAD`・ブランチの個別の失敗が `(no commit)`・`(detached)` と表示される（ROADMAP の項目 25）。`security-scan --cwd <存在しないディレクトリ>` の文言が ENOENT を git のせいに見せる（項目 24）。
    バックログ 8 の残り（D: O6）は直していない
- docs: ADR-0022（追記: 決定 8、範囲の C、決定 2・5 の更新、既知の限界、影響）、ARCHITECTURE（git 情報、init の行）、CONFIG_SPEC（§4 規則 7、§5.3c）、README、ROADMAP（項目 8 の O3・O4・O5・O9 を解消、v0.5.31 の記録、「次:」の更新、項目 24・25 を追加。番号は詰めない）、CHANGELOG
- テスト 1,544 件（125 ファイル。1,496 ＋ 48）。`package.json` version 0.5.31（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.30 の見出しに commit ddeb297 / tag object 4aca365 を記入した

## v0.5.30 — commit ddeb297 / tag object 4aca365 — Backlog 8 B (P3, P11, P4): an unreadable input is not absent — the ref is read once, a leftover temporary file is named, and a version that cannot be read is exit 2

- **バックログ 8 の B グループ（P3・P11・P4）を解消**（`src/cli.ts` +14／−12、`src/commands/review-packet.ts` +3／−2、`src/review/packet.ts` +13／−5。SP1 で 3 項目の試作と全テスト・自己 verify の実行を行い、人間の決定の後に実装した〈C1〜C3 の 3 commit〉。
  lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない。独立レビューは付けない〈人間の判断。判定を緩める変更ではなく、強める側だけ〉）。新しい ADR は作らず、ADR-0022 に追記した
  - **利用者に見える変更**:
    - P11: `package.json` が無い・読めない・version が不正（文字列でない・空文字）なとき、すべての入口（`--version`・`--help`・`init`・`verify` など）が **exit 2**（以前は `0.0.0` として動き、レポートと「Generated by」にも `0.0.0` と書いた）。
      メッセージは既存の最上位の catch の 2 行（`aiqh: unexpected error: cannot read the version from package.json (<code>)` または `… package.json has no version string` と `VERIFY ERROR (internal error)`）。通常の install では影響なし。`dist/` だけをコピーした環境は、`package.json` も一緒にコピーする
    - P3: git が ref の解決で失敗したとき、tag object を省いたパケットを黙って書かず **exit 2**（`--range: <from|to> revision "<ref>" does not name a commit`。文言は v0.5.29 のまま）。通常の入力のパケットは変わらない
    - P4: 書込の失敗の exit 2 のメッセージが、辿れないが残っている一時ファイルも挙げる（`temporary file left at`）。rename で確定した一時ファイルは挙げない
  - P3: `resolveCommit()` は、ref を 1 回だけオブジェクト名に引き、その `<オブジェクト名>^{commit}` で commit を求める（2 回とも status を見る）。ref が git の呼び出しの間に動いても、tag object と commit は別の状態から来ない
  - P4: `removeTmps()` の `existsSync()` をやめ、`rmSync(t, { force: true })`（ENOENT だけを無視する）にした。rename で確定した一時ファイルをマップから外す（`tmps.delete(t)`、1 行）
  - P11: `readVersion()` は、読めない・version が文字列でない・空文字のとき `Error` を投げる。version を最初に読み、コマンドの組み立て（`buildProgram`）より前に、既存の最上位の catch へ渡す。専用のメッセージ・`src/cli-program.ts` の変更は無い
  - 実測: 追加したテスト 22 件は、v0.5.29 の `src/` に当てると 14 件が FAIL（残りの 8 件は対照）、実装後は全件 PASS。`package.json` が無い状態で実際の CLI を動かすと、`--version`・`--help`・`init`・`verify` の 4 つとも exit 2 で、標準出力は 0 バイト。
    v0.5.29 の `src/` と比べ、注釈付き tag・軽量 tag・SHA・`HEAD~1`・tag 同士・`^{commit}` 付きの 6 つの range で、パケットはバイト単位で一致
  - 既存テストの期待値の変更は 0 件。新しいテスト 22 件（`tests/regression-backlog8b-p3-resolve-commit.test.ts` 8 件、`tests/regression-backlog8b-p4-temporary-file-listing.test.ts` 5 件、`tests/regression-backlog8b-p11-version.test.ts` 9 件）
  - 見つけて直していないこと: O2 のメッセージの重複（`<path>` と `<entry>`）は直していない（O4 と一緒に C・D で決める）。バックログ 8 の残り（C: O3・O4・O5・O9、D: O6）は直していない
- docs: ADR-0022（追記: 決定 7、範囲の B、代替案、既知の限界、影響）、ARCHITECTURE（§10 の予期しない例外の行）、README、ROADMAP（項目 8 の P3・P11・P4 を解消、v0.5.30 の記録、「次:」の更新。番号は詰めない）、CHANGELOG
- テスト 1,496 件（122 ファイル。1,474 ＋ 22）。`package.json` version 0.5.30（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.29 の見出しに commit 7cbc674 / tag object 14bbbdc を記入した

## v0.5.29 — commit 7cbc674 / tag object 14bbbdc — Backlog 8 A (O2, O7, O8): only ENOENT is absent in the path containment, and init refuses a dangling symlink

- **バックログ 8 の A グループ（O2・O7・O8）を解消**（`src/config/load.ts` +14／−5、`src/commands/init.ts` +25／−1。SP1 で 3 項目を実 CLI で再現し、一時 worktree での試作・全テストと自己 verify の実行を行い、人間の承認の後に実装した〈C1〜C3 の 3 commit〉。
  lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉・`tests/structure/` は変えていない。独立レビューは付けない〈人間の判断。判定を緩める変更ではなく、強める側だけ〉）。ADR-0022 を新設した
  - **利用者に見える変更**:
    - verify: 権限で辿れないディレクトリ、または通常ファイルの下を通る `checks[].cwd`・`output.dir`（lstat の失敗が ENOENT 以外のもの）は、**読込で exit 2**（`VERIFY ERROR (configuration error)`。check は走らず、レポートも書かない）。
      `cwd` のケースは **exit 1 → 2**（以前は読込を通り、check が "working directory does not exist" で FAIL した）。`output.dir` は、check を全部走らせた後の report write error（exit 2）から、早い configuration error（exit 2）になる。
      symlink の輪（ELOOP）と、根の外の辿れないディレクトリへの symlink のメッセージも変わる（終了コードは 2 のまま）
    - init: 書込先（`aiqh.config.jsonc`・`.gitignore`）が dangling symlink（リンク先が未作成）のとき、`--write`・`--write-gitignore` は、何も作らず **exit 2**（`--force` でも。リンク先がプロジェクトの外でも中でも）。以前は、リンク先に新しくファイルを作り、`wrote …` と表示して exit 0 だった
    - 変わらない: 未作成の `output.dir`、存在しない（ENOENT）`cwd` の check FAIL（exit 1）、根の中を指す symlink、書込フラグなしの init、リンク先が存在する symlink への書込
  - **CI への影響**: `== 1` だけを失敗とみなす CI は、`cwd` が辿れない・通常ファイルの下を通る設定を失敗として扱わなくなる（exit 1 から 2 になる）。**`!= 0` で見ること**（ADR-0021 と同じ注意）。
    既存の設定への影響: 権限のないディレクトリや通常ファイルを通る `cwd`・`output.dir` は、今までも実行時に失敗していたが、設定の誤りとして読込で分かる。init は対話の道具で、CI への影響は小さい（推測）
  - O2: `realpathNearest()` が使う `entryExists()` は、lstat の失敗をすべて「無い」として親へ上がっていた。ENOENT だけを「無い」にし、他は `ConfigError`（`<label> cannot be resolved: <path> — <entry> cannot be examined (<code>)`）にした。ENOTDIR も拒否する（人間の判断）
  - O7・O8: 補助関数 `assertNotDanglingLink` を、設定の書込と `.gitignore` の追記の、書込の直前に呼ぶ（lstat でリンクか → リンクなら stat が ENOENT のとき `Error`。既存の `failed to write` / `failed to update` の形で、exit 2）。書く内容・書く関数・外側の関数は変えていない
  - 実測（実 CLI、v0.5.28 → v0.5.29）: O2 の 7 ケース（辿れないディレクトリの `output.dir`・`cwd`、通常ファイルの下、根の外を指す symlink が辿れないディレクトリの中にある、読める・辿れない）はすべて読込で exit 2、check は 1 つも走らない。
    O7・O8 の dangling 8 ケース（外・中・`--force`・先の親なし・git リポジトリ・両方）はすべて exit 2 で何も作らない。対照は変わらない。パスに ESC・U+202E・DEL と秘密様の名前を含めても、生の禁止文字・秘密様の文字列は出力に 0
  - 既存テストの期待値の変更は 0 件。新しいテスト 25 件（`tests/regression-backlog8a-o2-untraversable-path.test.ts` 12 件、`tests/regression-backlog8a-o7-o8-init-dangling-link.test.ts` 13 件）。v0.5.28 の `src/` に当てると 15 件が FAIL（残りの 10 件は対照）
  - 見つけて直していないこと（ADR-0022 の既知の限界）: 有効な symlink への `--force` 上書き・追記は、プロジェクトの外の既存ファイルにも書く（ROADMAP のバックログ 23）。`proposeGitignore` の提案文（O5）は、dangling でも「no .gitignore」と書く（C グループ）。
    バックログ 8 の残り（B: P3・P11・P4、C: O3・O4・O5・O9、D: O6）は直していない
- docs: ADR-0022（新規）と ADR の索引、CONFIG_SPEC（§4 規則 7、§5.3c）、README、ARCHITECTURE（§6.1b、コマンド表の init、パスの包含判定、§10 の終了コード表）、ROADMAP（項目 8 の O2・O7・O8 を解消、v0.5.29 の記録、古い「次:」の修正、項目 23 を追加。番号は詰めない）、CHANGELOG
- テスト 1,474 件（119 ファイル。1,449 ＋ 25）。`package.json` version 0.5.29（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.28 の見出しに commit b988e8a / tag object 9d2acf7 を記入した

## v0.5.28 — commit b988e8a / tag object 9d2acf7 — Backlog 3, 7 and 4: the test guards see short aliases, renderers reached through a member, and probes that are calls

- **バックログ 3・7・4（M2-2-R1-002・004・003）を解消**（テスト基盤の強化。**`src/` の差分は 0 行**。`tests/structure/` は `brand-guard.ts` +23／−1 と `process-guard.ts` +25／−12 の 2 ファイルだけ〈人間の承認〉。
  SP1 で 3 項目の調査と、一時 worktree での試作・全テストと自己 verify の実行を行い、人間の承認の後に実装した〈C1〜C5 の 5 commit〉。lock・依存関係・`package-lock.json`・禁止文字の集合〈75 コードポイント〉は変えていない。
  独立レビューは付けない〈人間の判断。出力の境界と fail closed は変わらない〉。新しい ADR は作らず、ADR-0014 を更新した）
  - **利用者に見える変更: なし**（ランタイムの動作・出力・終了コードは変わらない。`aiqh review-packet --help` はバイト単位で同一）
  - 項目 3（C1）: オプション一覧の比較が short 別名も見る。v0.5.27 では、`-o`→`-p`・`-c` の削除・`--json` への `-j` の追加・`-o` の移動・`<file>`→`[file]` の 5 つが差分 0 だった（実測）。
    案 B: テストの中の表 `SHORT_ALIASES`（output は `-o`、config は `-c`）と `Command` の `short` を比べ、値を取るオプションは必須の値（`<x>`）でなければならない
  - 項目 7（C2）: 描画関数を素の文字列を取る関数型へアサーションする形の fixture 群 `FA`（13 件）を足し、`brand-guard.ts` で、見逃していた 3 形（名前空間のメンバー `PKG.inlineCode`、オブジェクトのプロパティ `o.r`、
    引数が `string | Checked` の関数型）も報告する。報告を増やす側だけで、型で新たに許可する経路は足していない。`src/` の違反は 0、`src/` に 3 形の実例は 0
  - 項目 4（C3）: 外部コマンドのガードの probe を「そのツールだけを起動する child_process の呼び出しを初期値に持つ変数」と定義し直した。OR・AND で混ぜた変数、tool 名だけの変数、名前の配列は、v0.5.27 では `guarded` だったが、違反になる。
    実 `tests/` は 123 呼び出し・違反 0、`zip-interop` の判定は不変
  - 既存テストの期待値の変更は 0。変えたのは検査の関数: option-inventory テストの arity の検査を関数 `arityMismatch` に出して必須の値を求める条件を足し、そのテストの名前の文言を "required value" にした（assertion は同じ）。
    external-commands テストの `LIMIT` の宣言は、新しい限界 1 件のために複数行にした（既存の 1 件は同一）。新しいテスト 16 件（option-inventory 2、`FA` 13、external-commands の限界 1）。
    v0.5.27 のガード・検査に新しいテストを当てると、option-inventory で 2 件、`FA` で 4 件、external-commands で 1 件（8 行の報告が欠ける）が FAIL
  - 新しく見つけた限界（直さない。ADR-0014）: `skipIf` の条件の向きを読まない（`skipIf(hasPython)` でも `guarded`。ROADMAP のバックログ 22、特性テスト `f21_inverted_skipif`）。`null | undefined` を含むコールバック引数
    （`.then(inlineCode)`、`.then(PKG.inlineCode)`）へ描画関数を渡す形は報告される（識別子では v0.5.27 から。保守的な動作として残す）。バックログ 21（widened-container）は直していない
- docs: ADR-0014（3 つの限界の更新と、新しい限界の記録）、ARCHITECTURE（外部コマンドの段落）、README、ROADMAP（項目 3・4・7 を解消、v0.5.28 の記録、項目 22 を追加。番号は詰めない）、CHANGELOG
- テスト 1,449 件（117 ファイル。1,433 ＋ 16）。`package.json` version 0.5.28（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.27 の見出しに commit 6c7aa1e / tag object 6e895e0 を記入した

## v0.5.27 — commit 6c7aa1e / tag object 6e895e0 — Backlog 11: a usage error is exit 2 for every command and for the program

- **バックログ 11「verify / init / security-scan の使い方エラーを exit 2 に揃える」を解消**（`src/cli-program.ts` +5／−4 行。SP1 で 5 つの調査〈M1〜M5〉と、一時 worktree での試作・全テストの実行を行い、人間の承認の後に実装した〈C1〜C3 の 3 commit〉。
  `tests/structure/`・`brand-guard.ts`・禁止文字の集合〈75 コードポイント〉・依存関係・`package-lock.json` は変えていない。独立レビューは付けない〈人間の判断。出力の境界と fail closed は変わらない〉）。ADR-0021 を新設した
  - **利用者に見える変更**: 使い方エラー（未知のコマンド・オプション、オプションの値や必須の引数の欠落、余分な引数、コマンドなしの `aiqh`、未知の help の対象〈`aiqh help foo`〉）の終了コードが **1 → 2** になった
    （verify・init・security-scan と `aiqh` 本体。`review-packet` は元から 2）。メッセージ・出力先（標準エラー）・バイト数は変わらない。`--help`・`-h`・`help`・`--version`・`-V` は 0 のまま。
    使い方エラーは `VERIFY` の最終行を出さず、`error: …` の 1 行だけを標準エラーに出す
  - **CI への影響**: 終了コード 1 を「品質ゲートの失敗」として扱っていると、これまで使い方の誤り（オプションの打ち間違いなど）も 1 に混ざっていた。2 に分かれたので、「0 以外」で止める CI は動きが変わらない。
    `== 1` だけを失敗とみなしている CI は、使い方の誤りを失敗として扱わなくなるので、`!= 0` で見るか、2 を別に扱うこと
  - 実測（実際の CLI を空のディレクトリで、本処理が走らない 35 形。v0.5.26 → この版）: 18 形が 1 → 2、review-packet の 8 形は 2 のまま、help・version の 9 形は 0 のまま。`aiqh help foo` も 1 → 2。stdout・stderr のバイト数は全形で同じ
  - 実装: ルートの `exitOverride` を、コマンドを足す前に 1 つ置く（commander はサブコマンドを作るときにルートの設定を写す）。review-packet だけにあった override は外し、継承させた
  - 既存テストの期待値の変更は、使い方エラーの終了コードの 8 行（3 テスト・2 ファイル）と、`control: byte-identical to v0.5.3` の注記だけ。新しいテスト 36 件（v0.5.26 の `src/` に当てると 19 件が FAIL）
  - 既知の限界（変更の前後で同じ）: 約 100 KB の引数では、pipe への標準エラーが 65,536 バイトで切れる（`process.exit` と pipe の性質。ADR-0021）。直さない
- docs: ADR-0021（新規）、ADR の索引、ADR-0014 決定 11 に参照 1 行、ARCHITECTURE §4・§10、README、ROADMAP（項目 11 を解消。番号は詰めない）、CHANGELOG
- テスト 1,433 件（117 ファイル。1,397 ＋ 36）。`package.json` version 0.5.27（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.26 の見出しに commit aff94ca / tag object 0463218 を記入した

## v0.5.26 — commit aff94ca / tag object 0463218 — Backlog 9 and 10, review 2 (the last): truncate and the stream in the write-sites table; the options.env count

- **独立レビュー backlog-9-10-r2（`docs/reviews/backlog-9-10/independent-review-r2.md`、範囲 v0.5.24..v0.5.25）の新しい指摘 High 1 / Medium 0 / Low 1（R2-001・002）と、R1-001 の残り（stream）に対応**。
  前回の R1-002・003・004 は解消、R1-001 は部分的に解消。**`src/` に実在する漏れは 0**。**`src/` は変えていない**（tests と docs だけの版）。SP1 で 4 つの実測（M1〜M4）を行い、レビュアーの主張を確かめてから、人間の承認の後に直した（C1〜C3 の 3 commit。
  `tests/structure/`・`brand-guard.ts`・禁止文字の集合〈75 コードポイント〉・依存関係・`package-lock.json` は変えていない）。対応記録 `docs/reviews/backlog-9-10/response-r2.md`
  - **R2-001（High）**: `truncate`・`truncateSync`・`ftruncate`・`ftruncateSync` を、書き込み箇所のテスト（`tests/file-write-sites.test.ts`）の一覧（`FS_WRITERS`。内容の引数なし）に足し、`NOT_CONTENT` から外した。`src/` に call が出ると表との差分として見える。
    実測: 4 形とも、3 バイトのファイルを 4,096 バイトに延長すると、追加された 4,093 バイトがすべて 0x00（U+0000。禁止文字の集合に入る）。縮小・同じ長さでは何も足されない
  - **R1-001 の残り（stream）**: `createWriteStream` の call が表との差分になることをテストで固定した。stream の `.write()`・`.end()` に渡す内容は検査しない（出たら人間が表に 1 行足して、その stream への書き込みを一緒に判断する）。出力ガードは stream を塞がない（実測）。
    人間の判断で、`src/` で `createWriteStream` を禁止する構造ガードは足さず、表で見えるようにした。ADR-0020 の既知の限界に、レビュアーの分類（不注意で書ける形）とこの判断を書いた。先頭コメントの「列挙していない fs 関数すべて」は、`NOT_CONTENT` の実際の範囲（この作業で分類した 20 個の名前。fs の関数名 94 種のうち、どちらの表にも無いものが 61）に合う文言に直した
  - **R2-002（Low）**: docs の「`options.env` を渡す呼び出しは `src/`・`tests/` に 0 か所」を、「変更前は 0 か所。v0.5.25 現在は `src/` 0、回帰テストに 1 call site」に揃えた（ADR-0020 決定 8、CHANGELOG・ROADMAP の v0.5.25、response-r1 は本文を変えず訂正の 1 行）
  - 新しいテスト 10 件の増加（書き込み箇所のテスト 30 → 40 件）: truncate 系 4 形と `fs/promises` の `truncate` が各 1 件の site として見える 5 件、新しい `createWriteStream`・truncate 系の call が表との差分（added）になる 5 件。**修正前の結果**: truncate の定義を v0.5.25 に戻した新テストは 40 件中 9 件が FAIL。
    `src/` に truncate 系を呼ぶ新しいファイルを足すと、v0.5.25 のテストは 4 形とも見逃し（緑のまま）、新テストは 1 件ずつ FAIL。既存テストの期待値の変更は、拡張した書き込み箇所のテストを除いて 0 件
- **これが上限の最後のレビューで、3 回目は行わない**（ROADMAP のレビューの方針）。**この最終修正は、独立した再レビューを受けていない**（自己 verify と回帰テストで確認）
- docs: `docs/reviews/backlog-9-10/`（r2 の原文と対応記録、response-r1 への訂正 1 行）、ADR-0020（決定 7・8、既知の限界、影響）、ROADMAP（2 回目の結果、v0.5.26）、README・CHANGELOG
- テスト 1,397 件（116 ファイル。1,387 ＋ 10）。`package.json` version 0.5.26（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.25 の見出しに commit 3bc96dc / tag object abeb7b4 を記入した（C2）

## v0.5.25 — commit 3bc96dc / tag object abeb7b4 — Backlog 9 and 10, review 1: the write-sites test as a table; options.env through checkEnv

- **独立レビュー backlog-9-10-r1（`docs/reviews/backlog-9-10/independent-review-r1.md`、範囲 v0.5.23..v0.5.24）の High 2 / Medium 1 / Low 1（R1-001〜004）に対応**。**`src/` に実在する漏れは 0**（生の禁止文字が残る現行の書き込み漏れは無い）。
  SP1 で 5 つの実測（M1〜M5）を行い、レビュアーの主張を確かめてから、人間の承認の後に直した（C1〜C4 の 4 commit。`tests/structure/`・`brand-guard.ts`・禁止文字の集合〈75 コードポイント〉・依存関係・`package-lock.json` は変えていない）。対応記録 `docs/reviews/backlog-9-10/response-r1.md`
  - **R1-001・002（High）**: 書き込み箇所のテスト（`tests/file-write-sites.test.ts`）の「門あり」の正規表現判定をやめ、**既知の 5 か所を 1 件ずつ明示した表**（ファイル・外側の関数・書く関数・内容の式の文字列をそのまま・種別・注記）との照合にした。
    一覧に `writev`・`writevSync`・`cp` を足し、関数ごとに内容の引数の位置を持つ。新しい箇所・消えた箇所・式が変わった箇所は FAIL にして人間が表を見直す。変換が内容の全部に掛かることは、このテストの役目にしない（実 CLI のテストが担う）。
    実測: v0.5.24 の判定は、部分だけの変換を「門あり」、別の行で変換した変数を「門なし」にした。stream の `.write()`・`.end()` は塞がれていないので既知の限界に、`FileHandle` は入口で塞がれている（`node:fs/promises` が許可外）と ADR-0020 に書いた。Node の型宣言から書き込み系を全部列挙する方式は採らない
  - **R1-004（Medium）**: `src/runner/execute.ts` の `env: options.env ?? checkEnv()` を `env: checkEnv(options.env ?? process.env)` にした（+2／−1 行。`src/` の変更はこれだけ）。`options.env` は呼び出し元の環境で、渡した env も `checkEnv()` を通る。
    `options.env` を渡す呼び出しは、変更前は `src/`・`tests/` に 0 か所で（v0.5.25 現在は `src/` 0、回帰テストに 1 call site）、変更を入れても既存の 1,355 件の期待値は変わらなかった
  - **R1-003（Low）**: コードは変えず、ADR-0020 の既知の限界に書いた（Markdown の `\u{HEX}` は表示用の表記で、元から同じ文字列があった場合と区別できない。元データの忠実な確認には JSON を使う。実 CLI で実測）
  - 新しいテスト 32 件の増加: 書き込み箇所のテストを 3 → 30 件に作り直し（27 件の増加）、`options.env` のテスト 5 件。**修正前のコードでの結果**: `src/` を 9 通りに変えて旧テストと新テストを同じ変更に当てると、旧テストは 6 件を見逃し〈`writevSync`・`writev`・部分変換・新しいファイルの `writevSync` と `cp`・FileHandle の書き込み〉、
    新テストは 8 件を 1 件ずつ報告した（FileHandle は出力ガードが塞ぐ）。`options.env` のテストは修正前のコードで 5 件中 4 件が FAIL。作り直した 3 件を除いて、既存テストの期待値の変更は 0 件
- **独立レビューの 2 回目は、差分（`v0.5.24..v0.5.25`）だけを小さなパケットで出す。これが上限で、3 回目は行わない**（ROADMAP のレビューの方針）。この版は、受ける前の実装である
- docs: `docs/reviews/backlog-9-10/`（原文と対応記録）、ADR-0020（決定 1・7・8 の文言と、保証すること・しないこと、既知の限界の追加、影響）、ROADMAP（1 回目の結果と 2 回目の扱い）、ARCHITECTURE（check の環境の 2 行）、README・CHANGELOG
- テスト 1,387 件（116 ファイル。1,355 ＋ 32）。`package.json` version 0.5.25（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.24 の見出しに commit 500575a / tag object a77892e を記入した

## v0.5.24 — commit 500575a / tag object a77892e — Backlog 9 and 10: forbidden characters in the files that aiqh writes; the environment of a check

- **バックログ 9「ファイルへの出力の禁止文字」と 10「check に `NO_COLOR`」を解消**（**`src/` を変えた**〈v0.5.14 以来〉。`tests/structure/`・`brand-guard.ts`・禁止文字の集合・依存関係・`package-lock.json` は変えていない）。SP1 で実際の CLI を使って実測し、
  試作を一時 worktree で作ってから、人間の承認の後に実装した（C1〜C5 の 5 commit）
  - **項目 9（ADR-0020）**: verify のレポート（`latest.json`・`history/<ts>.json`・`latest.md`）と init の `aiqh.config.jsonc` に、禁止文字が生で書かれていた（v0.5.23 の実測: `latest.md` 40、`latest.json` 22、`history` 22、init の設定 5）。
    **書き込みの出口で、書く直前に形式別に変換する**: JSON は `\uXXXX`（読み戻すと元のデータと同一）、Markdown は `\u{HEX}`（端末と同じ表記）、init の設定は `\uXXXX`。review-packet は fail closed のまま。禁止文字の集合は既存の 75 コードポイントのまま。
    `.gitignore`・`package.json`（利用者の既存の内容）は対象外
  - **実測で見つけた Markdown の構造の崩れ**: check の出力の ``` と見出し行で、フェンスの外に見出しが増える。`project.name` の LF と `## ` で節が増える。1 行のフィールドの LF・TAB を表記にし、表のセルの `|` を保ち、フェンスを内容の最長のバッククォートの連なり + 1 にした。
    禁止文字・LF・TAB・長い連続バッククォートを含まない通常のレポートは、v0.5.23 と**バイト単位で同じ**（C1・C2・C3 のそれぞれで実測）
  - **`maskDeep()` を JSON データの写しにした**（別 commit）: レポートを写す関数を `safeJson()` と同じ写し（`copyJson()`）にした。関数・`undefined`・非有限の数・getter は固定の文言で拒否、`__proto__` というキーが残り、キーも mask する。利用者から見える変化は無い堅牢化
  - **項目 10（ADR-0020）**: check の環境から `FORCE_COLOR`・`PY_COLORS` を除き、`NO_COLOR=1` を足す（`src/runner/env.ts` の `checkEnv()`。子の環境を作る 1 か所。バックログ 6 が広げる）。実測で、`NO_COLOR` を足すだけでは何も変わらず（パイプは既定で色を出さない）、
    `FORCE_COLOR` があると eslint は色を出し続け、Node が stderr に警告を出す。`FORCE_COLOR=1` の verify の `latest.md` の生の ESC は 131 → 0
  - **実測で見つけたこと**: `FORCE_COLOR` と `NO_COLOR` を併せると Node が stderr に警告を出す（164〜328 バイト）。`PY_COLORS=1` は pytest で `NO_COLOR` に勝つ。eslint は `NO_COLOR` を `FORCE_COLOR` の下に置く。`CLICOLOR_FORCE`・`NPM_CONFIG_COLOR` は出力を変えない
  - **既知の限界**: 実端末で `cat` したときの害は推測のまま。集合の外の文字（U+200B・U+FFFD など）は表記にならない。10 は 9 の代わりにならない（ツールが明示的に ESC を出す入口は 9 が塞ぐ）
  - 新しいテスト 115 件（5 ファイル。関数の 75 コードポイント、レポート 3 ファイル、Markdown の構造、実 CLI の verify・init・環境、JSON データの写し、書き込み箇所の一覧）: v0.5.23 のコードでは 108 件 FAIL。既存の 1,240 件の期待値は 0 件変更
- **独立レビューを 1 回（上限 2 回）受ける予定**（ROADMAP のレビューの方針）。この版は、受ける前の実装である
- docs: ADR-0020（新規）、ADR-0016 に注記 1 行、ADR の索引、ARCHITECTURE・CONFIG_SPEC・ROADMAP（バックログ 9・10 を「解消」と残す。項目も番号も変えない）、README・CHANGELOG
- テスト 1,355 件（115 ファイル。1,240 ＋ 新しいテスト 115）。`package.json` version 0.5.24（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.23 の見出しに commit beb1e69 / tag object 5a2fec1 を記入した

## v0.5.23 — commit beb1e69 / tag object 5a2fec1 — M2-2: the last fix of the review: the re-export entrance, Utf8Stream as a value, the listener forms that were left (M2-2-BUILTIN-R6)

- **独立レビュー m2-2-builtin-r6（`docs/reviews/m2-2/independent-review-builtin-r6.md`、ChatGPT、範囲 v0.5.21..v0.5.22）の High 4（M2-2-BUILTIN-R6-001〜004）を修正**
  （`tests/` と docs だけ。`src/` と `package-lock.json` は変えていない）。前回の R5-001〜004 は、解消 2（002・004）、部分的に解消 2（001・003）。新しい指摘 4 件はすべて不注意で書ける形で、`src/` の該当は 0。
  4 件を (i)/(ii)/(iii) の限界に分類し直さず、入口を塞ぐ方式の延長で閉じた。4 件とも、修正前に v0.5.22 のガードへ fixture（55 件）を当てて、見逃しと端末への到達（標準出力 1 バイト）を実測してから直した
  - 構造ガード（`tests/structure/output-guard.ts`。本体 +54 / −17 行、先頭の説明コメント +11 / −7 行）: R6-001（fs・child_process の関数を名前で export する形〈`export { x } from`・`export { x as y } from`・`import { x }; export { x }`〉を違反。再 export したローカル module が関数の束になる入口だった。
    `export type`・`{ type x }` は許す）、R6-002（`Utf8Stream` を値として import・再 export する形を違反。局所の construct signature を通すと `new` の宣言の解決が外れるため。型の import は許す。`new` の検出は残す）、
    R6-003（listener の登録 method を `process["on"]` のようなソース上の文字列リテラルの要素アクセスで書く形も、`process.on` と同じ規則に入れる）、R6-004（listener の別名の追跡を、shorthand property・initializer を持つ class field に広げ、固定の深さ 3 を循環で止まる追跡に置き換えた）
  - **既存テストの期待値の変更（1 件、人間の承認）**: `tests/regression-m2-2-builtin-r5-entrance-forms.test.ts` の `p18_named_reexport` を `reported: false` → `true`
  - 直さなかった形（既知の限界）: getter が function を返す listener、Record・配列・非リテラルの要素アクセス・parameter・関数の戻り値の先の listener（(ii)）。既存の規則（要素アクセス・module の分割代入、`fd` option の型の検出、規則 K）は全部残した
  - ADR-0019 の入口の表に 3 行を足す・直した（再 export の行、`Utf8Stream` の行の更新、global の `process` と EventEmitter の行）。ROADMAP の「レビューを終える基準」の項目 2・3 を明確にした（項目 3 は表にある入口の規則の漏れにも広げた）
  - 新しい回帰テスト `tests/regression-m2-2-builtin-r6-reexport-and-listener-forms.test.ts`（58 件: 単独の 45 形 + 複数ファイルの 10 形 + fixture の型検査 2 + `src/` の違反 0）: v0.5.22 のガードでは 26 件 FAIL。本物の `src/` への違反は 0
- フレークしたテスト `every edit of a repository file type-checks`（`tests/regression-m2-2-builtin-r3-allow-branches.test.ts`）の timeout を 30 秒から 120 秒に延ばした（全件の並列実行中だけ 30 秒を超えていた。実測は単独で約 8.5〜10 秒、全件の並列実行で約 22 秒で、v0.5.21 から変わらない。検査の内容は変えていない。原因は負荷による可能性が高いが未検証）
- **レビューは r6 で終わり（r7 は依頼しない）。この最終修正は、独立した再レビューを受けておらず、自己 verify と回帰テストで確認した**
- docs: response-builtin-r6（新規。判定表、55 件の実測、人間の判断、直し方、代償、直さなかった形、教訓の候補）、独立レビューの原文の収録（無改変）。ADR-0019 の決定 7・表・入口の表・既知の限界・影響、ARCHITECTURE・README・CHANGELOG（v0.5.22 の節に訂正の注記）、ROADMAP
- テスト 1,240 件（110 ファイル。1,182 ＋ 新しい回帰テスト 58）。`package.json` version 0.5.23（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.22 の見出しに commit 4c6d430 / tag object 0447d81 を記入した

## v0.5.22 — commit 4c6d430 / tag object 0447d81 — M2-2: the entrances to the fs and child_process functions are closed, and a static type is not taken for the absence of an `fd` (M2-2-BUILTIN-R5)

- **独立レビュー m2-2-builtin-r5（`docs/reviews/m2-2/independent-review-builtin-r5.md`、ChatGPT、範囲 v0.5.20..v0.5.21）の High 2 / Medium 1 / Low 1（M2-2-BUILTIN-R5-001〜004）を修正**
  （`tests/` と docs だけ。`src/` と `package-lock.json` は変えていない）。前回の R4-001〜006 は、解消 5（001・002・004・005・006）、部分的に解消 1（003）。新しい指摘 4 件は不注意で書ける形で、`src/` の該当は 0
  - 方式: 構文を足さず、**値の入口を塞ぐ**。構造ガード（`tests/structure/output-guard.ts`）: R5-001（`fs`・`child_process`・`fs/promises` の default import・`import * as`・`{ default as x }`・`{ promises }`・`export *`・`export * as`・再 export・動的 `import()` を違反。
    名前付き import の関数だけを入口にする）、R5-002（`createReadStream`・`createWriteStream` の options を省略・文字列・新しい object literal に限る。`new Utf8Stream` を違反: 入口の表で見つけた、`dest: "/dev/stdout"` が標準出力へ届き見逃されていた形）、
    R5-003（`process.on` などの listener が `this` を使う直接の形。`prependOnceListener` を含む）、R5-004（`stdio`・規則 K の計算されたキーの `as const`・`satisfies` の誤検出。holder の `process["platform" as const]` は違反のまま）
  - **既存テストの期待値の変更（13 件、人間の承認）**: EventEmitter の限界の記録 11 件（`x25`・`x26`・`x36`・`x37`・`g06`・`ee01`〜`ee06`）を「報告される」へ、`b14_control_optional_no_fd` を「報告される」へ（`fd` を持たない options の変数も報告する代償）、
    `ct07_dynamic_import_allowed` を報告される形 `di05_fs_dynamic_import_namespace` へ。`xb25` は変更なし
  - 既知の限界（箱 2）: R5-003 の Record・要素アクセスの先の listener（(ii)）、総称型の cast と別の値（(ii)）。既存の規則（要素アクセス・module の分割代入、`fd` option の型の検出、規則 K）は全部残した。外す判断は r6 の後
  - ADR-0019 に**入口の表**（許可モジュールごとに 1 回）を足した。ROADMAP の「レビューを終える基準」を回数の上限に改めた: **m2-2-builtin の独立レビューは r6 を最後の 1 回とし、r7 は依頼しない**
  - 新しい回帰テスト `tests/regression-m2-2-builtin-r5-entrance-forms.test.ts`（75 件: SP1 の fixture 70 形 + fixture の型検査 2 + `fd` を取る API の一覧が `@types/node` と両方向に一致するテスト 2 + `src/` の違反 0）: v0.5.21 のガードでは 41 件 FAIL。本物の `src/` への違反は 0
- docs: response-builtin-r5（新規。判定表、実測、人間の判断、試作との違い、代償、期待値を変えた 13 件、教訓の候補）、独立レビューの原文の収録（無改変）。ADR-0019 の決定 7・表・入口の表・既知の限界・影響、ARCHITECTURE・README・CHANGELOG（v0.5.21 の節に訂正の注記）、ROADMAP
- テスト 1,182 件（109 ファイル。1,107 ＋ 新しい回帰テスト 75）。`package.json` version 0.5.22（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.21 の見出しに commit e39ff47 / tag object 2b3cde6 を記入した
- （v0.5.23 で訂正の注記: この版の「listener の直接の形を違反にした」「残る EventEmitter は indirect form だけ」は、登録 method の literal の要素アクセス・shorthand property・class field・4 段以上の別名で過大だった。また、名前付きの関数の再 export は許していたが、再 export したローカル module が関数の束になる入口だった。v0.5.23 で直した。M2-2-BUILTIN-R6-001〜004）

## v0.5.21 — commit e39ff47 / tag object 2b3cde6 — M2-2: a type is taken apart into its branches, and a function is found by every way to name it (M2-2-BUILTIN-R4)

- **独立レビュー m2-2-builtin-r4（`docs/reviews/m2-2/independent-review-builtin-r4.md`、ChatGPT、範囲 v0.5.19..v0.5.20）の High 4 / Medium 2（M2-2-BUILTIN-R4-001〜006）を修正**
  （`tests/` と docs だけ。`src/` と `package-lock.json` は変えていない）。前回の R3-001〜008 は、解消 5（001・002・004・007・008）、部分的に解消 3（003・005・006）。新しい指摘は、v0.5.20 のガードが型の最上位の flag と 1 種類の構文しか見ていなかった形（High 4 件は不注意で書ける形）と、決定 7 の表の範囲
  - 構造ガード（`tests/structure/output-guard.ts`・`brand-guard.ts`）: R4-001（fs の writer の先頭の引数が union・intersection・型パラメーターの枝に number・device path の literal を持つ形）、R4-002（`fd` option の枝。動的なキー・index signature は規則 K: fs の呼び出しに限る）、
    R4-003（fs・child の関数の参照を、要素アクセス・分割代入・`fs/promises` でも見る）、R4-004（`stdio` の後ろの計算された名前）、R4-005（括弧・`!` と options の `satisfies`・`as const`・括弧の誤検出 2 方向を直した）、
    INV-1（SP1 の棚卸しで見つけた、総称型の cast の `as T | undefined`・`NonNullable<T>`。両ガード）。R4-006: ADR-0019 の決定 7 の表を「決定の対象として棚卸しした許可の分岐で、すべての許可の一覧ではない」と狭く明記した（案 2）
  - **既存テストの期待値の変更（1 件、人間の承認）**: `tests/regression-m2-2-builtin-r3-allow-branches.test.ts` の `xb25_stdio_options_paren` を `reported: true` → `false`（R4-005 が指摘した、括弧で囲んだ安全な options の誤検出を固定していた期待値）
  - 既知の限界（箱 2）: INV-1 の残り（`Awaited<T>`・`Partial<T>`。(ii)）、R3-005 の残り・EventEmitter の unbound method（(ii)）、`function (this: 偽の型)`（(i)）。`stdio` の後ろの method は実行時に拒まれる誤検出（箱 3）。ROADMAP の「レビューを終える基準」を (i) 意図的な偽装 / (ii) `src/` と両立しない形に直した
  - 代償として違反になる形 6 つ（ADR-0019 の影響の節）
  - 新しい回帰テスト `tests/regression-m2-2-builtin-r4-union-and-element-forms.test.ts`（91 件: SP1 の fixture 89 形〈85 + 型検査で止まる 4〉+ fixture の型検査 + `src/` の違反 0）: v0.5.20 のガードでは 62 件 FAIL。既存の 1,016 件は上の 1 件を除いて期待値を変えていない。本物の `src/` への違反は 0
- docs: response-builtin-r4（新規。判定表、人間の判断、棚卸しの記録〈51 と 53。ADR の保証ではない〉、代償、教訓の候補、`package-lock.json` の差分 v0.5.19..v0.5.20 の全文）、独立レビューの原文の収録（無改変）。ADR-0019 の決定 7・表・既知の限界・影響、ARCHITECTURE・README・CHANGELOG（v0.5.20 の節に訂正の注記）、ROADMAP
- テスト 1,107 件（108 ファイル。1,016 ＋ 新しい回帰テスト 91）。`package.json` version 0.5.21（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.20 の見出しに commit / tag object の SHA を記入した
- （v0.5.22 で訂正の注記: この版の ADR-0019 が EventEmitter の unbound method を一括して (ii) と分類したのは広すぎた。直接解決できる形は不注意で書ける形で、v0.5.22 で狭い `this` 規則を採った。残る (ii) は Record・要素アクセスの先だけ。M2-2-BUILTIN-R5-003）

## v0.5.20 — commit d669b5e / tag object dc967e2 — M2-2: a permission of the structure guards rests on syntax or a top-level declaration, not on a name or a static type (M2-2-BUILTIN-R3)

- **独立レビュー m2-2-builtin-r3（`docs/reviews/m2-2/independent-review-builtin-r3.md`、ChatGPT、範囲 v0.5.18..v0.5.19）の High 7 / Medium 1（M2-2-BUILTIN-R3-001〜008）を修正**
  （`tests/` と docs、依存関係の 1 件だけ。`src/` は変えていない）。前回の M2-2-BUILTIN-R2-001 は「解消」。原文は、v0.5.19 の広い保証（許可の根拠は型でなく構文か宣言）が現コード全体では成立していない、という指摘
  - C0: `brace-expansion` の high の advisory 3 件を `npm audit fix` だけで直した（5.0.9 → 5.0.12。`package-lock.json` の 1 か所）
  - 8 件を 1 件ずつ 3 つの箱に仕分けた。箱 1（直した）: writer は正確な組（`emitOut` = `console.log`・`process.stdout.write`、`emitErr` = `console.error`・`process.stderr.write`）+ 全枝 `Safe`（R3-001）、
    認可は最上位の宣言の名前（R3-002、brand-guard も）、総称型の cast は必須の T の引数だけ（R3-003）、`stdio` の後ろの spread（R3-004）、fs・child の関数は callee だけ（R3-006。`.call`・`.apply`・
    `Reflect.apply` を含む）、`.constructor` の wrapper（R3-007）、device path は fs の writer の先頭の引数だけ（R3-008）、fd option（型が `fd` を持つ引数、計算された名前。2 巡目の K1）、
    brand-guard の呼び出し元の名前（K2）。R3-005 は部分規則（型アサーション・`satisfies` の形）。箱 2（既知の限界）: R3-005 の残り、EventEmitter の `this`（狭い規則を試作したが採らなかった）、
    brand-guard の広げ（K3。バックログ 21）、読み取りの device path の誤検出
  - 新しい回帰テスト `tests/regression-m2-2-builtin-r3-allow-branches.test.ts`（116 件）: v0.5.19 のガードでは 52 件 FAIL。既存の 900 件の期待値は変えていない。本物の `src/` への違反は 0
- docs: response-builtin-r3（新規。EventEmitter の試作の付録つき）、独立レビューの原文の収録。ADR-0019 の決定 7 を許可の分岐の表と 1 対 1 に書き直し、既知の限界を足した。ARCHITECTURE・README・CHANGELOG（v0.5.19 の節）
  の「許可の根拠は型でなく構文か宣言」の文を訂正した。ROADMAP（バックログ 21 を足し、レビューを終える基準を記録）
  - （v0.5.21 で訂正の注記: この版の決定 7 の「表と 1 対 1 で書く。表にない許可は書かない」は、表が許可の分岐の一部〈53 のうち 12〉にすぎず成立していなかった。v0.5.21 で、表を「決定の対象として棚卸しした許可の分岐」とし、すべての許可の一覧ではないと範囲を狭く明記した。M2-2-BUILTIN-R4-006）
- テスト 1,016 件（107 ファイル。900 ＋ 新しい回帰テスト 116）。`package.json` version 0.5.20（`package-lock.json` の `version` は 0.1.0 のまま）
- 注記: v0.5.19 の見出しに commit / tag object の SHA を記入した

## v0.5.19 — commit be06222 / tag object 625ed0d — M2-2: only a key written as a string literal is safe; a type is not the value (M2-2-BUILTIN-R2-001)

- **独立レビュー m2-2-builtin-r2（`docs/reviews/m2-2/independent-review-builtin-r2.md`、ChatGPT、範囲 v0.5.17..v0.5.18）の High 1 件（M2-2-BUILTIN-R2-001）を修正**
  （`tests/` と docs だけ。`src/` は変えていない）。前回の M2-2-BUILTIN-R1-001 は「解消」、新しい指摘は High 1 / Medium 0 / Low 0
  - 構造ガード（`tests/structure/output-guard.ts`）の許可の根拠を、型でなく構文か宣言の解決にした（ADR-0019 の決定 2 の改訂と決定 7）。**（v0.5.20 で範囲を訂正: この版で実際に構文に基づくようになったのは、要素アクセスのキーと child の `stdio` などで、writer・生成者の許可は名前、fd の判定は型、fs・child の API の判定は call の signature の declaration に基づいたままだった。M2-2-BUILTIN-R3、ADR-0019 の決定 7 の表）**`process[key]` などの要素アクセスは、キーが
    ソース上の文字列リテラルでなければ、キーの型がどうでも違反にする（`as`・`any`・`JSON.parse`・引数・戻り値・オーバーロード・`declare const` で型だけ安全なリテラルに見せた値が、
    実行時に危険なメンバーを取り、端末に届いていた。v0.5.4 からの既存の問題）。同じ系統の 5 つの規則も同時に足した: child の `stdio` はソース上のリテラルだけ、型が `any` の値の
    呼び出しと fs の書き込み先、`.constructor` の読み取り、リテラルのキーの `eval`・`Function`・`require`・`createRequire`、`Safe` を作る総称型の cast は違反。fs のリテラルのパスは
    `.`・`//`・`x/../` を畳んでから `/dev/`・`/proc/` を見る（+55 / −20 行、先頭のコメントを含む）
  - 洗い出しは 2 巡: 1 巡目 51 形（v0.5.18 は塞ぐべき 36 形のうち 30 形を見逃し、実行時に端末へ届いた）、2 巡目 82 形（構文の形と、holder を別の経路で得る形。パスの書き方の 5 形を塞ぎ、
    EventEmitter の `this` と組み立てたパスを既知の限界にした）
  - 新しい回帰テスト `tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts`（100 件）: v0.5.18 のガードでは 39 件 FAIL。R1 の回帰テストの対照 3 件（型がリテラルのキー）を、
    構文上のリテラルの対照へ置き換えた（人間の承認）。ほかの既存のガードのテストの期待値は変えていない。本物の `src/` への違反は 0
- docs: response-builtin-r2（新規）、独立レビューの原文の収録。ADR-0019 に決定 7 と既知の限界を足し、決定 2 を改訂した。ARCHITECTURE の出力の出口、ROADMAP
  （バックログは項目も番号も変えていない）
- テスト 900 件（106 ファイル。800 ＋ 新しい回帰テスト 100）。`package.json` version 0.5.19（`package-lock.json` は変えていない）
- 注記: v0.5.18 の見出しに commit / tag object の SHA を記入した

## v0.5.18 — commit 275dbd6 / tag object 9e7b0d5 — M2-2: the output guard reports process members taken by an element access whose key type names them (M2-2-BUILTIN-R1-001)

- **独立レビュー m2-2-builtin-r1（`docs/reviews/m2-2/independent-review-builtin-r1.md`、ChatGPT、範囲 v0.5.16..v0.5.17）の Medium 1 件（M2-2-BUILTIN-R1-001）を修正**
  （`tests/` と docs だけ。`src/` は変えていない）。前回の M2-2-R4-002 は「部分的に解消」、新しい指摘は High 0 / Medium 1 / Low 0
  - 構造ガード（`tests/structure/output-guard.ts`）は、`process[key]` のキーの型が 1 つの文字列リテラルに決まるとき（const・`as const`・型注釈・引数・readonly のプロパティ・
    タプルの要素・テンプレートリテラル・絞り込んだユニオンなど）、取れたプロパティが `process` の 6 つのメンバーなら、メンバーの名前（`process.getBuiltinModule` など）で
    報告する（+6 / −2 行）。v0.5.17 はキーが文字列リテラルのときだけ検出していた。キーの型が 1 つに決まらない形は従来どおり `dynamic access to …`
  - v0.5.17 のガードは、SP1 で洗い出した 31 形のうち 18 形を見逃していた（代表の形は実行時に標準出力へ届いた）。今の `src/` は `process[…]` の形を使わない（違反 0 件）
  - 新しい回帰テスト `tests/regression-m2-2-builtin-r1-001-literal-typed-key.test.ts`（39 件）: v0.5.17 のガードでは 20 件 FAIL（PASS の 19 件は、既に検出していた形・対照・
    型検査・`src/` の違反 0）。既存のガードのテストの期待値は変えていない
- docs: response-builtin-r1（新規）、独立レビューの原文の収録。ADR-0019 の決定 2 を実装に合わせて正確にし、v0.5.17 の不足を注記した。ARCHITECTURE の出力の出口、ROADMAP
  （バックログは項目も番号も変えていない）
- テスト 800 件（105 ファイル。761 ＋ 新しい回帰テスト 39）。`package.json` version 0.5.18（`package-lock.json` は変えていない）
- 注記: v0.5.17 の見出しに commit / tag object の SHA を記入した

## v0.5.17 — commit 830c4f5 / tag object 91a88f9 — M2-2: the output guard allowlists the modules src loads and forbids six process members (backlog 1, M2-2-R4-002)

- **ROADMAP のバックログ 1（M2-2-R4-002、Medium、ADR-0017 の既知の限界: `src/` が読み込める組み込みモジュールの一覧）を修正**（`tests/` と docs だけ。`src/` は変えていない）
  - 構造ガード（`tests/structure/output-guard.ts`）は、`src/` が実行時に読み込むモジュールの行き先を一覧で限る: 組み込みは `node:` 付きの child_process・crypto・fs・path・
    string_decoder・zlib だけ、ほかは `src/` のソースファイルと package.json の `dependencies`。`import type` は見ない。一覧の外の組み込み、`node:` の無い組み込み、
    URL（`data:` など）、`src/` のソースファイルでないモジュール、依存に無いパッケージは違反
  - `process` の `getBuiltinModule`・`dlopen`・`report`・`emitWarning`・`execve`・`stdin` は、宣言で見つけて違反にする（別名・分割代入・要素アクセス・`globalThis.process`・
    `node:process` の import も同じ。`getBuiltinModule` は名前を問わない）
  - v0.5.16 のガードは、SP1 で洗い出した同じ種類の 49 形（型検査を通るもの）のうち 40 形を見逃していた（見逃した形のうち実行時に動かした 13 形は、どれも端末に届いた）。
    今の `src/` はどの形も使っていなかった（違反 0 件）
  - 新しい回帰テスト `tests/regression-m2-2-r4-002-builtin-allowlist.test.ts`（61 件）: 49 形は報告される、対照 8 形は報告されない、fixture の型検査、`src/` の違反 0、
    一覧と `src/` の実際の一致、6 つのメンバーが今の `@types/node` の宣言に解決すること。v0.5.16 のガードでは 42 件 FAIL（PASS の 19 件は、既に検出していた 9 形・
    対照 8・型検査・`src/` の違反 0）。既存テストの期待値は変えていない
- docs: ADR-0019（新規。一覧を変えるときは ADR-0019 に追記し、独立レビューの対象にする。既知の限界 6 つ）。ADR-0017 の状態の行と既知の限界に「v0.5.17 で ADR-0019 により置換」。
  ARCHITECTURE の出力の出口。response-r4 に v0.5.17 の節。ROADMAP: バックログ 1 を「v0.5.17 で解消」として残し、番号を詰めない。20（コールバックの中の未処理の例外の表示）を
  末尾に足した。2〜19 は変えていない
- テスト 761 件（104 ファイル。700 ＋ 新しい回帰テスト 61）。`package.json` version 0.5.17（`package-lock.json` は変えていない）
- 注記: v0.5.16 の見出しに commit / tag object の SHA を記入した

## v0.5.16 — commit 764fdf2 / tag object 13c0468 — M2-2: independent review cli-catch-r2 — the CLI catch work is closed (docs only)

- 独立レビュー m2-2-cli-catch-r2（`docs/reviews/m2-2/independent-review-cli-catch-r2.md`、ChatGPT、範囲 v0.5.14..v0.5.15）: 前回の M2-2-CLI-CATCH-R1-001 は解消。
  新しい指摘は High 0 / Medium 0 / Low 0。対応記録 `docs/reviews/m2-2/response-cli-catch-r2.md`
- 事前に決めていた人間の判断（High が 0 なら終える）により、CLI の最上位の catch の作業（v0.5.14・v0.5.15）を終える（m2-2-cli-catch-r3 は行わない。
  レビューパケットも作らない）
- パケットには `--doc` で `tests/helpers.ts`・`docs/ARCHITECTURE.md`・`vitest.config.ts` の全文を載せた。r1 で「未確認の範囲」になった後始末の仕組みと、上限 5 秒と
  `hookTimeout` 30 秒の関係まで確認された
- レビュアーの「未確認の範囲」は、新しい作業を起こさずに記録した
  - 修正の前後の実測値そのもの: レビュアーは独立に再実行していない。条件と方法は妥当と判定され、数値は response-cli-catch-r1 に残っている
  - `src/` 全体の棚卸し、`src/cli.ts` の最上位の catch、バックログ 19 などの既知のバックログ、Windows・所要時間・過去の記録の言い回し: 依頼文で範囲外
- ROADMAP: M2-2 の節に cli-catch-r2 の結果と v0.5.16 を書いた。バックログは項目も番号も変えていない
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 700 件（103 ファイル）。`package.json` version 0.5.16（`package-lock.json` は変えていない）
- 注記: v0.5.15 の見出しに commit / tag object の SHA を記入した

## v0.5.15 — commit d27f6cd / tag object 1c1a658 — M2-2: the CLI catch regression test owns each CLI run and stops it in afterEach (M2-2-CLI-CATCH-R1-001)

- 独立レビュー m2-2-cli-catch-r1（`docs/reviews/m2-2/independent-review-cli-catch-r1.md`、ChatGPT、範囲 v0.5.13..v0.5.14）: 新しい指摘は High 0 / Medium 1 / Low 0。
  製品コード `src/cli.ts` の修正には新しい不具合は無かった。対応記録 `docs/reviews/m2-2/response-cli-catch-r1.md`
- **M2-2-CLI-CATCH-R1-001（Medium）を修正**（`tests/regression-m2-2-cli-catch-001-thrown-value.test.ts` だけ。製品のコードは変えていない）: v0.5.14 の新しい回帰テストは
  CLI を `execFile()` で起こすが、ChildProcess の handle を持たず、`afterEach` が無く（実行は `runs` の map で共有）、一時ディレクトリを `afterAll` で消していた。
  v0.5.14 の写しで終わらない CLI を作ると、テストの失敗・タイムアウトの後も CLI は vitest の終了から約 38 秒残り、一時ディレクトリは CLI より先に消えた
  （M2-2-R5-001 と同じく、ワーカーが止められると `execFile` のタイマーは働かない）
  - 各 `it` が自分の実行を持ち、一時ディレクトリは実行ごと。起動の直後に `stopper`（handle への SIGKILL と、上限つきの確定の待ち）を積み、`afterEach` の
    `runCleanups` で CLI を止めてから一時ディレクトリを消す。`execFile` の `timeout`・`killSignal` は二重の安全弁として残した
  - 確かめ（写しだけ。本体のテストに仕掛けは入れていない）: 修正後は 2 回とも、CLI はそのテストの `afterEach` の中で消え、vitest の終了の後の残り 0、
    一時ディレクトリは CLI の後に消えた（修正前の v0.5.14 は満たさない）
  - preload と 25 件の本文・期待値は変えていない（`shown()` から末尾まで v0.5.14 とバイト単位で同じ）。ほかのテストも変えていない
- レビュアーの「未確認の範囲」（`src/` 全体の棚卸しの網羅性、`src/output.ts` の全文）は、新しい作業を起こさずに記録した（パケットが変更したファイルの全文しか含まないため）
- docs: レビュー原文の収録（変更した行 0）と対応記録。ROADMAP: M2-2 の節に r1 の結果と v0.5.15。バックログは項目も番号も変えていない。ARCHITECTURE は変えていない
- テスト 700 件（103 ファイル。件数は変わらない）。`package.json` version 0.5.15（`package-lock.json` は変えていない）
- 注記: v0.5.14 の見出しに commit / tag object の SHA を記入した

## v0.5.14 — commit d98a5a6 / tag object 7b3d83b — M2-2: the CLI's top-level catch never throws and always exits 2 (backlog 1)

- **ROADMAP のバックログ 1（CLI の最上位の catch、Medium。v0.5.12 の SP1 で発見）を修正**（`src/` は `src/cli.ts` だけ）
  - 最上位の catch は、最初に exit 2 を決め、投げられた値を調べる操作（`instanceof`・`message` の読み取り・文字列への変換）と 1 行目の組み立てを try の中でだけ行う。
    失敗したら固定の文 `aiqh: unexpected error: (the thrown value could not be inspected)` にし、投げられた値も、調べる途中で投げられた値も読み直さない
  - 書けない行は飛ばす（行ごとの try）。判定の行 `VERIFY ERROR (internal error)` は書こうとする
  - v0.5.13 では、調べると例外になる値（`getPrototypeOf` が投げる Proxy、`message` の getter が投げる Error、`toString`・`Symbol.toPrimitive` が投げる object、
    取り消し済みの Proxy など 9 通り）で catch 自体が例外になり、Node の既定の表示で生の文字列が出て exit 1 になった（6 通りは生の U+202E と mask されない秘密の形）。
    利用者の入力からは届かない（`src/` 全体の棚卸しで、投げられた値を調べる 32 か所とも届く経路が無い。ほかの箇所は変えていない）
  - 普通の値（Error・文字列・`toString` を持つ object・symbol）の出力は変わらない（v0.5.4 のバイト比較の 42 通りが v0.5.13 と一致）
  - 新しい回帰テスト `tests/regression-m2-2-cli-catch-001-thrown-value.test.ts`（25 件）: 実物の CLI を子プロセスで起こし、preload で値を届ける（`src/` に差し込み口は
    足さない）。v0.5.13 では 13 件 FAIL（PASS の 12 件は対照 5 件と、読み直しを数える 7 件）。既存テストの期待値は変えていない
- docs: ADR-0018 の既知の限界に「v0.5.14 で解消」。ARCHITECTURE の出力の出口。response-r7 に v0.5.14 の節（`src/` 全体の棚卸しの表を含む）、response-r8 の
  「未確認の範囲」1 に v0.5.14 の追記 1 行。ROADMAP: バックログ 1 を外し、2〜20 は 1〜19 になった（ADR-0017・ADR-0018・ARCHITECTURE と版の無い参照を合わせた）
- テスト 700 件（103 ファイル。675 ＋ 新しい回帰テスト 25）。`package.json` version 0.5.14（`package-lock.json` は変えていない）
- 注記: v0.5.13 の見出しに commit / tag object の SHA を記入した

## v0.5.13 — commit 18c4c95 / tag object 3d83c7b — M2-2: independent review R8 — the safeJson review is closed (docs only)

- 独立レビュー m2-2-r8（`docs/reviews/m2-2/independent-review-r8.md`、ChatGPT、範囲 v0.5.11..v0.5.12）: 前回の M2-2-R7-001〜003 は 3 件とも解消。
  新しい指摘は High 0 / Medium 0 / Low 0。対応記録 `docs/reviews/m2-2/response-r8.md`
- 人間の判断で、M2-2 の safeJson に関するレビューを R8 で終える（R9 は行わない。レビューパケットも作らない）
- レビュアーの「未確認の範囲」は、新しい作業を起こさずに記録した
  - `src/cli.ts` のすべての throw の箇所: 既知の限界としてバックログ 1（CLI の最上位の catch）で扱う
  - 42 通りのバイト比較: リポジトリのテストではなく git 管理外の道具で、v0.5.12 の SP2 で実測済み（各 commit と HEAD で一致）
  - 変更していないコマンドの `--json` の値: 既存の回帰テストと ADR-0018 の範囲で扱う
- ROADMAP: M2-2 の節に R8 の結果と v0.5.13 を書いた。バックログは項目も番号も変えていない
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 675 件（102 ファイル）。`package.json` version 0.5.13（`package-lock.json` は変えていない）
- 注記: v0.5.12 の見出しに commit / tag object の SHA を記入した

## v0.5.12 — commit 0231ab0 / tag object 4048afc — M2-2: safeJson reads array length and keys exactly and fixes failed inspections (M2-2-R7-001..003)

- **M2-2-R7-001〜003（Medium、独立レビュー m2-2-r7）を修正**（`src/` は `src/output.ts` だけ。ADR-0018 の決定は変えず、実装を合わせた）
  - R7-001: 配列の `length` を、ほかのプロパティと同じく記述子から読む（数えられない、0〜2^32−1 の整数）。Proxy の `get` のトラップは呼ばない
  - R7-002: 配列の自分のキーは、添字 `0`〜`length-1` と `length` にちょうど一致することを確かめる（`length + 1` 個で、どれも `"length"` か `length` 未満の正規の添字）。
    記述子を読むのはその添字だけ。`ownKeys()` で `symbol` や添字でないキーを見せる Proxy の配列は拒否する
  - R7-003: 値を調べる操作（`getPrototypeOf`・`ownKeys`・`Array.isArray`・記述子の読み取り）が投げたら、何を投げても、投げられた値を束縛も読み取りもせず
    （`cause` にも入れない）、固定の拒否にする。Proxy のトラップの例外、操作の内側の利用者のコード、トラップの答えを検査するエンジンの TypeError（利用者のキーを
    引用することがある）、取り消し済みの Proxy が対象
  - 新しい拒否の種類: `a value whose structure could not be inspected`、`an array whose length is not a valid array length`（CLI は従来どおり unexpected error、**exit 2**）
  - 今の通常の出力は変わらない（v0.5.4 のバイト比較の 42 通り〈`--json` の 5 通りと init `--write` のファイルを含む〉が v0.5.11 と一致）
  - 新しい回帰テスト `tests/regression-m2-2-r7-json-data-proxy.test.ts`（17 件）: v0.5.11 では 15 件 FAIL（PASS の 2 件は対照）。既存テストの期待値は変えていない
- SP1 の新しい発見: 投げられた値を調べると例外になる値（`getPrototypeOf` が投げる Proxy、`message` の getter が投げる Error）では、`src/cli.ts` の最上位の catch の
  中で例外になり、Node の既定の表示で生の文字列が出て exit 1 になった。`safeJson()` を通る経路は、この版で固定の拒否（exit 2）になった。CLI の catch そのものは、
  ROADMAP のバックログ 1 に入れた（利用者の入力からは届かない。Medium）。v0.5.11 の「端末では `writeError()` で表記・mask される」の訂正を response-r7 と ADR-0018 に書いた
- docs: ADR-0018 の v0.5.11 の注記に「v0.5.12 で解消」、決定 3 の具体化、既知の限界の解消と訂正。ARCHITECTURE の出力の出口。response-r7 に v0.5.12 の節。
  ROADMAP: バックログ 1 を CLI の最上位の catch の項目に入れ替えた（ほかの番号は変わらない）
- テスト 675 件（102 ファイル。658 ＋ 新しい回帰テスト 17）。`package.json` version 0.5.12（`package-lock.json` は変えていない）
- 注記: v0.5.11 の見出しに commit / tag object の SHA を記入した

## v0.5.11 — commit 41a0930 / tag object d44270f — M2-2: independent review R7 — the M2-2-R4-001 work is closed (docs only)

- 独立レビュー m2-2-r7（`docs/reviews/m2-2/independent-review-r7.md`、ChatGPT、範囲 v0.5.9..v0.5.10）: 前回の M2-2-R4-001 は解消。新しい指摘は High 0 / Medium 3 / Low 0。
  対応記録 `docs/reviews/m2-2/response-r7.md`
  - M2-2-R7-001: 配列の `length` を `value.length` で読むので、Proxy の配列では `get` のトラップが呼ばれる（ADR-0018 の「記述子で 1 回だけ読む」と合わない）
  - M2-2-R7-002: 配列の自分のキーを個数だけで確かめるので、`ownKeys()` と記述子が食い違う Proxy の配列を受け付ける（ADR-0018 の配列の定義と合わない）
  - M2-2-R7-003: Proxy のトラップ自身が投げた例外が、種類だけの拒否に変わらずに伝わる（ADR-0018 の失敗の形と合わない）
- 区切る前に 3 件の前提を実測した（3 件とも再現した。High の基準には当たらない）: 受け付けた Proxy の配列の出力は、記述子が見せた JSON のデータで、表記・mask を通る。
  トラップの例外は、CLI の最上位で `writeError()` を通り、端末では表記・mask される（一時 worktree の写しで実測。exit 2、標準出力は空）。利用者の入力
  （jsonc-parser・zod・`JSON.parse`・git の出力・ファイル名）から、Proxy・accessor・普通でないプロトタイプがコマンドの値に届く経路は無い
- ADR-0018: 既知の限界に R7 の 3 件を追記し、決定 1〜3 と Proxy の既知の限界の文に、実装の事実の注記を足した（決定は変えていない）。ARCHITECTURE の出力の出口も同じ
- ROADMAP: R7 の 3 件を 1 項目にまとめてバックログの先頭（1）へ。既存の項目は 2〜20 に（v0.5.10 の 1〜19）。ADR-0017・ADR-0018・ARCHITECTURE の番号の参照を直した。
  M2-2 の節の版の無い「下のバックログ N」も今の番号に合わせた（v0.5.1・v0.5.2 の記録の分は付け替えの後の番号と一致するので文字は変わらない。v0.5.10 の記録の 9 は 10 に）。
  過去の版の項、`docs/reviews/`、ROADMAP の版つきの番号と行ったことの記録は当時の番号のまま
- 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、M2-2-R4-001 の作業（v0.5.10、独立レビュー R7）をここで区切る
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 658 件（101 ファイル）。`package.json` version 0.5.11（`package-lock.json` は変えていない）
- 注記: v0.5.10 の見出しに commit / tag object の SHA を記入した

## v0.5.10 — commit 2af8738 / tag object 46494f0 — M2-2: safeJson accepts JSON data only (M2-2-R4-001)

- **M2-2-R4-001（Medium、独立レビュー m2-2-r4）を修正**（`src/` は `src/output.ts` だけ。ADR-0018）: `safeJson()` は値を `Object.entries()` と `map()` で写して
  `JSON.stringify()` に渡していたので、写しに残った関数を `JSON.stringify()` が呼び、戻り値が表記・mask を通らずに出た（自分の `toJSON` の関数など。今の各コマンドの
  `--json` には無い値）
  - `jsonSafe()` は JSON のデータ（文字列・有限の数・真偽値・null・配列〈プロトタイプが `Array.prototype`、穴や添字でないキーが無い〉・object〈プロトタイプが
    `Object.prototype` か null、自分のプロパティは文字列のキーの数えられるデータのプロパティ〉。循環なし、深さ 100 段まで）だけを受け付ける
  - それ以外（関数・`symbol`・`bigint`・`undefined`・`NaN` / `Infinity`・getter / setter・数えられないプロパティ・`symbol` のキー・普通でないプロトタイプ・
    穴のある配列・循環・101 段以上の入れ子など）は、出力の前に拒否する（fail closed）。メッセージは `JSON output refused: <種類> is not JSON data` で、キー・値・パスを
    載せない。CLI は最上位の unexpected error で **exit 2**（R3-002 のキーの衝突と同じ経路）
  - 各プロパティは記述子で 1 回だけ読み、getter と `toJSON` は呼ばない。`map()` を使わない（`Symbol.species` を通らない）
  - 今の通常の出力は変わらない（v0.5.4 のバイト比較の 42 通り〈`--json` の 5 通りと init `--write` のファイルを含む〉が v0.5.9 と一致）
  - 新しい回帰テスト `tests/regression-m2-2-r4-001-json-data.test.ts`（M2-2-R4-001、34 件）: v0.5.9 では 33 件 FAIL（PASS の 1 件は対照）
  - 期待値の変更: `tests/regression-m2-2-r3-002-json-keys.test.ts` の対照の値から `endLine: undefined` を外した（今は拒否する値）
  - SP1 の洗い出しで、v0.5.5 の記録（そのまま出るのは自分の `toJSON` の 2 形だけ）に 6 種類の漏れがあった（`toJSON` を持つ関数・クラス、`toJSON` を持つ関数を返す
    getter、Array のサブクラス、`Symbol.species` の差し替え、Proxy）。どれも今のコマンドの値には入らない
- docs: ADR-0018（新規）。ADR-0017 の決定 3 の但し書きと既知の限界の R4-001 を ADR-0018 で置換。ADR の索引、ARCHITECTURE の出力の出口、response-r4 に v0.5.10 の節。
  ROADMAP: バックログ 1 を外し、2〜20 → 1〜19。ファイルへの出力の禁止文字（9）に `maskDeep()` の 1 行を足した（ADR-0017・ARCHITECTURE の番号の参照を直した。
  過去の版の項、`docs/reviews/`、ROADMAP の各版の記録は当時の番号のまま）
- テスト 658 件（101 ファイル。624 ＋ 新しい回帰テスト 34）。`package.json` version 0.5.10（`package-lock.json` は変えていない）
- 注記: v0.5.9 の見出しに commit / tag object の SHA を記入した

## v0.5.9 — commit 11c0d51 / tag object 6c27dea — M2-2: independent review R6 — the M2-2-R5-001 work is closed (docs only)

- 独立レビュー m2-2-r6（`docs/reviews/m2-2/independent-review-r6.md`、ChatGPT、範囲 v0.5.7..v0.5.8）: 前回の M2-2-R5-001 は解消。新しい指摘は High 0 / Medium 0 / Low 0。
  対応記録 `docs/reviews/m2-2/response-r6.md`
- 新しい指摘が無いので、前提の実測（再現）は行っていない。High 0・指摘 0 のため、M2-2-R5-001 の作業（v0.5.8、独立レビュー R6）をここで区切る
- 最初の依頼ではパケットが添付されず、レビュー未実施の出力が返ったため、依頼し直した。収録したのは依頼し直した回の出力（response-r6 の補足）
- ROADMAP: M2-2 の節に R6 の結果と v0.5.9 を書いた。バックログは項目も番号も変えていない（先頭は M2-2-R4-001）
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 624 件（100 ファイル）。`package.json` version 0.5.9（`package-lock.json` は変えていない）
- 注記: v0.5.8 の見出しに commit / tag object の SHA を記入した

## v0.5.8 — commit ea3ef71 / tag object a0e7307 — M2-2: tests end what they start on failure paths (M2-2-R5-001)

- **M2-2-R5-001（Medium、独立レビュー m2-2-r5）を修正**（`tests/` だけ。製品のコードは変えていない）: テストが途中で失敗すると、実行中の `executeCommand()`・CLI を
  止める処理に届かない箇所があった。vitest はテストファイルが終わるとワーカーを止めるので runner のタイマーは働かず、子は自分の寿命まで残った（M2-2-FLAKE-001 の
  回帰テストで約 30 秒）。テストのタイムアウトではテストの中の `finally` も当てにならない（ファイルの最後のテストでは実行されず、途中のテストでは次のテストの実行中に
  遅れて実行される）ので、後始末を `afterEach` に置いた
  - `tests/helpers.ts`: `runCleanups`・`stopper`・`waitReady`・`SETTLE_MARGIN_MS`（5 秒）。止めた相手の確定を猶予 ＋ 5 秒まで待ち、超えたらテストを失敗にする。
    止めるのは runner の AbortController か ChildProcess の handle だけで、ファイルから読んだ pid には signal を送らない
  - 直したテスト: `regression-r4-report`（A・B）、`regression-m2-2-flake-001-timeout-after-abort`、`regression-r2-cli-signal`（後始末のためだけの AbortController）、
    `regression-r3-cli`（CLI を SIGTERM で止めて終了を待つ）。準備の待ちの失敗は「precondition: …」の文言にした。r3-cli の `afterEach` が PASS の回にも消えた後の
    pid へ送っていた SIGKILL と、r4 の B の後始末の SIGKILL（確定の後に消えた pid へ届いていた）をやめた
  - r3-cli が失敗すると、孤立した CLI が消された一時ディレクトリを作り直してレポートを書き、`$TMPDIR/aiqh-r3-cli-*` が残っていた（SP1 で発見）。これも直った
  - 新しい単体テスト `tests/regression-m2-2-r5-001-test-cleanup.test.ts`（M2-2-R5-001、5 件）: 変更前の helpers では 5 件とも FAIL
  - 確かめ（写しで準備を遅らせる・テスト側で待つ 9 ケース。本体のテストに仕掛けは入れていない）: 修正前は失敗から約 2〜30 秒、vitest の終了後も最長約 30 秒残って
    いた子・孫・CLI が、修正後はすべてそのテストの `afterEach` の中で消えた。一時ディレクトリの残り 0、消えた pid への signal 0。後始末の待ちが最も長い r4 の B でも
    20.0 秒（上限 25 秒、`hookTimeout` 30 秒）
  - 製品の動きの期待値（assert の値）は変えていない
- docs: ARCHITECTURE の runner の項目の終わりに、テストの後始末の方針を書いた。response-r5 に対応の記録。ROADMAP: バックログ 1 を外し、2〜20 → 1〜19、テストの
  後始末の残り（低）を 20 に足した。ADR-0017・ARCHITECTURE・M2-2 の節の番号の参照を直した（過去の版の項と `docs/reviews/` は当時の番号のまま）
- テスト 624 件（100 ファイル。619 ＋ 新しい単体テスト 5）。`package.json` version 0.5.8（`package-lock.json` は変えていない）
- 注記: v0.5.7 の見出しに commit / tag object の SHA を記入した

## v0.5.7 — commit 16927aa / tag object 142e04a — M2-2: independent review R5 — the flake and M2-2-FLAKE-001 work is closed (docs only)

- 独立レビュー m2-2-r5（`docs/reviews/m2-2/independent-review-r5.md`、ChatGPT、範囲 v0.5.5..v0.5.6）: 前回の指摘で判定の対象は無し（M2-2-R4-001・002 はバックログのまま）。
  新しい指摘は High 0 / Medium 1 / Low 1。対応記録 `docs/reviews/m2-2/response-r5.md`
  - M2-2-R5-001: テストの前提が崩れて失敗したとき、実行中の `executeCommand()` を止める後始末が無い箇所がある（`regression-r4-report.test.ts` のシナリオ A の
    準備の待ち〈失敗の文言も「precondition: …」でない〉、M2-2-FLAKE-001 の回帰テストの前提の assert）
  - M2-2-R5-002: ARCHITECTURE の `stdoutTail` / `stderrTail` の文言「プロセスグループが終わるまでに取得した出力」が、実装の確定の条件（グループの消滅、または
    SIGKILL の送信）より強い
- 区切る前に R5-001 の前提を実測した（再現した。High の基準には当たらない）: 一時 worktree の写しで子の準備を遅らせると、シナリオ A は「precondition: …」でない
  文言で失敗し、どちらのテストも中断に届かない。vitest はテストファイルが終わるとワーカーを止めるので、runner のタイムアウト・猶予も働かず、子は自分の寿命まで
  残った（M2-2-FLAKE-001 の回帰テストで約 30 秒。vitest の終了の後も）。寿命を超えては残らず、全体の実行 2 回でほかの 617 件の結果は変わらなかった。
  `tests/` 全体の同じ種類の箇所も表にした
- ARCHITECTURE の runner の節の 3 か所を実装の確定の条件に合わせた（出力の末尾は stdout / stderr が閉じるまでに取得した出力。runner は `close` の後、グループの
  消滅または SIGKILL の送信で確定し、SIGKILL の後はグループの消滅を待たない）。§10 の表の「消滅確認の後に終了」はバックログ 18 のまま
- v0.5.6 の SP2 で観測した r4 の B の 23 秒の 1 回（393 回中 1 回、失敗ではない）を、response-r5 とバックログ 18（SIGKILL の経路のグループの消滅の確認）に記録した
- ROADMAP: M2-2-R5-001 をバックログの先頭（1）へ。既存の項目は 2〜20 に（v0.5.6 の 1〜19）。ADR-0017・ARCHITECTURE・M2-2 の節の番号の参照を直した
  （過去の版の項と `docs/reviews/` は当時の番号のまま）
- 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、テストの不安定と M2-2-FLAKE-001 の作業（v0.5.6、独立レビュー R5）をここで区切る
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 619 件（99 ファイル）。`package.json` version 0.5.7（`package-lock.json` は変えていない）
- 注記: v0.5.6 の見出しに commit / tag object の SHA を記入した

## v0.5.6 — commit 6def387 / tag object 0efff5c — M2-2: the unit-minpath flake fixed; an interruption cancels the pending timeout (M2-2-FLAKE-001)

- **M2-2-FLAKE-001（runner の不具合）を修正**: 中断されたチェックの `timedOut` は「中断前にタイムアウトへ到達していたか」（ARCHITECTURE、R4-002）だが、runner は
  タイムアウトのタイマーを結果の確定のときにだけ止めていたため、中断の後、後始末の猶予（既定 5 秒）の間にタイムアウトの時刻が来ると true になった（R4-002 を実装した v0.1.3 から）。
  中断のときにタイマーを止める（`src/runner/execute.ts` の `onAbort` に 1 行）。タイムアウトと中断がほぼ同時のときは、runner のイベントループで先に処理した方を先とする
  - 影響の範囲: 中断の後の猶予の間にタイムアウトの時刻が来る場合だけ、その check の `timedOut`（true → false）、errorSummary（「; timeout had already been reached」が
    消える）、`latest.md`（「- Timed out after Ns」の行が出なくなり、Summary の文も同じく変わる）、CLI の SKIP の行の理由の文が変わる。status（SKIPPED）・verdict（ERROR）・
    終了コード（130 / 143）は変わらない
  - 回帰テスト `tests/regression-m2-2-flake-001-timeout-after-abort.test.ts`（M2-2-FLAKE-001）: 修正前に 5 回とも FAIL（`exec.timedOut` が true）、修正後に 5 回とも PASS
- **テストの不安定（v0.5.5 のバックログ 1、unit-minpath）を解消**: 原因は確定（負荷の下で、子が SIGTERM を無視する処理を登録する前に 300ms のタイムアウトの SIGTERM で
  終わり、600ms の中断の前に結果が確定した）。同じ前提（子の準備が短いタイムアウトより前）を持つ 4 ファイル 5 件を、事象の順を観測で決める形に直した: 中断が引き金の
  テストは子の準備完了の印を待ってから中断し、タイムアウトが引き金のテストは子の準備に 3 秒の余裕を置き、前提が崩れたら「precondition: …」の文言で FAIL する（SKIP に
  しない）。`regression-r4-report.test.ts` の B は、子がタイムアウトの SIGTERM を受けた印を見てから中断する。製品の動きの期待値は変えていない（足した assert は A の
  `exec.timedOut` が false、B の status SKIPPED と errorSummary）
  - (a) 子の準備を人為的に遅らせた写し（tmp の中だけ）: v0.5.5 の 5 件は 1200ms の遅れで 5 回とも FAIL、直した 5 件は 0ms・1200ms で 5 回とも PASS（修正の前後とも）、
    3500ms（余裕を超える）ではタイムアウトが引き金の 4 件と回帰テストが前提の文言で FAIL
  - (b) 起動の嵐 16（`node -e 0` を繰り返し起動する子 16 本）の下で、直した 4 ファイルと回帰テストを 1 ファイルずつ 393 回（各 76〜82 回。通常 PATH 35〜40 回、
    最小 PATH 38〜42 回）実行して失敗 0（v0.5.5 のテストは同じ条件で `regression-r4-report.test.ts` が 67 回中 3 回失敗）
- docs: ARCHITECTURE の R4-002 の項に、ほぼ同時のときの決め方、exit と close の間の中断の今の挙動（終わっていた check も SKIPPED、verdict は ERROR）を書き、出力の末尾の
  文言を実装に合わせた（中断時点まで → プロセスグループが終わるまでに取得した出力。後始末の猶予の間の出力を含む）。ROADMAP: バックログ 1 を外し、R4 の 2 件を 1・2 へ、
  調査で見つけた kill の EPERM の経路を 3 へ（4 以降は変わらない）。ADR-0017 と ARCHITECTURE の番号の参照を直した（過去の版の項と `docs/reviews/` は当時の番号のまま）
- テスト 619 件（99 ファイル）。`package.json` version 0.5.6（`package-lock.json` は変えていない）
- 注記: v0.5.5 の見出しに commit / tag object の SHA を記入した

## v0.5.5 — commit ea03fc6 / tag object 85ede6d — M2-2: independent review R4 — the output boundary work is closed (docs only)

- 独立レビュー m2-2-r4（`docs/reviews/m2-2/independent-review-r4.md`、ChatGPT、範囲 v0.5.3..v0.5.4）: 前回の 3 件は R3-001 が解消、R3-002・R3-003 が部分的に解消。
  新しい指摘は High 0 / Medium 2 / Low 0。対応記録 `docs/reviews/m2-2/response-r4.md`
  - M2-2-R4-001: `safeJson()` の写しに関数の値の `toJSON` が残ると、`JSON.stringify()` がそれを呼び、戻り値は表記・mask を通らずに出る
  - M2-2-R4-002: 出力の構造ガードが `process.getBuiltinModule(…)` を検出しない（import なしで `node:console`・`node:vm` を取れる）
- 区切る前に 2 件の前提を実測した（どちらも再現。High の基準には当たらない）: `safeJson()` を呼ぶのは `createOutput().json` だけで、今の各コマンドの `--json` は
  JSON のデータだけ（一時 worktree で検査を足し、vitest と通常の出力の比較でコマンドからの呼び出し 35 回に JSON のデータでない値 0 件）。`src/` は
  `process.getBuiltinModule` と同じ種類の方法を 1 つも使わず、読み込む組み込みモジュールは 6 つのまま
- ADR-0017 の既知の限界に 2 件と、同じ種類で検出しない方法（`process.dlopen`、`process.report.writeReport("stdout")`）を追記した（v0.5.5 で追記）。
  「`node:vm` を検出する」と読める記述を「`node:vm` の import を検出する」に、JSON の決定を「JSON のデータについて」に直した。ARCHITECTURE も同じ
- ROADMAP: 2 件と、v0.5.4 で約束した構造ガードの既知の限界（読み込めるモジュールの一覧による限定）をバックログの 2・3 へ。既存の項目は 4〜19 に
- **リリースの検証で起きた不安定なテスト**: 自己 verify の `unit-minpath` が 7 回中 2 回 FAIL した（どちらも `tests/regression-r4-report.test.ts` の
  「R4-002 interrupted checks keep timedOut / outputTruncated > timedOut stays true when an abort overlaps a timeout」、`exec.interruptedBy` が null）。
  2 回目の失敗の直後の負荷平均は 1 分 71.23・5 分 82.17（8 コア）。推定の原因（確定ではない）は、負荷で子が SIGTERM を無視する処理を登録する前にタイムアウトの
  SIGTERM が届き、600ms の中断の前に実行が終わること。テストはこの版では直さず、ROADMAP のバックログの先頭（1）に記録した（`docs/reviews/m2-2/response-r4.md`）。
  v0.5.5 のタグは、負荷の低い状態でのやり直しの検証が PASS した commit に付けた
- 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、出力の出口の強化（v0.5.2〜v0.5.4、独立レビュー R2〜R4）をここで区切る
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。出力は v0.5.4 と同じ。テスト 618 件（98 ファイル）。`package.json` version 0.5.5
- 注記: v0.5.4 の見出しに commit / tag object の SHA を記入した

## v0.5.4 — commit f33c75f / tag object 29ee54e — M2-2: independent review R3 fixed — one written line is one line; JSON keys through the boundary; only two writers reach the terminal

- 独立レビュー m2-2-r3（範囲 v0.5.1..v0.5.2）の Medium 3 件（v0.5.3 でバックログへ）を修正。SP1 で出口に渡す文字列を AST で全件洗い出し（105 か所と commander の 3 経路）、
  人間の承認の後に実装した。新しい ADR-0017（ADR-0016 の決定 3 と既知の限界を置換）
- M2-2-R3-002: JSON（`--json`）のオブジェクトのキーも値と同じく、禁止文字を表記にしてから秘密の形を mask する。変換の後に 1 つのオブジェクトの 2 つのキーが同じ文字列に
  なったら、合わせずに何も出さない（fail closed、最上位の「unexpected error」で exit 2）。`__proto__` というキーも消えない
- M2-2-R3-001: **1 回の書き出し = 1 行**（1 行の中の LF・TAB も `\u{A}` / `\u{9}` の表記）。複数行はコマンド自身の書式だけを block で書く: init の設定案
  （コメントに入る値は作る所で表記にする。`--write` で書くファイルも同じ）、設定の検証エラー（見出しの 1 行と zod の詳細の block。`ConfigError` に `summary` / `details`）、
  commander の help と `--version`、使い方エラーの提案の行（commander が引用する引数の LF は、引数の一部だけが引用される場合も含めて表記）
- M2-2-R3-003: 端末に書くのは `src/output.ts` の `emitOut` / `emitErr` だけ（引数は `safeText` / `safeJson` だけが作る型 `Safe`）。構造ガード
  `tests/structure/output-guard.ts` は、端末に 1 つのプロパティで届くオブジェクト（`process`・`globalThis`・`node:process`）の動的・反射的な扱い、型検査で中身が
  見えないコード（`Function`・`eval`・`require`・`createRequire`・計算された `import()`・`node:vm`）、fd への書き込みと `/dev/` のパス、`stdio` が pipe / ignore でない
  子プロセス、`safeText` / `safeJson` の外で作る `Safe` を違反にする。SP1 の 22 形、出口の中の 3 形、同じ種類で足した 12 形を回帰テストで固定した
- **出力が変わる条件**:
  - 利用者由来の値に LF・TAB を含むとき（パス、ファイル名、`--cwd`、設定ファイルのパス、Node・git のエラー文、verify の check の出力の末尾の行、commander が
    引用する引数、設定の project 名と check のコマンド）: その文字が `\u{A}` / `\u{9}` の表記になり、1 行のままになる。review-packet は従来どおり
  - 利用者由来の値に禁止文字を含むとき: 従来どおり表記（v0.5.2 から）。加えて、init の設定案のコメントに入る値（アダプタの理由・注記・有効化の案内）の
    LF・TAB・禁止文字は、端末と `--write` で書くファイルの両方で表記になる（今のアダプタの文は aiqh 自身の文で、該当しない）
  - JSON のキーに禁止文字・秘密の形を含むとき: 表記・mask になる。変換の後にキーが衝突するとき: 何も出さず exit 2（今の各コマンドの `--json` のキーは固定の識別子で、
    どちらも起きない）
  - 設定の検証エラーは、見出しの行と zod の詳細を別の書き出しで出す（端末に出るバイトは同じ）
- 禁止文字・秘密の形・利用者由来の LF・TAB の無い出力は v0.5.3 とバイト単位で一致した（同じ fixture で 40 通り: v0.5.2 の 25 通り〈verify の check の出力から TAB を除いた〉に、
  設定の検証エラー 5、引数なしの `aiqh`、提案つきの未知のコマンド・オプション 4、scripts を持つリポジトリなどでの init 3、init の `--write` 2 を足した。
  `--write` が書く `aiqh.config.jsonc`・`.gitignore`・`package.json` も一致）。check の出力に TAB がある verify の 2 通りは、TAB の 2 行だけが表記に変わる
- 既存テストの期待値の変更は 1 件（SP1 の予測どおり: M2-2-R2-001 の対照が固定していた、既定で LF・TAB を残す動き）。回帰テスト 3 ファイル 25 件
  （`regression-m2-2-r3-001-line-breaks`・`regression-m2-2-r3-002-json-keys`・`regression-m2-2-r3-003-output-guard`）。テスト 618 件（98 ファイル）。
  `package.json` version 0.5.4
- 注記: v0.5.3 の見出しに commit / tag object の SHA を記入した

## v0.5.3 — commit e92e999 / tag object dfb1960 — M2-2: independent review R3 — the carry-over work is closed (docs only)

- 独立レビュー m2-2-r3（`docs/reviews/m2-2/independent-review-r3.md`、範囲 v0.5.1..v0.5.2）: 前回の M2-2-R2-001 は解消、新しい指摘は High 0 / Medium 3 / Low 0。
  対応記録 `docs/reviews/m2-2/response-r3.md`
- 3 件の前提を実コードで確かめた（どれも再現。High の基準には当たらない）: R3-001 は利用者由来のパス・ファイル名の LF・TAB で端末の見た目を崩せるが、
  終了コード・最後の判定の行・`--json` の結果は正しい。R3-002 は `safeJson()` がオブジェクトのキーを表記にしないが、各コマンドの `--json` に利用者由来のキーは無い。
  R3-003 は構造ガードが動的な `process[key]` と `src/output.ts` の中の書き出しを検出しないが、今の `src/` に該当は無い
- 3 件は ROADMAP のバックログへ（v0.5.3 では直さない。重大度はレビュアーの判定のまま）。R3-002・R3-001 を先頭、R3-003 を構造ガードの M2-2-R1-003 の直後、
  verify の check への `NO_COLOR`（v0.5.2 の人間の判断）を「ファイルへの出力の禁止文字」の直後に置いた
- 出力の出口の既知の限界 3 点を ADR-0016 と ARCHITECTURE に明記した
- 完了基準「High が無ければ区切り、Medium 以下は次へ」により、M2-1 独立レビュー R3 の持ち越し 5 件から始まった作業（v0.5.0〜v0.5.2、独立レビュー R1〜R3）をここで区切る
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 593 件（95 ファイル）。`package.json` version 0.5.3
- 注記: v0.5.2 の見出しに commit / tag object の SHA を記入した

## v0.5.2 — commit 28999de / tag object 11faa66 — M2-2: independent review R2 — one safe output boundary for every command

- 独立レビュー m2-2-r2（`docs/reviews/m2-2/independent-review-r2.md`、範囲 v0.5.0..v0.5.1）: 前回の 2 件（R1-007、R1-001）は解消、新しい指摘は High 1 / Medium 0 / Low 0。
  対応記録 `docs/reviews/m2-2/response-r2.md`
- M2-2-R2-001（High）: security-scan の出力は masker だけを通していたため、作業フォルダ名などのパスの禁止文字（U+202E など）が生のまま端末に出た。
  レビュアーの経路（読めない既定の設定ファイルのエラー）は v0.5.1 から、走査の出力（作業フォルダのパス、ファイル名）の経路は v0.4.4 でもあった（3 つの版で再現）。
  同じことは verify・init・commander の使い方エラー・`--max-*-bytes` の解析でも起きた
- 修正: すべてのコマンドの標準出力・標準エラーを 1 つの出口 `src/output.ts` に通す（禁止文字を `\u{HEX}` の表記 → masker。JSON は文字列を表記にしてから `maskDeep`）。
  LF と TAB は残す（review-packet は従来どおり表記にする）。commander は `configureOutput` で同じ出口に通す。review-packet の `safeText()`・`escapeDeep()` は共通の出口に置き換えた。
  型情報付きの構造テスト `tests/structure/output-guard.ts` が、`src/output.ts` 以外からの `console`・`process.stdout` / `process.stderr`・fd 1 / 2 への書き込みを禁止する。
  新しい ADR-0016（ADR-0012 の追記の「text 出力側でのエスケープは行わない」を置換）
- **出力の変化**（禁止文字が `\u{HEX}` の表記で出るようになるコマンドと経路）:
  - security-scan: 走査の見出しの作業フォルダのパス、finding のファイル名、設定・走査のエラー（text・`--json`）
  - verify: 進捗の行（project 名、設定のパス、git のブランチ名、check 名）、失敗した check の出力の末尾（ESC による色付け・CR を含む）、エラー
  - init: root のパス、検出した名前、設定案、エラー（text・`--json`）
  - commander の使い方エラー（未知のオプション名・コマンド名）、`--max-*-bytes` の正でない整数のエラー、`src/cli.ts` の予期しない例外
  - review-packet の出力は変わらない
- 禁止文字も秘密の形も無い出力は v0.5.1 とバイト単位で一致した（同じ fixture で 25 通り: help 6、`--version`、使い方エラー 4、security-scan 6、init 2、review-packet 3、verify 3）
- ファイルへの出力（verify のレポート、init が書く設定）の禁止文字は、ROADMAP のバックログ 7 へ
- 既存テストの期待値の変更は 0 件。回帰テスト 1 ファイル 21 件（`regression-m2-2-r2-001-output-boundary`。構造テストを含む）。テスト 593 件（95 ファイル）。
  `package.json` version 0.5.2
- 注記: v0.5.1 の見出しに commit / tag object の SHA を記入した

## v0.5.1 — commit c15ae92 / tag object 5b018b6 — M2-2: independent review R1 — unreadable is not absent; a rejected range keeps the range-independent checks

- 独立レビュー m2-2-r1（`docs/reviews/m2-2/independent-review-r1.md`、範囲 v0.4.4..v0.5.0）: 前回の 5 件は解消 2 / 部分的に解消 3、新しい指摘は High 0 / Medium 6 / Low 1。
  7 件を修正の前に実コードで確かめ、6 件を再現した（R1-004 は再現せず: 規則 `widened-renderer` が検出する）。対応記録 `docs/reviews/m2-2/response-r1.md`
- M2-2-R1-007（レビュアーは Medium。人間の判断で High として扱う）: `latest.json` を `existsSync()` で探していたため、親を辿れない・親がファイル・symlink のループの
  `latest.json` を「無い」とし、exit 0 でパケットを書いて「does not exist」と記述していた。直接読み、ENOENT だけを「無い」、それ以外は検査不能（exit 2）にした
- 既定の設定ファイル（R1-007 の確認で見つけた同じ種類の箇所）: review-packet と security-scan がそれぞれ `existsSync()` で既定の設定ファイルを探していたため、
  辿れない・ループの設定ファイルを「無い」として既定値を使っていた（review-packet は exit 0 でパケットを書き、security-scan は設定で足した `envProbePaths` が効かず
  exit 1 のところ exit 0）。1 つの関数 `loadSecurityConfig`（`src/config/load.ts`）にまとめ、ENOENT だけ既定値、それ以外は設定の誤り（exit 2）にした。`--config` の扱いは変えていない
- M2-2-R1-001（Medium）: `--range` に finding があるとき、範囲に依存しない検査（作業ツリーの確認、root の取得）まで飛ばしていたため、検査不能が exit 1 の完全な結果に
  隠れていた。範囲の値とその結果を使う処理だけを飛ばし、作業ツリー・root・依頼文とレビュー・`latest.json` の読取と復号と JSON でない場合の全文検査・aiqh の版と
  `git --version`・`--label` があるときの既定の出力名は検査する（ADR-0015 を改訂）。塞がれた値は今までどおり git に渡らない
- **終了コードが変わる組み合わせ**: 読めない `latest.json`（ENOENT 以外）が 0 → 2、読めない既定の設定ファイル（ENOENT 以外。review-packet・security-scan）が 0 → 2、
  `--range` の finding ＋ 範囲に依存しない検査不能（作業ツリー外、無い `--cwd`、読めない `latest.json`）が 1 → 2
- パケットの組み立ては変えていない（版の表記が同じ状態で、v0.5.0 と同じ範囲・入力〈v0.4.4..v0.5.0、`latest.json` あり・なし〉から作ったパケットと ZIP の SHA-256 が一致）
- 保証の記述の訂正（コードは変えていない）: `unit-minpath` は PATH の名前解決で起動する、宣言していないコマンドを検出する（絶対パスでの起動、引き継ぐ環境変数、
  単独で実行してシグナルを受けたときの子孫は対象外。R1-005・006。README・ARCHITECTURE）、オプション一覧の比較は short 別名を見ない（R1-002）、外部コマンドのガードは
  複数のツールの probe を混ぜた変数を誤って許可する（R1-003）、brand のガードの関数型へのアサーション（R1-004）（ADR-0014 §14）。既定の設定ファイルの扱い（CONFIG_SPEC §3b）
- 残り（R1-002〜006、同じ種類の残りの箇所）は ROADMAP のバックログの先頭へ（既存の項目は順序を変えず番号だけ振り直した）
- 既存テストの期待値の変更は 0 件。回帰テスト 3 ファイル 36 件（`regression-m2-2-r1-007-unreadable-parent`、`regression-m2-2-r1-config-read`、
  `regression-m2-2-r1-001-rejected-range-preflight`。権限を使う 7 件は root では skip）。テスト 572 件（94 ファイル）。`package.json` version 0.5.1
- 注記: v0.5.0 の見出しに commit / tag object の SHA を記入した

## v0.5.0 — commit d9793cd / tag object 7557c1e — M2-2: M2-1 independent review R3 Medium findings fixed

- M2-2 の先頭: M2-1 独立レビュー R3 の Medium 5 件（R3-002〜006）を修正。SP1 で 5 件とも実コードで再現してから設計し（人間の承認）、各件の回帰テストの
  修正前 FAIL を記録した。対応記録 `docs/reviews/m2-1/response-r3.md`（「M2-2 での修正」）
- M2-1-R3-002: review-packet の終了コードを「検査不能（exit 2。それまでの finding を不完全な一覧として出す）→ 検出（exit 1）→ 出力しない判断（exit 2。finding が
  無いときだけ）」の順に決める（新しい ADR-0015。ADR-0014 §11 を置換）。finding があっても検査を最後まで続け、finding のある値（文字列でない `Rejected`）に
  依存する処理だけを飛ばす。`--cwd` の禁止文字と `--label` の形の誤りは検査を止めない。**終了コードが変わる組み合わせ**: オプションの値・パスの finding と
  検査不能（読めない `--request` / `--review`、作業ツリー外、解決できない ref、欠けた git object、読めない `latest.json`）が 1 → 2、中身・パスの finding と
  `--cwd` の禁止文字・`--label` の形の誤りが 2 → 1。`--json` は、検査不能のとき `"result": "error"` で `findings` が空でないことがある
- M2-1-R3-003: JSON として壊れた `latest.json`、または `<to>` の結果として描画するのに形が合わない `latest.json` は、全文を生文字と秘密の形で検査してから
  出力しない判断にする（形は zod で確認）。読めない `latest.json` は検査不能（`cannot read …`。以前は `write failed` と表示）。`null` などの `latest.json` での
  内部エラー（`--json` で JSON が出ない、`VERIFY ERROR` と表示）を解消
- M2-1-R3-004: `Checked` / `Md` の偽造を、型情報付きの構造テスト（`tests/structure/brand-guard.ts`）と、実行時の登録簿（描画関数・`md`・組み立て・ZIP の
  エントリ名が確かめる）で防ぐ。brand を作るのは `issue` / `REJECTED` / `issueMd` だけ
- M2-1-R3-005: CLI の組み立てを副作用のない `src/cli-program.ts` に分け、`OPTION_INVENTORY` を review-packet の `Command` オブジェクト（非表示・short-only・
  位置引数を含む）と比べる。help と使い方エラーの出力は変わらない（13 通りでバイト一致）
- M2-1-R3-006: テストの外部コマンドを型情報付き AST（`tests/structure/process-guard.ts`）で検査し、PATH を node と git だけにした全テストを自己 verify の
  新しいチェック `unit-minpath`（`npm run test:minpath`）で実行する。**自己 verify は 8 チェック**
- パケットの組み立ては変えていない（版の表記が同じ状態で、v0.4.4 と同じ範囲・入力から作ったパケットと ZIP の SHA-256 が一致）
- 既存テストの期待値の変更は 1 件（`regression-m2-1-r2-007` の「ファイル名の finding + 読めない `--request`」が 1 → 2）。置き換え: `regression-m2-1-r2-checked-inventory` の
  2 件、`regression-m2-1-r2-004-external-commands`（ファイルごと）
- テスト 536 件（91 ファイル）。`package.json` version 0.5.0
- 注記: v0.4.4 の見出しに commit / tag object の SHA を記入し、`docs/reports/M2-1_COMPLETION.md` の空欄も埋めた

## v0.4.4 — commit d21c793 / tag object 07b4cca — M2-1 complete — completion record, R3-002〜006 carried over to M2-2

- 独立レビュー R4（`docs/reviews/m2-1/independent-review-r4.md`）: M2-1-R3-001 は解消、新しい指摘は High 0 / Medium 0 / Low 0。対応記録 `docs/reviews/m2-1/response-r4.md`
- 事前の基準（R<N> で High が無ければ完了）により **M2-1 完了**。完了ベースライン v0.4.3（commit 6cf3199 / tag object 8ee5f54）、完了記録は本タグ
- 完了報告 `docs/reports/M2-1_COMPLETION.md`、ROADMAP（M2-1 完了、次は M2-2。先頭は R3-002〜006）、README
- コード変更なし（`src/` `tests/` `scripts/` は v0.4.3 と同一）。テスト 466 件（87 ファイル）、自己 verify 7 チェック PASS。`package.json` version 0.4.4

## v0.4.3 — commit 6cf3199 / tag object 8ee5f54 — M2-1 independent review R3: High fixed, Medium carried over to M2-2

- 独立レビュー R3（`docs/reviews/m2-1/independent-review-r3.md`。R2 の 8 件は解消 6 / 部分的に解消 2〈R2-002、R2-007〉、新規 High 1 / Medium 5）。対応記録 `docs/reviews/m2-1/response-r3.md`
- M2-1-R3-001（High）: パケットと ZIP の同じ実体の判定を、ファイルシステムの同一性で行う。準備段階で親ディレクトリを作って一時ファイルを書いた後、確定の直前に
  両方の親を `stat` し、`dev`+`ino` と ASCII の basename（大文字小文字を無視）で比べる。親が準備のときから変わっていれば、または同じ実体なら exit 2（既存ファイルは不変）。
  v0.4.2 までの文字列の比較（realpath + NFC + 小文字化）は、APFS が同じ名前として扱う U+00DF / `ss`、U+03C2 / U+03C3、U+00B5 / U+03BC などの親ディレクトリ名で一致せず、
  同時の変更なしに既存ファイルが失われていた（exit 0）。文字列の比較は早い段階の拒否として残した。一度は Medium に下げる判断をしたが、この経路が見つかり High に戻した
- 信頼境界を README と ADR-0014 に明記: aiqh の実行中に、出力先（`-o`・`--zip-output`）とその親ディレクトリを他のプロセスや利用者が同時に変更しないこと
- ADR-0014 の保証の記述を実際に合わせて訂正（`Checked` は型と文字列検査による保証で迂回できる〈R3-004〉、オプション一覧のテストは help の長いオプションのみ〈R3-005〉、
  finding と検査できない状態の終了コードの現状〈R3-002 / R3-003〉）
- R3-002〜006（Medium）は M2-2 の先頭へ持ち越し（ROADMAP）
- テスト 466 件（87 ファイル）。`package.json` version 0.4.3

## v0.4.2 — commit 7f981b2 / tag object 3933494 — M2-1 independent review R2 applied

- 注記（v0.4.3）: この版で対応した M2-1-R2-002 は、独立レビュー R3 で「部分的に解消」と判定された（残りは R3-001 として v0.4.3 で修正）
- 注記（v0.4.3）: この版で対応した M2-1-R2-007 は、独立レビュー R3 で「部分的に解消」と判定された（残りは R3-002・R3-003 として M2-2 へ持ち越し）

- 独立レビュー R2（`docs/reviews/m2-1/independent-review-r2.md`。R1 の 5 件は解消 3 / 部分的に解消 2〈R1-003、R1-004〉、新規 High 4 / Medium 4）の 8 件すべてに対応。
  対応記録 `docs/reviews/m2-1/response-r2.md`。8 件とも v0.4.1 の実コードで再現してから、回帰テストの修正前 FAIL を記録して直した。v0.4.1 の項の
  「5 件すべてに対応」は、R2 の判定では R1-003 と R1-004 が部分的な解消だった（残りの境界は R2-002・R2-003・R2-005・R2-006 として v0.4.2 で直した）
- M2-1-R2-001（High）: `-o` のファイル名（ZIP のエントリ名）を、git を動かす前に生文字と秘密の形で検査する（出所 `output file name`、exit 1）。既定の名前も書き込み前に検査
- M2-1-R2-002（High）: パケットと ZIP の書き込み先を realpath(親) + basename で、NFC・大文字小文字を区別せずに比べ、同じ実体なら exit 2（親のシンボリックリンク、大文字小文字だけの違い）
- M2-1-R2-003（High）: 確定点（両方を置き終えた時点）を定義。確定前は戻し処理の各操作の失敗を集めて、残ったファイルをすべて表示（全部成功したときだけ「restored」、exit 2）。
  確定後の退避ファイルの削除の失敗は exit 0 で警告と場所を出し、最終行 `REVIEW PACKET: written (backup files retained)`、`--json` に `backupsRetained`
- M2-1-R2-004（High）: テストの期待値の SHA-256 を `node:crypto` で計算（`shasum` をやめる）。同じ種類の依存（`rm`、runner 経由の `wc`）も直し、
  テストが git 以外の外部コマンドを skip 条件なしに使わないことを静的・動的に確かめるテストを追加
- M2-1-R2-005（Medium）: インラインコードの中のバッククォートを `\u{60}` に（中身に U+0060 を残さない）
- M2-1-R2-006（Medium）: 描画されるオプションの値（`--range`、`--label`、`--exclude`、`--doc`、依頼文・レビューのファイル名、`-o` のファイル名）を git の前に
  生文字と秘密の形で検査（出所 `range`・`doc path N` など、exit 1）
- M2-1-R2-007（Medium）: すべてのパス（変更一覧と各 commit のファイル一覧）の検査を最初の独立した段階にし、finding があれば中身・大きさに進まず exit 1。
  finding とエラーが同時に起きうる箇所は「検出（exit 1）が先」に統一（上限超過、`--doc` の参照、不正な `latest.json`、`--cwd` のパス）
- M2-1-R2-008（Medium）: README の「現在の状態」を更新。`package.json` の version・CHANGELOG の最新の見出し・README の版が一致するテストを追加。
  ROADMAP のバックログにシンボリックリンク（mode 120000）を kind `symlink` として表示する件を追加
- 構造（同じ種類の漏れを防ぐ）: 検査済みの文字列の型 `Checked`（`src/review/checked.ts`、作れるのは `checkValue` だけ）を描画関数と ZIP のエントリ名の引数にし、
  本文は `md` タグ付きテンプレート（描画関数を通した断片と数値だけを埋め込める）で組み立てる。review-packet のオプションの一覧 `OPTION_INVENTORY` から描画する値を検査し、
  一覧と cli.ts のオプションが一致することをテストで確かめる。型を入れた時点で、別の commit の `latest.json` の `git.commit` / `git.dirty` がそのまま
  埋め込まれていた漏れ（LF と `# …` で見出しが増える、数値の commit で `unexpected error`）が見つかり、直した
- ADR-0014 を更新（検査の段階と優先順位、確定点と戻し処理、同じ実体の判定、ZIP のエントリ名、`\u{60}`、検査済みの型と入口の一覧）。ARCHITECTURE を更新
- テスト 455 件（86 ファイル）。`package.json` version 0.4.2

## v0.4.1 — commit c8a185a / tag object 85555ef — M2-1 independent review R1 applied

- 注記（v0.4.3）: この版で対応した M2-1-R1-003 は、独立レビュー R2 で「部分的に解消」と判定された（残りは R2-002・R2-003 として v0.4.2 で修正）
- 注記（v0.4.3）: この版で対応した M2-1-R1-004 は、独立レビュー R2 で「部分的に解消」と判定された（残りは R2-005・R2-006 として v0.4.2 で修正）

- 独立レビュー R1（`docs/reviews/m2-1/independent-review-r1.md`、High 3 / Medium 2）の 5 件すべてに対応。対応記録 `docs/reviews/m2-1/response-r1.md`。
  5 件とも v0.4.0 の実コードで再現してから、回帰テストの修正前 FAIL を記録して直した
- M2-1-R1-001（High）: git の `-z` のパスを Buffer のまま区切り、厳格に復号する。不正な UTF-8 のパスは `invalid-utf8`、LF・TAB 以外の禁止文字を含むパスは `raw-char`（exit 1、
  `--exclude` した変更も対象）。テキストの変更ファイルの差分が空なら exit 2。git に `core.precomposeunicode=false` を指定（macOS の既定で NFD のパスの差分が空になっていた）
- M2-1-R1-002（High）: `--cwd`・`--output`・`--zip-output` を解決した完全パスに禁止文字があれば exit 2（オプション名とコードポイントのみ表示）。
  review-packet の出力（標準出力・標準エラー・`--json`）はすべて安全表示 `escapeRawChars` を通してから masker
- M2-1-R1-003（High）: パケットと ZIP の 2 段階の書き込み（準備で両方の一時ファイル → 確定で既存を退避 → 置き換え → 失敗時は退避から戻す。戻せなければ退避の場所を表示して残す）
- M2-1-R1-004（Medium）: fence の外のメタデータを文脈ごとに描画（インラインコードは LF・TAB・バックスラッシュ・バッククォートを置き換えて 1 個のバッククォートで囲む、
  見出しはインラインコードのみ、表のセルは `|` もエスケープ）。描画前の値を検査（verify の値、`--exclude`、依頼文・レビューのファイル名）
- M2-1-R1-005（Medium）: submodule は表示する側のモードで判定（submodule → 通常ファイルの type change は通常ファイルとして全文・差分を載せる）。status T の行に「(type change)」
- ZIP の他ツールとの互換性テスト（`unzip`、Python の `zipfile`）を追加。ADR-0014 を更新（パスの検査、安全表示、2 段階の書き込みと戻し、描画の規則、submodule、相対パスの基準）
- テスト 415 件（77 ファイル）。`package.json` version 0.4.1

## v0.4.0 — commit 4e196a3 / tag object 3b7ac13 — M2-1 — aiqh review-packet

- 新コマンド `aiqh review-packet --range <from>..<to>`（ADR-0014）: 独立レビュー用の Markdown パケットを機械的に得た事実だけで作る。人間の依頼文・前回レビュー（任意）、
  commit メッセージ（Co-Authored-By / Claude-Session の trailer を除去）、変更ファイル一覧、ファイルごとの差分、`<to>` 時点の変更ファイルの全文、`--doc` の文書、
  `<to>` の verify 結果（`latest.json` が `<to>` かつ clean のときのみ）。実装者の自己評価・手書きの節は載せない。`--zip` でパケットだけを含む無圧縮 ZIP
- fail closed: 不正な UTF-8・生文字（C0〈TAB・LF 以外、CR を含む〉・DEL・C1・U+2028 / U+2029・双方向制御文字・U+FEFF）・秘密の形を、入力ごとと組み立て後の
  2 段で検査し、検出があれば何も書かない（exit 1）。`security.allow` は出所のパスと行に適用。差分の finding は差分の行とファイルの行を両方表示（`diff a.ts:7 (a.ts:1)`、
  削除行は `(a.ts@from:5)`）。使い方・git・範囲・上限・書込のエラーは exit 2（review-packet の commander の使い方エラーも 2）
- 範囲は最初に完全 SHA に解決し、`<from>` が `<to>` の祖先でなければ exit 2。git は引数配列で呼び、パスは `-z`、内容は blob から。lock ファイル 12 種は既定で全文・差分なし、
  除外・lock・バイナリは blob の SHA-256 を記録。同じ入力・同じ aiqh と git の版ならパケットと ZIP はバイト単位で一致（TZ / LANG に依存しない）
- 新規モジュール: `src/security/raw-chars.ts`（禁止集合と厳格な UTF-8。追跡中の Markdown の検査テストもこれを使う）、`src/review/zip.ts`（`zlib.crc32`、固定 DOS 日時）、
  `src/review/packet.ts`、`src/commands/review-packet.ts`。`src/security/scan.ts` から `findAllowRule` を切り出し（挙動同じ）。新規依存なし
- `--cwd` を付けたとき既定の設定は `--cwd` 先の `aiqh.config.jsonc`（プロセスのカレントの設定は使わない。ガードテスト）
- docs: ADR-0014、ARCHITECTURE、CONFIG_SPEC、README、ROADMAP（review-packet の記述と完了条件を改訂、バックログに review-packet テストの分割・並列化と
  他コマンドの使い方エラーの exit 2 化を追加）。`docs/adr/README.md` に 0012・0013 の行を補完
- テスト 389 件（71 ファイル）。`package.json` version 0.4.0

## v0.3.5 — commit cae4b7a / tag object 36922ad — M2-1 preparation — flaky r3-cli test fixed

- テストのみの修正（`src/` の変更なし）。v0.3.4 の worktree 検証で 1 回だけ FAIL した `tests/regression-r3-cli.test.ts` の「check 1's descendants are gone」の原因は、
  pid ファイルを作成と書き込みの間に読む競合（`Number("") = 0` → `process.kill(0, 0)` が自分のプロセスグループに成功 → alive と判定）。調査記録 `docs/reports/M2-1_FLAKY_R3_CLI.md`
- `tests/helpers.ts` に `parsePid` / `waitForPid` / `assertSignalablePid`。pid は中身が正の安全な整数になるまで待って読み、`process.kill` に 0 以下・NaN を渡さない。
  同じ読み方の 4 箇所（execute / regression-r1-runner / regression-r2-runner / regression-r2-cli-signal）も置き換え
- 回帰ケース: check 1 が pid ファイルを空で作り 400ms 後に書く（修正前は pid 0 で FAIL）。判定の失敗メッセージに `pid=<値>` を出す
- ROADMAP: バックログの順序を変更（review-packet → M2-0-R4-001 → scheme 64 文字超の既知の制限）、SIGKILL 経路の消滅確認をバックログに追加。README の次段階の記述を更新
- テスト 339 件（338 + 1）。`package.json` version 0.3.5

## v0.3.4 — commit 8aa3042 / tag object e5a343d — M2-0 complete — completion record, R4 carried over to M2-1+

- コード変更なし。M2-0 の完了ベースラインは v0.3.3（commit cb632cd）
- 独立レビュー R4（`docs/reviews/m2-0/independent-review-r4.md`、High 0 / Medium 1）を記録（`docs/reviews/m2-0/response-r4.md`）。事前の基準「R4 で High が無ければ M2-0 完了」により完了
- M2-0-R4-001（窓の境界で左右の文脈が失われる誤検出）は VALID。修正せず M2-1 以降のバックログの先頭に設計課題「窓走査は正規表現の境界の文脈を保つ」として持ち越し。
  回帰テストは追加していない（修正時に修正前 FAIL とともに追加する）
- 完了報告 `docs/reports/M2-0_COMPLETION.md`、ROADMAP（M2-0 完了、M2-1 以降のバックログ）、README。テスト 338 件、自己 verify 7 チェック PASS。`package.json` version 0.3.4

## v0.3.3 — commit cb632cd / tag object 984bfcb — M2-0 independent review R3 applied

- 独立レビュー R3（`docs/reviews/m2-0/independent-review-r3.md`、High 1 / Medium 1 / Low 1）の 3 件をすべて反映（`docs/reviews/m2-0/response-r3.md`）
- M2-0-R3-001（High）: private-key のアンカーを固定文字列 `-----BEGIN ` に（本体の真の接頭辞）。長い BEGIN ラベルが窓境界をまたぐと 0 件になる見逃しを修正。
  scanner の本体を「アンカー + 残り」で組み立てる構造テスト（全パターン、例外なし）、上限から導いた長さの性質テスト、凍結した v0.3.2 の参照との正規表現の差分テストを追加
- M2-0-R3-002（Medium）: masker の url-credential を scheme 無制限に戻した（v0.3.1 と同じ範囲を redact）。scanner は `scanPattern` で scheme 64 文字まで。
  **既知の制限: scheme が 64 文字を超える URL 認証情報は scanner では検出しない**（masker は redact する）。v0.3.2 の masker は scheme 65 文字以上を redact しなかった
- M2-0-R3-003（Low）: response-r2 の生の U+2028 / U+2029 をエスケープ表記に訂正。追跡中の Markdown に生の区切り文字・C1 制御文字が無いことをテストで確認
- テストを追加 → 338 件、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.3.3

## v0.3.2 — commit cfadf18 / tag object c9be6e1 — M2-0 independent review R2 applied

- 独立レビュー R2（`docs/reviews/m2-0/independent-review-r2.md`、High 1 / Low 2）の 3 件をすべて反映（`docs/reviews/m2-0/response-r2.md`）
- M2-0-R2-001（High）: 窓走査の完全性不変条件（ADR-0013）。アンカーを有界な接頭辞に（url-credential は `scheme://`、key-value はキー名のみ、private-key に BEGIN マーカー）、
  `MIN_LINE_OVERLAP_BYTES` = 256、最も早い未解決アンカーからの持ち越し、`partial` による解決。既定設定で見逃していた URL 認証情報を検出
- M2-0-R2-002: `allow[].reason` / `path` に C0 / DEL / C1 / U+2028 / U+2029 を禁止（JSON Schema 更新）
- M2-0-R2-003: response-r1 の回帰テスト件数を訂正（修正前 13、最終 14）
- テスト: ソース上の `it(` 18 件（`grep -cE '^\s*it(\.skipIf\([^)]*\))?\(' tests/regression-m2-0r2-*.test.ts`）、vitest の実行数 25 件（固定アンカーのループが 1 つの `it(` から 8 件を生成）を追加 → 294 + 25 = 319 件、10 回連続 PASS。
  自己 verify 7 チェック PASS。`package.json` version 0.3.2

## v0.3.1 — commit e25f59f / tag object c2c6985 — M2-0 independent review R1 applied

- 独立レビュー R1（`docs/reviews/m2-0/independent-review-r1.md`、High 1 / Medium 2）の 3 件をすべて反映（`docs/reviews/m2-0/response-r1.md`）
- M2-0-R1-001（High）: 窓設定の相互制約 `0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes` を `resolveSecurity()`（ConfigError）と `LineAssembler` の
  コンストラクタ（ScanError）で検証し、長行ループに進捗不変条件（ScanError）を追加。無効な組み合わせで走査が終わらなくなる問題の修正
- M2-0-R1-002: `security-scan` の text / JSON 出力を `maskSecrets` / `maskDeep` に通す。`allow[].reason` / `path` の改行を禁止（JSON Schema 更新）
- M2-0-R1-003: `--write-gitignore` を未追跡 `.gitignore` でも冪等に（追記せず `git add .gitignore` を案内。追跡済みの否定修復は維持）
- テスト 294 件（回帰 14 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.3.1

## v0.3.0 — commit 8e81d15 / tag object 3e54718 — M2-0 scanner maintenance

- M1 独立レビュー R3 の持ち越し 5 件をすべて修正: M1-R3-001（候補プレフィックスの持ち越し、`oversized-candidate` finding）、002（`--write-gitignore` が否定ルールを修復）、
  003（`artifacts/` 提案は実生成物 4 パスで判定）、004（追跡済み `.gitignore` だけを保護と数える）、005（PEM ブロック finding の重複統合）
- key-value 分類を走査対象に（`looksLikeSecretValue` で値が秘密らしいときだけ finding。masker は不変）
- `security` セクション: `allow`（path / category / line / 必須 reason / expires。抑制は必ず出力に残す、衛生 finding は抑制不可）、`envProbePaths`、`exampleEnvSuffixes`、
  `maxLineBytes` / `lineOverlapBytes` / `maxCarryBytes`。`aiqh security-scan --config <path>`。JSON Schema 更新。ADR-0012、ADR-0010 改訂
- テスト 280 件（回帰 28 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS（key-value 走査込みで検出 0 件）。`package.json` version 0.3.0

## v0.2.3 — commit 2da4c76 / tag object 474fc27 — M1 complete — completion record, R3 carried over to M2-0

- コード変更なし。独立レビュー R3（`docs/reviews/m1/independent-review-r3.md`、High 0 / Medium 4 / Low 1）を受領し、5 件すべてを VALID と判定したうえで
  **M2-0「スキャナ保守」へ持ち越し**（`docs/reviews/m1/response-r3.md`）。事前の基準「R3 で High が無ければ M1 完了」により **M1 の完了ベースラインは v0.2.2**
- `docs/reports/M1_COMPLETION.md` を新設、ROADMAP に M1 完了と M2-0 を記載、README を更新。`package.json` version 0.2.3。テスト 252 件・自己 verify 7 チェック PASS は v0.2.2 と同じ

## v0.2.2 — commit f958ac7 / tag object 9506eed — M1 independent review R2 applied

- 独立レビュー R2（`docs/reviews/m1/independent-review-r2.md`、High 1 / Medium 4）の 5 件をすべて反映（`docs/reviews/m1/response-r2.md`）。R1-005 / R1-009 の PARTIAL を解消
- M1-R2-001: 未追跡で ignore されていない `.env*` を中身を読まずに finding（`untracked-env`）にする
- M1-R2-002: `lstat` の失敗は ENOENT だけスキップ、他は exit 2（`classifyStatError`）
- M1-R2-003: venv の interpreter が実行可能なときだけ venv と認識（`PythonContext.python`）
- M1-R2-004: 1 行が 256 KiB を超えるファイルは窓走査（`LineAssembler`、重なり 4 KiB）でメモリを抑える
- M1-R2-005: `init` の `artifacts/` 提案を `git check-ignore` で判定。非 git は追加提案、書込は冪等
- テスト 252 件（回帰 21 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.2.2

## v0.2.1 — commit 630f2e3 / tag object df8f41c — M1 independent review R1 applied

- 独立レビュー R1（`docs/reviews/m1/independent-review-r1.md`、High 3 / Medium 6 / Low 1）の 10 件をすべて反映（`docs/reviews/m1/response-r1.md`）
- M1-R1-001: v0.2.0 が自己 verify（security）で FAIL する状態でタグ付けされていた。`patterns.ts` の説明コメント修正、docs の訂正、
  リリース手順の順序（commit → 各 commit の worktree 検証 → clean 確認 → push → タグ）を CLAUDE.md に固定。scanner は未追跡（非 ignore）ファイルも走査
- M1-R1-002 / 004: scanner を逐次読み（サイズ上限なし）にし、private-key を BEGIN → END の状態機械で検出（開始行–終了行、END 無しも検出）
- M1-R1-003: `init` が package.json のスクリプト本文を出力・複製しない。出力は全て mask
- M1-R1-005: `.gitignore` 判定を `git check-ignore --no-index` に委ね、否定ルールを考慮
- M1-R1-006: `init --write` は生成物を実行時パーサで検証してから書く（required 0 件を拒否）
- M1-R1-007: Node アダプタはローカル証拠（依存 / `node_modules/.bin`）を必須にし、直接実行は `npx --no-install`
- M1-R1-008: JSON Schema は構造検証用と明記し、`command` に `pattern` を追加。既知の差をテストで固定
- M1-R1-009: `venvBin` の実行権限確認、Python Playwright は pytest 必須
- M1-R1-010: `--write-gitignore` / `--write-scripts` の失敗を init 固有の exit 2 に
- テスト 231 件（回帰 34 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS（security PASS、未追跡込みで 0 件）。`package.json` version 0.2.1

## v0.2.0 — commit 680869d / tag object 2e2685f — M1 — **superseded / known-bad: self verify security FAIL**

- **既知の不具合**: 自己 verify の必須チェック `security` が FAIL する状態でタグ付けされた（`src/security/patterns.ts` の説明コメントが
  url-credential パターンに一致。タグ付与前の自己 verify は当該ファイルが未追跡で走査外だったため PASS していた）。**v0.2.1 以降を使う**。
  タグは削除・付け替えしない（監査性のため）

- チェックアダプタ（Node 7 / Python 7 / 内蔵 security 1）: 検出＋推奨のみ、実行経路は M0 の 1 本のまま（ADR-0011）
- `aiqh init`: 読み取り監査 → 監査表と `aiqh.config.jsonc` 案 → `--write`（既存は `--force` なしで拒否）/ `--write-gitignore` / `--write-scripts`。`aiqh` の PATH 解決元と version を表示、`$schema` は解決できる場合のみ
- `aiqh security-scan`（内蔵、ADR-0010）: git 管理下ファイルの秘密情報パターン・追跡 `.env` 系・`.gitignore` 欠落。値は出力しない。masker とパターン定義を共有し互換テストを追加（R-012 解消）
- 自己 verify が 7 チェック（security PASS）に。JSON Schema を同梱。配布は `npm link`（ADR-0009）
- 対象 2 リポジトリ（Node 系 / Python 系）へ `aiqh init --write` と `aiqh verify` を適用（結果は最終報告）
- テスト 197 件、10 回連続 PASS。`package.json` version 0.2.0

## v0.1.7 — M0 maintenance（commit / tag object の SHA はタグ付与後に `git rev-list -n1 v0.1.7` / `git rev-parse v0.1.7` で確認。最終報告と `docs/reports/M0_COMPLETION.md` §7 に記載）

- 最終独立レビュー（R7-001、Medium）を反映: `OutputBuffer` の UTF-8 境界揃えを、先頭チャンク 1 回の確認ではなく「先頭バイトが継続バイトである間、1 バイトずつ最大 3 回、チャンクをまたいで捨てる」に戻し、さらに切り詰め済み（`truncated`）の間は毎回揃える。R6-001 の共通ヘルパー化で入った退行と、その作業中に見つけた第 2 経路の修正。回帰テスト 5 件（固定チャンク境界 4 件、固定シード 500 回の網羅 1 件）
- テスト 148 件、10 回連続 PASS。**M1 は v0.1.7 を基準に始める。これ以降の M0 レビューは行わない**

## v0.1.6 — commit 8092f9f / tag object 10fd4d9 — M0 maintenance

- 独立レビュー R6（3 件）を反映: レポート用 64KiB 末尾切り出しの UTF-8 境界揃え（R6-001、共通ヘルパー `src/runner/utf8-trim.ts`）、CHANGELOG のタグ横 SHA を peeled commit SHA に統一（R6-002）、ハンドラ差し替え中の Known Risk の説明精度（R6-003）
- テスト 143 件、10 回連続 PASS。M1 は v0.1.6 を基準に始める。R7 は行わない

## v0.1.5 — commit 55e2e0f / tag object df678ca — M0 complete

- 独立レビュー R5（4 件）を反映: シグナルハンドラ差し替えの原子性（R5-001）、確定点の観測可能な意味論への表現変更（R5-002）、verdict の確定点と CLI 終了結果の分離（R5-003、案 A、`onFinalized` → `onVerdictFixed`）、出力末尾の UTF-8 境界揃え（R5-004）
- M0 完了の記録: `docs/reports/M0_COMPLETION.md`、ROADMAP、README。テスト 141 件、自己 verify 6 チェック

## v0.1.4 — commit 37a5b50 / tag object 4b7c943

- 独立レビュー R4（3 件）の追加修正: 確定点の yield を 1 周（poll フェーズを含む）に修正（`yieldFullIteration`）
- 検証中に発見した欠陥の修正: 出力バッファが上限より大きい単一チャンクを丸ごと捨てて空になる問題（バイト単位の切り詰めへ）
- テスト 139 件、10 回連続 PASS

## v0.1.3 — commit c238f0b / tag object 26806d0 — **superseded**

- 独立レビュー R4（3 件）を反映: 確定点（B 案）、中断チェックの事実保持（timedOut / outputTruncated）、未起動チェックの表示（SKIPPED のみ）
- **superseded — 確定点の yield が不十分（`setImmediate` 1 回。確定点直前のシグナルを 10 回中 4 回取りこぼす）。v0.1.4 以降を使用すること。** タグは履歴として残す

## v0.1.2 — commit 24ed514 / tag object 677d834

- 独立レビュー R3（3 件）を反映: `[REDACTED:` 接頭辞によるマスク回避の防止、SIGINT / SIGTERM でのパイプライン中断（AbortSignal、130 / 143、verdict ERROR）、配布 smoke test の bin 実体検証
- テスト 133 件

## v0.1.1 — commit 29e0f42 / tag object 99dad83

- 独立レビュー R1（13 件）と R2（5 件）を反映: マスク規則の拡張（接頭辞付きキー、引用符付き値、Authorization ヘッダ）、プロセスグループ kill のエスカレーション、symlink / dangling symlink の包含判定、exit code と文言の 1 対 1（PASSED / FAILED / ERROR）、git dirty の 3 値化、配布 smoke test（package チェック）
- テスト 118 件

## v0.1.0 — commit c80231e / tag object a1e6dba

- M0 初回: 設計書（ARCHITECTURE / ROADMAP / CONFIG_SPEC / ADR 0001-0008）、fail-closed な `aiqh verify`（JSONC 設定、順次実行、JSON / Markdown / history レポート、秘密情報マスク）、自己 verify（lint / typecheck / unit / build / dependency）
- テスト 72 件
