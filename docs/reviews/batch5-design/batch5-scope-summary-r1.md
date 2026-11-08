# batch5 の範囲の洗い出しの要点（設計 R1 の添付）

範囲の洗い出しの報告（2026-11-08 10:33〜10:51 JST。読むだけ）は公開リポジトリの外にある。設計に使う事実だけを写す。適用先は「適用先 A（node:test）」「適用先 B（pytest）」と書き、件数と出力の形だけを示す。数値は報告の値（取り直していない）で、取得の時刻を付ける。

## 急ぐものが無いこと

- aiqh の `npm audit --audit-level=high` は exit 0（high・critical 0）。moderate 10 件は minimatch の勧告 GHSA-g3hv-75wg-m249 の 1 つから（v0.18.2 の記録と同じ）。取得 2026-11-08T01:43:37Z
- 自己 CI（main の push の直近 10 本。run 40955597224〜42432881898、2026-10-29〜11-08。すべて success）: `unit` の最大 172.3 秒（上限 600 秒の 28.7%）・中央値 145.7 秒（24.3%）、`unit-minpath` の最大 171.3 秒（28.6%）・中央値 141.7 秒（23.6%）。72%（432 秒）・80%（480 秒）・50%（300 秒）のどれにも届かない
- Actions: checkout v7.0.1・setup-node v7.1.0・setup-python v7.1.0 は、どれも最新の release と同じ commit。勧告 0 件
- 時間のテスト: aiqh のリポジトリの run は全部で 84 本（2026-10-12T11:19Z〜2026-11-08T01:07Z）、84 本すべて success、再実行（`run_attempt > 1`）0
- 適用先 A の直近 3 本: `parsed: node-test — tests 113 (pass 113, fail 0); suites 0`（`output-truncated` は出ていない。unit は上限 300 秒の 0.7% 以下）。適用先 B の直近 3 本: `parsed: pytest — 444 passed, 1 warning`

## 新しく分かったこと（5 つ）

1. **C-44 の表の外の `\|`**: GitHub の contents API の HTML の形（GitHub がリポジトリのファイルの表示に使う描画）で、golden fixture の 2 つの `latest.md`（commit `d4f1697`）を読んだ。表の中は `|` と描かれ、表の外の `- Command:` の行は `npm test \| tee log` のようにバックスラッシュが字のまま見えた（ADR-0028:176 の見込みどおり）。ほかの C-44 の形（バッククォートを含む値・`cwd` のバッククォート・両端の空白）は正しく描かれた。Job Summary・エディタの描画は見ていない
2. **commander 15.1.0**（実行時の依存。範囲 `~15.0.0` の外）が 2026-11-07T01:27Z に公開された（7 日は 2026-11-14T01:27Z）。changelog は読んでいない
3. **gh CLI**: 手元は 2.89.0 だった（最新 2.103.3、2026-10-26）。間の版に、手順で使うコマンドに関わるセキュリティの直し（v2.92.0 の `gh run view --log` の端末のエスケープ、v2.97.0 の `gh api`・`gh pr diff` の端末のエスケープなど）と、`gh pr merge --delete-branch` と worktree の直し（v2.99.0）、既定で有効の telemetry（v2.91.0）がある。人が 2026-11-08 に 2.103.3 に上げ、telemetry を止めた（設定と環境変数）
4. **C-19**: typescript-eslint 8.72.1 と `@typescript-eslint/typescript-estree` 8.72.1 の peer は `typescript >=4.8.4 <6.1.0`。TypeScript 7（最新 7.0.2）は範囲の外、6.0.3 は中
5. **適用先 A・B の `sha_pinning_required` は `false`**（aiqh は `true`）。どちらの設定が適用先の run に当たるかは文書に書かれていない

## 依存（取得 2026-11-08T01:43:37Z）

