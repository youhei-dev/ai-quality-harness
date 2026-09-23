<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-1-r2-for-claude.md、2026-09-23 付、36,321 バイト）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞を連結した形も無いため、変更した行は無い（0 行）。M2-1-R2-001 の再現手順の
秘密の形は、原文で分割して書かれている（連結した形は原文に無い）。禁止集合の生文字（C0・C1・U+2028 / U+2029・双方向制御文字・BOM）と U+FFFD も無い。
無改変の原文の SHA-256: 5c93441d81330010cfd8b94236c0706026bb1eea5e804b398d1b32127b1f54b9
-->

# independent review — M2-1 R2

## 1. 総評

R1 の 5 指摘について、原指摘の根本原因は **3 件が解消、2 件が部分的に解消**と判断しました。Git path の strict UTF-8 化、出力パスの安全表示、submodule の表示側判定はコードと回帰テストで確認できています。
一方、R1 対応の周辺境界に **High 4 件 / Medium 4 件 / Low 0 件**の新規指摘があります。特に、秘密の形を含む出力 basename が ZIP entry 名へ未検査で入る点、同一実体を指す 2 出力先、rollback/finalize 失敗時の transactional guarantee、ZIP 相互運用テストの外部 `shasum` 依存は High です。
R1-004 は LF 等による偽見出し自体は抑えられていますが、backtick の Markdown escape が成立しておらず、描画前 raw-character 検査も `--range` / `--doc` に漏れがあります。
Verification の PASS、commit message、response-r1、CHANGELOG の自己説明は根拠にせず、Full Source とテストを照合し、一部は最小再現を実行して判断しました。

## 2. R1 の各指摘の解消状況

### M2-1-R1-001 — 解消

**根拠:** `src/review/packet.ts:152-190, 400-435, 539-617`

`git -z` の出力は `splitZ()` で `Buffer[]` のまま分割され、path は `decodePath()` で `decodeUtf8Strict()` に通るようになっています。不正 UTF-8 は `invalid-utf8`、有効 UTF-8 の禁止文字は `raw-char` finding になり、置換文字 U+FFFD へ黙って変換する元の原因は解消しています。Git 呼出しにも `core.precomposeunicode=false` が固定され、復号済み path だけが literal pathspec に使われ、変更ファイルの diff が空なら exit 2 になるガードも追加されています。

```ts
function splitZ(buf: Buffer): Buffer[] {
  ...
  out.push(buf.subarray(start, i));
  ...
}

function decodePath(ck: Checker, bytes: Buffer | undefined, where: string): string {
  const d = decodeUtf8Strict(bytes ?? Buffer.alloc(0));
  if (!d.ok) {
    ck.findings.push({ kind: "invalid-utf8", source: "path", ... });
    return `<invalid path: ${where}>`;
  }
  for (const h of findRawChars(d.text)) ck.findings.push(...);
  return d.text;
}
```

`tests/regression-m2-1-r1-001-git-paths.test.ts:68-141` も 0xFF、`--exclude` 済み path、禁止文字、LF/TAB、NFD、短い正当 diff を直接扱っています。

ただし、path finding と size error が同時にあると exit 2 が先行する別の優先順位問題は、新規 **M2-1-R2-007** として指摘します。

### M2-1-R1-002 — 解消

**根拠:** `src/commands/review-packet.ts:69-77, 116-128, 149-166, 169-190`; `src/security/raw-chars.ts:50-66`

`--cwd`、`--output`、`--zip-output` は resolved full path に対して `findRawChars()` が実行され、禁止文字があれば path 自体を再掲せず code point のみで exit 2 になります。通常 stdout/stderr は `safeText()`、JSON 内の文字列は `escapeDeep()` を通した後 masker に渡されます。R1 の「親ディレクトリ中の禁止文字が stdout に生で出る」という経路は解消しています。

`tests/regression-m2-1-r1-002-output-paths.test.ts:66-127` も output/zip parent、cwd、エラーメッセージ、JSON、LF を検証しています。

なお、出力 basename 自体の「秘密の形」は別経路で ZIP entry 名へ入るため、新規 **M2-1-R2-001** として指摘します。これは R1-002 の raw-character leak そのものではありません。

### M2-1-R1-003 — 部分的に解消

**根拠:** `src/commands/review-packet.ts:130-135, 229-316`

