# M2-2 BUILTIN R2 の独立レビューへの対応記録（response-builtin-r2）— v0.5.19

- 対象レビュー: `docs/reviews/m2-2/independent-review-builtin-r2.md`（受領ファイル名 `independent-review-m2-2-builtin-r2-for-claude.md`、ChatGPT、2026-09-30 受領、
  SHA-256 e36e3e12…81be、21,136 バイト。対象 v0.5.18 = commit 275dbd6 / tag object 9e7b0d5、範囲 v0.5.17..v0.5.18）
- 対応日: 2026-09-30
- 結果（レビュアー）: 前回の M2-2-BUILTIN-R1-001 は「解消」。新しい指摘は High 1 / Medium 0 / Low 0（M2-2-BUILTIN-R2-001）
- 人間の判断
  - M2-2-BUILTIN-R2-001 は v0.5.19 で直す。修正の形は案 C（案 A〈キーがソース上の文字列リテラルでなければ違反〉+ 型を信じる他の 5 つの規則）。案 B（来歴の分析）は採らない
  - v0.5.18 の回帰テストの対照 3 件（c01・c04・c05）を、構文上のリテラルの対照へ置き換える。ほかの既存のガードのテストの期待値は変えない
  - 既知の限界の文案（名前を書かない経路の `Function`、holder を得る経路の網羅、ガードの位置づけ）を ADR-0019 と ARCHITECTURE に足す。ガードは「悪意のあるコードに対する保証ではなく、
    実装 AI の不注意・安易な迂回を止める機械的な検査」と書く
  - 案 C の誤検出の代償（`.constructor` の名前の読み取り、`any` の呼び出し、`string` を `===` で絞った形）を受け入れる。ADR-0019 の影響の節に明記する
  - 洗い出しは 2 巡行う（1 巡目: 偽装の手段・holder の種類・型を信じる場所。2 巡目: 構文の形の違い・holder を別の経路で得る形）。実装の前に 2 巡目を行う
  - 決定 7（許可の根拠は型でなく構文か宣言の解決）を ADR-0019 に足す。ADR-0017 の決定 5 との関係は「同じ規則の考え方の明文化」
  - レビューを終える基準は「High が 0 なら終える」のまま。Medium 以下は内容を見て判断する
  - レビューの「未確認の範囲」6.1〜6.3 は新しい作業を起こさず、記録だけにする。バックログは項目も番号も変えない
  - 修正の後に独立レビュー m2-2-builtin-r3（範囲 v0.5.18..v0.5.19）を行う

## 指摘の判定

| ID | 重要度 | 判定 | 補足 |
|---|---|---|---|
| M2-2-BUILTIN-R2-001 | High | **VALID**（指摘のとおり。重要度は妥当） | 要素アクセスの許可の判定が、キーの型（`literalKey()`）だけを根拠にしていて、`as`・`any`・`JSON.parse`・引数などで型だけ安全なリテラルに見せた値で迂回できた |

### 根拠の行（確認: v0.5.18 の `tests/structure/output-guard.ts`）

- `:149-153` `literalKey()`: `getTypeAtLocation(e)` が文字列リテラル型ならその値を返す。**構文でなく型**を見ている
- `:263-270` holder（`process`・`globalThis`・`node:process`）の要素アクセスの枝: `literalKey()` の値で `Process` 型からプロパティを取り、メンバーなら名前で報告、
  `prop === undefined` か端末のときだけ `dynamic access to …`。型が安全な 1 つのリテラルなら、何も報告しない（許可）
- `:234-240` 要素アクセス自身の検査: キーの式の**宣言**（`getSymbolAtLocation`）を見る。`raw as "platform"` のようなキーは変数の宣言になるので当たらない

### 再現（実測: 一時 worktree の v0.5.18）

