# ADR-0020: ファイルへの出力は書き込みの出口で形式別に禁止文字を表記にする。check の環境から色の強制を除く

- 状態: 採用（ADR-0016 の「ファイルへの出力は対象外」を引き継ぐ。ADR-0014・0017・0018 は変えない）
- 日付: 2026-10-02（M2-2、v0.5.24。ROADMAP のバックログ 9・10）。2026-10-03（v0.5.25。決定 1・7・8 と既知の限界を、独立レビュー backlog-9-10-r1 の R1-001〜004 に合わせて直した）。2026-10-03（v0.5.26。決定 7・8 と既知の限界を、独立レビュー backlog-9-10-r2 の R2-001・R2-002 と R1-001 の残り〈stream〉に合わせて直した）。2026-10-11（v0.5.37。決定 8 にバックログ 6 の注記）。2026-10-18（v0.12.0。決定 1 に `html` の形の注記）。2026-10-19（v0.13.0。末尾の「注記（v0.13.0）」）。2026-10-29（v0.17.0。決定 3・既知の限界と、末尾の「注記（v0.17.0、ADR-0039）」）

## 文脈
- 端末への出力は v0.5.2 から出口が 1 つで、禁止文字を `\u{HEX}` の表記にしてから mask する（ADR-0016/0017/0018）。**ファイルへの出力は対象外**とされ、バックログ 9 に残った
- v0.5.23 での実測（実際の CLI を子プロセスで動かし、チェックが禁止文字の全候補を stdout・stderr に出す fixture）:
  - 端末への出力は生の禁止文字 0
  - `latest.md` は禁止文字のすべて（ESC・CR を含む C0、DEL、C1、U+2028/2029、bidi、BOM）を生で書く（40 か所）。`latest.json`・`history/*.json` は C0 を `JSON.stringify` が `\uXXXX` にするので、
    DEL・C1・U+2028/2029・bidi・BOM が生で残る（22 か所）。init の `--write` が書く `aiqh.config.jsonc` は、`package.json` の `name`（JSON の値）に入った同じ文字が生で残る（5 か所）。
    パスに禁止文字がある作業フォルダでも、`latest.json` に bidi、`latest.md` に ESC と bidi が生で書かれた
  - `latest.md` の構造が崩れる: check の出力に ``` と見出し行があると、フェンスの外に見出しが増える。`project.name` に LF と `## ` があると節が増える（LF は禁止文字の集合の外）
- バックログ 10: 子の check は aiqh の環境をそのまま継承する（`env: options.env ?? process.env`）。実測では、既定（パイプ）でどのツールも色を出さず、`NO_COLOR=1` を足しても変わらない。
  `FORCE_COLOR=1` があると eslint・vitest・`npm run`・pytest が色を出す（1 回の verify で `latest.md` に生の ESC が 131 か所）。`NO_COLOR` を併せても eslint は色を出し続け、`PY_COLORS=1` は pytest で `NO_COLOR` に勝ち、
  `FORCE_COLOR` と `NO_COLOR` の両方があると Node が stderr に警告を出す（164〜328 バイト）。`CLICOLOR_FORCE`・`NPM_CONFIG_COLOR` は出力を変えなかった

## 決定
1. **書き込みの出口で、形式別に、書く直前に変換する**（バックログ 9 の判断 (b)「表記にして残す」）
   - verify のレポート（`latest.json`・`history/<ts>.json`・`latest.md`）は `src/report/write.ts` の `writeAtomic()` が唯一の書き込み。形式（`json`／`md`）を受け取り、**JSON は禁止文字を `\uXXXX`**（`escapeRawCharsAsJson()`。
     読み戻したデータは元と同一）、**Markdown は `\u{HEX}`**（`escapeForDisplay(content, "keep")`。端末と同じ表記。TAB と LF は残す）にしてから書く
   - 注記（2026-10-18、v0.12.0。ADR-0035 の決定 5）: 形に `html` を足した（`aiqh history --html` の `dashboard.html`。`src/report/write.ts:102`）。内容の式は変えず、html は Markdown と同じ枝（`\u{HEX}`）を通る。HTML のすべての値は ADR-0035 の `h()` を通っているので、この門では通常は何も変わらない（最後の門）。決定 7 の表の行も変わらない（注記の文だけ足した）。上限は ADR-0034 の H（実際に書くファイルのバイト）
   - init の `aiqh.config.jsonc` は、`resolveConfig` で検証した後、書く直前に `escapeRawCharsAsJson()` を通す（JSON の値の DEL・C1・U+2028/2029・bidi・BOM が `\uXXXX` になる。読み戻すと元の名前）
   - 出口が書く直前なので、フィールドを足しても漏れない（Node fs の列挙した関数による新しい書き込み箇所は決定 7 のテストが見せる）
