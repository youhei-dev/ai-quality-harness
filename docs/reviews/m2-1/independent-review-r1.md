<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-1-r1-for-claude.md、2026-09-23 付、23,012 バイト）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞で始まる例示も無いため、変更した行は無い（0 行）。
禁止集合の生文字（C0・C1・U+2028 / U+2029・双方向制御文字・BOM）も無い。原文の 52 行目と 53 行目（R1-001 の再現手順）に置換文字 U+FFFD があり、
禁止集合に含まれないためそのまま残した。
無改変の原文の SHA-256: df9a30f90489580e63d0684a7c60d7e02b77362d38401267fd077bb9112b57a1
-->

# independent review — M2-1 R1

## 1. 総評

M2-1 の実装は、strict UTF-8 デコーダ、2 段階スキャン、可変長 Markdown fence、literal pathspec、無圧縮 ZIP など、主要設計はかなり丁寧に実装されています。
ただし、fail closed の境界と書込みトランザクションに重大な抜けがあり、**High 3件 / Medium 2件 / Low 0件**を指摘します。
特に、Git の `-z` 出力に含まれる不正 UTF-8 のパスが `Buffer.toString("utf8")` で置換文字へ変換され、exit 1 にならず処理継続できる点は、今回の要件に直接反します。
また、ZIP 書込み失敗時にパケットだけ先に既存ファイルを置換し得る点、出力先ディレクトリの禁止文字が stdout に生で出得る点も High と判断します。

---

## 2. 指摘

### ID：M2-1-R1-001
- **重大度：High**
- **対象：** `src/review/packet.ts:172-182`, `src/review/packet.ts:478-480`, `src/review/packet.ts:540-545`
- **内容：** Git の `-z` 出力中のファイルパスが不正 UTF-8 でも strict decode されず、`Buffer.toString("utf8")` により U+FFFD（replacement character）へ置換されます。その結果、不正 UTF-8 のパスが finding にならず fail closed を抜けます。さらに、その壊れた文字列を `:(literal)` pathspec に再利用するため、対象ファイルの diff が空のまま成功することがあります。
- **根拠：**

```ts
function splitZ(buf: Buffer): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      out.push(buf.subarray(start, i).toString("utf8"));
      start = i + 1;
    }
  }
  if (start < buf.length) out.push(buf.subarray(start).toString("utf8"));
  return out;
}
```

```ts
const raw = parseRaw(gitOk(root, ["diff", "--raw", "-z", ...], "listing changes"));
...
raw.sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")));
```

```ts
const pathspec = [`:(literal)${r.path}`, ...(r.oldPath !== null ? [`:(literal)${r.oldPath}`] : [])];
const diffBytes = gitOk(root, [...DIFF_FLAGS, from.sha, to.sha, "--", ...pathspec], `diff of ${r.path}`);
```

`splitZ()` は NUL 区切り自体は正しく扱っていますが、各 path byte sequence を strict UTF-8 検査せず通常の `toString("utf8")` で文字列化しています。Node は不正バイトを U+FFFD に置換するため、元の不正 UTF-8 は失われます。以後は U+FFFD を含む「有効な JavaScript 文字列」として扱われるため、`decodeUtf8Strict()` の対象になりません。

- **再現手順：実行確認あり（aiqh 全体ではなく、問題となる Git 出力と Node の decode/pathspec 挙動を最小再現）**
  1. POSIX 系ファイルシステム上で、ファイル名 byte sequence に `0xFF` を含む tracked file（例：`bad_` + byte `FF` + `.txt`）を作成して commit する。
  2. `git diff --raw -z --no-abbrev <from> HEAD` を取得する。
  3. 実際に raw output には path byte `... 62 61 64 5f ff 2e 74 78 74 ...` が含まれることを確認した。
  4. 現実装と同じ `subarray(...).toString("utf8")` で読むと、path は `bad_�.txt` になることを確認した。
  5. その置換後 path を `:(literal)bad_�.txt` として `git diff ... -- <pathspec>` に渡すと、Git は **exit 0 / stdout 0 bytes** で終了した。
  6. **期待：** 不正 UTF-8 path を検出して exit 1、パケット/ZIPを書かない。
  7. **実際：** path 自体には finding が作られず、壊れた path 名のまま処理継続でき、該当 diff も欠落し得る。
