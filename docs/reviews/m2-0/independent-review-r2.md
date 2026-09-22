<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-0-r2-for-claude.md、9/20 付）のうち、本体の Security Scan に一致する
例示 1 行（原文の行番号 422、URL 認証情報の形）を、<scheme>://<username>:<password>@host.example の言い換えに変えた。意味は変えていない。
それ以外は原文のまま。無改変の原文の SHA-256: 4d1593ce7b70dacf2461c3e2e435e444a734236fb5fda877a20c3a4ed7d213d2
-->

# M2-0 独立レビュー R2 — Claude Code 修正依頼用

対象: `ai-quality-harness` M2-0 / independent review R1 対応後  
レビュー資料: `review-packet-m2-0-r1.md`  
対象範囲: `v0.3.0..v0.3.1`  
packet記載の `v0.3.1`: commit `e25f59f` / tag object `c2c6985`  
想定保存先: `docs/reviews/m2-0/independent-review-r2.md`

## 総括

M2-0-R1-001〜003 の修正自体は、前回の具体的な再現条件を概ね正しく潰しています。

特に以下は確認できました。

- `0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes` のcross-field validation
- `LineAssembler` constructorでの同関係の防御
- sliding-windowのprogress invariant
- `security-scan` text / JSONのmask boundary
- `allow[].reason` / `path` のCR/LF禁止
- 未追跡 `.gitignore` での `--write-gitignore` 重複追記防止
- tracked `.gitignore` のnegation repair維持

一方、独立確認では新たに以下を指摘します。

- **High: 1件**
- **Low: 2件**

最優先は **M2-0-R2-001** です。

人間側ルール「R2でHighが無ければM2-0完了」に照らすと、今回はHighを1件確認したため、`v0.3.1`をM2-0最終baselineとすることは推奨しません。

---

# Findings

## M2-0-R2-001

- **ID:** M2-0-R2-001
- **重要度:** High
- **種別:** セキュリティ / バグ
- **対象:** `src/security/scan.ts` — `LineAssembler.push()` / `carryCandidate()`、`src/security/patterns.ts` — sliding-window `anchor`
- **内容:** M2-0のsliding-windowは「**完成したanchor**」を見つけた後のsecret bodyを持ち越すことはできるが、anchor自体がwindow境界をまたいだ場合のpartial anchorを保持できない。そのため、**有効なsecret-shaped stringをSecurity Scanが0 findingで見逃すfail-open**が残っている。URL credentialではデフォルト設定でも再現できる。
- **根拠:** 現在のlong-line処理は、complete matchまたは`pattern.anchor.start`に完全一致するanchorを`carryCandidate()`で探す。候補が無ければ、次windowへ残すのは`lineOverlapBytes`だけ。

  URL credentialのanchorは:

  ```ts
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:/gi
  ```

  で、`scheme://user:`全体が揃って初めてanchorになる。

  `user`部分は長さ上限が無いため、`scheme://`が前windowにあり、最後の`:`が次windowに来ると、前windowではanchorが成立しない。

  そのときfallbackとして残るのは既定4 KiBだけなので、`scheme://`開始位置が4 KiBより前なら失われる。

  次windowでは`user:`の後半しか残っておらず、URL credential regexもanchor regexも開始位置を復元できない。

### 独立再現

現在のM2-0 algorithmと同じ、

- `maxLineBytes = 256 KiB`
- `lineOverlapBytes = 4 KiB`
- `maxCarryBytes = 64 KiB`
- read chunk = 64 KiB
- URL credential pattern / anchor

を使って再現した。

1行500,000文字の中で、

```text
position 322000:
https://
<10000文字のusername>
:
Secret123!
@host.example
```

を配置した。

最初にsliding-windowが発動するwindowは327,680文字。

このwindow内には:

```text
https:// + username前半
```

まではあるが、username終端の`:`は次のread chunk側にある。

したがって:

```text
complete URL credential match = なし
complete URL anchor           = なし
carryCandidate                = null
```

となる。

