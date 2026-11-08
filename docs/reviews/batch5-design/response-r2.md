# batch5-design の独立レビュー 2 回目への応答（response-r2）— 設計 R3

- 状態: 確定（batch5 の記録の PR〈版なし。2026-11-08。branch `docs/batch5-design-record`〉の設計の記録の commit で、R1 の後に取り込み、`docs/reviews/batch5-design/` に入れた。設計の段では R3 の添付）
- 取り込み: `aiqh review-import ~/Downloads/independent-review-batch5-design-r2-for-claude.md --label batch5-design --round 2 --id-prefix B5-D`。exit 0、`findings-r2.json` に 1 件（open）、`previous` に R1 の 2 件（どちらも「解消」）。同じ commit で、B5-D-R2-001 を v0.18.3 への deferred にした（下の「状態」）
- 受け取った原文: `independent-review-batch5-design-r2-for-claude.md`（12,931 バイト・104 行、SHA-256 `13247473c6537610ff90559b7a7e6215791cee6e036594f320c234e860fad01c`）。同じ名前の別のファイルは無かった。R1 と同じく、ChatGPT の画面の本文を人が claude.ai に貼り、claude.ai の側で作った写しの見込みで、**ChatGPT の原文と同じかは確かめられない**（本文の最後の `~~~~markdown` のブロックも無い）
- JSON のブロック（読むだけ。作業の場所の写しで読んだ）: `aiqh-findings` のブロックは 1 つ、`schemaVersion` 1、`label` は `batch5-design`、`round` は 2、`summary` は High 0・Medium 1・Low 0、指摘 1 件（`B5-D-R2-001`。Medium・文書・確認済み）、件数の行（`件数: High 0 / Medium 1 / Low 0`）と合う。`previous` は 2 件（`B5-D-R1-001`・`B5-D-R1-002`）で、どちらも「解消」で始まる。生の制御文字・方向の制御・ゼロ幅の文字は 0。適用先の名前は 0
- 取り込みの試し（設計の段。使い捨ての `--cwd` の `docs/reviews/batch5-design/` に、R1 の試しの取り込みの結果〈`findings-r1.json`〉を置いた形。本体の `docs/` には書いていない）: `review-import … --round 2 --id-prefix B5-D` は exit 0（`REVIEW IMPORT: written`、`findings-r2.json`、open 1）。続く `review-check` は exit 0・`REVIEW CHECK: passed`。警告 2（R1 の 2 件が試しでは `open` のままで、R2 が「解消」と評価したため。実装の段で R1 の 2 件を `resolved` にすれば、この形の警告は出ない見込み）
- レビュアーが読んだもの（原文の「実際に読めた範囲」）: ZIP とのバイト一致は確かめられず、md 本体（`review-packet-batch5-design-r2.md`）を読んだ。固定の URL のうち `.github/workflows/ci.yml` と ADR-0001 を開き、GitHub CLI の telemetry の文書と v2.103.3 の公開の仕様も確かめた。ROADMAP・README・CHANGELOG の全文は読んでいない。公開の文の走査の数は、提出した記録によるもの（独立に全件を走査していない）
- 人間の決定（2026-11-08。R2 の後）: B5-D-Q8 = A（R2 の条件つき）、B5-D-Q9 = A。B5-D-R2-001 を直して R3 を頼む（設計 §1・R3 の変更の表）

## 指摘ごとの判断

| 指摘 | 重要度 | 判断 | 確かめたこと（正本・実測） | 直した所 |
|---|---|---|---|---|
| B5-D-R2-001（§2.2 の記録の一覧の 5・6 と §3.4 の文案の参照が R1 のファイル名のまま） | Medium | **採用** | 正本（設計 R2）: §2.2 の 1 は `adr-0028-note-draft-r1.md`、2 は `ci-doc-section3-draft-r1.md`、3・4 は「同」（同じく r1）、5 は `adr-0001-note-draft-r1.md`、6 は `adr-0008-addendum-draft-r1.md`、12 は `adr-0001-note-draft-r2.md`（版が混ざる）、§3.4 は `adr-0028-note-draft-r1.md`。R1 の ADR-0008 の案に D13 は無く、R1 の ADR-0001 の案に名前の置き換えは無い（指摘のとおり）。私が R2 で本文の文を直したとき、表の文案の欄を直し漏らした | 設計 R3 と最終: 冒頭の文案の一覧、§2.2 の 1〜6・12・13、§3.4、§2.1.3 の 1 を、最終の形の文案（`adr-0001-note-draft-final.md`・`adr-0008-addendum-draft-final.md`・`adr-0028-note-draft-final.md`・`ci-doc-section3-draft-final.md`）に統一した。最終の文案は R2 の案を写し、R3 の決定で要る直し（ADR-0001 の (2) に、ほかの ADR の置き換えへの参照）だけを足した。照らしの結果は `ref-check-r3.md`（ファイル名の参照の一覧、実在、R1・R2 の名前の残りの理由、中身の照らし） |

