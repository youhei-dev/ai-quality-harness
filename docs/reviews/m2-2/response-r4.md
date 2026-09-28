# M2-2 独立レビュー R4 への対応記録（response-r4）— v0.5.5（出力の出口の強化の区切り）

- 対象レビュー: `docs/reviews/m2-2/independent-review-r4.md`（受領ファイル名 `independent-review-m2-2-r4-for-claude.md`、ChatGPT、2026-09-25 付、SHA-256 320190bc…。
  対象 v0.5.4 = commit f33c75f / tag object 29ee54e、範囲 v0.5.3..v0.5.4、パケット `review-packet-m2-2-r4.md`）
- 対応日: 2026-09-25
- 結果（レビュアー）: 前回の 3 件は R3-001 が解消、R3-002・R3-003 が部分的に解消。新しい指摘は High 0 / Medium 2（M2-2-R4-001・002）/ Low 0
- 人間の判断: 完了基準「High が無ければ区切り、Medium 以下はバックログへ」に従い、出力の出口の強化（M2-2-R3-001〜003、v0.5.4）を v0.5.5 で区切る。
  2 件は **Medium のままバックログの上位（2・3）へ（v0.5.5 では修正しない）**。v0.5.5 は docs だけの版。区切る前に 2 件の前提を実測した（M2-2-R1-007 の教訓）

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

- 2 件とも **Medium のままバックログの上位（2・3）へ（v0.5.5 では修正しない）**。重大度はレビュアーの判定のまま。先頭（1）は、v0.5.5 のリリースの検証で見つかった
  不安定なテスト（下の節）
  2. M2-2-R4-001: `safeJson()` の入力を JSON のデータに限る（関数・`symbol`・`bigint`・`toJSON` を持つ値・プロトタイプが普通でない object は fail closed で拒否する）
  3. M2-2-R4-002 と ADR-0017 の既知の限界: `src/` が読み込める組み込みモジュールを一覧（allowlist）で限定し、import・`require`・`process.getBuiltinModule` と同じ種類を
     同じ規則で検査する。process の書き出す関数（`emitWarning` など）の禁止も含む
- SP2 報告（v0.5.4）§10-3 で「m2-2-r4 の結果を受けた次の docs の版で足す」とした構造ガードの既知の限界（`worker_threads`、`node:repl`・`node:test`、`tty.WriteStream(fd)`、
  `util.debuglog`、`process.emitWarning`、実行時に組み立てたパスへの fs の書き込み）を、この版でバックログの 3 に入れた
- 保証の記述の訂正: ADR-0017 の既知の限界に 2 件を追記し、ARCHITECTURE も同じ内容にした

## v0.5.5 のリリースの検証で起きた不安定なテスト

- 起きたこと: v0.5.5 のリリースの検証で、自己 verify の `unit-minpath`（最小の PATH で全テストをもう一度実行する check）が 2 回 FAIL した。失敗したテストはどちらも
  `tests/regression-r4-report.test.ts` の「R4-002 interrupted checks keep timedOut / outputTruncated > timedOut stays true when an abort overlaps a timeout」
  （`exec.interruptedBy` が null。期待は `"SIGINT"`）
- 回数: その時点の unit-minpath の実行 **7 回中 2 回**（release commit の一時 worktree の `npm run verify` と、HEAD の `npm run verify`）。PASS は 5 回（docs の 2 commit の
  worktree の verify、HEAD の `npm run verify:dist`、`npm run test:minpath` の単独実行 2 回）。同じ verify の `unit`（通常の PATH の全テスト）と HEAD の `npx vitest run` × 3 は
  PASS し、このテストのファイルだけの実行は 10 回とも PASS した
- 負荷: 2 回目の失敗の直後に測った負荷平均は 1 分 71.23・5 分 82.17（8 コア。5 分の平均は 1 回目の失敗の時間帯も含む）。ブラウザなどほかのアプリの負荷があり、
  検証が終わった後も 57〜68 だった