fallback overlap 4 KiBを残すと`https://`開始位置は失われる。

その後、残りのusername + `:Secret123!@host.example`が入ってもscheme部分がないためmatchしない。

コード等価の独立再現結果:

```text
findings = 0
```

だった。

元の全文に対して通常のURL credential regexを適用すれば、このsecretは正しくmatchする。

### custom overlapでもさらに容易に再現

今回のR1修正で、

```text
0 < overlap <= carry <= line
```

なら有効configになった。

例えば:

```text
lineOverlapBytes = 1
```

も正式にvalid。

この場合、`sk-ant-` / `AKIA`等の**有限長anchor自体**がread/window境界で分割されても、必要なprefixを保持できず見逃し得る。

したがって「数値関係が正しい = scanner correctnessが保たれる」ではない。

### 対象カテゴリ

少なくとも以下を再検討する必要がある。

- `url-credential`
  - anchor内のusernameが無制限
- `key-value`
  - anchor内に`\s*`等の可変長部分がある
- 固定長anchorカテゴリ
  - overlapを小さく設定するとanchor自体を分断可能

### 影響

Security Scanが:

```text
SECURITY SCAN: no findings
exit 0
```

となり得るため、fail-closed設計に直接反する。

しかもURL credentialの再現は**デフォルトwindow設定**でも成立するので、単なる異常config問題ではない。

### 修正案

「完全anchorを見つけてからcarryする」だけでなく、**partial anchorもstreaming stateとして保持**する必要がある。

候補:

1. pattern metadataにpre-anchor / partial-anchor stateを持たせる
2. URLなら`scheme://`を見つけた段階からcandidateとして保持し、username→colon→password→`@`まで状態遷移させる
3. key-valueならkey名を見つけた段階から、quote / whitespace / `:` / `=` / value開始までcandidateとして保持する
4. candidateが`maxCarryBytes`を超えた場合は`oversized-candidate`としてfail closed

固定長anchorについては最低overlapを最大anchor長以上に固定する方法もあるが、URL / key-valueのような可変長anchorにはそれだけでは不十分。

単純に`lineOverlapBytes`を増やすだけでは、さらに長いusername / whitespaceで同じ問題が再発する。

### 追加すべき回帰テスト

最低限:

- **default settings**で、URL anchor自体がsliding-window境界をまたぐ
- URL usernameが4 KiB超で、scheme開始がfallback overlap外へ落ちる
- secret本体は通常regexならmatchすることをguardで確認
- scannerはfindingを出すか、candidateが上限超過なら`oversized-candidate`でfail closed
- custom `lineOverlapBytes = 1`で固定長anchor (`sk-ant-`等) を境界分割しても見逃さない
- key-value anchor内の長いwhitespaceが境界をまたぐケース

---

## M2-0-R2-002

- **ID:** M2-0-R2-002
- **重要度:** Low
- **種別:** セキュリティ / ドキュメント
- **対象:** `src/config/schema.ts` — `allowRuleSchema`、`src/commands/security-scan.ts` — text audit output
- **内容:** R1-002で「allow reason / pathのline breakを禁止」したが、禁止しているのはCR/LFだけで、Unicode line separatorやterminal control charactersはそのまま通る。audit textの表示整合性を壊し得る。
- **根拠:** schemaは:

  ```ts
  .regex(/^[^\r\n]*$/, ...)
  ```

  だけ。

  そのため例えば:

  ```text
  U+2028 LINE SEPARATOR
  U+2029 PARAGRAPH SEPARATOR
  ESC (U+001B)
  ```

  は許可される。

  独立確認:

  ```js
  /^[^\r\n]*$/.test("one\u2028two") === true
  /^[^\r\n]*$/.test("one\u2029two") === true
  ```

  だった。

  `maskSecrets()`はsecret shapeをmaskする機能であり、ANSI escapeやUnicode line separatorをescapeする機能ではない。
