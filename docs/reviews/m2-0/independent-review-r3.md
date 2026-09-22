<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-0-r3-for-claude.md、9/23 付）。本体の Security Scan に一致する行は無く、
言い換えた行は無い（0 行）。原文のまま。無改変の原文の SHA-256: d551c01a2db85c66c0790aa49ddb6122f335e9040a764952de6dea2755a4e074
-->

# M2-0 独立レビュー R3 — Claude Code 修正依頼用

対象: `ai-quality-harness` M2-0 / independent review R2 対応後  
レビュー資料: `review-packet-m2-0-r2.md`  
対象範囲: `v0.3.1..v0.3.2`  
packet記載の `v0.3.2`: commit `cfadf18bc372720ee682995e4c40623b7ad965f7`  
想定保存先: `docs/reviews/m2-0/independent-review-r3.md`

## 総括

M2-0-R2-001〜003 の修正そのものは、前回の具体的な再現条件を概ね正しく潰しています。

特に以下を確認しました。

- 前回の10,000文字usernameを持つURL credentialのwindow-boundary missは解消
- `lineOverlapBytes`の最小値256とbounded anchor設計が追加
- `anchorMaxBytes <= MIN_LINE_OVERLAP_BYTES`のテストが追加
- `partial`を使ったcandidate carryが追加
- allow ruleのCR/LF・Unicode line separator等の制御文字制限が強化
- R2 regression件数の記録が訂正
- packet記載上、319 tests ×10、source / built / linked verifyがPASS

一方、独立確認では以下を追加指摘します。

- **High: 1件**
- **Medium: 1件**
- **Low: 1件**

最優先は **M2-0-R3-001** です。

人間側ルール:

```text
R3でHighが無ければM2-0完了
```

に対し、今回はHighを1件確認したため、`v0.3.2`をM2-0最終baselineとすることは推奨しません。

---

# Findings

## M2-0-R3-001

- **ID:** M2-0-R3-001
- **重要度:** High
- **種別:** セキュリティ / バグ
- **対象:** `src/security/patterns.ts` — `private-key` pattern / anchor、`src/security/scan.ts` — sliding-window carry
- **内容:** R2で導入した「各anchorは本体patternの有界な接頭辞」という完全性不変条件が、`private-key`だけ成立していない。`private-key`本体とblock begin regexは`BEGIN`ラベル部分を無制限長で許可する一方、anchorは`[A-Z0-9 ]{0,32}`に制限している。そのため、anchor上限より長いprivate-key labelがwindow境界をまたぐと、**全文regexではprivate-keyに一致する文字列をwindow scannerが0 findingで見逃せる**。

### 根拠

現在の本体pattern:

```ts
/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
```

block begin:

```ts
/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/
```

一方anchor:

```ts
start: /-----BEGIN [A-Z0-9 ]{0,32}PRIVATE KEY-----/g
```

partialも同じく`{0,32}`制限。

したがって、

```text
本体patternが受理する集合
⊃
anchorが開始点として認識できる集合
```

になっている。

R2のArchitecture Decision / responseでは、

```text
anchorは本体一致の有界な接頭辞
```

を完全性条件としているため、private-keyはその条件に違反している。

### 独立再現1 — 許可された最小overlap

packet掲載のcurrent scannerコード相当をそのまま使い、validな設定:

```text
maxLineBytes = 4096
lineOverlapBytes = 256
maxCarryBytes = 2048
```

で確認した。

概念上のsecret:

```text
BEGIN marker =
  "-----BEGIN "
  + "A".repeat(260)
  + " PRIVATE KEY-----"

body = "MIIE..."
END marker = corresponding PRIVATE KEY end
```

これをwindow境界付近へ配置。

結果:

```text
whole-string private-key regex → match
window scanner               → 0 findings
```

となった。

### 独立再現2 — default settingsでも成立

default:

```text
maxLineBytes = 256 KiB
lineOverlapBytes = 4 KiB
maxCarryBytes = 64 KiB
```

でも、BEGIN labelを5,000文字程度にしてmarkerをwindow境界へまたがせると:

```text
whole regex → private-key match
window scan → 0 findings
```

を再現した。

つまり「customの極端なoverlapだけ」の問題ではない。

### なぜR2 property testが見逃したか

R2のproperty generatorはprivate-key labelを:

```ts
run("[A-Z0-9 ]", rnd(20)).trim()
```

で生成している。

つまり最大でも20文字程度で、anchor上限32文字を超える本体matchを生成しない。

そのため、

```text
property 1 — anchor is a prefix of every match
```

という名前のテストでも、実際には本体pattern全体の入力空間をカバーできていない。

packetのKnown Risk:

```text
property tests sample the input space rather than prove it
```

が実際のfalse negativeとして顕在化している。

### 影響

Security Scanが:

```text
SECURITY SCAN: no findings
exit 0
```

になり得る。

private-keyはSecurity Scanの主要カテゴリであり、fail-closed設計に直接反するためHighと判断する。

### 修正案

本体patternを単に32文字へ狭めるより、**anchorを本体patternの真の接頭辞にする**方を推奨。

例:

```text
anchor開始 = literal "-----BEGIN "
```

を見つけた時点からcandidate stateを開始し、

```text
[A-Z0-9 ]*
PRIVATE KEY-----
```

が完成するまでstreamingにcarryする。

candidateが`maxCarryBytes`を超える場合は:

```text
oversized-candidate
```

としてfail closed。

block state machineはcomplete BEGIN marker成立後に従来どおりkey bodyを担当する。

別案として本体 / block begin自体を32文字へ制限することも技術的には整合するが、既存masker / scanner coverageを狭めるため、セキュリティ用途では前者を推奨する。

### 追加すべき回帰テスト

最低限:

1. label長33文字
2. label長260文字、`lineOverlapBytes=256`
3. label長>4 KiB、default settings
4. 各ケースで:
   - whole patternがmatchすることをguard
   - window scannerが`private-key` finding、またはcandidate上限超過なら`oversized-candidate`
5. property test generatorでanchor boundを超える本体matchも生成する

---

## M2-0-R3-002

- **ID:** M2-0-R3-002
- **重要度:** Medium
- **種別:** セキュリティ / 設計
- **対象:** `src/security/patterns.ts` — `url-credential`
- **内容:** R2でwindow anchorを有界化するため、共有されている**本体pattern自体**もURL schemeを最大64文字へ狭めた。その結果、scannerだけでなくM0から使っているmaskerの`url-credential`検出範囲も狭くなり、以前はredactしていた65文字以上のschemeを持つcredential-shaped URLをそのまま出力できる退行が入っている。

### 根拠

R2前の共有patternは概念上:

```ts
[a-z][a-z0-9+.-]*://
```

でscheme長を制限していなかった。

R2後:

```ts
[a-z][a-z0-9+.-]{0,63}://
```

となった。

`SECRET_PATTERNS`はmasker / scannerで共有されるため、この変更はwindow scannerだけに限定されない。

### 独立確認

current patternを使ったmask処理相当で確認。

- scheme 64文字 → URL credentialはredact
- scheme 65文字 → URL credentialは未加工のまま残る

つまりR2-001対策が、既存masker coverageのnarrowingを起こしている。

### 外部仕様との関係

RFC 3986 §3.1のscheme ABNFは:

```text
scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
```

で、数値的な最大長は規定していない。

packetコメントの:

```text
RFC 3986 schemes are far shorter
```

は実運用上の経験則としては理解できるが、仕様上の上限ではない。

### 重要な位置付け

この64文字capはR2対応時の**人間承認済み設計判断**としてpacketに明記されている。

そのためR3-001のような「実装が承認仕様に違反している」問題ではない。

ただし独立レビューとしては、

- shared maskerまでcoverageを狭める
- 従来redactした文字列をredactしなくなる
- URI scheme仕様上64文字が絶対上限ではない

というセキュリティ上の退行を指摘する。

### 修正案

推奨はmaskerとwindow scannerの都合を分離する。

例えば:

1. masker用whole-string patternは従来どおりscheme無制限
2. scanner側はbounded anchor / state machineを別metadataで持つ
3. schemeがscannerのcarry上限を超えた場合は`oversized-candidate`でfail closed

shared definitionの目的は「検出ポリシー共有」であり、window algorithmの実装制約までmaskerのregexへ押し付ける必要はない。

もし64文字を製品仕様として維持するなら:

- 「64文字超schemeはurl-credential検出対象外」という明示的なsecurity limitationとしてADR / CONFIG_SPECへ記載
- masker coverageがv0.3.1より狭くなったことをCHANGELOGへ明記

することを推奨する。

---

## M2-0-R3-003

- **ID:** M2-0-R3-003
- **重要度:** Low
- **種別:** ドキュメント
- **対象:** `docs/reviews/m2-0/response-r2.md`
- **内容:** R2-002の表行に、表示用escape文字列ではなく生のU+2028 / U+2029が残っており、一部viewerでMarkdown tableが崩れる既知問題が、`v0.3.2`に未修正のまま残っている。
- **根拠:** packetのKnown Risks自身が、tag後に発見した問題として以下を明記している。

  ```text
  docs/reviews/m2-0/response-r2.md line 16 contains raw U+2028 / U+2029
  where the escapes \u2028\u2029 were meant
  ```

  codeやtest fixtureではraw characterが意図的なケースもあるが、review response表の説明文ではliteral escape表記を意図していたとpacketに明記されている。
- **影響:** runtime / Security Scan correctnessには影響しない。review audit trailの可読性のみ。
- **修正案:** `response-r2.md`の説明文だけをliteral:

  ```text
  \u2028
  \u2029
  ```

  表記へ修正する。

  test input内のraw Unicode charactersはそのままでよい。

---

# M2-0-R2-001〜003 の再判定

## M2-0-R2-001 — 元のURL再現条件は解消。ただし全体判定はPARTIAL

前回の再現:

```text
default settings
500,000文字の1行
URL開始位置 322,000
username 10,000文字
```

では、R2後のscannerは`url-credential` findingを出すことを独立確認した。

したがって、**前回M2-0-R2-001で提示したlong username URLの再現条件そのものは解消**。

また:

- minimum overlap 256
- bounded anchor metadata
- partial carry
- property tests
- oversized candidate

という対策方向も妥当。

しかしR2対応が掲げたより強い不変条件:

```text
すべてのscan patternでanchorは本体matchの有界な接頭辞
```

はprivate-keyで成立していない。

→ **M2-0-R3-001**

したがってR2-001全体を「window scan completeness完全解消」とは判定せず、**PARTIAL**とする。

さらにURL本体patternを64文字へ制限したことで共有maskerへcoverage narrowingが入った。

→ **M2-0-R3-002**

---

## M2-0-R2-002 — 解消

allow ruleの`path` / `reason`へ:

- C0
- DEL
- C1
- U+2028
- U+2029

を拒否するvalidationが追加されている。

前回指摘したCR / LFだけでは足りないaudit text control問題は解消。

R3-003はコードではなくresponse document内の表示問題。

---

## M2-0-R2-003 — 解消

R2 packetでは、

- pre-fix regression suite
- final regression suite

の件数を区別して記録し、最終追加数とも整合している。

R2-003のreview audit trail件数不整合は解消したと判断する。

---

# 指摘なしと判断した観点

今回の確認範囲では以下に追加問題を確認しなかった。

- 前回の10,000文字URL username再現条件
- default overlapでのURL candidate carry
- `lineOverlapBytes >= 256`制約
- `anchorMaxBytes <= MIN_LINE_OVERLAP_BYTES`テスト
- anthropic / openai / aws / github / slack / google / gitlab / jwtの固定anchor設計
- key-value anchorをkey名だけにした方向
- key-value long whitespaceのwindow-boundary test
- `partial`をcandidate開始位置からsticky評価する設計
- earliest unresolved candidateをcarryする方向
- candidate > maxCarryで`oversized-candidate`へfail closedする方針
- private-key complete BEGIN後をblock state machineへ委譲する方向そのもの
- R2-002のcontrol character validation
- R2-003のtest件数訂正
- v0.3.1 tagを移動せずv0.3.2を新tagにした運用
- packet記載上319 tests ×10 / source / built / linked verifyがPASSしていることとの整合