- 推定の原因（**確定ではない**）: このテストは、SIGTERM を無視する子（`node -e`）に対し、タイムアウト 300ms → SIGTERM → 猶予 1500ms の間の 600ms に中断（SIGINT）が
  届くことを前提にしている。負荷が高く、子が SIGTERM を無視する処理を登録する前にタイムアウトの SIGTERM が届くと、子はすぐ終わり、600ms の中断の前に実行が終わる。
  負荷の下での子の起動時間は測っていない。この版の変更は docs と版だけで、このテストの経路（`src/runner/execute.ts`）は変えていない
- 対応（人間の判断）: テストの修正はこの版では行わず（v0.5.5 は docs だけの版）、ROADMAP のバックログの先頭（1）に記録した（自己 verify の信頼性に関わるため）。
  v0.5.5 のタグは、負荷の低い状態でのやり直しの検証が PASS した commit に付けた

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

## M2-2-R4-001 の対応（v0.5.10、2026-09-27。`src/` は `src/output.ts` だけ）

SP1（再現・同じ種類の洗い出し・今の呼び出しの確認・設計）の後、人間の承認を得て実装した。作業の記録は `tmp/m2-2/r4-001/`（git 管理外）。決定は ADR-0018。

### 人間の判断（SP1 の承認）

- 方式は「1 回の読み取りで検査しながら写す」（案 B）。先に検査して従来の写しを使う案（A）は、読むたびに値を変える Proxy で迂回できた（SP1 で実測）
- `undefined` はどこでも拒否する（JSON のデータの定義どおりにし、fail closed に揃える）。深さの上限は 100 段
- 拒否のメッセージは種類だけ（キー・値・パスを載せない）。キーの衝突のメッセージは今のまま（表記・mask の後のキーを載せる）
- ファイルへの出力（verify のレポートを写す `maskDeep()`）は扱わず、ROADMAP のバックログ（ファイルへの出力の禁止文字）に足す
- 写しの配列のプロトタイプも外す案（E）は採らない（同じプロセスの中のプロトタイプの汚染は脅威モデルの外）

### 修正の中身

- `jsonSafe()` は JSON のデータ（ADR-0018 の決定 1）だけを受け付け、それ以外は `JSON.stringify()` の前に拒否する（`JSON output refused: <種類> is not JSON data`。
  CLI は最上位の unexpected error、exit 2）
- 各プロパティを記述子で 1 回だけ読み、getter と `toJSON` を呼ばない。配列は `map()` を使わずに新しい配列へ写す（`Symbol.species` を通らない）。
  写しは新しい配列とプロトタイプの無い object だけ
- 循環参照は祖先の列で拒否し、深さは `MAX_JSON_DEPTH`（100）まで。v0.5.9 は、配列で 1,000〜2,000 段、object で 2,000〜5,000 段でスタックが尽きていた
- 新しい回帰テスト `tests/regression-m2-2-r4-001-json-data.test.ts`（34 件）。R3-002 の回帰テストの対照の値から `endLine: undefined` を外した（今は拒否する値）

### v0.5.5 の記録の不足（v0.5.10 の SP1 の洗い出し）

v0.5.5 の「同じ種類の洗い出し」の表と ADR-0017 の既知の限界は、「そのまま出るのは、自分の `toJSON` に関数が入る 2 形だけ」とした。v0.5.9 のコードで洗い出し直すと、
ほかに 6 種類あった（v0.5.5 の表は当時の記録として残す）。

