# M1 報告 — チェックアダプタ、`aiqh init`、Security Scan、2 リポジトリへの適用

- 日付: 2026-09-18（v0.2.0）、2026-09-19 訂正（v0.2.1、独立レビュー R1 反映）、2026-09-19 追記（v0.2.2、独立レビュー R2 反映）
- 基準: M0 最終版 v0.1.7（commit b49dddb）。M1 のタグは `v0.2.0`（commit 680869d / tag object 2e2685f）→ **superseded**。
  v0.2.1（commit 630f2e3 / tag object df8f41c）に R1 を反映。M1 の完了ベースラインは **`v0.2.2`**（R2 反映。commit SHA はタグ付与後に
  `git rev-list -n1 v0.2.2` で確認し CHANGELOG / 最終報告に記載）。人間の判断: R3 で High が無ければ M1 完了、Medium 以下は M2 のリストへ
- **訂正（M1-R1-001）**: v0.2.0 は自己 verify の必須チェック `security` が FAIL する状態でタグ付けされていた。本書の初版にあった
  「自己 verify PASSED（7 チェック）」「Security は NOT APPLICABLE → PASS」は、タグ付与前の作業ツリー（新規ファイル未追跡）での実測であり、
  commit 済み HEAD では成り立っていなかった。§2 と §5 を実測に合わせて訂正した
- 対象リポジトリの固有情報（パス・行番号・設定値・脆弱性の詳細）は本書に書かない。件数と分類のみ。詳細は Downloads に保存した最終報告

## 1. M1 で作ったもの

| 領域 | 内容 |
|---|---|
| アダプタ（`src/adapters/`） | `Adapter.detect(ctx)` が検出と推奨だけを返す。Node 7（eslint / tsc / vitest / jest / build / npm・pnpm・yarn audit / playwright）、Python 7（ruff / mypy / pyright / pytest / build 非該当 / pip-audit / playwright）、内蔵 1（security）。`RepoContext` は読み取り専用で `.env*` を読まない。`OutputParser` は型のみ（M2） |
| `aiqh init` | 監査表と `aiqh.config.jsonc` 案（コメント付き JSONC）を表示。`--write`（既存は `--force` なしで拒否）、`--write-gitignore`、`--write-scripts`（未定義キーのみ）、`--json`。`aiqh` の PATH 解決元と version を表示。`$schema` は対象から解決できる場合のみ。検出 0 件なら exit 2 |
| `aiqh security-scan` | git 管理下ファイルの秘密情報パターン、追跡 `.env` 系、`.gitignore` の `.env` / `.env.*` 欠落。値は出力しない。未走査分類（bearer / basic / key-value）と理由を必ず表示。正規マーカー `[REDACTED:<category>]` は除去してから走査。exit 0 / 1 / 2 |
| パターン共有（R-012） | `src/security/patterns.ts` に一本化。masker は導出、scanner は `scan: true` の分類。合成コーパスを両方に入力する互換テスト |
| JSON Schema | `schema/aiqh.config.schema.json`（zod から生成、`npm run schema:gen`、テストで同期を固定、`files` に同梱） |
| 配布 | `npm link`（ADR-0009）。本体 `npm run build && npm link` → 対象で `aiqh` |
| 自己適用 | `aiqh.config.jsonc` に `security`（`npm run security`）を追加 → 7 チェック。v0.2.0 では security が FAIL（§5）。v0.2.1 で PASS |
| docs / ADR | ROADMAP（M1 完了、M2 に key-value 走査＋`security.allow`）、ARCHITECTURE、CONFIG_SPEC、README、ADR-0009 / 0010 / 0011、CHANGELOG v0.2.0、CLAUDE.md（version とタグの一致ルール） |

## 2. 検証

- テスト先行: fixtures 5 種と 8 テストファイルを先に書き、現状コードで全 FAIL を記録してから実装。実装後の自己スキャンで見つけた「マーカーが URL 認証情報の形に一致する」問題も、テスト → FAIL → 修正の順で対応
- テスト: v0.2.0 時点 33 ファイル 197 件（M0 の 148 件に退行なし）、10 回連続 PASS。v0.2.1 で 44 ファイル 231 件（R1 の回帰 34 件を追加）、10 回連続 PASS
- 自己 verify: **v0.2.0 は VERIFY FAILED**（security 1 件。commit 済み HEAD と 5 commit すべての worktree 検証で再現）。
  **v0.2.1 は `npm run verify` / `npm run verify:dist` とも VERIFY PASSED（7 チェック、security PASS、未追跡ファイル込みで検出 0 件）**。リンク済み `aiqh verify` も PASSED
- `package.json` version は v0.2.0 で 0.2.0、v0.2.1 で 0.2.1（`aiqh --version`、package smoke test の照合と一致）

## 3. 対象 2 リポジトリへの適用（件数のみ。対象では commit / push をしていない）

