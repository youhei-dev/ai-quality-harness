# ADR-0028: verify は check の出力を表示のためだけに読む（出力パーサ）。security-scan の項目も同じ欄に入れる。判定と終了コードは変えない

- 状態: 採用（M2-2 の残り: ROADMAP の M2-2 の「内容」の「出力パーサの実装」と、項目 15 の「verify レポートへの oversized-candidate / `security.allow` 警告の構造化」。ADR-0011 の「出力パーサは `OutputParser` の型だけ定義（M1）」を置き換える〈型は `src/parse/tool.ts` の `ToolParser`。M1 の下書きは消した〉。ADR-0003・0004・0005 は変えない）。v0.8.1 で、決定 8 の Markdown の形を追記（決定 10・11）で変えた
- 日付: 2026-10-14（v0.8.0）。追記: 2026-10-15（v0.8.1）

## 文脈
- M1 は出力パーサを型（`src/adapters/types.ts` の `OutputParser`）だけ定義し、実装を M2 のレポートの構造化に回した。verify のレポートには、各 check の状態・終了コード・出力の末尾（`stdoutTail`・`stderrTail`）しか無く、「何件のテストが落ちたか」「どのテストか」は末尾の文字列を人が読むしかない
- security の check（`aiqh security-scan`）の oversized-candidate と、`security.allow` で許した finding・使われた／期限切れ／使われないルールは、security-scan の端末の出力にしか出ない（M2-0 の完了の報告、ROADMAP の項目 15）
- 人間が決めた原則（v0.8.0 の指示）:

| # | 原則 |
|---|---|
| P1 | 判定と終了コードは一切変えない（ADR-0004）。パーサの結果は、レポートの追加の欄（表示用）だけ |
| P2 | パーサが失敗しても、時間切れになっても、verify は止めない。結果も変えない。その欄に「読めなかった」と理由（種類だけ）を書く |
| P3 | パーサの入力の大きさに上限を付け、線形の時間で読む（項目 35 の教訓）。上限を超えた分は読まず、「切り詰めた」と記録する |
| P4 | 出力は、既存のマスク（`copyJson(…, maskSecrets)`・出口の `maskSecrets`）と表記（ADR-0020）を通す。テストの名前などは信頼できない入力 |
| P5 | 設定の欄は足さない。どのパーサを使うかは、チェックの種類・名前・コマンドから aiqh が決める。合うパーサが無ければ「対象外」 |
| P6 | 最初の版は vitest・eslint・npm audit。pytest は後（ROADMAP） |
| P7 | key-value 誤検出の継続記録は、定義を ADR に書くだけ（ADR-0029） |
| P8 | 新しい依存関係は入れない。`package-lock.json`・禁止文字の集合・npm の保護設定・`tests/structure/` は変えない |
| P9 | `schemaVersion` などの互換の扱いは既存の作法に合わせる。既存のレポートを読む側が壊れないこと |

