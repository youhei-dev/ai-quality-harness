# M0 完了報告 — ai-quality-harness（aiqh）

- 完了日: 2026-09-16
- 完了時のタグ: `v0.1.5`（M0 complete — verify core with independent reviews R1-R5 applied）
- 状態: M0 の完成条件をすべて満たし、独立レビュー 5 ラウンドを反映して完了。M1 は未着手

## 1. M0 で作ったもの

| 領域 | 内容 |
|---|---|
| 設計 | `docs/ARCHITECTURE.md`（M4 までの最終形、モジュール分割、データフロー、レポート仕様、セキュリティ設計、中断・確定点の意味論、終了コード表）、`docs/ROADMAP.md`、`docs/CONFIG_SPEC.md`、ADR 0001〜0008 |
| verify の中核 | JSONC 設定の読込と zod 検証（未知キー拒否、必須 0 件拒否、cwd / output.dir のルート内制限を字句・realpath・dangling symlink で判定）、shell 経由の順次実行（独立プロセスグループ、タイムアウト → SIGTERM → 猶予 → SIGKILL → グループ消滅確認、出力の末尾保持）、fail-closed 判定（PASSED / FAILED / ERROR と exit 0 / 1 / 2 / 130 / 143 の 1 対 1）、JSON / Markdown / history レポート、レポート全文字列の秘密情報マスク（13 分類、ヘッダ文脈と一般文の分離、正規マーカーのみ再マスク除外） |
| 中断機構 | SIGINT / SIGTERM → AbortSignal で新規 spawn 禁止 → 実行中グループの後始末 → 未実行を SKIPPED、verdict ERROR、interruptedBy → 128 + シグナル番号で終了。安全弁。verdict の確定点（1 周 yield、poll フェーズを含む）と CLI 終了結果の分離、ハンドラの原子的な差し替え |
| 配布 | `bin` = ビルド済み `dist/cli.js`。`npm pack` → 一時 consumer → install → `npx --no-install aiqh verify` の smoke test を必須チェック `package` として自己 verify に組込み（bin の実体・shebang・files・依存・version を検証） |
| 自己適用 | `aiqh.config.jsonc` に lint / typecheck / unit / build / package / dependency の 6 チェック（security / e2e は M1 のアダプタ待ちで NOT APPLICABLE） |
| レビュー運用 | `docs/reviews/m0/` に独立レビュー 5 ラウンドの原文と対応記録（review-import の出力形式の試作）、`artifacts/ai-review/` にレビューパケット（review-packet の試作）、`CHANGELOG.md` |

## 2. 検証の構成（完了時点）

| 項目 | 値 |
|---|---|
| 自己 verify | `npm run verify`（ソース実行）/ `npm run verify:dist`（ビルド済み JS）。6 チェックすべて PASS、security / e2e NOT APPLICABLE |
| テスト | 23 ファイル 141 件（ユニット、CLI 結合、実 CLI へのシグナル送信、in-process の OS シグナル、fixture による純粋関数検証）。完了前に 10 回連続実行で全回 PASS |
| 各 commit 単体の検証 | タグ間の各 commit を一時 worktree に checkout し `npx vitest run` と `npm run verify` を実行（v0.1.3 時代の 3 commit は既知の問題により単体では不安定。事実として記録） |
| セキュリティ検査 | push 前 hook と同じパターンでの秘密情報検索、ユーザー名・絶対パス・会社固有情報の検索を各ラウンドで実施。テスト用ダミー値は実行時連結（`fake(prefix, body)`） |

タグ別のテスト件数: v0.1.0: 72 → v0.1.1: 118 → v0.1.2: 133 → v0.1.3: 137 → v0.1.4: 139 → v0.1.5: 141

## 3. レビューループの運用（M2 で自動化する形の手動試作）

1. 実装 AI がレビューパケット（依頼要旨、commit 一覧、numstat、差分全文、変更ファイル全文、判断、検証結果、既知リスク、レビュアーへの指示）を生成。実装 AI の「正しい」という結論は書かない
2. 人間がパケットのみを独立レビュー AI に渡す
3. 届いた指摘を人間が仕分け（修正 / 文書対応 / 持ち越し）、実装 AI は**実コードを読んで** VALID / PARTIAL / INVALID を判定
4. VALID の各件について**先に回帰テストを書き、現状コードで失敗することを確認**（レビュアーの再現条件をそのままテストにする。テスト不在型は純粋関数に切り出して fixture で検証。競合系は実 OS シグナルや実 CLI で再現）
5. 停止ポイント1 で判定表と変更予定を提示 → 承認 → 最小修正 → 回帰と既存の全件 PASS（必要なら 10 回連続）→ 自己 verify 2 系統 → docs → セキュリティ検査 → 対応記録（response）→ 停止ポイント2 で commit 案
6. 承認 → 指摘単位の commit（明示 stage、`git diff --cached --name-only` 確認、必要なら `git apply --cached` でハンク分割）→ push（別コマンド）→ 注釈付きタグ → 各 commit 単体の worktree 検証 → 次のパケットを commit 範囲から生成

指摘件数の推移: R1: 13 → R2: 5 → R3: 3 → R4: 3 → R5: 4。

## 4. 学んだこと（M2 への持ち帰り事項の総まとめ）