- **影響:** configはR-006上trusted inputなので重大な権限境界問題ではない。ただし、`security.allow`は監査理由をtext出力する機能なので、意図せず複数行表示・terminal制御・audit logの見た目の混乱を起こし得る。
- **修正案:** どちらか。
  1. `reason` / `path`でC0/C1 control charactersと`U+2028/U+2029`を禁止
  2. text output時にcontrol charactersをvisible escapeへ変換

  最小なら少なくとも:

  ```text
  \r \n \u2028 \u2029
  ```

  は禁止する。
- **追加テスト:** `\u2028` / `\u2029`入りreasonとpathがschema errorになること。

---

## M2-0-R2-003

- **ID:** M2-0-R2-003
- **重要度:** Low
- **種別:** ドキュメント
- **対象:** `review-packet-m2-0-r1.md` — Verification Results / response-r1 execution record
- **内容:** R1 regression test件数の記録が、packet内の実テスト数と一致していない。
- **根拠:** 掲載されている3テストファイルの`it(...)`数は:

  ```text
  regression-m2-0r1-001-window-limits: 8
  regression-m2-0r1-002-scan-output-mask: 3
  regression-m2-0r1-003-untracked-gitignore-write: 3
  -----------------------------------------------
  total: 14
  ```

  commit message側も:

  ```text
  R1-001: 8 tests
  R1-002: 3
  R1-003: 3
  ```

  なので14件。

  CHANGELOGも「回帰14件を追加」としており、suite総数も:

  ```text
  280 + 14 = 294
  ```

  と整合する。

  一方Verification Results / response記録には:

  ```text
  13 tests: 10 FAIL / 3 PASS
  after fix: 13 PASS
  ```

  とある。
- **影響:** 実装のcorrectnessには影響しないが、品質ハーネス自身のreview audit trailとして件数が不整合。
- **修正案:** 実ログを確認し、
  - pre-fix時点に本当に存在したtest数
  - post-fix最終test数

  を分けて記録する。

  もし1件を途中追加したのであれば:

  ```text
  pre-fix: 13
  final regression suite: 14
  ```

  のように明記する。

  そうでなければ13→14へ訂正する。

---

# M2-0-R1-001〜003 の再判定

## M2-0-R1-001 — 元のhang再現条件は解消

R1で指摘した:

- `overlap > line`
- `carry > line`
- `overlap > carry`
- defaultとsingle overrideの組み合わせ
- direct `LineAssembler` constructor
- future regression向けprogress invariant

については適切に防御された。

特に:

```text
0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes
```

をdefaults適用後に`resolveSecurity()`で検証するため、前回のvalid-config infinite loopは潰れている。

constructor checkとprogress invariantもdefense-in-depthとして妥当。

**前回のM2-0-R1-001そのものは解消**と判断する。

ただしwindow scanner全体にはM2-0-R2-001という別のHigh false-negativeが残る。

---

## M2-0-R1-002 — secret再出力の元問題は解消

text output:

```text
maskSecrets
```

JSON:

```text
maskDeep(result)
```

を通すようになり、allow reasonにsecret shapeが入っても生値を再出力しない。

config file自身のsecret findingは残すテストも適切。

CR / LF禁止も元の通常改行ケースを潰している。

**secret leakageというR1-002の中心問題は解消**。

追加のhardeningとしてM2-0-R2-002を指摘する。

---

## M2-0-R1-003 — 解消

未追跡`.gitignore`について:

- missing → 1回作成
- untracked + canonical `artifacts/`あり → 追記しない、`git add .gitignore`案内
- tracked + negation → 末尾へrepair
- repair後の再実行 → 重複しない

となり、前回の「毎回`artifacts/`を追加する」問題は解消。

scanner側の「untracked `.gitignore` ruleはcoverageとして数えない」という方針も維持されている。

人間が指定したR1-003の再現条件は解消と判断する。

---

# 指摘なしと判断した観点

今回の確認範囲では以下に追加問題を確認しなかった。

