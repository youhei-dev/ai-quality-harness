# ai-quality-harness (`aiqh`)

AI 駆動開発のための **fail-closed な Quality Gate 実行基盤**。

Claude Code などの実装 AI と、独立したレビュー AI の両方が「問題ありません」と言っても、
それだけでは合格にしません。Lint / 型チェック / ユニットテスト / ビルド / セキュリティスキャン /
依存関係スキャン / E2E といった **機械的に再現可能な結果** だけを判定の根拠にし、
必須チェックが 1 つでも失敗すれば `VERIFY FAILED`（終了コード非ゼロ）で止めます。

> **English summary** — `aiqh` is a small TypeScript CLI that runs a repository's quality checks
> from a single JSONC config, fails closed (any required failure ⇒ non-zero exit), writes JSON +
> Markdown reports with secret masking, and is designed to be applied to itself first.
> Only milestone 0 (the `verify` core) is implemented so far; see `docs/ROADMAP.md`.

## 設計思想

```
人間 → 実装AI → 独立レビューAI → 自動 Quality Gate（aiqh verify） → 人間の業務確認 → 本番
```

- **機械的根拠**: AI の回答は判定材料にしない。テスト・型・静的解析・ビルド・スキャンの結果だけを使う
- **fail closed**: 必須チェックの失敗・タイムアウト・起動失敗・設定不正はすべて非ゼロ終了
- **自己適用**: このリポジトリ自身が最初の適用対象。自分の verify を通せない状態でマイルストーンを終えない
- **設定に秘密を置けない**: 設定はコマンドと構造化フィールドのみ。レポートはパターンマスクを通してから保存

詳細は `docs/ARCHITECTURE.md`、判断の根拠は `docs/adr/` を参照してください。

## 現在の状態

**M2-2 進行中（v0.5.6: 自己 verify の不安定なテスト〈unit-minpath〉を、事象の順を観測で決める形に直した。その調査で見つけた runner の不具合〈中断の後の猶予の間にタイムアウトの時刻が来ると `timedOut` が true になる。M2-2-FLAKE-001〉を修正。バックログは 1 を外し、R4 の 2 件は 1・2 になった。v0.5.5: M2-2 独立レビュー R4 は High 0 / Medium 2。出力の出口の強化〈v0.5.2〜v0.5.4〉をここで区切り、Medium 2 件と構造ガードの既知の限界はバックログの 2・3 へ。リリースの検証で見つかった不安定なテスト〈unit-minpath〉はバックログの先頭へ〈docs だけの版〉。v0.5.4: M2-2 独立レビュー R3 の Medium 3 件を修正。端末への 1 回の書き出しを 1 行にし〈LF・TAB も表記〉、複数行はコマンド自身の書式だけを block で書く。JSON のキーも表記・mask にし、端末に書くのは 2 つの基本関数だけにした〈[ADR-0017](docs/adr/0017-output-lines-blocks-keys-guard.md)〉。v0.5.3: M2-2 独立レビュー R3 は High 0 / Medium 3。M2-1 からの持ち越し作業〈v0.5.0〜v0.5.2〉をここで区切り、Medium 3 件はバックログへ〈docs だけの版〉。v0.5.2: M2-2 独立レビュー R2 を反映。すべてのコマンドの端末への出力を 1 つの出口に通し、制御・区切り・双方向制御文字を表記にしてから秘密の形をマスクする〈R2-001、[ADR-0016](docs/adr/0016-output-boundary.md)〉。v0.5.1: M2-2 独立レビュー R1 を反映。読めない `latest.json` と既定の設定ファイルを「無い」として扱わない〈R1-007 を High として修正〉、`--range` に finding があっても範囲に依存しない検査を行う〈R1-001〉。v0.5.0: M2-1 独立レビュー R3 の Medium 5 件を修正。終了コードの優先順位は [ADR-0015](docs/adr/0015-review-packet-exit-priority.md)、自己 verify は 8 チェック）**。M2-1 は完了（`aiqh review-packet`: 完了ベースライン `v0.4.3`、完了記録 `v0.4.4`。独立レビュー R1〜R4 を反映し、R3 の Medium 5 件は M2-2 の先頭として v0.5.0 で修正。仕様は [ADR-0014](docs/adr/0014-review-packet.md)、総括は [`docs/reports/M2-1_COMPLETION.md`](docs/reports/M2-1_COMPLETION.md)）。M2-0「スキャナ保守」は完了（完了ベースライン `v0.3.3`、記録タグ `v0.3.4`。独立レビュー R1〜R3 を反映し、R4 の 1 件は M2-1 以降へ持ち越し。[`docs/reports/M2-0_COMPLETION.md`](docs/reports/M2-0_COMPLETION.md)）。v0.3.5 で不安定テストを修正し、バックログの順序を review-packet 優先に変更した（「窓走査は正規表現の境界の文脈を保つ」はその後）。M1（完了ベースライン `v0.2.2`、記録タグ `v0.2.3`）では`aiqh verify` の中核（M0、独立レビュー 7 ラウンドを反映した最終版 v0.1.7）に加えて、
チェックアダプタ、`aiqh init`、内蔵の `aiqh security-scan` を実装し、Node 系と Python 系の対象リポジトリに適用済みです。
M1 の独立レビュー R1（10 件、High 3）を v0.2.1、R2（5 件、High 1）を v0.2.2 で反映し、R3（5 件、High 0）は M2-0 へ持ち越しました。
各タグの内容は [`CHANGELOG.md`](CHANGELOG.md)、M0 の総括は [`docs/reports/M0_COMPLETION.md`](docs/reports/M0_COMPLETION.md)、
M1 の総括は [`docs/reports/M1_COMPLETION.md`](docs/reports/M1_COMPLETION.md)（経緯は [`docs/reports/M1_REPORT.md`](docs/reports/M1_REPORT.md)）を参照してください。
**v0.1.3 と v0.2.0 は superseded**（v0.1.3: 確定点の yield が不十分。v0.2.0: 自己 verify の security チェックが FAIL する状態でタグ付けされた）で、
それぞれ v0.1.4 以降 / v0.2.1 以降を使ってください。

