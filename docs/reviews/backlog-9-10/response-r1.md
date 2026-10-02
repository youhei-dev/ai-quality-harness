# バックログ 9・10 の独立レビュー 1 回目への対応記録（response-r1）— v0.5.25

- 対象レビュー: `docs/reviews/backlog-9-10/independent-review-r1.md`（受領ファイル名 `independent-review-backlog-9-10-r1-for-claude.md`、2026-10-03 受領、28,500 バイト、SHA-256 `32668ce5d6dee8145a692fa57e2eeb1429995c74eff0e06e56871b4dde15ed53`、LF 569 / CR 0 / TAB 0 / U+FFFD なし / 禁止文字 0。
  対象 v0.5.24 = commit 500575a / tag object a77892e、範囲 `v0.5.23..v0.5.24`）。**原文は編集していない**（受領ファイルと `cmp` で同一。注記を足さないので、この SHA-256 がファイルのものと一致する。Security Scan に一致する行は無く、分割表記に変えた行は 0）
- 対応日: 2026-10-03
- 結果（レビュアー）: **High 2（R1-001・002）/ Medium 1（R1-004）/ Low 1（R1-003）**。分類は、不注意で書ける形が High 2・Medium 1、(iii) が Low 1。**`src/` に実在する漏れは 0**（生の禁止文字が残る現行の書き込み漏れは無い。R1-004 の迂回の枝は `executeCommand` に 1 か所あるが、迂回する呼び出し元は 0）。
  レビュアーは対象コード・fixture・テストを実行していない（静的な読解のみ）。ROADMAP の方針により、High があるので 2 回目を行う
- **2 回目の扱い（人間の判断）**: 2 回目は**差分（`v0.5.24..v0.5.25`）だけを小さなパケットで出し、上限とする**。結果がどうでも 3 回目は行わない

## 人間の判断（この作業の仕様）

1. 1 回目の指摘（High 2・Medium 1・Low 1）は**その場で直す**。そのあと差分だけを 2 回目に出す（上限）
2. R1-001・002（`tests/file-write-sites.test.ts`）は**「狭く正直に」**直す: `writev`・`writevSync` を一覧に足す。「門あり」の正規表現判定（`GATE`）をやめ、既知の書き込み箇所を 1 件ずつ明示した表と照合する（門の正しさの証明は、このテストの役目にしない。実 CLI のテストが担う）。
   stream・`FileHandle` は ADR-0019 の入口で塞がれているかを実測し、塞がれていなければ既知の限界として ADR に書く。**Node の型宣言から書き込み系を全部列挙して追う方式にはしない**（型を許可の根拠にする系統を増やさない）。ADR-0020 の「新しい書き込み箇所を見せる」は「Node fs の列挙した関数による書き込み箇所」に狭める
3. R1-003（Low）: Markdown の `\u{HEX}` は表示用の表記で、元から同じ文字列があった場合と区別できない、を ADR-0020 の既知の限界に書く（コードは変えない）
4. R1-004（Medium）: 実測してから決める。既定は `env: checkEnv(options.env ?? process.env)`。期待値が変わる既存テストが 1 件でもあれば、変えずに停止して報告する

## 指摘の判定（実測 M1〜M5 は下の表）

