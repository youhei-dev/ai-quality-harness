# M1 独立レビュー R1 への対応記録（response-r1）— v0.2.1

- 対象レビュー: `docs/reviews/m1/independent-review-r1.md`（受領ファイル名 `independent-review-m1-r1-for-claude (1).md`、2026-09-19 付。
  同名の無印ファイル（9/16 付）は M0 の R5 と同一内容だったため対象外。M1-R1-001〜010: High 3 / Medium 6 / Low 1。対象 v0.2.0 = commit 680869d / tag object 2e2685f）
- 対応日: 2026-09-19
- 人間の判断: 10 件すべて今回のサイクルで対応し、`v0.2.1` を付与（v0.2.0 は superseded / known-bad として残す）。
  判定条件（M1-R1-005）、docs 内の PEM 例示の分割表記、リリース手順の順序（commit → worktree 検証 → clean → push → タグ）を停止ポイント1 で確定
- 受領原文の docs コピーについて: 原文の例示 8 行（PEM の BEGIN / END 行、「スキーム://ユーザー:パスワード@ホスト」）が改訂後の自己スキャンに一致するため、
  人間の指示（docs 内の例示は分割表記）に従い分割表記へ変え、ファイル先頭のコメントに変更行番号を記録した。それ以外は原文のまま

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード（修正前も PASS） | 初回実行 |
|----|--------|------|------|-----------------|------------|------------|--------|
| M1-R1-001 | High | VALID | 修正済み | v0.2.0 の `npm run verify` は security 1 件で FAILED（`patterns.ts:61` のコメントが url-credential に自己一致）。commit 前の自己 verify は新規ファイルが未追跡で走査外だった。修正: コメントを `<scheme>://<user>:<password>@<host>` に、scanner は未追跡（非 ignore）も走査、docs（CHANGELOG / ROADMAP / M1_REPORT / README）を実測に訂正、CLAUDE.md にリリース手順の順序を固定 | `regression-m1r1-001-untracked-scan` 2 件: 未追跡ファイル内の合成 AWS キーが検出 0 件 → 1 件（`filesUntracked` 1）; 未追跡 `.env` は読まず tracked-env にしない | 既存 `security-scan.test` の「ignore されたファイルは走査しない」に書き換え | — |
| M1-R1-002 | High | VALID | 修正済み | scan.ts は行単位に regex を適用し、private-key の `[\s\S]*?` は 1 行に BEGIN と END が無いと一致しない。互換テストのサンプルが 1 行形式だった。修正: `SecretPattern.scanMode: "block"` + `block.begin/end`、scanner の状態機械（開始行・終了行、END 無しは EOF まで）、互換コーパスを複数行 PEM 3 種に | `regression-m1r1-002-multiline-pem` 5 件: RSA / EC / 無印で 0 件 → 1 件（line = BEGIN 行、endLine = END 行）; END 無しで検出; 2 鍵ファイルの CLI 出力に本体なし | 互換テスト（masker 側は複数行でも従来どおりマスク） | — |
| M1-R1-003 | High | VALID | 修正済み | node.ts が `JSON.stringify(script)` を reason に入れ、init.ts（console / `--json`）と generate.ts（config コメント）へ未マスクで流れていた。修正: reason は「`scripts.lint found`」等の存在記述のみ、init の全出力を `maskSecrets`、`--json` を `maskDeep`、生成コメントを `maskSecrets` | `regression-m1r1-003-init-no-script-bodies` 4 件: 合成 GitHub トークンを含む scripts が Detection / 提案出力 / `--json` / 書込 config に含まれる → 含まれない | — | — |
| M1-R1-004 | Medium | VALID | 修正済み | 1 MiB 超を `skippedLarge` で continue し、終了コードに影響しない fail open。修正: 64 KiB チャンクの逐次読み（`StringDecoder`）、サイズ上限と `skippedLarge` を廃止、読取エラーは ScanError（exit 2） | `regression-m1r1-004-large-text` 3 件: 1 MiB 超末尾の合成 AWS キーが 0 件 → 1 件（行番号一致）; 大容量 clean が走査数に入る | チャンク境界をまたぐ 3 バイト文字の行番号 | — |
| M1-R1-005 | Medium | VALID | 修正済み | `!` 行を捨てて文字列一致していた。修正: `git -c core.excludesFile=/dev/null check-ignore --no-index -v -n --stdin -z` に代表 4 パスを渡し、出所が `.gitignore` かつ非否定のときだけ保護あり | `regression-m1r1-005-gitignore-negation` 5 件: `.env*` + `!.env.production` で 0 件 → 1 件（`.env.production` を明示） | `.env*` のみ / 2 行形式 / `!.env.example` / `.env` のみ・無し | — |
| M1-R1-006 | Medium | VALID | 修正済み | `--write` の guard は `checks.length === 0` のみで、Playwright のみ（`required: false`）の config を書けた。修正: 書込前に `parseConfigText` → `resolveConfig` | `regression-m1r1-006-required-zero` 1 件: 非 git・Playwright のみで exit 0・ファイル生成 → exit 2・生成なし（フィクスチャ `node-playwright-only`） | — | — |
| M1-R1-007 | Medium | VALID | 修正済み | eslint / vitest / jest / playwright は config **or** dep、tsc は tsconfig のみで available、`npx <tool>` に `--no-install` なし。修正: `hasLocalTool`（deps または実行可能な `node_modules/.bin/<bin>`）必須、`npx --no-install` | `regression-m1r1-007-local-tool-evidence` 5 件: 設定のみで available → unavailable（5 ツール）; `npx` → `npx --no-install`（3 件）; `.bin` の証拠 | 既存 scripts の優先。本体の init 提案は不変（既存テスト） | — |
| M1-R1-008 | Medium | VALID（設計） | 案 B | `command` の refine は JSON Schema に落ちず、重複名 / required ≥ 1 は表現不可。修正: `.regex(/\S/)` に変えて `pattern` を生成、スキーマ `description` に「最終検証は aiqh」を明記、CONFIG_SPEC §4b / README | `regression-m1r1-008-schema-parity` 4 件: `pattern` 無し → あり（空白のみを拒否）; description 無し → あり | 既知の差 2 件（required 0 件・重複名）を実行時パーサが拒否 | — |
| M1-R1-009 | Medium | VALID | 修正済み | Playwright は `playwright` + `tests/e2e` のみで available（推奨コマンドは pytest）。`venvBin` は `existsSync` のみ。修正: pytest 必須、`accessSync(X_OK)` | `regression-m1r1-009-python-prerequisites` 3 件: pytest 無しで available → unavailable（hint に pytest）; 実行権限なし → 検出しない | pytest ありで available | — |
| M1-R1-010 | Low | VALID | 修正済み | `.gitignore` / `package.json` の read / parse / write が try/catch 外。修正: 各書込を try/catch し `aiqh init: failed to update <file>: …` + exit 2。部分更新を CONFIG_SPEC §5.3c に明記 | `regression-m1r1-010-init-write-errors` 2 件: 読み取り専用 `.gitignore` / `package.json` で throw → exit 2 と init 固有メッセージ（root ではスキップ） | — | — |

