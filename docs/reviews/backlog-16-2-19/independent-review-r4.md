> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-backlog-16-2-19-r4-for-claude.md`（2026-10-10 受領、13,608 バイト、LF 336・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `10644b94c3f95526dc6c4e9b2cd932d3c89153a08d53786472b0284a49b4d099`。Security Scan に一致する例示行・変更した原文の行番号: なし。

---

# independent review — backlog 16 / 2 / 19 R4

対象: `v0.5.35..v0.5.36`

レビュー方法: 添付パケットの `# Request` に従い、問い1・2に絞って `src/runner/execute.ts` の全文、差分、`response-r3.md` の M4 の棚卸し、追加テスト、ADR-0023 と関連文書を静的に読んで判断した。依頼どおり、コード・fixture・テストは実行していない。

## 指摘

**新しい指摘なし。**

- High: 0
- Medium: 0
- Low: 0

Request で既知の限界として除外された項目は再指摘していない。

## 全体の結論

**High・Medium は 0 です。**

今回の軽いレビューで確認した範囲では、v0.5.36 の変更により、

- 負の pgid が ESRCH を返した後、その pgid へ再び signal 0 / SIGTERM / SIGKILL を送る経路
- 正の leader pid が ESRCH を返した後、その pid へ再び直接 signal を送る経路

はいずれも `src/runner/execute.ts` では見つからなかった。

また、`leaderGone` は direct child signal が ESRCH を返したときにだけ立つため、ESRCH のない通常経路では既存の動作を変えない。POSIX の group EPERM fallback、Windows の direct child pathとも、`leaderGone === false` の通常状態では従来の guard と signal routing がそのまま働く。

Request に定められた扱いに従えば、**High・Medium が 0 なので、このレビューで終了してよい**と判断する。

---

## 問い1への答え

### 結論

**パケットから確認できる `src/runner/execute.ts` の全経路については、「ESRCH を見た番号（負の pgid・正の pid）へ、以後何かが届く経路」は 0 と判断する。**

`response-r3.md` M4 の `execute.ts` に関する一覧にも、実コードとの不一致や漏れは見つからなかった。

### 根拠

#### 1. 負の pgid — `groupAlive()`

`groupAlive(group)` は最初に `group.gone` を確認する。

- `group.gone === true` → 即 `false`
- POSIX で `process.kill(-pgid, 0)` が ESRCH → `group.gone = true` → `false`

一度 `gone` が立った後は、この関数自身から同じ負の pgid へ signal 0 を再送しない。

`groupAlive()` の呼び出し元として確認できるのは、

- `executeCommand()` の `poll()`
- `terminateActiveChildren()` の `anyAlive()`

で、どちらから呼ばれても同じ共有 `GroupState` を見る。

#### 2. 負の pgid — `killTree()`

POSIX + pgid の `killTree()` は group branch の先頭で

`if (group.gone) return null`

となっている。

そのため、一度 `groupAlive()` または以前の group signal が ESRCH を返して `gone` を立てた後は、

- SIGTERM
- SIGKILL

のどちらでも `process.kill(-pgid, signal)` へ到達しない。

group signal 自身が ESRCH を返した場合も、その場で

- `group.gone = true`
- `return null`

なので、同じ呼び出しの direct child fallback にも進まない。

#### 3. SIGKILL timer

`executeCommand()` の SIGKILL timer には、`send("SIGKILL")` の前にも

`if (group.gone) return`

がある。

これは `killTree()` 内の `group.gone` guard と重複した安全弁である。

仮にこの timer 側の guard が無くても `killTree()` が止めるが、現在は両方に guard がある。

#### 4. 正の leader pid — `leaderGone`

direct child signal は `killTree()` の1か所だけで、

`process.kill(child.pid, signal)`

を行う前に、

- `group.leaderGone`
- `child.pid === undefined`
- `child.exitCode !== null`
- `child.signalCode !== null`

を確認している。

direct child signal が ESRCH を返した場合、

`group.leaderGone = true`

を立て、その後戻す処理はない。

したがって、次の `killTree()` では `group.leaderGone` の guard で止まり、同じ正の pid へ直接 signal は再送されない。

#### 5. POSIX で group ESRCH を先に見た場合

group signal が ESRCH なら `group.gone = true` にして即 return する。

後続の `killTree()` も `group.gone` で即 return するため、R2 で問題だった

