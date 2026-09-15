# ADR-0006: 出力の秘密情報はパターンマスクし、値を保存しない

- 状態: 採用
- 日付: 2026-09-15

## 文脈
check の stdout / stderr には、誤ってログに出た API キーや `.env` の内容が混ざる可能性がある。
レポートは `artifacts/` に保存され、M3 では CI の artifact としてアップロードされる。

## 決定
- レポートオブジェクトの**全ての文字列値**を深い走査でマスク関数に通してから保存・表示する
  （個別フィールドの指定漏れを防ぐ）
- マスクはパターンベース。検出した値は `[REDACTED:<分類>]` に置換し、元の値はどこにも保存しない
- 分類と代表パターン（独立レビュー R1 の R-001 / R-002 / R-003 を反映済み）:

| 分類 | パターン（要約） |
|---|---|
| `private-key` | `-----BEGIN ... PRIVATE KEY-----` 〜 `-----END ... PRIVATE KEY-----` ブロック |
| `anthropic` | `sk-ant-` で始まる英数記号列 |
| `openai` | `sk-` で始まる英数記号列（`sk-ant-` 判定の後） |
| `aws` | `AKIA` / `ASIA` + 英数 16 桁 |
| `github` | `ghp_` `gho_` `ghu_` `ghs_` `ghr_` `github_pat_` で始まる列 |
| `slack` | `xox[abpors]-` で始まる列 |
| `google` | `AIza` + 35 文字 |
| `gitlab` | `glpat-` で始まる列 |
| `jwt` | `eyJ` で始まる 3 セグメントの base64url |
| `bearer` | `Bearer <token>`（scheme は大文字小文字を区別しない。token は 16 文字以上） |
| `basic` | `Basic <base64>`（scheme は大文字小文字を区別しない。base64 をデコードして `user:password` 形式のときだけマスク。短い資格情報も対象） |
| `url-credential` | `scheme://user:password@host` の `user:password` 部分 |
| `key-value` | `password` `passwd` `secret` `token` `api_key` `apikey` `access_key` `secret_key` `client_secret` `session_token` 等のキーに続く `=` / `:` の値部分（キーは残す）。`AWS_SECRET_ACCESS_KEY` `MY_API_KEY` のようにキー名が識別子の末尾にある場合も対象。引用符付きの値は閉じ引用符まで（空白を含めて）マスク |

- マスク関数は純粋関数で、冪等（2 回適用しても結果が変わらない）
- 誤検出（例: `token: null`、テスト用のダミー値）は許容する。**取りこぼしより誤検出を選ぶ**

## 根拠
- エントロピー検出（高エントロピー文字列を一律マスク）は git commit hash やビルド hash を潰し、レポートの有用性を損なう
- 分類付きで残すことで「何が漏れかけたか」を人間がレポートから追える

## 代替案
- 外部の秘密検出ツール（gitleaks 等）: それは Security Scan の役割（M1 アダプタ）。レポート保存時の最終防衛線は自前で持つ

## 影響
- パターン追加はテスト追加とセット
- マスクは最終防衛線であり、秘密を出力するコマンドを設定に書かないことが第一
