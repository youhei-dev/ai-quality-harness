# ai-quality-harness (`aiqh`)

[![ci](https://github.com/youhei-dev/ai-quality-harness/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/youhei-dev/ai-quality-harness/actions/workflows/ci.yml)

AI 駆動開発のための **fail-closed な Quality Gate 実行基盤**。

Claude Code などの実装 AI と、独立したレビュー AI の両方が「問題ありません」と言っても、
それだけでは合格にしません。Lint / 型チェック / ユニットテスト / ビルド / セキュリティスキャン /
依存関係スキャン / E2E といった **機械的に再現可能な結果** だけを判定の根拠にし、
必須チェックが 1 つでも失敗すれば `VERIFY FAILED`（終了コード非ゼロ）で止めます。

**aiqh がすること**
- 対象リポジトリの設定ファイル 1 つ（`aiqh.config.jsonc`）に書いたチェックを順に実行し、必須のどれかが失敗・タイムアウト・起動失敗なら非ゼロで終える（`aiqh verify`）
- JSON（機械向け）と Markdown（人・レビュー AI 向け）のレポートを、秘密の形をマスクしてから書く
- 対象リポジトリの読み取りだけの監査と設定の案（`aiqh init`）、内蔵の秘密情報スキャン（`aiqh security-scan`）
- 独立レビューのためのパケットの作成（`aiqh review-packet`）と、レビューの指摘の取り込み・状態の検査（`aiqh review-import`・`aiqh review-check`）

**aiqh がしないこと**
- AI の回答（実装 AI の「直した」、レビュー AI の「問題ない」）を合否の根拠にしない
- 設定に書いたコマンドを隔離しない（そのまま shell で実行する。設定はリポジトリ所有者の信頼された入力。下の「信頼境界」）
- 対象リポジトリにツールを勝手に入れない。コードを直さない
- verify の結果を外部のサービスへ送らない
- Windows は対象外（POSIX 前提。下の「対応プラットフォーム」）。npm には公開していない（配布は手元の `npm link` と、CI の再利用ワークフロー `verify.yml`。ADR-0031）

> **English summary** — `aiqh` is a small TypeScript CLI (Node 24+) that runs a repository's quality checks
> (lint, typecheck, unit tests, build, security scan, dependency audit, …) from a single JSONC config and
> fails closed: any required check that fails, times out or cannot start gives a non-zero exit. It writes
> JSON and Markdown reports with secret-shaped strings masked, and it never treats an AI's "looks good" as
> evidence. Besides `verify` it has `init` (a read-only audit that proposes a config), a built-in
> `security-scan`, and commands for an independent review loop (`review-packet`, `review-import`,
> `review-check`). It is applied to itself first; milestones M0 to M2 are done (see `docs/ROADMAP.md`).
> It does not sandbox the configured commands (the config is trusted input), install tools, fix code,
> send results anywhere, or support Windows. It is not published on npm (local `npm link`; in CI, a reusable GitHub Actions workflow pinned by commit SHA). License: MIT.

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

**v0.13.1 — 実装の独立レビュー item48-impl R1 の Low 2 件の直し**（`aiqh security-scan` が、index の未マージのパス〈同じパスの stage 1・2・3〉を 1 回だけ扱う。判定は変わらず、件数の重なりだけを直した。item48-design の文書の指摘 3 件の `fixedIn` を、文書を直した commit に訂正した。実装の独立レビュー item48-impl は R1 で閉じた）。v0.13.0 で、security の check が、生の双方向の制御文字と行区切りを見つけるようにした（判定が厳しくなる変更。`aiqh security-scan` が、追跡しているファイルと未追跡で ignore されないファイルの中身とパス名にある U+202A–U+202E・U+2066–U+2069・U+2028・U+2029 を finding にする。外せるのは分類〈`bidi-control`・`line-separator`〉を明示した `security.allow` の規則だけ。検出が効くのは、実際に起動する `aiqh security-scan` が v0.13.0 以降のとき〈下の「版を上げるとき」〉。ADR-0036。ROADMAP の項目 48）。v0.12.1 で、M4 の運用テンプレートと、ダッシュボードの見出しの寄せを入れた（`docs/ops/` に、適用先で aiqh を前の版に戻す手順〈`rollback.md`〉・見張る項目〈`monitoring.md`〉・品質ポリシー〈設定〉の変更の手順〈`policy-change.md`〉。ダッシュボードの文字の値の列の見出しを、値と同じ左寄せにした。実装の独立レビュー m4-dashboard R1 は指摘なし）。v0.12.0 で、静的 HTML のダッシュボード `aiqh history --html` を入れた（verify の履歴の集計を、script も外の資源も無い 1 つの HTML ファイルにする。CSP の meta、値はすべてマスクと表記と参照を通し、数は `--json` と照合できる `data-k` を持つ。ADR-0035）。v0.11.2 で、出力の上限 32 MiB を、標準出力に実際に書く全部のバイト〈表の最後の行と、`--json` の改行を含む〉に当てた（実装の独立レビュー m4-history R1 の M4-H-R1-001。ADR-0034 の H）。v0.11.1 で、テストのソースの生の文字を直し、再発を防ぐテストを足した（テストのソース 2 行の生の双方向の制御文字〈U+202E〉と行区切り〈U+2028・U+2029〉を、数から組み立てる形に直した。追跡しているすべてのファイルに生の文字が無いことを確かめるテストを足した。verify の security の check がこの文字を見つけないことは ROADMAP の項目 48）。v0.11.0 で `aiqh history` を入れた（verify の履歴を、DB を持たずに読み取りだけで集計する。端末の表と `--json`。出すのは数・状態・名前だけで、パスは `#<番号>`。履歴は信頼しない入力として、読む量・名前の長さ・数の範囲・集計と出力の大きさに上限を置く。読めない履歴は一覧に出して終了コード 2。ADR-0034）。v0.10.1 で、設定の `timeoutSec` の上限（2,147,483 秒。Node.js のタイマーが待てる最長）を足した（ADR-0005 の注記）。v0.10.0 は M4 の最初の版で、設定のハッシュ `configSha256` を入れた（verify のレポート〈`latest.json`・`history/<ts>.json`〉の最上位に、設定ファイルのバイト列の SHA-256 を記録する。固定ではなく記録で、設定の外の変更〈scripts・テスト・依存など〉は表れない。`latest.md` と端末は変えない。ADR-0033。M4 の設計と独立レビュー R1・R2 の記録は `docs/reviews/m4-design/`）。v0.9.2 で本体の main を pull request 必須にした（必須チェックは `verify (ubuntu)` と `reusable (self) / aiqh verify`、merge commit だけ、Bypass なし。ADR-0032）。v0.9.1 で波 4 を締めた（個人のリポジトリ 2 つ〈`youhei-dev/trim-manager`・`youhei-dev/ai-tutor-browser`〉の CI に、再利用ワークフロー `verify.yml` を 40 桁の commit SHA で入れた記録）、v0.9.0 で再利用ワークフロー `verify.yml`（他のリポジトリの CI から 40 桁の commit SHA で固定して呼び、aiqh はワークフローと同じ commit のソースを使う〈配布物なし〉。自己適用の job `reusable (self)`。ADR-0031）、v0.8.4 で公開の後の設定（2026-10-16 に Public に切り替えた〈人間〉。main の ruleset〈削除と force push の禁止〉・description・topics。適用先は個人のリポジトリ 2 つ）、v0.8.3 で公開の準備（LICENSE〈MIT〉・`package.json` の `repository` など・README の見直し・プロジェクトの `CLAUDE.md` の追跡外。ADR-0030）。M2-2 は v0.8.2 で完了（完了ベースライン `v0.8.1`）。M0（`aiqh verify` の中核）・M1（チェックアダプタ・`aiqh init`・内蔵の `aiqh security-scan`。Node 系と Python 系の対象リポジトリに適用）・M2（独立レビューのループ: M2-0 スキャナ保守、M2-1 `aiqh review-packet`、M2-2 レビューの取り込みと検査・出力パーサ）を終え、M3（本体リポジトリの自己 CI と、ほかのリポジトリから呼ぶ再利用ワークフロー、main の pull request 必須）は 2026-10-17 に完了しました（完了ベースライン `v0.9.2`）。M4（履歴の集計・ローカルダッシュボード・運用テンプレート）は 2026-10-19 に完了しました（完了ベースライン `v0.12.1`）。v0.13.0 は M4 の後の最初の版です。v0.13.0 の実装の独立レビュー（item48-impl）は R1 で閉じ、その Low 2 件を v0.13.1 で直しました。次は、適用先の呼び出しの SHA を上げる作業です。
版ごとの内容は [`CHANGELOG.md`](CHANGELOG.md)、マイルストーンの進みと残りの項目は [`docs/ROADMAP.md`](docs/ROADMAP.md)、
マイルストーンごとの総括は `docs/reports/`（[M0](docs/reports/M0_COMPLETION.md)・[M1](docs/reports/M1_COMPLETION.md)・[M2-0](docs/reports/M2-0_COMPLETION.md)・[M2-1](docs/reports/M2-1_COMPLETION.md)・[M2-2](docs/reports/M2-2_COMPLETION.md)・[M3](docs/reports/M3_COMPLETION.md)・[M4](docs/reports/M4_COMPLETION.md)）を参照してください。
**v0.1.3 と v0.2.0 は superseded**（v0.1.3: 確定点の yield が不十分。v0.2.0: 自己 verify の security チェックが FAIL する状態でタグ付けされた）で、
それぞれ v0.1.4 以降 / v0.2.1 以降を使ってください。

| 機能 | 状態 |
|---|---|
| `aiqh verify`（設定読込・順次実行・fail closed・JSON/Markdown レポート・秘密情報マスク） | M0 実装済み |
| チェックアダプタ（lint / typecheck / unit / build / security / dependency / e2e の検出と推奨設定） | M1 実装済み |
| `aiqh init`（対象リポジトリの監査と設定生成） | M1 実装済み |
| `aiqh security-scan`（内蔵。masker とパターン共有） | M1 実装済み |
| Security Scan の保守（候補の持ち越し、追跡済み `.gitignore`、実生成物のプローブ、`security.allow`、key-value 走査、設定化） | M2-0 実装済み |
| Security Scan の生の文字（双方向の制御文字 U+202A–U+202E・U+2066–U+2069、行区切り U+2028・U+2029。中身とパス名。既定で FAIL、分類を明示した `security.allow` でだけ外せる） | v0.13.0（**判定が厳しくなる変更**。ROADMAP の項目 48。ADR-0036） |
| `aiqh review-packet`（commit 範囲から独立レビュー用パケットを生成。全文・差分・検査内蔵・ZIP） | v0.13.1（M2-1 で実装〈完了ベースライン v0.4.3〉、M2-2 で独立レビューの指摘を反映。経緯は CHANGELOG の各版） |
| `aiqh review-import`（レビュー指摘の構造化）と再修正ループ | v0.6.0 で取り込み（v1）を実装（ADR-0026）。v0.7.0 で状態の検査・前の回の評価の突き合わせ・ループ未完了の表示を `aiqh review-check`（v2、ADR-0027）、再修正ループの手順書（`docs/ops/review-loop.md`）。状態を変えるコマンドと `response-rN.md` の生成は v3（後）。M2-2 完了（v0.8.2） |
| 出力パーサ（vitest・eslint・npm audit の件数と失敗の名前、`aiqh security-scan` の oversized-candidate・`security.allow` の項目をレポートの `checks[].parsed` に。表示用） | v0.8.0（M2-2。判定と終了コードは変えない。pytest は後。ADR-0028。v0.8.1 で R1 の Medium 1 件を直した〈latest.md の名前の一覧をコードブロックに〉） |
| 本体リポジトリの自己 CI（GitHub Actions。Ubuntu の verify、Windows の手動の測定） | v0.5.45（M3 の前半。v0.6.1 から、タグの前に `verify (ubuntu)` の success を確かめる〈人の手順〉。v0.9.2 から、`verify (ubuntu)` と `reusable (self) / aiqh verify` は main の pull request の必須チェック〈ADR-0032〉。ADR-0025） |
| GitHub Actions 再利用ワークフロー（`.github/workflows/verify.yml`。他のリポジトリの CI から、40 桁の commit SHA で固定して呼ぶ） | v0.9.0（M3 の後半〈波 4〉。aiqh は自分と同じ commit のソースを使う〈配布物なし〉。ADR-0031。手順は `docs/ops/reusable-workflow.md`） |
| 設定のハッシュ（レポートの最上位の `configSha256`。設定ファイルのバイト列の SHA-256。記録であって固定ではない） | v0.10.0（M4。ADR-0033） |
| 履歴の集計（`aiqh history`。DB を持たず `history/*.json` を読み取りだけで集計。端末の表と `--json`） | v0.11.0（M4。ADR-0034） |
| ローカルダッシュボード（静的 HTML。`aiqh history --html`） | v0.12.0（M4。ADR-0035） |
| 運用テンプレート（適用先で前の版に戻す・見張る項目・品質ポリシー〈設定〉の変更の手順） | v0.12.1（M4。docs だけ。`docs/ops/rollback.md`・`docs/ops/monitoring.md`・`docs/ops/policy-change.md`） |

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
| Linux（POSIX） | 対応。v0.5.45 から自己 CI（Ubuntu 24.04）で verify を走らせている（v0.9.2 から main の pull request の必須チェック） |
| Windows | M0 対象外。プロセスグループ制御と realpath 判定が POSIX 前提のため（v0.5.45 の CI の手動の測定では、8 チェックのうち 3 つが FAIL。ROADMAP の M3） |

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

`latest.json` と `latest.md` を組で読むとき（v0.13.2。ROADMAP の項目 47。既知の限界として受け入れ、直していない）:

- 1 回の verify は、`latest.json` の `startedAt`、`latest.md` の `| Started | … |`、その run の `history/` のファイルの `startedAt` に、同じ文字列を書く
- 各ファイルは入れ替え（rename）で書くので、半分だけのファイルは見えない。ただし組は、同じ出力のディレクトリに並行して書く verify があると、別の run のものになりうる（`latest.md` の書き込みだけが失敗した run の後も同じ）
- 2 つの `startedAt` が**違えば、確実に別の run**。**同じでも、同じ run の保証はない**（`startedAt` はミリ秒までの時刻で、同じミリ秒に始めた別の run は同じ値を持てる。run の一意の名前は無い）
- 食い違ったら: (a) その出力のディレクトリに書く verify が走っていないことを確かめて、読み直す。(b) まだ食い違うなら、`latest.md` を使わず、run ごとの記録 `history/<stamp>.json` を使う（名前は `startedAt` の秒までで、同じ秒の別の run は `-2` などが付く。同じ `startedAt` の history が 2 つ以上あれば、どれが `latest.json` の run かは決められない）。(c) 組が要るなら、並行の無い状態で verify をやり直す（確実なのはこれだけ）
- リポジトリの中の読み手は組で読まない（review-packet は `latest.json` だけ、再利用ワークフローの Job Summary は `latest.md` だけ、`aiqh history` は `history/` だけ）。この約束は外の読み手（人・別の道具）のためのもの。固定しているテスト: `tests/regression-item47-latest-pair-started-at.test.ts`・`tests/regression-item47-latest-pair-race.test.ts`

v0.8.0 から、check の出力を aiqh が読めるときは、件数と失敗の名前が `latest.json` の `checks[].parsed`、`latest.md` の「Parsed Output」、端末の `parsed:` の行に出ます（vitest・eslint・npm audit・`aiqh security-scan`）。
**表示のためだけで、判定と終了コードには使いません**（ADR-0028）。どのパーサを使うかは、コマンド（`npm run <script>` / `npm test` なら作業ディレクトリの package.json の script）から aiqh が決めます。設定の欄はなく、コマンドは書き換えません。
合うパーサが無い check は `not-applicable` で、端末の出力も今までと同じです。
latest.md の名前の一覧はコードブロックの中に、失敗の詳細の Summary は行内のコードとして書きます（v0.8.1。ツールの出力の文字列が、リンクや HTML などの Markdown の構文として読まれないように）。
推奨: 各ツールは既定のテキストの出力のまま使ってください（vitest の既定の reporter、eslint の既定の formatter〈stylish〉、`npm audit` と `aiqh security-scan` のテキスト）。JSON の出力（`--reporter=json`・`-f json`・`--json`）にすると、件数は読まれません（`unparsed`）。

### 対象リポジトリで使う（M1: `npm link` によるローカル配布）

```bash
# 本体で 1 回: 依存関係を入れてビルドし、グローバルにリンク（<npm の prefix>/bin/aiqh -> dist/cli.js）
cd <clone した場所> && npm install && npm run build && npm link

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

### 対象リポジトリの CI で使う（v0.9.0: 再利用ワークフロー）

対象リポジトリのワークフローから、`verify.yml` を **40 桁の commit SHA** で固定して呼びます（タグでは固定しません）。aiqh は、そのワークフローと同じ commit のソースが使われます（ADR-0031）。inputs・SHA の見つけ方・呼び出す側の Actions の設定の注意・タグの運用は `docs/ops/reusable-workflow.md` にあります。前の版に戻す手順は `docs/ops/rollback.md`、見張る項目は `docs/ops/monitoring.md`、品質ポリシー（設定）を変える pull request の手順は `docs/ops/policy-change.md` にあります（v0.12.1）。

```yaml
jobs:
  aiqh:
    uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@<40 桁の commit SHA> # v0.9.0
    with:
      setup-command: npm ci
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
- `aiqh init --write` / `--write-gitignore` は、書込先（`aiqh.config.jsonc`・`.gitignore`）が dangling symlink（リンク先が未作成）のとき、
  リンク先を作らずに exit 2 で拒否します（`--force` でも。リンクを消すか、リンク先を作ってください）。v0.5.37 からは、書込先（`--write-scripts` の `package.json` も）が
  プロジェクトの外を指す symlink のときも、書かずに exit 2 で拒否します（プロジェクトの中を指す symlink は、従来どおりリンク先に書きます）
- Security Scan は git 追跡ファイルに加えて、未追跡で ignore されないファイルも走査します（サイズ上限なし。1 行が 256 KiB を
  超えるファイルは窓走査でメモリを抑えます）。未追跡で ignore されていない `.env*` は中身を読まずに finding にします。複数行の
  PEM 秘密鍵は開始行–終了行で報告し、`.gitignore` の判定は `git check-ignore` に委ねます（否定ルールを考慮）。
  検出結果に値は含めません（分類・パス・行番号のみ）
- v0.13.0 から、Security Scan は生の双方向の制御文字（U+202A–U+202E、U+2066–U+2069）と行区切り・段落区切り（U+2028、U+2029）も
  finding にします（`[raw-char] <path>:<line> U+202E bidi-control`。ファイルの中身と、走査の一覧に出るすべてのパス名。行の中身は出しません）。
  **判定が厳しくなる変更**で、これまで PASS だったリポジトリが FAIL になりえます。文字列の中なら言語のエスケープで書き、意図しない文字なら消します。
  意図した文字を残すときは、`category` を `bidi-control` か `line-separator` と明示した `security.allow` の規則で外します（分類の無い規則は生の文字を抑えません）。
  方向の印（U+200E・U+200F・U+061C）・ゼロ幅の文字・UTF-16 のファイルは見ません（ADR-0036 の既知の限界。ROADMAP の項目 49）
- **版を上げるとき（v0.13.0 から）**: 生の文字の検出が効くのは、実際に起動する `aiqh security-scan` が v0.13.0 以降のときだけです（verify の security の check は、
  check の `command` を PATH で探して起動します。新しい verify が古い `aiqh security-scan` を呼ぶと、生の文字は見つからず、check は PASS のままです）。
  verify が実際に呼ぶ `aiqh`（手元は PATH の `aiqh` と、`npm run` のスクリプトが呼ぶもの。CI は再利用ワークフローの `uses:` の SHA）の版・commit をそろえてください。
  `--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる。security の check の `parsed` が `unexpected-summary` なら、親と子の版の食い違いを疑ってください
- `aiqh init` の `artifacts/` 提案も `git check-ignore` で判定します。git リポジトリでない場合は常に追加を提案し、
  `--write-gitignore` は同じ行を二度追記しません
- 同梱の JSON Schema は構造の検証・補完用です。チェック名の一意性や必須チェック 1 件以上といった横断規則は `aiqh` が
  実行時に検証します（エディタで valid でも `aiqh` が拒否することがあります）
- `security.allow`（M2-0）で秘密の形の finding を理由つきで許容できます（`path` glob、`category`、`line`、必須の `reason`、任意の `expires`）。
  v0.13.0 から、生の文字の finding も、その分類（`bidi-control`・`line-separator`）を明示した規則だけで許容できます。
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

aiqh review-import <review.md> --label <label> --round <n> --id-prefix <prefix> [--allow-missing-previous] [--cwd <dir>]
                             独立レビューの md（aiqh-findings の JSON のブロック 1 つ）を docs/reviews/<label>/findings-r<n>.json に取り込む

aiqh review-check --label <label> [--cwd <dir>]
                             docs/reviews/<label>/findings-r*.json の状態を検査し、ループ未完了（open が残る）を表示する（読み取りだけ）

aiqh history --from <dir> [--from <dir> …] [--json] [--html [--out <dir>]] [--cwd <dir>]
                             verify の履歴を、DB 無しで読み取りだけで集計する（端末の表、または --json）。<dir> はプロジェクトのルート
                             （artifacts/verification/history を持つ）か、history のディレクトリ。複数可（同じ名前のプロジェクトは 1 つに合わせる）
                             --html で静的 HTML のダッシュボード <out>/dashboard.html も書く（既定の <out> は artifacts/history/）
```

相対パス（`--request` / `--review` / `--config` / `-o` / `--zip-output`）は `--cwd` のディレクトリ（省略時はカレント）を基準に解決します。
`--config` を省略したときは `--cwd` のディレクトリの `aiqh.config.jsonc` を読み、無ければ既定値、あるのに読めない・不正なら `2` です（`aiqh security-scan` も同じ。v0.5.1）。
`aiqh review-packet` の終了コード: `0` = 書いた、`1` = 不正な UTF-8・生の制御 / 区切り / 双方向制御文字・秘密の形のいずれかを検出（何も書かない。
値は表示しない）、`2` = 使い方・設定・検査不能（読めない入力、作業ツリー外、git の失敗など）・上限・書込のエラー。検査そのものができないときは finding があっても
`2` で、それまでの finding を「検査が完了していないため不完全」と明記して出します。上限超過など検査を妨げないエラーは finding が無いときだけ `2` です（ADR-0015）。
`<from>` は `<to>` の祖先であること。lock ファイルは既定で全文・差分を載せない（ADR-0014）。
`aiqh review-import`（v0.6.0、ADR-0026）: レビューの中の `aiqh-findings` の JSON を正本にし、本文の `### <ID>` の見出し・`## 全体の結論` の件数の行・その回の ID と突き合わせます。食い違い・読めない入力・前の回の findings のファイルが無い（`--allow-missing-previous` を除く）・読めないときは `2` で何も書きません。取り込んだ指摘はすべて `open` で、`open` の件数は表示するだけで終了コードには反映しません（`0` = 取り込んだ・同じレビューを取り込み済み）。依頼文のひな形は `docs/ops/review-request-template.md` です。
`<review.md>` を相対パスで書いたときは、`--cwd` のディレクトリ（省略時はカレント）を基準に解決します。v0.6.1: 名前付きの文字参照（`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` 以外。`;` の無い古い形の一部も）があれば `2`（`[entity]`）です。その回の ID は、文字参照を戻し、HTML のコメントとタグを取り除いた形でも探します（タグは止めません）。同じレビューを取り込み直すときも、既存のファイルの label・回・接頭辞と前の回の findings のファイルを確かめます（ADR-0026 の追記）。書いた後に、その label の `REVIEW LOOP:` の行（下の review-check と同じ判定）を出します。
`aiqh review-check`（ADR-0027）: `docs/reviews/<label>/findings-r*.json` だけを読み、何も書きません。回が 1 から欠けずにそろい、読めて、取り込んだときの形（ID・`summary`）のままで、状態ごとに要る欄（`resolved` は git が知っている commit の `fixedIn` と `regressionTest`、`deferred` は `destination`、`accepted`・`invalid` は `note`）があり、`previous` が前の回の指摘を指していれば `0` です。`open` が残っていれば `REVIEW LOOP: incomplete (open N)` と出しますが、終了コードは `0` のままです（`open` の数とレビューの評価は合否にしない）。前の回の評価と状態の食い違いは警告として出し、終了コードには反映しません。どれかの検査に通らなければ `2`（すべて並べて出す）。依頼から次の回までの手順は `docs/ops/review-loop.md` です。
`aiqh history`（v0.11.0、ADR-0034）: `history/<ts>.json` だけを読み、何も書きません。プロジェクトごとの run の数・verdict・日ごとの推移・`aiqh` の版と設定のハッシュ（`configSha256`）の区切り、check ごとの PASS / FAIL の数・FAIL の率・所要時間・タイムアウトに対する最大の割合、パーサの数（テストの件数・security-scan の数など）の日ごとの推移、失敗しやすい check を出します。出すのは数と状態と名前だけで、check の出力・コマンド・パス・`parsed.items` の名前・branch・commit は出しません。`--from` はパスではなく指定の順の番号（`#1`・`#2`）で示します（相対パスは `--cwd` が基準）。履歴は信頼しない入力として読み、1 ファイル 8 MiB・合わせて 10,000 ファイル・256 MiB、名前 256 バイト・1 run の check 256 個、集計の数 200,000 個・出力 32 MiB の上限があります。終了コード: `0` = すべての履歴を読めた（`HISTORY COMPLETE`。履歴に FAILED の run があっても `0`）、`2` = 読めない履歴があった（集計と一覧を出す。`HISTORY INCOMPLETE`）か、使い方・入力の誤り・上限（何も出さない。標準エラーに `HISTORY ERROR (<種類>)`）。`1` は使いません。`--json` の最後の行は標準エラーに出ます。
`aiqh history --html`（v0.12.0、ADR-0035）: 同じ集計を、静的 HTML のダッシュボード `<out>/dashboard.html` に書きます（`--out` は `--cwd` が基準で、既定は `artifacts/history/`。`--out` だけは使い方の誤り）。HTML に script・外の資源（画像・スタイルシート・フォント・リンク）・イベントの属性は無く、`<head>` の最初の CSP（`default-src 'none'` と、固定の CSS のハッシュ）が、ほかの読み込みを止めます。**HTML の中に外を指すものと script が無いので、開いても、外へ何も送らず、外から何も読み込みません**（CSP はその上の守りで、効き方はブラウザに依ります。ADR-0035 の既知の限界）。 開け閉めは `<details>`、図はインラインの SVG です。名前などの値は、マスクと禁止文字の表記の後に参照にしてから埋め込み、数は `data-k` で `--json` と同じパスを持ちます。書き込み先が symlink のとき・読んだ履歴のディレクトリの中のときは書きません（`2`）。上限は書くファイルのバイトで 32 MiB です。標準出力は `--html` の有無で変わらず、標準エラーに `dashboard: dashboard.html (<n> bytes)` の行が出ます。

終了コード（最終行の文言と 1 対 1）: `0` = `VERIFY PASSED`、`1` = `VERIFY FAILED`、`2` = `VERIFY ERROR`（設定エラー・レポート書込エラー・内部エラー）。使い方エラー（未知のコマンド・オプション、欠落・余分な引数、コマンドなし）も `2` です（全コマンド共通。`VERIFY` の最終行は出さず、`error: …` の 1 行だけを標準エラーに出す。ADR-0021）。

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
絶対パスでの起動は防ぎません（保証の外。v0.5.37 で決めた、バックログ 6）。vitest に渡す環境変数は PATH（node と git）・`NO_COLOR`・`FORCE_COLOR` だけで、ほかは引き継ぎません（v0.5.37）。vitest は見張り役（`scripts/minpath-watchdog.ts`）が先頭の別のプロセスグループで動き、
`test:minpath` が止まると（単独で SIGINT・SIGTERM を受けたときも、自己 verify の runner にプロセスグループごと止められたときも）、見張り役がそのグループごと止め、一時ディレクトリを消します（v0.5.38）。
テストが自分で別のプロセスグループにした子は止めません。
本体リポジトリの CI（`.github/workflows/ci.yml`）は Ubuntu で `npm ci` → `npm run verify` を走らせます（v0.9.2 から、main は pull request 必須で、`verify (ubuntu)` と `reusable (self) / aiqh verify` が必須チェックです〈merge commit だけ、Bypass なし。ADR-0032〉。main への直接の push はできず、変更は branch → pull request → 2 つの checks が緑 → merge の順に入ります。タグの前には、merge の後の main への push の run の success も確かめます。Windows は失敗しても止めない測定のジョブだけです。v0.9.0 からは、再利用ワークフローをこのリポジトリ自身に当てる `reusable (self)` も走ります。手順は `docs/ops/ci-and-branch-protection.md`、決定は ADR-0025・ADR-0031）。

```bash
# 配布 smoke test 単体（npm pack → 一時ディレクトリへ install → npx --no-install aiqh verify）
npm run smoke:package
```

Ctrl+C（SIGINT）/ SIGTERM で中断すると、実行中のチェックのプロセスグループへ SIGTERM → 最大 5 秒 → SIGKILL の順で
後始末し、SIGKILL の後はグループが消えたことを最大 2 秒確かめてから、それぞれ終了コード 130 / 143 で終了します。
消えたことを確認できなかったときは、レポートの `errorSummary` にそう書きます（終了コードは変わりません）。
これは通常のスケジューリングでの動きです。イベントループが極端に止まったときやレポートの書き込みが遅れたときは、
CLI の安全弁（シグナルの受信から 8 秒）が先に終了させ、レポートが書かれないことがあります（そのときも終了コードは 130 / 143 です）。
別のプロセスグループへ移った子プロセス（`setsid` 相当）は止められません（保証の外です）。タイムアウトも同じ順で止めます。
aiqh の中で処理されなかった例外・promise の拒否（コールバックの中など）が起きたときは、`aiqh: unexpected error: …` の 1 行を標準エラーへ出し（禁止文字は表記、秘密の形はマスク）、
同じ順で実行中のチェックを片付けてから終了コード 2 で終了します（先にシグナルで中断していたときは 130 / 143 のまま。レポートは書かれないことがあります。ADR-0024）。
ただし Node を `--unhandled-rejections=warn` や `--abort-on-uncaught-exception`（`NODE_OPTIONS` での指定、下線の綴り、否定の形を含む）で動かすと、Node 自身が値を生のまま出すので、aiqh は何も実行せずに理由の 1 行を出して終了コード 2 で終了します（ADR-0024 決定 6）。

## 独立レビューの運用

このリポジトリの変更は、版ごとに独立したレビュー AI にかけ、指摘を直してから次の回へ進めています（再修正のループ）。
1 回の流れ（依頼文とパケット → 人間がレビュアーに渡す → `aiqh review-import` で取り込み → 直す〈回帰テストを先に〉→ `aiqh review-check` → 次の回）と終える基準は
[`docs/ops/review-loop.md`](docs/ops/review-loop.md)、依頼文のひな形は [`docs/ops/review-request-template.md`](docs/ops/review-request-template.md) にあります。
レビューの原文・対応の記録・指摘の JSON（`findings-r<N>.json`）は `docs/reviews/<label>/`、マイルストーンの報告は `docs/reports/` にあります。
レビュアーの「問題ない」も実装者の「直した」も合否には使いません（合否は `npm run verify` などの機械的に再現できる結果だけ）。

## リポジトリ構成

```
src/                 CLI 本体（TypeScript, ESM）
tests/               Vitest（ユニット + CLI 結合テスト）
scripts/             配布 smoke test・最小 PATH でのテスト・JSON Schema の生成
schema/              設定ファイルの JSON Schema
docs/                ARCHITECTURE / ROADMAP / CONFIG_SPEC / adr / ops / reports / reviews
.github/             自己 CI（workflows/ci.yml）、再利用ワークフロー（workflows/verify.yml）と CODEOWNERS
aiqh.config.jsonc    このリポジトリ自身の検証設定
artifacts/           verify 出力・レビューパケット（git 管理外）
LICENSE              MIT
```

## ライセンス

MIT（[`LICENSE`](LICENSE)）。
