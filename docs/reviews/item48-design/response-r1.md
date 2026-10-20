# item48-design の独立レビュー 1 回目への対応記録（response-r1）— 設計 R2（v0.13.0 で記録）

- 記録: v0.13.0 の PR の docs の commit で、`docs/reviews/item48-design/response-r1.md` として入れた。もとは R2 の依頼に添付した下書き（`response-item48-design-r1.md`、19,514 バイト、SHA-256 `01c87acc38a3563c25208bd12d790156a50052f360ca6d4636112708998f0da3`）。記録のときに、(1) I48-D-R2-001 を受けて I48-D-R1-001 の「版を上げるときの案内」の文を直し、(2) 取り込みの結果・人間の判定・R2 の評価・状態（`resolved`）を書き足し、(3) 「予定」の書き方を事実に直した
- 対象レビュー: `docs/reviews/item48-design/review-r1.md`（受領ファイル名 `independent-review-item48-design-r1-for-claude.md`、2026-10-19 受領、24,477 バイト、SHA-256 `d639fd04082bd8c1222dc1184a229c50c1310d644918cefa2b5210507cbf854b`、
  LF 159 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
  - 原文の 93 行目は、レビュアーの側の作業場所にある Markdown ファイルを指すリンクの行（手元のパスではない。`aiqh-findings` のブロックの外）。人間の決定（2026-10-19）で、一字も変えずに収録し、収録の注記に「93 行目はレビュアー側のファイルへのリンクで、手元のパスではない。リポジトリからは開けない」の 1 文を足した
- 対象: 項目 48 の設計 R1（commit していない下書き `item48-design-r1.md`、37,000 バイト、SHA-256 `3407ba8da0b4a51c69e7d349f121c490a1f9580e9311206c26dce2a34c0e11d7`。基準の commit `8870afbf1bf65282f12bba39086d661c88d70851`）と、ADR-0036 の下書き（`adr-0036-draft.md`、15,049 バイト、SHA-256 `6633aeb8a6bb8d51084f82061d5bbaf833300484815294880564eefbfcd64ba2`）
- レビュー用に作って人間に渡したもの（送付は人間が行った）: 依頼文 `review-request-item48-design-r1.md`（12,701 バイト、SHA-256 `0085ef585bdc9efeb138932ce03ed1de74d58201b44f7c6479dbf1d4372f644f`。問いは 7 つ）と、設計の案の 2 ファイル
  - この回は、コードの変更の範囲が無い設計のレビューなので、`aiqh review-packet` のパケットは作っていない。リポジトリのコードは添付していない（基準の commit の公開リポジトリにある、と依頼文に書いた）
- 対応日: 2026-10-19
- 結果（レビュアー）: **High 0 / Medium 3 / Low 2**。レビュアーはコードを読んでおらず、実行もしていない（設計の案と依頼文の静的な読解のみ）。依頼文に先に書いた基準（High・Medium が 0 なら終える）に達していないので、設計を直して R2 を依頼した（R2 は High 0 / Medium 0 / Low 1 で、設計のレビューは R2 で閉じた。`response-r2.md`）
- 取り込み: v0.13.0 の PR の docs の commit で、R2 とまとめて `aiqh review-import`（v0.13.0 の作業 branch の版）で取り込んだ（label `item48-design`、round 1、接頭辞 `I48-D`）。結果は下の「取り込みと review-check」
  - R2 の依頼の前（SP3）には、受領ファイルの写しを、取り込みの検査の本体の `readReview`（`src/review/import.ts:314`。ファイルに触れない関数）で確かめていた（問題 0 件。同じ写しを `--round 2` で読ませると問題が出ることも確かめた）

## 判定表

判定は、人間の方針（2026-10-19。5 件すべてを受け入れ、設計に反映する）のとおり。`findings-r1.json` の `verdict`・`action`・`destination` に書いた（`docs/ops/review-loop.md` の段取り 6）。

