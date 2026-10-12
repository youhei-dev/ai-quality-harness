# ADR-0024: 処理されなかった例外・拒否は、出口を通して exit 2 で終え、動いている子を片付ける

- 状態: 採用（ADR-0019 の既知の限界「コールバックの中の未処理の例外」のうち、CLI の終わり方を決める。構造ガードの範囲は変えない。ADR-0023 決定 7 の安全弁とは別の決定。v0.5.44 で、独立レビュー R1 の B20-R1-001 を受けて、`--unhandled-rejections=warn` と `--abort-on-uncaught-exception` の下では起動を拒否する決定 6 を足した〈下の「追記（v0.5.44）」〉）
- 日付: 2026-10-11（M2-2、v0.5.42。ROADMAP のバックログ 20 の最小版。rest2 の計画の波 1）。追記: 2026-10-12（v0.5.44。独立レビュー R1 の B20-R1-001。決定 6）

## 文脈
- タイマーなどのコールバックで投げられた例外と、処理されなかった promise の拒否は、`src/cli.ts` の最上位の catch（`parseAsync` の chain。v0.5.14）に届かない。Node の既定の処理で、生のメッセージとソースの行が標準エラーに出て（出口〈`src/output.ts`〉を通らないので、禁止文字も秘密の形もそのまま）、exit 1 で終わる（v0.5.17 の SP1 で実測。ADR-0019 の既知の限界）
- exit 1 は「finding・検査の失敗」の意味（ADR-0021）なので、ツールの内部の誤りが品質ゲートの失敗と区別できない。動いている check は自分のプロセスグループにいるので、CLI だけが終わって残る（v0.5.42 の先に書いたテストで、直す前の CLI について確かめた）
- `src/` のコールバックは投げないように書かれていて、既知の発生源は無い（v0.5.37 の記録）。決定は、起きたときの終わり方の規則
- 人間の判断（2026-10-11、rest2 の SP1 の §3-6 の 5）: 波 1 で最小版を入れる。終了コードは 2、出口を通す、子を片付ける。項目 29（安全弁を段階ごとの期限にする案）とは別に扱う

## 決定
（v0.5.44 で注記: 下の決定 1〜5 の「出口を通る」「出口から出す」は、既定の起動オプションと、決定 6 で拒否しない起動オプションでの話。`--unhandled-rejections=warn` では Node 自身が拒否の理由を生のまま出し、`--abort-on-uncaught-exception` ではハンドラの前に V8 が例外を出して abort する〈B20-R1-001。下の「追記（v0.5.44）」〉）

1. **登録**: `src/cli.ts` が `process.on("uncaughtException")` と `process.on("unhandledRejection")` に同じ関数を登録する。Node の `--unhandled-rejections` のどの mode でも、`unhandledRejection` は発火する（strict では先に未捕捉の例外として届き、同じ関数が 2 回目として何もしない。Node v24.13.1 で throw・strict・warn・warn-with-error-code・none の 5 つを実測）
   （v0.5.44 で注記: 「どの mode でも発火する」は、Node が別に警告を出さないことの確認ではなかった。warn では、リスナーがあっても Node が `UnhandledPromiseRejectionWarning` と生の理由・スタックを出す〈Node v24.13.1 で実測。レビュアーは v22.16.0〉。決定 6 で、その起動を拒否する）
