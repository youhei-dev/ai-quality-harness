<!--
aiqh 記録用の注記: 受領原文（~/Downloads、9/19 付）のうち、本体の Security Scan（M1-R1-002 の状態機械・url-credential パターン）に
一致する例示 8 行（原文の行番号 69, 177, 190, 955, 180, 192, 957, 210）を、テストのダミー値と同じ分割表記
（"-----BEGIN RSA " + "PRIVATE KEY-----"、<scheme>://<user>:<password>@<host>）に変えた。意味は変えていない。それ以外は原文のまま。
無改変の原文の SHA-256: a040e21e9db5fb259ea2c69c17a4fdc8dad687a1feeb1d3cc3e1ef4872b83cd8
-->

# M1 独立レビュー R1 — Claude Code 修正依頼用

対象: `ai-quality-harness` M1  
レビュー資料: `review-packet-m1.md`  
レビュー対象範囲: `v0.1.7..v0.2.0`  
packet記載の `v0.2.0`: commit `680869d` / tag object `2e2685f`  
想定出力先: `docs/reviews/m1/independent-review-r1.md`

## レビュー方針

実装AIの説明・既知リスク・テスト結果を結論として採用せず、パケットに掲載された実コード、差分、テスト、Original Requestを独立に確認した。

特に以下を重点確認した。

- M0のfail-closed性がM1でも維持されているか
- check adapterが「検出＋推奨」に留まり、誤って実行・書込を行わないか
- `aiqh init` がread-onlyを既定とし、安全なconfigだけを書くか
- Security Scanが要求されたtracked file / `.env` / `.gitignore`を実際に検査できているか
- R-012（masker / scannerのパターン共有）が実質的にも成立しているか
- M1自身のself verify / release gateが要求どおりか
- JSON Schemaがruntime config validationと矛盾しないか
- target repositoryの情報・秘密値を新たに出力・複製しないか

## 総括

今回の独立レビューでは以下を指摘する。

- **High: 3件**
- **Medium: 6件**
- **Low: 1件**

特に優先すべきなのは以下。

1. **M1-R1-001** — `v0.2.0` 自身がrequired security checkに失敗した状態でtag化されている
2. **M1-R1-002** — 通常の複数行PEM private keyをSecurity Scanが検出できない
3. **M1-R1-003** — `aiqh init` が既存package script内の秘密値をconsole / JSON / config commentへ再出力・複製し得る

---

# Findings

## M1-R1-001

- **ID:** M1-R1-001
- **重要度:** High
- **種別:** テスト不足 / 設計
- **対象:** release `v0.2.0` / `aiqh.config.jsonc` / `src/security/patterns.ts` / `CHANGELOG.md` / `docs/ROADMAP.md` / `docs/reports/M1_REPORT.md`
- **内容:** M1の完了条件と明示的な開発制約に反して、`v0.2.0` は自分自身のrequired security checkにFAILする状態でrelease/tag化されている。また複数のM1文書が「自己verify PASS」「security PASS」「M1完了」と記録しており、実測結果と矛盾している。

### 根拠

Original Requestには次が明記されている。

- harness自身へSecurity Scanを含むself applicationを行う
- M0 propertiesを維持する
- **each commit must pass typecheck / tests / verify on its own**

しかしpacketのVerification Resultsでは、`v0.2.0`だけでなくM1の5 commitsすべてで:

```text
npm run verify → VERIFY FAILED
```

となっている。

原因は `src/security/patterns.ts` のURL credential説明コメント:

```text
<scheme>://<user>:<password>@<host>
```

がSecurity Scan自身の`url-credential` patternに一致するため。

packetはさらに、

```text
npm run verify
npm run verify:dist
```

が `v0.2.0` でともにexit 1であることを記録している。

一方でM1のREADME / ROADMAP / M1_REPORT / CHANGELOG差分には、

```text
自己 verify PASS
security PASS
M1 complete
```

