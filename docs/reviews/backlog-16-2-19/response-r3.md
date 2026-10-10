# バックログ 16・2・19 の独立レビュー 3 回目への対応記録（response-r3）— v0.5.36

- 対象レビュー: `docs/reviews/backlog-16-2-19/independent-review-r3.md`（受領ファイル名 `independent-review-backlog-16-2-19-r3-for-claude.md`、2026-10-10 受領、15,926 バイト、SHA-256 `353515d4964053710f238787b2bc3928204cccdc7a4ffaf92df2486e72b58ecc`、
  LF 326 / CR 0 / TAB 0 / U+FFFD なし / 禁止文字なし。対象 v0.5.35 = commit 484703fc8efbf8b53b71044d9272f526553e5203 / tag object 2932869d628a4ca28eb58f80cf87ee9630539dc4、範囲 `v0.5.34..v0.5.35`）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一。Security Scan に一致する行は無い）
- 対応日: 2026-10-10
- 結果（レビュアー）: **High 0 / Medium 0 / Low 1（B16-R3-001）**。R2 の B16-R2-001・B16-R2-002 は、どちらも「解消」。レビュアーは対象コード・fixture・テストを実行していない（静的な読解のみ）
- **レビューのサイクルの終了**: R3 で High・Medium が 0 なので、このバックログ（16・2・19）の独立レビューは R1〜R3 で終える（人間の判断）。v0.5.36 に独立レビュー（r4）を付けるかどうかは、人間が v0.5.36 の停止ポイントの報告を見て決める

## 人間の判断（この作業の仕様）

1. B16-R3-001 を直す（子への直接送信が ESRCH のときは、グループの errno を返す）
2. 実装者の自レビュー S-1〜S-6（v0.5.35。独立ではない。`response-r2.md`）を、この版でまとめて直す。S-1 はコード、S-2 は README、S-3 はテストの 1 行、S-4 は「余裕を広げる」だけで済むものに限る、S-5 は過去の記録の本文を書き換えず注記で訂正、S-6 は ADR の 1 か所で明記
3. 変更の後、`src/` の信号を送る・調べる呼び出しの一覧を作り直し、「ESRCH を見た後に、番号へ何かが届く経路」が 0 であることを確かめる。R3 の未確認範囲 5 に答えるため、`grep` のコマンドと出力をそのまま載せる
4. 一覧の作成中に実装者が見つけた経路（leader の pid。下の節）は、作業を止めて報告した。人間の判断で選択肢 A（leader の pid の ESRCH も記録し、以後は直接送らない）を採った。それまでの 3 commit は書き換えず、後ろに commit を足す
5. `package-lock.json` の版は 0.5.35 のまま残す（npm の出力を手で直さない。v0.5.35 の判断と同じ）
6. v0.5.36・6 commit。v0.5.33〜v0.5.35 のタグは触らない。push・タグは人間の承認の後

## 指摘の判定（独立レビュー）

行番号は、レビュー対象の v0.5.35（commit 484703f）のもの。

| ID | レビュアーの主張 | 確認（コード・実測） | 判断 | 直した commit |
|---|---|---|---|---|
| B16-R3-001（Low） | グループへの送信が ESRCH 以外（EPERM 等）で失敗して `failure` を持った後、子への直接送信が ESRCH になると、`killTree` は `null` を返してグループの errno を捨てる。`killError` が残らず、文言が「could not be signalled (EPERM)」ではなく「still present」になる。fail closed・status・verdict・終了コードは変わらない（診断の精度だけ） | **コードの経路として確認できた**。`execute.ts:345`（`failure = errnoName(code)`）→ `:352-353`（直接送信）→ `:357`（`code === "ESRCH" ? null : …`）。呼び出し元 `send`（`:159-162`）は `null` 以外だけを `killError` に入れる。**v0.5.33 から同じ形**（errno を返す `killTree` は v0.5.33〈backlog 2〉から。v0.5.32 は `void` を返し、`child.kill` を使っていた）。**再現**（M1）: v0.5.33・v0.5.34・v0.5.35 で同じ | **採用**。子が ESRCH のときは `failure` を返す（グループ経路が無い分岐では `failure` が null なので、従来どおり） | C1 `eb66f1f` |

