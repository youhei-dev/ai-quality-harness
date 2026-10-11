> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-backlog-28-5-r2-for-claude.md`（2026-10-11 受領、11,431 バイト、LF 330・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `7c8de493ab8ed39d4c759ea1b47594b2bc368ace87cac75d23ca8a6d70d89986`。Security Scan に一致する例示行・変更した原文の行番号: なし。

---

# independent review — backlog 28 / 5 / 34 R2

対象: `v0.5.38..v0.5.39`。R1 の B28-R1-001（Medium）への対応だけを確認する軽いレビュー。

レビュー方法: 添付パケットの `# Request`、変更ファイルの Diff と変更後全文、`src/runner/execute.ts` の差分、`tests/regression-backlog28-probe-after-exit.test.ts` のコメント差分、ADR-0023、ARCHITECTURE、README、ROADMAP、CHANGELOG、過去レビュー response の訂正注記を静的に読んで判断した。依頼どおり、コード・テストは実行していない。

## 指摘

**指摘なし。**

- High: 0
- Medium: 0
- Low: 0

## 全体の結論

**High・Medium はありません。**

R1 の **B28-R1-001 は解消**と判断する。

現在仕様として読む文書・コメントは、

- 25 ms / 50 ms は `setTimeout` の設定値・目安
- callback がその時間までに実行される保証ではない
- 実際の番号再利用の窓は、グループの消滅（または最後の確認）から、次の確認・送信が**実際に走るまで**
- event-loop / scheduler の遅れだけ長くなり得る
- backlog 28 は窓を大きく縮めたが、上限は保証しない

という形に揃っている。

一方で実装が実際に行う、

- leader の `exit` 後、`close` / escalation / 最初の ESRCH まで、設定値 25 ms のタイマーで signal 0 の probe を繰り返す
- 一度 ESRCH を見て `gone` を立てたら、その番号へ以後 probe / signal を送らない

という事実も、ADR-0023・ARCHITECTURE・README・コードコメント・テストコメントから読み取れる。訂正によって仕様を弱く書きすぎたとは判断しない。

`src/` の変更は `src/runner/execute.ts` のコメントだけで、実行文・定数・条件・関数呼び出し等の動作変更はない。

Request の結果の扱いに従い、**この R2 でレビューを終了してよい**と判断する。

---

## 問い1 — 直した記述は、コードが保証する範囲を超えていないか

### 結論: **問題なし**

現在仕様の記述には、25 ms / 50 ms を hard upper bound とする主張は確認しなかった。

### `src/runner/execute.ts`

`CONFIRM_POLL_MS = 25` のコメントは、

> Interval of the group probes: a timer setting, not an upper bound

と明示する。

`watchAfterExit()` のコメントも、

> the time from the disappearance until the next probe actually runs

とし、

> `CONFIRM_POLL_MS` is a timer setting, not an upper bound, and event-loop or scheduling delays add to it

と書かれている。

R1 の指摘と一致する。

### `docs/ARCHITECTURE.md`

旧:

> 消滅から 25 ms 以内の再利用は残る

から、

> グループの消滅から次の確認が実際に走るまでの再利用は残る

へ変更され、

> 25 ms（`terminateActiveChildren` は 50 ms）はタイマーの設定値で上限ではなく、event-loop / scheduler の遅れだけ長くなりうる

と明記した。

「最後の確認から送信まで」の窓も同じ、としており、25 / 50 ms の両方を訂正している。

### ADR-0023

現在仕様側には明確に、

> 25 ms / 50 ms は `setTimeout` の設定値（目安）で、コールバックがその時間で走る保証ではない

> 番号の再利用の窓は、グループの消滅（または最後の確認）から、次の確認・送信が実際に走るまで

> 上限は保証しない

とある。

過去の v0.5.34 / v0.5.35 / v0.5.38 の記録本文には旧表現を残した箇所があるが、それぞれ直後または対応節に **v0.5.39 の訂正注記**を追加している。履歴記録を改変せず訂正を残す方法として問題ない。

### ROADMAP

過去の v0.5.38 記録の旧文言は保持しつつ、

> 25 ms は確認のタイマーの設定値で上限ではない

> 窓は消滅から次の確認が実際に走るまで

という v0.5.39 注記が付いている。

項目28にも同じ訂正が入っている。

### 過去レビュー response-r1〜r3

過去の原文を書き換えず、各 response に、

> 25 ms / 50 ms はタイマーの設定値で、窓の上限ではない

> 実際の窓は次の確認・送信が実際に走るまで

という訂正注記を追加している。

### CHANGELOG

v0.5.38 の過去記録は書き換えていないため、旧「消滅の後の 25 ms に縮めた」という表現自体は残る。

ただし直前の新しい v0.5.39 項で、

> v0.5.38 の項は 25 ms を上限のように書いていた

> 25 ms / 50 ms は `setTimeout` の設定値で上限ではない

> 実際の窓は次の確認・送信が実際に走るまで

と明示的に訂正している。

履歴として過去の release note を保存し、後続版で訂正する形なので、現在仕様の保証を25 ms上限と誤認させる未訂正箇所とは扱わない。

### テストコメント

`tests/regression-backlog28-probe-after-exit.test.ts` も、

> A reuse before the next probe actually runs is not closed

> 25 ms is a timer setting, not an upper bound

> event-loop delays add to it

と変更されている。

さらに test は reuse を disappearance の 300 ms 後に始めるため、

