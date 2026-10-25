> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch1-v0140-impl-r1-for-claude.md`（2026-10-23 受領、7,951 バイト、LF 79・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `2ea57353b9cb623fff5521de6441a226133250759970aa25333fff28a166807f`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.14.1 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# aiqh v0.14.0 独立実装レビュー R1

- 対象: `659cae1dd1e42f7b0a3b82bb3e5743488b64ca87..2af638dc4f0f86a520e138d230bf3102b7272a2a`
- 方法: 添付ZIPのパケットにある変更31ファイルの全文・差分・Verification記録と、指定コミットのGitHub固定URLにある設計および関連未変更コードを静的に照合した。コード・テストの独立実行はしていない。
- 証拠の区別: パケットのPASS/FAIL件数、mutation検査とCI成功は実装者の記録であり、当方が独立再現した結果ではない。

## 指摘

### B1-I140-R1-001

- ID: B1-I140-R1-001
- 重要度: Low
- 種別: テスト
- 対象: src/adapters/node.ts の runsNodeTest と tests/regression-item45-node-test-detection.test.ts
- 内容: 値を取る Node オプションの値が欠けている場合でも node:test を available と提案しうる。
- 根拠: NODE_VALUE_OPTIONS の分岐は次の語が存在するか、次の語が別のオプションでないかを検査せず i を増やす。例えば `node --test --test-name-pattern` は `--test` を既に見ており、最後の値欠落を拒まず true になる。Node の実行可能性の証拠としては不足する。既存の N5i は監視の値なしを守るが、通常の値取りオプションの末尾欠落を守らない。
- 修正案: 値を取るオプションの次の語が無いときは false。別のオプションらしい語が値の位置に来た場合の扱いも明文化し、`node --test --test-name-pattern`、`node --test --import`、`node --test --test-reporter --test` などの回帰テストを追加する。
- 確度: 確認済み

## 全体の結論

件数: High 0 / Medium 0 / Low 1

High・Medium の指摘は無く、依頼文で定めた終了基準は満たす。ただし、静的レビューの判断であり、実行での合格を保証するものではない。Low は実装の境界テストとして追跡することを勧める。

### 問い1〜4: 設計レビューで open だった4件

- **B1-D-R1-001: 解消**。`runsNodeTest` は環境変数の前置き、実行位置、本文を取るオプション、スクリプト位置と `--`、引用の印を分けて確認している。`echo node --test` や `node script.js --test` は拾わず、実行位置が `node` でない場合を排除する。語の分割も `src/command-words.ts` で実装されている。
- **B1-D-R2-002: 解消**。監視を含むオプション名は `=` 形を含めて全後続語を確認し、`NODE_OPTIONS` の前置き、設定ファイル・envファイルのオプションを拒む。設計より広く後方を拒む変更は安全側である。
- **B1-D-R3-001: 解消**。値取り18種・ブール24種の固定集合、未知の旗の拒否、値つきブール旗と値つき `--test` の拒否を確認。既知オプションの引数が欠ける境界は上記Lowとして別記した。
- **B1-D-R1-002: 解消**。pytestは P1〜P3 と `cd` の例外を持つB-1の単純コマンド制限で選択し、echo・前後の追加コマンドを除外する。既存4パーサとは意図的に異なる選択を保っている。

### 問い5: 拾いすぎ・拾い漏れ

Node の値取りオプションが末尾で欠ける場合の偽陽性をLowで指摘した。未知オプションの拒否、監視を含む文字列の拒否、pytestのwrapper制限はいずれも見落としを防ぐ向き。外部環境の `NODE_OPTIONS`、exportによる環境変更などは検出時の静的解析範囲から外れ、既知の限界である。High・Medium に当たる新しい誤検出は確認しなかった。

### 問い6: pytest パーサ

`src/parse/pytest.ts` は stdout の最後の要約形、対応する既知語8種、重複語・未知語を `unexpected-summary`、要約形が無い場合を `no-summary` とする分岐を持つ。`short test summary info` の最終見出し以降の FAILED/ERROR 名を取得し、共通 `ItemList` 等に委ねる。片側だけの `=` は要約として受理しない。実際の失敗・警告を含むpytest出力を実行しての検証は未実施で、合成fixtureと実装者の記録に依存する。High・Medium の指摘なし。

### 問い7: テスト検出力と既存の守り

パケットにある122件のnode:test検出試験、41件の語分割、91件のpytest試験、verifyを通す試験、historyのenum試験とP2/P3への追加を確認。既存の期待値を変更したのは `parse-select` のpytestの1行とされ、パケットの差分でも整合する。mutation 26系統の成功と修正前116 FAILは実装者記録で、当方で再現していない。P3の40秒制限を変更しない判断は本版での検証力低下を示さず、負荷時壁時計の問題は既知の別項目として記録されている。High・Medium の指摘なし。

### 問い8: 文書と記録

パケットに収録されたADR-0011、ADR-0028決定12、CONFIG_SPEC、README、reusable-workflowとfindingsを対照した。pytest選択と表示専用・古い版のhistoryの `bad-shape` の注意は概ね実装と整合する。B1-Q10の再現は実装者の記録であり独立再実行していない。High・Medium の指摘なし。

### 確認範囲と限界

- **実際に読んだ**: ZIP内の `review-packet-batch1-v0140-impl.md` の変更一覧・実装7ファイル・テストとfixture・文書・Verificationの各節。特に `src/adapters/node.ts`、`src/command-words.ts`、`src/parse/select.ts`、`src/parse/pytest.ts` の全文を確認した。
- **固定URLで実際に開いた**: `docs/reviews/batch1-design/design-final.md`、`questions-final.md`、`src/adapters/context.ts`、`src/adapters/index.ts`、`src/parse/text.ts`、`src/parse/tool.ts`、`src/report/markdown.ts`、`src/run-history/read.ts`。すべて指定の `2af638dc4f0f86a520e138d230bf3102b7272a2a` に固定したURL。
- **固定URLでは未確認**: 依頼文の残り13件（`review-r3.md`、`response-r3.md`、`src/adapters/types.ts`、`src/config/generate.ts`、`src/commands/init.ts`、`tests/regression-m1r1-003-init-no-script-bodies.test.ts`、`src/parse/vitest.ts`、`src/commands/verify.ts`、`src/runner/env.ts`、`src/adapters/python.ts`、`src/run-history/aggregate.ts` を含む）。未確認ファイルの中身を直接照合済みとは扱わない。
- **未実施**: `npm test` や `aiqh verify` の独立実行、pytest実出力の取得、mutation再現、Node v24以外でのCLI互換調査、適用先の非公開コードの確認。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch1-v0140-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 1
  },
  "findings": [
    {
      "id": "B1-I140-R1-001",
      "severity": "Low",
      "kind": "テスト",
      "target": "src/adapters/node.ts の runsNodeTest と tests/regression-item45-node-test-detection.test.ts",
      "content": "値を取る Node オプションの値が欠けている場合でも node:test を available と提案しうる。",
      "evidence": "NODE_VALUE_OPTIONS の分岐は次の語が存在するか、次の語が別のオプションでないかを検査せず i を増やす。例えば `node --test --test-name-pattern` は `--test` を既に見ており、最後の値欠落を拒まず true になる。Node の実行可能性の証拠としては不足する。既存の N5i は監視の値なしを守るが、通常の値取りオプションの末尾欠落を守らない。",
      "fix": "値を取るオプションの次の語が無いときは false。別のオプションらしい語が値の位置に来た場合の扱いも明文化し、`node --test --test-name-pattern`、`node --test --import`、`node --test --test-reporter --test` などの回帰テストを追加する。",
      "confidence": "確認済み"
    }
  ]
}
```