- **レビュアーの主張と実測の食い違い**: 無い。補足: この状態（グループ EPERM・子 ESRCH）は差し替えでしか作れない（実際の Node での到達は、B16-R2-001 と同じ構造で起きにくいと見る。推定）
- R3 の未確認範囲 5（変更していないファイルの再 grep）への答えは、M4 の grep の出力

## 自レビュー（独立ではない）の判定

**これは独立したレビューではない**。v0.5.35 の実装者が、同じ会話の中で先に書いた自レビュー（`response-r2.md` の S-1〜S-6）。同じ基準（コード・実測で確認できるか）で判定し、この版で直した。

| ID | 主張 | 確認 | 判断・直したもの |
|---|---|---|---|
| S-1（ROADMAP 項目 31） | `terminateActiveChildren` の `anyAlive` が `some` で短絡し、後ろの target を猶予の間調べない。猶予の後の SIGKILL が、消えた target の番号へ届きうる | v0.5.35 の `execute.ts:60`。**再現した**（M2） | **妥当**。全 target を調べてから判定する（`targets.map(([, group]) => groupAlive(group)).includes(true)`）。C2 `d1a3702` |
| S-2（項目 32 a） | README の中断の説明が、安全弁が先に発火しうること（レポートが無い場合がある）に触れない | 確認した（ADR-0023 決定 7 は触れている） | **妥当**。README に 2 文（通常のスケジューリングでの動きであること、極端な停止では安全弁が先に終了しレポートが無いことがあり、終了コードは 130 / 143）。C5 |
| S-3（項目 33 a） | `regression-backlog16-r1-pgid-reuse.test.ts` の「最初のシグナルが ESRCH」のテストが、`AbortController` を `executeCommand` に渡さない | 確認した | **妥当**。`controller` を先に作り、`signal` に渡した（宣言の位置を動かしたので 2 行。期待値は変えていない）。C3 `462df31` |
| S-4（項目 33 b） | 時間の余裕が小さいテスト | 同じファイルの 2 件を確認した | **妥当。2 件とも「余裕を広げる」だけで直せた**（期待値は変えていない）。待ちの境界のテストは、leader が SIGTERM の後に終わるまでの遅れを 400 → 100 ms（期待 約 1.6 秒、境界 2.6 秒のまま、余裕 0.7 → 1.0 秒。旧版は猶予 = 確認なので常に約 3.0 秒）。「最初のシグナルが ESRCH」のテストは `timeoutMs` を 1,200 → 3,000 ms（差し替えを入れる前に最初のシグナルが出る余裕が 1.2 → 3 秒）。**v0.5.33 の `src/` では、以前と同じ 4 件が FAIL**（待ちの境界のテストは 3,013 ms）。C3 `462df31` |
| S-5（項目 32 b） | `response-r1.md` と ADR-0023 が、pgid の再利用を「決定的に再現した」と書く | `response-r1.md:30` は誤解を招く（レビュアーの「再現していない」に「再現した」と答えている）。ADR-0023 の「範囲（v0.5.34 で追記）」の「決定的に再現した」も誤解を招きうる。ADR の既知の限界と `response-r1.md:80` は正確（「再現していない」） | **妥当**。本文は書き換えず、`response-r1.md` の末尾に「訂正（v0.5.36）」の節、ADR-0023 の該当箇所に訂正の注記。C5 |
| S-6（項目 32 c） | 「v0.5.32 から同じ性質」などの実測が、git 管理外の手元にあり、リポジトリ・パケットから検証できない | 確認した | **妥当**。ADR-0023 の「範囲（v0.5.36 で追記）」に、手元の実測の一覧を 1 か所にまとめて明記した（スクリプトはリポジトリに入れない）。C5 |

## 実装者が一覧の作成中に見つけた経路（レビューの指摘ではない）

