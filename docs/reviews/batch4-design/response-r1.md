# batch4-design の独立レビュー 1 回目への応答（response-r1）— 設計 R2

- 状態: 確定（v0.18.1 の設計の記録の commit で、`docs/reviews/batch4-design/` に、取り込みの結果とともに入れた）
- 取り込み: `aiqh review-import --label batch4-design --round 1 --id-prefix B4-D`（v0.18.1 の branch の CLI。src は v0.18.0 と同じ）。exit 0、`findings-r1.json` に 4 件（`open`）。同じ commit で、4 件を `resolved` にした（下の「状態」）

- 受け取った原文: `independent-review-batch4-design-r1-for-claude.md`（17,074 バイト・142 行、SHA-256 `16e3ff52bf429511d219efb19db1542ff71eab3623777359902ffd54e6215a90`）。ChatGPT のダウンロードが失敗したため、本文をチャットから人間が保存したもの。同じ名前の別のファイル（`(1)` など）は無かった
- JSON のブロック（読むだけ。取り込みはしていない）: `aiqh-findings` のブロックは 1 つ、`label` は `batch4-design`、`round` は 1、指摘 4 件（`B4-D-R1-001`〜`004`。Medium 3・Low 1）、`summary` と件数の行（`件数: High 0 / Medium 3 / Low 1`）が合う、`previous` は無い。生の制御文字・文字参照・HTML の形は 0
- レビュアーが読んだもの: ZIP ではなく、32 のファイルを 1 つにつないだ `review-packet-batch4-design-r1-all.md`（各ファイルの前に `===== FILE: ./<パス> =====` の見出し。人間が作った）。照らした結果: 見出し 32、ZIP の 32 の中身と 1 対 1、各ファイルの本文は ZIP の中身とバイト単位で同じ（違いは前後に足された改行だけ。並びの順は ZIP と違う）。UTF-8 で読める（415,361 バイト、SHA-256 `f0ed2b43b5fa4b1ff2074b7b1ab73e3ddfbd835b872afaed81bf1df79fc84ad8`）
- 人間の決定（2026-11-07）: B4-D-Q1〜B4-D-Q15 はすべて A。B4-Q2 を決め直し（1c は使い方の誤り〈exit 2〉）。互換性の変更は ADR・README・`--help` に書く

## 指摘ごとの判断

| 指摘 | 重要度 | 判断 | 確かめたこと（正本・実測） | 直した所 |
|---|---|---|---|---|
| B4-D-R1-001（golden の `latest.md` が、`writeReports` が書くファイルのバイト列ではない） | Medium | **採用** | 正本: `src/report/write.ts:104-108` の `writeAtomic` は、Markdown を `escapeForDisplay(content, "keep")`、JSON を `escapeRawCharsAsJson` に通してから書く。実測（付録 A6、`golden-probe-r2.md`）: 基準のコードで、試しの `plain`・`edge` を `writeReports` に書かせると、`renderMarkdown` の返り値と書かれた `latest.md` は、生の文字（ESC・U+202E）を含む stderr の行だけが違った（`plain` 1 行、`edge` 4 行。行の数は同じ。ファイルに生の文字は 0）。`latest.json` は `jsonForFile` の返り値に改行を足したものと同じ、history のファイルも同じ | 設計 §2.4.2（書かれたファイルの Buffer を比べる。history も）、§2.4.3（入力を具体的にし、C-44 の変わる行を書き込みの変換の後で数え直した: 10 行）、§2.4.4（期待値は表記だけ）、§5、§3.4 の M14、ADR-0003 の追記の案 r2 の決定 1・4 |
| B4-D-R1-002（`git tag --no-contains origin/main` で手元だけのタグを見る手順） | Medium | **採用（根拠の向きは逆。結論は成り立つ）** | 実測（付録 A7）: `git tag -l 'v*' --no-contains origin/main` は 98 個のタグを**すべて**出した（v0.18.0 も。v0.18.0 は origin/main の祖先）。`--contains origin/main` は 0。つまり、根拠の文「origin/main の祖先を指す release タグは通常この一覧に出ない」は逆で、祖先を指すタグはむしろ全部出る。一方、`git for-each-ref --no-contains origin/main` は、origin/main 自身を指す ref（`refs/remotes/origin/main`・`refs/heads/main`）を外し、`--contains` で出した。だから、この形では、**手元の HEAD（merge の commit = origin/main）に誤って付けたタグが一覧から外れる**。「手元だけのタグを正しく見分けられない」という結論は、別の理由で成り立つ。`git ls-remote --tags --refs` は剥がした行（`^{}`）を出さない（98 行。`--refs` 無しは 196 行）。手元の `refs/tags/v*` との名前の集合は、今は同じ | 設計 §2.2 の 3（名前の集合の比べ・送る対象の 5 点・使わない形とその理由）、付録 B.1 |
| B4-D-R1-003（push の結果が不確定なとき） | Medium | **採用** | 正本（設計 R1）: §2.2 の 6 は「断られたら止まる」、§2.6 は「断られたら: タグはできない」と書き、送った後に応答だけが失われた場合を区別していなかった。push の終了コードだけでは、リモートに ref が無いことを示せない | 設計 §2.2 の 5・6（送り直さず止まり、`git ls-remote` の読み取りで「未作成」「正しく作成済み」「別の対象、または確認できない」に分けて知らせる）、§2.6（「タグはできない」を消した）、§5 の v0.18.1 の 5、付録 B.1 |
| B4-D-R1-004（golden の入力の守りが、期待値のファイル頼み） | Low | **採用** | 正本（設計 R1）: §2.4.6 の (b) と ADR-0003 の追記の案 r1 の決定 6 は、期待値のファイル自身の節と形だけを確かめていた。入力を減らして期待値を作り直すと、その確かめも作り直せば通る | 設計 §2.4.3（両方の組に、PASS と FAIL・`.` でない `cwd`・生の文字を含む stderr を必ず入れる）、§2.4.5（期待値を変える commit では、人が差分を読んだことを PR の本文に書く）、§2.4.6（入力の側を固定の数で確かめる。残る限界も書いた）、§5、§3.4 の M15、ADR-0003 の追記の案 r2 の決定 2・5・6 |

