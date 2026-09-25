<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-r3-for-claude.md、2026-09-25 付、22,104 バイト、対象範囲 v0.5.1..v0.5.2）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 94a506a0dc81b535440fdfbf84519008d97d5232d8d5f4fc5c9006a8672f8ba7
-->

# independent review — M2-2 R3

## 1. 総評

v0.5.1..v0.5.2 の変更について、Request の「特に見てほしい点」1〜7、前回指摘 M2-2-R2-001、変更コード、回帰テスト、ADR-0016 / ADR-0012 / ARCHITECTURE を相互に確認した。

**M2-2-R2-001 は「解消」**と判断する。`security-scan` を含む各コマンドの端末出力は `src/output.ts` の共通境界に集約され、前回の再現条件である config read error のパスも `escapeForDisplay()` → `maskSecrets()` を通る。Commander の出力と CLI 自身のエラーも同じ境界へ接続されている。

一方、共通境界の保証には新たに **Medium 3 件**を指摘する。内訳は **High 0 / Medium 3 / Low 0**。主な問題は、既定の text 出力が利用者由来の LF / TAB をそのまま保持するため行表示を偽装できること、JSON のオブジェクトキーをエスケープしないこと、構造ガードが動的な stream property access を検出できないことである。

レビュー用パケットは完全な repository checkout ではないため、プロジェクトのフルテストスイート自体は再実行していない。JSON.stringify がオブジェクトキー中の U+202E を生のまま保持する点については Node.js の最小確認を実行した。その他の再現は、下記に明記したものを除きコード読解による。

---

## 2. 前回指摘の解消状況

### M2-2-R2-001 — 解消

**対象:**
- `src/output.ts:23-35`
- `src/output.ts:50-53`
- `src/output.ts:71-83`
- `src/output.ts:91-98`
- `src/commands/security-scan.ts:25-54`
- `src/cli-program.ts:40-45`
- `src/cli-program.ts:51-55`
- `src/cli.ts:36-45`
- `src/cli.ts:78-82`
- `tests/regression-m2-2-r2-001-output-boundary.test.ts:85-253`

前回の High は、`security-scan` が `maskSecrets()` だけを通し、config error に含まれるパスの禁止文字を安全表示していなかった問題だった。

v0.5.2 では共通境界が追加され、text は次の順序になっている。

```ts
export function safeText(s: string, mode: LineMode = "keep"): string {
  return maskSecrets(escapeForDisplay(s, mode));
}
```

`security-scan` も個別 masker を廃止し、`createOutput()` を使用する。

```ts
const output = createOutput({ log: options.log, logError: options.logError });
const log = output.log;
const logError = output.error;
```

したがって config read error も、

```ts
logError(`aiqh security-scan: ${err.message}`);
```

から共通境界へ入り、U+202E 等は表記へ変換された後に masker を通る。

CLI 自身についても、

- option parser: `writeError()`
- Commander: `configureOutput(COMMANDER_OUTPUT)`
- unexpected error: `writeError()`
- signal message: `writeError()`

へ接続されている。

追加された regression も、少なくとも次を直接確認している。

- `security-scan` の config read error
- `security-scan` の path / file name
- `security-scan --json`
- `verify` の config error / check output
- `init` の root
- Commander の unknown option / unknown command
- option parser
- secret shape が引き続き mask されること
- help / version に不要な変化がないこと

前回指摘そのものの原因と再現経路は閉じているため、**M2-2-R2-001 は解消**と判断する。

ただし、共通境界を広げた結果として見つかった別の保証不足は、以下の新規指摘として分離する。

---

## 3. 新しい指摘

### ID: M2-2-R3-001

- **重大度:** Medium
- **対象:**
  - `src/output.ts:14-35`
  - `src/output.ts:71-78`
  - `src/commands/security-scan.ts:65-98`
  - `src/commands/init.ts:110-127`
  - `tests/regression-m2-2-r2-001-output-boundary.test.ts:235-244`

### 内容

既定の `LineMode = "keep"` が LF と TAB を無条件に保持するため、**利用者由来のパス・ファイル名等に LF / TAB が含まれると、1つの論理行を複数行や別カラムに見せかけることができる**。

