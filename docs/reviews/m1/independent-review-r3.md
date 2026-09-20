<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m1-r3-for-claude.md、9/20 付）のうち、本体の Security Scan に一致する
例示 2 行（原文の行番号 53, 236）を、テストのダミー値と同じ分割表記（<scheme>://<user>:<password>@<host>、"-----BEGIN " + "PRIVATE KEY-----"）に変えた。
意味は変えていない。それ以外は原文のまま。無改変の原文の SHA-256: 62e61fb1d1d7735f091bf1e69c5cd549c24ef17384784aa4200f3c32c60f776b
-->

# M1 独立レビュー R3 — Claude Code 修正依頼用

対象: `ai-quality-harness` M1 / independent review R2 対応後  
レビュー資料: `review-packet-m1-r2.md`  
対象範囲: `v0.2.1..v0.2.2`  
packet記載の `v0.2.2`: commit `f958ac7`  
想定保存先: `docs/reviews/m1/independent-review-r3.md`

## 総括

R2の主要修正は概ね有効です。

特に、以下の前回再現条件は潰れています。

- 未追跡・非ignoreの`.env*`を内容を読まずfinding化する処理
- `lstatSync()`でENOENT以外を`ScanError`へ倒す処理
- venv interpreter自体の実行権限確認
- 巨大1行でファイル全体を保持し続けないsliding-window化
- `proposeGitignore()`でnegationをGit自身に判定させる処理

また、R1-009のPARTIALは解消と判断します。  
R1-005の元の「negationを無視するscanner判定」も解消しています。

一方、独立確認では以下を追加指摘します。

- **High: 0件**
- **Medium: 4件**
- **Low: 1件**

人間側の運用ルール「R3でHighが無ければM1完了」に照らすと、今回Highは確認していません。ただし、Medium以下としてM2へ積むべき具体的な問題は残っています。

---

# Findings

## M1-R3-001

- **ID:** M1-R3-001
- **重要度:** Medium
- **種別:** セキュリティ / 設計
- **対象:** `src/security/scan.ts` — `LineAssembler.push()` / `LINE_OVERLAP` / line-oriented secret scan
- **内容:** 長大1行をbounded memoryで走査する修正は有効だが、`LINE_OVERLAP = 4 KiB`より長いsecret-shaped tokenがwindow境界をまたぐと、検出できないfail-openが残る。
- **根拠:** 現在の設計は、長行を一定区間でscanした後、最後の4 KiBだけを次windowへ引き継ぐ。したがって、secretの開始位置が前windowにあり、終端が次windowにあり、開始位置が引継ぎ4 KiBより前なら、
  - 前window: secret終端がまだ無いためmatchしない
  - 次window: secret開始prefixが消えているためmatchしない
  という状態になる。

  packet自身もKnown Risksで「single token longer than LINE_OVERLAP (4 KiB) that straddles a window boundary can be missed」と認めている。

  独立再現では、既存の`url-credential` shape相当として、

  ```text
  <scheme>://<user>:<5000文字超のpassword>@<host>
  ```

  を最初のwindow境界へ意図的にまたがせると、0 findingになった。

  これはメモリ無制限問題を直す代わりに入った、新しい既知のfalse negative。
- **修正案:** 有限overlapだけで、長さ上限のないregexを完全にscanすることはできない。次のいずれかを採用する。
  1. streaming state machineでcandidate prefixを保持する
  2. window末尾で「secret開始prefixは見つかったが終端が未確定」のcandidateだけを次windowへ持ち越す
  3. candidateが安全上限を超えた場合は「長すぎて完全scanできない」としてfindingまたはERRORに倒す

  単純にoverlapを増やすだけでは、さらに長いtokenで同じ問題が残る。
- **追加テスト:** 4 KiB超のURL credential / JWT等をwindow境界へまたがせ、検出またはfail-closedになることを固定する。

---

## M1-R3-002

