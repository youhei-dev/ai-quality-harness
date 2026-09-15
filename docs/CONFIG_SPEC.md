# CONFIG_SPEC — 設定ファイル仕様

最終更新: 2026-09-15
状態: **M0 で必要な範囲（§1〜§5）は確定**。§6 は M1 以降の案。

---

## 1. ファイル名と形式

- ファイル名: `aiqh.config.jsonc`（対象リポジトリのルートに 1 枚）
- 形式: JSONC（JSON + コメント + 末尾カンマ許容）。根拠は ADR-0002
- 文字コード: UTF-8
- `--config <path>` で別パスを指定できる。相対パスの基準（プロジェクトルート）は**設定ファイルのあるディレクトリ**

設定ファイルには秘密情報を書く場所がない。秘密値を必要とするチェック（例: 外部サービスへの接続を伴う E2E）は、
コマンド側が環境変数や `.env` から読む前提とし、aiqh はそれらを設定から注入しない。

---

## 2. トップレベル

```jsonc
{
  // 任意。エディタ補完用（M1 で JSON Schema を同梱予定）
  "$schema": "./node_modules/ai-quality-harness/schema/aiqh.config.schema.json",

  // 必須。設定スキーマのバージョン。M0 は 1 のみ受け付ける
  "version": 1,

  // 必須
  "project": {
    "name": "ai-quality-harness",   // 必須。レポートに表示する名前
    "type": "node"                  // 任意。"node" | "python" | "mixed" | "other"。M1 のアダプタ選択の補助
  },

  // 任意
  "output": {
    "dir": "artifacts/verification" // 任意。既定 "artifacts/verification"。プロジェクトルートからの相対
  },

  // 任意。各 check の既定値
  "defaults": {
    "timeoutSec": 600,              // 任意。既定 600
    "required": true                // 任意。既定 true
  },

  // 必須。1 件以上。設定順に実行する
  "checks": [ /* §3 */ ]
}
```

---

## 3. check オブジェクト

| フィールド | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `name` | string | ✔ | — | 一意な識別子。`^[a-z0-9][a-z0-9-]*$`。レポートとログに使う |
| `kind` | enum | ✔ | — | `lint` / `typecheck` / `unit` / `build` / `security` / `dependency` / `e2e` / `custom`。分類別サマリに使う |
| `command` | string | ✔ | — | 実行コマンド。shell 経由で実行（`npm run lint`、`npx tsc --noEmit`、`.venv/bin/pytest -q` 等）。空文字不可 |
| `cwd` | string | — | `"."` | 作業ディレクトリ。プロジェクトルートからの相対パス。ルート外へ出る指定（`..` や絶対パス）はエラー |
| `required` | boolean | — | `defaults.required` | true なら失敗で VERIFY FAILED。false なら失敗してもレポートに FAIL として残すだけ |
| `timeoutSec` | integer | — | `defaults.timeoutSec` | 1 以上。超過時はプロセスグループを終了させ FAIL（timedOut=true） |
| `description` | string | — | — | 人間向けの説明。レポートに表示 |

未知のフィールドはエラー（typo を検出するため）。

---

## 4. 検証規則（M0 で実装）

読込時に以下を検証し、1 つでも違反があれば**レポートを書かずに終了コード 2** で停止する。

1. JSONC として解釈できること
2. `version` が `1` であること
3. `project.name` が空でない文字列であること
4. `checks` が 1 件以上であること
5. `checks[].name` が一意であり、パターン `^[a-z0-9][a-z0-9-]*$` に合致すること
6. `checks[].command` が空白のみでないこと
7. `checks[].cwd` を解決した結果がプロジェクトルート内であること。字句上の判定に加えて realpath（symlink 解決後）でも判定し、ルート内の symlink がルート外を指す場合もエラー（`output.dir` も同様。未作成のパスは存在する最も近いエントリで判定）。途中に dangling symlink（リンク先が未作成）がある場合は解決先を検証できないため、リンク先がルート内向きでもエラー（「解決先が存在しない。先に作成するか設定を見直す」）。cwd 自体が存在しない通常のディレクトリの場合は読込時エラーではなく、その check を FAIL とする
8. `timeoutSec` が正の整数であること
9. `required: true` の check が 1 件以上あること（必須チェックが 0 件の設定は「常に PASS」になり fail closed に反するため）
10. 未知のフィールドがないこと

