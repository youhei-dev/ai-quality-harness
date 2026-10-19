# m4-dashboard の独立レビュー 1 回目への対応記録（response-r1）— v0.12.1

- 対象レビュー: `docs/reviews/m4-dashboard/review-r1.md`（受領ファイル名 `independent-review-m4-dashboard-r1-for-claude.md`、2026-10-19 受領、4,582 バイト、SHA-256 `e533cbc694b24af973f017cbc23e8114779e798ee0c8f1e8114ce76cee83ee62`、
  LF 35 / CR 0 / TAB 0 / U+FFFD なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: M4 の 2 つめの実装（v0.11.2・v0.12.0）。範囲 `074ebc4d68ef6c41b957ebf9948dbd0569592026..8ccd9943d7520ae25dc82bd261611ec1824318f0`（8 commit、変わったファイル 27 個）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-m4-dashboard-r1.zip`（1,269,386 バイト、SHA-256 `60b3a252842870273a621072f0720493173849e7c1e34181f3fa6b4910cbd690`。中は `review-packet-m4-dashboard.md` の 1 ファイル、1,269,230 バイト、SHA-256 `93e3f0bb312b6b50a20a4843f120d7b3a0e87c7f08de61f53d6fe710f43386a7`）。試しのパケットで所見 0 件、`--exclude` なし
  - 依頼文 `review-request-m4-dashboard-r1.md`（25,604 バイト、SHA-256 `1630cc94bee49a37664c844197be4027947a996efa4c6238833a8ceeb81e0795`。問いは 7 つ。パケットの中にバイト単位で同一で入っている）
- 対応日: 2026-10-19
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（指摘なし）。レビュアーはパケットを静的に読み、コードとテストは実行していない。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に達したので、**m4-dashboard のレビューは R1 で終える**
- **v0.12.0 の `aiqh review-import` でそのまま取り込めた**: v0.12.1 の記録の commit で、`aiqh review-import <受領ファイル> --label m4-dashboard --round 1 --id-prefix M4-B`。exit 0、`High 0 / Medium 0 / Low 0; open 0`、最後の 2 行は `REVIEW LOOP: complete` と `REVIEW IMPORT: written`。source の SHA-256 とバイト数は受領ファイルと一致。`findings` と `previous` は空（この回は label `m4-dashboard` の 1 回目で、前の指摘の評価は、本文の節「前の指摘の確かめ」にだけある）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## 前の指摘の確かめ（レビュアーの評価と、findings への反映）

| 前の指摘 | label | レビュアーの評価 | findings への反映（v0.12.1） |
|---|---|---|---|
| M4-H-R1-001 | m4-history | 解消 | `note` に「m4-dashboard R1 で解消と評価された」を足した（`resolved` のまま。`fixedIn` は v0.11.2 の `69f05bb`） |
| M4-D-R1-004 | m4-design | 解消 | 同じく `note` に足した（`resolved` のまま。`fixedIn` は v0.12.0 の `192e72f`） |
| M4-D-R2-001 | m4-design | 解消 | 同じく `note` に足した（`resolved` のまま。`fixedIn` は v0.12.0 の `192e72f`） |
| M4-D-R2-002 | m4-design | 解消 | 同じく `note` に足した（`resolved` のまま。`fixedIn` は v0.12.0 の `192e72f`） |

- レビュアーの理由の要点
  - M4-H-R1-001: 上限つきの口が、`Safe` にした後の各出力の単位の UTF-8 のバイト数に改行の 1 バイトを足し、上限を確かめた後だけ書く。表の最後の行・`HISTORY INCOMPLETE`・JSON の末尾の改行も対象。境界のテストと、既存のテストの期待値 3 か所の変更も整合する
  - M4-D-R1-004: `HTML_SHOWN` と `HTML_NOT_SHOWN` を明文で持ち、数の本文と `data-k` に JSON のパスを付ける。テストは、数の葉の排他的な分類、表示の値の照合、キーの一意さ、SVG の日ごとのグループと値のある点の数を確かめる
  - M4-D-R2-001: HTML の UTF-8 のバイト数を書く前に確かめ、標準出力のバイトの上限も通ったときだけ `beforeWrite` で `writeAtomic` を呼ぶ。境界と、両方の書かない場合をテストする
  - M4-D-R2-002: `projects.*.checks.*.lastTimeoutSec` は `HTML_NOT_SHOWN` にあり、表示の対象に無い。テストは、その数の目印が HTML に無いことを確かめる
- review-check（v0.12.1 の記録の後。3 つとも exit 0・`REVIEW CHECK: passed`）
  - `--label m4-dashboard`: `REVIEW LOOP: complete`、警告 0
  - `--label m4-history`: `REVIEW LOOP: complete`、警告 0
  - `--label m4-design`: `REVIEW LOOP: complete`、警告 2（前からのもの: M4-D-R1-002・003 は `resolved` で、R2 の評価が「部分的に解消」。m4-history R1 では「解消」）

## 問い 7（M4 の完了条件）への対応

- レビュアーの答え: この範囲では、M4 の完了条件のうち「運用テンプレートが `docs/ops/` にある」が未チェックで、ほかの条件（HTML・JSON・集計・設定のハッシュ）には、実装・テスト・記録の根拠がある。PR の必須の checks の success は、パケットの記録を確かめたが、外の CI の表示を独立には照会していない
- 対応（v0.12.1）: 運用テンプレートを 3 つ入れた（commit `c5811b3`）
  - `docs/ops/rollback.md`: 適用先で aiqh を前の版に戻す（呼び出す側の 40 桁の SHA を前の版に戻す pull request、戻した後の確かめ、aiqh 本体はタグを消さない・動かさない）
  - `docs/ops/monitoring.md`: 見張る項目（必須の check の結果、上限に対する時間の割合〈72%・80%〉、FAIL の率と失敗しやすい check、`configSha256` の変わり目、`HISTORY INCOMPLETE`）と、何を見たら何をするかの表
  - `docs/ops/policy-change.md`: 品質ポリシー（設定）の変更の手順（R-006 の候補 3、人間の決定 D10、ADR-0033 の決定 6）と、守れないこと
- ROADMAP の M4 の完了条件の「運用テンプレート」にチェックを付けた。CI の run の id と結果は、ROADMAP の各版の記録にある（v0.12.0 は PR の run 39185672787・main の run 39186208255）

## 利用者のブラウザでの確かめと、見出しの寄せの直し

- 2026-10-19、利用者が v0.12.0 のダッシュボードをブラウザで開いて確かめた: 表・`<details>` の開け閉め・SVG の図が表示され、CSS が効いていた（CSP の `style-src` のハッシュが、`<style>` の中身と一致していることの確かめ）
- 小さな見た目の点: 「Failure-prone checks」の表で、`project`・`check` の見出しが右寄せになり、左寄せの値とずれていた。v0.12.1 で直した（commit `d837969`。文字の値の列の見出しに `class="name"`。ほかの表の同じずれも同じ決まりで揃えた。ADR-0035 の追記）。レビューの指摘ではない

## 問いへの答えの要約（レビュアー）

1. 指摘なし（最後の行、改行、上限の境界、既定の `console.log` とテストの `log`・`write` の対応、期待値の変更）
2. 指摘なし（対応表、許可リスト、`data-k` の一意さ、SVG の構造と数、HTML のファイルの上限、`lastTimeoutSec` を出さないこと）
3. 指摘なし（`h()` のマスク・禁止文字の表記・文字参照の順、本文と二重引用符の属性だけへの値の挿入、固定の CSS とその SHA-256、CSP の位置、SVG の固定の要素と属性）。`HtmlText` が型の上の規約であることは既知の限界
4. 指摘なし（HTML に出す集計の欄を追い、パス・コマンド・出力・`parsed.items` の名前などの表示は無い。`dashboard:` の行と新しい誤りの文に、書き込み先のパスは無い）
5. 指摘なし（HTML の数え方と `writeAtomic`、両方の上限を通った後にファイルを先に書く順、symlink・ファイルの種類・履歴のディレクトリの確かめ）。書く前後のほかの者による差し替えは、既知の限界
6. 指摘なし（数の葉を対応表か許可リストの一方だけに分けるテスト、同じ入力での数の照合、注入の文字列、出さない欄の目印、SVG の構造、出力の境界）
7. 上の「問い 7 への対応」

## 未確認範囲（レビュアー）

コードとテストの実行。パケットの外の `src/run-history/aggregate.ts`・`src/security/mask.ts`・`src/security/raw-chars.ts`・`tests/structure/output-guard.ts`・fixture と helper の全文、設計 R3 の全文の独立の再検査。`8ccd994` の自己 verify の結果は、パケットの中の記録を見た。ブラウザごとの CSP の効き方、実際の画面、変更を競わせる攻撃は、既知の限界として対象の外
