# M0 独立レビュー R5 への対応記録（response-r5）

- 対象レビュー: `docs/reviews/m0/independent-review-r5.md`（R5-001〜R5-004、R4-001〜R4-003 の再判定、v0.1.3 → v0.1.4 のタグ運用への助言。対象コミット 37a5b50 = v0.1.4）
- ファイル名の経緯: 受領したファイルは `independent-review-m1-r1-for-claude.md` だったが、これは人間側の命名誤りで内容は M0 の R5 である。docs へは `independent-review-r5.md` としてコピーした（原文は変更なし、`cmp` で一致）
- 対応日: 2026-09-16
- 人間の判断: R5 の 4 件を修正して `v0.1.5` を付け、M0 を完了とする。R6 は行わず、残る論点は M1 以降のレビューで扱う

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード | 行き先 |
|----|--------|------|------|-----------------|------------|------------|--------|
| R5-001 | High | VALID | 修正済み | 修正前の `swapHandlersToFinalized()` は各シグナルで `process.off(旧)` → `process.on(新)` の順で、間に listener 0 件の瞬間があった（Node は既定動作に戻る）。修正: ヘルパー `swapSignalHandlers(from, to, { betweenAddAndRemove })` を `src/cli-signals.ts` に切り出し、**新ハンドラを `process.on()` で登録してから旧ハンドラを `process.off()`** する順に変更。確定済みハンドラは無名関数ではなく参照（`afterHandlers`）を保持。内部フック `betweenAddAndRemove` は関数引数のみで、設定スキーマ（`strictObject`）・`aiqh.config.jsonc`・CLI 引数から到達不可（cli.ts は渡さない、grep で確認） | `tests/regression-r5-signals.test.ts` 1 件: フック内で `process.listenerCount("SIGINT")` / `"SIGTERM"` が常に 1 以上。修正前（off → on）は `expected 0 to be >= 1` で FAIL | テスト終了後にリスナー数が開始時と同じであることを `afterEach` で assert（他テストの実 CLI シグナル検証に影響しない） | M0 |
| R5-002 | Medium | 文書対応 | 表現を観測可能な意味論に変更（コード不変） | コメント（`yieldFullIteration`、確定点）と `docs/ARCHITECTURE.md` の「確定点直前のシグナルを確実に拾う」を、「全チェック完了後、イベントループを 1 周（poll フェーズを含む）回した時点までに Node が JS へ配送したシグナルは中断として扱う。それより後に到着し未配送のシグナルは確定後のシグナルとして扱い、検証結果を変えない。OS への到着時刻を基準とした完全な保証は JS のイベントループだけでは提供しない」に置き換え。2 回 yield の実装は不変 | なし | 既存の R4-001 テスト（2 件）維持 | M0（文書） |
| R5-003 | Medium | 文書対応（案 A） | 2 つの確定点を分けて記述（コード構造不変、コールバック改名） | `docs/ARCHITECTURE.md` §9.2 / §10 を「検証結果（verdict）の確定点」（全チェック完了＋1 周 yield 後。以降のシグナルは verdict を変えない）と「CLI の終了結果」（レポート書込成功後に 0 / 1、失敗時は R-007 どおり `VERIFY ERROR (report write error)`・exit 2）に整理し、「確定点以降は終了コードも 0 / 1 に固定」を削除。コールバック `onFinalized` を **`onVerdictFixed`** に改名（verify.ts / cli.ts / `tests/regression-r4-finalize.test.ts` を同じ commit で追随）。パケットの Architecture Decisions も次回以降は同じ表現（verdict の確定点と CLI 終了結果を分ける）にする | なし | 既存の R4-001 ガード（確定後のシグナルで exit 0 / PASSED）維持 | M0（文書） |
| R5-004 | Low | VALID | 修正済み | 修正前は超過分を `subarray(excess)` でバイト位置のまま切り、UTF-8 の継続バイトから始まると先頭文字が U+FFFD になり再エンコード長が上限を超え得た。修正: 切り詰め後、先頭が継続バイト（0x80〜0xBF）である間は最大 3 バイトまで追加で捨てて境界に揃える（`OutputBuffer.push` / `dropFront`）。`docs/ARCHITECTURE.md`、`docs/adr/0003`、`docs/CONFIG_SPEC.md` に「境界揃えのため最大 3 バイト少なくなることがある」を追記（CONFIG_SPEC に `maxOutputBytes` の項目は無いため出力保持の説明として追記し、拡張案の表に項目を追加） | `tests/regression-r5-utf8-tail.test.ts` 1 件: 「あ」×3000（9,000 バイト）を上限 4,096 で流し、tail が U+FFFD で始まらない・含まない、UTF-8 再エンコード長 ≤ 4,096、`END` で終わる。修正前は `startsWith("�")` が true で FAIL | `tests/regression-r4-output-tail.test.ts`（ASCII 2 件）維持 | M0 |
| タグ運用の助言 | — | 採用 | `CHANGELOG.md` を新設し、v0.1.3 を「superseded — 確定点の yield が不十分。v0.1.4 以降を使用」と明記 | — | — | — | M0 |

INVALID / PARTIAL なし。R-010 / R-011 / R-012 / R-013 の持ち越しは変更なし（M1 以降へ）。

## 回帰テストの実行記録

- 修正前: `npx vitest run tests/regression-r5-*.test.ts` → 2 件 FAIL（R5-001 は現状と同じ順序でヘルパーを切り出した状態で実行）。記録 `tmp/r5-before.txt`
- 修正後: 同 → 2 件 PASS。全体 `npx vitest run` → 23 ファイル 141 件 PASS（既存 139 件 + R5 2 件）を **10 回連続**で確認（`tmp/r5-ten-1..10.txt`）
- 自己 verify の結果は停止ポイント2 の報告に記載

## レビュアーの「見ていない範囲」に対する所見

レビュアーは `review-packet-m0-r4.md` の掲載内容を根拠とし、commit との byte 一致、139 件 × 10 回のログ、verify、tarball、`npm audit`、タグの実在、Linux / Windows、安全弁、masker と hook の一致、未変更ファイルは独立実行していないとしている。R5-001（listener 0 件で exit 130）、R5-002（libuv の poll / check / signal の関係）、R5-004（`"ああ"` の 4 バイト切りで `"�あ"`）はレビュアー側で独立確認済みで、本対応の回帰テストは同じ条件を再現している。
- M0 はこの R5 対応（v0.1.5）で完了とする。残る論点（Linux / Windows、安全弁、masker と hook の一致、OS 到着時刻基準のシグナル保証）は M1 以降のレビューで扱う
