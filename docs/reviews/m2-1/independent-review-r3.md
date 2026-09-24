<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-1-r3-for-claude.md、2026-09-23 付、32,840 バイト）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 02b16458dfe1b8475c2d84b0e34bc2be7567a747ecb8434e008d765d19185c63
-->

# independent review — M2-1 R3

## 1. 総評

R2 の 8 指摘は、原指摘の中心原因について **6 件が解消、2 件が部分的に解消、未解消 0 件**と判断しました。R2-001/003/004/005/006/008 はコードと回帰テストで中心修正を確認できています。
一方、R2-002 の同一実体判定には判定後に親シンボリックリンクを差し替えられる TOCTOU が残り、既存ファイルを失い得るため **High 1 件**です。
さらに、R2-007 の「finding 優先」が検査不能状態を覆い隠す経路、malformed `latest.json` の検査順、`Checked` / `Md` の構造保証、オプション一覧テスト、外部コマンド監査テストに **Medium 5 件**を指摘します。**Low 0 件**です。
Verification の PASS、commit message、`response-r2.md`、CHANGELOG の説明は正しさの根拠には使わず、Full Source とテストを照合し、TOCTOU・Git object 欠損・TypeScript brand・静的テストの正規表現について最小再現も行いました。

## 2. R2 の各指摘の解消状況

### M2-1-R2-001 — 解消

**根拠:** `src/commands/review-packet.ts:71-87, 147-173, 189-194`、`src/review/zip.ts:10-17, 39-51`、`tests/regression-m2-1-r2-001-zip-entry-name.test.ts:54-106`

明示 `-o` の basename は `OPTION_INVENTORY.output` から `checkValue()` を通り、既定名も ZIP 作成前に `checkValue()` を通っています。ZIP writer の entry name も型上 `Checked` です。秘密の形・禁止文字を含む basename を exit 1 にする回帰テストも、`--zip` あり/なし・JSON 出力まで直接確認しています。

R2 で問題だった「ASCII 形式だけ通して ZIP metadata に未検査の名前を入れる」経路は解消しています。

### M2-1-R2-002 — 部分的に解消

**根拠:** `src/commands/review-packet.ts:185-187, 337-356, 388-430`、`tests/regression-m2-1-r2-002-same-target.test.ts:57-101`

親ディレクトリの `realpath`、存在しない親では最も近い既存祖先、NFC、小文字化による比較が入り、静的な symlink alias、case-only difference、未作成親のケースは改善されています。

ただし同一性の比較は `writeTogether()` に入る前の 1 回だけで、その後の prepare / backup / install は元の path を再解決して行います。判定後に親 symlink が別ディレクトリへ差し替わると、比較時には別 target だった 2 path が書込み時には同じ実体を指せます。最小再現で既存内容が失われ、最後に ZIP 側 bytes が残ることを確認しました。新規 **M2-1-R3-001** です。

### M2-1-R2-003 — 解消

**根拠:** `src/commands/review-packet.ts:376-468`、`tests/regression-m2-1-r2-003-rollback-reporting.test.ts:80-140`

確定点は「新 packet と ZIP の両方を install 済み」と明示され、確定前の rollback では新規 file の除去、backup の復元、temp の除去の失敗を集約します。すべて成功した場合だけ `the previous files were restored` を出します。確定後の backup cleanup failure は exit 0 + warning + `backupsRetained` です。

R2 で指摘した「rollback remove failure を握りつぶす」「commit 済みなのに cleanup failure で exit 2」の双方は修正されています。R3-001 の TOCTOU は target identity の問題であり、この rollback 状態機械そのものの再発とは分けて評価しました。

### M2-1-R2-004 — 解消

**根拠:** `tests/zip-interop.test.ts:7-8, 20-21, 49-61`、`tests/regression-m2-1-r2-004-external-commands.test.ts:41-78`

Python `zipfile` test の expected SHA-256 は `node:crypto` に変わり、元の未確認 `shasum` 依存はありません。PATH を絞って affected tests を走らせる動的テストも追加されています。

したがって R2-004 の具体的な self-destruct は解消です。ただし「今後も未宣言 external command を検出する」ために追加された静的テストは、single quote や変数経由の command を見逃します。これは新規 **M2-1-R3-006** として別に指摘します。

### M2-1-R2-005 — 解消

