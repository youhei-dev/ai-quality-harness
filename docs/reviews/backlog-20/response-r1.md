# バックログ 20 の独立レビュー 1 回目への対応記録（response-r1）— v0.5.44

- 対象レビュー: `docs/reviews/backlog-20/review-r1.md`（受領ファイル名 `independent-review-backlog-20-r1-for-claude.md`、2026-10-12 受領、7,034 バイト、SHA-256 `25f66d7d90a99b749d6eafa12270608c6d0caa204cc8266288c5adc5d5a3ee5f`、
  LF 48 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / Security Scan に一致する行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.5.42 = commit 423eb260d778d85b9eea6d4ddb2ba4d161e828e4 / tag object d061f48f3203fd0a437355586f691069461a8a2a、範囲 `v0.5.41..v0.5.42`（3 commit、10 ファイル）。バックログ 20 の最小版（未処理の例外・拒否を exit 2 で、出口を通し、子を片付けて終える。ADR-0024）
- レビュー用に作って人間に渡したもの（ChatGPT への送付は人間が行った）: `aiqh review-packet` のパケット（ラベル `backlog-20`、672,211 バイト、SHA-256 `84dc1fbb0dd9c489763e33b968928ece38fdc1eef121fce8a2c6ec35f7a9b87d`）と、それだけを入れた ZIP（672,363 バイト、SHA-256 `9c3a535200eb7c703481e5f11546900461418b5edb8267c7b73ae94e55ff49c4`）。
  依頼文（6,724 バイト、SHA-256 `5fd72991b5edd65755be0b0dafc1da7c3fb88bfb8a98be755e4db234956a4fa8`）はパケットの中にバイト単位で同一のまま入っている。問いは 3 つ
- 対応日: 2026-10-12
- 結果（レビュアー）: **High 1 / Medium 0 / Low 0**。依頼文に先に書いた基準（High・Medium が 0 なら終える）に達していないので、v0.5.44 で直し、R2 を依頼する（人間の判断）。レビュアーは aiqh を実行していない（Node の振る舞いだけを Node v22.16.0 で最小再現した）

## 判定表

| ID | 重要度 | 判定 | 原因 | 対応 | 根拠 |
|---|---|---|---|---|---|
| B20-R1-001 | High | **VALID**（確認できた） | Node を `--unhandled-rejections=warn` で動かすと、`unhandledRejection` のリスナーがあっても、Node 自身が拒否の理由とスタックを生のまま stderr に出す。v0.5.42 のハンドラはそれを止めない。ADR-0024 の「5 つの mode でイベントが発火した」という実測は、警告が出ないことの確認ではなかった | v0.5.44: 起動時に拒否する（人間の決定。fail closed）。warn に加え、実測で同じ種類の漏れが見つかった `--abort-on-uncaught-exception` も拒否する。下の「対応の内容」 | Node v24.13.1 で再現した（実測。下の表）。**v0.5.42 で悪くなったものではない**: ハンドラの前の v0.5.41 でも warn では同じ生の警告が出た（実測）。v0.5.42 は既定のモードでの漏れ（生の値 2 回・exit 1・子が残る）を直したが、warn の警告は Node 自身が出すので、リスナーでは止められない |

## 実測（v0.5.43 の CLI、Node v24.13.1、macOS。ADR-0024 の「追記（v0.5.44）」に詳しく）

