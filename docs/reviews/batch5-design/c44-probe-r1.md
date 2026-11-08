# C-44 の残りの試し（設計 R1 の添付。設計 §3・付録 A2 の根拠）

- 日時: 2026-11-08 11:08〜11:40 JST（設計の段）。基準の commit `d4f16973d6898172233fbdbce75d409269de4702` に `git worktree add --detach` した使い捨ての作業場所。`npm ci`（exit 0。lock と `package.json` の SHA-256 は前後で同じ。vitest 5.0.5・vite 8.3.5）
- 環境: macOS（Apple Silicon、AC 電源、`caffeinate -i`）、Node v24.13.1、npm 11.18.0。各テストの前に負荷のゲート（1 分平均 ≤ 8 かつ 5 分平均 ≤ 12 が 20 秒おきに 3 回）
- この添付は、数・名前・終了コードと、行の形だけを写す。生の出力・試しのスクリプトは公開しない（手元の絶対パスを含む）。表の中の制御文字は U+ 表記、`latest.md` の表記は `\u{HEX}` の ASCII の字面
- 終わったら、変えたファイルを基準の commit の形に戻し、作業場所を `git worktree remove`（`--force` なし）で消した

## 1. 場合ごとの書き方（直す前と後）

1 つの FAIL の check（名前 `unit`、`cwd` `.`）の `latest.md` を `renderMarkdown` で作り、Checks の表のセルと、失敗の詳細の `- Command:` の行を取り出した。「見え方」は CommonMark 0.31.2 §6.1 の code span の規則で読み戻した文字列（表のセルは、先に GFM のとおり `\|` を `|` にしてから読む）。

各場合: コマンド ／ 表のセル（前・後で同じ）→ その見え方 ／ `- Command:` の code span（前）→ その見え方 ／ 同（後）→ その見え方。表にすると縦棒で表が崩れるので、箇条書きにした。

- LF（`a`・U+000A・`b`）: 表 `` `a\u{A}b` `` → `a\u{A}b` ／ 前 `` `a\u{A}b` `` → `a\u{A}b` ／ 後も同じ
- CR（`a`・U+000D・`b`）: 表 `` `a\u{D}b` `` → `a\u{D}b` ／ 前・後とも同じ
- CRLF（`a`・U+000D・U+000A・`b`）: 表 `` `a\u{D}\u{A}b` `` ／ 前・後とも同じ
- TAB（`a`・U+0009・`b`）: 表 `` `a\u{9}b` `` → `a\u{9}b` ／ 前・後とも同じ
- 縦棒（`npm test | tee log`）: 表 `` `npm test \| tee log` `` → `npm test | tee log` ／ 前 `` `npm test \| tee log` `` → `npm test \| tee log` ／ 後 `` `npm test | tee log` `` → `npm test | tee log`
- バッククォート（`` a `b` c ``）: 表 ``` ``a `b` c`` ``` → `` a `b` c `` ／ 前・後とも同じ
- 両端の空白（` a b ` の形）: 表 `` `  a b  ` `` → 両端に空白 1 つの ` a b ` ／ 前・後とも同じ
- 空: 表は空 ／ 前は空（`- Command:` の後に空白 2 つ）／ 後も同じ
- 縦棒と LF（`a |`・U+000A・`b`）: 表 `` `a \|\u{A}b` `` → `a |\u{A}b` ／ 前 `` `a \|\u{A}b` `` → `a \|\u{A}b` ／ 後 `` `a |\u{A}b` `` → `a |\u{A}b`
- 縦棒とバッククォート（`` npm test | grep `x` ``）: 表 ``` `` npm test \| grep `x` `` ``` → `` npm test | grep `x` `` ／ 前 ``` `` npm test \| grep `x` `` ``` → `npm test` の後にバックスラッシュと縦棒が見える ／ 後 ``` `` npm test | grep `x` `` ``` → コマンドそのもの
- バックスラッシュの後の縦棒（`a \| b`）: 表 `` `a \\| b` `` → `a \| b` ／ 前 `` `a \\| b` `` → `a \\| b`（バックスラッシュ 2 つ）／ 後 `` `a \| b` `` → `a \| b`
- 両端の縦棒（`| x |`）: 表 `` `\| x \|` `` → `| x |` ／ 前 `` `\| x \|` `` → `\| x \|` ／ 後 `` `| x |` `` → `| x |`