「コマンド自身が意図して出している複数行」と「利用者由来フィールドの中に埋め込まれた LF / TAB」が区別されていない。

### 根拠

`escapeForDisplay()` は `"keep"` のとき、禁止集合に入っている文字だけを表記へ変換する。

```ts
export function escapeForDisplay(s: string, mode: LineMode): string {
  if (mode === "escape") return escapeRawChars(s);
  let out = "";
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    out += isForbiddenCodePoint(cp) ? `\\u{${cp.toString(16).toUpperCase()}}` : c;
  }
  return out;
}
```

コメントにも LF / TAB を残すと明記されている。

```ts
* - keep: they are the output's own lines and columns ...
```

しかし実際には `safeText()` に渡される文字列には利用者由来の値も混ざる。

例えば security-scan はファイル名をそのまま補間する。

```ts
for (const f of secrets)
  log(`  [secret] ${f.file}:${f.line} ...`);
```

root も同様である。

```ts
log(`aiqh security-scan — ${r.root}`);
```

init も root / projectName 等を同じ text 行に埋め込む。

```ts
log(`aiqh init — ${root}`);
log(`project: ${projectName} (${resolution.projectType})`);
```

POSIX のファイル名・ディレクトリ名には LF / TAB を含めることができるため、例えばファイル名の中の LF 以降を `SECURITY SCAN: no findings` のような見た目にすることで、端末上の行構造を崩せる。

また regression はむしろ、

```ts
const samples = [
  ...
  "tab\tseparated\tcolumns",
  "multi\nline\nmessage\n",
  ...
];
expect(safeText(s)).toBe(maskSecrets(s));
```

として LF / TAB が保持されることを固定しており、**「trusted formatting の LF / TAB」と「untrusted field の LF / TAB」を分離していない**。

CR は `isForbiddenCodePoint()` の対象なので表記になる。この点は問題ない。

### 再現条件

**未実行（コード読解による）。**

1. POSIX 上で、LF を含むファイル名を作る。
2. そのファイルに security-scan finding が発生する内容を置く。
3. `aiqh security-scan` を text mode で実行する。
4. **期待:** ファイル名中の LF / TAB は表示用表記に変換され、finding 1件が1つの安全な表示単位として出る。
5. **実際:** `f.file` 内の LF / TAB が `safeText(..., "keep")` で残り、出力行や桁を分割できる。

同じことは LF を含む `--cwd` / root でも起こり得る。

### 修正案

「出力全体の mode」と「動的フィールドの mode」を分ける。

例えば、

- command-owned の改行を保持する `safeBlock()`
- 利用者由来の埋め込み値は LF / TAB も必ず表記する `safeField()`

を分け、テンプレートへ埋め込む前に field 単位で安全化する。

単純に全出力で LF を表記すると verify の check output や help の既存表示を壊すため、**trusted formatting と untrusted data の境界を明示する**方針が適切。

### 回帰テスト案

POSIX 限定で、

1. LF を runtime で組み立てる。
2. LF を含む tracked filename に finding を作る。
3. security-scan text output を捕捉する。
4. 出力中に生 LF が command-owned 改行以外の位置で増えないことを確認する。
5. ファイル名部分が `\u{A}` 等の安全表記になることを確認する。
6. TAB についても同様に field 中では `\u{9}` 等になることを確認する。
7. 一方、verify の意図した複数行 check tail 等は従来どおり複数行で表示されることを確認する。

修正前は filename / root のケースが FAIL する。

---

### ID: M2-2-R3-002

- **重大度:** Medium
- **対象:**
  - `src/output.ts:38-53`
  - `tests/regression-m2-2-r2-001-output-boundary.test.ts:235-244`
  - `docs/adr/0016-output-boundary.md:40-48`

### 内容

`safeJson()` の再帰エスケープは **オブジェクトの値だけ**を処理し、プロパティ名（JSON key）はそのまま残す。

そのため、共通出力境界として `safeJson()` に利用者由来キーを含む object が渡された場合、キー中の U+202E 等を生のまま JSON 出力できる。

