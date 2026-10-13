# ROADMAP — ai-quality-harness

最終更新: 2026-10-13

各マイルストーンは「自分自身の verify が PASS している」ことを共通の終了条件とする。
M1 以降の内容は現時点の案であり、着手時に依頼範囲を再確認する。

---

## M0 — 全体設計・リポジトリ基盤・verify の中核 — **完了（v0.1.5、2026-09-16）／保守修正 v0.1.6・v0.1.7（2026-09-18）**

- 完了時のタグ: `v0.1.5`（M0 complete — verify core with independent reviews R1-R5 applied）。その後の独立レビュー R6（3 件）を `v0.1.6`、最終レビュー R7（1 件: `OutputBuffer` のチャンク横断 UTF-8 境界揃え）を `v0.1.7` として保守修正。**M1 は v0.1.7 を基準に始める。これ以降の M0 レビューは行わない**
- 独立レビューの指摘件数の推移: R1: 13 → R2: 5 → R3: 3 → R4: 3 → R5: 4 → R6: 3 → R7: 1（R5 は文書対応 2 件、R6 は文書対応 2 件を含む）
- v0.1.7 時点の検証構成: 自己 verify 6 チェック（lint / typecheck / unit / build / package / dependency。security / e2e は NOT APPLICABLE）、テスト 148 件（10 回連続 PASS）
- M1 以降へ持ち越した項目: R-010（並行実行時の latest の整合、M4）、R-011 後半（Linux CI、M3）、R-012（masker と Security Scan の検出パターン共有、M1 で共有・M2-0 の `security.allow` で完了）、R-013（出力バッファの streaming 化、並列化時）。R5 で残った論点（OS 到着時刻基準のシグナル保証、安全弁の実発火、Windows）は M1 以降のレビューで扱う
- 詳細: `docs/reports/M0_COMPLETION.md`（保守修正 v0.1.6 / v0.1.7 の追記を含む）、`CHANGELOG.md`

### 内容
- 全体設計（ARCHITECTURE / ROADMAP / CONFIG_SPEC / ADR）
- リポジトリ基盤（git init、.gitignore、README、package.json、tsconfig、ESLint、Vitest、プロジェクト CLAUDE.md）
- `aiqh verify` の中核
  - JSONC 設定の読込とスキーマ検証（不正なら終了コード 2 で停止）
  - チェックの順次実行（子プロセス、stdout/stderr 取得、終了コード、タイムアウト、所要時間）
  - fail closed 判定（必須 1 件でも失敗で FAILED、終了コード 1）
  - 任意チェックの失敗は判定に影響させず FAIL として記録
  - `latest.json` / `latest.md` / `history/<timestamp>.json` の出力
  - 秘密情報らしき文字列のパターンマスク
- 自己適用: Lint / Type Check / Unit Test / Build / Dependency を実チェックとして登録。Security / E2E は NOT_APPLICABLE
- 手動のレビューパケット `artifacts/ai-review/review-packet-m0.md`

### 独立レビューの反映
- R1（R-001〜R-013）: `docs/reviews/m0/response-r1.md`。R-001〜R-005 / R-007 / R-009 を修正、R-006 / R-011 前半は文書対応
- R2（R2-001〜R2-005）: `docs/reviews/m0/response-r2.md`。5 件すべて修正（R2-005 は旧 R-008 の M0 受入テスト化）
- R3（R3-001〜R3-003）: `docs/reviews/m0/response-r3.md`。3 件すべて修正
- R4（R4-001〜R4-003）: `docs/reviews/m0/response-r4.md`。3 件すべて修正（v0.1.3 は yield 不十分のため superseded、v0.1.4 で修正）
- R5（R5-001〜R5-004）: `docs/reviews/m0/response-r5.md`。2 件修正、2 件文書対応。M0 完了
- R6（R6-001〜R6-003）: `docs/reviews/m0/response-r6.md`。1 件修正、2 件文書対応。保守修正 v0.1.6
- R7（R7-001）: `docs/reviews/m0/response-r7.md`。1 件修正。保守修正 v0.1.7（M0 の最終版）

### 完了条件（すべて達成）
- [x] `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/CONFIG_SPEC.md`, `docs/adr/*.md` が存在する
- [x] `npm run verify` でこのリポジトリ自身の Lint / Type Check / Unit Test / Build / Dependency（＋ package）が実行される
- [x] VERIFY PASSED / FAILED / ERROR が明確で、FAILED / ERROR 時の終了コードが非ゼロ（テストで検証）
- [x] `artifacts/verification/latest.json` / `latest.md` / `history/` が生成される
- [x] 秘密情報マスクが単体テストで検証されている
- [x] 秘密情報・会社固有情報を含まない
- [x] レビューパケット（手動）とプロジェクト CLAUDE.md がある
- [x] `docs/reports/M0_REPORT.md`、`docs/reports/M0_COMPLETION.md` がある

### M0 でやらないこと
アダプタ、`init`、`review-packet` / `review-import` コマンド、GitHub Actions、履歴 DB、外部 API 接続、LICENSE、Public 化、承認前の commit / push。

---

## M1 — チェックアダプタ・`aiqh init`・2 リポジトリへの適用 — **完了（ベースライン v0.2.2、2026-09-20 確定。記録タグ v0.2.3）**

- 完了ベースライン: `v0.2.2`（commit f958ac7、M1 — independent review R2 applied）。完了記録のタグ: `v0.2.3`（M1 complete — adapters, init, security scan; independent reviews R1-R3 recorded。コード変更なし、M0 の v0.1.5 と同じ扱い）
- 独立レビューの指摘件数の推移: **R1: 10（High 3）→ R2: 5（High 1）→ R3: 5（High 0）**。事前の基準「R3 で High が無ければ M1 完了」により完了。R3 の 5 件（Medium 4 / Low 1）は修正せず **M2-0「スキャナ保守」へ持ち越し**（`docs/reviews/m1/response-r3.md`）
- `v0.2.0` は **superseded / known-bad**（自己 verify の security チェックが FAIL する状態でタグ付けされた。原因と対策は `docs/reports/M1_COMPLETION.md`）。`v0.2.1` に R1、`v0.2.2` に R2 を反映
- v0.2.2 時点の検証構成: 自己 verify 7 チェック（lint / typecheck / unit / build / package / security / dependency。e2e は NOT APPLICABLE）、テスト 252 件（10 回連続 PASS）、各 commit 単体の worktree 検証を push 前に実施
- 詳細: `docs/reports/M1_COMPLETION.md`、`docs/reports/M1_REPORT.md`、`CHANGELOG.md`

### 完了時の状態（v0.2.2 までの経緯）
- タグ: `v0.2.0`（2026-09-18、M1 — adapters, init, security scan, applied to two repositories）は**自己 verify の security チェックが FAIL する状態で
  タグ付けされたため superseded**（CHANGELOG）。独立レビュー R1（10 件）を `v0.2.1`、R2（5 件）を **`v0.2.2`（M1 — independent review R2 applied）** に反映し、
  v0.2.2 が M1 の完了ベースライン（人間の判断: R3 で High が無ければ M1 完了、Medium 以下は M2 のリストへ）。基準は M0 最終版 v0.1.7
- 実装: アダプタ（Node 7 / Python 7 / 内蔵 security 1。検出＋推奨のみ、実行経路は M0 の 1 本のまま）、`aiqh init`（監査 → 提案 → `--write` / `--force` / `--write-gitignore` / `--write-scripts`）、内蔵 Security Scan（`aiqh security-scan`。masker と共有するパターン定義、R-012 の互換テスト）、JSON Schema の同梱、`npm link` による配布（ADR-0009）
- 自己 verify: **7 チェック**（lint / typecheck / unit / build / package / security / dependency）。v0.2.0 では security が FAIL（M1-R1-001）、
  v0.2.1 以降で全 PASS（security は未追跡ファイル込みで検出 0 件）。テスト 252 件（v0.2.0 の 197 件 + R1 回帰 34 件 + R2 回帰 21 件、10 回連続 PASS）
- 適用: Node 系（React + Vite）と Python 系（FastAPI + venv）の対象 2 リポジトリに `aiqh init --write` を実施し `aiqh verify` を実行。検出できたチェックは PASS、security は両リポジトリとも既存由来（`.gitignore` の `.env.*` 欠落、テスト内のダミーキー）で FAIL、Node 側の dependency は既存由来の脆弱性で FAIL。いずれも報告のみで対象コードは変更していない（詳細は M1 の最終報告）
- M1 でやらなかったこと: 出力パーサの実装（型定義のみ。M2）、対象リポジトリへの lint / test ツールの導入（案内のみ）、E2E（検出のみ）

### 内容
- アダプタ（lint / typecheck / unit / build / security / dependency / e2e）
  - 各アダプタは「検出（このツールがあるか）」「推奨 check 定義（command / timeout / required の既定）」「任意の出力パーサ（件数抽出）」の 3 要素。実行経路は M0 の command 実行 1 本のまま
  - Node 系: ESLint / tsc / Vitest・Jest / Vite・Next build / npm audit / Playwright
  - Python 系: ruff / mypy・pyright / pytest / （build は `python -m compileall` または NOT_APPLICABLE）/ pip-audit / Playwright
  - Security Scan: 候補は gitleaks・semgrep 等だが、**無いものは無理に導入しない**。未導入なら NOT_APPLICABLE
- `aiqh init`
  - 対象リポジトリを読み取りで監査（package.json scripts、設定ファイル、pyproject / requirements、tests/ の有無、CI の有無）
  - 既存の lint / test / build 設定を最大限再利用した `aiqh.config.jsonc` を提案し、差分表示のうえ配置
  - 既存ファイルを上書きしない（`--force` 無しでは停止）
- trim-manager（React + TypeScript + Vite）と ai-tutor-browser（Python + FastAPI）への適用
  - 2026-09-15 時点の読み取り調査では、両リポジトリとも lint / typecheck / test の専用スクリプトや CI が未整備。
    init は「無いものは NOT_APPLICABLE」で設定を出し、導入は別依頼として提案にとどめる
- 設定の JSON Schema 出力（`aiqh schema` またはリポジトリ同梱）でエディタ補完・検証を可能にする → `schema/aiqh.config.schema.json` を同梱（`npm run schema:gen`）。`init` は対象から解決できる場合だけ `$schema` を書く

- 独立レビュー R1 からの持ち越し（`docs/reviews/m0/response-r1.md`）:
  - ~~**R-008**（配布形態の検証）~~ → **M0 で対応済み（R2-005）**: `scripts/package-smoke.ts` を自己 verify の
    必須チェック `package` として登録（`npm pack` → 一時ディレクトリへ install → `npx --no-install aiqh verify`）。
    配布形態（git タグ参照 / Actions 内 checkout）の設計自体は M1 で行う
  - ~~**R-012**~~ → **M1 で対応済み**: `src/security/patterns.ts` に定義を一本化し、masker と scanner が同じ定義を使う。
    合成資格情報コーパスを両方に入力する互換テスト `tests/security-compat.test.ts` を追加。push 前 hook は共通設定のため対象外

### 完了条件（すべて達成）
- [x] 7 分類すべてにアダプタがあり、検出不可時に NOT_APPLICABLE を返す
- [x] `aiqh init` が本体リポジトリ自身に対して既存の `aiqh.config.jsonc` と同等の提案を出す（テストで固定。security のコマンドは本体のみ `npm run security`）
- [x] trim-manager / ai-tutor-browser でそれぞれ `aiqh verify` が実行でき、レポートが生成される（PASS/FAIL は各リポジトリの現状による）
- [x] 本体の自己 verify PASS（7 チェック）— v0.2.0 では未達（security FAIL）、v0.2.1 で達成

---

## M2 — 独立レビューループ

### M2-0 — スキャナ保守 — **完了**（2026-09-23。完了ベースライン `v0.3.3` = commit cb632cd、記録タグ `v0.3.4`）
- タグ: `v0.3.0`（commit 8e81d15、2026-09-20）/ `v0.3.1`（e25f59f、R1 反映）/ `v0.3.2`（cfadf18、R2 反映）/ `v0.3.3`（cb632cd、R3 反映）/ `v0.3.4`（完了記録、コード変更なし）
- 独立レビューの指摘件数の推移: **R1: 3（High 1）→ R2: 3（High 1）→ R3: 3（High 1）→ R4: 1（High 0）**。事前の基準「R4 で High が無ければ M2-0 完了」により完了。
  R4 の 1 件（Medium）は修正せず M2-1 以降へ持ち越し（`docs/reviews/m2-0/response-r4.md`）。完了報告は `docs/reports/M2-0_COMPLETION.md`
- テスト件数: 280（v0.3.0）→ 294 → 319 → 338（v0.3.3、v0.3.4 も同じ）。自己 verify 7 チェック PASS

M1 完了時点（v0.2.2）で残った Security Scan / `init` の指摘を、key-value 走査・`security.allow` と同じ塊で扱った。各件は回帰テストを先に書き「修正前 FAIL」を記録してから修正した
（28 件の回帰テスト、`tests/regression-m2-0-*`）。完了時: テスト 280 件（10 回連続 PASS）、自己 verify 7 チェック PASS（key-value 走査込みで検出 0 件）。
仕様は CONFIG_SPEC §3b、ADR-0010 改訂、ADR-0012。
1. **M1-R3-001**（Medium）: 窓境界をまたぐ長いトークン（`LINE_OVERLAP` 4 KiB より長い url-credential / JWT が区間境界にまたがると検出できない）。候補プレフィックスを次の窓へ持ち越す状態機械、または候補が安全上限を超えたときの fail closed（finding / ERROR）
2. **M1-R3-002**（Medium）: `--write-gitignore` が否定ルール（`artifacts/` + `!artifacts/`）を実際に修復する（needed なら末尾へ追記。needed が false になれば追記しない = 冪等）
3. **M1-R3-004**（Medium）: カバレッジに使う `.gitignore` が追跡済みであること（未追跡のローカル `.gitignore` はクローン先に存在しないため保護と数えない。ネストも各 source を確認）
4. **M1-R3-003**（Medium）: 固定 sentinel 1 個（`artifacts/.aiqh-ignore-probe`）をディレクトリ全体のカバレッジと同一視しない。実生成パス複数（`artifacts/verification/latest.json` / `latest.md`、`artifacts/ai-review/…`）で判定
5. **M1-R3-005**（Low）: PEM ブロック finding の重複統合（`block:<category>:<beginLine>:<endLine>`）
6. key-value 分類の走査（ソースコード中の誤検出を抑える方式の設計が必要）と `security.allow`（例外指定: パス / 行 / 分類。レビュー原文の例示、対象リポジトリのテスト内ダミー値の許容）。互換テストは維持
7. `.env` 判定の代表パス・example サフィックスの設定化、窓走査の上限 / 重なりの設定化
8. 持ち越し済みの整理: **R-012 は完了**（masker と scanner の定義共有 + `security.allow`）。R-010（M4）/ R-011 後半（M3）/ R-013（並列化時）は従来の行き先のまま

### M2-1 準備 — 不安定テストの修正 — v0.3.5（2026-09-23）
- 対象: `tests/regression-r3-cli.test.ts` の「check 1's descendants are gone」（v0.3.4 の commit 単位の worktree 検証で `npm run verify` の中の 1 回だけ FAIL、やり直しで PASS）
- 原因（テスト側の読み取りの競合）: pid ファイルの**存在**だけを待って直後に中身を読んでいた。書き手の `writeFileSync` は作成と書き込みの 2 段で、その間に読むと `""` →
  `Number("") = 0` → `process.kill(0, 0)` は自分のプロセスグループ宛てで必ず成功 → alive と判定。後始末の `killIfAlive` も同じ読み方で、pid 0 なら自分のグループを SIGKILL し得た。
  製品（`aiqh verify` の中断処理）の不具合ではない。ゾンビ・PID 再利用・判定までの時間の仮説は計測で否定した
- 対応: pid は「中身が正の安全な整数」になるまで待つ共通 helper（`tests/helpers.ts` の `waitForPid`）で読み、`process.kill` に 0 以下・NaN を渡さないガードを置いた。
  同じ読み方の 4 箇所も同じ helper に置き換えた。pid ファイルを空で作り後から書く回帰ケースを追加（修正前 FAIL を記録）。詳細は `docs/reports/M2-1_FLAKY_R3_CLI.md`
- テスト件数: 339（v0.3.4 の 338 + 回帰ケース 1）。製品コード（`src/`）の変更なし

### M2-1 — `aiqh review-packet` — **完了**（2026-09-25。完了ベースライン `v0.4.3` = commit 6cf3199、記録タグ `v0.4.4`）
- タグ: `v0.3.5`（cae4b7a、準備）/ `v0.4.0`（4e196a3、実装）/ `v0.4.1`（c8a185a、R1 反映）/ `v0.4.2`（7f981b2、R2 反映）/ `v0.4.3`（6cf3199、R3 の High 反映）/ `v0.4.4`（完了記録、コード変更なし）
- 独立レビューの指摘件数の推移: **R1: High 3 / Medium 2 → R2: High 4 / Medium 4 → R3: High 1 / Medium 5 → R4: 0**。事前の基準「R<N> で High が無ければ完了」により R4 で完了。
  R3 の Medium 5 件は M2-2 の先頭へ持ち越し（下の M2-2 の節）。完了報告は `docs/reports/M2-1_COMPLETION.md`。仕様は ADR-0014
- テスト件数: 339（v0.3.5）→ 389（v0.4.0）→ 415 → 455 → 466（v0.4.3、v0.4.4 も同じ）。自己 verify 7 チェック PASS
- 次の段階は **M2-2**（先頭は R3-002〜006）

### M2-2 — 先頭: M2-1 R3 の持ち越し 5 件 — **v0.5.0**（2026-09-25）／独立レビュー m2-2-r1 の反映 — **v0.5.1**／m2-2-r2 の反映 — **v0.5.2**／m2-2-r3 の記録と区切り — **v0.5.3**／m2-2-r3 の 3 件の修正 — **v0.5.4**／m2-2-r4 の記録と区切り — **v0.5.5**（2026-09-25）／テストの不安定の解消と runner の `timedOut` の修正（M2-2-FLAKE-001）— **v0.5.6**（2026-09-26）／m2-2-r5 の記録と区切り — **v0.5.7**（2026-09-26）／m2-2-r5 の Medium 1 件（テストの失敗の経路の後始末、M2-2-R5-001）の修正 — **v0.5.8**（2026-09-26）／m2-2-r6 の記録と区切り — **v0.5.9**（2026-09-27）／`safeJson()` の入力を JSON のデータに限る（M2-2-R4-001）— **v0.5.10**（2026-09-27）／m2-2-r7 の記録と区切り — **v0.5.11**（2026-09-27）／`safeJson()` の Proxy のときの不足（M2-2-R7-001〜003）の修正 — **v0.5.12**（2026-09-27）／m2-2-r8 の記録と safeJson のレビューの区切り — **v0.5.13**（2026-09-27）／CLI の最上位の catch の修正（バックログ 1）— **v0.5.14**（2026-09-27）／m2-2-cli-catch-r1 の Medium 1 件（新しい回帰テストの子プロセスの後始末、M2-2-CLI-CATCH-R1-001）の修正 — **v0.5.15**（2026-09-28）／m2-2-cli-catch-r2 の記録（0 件、CLI の catch の作業を終了）— **v0.5.16**（2026-09-28）／`src/` が読み込むモジュールの一覧と `process` のメンバー（バックログ 1、M2-2-R4-002）— **v0.5.17**（2026-09-28）／m2-2-builtin-r1 の Medium 1 件（要素アクセスのキーの型でメンバーが分かる形、M2-2-BUILTIN-R1-001）の修正 — **v0.5.18**（2026-09-30）／m2-2-builtin-r2 の High 1 件（要素アクセスなどの許可の判定が型だけを根拠にしていた、M2-2-BUILTIN-R2-001）の修正 — **v0.5.19**（2026-09-30）／m2-2-builtin-r3 の High 7・Medium 1（許可の分岐の全数の見直し、M2-2-BUILTIN-R3）の修正 — **v0.5.20**（2026-09-30）／m2-2-builtin-r4 の High 4・Medium 2（型の枝の分解、関数の参照の形、M2-2-BUILTIN-R4）の修正 — **v0.5.21**（2026-10-02）／m2-2-builtin-r5 の High 2・Medium 1・Low 1（値の入口を塞ぐ方式、M2-2-BUILTIN-R5）の修正 — **v0.5.22**（2026-10-02）／m2-2-builtin-r6 の High 4（再 export の入口・`Utf8Stream` の値の import・listener の登録の形と別名の追跡、M2-2-BUILTIN-R6。最終修正、独立した再レビューなし）の修正 — **v0.5.23**（2026-10-02）／バックログ 9・10（ファイルへの出力の禁止文字、check の環境）— **v0.5.24**（2026-10-02）／バックログ 9・10 の独立レビュー 1 回目の High 2・Medium 1・Low 1（書き込み箇所のテスト、`options.env`）の修正 — **v0.5.25**（2026-10-03）／バックログ 9・10 の独立レビュー 2 回目の High 1・Low 1 と stream の残り（truncate 系を一覧に、docs の件数。最終修正、独立した再レビューなし）の修正 — **v0.5.26**（2026-10-03）／バックログ 11（使い方エラーを全コマンドで exit 2 に）— **v0.5.27**（2026-10-03）
- M2-1 独立レビュー R3 の Medium 5 件（R3-002〜006）を修正。SP1 で実コードの再現と設計を行い、人間の承認の後に実装した。対応記録 `docs/reviews/m2-1/response-r3.md`
- 持ち越し 5 件の内容（v0.5.4 でバックログの完了済みの項目をこの節へ移した）。R3 の 6 件のうち High の R3-001 は v0.4.3 で直した（ファイルシステムの同一性〈`dev`+`ino`〉による判定）。
  確定の直前の判定より後の同時の変更は信頼境界の外（README）。判定と rename を同じ実体に固定する（`openat` 相当）手段が Node の標準 API に無いため、必要になれば
  「確定の各段階の直前に再確認して窓を狭める」案を検討する
  - **M2-1-R3-002**: finding（オプションの値・パス）があるとき、後段の「検査そのものができない状態」（読めない `--request` / `--review`、欠けた git object）が exit 1 に隠れる。
    「finding 優先」と「検査を完遂できるか」を分け、検査を完遂できないなら exit 2 にする（危険な値を git に渡さない制約は保つ）
  - **M2-1-R3-003**: JSON として壊れた `latest.json` の中の生文字・秘密の形を、parse に失敗したときも検査する（finding なら exit 1、無ければ exit 2）
  - **M2-1-R3-004**: `Checked` / `Md` の偽造（`any`・型の別名・`JSON.parse` の代入）を AST で検出する（現在は `as Checked` の文字列検査のみ。現在のソースに該当なし）
  - **M2-1-R3-005**: オプション一覧のテストを help の解析ではなく commander の `Command` オブジェクトの `options` と比べる形にする（非表示・short-only を含める。CLI の組み立てを副作用のない関数に分ける）
  - **M2-1-R3-006**: テストの外部コマンドの検査を AST で行う（単一引用符・変数・テンプレート文字列・`promisify(execFile)` の別名を含める。probe と `it.skipIf` の対応も確かめる）
- R3-002 / R3-003: review-packet の終了コードの優先順位を ADR-0015 に（検査不能 → 検出 → 出力しない判断）。R3-004: `Checked` / `Md` を型情報付きの構造テストと
  実行時の登録簿で固定。R3-005: `src/cli-program.ts` と `Command` オブジェクトとの比較。R3-006: 型情報付き AST と自己 verify の `unit-minpath`（自己 verify は 8 チェック）