- **修正案：** `splitZ()` を string 化前提にしない。`-z` 出力は NUL 区切りの `Buffer` slice のまま保持し、各 path slice を `decodeUtf8Strict()` で strict decode する。不正 UTF-8 なら `invalid-utf8` finding として exit 1。Git への pathspec 再投入が必要な箇所は、可能なら raw bytes を保持したまま扱うか、strict decode 成功後の文字列だけを使用する。
- **回帰テスト案：** Linux/macOS で byte `0xFF` を含む Git path を Python/Buffer API 等で作成して commit し、`review-packet` が exit 1、packet/ZIP が未作成、stderr には値を出さず `invalid-utf8` と出所のみが出ることを確認する。併せて invalid path があると diff が黙って空にならないことを確認する。

### ID：M2-1-R1-002
- **重大度：High**
- **対象：** `src/commands/review-packet.ts:110-116`, `src/commands/review-packet.ts:135-140`
- **内容：** `-o` / `--zip-output` は **basename だけ** ASCII 検証しており、親ディレクトリ名は検証しません。したがって親ディレクトリに U+2028 / U+2029 / bidi / C0 等の禁止文字を含められます。成功時ログは resolved path 全体をそのまま stdout に出し、`maskSecrets()` は raw character sanitizer ではないため、禁止文字が標準出力へ生で出る経路があります。
- **根拠：**

```ts
const output = path.resolve(cwd, options.output ?? ...);
const zipPath = zipWanted ? path.resolve(cwd, options.zipOutput ?? ...) : null;
for (const p of [output, zipPath]) {
  if (p !== null && !OUTPUT_NAME.test(path.basename(p))) return fail(...);
}
```

```ts
log(`packet: ${output} (${bytes.length} bytes, sha256 ${summary.sha256})`);
if (summary.zip) log(`zip:    ${summary.zip} (sha256 ${summary.zipSha256})`);
```

`OUTPUT_NAME` の検査対象は `path.basename(p)` だけです。例えば親ディレクトリ名に U+2028 があっても、最終ファイル名が `packet.md` なら通過します。その後、`output` 全体がログ文字列に入ります。

- **再現手順：未実行（コード読解による）**
  1. POSIX/macOS 上で、親ディレクトリ名に文字 U+2028 を含む出力先を指定する。例：`-o <U+2028を含むディレクトリ>/packet.md`。
  2. basename は `packet.md` なので `OUTPUT_NAME` を通る。
  3. packet 書込み成功後、`log("packet: ...")` に親ディレクトリを含む full path が入る。
  4. **期待：** 禁止文字を値として stdout/stderr に生で出さない。拒否するなら `U+2028` のようなコードポイント表記だけにする。
  5. **実際：** U+2028 を含む path が stdout にそのまま入る経路がある。
- **修正案：** 出力 path をログへ出す前に raw character を安全な ASCII 表記へ escape する共通関数を通す。より単純には `-o` / `--zip-output` の全 path component に対して禁止文字検査を行い、禁止文字があれば値を再掲せずコードポイントだけで exit 2 にする。JSON summary も同じ safe rendering を使う。
- **回帰テスト案：** `--output` と `--zip-output` の親ディレクトリにそれぞれ U+2028、U+202E、CR を含め、stdout/stderr/JSON のどこにも生文字が現れないことを byte レベルで検証する。拒否仕様にするなら exit 2・既存ファイル不変も確認する。

### ID：M2-1-R1-003
- **重大度：High**
- **対象：** `src/commands/review-packet.ts:118-128`, `src/commands/review-packet.ts:172-180`
- **内容：** `--zip` 時の書込みが packet と ZIP で個別 atomic なだけで、コマンド全体として atomic ではありません。packet を先に rename して既存 packet を置換した後、ZIP 側の書込みが失敗すると exit 2 になりますが、既存 packet はすでに新内容へ上書き済みです。「失敗時に既存ファイルを上書きしない」という要件を満たしません。
- **根拠：**

```ts
const bytes = Buffer.from(built.text, "utf8");
atomicWrite(output, bytes);
summary.output = output;
...
if (zipPath !== null) {
  const zip = createStoredZip([{ name: path.basename(output), data: bytes }]);
  atomicWrite(zipPath, zip);
  ...
}
```

