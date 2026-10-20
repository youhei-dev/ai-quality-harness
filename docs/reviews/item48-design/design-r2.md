# 項目 48 の設計 R2 — security の check で、生の双方向の制御文字と行区切りを見つける

- 作成: 2026-10-19（設計 R1）。同じ日に R2（独立レビュー item48-design R1 の 5 件を反映。実装はまだ）
- 記録: v0.13.0 で `docs/reviews/item48-design/design-r2.md` として記録した。記録のときに、設計 R2 の独立レビュー（R2）の I48-D-R2-001（Low）を反映した（下の「R2 の後の変更」）。レビュアーに渡した設計 R2 の SHA-256 は `085ca297c5e6a8e499707e5e0b7a1ef14fcebf08224d43df9781c2e727683137`。R2 の結果は High 0 / Medium 0 / Low 1 で、設計のレビューは R2 で閉じた（R3 は依頼しない。人間の決定）
- 基準の commit: `8870afbf1bf65282f12bba39086d661c88d70851`（v0.12.1 の後の main）。この文書のファイルと行は、すべてこの commit の時点
- 対の文書: ADR-0036 の案 R2（`adr-0036-draft-r2.md`）、R1 への応答（`response-item48-design-r1.md`）
- 表記: 文字は `U+XXXX` の符号位置だけで書く。この文書は生の文字を含まない

## R2 の後の変更（記録のとき。I48-D-R2-001）