| 対象 | 書き込んだもの | verify の結果 |
|---|---|---|
| Node 系（React + Vite、tsconfig 参照構成、lint / test 未導入） | `aiqh.config.jsonc`（typecheck / build / security / dependency）、`.gitignore` に `artifacts/`、`package.json` scripts に `verify` | typecheck PASS、build PASS、**security FAIL**（`.gitignore` の `.env.*` 欠落 1 件。既存由来）、**dependency FAIL**（`npm audit`: 既存依存の脆弱性 9 件。既存由来）。lint / unit / e2e NOT APPLICABLE |
| Python 系（FastAPI + venv、pytest のみ） | `aiqh.config.jsonc`（unit / security）、`.gitignore` に `artifacts/` | unit PASS、**security FAIL**（テスト内の anthropic 分類 17 件＝うち 5 件は人間確認済みダミー、12 件は未確認。`.gitignore` の `.env.*` 欠落 1 件。既存由来）。lint / typecheck / build / dependency / e2e NOT APPLICABLE |

既存由来の失敗は報告のみ。`.gitignore` の追加、テスト内ダミー値の連結方式化、依存の更新は人間が別作業として判断する。

## 4. M2 への持ち帰り

- key-value 分類の走査（誤検出抑制の設計）と `security.allow`（例外指定。レビュー原文などにある例示を許容する用途も含む）
- 出力パーサの実装（vitest / pytest / eslint / npm audit）
- 配布のローカル導入化（ADR-0009 の論点）は M3

## 5. R1 で見つかった問題と対策（v0.2.1）

独立レビュー R1（`docs/reviews/m1/independent-review-r1.md`）は High 3 / Medium 6 / Low 1 の 10 件で、すべて VALID と判定して修正した
（判定と根拠は `docs/reviews/m1/response-r1.md`）。

| 問題 | 対策 |
|---|---|
| v0.2.0 が自己 verify（security）FAIL のままタグ付けされた（M1-R1-001） | コメント修正。リリース手順を「commit → 各 commit 単体の worktree 検証 → clean 確認 → push → タグ」に固定（CLAUDE.md）。scanner は未追跡（非 ignore）ファイルも走査 |
| 複数行 PEM を検出できない（002）、1 MiB 超を黙ってスキップ（004） | 逐次読み・サイズ上限廃止、private-key の状態機械 |
| `init` が package.json のスクリプト本文を出力・複製（003） | reason から本文を除去、出力を全て mask |
| `.gitignore` の否定ルール無視（005） | `git check-ignore --no-index` に委ね、リポジトリの `.gitignore` の非否定ルールだけを保護と見なす |
| required 0 件の config を書ける（006） | 書込前に実行時パーサ / リゾルバで検証 |
| 設定ファイルだけで available、`npx` がネットワーク取得し得る（007） | ローカル証拠必須、`npx --no-install`。**Node 系対象の typecheck 提案が `npx tsc -b` → `npx --no-install tsc -b` に変わる** |
| JSON Schema と実行時検証の差（008） | 構造スキーマと明記、`command` に `pattern`、既知の差をテストで固定 |
| Python Playwright が pytest 無しで available、実行権限未確認（009） | pytest 必須、`accessSync(X_OK)` |
| `--write-gitignore` / `--write-scripts` の例外が内部エラー扱い（010） | try/catch と init 固有の exit 2、部分更新の注意を明記 |

教訓: 新規ファイルを含む変更の自己 verify は、追跡状態に依存しない形（commit 後の HEAD、または未追跡込みの走査）で行う。
レビュー原文の例示（PEM の BEGIN 行等）は自己スキャンに一致するため、docs へのコピー時は分割表記に変えて注記する（`security.allow` は M2）。

## 6. R2 で見つかった問題と対策（v0.2.2）

独立レビュー R2（`docs/reviews/m1/independent-review-r2.md`）は High 1 / Medium 4 の 5 件で、すべて VALID と判定して修正した
（判定と根拠は `docs/reviews/m1/response-r2.md`）。R1-005 / R1-009 のレビュアー再判定（PARTIAL）はそれぞれ 001 / 003 で解消。

| 問題 | 対策 |
|---|---|
| 未追跡・未 ignore の `.env.staging` 等を読まずにスキップし、代表 4 パスのプローブしか見ないため finding 0 件で PASS し得る（001、High） | 未追跡 `.env*` は中身を読まずに `untracked-env` finding（example 系は情報のみ）。プローブは予防的確認として維持 |
| `lstat` の例外を種別を問わず握りつぶす（002） | ENOENT だけスキップ、他は ScanError → exit 2。`classifyStatError()` を単体テスト |
| venv の `python` 本体の実行権限を確認していない（003、R1-009 の残り） | venv 検出を「python が実行可能」基準にし `PythonContext.python` を全アダプタで使用 |
| 改行のない巨大ファイルでメモリがファイルサイズに比例（004、R1-004 の派生） | `LineAssembler` の窓走査（上限 256 KiB、重なり 4 KiB、重複 finding は 1 件）。上限超過を ERROR にはしない |
| `init` の `artifacts/` 提案が行一致で否定を見ない（005） | `git check-ignore` の判定を Security Scan と共用。非 git は追加提案、書込は冪等 |

教訓: 「読まない」と決めたものは「存在しない」ではない。Git が確定した事実（未 ignore）はそのまま finding にする。走査の例外処理は
経路ごとに揃える（lstat と read）。逐次読みは「行を必ず保持する」設計にせず、上限と重なりで有界にする。
