# ADR-0019: `src/` が実行時に読み込むモジュールを一覧で限り、`process` の 6 つのメンバーを使わない（構造ガード）

- 状態: 採用（ADR-0017 の既知の限界のうち、構造ガードの項〈`worker_threads` などの列挙と、v0.5.5 で追記した M2-2-R4-002〉を置換）
- 日付: 2026-09-28（M2-2、v0.5.17。M2-2 独立レビュー R4 の M2-2-R4-002。ROADMAP のバックログ 1）。2026-09-30（v0.5.18。決定 2 の要素アクセスのキーの扱いを実装に合わせて正確にした。M2-2 独立レビュー builtin-r1 の M2-2-BUILTIN-R1-001）。2026-09-30（v0.5.19。決定 2 の要素アクセスのキーを、型でなくソース上の文字列リテラルで判定するように改訂し、決定 7 を追加した。M2-2 独立レビュー builtin-r2 の M2-2-BUILTIN-R2-001）

## 文脈
- ADR-0017 の決定 5 の構造ガード（`tests/structure/output-guard.ts`）は、端末への参照（`console`・`process.stdout` / `process.stderr`）、端末に 1 つのプロパティで届く
  オブジェクトの動的な扱い、型検査で中身が見えないコード（`Function`・`eval`・`require`・`createRequire`・計算された `import()`・`node:vm` の読み込み）、fd と `/dev/` の
  パス、子プロセスの `stdio` を違反にする。組み込みモジュールを一覧で限る考え方は無く、import の宣言で見るのは `node:console` と `node:vm` だけだった
- ADR-0017 の既知の限界（v0.5.4）: `worker_threads`、`node:repl`・`node:test`、`tty.WriteStream(fd)`、`util.debuglog`、`process.emitWarning`、実行時に組み立てたパスへの
  fs の書き込みを扱わない
- M2-2 独立レビュー R4 の M2-2-R4-002（Medium）: `process.getBuiltinModule(…)` を検出しない。import・`require`・`createRequire`・`import()` を使わずに、`node:console`・
  `node:vm` などを取れる。v0.5.5 で、同じ種類の `process.dlopen`・`process.report.writeReport("stdout")` も既知の限界に足した
- v0.5.17 の SP1 の洗い出し（写しで実測。`docs/reviews/m2-2/response-r4.md` の v0.5.17 の節）: 同じ種類の 63 形（塞ぐべき形 50、対照 8、塞げない・範囲外 5）。
  塞ぐべき形のうち、`import()` に `data:` の URL を渡す 1 形は型検査で止まる。型検査を通る 49 形のうち、v0.5.16 のガードが検出したのは 9 形で、40 形を見逃した。
  見逃した形のうち実行時に動かした 13 形は、どれも端末に届いた（`process.stdin.write` は stdin が端末のとき、`util.debuglog` は `NODE_DEBUG` を設定したとき）。
  v0.5.5 の洗い出しに無かった形: `process.execve`、`process.stdin`、`node:wasi`、`node:cluster`、`export … from`、`data:` と `.mjs` の副作用の import、`node:` の無い組み込み、
  `import { type X }`（実行時にモジュールを読む）
- M2-2 独立レビュー builtin-r2 の M2-2-BUILTIN-R2-001（High、v0.5.19）: 決定 2 の要素アクセスの許可が、キーの型だけを根拠にしていた（v0.5.4 の M2-2-R3-003 から続く型の信頼を、v0.5.17・v0.5.18 の
  修正が文書にした）。`const key = raw as "platform"; process[key]` は型検査を通り、実行時には `raw` の値のメンバーを取る。`as`・`any`・型注釈・`JSON.parse`・引数・戻り値・オーバーロード・
  `declare const`・readonly のプロパティで、型だけ安全なリテラルに見せた値を作れる。同じ系統で、型を許可（違反 0）の根拠にする場所が、child の `stdio`、fs の書き込み先、呼び出し先の宣言、
  `Function`、`Safe` にもあった（写しで実測: 塞ぐべき 36 形のうち 30 形を見逃し、実行時に端末へ届いた）
- 今の `src/` が読み込む組み込みモジュールは 6 つ（child_process・crypto・fs・path・string_decoder・zlib）で、すべて `node:` 付きのトップレベルの静的な import（27 か所）。
  上の形はどれも使わない

