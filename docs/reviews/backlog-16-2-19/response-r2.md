# バックログ 16・2・19 の独立レビュー 2 回目への対応記録（response-r2）— v0.5.35

- 対象レビュー: `docs/reviews/backlog-16-2-19/independent-review-r2.md`（受領ファイル名 `independent-review-backlog-16-2-19-r2-for-claude.md`、2026-10-06 受領、19,718 バイト、SHA-256 `0088dc82668fcd77111111292defae8c0840d09d689d3f265b5c6042ac842b1e`、
  LF 306 / CR 0 / TAB 0 / U+FFFD なし / 禁止文字なし。対象 v0.5.34 = commit e5a350f2060a0439e6c86796f520de2baa01ab43 / tag object 2b520e2e4ac7b7aad466fb1100408d1cdcc61af3、範囲 `v0.5.33..v0.5.34`）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一。Security Scan に一致する行は無い）
- 対応日: 2026-10-06
- 結果（レビュアー）: **High 1（B16-R2-001）/ Medium 1（B16-R2-002）/ Low 0**。R1 の B16-R1-001 は「部分的に解決」（消えたグループへの送信は止めたが、同じ不変条件の別の経路が残った）、B16-R1-002 は解決。
  レビュアーは対象コード・fixture・テストを実行していない（静的な読解のみ）。「v0.5.32 から同じ性質」は、パケットからは検証できないと書いた（下の S-6 と同じ点）
- 再レビューの要否・終える基準は、人間が決める

## 人間の判断（この作業の仕様）

1. B16-R2-001 は、コードの経路としては妥当と見る。直す。グループ経路があるときは、(1) `gone` なら何も送らず返る、(2) グループへの送信が成功したら返る、(3) ESRCH なら `gone` を立てて返る、(4) ESRCH 以外で失敗したときだけ子へ直接送る。グループ経路が無い（Windows・pgid なし）分岐は、これまでどおり直接送る
2. 実際の Node で `gone` と `exitCode === null` が同時に成り立つか（到達できるか）を調べ、事実のとおり書く（誇張も過小評価もしない）。到達しにくくても、「グループが消えたと分かっているなら、何も送らない方が単純で安全」なので直す
3. B16-R2-002 は、実装は変えず、文書（ADR-0023・CHANGELOG）を実装に合わせて直す。現状（SIGKILL が先で、グループが後から消える形）はテストで固定する
4. 信号を送る呼び出しの全経路を棚卸しする（連続する 2 回のレビューが、同じ不変条件の別の経路を見つけたので、漏れを残さない）。この記録にも載せる
5. 自分（実装者）が先に書いたレビュー（独立ではない）は、別の表で同じ基準で判定する。**実装するのは B16-R2-001・B16-R2-002 だけ**。残りは判定・推奨・修正の見積りを書き、承認を待つ
6. v0.5.35・3 commit（修正 → docs → リリース）。v0.5.33・v0.5.34 のタグは触らない
7. 停止ポイントまで。push・タグは、人間の承認の後

## 指摘の判定

行番号は、レビュー対象の v0.5.34（commit e5a350f）のもの。