> next probe が300 ms以内に走ることを前提にし、それ以上の stall は covered しない

と限界まで書いている。

したがって、テストコメントも実装以上の保証を主張していない。

---

## 問い2 — 直しすぎて、実装の動作を弱く書きすぎていないか

### 結論: **問題なし**

訂正は「25 msという時間が上限ではない」ことに限定され、実装が実際に行う probe の動作は引き続き具体的に記述されている。

### leader `exit` 後の probe

ADR-0023 は、

> leader が `exit` した後、`close` が未着のあいだは、25 ms ごと（タイマーの設定値）に signal 0 でグループを確かめる

と明記。

ARCHITECTURE も、

> leader の `exit` から 25 ms ごとに signal 0 で確かめる

と残している。

README も v0.5.38 の動作として、

> leader の終了の後からグループの消滅を確かめる

と説明している。

したがって「25 ms の設定値で定期 probe する」という実装事実は消えていない。

### ESRCH 後

ADR-0023 は、

> 最初の ESRCH・`close`・escalation の開始のどれかで止まる

> 消えたと確認できたら最初の signal の前に `gone` を立て、以後は何も送らない

という従来の invariant を維持している。

ARCHITECTURE にも、

> 一度 ESRCH を見たグループには、以後 signal 0 も SIGKILL も送らない

という記述が残っている。

`src/runner/execute.ts` のコメントも、

> it stops at the first ESRCH (`gone`)

と明記する。

よって訂正によって「単に時々確認する」程度の弱い説明にはなっていない。

### 25 ms / 50 ms の意味

現在の記述は、

- **interval / timer setting として 25 / 50 ms が存在すること**
- **実時間の上限ではないこと**

を両立している。

これはコードの `setTimeout(..., 25)` / `setTimeout(..., 50)` の意味を最も正確に表しており、「直しすぎ」とは判断しない。

---

## 問い3 — 動作の変更が無いこと

### 結論: **確認できた。`src/` の差分はコメントだけ**

この範囲で変更された `src/` ファイルは `src/runner/execute.ts` だけ。

差分は2か所。

### 1. `CONFIRM_POLL_MS`

追加されたのは JSDoc コメント1行だけ。

```text
/** Interval of the group probes: a timer setting, not an upper bound ... */
```

`const CONFIRM_POLL_MS = 25;` 自体は変更していない。

### 2. `watchAfterExit()` 前のコメント

既存コメントの説明を、

- one probe interval
- 25 ms の窓

というニュアンスから、

- disappearance から next probe actually runs まで
- 25 ms は timer setting で upper bound ではない
- event-loop / scheduling delay が加わる

へ書き換えただけ。

`watchAfterExit()` の executable statements は変更していない。

### その他

`tests/regression-backlog28-probe-after-exit.test.ts` も今回変更されたのは file header のコメントだけで、期待値・fixture・timeout・定数・実行コードに差分はない。

したがって、今回の修正に **動作変更はない**という説明と Diff は一致する。

---

## High / Medium の追加確認

3つの問い以外についても、変更差分を読む過程で High / Medium に相当する新しい問題は見つからなかった。

今回 `src` の実行コードは変わっていないため、

- ESRCH 後の signal routing
- fail closed
- watchdog
- exit code
- cleanup

に新しい動作上の回帰を作る差分はない。

R1 が問題なしとした点を再レビューする必要はないという Request に従い、それらの詳細な再監査はしていない。

---

## R1 B28-R1-001 の判定

**解消。**

R1 の指摘は「25 ms を timer 設定値ではなく窓の hard upper bound のように記述していた」という文書上の過大保証。

v0.5.39 では、

- 現在仕様の文章を直接修正
- 過去の版の記録には訂正注記
- CHANGELOG は過去版を改変せず新しい版で明示的に訂正
- `src` / test のコメントも同じ意味へ修正

しており、コードが保証する範囲と一致した。

---

## 未確認範囲

1. **コード・テストは実行していない。**
2. Node timer の実際の遅延量、event-loop stall、OS scheduler delay を実測していない。今回のレビューでは hard upper bound が無いことをコードと一般的な timer semantics から判断した。
3. 本物の pgid 再利用は再現していない。
4. Windows は Request の既知の対象外。
5. R1 で問題なしとされた、
   - ESRCH 後の送信
   - watchdog の `kill(0)`
   - 停止方法
   - exit code
   - test expectation change
   は Request に従って再レビューしていない。
6. CHANGELOG の過去 v0.5.38 本文には旧表現が履歴として残るが、新しい v0.5.39 項が明示的な訂正になっているため、現在仕様の未訂正箇所とは判断していない。

## 最終判定

**High 0 / Medium 0 / Low 0。**

- **問い1**: 問題なし。現在仕様として読む文書・コメントは 25 / 50 ms を上限としておらず、「実際に次の確認・送信が走るまで」と正確に書いている。過去記録の旧文言には訂正注記、または後続 CHANGELOG で明示的な訂正がある。
- **問い2**: 問題なし。25 ms の nominal probe interval、leader `exit` 後の signal 0、最初の ESRCH 後は以後送らないという実装事実は具体的に残っている。
- **問い3**: 問題なし。`src/runner/execute.ts` の変更はコメントだけで、実行コード・定数・条件・呼び出しに変更はない。test の変更もコメントだけ。

**R1 の B28-R1-001 は解消。**

Request の結果の扱いに従い、**High・Medium が 0 なので、この R2 でレビューを終了してよい**と判断する。
