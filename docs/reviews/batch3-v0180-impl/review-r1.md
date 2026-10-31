> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch3-v0180-impl-r1-for-claude.md`（2026-10-31 受領、10,844 バイト、LF 74・CR 0・TAB 0・U+FFFD なし・BOM なし・生の文字〈層 (c) を含む〉なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `628509018a429034f3a6f0a65baadad16442421a77f6a29a532cbe4899c65080`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.18.0 の後の記録の branch の `aiqh review-import` でそのまま取り込めた）。

---

# batch3-v0180-impl R1 独立実装レビュー

対象: `45b45d7583e6adb337767a08d462c609d972671e..2e4dab6e2164c0899e4a2f1400de0faecc3dd590`。対象は node:test 出力パーサ、項目 40 の private-key masker 線形化、対応テスト・文書である。実装者の検証記録は独立の成功証明と扱わず、パケットの実コード・差分および固定コミットの設計を区別して評価した。コード・テストは独立実行していない。

## 全体の結論

件数: High 0 / Medium 0 / Low 0

**結論: 静的レビューの範囲で High・Medium はなく、依頼文の終了基準を満たす。** 新規指摘なし。ただし、実行系の検証と適用先 A・B の非公開データの再現はしていないため、実装者が報告した実測・変異試験の実施そのものは独立には確認していない。Node の別バージョンでの出力や、要約の出所の偽装に関する既知の限界も残る。

### 問い 1: 正本との一致

**指摘なし。** `src/parse/node-test.ts` は、切れた stdout の拒否、8 行の同一印・順序・字面の認識、組数の確認、数値・和・終了コードの検証、spec の失敗名に限定した取得を順に実装している。`src/parse/select.ts` は `runsNodeTest` と reporter／出力先の条件を組み合わせ、npm script を一段展開する。`src/security/mask.ts` は private-key について元の regex を実行せず、BEGIN／END の印を前方に探索する。固定コミットの設計 §3・§4、ADR-0028・ADR-0013 の案（最終）と方向・契約が一致する。設計の見込みとの相違4点は、P3 が unparsed を認めるため基準でも PASS、実 Node を使う verify 通し、fixture を安全な字面に置換、検出力強化テストを後続 commit としたもので、契約の緩和ではない。

### 問い 2: B3-D-R1-001（偽の要約）

**解消。** `src/parse/read.ts` の `parseOutputAs` は `exec.stdoutTruncated || stdout.truncated` を必須の `ParserInput.stdoutTruncated` に渡す。`NODE_TEST_PARSER.parse` 冒頭は真なら、要約の走査前に `OUTPUT_TRUNCATED` を返す。stderr の切断は表示用の一般的な `truncated` には反映されるが、node:test の stdout 完全性の判定には混ぜない。`tests/parse-node-test.test.ts` の a〜d2・e18・e21 と窓境界のテストで、runner による切断、解析窓による切断、偽の組、本物の組を分ける。`src/parse/read.ts` は `output-truncated` を既知の理由として通す。切れた出力から偽の要約だけを読む経路は塞がれた。出所を証明できない通常の未切断出力については既知の限界を維持する。

### 問い 3: B3-D-R1-002（2段の認識）

**解消。** `shapeAt` は8行の字面だけを照らし、`blocks` が0・1・複数かを先に決める。1組のみ `countsOf` が1〜15桁の数値・durationの形式・内訳の和・終了コードを確かめる。形に合うが値が不正なら `unexpected-summary`、形に合う組がなければ `no-summary`。`tests/parse-node-test.test.ts` に e01〜e21 と e12b（終了コード不明、失敗なし）の境界を固定する入力がある。TAP を読んだ後に spec 風の失敗一覧が続いても名前を取らない守りも追加されている。

### 問い 4: B3-D-R2-001（大量stdoutの境目）

**解消（限定した解決方針として）。** `tests/parse-node-test.test.ts` は `PARSE_INPUT_MAX` と同じ1,048,576 UTF-16単位のちょうどの入力を parsed、1単位超過とrunner切断を `output-truncated` にする。20,000件の合成実行と10,000件の対照も含む。`src/parse/text.ts` の窓は末尾を残す形であり、先頭が切れたかを `stdout.truncated` として返す。設計 §3.13・§5.3、ADR-0028 の採用追記および README・CONFIG_SPEC に「正常終了でも表示されない」条件を記録し、改善を ROADMAP 項目56として追跡する。**件数を復元したという意味での解消ではない**。今回の受け入れ基準は、誤表示を拒む動作・表示不能の境界・改善項目の記録である。適用先Aの呼び出しSHA更新後のCI検証は別工程なので、このレビューで完了済みとしない。

### 問い 5: 他のパーサへの影響

**指摘なし。** `PARSERS`・`COUNT_KEYS` と `PARSER_TOOLS` に node-test が追加された一方、既存5つのパーサ本体と `src/parse/text.ts` は今回の差分に含まれない。`ParserInput` の必須欄を追加した呼び出しは `parseOutputAs` 一か所で、他のパーサは参照しない。`output-truncated` は `ParseReason` に追加され、`latest.json` と端末・Markdownで理由を示せる。古い history 読み手が新しい `parsed.tool` の値を拒む点は、後方互換の既知の制限として適切に記録されている。別途、出力の完全性を検査する規則を他の5つに広げてはいない。

### 問い 6: 選び方の境目

**指摘なし。** `src/node-command.ts` への `runsNodeTest` 移動と `src/adapters/node.ts` の参照切り替えは検出規則を共有する変更である。`choosesNodeTest` は単純コマンドが1つ、または `cd` の1語を先置きした形のみを認める。`readableReporter` は reporter なし・spec・tap、および出力先なし・stdoutに限定する。ほかの道具が同じコマンドから検出された場合には `several-tools` で選ばない。`tests/parse-select.test.ts` の追加行は選ぶ形と選ばない形を分離している。既知の見落とし方向（実行可能でも限定されたwrapperなどを認識しない）は検出の精度を守る意図的な仕様で、判定には影響しない。

### 問い 7: private-key maskerの同値と線形性

**指摘なし。** `src/security/mask.ts` の `markerEnd` はラベル文字の連続部分を一度進み、最長部分が規定の末尾で終わる場合だけ印とする。開始の印を見つけた後、最初に有効な終了の印を見つけてからその終わりへ進む。終了の印が一つも無ければ、さらに後ろの開始の印でも成立しないため停止する。この流れは正規表現の非貪欲な最初の終了印との一致を説明できる。`tests/regression-item40-private-key-linear.test.ts` は未変更の `SECRET_PATTERNS` にある source と flags を固定した正解regexと、新方式の `maskSecrets` の結果を比較する。固定seedの100,000入力・共有入力・狙った25入力・2件以上の連続一致の検査がある。未終了の開始印の繰り返しなど4形に、256KiBと1MiBのCPU時間比を適用している。実測値は依頼文の記録であり独立再測定ではない。

### 問い 8: 判定・終了コードの不変

**指摘なし。** 新パーサは `readCheckOutput` からの表示用の `ParsedOutput` のみを作る。`parseOutputAs` は不正な結果や例外、時間制限を `unparsed` に変換する。チェック自体の判定と終了コードをパーサから書き換える処理は増えていない。`tests/parse-verify.test.ts` の実NodeでのPASS・FAIL通しと、選ばない形の対照は追加されている。独立のCLI通し実行は行っていない。

### 問い 9: テストの検出力と既存の守り

**指摘なし。** 既存期待値の変更は `tests/history-read.test.ts` の道具別fixtureへのnode-test追加に限られるというパケットの差分説明に整合し、ほかのパーサの既存期待値を緩める変更は見当たらない。P3 はパーサの結果が `unparsed` でも線形性だけを測るため、基準でPASSでも機能検出の試験とは言えないが、`tests/parse-node-test.test.ts` が選択・解析の機能を別途固定している。29の変異に対する実装者の記録は参考情報であり、独立実行の証拠ではない。fixtureの `/work`、`host`、`{ESC}` による置換は、形の検証に必要な制御文字をテスト時に復元するための扱いとして合理的である。

### 問い 10: 文書と記録

**指摘なし。** パケットの ADR-0028・ADR-0013・ADR-0011、CONFIG_SPEC、README、ARCHITECTURE、再利用ワークフローの手順書、ROADMAP、CHANGELOG と findings を照合した。node:test の表示専用・切断条件・既知の限界、private-keyの正規表現の定義を残すこと、古いhistoryとの非互換は実装の契約と整合する。3件を resolved とする状態は、上記の限定的な解消判定に沿う。ただし、PR・CI・非公開適用先の原データを独自に取得して実測値の真偽まで検証したものではない。

### 実際に読めた範囲

- 添付: `review-request-batch3-v0180-impl-r1.md` の依頼文と `review-packet-batch3-v0180-impl.md`。後者の変更ファイル一覧・全文のうち、`src/parse/node-test.ts`、`src/parse/read.ts`、`src/parse/select.ts`、`src/parse/tool.ts`、`src/security/mask.ts`、`src/types.ts`、`tests/parse-node-test.test.ts`、`tests/regression-item40-private-key-linear.test.ts`、`tests/parse-select.test.ts`、`tests/parse-output.test.ts`、`tests/parse-verify.test.ts`、`tests/history-read.test.ts` および関連文書・fixtureの該当箇所を確認した。
- 固定URL: releaseコミット `2e4dab6e2164c0899e4a2f1400de0faecc3dd590` の設計最終版（§3、§4〜§6）、ADR-0028案最終、ADR-0013案最終、設計レビュー R1・R2、`src/parse/text.ts`、`src/runner/execute.ts`、`src/security/patterns.ts`。依頼文の「必ず開く」に列挙されたURLはすべて開いた。ただしGitHubのWeb表示で全行を通読したとは主張しない。

### 読めなかった・読まなかった範囲、未確認事項

- 「必要なら」の `src/run-history/read.ts`、`tests/regex-equivalence-inputs.ts`、時間予算の運用文書、releaseコミットのロックファイル差分については、固定URLを個別に開いていない。関係する実装の説明はパケットの内容を根拠にした。
- パケットの全50ファイルの全行を機械的に検証してはいない。20件のfixture全行や文書全行の完全比較をしていない。
- 実装の独立コンパイル、独立のテスト・変異試験・性能測定、Nodeの複数バージョン／Windows、CIと適用先A・Bの再現、v0.17.1のhistoryの独立実行は行っていない。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch3-v0180-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "findings": []
}
```