相当の記述が残っている。

### 重要な補足

pre-tag時にSecurity ScanがPASSした理由は、scannerが`git ls-files`だけを見るため、M1で新規作成したファイルがまだuntrackedで検査対象外だったから、とpacket自身が説明している。

つまりこれはscannerのtracked-only仕様そのものより、

**「release判定をcommitted HEADに対するself verifyより前に行った」**

release process上の欠陥。

### 修正案

1. `src/security/patterns.ts` のコメントをsecret shapeにならない表現へ変更する。
   例:

   ```text
   <scheme>://<user>:<password>@<host>
   ```

2. 修正後、committed HEADで以下を実行する。

   ```text
   npm run typecheck
   npm run test
   npm run verify
   npm run verify:dist
   ```

3. `v0.2.0` tagは削除・付け替えしない。
4. 修正版を **`v0.2.1`** としてreleaseする。
5. CHANGELOGで `v0.2.0` を `superseded / known-bad: self verify security FAIL` と明記する。
6. release手順に以下の順序を固定する。

   ```text
   commit
   → committed HEADでself verify
   → clean working tree確認
   → tag
   → tagされたtreeでも必要ならself verify
   ```

7. M1 completion文書は実測結果に合わせて訂正する。

---

## M1-R1-002

- **ID:** M1-R1-002
- **重要度:** High
- **種別:** セキュリティ / テスト不足
- **対象:** `src/security/scan.ts` lines 65–100 / `src/security/patterns.ts` private-key rule / `tests/security-compat.test.ts`
- **内容:** scannerがファイルを1行ずつ分割してregexを適用するため、`[\s\S]*?`を使った**複数行PEM private key patternが実際のprivate keyを検出できない**。

### 根拠

private-key patternは:

```ts
/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
```

であり、BEGIN〜ENDを複数行にまたいで検出する設計。

一方scannerは:

```ts
const lines = buf.toString("utf8").split(/\r?\n/);

for (const [i, rawLine] of lines.entries()) {
  const line = stripCanonicalMarkers(rawLine);
  for (const s of scanners) {
    s.regex.lastIndex = 0;
    if (s.regex.test(line)) {
      ...
    }
  }
}
```

と、各regexへ**1行ずつ**しか渡していない。

通常のPEM:

```text
"-----BEGIN RSA " + "PRIVATE KEY-----"
MIIE...
...
"-----END RSA " + "PRIVATE KEY-----"
```

では1行内にBEGINとENDが共存しないため、private-key ruleは一致しない。

### 独立再現

掲載コードの`scanRepository()`を使用し、git-trackedな:

```text
"-----BEGIN RSA " + "PRIVATE KEY-----"
MIIEfakekey
"-----END RSA " + "PRIVATE KEY-----"
```

をscanした。

結果:

```json
[]
```

となり、secret findingは0件だった。

### なぜ既存互換テストが通るか

`tests/security-compat.test.ts` のprivate-key sampleは実際のPEMではなく:

```text
"-----BEGIN RSA " + "PRIVATE KEY-----" MIIEfakekey "-----END RSA " + "PRIVATE KEY-----"
```

という**1行形式**になっている。

そのためscannerのline-by-line実装でもPASSし、実際のmultiline caseを検出できていない。

### 修正案

推奨:

- multilineを必要とするpatternはファイル全体へ適用する
- match indexから1-based line numberを計算する
- line-oriented patternは現在方式でもよい

またはprivate-key専用に:

```text
BEGIN PRIVATE KEY line
→ 対応するEND PRIVATE KEY line
```

をstate machineで検出する。

### 追加テスト

少なくとも以下。

- RSA PRIVATE KEY multiline
- PRIVATE KEY multiline
- EC PRIVATE KEY multiline
- 先頭/末尾のline numberが正しくfindingへ入ること
- 値本体がresult / consoleへ含まれないこと

---

## M1-R1-003

