# ADR-0038: verify の run ごとに一意の名前 `runId` を作り、`latest.json`・`latest.md`・history に同じ値で書く

- 状態: 採用（v0.16.0。ROADMAP の項目 52。batch2 の設計〈最終〉`docs/reviews/batch2-design/design-final.md` の §3 と、この ADR の案〈最終〉`docs/reviews/batch2-design/adr-0038-draft-final.md` を採用した。人間の決定 B2-Q5・B2-Q6〈2026-10-26。推奨どおり〉。設計の独立レビュー R1・R2 は `docs/reviews/batch2-design/`）
- 日付: 2026-10-26（v0.16.0）。案: 2026-10-26（R1・R2・最終）
- 案からの違いは、下の「案（最終）からの違い」。決定の中身は案のまま
- 互換の注意: 知らないキーを捨てる今の読み手（`aiqh history`・review-packet）には後方互換だが、最上位のキーを厳しく照らす外の読み手にとっては変更になる（CHANGELOG に書いた）

## 文脈

- 項目 47（R-010）: 同じ出力のディレクトリに並行して書く verify があると、`latest.json` と `latest.md` が別の run のものになりうる。v0.13.2 で「受け入れ（未解決）」とし、読み手の約束を README（「`latest.json` と `latest.md` を組で読むとき」）・ADR-0003 の注記・ADR-0034 の L に書いた: `startedAt` が違えば確実に別の run、同じでも同じ run の保証はない
- `startedAt` はミリ秒までの時刻（`src/report/build-report.ts` の `buildReport`）。同じミリ秒に始めた別の run は同じ値を持てる。`tests/regression-item47-latest-pair-race.test.ts` の 47-c-3 が、この「見分けられない」を固定している（v0.16.0 で、`runId` で見分けられる形に書き換えた）
- history の名前は秒まで＋ぶつかったときの連番（`src/report/write.ts` の `historyStamp`・`reserveHistoryPath`）で、`latest.*` には書かれない
- 前例: ADR-0033 は、レポートの最上位に `configSha256` を足し、`schemaVersion` を 1 のままにした（足すだけの変更）
- 読み手: `aiqh history`（`src/run-history/read.ts` の `REPORT`）と review-packet（`src/review/packet.ts` の `RENDERED_REPORT`）は、zod の object で、読まないキーを捨てる
- 実測（2026-10-26。batch2 の設計の付録 A7）: 基準の commit の `aiqh history --json` は、aiqh 本体の history のファイルの写しの最上位に `runId`（架空の値）を足したものを、exit 0 で読み、集計は足さない写しのものと同じだった

## 決定

1. **値**: verify の 1 回の run ごとに 1 つ、Node の `crypto.randomUUID()`（UUID の版 4、小文字、36 文字）。check を走らせる前に、`runVerify`（`src/commands/verify.ts`）で作る。中断された run（verdict ERROR）のレポートにも同じ値が入る
2. **置き場所**: レポート（`latest.json`・`history/<stamp>.json`）の最上位の、`startedAt` の直前。最上位のキーは `schemaVersion`・`tool`・`project`・`configPath`・`configSha256`（設定をファイルから読んだときだけ）・**`runId`**・`startedAt`・`finishedAt`・`durationMs`・`git`・`verdict`・`exitCode`・`interruptedBy`・`summary`・`categories`・`checks` の 16 個になる
3. **`latest.md`**: 表の `| Started | … |` の直前に `| Run ID | <runId> |` の 1 行（`runId` の無いレポート〈v0.15.x までのもの〉を表にするときは、行を出さない）
4. **変えないもの**: history のファイルの名前の規則（ADR-0034 の N1）、書く順（`latest.json` → `latest.md` → history）、端末の出力（人間の決定 B2-Q6 による。推奨は変えない）、`aiqh history` の出力、review-packet の表示、判定と終了コード
5. **`schemaVersion` は 1 のまま**（足すだけの変更。ADR-0003 の「後方互換の変更」、ADR-0033 の決定 5 の前例）
6. **読み手の約束**（README・ADR-0003・ADR-0034 の L を書き換える）
   - 2 つのファイルの両方に `runId` があれば: 同じ値なら同じ run、違えば別の run
   - どちらかに無ければ（v0.15.x までの版が書いたファイル）: 今の約束（`startedAt` が違えば確実に別の run、同じでも保証はない）
   - 食い違ったときの手順（並行の無いことを確かめて読み直す、`history/` を使う、並行の無い状態でやり直す）は今のまま。`history/` では `runId` で `latest.json` の run を 1 つに決められる
