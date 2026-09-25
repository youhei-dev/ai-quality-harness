<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r1-for-claude.md、2026-09-25 付、29,986 バイト、対象範囲 v0.4.4..v0.5.0）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 52834d326c6e8881bd92a3c6c5cb92e4ee5626e606fe2296a01985b186c54e82
-->

# independent review — M2-2 R1

## 1. 総評

v0.4.4..v0.5.0 の変更を、実装 AI の説明・commit message・Verification の PASS を根拠にせず、パケット内の実コード・回帰テスト・ADR/README/ARCHITECTURE を突き合わせて確認した。
前回 5 件は **解消 2 件 / 部分的に解消 3 件 / 未解消 0 件**。新規指摘は **High 0 / Medium 6 / Low 1**。
中心となる終了コード判定、malformed `latest.json` の全文検査、`Checked` / `Md` の runtime fail-closed は改善している。一方、`Rejected --range` が独立に可能な work-tree 検査まで止める点、option alias の構造テスト、probe と `skipIf` の対応、最小 PATH の保証範囲と子プロセス停止に穴が残る。
このパケットは完全な repository checkout ではないため、全 Vitest / self verify は再実行していない。以下で「未実行」とした再現はコード読解による。

## 2. 前回指摘の解消状況

### M2-1-R3-002 — 部分的に解消

**根拠:** `src/commands/review-packet.ts:175-208`、`src/review/packet.ts:653-667, 692-787, 815-840`、`src/review/outcome.ts:59-64`。

option finding を得た直後や path finding を得た直後の早期 exit 1 は除去され、`--request` / `--review` の読取不能、missing object、unreadable `latest.json` 等は `InspectionError` として exit 2 が優先される。path finding のある changed file も blob id で内容を検査し、pathspec だけを飛ばす構造になっている。

ただし、`--range` が finding により `Rejected` になると `src/review/packet.ts:653-667` で **すべての Git 処理を返してしまい、range の値を使わず実行できる `rev-parse --is-inside-work-tree` まで飛ばす**。Request の「検出のある値に依存する処理だけを飛ばす」に対して範囲が広すぎるため、完全解消ではない。詳細は M2-2-R1-001。

### M2-1-R3-003 — 解消

**根拠:** `src/review/packet.ts:1004-1059`、`tests/regression-m2-2-r3-003-latest-json.test.ts:68-183`。

strict UTF-8 decode 後、JSON parse 失敗時は `unusable()` が `checkText()` を実行してから `DeferredError` を積むため、malformed JSON 自身にある秘密の形・禁止文字が finding として出る。`<to>` の clean result として描画する場合だけ zod shape を要求し、shape 不一致も全文検査後に deferred となる。read failure は `InspectionError` へ分類されている。

別途、存在確認に `existsSync()` を使うため「存在するが親ディレクトリを traverse できない」場合を absent と誤認し得る点を M2-2-R1-007 として指摘するが、R3-003 の主因であった「parse 前に本文を検査しない」は解消している。

### M2-1-R3-004 — 解消

**根拠:** `src/review/checked.ts:39-75`、`src/review/packet.ts:260-313, 357-403`、`src/review/zip.ts:39-53`、`tests/regression-m2-2-r3-004-brand-forgery.test.ts:70-113`。

`Checked` は `checkValue()` → `issue()` で process-local registry に登録され、`inlineCode` / `cellCode` / `plainOrCode` / ZIP entry は `assertChecked()` で未登録値を拒否する。`Md` も `issueMd()` / `assertMd()` で同様に fail closed になる。したがって TypeScript の assertion / `any` 等で brand が偽造されても、その文字列内容が一度も検査されていなければ描画・ZIP で `UncheckedValueError` になる。

静的 brand guard 自体には、brand 付き関数を unbranded callable type へ assertion してから呼ぶ形を直接列挙していない穴がある（M2-2-R1-004）が、runtime check が最終防壁になっており、R3-004 の「未検査文字列がそのまま出力へ到達する」問題は解消している。

