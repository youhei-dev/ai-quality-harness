<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r2-for-claude.md、2026-09-25 付、18,618 バイト、対象範囲 v0.5.0..v0.5.1）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: a50cbdddce5b521088e3baae32834e479237033b5ad829d69cffa567bda3475d
-->

# independent review — M2-2 R2

## 1. 総評

v0.5.0..v0.5.1 の変更について、`Request` の「特に見てほしい点」1〜8、対象となる前回指摘 M2-2-R1-007 / M2-2-R1-001、変更コード、回帰テスト、ADR / CONFIG_SPEC / README / ARCHITECTURE を相互に確認した。

前回指摘は **M2-2-R1-007: 解消、M2-2-R1-001: 解消** と判断する。`latest.json` と既定 config は `existsSync()` による存在判定をやめて ENOENT だけを「無い」とし、Rejected `--range` でも範囲に依存しない work-tree / root / human inputs / `latest.json` / version 系の検査を続ける構造になっている。

一方、v0.5.1 で新たに表面化する出力経路として **High 1 件**を指摘する。`security-scan` の既定 config 読取失敗時、`ConfigError` に含まれるパスの禁止文字が `escapeRawChars()` を通らず標準エラーへ出力され得る。新規指摘は **High 1 / Medium 0 / Low 0**。

パケットは完全な repository checkout ではなくレビュー用 Markdown 1 ファイルなので、プロジェクトのフルテストスイート自体は再実行していない。ただし、新規 High の前提となる Node.js の `readFileSync()` / ELOOP エラーメッセージについては最小再現を実行し、パス中の U+202E がエラーメッセージ内にそのまま残ることを確認した。

---

## 2. 前回指摘の解消状況

### M2-2-R1-007 — 解消

**対象:**
- `src/review/packet.ts:1028-1047`
- `tests/regression-m2-2-r1-007-unreadable-parent.test.ts:78-165`

`latest.json` の前段 `existsSync()` は削除され、直接 `readFileSync()` を行い、ENOENT だけを absent、それ以外を `InspectionError` とする実装になっている。

```ts
function readLatest(ck: Checker, root: string, deferred: DeferredError[]): Latest {
  const file = path.join(root, "artifacts", "verification", "latest.json");
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "absent" };
    throw new InspectionError(`cannot read artifacts/verification/latest.json: ${code ?? "error"}`);
  }
```

これにより、R1-007 の原因だった EACCES / ENOTDIR / ELOOP / EISDIR 等を「存在しない」と畳む経路は消えている。

回帰テストも、次を確認している。

- 親ディレクトリ EACCES: exit 2（root 実行時のみ skip）
- 親の親 EACCES: exit 2（root 実行時のみ skip）
- ENOTDIR: exit 2
- ELOOP: exit 2
- finding と読取不能の同時発生: exit 2 + findings は incomplete
- 本当に ENOENT: 従来どおり absent / exit 0
- 正常な `latest.json`: 従来どおり描画

root では permission test が skip されるが、ENOTDIR / ELOOP が同じ「non-ENOENT を InspectionError にする」分岐を非 skip で通しているため、分岐自体が未検証になる問題はない。

**判定: 解消**

---

### M2-2-R1-001 — 解消

**対象:**
- `src/review/packet.ts:655-688`
- `src/review/packet.ts:1028-1075`
- `src/commands/review-packet.ts:194-210, 257-303`
- `tests/regression-m2-2-r1-001-rejected-range-preflight.test.ts:83-222`

Rejected `--range` より前に、範囲値を使わない work-tree / root の確認を行うよう変更されている。

```ts
const range = opts.range;
const m = typeof range === "string" ? /^(.*?)\.\.(.*)$/.exec(range) : null;
if (typeof range === "string" && (!m || range.includes("..."))) {
  throw new InspectionError("--range must have the form <from>..<to>");
}

const inside = runGit(opts.cwd, ["rev-parse", "--is-inside-work-tree"]);
if (inside.status !== 0 || inside.stdout.toString("utf8").trim() !== "true") {
  throw new InspectionError(`not inside a git work tree: ${opts.cwd}`);
}
const root = gitOk(opts.cwd, ["rev-parse", "--show-toplevel"], "finding the repository root")
  .toString("utf8").trim();
```

Rejected branch では、その値やそこから得る SHA を Git 引数等へ渡さず、範囲に依存しない処理だけを継続している。