- テスト件数: 466（v0.4.4）→ 536（v0.5.0、91 ファイル）→ 572（v0.5.1、94 ファイル）→ 593（v0.5.2、95 ファイル）→ 593（v0.5.3、docs だけ）→ 618（v0.5.4、98 ファイル）→ 618（v0.5.5、docs だけ）→ 619（v0.5.6、99 ファイル）→ 619（v0.5.7、docs だけ）→ 624（v0.5.8、100 ファイル）
- 独立レビュー m2-2-r1（範囲 `v0.4.4..v0.5.0`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の 5 件は解消 2 / 部分的に解消 3、新しい指摘は
  High 0 / Medium 6 / Low 1。実コードの確認で 6 件を再現した（R1-004 は再現せず: 規則 `widened-renderer` が検出する）
- v0.5.1: **M2-2-R1-007 を人間の判断で High として扱い修正**（読めない `latest.json` を `existsSync()` で「無い」とし、exit 0 で「does not exist」と
  書いていた → ENOENT だけを「無い」とし、それ以外は検査不能）。M2-2-R1-001（Medium）も修正（Rejected の `--range` でも、作業ツリー・root・
  `latest.json` の読取など範囲に依存しない検査を行う。ADR-0015 を改訂）。確認で見つけた同じ種類の既定の設定ファイルの読み込み（review-packet と
  security-scan。security-scan は検査が弱まり exit 1 のところ exit 0）も、1 つの関数 `loadSecurityConfig` にまとめて修正。残りの R1-002〜006 は
  下のバックログ 3〜7、残りの同じ種類の箇所はバックログ 8
- 独立レビュー m2-2-r2（範囲 `v0.5.0..v0.5.1`）: 前回の 2 件（R1-007、R1-001）は解消、新しい指摘は **High 1（M2-2-R2-001）**/ Medium 0 / Low 0。
  security-scan の出力は masker だけを通していたため、パス（作業フォルダ、ファイル名、設定のエラー）の禁止文字が生のまま端末に出た（v0.5.1 の設定のエラーの経路。
  走査の出力の経路は v0.4.4 でもあった）。同じことは verify・init・commander の使い方エラー・オプションの解析でも起きた
- v0.5.2: **M2-2-R2-001 を High のまま修正**。すべてのコマンドの標準出力・標準エラーを 1 つの出口 `src/output.ts` に通す（禁止文字を `\u{HEX}` の表記 → masker。
  ADR-0016）。型情報付きの構造テストが、`src/output.ts` 以外からの書き出しを禁止する。禁止文字の無い出力は v0.5.1 とバイト一致。ファイルへの出力は下のバックログ 9
- 独立レビュー m2-2-r3（範囲 `v0.5.1..v0.5.2`）: 前回の R2-001 は解消、新しい指摘は **High 0** / Medium 3（R3-001〜003）/ Low 0。3 件とも実コードで再現した
  （LF・TAB は見た目だけで、終了コードと `--json` は正しい。各コマンドの `--json` に利用者由来のキーは無い。構造ガードの穴を使う書き出しは `src/` に無い）
- v0.5.3（docs だけ）: 完了基準「High が無ければ区切り、Medium 以下は次へ」により、**M2-1 からの持ち越し作業（v0.5.0〜v0.5.2、R1〜R3）をここで区切り**。
  R3 の記録（`docs/reviews/m2-2/response-r3.md`）、ADR-0016 に出口の既知の限界 3 点を明記、R3 の 3 件と check への `NO_COLOR` をバックログへ
- v0.5.4: **M2-2 独立レビュー R3 の Medium 3 件を修正**（v0.5.3 のバックログ 1・2・5。SP1 で出口に渡す文字列を AST で全件洗い出し〈105 か所と commander の 3 経路〉、
  人間の承認の後に実装。ADR-0017 が ADR-0016 の決定 3 と既知の限界を置換）
  - M2-2-R3-002: JSON のキーも値と同じく表記 → mask。変換の後にキーが衝突したら出さない（fail closed、exit 2）
  - M2-2-R3-001: **1 回の書き出し = 1 行**（1 行の中の LF・TAB も表記）。複数行はコマンド自身の書式だけを block で書く（init の設定案、設定の検証エラーの
    zod の詳細、commander の help と提案の行）。設定案のコメントの値は作る所で表記にする（`--write` で書くファイルも同じ）
  - M2-2-R3-003: 端末に書くのは `src/output.ts` の 2 つの基本関数だけ（引数は `safeText` / `safeJson` だけが作る型 `Safe`）。構造ガードは、端末のオブジェクトの
    動的・反射的な扱い、型検査で中身が見えないコード、fd と `/dev/` のパス、`stdio` が pipe / ignore でない子プロセスを禁止する（SP1 で洗い出した 22 形と出口の中の 3 形を検出）
  - 禁止文字・秘密の形・利用者由来の LF・TAB の無い出力と init の `--write` が書くファイルは v0.5.3 とバイト単位で一致
- 独立レビュー m2-2-r4（範囲 `v0.5.3..v0.5.4`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の 3 件は R3-001 が解消、R3-002・R3-003 が部分的に解消。
  新しい指摘は **High 0** / Medium 2（R4-001: `safeJson()` の写しに残る関数の値の `toJSON`、R4-002: 構造ガードが `process.getBuiltinModule(…)` を検出しない）/ Low 0。
  区切る前に 2 件の前提を実測した（どちらも再現。今の各コマンドの `--json` は JSON のデータだけで、`src/` はどの方法も使わない）
- v0.5.5（docs だけ）: 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、**出力の出口の強化（v0.5.2〜v0.5.4、R2〜R4）をここで区切り**。
  R4 の記録（`docs/reviews/m2-2/response-r4.md`）、ADR-0017 の既知の限界に 2 件を追記（「`node:vm` を検出する」と読める記述を、import の検出と直した）、
  R4 の 2 件と構造ガードの既知の限界をバックログの 2・3 へ。リリースの検証で見つかった unit-minpath の不安定なテストを先頭（1）へ
- v0.5.6: **バックログ 1（unit-minpath のテストの不安定）を解消し、その調査で見つけた runner の不具合 M2-2-FLAKE-001 を直した**（SP1 で原因を実測で確定して設計し、
  人間の承認の後に実装）
  - 不安定の原因（確定）: 負荷の下で、子が SIGTERM を無視する処理を登録する前に 300ms のタイムアウトの SIGTERM で終わり、600ms の中断の前に結果が確定して
    `interruptedBy` が null になった。テストの前提（子の準備が短いタイムアウトより前）の崩れだけで説明でき、同じ前提を持つテストは 4 ファイル 5 件だった
    （`regression-r2-cli-signal.test.ts` は子の準備完了の印を待ってから始めるので直さない）
  - M2-2-FLAKE-001: 中断の後、後始末の猶予の間にタイムアウトの時刻が来ると `timedOut` が true になった（ARCHITECTURE の R4-002 の定義「中断前にタイムアウトへ
    到達していたか」に合わない。既定の猶予 5 秒でも起き、`latest.json`・`latest.md` に「timeout had already been reached」と書かれた。status・verdict・終了コードは
    正しかった）。中断のときにタイムアウトのタイマーを止める（`src/runner/execute.ts` に 1 行）。ほぼ同時のときは runner のイベントループで先に処理した方を先とする。
    回帰テスト `tests/regression-m2-2-flake-001-timeout-after-abort.test.ts`（修正前に 5 回とも FAIL）
  - テストの方針（各テストの冒頭のコメント）: 中断が引き金のテストは、子の準備完了の印を待ってから中断する。タイムアウトが引き金のテストは、runner のタイムアウトが
    spawn から数えるので子の準備に 3 秒の余裕を置き、前提が崩れたときは「precondition: …」の文言で FAIL する（SKIP にしない）。r4 の B は、子がタイムアウトの SIGTERM を
    受けた印を見てから中断し、テストが子を終わらせる
  - 確かめ: (a) 子の準備を人為的に遅らせた写し（tmp の中だけ）で、v0.5.5 の 5 件は 1200ms の遅れで 5 回とも FAIL、直した 5 件は 0ms・1200ms で 5 回とも PASS、回帰テストは
    修正前に FAIL・修正後に PASS。3500ms（余裕を超える）では、タイムアウトが引き金の 4 件と回帰テストが前提の文言で FAIL（中断が引き金の A は PASS）。(b) 起動の嵐 16 の下で、
    直した 4 ファイルと回帰テストを 1 ファイルずつ 393 回（各 76〜82 回。通常 PATH 35〜40 回、最小 PATH 38〜42 回）実行して失敗 0（v0.5.5 のテストは同じ条件で
    `regression-r4-report.test.ts` が 67 回中 3 回失敗）
  - この方針の後も不安定が残ったときの次の手は、runner の時計とタイマーを差し替えられるようにすること（SP1 の案 D。`src/` の変更）
  - ARCHITECTURE の R4-002 の項: ほぼ同時のときの決め方、出力の末尾の文言（プロセスグループが終わるまでに取得した出力。実装に合わせた）、exit と close の間の中断の今の挙動
- 独立レビュー m2-2-r5（範囲 `v0.5.5..v0.5.6`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の指摘で判定の対象は無し（M2-2-R4-001・002 はバックログのまま）。
  新しい指摘は **High 0** / Medium 1（R5-001: テストの前提が崩れて失敗したとき、実行中の `executeCommand()` を止める後始末が無い箇所がある）/ Low 1（R5-002:
  ARCHITECTURE の出力の末尾の文言が、実装の確定の条件より強い）。区切る前に R5-001 の前提を実測した（再現した。High の基準には当たらない: vitest はテストファイルが
  終わるとワーカーを止めるので runner の後始末は働かず、子は自分の寿命〈M2-2-FLAKE-001 の回帰テストで約 30 秒〉まで残るが、それを超えては残らず、後続のテストの
  結果も変わらなかった）
- v0.5.7（docs だけ）: 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、**テストの不安定と M2-2-FLAKE-001 の作業（v0.5.6、R5）をここで区切り**。
  R5 の記録（`docs/reviews/m2-2/response-r5.md`）、R5-002 の文言の訂正（ARCHITECTURE の runner の節の 3 か所。§10 の表の文はバックログ 18 のまま）、R5-001 を
  バックログの先頭（1）へ、v0.5.6 の SP2 で観測した r4 の B の 23 秒の 1 回（失敗ではない）をバックログ 18 の関連として記録
- v0.5.8: **バックログ 1（M2-2-R5-001: テストの失敗の経路の後始末）を修正**（`tests/` だけ。SP1 で洗い出し・再現・vitest の動きの確認と設計を行い、人間の承認の後に実装）
  - vitest 5.0.0 の動き（SP1 で実測）: テストのタイムアウトではテストの本体を止めずに `afterEach` へ進み、ファイルが終わるとワーカーを止める。テストの中の `finally` は、
    タイムアウトの経路ではファイルの最後のテストでは実行されず、途中のテストでは次のテストの実行中に遅れて実行された。v0.5.7 のバックログの案（`try/finally`）ではなく、
    後始末を `afterEach` に置いた
  - `tests/helpers.ts` に `runCleanups`（後から積んだものから順に await し、すべて実行して最初のエラーを投げる）・`stopper`（確定済みなら何もしない。未確定なら止めて、
    猶予 ＋ `SETTLE_MARGIN_MS`〈5 秒〉まで確定を待ち、超えたら失敗）・`waitReady`（「precondition: …」の待ち）を足した。止めるのは runner の AbortController か
    ChildProcess の handle だけで、ファイルから読んだ pid には signal を送らない
  - 直したテスト: r4-report（A・B）、M2-2-FLAKE-001 の回帰テスト、r2-cli-signal（後始末のためだけの AbortController）、r3-cli（CLI を SIGTERM で止めて終了を待つ。
    pid ファイルへの SIGKILL をやめた）。準備の待ちの失敗は「precondition: …」の文言にした。製品の動きの期待値は変えていない。新しい単体テスト
    `tests/regression-m2-2-r5-001-test-cleanup.test.ts`（5 件。変更前の helpers では 5 件とも FAIL）
  - 確かめ（写しで準備を遅らせる・テスト側で待つ。本体のテストに仕掛けは入れていない）: 9 ケースすべてで、子・孫・CLI はそのテストの `afterEach` の中で消えた
    （修正前は失敗から約 2〜30 秒残り、vitest の終了後も最長約 30 秒）。r3-cli の失敗の後に `$TMPDIR/aiqh-r3-cli-*` が残る件（SP1 で見つけた。孤立した CLI が
    消された一時ディレクトリを作り直してレポートを書いた）も直った。後始末の待ちが最も長い r4 の B でも 20.0 秒（上限 25 秒、`hookTimeout` 30 秒）
  - ARCHITECTURE の runner の項目の終わりに、テストの後始末の方針を書いた。記録 `docs/reviews/m2-2/response-r5.md`
- 独立レビュー m2-2-r6（範囲 `v0.5.7..v0.5.8`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の M2-2-R5-001 は **解消**。新しい指摘は **High 0 / Medium 0 / Low 0**
- v0.5.9（docs だけ）: High 0・指摘 0 のため、**M2-2-R5-001 の作業（v0.5.8、R6）をここで区切り**。R6 の記録（`docs/reviews/m2-2/response-r6.md`）、CHANGELOG の
  v0.5.8 の見出しの SHA。バックログは項目も番号も変えていない（先頭は M2-2-R4-001）。テストの後始末の方針は ARCHITECTURE の今の置き場所（runner の項目の終わり）のまま
- v0.5.10: **バックログ 1（M2-2-R4-001: `safeJson()` の入力を JSON のデータに限る）を修正**（`src/` は `src/output.ts` だけ。SP1 で再現・同じ種類の洗い出し・今の呼び出しの
  確認と設計を行い、人間の承認の後に実装。ADR-0018）
  - `jsonSafe()` は JSON のデータ（文字列・有限の数・真偽値・null・配列・プロトタイプが `Object.prototype` か null の object。循環なし、深さ 100 段まで）だけを受け付け、
    それ以外（関数・`symbol`・`bigint`・`undefined`・`NaN`・accessor・数えられないプロパティ・普通でないプロトタイプ・穴のある配列など）は出力の前に拒否する
    （fail closed。CLI は最上位の unexpected error、exit 2。メッセージは種類だけで、キー・値・パスを載せない）。各プロパティは記述子で 1 回だけ読み、getter と
    `toJSON` は呼ばない。先に検査して従来の写しを使う案は、読むたびに値を変える Proxy で迂回できた（SP1 で実測）
  - SP1 の洗い出しで、v0.5.5 の記録（そのまま出るのは自分の `toJSON` の 2 形だけ）に 6 種類の漏れがあった（`toJSON` を持つ関数・クラス、`toJSON` を持つ関数を返す
    getter、Array のサブクラス、`Symbol.species` の差し替え、Proxy）。どれも今のコマンドの値には入らない（実行時の確認で 0 件）
  - 今の出力は変わらない（v0.5.4 のバイト比較の 42 通り〈`--json` の 5 通りと init `--write` のファイルを含む〉が v0.5.9 と一致）。新しい回帰テスト 34 件
    （v0.5.9 では 33 件 FAIL、PASS の 1 件は対照）。R3-002 の回帰テストの対照から `endLine: undefined` を外した（今は拒否する値）
  - ファイルへの出力（verify のレポートを写す `maskDeep()` も同じ構造）は扱わず、下のバックログ 9 に足した。記録 `docs/reviews/m2-2/response-r4.md`
- 独立レビュー m2-2-r7（範囲 `v0.5.9..v0.5.10`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の M2-2-R4-001 は **解消**。新しい指摘は **High 0** / Medium 3
  （R7-001: 配列の `length` を `value.length` で読み、Proxy の配列では `get` のトラップが呼ばれる。R7-002: 配列のキーを個数だけで確かめ、`ownKeys()` と記述子が食い違う
  Proxy の配列を受け付ける。R7-003: Proxy のトラップ自身の例外が、種類だけのメッセージに変わらずに伝わる）/ Low 0。区切る前に 3 件の前提を実測した（3 件とも再現した。
  High の基準には当たらない: 受け付けた Proxy の配列の出力は記述子が見せた JSON のデータで、表記・mask を通る。トラップの例外のメッセージは CLI の最上位で
  `writeError()` を通り、端末では表記・mask される。利用者の入力から Proxy などを作る経路は無い）
- v0.5.11（docs だけ）: 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、**M2-2-R4-001 の作業（v0.5.10、R7）をここで区切り**。R7 の記録
  （`docs/reviews/m2-2/response-r7.md`）、ADR-0018 の既知の限界に R7 の 3 件を追記し、決定 1〜3 の文を実装に合わせた（ARCHITECTURE も同じ）。R7 の 3 件を 1 項目にまとめて
  バックログの先頭（1）へ。CHANGELOG の v0.5.10 の見出しの SHA
- v0.5.12: **バックログ 1（M2-2-R7-001〜003: `safeJson()` の Proxy のときの不足）を修正**（`src/` は `src/output.ts` だけ。SP1 で再現・同じ種類の洗い出し・試作と設計を
  行い、人間の承認の後に実装）
  - 配列の `length` を記述子から読む（数えられない、0〜2^32−1 の整数。R7-001）。配列の自分のキーは、添字 `0`〜`length-1` と `length` にちょうど一致することを確かめ、
    記述子を読むのはその添字だけ（R7-002）。値を調べる操作（`getPrototypeOf`・`ownKeys`・`Array.isArray`・記述子の読み取り）が投げたら、投げられた値を読まずに
    固定の拒否 `a value whose structure could not be inspected` にする（R7-003）
  - SP1 の新しい発見: エンジンがトラップの答えを検査して投げる TypeError のメッセージにも、利用者由来のキーが入る（8 形のうち 3 形。これも固定の拒否になった）。
    投げられた値を調べると例外になる値では、CLI の最上位の catch が例外になり、Node の既定の表示で生の文字列が出て exit 1 になる（`safeJson()` を通る経路は閉じた。
    CLI の catch そのものは v0.5.14 で直した〈下の v0.5.14 の記録〉）。v0.5.11 の「端末では `writeError()` で表記・mask される」は、この形では成り立たなかった（response-r7 と ADR-0018 に訂正）
  - 今の出力は変わらない（v0.5.4 のバイト比較の 42 通りが v0.5.11 と一致）。新しい回帰テスト 17 件（v0.5.11 では 15 件 FAIL、PASS の 2 件は対照）。
    既存テストの期待値は変わらない
- 独立レビュー m2-2-r8（範囲 `v0.5.11..v0.5.12`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の M2-2-R7-001〜003 は 3 件とも **解消**。新しい指摘は
  **High 0 / Medium 0 / Low 0**。レビュアーの「未確認の範囲」（`src/cli.ts` のすべての throw の箇所、42 通りのバイト比較の中身、変更していないコマンドの
  `--json` の値）は、新しい作業を起こさずに記録した（`docs/reviews/m2-2/response-r8.md`）
- v0.5.13（docs だけ）: 人間の判断で、**M2-2 の safeJson に関するレビューを R8 で終える**（R9 は行わない。レビューパケットも作らない）。R8 の記録、
  CHANGELOG の v0.5.12 の見出しの SHA。バックログは項目も番号も変えていない（先頭は CLI の最上位の catch〈v0.5.13 の番号で 1。v0.5.14 で解消〉）
- v0.5.14: **バックログ 1（CLI の最上位の catch: 投げられた値を調べると例外になる場合の扱い）を修正**（`src/` は `src/cli.ts` だけ。SP1 で再現・`src/` 全体の
  同じ種類の棚卸し・テスト先行・試作と設計を行い、人間の承認の後に実装。ADR-0018 の既知の限界に注記）
  - 最上位の catch は、最初に exit 2 を決め、投げられた値を調べる操作（`instanceof`・`message` の読み取り・文字列への変換）と 1 行目の組み立てを try の中でだけ行う。
    失敗したら固定の文 `aiqh: unexpected error: (the thrown value could not be inspected)` にし、投げられた値も、調べる途中で投げられた値も読み直さない。
    書けない行は飛ばし（行ごとの try）、判定の行 `VERIFY ERROR (internal error)` は書こうとする
  - SP1 の再現（v0.5.13 の一時 worktree の写し）: v0.5.12 の SP1 と同じ差し込みは `safeJson()` の固定の拒否（exit 2）になった。値をコマンドからそのまま投げると、
    14 通りのうち 9 通りが exit 1（そのうち 6 通りは生の U+202E と mask されない秘密の形）。v0.5.12 の記録の 2 形のほかに 7 形（文字列を投げるトラップ、`toString`・
    `Symbol.toPrimitive` が投げる object、取り消し済みの Proxy、プロトタイプの無い object、`message` が symbol か `toString` が投げる object の Error）
  - `src/` 全体の棚卸し: 投げられた値を調べる 32 か所のうち、利用者の入力から届く所は 0（`src/` の `throw` は自前の Error か受けた例外の投げ直しだけ）。
    ほかの箇所は変えない（表は `docs/reviews/m2-2/response-r7.md` の v0.5.14 の節）
  - 普通の値（Error・文字列・`toString` を持つ object・symbol）の出力は変わらない（対照のテストと、v0.5.4 のバイト比較の 42 通りが v0.5.13 と一致）。
    新しい回帰テスト 25 件（実物の CLI を子プロセスで起こし、preload で値を届ける。`src/` に差し込み口は足さない。v0.5.13 では 13 件 FAIL、PASS の 12 件は対照 5 件と
    読み直しを数える 7 件）。既存テストの期待値は変わらない。テスト件数 675（102 ファイル）→ 700（103 ファイル）
  - バックログは 1 を外し、v0.5.13 の 2〜20 は 1〜19 になった
- 独立レビュー m2-2-cli-catch-r1（範囲 `v0.5.13..v0.5.14`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の指摘で判定の対象は無し。新しい指摘は **High 0** / Medium 1
  （M2-2-CLI-CATCH-R1-001: 新しい回帰テストの子プロセスの後始末が、v0.5.8 のテストの方針〈失敗・タイムアウトの経路でも `afterEach` の中で終える〉を満たしていない）/
  Low 0。製品コード `src/cli.ts` の修正には新しい不具合は無かった。レビュアーの「未確認の範囲」（`src/` 全体の棚卸しの網羅性、`src/output.ts` の全文。パケットが
  変更したファイルの全文しか含まないため）は、新しい作業を起こさずに記録した（`docs/reviews/m2-2/response-cli-catch-r1.md`）
- v0.5.15: **M2-2-CLI-CATCH-R1-001 を修正**（`tests/` の新しい回帰テストの 1 ファイルだけ。SP1 で判定・`tests/` 全体の棚卸し・写しでの再現・試作と設計を行い、
  人間の承認の後に実装）
  - SP1 の再現（v0.5.14 の写しで、終わらない CLI とテストの失敗・タイムアウト）: CLI は vitest の終了の後も約 38 秒残り、一時ディレクトリは CLI より先に
    `afterAll` で消えた（`execFile` の 20 秒の安全弁は、ワーカーが止められるので働かなかった）。`tests/` の棚卸しで、同じ種類はこのファイルだけ
  - 各 `it` が自分の実行を持つ（`runs` の map をやめた。一時ディレクトリは実行ごと）。起動の直後に `stopper`（ChildProcess の handle への SIGKILL と、上限つきの
    確定の待ち）を積み、`afterEach` の `runCleanups` で CLI を止めてから一時ディレクトリを消す。`execFile` の `timeout`・`killSignal` は二重の安全弁として残した
  - 確かめ（写しだけ。本体のテストに仕掛けは入れていない）: 修正後は 2 回とも、CLI はそのテストの `afterEach` の中で消え、vitest の終了の後の残り 0、
    一時ディレクトリは CLI の後に消えた。preload と 25 件の本文・期待値は変えていない（`shown()` から末尾までバイト単位で同じ）。テスト件数 700（103 ファイル）のまま
  - ARCHITECTURE は変えない（方針の文に例外の記載は無く、既知の例外はバックログ 19）。バックログは項目も番号も変えていない
  - この後、小さなパケットで m2-2-cli-catch-r2（範囲 `v0.5.14..v0.5.15`）を行い、High が 0 なら CLI の catch の作業を終える（人間の判断）