- 例外・拒否は v0.5.42 のテストと同じ形（`--import` で読ませる一時ファイルが、check の pid が書かれた後に起こす）。理由・メッセージにはマスクされる形の偽の値を入れた
- `--unhandled-rejections` の 6 つのモード（指定なし・throw・strict・warn・warn-with-error-code・none）× 指定の 3 つの形（`=`・空白区切り・`NODE_OPTIONS`）× 拒否と例外: **warn の拒否の 3 つの形だけ**、マスクした行の後に `UnhandledPromiseRejectionWarning: Error: <生の値>` とスタックが出た（終了コード 2、子は残らない）。ほかはすべて生の値 0
- 下線の綴り（`--unhandled_rejections=warn`）と、`NODE_OPTIONS` の二重引用符（名前の途中でも）でも warn が効いて同じ漏れ。後の指定が勝つ（warn の後の throw では漏れない）
- ほかの起動オプション（`NODE_OPTIONS` で付けた）: **`--abort-on-uncaught-exception` で、例外のとき V8 が `Uncaught Error: <生の値>` を出して SIGTRAP で異常終了し、マスクした行は出ず、check の子が残った**（引数・`NODE_OPTIONS`・下線の綴りで同じ。strict と併用すると拒否でも SIGABRT）。`--trace-uncaught`・`--trace-warnings`・`--report-uncaught-exception`・`--report-on-fatalerror`・`--trace-exit`・`--trace-sigint`・`--enable-source-maps`・`--redirect-warnings` は生の値 0、ファイルの書き出し 0
- v0.5.41（ハンドラの前）: 既定のモードの拒否で生の値 2 回・exit 1・子が残る。warn では生の値 1 回（Node の警告）

## 対応の内容（v0.5.44）

- **起動時の拒否**（`src/node-options.ts` の規則を `src/cli.ts` が最初に使う。人間の決定）: `process.execArgv` と `NODE_OPTIONS` を調べ、次のどれかがあれば、コマンドを読まず、check を起動せず、レポートを書かずに、出口から理由の 1 行を出して exit 2（`aiqh verify` のときは、設定の誤りと同じく `VERIFY ERROR (Node option error)` の行も出す）
  - R1: `unhandled-rejections` の設定のうち、モードが `warn` のものが 1 つでもある（後の設定で上書きされていても）
  - R2: `abort-on-uncaught-exception` の名前が出る（否定の `--no-abort-on-uncaught-exception` も）
  - R3: `NODE_OPTIONS` が `unhandled-rejections` を一通りに読めない形で書いている（引用符・`\`・空白以外の区切り・モードの欠け・知らないモード・ほかの形の字句の中の名前）
  - 名前の `-` と `_` は同じに扱う（Node と同じ。実測）。名前とモードは大文字・小文字を区別する（Node と同じ。大文字の綴りや `WARN` では Node 自身が起動しない。実測）
  - Node の解釈（後の指定が勝つ・否定）はまねしない。そのため、安全な形（否定・上書き・引用符付きの安全なモード）まで拒否する。仕様として ADR-0024 に書いた
- **案 (B)（`process.setUncaughtExceptionCaptureCallback`）と (C)（記録だけ）は採らなかった**: (B) は例外の abort を止めるが、strict と併用した拒否では止まらなかった（素の Node の実験）。(C) は生の値が出て子が残る
- **テスト**（先に書き、v0.5.43 の SHA で FAIL を記録してから実装した）: 実際の CLI を起動するテスト 20 件（拒否される 14 の形と、拒否しない対照 6）と、規則だけの単体テスト 57 件。v0.5.43 では CLI のテスト 20 件中 14 件が FAIL（そのうち 10 件は生の値が出た）、単体テストはモジュールが無いので読み込めずに FAIL。対照 6 件は前後とも PASS
- 文書: ADR-0024 に「追記（v0.5.44）」、ARCHITECTURE の §10 の表、README、ROADMAP の項目 20

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（必ず非 0〈2〉で、出口を通って終わるか）**: 一部不適合（B20-R1-001）。通常の経路（`unhandledSeen`・`unexpectedErrorLine`・`tryWriteError`・`process.exitCode = 2`・`process.exit(2)`）は確認できた、とした
- **問い 2（動いている子を片付けるか）**: コード上は片付けを始め、完了を待つ設計。ただし `terminateActiveChildren` の中はパケットに無く、独立には証明できない、とした
- **問い 3（安全弁・判定の確定・シグナルと衝突しないか。二度目の例外）**: 示されたコードの主な経路では妥当。実際のタイミングと SIGTERM 側の動きはパケットだけでは実証できない、とした

## R1 の未確認範囲への対応

レビュアーは、変えていないファイル（`src/runner/execute.ts`・`src/cli-signals.ts`・`src/commands/verify.ts`・`src/cli-program.ts`・`src/output.ts`・ADR-0023）の提供を求めた。R2 のパケットに `--doc` で入れる（人間の決定）。Node v24.13.1 での warn の確認は、上の実測で行った。