現時点で今回確認した各コマンドの JSON shape は固定キー中心であり、直ちに既存コマンドから到達する user-controlled key は確認できなかった。そのため High ではなく、**共通境界の要件と回帰テストの不足として Medium** とする。

### 根拠

`escapeDeep()` は object を走査するが、key `k` は変換していない。

```ts
if (value !== null && typeof value === "object") {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value))
    out[k] = escapeDeep(v, mode);
  return out;
}
```

さらにコメントで、

```ts
/** Every string inside a JSON value escaped (object keys are aiqh's own and stay as they are). */
```

と固定キーを前提にしている。

しかし Request は JSON のキーについても明示的な確認を求めており、共通 API 自体も `safeJson(value: unknown)` と任意 object を受け取る設計である。

追加 regression の JSON control も固定キーしか使わない。

```ts
const value = {
  root: "/tmp/作業",
  findings: [{ file: "a\tb.ts", ... }],
  count: 3,
  ok: true,
  none: null
};
```

したがって key 側の禁止文字を検証していない。

**実行確認:** Node.js の最小確認で、`JSON.stringify()` はオブジェクトキー中の U+202E を自動的に `\uXXXX` へ変換せず、生の code point のまま結果文字列へ保持することを確認した。

### 再現条件

**一部実行済み。** `JSON.stringify()` の key の挙動のみ最小確認済み。aiqh 本体の `safeJson()` はパケットのみのため未実行。

概念的には、

1. runtime で U+202E を組み立てる。
2. `{ ["key" + U+202E + "x"]: "value" }` 相当の object を `safeJson()` へ渡す。
3. **期待:** key 中の U+202E も `\u{202E}` 等の安全表記になる。
4. **実際:** `escapeDeep()` が key をコピーするだけなので、その後の `JSON.stringify()` でも U+202E が生のまま残り得る。

### 修正案

`escapeDeep()` で object key も処理する。

方針例:

```ts
for (const [k, v] of Object.entries(value)) {
  const safeKey = escapeForDisplay(k, mode);
  out[safeKey] = escapeDeep(v, mode);
}
```

さらに masker が key を処理しない実装なら、key に対しても `maskSecrets()` を適用する。

なお、変換後に複数 key が同じ文字列へ衝突する可能性があるため、単純上書きではなく、衝突時は fail-closed にするか、JSON serialization 専用 walker で安全に扱う方がよい。

### 回帰テスト案

`safeJson()` に対して、

- key に U+202E
- key に U+2028 / U+2029
- key に CR
- key に secret-shaped string

を runtime で組み立てて渡し、

- 生の禁止文字が JSON 文字列に残らない
- secret-shaped key がそのまま残らない
- value 側の既存挙動も維持される

ことを確認する。

修正前は少なくとも U+202E key のテストが FAIL する。

---

### ID: M2-2-R3-003

- **重大度:** Medium
- **対象:**
  - `tests/structure/output-guard.ts:33-60`
  - `tests/structure/output-guard.ts:62-113`
  - `tests/regression-m2-2-r2-001-output-boundary.test.ts:259-308`

### 内容

「`src/output.ts` 以外から端末へ書けない」ことを保証する構造ガードに、**動的な `process[key]` 形式の stream access を見逃す穴**がある。

また `src/output.ts` はファイル全体が allowlist されているため、将来このファイル内へ `safeText()` を通さない direct write が追加されても構造テストは失敗しない。

現在の production source にその迂回は見つけていないため、現時点の漏えいではなく、再発防止テストの不足として Medium とする。

### 根拠

element access の検査は、argument expression 自体の symbol が terminal symbol かどうかだけを見る。

```ts
if (ts.isElementAccessExpression(n)) {
  const what = terminalSymbol(
    resolved(checker, checker.getSymbolAtLocation(n.argumentExpression))
  );
  if (what !== null) add(sf, n, what);
}
```

これは literal の

```ts
process["stderr"]
```

では TypeScript が property symbol を返すため検出できる。

しかし例えば、

```ts
const key: "stdout" = "stdout";
process[key].write("x");
```

では `n.argumentExpression` は local variable `key` であり、`terminalSymbol()` が見る symbol は `stdout` の Node declaration ではない。