| 指摘 | 重さ | 変えた節 | 要約 |
|---|---|---|---|
| I48-D-R2-001 | Low | §6-4（「手元」と「版を上げるときの案内」）、§9 の CHANGELOG の下書き | 古い `dist/` を `aiqh --version` で見分ける、という説明をやめた。`--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる、とした |

## R1 からの変更

| 指摘 | 重さ | 変えた節 | 要約 |
|---|---|---|---|
| I48-D-R1-001 | Medium | §6-4、§9（ADR-0028 の注記・README の行・CHANGELOG の下書き） | 「パースの失敗は判定を変えない（ADR-0028 の P1）」と「検出の範囲は、実際に起動する `aiqh security-scan` の版で決まる。新しい verify と古い security-scan の組み合わせでは、項目 48 の検出は効かない」を分けて書いた。版を上げるときの案内（verify が実際に呼ぶ `aiqh` の版・commit をそろえる）を足した。H8 と P1 は変えない |
| I48-D-R1-002 | Medium | §5-2、§5-4、§8-1（T8a〜T8f） | 候補の規則を順に見て、raw-char には分類を明示した規則だけを候補にする（最初に当たった規則を採ってから捨てるのではない）と明記した。規則の組み合わせ・secret との混在・`findAllowRule` の直接のテストを足した |
| I48-D-R1-003 | Medium | §3-4、§8-1（T7a〜T7g） | パス名の確かめを置く場所（2 つの一覧のループで、パスごとに最初）と、2 つの一覧に出るものの実測を書いた。中身を読まないもの（バイナリ・未追跡の `.env*`・symlink・submodule・作業ツリーから消えた追跡パス）と、未追跡で ignore されない通常のファイルの名前のテスト、未追跡で ignore されたパスは対象外のテストを足した。作り方も書いた。中身の走査の範囲は広げない |
| I48-D-R1-004 | Low | §8-1（T5 と、表の前の決まり） | T5 の ignore のケースが「未追跡のファイル」であることを明示し、見込みを「(1) FAIL / (2) PASS / (3) PASS」に直した。1 つの `it` に 1 つのケースとし、見込みを `it` ごとに判定できる形にした |
| I48-D-R1-005 | Low | §11 | 「閉じた（害の無い）並び」を、「閉じた並びや正当な使い方も finding にする。始まりと終わりの対応だけでは安全とは判断しない。正当な使い方は allow で扱う」に直した（UTS #55 §4.1.1・§5.1.6） |
| （人間の決定） | — | §12、§2-2・§4・§5-2・§8-1・§9 の「案」の書き方、§10 | U1〜U12 は、2026-10-19 に人間が推奨どおりで決めた。§12 を「決定」の表に書き換えた。設計レビューの取り込みを v0.13.0 の PR 1 の文書の commit で行うことを §10 に書いた |
| （自分で足した） | — | §8-1 の表の前、§13 | 変更の前の commit で、新しいテストのファイルが読み込めるか（存在しない名前の import でファイル全体が落ちないか）を実測した結果を書いた |
| （自分で足した） | — | §8-2・§8-3 | 基準の commit で `git grep` をして、影響の一覧の漏れを確かめた。fixture の行の動き（U4 の情報の行）を確定し、§8-3 に 5 つのテストを足した（どれも期待値は変わらない見込み） |

## 0. 前提: 人間が決めたこと（2026-10-19）

| # | 決定 |
|---|---|
| H1 | 見つける文字は 11 の符号位置: U+202A–U+202E、U+2066–U+2069（双方向の制御文字）、U+2028、U+2029（行区切り・段落区切り）。`FORBIDDEN_RANGES` は変えず、その部分集合の定数を `src/security/raw-chars.ts` に足す |
| H2 | 方向の印 U+200E・U+200F・U+061C は入れない |
| H2b | 出現ごとに finding にする（閉じているかどうかは見ない）。UTS #55 の「禁止しない」立場との違いと理由を ADR に書く |
| H3 | そのほかの見えない文字（ゼロ幅・方向の印など）は今回入れない。ROADMAP に新しい項目（49）として残す |
| H4 | 既定で FAIL（finding → `aiqh security-scan` の exit 1 → check の FAIL）。入り切りのスイッチは作らない |
| H5 | 既存の `security.allow` に分類 `bidi-control`・`line-separator` を足す。生の文字の finding は、その分類を明示した規則だけが抑える（分類の無い規則では抑えない）。`expires` は任意のまま。`reason` の書式は決めない |
| H6 | パス名の中の 11 文字も finding にする（行番号なし） |
| H7 | 不正な UTF-8・UTF-16 のファイルは finding にしない。既知の限界として書く |
| H8 | 件数の行の内訳の最後に `raw characters: N` を足す。数のキー `rawChars`・項目の印 `[raw-char] `・`describe.ts` の表示を足す。パーサは新しい形（6 つの内訳）だけを受け付ける |
| H9 | 版は v0.13.0 |
| H10 | 独立レビューは 2 回（この設計レビューと、v0.13.0 の実装レビュー） |
| H11 | 適用先の呼び出しの SHA を上げるのは、実装レビューを閉じた後（この設計の範囲の外） |

必ず守る注意: 生の文字の確かめを `scanString` の経路（`FileScanSink`）に入れない。ファイルの走査の側だけに足す。review-packet の動きは変えない（理由は §7）。

## 1. 背景

- ROADMAP の項目 48（Medium）: verify の security の check（`src/security/scan.ts`）は、秘密の形の走査で、生の文字を確かめていない。`raw-chars.ts` を import していない（`scan.ts:15-21`）
- 起きたこと
  - v0.3.2 から、テストのソースの文字列の中に、生の U+2028・U+2029 が入っていた
  - v0.11.0 で、テストのソースの文字列の中に、生の U+202E が入った
  - どちらも、エスケープを書くつもりの入力が生の文字になったもの。自己 verify の 8 つのチェックは通り、`aiqh review-packet` の生の文字の確かめが見つけた。v0.11.1 で直し、本体には再発を防ぐテスト（`tests/no-raw-bidi-in-tracked-files.test.ts`）を足した
  - 適用先のリポジトリに同じ文字が入っても、verify は見逃す
- 実測（2026-10-19。各リポジトリの追跡しているファイル。件数だけ）

| リポジトリ | (a) 双方向の制御文字 | (b) 行区切り・段落区切り | (c) そのほかの見えない文字（今回は対象外） |
|---|---|---|---|
| ai-quality-harness | 0 | 0 | 0 |
| trim-manager | 0 | 0 | 0 |
| ai-tutor-browser | 0 | 0 | 10 |

  - この設計（(a)+(b)）なら、3 つとも判定は変わらない見込み
- 今の走査に (a)・(b)・(c) の 17 の符号位置を 1 つずつ入れた文字列を通すと、finding は 0 件（`scanString`、`scan.ts:288-296` で確かめた）

## 2. 文字の集合と定数

### 2-1. 集合

| 分類（`category`） | 符号位置 | 数 |
|---|---|---|
| `bidi-control` | U+202A–U+202E（LRE・RLE・PDF・LRO・RLO）、U+2066–U+2069（LRI・RLI・FSI・PDI） | 9 |
| `line-separator` | U+2028（LINE SEPARATOR）、U+2029（PARAGRAPH SEPARATOR） | 2 |

- どれも `FORBIDDEN_RANGES`（`raw-chars.ts:18-26`、75 の符号位置）の中にある
- `FORBIDDEN_RANGES` は変えない。review-packet・docs のテスト・出力の表記（ADR-0014 決定 6、ADR-0020 決定 3）が使っているため
- 11 個は、どれも BMP の 1 つの UTF-16 の単位で表せる（サロゲートの組にならない）

### 2-2. 定数の名前と置き場所（§12 の U1）

`src/security/raw-chars.ts` に足す。

- 案 A（決定。U1）: 範囲と分類の組
  - `RAW_CHAR_CATEGORIES`: `["bidi-control", "line-separator"] as const`、型 `RawCharCategory`
  - `SCANNED_RAW_RANGES`: `ReadonlyArray<readonly [number, number, RawCharCategory]>` = `[0x202a, 0x202e, "bidi-control"]`・`[0x2066, 0x2069, "bidi-control"]`・`[0x2028, 0x2029, "line-separator"]`
  - `scannedRawCategory(cp: number): RawCharCategory | null`
  - `FORBIDDEN_RANGES` の書き方（範囲の組）と、`patterns.ts` の `SCANNED_CATEGORIES` の名前に合わせる
- 案 B: 11 の符号位置を 1 つずつ並べた表（`ReadonlyMap<number, RawCharCategory>`）。読みやすいが、`FORBIDDEN_RANGES` と書き方が揃わない

### 2-3. 部分集合であることのテスト

- `SCANNED_RAW_RANGES` のすべての符号位置について `isForbiddenCodePoint(cp)` が true
- 符号位置の数がちょうど 11、分類ごとに 9 と 2
- U+200E・U+200F・U+061C・U+200B・U+200C・U+200D・U+2060・U+FEFF・TAB・CR・LF は `scannedRawCategory` が null（H2・H3 と、ふつうのソースの文字の守り）
- `RAW_CHAR_CATEGORIES` と `SECRET_CATEGORIES`（`patterns.ts:349`）に共通の名前が無い（allow の分類の名前がぶつからないこと）

## 3. 走査の範囲

### 3-1. ファイルの集合（今の security の check と同じ）

- 追跡しているファイル（`git ls-files -z`、`scan.ts:121`）と、未追跡で ignore されないファイル（`--others --exclude-standard`、`scan.ts:122`）
- 未追跡の `.env*` は読まない（`scan.ts:145-153`。中身の確かめもしない）
- symlink・submodule は読まない（`scan.ts:386`）。ENOENT はスキップ、ほかの読めない場合は exit 2（今と同じ）
- バイナリ: 先頭 8 KiB に NUL があれば読まない（`scan.ts:517-520`）。生の文字も見ない

### 3-2. どこに足すか

- `scanFile`（`scan.ts:376-396`）の、`readLines` に渡す行の受け手（`scan.ts:388`）で、秘密の形の `FileScanSink.onLine` と並べて、生の文字の受け手（新しい小さなクラス。案: `RawCharSink`）を呼ぶ
- `RawCharSink` は `FileScanSink`（`scan.ts:325-374`）の外に置く。`scanString`（`scan.ts:288-296`）は `FileScanSink` だけを使うので、変わらない
- バイナリと判定されたファイル（`readLines` が true を返す）は、`readLines` が行を 1 つも渡さないので、生の文字の finding も出ない（今の `scan.ts:517-520` の順のまま）。念のため、`scanFile` は binary のときに `RawCharSink` の結果を足さない（`scan.ts:389-392` と同じ扱い）
- 行の分け方は今の `LineAssembler` のまま: LF で分け、行末の CR を落とす（`scan.ts:455`・`485`）。U+2028・U+2029 では行を分けない（行番号は LF で数える。`raw-chars.ts` の `findRawChars` と同じ）

### 3-3. 長い行の窓

- 1 行が `maxLineBytes` を超えると、`LineAssembler` は同じ行番号で窓を何度も渡す。窓は重なる（`scan.ts:462-480`）ので、同じ文字が 2 回見えることがある
- 重複は（ファイル・行・符号位置）のキーで除く。同じ行に同じ符号位置が何回あっても、finding は 1 件（H の決定のとおり。回数は数えない。§12 の U7）
- 窓の切れ目でも、1 つの符号位置は 1 つの UTF-16 の単位なので、切れて見えなくなることは無い（`StringDecoder` は、バイトの途中で切れた文字を次の書き込みに持ち越す）

### 3-4. パス名（H6）

- 確かめるのは、リポジトリからの相対のパス（`git ls-files` の出力）だけ。作業ディレクトリ（ルート）のパスは見ない（リポジトリの中身ではないため。既存のテストに、ルートのパスに U+202E があるものがある）
- 対象は、2 つの一覧に出たすべてのパス（読まない symlink・submodule・未追跡の `.env*`・作業ツリーに無いものも含む。名前は、読むかどうかに関係なくツリーに見えるため。§12 の U5）
- 1 つのパスで、符号位置ごとに 1 件。`line` は無い
- **置く場所（R2 で明記。I48-D-R1-003）**: `scanRepository`（`scan.ts:119-159`）の 2 つのループ（追跡 `:141-144`、未追跡 `:145-155`）で、パスごとに**最初に**確かめる。次のどれよりも前に置く
  - `classifyEnvFile`（`:142`）と、未追跡の `.env*` の `continue`（`:149-152`。`ENV_FILE` は `scan.ts:87` の `/^\.env(\..+)?$/` で、名前の最後の要素に当てる）
  - `scanFile` の `lstat`（`:381`。ENOENT のスキップ `:383`、symlink・submodule の `return` `:386`）
  - バイナリの判定（`readLines` の中、`:517-520`）
  - こうすると、パス名の確かめは、中身を読むかどうか（読まない・読めない・バイナリ）の分かれ道の影響を受けない。中身の走査の範囲は変えない
- 2 つの一覧に出るもの（2026-10-19 に、git 2.50.1 の使い捨てのリポジトリで、ASCII の名前で確かめた。名前に 11 文字を入れた確かめは実装の段）

| もの | 一覧 | 8870afb の `scanRepository` の扱い |
|---|---|---|
| 追跡しているバイナリ | 追跡（100644） | 読んでバイナリと判定し、`skippedBinary` に数える |
| 追跡している symlink | 追跡（120000） | `lstat` が file でないので `return`（読まない） |
| submodule（gitlink） | 追跡（160000） | 同上（ディレクトリ。ディレクトリが無ければ ENOENT でスキップ） |
| 作業ツリーから消えた追跡パス | 追跡（index にある） | `lstat` の ENOENT でスキップ |
| 未追跡で ignore されない通常のファイル | 未追跡 | 読む |
| 未追跡で ignore されない `.env*` | 未追跡 | 読まない。`untracked-env` の finding |
| 未追跡で ignore されない symlink | 未追跡 | `lstat` が file でないので `return` |
| 未追跡で ignore されたファイル | どちらにも出ない | 見ない（名前も見ない） |

- 同じリポジトリで 8870afb の `scanRepository` を動かすと、エラー（exit 2 にあたる例外）は無く、`filesScanned` 2・`skippedBinary` 1、finding は `untracked-env` と `.gitignore` の衛生のものだけだった（中身を読まないものは、今も静かに飛ばされている）
- `git ls-files` の出力は `encoding: "utf8"` で読む（`scan.ts:164`）。不正な UTF-8 のパスは U+FFFD になり、finding にしない（H7 と同じ扱い。既知の限界）

### 3-5. 不正な UTF-8・UTF-16・先頭の BOM（H7）

- 不正な UTF-8: finding にしない。`StringDecoder("utf8")`（`scan.ts:504`）は不正なバイトだけを U+FFFD にし、その前後の正しく符号化された文字はそのまま読む（実測で確かめた: 不正なバイトの後ろの U+202E が読めた）。正しく符号化された 11 文字は見逃さない
- UTF-16・UTF-32: ASCII の文字が NUL を含むので、バイナリとして読まない。中の生の文字は見えない（既知の限界）
- 先頭の BOM（U+FEFF）: 11 文字に入らないので、何もしない

## 4. finding の形

### 4-1. 型（`scan.ts:27-40`）

- `FindingKind` に `"raw-char"` を足す
- `ScanFinding` に任意の欄 `codePoint?: string` を足す（形は `formatCodePoint` の `U+202E`。`raw-chars.ts:79-81`。§12 の U2）
- 生の文字の finding の欄

| 欄 | 中身 |
|---|---|
| `kind` | `"raw-char"` |
| `category` | `"bidi-control"` か `"line-separator"` |
| `file` | リポジトリからの相対のパス |
| `line`・`endLine` | 1 から数えた行（LF で数える）。パス名の finding では、どちらも無い |
| `codePoint` | `"U+202E"` の形 |
| `message` | `raw bidi-control character U+202E`、パス名なら `raw bidi-control character U+202E in the path`（§12 の U9 で決定） |

- 行の中身・桁は持たない（今の finding と同じく、値を持たない。`scan.ts:12`）

### 4-2. 端末の出力（`src/commands/security-scan.ts:67-101`）

- 件数の行（`security-scan.ts:80`）の最後に足す（H8）:
  `findings: N (secret-shaped: …, oversized candidates: …, tracked .env: …, untracked .env not ignored: …, .gitignore: …, raw characters: …)`
- 項目の行は、`[gitignore]` の行（`security-scan.ts:85`）の後ろに足す:
  - 中身: `  [raw-char] <path>:<line> U+202E bidi-control`
  - パス名: `  [raw-char] <path> U+202E bidi-control (in the path)`（§12 の U3）
- 順: 一覧の順（追跡、次に未追跡）。同じファイルでは、パス名の finding を先に、中身は行の小さい順、同じ行では最初に出た順
- 情報の行（§12 の U4 で決定。行の文は実装で確かめる）: `scanned categories:` の行（`security-scan.ts:70`）の後ろに、`raw characters checked: bidi-control (U+202A-U+202E, U+2066-U+2069), line-separator (U+2028, U+2029)` を 1 行。パーサは知らない行を読み飛ばすので、読みに影響しない（`src/parse/security-scan.ts:96-99`）

### 4-3. `--json`（`security-scan.ts:55-57`）

- `findings` に、上の欄の項目が入る。`codePoint` は生の文字の finding だけにある
- §12 の U4 で決定: `ScanResult`（`scan.ts:47-68`）に `scannedRawChars: Array<{ category: string; codePoints: string[] }>` を足す（`scannedCategories` と並ぶ）
- JSON のキーはすべて識別子の形（ADR-0017。既存のテスト `tests/regression-m2-2-r3-002-json-keys.test.ts` の守り）

### 4-4. マスクと出口の表記（ADR-0016）

- 行の中身を出さないので、マスクの対象は増えない
- パスは、今と同じく端末の出口（`src/output.ts`）で禁止文字を表記にしてからマスクする。パス名に生の文字があっても、端末と `--json` には生の文字が出ない（既存のテスト `tests/regression-m2-2-r2-001-output-boundary.test.ts:122-137` の守り）

## 5. allow

### 5-1. スキーマ

- `security.allow[].category` の列挙（`src/config/schema.ts:48`）に、`bidi-control`・`line-separator` を足す（`[...SECRET_CATEGORIES, ...RAW_CHAR_CATEGORIES]`）
- 生成する JSON Schema（`schema/aiqh.config.schema.json:130-147` の `enum`）に 2 つの値が足される。`npm run schema:gen` で作り直し、`tests/schema.test.ts:15`（ファイルが生成物と同じ）で確かめる
- `AllowRule`（`src/types.ts:46-58`）の型は `category?: string` のままで変わらない

### 5-2. 「分類の無い規則は生の文字に効かない」をどこで保証するか

- **`findAllowRule`（`scan.ts:644-647`）の中で保証する**（§12 の U10 で決定）
  - `kind` が `"raw-char"` の finding には、`category` が書かれていて、finding の分類と同じ規則だけを候補にする
  - **候補の規則を順に見て、raw-char には分類を明示した規則だけを候補にする**（R2 で明記。I48-D-R1-002）。今の `findAllowRule` は `rules.findIndex(…)`（`scan.ts:646`）で最初に当たった規則を返すので、分類の確かめは `findIndex` の条件の中に入れる。最初に当たった規則を採ってから分類を確かめて捨てるのではない（捨てる作りだと、先頭に分類の無い規則があるとき、後ろにある正しい規則まで探さずに FAIL にしてしまう）。また、「設定のどこかに同じ分類の規則があれば、今の照合をそのまま使う」のでもない（その作りだと、先頭の分類の無い規則が生の文字を抑えてしまう）
  - 例: 規則が `[0] { path: "tests/**" }`（分類なし）、`[1] { path: "tests/**", category: "bidi-control" }` の順のとき、`tests/new.ts` の U+202E は `[1]` が抑え、`[0]` は候補にならない。`[1]` の `path` が `docs/approved.txt` なら、どの規則も抑えない（`[0]` に代わりに抑えさせない）
  - 秘密の形の finding（`secret`・`oversized-candidate`）は今のまま（分類の無い規則も効く）
  - 衛生の finding（`tracked-env`・`untracked-env`・`gitignore`）は今のまま、どの規則も効かない
- `findAllowRule` は `applyAllow`（`scan.ts:619-637`）と review-packet（`src/review/packet.ts:474`）が共有する。この 1 か所で決めれば、呼び出し元が増えても同じ規則になる
- 代わりの案: `applyAllow` の中で分ける。`findAllowRule` を直接呼ぶ側（パケット）に同じ規則が効かないので、採らない
- 分類の照合は今の `allowMatches`（`scan.ts:649-653`）のまま。`bidi-control` の規則は `secret` の finding に効かない（分類が違う）

### 5-3. `line` 付きの規則と、パス名の finding

- `line` 付きの規則は、その行の中身の finding だけに効く（`allowMatches` の今の照合）
- パス名の finding は `line` を持たないので、`line` 付きの規則は効かない。パス名の finding を抑えるのは、`line` の無い規則だけ
- `path` の照合は今の `path.matchesGlob`。パス名に生の文字があるファイルは、`*` などのワイルドカードを含む glob で指せる

### 5-4. 記録

- 抑えた finding は `suppressed` に入り、`[allowed]` の行で出る（`security-scan.ts:88`）。パス名の finding は `line` が無いので、`[allowed] <path> bidi-control by rule #n`（`:<line>` を付けない）にする（今の書き方のままだと `:undefined` になる）
- `allowUsage`・未使用・期限切れの記録（`scan.ts:621-636`）は今のまま。使われた回数は、`findAllowRule` が返した番号の規則に付く（`scan.ts:629-630`）。分類の無い規則が生の文字の finding で「使われた」になることは無い
- 同じファイルに秘密の形と生の文字があり、分類の無い規則が秘密の形だけを抑えるとき: 秘密の形は `suppressed` に入ってその規則の回数が 1 増え、生の文字は `findings` に残る（exit 1）。分類の無い規則は（秘密の形で使われたので）未使用にならない
- 期限の切れた規則は、生の文字の finding も抑えない（今の `findAllowRule` の判定のまま）

