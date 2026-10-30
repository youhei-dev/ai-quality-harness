# ADR-0028 の追記の案（最終）: 決定 14 node:test のパーサ（v0.18.0）と、pytest の実物の形の注記（v0.17.1）

この案は `docs/adr/0028-output-parsers-display-only.md` の末尾に足す 2 つの節の文案。ADR の本文（決定 1〜13）は変えない。日付の行に「注記: 2026-xx-xx（v0.17.1。pytest の実物の形）」「追記: 2026-xx-xx（v0.18.0。決定 14 node:test のパーサ）」を足す。設計は batch3 の設計（最終）の §2.2・§3。

**最終での変更**（独立レビュー R2 の B3-D-R2-001 と人間の決定 2026-10-30）: 規則は変えず、決定 14 に「件数が出なくなる条件」（読む窓の長さ、件数の目安、適用先 A の実物の値）を足し、改善策を ROADMAP の項目 56 に残したことを書いた。

**R2 での変更**（独立レビュー R1 の B3-D-R1-001・B3-D-R1-002 と人間の決定 2026-10-30）: 決定 14 の「要約」を、stdout が切れていないときだけ読む形（理由 `output-truncated` を足す）と、2 段の認識（字面の形 → 値の確かめ。終了コードとの一致を含む）に書き直した。パーサへの入力に `stdoutTruncated` を足した。既知の限界に「要約の出所は検証できない」を足した。pytest の注記（v0.17.1）は R1 のまま。

---

## 注記（v0.17.1: pytest の実物の形。C-42）

- 決定 12 の既知の限界「実物で確かめた要約の形は `-q` の、passed と skipped だけの 1 回」に対して: 適用先 B の CI（v0.17.0 の再利用ワークフロー）で、`-q` の passed と warning の形（`parsed: pytest — <n> passed, 1 warning`）が実物で出た。失敗・エラーのある形は、今も合成の fixture だけで確かめている
- 決定・テスト・fixture は変えない

## 追記（v0.18.0: 決定 14 node:test のパーサ。2026-xx-xx）

### 文脈
- 適用先 A（unit の check が `npm test` で、script が `node --test …`）の CI には、unit の件数が出なかった（PASS の check の出力は表示しない。node:test のパーサが無い。ADR-0011 の v0.14.0 の改訂の「node:test の出力のパーサは範囲の外」）
- 人間の決定（batch3、2026-10-30。B3-Q1 の主案）。設計は batch3 の設計（最終）`docs/reviews/batch3-design/design-final.md` の §3（設計の独立レビュー R1・R2。`docs/reviews/batch3-design/`）
- Node v24.13.1 の node:test は、stdout が端末でなくても既定の reporter が spec で、実行の最後に 8 行の要約のかたまり（tests・suites・pass・fail・cancelled・skipped・todo・duration_ms）を出す。TAP の reporter は同じかたまりを `# ` の印で出す。reporter の出力・テストの `console.log`・読み込みの失敗の stack は、どれも stdout に出る。テストは stdout に要約と同じ形の行を出せる（設計の段の実測。27 の形）

### 決定 14: node:test のパーサ（`src/parse/node-test.ts`）
- **選び方は語の位置で見る**（決定 12 の B-1 と同じ考え）: コマンド（`npm run <script>`・`npm test` なら、今までどおり 1 段だけ解いた script）を `src/command-words.ts` で単純コマンドに分け、次のすべてを満たすときだけ `node-test` を選ぶ
  1. 単純コマンドは 1 つ（前に置く `cd <1 語>` だけは認める）
  2. その単純コマンドを、`aiqh init` の node:test の検出（ADR-0011 の v0.14.0・v0.14.1・v0.15.0 の改訂）と同じ規則が受け入れる。規則は `src/node-command.ts` の `runsNodeTest` 1 か所（init とパーサの選び方が共有する）
  3. `--test-reporter` が無いか、1 つで値が `spec` か `tap`。`--test-reporter-destination` が無いか、1 つで値が `stdout`
  - 理由: node:test の単純コマンドを見分ける規則を、init とパーサで 1 つにする（パーサは 1 と 3 を足すので init より狭い: init は script のどこかの単純コマンドが受け入れられれば提案する）。dot・junit・lcov・自作の reporter・ファイルへの出力は、stdout に要約のかたまりを出さないので選ばない。「どの語でもよい」（決定 13）では、`echo node --test` や後ろのコマンドの出力を読みうる
