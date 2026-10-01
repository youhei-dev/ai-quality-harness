# ADR-0019: `src/` が実行時に読み込むモジュールを一覧で限り、`process` の 6 つのメンバーを使わない（構造ガード）

- 状態: 採用（ADR-0017 の既知の限界のうち、構造ガードの項〈`worker_threads` などの列挙と、v0.5.5 で追記した M2-2-R4-002〉を置換）
- 日付: 2026-09-28（M2-2、v0.5.17。M2-2 独立レビュー R4 の M2-2-R4-002。ROADMAP のバックログ 1）。2026-09-30（v0.5.18。決定 2 の要素アクセスのキーの扱いを実装に合わせて正確にした。M2-2 独立レビュー builtin-r1 の M2-2-BUILTIN-R1-001）。2026-09-30（v0.5.19。決定 2 の要素アクセスのキーを、型でなくソース上の文字列リテラルで判定するように改訂し、決定 7 を追加した。M2-2 独立レビュー builtin-r2 の M2-2-BUILTIN-R2-001）。2026-09-30（v0.5.20。決定 7 の範囲を、実際の許可の分岐に合わせて正確にし、許可の分岐の表を足した。M2-2 独立レビュー builtin-r3 の M2-2-BUILTIN-R3-001〜008）。2026-10-02（v0.5.21。決定 7 の範囲を「表は対象として棚卸しした許可の分岐で、すべての許可の一覧ではない」と狭く明記し、型を違反を見つける側に使うとき union・intersection・型パラメーターの枝まで分解することを書いた。M2-2 独立レビュー builtin-r4 の M2-2-BUILTIN-R4-001〜006）

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
7. **許可の根拠は、構文・最上位の宣言の名前・宣言の解決（`@types/node` の宣言に解決するか）のどれかにする。型を許可の根拠にするのは、表に明示した 2 つ（writer の引数が全枝で `Safe`、総称型の cast の carrier の引数の型が T そのもの）だけで、ほかの型の情報は違反を見つけるために使う。**
   型は union・intersection・型パラメーターの constraint の枝まで分解して見る（どれか 1 枝でも危険なら違反。M2-2-BUILTIN-R4）。型に危険な枝が無いことを理由に違反にしない判断は、静的な型を偽られると外れるので、その外れは既知の限界に書く。
   （v0.5.19、M2-2-BUILTIN-R2-001 で明文化。v0.5.20 で、実際の許可の分岐に合わせて範囲を正確にした: M2-2-BUILTIN-R3。v0.5.21 で、表の範囲を狭く明記し、型の分解を足した: M2-2-BUILTIN-R4）
   ADR-0017 の決定 5 の規則の考え方（型検査器で宣言に解決して判定する）を明文化したもので、決定 5 を置き換えない。型は実行時の値を保証しないので、型だけ安全に見せた値で許可の分岐が外れる。
   v0.5.19 は「型は違反を見つけるためだけに使う」と広く書いたが、実際にそうなっていたのは要素アクセスのキーと child の `stdio` だけで、writer・生成者の許可は名前、fd の判定は型、fs・child の API の判定は
   call の signature の declaration に基づいていた（M2-2-BUILTIN-R3）。v0.5.20 は「この決定の文は表と 1 対 1 で書く。表にない許可は書かない」としたが、表は `tests/structure/` の許可の分岐の一部
   （v0.5.20 の棚卸しで 53 のうち 12）にすぎず、表にない許可（モジュールの一覧、`import type`、holder の読み取りなど）があった（M2-2-BUILTIN-R4-006）。v0.5.21 は、表を全数にせず、範囲を狭く明記する。
   次の表は、**この決定の対象として棚卸しした許可の分岐で、`tests/structure/` のすべての許可の一覧ではない**（モジュールの一覧は決定 1、holder の名前での読み取り・捨てる値・通常の分割代入は ADR-0017 の決定 5、
   型の位置・`as const` などの構文の除外はガードの先頭の説明に書く）。許可の分岐の全数は、棚卸しの記録（`docs/reviews/m2-2/response-builtin-r4.md`）に置いた。それは ADR の保証ではない。

   **決定 7 の対象として棚卸しした許可の分岐**（`tests/structure/`。許可 = 違反を返さない判断。すべての許可の一覧ではない）

   | 許可 | 根拠 |
   |---|---|
   | 要素アクセスのキー（`process[…]`・`globalThis[…]`・`node:process`） | 構文: ソース上の文字列リテラル（決定 2）。wrapper を剥がした式は使わない（`process["platform" as const]` は違反。安全側の誤検出） |
   | child の `stdio` | 構文: ソース上の文字列リテラル `"pipe"`・`"ignore"`（配列の要素も）。実行時の値を変えない wrapper（括弧・`as`・`<T>`・`satisfies`・`!`）は、`stdio` の値でも options の object でも剥がして見る（v0.5.21）。`stdio` より**後ろ**に spread、またはソース上で別の名前と書かれていない計算された名前があれば違反（前は許す。リテラルの名前の重複は TypeScript が拒む） |
   | 端末への書き込み（writer） | src/output.ts の**最上位の宣言** `emitOut`（`console.log`・`process.stdout.write`）・`emitErr`（`console.error`・`process.stderr.write`）の、その組の呼び出しだけ。引数は 1 つで、型が全枝で `Safe`（`WRITER_CALLS`）。同名の局所の宣言・メソッドは許可されない |
   | `Safe`・`Checked`・`Md`・`Rejected` を作る型アサーションと、issuer の呼び出し元 | ファイル + **最上位の宣言の名前**（`topOwnerName`。`safeText`・`safeJson`・`issue`・`issueMd`・`REJECTED`、issuer の callers）。同名の局所の宣言・メソッドは許可されない |
   | fs・child_process の関数（`fs/promises` を含む） | 呼び出しの callee としてだけ。持ち替え・代入・引数・object の値・`.call`・`.apply`・`Reflect.apply`・要素アクセス（`fs["writeFileSync"]`）・module の分割代入など、callee 以外の参照は違反（call の規則が、`@types/node` の declaration に解決した呼び出しだけを見るため。v0.5.21 で、Identifier だけでなく要素アクセス・分割代入・`fs/promises` の declaration も参照として見る） |
   | 総称型の型アサーション（`as T`） | 必須・既定値なし・rest でない、型が T そのものの引数があるとき（両ガード）。対象が型パラメーターを含む union・intersection（`as T \| undefined`・`NonNullable<T>`）なら、型パラメーターの枝ごとに要求する（v0.5.21）。条件型・mapped type（`Awaited<T>`・`Partial<T>`）は見ない（既知の限界） |
   | fs の device path の検査の対象 | `FS_WRITERS` の API は先頭の引数（path または fd）だけ。ほかの fs の関数は全引数。`.`・`//`・`x/../` を畳んでから `/dev/`・`/proc/`、先頭の `../` の連なりを見る。型が union・intersection・型パラメーターのときは、文字列リテラルの枝すべてを見る（v0.5.21） |
   | fs の書き込み先と `fd` option | 型（違反を見つける側。許可の根拠として使う例外ではないが、型を偽られると外れる）: どの枝にも number・`any`・`fd` プロパティが無く、型アサーション・`satisfies`（括弧・`!` は除く）も無いとき。型の枝は union・intersection・型パラメーターの constraint まで分解する。fs の呼び出しの引数に、キーが静的に分からないもの（文字列の index signature、文字列と書かれていない計算された名前）があれば違反（規則 K。fs の呼び出しだけ） |

   型の情報は、次の**検出**に使う（許可の根拠ではない。いずれも union・intersection・型パラメーターの constraint の枝まで分解し、どれか 1 枝でも危険なら違反にする: M2-2-BUILTIN-R4）:
   型が `any` の値の呼び出し・fs の書き込み先、`Function` 型の呼び出し、number の枝を持つ型の fs の書き込み先（fd）、型が `fd` プロパティを持つ枝のある引数（fd option。
   object literal・変数・spread。計算された名前 `"fd"` も）と、キーが静的に分からない fs の呼び出しの引数（規則 K）、型アサーション・`satisfies` を付けた fs の writer の先頭の引数、リテラル型（literal の枝）の device path、
   `.constructor` の読み取り（wrapper を剥がした式のリテラルのキーを含む）、`Safe` の偽造。**保証しないもの**（型・名前に基づく、または塞がない）は、既知の限界の節に書く: fd の判定（静的な型）、総称型の残る形、
   EventEmitter の `this`、brand-guard の広げ、読み取りの device path の誤検出

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
  分類（v0.5.21 の見直し）: `function (this: 偽の型)` は (i) 意図的な偽装が要る形。EventEmitter に unbound method を渡す形（`this` の型を偽らなくても、`process.on` が `process` を `this` にする）は、意図的でなくても起こり得るので (ii) 塞ぐ規則が `src/` と両立しない形