## 6. 出力・パーサ・履歴

### 6-1. パーサ（`src/parse/security-scan.ts`）

- `KINDS`（16-22 行）の最後に `["raw characters", "rawChars"]` を足す
- `SECURITY_SCAN_COUNT_KEYS`（24 行）は `KINDS` から作るので、`rawChars` が `gitignore` の後ろ、`suppressed` の前に入る
- `ENTRIES`（26-36 行）に `["[raw-char] ", "raw-char"]` を `[gitignore] ` の後ろに足す
- `findingsOf`（38-56 行）は今のまま: 内訳がちょうど `KINDS` の数（6）で、合計が総数と一致しないと `unexpected-summary`
- `COUNT_KEYS`（`src/parse/read.ts:24-29`）は各パーサの一覧を指すだけなので、変えない

### 6-2. 端末の `parsed:` の表示（`src/parse/describe.ts:38-42`）

- `.gitignore N)` の前に `, raw characters N` を足す: `findings 1 (secret-shaped 0, oversized candidates 0, tracked .env 0, untracked .env not ignored 0, .gitignore 0, raw characters 1); suppressed by security.allow 0; …`

### 6-3. `aiqh history` と HTML

- 履歴の読み込みは `COUNT_KEYS` のキーだけを読む（`src/run-history/read.ts:344-352`）。新しい run は `rawChars` を持ち、古い run は持たない
- 集計（`src/run-history/aggregate.ts:257-285`）は、どれかの run に値があるキーにだけ系列を作り、値の無い run を `unknownRuns` に数える。v0.13.0 の後の run が 1 つでもあれば `rawChars` の系列ができ、その前の日の値は `null`（`unknownRuns` に数える）
- `findings` の系列は、v0.13.0 から生の文字の件数を含む（同じ系列の中で意味が少し広がる。CHANGELOG に書く）
- HTML の対応表（`src/run-history/html.ts:56-57` の `projects.*.counts.*.days.*.value` など）はワイルドカードなので、変わらない見込み。security の check の表が 1 つ増える
- 古い aiqh の `aiqh history` が新しい履歴を読むと、`rawChars` は知らないキーとして読み飛ばす（`COUNT_KEYS` だけを読むため）