- **ID:** M1-R3-002
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/commands/init.ts` — `runInit()` の `--write-gitignore` / `hasGitignoreLine()`
- **内容:** `proposeGitignore()`はnegationを正しく検出するようになったが、`--write-gitignore`は、既に`artifacts/`という行が1つでも存在すると追記を拒む。そのため、`artifacts/`の後に`!artifacts/`があるケースを実際には修復できない。
- **根拠:** 例:

  ```gitignore
  artifacts/
  !artifacts/
  ```

  `proposeGitignore()`はGitへ問い合わせるため、正しく`needed = true`になる。

  しかしwrite側は:

  ```ts
  if (hasGitignoreLine(current)) {
    log(`.gitignore already contains "artifacts/"; nothing written`);
  }
  ```

  となるため、後段のnegationを上書きするための`artifacts/`を末尾へ追加しない。

  独立確認では、この`.gitignore`で`git check-ignore artifacts/.aiqh-ignore-probe`は非ignoreのまま。`hasGitignoreLine()`はtrueなので現行writeロジックでは何も変更されず、実行後も非ignoreのままになる。
- **修正案:** `gitignoreProposal.needed === true`なら、単なる「同一行がどこかに存在するか」ではなく、**現在のGit semanticsが有効になるように**書き込む。

  最小修正は、proposalがneededなら末尾へ`artifacts/`を追加すること。追加後は`proposeGitignore()`がfalseになるため、次回以降は追記されず実質的にidempotentになる。

  または既存のnegation ruleを編集する方法でもよいが、initの安全性を考えると末尾への明示overrideが単純。
- **追加テスト:**
  - `artifacts/\n!artifacts/\n`
  - `runInit({ writeGitignore: true })`
  - 実行後に`git check-ignore artifacts/.aiqh-ignore-probe`がignored
  - 2回目の実行で追加行が増えない

---

## M1-R3-003

- **ID:** M1-R3-003
- **重要度:** Medium
- **種別:** バグ / 設計
- **対象:** `src/commands/init.ts` — `GITIGNORE_PROBE` / `proposeGitignore()`
- **内容:** `artifacts/.aiqh-ignore-probe`という1つの固定sentinelがignoreされるだけで、「artifacts/ is already ignored」と判定するため、sentinel固有のruleで判定を偽陽性にできる。
- **根拠:** `.gitignore`が次だけの場合:

  ```gitignore
  artifacts/.aiqh-ignore-probe
  ```

  現行`proposeGitignore()`はrepresentative probeがignoreされるため`needed = false`になる。

  しかし実際の生成物:

  ```text
  artifacts/verification/latest.json
  artifacts/verification/latest.md
  artifacts/ai-review/...
  ```

  はignoreされない。

  独立確認でも、

  ```text
  git check-ignore artifacts/.aiqh-ignore-probe
  → ignored

  git check-ignore artifacts/verification/latest.json
  → NOT ignored
  ```

  となった。
- **修正案:** 1個の公開固定sentinelを「ディレクトリ全体のcoverage」と同一視しない。

  選択肢:
  1. 実際にaiqhが生成する複数の代表pathを確認する
     - `artifacts/verification/latest.json`
     - `artifacts/verification/latest.md`
     - `artifacts/ai-review/...`
  2. canonical `artifacts/` ruleが有効かを判定する
  3. 「任意のartifacts配下が確実にignoreされる」ことを保証できなければproposalを出す

  少なくともsentinelだけを個別ignoreするruleでは`already ignores artifacts/`と表示しない。
- **追加テスト:** `.gitignore`が`artifacts/.aiqh-ignore-probe`だけの場合、`needed === true`を期待する。

---

## M1-R3-004

- **ID:** M1-R3-004
- **重要度:** Medium
- **種別:** セキュリティ / 設計
- **対象:** `src/security/scan.ts` — `checkGitignore()` / `gitIgnoredByRepoRules()`
- **内容:** `.gitignore`のrule sourceが「`.gitignore`という名前」であることだけを確認し、その`.gitignore`自体がgit-trackedかを確認していない。そのため、**未追跡のローカル`.gitignore`だけでSecurity Scanのcoverage checkをPASSできる**。
- **根拠:** `gitIgnoredByRepoRules()`は:

  ```ts
  if (path.basename(source) !== ".gitignore") continue;
  ```

  で、`.git/info/exclude`等は除外するが、sourceの`.gitignore`がrepositoryへcommitされているかは確認しない。

  例:

  ```text
  tracked: a.txt
  untracked: .gitignore
  ```

  untracked `.gitignore`:

  ```gitignore
  .env
  .env.*
  ```

  Git自身はこのローカル`.gitignore`を適用するため、4つのprobeはすべてignoredになる。

  現行scannerでは`.gitignore`自体はuntracked non-env textとしてscanされるだけでfindingにはならず、`checkGitignore()`もPASSできる。

  独立確認で`git ls-files`には`.gitignore`が存在せず、`git check-ignore`は4つの`.env` probeをすべてそのuntracked `.gitignore`でignoredと判定した。
- **影響:** clone先にはその`.gitignore`が存在しないため、scannerが「repositoryのenv hygieneが保護されている」と判断した状態が再現されない。

  global excludeや`.git/info/exclude`を「clone-specificなのでcoverageとして数えない」という現在の設計思想と、未追跡`.gitignore`を数えることが不整合。
- **修正案:** `git check-ignore -v`が返したsource `.gitignore`について、そのsourceが`git ls-files`上でtrackedであることを確認する。

  root `.gitignore`だけを要件にするなら、より単純に:

  ```text
  git ls-files --error-unmatch .gitignore
  ```

  が成功することをcoverage条件に含める。

  nested `.gitignore`を許容するなら、各source pathをtrackedか個別検証する。
- **追加テスト:** untracked `.gitignore`だけが`.env*`をignoreしているrepoではgitignore findingが残ること。

---

## M1-R3-005

- **ID:** M1-R3-005
- **重要度:** Low
- **種別:** バグ / テスト不足
- **対象:** `src/security/scan.ts` — `scanFile()` block scanner / sliding-window duplicate handling
- **内容:** line-oriented scannerは`seen = Set<category:line>`でoverlapによる重複findingを統合するが、PEM block scannerのfindingには同じdedupeが適用されない。長大1行のoverlap内に「BEGIN〜ENDが同一window内で完結するprivate-key block」が残ると、同じblockを2回報告できる。
- **根拠:** line scannerでは:

  ```ts
  const key = `${s.category}:${lineNo}`;
  if (s.regex.test(line) && !seen.has(key)) {
    seen.add(key);
    ...
  }
  ```

  となる。

  block scanner側はfinding追加時に`seen`を使っていない。

  独立再現として、長大1行の最初のwindow末尾4 KiB以内に:

  ```text
  "-----BEGIN " + "PRIVATE KEY-----"x"-----END " + "PRIVATE KEY-----"
  ```

  を置き、そのblockが次windowのoverlapにも残る配置にすると、同じline 1のprivate-key findingが2件生成される。
- **影響:** security verdict自体はFAILのままなのでfail-openではないが、finding数・監査結果が不正確になる。commit messageの「duplicate (category, line) findings from overlapping windows are merged」という説明もblock findingには成立しない。
- **修正案:** block findingもdedupe keyを通す。

  例:

  ```text
  block:<category>:<beginLine>:<endLine>
  ```

  でSet管理する。
- **追加テスト:** complete single-line PEM blockをoverlapに置き、findingが1件だけになること。

---

# M1-R2-001〜005 の再判定

## M1-R2-001 — 解消

未追跡・非ignoreの`.env.staging`等は、`git ls-files --others --exclude-standard`に出た時点で`untracked-env` findingになる。

- 内容は読まない
- nested pathも対象
- example/sample/template/distは情報扱い
- ignore済みenvは`--exclude-standard`により列挙されない

前回の具体的な0-finding再現条件は潰れている。

**追加指摘:** なし。

---

## M1-R2-002 — 解消

`lstatSync()`失敗は:

- `ENOENT`だけskip
- その他は`ScanError`

となり、EACCES / EPERM / ELOOP等を黙ってscan対象外にするfail-openは解消。

synthetic errnoテストと、非root時の実EACCESテストも妥当。

**追加指摘:** なし。

---

## M1-R2-003 — 解消

venvの採用条件が`<venv>/bin/python`自身の`X_OK`へ変更され、`PythonContext.python`を全Python adapterが使うようになった。

non-executable interpreterではpytest / ruff / mypy / pip-audit / Playwrightがavailableにならない。

**R1-009のPARTIALは解消**と判断する。

WindowsはKnown Riskとして未検証だが、現在のPOSIX再現条件は潰れている。

---

## M1-R2-004 — PARTIAL

「改行が無いとpendingがファイルサイズまで増える」問題は解消。

`LineAssembler`により保持量はファイルサイズに比例せずboundedになった。

また、通常サイズのsecretについて:

- line start
- line end
- window境界
- line number
- line-oriented findingの重複統合

は回帰テストされている。

ただし、**LINE_OVERLAPより長いsecretが境界をまたぐfalse negative**が新たに残る。

→ M1-R3-001。

block scannerの重複統合にも漏れがある。

→ M1-R3-005。

---

## M1-R2-005 — PARTIAL

`proposeGitignore()`がliteral line比較ではなくGitの`check-ignore` semanticsを使うようになったため、

```gitignore
artifacts/
!artifacts/
```

を「already ignored」と誤判定する元の問題は解消。

したがって、**R1-005の元のnegation判定問題も解消**している。

一方で:

- `--write-gitignore`がnegationケースを実際には修復できない → M1-R3-002
- 固定sentinelだけをignoreしてもcoverageありと判定できる → M1-R3-003

が残るため、R2-005全体はPARTIALと判断する。

---

# R1-005 / R1-009 の PARTIAL 再判定

## R1-005

前回R1-005の中心だった:

```text
.gitignoreのnegationを自前簡易判定が無視する
```

問題は、Security Scan側・`proposeGitignore()`側ともGit自身の`check-ignore`を使うことで解消している。

**元のR1-005再現条件については解消。**

ただしgitignore処理全体にはM1-R3-002〜004の追加論点があるため、「gitignoreまわりすべて問題なし」という意味ではない。

---

## R1-009

venv interpreter自身の実行権限を確認する修正により、前回の:

```text
python 0644 + pytest 0755 → adapter available
```

は再現しなくなった。

pytest prerequisiteもR1で既に修正済み。

**R1-009のPARTIALは解消。**

---

# 指摘なしと判断した観点

今回の確認範囲では、以下に追加問題を確認しなかった。

- 未追跡・非ignore `.env*` のfinding化
- 未追跡envの内容を出力しないこと
- nested `.env*` のbasename判定
- example/sample/template/distを別扱いする既定方針そのもの
- lstat ENOENT / その他エラーの分離
- EACCES等のfail-closed化
- venv interpreter自身のX_OK確認
- `PythonContext.python`をadapter commandに使う変更
- Python Playwrightでpytestを要求する既存修正
- `StringDecoder`を使ったUTF-8 chunk boundary処理
- 長大1行のmemory使用量をファイル全体に比例させない設計
- line-oriented scannerで同一category / lineのoverlap重複をまとめる処理
- 長行後のline number更新
- `proposeGitignore()`でnegationをGit自身に判定させる変更
- 非git / git failure時にsafe sideでproposalを出す方針
- v0.2.1を移動せずv0.2.2を別tagにした運用
- packet記載上、全commitがtypecheck / tests / verify PASSしていることとの整合

---

# 独立再現した項目

## 1. 4 KiB超secretのwindow boundary miss

sliding-window実装と同じ境界条件で、5,000文字超のURL credentialをwindow境界へまたがせた。

結果:

```text
finding = 0
```

前windowでは終端`@`が未到達、次windowでは`https://user:` prefixがoverlap外へ消えるため。