- **回帰テスト先行**は判定の根拠を機械的にする。テスト不在型の指摘は「初回実行結果」を記録し、純粋関数への切り出しで正常系・異常系を検証する
- **各 commit 単体の worktree 検証**が、タグ付け後に不安定なテスト（確定点の yield 不足、出力バッファの丸ごと破棄）を検出した。タグは付け替えず（v0.1.3 を superseded として残置）、修正を次のタグに積む
- **確定点の意味論**は観測可能な形で定義する（Node が JS へ配送したシグナルを基準。OS 到着時刻の完全保証は謳わない）。verdict の確定点と CLI 終了結果は別
- **シグナル関連の修正**は、in-process で実 OS シグナルを自プロセスへ送るテストと、実 CLI を子プロセス起動するテストの 2 層で固定する。リスナーの差し替えは追加 → 削除の順
- **秘密情報マスク**は fail-safe（取りこぼしより誤検出）。再マスク除外は正規マーカーの完全一致だけに限定する
- **セッション中断時の再開**は git status / diff / テスト実行で「適用済みか」を判断してから続行する
- **review-import の表**は ID / 重要度 / 判定 / 対応 / 根拠・修正内容 / 回帰テスト（修正前 FAIL）/ ガード / 行き先 を標準列にする。同一ファイルを共有する指摘の commit グループと、ハンク分割の stage 手順を出力に含める
- **review-packet** は commit 範囲（`--range`）と作業ツリー（`--worktree`）の 2 モード、変更ファイル全文の同梱、レビュアーの「見ていない範囲」の自動転記、Architecture Decisions の表現規約（verdict の確定点と CLI 終了結果を分ける）を持つ

## 5. M1 開始時の前提

- 基準タグ: `v0.1.5`
- テスト件数: 141（すべて PASS、10 回連続）
- 自己 verify: lint / typecheck / unit / build / package / dependency の 6 チェック PASS。security / e2e は M1 でアダプタ化するまで NOT APPLICABLE
- 持ち越し: R-010（M4）、R-011 後半（M3）、R-012（M1）、R-013（並列化時）。R5 で残った論点（OS 到着時刻基準のシグナル保証、安全弁の実発火、Linux / Windows）は M1 以降のレビューで扱う

## 6. 保守修正 v0.1.6（R6、2026-09-18）

M0 完了（v0.1.5）後に届いた独立レビュー R6 を保守修正として反映した。R7 は行わない。

| ID | 内容 | 対応 |
|---|---|---|
| R6-001（Medium、バグ） | レポート用 64KiB 末尾切り出し `tail()` に UTF-8 境界揃えが無く、先頭が U+FFFD になり再エンコード長が上限を超え得た | 境界揃えを共通ヘルパー `src/runner/utf8-trim.ts` に切り出し、`OutputBuffer.push()` と `tail()` の両方で使用。回帰テスト 2 件（stdout / stderr、64KiB 超のマルチバイト） |
| R6-002（Medium、文書） | CHANGELOG のタグ横 SHA が注釈付きタグのオブジェクト SHA だった | 主表記をタグが指す commit の SHA（`git rev-list -n1 <tag>`）に統一し、タグオブジェクト SHA を併記。ルールをプロジェクト CLAUDE.md に追記 |
| R6-003（Low、文書） | ハンドラ差し替え中の Known Risk の説明が通常の OS シグナルについて不正確 | 「通常の OS シグナルは非同期配送のため差し替え完了後のリスナー集合で処理される。同期的な `process.emit()` の場合のみ両リスナーが実行され得る」に修正（ARCHITECTURE、`cli-signals.ts` のコメント、r5 パケット） |

- v0.1.6: commit 8092f9f / tag object 10fd4d9。テスト 143 件（10 回連続 PASS）、自己 verify 6 チェック PASS
- 基準タグは §7 の v0.1.7 に更新

## 7. 保守修正 v0.1.7（R7、2026-09-18）— M0 の最終版

v0.1.6 のパケットに対する最終独立レビューで、R6-001 の共通ヘルパー化の際に `OutputBuffer` 側へ入った退行が 1 件（R7-001、Medium）見つかり、保守修正として反映した。これ以降の M0 レビューは行わない。

| ID | 内容 | 対応 |
|---|---|---|
| R7-001（Medium、バグ） | UTF-8 コードポイントがチャンクをまたぐ場合、先頭チャンクだけを 1 回見る揃え方では次チャンク先頭の継続バイトを取りこぼし、U+FFFD と上限超過が再発 | 「先頭バイトが継続バイトである間、1 バイトずつ最大 3 回、チャンクをまたいで捨てる」ループに戻し、さらに切り詰め済みの間は毎回揃える（作業中にシード付きテストで見つけた第 2 経路）。固定チャンク境界の決定的テスト 4 件と固定シード 500 回の網羅テスト 1 件を追加 |

- v0.1.7 時点: テスト 148 件（10 回連続 PASS）、自己 verify 6 チェック PASS。commit SHA / タグオブジェクト SHA は最終報告と `CHANGELOG.md` に記載
- **M1 開始時の基準タグは v0.1.7**

### 教訓（追加）

- 修正を共通ヘルパーへ寄せるときは、連続バッファ（`tail()`）とチャンク列（`OutputBuffer`）のように**入力の構造が異なる呼び出し元ごとに回帰テストを持つ**。R6 では `tail()` 側の連続 Buffer テストだけを追加したため、`OutputBuffer` 側の退行を見逃した
- 境界条件は「今回の操作で状態が変わったとき」だけでなく「状態が既に変わっている限り毎回」保つ不変条件として書く（揃えは `truncated` である限り毎回）
- 決定的テストには固定チャンク境界のケースと、上位ビットを使う固定シードの網羅テストを組み合わせる（LCG の下位ビットは周期が短く、500 回でも境界ケースに当たらなかった）
