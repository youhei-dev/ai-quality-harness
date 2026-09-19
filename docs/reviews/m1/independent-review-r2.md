<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m1-r2-for-claude.md、9/19 付）を原文のままコピー。
本体の Security Scan に一致する例示行は無く、変更した行はない。無改変の原文の SHA-256: 48b111d42e53c81aa61fff149c6e5b7a1977f63f1c6dace1f58ba8f7d387dc9f
-->

# M1 独立レビュー R2 — Claude Code 修正依頼用

対象: `ai-quality-harness` M1 / independent review R1 対応後  
レビュー資料: `review-packet-m1-r1.md`  
対象範囲: `v0.2.0..v0.2.1`  
packet記載の `v0.2.1`: commit `630f2e3`  
想定保存先: `docs/reviews/m1/independent-review-r2.md`

## レビュー方針

実装AIの判定・Known Risks・「PASSした」という説明を結論として採用せず、パケットに掲載された実コード、差分、回帰テスト、Original Requestを独立に確認した。

前回の M1-R1-001〜010 が本当に潰れているかに加え、修正で新しいfail-openや退行が入っていないかを確認した。

## 総括

R1対応は全体として大幅に改善されている。

特に以下は前回の具体的再現条件を解消している。

- v0.2.0 self verify FAILの訂正とrelease順序固定
- multiline PEM検出
- package script本文の`init`出力・config複製防止
- 1 MiB超ファイルの無条件skip廃止
- `.gitignore` negationをGit自身で評価
- generated configのruntime validation
- Node direct invocationの`npx --no-install`
- JSON Schemaをstructural schemaと明文化
- Python Playwrightでpytestを要求
- optional write errorのinit固有エラー化

ただし、独立確認では以下を追加指摘する。

- **High: 1件**
- **Medium: 4件**

最優先は **M1-R2-001**。

---

# Findings

## M1-R2-001