## 下調べの結果（2026-10-14。記録は git 管理外の `tmp/wave3/v080/survey/`）
- **自己 verify の各チェックの出力**（verify と同じ部品 `executeCommand`・`checkEnv` で実行して保存した）:
  - `unit`（`npm run test` → `vitest run`）: npm の見出し 2 行と、vitest の要約（`Test Files  156 passed (156)`・`Tests  2036 passed (2036)`・`Start at`・`Duration`）だけの 262 バイト。vitest 5 は環境変数（`CLAUDECODE`・`AI_AGENT` など）でエージェントの中だと判断すると、要約と失敗だけを出す reporter を使う。素の非 TTY では各ファイルの行も出し、CI（`GITHUB_ACTIONS`）では `::error` の注記の行も出す。**3 つの環境とも、要約の行の形と、`Failed Tests` / `Failed Suites` の節（標準エラー出力）の形は同じ**だった（見本のプロジェクトで確かめた）
  - `unit-minpath`（`node scripts/test-minimal-path.ts`）: vitest を最小の環境で動かすので、各ファイルの行を含む 769 行・64 KB。要約は `Test Files  155 passed | 1 skipped (156)`・`Tests  2034 passed | 2 skipped (2036)`。コマンドにも script にも vitest の名が無い
  - `lint`（`npm run lint` → `eslint .`）: npm の見出しだけ。eslint の既定の formatter（stylish）は、問題が 0 件のとき何も出さない。問題があるときは、ファイルの行・`  行:列  error|warning  メッセージ  ルール` の行・`✖ 6 problems (3 errors, 3 warnings)`（1 件は単数形）
  - `dependency`（`npm audit --audit-level=high`）: `found 0 vulnerabilities` の 1 行。npm の要約の形は 3 つ（npm 同梱の npm-audit-report 7.0.0 の `install.js`）: `found 0 vulnerabilities`、重要度が 1 種類なら `<n> <重要度> severity vulnerability|vulnerabilities`、複数なら `<n> vulnerabilities (<n> <重要度>, …)`（合計は info を含むので、内訳の和以下）。各パッケージは `<名前>  <範囲>` の行と `Severity: <重要度>` の行（low には Severity の行が無い）
  - `security`（`npm run security` → `node src/cli.ts security-scan`）: 見出し `aiqh security-scan — <root>`、`findings: N (secret-shaped: …, oversized candidates: …, tracked .env: …, untracked .env not ignored: …, .gitignore: …)`、最後の `SECURITY SCAN: …`。項目は `  [oversized-candidate] …`・`  [allowed] …`・`  rule used N×: …`・`  warning: expired allow rule …`・`  warning: unused allow rule …` など（`src/commands/security-scan.ts` の renderText）
- **機械が読みやすい出力**（vitest の JSON reporter・eslint の `--format json`・`npm audit --json`・`security-scan --json`）は、どれも**利用者の設定のコマンドを変えないと得られない**。aiqh はコマンドを書き換えない（P5 の向き）ので、いまのコマンドが出すテキストの要約を読む
- **レポートを読む側**: review-packet の Verification の節は `latest.json` を zod の object（知らないキーは捨てる）で読み、決まった欄（verdict・exitCode・tool・各 check の name・kind・required・status・exitCode・durationMs）だけを描く。latest.md は JSON から作る
- **形をそのまま比べている既存テスト**: `tests/regression-backlog9-report-json-copy.test.ts` がレポートの最上位のキーの並びを固定している。各 check のキーの並びを丸ごと比べるテストは無い。→ 欄は**各 check の中**に置く
- **`schemaVersion` の作法**: ADR-0003 は「後方互換の変更のみ許す」。欄を足した前例（R3-002 の `interruptedBy`）は `schemaVersion` 1 のまま
- **マスクの時間**: `maskSecrets` は、PEM の秘密鍵の始まりの行（5 つのハイフン・BEGIN・PRIVATE KEY・5 つのハイフンの形。走査に当たるのでここでは言葉で書く）の繰り返しで超線形（64 KiB 15 ms・256 KiB 222 ms・1 MiB 3,895 ms）。いまの末尾（64 KiB）では問題にならないが、パーサの入力 1 MiB をまるごとマスクする形は P3 に反する（ROADMAP の項目 40 に記録）

## 決定
1. **欄 `checks[].parsed`**（表示用。各 check の最後のキー。v0.8.0 の verify は常に書く。古いレポートには無い）:
   ```jsonc
   "parsed": {
     "tool": "vitest",          // "vitest" | "eslint" | "npm-audit" | "aiqh-security-scan" | null
     "status": "parsed",        // "parsed" | "unparsed" | "not-applicable"
     "reason": null,            // parsed 以外の理由（決まった語だけ。出力の文字列は入れない）
     "truncated": false,        // 入力の末尾だけを読んだ（または runner が既に切り詰めていた）
     "counts": { "testFiles": 156, "testFilesPassed": 156, … },  // ツールごとの決まったキー。parsed 以外は {}
     "items": [ { "kind": "failed-test", "name": "tests/a.test.ts > case" } ],  // 名前つきの項目（最大 50）
     "itemsOmitted": 0          // 50 を超えた分の数
   }
   ```
   `status` と、ほかのすべての欄が決まった後で読む。`computeVerdict`・`computeCategories`・終了コードは `parsed` を見ない（P1）
