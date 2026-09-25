# ROADMAP — ai-quality-harness

最終更新: 2026-09-25

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

### M2-2 — 先頭: M2-1 R3 の持ち越し 5 件 — **v0.5.0**（2026-09-25）／独立レビュー m2-2-r1 の反映 — **v0.5.1**／m2-2-r2 の反映 — **v0.5.2**／m2-2-r3 の記録と区切り — **v0.5.3**／m2-2-r3 の 3 件の修正 — **v0.5.4**／m2-2-r4 の記録と区切り — **v0.5.5**（2026-09-25）
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
- テスト件数: 466（v0.4.4）→ 536（v0.5.0、91 ファイル）→ 572（v0.5.1、94 ファイル）→ 593（v0.5.2、95 ファイル）→ 593（v0.5.3、docs だけ）→ 618（v0.5.4、98 ファイル）→ 618（v0.5.5、docs だけ）
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
  R4 の 2 件と構造ガードの既知の限界をバックログの先頭（1・2）へ
- 次: バックログから選ぶ（未定）

### M2-1 以降のバックログ（上から順に扱う）
順序の変更（v0.3.5、人間の判断）: `aiqh review-packet` を先にする。review-packet は今後のすべての独立レビューの手作業を減らす。R4-001 は見逃しではなく安全側の誤検出で、
対象リポジトリに 256 KiB を超える行が無いため後に回す。
順序の変更（v0.5.0、人間の判断）: 「使い方エラーを exit 2 に揃える」と「review-packet テストの分割・並列化」を M2-0-R4-001 の前へ。前者は ADR-0015 で
review-packet の終了コードの規則を決めた直後で、同じ文脈で小さく済む。後者は git を多数起動する回帰テストの増加と `unit-minpath`（全テストをもう一度実行）で
自己 verify の所要時間が伸びたため、review-import の前に抑える。
順序の変更（v0.5.1、人間の判断）: M2-2 独立レビュー R1 の残り（R1-002〜006）と、読めないものを「無い」とする残りの箇所を先頭へ（v0.5.5 の番号で 3〜8）。既存の項目の順序は変えていない。
順序の変更（v0.5.2、人間の判断）: ファイルへの出力の禁止文字を、読めないものを「無い」とする残りの箇所（v0.5.5 の番号で 8）の後へ（同 9）。既存の項目の順序は変えていない。
順序の変更（v0.5.3、人間の判断）: M2-2 独立レビュー R3 の Medium 3 件を足した。出力の安全に関わる R3-002・R3-001 を先頭、R3-003 を構造ガードの M2-2-R1-003 の直後へ
（3 件とも v0.5.4 で完了し、バックログから外した）。verify の check への `NO_COLOR` を「ファイルへの出力の禁止文字」の直後（v0.5.5 の番号で 10）へ。既存の項目の順序は変えていない。
順序の変更（v0.5.5、人間の判断）: M2-2 独立レビュー R4 の Medium 2 件を先頭（1・2）へ。2 には ADR-0017 の既知の限界（v0.5.4 の SP2 報告で次の docs の版で足すとしたもの）を含めた。既存の項目の順序は変えていない。
1. **M2-2-R4-001（Medium）: `safeJson()` の入力を JSON のデータに限る**。関数・`symbol`・`bigint`・`toJSON` を持つ値・プロトタイプが普通でない object
   （`Object.prototype` / null 以外）は、fail closed で拒否する（v0.5.5 で確認: 自分の `toJSON` に関数の値があると `JSON.stringify()` がそれを呼び、戻り値は表記・mask を
   通らずに出る。今の各コマンドの `--json` は JSON のデータだけ。`docs/reviews/m2-2/response-r4.md`、ADR-0017 の既知の限界）
2. **M2-2-R4-002（Medium）と ADR-0017 の既知の限界: `src/` が読み込める組み込みモジュールを一覧（allowlist）で限定する**。import・`require`・`process.getBuiltinModule`
   と、同じ種類（`process.dlopen`、`process.report.writeReport("stdout")` など。v0.5.5 の洗い出し、`docs/reviews/m2-2/response-r4.md`）を同じ規則で検査する。process の
   書き出す関数（`emitWarning` など）の禁止も含む。既知の限界の `worker_threads`、`node:repl`・`node:test`、`tty.WriteStream(fd)`、`util.debuglog`、実行時に組み立てた
   パスへの fs の書き込みも、この項目で扱う。今の `src/` は 6 つ（child_process・crypto・fs・path・string_decoder・zlib）だけを読み込み、どの方法も使わない
3. **M2-2-R1-002（Medium）: オプション一覧に short 別名を含める**。一覧と `Command` オブジェクトの比較は `attributeName`・位置引数・値の有無だけを見るため、
   `-o` → `-p` の変更や `-c` の削除を検出しない（v0.5.1 で確認）。一覧に long と short の対応を持たせ、`Command` の `short` / `long` / `flags` と比べる