packet と ZIP の bytes を先に作り、各 target の sibling temp を `wx` で書いてから、既存 target を backup へ rename、新版を install、失敗時に rollback する二段階書込みへ変更されています。ZIP 側 prepare failure や 2 個目 install failure で既存 packet が先に失われる R1 の単純ケースは修正されています。

しかし、`zipPath === output` が文字列一致しか見ていないため、symlink parent 等を介して 2 path が同じ実体を指すケースでは transactional guarantee が破れます。また rollback の「新規 file の削除失敗」を握りつぶし、backup cleanup failure は commit 完了後に外へ伝播するため、exit 2 と実際の filesystem state が一致しない経路があります。これらを新規 **M2-1-R2-002 / R2-003** とします。

### M2-1-R1-004 — 部分的に解消

**根拠:** `src/review/packet.ts:204-234, 532-535, 678-740, 793-802`; `tests/regression-m2-1-r1-004-markdown-structure.test.ts:83-123`

LF/TAB/backslash/backtick 等を fence 外 metadata 用に変換し、見出しと table cell を専用 renderer 経由にしたため、R1 で再現した LF + `# Fake` による top-level heading 増加は抑えられています。verify values、exclude、request/review basename の raw 値を描画前に検査する処理も追加されています。

ただし `escapeInline()` は backtick を `\`` にするだけで、実際の backtick code point は残っています。CommonMark の code span delimiter は backslash escape されないため、「中身から backtick をなくす」という実装意図を満たしていません。また描画前 raw-character 検査は `--range` と `--doc` metadata に適用されていません。新規 **M2-1-R2-005 / R2-006** とします。

### M2-1-R1-005 — 解消

**根拠:** `src/review/packet.ts:550-590`; `tests/regression-m2-1-r1-005-submodule-type-change.test.ts:49-101`

submodule 判定は削除なら old mode、それ以外は new mode、すなわち「表示する側」の mode だけで `160000` を判定するようになっています。さらに old side が gitlink の場合は blob として読まず、submodule -> regular file は regular text として full source と diff を作ります。

```ts
const mode = deleted ? r.oldMode : r.newMode;
if (mode === "160000") {
  file.kind = "submodule";
  ...
}
const oldIsBlob = !ZERO.test(r.oldBlob) && !deleted && r.oldMode !== "160000";
```

追加テストも regular -> submodule、submodule -> regular、delete、add の 4 ケースを直接検証しており、R1 の根本原因は解消しています。

---

## 3. 新しい指摘

### ID：M2-1-R2-001
- **重大度：High**
- **対象：** `src/commands/review-packet.ts:116-135`、`src/review/zip.ts:34-46, 79-80`
- **内容：** `-o` で指定した packet の basename は ASCII 形式しか検査されず、秘密の形の scanner を通りません。その basename がそのまま ZIP entry 名になります。したがって、秘密の形に一致する出力 basename を指定すると、packet 本文の二段階検査を通らず ZIP metadata に秘密の形が入ります。fail closed の要件に反します。
- **根拠：**

```ts
const output = path.resolve(cwd, options.output ?? ...);
...
if (!OUTPUT_NAME.test(path.basename(p))) return fail(...);
...
const bytes = Buffer.from(built.text, "utf8");
const zip = zipPath !== null
  ? createStoredZip([{ name: path.basename(output), data: bytes }])
  : null;
```

`buildPacket()` の stage 1 / stage 2 が完了した後で `output` が決まり、`path.basename(output)` は security scanner に戻されません。`OUTPUT_NAME` は文字種だけの検査なので、英数字だけで成立する secret pattern は通過します。`createStoredZip()` は entry name を local header と central directory に書き込みます。
- **再現手順：一部実行確認あり**
  1. 通常の clean な review packet を作れる repository を用意する。
  2. `-o` の basename を、例えば `"AK" + "IA" + "QWERTYUIOPASDFGH" + ".md"` のように、scanner が検出する秘密の形を分割して組み立てた名前にし、`--zip` を付ける。
  3. **期待:** secret-shaped input finding として exit 1、packet/ZIP とも未作成。
  4. **実際（コード経路）:** basename は ASCII regex を通り、ZIP entry 名にそのまま使われる。stdout 上の path は masker で隠れても ZIP 内 metadata には残る。
  5. `createStoredZip()` 単体の最小再現では、与えた entry name が ZIP bytes 内に local header / central directory の 2 回現れることを実行確認した。`aiqh` の end-to-end 実行自体は未実行。
