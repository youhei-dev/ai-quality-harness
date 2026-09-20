<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-0-r1-for-claude.md、9/20 付）のうち、本体の Security Scan に一致する
例示 1 行（原文の行番号 234、合成 AWS キーの例）を、テストのダミー値と同じ分割表記（"AKIA" + "ABCDEFGHIJKLMNOP"）に変えた。意味は変えていない。
それ以外は原文のまま。無改変の原文の SHA-256: 63dcb1d9cc8a11c31ec517ffd0c516acfe181f6555294a5d9c0dbd0a6d7a8799
-->

# M2-0 独立レビュー R1 — Claude Code 修正依頼用

対象: `ai-quality-harness` M2-0  
レビュー資料: `review-packet-m2-0.md`  
対象範囲: `v0.2.3..v0.3.0`  
packet記載の `v0.3.0`: commit `8e81d15` / tag object `3e54718`  
想定保存先: `docs/reviews/m2-0/independent-review-r1.md`

## 総括

M1 R3から持ち越された5件については、標準設定・提示された回帰条件の範囲では概ね適切に修正されています。

特に以下は確認できました。

- 4 KiB固定overlapだけに依存せず、anchor/candidateを最大64 KiBまで持ち越す
- maxCarry超過候補を黙って捨てず`oversized-candidate`としてfail closed
- `--write-gitignore`がnegation後へ`artifacts/`を追記して修復する
- 実artifact pathを複数probeする
- `.gitignore` sourceがtrackedかを確認する
- PEM block findingをoverlap間でdedupeする
- key-value categoryをshared patternのままscan対象へ追加する
- `security.allow`が衛生findingを抑制しない
- masker/scannerのpattern共有を維持する

一方、独立レビューでは以下を指摘します。

- **High: 1件**
- **Medium: 2件**

最優先は **M2-0-R1-001** です。

---

# Findings

## M2-0-R1-001

- **ID:** M2-0-R1-001
- **重要度:** High
- **種別:** バグ / 設計
- **対象:** `src/config/schema.ts` — `securitySchema`、`src/config/load.ts` — `resolveSecurity()`、`src/security/scan.ts` — `LineAssembler.push()`
- **内容:** `maxLineBytes` / `lineOverlapBytes` / `maxCarryBytes` をそれぞれ「正の整数」としか検証しておらず、値の相互関係によって`LineAssembler.push()`が進捗不能になり、**正規にvalidationを通ったconfigでSecurity Scanが無限ループする**。
- **根拠:** schemaは現在、

  ```ts
  maxLineBytes: z.number().int().positive().optional(),
  lineOverlapBytes: z.number().int().positive().optional(),
  maxCarryBytes: z.number().int().positive().optional(),
  ```

  だけで、3値の順序制約を持たない。

  `LineAssembler.push()`は長行時に、

  ```ts
  const floor = Math.max(0, window.length - lineOverlap);
  let from = Math.min(decision.start, floor);

  if (window.length - from > maxCarryBytes) {
    onOversizedCandidate(...);
    from = floor;
  }

  pending = window.slice(from);
  ```

  としている。

### 再現1: `lineOverlapBytes > maxLineBytes`

例:

```json
{
  "security": {
    "maxLineBytes": 10,
    "lineOverlapBytes": 20,
    "maxCarryBytes": 64
  }
}
```

11文字の候補なしlong lineの場合、

```text
pending.length = 11
floor = max(0, 11 - 20) = 0
from = 0
pending = window.slice(0)
```

となり、`pending.length`は11のまま。

`while (pending.length > maxLineBytes)`が永遠に成立する。

パケット掲載の`LineAssembler`そのものをNodeのTypeScript strip-typesでimportし、この設定で11文字を`push()`したところ、処理はreturnせずtimeoutした。

### 再現2: `maxCarryBytes > maxLineBytes`

overlapが小さくてもcandidateを保持する場合に同じ問題が起こる。

例:

```text
maxLineBytes = 1024
lineOverlapBytes = 128
maxCarryBytes = 2048
```

