# M0 独立レビュー R4 への対応記録（response-r4）

- 対象レビュー: `docs/reviews/m0/independent-review-r4.md`（R4-001〜R4-003、R3-001〜R3-003 の再判定。対象コミット 24ed514 = v0.1.2）
- 対応日: 2026-09-16
- 形式: `response-r3.md` と同じ（「修正前 FAIL」と「ガード」を分離）
- 判定の根拠は実コード・テスト結果・仕様のみ。実装 AI の評価は書かない

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード（修正前後とも PASS） | 行き先 |
|----|--------|------|------|-----------------|------------|------------|--------|
| R4-001 | High | VALID | 修正済み（B 案） | 修正前の `runVerify` は `await runChecks()` の解決後、`interruptedBy` の判定からレポート生成・同期書込・最終出力・`return` まで `await` が無く、その同期区間に届いたシグナルのコールバックは実行されないまま `VERIFY PASSED` / exit 0 で完走できた。CLI ハンドラも `process.exitCode` を設定していなかった。修正（人間が決めた B 案「全チェック完了 ＝ 検証確定」）: `runChecks` 解決直後に `setImmediate` を一度 await して保留中のシグナルを反映し、その時点で `aborted` なら従来の中断処理、そうでなければ**確定点通過**として `onFinalized` を呼ぶ。CLI は `onFinalized` でシグナルハンドラを「確定済み」用に**差し替える**（解除ではない: listener が 0 になると Node が既定動作に戻り確定後に強制終了され結果が変わるため）。確定済みハンドラは stderr に `<signal> received after verification was finalized; result unchanged` と出して何もしない（PASSED という語は含めない）。ハンドラは確定点前の受信時に `process.exitCode = 130 / 143` を即設定（バックアップ）。レポート書込は既存の atomic rename のまま（`src/commands/verify.ts`、`src/cli.ts`） | `tests/regression-r4-finalize.test.ts` 1 件: テスト用フック `afterChecksCompleted`（全チェック完了直後に同期的に呼ぶ、`runVerify` の内部オプション。設定ファイル・CLI 引数から到達不可）から実 OS シグナル SIGUSR2 を自プロセスへ送り、リスナーが CLI と同じ `abort("SIGINT")` を行う。yield の無いコードでは `VERIFY PASSED` / exit 0（レビュアーの独立再現と一致）→ 修正後は exit 130、`VERIFY ERROR (interrupted by SIGINT)`、レポート verdict ERROR | 同ファイル 1 件: `onFinalized` からシグナルを送っても exit 0 / PASSED / レポート PASSED のまま（B 案の仕様固定） | M0 |
| R4-002 | Medium | VALID | 修正済み | 修正前の `toCheckResult()` の中断分岐は `skippedResult()`（`timedOut: false`、`outputTruncated: false`）を起点に一部だけ上書きし、`exec.timedOut` と出力の切り詰め事実を捨てていた。修正: 中断分岐でも通常分岐と同じ tail 計算を先に行い、`timedOut: exec.timedOut`、`outputTruncated: exec.stdoutTruncated \|\| exec.stderrTruncated \|\| stdoutTail.truncated \|\| stderrTail.truncated` を保持。タイムアウト到達後の中断は理由文に明記（`src/runner/run-checks.ts`） | `tests/regression-r4-report.test.ts` 2 件: 出力上限（4KB）超のチェックを中断 → `outputTruncated === true`、timeout（300ms）後に abort が重なる → `timedOut === true` | なし | M0 |
| R4-003 | Low | VALID | 修正済み | 修正前の `runChecks()` はループ先頭で `onCheckStart` を呼んでから `aborted` を判定するため、spawn していない後続チェックにも `[n/total] name` と `$ <command>` が表示された。修正: 中断 / fail-fast の SKIPPED 判定を先に行い、その場合は新設の `onCheckSkip` だけを呼ぶ。`onCheckStart`（コマンド表示）は実際に spawn するときのみ。`runVerify` は `[n/total] name (kind) — SKIPPED (reason)` を表示（`src/runner/run-checks.ts`、`src/commands/verify.ts`） | `tests/regression-r3-cli.test.ts`（実 CLI）に assert 追加: 2 件（出力に check 2 の `$ <command>` 行が無いこと、`SKIPPED` 表示があること）。修正前は `$ node -e '…two.started…'` が出力されていた | なし | M0 |

