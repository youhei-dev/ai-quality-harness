# ADR-0035: 静的 HTML のダッシュボード（`aiqh history --html`）

- 状態: 採用（v0.12.0。ADR-0034 の集計を、1 つの HTML ファイルにする。設計と独立レビューの記録は `docs/reviews/m4-design/`〈設計 R3 の §3 がこの ADR の案。決定の番号は設計 R3 の §3 と同じで、コードの注釈とテストの名前もこの番号を使う。設計 R3 に無かった書き込み先の決まりは、決定 1 に入れた〉。出力の上限の数え方は ADR-0034 の H〈v0.11.2〉）
- 日付: 2026-10-18（v0.12.0）。追記: 2026-10-19（v0.12.1。表の見出しの寄せ。下の「追記（v0.12.1）」）

## 文脈

- ROADMAP の M4 は「ローカルダッシュボード（静的 HTML。外部送信なし）」
- HTML は、端末（ADR-0016）・JSON と Markdown のファイル（ADR-0020）と違う、新しい出力の形
- 埋め込む文字列（プロジェクトと check の名前、版の文字列）は、検証されるリポジトリの設定に由来する。HTML の構造を壊す文字（`<`・`&`・`"` など）や、禁止文字を含みうる
- 人がブラウザで開くので、script の実行・外への読み込みが起きないことを、形として保証したい
- 設計 R1・R2 の独立レビューの指摘 M4-D-R1-004（HTML と `--json` の数の照合）、M4-D-R2-001（出力の上限。HTML の部分）、M4-D-R2-002（`lastTimeoutSec` の名前。HTML の許可リストの部分）を、この版で入れる

## 決定

1. **コマンド**: `aiqh history --from … --html [--out <dir>]`（`src/commands/history.ts`、`src/cli-program.ts:193-194`）
   - `<out>/dashboard.html` を書く。`--out` は `--cwd`（既定は実行した場所）からの相対で、既定は `artifacts/history/`（D8。`artifacts/` は ADR-0007 で git 管理外）。無ければ作る
   - `--out` だけ（`--html` 無し）は使い方の誤り（`HISTORY ERROR (usage)`、exit 2）
   - `--json` と一緒に使える（同じ集計から作る）。**標準出力は `--html` の有無で変わらない**（表、または `--json` の文書）。書いたことは、標準エラーの行 `dashboard: dashboard.html (<n> bytes)` で示す（パスは出さない。ADR-0034 の B の 6）
   - 読めないものがあっても HTML は書く。目立つ節（「Unread history files」）で示し、終了コードは 2（ADR-0034 の H）
   - 入力の誤り・集計の上限のときは何も書かない
   - **書き込み先の決まり**（指示書で足した決まり。設計 R3 には無かった）
     - **symlink を通して書かない**: `--out` そのものが symlink なら `output-symlink`。`--out` の中の既存の `dashboard.html` が symlink なら `output-symlink`
     - `--out` が既にあってディレクトリでないとき、または無い `--out` の上にある既存のものがファイルのときは `output-not-a-directory`。既存の `dashboard.html` が普通のファイルでないときは `output-not-a-file`
     - **読んだ履歴のディレクトリには書かない**: `--out`（無いときは、その上にある既存のディレクトリ）か、その上のどれかのディレクトリが、読んだ履歴のディレクトリと同じなら `output-in-history`。同じかどうかは、パスではなく `dev` と `ino` で比べる（`src/run-history/read.ts` の結果の `directories`。パスは結果に入れない）
     - 確かめられない（`EACCES` など）・書けないときは `output-unwritable`（errno の名前だけを出す）
     - 確かめるのは書く前。`--out` を作った後に、それが symlink でないディレクトリかを、もう一度確かめる。読んでいる間・書いている間に、ほかの者が差し替える場面は、ADR-0034 の脅威モデルと同じく対象の外
2. **形**: `<!doctype html>`、UTF-8。要素は `src/run-history/html.ts` の固定のひな形から作る
   - **script は一切置かない**（`<script>` 要素は、どの `type` でも置かない）
   - 外の資源（`<link>`・`<img>`・`<iframe>`・`<object>`・`<embed>`・`url(…)`・`@import`・`href`・`src`）を置かない。イベントの属性（`on…`）を置かない
   - 開け閉めは `<details>` と `<summary>`（script 無し）
   - 推移の図はインラインの SVG。使う要素は `<svg>`・`<g>`・`<rect>`・`<line>`・`<polyline>`・`<title>`（設計の一覧の `<text>` は使わない）
   - HTML の要素は `html`・`head`・`meta`・`title`・`style`・`body`・`h1`〜`h3`・`p`・`section`・`table`・`thead`・`tbody`・`tr`・`th`・`td`・`details`・`summary`・`ul`・`li`。属性は `lang`・`http-equiv`・`content`・`charset`・`name`・`class`・`data-k`・`data-chart`・`viewBox`・`x`・`y`・`width`・`height`・`x1`・`y1`・`x2`・`y2`・`points`・`role`（テストが一覧を固定して比べる）