| 形 | v0.5.9 の結果 | 理由 |
|---|---|---|
| `toJSON` を持つ関数（プロパティ・最上位） | そのまま出る | `jsonSafe()` が関数をそのまま返し、`JSON.stringify()` が関数の `toJSON` を呼ぶ |
| static `toJSON` を持つクラス | そのまま出る | 同じ（クラスは関数） |
| `toJSON` を持つ関数を返す getter（`toJSON` 以外のキー） | そのまま出る | `Object.entries()` が getter を呼んで関数を写す |
| Array のサブクラス（プロトタイプの `toJSON`） | そのまま出る | `map()` が `Symbol.species` で同じクラスの配列を作り、写しにプロトタイプの `toJSON` が残る |
| 配列の `constructor[Symbol.species]` の差し替え | そのまま出る | `map()` が差し替えた先の object を写しにする |
| Proxy（自分の `toJSON` を関数として見せる / 配列の要素として `toJSON` を持つ object を返す / `toJSON` を持つ関数） | そのまま出る | トラップが関数を見せる |

- ほかに、`String` の object と `Buffer` / `Uint8Array` は、1 文字（1 バイト）ずつの object に形が変わり、秘密の形が分かれて出て mask が効かなかった
  （生の禁止文字は出ない。v0.5.5 の表は `String` の object を「値は表記を通る」とだけ書いた）
- どれも JSON のデータでない値（関数・accessor・普通でないプロトタイプ・Proxy）が要る。今のコマンドの値には入らない（下の実行時の確認）

### 修正の前後の実測

| 確かめたこと | v0.5.9 | v0.5.10 |
|---|---|---|
| 再現（自分の `toJSON` の 2 形 × 4 か所 × 2 モード、16 通り） | 16 通りすべてで、生の U+202E と mask されない秘密の形が出る | 拒否（何も出ない。回帰テストが上の 6 種類を含む 11 形 × 4 か所 × 2 モードで確かめる） |
| 新しい回帰テスト（34 件） | 33 件 FAIL。PASS の 1 件は対照（JSON のデータの出力が v0.5.9 と同じこと） | 34 件 PASS |
| `safeJson()` の呼び出し（vitest 全体）のうち、コマンドからの 30 回（init 4、review-packet 20、security-scan 6） | JSON のデータでない値 0 件 | 新旧の出力が 30 回とも一致（SP1 の試作で確認） |
| v0.5.4 のバイト比較の 42 通り（`--json` の 5 通り、init `--write` のファイルを含む） | 基準 | 42 通りすべてバイト単位で一致 |
| finding 10 万件の object の `safeJson()`（7 回の中央値） | 1,432 ms | 1,409 ms（SP1 の試作。差は無い。どちらも mask が大半） |

- 期待値が変わった既存テストは、R3-002 の回帰テストの対照の 1 行だけ（`endLine: undefined`）
- テスト件数: 624（v0.5.9、100 ファイル）→ 658（v0.5.10、101 ファイル）

### 教訓（v0.5.10）

- **値を写すときは、読む回数を 1 回にする**: 検査と写しで 2 回読むと、読むたびに値を変えるもの（Proxy、getter）が、検査を通った後で別の値を見せる。
  記述子で 1 回読み、その値を検査して写す
- **「呼ばれる」経路は、値そのものだけでなく、写す操作の中にもある**: `map()` は `Symbol.species` で入力のクラスの配列を作り、写しに入力のプロトタイプが残った。
  写しは、新しい配列とプロトタイプの無い object に自分で入れる
- **洗い出しの表は、型の分類（関数・getter・Proxy・サブクラス）ごとに組み合わせまで作る**: v0.5.5 は `toJSON` を持つ object だけを見て、`toJSON` を持つ関数や
  配列のサブクラスを落とした

## M2-2-R4-002 の対応（v0.5.17、2026-09-28。`src/` は変えない）

SP1（洗い出し・写しでの実測・試作・設計）の後、人間の承認を得て実装した。ROADMAP のバックログ 1 を、順番どおりに人間が選んだ。作業の記録は `tmp/builtin-allowlist/`
（git 管理外）。決定は ADR-0019。

### 人間の判断（SP1 の承認）