candidateがwindow先頭から始まり、現在のcandidate長が1500の場合、

```text
decision.start = 0
1500 <= maxCarryBytes
from = 0
pending remains 1500
1500 > maxLineBytes
```

となり、同じwindowを無限に処理する。

なお、`tests/regression-m2-0-008-security-settings.test.ts`はまさに

```text
maxLineBytes=1024
lineOverlapBytes=128
maxCarryBytes=2048
```

を「valid settings」として受理しているため、現在のvalidationではこの関係が正式に許容されている。

### 追加の不整合

`lineOverlapBytes > maxCarryBytes`も許容される。

oversized candidate時に`from=floor`へ戻すため、保持されるoverlap自体が`maxCarryBytes`を超え得る。

したがって「carryはmaxCarryBytes以下」という仕様とも一致しない。

### 影響

- `aiqh security-scan`がCPUを使い続けてreturnしない
- `aiqh verify`経由では最終的にouter check timeoutでFAILし得るが、それまで長時間hangする
- standalone scannerでは正常なexit 1 / 2に到達しない
- CLIはSIGINT listenerを登録してNodeの既定終了動作を解除しているため、同期的な無限loop中はJS signal callbackも実行できず、Ctrl+Cで即時回復できない

これは「fail closed」ではなく「終了しない」状態。

### 修正案

resolved値に対して少なくとも次を保証する。

```text
0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes
```

raw configで一部だけ指定された場合にもdefaultsを適用した後で検証する必要がある。

そのため、`resolveSecurity()`でdefault適用後にcross-field validationする方法が単純。

例:

```ts
if (lineOverlapBytes > maxCarryBytes) {
  throw new ConfigError("security.lineOverlapBytes must be <= security.maxCarryBytes");
}
if (maxCarryBytes > maxLineBytes) {
  throw new ConfigError("security.maxCarryBytes must be <= security.maxLineBytes");
}
```

もしくはdefaults constantsを循環依存しないmoduleへ移してZod `superRefine`で検証する。

### 追加すべき回帰テスト

少なくとも:

- `lineOverlapBytes > maxLineBytes` → config error / exit 2
- `maxCarryBytes > maxLineBytes` → config error / exit 2
- `lineOverlapBytes > maxCarryBytes` → config error / exit 2
- fieldを1つだけ指定しdefaultsとの関係が壊れるケース
- valid boundary:
  - overlap == carry
  - carry == line
- scannerがlong lineで必ずreturnすること

---

## M2-0-R1-002

