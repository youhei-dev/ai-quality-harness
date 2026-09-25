# M2-2 独立レビュー R2 への対応記録（response-r2）— v0.5.2

- 対象レビュー: `docs/reviews/m2-2/independent-review-r2.md`（受領ファイル名 `independent-review-m2-2-r2-for-claude.md`、2026-09-25 付、SHA-256 a50cbddd…。
  対象 v0.5.1 = commit c15ae92 / tag object 5b018b6、範囲 v0.5.0..v0.5.1、パケット `review-packet-m2-2-r2.md`）
- 対応日: 2026-09-25
- 結果（レビュアー）: 前回の 2 件は解消（M2-2-R1-007、M2-2-R1-001）。新しい指摘は High 1（M2-2-R2-001）/ Medium 0 / Low 0
- 人間の判断: M2-2-R2-001 は High のまま v0.5.2 で直す。security-scan だけの局所的な修正にせず、**すべてのコマンドの標準出力・標準エラーを、
  共通の安全な出口 1 つに通す**構造にする（M2-1 と O1 の教訓: 1 か所ずつ直すと漏れる）

## 前回の 2 件の判定（レビュアーの判定）

| ID | 判定 | 補足（レビュアー） |
|---|---|---|
| M2-2-R1-007 | 解消 | `existsSync()` が消え、ENOENT とそれ以外が `readFileSync()` のエラーコードで分かれる。root では権限のテストが skip されるが、ENOTDIR・ELOOP が同じ分岐を skip なしで通す |
| M2-2-R1-001 | 解消 | Rejected の `--range` より前に作業ツリーと root を確定し、範囲に依存しない検査を続ける。塞がれた値やそこから得た SHA が git に渡る経路は無い |

## M2-2-R2-001（High）— 再現と、いつからあったか

`tmp/m2-2/r2-fix/repro/check.ts`（修正はしない。v0.5.1 = HEAD はこのリポジトリ、v0.5.0・v0.4.4 は一時 worktree）で CLI を子プロセスで起動し、
標準出力・標準エラーの生の禁止文字の数を数えた（U+202E は実行時に作る）。

| ケース | 内容 | v0.5.1 | v0.5.0 | v0.4.4 |
|---|---|---|---|---|
| a | security-scan、作業フォルダ名に U+202E、既定の設定ファイルが symlink のループ | exit 2、stderr に 2 個（ConfigError のパスと Node のメッセージ） | exit 0、stdout に 1 個（既定値で走査し、見出しの行にパス） | 同左 |
| a（`--json`） | 同上 | exit 2、stderr に 2 個 | exit 0、stdout に 1 個（JSON の `root`） | 同左 |
| b | 同じフォルダで `--config` に存在しないファイル | exit 2、stderr に 1 個 | 同じ | 同じ |
| c | U+202E の git でないフォルダ（text と `--json`） | exit 2、stderr に 1 個 | 同じ | 同じ |
| d | finding のファイル名に U+202E（text と `--json`） | exit 1、stdout に 1 個 | 同じ | 同じ |
| f | U+202E の作業フォルダで通常の走査 | exit 0、stdout に 1 個 | 同じ | 同じ |
| e | 同じ条件の review-packet（対照） | 0 個 | 0 個 | 0 個 |

- レビュアーの経路（a の ConfigError）は v0.5.1 から。v0.5.0 までは、読めない既定の設定ファイルを「無い」としていた（M2-2-R1 の P2・O1）
- security-scan がパス・ファイル名・エラーを生のまま出す経路（b・c・d・f と、a の見出し）は v0.4.4 でもあった。security-scan の出力が masker だけを通すのは M1 からの実装
- 同じ種類の経路は security-scan の外にもあった（HEAD で実測。`check-other.log`）: verify（設定が無いときのエラー、project 名、check の出力の末尾）、
  init（root のパス。text と `--json`）、commander の使い方エラー（未知のオプション名・コマンド名）、`--max-*-bytes` の正でない整数のエラー

## 出力の出口の洗い出し（`src/` 全体、要約）

- 標準出力・標準エラーへの直接の書き出しは 19 か所（`console.*` 14、commander の既定の書き出し 2、JSON を書く `rawLog` 3）
- 外部由来の値が入り、禁止文字をそのまま出しうるもの: security-scan（text・`--json`）、verify（log・logError）、init（text・`--json`）、commander の使い方エラー、
  `positiveInt()`、`src/cli.ts` の予期しない例外。出ないもの: シグナルの通知（固定の文）、help と `--version`、review-packet（`safeText()`）
- ファイルへの出力（この版では直さない。バックログ）

| # | 出力 | 今の処理 | 生の禁止文字 |
|---|---|---|---|
| F1 | verify のレポート `latest.json`・`history/<ts>.json` | maskDeep → JSON.stringify（U+0020 未満は `\u00XX`） | 出うる: DEL、C1、U+2028 / U+2029、双方向制御、U+FEFF（コード読解） |
| F2 | verify のレポート `latest.md` | maskDeep 済みの値 | 出うる: 禁止文字すべて（CR・ESC を含む。コード読解） |
| F3 | init の `--write` が書く `aiqh.config.jsonc` | コメントは mask、project 名は JSON.stringify | 出うる（コード読解） |
| F4・F5 | init の `.gitignore` への追記、`package.json` の書き戻し | 固定の行 / 既存の中身 | 新しく入れることはない |

## 修正（5d646ad）