**根拠:** `src/review/packet.ts:210-226, 252-270`、`tests/regression-m2-1-r2-005-inline-backtick.test.ts:105-115`

`escapeInline()` は U+0060 を実 backtick のまま残さず ASCII の `\u{60}` 表記へ変換するようになっています。LF/TAB/backslash も構造を作れない表記へ変換し、1 個の backtick delimiter を安全に使える形です。

回帰テストも fence 外の backtick run と各 metadata value が 1 code span に収まることを確認しており、R2-005 の原問題は解消しています。

### M2-1-R2-006 — 解消

**根拠:** `src/commands/review-packet.ts:71-87, 257-278`、`tests/regression-m2-1-r2-006-range-doc-check.test.ts:75-130`

`--range` と `--doc` は `OPTION_INVENTORY` の `rendered` として、Git を動かす前に raw character / secret shape の `checkValue()` を通ります。U+2028/U+202E 相当の ref/path、秘密の形、通常値の control case がテストされています。

R2 で指摘した「renderer が ASCII notation に変えた後では stage 2 で見つからない」という経路は解消しています。

### M2-1-R2-007 — 部分的に解消

**根拠:** `src/review/packet.ts:592-606, 619-686, 710-757`、`src/commands/review-packet.ts:145-155`、`tests/regression-m2-1-r2-007-findings-before-errors.test.ts:80-188`

invalid/raw Git path を content/size より先に独立 pass で検査するため、R2 の「invalid path + oversized blob が exit 2」という直接の問題は直っています。content finding と size/doc/latest error の deferred ordering も実装されています。

しかし、path finding が 1 件出ると `src/review/packet.ts:601` で即 return するため、その後にしか分からない Git object 欠損など「検査そのものができない状態」を調べません。また `runReviewPacket()` は option finding があれば `src/commands/review-packet.ts:149` で request/review 読取りより前に exit 1 します。このため、人間の要件「他の入力を検査できないなら 2」を満たさない組合せがあります。新規 **M2-1-R3-002** です。

さらに malformed `latest.json` は JSON parse 前に raw-character / secret scan をしていないため、parse 可能性とは無関係に検査できる finding が error 2 に隠れる経路があります。新規 **M2-1-R3-003** です。

### M2-1-R2-008 — 解消

**根拠:** `package.json:3`、`README.md:28-45`、`CHANGELOG.md:8-31`、`tests/regression-m2-1-r2-008-version-consistency.test.ts:29-36`

package version は 0.4.2、CHANGELOG 最新 heading も v0.4.2、README の「現在の状態」と review-packet 行も v0.4.2 で一致しています。version consistency test も 3 箇所を比較しています。R2-008 は解消です。

---

## 3. 新しい指摘

### ID：M2-1-R3-001
- **重大度：High**
- **対象：** `src/commands/review-packet.ts:185-187, 337-356, 403-430`、`tests/regression-m2-1-r2-002-same-target.test.ts:57-101`
- **内容：** packet と ZIP の同一実体判定に TOCTOU があります。`targetIdentity()` で別 target と判定した後、`writeTogether()` が prepare / backup / install するまでの間に親 symlink を差し替えると、2 つの pathname が同じ実体へ収束できます。結果として同一ファイルへ packet と ZIP を二重 install し、既存ファイルを正常終了のまま失うことがあります。
- **根拠：**

```ts
if (zipPath !== null && targetIdentity(zipPath) === targetIdentity(output)) {
  return fail("--zip-output resolves to the same file as the packet path ...");
}

const { retainedBackups } = writeTogether(targets, options.writeHooks);
```

```ts
function targetIdentity(p: string): string {
  ...
  return path.join(realpathSync(dir), ...rest).normalize("NFC").toLowerCase();
}
```

```ts
for (const t of targets) {
  ...
  mkdirSync(path.dirname(t.path), { recursive: true });
  ...
}
...
renameSync(t.path, bak);
...
renameSync(tmps.get(t) ?? "", t.path);
```

identity check と実際の rename は同じ filesystem object を固定していません。`realpathSync()` で得た結果も comparison に使うだけで、その canonical path 自体を write target として保持していません。

