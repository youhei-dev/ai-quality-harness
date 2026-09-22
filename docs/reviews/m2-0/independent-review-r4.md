<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-0-r4-for-claude.md、9/23 付）。本体の Security Scan に一致する行は無いが、push 前の
秘密値ガードの接頭辞（AKIA / ghp_）で始まる合成の例示 4 行（原文の行番号 99、159、319、571）を「+」で区切った分割表記に変えた。159 行目の直下の
位置を示す「^」の行（原文 160 行目）は分割表記に合わせて位置をずらした。意味は変えていない。それ以外は原文のまま。生の U+2028 / U+2029 / C1 は無い。
無改変の原文の SHA-256: 02c8c174d41f6d5872a470446167b53313f629e279036842f7c8a2c14e2a85a1
-->

# M2-0 独立レビュー R4 — Claude Code 修正依頼用

対象: `ai-quality-harness` M2-0 / independent review R3 対応後  
レビュー資料: `review-packet-m2-0-r3.md`  
対象範囲: `v0.3.2..v0.3.3`  
packet記載の `v0.3.3`: commit `cb632cd6e88bd6f4931c34a50f7d27ac8da87efb` / tag object `984bfcbe7bd14deb186c1eacefd2387456388ea3`  
想定保存先: `docs/reviews/m2-0/independent-review-r4.md`

## 総括

M2-0-R3-001〜003 の修正そのものは、前回の具体的な再現条件を正しく潰しています。

独立確認では以下を確認しました。

- private-key のanchorを literal `-----BEGIN ` にしたことで、label 33 / 260 / 5,000文字のwindow-boundary caseは検出できる
- private-key本体 / block beginの言語は従来範囲を維持
- URL credentialのmaskerはscheme長無制限へ戻っている
- scannerだけは64文字scheme上限を持つという既知制限が文書化されている
- raw U+2028 / U+2029の文書問題は修正されている
- packet記載上、338 tests ×10、source / built / linked verify がPASS
- 追加のランダムwindow completeness確認でも、今回R3で修正したprivate-key系のfalse negativeは再現しなかった

一方、独立レビューでは新たに以下を指摘します。

- **High: 0件**
- **Medium: 1件**

したがって、人間側で事前に決めた:

```text
R4でHighが無ければM2-0完了
```

という運用ルールに従えば、**M2-0をv0.3.3で完了扱いにすることは可能**です。

ただし、以下のMediumはM2-1以降へ明示的に持ち越すことを推奨します。

---

# Findings

## M2-0-R4-001

- **ID:** M2-0-R4-001
- **重要度:** Medium
- **種別:** バグ / 設計
- **対象:** `src/security/scan.ts` — `LineAssembler.push()` / `FileScanSink.onLine()` / sliding-window semantics
- **内容:** 長大1行をwindowに分割して各windowを独立した文字列としてregexへ渡すため、**window境界で本来の左・右文脈が失われ、whole-lineではmatchしない文字列をsecret findingとして報告するfalse positive**が発生する。`\b`、negative lookbehind等の境界条件を持つpatternで再現できる。
- **根拠:** `LineAssembler`はlong lineをwindowごとに:

  ```ts
  this.onLine(window, this.lineNo, this.continued);
  ```

  へ渡す。

  `FileScanSink.onLine()`はそのwindowを通常の1行と同じように:

  ```ts
  findMatches(s, line)
  ```

  へ渡す。

  しかしregex engineから見ると、

  - window先頭 = string先頭
  - window末尾 = string末尾

  になる。

  元のphysical lineではwindowの前後に文字が存在していても、その文脈はregexへ渡されない。

  M2-0のproperty invariantは:

  ```text
  whole-line findings ⊆ windowed findings ∪ oversized-candidate
  ```

  という**見逃し防止の片方向条件**だけなので、window側に余分なfindingが増えることは検出しない。

---

### 独立再現1 — 左window境界で `\b` が偽に成立

デフォルト設定相当:

```text
maxLineBytes    = 256 KiB
lineOverlapBytes = 4 KiB
chunk            = 64 KiB
```

を使用。

GitHub token shapeの直前にword characterを置く:

```text
x + ghp_ + aaaaaaaaaaaaaaaaaaaaaaaaa
```

whole physical lineでは`ghp_`直前が`x`なので、

```regex
\bghp_
```

のword boundaryは成立しない。

したがって:

```text
lineFindings(full line) = []
```

となる。

この`g`をfallback overlap後のwindow先頭へ正確に配置すると、前の`x`が切り落とされる。

次windowではregexから:

```text
ghp_aaaaaaaa...
```

が**文字列先頭**に見えるため、`\b`が成立する。

独立再現結果:

```text
whole-line findings = []
window scan =
[
  {
    kind: "secret",
    category: "github",
    ...
  }
]
```

となった。

---

### 独立再現2 — 右window境界で `\b` が偽に成立

AWS access-key shape:

```text
AKIA + 16 uppercase/digit chars
```

をwindow末尾ぴったりまで置き、その直後の**次chunk**にlowercase `a`を置く。

元のphysical line:

```text
AKIA + AAAAAAAAAAAAAAAA + a
                          ^
                    next char
```

AWS regexは:

```regex
\b(?:AKIA|ASIA)[A-Z0-9]{16}\b
```

なので、token末尾のuppercase文字と次のlowercase `a`は両方word character。

whole lineでは末尾`\b`が成立しない。

結果:

```text
lineFindings(full line) = []
```

一方、最初のwindowではAWS tokenの直後が一時的な**string end**になる。

string endはword boundaryとして扱われるため、そのwindowをscanした時点でsecret findingが追加される。

後続chunkを読んでもfindingは既に記録済み。

独立再現結果:

```text
whole-line findings = []
window scan = secret:aws
```

だった。

---

### 影響するpattern

同じ性質は少なくとも以下で考慮が必要。

#### 左文脈

- `\b...`
  - anthropic
  - openai
  - aws
  - github
  - slack
  - google
  - gitlab
  - jwt
  - url-credential
- negative lookbehind
  - key-value:
    ```regex
    (?<![A-Za-z0-9])
    ```

window開始位置で前の1文字が失われると、本来matchしないtoken / keyがmatchし得る。

#### 右文脈

trailing `\b`を持ち、直後文字が次windowにある場合。

特に:

- AWS
- GitHubの一部prefix

等でfalse positiveを作れる。

---

### 重要度の理由

これはsecretの**見逃しではなくfalse positive**。

したがってfail-openではなく、security gateは安全側に倒れる。

一方で、

- legitimate long/minified lineでSecurity ScanをFAILさせる
- `aiqh verify`全体をFAILさせ得る
- whole-line regex semanticsとwindowed scanner semanticsが一致しない
- default settingsでも再現する

ためMediumと判断する。

---

### 修正案

window scanで、match判断に必要な**境界文脈を保持**する。

#### 左境界

最低1文字のpre-contextをregex評価用に残す。

例:

```text
[context char][actual retained window...]
```

としてscanし、context部分から始まるmatchはfinding対象外にする。

これにより:

```regex
\b
(?<![A-Za-z0-9])
```

等が元lineと同じ左文脈で評価される。

単純にoverlapを1文字増やすだけでは、その1文字をfinding対象文字列として扱うと位置意味が変わるため、**contextとして保持することを明示**する方が安全。

#### 右境界

finalでないwindowの末尾に到達するmatchを即findingにしない。

候補:

1. `match.end === window.length` の場合は「暫定match」として次chunkまで持ち越す
2. 次の1文字以上のright-contextを取得してからboundary / lookahead条件を確定する
3. final physical line / newline / EOFでのみstring-end semanticsを使う

現在の`carryCandidate()`はwindow末尾へ到達したmatchをcarryしているため、この情報を利用して「finding追加も確定を遅らせる」設計にできる。

---

### 追加すべき回帰テスト

最低限:

#### 左境界

```text
"x" + github-shaped token
```

- whole lineではgithub findingなし
- token開始をwindow retained startへ合わせる
- window scanでもfindingなし

同様にkey-value:

```text
xpassword="Zq7x9Lm2Pw4Rt"
```

をwindow先頭へ切った場合もfindingなし。

#### 右境界

AWS:

```text
AKIA + ABCDEFGHIJKLMNOP + a
```

で、

- AWS 20文字部分がwindow末尾
- lowercase `a`が次chunk先頭
- whole-line findingなし
- window scan findingなし

#### soundness property

既存のcomplete invariantに加え、少なくともsynthetic casesについて:

```text
windowed secret findings ⊆ whole-line findings ∪ explicitly-allowed-overapproximation
```

を検証する。

完全な双方向equivalenceが難しい場合でも、boundary assertionsを持つ各patternのleft/right context testを固定する。

---

# M2-0-R3-001〜003 の再判定

## M2-0-R3-001 — 解消

private-key anchorを:

```text
-----BEGIN 
```

というliteral prefixへ変更したことで、前回の本体regex / anchor許容範囲の不一致は解消している。

独立確認:

### minimum-overlap settings

```text
maxLineBytes = 4096
lineOverlapBytes = 256
maxCarryBytes = 2048
```

で:

- label 33
- label 260

を確認。

結果:

```text
whole-line = private-key
window scan = secret:private-key
```

### default settings

label 5,000文字をwindow boundaryへ配置。

結果:

```text
whole-line = private-key
window scan = secret:private-key
```

前回の0-finding再現条件は潰れている。

また本体pattern / block beginのlabelは無制限のままで、masker / scanner coverageを狭めていない。

**M2-0-R3-001は解消**と判断する。

---

## M2-0-R3-002 — 解消

masker側のurl-credential patternは再び:

```regex
[a-z][a-z0-9+.-]*://
```

となりscheme長無制限。

独立確認では:

- scheme 64文字 → match
- scheme 65文字 → match
- scheme 200文字 → match

となった。

したがって前回の「scanner都合で共有masker coverageまで64文字へ狭めた」退行は解消。

scanner側だけ`scanPattern`でscheme 64文字までという既知制限を持つ。

これは今回のOriginal Requestで**人間承認済みの設計判断**として明示されているため、R4では再度findingにしていない。

**M2-0-R3-002は解消**と判断する。

---

## M2-0-R3-003 — 解消

`response-r2.md`の説明文にあったraw U+2028 / U+2029はescaped notationへ変更され、tracked Markdownを検査するregression testも追加された。

packet自身のGit Diffには過去版のremoved lineとしてraw characterが残るが、これはcurrent repository fileではない。

**M2-0-R3-003は解消**と判断する。

---

# 追加で確認した観点

## regex rewrite equivalence

R3で書き換えられた:

- private-key
- github
- key-value
- url-credential masker / scanner split

について、packetのequivalence testsに加えて、こちらでもcurrent pattern / partialへ追加の入力を当てた。

確認した範囲では:

- key-value optional `_` / `-`
- quote forms
- long whitespace
- URL short schemes
- long users / passwords
- GitHub各prefix
- private-key label長

で、今回のR3修正に由来する新しいfalse negativeは確認しなかった。

---

## window completeness追加探索

current scanner相当を使い、複数category・複数valid window settings・複数boundary positionについて追加のランダム確認を行った。

約5,000 synthetic casesで、

```text
whole-line finding
→ window scanで同category findingまたはoversized-candidate
```

という**見逃し防止側**の違反は追加確認できなかった。

これは証明ではなく追加探索。

---

# 指摘なしと判断した観点

今回の確認範囲では以下に追加問題を確認しなかった。

- private-key literal BEGIN anchor
- private-key label 33 / 260 / 5,000文字
- private-key candidate > maxCarry時のfail-closed方針
- private-key body / block beginの従来regex範囲維持
- scanner bodyをanchor + restで構成する構造guardの方向
- property generatorをlimit-derived lengthsへ拡張したこと
- rewritten private-key regexのequivalence guard
- rewritten GitHub regexのequivalence guard
- rewritten key-value regexのequivalence guard
- URL maskerをv0.3.1相当へ戻したこと
- URL scannerだけ`scanPattern`を持つ設計
- URL scheme >64 scanner limitationを明示的にdocumentしたこと
- R3-003 raw separator修正
- tracked Markdown raw separator test
- v0.3.2 tagを移動せずv0.3.3を新tagとした運用
- packet記載上338 tests ×10 / source / built / linked verifyがPASSしていることとの整合

