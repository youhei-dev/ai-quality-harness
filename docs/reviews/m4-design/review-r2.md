> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-m4-design-r2-for-claude.md`（2026-10-17 受領、12,118 バイト、LF 128・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `b0b589c512a24d3e3cb44a985dcd351247a9018f3207e6a066579057fc01b14e`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.9.2 の `aiqh review-import` でそのまま取り込めた）。

---

# m4-design 独立設計レビュー R2

## 指摘

### M4-D-R2-001

- ID: M4-D-R2-001
- 重要度: Medium
- 種別: 設計
- 対象: ADR-0034 の C の 8・F・G・§5.2 Q10
- 内容: 個々の自由文字列を256バイト以下に制限しても、--json の最終出力全体を safeJson に渡す経路の入力長は制限されない。既知の masker の超線形処理が、巨大な集計文字列に再び適用される可能性がある。
- 根拠: C の 8 は「maskSecrets に渡す文字列は256バイト以下」と述べる一方、F は --json が safeJson（src/output.ts:166-168）を通ると明記する。Q10 は集計が数百MB以上になりうると認め、200,000個の数値葉を上限案とする。safeJson が構造化値を個別に扱うか、JSON全体の文字列をマスクするかは添付コードから独立に検証できないため、現状の設計だけでは安全な上限を立証できない。
- 修正案: safeJson と output.json の実装を確認し、集計 JSON 全体をマスクへ渡さないことを設計上の要件にする。必要な自由文字列を個別にマスク済みにしてから安全にJSON化する、または最終出力の実バイト長に上限を置く。Q10 の境界を含む負荷試験で最終 JSON 出力経路を測定する。
- 確度: 推測

### M4-D-R2-002

- ID: M4-D-R2-002
- 重要度: Medium
- 種別: 設計
- 対象: ADR-0034 の E の check 集計・G の割合
- 内容: maxShareOfTimeout を「最大の所要時間 ÷ 最後の run の timeoutSec」として計算すると、run 間で timeoutSec が変わった場合に、どの run にも存在しない割合になる。監視用の値として誤解を招く。
- 根拠: E は所要時間の最大値と「最後の run の kind・required・timeoutSec」を保持し、別に「最大の所要時間 ÷ timeoutSec × 1000」を定めるが、最大所要時間を記録した run の timeoutSec を保持する規則がない。例えば1回目90秒・上限120秒、2回目20秒・上限30秒なら、実際の最大比率は0.75なのに、最大90秒を最後の上限30秒で割ると3.0になる。
- 修正案: 各 run について durationMs / (timeoutSec × 1000) を計算し、その最大を maxShareOfTimeout とする。最後の run の timeoutSec は別属性として保持する。上限が変化する2件以上の fixture を加える。
- 確度: 確認済み

### M4-D-R2-003

- ID: M4-D-R2-003
- 重要度: Medium
- 種別: 設計
- 対象: ADR-0034 の C の 5・E・G、ADR-0035 の決定 4・6
- 内容: 数値の検証が「0以上の整数」「正の数」中心で、JavaScript の安全な整数範囲と算術結果の有限性を保証しない。極端な JSON 数値で集計値が Infinity や不正確な値となり、JSON の null 化またはHTML側の有限性チェックと衝突しうる。
- 根拠: C の 5 は durationMs・summary・parsed.counts に非負整数、timeoutSec に正の数を要求するだけで、Number.isSafeInteger や比率の有限性を要求していない。G は Math.round(x * 10000) / 10000 と String(n) を用い、HTML 側 h は Number.isFinite を要求する。例えば durationMs=1e100・timeoutSec=1e-100 はJSONの有効な数値で、数学的比率は1e200、さらに大きい組合せでは Infinity になりうる。
- 修正案: 数量と継続時間は Number.isSafeInteger を満たす範囲に制限し、timeoutSec に有限かつ妥当な下限を設ける。集計加算・除算・丸め後も Number.isFinite を確認し、破綻時の分類を明示する。境界値、極小の timeoutSec、極大の durationMs と counts のテストを追加する。
- 確度: 確認済み

## 全体の結論

件数: High 0 / Medium 3 / Low 0

High は無いが Medium が3件あるため、設計レビューの完了条件には達していない。DBを持たない履歴集計、読み取りの fail closed、スクリプトなしの静的HTML、ハッシュを固定ではなく記録に限定する基本方針は維持してよい。

### 前の回（R1）の5件の評価

- M4-D-R1-001: 解消。1ファイルを上限+1バイトまでの記述子読み取りに制限し、実読み取り量で全体上限を判定し、サイズ変化の分類・試験を具体化した。
- M4-D-R1-002: 部分的に解消。Node標準fsで記述子相対探索を行わない理由と脅威モデルを明記し、dev・inoによる事後検出を追加した。ただし防止ではなく、入れ替え後に復元する競合を防げないと明示している。設計で定義した対象範囲のもとでは容認可能。
- M4-D-R1-003: 部分的に解消。名前・版・checks件数の上限は規定したが、最終JSONを safeJson に渡すときの大きさとマスク負荷が未確定。新規指摘で扱う。
- M4-D-R1-004: 解消。data-k のパス、対応表、例外リスト、SVGの照合範囲と試験が具体化された。座標の数値一致を対象外とする限界も明示した。
- M4-D-R1-005: 解消。ADR-0029への注記の本文とv0.11.0のdocs commitおよびテストcommitへの割り当てが明確になった。

### 問い1〜4への答え

1. **R1の5件への対応**: 001は解消。002は部分的に解消（対象外と明示した競合を防止しない点が残る）。003は部分的に解消（個別文字列の上限はあるが最終JSONの経路は未確認）。004・005は解消。
2. **脅威モデルとディレクトリの検出**: 指摘なし。Node標準fsに openat 相当の公開APIがないとする設計上の説明は合理的であり、dev・ino 比較を防止ではなく事後検出と明記している。対象外の競合に対する完全性は主張できない。
3. **新たな穴、Q10・Q11**: 指摘あり。大容量の最終JSONに対するマスク経路、変化する timeoutSec と最大比率、極端な数値を扱うときの有限性を修正すること。Q10の上限制御自体には賛成だが、数値葉の個数だけで最終出力処理の安全性は保証できない。Q11の文書化による制限の説明には反対しない。
4. **Q1〜Q9の決定**: 指摘なし。決定内容と各ADRへの反映に新たな矛盾は認めない。

### 未確認範囲

添付は設計文書と応答文書であり、基準commitの実コード、safeJson・maskSecrets・output.jsonの内部処理、zodスキーマ、ランタイムテスト結果、macOS/Linuxでのdev・ino、ブラウザでのCSPとSVGの実動作は独立に確認していない。したがってコード依存の指摘は確度を区別した。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "m4-design",
  "round": 2,
  "summary": {
    "high": 0,
    "medium": 3,
    "low": 0
  },
  "findings": [
    {
      "id": "M4-D-R2-001",
      "severity": "Medium",
      "kind": "設計",
      "target": "ADR-0034 の C の 8・F・G・§5.2 Q10",
      "content": "個々の自由文字列を256バイト以下に制限しても、--json の最終出力全体を safeJson に渡す経路の入力長は制限されない。既知の masker の超線形処理が、巨大な集計文字列に再び適用される可能性がある。",
      "evidence": "C の 8 は「maskSecrets に渡す文字列は256バイト以下」と述べる一方、F は --json が safeJson（src/output.ts:166-168）を通ると明記する。Q10 は集計が数百MB以上になりうると認め、200,000個の数値葉を上限案とする。safeJson が構造化値を個別に扱うか、JSON全体の文字列をマスクするかは添付コードから独立に検証できないため、現状の設計だけでは安全な上限を立証できない。",
      "fix": "safeJson と output.json の実装を確認し、集計 JSON 全体をマスクへ渡さないことを設計上の要件にする。必要な自由文字列を個別にマスク済みにしてから安全にJSON化する、または最終出力の実バイト長に上限を置く。Q10 の境界を含む負荷試験で最終 JSON 出力経路を測定する。",
      "confidence": "推測"
    },
    {
      "id": "M4-D-R2-002",
      "severity": "Medium",
      "kind": "設計",
      "target": "ADR-0034 の E の check 集計・G の割合",
      "content": "maxShareOfTimeout を「最大の所要時間 ÷ 最後の run の timeoutSec」として計算すると、run 間で timeoutSec が変わった場合に、どの run にも存在しない割合になる。監視用の値として誤解を招く。",
      "evidence": "E は所要時間の最大値と「最後の run の kind・required・timeoutSec」を保持し、別に「最大の所要時間 ÷ timeoutSec × 1000」を定めるが、最大所要時間を記録した run の timeoutSec を保持する規則がない。例えば1回目90秒・上限120秒、2回目20秒・上限30秒なら、実際の最大比率は0.75なのに、最大90秒を最後の上限30秒で割ると3.0になる。",
      "fix": "各 run について durationMs / (timeoutSec × 1000) を計算し、その最大を maxShareOfTimeout とする。最後の run の timeoutSec は別属性として保持する。上限が変化する2件以上の fixture を加える。",
      "confidence": "確認済み"
    },
    {
      "id": "M4-D-R2-003",
      "severity": "Medium",
      "kind": "設計",
      "target": "ADR-0034 の C の 5・E・G、ADR-0035 の決定 4・6",
      "content": "数値の検証が「0以上の整数」「正の数」中心で、JavaScript の安全な整数範囲と算術結果の有限性を保証しない。極端な JSON 数値で集計値が Infinity や不正確な値となり、JSON の null 化またはHTML側の有限性チェックと衝突しうる。",
      "evidence": "C の 5 は durationMs・summary・parsed.counts に非負整数、timeoutSec に正の数を要求するだけで、Number.isSafeInteger や比率の有限性を要求していない。G は Math.round(x * 10000) / 10000 と String(n) を用い、HTML 側 h は Number.isFinite を要求する。例えば durationMs=1e100・timeoutSec=1e-100 はJSONの有効な数値で、数学的比率は1e200、さらに大きい組合せでは Infinity になりうる。",
      "fix": "数量と継続時間は Number.isSafeInteger を満たす範囲に制限し、timeoutSec に有限かつ妥当な下限を設ける。集計加算・除算・丸め後も Number.isFinite を確認し、破綻時の分類を明示する。境界値、極小の timeoutSec、極大の durationMs と counts のテストを追加する。",
      "confidence": "確認済み"
    }
  ],
  "previous": [
    {
      "id": "M4-D-R1-001",
      "assessment": "解消。1ファイルを上限+1バイトまでの記述子読み取りに制限し、実読み取り量で全体上限を判定し、サイズ変化の分類・試験を具体化した。"
    },
    {
      "id": "M4-D-R1-002",
      "assessment": "部分的に解消。Node標準fsで記述子相対探索を行わない理由と脅威モデルを明記し、dev・inoによる事後検出を追加した。ただし防止ではなく、入れ替え後に復元する競合を防げないと明示している。設計で定義した対象範囲のもとでは容認可能。"
    },
    {
      "id": "M4-D-R1-003",
      "assessment": "部分的に解消。名前・版・checks件数の上限は規定したが、最終JSONを safeJson に渡すときの大きさとマスク負荷が未確定。新規指摘で扱う。"
    },
    {
      "id": "M4-D-R1-004",
      "assessment": "解消。data-k のパス、対応表、例外リスト、SVGの照合範囲と試験が具体化された。座標の数値一致を対象外とする限界も明示した。"
    },
    {
      "id": "M4-D-R1-005",
      "assessment": "解消。ADR-0029への注記の本文とv0.11.0のdocs commitおよびテストcommitへの割り当てが明確になった。"
    }
  ]
}
```