「消えた group の leader の正 pid へ direct fallback」

にも戻らない。

#### 6. group EPERM → direct pid ESRCH

group signal が EPERM 等なら、これは ESRCH ではないので group は「消えた」とは記録しない。

その同じ call では direct child fallback が許される。

その direct signal が ESRCH なら、

- `leaderGone = true`
- group 側で得ていた errno (`failure`) を返す

となる。

次の escalation / `terminateActiveChildren()` では group signal 自体は再試行できるが、同じ正 pid への direct fallback は `leaderGone` により止まる。

これは「ESRCH を見た**正 pid**へ再送しない」という問いの不変条件と一致する。

#### 7. `send()` / abort

`send()` は単に共有 `child` / `group` を `killTree()` に渡す。

abort の `onAbort()` は `escalate()` を呼び、`escalate()` も同じ `send()` を使う。

したがって abort 専用の別 signal path は無く、`gone` / `leaderGone` の guard を迂回しない。

#### 8. `terminateActiveChildren()`

`activeChildren` には `ChildProcess` と同じ `GroupState` object が保存されている。

そのため `executeCommand()` 側で立てた

- `gone`
- `leaderGone`

を `terminateActiveChildren()` 側も同じ値として見る。

最初の SIGTERM、grace 中の probe、猶予後の SIGKILL のすべてが `groupAlive()` / `killTree()` 経由なので、ESRCH 後の latch を迂回する独自送信はない。

今回 `anyAlive()` が `some()` から「全 target を probe してから判定」に変わったため、後ろの target についても grace 中に ESRCH を観測し、その `gone` を SIGKILL 前に立てられる。

### M4 の grep / 一覧について

パケットに全文がある `src/runner/execute.ts` では、実際の signal / probe 呼び出しは M4 のとおり次の3つ。

1. `process.kill(-group.pgid, 0)`
2. `process.kill(-group.pgid, signal)`
3. `process.kill(child.pid, signal)`

`execute.ts` 内に `child.kill()` その他の別送信経路はない。

M4 の grep 出力では `src` / `scripts` の `.kill(` と `process.kill(`、`killSignal` / timeout、spawn/exec 系も別に列挙している。変更していないファイルについて、grep で表示された範囲では M4 の分類に明らかな誤りは見つからなかった。

ただし grep は alias・computed access 等まで意味論的に証明するものではなく、今回のパケットには未変更ファイルの全文が無いため、「repository 全体で grep が絶対にすべての signal path を捕捉する」ことまでは独立確認していない。これは未確認範囲に分ける。

---

## 問い2への答え

### 結論

**`leaderGone` は、ESRCH の差し替えが無い通常の動作を変えないと判断する。**

追加された guard が効くのは、「direct child signal が一度 ESRCH を返した後」だけである。

通常の成功・EPERM・exit/signalCode guard の動作はそのまま残る。

### (a) POSIX・group EPERM の direct fallback

通常の group path は、

1. `group.gone` なら return
2. group signal を試す
3. 成功なら return
4. ESRCH なら `gone=true` + return
5. EPERM 等なら `failure` を保存し direct child fallback

である。

`leaderGone` は direct fallback の直前の既存 guard に1条件追加されただけ。

通常の最初の EPERM fallback では `leaderGone === false` なので、

- `child.pid` がある
- `exitCode === null`
- `signalCode === null`

なら従来どおり `process.kill(child.pid, signal)` を試す。

つまり `leaderGone` は EPERM fallback を一般に禁止していない。

direct send が成功すれば `leaderGone` は false のままなので、その後 SIGKILL escalation が必要なら従来どおり再び direct fallback 可能。

direct send が ESRCH の場合だけ true にする。これは「その pid はその時点で存在しない」と観測した場合であり、以後同じ数値 pid の再利用先へ送らないための意図した変更である。

### `exitCode` / `signalCode` guard

既存の、

- `child.exitCode !== null`
- `child.signalCode !== null`

の guard は削除・緩和されていない。

`leaderGone` はこれらに OR 条件として追加されただけで、既存 guard が効く範囲を狭めていない。

### (b) group path の無い Windows

Windows では `killTree()` の group branch

`process.platform !== "win32" && group.pgid !== undefined`

に入らない。

したがって direct child pathへ進む。

初期値は `leaderGone = false` なので、ESRCH が起きていない通常の Windows 動作では新条件は無効。

