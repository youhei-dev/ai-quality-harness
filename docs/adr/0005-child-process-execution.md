# ADR-0005: チェックは shell 経由・プロセスグループ管理で実行する

- 状態: 採用
- 日付: 2026-09-15

## 文脈
check の `command` は `npm run lint`、`.venv/bin/python -m pytest -q`、将来はパイプや `&&` を含む可能性がある。
タイムアウト時に子プロセスだけを kill すると、`npm run` が起動した孫プロセス（eslint 本体等）が取り残される。

## 決定
- `child_process.spawn(command, { shell: true, cwd, detached: true, env: process.env })` で実行する
- タイムアウト時は `process.kill(-pid, "SIGTERM")` でプロセスグループごと終了させ、猶予（5 秒）後も生存していれば `SIGKILL`
- stdout / stderr は `pipe` で取得し、メモリ上限（既定 10MB / ストリーム）を超えた分は先頭を捨てて末尾を保持する
- 標準入力は `ignore`（対話待ちで固まるのを防ぐ）
- `command` は設定ファイルの作者が書く**信頼データ**として扱う。`package.json` の scripts と同じ信頼レベルであり、
  設定ファイルは git 管理下でレビューされる前提
- `cwd` はプロジェクトルート内に制限する（`..` や絶対パスでルート外を指す設定は読込時エラー）
- 環境変数は親から継承するのみ。設定からの注入は M0 では行わない（M1 で名前の許可リスト方式を検討）
- Windows はプロセスグループの挙動が異なるため M0 では未対応（macOS / Linux を対象）

## 根拠
- shell を使わない `execFile` 方式は引数分割を設定側に強いる（`command: ["npm", "run", "lint"]`）。
  パイプや環境変数展開も使えず、Python 系の `.venv/bin/python -m pytest` のような書き方の利便性が落ちる
- 信頼境界は「設定ファイルを書けるか」であり、これは既にリポジトリへの書込権限と同じ

## 代替案
- `execa`: プロセスグループ kill やタイムアウトを内蔵するが、依存を増やす。Node 標準で十分に実装できる
- 配列形式のみ許容: 安全性は同じ（設定作者は既に信頼されている）で利便性だけが落ちる。
  M1 で `args` 配列形式を**追加**する余地は残す

## 影響
- 実装は `src/runner/execute.ts` に閉じる
- テストは `node -e` を使った終了コード / タイムアウト / 出力取得で固定する
