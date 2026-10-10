# バックログ 16・2・19 の独立レビュー 4 回目への対応記録（response-r4）— v0.5.36 の後（docs だけ）

- 対象レビュー: `docs/reviews/backlog-16-2-19/independent-review-r4.md`（受領ファイル名 `independent-review-backlog-16-2-19-r4-for-claude.md`、2026-10-10 受領、13,608 バイト、SHA-256 `10644b94c3f95526dc6c4e9b2cd932d3c89153a08d53786472b0284a49b4d099`、
  LF 336 / CR 0 / TAB 0 / U+FFFD なし / 禁止文字なし / Security Scan に一致する行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.5.36 = commit 52e923e109eba7622a2fb9f245dce4212fe7552b / tag object f8941d5c1b817153244728e65ee8ff9bb8435085、範囲 `v0.5.35..v0.5.36`（6 commit、13 ファイル）
- レビュー用に作って人間に渡したもの（ChatGPT への送付は人間が行った）: `aiqh review-packet` のパケット（ラベル `backlog-16-2-19-r4`、726,423 バイト、SHA-256 `ced445998e2f5a71ea707531bf4f3c796ac45df852e56df3fba8055d7cd36158`）と、それだけを入れた ZIP（SHA-256 `efeff0961d184d0022a2f73c641affa55cf9b21d35341b637d34c1ddf2494cc6`）。
  依頼文は人間が書いた（7,021 バイト、SHA-256 `5845626e395d090aba791e912337b4291097fd9ef9fccbf4d0ac8aeb2eb84087`。パケットの中にバイト単位で同一のまま入っている）。問いは 2 つに絞った軽いレビュー
- 対応日: 2026-10-10
- 結果（レビュアー）: **指摘なし（High 0 / Medium 0 / Low 0）**。レビュアーは対象コード・fixture・テストを実行していない（静的な読解のみ）
- **レビューのサイクルの終了**: 依頼文に先に書いた基準（High・Medium が 0 なら、このレビューで終える）により、このバックログ（16・2・19）の独立レビューは **R1〜R4 で終える**（人間の判断。下の節）

## 人間の判断（この記録の仕様）

1. R4 は指摘なし。依頼文の基準どおり、R1〜R4 でレビューのサイクルを終える
2. 記録は docs だけの commit 1 つ。版は上げない（0.5.36 のまま）。タグは付けない。push は人間の承認の後
3. CHANGELOG の v0.5.36 の見出しの SHA は、この docs の commit で記入する（次のリリースの予定がまだ無いため）。v0.5.36 の本文は書き換えない
4. 「グループ経路が無い分岐（Windows・pgid なし）」の記述は「Windows」が正確（v0.5.36 の停止ポイント 2 で実装者が気づき、人間が R4 の依頼文に既知の限界として書いた）。ADR-0023 は該当箇所に訂正の注記、過去の記録の `response-r3.md` は本文を書き換えず末尾に訂正の節。`src/runner/execute.ts` の説明の 1 文は、次に `src/` を変えるときに直す（ROADMAP 項目 34）

## 結果と問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（ESRCH を見た番号〈負の pgid・正の pid〉へ、以後何かが届く経路は 0 か）**: レビュアーの答えは「はい」。パケットに全文がある `src/runner/execute.ts` で確認できる範囲では、負の pgid は `gone`、正の leader の pid は `leaderGone` で止まり、
  `groupAlive`・`killTree`・`send`・SIGKILL のタイマー・`terminateActiveChildren`・abort に、それを迂回する経路は見つからなかった。`response-r3.md` の M4 の一覧も、`execute.ts` については実コードとの不一致や漏れが無いとした
- **問い 2（`leaderGone` は、差し替えの無い通常の動きを変えないか）**: レビュアーの答えは「はい」。`leaderGone` を立てるのは、子の pid への直接送信がちょうど ESRCH を返した 1 か所だけで、
  (a) POSIX のグループ EPERM のときの直接送信と、既存の `exitCode`・`signalCode` のガード、(b) Windows の直接送信の通常の形（通常の終了、SIGTERM で止まる、SIGKILL まで進む）は変わらず、(c) ほかの失敗や確認の結果から誤って立つ経路は見つからなかった
- **2 つの問い以外の High・Medium**: 見つからなかった（fail closed の verdict・status・終了コード、確定、`terminationUnconfirmed`、確認の期限を変える `src/` の差分は無い、とした）
- 依頼文で既知の限界として除いた項目は、再指摘していない

## R4 の未確認範囲（原文の「未確認範囲」をそのまま）

指摘なしは、下の範囲での読解の結果である。**問題が無いことが証明されたという意味ではない**。

1. コード・fixture・テストは実行していない
2. 本物の PID / PGID の再利用は再現していない
3. 本物の EPERM は再現していない
4. Linux / Windows の実機では動かしていない
5. `response-r3.md` の M4 の grep の出力は読んだが、パケットに全文が無い未変更のファイル（`src/review/packet.ts`・`src/git/info.ts`・`src/cli.ts`・`src/cli-signals.ts`・`scripts/test-minimal-path.ts`、その他 grep に出た未変更のファイル）の実装の全文は、独立に読み直していない
6. したがって M4 のリポジトリ全体の一覧については、「grep の出力から読める範囲では矛盾なし」までの確認で、別名・計算されたプロパティのアクセスなどを含めた、意味の上での全経路の証明ではない
7. 新しいテストの実際の PASS / FAIL、実時間での安定性、後始末の実際の動きは、実行して確かめていない
8. 依頼文が既知の限界として除いた項目（最初の SIGTERM の前の確認なし、最後の確認から送信までの短い窓、安全弁、Windows のポーリングの起点、別のプロセスグループへ移った子孫、バックログ 5、バックログ 19 の (c)、既知の文書の表現「Windows・pgid なし」）は、再指摘していない