- **ガードの位置づけ**: 構造ガードは、悪意のあるコードに対する保証ではなく、実装 AI の不注意・安易な迂回を止める機械的な検査である。端末への出力の境界は、構造ガードのほかに、CLI を子プロセスとして
  動かして出力を確かめる回帰テストと、`src/output.ts` の 2 つの基本関数に支えられている
- **`tests/` の外部コマンドの宣言**（process-guard の `commandOf`）: 文字列リテラル型を信じる。`src/` の保証ではなく、最小 PATH のテストが補う（この ADR の範囲外）
- **path と fd の両方を受ける fs の書き込みの先頭の引数**（M2-2-BUILTIN-R3-005。分類 (ii): 型を偽る注釈は、静的な型が `string` の値を `src/` でも使うので、塞ぐ規則が `src/` と両立しない）: 実行時の値が数値（fd）でも、静的な型が `string` なら、ガードは fd として見ない（`as unknown as string` の二重 assertion、
  `JSON.parse` の any を `string` の注釈へ入れる形など。実測: 標準出力へ届く）。検出するのは、静的な型が数値または `any` のときと、型アサーション・`satisfies` を付けた形（部分規則）だけ。
  assertion・`satisfies` を付けない形（`const target: string = JSON.parse("1")`）は残る。これは「実行時に組み立てた path」の限界とは別で、実行時の値が path でなく fd である
