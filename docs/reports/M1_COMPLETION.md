# M1 完了報告 — ai-quality-harness（aiqh）

- 完了日: 2026-09-20
- 完了ベースライン: `v0.2.2`（commit f958ac7、M1 — independent review R2 applied）。完了記録のタグ: `v0.2.3`（M1 complete — adapters, init, security scan; independent reviews R1-R3 recorded。コード変更なし）
- 状態: M1 の完成条件をすべて満たし、独立レビュー 3 ラウンド（R1: 10 件、R2: 5 件、R3: 5 件）のうち R1 / R2 を反映。R3（High なし）は事前の基準により M2-0 へ持ち越し。
  `v0.2.0` は自己 verify が FAIL する状態でタグ付けされたため superseded（§3）
- 対象リポジトリの固有情報（パス・行番号・設定値・脆弱性の詳細）は本書に書かない。リポジトリ名は従来どおり docs で参照する

## 1. M1 で作ったもの

| 領域 | 内容 |
|---|---|
| チェックアダプタ（`src/adapters/`） | `Adapter.detect(ctx: RepoContext): Detection \| null` が検出と推奨だけを返す（ADR-0011）。Node 7（eslint / tsc / vitest / jest / build / npm・pnpm・yarn audit / playwright）、Python 7（ruff / mypy / pyright / pytest / build 非該当 / pip-audit / playwright）、内蔵 1（security）。`RepoContext` は読み取り専用で `.env*` を読まない。Node はローカル証拠（依存または実行可能な `node_modules/.bin`）が必須で、直接実行は `npx --no-install`。Python は venv の interpreter とツールのバイナリを実行権限で確認。`resolveDetections` が分類ごとに最初の available を採用。出力パーサは `OutputParser` の型のみ（M2） |
| `aiqh init` | 読み取り監査 → 監査表（`aiqh` の PATH 解決元と version を表示）と `aiqh.config.jsonc` 案（コメント付き JSONC、`$schema` は解決できる場合のみ）→ `--write`（生成物を `aiqh verify` と同じパーサ / リゾルバで検証してから config 1 ファイルのみ。既存は `--force` なしで拒否）/ `--write-gitignore`（`git check-ignore` で判定、冪等）/ `--write-scripts`（未定義キーのみ）/ `--json`。全出力を秘密情報マスクに通し、package.json のスクリプト本文は出さない。任意書込の失敗は init 固有の exit 2 |
| Security Scan（`aiqh security-scan`、ADR-0010） | 内蔵実装（Node 標準 + git）。対象は git 追跡ファイル + 未追跡で ignore されないファイル。64 KiB チャンクの逐次読み（サイズ上限なし、1 行 256 KiB 超は重なり 4 KiB の窓走査）、バイナリはスキップ、lstat / 読取エラーは exit 2。行指向 10 分類 + PEM ブロックの状態機械（開始行–終了行、END 無しも検出）。追跡 `.env` 系（example 系は情報のみ）、未追跡で未 ignore の `.env*`（読まずに finding）、`.gitignore` のカバレッジ（`git check-ignore --no-index`。リポジトリ内 `.gitignore` の非否定ルールのみ保護と見なす）。値は出力しない。未走査分類（bearer / basic / key-value）と理由を必ず表示。exit 0 / 1 / 2 |
| パターン共有（R-012） | `src/security/patterns.ts` に 13 分類を一本化。masker は全分類、scanner は `scan: true` の 10 分類。実行時連結の合成コーパスを両方に入力する互換テスト（複数行 PEM 3 種を含む） |
| 配布（ADR-0009） | `npm link`（`~/.local/bin/aiqh -> dist/cli.js`）。対象の `package.json` に依存を追加しない。公開配布（npm publish、`min-release-age`、Public 化）は M3 の論点 |
| JSON Schema | `schema/aiqh.config.schema.json`（zod から生成、同期をテストで固定）。構造スキーマであり、横断規則（一意な名前、必須 1 件以上）は `aiqh` が実行時に検証（案 B、既知の差をテストで固定） |
| 2 リポジトリへの適用 | Node 系（React + Vite）と Python 系（FastAPI + venv）に `aiqh init --write` と `aiqh verify` を適用。検出できたチェックは PASS、既存由来の FAIL（`.gitignore` の `.env.*` 欠落、テスト内ダミーキー、npm audit）は報告のみ。対象では commit / push をせず、人間の後続作業一覧を最終報告に残した |
| 自己適用 | `aiqh.config.jsonc` に `security`（`npm run security`）を追加し 7 チェック構成に |
| docs / ADR | ROADMAP、ARCHITECTURE（§6.1b）、CONFIG_SPEC（§4b、§5.2 / 5.3 / 5.3b / 5.3c）、README、ADR-0009 / 0010 / 0011（改訂 2 回）、CHANGELOG、`docs/reviews/m1/`（R1〜R3 の原文と対応記録）、`docs/reports/M1_REPORT.md`、CLAUDE.md（version とタグの一致、リリース手順の順序、レビュー原文コピーの規約） |