2. **最初の 1 回が終わり方を決める**（それ以後の例外・拒否は何もしない。終了コードはもう決まっている）:
   - 1 行を出口から標準エラーへ（`aiqh: unexpected error: <message>`。最上位の catch と同じ `unexpectedErrorLine`・`tryWriteError`。出口が禁止文字を表記にし、秘密の形をマスクする。値の検査が投げたら固定の文）
   - **シグナルが先に中断していたとき**（`interruption.signal.aborted`）: ここで終える。中断の経路（ADR-0023 と R3-002）がそのまま終わらせ、終了コードは 130 / 143 のまま（決定 4）
   - それ以外: `process.exitCode = 2`、最終行 `VERIFY ERROR (internal error)`、`interruption.abort("internal error")`（新しい check を起動しない。R3-002 と同じ仕組み）、`terminateActiveChildren(猶予)`（シグナルの経路と同じ片付け。`src/runner/execute.ts` は変えない）、片付けが終わったら（失敗しても）`process.exit(2)`
   - 安全弁: 猶予 + `SAFETY_VALVE_EXTRA_MS`（3 秒）で `process.exit(2)`（シグナルの経路と同じ長さ。`unref` なので、ほかに待つものが無ければ先に終わる）
3. **終了コードは 2**: ツールの内部の誤り（ADR-0021 の「ツール・設定・使い方のエラー」）。1 は finding・検査の失敗専用。判定が確定した後（PASSED のレポートを書いた後）でも 2 にする: 内部の誤りの後の 0 は、fail closed に反する
4. **シグナルとの順序**: 先に来た方が終わり方を決める
   - シグナルが先: 中断の経路の 130 / 143。例外の 1 行だけを足す。中断の経路の安全弁・片付けはそのまま
   - 例外が先: 2。後から来た SIGINT / SIGTERM は、`onSignalBeforeVerdictFixed` が中断済み（`aborted`）を見て何もしない（行も出さない）。判定の確定の後のシグナルは、これまでどおり何も変えない
   - 例外が先のとき、中断の理由は `"internal error"`。runVerify が先に終われば、レポートは `interruptedBy: "internal error"`・verdict ERROR・exitCode 2 で書かれる（`interruptionExitCode` の既存の規則。シグナル名でない理由は 2）。書けるかどうかは保証しない（`process.exit(2)` が先なら書かれない）
5. **範囲の外**: 例外・拒否の発生源を探して直すこと、レポートを必ず書くこと、項目 29（段階ごとの期限）。モジュールの読み込みの途中（ハンドラの登録の前）の例外は Node の既定のまま（exit 1。非 0）

## 代替案
- 終了コード 1 のまま、行だけを出口に通す: 内部の誤りと品質ゲートの失敗が区別できない（ADR-0021 の規則に反する）
- 例外が来たら常に 2（シグナルが先でも 2 に上書き）: 中断の経路の安全弁の終了コードを変える必要がある（シグナルの経路に手を入れる）。中断も非 0 で、どちらが先かは記録から分かる。採らない
- 片付けを待たずにすぐ `process.exit(2)`: 動いている check が残る（直す前と同じ）
- 項目 29 と一緒に、段階ごとの期限を設計してから入れる: 最小版は 29 と独立に入れられ、29 の判断（ADR-0023 決定 7）を変えない
- 例外のたびに 1 行を出す: 投げ続けるタイマーがあると標準エラーが埋まる。最初の 1 行で足りる

## 既知の限界
（v0.5.44 で注記: 起動オプションによる例外は、決定 6 と「追記（v0.5.44）」の既知の限界）
- 片付けは `terminateActiveChildren` の範囲（呼んだ時に動いている check）。中断で新しい check は起動しないが、起動の途中の 1 つについては、シグナルの経路と同じ（R3-002）
- `process.exit(2)` の後のレポートは無いことがある（決定 4）
- 出すのは `message`（Error でなければ文字列にしたもの）を出口の 1 行の規則（ADR-0017。LF などは表記）にした 1 行だけで、スタックは出さない。原因の場所は分からない（範囲の外）
- 2 回目以降の例外は記録しない（決定 2）

## 影響
- `src/cli.ts` だけ（`src/runner/execute.ts`・`src/cli-signals.ts` は変えない）
- ADR-0019 の既知の限界「コールバックの中の未処理の例外」に注記: CLI の終わり方はこの ADR。構造ガードがその形を見ないことは変わらない
- テスト: `tests/regression-backlog20-unhandled.test.ts`（実際の CLI に `--import` で読み込ませたテスト用のモジュールが例外を起こす。`src/` にテスト専用の入口は無い）

