## R5-001

- **ID:** R5-001
- **重要度:** High
- **種別:** バグ
- **対象:** `src/cli.ts` — `swapHandlersToFinalized()`
- **内容:** 確定点通過時のsignal handler差し替えがatomicではなく、`process.off()` と `process.on()` の間に **SIGINT/SIGTERM listenerが0件になる瞬間**がある。この区間にsignalが来るとNodeのdefault actionでprocessが終了し、「確定点以降のsignalは結果を変えない」という仕様を破れる。
- **根拠:** 現在は各signalについて、先にbefore handlerを`off`し、その後でfinalized handlerを`on`している。
  
  Node公式では、SIGINT/SIGTERMはlistenerを登録するとdefault終了動作が解除される、と説明されている。したがって最後のlistenerを外した状態ではdefault動作へ戻る。
  
  独立確認として、同じ順序で
  `on → off → SIGINT → on`
  を実行すると、POSIX環境で後段の`on`まで到達せず **exit 130** になることを確認した。実コードのgapは非常に短いが、外部OS signalはJSの同期処理中でも到着できるためraceとして残る。
- **修正案:** 順序を逆にする。
  1. finalized handlerを先に`process.on()`
  2. その後before handlerを`process.off()`
  
  これならlistener=0の区間が存在しない。一時的に2listenerになるが、同一JS call stack中に追加→削除まで完了するため、signal callback実行時には通常finalized handlerだけが残る。
  
  finalized handlerも匿名関数ではなく参照を保持すると、cleanup/testも容易になる。
  
  回帰テストでは、handler swap helperを切り出し、swap途中にsignalを注入してprocessがdefault actionへ戻らないことを固定する。

---

## R5-002

- **ID:** R5-002
- **重要度:** Medium
- **種別:** 設計
- **対象:** `src/commands/verify.ts` — `yieldFullIteration()` / finalization semantics
- **内容:** `setImmediate`を2回awaitすることで「1回のpoll phaseを必ず経る」という説明は概ね正しいが、**「確定点より前にOSへ到着したsignalを確実に拾う」ことまでは保証できない**。
- **根拠:** 現在は2回目の`setImmediate`後に一度だけ`signal.aborted`を読み、その直後に`onFinalized()`を呼んでいる。
  
  Node公式は、実行中callbackから登録した`setImmediate()`は次iterationになるとしているため、2つ目のimmediateの前に次iterationのpollを通る、という実装側の考察は妥当。 libuvでもcheck phaseはpoll直後である。
  
  しかし、その**最後のpollが終了した後〜2つ目のimmediate callback〜`signal.aborted`の読取りまで**にもOS signalは到着できる。Unixのlibuv signal処理はsignal pipeをI/O pollingで処理するため、そのsignalのJS callbackは次のpollまで実行されない。
  
  したがって物理的には「onFinalizedより前に届いたsignal」でも、Node側で未dispatchのまま`aborted === false`→finalizedとなる窓は残る。2回を3回、4回に増やしても最後のpoll後には同じ窓が生じる。
  
  現在のテストは「全check終了直後に既にpendingにしたsignal」を検証しており、その再現条件には有効。
- **修正案:** 純粋なJSだけでOS arrival時刻との完全なatomic boundaryを作るのは難しいため、仕様を正確に定義する方が現実的。
  
  例えば、
  > 「確定点直前のpoll checkpointまでにNodeへdispatchされたsignalは中断として扱う。最後のsignal-dispatch checkpoint後に到着し、まだJS handlerへdispatchされていないsignalは確定後signalとして扱う」
  
  とする。
  
  もし「OSに確定点前に到着したsignalを100%中断扱い」が絶対要件なら、JSのevent-loop yieldだけでは不足し、nativeなsignal masking/同期機構等が必要。
  
  現在のコメント・ARCHITECTUREにある「確定点直前のsignalを確実に拾う」は、上記のobservable semanticsへ表現を狭めるべき。

---

## R5-003