### M2-1-R3-005 — 部分的に解消

**根拠:** `src/cli-program.ts:102-151`、`tests/regression-m2-2-r3-005-option-inventory.test.ts:21-68`、`docs/adr/0014-review-packet.md:103-108`。

`src/cli-program.ts` に side-effect-free factory が分離され、Command object の `.options` と `registeredArguments` を直接見るようになったため、hidden option、short-only option、位置引数の追加は検出できる。

一方、比較は `attributeName()` の集合と arity のみで、既存 option の **short alias の変更・削除**は検出しない。R3 の修正案にあった「short alias / long option の対応を metadata で確認」は満たしていない。詳細は M2-2-R1-002。

### M2-1-R3-006 — 部分的に解消

**根拠:** `tests/structure/process-guard.ts:33-163`、`tests/regression-m2-2-r3-006-external-commands.test.ts:21-90`、`scripts/test-minimal-path.ts:22-84`。

旧 regex より大幅に改善し、single quote、const variable、template literal、namespace import、element access、destructure、promisify 等の多くを TypeScript checker で追える。さらに全 test suite を PATH が node/git の symlink だけの環境で走らせる層が追加された。

ただし、(1) 複数 tool を同じ availability 変数に混ぜた probe を「各 tool 自身の probe」と誤認できる、(2) PATH 制限は絶対パス起動を禁止しないため `node -e` 等の文字列内から絶対パスを使う経路は最小 PATH でも止まらない、(3) timeout / signal 時に Vitest 本体だけを kill し descendants を停止しない、という穴がある。詳細は M2-2-R1-003 / 005 / 006。

---

## 3. 新しい指摘

### ID：M2-2-R1-001

- **重大度：Medium**
- **対象：** `src/review/packet.ts:653-667, 671-682`、`docs/adr/0015-review-packet-exit-priority.md:16-19, 31-35`、`tests/regression-m2-2-r3-002-exit-priority.test.ts:256-262`
- **内容：** `--range` に finding があると、その値に依存しない work-tree 検査まで飛ばすため、「検査不能 → finding」の優先順位を破る組み合わせが残っている。
- **根拠：**

```ts
const range = opts.range;
if (typeof range !== "string") {
  // The range has a finding: no git step can run ...
  checkHumanInputs(ck, opts);
  return {
    findings: ck.findings,
    ...
  };
}

const inside = runGit(opts.cwd, ["rev-parse", "--is-inside-work-tree"]);
if (inside.status !== 0 || inside.stdout.toString("utf8").trim() !== "true")
  throw new InspectionError(...);
```

`rev-parse --is-inside-work-tree` は rejected range の文字列を引数に使わないため、「finding のある値そのものに依存する処理」ではない。それでも current branch では到達しない。ADR-0015 は line 16-19 で「値に依存する検査だけを除く」と定義している一方、line 31-35 では `--range` Rejected 時に git 全体を飛ばすと記述しており、Request の判断と実装の両方に対して範囲が広すぎる。

既存 A10 テストは「range finding + missing blob」で、blob discovery 自体が range に依存するため exit 1 でも矛盾しない。range と独立な work-tree failure を組み合わせたケースが無い。

- **再現条件：未実行（コード読解による）**
  1. `--cwd` を Git work tree ではない既存ディレクトリにする。
  2. `--range` に禁止文字（例: U+202E）を含め、option pre-check で finding にして `Rejected` にする。
  3. `--request` / `--review` は無し、その他は clean。
  4. **期待：** range を使わず確認できる「not inside a git work tree」が検査不能なので exit 2。range finding は incomplete list として出す。
  5. **実際：** line 653-667 で Git preflight 全体を飛ばし、finding だけで最終的に exit 1 になり得る。
