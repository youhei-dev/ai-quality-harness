# aiqh batch3 設計（最終。v0.17.1・v0.18.0）

作成: 2026-10-30（R1・R2・最終は同じ日）。基準の commit: `447fb663297096aee42535cad253ad280a22a00f`（公開リポジトリの main。v0.17.0 の後の記録の PR #23 の merge）。この段では、コード・テスト・docs の追跡しているファイルを変えていない。決めることは `docs/reviews/batch3-design/questions-final.md`（B3-D-Q1〜B3-D-Q15。すべて確定）、各回への応答は `response-r1.md`・`response-r2.md`、ADR の追記の案は `adr-0008-addendum-draft-final.md`・`adr-0013-addendum-draft-final.md`・`adr-0025-addendum-draft-final.md`・`adr-0028-addendum-draft-final.md`（どれも同じフォルダ）。

## R2 からの変更（最終版）

設計 R2 の独立レビュー（batch3-design R2。High 0 / Medium 1 / Low 0。R1 の 3 件はどれも「解消」）の 1 件に、人間の決定（2026-10-30）に沿って対応した。設計 R3 は出さない（人間の決定）。v0.18.0 の実装レビューで解消を確かめる。詳細は `response-r2.md`。

| 指摘 | 重要度 | 対応 | 直した所 |
|---|---|---|---|
| B3-D-R2-001（読む窓から stdout の先頭が落ちただけで、末尾に正しい要約があっても件数を捨てる。受け入れの条件が欠けている） | Medium | 規則は変えない。適用先 A の実物と合成の入力で、件数が出なくなる条件を測った（読む窓の 1,048,576 UTF-16 単位。件数の目安つき）。境目を ADR-0028 の追記・v0.18.0 の回帰テスト・受け入れの基準で固定した。改善策（runner が流しながら要約の形の組を全体で数える）を ROADMAP の項目 56 に残した。専用の reporter を別ファイルに出させる案は、利用者のコマンドを書き換えるので候補にしない | §3.13（新）・§5.2・§5.3（新）・付録 A9・付録 B、ADR-0028 の追記の案（最終） |

人間の決定（2026-10-30）で確定した問い: B3-D-Q9 = B、B3-D-Q13 = A、B3-D-Q14 = A、B3-D-Q15 = A（ほかはこれまでの決定どおり）。`questions-final.md` の【確定】。

## R1 からの変更（R2）

設計 R1 の独立レビュー（batch3-design R1。High 0 / Medium 1 / Low 2）の 3 件に、人間の決定（2026-10-30）に沿って対応した。指摘ごとの対応の詳細は `response-r1.md`。

| 指摘 | 重要度 | 対応 | 直した所 |
|---|---|---|---|
| B3-D-R1-001（本物の要約が読む窓の外に落ち、テストが出した偽の 8 行だけが残ると、偽の件数を出しうる） | Medium | stdout が切れたら（runner が先頭を捨てた、または読む窓が先頭を切った）node:test の要約を読まない（理由 `output-truncated`）。パーサへの入力に `stdoutTruncated` を足す（今は伝わらない）。切れていなければ全体が見えるので、偽の組は「2 組」で見つかる。要約の出所は検証できないことを既知の限界に書いた。終了コードとの一致も確かめる（B3-D-Q14） | §3.3・§3.5・§3.7・§3.11（新）・§3.12（新）・§5.2・§6・§9、ADR-0028 の追記の案 R2、B3-D-Q2・Q13・Q14 |
| B3-D-R1-002（16 桁以上を `unexpected-summary` にする契約に対し、組の認識が定まらず `no-summary` に落ちうる） | Low | 2 段の認識（① 8 行の字面の形 → ② 値の確かめ）を仕様にした。境目の期待を 21 行の表にし（ほかに、切れた・偽の組の 6 行）、試作で確かめた | §3.5・§3.12（新）・§5.2、ADR-0028 の追記の案 R2 |
| B3-D-R1-003（lock のルートの version を手で 0.5.35 に戻す運用を、理由を確かめずに固定する） | Low | 理由を調べた（記録に無い。v0.13.2 で戻したのは、その版の範囲を絞る指示）。A・B1・B2 の 3 つの形で `npm ci`・`node_modules`・`npm pack`・`npm install`・lint・型検査・全テストを比べた。違いは「A の lock は `npm install` で書き直される」だけ。推奨を B に変えた | §2.6（書き直し）・§2.8・§5.1・付録 A7、ADR-0008 の追記の案 R2、B3-D-Q9・Q15 |

ほかに R2 で直したこと:
- R1 の試作の確かめは、取った出力をすべて終了コード 1 としてパーサに渡していた（R1 のパーサは終了コードを見なかったので、結果は変わらない）。R2 は、取ったときの終了コードを記録して渡した（§3.12 の (f)）
- 失敗した todo だけの形と、失敗のある npm 経由の形を足して取った（終了コードの関係の確かめ。§3.4）
- 変えた問い: B3-D-Q2・B3-D-Q9（【R2 で変更】）。足した問い: B3-D-Q13〜B3-D-Q15。ほかの問いは、人間が推奨どおりに決めた（`questions-final.md` の【確定】）

## 0. 前提

- **範囲**: 人間の決定（2026-10-30）B3-Q1〜B3-Q11。すべて範囲の洗い出しの推奨どおり（§1）。範囲の洗い出しの報告は公開リポジトリの外にあり、要点を設計 R1 の添付 `batch3-scope-summary-r1.md`（公開リポジトリの外）に写した（適用先の割り当てを下のとおり読み替えたもの）
- **表記**: 適用先のリポジトリを「適用先 A」「適用先 B」と書く。中身・用途は書かない（件数・ファイルの種類・出力の形だけ）
  - 適用先 A: unit の check が `npm test`（package.json の `test` が `node --test …`。node:test）。v0.13.1 で上げた PR は A が #4
  - 適用先 B: unit の check が venv の `python -m pytest -q tests/`（pytest）。v0.13.1 で上げた PR は B が #2
  - 根拠（基準の commit の記録）: `docs/reviews/batch1-design/design-final.md:847`（「適用先 A は PR #4、適用先 B は PR #2」）、`docs/reviews/batch1-design/design-final.md:279`（B の unit が venv の pytest）、`docs/reviews/batch1-design/design-final.md:431`（B のゼロ幅の文字は .py の 3 ファイル）、`docs/reviews/batch1-design/design-final.md:238`（A は unit を手で足した設定）、`docs/adr/0037-security-scan-layer-c-invisible-characters.md:14-15`
  - 範囲の洗い出しの報告は、A と B を逆に書いていた。この設計は上の割り当てで書く（読み替えた箇所は、設計 R1 の添付 `batch3-scope-summary-r1.md` の末尾。公開リポジトリの外）
- **数の印**
  - 【実測】: この設計の段（2026-10-30）に手元で測った値。測り方は付録 A
  - 【記録】: ROADMAP・CHANGELOG・ADR・過去の設計から引いた値。引いた先を書く
  - 【推定】: 測った値からの見込み。実装の段で確かめ直す
- **実測の環境**: macOS（Apple Silicon、8 CPU、AC 電源、`caffeinate -i`）、Node v24.13.1、npm 11.18.0（`min-release-age=7`・`ignore-scripts=true`）。テストの前に負荷のゲート（1 分平均 ≤ 8 かつ 5 分平均 ≤ 12 が 20 秒おきに 3 回）
- **着手前の確認**【実測】: HEAD = origin/main = 基準の commit、作業ツリーは clean、開いている PR 0。タグ v0.17.0 = commit `baecd63c3b5f7f405d16830d39a9ddc9865f5e82`。適用先 A・B の呼び出しはどちらも `verify.yml@baecd63… # v0.17.0`
- **試作**: 下書きの変更を、基準の commit の使い捨ての worktree（追跡外の `tmp/`）に入れて、lint・型検査・全テストを走らせた（§6）。試作のコードは、設計 R2 の依頼に参考として `prototype-r2.diff` を付けた（R2 の試作。実装そのものではない。公開リポジトリの外）

## 1. 範囲と決定（B3-Q1〜B3-Q11）

| 問い | 決定 | 範囲の洗い出しの根拠 |
|---|---|---|
| B3-Q1 範囲 | 主案: v0.17.1 → v0.18.0 → 適用先の SHA を上げる（人間の決定 H11 の 4 回目） | 5 章（3 案と推す理由）、5.4 |
| B3-Q2 50-C・50-D | 見張りのまま（CI の unit が T4 の 50%〈300 秒〉を超えたら選び直す） | 3 章（直近の main の 10 本で 18.7〜30.0%、最大 180 秒） |
| B3-Q3 依存の更新の置き場 | v0.17.1 に入れる | 4 章 |
| B3-Q4 範囲を変える devDependency | 入れない（範囲の中だけ: vitest 5.0.5・@types/node 24.13.6・typescript-eslint 8.70.1） | 4.2 |
| B3-Q5 Actions | setup-node・setup-python を v7.1.0 に SHA で固定し、更新の手順を ADR-0025 の追記と ci 手順書に書く | 4.3、2.3 の C-10・C-56 |
| B3-Q6 適用先の確かめに使う手元の別の道具 | aiqh の batch に混ぜない | 2.9 |
| B3-Q7 タグの ruleset・`sha_pinning_required` | 版とは別に、人間の承認の後に設定し、記録の PR に書く。この段では設定しない（§8 に手順と確かめ方だけ） | 2.1・2.3 の C-11 |
| B3-Q8 適用先への反映 | v0.18.0 の後に 1 回 | 5.1 |
| B3-Q9 lock のルートの `version` | 0.5.35 の据え置きを決まりとして書く（ADR-0008 の追記か CHANGELOG の決まり。§2.6 で選ぶ）。**R2**: B3-D-R1-003 の人間の決定で、理由を調べて実測し、推奨を B（npm が書いた値を保ち、リリースで揃える）に変えた（B3-D-Q9） | 2.4 の C-52 |
| B3-Q10 独立レビュー | 設計 1 回（R1。High・Medium があれば R2）と、各版の実装 R1 | 6 章 |
| B3-Q11 項目 40 | v0.18.0 に入れる | 2.1 の 40 |

版の中身:
- **v0.17.1**（src を変えない。tests も変えない見込み）: C-01（H11 の 2・3 回目の記録）、C-42（pytest の実物の形の記録）、C-53（範囲の中の devDependency）、C-56 と C-10（Actions の SHA と更新の手順）、C-50（文書の古い現在形）、C-52（lock のルートの version の決まり）、batch3 の設計の記録（`docs/reviews/batch3-design/`）
- **v0.18.0**: C-04（node:test の出力パーサ。ADR-0028 の決定 14）、項目 40（masker の private-key の形の線形化。ADR-0013 の追記）
- **版の外**: タグの ruleset、`sha_pinning_required`（人間の承認の後。§8）
- **v0.18.0 の後**: 適用先 A・B の SHA を上げる（H11 の 4 回目。§7）

## 2. v0.17.1（src を変えない版）

### 2.1 C-01: H11 の 2 回目・3 回目の記録

**今**: `docs/ROADMAP.md:1172` と `CHANGELOG.md:23` は「適用先 A・B の再利用ワークフローの SHA は、この版の後に 1 回上げる」で止まっている。H11 の 2 回目（v0.15.0）と 3 回目（v0.17.0）の記録は、aiqh の追跡しているファイルに無い（作業の報告は公開リポジトリの外）【実測: `git grep`】

**事実**（適用先のリポジトリの PR と run を `gh` で読んだ【実測】）:

| 回 | aiqh の版 | 適用先 A（PR・merge・main の run） | 適用先 B（PR・merge・main の run） |
|---|---|---|---|
| 1 回目 | v0.13.1 | #4（記録済み） | #2（記録済み） |
| 2 回目 | v0.15.0 | #5、merge `0be71c1`（2026-10-26T00:17Z）、run 40248598132 success | #3、merge `b2b6ad5`（2026-10-25T23:57Z）、run 40247026759 success |
| 3 回目 | v0.17.0 | #6、merge `b4254d6`（2026-10-29T22:47Z）、run 40968524524 success | #4、merge `a957b3b`（2026-10-29T22:48Z）、run 40968611980 success |