2. **表記にして残す理由と、review-packet との差**
   - (a) 禁止文字があれば書かない（fail closed）: verify のレポートは、チェックの判定（PASS/FAIL）を残す記録なので、出力に ESC があるだけでレポートが書かれなくなるのは逆効果。**不採用**
   - (c) 取り除く: 何があったかが分からなくなる（ADR-0016 が却下した理由と同じ）。**不採用**
   - (b) 表記にして残す: **採用**。JSON は機械が読むので、データを変えない JSON の escape にする。Markdown は人が読むので、端末と同じ表記
   - **review-packet は fail closed のまま変えない**（ADR-0014 の決定 7・代替案）。パケットはリポジトリのソースの**忠実なコピー**で、置換は内容を損なう。レポートと設定は、判定と提案を残す記録で、忠実さが要るのはデータ（JSON）だけ
3. **禁止文字の集合は `src/security/raw-chars.ts` の既存の 75 コードポイントのまま**: 変えるとパケットと docs のテストにも効く（ADR-0014 の決定 6）ので、別の依頼にする。
   集合の外（U+200B・U+200E/200F・U+061C・U+FFFD・NBSP など）は表記にならない（既知の限界）。v0.17.0 で、出口の判断に ADR-0039 を足した（集合は 75 のまま。security の check が finding とする層 (c) の文字〈RGI の並びの外〉も表記にする）
4. **Markdown の構造**: 1 行のフィールド（見出し・表のセル・一覧: プロジェクト名、commit、branch、config のパス、コマンド、check の名前、cwd、要約）は LF・TAB も表記にし（`oneLine()`）、
   表のセルの `|` は `\|` のまま（`cell()`）。コードフェンスは「内容の中の最長のバッククォートの連なり + 1」（最低 3）。禁止文字・LF・TAB・長い連続バッククォートを含まない通常のレポートは、v0.5.23 と**バイト単位で同じ**（実測）
5. **verify のレポートの写し**: `buildReport()` は `maskDeep()` でなく、`safeJson()` と同じ JSON データの写し（`src/output.ts` の `copyJson()`。ADR-0018）を使う。関数・`undefined`・非有限の数・getter・循環は
   固定の文言で拒否（CLI は最上位の「unexpected error」で exit 2）。写しにプロトタイプは無く、`__proto__` という名前のキーも残る。文字列とキーは mask する（`maskDeep` はキーを mask しなかった）。キーの順序は変わらない。
   利用者由来の関数・キーは今のレポートに入らないので、見える変化は無い堅牢化。`maskDeep()` はテストが使うので `src/security/mask.ts` に残す
