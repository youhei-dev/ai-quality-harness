# ADR-0020: ファイルへの出力は書き込みの出口で形式別に禁止文字を表記にする。check の環境から色の強制を除く

- 状態: 採用（ADR-0016 の「ファイルへの出力は対象外」を引き継ぐ。ADR-0014・0017・0018 は変えない）
- 日付: 2026-10-02（M2-2、v0.5.24。ROADMAP のバックログ 9・10）

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
   - init の `aiqh.config.jsonc` は、`resolveConfig` で検証した後、書く直前に `escapeRawCharsAsJson()` を通す（JSON の値の DEL・C1・U+2028/2029・bidi・BOM が `\uXXXX` になる。読み戻すと元の名前）
   - 出口が書く直前なので、フィールドを足しても漏れない（新しい書き込み箇所は決定 7 のテストが見せる）
2. **表記にして残す理由と、review-packet との差**
   - (a) 禁止文字があれば書かない（fail closed）: verify のレポートは、チェックの判定（PASS/FAIL）を残す記録なので、出力に ESC があるだけでレポートが書かれなくなるのは逆効果。**不採用**
   - (c) 取り除く: 何があったかが分からなくなる（ADR-0016 が却下した理由と同じ）。**不採用**
   - (b) 表記にして残す: **採用**。JSON は機械が読むので、データを変えない JSON の escape にする。Markdown は人が読むので、端末と同じ表記
   - **review-packet は fail closed のまま変えない**（ADR-0014 の決定 7・代替案）。パケットはリポジトリのソースの**忠実なコピー**で、置換は内容を損なう。レポートと設定は、判定と提案を残す記録で、忠実さが要るのはデータ（JSON）だけ
3. **禁止文字の集合は `src/security/raw-chars.ts` の既存の 75 コードポイントのまま**: 変えるとパケットと docs のテストにも効く（ADR-0014 の決定 6）ので、別の依頼にする。
   集合の外（U+200B・U+200E/200F・U+061C・U+FFFD・NBSP など）は表記にならない（既知の限界）
4. **Markdown の構造**: 1 行のフィールド（見出し・表のセル・一覧: プロジェクト名、commit、branch、config のパス、コマンド、check の名前、cwd、要約）は LF・TAB も表記にし（`oneLine()`）、
   表のセルの `|` は `\|` のまま（`cell()`）。コードフェンスは「内容の中の最長のバッククォートの連なり + 1」（最低 3）。禁止文字・LF・TAB・長い連続バッククォートを含まない通常のレポートは、v0.5.23 と**バイト単位で同じ**（実測）
5. **verify のレポートの写し**: `buildReport()` は `maskDeep()` でなく、`safeJson()` と同じ JSON データの写し（`src/output.ts` の `copyJson()`。ADR-0018）を使う。関数・`undefined`・非有限の数・getter・循環は
   固定の文言で拒否（CLI は最上位の「unexpected error」で exit 2）。写しにプロトタイプは無く、`__proto__` という名前のキーも残る。文字列とキーは mask する（`maskDeep` はキーを mask しなかった）。キーの順序は変わらない。
   利用者由来の関数・キーは今のレポートに入らないので、見える変化は無い堅牢化。`maskDeep()` はテストが使うので `src/security/mask.ts` に残す
6. **対象外**: init の `.gitignore`・`package.json`（利用者の既存の内容に固定の 1 行を足す。内容は素通し）、review-packet（決定 2）、端末（ADR-0016/0017/0018）
7. **書き込み箇所の一覧のテスト**（`tests/file-write-sites.test.ts`。通常のテストで、構造ガードではない）: 型検査器で `src/` の fs の書き込み呼び出し（内容を書く関数）を列挙し、既知の 5 か所
   （init 3、review-packet 1、`writeAtomic` 1）と、門（変換）の有無が一致することを確かめる。新しい書き込み箇所が出ると落ちて、門を付けるか、除外の理由を書くことを求める。何が許されるかを決める規則ではなく、新しい書き込みを見えるようにするだけ
8. **check の環境（バックログ 10）**: `src/runner/env.ts` の `checkEnv()` が check の環境を 1 か所で作る = aiqh の環境から **`FORCE_COLOR` と `PY_COLORS` を除き、`NO_COLOR=1` を足す**（ほかは保つ）。`execute.ts` は
   `env: options.env ?? checkEnv()`（オプションで env を渡すテストは今までどおり）。`NO_COLOR` だけを足す案は、実測で既定では何も変えず、`FORCE_COLOR` があるときは eslint が色を出し続けて Node の警告も増えるので採らない。
   利用者の明示した `FORCE_COLOR` は check では無視する（check の出力は端末ではなくレポートと端末の表記に入るので、色の価値が無い）。check ごとの上書きは作らない（設定に `env` は無い）。
   `CLICOLOR_FORCE`・`NPM_CONFIG_COLOR` は出力を変えなかったので触らない。**バックログ 6（子の環境を最小にする）は、この関数を広げる**（子の環境を組み立てる場所は `checkEnv()` の 1 か所に限る）