- **切れた stdout は読まない**（B3-D-R1-001）: パーサへの入力（`src/parse/tool.ts` の `ParserInput`）に `stdoutTruncated` を足す。runner が stdout の先頭を捨てた（末尾 10 MiB だけを保持した）か、読む窓（末尾 1 MiB。決定の上限の表）が先頭を切ったときに真。node:test のパーサは、真なら組を数えずに `unparsed`・理由 `output-truncated`（新しい理由の語）を返す。見えている組が、テストが出したものか実行のものかを決められないため
  - 切れていなければ、出力の全体が見えている。実行が要約まで進んでいれば実行の組が必ずあり、テストが出した組があれば 2 組になる
  - ほかのパーサは `stdoutTruncated` を読まない（振る舞いは変わらない。切れたときの表示は今までどおり `parsed (truncated)`）
  - **件数が出なくなる条件**（B3-D-R2-001）: stdout が読む窓（末尾 1,048,576 UTF-16 単位）より長いとき、または runner が先頭を捨てたとき（既定の 10 MiB〈バイト〉。窓より大きいので、実際には窓が先に当たる）。長さはバイトではなく UTF-16 の単位で数える。境目ちょうど（1,048,576 単位）は読み、1 単位多ければ読まない。目安（設計の段の実測。名前 46 文字ほどのテスト）: `console.log` 無しで約 17,000 件、1 テスト 1 行で約 9,700 件、10 行で約 2,000 件を超えると件数が出ない。適用先 A の実物（113 件）は 5,914 単位（窓の約 0.6%）
  - 改善策は ROADMAP の項目 56（runner が stdout を流しながら要約の形の組を全体で数え、全体で 1 組かつ末尾の窓にあれば読む）。専用の reporter を別ファイルに出させる案は、利用者の check のコマンドを書き換える（P5）ので採らない。窓を大きくするだけ・最後の組を無条件に信じる案も採らない
- **2 段の認識**（B3-D-R1-002）
  1. 字面の形: 8 行が続き、どの行も同じ印（spec の `U+2139` と空白、または TAP の `# `）・語（上の順）・空白・値（数字と点だけの 1 文字以上）でできている。行の頭に空白は無い
  2. 値の確かめ: 7 つの数が 1〜15 桁の数字だけ、`duration_ms` が `<数字>` か `<数字>.<数字>`、`tests = pass + fail + cancelled + skipped + todo`、終了コードが「fail + cancelled が 1 以上なら 1、そうでなければ 0」と同じ
  - 1 の組が 0 個: `no-summary`。2 個以上: `unexpected-summary`（2 の結果にかかわらず）。1 個で 2 を通らない: `unexpected-summary`（決定 3 の考え）。1 個で 2 を通る: `parsed`
- **counts**: `tests`・`suites`・`pass`・`fail`・`cancelled`・`skipped`・`todo`
- **items**: spec の組のときだけ。組の後ろの `U+2716 failing tests:` の行から最後まで、`test at <場所>` の行の直後の `U+2716 <名前> (<時間>)` の行を `failed-test`、名前は `<場所> <名前>`。後ろに ` # TODO` のあるものは入れない。cancelled のテストもこの節に出るので `failed-test` に入る（counts の `cancelled` で分かる）。TAP の `not ok` の行は読まない。名前のマスクと上限は決定 6・上限の表のまま
- **表示**（`src/parse/describe.ts`）: `tests <n> (pass <n>, fail <n>[, cancelled <n>][, skipped <n>][, todo <n>]); suites <n>`（cancelled・skipped・todo は 0 でないときだけ）。読まなかったときは、今までどおり `parsed: node-test — not read (<理由>)`（理由の語は `no-summary`・`unexpected-summary`・`output-truncated`）
- 読むのは stdout だけ。読み方は各行で前の 7 行を見るだけ（1 行を決まった回数だけ見る）。P3 の最悪の形に node-test の形を足した
- **互換**: `parsed.tool` に新しい値 `node-test`、`parsed.reason` に新しい値 `output-truncated` が入る。`schemaVersion` は 1 のまま（決定 9）。**v0.17.x までの `aiqh history` は、`parsed.tool: "node-test"` の入ったレポートを読めない**（`tool` の enum に合わず `bad-shape`・`HISTORY INCOMPLETE`・exit 2。設計の段で、v0.17.0 の `aiqh history` に読ませて確かめた）。決定 12 の pytest と同じ形。`parsed.reason` は history が読まない欄なので、新しい理由の語は history の新旧に影響しない（`output-truncated` は node-test の check にだけ出る）

