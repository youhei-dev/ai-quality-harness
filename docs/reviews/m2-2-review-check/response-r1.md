# m2-2-review-check の独立レビュー 1 回目への対応記録（response-r1）— v0.7.0 の後（docs だけ）

- 対象レビュー: `docs/reviews/m2-2-review-check/review-r1.md`（受領ファイル名 `independent-review-m2-2-review-check-r1-for-claude.md`、2026-10-14 受領、4,839 バイト、SHA-256 `fdb95d4e31d5dad91b0e3c1169310ac5e886705cc84fb5f76403ebc838338e1a`、
  LF 47 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 名前付きの文字参照・HTML のタグ・コメントなし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.7.0 = commit f9258c838050bd55ab02204555449b439631070e / tag object b6d6755be9f2e8514911f140d04f838377b18cab、範囲 `v0.6.1..v0.7.0`（8 commit、29 ファイル。m2-2-review-import R2 の記録の commit `be551d2`・`3ad0781` を含む）。`aiqh review-check`（review-import の v2。ADR-0027）、review-import のループの行、再修正ループの手順書（`docs/ops/review-loop.md`）、ROADMAP の項目 38（`formatDuration` の繰り上がり）と項目 37（B21-R1-001 のテスト）
- レビュー用に作って人間に渡したもの（ChatGPT への送付は人間が行った）: `aiqh review-packet` のパケット（ラベル `m2-2-review-check`、1,193,136 バイト、SHA-256 `cd5af31aedbb04d66cd9cc336f395fac1a205a299d78f3ab669d0d44fb104da6`。`--doc` で 9 ファイル）と、それだけを入れた ZIP（1,193,302 バイト、SHA-256 `ccf26b0cb48c091bccaf4339326774800371723d6ef5d5970aec3b5677337b40`）。
  依頼文（15,200 バイト、SHA-256 `03b39b52dcf82266ff4c92fd79e1110771c0b77a40ac66ec5e1c99ef6e09b301`）はパケットの中にバイト単位で同一のまま入っている。v0.6.1 で更新したひな形で書いた。問いは 5 つ
- 対応日: 2026-10-14
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（指摘なし）。レビュアーはコード・テストを実行していない（静的な読解のみ）。依頼文に先に書いた基準（High・Medium が 0 なら終える）に達したので、**m2-2-review-check のレビューは R1 で終える**（人間の判断）
- **v0.7.0 の `aiqh review-import` でそのまま取り込めた**（exit 0、`High 0 / Medium 0 / Low 0; open 0`、`REVIEW LOOP: complete`。出力 `findings-r1.json`。source の SHA-256 とバイト数は受領ファイルと一致。`findings` と `previous` は空）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## review-check で見た最初のレビュー

review-check（v0.7.0）ができてから取り込んだ最初のレビューで、取り込みの直後に review-check にかけた最初の回。取り込みの直後の出力（そのまま。終了コード 0、標準エラー出力は空）:

```
aiqh review-check — m2-2-review-check (M2-2-RC), R1 to R1
R1: High 0 / Medium 0 / Low 0; open 0, resolved 0, deferred 0, accepted 0, invalid 0
open: none
warnings: 0
REVIEW LOOP: complete
REVIEW CHECK: passed
```

- 指摘 0 件の回なので、この回で働いたのは、ファイル・名前・回・label・接頭辞・`summary` の検査と表示だけ。状態ごとに要る欄の検査、`fixedIn` の git への問い、前の回の評価の突き合わせは、この回では使われていない（`resolved` も `previous` も 0）
- m2-2-review-import（R1・R2）は、v0.7.0 を作るときに後から review-check にかけた（exit 0・`REVIEW LOOP: complete`・警告 0。`resolved` 3 件の `fixedIn` を git に問うた）

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（状態の欄と `fixedIn` の実在）**: `resolved` に 40 桁の小文字の 16 進の `fixedIn` と空でない `regressionTest` を求め、形の正しい `fixedIn` だけを `workTree` と `isCommitObject` で git に問い、git が失敗すれば誤りにする。`deferred` の `destination`、`accepted`・`invalid` の `note`、状態に合う `verdict` も確かめた。要る欄が無いのに通る経路は特定しなかった
- **問い 2（読めない・欠けた・形の違うファイル）**: `inspectLabel` の名前の形・回の並び・読み取りの結果の検証と、共有した `readFindingsFile`（`lstatSync` で通常のファイルを求め、読み取りの例外・不正な JSON・スキーマ違反をそれぞれ失敗にする）、label・回・接頭辞・ID・`summary`・`previous` の整合を確かめた。既知の異常を「問題なし」とする経路は特定しなかった
- **問い 3（`open` と警告の終了コード）**: 失敗の結果を返すのは形・状態・git・`previous` の検査だけで、`open` の集計と評価の警告は検査を通った後の表示で行う。`open` の数や評価の食い違いが終了コードを変える経路は見つからなかった
- **問い 4（書き込みと文章の端末出力）**: 新しい経路はディレクトリの一覧・ファイルの読み取り・git への問い・出口への表示だけで、書き込みの API は無い。指摘の `content`・`evidence`・`fix`、実装者の自由記述、`previous.assessment` の原文を出す経路は無い。review-import のループの行も固定の形の文字列
- **問い 5（`formatDuration` と B21-R1-001 のテスト）**: 秒未満の分岐は保たれ、繰り上がりは全体を丸めてから分と秒に分ける。境界と繰り上がりのテストを確かめた。B21-R1-001 のテストは、6 万の文字列リテラルの型の union と小さな対照で、公開の `brandGuard()` を通して source 側・target 側の打ち切りの向きと、両方の順序で同じ型を問うたときの件数を確かめる構成と読んだ

