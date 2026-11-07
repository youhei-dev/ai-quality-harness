# batch4 の範囲の洗い出しの要点（R1 の添付）

範囲の洗い出しの報告（2026-11-07。公開リポジトリの外。読むだけの作業）から、設計の判断に要る分だけを写した。適用先は「適用先 A（node:test）・B（pytest）」と書く。行番号は基準の commit `3a6295a` のもの。

## 1. 状態（期待どおり）

- main = `3a6295a`、作業ツリーは clean、開いている PR 0、タグ v0.18.0 = commit `2e4dab6` / tag object `a0646d4`
- ruleset `main-protection`（branch）と `tag-protection`（tag。規則 `deletion`・`update`、Bypass なし）、`sha_pinning_required: true`
- 適用先 A・B の呼び出しは、どちらも `verify.yml@2e4dab6… # v0.18.0`
- 割り当ての根拠: `docs/reviews/batch3-design/design-final.md:34-35`、`docs/adr/0028-output-parsers-display-only.md:231`、`docs/ROADMAP.md:1204`

## 2. 候補と状態（batch4 で扱うもの）

| 候補 | 正本 | 状態 | batch4 の扱い（人間の決定 B4-Q） |
|---|---|---|---|
| 1b `--cwd` の下に `docs/reviews/` が要る | ADR-0026:30、`src/commands/review-import.ts:93-100` | 仕様どおり。手順書に注意が無い | v0.18.1 の docs |
| 1c `--id-prefix` の書き方 | ADR-0026:29、`src/commands/review-import.ts:87`、`docs/reviews/batch3-design/response-r1.md:64` | 誤りやすい | docs（v0.18.1）と止める直し（v0.18.2） |
| 1a round 1 の `previous` | ADR-0027:33、`src/review/check.ts:119-121` | review-check が止める。import は通す（推定 → 設計の段で実測） | v0.18.2 で import の時点で止める |
| C-08 レビュアーは走らせない | 6 ラベルの response の「既知の残余」（例 `docs/reviews/batch3-v0180-impl/response-r1.md:43-52`） | 受け入れ済み | v0.18.1 の docs（依頼文に実装者の確かめの要約） |
| C-02 golden fixture | `docs/reviews/backlog-9-10/response-r1.md:30,125` | 未着手。似たテストは自分の関数との比べだけ（`tests/regression-backlog9-report-file-notation.test.ts:166-174`） | v0.18.1（tests） |
| C-44 `latest.md` のバッククォート | ADR-0028:170-175、`src/report/markdown.ts:63,126` | 既知の限界 | v0.18.2 で直す |
| C-06 m0 R1 の未確認 3 点 | `docs/reviews/m0/response-r1.md:38` | 行き先が追えない | v0.18.1 の docs（コードの読みで閉じる） |
| 項目 56 | ROADMAP:893 | 見張り（適用先 A は窓の約 0.6%） | 見張りのまま。条件を `docs/ops/monitoring.md` へ（v0.18.1） |
| ADR-0028 決定 14 の既知の限界 | ADR-0028:295（「実装の段でもう一度取る」が未来形） | 適用先 A の CI の実物で件数が出た事実は ROADMAP:1204-1205 だけ | v0.18.1 の注記 |
| PR #28 の CI の記録 | `docs/ops/ci-and-branch-protection.md:99` | run 番号が未記録 | v0.18.1 の docs |
| タグの手順 | ci 手順書 §8 の手順 7、§3:100 | `git ls-remote` の確かめ、タグ 1 つだけを送る決まり、手順 7 の中の「断られたら止まる」が無い | v0.18.1 の docs と最初のタグの作成 |
| 範囲の外の開発用の依存 | `npm outdated` | 範囲の中の更新先は無い。範囲の外に 7 日を満たす版 | v0.18.1（B4-Q5 = B） |

## 3. 数値（2026-11-07）

- `npm audit`: high 0、moderate 10（すべて minimatch の GHSA-g3hv-75wg-m249。開発用の lint の系統）。依存元の最新版（eslint 10.14.0 は `^10.2.6`、`@eslint/config-array` 0.23.5 は `^10.2.4`、`@typescript-eslint/typescript-estree` 8.72.1 は `^10.2.2`）は、まだ minimatch 11 を許さない
- 実行時の依存（commander 15.0.0・jsonc-parser 3.3.1・zod 4.6.7）: 範囲の中でも外でも最新
- 開発用（範囲の外の最新と 7 日）: eslint 10.14.0（満たす）、typescript-eslint 8.72.1（満たす）、`@types/node` 24.19.2（同じ major。満たす）、vite 8.3.5（満たす。8.3.6 は 2026-11-12 まで満たさない）、vitest 5.1.0（2026-11-09 まで満たさない）、typescript 7.0.2（major。方針の外）
- Actions: checkout v7.0.1・setup-node v7.1.0・setup-python v7.1.0 はどれも最新の release と同じ commit。勧告 0 件
- 自己 CI の unit・unit-minpath（直近の main の push の 10 本、上限 600 秒）: 108〜178 秒（18.0〜29.7%）。項目 50 の線（50% = 300 秒）・項目 42 の線（72%）に届いていない
- findings: 27 ファイル・48 件すべて `resolved`。ROADMAP の未チェック 0

## 4. batch4 の範囲外（人間の決定）

review-import v3（状態を変えるコマンド・判定表の生成・label をまたぐ `previous`）、項目 56 の実装、53-G、C-57（Job Summary をログにも出す）、C-07 の残り・C-51・C-19 の調べ（別の依頼）