2. **パーサの選び方**（P5。`src/parse/select.ts`）: コマンドだけから決める。設定の欄は無く、コマンドは書き換えない
   - コマンドを語に分ける（引用符は捨てる。`;`・`|`・`&`・`(`・`)` で単純なコマンドを区切る）。語のパスの最後の部分で決める: `vitest`・`vitest.mjs` → vitest、`eslint`・`eslint.js` → eslint、`npm` の後ろに `audit` → npm-audit、同じ単純なコマンドに `security-scan` と `aiqh`・`cli.ts`・`cli.js` → aiqh-security-scan
   - コマンド全体が 1 つの `npm run <script>`・`npm run-script <script>`・`npm test`（`t`・`tst`）なら、check の作業ディレクトリの package.json のその script で決める（1 段だけ。npm が親のディレクトリの package.json を探すことはまねない）
   - 種類（kind）と名前は使わない: どのツールが動くかを教えないため（`unit` は vitest でも pytest でもありうる）
   - 合うツールが 0 → `not-applicable`（`no-parser`）。2 つ以上 → `not-applicable`（`several-tools`）。package.json があるのに読めない（ENOENT・ENOTDIR 以外の失敗、シンボリックリンク、ディレクトリ、FIFO、1 MiB 超、不正な JSON）→ `unparsed`（`script-unreadable`。ADR-0022: 読めないものを無いとしない）
3. **4 つのパーサ**（`src/parse/`）。どれも「要約が見つからない」は `no-summary`、「要約の形はあるが語・数が合わない」は `unexpected-summary`（別のツールの出力を、そのツールの件数として出さないため）:
   - **vitest**: stdout の最後の `Test Files` の行と、その次の `Tests` の行。語は vitest の 5 つ（failed・passed・expected fail・skipped・todo）か `no tests` だけ、同じ語は 1 回、内訳の和は合計以下。続く数行の `Errors` の行も読む。counts: `testFiles`・`testFilesFailed`・`testFilesPassed`・`testFilesExpectedFail`・`testFilesSkipped`・`testFilesTodo`、同じく `tests…`、`errors`。items: 標準エラー出力と標準出力の `Failed Tests` / `Failed Suites` の節（区切りの見出しの行）の中の `FAIL` の行（`failed-test`・`failed-suite`）。節の外の `FAIL` の行（テスト自身の出力）は名前にしない
   - **eslint**（stylish）: 最後の `✖ N problems (E errors, W warnings)`。E + W = N でなければ unexpected。要約が無く、出力が npm の見出しと空行だけで終了コード 0 なら 0 件（eslint は問題 0 件で何も出さない）。それ以外は no-summary（別の formatter の出力、設定の誤りなど）。items: error の行を `<ファイル>:<行>:<列> <ルール>`（`error`。warning は数えるだけ）
   - **npm audit**（テキスト）: 3 つの形の最後の要約。counts: `vulnerabilities`・`low`・`moderate`・`high`・`critical`。items: `Severity:` の行が続くパッケージの行（kind は重要度）
   - **aiqh-security-scan**（Q2）: 見出しの行が必須。`findings:` の行の内訳の和が合計と等しく、最後の行（`SECURITY SCAN: no findings` / `findings present (see above)`）が合計と合うこと。counts: `findings`・`secretShaped`・`oversizedCandidates`・`trackedEnv`・`untrackedEnv`・`gitignore`・`suppressed`・`allowRulesUsed`・`expiredAllowRules`・`unusedAllowRules`。items: `secret`・`oversized-candidate`・`tracked-env`・`untracked-env`・`gitignore`・`allowed`・`allow-rule-used`・`expired-allow-rule`・`unused-allow-rule`（印の後ろを、表示されたとおりに）。scan の終了コードは変えない（oversized-candidate はいままでどおり finding で exit 1）。**「警告」とは呼ばない**: finding（判定に効く）と、許したもの・ルールの使われ方（判定に効かない）が混ざるため、欄の名前は `items` で、種類を `kind` に書く