- 独立レビュー m2-2-cli-catch-r2（範囲 `v0.5.14..v0.5.15`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の M2-2-CLI-CATCH-R1-001 は **解消**。新しい指摘は
  **High 0 / Medium 0 / Low 0**。パケットには `--doc` で `tests/helpers.ts`・`docs/ARCHITECTURE.md`・`vitest.config.ts` の全文を載せ、後始末の順序と上限（5 秒と
  `hookTimeout` 30 秒）の関係まで確認された。レビュアーの「未確認の範囲」（修正の前後の実測値そのものは独立に再実行していない。ほかは依頼文の範囲外）は、
  新しい作業を起こさずに記録した（`docs/reviews/m2-2/response-cli-catch-r2.md`）
- v0.5.16（docs だけ）: 事前に決めていた「High が 0 なら終える」により、**CLI の最上位の catch の作業（v0.5.14・v0.5.15、cli-catch-r1・r2）をここで終える**
  （m2-2-cli-catch-r3 は行わない。レビューパケットも作らない）。r2 の記録、CHANGELOG の v0.5.15 の見出しの SHA。`src/`・`tests/` は変えていない。
  バックログは項目も番号も変えていない
- 次: バックログから選ぶ（未定）
- v0.5.17: **バックログ 1（M2-2-R4-002 と ADR-0017 の既知の限界: `src/` が読み込める組み込みモジュールの一覧）を修正**（`tests/` と docs だけで、`src/` は変えない。
  バックログの順どおりに人間が選んだ。SP1 で洗い出し・写しでの実測・試作と設計を行い、人間の承認の後に実装した。ADR-0019）
  - 構造ガードが、`src/` が実行時に読み込むモジュールの行き先を一覧で限る（組み込みは `node:` 付きの 6 つ、`src/` のソースファイル、package.json の `dependencies`。
    `import type` は見ない）。`process` の `getBuiltinModule`・`dlopen`・`report`・`emitWarning`・`execve`・`stdin` は、宣言で見つけて違反にする（`getBuiltinModule` は
    名前を問わない）。一覧を変えるときは ADR-0019 に追記し、独立レビューの対象にする
  - SP1 の洗い出し（写しで実測）: 同じ種類の 63 形（塞ぐべき 50、対照 8、塞げない・範囲外 5）。型検査を通る 49 形のうち、v0.5.16 のガードは 9 形だけを検出し、40 形を
    見逃した。見逃した形のうち実行時に動かした 13 形は、どれも端末に届いた。`import()` に `data:` の URL を渡す形は型検査で止まる（記録は `docs/reviews/m2-2/response-r4.md` の
    v0.5.17 の節）
  - 新しい回帰テスト 61 件（v0.5.16 のガードでは 42 件 FAIL。PASS の 19 件は、既に検出していた 9 形・対照 8・fixture の型検査・`src/` の違反 0）。本物の `src/` への
    違反は 0。既存テストの期待値は変わらない。テスト件数 700（103 ファイル）→ 761（104 ファイル）
  - 既知の限界（ADR-0019）: 実行時に組み立てたパスへの fs の書き込み、自分自身への SIGUSR1、依存のパッケージの中の出力、子プロセスが自分で端末を開くこと、ネットワーク
  - バックログは、1 を「v0.5.17 で解消」として行を残し、番号を詰めない（人間の判断。番号は ADR・ARCHITECTURE・`docs/reviews/` など多くの箇所から参照されている）。
    SP1 で見つけた、コールバックの中の未処理の例外の表示を 20 として末尾に足した（この版では直さない）
- 独立レビュー m2-2-builtin-r1（範囲 `v0.5.16..v0.5.17`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の M2-2-R4-002 は **部分的に解消**。新しい指摘は **High 0** / Medium 1 /
  Low 0（M2-2-BUILTIN-R1-001: キーの型が 1 つの文字列リテラルに決まる要素アクセスで、`process` の 6 つのメンバーを取っても違反にならない）。実行時に標準出力へ届くことを実測
- v0.5.18: **M2-2-BUILTIN-R1-001 を修正**（`tests/` と docs だけで、`src/` は変えない。SP1 で判定・再現・洗い出し・試作と設計を行い、人間の承認の後に実装した）
  - 構造ガードの要素アクセスの枝で、キーの型から取れたプロパティに `processMember` を当て、メンバーの名前（`process.getBuiltinModule` など）で報告する（+6 / −2 行）。
    キーの型が 1 つに決まらない形は従来どおり `dynamic access to …`。ADR-0019 の決定 2 を実装に合わせて正確にし、v0.5.17 の不足を注記した
  - 洗い出し（写しで実測）: 31 形 + 対照 5。v0.5.17 は 18 形を見逃した（k20・k26 はほかの規則で検出していたが、メンバーの名前では報告しなかった）。宣言でない分割代入は
    修正の前後とも検出する。新しい回帰テスト 39 件（v0.5.17 のガードでは 20 件 FAIL）。本物の `src/` への違反は 0。既存のガードのテストの期待値は変わらない。
    テスト件数 761（104 ファイル）→ 800（105 ファイル）
  - バックログは項目も番号も変えない
- 独立レビュー m2-2-builtin-r2（範囲 `v0.5.17..v0.5.18`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の M2-2-BUILTIN-R1-001 は **解消**。新しい指摘は **High 1** / Medium 0 / Low 0
  （M2-2-BUILTIN-R2-001: 要素アクセスの許可が、キーの型だけを根拠にしていて、`as`・`any`・`JSON.parse` などで型だけ安全なリテラルに見せた値で迂回できる）。写しで実行時に標準出力へ届くことを実測。
  v0.5.4 からの既存の問題（v0.5.17・v0.5.18 の変更が作ったものではない）
- v0.5.19: **M2-2-BUILTIN-R2-001 を修正**（`tests/` と docs だけで、`src/` は変えない。SP1 で判定・再現・洗い出し・試作と設計を行い、人間の承認〈案 C〉の後に実装した）
  - 構造ガードで、許可の根拠を型でなく構文か宣言の解決にした（ADR-0019 の決定 2 の改訂と決定 7）: 要素アクセスのキーはソース上の文字列リテラルだけを安全とする。child の `stdio` もソース上の
    リテラルだけ。型が `any` の値の呼び出しと fs の書き込み先、`.constructor` の読み取り、リテラルのキーの `eval`・`Function`・`require`・`createRequire`、`Safe` を作る総称型の cast を違反にする。
    fs のリテラルのパスは、`.`・`//`・`x/../` を畳んでから `/dev/`・`/proc/` を見る（+55 / −20 行、先頭のコメントを含む）
  - 洗い出し: 1 巡目 51 形（v0.5.18 は塞ぐべき 36 形のうち 30 形を見逃し、実行時に端末へ届いた。案 C は 30 形すべてを塞ぐ）。2 巡目 82 形（構文の形と、holder を別の経路で得る形。62 形を違反にし、
    パスの書き方の 5 形を 1 規則で塞ぎ、EventEmitter の `this` と組み立てたパス〈URL・`join`〉を限界にした）。3 巡目は要らないと判断
  - 新しい回帰テスト 100 件（v0.5.18 のガードでは 39 件 FAIL）。R1 の回帰テストの対照 3 件（型がリテラルのキー）を、構文上のリテラルの対照へ置き換えた（人間の承認）。ほかの既存のガードのテストの
    期待値は変わらない。本物の `src/` への違反は 0。テスト件数 800（105 ファイル）→ 900（106 ファイル）
  - ADR-0019 に決定 7 と既知の限界（名前を書かない経路の `Function`、holder を得る経路の網羅と EventEmitter の `this`、ガードの位置づけ、`tests/` の外部コマンドの宣言）を足した。バックログは項目も番号も
    変えない
- 独立レビュー m2-2-builtin-r3（範囲 `v0.5.18..v0.5.19`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の M2-2-BUILTIN-R2-001 は **解消**。新しい指摘は **High 7** / Medium 1 / Low 0
  （M2-2-BUILTIN-R3-001〜008: v0.5.19 の広い保証〈許可の根拠は型でなく構文か宣言〉が、writer・生成者の許可〈名前〉、総称型の cast、`stdio` の後続の spread、fd の判定〈型〉、fs・child の API の判定、`.constructor` の
  wrapper、fs の全引数の device path で成立していない）。指摘は R1（1 件）→ R2（1 件）→ R3（8 件）と広がった
- v0.5.20: **M2-2-BUILTIN-R3 を修正**（`tests/` と docs だけで、`src/` は変えない。SP1 で 8 件を 1 件ずつ 3 つの箱に仕分け〈直す・既知の限界・指摘が誤り〉、許可の分岐の全数棚卸しと 2 巡目の洗い出しを行い、人間の承認の後に実装した）
  - C0: `brace-expansion` の high の advisory 3 件を `npm audit fix` だけで直した（`package-lock.json` の 1 か所。`--force` と `min-release-age` の変更なし）
  - 箱 1（直した）: R3-001（writer は正確な組 + 全枝 `Safe`）、R3-002（認可は最上位の宣言の名前）、R3-003（総称型の cast は必須の T の引数だけ）、R3-004（`stdio` の後ろの spread）、R3-006（fs・child の関数は callee だけ）、
    R3-007（`.constructor` の wrapper）、R3-008（device path は `FS_WRITERS` の先頭の引数だけ）、2 巡目の K1（fd option）・K2（brand-guard の呼び出し元の名前）・K4（`.call` など）。R3-005 は部分規則（型アサーションの形）
  - 箱 2（既知の限界）: R3-005 の残り（`JSON.parse` の any を `string` の注釈へ入れる形）、EventEmitter の `this`（狭い規則を試作して `src/` と両立することを確かめたが、Record 経由の登録が残るので採らなかった）、
    K3（brand-guard の広げ。バックログ 21）、読み取りの device path の誤検出（fail closed のまま）
  - ADR-0019 の決定 7 は「許可の分岐の表」と 1 対 1 で書き直した（v0.5.19 の広い文を訂正）。ARCHITECTURE・CHANGELOG の同じ文も直した
  - 新しい回帰テスト 116 件（v0.5.19 のガードでは 52 件 FAIL）。既存の 900 件の期待値は変わらない。本物の `src/` への違反は 0。テスト件数 900（106 ファイル）→ 1,016（107 ファイル）
  - **レビューを終える基準**（人間の判断。CLAUDE.md・共通ルールには足さない。**v0.5.22 で回数の上限に改め、v0.5.23 で項目 2・3 を明確にした**。v0.5.21 までは「High が 0 なら終える」と「新しい指摘が (i)・(ii) だけなら終える」の OR だった。それでは、不注意で書ける Medium の形だけが残ったとき、
    High が 0 であることを理由に終えてしまう〈r5 のレビュアーの指摘〉）: m2-2-builtin の独立レビューは **r6 を最後の 1 回とし、r7 は依頼しない**。「High が 0」だけを終える理由にしない。r6 の結果は次のとおり扱う。
    1. 端末へ届く形が **`src/` に実在する**: その場で直す（回数の上限の例外）。
    2. `src/` に 0 か所の形のうち、(i) 意図的な偽装が要る形、(ii) 塞ぐ規則が `src/` と両立しない形、(iii) 端末へ届かない誤検出、のいずれかに**当たる形だけ**: 1 行の根拠つきで分け、
       ADR の既知の限界と代償に書いて終える。**不注意で書ける形を (i) に入れない**。
    3. 入口の表に載っていない入口、または**表にある入口の規則の漏れ**が、`src/` に 0 か所の不注意で書ける形として見つかった場合は、表と規則を直す（修正の確認は自己 verify と回帰テストで行い、レビューの回は増やさない）。
       最後のレビューで見つかった不注意で書ける形を、(i)・(ii)・(iii) に分類し直して限界にすることはしない（r6 の R6-001〜004 がこの扱い）。
    r6 の依頼文では、入口の表を添付し、新しい指摘を表の行に紐づけてもらい、(i)／(ii)／不注意で書ける形の 3 分類で報告してもらう。既存の箱 2 の分類: R3-005 の残りと総称型の cast と別の値は (ii)、条件型・mapped type は (ii)、
    EventEmitter は、直接解決できる形を v0.5.22・v0.5.23 で閉じ、Record・配列・非リテラルの要素アクセス・parameter・戻り値・getter の先だけが (ii)、`function (this: 偽の型)` は (i)
  - バックログは、既存の項目と番号を変えず、21 を末尾に足した
- 独立レビュー m2-2-builtin-r4（範囲 `v0.5.19..v0.5.20`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の R3-001〜008 は、解消 5（001・002・004・007・008）、部分的に解消 3（003・005・006）、未解消 0。新しい指摘は **High 4** / Medium 2 / Low 0
  （M2-2-BUILTIN-R4-001〜006: fs の writer の先頭の引数と `fd` option が union・型パラメーターの枝にある形、fs・child の関数を要素アクセス・分割代入で得る形、`stdio` の後ろの計算された名前、括弧・`!` と options の wrapper の扱いの不整合、
  決定 7 の表が許可の全部ではないこと）。レビュアーは High 4 件を不注意で書ける形と分類し、レビューを終了できる状態とは判断しなかった
- v0.5.21: **M2-2-BUILTIN-R4 を修正**（`tests/` と docs だけで、`src/` は変えない。SP1 で 6 件を実測し、型・構文の形で絞る箇所 51 と許可の分岐 53 の棚卸し 1 巡と試作を行い、人間の承認の後に実装した。lock は変えていない）
  - 箱 1（直した）: R4-001（fs の writer の先頭の引数・device path を union・intersection・型パラメーターの枝まで分解）、R4-002（`fd` option の枝。動的なキー・index signature は規則 K: fs の呼び出しに限る）、
    R4-003（fs・child の関数の参照を要素アクセス・分割代入・`fs/promises` まで見る）、R4-004（`stdio` の後ろの計算された名前）、R4-005（括弧・`!` と options の wrapper の誤検出 2 方向。`xb25_stdio_options_paren` の期待値を `reported: false` に変更）、
    INV-1（総称型の cast の `as T | undefined`・`NonNullable<T>`。両ガード）、R4-006（決定 7 の表の範囲を「棚卸しした許可の分岐で、すべての許可の一覧ではない」と狭く明記。案 2）
  - 箱 2（既知の限界）: INV-1 の残り（`Awaited<T>`・`Partial<T>`。(ii)）、R3-005 の残り・EventEmitter の unbound method（(ii)）、`function (this: 偽の型)`（(i)）。箱 3: `stdio` の後ろの method（d07。実行時に拒まれる誤検出）
  - 新しい回帰テスト 91 件（SP1 の fixture 89 形。v0.5.20 のガードでは 62 件 FAIL）。既存の 1,016 件は `xb25` の 1 件の期待値以外は変わらない。本物の `src/` への違反は 0。テスト件数 1,016（107 ファイル）→ 1,107（108 ファイル）
  - 代償として違反になる形 6 つ（`PathOrFileDescriptor` を受ける wrapper、省略可能な options の wrapper、namespace の分割代入、`stdio` の後ろの動的なキー、`as T | undefined`、`Record` の options）は ADR-0019 に記録した
  - 棚卸しの 2 巡目はしない（教訓 §2-7 の基準。残った × は 2 次的）。教訓の候補は response-builtin-r4 に記録した（`tasks/lessons.md`・共通ルールには足していない）
  - 次の独立レビュー（r5）のパケットには、`src/` の全文と、response-builtin-r4 に収録した lock の差分（`--doc` で載せる）を足す
- 独立レビュー m2-2-builtin-r5（範囲 `v0.5.20..v0.5.21`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の R4-001〜006 は、解消 5（001・002・004・005・006）、部分的に解消 1（003）、未解消 0。新しい指摘は **High 2** / Medium 1 / Low 1
  （M2-2-BUILTIN-R5-001〜004: fs・child の関数を、構文の列挙から外れる形〈parameter の分割代入・変数のキー・namespace を局所の interface の helper へ渡す形〉で得る形、`fd` option が静的な型から見えなくなる形、EventEmitter の unbound method の分類が広すぎること、
  計算されたキーの `as const`・`satisfies` の誤検出）。4 件とも不注意で書ける形で、`src/` の該当は 0。レビュアーは、レビューを終了できる状態とは判断しなかった
- v0.5.22: **M2-2-BUILTIN-R5 を修正**（`tests/` と docs だけで、`src/` は変えない。SP1 で 4 件を fixture 70 件で実測し、入口の表を 1 回作り、人間の承認の後に実装した。lock は変えていない）
  - 方式: **構文を足さず、値の入口を塞ぐ**。fs・child_process の関数の束を作る import の形を違反にし、`fd` を取る API の options を新しい object literal に限り、listener の `this` の直接の形を違反にし、計算されたキーの wrapper を局所で剥がす
  - 箱 1（直した）: R5-001（default import・`import * as`・`{ default as x }`・`{ promises }`・`export *`・`export * as`・再 export・動的 `import()` を違反）、R5-002（`createReadStream`・`createWriteStream` の options を省略・文字列・新しい object literal に限る。`new Utf8Stream` を違反〈入口の表で見つけた〉）、
    R5-003（`process.on` などの listener が `this` を使う直接の形。`prependOnceListener` を含む）、R5-004（`stdio`・規則 K の計算されたキーを wrapper を剥がして読む。holder の `process["platform" as const]` は違反のまま）、docs の 2 点
  - 箱 2（既知の限界）: R5-003 の Record・要素アクセスの先（(ii)）、総称型の cast と別の値（(ii)）。箱 3: `fd` を持たない options の変数も報告する代償、`import("node:fs")` の代償
  - 新しい回帰テスト 75 件（SP1 の fixture 70 形。v0.5.21 のガードでは 41 件 FAIL）。既存の 1,107 件は、期待値を変えた 13 件（EventEmitter の限界の記録 11 件、`b14`、`ct07`）を除いて変わらない。本物の `src/` への違反は 0。テスト件数 1,107（108 ファイル）→ 1,182（109 ファイル）
  - ADR-0019 に入口の表を足した。既存の規則（要素アクセス・module の分割代入、`fd` option の型の検出、規則 K）は全部残した。外す判断は r6 の後。教訓の候補は response-builtin-r5 に記録した（`tasks/lessons.md`・共通ルールには足していない）
- 独立レビュー m2-2-builtin-r6（**最後の 1 回**。範囲 `v0.5.21..v0.5.22`。原文と対応記録は `docs/reviews/m2-2/`）: 前回の R5-001・003 は部分的に解消、R5-002・004 は解消。新しい指摘は **High 4**（M2-2-BUILTIN-R6-001〜004: 関数の再 export を許していて、再 export したローカル module が関数の束になる入口、
  `Utf8Stream` の constructor を局所の construct signature に持ち替える形、listener の登録 method を `process["on"]` と書く形、listener の別名の追跡〈shorthand property・class field・4 段以上〉）。4 件とも不注意で書ける形で、`src/` の該当は 0。レビュアーは、4 件を (i)/(ii)/(iii) の限界に分類し直さず、最終修正で閉じるよう勧めた
- v0.5.23: **M2-2-BUILTIN-R6 を最終修正**（`tests/` と docs だけで、`src/` は変えない。4 件を fixture 55 件で v0.5.22 のガードに当てて実測し〈4 件とも見逃しと端末への到達を確認〉、人間の承認の後に実装した。lock は変えていない）
  - 箱 1（直した）: R6-001（fs・child_process の関数の名前での export を違反）、R6-002（`Utf8Stream` の値の import・再 export を違反）、R6-003（登録 method の literal の要素アクセス）、R6-004（別名の追跡: shorthand property・class field・何段でも・循環で止まる）。入口の表に 3 行を足す・直した
  - 直さなかった形: getter が function を返す listener、Record・配列・parameter・戻り値の先（(ii)）。既存の規則は全部残した
  - 新しい回帰テスト 58 件（v0.5.22 のガードでは 26 件 FAIL）。既存の期待値の変更は `p18_named_reexport` の 1 件。テスト件数 1,182（109 ファイル）→ 1,240（110 ファイル）
  - **この最終修正は、独立した再レビューを受けていない**（自己 verify と回帰テストで確認）。フレークしたテスト（`every edit of a repository file type-checks`）の修正と、残した多重の防御を外す判断は、別の依頼として扱う
- v0.5.24: **バックログ 9・10 を実装**（`src/` を変えた〈v0.5.14 以来〉。SP1 で実際の CLI を使って実測し、試作を一時 worktree で作ってから、人間の承認の後に実装した。lock・依存関係・`tests/structure/` は変えていない）
  - 項目 9（案 9-1、判断 (b) 表記にして残す）: 書き込みの出口で形式別に変換する。レポートの JSON は `\uXXXX`（読み戻すと同じデータ）、Markdown は `\u{HEX}`、init の設定は `\uXXXX`。review-packet は fail closed のまま。
    禁止文字の集合は既存の 75 コードポイントのまま。Markdown の構造（1 行のフィールドの LF・TAB、表のセルの `|`、フェンスの長さ）も直した。`maskDeep()` を `safeJson()` と同じ JSON データの写し（`copyJson()`）にした（別 commit）
  - 項目 10（案 10-2）: check の環境から `FORCE_COLOR`・`PY_COLORS` を除き、`NO_COLOR=1` を足す（`src/runner/env.ts` の `checkEnv()`）。`NO_COLOR` を足すだけでは、実測で何も変わらず、`FORCE_COLOR` があると eslint は色を出し続けて Node の警告が増える
  - 実測（修正前 → 後）: 生の禁止文字 `latest.json` 22 → 0、`latest.md` 40 → 0、init の設定 5 → 0。`FORCE_COLOR=1` の verify の `latest.md` の生の ESC 131 → 0。通常のレポートは v0.5.23 とバイト単位で同じ
  - 新しいテスト 115 件（v0.5.23 のコードでは 108 件 FAIL）。既存の 1,240 件の期待値の変更は 0 件。テスト件数 1,240（110 ファイル）→ 1,355（115 ファイル）。ADR-0020 を新設した（ADR-0016 に注記）
  - **レビューの方針**（人間の判断）: `src/` を変える出力の境界の変更なので、独立レビューを **1 回行い、上限は 2 回**とする（1 回目で High が出たときだけ 2 回目。**上限を超えたら終える**）。m2-2-builtin の「レビューを終える基準」と同じ形で扱う:
    端末へ届く、またはファイルに残る形が `src/` に実在すればその場で直す。`src/` に 0 か所の形は (i)・(ii)・(iii) に当たるものだけを ADR の既知の限界に書いて終える（不注意で書ける形を (i) に入れない）。
    表（ADR-0019 の入口の表、ADR-0020 の書き込み箇所のテスト）に無い入口や、表にある入口の規則の漏れは、表と規則を直す（レビューの回は増やさない）
  - **1 回目の結果**（backlog-9-10-r1。範囲 `v0.5.23..v0.5.24`。原文と対応記録は `docs/reviews/backlog-9-10/`）: **High 2 / Medium 1 / Low 1**、不注意で書ける形が High 2・Medium 1、(iii) が Low 1。**`src/` に実在する漏れは 0**
    （生の禁止文字が残る現行の書き込み漏れは無い）。High 2 は書き込み箇所のテストの不足（R1-001: `writev`・`writevSync` が一覧に無い、stream・`FileHandle`。R1-002: 「門あり」の正規表現判定）、Medium 1 は `executeCommand` の `options.env` が `checkEnv()` を迂回する形（R1-004）、
    Low 1 は Markdown の `\u{HEX}` が元の文字列と区別できないこと（R1-003）。人間の判断で、その場で直した（v0.5.25）
  - **2 回目の扱い**（人間の判断）: **差分（`v0.5.24..v0.5.25`）だけを小さなパケットで出し、これを上限とする**。結果がどうでも 3 回目は行わない。2 回目で出た指摘は、`src/` に実在するものはその場で直し、`src/` に 0 か所の形は表と規則を直す（回は増やさない）か、既知の限界に書いて終える
  - **2 回目の結果**（backlog-9-10-r2。範囲 `v0.5.24..v0.5.25`。原文と対応記録は `docs/reviews/backlog-9-10/`）: 前回の R1-002・003・004 は**解消**、R1-001 は**部分的に解消**（残りは `createWriteStream(...).write()`・`.end()`）。新しい指摘は **High 1（R2-001）/ Medium 0 / Low 1（R2-002）**、
    どちらも不注意で書ける形で、**`src/` に実在する漏れは 0**。R2-001 は `truncate` 系を `NOT_CONTENT` で一覧の外に置いていたこと（延長すると NUL が入る）、R2-002 は docs の「`options.env` を渡す呼び出し 0」が現在の状態と合わないこと。**これが上限の最後で、3 回目は行わない**。人間の判断で「表に出す」（構造ガードは足さない）と「現在の状態で書く」を選び、v0.5.26 で直した
