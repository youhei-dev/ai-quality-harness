# ADR-0017: 端末への 1 回の書き出しは 1 行、複数行はコマンド自身の block。JSON のキーも出口を通し、端末には 2 つの基本関数だけが書く

- 状態: 採用（ADR-0016 の決定 3 と「既知の限界」を置換）。決定 3 の JSON のデータについての但し書きと、既知の限界の M2-2-R4-001 は ADR-0018 で置換（v0.5.10）
- 日付: 2026-09-25（M2-2、v0.5.4。M2-2 独立レビュー R3 の M2-2-R3-001〜003）

## 文脈
v0.5.2 で端末への出力を 1 つの出口に通した（ADR-0016）。独立レビュー R3 で次の 3 件（Medium）が見つかり、v0.5.3 で既知の限界として記録した。

1. **LF・TAB（R3-001）**: 既定の `"keep"` モードは、コマンド自身の書式だけでなく、1 行に埋め込んだ利用者由来の値（パス、ファイル名、check の出力の行、
   commander が引用する引数）の LF・TAB も残した。LF を含むファイル名で `SECURITY SCAN: no findings` と読める行が出た。終了コード、最後の判定の行、
   `--json` は正しかった
2. **JSON のキー（R3-002）**: `safeJson()` は値の文字列だけを表記にし、オブジェクトのキーをそのまま出した（今の各コマンドの `--json` に利用者由来のキーは無い）
3. **構造ガード（R3-003）**: 要素アクセスのキーが端末を指す文字列リテラルのときだけ検出し、`process[key]`（キーの型が `"stdout"` でも）を見なかった。
   洗い出しでは同じ種類の 24 形のうち 15 形を検出しなかった。`src/output.ts` はファイル単位で許可していたため、その中に足した出口を通らない書き出しも
   検出しなかった（今の `src/` はどの形も使っていない）

出口に渡す文字列を AST で全件洗い出した（105 か所と commander の 3 経路）。意図して複数行を出すのは 7 経路（init の設定案、設定の検証エラーの zod の詳細 3 か所、
commander の help の 2 経路と使い方エラーの提案）。コマンド自身の書式には、1 行の中の LF・TAB は無い（字下げは空白と `padEnd`）。

## 決定
1. **1 回の書き出し = 1 行（R3-001）**: 出口は既定で LF・TAB も `\u{A}` / `\u{9}` の表記にする（禁止文字と同じ扱い。review-packet は従来どおり）。
   1 行に埋め込んだ値が、行や桁を作ることは無い
2. **複数行は明示的な block**: コマンド自身の複数行の書式だけを block として書く（各コマンドは `output.block()` / `output.errorBlock()`、commander は
   `writeOut` / `writeErr`）。block は行を保ち、各行を 1 行と同じく処理する（TAB と禁止文字は表記、全体を masker に通す）。block に入る値は、作る所で表記にする
   - init の設定案: コメントに入る値（アダプタの理由・注記・有効化の案内）は `src/config/generate.ts` で LF・TAB・禁止文字を表記にしてから mask する。
     `--write` で書くファイルの中身も同じになる（値がコメントを終わらせて JSONC の行を作ることは無い）。JSON の値は従来どおり `JSON.stringify`
   - 設定の検証エラー: `ConfigError` は見出し（`summary`: 問題とパス、1 行）と詳細（`details`: zod の詳細、block）を分けて持つ。`message` は従来どおり
     両方を LF でつないだもの。**設定ファイルは R-006 で信頼された入力として扱う**ので、zod の詳細に入る設定の値（キー名など）の LF は block の行として残る。
     その場合も、各行の禁止文字と TAB は表記になり、秘密の形は mask される
   - commander: help と `--version` は block。使い方エラー（`outputError`）は 1 行と、commander 自身の提案の行（`(Did you mean …?)`）。commander は引数の
     全体、一部（`-v` が既知なら `-v<LF>x` を `-<LF>x` と引用する）、複数（", " でつなぐ）を引用するので、argv の要素とは照合せず、最後の改行と提案の前の改行
     以外の LF をすべて表記にする。commander はこれらの文を自分の文字（引用符、句点、提案）で終えるので、引数が提案の行になりすますことは無い
   - verify の check の出力の末尾: 従来どおり全体を mask してから行に分け、各行を 1 行として書く（行の中の TAB は表記になる）