### 既知の限界（足すもの）
- **要約の出所は検証できない**: パーサは、組がテストの出力か実行の出力かを区別できない。切れていない出力で、実行が自分の要約を出す前に終わり（テストがプロセスを終わらせた、など）、テストが組を 1 つだけ出し、その値が 2 段めの確かめ（和・終了コード）を通ると、その数を読む。判定・終了コードは変わらない（P1）
- 切れた stdout では、正しい要約が見えていても件数を出さない（`output-truncated`）。読む窓を超える実行（テストが多い、`console.log` が多い、stack の多い失敗が続く）では件数が出ない（条件と目安は上の決定 14。改善策は ROADMAP の項目 56）
- 選ばれない形（`no-parser`。件数が出ないだけ）: init の規則が受け入れない形（パス付きの `node`、`npx`・`env`・`cross-env` 経由、一覧に無いオプション、`NODE_OPTIONS`、watch 系、別のファイルを読むオプション）、前後にほかの単純コマンドがある形、reporter が dot・junit・lcov・自作、reporter が 2 つ以上、destination がファイル
- 実物で確かめた形は、手元の合成の例（Node v24.13.1、macOS、`.mjs`）だけ。Node のほかの版（非 TTY の既定が TAP の版がある [要確認]）、Windows の記号、適用先の実物の出力 （適用先 A の実物は設計の段に写しで 1 回確かめた。実装の段でもう一度取る: B3-D-Q7）
- 和の関係と終了コードの関係は、取った形ではすべて成り立ったが、Node の決まりとしては確かめていない [要確認]。成り立たない正しい出力があれば、件数が出ないだけ
- テストが要約のかたまりと同じ形の 8 行を出すと、`unexpected-summary`（件数が出ない）。テストが出す 1 行だけの偽の要約は、組にならないので読まない
- 失敗の名前は、入れ子の葉の名前と場所だけ（suite の名前の連なりは出ない）。cancelled と fail を名前の上では区別しない
- `--test-reporter` を 2 つ以上 stdout に向けた出力は読まない（行が混ざる）

### 影響（v0.18.0）
- 新規: `src/parse/node-test.ts`、`src/node-command.ts`（`src/adapters/node.ts` から `runsNodeTest` を移した。init の提案は変わらない）、テスト `tests/parse-node-test.test.ts`、fixture `tests/fixtures/parse/node-test-*.stdout.txt`
- 変更: `src/types.ts`（`PARSER_TOOLS`・`ParseReason`）、`src/parse/tool.ts`（`ParserInput` の `stdoutTruncated`、答えの理由）、`src/parse/read.ts`（`PARSERS`・`COUNT_KEYS`・`stdoutTruncated` を渡す・理由を通す）、`src/parse/select.ts`（node-test の選び方）、`src/parse/describe.ts`、`src/adapters/node.ts`（import だけ）
- 既存テストの変更: `tests/history-read.test.ts` の道具ごとの fixture の表に node-test を足す（足さないと、その 1 件が落ちる。確かめる中身は変えない）。ほかは守りの追加（`tests/parse-select.test.ts`・`tests/parse-output.test.ts` の P3 と `stdoutTruncated`・`tests/parse-verify.test.ts`）。境目のテスト（1,048,576 単位ちょうどで読み、1 単位上で読まない）を `tests/parse-node-test.test.ts` に置く
- 判定・終了コード・依存関係・`package-lock.json`・禁止文字の集合・`tests/structure/`・設定の仕様（欄を足さない。P5）は変えない