- v0.5.25: **backlog-9-10-r1 の指摘 4 件の修正**（SP1 で 5 つの実測〈M1〜M5〉を行い、人間の承認の後に実装した。lock・依存関係・`tests/structure/`・禁止文字の集合は変えていない）
  - R1-001・002（High）: 書き込み箇所のテスト（`tests/file-write-sites.test.ts`）を、正規表現の判定から、既知の 5 か所を 1 件ずつ明示した表（箇所・外側の関数・書く関数・内容の式をそのまま・種別・注記）との照合に作り直した。`writev`・`writevSync`・`cp` を一覧に足した。
    stream は既知の限界、`FileHandle` は入口で塞がれていると ADR-0020 に書いた（型宣言から書き込み系を全部列挙する方式は採らない）。変換が内容の全部に掛かることは、このテストの役目にしない（実 CLI のテストが担う）
  - R1-004（Medium）: `src/runner/execute.ts` の `env: checkEnv(options.env ?? process.env)`（+2／−1 行。`options.env` を渡す呼び出しは、変更前は `src/`・`tests/` に 0 か所で〈v0.5.25 現在は `src/` 0、回帰テストに 1 call site〉、既存テストの期待値は変わらなかった）
  - R1-003（Low）: コードは変えず、ADR-0020 の既知の限界に書いた（Markdown の表記は元の文字列と区別できない。元データの忠実な確認には JSON）
  - 新しいテスト 32 件の増加（1,355 → 1,387 件、115 → 116 ファイル）。修正前のコードでは、書き込み箇所のテストは `src/` の 9 通りの変更のうち 6 件を見逃し、`options.env` のテストは 5 件中 4 件が FAIL。作り直した 3 件を除いて、既存の期待値の変更は 0 件。対応記録 `docs/reviews/backlog-9-10/response-r1.md`
- v0.5.26: **backlog-9-10-r2 の指摘への対応**（`src/` は変えていない。SP1 で 4 つの実測〈M1〜M4〉を行い、人間の承認の後に実装した。lock・依存関係・`tests/structure/`・禁止文字の集合は変えていない）
  - R2-001（High）: `truncate`・`truncateSync`・`ftruncate`・`ftruncateSync` を一覧テストの `FS_WRITERS` に足した（`NOT_CONTENT` から外した）。実測: 4 形とも、3 バイトのファイルを 4,096 バイトに延長すると、追加された 4,093 バイトがすべて 0x00（U+0000）。`src/` に call が出ると表との差分になる
  - R1-001 の残り（stream）: `createWriteStream` の call が表との差分になることをテストで固定した。stream の `.write()`・`.end()` に渡す内容は検査しない（出たら人間が表に足して判断する）。構造ガードは足していない（人間の判断）。ADR-0020 の既知の限界に、レビュアーの分類（不注意で書ける形）と判断を書いた
  - R2-002（Low）: docs の「`options.env` を渡す呼び出し」を「v0.5.25 現在は `src/` 0、回帰テストに 1 call site」に揃えた（ADR-0020・CHANGELOG・本書・response-r1 への訂正の 1 行）
  - 新しいテスト 10 件の増加（1,387 → 1,397 件）。修正前の定義では新テスト 9 件が FAIL、`src/` に truncate 系を足しても v0.5.25 のテストは 4 形とも見逃した。対応記録 `docs/reviews/backlog-9-10/response-r2.md`
  - **この最終修正は、独立した再レビューを受けていない**（r2 が上限、3 回目は行わない）。自己 verify と回帰テストで確認
- v0.5.27: **バックログ 11 を実装**（`src/cli-program.ts` +5／−4 行。SP1 で 5 つの調査〈M1〜M5〉と、一時 worktree での試作・全テストの実行を行い、人間の承認の後に実装した。lock・依存関係・`tests/structure/`・禁止文字の集合は変えていない）
  - 使い方エラーの終了コードを、verify・init・security-scan と `aiqh` 本体でも **2** にした（review-packet は元から 2。ADR-0021 を新設、ADR-0014 決定 11 に参照 1 行）。ルートの `exitOverride` を、コマンドを足す前に 1 つ置く（commander はサブコマンドを作るときにルートの設定を写す）。review-packet だけにあった override は外し、継承させた
  - 実測（v0.5.26、実 CLI、本処理が走らない 35 形）: 18 形が 1 で、2 に変わる（未知のコマンド・オプション、値の欠落、余分な引数、コマンドなしの `aiqh`）。`aiqh help foo` も 1→2。`--help`・`--version`・`help` は 0 のまま。メッセージ・出力先・バイト数は変わらない
  - 既存テストの期待値の変更は、使い方エラーの終了コード 1→2 の 8 行（3 テスト・2 ファイル）と、`control: byte-identical to v0.5.3` の注記だけ。新しいテスト 36 件（v0.5.26 の `src/` に当てると 19 件が FAIL）。テスト 1,397 → 1,433 件（117 ファイル）
  - 既知の限界（変更の前後で同じ）: 100 KB 級の引数で、pipe への stderr が 65,536 バイトで切れる（`process.exit` と pipe の性質。ADR-0021）。直さない
  - 利用者に見える変更（CHANGELOG・README に書いた）: `== 1` だけを失敗とみなす CI は、使い方の誤りを失敗として扱わなくなる。独立レビューは付けない（人間の判断。出力の境界と fail closed は変わらない）
- v0.5.28: **バックログ 3・7・4 を実装**（テスト基盤の強化。`src/` の差分は 0 行。`tests/structure/` は `brand-guard.ts` +23／−1 と `process-guard.ts` +25／−12 の 2 ファイルだけ〈人間の承認〉。lock・依存関係・禁止文字の集合は変えていない。SP1 で 3 項目の調査と一時 worktree での試作を行い、人間の承認の後に実装した）
  - 項目 3（M2-2-R1-002）: オプション一覧の比較が short 別名も見る（案 B: テストの中の表 `SHORT_ALIASES`。`src/` は変えない）。v0.5.27 では、`-o`→`-p`・`-c` の削除・`--json` への `-j` の追加・`-o` の移動・`<file>`→`[file]` の 5 つが差分 0 だった。値を取るオプションに必須の値（`<x>`）を求める（`[x]` は差分になる）。`aiqh review-packet --help` はバイト単位で同一
  - 項目 7（M2-2-R1-004）: fixture 群 `FA`（13 件）を足し、`brand-guard.ts` で、見逃していた 3 形（名前空間のメンバー・オブジェクトのプロパティ・`string | Checked` の関数型）も検出する（報告を増やす側だけで、型で許可する経路は足していない）。`src/` の違反は 0、`brandGuard` を使う既存 5 ファイルは 362 件 PASS、反転する既存の期待値は 0。バックログ 21 は直していない（`bd01`・`bd02`・`bd04` は `reported: false` のまま）
  - 項目 4（M2-2-R1-003）: probe を「そのツールだけを起動する child_process の呼び出しを初期値に持つ変数」と定義し直した。OR・AND で混ぜた変数、tool 名だけの変数、名前の配列は違反になる。実 `tests/` は 123 呼び出し・違反 0、`zip-interop` の判定は不変
  - 既存テストの期待値の変更は 0。変えたのは検査の関数: option-inventory テストの arity の検査を関数 `arityMismatch` に出して必須の値を求める条件を足し、そのテストの名前の文言を "required value" にした（assertion は同じ）。external-commands テストの `LIMIT` の宣言は、新しい限界 1 件のために複数行にした（既存の 1 件は同一）。新しいテスト 16 件（1,433 → 1,449 件、117 ファイル）。v0.5.27 のガード・検査に新しいテストを当てると、option-inventory で 2 件、`FA` で 4 件、external-commands で 1 件（8 行の報告が欠ける）が FAIL
  - 新しく見つけた限界（直さない）: `skipIf` の条件の向きを読まない（`skipIf(hasPython)` でも `guarded`。バックログ 22、特性テスト `f21_inverted_skipif`）。`null | undefined` を含むコールバック引数（`.then(inlineCode)`）へ描画関数を渡す形は報告される（識別子では v0.5.27 から。保守的な動作として残す。ADR-0014）
  - 利用者に見える変更は無い。独立レビューは付けない（人間の判断）。新しい ADR は作らず、ADR-0014 を更新した
- v0.5.29: **バックログ 8 の A グループ（O2・O7・O8）を実装**（`src/config/load.ts` +14／−5、`src/commands/init.ts` +25／−1。SP1 で 3 項目を実 CLI で再現し、一時 worktree で試作・全テストと自己 verify を実行し、人間の承認の後に実装した。lock・依存関係・`tests/structure/`・禁止文字の集合は変えていない）
  - O2: `realpathNearest()` が使う `entryExists()` は、lstat の失敗をすべて「無い」として親へ上がっていた。ENOENT だけを「無い」にし、EACCES・ENOTDIR・ELOOP などは `ConfigError`（読込で exit 2。check は走らず、レポートも書かない）にした。ENOTDIR も拒否する（人間の判断）
  - O7・O8: `init --write`・`--write-gitignore` が、dangling symlink の先に新しくファイルを作り、`wrote …` と表示して exit 0 だった（プロジェクトの外にも。`--force` でも、リンク先が根の中でも）。書込の直前に `assertNotDanglingLink` で拒否する（exit 2、既存の `failed to write` / `failed to update` の形。`--force` でも拒否）
  - 実測（実 CLI、v0.5.28 → v0.5.29）: `cwd` が辿れないディレクトリ・通常ファイルの下: 読込を通る（check の FAIL、exit 1）→ 読込で exit 2。`output.dir`: check を全部走らせた後の report write error（exit 2）→ 早い configuration error（exit 2）。dangling な設定・`.gitignore` への書込: exit 0 でリンク先を作る → exit 2 で何も作らない。
    対照（未作成の `output.dir`、存在しない `cwd` の check FAIL、根の中の symlink、書込フラグなしの init、symlink の輪）は変わらない。生の禁止文字・秘密様の文字列が新しいメッセージに出ないことを、実 CLI で確かめた
  - 利用者に見える変更（CHANGELOG・README・CONFIG_SPEC・ARCHITECTURE に書いた）: `cwd` のケースは exit 1 → 2（`== 1` だけを失敗とみなす CI は、そのケースが失敗扱いでなくなる。`!= 0` で見る）。init の dangling 拒否は 0 → 2
  - 既存テストの期待値の変更は 0 件。新しいテスト 25 件（`tests/regression-backlog8a-o2-untraversable-path.test.ts` 12 件、`tests/regression-backlog8a-o7-o8-init-dangling-link.test.ts` 13 件。v0.5.28 の `src/` に当てると 15 件が FAIL）。テスト 1,449 → 1,474 件（117 → 119 ファイル）
  - ADR-0022 を新設（規則: ENOENT だけが「無い」。ENOTDIR を拒否する理由、`targetIdentity` との違い、代替案、既知の限界）。独立レビューは付けない（人間の判断。判定を緩める変更ではなく、強める側だけ）
  - 見つけて直していないこと: 有効な symlink への `--force` 上書き・追記（バックログ 23）。`proposeGitignore` の提案文（O5）は C グループに残す
- v0.5.30: **バックログ 8 の B グループ（P3・P11・P4）を実装**（`src/cli.ts` +14／−12、`src/commands/review-packet.ts` +3／−2、`src/review/packet.ts` +13／−5。SP1 で 3 項目の試作を一時 worktree で作り、全テストと自己 verify を実行し、人間の決定の後に実装した。lock・依存関係・`tests/structure/`・禁止文字の集合は変えていない）
  - P3: `resolveCommit()` は git を 2 回呼び、2 回目（tag object）の status を見ず、失敗を「tag object が無い」として packet を書いていた（exit 0）。ref を 1 回だけオブジェクト名に引き、その `^{commit}` を求める（2 回とも status を見る。失敗の文言は `does not name a commit` のまま）
  - P4: `removeTmps()` の `existsSync()` は、辿れない一時ファイルで false になり、消されず挙がらなかった。`rmSync(t, { force: true })` にし、rename で確定した一時ファイルをマップから外した（`tmps.delete(t)`）
  - P11: `readVersion()` は、読めない・version が無いときも `"0.0.0"` を返していた。`package.json` が無い（ENOENT を含む）・読めない・version が文字列でない・空文字は、すべての入口（`--help`・`init` を含む）で exit 2（既存の最上位の catch の 2 行。`src/cli-program.ts` は変えない）
  - 実測: 追加したテスト 22 件は v0.5.29 の `src/` に当てると 14 件が FAIL（残りの 8 件は対照）。`package.json` が無い状態で `--version`・`--help`・`init`・`verify` は exit 2 で標準出力は 0 バイト。v0.5.29 の `src/` と比べ、6 つの range でパケットはバイト単位で一致
  - 利用者に見える変更（CHANGELOG・README・ARCHITECTURE・ADR-0022 に書いた）: `package.json` が読めない・version が不正なとき exit 2（以前は `0.0.0`。`dist/` だけをコピーした環境は `package.json` も一緒にコピーする）。git の失敗でパケットを黙って書かず exit 2。書込の失敗のメッセージが、残っている一時ファイルも挙げる
  - 既存テストの期待値の変更は 0 件。新しいテスト 22 件（`tests/regression-backlog8b-p3-resolve-commit.test.ts` 8 件、`tests/regression-backlog8b-p4-temporary-file-listing.test.ts` 5 件、`tests/regression-backlog8b-p11-version.test.ts` 9 件）。テスト 1,474 → 1,496 件（119 → 122 ファイル）
  - ADR-0022 に追記（新規 ADR は作らない。決定 7、範囲の B、代替案、既知の限界、影響）。独立レビューは付けない（人間の判断）
  - 見つけて直していないこと: O2 のメッセージの重複（`<path>` と `<entry>`）は、O4 と一緒に C・D で決める
- v0.5.31: **バックログ 8 の C グループ（O3・O4・O5・O9）を実装**（`src/` は 7 ファイル +128／−24。SP1 で 4 項目を実 CLI で再現し、一時 worktree で試作・全テストと自己 verify を実行し、人間の決定の後に実装した。lock・依存関係・`tests/structure/`・禁止文字の集合は変えていない）
  - O3: `getGitInfo()` は git の失敗をすべて null にし、verify は `git: not a git repository`、review-packet は `does not name a commit` / `not inside a git work tree` と書いていた（git が実行できない・timeout・exit 128 でも。verdict は変わらない）。`lookupGit()` を新設し（`getGitInfo()` は同じ署名のまま）、
    git の「違う」と git の失敗を分ける（ADR-0022 決定 8）。verify は `git: unavailable (<理由>)`、報告の JSON の `git` は null のまま、Markdown のセルは `(not a git repository, git unavailable, or no commit)`。review-packet は git の「違う」なら従来の文、それ以外は git の 1 行を添える（B の P3 が回した失敗の文言）
  - O4: `checkDirectory()` は ENOENT だけ `does not exist`、他は `working directory cannot be examined: <dir> (<code>)`（読込の後でパスが変わった場合。check は FAIL のまま、exit 1）。O5: `proposeGitignore()` の `existsSync()` を lstat の判定に（ENOENT だけ「無い」。リンクは「ある」）。
    O9: init の root を stat で分類し、辿れないとき `directory cannot be examined`、通常ファイルのとき `not a directory`（**exit 0 → 2**）
  - O2 の文面の重複を解消（`<entry>` が `<path>` と同じなら `— <entry>` を付けない）。**既存テストの期待値 1 件の変更**（人間の承認）: `regression-backlog8a-o2-untraversable-path.test.ts` の EACCES の `output.dir` の正規表現
  - 実測: 新しいテスト 48 件は v0.5.30 の `src/` に当てると 26 件が FAIL（残りの 22 件は対照）。git の 3 つの失敗（実行不能・exit 128・timeout）が `git: unavailable (…)` になり、通常ファイルの `init --cwd` が exit 0 → 2。テスト 1,496 → 1,544 件（122 → 125 ファイル）
  - 利用者に見える変更（CHANGELOG・README・ARCHITECTURE・CONFIG_SPEC・ADR-0022 に書いた）。`== 1` の注意は不要（1 → 2 のケースは無い）。ADR-0022 に追記（新規 ADR は作らない）。独立レビューは付けない（人間の判断）
  - 見つけて直していないこと: 項目 24（`security-scan --cwd <存在しない>` の文言）、項目 25（`HEAD`・ブランチの個別の失敗の表示）。バックログ 8 の残りは D（O6）
- v0.5.32: **バックログ 8 の D グループ（O6）を実装。これでバックログ 8 は完了**（`src/` は 2 ファイル +66／−37: `src/adapters/context.ts` +52／−33、`src/commands/init.ts` +14／−4。SP1 で実 CLI で再現し、一時 worktree で 2 案〈例外にする・理由を集める〉を試作し、全テストと自己 verify を実行し、人間の決定の後に実装した。lock・依存関係・`tests/structure/`・禁止文字の集合は変えていない）
  - O6: アダプタが見る `RepoContext` の `exists()`・`readText()`・`listTopLevel()`・`isExecutable()` と `package.json` の JSON の解析は、失敗をすべて「無い」「Node ではない」にしていた。`package.json` が EACCES・dangling symlink・symlink の輪・ディレクトリ・不正な JSON のどれでも、`init` の出力は `package.json` が本当に無いときと同じ（exit 0、project `other`）だった。
    `tsconfig.json`・`pyproject.toml`・root の一覧・通常ファイルの下の入口も同じ。ENOENT だけを「無い」にし、読みの ENOENT でも lstat で入口があれば（dangling）、ENOTDIR、不正な JSON は `ExaminationError` を投げ、`init` は監査を止めて exit 2（dry-run も。何も書かない）。実行できない入口（x ビットが無い、dangling な venv の python）は性質で、false のまま。`RepoContext` の型は変えない
  - 影響の広さ（SP1 の実測）: dangling または不正な JSON の `package.json` で `init --write` は `security` だけの設定を書き、その設定の `aiqh verify` は、健全なとき（lint 失敗）の FAILED から PASSED になった。`--write-scripts` は何も言わずに exit 0 だった。アダプタは `init.ts` と `generate.ts` からしか使われず、`verify`・`security-scan`・`review-packet` の判定には直接関わらない
  - 実測: 新しいテスト 22 件は v0.5.31 の `src/` に当てると 14 件が FAIL（残りの 8 件は対照）。テスト 1,544 → 1,566 件（125 → 126 ファイル）。**既存テストの期待値の変更は 0 件**
  - 利用者に見える変更（CHANGELOG・README・ARCHITECTURE・CONFIG_SPEC・ADR-0022 に書いた）: 調べられない入口があるリポジトリの `init` が exit 0 → 2。`== 1` の注意は不要（1 → 2 のケースは無い）。ADR-0022 に追記（新規 ADR は作らない。決定 9、範囲の D）。ADR-0011 は変えない。独立レビューは付けない（人間の判断）
  - 見つけて直していないこと: 項目 26（形が違う `package.json`）、項目 27（`exists()` が入口の種類を見ない）。ENOTDIR・一覧できない root で `init` が止まること、root が辿れないときの文言は人間の判断。項目 24・25 も直していない
- v0.5.33: **バックログ 16・2 を実装し、19 の (a)(b) を直した**（`src/` は 5 ファイル +124／−34: `src/runner/execute.ts` +95／−29、`src/runner/run-checks.ts` +15／−3、`src/types.ts` +6、`src/cli-signals.ts` +6、`src/cli.ts` +2／−2。SP1 で `executeCommand` と実 CLI で再現し〈本物の EPERM は安全に起こせないので、同じプロセスの中で模擬〉、
  一時 worktree で案 V・P と案 D・C を試作し、全テストと自己 verify を実行して、人間の決定の後に実装した〈4 commit〉。lock・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない）
  - 16: v0.5.32 は、SIGKILL を送った後、グループの消滅を確かめずに確定した（返った時点で 5 回中 5 回グループが残っていた。消えたのは 3〜6 ms 後）。`close` が先に来ると猶予の終わりまで待った（4.5 秒。消滅は約 1.9 秒）。**別のプロセスグループの孫が pipe を握ると、タイムアウトの経路は孫が終わるまで返らなかった**
    （寿命 20 秒で 20.3 秒。中断の経路は CLI の安全弁 8 秒で終了し、レポートを書かなかった）。文言 `(process group terminated)` は常に出た。今は、`close` が来て、かつグループが消えたときに確定し、SIGKILL の後は最大 2 秒（`confirmMs`）で打ち切って、消えていなければ文言で書く（ADR-0023）
  - 2: kill が EPERM のとき（模擬）、`spawn failed: kill EPERM` で 1.0 秒で確定し、子は動き続け、確定の後も SIGKILL のタイマーが残って kill を試みた（`error` が `killTree` の中で同期的に出て、タイマーを消せなかった）。今は `process.kill(pid)` で送り、`error` は起動の失敗だけを確定させ、有界時間の後に
    `process group could not be signalled (EPERM) and was still present after 2000ms` と書く。**2 は 16 の有界時間に依存する**
  - 19: (a)(b) を直した（テストだけ。(a) 孫が pid ファイルの消滅で自分で終わる、(b) CLI の呼び出しに timeout 25 秒と SIGKILL）。**(c) は直さない**: pid の 1 周は約 2 分（全テストの 64 秒の間に pid が約 53,300 進む＝毎秒約 830）で、probe は孫の死の数百 ms 後なので再利用は起きない。誤る向きは「生きている」＝テストの失敗側。
    unix socket への接続で生存を見る案（5 か所のうち 4 か所。`regression-r3-cli.test.ts` は pid ファイルの読みの回帰が対象なので変えない）は動くが、利益が小さい
  - 5: 含めなかった。実測を項目 5 に追記した（vitest を別のプロセスグループで起動する案は、runner のグループごとの SIGKILL が届かず、かえって止まらない）
  - 実測: 新しいテスト 12 件は v0.5.32 の `src/` に当てると 9 件が FAIL（決定的 8 件＋競合に依存するガード 1 件）。**既存テストの期待値の変更は 0 件**（文言だけを直す案 D は 1 件）。テスト 1,566 → 1,578 件（126 → 127 ファイル）。終了コードとレポートの欄は変わらない
  - 利用者に見える変更（CHANGELOG・README・ARCHITECTURE・CONFIG_SPEC・ADR-0023 に書いた）。`== 1` の注意は不要（1 → 2 のケースは無い）。新規 ADR-0023、ADR-0005 に参照 1 行。**独立レビューは 1 回付ける**（ChatGPT。範囲 v0.5.32..v0.5.33、観点は項目 16・2。項目 19 は任意。終える基準は上の「レビューを終える基準」〈回数の上限。「High が 0」だけを終える理由にしない〉に従う）
  - 見つけて直していないこと: 項目 5、項目 19 の (c)。保証の外: 別のプロセスグループへ移った子孫、通常に終わったチェックの後に残る子孫