- **経路**: `GroupState` が記録するのは、グループの ESRCH（`gone`）だけだった。子の pid への直接送信が ESRCH を返しても記録せず、ガードは `exitCode`・`signalCode` だけ。
  グループへの送信が EPERM などで失敗し続けると、次のエスカレーション（SIGKILL のタイマー、`terminateActiveChildren`）で、**ESRCH を返した同じ pid へもう一度直接送った**（v0.5.33 から。M3）
- **見つけた経緯**: C1〜C3 の後、M4 の一覧を作り直す途中で、C1 のテストの前提（pid への送信が SIGTERM・SIGKILL）を見て気づいた。7 件の範囲の外の設計判断なので、作業を止めて報告し、人間の判断（選択肢 A）を受けて直した
- **直したもの**: `GroupState.leaderGone` を、直接送信が ESRCH のとき 1 度だけ立て、以後その pid へは直接送らない（グループの errno は B16-R3-001 のとおり返す）。グループ経路が無い分岐（Windows・pgid なし）にも効く（Windows で子の pid が ESRCH を返したら、以後その pid へ送らない。Windows は対象外。`spawn` を差し替えた Windows の対照テストは、直接送信が成功する形なので変わらず PASS）。C4 `de6bb0d`
- **実際の Node での到達（推定）**: 子の pid が ESRCH を返し、かつ `exitCode`・`signalCode` が null である状態は、B16-R2-001 の M2（`response-r2.md`）と同じ構造で、JS からは見えないと見る（回収前の leader への `kill(pid, …)` は成功し、Node は回収したのと同じコールバックで `exitCode` を設定する）。この版では実測していない

## 実測

作業用ファイルは `tmp/v0536/`（git 管理外。macOS・Node 24.13.1）。実験は、実験が自分で起動した子と、記録した pgid にだけ作用する（子は印のファイルが消えると自分で終わる）。**これらは手元の実験で、スクリプトはリポジトリに無い**（ADR-0023 の「範囲（v0.5.36 で追記）」）。リポジトリで再現できるのは、`tests/` の決定的なテスト。

### M1: B16-R3-001 の再現

グループへの送信（signal 0 以外）を EPERM、同じ数の正の pid への送信を ESRCH に差し替える（何も届けない）。signal 0 は本物に通す（グループは本当に生きている）。猶予 300 ms、確認 400 ms。

| 版 | 契機 | `terminationUnconfirmed` | `errorSummary` |
|---|---|---|---|
| v0.5.33・v0.5.34・v0.5.35 | 中断 / タイムアウト | `{ waitedMs: 400, killError: null }` | `… (process group still present 400ms after SIGKILL)` |
| C1 以後 | 中断 / タイムアウト | `{ waitedMs: 400, killError: "EPERM" }` | `… (process group could not be signalled (EPERM) and was still present after 400ms)` |

status（中断 SKIPPED、タイムアウト FAIL）は同じ。

### M2: S-1 の再現

`terminateActiveChildren(600)` に target 2 つを渡す（差し替えは記録して本物に通すだけ）。順 F は「前 = SIGTERM を無視して生き続ける、後ろ = SIGTERM で消える」、順 D はその逆。

| 版 | 順 | SIGTERM で消える target（消えたのは 3 ms 後） |
|---|---|---|
| v0.5.35 | F | **signal 0 が 0 回、SIGKILL 1 回（613 ms、結果 ESRCH）** |
| v0.5.35 | D | signal 0 が 2 回（EPERM → ESRCH）、SIGKILL 0 |
| C2 以後 | F・D | signal 0 が 2 回（EPERM → ESRCH）、SIGKILL 0 |

生き続ける target は、どの版・順でも猶予の後に SIGKILL を 1 回受けた。

### M3: leader の pid の再現

M1 と同じ差し替え。leader の pid へ送った順。