AST 内の `process` identifier 自体も `terminalSymbol()` は `"process"` を terminal target として扱わないので、この形は guard を通過し得る。

fixture は literal element access までしかない。

```ts
o13_process_element:
  `export const f = (): boolean => process["stderr"].write("x");\n`
```

さらに allowlist は file 単位である。

```ts
export const OUTPUT_ALLOWED = new Set(["src/output.ts"]);

export function outputViolations(...) {
  return outputReferences(
    p,
    files.filter((sf) =>
      !OUTPUT_ALLOWED.has(p.rel(sf).split(path.sep).join("/"))
    )
  );
}
```

このため `src/output.ts` 内の terminal reference は、safe wrapper 内かどうかを問わず全て許される。

### 再現条件

**未実行（コード読解による）。**

fixture に次のような型チェック可能なケースを追加する。

```ts
const key: "stdout" = "stdout";
export const f = (): boolean => process[key].write("x");
```

**期待:** terminal output reference として `outputReferences()` が報告する。

**実際:** `key` は local symbol なので現行ロジックでは報告されないと推定する。

別ケースとして `src/output.ts` 相当の allowlisted file に direct `console.error(raw)` を追加した場合も、`outputViolations()` は file 全体を除外するため PASS する。

### 修正案

少なくとも次を追加する。

1. `ElementAccessExpression` は argument の literal type / constant value も評価し、`"stdout"` / `"stderr"` へ解決できるなら terminal stream と判定する。
2. `process` / stream の alias を型だけでなく property access chain として追う。
3. allowlist を file 単位だけにせず、`src/output.ts` 内でも terminal write の call site を限定する。
   - 例えば許可する関数名を `createOutput`, `writeError`, `COMMANDER_OUTPUT` に限定
   - あるいは terminal write の argument が `safeText(...)` の結果であることを AST で確認
4. fixture に dynamic element access と unsafe boundary-internal write を追加する。

### 回帰テスト案

少なくとも次の2件を追加する。

- `const key: "stdout" = "stdout"; process[key].write("x")` が guard violation
- allowlisted boundary fixture 内の `console.error(raw)` が、「safeText を通らない write」として guard violation

修正前に FAIL するテストとして固定する。

---

## 4. Request「特に見てほしい点」1〜7 の確認結果

### 1. M2-2-R2-001 が解消されているか

**解消**と判断する。

前回の直接原因だった `security-scan` の config error は `createOutput()` → `safeText()` → `escapeForDisplay()` → `maskSecrets()` を通る。

同じ共通境界へ verify / init / review-packet / CLI / Commander も接続されている。

R2-001 の再現条件である U+202E 等が config error path から生で stderr に出る経路は、今回のコードでは見つけなかった。

---

### 2. 出口を通らない端末への出力が残っていないか

変更後の `src/` を対象にした構造ガードでは、現在存在する直接 `console` / stdout / stderr 参照は `src/output.ts` に集約されている。

CLI の以下も共通境界へ接続されている。

- Commander help / version / usage error
- unknown command / option
- positive integer option parser
- unexpected error
- SIGINT / SIGTERM message

したがって、**現在の通常の source path に既知の direct terminal write は見つけなかった**。

ただし構造ガード自体には dynamic `process[key]` 等の穴がある。

→ **M2-2-R3-003**

---

### 3. 出口の処理の正しさ

#### 禁止文字 → masker の順序

`safeText()` は、

```ts
maskSecrets(escapeForDisplay(...))
```

であり、要求された順序になっている。

今回確認した secret pattern の既知の ASCII prefix を、禁止文字の表記処理が削除・結合して見逃しに変える経路は見つけなかった。

masker の結果へ raw forbidden character を新たに導入するコードも、この変更範囲では見つけなかった。

#### JSON key

値は再帰処理しているが、**key は処理していない**。

→ **M2-2-R3-002**

#### LF / TAB

CR は禁止文字として表記になる。一方 LF / TAB は既定で意図的に保持される。

command-owned formatting だけなら問題ないが、同じ `safeText()` に path / filename 等の動的値が含まれるため、表示境界を崩せる。

→ **M2-2-R3-001**