- v0.5.34: **v0.5.33 の独立レビュー R1（High 1・Medium 1）に対応した**（`src/` は `src/runner/execute.ts` +42／−18 と、コメントだけの `src/cli.ts`〈1 行。行数は同じ〉・`src/cli-signals.ts`〈2 行〉。停止ポイント1で再現・試作し、人間の決定の後に実装した〈3 commit〉。lock・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない。原文と対応記録は `docs/reviews/backlog-16-2-19/`。新規 ADR は作らず、ADR-0023 に追記）
  - B16-R1-001（High）: 一度 ESRCH を見たプロセスグループへ、`poll()` が signal 0 を送り続け、`close` 未着だと SIGKILL のタイマーが残り、`terminateActiveChildren` も全 target へ SIGKILL を送った。`process.kill` の差し替えで決定的に再現した（最初の ESRCH の後に、同じ番号の別グループが応答するふり）。
    **v0.5.32 から同じ性質があった**（5 つの形のすべてで、消えたグループの番号へ SIGKILL を送った）。v0.5.33 は `close` が先に来る形で送らなくなり、`close` 未着の待ちを有界にしたが、「消えたと分かっているのに送る」形が残っていた（signal 0 が 53〜137 回と SIGKILL 1 回）。ADR-0023 の既知の限界の説明（「消えていない」と書くだけ）は SIGKILL を落としていたので訂正した。
    今は `GroupState { pgid, gone }` を `activeChildren` に持ち、`executeCommand` の後始末と `terminateActiveChildren` が共有する。`gone` は最初の ESRCH で立て、戻さない。SIGKILL のタイマーは `gone` なら何もしない。`close` 未着の待ちは消滅の最初の確認から `confirmMs`（決定 2 の文書どおり。以前のコードは SIGKILL のタイマーが先に発火すると、実際に送った時刻から数えた）。Windows の分岐は変わらない
  - B16-R1-002（Medium）: 「7 秒 < 8 秒」は定数の関係で、レポートが先に書かれる保証ではない。実測: 1.5 秒の停止で、安全弁が 8,018 ms に先に動き、レポートが書かれなかった（exit 130）。文書・コメント・テスト名を狭めた（案 X）。実装の動きは変えていない。案 Y1（確認の起点を予定時刻に。使い捨ての試作で 7,044 ms にレポートあり。3 秒以上の停止は防げない）と案 Y2（フェーズごとの期限）は採らなかった
  - 実測: 新しいテスト 7 件は v0.5.33 の `src/` に当てると 4 件が FAIL（残りの 3 件は対照）。**既存テストの期待値の変更は 0 件**（既存の 1 件のテスト名とコメントだけ）。テスト 1,578 → 1,585 件（127 → 129 ファイル）。利用者に見える変更は無い（終了コード・レポートの欄・文言は同じ）
  - 見つけて直していないこと: 項目 28（最初のシグナルの前の確認）、29（安全弁をフェーズごとの期限に）、30（Windows のポーリングの起点）。**独立レビューは 1 回（r2、範囲 `v0.5.33..v0.5.34`）。観点は「`gone` の不変条件がすべての signal の経路で保たれるか」「Windows の分岐」「`terminateActiveChildren`」。終える基準は、r2 の結果を見て人間が決める**
- v0.5.35: **v0.5.34 の独立レビュー R2（High 1・Medium 1）に対応した**（`src/` は `src/runner/execute.ts` +6／−2 だけ〈`killTree`〉。停止ポイントで判定・再現し、実装した〈3 commit〉。この 3 commit では lock・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない〈依存関係の更新は 4 つ目の commit。下の deps〉。原文と対応記録は `docs/reviews/backlog-16-2-19/`〈`independent-review-r2.md`・`response-r2.md`〉。新規 ADR は作らず、ADR-0023 に追記）
  - B16-R2-001（High）: v0.5.34 の `killTree` は、`gone` のグループへの送信を飛ばした後、そのまま子の pid への直接送信に落ちた（ガードは `exitCode`・`signalCode` だけ）。`process.kill` の差し替えで、CLI の中断の順〈`abort()` → `terminateActiveChildren`〉も逆の順も、SIGTERM 1 回を再現した（v0.5.33 は 0 回で、この経路は v0.5.34 が新しく開けた）。
    今は、グループ経路があるとき、`gone` なら何も送らない。子へ直接送るのは、グループへの送信が ESRCH 以外で失敗したときだけ。Windows・pgid なしの分岐は変わらない。**実際の Node では、到達は観測されず、構造上も起きにくい**（macOS: leader が終わって未回収の間、`kill(-pgid, 0)` は EPERM か成功。Node は回収と同じコールバックで `exitCode` を設定する。実際の子 360 個・約 77 万回の標本で 0 回。手元の実測。Linux は未確認）。それでも、「消えたと分かっているなら何も送らない」方が単純で安全なので直した。信号を送る全経路を棚卸しした（ほかに ESRCH の後に届く経路は無い）
  - B16-R2-002（Medium）: v0.5.34 の文書が、`close` 未着の待ちの起点を「消滅の最初の確認から」とだけ書いていた。コードは `anchor = sigkillSentAt ?? goneAt`。**文書を直した（実装は変えていない）**: SIGKILL の前にグループが消えたときは消滅の最初の確認から、SIGKILL を送った後は SIGKILL の時刻から。SIGKILL が先の形はテストで固定した。時刻を共有する案は、大きく得るものが小さいので採らなかった
  - 実測: 新しいテスト 7 件は v0.5.34 の `src/` に当てると 2 件が FAIL（残りの 5 件は対照・固定）。**既存テストの期待値の変更は 0 件**。テスト 1,585 → 1,592 件（129 → 131 ファイル）。利用者に見える変更は無い
  - 自レビュー（実装者が同じ会話で先に書いた。**独立ではない**）の Medium 1・Low 5（S-1〜S-6）は、`response-r2.md` で同じ基準で判定した（すべて妥当。ただし S-1 は CLI で到達しない）。**実装していない**。項目 31〜33 に候補として載せた。承認を待つ
  - 見つけて直していないこと: 項目 31（`terminateActiveChildren` が後ろの target を猶予の間調べない）、32（文書の細部）、33（テストの細部）、および項目 28〜30。再レビューの要否・終える基準は、人間が決める
  - deps（4 つ目の commit）: `npm audit` の high の勧告 GHSA-68fv-2mgg-jv7q のため、devDependency（推移的。vitest → vite → postcss）の `source-map-js` を 1.2.1 → 1.2.2 へ更新した（`npm audit fix`、`--force` なし、修正版が `min-release-age=7` を満たした後。`package.json` は変更なし。npm がロックのルートの版の記録も 0.1.0 → 0.5.35 に合わせた）。最初の 3 commit は、勧告がレビュー済みになった後に検証したので、単体の `verify` は `dependency` だけ FAIL する
- v0.5.36: **v0.5.35 の独立レビュー R3（High 0・Medium 0・Low 1）と、v0.5.35 の実装者の自レビュー S-1〜S-6（独立ではない）に対応した**（`src/` は `src/runner/execute.ts` だけ。6 commit。lock・依存関係・`package-lock.json`〈版は 0.5.35 のまま〉・`tests/structure/`・禁止文字の集合は変えていない。原文と対応記録は `docs/reviews/backlog-16-2-19/`〈`independent-review-r3.md`・`response-r3.md`〉。新規 ADR は作らず、ADR-0023 に追記）
  - B16-R3-001（Low）: グループへの送信が EPERM などで失敗し、子への直接送信が ESRCH のとき、`killTree` がグループの errno を捨てていた（v0.5.33 から）。今はグループの errno を返す（`errorSummary` が「could not be signalled」になる。status・終了コードは同じ）
  - 自レビュー: S-1（項目 31。`terminateActiveChildren` が全 target を調べる）、S-2・S-5・S-6（項目 32。README の安全弁の注意、「決定的に再現した」の訂正の注記、手元の実測の明記）、S-3・S-4（項目 33。テストの `signal` の受け渡しと、期待値を変えない時間の余裕）
  - leader の pid（**実装者が信号の経路の一覧の作成中に見つけた**。レビューの指摘ではない。作業を止めて報告し、人間の判断で直した）: 直接送信が ESRCH を返した pid へ、次のエスカレーションでもう一度送っていた（v0.5.33 から）。今は `GroupState.leaderGone` で以後送らない
  - 棚卸し: `grep` のコマンドと出力を `response-r3.md` に載せた。**ESRCH を見た後に、番号（負の pgid・正の pid）へ何かが届く経路は 0**
  - 実測: 新しいテスト 8 件。v0.5.35 の `src/` で 3 件が FAIL、leader の pid の 4 件は S-1 までの修正で FAIL（残りは対照）。**v0.5.35 までにある既存テストの期待値の変更は 0 件**。テスト 1,592 → 1,600 件（131 → 133 ファイル）。利用者に見える変更は、上の `errorSummary` の 1 点だけ（差し替えでしか作れない状態）
  - **バックログ 16・2・19 の独立レビューは R1〜R3 で終えた**（R3 で High・Medium が 0。人間の判断）。v0.5.36 に独立レビュー（r4）を付けるかは、人間が決める
- v0.5.36 の後（docs だけの commit。版は 0.5.36 のまま、タグなし）: **v0.5.36 の独立レビュー R4（範囲 `v0.5.35..v0.5.36`、軽いレビュー。問いは「ESRCH を見た番号へ届く経路が 0 か」と「`leaderGone` が通常の動きを変えないか」の 2 つ）は、指摘なし（High 0・Medium 0・Low 0）**。依頼文に先に書いた基準（High・Medium が 0 なら終える）により、**バックログ 16・2・19 の独立レビューは R1〜R4 で終えた**（人間の判断）。原文と対応記録は `docs/reviews/backlog-16-2-19/`〈`independent-review-r4.md`・`response-r4.md`〉
  - R4 はコードを実行していない（静的な読解）。未変更ファイルの経路は、`response-r3.md` の M4 の grep の出力から読める範囲までの確認（未確認範囲は `response-r4.md` にそのまま載せた）
  - CHANGELOG の v0.5.36 の見出しに commit 52e923e / tag object f8941d5 を記入した（次のリリースの予定がまだ無いので、release commit でなくこの docs の commit で記入）。ADR-0023 の「範囲（v0.5.36 で追記）」と `response-r3.md` に、「グループ経路が無い分岐（Windows・pgid なし）」は「Windows」が正確、という訂正の注記を入れた
  - 依頼文の記述の誤り（人間側）: r3・r4 の依頼文が、パケットに入っていない R1・R2 の原文を「入っている」と書いていた。r4 は渡す前に直した。今後は、依頼文が「入っている」と書くファイルを、パケットの中身と照らしてから渡す（`response-r4.md`）
- v0.5.37（版 A。信号の経路に触れない残りのバックログ）: backlog-rest の SP1（棚卸し・調査。`~/Downloads` の報告）の後、8 commit。**直した**: 26（`package.json` の形）、24（security-scan の root の文言）、25（git の失敗を `unknown` と表示）、17（review-packet の kind `symlink`）、23 と N1（root の外を指す symlink への init の書込を拒否。`--write-scripts` も）、6（`test:minpath` の環境を最小に。絶対パスでの起動は保証の外）。**記録で閉じた**: 12・13・14・19(c)・20・21・22・27・29・30（理由は各項目）。15・18 の古い参照に注記し、35（N2）・36（12 の再定義）を足した。M3 に「Windows での挙動確認」を新設
  - 先に書いたテスト（23・24・25・26・17）は、v0.5.36 の `src/` で FAIL することを SHA 固定の worktree で確かめてから実装した。既存テストの期待値の変更は 1 件（23。人間の承認）。テスト 1,600 → 1,638 件（133 → 138 ファイル）
  - `package.json` 0.5.37（`package-lock.json` は 0.5.35 のまま）。依存関係・`tests/structure/`・禁止文字の集合・信号の経路は変えていない
  - 版 A の独立レビューは、23（と N1）だけに絞った軽いものを push の後に付ける（人間の判断）。版 B（28・34・5。信号の経路）は v0.5.38 で、問いを絞った独立レビューを付ける
  - （v0.5.38 で注記: v0.5.37 は **9 commit**。上の「8 commit」は、push の前に文書だけの 9 個目〈`ff8c6bc`。ADR-0023 の注記と ADR の日付の行〉を足す前の記述。本文は書き換えていない）
- v0.5.38（版 B。信号の経路に触れる残りのバックログ）: 6 commit。**直した**: 28（leader の `exit` の後、`close` か消滅の記録までグループを確かめる。最初のシグナルが再利用された番号へ届く窓を、消滅の後の 25 ms に縮めた。閉じてはいない）、34（`GroupState` の説明の 1 文）、
  5 と N3（`test:minpath` を見張り役のプロセスグループで動かす。止まったときに vitest の子孫と `aiqh-minpath-*` を残さない）。記録は ADR-0023 の「範囲（v0.5.38 で追記）」と ARCHITECTURE の「テストが起動する外部コマンド」
  - （v0.5.39 で注記: 28 の「消滅の後の 25 ms に縮めた」の 25 ms は、確認のタイマーの設定値で上限ではない。窓は消滅から次の確認が実際に走るまでで、イベントループやスケジューラの遅れの分だけ長くなりうる。独立レビュー〈28・5・34〉R1 の B28-R1-001。ADR-0023 の既知の限界）
  - 先に書いたテスト（28・5）は、v0.5.37 の `src/`・`scripts/` で FAIL することを SHA 固定の worktree で確かめてから実装した（28 は 5 件のうち 3 件、5 は 8 件のうち 7 件。残りは対照）。既存テストの期待値の変更は 1 件（28。人間の承認）。テスト 1,638 → 1,658 件（138 → 141 ファイル）
  - **バックログ 23 の独立レビュー R1（High 0・Medium 0・Low 1）で、23 のレビューを終えた**（依頼文に先に書いた基準。人間の判断）。B23-R1-001（Low。境界の回帰テストの不足）は、テストだけを足した（7 件。v0.5.37 の `src/` でも PASS）。原文と対応記録は `docs/reviews/backlog-23/`
  - `package.json` 0.5.38（`package-lock.json` は 0.5.35 のまま）。依存関係・`tests/structure/`・禁止文字の集合は変えていない。`src/` は `src/runner/execute.ts` だけ。終了コード・レポートの欄は変わらない
  - 版 B の独立レビューは、問いを絞ったものを push の後に付ける（人間の判断。範囲は人間が決める）
- v0.5.39（文書の訂正）: **v0.5.38 の独立レビュー（28・5・34）R1（High 0・Medium 1・Low 0）に対応した**（3 commit。文書と `src/`・`tests/` のコメントだけ。動き・定数・テストの期待値は変えていない。原文と対応記録は `docs/reviews/backlog-28-5/`）
  - B28-R1-001（Medium）: 項目 28 の残る窓を「消滅から 25 ms 以内」と上限のように書いていた。25 ms・50 ms は確認のタイマーの設定値で、上限ではない（窓は、消滅〈または最後の確認〉から次の確認・送信が実際に走るまで）。現在の仕様の記述はその場で直し、過去の版の記録には注記を足した（ADR-0023 の「範囲〈v0.5.39 で追記〉」）
  - レビューは、ESRCH の後の送信、見張り役、止め方・終了コード、テストの期待値の変更を問題なしとした。基準（High・Medium が 0）に達していないので、訂正だけを確かめる軽い R2 を付ける（人間の判断）
  - `package.json` 0.5.39（`package-lock.json` は 0.5.35 のまま）。テスト 1,658 件（141 ファイル）は変わらない
- v0.5.39 の後（docs だけの commit。版は 0.5.39 のまま、タグなし）: **v0.5.39 の独立レビュー（28・5・34）R2（範囲 `v0.5.38..v0.5.39`。B28-R1-001 への対応だけを確かめる軽いレビュー。問いは 3 つ）は、指摘なし（High 0・Medium 0・Low 0）。B28-R1-001 は解消**。依頼文に先に書いた基準（High・Medium が 0 なら終える）により、**バックログ 28・5・34 の独立レビューは R1〜R2 で終えた**（人間の判断）。原文と対応記録は `docs/reviews/backlog-28-5/`〈`independent-review-r2.md`・`response-r2.md`〉
  - R2 はコードを実行していない（静的な読解）。未確認範囲は `response-r2.md` にそのまま載せた
  - R2 の依頼文の最初の版は、14 行目が「CHANGELOG の過去の項にも訂正の注記を足した」と読める書き方で、事実と違っていた（人間側の誤り）。渡す前に 1 文だけ直し、その版でパケットを作り直して R2 を受けた（経緯は `response-r2.md`）
  - CHANGELOG の v0.5.39 の見出しに commit e93db63 / tag object f4b7fdc を記入した（片付けの終わりで次のリリースの予定がまだ無いので、release の commit でなくこの docs の commit で記入）
  - **backlog-rest の SP1 で棚卸しした残りのバックログの片付けは、これで終わった**: v0.5.37（版 A。信号の経路に触れないもの。バックログ 23 のレビューは R1 で終えた）、v0.5.38（版 B。28・34・5）、v0.5.39（R1 の Medium への文書の訂正）
- v0.5.40（記録の整理。docs だけ）: **rest2 の SP1 の計画〈5 つの波〉の、波 1 の最初の版**（人間の判断。SP1 の §3-6 の推奨をすべて採用）。4 commit。docs と `CLAUDE.md` だけで、`src/`・`tests/`・`scripts/`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない
  - 36 を計測の結果で記録で閉じた（下の項目 36）。13・19 の (c) の記録の数字に注記を足した（下の各項目。13 は ADR-0013 にも）
  - N3: CONFIG_SPEC の §6 の表から `review` の設定欄を外した（不要。review-packet は CLI のオプションで出荷済み）。N4: ROADMAP・ARCHITECTURE・CONFIG_SPEC の「最終更新」、ARCHITECTURE §3 の例 `verify.yml@v0.3.0`
  - N2: プロジェクトの `CLAUDE.md` のマスクの記述を、実装に合わせた（レポートは `copyJson(report, maskSecrets)`、それ以外の出力は出口の `maskSecrets`。人間の許可）
  - `package.json` 0.5.40（`package-lock.json` は 0.5.35 のまま）。テスト 1,658 件（141 ファイル）は変わらない
- v0.5.41（35・N1）: **波 1 の 2 つ目の版**。4 commit。`src/` は `src/security/mask.ts`・`src/security/patterns.ts`〈コメントだけ〉・`src/report/write.ts`。依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合・判定・終了コード・scanner は変えていない
  - **バックログ 35 を解消**: masker の url-credential を、正規表現でなく「://」を手がかりにした線形の走査にした（同じ一致・同じ置換。scheme の長さは無制限のまま。ADR-0013 の追記〈v0.5.41〉）。64 KiB の 2 乗の形が 2,356〜3,524 ms → 0.25〜0.59 ms
  - **N1 を解消**: 履歴の名前を `wx` で排他的に確保してから中身を置く（同じ秒に始まった 2 つの verify の後の方が、前の履歴を黙って上書きしえた）。既存の名前の規則と失敗時の exit 2 は変わらない
  - 先に書いたテストは、v0.5.40 の `src/` で FAIL することを SHA 固定の worktree で確かめてから実装した（35 は時間のテスト 9 件のうち 3 件、N1 は 3 件のうち 1 件。35 の同値性のテストは v0.5.40 でも PASS するのが正しい）。テスト 1,658 → 1,682 件（141 → 143 ファイル）
  - `package.json` 0.5.41（`package-lock.json` は 0.5.35 のまま）。独立レビュー（label `backlog-35-n1`、範囲 `v0.5.40..v0.5.41`）を付ける
- v0.5.42（20 の最小版）: **波 1 の 3 つ目の版**。3 commit。`src/` は `src/cli.ts` だけ（`src/runner/execute.ts`・`src/cli-signals.ts` は変えていない）。依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない
  - **バックログ 20 を解消（最小版）**: 処理されなかった例外・拒否で、1 行を出口から出し、新しいチェックを起動せず、実行中のグループを片付けてから exit 2 で終える。シグナルが先なら 130 / 143 のまま。判定の確定の後でも 2。ADR-0024
  - 先に書いたテスト（6 件）は、v0.5.41 の `src/` ですべて FAIL（exit 1）することを SHA 固定の worktree で確かめてから実装した。子が残らないことの実験: v0.5.41 は子孫 3 つが CLI より長く残り、直した後は 0。テスト 1,682 → 1,688 件（143 → 144 ファイル）
  - `package.json` 0.5.42（`package-lock.json` は 0.5.35 のまま）。独立レビュー（label `backlog-20`、範囲 `v0.5.41..v0.5.42`）を付ける
- v0.5.43（21）: **波 1 の 4 つ目（最後）の版**。3 commit。`src/` は変えていない。`tests/structure/` は `brand-guard.ts` だけ（人間の承認）。依存関係・`package-lock.json`・禁止文字の集合は変えていない
  - **バックログ 21 を解消**: widened-container を、文脈の型のあるすべての式で比べ、ブランドを深さの上限なしに、すべてのプロパティ（写像型のプロパティも）で探すようにした。既存テストの期待値の変更は承認済みの 3 件（bd01・bd02・bd04）だけ。残る限界は写像型の target（ADR-0019）
  - 先に書いたテスト（20 件）と期待値を変えた 3 件は、v0.5.42 の brand-guard で 149 件のうち 14 件 FAIL することを SHA 固定の worktree で確かめてから直した。テスト 1,688 → 1,708 件（144 → 145 ファイル）
  - `package.json` 0.5.43（`package-lock.json` は 0.5.35 のまま）。独立レビュー（label `backlog-21`、範囲 `v0.5.42..v0.5.43`）を付ける。**波 1 の実装はこれで終わり**（3 つの独立レビューの結果を待つ）
- v0.5.44（独立レビュー〈バックログ 20〉R1 への対応）: **B20-R1-001（High）に対応した**。4 commit。`src/` は `src/cli.ts` と新しい `src/node-options.ts`（`src/runner/execute.ts`・`src/cli-signals.ts` は変えていない）。依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えていない。原文と対応記録は `docs/reviews/backlog-20/`
  - `--unhandled-rejections=warn` では Node 自身が拒否の理由を生のまま出す（Node v24.13.1 で再現）。実測で `--abort-on-uncaught-exception` も同じ種類の漏れ（子も残る）と分かった。どちらの下でも起動を拒否する（人間の決定。名前が出たら拒否し、Node の解釈はまねしない。ADR-0024 決定 6）
  - 先に書いたテスト（CLI 20 件・規則 57 件）は、v0.5.43 の `src/` で FAIL することを SHA 固定の worktree で確かめてから実装した（CLI は 20 件中 14 件、規則はモジュールが無く読み込めない）。テスト 1,708 → 1,785 件（145 → 147 ファイル）
  - `package.json` 0.5.44（`package-lock.json` は 0.5.35 のまま）。R2（範囲 `v0.5.43..v0.5.44`、変えていないファイルを `--doc` で足す）を付ける
