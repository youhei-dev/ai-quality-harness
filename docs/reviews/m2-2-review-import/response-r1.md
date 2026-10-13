# m2-2-review-import の独立レビュー 1 回目への対応記録（response-r1）— v0.6.0 の後（docs だけ）

- 対象レビュー: `docs/reviews/m2-2-review-import/review-r1.md`（受領ファイル名 `independent-review-m2-2-review-import-r1-for-claude.md`、2026-10-13 受領、12,107 バイト、SHA-256 `e6b71a89d0470e084a3effd3dd62a0ced4e0568ec71c0fd959df984a3c106064`、
  LF 99 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / Security Scan に一致する行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）。原文は HTML の名前付きの文字参照（`&hyphen;`）を 2 行に含む（指摘 001 の説明。禁止文字ではない）
- 対象: v0.6.0 = commit c3f454fa7d9a3fc729a1d10f183b907284ed19a4 / tag object cbf5c4e51025a6d8f37127adb2d39b431562913c、範囲 `v0.5.45..v0.6.0`（4 commit、20 ファイル）。`aiqh review-import` v1（ADR-0026）
- レビュー用に作って人間に渡したもの（ChatGPT への送付は人間が行った）: `aiqh review-packet` のパケット（ラベル `m2-2-review-import`、1,222,269 バイト、SHA-256 `5b349564ee73d7c1a83c2caaad430eb74d5d37e8d1b7217bbd4b81c63db90f33`）と、それだけを入れた ZIP（1,222,437 バイト、SHA-256 `eca5162d48221afa87447cf2ff31598c2e2695dcdb6d515e2a94b516bd052d96`）。
  依頼文（11,921 バイト、SHA-256 `f4140f91d5c1468e4fcda0591e38a8b4bb7dd44d9a22f5a23f329493d10f052b`）はパケットの中にバイト単位で同一のまま入っている。新しい依頼文のひな形（`docs/ops/review-request-template.md`）で書いた最初の依頼。問いは 5 つ
- 対応日: 2026-10-13
- 結果（レビュアー）: **High 0 / Medium 3 / Low 0**。レビュアーはコード・テストを実行していない（静的な読解のみ）。依頼文に先に書いた基準（High・Medium が 0 なら終える）に達していないので、v0.6.1 で直し、R2 を依頼する（人間の判断）
- **新しい出力の形は守られていた**: `### <ID>` の見出し 3 つ、8 項目、`## 全体の結論` の件数の行、末尾の `aiqh-findings` の JSON のブロック 1 つ。**v0.6.0 の `aiqh review-import` でそのまま取り込めた**（exit 0、`High 0 / Medium 3 / Low 0; open 3`。出力 `findings-r1.json`。source の SHA-256 とバイト数は受領ファイルと一致）。v0.6.1 で直した後の版では、この原文は名前付きの文字参照（`&hyphen;`）で止まる（[entity]）。それが正しいので、取り込みは直す前の v0.6.0 で行った（人間の決定の段取り ①）

## 判定表

