# batch3-v0180-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.18.0 の記録

- 対象レビュー: `docs/reviews/batch3-v0180-impl/review-r1.md`（受領ファイル名 `independent-review-batch3-v0180-impl-r1-for-claude.md`、2026-10-31 受領、10,844 バイト、SHA-256 `628509018a429034f3a6f0a65baadad16442421a77f6a29a532cbe4899c65080`、
  LF 74 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 層 (c) の文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし / URL なし / レビュアーの側の作業場所を指すリンク〈`sandbox:`〉の行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.18.0（batch3 の 2 版目: node:test の出力パーサ〈ADR-0028 の決定 14〉と項目 40〈ADR-0013 の追記〉。判定と終了コードは変わらない）。範囲 `45b45d7583e6adb337767a08d462c609d972671e..2e4dab6e2164c0899e4a2f1400de0faecc3dd590`（7 commit、変わったファイル 50 個。merge の commit は含めない。始まりは v0.17.1 の後の記録の PR #25 を入れた main）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-batch3-v0180-impl-r1.zip`（1,593,046 バイト、SHA-256 `884e8aed1d2946d7a591e3ca556584c3c26eadfc5a03599682038562d0d4fd84`。中は `review-packet-batch3-v0180-impl.md` の 1 ファイル、1,592,880 バイト、SHA-256 `18ca1692fa4684b1b7f8e1a343640d8272af3c5c8c5233422d34c9a3f75ba5fc`。パケットはロックファイルの全文と差分を出さない。この範囲で `package-lock.json` が変わったのは、ルートの 2 つの `version`〈0.17.1 → 0.18.0〉だけ）
  - 依頼文 `review-request-batch3-v0180-impl-r1.md`（30,653 バイト、SHA-256 `671da7ace9fe5453b1a2b98dbc71fe9d6858876068ee61e72b8430aa6161beff`。問いは 10、読むときの固定の URL は「必ず開く」8 項目〈URL では 10 本〉と「必要なら」4 項目。パケットの中にバイト単位で同一で 1 回入っている）
- 対応日: 2026-10-31
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（新しい指摘なし）。レビュアーはパケットと「必ず開く」の固定の URL を静的に読み、コード・テストは実行していない。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に達したので、**batch3-v0180-impl のレビューは R1 で終える**
- **判定: 新しい指摘 0 件。受け入れ**（人間の決定 2026-10-31）
- **`aiqh review-import` でそのまま取り込めた**: v0.18.0 の後の記録の作業で、`aiqh review-import <受領ファイルの写し> --label batch3-v0180-impl --round 1 --id-prefix B3-I180`（写しは受領ファイルと SHA-256 が同じ。aiqh は 0.18.0。追跡外の作業場所の `docs/reviews/` に書き、この記録の branch の commit で写した）。exit 0、`High 0 / Medium 0 / Low 0; open 0`、最後の 2 行は `REVIEW LOOP: complete` と `REVIEW IMPORT: written`。件数の行（禁止文字・層 (c)・秘密の形）は出なかった。取り込みの前に、写しを取り込みの検査の本体 `readReview`（ファイルに触れない関数）で確かめた（問題 0 件、指摘 0 件）。`findings` と `previous` は空（label `batch3-v0180-impl` の 1 回目。1 回目は `previous` を持てないので、batch3-design の 3 件の評価は、問い 2〜4 の本文に書いてもらった）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## 判定表

指摘が 0 件なので、判定・対応・`fixedIn` は無い（findings の実装者の欄に書くものも無い）。

## batch3-design の 3 件の評価（問い 2〜4）

v0.18.0 で `resolved` にした設計の指摘 3 件（`fixedIn` は `bc4c023`）について、レビュアーの評価を、batch3-design の findings の `note` に書き足した（`status` は `resolved` のまま。v0.17.0・v0.17.1 の記録と同じ形）。

| ID | 問い | レビュアーの評価（要旨） |
|---|---|---|
| B3-D-R1-001（偽の要約） | 2 | **解消**。runner の切れと読む窓の切れを `stdoutTruncated` で渡し、真なら要約を走査する前に `output-truncated` を返す。切れた出力から偽の要約だけを読む経路は塞がれた。stderr の切れは表示用の `truncated` に入るが、stdout の完全性の判定には混ぜない。切れていない通常の出力について、要約の出所を証明できない点は既知の限界のまま |
| B3-D-R1-002（2 段の認識） | 3 | **解消**。8 行の字面だけで組が 0・1・2 以上かを先に決め、組が 1 つのときだけ値（1〜15 桁・`duration_ms` の形・和・終了コード）を確かめる。e01〜e21 と e12b が境目を固定する。TAP を読んだ後に spec 風の失敗の一覧が続いても名前を取らない守りもある |
| B3-D-R2-001（大きな stdout の境目） | 4 | **解消（限定した解決方針として）**。**件数を取り戻した（復元した）という意味の解消ではなく、決めた方針としての解消**（レビュアーの書き方）。この版の受け入れの基準は、誤った表示を拒む動作・表示できない境目（1,048,576 UTF-16 単位ちょうどで `parsed`、1 単位上と runner の切れで `output-truncated`）・改善策の記録（ROADMAP の項目 56）。適用先 A の呼び出しの SHA を上げた後の CI での確かめは別の工程なので、このレビューでは完了済みとしない |