### 6-4. 新旧の aiqh の食い違い（R2 で書き直し。I48-D-R1-001）

- パーサは verify の側（親）にあり、走査は check の子のプロセス（`aiqh security-scan`）が出す。子は、check の `command`（`aiqh init` が出すのは `aiqh security-scan`。`src/adapters/builtin.ts:16`）を shell で起動したもので（`src/runner/execute.ts:150-156`。環境は親のものから色の変数を除き `NO_COLOR=1` を足したもの。`src/runner/env.ts:8-13`。PATH は変えない）、`aiqh` は親と同じ環境の PATH で探される。親の `aiqh` そのものが子になるわけではない
- 次の 2 つは、別のことなので分けて書く
  1. **パースの失敗は判定を変えない**（ADR-0028 の P1。`src/parse/read.ts:1-6`）: 新旧の形が食い違っても、`parsed` が `unparsed`（`unexpected-summary`）になるだけで、check の PASS / FAIL・終了コード・判定は変わらない。この点は R1 のまま
  2. **検出の範囲は、実際に起動する `aiqh security-scan` の版で決まる**: 生の文字を見つけるかどうかは子の版で決まり、親（verify）の版では決まらない。**新しい verify と古い `aiqh security-scan` の組み合わせでは、項目 48 の検出は効かない**（古い子は生の文字を見ないので、ほかの finding が無ければ exit 0 で、check は PASS のまま）。パースの失敗が判定を変えないことは、この組み合わせを安全にするものではない
- 組み合わせと結果

| verify（親。パーサ） | `aiqh security-scan`（子。出力） | `parsed` | 項目 48 の検出 |
|---|---|---|---|
| 新 | 新 | `parsed`（`rawChars` あり） | 効く |
| 新 | 古（5 つの内訳） | `unparsed`（`unexpected-summary`） | **効かない**（生の文字があっても PASS のまま） |
| 古 | 新（6 つの内訳） | `unparsed`（`unexpected-summary`） | 効く（子が exit 1 を返せば FAIL） |

- 新しい verify と古い子の組み合わせで見える印は、security の check の `parsed` が `unexpected-summary` になること（と、子の出力に `raw characters checked:` の情報の行〈§4-2、U4〉が無いこと）だけ。判定には出ない
- H8（パーサは新しい形だけを受け付ける）は変えない。古い形も受け付けると、この組み合わせが `parsed` として見え、食い違いの印が消える（検出が効かないことは変わらない）
- 起きる場面
  - CI の再利用ワークフロー（`.github/workflows/verify.yml`）: 自分の commit（`job.workflow_sha`）のソースを取り出し、その `src/cli.ts` を起動する `aiqh` の小さな起動の script を PATH に置いて（`verify.yml:108-111`）、verify を動かす。子の `aiqh security-scan` も同じ script を通るので、親と子は同じ commit になる（ADR-0031）。項目 48 の検出が効くのは、呼び出し側が `uses:` に書いた SHA が v0.13.0 以降のときだけ
  - 手元: 親と子は、同じ PATH の `aiqh` を使うかぎり同じ版になる。違う版になるのは、たとえば、verify を PATH の外の `aiqh`（新しく取り出した場所の `node <場所>/src/cli.ts verify` など）で動かし、PATH の `aiqh` が古いままのとき。`npm link` の `aiqh` は `dist/cli.js` を指す（`package.json` の `bin`）ので、新しい版を取り込んでも `npm run build` をするまでは、PATH の `aiqh` は古い版のまま。親も子も古い `dist/` で動くときは食い違いが無いので、`unexpected-summary` の印も出ない。`aiqh --version` でも見分けられない（版の表示は `package.json` の `version` を実行時に読むので〈`src/cli.ts:19-27`〉、ソースと `package.json` を更新した後に古い `dist/` が残っていれば、新しい版の番号を表示しながら古い走査で動く。I48-D-R2-001）
  - 適用先の `npm run` のスクリプトから verify を動かすときは、npm が PATH の先頭に足す場所（`node_modules/.bin`）に別の `aiqh` があれば、それが子になる
  - 本体の自己 verify の security の check は `npm run security`（`node src/cli.ts security-scan`）で、同じソースなので起きない