| 形 | 型検査 | v0.5.18 のガード |
|---|---|---|
| レビューの形: `const raw = "getBuiltinModule"; const key = raw as "platform"; const load = process[key] as unknown as (name: string) => Console;` | 型エラー 0 | 違反 0 件 |
| `string` 型を経由した `as` | 0 | 違反 0 件 |
| `any` 経由: `const raw: any = "getBuiltinModule"; const key: "platform" = raw;` | 0 | 違反 0 件 |
| `JSON.parse(…)` の結果を `"platform"` の注釈へ | 0 | 違反 0 件 |
| `globalThis.process[key]` | 0 | 違反 0 件 |
| 山括弧の型アサーション `<"platform">raw` | 型エラー 1（`erasableSyntaxOnly` が構文を禁止する。`src/` には書けない） | — |

- レビューの「型エラー 0」の記述は、実測と一致した。止まる形は山括弧の 1 形だけで、`as`・`any`・注釈・`JSON.parse`・引数・戻り値・オーバーロード・クラスの readonly・`declare const` は、
  どれも型検査を通る

### 実行時の到達（実測: 写しの中、子プロセス。タイムアウト 10 秒、回収は SIGKILL、出力はバイト数だけ記録）

| 形 | 結果 |
|---|---|
| レビューの形（`getBuiltinModule` で `node:console` を取り `log` した） | exit 0、標準出力 2 バイト、標準エラー 0 |
| `any` 経由 | 同じ（2 バイト） |
| `globalThis.process[key]` | 同じ（2 バイト） |
| 実行時のキーが `stdout`（`process[key].write`） | 標準出力 1 バイト。端末の規則そのものが、キーの偽装で迂回できた |
| 対照 `process["platform"]` | 0 バイト |

### 回帰か既存か

**既存**。写しの v0.5.17 と v0.5.18 は、51 形すべてで同じ結果（違反の文言まで一致）。`literalKey()` の型の信頼は M2-2-R3-003 の commit `da0154a`（v0.5.4 に含まれる。
`git log -S` で確認）で入った。v0.5.4 のガードでの実測はしていない。v0.5.18 は、その型信頼のまま危険メンバーを名前で報告する分岐を足し、ADR-0019 に「型が 1 つに決まる」と書いたので、
信頼が文書になった（レビューの 6 の指摘は正しい）。今の `src/` は `process[…]`・`globalThis[…]`・`.constructor` を使わず（0 か所）、実害は無く、
ガードの保証と実装の食い違いだった。ただし fail closed の基準では High のまま扱う（`as` や `any` を書けるのは実装 AI 自身で、そのガードが `as` 1 つで外れる）

## 洗い出し 1 巡目（実測。51 形）

方法: fixture 51 形を文字列にして型検査器のプログラムに入れ、v0.5.17・v0.5.18・修正後のガードに当てた。軸は「型の偽装の手段」「holder の種類」「型を信じる場所」。
fixture はすべて型検査を通る（山括弧の 1 形を除く）。本物の `src/` に該当する形は 0。

### 結果の集計

- 塞ぐべき 37 形（型エラーで止まる山括弧の 1 形を含む）のうち、v0.5.18 が違反にしないのは **30 形**（キーの型の偽装 20 形 + キー以外で型を信じる場所 10 形）。
  v0.5.17 と v0.5.18 は全形で同じ結果
- 実行時に動かした形は、すべて端末に届いた（キーの偽装 4 形、stdio・any の fs・constructor・`eval` の各 1 形）
- 案 A（キーだけ）で残るのは 10 形（stdio 3、any の呼び出し 2、`constructor` 2、リテラルのキーの `eval`・`Function` 2、`Safe` の総称型の cast 1）。案 C は 30 形すべてを塞ぐ
- 対照 11 形は、どの案でも報告 0 件

### 形ごとの結果（「v0.5.19」は修正後のガード。「限界」は ADR-0019 の既知の限界）