- 2 回目の適用先 B は、予定（`docs/adr/0037-security-scan-layer-c-invisible-characters.md:118` の「規則 2 つ〈`category: "zero-width"`〉を足してから SHA を上げる」）と違う形で終わった: RGI の並びの外のゼロ幅の文字は、ソースの 1 文字を取り除き、テストのデータの 1 行を記法（エスケープ）に書き換えた。allow の規則は一度足した後に外し、**規則は足していない**。3 回目の run の security の件数の行は、findings 0・suppressed 0・allow rules used 0【実測: run 40968611980 のログ】
- 3 回目の適用先 A は、同じ PR で適用先の側の依存の勧告の直しも入っている（aiqh の作業ではない。件数だけ: 直した後も low 4 が残る。直った版が無い勧告）
- どちらの回も、merge は人の手（適用先の PR の merge を Claude Code に任せない運用。H11 の作業の記録）

**変えるファイル**:
- `docs/ROADMAP.md`: v0.17.0 の項の最後の行（1172 行）の後に「H11 の 2・3 回目の記録」の行を足す（上の表の中身。PR 番号・merge の短い SHA・run の番号・日付。適用先 B の規則の代わりの直し方）。「適用先の側の残り」（1024〜1026 行）は変えない
- `CHANGELOG.md`: v0.17.1 の項に、記録を足したことを 1 行（中身は ROADMAP）
- `docs/adr/0037-security-scan-layer-c-invisible-characters.md`: 118 行に注記「（v0.17.1 で注記: 適用先 B は規則を足さず、ファイルを直して上げた。ROADMAP の v0.17.0 の項）」。決定は変えない
- 変えないもの: 1 回目の記録、`docs/reviews/` の過去の記録

**確かめ方**: 上の表の値を、commit の前に `gh pr view`・`gh run view` で読み直す（記録の値と一致すること）。書いた文の SHA は短い形（7 文字）で、`git` の 2 つのリポジトリの値と照らす

### 2.2 C-42: pytest の実物の形の記録

**今**: `docs/adr/0028-output-parsers-display-only.md:230` は「実物で確かめた要約の形は `-q` の、passed と skipped だけの 1 回」で、失敗・警告のある形は合成の fixture だけ [要確認] と書く

**事実**【実測】: 適用先 B の main の run 40968611980（v0.17.0）のログに `parsed: pytest — 444 passed, 1 warning`（警告のある形。`-q`）。適用先 B の PR の run 40967386584 も同じ形（H11 の 3 回目の作業の記録）。失敗・エラーのある形は、実物ではまだ出ていない

**変えるファイル**: `docs/adr/0028-output-parsers-display-only.md` の 230 行の後に注記「（v0.17.1 で注記: 適用先 B の CI で `-q` の passed と warning の形が実物で出た。失敗・エラーのある形は今も合成の fixture だけ）」。決定・テスト・fixture は変えない

### 2.3 C-53: 範囲の中の devDependency

**決定**（B3-Q4）: 範囲の中だけ。vitest 5.0.3 → 5.0.5、@types/node 24.13.3 → 24.13.6、typescript-eslint 8.70.0 → 8.70.1。どれも公開から 7 日以上（5.0.5 は 2026-10-15、24.13.6 は 2026-09-19、8.70.1 は 2026-09-21）【実測: `npm view <名前> time`】

**試し**【実測。付録 A3】: 基準の commit の使い捨ての worktree（node_modules は APFS の複製）で `npm update vitest @types/node typescript-eslint --save`（`--dry-run` は付けない）
- exit 0、`changed 21 packages`、`found 0 vulnerabilities`
- **`package.json` は変わらない**（`~5.0.3` などの指定は 5.0.5 などを含むので、`--save` でも書き換えなかった）
- `package-lock.json` は 108 行の入れ替え。全欄で比べた結果（`lock-diff.py`。ルートの欄も含む）:
  - (a) 版の変化 21 項目: `@types/node`、`typescript-eslint` とその 10 の部品（8.70.0 → 8.70.1）、`@typescript-eslint/eslint-plugin` の下の `ignore`（7.0.8 → 7.0.13）、`vitest`・`@vitest/mocker`・`@vitest/spy`（5.0.3 → 5.0.5）、`chai`（6.2.2 → 6.3.0）、`obug`（2.1.4 → 3.0.0。semver-major。vitest 5.0.5 が固定している開発用の依存）、`std-env`（4.2.0 → 4.3.0）、`tinybench`（6.1.4 → 6.2.2）、`tinyexec`（1.3.0 → 1.3.1）。そのうち 11 項目は `dependencies` か `peerDependencies` の欄も変わる（版の変化に伴うもの）
  - (b) 増えた項目・減った項目: 0
  - (c) 版が同じで、ほかの欄だけ変わった項目: 0
  - (d) **ルートの 2 つの `version`（最上位と `packages[""]`）が 0.5.35 → 0.17.0 に書き換わった**（`package.json` の今の版）。ルートのほかの欄は変わらない
- 試しの worktree で、ルートの 2 つの version を 0.5.35 に戻し、下の Actions の SHA も変えた状態で、lint 0 件・型検査 0 件・全テスト 187 ファイル・2,822 件 PASS（§6）
- 実行時の依存（commander・jsonc-parser・zod）は変わらない

**変えるファイル**: `package-lock.json` だけ（`package.json` は変わらない。B3-D-Q10）。ルートの 2 つの version は §2.6 の決まりで扱う

**確かめ方**: commit の前に `lock-diff.py` の (a)〜(d) を CHANGELOG の記述と照らす（v0.13.2 の教訓: 版だけでなく全欄）。`npm audit --audit-level=high` が 0 件。各 commit の SHA 固定の worktree で typecheck・lint・全テスト・`npm run verify`

### 2.4 C-56・C-10: Actions の SHA と更新の手順

**新しい SHA**【実測: `gh api repos/actions/<名前>/git/ref/tags/v7.1.0`。どちらも軽量タグで、指す object は commit。剥がす必要は無かった】

| アクション | 今（基準の commit） | 新しい（v7.1.0） | 公開（UTC） | 7 日を満たす日時 |
|---|---|---|---|---|
| actions/setup-node | `820762786026740c76f36085b0efc47a31fe5020` # v7.0.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` # v7.1.0 | 2026-10-08T02:52 | 2026-10-15T02:52 |
| actions/setup-python | `5fda3b95a4ea91299a34e894583c3862153e4b97` # v7.0.0 | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` # v7.1.0 | 2026-10-22T02:56 | 2026-10-29T02:56 |
| actions/checkout | `3d3c42e5aac5ba805825da76410c181273ba90b1` # v7.0.1 | 変えない（v7.0.1 が最新） | 2026-07-20 | — |

- 今の SHA は、タグ v7.0.0 が指す commit と一致する【実測】
- `action.yml` の違い【実測: 2 つの版の `action.yml` を `gh api` で読んで比べた】: どちらも `runs.using: 'node24'`・`main`・`post` は同じ。setup-node は入力の説明 1 行（`mise.toml` を足した）、setup-python は入力 `mirror`・`mirror-token` を足した（aiqh は使わない）。リリースの記述は、機能の追加・修正・依存の更新（v7.0.0 から 22 commit・16 commit）
- 変える行: `.github/workflows/verify.yml:79`（setup-node）・`:92`（setup-python）、`.github/workflows/ci.yml:36`・`:65`（setup-node）。コメント `# v7.1.0` も合わせる
- 変えないもの: `docs/adr/0031-ci-distribution-reusable-workflow-own-source.md` と ROADMAP の過去の版の記録の SHA（書いた時点の記録）。テストは SHA を固定していない（`git grep` で 0 件）
- 試し【実測】: 上の 4 行を変えた worktree で、全テストが PASS（`tests/reusable-workflow.test.ts` を含む）。GitHub Actions では、まだ走らせていない（v0.17.1 の PR の run で確かめる）
- 適用先への影響: 再利用ワークフロー `verify.yml` の setup の版が変わるので、適用先が SHA を上げると、その run の setup-node（A・B）と setup-python（B）が v7.1.0 になる（§7）

**更新の手順**（C-10。ADR-0025 の既知の限界「アクションの SHA を更新する手順（いつ・誰が）は決めていない」〈`docs/adr/0025-self-ci-ubuntu-verify-not-required-yet.md:40`〉を閉じる。文案は `adr-0025-addendum-draft-final.md`、手順は ci 手順書 `docs/ops/ci-and-branch-protection.md` の §8 に「8-2 アクションの SHA の更新」を足す）
- **いつ**（B3-D-Q12）: batch の最初の版の着手前の確認で、使っているアクション（今は checkout・setup-node・setup-python）の最新のリリースを見る。ほかに、アクションの勧告・非推奨（実行環境の Node の版の終わりなど）を知ったとき
- **誰が**: 実装する者が、新しい SHA・公開日・`action.yml` の違いの一覧を出し、人間が承認する（依存の更新と同じ扱い。B3-Q5）
- **どう**: タグの ref を `gh api repos/<owner>/<名前>/git/ref/tags/<タグ>` で読み、注釈付きタグ（object の type が `tag`）なら `git/tags/<sha>` で commit まで剥がす。公開から 7 日を満たす版だけ（npm の `min-release-age=7` と同じ考え）。`action.yml` の `runs.using`・入力・出力を前の版と比べる。`uses:` の行は完全な commit SHA と `# vX.Y.Z` のコメント
- **確かめ**: PR の run で必須の 2 つが success。再利用ワークフローの変更は、適用先の SHA を上げるまで適用先には届かない（H11 の回に含める）
- **記録**: CHANGELOG に前と後の SHA と版

### 2.5 C-50: 文書の古い現在形

**線引きの規則**（案。B3-D-Q11）:
1. **直す所**: 今の状態を書く文書（`README.md`・`docs/ARCHITECTURE.md`・`docs/CONFIG_SPEC.md`・`docs/ops/*.md`）の、日付も版も注記も無い現在形・予定形の文で、今の事実と違うもの
2. **残す所（経緯）**: `CHANGELOG.md`、ROADMAP の版の記録と「順序の変更」の注記、`docs/reports/`、`docs/reviews/`、ADR の文脈・決定・既知の限界（ADR は注記を足す。本文は変えない）、日付つきの「人間の決定（日付）」の行
3. **残す所（注記済み）**: 後の版の注記がすでに付いていて、注記で今の状態が読める文
4. 直し方: 文を今の事実に書き換える（表の欄・図の札は短く）。書き換えたことは CHANGELOG に 1 行で書く（文書の中に「以前は…」を足さない）

**直す箇所**【実測: 基準の commit の `git grep`（「まだ」「予定」「いまは」「必須チェックではない」「で追加する」「M[0-9] で」）と範囲の洗い出し C-50 の候補を読んだ】:

| 箇所 | 今の文（要約） | 今の事実 | 扱い |
|---|---|---|---|
| `docs/ops/ci-and-branch-protection.md:14` | 表の `verify (ubuntu)` の行の「まだ必須チェックではない（下の §2）」 | v0.9.2 から必須チェック（ADR-0032） | 直す（規則 1） |
| `docs/ops/ci-and-branch-protection.md:15` | 表の `reusable (self)` の行の「必須チェックではない（ROADMAP の項目 44）」 | v0.9.2 から必須チェック | 直す（規則 1） |
| `docs/ARCHITECTURE.md:44` | 図の札「本番（Monitoring / Rollback — M4 で設計テンプレート）」 | 運用テンプレートは `docs/ops/rollback.md`・`docs/ops/monitoring.md`（v0.12.1） | 直す（規則 1。図の札） |
| `docs/CONFIG_SPEC.md:35` | 例の注釈「（M1 で JSON Schema を同梱予定）」 | `aiqh.config.schema.json` を同梱している | 直す（規則 1） |
| `docs/CONFIG_SPEC.md:4` | 「§6 は M1 以降の案」 | §6 は今も実装していない案 | 残す（文は今も正しい） |
| `docs/ARCHITECTURE.md:582` | 「Linux CI は M3 で追加する」 | 同じ行に v0.5.45 の注記がある | 残す（規則 3） |
| `docs/ops/ci-and-branch-protection.md:119` | 「いまは強制されない: 非公開のリポジトリで…」 | 次の行に v0.8.4 の注記がある（Public の後も強制されない） | 残す（規則 3） |
| `docs/ops/ci-and-branch-protection.md:41` | 「人間の決定（2026-10-12）: 最初は必須にしない」 | 日付つきの決定の記録 | 残す（規則 2） |
| `docs/reports/M4_COMPLETION.md:73-83` | 「後に回したもの」の表 | 報告（経緯） | 残す（規則 2） |

