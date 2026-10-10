> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-backlog-16-2-19-r3-for-claude.md`（2026-10-10 受領、15,926 バイト、LF 326・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `353515d4964053710f238787b2bc3928204cccdc7a4ffaf92df2486e72b58ecc`。Security Scan に一致する例示行・変更した原文の行番号: なし。

---

# independent review — backlog 16 / 2 / 19 R3

対象: `v0.5.34..v0.5.35`

レビュー方法: 添付パケットの `# Request`、Diff、変更後全文、新規回帰テスト、ADR-0023、ARCHITECTURE、README、CHANGELOG、ROADMAP、R2 原文と `response-r2.md` を静的に読んで判断した。依頼どおり、コード・fixture・テストは実行していない。

## R2 指摘の再判定

- **B16-R2-001 (High): 解消**
  - POSIX で `pgid` がある経路は、`group.gone` なら `killTree()` が即 return し、正の `child.pid` へ落ちない。
  - group signal 成功 → return、ESRCH → `gone=true` して return、ESRCH 以外の失敗だけ direct child fallback、という4分岐がコード上明確になった。
  - 新テストは負の PGID と正の PID の両方を監視し、CLI と同じ順・逆順の双方で ESRCH 後の送信が 0 であることを検査する構造になっている。
- **B16-R2-002 (Medium): 解消**
  - 実装は `anchor = sigkillSentAt ?? goneAt` のまま。
  - ADR-0023、CHANGELOG、ARCHITECTURE の現在の説明は、「SIGKILL より前に消えた場合は `goneAt`、SIGKILL が先なら SIGKILL 時刻」を明示しており、コードと一致する。
  - 新テストは「SIGKILL が先」の場合を明示的に固定している。

## 指摘

### B16-R3-001

- **ID**: B16-R3-001
- **重要度**: Low
- **種別**: バグ
- **対象**:
  - `src/runner/execute.ts:330-358` (`killTree`)
  - ADR-0023 決定 4・6
  - 今回の `src/runner/execute.ts` 差分そのものでは変更していない既存部分
- **内容**:

  グループへの送信が **ESRCH 以外で失敗**して `failure` に `EPERM` 等を保持したあと、direct child fallback が **ESRCH** になった場合、`killTree()` は保存していた group failure を捨てて `null` を返します。

  その結果、グループ自体は EPERM 等で signal できず残っているのに、`killError` が記録されず、confirmation timeout 時の `errorSummary` が

  `process group could not be signalled (EPERM) ...`

  ではなく、より一般的な

  `process group still present ...`

  になり得ます。

  fail closed、status、verdict、exit code を変える問題ではありません。診断理由の精度だけの問題です。また本物の EPERM 自体を再現できておらず、その直後に child PID が ESRCH になる組合せはさらに限定的なので、重要度は Low とします。

- **根拠**:

  **確認済みの事実**:

  1. `killTree()` は group signal が EPERM 等なら `failure = errnoName(code)` にして direct child fallback へ進む (`execute.ts:339-347`)。
  2. direct child の `process.kill(child.pid, signal)` が ESRCH を投げると、`:357` は `null` を返す。
  3. その return は、すでに保持している `failure` を返さない。
  4. caller の `send()` は `killTree()` の non-null return だけを `killError` に保存するため、この場合 `killError` は設定されない。
  5. ADR-0023 決定6は「どちらにも送れなければ errno を覚え、打ち切りで `killError` に入れる」としている。group EPERM + child ESRCH は、group へは送れず、child はもう存在せず direct fallback も送れていないので、この説明と現在コードは一致しない。
  6. group EPERM は `group.gone` を立てず、`groupAlive()` でも EPERM は「alive」と扱うので、その後 confirmation timeout まで group が present 扱いになる経路はある。

  **推測**:

  - 実環境で「group signal が EPERM、その直後の direct child signal が ESRCH」という順がどの程度起きるかは未確認。
  - 本物の EPERM 自体が今回の既知の未再現事項なので、到達頻度はかなり低いと考える。
  - 起きた場合も fail closed は維持され、主な影響は `errorSummary` が「signal できなかった」理由を落とすこと。

- **修正案**:

  direct child fallback が ESRCH のとき、

  - group 側に `failure !== null` があるなら、その `failure` を返す
  - group failure が無い group-less 経路なら従来どおり ESRCH を `null` とする

  という形にするのが自然です。

  例えば意味としては、

  `child ESRCH -> return failure`

  とすれば、POSIX の group EPERM + child ESRCH では EPERM を保存し、Windows / pgidなしで child ESRCH の場合は `failure` が null なので現在と同じになります。

  回帰テストは、group SIGTERM/SIGKILL を EPERM、positive child PID を ESRCH にし、`terminationUnconfirmed.killError === "EPERM"` または最終 `errorSummary` が「could not be signalled (EPERM)」になることを固定するとよいです。

- **確度**: **確認済み**（errno を失うコード経路） / 実環境での EPERM→child ESRCH の到達頻度は未確認

---

## 全体の結論

**High 以上の新しい指摘はありません。**

