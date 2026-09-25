# M2-2 独立レビュー R4 への対応記録（response-r4）— v0.5.5（出力の出口の強化の区切り）

- 対象レビュー: `docs/reviews/m2-2/independent-review-r4.md`（受領ファイル名 `independent-review-m2-2-r4-for-claude.md`、ChatGPT、2026-09-25 付、SHA-256 320190bc…。
  対象 v0.5.4 = commit f33c75f / tag object 29ee54e、範囲 v0.5.3..v0.5.4、パケット `review-packet-m2-2-r4.md`）
- 対応日: 2026-09-25
- 結果（レビュアー）: 前回の 3 件は R3-001 が解消、R3-002・R3-003 が部分的に解消。新しい指摘は High 0 / Medium 2（M2-2-R4-001・002）/ Low 0
- 人間の判断: 完了基準「High が無ければ区切り、Medium 以下はバックログへ」に従い、出力の出口の強化（M2-2-R3-001〜003、v0.5.4）を v0.5.5 で区切る。
  2 件は **Medium のままバックログの先頭へ（v0.5.5 では修正しない）**。v0.5.5 は docs だけの版。区切る前に 2 件の前提を実測した（M2-2-R1-007 の教訓）

## 前回の指摘の判定（レビュアーの判定）

| ID | 判定 | 補足（レビュアー） |
|---|---|---|
| M2-2-R3-001 | 解消 | 1 行の書き出しは LF・TAB も表記になり、複数行はコマンド自身の block だけ。設定案のコメントの値、設定エラーの見出しと詳細、commander の使い方エラー（提案の行を偽装する引数を含む）を回帰テストが直接確かめている |
| M2-2-R3-002 | 部分的に解消 | 通常のキーの表記・mask・衝突の検出、`__proto__` は直った。関数の値の `toJSON` というキーが残る（→ M2-2-R4-001） |
| M2-2-R3-003 | 部分的に解消 | `process[key]`、リフレクション、キャスト、`src/output.ts` の中の書き出し、`Safe` の偽造、fd、stdio、動的なコードは検出する。`process.getBuiltinModule(…)` が残る（→ M2-2-R4-002） |

## 2 件の前提の確認（実装 AI、2026-09-25。`tmp/m2-2/r4-record/`。`src/`・`tests/` は変えていない）

LF・TAB・禁止文字・ダミーの秘密の形は実行時に作り、記録では `\u{A}` などの表記と `<SECRET>` にした。

### M2-2-R4-001（Medium）— 再現できた。今の各コマンドの `--json` に該当は 0 件。High の基準には当たらない

**再現**（v0.5.4 の `src/output.ts` の `safeJson()` に、自分のプロパティとして関数の値の `toJSON` を持つ object を渡した）

| 渡した値 | `"keep"` | `"escape"` |
|---|---|---|
| `toJSON` が U+202E を含む文字列を返す | 出力に生の U+202E が 1 個 | 同じ |
| `toJSON` がダミーの秘密の形を値に持つ object を返す | 秘密の形が mask されずに出る | 同じ |
| 入れ子の object の `toJSON` が U+202E を含む文字列を返す | 生の U+202E が 1 個 | 同じ |

**同じ種類の洗い出し**（`JSON.stringify()` が特別に扱う値が、`jsonSafe()` を通った後にどうなるか。運べる所には U+202E とダミーの秘密の形を入れた）

| 値 | 結果 | 生の禁止文字・秘密の形 |
|---|---|---|
| 自分の `toJSON`（関数の値） | **そのまま出る**（`JSON.stringify()` が関数を呼び、戻り値で置き換える） | **出る** |
| 自分の `toJSON`（関数を返す、数えられる getter） | **そのまま出る**（`Object.entries()` が getter を呼んで関数を写す） | **出る** |
| 関数の値（プロパティ） | 消える | 出ない |
| 関数の値（最上位） | 消える（`safeJson()` の戻り値が `undefined`） | 出ない |
| プロトタイプの `toJSON`（`Date`、クラス） | 形が変わる（`{}`。写しにプロトタイプが無いので呼ばれない） | 出ない |
| `bigint` | 例外（`JSON.stringify()` の TypeError。CLI では最上位の unexpected error、exit 2） | — |
| `symbol`（値・キー） | 消える | 出ない |
| `undefined`（プロパティ／配列の要素） | 消える／形が変わる（`null`） | 出ない |
| `NaN`・`Infinity` | 形が変わる（`null`） | 出ない |
| `Map`・`Set` | 形が変わる（`{}`） | 出ない |
| クラスのインスタンス | 形が変わる（自分の数えられるプロパティだけ。値は表記・mask を通る） | 出ない |
| `String` の object | 形が変わる（1 文字ずつの object。値は表記を通る） | 出ない |
| 数えられないプロパティ | 消える | 出ない |
| 自分の数えられる getter | 値を読んで写す（表記・mask を通る） | 出ない |
| プロトタイプの getter | 消える | 出ない |