| 群 | 形 | v0.5.18 | v0.5.19 |
|---|---|---|---|
| Q | q01 レビューの形（`const raw = リテラル; raw as "platform"`）、q02 `string` 経由の `as`、q03 `any` から注釈、q04 `JSON.parse`、q05 `as unknown as`、q07 引数（呼び出しで偽装）、q09 戻り値の型、q10 `as const` の readonly のプロパティ、q11 `as const` のタプルの要素、q12 インデックスシグネチャ、q13 キーに `satisfies`、q14 `declare const`、q15 `string` を `===` で絞る（安全側の誤検出）、q16 実行時のキーが `stdout`、q17 オーバーロード、q18 クラスの readonly のプロパティ | **見逃し**（16 形） | `dynamic access to process` |
| Q | q06 山括弧の型アサーション | 型エラー | 同上（型エラーのまま） |
| Q | q08 総称型のキー | 検出 | 同じ |
| H | h01 `globalThis.process[key]`、h03 `globalThis[p][key]`、h04 `globalThis[p]` を別の型へ、h05 `process?.[key]` | **見逃し**（4 形） | `dynamic access to …` |
| H | h02 `node:process` の default import、h06 `(process)![key]` | 検出（別の規則） | 同じ（要素アクセスも報告） |
| T | t01〜t03 child の stdio の偽装（`as "pipe"`、引数、配列の要素） | **見逃し** | `child process … with stdio …` |
| T | t04 `(fs as any).writeSync(…)` | **見逃し** | `a call of an untyped (any) value` |
| T | t05 `writeSync(1 as any, …)` | **見逃し** | `fs writeSync to an untyped (any) target` |
| T | t06 関数の `constructor` を関数型へ cast、t14 any の値の `.constructor` | **見逃し** | `dynamic code: constructor` |
| T | t07 `globalThis["eval"]`、t08 `globalThis["Function"]` | **見逃し** | `dynamic code: eval` / `Function` |
| T | t09 `Safe` を総称型の cast で作る | **見逃し** | `a type assertion to a type parameter …` |
| T | t10 `import()` の指定子の偽装、t11 `process` を別の型へ cast、t12 `process` を any の引数へ | 検出（別の規則） | 同じ |
| T | t13 `Reflect.get(fn, "constructor")` を関数型へ cast、t15 一般の `obj[k]`（k は `"constructor"`）を関数型へ cast | 見逃し | 見逃し（**限界**。名前を書かない経路） |
| K | n01 実行時に組み立てた `/dev` のパス | 報告なし | 報告なし（既存の限界のまま） |
| C | c01〜c11（構文上のリテラルのキー、普通の object、型の中の参照、`process.exitCode = 1`、`process.env[k]`、`stdio: ["ignore", "pipe", "pipe"]`、普通の path への fs の書き込みなど） | 0 件 | 0 件 |

### 型を信じる場所の一覧（確認: v0.5.18 のファイルと行。14 か所）

「許可」は違反 0 を返す判断、「検出」は違反を返す判断。許可の根拠が型なら、型の偽装で迂回できる。

