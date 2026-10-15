# m2-2-parsers の独立レビュー 1 回目への対応記録（response-r1）— v0.8.0 の後（docs だけ）

- 対象レビュー: `docs/reviews/m2-2-parsers/review-r1.md`（受領ファイル名 `independent-review-m2-2-parsers-r1-for-claude.md`、2026-10-15 受領、6,050 バイト、SHA-256 `c29657780c0b913073e3e0c31974fd8a8240f20014fd27dd0c3fe4dfed6a6200`、
  LF 51 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / Security Scan に一致する行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.8.0 = commit 89475fa2937f52498252ecd0d5b77c95e3288bfa / tag object 7572eb78f343d13f66650fa0b273eba5ce8431d7、範囲 `v0.7.0..v0.8.0`（7 commit。先頭は m2-2-review-check R1 の記録の commit `91ee0fc`。変わったファイル 43）。出力パーサ（ADR-0028）と key-value 誤検出の記録の定義（ADR-0029）
- レビュー用に作って人間に渡したもの（送付は人間が行った）: `aiqh review-packet` のパケット（ラベル `m2-2-parsers`、1,385,790 バイト、SHA-256 `9f00eb49505aa24a57d3d64bcb583c213996edcebd80ac244013dff3480247a3`。`--doc` 14）と、それだけを入れた ZIP（1,385,946 バイト、SHA-256 `0cdff908244b0a479afac0de90327182c974a402260f317b4a90d268a0a2cff9`）。
  依頼文（17,215 バイト、SHA-256 `6642c47543e0d8e00d43896223e26fb5e52f1f17416688afd940d88d6d773e82`）はパケットの中にバイト単位で同一のまま入っている。問いは 5 つ
- 対応日: 2026-10-15
- 結果（レビュアー）: **High 0 / Medium 1 / Low 0**。レビュアーはコード・テストを実行していない（静的な読解のみ）。依頼文に先に書いた基準（High・Medium が 0 なら終える）に達していないので、**直して R2 を依頼する**。直し方・範囲・行き先（版）は**人間の決定待ち**（下の「人間に決めてほしいこと」）
- 取り込み: v0.8.0 の `aiqh review-import` でそのまま取り込めた（exit 0、`High 0 / Medium 1 / Low 0; open 1`、`REVIEW LOOP: incomplete (open 1)`。出力 `findings-r1.json`。source の SHA-256 とバイト数は受領ファイルと一致）。続けて `aiqh review-check --label m2-2-parsers`（exit 0、`open: M2-2-PS-R1-001`、警告 0、`REVIEW LOOP: incomplete (open 1)`）

## 判定表

| ID | 重要度 | 判定 | 原因 | 対応 | 根拠 |
|---|---|---|---|---|---|
| M2-2-PS-R1-001 | Medium | **VALID** | latest.md の `## Parsed Output` の名前の一覧は、ツールの出力から読んだ名前（マスク・長さの制限・禁止文字の表記だけを通したもの）を Markdown のリスト項目にそのまま入れる。Markdown の行内の構文（リンク・画像・インライン HTML・文字参照・強調・行内のコード・自動リンク）が解釈されうる | 直し方の案は下（推奨: check ごとの名前の一覧を fence の中に置く）。**直し方・範囲・行き先は人間の決定待ち**。`status` は `open` のまま | `renderParsed`（`src/report/markdown.ts` 89〜114 行）の 109 行目が `` `- ${oneLine(item.kind)}: ${oneLine(item.name)}` `` で、`oneLine`（179〜181 行）は `escapeRawChars` を返すだけ [コード]。手元で再現した（下） |

- 状態の正本は `docs/reviews/m2-2-parsers/findings-r1.json`（ADR-0026 の D5）。この記録の commit で、`verdict: "VALID"` と `note`（案の置き場所・人間の決定待ち・行番号の食い違い・同じ形の既存の行）を書いた。`status` は `open`、`action`・`destination` は人間の決定の後に書く（`docs/ops/review-loop.md` の段取り 6: 人間の判定のとおりに書く）
- 書いた後のファイルが取り込みと同じ検査に通ることを、一時のコピーで同じ原文を取り込み直して確かめた（`already imported (same source); nothing written`、exit 0、コピーは変わらない）。review-check も exit 0・警告 0

