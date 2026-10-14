# ADR-0011: アダプタは「検出＋推奨＋任意パーサ」に限定し、`init` の書込は別フラグに分ける

- 状態: 採用（「出力パーサは `OutputParser` の型だけ定義」は ADR-0028〈v0.8.0〉で置換: パーサは `src/parse/` に置き、verify が check の出力を表示のためだけに読む。アダプタは検出と推奨のまま。M1 の下書きの型は消した）
- 日付: 2026-09-18。追記: 2026-10-14（v0.8.0。状態の行だけ）

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

## 改訂（v0.2.1、M1 独立レビュー R1）
- **ローカル証拠と `npx --no-install`**（M1-R1-007）: 設定ファイルの存在だけでは available にしない。`NodeContext.hasLocalTool(package, bin)`
  （dependencies / devDependencies に名前がある、または実行可能な `node_modules/.bin/<bin>` がある）を必須とし、証拠が無ければ unavailable
  と導入案内を返す。既存 scripts があればそれを推奨し、無い場合の直接実行は `npx --no-install <tool> …` にしてネットワーク取得を起こさない
  （npm 11 で受理を確認）
- **Detection にスクリプト本文を入れない**（M1-R1-003）: `reason` は「`package.json scripts.lint found`」のような存在の記述だけにする。
  本文は秘密を含み得て、`init` の console / `--json` / 生成 config のコメントへ複製されるため。多層防御として `init` の全出力を `maskSecrets`、
  `--json` を `maskDeep`、生成 config のコメント（reason / note / hint）を `maskSecrets` に通す
- **書込前の実行時検証**（M1-R1-006）: `--write` は生成した JSONC を `parseConfigText` → `resolveConfig`（verify と同じ）に通し、通らなければ
  何も書かずに exit 2。required 0 件（Playwright のみ等）を書けた欠陥の修正
- **任意書込の例外処理**（M1-R1-010）: `--write-gitignore` / `--write-scripts` の read / parse / write を try/catch し、
  `aiqh init: failed to update <file>: …` と exit 2 を返す。書込は独立で、部分更新が起き得ることを CONFIG_SPEC §5.3c に明記
- **Python の前提確認**（M1-R1-009）: `venvBin()` は POSIX で `accessSync(X_OK)` により実行権限を確認する。Playwright アダプタは推奨コマンドが
  pytest を実行するため、`pytest` の存在も必須にする

## 改訂（v0.2.2、M1 独立レビュー R2）
- **venv の interpreter 自体も実行可能であること**（M1-R2-003、R1-009 の残り）: venv の検出を「`<venv>/bin/python` が実行可能」基準にし、
  `PythonContext.python`（実行可能な interpreter の相対パス）を全 Python アダプタが使う。python が非実行なら venv なしとして扱い、どのアダプタも
  available にならない
- **`artifacts/` 提案の判定を Git に委ねる**（M1-R2-005）: 行一致では `artifacts/` + `!artifacts/` の否定を見ない。Security Scan の
  `gitIgnoredByRepoRules()` を共用し、代表パス `artifacts/.aiqh-ignore-probe` が ignore されるかで決める。git リポジトリでない・git が失敗した場合は
  安全側に「追加を提案」し、`--write-gitignore` は同じ行が既にあれば追記しない（冪等）
