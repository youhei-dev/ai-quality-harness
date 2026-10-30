# ADR-0028: verify は check の出力を表示のためだけに読む（出力パーサ）。security-scan の項目も同じ欄に入れる。判定と終了コードは変えない

- 状態: 採用（M2-2 の残り: ROADMAP の M2-2 の「内容」の「出力パーサの実装」と、項目 15 の「verify レポートへの oversized-candidate / `security.allow` 警告の構造化」。ADR-0011 の「出力パーサは `OutputParser` の型だけ定義（M1）」を置き換える〈型は `src/parse/tool.ts` の `ToolParser`。M1 の下書きは消した〉。ADR-0003・0004・0005 は変えない）。v0.8.1 で、決定 8 の Markdown の形を追記（決定 10・11）で変えた
- 日付: 2026-10-14（v0.8.0）。追記: 2026-10-15（v0.8.1）。注記: 2026-10-19（v0.13.0。末尾の「注記（v0.13.0）」）。追記: 2026-10-23（v0.14.0。末尾の「追記（v0.14.0: 決定 12 pytest のパーサ）」）。追記: 2026-10-26（v0.15.1。末尾の「追記（v0.15.1: 決定 13 ほかの 4 つの道具の選び方）」）。注記: 2026-10-30（v0.17.1。決定 12 の既知の限界に、pytest の実物の形の注記）。追記: 2026-10-30（v0.18.0。末尾の「追記（v0.18.0: 決定 14 node:test のパーサ）」）

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
- **pytest は読まない**（P6。ROADMAP の項目 39）。**v0.14.0 で解いた**（末尾の決定 12）
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

## 注記（v0.13.0、ADR-0036）

- security-scan の件数の行の内訳の最後に `raw characters: N` を足した（6 つの内訳）。数のキー `rawChars`（`gitignore` の後ろ、`suppressed` の前）、項目の種類 `raw-char`（`[raw-char] ` の行）、端末の `parsed:` の表示の `raw characters N`。パーサは新しい形（6 つの内訳）だけを受け付ける
- 古い aiqh と新しい aiqh が、verify（親。パーサ）とその子の `aiqh security-scan`（出力）で食い違うと、`parsed` は `unparsed`（`unexpected-summary`）になる。**パースの失敗は判定を変えない**（P1 のまま。check の PASS / FAIL と終了コードは変わらない）
- ただし、**検出の範囲は、実際に起動する `aiqh security-scan`（子）の版で決まる**。新しい verify と古い security-scan の組み合わせでは、生の文字の検出は効かない（古い子は生の文字を見ないので、ほかの finding が無ければ PASS のまま）。パースの失敗が判定を変えないことは、この組み合わせを安全にするものではない。`unexpected-summary` は、親と子の版の食い違いの印として扱う（ADR-0036 の決定 10）

## 追記（v0.14.0: 決定 12 pytest のパーサ。ROADMAP の項目 39。2026-10-23）

### 文脈
- P6（最初の版は vitest・eslint・npm audit、pytest は後）を、人間の決定（batch1、2026-10-21〜22。B1-Q7〜Q11）で解いた。設計は batch1 の設計（最終）`docs/reviews/batch1-design/design-final.md` の §3 と付録 A（設計の独立レビュー R1〜R3。`docs/reviews/batch1-design/`）
- 適用先の CI で、pytest の件数がログに出なかった（PASS の check の出力は表示しない。v0.9.1 の注記）