## 追記（v0.5.44: 起動時に拒否する Node のオプション。独立レビュー R1 の B20-R1-001）

### 文脈
- 独立レビュー R1（`docs/reviews/backlog-20/`）の B20-R1-001（High）: `--unhandled-rejections=warn`（`NODE_OPTIONS` からも指定できる）では、`unhandledRejection` のハンドラがマスクした 1 行を出しても、Node 自身が同じ拒否の理由とスタックを生のまま stderr に出す。決定 1〜2 の「出口を通る」が成り立たない
- 人間の決定: 起動時に拒否する（fail closed）。実測してから実装する。ほかの起動オプションで同じ漏れが見つかれば止まって報告する

### 実測（v0.5.43 の CLI、Node v24.13.1、macOS。`tmp/` の計測スクリプト。各 1 回）
- 例外・拒否は v0.5.42 のテストと同じ形（`--import` で読ませた一時ファイルが、check の pid が書かれた後に起こす）。理由・メッセージにはマスクされる形の偽の値を入れ、生のまま stdout・stderr・Node が書くファイルに出るかを数えた
- **表 A**（`--unhandled-rejections`）: 指定なし・throw・strict・warn・warn-with-error-code・none × `=` の形・空白区切りの形・`NODE_OPTIONS` × 拒否・例外。**warn の拒否の 3 つの形だけ**、マスクした行の後に `UnhandledPromiseRejectionWarning: Error: <生の値>` とスタックが出た（終了コード 2、子は残らない）。ほかの 29 の組み合わせ（全 32）は生の値 0、終了コード 2、子は残らない
- 下線の綴り（`--unhandled_rejections=warn`。引数・`NODE_OPTIONS`）、`NODE_OPTIONS` の二重引用符（全体・値・名前の途中）、`\` でも warn が効いた。後の指定が勝つ（warn の後の throw では漏れず、throw の後の warn では漏れた）。単引用符では効かなかった。大文字の名前と `WARN` では Node 自身が起動しない（exit 9）
- **表 B**（`NODE_OPTIONS` で付けた）: `--trace-uncaught`・`--trace-warnings`・`--report-uncaught-exception`（`--report-compact` 付きも。報告のファイルは書かれなかった: 例外はハンドラが処理する）・`--report-on-fatalerror`・`--trace-exit`・`--trace-sigint`・`--enable-source-maps`・`--redirect-warnings` は、拒否・例外とも生の値 0、ファイルの書き出し 0
- **`--abort-on-uncaught-exception`**: 例外のとき、ハンドラより先に V8 が `Uncaught Error: <生の値>` とスタックを出して SIGTRAP で異常終了した。マスクした行は出ず、終了コードは無く（シグナル）、**check の子が残った**。引数・`NODE_OPTIONS`・下線の綴りで同じ（4 回）。strict と併用すると拒否でも SIGABRT（生の値 2 回、子が残る）。throw・warn-with-error-code と併用した拒否は漏れない。否定の形 `--no-abort-on-uncaught-exception` は効かない（abort しない）
- ハンドラの前の v0.5.41 でも、warn では同じ生の警告が出た（既定のモードでは生の値 2 回・exit 1・子が残る）。v0.5.42 で悪くなったものではない

### 決定 6: 起動時に拒否する
1. **調べる場所**: `process.execArgv`（Node が読み終えた起動の引数）と環境変数 `NODE_OPTIONS`（`src/node-options.ts` の `refusedNodeOption`）。`src/cli.ts` が、ほかのどの処理よりも先に決め、最初の chain の中で、コマンドを読む前に使う
2. **拒否する条件**（どれか 1 つで拒否）:
   - R1: `unhandled-rejections` の設定のうち、モードが `warn`（完全一致）のものが 1 つでもある。後の設定で上書きされていても拒否する。`warn-with-error-code` は拒否しない
   - R2: `abort-on-uncaught-exception` の名前が出る。否定の形・後の否定で上書きした形・ほかのオプションの値（ファイル名など）の中の名前も拒否する
   - R3: `NODE_OPTIONS` が `unhandled-rejections` を一通りに読めない形で書いている: 引用符（`"`・`'`）か `\` がある（Node は名前の途中でも外す）、空白以外の区切り（TAB など）がある、モードが欠けている・Node の知らないモード、名前が `--unhandled-rejections` でも `--その他=値` の値でもない字句の中にある（その前のオプションが値を取るかは、ここでは分からない）
