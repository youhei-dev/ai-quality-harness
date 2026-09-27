# M2-2 CLI の最上位の catch の独立レビュー R1 への対応記録（response-cli-catch-r1）— v0.5.15（M2-2-CLI-CATCH-R1-001 の修正）

- 対象レビュー: `docs/reviews/m2-2/independent-review-cli-catch-r1.md`（受領ファイル名 `independent-review-m2-2-cli-catch-r1-for-claude.md`、ChatGPT、2026-09-27 受領、
  SHA-256 246093d7…。対象 v0.5.14 = commit d98a5a6 / tag object 7b3d83b、範囲 v0.5.13..v0.5.14、パケット `review-packet-m2-2-cli-catch-r1.md`。前回のレビューとして r8 を収録）
- 対応日: 2026-09-27（SP1: 判定・棚卸し・再現・設計）、2026-09-28（SP2: 実装・検証）
- 結果（レビュアー）: 新しい指摘は High 0 / Medium 1 / Low 0。製品コード `src/cli.ts` の今回の修正には、新しい不具合は無かった。Medium 1 件
  （M2-2-CLI-CATCH-R1-001）は、新しい回帰テストの子プロセスの後始末が、v0.5.8（M2-2-R5-001）で決めたテストの方針を満たしていないという指摘
- 人間の判断
  - M2-2-CLI-CATCH-R1-001 は VALID とし、テストだけの小さな修正なので、今回のサイクル（v0.5.15）で直す
  - 範囲は新しいテスト `tests/regression-m2-2-cli-catch-001-thrown-value.test.ts` だけ。ROADMAP のバックログ 19 (a)(b)(c)（テストの後始末の低の既知の残り）は
    含めない（今回の指摘とは別に扱う）
  - 持ち主は案 A（各 `it` が自分の実行を持ち、`runs` の map をやめる）。止め方は ChildProcess の handle への SIGKILL（このファイルが試すのは CLI の signal の処理では
    ない）。一時ディレクトリは実行ごとに作る。`execFile` の `timeout: 20_000`・`killSignal: "SIGKILL"` は二重の安全弁として残す
  - 後始末が働くことの確かめ方は、写しでの実測（M2-2-R5-001 と同じ）。リポジトリのテストに仕掛けの 1 件は足さない
  - ARCHITECTURE は変えない。方針とバックログ 19 の食い違いは、下の節に記録する
  - レビュアーの「未確認の範囲」4.1・4.2 は、新しい作業を起こさずに記録する
  - 修正の後、小さなパケットで 2 回目のレビュー（m2-2-cli-catch-r2、範囲 v0.5.14..v0.5.15）を行う。そこで High が 0 なら、CLI の catch の作業を終える

## M2-2-CLI-CATCH-R1-001 の判定: VALID

### 根拠（v0.5.14 のコード。行番号は v0.5.14）

- `tests/regression-m2-2-cli-catch-001-thrown-value.test.ts`
  - 91〜92 行: 一時ディレクトリはファイルに 1 つで、`afterAll(() => tmp.cleanup())` で消す（`tests/` 全体で `afterAll` を使うのは、このファイルだけだった）
  - 104〜131 行: `runs` の map で、kind ごとに 1 回の実行を複数の `it` が共有する（CLI の起動は 17 回、テストは 25 件）
  - 113 行: `execFile(...)` の戻り値（ChildProcess の handle）を持たない。`afterEach` は無い
  - 119〜120 行: 止めるのは `execFile` 自身の `timeout: 20_000` と `killSignal: "SIGKILL"` だけ。このタイマーはワーカーの中にある
- 方針（`docs/ARCHITECTURE.md` の runner の項目の終わり、440〜443 行、v0.5.8）: テストの後始末は、失敗・タイムアウトの経路でも `afterEach` の中で終える（ワーカーの
  寿命に任せない）。止めるのは runner の AbortController か ChildProcess の handle だけで、ファイルから読んだ pid には signal を送らない
- 新しいテストは v0.5.14（この方針の後）に足したものだが、この方針を使っていなかった。レビューの事実の記述（handle を持たない、`afterEach` が無い、一時ディレクトリが
  `afterAll` だけ）は、すべてコードと一致した

### 再現（SP1。レビューでは「未実行」）