- **ID:** M1-R1-003
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/adapters/node.ts` / `src/commands/init.ts` lines 90–125, 189–197 / `src/config/generate.ts` lines 51–59
- **内容:** `aiqh init` がtarget repositoryの`package.json` script本文をadapterの`reason`として保持し、それをmaskせずconsole / `--json` / 生成configコメントへ出力するため、**既存script内の秘密値を複製・漏えいさせる**。

### 根拠

Node adapterは例えばlint scriptを:

```ts
reason:
  `package.json scripts.lint = ${JSON.stringify(lintScript)}`
```

としている。

`runInit()`はこの`reason`をそのまま:

```ts
log(`             ${row.reason}`);
```

でconsoleへ出す。

`--json`でも:

```ts
audit: auditRows(resolution)
```

をそのままJSON化する。

さらに`generateConfigJsonc()`は:

```ts
// lint: node-eslint — <chosen.reason>
```

としてreasonを生成configコメントへコピーする。

`maskSecrets()` / `maskDeep()`はこの経路に使われていない。

### 独立確認

target `package.json` に:

```json
{
  "scripts": {
    "lint": "eslint . --token=ghp_<synthetic-secret>"
  }
}
```

相当を置いてadapterを実行すると、`Detection.reason`へtokenを含むscript全文がそのまま入ることを確認した。

そのreasonは現コードでは:

- 通常`aiqh init` console
- `aiqh init --json`
- `aiqh.config.jsonc` proposal comment
- `--write`時の実config comment

へ流れる。

### 影響

M0では「report / consoleのsecret-looking stringsをmaskする」方向で防御してきたが、M1で新しいconsole/config出力経路が追加され、secret propagation surfaceが増えている。

特に`--write`は、

**元のpackage.jsonにしかなかったsecretを別ファイル`aiqh.config.jsonc`へコピーする**

ため、単なる画面表示以上の問題。

### 修正案

第一推奨:

Node adapterのreasonへraw script本文を入れない。

例:

```text
package.json scripts.lint found
package.json scripts.typecheck found
package.json scripts.build found
```

script本文自体は表示不要。

追加でdefense-in-depthとして:

- `runInit`のfree-text outputを`maskSecrets`
- `--json`出力を`maskDeep`
- generated commentsへ入れるreason / note / hintもmask

を検討する。

### 追加テスト

target package.json scriptにruntime組立のsynthetic secretを入れ:

- proposal outputに値がない
- `--json`に値がない
- `configText`に値がない
- `--write`後の`aiqh.config.jsonc`に値がない

ことを確認する。

---

## M1-R1-004

- **ID:** M1-R1-004
- **重要度:** Medium
- **種別:** セキュリティ / 設計
- **対象:** `src/security/scan.ts` lines 65–83, `MAX_FILE_BYTES`
- **内容:** 1 MiBを超えるgit-tracked text fileをSecurity Scanが無条件でskipし、**skipしたことがsecurity verdictへ影響しないためfail-open**になっている。

### 根拠

実装:

```ts
if (stat.size > MAX_FILE_BYTES) {
  result.skippedLarge += 1;
  continue;
}
```

`runSecurityScan()`のexit codeは:

```ts
result.findings.length === 0 ? 0 : 1
```

だけで決まる。

したがって`skippedLarge > 0`でもfindingがなければPASS。

Original Requestは:

> Built-in Security Scan over git-tracked files

としており、1 MiB超をsecurity coverage外にする要件は書かれていない。

### 独立再現

1 MiB超のtracked text file末尾へsynthetic AWS access-key shapeを置いた。

結果:

```text
skippedLarge = 1
findings = []
```

となり、security scanはfindingなしとして扱える。

### 影響

大きなJSON、generated text、fixture、log、bundle等へcredentialが混入した場合にgateを通過する。

意図的な回避も容易:

```text
secret-containing fileを1MiB超へpadding
```

### 修正案

いずれか。

1. text fileはstreaming scanしてサイズ制限をなくす（推奨）
2. M1では`skippedLarge > 0`をfinding / ERRORとしてfail closedにする
3. 将来allowlistを設ける場合も、明示的なpolicyにする

少なくとも「skippedLargeを表示するだけでPASS」はsecurity gateとして弱い。

### 追加テスト

- 1 MiB超text + secret → FAIL
- 1 MiB超clean text → policyどおりPASS/ERROR
- 大容量でもsecret valueは出力しない

---

## M1-R1-005

- **ID:** M1-R1-005
- **重要度:** Medium
- **種別:** セキュリティ
- **対象:** `src/security/scan.ts` — `checkGitignore()` lines 127–142
- **内容:** `.gitignore`のnegation rule (`!pattern`) を完全に捨てて評価するため、実際には`.env.*`がignoreされていないのに「coverageあり」と誤判定できる。

### 根拠

実装は:

```ts
.filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"))
```

で`!` ruleを全削除した後、

```ts
.env*
```

等が存在するかだけを見る。

例えば:

```gitignore
.env*
!.env.production
```

の場合、scannerの内部判定では:

```text
.env と .env.* はcovered
```

となりgitignore findingは0件。

しかしGitの実際の意味では`.env.production`はnegationによって再includeされる。

### 独立確認

上記`.gitignore`に対し:

```text
git check-ignore -v .env .env.production
```

を実行すると、`.env.production`は`!.env.production` ruleに一致する。

同じrepoを現行`scanRepository()`で確認すると、gitignore findingは0件だった。

### 修正案

regex風の自前簡易判定ではなく、Git自身に判定させる。

候補:

```text
git check-ignore --no-index
```

を利用して代表パス:

```text
.env
.env.local
.env.production
```

が最終的にignoredか確認する。

example/template用のnegation:

```text
!.env.example
```

は許容したいので、sensitive variantとexample variantを分けて判定する。

---

## M1-R1-006

- **ID:** M1-R1-006
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/commands/init.ts` lines 135–151 / `src/config/generate.ts`
- **内容:** `aiqh init --write` は「check件数が0か」しか検査しておらず、**required checkが0件のconfigを生成・書込できる**。これはM0のfail-closed config invariantと矛盾する。

