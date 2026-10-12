> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-backlog-20-r2-for-claude.md`（2026-10-12 受領、5,953 バイト、LF 57・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `5b6d22cc3007f4e2b6c67b64577bff24108fe28b52eccb4331b5b9ca3e2ec591`。Security Scan に一致する例示行・変更した原文の行番号: なし。

---

# 独立レビュー結果 — バックログ20 / R2

## 対象と方法

- 対象: `v0.5.43..v0.5.44` (`6ec3c3e620c1..3dc5ce13dc63`)
- 資料: 提出された `review-packet-backlog-20-r2.zip`。同名の `(1)` 版は SHA-256 が同一。
- 方法: パケットの依頼、差分、v0.5.44 の関連コード、R1原文、ADR、回帰テスト、追加 Documents 6 件を静的に読んだ独立レビュー。
- 制限: リポジトリ全体の取得やテスト・CLI再実行は行っていない。Verification の PASS はパケット記録であり、レビュアー自身による再実行結果ではない。

## 指摘

**High: 0件 / Medium: 0件 / Low: 0件。** このパケットから、根拠のある新規指摘は確認できなかった。

## 問い1 — B20-R1-001の解消と検出規則

**解消と判断する（対象の起動指定について、静的確認）。**

`src/node-options.ts` の `refusedNodeOption()` は `process.execArgv` と `process.env.NODE_OPTIONS` の両方を受け取る。`unhandled-rejections=warn` を `=` 形式と空白区切り形式で検出し、複数指定の途中に `warn` があっても拒否する。`_` を `-` に正規化する。`abort-on-uncaught-exception` は肯定・否定や別のトークン中の出現を含め、名前があれば拒否する。`NODE_OPTIONS` で引用符、バックスラッシュ、通常の空白以外の区切りがある場合、対象名が含まれていれば拒否に倒す。未知のモードと値欠落も拒否する。

安全な `throw`、`strict`、`none`、`warn-with-error-code` は、そのまま読める形では拒否されない。`NODE_OPTIONS` の引用符付き安全モード、上書き済み warn、否定形 abort、別オプションの値に含まれる abort 名等まで拒否するのは、依頼・ADR-0024 決定6で明示された保守的な仕様であり、欠陥として数えない。

ただし、Node のオプション構文の全バリエーションに対する実機網羅性までは検証していない。`--env-file` 等、依頼が既知の限界とした経路は評価対象外。

## 問い2 — 起動拒否経路

**コード上は要件を満たす。**

`src/cli.ts` はモジュール初期化時に拒否理由を決め、末尾の Promise chain では `buildProgram(...).parseAsync(...)` より前に拒否分岐を選ぶ。拒否時に `process.exitCode = EXIT_ERROR`、`tryWriteError()` 経由の定型メッセージ、`verify` に対して追加の `VERIFY ERROR (Node option error)` を出す。この分岐から check やレポート作成は呼ばれない。理由は NODE_OPTIONS の生文字列を表示せず、`writeError` 出力境界を通る。

実 CLI の14拒否ケースでは exit 2、秘密文字列非露出、check未起動、レポート未作成を検証するテストが用意され、6許容ケースは従来の未処理例外処理を検査する。これらのテストが実際に成功したことはパケットの `aiqh verify` 記録に依拠する。

## 問い3 — R1で未確認だった未処理例外経路

**追加の High / Medium 指摘なし。**

`src/runner/execute.ts`、`src/cli-signals.ts`、`src/commands/verify.ts`、`src/cli-program.ts`、`src/output.ts`、ADR-0023 を読んだ。`onUnhandled()` は最初の事象について出力境界を通して通知し、既に SIGINT / SIGTERM が中断済みならその終了経路を維持する。未中断なら `EXIT_ERROR` を設定し、AbortController で新しい check 起動を抑止し、稼働中の子を終了対象にして、終了処理の成否にかかわらず exit 2 とする。終了処理に時間がかかる場合の安全弁もある。

runner は子をプロセスグループで扱い、SIGTERM の猶予後に SIGKILL を送り、終了確認と時間制限を組み合わせている。verify は判定確定の前後でシグナルハンドラを切り替え、判定確定後のシグナルでは結果を変えない。これらは ADR-0023/0024 の意図と整合する。

シグナルと未処理例外の先着優先、イベントループ停滞時にレポート完了より安全弁が先行しうる点は依頼で明示された既知の限界であり、再指摘しない。

## 全体の結論

- **High・Medium：0件。Low：0件。**
- **B20-R1-001：今回の対象となる Node 起動指定について解消と判断。**
- **問い1：対象となる warn / abort 指定を保守的に拒否し、安全な通常指定は拒否しない。仕様上の過剰拒否は意図的。**
- **問い2：拒否経路は check の実行・レポート作成の前に分岐し、出力境界経由の定型メッセージと exit 2 に至る。**
- **問い3：追加 Documents を含め静的に確認し、新たな High・Medium は認めなかった。**
- **R2終了の判断：依頼に定められた「High・Medium 0件なら終了」を満たす。**

## 未確認範囲

1. テスト・CLIをレビュアー自身の環境では実行していない。Node v24.13.1 / macOSでの実測値や `aiqh verify` 全8 PASSはパケットの記録に基づく。
2. 実測スクリプトと生ログはパケットに含まれないため、Node自身が出した全バイトを独立には検証できない。
3. R1の全パケット、未収録の `src/types.ts`、`src/runner/run-checks.ts`、`tests/regression-backlog20-unhandled.test.ts` などについては、今回のパケットにある参照情報の範囲で評価した。
4. `--env-file` 等による NODE_OPTIONS の間接指定、未実測の Node 起動フラグ、Node バージョン差、子が独自に起動する Node のオプションは今回の仕様範囲外。
5. インポート中かつハンドラ登録前に生じる例外、子プロセスグループの再利用競合等は文書にある既知の限界を超えて網羅検証していない。
