# M0 / R6 最終独立レビュー

対象: `ai-quality-harness` M0 / R6 maintenance release  
レビュー資料: `review-packet-m0-r6.md`  
packet記載バージョン: `v0.1.6`  
packet記載commit: `8092f9f`

## 結論

R6-001〜R6-003のうち、

- R6-001: **report用64KiB `tail()` のUTF-8境界問題は解消**
- R6-002: **CHANGELOGのtag SHA表記問題は解消**
- R6-003: **signal handler swapの説明精度問題は解消**

と判断します。

ただし、R6-001でUTF-8処理を共通helperへ移した際に、`OutputBuffer`側へ新しい境界条件の退行が入っています。

Critical / High の問題は確認していません。  
今回の追加指摘は **Medium 1件**です。

---

## R7-001

- **ID:** R7-001
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/runner/execute.ts` — `OutputBuffer.push()` / `src/runner/utf8-trim.ts` — `utf8LeadingBytesToDrop()`
- **内容:** R6-001でUTF-8境界処理を共通helper化した結果、`OutputBuffer`でUTF-8文字が複数のstdout/stderr chunkに分割されている場合、先頭のcontinuation byteを完全に除去できない経路がある。結果として、保持outputが再び `U+FFFD (�)` から始まり、再エンコード時のbyte数がcapを超える可能性がある。

### 根拠

R6後の`OutputBuffer.push()`は、byte capを超えた後に以下の処理を行う。

1. `dropFront(this.size - this.maxBytes)` で超過分を削る
2. 現在の**先頭chunkだけ**を `head` として取得
3. `utf8LeadingBytesToDrop(head)` を1回だけ実行
4. そのbyte数を`dropFront()`する

概念上は次の形。

```ts
const head = this.chunks[0];
if (head !== undefined) {
  this.dropFront(utf8LeadingBytesToDrop(head));
}
```

`utf8LeadingBytesToDrop()`自体は、渡された1つの`Uint8Array`の先頭から最大3個のcontinuation byteを数える。

これは**1つの連続Bufferに対しては正しい**ため、`run-checks.ts::tail()`の64KiB処理では問題ない。

しかし`OutputBuffer`は複数のstream chunkを配列で保持している。

UTF-8 code point自体がchunk境界をまたいでいる場合、最初のchunkに含まれるcontinuation byteを削除した結果、そのchunkが空になって削除され、**次のchunkもcontinuation byteから始まる**ことがある。

現在のコードは新しい先頭chunkに対して再度alignment checkを行わない。

### 独立再現

有効なUTF-8文字列:

```text
A😀B
```

UTF-8 bytes:

```text
41 F0 9F 98 80 42
```

これをstream chunkとして次のように分割する。

```text
chunk 1: 41 F0 9F
chunk 2: 98 80 42
```

`maxBytes = 4` とする。

全体6 bytesなので2 bytesを先頭から削ると、

```text
chunk 1: 9F
chunk 2: 98 80 42
```

となる。

現在のhelperは最初のchunk `9F` をcontinuation byteと判定して1 byte削除する。

するとchunk 1が消え、新しい先頭は:

```text
98 80 42
```

となるが、ここではalignment checkが再実行されない。

保持結果:

```text
98 80 42
```

をUTF-8としてdecodeすると:

```text
��B
```

になる。

独立再現結果:

```text
retained bytes: 98 80 42
decoded text: "��B"
re-encoded UTF-8 length: 7 bytes
```

元のcapは4 bytesなので、R5-004で防止した

- U+FFFD発生
- decode後の再エンコードでcap超過

が再発する。

### なぜ既存テストで検出しにくいか

R5/R6のUTF-8テストは、主に連続した大きなUTF-8出力を使用している。

OS pipe / Node streamの`data` chunk境界は任意なので、通常実行でもmultibyte文字をまたぐ可能性はあるが、テスト実行時に都合よくその境界になる保証はない。

またR6の`tail()`テストは`Buffer.from(string)`という**単一の連続Buffer**を`utf8SafeTail()`へ渡すため、この問題は発生しない。

### 修正案

`OutputBuffer`では、R5時点の方式のように**削除するたび新しい先頭byteを再確認**するのが最小で安全。

例:

```ts
for (let i = 0; i < 3; i++) {
  const first = this.chunks[0]?.[0];
  if (first === undefined || !isUtf8ContinuationByte(first)) {
    break;
  }
  this.dropFront(1);
}
```

この方式なら、1byte削除によって先頭chunkが消えても、次のiterationで新しい先頭chunkを確認できる。

共通helper化を維持したい場合は、以下のようなhelperを追加する方法もある。

- chunk列の先頭から最大3 bytesを横断してcontinuation byte数を求める
- または`OutputBuffer`側だけ上記loopを使用し、`utf8SafeTail()`は連続Buffer専用helperとして残す

### 追加すべき回帰テスト

chunk境界を**意図的に固定**できる単体テストを追加する。

例:

```text
UTF-8: A😀B
bytes: 41 F0 9F 98 80 42

chunks:
  [41 F0 9F]
  [98 80 42]

maxBytes:
  4