6. **対象外**: init の `.gitignore`・`package.json`（利用者の既存の内容に固定の 1 行を足す。内容は素通し）、review-packet（決定 2）、端末（ADR-0016/0017/0018）
7. **書き込み箇所の一覧のテスト**（`tests/file-write-sites.test.ts`。通常のテストで、構造ガードではない）: 型検査器で、`src/` の **Node fs の列挙した関数**の呼び出し（`writeFileSync`・`appendFileSync`・`writeFile`・`appendFile`・`writeSync`・`write`・
   `writev`・`writevSync`・`createWriteStream`・`copyFileSync`・`copyFile`・`cp`・`cpSync`・`truncate`・`truncateSync`・`ftruncate`・`ftruncateSync`。`@types/node` の fs と fs/promises の宣言に解決する呼び出し）を見つけ、**既知の 5 か所の表**（init 3、review-packet 1、`writeAtomic` 1。各行 = ファイル・外側の関数・
   書く関数・**内容の引数の式の文字列をそのまま**・種別・注記）と一致することを確かめる。内容の引数の位置は関数ごとに表で持つ（`writev` は buffers の配列、`createWriteStream`・コピー・truncate 系の関数は内容の引数が無い）。種別は `gate`（書く直前に変換する）・`no-gate`（対象外。理由を注記に書く）・
   `not-content`（コピー・stream の作成・truncate。第 2 引数などが内容でない）。新しい箇所・消えた箇所・式が変わった箇所があると落ちて、人間が表を見直す。何が許されるかを決める規則ではなく、新しい書き込みを見えるようにするだけ
   - **保証すること**: 列挙した関数の呼び出しが `src/` に増えた・減った・内容の式が変わったことが見える
   - **truncate 系と stream の扱い**（v0.5.26。R2-001・R1-001 の残り）: `truncate`・`truncateSync`・`ftruncate`・`ftruncateSync` は内容の引数を持たないが、現在の長さより長くするとファイルに NUL（U+0000。禁止文字の集合に入る）が入るので、表に出す（呼び出しが `src/` に出ると差分になる。
     実測: 4 形とも、3 バイトのファイルを 4,096 バイトに延長すると、追加された 4,093 バイトがすべて 0x00。縮小・同じ長さでは何も足されない）。`createWriteStream` は呼び出しが差分になるが、**stream の `.write()`・`.end()` に渡す内容は検査しない**。呼び出しが出たら、人間が表に 1 行足して、その stream への書き込みを一緒に判断する
   - **保証しないこと**: 変換が内容の全部に掛かること。種別 `gate` は書いた人の記述で、テストは式を読んで門の有無を判定しない（v0.5.24 は、第 2 引数に変換関数の名前があれば「門あり」とする正規表現だったが、部分だけの変換を「門あり」にし、別の行で変換した変数を「門なし」にし、
     `createWriteStream`・コピーの第 2 引数が内容でないことと合わなかったのでやめた: R1-001・002）。変換の正しさは、各テスト（75 コードポイントの往復と実 CLI）が確かめる。列挙した関数でない書き込みは、下の既知の限界
8. **check の環境（バックログ 10）**: `src/runner/env.ts` の `checkEnv()` が check の環境を 1 か所で作る = aiqh の環境から **`FORCE_COLOR` と `PY_COLORS` を除き、`NO_COLOR=1` を足す**（ほかは保つ）。`execute.ts` は
   `env: checkEnv(options.env ?? process.env)`（`options.env` は呼び出し元の環境で、`checkEnv()` の元。完成した子の環境ではなく、渡した env も `checkEnv()` を通る。v0.5.24 は `options.env ?? checkEnv()` で、env を渡すと丸ごと迂回した: R1-004。
   `options.env` を渡す呼び出しは、変更前は `src/`・`tests/` に 0 か所。**v0.5.25 現在は `src/` 0、回帰テスト `tests/regression-backlog10-r1-004-options-env.test.ts` に 1 call site**〈R2-002〉）。`NO_COLOR` だけを足す案は、実測で既定では何も変えず、`FORCE_COLOR` があるときは eslint が色を出し続けて Node の警告も増えるので採らない。
   利用者の明示した `FORCE_COLOR` は check では無視する（check の出力は端末ではなくレポートと端末の表記に入るので、色の価値が無い）。check ごとの上書きは作らない（設定に `env` は無い）。
   `CLICOLOR_FORCE`・`NPM_CONFIG_COLOR` は出力を変えなかったので触らない。**バックログ 6（子の環境を最小にする）は、この関数を広げる**（**v0.5.37 の注記**: バックログ 6 は、`scripts/test-minimal-path.ts` が vitest に渡す環境を最小にする〈PATH・`NO_COLOR`・`FORCE_COLOR` だけ〉と読んで閉じた。`checkEnv()` は変えていない。利用者の check の環境を最小にする案は、設定の設計と既存テストの期待値の反転を伴うので採らなかった。check の子の環境を組み立てる場所は `checkEnv()` の 1 か所に限る。git を起動する箇所〈security-scan・init・review-packet・git の情報〉は check ではなく対象外）