| 機能 | 状態 |
|---|---|
| `aiqh verify`（設定読込・順次実行・fail closed・JSON/Markdown レポート・秘密情報マスク） | M0 実装済み |
| チェックアダプタ（lint / typecheck / unit / build / security / dependency / e2e の検出と推奨設定） | M1 実装済み |
| `aiqh init`（対象リポジトリの監査と設定生成） | M1 実装済み |
| `aiqh security-scan`（内蔵。masker とパターン共有） | M1 実装済み |
| Security Scan の保守（候補の持ち越し、追跡済み `.gitignore`、実生成物のプローブ、`security.allow`、key-value 走査、設定化） | M2-0 実装済み |
| `aiqh review-packet`（commit 範囲から独立レビュー用パケットを生成。全文・差分・検査内蔵・ZIP） | v0.5.6（M2-2: 独立レビュー R1〜R4 を反映〈R3 の 3 件は v0.5.4。R4 の Medium 2 件はバックログ〉。v0.5.0 で M2-1 R3 の Medium 5 件を修正。M2-1 完了は完了ベースライン v0.4.3、記録 v0.4.4） |
| `aiqh review-import`（レビュー指摘の構造化）と再修正ループ | M2-2 以降予定 |
| GitHub Actions 再利用ワークフロー | M3 予定 |
| 履歴 DB・ローカルダッシュボード | M4 予定 |

## 必要環境

- Node.js 24 以上（開発時はネイティブ TypeScript 実行を使うため）
- 自己 verify の `package` チェック（配布 smoke test）は `npm pack` した tarball を一時ディレクトリへ
  `npm install --prefer-offline` するため、実行時依存 3 つ（commander / jsonc-parser / zod）が **npm キャッシュにあるか、
  レジストリへ到達できる**必要があります。オフラインかつキャッシュなしの環境ではこのチェックは FAIL になります
  （fail closed）。`npm audit` も同様にレジストリへの到達が必要です

## 対応プラットフォーム（Supported Platforms）

| プラットフォーム | 状態 |
|---|---|
| macOS（POSIX） | 対応。M0 の検証環境 |
| Linux（POSIX） | 対応（設計上）。CI での検証は M3 で追加 |
| Windows | M0 対象外。プロセスグループ制御と realpath 判定が POSIX 前提のため |

## 信頼境界（Trust Boundary）

`aiqh.config.jsonc` は**リポジトリ所有者が管理する信頼された入力**です。設定に書いたコマンドはそのまま
shell で実行されます（`package.json` の scripts と同じ信頼レベル）。aiqh が保証する fail closed は
「現在読み込んだ設定に対して」のものであり、**改変された設定や弱体化されたスクリプトに対する独立性は
提供しません**。設定ファイルの変更はコードレビューと Branch Protection で守ってください。
設定改変への対策候補は `docs/ROADMAP.md`（M3 / M4）を参照してください。