4. **上限**（P3。`src/parse/text.ts`）:
   | 名前 | 値 | 意味 |
   |---|---|---|
   | `PARSE_INPUT_MAX` | 1 MiB（UTF-16 の単位） | 各ストリームの末尾から読む量。切ったときは、残った最初の行（行の後半）を読まない。`truncated: true` |
   | `PARSE_LINE_MAX` | 4,096 | これより長い行は読まない（要約にも名前にもしない） |
   | `PARSED_ITEMS_MAX` | 50 | 名前を残す数。残りは `itemsOmitted` |
   | `PARSED_NAME_MAX` | 300 | 名前の長さ（最後の 1 文字は `…`） |
   | `PARSE_TIME_LIMIT_MS` | 1,000 | 1 つの check の出力を読む時間の上限。1,024 行ごとに時計を見る |
   | `PACKAGE_JSON_MAX` | 1 MiB | 読む package.json の大きさ |
   | 数 | 15 桁まで | それより長い数字は数として読まない（unexpected-summary。レポートは JSON のデータのまま） |
   - 線形の時間: 行に分けるのも、制御シーケンス（色）を除くのも 1 回の走査。各パーサは各行を決まった回数だけ見る。入れ子の量指定のある正規表現は使わない（使う正規表現は 4,096 以下の行への単純な文字クラスだけ）。64 KiB〜1 MiB の敵対的な 12 の形で、1 MiB でも最大 80 ms 程度（テストの上限は 3 秒）
5. **失敗の扱い**（P2）: 読む関数は例外を投げない。パーサが投げた・JSON のデータでない数（無限大など）を返した → `unparsed`（`parser-error`）。時間の上限 → `unparsed`（`time-limit`）。例外の文言はどこにも出さない。始まらなかった check（`--fail-fast`・中断）は `not-applicable`（`not-run`）
6. **マスクと表記**（P4）: 名前は、**1 行まるごとを `maskSecrets` に通してから**切る（切った後に秘密の一部が残らないように）。入力全体はマスクしない（上の下調べ: masker の超線形）。レポートは従来どおり `copyJson(report, maskSecrets)` を通り、ファイルの出口で禁止文字を表記にする（JSON は `\uXXXX`、Markdown は `\u{HEX}`）。端末は出口（`createOutput` の `log`）が 1 行ずつ表記にしてマスクする。Markdown の名前は 1 行の表記（`oneLine`）、表のセルは `cell`（**v0.8.1 の注記**: Markdown の構文としても読まれない形にした。下の追記の決定 10・11）
7. **端末**: 各 check の状態の行の直後（FAIL の末尾の出力より前）に、`parsed: <tool> — <要約>` の 1 行と、名前を最大 10（`  <kind>: <name>`）、残りは `  … N more`。読めなかったときは `parsed: <tool> — not read (<reason>)` の 1 行。`not-applicable` のときは何も出さない（パーサの無い check の出力は今までと同じ）
8. **Markdown**: どれかの check が読まれた（`not-applicable` 以外）ときだけ、Checks の表の後ろに `## Parsed Output`（表: #・Check・Tool・Status・Summary と、check ごとの名前の一覧）。読まれた check が無いレポートの Markdown は v0.7.0 と同じ（**v0.8.1 の注記**: 名前の一覧は 1 つのコードブロックの行に変えた。下の追記の決定 10。M2-2-PS-R1-001）
9. **互換**（P9）: `schemaVersion` は 1 のまま（足すだけの変更。ADR-0003 の「後方互換の変更のみ」と R3-002 の前例）。最上位のキーは変えない。review-packet は知らないキーを読まないので、Verification の節は変わらない（テストで確かめた）。読む側は「`parsed` が無い」を「v0.8.0 より前のレポート」と読む

