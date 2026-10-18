# ADR-0016: 端末への出力は 1 つの出口を通し、禁止文字を表記にしてから秘密の形をマスクする

- 状態: 採用（ADR-0012 の追記〈M2-0-R2-002〉の「text 出力側でのエスケープは行わない」を置換）。決定 3 と「既知の限界」は ADR-0017 で置換（v0.5.4）
- 日付: 2026-09-25（M2-2、v0.5.2。M2-2 独立レビュー R2 の M2-2-R2-001）。注記: 2026-10-18（v0.11.0。`Output` の口 `jsonWithin`。決定 1 の注記）

## 文脈
v0.5.1 で読めない既定の設定ファイルを設定の誤り（exit 2）にしたところ、security-scan がそのパスを含むエラー文を標準エラーへ出し、パスの禁止文字
（U+202E など）が生のまま出た（M2-2-R2-001、High）。security-scan の出力は masker だけを通していた。確かめると、同じことは security-scan の走査の出力
（作業フォルダのパス、ファイル名。v0.4.4 でも起きる）、verify、init、commander の使い方エラー、オプションの値の解析でも起きた。禁止文字を表記にしていたのは
review-packet（M2-1-R1-002）だけで、出力の出口が各コマンドに分散していた。

ADR-0012 の追記は、`security.allow` の `reason` / `path` をスキーマで制限することで、text 出力側のエスケープを不要とした。しかし端末に出る値は config だけでなく、
パス・ファイル名・git の出力・Node のエラー文・argv にも由来し、入力側の制限だけでは防げない。

## 決定
1. 標準出力・標準エラーへ書く文字列は、すべて `src/output.ts` を通す。各コマンドは `createOutput()`（`log` / `error` / `json`）、`src/cli.ts` とオプションの解析は
   `writeError()`、commander は `configureOutput(COMMANDER_OUTPUT)`（サブコマンドを足す前に設定し、各コマンドに引き継がせる）
   - 注記（2026-10-18、v0.11.0）: `createOutput()` の `Output` に、上限つきで JSON を出す口 `jsonWithin(value, maxBytes)` を 1 つ足した（`src/output.ts:217, 233-238`。`aiqh history` の `--json` の出力の上限。ADR-0034 の N、M4-D-R2-001）。`json` と同じ `safeJson` の文書（文字列とキーを 1 つずつ表記にしてからマスクする。JSON の全体はマスクに渡らない）を作り、UTF-8 のバイト数が `maxBytes` 以下のときだけ書いて、書いたかを返す。`Safe` を作るのはこれまでどおり `safeText`・`safeJson` だけで、書くのは `emitOut`・`emitErr` だけ（出力のガード〈`tests/structure/output-guard.ts`〉は変えていない）。この ADR の決定は変えない
2. 処理の順序: 禁止文字（`src/security/raw-chars.ts` の集合）を `\u{HEX}` の表記にする → masker（ADR-0006）。JSON は文字列を再帰的に表記にしてから `maskDeep`（値の文字列。オブジェクトのキーは表記にしない: 既知の限界 2。v0.5.4 からキーも表記 → mask、ADR-0017）
3. LF と TAB は禁止文字の集合に入っていない。既定では残す（複数行のメッセージ、check の出力の末尾、設定案、help の行と桁）。review-packet は「1 回の書き出し = 1 行」
   なので LF と TAB も表記にする（従来どおり）。**→ ADR-0017 で置換**（v0.5.4: すべてのコマンドで 1 回の書き出し = 1 行、複数行はコマンド自身の書式だけを block で書く）
4. 構造テスト `tests/structure/output-guard.ts`（型情報付き）: `src/` の中で大域の `console`、`process.stdout` / `process.stderr`、`node:console`、fd 1・2 や
   `/dev/stdout` への fs の書き込みを参照してよいのは `src/output.ts` だけ。宣言に解決して判定する（別名・分割代入・要素アクセス・`globalThis`・`node:process` を含む）。
   v0.5.4 で規則を広げた（端末のオブジェクトの動的な扱い、動的なコード、fd、stdio。`src/output.ts` の中は 2 つの基本関数だけ。ADR-0017）
5. 禁止文字も秘密の形も無い出力は変えない（v0.5.1 とバイト単位で一致することを確かめた）
6. `security.allow` の `reason` / `path` のスキーマでの禁止（ADR-0012 の追記）はそのまま残す

## 代替案
- security-scan だけを review-packet と同じ処理にする: verify・init・commander・オプションの解析の経路が残る。1 か所ずつ直すと漏れる（M2-1、M2-2-R1 の P2・O1 の教訓）
- LF と TAB もすべてのコマンドで表記にする: verify の check の出力の末尾や設定エラーの詳細など、禁止文字の無い通常の出力が変わる
- 禁止文字を取り除く: 何があったかが分からなくなる。表記にして残す

## 既知の限界（v0.5.3、M2-2 独立レビュー R3 で確認。3 点とも v0.5.4 で解消、ADR-0017 で置換）
1. **LF・TAB（M2-2-R3-001）**: 既定の `"keep"` モードは LF・TAB を残す。コマンド自身の書式だけでなく、埋め込んだ利用者由来の値（パス、ファイル名）の中の
   LF・TAB も残るため、端末の行・桁の見た目を崩せる（LF を含むファイル名で `SECURITY SCAN: no findings` と読める行が出ることを確かめた）。
   終了コード、最後の判定の行、`--json` の結果は変わらない（security-scan・verify・init で実測）。review-packet（`"escape"`）では LF・TAB も表記になる。
   **v0.5.4 で解消**（ADR-0017 の決定 1・2）
2. **JSON のキー（M2-2-R3-002）**: `safeJson()` は値の文字列だけを表記にし、オブジェクトのキーは表記にしない（キーの U+202E は生で出る）。
   今の各コマンドの `--json`（security-scan・init・review-packet。verify には `--json` が無い）のキーはすべて固定の識別子で、利用者由来のキーは無い
   （利用者由来の値を入れた出力で、キーを全件確かめた）。**v0.5.4 で解消**（ADR-0017 の決定 3）
3. **構造ガード（M2-2-R3-003）**: `tests/structure/output-guard.ts` は、動的なキーの `process[key]`（キーの型が文字列リテラルでも）を検出しない。
   また `src/output.ts` をファイル単位で許可するため、その中に足した出口を通らない書き出しを検出しない。今の `src/` に該当は無い。
   **v0.5.4 で解消**（ADR-0017 の決定 4・5）

## 影響
- 禁止文字を含む出力は、その文字が表記になる（CHANGELOG v0.5.2）。verify の check の出力の末尾にある ESC（色付け）や CR も表記になる
- ファイルへの出力（verify のレポート、init が書く設定）はこの ADR の対象外（ROADMAP のバックログ）→ ADR-0020（v0.5.24）
- 回帰テスト: `tests/regression-m2-2-r2-001-output-boundary.test.ts`