- grep の言葉の外の古い現在形は、この表に入っていない [要確認]。実装の段で同じ grep を、docs の commit の前にもう一度走らせる

### 2.6 C-52: lock のルートの `version`（B3-Q9。R2 で書き直し。B3-D-R1-003）

**理由の調べ**【記録】（`git log -S'"version": "0.5.35"' -- package-lock.json`、`package-lock.json` の全 commit のルートの欄、CHANGELOG・ROADMAP・ADR・`docs/reviews/`・プロジェクトの CLAUDE.md、commit のメッセージ）:

| commit | 何の commit | lock のルート | package.json | 記録の要旨 |
|---|---|---|---|---|
| `776a875` | M0 | 0.1.0 | 0.1.0 | — |
| `1e3e18e` | `npm audit fix`（v0.5.19 のころ） | 0.1.0 | 0.5.19 | — |
| `484703f` | source-map-js の更新（v0.5.35 のころ） | 0.5.35 | 0.5.35 | npm がルートの version を `package.json` に揃え、そのまま受け入れた（commit のメッセージ） |
| `4163ad2` | vitest・vite の更新（v0.13.2） | 0.5.35 | 0.13.1 | npm が 0.13.1 に書いた 2 行を 0.5.35 に戻した。「前からの `package.json` との食い違いは、ここでは直さない」（commit のメッセージ） |
| `b62519c` | zod の更新（v0.14.1） | 0.5.35 | 0.14.0 | 「v0.13.2 と同じ」に 0.5.35 に戻した（commit のメッセージ、`CHANGELOG.md:93`） |

- **0.5.35 であることの意味・守る理由は、リポジトリの記録に無い**（記録なし）。各版の CHANGELOG の「`package-lock.json` の `version` は 0.5.35 のまま」は事実の記録で、理由は書かれていない
- v0.13.2 の作業の指示（公開リポジトリの外）の趣旨は「前からの食い違いは、この版では直さない」で、その版の範囲を、承認した依存の変更（lock の 8 項目）に絞るためだった。恒久の決まりではない。v0.14.1 はそれに倣った
- R1 の設計（と、範囲の洗い出しの報告の C-52）が「npm が書いたロックを手で直さない で据え置き」と書いたのは誤り（R1 の §2.6 で訂正済み）

**0.5.35 に頼るもの**【実測】: 無い
- `git grep -n '0\.5\.35'`（CHANGELOG・ROADMAP・`docs/reviews/`・`docs/reports/`・lock の外）の当たりは、過去の版の記録の文（ARCHITECTURE・ADR-0023 の「v0.5.35 で」）だけ
- lock を読むコード・テストは、lock があるか（`src/adapters/context.ts:108`、init の依存の監査の提案）と、パケットでの種類（`src/review/packet.ts:37`、`tests/review-packet.test.ts`）だけ。ルートの version を読むものは無い。CI は `npm ci` だけ

**実測**【実測。付録 A7】: 基準の commit の使い捨ての worktree で、R1 と同じ `npm update vitest @types/node typescript-eslint --save` の後から、3 つの形を作った
- A: `package.json` 0.17.1（v0.17.1 のリリースを想定）、lock のルート 0.5.35（npm の 0.17.0 を手で戻した）
- B1: npm が書いたまま（`package.json` 0.17.0、lock のルート 0.17.0。v0.17.1 の依存の commit の状態）
- B2: B1 から `npm version 0.17.1 --no-git-tag-version`（`package.json` の 1 行と lock のルート 2 行だけが 0.17.1 に。commit もタグも作らない）

| 確かめ | A | B1 | B2 |
|---|---|---|---|
| `npm ci` | exit 0、`added 133 packages`、警告なし、lock は不変 | 同じ | 同じ |
| `node_modules`（133 の package.json の名前と版の指紋） | `da934f80…` | 同じ | 同じ |
| `npm ls --depth=0` | exit 0。ルートの名前の版だけが違う（`package.json` の版） | 同じ | 同じ |
| `npm pack --dry-run --json` | 4 ファイル（LICENSE・README・package.json・設定の JSON Schema。worktree は build していないので `dist/` は無い）、lock は入らない、版 0.17.1 | 4 ファイル、版 0.17.0 | 4 ファイル、版 0.17.1（中身の一覧は A と同じ） |
| その後の `npm install`（引数なし） | **lock のルートの 2 行が 0.5.35 → 0.17.1 に書き直された** | lock は不変 | lock は不変 |
| lint・型検査 | 0 件・0 件 | 0 件・0 件 | 0 件・0 件 |
| 全テスト（187 ファイル・2,822 件） | 2,821 PASS・1 FAIL（版の一致のテスト。下の注） | **2,822 PASS** | 2,821 PASS・1 FAIL（版の一致のテスト。下の注） |

- 注: A と B2 は `package.json` を 0.17.1 にし、CHANGELOG と README は 0.17.0 のまま（リリースの commit の残りの直しを試していない）なので、`tests/regression-m2-1-r2-008-version-consistency.test.ts`（`package.json`・CHANGELOG・README の版の一致）が落ちる。lock とは関係の無い、試し方による失敗。B1 は 3 つが 0.17.0 で揃っている
- **A と B の違いは 1 つだけ**: A の lock は、npm が作り直せない（その後の `npm install` で 2 行の差分が出る）。入る依存・配布物・テストは同じ

**リリースの手順への影響**（B のとき）:
- 今: リリースの commit は `package.json` の `version` を手で上げる。lock は変えない（ルートは 0.5.35 のまま）
- B: リリースの commit で `npm version <新しい版> --no-git-tag-version` を打つ（`package.json` と lock のルート 2 行を同時に上げる。commit とタグは作らない。`preversion` などの script は無い）。lock の全欄の比べで、ルートの 2 行のほかが変わっていないことを確かめる。依存の commit では、npm がそのときの `package.json` の版を書くので、そのまま commit する
- 戻す作業が無くなる（v0.13.2・v0.14.1 のような、依存の commit での 2 行の手の戻し）
- 守り（B3-D-Q15）: 版の一致のテストに、lock のルートの 2 つの version を足す。揃え忘れは、その commit の検証で落ちる
- CHANGELOG: v0.17.1 の項に「lock のルートの version を `package.json` に揃えた（0.5.35 → 0.17.1。以後は `package.json` と同じ）」。過去の版の「0.5.35 のまま」は残す

**結論**: 理由は記録に無く、実測で B に問題は無い → **推奨を B に変えた**（B3-D-Q9）。置き場所は R1 と同じ ADR-0008 の追記（文案は `adr-0008-addendum-draft-final.md`。依存の方針〈`package-lock.json` を管理する〉の続きで、CHANGELOG は記録の場で決まりの場ではない）。手順は ci 手順書 §8 のリリースの手順と依存の更新の手順に書く

### 2.7 batch3 の設計の記録

- `docs/reviews/batch3-design/` に、この段の下書きの最終版（`design-final.md`・`questions-final.md`・ADR の追記の案の最終版）、レビューの原文、`findings-r*.json`、`response-r*.md` を置く（batch2 と同じ形）。依頼文とパケットの ZIP は入れない
- 置く時期は v0.17.1 の docs の commit（設計のレビューを閉じた後）

### 2.8 v0.17.1 の commit の並び（案）

1. 依存の更新（`package-lock.json`。R2: npm が書いたルートの version〈そのときの `package.json` の版 0.17.0〉のまま。B3-D-Q9 の B）
2. Actions の SHA（`.github/workflows/` の 2 ファイル）と更新の手順（ci 手順書 §8・ADR-0025 の追記）
3. 記録と文書（C-01・C-42・C-50・C-52〈ADR-0008 の追記〉・batch3 の設計の記録・ROADMAP）と、lock のルートの version の守りのテスト（B3-D-Q15。この時点で `package.json` と lock はどちらも 0.17.0 なので通る）
4. release（`npm version 0.17.1 --no-git-tag-version` で `package.json` と lock のルートの 2 行を上げる〈R2〉、CHANGELOG、README の状態の行）

- src・`tests/structure/`・禁止文字の集合・実行時の依存は変えない。tests は B3-D-Q15 の守り 1 つだけを足す（R2）。各 commit を SHA 固定の worktree で確かめる（typecheck・lint・全テスト・`npm run verify`）
- 実装の独立レビュー（label `batch3-v0171-impl`）は、リリースの後に 1 回（B3-Q10）

## 3. v0.18.0: node:test の出力パーサ（C-04。ADR-0028 の決定 14）

### 3.1 背景

- `aiqh` は PASS の check の出力を表示しない。パーサのある道具だけ、`parsed:` の行で件数が出る（ADR-0028）
- 適用先 B（pytest）の CI には `parsed: pytest — 444 passed, 1 warning` が出る。適用先 A（node:test）の CI の unit の行には件数が無い（run 40968524524。PASS 1.9 秒の行だけ）【実測】
- node:test のパーサは今は無い（`docs/adr/0011-adapter-boundary.md:56`「node:test の出力のパーサは範囲の外（`npm run test` は `no-parser`）」）
- `aiqh init` は v0.14.0 から node:test を unit として検出する（項目 45。`src/adapters/node.ts:100-177`）

### 3.2 選び方

**規則**（案。B3-D-Q5）: 次のすべてを満たすときだけ `node-test` を選ぶ
1. コマンド（`npm run <script>`・`npm test` なら、今までどおり 1 段だけ解いた script。`src/parse/select.ts:39-47`）を `src/command-words.ts` で単純コマンドに分け、単純コマンドは 1 つ（前に置く `cd <1 語>` だけは認める。pytest の B-1 と同じ。`src/parse/select.ts:144-153`）
2. その単純コマンドを、`aiqh init` の node:test の検出と**同じ規則**（`runsNodeTest`。`src/adapters/node.ts:121-160`）が受け入れる: `名前=値` の前置きに `NODE_OPTIONS` が無い、実行位置の語が印の無い `node`、Node のオプションは値を取る 18 と既知のブールの旗 24 だけ、`--test` がある、名前に `watch` を含むオプション・別のファイルを読むオプションが無い、値を取るオプションの値が欠けていない
3. reporter が読める形: `--test-reporter` が 0 個（既定の spec）か 1 個で値が `spec` か `tap`、かつ `--test-reporter-destination` が 0 個か 1 個で値が `stdout`（B3-D-Q1）
- 満たさないときは選ばない（`not-applicable`・`no-parser`。件数が出ないだけ）
- ほかの道具の「どの語でもよい」規則（`toolsIn`）は変えない。同じコマンドでほかの道具も見つかれば、今までどおり `several-tools`
- `runsNodeTest` は、`src/adapters/node.ts` から新しいモジュール `src/node-command.ts` に移し、init とパーサの選び方の両方が使う（規則は 1 か所。試作で移した。init の出力は変わらない: 既存の項目 45 のテストがすべて PASS〈§6〉）。reporter の値を読む関数 `nodeTestReporters` を同じモジュールに足す
- 理由: node:test の単純コマンドを見分ける規則が、init とパーサで 1 つになる。パーサはそれに B-1 と reporter の条件を足すので、init より狭い（init は script のどこかの単純コマンドが受け入れられれば提案する〈`src/adapters/node.ts:171` の `some`〉。`node --test && echo done` は init では検出され、パーサは選ばない【実測】）。適用先 A の `node --test "tests/**/*.test.ts"` は、引用符の付いた glob が印のある語で、オプションの外。どちらにも受け入れられる【実測】。dot・junit・lcov・自作の reporter・ファイルへの出力は、要約のかたまりを stdout に出さない（§3.4）ので、選ばない（init はこれらも検出する。init の提案は変えない）
- **選び方の例**（テストの表になる。どの行も試作の `selectParser` で確かめた【実測。付録 A5】。右の列の括弧は同じ文の init の検出）

