> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch2-design-r2-for-claude.md`（2026-10-26 受領、13,423 バイト、LF 147・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `26350cab98d2e7416f5c757d6cdd9172b645b4e0063413f13988665349380fa8`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.15.1 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# aiqh batch2 設計 R2 独立レビュー（R1への対応確認）

- 基準コミット: `8650a72355e8b606af0ee815044a525b5350e5bd`
- 対象: 添付の設計 R2、Q一覧 R2、ADR-0038案 R2、ADR-0039案 R2、response-r1.md
- 方法: 添付5文書を読み、依頼文の「必ず開く」固定URL10件を実際に開いてコードと照合した。試作とテストは独立実行していない。

### B2-D-R2-001
- ID: B2-D-R2-001
- 重要度: Medium
- 種別: 設計
- 対象: 設計 §5.6・§5.8、ADR-0039 案 R2 決定 1
- 内容: LF 区切りだけでは、CRLF の CR を security の check と同じ扱いにできない。
- 根拠: R2 は元の文字列を LF で分割し、各部分を final=true の全行として decideRawChars に渡す。一方 src/security/scan.ts の LineAssembler は LF 直前の CR を除去してから RawCharSink に渡す。CR は control の分類対象なので、例えば文字列 A + U+000D + U+000A + B は、出口側では U+000D を対象とし、security 側では対象としない。N8 の試験群に CRLF を含む一致試験が明記されていない。
- 修正案: 共通判断の前に、LF 直前とファイル末尾の U+000D を LineAssembler と同じ条件で扱う。ただし元の文字列と位置は保持し、出力の字面を変えない。CRLF、単独 CR、CR CR LF、ファイル末尾 CR、長い行と CRLF の分割を N8 に追加する。
- 確度: 確認済み

### B2-D-R2-002
- ID: B2-D-R2-002
- 重要度: Medium
- 種別: テスト
- 対象: 設計 §4.6・§4.8、B2-Q7
- 内容: CPU 時間の比の試験の受け入れ条件は、元の P3 の 17 形をすべて判定することと、CI の時間予算との両立を固定しきれていない。
- 根拠: R2 は 85 組を 256 KiB と 1 MiB で各3回読み、二乗の変異は複数形で検出できたとする。一方設計は強い負荷での比を未測定とし、変異の一部は60秒打ち切りである。比だけの成功例は有力だが、元の17形のそれぞれで比が動作し、T3 の40秒内で完了することまで保証するものではない。
- 修正案: 実装時の受け入れ条件に、17形×5道具の全組で測定が完走し CPU の絶対上限・倍率・作業量の時計をすべて評価できたこと、打ち切りは検出成功でなく別扱いにすること、40秒超ではT3式で根拠付き再設定することを明示する。変異は実際に全試験を通して失敗箇所を記録する。
- 確度: 推測

### B2-D-R2-003
- ID: B2-D-R2-003
- 重要度: Low
- 種別: テスト
- 対象: 設計 §1.6・§1.8、B2-Q1
- 内容: SourceFile の text 一致だけでは AST や束縛情報を後から書き換えた汚染を検出できない。
- 根拠: 50-B は SourceFile.text を照らすが、TypeScript の SourceFile は可変のオブジェクトであり、AST ノードのフラグや識別子・親参照などを変更しても text は一致し得る。T50-5 は text の変更しか確認しない。
- 修正案: テスト用キャッシュを外部に公開しないことを明記し、AST ノードだけを変えた負の試験か、共有される SourceFile の AST 変更を許さない呼び出し境界のテストを追加する。可能なら 50-B の残る制限として明記する。
- 確度: 推測

## 全体の結論

件数: High 0 / Medium 2 / Low 1

HighはないがMediumがあるため終了基準に達していない。50-Bのキャッシュ、53-Fの性能検査、54-Aの保存と表示の分離という基本方針は支持する。各項目の懸念を満たす修正とテストの追加を推奨する。

### R1の5件の対応

- B2-D-R1-001: 部分的に解消。キー4要素、毎回のreadFileとSHA-256、text照合、fixture排除と等価試験で旧SourceFileの利用条件を大きく改善した。ただしtext以外の可変ASTの汚染について境界が残る。
- B2-D-R1-002: 部分的に解消。保存用JSONと表示用文字列を分け、サロゲートの組とJSON.parse後の同一性を規定した点は解消。ただしLFだけの分割ではCRLFの行末CRがsecurityのLineAssemblerと食い違う。
- B2-D-R1-003: 解消。CPU絶対時間に256 KiB対1 MiBの比と二乗変異を追加し、旧指摘の検出力根拠を補った。実装時の完走条件・負荷条件の精緻化は新たなテスト指摘として扱う。
- B2-D-R1-004: 解消。W4〜W10でworkflow本文をbashから実行する計画、空のrun専用dir、偽aiqh、probeとprocess guardの整合が明記された。
- B2-D-R1-005: 解消。正しいwrapperの選択だけを守り、既知の偽陽性を永久的な期待値として固定しない方針に変更した。

### 問い1〜6への回答

1. R1対応: 上記の判定のとおり。50の汚染境界と54のCRLF整合性は残り、53の旧指摘は解消、51と55も解消。
2. 新たな問題: 51のrun専用mktempと早期のreport-dir書き込みは、失敗後にも出力先が渡るようにした合理的な変更。52のrunIdをbuildReport必須入力・レポート型任意にするのは既存レポートとの互換を保つ。54のCRLF問題を指摘。
3. 候補比較: 50-B'はスナップショット寿命の保証が必要になるため退ける理由がある。54-Gも読めるJSONの字面に生の不可視文字を残すため54-Aの方が適切。53-Gの決定的操作数は検出の力が高いがsrc変更を要するので別項目とする判断を支持。
4. テスト検出力: W4〜W10、N4/N8、T50-1〜7は改善。T53の二乗変異の成績は実装者報告であって独立再現ではない。CRLFをN8に加え、53-Fの全組完走条件を明示する必要がある。
5. 出力と利用者への影響: job-summary=true時のレポートの置き場が変わることと、runIdの最上位追加による厳格な外部読み手への影響は文書に必要。ファイルJSONはJSON.parse後の値を維持し、端末の--jsonだけ表示向けに文字列を変更する仕様を明示する方針は支持。
6. 問いと版: B2-Q1、Q7、Q9は上記の条件を追加して扱うことを推奨。他のQとv0.15.1 → v0.16.0 → v0.17.0の版分割に新たな重大な異議なし。

### 実際に読めた範囲

- 添付ZIPの5ファイル: `batch2-design-r2.md`、`batch2-questions-r2.md`、`adr-0038-draft-r2.md`、`adr-0039-draft-r2.md`、`response-r1.md`。
- 固定URL（必須10件、すべて開いた）:
  - `src/review/packet.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/src/review/packet.ts
  - `src/security/scan.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/src/security/scan.ts
  - `.github/workflows/ci.yml`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/.github/workflows/ci.yml
  - `tests/structure/process-guard.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/tests/structure/process-guard.ts
  - `src/security/raw-chars.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/src/security/raw-chars.ts
  - `src/output.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/src/output.ts
  - `src/report/write.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/src/report/write.ts
  - `tests/structure/typescript.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/tests/structure/typescript.ts
  - `.github/workflows/verify.yml`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/.github/workflows/verify.yml
  - `tests/parse-output.test.ts`: https://github.com/youhei-dev/ai-quality-harness/blob/8650a72355e8b606af0ee815044a525b5350e5bd/tests/parse-output.test.ts