- 設計 §5.3 の受け入れの基準 3（適用先 A の CI の unit の行の下に `parsed: node-test` の行が出る。`output-truncated` ではない）は、レビュアーの言う別の工程として、このレビューの後の H11 の 4 回目（適用先 A・B の呼び出しを v0.18.0 に上げた回。merge は人の手）で確かめた。結果は、この記録の PR で ROADMAP と CHANGELOG の v0.18.0 の項に書いた。これはレビュアーの評価ではなく、実装者の側の記録

## レビュアーの判定の要約（実装者の評価ではない）

問い 1〜10 は、どれも新しい指摘なし。要点:

- 問い 1（正本との一致）: 切れた stdout の拒否、8 行の印・順・字面の認識、組の数の確かめ、数・和・終了コードの確かめ、spec の失敗の名前に限った取り出しの順。masker は private-key の正規表現を実行せず、BEGIN・END の印を前へ探す。設計（最終）§3・§4、ADR-0028・ADR-0013 の追記の案（最終）と方向・契約が合う。設計の見込みとの違い 4 つ（P3 が基準でも PASS、本物の Node の verify の通し、fixture の安全な字面への置き換え、変異で足したテストを後の commit に）は、契約を緩めるものではない
- 問い 2〜4: 上の表
- 問い 5（ほかのパーサへの影響）: `PARSERS`・`COUNT_KEYS`・`PARSER_TOOLS` に node-test が増えた一方、既存の 5 つのパーサの本体と `src/parse/text.ts` は差分に無い。`ParserInput` の必須の欄を渡すのは `parseOutputAs` の 1 か所だけで、ほかのパーサは読まない。`output-truncated` は `ParseReason` に入り、`latest.json`・端末・Markdown で理由を出せる。古い history の読み手が新しい `parsed.tool` を拒む点は、後方互換の既知の制限として記録されている
- 問い 6（選び方の境目）: `runsNodeTest` の `src/node-command.ts` への移動は検出の規則を共有する変更。`choosesNodeTest` は単純コマンド 1 つ、または `cd` の 1 語を前に置いた形だけ。reporter は無し・spec・tap、出力先は無し・stdout に限る。ほかの道具も同じコマンドから見つかれば `several-tools` で選ばない。選ばない方向の見落とし（限られた wrapper など）は、検出の精度を守る意図した仕様
- 問い 7（項目 40 の同値と線形性）: `markerEnd` の進み方と、END の印が無ければ止める流れは、正規表現の非貪欲な最初の END との一致を説明できる。`tests/regression-item40-private-key-linear.test.ts` は、変えていない `SECRET_PATTERNS` の source と flags を固定した正解の正規表現と比べる（固定の seed の 100,000 入力・共有の入力・狙った 25 入力・2 件以上の連続の一致）。4 つの形に 256 KiB と 1 MiB の CPU 時間の比を当てる。実測の値は依頼文の記録で、独立に測り直してはいない
- 問い 8（判定・終了コードの不変）: 新しいパーサは表示用の `ParsedOutput` だけを作り、`parseOutputAs` が不正な結果・例外・時間の上限を `unparsed` にする。判定と終了コードをパーサから書き換える処理は増えていない。独立の CLI の通しの実行はしていない
- 問い 9（テストの検出力）: 既存の期待値の変更は `tests/history-read.test.ts` の道具ごとの fixture の表への node-test の追加だけで、ほかのパーサの期待値を緩める変更は無い。P3 はパーサの結果が `unparsed` でも線形性だけを測るので、基準で PASS でも機能を見つける試験とは言えないが、`tests/parse-node-test.test.ts` が選び方と読み方を別に固定している。変異 29 個の記録は参考で、独立の実行の証拠ではない。fixture の `/work`・`host`・`{ESC}` の置き換えは、形の確かめに要る制御文字をテストの時に戻すための扱いとして妥当
- 問い 10（文書と記録）: ADR-0028・ADR-0013・ADR-0011、CONFIG_SPEC、README、ARCHITECTURE、再利用ワークフローの手順書、ROADMAP、CHANGELOG と findings を照らした。表示だけ・切れの条件・既知の限界、private-key の正規表現の定義を残すこと、古い history との非互換は、実装の契約と合う。3 件を `resolved` とする状態は、上の限定した解消の評価に沿う

## レビュアーが独立に確かめられなかったもの（既知の残余として受け入れた。新しい指摘ではない）