`aiqh review-packet` の出力について: aiqh の実行中に、出力先（`-o`・`--zip-output`）とその親ディレクトリを他のプロセスや利用者が同時に変更しないこと。パケットと ZIP が同じファイルにならないことはファイルシステムの同一性（`dev`+`ino`）で確かめますが、
その確認は書き込みの確定の直前の時点のもので、それ以降に他者が出力先を差し替える場合は防げません（ADR-0014）。

## 使い方

### このリポジトリ自身を検証する

```bash
# 依存関係の導入
npm install

# 自己 verify（src/ を Node のネイティブ TypeScript 実行で直接起動）
npm run verify

# ビルド済み JS（配布物）で同じことを行う
npm run verify:dist
```

結果は `artifacts/verification/` に出力されます（git 管理外）。

```
artifacts/verification/
  latest.json            # 機械可読（schemaVersion 1）
  latest.md              # 人間・レビューAI 向け
  history/<UTC timestamp>.json
```

### 対象リポジトリで使う（M1: `npm link` によるローカル配布）

```bash
# 本体で 1 回: ビルドしてグローバルにリンク（~/.local/bin/aiqh -> dist/cli.js）
cd ~/claude-projects/ai-quality-harness && npm run build && npm link

# 対象リポジトリで: 読み取り監査と設定案の表示（何も書かない）
aiqh init

# 承認したら書き込む（config のみ。既存があれば --force なしでは拒否）
aiqh init --write
# 追加で .gitignore に artifacts/、package.json に "verify": "aiqh verify" を入れる場合
aiqh init --write --write-gitignore --write-scripts

# 検証と、内蔵の秘密情報スキャン単体
aiqh verify
aiqh security-scan
```

`aiqh init` は `aiqh` を PATH のどこから解決したか（リンク先と version）を表示します。生成される `aiqh.config.jsonc` の例：

```jsonc
{
  "version": 1,
  "project": { "name": "my-app", "type": "node" },
  "defaults": { "timeoutSec": 600 },
  "checks": [
    { "name": "lint",       "kind": "lint",       "command": "npm run lint" },
    { "name": "typecheck",  "kind": "typecheck",  "command": "npx --no-install tsc --noEmit" },
    { "name": "unit",       "kind": "unit",       "command": "npm test" },
    { "name": "build",      "kind": "build",      "command": "npm run build", "timeoutSec": 900 },
    { "name": "dependency", "kind": "dependency", "command": "npm audit --audit-level=high" }
    // security / e2e を登録しなければ NOT_APPLICABLE として報告される
  ]
}
```

仕様は `docs/CONFIG_SPEC.md`、配布方針は `docs/adr/0009-distribution-npm-link.md` を参照してください。

- `aiqh init` はツールの設定ファイルだけでは check を提案しません。ローカルに依存（`package.json` の dependencies /
  devDependencies、または `node_modules/.bin`）がある場合だけ提案し、直接実行は `npx --no-install <tool>` の形にして
  ネットワーク取得を起こしません。監査表・設定案・`--json` には package.json のスクリプト本文を出しません
- `aiqh init --write` は生成した設定を `aiqh verify` と同じ検証に通し、通らない設定（必須チェック 0 件等）は書きません。
  `--write-gitignore` / `--write-scripts` の失敗は exit 2 で報告されますが、他の書込は取り消されません（`git status` で確認）
- Security Scan は git 追跡ファイルに加えて、未追跡で ignore されないファイルも走査します（サイズ上限なし。1 行が 256 KiB を
  超えるファイルは窓走査でメモリを抑えます）。未追跡で ignore されていない `.env*` は中身を読まずに finding にします。複数行の
  PEM 秘密鍵は開始行–終了行で報告し、`.gitignore` の判定は `git check-ignore` に委ねます（否定ルールを考慮）。
  検出結果に値は含めません（分類・パス・行番号のみ）
- `aiqh init` の `artifacts/` 提案も `git check-ignore` で判定します。git リポジトリでない場合は常に追加を提案し、
  `--write-gitignore` は同じ行を二度追記しません
- 同梱の JSON Schema は構造の検証・補完用です。チェック名の一意性や必須チェック 1 件以上といった横断規則は `aiqh` が
  実行時に検証します（エディタで valid でも `aiqh` が拒否することがあります）
- `security.allow`（M2-0）で秘密の形の finding を理由つきで許容できます（`path` glob、`category`、`line`、必須の `reason`、任意の `expires`）。
  抑制した finding は件数と一覧が必ず出力され、未使用・期限切れの規則は警告されます。`.env` や `.gitignore` の衛生 finding は抑制できません。
  key-value 分類（`password=…` 等）も走査しますが、値が秘密らしい場合だけ finding になります（英字のみのパスフレーズは検出できません）