実装者の側の補足（事実）: 1・7 について、v0.5.36 のテストは、リリースの前に、6 commit それぞれの worktree での単体検証と、最終 HEAD での全テスト 10 回連続で PASS した（実装者の手元の記録で、リポジトリには無い。パケットの「Verification」の節は、最終 HEAD の `aiqh verify` の PASSED〈8/8〉を載せている）。2〜4・6 は、R1〜R3 の時点から既知の限界のまま（ADR-0023 の既知の限界）。

## 依頼文の記述の誤り（人間側の誤り）

- **r3 の依頼文**は「R1（v0.5.32..v0.5.33）と R2（v0.5.33..v0.5.34）の原文は、このパケットの docs/reviews/backlog-16-2-19/ に入っています（independent-review-r1.md、independent-review-r2.md、各 response）」と書いていた
  - `aiqh review-packet` が全文を入れるのは、範囲の中で変わったファイルと `--doc` で指定したものだけ。r3 のパケット（`--doc` なし）に入っていたのは、r3 の範囲で変わった `independent-review-r2.md`・`response-r2.md` だけで、R1 の原文と `response-r1.md` は入っていなかった
  - r3 はそのまま渡した。R3 の原文は R1 のファイルが無いことに触れておらず、R1 に触れたのは、パケットに入っていた `response-r2.md` の記録を確かめた箇所だけ。唯一の指摘 B16-R3-001 の根拠にも使っていない
  - 実装者も、r3 のパケットを作ったときに、依頼文の記述とパケットの中身を照らしていなかった
- **r4 の依頼文**の最初の版（6,822 バイト、SHA-256 `ddfeeeca…21ef`）も、「R1〜R3 の原文と判定表は、このパケットの docs/reviews/backlog-16-2-19/ に入っています」と書いていた
  - パケットを作った後の確認で、実装者が食い違いに気づいて止めた。人間が 5 行目だけを「R3 の原文と判定表と `response-r1.md` が入っている。R1・R2 の原文と `response-r2.md` は入っていない」に直した
  - パケットを作り直し、依頼文が「入っている」「入っていない」と書くファイルを、パケットの中身と 1 つずつ照らして食い違い 0 を確かめてから、人間に渡した（上のパケットと ZIP）
- **今後**: 依頼文が「パケットに入っている」と書くファイルは、パケットの中身（変更ファイルの一覧と全文の見出し）と照らしてから渡す。範囲の外のファイルが要るときは `--doc` で入れるか、依頼文の記述を直す

## サイクルを終える判断（人間の判断）

| 回 | 範囲 | 結果 | 対応 |
|---|---|---|---|
| R1 | `v0.5.32..v0.5.33` | High 1（B16-R1-001）/ Medium 1（B16-R1-002）/ Low 0 | v0.5.34（`response-r1.md`） |
| R2 | `v0.5.33..v0.5.34` | High 1（B16-R2-001）/ Medium 1（B16-R2-002）/ Low 0 | v0.5.35（`response-r2.md`） |
| R3 | `v0.5.34..v0.5.35` | High 0 / Medium 0 / Low 1（B16-R3-001） | v0.5.36（`response-r3.md`） |
| R4 | `v0.5.35..v0.5.36` | **High 0 / Medium 0 / Low 0** | この記録 |

- R3 の後は「R1〜R3 で終える」とし、v0.5.36 に r4 を付けるかを停止ポイント 2 の報告を見て決めた（v0.5.36 の CHANGELOG・ROADMAP の記述は、その時点のもの）。v0.5.36 の `leaderGone` が独立したレビューを一度も受けていなかったので、問いを 2 つに絞った軽い r4 を付けた
- R4 で High・Medium・Low がすべて 0 なので、**R1〜R4 で終える**。以後、このバックログの独立レビューは依頼しない

## この記録の commit で変えたもの（docs だけ。`src/`・`tests/`・`package.json`・`package-lock.json` は変えていない）

- `docs/reviews/backlog-16-2-19/independent-review-r4.md`（新規。R4 の原文の収録）
- `docs/reviews/backlog-16-2-19/response-r4.md`（新規。この記録）
- `CHANGELOG.md`: v0.5.36 の見出しに commit / tag object を記入し、「次の release commit で記入」の括弧を消した（本文は変えていない。版の見出しは足していない）
- `docs/adr/0023-unconfirmed-termination-is-not-terminated.md`: 「範囲（v0.5.36 で追記）」の leader の pid の項に訂正の注記、日付の行に追記
- `docs/reviews/backlog-16-2-19/response-r3.md`: 末尾に「訂正（R4 の後）」の節
- `docs/ROADMAP.md`: R4 とサイクルの終了の記録、「次:」の更新、項目 34（`execute.ts` の説明の 1 文）