- **ID:** R5-003
- **重要度:** Medium
- **種別:** 設計
- **対象:** `src/commands/verify.ts` — finalization point / `writeReports()`
- **内容:** `onFinalized()`をreport書込みより前に呼んでいるため、「確定点通過後は結果・終了コードが0/1で固定」という設計説明と実コードが一致していない。report書込み失敗なら確定点後でもexit 2へ変わる。
- **根拠:** コードは、
  1. `yieldFullIteration`
  2. `interruptedBy`判定
  3. `onFinalized()`
  4. `buildReport`
  5. `writeReports`
  
  の順。`writeReports()`がthrowすると、その後`VERIFY ERROR (report write error)`、`EXIT_ERROR=2`を返す。
  
  一方、Architecture Decisionでは「Not aborted ⇒ onFinalized ⇒ report/output/exit 0-1 from the fixed result」とし、packet本文でも確定点以降は結果固定としている。
  
  これは既存R-007の「report write failureはexit 2」という設計と衝突している。
- **修正案:** どちらかに統一する。
  
  **案A（推奨）:** 「check verdict確定点」と「CLI outcome確定点」を分ける。
  - check結果は現在位置で固定
  - report書込み成功後にCLI outcomeをfinalizedとする
  - docsでは「0/1確定」と言わない
  
  **案B:** 本当のfinalizationを`writeReports()`成功後へ移す。ただしreport書込み中に届いたsignalをどう扱うかも仕様化し、必要なら書込み後にevent loopへyieldしてsignalを確認する。
  
  少なくとも現状の「onFinalized後は終了コードも0/1で固定」という説明は修正が必要。

---

## R5-004

- **ID:** R5-004
- **重要度:** Low
- **種別:** バグ
- **対象:** `src/runner/execute.ts` — `OutputBuffer.push()` / `toString()`
- **内容:** 単一巨大chunkの末尾欠落自体は修正されているが、byte単位で任意位置を切るため **UTF-8の途中からbufferが始まり、先頭文字を破損させる**。さらにUTF-8文字列へdecode→再encodeすると、指定byte上限を超えることがある。
- **根拠:** excess分を`head.subarray(excess)`でそのまま切り、その後`Buffer.concat(...).toString("utf8")`している。
  
  独立確認ではUTF-8の`"ああ"`（6 bytes）を4 bytesにtail trimすると、保持Bufferは4 bytesだが文字列は `"�あ"` となり、これをUTF-8へ再encodeすると **6 bytes** になった。
  
  現行回帰テストはASCIIの`x/a/b`のみなので、この境界は検出していない。
- **修正案:** text captureとして扱うなら、trim後の先頭がUTF-8 continuation byteの場合は、有効なcode point境界まで最大3 bytes追加で捨てる。
  
  例えばBufferの末尾maxBytesを取った後、先頭側を走査して最初のvalid UTF-8 boundaryへ合わせる。または`StringDecoder`を使ったstreaming設計にする。
  
  「厳密な最後N bytes」を優先するなら、文字列化時に破損することを仕様として明記し、テストにmultibyte出力を追加する。
  
  なお、今回発見された「chunk全体が消えて空になる」問題は修正できている。

---

# R4-001〜R4-003 の判定

### R4-001 — 元のraceは大幅改善。ただし完全closeではない

`setImmediate`1回だったv0.1.3が不十分だったという自己検出は正しい。Nodeの`setImmediate`はI/O callback後に実行され、実行中callbackからqueueしたimmediateは次のiterationになるため、**2回awaitすれば少なくとも次iterationへ進む**という根拠は成立する。

10回フルsuiteと20回対象testが安定したことも、以前の具体的なpending-signal再現条件には強い証拠。

ただしR5-001のhandler swap gapと、R5-002の「最後のpoll後に到着したsignal」の意味論が残るため、完全解消とはしない。

### R4-002 — 解消

中断branchでも通常branchと共通でtailとtruncate状態を計算し、`timedOut`、signal、tails、`outputTruncated`を保持している。

追加テストも、chatty outputの中断とtimeout→abort重複の両方を直接確認している。

前回の具体的再現条件は解消と判断する。

### R4-003 — 解消

SKIP判定を`onCheckStart`より前へ移し、未実行checkは`onCheckSkip`だけを呼ぶ構造になった。