---

## 5. 例

### 5.1 本体リポジトリ（M0 で実際に使用）

```jsonc
{
  "version": 1,
  "project": { "name": "ai-quality-harness", "type": "node" },
  "defaults": { "timeoutSec": 600 },
  "checks": [
    { "name": "lint",       "kind": "lint",       "command": "npm run lint",       "timeoutSec": 300 },
    { "name": "typecheck",  "kind": "typecheck",  "command": "npm run typecheck",  "timeoutSec": 300 },
    { "name": "unit",       "kind": "unit",       "command": "npm run test",       "timeoutSec": 600 },
    { "name": "build",      "kind": "build",      "command": "npm run build",      "timeoutSec": 300 },
    // 高以上の脆弱性で失敗。moderate 以下は M0 では通す（根拠: M0_REPORT の未解決事項）
    { "name": "dependency", "kind": "dependency", "command": "npm audit --audit-level=high", "timeoutSec": 300 }
  ]
}
```
`security` と `e2e` は check が無いため NOT_APPLICABLE として報告される。

### 5.2 Node 系の対象リポジトリ（案。trim-manager 相当）

```jsonc
{
  "version": 1,
  "project": { "name": "trim-manager", "type": "node" },
  "checks": [
    // 2026-09 時点で ESLint / Vitest 未導入のため lint / unit は登録しない（NOT_APPLICABLE）
    { "name": "typecheck",  "kind": "typecheck",  "command": "npx tsc -b --noEmit" },
    { "name": "build",      "kind": "build",      "command": "npm run build", "timeoutSec": 900 },
    { "name": "dependency", "kind": "dependency", "command": "npm audit --audit-level=high" }
  ]
}
```

### 5.3 Python 系の対象リポジトリ（案。ai-tutor-browser 相当）

```jsonc
{
  "version": 1,
  "project": { "name": "ai-tutor-browser", "type": "python" },
  "checks": [
    // ruff / mypy は未導入のため登録しない（導入は別依頼）
    { "name": "unit",       "kind": "unit",       "command": ".venv/bin/python -m pytest -q", "timeoutSec": 900 },
    { "name": "dependency", "kind": "dependency", "command": ".venv/bin/python -m pip_audit", "required": false }
  ]
}
```
`build` は Python では一般に該当しないため登録しない（NOT_APPLICABLE）。

---

## 6. M1 以降の拡張案（未確定）

| 項目 | 案 | 目的 |
|---|---|---|
| `checks[].enabled` | boolean | 一時的に無効化。無効化された check はレポートに SKIPPED と理由を残す |
| `checks[].env` | `{ NAME: "value" }`（値に秘密は不可。`$VAR` 参照のみ許容する方式を検討） | CI 向けのフラグ（`CI=1` 等） |
| `checks[].parser` | `"eslint-json"` / `"pytest"` 等 | 件数・失敗テスト名をレポートに構造化 |
| `checks[].artifacts` | glob 配列 | Playwright のトレース等を verify 出力にコピー |
| `checks[].dependsOn` | name 配列 | 前段が FAIL のとき SKIPPED にする（例: typecheck 失敗時に build を飛ばす） |
| `matrix` | Node / Python バージョン | Actions での並列実行（M3） |
| `review` | パケット生成の入力パス、diff の上限 | M2 |
| `history` | 保存先 | M4 |
| JSON Schema | zod から生成して `schema/` に同梱 | エディタでの検証・補完 |

これらは仕様確定前に ADR を追加する。
