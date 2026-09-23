# M2-1 独立レビュー R2 への対応記録（response-r2）— v0.4.2

- 対象レビュー: `docs/reviews/m2-1/independent-review-r2.md`（受領ファイル名 `independent-review-m2-1-r2-for-claude.md`、2026-09-23 付、SHA-256 5c93441d…。
  R1 の 5 件は解消 3 / 部分的に解消 2〈R1-003、R1-004〉、新しい指摘は High 4 / Medium 4 / Low 0。対象 v0.4.1 = commit c8a185a / tag object 85555ef、
  パケット `review-packet-m2-1-r2.md`〈範囲 v0.4.0..v0.4.1〉）
- 対応日: 2026-09-23
- 人間の判断: 8 件すべてに対応して v0.4.2 を作る。各指摘の方針（ZIP のエントリ名の検査、同じ実体の判定、確定点と戻し処理の仕様、テストの外部コマンド、
  インラインコードの `\u{60}`、描画前の検査、finding をエラーより先に、README と版の整合テスト）と、全体の方針「同じ種類の漏れを構造で防ぐ」
  （検査済みの型と入口の一覧）は依頼書による
- 進め方: 8 件すべてを v0.4.1 の実コード（`node src/cli.ts review-packet`、`runReviewPacket`）で先に再現した（`tmp/m2-1/r2-fix/repro.ts`、ログ `repro-*.log`）。
  回帰テストを先に書いて v0.4.1 のコードで FAIL することを記録し（`before-*.log`）、1 指摘 1 commit で直した
- commit の順序の変更: 構造（検査済みの型と入口の一覧）の commit を最初ではなく R2-007 の後に置いた。型の意味（生文字と**秘密の形**の検査を通った）を満たすには、
  それまで生文字だけを検査していた値（`--exclude`、依頼文・レビューのファイル名、git のパス）に秘密の形の検査を足す必要があり、既存テストの期待値
  （秘密の形の glob が組み立て後の検査〈stage packet〉で見つかる）が変わる。挙動の変更は R2-006 / R2-007 の commit で行い、構造の commit は挙動を変えない
  refactor にした（v0.4.0..v0.4.1 のパケットと ZIP が前後でバイト単位で一致することを確認）。ただし型を入れた時点で見つかった漏れ 1 件はその commit で直した（下記）

## R1 の部分的に解消 2 件

- **M2-1-R1-003**（2 段階の書き込み）: レビュアーが挙げた残り 2 つの境界を R2-002（別の文字列が同じ実体を指す）と R2-003（戻し処理の失敗の握りつぶし、
  確定後の後片付けの失敗）として直した
- **M2-1-R1-004**（Markdown の描画）: バッククォートの置き換えが CommonMark で成立しない点を R2-005、描画前の検査の漏れ（`--range` / `--doc`）を R2-006 として直し、
  同じ種類の漏れを型で防ぐ構造（下記）を入れた。構造を入れた時点で、`latest.json` の値がそのまま埋め込まれる経路がもう 1 つ見つかった

## 判定と対応