- **共通の出口 `src/output.ts`**
  - `escapeForDisplay(s, mode)` → `safeText(s, mode)` = masker(escape(s))。`safeJson(value, mode)` = 文字列を再帰的に escape → `maskDeep` → `JSON.stringify(…, null, 2)`
  - 禁止文字（raw-chars.ts の集合）は `\u{HEX}` の表記（`escapeRawChars()` の既存の表記。review-packet と同じ）
  - LF と TAB は禁止文字の集合に入っていない。既定（`"keep"`）では残す（複数行のメッセージ、check の出力の末尾、設定案、help の行と桁）。
    review-packet は「1 回の書き出し = 1 行」（M2-1-R1-002）なので `"escape"` で LF と TAB も表記にする（今までと同じ）
  - `createOutput({ log, logError }, mode)`: 各コマンドの書き出し口（テストの差し込み口、無ければ標準出力・標準エラー）を包み、`log` / `error` / `json` を返す
  - `writeError(line)`: `src/cli.ts`（シグナル、予期しない例外）と `positiveInt()` 用
  - `COMMANDER_OUTPUT`: commander の `writeOut` / `writeErr`。`buildProgram()` の最初（サブコマンドを足す前）に `configureOutput` で設定し、各コマンドが引き継ぐ
- verify・init・security-scan・review-packet・`src/cli.ts`・`src/cli-program.ts` の出力をすべて通した。review-packet の `safeText()`・`escapeDeep()` は削除した
- masker は冪等なので、verify の `printTail()` などが先に mask した文字列をもう一度通しても変わらない（複数行の秘密を 1 つのテキストとして先に mask する `printTail()` は残した）
- **構造テスト `tests/structure/output-guard.ts`**（型情報付き）: `src/` の中で、大域の `console`、`process.stdout` / `process.stderr`、`node:console` の import、
  fd 1・2 や `/dev/stdout` への fs の書き込みを参照してよいのは `src/output.ts` だけ。宣言（@types/node）に解決して判定するので、別名・分割代入・要素アクセス・
  `globalThis`・`node:process` からの import も見つかる

## 回帰テスト

- `tests/regression-m2-2-r2-001-output-boundary.test.ts`（21 件）
  - security-scan: a（text・`--json`）、b、c（text・`--json`）、d（text・`--json`。ファイル名が `k\u{202E}.ts` と表示される）、通常の走査の見出し
  - verify: 設定が無いときのエラー、project 名と check の出力の末尾。init: root（text・`--json`）
  - CLI の既定の出口: security-scan の標準エラー、commander の未知のオプション・コマンド、`--max-file-bytes` の正でない整数
  - 対照: 秘密の形を含むパスは従来どおり伏せられ、隣の U+202E は表記になる。verify の check の出力の秘密の形は伏せられる。禁止文字の無い文字列と JSON は v0.5.1 の処理
    （masker だけ、review-packet は `escapeRawChars()` → masker）と同じ結果。help と `--version` に表記が入らない
  - 構造テスト: fixture 18 形（`console.log` / `error` / `warn`、`process.stdout.write` / `process.stderr.write`、別名、分割代入、要素アクセス、`globalThis.console`、
    `bind`、`process` の別名・分割代入・要素アクセス、`node:process` と `node:console` の import、`writeSync(2, …)`、定数の fd、`createWriteStream("/dev/stdout")`）が
    すべて検出され、端末に書かないモジュールは検出されない。`src/` の違反は 0 件、ガードは `src/output.ts` の `console` と 2 つのストリームを見ている
- 修正前 FAIL: 16 / 21（`tmp/m2-2/r2-fix/before-R2-001.log`。v0.5.1 のコードに当てた）。修正前の構造テストは `src/` に 14 件の違反（§2.2 の `console` の 14 か所）を見つけた。
  修正前も PASS の 5 件は、対照 2 件（verify の mask、help に表記が無い）と、ガード自身の fixture の確認 3 件

## 出力の変化（v0.5.1 → v0.5.2）

- 禁止文字を含む出力は、その文字が `\u{HEX}` の表記になる: security-scan（text・`--json`・エラー）、verify（進捗の行、check の出力の末尾〈ESC による色付け・CR を含む〉、エラー）、
  init（text・`--json`・エラー）、commander の使い方エラー、`--max-*-bytes` のエラー、`src/cli.ts` の予期しない例外。review-packet は変わらない
- 禁止文字も秘密の形も無い出力は v0.5.1 とバイト単位で一致した（`tmp/m2-2/r2-fix/bytes/`。同じ fixture で 25 通り: help 6、`--version`、使い方エラー 4、security-scan 6、
  init 2、review-packet 3、verify 3。verify は所要時間・時刻・レポートのファイル名だけを置き換えて比べた）

## 既存テストの期待値

変わったものは 0 件（実装の前の予測どおり）。v0.5.1 の 94 ファイル 572 件は、期待値を変えずに PASS。

## バックログ

- ファイルへの出力の禁止文字（F1〜F3）: verify のレポート（`latest.json`・`history/<ts>.json`・`latest.md`）と、init が書く設定。ROADMAP のバックログで、
  「読めないものを『無い』とする残りの箇所」の後に置いた

## 教訓

- **出力の出口が各コマンドに分散していると、安全表示の有無がコマンドごとに違ってしまう**: review-packet だけが escape し、他は masker だけだった。
  出口を 1 つにし、構造テストでそれ以外の書き出しを禁止する
- **fail closed にする修正は、新しいエラーの出力経路を作る**: v0.5.1 で読めない設定ファイルをエラーにしたことで、パスを含むエラー文が新しく出るようになった。
  エラー文に入る値の表示の安全性も、修正と一緒に確かめる