- v0.5.44 の後（docs だけの commit。版は 0.5.44 のまま、タグなし）: **波 1 の独立レビューの片付け**（人間の判断）
  - **バックログ 35・N1 の独立レビューは R1 で終えた**（指摘なし。High 0・Medium 0・Low 0。依頼文に先に書いた基準）。**バックログ 21 の独立レビューも R1 で終えた**（High 0・Medium 0・Low 1。Low の B21-R1-001 は下の項目 37 に記録して後で扱う）。原文と対応記録は `docs/reviews/backlog-35-n1/`・`docs/reviews/backlog-21/`
  - **バックログ 20 の独立レビューは R2 待ち**（R1 の High 1 件 B20-R1-001 に v0.5.44 で対応した。R2 の範囲は `v0.5.43..v0.5.44`。変えていない 6 ファイルを `--doc` で足したパケット）
  - レビュー原文の収録のファイル名は、この 3 つ（`backlog-20`・`backlog-35-n1`・`backlog-21`）から `review-r1.md`（以前のディレクトリは `independent-review-rN.md`）。35-n1 の原文は 21 行目の生の制御文字 U+0012 を 1 文字だけ `\u{12}` の表記にして収録した（注記に行番号と無改変の原文の SHA-256）
  - v0.5.44 の push の前の走査（`tmp/backlog-8A/push-scan.py`）は「password 等と値が同一行」を 5 件出した。`src/node-options.ts` の 21・31・34・52・55 行目の識別子 `token` / `tokens` による誤検出（値は無い）で、人間の承認の後、push の直前にもう一度走らせて同じ 5 件だけであることを確かめてから push した
  - CHANGELOG の v0.5.44 の見出しに commit 3dc5ce13dc6336fdbd505351e9cc99c0e1a5b5ae / tag object 84599acab87e898cea2bbce2ee73ae3aa22d9951 を記入した
- v0.5.44 の後・2 つ目（docs だけの commit。版は 0.5.44 のまま、タグなし）: **バックログ 20 の独立レビュー R2（範囲 `v0.5.43..v0.5.44`。変えていない 6 ファイルを `--doc` で足したパケット。問いは 3 つ）は、指摘なし（High 0・Medium 0・Low 0）。B20-R1-001 は解消**。依頼文に先に書いた基準（High・Medium が 0 なら終える）により、**バックログ 20 の独立レビューは R1〜R2 で終えた**。原文と対応記録は `docs/reviews/backlog-20/`（`review-r2.md`・`response-r2.md`）
  - R2 はコードを実行していない（静的な読解）。レビュアーの未確認範囲と、それぞれが当たる既知の限界（ADR-0024 の「追記（v0.5.44）」・決定 5、ADR-0023、項目 28）の対応は `response-r2.md`。原文は禁止文字・Security Scan に一致する行が無く、一字も変えずに収録した
  - **波 1 を終えた**（人間の判断）: v0.5.40（記録の整理）・v0.5.41（35・N1）・v0.5.42（20 の最小版）・v0.5.43（21）・v0.5.44（B20-R1-001）。独立レビューは 35-n1（R1）・21（R1）・20（R2）ですべて終わった。テストは 1,658 → 1,785 件（141 → 147 ファイル）。残したのは項目 37（B21-R1-001。未着手。後で）
- v0.6.0（波 3〈M2-2 の本体: 項目 15〉の最初の版）: **`aiqh review-import` v1（取り込みだけ）**。3 commit（`61d6039` 実装とテスト、`1124dde` ADR-0026・依頼文のひな形・文書、release）。人間の決定 D1〜D12（波 3 の SP1 の推奨どおり。直した状態の名前は `resolved`）
  - 入力の正本はレビューの md の中の `aiqh-findings` の JSON のブロック 1 つ。本文の `### <ID>` の見出し・`## 全体の結論` の件数の行（ちょうど 1 行）・その回の ID の形（本文と JSON の文字列のどこでも。字形を寄せて探す）と突き合わせ、食い違えば exit 2 で何も書かない。出力は `docs/reviews/<label>/findings-r<N>.json`（git 管理）にすべて `open`。`open` の件数は終了コードに反映しない（0 / 2）
  - SP1 で見つかった読み落としの危険な形をすべて fixture にした回帰テストと、SP1 で厳しく読めた 6 件を新しい形に書き直した正常系。先に書いたテスト 95 件は `d751427` で 95 件すべて FAIL（89 件は読み込めない、6 件は実行して FAIL）。テスト 1,785 → 1,880 件（147 → 149 ファイル）。既存テストの期待値は変えていない
  - `writeAtomic`（`src/report/write.ts`）は export し、失敗時に一時ファイルを消すようにした（verify のレポートにも効く。書き込み箇所の表は変わらない）
  - `package.json` 0.6.0（`package-lock.json` は 0.5.35 のまま）。独立レビュー（label `m2-2-review-import`、範囲 `v0.5.45..v0.6.0`、新しい依頼文のひな形で）を付け、返ってきた結果を v1 で取り込んでみる
- v0.6.0 の後（docs だけの commit。版は 0.6.0 のまま、タグなし）: **独立レビュー（m2-2-review-import）R1 は High 0・Medium 3・Low 0**（3 件とも VALID。人間の判断）。新しい依頼文のひな形で依頼した最初のレビューで、**出力の形は守られ、v0.6.0 の `aiqh review-import` でそのまま取り込めた**（exit 0、`High 0 / Medium 3 / Low 0; open 3`）。原文・対応記録・`findings-r1.json` は `docs/reviews/m2-2-review-import/`
  - M2-2-RI-R1-001: 名前付きの文字参照（`&hyphen;` など）で書いたその回の ID が見つからず、exit 0 で漏れうる → 許すのは amp・lt・gt・quot・apos だけで、ほかは exit 2。予防として ID を探す前に HTML のコメントとタグを取り除く（人間の決定）。M2-2-RI-R1-002: `writeAtomic` の一時ファイルの名前が予測でき、リンクを追う → ランダムな名前で排他的に作る。M2-2-RI-R1-003: 同じ原文の再取り込みが前の回などの確認を飛ばす → 同じ規則で検査する。**行き先: v0.6.1**
  - R1 の原文は説明の中で `&hyphen;` を使っているので、直した後の版では止まる（それが正しい）。取り込みは直す前の v0.6.0 で行い、`findings-r1.json` の 3 件に `verdict`・`action`・`destination: "v0.6.1"` を書いた（`status` は `open` のまま。D5: JSON が状態の正本）
  - CHANGELOG の v0.6.0 の見出しに commit c3f454fa7d9a3fc729a1d10f183b907284ed19a4 / tag object cbf5c4e51025a6d8f37127adb2d39b431562913c を記入した
  - v0.6.0 の報告の Low の気づき: (a) `formatDuration` の丸め（`3m60s`）は下の**項目 38**に記録した（直すのは後で）。(b) `--cwd` を付けたときに、相対パスのレビューのファイルが `--cwd` を基準に解決されることを README と ADR-0026 に書いていない → **v0.6.1 の文書で直す**
- 次: **波 2（M3 の前半: 自己 CI と手順書）は v0.5.45 で終えた**（自己 CI・手順書・CODEOWNERS。Branch Protection は、Public 化か有料のプランの判断〈波 4〉の後）。**波 3（M2-2 の本体: 項目 15）は v0.6.0 で `aiqh review-import` v1（取り込みだけ）を入れた**。その独立レビュー R1 は Medium 3（上の記録）。次は **v0.6.1（R1 の 3 件の修正。テストを先に）** → `findings-r1.json` の 3 件を `resolved` に → R2（同じ label・接頭辞、`previous` に R1 の 3 件の評価）→ v2（状態の検査 `--check`・前の回の状態の引き継ぎ・ループ未完了の表示）→ 再修正ループの手順書（M2-2 の「内容」の最後の項目）。そのあいだ、main への push のたびに `verify (ubuntu)` の緑を数え（M3 の「進み」の表。v0.5.45 の push が 1 回目）、続けて 5 回に届いたら、プロジェクトの `CLAUDE.md` のリリースの手順に「タグの前に、その commit の `verify (ubuntu)` が緑」を足す（届いたときの指示で）。Ubuntu の時間の見張り（`unit`・`unit-minpath` がチェックの上限の 80% を超えたら対策を決める）も続ける。Windows を対象にするかは後で決める。その後は rest2 の SP1 の計画（5 つの波。人間の判断）のとおり: **波 4**（M3 の後半: 配布・再利用ワークフロー。Public 化・配布の方式の人間の判断の後）→ **波 5**（M4: ADR から。R-010・履歴 DB・ダッシュボード・運用テンプレート・R-006 の候補 2・3）。**未着手のまま残す項目**: 37（B21-R1-001。後で）。**閉じたままの項目**（直すなら各項目の記録の案から）: 13・14・19 の (c)・22・27・29・30・36・R-013。18 の行き先は各波に入る（R-011 後半と Windows の測定は波 2、配布は波 4、R-010 は波 5）。終わったレビュー（以後は依頼しない）: バックログ 20 は R2、バックログ 35・N1 と 21 は R1、バックログ 28・5・34 は R2、バックログ 23 は R1、バックログ 16・2・19 は R4、m2-2-builtin は r6、バックログ 9・10 は r2

### M2-1 以降のバックログ（上から順に扱う）
順序の変更（v0.3.5、人間の判断）: `aiqh review-packet` を先にする。review-packet は今後のすべての独立レビューの手作業を減らす。R4-001 は見逃しではなく安全側の誤検出で、
対象リポジトリに 256 KiB を超える行が無いため後に回す。
順序の変更（v0.5.0、人間の判断）: 「使い方エラーを exit 2 に揃える」と「review-packet テストの分割・並列化」を M2-0-R4-001 の前へ。前者は ADR-0015 で
review-packet の終了コードの規則を決めた直後で、同じ文脈で小さく済む。後者は git を多数起動する回帰テストの増加と `unit-minpath`（全テストをもう一度実行）で
自己 verify の所要時間が伸びたため、review-import の前に抑える。
順序の変更（v0.5.1、人間の判断）: M2-2 独立レビュー R1 の残り（R1-002〜006）と、読めないものを「無い」とする残りの箇所を先頭へ（v0.5.5 の番号で 4〜9）。既存の項目の順序は変えていない。
順序の変更（v0.5.2、人間の判断）: ファイルへの出力の禁止文字を、読めないものを「無い」とする残りの箇所（v0.5.5 の番号で 9）の後へ（同 10）。既存の項目の順序は変えていない。
順序の変更（v0.5.3、人間の判断）: M2-2 独立レビュー R3 の Medium 3 件を足した。出力の安全に関わる R3-002・R3-001 を先頭、R3-003 を構造ガードの M2-2-R1-003 の直後へ
（3 件とも v0.5.4 で完了し、バックログから外した）。verify の check への `NO_COLOR` を「ファイルへの出力の禁止文字」の直後（v0.5.5 の番号で 11）へ。既存の項目の順序は変えていない。
順序の変更（v0.5.5、人間の判断）: M2-2 独立レビュー R4 の Medium 2 件を先頭へ（v0.5.5 の番号で 2・3）。3 には ADR-0017 の既知の限界（v0.5.4 の SP2 報告で次の docs の版で足すとしたもの）を含めた。既存の項目の順序は変えていない。
順序の変更（v0.5.5 のリリースの検証、人間の判断）: unit-minpath の不安定なテストを先頭（1）へ。R4 の 2 件は 2・3 になった。既存の項目の順序は変えていない。
順序の変更（v0.5.6、人間の判断）: 1（テストの不安定）を v0.5.6 で解消して外した（記録は上の M2-2 の節）。R4 の 2 件は 1・2 になった。v0.5.6 の調査で見つけた kill の EPERM の
経路を 3 に足した。4 以降の番号は変わらない。ADR-0017 と ARCHITECTURE の参照は v0.5.6 の番号に直した。CHANGELOG の過去の版の項と `docs/reviews/` の番号は当時の番号のまま。
順序の変更（v0.5.7、人間の判断）: M2-2 独立レビュー R5 の Medium 1 件（M2-2-R5-001）を先頭（1）へ。既存の項目は 1 つずつ下がった（v0.5.6 の 1〜19 → 2〜20）。
ADR-0017・ARCHITECTURE・上の M2-2 の節の参照は v0.5.7 の番号に直した。CHANGELOG の過去の版の項と `docs/reviews/` の番号は当時の番号のまま。
順序の変更（v0.5.8、人間の判断）: 1（M2-2-R5-001）を v0.5.8 で解消して外した（記録は上の M2-2 の節）。既存の項目は 1 つずつ上がった（v0.5.7 の 2〜20 → 1〜19）。
テストの後始末の残り（低）を 20 に足した。ADR-0017・ARCHITECTURE・上の M2-2 の節の参照は v0.5.8 の番号に直した。CHANGELOG の過去の版の項と `docs/reviews/` の番号は当時の番号のまま。
順序の変更（v0.5.10、人間の判断）: 1（M2-2-R4-001）を v0.5.10 で解消して外した（記録は上の M2-2 の節）。既存の項目は 1 つずつ上がった（v0.5.9 の 2〜20 → 1〜19）。
ファイルへの出力の禁止文字（9）に `maskDeep()` の 1 行を足した。ADR-0017・ARCHITECTURE の参照は v0.5.10 の番号に直した。CHANGELOG の過去の版の項、`docs/reviews/`、
上の M2-2 の節の各版の記録と、既存の順序の変更の注記は当時の番号のまま。
順序の変更（v0.5.11、人間の判断）: M2-2 独立レビュー R7 の Medium 3 件（M2-2-R7-001〜003）を 1 項目にまとめて先頭（1）へ。既存の項目は 1 つずつ下がった
（v0.5.10 の 1〜19 → 2〜20）。ADR-0017・ADR-0018・ARCHITECTURE の参照と、上の M2-2 の節の版の無い参照（「下のバックログ N」）は v0.5.11 の番号に合わせた
（v0.5.1・v0.5.2 の記録の「下のバックログ 4〜8／9／10」は付け替えの後の番号と一致するので、文字は変わらない。v0.5.10 の記録の「下のバックログ 9」は 10 に直した）。
CHANGELOG の過去の版の項、`docs/reviews/`、上の M2-2 の節の版つきの番号と行ったことの記録、既存の順序の変更の注記は当時の番号のまま。
順序の変更（v0.5.12、人間の判断）: 1（M2-2-R7-001〜003）を v0.5.12 で解消して外し、同じ位置 1 に「CLI の最上位の catch」の項目（v0.5.12 の SP1 で発見）を入れた。
ほかの項目の番号は変わらない（ADR-0017・ADR-0018・ARCHITECTURE と、上の M2-2 の節の版の無い参照も変わらない）。
順序の変更（v0.5.14、人間の判断）: 1（CLI の最上位の catch）を v0.5.14 で解消して外した（記録は上の M2-2 の節）。既存の項目は 1 つずつ上がった（v0.5.13 の 2〜20 → 1〜19）。
ADR-0017・ADR-0018・ARCHITECTURE の参照と、上の M2-2 の節の版の無い参照（「下のバックログ N」）は v0.5.14 の番号に合わせた（外した項目を指していた v0.5.12・v0.5.13 の
記録の 2 か所は、v0.5.14 の記録を指す形に直した）。CHANGELOG の過去の版の項、`docs/reviews/`、上の M2-2 の節の版つきの番号と行ったことの記録、既存の順序の変更の注記は当時の番号のまま。
順序の変更（v0.5.17、人間の判断）: 1（M2-2-R4-002）を v0.5.17 で解消した（記録は上の M2-2 の節）。番号は詰めず、1 の行を解消の記録として残す（番号は ADR・
ARCHITECTURE・`docs/reviews/` など多くの箇所から参照されているため）。v0.5.17 の SP1 で見つけた未処理の例外の表示を、20 として末尾に足した。2〜19 は変えていない。
1. ~~**M2-2-R4-002（Medium）と ADR-0017 の既知の限界: `src/` が読み込める組み込みモジュールを一覧（allowlist）で限定する**~~（v0.5.17 で解消。記録は上の M2-2 の節）
2. ~~**kill の EPERM で `spawnError` になり、早く確定する経路**~~（**v0.5.33 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.6 の調査で見つけた。読み取りだけで、未再現）。グループへの kill が EPERM で失敗すると、子への直接の
   kill（`src/runner/execute.ts` の `killTree` の `child.kill()`）に落ち、これも EPERM だと Node は `error` イベントを出す。その処理が `spawnError: "spawn failed: kill EPERM"`
   で結果を確定するので、グループが残っていても確定する（グループの中に signal を送れないプロセスがあり、先頭にも送れないときだけ）。fail closed は緩めない（中断なら
   SKIPPED、タイムアウトなら FAIL。verdict・終了コードは変わらない）。直すときの設計: 子への直接の kill を `process.kill(child.pid, signal)`（例外を try/catch で受ける）に
   変え、`error` イベントを spawn の失敗だけに限る（`groupAlive` が EPERM を「生きている」と数えるので、SIGKILL を送るまで確定しない）。直すときの注意: signal を送れない
   プロセスが出力の pipe を持ち続けると `close` が来ず確定しない。中断なら CLI の安全弁（猶予 + 3 秒）で終わるが、タイムアウトの経路には安全弁が無いので、合わせて設計する。
   回帰テストには別のユーザーのプロセスが要る
3. ~~**M2-2-R1-002（Medium）: オプション一覧に short 別名を含める**~~（**v0.5.28 で解消**。記録は上の M2-2 の節。以下は着手前の記述）。一覧と `Command` オブジェクトの比較は `attributeName`・位置引数・値の有無だけを見るため、
   `-o` → `-p` の変更や `-c` の削除を検出しない（v0.5.1 で確認）。一覧に long と short の対応を持たせ、`Command` の `short` / `long` / `flags` と比べる
4. ~~**M2-2-R1-003（Medium）: probe を 1 ツール = 1 変数に制限する**~~（**v0.5.28 で解消**。記録は上の M2-2 の節。以下は着手前の記述）。1 つの変数に python3 と unzip の probe を OR で混ぜると、その `skipIf` の中の python3 の起動を
   `guarded` と誤って判定する（v0.5.1 で確認。現在の `tests/` にこの形は無い）
5. ~~**M2-2-R1-006（Medium）: `test:minpath` をプロセスグループで起動し、グループごと止める**~~（**v0.5.38 で解消**: vitest を見張り役〈`scripts/minpath-watchdog.ts`〉が先頭の別のプロセスグループで動かし、スクリプトとの pipe が閉じたら〈runner のグループへの SIGKILL でスクリプトが消えたときも〉、見張り役が一時ディレクトリを消して自分のグループへ SIGKILL を送る〈下の「別の設計」。backlog-rest の SP1 の案 Q〉。N3〈SIGKILL で止まると `aiqh-minpath-*` が残る。backlog-rest の SP1 で見つけた〉も見張り役の後始末に含めた。テストが自分で別のグループにした子は止めない。記録は上の M2-2 の節と ARCHITECTURE。以下は着手前の記述）。単独で実行して SIGTERM を受けると vitest の直接の子プロセスだけを止め、
   テストが起動した子孫が残る（v0.5.1 で確認。自己 verify の中では runner がプロセスグループごと止める）。
   **v0.5.33 の SP1 の実測（この版では直さない）**: 単独でスクリプトの pid へ SIGTERM を送ると、v0.5.32 では vitest の worker 4 件が残った（最大 18.6 秒。40 秒の観察ではすべて消えた）。**この項目の直し方（vitest を別のプロセスグループで起動し、グループへ SIGKILL）は、
   その残りを 0 にするが、runner がチェックのグループごと SIGKILL すると vitest に届かず、かえって止まらない**（実測: 8 件が残り、vitest 本体と worker 1 件は 40 秒後も走り続けた。v0.5.32 は全部同じグループなので一緒に止まる）。SIGTERM を先に送って 5 秒後に SIGKILL する案は効かない
   （3 件が最大 22.8 秒残った）。直すなら、別の設計（シグナルを受けたスクリプトが記録した子孫へ送る、runner のグループに残したまま止める手段）が要る
6. ~~**M2-2-R1-005（Medium）: 最小 PATH の保証の強化**~~（**v0.5.37 で解消**: `test:minpath` が vitest に渡す環境を PATH・`NO_COLOR`・`FORCE_COLOR` だけにし〈実測で決めた〉、絶対パスでの起動は保証の外と決めた。`checkEnv()` は変えていない。記録は上の M2-2 の節。以下は着手前の記述）。子プロセスの環境変数を最小にする。絶対パスでの起動の扱い（防ぐか、保証の外として残すか）は着手時に決める。
   v0.5.1 では保証の記述を「PATH の名前解決で起動する、宣言していないコマンドを検出する」に狭めた（README・ARCHITECTURE）
7. ~~**M2-2-R1-004（Low）: 関数型へのアサーションの fixture を回帰テストに足す**~~（**v0.5.28 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（規則 `widened-renderer` が 3 形を検出することは v0.5.1 で確認。`hasBrand` は関数のシグネチャを辿らない）
8. ~~**読めないものを「無い」とする残りの箇所**~~（**バックログ 8 は v0.5.32 で完了**。内側の O・P はすべて下で打ち消し済み。以下は着手前の記述）（v0.5.1 の洗い出し。`docs/reviews/m2-2/response-r1.md`。書き込み・パスの判定に関わるものを先に）:
   ~~O2（`src/config/load.ts` の `entryExists()`: プロジェクトの中かの判定）、O7・O8（init が dangling symlink の先に設定ファイル・`.gitignore` を作る）~~
   （**O2・O7・O8 は v0.5.29 で解消**。記録は上の M2-2 の節。以下は着手前の記述）、
   ~~P3（review-packet の tag object の `rev-parse` の終了コードを見ない）、P11（`readVersion()` の `"0.0.0"`）~~（**P3・P11 は v0.5.30 で解消**。記録は上の M2-2 の節。以下は着手前の記述）、~~O3（git の失敗を「not a git repository」と記述）~~（**O3 は v0.5.31 で解消**）、
   ~~O4・O5・O9（記述だけの問題）~~（**O4・O5・O9 は v0.5.31 で解消**。O9 は記述だけでなく、通常ファイルの root が exit 0 で監査されていた）、~~O6（アダプタの検出）~~（**O6 は v0.5.32 で解消**）・~~P4（書き込みの失敗の後の一時ファイルの一覧）~~（**P4 は v0.5.30 で解消**）。
   **残り**（v0.5.29 の SP1 の分け方。ADR-0022 の規則で扱う）: ~~B（P3・P11・P4）~~（**v0.5.30 で解消**）、~~C（O3・O4・O5・O9）~~（**v0.5.31 で解消**）、~~D（O6）~~（**v0.5.32 で解消**）。順序は A → B → C → D（**バックログ 8 は v0.5.32 で完了**）