- **ID:** M1-R2-001
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/security/scan.ts` — `scanRepository()` / `checkGitignore()`
- **関連:** M1-R1-001 / M1-R1-005
- **内容:** 実際に存在する未追跡・非ignoreの`.env.*`ファイルをscannerが意図的に読まずにskipする一方、`.gitignore`判定は4個の代表名しかprobeしないため、**実在する秘密用envファイルがignoreされていないのにSecurity Scanが0 findingでPASSできる**。

### 根拠

untracked fileの処理は:

```ts
for (const rel of untracked) {
  // An untracked environment file is never read; the .gitignore finding below covers it.
  if (ENV_FILE.test(path.basename(rel))) continue;
  scanFile(...);
}
```

となっている。

つまり`.env.staging`、`.env.test`、`.env.foo.local`等が:

- untracked
- Gitにignoreされていない

状態でも内容を読まず、そのファイル自身に対するfindingも作らない。

その代わり`checkGitignore()`が確認するのは固定4パスだけ。

```ts
.env
.env.local
.env.production
.env.development
```

### 独立再現

実装と同じ`scanRepository()`をパケット掲載コードから取り出して実行した。

`.gitignore`:

```gitignore
.env
.env.local
.env.production
.env.development
```

work tree:

```text
.env.staging   # untracked / NOT ignored
```

`.env.staging`にはsecret相当の内容を置いた。

Git自身では:

```text
git ls-files --others --exclude-standard
```

に`.env.staging`が出る。

また:

```text
git check-ignore .env.staging
```

は非ignore。

しかし現行`scanRepository()`の結果:

```json
{
  "filesUntracked": 1,
  "findings": []
}
```

となった。

つまりコメントの:

```text
the .gitignore finding below covers it
```

は一般には成立しない。

### 影響

Security Scanが「`.env` / `.env.*` hygiene」を保証するように見えるにもかかわらず、

```text
.env
.env.local
.env.production
.env.development
```

だけを個別ignoreしておけば、

```text
.env.staging
.env.test
.env.secret
subdir/.env.staging
```

等の実ファイルが非ignoreでもPASSし得る。

これは代表パスの精度問題だけではなく、**scanner自身が実在を知っている未ignore env fileをfindingにしない**ための具体的なfail-open。

### 修正案

未追跡env fileは内容を読まなくてよい。

`git ls-files --others --exclude-standard`に出てきた時点で「ignoreされていない」ことはGit自身が確定しているので、その存在をfindingにする。

例:

```ts
for (const rel of untracked) {
  if (ENV_FILE.test(path.basename(rel))) {
    if (!isExampleEnv(rel)) {
      result.findings.push({
        kind: "untracked-env",
        file: rel,
        message: "environment file exists but is not ignored by git",
      });
    }
    continue;
  }
  scanFile(...);
}
```

あるいは既存`gitignore` kindで:

```text
.env.staging is present and not ignored
```

としてもよい。

代表probeは「予防的な`.env.*` coverage確認」として残し、**実在するuntracked envは別途必ずfinding**にするのが安全。

### 追加すべき回帰テスト

- `.env.staging`が実在・untracked・非ignore → finding
- nested `config/.env.staging` → finding
- `.env.example` / `.env.sample` → policyどおりallowed
- `.env.staging`が`.env*`でignore済み → `ls-files --others --exclude-standard`に出ずfindingなし
- secret値そのものは読まない / outputしない

---

## M1-R2-002

- **ID:** M1-R2-002
- **重要度:** Medium
- **種別:** セキュリティ / 例外処理
- **対象:** `src/security/scan.ts` — `scanFile()`
- **内容:** tracked / untracked fileの`lstatSync()`が失敗した場合、**エラー種別を問わず黙ってreturnするためfail-open**になっている。

### 根拠

現行:

```ts
let stat;
try {
  stat = lstatSync(abs);
} catch {
  return; // in the index but deleted from the work tree: nothing to read
}
```

コメントが想定しているのは「indexにはあるがwork treeから削除された」`ENOENT`。

しかしcatchは全例外を握りつぶす。

例えば:

- `EACCES`
- `EPERM`
- `ELOOP`
- その他filesystem error

でもscan対象から無言で消える。

一方`readLines()`側はopen/read errorを`ScanError`にしてexit 2へ倒しており、設計コメントでも:

```text
Throws ScanError when ... a file cannot be read
```

としている。

`lstat`だけがそのfail-closed方針から外れている。

### 修正案

`ENOENT`のみ「work treeに無い」としてskipし、それ以外は`ScanError`。

例:

```ts
try {
  stat = lstatSync(abs);
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return;
  throw new ScanError(`cannot stat ${rel}: ${(err as Error).message}`);
}
```

### 追加テスト

POSIX non-root環境で:

- 親directoryのpermissionを外し`lstat`がEACCES
- `scanRepository()` → `ScanError`
- CLI → exit 2

root実行でEACCESを再現できないCIでは、filesystem access functionを小さく分離してunit test可能にする方法もある。

---

## M1-R2-003

- **ID:** M1-R2-003
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/adapters/context.ts` — `buildPython()` / `src/adapters/python.ts`
- **関連:** M1-R1-009
- **内容:** `venvBin()`はtool binaryのX_OKを確認するようになったが、**実際に全Python commandの先頭で使う`<venv>/bin/python`自身の実行権限を確認していない**。そのためnon-executable pythonでもadapterが`available`を返せる。

### 根拠

`buildPython()`のvenv検出:

```ts
const venvDir =
  [".venv", "venv"].find((d) => exists(path.join(d, "bin", "python"))) ?? null;
```

ここでは`exists()` = `lstatSync`成功だけ。

一方:

```ts
venvBin(name)
```

は`isExecutable()`を使う。

Python adapter側の`py(ctx)`は:

```ts
ctx.python?.venvDir
  ? `${ctx.python.venvDir}/bin/python`
  : null
```

なので、python executable自体は検証しない。

### 独立再現

パケット掲載の`context.ts` / `python.ts`を直接実行した。

fixture:

```text
.venv/bin/python   mode 0644  # non executable
.venv/bin/pytest   mode 0755
tests/
requirements.txt
```

結果:

```json
{
  "pythonBin": null,
  "pytestBin": ".venv/bin/pytest",
  "python-pytest": {
    "status": "available",
    "command": ".venv/bin/python -m pytest -q tests/"
  }
}
```

つまりadapterはavailableだが、suggestionの先頭commandは実行不能。

### 修正案