| 版 | 中断だけ | CLI の中断の順（`abort()` → `terminateActiveChildren(600)`） | その逆 |
|---|---|---|---|
| C3 `462df31` まで | SIGTERM（ESRCH）、SIGKILL | SIGTERM、SIGTERM、SIGKILL、SIGKILL | 同じ 4 回 |
| C4 `de6bb0d` 以後 | **SIGTERM（ESRCH）だけ** | **SIGTERM だけ** | **SIGTERM だけ** |

`killError` は、C1 以後のどれも `EPERM`。

### M4: 信号を送る・調べる呼び出しの棚卸し（`src/` と `scripts/`）

**grep のコマンドと出力**（C4 `de6bb0d` の作業ツリー。この後の C5・C6 は `src/`・`scripts/` を変えない）:

```text
$ git grep -n -E "process\.kill\(" -- src scripts
src/runner/execute.ts:89:    process.kill(-group.pgid, 0);
src/runner/execute.ts:344:      process.kill(-group.pgid, signal);
src/runner/execute.ts:361:    process.kill(child.pid, signal);
(exit 0)

$ git grep -n -E "\.kill\(" -- src scripts
scripts/test-minimal-path.ts:43:      child.kill("SIGKILL");
src/runner/execute.ts:89:    process.kill(-group.pgid, 0);
src/runner/execute.ts:344:      process.kill(-group.pgid, signal);
src/runner/execute.ts:361:    process.kill(child.pid, signal);
(exit 0)

$ git grep -n -E "killSignal|timeout: [0-9_]+" -- src scripts
src/git/info.ts:10:      timeout: 10_000,
src/git/info.ts:28:      timeout: 10_000,
src/review/packet.ts:191:    timeout: 120_000,
src/review/packet.ts:192:    killSignal: "SIGKILL",
(exit 0)

$ git grep -n -E "(^|[^A-Za-z_.])(spawn|spawnSync|exec|execFile|execFileSync|execSync|fork)\(" -- src scripts
scripts/package-smoke.ts:32:  return execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
scripts/package-smoke.ts:74:  const version = execFileSync("npx", ["--no-install", "aiqh", "--version"], { cwd: consumer, encoding: "utf8" }).trim();
scripts/package-smoke.ts:91:  const run = spawnSync("npx", ["--no-install", "aiqh", "verify"], { cwd: consumer, encoding: "utf8" });
scripts/test-minimal-path.ts:39:    const child = spawn(process.execPath, [VITEST, "run"], { cwd: ROOT, env: { ...process.env, PATH: bin, NO_COLOR: "1", FORCE_COLOR: "0" }, stdio: "inherit" });
src/commands/init.ts:337:    return execFileSync("git", ["ls-files", "-z", "--", rel], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\0").includes(rel);
src/git/info.ts:6:    return execFileSync("git", args, {
src/git/info.ts:24:    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
src/review/packet.ts:185:  const r = spawnSync("git", ["-c", "core.quotePath=true", "-c", "core.precomposeunicode=false", "-c", "diff.suppressBlankEmpty=false", "-c", "diff.noprefix=false", ...args], {
src/runner/execute.ts:144:      child = spawn(options.command, {
src/security/scan.ts:164:    out = execFileSync("git", ["ls-files", "-z", ...extra], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
src/security/scan.ts:563:    out = execFileSync("git", args, { cwd: root, encoding: "utf8", input: paths.map((p) => `${p}\0`).join(""), stdio: ["pipe", "pipe", "pipe"] });
src/security/scan.ts:589:    out = execFileSync("git", ["ls-files", "-z", "--", ...paths], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
(exit 0)

$ git grep -n -E "process\.(on|once|off|removeListener)\(|process\.exit\(" -- src/cli.ts src/cli-signals.ts
src/cli-signals.ts:30:    process.on(signal, to[signal]);
src/cli-signals.ts:32:    process.off(signal, from[signal]);
src/cli.ts:45:    process.exit(exitCode);
src/cli.ts:69:for (const signal of CLI_SIGNALS) process.on(signal, beforeHandlers[signal]);
(exit 0)

$ git grep -c -E "process\.kill\(|\.kill\(|killSignal" -- src/review/packet.ts src/git/info.ts src/cli.ts src/cli-signals.ts scripts/test-minimal-path.ts
scripts/test-minimal-path.ts:1
src/review/packet.ts:1
(exit 0)
```