| コマンド（または script） | 選ばれるもの |
|---|---|
| `node --test` | node-test（init: 検出） |
| `node --test tests/a.test.mjs tests/b.test.mjs` | node-test（init: 検出） |
| `npm test`（script が `node --test "tests/**/*.test.ts"`） | node-test（init: 検出） |
| `cd web && node --test` | node-test（B-1 と同じ。init: 検出） |
| `node --test --test-reporter=tap` | node-test（init: 検出） |
| `node --test --test-reporter spec --test-reporter-destination stdout` | node-test（init: 検出） |
| `node --test --experimental-test-coverage` | node-test（要約のかたまりは同じ。§3.4。init: 検出） |
| `node --test --test-reporter=dot` | no-parser（init: 検出） |
| `node --test --test-reporter=spec --test-reporter=tap` | no-parser（reporter が 2 つ。init: 検出） |
| `node --test --test-reporter-destination=out.txt` | no-parser（init: 検出） |
| `node --test && echo done` | no-parser（後ろにほかの単純コマンド。init: 検出） |
| `node --test --watch` | no-parser（init: 検出しない） |
| `NODE_OPTIONS=--x node --test` | no-parser（init: 検出しない） |
| `/usr/bin/node --test` | no-parser（実行位置の語は印の無い `node` だけ。init: 検出しない） |
| `echo node --test` | no-parser（init: 検出しない） |
| `node --test vitest` | several-tools（`toolsIn` が語 `vitest` で vitest も見つける。init: 検出） |
| `npm test`（script が `vitest run`） | vitest（変わらない。init: node:test は検出しない） |

### 3.3 読む範囲

- ADR-0028 の枠のまま: stdout の末尾 1 MiB（`PARSE_INPUT_MAX`）、1 行 4,096 まで（長い行は読まない）、色の制御列を除く（`stripControlSequences`）、時計の確かめ（`PARSE_TIME_LIMIT_MS`）、名前のマスクと上限（50 件・300 文字）
- **切れた stdout は読まない**（R2。B3-D-R1-001）: stdout の先頭が見えていない（runner が 10 MiB を超えた先頭を捨てた、または末尾 1 MiB の窓が先頭を切った）ときは、組を数えずに `unparsed`・`output-truncated`。そのため、パーサへの入力に `stdoutTruncated` を足す（§3.11）
- **stdout だけを読む**: node:test は reporter の出力も、テストの中の `console.log` も、読み込みの失敗の stack も stdout に出した。取った 27 の形（R2 で 2 つ足した）のすべてで stderr は 0 バイト【実測】
- 読み方は 1 行を決まった回数だけ見る（各行で前の 7 行を見る。入れ子の量指定のある正規表現は使わない）。P3（`tests/parse-output.test.ts` の線形の確かめ）に node-test の形を足す

### 3.4 要約の形（S2 の実物。Node v24.13.1、stdout がパイプ）【実測。付録 A1。形の一覧は設計 R2 の添付 `nodetest-forms-r2.md`〈公開リポジトリの外〉。R2 で 2 つの形と終了コードを足した】

- **非 TTY でも既定の reporter は spec**（TAP ではない）。`NO_COLOR=1`（aiqh が check に渡す。`src/runner/env.ts:9`）では色の制御列は無い。`FORCE_COLOR=1` では各行に色の制御列が付く（`stripControlSequences` で除ける）
- **spec の要約のかたまり**: 実行の最後に、次の 8 行がこの順で並ぶ。各行は `U+2139`・空白・語・空白・数（行の頭に空白は無い）
  - `tests <n>`、`suites <n>`、`pass <n>`、`fail <n>`、`cancelled <n>`、`skipped <n>`、`todo <n>`、`duration_ms <小数>`
- **TAP の要約のかたまり**（`--test-reporter=tap`）: 同じ 8 行を `# <語> <数>` で
- **数の関係**: 取ったすべての形で `tests = pass + fail + cancelled + skipped + todo`（suites は数に入らない。失敗した todo は todo に数え、時間切れは cancelled に数える）【実測。Node の数え方の規則は文書・ソースで確かめていない [要確認]】
- **かたまりの後ろ**:
  - 失敗があると、spec は空行の後に `U+2716 failing tests:` の節を出す。各失敗は `test at <場所>`（`<ファイル>:<行>:<列>`。ファイルは作業のディレクトリからの相対）の行と、`U+2716 <名前> (<時間>)`（todo なら後ろに ` # TODO`）の行と、エラーの文・stack の行。失敗した todo と時間切れ（cancelled）もこの節に出る
  - `--experimental-test-coverage` では、かたまりの直後に `U+2139 start of coverage report` から `U+2139 end of coverage report` までの表（各行が `U+2139` で始まる）
- **かたまりの前**:
  - 各テストの行（`U+2714`〈pass〉・`U+2716`〈fail〉・`U+FE63`〈skip〉・`U+25B6`〈suite の始まり〉と名前と時間。入れ子は 2 空白ずつ字下げ）
  - `t.diagnostic()` の行は `U+2139 <文>`（要約の行と同じ印）
  - テストのファイルの中の `console.log` は、spec ではそのまま、TAP では `# ` を付けた行（`# ` で始まる行はさらに `\#` に。TAP の決まり）になる
  - npm script の経由では、先頭に npm の見出し（`> 名前@版 test`・`> node --test`）
- **要約のかたまりが無い形**: dot（`.` と `X` の並びと `Failed tests:` の節だけ）、junit（XML。数は `<!-- tests 6 -->` のようなコメント）、`--test-reporter-destination` でファイルへ（stdout は空）、reporter を 2 つ stdout に（2 つの出力が行の単位で混ざり、8 行が続かない）
- **終了コード**（R2 で取った形を足して記録した）: 失敗か cancelled が 1 件以上で 1、ほかは 0（読み込みの失敗も 1。失敗した todo だけなら 0）。取った 27 の形のすべてで、終了コードは「fail + cancelled が 1 以上なら 1、そうでなければ 0」と同じだった（要約のかたまりの無い形も、その実行の数で同じ）。npm 経由の失敗でも npm は終了コード 1 を返し、stderr には何も出さなかった（npm 11.18.0）【実測】
- **テストのファイルが無い**: すべて 0 のかたまり（`tests 0` … ）だけ。exit 0
- **適用先 A の実物との照合**: できなかった。適用先 A の CI の run（10 本、すべて success）のログには、unit の出力の行が無い（aiqh は PASS の check の出力を表示しない）【実測: run 40968524524 のログ 460 行を語で探して 0 件】。適用先 A の node:test の実物の出力は、この段では取っていない（B3-D-Q7）

### 3.5 読み方（パーサ `src/parse/node-test.ts`。R2 で書き直し）

0. **切れた stdout**（入力の `stdoutTruncated` が真）: 何も数えずに `unparsed`・`output-truncated`（B3-D-R1-001、B3-D-Q2・Q13）
1. **1 段め: 字面の形**（B3-D-R1-002）: stdout のすべての行で、その行を最後の行（`duration_ms`）とする 8 行が、同じ 1 つの印（spec の `U+2139` と空白、または TAP の `# `）・上の順の語・空白・値で並ぶかを見る。値の形は「数字（0〜9）と点（`.`）だけの 1 文字以上」。行の頭に空白は無い。これを満たす 8 行を「組」と呼ぶ
2. 組が 0 個: `unparsed`・`no-summary`
3. 組が 2 個以上: `unparsed`・`unexpected-summary`（2 段めの結果にかかわらず。テストが要約に似た 8 行を出した、reporter が 2 つ、など。どれを信じるか決められない。B3-D-Q2）
4. **2 段め: 値の確かめ**（組が 1 個のとき）。次のどれかを満たさなければ `unexpected-summary`
   - 7 つの数（tests〜todo）が 1〜15 桁の数字だけ（`countOf`。16 桁以上・点を含む値は通らない。pytest の決定 12 と同じ）
   - `duration_ms` が `<数字>` か `<数字>.<数字>`
   - `tests = pass + fail + cancelled + skipped + todo`（B3-D-Q3）
   - 終了コードが「fail + cancelled が 1 以上なら 1、そうでなければ 0」と同じ（終了コードが無い〈止められた〉ときも通らない。B3-D-Q14）
5. 通れば `parsed`。counts は `tests`・`suites`・`pass`・`fail`・`cancelled`・`skipped`・`todo`（この順。`duration_ms` は入れない）
6. items（spec のかたまりのときだけ。B3-D-Q4）: かたまりの後ろの `U+2716 failing tests:` の行から最後までで、`test at <場所>` の行の直後の `U+2716 <名前> (<時間>)` の行を `failed-test`、名前は `<場所> <名前>`（時間の括弧を除く）。後ろに ` # TODO` のあるものは入れない（todo は失敗に数えない）。cancelled はこの節で失敗と区別できないので `failed-test` に入る（counts の cancelled で分かる）。TAP の `not ok` の行は読まない（suite の行と入れ子の行が混ざり、件数と合わない）
- 表示（`src/parse/describe.ts`）: `tests <n> (pass <n>, fail <n>[, cancelled <n>][, skipped <n>][, todo <n>]); suites <n>`（cancelled・skipped・todo は 0 でないときだけ）
  - 例【実測: 試作】: `parsed: node-test — tests 6 (pass 2, fail 3, todo 1); suites 1` と `failed-test: b.test.mjs:5:1 fails assert` など
- 判定・終了コード・check のほかの欄は変わらない（ADR-0028 の P1。`parsed` は表示だけ）

**試作の結果（R1）**【実測。付録 A5】: S2 で取った 25 の出力を R1 の試作のパーサに通した（R2 の試作の結果は §3.12）
- spec・TAP の既定・失敗あり・全部 skip・ファイル 2 つ・npm script・色あり・`--test-isolation=none`・名前の絞り込み・coverage・テストなし・読み込みの失敗・時間切れ（cancelled）: どれも `parsed`、数は出力のかたまりと一致
- 偽の要約の 1 行（テストが `console.log` で `U+2139 tests 99` と `# tests 99` を出した）: 無視して本物のかたまりを読んだ
- dot（2 つ）・junit・ファイルへの出力・reporter 2 つ: `no-summary`（選び方で選ばれない形。パーサに直接渡した場合）
- 名前: 失敗 3 件（todo の失敗は入らない）、時間切れは `failed-test: h.test.mjs:2:1 slow`、読み込みの失敗は `f.test.mjs:1:1 f.test.mjs`

### 3.6 history・ダッシュボード・古い版の読み手

- `src/types.ts` の `PARSER_TOOLS` に `node-test`、`src/parse/read.ts` の `PARSERS`・`COUNT_KEYS` に足す。`aiqh history` とダッシュボードは `PARSER_TOOLS` を回すので、道具ごとの数の行が出る（試作の `aiqh history` で、node-test の 7 つの数の行が出た【実測】）
- `schemaVersion` は 1 のまま（足すだけの変更。ADR-0028 の決定 9）
- **v0.17.x までの `aiqh history` は、`parsed.tool: "node-test"` の入ったレポートを読めない**【実測: 基準の commit の `aiqh history` に、手元の 1 つの history のレポートの unit の `parsed` を node-test の形に変えたものを読ませると、そのファイルが `bad-shape`・`HISTORY INCOMPLETE`・exit 2。変えない元のファイルは exit 0。試作の版は同じファイルを読み、exit 0】。pytest のとき（v0.13.x と v0.14.0。ADR-0028 の決定 12 の「互換」）と同じ形。B3-D-Q6
- review-packet は `latest.json` の知らない値を読まない作り（`parsed` は見ない）【推定: v0.14.0 の pytest と同じ。実装の段で確かめる】