- **修正案：** range の値を使わない repository preflight（少なくとも `--is-inside-work-tree` と root 取得のうち安全に行えるもの）を Rejected 判定より前に行う。Rejected 後に飛ばすのは ref resolve、ancestry、range diff 等、range 値に依存する処理だけにする。ADR-0015 line 31-35 も「すべての git」ではなく依存範囲へ修正する。
- **回帰テスト案：** non-git cwd + rejected range → exit 2、`result:error`、range finding が incomplete、Git ref resolve は行わないことを固定する。対照として valid work tree + rejected range は従来どおり exit 1。

### ID：M2-2-R1-002

- **重大度：Medium**
- **対象：** `tests/regression-m2-2-r3-005-option-inventory.test.ts:28-38, 58-68`、`src/cli-program.ts:105-118`、`docs/adr/0014-review-packet.md:103-108`
- **内容：** option inventory の構造テストが short alias の変更・削除を検出しないため、R3-005 が求めた「別名を含む登録実体との対応」が未固定。
- **根拠：**

```ts
for (const o of cmd.options) {
  const name = o.attributeName();
  if (!keys.has(name)) out.push(...);
}
for (const k of keys)
  if (!cmd.options.some((o) => o.attributeName() === k)) out.push(...);
```

arity test も `o.required` / `o.optional` / parser の有無を見るだけで、`o.short` / `o.long` / `o.flags` の期待値は比較していない。例えば `-o, --output` を `-p, --output` に変更しても `attributeName()` は `output` のままで inventory mismatch は空になる。

- **再現条件：未実行（コード読解による）**
  1. `src/cli-program.ts` の `-o, --output <file>` を `-p, --output <file>` に変更する。
  2. `OPTION_INVENTORY` と test は変更しない。
  3. **期待：** CLI input surface の別名変更として consistency test が FAIL。
  4. **実際：** attributeName=`output`、arity も同じなので current tests は PASS する構造。
- **修正案：** inventory に canonical long name と許可する short alias（必要なら aliases 全体）を持たせ、Command option の `short` / `long` / `flags` と比較する。short alias を仕様として固定しない方針なら、その旨を R3-005 の解消条件と docs に明記し、「alias 変更を検出する」という期待を外す。
- **回帰テスト案：** clone した Command object の `output` option だけ short alias を `-p` に差し替え、inventory 未変更なら mismatch が出る test。`-c` alias の削除も同様に FAIL させる。

### ID：M2-2-R1-003

- **重大度：Medium**
- **対象：** `tests/structure/process-guard.ts:77-109, 134-155`、`tests/regression-m2-2-r3-006-external-commands.test.ts:34-39, 64-72`
- **内容：** probed tool と `skipIf` / `runIf` の対応が「その condition が参照する変数の initializer に tool 名が含まれるか」だけなので、複数 tool を 1 つの availability 変数へ混ぜると、各 tool の availability を個別に保証していなくても `guarded` と判定できる。
- **根拠：**

```ts
function conditionVariables(...) {
  // every identifier used by any skipIf / runIf condition
}

function probesTool(..., sym, tool) {
  // true if the variable initializer contains this tool string anywhere
}

...
else if (PROBED.has(command)) {
  const v = initializedVariable(checker, n);
  if (v !== undefined && condVars.has(v)) verdict = "probe";
  else if (guardConditions(n).some((cond) =>
    identifiersOf(checker, cond).some((s) => probesTool(checker, s, command))))
    verdict = "guarded";
}
```

例えば 1 つの `hasTools` initializer が python3 probe と unzip probe の OR を含み、`skipIf(!hasTools)` の中で python3 を使う形では、python3 の文字列が initializer にあるため guard は通る。しかし unzip だけ存在し python3 が無い環境では `hasTools=true` となり test が実行され、python3 availability は保証されない。

- **再現条件：未実行（コード読解による）**
  1. 1 変数の initializer に python3 probe と unzip probe を論理 OR で入れる。
  2. `it.skipIf(!hasTools)` の callback で python3 を起動する。
  3. **期待：** python3 専用 probe で guard されていないので violation。
  4. **実際：** `probesTool(hasTools, "python3")` が true になり `guarded` と判定する構造。