`buildPython()`のvenvDir判定そのものをpython executable基準にする。

例:

```ts
const venvDir =
  [".venv", "venv"].find((d) =>
    isExecutable(path.join(absRoot, d, "bin", "python"))
  ) ?? null;
```

またはPythonContextに:

```ts
python: string | null
```

を持ち、全adapterはそれを使う。

### 追加テスト

- python 0644 + pytest 0755 → adapter unavailable
- python 0755 + pytest 0755 → available
- Playwright / ruff / mypy等もnon-executable interpreterではavailableにならない

### R1判定への影響

M1-R1-009は**PARTIAL**。

pytest prerequisiteとtool binaryのX_OKは直ったが、command executorであるpython自体のX_OK確認が残っている。

---

## M1-R2-004

- **ID:** M1-R2-004
- **重要度:** Medium
- **種別:** 性能 / 例外処理
- **対象:** `src/security/scan.ts` — `readLines()`
- **関連:** M1-R1-004
- **内容:** 1 MiB size skipを廃止して64 KiB chunk読みへ変更したが、改行のない巨大text fileでは`pending`へ全内容を連結し続けるため、**メモリ使用量は結局ファイルサイズに比例する**。巨大1行ファイルでprocess OOMになり、controlled `ScanError`ではなくscanner自体が落ち得る。

### 根拠

現行:

```ts
let pending = "";

for (;;) {
  ...
  pending += decoder.write(buf.subarray(0, n));

  let start = 0;
  for (;;) {
    const nl = pending.indexOf("\n", start);
    if (nl === -1) break;
    onLine(...);
    start = nl + 1;
  }

  pending = pending.slice(start);
}
```

newlineが無い場合:

```text
start = 0
pending.slice(0) = pending
```

なので、64 KiBずつ読みながら`pending`は:

```text
64 KiB
128 KiB
192 KiB
...
file size
```

まで増える。

さらに`pending += ...`はstring再確保も発生し得る。

### 影響

minified JSON / generated bundle / lock-like data / intentionally padded fileなど、巨大な1行textでmemory pressureまたはOOMを起こせる。

M1-R1-004は「large fileをfail-openでskipしない」ための修正だったが、極端な入力では「scan完了せずprocess crash」になる。

### 修正案

line scannerを「行全体を必ずmemoryへ保持する設計」にしない。

候補:

1. line-oriented secret patternに必要な最大overlapを決め、chunk + overlapでregex scan
2. PEM BEGIN/ENDはstateだけ保持
3. line numberはchunk内の`\n`を数える
4. どうしても行単位処理が必要なら`MAX_LINE_BYTES`を導入し、超過時は**skipではなくScanError / findingでfail closed**

最小案:

```text
1行が例えば数MiBを超えたら
"line too long to scan safely" → ScanError(exit 2)
```

でもM1のfail-closed性は維持できる。

### 追加テスト

- 10〜50 MiBのnewlineなしtext
- scannerが無制限にlineを保持しない
- secretが末尾にある場合もpolicyどおり検出またはcontrolled ERROR
- process OOMに依存しない

---

## M1-R2-005

