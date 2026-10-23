# batch1-v0132-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.13.2 の記録

- 対象レビュー: `docs/reviews/batch1-v0132-impl/review-r1.md`（受領ファイル名 `independent-review-batch1-v0132-impl-r1-for-claude.md`、2026-10-23 受領、8,410 バイト、SHA-256 `d1aa7b1bd912e810602ca4d4e8193469beb4809066717f4b70c69471dbfc6f4d`、
  LF 55 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし / URL なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.13.2（batch1 の 1 版目。ROADMAP の項目 43・41・47-c と B1-Q25、devDependency の更新）。範囲 `a7e4d5300432f4610d49d0fb6b5b9c9c80534514..d1568347c2aafae697e300e0eee6f8d8a2b54951`（8 commit、変わったファイル 49 個。merge の commit は含めない）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-batch1-v0132-impl-r1.zip`（2,007,993 バイト、SHA-256 `6fd08bfcf4fd150a0a728f7d3a8e32624396588a562ee761cde0c73cfb5fd6b9`。中は `review-packet-batch1-v0132-impl.md` の 1 ファイル、2,007,827 バイト、SHA-256 `958bdeff673b733fdfee740aa64647524e8fc0630702104b7850693cbc1c0bcd`）。`package-lock.json` は種類 lock で一覧だけ（全文と差分は無い。依頼文に前後の固定の URL を書いた）
  - 依頼文 `review-request-batch1-v0132-impl-r1.md`（27,290 バイト、SHA-256 `e370355bb2fd03dc07f9bedccbb83f44e3de2ffbc0631a3b45f32cd5df364c27`。問いは 7 つ、読むときの固定の URL は 13 件。パケットの中にバイト単位で同一で入っている）
- 対応日: 2026-10-23
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（指摘なし）。レビュアーはパケットと 13 件の固定の URL を静的に読み、コードとテストは実行していない。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に達したので、**batch1-v0132-impl のレビューは R1 で終える**
- **v0.13.2 の `aiqh review-import` でそのまま取り込めた**: v0.13.2 の記録の PR（branch `docs/v0.13.2-record`）の commit で、`aiqh review-import <受領ファイルの写し> --label batch1-v0132-impl --round 1 --id-prefix B1-I132`（写しは受領ファイルと SHA-256 が同じ）。exit 0、`High 0 / Medium 0 / Low 0; open 0`、最後の 2 行は `REVIEW LOOP: complete` と `REVIEW IMPORT: written`。取り込みの前に、写しを取り込みの検査の本体 `readReview`（ファイルに触れない関数）で確かめた（問題 0 件、指摘 0 件）。`findings` と `previous` は空（label `batch1-v0132-impl` の 1 回目）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## 判定表

指摘が 0 件なので、判定・対応・`fixedIn` は無い（findings の実装者の欄に書くものも無い）。

## 既知の残余として受け入れたもの（新しい指摘ではない）

レビュアーは、結論が設計と固定のコードの静的なレビューであり、負荷のもとで必ず PASS する保証ではないと明記し、次を独立には確かめていない。これらは新しい指摘ではなく、既知の残余として受け入れる（人間の指示 2026-10-23）。

- 負荷のもとの確かめ（項目 41 の順序のテストの 31 回・34 回の PASS、型を読むガードのテストの時間切れ 0 件、parse-output の FAIL の値）と、直す前の順序での 5 回の FAIL: 実装者の記録（CHANGELOG・ROADMAP の v0.13.2 の項）に依る
- `npm audit`: レビュアーは再実行していない。この記録の PR の着手前（2026-10-23）に、`npm audit --audit-level=high` が 0 件であることを実装者が確かめた
- CI のログ: レビュアーは独立に照会していない。PR #14 の run 39884786883 と main の run 39885422340 が success であることは、この記録の PR で `gh run view` で確かめ、CHANGELOG・ROADMAP の v0.13.2 の項に書いた
- `package-lock.json` の全項目の機械的な比較: レビュアーは前後の固定の URL で主な点を照らしたが、全項目の差分・ハッシュの比較はしていない。「版の変化は 8 項目、版の変わらない変化は 2 種類」は実装者の記録（CHANGELOG の v0.13.2 の依存の更新の項）に依る
- **parse-output の壁時計の上限**（問い 7）: レビュアーも、v0.13.2 で解消したとは扱わず、ROADMAP の項目 53 に分けて追跡する扱いを妥当とした。項目 53 で追跡を続ける（この記録で扱いは変えない）

## 問いへの答えの要約（レビュアー。実装者の評価ではない）

1. **41 の順序と 400 ms のテスト**: 指摘なし。`leaderWithDaemon` は `beforeReady` を ready の印の前に実行し、400 ms の停止は印の直後なので、テストが印を見て中断しても SIGTERM の handler の設定の後。新しいテストは `interruptedBy` と SIGKILL の観測を確かめ、`CONFIRM_MS`・偽の alive probe・経過時間の期待を削っていない。固定の URL の残る 5 ファイルに、同じ形の順序は無かった
2. **時間の上限と 19 のケース**: 指摘なし。T3 の 12 倍は観測した最大 10.33 倍を上回る（その 8 CPU の環境の観測に対する余裕で、ほかの環境の保証ではない）。builtin-r3 の 19 の `it` と 19 の ID の固定は、各編集の `createProgram` と型の誤り 0 を保ち、編集の抜けを検出する
3. **43 の守りのテスト**: 指摘なし。`git ls-files -z` を `src`・`scripts`・`tests` に絞り、大文字小文字を区別して確かめる。名前を実行時に組み立てるので、テスト自身が当たらない。件数が 250 を超え `tests/helpers.ts` を含む前提の assert もある
4. **47-c の限界の固定**: 指摘なし。run A の `latest.md` の入れ替えの直前に別の process の run B を書き切り、組が食い違うことを実際に確かめる。テストの名前と文書は「受け入れ・未解決」で、直ったとは扱っていない
5. **near-limit の reporter**: 指摘なし。判定を変える API を呼ばない。50% の境界、25 件での切り捨て、0 件、上限の分からないテスト、UTF-8 の 300 バイトの上限、終わりに 1 度の stderr への書き込みをテストが確かめる。後続の出力や異常終了で件数の行が失われる限界は、依頼文が明示している
6. **依存の更新**: 指摘なし（独立の確かめの範囲に留保。上の「既知の残余」）。ルートの devDependencies（vitest・vite）と `license`、実行時の依存の名前が変わらないことを、前後の固定の URL で確かめた。vitest は開発・検証のときの動きを変えうるので、「実行時の依存が同じ」は「テストの動きが必ず同じ」と同じではない、と注記した
7. **parse-output の壁時計**: 指摘なし（この版で変えないと決めた既知の限界）。P3 は作業量の時計で線形を確かめ、別に 3,000 ms の壁時計を見るので、強い負荷で後者だけ FAIL した記録と矛盾しない。v0.13.2 で解消したと称してはならないが、項目 53 に分けて追跡する扱いは妥当

## 未確認範囲（レビュアーの原文の要約）

パケットの `review-packet-batch1-v0132-impl.md` と、13 件の固定の URL を読んだ。13 件すべての逐行の完全な監査と、ロックの全項目の機械的な差分はしていない。手元の Node・Vitest でのコードとテストの実行、旧版へのテストの移植、実際の CPU の高い負荷の試験、`npm audit` の再実行、CI のログの独立の確かめ、macOS 固有の process group の再現は実施していない

## 取り込みと review-check

- `aiqh review-import`（v0.13.2。`tool.version` は 0.13.2）: `findings-r1.json`（指摘 0 件）。exit 0、`REVIEW IMPORT: written`
- `aiqh review-check --label batch1-v0132-impl`: R1 は open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）
- `aiqh review-check --label batch1-design`: 前と同じく `REVIEW LOOP: incomplete (open 8)`・`REVIEW CHECK: passed`（open の 8 件は v0.14.0・v0.15.0 で確かめるもので、この記録では触っていない）

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/batch1-v0132-impl/review-r1.md`（原文の収録）・`findings-r1.json`（取り込み）・`response-r1.md`（この記録）
