# batch1-v0140-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.14.1

- 対象レビュー: `docs/reviews/batch1-v0140-impl/review-r1.md`（受領ファイル名 `independent-review-batch1-v0140-impl-r1-for-claude.md`、2026-10-23 受領、7,951 バイト、SHA-256 `2ea57353b9cb623fff5521de6441a226133250759970aa25333fff28a166807f`、
  LF 79 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / 秘密の形〈`scanString`〉なし / URL なし / レビュアーの側の作業場所を指すリンク〈`sandbox:`〉の行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.14.0（batch1 の 2 版目。ROADMAP の項目 45・39）。範囲 `659cae1dd1e42f7b0a3b82bb3e5743488b64ca87..2af638dc4f0f86a520e138d230bf3102b7272a2a`（4 commit、変わったファイル 31 個。merge の commit は含めない）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-batch1-v0140-impl-r1.zip`（1,304,018 バイト、SHA-256 `b228fd043282607ec33278ec3fe6aa3c3a972bb6b411f9ecf858f04e987c19d3`。中は `review-packet-batch1-v0140-impl.md` の 1 ファイル、1,303,852 バイト、SHA-256 `0e04682930db1576744b54f3d6213aa1f39368cdd673d5dccf9b9ca6478222bb`）
  - 依頼文 `review-request-batch1-v0140-impl-r1.md`（31,669 バイト、SHA-256 `00a79cd59b039b17cc29e671af14e0be50ae665303c3bbde77fd740a1c5dce99`。問いは 8 つ、読むときの固定の URL は 21 件。パケットの中にバイト単位で同一で入っている）
- 対応日: 2026-10-25
- 結果（レビュアー）: **High 0 / Medium 0 / Low 1**。レビュアーはパケットと 8 件の固定の URL を静的に読み、コードとテストは実行していない。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に達したので、**batch1-v0140-impl のレビューは R1 で終える**
- **人間の決定（2026-10-25）**
  - B1-I140-R1-001 は v0.14.1 で直す。規則（下の「対応」）は人間が決め、設計の正本 ADR-0011 に足した
  - 直しの確かめは、v0.15.0 の実装レビューで行う（v0.14.1 では実装レビューの依頼文・パケットを作らない）
- 取り込み: v0.14.1 の作業 branch（`release/v0.14.1`）の commit `a115582` で、`aiqh review-import <受領ファイルの写し> --label batch1-v0140-impl --round 1 --id-prefix B1-I140`（写しは受領ファイルと SHA-256 が同じ）。exit 0、`High 0 / Medium 0 / Low 1; open 1`、最後の 2 行は `REVIEW LOOP: incomplete (open 1)` と `REVIEW IMPORT: written`。取り込みの前に、写しを取り込みの検査の本体 `readReview`（ファイルに触れない関数）で確かめた（問題 0 件、label `batch1-v0140-impl`、回 1、ID `B1-I140-R1-001`）

## 判定表

| ID | 重要度 | 判定 | 対応 | 直した commit | 状態 |
|---|---|---|---|---|---|
| B1-I140-R1-001 | Low | VALID | 受け入れ（v0.14.1） | `545eeffffbfb6f88e07d27e4a031c77102813acf` | `resolved`（`fixedIn`・`regressionTest`。確かめは v0.15.0 の実装レビュー） |

## 指摘ごとの対応

### B1-I140-R1-001 — 値を取る Node のオプションの値が欠けていても、node:test を検出する（受け入れ）

- **指摘の要点**: `NODE_VALUE_OPTIONS` の分岐は、次の語があるか、次の語が別のオプションでないかを確かめずに、次の語を飛ばす。`node --test --test-name-pattern` は `--test` を先に見ているので、最後の値の欠けを拒まず、検出になる。Node が起動する証拠として足りない。既存の N5i は監視系の値なしを守るが、ふつうの値を取るオプションの末尾の欠けは守らない
- **コードで確かめたこと**（`9abd3ca`）[事実]
  - `runsNodeTest`（`src/adapters/node.ts:121`）の読みのループ（`:135`）で、名前が `NODE_VALUE_OPTIONS` にあり `=` の形でないとき、`:142` の `if (!inlineValue) i += 1;` が、次の語を見ずに飛ばしていた。次の語が無ければループが終わり、`--test` を見ていれば検出になる。次の語が `-` で始まる語（`--test` を含む）でも、値として飛ばしていた
  - 変更の前に、各形を `nodeTest.detect` で照らした（`node --test --test-name-pattern`・`node --test --import`・`node --test --test-reporter --test`・`node --test --test-name-pattern -x`・`node --test --test-name-pattern -` は検出。`node --test-reporter --test` は `--test` が値として飛ばされ、もともと検出しない）
- **対応**（v0.14.1、commit `545eeff`。人間が決めた規則。ADR-0011 の「改訂（v0.14.1、B1-I140-R1-001）」）: 値を取る 18 のオプションの名前が、`=` の形でなく、次の語を値として取る形のとき
  - 次の語が無い（コマンドの末尾）→ 検出しない（`null`）
  - 次の語が `-` で始まる（`-` 1 文字だけの語、引用ありの語も）→ 検出しない
  - コードは `src/adapters/node.ts:141-148`（次の語が無いか `-` で始まれば `return false`、そうでなければ値として飛ばす）
  - 理由: 検出しない向きは、init の提案が減るだけで、誤った提案を出さない（規則 7c と同じ「提案しない向き」）。Node がその語を実際に値として読むかどうかに頼らない
  - 変わらないもの: `=` の形（`--import=x`）、ほかの規則、判定、init の出力の形
- **手元の Node v24.13.1 での照らし**（判断の材料。結果がどうでも規則は変えない、という人間の指示のもとで行った。v0.14.0 と同じ方法: 空のディレクトリ・最小の環境〈`PATH` と `HOME` だけ〉・10 秒の上限）

  | 形 | exit | 出力の 1 行目（stderr。stdout は空） |
  |---|---|---|
  | `node --test --test-name-pattern` | 9 | `node: --test-name-pattern requires an argument` |
  | `node --test --import` | 9 | `node: --import requires an argument` |
  | `node --test-reporter --test` | 9 | `node: --test-reporter requires an argument` |
  | `node --test --test-reporter --test` | 9 | `node: --test-reporter requires an argument` |
  | `node --test-name-pattern -x --test` | 9 | `node: --test-name-pattern requires an argument` |

  - どの形でも、Node は `-` で始まる語を値として読まず、起動しない。決めた規則と食い違わない
  - 指示の 5 つの形のほかに、参考に照らしたもの: `node --test --test-name-pattern -` も同じく exit 9。`node --test --import=`・`node --test --test-name-pattern=` は exit 9（`node: --import= requires an argument` など）
- **値が空の `=` の形（`--import=`）**: 今のコードは検出する（`=` の後ろが空なら空の値がある、という設計 §2.4 の規則 4 のまま）。Node は起動しない。人間の指示のとおり、この版では直さない（ADR-0011 の既知の限界に書いた）
- **テスト**: `tests/regression-item45-node-test-detection.test.ts` に describe「B1-I140-R1-001 (v0.14.1)」（30 件）を足した。ID は既存の流儀（N5 系が検出しない側、N2 系が検出する側）
  - 検出しない: N5p（末尾に値なし）`node --test --test-name-pattern`・`node --test --import`、N5q（値の位置が `-` で始まる）`node --test --test-reporter --test`・`node --test-reporter --test`・`node --test --test-name-pattern -x`・`node --test --test-name-pattern -`・`node --test --test-name-pattern "-x"`・`node --import -r --test`
  - 18 個すべてについて、`node --test <名前>`（末尾に値なし）と `node --test <名前> --no-warnings`（値の位置に既知の旗）。一覧が 18 個であることも確かめる
  - 検出する（守り）: N2d `node --test --test-name-pattern foo`・`node --test-reporter spec --test`・`node --test --import=x`
  - テストを先に書き、v0.14.0 の main の `9abd3ca` の SHA 固定の worktree に写して走らせた。30 件中 23 件が FAIL（見込みどおり）。PASS の 7 件は見込みどおり:
    - `node --test-reporter --test`（もともと検出しない）
    - 一覧の大きさ
    - `--env-file`・`--watch-path`（規則 7c・7a で、もともと拒む）
    - 守りの 3 件
  - 既存のテストの FAIL は 0 件。直した後は、すべて PASS。既存のテストの期待値と `tests/structure/` は変えていない
  - 検出力の確かめ（直した commit の写しの worktree で、src の条件を外して item 45 のファイルを走らせた）

    | 変異 | 足したテストの FAIL |
    |---|---|
    | 1 つ目の条件（次の語が無い）を外す | 18 / 30 |
    | 2 つ目の条件（`-` で始まる）を外す | 21 / 30 |
    | 両方を外す（v0.14.0 の動き） | 23 / 30 |
- 記録: ADR-0011 の改訂と日付、ADR の一覧、CONFIG_SPEC の §5.2b と最終更新、README の node:test の項

## 既知の残余として受け入れたもの（新しい指摘ではない）

レビュアーは、結論が静的なレビューであり、実行での合格を保証するものではないと明記している。次を独立には確かめていない。これらは新しい指摘ではなく、既知の残余として受け入れる（人間の指示 2026-10-25）。

- **固定の URL の 13 件の未照合**: 依頼文の固定の URL 21 件のうち、レビュアーが開いたのは 8 件。残りの 13 件は照合していない。レビュアーも、それらを照合済みとは扱わないと明記している
- **独立の実行なし**: コードとテスト（`npm test`・`aiqh verify`）の独立の実行、pytest の実物の出力の取得、変異の確かめの再現、Node v24 以外での確かめ、適用先の非公開のコードの確かめ。直す前の 116 件の FAIL・26 通りの変異・CI の success・B1-Q10 の再現は、実装者の記録（CHANGELOG・ROADMAP の v0.14.0 の項）に依る

## 問いへの答えの要約（レビュアー。実装者の評価ではない）

1. **B1-D-R1-001**: 解消。`runsNodeTest` は、環境変数の前置き・実行位置・本文を取るオプション・スクリプトの位置と `--`・引用の印を分けて確かめる。語の分け方は `src/command-words.ts`
2. **B1-D-R2-002**: 解消。監視を含む名前を `=` の形も含めて後ろのすべての語で確かめ、`NODE_OPTIONS` の前置き、設定のファイル・環境のファイルのオプションを拒む。設計より広く拒むのは安全側
3. **B1-D-R3-001**: 解消。値を取る 18・ブールの 24 の固定の一覧、未知の旗、値のあるブールの旗と値のある `--test` を拒む。既知のオプションの値が欠ける境界は Low（B1-I140-R1-001）に分けた
4. **B1-D-R1-002**: 解消。pytest は P1〜P3 と `cd` の例外を持つ B-1 の単純コマンドの制限で選ぶ
5. **拾いすぎ・拾い漏れ**: 値の欠けの誤検出を Low にした。外の `NODE_OPTIONS`・`export` による環境の変更は、検出の静的な解析の範囲の外（既知の限界）
6. **pytest のパーサ**: High・Medium の指摘なし。実物の出力での確かめは無く、合成の fixture と実装者の記録に依る
7. **テストの検出力と既存の守り**: High・Medium の指摘なし。既存の期待値の変更は `parse-select` の 1 行で、パケットの差分と合う
8. **文書と記録**: High・Medium の指摘なし。pytest の選び方と表示だけ・古い版の history の `bad-shape` の注意は、実装とおおむね合う

## 未確認範囲（レビュアーの原文の要約）

パケットの変更の一覧・実装の 7 ファイル・テストと fixture・文書・Verification の各節を読み、`src/adapters/node.ts`・`src/command-words.ts`・`src/parse/select.ts`・`src/parse/pytest.ts` は全文を確かめた。固定の URL では、`design-final.md`・`questions-final.md`・`src/adapters/context.ts`・`src/adapters/index.ts`・`src/parse/text.ts`・`src/parse/tool.ts`・`src/report/markdown.ts`・`src/run-history/read.ts` の 8 件を開いた（すべて `2af638d` に固定）。残りの 13 件は照合していない。`npm test` や `aiqh verify` の独立の実行、pytest の実物の出力、変異の再現、Node v24 以外での CLI の互換、適用先の非公開のコードは確かめていない

## 取り込みと review-check

- `aiqh review-import`（v0.14.1 の作業 branch の版。`tool.version` は 0.14.0）: `findings-r1.json`（指摘 1 件、`open`）。exit 0、`REVIEW IMPORT: written`
- 実装者の欄を書いた後の `aiqh review-check --label batch1-v0140-impl`: R1 は resolved 1、open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）
- `aiqh review-check --label batch1-design`: v0.14.0 のときと同じく `REVIEW LOOP: incomplete (open 4)`・警告 6・`REVIEW CHECK: passed`（下の N5k の件数の訂正は `regressionTest` の文だけで、件数と判定は変わらない）

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/batch1-v0140-impl/findings-r1.json`（実装者の欄）・`response-r1.md`（この記録）。`review-r1.md` と取り込みの `findings-r1.json` は、取り込みの commit `a115582`
- `docs/reviews/batch1-design/findings-r1.json`: B1-D-R1-001 の `regressionTest` の「N5k（照らさない形 8 つ）」を「7 つ」に直した（v0.14.0 で書いた数の誤り。テストの行は 7 つ）
- CHANGELOG の v0.14.0 の見出しの SHA と記録の行、ROADMAP（v0.14.0 の項の CI・PR・タグ・実装レビュー、v0.14.1 の項、最終更新）