- 生の禁止文字や mask されない秘密の形が出たのは、自分の `toJSON` に関数が入る 2 形だけ

**今の呼び出し**: `safeJson()` を呼ぶのは `src/output.ts:131`（`createOutput().json`）だけ。それを使うのは `src/commands/init.ts:100`、`src/commands/review-packet.ts:126`、
`src/commands/security-scan.ts:56` の 3 か所

**実行時の確認**（一時 worktree の `safeJson()` にだけ、JSON のデータ〈文字列・有限の数・真偽値・null・配列、プロトタイプが `Object.prototype` か null の object〉でない値と
呼び出し元を記録する検査を足した。commit していない。検査を足しても出力は変わらない）

| 流したもの | `safeJson()` の呼び出し | うちコマンドから | コマンドからの呼び出しで JSON のデータでない値 |
|---|---|---|---|
| `npx vitest run`（98 ファイル 618 件 PASS） | 47 | 30（init 4、review-packet 20、security-scan 6） | **0** |
| v0.5.4 のバイト比較の 42 通り（通常の 40 通りは一致のまま） | 5（`--json` の通り） | 5（init 2、review-packet 1、security-scan 2） | **0** |

- テストが `safeJson()` を直接呼ぶ 17 回のうち 3 回に `undefined` があった（R3-002 の回帰テストの対照が、従来の出力と比べるために意図して入れた値。CLI の出力ではない）
- 判定: 今の CLI の `--json` に JSON のデータでない値は無く、利用者由来の値が表記・mask を通らずに出る経路は無い。High の基準に当たらない。共通の関数の保証の不足として Medium のまま

### M2-2-R4-002（Medium）— 再現できた。今の `src/` の使用は 0 件。High の基準には当たらない

**再現と同じ種類の洗い出し**（v0.5.4 の `tests/structure/output-guard.ts` に fixture を当てた。fixture は型検査を通る）

| 書き方 | v0.5.4 のガード |
|---|---|
| `process.getBuiltinModule("node:console").log(…)` | **検出しない** |
| `process.getBuiltinModule("node:vm").runInThisContext(…)` | **検出しない** |
| `process.getBuiltinModule(name)`（名前を変数で渡す） | **検出しない** |
| `globalThis.process.getBuiltinModule("node:console")` | **検出しない** |
| `getBuiltinModule("node:worker_threads")` の `Worker` | **検出しない** |
| `process.dlopen(module, file)`（ネイティブのアドオンを読む） | **検出しない** |
| `process.report.writeReport("stdout")`（診断レポートを標準出力へ書く） | **検出しない** |
| `getBuiltinModule("node:child_process")` の `spawnSync`（stdio `"inherit"`） | 検出する（呼び出しを型で child_process に解決し、stdio の規則） |
| `getBuiltinModule("node:fs")` の `writeSync(1, …)` | 検出する（fd の規則） |
| `process.binding(…)`・`process._linkedBinding(…)`・`process._rawDebug(…)` | 検出する（型に無いので使うにはキャストが要り、キャストの規則で検出） |
| `process.mainModule?.require(…)`・`module.require(…)` | 検出する（`require`） |
| ADR-0017 の既知の限界: `worker_threads`、`node:repl`・`node:test`、`tty.WriteStream(fd)`、`util.debuglog`、`process.emitWarning`、実行時に組み立てたパスへの fs の書き込み | どれも検出しない（v0.5.4 と同じ） |
| 対照: `import vm from "node:vm"` | 検出する |

- 実行時: Node 24 の `process.getBuiltinModule("node:console").log` と `("node:vm").runInThisContext` は関数（知らない名前は `undefined`）。`process.report.writeReport("stdout")` は
  ファイルを作らずに標準出力へ 48,925 バイト書いた（レポートには環境変数などが入るため、中身は表示していない）
- 今の `src/`（`git grep`、コメントを含む）: `getBuiltinModule`・`process.binding`・`_linkedBinding`・`_rawDebug`・`dlopen`・`mainModule`・`module.`・`process.report`・
  `worker_threads`・`node:repl`・`node:test`・`node:tty`・`WriteStream`・`debuglog`・`emitWarning`・`node:vm`・`require`・`createRequire`・`import(`・`new Function`・`eval`・
  `globalThis`・`Reflect.` はすべて 0 件（`writeReport` の 3 件は aiqh 自身の関数 `writeReports`）