- **修正案：** archive に入る user-derived metadata（最低でも packet entry basename）を ZIP 作成前に raw-character / secret scanner へ通す。finding の値は表示せず source を `output file name` 等にする。より安全には、ZIP 内 entry name を `review-packet-<validated label>.md` のような安全な内部名へ固定し、外部 `-o` basename と切り離す。
- **回帰テスト案：** secret-shaped basename を動的に分割連結して `-o` に渡し `--zip` を実行する。修正前は exit 0 かつ ZIP metadata に名前が入る、修正後は exit 1・packet/ZIP 未作成・stdout/stderr に値なしを確認する。

### ID：M2-1-R2-002
- **重大度：High**
- **対象：** `src/commands/review-packet.ts:116-128, 254-316`
- **内容：** packet path と ZIP path の衝突判定が文字列の `zipPath === output` だけです。異なる文字列が同じ filesystem object を指す場合（symlink parent、macOS の case-insensitive filesystem 上の大文字小文字違い等）、2 target として処理されます。その結果、同じ実体に packet と ZIP を順に install し、最終的に packet path に ZIP bytes が入り、既存ファイルも正常終了のまま置換されます。
- **根拠：**

```ts
if (zipPath !== null && zipPath === output)
  return fail("--zip-output must differ from the packet path");
...
for (const t of targets) {
  const st = lstatOrNull(t.path);
  ...
}
...
for (const t of targets) {
  renameSync(tmps.get(t) ?? "", t.path);
  installed.push(t);
}
```

`lstat()` は target path 自体が symlink の場合は拒否しますが、親 directory が symlink のケースでは両 path が同じ実体へ解決されても別 target として扱われます。
- **再現手順：実行確認あり（`writeTogether` 相当の最小再現）**
  1. `real/` を作り、`alias -> real` という directory symlink を作る。
  2. `output=real/same.bin`、`zipOutput=alias/same.bin` とする。文字列は異なるが実体は同じ。
  3. `same.bin` に `OLD` を置く。
  4. packet data=`PACKET`、zip data=`ZIP` として現行 `writeTogether` と同じ順序を実行した。
  5. **期待:** 同一実体の target と判定して exit 2、`OLD` は不変。
  6. **実際:** 処理は成功し、`real/same.bin` と `alias/same.bin` のどちらから読んでも最終内容は `ZIP`。元の `OLD` backup は成功処理として削除される。
- **修正案：** prepare 前に target identity の重複を拒否する。既存 target だけでなく、存在しない target もあるため、各 target の parent を `realpath` して `realParent + basename` を canonical candidate として比較する。macOS の case-insensitive filesystem は単純な OS 名決め打ちではなく、可能なら同一 directory 内の identity/case sensitivity を考慮する。少なくとも symlink parent alias は確実に拒否する。
- **回帰テスト案：** POSIX で real directory + symlink parent を用意し、同一 basename を packet/ZIP に指定する。修正前は success して ZIP が packet を置換、修正後は exit 2・既存 file byte-for-byte 不変。macOS では case-only difference の追加テストも行う。

### ID：M2-1-R2-003
- **重大度：High**
- **対象：** `src/commands/review-packet.ts:290-316`
- **内容：** transactional rollback / finalize の失敗処理が不完全です。backup のない新規 target を rollback で削除できなかった場合、その失敗を完全に握りつぶしながら「previous files were restored」と報告します。また commit 成功後の backup 削除は transaction の `try` の外にあり、ここで filesystem error が出ると、**新しい packet/ZIP はすでに install 済みなのにコマンドは exit 2** になります。既存ファイルの状態と終了結果が一致しません。
- **根拠：**

```ts
for (const t of [...installed].reverse()) {
  if (backups.has(t)) continue;
  try {
    step(`rollback:remove:${t.label}`);
    unlinkSync(t.path);
  } catch {
    // ... leaving it is reported below ...
  }
}
...
if (kept.length > 0) throw new WriteError(...);
throw new WriteError(`write failed (${cause}); the previous files were restored`);
...
for (const bak of backups.values()) rmSync(bak, { force: true });
```