```

期待値:

- decoded outputに`�`を含まない
- UTF-8再エンコード長が`maxBytes`以下
- 最後の`B`が保持される

4-byte UTF-8文字だけでなく、3-byte文字でもchunk境界をまたぐケースを1件入れるとより安全。

---

# R6-001〜R6-003 の判定

## R6-001 — report tail側は解消

`run-checks.ts::tail()`は、

```ts
utf8SafeTail(Buffer.from(out, "utf8"), TAIL_BYTES)
```

を使用するようになった。

ここでは入力が1つの連続Bufferなので、

- byte capで末尾を取得
- 先頭がcontinuation byteなら最大3 bytes追加で捨てる

という`utf8SafeTail()`の実装でUTF-8境界へ正しく揃えられる。

追加されたR6 regression testも、

- `tail()`直接
- `toCheckResult()`経由
- stdout
- stderr
- U+FFFDなし
- 64KiB以下
- 最後のmarker保持

まで確認している。

したがって、**前回R6-001で指摘した64KiB report tailの問題自体は解消**と判断する。

今回のR7-001は、共通化の際に`OutputBuffer`側へ入った別のchunk-boundary問題。

---

## R6-002 — 解消

CHANGELOGはtag object SHAとcommit SHAを明確に区別し、

```text
v0.1.4 — commit 37a5b50 / tag object 4b7c943
```

のような形式へ変更された。

v0.1.0〜v0.1.5について同じ表記規約へ統一され、CLAUDE.mdにも

```text
git rev-list -n1 <tag>
```

を文書上の主SHAとするルールが追加されている。

packet内の過去review記録にあるcommit SHAとも整合している。

v0.1.6自身についてはtag作成前のtagged treeへ自己のtag SHAを書けないため、CHANGELOGから最終報告 / M0_COMPLETIONへ参照させる方法は妥当。

packetの検証記録では、

```text
v0.1.6 commit: 8092f9f...
tag object: 10fd4d9...
```

としてlocal / remoteのpeeled commitも突き合わせたと記録されている。

したがってR6-002は解消。

---

## R6-003 — 解消

説明は、

- swap中は一時的にbefore / afterの2listenerが登録される
- 通常のOS signalは非同期dispatch
- 同期swap終了後のlistener集合で処理される
- 同期的な`process.emit()`をswap内部から呼んだ場合のみ両方実行され得る

という内容へ修正された。

これは現在のadd-before-remove実装と整合している。

コード動作そのものへの追加問題は確認していない。

R6-003は解消。

---

# M0 / v0.1.6 の最終評価

今回の独立確認では、新しいCritical / Highは見つからなかった。

R1〜R6で主要なM0論点はかなり整理されている。

- fail-closed verdict
- required / optional semantics
- config validation
- secret masking
- Authorization masking
- quoted secret handling
- process-group timeout / SIGKILL escalation
- CLI SIGINT / SIGTERM interruption
- verdict fixing point
- signal handler swap
- symlink / dangling symlink containment
- git dirty unknown
- exit code / wording
- package smoke
- bin / shebang / dependencies / version
- runtime output tail
- report output tail
- tag audit trail

packet記載ではv0.1.6で:

- 143 tests
- full suite 10回連続PASS
- lint PASS
- typecheck PASS
- source self verify PASS
- built self verify PASS
- package check PASS
- dependency check PASS
- tag cross-check PASS

となっている。

今回のR7-001はMediumであり、**M0設計そのものを覆す問題ではない**。

ただし、UTF-8出力保持の修正をR5/R6で明示的に品質要件として扱った以上、chunk境界ケースも修正してからM1 baselineを固定する方が整合的。

「R7レビューラウンドは行わない」という運用方針を維持するなら、

- R7-001を「M0 maintenance follow-up」として直接修正
- regression test追加
- maintenance tag（例: v0.1.7）を追加
- その後M1開始

という扱いで十分。

---

# 指摘なしと判断した観点

- `tail()`での`utf8SafeTail()`利用
- 64KiB report tailのUTF-8境界修正
- stdout / stderrのR6 regression test
- CHANGELOGのpeeled commit SHA表記
- tag object SHAとの区別
- v0.1.6自身のSHAをtagged tree外の最終報告へ記録する方式
- CLAUDE.mdへのtag SHA規約追加
- R6-003のsignal handler説明
- add-before-remove handler swap自体
- v0.1.3をsupersededのまま履歴保持する運用
- v0.1.6をM0 maintenance releaseとして別tag化する方針
- R1〜R6のreview履歴を削除せず残す方針

---

# 見ていない / 独立実行していない範囲

今回のレビューは添付`review-packet-m0-r6.md`を主な根拠としている。

独立実行していないもの:

- GitHub上の`8092f9f`とpacketのbyte-level一致
- 143 tests × 10回の実ログ
- `npm run verify`
- `npm run verify:dist`
- 実tarball
- `npm audit`
- remote tagの実在
- Linux
- Windows
- safety valveの実発火
- masker / pre-push guard / M1 Security Scanのpattern agreement
- R6で変更されていないrepository全体

独立確認したもの:

- R6共通helperのUTF-8境界アルゴリズム
- `run-checks.ts::tail()`の連続Bufferでの妥当性
- `OutputBuffer`でmultibyte UTF-8 code pointが複数chunkへ分割された場合の挙動
- `A😀B`を
  - `[41 F0 9F]`
  - `[98 80 42]`
  に分割し、`maxBytes=4`で現在方式が`"��B"`になること

---

# 最終推奨

## 修正推奨

**R7-001のみ。**

修正規模は小さい。

`OutputBuffer`でUTF-8 alignmentを行う際に、先頭chunkだけを一度見るのではなく、continuation byteを1byteずつ最大3回、**chunkをまたいで再確認**する。

## その後

R7-001の回帰テストがPASSし、既存143テストとself verifyが維持されれば、M0を閉じてM1へ進んでよいと判断する。

Critical / Highの未解決事項は今回確認していない。