実CLI testでも後続checkのcommand表示がないこととSKIPPED表示を確認している。

前回指摘は解消。

---

# 自己検証で発見した2件

### 確定点yield不足

**v0.1.3の1回yieldが不十分だったという判断は妥当。**

Node公式では、callback内で登録された`setImmediate()`は次のevent-loop iterationまで実行されない。libuvのcheck callbackはpoll直後であるため、2段のimmediateは「少なくとも1回のpollを跨ぐ」手段として理にかなっている。

ただし「すべての確定点前OS signalを拾う」という強い保証にはR5-002の限界がある。

### OutputBufferの単一巨大chunk

**元バグへの修正は妥当。**

従来のwhole-chunk dropでは、唯一のchunkがcapを超えると全部消える。現在は超過byte数だけ先頭から削るため、最後の`maxBytes`相当が残る。

ASCIIについての回帰テストも適切。残るのはR5-004のUTF-8境界だけ。

---

# v0.1.3 → v0.1.4 のタグ運用

**v0.1.3を削除・付け替えず、v0.1.4を新しく付けた判断は妥当です。**

一度pushしたversion tagを別commitへ付け替えると、「同じversion名なのに取得時期によって中身が違う」状態になり、監査性を損ないます。今回のプロジェクトは品質ハーネスなので、失敗したv0.1.3も履歴として残し、v0.1.4で修正した事実を追跡できる方が目的にも合います。packetにもv0.1.3が既知の不具合を含み、v0.1.4を使うべきことが明記されている。

追加するなら、公開利用者がタグ一覧だけを見ても分かるよう、CHANGELOGまたはGitHub Release noteで **v0.1.3 = superseded / known-bad, use v0.1.4** と明示する程度でよく、tagの削除・force moveは勧めない。

---

# 指摘なしと判断した観点

- R4-002の`timedOut`保持
- R4-002の`outputTruncated`保持
- 中断済みstdout/stderr tail保持
- R4-003のSKIP判定位置
- 未実行checkでcommandを表示しない変更
- v0.1.3の1回`setImmediate`不足を自己検出した判断
- 2回`setImmediate`が少なくとも次iteration/pollを跨ぐという考え方
- OutputBufferでwhole chunkを落とさずexcessのみ除去する修正
- 単一chunk・複数chunkのASCII回帰テスト
- v0.1.3をimmutable historyとして残しv0.1.4を追加するtag方針
- R1〜R3の回帰テストを維持した上で、139件を10回連続PASSさせたというpacket内の検証記録

---

# 見ていない範囲

今回のZIPにはrepository全体ではなく`review-packet-m0-r4.md`が含まれており、packetに全文掲載された変更コードを中心にレビューした。

独立実行していないもの:

- GitHub上の`37a5b50`とpacket内容のbyte-level一致
- 139件×10回の実Vitestログそのもの
- `npm run verify` / `verify:dist`
- 実tarball
- `npm audit`
- pushされたv0.1.3 / v0.1.4 tagそのもの
- Linux / Windowsでのsignal順序
- safety valveのEPERM/SIGKILL不能ケース
- maskerとpre-push guard一致（R-012 / M1）
- R4で変更されていないrepository全体

独立確認したもの:

- Node/libuv公式資料による`setImmediate` / poll / check / signal deliveryの関係
- listenerを0件にした状態でSIGINTを送るとdefault actionでexit 130になること
- byte cap境界でUTF-8を途中切断した場合、保持4 bytesが`"�あ"`へdecodeされ、再encode時6 bytesになること

---

# 結論

**M0完了前にR5-001は修正を推奨します。** 修正はhandler追加→旧handler削除の順へ変えるだけなので小さい一方、plan Bの「確定後signalは結果を変えない」という核心に直接関わります。

R5-002は実装バグというより「保証の定義」の問題です。現行2-immediate方式はpending signalを拾う実装として合理的ですが、OS到着時刻まで含めた完全保証とは表現しない方が正確です。

R5-003も、確定点とreport write errorの関係を整理してからM0を閉じる方が設計としてきれいです。R5-004はblockerではありません。