4. **M2-2-R1-003（Medium）: probe を 1 ツール = 1 変数に制限する**。1 つの変数に python3 と unzip の probe を OR で混ぜると、その `skipIf` の中の python3 の起動を
   `guarded` と誤って判定する（v0.5.1 で確認。現在の `tests/` にこの形は無い）
5. **M2-2-R1-006（Medium）: `test:minpath` をプロセスグループで起動し、グループごと止める**。単独で実行して SIGTERM を受けると vitest の直接の子プロセスだけを止め、
   テストが起動した子孫が残る（v0.5.1 で確認。自己 verify の中では runner がプロセスグループごと止める）
6. **M2-2-R1-005（Medium）: 最小 PATH の保証の強化**。子プロセスの環境変数を最小にする。絶対パスでの起動の扱い（防ぐか、保証の外として残すか）は着手時に決める。
   v0.5.1 では保証の記述を「PATH の名前解決で起動する、宣言していないコマンドを検出する」に狭めた（README・ARCHITECTURE）
7. **M2-2-R1-004（Low）: 関数型へのアサーションの fixture を回帰テストに足す**（規則 `widened-renderer` が 3 形を検出することは v0.5.1 で確認。`hasBrand` は関数のシグネチャを辿らない）
8. **読めないものを「無い」とする残りの箇所**（v0.5.1 の洗い出し。`docs/reviews/m2-2/response-r1.md`。書き込み・パスの判定に関わるものを先に）:
   O2（`src/config/load.ts` の `entryExists()`: プロジェクトの中かの判定）、O7・O8（init が dangling symlink の先に設定ファイル・`.gitignore` を作る）、
   P3（review-packet の tag object の `rev-parse` の終了コードを見ない）、P11（`readVersion()` の `"0.0.0"`）、O3（git の失敗を「not a git repository」と記述）、
   O4・O5・O9（記述だけの問題）、O6（アダプタの検出）・P4（書き込みの失敗の後の一時ファイルの一覧）
9. **ファイルへの出力の禁止文字**（v0.5.2 の出力の洗い出し。`docs/reviews/m2-2/response-r2.md`）: 端末への出力は v0.5.2 で出口を 1 つにしたが（ADR-0016）、
   ファイルへの出力は対象外。verify のレポート `latest.json`・`history/<ts>.json`（maskDeep → JSON.stringify。DEL・C1・U+2028 / U+2029・双方向制御・U+FEFF が
   生で残りうる）と `latest.md`（禁止文字すべて。check の出力の末尾の CR・ESC を含む）、init の `--write` が書く `aiqh.config.jsonc`（package.json の name。コメントの値は v0.5.4 で表記にした、ADR-0017）。
   表記にするか、どの形で残すか（レポートの JSON は機械が読む）を着手時に決める
10. **verify の check に `NO_COLOR` を渡す**（v0.5.2 の SP2 報告 §12-3 の人間の判断）: v0.5.2 から check の出力の末尾の ESC（色付け）は `\u{1B}` の
   表記になる。check の出力は非 TTY なので多くのツールは色を付けないが、利用者の環境で `FORCE_COLOR` が設定されていると表記が並ぶ
11. **verify / init / security-scan の使い方エラーを exit 2 に揃える**（commander の既定では未知のオプション等が exit 1 になり、verify の FAILED〈1〉と区別できない。
   review-packet は v0.4.0 で exit 2 にした）
12. **review-packet テストの分割・並列化**（v0.4.0 で `tests/review-packet.test.ts` が約 15 秒かかり、フルスイートが約 6 秒 → 15〜20 秒、自己 verify の unit が約 7 秒 → 17〜21 秒に増えた。
   git を多数起動するケースをファイルに分けて vitest の並列実行に載せる）
13. **M2-0-R4-001「窓走査は正規表現の境界の文脈を保つ」**（Medium、M2-0 から持ち越し。安全側の誤検出で、対象の 3 リポジトリには 256 KiB を超える行が無い）。
   長い行を窓に分けて独立した文字列として照合するため、窓の境界で左右の文脈が失われ、窓なしでは一致しない文字列を finding にする。
   左の文脈: 先頭の `\b`（anthropic / openai / aws / github / slack / google / gitlab / jwt / url-credential）と key-value の否定後読み。
   右の文脈: 末尾の `\b`（aws / github classic / google）、将来の先読み、key-value の値の判定（窓の末尾で値が切れる）。
   対応方針の候補（どちらにするかは着手時に決める）:
   - (a) 評価用の前文脈を 1 文字以上残し、文脈から始まる一致は finding にしない。窓の末尾に達した一致は、確定を次のチャンクまで遅らせる
   - (b) 256 KiB 超の行は走査せず「長すぎる行」として finding にし、人間が確認して `security.allow` で許可する（窓走査自体をやめる単純化）
   あわせて、性質テストを「窓なし ⊆ 窓あり」（見逃し防止）だけでなく「窓ありの secret finding ⊆ 窓なし」（誤検出防止）の双方向にする。
   修正時に必要なテストは `docs/reviews/m2-0/response-r4.md` に列挙した