### 決定 12: pytest のパーサ（`src/parse/pytest.ts`）
- **選び方は語の位置で見る**（ほかの 4 つの道具と違う。B1-Q7 の B-1、B1-D-R1-002）: コマンド（`npm run <script>`・`npm test` なら、今までどおり 1 段だけ解いた script）を `src/command-words.ts` で単純コマンドと語に分け（引用符・`\` は語に印を付け、印の無い語だけを照らす。閉じていない引用符・`$(`・バッククォート・括弧・波括弧・`<<` を含む形は照らさない）、次の両方を満たすときだけ pytest を選ぶ
  1. ある単純コマンドが、`名前=値` の前置きを飛ばした後、P1: 実行位置の語の最後の部分が `pytest`・`py.test`、P2: `python`・`python3`・`python3.<数字>` に値を取らない旗（`-B`・`-E`・`-I`・`-O`・`-OO`・`-P`・`-s`・`-S`・`-u`・`-q`・`-b`・`-bb`・`-d`・`-v`）を 0 個以上置いて、語 `-m` と語 `pytest`、P3: wrapper（`uv`・`poetry`・`pipenv`・`pdm`・`hatch`・`rye` の `run`）の後ろに `=` を含む旗と値を取らない旗（`--frozen`・`--locked`・`--no-sync`・`--offline`・`--quiet`・`-q`）だけを置いて、P1 か P2
  2. その単純コマンドの前にも後ろにも、ほかの単純コマンドが無い（前に置く `cd <1 語>` だけは認める）
  - 理由: 「どの語でもよい」では、`echo "1 passed in 0.10s" pytest` の出力や、pytest の前後のコマンドが出す要約に似た行が、pytest の件数として出る（判定は変わらないが、件数が誤る）。選ばれない形は件数が出ないだけ
  - ほかの 4 つの道具の選び方（語の名前、どの語でもよい）は変えない（出力が変わらないように）。揃えるかは別の項目の候補（batch1 の設計の付録 B の 4）。選ばれた pytest と、同じ単純コマンドの語の名前でほかの道具が見つかったときは、今までどおり `several-tools`
- **要約**: stdout の、要約の形の**最後の**行。前後に `=` の並びがあれば除いて読む（片側だけなら要約の形ではない）。形は `<n> <語>` を `, ` でつないで ` in <秒>s`（または古い ` <秒> seconds`）、任意の ` (<時>:<分>:<秒>)`。または `no tests ran in …`（数はすべて 0）
- **語と数**: 8 つの語（passed・failed・skipped・deselected・xfailed・xpassed・warning/warnings・error/errors）だけ。知らない語（プラグインの `rerun` など）・同じ語の 2 回（`warning` と `warnings` も同じ語）・16 桁以上は `unexpected-summary`（B1-Q8 の A。決定 3 と同じ考え）。要約の形の行が無ければ `no-summary`
- **counts**: `passed`・`failed`・`skipped`・`deselected`・`xfailed`・`xpassed`・`errors`・`warnings`（無い語は 0）
- **items**: 要約の行より前の、最後の見出し `short test summary info`（前後の `=` を除いて読む）から要約の行までの、`FAILED ` で始まる行を `failed-test`、`ERROR ` で始まる行を `error`。名前は最初の ` - ` の前まで（無ければ行の残り）。見出しが読む範囲（末尾 1 MiB）の外に落ちたら items は無し（counts は読む）。名前のマスクと上限は決定 6・上限の表のまま
- **表示**（`src/parse/describe.ts`）: 0 でない数を counts の順に `7 passed, 2 failed, 1 skipped, 1 error, 1 warning` の形で（`error`・`warning` は 1 のとき単数）。すべて 0 なら `no tests ran`
- 読み方は 1 行を決まった回数だけ見る（入れ子の量指定のある正規表現は使わない）。P3 の最悪の形に pytest の 5 つの形を足した
- **互換**（B1-Q10 の A。記録だけ）: `parsed.tool` に新しい値 `pytest` が入る。`schemaVersion` は 1 のまま（足すだけの変更。決定 9）。ただし **v0.13.x までの `aiqh history` は、`parsed.tool: "pytest"` の入ったレポートを読めない**（`tool` の enum に合わず、そのファイルが `bad-shape` になり `HISTORY INCOMPLETE`・exit 2。設計では推定だったが、v0.14.0 の実装の段で、v0.14.0 の verify が書いた pytest の入った history を、v0.13.2〈`659cae1`〉の `aiqh history` で読んで確かめた。v0.14.0 の `aiqh history` は同じファイルを読める）。同じ history のディレクトリを版の違う aiqh で読むときだけ起きる。history の読み手の厳しさ（ADR-0034）は変えない

### 既知の限界（足すもの）
- 選ばれない形（`no-parser`。件数が出ないだけ）: wrapper の一覧に無い形（`coverage run -m pytest`・`tox`・`nox`・`make test`・`env pytest`）、`python -X …`・`-W …`・`-c …` など値を取る旗、`-mpytest` の 1 語、引用ありの `pytest`・`-m`・`run`、前後にほかの単純コマンドがある形、Windows の `python.exe`
- 実物で確かめた要約の形は `-q` の、passed と skipped だけの 1 回（batch1 の設計 §3.4）。既定の形（前後の `=`）・失敗とエラーと警告のある出力・`(h:mm:ss)`・古い ` seconds`・`no tests ran`・`short test summary info` の節は、合成の fixture（`tests/fixtures/parse/pytest-*.stdout.txt`。名前は架空）だけで確かめた [要確認]。pytest の将来の版やプラグインで形が変わると、件数が出なくなる（`no-summary`・`unexpected-summary`。判定は変わらない）
  - 注記（v0.17.1）: 適用先 B の CI（v0.17.0 の再利用ワークフロー。2026-10-29 の pull request と main の run）で、`-q` の passed と warning の形（`parsed: pytest — <n> passed, 1 warning`）が実物で出た。失敗・エラーのある形は、今も合成の fixture だけで確かめている。決定・テスト・fixture は変えない
- 要約を stdout に出さない設定（`-p no:terminal` など）・`--junitxml` だけの形は読まない

### 影響（v0.14.0）
- 新規: `src/parse/pytest.ts`、`src/command-words.ts`（項目 45 と共有）、テスト `tests/parse-pytest.test.ts`、fixture `tests/fixtures/parse/pytest-*.stdout.txt`（4 つ）
- 変更: `src/types.ts`（`PARSER_TOOLS`）、`src/parse/read.ts`（`PARSERS`・`COUNT_KEYS`）、`src/parse/select.ts`（pytest の選び方）、`src/parse/describe.ts`
- 既存テストの期待値の変更は `tests/parse-select.test.ts` の `pytest -q` の 1 行だけ（`no-parser` から `pytest`。設計 §3.7 が明示し、人間が承認した）。ほかは守りの追加（`tests/history-read.test.ts` の fixture の表、`tests/parse-output.test.ts` の P2・P3、`tests/parse-verify.test.ts` の verify の通し）
- 依存関係・`package-lock.json`・禁止文字の集合・npm の保護設定・`tests/structure/`・設定の仕様（欄を足さない。P5）は変えない

## 追記（v0.15.1: 決定 13 ほかの 4 つの道具の選び方。ROADMAP の項目 55。2026-10-26）

### 文脈
- 決定 12 で pytest だけを語の位置で選ぶことにし、ほかの 4 つの道具（vitest・eslint・npm audit・security-scan）を揃えるかは別の項目にした（ROADMAP の項目 55。batch1 の設計の付録 B の 4）
- 人間の決定（batch2、2026-10-26。B2-Q12 の A）。設計は batch2 の設計（最終）`docs/reviews/batch2-design/design-final.md` の §6（設計の独立レビュー R1・R2。`docs/reviews/batch2-design/`）

### 決定 13: ほかの 4 つの道具の選び方は、語の位置で見ない
- 今までどおり、単純コマンドのどの語でもよい（`src/parse/select.ts` の `toolsIn`。語の最後の部分で決める）。製品のコードは変えない
- 理由
  1. 誤った件数が出るのは、道具でない単純コマンドが、道具の要約と同じ形の行を出すときだけ。4 つの要約（vitest の 2 行の組、eslint の印の後ろの `N problems (…)`、npm audit と security-scan の固有の文）は、偶然に出る形ではない（pytest の短い 1 行の要約 `N passed in Xs` とは違う。決定 12 を厳しくした理由はこの違い）
  2. 語の位置で見ると、起動の形の一覧に無い wrapper（`cross-env`・`pnpm exec`・`npm exec`・`timeout`・値を取る npm の旗など）で、今出ている正しい件数が出なくなる（batch2 の設計の試作で、例の 22 の形のうち 9〜12。aiqh 本体と適用先 A・B の設定の check は、どの規則でも変わらない）
  3. 判定と終了コードは変わらない（P1。件数は表示だけ）
- 守りのテスト（`tests/parse-select.test.ts` の「item 55」）が固定するのは、正しく件数が取れる wrapper の形が選ばれることだけ（`cross-env CI=1 vitest run`・`pnpm exec vitest run`・`npm exec vitest`・`timeout 600 vitest run`・`npm --prefix web audit`）。選び方を変える日に、件数が消える形がテストの差分に出る

### 既知の限界（足すもの）
- `echo vitest …`・`printf '%s' eslint` のように道具の名前を引数に持つだけのコマンドでも、その道具のパーサが選ばれ、出力に要約の形の行があれば、その件数が出る（決定 3「別の道具の出力を、その道具の件数として出さない」と食い違う）。また、道具の後ろのほかの単純コマンドが要約の形の行を出すと、その件数が出る
- この限界は記録だけで、テストで固定しない。将来この限界を直しても、それ自体は回帰と扱わない（その形の期待を足す・変えるのは、直す版の設計で決める）
- 後で揃えるときのために、試作の 2 つの規則（「位置」と、pytest と同じ「B-1」）と、変わる形の一覧を、batch2 の設計（最終）§6.3 に残した

### 影響（v0.15.1）
- 変更: テスト `tests/parse-select.test.ts`（守りの 5 つの形を足した）、この ADR、ROADMAP の項目 55
- 製品のコード・出力・判定・既存のテストの期待値は変えない

## 追記（v0.18.0: 決定 14 node:test のパーサ。2026-10-30）

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
- 新規: `src/parse/node-test.ts`、`src/node-command.ts`（`src/adapters/node.ts` から `runsNodeTest` を移した。init の提案は変わらない。`nodeTestReporters` を足した）、テスト `tests/parse-node-test.test.ts`、fixture `tests/fixtures/parse/node-test-*.stdout.txt`（20 個。Node v24.13.1 の出力を、架空の名前のテストで取り直し、作業のディレクトリを `/work` に、junit のホスト名を `host` に置き換えた。色ありの形は ESC を `{ESC}` の字面で保存し、テストの中で ESC に戻す〈追跡するファイルに生の制御文字を置かない〉）
- 変更: `src/types.ts`（`PARSER_TOOLS`・`ParseReason`）、`src/parse/tool.ts`（`ParserInput` の `stdoutTruncated`、答えの理由と `OUTPUT_TRUNCATED`）、`src/parse/read.ts`（`PARSERS`・`COUNT_KEYS`・`stdoutTruncated` を渡す・理由を通す）、`src/parse/select.ts`（node-test の選び方）、`src/parse/describe.ts`、`src/adapters/node.ts`（import だけ）、`src/command-words.ts`（先頭の注釈だけ）
- 既存のテストの変更: `tests/history-read.test.ts` の道具ごとの fixture の表に node-test を足した（確かめる中身は変えない）。ほかは守りの追加: `tests/parse-select.test.ts`（新しい describe。設計 §3.2 の表の 17 行〈init の規則が受け入れるかの列も確かめる〉と、境目の 18 行）、`tests/parse-output.test.ts`（P3 の道具に node-test、node:test の最悪の形 5 つ。`stdoutTruncated` の新しい describe）、`tests/parse-verify.test.ts`（本物の `node --test` を verify に通す 3 件）。境目のテスト（1,048,576 単位ちょうどで読み、1 単位上で読まない、runner の切れ、合成の 20,000 件）は `tests/parse-node-test.test.ts`
- 判定・終了コード・実行時の依存・禁止文字の集合・`tests/structure/`・設定の仕様（欄を足さない。P5）は変えない

### 実装（v0.18.0）と、案（最終）からの違い
- 案（最終。`docs/reviews/batch3-design/adr-0028-addendum-draft-final.md`）の決定 14 のとおりに実装した。テストを先に書き、直す前の commit の SHA 固定の worktree で走らせた: `tests/parse-node-test.test.ts` は 61 件すべて FAIL、`tests/parse-select.test.ts` の新しい describe は node-test を選ぶ 13 行が FAIL（選ばない 22 行は PASS）、`tests/parse-verify.test.ts` の 3 件のうち 2 件が FAIL、`stdoutTruncated` の受け渡しと理由の 2 件が FAIL（ほかの 5 つのパーサの守りの 5 件は PASS）
- 違い 1（設計 §5.2 の見込み）: P3 の道具に node-test を足した行は、直す前も PASS した（見込みは FAIL）。直す前は node-test のパーサが無いので答えが `parser-error`（unparsed）になり、P3 はそれを拒まない（P3 が確かめるのは時間と線形性）。P3 の確かめを強めると、ほかの 5 つの道具の期待値も変わるので変えていない
- 違い 2（試すやり方）: verify を通すテストは、出力を写す道具の代わりに、一時のディレクトリの小さなテストのファイルで本物の `node --test` を走らせる（`--import` の前置きは、テストの実行の親のプロセスでは読まれず、出力を差し替えられない）。読まない側は、同じ出力で選ばれない形（`node --test && true`）と比べる
- 変異（使い捨ての worktree で 1 か所ずつ壊し、足したテストを走らせた）: 24 個（パーサの規則 0〜2 段めと名前 18、`stdoutTruncated` と理由の受け渡し 3、選び方 5〈設計 §5.2 の候補に、名前の時間を残す形と、`output-truncated` を `parser-error` にする形を足した〉）。22 個は 1〜44 件で落ちた。落ちなかった 2 個に、その条件だけが区別する入力を足し、どちらも落ちるようにした（v0.18.0 の 5 つ目の commit）: 終了コードが無いのを 0 とみなす形（失敗の無い組と終了コード無しで `unexpected-summary`。設計の e12 は失敗のある組なので、0 とみなしても合わなかった）、TAP のかたまりの後でも名前を読む形（本物の TAP の出力では、かたまりの後に spec の失敗の一覧は出ないので、合成の入力で区別した）
- 適用先 A の実物（設計 §5.3 の受け入れの基準 2）: 適用先 A の写し（`git clone --no-hardlinks`。`npm ci` は CI と同じく ignore-scripts。`env -i`・空の HOME・外への通信を止めて）で、unit の check のコマンド（`npm test`）の stdout は 12,421 バイト・125 行・UTF-16 で 5,913 単位（窓の約 0.6%）、stderr 0 バイト、113 件、exit 0。この版の `aiqh verify` で、unit の行の下に `parsed: node-test — tests 113 (pass 113, fail 0); suites 0` が出て、要約と一致した。v0.17.1 の `aiqh verify` との違いはこの 1 行だけ（各 check の状態・終了コード・判定・ほかの check の `parsed` は同じ）。適用先 B（pytest）は、v0.17.1 とこの版で、端末の出力（時間を除く）とレポートの `parsed` が同じ（`parsed: pytest — 444 passed, 1 warning`）。v0.17.1 の `aiqh history` は、この版の適用先 A のレポートを `bad-shape`（exit 2）にし、この版の `aiqh history` は読む（互換の記録どおり）