3. **JSON のキー（R3-002）**: キーも値と同じく、表記にしてから mask する（1 つの関数で値を写す）。変換の後に 1 つのオブジェクトの 2 つのキーが同じ文字列に
   なったら、合わせずにエラーにする（fail closed: 何も出さず、CLI は最上位の「unexpected error」で exit 2）。写しのオブジェクトはプロトタイプを持たない
   （`__proto__` というキーも消えない）。JSON の文字列の中の LF・TAB は従来どおり（`JSON.stringify` が `\n` / `\t` にする。review-packet は表記）。
   この決定は JSON のデータ（文字列・有限の数・真偽値・null・配列、プロトタイプが `Object.prototype` か null の object）について。関数の値の `toJSON` など、
   JSON のデータでない値は処理しない（既知の限界。v0.5.5 で追記）。
   **v0.5.10 で ADR-0018 により置換**: `safeJson()` は JSON のデータだけを受け付け、それ以外は出力の前に拒否する（上の文は当時の記録として残す）
4. **端末に書くのは 2 つの基本関数だけ（R3-003）**: `src/output.ts` の `emitOut` / `emitErr` だけが `console`・`process.stdout` / `process.stderr` を参照し、
   引数は brand 型 `Safe` だけを受け取る。`Safe` を作るのは `safeText` / `safeJson` だけ。公開する関数の形と出力は変えない
   （行は `console.log` / `console.error`、commander は各ストリームの `write`、従来どおり）
5. **構造ガード**（`tests/structure/output-guard.ts`、型情報付き）
   - 端末に 1 つのプロパティで届くオブジェクト（`process`、`globalThis` / `global`、`node:process` のモジュール）は、名前でプロパティを読む形だけを許す。
     キーが「端末ではないプロパティの文字列リテラル」でない要素アクセス（キーの型を問わない）、関数への受け渡し（`Reflect.get`、
     `Object.getOwnPropertyDescriptor` など）、型のアサーション、別名、スプレッド、計算されたキーや rest の分割代入は違反。捨てられる値
     （`process.on(…)` の戻り値）は使用に数えない
   - 型検査で中身が見えないコード: `Function`（`Function` 型の値の呼び出し、たとえば関数の `constructor` を含む）、`eval`、`require`、`createRequire`、
     文字列リテラルでない `import()`、`node:vm` の読み込み（import の宣言と、文字列リテラルの `import()`。`process.getBuiltinModule("node:vm")` は
     検出しない: 既知の限界。v0.5.5 で追記）
   - ファイル記述子: 数値（値を問わない。1・2 でないことを示せない）への fs の書き込み、任意の呼び出しへの `fd` オプション、fs の呼び出しの
     `/dev/…`・`/proc/…` のパスのリテラル
   - 子プロセス: `stdio` のすべての要素が `"pipe"` / `"ignore"` でないもの。既定で端末を渡す関数（spawn、spawnSync、execFileSync、execSync、fork）では
     `stdio` の明示が必要。child_process の呼び出しの解決は `tests/structure/process-guard.ts` と共有する（process-guard は tests/ が起動するコマンドと
     シェルを、output-guard は src/ の子プロセスの出力先を見る）
   - `src/output.ts` の中: 端末の参照は `emitOut` / `emitErr` の中で、引数がすべて `Safe` の呼び出しとしてだけ許す。`safeText` / `safeJson` の外での
     `Safe` への型のアサーション、`Safe` の型述語、`Safe` が期待される所への `any` の値は違反（src/ 全体の `as any`・`as never`・総称型のアサーション・
     `@ts-ignore` は、brand ガード〈M2-1-R3-004〉が違反にする）
6. 禁止文字・秘密の形・利用者由来の LF・TAB の無い出力は変えない（v0.5.3 とバイト単位で一致することを確かめた。init の `--write` が書くファイルも同じ）

## 代替案
- 型で強制する（`Line` / `Field` のタグ付きテンプレート。M2-1 の `Md` と同じ仕組み）: コマンド自身の文と値を型で区別できるが、105 か所の書き換えが要る。
  決定 1 の不変条件の下では、出力の安全に効く追加の保証は無い。1 行の中で TAB を桁揃えに使う出力が必要になったときに再検討する
- 埋め込む値を `field()` で包み、AST の構造テストで強制する: 規則の網羅に頼る（列挙で直すと漏れる。M2-1 の教訓）
- 設定の検証エラーを zod の issue から作り直し、値を 1 行の field にする: より強いが、zod の表示の形を写すので版の違いでずれる。設定は信頼された入力（R-006）
- JSON のキーは識別子だけを許す: より強いが、将来ファイル名などをキーにできない
- 構造ガードを、要素アクセスのキーの型の評価と関数名での限定に留める（レビュアーの修正案）: `string` 型のキー、リフレクション、キャスト、動的なコード、
  fd、stdio が残る