→ M1-R3-001。

---

## 2. `--write-gitignore`がnegationを修復できない

`.gitignore`:

```gitignore
artifacts/
!artifacts/
```

Git:

```text
git check-ignore artifacts/.aiqh-ignore-probe
→ NOT ignored
```

一方`hasGitignoreLine()`相当判定:

```text
"artifacts/" exists → true
```

現行write経路では何も追記しないため、実行後もNOT ignored。

→ M1-R3-002。

---

## 3. 固定sentinelだけのignore

`.gitignore`:

```gitignore
artifacts/.aiqh-ignore-probe
```

結果:

```text
artifacts/.aiqh-ignore-probe
→ ignored

artifacts/verification/latest.json
→ NOT ignored
```

現行proposalは前者だけを見るため`needed=false`になり得る。

→ M1-R3-003。

---

## 4. untracked `.gitignore`

tracked:

```text
a.txt
```

untracked `.gitignore`:

```gitignore
.env
.env.*
```

Git自身では4つのenv probeはすべてそのuntracked `.gitignore`によりignored。

しかし`.gitignore`は`git ls-files`には存在しない。

現行`gitIgnoredByRepoRules()`はsource basenameが`.gitignore`ならcoverageとして数えるため、cloneに存在しないruleでもSecurity Scanのgitignore findingを消せる。

