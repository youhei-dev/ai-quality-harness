> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch2-v0160-impl-r1-for-claude.md`（2026-10-29 受領、6,560 バイト、LF 66・CR 0・TAB 0・U+FFFD なし・生の文字〈層 (c) を含む〉なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `5a07f3946d3817f9f3e8fe30dd418967d50eccb70262dc73f71c489b719e062f`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.17.0 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# aiqh v0.16.0 独立実装レビュー R1

対象: `98d7ddf8d3ee9724d83ad4f8d995fccc1d809ed9..3b6b1c31d0569665f51ff12ee885af34d71e9603`。添付パケットの変更後全文・差分・設計と、依頼文の固定 URL のコードを独立に読み、静的に照合した。製品やテストの実行結果は再現実験として確認していない。

## 全体の結論

件数: High 0 / Medium 0 / Low 0

**High・Medium の新規指摘はなく、依頼文の終了基準を静的レビューの範囲で満たす。** 指摘は 0 件。ただし、TypeScript の配布物の実行時挙動、旧版 CLI の実行互換、実装者による変異試験・CI PASS は独立に再実行していない。

### 問い 1 — キャッシュの指摘

- `B2-I151-R1-001`: **解消**。`tests/structure/typescript.ts` の `PARSE_KEYS` は `setExternalModuleIndicator`・`packageJsonLocations`・`packageJsonScope` を認識し、`conditionOf` は前者の有無、位置配列、scope のディレクトリと package.json 内容のハッシュをキーに入れる。`sameModuleIndicator` はキャッシュを返す前に indicator を再計算し不一致ならホストのパーサへ戻す。T50-8a〜8g が条件の差、未知の形、TypeScript 自身の条件を扱う。
- `setExternalModuleIndicator` の関数オブジェクトそのものを鍵に入れない方針は、値の等価性と事前の再計算を組み合わせる設計として妥当。`packageJsonScope` を作った後で TypeScript が SourceFile に付けるという前提は指定の TypeScript 5.9.3 ソースとも整合する。
- ただし、実装者が報告した 39,415 回の `getSourceFile` 呼び出しと 8 変異の成績はログ未添付につき独立追認していない。

### 問い 2 — 設計指摘の残り

- `B2-D-R1-001`: **解消**。キャッシュの鍵の不足は前項の追加条件と再利用前の確認で補強された。
- `B2-D-R2-003`: **部分的に解消**。text の一致だけでは AST ノードだけの外部変更を検出しない制約を明示し、解析条件の取りこぼしには対処した。ただし AST の変更を見つける機能自体は実装していない。これは依頼文が既知の残余として許容したものであり、本レビューで改めて指摘として発行しない。

### 問い 3 — 項目 52 の実装

- `runVerify` が開始後、チェック実行前に `randomUUID()` を一度生成し、必須の `BuildReportInput.runId` へ渡す。`buildReport` は値を生成せず、最上位の `startedAt` の直前に配置する。Markdown は `Started` の直前に `Run ID` を表示し、history は同じレポートを保存する。中断の R6 と UUID v4 の R3 のテストがある。端末では runId を表示しないことをテストしている。
- `VerificationReport.runId` は任意の欄なので、旧形式レポートも型・読み手に残せる。

### 問い 4 — 同一ミリ秒と旧版の互換

- `regression-item47-latest-pair-race.test.ts` は `startedAt` が同一でも A と B が異なる runId を持ち、`latest.json` と `latest.md` の混在を識別できること、および history が一意に絞れることをテストする。混在それ自体を解消したとは書いていない。
- 新しい `aiqh history` は runId の無い history を同じように読める R5 を持つ。固定 URL の `run-history/read.ts` と `review/packet.ts` は知らない上位欄を保存せず読む設計で、runId 追加は読み取りを壊さない方向。旧版の `aiqh history` で新しいレポートを読む実行結果は実装者の報告であり、こちらでは再実行していない。

### 問い 5 — 既存テストの検出力

- 変更後のテスト全文を見る限り、最上位キーの並び・数、47-c-2・47-c-3、`buildReport` 呼び出しへの引数追加が対象。47-c-3 では従来の「`startedAt` では分からない」という期待を維持したまま runId の確認を追加しており、既存の守りを削除していない。

### 問い 6 — 利用者への影響

- README、CHANGELOG、ADR-0038、ARCHITECTURE の記載は、JSON に任意の `runId` が増えること、Markdown と Job Summary に `Run ID` が出ること、`schemaVersion: 1` の維持、旧データの `startedAt` によるフォールバック、および並行更新の未解決を区別する方向で一致する。追加フィールドを拒む外部の厳格な読み手には互換性上の注意が要る。

### 問い 7 — 文書と記録

- パケットに収録された ADR-0038 の採用版、ADR-0003・ADR-0034 の追記、ROADMAP の 47・50・52、v0.15.1・v0.16.0、関連 findings と response を実装の記述と照合し、今回の範囲で新たな重要度付き指摘はない。

### 実際に読めた範囲

- 添付 ZIP の `review-packet-batch2-v0160-impl.md` に記載された変更ファイル全文・差分と、関連テストの全文。主に `src/commands/verify.ts`、`src/report/build-report.ts`、`src/report/markdown.ts`、`src/types.ts`、`tests/structure/typescript.ts`、`tests/structure-typescript-reuse.test.ts`、`tests/regression-item52-run-id.test.ts`、`tests/regression-item47-latest-pair-race.test.ts`、変更された最上位キーのテスト、ADR・CHANGELOG・README。
- 指定された「必ず開く」の固定 URL は 7 本のURLをすべて開いた（TypeScript program.ts の2つの異なる行指定を含む）。`src/report/write.ts`、`src/run-history/read.ts`、`src/review/packet.ts`、`tests/regression-item47-latest-pair-started-at.test.ts`、TypeScript v5.9.3 の `program.ts` 2箇所、`utilities.ts`。GitHub の閲覧は固定コミットまたは固定タグで行った。

### 読めなかった・確かめきれなかった範囲

- 「必要なら」の固定 URL は個別には開いていない。TypeScript 5.9.3 の文書レジストリ、parser.ts、compiler options の一覧等の全経路を独自に実行追跡したわけではない。
- 直す前の FAIL ログ、AST・構文解析差を確かめる変異の生ログ、適用先の実データ、旧版 aiqh の実行試験、CI の再実行は未確認。SourceFile のノードだけを改変したケースは既知の限界として残る。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch2-v0160-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "findings": []
}
```