3. **CSP の meta**（`<head>` の最初の子。Q8 の決定）:
   ```
   <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-<固定の CSS の SHA-256 の base64>'; img-src 'none'; base-uri 'none'; form-action 'none'">
   ```
   - CSS は 1 つの `<style>` 要素の固定の文字列（値を入れない。`src/run-history/html.ts:108`）。その SHA-256 を `node:crypto` で計算して埋める（同 118 行）
   - `'unsafe-inline'` より狭い: 埋め込みの漏れで別の `<style>` 要素が入っても、ハッシュが合わないので効かない。`style` 属性も効かない（ハッシュが `style` 属性に効くのは `'unsafe-hashes'` があるときだけ）
   - `default-src 'none'` で、script・接続・フォント・フレームはすべて止まる
   - `<meta name="referrer" content="no-referrer">` も置く
   - meta の CSP では `frame-ancestors` は効かない。ローカルのファイルとして開く前提なので、要らない
4. **値の埋め込みとエスケープ**: 値を入れてよい場所は、要素の本文と、二重引用符で囲んだ属性の値（`data-k`・`data-chart`・SVG の座標と大きさ・`points`・`viewBox`・`class`・`role`）だけ。要素の名前・属性の名前・CSS・URL には、値を入れない
   - **すべての値（数も、SVG の座標も、固定の語の `class` も）を 1 つの関数 `h(value)` に通す**（`src/run-history/html.ts:84`）:
     1. 文字列にする。`null` は `-`。数は `Number.isFinite` を確かめてから `String`、座標は `toFixed(1)`。集計の数は ADR-0034 の G で有限と確かめてあるので、偽なら aiqh の誤りとして例外を投げる（CLI は予期しない誤りとして exit 2。HTML は書かない）
     2. `maskSecrets`
     3. `escapeForDisplay(s, "escape")`（禁止文字と LF・TAB を `\u{HEX}` の表記に）
     4. `&` → `&amp;`、`<` → `&lt;`、`>` → `&gt;`、`"` → `&quot;`、`'` → `&#39;`
   - `h()` の結果は、ブランドの付いた型 `HtmlText`。ひな形（タグ関数）は `HtmlText` と、ソースに書いた固定の文字列だけを受け取る（`Safe` の作法。`src/output.ts`）
   - SVG の `<title>` に入れるのは、固定の語・日付・名前だけで、数を入れない（数は表の `data-k` の要素だけ）
   - 数の表示の文字列は `String(n)`（JSON の数と同じ。割合は ADR-0034 の G で小数 4 桁）。単位や百分率の書き換えをしない
5. **書き込みの出口と上限**: `writeAtomic(target, content, "html")`（`src/report/write.ts:102`）
   - `format` の型に `"html"` を足した。内容の式（`format === "json" ? escapeRawCharsAsJson(content) : escapeForDisplay(content, "keep")`）は**変えない**。html は Markdown と同じ枝で、禁止文字を `\u{HEX}` にする（すべての値は `h()` を通っているので変わらない。最後の門）。書き込み箇所の一覧のテストの行は変わらない（注記の文だけ足した）。ADR-0020 の注記
   - **上限は、実際に書くファイルの全部のバイト**（ADR-0034 の H。32 MiB）。HTML の文字列の UTF-8 のバイト数を書く前に確かめ、超えたら `HISTORY ERROR (output-too-large)`・何も書かない。上の門で中身が変わらないので、確かめた数と書いたファイルのバイト数は同じ（テストは、書いたファイルの大きさで、上限ちょうど・1 バイト超過を確かめる）
   - **書く順**: HTML を作って確かめる → 標準出力の上限を確かめる → HTML のファイルを書く → 標準出力に書く。出力の API の上限つきの口に、上限を確かめた後・書く前に呼ぶ `beforeWrite` を足し（`src/output.ts:223, 229, 246-249`。ADR-0016 の注記）、そこでファイルを書く。ファイルが書けないとき、標準出力は空のまま。標準出力が上限を超えるときは、ファイルも書かない