| ID | レビュアーの主張 | 確認（コード・実測） | 判断 | 直した commit |
|---|---|---|---|---|
| B16-R2-001（High） | `gone` のグループは `killTree` がグループの分岐を飛ばすが、そのまま子の pid への直接送信に落ちる。ガードは `exitCode`・`signalCode` だけで、`gone` を見ない。CLI の中断では、`abort()` が `onAbort` を同期で動かして ESRCH を見た後に `terminateActiveChildren` が同じ状態で入り、正の pid へ送りうる。R1 のテストの差し替えは負の id しか見ないので検知できなかった | **コードの経路として確認できた**。`execute.ts` の `killTree`: 331 行目の `!group.gone` でグループの分岐を飛ばす → 345 行目のガード（pid・`exitCode`・`signalCode`）→ 349 行目の `process.kill(child.pid, signal)`。呼び出し元は `terminateActiveChildren`（59・64）と `send`（160。199 の SIGTERM、205 の SIGKILL。SIGKILL は 204 の `if (group.gone) return` で止まる）。CLI は `cli.ts:41` の `abort()` の後に `cli.ts:42` の `terminateActiveChildren`。**再現**（M1）: 差し替えで正の pid も見て、最初のグループへの送信を ESRCH にすると、v0.5.34 は 2 つの順のどちらも、正の pid へ SIGTERM を 1 回送った。v0.5.33 は 0 回（ESRCH で返っていた）。v0.5.32 も ESRCH で返っていた。**この経路は v0.5.34 の `!group.gone` が新しく開けた**。**実際の Node での到達**（M2）は、観測では 0 回で、構造上も起きにくい | **採用（コードの経路として妥当。実害は起きにくい推定）**。グループ経路があるとき、`gone` なら何も送らずに返す | C1 `2470bce` |
| B16-R2-002（Medium） | v0.5.34 の文書は `close` 未着の待ちを「消滅の最初の確認（`goneAt`）から」と書くが、コードは `anchor = sigkillSentAt ?? goneAt`。SIGKILL が先なら SIGKILL の時刻が起点になる。`GroupState` は真偽値だけを共有する。待ちの起点のテストは「SIGKILL の前にグループが消える」形だけ | **確認できた**。`execute.ts:180` は `const anchor = sigkillSentAt ?? goneAt;`。ADR-0023 の v0.5.34 の範囲節（48 行目「消えたと分かった時点（`goneAt`）から最大 `confirmMs`」）と影響（87 行目「消滅の最初の確認から `confirmMs`」）、CHANGELOG の v0.5.34、依頼文が、SIGKILL が先の形を落としていた。決定 2 の本文は両方の形を書いていて、コードと一致する。テスト（`regression-backlog16-r1-pgid-reuse.test.ts` の 2 件目）は、グループが約 0.4 秒で消え、SIGKILL のタイマーが 1.5 秒の形だけ。**文書が実装より強く書いていた**（実際の上限は、文書より短いか同じ） | **採用（文書を直す。実装は変えない）**。理由: 「SIGKILL が先で、その後にグループが消え、`close` が未着」の形は、別グループの子孫が pipe を握るときに限られ、時刻を共有する変更は大きくて得るものが小さい。テストで現状を固定した | C1 `2470bce`（テスト）・C2（文書） |

- **レビュアーの主張と実測の食い違い**: B16-R2-001 は、コードの経路は主張どおり。「到達しやすいか」はレビューに無い論点で、実測した（M2）。B16-R2-002 は、実測で食い違いは無い
- **レビュアーの提案で、今回は取り入れなかったもの**: B16-R2-002 の「時刻も共有する」案（実装を変える。上の理由）

## 自レビュー（独立ではない）の判定

**これは独立したレビューではない**。この作業の実装者が、同じ会話の中で「独立レビュアー」として先に書いたもの（`claude-self-review-backlog-16-2-19-r2.md`、Medium 1・Low 5）で、実装者の見方に偏る。ID はレビュアーのものと衝突するので、S-1〜S-6 とする。
同じ基準（コード・実測で確認できるか）で判定した。**この版で実装したものは無い**（指示により B16-R2-001・B16-R2-002 だけ）。残りは承認を待つ。