## 代替案
- 作る時点で全文字列を表記にする（`buildReport` で `\u{HEX}`）: JSON の中身が `\u{1B}` の文字列になり、読み戻すと元の文字でない。新しいフィールドの漏れも出口ほど防げない
- 禁止文字があれば書かない: 決定 2
- 取り除く: 決定 2
- `NO_COLOR=1` を足すだけ: 決定 8
- 書き込み箇所のテストで、第 2 引数に変換関数の名前があるかを文字列検索して門の有無を判定する（v0.5.24）: 決定 7（偽陽性・偽陰性があり、内容の引数の位置も関数で違う）
- 書き込み箇所のテストで、Node の型宣言から書き込み系の関数・メソッド・stream の入口を全部列挙して追う（R1-001 のレビュアーの案）: 型を許可の根拠にする系統が増える（ADR-0019 決定 7）ので採らない。列挙した関数だけを表で照合し、残りは既知の限界に書く
- 何もしない（10 を 9 だけで済ませる）: 9 で生の ESC は 0 になるので安全は保てるが、`FORCE_COLOR` のある環境ではレポートに `\u{1B}[31m` が並んで読みにくい（131 か所）

## 既知の限界
- **10 は 9 の代わりにならない**: チェックが任意の文字（明示した ESC、CR による進捗の行、OSC、利用者のスクリプトの出力）を出す入口は、環境の整理では塞がらない（実測: `FORCE_COLOR` なしでも `latest.md` に生の ESC）。9 の出口が塞ぐ。10 は読みやすさの改善
- **実端末で `cat` したときの害は推測のまま**: 端末の制御（色・カーソル・タイトル・OSC）、C1 の CSI、CR による行の上書き、bidi による表示の反転、NUL で壊れる道具、U+2028/2029 を行区切りとする道具は、実端末では確かめていない。実測で確認したのは、ファイルに生の文字が残ること、
  Markdown の構造が崩れること（見出しが増える）、JSON が壊れないこと
- **集合の外の文字は表記にならない**: U+200B（ゼロ幅）、U+200E/200F・U+061C（bidi のマーク）、U+FFFD、NBSP、タグ文字など。集合を変えるのは別の依頼（決定 3）。v0.17.0 で ADR-0039 が層 (c) の分を解消した（U+200B・bidi のマーク・タグ文字などは、正しい絵文字の並びの外なら表記になる）。U+FFFD・NBSP は層 (c) に入らないので、今も表記にならない
- **Markdown を描画する側での解釈は未確認**: 構造の崩れは、フェンスの外の見出しと表・節で確かめた（CommonMark の規則での数え方）。HTML の描画系やエディタでの見え方は確かめていない（推測）
- **`.gitignore`・`package.json` の既存の内容は素通し**（利用者のファイル）。書き込み箇所のテスト（決定 7）は新しい箇所を見せるだけで、変換の正しさは各テスト（75 コードポイントの往復と実 CLI）が確かめる
- ruff・mypy・Playwright の色は測っていない（この環境に無い）。python アダプタの既定コマンドのうち測れたのは pytest だけ
- **書き込み箇所のテスト（決定 7）が見ない書き込み**（R1-001・R2-001。いずれも `src/` に 0 か所）:
  - **stream**: `createWriteStream` の呼び出しは site として見えて表との差分になる（内容の引数は無い。v0.5.26 でテストに固定した）が、戻り値の `.write()`・`.end()` に渡す**内容は検査しない**。入口は**塞がれていない**（ADR-0019 は `createWriteStream` の options を省略・文字列・新しい object literal に絞るだけで、
    文字列のパスへの書き込みは許す。実測: `createWriteStream("out.txt").write("x")` は出力ガードの違反にならない）。呼び出しが出たら、人間が表に 1 行足して、その stream への書き込みを一緒に判断する。
    独立レビュー 2 回目の分類は「不注意で書ける形」（(i) でも (ii) でもない）。**人間の判断で、構造ガード（`src/` で `createWriteStream` を禁止する規則）は足さず、一覧テストの表で見えるようにした**。残る限界は、stream に渡す内容の検査をしないこと
  - **`FileHandle`**: `fs/promises` の `open()` が返す `FileHandle` の `.write()`・`.writeFile()`・`.appendFile()`・`.createWriteStream()` は見えないが、**入口で塞がれている**。`node:fs/promises` は `BUILTIN_ALLOWED` の外で、`{ promises }`・`import * as fs` の `fs.promises`・default import・動的 `import()`・
    `process.getBuiltinModule` もすべて違反（実測。書き込み箇所のテストが、`node:fs/promises` の違反になることを確かめる）
  - **fs の API でない書き込み**: child process のシェルのリダイレクトなど。テストの対象外
  - **表に載せていない fs の関数**: `rename`・`link`・`symlink`・`mkdir`・`mkdtemp`・`rm`・`unlink`・`open` は、内容を書かない（理由はテストの `NOT_CONTENT`。この作業で分類した関数だけで、fs の全関数の一覧ではない）。
    実測: @types/node の fs と fs/promises が宣言する関数名 94 種のうち、一覧（`FS_WRITERS`）は 17、`NOT_CONTENT` は 16、**どちらにも無いものが 61**（読み取り・stat・`chmod`・`utimes`・`fsync` など。名前と仕様からの判断で、内容を書くものは見当たらない。実測はしていない）。`truncate` 系は v0.5.26 で一覧に入れた（NUL を作るため）
  - **Node の型宣言から書き込み系の関数・メソッドを全部列挙して追う方式は採らない**（型を許可の根拠にする系統を増やさないため〈ADR-0019 決定 7〉。やるなら別の依頼）