## 細部の決定（指示で「自分で決めてよい」とされたもの。理由つき）
- 欄の名前 `parsed`、状態は 3 つ（`truncated` は状態ではなく別の真偽値）: 切り詰めても末尾の要約は読めるので、「読めた」と「一部だけ読んだ」は両立する
- 入力は stdout と stderr の両方の末尾（各 1 MiB）: vitest は失敗の節を stderr に出す
- 上限の値: 1 MiB は runner の保持（10 MiB）の 1/10 で、自己 verify の最大の出力（64 KB）の 16 倍。4,096 は要約の行・名前より十分長い。50 と 300 はレポートの大きさを抑える値（1 check で最大 約 15 KB）。1,000 ms は線形で 1 MiB を読む時間の 10 倍以上
- 選び方に kind・名前を使わない、npm の script は 1 段だけ、package.json のシンボリックリンクは読まない: 決め方を単純にし、読めないものを無いとしないため
- eslint の「何も出ない」を 0 件とするのは終了コード 0 のときだけ: 別の失敗（設定の誤り）を 0 件と見せないため
- 終了コードは eslint の「0 件」の判断だけに使う（ほかのパーサは見ない）

## 代替案
- **設定の欄（`checks[].parser`）で選ぶ**: 利用者が書けば確実だが、設定の面が増え、書き間違いの扱い（未知のパーサ名など）が要る。P5（人間の決定）で採らない
- **ツールの出力の形を変えさせる**（aiqh が `--reporter=json` などを足す・JSON の出力を必須にする）: 利用者のコマンドを書き換えることになる。採らない。JSON の出力を推奨として文書に書くことも、テキストを読むこの版とは食い違うので書かない（README は「既定のテキストの出力のままにする」と書く）
- **終了コード・判定に反映する**（例: 件数が 0 なら FAIL）: P1・ADR-0004 に反する。採らない
- **Q2 を verify の中で security-scan を呼んで得る**: 2 つ目の実行の経路になる（ADR-0005）。security の check が別のツールのこともある。採らない
- **入力全体をマスクしてから読む**: masker が超線形の形がある（下調べ）。名前だけをマスクする
- **最上位に欄を足す**（例: `securityItems`）: 最上位のキーを固定したテストの期待値が変わり、check との対応も失う。採らない
- **`schemaVersion` を 2 にする**: 足すだけの変更で、1 を前提に読む側（review-packet）も壊れない。上げると読む側に分岐が要る。採らない
- **出力の見た目（署名）だけでツールを決める**: eslint は問題 0 件で何も出さないので決められない。採らない
- **runner の全出力（最大 10 MiB）を読む**: 時間と記憶が増える。要約は末尾にあるので末尾 1 MiB で足りる

## 既知の限界
- **pytest は読まない**（P6。ROADMAP の項目 39）
- 要約の行を出さない reporter・formatter（vitest の `--reporter=json`、eslint の `-f json` など）と JSON の出力（`npm audit --json`・`security-scan --json`）は `unparsed`（`no-summary`）。vitest で確かめたのは default・agent・github-actions の 3 つの reporter だけ
- npm の script は 1 段だけ・check の作業ディレクトリの package.json だけ。`npm run a && npm run b`・`pnpm`・`yarn` は選ばない。`unit-minpath` のように script の中で別のスクリプトが vitest を起こすものは `not-applicable`
- ツールの判断は語の名前による: `eslint.js` という名前の別のプログラムは eslint として読まれる（件数は誤りうるが、表示だけで判定は変わらない）
- 名前: 4,096 を超える行の名前は残らない（数えもしない）。切り詰めたときは、前の方の名前が欠けうる。eslint の warning と npm audit の low は名前にしない
- 時間の上限は協調的: 1 行の処理の途中では止まらない（各行は 4,096 以下なので有界）
- vitest の出力は環境（エージェントの判断・CI）で変わる。要約と失敗の節の形は 3 つの環境で同じだったが、vitest の将来の版で変わりうる（テストの fixture が先に落ちる）
- masker の private-key の形の超線形（項目 40）は直していない（名前は 1 行・4,096 以下なので、この欄では問題にならない）
- Windows では測っていない