INVALID / PARTIAL なし。テスト不在型（初回実行のみ）なし: 全件で修正前 FAIL を記録した（`tmp/m1r1/before.txt`: 34 テスト中 25 FAIL / 9 PASS＝ガード）。

## 回帰テストの実行記録

- 修正前: 新規 10 ファイル 34 テストを現状コードで実行 → 25 FAIL / 9 PASS（ガード）。typecheck は新フィールド（`filesUntracked`、`endLine`）未定義で 3 件エラー（想定）
- 修正後: 34 件 PASS。既存テストの仕様変更 2 件（未追跡走査、サイズ skip 廃止）と期待値更新 4 件（`npx --no-install tsc -b`）、互換コーパスの複数行化
- 全体: 44 ファイル 231 件 PASS を **10 回連続**で確認（`tmp/m1r1/ten-1..10.txt`）
- 自己 verify（v0.2.1 の作業ツリー）: `npm run verify` / `npm run verify:dist` / リンク済み `aiqh verify` とも VERIFY PASSED（7 チェック、security PASS、未追跡込みで検出 0 件）。commit 後の HEAD と各 commit の worktree 検証は最終報告に記載

## 対象リポジトリでの再実行（書込なし。値は出力していない）

- Node 系: `aiqh init` の提案は typecheck の command が `npx tsc -b` → `npx --no-install tsc -b` に変わった（他 3 チェックは同じ）。監査表からスクリプト本文が消えた。
  `aiqh security-scan` は gitignore 1 件のまま（メッセージが「`.env.local` は ignore 済み、`.env.production` / `.env.development` が未 ignore」と具体化）。秘密の形の検出なし
- Python 系: 提案は同じ（unit / security）。e2e の案内に pytest が加わった。`aiqh security-scan` は anthropic 17 件（同じ file:line）+ gitignore 1 件で変化なし

## レビュアーの「見ていない範囲」に対する所見

- 全 5 commit の worktree 検証・v0.2.0 タグの実在・10 回連続実行は本体側で実施し記録済み（最終報告と M1_REPORT）。R1 で指摘のとおり、v0.2.0 の worktree 検証は
  タグ付与後に行われており、順序の欠陥は CLAUDE.md の規約で塞いだ
- 未追跡ファイルを走査しないこと自体は指摘対象外だったが、多層防御として採用した（ADR-0010 改訂）

## 教訓

- 自己 verify の根拠は commit 済み HEAD。作業ツリーの verify は補助
- 行指向の走査に複数行パターンを載せるときは、互換テストのコーパスを実際の形（複数行）にする。1 行形式のサンプルは欠陥を隠す
- 「skip して件数だけ表示」は security gate では fail open。走査できないものは検出扱いか ERROR にする
- 自前の簡易判定（`.gitignore` の文字列一致）より、その意味論を持つツール自身（`git check-ignore`）に判定させる