- `src/` が読み込む組み込みモジュールは 6 つ（child_process・crypto・fs・path・string_decoder・zlib。v0.5.3 と同じ）。そのほかは commander・jsonc-parser・zod
- 判定: 今の `src/` はこれらの方法を使っておらず、構造ガードの外で端末に書く箇所は無い。High の基準に当たらない。再発防止の取りこぼしとして Medium のまま

## docs とコードの不一致（直した記述）

| 文書 | 実測と合わない記述 | 直し方 |
|---|---|---|
| ADR-0017 の決定 5 | 型検査で中身が見えないコードに「`node:vm`」とだけ書き、どの取り方でも検出すると読める | 「`node:vm` の読み込み（import の宣言と文字列リテラルの `import()`）」とし、`process.getBuiltinModule` は検出しないと書いた |
| ADR-0017 の決定 3 | JSON はキーも値も表記 → mask、とだけ書き、どんな値でも出力を支配すると読める | JSON のデータについての決定であることと、`toJSON` などは既知の限界であることを書いた |
| ADR-0017 の既知の限界 | `process.getBuiltinModule`・`process.dlopen`・`process.report.writeReport("stdout")` と、`safeJson()` の `toJSON` が無い | 「v0.5.5 で追記（M2-2 R4）」として足した |
| `docs/ARCHITECTURE.md` の出力の出口の節 | 「JSON はキーと文字列を表記にしてから mask」「`node:vm`」 | ADR-0017 と同じく直し、既知の限界に R4 の 2 件を足した |

決定そのものは変えていない（新しい ADR は作っていない）。

## 対応

- 2 件とも **Medium のままバックログの先頭へ（v0.5.5 では修正しない）**。重大度はレビュアーの判定のまま
  1. M2-2-R4-001: `safeJson()` の入力を JSON のデータに限る（関数・`symbol`・`bigint`・`toJSON` を持つ値・プロトタイプが普通でない object は fail closed で拒否する）
  2. M2-2-R4-002 と ADR-0017 の既知の限界: `src/` が読み込める組み込みモジュールを一覧（allowlist）で限定し、import・`require`・`process.getBuiltinModule` と同じ種類を
     同じ規則で検査する。process の書き出す関数（`emitWarning` など）の禁止も含む
- SP2 報告（v0.5.4）§10-3 で「m2-2-r4 の結果を受けた次の docs の版で足す」とした構造ガードの既知の限界（`worker_threads`、`node:repl`・`node:test`、`tty.WriteStream(fd)`、
  `util.debuglog`、`process.emitWarning`、実行時に組み立てたパスへの fs の書き込み）を、この版でバックログの 2 に入れた
- 保証の記述の訂正: ADR-0017 の既知の限界に 2 件を追記し、ARCHITECTURE も同じ内容にした

## 出力の出口の強化の区切り

M2-2 独立レビュー R2 の High（R2-001）から始まった、端末への出力の出口の作業を v0.5.5 で区切る。

| 版 | 内容 | 独立レビュー | 指摘（High / Medium / Low） |
|---|---|---|---|
| v0.5.2 | R2-001: すべてのコマンドの端末への出力を 1 つの出口に（ADR-0016） | m2-2-r3（v0.5.1..v0.5.2） | 0 / 3 / 0 |
| v0.5.3 | docs だけ（R3 の記録、出口の限界の明記、バックログ） | — | — |
| v0.5.4 | R3-001〜003: 1 回の書き出し = 1 行と block、JSON のキー、2 つの基本関数と `Safe`、構造ガードの強化（ADR-0017） | m2-2-r4（v0.5.3..v0.5.4） | 0 / 2 / 0 |
| v0.5.5 | docs だけ（R4 の記録、既知の限界の追記、バックログ） | — | — |

- テスト件数: 593（v0.5.2・v0.5.3）→ 618（v0.5.4、98 ファイル）→ 618（v0.5.5、docs だけ）
- 残り（M2-2-R4-001・002、M2-2-R1-002〜006、読めないものを「無い」とする残りの箇所、ファイルへの出力の禁止文字、`NO_COLOR` など）は ROADMAP のバックログの順に扱う

## 教訓

- **共通の出口の保証は、書き出す関数が値の中の何を呼ぶかまで含めて確かめる**: 値とキーの文字列を処理しても、`JSON.stringify()` は値の中の `toJSON` を呼ぶ。
  特別な値を列挙して処理するより、入力を JSON のデータに限って、それ以外を拒否する方が漏れにくい
- **読み込み方を列挙して禁止すると、同じものを取る別の API が漏れる**: import・`require`・`createRequire`・`import()` を禁止しても、`process.getBuiltinModule` で同じ
  モジュールを取れた。読み込めるモジュールを一覧で許す形（allowlist）にする
- **docs に「検出する」と書くときは、検出する方法と対象を分けて書く**: 「`node:vm` を検出する」は、実際には「`node:vm` の import を検出する」だった