| ID | 重要度 | 判定 | 対応 | 変えた節（設計 R2・ADR-0036 の案 R2） | 要点 |
|---|---|---|---|---|---|
| I48-D-R1-001 | Medium | VALID | 受け入れ | 設計 §6-4、§9（ADR-0028 の注記・CONFIG_SPEC・README の行・CHANGELOG の下書き）。ADR の決定 10・代替案・影響 | 「パースの失敗は判定を変えない（P1）」と「検出の範囲は子の `aiqh security-scan` の版で決まる。新しい verify と古い security-scan では検出が効かない」を分けた。版を上げるときに、verify が実際に呼ぶ `aiqh` の版・commit をそろえる案内を足した。H8 と P1 は変えない |
| I48-D-R1-002 | Medium | VALID | 受け入れ | 設計 §5-2、§5-4、§8-1（T8a〜T8f）。ADR の決定 8 | 候補の規則を順に見るとき、raw-char には分類を明示した規則だけを候補にする（採ってから捨てない）と明記。規則の組み合わせ 3 つ、secret との混在 1 つ、`findAllowRule` の直接のテスト 2 つを足した |
| I48-D-R1-003 | Medium | VALID | 受け入れ | 設計 §3-4、§8-1（T7a〜T7g）。ADR の決定 5 | パス名の確かめを 2 つの一覧のループのパスごとの最初に置くと明記し、一覧に出るものを実測した。中身を読まない 5 種と、未追跡で ignore されない通常のファイルの名前のテスト、ignore されたパスは対象外のテストを足した。中身の走査の範囲は広げない |
| I48-D-R1-004 | Low | VALID | 受け入れ | 設計 §8-1（T5、表の前の決まり） | T5 の ignore のケースは未追跡のファイルと明示し、見込みを「(1) FAIL / (2) PASS / (3) PASS」に直した。1 つの `it` に 1 つのケース |
| I48-D-R1-005 | Low | VALID | 受け入れ | 設計 §11。ADR の既知の限界 | 「閉じた（害の無い）並び」を、「閉じた並びや正当な使い方も finding にする。始まりと終わりの対応だけでは安全とは判断しない。正当な使い方は allow で扱う」に直した |

- **状態**: 5 件とも `resolved`（`docs/ops/review-loop.md` の段取り 8）。`destination` は v0.13.0。`fixedIn` は v0.13.0 のテストと実装の commit `7633da4f25c42748b6ee66fcb13cbb6c2a7289e3`、`regressionTest` は設計 §8-1 のテスト（下の「v0.13.0 での実装と回帰テスト」）
  - 001・005 は文書の言い回しの指摘で、直した文は設計 R2 と v0.13.0 の docs の commit・release の commit にある。`fixedIn` には、その文が説明する動き（001: 6 つの内訳の件数の行と、古い形の `unexpected-summary`。005: 出現ごとの finding）を入れた commit を書いた。docs の commit と release の commit の SHA は、記録の PR で書く
  - **v0.13.1 で `fixedIn` を訂正（I48-I-R1-002）**: 実装の独立レビュー item48-impl R1 の指摘（文書の指摘の `fixedIn` が、文書を直していない実装の commit を指している）を受けて、001 の `fixedIn` を release の commit `8bd945666f5774ca9a4b4030bcd77f60794b764a`（主な文書の直しは docs の commit `5fe75f4c5f47933bea5f66232e2e454c418fb3d5`、CHANGELOG への反映の完了は release の commit）に、005 の `fixedIn` を docs の commit `5fe75f4c5f47933bea5f66232e2e454c418fb3d5` に直した。元の `7633da4f25c42748b6ee66fcb13cbb6c2a7289e3` は、動きと回帰テストの根拠として各件の `note` に残した。002〜004 は `7633da4…` のまま。上の 2 行は v0.13.0 の記録のまま変えていない
- 設計 R2 の独立レビュー（R2）の `previous` で、レビュアーは 5 件すべてを「解消」と評価した（下の「R2 の評価」）

## 人間の決定（2026-10-19）

- **R1 の指摘への対応の方針**: 5 件すべてを受け入れ、設計書と ADR-0036 の案に反映する（下の「指摘ごとの対応」）
- **設計の細部 U1〜U12**: 設計 R1 の推奨どおり（設計 R2 の §12 を「決定」の表に書き換えた）
- **取り込みの時期**: R1 の `aiqh review-import`（`docs/reviews/item48-design/` に入れる）は追跡ファイルを変えるので、設計の段ではしない。v0.13.0 の PR の中で行う
- **原文の 93 行目**: 一字も変えずに収録し、収録の注記に 1 文を足す（上の「対象レビュー」）
- **設計のレビューの終わり**: R2（High 0 / Medium 0 / Low 1）で閉じる。R3 は依頼しない。R2 の Low（I48-D-R2-001）は v0.13.0 の文書で直す

## 指摘ごとの対応

### I48-D-R1-001 — 子の security-scan の版と検出の範囲（受け入れ）