- **版を上げるときの案内**（CHANGELOG・README・CONFIG_SPEC に書く。§9）: verify が実際に呼ぶ `aiqh`（手元は PATH の `aiqh` と、`npm run` のスクリプトが呼ぶもの。CI は再利用ワークフローの `uses:` の SHA）の版・commit をそろえる。`--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる（I48-D-R2-001）。手元は、どの `aiqh` が呼ばれるかを `command -v aiqh` で確かめる。security の check の `parsed` が `unexpected-summary` なら、親と子の版の食い違いを疑う

## 7. review-packet との関係

- 変えない。理由:
  - review-packet は、生の文字を `findRawChars`（75 の符号位置）で別に確かめ（`packet.ts:468`）、allow では抑えない（ADR-0014）。パケットの守りは、security の check より広い
  - review-packet は秘密の形を `scanString` で確かめ、その finding を `oversized-candidate` 以外はすべて `secret` として扱い（`packet.ts:480`）、allow を当てる（`packet.ts:473-478`）。生の文字の確かめを `scanString` の経路に入れると、同じ文字がパケットに 2 回（`raw-char` と `secret`）出て、`secret` の方は allow で抑えられてしまう
  - そのため、生の文字の確かめは `scanFile` の側（§3-2）だけに置く
- `findAllowRule` の変更（§5-2）は、パケットが `raw-char` の finding を渡さないので、パケットの動きを変えない
- 変わらないことを確かめるテスト（§8 の T12・T13）
  - `scanString` に 11 文字のそれぞれを入れても、finding は 0 件のまま
  - `security.allow` に `category: "bidi-control"` の規則（`path: "**"`）がある設定でも、review-packet は生の U+202E を含む変更を `raw-char` で拒む（exit 1）

## 8. テスト計画

テストの中の生の文字は、すべて `String.fromCodePoint(…)` で数から作る（v0.11.1 の決まり。テストのソースには生の文字を置かない。`tests/no-raw-bidi-in-tracked-files.test.ts` が守る）。

### 8-1. 足すテスト（新しいファイル `tests/regression-item48-raw-chars-scan.test.ts`。§12 の U8 で決定）

「8870afb」の列は、変更の前の `src/` での見込み（FAIL = 変更が無いと通らない、PASS = 前も後も成り立つ守り）。

- **1 つの `it` に 1 つのケースを置く**（R2。I48-D-R1-004）。表の中で (1)・(2)… と分けたものも、別々の `it` にする。見込みの FAIL / PASS を `it` ごとに判定でき、新しい検出を確かめるテストと、既存の動きを壊さないテストを分けて読める
- R1 から足したケースは、T 番号を付け直さず枝番（`T7a`・`T8a` など）にした（R1 と R2 で番号が追えるように）。置き場所は U8 のとおり新しいファイル
- **変更の前の commit でも、新しいテストのファイルは読み込める**（2026-10-19 に実測）: この repo の vitest 5.0.0 では、モジュールに無い名前を import しても（`SCANNED_RAW_RANGES` など）、ファイル全体は落ちない。その名前は `undefined` になり、使った `it` だけが FAIL になる（tmp の 1 つのテストのファイルで、2 つの `it` のうち無い名前を使う 1 つだけが FAIL、ほかは PASS）。そのため、同じファイルの中の PASS の見込みの `it` も判定できる。型検査（`tsc`）は通らないので、変更の前の worktree では typecheck を判定に使わない

| # | 内容 | 8870afb |
|---|---|---|
| T1 | `raw-chars.ts`: 11 の符号位置、分類ごとの数、`FORBIDDEN_RANGES` の部分集合、対象外の文字（U+200E・U+200F・U+061C・U+200B・U+200D・U+FEFF・TAB・CR・LF）は null、`SECRET_CATEGORIES` と名前がぶつからない | FAIL（定数が無い） |
| T2 | 一時の git リポジトリで、追跡しているファイルに 11 文字を 1 つずつ置く → `scanRepository` の finding（`kind`・`category`・`file`・`line`・`codePoint`）、CLI の exit 1 | FAIL |
| T3 | 同じ行に U+202E が 3 つ → 1 件。同じ行に U+202E と U+2066 → 2 件。U+2028 の後ろでも行番号は増えない | FAIL |
| T4 | 長い行（小さい `maxLineBytes` などの設定）の、窓の重なりと切れ目の付近に置いた文字 → ちょうど 1 件 | FAIL |
| T5 | 未追跡のファイルの中身（R2 で直した。I48-D-R1-004）。(1) 未追跡で ignore されない通常のファイル（名前は ASCII）の中身の U+202E → finding。(2) **未追跡で** ignore されたファイル（名前は ASCII。ignore の指定は生の文字を含まない `ignored/` などの pattern）の中身の U+202E → なし（一覧に出ない）。(3) 未追跡で ignore されない `.env`（名前は ASCII）の中身の U+202E → 中身の finding は無く、`untracked-env` だけ。なお、追跡しているファイルは ignore の指定があっても走査する（今と同じ。T2 の範囲）ので、(2) は追跡しているファイルには当てない | (1) FAIL / (2) PASS / (3) PASS |
| T6 | バイナリ（先頭 8 KiB に NUL）の中の文字 → なし（`skippedBinary`）。不正な UTF-8 のバイトの後ろの U+202E → finding（行も正しい）。UTF-16LE（BOM つき）の中の U+202E → なし（既知の限界を固定）。先頭の BOM だけ・CRLF だけ → なし。U+200E・U+200F・U+061C・U+200B・U+200D → なし（H2・H3 を固定） | 不正な UTF-8 の 1 つは FAIL、ほかは PASS |
| T7 | パス名: (1) 追跡している通常のファイルの名前に U+202E → `line`・`endLine` の無い finding。(2) 端末の行の形（表記になったパス）。(3) `--json` に `line` が無い。(4) ルートのパスに U+202E があっても、パスの finding は出ない | (1)〜(3) FAIL / (4) PASS |
| T7a | パス名（中身を読まないもの。R2 で足した。I48-D-R1-003。T7a〜T7g の共通の確かめは表の後ろ）: 追跡しているバイナリ（先頭 8 KiB に NUL。中身にも U+202E）の名前に U+202E → パス名の raw-char の finding が 1 件。中身の finding は 0 件、`skippedBinary` は 1 | FAIL |
| T7b | 未追跡で ignore されない `.env*` の名前に U+202E（名前は `.env.` ＋ U+202E ＋ `local` のように、`ENV_FILE` に当たる形）→ パス名の finding が 1 件と `untracked-env` が 1 件。中身（U+202E を置く）は読まないので、中身の finding は 0 件 | FAIL |
| T7c | 追跡している symlink の名前に U+202E（先は ASCII の名前の通常のファイル）→ パス名の finding が 1 件。symlink は読まない（先のファイルは自分の名前で走査され、finding は無い） | FAIL |
| T7d | submodule（gitlink）の名前に U+2066 → パス名の finding が 1 件（`bidi-control`） | FAIL |
| T7e | 作業ツリーから消えた追跡パスの名前に U+202E（commit の後に作業ツリーから消す。`git rm` はしない）→ パス名の finding が 1 件。`lstat` の ENOENT でエラーにならない（今と同じ） | FAIL |
| T7f | 未追跡で ignore されない通常のファイルの名前に U+2029（中身は ASCII）→ パス名の finding が 1 件（`line-separator`）、中身の finding は 0 件 | FAIL |
| T7g | 未追跡で ignore されたファイルの名前に U+202E（`.gitignore` に生の文字を含まない `ignored/` を書き、その下に置く）→ raw-char の finding は 0 件（一覧に出ないので、名前も見ない。`.gitignore` の衛生の finding は数えない） | PASS |
| T8 | allow: `category: "bidi-control"` の規則が抑える（`suppressed`・`allowUsage` に出る）。分類の無い規則は抑えない（規則は未使用として出る）。`line-separator` の規則は U+202E を抑えない。`line` 付きの規則はその行だけ、パス名の finding には効かない。期限切れの規則は抑えない。`bidi-control` の規則は秘密の形を抑えない。スキーマが 2 つの分類を受け付ける | FAIL（8870afb のスキーマは 2 つの分類を拒み〈設定の誤りで exit 2〉、生の文字の finding も無い） |
| T8a | 規則の組み合わせ（R2 で足した。I48-D-R1-002）: `[0] { path: "tests/**" }`（分類なし）、`[1] { path: "tests/**", category: "bidi-control" }`。`tests/new.ts` の U+202E → `[1]` だけが抑える（`suppressed` の `rule` が 1）。回数は `[1]` が 1、`[0]` が 0（`[0]` は `unusedAllows` に入る）。exit 0 | FAIL（同上） |
| T8b | T8a の `[1]` の `path` を `docs/approved.txt`（別のパス）にする → どの規則も抑えない（`[0]` に代わりに抑えさせない）。U+202E は `findings` に残り exit 1。回数は `[0]`・`[1]` とも 0 | FAIL（同上） |
| T8c | T8a の `[1]` を期限切れ（`expires` が過去の日）にする → 抑えない（exit 1）。`[1]` は `expiredAllows` に入り、`unusedAllows` には入らない。`[0]` は `unusedAllows` に入る | FAIL（同上） |
| T8d | 秘密の形との混在: `tests/new.ts` に秘密の形のダミー（`tests/helpers.ts` の `fake()` で組み立てる）と U+202E。規則 `[0] { path: "tests/**" }`（分類なし）、`[1] { path: "docs/**", category: "bidi-control" }`、`[2] { path: "tests/**", category: "bidi-control", expires: 過去の日 }` → 秘密の形は `[0]` で `suppressed`（`[0]` の回数 1）、U+202E は `findings` に残る（exit 1）。`unusedAllows` は `[1]` だけ、`expiredAllows` は `[2]` だけ。端末の `[allowed]` の行は 1 行（秘密の形） | FAIL（同上） |
| T8e | `findAllowRule` を直接呼ぶ（返す番号の確かめ）: 生の文字の finding（`kind: "raw-char"`、`category: "bidi-control"`、`line` あり）に、`[分類なし（当たる）, bidi-control（当たる）]` → 1。パス名の finding（`line` なし）に、`[bidi-control で line 付き, bidi-control で line なし]` → 1 | FAIL（8870afb の `findAllowRule` は raw-char にいつも -1） |
| T8f | `findAllowRule` を直接呼ぶ（-1 と、今のままのもの）: 生の文字の finding に、`[分類なし]` → -1、`[line-separator]` → -1、`[bidi-control で期限切れ]`（`today` を固定）→ -1、`[bidi-control で別の line]` → -1。パス名の finding に `[bidi-control で line 付き]` → -1。秘密の形の finding に `[分類なし, …]` → 0（今のまま） | PASS（変更の前も後も成り立つ守り） |
| T9 | 端末の出力: 件数の行の最後に `raw characters: N`、`[raw-char]` の行、情報の行。行の中身（前後の語）を出さない。パス名の `[allowed]` の行に `:undefined` が出ない | FAIL |
| T10 | パーサ: 6 つの内訳の行を読む（`rawChars`、項目の種類 `raw-char`）。5 つの内訳の行は `unexpected-summary`。`describe.ts` の表示に `raw characters N` | FAIL |
| T11 | 履歴: `rawChars` を持つ run と持たない run の集計で、系列ができ、古い run は `unknownRuns` | FAIL（キーが無い） |
| T12 | `scanString` に 11 文字のそれぞれ → 0 件のまま（パケットの経路が変わらない守り） | PASS |
| T13 | review-packet: `category: "bidi-control"`・`path: "**"` の allow がある設定でも、生の U+202E を含む変更は `raw-char` で拒まれる（exit 1） | FAIL（8870afb のスキーマが分類を拒み、exit 2 になる。変更の後は exit 1） |
| T14 | 本体の自己 verify の security の出力（`tests/fixtures/parse/security-self.stdout.txt` を取り直したもの）が `raw characters: 0` で `parsed` | FAIL（fixture を取り直すまで） |

- T5・T6・T7・T7g・T8f・T12 の PASS の項目は、変更の前も後も成り立つ守り（変更で壊さないことを確かめる）
- 表の exit の見込み（T8a の exit 0 など）は、ほかの finding（`.gitignore` の衛生の finding など）が出ないように作った一時のリポジトリでのもの（既存のテストと同じ作り）
- T7a〜T7g の共通の確かめ（I48-D-R1-003）: パス名の finding は `kind: "raw-char"`、`file` はそのパス、`line`・`endLine` が無い、`category`・`codePoint` が置いた文字のもの。中身の走査の範囲は変えない（読まないものは読まないまま）
- T7a〜T7g の作り方（どれも、既存のテストと同じく一時のディレクトリの git リポジトリで、ネットワークを使わない）
  - 名前の文字は `String.fromCodePoint(0x202e)` などで組み立てる（ソースに生の文字を置かない）。git には `execFileSync` の引数で名前を渡す（shell を通さない。既存のテストの `git()` の形。例: `tests/review-packet.test.ts:46`）
  - symlink: `symlinkSync("target.txt", <名前>)` の後に `git add -- <名前>`（既存のテストに `symlinkSync` の使い方がある。例: `tests/regression-m2-2-r2-001-output-boundary.test.ts:62`）
  - submodule: 本物の submodule・`.gitmodules`・別のリポジトリは作らない。`git update-index --add --cacheinfo 160000,<SHA>,<名前>` で gitlink を index に入れ（既存の `tests/review-packet.test.ts:151`・`tests/regression-m2-1-r1-005-submodule-type-change.test.ts:58` と同じ方法。SHA は同じリポジトリの commit でよい）、作業ツリーに同じ名前の空のディレクトリを作る（作らないと ENOENT の道を通り、T7e と同じになる）
  - 作業ツリーから消えた追跡パス: commit の後に `unlinkSync` で消す（index には残る）
  - バイナリ: `Buffer` で先頭に 0x00 を置く
  - ignore: `.gitignore` には ASCII の `ignored/` だけを書く（`.gitignore` の中身に生の文字を置くと、その中身が finding になるため）
  - 名前に入れた文字が macOS の正規化で変わらないこと: 11 文字は合成・分解の対象ではない（推定。実装のときに `git ls-files -z` の出力で確かめる）
- テストを先に書き、変更の前の `8870afb` の SHA 固定の worktree に写して、上の見込みのとおり FAIL / PASS になることを確かめてから実装する

### 8-2. 期待値が変わる既存のテストと fixture（2026-10-19 に grep で確かめた）

| ファイル | 場所 | 変わること |
|---|---|---|
| `tests/parse-security.test.ts` | 73 行（`SECURITY_ZERO`） | `rawChars: 0` を足す（82 行・93 行の期待がこれを使う） |
| `tests/parse-security.test.ts` | 96-100 行（読めない形の 4 つの例） | 件数の行を 6 つの内訳にする。そのままでも結果（`no-summary`・`unexpected-summary`）は同じだが、98・99 行は「内訳が 5 つ」という別の理由で通ってしまうので、確かめたい理由（合計の不一致・最後の行の不一致）で通るように直す |
| `tests/parse-security.test.ts` | 120 行（verify の `parsed:` の行） | `, raw characters 0` が入る |
| `tests/fixtures/parse/security-self.stdout.txt` | 12 行（件数の行）と 7 行（`scanned categories:`）の後ろ | 実際の `npm run security` の出力で取り直す。U4 で情報の行を足すと決めたので、7 行の後ろに `raw characters checked:` の行が 1 行増え、件数の行は 13 行目に動く |
| `schema/aiqh.config.schema.json` | 130-147 行（`category` の `enum`） | 2 つの値が増える（生成物。`tests/schema.test.ts:15` が生成と一致を確かめる。テストそのものは変えない） |

### 8-3. 影響を受けるが、期待値は変わらない見込みのテスト（推定）

| ファイル | 理由 |
|---|---|
| `tests/regression-m2-2-r2-001-output-boundary.test.ts:122-137` | 名前に U+202E のあるファイルを走査する。パス名の finding が 1 件増えるが、確かめは exit 1 と `toContain` なので通る見込み |
| `tests/regression-m2-2-r3-002-json-keys.test.ts:153-169` | 名前に U+202E のある 2 つのファイル。finding が増えるが、確かめは「0 より多い」とキーの形なので通る見込み。足す欄 `codePoint` は識別子の形 |
| `tests/history-read.test.ts:331-343` | パーサの fixture のキーが `COUNT_KEYS` に入っていること。fixture を取り直しても `rawChars` は一覧にあるので通る |
| `tests/history-aggregate.test.ts:188-191`・`tests/history-cli.test.ts:111`・`tests/history-html.test.ts:296`・`tests/history-read.test.ts:305` | 入力の `counts` に `rawChars` が無いので、系列は増えない |
| `tests/regression-m2-2-r3-001-line-breaks.test.ts` | ルートのパスと LF の入ったファイル名。LF は 11 文字に入らない |
| `tests/no-raw-bidi-in-tracked-files.test.ts`・`tests/docs-no-raw-separators.test.ts` | 変えない（§9 の注） |
| `tests/regression-m2-2-cli-catch-001-thrown-value.test.ts` | R2 で足した（下の検索で当たった）。U+202E を数から組み立て、`security-scan --json` を子のプロセスで動かすが、`process.cwd` から例外を投げる試験で、走査の前に止まる。U+202E は投げる値の文字列にだけあり、リポジトリのファイルには置かない |
| `tests/security-scan.test.ts`・`tests/regression-m1r1-001-untracked-scan.test.ts`・`tests/regression-m1r1-004-large-text.test.ts` | R2 で足した。`filesScanned` の数を確かめる（`security-scan.test.ts:47`・`:83`・`:138` など）。パス名の確かめは `filesScanned` を変えない（§3-4）ので通る見込み。リポジトリに 11 文字を置かない |
| `tests/security-compat.test.ts` | R2 で足した。秘密の形のパターンの分類の一覧（`SECRET_PATTERNS`）を確かめる。生の文字の分類はパターンに足さないので変わらない |

- 実装のときに、全テストを走らせて、この表の外で落ちるものが無いことを確かめる
- R2 で、基準の commit の `git grep -l` で、次の語の当たるテストを確かめた（結果は R2 の依頼文に一覧で載せた）: `SECURITY_SCAN_COUNT_KEYS`・`secret-shaped:`・`findAllowRule`・`scanRepository`・`scannedCategories`・`FindingKind`・`untracked .env not ignored`・`security-scan`・`scanned categories`・`[allowed]`・`filesScanned`。あわせて、11 文字を数から組み立てるテスト（`0x202a`〜`0x202e`・`0x2066`〜`0x2069`・`0x2028`・`0x2029` などの数）と、`security-scan`・`scanRepository` を使うテストの重なりは 4 つ（`output-boundary`・`line-breaks`・`json-keys`・`cli-catch-001`）で、どれもこの表にある
- `aiqh init` の説明文（`src/adapters/builtin.ts:16`、U12）の文字列は、テストには無く、`docs/CONFIG_SPEC.md:213` の生成例にだけある（§9 の CONFIG_SPEC の行で直す）

## 9. 文書の変更

| 文書 | 変更 |
|---|---|
| ADR-0036（新規） | この設計の決定（案は `adr-0036-draft-r2.md`） |
| ADR の一覧（`docs/adr/README.md`） | 0036 の行 |
| ADR-0012 | 注記: allow の分類に `bidi-control`・`line-separator` を足した。生の文字は分類を明示した規則だけが抑える（ADR-0036） |
| ADR-0014 | 注記: review-packet は変えない。security の check は 75 のうち 11 だけを見る（ADR-0036） |
| ADR-0020 | 注記: 決定 3（`FORBIDDEN_RANGES` は 75 のまま）は保つ。security の check はその部分集合の定数を使う |
| ADR-0028 | 注記: security-scan の内訳に `raw characters`、数のキー `rawChars`、項目の種類 `raw-char`。新旧の食い違いは `unexpected-summary` になる。パースの失敗は判定を変えない（P1 のまま）。ただし、検出の範囲は実際に起動する `aiqh security-scan`（子）の版で決まり、新しい verify と古い security-scan の組み合わせでは、項目 48 の検出は効かない（§6-4。R2 で直した。I48-D-R1-001） |
| ADR-0034 | E の行の参照（`src/parse/security-scan.ts:24` など）が変更で動くなら、新しい行に合わせる（§12 の U11） |
| `docs/CONFIG_SPEC.md` | §3b（75 行から）: allow の分類の 2 つと「明示した規則だけ」。§5.3b（243 行から）: 走査の仕様に生の文字・パス名・既知の限界と、検出の範囲は子の `aiqh security-scan` の版で決まること（§6-4）。§5.2・§5.3 の生成例の説明文（`src/adapters/builtin.ts` を変える場合） |
| `docs/ARCHITECTURE.md` | §6.1b（201 行から）: security-scan の見つけるもの |
| `docs/ROADMAP.md` | 項目 48 を v0.13.0 で閉じる。新しい項目 49（そのほかの見えない文字・方向の印〈U+200E・U+200F・U+061C・ゼロ幅・異体字セレクタ・タグ文字など〉の扱い。理由と、適用先の 1 つに意図した使い方と推定される当たりがあること） |
| `README.md` | 機能の表と `security.allow` の説明（197 行）・`aiqh security-scan` の説明。版を上げるときの注意（判定が厳しくなる。verify が実際に呼ぶ `aiqh` の版・commit をそろえる。§6-4 の案内）。状況の末尾（v0.12.1 の後の記録のまま古い）を release の commit で直す |
| `src/adapters/builtin.ts:16` | `aiqh init` が出す security の check の説明文に、生の文字を足す（U12 で「変える」と決定。文は案: `Secret-shaped strings, raw bidi controls and line separators in tracked files, tracked .env files, .gitignore coverage (values are never printed)`）。既存の適用先の設定の文は変わらない |
| `CHANGELOG.md` | v0.13.0 の項（下の下書き） |

- 本体の再発を防ぐテスト（`tests/no-raw-bidi-in-tracked-files.test.ts`）と docs のテスト（`tests/docs-no-raw-separators.test.ts`）は変えずに残す。本体だけの、75 の符号位置と不正な UTF-8 を見る決まりで、security の check（適用先向けの 11 の符号位置）とは役割が違う

### CHANGELOG の下書き（v0.13.0）

```
## v0.13.0 — commit <SHA> / tag object <SHA> — security-scan finds raw bidirectional controls and line separators (a stricter verdict)