| ID | 重要度 | 判定 | 原因 | 対応（人間の決定） | 根拠 |
|---|---|---|---|---|---|
| M2-2-RI-R1-001 | Medium | **VALID** | ID を探す前の寄せ（`fold()`）が数値の文字参照だけを戻し、HTML の名前付きの文字参照（ハイフンを表すもの）を戻さない。本文に名前付きの参照で書いたその回の ID は検出されず、JSON・見出し・件数の行が合っていれば exit 0 になる（fail open） | 名前付きの文字参照は amp・lt・gt・quot・apos の 5 つだけを許し、ほかが本文か JSON の文字列にあれば exit 2 で何も書かない（新しい誤りの種類 entity）。許した 5 つと数値の参照は ID を探す前に戻す。**同じ種類の穴の予防**として、ID を探す前に HTML のコメントとタグを取り除く（タグを見つけたら止める形は採らない: `Array<string>` のような型の書き方を止め過ぎる）。依頼文のひな形で、文字参照と HTML を使わないよう頼む。行き先: v0.6.1 | `src/review/import.ts` の `fold()` は `&#…;` と `&#x…;` だけを置き換える [コード]。レビュアーの例をそのまま当てると一致しない |
| M2-2-RI-R1-002 | Medium | **VALID** | `writeAtomic` の一時ファイルの名前が `<target>.tmp-<pid>` で予測でき、`writeFileSync` が既存のシンボリックリンクを追う。その名前のリンクが先に置かれていると、リポジトリの外のファイルを書き換えうる（rename が失敗しても戻らない） | 一時ファイルを、同じディレクトリのランダムな名前で排他的に作り（`wx`、使えれば `O_NOFOLLOW`）、その fd に書いて閉じてから rename する。衝突したら別の名前で数回まで試し、失敗したときは自分が作った一時ファイルだけを消す。verify のレポート・履歴の書き込みにも効くので、従来の振る舞いをテストで確かめる。行き先: v0.6.1 | `src/report/write.ts` の `writeAtomic` は `${target}.tmp-${process.pid}` へ `writeFileSync`（既定の flag `w`）[コード] |
| M2-2-RI-R1-003 | Medium | **VALID** | 既存の findings のファイルの `source.sha256` が同じなら、すぐに exit 0 を返し、既存のファイル自身の label・round・idPrefix と、前の回のファイル（ENOENT・読めない・スキーマ・label / round / 接頭辞）を確かめない | 同じ原文の再取り込みでも、それらを通常の取り込みと同じ規則で検査してから exit 0 にする。食い違えば exit 2、何も書かない。行き先: v0.6.1 | `src/commands/review-import.ts` の「already imported」の分岐は、前の回の検査より前で返る [コード] |

- 状態の正本は `docs/reviews/m2-2-review-import/findings-r1.json`（ADR-0026 の D5）。この記録の commit で、3 件の `verdict: "VALID"`・`action`（上の対応の要約）・`destination: "v0.6.1"` を書いた（`status` は `open` のまま）。書いた後のファイルが取り込みと同じ検査（スキーマ）に通ることを、一時のコピーで同じ原文を取り込み直して確かめた（`already imported`、exit 0）
- v0.6.1 で直した後、3 件を `resolved` にし、直した commit と回帰テストを書く（人間の決定の段取り ③）

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（fail open）**: 名前付きの文字参照で書いたその回の ID が漏れる経路がある（001）。ID を書かない指摘などは、依頼文の既知の限界として再指摘しない、とした
- **問い 2（無書き込み・exit 2）**: 通常の食い違い・不正な JSON・大きさ・不正な UTF-8 の拒否は確かめた。一時ファイルのシンボリックリンクで外のファイルを変えうるので、「失敗時に何も書かない」は成り立たない（002）
- **問い 3（文章の漏れ）**: zod の未知の欄の名前を出さない仕組み、`createOutput`、`copyJson(maskSecrets)`、禁止文字の表記を確かめた。レビューの文章を直接出す経路は、収録の範囲では見つけなかった
- **問い 4（open と終了コード）**: `open` の件数が終了コードに影響する経路は無い
- **問い 5（前の回のファイル）**: 実際に調べる分岐は ENOENT だけを無いとする。ただし同じ原文の再取り込みの早期の成功が、前の回の検査を丸ごと飛ばす（003）

## 未確認範囲（原文の要約）

実行・テストの実測、範囲外の `src/cli.ts`・`tests/structure/`・`tests/file-write-sites.test.ts`、テストの生のログ、同時実行や OS ごとの振る舞いの実地の確かめ。パケットの Verification は実装側の記録として見たが、独立には再実行していない。

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/m2-2-review-import/review-r1.md`（新規。R1 の原文の収録）
- `docs/reviews/m2-2-review-import/response-r1.md`（新規。この記録）
- `docs/reviews/m2-2-review-import/findings-r1.json`（新規。v0.6.0 の `review-import` で取り込み、3 件の実装者の欄を書いた）
- `CHANGELOG.md`: v0.6.0 の見出しに commit / tag object の SHA
- `docs/ROADMAP.md`: CI の数え方の表の 3 回目、v0.6.0 の報告の Low の気づき 2 つ、「次:」