| ID | 重大度 | 判定 | 再現（v0.4.1） | 原因 | 修正（commit） | 回帰テスト | 修正前 FAIL |
|---|---|---|---|---|---|---|---|
| M2-1-R2-001 | High | VALID | 再現した（レビュアーは `createStoredZip` 単体のみ）。`-o <秘密の形>.md --zip` で exit 0、ZIP の中に名前が 2 回（local header と central directory）。標準出力は masker で `[REDACTED:aws].md` と表示 | `-o` の basename は文字種の検査（`OUTPUT_NAME`）だけで scanner に通らず、そのまま ZIP のエントリ名になった。パケット本文ではないので組み立て後の検査にも入らない | `-o` のファイル名を git を動かす前に生文字と秘密の形で検査（出所 `output file name`、exit 1、値は出さない）。既定のファイル名も書き込み前に同じ検査。`--zip` なしでも検査する（a476f65） | `tests/regression-m2-1-r2-001-zip-entry-name.test.ts`（5 件） | 4 / 5（通常名の対照は修正前も PASS）。代表: `expected +0 to be 1` |
| M2-1-R2-002 | High | VALID | 再現した（レビュアーは `writeTogether` 相当の最小再現）。親のシンボリックリンク（`real/same.md` と `alias/same.md`）、大文字小文字だけ違う名前（`p.md` と `P.md`、macOS）のどちらも exit 0 で、既存の `OLD` が消え、残った 1 ファイルの中身は ZIP | 衝突の判定が文字列の `zipPath === output` だけ | 準備段階の前に、両方の書き込み先を realpath(親) + basename（親が無ければ最も近い既存の祖先）にし、NFC・小文字にして比べる。一致すれば exit 2（15d77bf） | `tests/regression-m2-1-r2-002-same-target.test.ts`（5 件） | 4 / 5（別の実体への対照は修正前も PASS）。代表: `expected +0 to be 2` |
| M2-1-R2-003 | High | VALID | 再現した。(a) `commit:install:zip` と `rollback:remove:packet` の同時失敗で「the previous files were restored」と出る一方、新しいパケットが残った。(b) 確定後の退避削除の失敗を実ファイルシステムで再現（パケットのディレクトリを読み取り専用にして EACCES）: 新しいパケットと ZIP は置かれているのに exit 2（`write failed: EACCES …`）。(b) はレビュアーはコード読解のみ | 戻し処理の削除の失敗を catch で捨てていた。退避の削除が確定処理の外にあり、その例外が外側で exit 2 になった | 確定点（両方を置き終えた時点）を定義。確定前は戻し処理の各操作の失敗を集め、全部成功したときだけ「restored」、そうでなければ残ったファイルをすべて表示して exit 2。確定後の退避削除の失敗は exit 0 で警告と場所、最終行 `REVIEW PACKET: written (backup files retained)`、`--json` の `backupsRetained`。差し込み口 `cleanup:backup:<label>` を追加（26b8793） | `tests/regression-m2-1-r2-003-rollback-reporting.test.ts`（5 件） | 4 / 5（全操作成功の「restored」は修正前も PASS）。代表: `expected '…write failed (inj…' not to match /the previous files were restored/` |
| M2-1-R2-004 | High | VALID | 再現した。PATH に node・git・python3・unzip だけを置いて `tests/zip-interop.test.ts` を実行すると `TypeError: Cannot read properties of undefined (reading 'split')` | 期待値の SHA-256 を、有無を確かめていない `shasum` で計算していた | 期待値は `node:crypto`。同じ種類の依存を洗い出して直した（下の表: `shasum` 2 か所、`rm` 2 か所、`wc` 1 か所）。静的テスト（テストに書かれた外部コマンド名は git か、skip 条件つきの unzip / python3 だけ）と、PATH を絞った動的テスト（dc75e5b） | `tests/regression-m2-1-r2-004-external-commands.test.ts`（2 件。動的な 1 件は python3 が無ければ skip） | 2 / 2（子の vitest で 3 ファイル 3 件が FAIL: TypeError、`spawnSync shasum ENOENT`、`spawnSync rm ENOENT`） |
| M2-1-R2-005 | Medium | VALID | 再現した。`inlineCode("a" + U+0060 + "b")` は `` `a\`b` `` で、2 個目のバッククォートでコードスパンが閉じ `` b` `` が外に残る。commit の件名にバッククォートを入れると Commits 表の行が崩れる | バッククォートを「バックスラッシュ + バッククォート」にしていた（コードスパンの中ではバックスラッシュはエスケープにならない） | バッククォートを ASCII 表記 `\u{60}` に置き換え、インラインコードの中に U+0060 を残さない（c1e5364） | `tests/regression-m2-1-r2-005-inline-backtick.test.ts`（1 件。パス・glob・ファイル名 2 つ・verify の値・commit の件名。新規依存なしで、fence の外のバッククォートの並びが 1 個ずつで対になり、各値が 1 つのコードスパンになることを検査） | 1 / 1（問題 9 件） |
| M2-1-R2-006 | Medium | VALID | 再現した（レビュアーは git 側のみ実行）。U+202E を含む有効なタグを `--range` に使うと exit 0（Range as given に `\u{202E}`）、変更一覧に無い `--doc` のパスに U+202E / U+2028 で exit 0。**違う点**: U+2028 を含む ref は `--range must have the form <from>..<to>`（exit 2）になり、パケットは作られなかったが finding（exit 1）でもなかった（JS の正規表現の `.` が U+2028 に一致しない） | 描画前の検査が `--exclude` と依頼文・レビューのファイル名だけで、`--range` と `--doc` に無かった | 描画されるオプションの値（`--range`、`--label`、`--exclude`、`--doc`、依頼文・レビューのファイル名、`-o` のファイル名）を 1 か所で、git を動かす前に生文字と秘密の形で検査（出所 `range`・`doc path N` など）。`buildPacket` 内の部分的な検査はここへ移した（1a7ca19）。後で入口の一覧に置き換えた | `tests/regression-m2-1-r2-006-range-doc-check.test.ts`（6 件） | 5 / 6（通常の ref と文書の対照は修正前も PASS）。代表: `expected 2 to be 1`（U+2028）、`expected +0 to be 1`（U+202E） |
| M2-1-R2-007 | Medium | VALID | 再現した（レビュアーは未実行）。0xFF を含むパス + 201 バイト（`--max-file-bytes 100`）で exit 2、U+2028 を含むパス + 上限超過でも exit 2（上限なしなら exit 1） | パスの finding を集めながら大きさの判定を同じループで行い、ループ後に上限超過を先に throw していた | 変更一覧と各 commit のファイル一覧のすべてのパスの検査（不正な UTF-8・生文字・秘密の形）を最初の独立した段階にし、1 件でもあれば中身・大きさに進まず exit 1。同じ種類の箇所を洗い出し「検出が先」に統一（下の表）（29d66d0） | `tests/regression-m2-1-r2-007-findings-before-errors.test.ts`（11 件） | 10 / 11（上限超過のみ・存在しない ref のみの対照は修正前も PASS）。代表: `expected 2 to be 1` |
| M2-1-R2-008 | Medium | VALID | 再現した（静的照合）。README の「現在の状態」と機能表が v0.4.0 / R1 待ち、`package.json` は 0.4.1 | release commit で README を直す手順が無かった | README を各 commit の時点の状態に直し（R2-008 の commit では v0.4.1、release commit で v0.4.2）、`package.json` の version・CHANGELOG の最新の見出し・README の「現在の状態」の 1 行目と review-packet の行の版が一致するテストを追加。ROADMAP のバックログにシンボリックリンク（mode 120000）を kind `symlink` として表示する件を追加（5f247f8） | `tests/regression-m2-1-r2-008-version-consistency.test.ts`（1 件） | 1 / 1 |

## 構造: 検査済みの型と入口の一覧（7e0b285）

- **型**: `src/review/checked.ts` の `Checked = string & { readonly [checkedBrand]: true }`。作れるのは `checkValue(value, security)`（生文字 → 秘密の形。
  finding は行とコードポイントまたは分類だけ）で、`as Checked` はこのファイルの外に書かない（テストで確認）。検査に落ちた値の代わりに使う `REJECTED` は
  描画されない（finding があれば描画の前に止まる）
- **描画関数の引数**: `inlineCode(s: Checked)`、`cellCode(s: Checked)`、`renderPath = inlineCode`、平文用の `plainOrCode(s: Checked)`（`[A-Za-z0-9 ._:+()/-]`
  だけならそのまま、それ以外はインラインコード）。戻り値は `Md`。ZIP のエントリ名 `ZipEntry.name` も `Checked`
- **本文のテンプレート**: 本文は `md` タグ付きテンプレートで組み立て、埋め込めるのは `Md` と数値だけ。描画関数の引数を型にするだけでは、テンプレート文字列に
  直接埋め込む経路が残るため、ここも型で閉じた
- **型エラーで見つかった箇所**（型を入れたときに通らなかったもの）:
  1. `src/commands/review-packet.ts` から `PacketOptions` に渡す 6 つの値（range・label・依頼文とレビューのファイル名・`--doc`・`--exclude`）。R2-006 で検査済みだったが、
     型では示されていなかった → 入口の一覧から得た `Checked` を渡す形にした
  2. **`latest.json` が別の commit のものであるときの `git.commit` と `git.dirty`**（漏れ。直した）: 検査もエスケープもなくテンプレートに埋め込まれていた。
     `dirty` に「LF + `# 見出し`」を入れるとトップレベルの見出しが 10 → 11 になり exit 0、`commit` のバッククォートでコードスパンが崩れた（R1-004 と同じ種類）。
     検査と描画関数を通すようにした（回帰テストは構造のテストファイル内。修正前 FAIL 1 / 1、`expected [ '# Review Packet — dirty', …(10) ] to have a length of 10 but got 11`）。
     あわせて `git.commit` が文字列でないとき（例: 数値）の経路も `String()` を通して直した（v0.4.1 は `aiqh: unexpected error: commit.slice is not a function` で exit 2、v0.4.2 は exit 0）
  3. aiqh が導く値（from / to の SHA、タグオブジェクト、committer 時刻、aiqh と git の版、blob の SHA-256、status、既定のラベル）: そのまま埋め込んでいた →
     `Checked` にしてから描画（値は通常 16 進・ASCII で、出力は変わらない）
  4. `security.allow` で抑止した一覧（出所・パス・分類）、commit の件名（検査済みのメッセージの 1 行目。メッセージに finding が無いときだけ単独で検査し、重複させない）、
     verify の値（従来どおり 1 つのテキストとして検査した後、描画する値ごとに `Checked` にする）