- **ID:** M2-0-R1-002
- **重要度:** Medium
- **種別:** セキュリティ
- **対象:** `src/commands/security-scan.ts` — `renderText()` / JSON output / `describeRule()`
- **内容:** M2-0で新設した`security.allow[].reason`等のconfig由来文字列を、`security-scan`が`maskSecrets` / `maskDeep`を通さずconsole / JSONへ出力する。**allow reasonにsecret-shaped textが入ると、standalone Security Scan自身がその値をログへ再出力できる**。
- **根拠:** `runSecurityScan()`はJSON時に、

  ```ts
  log(JSON.stringify(result, null, 2));
  ```

  をそのまま出力する。

  text modeでも、

  ```ts
  function describeRule(u) {
    return `#... path=${u.path} ... — ${u.reason}`;
  }
  ```

  として`reason`を直接表示する。

  このcommandには`maskSecrets` / `maskDeep`のimportも使用もない。

  `allowUsage`にはconfigから来た:

  - `path`
  - `reason`
  - `expires`

  がそのまま格納される。

### 影響

例えば:

```json
{
  "security": {
    "allow": [
      {
        "path": "tests/**",
        "reason": "temporary " + "AKIA" + "ABCDEFGHIJKLMNOP" + " exception"
      }
    ]
  }
}
```

のようにreasonへ誤ってsecret-shaped textを置くと、scan text / `--json`がその値を表示する。

また`reason`は改行禁止でもないため、text outputではaudit logへ複数行を注入することも可能。

configはR-006上「trusted input」だが、

- trusted configであること
- console / reportへ秘密値を生で出してよいこと

は別問題。

M0から維持してきた「secret-looking stringsは出力前にmaskする」という防御と不整合。

### 修正案

standalone Security Scanの出力も他commandと同じmask boundaryへ統一する。

推奨:

```ts
const safeLog = (line: string) => log(maskSecrets(line));
```

text outputは全行safeLog経由。

JSONは:

```ts
log(JSON.stringify(maskDeep(result), null, 2));
```

とする。

少なくとも`reason` / `path`等config由来free textはmaskする。

### 追加テスト

synthetic secret-shaped valueを`allow.reason`へ入れて:

- text outputに生値がない
- `--json`に生値がない
- `[REDACTED:<category>]`へ置換される
- rule usage / reason自体はaudit可能な形で残る

ことを確認する。

---

## M2-0-R1-003

- **ID:** M2-0-R1-003
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/commands/init.ts` — `proposeGitignore()` / `runInit()` の `--write-gitignore`
- **内容:** tracked `.gitignore`ではM1-R3-002のrepairがidempotentになったが、**Git repository内で`.gitignore`が未追跡の状態では、`--write-gitignore`を繰り返すたび`artifacts/`を重複追記する**。
- **根拠:** coverage判定はM2-0で意図的に「tracked `.gitignore` ruleだけ有効」になった。

  したがって、Git repositoryに未追跡`.gitignore`があり:

  ```gitignore
  artifacts/
  ```

  が書かれていても、

  ```ts
  gitIgnoredByRepoRules(...)
  ```

  はそのruleをcoverageとして数えない。

  これはSecurity Scan側の方針として妥当。

  一方`proposeGitignore()`は:

  ```text
  .git exists
  → canAskGit = true
  → tracked ruleでcoverageなし
  → needed = true
  ```

  を返す。

  write側は:

  ```ts
  if (!gitignoreProposal.canAskGit && hasGitignoreLine(current)) {
    // duplicateを避ける
  } else {
    append "artifacts/"
  }
  ```

  なので、`canAskGit === true`のGit repositoryでは既存行を確認せず追記する。

### 独立確認

Git repositoryで未追跡`.gitignore`に:

```gitignore
artifacts/
```

を置いた。

Git自身の通常のignore判定では:

```text
artifacts/verification/latest.json → ignored
```

だが、M2-0の`gitIgnoredByRepoRules()`はsource `.gitignore`がuntrackedなのでprotected setを空にした。

したがってproposalは毎回`needed=true`になる。

この状態でwrite logicを繰り返すと:

```gitignore
artifacts/
artifacts/
artifacts/
...
```

と増え続ける。

特に「`.gitignore`が無いrepo」で最初に`--write-gitignore`を実行した場合、

1回目:
- `.gitignore`を作成
- `artifacts/`を1行書く
- fileはまだuntracked

2回目:
- tracked-only coverageでは無効
- `canAskGit=true`
- 同じ`artifacts/`を再追記

となるため、通常の初期導入でも再現する。

### Original Requestとの不整合

M1-R3-002の要求は:

> `--write-gitignore` repairs ... idempotent afterwards

であり、現在のidempotenceは「`.gitignore`が既にtracked」という追加条件に依存している。

### 修正案

Security Scanの「untracked `.gitignore`はcoverageとして数えない」は維持する。

ただしwriterの重複防止は別問題なので、

```ts
if (hasGitignoreLine(current)) {
  // 既に末尾のrepairとして十分かを確認
}
```

を使う。

より正確には:

- proposalがneeded
- current `.gitignore`がuntracked
- `artifacts/`行が既に存在

なら、同じ行を追記せず、

```text
.gitignore contains artifacts/ but is not tracked; git add .gitignore to make the policy reproducible
```

と案内する。

negation repairのケースでは同一行が前方にあっても末尾追記が必要なので、