| # | 場所 | 使っている型の情報 | 許可か検出か | 偽装で迂回できたか | v0.5.19 |
|---|---|---|---|---|---|
| 1 | `:149-153` `literalKey()` の定義 | 文字列リテラル型 | — | — | 許可の根拠には使わない（メンバー名の報告とパスの検出だけ） |
| 2 | `:263-270` holder の要素アクセス | `literalKey`（許可） | **許可** | 迂回できた（Q・H） | ソース上のリテラルだけを許可 |
| 3 | `:179` stdio の `ok()` | `literalKey`（`"pipe"`・`"ignore"` なら許可） | **許可** | 迂回できた（t01〜t03） | ソース上のリテラルだけを許可 |
| 4 | `:299` fs の書き込みの fd | `flags & NumberLike`（数値型なら検出） | 検出 | `any` にすると迂回（t05） | `any` の対象も検出 |
| 5 | `:301-302` `/dev/`・`/proc/` のパスの検出 | `literalKey`（リテラル型のときだけ検出） | 検出 | 実行時に組み立てたパスは既知の限界（n01） | 限界のまま（書き方の違いは 2 巡目で塞いだ） |
| 6 | `:118-124` `fsFunction`、process-guard の `starter` | `getResolvedSignature` の宣言 | 検出の前提 | `any` の呼び出し先は宣言に解決せず迂回（t04） | `any` の呼び出しを検出 |
| 7 | `:293-294` `callee?.name === "Function"` | 呼び出し先の型のシンボル | 検出 | cast で `Function` 型でなくすと迂回（t06・t14） | `.constructor` の読み取りを検出 |
| 8 | `:221-232` 識別子の規則 | 識別子の宣言の解決 | 検出 | 書いた名前は迂回できない。リテラルのキー（`globalThis["eval"]`）は対象外だった（t07・t08） | リテラルのキーの `eval`・`Function`・`require`・`createRequire` を検出 |
| 9 | `:256-280` holder の判定と「値としての使用」 | 式の型のプロパティに端末があるか | 検出 | holder を値として得る経路は、値としての使用・非リテラルのキー・any の呼び出しで塞がる | 塞がらない経路は既知の限界に書く |
| 10 | `:285` `import()` の指定子 | 構文 | 検出 | 迂回できない（t10） | 変更なし |
| 11 | `:110-114` `moduleProblem` の指定子 | 構文と宣言の解決 | 検出 | 迂回できない | 変更なし |
| 12 | `:335`・`:345-351` `Safe` の判定 | `hasSafe(型)`、`as` の対象の型 | 検出 | 総称型の cast（`as T`）は見逃した（t09） | 総称型の cast を検出 |
| 13 | process-guard `commandOf` | 文字列リテラル型 | 許可（tests/ の外部コマンド） | 迂回できる。ただし `src/` の保証ではない | 範囲外。既知の限界に書く |
| 14 | brand-guard | 型の判定、総称型の cast の検出 | 検出 | 総称型の cast は既に規則がある | 範囲外 |

## 案の比較と決定

| | 案 A（レビューの案） | 案 B（来歴の分析） | 案 C（採用） |
|---|---|---|---|
| 中身 | holder の要素アクセスで、キーがソース上の文字列リテラル（置換の無いテンプレートを含む。括弧は許す）でなければ、型がどうでも違反 | 型でなく値の由来を追う（`const` の初期化が実リテラル、書き換え無し、…を再帰で確かめる） | A + stdio は構文上のリテラルだけ + `any` の呼び出しと any の fs の対象 + holder のリテラルのキーの `eval`・`Function`・`require`・`createRequire` + `.constructor` + `Safe` の総称型の cast |
| 大きさ | +11/−2 行 | 80〜150 行と fixture 25 件ほどの見込み（実装しない） | +30/−4 行 |
| 塞ぐ形 | 30 形のうち 20 形 | Q・H だけ | 30 形すべて |

- 案 B を採らない理由: `src/` に `process[…]` の形は無く、許したい形が無い。来歴の分析は実装が大きく、`const` の object の書き換えのような新しい抜けが出る
- 案 A だけにしない理由: 同じ系統（型を許可・検出の根拠にする）の指摘が v0.5.4〜v0.5.18 で 3 回続いた。修正のたびに「その指摘の形」を塞ぎ、許可を返す分岐そのものを数え直さなかった
- 案 C の代償（受け入れる）: `.constructor` の名前の読み取り、`any` の呼び出し、`string` を `===` で絞った形（q15）は、実行時に安全でも違反になる。`src/` には無い

## 修正

`tests/structure/output-guard.ts`（先頭の説明コメントを含めて +55 / −20 行。`src/` は変えない）。