6. **HTML と `--json` の数の照合**（M4-D-R1-004）
   - HTML に出す数は、すべて `data-k="<JSON のパス>"` を持つ要素の本文に、その数だけを置く（例: `<td data-k="projects.0.runs">12</td>`）。パスは、集計の JSON の根からのキーと配列の添字を `.` でつないだもの（添字は 0 から、先頭の 0 なし）。JSON のキーはすべて固定の語なので、パスは名前などの値を含まず、一意
   - **対応表**（`HTML_SHOWN`。`src/run-history/html.ts:24`。`*` は配列の添字）: `sources.*` の `historyFiles`・`read`・`unread`・`duplicates`・`ignored`・`leftoverTemporary`、`projects.*` の `runs`・`interrupted`・`verdicts.*`・`dirty.*`・`durationMs.median`・`max`、`projects.*.days.*` の `runs`・`PASSED`・`FAILED`・`ERROR`、`toolVersions.*.runs`、`configs.*.runs`、`checks.*` の `runs`・`PASS`・`FAIL`・`SKIPPED`・`failRate`・`timedOut`・`durationMs.median`・`max`・`maxShareOfTimeout`、`counts.*.days.*` の `value`・`unknownRuns`、`failureProne.*` の `PASS`・`FAIL`・`failRate`
   - **照合しない数の許可リスト**（`HTML_NOT_SHOWN`。同 64 行）: `schemaVersion`（出さない）、`sources.*.index`・`unread.*.source`・`projects.*.sources.*`（数としては出さず、札 `#<番号>` として出す）、`projects.*.checks.*.lastTimeoutSec`（出さない。設定の値。M4-D-R2-002 の名前）
   - 数でない値（真偽、名前・版・日付・ハッシュの先頭 12 桁）は照合の外。真偽は固定の語（`required`・`optional`・`truncated`）
   - SVG の図形の大きさは照合しない。照合するのは図の点の数: 各 `<svg>` に元の配列のパスを `data-chart` として置き、日ごとの棒（`<g>`）の数が日の数と、折れ線の点の数が値の有る日の数と同じことを確かめる
7. **出さない欄が出ないことの確かめ**（テスト。`tests/history-html.test.ts` の 1 件）: 履歴の fixture の出さない欄（`project.root`・`configPath`・`git.commit`・`git.branch`・`command`・`cwd`・`description`・`errorSummary`・`stdoutTail`・`stderrTail`・`parsed.items` の名前〈allow のルールの名前を含む〉・`parsed.reason`）に、欄ごとに違う目印の文字列を入れ、HTML・`--json`・端末・誤りのどれにも、目印と `--from` のパスが無いことを確かめる（同じ fixture の端末と `--json` も、このテストで確かめる。端末と `--json` は v0.11.0 から `tests/history-cli.test.ts` でも確かめている）
8. **テスト**（`tests/history-html.test.ts` 7 件〈決定 7 の 1 件を含む〉、`tests/history-html-cli.test.ts` 14 件。同じ fixture から `--json` と HTML を作る）
   - 注入: 名前に `</td><script>`・引用符・`&`・文字参照の形・`</style>`・`</title>`・`javascript:`・`<svg onload=…>`・`<!--`・`]]>`・禁止文字・LF・TAB（数から組み立てる）を入れても、要素と属性の名前が固定の一覧の中で、イベントの属性・`<script`・生の禁止文字が無く、名前が参照のまま本文に出る
   - CSP: `<head>` の最初の子で、`style-src` のハッシュが `<style>` の中身の SHA-256 と同じ
   - 対応表: JSON の数の葉のすべてが、対応表か許可リストのどちらか 1 つだけに当たる。対応表のすべてが HTML に 1 回、JSON と同じ文字列で出る。`data-k` に重複が無く、許可リストのパスが無い。最後の run の `timeoutSec` に置いた目印の数が HTML のどこにも無い。札の並びが `sources` の順
   - SVG: 要素と属性が決まった一覧、座標が `toFixed(1)` の形で viewBox の中、`viewBox`・`role`・`class` が固定の値、棒と点の数が配列の長さ、`<title>` に日付のほかの数が無い
   - コマンド: `--out` だけは使い方の誤り。既定の出力先と相対の `--out`。symlink・ファイル・履歴のディレクトリへの書き込みの拒み。読めないものがあっても書く（exit 2）。入力の誤りでは何も書かない。ファイルの上限（ちょうど・1 バイト超過）、標準出力が上限を超えるときはファイルも書かない。`--html` の無いときの標準出力が v0.11.2 と同じ（固定の fixture の SHA-256）、`--html` のときも標準出力が同じ。`writeAtomic(…, "html")` の禁止文字の表記。CLI

## 上限の値と測り（v0.12.0。2026-10-18、手元の macOS・Node 24。値は数だけ）

- aiqh 本体の履歴（1 プロジェクト、run 222）の HTML は 201,089 バイト（`--json` は 162,619 バイト）
- 3 か所の履歴（aiqh 本体と、適用先の 2 つ。プロジェクト 3、run 248）の HTML は 237,261 バイト（`--json` は 186,242 バイト）。`data-k` は 2,360 個で、`--json` の対応表の数と 2,360 個すべて一致
- HTML は `--json` のおよそ 1.2〜1.3 倍。上限（32 MiB）は ADR-0034 の N と同じ値のままにした