- tracked source + Git semanticsで非ignore → append
- untracked source + canonical line already exists → duplicateせず「track it」と案内

のように分ける。

### 追加テスト

- repoに`.gitignore`なし → 1回目で1行作成、2回目でも1行のまま
- untracked `.gitignore` + `artifacts/` → 重複しない
- tracked `.gitignore` + `artifacts/\n!artifacts/` → 末尾へrepair lineを追加
- repair後tracked caseは2回目で増えない

---

# M1 R3 carry-over 5件の再判定

## M1-R3-001 — 標準設定では解消

固定4 KiB overlapだけに依存せず、pattern anchorからcandidate prefixを持ち越す実装になっている。

5,000+ char URL credentialのwindow boundary test、64 KiB超candidateの`oversized-candidate` testも要求に合っている。

ただしconfigurable window settingsの相互関係に新規High問題がある。

→ **M2-0-R1-001**

---

## M1-R3-002 — tracked `.gitignore`では解消

```gitignore
artifacts/
!artifacts/
```

に対し、Gitが非ignoreと判定した場合に末尾へ`artifacts/`を追記し、後続runでcoverage確認できる。

前回のnegation repair問題はtracked sourceでは解消。

ただし未追跡`.gitignore`ではidempotenceが崩れる。

→ **M2-0-R1-003**

---

## M1-R3-003 — 解消

single sentinelではなく、実際のartifact系4path:

- `artifacts/verification/latest.json`
- `artifacts/verification/latest.md`
- `artifacts/verification/history/probe.json`
- `artifacts/ai-review/probe.md`

をすべて確認する。

sentinel-only ruleをcoverageと誤認する前回条件は解消。

---

## M1-R3-004 — 解消

`git check-ignore`のsource `.gitignore`を`git ls-files`で確認し、tracked sourceだけをcoverageとして数える。

nested `.gitignore`についてもsource単位のtestがある。

前回の「untracked local `.gitignore`だけでPASS」は解消。

---

## M1-R3-005 — 解消

PEM block findingも:

```text
block:<category>:<beginLine>:<endLine>
```

でdedupeされる。

overlapに同一one-line PEM blockが再登場するケースも1件へ統合される。

---

# key-value scanning の判定

今回のHuman Decision:

- quoted literalは候補
- bare dotenv / shell値はcode-like charactersを含まないものだけ
- interpolation / references / placeholder / boolean / null / numberを除外
- letters-only passphraseは既知の制限
- maskerは広いまま

に対し、掲載実装は概ね一致している。

今回のレビューでは、この明示されたheuristicから外れる新しいCritical / Highのfalse-negativeは追加指摘していない。

Target Bで`.env.example`の日本語説明文が1件key-value findingになったこともpacketに明記されており、false-positive realityを隠していない。

---

# `security.allow` の判定

以下は妥当。

- allow ruleはpath必須
- reason必須
- category / line / expiresは任意
- expired ruleはinactive
- unused / expiredは出力
- first active matching rule wins
- suppressed findingは一覧に残る
- `tracked-env` / `untracked-env` / `gitignore`はallowで抑制不可
- R-006のconfig trust boundaryを維持

ただし新しく追加されたconfig由来free textをstandalone scan outputでmaskしていない。

→ **M2-0-R1-002**

---

# 指摘なしと判断した観点

今回の確認範囲では、以下に明確な問題を確認しなかった。

- candidate anchorをshared `SECRET_PATTERNS`側へ持たせる設計
- default設定でのcandidate carry-over
- `oversized-candidate`をfindingとしてfail closedにする方針
- findingへcandidate valueを保存しないこと
- line-oriented findingのoverlap dedupe
- PEM block findingのdedupe
- real artifact pathの複数probe
- tracked `.gitignore` source判定
- key-value scannerとmaskerのpattern定義共有
- key-value `valueFilter`をmaskerへ適用しないこと
- `security.allow`で衛生findingを抑制できないこと
- expired allow ruleがfindingを残すこと
- unused / expired allow ruleのaudit表示
- `security-scan --config`の導入
- default security settingsがM1 defaultsと一致すること
- R-012を「pattern definition共有」の意味で完了とすること
- v0.2.3を移動せずv0.3.0を新tagとするrelease運用
- packet記載上、全9 commitsでtypecheck / tests / verifyがPASSしていることとの整合