→ M1-R3-004。

---

## 5. block scannerのoverlap duplicate

長大1行のwindow末尾overlap内へcomplete PEM blockを置いた。

同じphysical line / same private-key blockが次windowにも再掲されるため、block scannerでは同じfindingが2回追加され得ることを独立再現。

→ M1-R3-005。

---

# 見ていない / 独立実行していない範囲

今回のレビューは添付`review-packet-m1-r2.md`を主な根拠としている。

独立実行していないもの:

- GitHub上の`f958ac7`とpacketのbyte-level一致
- v0.2.2 tag / tag objectのremote実在
- 252 tests × 10回の実ログ
- 7 commitsのworktree verificationそのもの
- `npm run verify`
- `npm run verify:dist`
- linked `aiqh verify`
- package smoke tarball
- `npm audit`
- Target A / B repositoryの実内容
- Target Bの17 anthropic findingsの実値
- WindowsでのX_OK/F_OK相当挙動
- root環境でskipされる実EACCES回帰テスト
- M1で変更されていないM0コード全体

また、M1-R3-001はpacket掲載のwindow algorithmと既存secret shapeを用いた独立再現であり、実際のv0.2.2 repositoryをcloneして実行したものではない。

---

# 推奨対応順

1. **M1-R3-001**
   - 長さ上限のないsecret patternをwindow境界で見逃さない設計