```ts
function atomicWrite(target: string, data: Uint8Array): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${process.pid}`);
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, target);
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
  }
}
```

`atomicWrite()` 単体は「その target の rename 前には既存 target を壊さない」設計ですが、2 出力を束ねる transaction はありません。ZIP 用ディレクトリ作成・temp write・rename のどれかが失敗した時点では packet の rename はすでに完了しています。

- **再現手順：未実行（コード読解による）**
  1. `output` に既存 packet（内容 `OLD`）を置く。
  2. `--zip` または `--zip-output` を指定する。
  3. ZIP の親 path を「通常ファイル」にして `mkdirSync(path.dirname(zipPath), {recursive:true})` が失敗する状態、または ZIP 側だけ書込不能な状態にする。
  4. 実行する。
  5. **期待：** exit 2。既存 packet=`OLD`、既存 ZIP も不変。
  6. **実際：** packet は先に新内容へ rename 済み。その後 ZIP で例外となり exit 2 になるため、失敗したコマンドが既存 packet を上書きし得る。
- **修正案：** packet と ZIP の最終 bytes を先に両方生成し、両方をそれぞれ temp file へ完全に書き終えた後で commit phase に入る。既存 target がある場合まで「両方またはどちらも更新しない」を厳密に求めるなら backup/rollback を含む 2-phase replace が必要。最低限、ZIP temp 作成成功前に packet target を rename しない。
- **回帰テスト案：** 既存 packet / ZIP を事前に作り、ZIP 側だけ必ず書込失敗させる。exit 2 の後に両既存ファイルが byte-for-byte 不変であることを確認する。現在の `tests/review-packet.test.ts:385-401` は finding(exit 1) の既存 packet 保護しか検証しておらず、write error(exit 2) を覆っていない。

### ID：M2-1-R1-004
- **重大度：Medium**
- **対象：** `src/commands/review-packet.ts:154-160`, `src/review/packet.ts:211-213`, `src/review/packet.ts:612-614`, `src/review/packet.ts:620-630`, `src/review/packet.ts:719-728`
- **内容：** Markdown の「構造として使う文字列」の escape が不十分です。`cell()` は `|` しか escape しません。一方、request/review の basename、`--exclude` glob、verify JSON を parse した後の文字列は、LF や backtick を含んでも許され、そのまま見出し・表・inline code に入ります。これにより、入力内容そのものは fence で安全でも、メタデータから偽の見出しや表行を作り、レビュアーが別節と取り違えることができます。
- **根拠：**

```ts
function cell(s: string): string {
  return s.replace(/\|/g, "\\|");
}
```

```ts
return { name: path.basename(abs), bytes: readFileSync(abs) };
```

```ts
b.add(`Supplied by a human (\`${cell(request.name)}\`), verbatim:\n\n`);
...
b.add(`## ${cell(r.name)}\n\n`);
```

```ts
b.add(excludes.length > 0 ? `; excludes ${excludes.map((g) => `\`${cell(g)}\``).join(", ")}` : "; excludes none");
```

```ts
lines.push(`| ${cell(String(c.name))} | ${cell(String(c.kind))} | ... |\n`);
```

`findRawChars()` は LF と TAB を許可する仕様です。そのため「文字として禁止されていない LF」が Markdown の構造境界として作用します。また backtick も禁止集合ではありません。

- **再現手順：未実行（コード読解による）**
  1. POSIX/macOS で request ファイル名を、例えば `req` + LF + `# Commits` + `.md` のようにする。
  2. `--request` でそのファイルを指定する。
  3. request 本文自体には問題のない通常テキストだけを入れる。
  4. **期待：** filename は literal 表示され、packet の top-level section 構造は固定されたまま。
  5. **実際：** `Supplied by a human (\`...` の途中へ LF と `# Commits` が入り、fenced body の外側に偽の heading を作れる。
  6. 同様に、verify の `checks[].name` を JSON 文字列内の `\n# Integrity` として保存すると、JSON.parse 後に LF となり verification table の構造を壊せる。
- **修正案：** Markdown の context ごとに renderer を分ける。ファイル名・glob・自由文字列は、`renderPath()` 相当で LF/TAB/backtick/backslash を ASCII escape してから inline code / heading / table に入れる。verify table cell は少なくとも CR/LF/TAB/backslash/pipe/backtick を構造を壊さない形へ encode する。request/review 本文の dynamic fence は現状方針でよい。
- **回帰テスト案：** request/review basename、exclude glob、verify check name に `LF + "# Fake"`、連続 backtick、backslash+pipe を入れ、packet の top-level heading 一覧が固定 10 節から増えず、表列数も壊れないことを Markdown parser または既存 `sections()` helper で検証する。

### ID：M2-1-R1-005
- **重大度：Medium**
- **対象：** `src/review/packet.ts:489-499`, `src/review/packet.ts:519-545`
- **内容：** submodule から通常ファイルへ type change した変更を、`<to>` が通常テキストファイルであるにもかかわらず `submodule` と分類し、全文・差分を出しません。「`<to>` 時点の変更テキストファイル全文を含める」という仕様とずれます。
- **根拠：**