レビュアーは、結論が静的なレビューであり、次を独立には確かめていないと明記した。これらは、実装者の側で確かめた記録に委ねる（人間の決定 2026-10-31）。v0.18.0 の完了報告は公開リポジトリの外にあるので、公開の記録で読める所もあわせて書く。

| 確かめていないもの | 実装者の側の記録 |
|---|---|
| コードの独立のコンパイル、全テスト、CLI の通しの実行 | v0.18.0 の完了報告 §2（各 commit の SHA 固定の worktree で typecheck・lint・`npm audit`・全テスト・`npm run verify` 8/8、release の commit で全テスト 3 回・`verify:dist`）。公開の記録: CHANGELOG・ROADMAP の v0.18.0 の項 |
| 変異の試験（29 個）と、直す前の FAIL | v0.18.0 の完了報告 §2（「先に書いたテストの FAIL の記録」「変異」）。公開の記録: ROADMAP の v0.18.0 の項（26 個が落ち、落ちなかった 3 個に区別する入力を足した） |
| 性能の測り（項目 40 の CPU 時間の比、P3 の時間） | v0.18.0 の完了報告 §3（項目 40 の実測と境目の値）と §2 の T3 の確かめ。公開の記録: ADR-0013 の追記、CHANGELOG の v0.18.0 の項目 40 の行 |
| Node のほかの版・Windows での出力 | 実装者の側でも確かめていない（ADR-0028 の決定 14 の既知の限界。依頼文の「既知の限界」） |
| CI と、PR・CI の原データ（実測の値の真偽） | v0.18.0 の完了報告 §5。この記録の作業で、PR の run 41128162205 と main の run 41128854350 の job の log を取り直し、時間と割合を読み直した（ROADMAP の v0.18.0 の項の CI の 2 行） |
| 適用先 A・B の再現（非公開のデータ） | v0.18.0 の完了報告 §4（写しでの確かめ: 適用先 A は stdout 5,913 UTF-16 単位で `parsed`、件数が `npm test` の要約と一致。適用先 B は v0.17.1 と同じ出力）と、H11 の 4 回目の CI（上の節）。公開の記録: ADR-0028 の「適用先 A の実物」、ROADMAP の v0.18.0 の項 |
| v0.17.x の `aiqh history` の実行（互換） | v0.18.0 の完了報告 §4（v0.17.1 の `aiqh history` は、この版の適用先 A のレポートを `bad-shape`〈exit 2〉にし、この版の `aiqh history` は読む）。公開の記録: CHANGELOG の v0.18.0 の互換の行、ADR-0028 |
| 「必要なら」の固定の URL（`src/run-history/read.ts`・`tests/regex-equivalence-inputs.ts`・時間の確かめの決まり・release の commit の lock の差分） | 前の 3 つは、この範囲で変わっていない（`git diff 45b45d7 2e4dab6` に差分なし）。lock の差分はルートの 2 つの `version` の 0.17.1 → 0.18.0 だけ（この記録の作業で確かめた） |
| パケットの 50 ファイルの全行、fixture 20 個の全行の機械的な照合 | パケットは `aiqh review-packet` が範囲から作り、Integrity の節に 50 個の blob の SHA-256 を持つ（v0.18.0 の完了報告 §7）。fixture は架空の名前のテストで取り直し、書いた後に手元のパス・ホスト名が 0 であることを走査した（同 §2） |

ほかに、固定の URL は GitHub の画面で開いたが全行を通して読んだとは主張しない、と明記された。

## 読めた範囲（レビュアーの原文の要約）

依頼文と、ZIP の 1 ファイル `review-packet-batch3-v0180-impl.md`（変わったファイルの一覧と全文のうち、`src/parse/node-test.ts`・`read.ts`・`select.ts`・`tool.ts`、`src/security/mask.ts`、`src/types.ts`、6 つのテストのファイル、関係する文書と fixture の該当箇所）と、「必ず開く」の固定の URL（release の commit `2e4dab6` の設計〈最終〉§3〜§6、ADR-0028・ADR-0013 の追記の案〈最終〉、設計の独立レビュー R1・R2、`src/parse/text.ts`、`src/runner/execute.ts`、`src/security/patterns.ts`）を読んだ。

## 取り込みと review-check

- `aiqh review-import`（0.18.0）: `findings-r1.json`（指摘 0 件）。exit 0、`REVIEW IMPORT: written`
- `aiqh review-check --label batch3-v0180-impl`: R1 は open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）
- `aiqh review-check --label batch3-design`: 状態は変えていない（`resolved` の B3-D-R1-001・B3-D-R1-002〈`findings-r1.json`〉と B3-D-R2-001〈`findings-r2.json`〉の `note` に、上の評価を書き足しただけ）。`REVIEW LOOP: complete`（open 0、警告 0）・`REVIEW CHECK: passed`。出力は書き足す前と同じ