2. **M1-R3-002**
   - `--write-gitignore`がnegationケースを実際に修復すること
3. **M1-R3-004**
   - coverageに使う`.gitignore` sourceがtrackedであることを確認
4. **M1-R3-003**
   - single sentinelをdirectory coverageと同一視しない
5. **M1-R3-005**
   - block findingもoverlap dedupe

---

# v0.2.2 / M1 完了判断

今回、**Critical / Highの新規findingは確認していない**。

したがって、人間側で事前に決めた:

```text
R3でHighが無ければM1完了
Medium以下はM2のリストへ積む
```

という運用ルールに従うなら、**M1をv0.2.2で完了扱いにすること自体は可能**。

ただし、M2 backlogへ最低限以下を明示的に持ち越すことを推奨する。

- 長大tokenのwindow-boundary false negative
- `--write-gitignore`のnegation修復
- tracked `.gitignore` requirement
- artifacts coverage判定
- block finding overlap duplicate

特にM1-R3-001はSecurity Scanのfalse negativeなので、M2の早い段階で対応するのがよい。

最終判定:

- **R1-005の元PARTIAL: 解消**
- **R1-009のPARTIAL: 解消**
- **R2-001: 解消**
- **R2-002: 解消**
- **R2-003: 解消**
- **R2-004: PARTIAL（M1-R3-001 / 005）**
- **R2-005: PARTIAL（M1-R3-002 / 003）**
- **M1 completion: 事前ルール上は可。Medium/LowをM2へ明示持越し推奨**