1. 要素アクセスのキー: ソース上の文字列リテラル（置換の無いテンプレートを含む。括弧は許す）だけを安全にする。それ以外は、キーの型がどうでも `dynamic access to …`。キーの型が
   `PROCESS_MEMBERS` の名前 1 つに決まるときは、診断のためにメンバーの名前で報告する（v0.5.18 の報告は残る）
2. holder のリテラルのキーが `eval`・`Function`（TypeScript の標準ライブラリの宣言）、`require`・`createRequire`（`@types/node` の宣言）を指すときは違反
3. child の `stdio` は、ソース上の文字列リテラル `"pipe"`・`"ignore"`（配列の要素も）だけを安全にする
4. 型が `any` の値の呼び出し（`import()` を除く）と、`any` の対象への fs の書き込みは違反
5. `.constructor` の読み取り（プロパティアクセスと、リテラルのキーの要素アクセス）は違反
6. `Safe` を作る総称型の cast（どの引数の型にも含まれない型パラメーターへの `as`）は違反（brand-guard と同じ形）
7. fs のリテラルのパスは、`path.posix.normalize` で `.`・`//`・`x/../` を畳んでから、`/dev/`・`/proc/`、または先頭の `../` の連なりのあとの `dev/`・`proc/` を違反にする
   （2 巡目で見つけた書き方。下記）

試作の途中で、案 C の 2 つの規則が誤検出を起こし、直した（記録）: 総称型の cast の規則は `src/security/mask.ts` の `maskDeep<T>` の `as T` を 3 か所検出したので、
「どの引数の型にも含まれない型パラメーターへの cast」に絞った。any の呼び出しの規則は `import()` を検出して既存の回帰テスト（r4-002 の ct07）を FAIL させたので、`import()` を除いた。
どちらも修正後は本物の `src/` への違反 0 件。

## 洗い出し 2 巡目（実測。fixture 82 形 = 塞ぐべき形 75 + 対照 7）

軸は人間が決めた 2 つ。方法は 1 巡目と同じ（写し = v0.5.18 + 試作 C に fixture を当て、違反と、子プロセスでの実行時の到達〈標準出力・標準エラーのバイト数〉を実測）。

- **軸 X: 構文の形の違い**（45 形）: 計算プロパティ名の分割代入（リテラル・テンプレート・変数のキー）、スプレッド、`Object.assign`・`Object.keys/values/entries/getOwnPropertyNames/getOwnPropertyDescriptors`、
  `for … in`、`in` 演算子、テンプレートの置換とタグ、カンマ式・条件式・`??`・`||` を通した holder、コールバックの引数、`with`、`new`・`super`、呼び出し結果、既定値の引数、
  省略形のプロパティ、`export default`、`static` フィールド、`satisfies`、`typeof`、`yield`、`globalThis` の同じ形、`node:process`、EventEmitter の `this`
- **軸 Y: holder を別の経路で得る形**（30 形）: `global`、`globalThis.globalThis`、`module`・`require`・`require.main`・`import.meta`、`Function("return this")()`・間接 `eval`・`new Function`、
  `process.mainModule`・`process.binding`・`process._rawDebug`・`process.process`・`process.send`・`process.loadEnvFile`、未捕捉の例外・未処理の拒否。あわせて、軸の外で気づいた
  fs のリテラルのパスの書き方（8 形。`/./dev/…`・`//dev/…`・`/tmp/../dev/…`・`../` の連なり・URL オブジェクト・実行時の `join`・const のリテラル）

### 結果

- **ガードが違反にした形: 62 形**（軸 X の 45 形のうち 40 形、軸 Y の 30 形のうち 22 形）。X の形は `this` を通す 5 形を除いてすべて違反（holder は「名前でプロパティを読む」形以外はすべて
  値としての使用で違反になる）。`with` は構文エラー（モジュールは strict）、未宣言の `process["binding"]`・`process["_rawDebug"]`・`process["process"]` は型エラーで、ガードも違反にする。
  `global`・`globalThis.globalThis`・`module.require`・`require.main`・`Function("return this")()`・間接 `eval`・`process.mainModule?.require` も違反。パスの書き方の 6 形（z01〜z05・z08）は、
  下の規則で違反になる（足す前に違反にしていたのは `/dev/stdout` の 1 形だけで、5 形を塞いだ）