- やり方（M2-2-R5-001 と同じ形。v0.5.14 の一時 worktree の写しのテストだけに仕掛けを足し、本体のテストには入れていない）
  - preload に「終わらない」kind を足す（`process.cwd()` の中で `Atomics.wait` により 40 秒止まる。CLI は同期で止まるので、自分の signal の処理も動かない）
  - 走っている CLI を残したままテストを失敗させる 2 通りを末尾に足す。S1: 起動の 0.5 秒後に前提の失敗。S2: テストのタイムアウト 2 秒
  - `-t probe` でこの 2 件だけを実行し、CLI（コマンド行に一時ディレクトリの接頭辞 `aiqh-cli-catch-` を含む node）を `ps` で 100 ms ごとに追う。vitest の終了の後も
    最大 60 秒追う（残っていれば `ps` で見つけた pid に SIGKILL を送る形にしたが、一度も要らなかった）
- 結果（時間は vitest の開始からの秒）: vitest は 3.19 秒で終わった（2 件 FAIL）。S1 の CLI は 0.74〜40.81 秒で、**vitest の終了の後 37.6 秒残った**。S2 の CLI は
  1.34〜41.27 秒で、**38.1 秒残った**。一時ディレクトリは 3.19 秒（`afterAll`）に、**CLI が終わる前に消えた**
- `execFile` の 20 秒の安全弁は働かなかった（ファイルが終わるとワーカーが止められ、そのタイマーも消える）。CLI は自分の寿命（止まっている 40 秒）の終わりまで残った。
  M2-2-R5-001 の実測と同じ
- 実害が出るのは、CLI が終わらないとき（製品の退行か、仕掛けの変更）だけ。通常の経路では、CLI は約 0.13 秒で終わる

## `tests/` の棚卸し（子プロセスを起こすテスト。SP1、v0.5.14）

- 読み取り専用のサブエージェントが `tests/` の全ファイルを読み、要の主張（`afterAll` を使うのは新しいテストだけ、`stopper` を使うファイル、非同期に子を起こす手段と
  製品の関数の呼び出し元）は grep で確かめ直した。製品の中で非同期に子を起こすのは `src/runner/execute.ts` の `executeCommand` だけ（`runChecks`・`runVerify` が呼ぶ）

| ファイル | 起こし方・対象 | `afterEach` での後始末（handle / AbortController ＋ `stopper`） | 一時ディレクトリの削除 | 判定 | 既存の記録 |
|---|---|---|---|---|---|
| `regression-m2-2-cli-catch-001-thrown-value.test.ts` | `execFile`（aiqh CLI ＋ preload）、17 回 | **無し**（`afterEach` 自体が無い） | **`afterAll`** | **方針違反（今回の指摘）** | 無し（v0.5.14 で足した） |
| `regression-r3-cli.test.ts` | `spawn`（aiqh CLI） | 有り | `afterEach`（子を止めた後） | 方針どおり | v0.5.8 で直した |
| `regression-r4-report.test.ts` | `executeCommand`（AbortController） | 有り | 同上 | 方針どおり | 同上 |
| `regression-r2-cli-signal.test.ts` | `executeCommand` ＋ `terminateActiveChildren` | 有り | 同上 | 方針どおり | 同上 |
| `regression-m2-2-flake-001-timeout-after-abort.test.ts` | `executeCommand`（AbortController） | 有り | 同上 | 方針どおり | 同上 |
| `cli.test.ts`、`cli-init-scan.test.ts` | `promisify(execFile)`（aiqh CLI） | 無し（すぐ await） | `afterEach` | 低の残り | バックログ 19 (b) |
| `execute.test.ts`（孫の 1 件）、`regression-r1-runner.test.ts`、`regression-r2-runner.test.ts` | `executeCommand`（孫までタイムアウト） | 無し（すぐ await） | `afterEach` | 低の残り | バックログ 19 (a) |
| `execute.test.ts`（ほか 7 件）、`regression-r4-output-tail.test.ts`、`regression-r5-utf8-tail.test.ts`、`regression-r1-verify.test.ts`、`regression-r4-finalize.test.ts`、`regression-m2-2-r2-001-output-boundary.test.ts`（`runVerify` の部分）、`regression-m2-2-r3-001-line-breaks.test.ts` | `executeCommand`・`runVerify`（短命のコマンド） | 無し（すぐ await） | `afterEach` | 該当しない | `response-r5.md` の表 |
| ほか 49 ファイル | `execFileSync`・`spawnSync` だけ（主に git） | — | — | 対象外（同期の呼び出しの間は、テストのタイムアウトが働かない） | — |

