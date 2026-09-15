# ADR-0008: 依存パッケージは最小限・バージョン固定とする

- 状態: 採用
- 日付: 2026-09-15

## 文脈
Quality Gate のツール自身が多数の依存を持つと、Dependency Scan で自分が引っかかり、
サプライチェーンの攻撃面も増える。

## 決定
- 実行時依存は 3 つに限定する: `commander`（CLI）、`jsonc-parser`（設定読込）、`zod`（スキーマ検証）
- 子プロセス、ファイル、git 情報取得は Node 標準 API のみで実装する
- `package.json` は `~`（パッチのみ）で固定し、`package-lock.json` を管理する
- 依存の追加は停止ポイントで承認された一覧の範囲だけ。追加が必要になったら停止して報告する
- `npm audit --audit-level=high` を自己 verify の必須 check にする

## 根拠
- 上記 3 つはいずれも自身の依存が 0 で、広く使われている
- `execa` / `tsx` / `yaml` 等は Node 標準や採用済み形式で代替できる

## 代替案
- 依存ゼロ（`util.parseArgs` + 自前 JSONC + 自前検証）: 可能だが、サブコマンドが増える M2 以降で
  CLI と検証の自前実装が負債になる

## 影響
- `npm audit` はレジストリへの通信を伴う。オフラインでは FAIL になる（fail closed）