- commander の使い方エラーで、argv の要素に一致する部分だけを表記にする: commander は引数の一部を引用することがあり（`-v<LF>x`）、一致しない

## 既知の限界
- 設定の検証エラーの詳細（zod）の中の、設定ファイルの値の LF は block の行として残る（設定は信頼された入力。各行の禁止文字・TAB は表記、秘密の形は mask）
- 構造ガードは、端末に書く次の方法を扱わない（今の `src/` はどれも使わない。`src/` が読み込む Node の組み込みモジュールは child_process・crypto・fs・path・
  string_decoder・zlib だけ）: `worker_threads`（Worker の標準出力は既定で親の端末へ）、`node:repl`・`node:test`（既定で標準出力へ）、
  `tty.WriteStream(fd)`、`util.debuglog`、`process.emitWarning`、実行時に組み立てたパス（`/dev/tty` など）への fs の書き込み。
  扱う場合の案は、`src/` が読み込める組み込みモジュールを一覧で限定すること（v0.5.5 で ROADMAP のバックログ 3 に入れた。v0.5.11 の番号で 2）
- **v0.5.5 で追記（M2-2 独立レビュー R4。`docs/reviews/m2-2/response-r4.md`）**
  - M2-2-R4-001: `safeJson()` は JSON のデータでない値を処理しない。自分の `toJSON` に関数の値があると（関数を返す数えられる getter も同じ）、`JSON.stringify()` が
    それを呼び、戻り値は表記・mask を通らずに出る。ほかの JSON のデータでない値は、消える（関数・`symbol`・`undefined`・数えられないプロパティ）、形が変わる
    （`Date`・`Map`・`Set`・クラスのインスタンス）、例外（`bigint`）のどれかで、生の値は出ない。今の各コマンドの `--json` は JSON のデータだけ
    （v0.5.5 で実行時に確認: vitest と通常の出力の比較で、コマンドからの `safeJson()` の呼び出し 35 回に JSON のデータでない値は 0 件）。
    ROADMAP のバックログ 1（入力を JSON のデータに限り、それ以外は fail closed で拒否する）
    - **v0.5.10 で ADR-0018 により置換（解消。バックログ 1 は外した）**。v0.5.10 の SP1 の洗い出しでは、上の「そのまま出る」形は 2 形だけではなく、ほかに 6 種類あった
      （`toJSON` を持つ関数、static `toJSON` を持つクラス、`toJSON` を持つ関数を返す getter、Array のサブクラス、配列の `constructor[Symbol.species]` の差し替え、Proxy）。
      上の文は v0.5.5 の時点の記録として残す（`docs/reviews/m2-2/response-r4.md` の v0.5.10 の節）
  - M2-2-R4-002: 構造ガードは `process.getBuiltinModule(…)` を検出しない。import・`require`・`createRequire`・`import()` を使わずに、`node:console`（端末）・
    `node:vm`（動的なコード）・`node:worker_threads` などを取れる（名前を変数で渡す形も）。同じ種類で検出しないもの: `process.dlopen`（ネイティブのアドオン）、
    `process.report.writeReport("stdout")`（診断レポートを標準出力へ書く）。`process.binding`・`process._linkedBinding`・`process._rawDebug` は型に無く、使うには
    キャストが要るので検出する。`getBuiltinModule` で取った `child_process`・`fs` の呼び出しは型で解決するので、stdio・fd の規則で検出する。
    今の `src/` はどれも使わない。ROADMAP のバックログ 2（読み込めるモジュールの一覧で限定し、import・`require`・`getBuiltinModule` を同じ規則で検査する）
- ファイルへの出力（verify のレポート、init が書く設定の JSON の値）の禁止文字は、この ADR でも対象外（ROADMAP のバックログ）。init の設定案の
  コメントの値だけは決定 2 で表記にした

## 影響
- 利用者由来の値に LF・TAB を含む出力は、その文字が表記になる（CHANGELOG v0.5.4）。check の出力の末尾の行の中の TAB も表記になる
- 設定の検証エラーは、見出しの行と zod の詳細を別の書き出しで出す（端末に出るバイトは同じ）
- JSON のキーが変換の後に衝突すると exit 2（今の各コマンドの `--json` では起きない）
- 回帰テスト: `tests/regression-m2-2-r3-001-line-breaks.test.ts`、`tests/regression-m2-2-r3-002-json-keys.test.ts`、
  `tests/regression-m2-2-r3-003-output-guard.test.ts`
