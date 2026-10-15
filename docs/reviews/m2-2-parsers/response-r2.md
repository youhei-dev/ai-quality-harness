# m2-2-parsers の独立レビュー 2 回目への対応記録（response-r2）— v0.8.1 の後（docs だけ）

- 対象レビュー: `docs/reviews/m2-2-parsers/review-r2.md`（受領ファイル名 `independent-review-m2-2-parsers-r2-for-claude.md`、2026-10-16 受領、3,387 バイト、SHA-256 `4bcd8f443d390e24ac72599f8a6fab833e1575165063d4a392951a21cde4c508`、
  LF 31 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / Security Scan に一致する行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.8.1 = commit a467093a44da5e50297c44d11af19f5adcb6bbca / tag object 2e9d10ec5a88ea9ad836145982d9ab23b079d537、範囲 `v0.8.0..v0.8.1`（5 commit。先頭は R1 の記録の commit `2e7d2b0`。変わったファイル 11）。M2-2-PS-R1-001 の修正（案 A・範囲 S2。ADR-0028 の追記の決定 10・11）
- レビュー用に作って人間に渡したもの（送付は人間が行った）: `aiqh review-packet` のパケット（ラベル `m2-2-parsers`、1,019,110 バイト、SHA-256 `4ee023a506b396455a698a7d28d4ed9f9b9ef796aea6c994a4b4fa97ac5c2130`。`--doc` 15）と、それだけを入れた ZIP（1,019,266 バイト、SHA-256 `cc8e98a7f671a584dad7b8eac139291a8ca2c8701ea467e1195f3374e2f32d3f`）。
  依頼文（15,693 バイト、SHA-256 `032d916e515400746ca6d4ffe32eab2a4945f73858ac0b465c8ac438059c144c`）はパケットの中にバイト単位で同一のまま入っている。問いは 5 つ
- 対応日: 2026-10-16
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（指摘なし）。R1 の M2-2-PS-R1-001 は「解消」。レビュアーはコード・テストを実行していない（静的な読解のみ）
- **High・Medium 0。R2 でレビューを終える**（依頼文に先に書いた基準: High・Medium が 0 なら終える）
- **v0.8.1 の `aiqh review-import` でそのまま取り込めた**（exit 0、`High 0 / Medium 0 / Low 0; open 0`、`REVIEW LOOP: complete`。出力 `findings-r2.json`。source の SHA-256 とバイト数は受領ファイルと一致。`findings` は空、`previous` に R1 の 1 件）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## 取り込みと review-check

取り込みの直後の `aiqh review-check --label m2-2-parsers` の出力（そのまま。終了コード 0、標準エラー出力は空）:

```
aiqh review-check — m2-2-parsers (M2-2-PS), R1 to R2
R1: High 0 / Medium 1 / Low 0; open 0, resolved 1, deferred 0, accepted 0, invalid 0
R2: High 0 / Medium 0 / Low 0; open 0, resolved 0, deferred 0, accepted 0, invalid 0
previous: M2-2-PS-R1-001 (R1, resolved) — R2: 解消
open: none
warnings: 0
REVIEW LOOP: complete
REVIEW CHECK: passed
```

- R1 の状態（`resolved`）と R2 の評価（解消）が合っているので、評価と状態の食い違いの警告は無い
- `previous` の評価の文（そのまま）: 「解消。抽出名は閉じられないコードブロック内に入り、Failure Details の Summary も適切な区切り長と空白処理を持つコードスパンに置かれ、Markdown 構文として解釈される経路を塞いだ。」
- この回で、前の回の評価の突き合わせ（`previous`）が、m2-2-parsers の実データで初めて働いた（`resolved` の `fixedIn` の git への問いは、v0.8.1 で R1 の 1 件を `resolved` にしたときから働いている）
- `findings-r2.json` の実装者の欄: 指摘が 0 件なので、書いたものは無い

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（R1 の指摘）**: 解消。`renderParsed` は名前の各行を 1 つのコードブロックにまとめ、`renderFailure` は `errorSummary` を `codeSpan(oneLine(summary))` に渡している
- **問い 2（区切りを抜ける経路）**: 提示されたコードでは確認できない。`fenceFor` は中のバッククォートの並びより長い区切りを選び、名前の行は `- ` で始まるので閉じの行にならない。`codeSpan` も中の最長の並びより長い区切りで、端のバッククォートと両端の空白の扱いが CommonMark の code span の規則に合う。`oneLine` が改行と禁止文字を表記にする
- **問い 3（ほかのツールの出力から来る文字列）**: stdout・stderr の末尾は従来どおり `fenceFor` のコードブロックの中。Summary は今回の修正の対象。check の名前・コマンド・作業ディレクトリなどの表記上の制約は残るが、依頼文の既知の限界で、新しい指摘にはしない
- **問い 4（JSON・端末・判定・終了コード）**: 差分は実行・判定・JSON の生成・端末の表示を変えていない。追加の `runVerify` の回帰テストも `latest.json`・端末の名前と要約・終了コードを確かめている。verify の PASSED は提出記録の確認で、レビュアーが独立に実行したものではない
- **問い 5（既存の Markdown の読み手）**: `src/review/packet.ts` は Verification を `latest.json` から読み、Parsed Output の Markdown を解析しない。見出しとレポートの基本の構造は保たれ、既存テストの変更も無い。外部のレンダラや提示されていない読み手までの互換は断言しない

## レビュアーの但し書きの受け止め（指摘ではない。決定は変えない）

- **独立の実行はしていない**（コード・テスト・実際のレンダラ・パケットの外のソース。実装者が報告したテスト数と、src を壊す確かめの結果も再現していない）: 依頼文の想定どおり。品質の根拠は、機械で再現できる結果（v0.8.1 の各 commit の単体検証・全テスト 10 回連続・`verify:dist`・CI の `verify (ubuntu)` の success）であり、レビュアーの「問題ない」ではない（プロジェクトの規則）
- **check の名前・コマンド・作業ディレクトリなどの表記上の制約**: ADR-0028 の追記（v0.8.1）の既知の限界のとおり。設定とリポジトリの値（利用者自身のもの）として扱う。直すなら別の項目として決める（この記録では新しい項目を足さない）
- **外部のレンダラ・未提示の読み手との互換**: ADR-0028 の追記の既知の限界（実際のレンダラでの表示は見ていない）のとおり

## 未確認範囲（原文の要約）

コード・テストの独立の実行、GitHub などの実際のレンダラでの表示の確認、パケットの外のソースと実行のログの検査。実装者が報告したテスト数・変異の実験の結果は、独立に再現していない。

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/m2-2-parsers/review-r2.md`（新規。R2 の原文の収録）
- `docs/reviews/m2-2-parsers/response-r2.md`（新規。この記録）
- `docs/reviews/m2-2-parsers/findings-r2.json`（新規。v0.8.1 の `review-import` で取り込んだまま。指摘 0 件なので実装者の欄は無い）
- `docs/adr/0028-output-parsers-display-only.md`: 追記（R2 の後: R2 の結果。決定は変えない）
- `CHANGELOG.md`: v0.8.1 の見出しに commit / tag object の SHA
- `docs/ROADMAP.md`: v0.8.1 の CI の記録、v0.8.1 の後の記録、M2-2 の完了条件の状態、「次:」、終わったレビューの一覧、最終更新の日付