- **入口の一覧**: `OPTION_INVENTORY`（`src/commands/review-packet.ts`）に 14 のオプションと扱いを書いた。描画する値（range・label・exclude・doc・request・review・output）は
  一覧の `rendered` から検査し、その結果の `Checked` だけが `buildPacket` に渡る。パス（zipOutput・cwd）、設定（config）、数値（maxFileBytes・maxPacketBytes）、
  フラグ（zip・json）。テストは `node src/cli.ts review-packet --help` からオプション名を読み、一覧のキーと集合が一致することを確かめる
- **テストの変更（型のみ）**: `renderPath` と `createStoredZip` に素の文字列を渡していたテスト（`tests/review-packet.test.ts`、`tests/zip.test.ts`、`tests/zip-interop.test.ts`）は、
  `tests/helpers.ts` の `checked()` を通した値を渡す（期待値は変えていない）

## finding とエラーが同時に起きうる箇所（R2-007 の洗い出し）

| 箇所 | exit 2 の原因 | v0.4.1 | v0.4.2 |
|---|---|---|---|
| パスの finding と変更ファイルの上限超過（同じファイル・別ファイル） | 上限超過 | 2 | 1（パスの段階で返す） |
| commit のファイル一覧にだけ現れるパスの finding と上限超過 | 上限超過 | 2 | 1（パスの段階に含めた） |
| 中身の finding と別の変更ファイルの上限超過 | 上限超過 | 2 | 1（上限超過は finding が無いときだけ） |
| 中身の finding と `--doc` がファイルでない / 上限超過 | `--doc` | 2 | 1（同上） |
| 中身の finding と `latest.json` が JSON でない | JSON | 2 | 1（同上） |
| オプションの値の finding と `--cwd` のパスの禁止文字 | `--cwd` | 2 | 1（オプションの検査を先に） |
| 依頼文・レビューのファイル名の finding と、そのファイルが読めない | 読めない | 2 | 1（名前の検査は読む前） |
| `--label` / `--range` の値の finding と形式の誤り | 形式 | 2 | 1（値の検査を先に） |
| `-o` のファイル名の finding と中身の上限超過など | 上限超過など | 2 | 1（git を動かす前に検査） |
| finding と書き込み先のパスの禁止文字・同じ実体・書き込みの失敗 | パス・書込 | 1 | 1（従来どおり finding が先） |
| 組み立て後の finding と `--max-packet-bytes` 超過 | 上限超過 | 1 | 1（従来どおり） |
| コマンドラインの解析の失敗（未知のオプション、整数でない `--max-*-bytes`） | 解析 | 2 | 2（検査を始められない） |
| 検査に使う `security` 設定が読めない・不正 | 設定 | 2 | 2（検査の条件が決まらない） |
| 読めない依頼文・レビュー（名前に finding が無い場合）と、まだ行っていない中身の検査 | 読めない | 2 | 2（中身の検査の前に止まる） |
| git の失敗（作業ツリー外、ref が無い、祖先でない、blob・差分の取得、差分が空） | git | 2 | 2（検査そのものができない） |