| ID（自レビューの元の ID） | 主張 | 確認 | 判断・推奨・修正の見積り |
|---|---|---|---|
| S-1（B16-R2-001 / Medium） | `terminateActiveChildren` の `anyAlive`（`execute.ts:60`）は `some` で短絡し、先の target が生きている間、後ろの target は猶予の間 1 度も調べられない。猶予の後の SIGKILL（64 行目）は全 target へ送られるので、調べていない（実際には消えた）target の番号へ SIGKILL が届きうる | **再現した**（v0.5.34 と修正後で同じ）。生きた target が先・消える target が後の形（F）で、後ろの target は SIGTERM の後に signal 0 が 0 回、SIGKILL が 1 回（実際には消えた後）。逆順（D）では送られない。**CLI は影響を受けない**（`runChecks` は逐次で、動いている子は 1 つ。各 `executeCommand` が自分の target を 25 ms ごとに調べる）。ライブラリとして並行に動かす場合だけ | **妥当**。重大度は、番号の再利用が要ることと CLI で到達しないことから Low〜Medium。ただし ADR の既知の限界は隙を「最後の確認から送信までの 25 ms」と書いていて、この形は窓が猶予の全期間なので、**文書は要修正**。修正の見積り: コード 1 行（全 target を調べる `targets.map(...).some(Boolean)`）とテスト 1 件。**推奨: 次の修正で採る**（ROADMAP 項目 31） |
| S-2（B16-R2-002 / Low） | README の Ctrl+C の段落（`README.md:215-218`）が、「SIGKILL の後はグループが消えたことを最大 2 秒確かめてから…終了」「確認できなかったときは errorSummary に書く」と書き、安全弁が先に発火しうること（ADR-0023 決定 7）に触れない | **確認できた**。README の文は通常のスケジューリングの下の動きを、保証のように読める。1.5 秒のイベントループの停止では、安全弁が先に動き、レポートは書かれない（実測済み。終了コードは 130 / 143） | **妥当（Low）**。修正の見積り: README に 1〜2 文（「通常は」と、極端な停止では安全弁が先に終了しレポートが無いことがある、終了コードは変わらない）。**推奨: 次の docs 修正で**（ROADMAP 項目 32） |
| S-3（B16-R2-003 / Low） | 「最初のシグナルが ESRCH」のテストが `AbortController` を作るが、`executeCommand` に渡さない（`tests/regression-backlog16-r1-pgid-reuse.test.ts:115-117`） | **確認できた**。`controller` は `stopper` の中でだけ使われ、`signal` に渡されていない（115 行目）。実行が終わらないとき、`stopper` は `controller.abort` を呼んでも何も起きず、待ちの上限を超えてから失敗する（黙って通ることは無い）。子は印のファイルが消えると自分で終わる | **妥当（Low）**。修正の見積り: 1 行（`signal: controller.signal`）。新しいテスト（C1）は、すべて渡している。**推奨: 次にこのファイルを触るとき**（ROADMAP 項目 33） |
| S-4（B16-R2-004 / Low） | 時間の余裕が小さい。待ちの境界のテストは期待 1.9 秒・境界 2.6 秒（余裕 0.7 秒）。「最初のシグナルが ESRCH」のテストは `timeoutMs: 1200` を起動から数え、差し替えは `waitReady` の後に入れる | **確認できた**（91-106、108-124 行目）。負荷で `waitReady` が 1.2 秒を超えると、最初のシグナルが差し替えより先に出て、前提（`observedEsrch`）で失敗する。**誤って PASS にはならない**（偽陰性の方向）。負荷ゲートと、最終 HEAD の 10 回連続 PASS で抑えている | **妥当（Low）**。修正の見積り: テストだけ（余裕を広げる、または差し替えをタイムアウトより前に入れる）。**推奨: 次にこのファイルを触るとき**（ROADMAP 項目 33） |
| S-5（B16-R2-005 / Low） | `response-r1.md` の補足 (1) が、実際の PGID 再利用を「`process.kill` の差し替えで決定的に再現した」と書くが、他の文書は「実際の再利用は再現していない」と書く | **確認できた**。`response-r1.md:30` と 80 行目、ADR-0023 の 43・76 行目。意味は「差し替えで、再利用された番号が応答する状況を作った」で、実際の再利用ではない。読み手が取り違えうる | **妥当（Low）**。修正の見積り: `response-r1.md` の 1 文（実装者の記録で、受領した原文ではないので、直してよい）。**推奨: 次の docs 修正で**（ROADMAP 項目 32 と同じ） |
| S-6（B16-R2-006 / Low） | 「v0.5.32 から同じ性質」などの実測が、git 管理外の `tmp/backlog-16-2-19-r1/` に依存し、リポジトリ・パケットからは検証できない（レビュアーの R2 も、同じ点を書いた） | **確認できた**（CHANGELOG・ROADMAP 469 行目・ADR-0023 の 43 行目）。この版の到達性の実測（M2）も同じ制約を持つ。ただし M2 の主な根拠は、読める Node のコード（`onexit`）と、`detached` が `setsid` を使うことで、実測は補助 | **妥当（Low）**。選択肢: (a) 文書に「手元の実測（再現の手順はリポジトリの外）」と明記する（1 文ずつ。推奨）、(b) 実験のスクリプトをリポジトリへ入れる（`lib.mjs` の安全規則ごと。大きい）。**推奨: (a) を次の docs 修正で**（ROADMAP 項目 32） |