- defaults適用後のwindow limit cross-field validation
- single-field overrideによる不整合拒否
- boundary `overlap == carry`
- boundary `carry == line`
- `LineAssembler` constructorでのrelation check
- sliding-window progress invariant
- invalid configでstandalone `security-scan`がexit 2になる経路
- text modeの`maskSecrets` boundary
- JSON modeの`maskDeep` boundary
- allow reason内secretのredaction
- allow rule usage / suppressed findingのaudit情報維持
- CR / LFを通常のline breakとして拒否する処理
- 未追跡 `.gitignore` の重複追記防止
- missing `.gitignore` の初回1回作成
- tracked `.gitignore` のnegation repair
- v0.3.0 tagを移動せずv0.3.1を新tagとした運用
- packet記載上、各commitでtypecheck / tests / verifyがPASSしていることとの整合

---

# 独立再現した項目

## 1. default設定でのpartial URL anchor miss

M2-0のcurrent algorithmと同じ:

```text
maxLineBytes = 262144
lineOverlapBytes = 4096
maxCarryBytes = 65536
READ_CHUNK = 65536
```

を使い、URL credentialのscheme開始をposition 322000、usernameを10000文字とした。

全文には有効な:

```text
<scheme>://<username>:<password>@host.example
```

が存在する。

sliding-window境界でanchor completion前にscheme開始が4 KiB overlap外へ落ち、コード等価再現の結果:

```text
findings = 0
```

となった。

→ M2-0-R2-001。

## 2. Unicode line separator

schemaと同じregex:

```js
/^[^\r\n]*$/
```

で:

```text
"one\u2028two" → true
"one\u2029two" → true
```

を確認した。

→ M2-0-R2-002。

## 3. regression test count

packet掲載テストの`it(...)`を数え:

```text
8 + 3 + 3 = 14
```

を確認した。

→ M2-0-R2-003。

---

# 見ていない / 独立実行していない範囲

今回のレビューは添付`review-packet-m2-0-r1.md`を主な根拠としている。

独立実行していないもの:

- GitHub上の`e25f59f`とpacketのbyte-level一致
- v0.3.1 tag / tag objectのremote実在
- 294 tests × 10回の実ログ
- 5 commitsのworktree verificationそのもの
- `npm run verify`
- `npm run verify:dist`
- linked `aiqh verify`
- package smoke tarball
- `npm audit`
- Target A / Target B repositoryの実内容
- Windows / LinuxのM2-0挙動
- M2-0で変更されていないM0/M1コード全体

M2-0-R2-001については、packet掲載の`LineAssembler` / `carryCandidate`ロジックとM2-0のshared URL pattern/anchorを使ったコード等価の独立再現を行った。

---

# 推奨対応順

1. **M2-0-R2-001**
   - partial anchorをwindow boundaryで失わない設計
   - default settingsでのURL long-line回帰テスト
   - custom small overlapでの固定anchor回帰テスト

2. **M2-0-R2-002**
   - Unicode line separator / control character hardening

3. **M2-0-R2-003**
   - review audit trailのtest件数訂正

---

# v0.3.1 / M2-0 完了判断

R1で指摘した3件の修正自体は成立している。

しかし **M2-0-R2-001 はHigh** で、Security Scanが実在するcredentialをデフォルト設定でも0 findingで見逃せる。

したがって、人間側ルール:

```text
R2でHighが無ければM2-0完了
```

には該当しない。

現時点では `v0.3.1` をM2-0最終baselineとして固定することは推奨しない。

推奨運用:

- `v0.3.1` tagは削除・移動しない
- M2-0-R2-001を必須修正
- committed HEADで:
  - typecheck
  - full tests
  - source verify
  - built verify
  - linked verify
  - security PASS
- maintenance releaseとして `v0.3.2` を付与
- R2-002 / R2-003は同時修正またはM2-1 backlogへ明示

最終判定:

- **M2-0-R1-001: 解消**
- **M2-0-R1-002: 中心問題は解消（Low hardeningあり）**
- **M2-0-R1-003: 解消**
- **M2-0 completion: High修正後を推奨**