| ID | レビュアーの主張 | 実測 | 判断 | 直した commit |
|---|---|---|---|---|
| R1-001（High） | `CONTENT_WRITERS` が ADR-0019 の入口の表にある `writev`・`writevSync` を欠き、stream・`FileHandle` の method は列挙できない | **確認できた**（M1・M2）。`writev`・`writevSync` は一覧に無く、import は許可、型どおりの呼び出しは fd が number なので出力ガードの違反になる。`FileHandle` は入口で塞がれている。stream は塞がれていない | `writev`・`writevSync`・`cp` を一覧に足した。stream は既知の限界、`FileHandle` は「入口で塞がれている」として ADR-0020 に書いた（C3）。型宣言からの列挙は採らない（承認どおり） | C1 `30023a2` ＋ C3 |
| R1-002（High） | 「門あり」判定が第 2 引数の文字列検索で、部分だけの変換を「門あり」にし、`createWriteStream`・`copyFile`・`cpSync` の第 2 引数は内容でない | **確認できた**（M3）。部分変換・条件の一方だけ・結果を使わない式はすべて「門あり」、別の行で変換した変数は「門なし」。第 2 引数は options／destination | `GATE` をやめ、既知の 5 か所を 1 件ずつ明示した表（箇所・外側の関数・書く関数・内容の式の文字列・種別・注記）と照合。関数ごとに内容の引数の位置を持つ。式が変わるとテストが落ちて人間が見直す | C1 `30023a2` |
| R1-003（Low） | Markdown の `\u{HEX}` は元の文字列と区別できない（JSON は区別できる） | **確認できた**（M5）。`latest.md` では同じ表示、`latest.json` では別の値 | コードは変えない。ADR-0020 の既知の限界に書いた（元データの忠実な確認には JSON を使う） | C3 |
| R1-004（Medium） | `options.env` を渡すと `checkEnv()` を丸ごと迂回する | **確認できた**（M4）。迂回する枝は 1 か所、`options.env` を渡す呼び出しは `src/`・`tests/` ともに 0。変更を入れても既存 1,355 件が全部 PASS（期待値が変わる既存テスト 0 件） | `env: checkEnv(options.env ?? process.env)`。`options.env` は呼び出し元の環境で `checkEnv` の元。渡した env も通る | C2 `e8d4465` |

- **レビュアーの主張と実測の食い違い**: 大きな食い違いは無い。補足が 2 つ。(1) `FileHandle` の `.write()` などが列挙できないのは事実だが、`src/` からは到達できない（`node:fs/promises` が許可外で、`{ promises }`・`fs.promises`・default import・動的 `import()`・`process.getBuiltinModule` もすべて違反。M2）。
  (2) レビュアーが修正案にした「`options.env` が完成した環境でなければ test-only の別 API に分ける」は不要だった（`options.env` を渡す既存の呼び出しが 0 件で、親の環境として定義し直せた）
- **レビュアーの提案で、今回は取り入れなかったもの**: (a) `CONTENT_WRITERS` を Node の型宣言から列挙する案（承認の「狭く正直に」により採らない。やりたくなったら停止して報告する取り決め）。
  (b) §8 の提案「v0.5.23 の代表的な golden fixture を保存して、通常のレポートがバイト単位で同じことをテストで固定する」（Low にも数えられていない提案）。この版の範囲外。互換性は C1〜C5 のそれぞれで v0.5.23 との比較を実測した。固定するかは人間の判断

## 実測

作業用ファイルは `tmp/backlog-9-10/r1-fix/`（git 管理外）。探り用の入力は `src/` に置いていない（型検査器にメモリ上で渡した）。

### M1: fs の書き込み系の関数と、v0.5.24 の一覧・ガード

出力ガード（`outputViolations`）と brand-guard を当てた（process-guard は `tests/` の外部コマンドの宣言用で、fs の import には関与しない）。`src/` の呼び出しは型検査器で宣言に解決して数えた。

| 関数（モジュール） | v0.5.24 の一覧 | 内容の引数 | named import（ガード） | 型どおりの呼び出し（ガード） | `src/` の呼び出し |
|---|---|---|---|---|---|
| `writev`・`writevSync`（fs） | **無い**（ADR-0019 の入口の表は書き込み系として挙げている） | 第 2 引数（buffers の配列） | 許可（違反 0） | 違反（fd への書き込み。fd が number のため） | 0 |
| `cp`（fs・fs/promises。callback／promise） | **無い**（`cpSync` はある） | 無い（第 2 引数はコピー先） | 許可 | 違反なし | 0 |
| `truncate`・`truncateSync`・`ftruncate`・`ftruncateSync`（fs） | 無い | 無い（切り詰め、延長は NUL 埋め） | 許可 | 違反なし（`ftruncateSync` の number の fd も） | 0 |
| `rename*`・`link*`・`symlink*`・`mkdtemp*`（fs） | 無い | 無い | 許可 | 違反なし | `renameSync` 4、`mkdirSync` 2 ほか。内容を書くものは 0 |
| `open`・`openSync`（fs）／`open`（fs/promises） | 無い | 無い（fd または `FileHandle` を返す） | fs は許可、fs/promises は許可外（違反） | `openSync` の fd を `writeSync` に渡す形は違反 | `openSync` 1（読み取り用） |
| 一覧にある 10 個（v0.5.24） | ある | `writeFileSync` ほか 6 個は第 2 引数。`createWriteStream`・`copyFile`・`copyFileSync`・`cpSync` は無い | — | — | `writeFileSync` 5 か所のみ（init 3、review-packet 1、`writeAtomic` 1） |