- 非同期に子を起こすファイルは 16。方針どおりは 4
- **今回の指摘と同じ種類は、新しいテストの 1 件だけ**。バックログ 19 に書かれていない同じ種類のファイルも、ほかに無かった

## 修正の中身（v0.5.15。`tests/` のこの 1 ファイルだけ。`src/` は変えていない）

- 各 `it` が自分の実行を持つ（`runs` の map をやめた。CLI の起動は 17 回から 25 回になった）。`run(kind)` の中で、次の順に行う
  1. 一時ディレクトリを作り（実行ごと）、その削除を `cleanups` に積む
  2. preload と記録のファイルを書く
  3. `execFile` の ChildProcess の handle を持って起こす
  4. 起動の直後、最初の await の前に `stopper(done, () => child?.kill("SIGKILL"), SETTLE_MARGIN_MS, "the CLI")` を積む
- `afterEach` で `runCleanups(cleanups)` を await する。後から積んだものから順に行うので、CLI がまだ終わっていなければ handle に SIGKILL を送って確定を待ち
  （上限 5 秒。超えたらテストを失敗にする）、その後に一時ディレクトリを消す
- 止め方は SIGKILL。このファイルが試すのは CLI の signal の処理ではない。同期で止まった CLI は SIGTERM の処理を実行できない。preload は走査の前に投げるので、
  git などの孫は起きない
- `execFile` の `timeout: 20_000`・`killSignal: "SIGKILL"` は、二重の安全弁として残した（主な後始末は `afterEach`）
- ファイルから読んだ pid には signal を送らない（使っていない）
- 変えていないもの: preload の中身、25 件の本文と期待値（`shown()` から末尾まで、v0.5.14 とバイト単位で同じ）、`src/`、ほかのテスト
- テスト件数は 700 件（103 ファイル）のまま

## 修正の前後の実測（写し。SP2、2026-09-28）

上の「再現」と同じ仕掛けと監視を、v0.5.14 の写しで 1 回、修正の commit（`763ab72`）の写しで 2 回流した。時間は vitest の開始からの秒。どの回も vitest は 2 件 FAIL
（仕掛けの S1・S2）、ほかの 25 件は skip。

| 写し | vitest の終了 | S1 の CLI | S2 の CLI | 一時ディレクトリが消えた時刻 | 監視の SIGKILL |
|---|---|---|---|---|---|
| **修正前（v0.5.14）** | 3.64 秒 | 1.02〜41.09 秒。**vitest の終了の後 37.5 秒残った** | 1.67〜41.57 秒。**37.9 秒残った** | 3.48 秒（`afterAll`）。**CLI が終わる前に消えた** | 0 |
| 修正後（1 回目） | 3.27 秒 | 0.81〜1.13 秒。**S2 の CLI が現れる前に消えた**（S1 の `afterEach` の中） | 1.45〜3.11 秒。**vitest の終了の前に消えた**（S2 の `afterEach` の中） | 1.29 秒、3.27 秒（どちらも CLI が消えた後） | 0 |
| 修正後（2 回目） | 3.11 秒 | 0.66〜0.82 秒 | 1.16〜2.95 秒 | 0.99 秒、3.11 秒（どちらも CLI が消えた後） | 0 |

- 修正後は、2 回とも次をすべて満たした: S1・S2 の CLI がそれぞれのテストの `afterEach` の中で消えた、vitest の終了の後に残った CLI が 0、一時ディレクトリが CLI の
  後に消えた、`execFile` の安全弁（20 秒）より前に後始末が終わった、監視の SIGKILL が 0
- 修正前は、SP1 と同じく、この条件を満たさなかった
- どの回の後も、残った CLI は 0、`$TMPDIR` の `aiqh-` の残りは 0

## レビューの「特に見てほしい点」1〜7（レビュアーの結果）