- **ID:** M1-R2-005
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/commands/init.ts` — `proposeGitignore()`
- **内容:** Security Scan側の`.gitignore`判定はGit自身へ移行したが、`aiqh init`の`artifacts/`提案は依然として単純な行一致のため、**後続negationで実際にはartifactsがignoreされていなくても「already ignores」と誤判定する**。

### 根拠

現行:

```ts
function proposeGitignore(root: string): { needed: boolean } {
  ...
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim());

  return {
    needed: !lines.some(
      (l) =>
        l === GITIGNORE_LINE ||
        l === `/${GITIGNORE_LINE}` ||
        l === "artifacts"
    )
  };
}
```

negationやGit patternの最終意味論を見ない。

### 独立再現

`.gitignore`:

```gitignore
artifacts/
!artifacts/
```

Git自身:

```text
git check-ignore artifacts/x
→ NOT IGNORED
```

しかし`proposeGitignore()`は最初の`artifacts/`行を見て:

```text
needed = false
```

になり、

```text
.gitignore: already ignores artifacts/
```

と案内する。

### 影響

`artifacts/verification`や`artifacts/ai-review`がGit管理対象になり得る状態を見逃す。

report自体はsecret maskingされる設計だが、品質ハーネスの生成物を誤ってcommitする運用リスクになる。

### 修正案

Security Scanと同様、Git自身へ問い合わせる。

例えば存在確認用の代表path:

```text
artifacts/.aiqh-ignore-probe
```

を:

```text
git check-ignore --no-index -v
```

で確認する。

Git repoでない場合だけfallbackとして単純判定を使うか、`needed=true`を安全側に返す。

### 追加テスト

- `artifacts/` → needed false
- `artifacts/\n!artifacts/` → needed true
- `/artifacts/` → false
- `artifacts/**`等、Gitが実際にignoreするpattern → false
- no `.gitignore` → true

---

# M1-R1-001〜010 の再判定

## M1-R1-001 — 解消

v0.2.0のself-matchを修正し、v0.2.0をsupersededとして残し、v0.2.1を新tagとして作る運用は妥当。

release順序:

```text
commit
→ per-commit worktree verification
→ clean tree
→ push
→ annotated tag
→ tag push
```

も前回指摘への適切な修正。

untracked nonignored filesもsecurity scan対象にしたため、pre-commit self verifyで新規sourceを見落とす再現条件も潰れている。

**追加指摘:** M1-R2-001はuntracked `.env*`という別経路。

---

## M1-R1-002 — 解消

multiline PEMは`scanMode: "block"`とBEGIN→END state machineで検出される。

- RSA
- EC
- plain PRIVATE KEY
- unterminated PEM

の回帰テストもあり、前回の「line-by-line regexではPEMを検出できない」問題は解消。

---

## M1-R1-003 — 解消

Node adapterのreasonからpackage script本文が除去された。

さらに:

- normal init line → `maskSecrets`
- `--json` → `maskDeep`
- generated comments → `maskSecrets`

のdefence-in-depthが追加された。

script body secretの前回再現条件は解消。

---

## M1-R1-004 — 元のfail-openは解消

1 MiB超を無条件skipする処理は削除され、大容量textもscanされる。

前回の:

```text
size > 1MiB → skip → PASS
```

という直接的fail-openは解消。

**追加指摘:** M1-R2-004。巨大1行ではstreaming設計が実質的に全file保持へ退化する。

---

## M1-R1-005 — PARTIAL

`.env* + !.env.production`のnegation無視問題はGit自身の`check-ignore`利用によって解消。

しかし「4 representative pathがignoreされる = `.env.*`が十分保護される」という仮定が残り、実在する`.env.staging`を見逃せる。

→ M1-R2-001。

---

## M1-R1-006 — 解消

`init --write`前に:

```text
parseConfigText
→ resolveConfig
```

を実行するため、zero required / duplicate / blank command等のruntime-invalid configをwriteしない。

前回再現条件は解消。

---

## M1-R1-007 — 解消

config fileだけでNode toolをavailableにせず、local evidenceを要求。

direct invocationも:

```text
npx --no-install
```

になり、adapterが暗黙downloadする経路は解消。

「dependency宣言はあるがnode_modules未install」の場合にavailableとなり後でfailする点はpacketのKnown Riskどおりで、fail closedなので今回findingにはしていない。

---

## M1-R1-008 — 解消（Option Bとして妥当）

JSON Schemaを「structural schema」と明示し、runtime validationが最終判断であることを文書化。

blank commandはJSON Schemaへpatternとして反映。

unique names / required>=1はknown divergenceとしてtest固定。

Option Bとして整合している。

---

## M1-R1-009 — PARTIAL

pytest prerequisiteと`venvBin()`のtool executable判定は修正された。

しかし実際のcommand executorである`<venv>/bin/python`自体のX_OK確認がない。

→ M1-R2-003。

---

## M1-R1-010 — 解消

`.gitignore` / `package.json` optional writeはtry/catchされ、

```text
aiqh init: failed to update ...
exit 2
```

へ統一された。

partial updateもdocsへ明記。

前回再現条件は解消。

---

# 指摘なしと判断した観点

今回の確認範囲では、以下に追加問題を確認しなかった。

1. v0.2.0をtag移動せずsupersededとして残す運用
2. v0.2.1を新releaseとする運用
3. committed HEADをrelease判定根拠にするルール
4. multiline PEM state machine
5. unterminated PEMをfail-closedでfindingにする設計
6. StringDecoderによるUTF-8 chunk boundary処理
7. secret findingへmatched value / line contentを保存しない設計
8. canonical `[REDACTED:<category>]` pre-processing
9. masker / scanner pattern definitionsの共有
10. scan:false categoryを理由付きで明示する方針
11. script bodyをDetection.reasonへ載せない修正
12. init normal outputのmasking
13. init JSON outputのmaskDeep
14. generated commentのmasking
15. generated configのruntime validation
16. direct Node tool invocationの`npx --no-install`
17. JSON Schema Option B（structural only）の文書化
18. optional init writeのtry/catch
19. package version 0.2.1とv0.2.1 tagを揃える方針

---

# 独立再現した項目

## 1. 実在する未ignore `.env.staging`

パケット掲載の`patterns.ts` / `scan.ts`をそのまま取り出して実行。

`.gitignore`:

```gitignore
.env
.env.local
.env.production
.env.development
```

untracked:

```text
.env.staging
```

結果:

```json
{
  "filesUntracked": 1,
  "findings": []
}
```

→ M1-R2-001。

---

## 2. Python interpreter non-executable

パケット掲載の`context.ts` / `python.ts`をそのまま取り出して実行。

```text
.venv/bin/python  0644
.venv/bin/pytest  0755
tests/
```

結果:

```json
{
  "pythonBin": null,
  "pytestBin": ".venv/bin/pytest",
  "detection": {
    "status": "available",
    "command": ".venv/bin/python -m pytest -q tests/"
  }
}
```

→ M1-R2-003。

---

## 3. `artifacts/` negation

Git repoの`.gitignore`:

```gitignore
artifacts/
!artifacts/
```

Git自身:

```text
git check-ignore -v artifacts/x
→ NOT IGNORED
```

しかし現行`proposeGitignore()`のline判定では`artifacts/`行が存在するため`needed=false`。

→ M1-R2-005。

---

# 見ていない / 独立実行していない範囲

今回のレビューは`review-packet-m1-r1.md`を主な根拠としている。

独立実行していないもの:

- GitHub上の`630f2e3`とpacketのbyte-level一致
- v0.2.1 tag / tag objectのremote実在
- 231 tests × 10回の実ログ
- 10 commitsのworktree verify実行そのもの
- `npm run verify`
- `npm run verify:dist`
- package smoke tarball
- `npm audit`
- Target A / B repositoryの実内容
- Target Bの17 anthropic findingsの実値
- npm registry policy
- Linux / Windowsでの全adapter挙動
- M1で変更されていないM0コード全体

また、巨大newlineなしfileについてはコード構造からの判断であり、意図的に数百MiB〜GiBを割り当てるOOM実験は行っていない。

---

# 推奨対応順

1. **M1-R2-001**
   - 実在するuntracked / nonignored `.env*`を内容を読まずfindingへ
2. **M1-R2-002**
   - lstat ENOENT以外をScanError
3. **M1-R2-003**
   - venv python本体もX_OK確認
4. **M1-R2-004**
   - huge single-line inputをbounded memoryまたはcontrolled ERRORへ
5. **M1-R2-005**
   - `artifacts/` proposalもGit semanticsで判定

---

# v0.2.1 / M1 完了判断

`v0.2.1`は`v0.2.0`より明確に改善され、packet記載のself verifyもPASSしている。

前回のHigh 3件のうち:

- self verify / release process
- multiline PEM
- script-body secret propagation

は具体的再現条件として解消している。

ただしM1-R2-001はSecurity Scanの`.env hygiene`に直接関わるfail-openであり、**M1 baselineを完全に固定する前に修正を推奨**する。

推奨運用:

- v0.2.1 tagは移動・削除しない
- R2 findingsを修正
- committed HEADで
  - typecheck
  - full tests
  - source verify
  - built verify
  - security PASS
  を確認
- `v0.2.2` をmaintenance releaseとして追加

Criticalは確認していないが、M1-R2-001はHighとしてrelease前修正を推奨する。
