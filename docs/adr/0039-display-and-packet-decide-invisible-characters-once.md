# ADR-0039: aiqh が渡す・出す文字の「見えない文字」を 1 つの判断にする（禁止の集合に、正しい絵文字の並びの外の層 (c) を加え、パケットは拒み、出口は表記にする）

- 状態: 採用（v0.17.0。ROADMAP の項目 54。batch2 の設計〈最終〉`docs/reviews/batch2-design/design-final.md` の §5 と、この ADR の案〈最終〉`docs/reviews/batch2-design/adr-0039-draft-final.md` を採用した。人間の決定 B2-Q9・B2-Q10・B2-Q11〈2026-10-26。推奨どおり〉と B2-Q15 の 6〈2026-10-29 に 1 か所を足した〉。設計の独立レビュー R1・R2 は `docs/reviews/batch2-design/`）。ADR-0036 の決定 9 と ADR-0037 の決定 7（review-packet は変えない）を置換し、ADR-0020 の決定 3（禁止の集合は 75 のまま）に出口の判断を足す。`FORBIDDEN_RANGES` そのものは変えない
- 日付: 2026-10-29（v0.17.0）。案: 2026-10-26（R1・R2・最終。R2 で決定 1・3・4 を書き足した〈設計レビュー R1 の B2-D-R1-002〉。最終で決定 1 に CR の扱いを足した〈R2 の B2-D-R2-001〉）
- 案からの違いは、下の「案（最終）からの違い」。決定の中身は案のまま（関数の仮の名前は実際の名前にした）
- 利用者への影響: パケットは、見えない文字（RGI の並びの外の層 (c)）を含む入力で書かれなくなる（厳しくなる）。端末・`latest.md` の表記が広がる。ファイルの JSON はデータを変えない（CHANGELOG に書いた）

## 文脈

- ADR-0014: パケットに入れない文字の集合（`src/security/raw-chars.ts` の `FORBIDDEN_RANGES`。75 の符号位置: TAB・LF の外の C0、DEL、C1、U+2028・U+2029、双方向の制御文字、U+FEFF）。追跡している Markdown のテストも同じ部品を使う
- ADR-0016・ADR-0020: 端末とファイルの出口で、同じ集合を `\u{…}`（JSON は `\uXXXX`）の表記にする。集合の外の U+200B・タグ文字などは表記にならない（ADR-0020 の既知の限界）
- ADR-0036・ADR-0037: security の check は、層 (a)・(b) と層 (c)（ゼロ幅・異体字セレクタ・タグ文字・方向の印など 8 分類）を、追跡しているファイルの中身とパス名で見る。正しい絵文字の並び（RGI）の内側の U+200D・U+FE0F・タグ文字だけを、Unicode のデータで除く（ADR-0037 の決定 3、I1〜I9）。パケットと出口は変えなかった（ADR-0037 の既知の限界、ROADMAP の項目 54）
- パケットの入力のうち、security の check が見ないもの: commit のメッセージ、依頼文（`--request`）、レビューの原文（`--review`）、`latest.json` の値、範囲の始まりより前に入った差分の古い側の行
- review-import は、レビューの原文の禁止の文字を findings の JSON に `\uXXXX` で書き、件数の行を出す。層 (c) は生のまま入り、次の verify の security の check で FAIL になる
- 実測（2026-10-26。batch2 の設計 §5.3）: aiqh の全 433 commit の差分と commit のメッセージ、`docs/reviews/`、受け取ったレビューの原文、手元のレポート、適用先 A・B の追跡しているファイル（RGI の並びの外）と手元のレポートで、層 (c) の該当は 0。適用先 A・B の追跡しているファイルには、RGI の並びの内側の文字がある（除いた数 3・11）

## 決定