## テストの外部コマンド（R2-004 の洗い出し）

`tests/` の `spawnSync` / `execFileSync` / `execSync` / `spawn` / `execFile` の第 1 引数（v0.4.1 時点）と、runner 経由でシェルに渡すコマンド:

| コマンド | ファイル:行（v0.4.1） | 事前の有無確認 | 無いときの挙動（v0.4.1） | 対応 |
|---|---|---|---|---|
| `git` | 多数（70 か所） | なし | 失敗 | 前提（git と node は宣言済みの前提） |
| `node`（`process.execPath`） | 6 か所 | 不要（実行中の node） | — | そのまま |
| `unzip` | `tests/zip-interop.test.ts:18, 37, 41` | あり（`unzip -v`、`it.skipIf`） | skip | そのまま |
| `python3` | `tests/zip-interop.test.ts:19, 54` | あり（`import zipfile`、`it.skipIf`） | skip | そのまま |
| `shasum` | `tests/zip-interop.test.ts:58` | なし | TypeError（`stdout` が undefined） | `node:crypto` |
| `shasum` | `tests/regression-m2-1-sp3.test.ts:96` | なし | `spawnSync shasum ENOENT` | `node:crypto` |
| `rm` | `tests/review-packet.test.ts:447, 458`（後片付け） | なし | `spawnSync rm ENOENT`（afterEach で失敗） | `rmSync` |
| `wc`（runner 経由の `sh -c`） | `tests/execute.test.ts:42` | なし | パイプの左がそのまま終わり、`&&` の右は実行されない | node の 1 行スクリプト |
| `sh`、`true`、`echo` | runner 経由（製品の実行経路） | — | — | 製品の前提（ADR-0005: `shell: true`） |