- 表のセルとその見え方は、12 の場合のどれも、前と後で同じ（どの行もセルは 8 つ）
- `- Command:` の行が変わったのは、`|` を含む 5 つの場合だけ。後の見え方は、どの場合も `oneLine(command)`（`escapeRawChars`）と同じ文字列。前は `|` を含む 5 つの場合で違った（`\|` のバックスラッシュが見える。コマンドに元からあるバックスラッシュの後の `|` は、バックスラッシュが 2 つ見える）
- どの場合も `- Command:` の行は 1 行（LF・CR は表記になる）
- 表のセルの見え方の「バックスラッシュの後の `|`」の行は、試しの読み戻しの関数（`\|` を `|` にしてから読む）の結果で、GFM の実際の描画では確かめていない（v0.18.2 から変わらず、v0.18.4 でも変えない所）

## 2. 直す前のテスト

| 実行 | 結果 |
|---|---|
| `tests/report-golden.test.ts`・`tests/regression-c44-command-code-span.test.ts`・`tests/markdown.test.ts` | exit 0、3 ファイル・53 件 PASS |
| 足す 7 件（設計 §3.3 の 2 の T1〜T5）を `tests/regression-c44-command-code-span.test.ts` の末尾に足して、そのファイルを走らせた | exit 1、49 件のうち **6 件 FAIL**・43 件 PASS。FAIL: T1、T2、T3 の LF・CR・TAB、T4。PASS: T5（表のセルの対照）と既存の 42 件 |

- 「テストを先に書いた」形（直した後の 2 つのテストのファイル〈足す 7 件と直す既存の 6 件を含む〉を、基準の commit の src と期待値に当てた）: `tests/regression-c44-command-code-span.test.ts`・`tests/report-golden.test.ts` の 2 ファイル・56 件のうち **12 件 FAIL**・44 件 PASS（FAIL は足す 6 件と直す既存の 6 件。PASS の足す 1 件は T5）

## 3. golden（直した src。期待値の作り直し）

`src/report/markdown.ts:130` を `codeSpan(oneLine(c.command))` にした後、`tests/report-golden-input.ts` の `plainInput()`・`edgeInput()` を、一回きりのスクリプトで `buildReport` → `writeReports(report, <使い捨ての場所>/<組>)` に書かせ、書かれたファイルを期待値と比べた。

| ファイル | 前（バイト・SHA-256） | 後（バイト・SHA-256） | `diff` |
|---|---|---|---|
| `plain/latest.md` | 2,988 / `f6bf69e45c6a2338cccde9f7f2d83bac18f37cf360718849dfa3bc93c5aeb3da` | 2,987 / `8cafbf5e066aedaf9394e3b0f5b83faa6089c8fec089ad0527fd00cfdb934768` | **73 行目だけ** |
| `plain/latest.json` | 7,214 / `14e460b673825a351a2cc030994a2f47b87cb9cb7f2b4319581dad39ac69a7f7` | 同じ | 差 0（`cmp` で同じ） |
| `edge/latest.md` | 2,914 / `277eed6e521eaf19fff10b3dfe7acf8a63edaa5a104866c8425a44eae092b14b` | 2,913 / `9d41aecfed4b90a87f508754d392adee586dc897abea4e3c92a2730b0ed98b90` | **79 行目だけ** |
| `edge/latest.json` | 6,660 / `79ed33e90c17e835b4fac7fcde33727c4029c4c91186f0f20f70003b131a6f86` | 同じ | 差 0 |

- `plain/latest.md:73`: `` - Command: `npm test \| tee log` (cwd: `pkg`) `` → `` - Command: `npm test | tee log` (cwd: `pkg`) ``
- `edge/latest.md:79`: ``` - Command: `` npm test \| grep `x` `` (cwd: `.`) ``` → ``` - Command: `` npm test | grep `x` `` (cwd: `.`) ```
- 2 つの組とも、history のファイルは `latest.json` と同じバイト列
- 表の中の同じコマンドの行（`plain:40`・`edge:41`）は変わらない

## 4. 全テスト（直した src）

