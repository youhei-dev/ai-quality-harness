# Changelog

M0（verify の中核）の各タグと、対応した独立レビューのラウンド。詳細は `docs/reviews/m0/` と `docs/reports/`。

表記規約（R6-002）: 各タグの主表記は**タグが指す commit の SHA**（`git rev-list -n1 <tag>`、peeled）。注釈付きタグのオブジェクト SHA（`git rev-parse <tag>`）は
`/ tag object <SHA>` として併記する。

## v0.3.1 — M2-0 independent review R1 applied（commit / tag object の SHA はタグ付与後に `git rev-list -n1 v0.3.1` / `git rev-parse v0.3.1` で確認。最終報告に記載）

- 独立レビュー R1（`docs/reviews/m2-0/independent-review-r1.md`、High 1 / Medium 2）の 3 件をすべて反映（`docs/reviews/m2-0/response-r1.md`）
- M2-0-R1-001（High）: 窓設定の相互制約 `0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes` を `resolveSecurity()`（ConfigError）と `LineAssembler` の
  コンストラクタ（ScanError）で検証し、長行ループに進捗不変条件（ScanError）を追加。無効な組み合わせで走査が終わらなくなる問題の修正
- M2-0-R1-002: `security-scan` の text / JSON 出力を `maskSecrets` / `maskDeep` に通す。`allow[].reason` / `path` の改行を禁止（JSON Schema 更新）
- M2-0-R1-003: `--write-gitignore` を未追跡 `.gitignore` でも冪等に（追記せず `git add .gitignore` を案内。追跡済みの否定修復は維持）
- テスト 294 件（回帰 14 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.3.1

## v0.3.0 — commit 8e81d15 / tag object 3e54718 — M2-0 scanner maintenance

- M1 独立レビュー R3 の持ち越し 5 件をすべて修正: M1-R3-001（候補プレフィックスの持ち越し、`oversized-candidate` finding）、002（`--write-gitignore` が否定ルールを修復）、
  003（`artifacts/` 提案は実生成物 4 パスで判定）、004（追跡済み `.gitignore` だけを保護と数える）、005（PEM ブロック finding の重複統合）
- key-value 分類を走査対象に（`looksLikeSecretValue` で値が秘密らしいときだけ finding。masker は不変）
- `security` セクション: `allow`（path / category / line / 必須 reason / expires。抑制は必ず出力に残す、衛生 finding は抑制不可）、`envProbePaths`、`exampleEnvSuffixes`、
  `maxLineBytes` / `lineOverlapBytes` / `maxCarryBytes`。`aiqh security-scan --config <path>`。JSON Schema 更新。ADR-0012、ADR-0010 改訂
- テスト 280 件（回帰 28 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS（key-value 走査込みで検出 0 件）。`package.json` version 0.3.0

## v0.2.3 — commit 2da4c76 / tag object 474fc27 — M1 complete — completion record, R3 carried over to M2-0

- コード変更なし。独立レビュー R3（`docs/reviews/m1/independent-review-r3.md`、High 0 / Medium 4 / Low 1）を受領し、5 件すべてを VALID と判定したうえで
  **M2-0「スキャナ保守」へ持ち越し**（`docs/reviews/m1/response-r3.md`）。事前の基準「R3 で High が無ければ M1 完了」により **M1 の完了ベースラインは v0.2.2**
- `docs/reports/M1_COMPLETION.md` を新設、ROADMAP に M1 完了と M2-0 を記載、README を更新。`package.json` version 0.2.3。テスト 252 件・自己 verify 7 チェック PASS は v0.2.2 と同じ

## v0.2.2 — commit f958ac7 / tag object 9506eed — M1 independent review R2 applied