### 根拠

M0 runtime schemaでは:

```text
at least one check must be required
```

がcross-field validationとして存在する。

M1 `runInit()`側のwrite guardは:

```ts
if (checks.length === 0) {
  ... refuse ...
}
```

のみ。

一方、E2E adapterのsuggestionは:

```ts
required: false
```

となる。

### 再現可能な構成

non-git Node projectで:

- `package.json`
- Playwright dependency / config
- build scriptなし
- tsconfigなし
- eslintなし
- vitest/jestなし
- lockfileなし

とすると、

- security: unavailable（non-git）
- e2e: available (`required:false`)
- その他: unavailable

になり得る。

`checks.length === 1`なので`init --write`はconfigを書くが、required checkは0件。

そのconfigはruntime validationでrejectされる。

### 修正案

最も安全なのは、**書込前に生成したconfigをruntime parser / resolver自身でvalidateすること**。

例:

```text
generateConfigJsonc
→ parseConfigText
→ resolveConfig
→ successした場合だけwrite
```

これならrequired 0件以外のgenerator/runtime driftも同時に防げる。

最小修正なら:

```ts
if (!checks.some((c) => c.required !== false)) {
  refuse with EXIT_ERROR
}
```

でもよい。

### 追加テスト

Playwright-only / non-git fixtureで:

- proposal表示は可能
- `--write`はexit 2
- invalid configを書かない

を確認する。

---

## M1-R1-007