- 設計は案 A（読み込みの行き先の一覧 ＋ `process` の 6 つのメンバーを宣言で判定。`getBuiltinModule` は名前を問わず違反）
- 一覧を変えるときは ADR-0019 への追記を必須にし、独立レビューの対象にする。一覧と `src/` の実際が一致することを確かめる回帰テストも、この手続きの一部
- 依存のパッケージは package.json の `dependencies` から読む（ADR-0008 の依存の承認とそろえ、二重に管理しない）
- 文字列リテラルの `import()` は、一覧の中なら許す（行き先の規則は静的な import と同じ）
- `process.stdin` を違反に含める（stdin が端末なら端末に書けることを実測したため）
- ROADMAP のバックログ 1 は「v0.5.17 で解消」として残し、番号を詰めない（番号は docs の多くの箇所から参照されている）
- SP1 で見つけた未処理の例外の表示は、ROADMAP のバックログ 20 に足す（この版では直さない）

### 修正の中身

- `tests/structure/output-guard.ts`: 読み込みの行き先の規則（一覧 `BUILTIN_ALLOWED`・package.json の `dependencies`・`src/` のソースファイル）と、`process` のメンバーの
  規則（一覧 `PROCESS_MEMBERS`。`@types/node` の `process.d.ts` の宣言で判定）を足した。違反の種類は、一覧の外の組み込み、`node:` の無い組み込み、URL、`src/` の
  ソースファイルでないモジュール、依存に無いパッケージ、`import = require()`、`process` のメンバー
- 新しい回帰テスト `tests/regression-m2-2-r4-002-builtin-allowlist.test.ts`（61 件）: 49 形は報告される、対照 8 形は報告されない、fixture の型検査（`data:` の `import()` だけは
  型検査で止まる）、本物の `src/` に違反が無い、一覧と `src/` の実際の一致、6 つのメンバーが今の `@types/node` の宣言に解決すること
- SP1 の試作との違いは、`src/` のソースファイルに解決しない相対 import の文言（「checker に見えない」は `tests/` などのファイルには当てはまらないので、
  「`src/` のソースファイルでない」にした）と、コメントだけ

### 洗い出しと実測（v0.5.17 の SP1。写し）

同じ種類の 63 形を fixture にして、v0.5.16 のガードと試作のガードに当てた。代表の形は、別のスクリプトで実行時に動かし、終了コード・出力のバイト数・印がどちらの
ストリームに出たかだけを記録した（診断レポートは環境変数を含むので、中身を表示せずバイト数だけ。ポートを開く形〈inspector、SIGUSR1〉は動かしていない）。

| 分類 | 形の数 | v0.5.16 が検出 | v0.5.17 が検出 | 実行時の実測（見逃していた形） |
|---|---|---|---|---|
| `process.getBuiltinModule`（文字列・変数・組み立て・`node:` なし・`globalThis`・別名・分割代入・要素アクセス・`node:process` の import など） | 15 | 3（child_process の stdio、fs の fd、`node:process` の stdout を、ほかの規則で） | 15 | console の `log` と vm の `runInThisContext` は標準出力に出た |
| `process` のほかのメンバー（`dlopen`、`report` の 4 形、`emitWarning` の 3 形、`execve`、`stdin`、キャスト 2、`mainModule.require`） | 14 | 3（キャスト 2、`require`） | 14 | `report.writeReport("stdout")` は標準出力に 45,658 バイト、`emitWarning` は標準エラー、`execve` は標準出力、`stdin.write` は stdin が端末なら端末に出た |
| `node:module` と `require`（`Module._load`・`require.cache`・`register`） | 3 | 1（`require`） | 3 | — |
| `import()`（`node:console`・`node:worker_threads` の文字列、置換つきのテンプレート） | 3 | 1（計算された `import()`） | 3 | Worker は標準出力に出た |
| 静的な import と `export … from`（`worker_threads`・`repl`・`test`・`inspector`・`tty`・`util.debuglog`・`wasi`・`cluster`・`node:` の無い `fs`・再エクスポート・`data:` と `.mjs` の副作用の import・`import { type X }`） | 13 | 0 | 13 | Worker・repl・test・`tty.WriteStream(1)`・`cluster.fork` の子・`data:` の import は標準出力、`util.debuglog` は `NODE_DEBUG` を設定したときだけ標準エラーに出た |
| fs のリテラルの装置のパス（`/dev/fd/1`） | 1 | 1 | 1 | — |
| 計 | **49** | **9** | **49** | 見逃していた形のうち動かした 13 形は、どれも端末に届いた |