INVALID / PARTIAL なし。不採用なし。R-010 / R-011 / R-012 / R-013 の持ち越しは変更なし。

## v0.1.3 → v0.1.4（R4-001 の追加修正と、検証中に見つかった欠陥）

- **v0.1.3 は確定点の yield が不十分（問題 A）。v0.1.4 で修正。** v0.1.3 の R4-001 修正は `setImmediate` を 1 回だけ await していた。
  libuv は保留中の OS シグナルを poll フェーズで配送するため、`runChecks` の解決が子プロセスの `close`（poll フェーズの I/O コールバック）
  から来た場合、その immediate は同じ反復の check フェーズで解決し、次の poll を経ない。各 commit 単体の worktree 検証で
  R4-001 の回帰テストが失敗し、現行コードで 10 回中 4 回失敗することを計測。`yieldFullIteration()`（`setImmediate` を 2 回 await。
  2 回目は次の反復の poll の後で解決するため、1 回の poll フェーズを必ず経る）に変更し、20 回連続で成功することを計測した。
  v0.1.3 のタグは削除・上書きせず残す
- **出力末尾の保持（新規発見、R4 範囲外）**: 同じ検証で `tests/execute.test.ts` の「tail 保持」テストが負荷時に失敗（stdout が空）。
  原因は `OutputBuffer` が上限超過時にチャンクを丸ごと捨てるため、上限より大きい単一チャンク（例: 20,000 バイトの 1 回 write）で
  出力が空になること（決定的に再現）。先頭からバイト単位で切り詰める方式に変更し、単一の大きな write で末尾が残る回帰テスト
  `tests/regression-r4-output-tail.test.ts` を追加（修正前 FAIL: `expected 0 to be greater than 0`）

B 案に対する実コード上の注記: 指針の「ハンドラを解除」は、Node のシグナル既定動作により確定後の強制終了（結果の変化）を招くため、無視ハンドラへの差し替えとした（停止ポイント1 で提示し承認済み）。

## 回帰テストの実行記録

- 修正前: `npx vitest run tests/regression-r4-*.test.ts tests/regression-r3-cli.test.ts` → 3 ファイル 6 件中 5 FAIL / 1 PASS（ガード）。R4-001 はテスト用フックのみ追加した状態（yield なし）で実行し、競合そのものを再現。記録 `tmp/r4-before-all.txt`（git 管理外）
- 修正後: 同 → 6 件 PASS。全体 `npx vitest run` → 21 ファイル 137 件 PASS（既存 133 件 + R4 4 件）
- 自己 verify の結果は停止ポイント2 の報告に記載

## レビュアーの「見ていない範囲」に対する所見

レビュアーは `review-packet-m0-r3.md` の掲載内容を根拠とし、commit との byte 一致、133 件のテストログ、verify の実行、tarball、`npm audit`、push / tag、Linux / Windows、安全弁の EPERM / SIGKILL 不能ケース、masker と hook の一致、未変更ファイルは独立実行していないとしている。R4-001 はレビュアー側で最小 Node プログラムにより独立再現されており、本対応でも同じ構造（同期区間への実 OS シグナル）を回帰テストにした。
- 確定点の定義とシグナルの扱いは `docs/ARCHITECTURE.md` §9.2 に明文化
- 次回パケット（`review-packet-m0-r4.md`、commit 範囲 v0.1.2..v0.1.3）に commit 範囲と実行記録を含める
- Linux / Windows は M3（R-011 後半）、masker と hook の一致は M1（R-012）のまま