- **再現手順：実行確認あり（現行アルゴリズムの最小再現）**
  1. `A/` と `B/` を作り、`alias -> A` の directory symlink を作る。
  2. packet path を `alias/same.md`、ZIP path を `B/same.md` にする。比較時は `A/same.md` と `B/same.md` なので別 target。
  3. `B/same.md` に既存内容 `OLD` を置く。
  4. identity check の後、prepare 前に `alias -> B` へ差し替える。
  5. 現行 `writeTogether()` と同じ backup/install 順序を実行する。
  6. **期待：** 書込み開始前の再検証で同一実体を検出して exit 2。`OLD` は byte-for-byte 不変。
  7. **実際：** packet と ZIP が同じ `B/same.md` を順に置換し、最終内容は ZIP 側 bytes。`OLD` は backup cleanup により消える。正常成功扱いになる。
- **修正案：** comparison 用 canonicalization と write target を分離しない。少なくとも prepare で parent を作り終えた後、既存 target を触る直前に両 target identity を再評価し、一致なら temp を除去して exit 2 にする。より強い保証を求めるなら、canonical parent を固定した descriptor / inode ベースの操作や `openat` 相当で「判定した directory」と「rename する directory」を同一にする。単なる再チェックだけでは競合 window は縮むだけなので、ADR で保証レベルを明確にする。
- **回帰テスト案：** `writeHooks` とは別に identity-check 後 / prepare 前の test hook を設け、そこで parent symlink を A から B へ差し替える。修正前は exit 0 かつ既存内容消失、修正後は exit 2・既存 file 不変・packet/ZIP/temp/backup の余計な残存なしを確認する。

### ID：M2-1-R3-002
- **重大度：Medium**
- **対象：** `src/commands/review-packet.ts:145-155`、`src/review/packet.ts:592-606, 641-679`、`tests/regression-m2-1-r2-007-findings-before-errors.test.ts:80-188`、`docs/adr/0014-review-packet.md:69-71`
- **内容：** 「finding を error より先にする」実装が、**まだ検査できていない入力があり、その検査が後で不可能になる場合**にも早期 exit 1 します。人間の要件は「検査そのものができない場合は 2」ですが、path finding は content/blob を読む前に即 return し、option finding は request/review を読む前に即 return します。
- **根拠：**

```ts
const opt = checkOptionValues(options, cwd, security);
if (opt.findings.length > 0) return rejected(opt.findings);
...
if (options.request !== undefined)
  packetOpts.request = { ..., bytes: readInput(...) };
```

```ts
// paths first
...
if (ck.findings.length > 0) return { ok: false, findings: ck.findings };

// content/blob access happens only below
...
const size = blobSize(root, blob);
...
const bytes = blobBytes(root, blob, size);
```

したがって、既に分かった finding が「この後の inspection が実行可能か」の確認まで止めます。これは単なる finding 集約不足ではなく、exit 2 とすべき repository/input failure を exit 1 に置き換え得ます。

- **再現手順：一部実行確認あり**
  1. base commit を作る。
  2. 次 commit に、禁止文字 U+202E 相当を含む path と、通常 path の blob を追加する。
  3. commit 後、通常 path の loose blob object を削除して repository を破損させる。
  4. Git 単体で `git diff --raw -z` と `git diff-tree ... --name-only` は **exit 0**、一方その blob の `git cat-file -s` は **exit 128** になる状態を実行確認した。
  5. 現コードでは path pass で raw-character finding を得た時点の line 601 で return するため、blob 欠損には到達しない。
  6. **期待：** 検査完遂不能なので exit 2。少なくとも「finding はあるが inspection incomplete」を exit 1 の完全な検査結果として返さない。
  7. **実際：** exit 1 の path finding だけを返すコード経路になる。aiqh end-to-end はパケットに repository checkout が含まれないため未実行で、Git の前提状態は実行確認済み。
  8. 同じ構造は、secret-shaped output basename 等の option finding + clean name の unreadable `--request` でも line 149 が先に返るため生じる。
- **修正案：** 「finding 優先」と「inspection 完遂可能性」を別概念にする。危険な値を Git に渡さない制約は維持しつつ、独立して preflight できる request/review readability、cwd/repository 状態等は先に確認する。path pass 後も、finding を持ったまま安全に確認できる object existence / readable prerequisites を preflight し、検査不能なら exit 2 にする。exit 1 は「必要な検査を完遂できた上で finding がある」ときだけにする。
- **回帰テスト案：**
  - raw/invalid path finding + 別の changed blob object 欠損 → exit 2。
  - output filename finding + 別の clean-name `--request` missing/unreadable → exit 2。
  - finding + 単なる size limit / nonexistent `--doc` のように「検査は可能で、結果として deferred error」だけなら exit 1、という対照も残す。

