# batch4-design の独立レビュー 2 回目への応答（response-r2）— 設計（最終）

- 状態: 確定（v0.18.1 の設計の記録の commit で、`docs/reviews/batch4-design/` に、取り込みの結果とともに入れた）
- 対象レビュー: 受領ファイル名 `independent-review-batch4-design-r2-for-claude.md`（2026-11-07 受領、10,241 バイト、SHA-256 `836b0d380cdbeeed930f6d116baefbaf71a44b42bb0b47ad690ab9bf251f6ee6`）。ChatGPT のダウンロードが失敗したため、本文をチャットから人間が保存したもの
  - 取り込み: `aiqh review-import --label batch4-design --round 2 --id-prefix B4-D`（v0.18.1 の branch の CLI。src は v0.18.0 と同じ）。exit 0、`findings-r2.json` に 0 件、`previous` に R1 の 4 件の評価（4 件とも「解消」）
  - 収録の形: `review-r2.md` は、先頭に収録の注記を置き、その後に原文を一字も変えずに置いた
- 対象: batch4 の設計 R2、決めること R2（残る問い無し）、ADR の追記の案 r2 の 4 つ、R1 への応答、golden の試しの添付。レビュアーは、資料を 1 つにつないだ Markdown（39 ファイル。各ファイルの本文は元のファイルとバイト単位で同じことを確かめてから送った）を読んだ
- 対応日: 2026-11-07
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**。新しい指摘は無い。R1 の 4 件はすべて「解消」

## 判定表

指摘は 0 件（判定する項目は無い）。

## R1 の 4 件の評価（`findings-r2.json` の `previous`）

| ID | R2 の評価 | v0.18.1 の状態 |
|---|---|---|
| B4-D-R1-001 | 解消 | resolved（golden の commit） |
| B4-D-R1-002 | 解消（R1 の根拠の文の向きの訂正も正しい、とレビュアーが書いた） | resolved（docs の commit） |
| B4-D-R1-003 | 解消 | resolved（docs の commit） |
| B4-D-R1-004 | 解消 | resolved（golden の commit） |

## 人間の決定（2026-11-07）

- 設計のレビューは R2 で終える（依頼文に先に書いた基準: High・Medium が 0）
- 設計の問い B4-D-Q1〜B4-D-Q15 は、すべて推奨の A（R1 の後に確定。`questions-final.md`）

## 実装の段の確かめとして挙げられたこと（指摘ではない）と、v0.18.1 での扱い

| 挙げられたこと | v0.18.1 での扱い |
|---|---|
| golden がテストごとに別の一時ディレクトリを使い、後始末すること | `tests/report-golden.test.ts` の `written()` は、`tests/helpers.ts` の `makeTempDir` で組ごとに別のディレクトリを作り、`try`／`finally` で消す |
| history のファイルの名前を決め打ちせず、返されたパスから読むこと | `writeReports` が返した `history` のパスから読み、`latest.json` と比べる |
| 変異を実際に走らせて、落ちることを見ること | M13〜M15 を、golden の commit の使い捨ての worktree で走らせた: M13（Summary の区切りの 1 文字）で 2 件 FAIL、M14（書き込みの変換を抜く）で 2 件 FAIL、M15（入力を減らして期待値を作り直す）で 3 件 FAIL（golden の比べ 2 件は通る）。戻した後は 7 件すべて PASS |

## review-check

`aiqh review-check --label batch4-design`（v0.18.1 の記録の commit の作業ツリー）: exit 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`、警告 0（R1: resolved 4。R2: 0 件）。