- **修正案：** probe を「1 tool = 1 availability symbol」に制限するか、initializer の論理式を解析して callback 実行条件が当該 tool の availability を必ず含意することまで確認する。実装を単純に保つなら `hasTool("python3")` helper と専用 boolean の形だけ whitelist する方が堅い。
- **回帰テスト案：** composite OR probe を fixture に追加し、python3 callback が violation になること。AND 条件や専用 `hasPython` の正常例も用意する。

### ID：M2-2-R1-004

- **重大度：Low**
- **対象：** `tests/structure/brand-guard.ts:42-55, 106-140`、`tests/regression-m2-2-r3-004-brand-forgery.test.ts:37-61`
- **内容：** brand guard は「brand 付き関数を unbranded callable type へ assertion してから呼ぶ」書き方を fixture で固定しておらず、AST rule 上も直接検出しない可能性がある。ただし current runtime `assertChecked()` が出力を止めるため、現状は fail-closed の安全性を破らない。
- **根拠：**

`hasBrand()` は union/intersection、property、generic type arguments、object propertiesを調べるが、**call signature の parameter / return type自体は走査しない**。assertion rule は assertion の target type に `hasBrand()` がある場合等だけを violation にする。

したがって概念上、`inlineCode` のような `(Checked) => Md` を assertion で `(string) => Md` 等へ広げ、その alias を呼ぶ形は、既存 `b18_method_bivariance` とは別経路である。実行時には最終的に `inlineCode()` 内の `assertChecked()` が未登録 string を拒否するので leak はしない。

- **再現条件：未実行（コード読解による）**
  1. fixture 内で `inlineCode` を、引数が plain `string` の callable type へ assertion する。
  2. その callable へ未検査 string を渡す。
  3. **期待（static guard の網羅性を上げるなら）：** `brandGuard()` が violation。
  4. **実際見込み：** target callable type の call signature を `hasBrand()` が調べないため static guard は見逃し得る。runtime は `UncheckedValueError` で止まる。
- **修正案：** `hasBrand()` で call / construct signatures の parameter と return type も辿るか、「brand を含む callable からより広い callable への assertion」を専用 rule で検出する。runtime layer は維持する。
- **回帰テスト案：** callable widening assertion fixture を追加し、typecheck は通るが brand guard が FAIL すること。加えて実際に呼んだ場合 `UncheckedValueError` になる runtime test を残す。

### ID：M2-2-R1-005

- **重大度：Medium**
- **対象：** `scripts/test-minimal-path.ts:37-40, 67-80`、`README.md:201-202`、`docs/ARCHITECTURE.md:443-448`
- **内容：** `test:minpath` は PATH 検索を node / git に限定するだけで、**絶対パスによる外部コマンド起動を禁止しない**。そのため docs の「`node -e` の文字列内など static guard が見えない起動も unit-minpath が確かめる」という保証は強すぎる。
- **根拠：**

```ts
const child = spawn(process.execPath, [VITEST, "run"], {
  cwd: ROOT,
  env: { ...process.env, PATH: bin, ... },
  ...
});
...
symlinkSync(process.execPath, path.join(bin, "node"));
symlinkSync(git, path.join(bin, "git"));
```

PATH を置換しても `/usr/bin/...` や `/bin/...` のような絶対パスは OS が直接開く。さらに environment は `{ ...process.env }` で丸ごと継承するため、外部 tool の絶対パスを持つ環境変数も残る。

README は line 201 で「PATH を node と git だけにした全テスト」を外部 command 不使用の確認と説明し、ARCHITECTURE line 445-446 は static に見えない `node -e` 文字列内の起動を `unit-minpath` が確かめるとしている。PATH 名解決の command なら正しいが、絶対パスには成立しない。

- **再現条件：未実行（コード読解による）**
  1. static guard が中身を見ない `node -e` 等の script string から、存在する外部 tool を絶対パスで起動する test を追加する。
  2. PATH は current `test:minpath` のまま。
  3. **期待：** node / git 以外を使えない検査なら test は失敗する。
  4. **実際：** absolute executable は PATH を参照しないため起動可能。
