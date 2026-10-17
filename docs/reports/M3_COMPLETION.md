# M3 完了報告 — ai-quality-harness（aiqh）

- 完了日: 2026-10-17（人間の決定。v0.9.2 で項目 44 と完了条件の 1 つめを閉じ、記録の PR で M3 を完了とする）
- 完了ベースライン: `v0.9.2`（commit 549ccda / tag object 5cc8c59。本体の main を pull request 必須にした版）。完了の記録は記録の PR（branch `docs/m3-completion`）で入れた。版とタグは無し
- 期間: v0.5.45（2026-10-12〜13。rest2 の計画の波 2）〜 v0.9.2（2026-10-17）。波 2（自己 CI と手順書）、公開の判断（v0.8.3・v0.8.4）、波 4（配布と再利用ワークフロー。v0.9.0・v0.9.1）、本体の pull request の運用（v0.9.2）
- 状態: 完了条件 3 つをすべて満たした（§1）。後に回したものは ROADMAP の項目として残した（§5）
- どのタグも削除・付け替えしていない。適用先のリポジトリの固有の情報（アプリの用途・利用者・デプロイの連携など）は本書に書かない

## 1. 完了条件ごとの根拠

| 完了条件 | 状態 | 根拠 |
|---|---|---|
| 本体リポジトリの PR で verify が自動実行され、FAILED でマージ不可になる | 満たした | `ci.yml` は main への pull request で `verify (ubuntu)`（v0.5.45）と `reusable (self) / aiqh verify`（v0.9.0）を走らせる。v0.9.2 で ruleset `main-protection` に pull request の必須と、この 2 つの必須チェック（strict）を足し、Bypass を外した（ADR-0032）。v0.9.2 の PR #1 では、2 つが走っている間は `mergeStateStatus` が BLOCKED、success の後に CLEAN になってから merge した（run 38998407738、merge の commit `4d0cec6`）。FAILED の PR が止まる場面は、まだ実際には起きていない（§6） |
| 対象リポジトリ向けの最小 workflow 例（10 行程度）が docs にある | 満たした | v0.9.0 の `docs/ops/reusable-workflow.md` の §1（v0.9.1 で Python の対象の例 §1.1）。適用先 2 つの `quality.yml` は、この形で動いた（v0.9.1 の記録） |
| タグ運用（semver、`v0.x.y`）が docs にある | 満たした | v0.9.0 の `docs/ops/reusable-workflow.md` の §6（呼び出す側はタグではなく 40 桁の commit SHA で固定）。リリースの流れは v0.9.2 の `docs/ops/ci-and-branch-protection.md` の §8 |

## 2. 内容ごとの状態

| 内容 | 状態 | 版・根拠 |
|---|---|---|
| `.github/workflows/verify.yml`（`workflow_call`） | 満たした（形を変えて） | v0.9.0（ADR-0031、案 D）。呼び出す側はタグではなく 40 桁の commit SHA で固定する。aiqh は、ワークフローと同じ commit のソースを使う（配布物なし） |
| 入力（Node / Python の版、作業ディレクトリ、設定のパス）・出力（artifact、Job Summary） | 満たした（形を変えて） | 入力は最小の 6 つ。artifact には上げない（ADR-0031）。Job Summary は `job-summary: true` のときだけ |
| 本体リポジトリ自身の CI（PR ごとの自己 verify） | 満たした | v0.5.45 の `ci.yml`（`verify (ubuntu)`）、v0.9.0 の `reusable (self)`。v0.9.2 から 2 つとも main の必須チェック |
| Branch Protection の手順書（必須ステータスチェック・レビュー必須・force push 禁止） | 満たした | `docs/ops/ci-and-branch-protection.md`（v0.5.45〜v0.9.2）。classic の Branch Protection ではなく ruleset（v0.8.4 で作り、v0.9.2 で pull request 必須に）。レビュー（承認）は 1 人のリポジトリでは満たせないので 0（ADR-0032 の決定 5） |
| 適用先（個人のリポジトリ 2 つ） | 満たした | 2026-10-17。`youhei-dev/trim-manager`（PR #2）・`youhei-dev/ai-tutor-browser`（PR #1）。どちらも PR と main への push の run が success（ROADMAP の M3 の「波 4」） |
| Windows での挙動確認 | 測定だけ（対象にはしていない） | `measure (windows)`（手動の実行だけ。ADR-0025 の決定 4）。v0.5.45 の前の手動の 1 回で、8 チェックのうち 3 つが FAIL。Windows を対象にするかは後で決める |
| R-011（後半: Linux での検証） | 満たした | `verify (ubuntu)` が兼ねる（v0.5.45 から） |
| R-006（対策候補 1: `aiqh.config.jsonc` の変更を CODEOWNERS と必須レビューで守る手順） | 手順は書いた（強制はしない） | `.github/CODEOWNERS` と手順書の §4。1 人のリポジトリなので、Code Owners のレビューは必須にしない（ADR-0032 の決定 5）。設定の変更は、pull request と必須チェックを通る |