- **総称型の型アサーション**（v0.5.21 で、`T | undefined`・`NonNullable<T>` のように型パラメーターを union・intersection の枝に持つ cast は、枝ごとに carrier を要求するようにした）: 必須の T の引数があっても、cast する値が別（`<T>(_x: T, raw: string): T => raw as T`）なら塞がない（値の流れを追わない）。逆に、T を `T[]`・`{ v: T }` の中に持つ引数の cast は違反になる
- **brand-guard の広げ**（M2-2-BUILTIN-R3 の 2 巡目 K3。ROADMAP のバックログ 21）: `Checked` / `Md` を持つ container を、式本体のアロー関数の戻り値で、または 5 段より深い入れ子で、ブランドの無い型へ広げる形は検出しない
  （`return` 文で広げる形は検出する）。意図的な設計が要る形で、`src/` は使わない
- **読み取りの device path**: 読み取り専用の fs の関数（`readFileSync("/proc/self/status")`・`existsSync("/dev/null")` など）のリテラルの device path は、誤検出として違反になる（fail closed のまま。`src/` は使わない）
- **EventEmitter の `this`**（前の項の補足）: v0.5.20 で、`process.on` / `once` / `addListener` / `prependListener` に渡す listener の本体が `this` を使うときだけ違反にする狭い規則を試作し、`src/` と両立すること
  （`src/cli-signals.ts`・`src/cli.ts` の listener は `this` を使わず、違反 0）と誤検出が無いことを確かめたが、Record に入れて要素アクセスで登録する形が残るので採らなかった（試作は `docs/reviews/m2-2/response-builtin-r3.md` の付録）
- **総称型の cast の条件型・mapped type**（M2-2-BUILTIN-R4 の SP1 の棚卸し INV-1 の残り。分類 (ii)）: `as Awaited<T>`（条件型）・`as Partial<T>`（mapped type）は、型パラメーターの枝として見ないので違反にならない
  （`Awaited<T>` で `Safe` を作る形は型検査を通る。`Partial<T>` は `Safe` には使えない形の記録。どちらも単独では端末へ届かない: `Safe` を受ける書き込み口は `src/output.ts` の外に無い）。型の形を全部たどる規則は将来の書き方に追いつかず、塞ぐなら型の構文の中に T が現れる cast をすべて違反にする規則が要り、
  `JSON.parse(s) as T[]` などの普通の形と衝突する。`src/` に無い。回帰テストは「報告されない」限界の記録として固定した