- 独立レビュー R2（`docs/reviews/m1/independent-review-r2.md`、High 1 / Medium 4）の 5 件をすべて反映（`docs/reviews/m1/response-r2.md`）。R1-005 / R1-009 の PARTIAL を解消
- M1-R2-001: 未追跡で ignore されていない `.env*` を中身を読まずに finding（`untracked-env`）にする
- M1-R2-002: `lstat` の失敗は ENOENT だけスキップ、他は exit 2（`classifyStatError`）
- M1-R2-003: venv の interpreter が実行可能なときだけ venv と認識（`PythonContext.python`）
- M1-R2-004: 1 行が 256 KiB を超えるファイルは窓走査（`LineAssembler`、重なり 4 KiB）でメモリを抑える
- M1-R2-005: `init` の `artifacts/` 提案を `git check-ignore` で判定。非 git は追加提案、書込は冪等
- テスト 252 件（回帰 21 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.2.2

## v0.2.1 — commit 630f2e3 / tag object df8f41c — M1 independent review R1 applied

- 独立レビュー R1（`docs/reviews/m1/independent-review-r1.md`、High 3 / Medium 6 / Low 1）の 10 件をすべて反映（`docs/reviews/m1/response-r1.md`）
- M1-R1-001: v0.2.0 が自己 verify（security）で FAIL する状態でタグ付けされていた。`patterns.ts` の説明コメント修正、docs の訂正、
  リリース手順の順序（commit → 各 commit の worktree 検証 → clean 確認 → push → タグ）を CLAUDE.md に固定。scanner は未追跡（非 ignore）ファイルも走査
- M1-R1-002 / 004: scanner を逐次読み（サイズ上限なし）にし、private-key を BEGIN → END の状態機械で検出（開始行–終了行、END 無しも検出）
- M1-R1-003: `init` が package.json のスクリプト本文を出力・複製しない。出力は全て mask
- M1-R1-005: `.gitignore` 判定を `git check-ignore --no-index` に委ね、否定ルールを考慮
- M1-R1-006: `init --write` は生成物を実行時パーサで検証してから書く（required 0 件を拒否）
- M1-R1-007: Node アダプタはローカル証拠（依存 / `node_modules/.bin`）を必須にし、直接実行は `npx --no-install`
- M1-R1-008: JSON Schema は構造検証用と明記し、`command` に `pattern` を追加。既知の差をテストで固定
- M1-R1-009: `venvBin` の実行権限確認、Python Playwright は pytest 必須
- M1-R1-010: `--write-gitignore` / `--write-scripts` の失敗を init 固有の exit 2 に
- テスト 231 件（回帰 34 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS（security PASS、未追跡込みで 0 件）。`package.json` version 0.2.1

## v0.2.0 — commit 680869d / tag object 2e2685f — M1 — **superseded / known-bad: self verify security FAIL**

- **既知の不具合**: 自己 verify の必須チェック `security` が FAIL する状態でタグ付けされた（`src/security/patterns.ts` の説明コメントが
  url-credential パターンに一致。タグ付与前の自己 verify は当該ファイルが未追跡で走査外だったため PASS していた）。**v0.2.1 以降を使う**。
  タグは削除・付け替えしない（監査性のため）

- チェックアダプタ（Node 7 / Python 7 / 内蔵 security 1）: 検出＋推奨のみ、実行経路は M0 の 1 本のまま（ADR-0011）
- `aiqh init`: 読み取り監査 → 監査表と `aiqh.config.jsonc` 案 → `--write`（既存は `--force` なしで拒否）/ `--write-gitignore` / `--write-scripts`。`aiqh` の PATH 解決元と version を表示、`$schema` は解決できる場合のみ
- `aiqh security-scan`（内蔵、ADR-0010）: git 管理下ファイルの秘密情報パターン・追跡 `.env` 系・`.gitignore` 欠落。値は出力しない。masker とパターン定義を共有し互換テストを追加（R-012 解消）
- 自己 verify が 7 チェック（security PASS）に。JSON Schema を同梱。配布は `npm link`（ADR-0009）
- 対象 2 リポジトリ（Node 系 / Python 系）へ `aiqh init --write` と `aiqh verify` を適用（結果は最終報告）
- テスト 197 件、10 回連続 PASS。`package.json` version 0.2.0

## v0.1.7 — M0 maintenance（commit / tag object の SHA はタグ付与後に `git rev-list -n1 v0.1.7` / `git rev-parse v0.1.7` で確認。最終報告と `docs/reports/M0_COMPLETION.md` §7 に記載）

