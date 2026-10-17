# ADR-0032: 本体リポジトリの main は pull request を必須にする（必須チェック 2 つ・merge commit だけ・Bypass なし）

- 状態: 採用（v0.9.2。ADR-0025 の決定 3・6・7 の後。ROADMAP の項目 44 と、M3 の完了条件の 1 つめ）
- 日付: 2026-10-17（v0.9.2）

## 文脈
- ROADMAP の項目 44（必須チェック `verify (ubuntu)` を ruleset `main-protection` に足す）は、ADR-0025 の決定 7 の条件（`verify (ubuntu)` が main への push で続けて 5 回緑）に 2026-10-13 に届いていた。その後も、main への push の run は success が続いた
- v0.8.4 の ruleset `main-protection`（id 25218296）は、削除と force push の禁止だけで、Bypass は Repository admin の役割（`bypass_mode: always`）だった。この形のまま必須チェックを足しても、admin（このリポジトリのただ 1 人の作業者）の直接の push は Bypass で通る見込みで、チェックは効かない（波 4 の SP1 の推定）
- 必須チェックは、main への直接の push と相性が悪い（チェックは push の後に走る。`docs/ops/ci-and-branch-protection.md` の 3-2）。効かせるには、pull request の流れにする必要がある
- M3 の完了条件の 1 つめ「本体リポジトリの PR で verify が自動実行され、FAILED でマージ不可になる」が残っていた。PR での自動の実行は `ci.yml` で入っていた（v0.5.45 から。v0.9.0 から `reusable (self)` も）
- `ci.yml` は、main への push と main への pull request で、`verify (ubuntu)` と `reusable (self) / aiqh verify` の 2 つの job を走らせる（`measure (windows)` は手動の実行だけ）

## 決定（人間の決定。2026-10-17）
1. **main は pull request を必須にする**。必須チェックは `verify (ubuntu)` と `reusable (self) / aiqh verify` の 2 つ（どちらも GitHub Actions の check。integration の id 15368）。`measure (windows)` は入れない（手動の実行だけの測定。ADR-0025 の決定 4）
2. **merge の方式は merge commit だけ**（`allowed_merge_methods: ["merge"]`）。branch の commit の SHA を保つため。SHA 固定の worktree での検証と、CHANGELOG・報告に書く SHA・タグを、branch の commit にそのまま使える
3. **ruleset の Bypass は外す**（`bypass_actors: []`）。困ったときは、人間が Settings から ruleset を止める
4. **merge は Claude Code が行う**。必須チェックが緑になった後に `gh pr merge <番号> --merge --match-head-commit <SHA> --delete-branch` で行う。`--admin` は使わない
5. **承認の数は 0**。Code Owners のレビューは必須にしない（1 人のリポジトリでは満たせない。手順書の 3-3）
6. **branch が最新であること（strict）を有効にする**（`strict_required_status_checks_policy: true`）

設定（2026-10-17、v0.9.2）: `gh api --method PUT repos/youhei-dev/ai-quality-harness/rulesets/25218296 --input <JSON>` を 1 回。読み返しの結果:
- rules: `deletion`・`non_fast_forward`・`pull_request`（`required_approving_review_count: 0`、`require_code_owner_review: false`、`dismiss_stale_reviews_on_push: false`、`require_last_push_approval: false`、`required_review_thread_resolution: false`、`allowed_merge_methods: ["merge"]`）・`required_status_checks`（`strict_required_status_checks_policy: true`、上の 2 つの check）
- `bypass_actors: []`、`current_user_can_bypass: never`、enforcement `active`、対象 `~DEFAULT_BRANCH`
- API が既定の値で足した項目（指定していない）: `pull_request` の `require_extra_approval_for_unattributed_changes: true`・`required_reviewers: []`、`required_status_checks` の `do_not_enforce_on_create: false`
- リポジトリの merge の設定（GET。変えていない）: `allow_merge_commit: true`（squash と rebase もリポジトリでは許されたまま。ruleset の `allowed_merge_methods` が merge commit だけに絞る）、`delete_branch_on_merge: false`、`allow_update_branch: false`、`allow_auto_merge: false`

## 結果
- **main への直接の push はできない**（ruleset で拒まれる。admin も同じ）。変更は、作業の branch → pull request → 必須の 2 つが緑 → merge commit、の流れで入る（手順は `docs/ops/ci-and-branch-protection.md` の §8）
- strict なので、main が先に進んだときは、branch を最新にしてから merge する
- **困ったときの止め方**: 人間が Settings → Rules → Rulesets → `main-protection` で Enforcement を Disabled にする（Bypass が無いので、ruleset を止めない限り、admin も直接の push はできない）。止めたら、戻すまでの間に何をしたかを記録する
- **merge commit の理由**: squash や rebase は branch の commit を作り直し、SHA が変わる。merge commit なら、branch の commit が、そのまま main の履歴に入る
- **タグ**: release の commit（branch の commit。merge の後も main の履歴に残る）に付ける。タグの push は、ruleset の対象（branch）の外
- タグの前の確かめ（ADR-0025 の決定 7 の後の手順「release commit の `verify (ubuntu)` が success」）は、PR の run の必須チェックで機械的に守られる形になった。merge の後の main への push の run の 2 つの success も確かめる
- 1 人のリポジトリで承認は 0 なので、人のレビューの強制ではない。独立レビューは、これまでどおり `aiqh review-packet` と `aiqh review-import` の流れ（M2）
- 公開リポジトリの標準の runner は無料。1 つの変更で、PR の run と main への push の run の 2 回が走る

## ADR-0025 との関係
- 決定 3（最初は必須にしない）は、この ADR で終わる
- 決定 6（Branch Protection は使えない）: v0.8.4 で前提が変わり、ruleset を使った（ADR-0025 の注記〈v0.8.4〉）。この ADR で、その ruleset に pull request の必須と必須チェックを足し、Bypass を外した
- 決定 7（必須にする条件）: 条件は 2026-10-13 に届いていた。決定 2 の「後で必須チェックに指定する名前。変えない」のとおり、ジョブ名 `verify (ubuntu)` をそのまま必須チェックにした。あわせて `reusable (self) / aiqh verify`（v0.9.0）も入れた
- ADR-0025 の文は変えず、注記を足した

## 代替案（採らなかった理由）
- **直接の push を続ける**（手順書の 3-2 の案 B。ruleset は削除と force push の禁止だけ）: 必須チェックが効かず、M3 の完了条件の 1 つめを満たさない
- **Bypass を残す**: admin の直接の push が通り、必須チェックが効かない
- **squash merge・rebase merge**: SHA が変わり、SHA 固定の検証の記録と、branch の commit のタグが使えない
- **承認を 1 以上・Code Owners のレビューを必須**: 1 人のリポジトリでは満たせない
- **`measure (windows)` も必須**: 手動の実行だけの測定で、pull request では走らない（ADR-0025 の決定 4）

## 未確認の点
- `require_extra_approval_for_unattributed_changes: true`（API の既定の値）が、承認 0 の設定でどう働くか（v0.9.2 の最初の pull request の merge で見る）
- strict で main が先に進んだときの、branch の更新のしかた（リポジトリの `allow_update_branch` は false のまま）
- 締め出されたとき（ruleset を止める）の手順は、実際には試していない