## 判定の根拠

- **コード**: `ItemList.add` → `nameOf`（`src/parse/text.ts` 116〜119 行）は、行全体を `maskSecrets` にかけてから 300 文字に切るだけ。レポートの写し `copyJson(report, maskSecrets)`（`src/report/build-report.ts`）もマスクだけ。`renderParsed` は名前を `oneLine`（禁止文字と LF・TAB の表記）だけでリスト項目に入れる。Markdown の構文を止める処理はどこにも無い
- **再現**（v0.8.0 のコードを変えずに。`tmp/wave3/ps-r1/scripts/repro.ts`、git 管理外）: vitest の失敗の節（`Failed Tests`）に 7 つの名前を置き、`parseOutputAs("vitest", …)` → `buildReport` → `renderMarkdown` を通した。7 件とも `parsed` で、`### unit — vitest` の下に次の行がそのまま出た（下は latest.md の行の写し。ここではコードブロックの中に置いた）

  ```text
  - failed-test: tests/a.test.ts > link [details](https://example.invalid/path)
  - failed-test: tests/a.test.ts > image ![x](https://example.invalid/i.png)
  - failed-test: tests/a.test.ts > html <img src="https://example.invalid/i.png">
  - failed-test: tests/a.test.ts > reference &#x202E;abc
  - failed-test: tests/a.test.ts > emphasis **bold** _it_
  - failed-test: tests/a.test.ts > code `x`
  - failed-test: tests/a.test.ts > autolink https://example.invalid/bare
  ```

- **表示のされ方**（CommonMark 0.31.2 と GFM の読み方。実際のレンダラでは表示していない。依存関係を足さないため [仕様からの推定]）: リスト項目の中の段落なので、リンク・画像（表示のときに外の URL を読みに行くレンダラがある）・インライン HTML・強調・行内のコード・GFM の自動リンクとして解釈される。
  **数値の文字参照は表示のときに文字に戻る**ので、`&#x202E;` は U+202E（双方向の制御文字）として表示され、禁止文字の表記（P4。`escapeRawChars` は文字そのものしか見ない）をすり抜ける（レビュアーの例に無い点。結論は同じ）