- **`stdio` の後ろの計算された名前の method**（d07。分類: 誤検出で、直さない）: 実行時に `stdio` が関数になって Node が拒む（標準出力に届かない）が、計算された名前の後続は method でも違反にする
- **分類の基準**（ROADMAP の「レビューを終える基準」）: 既知の限界は、(i) 意図的な偽装が要る形、(ii) 塞ぐ規則が `src/` と両立しない形（代償を ADR に書いたもの）のどちらかに、1 行の根拠つきで分ける。不注意で書ける形を (i) に入れない
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
- v0.5.20（M2-2-BUILTIN-R3）: 変えたのは `tests/structure/output-guard.ts`（先頭の説明コメントを含めて +75 / −22 行）・`typescript.ts`（+18 行、`topOwnerName`）・`brand-guard.ts`（+8 / −11 行）と、新しい回帰テスト
  `tests/regression-m2-2-builtin-r3-allow-branches.test.ts` だけ（`src/` は変えない。C0 で `package-lock.json` の `brace-expansion` を更新）。回帰テスト 116 件（113 形 + fixture の型検査 2 + `src/` の違反 0）。
  v0.5.19 のガードでは 52 件 FAIL。既存の 900 件の期待値は変えていない。テスト件数は 900（106 ファイル）から 1,016（107 ファイル）
  - **代償として違反になる形**（`src/` には無い。受け入れる）: `stdio` より後ろの spread、fs・child_process の関数の callee 以外の参照（`.call`・DI の注入を含む）、
    `process["platform" as const]`（holder のキーは wrapper を剥がさない。今までどおり違反）、writer に新しい terminal member を足すときの `WRITER_CALLS` の変更（この ADR の手続き）、T を `T[]`・`{ v: T }` に持つ引数の総称型の cast、fs の writer の先頭の引数に付けた
    型アサーション、型が `fd` プロパティを持つ引数（fd option 以外でも。`fs.WriteStream` などを引数に渡す形）
- v0.5.21（M2-2-BUILTIN-R4）: 変えたのは `tests/structure/output-guard.ts`（先頭の説明コメントを含めて +109 / −35 行。コード部分 +82 / −20）・`brand-guard.ts`（+9 / −6 行。コード部分 +6 / −4）と、新しい回帰テスト
  `tests/regression-m2-2-builtin-r4-union-and-element-forms.test.ts`、既存の回帰テストの 1 件の期待値だけ（`src/` は変えない。`package-lock.json` も変えない）。回帰テスト 91 件（85 形 + 型検査で止まる 4 形 + fixture の型検査 + `src/` の違反 0）。
  v0.5.20 のガードでは 62 件 FAIL。既存の 1,016 件は、`xb25_stdio_options_paren` の期待値（`reported: true` → `false`。R4-005 が指摘した誤検出を固定していた）を除いて変えていない。テスト件数は 1,016（107 ファイル）から 1,107（108 ファイル）
  - **代償として違反になる形**（`src/` には無い。受け入れる。回帰テストの COST の 6 形）: `PathOrFileDescriptor`・`Parameters<typeof writeFileSync>[0]` を受けて path だけを渡す wrapper（f01）、`createWriteStream` の options を省略可能で受ける wrapper（f02）、
    namespace の分割代入 `const { readFileSync } = fs`（f03）、`stdio` の後ろの動的なキー（f04）、総称型の helper の `m.get(k) as T | undefined`（f05）、fs の呼び出しに `Record<string, unknown>` 型の options（f06）。
    R4-005 を直した後に残る誤検出: `process["platform" as const]`、`stdio` の後ろの計算された名前の method（d07）。型アサーション・`satisfies` を付けた fs の writer の先頭の引数は、実行時の値を型が決めるので違反のまま