## 決定
1. **読み込みの行き先の一覧**: `src/` のファイルが実行時に読み込むモジュールは、次のどれかでなければ違反にする。見るのは、`import type` でない import の宣言
   （`import { type X }` は実行時にモジュールを読むので含む）、`export type` でない `export … from`、文字列リテラルの `import()`
   - 一覧 `BUILTIN_ALLOWED` の組み込み（`node:` 付き。今は `node:child_process`・`node:crypto`・`node:fs`・`node:path`・`node:string_decoder`・`node:zlib`）。
     サブパス（`node:fs/promises` など）は別のモジュールとして扱う
   - `src/` のソースファイル（型検査器で解決できる、宣言ファイルでない `.ts`）
   - package.json の `dependencies` のパッケージ（ADR-0008 の承認を通った物。devDependencies は含まない）

   違反の種類は、一覧の外の組み込み、`node:` の無い組み込み、URL（`data:` など）、`src/` のソースファイルでないモジュール（`.mjs`、宣言ファイル、`src/` の外、
   解決できないもの）、依存に無いパッケージ。`import = require()` も違反にする
2. **`process` の 6 つのメンバー**: `@types/node` の `process.d.ts` で宣言された `getBuiltinModule`・`dlopen`・`report`・`emitWarning`・`execve`・`stdin` を、端末の参照と
   同じく宣言で見つけて違反にする（別名、分割代入、`globalThis.process`、`node:process` の import のどれでも。型の中の参照は除く）。**要素アクセスのキーは、ソース上の文字列リテラル（置換の無い
   テンプレートリテラルを含む。括弧は許す）だけを安全とする。型は実行時の値を保証しない**（`as`・`any`・型注釈・`JSON.parse`・引数・戻り値・オーバーロードで、型だけ安全な
   リテラルに見せた値を作れる）ので、キーがソース上の文字列リテラルでない `process` / `globalThis` / `node:process` の要素アクセスは、キーの型がどうであっても
   `dynamic access to …` として違反にする（ADR-0017 の決定 5）。キーの型が上のメンバーの名前 1 つに決まるときだけは、診断のためにそのメンバーの名前
   （`process.getBuiltinModule` など）で報告する（v0.5.18）。ソース上のリテラルのキーが上のメンバー・端末・`eval`・`Function`・`require`・`createRequire` を指すときも違反にする。
   v0.5.17 は、キーが文字列リテラルのときだけメンバーを検出し、v0.5.18 は、キーの型が 1 つの安全な文字列リテラルなら許していた。M2-2-R3-003（v0.5.4）から続く型の信頼で、
   v0.5.19 で外した（M2-2-BUILTIN-R2-001）。
   `getBuiltinModule` は名前を問わず違反とし、組み込みを読み込む方法を、静的な import と一覧の中の `import()` に絞る。`stdin` は、stdin が端末なら端末に書けることを
   実測したので含める（将来、対話の入力が要るときは、この ADR に追記して足す）。`binding`・`_linkedBinding`・`_rawDebug` は今の `@types/node` に宣言が無く、
   使うにはキャストが要るので ADR-0017 の決定 5 の規則で違反になる。将来の `@types/node` が宣言したときのために、名前を一覧 `PROCESS_MEMBERS` に入れておく
3. **fail closed**: 解決できない相対 import は違反。`getBuiltinModule` は引数を問わず違反。文字列リテラルでない `import()` は従来どおり違反。`src/output.ts` の
   2 つの基本関数（`emitOut` / `emitErr`）の中でも、この ADR の規則に当たる参照は許さない
4. **自己検査**: 回帰テストが、`BUILTIN_ALLOWED` と `src/` が実際に読み込む組み込みの集合が一致すること（使わない項目が一覧に残らない）と、6 つのメンバーが今の
   `@types/node` の `process.d.ts` の宣言に解決することを確かめる（宣言のファイルが変わって、規則が黙って効かなくなることを防ぐ）
5. **一覧を変える手続き**: 組み込みを足すときは、そのモジュールの端末とほかのプログラムへの経路と、要る規則を、この ADR に追記し、独立レビューの対象にする。
   決定 4 のテストにより、一覧・`src/`・テストは同じ commit で変わる。依存のパッケージは package.json の `dependencies` から読む（ADR-0008 の依存の承認とそろえ、
   二重に管理しない）