- **違反にしなかった形: 13 形**（下の表の下 4 行と、限界にした形）。対照 7 形は報告 0 件
- 新しい迂回の扱い（基準: 数行で塞げて `src/` と対照を誤検出しないなら塞ぐ。そうでなければ ADR に「扱わない」と書くだけ）: **塞いだ 1 規則（パスの書き方 5 形）、限界にした 2 件（`this` の経路 5 形 +
  組み立てたパス 2 形）、既存の限界に当たる 2 形、迂回でない 4 形**（13 形 = 7 + 2 + 4）

| 形 | ガード | 実行時の到達 | 扱い |
|---|---|---|---|
| `/./dev/stdout`・`//dev/stdout`・`/tmp/../dev/stdout`・`../` の連なり・const のリテラル（z01・z02・z03・z04・z08） | 見逃していた（先頭が `/dev/` でない書き方） | 標準出力 1 バイト（z03 は macOS では `/tmp` が別のディレクトリへの参照なので届かない。Linux では届く見込み） | **塞いだ**（正規化してから見る。+2 行。`src/` と対照 z09〈`./dev/…`・`src/proc/…`〉に誤検出なし） |
| EventEmitter の `this`（x25・x26・x36・x37・g06）: `process.on("exit", function (this: 型) { … })`、`fake.m` や class のメソッドを `process.on` に渡す。listener は `process` を `this` として呼ばれるので、`process` の名前が現れない | 見逃し（型検査は通る） | 標準出力 1〜2 バイト | **限界にした**。`src/cli-signals.ts` と `src/cli.ts` は関数の参照を `process.on` / `process.off` に渡すので、「非アロー関数の引数を禁止する」規則は `src/` と両立しない。`this` の型を見る規則は class のメソッドの取り出しを塞げない |
| `writeFileSync(new URL("file:///dev/stdout"), …)`、`writeFileSync(join("/dev", "stdout"), …)`（z06・z07） | 見逃し | 標準出力 1 バイト | **限界にした**（実行時に組み立てたパスの既存の限界の拡張。検出するのは文字列リテラルのパスだけ） |
| 未捕捉の例外、未処理の拒否（y19・y22） | 報告なし | 標準エラー 661・706 バイト（Node の既定の表示） | 既存の限界（ADR-0019「コールバックの中の未処理の例外」。バックログ 20）に当たる。文言に足した |
| `import.meta` を別の型へ（y09） | 報告なし | 0 バイト | 迂回でない（`import.meta` は端末に届く holder ではない） |
| `process.mainModule?.exports` を値として（y14） | 報告なし | 0 バイト（ESM では `mainModule` は `undefined`） | 迂回でない（`.require` は名前で違反） |
| `process.send` / `process.channel`（y17）、`process.loadEnvFile`（y18） | 報告なし | 0 バイト（IPC・ファイルの読み込みで、端末でもモジュールでもない） | 迂回でない |

### 3 巡目は要るか

**要らないと判断する**。理由: (1) 許可の根拠に型を使う新しい系統は 2 巡目で見つからなかった（停止条件に当たらない）。(2) 軸 X の 45 形のうち 40 形と、軸 Y の holder の形は、1 つの規則（holder は名前でプロパティを読む形以外はすべて違反）が
受け止めた。新しく出た 2 つ（`this` の経路、パスの書き方）は型の信頼ではなく、前者は限界に、後者は 1 規則に収めた。(3) 数え方の限界: 2 巡の軸の外（`this` の束縛のような、暗黙の受け渡し全般と、
fs のリテラルのパスの書き方）は網羅していない。レビュー m2-2-builtin-r3 の見てほしい点に足す。