| 実行 | 結果 |
|---|---|
| 期待値の 2 つの `latest.md` を作り直したものに替え、既存のテストは変えずに全テスト | exit 1、192 ファイル・3,022 件のうち **6 件 FAIL**（2 ファイル）。下の表の 3 か所 |
| 既存のテストの 3 か所を直した後の全テスト | **exit 0、192 ファイル・3,022 件 PASS**（84 秒） |
| typecheck | exit 0 |
| lint | exit 0 |

直す前の src を前提にしていて、直した後に落ちた既存のテスト（6 件）:

| ファイル | テスト | 件数 |
|---|---|---|
| `tests/regression-c44-command-code-span.test.ts` | 「C-44: Failure Details' `- Command:` and `cwd:` are one code span each」の `command: %s`（`:121` の `it.each(COMMANDS)`）のうち、a backtick and \|、backticks just before and after \|、a run of three and \|、spaces at both ends and \| | 4 |
| 同 | 「C-44: a value without a backtick that does not start and end with a space keeps the bytes of v0.18.1」の a \| and a working directory（`:140-152`） | 1 |
| `tests/report-golden.test.ts` | 「plain/latest.md: the sections, …, \| in a cell and outside」（`:116-125`。`:123` の期待値） | 1 |

- 3,022 件 = v0.18.2 の 3,015 件 + 足した 7 件
- 直した後に既存のテストの名前と期待値を変えたのは、この 3 か所だけ（設計 §3.3 の 1）

## 5. 変異（直した src に 1 つずつ当て、全テスト 3,022 件）

| # | 変異（`src/report/markdown.ts`） | 結果 | 落ちたテスト |
|---|---|---|---|
| V1 | `:130` を `codeSpan(cell(c.command))` に戻す | exit 1、**13 件 FAIL** | T1・T2・T3（3 件）・T4、`:121` の `\|` を含む 4 件、`:140` の a \| and a working directory、golden の `plain`・`edge` の書かれたファイルの比べ 2 件 |
| V2 | `:130` の `oneLine` を `escapeRawCharsKeepingLineBreaks`（LF・TAB を表記にしない形）にする | exit 1、**2 件 FAIL** | T3 の LF・TAB（CR は禁止文字なので、この形でも表記になり、落ちない） |
| V3 | 表の行（`:65`）も `codeSpan(oneLine(c.command))` にする | exit 1、**9 件 FAIL** | T5、表のセルの `it.each` の `\|` を含む 4 件、`:140` の a \| and a working directory（表の行の確かめ）、`tests/markdown.test.ts` の「lists every check and escapes pipes in commands」、golden の `plain`・`edge` の比べ 2 件 |
| V4 | `:130` の `oneLine` を外す（`codeSpan(c.command)`） | exit 1、**5 件 FAIL** | T3 の LF・CR・TAB、生の文字（U+202E）を含む既存の 2 件（`:121` の a raw character and a backtick、`:140` の a raw character） |
| V5 | `:130` を 1 つのバッククォートで包む形（`` `${oneLine(c.command)}` ``。C-44 の前の形）にする | exit 1、**17 件 FAIL** | `:121` の `it.each` のうちバッククォートか両端の空白を含む 14 件（one backtick・a run of two・a run of three and \|・a backtick first・a backtick last・backticks at both ends・one backtick only・spaces at both ends・a backtick and \|・backticks just before and after \|・spaces at both ends and \|・a backtick first and a space last・a space first and a backtick last・a raw character and a backtick）、`:133` の「a run of six: seven」、T2、golden の `edge` の書かれたファイルの比べ |

- 各変異の後に、直した形のファイルを写して戻し、`cmp` で一致を確かめた（5 回とも一致）
- V5 の 1 回目は、変異の文の誤り（テンプレート文字列の中に生のバッククォートを入れた）で `markdown.ts` が構文の誤りになり、65 ファイルが読み込めずに 177 件 FAIL・2,363 件だけ走った。テストの効きの結果ではないので数えず、バッククォートをエスケープした形で走らせ直した（上の表はその値。変異を当てた後に、モジュールが読み込めることを先に確かめた）
- V1 で、golden の期待値の中身の確かめ（`:116`）は落ちない（期待値のファイルを読むテストで、書かれた出力は見ない）。書かれた出力は、書かれたファイルの比べ（2 件）が捕まえる
- V4 で golden が落ちないのは、golden の入力のコマンドに制御文字・生の文字が無いため（書き込みの変換も禁止文字を表記にするが、LF・TAB は変えない）