1. **判断を 1 つ足す**（`src/security/raw-chars.ts` の `findDisplayRawChars`）【R2 で判断の単位を書いた。B2-D-R1-002】
   - 入力は**元の文字列**（表記・マスク・`JSON.stringify` の前）
   - LF で分けた 1 行ずつを、`decideRawChars` に「行の終わりまで届いた最後の窓」（`offset: 0`・`final: true`）として渡し、(i) 禁止の集合の文字と、(ii) 層 (c) の文字のうち ADR-0037 の決定 3 が「finding の側」と決める位置を返す
   - LF は E（Emoji・Emoji_Component）の外なので、run は LF をまたがない。1 行ずつでも文字列全体でも、run と RGI の区切りは同じ（複数行で判断が変わらない）
   - 窓の境目の扱い I5 の (b)・(c) は起きない
   - **CR の扱い**（R2 の後の最終。設計レビュー R2 の B2-D-R2-001）: `decideRawChars` に渡す前に、`src/security/scan.ts` の `LineAssembler` と同じ条件で、LF の直前の U+000D（1 つ）と、文字列の終わりの U+000D（1 つ）を判断から外す。元の文字列と位置は保ち、出力の字面は変えない。行の途中の CR は `control` の finding の側（今の security の check と同じ）。禁止の集合の CR の扱い（パケットは拒む、表示の経路は表記）は今のまま
   - 表記は、元の位置で決めた後に 1 回の走査でまとめて当てる（禁止の文字を先に表記にしてから層 (c) を決める 2 段にしない）
   - 同じ文字列について、パケットの確かめ・出口・security の check（`scanRawCharText`）は同じ「行と符号位置」を決める（等しさをテストで固定する）
2. **パケット**（review-packet）: 入力の確かめ（`checkText` のすべての呼ぶ所）、表示する値の確かめ（`checkValue`）、パスのオプションの確かめ（`rawCharsIn`）を、この判断で行う
   - 該当があればパケットを書かない（`raw-char` の finding。`detail` は符号位置と分類）
   - `security.allow` では抑えない（禁止の集合と同じ。ADR-0036 の決定 9 の理由: 同じ文字が 2 回出て、片方だけが allow で抑えられる形を避ける。人間の決定 B2-Q10）。外すには `--exclude`