## 修正の前後の実測

| 実測 | v0.5.18 のガード | v0.5.19 のガード |
|---|---|---|
| 新しい回帰テスト 100 件（`tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts`） | **39 件 FAIL**（SP1 の 30 形 + 山括弧の 1 形 + R1 の対照だった 3 形 + パスの書き方 5 形）/ 61 PASS | 100 PASS |
| 既存のガードのテスト（r2-001 の 21、r3-003 の 7、r4-002 の 61 = 89 件） | — | 89 PASS（期待値は変えていない） |
| R1 の回帰テスト（39 件） | — | 39 PASS（対照 3 件を置き換えた。下記） |
| 本物の `src/` への違反 | 0 | 0 |

- 回帰テスト 100 件の中身: キーの偽装（Q・H と、R1 の対照だった 3 形）27、型を信じた他の場所 13、パスの書き方 6、構文の形 22、既知の限界（報告されないことの記録）12、対照 18、fixture の型検査 1、
  `src/` の違反 0 が 1
- 修正前の FAIL 39 件のうち、既に検出していた形の期待値が違うだけの FAIL は無い（h06・t12 は、v0.5.18 も報告する別の規則の文言で期待値を書いた）
- R1 の回帰テストの置き換え（承認済み）: c01_platform・c04_exitcode_assignment・c05_globalthis_process_platform は、型がリテラルのキー（`const key = "platform" as const; process[key]` など）の対照だった。
  「型は実行時の値を保証しない」ので、v0.5.19 では違反にする。対照は、構文上のリテラル（`process["platform"]`、`process.exitCode = 1`、`globalThis["process"].platform`）へ置き換え、元の 3 形は
  新しいテストのキーの偽装の群（`r1c01`・`r1c04`・`r1c05`）に移した。R1 の残り 36 件の期待値は変えていない
- テスト件数: 800（105 ファイル）→ 900（106 ファイル）

## 「特に見てほしい点」1〜6（レビューの結果と、この版での扱い）

| # | 点 | 結果（レビュアー） | この版での扱い |
|---|---|---|---|
| 1 | M2-2-BUILTIN-R1-001 の解消 | 解消（ただし新規 M2-2-BUILTIN-R2-001） | M2-2-BUILTIN-R2-001 として v0.5.19 で修正 |
| 2 | キーの型が 1 つに決まらない形 | この観点単体では問題なし（関連する別問題は R2-001） | レビューの記述をそのまま「問題なし」として記録する |
| 3 | 報告文言の変更 | 確認した範囲では問題なし | 同上（v0.5.19 でもメンバーの名前の報告は残す） |
| 4 | 対照の妥当性 | R2-001 を除けば問題なし | R2-001 の対照 3 件（c01・c04・c05）を置き換えた |
| 5 | 回帰テストの網羅性 | R1-001 の直接再現には十分。R2-001 の形が欠ける | 新しい回帰テスト 100 件で足した |
| 6 | docs とコードの一致 | R2-001 に関して保証が強すぎる | ADR-0019 の決定 2 を改訂し、決定 7 と既知の限界を足した。ARCHITECTURE も直した |

## レビュアーの「未確認の範囲」の扱い（新しい作業は起こさない）

人間の判断で、次のとおり記録する。

1. **6.1 Request で既知の範囲外とされたもの**（ROADMAP のバックログ 1〜20、ADR-0019 の既知の限界、前回の未確認範囲 5.1〜5.5、`src/` の機能内容、Windows、所要時間など）: 記録だけにする
2. **6.2 完全 checkout での独立した test suite の実行**: 記録だけにする（レビュアーは packet から抽出した最小の環境で確かめた）。この版の検証は commit ごとの一時 worktree で行った
3. **6.3 実装側の「31 形 / 18 見逃し / 20 FAIL」の実測値の再実行**: 記録だけにする

## 対応