- High: 0
- Medium: 0
- Low: 1 — B16-R3-001

R2 の High / Medium は、今回の変更でどちらも解消と判断します。

B16-R3-001 は今回の +6/-2 の修正で新しく生じた回帰ではなく、`killTree()` の既存の backlog 2 経路に残っていた診断精度の問題です。終了確認の安全性や fail closed を弱めるものではありません。

## 観点別の判断

### 観点0 — R2 の B16-R2-001 / B16-R2-002

**問題なし。両方とも解消。**

B16-R2-001:
- `group.gone` → 即 return
- group send success → return
- ESRCH → latch + return
- EPERM 等 → direct child fallback

となり、R2 が求めた分岐そのものです。

B16-R2-002:
- コードは `sigkillSentAt ?? goneAt`
- 現在の文書もその順序を説明
- SIGKILL-first の新テストもその挙動を固定

しており、コードと文書の不一致は解消しています。

B16-R3-001 は別の既存 EPERM diagnostic edge です。

### 観点1 — シグナルを送る・調べる経路の網羅

**今回パケットで独立確認できる `src/runner/execute.ts` の範囲では、R2 の棚卸しに漏れを確認しませんでした。**

`execute.ts` で確認できる `process.kill` は:

1. `groupAlive()` の `process.kill(-pgid, 0)`
2. `killTree()` の `process.kill(-pgid, signal)`
3. `killTree()` の `process.kill(child.pid, signal)`

です。

これらについては、ESRCH で `group.gone` が立った後、

- 1 は `if (group.gone) return false`
- 2/3 は POSIX group path の冒頭 `if (group.gone) return null`

により止まります。

SIGKILL timer にも `if (group.gone) return` があり、同じ `GroupState` を `executeCommand` と `terminateActiveChildren` が共有しています。

したがって、**今回パケットで読める runner の全 signal path について「ESRCH 後に同じ負 PGID / 正 PID へ届く」別経路は見つかりませんでした。**

一方、`response-r2.md` の一覧のうち以下は変更していないファイルで、今回パケットに全文がありません。

- `review/packet.ts` の `spawnSync(... timeout, killSignal)`
- `git/info.ts` の `execFileSync(... timeout)`
- `cli.ts` / `cli-signals.ts`
- `scripts/test-minimal-path.ts`

したがって、「`src/` 全体で本当にそれ以外が0」という grep 結果まではこのパケットだけから独立再確認できません。`execute.ts` については全文から確認済み、その他は未確認範囲とします。

既知の限界として Request が除外した、
- 最初の signal 前
- 最後の probe と kill の短い窓
- `terminateActiveChildren` の `some` short-circuit
は再指摘していません。

### 観点2 — `killTree` の4分岐

**問題なし。**

POSIX + pgid:
1. `group.gone` → return
2. group signal success → return
3. ESRCH → `gone=true` + return
4. other error → direct child fallback

です。

direct fallback の guard:
- `pid !== undefined`
- `exitCode === null`
- `signalCode === null`

も維持されています。

Windows / pgidなしは group branch に入らず、従来どおり direct child path に進みます。

EPERM control の新テストは、SIGTERM / SIGKILL の両方で positive PID への fallback が残ることを検査しています。

ただし、fallback の group errno と child ESRCH の組合せで errno を失う点だけ B16-R3-001 としました。

### 観点3 — B16-R2-002 の文書訂正

**問題なし。**

現在コード:
`const anchor = sigkillSentAt ?? goneAt`

現在文書:
- SIGKILL より前に group gone → `goneAt`
- SIGKILL を送った後 → `sigkillSentAt`

で一致しています。

ADR-0023 の決定2、v0.5.35 範囲節、影響節、CHANGELOG v0.5.35 はこの二分を明示しています。

v0.5.34 の過去記録自体を書き換えず、v0.5.35 で訂正を記録する方針も、履歴として妥当です。

### 観点4 — 新テスト

**問題なしと判断。**

`regression-backlog16-r2-direct-signal.test.ts`:
- `watchKill()` は **負の `-pgid` と正の `pgid` の双方**を監視する。
- ESRCH 後の call は `afterGone` で group / pid の両方を検出する。
- CLI と同じ abort→terminate 順と逆順の双方がある。
- EPERM fallback control がある。
- group send success / SIGKILL / normal exit の controls がある。
- child は marker file の消滅で自発終了でき、`stopper` と temp cleanup もある。

`regression-backlog16-r2-confirm-origin.test.ts`:
- SIGKILL 時刻を記録
- その後 1000ms だけ signal0 を fake alive
- `confirmMs=1200`
- SIGKILL 起点なら約1200ms、gone 起点なら約2200msになるよう差を大きくしている
- upper bound 1700ms なので、起点を `goneAt ?? sigkillSentAt` に変えた mutant は理屈上 FAIL する

という構造で、目的に合っています。

wall-clock test なので極端な高負荷で false failure の可能性はありますが、500ms の余裕を持ち、既知のテスト細部として ROADMAP にも整理されているため、新規指摘にはしません。

### 観点5 — fail closed

**問題なし。**