---

# 独立確認した項目

## 1. LineAssemblerの進捗不能

packet掲載の`src/security/scan.ts`をそのまま抽出し、NodeのTypeScript strip-typesで`LineAssembler`をimportした。

```text
maxLineBytes=10
lineOverlap=20
maxCarryBytes=64
```

で11文字を`push()`するとreturnせず、外部timeoutまでloopし続けることを確認した。

→ M2-0-R1-001。

## 2. `gitIgnoredByRepoRules` と未追跡 `.gitignore`

Git repositoryで未追跡`.gitignore`へ:

```gitignore
artifacts/
```

を書いた。

通常のGit:

```text
git check-ignore artifacts/verification/latest.json
→ ignored
```

一方、packet掲載の`gitIgnoredByRepoRules()`:

```text
protected paths = []
```

となることを確認した。

tracked-only security policyとしては正しいが、現在のwriter logicと組み合わせると繰り返し追記になる。

→ M2-0-R1-003。

## 3. Security Scan outputのmask boundary

`src/commands/security-scan.ts`には`maskSecrets` / `maskDeep`の使用が無く、

```ts
JSON.stringify(result)
describeRule(... reason ...)
```

を直接logしていることを確認した。

→ M2-0-R1-002。

---

# 見ていない / 独立実行していない範囲

今回のレビューは添付`review-packet-m2-0.md`を主な根拠としている。

独立実行していないもの:

- GitHub上の`8e81d15`とpacketのbyte-level一致
- v0.3.0 tag / tag objectのremote実在
- 280 tests × 10回の実ログ
- 9 commitsのworktree verification
- `npm run verify`
- `npm run verify:dist`
- linked `aiqh verify`
- package smoke tarball
- `npm audit`
- Target A / Target B repositoryの実内容
- Target Bの17 anthropic + 1 key-value findingの実値
- Windows / LinuxでのM2-0 scanner挙動
- M2-0で変更されていないM0/M1コード全体

---

# 推奨対応順

1. **M2-0-R1-001**
   - security window limitsのcross-field validation
   - scannerが必ずprogressするinvariantをtestで固定

2. **M2-0-R1-002**
   - standalone `security-scan` text / JSON outputをmask boundaryへ通す

3. **M2-0-R1-003**
   - untracked `.gitignore`でも`--write-gitignore`を冪等にする

---

# v0.3.0 / M2-0 完了判断

packet記載のdefault configurationと既存self verifyでは、M2-0の主要機能は正常に動作している。

しかし **M2-0-R1-001 はHigh** であり、M2-0で新しく公開したsecurity window settingsの有効な組み合わせによってscannerが終了しなくなる。

そのため、現時点では `v0.3.0` を「M2-0最終baseline」として固定することは推奨しない。

推奨運用:

- `v0.3.0` tagは削除・移動しない
- M2-0-R1-001を必須修正
- 可能ならR1-002 / R1-003も同時修正
- committed HEADで
  - typecheck
  - full tests
  - source verify
  - built verify
  - linked verify
  - security PASS
  を確認
- maintenance releaseとして `v0.3.1` を付与

最終判定:

- M1-R3-001: **標準設定の元再現条件は解消。ただしM2-0-R1-001あり**
- M1-R3-002: **tracked `.gitignore`では解消。ただしM2-0-R1-003あり**
- M1-R3-003: **解消**
- M1-R3-004: **解消**
- M1-R3-005: **解消**
- key-value scanning: **明示仕様の範囲では妥当**
- `security.allow`: **基本設計は妥当。ただし出力mask漏れあり**
- M2-0 completion: **High修正後を推奨**
