# ADR-0015: review-packet の終了コードは「検査不能 → 検出 → 出力しない判断」の順に決める

- 状態: 採用（ADR-0014 §11 の「finding とエラーの優先順位」〈v0.4.2、M2-1-R2-007〉を置換）
- 日付: 2026-09-25（M2-2、v0.5.0。M2-1 独立レビュー R3 の M2-1-R3-002 / R3-003）
- 改訂: 2026-09-25（v0.5.1。M2-2 独立レビュー R1 の M2-2-R1-001 / R1-007 と、同じ種類の既定の設定ファイルの読み込み）: 決定 1・3・5、表の順位 2・3 の例、影響

## 文脈
v0.4.2（M2-1-R2-007）で「finding とエラーが両方分かっている場合は検出（exit 1）を先にする」と決め、オプションの値の finding は
依頼文・レビューを読む前に、パスの finding は blob を読む前に exit 1 で返していた。独立レビュー R3（M2-1-R3-002）は、その後にしか
分からない「検査そのものができない状態」（読めない `--request` / `--review`、作業ツリー外、解決できない ref、欠けた git object、
読めない `latest.json`）が、exit 1 の完全な検査結果として報告される経路を示した（M2-2 の SP1 で 14 の組み合わせを実コードで再現）。
逆向きに、`--cwd` の禁止文字と `--label` の形の誤りは中身の検査の前で止めていたため、中身・パスの finding が exit 2 に隠れていた
（ADR-0014 §11 の「`--cwd` のパスの禁止文字は finding が 1 件も無いときだけ exit 2」という記述とも一致していなかった）。
また、JSON として壊れた `latest.json` は中を検査せずに exit 2 にしていた（M2-1-R3-003）。

## 決定
1. **原則**: exit 1 は、すべての入力の取得と検査を終えた後にだけ返す。ただし、finding を持つ値に依存する検査は、その finding で
   塞がれたものとして除く。依存する検査とは、その値、またはその値から得た結果（`--range` なら解決した SHA）を、git の引数・pathspec・
   ファイルパス・検査の入力に使う処理である。それ以外（作業ツリーの確認、root の取得、依頼文・レビュー、`latest.json` の読取・復号・
   JSON かどうか、範囲に依存しない導出値、`--label` があるときの既定の出力名）は、finding があっても行う（v0.5.1、M2-2-R1-001）。
   検査そのものができない場合は、finding があっても exit 2 とし、それまでの finding を「検査が完了していないため一覧は不完全」と明記して出す
   （値は出さない。`--json` は `"result": "error"` と `findings`）。検査はできたが出力しないと判断した場合は、finding が無いときだけ exit 2。
2. **優先順位**（`src/review/outcome.ts` の `EXIT_PRIORITY` と、判定を 1 か所で行う `decideOutcome`）:

   | 順位 | 分類 | 例 | exit |
   |---|---|---|---|
   | 1 | 使い方エラー（commander） | 未知のオプション、`--range` なし、正でない `--max-*-bytes` | 2 |
   | 2 | 検査の設定の誤り | `--config` が無い・読めない・不正、既定の設定ファイルが読めない（ENOENT 以外。v0.5.1）・不正 | 2 |
   | 3 | 検査不能（`InspectionError`） | 読めない `--request`・`--review`・標準入力、作業ツリー外、`--range` の形の誤り（`..` が無い、`...`）、ref が解決できない・祖先でない・commit なし、git の失敗（object の欠損、タイムアウト、出力の上限）、差分が空、`latest.json` が読めない（ENOENT 以外。v0.5.1 から親を辿れない・親がファイル・ループも） | 2 |
   | 4 | finding | オプションの値、パス、変更ファイルの中身と差分、commit メッセージ、依頼文、レビュー、`--doc`、`latest.json`（壊れたものは全文）、導出値、組み立て後、既定の出力名 | 1 |
   | 5 | 出力しない判断（`DeferredError`） | 変更ファイル・`--doc` の上限超過、`--doc` がファイルでない、`latest.json` が JSON でない・形が違う、パケットの上限超過、`--label` の形、解決した `--cwd`・`-o`・`--zip-output` の禁止文字、出力名の形、同じ実体（早い段階） | 2（finding が無いときだけ） |
   | 6 | 書き込みの失敗 | 準備・確定の失敗、戻し処理 | 2 |

3. **塞がれた値**: finding を持つ値は、文字列でない `Rejected`（`src/review/checked.ts`）になる。git に渡す処理・形の検査・描画は
   `Checked` だけを受け取るので、塞がれた値を渡すとコンパイルエラーになる。`--range` が Rejected なら、範囲の値とその結果を使う処理だけを
   飛ばす: 形の検査、ref の解決、祖先の確認、commit の一覧、変更ファイル・パス・差分・中身、commit メッセージ、`--doc` の `<to>` での lookup、
   `latest.json` と `<to>` の照合とそれで決まる値の検査、範囲から導く値（既定のラベルを含む）。作業ツリーの確認と root の取得、依頼文・レビュー、
   `latest.json` の読取・復号・JSON でない場合の全文検査、aiqh の版と `git --version`、`--label` があるときの既定の出力名は行う
   （v0.5.1、M2-2-R1-001。v0.5.0 までは git の処理をすべて飛ばしていたため、作業ツリー外や読めない `latest.json` が exit 1 の完全な結果に隠れた）。
   `--doc` が Rejected ならその文書の lookup だけ、パスが Rejected ならその変更の pathspec による
   差分だけを飛ばす（blob は id で取得して中身を検査する。finding の出所にはパスを含めず `(path of git diff --raw entry N)` とする）。
   `--label` が Rejected なら形の検査をしない。`--exclude` の照合は、検査前の値でメモリの中だけで行う（git に渡さない）。