| 種類 | 名前 | 範囲 | 入っている版 | 範囲の中の最新 | 範囲の外の最新 | 公開から 7 日を満たす時刻（UTC） |
|---|---|---|---|---|---|---|
| 実行時 | commander | `~15.0.0` | 15.0.0 | 15.0.0 | 15.1.0（2026-11-07T01:27Z） | 2026-11-14T01:27Z |
| 実行時 | jsonc-parser | `~3.3.1` | 3.3.1 | 3.3.1 | 3.3.1 | 満たす |
| 実行時 | zod | `~4.6.7` | 4.6.7 | 4.6.7 | 4.6.7 | 満たす |
| 開発 | vitest | `~5.0.3` | 5.0.5 | 5.0.5 | 5.1.0（2026-11-02T16:12Z） | 2026-11-09T16:12Z |
| 開発 | vite | `~8.3.5` | 8.3.5 | 8.3.6（2026-11-05T05:40Z） | — | 2026-11-12T05:40Z |
| 開発 | `@types/node` | `~24.13.3` | 24.13.6 | 24.13.6 | 24.19.2 / 26.6.6 | （上げない: ADR-0008 の追記〈v0.18.1〉の決定 4） |
| 開発 | typescript | `~5.9.3` | 5.9.3 | 5.9.3 | 6.0.3 / 7.0.2 | （ADR-0001） |
| 開発 | eslint・typescript-eslint・`@eslint/js` | — | 最新 | — | — | — |

- vitest 5.1.0 の peer の vite は `^6.4.0 || ^7.0.0 || ^8.0.0`
- minimatch は 10.2.6。依存元の最新（eslint 10.14.0 `^10.2.6`、`@eslint/config-array` 0.23.5 `^10.2.4`、`@typescript-eslint/typescript-estree` 8.72.1 `^10.2.2`）は 11 系を許さない。minimatch の最新は 11.0.5（2026-11-05T23:30Z）

## tag-protection と sha_pinning の読み（2026-11-08。どれも GET）

- ruleset `tag-protection`（26732066）: target `tag`、enforcement `active`、include `["refs/tags/v*"]`・exclude `[]`、rules `deletion`・`update`（`parameters` なし）、`bypass_actors: []`、`current_user_can_bypass: "never"`、作成・更新 2026-11-07T07:32:03+09:00
- rule insights（`time_period=month`）: 37 件すべて `pass`。タグは 2 件（v0.18.1・v0.18.2 の作成）で、`update`・`deletion` が評価されて `pass`
- `actions/permissions`: aiqh `{"enabled":true,"allowed_actions":"all","sha_pinning_required":true}`、適用先 A・B は `sha_pinning_required: false`（ほかは同じ）
- GitHub の文書の読みは要約によるもので、原文の一字一句は照らしていない

## 適用先 A の依存の見張り（`npm audit --json`。読むだけ。前後で適用先の状態と lock が同じ）

`6 vulnerabilities`（low 2・moderate 4。high・critical 0）。すべて開発用。勧告は 3 つ:

| 勧告 | 重さ | 公開（UTC） | 直った版 |
|---|---|---|---|
| GHSA-gcqx-w48m-w2h4（deepmerge の prototype の汚染） | low | 2026-09-18T18:31:44Z | 無い（deepmerge の最新も影響の範囲の中） |
| GHSA-3g3m-2fjr-6pw4（glob の AbortSignal の取り消しの迂回） | moderate | 2026-10-30T23:09:11Z | glob 14.0.2 |
| GHSA-g3hv-75wg-m249（minimatch の globparts の増幅によるサービス拒否） | moderate | 2026-10-30T23:09:55Z | minimatch 11.0.1 |

- moderate 4 件は、勧告 2 つ（glob・minimatch）と、依存の道の上の 2 つのパッケージを数えたもの。low 2 件は deepmerge と、道の上の 1 つ
- glob と minimatch の勧告の公開（2026-10-30T23:09Z）は、v0.18.0 の回の適用先 A の main の run（2026-10-31T00:21Z、`4 vulnerabilities (4 low)`）の約 1 時間前。監査データへの反映の時差と見れば、同じ lock で件数が変わったこと（ROADMAP:1029）と矛盾しない（推定。確かめていない）

## 設定のコマンドの `|`（C-44 の残りの互換性の根拠）

- aiqh 自身の `aiqh.config.jsonc` の 8 つ、適用先 A の 5 つ、適用先 B の 2 つの check の `command` に、`|` は 0 件。v0.18.4 の直しで、aiqh 自身・適用先 A・B の `latest.md` は変わらない見込み