- **修正案：** 2 案ある。強い保証が必要なら、filesystem / process 起動を隔離できる container / sandbox 等で「許可 executable 以外を実行できない」環境にする。そこまでしないなら check 名と docs を「PATH 経由の未宣言 command を検出する」と正確に狭め、static guard の対象外で absolute path が残ることを trust boundary に明記する。環境変数も最小 whitelist にする方がよい。
- **回帰テスト案：** POSIX fixture で absolute path の harmless executable を `node -e` から起動し、強化後は起動不能になることを確認する。sandbox を採らない場合は逆に「この経路は保証外」である docs test / comment を固定する。

### ID：M2-2-R1-006

- **重大度：Medium**
- **対象：** `scripts/test-minimal-path.ts:37-64, 73-80`
- **内容：** timeout / SIGINT / SIGTERM 時に kill するのは Vitest の直接 child PID だけで、test が起動した descendant process を停止しない。Request の「タイムアウト・シグナル時の子プロセスの停止」を満たさず、終了後に外部 process が残る可能性がある。
- **根拠：**

```ts
const child = spawn(process.execPath, [VITEST, "run"], { ... });
...
const stop = (code: number): void => {
  result ??= code;
  child.kill("SIGKILL");
};
```

`child.kill()` はその PID へ signal を送るだけで、その process が spawn した test subprocess 群を process group として kill していない。`finally` は PATH 用 temporary directory を削除するが、descendant process の終了待ちや group cleanup はしない。

- **再現条件：未実行（コード読解による）**
  1. test fixture が node child を起動し、その child が十分長く sleep / wait する descendant を起動する。
  2. `test:minpath` を timeout させる、または parent script へ SIGTERM を送る。
  3. **期待：** Vitest と test subprocess 群がすべて停止してから script が終了し temp dir を消す。
  4. **実際見込み：** Vitest PID は SIGKILL されるが descendant は独立して残り得る。
- **修正案：** POSIX 対象であることを利用し、Vitest を独立 process group で起動して timeout / signal 時は group 全体へ終了 signal を送る。必要なら TERM → grace → KILL とし、close だけでなく group cleanup 完了を待つ。あるいは既存 runner の process-group helper を再利用する。
- **回帰テスト案：** descendant が PID / marker を一時ファイルへ記録する専用 fixture を作り、timeout / SIGTERM 後にその PID が存在しないことを確認する。temp directory も残らないことを合わせて確認する。

### ID：M2-2-R1-007

- **重大度：Medium**
- **対象：** `src/review/packet.ts:1011-1017`、`tests/regression-m2-2-r3-003-latest-json.test.ts:167-183`
- **内容：** `latest.json` の存在確認に `existsSync()` を使うため、ENOENT 以外の理由で path を stat できない場合も `false` となり得て、「unreadable = InspectionError」ではなく「absent」として packet を書く経路がある。
- **根拠：**

```ts
const file = path.join(root, "artifacts", "verification", "latest.json");
if (!existsSync(file)) return { kind: "absent" };
let bytes: Buffer;
try {
  bytes = readFileSync(file);
} catch (err) {
  throw new InspectionError(...);
}
```

`existsSync()` は path access / stat の失敗理由を呼び出し側へ返さず false に畳む。例えば POSIX で parent directory に traverse permission が無い場合、file が実在していても exists check が false になり、`readFileSync()` の catch へ到達しない可能性がある。

既存 regression の unreadable case は `latest.json` を directory にして EISDIR を起こすため `existsSync()` は true になり、この経路を検証していない。

- **再現条件：未実行（コード読解による）**
  1. `artifacts/verification/latest.json` を作成する。
  2. 実行ユーザーが親 directory を traverse できない状態にする（POSIX permission 等）。
  3. 他の packet inputs は clean。
  4. **期待：** latest.json の有無・内容を確認できないため InspectionError / exit 2。
  5. **実際見込み：** `existsSync(file) === false` で `kind:"absent"` となり、他に問題がなければ packet を書き得る。