catch 内で remove failure を記録しておらず、コメントとは逆に「残った新規 file」は `kept` に追加されません。また line 316 の backup cleanup failure は `WriteError` として transactional state を説明する処理がありません。
- **再現手順：実行確認あり（`writeTogether` 相当の最小再現）**
  1. packet/ZIP とも元ファイルがない状態で temp prepare を成功させる。
  2. packet install 後、`commit:install:zip` で failure を注入する。
  3. rollback の `rollback:remove:packet` にも failure を注入する。
  4. **期待:** exit 2 で新規 packet は残らない。もし除去不能なら、その残存 path を明示して「完全 rollback できていない」と報告する。
  5. **実際:** `write failed (...); the previous files were restored` と報告する一方、packet file は `PACKET` 内容で残り、ZIP は存在しないことを実行確認した。
  6. 別経路として、既存 target を backup した通常成功後に line 316 の `rmSync(bak)` が失敗すれば、新版 install 後に outer catch が exit 2 を返す。これはコード読解による。
- **修正案：** rollback action の各失敗を明示的に収集し、残った新規 file と復元できなかった backup の双方を safe display で報告する。「previous files were restored」は全 rollback action 成功時だけにする。commit 後の backup cleanup は「commit 成否」と分離し、cleanup failure を exit 2 にするなら state/backup location を正確に報告する。あるいは install 成功を commit point と定義し、backup cleanup failure は成功 + warning / retained backup として扱うなど、終了コードと filesystem state を一意にする。
- **回帰テスト案：** `writeHooks` で `commit:install:zip` と `rollback:remove:packet` を同時に失敗させ、修正前に「restored」と出るのに packet が残ることを FAIL させる。さらに backup cleanup 用 hook を追加し cleanup failure を注入して、終了コードと最終 state が仕様どおり一貫することを検証する。

### ID：M2-1-R2-004
- **重大度：High**
- **対象：** `tests/zip-interop.test.ts:18-19, 47-59`
- **内容：** Python `zipfile` 相互運用テストは「Python があるか」だけで skip を決めていますが、期待 SHA-256 の算出に未チェックの外部コマンド `shasum` を使っています。Python はあるが `shasum` がない環境では test body が実行され、`spawnSync(...).stdout` が `undefined` のまま `.split()` されて TypeError で自爆します。Linux は supported design ですが `shasum` は package requirement にありません。
- **根拠：**

```ts
const HAS_PYTHON_ZIPFILE =
  spawnSync("python3", ["-c", "import zipfile"], { stdio: "ignore" }).status === 0;
...
it.skipIf(!HAS_PYTHON_ZIPFILE)("Python zipfile...", () => {
  ...
  const sha = (b: Buffer): string =>
    spawnSync("shasum", ["-a", "256"], { input: b, encoding: "utf8" })
      .stdout.split(" ")[0] ?? "";
  ...
});
```

- **再現手順：実行確認あり**
  1. `PATH` に `python3` だけを置き、`shasum` が見つからない環境を作る。
  2. `spawnSync("python3", ["-c", "import zipfile"])` は status 0。
  3. 同じ環境で `spawnSync("shasum", ...)` を実行すると status `null`、error `ENOENT`、`stdout` は `undefined` になることを確認した。
  4. 現テストと同じ `.stdout.split(" ")` を評価すると `TypeError: Cannot read properties of undefined (reading 'split')` になることを確認した。
  5. **期待:** テストは aiqh/ZIP の不具合だけで FAIL し、環境に未宣言の hash utility がないだけで自爆しない。
  6. **実際:** Python probe を通った後、未 probe の `shasum` 欠如で test harness 自体が例外になる。
- **修正案：** Node 標準 `node:crypto` の `createHash("sha256")` で expected hash を計算し、外部 `shasum` 依存をなくす。これは本体の ZIP 検証対象と独立した期待値計算なので標準 API で十分です。
- **回帰テスト案：** Python は利用可能、`shasum` は PATH にない環境で `tests/zip-interop.test.ts` を実行し、Python `zipfile` test が正常に PASS/FAIL 判定まで進むことを CI で確認する。