## 実測

作業用ファイルは `tmp/backlog-16-2-19-r2fix/`（git 管理外）。実験は、実験が自分で起動した子と、記録した pgid にだけ作用する。macOS・Node 24.13.1。

### M1: B16-R2-001 の再現（`process.kill` の差し替え）

差し替えは、記録した pgid（負の id）と、同じ数の正の pid（`child.pid`）にだけ効く。最初のグループへの送信は ESRCH にする（本物の leader は動いたままなので、`exitCode` は null。古いガードを通る状態）。その後は、同じ数のグループが生きた別のグループとして、正の pid が別のプロセスとして答え、何も届けない。
順 1 は CLI と同じ（`abort()` → `terminateActiveChildren`）、順 2 は逆（`terminateActiveChildren` → `abort()`）。表は「最初の ESRCH の後に送ったもの」。

| 版 | 順 | グループの番号へ | 正の pid（leader）へ |
|---|---|---|---|
| v0.5.33 | 1・2 | signal 0 が 110 回、SIGTERM 1、SIGKILL 2（R1-001 の性質） | **0 回** |
| v0.5.34 | 1・2 | 0 回 | **SIGTERM 1 回**（どちらの順も） |
| 修正後 | 1・2 | 0 回 | **0 回** |

- v0.5.33 の正の pid への送信が 0 回なのは、ESRCH で返っていたため（v0.5.32 も同じ）。**この経路は v0.5.34 の `!group.gone` が新しく開けた**

### M2: 実際の Node で到達できるか

`gone`（`kill(-pgid, 0)` が ESRCH）かつ `exitCode === null` かつ `signalCode === null` の状態が、実際の子で起きるかを調べた。
- **構造**: (1) `gone` は、`kill(-pgid, 0)` が ESRCH を返したときに立つ。leader が終わって Node がまだ回収していない間（`exitCode` が null）は、ESRCH にならない。**macOS での直接の確認**: イベントループを同期で 400 ms 止めて、子の終了後・回収前に `kill(-pgid, 0)` を呼ぶと、leader だけが残る形は **EPERM**（`aiqh` は EPERM を「ある」と数え、`gone` にしない）、leader が終わり孫が残る形は成功、`kill(pid, 0)` は成功（3 形とも `exitCode` は null）。回収の後は、孫が残る形を除いて ESRCH。Linux は未確認。
  (2) Node は、回収したのと同じコールバック（`ChildProcess` の `onexit`）の先頭で `exitCode` / `signalCode` を設定する（Node 24.13.1 の `_handle.onexit` のソースで確認。`exit` イベントの前）。JS から、回収の後で `exitCode` がまだ null の時点は見えない。(3) `detached` の子は `setsid` で新しいセッションのリーダーなので、leader が自分のグループから出ることもできない。未回収の leader の pid は再利用されない（回収されるまで pid を持つ）