### 3.7 変わる出力

- node:test の check（選ばれる形）: 端末の check の下に `parsed: node-test — …` の行と、失敗の名前の行（最大 10。`CONSOLE_ITEMS_MAX`）。`latest.md` の Parsed Output。`latest.json`・history の `parsed`（`tool: "node-test"`）
- 読まなかったとき: 端末は今までどおり `parsed: node-test — not read (<理由>)`。理由の語は `no-summary`・`unexpected-summary` と、新しい `output-truncated`（R2。stdout が切れた）。`latest.md` の状態の欄は `unparsed (output-truncated)`、`latest.json` の `parsed.reason` は `"output-truncated"`
- ほかの check と、選ばれない node:test の形: 変わらない（今までどおり `not-applicable`・`no-parser`）。ほかのパーサは `stdoutTruncated` を読まないので、切れたときの表示も今までどおり（`parsed (truncated)`）
- `aiqh init` の提案: 変わらない（`runsNodeTest` を移すだけ）

### 3.8 テストの方針（§5 にまとめる）

### 3.9 文書

- ADR-0028 に「追記（v0.18.0: 決定 14 node:test のパーサ）」（文案は `adr-0028-addendum-draft-final.md`）。ADR-0011 の 56 行に注記（node:test のパーサは v0.18.0 で入った）
- `docs/CONFIG_SPEC.md` のパーサの節（§5.3a の後ろ）、`docs/ops/reusable-workflow.md` の §8（CI で件数が出る道具）、README の出力パーサの行、ROADMAP（C-04 は ROADMAP の番号の無い候補。v0.18.0 の項に書く）

### 3.10 既存の利用者（適用先 A・B）への影響【推定】

- 適用先 A: unit の check `npm test` → script `node --test "tests/**/*.test.ts"` は選ばれる形（§3.2）。SHA を上げた後の CI の unit の行の下に `parsed: node-test — tests <n> (…); suites <n>` が出る。判定・終了コード・設定は変わらない
- 適用先 B: 変わらない（pytest のまま）
- 手元で古い版の `aiqh history` を使う利用者だけ、新しい版のレポートを読めない（§3.6）

### 3.11 切れたことの伝わり方（R2 で足した。B3-D-R1-001）

**今**（基準の commit）:
- runner は各ストリームの末尾だけを保持する（既定の上限 10 MiB。`src/runner/execute.ts:27`）。上限を超えると先頭から捨て、`truncated` を立てる（`src/runner/execute.ts:401-418` の `OutputBuffer`）。実行の結果の `stdoutTruncated`・`stderrTruncated` になる（`src/runner/execute.ts:277-278`）
- `parseOutputAs`（`src/parse/read.ts:66-87`）は、それと、パーサの読む窓（末尾 1 MiB。`src/parse/text.ts` の `prepareStream`）の切れを合わせて、`parsed.truncated` に書く（`src/parse/read.ts:67`・`:72`）。表示は `parsed (truncated)`・`(output truncated: read from its end)`（`src/parse/describe.ts:56`・`:64`）
- **パーサ本体には伝わらない**: `parser.parse` に渡すのは `{ stdout, stderr, exitCode }` だけ（`src/parse/read.ts:75`、型は `src/parse/tool.ts:5-10` の `ParserInput`）

**変える形**:
- `ParserInput` に `stdoutTruncated: boolean`（必須）を足す。値は `exec.stdoutTruncated || stdout.truncated`（runner が先頭を捨てた、または窓が先頭を切った）。stderr の切れは入れない（node:test は stdout だけを読む）
- パーサの答えの理由に `output-truncated` を足し（`src/parse/tool.ts` の `ParserAnswer`、定数 `OUTPUT_TRUNCATED`）、`ParseReason`（`src/types.ts:122`）にも足す。`src/parse/read.ts:77` は、今は `no-summary`・`unexpected-summary` 以外の理由を `parser-error` にする（守り）ので、`output-truncated` も通す
- 呼ぶのは `src/parse/read.ts:75` の 1 か所だけ。テストはパーサを直接呼ばず、`parseOutputAs` を通す（`git grep` で確かめた）ので、テストの呼び出しの形は変わらない。テストの差し替えのパーサ（`ReadDeps.parsers`）は入力を読まないので、型の上でも変わらない【実測: 試作の型検査 0 件】
- **ほかのパーサは変えない**: vitest・eslint・npm audit・security-scan・pytest は `stdoutTruncated` を読まない。pytest の要約は stdout の最後の行で、読む窓は末尾を残すので、切れても実行の要約は窓の中にある（テストが要約の後に出力を足す道は無い）。切れたときの表示は今までどおり `parsed (truncated)`
- history: 読み手は `parsed.reason` を読まない（`src/run-history/read.ts:156-161` の `PARSED` に `reason` が無い。zod の object は知らないキーを捨てる）。新しい理由の語は、新旧どちらの `aiqh history` にも影響しない。`output-truncated` は node-test の check にだけ出るので、そのレポートは `tool: "node-test"` のために v0.17.x では元から読めない（§3.6）
- `latest.json` の形: `parsed.reason` の値が 1 つ増えるだけ（`schemaVersion` は 1 のまま。ADR-0028 の決定 9）。レポートの JSON Schema は無い（設定の JSON Schema だけ）

### 3.12 境目の表と、R2 の試作の結果（R2 で足した。B3-D-R1-001・B3-D-R1-002）【実測。付録 A8】

R2 の試作（§3.5 の 0〜6、§3.11 の入力）を v0.17.1 の状態の使い捨ての worktree に入れ、合成の入力（`parseOutputAs` に `stdoutTruncated` と終了コードを渡す）を通した。実装のテスト `tests/parse-node-test.test.ts` の表になる（名前は架空、場所は相対だけ）。

| 行 | 入力 | 期待 | 試作の結果 | |
|---|---|---|---|---|
| a | 切れていない・本物の組だけ | parsed | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1} items=1` | 一致 |
| b | 切れていない・本物の前にテストが出した偽の組 | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| c1 | runner が切った・偽の組だけが見える | output-truncated | `unparsed (output-truncated)` | 一致 |
| c2 | 窓（1 MiB）が切った・本物は窓の外・偽の組が最後 | output-truncated | `unparsed (output-truncated)` | 一致 |
| d1 | runner が切った・本物の組だけが見える | output-truncated（決定どおり） | `unparsed (output-truncated)` | 一致 |
| d2 | 窓が切った・本物の組が最後 | output-truncated（決定どおり） | `unparsed (output-truncated)` | 一致 |
| e01 | 正常な 8 行（値も正しい） | parsed | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1}` | 一致 |
| e02 | 数の 1 行だけ 16 桁、ほかの 7 行は正しい | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| e03 | 16 桁の組と正常な組が共存 | unexpected-summary（2 組） | `unparsed (unexpected-summary)` | 一致 |
| e04 | 15 桁ちょうど（和は合う） | parsed | `parsed {tests:999999999999999,suites:0,pass:999999999999999,fail:0,cancelled:0,skipped:0,todo:0}` | 一致 |
| e05 | 8 行のうち 1 行の語が違う（`passed`） | no-summary（組にならない） | `unparsed (no-summary)` | 一致 |
| e06 | 行の順が違う（fail が pass の前） | no-summary | `unparsed (no-summary)` | 一致 |
| e07 | 印が混ざる（spec と TAP） | no-summary | `unparsed (no-summary)` | 一致 |
| e08 | `duration_ms` が `1.2.3`（形はあるが値が無効） | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| e09 | 数が `1.5` | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| e10 | 和が合わない（tests 7） | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| e11 | 終了コードが合わない（fail 3・exit 0） | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| e12 | 終了コードが無い（止められた） | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| e13 | 8 行が 2 空白の字下げ | no-summary | `unparsed (no-summary)` | 一致 |
| e14 | 7 行（suites の行が無い） | no-summary | `unparsed (no-summary)` | 一致 |
| e15 | TAP の組 | parsed | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1}` | 一致 |
| e16 | 値が空（`duration_ms` の後ろが空白だけ） | no-summary | `unparsed (no-summary)` | 一致 |
| e17 | 先頭の 0（`007`） | parsed（7 として読む） | `parsed {tests:7,suites:0,pass:7,fail:0,cancelled:0,skipped:0,todo:0}` | 一致 |
| e18 | 切れていて組が無い | output-truncated | `unparsed (output-truncated)` | 一致 |
| e19 | 組の前に余分な行（9 行の並び） | parsed | `an extra line before (still one block): parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1}` | 一致 |
| e20 | 正しい組が 2 つ（spec と TAP） | unexpected-summary | `unparsed (unexpected-summary)` | 一致 |
| e21 | 窓（1 MiB）の始まりが組の途中に来る（組の前半が切れ、後半の行が見える） | output-truncated | `unparsed (output-truncated)` | 一致 |

**(f) 取った 27 の形**（取ったときの終了コードで。R1 の試作のパーサと並べた）:

| 形 | 終了コード | R2 の試作 | R1 の試作との比べ |
|---|---|---|---|
| cancel-default | 1 | `parsed {tests:2,suites:0,pass:1,fail:0,cancelled:1,skipped:0,todo:0} items=1` | 同じ |
| cover-default | 0 | `parsed {tests:1,suites:0,pass:1,fail:0,cancelled:0,skipped:0,todo:0}` | 同じ |
| default-fail-nocolorunset | 1 | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1} items=3` | 同じ |
| default-fail | 1 | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1} items=3` | 同じ |
| default-multi | 0 | `parsed {tests:9,suites:2,pass:7,fail:0,cancelled:0,skipped:1,todo:1}` | 同じ |
| default-pass-color | 0 | `parsed {tests:8,suites:2,pass:6,fail:0,cancelled:0,skipped:1,todo:1}` | 同じ |
| default-pass | 0 | `parsed {tests:8,suites:2,pass:6,fail:0,cancelled:0,skipped:1,todo:1}` | 同じ |
| default-skip | 0 | `parsed {tests:2,suites:0,pass:0,fail:0,cancelled:0,skipped:2,todo:0}` | 同じ |
| dot-fail | 1 | `unparsed (no-summary)` | 同じ |
| dot-pass | 0 | `unparsed (no-summary)` | 同じ |
| empty-default | 0 | `parsed {tests:0,suites:0,pass:0,fail:0,cancelled:0,skipped:0,todo:0}` | 同じ |
| filter-name | 0 | `parsed {tests:1,suites:2,pass:1,fail:0,cancelled:0,skipped:0,todo:0}` | 同じ |
| forge-default | 1 | `parsed {tests:2,suites:0,pass:1,fail:1,cancelled:0,skipped:0,todo:0} items=1` | 同じ |
| forge-tap | 1 | `parsed {tests:2,suites:0,pass:1,fail:1,cancelled:0,skipped:0,todo:0}` | 同じ |
| junit-fail | 1 | `unparsed (no-summary)` | 同じ |
| loaderr-default | 1 | `parsed {tests:2,suites:0,pass:1,fail:1,cancelled:0,skipped:0,todo:0} items=1` | 同じ |
| npm-test-fail | 1 | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1} items=3` | 同じ |
| npm-test-pass | 0 | `parsed {tests:8,suites:2,pass:6,fail:0,cancelled:0,skipped:1,todo:1}` | 同じ |
| reporter-to-file | 0 | `unparsed (no-summary)` | 同じ |
| spec-fail | 1 | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1} items=3` | 同じ |
| spec-isolation-none | 1 | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1} items=3` | 同じ |
| spec-pass | 0 | `parsed {tests:8,suites:2,pass:6,fail:0,cancelled:0,skipped:1,todo:1}` | 同じ |
| tap-fail | 1 | `parsed {tests:6,suites:1,pass:2,fail:3,cancelled:0,skipped:0,todo:1}` | 同じ |
| tap-pass | 0 | `parsed {tests:8,suites:2,pass:6,fail:0,cancelled:0,skipped:1,todo:1}` | 同じ |
| tap-skip | 0 | `parsed {tests:2,suites:0,pass:0,fail:0,cancelled:0,skipped:2,todo:0}` | 同じ |
| todofail-default | 0 | `parsed {tests:2,suites:0,pass:1,fail:0,cancelled:0,skipped:0,todo:1}` | 同じ |
| two-reporters | 1 | `unparsed (no-summary)` | 同じ |