## 代替案

- **`'unsafe-inline'` の style-src**: 簡単だが、埋め込みの漏れのときに `style` 属性が効く。ハッシュにした
- **小さな script で並べ替え・絞り込み**: 外へ出ない script でも、「script が無い」形の保証を失う。`<details>` で足りる
- **Markdown（`latest.md` の拡張）**: 推移の図を描けず、CI では履歴が 1 件しかない（M4 SP1）
- **CI の Job Summary**: CI に履歴が無い（ADR-0031: artifact・cache に上げない）。公開のリポジトリの Job Summary は誰でも見られる
- **HTML を標準出力の後に書く**: 標準出力を書いた後でファイルが書けないと、`HISTORY ERROR` なのに標準出力が残る（ADR-0034 の H の「集計も一覧も出さない」に反する）。上限つきの口の `beforeWrite` で、標準出力の前に書く
- **`--from` のプロジェクトのルートの中にも書かない**: 本体の履歴を `--from .` で読み、既定の出力先（`artifacts/history/`）に書く普通の使い方ができなくなる。守るのは、読んだ履歴のディレクトリ（ほかのものが入ると、次に読むときの `ignored` になる）だけにした

## 既知の限界

- CSP の効き方と `<details>` の見え方は、ブラウザに依る
- HTML はローカルのファイルとして開く前提。ほかの人に渡すときに何を含むか（プロジェクトと check の名前、版、ハッシュの先頭）は、利用者が判断する
- 表記にした禁止文字（`\u{HEX}`）は、そのまま文字として見える
- SVG の図形の大きさは `--json` の数と照合しない（点の数だけ）。図の見た目の正しさは、手で開いて確かめる
- 出力の上限（32 MiB）を超える HTML は書かない（`output-too-large`）。`--from` を分けて別々に作る
- symlink を確かめるのは `--out` そのものと `dashboard.html` だけで、`--out` の上のディレクトリ（macOS の `/tmp` など）は確かめない
- 書く前の確かめと書き込みの間に、ほかの者が差し替える場面は対象の外（脅威モデル）。`writeAtomic` は一時ファイルを `O_NOFOLLOW`・`O_EXCL` で作り、rename で置き換えるので、その時点の `dashboard.html` の symlink の先は書き換えない
- `HtmlText` のブランドは型で守る（`tests/structure/` のブランドの見張りの対象は、既存の 3 つのブランドだけ）。漏れは、上のテスト（要素と属性の一覧、注入、生の文字）で見つける

## 影響

- `src/run-history/html.ts`（新。設計 R3 の「影響」の `src/history/html.ts` ではなく、ADR-0034 の A と同じく `src/run-history/` に置いた: push の前の走査が、`history/` の下の変更をすべて止めるため）、`src/commands/history.ts`（`--html`・`--out`・書き込み先の確かめ）、`src/cli-program.ts`、`src/output.ts`（`beforeWrite`）、`src/report/write.ts`（`format` の型だけ）、`src/run-history/read.ts`（結果の `directories`）、新しいテスト
- `tests/file-write-sites.test.ts` の `writeAtomic` の行の注記の文
- docs: ADR-0020・0034・0016 の注記、ADR の一覧、ARCHITECTURE、README、ROADMAP
- 組み込みのモジュール: `node:crypto`（CSP のハッシュ）・`node:fs`・`node:path` は一覧にある。足すものは無い。`tests/structure/` は変えていない
- 依存関係は変えない

## 追記（v0.12.1）

- 決定 2 の形に、表の見出しの寄せを足した: 文字の値の列（本文のセルが `<td class="name">` の列）の見出し `<th>` に `class="name"` を付け、値と同じ左寄せにした。数の列の見出しは右寄せのまま。固定の CSS の `th.name,td.name{text-align:left}` は v0.12.0 からあり、変えていないので、決定 3 のハッシュも同じ
  - 直した表: Days、Tool versions、Config hashes、Checks、Counts（各表）、Failure-prone checks。Sources（行の見出しの `#<n>` は、見出しと同じ右寄せ）とプロジェクトの要約（数だけ）は変えていない
  - きっかけは、利用者がダッシュボードをブラウザで開いた確かめ（2026-10-19。表・`<details>` の開け閉め・SVG の図が表示され、CSS が効いていた）で見つけた、「Failure-prone checks」の `project`・`check` の見出しの右寄せ
- 決定 8 のテストに 2 件を足した（`tests/history-html.test.ts` は 9 件）: すべての表で、見出しの `class` が、その列の本文のセルと同じこと（Failure-prone checks の見出しは名前を書いて確かめる）。固定の CSS が `th`・`td` を右に、`class` の `name` を左に寄せること