6. 構造ガードの置き場所と当てる範囲は、ADR-0017 の決定 5 のまま（`tests/structure/output-guard.ts`、`src/`）。`src/` は変えない
7. **許可の根拠は、型でなく構文か宣言の解決にする**（v0.5.19、M2-2-BUILTIN-R2-001）: 構造ガードは、型の情報を「違反を見つける」ためにだけ使い、「違反でないと決める」根拠にしない。
   ADR-0017 の決定 5 の規則の考え方（型検査器で宣言に解決して判定する）を明文化したもので、決定 5 を置き換えない。型は実行時の値を保証しないので、型だけ安全に見せた値で、
   許可の分岐が外れる。具体的には
   - 要素アクセスのキーは、決定 2 のとおり
   - child の `stdio` は、ソース上の文字列リテラル `"pipe"`・`"ignore"`（配列の要素も）だけを安全とする。引数・変数・型注釈は、型が `"pipe"` でも違反
   - 型が `any` の値の呼び出し（`import()` を除く）と、型が `any` の fs の書き込み先は違反（呼び出し先・書き込み先について何も確かめられない）
   - `.constructor` の読み取り（名前。リテラルのキーの要素アクセスを含む）は違反（`Function` の名前を書かずに `Function` に届く）
   - `Safe` を作る総称型の型アサーション（どの引数の型にも含まれない型パラメーターへの `as`）は違反
   - fs のリテラルのパスは、`path.posix.normalize` で `.`・`//`・`x/../` を畳んでから、`/dev/`・`/proc/`、または先頭の `../` の連なりのあとの `dev/`・`proc/` を違反にする
     （`/./dev/stdout`・`//dev/stdout`・`../../dev/stdout` のように、リテラルの書き方の違いで外れない）

   許可の根拠が構文か宣言の解決でないもの（型を信じる場所）は、ここに書く。新しく足すときは、許可の分岐を全部数える（`docs/reviews/m2-2/response-builtin-r2.md` の教訓）

## 代替案
- 組み込みだけの一覧（`node:` の指定子と `node:` の無い組み込み名だけを見る）＋ `process` のメンバー: `data:` の副作用の import（実行時に端末に書けることを実測）と、
  `src/` のソースファイルでないモジュールの読み込みが残る
- `getBuiltinModule` を「文字列リテラルかつ一覧の名前」なら許す（レビュアーの修正案 2）: 名前の型の評価が要り、組み込みを読み込む方法が 2 つになる。`src/` は
  `getBuiltinModule` を使わないので、許す利点が無い
- 決定 1 に加えて、`src/` の文字列リテラルの `import()` も禁止する: より厳しいが、行き先の規則は静的な import と同じにできるので、一覧の中なら許す（人間の判断）
- 依存のパッケージをガードの定数に書く: package.json と二重に管理することになる
- 要素アクセスのキーだけを構文で判定する（v0.5.19 のレビューの案。案 A）: 型を許可の根拠にする他の場所（child の `stdio`、`any` の呼び出しと fs の書き込み先、`.constructor`、リテラルのキーの
  `eval`・`Function`、`Safe` の総称型の cast。写しで実測した 10 形）が残る。同じ系統の指摘が v0.5.4〜v0.5.18 で 3 回続いたので、決定 7 で一度に止める（案 C）
- 型でなく値の来歴を追って、`const` の実リテラルなどを許す（案 B）: `src/` に `process[…]` の形が無く、許したい形が無い。実装が大きく、`const` の object のプロパティの書き換えのような
  来歴の分析の抜けが、新しい迂回になりうる。fail closed の案 C のほうが単純で堅牢

## 既知の限界
構造ガードは、次を扱わない（どれも今の `src/` は使わない）。ここに書いたことは、ガードの保証の外にある。
- **実行時に組み立てたパスへの fs の書き込み**: fs の書き込み先で検出するのは、文字列リテラルのパス（`/dev/`・`/proc/`、`.`・`//`・`x/../`・先頭の `../` の書き方を畳んだもの）と、
  数値の fd だけ。引数・設定・`path.join`・URL オブジェクト（`new URL("file:///dev/stdout")`）などで実行時に組み立てたパス、cwd に依存する相対パス、シンボリックリンクが端末の装置を指す場合は
  扱わない（組み立てた `/dev/stdout` へ書けることと、URL オブジェクトで書けることを実測した。`src/` はレポートとパケットを組み立てたパスへ書くので、静的には区別できない）
- **自分自身への SIGUSR1**: `process.kill(process.pid, "SIGUSR1")` は inspector を起動する（Node の文書では、固定の文を標準エラーに書く。実測していない）。
  `src/` は子のプロセスグループに `process.kill` を使うので、違反にしない。この形は扱わない
- **コールバックの中の未処理の例外**: Node の既定の表示で、出口を通らずに標準エラーへ出る（生のメッセージとソースの行、exit 1 を実測した）。未捕捉の例外・未処理の拒否も同じ
  （v0.5.19 の洗い出しで実測。標準エラーに 661・706 バイト）。この ADR の範囲の外で、ROADMAP のバックログ 20。v0.5.14 で直したのは CLI の最上位の catch だけ
- **依存のパッケージの中の出力**: ガードは `node_modules` の中を見ない。commander の出力は `configureOutput` で出口に通す（ADR-0017）。依存の追加は ADR-0008 で承認する
- **子プロセスが自分で端末を開くこと**（`/dev/tty` など）: `stdio` の規則は、受け渡す記述子だけを見る。子の中で起きることは扱わない（実測していない）
- **名前を書かない経路の `Function`**: `Reflect.get(fn, "constructor")` や、一般の計算されたキーの要素アクセス（`obj[k]`、k は実行時に `"constructor"`）で `Function` を得て、
  関数型へ cast して呼ぶと、任意のコードを実行できる（実測した）。構造ガードは、`Function`・`eval` を名前で書く形、`.constructor` の読み取り、`any` の呼び出しを塞ぐが、名前を書かずに
  関数型へ cast する経路は塞がない。すべての計算された要素アクセスを禁止することは、`src/` の通常の書き方（`Record` の参照など）と両立しない