- `src/` の出力ガード・brand-guard の違反は 0／0（v0.5.24 で測定。`rename`・`link`・`symlink`・`mkdtemp`・`mkdir`・`truncate`・`open` の型どおりの呼び出しも補足の探りで違反 0 を確かめた。C2 の後は、全テストの中の構造ガードのテストで確かめる）
- 第 2 引数の名前（宣言から）: `createWriteStream(path, options)`、`copyFile(src, dest, …)`、`copyFileSync(src, dest, mode)`、`cpSync(source, destination, opts)`。内容ではない（R1-002 の主張どおり）

### M2: stream・`FileHandle`

| 形 | ガード | v0.5.24 のテストの目に見えるか |
|---|---|---|
| `createWriteStream(p).write(x)`・`.end(x)`・`{ flags: "a" }` 付き | **違反なし**（塞がれていない。書き込み先が文字列のパスなので許される） | `createWriteStream` の呼び出しだけ見える。`.write()`・`.end()` は見えない |
| `createWriteStream(p, o)`（options が変数）・`{ fd: 1 }` | 違反（`fd` が入り得る） | 同上 |
| `fs/promises` の `open()` の `FileHandle` の `.write()`・`.writeFile()`・`.appendFile()`・`.createWriteStream()` | **違反**（`node:fs/promises` は許可外） | 見えない（だが入口で塞がれている） |
| `{ promises }` の import／`import * as fs` の `fs.promises`／`import fsp from "node:fs/promises"`／`import("node:fs/promises")`／`process.getBuiltinModule("node:fs/promises")` | すべて違反 | 見えない（塞がれている） |
| `fs.open` の callback や `openSync` の fd を `write`・`writeSync` に渡す | 違反（fd への書き込み） | 見える（`write`・`writeSync`） |
| `node:stream`・`node:stream/promises` | 違反（許可外のモジュール） | — |
| `src/` の実数 | `createWriteStream` 0、`FileHandle` 0、stream の `.write()` 0 | — |

→ **stream は塞がれていない**ので既知の限界として ADR-0020 に書く。**`FileHandle` は入口で塞がれている**と書き、そのことを新しいテストが確かめる（出力ガードが `node:fs/promises` を違反にする）。

### M3: `GATE` の判定（v0.5.24 のテストと同じ走査を探り用の式に当てた）

| 探り用の式（書き込みの内容の引数） | v0.5.24 の判定 | 実際 |
|---|---|---|
| `"# " + raw + "\n" + escapeRawCharsAsJson(body)`（生の接頭辞 + 変換済みの本文） | 門あり | 一部だけ変換（**偽陽性**） |
| テンプレートリテラルの一部だけ変換 | 門あり | 一部だけ変換（偽陽性） |
| `c ? escapeForDisplay(body, "keep") : raw`（条件の一方だけ） | 門あり | 一方は生（偽陽性） |
| `raw + String(escapeRawCharsAsJson(body).length)`（結果を使わない） | 門あり | 変換済みの内容は書かれない（偽陽性） |
| 変換済みの変数を別の行で作って渡す（`const safe = escapeRawCharsAsJson(body); … safe`） | **門なし** | 安全（**偽陰性**） |
| 変換する関数の戻り値を渡す | 門なし | 安全（偽陰性） |
| `createWriteStream(file, { encoding: escapeForDisplay(...) })`、`copyFileSync(src, escapeForDisplay(...))`、`cpSync(src, escapeForDisplay(...))` | 門あり | 第 2 引数は内容ではない（options／コピー先） |
| 全体を変換（`writeFileSync(file, escapeRawCharsAsJson(body))`） | 門あり | 安全（対照） |

→ 偽陽性と偽陰性の両方があり、レビュアーの主張どおり。正規表現を捨て、表との照合にした。

### M4: `options.env`（R1-004）