### 追加の独立property確認

packet掲載のscanner / pattern相当で約3,000ケースのランダム境界配置を確認した。

今回追加で明確に再現したwindow completeness failureは、上記private-key long label系だった。

これは数学的な完全性証明ではなく、追加の探索確認に過ぎない。

---

# 独立再現した項目

## 1. R2の元URLケース

default window settingsで、前回と同じlong username URL配置を再現。

結果:

```text
lineFindings → url-credential
scanString   → secret:url-credential
```

元R2-001ケースは修正済み。

---

## 2. private-key anchor/body mismatch

whole-string patternが受理する長いBEGIN labelをwindow境界へ配置。

### valid minimum-overlap設定

```text
maxLineBytes=4096
lineOverlapBytes=256
maxCarryBytes=2048
```

結果:

```text
whole regex → private-key
window scan → []
```

### default設定

4 KiBを超えるBEGIN labelをwindow境界へ配置。

結果:

```text
whole regex → private-key
window scan → []
```

→ M2-0-R3-001。

---

## 3. URL scheme長によるmask coverage

current shared url-credential pattern相当で確認。

```text
64-char scheme → REDACTED
65-char scheme → credentials remain unredacted
```

R2前のpatternはscheme長無制限だったためcoverage narrowing。

→ M2-0-R3-002。

---

# 見ていない / 独立実行していない範囲

今回のレビューは添付`review-packet-m2-0-r2.md`を主な根拠としている。

独立実行していないもの:

- GitHub上の`cfadf18...`とpacketのbyte-level一致
- v0.3.2 tag / tag objectのremote実在
- 319 tests × 10回の実ログ
- 各commitのworktree verificationそのもの
- `npm run verify`
- `npm run verify:dist`
- linked `aiqh verify`
- package smoke tarball
- `npm audit`
- Target A / Target B repositoryの実内容
- Windows / Linuxの全scanner挙動
- M2-0で変更されていないM0/M1コード全体

独立実行・確認したもの:

- packet掲載current scanner / pattern相当のlong URL再現
- private-key long labelのwhole-pattern vs window-scan差
- valid minimum overlap / default overlapの両方
- current url-credential共有patternによる64 / 65文字schemeのredaction差
- property generatorのprivate-key label長がanchor上限超過を生成しないこと

---

# 推奨対応順

1. **M2-0-R3-001**
   - private-key anchorを本体patternの真のstreaming prefixへ修正
   - anchor bound超過labelのwindow regression追加

2. **M2-0-R3-002**
   - scanner window制約とmaskerのwhole-string coverageを分離
   - または64文字capを明示的security limitationとして文書化

3. **M2-0-R3-003**
   - response-r2.mdのraw U+2028/U+2029をescaped textへ訂正

---

# v0.3.2 / M2-0 完了判断

R2で指摘した3件のうち:

- **M2-0-R2-001: 元URL再現条件は解消。ただしwindow completeness全体はPARTIAL**
- **M2-0-R2-002: 解消**
- **M2-0-R2-003: 解消**

しかし **M2-0-R3-001 はHigh** であり、private-key categoryでwhole-string patternが認識するsecretをwindow scannerがデフォルト設定でも0 findingで見逃せる。

したがって、人間側ルール:

```text
R3でHighが無ければM2-0完了
```

には該当しない。

現時点で`v0.3.2`をM2-0最終baselineとして固定することは推奨しない。

推奨運用:

- `v0.3.2` tagは削除・移動しない
- M2-0-R3-001を必須修正
- committed HEADで:
  - typecheck
  - full tests
  - source verify
  - built verify
  - linked verify
  - security PASS
- maintenance releaseとして`v0.3.3`を付与
- R3-002 / R3-003は同時修正またはM2-1 backlogへ明示

High修正後、window completeness invariantを**生成テストだけでなく各patternのbody/anchor関係そのもの**で再確認してからM2-0を閉じることを推奨する。