- **ID:** M1-R1-007
- **重要度:** Medium
- **種別:** 設計 / セキュリティ
- **対象:** `src/adapters/node.ts`
- **内容:** Node adaptersがconfig fileの存在だけでtoolを`available`と判定し、`npx <tool>`を提案するケースがある。toolがlocal dependencyとして存在しない場合、`npx`がnetworkからpackageを取得し得るため、**「検出したcheckを実行するだけ」のつもりで外部コード取得が発生し得る**。また単純にcommandが再現不能になる。

### 対象例

- ESLint:
  - config OR `eslint` dependency
  - configだけでも `npx eslint .`
- Vitest:
  - config OR dependency
  - configだけでも `npx vitest run`
- Jest:
  - config OR dependency
- Playwright:
  - config OR dependency
- TypeScript:
  - `tsconfig.json`だけで`npx tsc`

adapterのenable hintでは:

```text
aiqh does not install it
```

という方針だが、生成されたverify commandが後でpackage取得を起こす可能性がある。

### 修正案

推奨:

- config存在だけでは`available`にしない
- local dependency / local binaryの存在もrequireする
- 未導入なら`unavailable` + install hint

またはcommandをlocal-onlyに固定する。

例:

```text
npx --no-install eslint .
npx --no-install tsc ...
```

利用npm versionとの互換を確認すること。

### 追加テスト

- configあり / dependencyなし → unavailable
- dependencyあり → available
- generated commandがnetwork installを要求しないこと

---

## M1-R1-008

- **ID:** M1-R1-008
- **重要度:** Medium
- **種別:** 設計 / テスト不足
- **対象:** `schema/aiqh.config.schema.json` / `src/config/json-schema.ts` / `tests/schema.test.ts`
- **内容:** 同梱JSON Schemaがruntime config validationの意味論を完全には表しておらず、**editor上ではvalidだが`aiqh verify`ではinvalidになるconfig**を許容する。

### 根拠

生成されたJSON Schemaでは例えば:

```json
"command": {
  "type": "string"
}
```

だけであり、runtime側の:

```text
checks[].command が空白のみでないこと
```

を表現していない。

さらにM0 runtime validationには:

- duplicate check name禁止
- required checkが最低1件必要

というcross-field invariantがある。

生成Schemaにはこれらが存在しない。

`z.toJSONSchema(... { unrepresentable: "any" })` により、Zodのrefinement / superRefineがJSON Schemaへ落ちない部分があると考えられる。

### テスト不足

`tests/schema.test.ts`は:

- committed schemaとgenerator出力が一致
- top-level propertiesが存在

しか確認しておらず、

**runtime-valid / JSON-Schema-validのsemantic parity**

を検証していない。

### 影響

docs / ROADMAPではJSON Schemaを:

```text
エディタでの検証・補完
```

としているため、ユーザーはSchema validationをruntime validationと同等だと解釈し得る。

### 修正案

選択肢A:

JSON Schemaをruntime semanticsに近づける。

- command: whitespace-onlyをrejectするpattern
- required check: JSON Schema conditional / containsで可能な範囲を表現
- その他representableなrefinementをpost-process

duplicate-nameのように表現困難なものはdescriptionへ明記する。

選択肢B:

JSON Schemaを「structural schema only」と明文化し、

```text
最終的なsemantic validationは aiqh が行う
```

とREADME / CONFIG_SPECへ明記する。

どちらの場合もsemantic parity / known-divergence testを追加する。

---

## M1-R1-009