- 27 の形のすべてで、R2 の試作は R1 の試作と同じ結果（`parsed` の数・名前の件数、`no-summary`）。切れた形は無い（どの出力も 1 MiB より小さい）ので `output-truncated` は出ない。終了コードとの一致（B3-D-Q14）で読まなくなった形は無い

### 3.13 件数が出なくなる条件（最終で足した。B3-D-R2-001）【実測。付録 A9】

規則（§3.5 の 0: stdout が切れたら読まない）は変えない（人間の決定）。どの条件で件数が出なくなるかを測り、境目を固定した。

**条件**: 次のどちらかのとき、node:test の check の `parsed` は `unparsed`・`output-truncated`（件数は出ない。判定・終了コードは変わらない）
1. stdout が読む窓（末尾 `PARSE_INPUT_MAX` = 1,048,576 UTF-16 単位。`src/parse/text.ts`）より長い
2. runner が stdout の先頭を捨てた（既定の 10 MiB〈バイト〉を超えた。`src/runner/execute.ts:27`）。10 MiB は 1 の窓より大きいので、実際には 1 が先に当たる

- 長さは UTF-16 の単位で数える（バイトではない）。日本語などの名前は 1 文字 1 単位（UTF-8 では 3 バイト）
- 境目ちょうど: stdout が 1,048,576 単位ちょうど（最後に正しい要約、exit 0）なら `parsed`、1 単位多ければ `output-truncated`（`truncated` も真）。runner の切れの印だけ（stdout は小さい）でも `output-truncated`【実測: R2 の試作】

**適用先 A の実物**（追跡外の場所の写し〈`git clone --no-hardlinks`〉、`npm ci` の後、`NO_COLOR=1`・非 TTY・外への通信を止めて、unit の check のコマンド〈`npm test`。script は `node --test …`〉を 1 回。適用先 A のリポジトリには書いていない）:
- stdout 12,422 バイト・125 行・UTF-16 で 5,914 単位（窓の約 0.6%）、stderr 0 バイト、113 件、exit 0
- 要約の 8 行は §3.4 の形と同じ（`U+2139 tests 113` … `U+2139 duration_ms <小数>`）。和（113 = 113 + 0 + 0 + 0 + 0）と終了コード（fail + cancelled = 0 → 0）も合う
- R2 の試作のパーサは `parsed: node-test — tests 113 (pass 113, fail 0); suites 0` と読んだ（B3-D-Q7 の確かめ。実装の段でもう一度取る）

**合成の入力**（名前 46 文字ほどのテスト〈`test 00001 checks one behaviour of the module` の形〉を 1 つのファイルに N 件、1 テストあたり `console.log` を L 行〈1 行 45 文字ほど〉。spec の既定の出力、`NO_COLOR=1`、stdout をファイルへ。どれも exit 0、stderr 0 バイト。結果は R2 の試作のパーサ）:

| テスト件数 | 1 テストの console.log | 終了コード | stdout バイト | 行数 | UTF-16 単位 | 窓 1 MiB を超えるか | runner の 10 MiB を超えるか | R2 の試作の結果 |
|---|---|---|---|---|---|---|---|---|
| 1,000 | 0 行 | 0 | 62,816 | 1,008 | 60,800 | 超えない | 超えない | `parsed tests=1000` |
| 1,000 | 1 行 | 0 | 109,825 | 2,008 | 107,809 | 超えない | 超えない | `parsed tests=1000` |
| 1,000 | 10 行 | 0 | 532,855 | 11,008 | 530,839 | 超えない | 超えない | `parsed tests=1000` |
| 5,000 | 0 行 | 0 | 313,722 | 5,008 | 303,706 | 超えない | 超えない | `parsed tests=5000` |
| 5,000 | 1 行 | 0 | 548,671 | 10,008 | 538,655 | 超えない | 超えない | `parsed tests=5000` |
| 5,000 | 10 行 | 0 | 2,663,704 | 55,008 | 2,653,688 | 超える | 超えない | `unparsed(output-truncated)` |
| 10,000 | 0 行 | 0 | 627,163 | 10,008 | 607,147 | 超えない | 超えない | `parsed tests=10000` |
| 10,000 | 1 行 | 0 | 1,097,201 | 20,008 | 1,077,185 | 超える | 超えない | `unparsed(output-truncated)` |
| 10,000 | 10 行 | 0 | 5,327,143 | 110,008 | 5,307,127 | 超える | 超えない | `unparsed(output-truncated)` |
| 20,000 | 0 行 | 0 | 1,254,375 | 20,008 | 1,214,359 | 超える | 超えない | `unparsed(output-truncated)` |
| 20,000 | 1 行 | 0 | 2,194,100 | 40,008 | 2,154,084 | 超える | 超えない | `unparsed(output-truncated)` |
| 20,000 | 10 行 | 0 | 10,654,204 | 220,008 | 10,614,188 | 超える | 超える | `unparsed(output-truncated)` |
| 50,000 | 0 行 | 0 | 3,135,443 | 50,008 | 3,035,427 | 超える | 超えない | `unparsed(output-truncated)` |
| 50,000 | 1 行 | 0 | 5,484,996 | 100,008 | 5,384,980 | 超える | 超えない | `unparsed(output-truncated)` |
| 50,000 | 10 行 | 0 | 26,635,551 | 550,008 | 26,535,535 | 超える | 超える | `unparsed(output-truncated)` |

| 1 テストの console.log | 1 テストあたりの UTF-16 単位 | 窓 1 MiB の境目（件数の見込み） | 1 テストあたりのバイト | runner 10 MiB の境目（件数の見込み） |
|---|---|---|---|---|
| 0 行 | 60.7 | 約 17,271 件 | 62.7 | 約 167,217 件 |
| 1 行 | 107.7 | 約 9,735 件 | 109.7 | 約 95,586 件 |
| 10 行 | 530.7 | 約 1,975 件 | 532.7 | 約 19,683 件 |

- 1 テストあたりの量は、テストの名前の長さと `console.log` の量で決まる（上の値は、その名前の長さのときの目安）
- 読む窓の境目は、`console.log` 無しで約 17,000 件、1 テスト 1 行で約 9,700 件、10 行で約 2,000 件。runner の 10 MiB の境目はその約 10 倍で、窓が先に当たる
- 適用先 A の今の量（113 件で 5,914 単位）では、1 テストあたり約 52 単位なので、`console.log` が増えなければ約 20,000 件まで件数が出る【推定】

**改善策**（ROADMAP の項目 56。行き先は見張り）: runner が stdout を流しながら（保持する末尾とは別に）、要約の形の組（§3.5 の 1 段め）を全体で数える状態を持ち、全体で 1 組で、その組が末尾の窓にあるときだけ、切れていても読む。偽の組がどこにあっても「全体で 2 組」で見つかるので、R1 の偽の件数を戻さない。runner の作りの変更（出力の保持と並ぶ状態）で、パーサの外に置く
- 候補にしない案: (a) 専用の reporter を別ファイルに出させる（利用者の check のコマンドに reporter と出力先のオプションを足すことになり、aiqh は check のコマンドを変えない〈ADR-0028 の P5、ADR-0005〉。利用者の端末・ログの見え方も変わる）、末尾の窓を大きくするだけ（窓の外に落ちた組を見つけられない形が残る）、最後の組を無条件に信じる（R1 の偽の件数を戻す）
- 選び直すきっかけ: 適用先・利用者の node:test の check で `output-truncated` が出たとき

## 4. v0.18.0: 項目 40（masker の private-key の形の線形化。ADR-0013 の追記）

### 4.1 今の超線形の原因

- `maskSecrets`（`src/security/mask.ts:14-28`）は、private-key のパターン（`src/security/patterns.ts:127`。BEGIN の行の印〈5 つのハイフン・`BEGIN `・ラベル `[A-Z0-9 ]*`・`PRIVATE KEY`・5 つのハイフン〉の後に、遅延の `[\s\S]*?` と END の行の印。フラグ g）を、そのまま `String.prototype.replace` で実行する
- END の印が後ろに無い BEGIN の印のたびに、遅延の `[\s\S]*?` が入力の末尾まで進んで END の印を探し、無いので次の位置に戻る。BEGIN の印が k 個あれば、末尾までの読みが k 回で、BEGIN の行だけを繰り返した入力では時間が入力の長さの 2 乗になる
- 実測:【記録】ROADMAP の項目 40（`docs/ROADMAP.md:877`）で、64 KiB 15 ms、256 KiB 222 ms、1 MiB 3,895 ms（壁時計）。【実測】この段で、正規表現の masker の CPU 時間は 64 KiB 5.1 ms、256 KiB 73.2 ms（4 倍の入力で約 14 倍）
- 今の害は無い: マスクに渡る文字列は、レポートの末尾（64 KiB）と端末の行・パーサの名前（1 行 4,096 以下）。ADR-0028 のパーサが入力全体をマスクせず、名前だけをマスクする理由の 1 つ（`docs/adr/0028-output-parsers-display-only.md:34`）

### 4.2 直し方（項目 35 と同じ形）

- `maskSecrets` は private-key の正規表現を実行せず、`src/security/mask.ts` の `maskPrivateKeys` が、同じ一致と同じ置換（`[REDACTED:private-key]`）を線形の時間で求める。`pattern` は定義として残す（scanner と項目 35 の url-credential と同じ考え。scanner は行の単位の block の読み〈`scanMode: "block"`〉で、この正規表現を使わない。変えない）
- 同じになる理由:
  1. ラベルの文字のクラス `[A-Z0-9 ]` は `PRIVATE KEY` の文字を含むが `-` を含まない。そのため、印 `<頭>[A-Z0-9 ]*PRIVATE KEY-----` が位置 `at` で一致するのは、頭の後ろのラベルの文字の**最も長い連なり**が `PRIVATE KEY` で終わり、その直後に 5 つのハイフンが続くときだけ（連なりの途中で `PRIVATE KEY-----` が始まると、その `-` が連なりの中にあることになり、矛盾する）。連なりを 1 回読めば決まる
  2. 遅延の `[\s\S]*?` は、BEGIN の印の終わり以降で最初に END の印が一致する位置を選ぶ。その位置を、`-----END ` の候補を前から順に 1 の判定で調べて求める
  3. BEGIN の印の終わり `m` 以降に END の印が無ければ、`m` より後ろのどの BEGIN の印の後ろにも END の印は無い。正規表現はそこから先で一致しない。走査はそこで止める
  4. 一致した後は、その終わりから次を探す（g の置換と同じ。一致は重ならない）
- 読む量: BEGIN の候補の連なりは互いに重ならない（各連なりは `-` で終わり、次の候補は `-` で始まる）。END の候補の探索は、一致の終わりから先だけを読む（止まるか一致するかのどちらか）。全体で入力の長さに比例する
- 試作のコード（参考。設計 R2 の添付 `prototype-r2.diff`〈公開リポジトリの外〉。項目 40 の部分は R1 から変えていない）: `markerEnd(text, at, head)`（連なりを読んで印の終わりか -1）と `maskPrivateKeys(text)`（上の 1〜4）。秘密鍵の印は部品（`-----BEGIN `・`-----END `・`PRIVATE KEY`・`-----`）から組み立て、ソースに BEGIN・END の行の全体を書かない（自己の security の走査に当たらないように）

### 4.3 結果の同値をテストで固定する

