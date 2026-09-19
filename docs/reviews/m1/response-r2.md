# M1 独立レビュー R2 への対応記録（response-r2）— v0.2.2

- 対象レビュー: `docs/reviews/m1/independent-review-r2.md`（受領ファイル名 `independent-review-m1-r2-for-claude.md`、2026-09-19 付、
  SHA-256 48b111d4…。M1-R2-001〜005: High 1 / Medium 4。R1-005 / R1-009 は PARTIAL と再判定。対象 v0.2.1 = commit 630f2e3 / tag object df8f41c）
- 対応日: 2026-09-19
- 人間の判断: 5 件すべて今回のサイクルで対応し `v0.2.2` を付与。R3 で High が無ければ M1 完了とし、Medium 以下は M2 のリストへ積む。
  停止ポイント1 で確定: 非 git では `artifacts/` を常に提案し書込は冪等（005）、窓走査の上限は JS 文字列長で測りメモリはおおむね 2 ×（上限 + 重なり）バイト（004）
- 原文コピー: スキャナに一致する例示行は無く、無改変（先頭注記に SHA-256 を記録）

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード（修正前も PASS） |
|----|--------|------|------|-----------------|------------|------------|
| M1-R2-001 | High | VALID | 修正済み | scan.ts の未追跡ループは `ENV_FILE` に一致すると `continue` するだけで finding を作らず、`checkGitignore()` は代表 4 パスのみ。`.env.staging`（未追跡・未 ignore）が 0 件で PASS し得た。修正: 未追跡の `.env*` は中身を読まずに `untracked-env`（パスのみ、「environment file exists but is not ignored by git」）。example / sample / template / dist は `exampleEnvFiles` に情報のみ。basename 判定でネストも対象。代表プローブは維持 | `regression-m1r2-001-untracked-env` 3 件: `.env.staging` → 0 件 → 1 件（CLI exit 1、値なし）; `config/.env.staging`; mode 000 でも finding かつエラーにならない（読まない証拠） | `.env.example` → なし; `.env*` で ignore 済み → `--others` に出ず 0 件 |
| M1-R2-002 | Medium | VALID | 修正済み | `lstatSync` の catch が例外種別を問わず `return`（readLines の fail closed と不揃い）。修正: `classifyStatError(err)` を export（ENOENT → "skip"、他 → "error"）し、error は `ScanError("cannot stat …")` → exit 2 | `regression-m1r2-002-stat-errors` 2 件: 合成 errno（ENOENT / EACCES / EPERM / ELOOP / EIO / ENOTDIR / code なし）; 親ディレクトリ 000 の追跡ファイルで `scanRepository()` が例外なし → ScanError、CLI exit 2（非 root で実 EACCES を再現。root ではスキップ） | — |
| M1-R2-003 | Medium | VALID（R1-009 は PARTIAL → 今回で解消） | 修正済み | `buildPython()` の venv 検出は `exists(<venv>/bin/python)`（lstat）で、`py()` は文字列を組み立てるだけ。python 0644 でも available だった。修正: venv 検出を `isExecutable(<venv>/bin/python)` 基準にし、`PythonContext.python`（実行可能 interpreter の相対パス）を全アダプタが使用。venv はあるが非実行の場合も PythonContext は返す（`python: null` → 全アダプタ unavailable「no virtual environment with an executable bin/python」） | `regression-m1r2-003-python-executable` 3 件: python 0644 + pytest 0755 → available → unavailable、`ctx.python.python` null; ruff / mypy / pip-audit / playwright も unavailable | python 0755 → available |
| M1-R2-004 | Medium | VALID（R1-004 の派生） | 修正済み | `readLines()` は改行が来ない限り `pending` を伸ばし続け保持量がファイルサイズに比例。修正: `LineAssembler`（export、純粋）を導入し、`MAX_LINE_BYTES = 256 KiB` を超えたら溜めた区間を同じ行番号で `onLine(…, continued=true)` に渡し、末尾 `LINE_OVERLAP = 4 KiB` を残して接続。scanFile は（分類, 行）の Set で重複 finding を 1 件に統合。行番号は改行数で進む。上限は JS 文字列長（UTF-16 コード単位）で測るため実メモリはおおむね 2 ×（上限 + 重なり）バイト（コード内コメントと ARCHITECTURE に明記）。重なりの根拠: 行指向パターンの最長一致（JWT 3 セグメント、url-credential）は数百文字で 4 KiB に十分収まる | `regression-m1r2-004-long-line-window` 1 件: `LineAssembler` の保持が `MAX_LINE_BYTES + LINE_OVERLAP` を超えないこと（64 KiB × 64 = 4 MiB 投入。区間が続く間は同じ行番号・`continued`、改行後に行番号が進む） | 20 MiB 単一行の末尾 / 先頭 / 境界（MAX−5, MAX−1, MAX）で `aws` を 1 件検出、長行の後の行番号（修正前も検出はできたがメモリ無制限） |
| M1-R2-005 | Medium | VALID | 修正済み | `proposeGitignore()` は `.gitignore` の行を `artifacts/` 等と等値比較するだけ。修正前の実演: `artifacts/` + `!artifacts/` で `aiqh init` が「already ignores artifacts/」、`git check-ignore -v artifacts/x` は NOT ignored。修正: scanner の `gitIgnoredByRepoRules()` を export して共用し、代表パス `artifacts/.aiqh-ignore-probe` で判定（出所がリポジトリ内 `.gitignore` かつ非否定）。`.gitignore` なし / 非 git / git 失敗は `needed = true` と理由付き。`--write-gitignore` は同じ行が既にあれば追記しない（冪等。非 git フィクスチャの既存テストを維持） | `regression-m1r2-005-artifacts-gitignore` 6 件（`proposeGitignore` を export）: `artifacts/` → false; `artifacts/` + `!artifacts/` → true; `/artifacts/` → false; `artifacts/**` → false; `.gitignore` なし → true; 非 git → true | — |

