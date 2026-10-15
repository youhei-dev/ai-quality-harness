> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-m2-2-parsers-r1-for-claude.md`（2026-10-15 受領、6,050 バイト、LF 51・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `c29657780c0b913073e3e0c31974fd8a8240f20014fd27dd0c3fe4dfed6a6200`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.8.0 の `aiqh review-import` でそのまま取り込めた）。原文の 14 行目にある Markdown のリンクの例（例示の URL）は、原文のとおりバッククォートの中にある。

---

# 独立コードレビュー — m2-2-parsers / R1

対象: `v0.7.0..v0.8.0`。提出されたパケットの差分、変更ファイル全文、および同梱された参照ファイルを静的に調査した。コード・テストは実行していない。

## 指摘

### M2-2-PS-R1-001

- ID: M2-2-PS-R1-001
- 重要度: Medium
- 種別: バグ
- 対象: `src/report/markdown.ts:104-117`（`renderParsed`）、`src/report/markdown.ts:181-185`（`oneLine`）、`src/parse/text.ts:130-133`（`nameOf`）
- 内容: ツール出力由来の失敗名がMarkdownのリスト項目へエスケープされず挿入される。秘密情報のマスクと禁止制御文字の表記は通るが、Markdownリンク・画像・強調・インラインHTMLなどの構文はそのまま解釈され得る。P4の「信頼できない文字列を既存のマスクと表記に通す」という文字処理自体は行われているものの、生成レポートの表示内容を入力側が操作できる。
- 根拠: `ItemList.add` は `nameOf` を呼び、`nameOf` は `maskSecrets(line.trim())` の後に長さを切るだけ。`renderParsed` は `` `- ${oneLine(item.kind)}: ${oneLine(item.name)}` `` として出力し、`oneLine` は `escapeRawChars` を返すだけでMarkdown構文のメタ文字をエスケープしない。たとえば失敗名に `` `[詳細](https://example.invalid/path)` `` が含まれると、`latest.md` の通常のMarkdownレンダラでリンクになり得る。`src/report/build-report.ts` の `copyJson(report, maskSecrets)` もMarkdownエスケープは行わない。なお同様の構文処理は既存のほかの値にも存在するが、新規の `checks[].parsed.items` が未信頼のツール出力を一覧へ追加する経路は今回の変更による。
- 修正案: `renderParsed` の表示名に、制御文字表記に加えMarkdownのインライン構文とHTML解釈を無効化する専用のエスケープを適用する。表示する名前の範囲を変えない形で実装し、リンク・画像・インラインHTML・バッククォート・改行相当の入力がテキストとしてのみ描画される回帰テストを追加する。JSONの保存値は変更せず、Markdownのレンダリング境界で対処する。
- 確度: 確認済み

## 全体の結論

件数: High 0 / Medium 1 / Low 0

**HighはないがMediumが1件あるため、事前に指定された「High・Mediumが0なら終了」の条件は満たさない。** 指摘の修正後、Markdown出力の回帰テストと再レビューを勧める。

1. **問い1（判定・終了コード・継続）:** `toCheckResult` は `status` と既存フィールドを先に決定してから `readCheckOutput` を呼ぶ。`parseOutputAs` は通常のパーサ例外と協調的な時間切れを `unparsed` に変換し、`computeVerdict` は `parsed` を参照しない。パケット範囲では結果を直接書き換える経路は認めない。ただし同期I/Oの停止不能性を含むあらゆる外部環境での完了保証までは立証できない。
2. **問い2（線形性・上限）:** `prepareStream` は各ストリーム末尾最大1 Mi UTF-16コード単位を抽出し、4,096超の行を無視する。標準パーサの走査、件数の桁制限、項目最大50件もコード上確認した。`Budget` は1,024行ごとの協調チェックであり、準備処理や同期ファイル読み取りを強制中断できる絶対的な時間上限ではない。maskerに関する既知の超線形ケースは今回の新規指摘に含めない。
3. **問い3（マスク・表記）:** `nameOf` で全行をマスクしてから切り詰め、端末側は `createOutput` の安全な出力境界、レポート側はマスク済みの `copyJson` を通す。一方、Markdown構文の解釈を抑止しない新規経路がある（上記Medium）。
4. **問い4（パーサ選択）:** `selectParser` は入力コマンドを読み取るだけで変更しない。複数候補は `not-applicable`、読めない `package.json` は `unparsed`。単語によるツール推定の誤認は依頼書で明示された既知の限界の範囲。追加の確定的な中・高重要度問題は見いだしていない。
5. **問い5（互換性）:** `schemaVersion: 1` とレポート最上位キーは維持され、新規欄は各check内のみ。`src/review/packet.ts` の提示範囲では新規欄を理由に失敗する読み方は見つからない。未収録の外部消費者まで互換性を保証するものではない。

**未確認範囲:** パケットに含まれない `src/cli.ts`、設定読込、`tests/structure/`、外部のレポート消費者、実際の全テストログ、実行時間の実測、Windows。実行を伴う再現テストは行っていない。新たなHigh・Mediumの判定に直結する追加資料の要求は現時点でない。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "m2-2-parsers",
  "round": 1,
  "summary": { "high": 0, "medium": 1, "low": 0 },
  "findings": [
    {
      "id": "M2-2-PS-R1-001",
      "severity": "Medium",
      "kind": "バグ",
      "target": "src/report/markdown.ts:104-117,181-185; src/parse/text.ts:130-133",
      "content": "未信頼の失敗名がMarkdownのリスト項目へ構文エスケープなしで挿入され、リンク・画像・インラインHTMLなどとして解釈され得る。",
      "evidence": "ItemList.addからnameOfに渡される名前はマスクと長さ制限のみ。renderParsedはoneLine(item.name)をMarkdownへ直接挿入し、oneLineはescapeRawCharsのみ。リンク構文を含む名前はMarkdownリンクになり得る。",
      "fix": "Markdown表示境界で名前の構文とHTML解釈を無効化するエスケープを追加し、リンク・画像・インラインHTML・バッククォートの回帰テストを加える。JSONの値は維持する。",
      "confidence": "確認済み"
    }
  ]
}
```
