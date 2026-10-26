> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch2-v0151-impl-r1-for-claude.md`（2026-10-26 受領、8,856 バイト、LF 78・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `76b087771efce8ffb8bdb3ec1c51efb91651e7b1c59445d36544034fd291bead`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.16.0 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# aiqh batch2 v0.15.1 実装の独立レビュー（R1）

対象: 8650a72355e8b606af0ee815044a525b5350e5bd..1960630ccdfd203a6a37e313c20653d5c6d0a8fd。静的レビュー。

## 指摘

### B2-I151-R1-001

- ID: B2-I151-R1-001
- 重要度: Medium
- 種別: バグ
- 対象: tests/structure/typescript.ts の conditionOf・reusing、設計最終 §1.6、T50-3・T50-3b
- 内容: SourceFile の解析条件について、既知と認めたオプションの一部がキャッシュキーから抜けている。解析条件が異なる SourceFile を同じものとして再利用しうる。
- 根拠: conditionOf は PARSE_KEYS に setExternalModuleIndicator・packageJsonLocations・packageJsonScope を含め、これらの存在を拒まない。一方、返すキーは languageVersion・impliedNodeFormat・jsDocParsingMode だけである。reusing は同じパス・本文・optionsKey なら既存 SourceFile を返す。T50-3b は package.json の type による impliedNodeFormat の違いしか検査しておらず、上記3フィールドのみ異なる条件を検査しない。固定コミットの output-guard.ts と parse/read.ts も参照し、製品コードの変更でなくテスト共通部品の同一性契約の問題と判定した。
- 修正案: 上記3フィールドが与えられた場合は保守的にキャッシュを使わず元の host.getSourceFile に戻すか、値の意味を保持できる安定した同一性をキーに含める。最初の実行と、条件だけを変更した2回目の実行で別 SourceFile になる T50 の負のテストを足す。元の host とキャッシュ経路の解析・診断結果を比較する。
- 確度: 確認済み

## 全体の結論

件数: High 0 / Medium 1 / Low 0

Mediumが残るため、依頼の終了基準には未達。v0.15.1の製品コード自体は変わらないが、テストの共通部品のキャッシュ条件漏れは、以後のガードの信頼性に影響しうる。

### 問い1〜9への回答

**1. B2-D-R2-002。** 解消。P3 は各 shape に対して tools 全5件をループし、64 KiB の1回、256 KiB・1 MiB の各3回で作業量の理由とCPU時間を確認し、両サイズの最小値で比を判定する。末尾で evaluated と tools.length を比較するため、途中で例外・timeout があれば PASS しない。70秒は静かな測定の最大5.54秒の12倍を10秒単位に切り上げた値。MUT-1・MUT-2 は実装者の記録上、新しい比だけが5形ずつ検出しているが、変異ログと高負荷下の独立実行は未確認。

**2. 53 の測り方。** 指摘なし。threadCpuUsage の差は同じスレッドのCPU使用を測る。T53-1 の Atomics.wait と T53-2 のCPUビジーループが、壁時計への退行とCPU計測を失う退行を区別する。3回の最小は遅延に対して頑健だが、偶然の高速実行や1MiBを超える入力の非線形は対象外という既知の限界を残す。

**3. B2-D-R2-003 と B2-D-R1-001。** B2-D-R2-003 は「部分的に解消」。AST本文以外の汚染を検知しない限界を明示したが、キャッシュ同一性には別の条件漏れがある。B2-D-R1-001 の残りも「部分的に解消」。本文のSHA-256・パス・コンパイラオプション・一部解析条件と、reuse:false・shouldCreate・読み取り不能時の後退は実装されたが、解析条件を網羅したという主張はまだ成立しない。

**4. 50 キャッシュと検出力。** キャッシュの条件漏れに指摘あり。fixture はキャッシュを通さず、known.text の一致を検査する点は妥当。T50-1〜7 と T50-3b の負・正の確認は有益で、builtin-r3 は19件の型診断とガード答えを保持する。テスト側のガード故障変異は同じ検出数との報告だが、報告された汎用cast変異はもともと検出が重複し、変異試験だけで完全な等価性は証明できない。

**5. 51 ワークフロー。** 指摘なし。mktemp によりRUNNER_TEMP内の個別ディレクトリを生成し、verify前にreport-dirを出力、summaryはそのパスだけを読む。W4〜W10 は抽出した2つのrun本文を bash -e で実行し、新規・不在・過去のレポート・verify失敗を確認する。実際のGitHub Actionsの式展開やjobの実行は独立には再現していない。probe の追加は特定の外部コマンドだけを宣言しており、ガードを無制限に緩めてはいない。

**6. 55 の守り。** 指摘なし。追加した5形は現状で正しく件数を選べる正の互換例だけであり、echo の偽陽性を将来も必ず許す負の固定テストにはなっていない。

**7. 既存テストの強さ。** キャッシュ条件以外に指摘なし。P3 の測定器と時間上限、builtin-r3 のprogram生成の共有、workflowの参照パスが変更された。既存の検査を単に削除する変更ではない。70秒への拡大はT3の観測値から導かれるが、停止した処理の検知はそれだけ遅くなる。

**8. 利用者への影響。** 指摘なし。job-summary:true でレポートはRUNNER_TEMPの実行固有ディレクトリに移り、同じjobの後続手順が従来の artifacts/verification を読む場合は影響する。README、CHANGELOG、reusable-workflowの説明とADR-0031の注記はこの変更を説明している。

**9. 文書と記録。** 指摘なし。ただし SourceFile のキャッシュが解析条件を完全に区別するという説明は、指摘した条件漏れの是正後に再確認する必要がある。ADR-0028決定13は現行の他ツールの選択を保持する内容、ROADMAPと実装記録はおおむね整合する。

### 実際に読めた範囲

- 添付の review-request 全文、ZIP内の単一Markdownパケットの依頼、変更一覧・差分、関連する新規・変更テストと TypeScript helper、ワークフロー、設計・応答の該当箇所。
- GitHub 固定URLの必須8件: src/parse/read.ts、src/parse/text.ts、src/parse/select.ts、src/commands/verify.ts、src/config/load.ts、tests/structure/output-guard.ts、tests/zip-interop.test.ts、scripts/test-minimal-path.ts。いずれもURLを実際に開いた。

### 読めなかった・読まなかった範囲

- GitHubの「必要なら」URL4件は個別のURLとしては開いていない。パケットの全文に含まれた一部のファイル内容は参照した。
- パケットの長大な設計・記録・全差分を全行逐語照合したわけではない。独立のテスト実行、実装者の変異worktreeや負荷ログの検証、GitHub Actionsの実ジョブ操作はしていない。
- TypeScript内部のsourceFileAffectingCompilerOptionsの配布物をこの環境で実測しておらず、どの解析条件が実際のガード結果に影響するかは追加検証が必要。ただしキーから3項目の値が欠けること自体はコード上確認済み。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch2-v0151-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 1,
    "low": 0
  },
  "findings": [
    {
      "id": "B2-I151-R1-001",
      "severity": "Medium",
      "kind": "バグ",
      "target": "tests/structure/typescript.ts の conditionOf・reusing、設計最終 §1.6、T50-3・T50-3b",
      "content": "SourceFile の解析条件について、既知と認めたオプションの一部がキャッシュキーから抜けている。解析条件が異なる SourceFile を同じものとして再利用しうる。",
      "evidence": "conditionOf は PARSE_KEYS に setExternalModuleIndicator・packageJsonLocations・packageJsonScope を含め、これらの存在を拒まない。一方、返すキーは languageVersion・impliedNodeFormat・jsDocParsingMode だけである。reusing は同じパス・本文・optionsKey なら既存 SourceFile を返す。T50-3b は package.json の type による impliedNodeFormat の違いしか検査しておらず、上記3フィールドのみ異なる条件を検査しない。固定コミットの output-guard.ts と parse/read.ts も参照し、製品コードの変更でなくテスト共通部品の同一性契約の問題と判定した。",
      "fix": "上記3フィールドが与えられた場合は保守的にキャッシュを使わず元の host.getSourceFile に戻すか、値の意味を保持できる安定した同一性をキーに含める。最初の実行と、条件だけを変更した2回目の実行で別 SourceFile になる T50 の負のテストを足す。元の host とキャッシュ経路の解析・診断結果を比較する。",
      "confidence": "確認済み"
    }
  ]
}
```