## 2. 検証の構成（完了時点 v0.2.2）

| 項目 | 値 |
|---|---|
| 自己 verify | `npm run verify`（ソース実行）/ `npm run verify:dist`（ビルド済み JS）/ リンク済み `aiqh verify`。7 チェック（lint / typecheck / unit / build / package / security / dependency）すべて PASS、e2e NOT APPLICABLE。security は未追跡ファイル込みで検出 0 件 |
| テスト | 49 ファイル 252 件（M0 の 148 件 + M1 の 49 件 + R1 の回帰 34 件 + R2 の回帰 21 件）。完了前に 10 回連続実行で全回 PASS。ダミー秘密値・PEM は実行時連結（`fake(prefix, body)`） |
| リリース手順（R1 で固定） | commit（指摘単位。共有ファイルは中間版で部分 stage）→ **各 commit 単体の worktree 検証（typecheck / vitest / `npm run verify`）を push 前に実施** → `git status` clean と作業ツリー＝検証済み最終版のチェックサム一致 → HEAD で 10 回連続テスト → 1 件でも FAIL なら push せず停止 → push（別コマンド）→ 注釈付きタグ → タグ push |
| セキュリティ検査 | 自己スキャン（未追跡込み）、変更・新規ファイルに対する個人名・ホームパス・対象固有情報・秘密の形の検索を各ラウンドで実施。レビューパケットも同じ検査を通してから ZIP |

タグ別のテスト件数: v0.2.0: 197 → v0.2.1: 231 → v0.2.2: 252（v0.2.3 はコード変更なしで 252）

## 3. レビューループの運用と指摘件数の推移

M0 と同じ運用（パケット → 独立レビュー → 実コードで判定 → 回帰テスト先行で「修正前 FAIL」を記録 → 最小修正 → 10 回連続 → 自己 verify → docs → 対応記録 →
指摘単位の commit → 各 commit の worktree 検証 → push → タグ → 次のパケット）。

指摘件数の推移: **R1: 10（High 3 / Medium 6 / Low 1）→ R2: 5（High 1 / Medium 4）→ R3: 5（High 0 / Medium 4 / Low 1）**。
事前の基準「R3 で High が無ければ M1 完了」により M1 を完了とし、R3 の 5 件は M2-0 へ持ち越した（`docs/reviews/m1/response-r3.md`）。

### v0.2.0 の自己 verify FAIL（隠さず記録）

- **事象**: v0.2.0 は必須チェック `security` が FAIL する状態でタグ付けされた。原因は `src/security/patterns.ts` の url-credential の説明コメントがパターン自身に一致したこと
- **なぜ見逃したか**: タグ付け前の自己 verify は作業ツリーで実行し PASSED だったが、当時の scanner は `git ls-files`（追跡ファイル）だけを走査し、M1 の新規ファイルは未 commit・未追跡で走査対象外だった。
  加えて、各 commit 単体の worktree 検証がタグ付けの**後**に置かれていたため、タグ付け前に捕捉できなかった