- **観測**: 実際の子 360 個（即終了 120・短い node 120・leader を SIGKILL 120）を、イベントループの 1 周ごと（約 77 万回）に、「`kill(-pgid, 0)` が ESRCH」と「`exitCode` / `signalCode` が null」を同じ同期のブロックで読んだ。**「ESRCH なのに `exitCode` が null」は 0 回**。確認のため、回収の後は 720 回の標本のすべてで ESRCH だった（即終了・短い node の 240 個。観測が ESRCH を見分けられることの確認）
- 結論（事実のみ）: **実際の Node では、この経路に到達する状態は観測されず、構造上も起きにくい**。古いガード（`exitCode === null`）が、実際には止めていたと見られる。実害は起きにくい（推定。実際の実害は観測していない）。それでも、「グループが消えたと分かっているなら、何も送らない」方が単純で安全なので直した（`child.pid` の `exitCode` のガードに頼らない）
- 制約: この観測は git 管理外の手元の実験（S-6 と同じ）で、リポジトリには再現の手順が無い。macOS だけ（Linux は未確認）。構造の説明（Node の `onexit`）は、誰でも読んで確認できる
- 関連: 未回収の leader だけが残るグループへの**シグナル**（signal 0 以外）も EPERM になる（macOS で確認: `kill(-pgid, SIGTERM)` は EPERM、`kill(pid, SIGTERM)` は成功）。そのとき `killTree` は、ESRCH でない失敗として、子の pid へ直接送る（`exitCode` が null の間。未回収の leader の pid は再利用されないので、安全）。これが決定 6 の直接送信の本来の役目で、この版でも変えない

### M3: 信号を送る呼び出しの棚卸し（`src/` の全経路）

`process.kill`（signal 0 を含む）・`child.kill`・`spawn` / `execFile` 系の `timeout` / `killSignal` を、`src/` 全体で探した（`grep`）。「ESRCH を見た後に届くか」は、`gone` が立った後の状態で。行番号は v0.5.34 → 修正後。

| # | 場所 | 呼び出し | 対象 | ガード | ESRCH（`gone`）を見た後に届くか |
|---|---|---|---|---|---|
| 1 | `execute.ts:84`（修正後も 84） | `process.kill(-pgid, 0)`（`groupAlive`） | 負の pgid、signal 0 | `gone`（81）、win32・pgid なし（82）。ESRCH で `gone` を立てる | **届かない**（`gone` なら調べず false を返す）。呼び出し元: `poll`（173）、`terminateActiveChildren` の `anyAlive`（60・62・65）。EPERM は「ある」と数え、`gone` にしない |
| 2 | `execute.ts:333` → 337 | `process.kill(-pgid, signal)`（`killTree` のグループの分岐） | 負の pgid | v0.5.34: 331 の `!group.gone`、win32・pgid なし。修正後: 335 の `if (group.gone) return null`（グループ経路があるとき） | **届かない**（v0.5.34 も修正後も）。呼び出し元: `send`（160）= `escalate`（199 の SIGTERM）と SIGKILL のタイマー（205。204 の `if (group.gone) return` も）、`terminateActiveChildren`（59・64） |
| 3 | `execute.ts:349` → 353 | `process.kill(child.pid, signal)`（`killTree` の直接送信） | **正の pid**（leader） | pid の有無、`exitCode === null`、`signalCode === null`。**`gone` は見ない**（v0.5.34）。修正後は、グループ経路があるとき、ここに来るのは「グループへの送信が ESRCH 以外で失敗した」ときだけ（`gone` と ESRCH は 335・341 行目で返る）。グループ経路が無い（Windows・pgid なし）ときは、これまでどおり | **v0.5.34: 届く**（`exitCode` が null の間。B16-R2-001）。**修正後: 届かない**（グループ経路があるとき）。グループ経路が無い分岐は `gone` を立てないので、対象外 |
| 4 | `child.kill(...)` | なし | — | — | `src/` に呼び出しは無い（`execute.ts:325-326` のコメントだけ。`child.kill` は失敗を `error` イベントにするので使わない） |
| 5 | `review/packet.ts:185-192` | `spawnSync("git", …, { timeout: 120_000, killSignal: "SIGKILL" })` | Node が同期の呼び出しの中で起こした `git` 1 つ | Node 内部の timeout | `GroupState` と無関係（runner の経路ではない。1 つの子を、同期の呼び出しの中で待つ） |
| 6 | `git/info.ts:10`・`28` | `execFileSync("git", …, { timeout: 10_000 })` | 同上 | Node 内部の timeout（既定の killSignal は SIGTERM） | 同上 |
| 7 | `cli.ts`・`cli-signals.ts` | シグナルを送る呼び出しは無い | — | — | `process.on` はシグナルを受けるだけ。`abort()` は `AbortController`、`process.exit` は安全弁 |
| 8 | `src/` の外: `scripts/test-minimal-path.ts:43` | `child.kill("SIGKILL")` | このスクリプトが起こした子 | スクリプトの時間切れ | runner の `GroupState` と無関係（`test:minpath` の実行。`src/` の外） |