- 子プロセスを作る呼び出しのうち、Node がシグナルを送りうる（`timeout` か `killSignal` を持つ）のは、`git/info.ts` の 2 か所と `review/packet.ts` の 1 か所だけ。timeout の無い `git` の `execFileSync`（`commands/init.ts:337`、`security/scan.ts:164・563・589`）と `scripts/package-smoke.ts` は、シグナルを送らない
- `response-r2.md` の M3 は、timeout の無い `git` の呼び出しを載せていなかった（下の表で足した。結論は変わらない）

**一覧**（行番号は C4 `de6bb0d`）:

| # | 場所 | 呼び出し | 対象 | ガード | ESRCH を見た後に届くか |
|---|---|---|---|---|---|
| 1 | `execute.ts:89` | `process.kill(-pgid, 0)`（`groupAlive`） | 負の pgid、signal 0 | `gone`（86）、win32・pgid なし（87）。ESRCH で `gone` を立てる（93） | **届かない**。呼び出し元: `poll`（178）、`terminateActiveChildren` の `anyAlive`（65。C2 で全 target を調べる） |
| 2 | `execute.ts:344` | `process.kill(-pgid, signal)`（`killTree` のグループの分岐） | 負の pgid | `if (group.gone) return null`（342）。ESRCH で `gone` を立てる（348-349） | **届かない**。呼び出し元: `send`（165）= SIGTERM（204）と SIGKILL のタイマー（210。209 の `if (group.gone) return` も）、`terminateActiveChildren`（62・69） |
| 3 | `execute.ts:361` | `process.kill(child.pid, signal)`（`killTree` の直接送信） | **正の pid**（leader） | `leaderGone`・pid の有無・`exitCode === null`・`signalCode === null`（357）。ESRCH で `leaderGone` を立て、グループの errno を返す（365-368。C1・C4）。グループ経路があるときは、グループへの送信が ESRCH 以外で失敗した呼び出しの中だけ | **届かない**: グループの ESRCH の後は 2 の位置で返る。この pid 自身の ESRCH の後は `leaderGone` で返る（C4 で閉じた。それまでは届いた: M3） |
| 4 | `child.kill(...)` | `src/` に呼び出し無し | — | — | — |
| 5 | `review/packet.ts:185-192` | `spawnSync("git", …, { timeout: 120_000, killSignal: "SIGKILL" })` | Node が同期の呼び出しの中で起こした git 1 つ | Node 内部の timeout | `GroupState` と無関係（runner の経路ではない） |
| 6 | `git/info.ts:6`（`timeout` は 10）・`24`（同 28） | `execFileSync("git", …, { timeout: 10_000 })` | 同上 | Node 内部の timeout（既定の killSignal は SIGTERM） | 同上 |
| 7 | `commands/init.ts:337`、`security/scan.ts:164・563・589` | `execFileSync("git", …)`（timeout なし） | 同上 | — | シグナルを送らない |
| 8 | `cli.ts`・`cli-signals.ts` | 送る呼び出し無し（`process.on` / `off` は受けるだけ、`cli.ts:45` の `process.exit` は安全弁） | — | — | — |
| 9 | `src/` の外: `scripts/test-minimal-path.ts:43` | `child.kill("SIGKILL")` | このスクリプトが起こした vitest | スクリプトの時間切れ | runner と無関係 |
| 10 | `src/` の外: `scripts/package-smoke.ts:32・74・91` | `execFileSync` / `spawnSync`（timeout なし） | npm・npx | — | シグナルを送らない |