| 調べたこと | 結果 |
|---|---|
| `executeCommand` に `env` を渡す呼び出し | `src/` 0、`tests/` 0（`ExecuteOptions` を使うのは `src/runner/execute.ts` だけ。`runChecks` に env の option は無い） |
| `checkEnv(options.env ?? process.env)` にして全テスト（一時 worktree） | **1,355／1,355 PASS**（115 ファイル、54 秒）。期待値が変わる既存テスト **0 件**。試したあと戻して worktree を片付けた |
| 他の子プロセスの起動 | git を起動する箇所（security-scan・init・review-packet・git の情報）は check ではなく、`checkEnv()` の対象外 |

→ 既定の方針で C2 を行った。

### M5: Markdown の表記と、元からある同じ文字列（R1-003）

本物の CLI の `verify` で、check が「バックスラッシュ + `u{1B}` の文字列」と本物の ESC を 1 行ずつ出した。

| ファイル | 元からある文字列の行 | 本物の ESC の行 | 区別 |
|---|---|---|---|
| `latest.md` | `\u{1B}[31mred\u{1B}[0m` | `\u{1B}[31mred\u{1B}[0m` | **できない**（同一の表示） |
| `latest.json`（ファイルの中の文字） | `\\u{1B}[31mred\\u{1B}[0m`（バックスラッシュ自体が escape される） | `\u001b[31mred\u001b[0m` | できる。読み戻すと前者はバックスラッシュ + `u{1B}`、後者は ESC で別の値 |

どちらのファイルにも生の ESC は 0。レビュアーの主張どおり。

## 新しいテストと、修正前の失敗

| commit | 新しいテスト | 修正前のコードでの結果 |
|---|---|---|
| C1 `30023a2` | `tests/file-write-sites.test.ts` を 3 → **30 件**（実ソースと表の照合 3、メモリ上のシナリオ 22、表の差分の比較 5） | `src/` を 9 通りに変えて旧テストと新テストを同じ変更に当てた（SHA 指定の worktree）: 旧テストは **6 件を見逃した**（`writevSync` の追加、`writev` の追加、部分変換、新しいファイルの `writevSync`、新しいファイルの `cp`、FileHandle の書き込み）。新テストは **8 件を 1 件ずつ報告**し、見ないのは FileHandle の 1 件だけ（出力ガードが塞ぐ）。旧テストが報告した 3 件のうち、安全な変換を別の行に移した 1 件は偽陽性 |
| C2 `e8d4465` | `tests/regression-backlog10-r1-004-options-env.test.ts` **5 件** | 修正前のコードで **4 件 FAIL**（子に `FORCE_COLOR`・`PY_COLORS` が届き、`NO_COLOR` が付かない。出力は有無だけで値は出さない）。残り 1 件（渡した env を変えない）は前後とも PASS |

既存テストの期待値の変更は、C1 の仕様で作り直した `file-write-sites` の 3 件（置き換え）を除いて **0 件**（ほかの既存 1,352 件は変えていない）。テスト件数: 1,355（115 ファイル）→ C1 後 1,382 → C2 後 1,387（116 ファイル）。

## 変えたもの

- C1: `tests/file-write-sites.test.ts` のみ（`src/` は変えない）
- C2: `src/runner/execute.ts`（+2／−1 行。`env` の説明と `checkEnv(options.env ?? process.env)`）、新しいテスト 1 ファイル
- C3（この commit）: `docs/reviews/backlog-9-10/`（原文と本書）、ADR-0020、ROADMAP、ARCHITECTURE
- C4: `package.json` の version、CHANGELOG、README
- `tests/structure/`・`brand-guard.ts`・禁止文字の集合（75 コードポイント）・依存関係・`package-lock.json` は変えていない

## 残る確認と持ち越し

- 2 回目のレビュー（範囲 `v0.5.24..v0.5.25`）は、1 回目の原文を `--review` に渡した差分だけのパケットで行う。**上限であり、3 回目は行わない**
- 書き込み箇所のテストは、新しい書き込みと式の変更を見えるようにするだけで、変換が内容の全部に掛かることは確かめない（実 CLI のテストが担う）。stream の `.write()`・`.end()` は ADR-0020 の既知の限界
- 持ち越し候補（人間の判断）: v0.5.23 の golden fixture によるバイト単位の固定（上記 (b)）