## レビュアーの但し書き（指摘ではない）と、実装者の受け止め

- **「`REVIEW LOOP: complete` は全回の `open` が 0 という意味で、レビューの中身の正しさを自動で保証しない」**: そのとおりで、設計どおり。AI の答えを品質保証の根拠にしない（ADR-0026 の D7、ADR-0027 の非目標、`docs/ops/review-loop.md` の原則）。変えない
- **「`formatDuration` は負数・非有限値に新しい保証を付けていない」**: 入力は計測した時間（0 以上の有限の値）。負数・非有限値の扱いは決めておらず、それは前から同じ。手元で v0.6.1 と v0.7.0 の本体を 6 つの値（-1・-1500・-61000・NaN・Infinity・-Infinity）で比べ、出力の文字列はすべて同じだった（今回の直しで変わっていない）。今回の範囲の外。変えない
- **「B21-R1-001 のテストは実行による再現を確かめていない」**: v0.7.0 を作るときに、使い捨ての worktree で `tests/structure/brand-guard.ts` の写しを壊して確かめた（commit していない）。memo に打ち切りの答えを残す → 4 件 FAIL、source 側の向きを逆にする → 4 件 FAIL、target 側の向きを逆にする → 4 件 FAIL、上限を 5,000,000 にする → 5 件 FAIL。テストは CI（v0.7.0 の release commit の push の 2 つの run）でも通っている

## 未確認範囲（原文の要約）

テスト・CLI の独立の実行はしていない。パケットに入っていない `src/cli.ts`・`src/report/write.ts`・`tests/helpers.ts`、ほかの構造ガード、テストの生のログ、実験のスクリプト、実際のリポジトリでの git への問いの結果は見ていない。同時の書き換え、過去の原文との完全な一致、直した commit の意味の妥当性など、依頼文で既知の限界とした項目は再指摘していない。「全入力・全環境での正しさを保証するものではない」とも書いている

## 人間の決定（2026-10-14、R1 を受けて）

- R1 の結果を v0.7.0 の `review-import` で取り込み、原文とこの記録を収録する。High・Medium が 0 なので、取り込み → 記録 → 締めくくり（このレビューを R1 で終える）→ push まで止まらずに進める（指示の「場合 A」）
- ADR-0027 に、R1 の結果と、review-check で見た最初のレビューであることを追記する。ROADMAP の「次:」は、M2-2 の残り（出力パーサ・verify レポートへの警告の構造化・key-value 誤検出の継続記録）の設計の下調べにする

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/m2-2-review-check/review-r1.md`（新規。R1 の原文の収録）
- `docs/reviews/m2-2-review-check/response-r1.md`（新規。この記録）
- `docs/reviews/m2-2-review-check/findings-r1.json`（新規。v0.7.0 の `review-import` で取り込んだまま。指摘が無いので、実装者の欄は書いていない）
- `docs/adr/0027-review-check-state-and-loop.md`: 「追記（R1 の後）」（R1 の結果、review-check で見た最初のレビューの記録）
- `CHANGELOG.md`: v0.7.0 の見出しに commit f9258c838050bd55ab02204555449b439631070e / tag object b6d6755be9f2e8514911f140d04f838377b18cab
- `docs/ROADMAP.md`: v0.7.0 の CI の記録、v0.7.0 の後の記録、「次:」、終わったレビューの一覧