- **当たらないところ**: 端末（`consoleLines`）は Markdown として読まれない。`latest.json` は値であり、レビュアーの修正案のとおり変えない。review-packet の Verification の節は `parsed` を描かない（`RENDERED_REPORT` の zod の object が知らないキーを捨てる）
- **同じ形が v0.8.0 より前からある**: Failure Details の `- Summary:` の行（`errorSummary`。`exit code N: <stderr か stdout の最初の意味のある行>`。M0 から。`src/runner/run-checks.ts` の `summarizeFailure`）も、ツールの出力の 1 行を同じ形で入れる。同じスクリプトで `` - Summary: exit code 1: see [here](https://example.invalid/s) `` がそのまま出た。レビュアーも「同様の構文処理は既存のほかの値にも存在する」と書いている。Command・cwd・check の名前は設定の値（利用者自身のもの）
- **行番号の食い違い**: 原文の target の行番号（`markdown.ts:104-117,181-185`、`text.ts:130-133`）は v0.8.0 のファイルと合わない（`renderParsed` は 89〜114 行、`oneLine` は 179〜181 行、`nameOf` は 116〜119 行）。指している関数は合っているので、判定には影響しない

## 直し方の案（推奨を先に）

### 案 A（推奨）: check ごとの名前の一覧を fence の中に置く

- 内容: `renderParsed` の名前の一覧（`- <kind>: <name>` と `- … N more (not listed)` の行）を、出力の末尾（`renderFailure` の stdout / stderr）と同じく、`fenceFor`（一覧の中の最も長いバッククォートの並びより 1 つ長く、3 以上）で囲んだコードブロック（info string `text`）に置く。各行の文字は今と同じ（`oneLine` の表記もそのまま）
- 効く理由: CommonMark のコードブロックの中は文字のまま（リンク・画像・HTML・文字参照・強調・自動リンクのどれも解釈されない）。コードブロックを閉じられるのは、行頭（空白 3 つまで）に fence 以上の長さのバッククォートの並びがある行だけで、一覧の行はどれも `- ` で始まる。fence はどの並びより長い。名前は `oneLine` で 1 行（LF は表記になる）
- 守るもの: `latest.json` の値・端末・判定・終了コード・`schemaVersion` は変えない（P1・P9）。依存関係を足さない（P8）。既存の部品（`fenceFor`）を使う。名前の範囲・順・件数は同じ（レビュアーの「表示する名前の範囲を変えない」）
- 表示の変化: latest.md の名前の一覧が、箇条書きからコードブロック（等幅の文字）になる
- 先に書くテスト（新規 `tests/regression-m2-2-ps-r1-001-markdown-names.test.ts`）:
  1. リンク・画像・インライン HTML・HTML のコメント・名前付きと数値の文字参照・強調・取り消し線・バッククォート（1・3・6 の並び）・山括弧の自動リンク・裸の URL・バッククォート 3 つで始まる名前を vitest の失敗の節に置き、`renderMarkdown` の出力で、各名前の行が、開きの fence（3 以上、名前の中の最長の並びより長い）と同じ長さの閉じの fence の間にあり、間のどの行も fence を閉じない（行頭に fence 以上のバッククォートの並びが無い）ことを、行の構造で確かめる（レンダラを足さない: P8。既存の `tests/regression-backlog9-report-file-notation.test.ts` の `outsideFence` と同じ考え方）
  2. fence の外に、名前の構文（リンクの開き・画像の開き・`<img`・`&#x202E;` など）が 1 つも無い
  3. 対照: `latest.json` の `items[].name` は今と同じ（マスクだけ）。端末の `parsed:` の行の下の名前も今と同じ
  4. `runVerify` を通した端から端の 1 件（偽の vitest が上の名前を出す。`tests/parse-verify.test.ts` の作り方）
  - v0.8.0（`89475fa`）では 1・2・4 が FAIL、3 が PASS になる見込み。直す前の FAIL を記録してから直す。src をわざと壊す確かめ（fence を外す・fence の長さを最長の並びと同じにする）も行う
- 影響する範囲: `src/report/markdown.ts`（`renderParsed` だけ）、新しいテストのファイル 1 つ、文書（ADR-0028 の追記〈決定 8 の Markdown の形〉・`docs/ARCHITECTURE.md` の latest.md の説明・CHANGELOG・ROADMAP）
- 既存テストの期待値: **変えない見込み**。名前の一覧を見る既存のアサーション（`tests/parse-verify.test.ts` 133・155・156 行、`tests/parse-security.test.ts` 122 行）は行の部分一致で、fence の中にも同じ文字の行が残る [grep で確かめた。実行では未確認]。変える必要が出たら止めて確かめる
- `tests/structure/`: 触れない。原則 P1〜P9: P4 を強める。ほかは変えない（P5 設定の欄を足さない・P8 依存関係を足さない・P9 JSON は同じ）。ADR-0026 の決定: 触れない（review-import・review-check は変えない）。ADR-0028 の決定 8（Markdown の形）は追記で変える

### 案 B: 名前ごとに行内のコード（code span）にする

- `` - <kind>: `<name>` ``（区切りは名前の中の最長の並びより長いバッククォート。名前の端がバッククォートなら空白を挟む）。行内のコードの中も解釈されない
- 欠点: **既存テストの期待値が 2 つ変わる**（`tests/parse-verify.test.ts` 155 行の `- failed-test: a | b`、`tests/parse-security.test.ts` 122 行の `- oversized-candidate: cand.txt:1 url-credential`。名前の前にバッククォートが入る）。行内のコードは、両端に空白があると 1 つずつ落とすので、名前の見え方が元と変わる場合がある

### 案 C: Markdown のメタ文字をバックスラッシュでエスケープする（レビュアーの修正案の字義どおりの形）

- バックスラッシュ・バッククォート・`*`・`_`・`[`・`]`・`<`・`>`・`&`・`!`・`~` などの前に `\` を置く（`escapeRawChars` の前）。箇条書きの形は残る
- 欠点: 止める構文を数え上げる形（拒否リスト）で、漏れが残りやすい（GFM の裸の URL の自動リンクは、`:` や `.` までエスケープしないと止まらない）。マスクの `[REDACTED:<分類>]` や vitest の名前の区切り `>` にも `\` が付き、latest.md を文字として読む人・AI には読みにくくなる。**既存テストの期待値が 1 つ変わる**（`tests/parse-verify.test.ts` 133 行の名前の中の `>`）

### 範囲

- **S1**: 001 の範囲（名前の一覧）だけを直す。`- Summary:` の行は ROADMAP の新しい項目に記録して後で扱う
- **S2（推奨）**: 同じ版で `- Summary:` の行も、行内で解釈されない形にする（同じ latest.md の、ツールの出力の 1 行をそのまま入れる経路。M2-2-RI-R1-001 で、同じ種類の穴の予防として HTML のコメントとタグも取り除いた前例がある）。1 行の値なので、区切りの安全な行内のコード（案 B の部品）にする。
  既存のアサーション（`tests/markdown.test.ts` の `exit code 1: 3 tests failed` の部分一致、`tests/regression-backlog9-report-file-notation.test.ts` の「`## INJECTED-SUMMARY` で始まる行が無い」）は変わらない見込み [grep で確かめた。実行では未確認]。M0 からの Failure Details の見た目が変わる。先に書くテストは案 A の 1・2・4 と同じ形（`errorSummary` に同じ構文を入れる）

## 人間に決めてほしいこと

1. 直し方: 案 A（推奨）・案 B・案 C のどれか
2. 範囲: S2（推奨）か S1
3. 行き先（版）: 案は v0.8.1（パッチ。`schemaVersion`・JSON・判定は変わらない）。その後、R2（label `m2-2-parsers`、round 2、範囲 `v0.8.0..v0.8.1`）を依頼する

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（判定・終了コード・継続）**: `toCheckResult` は状態と既存の欄を決めた後で `readCheckOutput` を呼ぶ。`parseOutputAs` はパーサの例外と協調的な時間切れを `unparsed` にし、`computeVerdict` は `parsed` を見ない。結果を書き換える経路は認めない。同期の入出力が止まらない場合を含む、あらゆる環境での完了の保証までは立証できない
- **問い 2（線形・上限）**: 各ストリームの末尾 1 Mi（UTF-16 のコード単位）、4,096 を超える行は読まない、件数の桁の制限、名前 50 件をコードで確かめた。`Budget` は 1,024 行ごとの協調的な確かめで、準備の処理や同期のファイルの読みを強制的に止める絶対の上限ではない。masker の既知の超線形（項目 40）は新しい指摘にしない
- **問い 3（マスク・表記）**: `nameOf` は行全体をマスクしてから切る。端末は `createOutput`、レポートはマスク済みの `copyJson` を通る。一方、Markdown の構文の解釈を止めない新しい経路がある（001）
- **問い 4（パーサの選び方）**: `selectParser` はコマンドを読むだけで変えない。候補が複数なら `not-applicable`、読めない package.json は `unparsed`。語による推定の誤りは依頼文の既知の限界の範囲。中・高の重要度の問題はほかに見つけていない
- **問い 5（互換）**: `schemaVersion: 1` と最上位のキーは同じで、新しい欄は各 check の中だけ。`src/review/packet.ts` に、新しい欄のために失敗する読み方は無い。収録の外の利用者までの互換は保証しない

## 未確認範囲（原文の要約）

パケットに無い `src/cli.ts`・設定の読み込み・`tests/structure/`、外部のレポートの利用者、実際の全テストのログ、実行時間の実測、Windows。実行を伴う再現のテストは行っていない。新しい High・Medium の判定に直結する追加の資料の要求は無い。

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/m2-2-parsers/review-r1.md`（新規。R1 の原文の収録）
- `docs/reviews/m2-2-parsers/response-r1.md`（新規。この記録）
- `docs/reviews/m2-2-parsers/findings-r1.json`（新規。v0.8.0 の `review-import` で取り込み、`verdict`・`note` を書いた。`status` は `open`）
- `CHANGELOG.md`: v0.8.0 の見出しに commit / tag object の SHA
- `docs/ROADMAP.md`: v0.8.0 の CI の記録、v0.8.0 の後の記録、「次:」、最終更新の日付