---

# 既知制限として再指摘しない事項

以下はpacket / Human Decisionで明示的に受容されているため、今回新規findingにはしていない。

## URL scheme >64

scanner:

```text
scheme > 64 characters
→ url-credential categoryでは検出しない
```

masker:

```text
scheme長無制限でredact
```

これはM2-0-R3-002への採用済みOption A。

独立レビュー上、security coverage limitationであること自体は変わらないが、今回の承認仕様に沿っている。

---

# 独立再現した項目

## 1. private-key R3修正

current packet sourceを抽出して実行。

### label 33 / 260

```text
whole line = private-key
windowed = secret:private-key
```

### label 5,000 / default

```text
whole line = private-key
windowed = secret:private-key
```

前回Highは再現しなかった。

---

## 2. URL masker

current shared `pattern`を実行。

```text
scheme 64  → match
scheme 65  → match
scheme 200 → match
```

前回Mediumのmask coverage narrowingは再現しなかった。

---

## 3. left-window boundary false positive

default相当のwindow設定で:

```text
x + ghp_ + aaaaaaaaaaaaaaaaaaaaaaaaa
```

を配置。

`g`がfallback overlap後のwindow先頭になる位置へ合わせた。

結果:

```text
whole-line findings = []
window scan = secret:github
```

前の`x`が落ちることで、window先頭で`\b`が成立する。

→ M2-0-R4-001。

---

## 4. right-window boundary false positive

AWS-shaped 20文字をwindow末尾へ置き、直後のlowercase `a`を次chunkへ置いた。

結果:

```text
whole-line findings = []
window scan = secret:aws
```

whole lineでは末尾`\b`が成立しないが、provisional window末尾ではstring-end boundaryとして成立する。

→ M2-0-R4-001。

---

# 見ていない / 独立実行していない範囲

今回のレビューは添付`review-packet-m2-0-r3.md`を主な根拠としている。

独立実行していないもの:

- GitHub上の`cb632cd...`とpacketのbyte-level一致
- v0.3.3 tag / tag objectのremote実在
- 338 tests ×10の実ログ
- 5 commitsのworktree verificationそのもの
- `npm run verify`
- `npm run verify:dist`
- linked `aiqh verify`
- package smoke tarball
- `npm audit`
- Target A / Target B repositoryの実内容
- Windows / Linuxの全scanner挙動
- M2-0で変更されていないM0/M1コード全体

独立実行・確認したもの:

- packet掲載`patterns.ts` / `scan.ts`相当コード
- private-key 33 / 260 / 5,000 label window cases
- URL maskerの64 / 65 / 200文字scheme
- current partial regexへ追加synthetic inputs
- 約5,000件の追加window completeness探索
- GitHub left-window context loss
- AWS right-window context loss

---

# 推奨対応

## M2-0-R4-001

人間側の完了ルール上はM2-1以降へ持ち越し可能。

ただしM2-1 backlogへ、単なる「false positive」とだけでなく:

```text
window scanner must preserve regex boundary context
```

という設計課題として記録することを推奨する。

特に次の2点をセットで扱う。

1. left context
   - `\b`
   - negative lookbehind

2. right context
   - trailing `\b`
   - 将来追加されるlookahead / end-sensitive pattern

---

# v0.3.3 / M2-0 完了判断

前回R3の3件について:

- **M2-0-R3-001: 解消**
- **M2-0-R3-002: 解消**
- **M2-0-R3-003: 解消**

今回の新規finding:

- **High: 0**
- **Medium: 1**

したがって、人間側の事前ルール:

```text
R4でHighが無ければM2-0完了
Medium以下はM2-1以降へ積む
```

に従えば、

**M2-0をv0.3.3で完了扱いにしてよい**

と判断する。

ただし `M2-0-R4-001` はSecurity Scanのwindow semanticsに関わるため、M2-1+ backlogの比較的早い位置で対応することを推奨する。

最終判定:

- v0.3.3: M2-0 completion baselineとして使用可
- M2-0-R4-001: Medium carry-over
- Critical / Highの未解決事項: 今回確認なし