9. ~~**ファイルへの出力の禁止文字**~~（**v0.5.24 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.2 の出力の洗い出し。`docs/reviews/m2-2/response-r2.md`）: 端末への出力は v0.5.2 で出口を 1 つにしたが（ADR-0016）、
   ファイルへの出力は対象外。verify のレポート `latest.json`・`history/<ts>.json`（maskDeep → JSON.stringify。DEL・C1・U+2028 / U+2029・双方向制御・U+FEFF が
   生で残りうる）と `latest.md`（禁止文字すべて。check の出力の末尾の CR・ESC を含む）、init の `--write` が書く `aiqh.config.jsonc`（package.json の name。コメントの値は v0.5.4 で表記にした、ADR-0017）。
   表記にするか、どの形で残すか（レポートの JSON は機械が読む）を着手時に決める。
   あわせて、verify のレポートを写す `maskDeep()` を `safeJson()` と同じ形（JSON のデータの写し、ADR-0018）にする（v0.5.10 の SP1: `toJSON` を持つ関数を写し、
   `JSON.stringify()` がそれを呼ぶ。写しが普通の object なので、`__proto__` という名前のキーが消える。今のレポートの値とキーに利用者由来の関数・キーは入らない）
10. ~~**verify の check に `NO_COLOR` を渡す**~~（**v0.5.24 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.2 の SP2 報告 §12-3 の人間の判断）: v0.5.2 から check の出力の末尾の ESC（色付け）は `\u{1B}` の
   表記になる。check の出力は非 TTY なので多くのツールは色を付けないが、利用者の環境で `FORCE_COLOR` が設定されていると表記が並ぶ
11. ~~**verify / init / security-scan の使い方エラーを exit 2 に揃える**~~（**v0.5.27 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（commander の既定では未知のオプション等が exit 1 になり、verify の FAILED〈1〉と区別できない。
   review-packet は v0.4.0 で exit 2 にした）
12. ~~**review-packet テストの分割・並列化**~~（**v0.5.37 で記録で閉じた**: v0.5.36 の 10 回の実測で、`tests/review-packet.test.ts` は全テストの時間の 7.3%〈平均 32.2 秒、2 位。1 位は構造ガードのテストの 12.8%〉。vitest の worker〈7〉はほぼ埋まっているので、分割しても全体の短縮は最大約 4.6 秒〈推定〉。動機〈自己 verify の時間〉は項目 36 に再定義した。以下は着手前の記述）（v0.4.0 で `tests/review-packet.test.ts` が約 15 秒かかり、フルスイートが約 6 秒 → 15〜20 秒、自己 verify の unit が約 7 秒 → 17〜21 秒に増えた。
   git を多数起動するケースをファイルに分けて vitest の並列実行に載せる）
13. ~~**M2-0-R4-001「窓走査は正規表現の境界の文脈を保つ」**~~（**v0.5.37 で記録で閉じた**: ADR-0013 の追記〈v0.5.37〉、ARCHITECTURE・CONFIG_SPEC に記録。安全側の誤検出で、`security.allow` で解除でき、このリポジトリの最長の行〈19,817〉はしきい値〈262,144〉に遠い。backlog-rest の SP1 で、窓の先頭の偽のアンカーから `oversized-candidate` も出る形を新しく見つけた。直すなら案 A〈左の文脈の保持と右の確定の遅延。設計の落とし穴が 4 つ〉。案 (b) は検出力が下がるので採らない。以下は着手前の記述）（Medium、M2-0 から持ち越し。安全側の誤検出で、対象の 3 リポジトリには 256 KiB を超える行が無い）。
   長い行を窓に分けて独立した文字列として照合するため、窓の境界で左右の文脈が失われ、窓なしでは一致しない文字列を finding にする。
   左の文脈: 先頭の `\b`（anthropic / openai / aws / github / slack / google / gitlab / jwt / url-credential）と key-value の否定後読み。
   右の文脈: 末尾の `\b`（aws / github classic / google）、将来の先読み、key-value の値の判定（窓の末尾で値が切れる）。
   対応方針の候補（どちらにするかは着手時に決める）:
   - (a) 評価用の前文脈を 1 文字以上残し、文脈から始まる一致は finding にしない。窓の末尾に達した一致は、確定を次のチャンクまで遅らせる
   - (b) 256 KiB 超の行は走査せず「長すぎる行」として finding にし、人間が確認して `security.allow` で許可する（窓走査自体をやめる単純化）
   あわせて、性質テストを「窓なし ⊆ 窓あり」（見逃し防止）だけでなく「窓ありの secret finding ⊆ 窓なし」（誤検出防止）の双方向にする。
   修正時に必要なテストは `docs/reviews/m2-0/response-r4.md` に列挙した
   （**v0.5.40 で注記**: 上の「最長の行〈19,817〉」は、いまの値ではない。rest2 の SP1〈v0.5.39 の後、commit d9e56a9〉の実測では、最長の行は `README.md` の 30 行目〈「現在の状態」の行〉で、JS の文字数 11,184〈UTF-8 で 21,418 バイト〉。スキャナの上限 262,144 は JS の文字数で数える。しきい値に遠いことは変わらない）
14. ~~**既知の制限**~~（**v0.5.37 で記録で閉じた**: ADR-0013 の追記〈v0.5.37〉に、範囲を正確に記録した〈`\b` の位置から 64 文字以内に scheme の先頭が取れれば検出する。英数字だけの 65 文字以上などは検出しない〉。上限を付ける理由は、上限の無いパターンが超線形の時間になること〈項目 35〉。以下は着手前の記述）: scanner は scheme が 64 文字を超える url-credential を検出しない（masker は redact する。M2-0-R3-002、ADR-0013）
15. M2-2 `aiqh review-import`、再修正ループ、出力パーサ、verify レポートへの oversized-candidate / `security.allow` 警告の構造化、
   key-value 誤検出の継続記録（下の「内容」）（**v0.5.37 の注記**: これはマイルストーン M2-2 の計画そのもので、バックログの掃除の対象にしない。下の「内容」に載っているのは review-import・再修正ループ・出力パーサ。oversized-candidate / `security.allow` 警告の構造化と key-value 誤検出の継続記録の出典は `docs/reports/M2-0_COMPLETION.md` の 81 行目で、「内容」には無い）
16. ~~**SIGKILL 経路でもプロセスグループの消滅を有界時間確認する（または保証内容を文書で正確に書き直す）**~~（**v0.5.33 で解消**。記録は上の M2-2 の節。以下は着手前の記述）。ARCHITECTURE §10 の「SIGTERM → 最大 5 秒 → SIGKILL → 消滅確認の後に終了」は、
   SIGTERM 経路では満たす（`src/runner/execute.ts` の `tryFinish` はグループが消えるまで確定しない）が、SIGKILL 経路はコード上保証されていない:
   SIGKILL 送信後は `sigkillSent` により消滅を確かめずに確定し（`execute.ts:129`、`execute.ts:139-142`）、CLI の `terminateActiveChildren` は待たれない（`src/cli.ts:42` の `void`）。
   実測では `close` がパイプを握る子孫の終了を待つため消えていたが、stdio を手放した子孫には効かない。ARCHITECTURE は今回（v0.3.5）書き換えていない
   関連する観測（v0.5.6 の SP2、失敗ではない）: r4 の B が 393 回中 1 回、23 秒かかった（テストが子を SIGKILL した後の `close` の時点でグループがまだ残っていると
   判定され、確定が猶予の終わりの SIGKILL のタイマーまで延びたと推定。`docs/reviews/m2-2/response-r5.md`。同じ記録の R5-002 の表に、この項目で合わせる文言〈§10 の表、
   `src/runner/execute.ts`・`src/cli.ts` のコメント〉も書いた）
17. ~~**review-packet でシンボリックリンク（mode 120000）を kind `symlink` として表示する**~~（**v0.5.37 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（M2-1 R1 対応時の判断事項 #2 でバックログへ）。現在はリンクの blob
   （リンク先のパス文字列）を通常のテキストとして扱い、変更一覧の kind は `text`、全文・差分にリンク先のパスが載る。`symlink` として一覧に記録し、全文は載せない形にする
18. 従来の行き先のまま: R-010（M4）、R-011 後半（M3）、R-013（並列化時）、Windows での挙動確認（M3）、配布（M3）（**v0.5.37 の注記**: 計画のまま。Windows での挙動確認は M3 の節に項目が無かったので、M3 の「内容」に足した〈項目 30 を含む〉。R-013 は、出力の末尾の保持と `truncated` は実装済み〈`src/runner/execute.ts` の `OutputBuffer`〉で、残りは総バイト数の記録とリングバッファ化）
19. ~~**テストの後始末の残り（低）**~~（**v0.5.37 で (c) を記録で閉じた**: テストの中の signal 0 の確認で、製品の経路ではない。誤る向きはテストの失敗側。(a)(b) は v0.5.33 で解消。以下は着手前の記述）（v0.5.8 の SP1 の洗い出し。`docs/reviews/m2-2/response-r5.md`）: どれも製品の不具合か pid の再利用のときだけ起きる。
   ~~(a) 孫までタイムアウトで止めるテスト（`execute.test.ts`・`regression-r1-runner.test.ts`・`regression-r2-runner.test.ts` の各 1 件）は、製品が孫を止め損なったときだけ、
   孫が自分の寿命（30 秒）まで残る。(b) CLI をすぐ await するテスト（`cli.test.ts`・`cli-init-scan.test.ts`）は、CLI が終わらないときだけ、テストのタイムアウトの後も
   CLI が残る~~（**(a)(b) は v0.5.33 で解消**。記録は上の M2-2 の節。以下は着手前の記述。(a) は `regression-r2-cli-signal.test.ts` の孫（8 秒）にも同じ形があり、一緒に直した）。
   (c) signal 0 の probe（`process.kill(pid, 0)`、5 か所）は、pid が再利用されていると「生きている」と誤る（signal は届かない。誤る向きはテストの失敗）。**(c) は v0.5.33 でも直さない**: pid の 1 周は約 2 分（全テストの 64 秒の間に pid が約 53,300 進む＝毎秒約 830）で、
   probe は孫の死の数百 ms 後なので再利用は起きない。誤る向きはテストの失敗側で、利益が小さい。直すなら、unix socket への接続で生存を見る案が動く（SP1 の試作。5 か所のうち 4 か所で、`regression-r3-cli.test.ts` は pid ファイルの読みの回帰〈M2-1〉が対象なので変えない）
   （**v0.5.40 で注記**: (c) の「5 か所」は記録の時点の数。同じ形は後で増え、いまは 7 ファイルの 9 か所〈`tests/` で `process.kill(<pid か -pgid>, 0)` を呼ぶ行を grep で数えた。fixture の文字列・コメント・`scripts/` は数えない〉。増えたのは `regression-backlog16-confirm-termination.test.ts` の 3 か所〈v0.5.33〉と `regression-backlog5-minpath-watchdog.test.ts` の 1 か所〈v0.5.38〉。「まだ居る」を期待する使い方も 2 つある〈backlog16 の EPERM の模擬の 1 か所と、backlog5 の `gone()` を別のグループの子に使う 1 つの呼び出し〉。そこでは、番号が再利用されていると誤って PASS する向きになる〈対象はテストの間に居るはずのプロセスで、終わった後に確かめる形ではない〉。閉じたままにする判断は変わらない）
20. ~~**コールバックの中の未処理の例外が、Node の既定の表示で出口を通らずに標準エラーへ出る**~~（**v0.5.42 で最小版を入れて解消**: `src/cli.ts` が処理されなかった例外・拒否を受け、1 行を出口から出し、新しい check を起動せず、実行中のグループを片付けて exit 2 で終える。シグナルが先なら 130 / 143 のまま。項目 29 とは別に扱った〈人間の判断〉。ADR-0024。以下の v0.5.37 の記録と着手前の記述は書き換えていない）（**v0.5.44 で注記**: 独立レビュー R1 で B20-R1-001〈High〉。`--unhandled-rejections=warn` では Node 自身が拒否の理由を生のまま出す。実測で `--abort-on-uncaught-exception` も同じ種類の漏れ〈子も残る〉と分かり、どちらの下でも起動を拒否する形で直した〈ADR-0024 決定 6〉。**R2 待ち**）（**v0.5.44 の後に注記: 独立レビューを終えた**。R1〈High 1: B20-R1-001〉→ v0.5.44 → R2〈指摘なし。High 0・Medium 0・Low 0。B20-R1-001 は解消〉。原文と対応記録は `docs/reviews/backlog-20/`）（**v0.5.37 で記録で閉じた**: ADR-0019 の既知の限界のまま。`src/` のコールバックは投げないように書かれていて、既知の発生源は無い。直すなら項目 29 と一緒に、`cli.ts` の最上位で、安全弁と判定の確定の段階との順序を設計する。以下は着手前の記述）（v0.5.17 の SP1 で見つけた。重要度は記載なし）。タイマーなどのコールバックの
   中で投げられた例外は、`src/output.ts` の出口を通らず、Node の既定の表示で生のメッセージとソースの行が標準エラーに出て exit 1 になる（v0.5.17 の SP1 で、写しで実測）。
   v0.5.14 で直したのは CLI の最上位の catch（`parseAsync` の catch）だけで、`src/` に `process.on("uncaughtException")` などの処理は無い。モジュールや `process` の
   メンバーではなく Node の実行時の既定の動きなので、バックログ 1 の範囲の外とした（ADR-0019 の既知の限界）。この版では直さない
21. ~~**brand-guard の広げ（widened-container）の抜け**~~（**v0.5.43 で解消**: widened-container は、文脈の型のあるすべての式で比べ、ブランドを深さの上限なしに、すべてのプロパティ〈写像型のプロパティも〉で探す。限界を「検出しない」と固定していたテスト 3 件〈bd01・bd02・bd04〉の期待値を「検出する」に変えた〈人間の承認〉。残る限界は写像型の target〈ADR-0019〉。22 は変えていない。以下の v0.5.37 の記録と着手前の記述は書き換えていない）（**v0.5.37 で記録で閉じた**: 直す場所は `tests/structure/brand-guard.ts`〈45 行目の深さ、169-171 行目の親の 4 種〉で、`tests/structure/` を変えない制約〈backlog-rest〉のため保留。抜けは下の記述より広い: 親が 4 種〈型注釈つきの変数宣言・`=` の右辺・呼び出しの引数・`return` 文〉のどれでもない位置〈式本体のアロー関数の戻り値、object のプロパティ、配列の要素など〉と、5 段より深い入れ子。ADR-0019 の既知の限界を合わせた。以下は着手前の記述）（v0.5.20 の SP1 の 2 巡目で見つけた。重要度は記載なし。意図的な設計が要る形で、`src/` は使わない）。`Checked` / `Md` を持つ container を、
   **式本体のアロー関数の戻り値**（`(c: { v: Checked }): { v: string } => c`）や、**5 段より深い入れ子**でブランドの無い型へ広げる形を検出しない（`return` 文で広げる形は検出する）。深さの上限を上げるだけでは
   足りない（別の原因の形が残る）。ADR-0019 の既知の限界。この版では直さない
22. ~~**process-guard が `skipIf` の条件の向きを読まない**~~（**v0.5.37 で記録で閉じた**: 直す場所は `tests/structure/process-guard.ts`〈62-75 行目、165 行目〉で、`tests/structure/` を変えない制約のため保留。今の tests/ にこの形は無い〈probe を条件にした `skipIf` は `tests/zip-interop.test.ts` の 2 か所で、どちらも `!` 付き〉。ADR-0014 の既知の限界に理由を足した。以下は着手前の記述）（v0.5.28 の SP1 で見つけた。重要度は記載なし）。`skipIf(hasPython)`（python3 があると飛ばす）の中の python3 の起動も `guarded` と
   判定する（条件に probe の変数が現れればよく、`!` や `skipIf` / `runIf` の向きを見ない）。現在の `tests/` にこの形は無い。特性テスト `f21_inverted_skipif`
   （`tests/regression-m2-2-r3-006-external-commands.test.ts`）が現状を固定している。直すなら条件の向き（`skipIf(!has)` と `runIf(has)` だけを許可）を読む。ADR-0014 の既知の限界。この版では直さない
23. ~~**有効な symlink への `--force` 上書き・追記が、プロジェクトの外の既存ファイルに書く**~~（**v0.5.37 で解消**: root の外を指す symlink は拒否。`--write-scripts` も〈N1〉。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.29 の SP1 で見つけた。重要度は記載なし。バックログ 8 の O7・O8〈dangling symlink に限る〉の範囲外）。
   `aiqh init --write --force` は、`aiqh.config.jsonc` がプロジェクトの外の既存ファイルへの symlink なら、そのファイルを上書きする（実測: 3 B → 2,218 B）。`--write-gitignore` は、`.gitignore` が外の既存ファイルへの symlink なら、
   そのファイルに追記する（実測: 14 → 25 B）。`--force` なしの `--write` は already exists で拒否する。直すなら、書込先が symlink のとき（すべて、または根の外を指すものだけ）の扱いを決める
   （dotfile の管理などで共有ファイルへの symlink にしている既存の使い方を壊しうる）。ADR-0022 の既知の限界。この版では直さない
24. ~~**`security-scan --cwd <存在しないディレクトリ>` の文言が、cwd の ENOENT を git のせいに見せる**~~（**v0.5.37 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.31 の SP1 で見つけた。重要度は記載なし。バックログ 8 の O9 と同じ形で、root の分類が無い）。
   `aiqh security-scan --cwd <存在しない>` は `not a git repository (or git failed): <root> (spawnSync git ENOENT)` で exit 2（`src/security/scan.ts` の 166 行付近。ENOENT は git ではなく cwd のもの）。
   親が権限 000・通常ファイルの場合は `config file could not be read: … (EACCES …)` で正確（実測）。直すなら、init の root（O9）と同じく、root を ENOENT・辿れない・ディレクトリでない、に分けて早い段階で言う。ADR-0022 の既知の限界。この版では直さない
25. ~~**`rev-parse HEAD`・ブランチの個別の失敗が `(no commit)`・`(detached)` と表示される**~~（**v0.5.37 で解消**: stderr の判定は要らなかった〈終了コードで区別〉。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.31 の SP1 で見つけた。重要度は記載なし。バックログ 8 の O3 の残り）。
   verify の `git:` の行と報告で、`git rev-parse HEAD` の失敗が `commit` null → `(no commit)`、ブランチを得る 2 つの呼び出しの失敗が `branch` null → `(detached)` になる（shim で実測）。
   コミット 0 件のリポジトリでは本当に HEAD が無いので、区別するには stderr の判定が要る。直すなら、O3 の分類（ADR-0022 決定 8）を `HEAD`・ブランチにも広げ、`dirty` の `unknown`（R-009）と同じ形で `unknown` と表示する。ADR-0022 の既知の限界。この版では直さない
26. ~~**`package.json` が JSON として正しいが形が違うとき**~~（**v0.5.37 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.32 の SP1 で見つけた。重要度は記載なし。バックログ 8 の O6 の範囲外）。`null` と `scripts` が数値は、生の TypeError で exit 2（`aiqh: unexpected error: Cannot read properties of null (reading 'dependencies')`、
   `Cannot use 'in' operator to search for 'verify' in 5`。`VERIFY ERROR (internal error)`）。配列と文字列（`[]`・`"text"`）は、**空の `package.json` として Node プロジェクト扱い**（scripts なし。黙って受け入れる。実測）。`name` が数値なら project 名が `5`。
   直すなら、`package.json` がオブジェクトで、`scripts` などもオブジェクトであることを調べ、違うときは O6 と同じ形で調べられない入口として止める（`ExaminationError`）。併記: `src/adapters/types.ts` の `readText` の注記（「missing のとき null」）は、v0.5.31 までは実際の動作（読めないときも null）と合っていなかった。
   v0.5.32 で ENOENT 以外は例外になったので、その点は解消した。ADR-0022 の既知の限界。この版では直さない
27. ~~**`exists()` が入口の種類を見ない**~~（**v0.5.37 で記述を正して閉じた**: 実際の CLI では、`tests` が通常ファイルなら、Python のアダプタが `tests/e2e` を調べた時点で ENOTDIR になり、v0.5.32 の決定〈ADR-0022 決定 9〉で `init` が exit 2 で止まる〈`tests/regression-backlog8d-o6-context-throw.test.ts` が固定〉。「tests/ directory present と書く」は、アダプタを単体で呼んだときだけ起きる。残るのは `tests` が dangling symlink のとき〈推定〉。ADR-0022 の既知の限界を訂正した。以下は着手前の記述）（v0.5.32 の SP1 で見つけた。重要度は記載なし）。`ctx.exists("tests")` は lstat で入口があるかだけを見るので、`tests` が通常ファイルでも Python のアダプタが「tests/ directory present」と書き、`pytest -q tests/` を推奨する（実測）。
   直すなら、ディレクトリを探す入口（`tests`・`tests/e2e`）には、ディレクトリかどうかを確かめる別の判定を使う。ADR-0022 の既知の限界。この版では直さない
28. ~~**最初のシグナルの前に、グループの消滅を確認しない**~~（**v0.5.38 で解消**: leader の `exit` の後、`close` か消滅の記録まで 25 ms ごとに signal 0 で確かめる〈下の「最初のシグナルの直前に確かめる」案は、再利用された番号も「ある」と答えるので効かず、採らなかった〉。窓は消滅の後の 25 ms に縮み、閉じてはいない〈v0.5.39 で注記: 25 ms は確認のタイマーの設定値で上限ではない。窓は消滅から次の確認が実際に走るまで。B28-R1-001〉。既存の対照テストの期待値を 1 件変えた〈人間の承認〉。記録は上の M2-2 の節と ADR-0023 の「範囲（v0.5.38 で追記）」。以下は着手前の記述）（v0.5.34 の SP1 で見つけた。独立レビュー R1 の B16-R1-001 の周辺。重要度は記載なし）。leader が先に終わり、`close` が来ない（別のグループの孫が pipe を握る）とき、`executeCommand` はタイムアウトまで signal 0 でグループを調べず、
   最初の SIGTERM を番号へ確認なしで送る。タイムアウトまでに番号が別のグループへ再利用されていれば、無関係なグループへ SIGTERM が届く（`process.kill` の差し替えで、v0.5.32・v0.5.33・v0.5.34 とも同じ性質を確認。実際の再利用は未再現）。v0.5.34 は最初の ESRCH の後の送信だけを止めた。
   直すなら、最初のシグナルの直前に signal 0 で確かめる（最初のシグナルの意味が変わるので、別のテストと再レビューが要る）。ADR-0023 の既知の限界。この版では直さない
29. ~~**安全弁をフェーズごとの期限にする案**~~（**v0.5.37 で記録で閉じた**: ADR-0023 の決定 7 と README の中断の説明〈v0.5.36〉に記載済み。発火しても終了コードは 130 / 143 で、fail closed は保たれる〈失うのはレポートだけ〉。直すなら項目 20 と一緒に設計する〈案 Y2 は、安全弁の意味を「シグナルから固定の時間」から「段階ごとの上限」に変える〉。以下は着手前の記述）（v0.5.34 の B16-R1-002 の周辺。重要度は記載なし）。今の安全弁は、シグナル受信から固定（猶予 + 3 秒）で、レポートの書き込みの完了を待たない最後の強制終了。極端なイベントループの停止やレポート書き込みの遅れで、レポートの完了前に発火しうる（実測: 1.5 秒の停止で 8,018 ms、レポートなし、exit 130）。
   直すなら、runner の確認が終わった後にレポート用の期限を数え直す（案 Y2）。安全弁の意味が変わり、`cli.ts` と verify の流れを変える（項目 20 と衝突しうる）。確認の起点を予定時刻にする案（Y1）は、1.5 秒の停止には効いたが、3 秒以上の停止とレポートの書き込みの上限は残る。ADR-0023 の代替案。この版では直さない