### ID：M2-1-R3-003
- **重大度：Medium**
- **対象：** `src/review/packet.ts:866-903`、`tests/regression-m2-1-r2-007-findings-before-errors.test.ts:150-159`、`docs/adr/0014-review-packet.md:33-46, 69-71`
- **内容：** malformed `latest.json` は strict UTF-8 decode の後、raw-character / secret-shape scan より先に `JSON.parse()` されます。parse に失敗すると検査対象 text を scan せず deferred error にして返すため、**JSON として壊れていても文字列としては検査可能な finding** が exit 2 に隠れます。
- **根拠：**

```ts
const decoded = decode(ck, readFileSync(file), source);
if (decoded === null) return md``;

try {
  report = JSON.parse(decoded) as VerificationReport;
} catch {
  deferred.push("artifacts/verification/latest.json is not valid JSON");
  return md``;
}
```

raw/secret の `checkText()` は JSON parse 後の selected values に対して line 891 で初めて実行されます。したがって parse failure branch では一度も走りません。

既存 regression は「invalid JSON + **changed file 側**の secret finding」を検査しており、invalid JSON 自身に finding があるケースではありません。

- **再現手順：未実行（コード読解による）**
  1. `<to>` 用 repository の `artifacts/verification/latest.json` を UTF-8 としては正しいが JSON として不完全な text にする。
  2. その text の中へ、実ファイルでは `"AK" + "IA..."` を連結して作るような scanner 対象の形を含める。出力例には秘密の形そのものを記載しない。
  3. 他の入力は clean にする。
  4. **期待：** malformed かどうかにかかわらず読めた text の raw/secret 検査を行い、finding が分かるなら exit 1。値は表示しない。
  5. **実際：** `JSON.parse()` catch で deferred error になり、finding は作られず最終的に exit 2。
- **修正案：** decode 後、parse 前に少なくとも parse-failure 時に使える raw/secret scan を行う。重複 finding を避けるなら、まず parse を試し、失敗した場合だけ `checkText(ck, decoded, source, null)` を実行してから deferred error を積む。finding があれば既存 priority 規則で exit 1、無ければ exit 2 とする。
- **回帰テスト案：** malformed UTF-8-valid JSON text の中に、runtime で組み立てた secret shape、または U+2028 相当の禁止文字を含める。修正前は exit 2、修正後は exit 1・source=`verification (...)`・値非表示・packet/ZIP 未作成を確認する。clean malformed JSON は引き続き exit 2。

### ID：M2-1-R3-004
- **重大度：Medium**
- **対象：** `src/review/checked.ts:17-47`、`src/review/packet.ts:229-270`、`tests/regression-m2-1-r2-checked-inventory.test.ts:49-73`、`docs/adr/0014-review-packet.md:82-90`
- **内容：** `Checked` / `Md` は TypeScript の compile-time brand であり、現在の構造テストでは「検査関数以外で作れない」を保証できません。`as Checked` という**文字列そのもの**だけを grep しているため、型 alias、`any`、`JSON.parse()` の `any` からの代入等で未検査文字列を `Checked` にできます。`Md` も同様に `any` で `md` template へ直接入れられます。
- **根拠：**

```ts
declare const checkedBrand: unique symbol;
export type Checked = string & { readonly [checkedBrand]: true };

return findings.length === 0
  ? { ok: true, value: value as Checked }
  : { ok: false, findings };
```

```ts
.filter((f) =>
  /\bas\s+(?:unknown\s+as\s+)?Checked\b/.test(readFileSync(f, "utf8"))
)
```

この regex は例えば `type C = Checked; const x = raw as C;` を検出しません。また TypeScript は `const x: Checked = JSON.parse(...)` を許します。

`md()` も型としては `Md | number` に制限されていますが、`any` はその制限を通過します。したがって「普通の誤実装を型エラーにしやすくした」改善ではありますが、「迂回できない構造」ではありません。