```ts
if (typeof range !== "string" || !m) {
  checkHumanInputs(ck, opts);
  readLatest(ck, root, deferred);
  derived(opts.toolVersion);
  derived(gitOk(root, ["--version"], "git --version").toString("utf8").trim());
  return {
    findings: ck.findings,
    deferred,
    git: null,
    root,
    label: opts.label ?? null,
    ...
  };
}
```

確認した範囲では、Rejected `--range` またはそれ由来の値が、ref 解決、pathspec、ファイルパス、差分・blob・commit 等の範囲依存検査に渡る経路はない。

逆に独立して実行できる処理として、work-tree、root、request / review、`latest.json` の read/decode/JSON parse、toolVersion、`git --version`、明示 `--label` がある場合の既定出力先確認が残されている。

回帰テストも、non-git cwd + Rejected range、missing cwd、読めない `latest.json`、blocked ref が Git に渡らないこと、range form を検査しないこと、壊れた `latest.json` の全文検査、toolVersion、root の取得を確認している。

**判定: 解消**

---

## 3. 新しい指摘

### ID: M2-2-R2-001

- **重大度:** High
- **対象:**
  - `src/config/load.ts:58-65`
  - `src/commands/security-scan.ts:25-40`
  - 対照: `src/commands/review-packet.ts:116-124`
  - テスト不足: `tests/regression-m2-2-r1-config-read.test.ts:106-220`

### 内容

v0.5.1 で既定 config の読取失敗を fail-closed にした結果、`security-scan` では `ConfigError` に含まれるファイルパスの禁止文字を安全表示せず、そのまま標準エラーへ出力できる。

`review-packet` は全出力を `escapeRawChars()` → `maskSecrets()` に通しているが、`security-scan` は `maskSecrets()` のみで、禁止文字を U+XXXX 表記へ変換していない。

そのため、例えば cwd のディレクトリ名に U+202E 等が含まれ、既定の `aiqh.config.jsonc` が ELOOP / EACCES 等で読めない場合、v0.5.1 で新たに発生する config error の標準エラーへその禁止文字が生で出る。

これは本レビューの High 基準「禁止文字が標準出力・標準エラーに出る」に該当する。

### 根拠

共通 reader は読取エラー時に、パスと Node の元エラーメッセージを `ConfigError` へ入れる。

```ts
// src/config/load.ts:58-65
function readConfigTextIfExists(absoluteConfigPath: string): string | null {
  try {
    return readFileSync(absoluteConfigPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ConfigError(
      `config file could not be read: ${absoluteConfigPath} (${(err as Error).message})`,
    );
  }
}
```

`security-scan` の output boundary は secret mask だけである。

```ts
// src/commands/security-scan.ts:28-31
const rawLog = options.log ?? ((line: string) => console.log(line));
const rawLogError = options.logError ?? ((line: string) => console.error(line));
const log = (line: string): void => rawLog(maskSecrets(line));
const logError = (line: string): void => rawLogError(maskSecrets(line));
```

config error はその経路へ渡る。

```ts
// src/commands/security-scan.ts:34-40
try {
  security = loadSecurityConfig(cwd, options.configPath);
} catch (err) {
  if (err instanceof ConfigError) {
    logError(`aiqh security-scan: ${err.message}`);
    return EXIT_ERROR;
  }
```

一方、`review-packet` は安全表示を先に行っている。

```ts
// src/commands/review-packet.ts:119-121
const log = (line: string): void => rawLog(safeText(line));
const logError = (line: string): void => rawLogError(safeText(line));
```

`safeText()` は `escapeRawChars()` を通すため、この差がそのまま出力境界の差になる。

### 再現条件

**一部実行済み。** Node.js の最小再現で、名前に U+202E を含む一時ディレクトリを作り、`aiqh.config.jsonc` を symlink loop にして `readFileSync(..., "utf8")` を実行した。ELOOP の `Error.message` と、そのパスを埋め込んだ `ConfigError` 相当文字列の双方に U+202E が生のまま残ることを確認した。

`security-scan` CLI 全体は、レビュー用パケットが完全な checkout ではないため未実行（残りはコード読解による）。

具体的な回帰条件:

1. cwd の名前に禁止文字 U+202E を含める。
2. `<cwd>/aiqh.config.jsonc` を symlink loop にする（ELOOP）。
3. `aiqh security-scan --cwd <cwd>` 相当を実行する。
4. **期待:** exit 2。標準エラー中の禁止文字は `U+202E` または既存の安全な ASCII 表記へ変換され、生の U+202E は 0 個。
5. **実際:** exit 2 にはなるが、`ConfigError` の path / Node error message に由来する U+202E が `maskSecrets()` を通過して生で標準エラーへ出得る。