- **判定が厳しくなる変更**: `aiqh security-scan`（verify の security の check）が、追跡しているファイルと、未追跡で ignore されないファイルの中身とパス名にある、生の双方向の制御文字（U+202A–U+202E、U+2066–U+2069）と行区切り・段落区切り（U+2028、U+2029）を finding にする（`raw-char`。1 つでもあれば exit 1、check は FAIL）。これまで PASS だったリポジトリが FAIL になりうる（ROADMAP の項目 48。ADR-0036）
  - 見つけ方: `aiqh security-scan` の `[raw-char] <path>:<line> U+XXXX <分類>` の行（行の中身は出さない）
  - 直し方: 文字列の中なら、言語のエスケープで書く（テストでは数から組み立てる）。意図しない文字なら消す
  - 意図した文字を残すとき: `security.allow` に `category` を `bidi-control` か `line-separator` と**明示した**規則（`path`・`reason` は必須、`line`・`expires` は任意）。分類の無い既存の規則は、生の文字を抑えない
  - 見ないもの（既知の限界）: 方向の印 U+200E・U+200F・U+061C、ゼロ幅の文字、UTF-16 のファイル、不正な UTF-8 のバイト（ROADMAP の項目 49）
- **検出が効くのは、実際に起動する `aiqh security-scan` が v0.13.0 以降のときだけ**: verify の security の check は、check の `command`（`aiqh security-scan`）を PATH で探して起動する。新しい verify が古い `aiqh security-scan` を呼ぶと、生の文字は見つからず、check は PASS のまま
  - 版を上げるとき: verify が実際に呼ぶ `aiqh`（手元は PATH の `aiqh` と、`npm run` のスクリプトが呼ぶもの。CI は再利用ワークフローの `uses:` の SHA）の版・commit をそろえる。`--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる。手元は、どの `aiqh` が呼ばれるかを `command -v aiqh` で確かめる
- 出力: 件数の行の最後に `raw characters: N`。verify のレポートの `parsed.counts` に `rawChars`。古い aiqh の verify と新しい `aiqh security-scan` の組み合わせ（とその逆）では、`parsed` が `unexpected-summary` になる。パースの失敗そのものは判定を変えない（ADR-0028）が、新しい verify と古い `aiqh security-scan` の組み合わせでは、上のとおり検出が効いていない。`unexpected-summary` は、親と子の版の食い違いの印として扱う
- review-packet は変えていない。依存関係・`package-lock.json`・`.github/`・`tests/structure/`・組み込みのモジュールの一覧は v0.12.1 と同一
```