---

### 4. 構造テストの穴

fixture は次の代表形をかなり広く確認している。

- console
- console alias / destructuring / element access
- globalThis.console
- stdout / stderr
- process alias / destructuring
- literal element access
- node:process
- node:console
- fs fd 1 / 2
- const literal fd
- `/dev/stdout`

ただし dynamic property access、

```ts
const key: "stdout" = "stdout";
process[key]
```

は現行ロジックでは取りこぼし得る。

また allowlist が `src/output.ts` ファイル全体なので、その内部の unsafe direct write を guard 自身は区別できない。

→ **M2-2-R3-003**

---

### 5. 通常の出力が変わっていないか

`safeText(..., "keep")` は forbidden raw character が無い通常文字列について masker 以外の変更をしないため、従来 masker-only だった security-scan / verify / init の通常出力は基本的に維持される。

review-packet は `"escape"` mode を指定しており、従来の `escapeRawChars()` 相当を保っている。

help / version について regression があり、raw forbidden character がない通常 help は `safeText()` を通っても内容を変更しない。

今回のコード読解では、禁止文字も secret shape も無い入力に対して改行数・終了コードを意図せず変える新しい経路は見つけなかった。

ただし LF / TAB 自体を「通常文字」として保持する設計は、利用者由来 field では M2-2-R3-001 の問題になる。

---

### 6. テストが要件を検証できているか

R2-001 の直接回帰としては、修正前に FAIL する内容が入っている。

各系統について、

- security-scan
- verify
- init
- Commander / CLI
- option parser

の raw-character output を確認している。

review-packet は今回の共通化前から `escapeRawChars()` を持っていた経路で、今回も `"escape"` mode へ置き換えている。

一方、今回新たに見つけた次の要件はテストされていない。

- untrusted path / filename 中の LF / TAB
- JSON object key 中の forbidden character
- dynamic `process[key]` stream access
- allowlisted `src/output.ts` 内での unsafe direct write

したがって回帰テストは R2-001 の元ケースには有効だが、「共通境界が今後も全出力を安全化する」という構造保証としては不足がある。

---

### 7. docs とコードの一致

#### ADR-0016

「全 terminal output を `src/output.ts` へ集約」「禁止文字表記 → masker」「Commander も共通出口」という主記述は現在のコードと一致している。

一方、

```text
JSON は文字列を再帰的に表記にしてから maskDeep
```

という表現は、実装が object key を処理しない点を明示していない。

Request が key も確認対象としていることを踏まえると、実装か docs のどちらかを修正すべき。

→ **M2-2-R3-002**

#### ADR-0012 の置換

ADR-0016 が ADR-0012 の旧「text 側では escape しない」判断を置換することは明記されており、今回の方向性と整合している。

#### ARCHITECTURE

`src/output.ts` を共通 terminal boundary とする説明は実装の主構造と一致する。

ただし「すべてが共通境界を通る」という構造保証を将来も守るテストについては、M2-2-R3-003 の静的ガードの穴があるため、保証の強さは実装テストよりやや強い。

---

## 確認範囲

主に以下を実コードとして確認した。

- `src/output.ts`
- `src/cli.ts`
- `src/cli-program.ts`
- `src/commands/init.ts`
- `src/commands/security-scan.ts`
- `src/commands/verify.ts`
- `src/commands/review-packet.ts`
- `tests/regression-m2-2-r2-001-output-boundary.test.ts`
- `tests/structure/output-guard.ts`
- `docs/adr/0016-output-boundary.md`
- `docs/adr/0012-security-allow.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `README.md`
- `CHANGELOG.md`

Previous Reviews、response、commit message、CHANGELOG の説明は正しさの根拠には使用せず、確認対象の場所を特定する索引としてのみ利用した。

既知の範囲外として指定された、

- ファイルへの出力の禁止文字
- verify check への `NO_COLOR`
- 表記形式が `\u{XXXX}` であること
- M2-2-R1-002〜006
- O2〜O9 / P3 / P4 / P11
- その他 ROADMAP backlog
- 同時変更
- Windows
- 過去記録
- verify 所要時間

は今回の新規指摘対象から除外した。