同じ条件の `review-packet` は `safeText()` により安全表示されるため、この問題は `security-scan` 側の output boundary の不一致である。

### 修正案

`security-scan` も review-packet と同じ安全表示境界に揃える。

方針例:

- text / stderr: `escapeRawChars()` を行ってから `maskSecrets()`
- JSON: 文字列を再帰的に `escapeRawChars()` してから `maskDeep()`

可能なら各コマンドで個別実装せず、CLI 出力用の共通 safe-output helper に寄せる。

特に config error だけを局所修正するのではなく、`security-scan` が標準出力・標準エラーへ出すすべての文字列について同じ境界にする方が再発防止になる。

### 回帰テスト案

`tests/regression-m2-2-r1-config-read.test.ts` または専用 regression に次を追加する。

1. runtime で U+202E を組み立てる（ソースへ生文字を置かない）。
2. その文字を含む cwd を作る。
3. 既定 config を symlink loop にして ELOOP を発生させる。
4. `runSecurityScan()` の `logError` を捕捉する。
5. exit 2 を確認する。
6. 捕捉した出力に生の U+202E が含まれないことを確認する。
7. `U+202E` 等の安全表記が含まれることを確認する。
8. 対照として、秘密形状を含む path / error text が従来どおり mask されることも確認する。

このテストは修正前に FAIL する。

---

## 4. Request「特に見てほしい点」1〜8 の確認結果

### 1. M2-2-R1-007 と M2-2-R1-001 が解消されているか

確認した。

- **M2-2-R1-007: 解消**
- **M2-2-R1-001: 解消**

R1-007 は `existsSync()` が消え、ENOENT とそれ以外が `readFileSync()` の error code で分離されている。R1-001 は Rejected range より前に work-tree / root を確定し、Rejected branch でも独立検査を続ける。

### 2. 同じ種類の洗い出しの漏れ

`response-r1.md` の P / O 表と、今回変更された `review-packet` / `security-scan` / config loader を確認した。

P2 と O1 は `loadSecurityConfig()` に統合され、読取不能を defaults に落とす問題は修正されている。P1 も `latest.json` の direct read に変わっている。

バックログの O2〜O9、P3、P4、P11 は、その項目自体を新規指摘として扱わなかった。表の説明を読み直した範囲では、今回の v0.5.1 修正対象へ繰り上げるべきなのに「検査を弱めて exit 0」と誤分類されているものは新たに見つけなかった。

ただし、v0.5.1 の fail-closed 化で **security-scan の config read error 自体が新しい出力経路となり、そのエラーパスの禁止文字が生で出る**ことを確認した。これは「存在判定の洗い出し」ではなく、修正後の error-output boundary の問題として M2-2-R2-001 にした。

### 3. `loadSecurityConfig` の共通読み込み

`src/config/load.ts:37-42` を確認し、review-packet と security-scan の双方が同じ `loadSecurityConfig()` を1回ずつ呼び、従来の `readSecurity()` を持たないことを構造テストでも確認している。

`--config` 明示時は `loadConfig(path.resolve(cwd, configPath))` を使うため、従来どおり「存在必須」。default 時だけ ENOENT を defaults とする。

filesystem error の分類は次のとおり。

- 通常の symlink: `readFileSync()` が target を読む
- symlink loop: ELOOP → ConfigError / exit 2
- ENOTDIR: ConfigError / exit 2
- EISDIR: ConfigError / exit 2（POSIX の通常挙動）
- EACCES / EPERM 等: ConfigError / exit 2
- ENOENT: default config なら defaults、explicit `--config` なら `config file not found` / exit 2
- dangling symlink は read 時には ENOENT になるため、default config では今回の人間ルール「ENOENT のときだけ既定値」に従い defaults、明示 `--config` では not found になる

この分類自体に新しい誤りは見つけなかった。

ただし error message の安全表示は2コマンドで同一ではなく、security-scan 側に M2-2-R2-001 がある。

### 4. R1-001 の分類

Rejected range branch で使用される値を追った。

実行する Git は次だけで、Rejected range の値またはそこから得た SHA を引数にしていない。

- `git rev-parse --is-inside-work-tree`
- `git rev-parse --show-toplevel`
- `git --version`

`readLatest()` の path は repository root から固定で組み立てており range を使わない。request / review bytes も inspect 前に取得済みで range 非依存。