### ID：M2-1-R2-005
- **重大度：Medium**
- **対象：** `src/review/packet.ts:204-234`、`tests/regression-m2-1-r1-004-markdown-structure.test.ts:83-123`、`docs/adr/0014-review-packet.md:61-65`
- **内容：** inline metadata の backtick escape が Markdown として成立していません。`escapeInline()` は backtick を backslash + backtick にしますが、CommonMark の code span 内では backslash は delimiter の backtick を無効化しません。`inlineCode()` は常に 1 個の backtickで囲むため、metadata に backtick があると code span が途中で閉じ、後続文字が Markdown 構造として解釈され得ます。ADR の「中身からバッククォートをなくす」という説明とも一致しません。
- **根拠：**

```ts
else if (cp === 0x60) out += "\\`";
...
export function inlineCode(s: string): string {
  return `\`${escapeInline(s)}\``;
}
```

実際には `"\\`"` の 2 文字目は本物の backtick です。R1-004 の regression test は heading 数・fence 外 line・table の `|` 数を独自関数で見るだけで、CommonMark parser による inline code span の成立は検証していません。
- **再現手順：実行確認あり（CommonMark parser による最小再現）**
  1. metadata `a` + backtick + `b` を現行 renderer 相当に通すと Markdown source は 1-backtick code span の内部に `a\` + backtick + `b` が入る。
  2. CommonMark parser で parse すると、最初の内部 backtick が code span を閉じ、`b` と末尾 backtick が span 外へ残ることを確認した。
  3. **期待:** metadata 全体が 1 個の literal inline token として解釈され、後続 Markdown 構造を作れない。
  4. **実際:** code span が途中で終了し得る。
- **修正案：** 「1 個の backtick で囲む」方針を維持するなら、内部 backtick を **本物の U+0060 を含まない ASCII 表記**（例 `\u{60}`）へ変換する。別案は content の最長 run より長い dynamic code-span delimiter を使う。ADR も実際の方式に合わせる。
- **回帰テスト案：** basename、glob、verify check name、commit subject、Git path に 1 個/複数 backtick と Markdown 記号を含め、生成 packet を CommonMark-compatible parser で parse し、metadata 全体が code node 1 個として保持されること、追加 heading/link/html 等が生じないことを確認する。最低限、renderer 出力の code span 内部に U+0060 が残らないことを unit test する。

### ID：M2-1-R2-006
- **重大度：Medium**
- **対象：** `src/review/packet.ts:513-535, 651-662, 668, 678, 736-740`
- **内容：** R1-004 対応で「描画前の raw metadata を検査する」処理が追加されましたが、対象は `--exclude`、request basename、review basename だけです。`opts.range` と `opts.docs[]` は raw 値のまま Git へ渡された後、packet では `renderPath()` によって escape されます。このため、`--range` または `--doc` metadata に禁止文字が含まれても stage 1 finding にならず、stage 2 では既に `\u{...}` 等の ASCII 表記になっているため検出できません。ADR の「every input を raw character 検査」の要件から外れます。
- **根拠：**

```ts
const excludes = opts.excludes ?? [];
excludes.forEach((g, i) => rawCharsOnly(ck, g, `--exclude pattern ${i + 1}`));
if (opts.request) rawCharsOnly(ck, opts.request.name, "request file name");
(opts.reviews ?? []).forEach((r, i) => rawCharsOnly(ck, r.name, `review file name ${i + 1}`));
```

一方で `opts.range` / `d` に対応する `rawCharsOnly()` はありません。

```ts
for (const d of opts.docs ?? []) {
  const ls = splitZ(gitOk(root, ["ls-tree", "-z", to.sha, "--", `:(literal)${d}`], ...));
  ...
  docs.push({ path: d, text });
}
...
b.add(`- Range as given: ${renderPath(opts.range)} ...`);
...
b.add(`## ${renderPath(d.path)} ...`);
```

- **再現手順：一部実行確認あり**
  1. Git ref/tag 名に U+2028 を含めた最小 repo で、Git 自体がその ref を `rev-parse` できることを実行確認した。
  2. Git tree に U+2028 を含む path を置き、`git ls-tree -- :(literal)<path>` がその entry を取得できることも実行確認した。
  3. その ref を `--range` の片側に使う、またはその path を変更対象ではない `--doc` として指定する。
  4. **期待:** raw-character finding、exit 1、packet/ZIP 未作成。
  5. **実際（aiqh 本体は未実行・コード読解による）:** stage 1 で検査されず、render 時に ASCII escape されるので stage 2 も raw code point を見つけられず、他に finding がなければ作成まで進む。
- **修正案：** packet に表示する全 option metadata を 1 か所で列挙し、描画前に raw-character / 必要な secret 検査を行う。最低でも `opts.range` と `opts.docs[]` を追加する。「renderer が raw 値を不可逆に変える入力は必ず renderer より前に検査する」という invariant を helper 化すると漏れを減らせます。
- **回帰テスト案：** U+2028 / U+202E 等を含む有効な Git ref と、変更一覧には出ない `--doc` path をそれぞれ作成し、exit 1・出所が `range` / `doc path`・値を stdout/stderr に出さない・packet/ZIP 未作成を確認する。

### ID：M2-1-R2-007
- **重大度：Medium**
- **対象：** `src/review/packet.ts:539-620, 668`
- **内容：** invalid/raw Git path finding が存在しても、同じ変更 file が `--max-file-bytes` を超えると size error の `PacketError` が先に throw され、finding 専用の exit 1 ではなく exit 2 になります。R1-001 の追加要件「不正 UTF-8 / 禁止文字 path は exit 1」と結果が一致しません。値の raw leak は safe display で抑えられますが、fail-closed finding の分類・終了コードが入力サイズによって変わります。
- **根拠：**

```ts
const raw = parseRaw(..., ck); // path finding is accumulated here
...
if (!isLock && (size > maxFile || oldSize > maxFile)) {
  tooLarge.push(...);
  ...
  continue;
}
...
if (tooLarge.length > 0) {
  throw new PacketError(...); // exit 2
}
...
if (ck.findings.length > 0) return { ok: false, findings: ck.findings }; // later
```

R1-001 regression test の invalid path は小さい file だけで、invalid path + oversize の複合条件を検証していません。
- **再現手順：未実行（コード読解による）**
  1. Git index に byte 0xFF を含む path を直接登録し、その object を `--max-file-bytes` より大きくする。
  2. その commit を含む range で `aiqh review-packet` を実行する。
  3. `parseRaw()` で `invalid-utf8` finding が `ck.findings` に追加される。
  4. 同じ entry の size 判定で `tooLarge` が追加され、loop 後 line 619 で `PacketError` が先に throw される。
  5. **期待:** path finding を優先して exit 1、packet/ZIP 未作成。
  6. **実際:** exit 2 の size error が返る。
- **修正案：** 全 `--raw -z` path の strict decode/raw 検査を最初の独立 pass として完了し、path finding が 1 件でもあれば content/blob size 処理へ進む前に rejected result を返す。少なくとも `tooLarge` throw より finding 判定を優先する。ただし全 path を検査して複数 finding を集約できる構造は維持する。
- **回帰テスト案：** invalid UTF-8 path + oversized blob、raw-character path + oversized blob の 2 ケースを追加し、修正前 exit 2、修正後 exit 1・path finding・packet/ZIP 未作成を確認する。

### ID：M2-1-R2-008
- **重大度：Medium**
- **対象：** `README.md:30, 45`（照合先 `package.json:3`, `CHANGELOG.md:8-21`）
- **内容：** README の current status がまだ「M2-1 v0.4.0、独立レビュー R1 待ち」のままで、実際の package version v0.4.1 および R1 対応済み状態と一致していません。利用者は現在どの revision が基準かを誤認します。
- **根拠：**

```md
**M2-1 の `aiqh review-packet` を v0.4.0 でリリース（独立レビュー R1 待ち...）**
...
| `aiqh review-packet` ... | M2-1 実装済み（v0.4.0、独立レビュー R1 待ち） |
```

一方 `package.json:3` は `0.4.1`、`CHANGELOG.md:8-21` は `v0.4.1 — M2-1 independent review R1 applied` です。
- **再現手順：未実行（文書と source の静的照合による）**
  1. `README.md:30,45` を読む。
  2. `package.json:3` と `CHANGELOG.md:8-21` を読む。
  3. **期待:** README が v0.4.1 / R1 applied（必要なら R2 review 中）を示す。
  4. **実際:** v0.4.0 / R1 waiting と表示される。
- **修正案：** README の現在状態と機能表を v0.4.1 に更新し、R1 対応済みであることを明記する。R2 がまだ受領前の release document という運用なら、「R1 applied / R2 pending」等、時点を曖昧にしない表現にする。
- **回帰テスト案：** release 時に `package.json` version、README current status、CHANGELOG latest heading の version が一致する lightweight docs consistency test、または release checklist を追加する。

---

## 4. 指摘ではないが確認した点 — 「特に見てほしい点」6 項目

### 1. R1 5 件の根本原因と、同じ問題の別経路

- **R1-001:** `Buffer.toString("utf8")` による Git path の置換はなくなり、`splitZ(Buffer)` → `decodeUtf8Strict()` へ変わったことを確認しました。`--exclude` path も検査されます。NFD path 用 `core.precomposeunicode=false` と empty diff guard もあります。原指摘は解消です。ただし finding と oversize の優先順位に別経路の漏れがあり、R2-007 としました。
- **R1-002:** full resolved path の raw-character rejection と stdout/stderr/JSON safe display を確認しました。原指摘の生 raw-character leak は見つかりませんでした。別経路として ZIP entry basename の secret scan 漏れを R2-001 としました。
- **R1-003:** prepare で両 temp を書く、`wx`、backup -> install -> rollback の基本形を確認しました。直接 target が symlink の場合は `lstat().isFile()` が false なので拒否されます。ただし parent symlink alias、rollback removal failure、post-commit backup cleanup failure が残り、R2-002/R2-003 としました。
- **R1-004:** LF による偽 heading/table row は現 regression の入力では抑止されています。ただし CommonMark の backtick delimiter と pre-render check coverage に漏れがあり、R2-005/R2-006 としました。
- **R1-005:** regular/submodule の add/delete/type change 4 ケースをコード・テスト両方で確認し、原指摘は解消です。

### 2. R1-004 の「描画前」検査、見逃し・二重計上

`verification` は JSON parse 後の raw values を `checkText()` してから描画しており、exclude/request/review basename は `rawCharsOnly()` が描画前に走ります。入力 finding がある場合は line 668 で packet 組み立て前に return するため、同じ raw input が stage 2 で二重 finding になる構造にはなっていません。`security.allow` の suppressed entry も input stage と packet stage で単純二重計上される問題は見つけませんでした。

一方、`--range` と `--doc` path は描画前 raw check から漏れており、renderer が raw code point を ASCII notation に変えることで stage 2 が見逃します。R2-006 としました。secret-shaped ASCII 文字列については renderer が通常その形を保持するため stage 2 scanner が働きますが、「raw 検査は描画前」という invariant は全 metadata に統一されていません。

### 3. R1-003 の二段階書込み：名前、`wx`、rollback 順、data loss、overwrite、symlink

- temp は sibling path、pid + 48-bit random、`writeFileSync(..., { flag: "wx" })` なので、`existsSync()` と write の間に同名 file が出ても上書きしません。
- backup 名も pid + random で既存名を避けています。backup 自体は `wx` 予約ではありませんが、予測困難な乱数名を別 process が競合させる現実的な再現経路は今回確認できませんでした。
- prepare 中に失敗すれば既存 target を rename する前なので、R1 の「ZIP 側失敗で packet だけ更新」は通常ケースでは解消しています。
- direct target symlink は `lstat()` により non-regular として拒否されます。
- **parent symlink で 2 target が同一実体になるケース**は未処理で R2-002。
- rollback の remove failure と post-commit backup cleanup failure は R2-003。
- 現 regression test は ZIP parent file、directory target、2 個目 install failure、restore failure、正常成功を扱いますが、上記 2 境界は扱っていません。

### 4. `core.precomposeunicode=false` の macOS / 非 macOS、NFC / NFD

`runGit()` の各 Git 呼出しに `-c core.precomposeunicode=false` が command-local に指定され、repository config 自体を書き換えないことを確認しました。Git tree に格納された path byte sequence を保持したまま strict decode -> literal pathspec する設計と整合しています。

`tests/regression-m2-1-r1-001-git-paths.test.ts:114-124` は repository config が `core.precomposeunicode=true` の状態でも NFD path の diff/full source が取れることを検証しています。非 macOS でもこの `-c` 指定自体が path を NFC/NFD に勝手に再正規化するコード経路は見つけませんでした。NFC と NFD が Git tree 上で別 byte path なら本実装も byte 起点で別 path として扱います。この項目について新規指摘はありません。

### 5. 回帰テストが要件を検証し、修正前 FAIL になっていたか

パケットに含まれる response-r1 の「修正前 FAIL」という自己申告は根拠にはしませんでした。テスト内容を v0.4.0 の旧ロジックに当てた場合をコードで逆算すると、主要な failure case は確かに旧実装を破る内容です。

- R1-001: 0xFF path は旧 `toString("utf8")` なら exit 1 にならないため failure case は有効。
- R1-002: parent raw character は旧 basename-only check / raw log では failure case が有効。
- R1-003: 2 個目 install failure / restore failure は旧単独 `atomicWrite()` にはない保証を要求しており failure case は有効。成功 case が旧版でも PASS するのは正常です。
- R1-004: LF + fake heading は旧 `cell()` 等では構造を壊すので failure case は有効。ただし parser ではなく独自 line check のため、backtick code-span break は検出できず R2-005 が残りました。
- R1-005: submodule -> regular の旧判定は oldMode=160000 で submodule 扱いになるので failure case は有効。add/delete の control case が旧版でも PASS するのは正常です。
- ZIP interop は `unzip` / Python `zipfile` を実際に使う方向は適切ですが、Python test の expected hash が未宣言の `shasum` に依存して自爆するため R2-004 としました。
- R1-001 の invalid path + oversize、R1-003 の alias/rollback remove、R1-004 の CommonMark parse が未カバーで、それぞれ R2-007/R2-002・003/R2-005 に対応します。

### 6. ADR / response-r1 / README / CHANGELOG とコードの一致

ADR-0014 の path strict decode、safe display、二段階 write、submodule displayed-side、`core.precomposeunicode=false` の大枠はコードに反映されています。response-r1 と CHANGELOG も、何を変更したかという列挙自体は source diff と概ね一致します。

ただし、以下は一致していません。

- ADR-0014:61-65 と response-r1 は backtick を置換して「中身から backtick をなくす」と説明しますが、実コード `escapeInline()` は backslash + **実 backtick** を残します（R2-005）。
- ADR-0014:37-40 は every input の fail-closed raw check を説明しますが、`--range` / `--doc` metadata は描画前 raw check から漏れます（R2-006）。
- ADR-0014:46-50 / response-r1 は rollback の完全性を説明しますが、remove failure と finalize cleanup failure の state は保証できていません（R2-003）。
- CHANGELOG:10 の「5件すべてに対応」は原指摘レベルでは 3 解消 / 2 部分解消という今回の判定とは一致しません。
- README:30,45 はそもそも v0.4.0 / R1 待ちのままで、package v0.4.1 / R1 applied と不一致です（R2-008）。

ZIP の binary format 自体については、local/central header の既存 unit test に加え `unzip` と Python `zipfile` を使う相互運用テストが追加されており、今回 ZIP format の新たな不整合は見つけませんでした。R2-004 は generator ではなく test harness の portability 問題です。

---

## 5. 確認範囲・実行した再現

- 提供 ZIP 内の `review-packet-m2-1-r2.md` に収録された **Request、Previous Reviews、Diff、Full Source、tests、Verification、docs** を読み、R1 の原文と v0.4.1 の実装を照合しました。
- 「既知の範囲外」に列挙された項目は新規指摘から除外しました。
- commit message、`docs/reviews/m2-1/response-r1.md`、CHANGELOG、Verification PASS は、実装の正しさの根拠としては使用していません。説明とコードが一致するかの比較対象としてのみ使用しました。
- R2-002 は parent symlink alias を使った `writeTogether` 相当の最小再現を実行し、2 path の最終内容がともに ZIP 側 data になることを確認しました。
- R2-003 は commit 2 個目 failure + rollback remove failure の最小再現を実行し、エラーが「restored」と言う一方で packet が残ることを確認しました。
- R2-004 は Python があるが `shasum` がない PATH を作って現テストと同じ `spawnSync` 式を実行し、`stdout === undefined` から TypeError になることを確認しました。
- R2-005 は CommonMark-compatible parser で、backslash + backtick が code span delimiter を無効化しないことを最小再現しました。
- R2-006 は U+2028 を含む Git ref と tree path を Git 自体が受理・解決できる前提を最小 repo で実行確認しました。aiqh 本体の end-to-end はコード読解による判定です。
- R2-007 は未実行で、control-flow のコード読解による指摘です。
- 提供物は review packet 1 ファイルで repository checkout そのものではないため、`npm test` 全体や `aiqh review-packet` の完全 end-to-end suite はこちらでは実行していません。
