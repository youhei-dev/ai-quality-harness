# batch5-design の独立レビュー 3 回目への応答（response-r3）— 設計（最終）

- 状態: 確定（batch5 の記録の PR〈版なし。2026-11-08。branch `docs/batch5-design-record`〉の設計の記録の commit で、`docs/reviews/batch5-design/` に、取り込みの結果とともに入れた）
- 対象レビュー: 受領ファイル名 `independent-review-batch5-design-r3-for-claude.md`（2026-11-08 受領、10,010 バイト・79 行、SHA-256 `4d1518e5e8d051986da532e862c51a0cd0c7a49b12188c5bf225a9b2bf51346d`）。R1・R2 と同じく、ChatGPT の画面の本文を人が claude.ai に貼り、claude.ai の側で作った写しの見込みで、原文とのバイト一致は確かめられない（本文の最後の `~~~~markdown` のブロックも無い）
  - 取り込み: `aiqh review-import ~/Downloads/independent-review-batch5-design-r3-for-claude.md --label batch5-design --round 3 --id-prefix B5-D`。exit 0、`findings-r3.json` に 0 件、`previous` に R2 の 1 件の評価（「解消」）
  - 収録の形: `review-r3.md` は、先頭に収録の注記を置き、その後に原文を一字も変えずに置いた
- 対象: 設計 R3（`design-r3.md`。公開の外）と同じ中身の設計（最終）、決めたこと（最終。B5-D-Q1〜B5-D-Q9）、最終の文案 4 つ、R1・R2 への応答、参照と中身の照らし（`ref-check-r3.md`）、R2 → R3 の差分（公開の外）、添付 2 つ。レビュアーは、資料を 1 つにつないだ Markdown を読んだ（ZIP とのバイト一致は確かめられなかった、とレビュアーが書いた）
- 対応日: 2026-11-08
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**。新しい指摘は無い。R2 の 1 件は「解消」、R1 の 2 件は本文で「解消を維持」

## 判定表

指摘は 0 件（判定する項目は無い）。

## R2 の 1 件の評価（`findings-r3.json` の `previous`）と、R1 の 2 件の評価（本文）

| ID | R3 の評価 | この記録の PR での状態 |
|---|---|---|
| B5-D-R2-001 | 解消（`previous`） | deferred（v0.18.3。ADR-0008 の追記が v0.18.3 に入るため） |
| B5-D-R1-001 | 解消を維持（本文の問い 2） | deferred（v0.18.3） |
| B5-D-R1-002 | 解消を維持（本文の問い 2） | resolved（`f901670`） |

## 人間の決定（2026-11-08）

- 設計のレビューは R3 で終える（依頼文に先に書いた基準: High・Medium が 0）。設計（最終）・決めたこと（最終）・最終の文案 4 つを、実装の段の正本にする
- 設計の問い B5-D-Q1〜B5-D-Q9 は、すべて A（`questions-final.md`）
- v0.18.3 の 4 commit を分け直し、依存と関係のない記録と設計の記録を、この記録の PR に先に入れた（`split-note.md`）

## 実装の段の確かめとして挙げられたこと（指摘ではない）と、この記録の PR での扱い

| 挙げられたこと | 扱い |
|---|---|
| 置き換えの単位を見つけるための元の名前との対応表は作業場所だけに置き、公開の報告や成果物に残さない | 対応表は作業の場所（git の追跡外）だけに置いた。commit・PR の本文・この記録には元の名前を書いていない（置き換えた後の走査で、追跡している 637 ファイルに元の名前は 0 件） |
| `git diff --cached --numstat` の行数だけで 27 行と判定せず、位置ごとに対応付ける | 1 つ目の commit の前に、stage した差分を hunk ごとに読み、27 の位置がちょうど変わったこと、ほかに変わった HEAD の行は決めた 3 行（ci 手順書の 3 行目と ADR の一覧の 2 行）だけであること、27 行それぞれで置き換えた単位を印に替えた前と後が文字列として同じことを確かめた（設計〈最終〉§2.2.2 の確かめ 1〜5。`split-note.md`） |
| 変更後の 2 行（v0.18.4 の golden）を、入力と実ファイルの双方から照合する | v0.18.4 の実装レビューで頼む（設計〈最終〉§4.1 の 3。この記録の PR の範囲の外） |

## review-check

`aiqh review-check --label batch5-design`（この記録の PR の設計の記録の commit の作業ツリー）: exit 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`、警告 0（R1: resolved 1・deferred 1。R2: deferred 1。R3: 0 件）。
