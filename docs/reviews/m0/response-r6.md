# M0 独立レビュー R6 への対応記録（response-r6）— 保守修正 v0.1.6

- 対象レビュー: `docs/reviews/m0/independent-review-r6.md`（R6-001〜R6-003、R5-001〜R5-004 の再判定。対象 v0.1.5 = 55e2e0f）
- 対応日: 2026-09-18
- 人間の判断: M0 は v0.1.5 で完了済み。R6 の 3 件を保守修正として反映し `v0.1.6` を付与。R7 は行わない。M1 は v0.1.6 を基準に始める

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード | 行き先 |
|----|--------|------|------|-----------------|------------|------------|--------|
| R6-001 | Medium | VALID | 修正済み | 修正前の `tail()`（`src/runner/run-checks.ts`）は `Buffer.from(out).subarray(buf.length - TAIL_BYTES)` でバイト位置のまま切り、R5-004 の境界揃えは `OutputBuffer.push()` にしか無かった。修正: UTF-8 境界揃えの front-trim を共通ヘルパー `src/runner/utf8-trim.ts`（`isUtf8ContinuationByte` / `utf8LeadingBytesToDrop` / `utf8SafeTail`。純粋関数、Node 標準のみ）に切り出し、`OutputBuffer.push()` と `tail()` の両方から使用。保持量は上限より最大 3 バイト少なくなる（文書化済み） | `tests/regression-r6-tail.test.ts` 2 件: `tail()` 直接（「あ」×30,000 + `\nEND-1`、切断位置が 3 の倍数にならないよう調整）と `toCheckResult()` 経由の stdout / stderr 両方で、U+FFFD を含まない・UTF-8 再エンコード長 ≤ 64KiB・末尾マーカー保持。修正前は先頭が U+FFFD で FAIL | R5-004（`regression-r5-utf8-tail`）と R4 の ASCII tail テスト 2 件を維持 | M0 保守 |
| R6-002 | Medium | VALID（文書） | 修正済み | CHANGELOG の v0.1.0〜v0.1.4 の SHA は 5 件すべて注釈付きタグのオブジェクト SHA（生成時に `git rev-parse --short <tag>` を使った誤り）、v0.1.5 は SHA 未記載。M0_COMPLETION / ROADMAP / README に SHA の記載なし。修正: `vX.Y.Z — commit <peeled SHA> / tag object <SHA>` に統一（突き合わせ表は下記）。プロジェクト CLAUDE.md に「タグの SHA を文書に書くときは `git rev-list -n1 <tag>` の commit SHA を主表記にする」を追記 | なし | — | M0 保守 |
| R6-003 | Low | VALID（文書） | 修正済み | 「差し替え中にシグナルが来ると両ハンドラが実行される」は `review-packet-m0-r5.md` の Known Risks #1 のみに存在（response-r5 / ARCHITECTURE には無し）。修正: 「差し替え中は一時的に 2 リスナーが登録されるが、通常の OS シグナルは非同期に配送されるため、同期的な差し替え完了後のリスナー集合で処理される。内部フック等から同期的に `process.emit()` した場合のみ両リスナーが実行され得る」を `docs/ARCHITECTURE.md` §9.2、`src/cli-signals.ts` のコメント（今後のパケット生成の元）、r5 パケット（記録、管理外）に反映 | なし | R5-001 テスト維持 | M0 保守 |

INVALID / PARTIAL なし。R5-001〜R5-004 のレビュアー再判定は解消 / 妥当。R-010 / R-011 / R-012 / R-013 の持ち越しは変更なし（M1 以降へ）。

## SHA 突き合わせ表（`git rev-list -n1 <tag>` = commit、`git rev-parse <tag>` = タグオブジェクト）

| タグ | commit SHA | タグオブジェクト SHA | 修正前の CHANGELOG | 修正後 |
|---|---|---|---|---|
| v0.1.0 | c80231e | a1e6dba | `a1e6dba`（タグオブジェクト） | `commit c80231e / tag object a1e6dba` |
| v0.1.1 | 29e0f42 | 99dad83 | `99dad83`（同） | `commit 29e0f42 / tag object 99dad83` |
| v0.1.2 | 24ed514 | 677d834 | `677d834`（同） | `commit 24ed514 / tag object 677d834` |
| v0.1.3 | c238f0b | 26806d0 | `26806d0`（同） | `commit c238f0b / tag object 26806d0 — superseded` |
| v0.1.4 | 37a5b50 | 4b7c943 | `4b7c943`（同、レビュアー指摘箇所） | `commit 37a5b50 / tag object 4b7c943` |
| v0.1.5 | 55e2e0f | df678ca | SHA なし | `commit 55e2e0f / tag object df678ca` |
| v0.1.6 | タグ付与後に `git rev-list -n1 v0.1.6` で確認（最終報告に記載） | 同左 | — | `commit <SHA> / tag object <SHA>` |

## 回帰テストの実行記録

- 修正前: `npx vitest run tests/regression-r6-tail.test.ts` → 2 件 FAIL（記録 `tmp/r6-before.txt`）
- 修正後: 同 → 2 件 PASS。全体 `npx vitest run` → 25 ファイル 143 件 PASS を **10 回連続**で確認（`tmp/r6-ten-1..10.txt`）
- 自己 verify の結果は最終報告に記載

## レビュアーの「見ていない範囲」に対する所見

レビュアーは `review-packet-m0-r5.md` を根拠とし、commit との一致、テストログ、verify、tarball、`npm audit`、タグの実在と tag object / commit の対応、Linux / Windows、安全弁、masker と scanner の一致、未変更ファイルは独立実行していないとしている。R6-001（64KiB tail の任意バイト切断と U+FFFD）と R6-003（add-before-remove での通常配送）はレビュアー側で独立確認済み。タグの対応は本記録の突き合わせ表で実測値を示した。残る論点は M1 以降のレビューで扱う。