- **指摘の要点**: 新しい verify と古い security-scan の組み合わせまで「表示だけ」と書くと、項目 48 の検出が効いていない状態を、入ったものと受け取らせる。パースの失敗が判定を変えないことと、子の版で検出の力が違うことを分けて書くこと
- **対応**（設計 R2 の §6-4・§9、ADR の案 R2 の決定 10・代替案・影響）
  - §6-4 を 2 つに分けた: (1) パースの失敗は判定を変えない（ADR-0028 の P1。R1 のまま）、(2) 検出の範囲は、実際に起動する `aiqh security-scan`（子）の版で決まる。組み合わせの表に「項目 48 の検出」の列を足し、新しい verify と古い子は「効かない（生の文字があっても PASS のまま）」と書いた
  - 子の起動のしかたをソースで確かめて書いた: check の `command` を shell で起動し（`src/runner/execute.ts:150-156`）、環境は親のものから色の変数を除いたもの（`src/runner/env.ts:8-13`。PATH は変えない）。CI の再利用ワークフローは、自分の commit のソースを起動する script を PATH に置く（`.github/workflows/verify.yml:108-111`）ので、親と子は同じ commit になる
  - 版を上げるときの案内を足した（CHANGELOG・README・CONFIG_SPEC に書く）: verify が実際に呼ぶ `aiqh`（手元は PATH の `aiqh` と `npm run` のスクリプトが呼ぶもの、CI は再利用ワークフローの `uses:` の SHA）の版・commit をそろえる。`npm link` は `dist/cli.js` を指すので、取り込んだ後に `npm run build` が要る。親も子も古い `dist/` のときは食い違いの印も出ない。`--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる（記録のときに直した。下書きでは「`aiqh --version` で確かめる」と書いていたが、版の表示は `package.json` の `version` を読むだけで、古い `dist/` を見分けられない。I48-D-R2-001）
  - H8（新しい形だけを受け付ける）と P1 は変えない。ADR の代替案「パーサが古い形も受け付ける」の理由を直した: 受け付けても検出が効かないことは変わらず、かえって食い違いの印（`unexpected-summary`）が消える
- **テストの計画**: 変えない（新旧の 2 つの版の組み合わせは、テストではなく案内と既知の印で扱う。T10 が 5 つの内訳の行を `unexpected-summary` にすることを確かめる）

### I48-D-R1-002 — 規則の組み合わせ（受け入れ）

- **指摘の要点**: T8 は規則の条件を 1 つずつ確かめるだけで、分類の無い規則と分類を明示した規則を一緒に置いたときの期待が無い。「同じ分類の規則がどこかにあれば今の照合を使う」誤りや、「最初に当たった規則を採ってから捨てる」誤りを、T8 は通してしまう
- **対応**（設計 R2 の §5-2・§5-4、ADR の案 R2 の決定 8）
  - §5-2 に「候補の規則を順に見て、raw-char には分類を明示した規則だけを候補にする」と書き、今の `findAllowRule` の `rules.findIndex(…)`（`src/security/scan.ts:646`）の条件の中で分類を確かめる、と明記した。上の 2 つの誤りの作りが、なぜ誤りかも書いた
  - §5-4 に、使われた回数は `findAllowRule` が返した番号の規則に付く（`scan.ts:629-630`）こと、secret と raw-char が混在するときの記録を書いた
- **テストの計画**（設計 R2 の §8-1）
  - T8a: 先頭に分類なし、後ろに同じパスの `bidi-control` → 後ろの規則だけが抑え、回数もその規則に付く
  - T8b: 後ろの規則が別のパスだけ → 抑えない（分類なしの規則に代わりに抑えさせない）
  - T8c: 後ろの規則が期限切れ → 抑えない。`expiredAllows`・`unusedAllows` が合う
  - T8d: 同じファイルに secret（`fake()` で組み立てる）と U+202E。分類なしの規則が secret だけを抑え、raw-char は残る。`suppressed`・`allowUsage`・未使用・期限切れが合う
  - T8e・T8f: `findAllowRule` を直接呼ぶ（返す番号の項目と、-1・今のままの項目に分けた）
  - 8870afb での見込み: T8a〜T8e は FAIL、T8f は PASS（今も成り立つ守り）

### I48-D-R1-003 — 中身を読まないものの名前（受け入れ）

- **指摘の要点**: 「中身を読まないものも含め、2 つの一覧のすべてのパスを見る」境界が、テストで守られていない。パス名の確かめを、通常のファイルの確かめやバイナリの判定の後に置く誤りでも、T7（通常の追跡ファイル）と T5・T6（名前に文字を置かない）は通る
- **対応**（設計 R2 の §3-4、ADR の案 R2 の決定 5）
  - パス名の確かめを置く場所を明記した: `scanRepository` の 2 つのループで、パスごとに最初（`classifyEnvFile`・未追跡の `.env*` の `continue`・`scanFile` の `lstat`・バイナリの判定より前）
  - 2 つの一覧に出るものを、ASCII の名前の使い捨てのリポジトリ（git 2.50.1）で確かめ、表にした（追跡: バイナリ・symlink・gitlink・作業ツリーから消えたパス。未追跡: 通常のファイル・`.env*`・symlink。ignore されたものはどちらにも出ない）。同じリポジトリで基準の commit の `scanRepository` はエラー無く動き、中身を読まないものは今も静かに飛ばされている
  - 中身の走査の範囲は変えない
- **テストの計画**（設計 R2 の §8-1）
  - T7a バイナリ、T7b 未追跡の `.env*`（`ENV_FILE` に当たる名前）、T7c symlink、T7d submodule（gitlink。U+2066）、T7e 作業ツリーから消えた追跡パス、T7f 未追跡で ignore されない通常のファイル（U+2029）→ どれも `line`・`endLine` の無い raw-char の finding が 1 件。8870afb では FAIL
  - T7g 未追跡で ignore されたファイル → raw-char の finding 0 件。8870afb でも PASS
  - 作り方を書いた: 名前は `String.fromCodePoint` で組み立て、git には `execFileSync` の引数で渡す。submodule は本物を作らず、既存のテストと同じ `git update-index --add --cacheinfo 160000,<SHA>,<名前>` と空のディレクトリ。symlink は `symlinkSync`。消えた追跡パスは commit の後に `unlinkSync`。`.gitignore` には ASCII の `ignored/` だけを書く

### I48-D-R1-004 — T5 の見込み（受け入れ）

- **指摘の要点**: T5 の「前の 2 つは FAIL、最後は PASS」は、ignore による除外を保つケースの見込みと合わない。ignore された未追跡のファイルに finding が無いことは、変更の前から成り立つ
- **対応**（設計 R2 の §8-1）
  - T5 を (1)〜(3) に分け、(2) が**未追跡で** ignore されたファイルであることを明示した。追跡しているファイルは ignore の指定があっても走査する（T2 の範囲）と書いた
  - 見込みを「(1) FAIL / (2) PASS / (3) PASS」に直した
  - 表の前に「1 つの `it` に 1 つのケース」と書き、新しい検出のテストと、既存の除外を壊さないテストを `it` ごとに判定できる形にした
  - あわせて、変更の前の commit でも新しいテストのファイルが読み込めることを確かめた（この repo の vitest 5.0.0 は、無い名前の import でファイル全体を落とさず、その名前を使う `it` だけが FAIL になる。tmp の 1 つのテストのファイルで実測）。同じファイルの中の PASS の見込みの `it` も判定できる

### I48-D-R1-005 — 「閉じた並び」の言い回し（受け入れ）

- **指摘の要点**: 「閉じた（害の無い）並び」は、始まりと終わりが対応していれば安全と読める。対応していても、効果が複数の字句の要素をまたぎうる（UTS #55 §4.1.1・§5.1.6）
- **対応**（設計 R2 の §11、ADR の案 R2 の既知の限界）: 「閉じた並びや正当な使い方も finding にする。始まりと終わりの対応だけでは安全とは判断しない。正当な使い方は allow で扱う」に直した。検出の方針は変えない

## 設計 R2 で新しく出た論点

- 人間の決定を待つ設計の論点は無かった
- 収録のときの扱い: 原文の 93 行目のリンクの行は、人間の決定で一字も変えずに収録した（上の「人間の決定」）

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（文字の集合）**: 指摘なし。11 の符号位置、方向の印などを外すこと（既知の限界として）、`FORBIDDEN_RANGES` を保って部分集合の定数を足しテストする案は妥当。11 文字が無いことは、双方向の表示による偽装全般が無いことを意味しない
- **問い 2（分類を明示した allow）**: 方針に指摘なし。採る候補の規則自身について分類・パス・行・期限を確かめれば静かな抑えは防げる。ただし複数の規則の組み合わせを守るテストが足りない（002）
- **問い 3（review-packet との二重化）**: 指摘なし。`scanString` の経路に入れず、`findAllowRule` の変更を raw-char に限れば、パケットの秘密の形の走査に影響しない。T12・T13 の組み合わせは妥当
- **問い 4（パーサの互換・履歴）**: 親と子の版の説明に直しが要る（001）。H8 と P1 は両立する。履歴は指摘なし（`rawChars` の無い古い run を 0 で補わず `unknownRuns`・`null` にするのは、未測定と実測 0 を混ぜない扱い）
- **問い 5（テスト計画）**: 複数の allow 規則（002）、中身を読まないもののパス名（003）、T5 の見込み（004）に指摘。T4（長い行の窓）・T6（不正な UTF-8）・T12・T13 はほかに指摘なし。既存のテスト・fixture の一覧の網羅は、コードが無いので未確認
- **問い 6（既知の限界）**: 保証の範囲を限る書き方には指摘なし。「害の無い並び」の言い回しだけ（005）
- **問い 7（そのほか）**: U1〜U12 の推奨に反対なし。U7 の件数は文字の出現の総数ではなく、まとめた finding の数と理解した。PR の分け方と H11 も維持できる

## 未確認範囲（原文の要約）

基準の commit の実コードは添付に無く、取得していないため、設計の行の参照を独立に照合していない。照合に要るものとして `src/security/scan.ts`・`src/security/raw-chars.ts`・`src/config/schema.ts`・`src/review/packet.ts`、パーサ・履歴・出力の境界の `src/parse/security-scan.ts`・`src/parse/read.ts`・`src/parse/describe.ts`・`src/run-history/read.ts`・`src/run-history/aggregate.ts`・`src/run-history/html.ts`・`src/output.ts` が挙がった。§8-2・§8-3 の一覧の網羅と ADR-0034 の行の参照も未確認。コード・テストは実行しておらず、旧 commit での FAIL / PASS、長い行の窓、走査の時間、CI で親と子が同じ版になることは未検証。R2 の依頼文では、これらのファイルを基準の commit の固定の URL で一覧にして、照合を頼む

## v0.13.0 での実装と回帰テスト

- テストを先に書き（`tests/regression-item48-raw-chars-scan.test.ts` の T1〜T9・T11〜T13 と、`tests/parse-security.test.ts` の T10・T14）、変更の前の commit `8870afb` の SHA 固定の worktree に写して走らせた。ケースごとの FAIL / PASS は、設計 R2 の §8-1 の見込みと一致した（FAIL 26・PASS 10）
- 001: 件数の行の 6 つの内訳と、5 つの内訳の行を `unexpected-summary` にするパーサ（T10・T14）
- 002: `findAllowRule` の候補の条件（T8a〜T8f）
- 003: `scanRepository` の 2 つのループの先頭のパス名の確かめ（T7a〜T7g）
- 004: T5 (1)〜(3)
- 005: 出現ごとの finding（T2・T3）
- 実装の commit: `7633da4f25c42748b6ee66fcb13cbb6c2a7289e3`（SHA 固定の worktree で typecheck・lint・全テスト・`npm run verify` 8/8）

## R2 の評価（`docs/reviews/item48-design/review-r2.md` の `previous`。レビュアーの評価の要約）

| ID | R2 の評価 |
|---|---|
| I48-D-R1-001 | 解消。P1 と、検出の範囲が子の版で決まることを分けた。版の表示での確かめ方の誤りは、新しい指摘 I48-D-R2-001 で扱う |
| I48-D-R1-002 | 解消。分類の明示を候補の規則ごとの条件に置き、採ってから捨てる作りを除いた。T8a〜T8f が規則の順・パス・期限・secret との混在・直接の呼び出し・回数を固定する |
| I48-D-R1-003 | 解消。両方のループのパスごとに、中身を読むかの分かれ道より先に名前を確かめる。T7a〜T7g |
| I48-D-R1-004 | 解消。T5 の見込み FAIL / PASS / PASS は、基準のコードの一覧と未追跡の .env の扱いに合う |
| I48-D-R1-005 | 解消。閉じた並びを無害とせず、出現を見つけ、意図した使い方は allow で扱う |

## 取り込みと review-check

- `aiqh review-import`（v0.13.0 の作業 branch の版）: R1 は `findings-r1.json`（指摘 5 件、すべて `open`）、R2 は `findings-r2.json`（1 件、`open`）。どちらも exit 0、`REVIEW IMPORT: written`
- 実装者の欄を書いた後の `aiqh review-check --label item48-design`: R1 は resolved 5、R2 は resolved 1、open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/item48-design/review-r1.md`・`review-r2.md`（原文の収録）
- `docs/reviews/item48-design/findings-r1.json`・`findings-r2.json`（取り込みと、実装者の欄）
- `docs/reviews/item48-design/response-r1.md`（この記録）・`response-r2.md`
- `docs/reviews/item48-design/design-r2.md`（設計 R2 の記録。I48-D-R2-001 を反映）