## 3. 版の一覧（M3 にかかわる版）

| タグ | commit / tag object | 日付 | 内容 |
|---|---|---|---|
| `v0.5.45` | 35ee9e7 / 9e36d60 | 2026-10-13 | 波 2: 自己 CI（`ci.yml`。`verify (ubuntu)`、手動だけの `measure (windows)`）、手順書、CODEOWNERS（ADR-0025） |
| `v0.8.3` | 1f708ac / c976853 | 2026-10-16 | 公開の準備（LICENSE〈MIT〉、README、プロジェクトの `CLAUDE.md` を追跡外に。ADR-0030） |
| `v0.8.4` | 54ab7aa / f2e98df | 2026-10-16 | 公開の後の設定（ruleset `main-protection`〈削除と force push の禁止〉、description、topics） |
| `v0.9.0` | 7f2146d / d67144a | 2026-10-16 | 波 4: 再利用ワークフロー `verify.yml`（案 D）と自己適用の job `reusable (self)`（ADR-0031） |
| `v0.9.1` | d013e89 / d78775b | 2026-10-17 | 波 4 の締め: 個人のリポジトリ 2 つへの適用の記録（docs だけ） |
| `v0.9.2` | 549ccda / 5cc8c59 | 2026-10-17 | 本体の main を pull request 必須に（必須チェック 2 つ、merge commit だけ、Bypass なし。ADR-0032）。**完了ベースライン** |

- v0.5.45 から v0.8.2 までの間の版（波 3 など）は、M2-2 の完了報告（`docs/reports/M2-2_COMPLETION.md`）を見る

## 4. 波 1〜4 の要約（rest2 の SP1 の計画〈5 つの波〉）

| 波 | 版 | マイルストーン | 中身 |
|---|---|---|---|
| 波 1 | v0.5.40〜v0.5.44 | M2 の後片付け | 記録の整理、バックログ 35・N1・20・21、その独立レビューの対応 |
| 波 2 | v0.5.45 | **M3 の前半** | 自己 CI（`verify (ubuntu)`・`measure (windows)`）、手順書 `docs/ops/ci-and-branch-protection.md`、CODEOWNERS。必須にする条件（main への push で続けて 5 回緑）は 2026-10-13 に届いた |
| 波 3 | v0.6.0〜v0.8.1 | M2-2 の本体 | `aiqh review-import`・`aiqh review-check`・出力パーサ（M2-2 の完了報告） |
| 公開の判断 | v0.8.3・v0.8.4 | M3 の後半の前 | 履歴を書き換えずに Public にした（ADR-0030）。main の ruleset を作った |
| 波 4 | v0.9.0・v0.9.1 | **M3 の後半** | 配布の方式（案 D）、再利用ワークフロー `verify.yml`、個人のリポジトリ 2 つへの適用（ADR-0031） |
| 本体の PR の運用 | v0.9.2 | **M3 の締め** | main を pull request 必須に（ADR-0032）。ROADMAP の項目 44 を閉じた |

- 次は波 5（M4: 履歴 DB・ダッシュボード・運用テンプレートなど）

## 5. 後に回したもの（ROADMAP の項目）

| 項目 | 内容 | 行き先 |
|---|---|---|
| 39 | pytest の出力パーサ。v0.9.1 の注記: CI のログで pytest の件数が見えない | 後で（人間の判断） |
| 40 | masker の private-key の形の超線形（Low） | 後で |
| 41 | 負荷に弱いテスト（Low） | 後で |
| 42 | CI の `unit`・`unit-minpath` の時間の見張り。最新（v0.9.2 の main の run）は上限 600 秒の 26.2% | 見張り（72% で対処の案、80% で対処） |
| 43 | `tests/` のコメント「see CLAUDE.md」が追跡外のファイルを指す（Low） | 後で |
| 45 | `aiqh init` が node:test（`node --test`）を unit として検出しない（Low） | 後で（人間の判断） |
| 46 | `actions/runs/<id>/timing` の `billable` が 0 を返す | 作業なし（記録だけ） |
| 番号なし | Windows を対象にするか（いまは測定だけ） | 後で |
| 番号なし | 適用先の側の残り（Python の依存の脆弱性のチェック、anthropic 1.x への上げ、starlette の非推奨の警告、適用先の main の必須チェック） | 適用先の作業（aiqh の作業ではない） |

