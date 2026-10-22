> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch1-design-r1-for-claude.md`（2026-10-21 受領、17,569 バイト、LF 181・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `c485b75310dcfb64f910f2114d83cda239c75a5642bbc59183b257040ab05659`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.13.2 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# batch1-design R1 独立設計レビュー

基準: `a7e4d5300432f4610d49d0fb6b5b9c9c80534514`。添付された設計 R1、ADR-0037 案、B1-Q1〜B1-Q24 と、指定コミットの公開コードを照合した。コード・テストの実行はしていない。

## 指摘

### B1-D-R1-001
- ID: B1-D-R1-001
- 重要度: Medium
- 種別: 設計
- 対象: 設計 §2.4・§2.6、B1-Q5
- 内容: node:test の script 検出が実際に node のテストモードを実行する証拠にならない。
- 根拠: 指定コミットの src/adapters/node.ts:15-17 は script 本文への正規表現検査を既に持つ。設計の「同じ単純コマンド内に node と --test」がプログラム位置を検証しないなら、echo node --test、node -e "console.log('--test')"、node script.js --test などでも available となり得る。node script.js --test は Node 自体のテストモードとも限らない。N5 はこれらを含まない。
- 修正案: B1-Q5 の A を無条件採用せず、単純コマンドの実行位置が node で、Node が解釈する --test オプションであることを検証する。node のオプション終端、スクリプト名後の引数、引用符・echo、環境変数前置きをテストへ追加する。
- 確度: 推測

### B1-D-R1-002
- ID: B1-D-R1-002
- 重要度: Medium
- 種別: 設計
- 対象: 設計 §3.5・§3.7、B1-Q7
- 内容: pytest のパーサ選択を任意位置の pytest 語に依存させると、pytest 以外の check に pytest の件数を付ける恐れがある。
- 根拠: 指定コミットの src/parse/select.ts:40-63,78-88 は引用符を捨てた単純な語分割で、実行位置を問わず単語を探す。例えば echo "1 passed in 0.10s" pytest や printf で同様の行を出すコマンドでも、pytest が選択されると要約が成立する。設計は pip install pytest を no-summary とするが、出力に要約と同形の行がある場合を検討していない。
- 修正案: B1-Q7 は B の「実行位置または -m の直後」を基本とし、uv run、python -m、venv 実行と既知の wrapper だけを構文上認める。選択の誤検出と、判定は変えないが件数が誤るケースを回帰テストにする。
- 確度: 確認済み

### B1-D-R1-003
- ID: B1-D-R1-003
- 重要度: Medium
- 種別: 設計
- 対象: 設計 §4.5・§4.7・§4.8、ADR-0037 決定 3、B1-Q12・B1-Q13
- 内容: RGI_Emoji を使った自動除外の正確性が設計上の不変条件として規定されていない。
- 根拠: 指定コミットの src/security/scan.ts:391-400 は長い行の窓ごとに生文字を調べ、同一行・符号位置を dedup する。C4 は候補の前後 16 符号位置という例に依存するが、RGI_Emoji の最長長さ・境界の正当性を未確認のまま固定する。部分一致や行窓の片側だけの文脈で「一致した絵文字の一部」と判定すると、外側の見えない文字を誤除外し得る。
- 修正案: C4 自体は条件付きで支持するが、Unicode データで完全な RGI シーケンスの両端を確定し、候補が完全一致区間の内部にある場合だけ除外する仕様にする。窓端で文脈が不足したら除外しない。タグ列、隣接した余分な制御文字、連続した絵文字、長い行とパス名で漏れ・過剰除外を試験する。
- 確度: 推測

### B1-D-R1-004
- ID: B1-D-R1-004
- 重要度: Medium
- 種別: 設計
- 対象: 設計 §6.4・§6.6、B1-Q20
- 内容: 47-c の単一実行テストでは R-010 の並行時不整合を解消せず、既知の欠陥を解決済みとして閉じる根拠に不足する。
- 根拠: 指定コミットの src/report/write.ts:21-27 は latest.json と latest.md を別々に rename する。A と B が交互に書けば、両者は各々完全でも別の run になる。startedAt の比較は消費側に明示の検査がある場合だけ有効で、47-c のテストは 1 回の verify の一致しか確認しない。
- 修正案: B1-Q20 の c は「リスク受容・未解決」と明示して残すか、同じ作業ツリーの並行実行をサポートするなら b または互換性を含め再設計した a を選ぶ。c を選ぶなら競合を意図的に再現し、不一致検知と安全な再取得の手順・消費側契約を記録する。
- 確度: 確認済み

### B1-D-R1-005
- ID: B1-D-R1-005
- 重要度: Medium
- 種別: 設計
- 対象: 設計 §5.5・§5.7、B1-Q19
- 内容: テスト上限を静かな時間の 8 倍にするだけでは、型ガードの遅延を修正できず負荷時の問題の検出能力が弱くなる。
- 根拠: 設計 §5.3 は同時全テスト 2 本が上限超過で失敗したことと、処理が静かなときの最大 10.3 倍に伸びたことを報告する。推奨の 8 倍は観測倍率より小さく、300 秒上限は 600 秒の unit 制限の半分を占め得る。CI の実行時間が変わらないという説明は、停止しない遅延時には成立しない。
- 修正案: B1-Q19 の A は暫定措置とし、負荷ゲート・プロセス並列数・各テストと suite 全体の時間予算を別々に定義する。観測済み倍率を覆う根拠のある上限を使い、閾値に近い遅延の診断を残す。並列化の抑制や program の再利用を別課題として記録する。
- 確度: 確認済み

### B1-D-R1-006
- ID: B1-D-R1-006
- 重要度: Low
- 種別: テスト
- 対象: 設計 §4.8、ADR-0037 決定 1、B1-Q15・B1-Q17
- 内容: control と invisible-other の分類表に対する Unicode データ照合を、受入条件まで具体化する必要がある。
- 根拠: 指定コミットの src/security/raw-chars.ts:18-25 は review-packet 用の禁止集合を別に維持する。新分類は Default_Ignorable_Code_Point の「主なもの」で網羅集合ではない。C0 の U+0000 は先頭 8 KiB のバイナリ判定で走査されず、設計上の「全分類 FAIL」という表現には対象範囲の注記が必要。
- 修正案: 固定集合と Unicode 属性との差分をテスト用に出し、意図的に対象外とする符号位置を明示する。先頭 8 KiB とそれ以降の NUL、行内 CR、先頭 BOM の境界を回帰テストに加える。
- 確度: 確認済み

### B1-D-R1-007
- ID: B1-D-R1-007
- 重要度: Low
- 種別: 設計
- 対象: 設計 §7、B1-Q23
- 内容: v0.13.2 の独立実装レビューを完全に省くのは変更の影響に比して根拠が弱い。
- 根拠: この版は製品コードを変えないが、SIGTERM・SIGKILL と型ガードのテスト、再現条件、時間制限を修正する。機械検証が PASS することだけでは、意図した負荷試験を弱くしていないことまで評価できない。
- 修正案: B1-Q23 は B または v0.13.2 のテスト差分限定レビューを推奨する。少なくとも時間切れの上限、負荷再現、テストの検出力を人間が確認する。
- 確度: 推測

## 全体の結論
件数: High 0 / Medium 5 / Low 2

Medium があるため設計 R1 は終了せず、修正版による R2 を推奨する。設計全体の fail closed 原則は維持する方向だが、誤った検出の根拠と、意図しない除外の境界を先に確定する必要がある。

- 問い 1（fail closed）: C2・C3 を退ける判断には指摘なし。C4 は完全な絵文字列だけを除く契約を追加する条件で支持。node:test の検出の証拠、pytest の誤表示、41 の時間予算、47-c の解決判定に指摘あり。
- 問い 2（互換）: 新しい allow category が旧版では exit 2 となる設計、pytest の追加による旧版 history の bad-shape は妥当な警告。B1-Q10 の A（厳格な読み手を維持して記録）は支持。新しい読者への緩和は別 ADR で扱うべきで、現段階では指摘なし。
- 問い 3（層 (c)）: 8 分類の基本方針と方向マーク・IVS を既定 finding にする案は支持。RGI 除外の完全一致条件と固定 Unicode 集合の対象範囲に指摘あり。review-packet を変えないことは、別のセキュリティ境界として既知の限界を明示する限り本 batch では指摘なし。
- 問い 4（テスト）: node:test の偽陽性、pytest の偽陽性、絵文字境界、NUL・CR の境界、負荷試験の検出力について追加試験が必要。各機能の通常の成功系テストには指摘なし。
- 問い 5（推奨）: B1-Q5 の A、B1-Q7 の A、B1-Q19 の A、B1-Q20 の c、B1-Q23 の A は、そのまま承認しない。B1-Q12 の C4 は条件付き支持。その他の Q の推奨は、このレビューで High・Medium 相当の異議なし。版の分割 B1-Q22 の V1 と SHA 更新順 B1-Q24 の A は概ね妥当。

未確認範囲: pytest・node:test の実出力と現物のテスト結果、適用先 A・B の非公開ファイル、Unicode の固定データと最長 RGI シーケンス、実負荷再現、GitHub に存在する指定コミット以外の将来の変更。設計の記載する件数や時間計測は再実測していない。

照合した公開コード（固定 SHA）:
- https://raw.githubusercontent.com/youhei-dev/ai-quality-harness/a7e4d5300432f4610d49d0fb6b5b9c9c80534514/src/security/scan.ts
- https://raw.githubusercontent.com/youhei-dev/ai-quality-harness/a7e4d5300432f4610d49d0fb6b5b9c9c80534514/src/security/raw-chars.ts
- https://raw.githubusercontent.com/youhei-dev/ai-quality-harness/a7e4d5300432f4610d49d0fb6b5b9c9c80534514/src/adapters/node.ts
- https://raw.githubusercontent.com/youhei-dev/ai-quality-harness/a7e4d5300432f4610d49d0fb6b5b9c9c80534514/src/parse/select.ts
- https://raw.githubusercontent.com/youhei-dev/ai-quality-harness/a7e4d5300432f4610d49d0fb6b5b9c9c80534514/src/parse/security-scan.ts
- https://raw.githubusercontent.com/youhei-dev/ai-quality-harness/a7e4d5300432f4610d49d0fb6b5b9c9c80534514/src/report/write.ts

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch1-design",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 5,
    "low": 2
  },
  "findings": [
    {
      "id": "B1-D-R1-001",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §2.4・§2.6、B1-Q5",
      "content": "node:test の script 検出が実際に node のテストモードを実行する証拠にならない。",
      "evidence": "指定コミットの src/adapters/node.ts:15-17 は script 本文への正規表現検査を既に持つ。設計の「同じ単純コマンド内に node と --test」がプログラム位置を検証しないなら、echo node --test、node -e \"console.log('--test')\"、node script.js --test などでも available となり得る。node script.js --test は Node 自体のテストモードとも限らない。N5 はこれらを含まない。",
      "fix": "B1-Q5 の A を無条件採用せず、単純コマンドの実行位置が node で、Node が解釈する --test オプションであることを検証する。node のオプション終端、スクリプト名後の引数、引用符・echo、環境変数前置きをテストへ追加する。",
      "confidence": "推測"
    },
    {
      "id": "B1-D-R1-002",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §3.5・§3.7、B1-Q7",
      "content": "pytest のパーサ選択を任意位置の pytest 語に依存させると、pytest 以外の check に pytest の件数を付ける恐れがある。",
      "evidence": "指定コミットの src/parse/select.ts:40-63,78-88 は引用符を捨てた単純な語分割で、実行位置を問わず単語を探す。例えば echo \"1 passed in 0.10s\" pytest や printf で同様の行を出すコマンドでも、pytest が選択されると要約が成立する。設計は pip install pytest を no-summary とするが、出力に要約と同形の行がある場合を検討していない。",
      "fix": "B1-Q7 は B の「実行位置または -m の直後」を基本とし、uv run、python -m、venv 実行と既知の wrapper だけを構文上認める。選択の誤検出と、判定は変えないが件数が誤るケースを回帰テストにする。",
      "confidence": "確認済み"
    },
    {
      "id": "B1-D-R1-003",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §4.5・§4.7・§4.8、ADR-0037 決定 3、B1-Q12・B1-Q13",
      "content": "RGI_Emoji を使った自動除外の正確性が設計上の不変条件として規定されていない。",
      "evidence": "指定コミットの src/security/scan.ts:391-400 は長い行の窓ごとに生文字を調べ、同一行・符号位置を dedup する。C4 は候補の前後 16 符号位置という例に依存するが、RGI_Emoji の最長長さ・境界の正当性を未確認のまま固定する。部分一致や行窓の片側だけの文脈で「一致した絵文字の一部」と判定すると、外側の見えない文字を誤除外し得る。",
      "fix": "C4 自体は条件付きで支持するが、Unicode データで完全な RGI シーケンスの両端を確定し、候補が完全一致区間の内部にある場合だけ除外する仕様にする。窓端で文脈が不足したら除外しない。タグ列、隣接した余分な制御文字、連続した絵文字、長い行とパス名で漏れ・過剰除外を試験する。",
      "confidence": "推測"
    },
    {
      "id": "B1-D-R1-004",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §6.4・§6.6、B1-Q20",
      "content": "47-c の単一実行テストでは R-010 の並行時不整合を解消せず、既知の欠陥を解決済みとして閉じる根拠に不足する。",
      "evidence": "指定コミットの src/report/write.ts:21-27 は latest.json と latest.md を別々に rename する。A と B が交互に書けば、両者は各々完全でも別の run になる。startedAt の比較は消費側に明示の検査がある場合だけ有効で、47-c のテストは 1 回の verify の一致しか確認しない。",
      "fix": "B1-Q20 の c は「リスク受容・未解決」と明示して残すか、同じ作業ツリーの並行実行をサポートするなら b または互換性を含め再設計した a を選ぶ。c を選ぶなら競合を意図的に再現し、不一致検知と安全な再取得の手順・消費側契約を記録する。",
      "confidence": "確認済み"
    },
    {
      "id": "B1-D-R1-005",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §5.5・§5.7、B1-Q19",
      "content": "テスト上限を静かな時間の 8 倍にするだけでは、型ガードの遅延を修正できず負荷時の問題の検出能力が弱くなる。",
      "evidence": "設計 §5.3 は同時全テスト 2 本が上限超過で失敗したことと、処理が静かなときの最大 10.3 倍に伸びたことを報告する。推奨の 8 倍は観測倍率より小さく、300 秒上限は 600 秒の unit 制限の半分を占め得る。CI の実行時間が変わらないという説明は、停止しない遅延時には成立しない。",
      "fix": "B1-Q19 の A は暫定措置とし、負荷ゲート・プロセス並列数・各テストと suite 全体の時間予算を別々に定義する。観測済み倍率を覆う根拠のある上限を使い、閾値に近い遅延の診断を残す。並列化の抑制や program の再利用を別課題として記録する。",
      "confidence": "確認済み"
    },
    {
      "id": "B1-D-R1-006",
      "severity": "Low",
      "kind": "テスト",
      "target": "設計 §4.8、ADR-0037 決定 1、B1-Q15・B1-Q17",
      "content": "control と invisible-other の分類表に対する Unicode データ照合を、受入条件まで具体化する必要がある。",
      "evidence": "指定コミットの src/security/raw-chars.ts:18-25 は review-packet 用の禁止集合を別に維持する。新分類は Default_Ignorable_Code_Point の「主なもの」で網羅集合ではない。C0 の U+0000 は先頭 8 KiB のバイナリ判定で走査されず、設計上の「全分類 FAIL」という表現には対象範囲の注記が必要。",
      "fix": "固定集合と Unicode 属性との差分をテスト用に出し、意図的に対象外とする符号位置を明示する。先頭 8 KiB とそれ以降の NUL、行内 CR、先頭 BOM の境界を回帰テストに加える。",
      "confidence": "確認済み"
    },
    {
      "id": "B1-D-R1-007",
      "severity": "Low",
      "kind": "設計",
      "target": "設計 §7、B1-Q23",
      "content": "v0.13.2 の独立実装レビューを完全に省くのは変更の影響に比して根拠が弱い。",
      "evidence": "この版は製品コードを変えないが、SIGTERM・SIGKILL と型ガードのテスト、再現条件、時間制限を修正する。機械検証が PASS することだけでは、意図した負荷試験を弱くしていないことまで評価できない。",
      "fix": "B1-Q23 は B または v0.13.2 のテスト差分限定レビューを推奨する。少なくとも時間切れの上限、負荷再現、テストの検出力を人間が確認する。",
      "confidence": "推測"
    }
  ]
}
```
