# Changelog

M0（verify の中核）の各タグと、対応した独立レビューのラウンド。詳細は `docs/reviews/m0/` と `docs/reports/`。

## v0.1.5 — M0 complete（予定: 本 CHANGELOG を含む commit の後に付与）

- 独立レビュー R5（4 件）を反映: シグナルハンドラ差し替えの原子性（R5-001）、確定点の観測可能な意味論への表現変更（R5-002）、verdict の確定点と CLI 終了結果の分離（R5-003、案 A、`onFinalized` → `onVerdictFixed`）、出力末尾の UTF-8 境界揃え（R5-004）
- M0 完了の記録: `docs/reports/M0_COMPLETION.md`、ROADMAP、README。テスト 141 件、自己 verify 6 チェック

## v0.1.4 — 4b7c943

- 独立レビュー R4（3 件）の追加修正: 確定点の yield を 1 周（poll フェーズを含む）に修正（`yieldFullIteration`）
- 検証中に発見した欠陥の修正: 出力バッファが上限より大きい単一チャンクを丸ごと捨てて空になる問題（バイト単位の切り詰めへ）
- テスト 139 件、10 回連続 PASS

## v0.1.3 — 26806d0 — **superseded**

- 独立レビュー R4（3 件）を反映: 確定点（B 案）、中断チェックの事実保持（timedOut / outputTruncated）、未起動チェックの表示（SKIPPED のみ）
- **superseded — 確定点の yield が不十分（`setImmediate` 1 回。確定点直前のシグナルを 10 回中 4 回取りこぼす）。v0.1.4 以降を使用すること。** タグは履歴として残す

## v0.1.2 — 677d834

- 独立レビュー R3（3 件）を反映: `[REDACTED:` 接頭辞によるマスク回避の防止、SIGINT / SIGTERM でのパイプライン中断（AbortSignal、130 / 143、verdict ERROR）、配布 smoke test の bin 実体検証
- テスト 133 件

## v0.1.1 — 99dad83

- 独立レビュー R1（13 件）と R2（5 件）を反映: マスク規則の拡張（接頭辞付きキー、引用符付き値、Authorization ヘッダ）、プロセスグループ kill のエスカレーション、symlink / dangling symlink の包含判定、exit code と文言の 1 対 1（PASSED / FAILED / ERROR）、git dirty の 3 値化、配布 smoke test（package チェック）
- テスト 118 件

## v0.1.0 — a1e6dba

- M0 初回: 設計書（ARCHITECTURE / ROADMAP / CONFIG_SPEC / ADR 0001-0008）、fail-closed な `aiqh verify`（JSONC 設定、順次実行、JSON / Markdown / history レポート、秘密情報マスク）、自己 verify（lint / typecheck / unit / build / dependency）
- テスト 72 件