- **再現手順：実行確認あり**
  1. 現実装と同じ unique-symbol branded string を使う最小 TypeScript を作る。
  2. `render(raw as any)` と `const forged: Checked = JSON.parse('"unchecked"'); render(forged);` を書く。
  3. `tsc --strict --noEmit` を実行した。
  4. **期待（文書どおりの構造保証なら）：** type error。
  5. **実際：** `tsc_exit=0`。また `type C = Checked; raw as C` も現在の source-regex guard の対象外。
- **修正案：** TypeScript brand だけを security invariant と表現しない。少なくとも AST ベースの lint/test で、`checked.ts` 外の `Checked`/alias への assertion、unsafe assignment、`any` 経由を禁止する。より強くするなら `Checked` を module-private symbol を持つ object wrapper にして、renderer/ZIP 側で hidden brand を runtime 検証する accessor を通す。`Md` についても raw assertion/`any` の持込みを同様に禁止する。
- **回帰テスト案：** fixture または AST unit test に以下を入れ、guard が FAIL することを確認する。
  - `type C = Checked; const x = raw as C`
  - `const x: Checked = JSON.parse(...)`
  - `inlineCode(raw as any)`
  - `md`${raw as any}``
  現在の regex test では少なくとも前 3 種を十分に検出できません。

### ID：M2-1-R3-005
- **重大度：Medium**
- **対象：** `src/commands/review-packet.ts:48-87`、`tests/regression-m2-1-r2-checked-inventory.test.ts:30-39, 63-66`、`docs/adr/0014-review-packet.md:88-90`
- **内容：** `OPTION_INVENTORY` の「オプション追加を必ず検出する」テストは `review-packet --help` の text を正規表現で読む方式なので、CLI に登録されても help に出ない option、または short-only option を検出できません。したがって「全 CLI 入口を 1 か所へ登録し忘れるとテストが落ちる」という構造保証にはなっていません。
- **根拠：**

```ts
const r = spawnSync(process.execPath,
  [path.join(ROOT, "src", "cli.ts"), "review-packet", "--help"], ...);

for (const line of r.stdout.split("\n")) {
  const m = /^\s+(?:-\w,\s+)?--([a-z][a-z-]*)/.exec(line);
  ...
}
```

この regex は `--long-name` が help に出ていることを前提にしています。例えば short-only の `-x <value>` 行は match しません。Commander の hidden option も help text 自体へ出ないため集合比較に現れません。

現在の visible long options と inventory の対応に具体的な漏れは見つけていません。問題は、今回人間が要求した「追加・名前変更・別名などの変化を構造的に検出」のテスト強度です。

- **再現手順：未実行（テストコード読解による）**
  1. CLI に review-packet 用の short-only option、または help 非表示 option を追加する。
  2. `OPTION_INVENTORY` には追加しない。
  3. `registeredOptions()` は `--...` が help に現れないため新 option を集合へ追加しない。
  4. **期待：** inventory consistency test が FAIL。
  5. **実際：** 当該追加を検知できない構造であり、既存 inventory と help 由来集合が同じままなら PASS する。
- **修正案：** help text を parse せず、Commander の review-packet `Command` object を test から取得して `.options` と各 option の `attributeName()` を直接比較する。CLI 構築を `buildCli()` / `buildReviewPacketCommand()` のような side-effect-free factory に分離し、hidden option も含む登録実体を inventory と比較する。short alias/long option の対応も object metadata で確認する。
- **回帰テスト案：** test fixture で hidden option と short-only option を 1 つずつ command object に追加し、inventory 未登録なら consistency check が FAIL することを確認する。visible long option の rename/add の既存確認も残す。

### ID：M2-1-R3-006
- **重大度：Medium**
- **対象：** `tests/regression-m2-1-r2-004-external-commands.test.ts:37-54, 57-78`
- **内容：** 「tests/ が未確認 external command を使わない」静的 guard が、double-quoted literal command しか検出しません。single quote、変数経由、式経由の command は見逃します。また probed tool も、そのファイル内のどこかに `it.skipIf(` が 1 個あるだけで許可するため、**その command invocation がその probe で guard されていること**を確認していません。動的テストも対象 3 ファイルだけなので、この静的 guard をすり抜けた別 test file は検出できません。
- **根拠：**

```ts
const pattern =
  new RegExp(`\\b(?:${CALLS})\\(\\s*"([^"]+)"`, "g");

...
if (PROBED.has(cmd) && src.includes("it.skipIf(")) continue;
```

```ts
[... "vitest.mjs", "run",
 "tests/zip-interop.test.ts",
 "tests/regression-m2-1-sp3.test.ts",
 "tests/review-packet.test.ts"]
