# ADR-0011: アダプタは「検出＋推奨＋任意パーサ」に限定し、`init` の書込は別フラグに分ける

- 状態: 採用
- 日付: 2026-09-18

## 文脈
M1 でアダプタと `aiqh init` を加えるにあたり、M0 の性質（実行経路 1 本、fail closed、判定と文言の 1 対 1）を壊さない
責務境界が必要。対象リポジトリへの書込は最小限にしたい。

## 決定
- アダプタ（`src/adapters/`）は `detect(ctx: RepoContext): Detection | null` だけを持つ。**コマンドを実行しない・verify の判定に関与しない・ファイルへ書かない**。`RepoContext` は読み取り専用で、`.env*` は存在確認のみ（内容は読まない）
- `Detection` は available（推奨 `Suggestion`）/ unavailable（理由と有効化の案内 `enableHint`）を返す。アダプタが対象外なら null（例: Python アダプタが Node リポジトリを見た）
- 分類ごとの採用はアダプタの並び順（既存 scripts の再利用 > 設定ファイル検出 > 汎用）。代替は監査表に表示する
- 出力パーサは `OutputParser` の型だけ定義（M1）。実装は M2 のレポート構造化と一緒に行う
- `aiqh init` の書込境界: 既定は表示のみ。`--write` は `aiqh.config.jsonc` 1 ファイルのみ（既存があれば exit 2、`--force` で上書き）。`.gitignore` の `artifacts/` と `package.json` の scripts は**別フラグ**（`--write-gitignore` / `--write-scripts`）でのみ書き、scripts は未定義キーだけ追加する
- 検出 0 件では config を書かない（常に PASS する設定を作らない。ADR-0004 と同じ fail closed）
- 本体への `init` が既存の `aiqh.config.jsonc` と同等の提案を出すことをテストで固定する

## 代替案
- アダプタに実行を持たせる（アダプタごとの実行経路）: fail closed の保証点が増え、M0 の性質を崩す
- `init` が一括で全部書く: 対象リポジトリの規約（scripts の権限方針等）と衝突する

## 影響
- verify は M1 以降も設定に書かれた command だけを実行する。アダプタの追加は verify に影響しない