- ほかに、`import()` に `data:` の URL を渡す形は型検査で止まる（`Cannot find module`）。対照 8 形（許可済みの 6 つの組み込み、`import type`、`process` の普通の使い方、
  依存の 3 つ、`src/` の相対 import、型の中の参照、許可済みの `import()`、`import.meta.resolve`）は、v0.5.16・v0.5.17 ともに報告しない
- 塞げない・範囲外として測った 5 形（実行時に組み立てたパス 3、自分自身への SIGUSR1、タイマーの中の未処理の例外）は、ADR-0019 の既知の限界。組み立てた `/dev/stdout` への
  書き込みは標準出力に、未処理の例外は生のメッセージとソースの行が標準エラーに出た（exit 1）。SIGUSR1 はポートが開くので動かしていない
- 今の `src/` はどの形も使わない（`git grep` と、v0.5.17 のガードを `src/` に当てた違反 0 件）

### v0.5.5 の記録の不足（v0.5.17 の SP1 の洗い出し）

v0.5.5 の「再現と同じ種類の洗い出し」の表（上の M2-2-R4-002 の節）と ADR-0017 の既知の限界に無かった形: `process.execve`（今のプロセスを置き換え、端末を引き継ぐ）、
`process.stdin`（stdin が端末なら書ける）、`process.report` の設定とファイルへの書き出し、`node:wasi`（stdout の既定は fd 1）、`node:cluster`（子が端末を引き継ぐ）、
`export … from`、`data:` と `.mjs` の副作用の import、`node:` の無い組み込み、`import { type X }`（実行時にモジュールを読む）、`Module._load` と `register`。
v0.5.5 の表は当時の記録として残す。

### 修正の前後の実測

| 確かめたこと | v0.5.16 | v0.5.17 |
|---|---|---|
| 新しい回帰テスト（61 件） | 42 件 FAIL（見逃していた 40 形と、一覧の一致・メンバーの宣言）。PASS の 19 件は、既に検出していた 9 形・対照 8・fixture の型検査・`src/` の違反 0 | 61 件 PASS |
| 本物の `src/` への違反 | 0 | 0 |
| 既存のガードのテスト（r2-001 の 21 件、r3-003 の 7 件） | PASS | PASS（期待値は変えていない） |

- テスト件数: 700（v0.5.16、103 ファイル）→ 761（v0.5.17、104 ファイル）

### 教訓（v0.5.17）

- **能力を一覧で許すときは、読み込みの「方法」ではなく「行き先」で決める**: import・`require`・`getBuiltinModule` と方法を列挙すると、`data:` の副作用の import や
  再エクスポートのように、別の方法が残る。読み込むすべての行き先を、一覧（組み込み・自分のソース・承認済みの依存）と照らす
- **グローバルのオブジェクトのメンバーも、モジュールと同じく能力として数える**: `process` は import なしで使え、`execve`・`stdin`・`report` のように端末やほかのプログラムに
  届くメンバーを持つ。宣言で見つけて、別名・分割代入でも同じ規則にする
- **宣言のファイル名で判定する規則には、宣言が見つかることの自己検査を置く**: `@types/node` の構成が変わると、規則が黙って効かなくなる