- **`process`・`globalThis` を値として得る経路の網羅**: ガードは、`process`・`globalThis` を値として使うこと、ソース上のリテラルでないキーの要素アクセス、`any` の呼び出しを違反にすることで、
  holder を別の型で渡す形を塞ぐ。これらで塞がらない経路（言語機能の未知の使い方）は、保証しない。確認した塞げない経路の 1 つは、EventEmitter の `this`: `process.on` などに渡した関数は
  `process` を `this` として呼ばれるので、`this` の型を偽った関数（`function (this: 型) { … }`、取り出したオブジェクトや class のメソッド）から、`process` の名前を書かずに `process.stdout` に
  届く（実測。標準出力 1〜2 バイト）。`src/` は関数の参照を `process.on` / `process.off` に渡すので、「非アロー関数の引数を禁止する」規則は `src/` と両立しない
- **ガードの位置づけ**: 構造ガードは、悪意のあるコードに対する保証ではなく、実装 AI の不注意・安易な迂回を止める機械的な検査である。端末への出力の境界は、構造ガードのほかに、CLI を子プロセスとして
  動かして出力を確かめる回帰テストと、`src/output.ts` の 2 つの基本関数に支えられている
- **`tests/` の外部コマンドの宣言**（process-guard の `commandOf`）: 文字列リテラル型を信じる。`src/` の保証ではなく、最小 PATH のテストが補う（この ADR の範囲外）
- **ネットワーク**: 一覧は `node:http` などの組み込みを塞ぐが、グローバルの `fetch` などは残る。一覧は端末への出力のためのもので、`src/` がネットワークを使わないことは
  保証しない

## 影響
- 変えたのは `tests/structure/output-guard.ts` と、新しい回帰テスト `tests/regression-m2-2-r4-002-builtin-allowlist.test.ts` だけ（`src/` は変えない）
- 回帰テスト 61 件（49 形は報告される、対照 8 形は報告されない、fixture の型検査、`src/` の違反 0、一覧と実際の一致、6 つのメンバーの宣言）。v0.5.16 のガードでは
  42 件 FAIL（見逃していた 40 形と、一覧の一致・メンバーの宣言）。テスト件数は 700（103 ファイル）から 761（104 ファイル）
- `src/` に組み込みを足すとき、`process` の 6 つのメンバーや `node:` の無い組み込みを使うときは、この ADR の手続きが要る
- v0.5.18（M2-2-BUILTIN-R1-001）: 変えたのは `tests/structure/output-guard.ts` の 1 か所（+6 / −2 行）と、新しい回帰テスト
  `tests/regression-m2-2-builtin-r1-001-literal-typed-key.test.ts` だけ（`src/` は変えない）。回帰テスト 39 件（名前で報告される 22 形、報告される 10 形、対照 5 形、
  fixture の型検査、`src/` の違反 0）。v0.5.17 のガードでは 20 件 FAIL。`enum` のメンバーをキーにする形は `erasableSyntaxOnly` により型検査で止まる。
  テスト件数は 761（104 ファイル）から 800（105 ファイル）
- v0.5.19（M2-2-BUILTIN-R2-001）: 変えたのは `tests/structure/output-guard.ts`（先頭の説明コメントを含めて +55 / −20 行）と、新しい回帰テスト
  `tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts`、R1 の回帰テストの対照 3 件の置き換えだけ（`src/` は変えない）。回帰テスト 100 件（報告される形 68、
  報告されない限界の記録 12、対照 18、fixture の型検査、`src/` の違反 0）。v0.5.18 のガードでは 39 件 FAIL。テスト件数は 800（105 ファイル）から 900（106 ファイル）
  - **代償として違反になる形**（`src/` には無い。受け入れる）: `.constructor` の名前の読み取り（`.constructor.name` のように `Function` を呼ばない読み取りも）、型が `any` の値の呼び出し、
    `string` 型のキーを `===` で絞った `process[key]`（実行時に安全でも）、型が `"pipe"` の変数や引数を渡した child の `stdio`（実行時に安全でも）、先頭が `../` の連なりで
    `dev/`・`proc/` に続くリテラルのパス（`../dev/notes.txt` のような通常の相対パスでも）
  - R1 の回帰テストの対照 3 件は、型がリテラルのキーの形から、構文上のリテラルの形へ置き換えた（型がリテラルのキーは、v0.5.19 では違反）