## 10. 版と PR の分け方

1. **PR 1 `release/v0.13.0`**（3 commit。各 commit を SHA 固定の worktree で typecheck・lint・全テスト・`npm run verify` が PASS になること）
   1. テストと実装（§8-1 のテストを先に書き、`8870afb` の SHA 固定の worktree にテストのファイルだけを写して、見込みどおり FAIL / PASS になることを確かめてから実装する。commit はテストと実装を一緒にする。`raw-chars.ts`・`scan.ts`・`schema.ts`・`security-scan.ts`・パーサ・`describe.ts`・`builtin.ts`、JSON Schema の生成し直し、fixture の取り直し、§8-2 の期待値）
   2. 文書（§9。ADR-0036 を「採用」で）。あわせて、設計レビュー R1・R2 の取り込みと収録（`aiqh review-import` で `docs/reviews/item48-design/findings-r1.json`・`findings-r2.json`、原文の `review-r1.md`・`review-r2.md`、応答の `response-r1.md`・`response-r2.md`。人間の決定〈2026-10-19〉で、設計の段ではせず、この PR で行う）
   3. release（`package.json` 0.13.0、CHANGELOG、README）
   - SP1 の案はテストだけの commit を先に置く 4 commit だったが、テストだけの commit は verify が FAIL になり、「各 commit の worktree の検証が PASS」の手順に反する。v0.11.1・v0.12.1 と同じく、テストを先に書いて変更の前の worktree で確かめ、commit はテストと一緒にする形にした