INVALID / PARTIAL なし。R1-005（`.env.*` の実在ファイルを見逃す）は 001 で、R1-009（interpreter の実行権限）は 003 で解消。

## 回帰テストの実行記録

- 修正前: 新規 5 ファイル 21 テスト → 15 FAIL / 6 PASS（ガード）。記録 `tmp/m1r2/before.txt`。typecheck は未実装の export で 14 件エラー（想定）。
  004 の巨大行テストは最初 `x` / `y` を詰め物にしたため AWS パターンの `\b` が成立せず検出できなかった → 詰め物を非単語文字 `-` に変えて再記録
- 修正後: 21 件 PASS。既存 231 件に退行なし（既存テストの変更なし）
- 全体: 49 ファイル 252 件 PASS を **10 回連続**で確認（`tmp/m1r2/ten-1..10.txt`）
- 自己 verify（v0.2.2 の作業ツリー）: `npm run verify` / `npm run verify:dist` / リンク済み `aiqh verify` とも VERIFY PASSED（7 チェック、security PASS、未追跡込みで検出 0 件）。commit 後の HEAD と各 commit の worktree 検証は最終報告に記載
- 実装中に見つけた自己の誤り: `LineAssembler` にコンストラクタのパラメータプロパティを使い `erasableSyntaxOnly`（CLAUDE.md の規約）に違反 → 明示フィールドに修正。typecheck が捕捉

## 対象リポジトリでの再実行（書込なし。値は出力していない）

- Node 系: 提案（4 チェック）は v0.2.1 と同じ。`.gitignore` 提案は「already ignores artifacts/ (confirmed with git check-ignore)」。scanner は gitignore 1 件のまま（`.env.production` / `.env.development` が未 ignore）。未追跡・未 ignore の `.env*` は存在しない（`git ls-files --others --exclude-standard` に env ファイルなし）ため `untracked-env` 0 件
- Python 系: 提案（2 チェック）は同じ。scanner は anthropic 17 件（同じ file:line）+ gitignore 1 件で変化なし。未追跡・未 ignore の `.env*` なし。venv の python は実行可能で unit の提案は維持

## レビュアーの「見ていない範囲」に対する所見

- 巨大 1 行の OOM 実験はレビュアー同様に行っていない。代わりに `LineAssembler` を純粋関数に切り出し、保持長の上限を単体テストで固定した（メモリ計測に依存しない）
- v0.2.1 のタグ・worktree 検証・10 回連続実行は本体側で実施済み（M1R1 最終報告）

## 教訓

- 「読まない」と決めたものは「存在しない」ではない。Git が確定した事実（未 ignore）はそのまま finding にする
- 例外処理は経路ごとに揃える（lstat と open / read）。握りつぶしは fail open
- 逐次読みは「行を必ず保持する」設計にせず、上限と重なりで有界にする。上限は測り方（文字数か バイト数か）を明記する
- 判定ロジックを 2 か所に持たない（`.gitignore` の判定は scanner と init で 1 つの関数を共用）
