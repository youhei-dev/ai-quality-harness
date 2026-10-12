> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-backlog-20-r1-for-claude.md`（2026-10-12 受領、7,034 バイト、LF 48・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `25f66d7d90a99b749d6eafa12270608c6d0caa204cc8266288c5adc5d5a3ee5f`。Security Scan に一致する例示行・変更した原文の行番号: なし。

---

# 独立レビュー結果 — バックログ20 / R1

- 対象: `aiqh` v0.5.41..v0.5.42（3 commit）
- 資料: `review-packet-backlog-20.zip` 内の差分・変更後全文、`aiqh_backlog-20_r1_request.md`
- 方法: パケットのコード・テスト・ADRを独立して読解。プロジェクト本体のビルド・テストは実行していない。Node.jsの挙動に限り、ローカル Node.js v22.16.0 で最小再現を実行した。

## 指摘

### B20-R1-001

- **ID**: B20-R1-001
- **重要度**: High
- **種別**: バグ
- **対象**: `src/cli.ts` 116–117行付近（`process.on("unhandledRejection", onUnhandled)`）、`docs/adr/0024-unhandled-exceptions-exit-2.md`「決定 1–2」、`tests/regression-backlog20-unhandled.test.ts` の `reject` ケース
- **内容**: Node.js を `--unhandled-rejections=warn` で動かすと、登録した `unhandledRejection` リスナが秘密情報をマスクした行を出しても、Node.js自身が**同じ拒否理由の生のメッセージとスタックトレースを stderr に警告出力する**。したがって「未処理の拒否は必ず出口を通る」「秘密をそのまま表示しない」という要求を満たさない。このモードは CLI 引数だけでなく `NODE_OPTIONS=--unhandled-rejections=warn` からも指定可能である。
- **根拠**: `src/cli.ts` の追加コードは `unhandledRejection` を購読して `tryWriteError(unexpectedErrorLine(err))` を呼ぶのみで、Node.js の `warn` モードによる独立の警告出力を制御しない。独立最小再現として Node.js v22.16.0 に `node --unhandled-rejections=warn -e 'process.on("unhandledRejection",()=>{console.error("handled")});Promise.reject(new Error("SECRET_TEST"));setTimeout(()=>{},50)'` を実行したところ、`handled` に加えて `UnhandledPromiseRejectionWarning: Error: SECRET_TEST` とスタックが stderr に出力された。一方 `warn-with-error-code` では同再現で警告は出なかった。ADR-0024 の「5つのmodeでイベントが発火した」という検証は、警告が別途出ないことの証明ではない。パケット内の回帰テストも明示的に `warn` モードを指定していない。
- **修正案**: 安全な起動条件を規定し、`warn` モードを含む実際の Node.js 起動オプションごとの漏えいを評価する。実装上の対処案として、サポートする Node.js オプションを明示し `warn` を拒否する、または別プロセスから起動オプションを検証して安全なモードのみ許可する、などを検討する。単に `unhandledRejection` リスナを追加するだけでは `warn` の生警告を抑止できない。`NODE_OPTIONS` も含めた各モードで、秘密を含む拒否理由が stdout/stderr に平文で出ないこと、終了コード2であること、子の掃除が行われることを回帰テストに加える。
- **確度**: 確認済み（Node.js v22.16.0 における挙動。パケット記載の Node.js v24.13.1 での再現は未実施）

## 全体の結論

**High 1件、Medium 0件。** 本レビューの終了条件「High・Medium が 0」は満たさない。`--unhandled-rejections=warn` 時の生警告の漏えいを対処・再検証する必要がある。通常モードでの主要な制御フローは実装上妥当だが、「必ず出口を通る」という普遍的な主張には反例がある。

## 問いへの回答

### 問い1 — 未処理例外・拒否は必ず非0（2）で出口を通って終わるか

**一部不適合。** ハンドラ登録後に最初の例外・拒否が届いた場合、`unhandledSeen` で多重処理を防ぎ、`unexpectedErrorLine` → `tryWriteError` によってマスク対象のメッセージを出し、シグナル先行でなければ `process.exitCode = 2` と最終的な `process.exit(2)` を設定する。この通常経路は確認できる。ただし `--unhandled-rejections=warn` では Node が独立して生の警告を出すため、全出力が出口を通るとはいえない（B20-R1-001）。また、シグナル先行時の 130/143 とハンドラ登録前の既知の限界は依頼の例外として扱った。

### 問い2 — 動いている子を片付けるか

**コード上は片付けを開始し、完了を待つ設計。** `interruption.abort("internal error")` の後で `terminateActiveChildren(DEFAULT_KILL_GRACE_MS)` を呼び、その Promise の履行・拒否のいずれでも `process.exit(2)` に進む。安全弁も設置される。テストには実際の check の PID を監視して消滅を確かめるケースがある。ただし `terminateActiveChildren` 内部の実装はパケットにないため、グループ全体の実際の掃除の完全性、起動中の競合、完了通知の意味は独立には証明できない。

### 問い3 — 安全弁・判定確定・SIGINT/SIGTERM と衝突せず、二度目の例外でも非0か

**提示コードの主要経路では妥当。ただし未確認点あり。** 最初の例外は `unhandledSeen = true`、`process.exitCode = 2`、中断通知、安全弁、後始末を設定するので、二度目が到来しても何もしないまま最初の終了処理が残る。シグナル先行時は `interruption.signal.aborted` により既存の 130/143 の終了処理を尊重する。例外先行で判定確定前なら後続シグナルは中断済みとして扱われる。判定確定後は `onSignalAfterVerdictFixed` が登録されているため、後続シグナルは追加の案内行を出し得るが、終了コード2を変更しない。`throw-after-report` テストは PASSED 表示後の例外でも exit 2 となることを検証する設計。これらの実際のタイミングと SIGTERM 側の挙動はパケット単体では全て実証できない。

## 未確認範囲

- `src/runner/execute.ts`：`terminateActiveChildren` のグループ走査・終了待ち・エラー処理・起動中の競合。
- `src/cli-signals.ts`：安全弁定数とハンドラ交換の細部。
- `src/commands/verify.ts`、`src/cli-program.ts`：中断理由からの終了コード、判定確定時期、レポートの実際の書き方。
- `src/output.ts`：出力境界とマスクの実装詳細。
- `docs/adr/0023-unconfirmed-termination-is-not-terminated.md`：安全弁・判定確定に関する既存決定の全文。
- Node.js v24.13.1 および他のサポート対象 Node.js での `warn` モードの確認（ローカル再現は v22.16.0）。
- パケット記載の `aiqh verify` 全8項目 PASS は資料中の記録として確認したが、本レビューでは本体テスト・ビルドを再実行していない。

以上。追加パケットを用意できる場合は、未変更の上記実装ファイルを提供してほしい。ただし B20-R1-001 自体は、現時点で具体的な再現を伴う指摘として成立する。