## 代替案
- 作る時点で全文字列を表記にする（`buildReport` で `\u{HEX}`）: JSON の中身が `\u{1B}` の文字列になり、読み戻すと元の文字でない。新しいフィールドの漏れも出口ほど防げない
- 禁止文字があれば書かない: 決定 2
- 取り除く: 決定 2
- `NO_COLOR=1` を足すだけ: 決定 8
- 何もしない（10 を 9 だけで済ませる）: 9 で生の ESC は 0 になるので安全は保てるが、`FORCE_COLOR` のある環境ではレポートに `\u{1B}[31m` が並んで読みにくい（131 か所）

## 既知の限界
- **10 は 9 の代わりにならない**: チェックが任意の文字（明示した ESC、CR による進捗の行、OSC、利用者のスクリプトの出力）を出す入口は、環境の整理では塞がらない（実測: `FORCE_COLOR` なしでも `latest.md` に生の ESC）。9 の出口が塞ぐ。10 は読みやすさの改善
- **実端末で `cat` したときの害は推測のまま**: 端末の制御（色・カーソル・タイトル・OSC）、C1 の CSI、CR による行の上書き、bidi による表示の反転、NUL で壊れる道具、U+2028/2029 を行区切りとする道具は、実端末では確かめていない。実測で確認したのは、ファイルに生の文字が残ること、
  Markdown の構造が崩れること（見出しが増える）、JSON が壊れないこと
- **集合の外の文字は表記にならない**: U+200B（ゼロ幅）、U+200E/200F・U+061C（bidi のマーク）、U+FFFD、NBSP、タグ文字など。集合を変えるのは別の依頼（決定 3）
- **Markdown を描画する側での解釈は未確認**: 構造の崩れは、フェンスの外の見出しと表・節で確かめた（CommonMark の規則での数え方）。HTML の描画系やエディタでの見え方は確かめていない（推測）
- **`.gitignore`・`package.json` の既存の内容は素通し**（利用者のファイル）。書き込み箇所のテスト（決定 7）は新しい箇所を見せるだけで、変換の正しさは各テスト（75 コードポイントの往復と実 CLI）が確かめる
- ruff・mypy・Playwright の色は測っていない（この環境に無い）。python アダプタの既定コマンドのうち測れたのは pytest だけ
- 修正に独立した再レビューを受ける予定（1 回、上限 2 回。ROADMAP）。**受けるまでは、自己 verify と回帰テストで確認しただけ**

## 影響
- v0.5.24（バックログ 9・10）: `src/` を変えた（v0.5.14 以来）。8 ファイル +91／−29 行（`src/runner/env.ts` は新規 13 行、`src/security/raw-chars.ts` +14、`src/report/markdown.ts` +31／−12、`src/output.ts` +17／−7、`src/report/write.ts` +8／−5、`src/report/build-report.ts` +4／−3、`src/commands/init.ts` +2／−1、`src/runner/execute.ts` +2／−1）。
  `tests/structure/`・`brand-guard.ts`・禁止文字の集合・依存関係は変えない
- 新しいテスト 115 件（5 ファイル）: 関数（75 コードポイントの往復）、レポートの 3 ファイル、Markdown の構造、実 CLI（verify と init、環境）、JSON データの写し、書き込み箇所の一覧、`checkEnv`。v0.5.23 のコードでは 115 件中 108 件が FAIL（99 件中 95、10 件中 7、6 件中 6）。
  既存の 1,240 件の期待値は 0 件変更。テスト件数は 1,240（110 ファイル）から 1,355（115 ファイル）
- 実 CLI の実測（修正前 → 後）: 生の禁止文字 `latest.json` 22 → 0、`latest.md` 40 → 0、`history` 22 → 0、init の設定 5 → 0、パスに禁止文字のあるフォルダ 4 → 0。フェンスの外の見出し 1 → 0、LF による節の増加 1 → 0。
  `FORCE_COLOR=1` の verify の `latest.md` の生の ESC 131 → 0。JSON の読み戻しは元と一致。通常のレポートは v0.5.23 とバイト単位で同じ（C1・C2・C3 のそれぞれで比較）
- **代償として変わる出力**: 禁止文字・LF（1 行のフィールド）・TAB（1 行のフィールド）・長い連続バッククォートを含むレポートの見た目。`FORCE_COLOR`・`PY_COLORS` を持つ利用者の check は色を出さない。複数行のコマンド（LF を含む）は、表のセルで空白でなく `\u{A}` の表記になる