2. **PR 2 `docs/v0130-record`**: タグの SHA・CI の記録、実装レビュー（v0.13.0）の取り込み
3. 適用先の呼び出しの SHA を上げる PR は、実装レビューを閉じた後（H11。この設計の範囲の外）

## 11. 既知の限界

- **UTF-16・UTF-32 のファイル**: NUL を含むのでバイナリとして読まず、中の生の文字は見えない
- **不正な UTF-8**: finding にしない。正しく符号化された 11 文字は見つけるが、長すぎる符号化（不正な UTF-8）で書かれた文字を、それを受け入れる道具が生の文字として読む場合は見逃す（推定。今の主な道具は拒む）
- **見ない文字**: 方向の印（U+200E・U+200F・U+061C）、ゼロ幅の文字（U+200B・U+200C・U+200D・U+2060）、途中の U+FEFF、異体字セレクタ、タグ文字、C0・C1 の制御文字（11 の外）。同形異字（CVE-2021-42694）も見ない。ROADMAP の項目 49
- **言語ごとの字句解析を持たない**: コメント・文字列・識別子の区別をしない。閉じた並びや正当な使い方（右から左に書く言語の文書など）も finding にする。始まりと終わりの対応だけでは安全とは判断しない（同じ行で、あるコメントの U+202E を、間に実行される文を挟んだ別のコメントの U+202C で閉じると、対応はとれていても効果が複数の字句の要素をまたぐ。UTS #55 §4.1.1 は字句の要素の境界を表示の単位〈atom〉の境界とし、§5.1.6 は効果が atom をまたぐことを警告の観点とする）。正当な使い方は allow で扱う（R2 で直した。I48-D-R1-005）
- **ルートのパス**: リポジトリからの相対のパスだけを見る
- **symlink の先・submodule の中**: 今の security の check と同じく読まない
- **allow の `path`・`reason` の文字**: スキーマは C0・DEL・C1・U+2028・U+2029 を禁じるが、双方向の制御文字は禁じていない（端末の出口で表記になる。ADR-0016）。この設計では変えない

## 12. 細部の決定（U1〜U12。2026-10-19 に人間が推奨どおりで決めた）

R1 では未決の一覧（推奨つき）だった。R2 では、決めたことだけを書く。

| # | 決めたこと | 決定 |
|---|---|---|
| U1 | 定数の名前と形 | `SCANNED_RAW_RANGES`（範囲と分類の組）＋ `scannedRawCategory()`＋ `RAW_CHAR_CATEGORIES`（§2-2 の案 A） |
| U2 | 符号位置の欄 | `codePoint: "U+202E"`（文字列。パケットの表示・`formatCodePoint` と同じ形） |
| U3 | パス名の finding の端末の行 | `[raw-char] <path> U+202E bidi-control (in the path)`。`[allowed]` の行も `:<line>` を付けない |
| U4 | 見る文字を出力に書くか | 書く（端末の情報の行と `--json` の `scannedRawChars`）。その版が何を見るかが出力で分かる。パーサは読み飛ばす |
| U5 | パス名を見る範囲 | 2 つの一覧のすべてのパス（§3-4） |
| U6 | finding の順 | §4-2 の順 |
| U7 | 同じ行の同じ符号位置の回数 | 数えない（1 件） |
| U8 | テストの置き場所 | 新しいファイル `tests/regression-item48-raw-chars-scan.test.ts` に T1〜T9（枝番の T7a〜T7g・T8a〜T8f を含む）・T11〜T13。T10・T14 は `tests/parse-security.test.ts` に足す |
| U9 | `message` の文 | `raw <分類> character U+XXXX`（パス名は `… in the path`） |
| U10 | 「分類の無い規則は効かない」の置き場所 | `findAllowRule` の中（§5-2。候補の規則を順に見る条件の中） |
| U11 | ADR-0034 の行の参照 | 実装で動いた行に合わせる（古い行の参照を残さない） |
| U12 | `builtin.ts` の説明文を変えるか | 変える（文は §9 の案。`aiqh init` の新しい設定に、見るものが正しく書かれる） |

## 13. 確かめていないこと

- §8-1 の「8870afb」の列は見込み。テストを書いて、変更の前の worktree で確かめるのは実装の段（R2 で足した T5 の直し・T7a〜T7g・T8a〜T8f も同じ）
- §8-3 の「期待値は変わらない見込み」は、テストのソースを読んだ推定。全テストは走らせていない
- 長い行の窓の重なりで、同じ文字が 2 つの窓に入ることは `LineAssembler` のコードから分かることで、実測していない
- 生の文字の確かめを足したときの走査の時間（行ごとに文字を 1 回なめるだけで、線形の見込み）
- 新旧の aiqh の組み合わせで `unexpected-summary` になることと、新しい verify と古い `aiqh security-scan` の組み合わせで項目 48 の検出が効かないこと（§6-4）は、コードを読んだ推定（新旧の 2 つの版を組み合わせて動かしてはいない）
- §3-4 の「2 つの一覧に出るもの」は、ASCII の名前の使い捨てのリポジトリ（git 2.50.1、macOS）で確かめた。名前に 11 文字を入れたときの一覧（macOS のファイル名の正規化を含む）と、CI の ubuntu の git での一覧は、実装の段で確かめる
- §8-1 の「新しいテストのファイルは読み込める」は、この repo の vitest 5.0.0 で、tmp の 1 つのテストのファイルを動かして確かめた（変更の前の worktree そのものでは、まだ動かしていない）
- §11 の UTS #55 §4.1.1・§5.1.6 の読み方は、R1 のレビューの根拠と、SP1 で読んだ抜粋による（この段で本文を読み直していない）