## 影響
- 新規: `src/parse/`（`text.ts`・`tool.ts`・`select.ts`・`read.ts`・`describe.ts`・`vitest.ts`・`eslint.ts`・`npm-audit.ts`・`security-scan.ts`）、テスト（`tests/parse-output.test.ts`・`tests/parse-select.test.ts`・`tests/parse-verify.test.ts`・`tests/parse-security.test.ts`、fixture `tests/fixtures/parse/`）
- 変更: `src/types.ts`（`ParsedOutput` など・`CheckResult.parsed`）、`src/runner/run-checks.ts`（`parsed` を書く）、`src/commands/verify.ts`（端末の行）、`src/report/markdown.ts`（`## Parsed Output`）、`src/adapters/types.ts`（M1 の下書き `OutputParser` を消した）
- 文書: ARCHITECTURE（レポートの仕様・モジュール）、README、ROADMAP、ADR-0011 の状態の行
- 依存関係・`package-lock.json`・禁止文字の集合・npm の保護設定・`tests/structure/`・既存テストの期待値・設定の仕様・書き込み箇所の表は変えない（パーサは書き込まない。読むのは package.json だけ）

## 追記（v0.8.1: 独立レビュー R1 の 1 件。M2-2-PS-R1-001。2026-10-15）

### 文脈
- v0.8.0 の独立レビュー m2-2-parsers R1 は **Medium 1**（High 0・Low 0）。VALID（記録は `docs/reviews/m2-2-parsers/response-r1.md`）
  - M2-2-PS-R1-001: latest.md の `## Parsed Output` の名前の一覧に、ツールの出力から読んだ名前が Markdown のリスト項目としてそのまま入る。リンク・画像・インライン HTML・文字参照・強調・自動リンクとして読まれうる。数値の文字参照は表示のときに文字に戻るので、禁止文字の表記（決定 6）もすり抜ける
  - 同じ形が、M0 からある Failure Details の `- Summary:` の行（`errorSummary`: ツールの出力の最初の意味のある行）にもある
- 人間の決定（2026-10-15）: **案 A**（名前の一覧をコードブロックに入れる）、**範囲 S2**（`- Summary:` の行も同じ版で、区切りの安全な行内のコードにする）、版は v0.8.1

### 決定 10: 名前の一覧は 1 つのコードブロックの行（決定 8 の Markdown の形を変える）
- `## Parsed Output` の check ごとの名前の一覧（`- <kind>: <name>` と `- … N more (not listed)`）を、1 つのコードブロック（info string `text`）の行にする。fence は Failure Details の出力の末尾と同じ `fenceFor`（一覧の中の最長のバッククォートの並び +1。3 以上）
- 根拠は CommonMark 0.31.2 の §4.5（仕様の本文で確かめた。2026-10-15）
  - コードブロックの中身は「文字として扱い、行内の構文として解析しない」
  - 閉じの fence は、行頭（空白 3 つまで）にある、開きと同じ数以上のバッククォートで、後ろは空白とタブだけ
  - §2.5: 文字参照は、コードブロックとコードの範囲（code span）の中では読まれない
- 一覧の行はどれも `- ` で始まるので、名前が fence を閉じることは無い
  - fence の長さは、この安全のためには要らない
  - それでも出力の末尾と同じ部品を使い、「中のどの並びより長い」を保つ（形が変わったときの備え。テストで固定）
- 行の文字は v0.8.0 と同じ（`oneLine` の表記、名前の範囲・順・件数）。表示は、箇条書きから等幅の文字になる
- 表と見出し（`### <check> — <tool>`）は変えない