- **修正案：** existence precheck をやめて `readFileSync()` を直接行い、catch で `ENOENT` のときだけ `absent`、それ以外は `InspectionError` にする。file type を分けたい場合も `lstatSync` 等で ENOENT だけ特別扱いする。
- **回帰テスト案：** permission を落とした parent directory を使える POSIX test を追加し、exit 2 を確認する。CI 権限上 permission test が不安定なら、fs wrapper / injectable reader で `EACCES` を返す unit test を用意する。

---

## 4. Request の「特に見てほしい点」1〜9 の確認結果

### 1. R3-002〜006 の 5 件がそれぞれ解消されているか

確認結果は以下。

- R3-002: **部分的に解消**。finding 後も大半の inspection は継続するが、Rejected range が range 非依存の work-tree check まで止める（M2-2-R1-001）。
- R3-003: **解消**。malformed / wrong-shape latest.json の読めた text は finding scan 後に deferred、read failure は InspectionError。
- R3-004: **解消**。runtime registry により forged brand は出力直前で fail closed。static guard に追加余地はある（M2-2-R1-004）。
- R3-005: **部分的に解消**。hidden / short-only / positional は検出するが short alias の変更を固定していない（M2-2-R1-002）。
- R3-006: **部分的に解消**。AST guard + min PATH は改善したが probe 対応、absolute path、descendant cleanup に穴がある（M2-2-R1-003 / 005 / 006）。

### 2. 終了コードの優先順位

`decideOutcome()` 自体は `inspection > finding > deferred` を正しく実装している。option finding の後に request/review read、path finding の後に blob inspection、content finding の後に latest read が続く主要経路も確認した。

問題は **判定関数ではなく inspection の到達範囲**で、Rejected range の branch が repository preflight 全体を止めるため、range に依存しない inspection failure が観測されない（M2-2-R1-001）。

finding のない deferred-only の場合は `inspection.render()` を実行し、組み立て後 finding と max packet bytes を得てから `decideOutcome()` している（`src/commands/review-packet.ts:199-208`）。その後 decision が deferred なら write へ進まないため、書き込み漏れは見つけなかった。

### 3. `Checked` / `Md` の実行時確認

`Checked` は `issue()` registry、`Md` は `issueMd()` registry を持ち、主要 renderer / Builder / ZIP entry で assert する構造を確認した。registry は Set<string> なので同じ内容が一度検査済みなら後の同内容 brand は通るが、ADR-0014 line 98 がこの性質を明記しており、内容ベースの安全性としては整合している。

packet source 本文は raw string のまま `Builder.fenced()` に入るが、それ以前の per-input check と、最後の whole-packet `checkText()` があるため、未検査経路を新たに見つけなかった。ZIP entry は `assertChecked()` がある。

static brand guard には callable widening assertion の追加余地を見つけた（M2-2-R1-004）が、runtime fail-closed により現状の output leak にはつながらない。

実行ごと・呼び出し順で出力 bytes が変わる要因は registry 自体には見つけなかった。registry は membership check のみで render text に順序や件数を出さない。

### 4. 型情報を使った構造テスト（brand / external command）

brand guard は旧 regex より強く、fixture も alias、`any`、type predicate、generic cast、Reflect.apply、covariant container 等を含む。新たに callable type への assertion 経路が fixture に無い点を確認した（M2-2-R1-004）。

process guard は child_process declaration へ解決される direct call の多くを追うが、probe 対応は variable initializer に tool 名が「含まれる」だけで認めるため、複数 tool の composite probe で誤許可できる（M2-2-R1-003）。既存 fixture の `f14_guarded_ok` は 1 variable = 1 tool だけで、この穴を検証しない。

### 5. 最小 PATH のチェック

`which("git")` で current git を見つけ、temporary dir に node/git symlink だけを作り、Vitest child の `PATH` をその dir に置換している点を確認した。PATH 名解決による undeclared tool は確かに起動できなくなる。

