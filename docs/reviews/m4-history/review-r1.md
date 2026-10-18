> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-m4-history-r1-for-claude.md`（2026-10-18 受領、6,895 バイト、LF 64・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `7fcb7224ca310b47dc3a89170ba38265044103a554a69221d6f1a54f8fc027b0`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.11.1 の `aiqh review-import` でそのまま取り込めた）。

---

# 独立レビュー結果（m4-history / R1）

対象: fe8de3aeead0..074ebc4d68ef。添付パケットのソース全文・差分・テストを静的に確認した。コードとテストの実行は行っていない。

### M4-H-R1-001
- ID: M4-H-R1-001
- 重要度: Medium
- 種別: バグ
- 対象: src/commands/history.ts:102-111、src/output.ts:233-238、tests/history-cli.test.ts の出力上限の境界テスト
- 内容: 出力の実バイト数の 32 MiB 上限を、最後まで実際に標準出力へ書く全バイトに適用できていない。表は最終の HISTORY COMPLETE / INCOMPLETE 行を数えず、JSON は書き込み時の改行を数えない。境界で上限超過にもかかわらず出力して exit 0 または 2 となる。
- 根拠: runHistory の表分岐は tableLines の各行と LF の合計のみを bytes とし、判定後に output.log(lastLine(agg.value)) を追加する。JSON 分岐の jsonWithin は safeJson の Buffer.byteLength だけを比較するが、既定の emitOut(text, true) は console.log により末尾 LF を追加する。tests/history-cli.test.ts の表テストは full.out.slice(0, -1) で最終行を明示的に除外し、JSON テストは sink が受け取る改行前の文字列で境界を作っている。このため両方とも実際の端末出力を上限内に制限する仕様を検査していない。
- 修正案: 標準出力に実際に書く全行と改行を含めて先にサイズを計算し、上限以下の場合だけまとめて出力する。JSON も既定 writer が追加する LF を含めて判定するか、改行の扱いを出力 API で明示的に統一する。上限ぴったり、1 バイト超過、最終行だけで超えるケースを、実際の書き込みバイト数でテストする。
- 確度: 確認済み

## 設計の指摘の確かめ
- M4-D-R1-001: 解消。記述子から最大 8 MiB + 1 バイトを読み、前後のサイズを照合し、読んだ実バイト数を総量に加算する。競合と境界のテストもある。
- M4-D-R1-002: 解消。読み始めと終了時に、解決済みのルート、祖先、履歴ディレクトリの種類と dev・ino を比較する。差し替えの検出に限る旨も明記されている。
- M4-D-R1-003: 解消。名前と版の UTF-8 バイト長、check の個数を検証してから保持する。不正な値は切り詰めず bad-shape とする。
- M4-D-R1-005: 解消。ADR-0029 に扱いを追記し、集計へ parsed.items を保持せず、allow ルール名が出ないことを sentinel で検査している。
- M4-D-R2-001: 部分的に解消。safeJson は個別の文字列とキーをマスクし、数値葉の上限もあるが、端末出力の実バイト数上限には指摘の抜けが残る。HTML は v0.12.0 の対象外。
- M4-D-R2-002: 解消。各 run の durationMs / (timeoutSec × 1000) の最大を maxShareOfTimeout とし、最後の timeoutSec を独立して記録する。
- M4-D-R2-003: 解消。safe integer、正の timeoutSec の検査と、集計後の非有限値の検査がある。

## 全体の結論
件数: High 0 / Medium 1 / Low 0

High は 0 件、Medium は 1 件。事前に定められた終了条件である High・Medium ともに 0 件を満たさないため、出力サイズの修正と回帰テストが必要。

問い 1: 出力上限に指摘あり。マスク単位、数値葉の上限、run ごとの timeout 割合、安全な整数と有限性には指摘なし。
問い 2: 設計 R1 の対象 4 件について指摘なし。
問い 3: 記述子の検証、上限、分類、未知フィールドの破棄、counts の既知キーのみの Map への移送に指摘なし。
問い 4: 保持対象を限定した集計と出力、マスク後の表示切り詰めに指摘なし。
問い 5: 出力上限の判定に指摘あり。通常の終了コードの振り分け、未読情報、決定的な並び順に指摘なし。
問い 6: 単一 Buffer からの設定文字列と SHA-256、timeoutSec の上限と設定エラー処理に指摘なし。
問い 7: 最終行と改行を含む実出力バイト数の境界テストが不足。その他、提示された主要な境界・競合・目印文字列テストに指摘なし。
問い 8: git の追跡対象全ファイルの禁止文字チェックと出力の制限に指摘なし。対象プロジェクトの security check の未検出を Medium として後続版に回す記録は、検出回避のリスクを認識した優先順位として妥当。ただし継続管理が必要。

未確認範囲: パケット外の src/security/raw-chars.ts、src/security/mask.ts、src/report/write.ts、src/security/scan.ts、tests/structure/output-guard.ts の全文との独立照合、実際のファイル I/O の競合再現、実行テスト、対象外 HTML 実装。自己 verify の PASS はパケット記録として確認したが独立再実行していない。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "m4-history",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 1,
    "low": 0
  },
  "findings": [
    {
      "id": "M4-H-R1-001",
      "severity": "Medium",
      "kind": "バグ",
      "target": "src/commands/history.ts:102-111、src/output.ts:233-238、tests/history-cli.test.ts の出力上限の境界テスト",
      "content": "出力の実バイト数の 32 MiB 上限を、最後まで実際に標準出力へ書く全バイトに適用できていない。表は最終の HISTORY COMPLETE / INCOMPLETE 行を数えず、JSON は書き込み時の改行を数えない。境界で上限超過にもかかわらず出力して exit 0 または 2 となる。",
      "evidence": "runHistory の表分岐は tableLines の各行と LF の合計のみを bytes とし、判定後に output.log(lastLine(agg.value)) を追加する。JSON 分岐の jsonWithin は safeJson の Buffer.byteLength だけを比較するが、既定の emitOut(text, true) は console.log により末尾 LF を追加する。tests/history-cli.test.ts の表テストは full.out.slice(0, -1) で最終行を明示的に除外し、JSON テストは sink が受け取る改行前の文字列で境界を作っている。このため両方とも実際の端末出力を上限内に制限する仕様を検査していない。",
      "fix": "標準出力に実際に書く全行と改行を含めて先にサイズを計算し、上限以下の場合だけまとめて出力する。JSON も既定 writer が追加する LF を含めて判定するか、改行の扱いを出力 API で明示的に統一する。上限ぴったり、1 バイト超過、最終行だけで超えるケースを、実際の書き込みバイト数でテストする。",
      "confidence": "確認済み"
    }
  ],
  "previous": []
}
```
