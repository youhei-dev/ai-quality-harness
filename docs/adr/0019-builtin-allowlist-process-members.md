# ADR-0019: `src/` が実行時に読み込むモジュールを一覧で限り、`process` の 6 つのメンバーを使わない（構造ガード）

- 状態: 採用（ADR-0017 の既知の限界のうち、構造ガードの項〈`worker_threads` などの列挙と、v0.5.5 で追記した M2-2-R4-002〉を置換）
- 日付: 2026-09-28（M2-2、v0.5.17。M2-2 独立レビュー R4 の M2-2-R4-002。ROADMAP のバックログ 1）。2026-09-30（v0.5.18。決定 2 の要素アクセスのキーの扱いを実装に合わせて正確にした。M2-2 独立レビュー builtin-r1 の M2-2-BUILTIN-R1-001）

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
   同じく宣言で見つけて違反にする（別名、分割代入、`globalThis.process`、`node:process` の import のどれでも。型の中の参照は除く）。要素アクセスのキーが文字列リテラルの
   ときと、キーの式の型が 1 つの文字列リテラルに決まるとき（const・`as const`・型注釈・引数・readonly のプロパティ・タプルの要素・テンプレートリテラル・絞り込んだ
   ユニオンなど）は、そのメンバーの名前（`process.getBuiltinModule` など）で違反にする。キーの型が 1 つに決まらないとき（`string`・ユニオン・`keyof`・総称型）は、従来どおり
   `process` の動的な扱いとして違反にする（ADR-0017 の決定 5）。v0.5.17 は、キーが文字列リテラルのときだけメンバーを検出していた。キーの型でメンバーが分かる形は、
   v0.5.18 で塞いだ（M2-2-BUILTIN-R1-001）。
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

## 代替案
- 組み込みだけの一覧（`node:` の指定子と `node:` の無い組み込み名だけを見る）＋ `process` のメンバー: `data:` の副作用の import（実行時に端末に書けることを実測）と、
  `src/` のソースファイルでないモジュールの読み込みが残る
- `getBuiltinModule` を「文字列リテラルかつ一覧の名前」なら許す（レビュアーの修正案 2）: 名前の型の評価が要り、組み込みを読み込む方法が 2 つになる。`src/` は
  `getBuiltinModule` を使わないので、許す利点が無い
- 決定 1 に加えて、`src/` の文字列リテラルの `import()` も禁止する: より厳しいが、行き先の規則は静的な import と同じにできるので、一覧の中なら許す（人間の判断）
- 依存のパッケージをガードの定数に書く: package.json と二重に管理することになる

## 既知の限界
構造ガードは、次を扱わない（どれも今の `src/` は使わない）。ここに書いたことは、ガードの保証の外にある。
- **実行時に組み立てたパスへの fs の書き込み**: fs の書き込み先で検出するのは、リテラルの `/dev/`・`/proc/` のパスと、数値の fd だけ。引数・設定・`path.join` などで
  実行時に組み立てたパスが端末の装置を指す場合は扱わない（組み立てた `/dev/stdout` へ書けることを実測した。`src/` はレポートとパケットを組み立てたパスへ書くので、
  静的には区別できない）
- **自分自身への SIGUSR1**: `process.kill(process.pid, "SIGUSR1")` は inspector を起動する（Node の文書では、固定の文を標準エラーに書く。実測していない）。
  `src/` は子のプロセスグループに `process.kill` を使うので、違反にしない。この形は扱わない
- **コールバックの中の未処理の例外**: Node の既定の表示で、出口を通らずに標準エラーへ出る（生のメッセージとソースの行、exit 1 を実測した）。この ADR の範囲の外で、
  ROADMAP のバックログ 20。v0.5.14 で直したのは CLI の最上位の catch だけ
- **依存のパッケージの中の出力**: ガードは `node_modules` の中を見ない。commander の出力は `configureOutput` で出口に通す（ADR-0017）。依存の追加は ADR-0008 で承認する
- **子プロセスが自分で端末を開くこと**（`/dev/tty` など）: `stdio` の規則は、受け渡す記述子だけを見る。子の中で起きることは扱わない（実測していない）
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