ただし filesystem sandbox ではないため absolute executable path は残る。environment もほぼ全継承なので、絶対 path を持つ環境変数も残る（M2-2-R1-005）。また timeout / signal 時は Vitest PID だけ SIGKILL し descendants を cleanup しない（M2-2-R1-006）。temporary PATH directory 自体は `finally` で削除する。

### 6. CLI の組み立て分割 (`src/cli-program.ts`)

`buildProgram()` 自身には parse、signal registration、version file read はなく、`src/cli.ts` がそれらを担当する分割を確認した。import-only regression は stdout/stderr、signal listener count、exitCode を確認している。

review-packet の Command object の hidden/short-only option と positional argument を直接列挙するため、旧 help parse の主欠陥は解消している。ただし short alias metadata の変化は比較していない（M2-2-R1-002）。

### 7. `latest.json` の扱い

invalid UTF-8 は decode finding、invalid JSON / rendered-result shape mismatch は全文 `checkText()` の後 deferred、別 commit / dirty / gitなしは No verify result、readFile error は InspectionError という分岐を確認した。valid `<to>` clean result は zod で tool/checks の container shape を確認し、実際に描画する values を check している。

`existsSync()` により「存在するが stat / traverse できない」状態を absent に畳み得る点を M2-2-R1-007 とした。既存 EISDIR test だけではこの条件を検証しない。

### 8. テストが要件を検証できているか

R3-002 regression は missing blob / request / latest / deferred の多くをよく固定しているが、Rejected range + range 非依存 inspection failure が無い。

R3-005 regression は hidden / short-only / positional を fixture で追加して FAIL 相当を確認するが、existing option の short alias change が無い。

R3-006 regression は多様な syntactic form を持つが、composite probe variable が無い。min PATH についても absolute path / inherited env と timeout descendants の専用 regression が無い。

R3-003 は malformed JSON 自身の secret / raw、clean malformed、invalid UTF-8、shape mismatch、unreadable EISDIR を分けており、主要件をよく検証している。

### 9. docs とコードの一致

ADR-0015 の priority table と `src/review/outcome.ts` は一致する。一方、ADR-0015 line 16-19 の「finding のある値に依存する検査だけ除外」という原則と、line 31-35 / code の「Rejected range なら git 全体を飛ばす」は Request の意図に対して過剰で、M2-2-R1-001 の問題を docs も追認している。

ADR-0014 の brand runtime registry の説明はコードと概ね一致し、static guard に未列挙穴が残り得ることも line 98 で明記している。

README line 201-202 と ARCHITECTURE line 443-448 は min PATH を「static に見えない node -e 内の起動も確かめる」層として説明しているが、absolute path の実行までは制限していないため、保証範囲を狭めるか実装を強化すべき（M2-2-R1-005）。

option inventory について ADR-0014 は current test の実態（attributeName、positional、arity）を正確に記述しているが、R3-005 の short alias metadata まで固定したとは言えない。

---

## 5. 確認範囲

主に以下を読んだ。

- `src/commands/review-packet.ts`
- `src/review/checked.ts`
- `src/review/outcome.ts`
- `src/review/packet.ts`
- `src/review/zip.ts`
- `src/cli-program.ts`
- `src/cli.ts`
- `scripts/test-minimal-path.ts`
- `tests/regression-m2-2-r3-002-exit-priority.test.ts`
- `tests/regression-m2-2-r3-003-latest-json.test.ts`
- `tests/regression-m2-2-r3-004-brand-forgery.test.ts`
- `tests/regression-m2-2-r3-005-option-inventory.test.ts`
- `tests/regression-m2-2-r3-006-external-commands.test.ts`
- `tests/structure/brand-guard.ts`
- `tests/structure/process-guard.ts`
- `tests/structure/typescript.ts`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/0014-review-packet.md`
- `docs/adr/0015-review-packet-exit-priority.md`

Verification の PASS は「既存テストが通った」という情報としてのみ扱い、上記の解消判定の根拠にはしていない。