ref resolve、ancestry、commit list、diff / blob / pathspec、commit message、doc lookup、`verificationFor(..., toSha, ...)`、既定 label 等は branch の後にあり、Rejected 時には到達しない。

逆方向についても、Request に列挙された範囲非依存検査で飛ばしたままのものは見つけなかった。明示 `--output`、または明示 `--label` から決められる既定 output は caller 側 `outputTargets()` で range finding があっても確認される。

### 5. 終了コードの優先順位

v0.5.1 で変更された組み合わせを ADR-0015 とコードで確認した。

- non-ENOENT の `latest.json` 読取失敗 → InspectionError → exit 2
- non-ENOENT の default config 読取失敗 → ConfigError → exit 2
- Rejected range + non-git cwd / missing cwd / unreadable latest → InspectionError → exit 2 + findings incomplete
- Rejected range + 独立検査で追加 finding のみ → exit 1

`src/commands/review-packet.ts:187-208` の処理では InspectionError は `incomplete()` に直行し、通常完了した inspection 後は `decideOutcome()` により finding が deferred より先になる。ADR-0015 の表との不一致は見つけなかった。

M2-2-R2-001 も exit code 自体は正しく 2 であり、問題は stderr の安全性である。

### 6. パケットの出力

Checked range の通常経路を追った。

今回の主な構造変更は、

- root を `PacketInspection.root` へ分離
- `readVerification()` を `readLatest()` + `verificationFor()` へ分割
- output default path が `inspection.git.root` ではなく `inspection.root` を参照

である。

Checked range では `root` は同じ `git rev-parse --show-toplevel` から得られ、`verificationFor(readLatest(...), to.sha, ...)` は旧処理と同じ条件で verification を決定している。rendering 本体への変更は無く、通常入力で意図しない本文差分を生む経路は見つけなかった。

`package.json` の版が 0.5.1 になるため、実際の CLI が渡す tool version の表示が変わるのは release に伴う意図した差分であり、ロジック上の packet 内容変更とは分けて考えた。

### 7. テストが要件を検証できているか

R1-007 regression は修正原因そのものを検証している。permission test は root で skip されるが、ENOTDIR と ELOOP の non-ENOENT cases が非 skip で同じ catch branch を検証するため、root 環境で修正全体が未検証になるわけではない。

R1-001 regression は、修正前に失敗すべき中心ケースである non-git cwd + Rejected range、missing cwd、unreadable latest を含む。また blocked ref / malformed blocked range が Git に渡らない対照もある。

共通 config reader の tests も、default ENOENT、ELOOP、permission、explicit missing、explicit readable、explicit ELOOP、両コマンドが1つの reader を使うことを確認している。

不足として、**ConfigError の path 自体に禁止文字がある security-scan error-output test が無い**。そのため M2-2-R2-001 を検出できていない。

### 8. docs とコードの一致

指定された docs を確認した。

- **ADR-0015:** ENOENT only absent、Rejected range でも範囲非依存検査を続行、exit priority はコードと一致
- **CONFIG_SPEC §3b:** review-packet と security-scan が `loadSecurityConfig()` を共有し、default config は ENOENT のみ defaults、その他は exit 2 という説明はコードと一致
- **README / ARCHITECTURE `unit-minpath`:** 保証が「PATH の名前解決で起動する未宣言コマンド」に狭められ、絶対パス・環境継承・直接 child だけを止める限界が明記されており、R1-005 / R1-006 の実態と一致
- **ADR-0014 §14:** short alias、composite probe、brand guard fixture の限界が記録されており、バックログ方針と一致

今回の High はこれら docs の記述の直接矛盾ではなく、`security-scan` の error output boundary に関する新規問題である。

---

## 確認範囲

主に以下を実コードとして読んだ。

- `src/commands/review-packet.ts`
- `src/commands/security-scan.ts`
- `src/config/load.ts`
- `src/review/packet.ts`
- `tests/regression-m2-2-r1-001-rejected-range-preflight.test.ts`
- `tests/regression-m2-2-r1-007-unreadable-parent.test.ts`
- `tests/regression-m2-2-r1-config-read.test.ts`
- `docs/reviews/m2-2/response-r1.md`
- `docs/adr/0014-review-packet.md`
- `docs/adr/0015-review-packet-exit-priority.md`
- `docs/CONFIG_SPEC.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `CHANGELOG.md`

Previous Reviews、response、CHANGELOG の説明は判定根拠として採用せず、コード・テスト・docs の相互整合を確認するための索引としてのみ使用した。