- **結論**: v0.5.36（C4 以後）で、**ESRCH を見た後に、番号（負の pgid・正の pid）へ何かが届く経路は 0**。`gone` を立てるのは 1・2 の ESRCH、`leaderGone` を立てるのは 3 の ESRCH だけで、どちらも戻さない
- **ESRCH を見る前の送信**（残る隙。この版で変えない）: 最初のシグナルの前（ROADMAP 項目 28）。最後の確認から送信までの窓（`executeCommand` は 25 ms、`terminateActiveChildren` は 50 ms。S-1 の修正で、後ろの target の窓は猶予の全期間から 50 ms に縮んだ）

## 直したもの（commit ごと）

- **C1 `eb66f1f`** `fix(runner): keep the group errno when the direct fallback finds the child gone (B16-R3-001)`: `src/runner/execute.ts`（+6／−3）、新テスト `tests/regression-backlog16-r3-group-errno.test.ts`（4 件）
- **C2 `d1a3702`** `fix(runner): probe every target before escalating in terminateActiveChildren (S-1)`: `src/runner/execute.ts`（+3／−1）、新テスト `tests/regression-backlog16-r3-probe-every-target.test.ts`（2 件）
- **C3 `462df31`** `test: pass the abort signal; widen timing margins where safe (S-3, S-4)`: `tests/regression-backlog16-r1-pgid-reuse.test.ts`（+6／−4。期待値は変えていない）
- **C4 `de6bb0d`** `fix(runner): no direct signal to a leader pid seen gone`: `src/runner/execute.ts`（+13／−7）、`tests/regression-backlog16-r3-group-errno.test.ts`（v0.5.36 で足した未リリースの 2 件の pid への期待を `["SIGTERM", "SIGKILL"]` → `["SIGTERM"]` に直し、2 件を足した。計 6 件）
- **C5**（この記録を含む docs の commit）: ADR-0023（「範囲（v0.5.36 で追記）」、決定 9 の v0.5.36 の補足、S-5 の訂正の注記、既知の限界の注記、影響）、ARCHITECTURE（後始末ライフサイクルの 3 か所に v0.5.36 の 1 句ずつ）、README（S-2）、`independent-review-r3.md`、この記録、`response-r1.md` の訂正の節（S-5）
- **C6**（リリースの commit）: `package.json` 0.5.36（`package-lock.json` は 0.5.35 のまま）、CHANGELOG（v0.5.35 の見出しの SHA の記入と v0.5.36 の項）、ROADMAP（項目 31〜33 の解消、レビューのサイクルの終了、「次:」）、README の状態の行

## 修正前の失敗

- 新しいテストを v0.5.35 の `src/` に当てると、C1・C2 の 6 件のうち **3 件が FAIL**（B16-R3-001 の中断・タイムアウト、S-1）、3 件（対照）が PASS
- C4 の 4 件（期待を直した 2 件と新しい 2 件）は、C3 `462df31` の `src/` で **4 件とも FAIL**（pid への送信が 2 回または 4 回）。対照の 2 件は PASS
- C3 で直した `pgid-reuse` の 6 件は、v0.5.33 の `src/` で以前と同じ 4 件が FAIL、2 件（対照）が PASS（S-4 で余裕を広げても、旧版との区別は残る）
- **v0.5.35 までにある既存テストの期待値の変更は 0 件**。Windows の対照（`regression-backlog16-r1-win32-branch.test.ts`）は、変更なしで PASS

## 直さなかったもの・既知の限界

- 最初のシグナルの前（項目 28）、最後の確認から送信までの窓、安全弁がレポートの前に発火しうること（項目 29）、Windows の起点（項目 30）: 変えない
- 実際の pgid・pid の再利用、本物の EPERM は再現していない（差し替えで不変条件を確かめた）。Linux・Windows の実機では未確認
- R3 の未確認範囲 8（SIGKILL を起点とする待ちのテスト〈`regression-backlog16-r2-confirm-origin.test.ts`〉の高負荷での揺れ）: この版では変えない（自レビュー S-4 が挙げたのは `pgid-reuse` の 2 件。このテストの余裕は両側 0.5 秒で、R3 は新しい指摘にしなかった）
- 実測は手元（S-6。ADR-0023 の「範囲（v0.5.36 で追記）」）