7. **作る所は 1 つ**: `buildReport` は**必須の**入力として `runId` を受け取る（テストは決まった値を渡す）。`buildReport` の中では作らない（1 つの run の値を、呼ぶ側で 1 つに保つ。中で乱数を作ると、同じ入力から 2 回作ったレポートの比べ〈`tests/parse-verify.test.ts:150`〉が落ちる。R2）。型 `VerificationReport` の `runId` は任意の欄（`runId?: string`。`configSha256` と同じく、古いレポートには無い。null にしない）。verify が書くレポートには必ず入る
8. **版**: minor（v0.16.0）。レポートの形が増える

## fail closed との関係

- 判定は変わらない。`runId` は読み手のための印で、判定の材料にしない
- 並行の verify で組が別の run になりうること（項目 47）は直らない。見分けられるようになるだけ。項目 47 は「受け入れ（未解決）」のまま

## 代替案

- **history の名前を `latest.*` に書く**（設計の 52-B）: 名前は history のディレクトリの中でだけ一意で、history を消せば同じ名前が再び使われる。書く順を「名前を取る → history → latest」に変えると、latest の書き込みに失敗した run の history が残る形になり、失敗のときの意味が変わる
- **時刻・pid・乱数を合わせた文字列**（52-C）: `startedAt` が既にあり、組み合わせの形の約束（区切り・桁）が増える
- **入れない**（52-D）: 外の読み手が組で読む必要が出るまで待つ。今の約束のまま
- **`runs/<runId>/` と単一の pointer**（項目 47 の (a)）: 今は作らない。この ADR はその前提（一意の名前）だけを作る

## 既知の限界

- v0.15.x までの版が書いたファイルには `runId` が無い（約束 6 の後半）
- 「同じ値なら同じ run」は、aiqh が書いたファイルについての約束。手で書き換えたファイルは対象外
- 乱数の衝突は、122 ビットの乱数で実用上起きない（計算の見込み）

## 影響

- 出力: `latest.json`・history の最上位に `runId`、`latest.md` に 1 行（再利用ワークフローの Job Summary に足す形でも見える）
- テスト: 既存の期待値の変更（人間の承認 B2-Q15）: 最上位のキーの並び（`tests/regression-backlog9-report-json-copy.test.ts:76`、`tests/parse-verify.test.ts:74`）、最上位のキーの数（`tests/config-sha256.test.ts:98`。15 → 16。R2 で grep で見つけた）、項目 47 の 47-c-3（`tests/regression-item47-latest-pair-race.test.ts:117-131`）。期待値は変えない呼び出しの形の変更: テストの `buildReport(` の 15 か所（11 ファイル）に決まった `runId` を渡す。新しいテスト（設計 §3.8 の R1〜R6）
- 文書: ADR-0003・ADR-0034 の L の注記、README の約束、`docs/ARCHITECTURE.md` のレポートの例、CHANGELOG。ROADMAP の項目 52 を閉じ、項目 47 の文に一言足す
- 適用先: 再利用ワークフローの SHA を上げた後、レポートに `runId` が入る。設定の変更は要らない

## 案（最終）からの違い（v0.16.0 の実装）

- 決定 7 と「影響」の「テストの `buildReport(` の 15 か所（11 ファイル）」は、実際には 14 か所（11 ファイル）だった。案の数は、`tests/regression-backlog9-report-json-copy.test.ts` の先頭の説明の中の `buildReport()` の字面を数えていた。14 か所とも決まった `runId` を渡す形にした（期待値は変えていない）
- 決定 2 の最上位のキーの数は、設定をファイルから読んだとき（`configSha256` があるとき）16。無いときは 15
- 決定 3 に、`runId` の無いレポートを表にするときは `| Run ID |` の行を出さない、を足した（`renderMarkdown` は古いレポートも表にできる）
- テスト（設計 §3.8 の R1〜R6）: `tests/regression-item52-run-id.test.ts`（R1・R2・R3・R6、置き場所、端末に出さないこと、`buildReport` が値を作らないこと、R5〈`aiqh history` は `runId` の無いレポートを、あるものと同じに読む〉）。R4 は `tests/regression-item47-latest-pair-race.test.ts` の 47-c-3（同じミリ秒の組: `startedAt` では見分けられず、`runId` で見分けられ、`latest.json` の `runId` を持つ history は 1 つ）。47-c-2 にも `runId` での判定を足した
- R6 の中断は、check を走らせる前に中断の合図を受けた run で確かめた（`runVerify` に中断済みの `AbortSignal` を渡す）
- 互換の確かめ（設計 §3.8 の実装の段）: v0.15.0 と同じ src（v0.15.1 は src を変えていない）の `aiqh history --json` で、この版が書いた history（`runId` あり）を読んだ。exit 0、`HISTORY COMPLETE — projects 1, runs 2, sources 1`、集計はこの版の `aiqh history` のものと同じ（`tool` の欄を除く）
- `runId` の形の文字列は、秘密のマスク（`maskSecrets`）と秘密の形の走査（`scanString`）のどちらにも当たらないことを確かめた（乱数の値 2 万個と 5 千個）