- レビュアーの修正案は「R2 の添付名に統一し、design-final.md に移す際は最終ファイルを指す」。R3 では、R2 の名前を経ずに、設計 R3 と設計（最終）の両方の参照を最終の文案に向けた（R3 のパケットに入る文案は最終の形だけで、R2 の案は R2 のパケットにある。R2 の案から最終の案への差は `diff-r2-r3/`）

## R2 が「解消」とした R1 の 2 件

| R1 の指摘 | R2 の評価 | 応答 |
|---|---|---|
| B5-D-R1-001（依存の版の到達） | 解消 | そのまま。設計 R3・最終の §2.1.3 の 2・5（D13）・6・7 と、ADR-0008 の最終の案の決定 3・4 は R2 と同じ中身（参照の書き方だけ直した。`diff-r2-r3/`） |
| B5-D-R1-002（telemetry の実効値） | 解消 | そのまま。設計 R3・最終の §2.1.3 の 1 と、ci 手順書の最終の文案の (3) は R2 と同じ中身（参照の書き方だけ直した） |

- R2 の問い 2 の見方（範囲の外の新しい版や、公開から 7 日に届かない版でも止まるのは、承認の前提が変わったときに人へ返す方針として受け入れる。空の `GH_TELEMETRY` を止める側に置くのは、運用の上の安全側の制限）は、設計を変えずに受け入れた

## R2 の問い 3 の前提（条件）の扱い

| 前提 | 写した所 |
|---|---|
| 過去の記録の文面まで変えるので、名前のほかの文脈を変えないことを差分で確かめる | 設計 §2.2.2 の「置き換える単位」「置き換えの形」と「確かめ」の 2・3（変わった行がちょうど 27 行。各行で、置き換えた単位を印に替えた前と後が文字列として同じ）。`questions-final.md` の B5-D-Q8 の R2 の条件 |
| レビューの原文を変えない | 設計 §2.2.2 の「対象」（原文は対象に無い）と「確かめ」の 5（`git diff --cached --stat -- 'docs/reviews/*/review-r*.md'` が空。findings の JSON も変わらない） |
| 置き換えの後に名前が残らない | 設計 §2.2.2 の「確かめ」の 4（2.2.1 と同じ型で走査して 0 件。メールアドレスの形はテストの `example.invalid` の 37 行だけ） |
| 過去の記録を変えたことを残す | 設計 §2.2.2 の「過去の記録の文面を変えること」（v0.18.3 の CHANGELOG の項に 1 行。名前は書かない）、§8 |

## R3 で直したほかのこと（指摘ではない）

- 人間の決定 B5-D-Q8・B5-D-Q9 を `questions-final.md` に【確定】で足した（Q8 は R2 の条件つき）。`questions-r2.md` は R2 のときの文のまま残した
- 設計 §2.2 の 13、§2.2.2（置き換えの決まりと確かめ）、§2.4 の 2（置き換えの 27 行・11 ファイルを記録の commit に入れる）、§7、§8、付録 A の A6
- 決めたことの一覧の名前を、リポジトリに収録するときの名前（`questions-final.md`）にそろえた（R2 のパケットでは `batch5-questions-final.md` の名前で添付した）

## R3 で確かめてほしいこと（依頼文の問いに入れた）

- B5-D-R2-001 が解消したか
- R1 の 2 件が R3 の形でも解消のままか
- B5-D-Q8・B5-D-Q9 の反映と、その確かめの手順（27 行・単位の外の文字が同じ・レビューの原文を変えない）が十分か
- `design-final.md` が実装の正本として足りるか（参照がすべて実在の最終の形のファイルを指す）
- そのほかの見落とし

## 状態（batch5 の記録の PR〈版なし。2026-11-08。branch `docs/batch5-design-record`〉）

| ID | 状態 | 行き先 | 確かめ |
|---|---|---|---|
| B5-D-R2-001 | deferred（行き先 v0.18.3） | v0.18.3 | 直した先は設計（最終）と最終の文案（この commit で収録）。最終の文案のうち ADR-0001 の (2) と ci 手順書の (1)〜(3) は、この記録の PR の 1 つ目の commit（`f901670`）で入れた。ADR-0008 の追記（D13 と停止の条件）は v0.18.3 に入るので、v0.18.3 の commit で resolved にする。R3 の評価: 解消 |