## CLI

```
aiqh verify [options]
  -c, --config <path>      設定ファイル（既定: ./aiqh.config.jsonc）
      --cwd <dir>          設定ファイルを探す基準ディレクトリ
  -o, --output-dir <dir>   レポート出力先の上書き
      --fail-fast          必須チェックの最初の失敗で停止（以降は SKIPPED）
  -v, --verbose            失敗チェックの出力を全文表示

aiqh init [--cwd <dir>] [--write] [--force] [--write-gitignore] [--write-scripts] [--json]
aiqh security-scan [--cwd <dir>] [--json]

aiqh review-packet --range <from>..<to> [options]
      --label <name>         タイトルとファイル名（a-z 0-9 . -。既定: <to> の先頭 12 桁）
  -o, --output <file>        既定: <repo>/artifacts/ai-review/review-packet-<label>.md
      --zip                  パケットだけを含む ZIP（無圧縮）も書く / --zip-output <file> で場所を指定
      --request <file|->     人間が書いた依頼文（そのまま載せる。- は標準入力）
      --review <file>        前回レビューの原文（複数可）
      --doc <path>           <to> 時点の全文を載せるリポジトリ内の文書（複数可）
      --exclude <glob>       全文・差分から除く（一覧には excluded として残る。複数可）
      --max-file-bytes <n>   1 ファイルの上限（既定 524288。超えると exit 2）
      --max-packet-bytes <n> パケット全体の上限（既定 4194304。超えると exit 2）
  -c, --config <path>        security セクション（security.allow）を読む設定ファイル
      --json                 結果を JSON で出力
```

相対パス（`--request` / `--review` / `--config` / `-o` / `--zip-output`）は `--cwd` のディレクトリ（省略時はカレント）を基準に解決します。
`--config` を省略したときは `--cwd` のディレクトリの `aiqh.config.jsonc` を読み、無ければ既定値、あるのに読めない・不正なら `2` です（`aiqh security-scan` も同じ。v0.5.1）。
`aiqh review-packet` の終了コード: `0` = 書いた、`1` = 不正な UTF-8・生の制御 / 区切り / 双方向制御文字・秘密の形のいずれかを検出（何も書かない。
値は表示しない）、`2` = 使い方・設定・検査不能（読めない入力、作業ツリー外、git の失敗など）・上限・書込のエラー。検査そのものができないときは finding があっても
`2` で、それまでの finding を「検査が完了していないため不完全」と明記して出します。上限超過など検査を妨げないエラーは finding が無いときだけ `2` です（ADR-0015）。
`<from>` は `<to>` の祖先であること。lock ファイルは既定で全文・差分を載せない（ADR-0014）。

終了コード（最終行の文言と 1 対 1）: `0` = `VERIFY PASSED`、`1` = `VERIFY FAILED`、`2` = `VERIFY ERROR`（設定エラー・レポート書込エラー・内部エラー）。

## 開発

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build       # tsc → dist/
```

`npm run verify` は上記に `npm run test:minpath`（PATH を node と git の symlink だけにした全テスト）、
`npm run smoke:package`（配布 smoke test）、`npm run security`（内蔵スキャン）、`npm audit --audit-level=high` を加えた 8 つを順に実行します。
`test:minpath` が保証するのは、**PATH の名前解決で起動する、テストが宣言していないコマンドを検出する**ことだけです（v0.5.1 で記述を訂正。M2-2-R1-005・006）。
絶対パスでの起動は防ぎません。子プロセスの環境変数は PATH 以外を引き継ぎます。単独で実行してシグナルを受けたときに止めるのは vitest の直接の子プロセスだけで、
自己 verify の中では runner がプロセスグループごと止めます。

```bash
# 配布 smoke test 単体（npm pack → 一時ディレクトリへ install → npx --no-install aiqh verify）
npm run smoke:package
```

Ctrl+C（SIGINT）/ SIGTERM で中断すると、実行中のチェックのプロセスグループへ SIGTERM → 最大 5 秒 → SIGKILL の順で
後始末してから、それぞれ終了コード 130 / 143 で終了します。

## リポジトリ構成

```
src/                 CLI 本体（TypeScript, ESM）
tests/               Vitest（ユニット + CLI 結合テスト）
docs/                ARCHITECTURE / ROADMAP / CONFIG_SPEC / adr / reports
aiqh.config.jsonc    このリポジトリ自身の検証設定
artifacts/           verify 出力・レビューパケット（git 管理外）
```

## ライセンス

未定（Public 化の際に決定します）。