- **ID:** M1-R1-009
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/adapters/context.ts` / `src/adapters/python.ts`
- **内容:** Python adapterの`available`判定が実行可能性を十分確認していない。特にPython Playwright adapterは**実際に実行する`pytest`の存在を確認せずavailableを返す**。

### 具体例1: Playwright

判定条件:

```ts
playwright binary exists
&& tests/e2e exists
```

だけ。

しかしsuggestionは:

```text
<venv>/bin/python -m pytest -q tests/e2e
```

である。

`pytest`未導入でもPlaywright adapterはavailableになる。

### 独立確認

以下だけがあるfixture相当を作成:

```text
.venv/bin/python
.venv/bin/playwright
tests/e2e/
```

`pytest`なし。

結果:

```text
python-playwright status = available
suggestion = .venv/bin/python -m pytest -q tests/e2e
```

となることを確認した。

### 具体例2: executable判定

`PythonContext.venvBin()`の型コメントは:

```text
Relative path of an executable
```

だが実装は:

```ts
existsSync(...)
```

のみ。

実行permissionを見ていない。

packetのKnown Riskでも「existence and executability only」と説明されているが、実コードはexistenceだけ。

### 修正案

- Playwright adapter:
  - `pytest` availabilityもrequire
  - 必要なら`pytest-playwright` evidenceも確認
- `venvBin()`:
  - POSIXでは`accessSync(path, constants.X_OK)`
  - module availabilityを保証したいならconsole-script存在だけでなく、必要に応じてmetadataを読む

adapterは実行しないという境界は維持しつつ、available判定を実commandの前提条件と一致させる。

---

## M1-R1-010

- **ID:** M1-R1-010
- **重要度:** Low
- **種別:** 例外処理
- **対象:** `src/commands/init.ts` lines 153–174 / `src/cli.ts` global catch
- **内容:** `runInit()`のコメントは「write error → exit 2」を契約としているが、`--write-gitignore`と`--write-scripts`のread / parse / write処理はtry/catchされておらず、例外をthrowする。

### 根拠

config本体のwriteだけは:

```ts
try {
  writeFileSync(...)
} catch {
  exit = EXIT_ERROR
}
```

になっている。

しかし:

```ts
writeFileSync(.gitignore)
readFileSync(package.json)
JSON.parse(package.json)
writeFileSync(package.json)
```

はcatchされていない。

CLI経由では最上位catchに到達するためexit 2にはなるが、表示は:

```text
VERIFY ERROR (internal error)
```

となり、`init`コマンドのエラーとして不正確。

programmaticな`runInit()`利用ではPromise rejectになり、「return exit code」というAPI契約とも異なる。

### 修正案

各optional writeを`try/catch`し:

```text
aiqh init: failed to update .gitignore: ...
aiqh init: failed to update package.json: ...
```

を出し`EXIT_ERROR`を返す。

必要なら複数write flagのpartial updateが起き得ることもdocsへ明記する。

---

# 指摘なしと判断した観点

今回確認した範囲では、以下の方針・実装には明確な問題を確認しなかった。

1. **Adapter boundary**
   - adapterはdetect + suggestionのみ
   - `spawn`やverdict操作をadapter自身が行わない
   - M0 execution pathを維持している

2. **Resolution**
   - categoryごとに最初のavailable adapterをchosenにする
   - 他のavailable adapterをalternativeとして保持する

3. **Security pattern sharing**
   - masker / scannerのpattern定義を`SECRET_PATTERNS`へ共通化した設計自体はR-012への適切な対応
   - mask-only categoryを明示的に`scan:false`としてreason付きで公開する設計はHuman Decisionと整合

4. **Secret finding payload**
   - scannerのfinding objectはcategory / relative path / line / messageで、matched secret value自体を保持しない方針

5. **Tracked `.env`**
   - `.env` / `.env.<suffix>`のtracked fileをfindingにする基本動作
   - example/sample/template/distをinformational扱いする基本方針

6. **`aiqh init` default**
   - flagなしではtarget filesを書き換えない
   - `--write`だけではconfigのみ
   - existing configを`--force`なしで上書きしない
   - `.gitignore` / scriptsは別flag

7. **Security check default**
   - git repositoryではbuiltin security suggestionがrequired=true

8. **Distribution**
   - M1で`npm link`を採用しtarget package.jsonへdependencyを追加しない判断はOriginal Requestと整合

9. **Target-specific information**
   - packet / repositoryへ2つの実target固有pathや具体的finding lineを持ち込まず、M1_REPORTでは件数中心にしている方針

10. **Output parser**
    - M1ではinterface onlyに留めておりHuman Decisionと整合

---

# 独立再現した項目

今回こちらで掲載コード相当を実行して確認したもの:

## 1. Multiline private key

tracked file:

```text
"-----BEGIN RSA " + "PRIVATE KEY-----"
MIIEfakekey
"-----END RSA " + "PRIVATE KEY-----"
```

に対し現行`scanRepository()`:

```text
secret findings = []
```

→ M1-R1-002

## 2. `.gitignore` negation

```gitignore
.env*
!.env.production
```

に対し現行scanner:

```text
gitignore findings = []
```

一方Git自身は`.env.production`へnegation ruleを適用。

→ M1-R1-005

## 3. Large tracked file

1 MiB超text file末尾へsynthetic AWS key shapeを配置。

現行scanner:

```text
skippedLarge = 1
findings = []
```

→ M1-R1-004

## 4. Adapter reason secret propagation source

package scriptへsynthetic GitHub-token shapeを入れると:

```text
Detection.reason
```

にscript本文とtokenがそのまま入ることを確認。

→ M1-R1-003

## 5. Python Playwright prerequisites

`python` + `playwright` + `tests/e2e`のみ、`pytest`なしでも:

```text
python-playwright status = available
command = <venv>/bin/python -m pytest -q tests/e2e
```

となることを確認。

→ M1-R1-009

---

# 見ていない / 独立実行していない範囲

以下はpacket記載を確認しただけで、こちらでは実行・外部照合していない。

- GitHub上の`680869d`とpacketのbyte-level一致
- `v0.2.0` tag / tag objectの実在
- 197 tests × 10回の実ログ
- 全5 commitのworktree verificationそのもの
- `npm run build`
- package smokeの実tarball
- `npm audit`
- 実target A / B repositoryの中身
- Target Bの17 anthropic findingsの実値・12件の未確認finding
- `npm link`された実PATH環境
- npm registry policy (`allow-git=none`, `min-release-age=7`) の実設定
- Linux / WindowsのM1 adapter挙動
- M0 unchanged files全体の再レビュー

また、Original Request上scanner scopeが「git-tracked files」と明示されているため、**untracked fileをscanしないこと自体はfindingとしていない**。

ただしrelease前self verifyをuntracked状態で実行し、それをrelease PASS根拠にしたprocessはM1-R1-001で指摘している。

---

# 推奨対応順

## 最優先

1. **M1-R1-001**
   - v0.2.0 self verify failure修正
   - v0.2.1 release
   - completion docs訂正
   - release gate順序固定

2. **M1-R1-002**
   - real multiline private key detection

3. **M1-R1-003**
   - initからraw package script contentsを排除 / mask

## 次点

4. **M1-R1-004**
   - large tracked textをfail-openでskipしない

5. **M1-R1-005**
   - gitignore negationを正しく評価

6. **M1-R1-006**
   - generated configをruntime validateしてからwrite

7. **M1-R1-007**
   - `npx`による暗黙downloadを防ぐ / local tool evidenceを要求

8. **M1-R1-008**
   - JSON Schemaとruntime validationの差を整理

9. **M1-R1-009**
   - Python adapter prerequisitesをactual commandと一致させる

10. **M1-R1-010**
    - optional write errorsをinit固有のexit 2として処理

---

# リリース判断

現時点の `v0.2.0` を **「M1 complete / self verify PASS」状態とは判断しない**。

理由はM1-R1-001だけでも十分であり、packet自身の実測でrequired security checkがFAILしているため。

v0.2.0 tagはimmutable historyとして残し、修正後に`v0.2.1`を作る方針を推奨する。

そのうえで少なくともM1-R1-001〜003を解消し、committed HEADで:

```text
typecheck PASS
full tests PASS
source verify PASS
built verify PASS
security PASS
```

を確認してからM1 completion baselineを固定するのが妥当。