30. ~~**Windows では v0.5.33 から、`close` が未着でも、消滅の確認の起点が最初のポーリング（25 ms）になる**~~（**v0.5.37 で記録で閉じた**: 下の M3 の「Windows での挙動確認」へ移した。ADR-0023 の既知の限界に記録。以下は着手前の記述）（v0.5.34 の SP1 で、コードを読んで気づいた。重要度は記載なし。Windows は対象外）。`groupAlive` は Windows で常に false なので、`poll()` が最初に「消えた」と見て `goneAt` を設定し、`close` が来なければ `confirmMs`（2 秒）の後に確定する。
   v0.5.32 は SIGKILL のタイマーまで待った。v0.5.34 の修正は、この動きを変えない（対照テストで SIGKILL が子の pid へ届くことを固定した）。Windows を対象にするときに見直す（M3 の「Windows での挙動確認」）。この版では直さない
31. ~~**`terminateActiveChildren` が、後ろの target を猶予の間調べない**~~（**v0.5.36 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.35 の自レビュー〈実装者が書いた。独立ではない〉の S-1。重要度は Low〜Medium。`response-r2.md`）。`anyAlive`（`execute.ts:60`）が `some` で短絡し、先の target が生きている間、後ろの target は 1 度も調べられない。猶予の後の SIGKILL は全 target へ送られるので、実際には消えた後ろの target の番号へ SIGKILL が届きうる（番号の再利用が要る。実測: 後ろの target に signal 0 が 0 回、SIGKILL が 1 回）。
   CLI は同時に 1 つの子しか動かさないので到達しない（ライブラリとして並行に使う場合だけ）。ADR-0023 の既知の限界は、隙を「最後の確認から 25 ms」と書くので、窓が猶予の全期間である点を直す必要がある（v0.5.35 の範囲に追記済み）。
   直すなら、全 target を調べる（`targets.map(...).some(Boolean)`。コード 1 行とテスト 1 件）。この版では直さない（指示の範囲外。推奨は次の修正で採る）
32. ~~**文書の細部**~~（**v0.5.36 で解消**。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.35 の自レビューの S-2・S-5・S-6。Low）。(a) README の中断の説明（`README.md:215-218`）が、安全弁が先に発火しうること（レポートが無い。終了コードは 130 / 143）に触れない。(b) `response-r1.md` の補足が、実際の PGID の再利用を「決定的に再現した」と書く（差し替えで、再利用された番号が応答する状況を作っただけ。実際の再利用は再現していない）。
   (c) 「v0.5.32 から同じ性質」などの実測が、git 管理外の `tmp/` に依存し、リポジトリ・パケットから検証できない（文書に「手元の実測」と明記する。実験のスクリプトをリポジトリへ入れるのは大きい）。この版では直さない
33. ~~**テストの細部**~~（**v0.5.36 で解消**。S-4 は 2 件とも期待値を変えずに余裕を広げた。記録は上の M2-2 の節。以下は着手前の記述）（v0.5.35 の自レビューの S-3・S-4。Low）。(a) `tests/regression-backlog16-r1-pgid-reuse.test.ts` の「最初のシグナルが ESRCH」のテスト（115-117 行目）が `AbortController` を作るが、`executeCommand` の `signal` に渡さない（後始末の `abort` が効かない。1 行）。
   (b) 時間の余裕が小さい（待ちの境界のテストは期待 1.9 秒・境界 2.6 秒。「最初のシグナルが ESRCH」のテストは `timeoutMs: 1200` を起動から数え、差し替えは `waitReady` の後）。負荷で前提が崩れる方向で、誤って PASS にはならない。この版では直さない
34. ~~**`src/runner/execute.ts` の `GroupState` の説明の 1 文**~~（**v0.5.38 で解消**。以下は着手前の記述）（v0.5.36 の停止ポイント 2 で実装者が気づいた。Low・コメントだけ）。「It is set on the group-less paths too」は、pgid が無いとき〈`child.pid` が無いとき〉は直接送信の前のガードでもともと何も送らないので、「on Windows too」が正確。動きは変わらない。次に `src/` を変えるときに直す（docs の同じ記述は、R4 の後に訂正の注記を入れた）
35. ~~**masker の url-credential が、長い入力に対して超線形の時間になる**~~（**v0.5.41 で解消**: masker は正規表現を実行せず、「://」を手がかりにした線形の走査で同じ一致・同じ置換を求める〈rest2 の SP1 の案 C2。scheme の長さは無制限のまま、scanner は変えない〉。記録は上の M2-2 の節と ADR-0013 の追記〈v0.5.41〉。以下は着手前の記述）（backlog-rest の SP1 で見つけた。Low）。`src/security/patterns.ts` の masker の url-credential のパターン（149 行目）は scheme の長さに上限が無く、点やハイフンでつながった長い連続で、処理時間が超線形に伸びる（実測: 「a.」の繰り返しで 1 万文字 187 ms、2 万文字 1,258 ms、4 万文字 4,315 ms。上限の 64 KiB〈`TAIL_BYTES`〉で 2.3〜3.5 秒。16 進の連続は 0 ms）。
   マスクに渡る文字列は 64 KiB に切り詰められるので、止まらなくなることは無い。直すなら masker の scheme にも上限を付ける（scanner は `{0,63}`。項目 14 と同じ設計で、redact の範囲が変わる）
36. ~~**テストの作業量（git の起動）を減らす**~~（**v0.5.40 で記録で閉じた**: rest2 の SP1 で計測した。全テストの git の起動は 5,906 回〈141 ファイルのうち 68 ファイル〉で、うち fixture の準備〈init・add・commit など〉は 25.1%、製品自身の問い合わせ〈review-packet の rev-parse・cat-file・diff など〉は 74.9%。git 1 回は約 11 ms。テストの共通の fixture で減らせるのは、多くて 1 回の全テストで 2〜3 秒〈推定〉。自己 verify の二重実行〈unit と unit-minpath〉は、最小 PATH の保証を弱めないために、いまのまま〈人間の判断〉。以下は着手前の記述）（v0.5.37 で項目 12 を再定義した。開発速度だけの項目）。v0.5.36 の実測で、全テストの時間の 51.5% は review-packet を走らせる 29 ファイル。テストの準備（`baseRepo()` など）の共有や、unit と unit-minpath の二重実行の扱い（`unit-minpath` の保証との関係を設計する）を検討する
37. **brand-guard の `hasBrand()` の打ち切りを固定するテストが無い**（バックログ 21 の独立レビュー R1 の B21-R1-001。Low。v0.5.44 の後に記録）。`tests/structure/brand-guard.ts` の `hasBrand()` は、1 回の問いで 50,000 型を超えて歩くと、呼び出し側の fail closed の答え（source 側 `cut=true`・target 側 `cut=false`。どちらも報告する向き）を返し、打ち切った結果を memo に保存しない。この 2 つを直接固定する回帰テストが無い（実装の欠陥の指摘ではない）。修正案: 上限に届く大きな再帰型か幅の広い型のグラフを fixture にし、上限に届いたときの両方の向きと、同じ checker での再問い合わせ（打ち切りが memo に残っていないこと）を確かめる。性能も別に測る。変えるのは `tests/`（`tests/structure/` は変えずに済む見込み〈推定〉）。行き先: 後で（波 1 の後のどこか。人間の判断）
38. **verify の時間の表示で、秒の丸めが分に繰り上がらない**（v0.6.0 の CI のログで見つけた。Low。v0.6.0 の後に記録）。`src/report/markdown.ts` の `formatDuration` は、分を `Math.floor`、残りの秒を `Math.round` で求めるので、239.6 秒が `3m60s` になる（`sec < 60` の枝も、59.96 秒が `60.0s` になる）。表示だけで、判定・終了コード・レポートの数値（ミリ秒）には影響しない。直すなら、ミリ秒を先に丸めてから分と秒に分ける（テストを先に）。行き先: 後で

M2-1 の教訓（R3）:
- **ファイルシステムの同一性は、文字列の正規化ではなくファイルシステム自身（`dev`+`ino`）に問い合わせる**（R3-001: APFS の名前の同一視は `toLowerCase()` と一致しない）
- **正規表現やテキスト解析による構造テスト**（`as Checked` の grep、help の解析、外部コマンドの正規表現）**は迂回できる**。構造の保証には AST や実体（commander の `Command` オブジェクト）を使う（R3-004〜006）

### 内容（M2-1 以降。M2-0 の後に行う）
- 出力パーサの実装（M1 は `OutputParser` の型定義のみ）: vitest / pytest / eslint / npm audit の件数・失敗名をレポートに構造化
- `aiqh review-packet`（v0.4.0、ADR-0014）: commit 範囲 `<from>..<to>` から、人間の依頼文・前回レビュー（任意）、commit メッセージ、変更ファイル一覧、
  ファイルごとの差分、`<to>` 時点の**変更ファイルの全文**、`--doc` の文書、`<to>` の verify 結果（`latest.json` が `<to>` かつ clean のときのみ）で
  Markdown パケットを生成する。**実装者の自己評価・手書きの節は載せない**。不正な UTF-8・生文字・秘密の形を入力ごとと組み立て後の 2 段で検査し、
  検出があれば何も書かない（exit 1）。パケットだけを含む ZIP を出せる。終了コード 0 / 1 / 2
- `aiqh review-import`: レビューAI の Markdown 指摘を構造化（severity / file / kind / status）して保存。同一 id での再取り込みは status を引き継ぐ（**v0.6.0 で注記**: v1〈取り込みだけ〉を入れた。入力はレビューの中の `aiqh-findings` の JSON のブロック 1 つで、本文の見出し・件数の行・その回の ID と食い違えば exit 2 で何も書かない。出力は `docs/reviews/<label>/findings-r<N>.json`〈git 管理〉で、すべて `open`。同じ原文の再取り込みは何もしない〈exit 0〉、違う原文は exit 2。状態の引き継ぎ・検査は v2。ADR-0026）
- 再修正 → 再 verify → 再パケットのループ手順を docs に明文化

### 完了条件
- [x] M2-0 R1〜R3 の手作業パケットと同等以上の内容（ただし手書きの節〈Architecture Decisions / Verification Results の手書き表 / Known Risks〉を除く）が `aiqh review-packet` で自動生成される（M2-1、v0.4.4 で完了。R1〜R4 のパケットをこのコマンドで生成）
- [ ] 指摘 JSON に未対応（open）が残る間はループ未完了と表示される（v0.6.0 で注記: v1 は取り込みの時に `open` の件数を表示する。終了コードには反映しない〈非目標〉。ループ未完了の表示は v2。ADR-0026）
- [ ] 本体の自己 verify PASS

---

## M3 — GitHub Actions 再利用ワークフローと Branch Protection

### 内容
- `.github/workflows/verify.yml`（`workflow_call`）: 対象リポジトリはタグ固定で参照するだけ
- 入力: Node / Python バージョン、作業ディレクトリ、設定パス。出力: verify 結果を workflow artifact としてアップロード、Job Summary に latest.md を表示
- 本体リポジトリ自身の CI（自己 verify を PR ごとに実行）
- Branch Protection の手順書（必須ステータスチェック、レビュー必須、force push 禁止）
- **Windows での挙動確認**（v0.5.37 で足した。バックログの項目 18・30 の行き先。Windows は M0 から対象外）: 対象にするときは、少なくとも次を確かめる。
  (a) 消滅の確認の起点（項目 30: `groupAlive` は Windows で常に false なので、`close` が未着でも最初のポーリングで `goneAt` が入る。既定値〈猶予 5 秒・確認 2 秒〉では猶予より先に確定し、SIGKILL のタイマーは解除される）、
  (b) Windows の SIGTERM は強制終了で、子孫はグループが無いので止めていない（どの版も同じ）、(c) そのとき `errorSummary` の「process group terminated」は正確ではない、(d) `leaderGone`（v0.5.36）は Windows の分岐で効く
  **v0.5.45 の前の測定**（手動の run 38243300245、`measure (windows)`、`windows-2025`〈イメージ windows-2025-vs2026、20260925.250.1〉、Node 24.13.1・npm 11.8.0。`continue-on-error` で実行は赤にしない）: ジョブ 11 分 14 秒、`npm ci` は成功、**verify は 8 チェックのうち 3 つが FAIL**（`unit`: チェックの上限 600 秒でタイムアウト。`unit-minpath`: `test-minimal-path: git was not found on PATH`。`package`: `spawnSync npm` が `ENOENT`）。見えた失敗の種類は 4 つ: (1) 時間〈`unit` が 10 分で終わらない〉、(2) シグナル・プロセスグループ〈`tests/regression-backlog16-r2-direct-signal.test.ts` の 6 件すべて〉、(3) コマンドの解決〈`scripts/test-minimal-path.ts` の `which()` が `git.exe` を見ない、`scripts/package-smoke.ts` がシェルなしで `npm` を起動し `npm.cmd` を見つけない。コードを読んだ推定〉、(4) ファイル名の制御文字〈backlog 8 O9 の ESC を含むディレクトリ名。推定〉。ほかに、git の `LF will be replaced by CRLF` の警告が繰り返し出た（失敗との関係は分からない）。`unit` は打ち切られ、端末には末尾 20 行しか出ず、レポートは runner の外に出していないので、**失敗の全数は分からない**（上は見えた範囲）。上の (c) のとおり、タイムアウトの文言「process group terminated」は Windows では正確でない。**Windows を対象にするかは後で決める**（人間の決定。記録だけ）
- 独立レビュー R1 からの持ち越し:
  - **R-011（後半）**: Ubuntu の CI ジョブを最低 1 本追加し、正常終了・非ゼロ終了・タイムアウト・
    SIGTERM 無視の孫プロセス・大量出力を Linux で検証する（M0 は macOS のみで検証）
  - **R-006（対策候補 1）**: `aiqh.config.jsonc` の変更を CODEOWNERS / 必須レビューで保護する手順を
    Branch Protection 手順書に含める

### 進み（波 2。M3 の前半）
- **その 1**（2026-10-12。v0.5.45 の予定。push の前で停止）: `.github/workflows/ci.yml`（`verify (ubuntu)`: `ubuntu-24.04`・Node 24.13.1・`npm ci` → `npm run verify`、最初は必須にしない。`measure (windows)`: `windows-2025`、main への push と手動だけ、`continue-on-error`。権限は `contents: read` だけ、アクションは commit SHA で固定、キャッシュと成果物のアップロードなし）、`.github/CODEOWNERS`、手順書 `docs/ops/ci-and-branch-protection.md`、ADR-0025
  - 前提の調査（GET だけ）: Actions は有効（`allowed_actions: all`、既定の `GITHUB_TOKEN` は `read`）。Branch Protection と rulesets は HTTP 403（`Upgrade to GitHub Pro or make this repository public to enable this feature.`）で、非公開のままでは使えない（手順書に、使えるようになったときの手順を書いた）。gh のトークンのスコープは `gist`・`read:org`・`repo` で `workflow` が無い。git の push は `osxkeychain` の資格情報を使う（スコープは未確認）
  - npm の保護設定（`min-release-age=7`・`allow-git=none`・`ignore-scripts=true`）は利用者の `~/.npmrc` にあり、runner では効かない。いまの lockfile では差は小さい見込み [推定]（その 2 で、`ignore-scripts` だけを CI に写した）
  - 上の「内容」との対応: 本体リポジトリ自身の CI → `ci.yml`（結果は最初の push の後）。Branch Protection の手順書 → `docs/ops/ci-and-branch-protection.md`。Windows での挙動確認 → `measure (windows)`（測定だけ）。R-011（後半）→ `verify (ubuntu)` が兼ねる（正常終了・非ゼロ終了・タイムアウト・大量出力は `tests/execute.test.ts`、SIGTERM 無視の孫は `tests/regression-r1-runner.test.ts` の既存のテストで、それが Linux で走る。結果は最初の push の後）。R-006（候補 1）→ CODEOWNERS と手順書の §4（いまは強制されない）
- **その 2**（2026-10-12。v0.5.45 の予定。人間の決定: push の認証はこのリポジトリだけ gh の資格情報〈`.git/config` の credential helper を空の値と `!gh auth git-credential` に。`workflow` のスコープを足した〉、Windows の測定は手動の実行だけ、npm の保護設定は CI でも手元と同じに）: `ci.yml` の最上位の `env:` に `npm_config_ignore_scripts: "true"`（Node 24.13.1 に同梱の npm 11.8.0 で、`ignore-scripts` は読まれ、`min-release-age`・`allow-git` は `Unknown env config` になった〈11.8.0 が知らない設定〉ので、その 2 つは書かない。npm は上げない〈人間の決定〉）。`measure (windows)` は `workflow_dispatch` のときだけ（分数の節約）。ADR-0025・手順書を合わせて直した。push の後、最初の CI（Ubuntu）と 1 回の手動の実行（Windows）を読む
- **その 3 = v0.5.45**（2026-10-12。その 1〜その 2 の 3 commit〈`50946eb`・`0c916cd`・`f3cfeb7`〉を版にした。`src/`・`tests/` は変えていない）
  - **最初の CI の結果**（`f3cfeb7`）: push の run 38241926903 は success（`verify (ubuntu)` 11 分 45 秒。`npm ci` 3 秒、`npm run verify` 11 分 27 秒）。手動の run 38243300245 でも `verify (ubuntu)` は success（11 分 50 秒、verify 11 分 32 秒）。runner のイメージ `ubuntu-24.04`（20261004.327.1、Ubuntu 24.04.5）、Node 24.13.1・npm 11.8.0

    | チェック | CI（push の run） | CI（手動の run） | 手元（`f3cfeb7` の worktree） |
    |---|---|---|---|
    | lint | 6.3s | 6.0s | 2.2s |
    | typecheck | 6.1s | 6.8s | 1.7s |
    | unit | 5m38s | 5m40s | 1m10s |
    | unit-minpath | 5m30s | 5m33s | 1m29s |
    | build | 2.3s | 2.5s | 1.0s |
    | package | 2.8s | 3.0s | 2.1s |
    | security | 635ms | 663ms | 399ms |
    | dependency | 399ms | 519ms | 518ms |
    | 計 | 11m27s | 11m32s | 2m47s |

  - **時間の見張り**（人間の決定: いまは変えない）: `unit`・`unit-minpath` は、チェックの上限 600 秒（`aiqh.config.jsonc` の `timeoutSec`）の約 56% を使っている（338〜340 秒・330〜333 秒）。**どちらかが上限の 80%（480 秒）を超えたら、対策〈上限を上げる設定の変更〈人間の承認〉か、テストの作業量を減らす〈項目 36 の記録〉〉を決める**。ジョブの上限 30 分に対しては 約 12 分
  - **必須にする条件**（人間の決定）: `verify (ubuntu)` が **main への push で続けて 5 回緑**。手動の実行（`workflow_dispatch`）と pull request は数えない。v0.5.45 の release commit の push を 1 回目として数え始め、赤が 1 回でもあれば 0 から数え直す。5 回に届いたら、プロジェクトの `CLAUDE.md` のリリースの手順に「タグの前に、その commit の `verify (ubuntu)` が緑」を足す（届いたときの指示で行う）。数え方の表（記録の commit などで足していく）:

    | 回 | commit（main への push） | run | `verify (ubuntu)` |
    |---|---|---|---|
    | 1 | v0.5.45 の release commit `35ee9e7` | 38315238218 | success（ジョブ 11 分 32 秒。`unit` 5m32s・`unit-minpath` 5m26s） |
    | 2 | v0.5.45 の後の記録の commit `d751427`（docs だけ） | 38319589345 | success（ジョブ 11 分 42 秒。`unit` 5m37s・`unit-minpath` 5m28s） |
    | 3 | v0.6.0 の release commit `c3f454f`（`61d6039`・`1124dde` と同じ push。実行は push の先頭の commit に 1 回） | 38337593923 | success（ジョブ 8 分 37 秒。`unit` 4m02s・`unit-minpath` 3m60s〈表示のまま。約 240 秒。下の項目 38〉） |
    | 4 | v0.6.0 の後の記録の commit（R1 の取り込みと記録。docs だけ） | 次の記録の commit で記入 | 次の記録の commit で記入 |

    （v0.5.45 の前の 2 回〈run 38241926903〈push、`f3cfeb7`〉と 38243300245〈手動〉〉は、数え始める前なので数えない）
  - **Ubuntu でスキップされうるテストの確かめ**（静的。`tests/` の `skipIf`・`runIf`・早い `return` などを grep。直していない）: 飛ばす条件は 2 種類だけ。(1) root で動いているか（`isRoot`・`runsAsRoot`。13 ファイル・35 か所。mode 000 などの権限のテスト）: runner のジョブは GitHub の runner のユーザーのホームの下の作業ディレクトリで動いていて（CI のログ）、root ではない見込み → **飛ばない**〈推定。uid はログに出ていない〉。(2) `tests/zip-interop.test.ts` の `unzip`・`python3`（`import zipfile`）の有無（2 か所）: `actions/runner-images` の Ubuntu 24.04 の一覧〈Image Version 20261004.327.1。実行のイメージと同じ〉に `unzip 6.0-28ubuntu4.1` と `Python 3.12.3` がある → `unit` では**飛ばない**。`unit-minpath` では PATH が node と git だけなので、手元と同じく**飛ぶ**（設計どおり）。早い `return` など、ほかの形の飛ばし方は無かった
- v0.5.45 の後（docs だけの commit。版は 0.5.45 のまま、タグなし）: CHANGELOG の v0.5.45 の見出しに commit 35ee9e7983617e872c5311e61de0e0d5172f31ae / tag object 9e36d6045f6dc73505f52e72ceb67edb018ca603 を記入し、数え方の表に 1 回目（run 38315238218、success）を書き込んだ。この commit の push が 2 回目（結果は次の記録の commit で記入）。v0.5.45 の release commit は、push の前の走査が ROADMAP の 1 行の runner のパスを「ホームのパス」として出したので、言葉に言い換えて作り直した（push の前。作り直す前の SHA は d1730595037b397bb71a468dd1a0e9e11bbc8a41）

### 完了条件
- [ ] 本体リポジトリの PR で verify が自動実行され、FAILED でマージ不可になる
- [ ] 対象リポジトリ向けの最小 workflow 例（10 行程度）が docs にある
- [ ] タグ運用（semver、`v0.x.y`）が docs にある

---

## M4 — 履歴 DB・ローカルダッシュボード・運用テンプレート

### 内容
- `aiqh history`: 複数プロジェクトの `history/*.json` を取り込み、PASS/FAIL 推移、所要時間、失敗しやすいチェックを集計。保存先はユーザーローカル 1 箇所
- ローカルダッシュボード（静的 HTML。外部送信なし）
- ロールバック手順・監視項目の設計テンプレート（docs）
- 独立レビュー R1 からの持ち越し:
  - **R-010**（並行実行時の `latest.*` 不整合）: 履歴 DB の導入に合わせ、各実行を `runs/<runId>/` に書き、
    `latest` は単一のポインタ / manifest を atomic に更新する構造にする
  - **R-006（対策候補 2・3）**: 設定ハッシュの固定（履歴 DB に記録し、変更を検出する）と、
    品質ポリシー変更時の別承認フローを設計する

### 完了条件
- [ ] 2 つ以上のプロジェクトの履歴が 1 画面で見える
- [ ] 集計が JSON でも取得できる
- [ ] 本体の自己 verify PASS

---

## 将来（マイルストーン未割当）

- **R-013**（出力バッファ 10MiB / ストリーム）: 並列実行を導入するときに、末尾のみ保持する
  streaming ring buffer（総バイト数と truncated フラグを記録）へ変更する。M0 は逐次実行のため据え置き

## 非目標（全マイルストーン共通）

- レビューAI の判断を自動で合否に反映すること（人間が介在する）
- 外部サービスへの verify 結果の自動送信
- 対象リポジトリへの lint / test ツールの無断導入