`scripts/package-smoke.ts` の `npm` / `npx` は `tests/` の外（配布の smoke test で npm が前提）のため対象外とした。

## 既存テストの期待値の変更

- `tests/review-packet.test.ts`「text that appears only in the packet's metadata…」: 秘密の形の `--exclude` の glob は、組み立て後（`packet template`、stage packet）ではなく
  入力段階の finding（`--exclude pattern 1:1 aws (input)`）になった（R2-006）
- `tests/regression-m2-1-r1-002-output-paths.test.ts`「user strings inside error messages」: `--doc` / `--request` の禁止文字は git の前の finding（exit 1）になったため、
  エラーメッセージの安全表示は LF で確かめる形にした（禁止文字の `--doc` が exit 1 になることも追加で確認）（R2-006）
- `tests/regression-m2-1-r1-004-markdown-structure.test.ts`: 表示の期待値を `` \` `` から `\u{60}` に（R2-005）
- `tests/execute.test.ts`: パイプのテストの `wc -l` を node に（R2-004）。`tests/zip-interop.test.ts`・`tests/regression-m2-1-sp3.test.ts` の期待値の計算を `node:crypto` に、
  `tests/review-packet.test.ts` の後片付けを `rmSync` に（R2-004）
- 型のみの変更（期待値は同じ）: 上記「テストの変更（型のみ）」

## R2-003 の出力例（安全表示済み。一時ディレクトリは `<tmp>`）

- 確定前、戻し処理の一部が失敗（注入）: `aiqh review-packet: write failed (injected at commit:install:zip) and could not be fully rolled back: new file left at <tmp>/out/packet.md`
  → `REVIEW PACKET: not written (error)`、exit 2
- 確定後、退避ファイルを削除できない（実ファイルシステム、EACCES）: 標準エラー `aiqh review-packet: warning: the packet and the ZIP were written, but 1 backup file(s) of the previous version could not be removed:`
  / `  backup file retained at <tmp>/a/.packet.md.bak-<pid>-<乱数>`、標準出力の最終行 `REVIEW PACKET: written (backup files retained)`、exit 0

## 迷った点と判断

- **`-o` のファイル名の検査は `--zip` が無くても行う**: パケットのファイル名は ZIP のエントリ名にもなる値で、`--zip` の有無で扱いを変えない方が単純で安全側。
  生文字を含むファイル名は、v0.4.1 では解決したパスの検査で exit 2 だったが、v0.4.2 では「中に入る値」として exit 1（`output file name`）になる
- **同じ実体の判定に NFC の正規化も加えた**: 依頼書の指定は realpath と大文字小文字の無視。APFS は正規化の違いも同じ名前として扱うため、安全側として NFC にそろえてから比べた
- **「解決した ref 名」**: `--range` の両端の文字列は検査した `--range` の部分文字列なので、別に検査していない。git が解決した値（SHA・タグオブジェクト）は描画前に `Checked` にしている
- **組み立て後の検査（stage 2）**: v0.4.2 ではテンプレートに入る値がすべて描画前に検査されるため、stage 2 でだけ見つかる入力の例は無くなった。stage 2 は保険として残している

## 回帰テストの実行記録（数え方を併記）

- 修正前: `tmp/m2-1/r2-fix/before-001.log`〜`before-008.log`、`before-structure.log`（`checked.ts` が無いためファイル単位で FAIL）、
  `before-structure-verification.log`（型で見つかった漏れの 1 件だけを切り出して実行）
- 修正後: 新しい回帰テスト 9 ファイル 40 件がすべて PASS（数え方: 行頭の `it(` 37 + ループで 2 回ずつ実行される `it(` 2 か所の増分 2 + `it.skipIf(` 1。
  R2-001〜R2-008 が 5・5・5・2・1・6・11・1 件、構造のテストが 4 件）

## 教訓

- **検査を「呼び出し側が忘れない」という約束にしない**: 描画関数と ZIP の書き込みが受け取る型を「検査済み」にし、テンプレートにも描画関数を通したものしか入らないようにすると、
  漏れは型エラーとして見つかる。列挙した経路だけを直すと、別の経路（今回は `latest.json` の値）が残る
- **戻し処理の報告は、各操作の結果から作る**: 失敗を捨ててから「戻した」と書かない。確定点を決め、その前後で終了コードと実際のファイルの状態を一致させる
- **テストの期待値は Node の標準 API で計算する**: 外部コマンドを使うなら、その有無を skip 条件に含める