4. **描画**: 描画は finding が無いときだけ行う。組み立て後の検査（全体の 2 回目）の finding も exit 1、パケットの上限超過は出力しない判断。
   描画の直前に値を `settled()` で `Checked` に絞り、Rejected が残っていれば内部エラー（exit 2、fail closed）にする。
5. **`latest.json`**（M2-1-R3-003）: 読めなければ検査不能（`cannot read artifacts/verification/latest.json: <code>`）。読取は `readFileSync()` を
   直接行い、ENOENT（ファイルまたは親が無い）だけを「無い」とする。それ以外の失敗（EACCES、ENOTDIR、EISDIR、ELOOP など）は検査不能
   （v0.5.1、M2-2-R1-007。v0.5.0 までは `existsSync()` が false を返すものをすべて「無い」とし、exit 0 で「does not exist」と書いた）。JSON でない場合、
   または `<to>` の clean な結果として描画するのに形（zod の `safeParse`: `tool` がオブジェクト、`checks` がオブジェクトの配列）が
   合わない場合は、読めた文字列全体を生文字と秘密の形で検査してから、出力しない判断にする。オブジェクトでない場合や `git` が無い・null
   の場合は、従来どおり「No verify result」とする。
6. **宣言された規則による除外**: `--exclude`・lock・binary・submodule・上限超過で中身を読まなかったファイルは、exit 1 の保証
   （完了した検査の結果であること）の外にある。上限を上げれば finding が増え得る。

## R2-007（v0.4.2）の決定との関係
`docs/reviews/m2-1/response-r2.md` の「finding とエラーが同時に起きうる箇所」の表のうち、変わったのは次の行だけである。

| R2-007 の行 | v0.4.2 | v0.5.0 |
|---|---|---|
| 依頼文・レビューのファイル名の finding と、そのファイルが読めない | 1（名前の検査は読む前） | 2（検査不能。名前の finding は不完全な一覧として出す） |
| `-o` のファイル名の finding と中身の上限超過など | 1（git を動かす前に検査） | 上限超過は 1、git の失敗などの検査不能は 2 |

新しく決めた組み合わせ: 中身・パスの finding と `--cwd` の禁止文字 → 1（v0.4.4 は 2）、中身・パスの finding と `--label` の形の誤り → 1
（v0.4.4 は 2）、オプションの finding と `--range` の形の誤り（値そのものは通常）→ 2（v0.4.4 は 1）。
その他の行（パス・中身の finding と上限超過、オプションの値の finding と `--cwd` の禁止文字、同じ値の finding と形式の誤り、
finding と書き込み先の問題、組み立て後の finding と上限、コマンドライン・設定・git の失敗）は変わらない。

## 代替案
- 早期 return を残し、その直前に取得できるかの先読みを足す: 列挙した条件（読込、ref、object の存在）だけを確かめるので、壊れた pack、
  差分の取得の失敗、タイムアウト、空の差分が漏れる（M2-1 の教訓「列挙した経路だけ直すと別の経路が漏れる」）
- 取得 → 検査 → 判定 → 描画への全面的な組み替え: 保証は最も強いが、変更が packet.ts の全体に及ぶ。判定を 1 関数に集め、塞がれた値を
  型（`Rejected`）で扱う形で、同じ性質（途中で exit 1 を返さない、塞がれた値を git に渡さない）を得た
- 値の形の使い方エラー（`--cwd` の禁止文字、`--label` の形、出力先）をすべて最初に exit 2 にする: 検査を妨げないので、R2-007 の原則
  （検出が先）に合わせて出力しない判断とした

## 影響
- 終了コードが変わる組み合わせ（M2-2 SP1 の再現）: オプションの値・パスの finding と検査不能の 14 通りが 1 → 2、中身・パスの finding と
  `--cwd` の禁止文字・`--label` の形の誤りが 2 → 1
- `--json`: 検査不能のとき、`"result": "error"` で `findings` が空でないことがある
- 既存テストの期待値の変更: `tests/regression-m2-1-r2-007-findings-before-errors.test.ts` の 1 件（ファイル名の finding + 読めない
  `--request` が 1 → 2）
- 回帰テスト: `tests/regression-m2-2-r3-002-exit-priority.test.ts`（SP1 の再現ケースと表）、`tests/regression-m2-2-r3-003-latest-json.test.ts`
- v0.5.1 で終了コードが変わる組み合わせ: 読めない `latest.json`（ENOENT 以外）が 0 → 2、読めない既定の設定ファイル（ENOENT 以外。review-packet と
  security-scan は同じ関数 `loadSecurityConfig` で読む）が 0 → 2、Rejected の `--range` ＋ 範囲に依存しない検査不能が 1 → 2。回帰テスト:
  `tests/regression-m2-2-r1-007-unreadable-parent.test.ts`、`tests/regression-m2-2-r1-config-read.test.ts`、
  `tests/regression-m2-2-r1-001-rejected-range-preflight.test.ts`。Checked の `--range` の経路は順序を変えず、v0.5.0 と同じ入力のパケットの SHA-256 が一致した
- パケットの組み立ては変えていない: 版の表記が同じ状態（`package.json` 0.4.4）で、v0.4.4 と M2-2 の実装から同じ範囲・入力（`v0.4.3..v0.4.4`、`--request`・`--review`・`--doc`・`--zip`）で作ったパケットと ZIP の SHA-256 が一致した