## R1 の「指摘なし」の観点に付いていた条件の扱い

| 観点 | 条件 | 扱い |
|---|---|---|
| 問い 2（依存） | moderate 10 件を受け入れる理由と CI での再確認を記録に残す。B4-D-Q1 の A を支持 | 設計 §2.5.3 と ADR-0008 の追記の案 r2 の決定 5（理由: 開発用の lint の系統だけ・配布物に入らない・依存元がまだ直った版を許さない。再確認: 各 commit・PR の run・main の run で high 0 と moderate の件数を記録）。B4-D-Q1 は A で確定 |
| 問い 4（C-44） | B4-D-Q6 の A は「表の外ではバックスラッシュが見える」を既知の限界に明記する条件で受け入れ。組み合わせのテスト | 設計 §3.1 の 6（組み合わせのテスト）・7、ADR-0028 の追記の案 r2 の (2)（既知の限界をはっきり書いた） |
| 問い 5（1a・1c） | `Problem` の種類の型に `previous`、CLI の problems の出力の経路を確かめる。同じ原文の再取り込みの早い返りは維持 | 正本で確かめた: 型は `src/review/import.ts:105`（今は 11 種で `previous` は無い）、CLI の出力は `src/commands/review-import.ts:77`・`:167`、再取り込みの早い返りは `:146-161` で、原文の検査（`:166`）より前。設計 §3.3 の 2、ADR-0026 の追記の案 r2 の決定 2 |
| 問い 6（H11） | CI のログの比べは出力の互換の一部の根拠で、`latest.md` の一致の直接の確かめではない。反映の前に設定を取り直す工程と、適用先 A の人間の承認を維持 | 設計 §4 の 2・3・5、§5 の H11 の 1〜3 |
| 問い 7（裏返し） | 1a・1c が今通る入力を拒むことは、意図した互換性の変更として ADR・README・`--help` に書く | 設計 §3.2 の 5・§3.3 の 5、§5 の v0.18.2 の 6、ADR-0026 の追記の案 r2 の「互換性の変更」 |
| 問い 8（見落とし） | 依存の全検証・版の整合・変更前の FAIL と変更後の PASS・既存のレビューの状態の検査・H11 の比較を、受け入れの基準として維持 | 設計 §5 のまま（変えていない） |

## R2 で確かめてほしいこと（依頼文の問いに入れた）

- 4 件の直し方で、指摘が解消したか
- 直したことで新しい穴ができていないか（とくに、書かれたファイルで比べることにした golden と、名前の集合で比べるタグの手順の裏返し）
- B4-D-R1-002 の根拠の向きについての、上の判断（実測）の正しさ
- B4-Q2 の決め直し（1c を exit 2 に）の妥当さ

## 状態（v0.18.1）

| ID | 状態 | fixedIn | 確かめ |
|---|---|---|---|
| B4-D-R1-001 | resolved | golden の commit（`tests/report-golden.test.ts`） | 書かれたファイルの比べの 2 件。変異 M14 で 2 件 FAIL |
| B4-D-R1-004 | resolved | golden の commit | 入力の側の固定の数の 2 件。変異 M15 で 3 件 FAIL（golden の比べは通るのに） |
| B4-D-R1-002 | resolved | docs の commit（ci 手順書 §8 の手順 7 の 3） | 新しい実行のテストは無い（手順の文書）。v0.18.1 のタグの作成で実地に確かめ、記録の PR に書く |
| B4-D-R1-003 | resolved | docs の commit（同じ手順の 6、§3 の「試していないこと」） | 同上 |

（40 桁の SHA は `findings-r1.json` の `fixedIn`）