3. **保存の経路（ファイルの JSON）は値を変えない**【R2 で約束にした。B2-D-R1-002】
   - 対象は、verify のレポート（`latest.json`・history）と review-import の findings
   - 文字列の値とキーそのもの（マスクの後の値）は変えない。`JSON.stringify` の後の字面を書き換えるのではなく、**値の上で決めた位置**の符号位置だけを `\uXXXX` で書く JSON の書き手（`src/security/raw-chars.ts` の `jsonForFile`。字下げは 2）を使う
   - `JSON.stringify(value, null, 2)` と同じ形・同じキーの順・同じ字下げで、違うのは文字列のトークンの中だけ
   - U+FFFF より上の符号位置は、サロゲートの組の 2 つの `\uXXXX`。それ以外の字は `JSON.stringify` と同じ（`"`・`\`・制御文字の書き方を含む）
   - 約束: `JSON.parse(jsonForFile(v))` は `v` と深く同じ。表記にする文字が無い値では、字面も `JSON.stringify(v, null, 2)` と同じ
   - review-import の端末には件数の行を出し、取り込みは止めない（人間の決定 B2-Q11）
   - `writeAtomic` の json の分岐の `escapeRawCharsAsJson`（禁止の集合。BMP の中だけ）は、最後の門として残す
4. **表示の経路は値を表記にする**: 端末（`src/output.ts` の `escapeForDisplay`・`safeText`・`safeJson`）、Markdown（`latest.md` など）、パケットのインラインのコードの表記（`src/review/packet.ts` の `escapeInline`）は、この判断で `\u{HEX}` にする
   - 端末の `--json`（`safeJson`）は、今の禁止の集合と同じく、値そのものが表記の文字列になる（読む人のための形）
   - この違いを利用者の文書に書く: ファイルの JSON はデータを変えない、端末の `--json` は表示のために値を変える
5. **変えないもの**: `FORBIDDEN_RANGES`（75）と `SCANNED_RAW_RANGES`、security の check の判定と出力、追跡している docs のテストと追跡しているファイルの生の文字のテスト（`FORBIDDEN_RANGES` を使う）、RGI の並びの内側の文字（そのまま渡し、そのまま出す）
6. **時間**: 層 (c) の候補の無い文字列は、1 回の走査で返す（ADR-0037 の実装と同じ作り）。最悪の入力で線形であることを、仕事の量のテストで確かめる（判断と `jsonForFile` の両方）
7. **版**: minor（v0.17.0）。パケットが厳しくなり、出口の表記が広がる。CHANGELOG の先頭に書く

## fail closed との関係

- パケットは、見えない文字を含む入力では書かれない向きに厳しくなる
- 出口の表記は、見えない文字を見える形にする。JSON ではデータを変えない
- 除外（RGI の並びの内側）は、ADR-0037 と同じく Unicode のデータ（Node の正規表現の属性）だけで決まり、設定では変えられない。古い Node が新しい絵文字を知らなければ、その並びの候補は表記になり、パケットは拒む（厳しい向き）

## 代替案

- **パケットの側だけ**（設計の 54-B）: AI のレビュアーへの道を先に塞ぐ。出口の表記は既知の限界に残る
- **出口の表記だけ**（54-C）: 人の読む側だけ。パケットの道は残る
- **受け入れて閉じる**（54-D）: 今の出力に例は無い（実測 0）。道は残る
- **`FORBIDDEN_RANGES` に層 (c) を足す（RGI の除外なし）**（54-F）: 絵文字に付く U+FE0F・U+200D も、パケットで拒まれ、出口で表記になる。適用先 A・B の追跡しているファイルの RGI の並び（除いた数 3・11）を含むパケットが作れない。docs のテストも変わる
- **パケットで `security.allow` を当てる**: 決定 2 の理由で採らない
- **保存の経路は生のまま、表示の経路だけ表記にする**（設計の 54-G。R2 で足した）: JSON の作りは今と同じで簡単だが、追跡しているファイルに書く findings の JSON に生の文字が残り、次の verify で FAIL になる（今と同じ遅い気づき）。エディタで開く人には見えないまま。決定 3 で値を変えずに字面だけを表記にできる
- **`JSON.stringify` の後の字面の上で判断して `\uXXXX` にする**（素朴な広げ方）: 字面の上では、値の制御文字の表記（`\u0007` の `7` など）が隣の文字と RGI の並びを作り、値の上の判断とずれる（例: 値 U+0007 U+FE0F U+20E3 の U+FE0F が、字面の上では keycap の並びの中になる）。また、今の 4 桁の書き方を BMP の外に使うと、データが壊れる（`\ue0041` は U+E004 と `1` に読める）。どちらも batch2 の設計の試作で確かめた

## 既知の限界

- RGI の並びの内側の文字は、パケットにも出口にもそのまま（ADR-0037 の既知の限界と同じ。並びそのものを悪用の形にする手口は扱わない）
- 表記の `\u{…}` は、もとの文字列に同じ形の文字の並びがあれば区別できない（今と同じ。表示の経路だけ。保存の経路の JSON の `\uXXXX` は、JSON の書き方なので区別できる）
- 端末の `--json` は表示の経路で、値が表記の文字列になる（データとして読む道具は、ファイルの JSON を読む）
- 同形異字は見ない（ADR-0037 と同じ）

## 影響

- パケット: 該当する入力では書かれない（今の aiqh のどの範囲でも 0 件の見込み。実測）
- 出力: 該当する文字があるときだけ表記になる
- テスト: 既存の期待値の変更（人間の承認 B2-Q15）: `tests/regression-item49-raw-chars-layer-c.test.ts:473-474`（パス名のゼロ幅の文字が表記で出る）、`tests/regression-backlog9-report-file-notation.test.ts:104`（ファイルの JSON が U+200B を `\uXXXX` で書く）。新しいテスト（設計 §5.8 の N1〜N8 と線形の確かめ。N4 は `JSON.parse` の後の深い同一性を必須にする。N8 はパケット・出口・security の check の判断の等しさで、CRLF・単独の CR・CR CR LF・終わりの CR・長い行の窓の境目の CR と LF を含む）
- 文書: ADR-0014 の決定 6・ADR-0016・ADR-0020 の決定 3 と既知の限界・ADR-0036 の決定 9・ADR-0037 の決定 7 と既知の限界への注記、CHANGELOG。ROADMAP の項目 54 を閉じる
- 適用先: 出力は変わらない見込み（実測 0）。適用先は CI で review-packet を使っていない

## 実装（v0.17.0）

- `src/security/raw-chars.ts`
  - `findDisplayRawChars(text, work?)`: 決定 1 の判断。結果は 1 つの文字ごとに、行（LF で分けた 1 始まり）・桁（符号位置で 1 始まり）・文字列の中の位置・符号位置・分類と、`forbidden`（禁止の集合）・`scanned`（security の check の判断の finding の側）。禁止の集合はすべて security の check の BMP の符号位置に入るので、候補の単位が 1 つも無い文字列は 1 回の走査で返す
  - `escapeRawChars(s)`（LF・TAB も表記）と `escapeRawCharsKeepingLineBreaks(s)`（LF・TAB は残す）: 判断の位置を元の文字列の上で決めてから、1 回の走査で `\u{HEX}` を書く
  - `jsonForFile(value, work?)`: 決定 3 の書き手。`JSON.stringify(value, null, 2)` の字面に、security の check の BMP の符号位置の単位とサロゲートの単位が 1 つも無ければ、その字面を返す（文字列に表記にする文字があっても C0 の制御文字だけで、`JSON.stringify` が書いたとおり）。あれば、`JSON.stringify` が書くデータ（`JSON.parse` で読み戻した値。文字列は単位ごとに元と同じ）を、文字列ごとに判断して書き直す
  - `rawCharDetail(hit)`: パケットの finding の `detail`（下の違いの 3）
- review-packet: `checkText`（すべての入力）・`checkValue`（`src/review/checked.ts`）・`rawCharsIn`（`src/commands/review-packet.ts`）・`escapeInline` が判断を使う。`security.allow` は当てない
- 出口: `src/output.ts` の `safeText`（`escapeRawChars`）と `safeJson`（`escapeForDisplay`）、`src/report/markdown.ts`（`latest.md`）、`src/run-history/html.ts`（`h`）、`src/config/generate.ts`（設定案の注釈の値）は `escapeRawChars` を通じて判断を使う。`writeAtomic` の Markdown・HTML の分岐（`escapeForDisplay(content, "keep")`）も同じ。`writeReports`（`latest.json`・history）と review-import の findings のファイルは `jsonForFile` で書く。`writeAtomic` の json の分岐の `escapeRawCharsAsJson` は、禁止の集合だけの最後の門として残す（`jsonForFile` の出力では何も変えない）。init の設定のファイル（`escapeRawCharsAsJson(configText)`）は変えていない（決定 3 の対象外）
- テスト: `tests/regression-item54-display-raw-chars.test.ts`（設計 §5.8 の N1〜N8、2 つの落とし穴、線形）と、`tests/regression-item49-raw-chars-layer-c.test.ts` の L7・L17 と L12

## 案（最終）からの違い（v0.17.0 の実装）

1. **既存のテストの期待値の変更（B2-Q15 の 6）に 1 か所を足した**（人間の承認 2026-10-29）: `tests/regression-item49-raw-chars-layer-c.test.ts` の L12 guard（v0.16.0 の行で `:532-543`。ADR-0037 の決定 7 の守りで、U+200B を含む差分のパケットが書かれる〈exit 0〉ことを固定していた）。決定 2 で必ず変わるが、設計の網羅性の確かめ（付録 A12）は、この行を security の check の走査の結果と分類して見落としていた。実装の段の S4 で止まり、人間が A を選んだ: 同じ場面で、exit 1、`raw-char` の finding 2 件（全文と差分。どちらも `U+200B zero-width`）、家族の絵文字の ZWJ は finding にならない、を確かめる形に変え、名前を「L12 (v0.17.0, ADR-0039)」にした。`scanString` が生の文字を見ないことの確かめは残した。記録は `docs/reviews/batch2-design/questions-final.md` の B2-Q15
2. **`tests/regression-backlog9-report-file-notation.test.ts:104` は変えていない**: この行が試すのは `escapeRawCharsAsJson`（`writeAtomic` の json の分岐の最後の門）そのもので、決定 3 はこの関数を禁止の集合だけの門として残す。U+200B を変えないことは正しいまま。ファイルの JSON が U+200B を JSON の escape で書くことは、`jsonForFile` のテスト（N4）と `writeReports`・review-import を通すテストで固定した。「影響」の「`:104` を変える」は、この違いのとおり読む
3. **パケットの finding の `detail`**: 禁止の集合の文字は今までどおり符号位置だけ（`U+202E`。既存のテストが固定している。N6）。足した文字（層 (c) で禁止の集合の外）は符号位置と分類（`U+200B zero-width`。決定 2 の例）。パスのオプションの断りの文も同じ書き方で、末尾を「choose a path without control, separator, bidi or invisible characters」にした
4. **1 行目の BOM**: 判断は行ごとに `final: true`・`offset: 0` で渡し、1 行目は security の check と同じく `firstLine` を立てる（1 行目の先頭の U+FEFF は層 (c) の判断から外れる）。U+FEFF は禁止の集合なので、パケット・出口の扱いは変わらない。N8 の「層 (c) の判断と security の check の一致」を先頭の BOM でも保つため
5. **review-import の件数の行**: 文言（`forbidden characters in the review: N (written as notation; lines …)`）は変えず、件数に足した文字を含める（既存のテストがこの文言を照らしている）
6. **`escapeInline`**: 判断を使うが、受け取るのは `checkValue` を通った値だけなので、足した文字がここに届くことは無い（守り。変異で外しても落ちるテストは無い〈届かない所〉）
7. **`jsonForFile` の速い道**: 上の「実装」のとおり。速い道を通らない変異は結果を変えない（同値。どちらの道でも、表記にする文字の無い値の字面は `JSON.stringify` と同じ、をテストで固定した）。C0 の制御文字は `JSON.stringify` の書き方（`\b`・`\r`・`\u000b` など）のままなので、禁止の集合の文字だけを含む値の字面は、今まで（`JSON.stringify` の後に `escapeRawCharsAsJson`）と同じ（N6 で固定）
8. **線形の確かめの仕事の量**: 判断の数え方（ADR-0037 の L11 と同じ、所属の確かめと RGI の照らし）に、候補のある行で歩く単位を足して数える。1 MiB の 6 つの形（並びと ZWJ、異体字セレクタ、タグ文字、E の文字だけ、短い run、CR LF の短い行）で、判断と `jsonForFile` のどちらも 1 単位あたり 5 以下、入力が 4 倍で仕事は 4.5 倍以下
9. **テストを先に**: 直す前の `29d582d` の SHA 固定の worktree で、新しいテスト 31 件のうち 30 件が FAIL（守りの N5 が PASS）、変えた item49 の 2 件が FAIL。変異 21 個のうち、壊す 19 個はどれも 1〜14 件 FAIL。生き残った 2 個は、上の 6（届かない所）と 7（同値）
10. **実測（v0.17.0 の実装の段。数と時間だけ）**: aiqh の最初の commit から項目 54 の commit `c537c66` までの 448 commit の差分（`git log -p`、13.7 MB）・全 commit のメッセージ・`docs/reviews/`（169 ファイル）・受け取ったレビューの原文（60 ファイル）・手元のレポート（229 ファイル）で、足した判断の該当は 0（禁止の集合は 10 件で、どれも過去の差分の中の既知のもの: 生の文字を入れた行 5 件と、それを直した行 5 件〈v0.11.1 の直しの 3 件と、M2-0 の直しの 2 件〉。今のファイルには無い）。aiqh の最初の commit から `c537c66` までの範囲（447 commit）のパケットは、変更の前後で同じ 3 件（範囲の始まりの側の古い行の、秘密の形）で書かれない（前からのもの。新しい判断の finding は 0）。適用先 A・B の写し（`git clone --no-hardlinks`）の security-scan は、変更の前後で端末と `--json` の出力がバイト単位で同じ（finding 0、除いた数 3・11）。追跡しているファイルと手元のレポートで、足した判断の該当は 0