- **対策（v0.2.1）**: コメントを `<scheme>://<user>:<password>@<host>` に修正。scanner は未追跡で ignore されないファイルも走査（多層防御）。リリース手順の順序を CLAUDE.md に固定
  （commit → 各 commit の worktree 検証 → clean 確認 → push → タグ）。v0.2.0 は削除・付け替えせず superseded / known-bad として残した。M1_REPORT / ROADMAP / README の「自己 verify PASS」記述は実測に訂正

## 4. 学んだこと（M2 への持ち帰り）

- **未追跡ファイルの走査**: 「commit 前の自己 verify」は追跡状態に依存してはいけない。scanner は未追跡（非 ignore）も走査し、リリース判定の根拠は commit 済み HEAD の verify とする
- **リリース手順の順序**: 各 commit 単体の worktree 検証 → clean / チェックサム確認 → 10 回連続 → push → タグ。1 件でも FAIL なら push しない。commit と push は別コマンド、タグは削除・付け替えしない
- **窓走査のトレードオフ**: メモリを有界にすると、重なりより長いトークンが境界をまたぐ偽陰性が残る（M1-R3-001）。Known Risk に書くだけでは次のレビューで具体的再現として返ってくる。候補プレフィックスの持ち越しか fail closed に倒す
- **レビュー原文コピーの規約**: スキャナに一致する例示行は分割表記に変え、変更行番号と原文の SHA-256 を先頭に記録する（`security.allow` が入るまでの運用）
- **ハンク単位 / 中間版の stage**: 複数の指摘にまたがるファイルは中間版を用意し「中間版を置く → `git add` → 最終版に戻す → チェックサム確認」で指摘単位の commit を保つ。各中間状態は使い捨て worktree で事前確認できる
- **対象リポジトリは書き込み前に必ず提案を人間が見る**: `aiqh init`（書込なし）の提案を停止ポイントで示し、承認後にだけ `--write` 系を実行する。対象では commit / push しない。後続作業は一覧で人間に渡す
- **テスト先行と「修正前 FAIL」の記録**: レビュアーの再現条件をそのままテストにし、修正前の FAIL を記録してから直す。ガード（修正前も PASS）と区別して記録する。修正しない持ち越し分はテストを追加せず、再現は使い捨てスクリプトで行う（失敗テスト・skip テストを残さない）
- **判定と修復の意味論を揃える**（M1-R3-002 / 003 / 004）: 提案は Git に聞くのに書込は行一致、では修復できない。sentinel 1 個や未追跡 `.gitignore` を保護と数えない
- **例外処理は経路ごとに揃える**（lstat と read、行指向とブロックの重複統合）
- **設定の検証は 1 か所**: `init --write` は verify と同じパーサ / リゾルバに通す。JSON Schema は構造のみ

## 5. M2-0 開始時の前提

- 基準タグ: `v0.2.3`（コードは v0.2.2 と同一。commit SHA はタグ付与後に `git rev-list -n1 v0.2.3` で確認し CHANGELOG / 最終報告に記載）
- テスト件数: 252（すべて PASS、10 回連続）
- 自己 verify: lint / typecheck / unit / build / package / security / dependency の 7 チェック PASS。e2e は NOT APPLICABLE
- M2-0「スキャナ保守」の項目（ROADMAP）: M1-R3-001 / 002 / 004 / 003 / 005、key-value 走査と `security.allow`、`.env` 判定と窓走査の設定化、持ち越し済み R-010 / R-011 / R-013 の行き先は従来どおり
- 対象リポジトリ側の後続作業（人間）: M1R2 最終報告 §6 のとおり（Node 系: typecheck command の `--no-install` 化、`.gitignore` の `.env.*`、npm audit、3 ファイルの commit。Python 系: 未確認 12 件の目視確認、ダミー値の連結方式化、`.gitignore` の `.env.*`、2 ファイルの commit）