- `tests/regression-backlog35-url-credential-linear.test.ts` と同じ形: 今の正規表現を、テストのファイルの中に「正解」として写して持つ（`SECRET_PATTERNS` の private-key の `pattern` の source と flags から作る。テストのファイルに印の全体を書かない）。`maskSecrets` の出力が、private-key の段だけ正解の正規表現に差し替えた masker と完全に一致することを確かめる
- 入力:
  - 固定の seed のランダムな入力: 部品（BEGIN・END の頭、ラベルの語〈`RSA `・`EC `・`OPENSSH `〉、`PRIVATE KEY`、ハイフン 4・5・6 個、`PRIVATE`・` KEY` の片方、改行、英字・数字・空白、`BEGIN` だけ・`END` だけ）を 1〜14 個つないだもの。試作で 200,000 個、違い 0【実測】
  - 狙った入力: BEGIN の入れ子（BEGIN・BEGIN・END）、END が先、空のラベル、ラベルの中の `PRIVATE KEY`（`PRIVATE KEY PRIVATE KEY` の後に 5 つのハイフン）、ハイフンが 4 個・6 個、CRLF、BEGIN だけ・END だけの繰り返し、一致が 2 つ続く、一致の後に BEGIN だけ、ほかの秘密の形（url-credential など）と並ぶ
  - 既存の入力: `tests/regex-equivalence-inputs.ts:70-87` の private-key の入力（12 のラベル × 4 の END のラベル × 5 の本文 × 3 の形〈END あり・END なし・BEGIN 2 回〉と、PEM のほかの種類の 6 つ）も通す（項目 35 のテストが url-credential の入力を使い回すのと同じ）
  - 直す前の commit でも PASS する（直す前は、正解が masker そのもの）。同値の確かめなので、直す前の FAIL は記録しない（項目 35 と同じ）
- 時間（B3-D-Q8）: 53-F の形（`docs/ops/ci-and-branch-protection.md` の 8-1）。BEGIN の行だけの繰り返しの 256 KiB と 1 MiB を 3 回ずつ `maskSecrets` に通し、そのスレッドの CPU 時間（`process.threadCpuUsage()`）の最小どうしで `t(1 MiB) ≤ 8 × t(256 KiB) + 20 ms`。試作は 256 KiB 1.6 ms、1 MiB 6.2 ms（約 3.9 倍）【実測】。直す前は 4 倍の入力で約 14 倍（64 KiB → 256 KiB）で、1 MiB は数秒【記録・実測】なので、比の確かめは直す前に FAIL する見込み【推定】。待つ時間はテストの timeout（T3 の式）が受け持つ
- 線形の形の確かめ: END だけの繰り返し、ラベルの文字の長い連なり（`PRIVATE KEY` で終わらない）、BEGIN の印の後に END の頭だけの繰り返し、も同じ比で確かめる（走査の弱点を狙った形。項目 35 の「走査の弱点を狙った 6 つの形」と同じ考え）

### 4.4 変わる出力

- 変わらない（同じ一致と同じ置換）。速さだけが変わる

## 5. テストの計画

### 5.1 v0.17.1

- R2: B3-D-Q15 の A なら、`tests/regression-m2-1-r2-008-version-consistency.test.ts` に「lock のルートの 2 つの `version` が `package.json` の `version` と同じ」を足す（基準の commit では 0.5.35 と 0.17.0 で落ちる。依存の commit の後〈どちらも 0.17.0〉に PASS）。ほかに新しいテストは無い。既存のテストの期待値は変わらない（§6）
- 確かめ: 各 commit の SHA 固定の worktree で typecheck・lint・全テスト・`npm run verify`。PR の run で必須の 2 つ（setup-node・setup-python の新しい SHA を CI で初めて使う）

### 5.2 v0.18.0（テストを先に書き、直す前の commit〈v0.17.1 の release の commit〉の SHA 固定の worktree で FAIL を記録する）

| テスト（案） | 中身 | 直す前の見込み |
|---|---|---|
| `tests/parse-node-test.test.ts`（新規） | §3.4 の形ごとの fixture（合成。名前は架空。場所の文字列は相対だけ）を `parseOutputAs("node-test", …)` に、取ったときの終了コードで通す: spec・TAP・失敗あり・全部 skip・テストなし・coverage・npm の見出し・色・読み込みの失敗・cancelled・失敗した todo だけ・偽の 1 行・TAP の `\#`・dot・junit・空の stdout。名前の形・TODO を入れない・50 件の上限。**R2**: §3.12 の境目の表（e01〜e21）と、切れた・偽の組の 6 行（runner の切れは `stdoutTruncated: true`、窓の切れは 1 MiB を超える stdout） | FAIL（`node-test` が `PARSER_TOOLS` に無い） |
| `tests/parse-output.test.ts`（R2 で足す行） | ほかの 5 つのパーサは `stdoutTruncated` で振る舞いを変えない（同じ出力を、runner の切れの有り無しで通し、`parsed` が `truncated` の欄のほかは同じ）。`parseOutputAs` が `stdoutTruncated` を、runner の切れと窓の切れの両方で真にして渡す（差し替えのパーサで入力を記録して確かめる） | 前者は PASS（守り）、後者は FAIL（今は渡さない） |
| `tests/parse-select.test.ts`（行を足す） | §3.2 の表の各形 | 選ばれる形は FAIL（今は `no-parser`）、選ばれない形は PASS（守り） |
| `tests/parse-verify.test.ts`（行を足す） | node:test の check を持つ verify を通し、`parsed` と端末の行と判定・終了コード（パーサの有り無しで同じ） | FAIL |
| `tests/parse-output.test.ts` の P3 | 道具の一覧（244 行）に `node-test` を足す（線形の確かめ） | 足した行は FAIL |
| `tests/history-read.test.ts` の 331〜346 行 | 道具ごとの fixture の表に `node-test` を足す | §6 のとおり、道具を足すと表が無いと落ちる |
| `tests/regression-item40-private-key-linear.test.ts`（新規） | §4.3 の同値と時間 | 同値は PASS、時間の比は FAIL |
| item 45 の既存のテスト | `runsNodeTest` を移しても、init の提案が同じこと（既存のまま） | PASS（守り） |

**変異の候補**（src をわざと壊し、足したテストが落ちることを確かめる）:
- node:test（R2 で足した）: 切れたときの 0 の段を外す／`stdoutTruncated` に窓の切れだけを入れる（runner の切れを落とす）・runner の切れだけを入れる／組を 2 段めの後で数える（形は合うが値の無効な組を数えない。e03 で落ちる）／終了コードの確かめを外す／終了コードが無いときを 0 とみなす／値の形を数字だけにする（e08・e09 が `no-summary` になる）
- node:test: 選び方で B-1 を外す（後ろの単純コマンドを許す）／reporter の条件を外す（dot を選ぶ）／reporter の数の条件を外す／destination の条件を外す／`runsNodeTest` を通さない（`node` の語だけで選ぶ）／かたまりの印を混ぜてよいとする／順を見ない／7 行で足りるとする／2 つ以上のかたまりで最後を読む／和の確かめを外す／16 桁の確かめを外す／TODO を名前に入れる／場所を付けない／TAP でも名前を読む／`duration_ms` の数の形を見ない
- 項目 40: 「END が無ければ止める」を「次の BEGIN へ進む」にする（結果は同じで、時間の比だけが落ちる形）／連なりの終わりの `PRIVATE KEY` の確かめを外す／ハイフン 5 つの確かめを 4 つにする／END の候補で 1 の判定を外す（頭だけで一致）／一致の後の再開の位置を 1 つ前にする
- 落ちない変異が出たら、その条件だけが区別する入力を足す（v0.14.0 の教訓）

### 5.3 v0.18.0 の受け入れの基準（最終で足した。B3-D-R2-001）

1. §3.12 の表（e01〜e21 と切れた・偽の組の 6 行）と §3.13 の境目のテスト（1,048,576 単位ちょうどで `parsed`、1 単位上で `output-truncated`、runner の切れの印で `output-truncated`、合成の大きな出力〈窓を超える〉で `output-truncated`）が、すべて通る
2. 適用先 A の実物の unit の出力を、実装の段で写しの中でもう一度取り、v0.18.0 のパーサで `parsed`・件数が実物の要約と一致する（stdout の量も記録する）
3. H11 の 4 回目で、適用先 A の CI の unit の行の下に `parsed: node-test — tests <n> …` が出る（`output-truncated` ではない）
4. ADR-0028 の追記・CONFIG_SPEC・README に、件数が出なくなる条件（§3.13）が書かれている

## 6. 既存のテストの期待値が変わるもの

下書きの変更を、基準の commit の使い捨ての worktree に入れ、負荷のゲートの後に lint・型検査・全テスト（`vitest run`）を走らせた（R1 で 2 回、R2 で 1 回。lock の 3 つの形の 3 回は §2.6）【実測。付録 A6・A8】

| 試作の状態 | 入れたもの | lint | 型検査 | 全テスト | 変わる期待値 |
|---|---|---|---|---|---|
| run1（v0.17.1 の状態） | 範囲の中の devDependency（lock だけ。ルートの version は 0.5.35 に戻した）、`verify.yml`・`ci.yml` の setup-node・setup-python の SHA | 0 件 | 0 件 | 187 ファイル・2,822 件 PASS（78 秒。始めの 1 分平均 3.56） | **無し** |
| run2（v0.18.0 の状態。R1） | run1 ＋ node:test のパーサ・選び方（`src/node-command.ts` への移動を含む）・`PARSER_TOOLS`・表示・masker の線形化 | 0 件 | 0 件 | 2,821 件 PASS・**1 件 FAIL**（76 秒。始めの 1 分平均 5.98） | 下の 1 件 |
| run3（v0.18.0 の状態。R2） | v0.17.1 の状態（範囲の中の devDependency、lock のルートは npm が書いた 0.17.0〈B〉、Actions の SHA）＋ R2 の試作（`ParserInput` の `stdoutTruncated`・`ParseReason` の `output-truncated`・2 段の認識・終了コードの確かめ、ほかは R1 と同じ） | 0 件 | 0 件 | 2,821 件 PASS・**1 件 FAIL**（85 秒。始めの 1 分平均 4.47） | R1 と同じ下の 1 件だけ（`ParserInput` に必須の欄を足しても、テストの呼び出しの形は変わらない） |

- **`tests/history-read.test.ts:331-346`**（「COUNT_KEYS covers every key the parsers write (the fixtures of the parsers)」）: `PARSER_TOOLS` のすべての道具について、道具ごとの fixture の表（336〜340 行）から出力を読み、`parsed` になることと、数の鍵が `COUNT_KEYS` にあることを確かめる。表に `node-test` が無いので、空の名前で fixture のディレクトリを読み `EISDIR` で落ちた
  - 直し方: 表に `"node-test": "<node:test の fixture>.stdout.txt"` を足し、fixture を足す（`tests/fixtures/parse/`。合成。名前は架空）。確かめる中身（すべての道具が `parsed`、鍵が `COUNT_KEYS` にある）は変えない。v0.14.0 で pytest を足したときと同じ「守りの追加」（`docs/adr/0028-output-parsers-display-only.md` の決定 12 の影響の節）
- 置き換える決定を守るテストの grep【実測】: node:test を `no-parser` と固定するテストは無い（`node --test` を含むテストは項目 45 の init の検出と語の分け方だけ）。private-key の masker の時間を固定するテストは無い。`tests/parse-output.test.ts:244` の P3 の道具の一覧は明示の配列なので、`node-test` を足さなくても落ちない（足すのは守りの追加。§5.2）
- 項目 40 の masker の下書きで、既存の masker のテスト（`tests/mask.test.ts` の private-key、正規表現の同値のテスト `tests/regression-m2-0r3-001-regex-equivalence.test.ts` など）はすべて PASS。`tests/regex-equivalence-inputs.ts:70-87` の private-key の入力（ラベル・END の欠け・BEGIN の 2 回など）は、項目 40 の同値のテストでも使う
- 走らせていないもの（未確認）: `npm run test:minpath`（最小の PATH）、`npm run verify`、`npm run build` と `verify:dist`、GitHub Actions。v0.18.0 で足すテスト（§5.2）は書いていない（直す前の FAIL の見込みは推定）

