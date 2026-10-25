> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch1-v0150-impl-r1-for-claude.md`（2026-10-26 受領、9,696 バイト、LF 73・CR 0・TAB 0・U+FFFD なし・生の文字〈層 (c) を含む〉なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `b0979ede51a62e9bc7019c4c0753a81ef484884dacd69027c50f86a93903b897`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.15.0 の `aiqh review-import` でそのまま取り込めた）。

---

# aiqh v0.15.0 独立実装レビュー R1

対象: `c520d88dccbac6e28e54c91685b2d67c0b8375af..cf8a7ec306c7b72869f9d97ea310bc22765af216`。静的コードレビューであり、実装者のテスト実行記録は独立再実行した事実とは区別する。パケット中のコード全文と差分を判断の一次資料とし、GitHub の固定コミットの設計正本・関連コードを照合した。

## 全体の結論

件数: High 0 / Medium 0 / Low 0

**判定**: 今回実際に精査したコードおよびテストに、High・Medium・Low として起票できる確定的な不整合は確認しなかった。したがって依頼書の「High・Medium 0」の静的レビュー終了基準を満たす。ただし、独立した実行テスト、Unicode 全列挙、任意の長さの窓・文字列に対する形式的証明を完了したとの意味ではない。実装者の報告する負荷測定・変異試験の実行ログ自体はパケットに収録されておらず、独立に再現していない。

### 問い 1: B1-D-R1-003 — 解消

`src/security/raw-chars.ts` の `isExemptionCandidate` は U+200D、U+FE0F、U+E0020–U+E007F に限定する。`runChar` は Emoji と Emoji_Component の和を使い、`insideSequences` は sticky な `RGI_Emoji` を run の先頭から逐次照合し、区間内部のみ除外する。`decideRawChars` は両端の確定を条件とする。U+FE0E、U+E0001、U+E0100、U+180B は候補でなく finding 側になる。設定の切替ではなく、除外位置数を `rawCharsExempted` として集計する設計とも整合。L4・L13〜L19 は不正なタグ列、余分な結合文字、連続列を扱う。既存の設計不変条件 I1〜I4・I7・I8 に対応する実装として解消と評価する。

### 問い 2: B1-D-R1-006 — 解消

`SCANNED_RAW_RANGES` と `RAW_CHAR_CATEGORIES` に 8 分類が追加され、旧11符号位置・`FORBIDDEN_RANGES` を保持する。BMP 表および補助面範囲のカテゴリ参照を確認した。L20 は Unicode 属性との差分を検査し、L21〜L23 は 8 KiB 前後の NUL、行末と途中の CR、CR LF、先頭と途中の BOM を分ける。`LineAssembler` による CR の扱いと、`decideRawChars` の先頭 BOM 判定は設計に沿う。Unicode 属性の完全な独立再計算は行っていないが、集合と境界の実装・受入テストが揃っているため解消とする。

### 問い 3: B1-D-R2-001 — 解消

`LineAssembler` は `offset`、`final`、`tailStart` を渡す。`tailStart` は保証される末尾の始まりで、実際の `from` が小さくなる場合も、保証された重なりだけを根拠に defer する。`decideRawChars` は両端を見られれば決定、窓先頭に接する・左隣が保証末尾の外などでは finding、確実に次窓に残るときだけ defer。`RawCharSink.decided` は位置を再判定せず、次窓の先頭より古い位置だけ捨てる。L16 (a)〜(g) は境界幅、EOF、改行、長い持ち越し、サロゲート分割、境界位置の掃引、複数窓を扱う。意図的に FAIL 側へ倒す既知の誤検出以外の明確な欠落を確認できず解消とする。

### 問い 4: B1-D-R2-003 — 解消

`RawCharDecision` が出現位置と `exempt` を保持し、`RawCharSink` は除外した位置の数を加算する。一方 finding は `行番号:符号位置`、パス名では `符号位置` で重複排除する。除外は同じ鍵の finding を消さず、allow は後段で finding に作用する。L24 が同一行の混在、位置順の入替え、パス名、重なり、allow を固定しており、I9 の二層の計数契約は解消。

### 問い 5: B1-I140-R1-001 — 解消。v0.15.0 の空の `=` の修正 — 解消

`src/adapters/node.ts` の `runsNodeTest` は、値を別語で取る場合には値が無い、または `-` で始まる場合を拒否する（v0.14.1 の修正）。さらに inline の `--name=` で `=` 直後が空なら拒否する（v0.15.0）。18 の値付きオプションを対象とした N5r と、正常値の N2e が対応する。`--import=x` 等の正常な形まで落とさないよう守りがある。Nodeの全バージョンの挙動まで保証するものではないが、固定した対象 Node の仕様への対応として解消とする。

### 問い 6: 拾いすぎ・拾い漏れ

指摘なし。RGIの前後に E の文字がある場合、余分な U+200D・U+FE0F・タグ文字、キーキャップ、肌色、旗、連続した並び、パス区切りをまたぐ場合を L13〜L18 と L17 で確認。長い行、サロゲートの半分、CR LF の分割については L16 と L22 に専用のケースがある。窓から消える文脈不足の run を finding とする挙動は、明示的に受け入れた FAIL 側の限界であり新規欠陥として再起票しない。すべての Unicode 列を総当たりしたわけではない。

### 問い 7: 性能

指摘なし。走査前の `firstRawUnit`、run の左右への探索、sticky 最長一致、位置ごとの重複抑制は、読み取り範囲を一定の窓に限定した線形志向の構成。L11 は6系統の 1 MiB 入力に対して Emoji 集合照合と RGI 一致の回数を測る。ただし `work.steps` は UTF-16 の初期走査・Set 操作・割当・正規表現内部の試行回数までは計測しないため、これだけで厳密な総実行時間 O(n) を証明しない。実装者の約0.33秒の中央値は記録として参照するにとどめ、独立測定済みとはしない。

### 問い 8: テスト検出力と弱化、変異の同値性

指摘なし。新テストの L1〜L24 と L16 (a)〜(g)、I5 の分岐テスト、および既存 item48 の変更3箇所を実際に検査した。旧11符号位置の範囲確認を削除しておらず、新規カテゴリを追加した結果と対応する期待への変更である。実装者の 22 変異のうち 21 で FAIL したという数値は実行ログ未添付のため独立追認できない。残りの「I1 の候補に U+FE0E と U+200B を加える」変異は、現在の `insideSequences` が両文字を RGI の一致内部とみなさない限り `exempt` の真偽が変わらないため、観測される finding と除外数について同値という判断はコード上妥当。ただし I1 の内部的な集合の同値性を意味するのではなく、**現在の最終出力についての同値性**である。将来の matcher/Unicode の変更時は再評価が必要。

### 問い 9: 利用者向けの影響

指摘なし。CHANGELOG、README、CONFIG_SPEC に、既定で FAIL が増えること、導入前の走査、`category` つき allow、RGI の例外、窓の限界、件数と除外位置数の区別が書かれていることをパケットで照合した。適用先 B に allow が必要という記録を、そのまま一般の利用者に適用できる保証とは扱わない。

### 問い 10: ADRと記録

指摘なし。採用済み ADR-0037 の実装節と案との差分、ADR-0011・ADR-0036 の追記、ARCHITECTURE、ROADMAP の項目49・54、findings の実装者欄をパケットで確認した。層 (c) の文字を review-packet と出力のエスケープ集合に加えない既知の限界は項目54に残し、この版の修正完了と取り違えていない。パーサの件数行が変わらない契約と、追加行を無視する既存の読み方も関連コードと合う。

### 実際に読めた範囲

- ZIP 1ファイルの `review-packet-batch1-v0150-impl.md` を展開し、Metadata、Request、変更ファイルの全文・差分、Verification、および `src/security/raw-chars.ts`、`src/security/scan.ts`、`src/commands/security-scan.ts`、`src/adapters/node.ts`、`schema/aiqh.config.schema.json`、item45/item48/item49 テスト、ADR-0037、ADR-0011、ADR-0036、README、CHANGELOG、CONFIG_SPEC、ARCHITECTURE、ROADMAP、findings と response の記載を確認した。
- GitHub の **指定 SHA 固定 URL を実際に開いて本文を確認**: `docs/reviews/batch1-design/design-final.md`、`docs/reviews/batch1-design/adr-0037-draft-final.md`、`docs/reviews/batch1-design/questions-final.md`、`src/config/window-limits.ts`、`src/config/schema.ts`、`src/parse/security-scan.ts`、`src/security/patterns.ts`、v0.14.1 の修正 commit `545eeffffbfb6f88e07d27e4a031c77102813acf`。これらの GitHub URL の元のコミットは `cf8a7ec306c7b72869f9d97ea310bc22765af216`（修正 commit を除く）。

### 読めなかった・読まなかった範囲

- 指定 URL の全24件を GitHub 上で開いたわけではない。上記以外の固定 URL（設計レビュー原文・応答各回、`src/output.ts`、`src/review/packet.ts`、`tests/parse-security.test.ts`、fixture、ADR-0012・0016・0020 など）は、GitHub 側の本文を独立には開いていない。パケットに内容が入る変更ファイルを除き、リンク先の未変更コードを全面照合したとは主張しない。
- Node/ICU 全 RGI の独立列挙、実際の Node 24.13.1 でのテスト再実行、性能の独立ベンチマーク、変更前 FAIL の再現、22変異の実行ログ、非公開の適用先 A・B の中身は未確認。テスト・CI・負荷の PASS は実装者の報告であり、このレビューで再実行した結果ではない。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch1-v0150-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "findings": []
}
```