3. **名前の比べ方**: 名前の `-` と `_` は同じに扱う（Node と同じ）。名前とモードは大文字・小文字を区別する（Node と同じ。大文字では Node 自身が起動しない）。名前を探すときは、引用符と `\` を外してから探す（拒否の向き）
4. **拒否するときの動き**: 理由の 1 行（`aiqh: refusing to start: <the node command line | NODE_OPTIONS> sets --unhandled-rejections=warn …` など。どの指定が理由かが分かる。`NODE_OPTIONS` の中身は出さない）を出口から出し、exit 2。コマンドを読まず、check を起動せず、レポートを書かない。どのサブコマンドでも同じ。`aiqh verify` のときは、設定の誤りの経路と同じく、最後に `VERIFY ERROR (Node option error)` の行を足す（ほかのコマンドは理由の 1 行だけ。ルートには値を取るオプションが無いので、最初のオプションでない引数がコマンド）
5. **Node の解釈はまねしない**（人間の決定）: 後の指定が勝つこと、否定の形が効かせないことは、ここでは使わない。名前とモードが現れたら拒否する。Node のオプションの読み方を写すと、写し間違いがそのまま漏れの穴になる（fail closed を保つため）

### 採らなかった案
- (B) `process.setUncaughtExceptionCaptureCallback` で例外を受けて abort を止める: 素の Node の実験では、例外の abort は止まったが、strict と併用した拒否では capture callback とリスナーがあっても SIGABRT で生の値が出た。結局拒否が要り、例外の受け方も `uncaughtException` から排他の仕組みに変わる
- (C) 既知の限界として記録だけする: 生の値が出て、子が残る（fail closed にならない）
- Node の解釈をまねて、実際に効く設定だけを拒否する: 上の 5

### 既知の限界
- 安全な形（`--no-abort-on-uncaught-exception`、warn の後の安全なモード、引用符付きの安全なモード、ほかのオプションの値の中の abort の名前、`NODE_OPTIONS` の素の字句の中の unhandled-rejections の名前）も拒否する（仕様）
- `NODE_OPTIONS` の解釈は Node と完全には同じでない。迷う形は拒否する向きに倒している
- 表 B に無い起動オプション（`--inspect` 系など）と、起動の引数・`NODE_OPTIONS` 以外の指定の仕方（`--env-file` の中の `NODE_OPTIONS`、設定ファイルなど）は確かめていない
- 確かめたのは Node v24.13.1（macOS）だけ
- 拒否はこの CLI のプロセスの起動の時点の判断。check の子が自分で Node を起動するときの起動オプションは対象の外（check の出力はレポートでマスクされる）

### 影響
- `src/node-options.ts`（新規）と `src/cli.ts`。`src/runner/execute.ts`・`src/cli-signals.ts` は変えない
- テスト: `tests/regression-b20-r1-001-node-options.test.ts`（実際の CLI。拒否される 14 の形と、拒否しない対照 6）、`tests/regression-b20-r1-001-node-options-rule.test.ts`（規則だけ。57 件）
- ARCHITECTURE の §10 の表、README の中断・例外の説明に 1 行