```ts
const deleted = r.status === "D";
...
const mode = deleted ? r.oldMode : r.newMode;
...
if (mode === "160000" || (!deleted && r.oldMode === "160000")) {
  file.kind = "submodule";
  prepared.push({ file, content: null, diff: null });
  continue;
}
```

`!deleted && r.oldMode === "160000"` により、old=160000 / new=100644 の type change まで submodule 扱いになります。現在 tree の mode は 100644 なので、本来は通常ファイルとして blob を読み、全文を掲載できるケースです。

- **再現手順：実行確認あり（Git の type-change 状態を最小再現）**
  1. commit A で path `sub` を mode 160000 の gitlink として登録する。
  2. 次 commit B で `sub` を通常ファイル（mode 100644、内容 `now text`）へ置換する。
  3. `git diff --raw --no-abbrev A B` は `:160000 100644 ... T sub` となることを確認した。
  4. 現コードでは `deleted=false`, `mode=100644`, `r.oldMode=160000` なので第2条件が true になり `kind="submodule"` で continue する。
  5. **期待：** `<to>` の `sub` は regular text file として全文・差分を掲載する。
  6. **実際：** `submodule` として全文・差分なしになる。
- **修正案：** submodule 判定は「表示対象 side が gitlink か」で決める。少なくとも non-deleted entry は `newMode === "160000"` のときだけ current submodule とする。old が submodule / new が regular の type change は new blob を通常ファイルとして処理し、diff は type change を含めて取得する。
- **回帰テスト案：** (a) regular→submodule、(b) submodule→regular、(c) submodule delete、(d) submodule add の4ケースを作る。特に (b) で kind=`text`、Full Source に新ファイル内容、Diff に mode change と本文が入ることを確認する。

---

## 3. 指摘ではないが確認した点

### 1. fail closed の抜け道 / `security.allow`
- 変更ファイル本文、diff、commit message、request/review、`--doc`、verify result を個別に検査し、組み立て後 packet を再検査する2段構成を確認しました（`src/review/packet.ts:473-596`, `682-697`）。
- `security.allow` は `origin` が得られる repository path/line にだけ適用され、commit/request/review/verify 等へ横滑りしない設計を確認しました（`313-333`）。通常ケースは妥当です。
- 一方、**不正 UTF-8 の Git path が strict decode を通らない**抜け道を M2-1-R1-001 として指摘しました。
- また、output path は packet scanner の外側なので、禁止文字が stdout に出る経路を M2-1-R1-002 として指摘しました。

### 2. UTF-8 の厳格判定 / 禁止集合
- `firstInvalidUtf8Offset()` は lead byte 範囲、continuation、overlong、surrogate、U+10FFFF 超、truncated sequence を明示的に拒否しています（`src/security/raw-chars.ts:60-94`）。
- テストも lone continuation / overlong / surrogate / >U+10FFFF / invalid lead / truncated を個別に含み、さらに fatal `TextDecoder` との固定 seed property test があります（`tests/raw-chars.test.ts:78-131`）。この部分に実装上の誤りは見つけませんでした。
- 禁止集合も C0（TAB/LF除外）、CR、DEL、C1、U+2028/U+2029、U+202A-U+202E、U+2066-U+2069、U+FEFF と要件どおりです（`src/security/raw-chars.ts:18-26`）。
- ただし path byte sequence はこの strict decoder に入らないため、M2-1-R1-001 は別問題として残ります。

### 3. Markdown の組み立て
- 本文/diff/request/review/document の内容そのものには、内容中の最長 backtick run より1文字長い fence を選ぶ `fenceFor()` があり、長い backtick や本文中 heading で fence が閉じる問題は対策されています（`src/review/packet.ts:215-219`, `275-283`）。`tests/review-packet.test.ts:206-213` でも4連 backtickを確認しています。
- 一方、fence 外の metadata の escape が不十分で、LF/backtick 等から packet structure を壊せる点を M2-1-R1-004 としました。

### 4. git の呼び出し
- `spawnSync("git", args)` で shell を経由していないこと、ref 解決に `--end-of-options` を使うこと、変更一覧に `-z`、diff pathspec に `:(literal)` を使うことを確認しました（`src/review/packet.ts:152-190`, `477-480`, `540-542`）。
- valid UTF-8 の改行・空白・非ASCII path はテストされています（`tests/review-packet.test.ts:189-204`）。
- rename は `-M50%`、削除は old blob、通常の submodule は content を出さない設計も確認しました。
- ただし invalid UTF-8 path の decode 問題を M2-1-R1-001、submodule→regular type change を M2-1-R1-005 として指摘しました。