### 読めなかった・読まなかった範囲と未確認事項

- 「参考」固定URLはこの回では個別に開いていない。必須10件はすべてアクセスできたが、各ファイルの全行を精読したわけではない。
- `tmp/` のSourceFileキャッシュ・JSON書き手・二乗変異・workflow試作は添付されておらず、独立実行および実測値の再計算はしていない。
- GitHub Actionsの実運用、異なるNode・TypeScript版、強い負荷下のCPU倍率、適用先A/Bの非公開データは未確認。
- CRLFに関する差は設計の行分割規則と既存LineAssemblerを照らした静的判断であり、新設関数のコードは未実装。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch2-design",
  "round": 2,
  "summary": {
    "high": 0,
    "medium": 2,
    "low": 1
  },
  "findings": [
    {
      "id": "B2-D-R2-001",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §5.6・§5.8、ADR-0039 案 R2 決定 1",
      "content": "LF 区切りだけでは、CRLF の CR を security の check と同じ扱いにできない。",
      "evidence": "R2 は元の文字列を LF で分割し、各部分を final=true の全行として decideRawChars に渡す。一方 src/security/scan.ts の LineAssembler は LF 直前の CR を除去してから RawCharSink に渡す。CR は control の分類対象なので、例えば文字列 A + U+000D + U+000A + B は、出口側では U+000D を対象とし、security 側では対象としない。N8 の試験群に CRLF を含む一致試験が明記されていない。",
      "fix": "共通判断の前に、LF 直前とファイル末尾の U+000D を LineAssembler と同じ条件で扱う。ただし元の文字列と位置は保持し、出力の字面を変えない。CRLF、単独 CR、CR CR LF、ファイル末尾 CR、長い行と CRLF の分割を N8 に追加する。",
      "confidence": "確認済み"
    },
    {
      "id": "B2-D-R2-002",
      "severity": "Medium",
      "kind": "テスト",
      "target": "設計 §4.6・§4.8、B2-Q7",
      "content": "CPU 時間の比の試験の受け入れ条件は、元の P3 の 17 形をすべて判定することと、CI の時間予算との両立を固定しきれていない。",
      "evidence": "R2 は 85 組を 256 KiB と 1 MiB で各3回読み、二乗の変異は複数形で検出できたとする。一方設計は強い負荷での比を未測定とし、変異の一部は60秒打ち切りである。比だけの成功例は有力だが、元の17形のそれぞれで比が動作し、T3 の40秒内で完了することまで保証するものではない。",
      "fix": "実装時の受け入れ条件に、17形×5道具の全組で測定が完走し CPU の絶対上限・倍率・作業量の時計をすべて評価できたこと、打ち切りは検出成功でなく別扱いにすること、40秒超ではT3式で根拠付き再設定することを明示する。変異は実際に全試験を通して失敗箇所を記録する。",
      "confidence": "推測"
    },
    {
      "id": "B2-D-R2-003",
      "severity": "Low",
      "kind": "テスト",
      "target": "設計 §1.6・§1.8、B2-Q1",
      "content": "SourceFile の text 一致だけでは AST や束縛情報を後から書き換えた汚染を検出できない。",
      "evidence": "50-B は SourceFile.text を照らすが、TypeScript の SourceFile は可変のオブジェクトであり、AST ノードのフラグや識別子・親参照などを変更しても text は一致し得る。T50-5 は text の変更しか確認しない。",
      "fix": "テスト用キャッシュを外部に公開しないことを明記し、AST ノードだけを変えた負の試験か、共有される SourceFile の AST 変更を許さない呼び出し境界のテストを追加する。可能なら 50-B の残る制限として明記する。",
      "confidence": "推測"
    }
  ],
  "previous": [
    {
      "id": "B2-D-R1-001",
      "assessment": "部分的に解消。キー4要素、毎回のreadFileとSHA-256、text照合、fixture排除と等価試験で旧SourceFileの利用条件を大きく改善した。ただしtext以外の可変ASTの汚染について境界が残る。"
    },
    {
      "id": "B2-D-R1-002",
      "assessment": "部分的に解消。保存用JSONと表示用文字列を分け、サロゲートの組とJSON.parse後の同一性を規定した点は解消。ただしLFだけの分割ではCRLFの行末CRがsecurityのLineAssemblerと食い違う。"
    },
    {
      "id": "B2-D-R1-003",
      "assessment": "解消。CPU絶対時間に256 KiB対1 MiBの比と二乗変異を追加し、旧指摘の検出力根拠を補った。実装時の完走条件・負荷条件の精緻化は新たなテスト指摘として扱う。"
    },
    {
      "id": "B2-D-R1-004",
      "assessment": "解消。W4〜W10でworkflow本文をbashから実行する計画、空のrun専用dir、偽aiqh、probeとprocess guardの整合が明記された。"
    },
    {
      "id": "B2-D-R1-005",
      "assessment": "解消。正しいwrapperの選択だけを守り、既知の偽陽性を永久的な期待値として固定しない方針に変更した。"
    }
  ]
}
```