- **Markdown の `\u{HEX}` は表示用の表記で、元から同じ文字列があった場合と区別できない**（R1-003、Low。(iii)）: check の出力が `\u{1B}` という文字列そのものでも、本物の ESC でも、`latest.md` の表示は同じになる。**元データの忠実な確認には JSON を使う**。
  JSON は区別できる（バックスラッシュ自体が escape されるので、読み戻すと別の値になる）。実測: 本物の CLI の `verify` で、`latest.md` は同一の表示、`latest.json` は `\\u{1B}` と `\u001b` で別。生の禁止文字は、どちらのファイルにも残らない。コードは変えない
- 独立レビュー backlog-9-10-r1（範囲 `v0.5.23..v0.5.24`）を受けた: High 2 / Medium 1 / Low 1、`src/` に実在する漏れは 0（対応記録 `docs/reviews/backlog-9-10/response-r1.md`）。
  2 回目の backlog-9-10-r2（範囲 `v0.5.24..v0.5.25`）を受けた: 前回の R1-002・003・004 は解消、R1-001 は部分的に解消（stream）、新しい指摘は High 1 / Medium 0 / Low 1、`src/` に実在する漏れは 0（対応記録 `docs/reviews/backlog-9-10/response-r2.md`）。
  **2 回目が上限で、3 回目は行わない。v0.5.26 の修正は、独立した再レビューを受けていない**（自己 verify と回帰テストで確認しただけ）

## 影響
- v0.5.26（独立レビュー backlog-9-10-r2 の対応。`docs/reviews/backlog-9-10/response-r2.md`）: `src/` は変えない。書き込み箇所のテスト（`tests/file-write-sites.test.ts`）だけを変えた: `truncate` 系 4 つを一覧に足して `NOT_CONTENT` から外し（R2-001）、`createWriteStream` と truncate 系の新しい call が表との差分になることをテストで固定し、
  先頭コメントを `NOT_CONTENT` の実際の範囲と stream の扱いに合う文言に直した（R1-001 の残り）。新しいテスト 10 件（30 → 40 件、テスト全体 1,387 → 1,397 件）。修正前の定義では新テスト 9 件が FAIL。`src/` に truncate 系を足しても v0.5.25 のテストは見逃した（4 形とも）。
  docs の「`options.env` を渡す呼び出し」の件数を、現在の状態に揃えた（R2-002）。`tests/structure/`・`brand-guard.ts`・禁止文字の集合・依存関係は変えない