```

- **再現手順：実行確認あり（静的 regex の最小再現）**
  1. 現 test と同じ regex を使い、次の 3 形式へ適用した。
     - `spawnSync("shasum", [])`
     - `spawnSync('shasum', [])`
     - `const cmd = "shasum"; spawnSync(cmd, [])`
  2. **期待：** 3 形式すべて、未宣言 external command として検出。
  3. **実際：** double quote 形式だけ `shasum` を検出し、single quote と変数形式は 0 件だった。
  4. 現在の changed tests 内に新たな未確認 external command があることは確認していません。これは再発防止テストが要件を十分検証できない指摘です。
- **修正案：** source regex ではなく TypeScript AST で `child_process` の CallExpression を追う。少なくとも string literal は quote 種別を問わず検出し、identifier は定数解決する。より保守しやすいのは external process 起動を test helper へ集約し、直接 `node:child_process` を import する test を whitelist 以外禁止する方式。probed tool は「同じ test が対応する availability boolean を `it.skipIf` に使う」ことまで構造的に確認する。
- **回帰テスト案：** guard 自身への fixture として single-quoted command、const variable command、unrelated `it.skipIf(false)` がある file 内の unguarded `python3` を与え、すべて FAIL することを確認する。

---

## 4. 指摘ではないが確認した点 — 「特に見てほしい点」7 項目

### 1. 検査済みの型、Markdown template、数値・派生値

`PacketOptions` の range/label/request/review/doc/exclude、Git path/status、commit metadata、SHA/hash/version/time、verify の表示値が `Checked` へ寄せられ、`md` template の interpolation は `Md | number` に限定されていることを確認しました。`maxFile` / `maxPacket` は `Number.isSafeInteger()` で検証され、commit/file 数は配列長、Git blob size は Git の数値出力から得るため、`latest.json` の自由値を「number 扱いだから未検査」のまま template に直接入れている箇所は今回の変更範囲では見つけませんでした。

一方、「Checked は検査関数以外では作れない」「unchecked string は type error になる」という**絶対的な構造保証**は TypeScript brand + grep では成立しません。これは R3-004 としました。現在の source に実際の `as C` / `JSON.parse` 代入による forged Checked が存在することを示す指摘ではなく、要求された再発防止構造が迂回可能という指摘です。

### 2. 入口の一覧のテスト

現在の visible long options は `OPTION_INVENTORY` に 14 種類あり、range/label/exclude/doc/request/review/output は rendered、cwd/zipOutput は path、config、number、flag へ分類されています。追加・rename された通常の `--long-option` は help 差分として検出できます。

ただしテストは help text の `--long-name` だけを読むため、hidden / short-only 入口を保証できません。R3-005 としました。`-o` のような既存 short alias は long `--output` と同じ Commander attribute を使う限り現在の inventory 経路へ入ります。

### 3. R2-002：存在しない親、NFC、小文字化、TOCTOU

存在しない parent は最も近い既存祖先まで上がって残り component を戻し、`realpath + normalize("NFC") + toLowerCase()` で比較する実装を確認しました。static symlink parent、case-only、case-only parent、未作成 parent の回帰テストもあります。安全側の false reject は依頼どおり指摘していません。

ただし comparison と write が同じ filesystem identity に固定されていないため TOCTOU が残り、実際に同一実体への二重書込み・既存内容消失を最小再現しました。R3-001 です。

### 4. R2-003：確定点、rollback、表示と実ファイル

`writeTogether()` の状態遷移を prepare、backup、install、rollback、commit point 後 cleanup まで追いました。確定前の rollback failure は残存物を `left` に集め、「restored」は `left.length === 0` の場合だけです。確定後 backup cleanup failure は new files を取り消さず retained backup として返し、caller が exit 0 + warning / JSON `backupsRetained` を出します。

R2-003 の回帰テストは「ZIP install + packet remove の二重失敗」「全 rollback 成功」「確定後 cleanup failure」「JSON warning」「通常成功」を実際に状態まで確認しています。この状態機械自体には新しい指摘を見つけませんでした。R3-001 の symlink race が発生すると前提となる「targets が別実体」が壊れるため、それは R2-002 側の問題として扱いました。

### 5. R2-007：finding 優先と「検査できないなら 2」

path pass を最初に分離し、size/doc/latest JSON error を deferred にした考え方は確認しました。しかし line 601 の path finding early return と line 149 の option finding early return により、後続 inspection が可能かを確かめる前に exit 1 になります。

Git の raw/tree listing は成功するが blob access は失敗する破損 repo を実際に作れることも確認しました。このため「検査不能なら 2」の条件を構造的には満たしていません（R3-002）。

また malformed latest JSON の raw/secret scan が parse 後にしかないため、検査自体は可能な finding が JSON error に隠れる逆方向の抜けもあります（R3-003）。

### 6. R1/R2 と同種の問題が別場所に残っていないか

- ZIP entry basename の未検査という R2-001 と同じ**具体的な leak**は見つけませんでした。
- Markdown backtick の R2-005 は U+0060 を notation 化しており、具体的な再発は見つけませんでした。
- range/doc の R2-006 は inventory 経由へ統合されています。
- 同じ種類の「列挙型 guard の盲点」は、Checked の source regex、option inventory の help parser、external-command の regex guard に残っています。これを R3-004〜006 としました。
- Git path strict UTF-8、submodule displayed-side、output safe display 等、R1 で直した箇所について今回の diff から新しい再発は見つけませんでした。
- 「既知の範囲外」に列挙された 8 項目は指摘対象から除外しました。

### 7. 回帰テストの修正前 FAIL と docs の一致

R2-001〜008 の個別 regression test が、R2 で説明された旧挙動を直接突く形になっているかを source で確認しました。001 の secret output basename、002 の static alias/case、003 の rollback/cleanup failure、004 の PATH 制限、005 の backtick、006 の range/doc、007 の path+size、008 の version mismatch は、それぞれ旧ロジックなら少なくとも主 failure case が FAIL する形です。Verification の「PASS」はこの判断には使っていません。

ただし、再発防止の**構造テスト**は十分でないものがあります。
- Checked forge 防止: R3-004
- option inventory completeness: R3-005
- external command completeness: R3-006

docs は version 表記（README / package.json / CHANGELOG）、backtick notation、rollback commit point、range/doc precheck の大枠はコードと一致しています。一方、
- ADR-0014:83-90 の「`checkValue` だけが Checked を作る」「option を足して inventory に入れ忘れると test が落ちる」は R3-004/005 の理由で保証を言い過ぎています。
- ADR-0014:69-71 は「中身の検査前に読めない input は exit 2」とする一方、`response-r2.md:73` は「filename finding + unreadable file は exit 1」と記録しており、人間の今回の要件とも不整合です（R3-002）。
- `response-r2.md` / CHANGELOG の R2-002・R2-007「対応済み」という記述は、今回の判定では部分的解消です。

---

## 5. 確認範囲と実行した再現

- 提供 ZIP 内の `review-packet-m2-1-r3.md` 1 ファイルを展開し、**Request、Previous Reviews、Diff、Full Source、tests、Verification、docs** を読みました。
- Full Source として含まれた変更ファイル 29 件をファイル単位に復元し、記載された実ファイル行番号で照合しました。
- commit message、`docs/reviews/m2-1/response-r2.md`、CHANGELOG、Verification PASS は、説明と source の一致を見るためにだけ使い、正しさの根拠にはしていません。
- R3-001 は directory symlink を判定後に A から B へ差し替える最小書込み再現を実行し、既存 `OLD` が失われ最終的に ZIP 側 bytes が残ることを確認しました。
- R3-002 は Git repository から blob object を削除し、同じ状態で `git diff --raw -z` と `git diff-tree --name-only` が exit 0、`git cat-file -s <blob>` が exit 128 になることを実行確認しました。aiqh end-to-end は repository checkout が提供されていないためコード読解です。
- R3-004 は branded string を `any` / `JSON.parse()` 経由で作る最小 TypeScript を `tsc --strict --noEmit` に通し、exit 0 を確認しました。
- R3-006 は現 regression と同じ command regex を double quote / single quote / variable の 3 形式へ適用し、double quote だけが検出されることを実行確認しました。
- R3-003 と R3-005 は未実行（コード・テスト読解による）です。
- 提供物は review packet であり repository checkout そのものではないため、こちらでは `npm test` / `aiqh verify` / `aiqh review-packet` の完全 suite は再実行していません。