- **`gone` の立て方と読み方**: 立てるのは 1 と 2 の ESRCH だけ。読むのは 1（81）・2（v0.5.34: 331、修正後: 335）・SIGKILL のタイマー（204）・`finish` の確定（`poll` の `gone`）。直接送信（3）は、v0.5.34 では読んでいなかった（B16-R2-001）。修正後は、グループ経路があるときは 2 の位置で返るので、3 に来ない
- 棚卸しで、ほかに不変条件（「ESRCH を見たら、以後送らない」）を破る経路は見つからなかった。ただし、**調べていない状態からの送信**（最初のシグナルの前、`terminateActiveChildren` の `some` による後ろの target、最後の確認から送信までの 25 ms）は、ESRCH を見た後の経路ではなく、既知の隙（S-1・ADR-0023 の「残る隙」）

### M4: 自レビュー S-1 の再実行

猶予 600 ms の `terminateActiveChildren`、2 つの target（`tmp/backlog-16-2-19-r2review/exp-order.mjs`）。v0.5.34 と修正後で同じ結果。D（SIGTERM で消える target が先）: 後ろの target へ SIGKILL は 606 ms の 1 回（生きていた）。F（生きた target が先、消える target が後）: 後ろの target は signal 0 が 0 回で、SIGKILL が 1 回（実際には消えた後）。

## 直したもの（commit ごと）

- **C1 `2470bce`** `fix(runner): no direct signal to a leader of a group already seen gone (B16-R2-001)`: `src/runner/execute.ts`（+6／−2。`killTree` だけ。グループ経路があるとき、`gone` なら返る）。
  新テスト 2 ファイル（`regression-backlog16-r2-direct-signal.test.ts` 6 件、`regression-backlog16-r2-confirm-origin.test.ts` 1 件）。既存テストの期待値の変更は 0 件
- **C2**（この記録を含む docs の commit）: ADR-0023（「範囲（v0.5.35 で追記）」、決定 9 の補足、v0.5.34 の起点の記述の訂正）、ARCHITECTURE（後始末ライフサイクルの直接送信の条件）、このレビュー記録
- **C3**（リリースの commit）: `package.json` 0.5.35、CHANGELOG（v0.5.34 の見出しの SHA の記入と v0.5.35 の項）、ROADMAP（v0.5.35 の記録、候補、「次:」）、README の状態の行

## 修正前の失敗

新しいテストを v0.5.34 の `src/` に当てると、7 件のうち **2 件が FAIL**（B16-R2-001 の 2 つの順）、5 件が PASS（対照 4 件: EPERM のときの直接送信、グループへの送信が成功したら直接送らない 2 件、通常終了。固定 1 件: SIGKILL が先の待ちの起点）。
待ちの起点の固定のテストは、起点を入れ替えた誤った修正（変異: `anchor = goneAt ?? sigkillSentAt`）で FAIL する（約 2,225 ms。境界は 1,700 ms）。Windows の対照は、既存の `regression-backlog16-r1-win32-branch.test.ts` を、そのまま使う（修正の前後で PASS）。

## 直さなかったもの・既知の限界

- **S-1〜S-6**: 上の表のとおり、承認を待つ（推奨は S-1 のコード修正、S-2〜S-6 の文書・テストの修正。ROADMAP の候補）
- **最初のシグナルの前**（項目 6）と、最後の確認から送信までの 25 ms の窓: 変えない（v0.5.34 の記述のとおり）
- 安全弁がレポートの前に発火しうること、Windows の起点（項目 30）、実際の pgid の再利用・本物の EPERM の未再現、Linux・Windows での実行の未確認: 変えない
- 到達性の実測（M2）は、リポジトリに手順が無い（S-6）