## 7. 適用先の SHA を上げる（H11 の 4 回目。v0.18.0 の後に 1 回）の見込み【推定】

| | 適用先 A（node:test） | 適用先 B（pytest） |
|---|---|---|
| 再利用ワークフローの手順 | setup-node が v7.1.0 | setup-node・setup-python が v7.1.0 |
| verify の出力 | unit の行の下に `parsed: node-test — tests <n> (pass <n>, fail <n>…); suites <n>` が増える | 変わらない（`parsed: pytest — …`） |
| security の check | 変わらない（v0.17.0 と同じ src の判断） | 変わらない |
| 判定・終了コード | 変わらない | 変わらない |
| 設定の変更 | 要らない | 要らない |

- 確かめ方は H11 の前の回と同じ（PR の run で `aiqh --version` が 0.18.0、`aiqh source` が `job.workflow_sha` と一致、件数の行）。適用先 A では、unit の `parsed:` の数が適用先の手元のテストの数と合うかも見る

## 8. 版とは別の設定（B3-Q7。この段では行わない）

### 8.1 タグの ruleset

- 今【実測: `gh api repos/<owner>/ai-quality-harness/rulesets`】: ruleset は `main-protection`（target `branch`、active、規則 `deletion`・`non_fast_forward`・`pull_request`・`required_status_checks`、Bypass 0）の 1 つだけ。タグには規則が無い（タグの不変は人の決まりだけ。`docs/ops/ci-and-branch-protection.md:70,114`、`docs/adr/0032-main-requires-pull-requests-two-required-checks.md:32`）
- 設定の案: 新しい ruleset（名前は例 `tag-protection`）、target `tag`、対象 `refs/tags/v*`、規則 `deletion`（タグを消せない）と `update`（同じ名前のタグを別の object に付け替えられない）、作るのは許す（`creation` の規則を付けない。リリースの手順 7 でタグを push するため）、Bypass 0、enforcement `active`
- 手順: 人間の承認の後、`gh api -X POST repos/<owner>/ai-quality-harness/rulesets` に上の JSON（実装の段で、GitHub の文書で規則の名前と欄を確かめてから書く [要確認]）
- 確かめ: (1) `gh api …/rulesets` と `…/rulesets/<id>` で中身を読む（target・include・rules・bypass）、(2) 次の版のタグの push が通る（作るのは許す）。消せないこと・付け替えられないことは、本物のタグで試さない（試すとタグが残るか消える。取り返しがつかない）。GitHub の「rule insights」で、規則に当たった操作の記録を読む [要確認: 公開のリポジトリで読めるか]
- 戻し方: ruleset を `disabled` にする（消さない）

### 8.2 `sha_pinning_required`

- 今【実測: `gh api repos/<owner>/ai-quality-harness/actions/permissions`】: `enabled: true`・`allowed_actions: all`・`sha_pinning_required: false`。aiqh のワークフローの外のアクションの `uses:` は、すべて完全な commit SHA（§2.4）
- 設定の案: `sha_pinning_required: true`（ほかの欄は今のまま）
- **前に確かめること** [要確認]: (1) 同じリポジトリの再利用ワークフローの呼び出し（`ci.yml` の `uses: ./.github/workflows/verify.yml`）が、SHA の固定を求められない（ローカルのパスは対象外）こと、(2) 適用先が aiqh の `verify.yml` を呼ぶときは、適用先のリポジトリの設定が当たり、aiqh の設定は当たらないこと（適用先はすでに完全な SHA で呼んでいる）。GitHub の文書で確かめる
- 手順: 人間の承認の後、`gh api -X PUT repos/<owner>/ai-quality-harness/actions/permissions` に `enabled`・`allowed_actions` と `sha_pinning_required=true`（実装の段で API の欄を確かめる [要確認]）
- 確かめ: (1) GET で `true`、(2) 設定の直後の記録の PR の run で、必須の 2 つが success（ローカルの再利用ワークフローが止まらないこと）。止まったら、すぐ `false` に戻す（main への merge は必須チェックで止まるので、main は壊れない）
- 記録: 2 つの設定は、v0.18.0 の後の記録の PR（または v0.17.1 の後の記録の PR）で ROADMAP の M3 の未チェックの行（`docs/ROADMAP.md:982`）と ci 手順書 §3 に書く

## 9. 確かめていないこと

- node:test の実物の出力は、手元の合成の例（Node v24.13.1、macOS）だけ。適用先 A の実物の出力は取っていない（CI のログに出ない。B3-D-Q7）。Node のほかの版（22・20。非 TTY の既定の reporter が TAP だった版がある [要確認]）、Windows の記号、`--test-shard`・`--test-concurrency` の形は確かめていない
- `tests = pass + fail + cancelled + skipped + todo` と、終了コードの関係（fail + cancelled が 1 以上なら 1）が Node の決まりか（取った 27 の形ではすべて成り立った）[要確認]
- 実行が自分の要約の前に終わった形（テストがプロセスを終わらせる、`--test-isolation=none` で `process.exit` など）の実物は取っていない。合成の入力で、終了コードが無い・合わない組は読まないことだけを確かめた（§3.12）
- `t.diagnostic()` の行が、ある形では spec の出力に出なかった（偽装の例。名前のあるテストの中の diagnostic）。出る条件は確かめていない（パーサの読み方には関係しない: diagnostic の 1 行だけでは 8 行のかたまりにならない）
- GitHub Actions での setup-node・setup-python v7.1.0 の動き（v0.17.1 の PR の run で確かめる）
- タグの ruleset の規則の名前と、`sha_pinning_required` の API とローカルの再利用ワークフローの扱い（GitHub の文書。§8）
- 試作の全テストは、R1 の 2 回（v0.17.1・v0.18.0 の状態）、R2 の lock の 3 つの形（A・B1・B2）、R2 の v0.18.0 の状態の 1 回。`npm run test:minpath` と `npm run verify` は試作では走らせていない
- 外部の文書（Node・GitHub）は通信して読んでいない（リリースの記述と `action.yml` は `gh api` で読んだ）

## 付録 A. この段の測り方（どれも commit しない。作業の記録は git 管理外の `tmp/batch3-design/`）

- A1（§3.4）: `tmp/batch3-design/nodetest/` に依存なしの例（pass・fail・skip・todo・`describe` の入れ子・サブテスト・`t.diagnostic`・テストの中の例外・ファイル 2 つ・読み込みの失敗・時間切れ・coverage・テストなし・偽の要約・npm script）を作り、zsh のスクリプトで `node --test`（と npm script）を stdout・stderr をファイルに向けて走らせた（25 の形）。生の出力は `out-*.txt`・`err-*.txt`（手元の絶対パスを含むので、公開のものには写さない）
- A2（§3.4）: 適用先 A の main の run 40968524524 のログを `gh run view --log` で読み、要約の語で探した（0 件）
- A3（§2.3）: 基準の commit の `git worktree add --detach`、node_modules は `cp -c -R`（APFS の複製）、`npm update vitest @types/node typescript-eslint --save`（npm の cache と log は `tmp/` に向けた）。lock は全欄で比べた（`lock-diff.py`）
- A4（§2.4）: `gh api repos/actions/<名前>/git/ref/tags/<タグ>`・`releases/tags/v7.1.0`・`contents/action.yml?ref=<タグ>`（raw）
- A5（§3.5・§3.6・§4）: 試作の src を worktree に入れ、取った 25 の出力をパーサに通すスクリプト、試作と基準の commit の `aiqh history`、masker の正解の正規表現との比べ（200,000 個）と CPU 時間（`process.threadCpuUsage()`）
- A6（§6）: worktree で、負荷のゲートの後に lint・型検査・`vitest run`（v0.17.1 の状態と v0.18.0 の状態の 2 回）
- A7（§2.6。R2）: 基準の commit の使い捨ての worktree（`node_modules` は APFS の複製）で、R1 と同じ `npm update` の後に、A・B1・B2 の 3 つの形を作り、形ごとに `npm ci`・`npm ls --depth=0`・`node_modules` の指紋（133 の package.json の「パス 名前@版」の SHA-256）・`npm pack --dry-run --json`・`npm install`（引数なし）と lock の比べ、負荷のゲートの後に lint・型検査・全テスト。理由の調べは `git log -S` と、lock の全 commit のルートの欄、記録の grep、commit のメッセージ。要約は設計 R2 の添付 `lock-measurements-r2.md`（公開リポジトリの外。中身は §2.6 の表）
- A8（§3.11・§3.12・§6。R2）: R2 の試作（`stdoutTruncated` を渡す・2 段の認識・終了コード）を、v0.17.1 の状態の使い捨ての worktree に入れ、(a)〜(e) の合成の入力と、(f) 取った 27 の形（取ったときの終了コード）を、R1 の試作のパーサと並べて通した。その後、R1 のパーサを worktree から外して、負荷のゲートの後に lint・型検査・全テスト
- A9（§3.13。最終）: 適用先 A を追跡外の場所に `git clone --no-hardlinks` で写し（push 先は無効な値にした）、`npm ci`（npm の cache は追跡外）。`env -i` で HOME を空のフォルダ・`NO_COLOR=1`・PATH は node と /usr/bin・/bin だけにし、`sandbox-exec` で外への通信を止めて `npm test` を 1 回。合成の入力は `node --test` を 15 通り（件数 5 × `console.log` 3）。どれも stdout をファイルに向け、バイト・行・UTF-16 の単位を数え、R2 の試作のパーサに通した。境目ちょうどの確かめは、合成の文字列を `parseOutputAs` に渡した

## 付録 B. ROADMAP の文の案（実装の版の docs の commit で直す）

- v0.17.0 の項の最後の行（1172 行）の後: 「H11 の 2 回目（v0.15.0。2026-10-25〜26。A は PR #5〈merge `0be71c1`〉、B は PR #3〈merge `b2b6ad5`〉。B は allow の規則を足さず、RGI の外のゼロ幅の文字をソースから除き、テストのデータを記法に書き換えた）と 3 回目（v0.17.0。2026-10-29。A は PR #6〈merge `b4254d6`、main の run 40968524524〉、B は PR #4〈merge `a957b3b`、main の run 40968611980〉）で、適用先 A・B の呼び出しは v0.17.0 になった。merge はどちらも人の手」
- 項目 42（879 行）: 見張りの値に batch3 の範囲の洗い出しの値（直近の main の 10 本で 18.7〜30.0%）を足す（v0.17.1 の項）
- 項目 50（887 行）: 変えない（B3-Q2: 見張りのまま）
- 項目 40（877 行）: v0.18.0 で取り消し線と解消の記録（§4）
- M3 の未チェックの行（982 行）: 設定の後の記録の PR で（§8）
- 新しい項目 56（最終で足した。B3-D-R2-001）: 「**node:test の要約を、stdout が読む窓を超えても安全に読む**（v0.17.1 で項目にした。batch3 の設計〈最終〉§3.13、独立レビュー B3-D-R2-001。Low〜Medium）。v0.18.0 の node:test のパーサは、stdout が読む窓（末尾 1,048,576 UTF-16 単位）より長いか runner が先頭を捨てたとき、末尾に正しい要約があっても件数を出さない（`output-truncated`）。名前 46 文字ほどのテストで、`console.log` 無しで約 17,000 件、1 テスト 1 行で約 9,700 件、10 行で約 2,000 件を超えると件数が出ない（設計の段の実測）。案: runner が stdout を流しながら、要約の形の組を全体で数える状態を持ち、全体で 1 組で末尾の窓にあるときだけ読む。専用の reporter を別ファイルに出させる案はコマンドを書き換えるので採らない。窓を大きくするだけ・最後の組を無条件に信じる案も採らない。行き先: 見張り（node:test の check で `output-truncated` が出たら選び直す）」
- C-04（node:test のパーサ）は ROADMAP の番号の無い候補。v0.18.0 の項に書く