- 項目 44（必須チェック）は v0.9.2 で閉じた

## 6. 確かめていないこと

- FAILED の PR が必須チェックで止まる場面（まだ起きていない。checks が走っている間の BLOCKED は見た）
- strict で main が先に進んだときの、branch の更新のしかた（リポジトリの `allow_update_branch` は false）
- 締め出されたときに ruleset を止める手順（試していない）
- API の既定の値 `require_extra_approval_for_unattributed_changes: true` の働き（承認 0 の PR #1 の merge は止めなかった）
- ADR-0031 の残る未確認の点（`workflow_dispatch` と呼び出す側の concurrency の取り消し、Node 24 未満の文言、`job.workflow_sha` が空・食い違いのときの経路、GitHub Enterprise Server、`job-summary: true`、`working-directory` が `.` 以外）
- 呼び出す側の分数（timing の API の `billable` が 0。請求の画面では見ていない）
- Windows を対象にしたときの挙動（測定だけ）

## 7. 数字

### 7.1 CI の `unit`・`unit-minpath`（`verify (ubuntu)`。上限 600 秒）

| run | event | commit | `unit` | `unit-minpath` |
|---|---|---|---|---|
| 38836952645 | push | 5abdf0a（v0.8.2） | 369 秒（61.5%） | 366 秒（61.0%） |
| 38847975624 | push | 1f708ac（v0.8.3） | 276 秒（46.0%） | 273 秒（45.5%） |
| 38859512062 | push | 54ab7aa（v0.8.4。Public にした後の最初） | 148 秒（24.7%） | 147 秒（24.5%） |
| 38883693702 | push | 7f2146d（v0.9.0） | 156 秒（26.0%） | 153 秒（25.5%） |
| 38993050139 | push | d013e89（v0.9.1） | 128 秒（21.3%） | 128 秒（21.3%） |
| 38998407738 | pull_request | 549ccda（v0.9.2。PR #1） | 143 秒（23.9%） | 141 秒（23.5%） |
| 38998811869 | push | 4d0cec6（v0.9.2 の merge の commit） | 156 秒（26.0%） | 157 秒（26.2%） |

- Public にしてから、ほぼ半分になった（公開リポジトリの標準の runner の違いと見られる〈推定〉）。項目 42 の線（72%）からは遠い

### 7.2 そのほか

- テスト: 163 ファイル・2,183 件（v0.9.0 から変わらない）。自己 verify は 8 チェック（lint / typecheck / unit / unit-minpath / build / package / security / dependency）
- `reusable (self) / aiqh verify` のジョブ: 3 分 41 秒〜5 分 55 秒（v0.9.0〜v0.9.2）
- 適用先の `aiqh / aiqh verify` のジョブ: 41〜47 秒（2026-10-17。PR と main の run）

## 8. 学んだこと

- **CI の監視の失敗と、CI の失敗を分ける**: v0.9.0 の push の run を `gh run watch` で待っていたとき、GitHub の API の HTTP 502 で watch が終わった。run 自体は進んでいたので、run の状態を読み直してから、もう一度待った。watch の終了コードだけで CI の失敗と決めない
- **適用先のテストは、追跡しているファイルだけで確かめる**: CI には `.env` も手元の venv も無い。手元では隠れていた依存（`.env` の値・版を固定していない依存）は、追跡しているファイルだけの clone と新しい venv で走らせて初めて見えた（`docs/ops/reusable-workflow.md` の §8）
- **pull request の run の `job.workflow_sha` は、試しの merge の commit を指す**: v0.9.2 の PR #1 の `reusable (self)` では、aiqh のソースは PR の head ではなく、GitHub が作る試しの merge の commit だった（照合は通った）。merge の後の main の run では、merge の commit を指した
- **走査の道具の範囲を確かめる**: push の前の走査の道具は、走査するリポジトリを自分の置き場所から決めていた。適用先では、その 1 行だけを変えた写しで同じ確かめをした

## 9. 次の段階の前提

- 基準: `v0.9.2`（コードは v0.9.0 と同一。この記録の PR の merge の後の main）
- 運用: main は pull request 必須（ADR-0032）。リリースの流れは `docs/ops/ci-and-branch-protection.md` の §8
- 次: M4（波 5。ADR から）