14. **既知の制限**: scanner は scheme が 64 文字を超える url-credential を検出しない（masker は redact する。M2-0-R3-002、ADR-0013）
15. M2-2 `aiqh review-import`、再修正ループ、出力パーサ、verify レポートへの oversized-candidate / `security.allow` 警告の構造化、
   key-value 誤検出の継続記録（下の「内容」）
16. **SIGKILL 経路でもプロセスグループの消滅を有界時間確認する（または保証内容を文書で正確に書き直す）**。ARCHITECTURE §10 の「SIGTERM → 最大 5 秒 → SIGKILL → 消滅確認の後に終了」は、
   SIGTERM 経路では満たす（`src/runner/execute.ts` の `tryFinish` はグループが消えるまで確定しない）が、SIGKILL 経路はコード上保証されていない:
   SIGKILL 送信後は `sigkillSent` により消滅を確かめずに確定し（`execute.ts:129`、`execute.ts:139-142`）、CLI の `terminateActiveChildren` は待たれない（`src/cli.ts:42` の `void`）。
   実測では `close` がパイプを握る子孫の終了を待つため消えていたが、stdio を手放した子孫には効かない。ARCHITECTURE は今回（v0.3.5）書き換えていない
17. **review-packet でシンボリックリンク（mode 120000）を kind `symlink` として表示する**（M2-1 R1 対応時の判断事項 #2 でバックログへ）。現在はリンクの blob
   （リンク先のパス文字列）を通常のテキストとして扱い、変更一覧の kind は `text`、全文・差分にリンク先のパスが載る。`symlink` として一覧に記録し、全文は載せない形にする
18. 従来の行き先のまま: R-010（M4）、R-011 後半（M3）、R-013（並列化時）、Windows での挙動確認（M3）、配布（M3）

M2-1 の教訓（R3）:
- **ファイルシステムの同一性は、文字列の正規化ではなくファイルシステム自身（`dev`+`ino`）に問い合わせる**（R3-001: APFS の名前の同一視は `toLowerCase()` と一致しない）
- **正規表現やテキスト解析による構造テスト**（`as Checked` の grep、help の解析、外部コマンドの正規表現）**は迂回できる**。構造の保証には AST や実体（commander の `Command` オブジェクト）を使う（R3-004〜006）

### 内容（M2-1 以降。M2-0 の後に行う）
- 出力パーサの実装（M1 は `OutputParser` の型定義のみ）: vitest / pytest / eslint / npm audit の件数・失敗名をレポートに構造化
- `aiqh review-packet`（v0.4.0、ADR-0014）: commit 範囲 `<from>..<to>` から、人間の依頼文・前回レビュー（任意）、commit メッセージ、変更ファイル一覧、
  ファイルごとの差分、`<to>` 時点の**変更ファイルの全文**、`--doc` の文書、`<to>` の verify 結果（`latest.json` が `<to>` かつ clean のときのみ）で
  Markdown パケットを生成する。**実装者の自己評価・手書きの節は載せない**。不正な UTF-8・生文字・秘密の形を入力ごとと組み立て後の 2 段で検査し、
  検出があれば何も書かない（exit 1）。パケットだけを含む ZIP を出せる。終了コード 0 / 1 / 2
- `aiqh review-import`: レビューAI の Markdown 指摘を構造化（severity / file / kind / status）して保存。同一 id での再取り込みは status を引き継ぐ
- 再修正 → 再 verify → 再パケットのループ手順を docs に明文化

### 完了条件
- [x] M2-0 R1〜R3 の手作業パケットと同等以上の内容（ただし手書きの節〈Architecture Decisions / Verification Results の手書き表 / Known Risks〉を除く）が `aiqh review-packet` で自動生成される（M2-1、v0.4.4 で完了。R1〜R4 のパケットをこのコマンドで生成）
- [ ] 指摘 JSON に未対応（open）が残る間はループ未完了と表示される
- [ ] 本体の自己 verify PASS

---

## M3 — GitHub Actions 再利用ワークフローと Branch Protection

### 内容
- `.github/workflows/verify.yml`（`workflow_call`）: 対象リポジトリはタグ固定で参照するだけ
- 入力: Node / Python バージョン、作業ディレクトリ、設定パス。出力: verify 結果を workflow artifact としてアップロード、Job Summary に latest.md を表示
- 本体リポジトリ自身の CI（自己 verify を PR ごとに実行）
- Branch Protection の手順書（必須ステータスチェック、レビュー必須、force push 禁止）
- 独立レビュー R1 からの持ち越し:
  - **R-011（後半）**: Ubuntu の CI ジョブを最低 1 本追加し、正常終了・非ゼロ終了・タイムアウト・
    SIGTERM 無視の孫プロセス・大量出力を Linux で検証する（M0 は macOS のみで検証）
  - **R-006（対策候補 1）**: `aiqh.config.jsonc` の変更を CODEOWNERS / 必須レビューで保護する手順を
    Branch Protection 手順書に含める

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