- v0.5.25（独立レビュー backlog-9-10-r1 の対応）: `src/` は `src/runner/execute.ts` の +2／−1 行だけ（`env: checkEnv(options.env ?? process.env)`。R1-004）。書き込み箇所のテストを、正規表現の判定から、既知の箇所を 1 件ずつ明示した表との照合に作り直した（3 → 30 件。R1-001・002）。
  新しいテスト 32 件の増加（`options.env` のテスト 5 件を含む）。修正前のコードでは、`src/` を 9 通りに変えた探りで旧テストが 6 件を見逃し、`options.env` のテスト 5 件のうち 4 件が FAIL。作り直した 3 件を除いて、既存テストの期待値の変更は 0 件。
  `tests/structure/`・`brand-guard.ts`・禁止文字の集合・依存関係は変えない
- v0.5.24（バックログ 9・10）: `src/` を変えた（v0.5.14 以来）。8 ファイル +91／−29 行（`src/runner/env.ts` は新規 13 行、`src/security/raw-chars.ts` +14、`src/report/markdown.ts` +31／−12、`src/output.ts` +17／−7、`src/report/write.ts` +8／−5、`src/report/build-report.ts` +4／−3、`src/commands/init.ts` +2／−1、`src/runner/execute.ts` +2／−1）。
  `tests/structure/`・`brand-guard.ts`・禁止文字の集合・依存関係は変えない
- 新しいテスト 115 件（5 ファイル）: 関数（75 コードポイントの往復）、レポートの 3 ファイル、Markdown の構造、実 CLI（verify と init、環境）、JSON データの写し、書き込み箇所の一覧、`checkEnv`。v0.5.23 のコードでは 115 件中 108 件が FAIL（99 件中 95、10 件中 7、6 件中 6）。
  既存の 1,240 件の期待値は 0 件変更。テスト件数は 1,240（110 ファイル）から 1,355（115 ファイル）
- 実 CLI の実測（修正前 → 後）: 生の禁止文字 `latest.json` 22 → 0、`latest.md` 40 → 0、`history` 22 → 0、init の設定 5 → 0、パスに禁止文字のあるフォルダ 4 → 0。フェンスの外の見出し 1 → 0、LF による節の増加 1 → 0。
  `FORCE_COLOR=1` の verify の `latest.md` の生の ESC 131 → 0。JSON の読み戻しは元と一致。通常のレポートは v0.5.23 とバイト単位で同じ（C1・C2・C3 のそれぞれで比較）
- **代償として変わる出力**: 禁止文字・LF（1 行のフィールド）・TAB（1 行のフィールド）・長い連続バッククォートを含むレポートの見た目。`FORCE_COLOR`・`PY_COLORS` を持つ利用者の check は色を出さない。複数行のコマンド（LF を含む）は、表のセルで空白でなく `\u{A}` の表記になる

## 注記（v0.13.0、ADR-0036）

- 決定 3（禁止文字の集合 `FORBIDDEN_RANGES` は 75 の符号位置のまま）は保つ。v0.13.0 の security の check は、その部分集合の定数 `SCANNED_RAW_RANGES`（`src/security/raw-chars.ts`。11 の符号位置: 双方向の制御文字と U+2028・U+2029）を足して使う。CR・FF・ESC・先頭の BOM はふつうのソースにあるので、ソースの走査には集合をそのまま使わない。部分集合であることはテストで固定した（`tests/regression-item48-raw-chars-scan.test.ts` の T1）

## 注記（v0.17.0、ADR-0039）

- verify のレポート（`latest.json`・history）と review-import の findings のファイルの JSON は、`writeReports`・review-import が `jsonForFile` で作る: 禁止の集合と層 (c)（RGI の並びの外）の文字を、値の上で決めた位置だけ JSON の escape（U+FFFF より上はサロゲートの組）で書き、データは変えない。表記にする文字の無い値は `JSON.stringify(value, null, 2)` と同じ字面、禁止の集合の文字だけの値は今までと同じ字面
- 決定 1 の書き込みの出口（`writeAtomic`）は変えていない: json の分岐の `escapeRawCharsAsJson`（禁止の集合だけ）は最後の門として残り、Markdown・HTML の分岐の `escapeForDisplay(content, "keep")` は ADR-0039 の判断で表記にする。init の設定のファイルは変えていない