- 最終独立レビュー（R7-001、Medium）を反映: `OutputBuffer` の UTF-8 境界揃えを、先頭チャンク 1 回の確認ではなく「先頭バイトが継続バイトである間、1 バイトずつ最大 3 回、チャンクをまたいで捨てる」に戻し、さらに切り詰め済み（`truncated`）の間は毎回揃える。R6-001 の共通ヘルパー化で入った退行と、その作業中に見つけた第 2 経路の修正。回帰テスト 5 件（固定チャンク境界 4 件、固定シード 500 回の網羅 1 件）
- テスト 148 件、10 回連続 PASS。**M1 は v0.1.7 を基準に始める。これ以降の M0 レビューは行わない**

## v0.1.6 — commit 8092f9f / tag object 10fd4d9 — M0 maintenance

- 独立レビュー R6（3 件）を反映: レポート用 64KiB 末尾切り出しの UTF-8 境界揃え（R6-001、共通ヘルパー `src/runner/utf8-trim.ts`）、CHANGELOG のタグ横 SHA を peeled commit SHA に統一（R6-002）、ハンドラ差し替え中の Known Risk の説明精度（R6-003）
- テスト 143 件、10 回連続 PASS。M1 は v0.1.6 を基準に始める。R7 は行わない

## v0.1.5 — commit 55e2e0f / tag object df678ca — M0 complete

- 独立レビュー R5（4 件）を反映: シグナルハンドラ差し替えの原子性（R5-001）、確定点の観測可能な意味論への表現変更（R5-002）、verdict の確定点と CLI 終了結果の分離（R5-003、案 A、`onFinalized` → `onVerdictFixed`）、出力末尾の UTF-8 境界揃え（R5-004）
- M0 完了の記録: `docs/reports/M0_COMPLETION.md`、ROADMAP、README。テスト 141 件、自己 verify 6 チェック

## v0.1.4 — commit 37a5b50 / tag object 4b7c943

- 独立レビュー R4（3 件）の追加修正: 確定点の yield を 1 周（poll フェーズを含む）に修正（`yieldFullIteration`）
- 検証中に発見した欠陥の修正: 出力バッファが上限より大きい単一チャンクを丸ごと捨てて空になる問題（バイト単位の切り詰めへ）
- テスト 139 件、10 回連続 PASS

## v0.1.3 — commit c238f0b / tag object 26806d0 — **superseded**

- 独立レビュー R4（3 件）を反映: 確定点（B 案）、中断チェックの事実保持（timedOut / outputTruncated）、未起動チェックの表示（SKIPPED のみ）
- **superseded — 確定点の yield が不十分（`setImmediate` 1 回。確定点直前のシグナルを 10 回中 4 回取りこぼす）。v0.1.4 以降を使用すること。** タグは履歴として残す

## v0.1.2 — commit 24ed514 / tag object 677d834

- 独立レビュー R3（3 件）を反映: `[REDACTED:` 接頭辞によるマスク回避の防止、SIGINT / SIGTERM でのパイプライン中断（AbortSignal、130 / 143、verdict ERROR）、配布 smoke test の bin 実体検証
- テスト 133 件

## v0.1.1 — commit 29e0f42 / tag object 99dad83

- 独立レビュー R1（13 件）と R2（5 件）を反映: マスク規則の拡張（接頭辞付きキー、引用符付き値、Authorization ヘッダ）、プロセスグループ kill のエスカレーション、symlink / dangling symlink の包含判定、exit code と文言の 1 対 1（PASSED / FAILED / ERROR）、git dirty の 3 値化、配布 smoke test（package チェック）
- テスト 118 件

## v0.1.0 — commit c80231e / tag object a1e6dba

- M0 初回: 設計書（ARCHITECTURE / ROADMAP / CONFIG_SPEC / ADR 0001-0008）、fail-closed な `aiqh verify`（JSONC 設定、順次実行、JSON / Markdown / history レポート、秘密情報マスク）、自己 verify（lint / typecheck / unit / build / dependency）
- テスト 72 件