そのため、

- 通常終了: `close` / exit state の従来経路
- SIGTERM で停止: 最初の direct SIGTERM が従来どおり送られる
- SIGKILL まで進む形: child がまだ生存状態で、最初の direct signal が ESRCH でなければ、後の direct SIGKILL も従来どおり可能

である。

Windows で direct signal が ESRCH を返した場合だけ `leaderGone` が true になり、後の signal を止める。これは「存在しないと観測した正 pid を再利用先へ送らない」という意図した安全変更であり、通常の成功経路への副作用とは判断しない。

Request が既知の文書上の細部として挙げた「Windows・pgidなし」という表現の正確さについては、指示どおり再指摘していない。

### (c) `leaderGone` が誤って立つ経路

コード上、`leaderGone = true` の代入は1か所だけである。

direct child の

`process.kill(child.pid, signal)`

が throw し、その errno が **ちょうど ESRCH** の場合だけ。

次の場合には立たない。

- group signal の ESRCH → `gone` だけ
- group signal の EPERM 等
- direct child signal の EPERM 等
- direct child signal 成功
- `exitCode` / `signalCode` guard で signal を送らなかった場合
- `groupAlive()` の ESRCH → `gone` だけ

したがって、コード上 `leaderGone` が別の失敗理由や probe 結果から誤って立つ経路は見つからなかった。

ESRCH 自体が実 OS 上で「pid は実際には生存しているのに返る」かどうかは今回実行確認していないが、少なくとも Node/POSIX の通常の errno 意味に基づくこの設計を覆す根拠はパケット中にない。本物の PID 再利用や EPERM 未再現は Request 自身が既知の限界として明記している。

---

## High / Medium の追加確認

2つの問い以外についても、パケットを読む過程で **High / Medium に当たる新しい問題は見つからなかった**。

特に、

- fail closed の verdict / status / exit code
- `finish()` / settlement
- `terminationUnconfirmed`
- confirmation の deadline

を変える `src` 差分は今回ない。

B16-R3-001 の errno 保存修正も、診断文字列に使う `killError` を正しく残す変更であり、PASS/FAIL 判定を変えない。

`terminateActiveChildren()` の `some()` → 全 target probe も、全 target の `gone` latch を更新する方向で、今回の2つの安全不変条件を弱める変更ではない。

---

## 未確認範囲

1. **コード・fixture・テストは実行していない。**
2. 本物の PID / PGID 再利用は再現していない。
3. 本物の EPERM は再現していない。
4. Linux / Windows 実機では動かしていない。
5. `response-r3.md` M4 の grep 出力は読んだが、今回パケットに全文が無い未変更ファイル
   - `src/review/packet.ts`
   - `src/git/info.ts`
   - `src/cli.ts`
   - `src/cli-signals.ts`
   - `scripts/test-minimal-path.ts`
   - その他 grep に出た未変更ファイル
   の実装全文を独立に再読してはいない。
6. したがって M4 の repository-wide inventory については、**grep 出力から読める範囲では矛盾なし**までの確認であり、alias / computed access 等を含めた意味論的な全経路証明ではない。
7. 新テストの実際の PASS / FAIL、wall-clock の安定性、cleanup の実挙動は実行確認していない。
8. Request が「既知の限界」として除外した
   - 最初の SIGTERM 前の確認なし
   - 最後の probe→signal の短い窓
   - safety valve
   - Windows の polling 起点
   - 別 process group へ移った子孫
   - backlog 5
   - backlog 19(c)
   - 既知の文書表現「Windows・pgidなし」
   は再指摘していない。

---

## 最終判定

**指摘なし（High 0 / Medium 0 / Low 0）。**

- **問い1**: はい。`execute.ts` の全文で確認できる範囲では、負の pgid は `gone`、正の leader pid は `leaderGone` によって、一度 ESRCH を観測した同じ対象番号への後続 probe / signal は止まっている。`send`・SIGKILL timer・`terminateActiveChildren`・abort に別の迂回経路は見つからない。
- **問い2**: はい。`leaderGone` は direct PID signal の ESRCH でしか立たず、ESRCH の無い通常の POSIX EPERM fallback、既存の exitCode/signalCode guard、Windows direct path の成功経路は変更しない。

Request の結果の扱いに従い、**High・Medium が 0 なので、この R4 でレビューを終了してよい**と判断する。