### 決定 11: `- Summary:` の行は 1 つの行内のコード（S2）
- `errorSummary`（ツールの出力の最初の意味のある行、または aiqh の理由）を、`oneLine` で 1 行にしてから、1 つの code span にする（`src/report/markdown.ts` の `codeSpan`）。`errorSummary` が null のときは従来どおり `-`
- 仕様（CommonMark 0.31.2 §6.1。本文で確かめた。2026-10-15）:
  - バッククォートの文字列は、前後がバッククォートでない、1 つ以上のバッククォート
  - code span は、その文字列で始まり、**同じ長さ**のバッククォートの文字列で終わる。対になる文字列が無ければ、バッククォートは文字のまま
  - 中の改行は空白になる。中身が空白で始まって空白で終わり、空白だけではないときは、前と後ろから空白を 1 つずつ取る
  - code span の中では、バックスラッシュのエスケープも文字参照も働かない
  - code span のバッククォートは、HTML のタグと自動リンクを除く、どの行内の構文よりも優先される
- 決めた規則（細部の決定）:
  - **区切り**: 中の最長のバッククォートの並び +1 のバッククォート（並びが無ければ 1 つ）。中に同じ長さの並びが無いので、途中で閉じない
  - **端の空白**: 次の 2 つのときに、両端に空白を 1 つずつ足す
    - 中身がバッククォートで始まるか終わる（区切りとつながって、長さの違う文字列になるため）
    - 中身が空白で始まって空白で終わり、空白だけではない（仕様が 1 つずつ取るため）
    - どちらのときも、仕様がちょうどその 2 つを取るので、表示は元の文字列と同じになる。空白だけの中身には足さない（仕様が取らないため）
  - **空の文字列**は空のまま（空の code span は書けない。runner は空の要約を作らない）
  - 改行・TAB・禁止文字は、`oneLine` で `\u{HEX}` の表記になってから入る。行は 1 行のままで、表記の `\` は code span の中では文字のまま
  - **優先の規則**: 行は `- Summary: ` のすぐ後ろが開きの区切りなので、前から HTML のタグや自動リンクが始まって code span にかかることは無い
- コードブロックにしなかった理由: 1 行の値で、行内のコードで表示が崩れない形が取れた（人間の決定の「取れなければコードブロックでもよい」の前段）
- 表示の変化: `- Summary: exit code 1: …` が、`exit code 1: …` を行内のコードで囲んだ形になる。既存テストの期待値（部分一致・行頭の検査）は変わらなかった

### 採らなかった案（R1 の `response-r1.md` の案 B・C）
- **案 B（名前ごとの code span）**: 既存テストの期待値が 2 つ変わる（`tests/parse-verify.test.ts` の `- failed-test: a | b`、`tests/parse-security.test.ts` の `- oversized-candidate: …`）。一覧は複数行なので、1 つのコードブロックのほうが単純
- **案 C（Markdown のメタ文字のバックスラッシュ・エスケープ。レビュアーの修正案の字義どおりの形）**: 採らない。理由は次の 3 つ
  - 止める構文を数え上げる拒否リストなので、漏れやすい（GFM の裸の URL の自動リンクは、`:` や `.` までエスケープしないと止まらない）
  - マスクの `[REDACTED:…]` や vitest の名前の区切り `>` にも `\` が付き、文字として読みにくい
  - 既存テストの期待値が 1 つ変わる

### 確かめたこと
- テスト `tests/regression-m2-2-ps-r1-001-markdown-names.test.ts`（29 件）。依存関係を足さない（P8）ので、Markdown のレンダラは使わない。§4.5・§6.1 の規則をテストの中に書いて確かめた
  - 名前と Summary の両方に、次の入力を使った: リンク・画像・インライン HTML・HTML のコメント、名前付きと数値の文字参照、強調・取り消し線、バッククォートの 1・3・6 の並び、山括弧の自動リンク・裸の URL、fence のように始まる文字列、生の U+202E、端の空白とバッククォート、空白だけ
  - `runVerify` を通した 1 件で、`latest.json` と端末の値が変わらないことも確かめた
  - 直す前の `2e7d2b0` で 27 件 FAIL・2 件 PASS（PASS は対照: 要約が無いときの `-` と、`latest.json`・端末の値）
- src をわざと壊す確かめ 8 つ（fence を外す、`fenceFor` や code span の長さを最長の並びと同じにする、端の空白を足さない・常に足す、code span を外す、「… N more」を fence の外に出す）: どれも 1〜24 件 FAIL
  - `fenceFor` の長さを最長の並びと同じにする形を捕まえたのは、「fence は中のどの並びより長い」の 1 件だけ（上の決定 10 のとおり、一覧の行は fence を閉じられないため）
- `latest.json`・端末・判定・終了コード・`schemaVersion` は変わらない（P1・P9）。原則 P1〜P9 と ADR-0026 の決定は変えない

### 既知の限界（足すもの）
- 実際のレンダラ（GitHub・エディタのプレビューなど）での表示は見ていない。仕様の規則から判断した
- latest.md のほかの値は、従来どおり `cell`・`oneLine` だけを通る
  - 対象: check の名前、コマンド、作業ディレクトリ、プロジェクトの名前、設定のパス、git のブランチ
  - どれも設定とリポジトリの値（利用者自身のもの）なので、この版では変えない
  - コマンドと作業ディレクトリは 1 つのバッククォートの code span の中にあるので、バッククォートを含む値はそこで閉じうる
- 出力の末尾（stdout・stderr）は、従来どおりコードブロック（バックログ 9）

### 影響（v0.8.1）
- 変更: `src/report/markdown.ts`（`renderParsed` の一覧のコードブロック、`renderFailure` の Summary の行、`codeSpan`）
- 新規: `tests/regression-m2-2-ps-r1-001-markdown-names.test.ts`
- 文書: この追記、ARCHITECTURE の §7.2、ROADMAP、CHANGELOG、README の状態の行
- 依存関係・`package-lock.json`・禁止文字の集合・npm の保護設定・`tests/structure/`・既存テストの期待値は変えない

## 追記（R2 の後: 独立レビュー m2-2-parsers R2 の結果。2026-10-16、docs だけ）

### 文脈
- v0.8.1 の独立レビュー R2（範囲 `v0.8.0..v0.8.1`、接頭辞 `M2-2-PS`）は **High 0・Medium 0・Low 0**。R1 の M2-2-PS-R1-001 は「解消」と評価された
- 依頼文に先に書いた基準（High・Medium が 0）に達したので、**`m2-2-parsers` のレビューは R2 で終えた**（記録は `docs/reviews/m2-2-parsers/response-r2.md`）
- レビュアーは静的な読解だけで、コード・テストは実行していない。問い 1〜5（R1 の指摘、区切りを抜ける経路、ほかのツールの出力から来る文字列、JSON・端末・判定・終了コード、既存の Markdown の読み手）のどれにも、新しい High・Medium・Low を特定しなかった

### R2 の結果（`docs/reviews/m2-2-parsers/findings-r2.json`）
- v0.8.1 の `aiqh review-import` で取り込んだ: exit 0、`High 0 / Medium 0 / Low 0; open 0`、`REVIEW LOOP: complete`
- `findings` は空、`previous` に R1 の 1 件（解消）。`source`: `independent-review-m2-2-parsers-r2-for-claude.md`、3,387 バイト、SHA-256 `4bcd8f443d390e24ac72599f8a6fab833e1575165063d4a392951a21cde4c508`（受領ファイルと一致）
- 続けて `aiqh review-check --label m2-2-parsers`: exit 0、`R1 to R2`、`previous: M2-2-PS-R1-001 (R1, resolved) — R2: 解消`、警告 0、`REVIEW LOOP: complete`

### レビュアーの但し書きの位置づけ（決定は変えない）
- 独立の実行をしていないこと: 品質の根拠は、機械で再現できる結果（v0.8.1 の単体検証・全テスト 10 回連続・`verify:dist`・CI の success）であって、レビュアーの結論ではない
- check の名前・コマンド・作業ディレクトリなどの表記上の制約と、外部のレンダラ・未提示の読み手との互換: 上の v0.8.1 の追記の「既知の限界」のとおり

### 影響
- 文書だけ（この ADR、`docs/reviews/m2-2-parsers/` の R2 の 3 ファイル、CHANGELOG の v0.8.1 の見出しの SHA、ROADMAP）。`src/`・`tests/`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えない