| # | 点 | 結果（レビュアー） |
|---|---|---|
| 1 | catch から例外が出ないか | 問題なし（exit 2 を先に決め、調べる操作と 1 行目の組み立ては `unexpectedErrorLine()` の try の中、`tryWriteError()` も try で包む）。同じプロセスの中のコードが `process` や組み込みを書き換える脅威は、範囲の外として確認していない |
| 2 | 失敗の後に値を読み直さないか | 問題なし（`catch` に束縛が無く、固定の定数だけを使う。テストの「message の getter が敵対的な Proxy を投げる」形は、調べる途中で投げられた値の読み直しも検出できる） |
| 3 | 普通の値の出力の不変 | 問題なし（評価の順序と変換の回数は v0.5.13 と同じ。テストは 5 通りの標準エラーのバイトを固定している） |
| 4 | `writeError()` が投げたときの扱い | 製品コードの新しい指摘なし（診断が「1 行目の欠落」としてしか残らない性質はあるが、例外を調べて生の文字列を出すより安全側で、この handler の目的に合う） |
| 5 | テストの作り | preload の空振り、修正前 FAIL・修正後 PASS の向き、読み直しの数え方は問題なし。**子プロセスの後始末が方針を満たさない → M2-2-CLI-CATCH-R1-001** |
| 6 | `src/` 全体の棚卸しの結論 | 一部だけ確認（パケットの `src/` の全文は `src/cli.ts` だけで、棚卸しの網羅性は独立に確認できない）→ 下の「未確認の範囲」4.1 |
| 7 | docs とコードの一致 | 問題なし（ADR-0018 の v0.5.14 の注記、ARCHITECTURE、ROADMAP のバックログの繰り上げ、response-r7 の v0.5.14 の節、response-r8 の追記） |

## レビュアーの「未確認の範囲」の扱い（新しい作業は起こさない）

レビュアーは、パケットの外（今回のパケットに全文が無いもの）を断定しなかった。人間の判断で、次のとおり記録する。

1. **4.1 `src/` 全体の throw・catch・`AbortSignal.reason` の棚卸し**（列挙が全件か、利用者の入力から届かないという結論）
   - パケットは変更したファイルの全文しか含まず、v0.5.13..v0.5.14 で変えた `src/` は `src/cli.ts` だけだったため、独立には確かめられなかった
   - v0.5.14 の棚卸し（投げられた値を調べる 32 か所、利用者の入力から届く所は 0）は、`docs/reviews/m2-2/response-r7.md` の v0.5.14 の節にある
2. **4.2 `src/output.ts` の今の全文**
   - 理由は同じ（`src/output.ts` は v0.5.13..v0.5.14 で変えていない）。`writeError()` の経路を通った出力は、実物の CLI のテストで確かめている
   - 今の `src/output.ts` は v0.5.12 から変わっておらず、その全文は m2-2-r8 のパケット（範囲 v0.5.11..v0.5.12）に含まれていた
3. **4.3 既知の範囲外**（レビュアーは依頼の指定どおり指摘にしていない）
   - 全体の `uncaughtException` / `unhandledRejection` の受け皿を置かないこと、ファイルへの出力の禁止文字、M2-2-R4-002 などのバックログ、`safeJson()` の再レビュー、
     Windows、過去の記録の言い回し、verify とテストの所要時間

## ARCHITECTURE の方針とバックログ 19 の食い違い

- ARCHITECTURE のテストの後始末の方針（runner の項目の終わり、v0.5.8）の文には、例外の記載が無い
- 一方、ROADMAP のバックログ 19（テストの後始末の残り、低）には、既知の例外 (a)(b)(c) がある（孫までタイムアウトで止めるテスト、CLI をすぐ await するテスト、
  signal 0 の probe。どれも製品の不具合か pid の再利用のときだけ起きる）
- 人間の判断: ARCHITECTURE は変えない。方針はそのままで、既知の例外はバックログ 19 にある
- 今回のファイルは、バックログ 19 (b)（CLI をすぐ await するテスト）より悪い形だった（`afterEach` そのものが無く、一時ディレクトリを `afterAll` で CLI より先に
  消しうる）。しかも方針の後に足したものだったので、同じ版で直した

## 教訓（v0.5.15）

- **新しいテストを足すときは、既存のテストの方針（ARCHITECTURE のテストの後始末）に照らしてから足す**。子プロセスを起こすテストなら、handle ＋ `stopper` ＋
  `afterEach` を最初から使う（v0.5.14 では、値を届ける仕組みに注意が向き、後始末の方針を見落とした）
- **実行結果を複数の `it` で共有すると、後始末の持ち主があいまいになる**。子プロセスを持つものは、テストごとに持つ

## 対応

- M2-2-CLI-CATCH-R1-001: v0.5.15 で修正（上）。判定は m2-2-cli-catch-r2 で受ける
- バックログは項目も番号も変えない（今回の指摘は同じ版で直したので、足さない）
- `src/` は変えていない。ARCHITECTURE も変えていない