### 5. ZIP 形式
- local header / central directory / EOCD の signature、store method=0、bit 11、DOS date/time、CRC32、compressed/uncompressed size、offset、Unix mode 0100644 を確認しました（`src/review/zip.ts:34-91`）。
- `tests/zip.test.ts` は local/central の CRC・size・name consistency、central directory offset/size、CRC 再計算、固定時刻、mode、再現性を検証しています。
- 1 packet entry という M2-1 の利用範囲では、ZIP 構造自体に問題は見つけませんでした。
- ただし「他ツールで開けるか」という観点では、テストは自作 reader のみで、system `unzip -t` / Python `zipfile` 等との相互運用テストはありません。現コードの header 内容から直ちに不正とは判断しないため、これは指摘にはしていません。

### 6. 出力先 / atomic write / label / `-o`
- `--label` は `[a-z0-9.-]{1,64}`、output basename は ASCII 英数字・`.`・`_`・`-` に制限され、packet/ZIP 同一 path も拒否しています（`src/review/packet.ts:44-45`, `src/commands/review-packet.ts:110-116`）。
- 個々の target は same-directory temp → rename で書いています。
- ただし親 directory の raw character 非検証を M2-1-R1-002、packet→ZIP の2ファイル更新が transaction になっていない点を M2-1-R1-003 としました。
- 既存ファイル保護テストは finding(exit 1) のみで、write error(exit 2) で ZIP だけ失敗するケースはありません。

### 7. v0.3.5 の PID 競合修正
- `waitForPid()` は「ファイル存在」ではなく、`^[0-9]+$` かつ positive safe integer になるまで 25ms 間隔で待機します（`tests/helpers.ts:50-73`）。0、負数、NaN、空文字、途中書込みは signal 対象になりません。
- `assertSignalablePid()` も signal 前の防御として `Number.isSafeInteger(pid) && pid > 0` を要求しています（`tests/helpers.ts:39-48`）。
- `tests/regression-r3-cli.test.ts:160-173` に「空ファイルを先に作り、400ms 後に PID を書く」回帰ケースがあり、原因となった window を意図的に広げています。
- 同様の PID 読取りをしていた R1/R2 系 regression tests も `waitForPid()` へ変更されていることを確認しました（`tests/regression-r1-runner.test.ts:40-43`, `tests/regression-r2-cli-signal.test.ts:25-33`, `tests/regression-r2-runner.test.ts:43-47`）。
- `killIfAlive()` は cleanup 内で `Number(readFileSync(...))` のままですが、直後に `assertSignalablePid()` があるため、0/NaN を `process.kill` へ渡すことはありません。この範囲では追加指摘なしです。

### 8. docs とコードの一致
- ADR-0014 / ARCHITECTURE / CONFIG_SPEC / ROADMAP / README の M2-1 記述を、range 解決、2段検査、allow、lock、NUL、上限、ZIP、再現性、終了コードの観点で照合しました。
- strict UTF-8・raw-char 集合・dynamic fence・`-z` / literal pathspec・ZIP store/fixed time など主要記述は概ねコードと一致しています。
- ただし、仕様上期待される fail closed が invalid UTF-8 path で破れる点（M2-1-R1-001）、書込失敗時の既存ファイル保護が packet+ZIP の組で成立しない点（M2-1-R1-003）は、文書に対して実装が満たせていない部分です。
- また docs は metadata の Markdown 構造注入を明示しておらず、M2-1-R1-004 の安全な rendering 規則を ADR に追記すると保守性が上がります。

---

## 4. 確認範囲と実行について

- 提供 ZIP 内の `review-packet-m2-1-r1.md` に収録された **Request、Diff、Full Source、tests、Verification、docs** を読みました。
- Verification の PASS は正しさの根拠には使用していません。
- 「既知の範囲外」4件は指摘対象から除外しました。
- 提供物は review packet 1 ファイルのみで、リポジトリ全体の未変更 source/module は含まれていないため、こちらでは `npm test` / `aiqh review-packet` の完全実行はしていません。
- ただし M2-1-R1-001 は、Git の raw `-z` path bytes → Node `toString("utf8")` → literal pathspec の挙動を一時 Git repository で実行確認しました。
- M2-1-R1-005 は、gitlink(160000) → regular file(100644) の type-change が `git diff --raw` で status `T` になることを一時 Git repository で実行確認しました。