今回の `src` 差分は `killTree` の signal routing だけで、status / verdict / exit-code の決定には触れていません。

現 `execute.ts` でも、
- timeout
- interruption
- terminationUnconfirmed

の扱いに、PASS や exit 0 を新しく作る変更はありません。

`terminationUnconfirmed` は引き続き cleanup diagnostic であり、PASS 条件へ参照される変更はありません。

### 観点6 — 文書の誠実さ / R2-001 の到達可能性

**問題なしと判断。**

文書は、
- macOS の手元実測
- Linux 未確認
- 実際の再利用は未再現
- 360 child / 約77万 probe で対象状態0回
- 「実害は起きにくい」は推定

を分けて書いています。

「実際の Node では絶対に到達しない」とは断言していません。

また、その実測が **git 管理外の手元の実験で、リポジトリには再現手順がない**ことも `response-r2.md` と ADR の範囲説明で明記されています。

実装者の実測を品質の根拠には使いませんが、文書の書き方自体は、事実・推定・未確認範囲を区別しています。

### 観点7 — `package-lock.json`

Request に貼られた raw `git diff` を読む限り、変更はちょうど以下です。

- lock root `version`: `0.1.0` → `0.5.35` が2行
- `node_modules/source-map-js`
  - version `1.2.1` → `1.2.2`
  - resolved URL
  - integrity

`git diff --stat` も 5 insertions / 5 deletions で、この5行と一致します。

`package.json` の範囲差分は dependency 変更ではなく、release version `0.5.34` → `0.5.35` の1行だけです。つまり「deps commit で package.json は変えていない」という説明と矛盾しません。

`resolved` は `https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz` で package/version と整合しています。

`integrity` の値も、公開されている `source-map-js@1.2.2` の lockfile 記録と一致する値であることを補助確認しました。

ただし、今回コードを実行しない条件なので、tarball を取得して自分で SHA-512 を再計算したわけではありません。

パケットの Integrity 節は最終 `package-lock.json` が 84,022 bytes / SHA-256 `96f606...36593` であることを記録していますが、lock 全文自体は packet policy により未掲載です。そのため、Request に貼られた raw diff 以外の「他の行が絶対に変わっていない」ことを、lock 全文から再比較することはしていません。

### 観点8 — レビュー記録

**問題なし。**

今回の会話で前回生成した R2 原文の SHA-256 は
`0088dc82668fcd77111111292defae8c0840d09d689d3f265b5c6042ac842b1e`
で、`response-r2.md` に書かれた値と一致しています。

パケット内 `independent-review-r2.md` は、その原文の前に実装者の「収録の注記」と区切りを追加しただけで、注記より後ろのレビュー本文に差分は確認しませんでした。

`response-r2.md` は、
- independent review の High 1 / Medium 1
- B16-R1-001 部分解消 / B16-R1-002 解消
- B16-R2-001 / 002 の主張

を正しく別枠で記録しています。

また実装者自身のレビューは、明示的に
**「自レビュー（独立ではない）」**
という別節・別 ID（S-1〜S-6）で管理され、独立レビュー結果と混同していません。

## package-lock 補足

公開情報でも `source-map-js` の現行 1.2.2 と、Request に記載された integrity と同じ値を確認できるため、`resolved` / `integrity` に不自然な点はありません。

ただし、この確認は registry tarball の自前ハッシュ再計算ではありません。

## 未確認範囲

1. **コード・fixture・テストは一切実行していません。**
2. 本物の EPERM は再現していません。
3. 実 OS 上の PGID / PID 再利用は再現していません。
4. Linux / Windows 実機では実行していません。
5. `response-r2.md` の signal-path inventory のうち、今回パケットに全文がない未変更ファイル (`review/packet.ts`, `git/info.ts`, `cli.ts`, `cli-signals.ts`, `scripts/test-minimal-path.ts`) は独立に再 grep できていません。
6. package-lock の全文は packet policy により未掲載なので、Request に貼られた raw diff と Integrity record 以外から全行比較はしていません。
7. `source-map-js@1.2.2` の tarball を取得して SHA-512 を再計算していません。
8. SIGKILL 起点の時間テストを高負荷下で実行して flake rate を測っていません。
9. Request が既知の限界として除外した項目 28〜33、別 group 子孫、backlog 5、backlog 19(c) 自体は再指摘していません。

## 見たが問題なしと判断した観点の一覧

- **観点0** — B16-R2-001 / B16-R2-002 は解消
- **観点1** — 今回全文を読める `execute.ts` の signal / probe path。未変更ファイル部分は未確認範囲
- **観点2** — `killTree` の4分岐、EPERM direct fallback、Windows/group-less path（B16-R3-001 の errno edge を除く）
- **観点3** — wait origin のコード・ADR・ARCHITECTURE・CHANGELOG の整合
- **観点4** — 新7テストの構造・正PID監視・controls・cleanup
- **観点5** — fail closed、status/verdict/exit code
- **観点6** — 到達可能性の事実/推定/未確認の書き分け
- **観点7** — lock diff の内容と package.json の依存不変更
- **観点8** — R2 原文と response、自レビューの分離