- M2-2-BUILTIN-R2-001: 修正済み（`tests/structure/output-guard.ts` の +55 / −20 行と、新しい回帰テスト 100 件。v0.5.19）
- ADR-0019 の決定 2 を改訂し、決定 7 と既知の限界を足し、影響の節に v0.5.19 を足した。ARCHITECTURE の出力の出口の節も直した。ADR-0017 は、矛盾する行が無いので変えていない
  （決定 5 の「キーが端末ではないプロパティの文字列リテラルでない要素アクセス（キーの型を問わない）は違反」は、v0.5.19 の実装と一致する。v0.5.18 が食い違っていた）
- バックログは項目も番号も変えていない。`src/` は変えていない

## 学んだこと（v0.5.19）

- **型は、違反を見つけるためだけに使う。「違反でない」と決める根拠は、構文か宣言の解決にする**。型注釈・`as`・`any`・`JSON.parse`・引数・戻り値・オーバーロード・`declare const`・
  readonly のプロパティは、どれも「実行時の値と違う型」を作れる。許可の分岐（違反 0 を返す判断）が型の情報で分かれるガードは、型の偽装で迂回できる。
  v0.5.4 の型の信頼が、v0.5.17・v0.5.18 の 2 回の修正でも残り、3 回目のレビューで見つかった。同じ系統の指摘が続いたのは、修正のたびに「その指摘の形」を塞ぎ、
  「許可を返す分岐そのもの」を数え直さなかったため
- **許可の分岐を全部数える**（洗い出しの基準。SP1 から使う）
  1. ガードの中で「違反 0 を返す」判断（`literalKey`・`isStringLiteral`・`getTypeAtLocation`・`flags &`・`getResolvedSignature` などの結果で分かれる所）を `git grep` で全件挙げ、
     「許可か検出か」「根拠は構文・宣言・型のどれか」を表にする（今回は 14 か所）
  2. 根拠が型の許可は、型を作る手段ごとに偽装の fixture を作る（`as`・`as unknown as`・`any` の注釈・`JSON.parse`・引数・戻り値・総称型・オーバーロード・`declare const`・readonly・`satisfies`・`!`）
  3. holder の種類ごとに同じ fixture を当てる（`process`・`globalThis.process`・`globalThis[p]`・`node:process`・`?.`・括弧・`!`）
  4. 実行時の到達を 1 形ずつバイト数で確かめる（型エラーで止まる形と止まらない形を分ける）
  5. 同じ型の判定が別のファイル・別の規則（output-guard・process-guard・brand-guard・`typescript.ts`）にもないか確かめる
  6. 塞げない形は、限界として ADR に書く（保証の外と明記する）
  7. 止める基準: 別の軸で 2 巡（偽装の手段・holder・別の規則、次に構文の形・holder を別の経路で得る形）洗い出して、新しい迂回が出なくなるまで。SP1 が 1 巡目、
     SP2 の実装の前に人間が承認した軸で 2 巡目。2 巡目で見つかった新しい迂回は、数行で塞げて `src/` と対照を誤検出しないものだけ塞ぎ、それ以外は限界に書いて塞がない。
     許可の根拠に型を使う新しい系統が見つかったときだけ止まる
- **保証の文は、文にある言葉を 1 つずつ fixture にする**（v0.5.18 の教訓の続き）。ADR に「型が 1 つに決まる」と書いたことが、型の信頼を保証として読ませた。保証の文には、
  何を根拠に許すかを必ず書く
- **修正前の FAIL の件数は、新しいテストだけを v0.5.18 の写しで動かして実測する**（今回は 100 件中 39 件。SP1 の下書きの 30 件に、山括弧の 1 形・R1 の対照だった 3 形・パスの書き方 5 形が加わった）
- **検証の worktree は commit の SHA を指定して作る**（`HEAD` という名前で作らない）。v0.5.18 のときの誤りを繰り返さないため、今回も commit ごとに SHA で作って確認した
