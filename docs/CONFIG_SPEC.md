# CONFIG_SPEC — 設定ファイル仕様

最終更新: 2026-10-25（v0.14.1。§5.2b の node:test の検出で、値を取るオプションの値が無い・`-` で始まる語のときは提案しない〈B1-I140-R1-001。ADR-0011 の改訂〉）。その前: 2026-10-23（v0.14.0。§5.2b の `aiqh init` の node:test の検出〈ROADMAP の項目 45。ADR-0011 の改訂〉、§5.3a の pytest のパーサが選ばれるコマンドの形と §6 の `checks[].parser` の行〈ROADMAP の項目 39。ADR-0028 の決定 12〉。その前: 2026-10-19〈v0.13.0〉の §3b の `security.allow` の生の文字の分類 `bidi-control`・`line-separator`〈分類を明示した規則だけが抑える〉、§5.2 の生成例の security の説明文、§5.3b の生の文字の走査〈ADR-0036〉。その前: 2026-10-18〈v0.11.0〉の §4c の `aiqh history` が読める範囲〈既知の限界〉と、§6 の `history` の行〈設定の欄は作らない〉。その前: 同じ日の v0.10.1 の §3 と §4 の `timeoutSec` の上限 2,147,483 秒、2026-10-17〈v0.10.0〉の §1 の設定のハッシュ〈ADR-0033〉）
状態: **M0 で必要な範囲（§1〜§5）は確定**。§6 は M1 以降の案。

---

## 1. ファイル名と形式

- ファイル名: `aiqh.config.jsonc`（対象リポジトリのルートに 1 枚）
- 形式: JSONC（JSON + コメント + 末尾カンマ許容）。根拠は ADR-0002
- 文字コード: UTF-8
- `--config <path>` で別パスを指定できる。相対パスの基準（プロジェクトルート）は**設定ファイルのあるディレクトリ**
- `aiqh init` が生成する（M1）。生成物はコメント付きで、検出できなかった分類は理由と有効化の案内をコメントで残す。
  コメントに入る値（アダプタの理由・注記・有効化の案内）は、LF・TAB・禁止文字を `\u{HEX}` の表記にしてから秘密の形を mask する（v0.5.4、M2-2-R3-001、
  ADR-0017）。コメントは 1 行のまま（値がコメントを終わらせて JSONC の行を作らない）。端末に出す設定案と `--write` で書くファイルは同じ中身
  `$schema` は対象から `./node_modules/ai-quality-harness/schema/aiqh.config.schema.json` を解決できる場合だけ書く
  （`npm link` 運用では省略される）。スキーマ本体は本体リポジトリの `schema/aiqh.config.schema.json`（`npm run schema:gen` で zod から生成）

設定ファイルには秘密情報を書く場所がない。秘密値を必要とするチェック（例: 外部サービスへの接続を伴う E2E）は、
コマンド側が環境変数や `.env` から読む前提とし、aiqh はそれらを設定から注入しない。

**設定のハッシュ**（v0.10.0、ADR-0033）: verify は、読んだ設定ファイルの**バイト列**の SHA-256 を、レポート（`latest.json`・`history/<ts>.json`）の最上位の `configSha256`（小文字 16 進 64 桁）に記録する。人は `shasum -a 256 aiqh.config.jsonc` で同じ値を出せる。
- 記録されるもの: verify がその run で読んだ設定ファイルの中身（1 回だけ読み、同じバイト列から設定の解析とハッシュを作る）。空白やコメントだけの変更でも値は変わる
- 分からないもの: 何が変わったか、設定が弱くなったか。設定の外の変更（`package.json` の scripts・テストのファイル・道具の設定・環境変数・依存の版）は値に表れない
- 固定ではない: 期待の値はどこにも置かず、値が変わっても verify の判定は変わらない。設定の変更を止めるのは、pull request とレビュー（ADR-0032）
- `latest.md` と端末には出さない（v0.10.0）。v0.10.0 より前のレポートには、この欄が無い

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
  "checks": [ /* §3 */ ],

  // 任意（M2-0）。内蔵 Security Scan の設定。§3b
  "security": {
    "allow": [
      { "path": "tests/**", "category": "anthropic", "reason": "synthetic test keys built at runtime", "expires": "2027-03-31" }
    ],
    "envProbePaths": [".env", ".env.local", ".env.production", ".env.development"],
    "exampleEnvSuffixes": ["example", "sample", "template", "dist"],
    "maxLineBytes": 262144,
    "lineOverlapBytes": 4096,
    "maxCarryBytes": 65536
  }
}
```

### 3b. `security` セクション（M2-0、ADR-0012）

`aiqh security-scan` は既定で cwd の `aiqh.config.jsonc` を読み（`--config <path>` で変更可。既定ファイルが無い〈ENOENT〉ときだけ既定値。それ以外の理由で
読めない〈辿れない親ディレクトリ、シンボリックリンクのループ、ディレクトリなど〉か不正なら exit 2。v0.5.1 で明確化: v0.5.0 までは、あっても辿れない既定ファイルを
無いものとして既定値で走査し、設定で足した `envProbePaths` が効かないまま exit 0 になり得た）、
`security` セクションの設定で走査する。config は信頼された入力（R-006 の trust boundary）であり、allow はレビューで見える形で記録される。

| キー | 型 | 既定 | 意味 |
|---|---|---|---|
| `allow[]` | 配列 | `[]` | 秘密の形の finding（`secret` / `oversized-candidate`）と、生の文字の finding（`raw-char`。v0.13.0、ADR-0036。**分類を明示した規則だけ**）の例外指定。**`tracked-env` / `untracked-env` / `gitignore` は抑制できない** |
| `allow[].path` | string（必須） | — | リポジトリ相対パスの glob（`path.matchesGlob`。`tests/**`、`src/*.py`、`**` 等） |
| `allow[].category` | string | 秘密の形の全分類 | 抑制する分類（`anthropic` / `aws` / `key-value` …、v0.13.0 から生の文字の `bidi-control` / `line-separator`。既知の分類名のみ）。省略すると秘密の形のすべての分類に効き、**生の文字は抑えない** |
| `allow[].line` | 正の整数 | 全行 | その行だけを抑制（パス名の生の文字には行が無いので効かない） |
| `allow[].reason` | string（必須、空白のみ不可） | — | 理由。scan の出力とレポートにそのまま表示される |
| `allow[].expires` | `YYYY-MM-DD` | 無期限 | この日を過ぎた規則は無効（該当 finding は残り、警告を出す） |
| `envProbePaths` | string[] | `.env`, `.env.local`, `.env.production`, `.env.development` | `.gitignore` のカバレッジ確認に使う代表パス（先頭が `.env` 本体扱い） |
| `exampleEnvSuffixes` | string[] | `example`, `sample`, `template`, `dist` | `.env.<suffix>` を情報扱い（finding にしない）にする接尾辞 |
| `maxLineBytes` | 正の整数 | 262144 | 1 行の保持上限（超えると窓走査）。JS 文字列長で測る |
| `lineOverlapBytes` | 整数（**最小 256** = `MIN_LINE_OVERLAP_BYTES`） | 4096 | 窓の重なりの下限。全パターンのアンカー長以上でなければ窓の切れ目でアンカーが失われる（M2-0-R2-001） |
| `maxCarryBytes` | 正の整数 | 65536 | 候補プレフィックスの持ち越し上限。超える候補は `oversized-candidate` finding |

**制約（M2-0-R1-001、M2-0-R2-001）**: 既定値を適用した後の 3 値が `256 <= lineOverlapBytes <= maxCarryBytes <= maxLineBytes` を満たさない config は
読込時エラー（exit 2）。1 つのキーだけを指定して既定値との関係が壊れる場合も同じ（例: `lineOverlapBytes: 100000` は既定の `maxCarryBytes` 65536 を超える）。
境界（`lineOverlapBytes == maxCarryBytes`、`maxCarryBytes == maxLineBytes`）は有効。
`allow[].reason` と `allow[].path` は改行（`\r` / `\n`）を含めない（スキーマエラー。M2-0-R1-002）。加えて C0 制御文字（U+0000〜U+001F、TAB を含む）、
DEL（U+007F）、C1 制御文字（U+0080〜U+009F）、U+2028 / U+2029 を含めない（M2-0-R2-002。JSON Schema の `pattern` も同じ式）。

`aiqh review-packet`（M2-1、ADR-0014）も同じ `security` セクションを、security-scan と同じ関数（`src/config/load.ts` の `loadSecurityConfig`）で読む
（cwd の `aiqh.config.jsonc`、`--config` で変更可。既定ファイルが無い〈ENOENT〉ときだけ既定値、読めない・不正なら exit 2。v0.5.1）。`allow` はパケットに入る
入力の出所（変更ファイルの全文と差分の行、`--doc`）のリポジトリパスと行に適用し、抑制した件数と一覧はパケットの Integrity 節に載せる。依頼文・レビュー原文・
commit メッセージ・verify 結果にはパスが無いので適用されない。review-packet 用の新しいキーは無い（オプションは CLI のみ）。

抑制した finding の件数と一覧（`[allowed] file:line category by rule #n`。パス名の生の文字は `[allowed] file category by rule #n`）、使った規則、未使用の規則（警告）、期限切れの規則（警告）は
scan の出力（text / `--json`）に必ず出る。verify のレポートには security チェックの出力として残る（実行経路は M0 のまま）。

**key-value 走査（M2-0 §6）の既知の制限**: 候補になるのは引用符付きのリテラルと、dotenv / shell 形式の裸の値（`()[]{}` や `.` / `->` / `::` の
識別子連結を含まないもの）だけで、値が 8 文字以上かつ英字と数字を両方含む（または小文字 / 大文字 / 数字 / 記号のうち 3 種以上）ときに finding になる。
補間・参照（`${…}`、`process.env.X`、`os.environ[…]`、`%(…)s`、`{{…}}`）、プレースホルダ（`<…>`、`xxx`、`changeme`、`example`、`dummy`、
`placeholder`、`your-…`、`***`、`REDACTED`）、真偽値・`null` / `None`、数値のみは finding にならない。**英字のみの長いパスフレーズは検出できない**。
masker（レポートのマスク）はこの判定を使わず、従来どおり広くマスクする。

---

## 3. check オブジェクト

| フィールド | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `name` | string | ✔ | — | 一意な識別子。`^[a-z0-9][a-z0-9-]*$`。レポートとログに使う |
| `kind` | enum | ✔ | — | `lint` / `typecheck` / `unit` / `build` / `security` / `dependency` / `e2e` / `custom`。分類別サマリに使う |
| `command` | string | ✔ | — | 実行コマンド。shell 経由で実行（`npm run lint`、`npx tsc --noEmit`、`.venv/bin/pytest -q` 等）。空文字不可 |
| `cwd` | string | — | `"."` | 作業ディレクトリ。プロジェクトルートからの相対パス。ルート外へ出る指定（`..` や絶対パス）はエラー |
| `required` | boolean | — | `defaults.required` | true なら失敗で VERIFY FAILED。false なら失敗してもレポートに FAIL として残すだけ |
| `timeoutSec` | integer | — | `defaults.timeoutSec` | 1 以上 2,147,483 以下（v0.10.1。`defaults.timeoutSec` も同じ。Node.js のタイマーが待てる最長の 2,147,483,647 ms を秒にして切り捨てた値。超える値は設定の誤り〈exit 2〉。v0.10.0 までは、超える値でタイマーが 1 ms になり、check がすぐ時間切れになった）。超過時はプロセスグループを終了させ FAIL（timedOut=true）。SIGKILL の後に消えたことを確認できなければ、`errorSummary` にそう書く（終了コードは同じ。ADR-0023） |
| `description` | string | — | — | 人間向けの説明。レポートに表示 |

未知のフィールドはエラー（typo を検出するため）。

**check の環境（v0.5.24、ADR-0020）**: check のコマンドは、aiqh の環境変数から `FORCE_COLOR` と `PY_COLORS` を除き、`NO_COLOR=1` を足した環境で起動する（ほかの変数は継承する）。
check の出力は端末ではなくレポートに入るので、色を強制しない。check ごとの環境の上書きはできない（設定に `env` は無い）。

---

## 4. 検証規則（M0 で実装）

読込時に以下を検証し、1 つでも違反があれば**レポートを書かずに終了コード 2** で停止する。

1. JSONC として解釈できること
2. `version` が `1` であること
3. `project.name` が空でない文字列であること
4. `checks` が 1 件以上であること
5. `checks[].name` が一意であり、パターン `^[a-z0-9][a-z0-9-]*$` に合致すること
6. `checks[].command` が空白のみでないこと
7. `checks[].cwd` を解決した結果がプロジェクトルート内であること。字句上の判定に加えて realpath（symlink 解決後）でも判定し、ルート内の symlink がルート外を指す場合もエラー（`output.dir` も同様。未作成のパスは存在する最も近いエントリで判定）。途中に dangling symlink（リンク先が未作成）がある場合は解決先を検証できないため、リンク先がルート内向きでもエラー（「解決先が存在しない。先に作成するか設定を見直す」）。途中のエントリを**調べられない**場合（権限で辿れないディレクトリ〈EACCES〉、通常ファイルの下を通る指定〈ENOTDIR〉、symlink の輪〈ELOOP〉など、lstat の失敗が ENOENT 以外）も、解決先を検証できないためエラー（`<label> cannot be resolved: <path> — <entry> cannot be examined (<code>)`。読込時のエラーなので、check は走らず、レポートも書かない。v0.5.29、ADR-0022）。cwd 自体が存在しない（ENOENT）通常のディレクトリの場合は読込時エラーではなく、その check を FAIL とする。読込の後でパスが変わり、実行の時点で辿れなくなった cwd（権限の変更、通常ファイルへの置き換え、symlink の輪など）も、その check を FAIL とする（verify は exit 1）。メッセージは ENOENT だけ `working directory does not exist: <dir>`、他は `working directory cannot be examined: <dir> (<code>)`（v0.5.31、ADR-0022）
8. `timeoutSec`（check と `defaults`）が 1 以上 2,147,483 以下の整数であること（上限は v0.10.1。ADR-0005 の注記）
9. `required: true` の check が 1 件以上あること（必須チェックが 0 件の設定は「常に PASS」になり fail closed に反するため）
10. 未知のフィールドがないこと

### 4b. JSON Schema と実行時検証の関係（M1-R1-008、案 B）

同梱の `schema/aiqh.config.schema.json` はエディタの補完・検証のための**構造スキーマ**で、zod 定義から生成する
（`npm run schema:gen`、テストで同期を固定）。上記のうち JSON Schema で表現できるもの（型・列挙・`name` のパターン・
`command` が空白のみでないこと = `pattern: "\\S"`）は表現し、**表現できない横断規則（5 の一意性、9 の required 1 件以上）は
`aiqh` の実行時検証だけが担う**。スキーマの `description` にこの旨を明記し、既知の差（required 0 件、重複名）は
「JSON Schema では通り、`aiqh` では拒否される」ことをテストで固定している。エディタで valid でも `aiqh verify` /
`aiqh init --write` が拒否することがある。

### 4c. `aiqh history` が読める範囲（既知の限界。v0.11.0、ADR-0034）

`aiqh history`（ADR-0034）は、verify の履歴（`history/<ts>.json`）を信頼しない入力として読み、読む欄の長さと数に上限を置く。
設定はこれより大きな値を許すので、**設定として正しくても、その run の履歴を `aiqh history` が読めない**ことがある（M4 の設計の Q11。verify は変えない）。

| 設定の値 | 設定の規則（§3・§4） | `aiqh history` が読める範囲 |
|---|---|---|
| `checks` の数 | 1 件以上（上限なし） | 1 run に 256 個まで |
| `checks[].name` | 一意で、パターン `^[a-z0-9][a-z0-9-]*$`（長さの上限なし） | UTF-8 で 256 バイトまで |
| `project.name` | 空でない（長さの上限なし） | UTF-8 で 256 バイトまで |

- 範囲の外の run の履歴は、`aiqh history` の読めないもの `bad-shape` になり、一覧に出て終了コード 2（`HISTORY INCOMPLETE`）になる。値は切り詰めず、表示もしない
- 名前の長さは、レポートに書かれた値（秘密の形のマスクの後）で数える
- 表示では、名前はマスクの後に 200 文字で切る（ADR-0034 の F）

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

### 5.2 Node 系の対象リポジトリ（`aiqh init` の生成例。React + Vite、tsconfig 参照構成、lint / test 未導入）

```jsonc
// aiqh.config.jsonc — generated by `aiqh init`.
{
  "version": 1,
  "project": { "name": "my-vite-app", "type": "node" },
  "defaults": { "timeoutSec": 600, "required": true },
  "checks": [
    // typecheck: node-tsc — tsconfig.json uses project references
    { "name": "typecheck", "kind": "typecheck", "command": "npx --no-install tsc -b", "timeoutSec": 300, "description": "Type check all referenced projects (noEmit is taken from the tsconfigs)" },
    // build: node-build — package.json scripts.build = "tsc -b && vite build" (Vite)
    { "name": "build", "kind": "build", "command": "npm run build", "timeoutSec": 900, "description": "Production build via the existing build script (Vite)" },
    // security: builtin-security — git repository; built-in scanner (no external tool)
    { "name": "security", "kind": "security", "command": "aiqh security-scan", "timeoutSec": 300, "description": "Secret-shaped strings, raw bidi controls and line separators in tracked files, tracked .env files, .gitignore coverage (values are never printed)" },
    // dependency: node-npm-audit — npm lockfile found
    { "name": "dependency", "kind": "dependency", "command": "npm audit --audit-level=high", "timeoutSec": 300, "description": "Known-vulnerability audit of installed dependencies (needs registry access)" }
    // lint: NOT APPLICABLE — no ESLint config, no eslint dependency, no lint script
    //   to enable: install eslint (npm i -D eslint @eslint/js) and add eslint.config.js; aiqh does not install it
    // unit: NOT APPLICABLE — ...   // e2e: NOT APPLICABLE — ...
  ]
}
```

### 5.2b node:test の対象（v0.14.0、ROADMAP の項目 45、ADR-0011 の改訂）

`scripts.test`（次に `scripts.test:unit`）が Node の組み込みのテストランナーを動かす対象では、`aiqh init` が unit に `npm run <script>` を提案する（アダプタ `node-test`。node:test は依存として入らないので、script の本文をローカルの証拠にする）。

```jsonc
    // unit: node-test — package.json scripts.test found (runs node --test)
    { "name": "unit", "kind": "unit", "command": "npm run test", "timeoutSec": 600, "description": "Unit tests via the existing test script (node --test)" },
```

提案するのは、script の単純コマンドのどれかが次をすべて満たすときだけ（規則の全体は batch1 の設計〈最終〉の §2.4）:
- 実行位置（`名前=値` の前置きを飛ばした最初の語）が、引用符も `\` も無い `node`。`NODE_OPTIONS=…` の前置きがあれば提案しない
- Node 自身のオプションとして、値の無い `--test` がある（スクリプトの名前・`-e` などの本文・`--` より前）
- `--test` の隣に置けるのは、値を取るオプション 18（`--import`・`--require`・`-r`・`--loader`・`--experimental-loader`・`--conditions`・`-C`・`--env-file`・`--input-type`・`--test-reporter`・`--test-reporter-destination`・`--test-name-pattern`・`--test-skip-pattern`・`--test-concurrency`・`--test-timeout`・`--test-shard`・`--watch-path`・`--title`。`--name value` と `--name=value` は同じ）と、既知のブールの旗 24（`--experimental-strip-types`・`--no-warnings`・`--enable-source-maps` など）だけ。2 語の形で、値の語が無い（末尾）か `-` で始まる（`-` 1 文字も）ときは提案しない（v0.14.1、B1-I140-R1-001。Node v24.13.1 は `requires an argument` の exit 9 で起動しない）
- 実行位置より後ろに、名前に `watch` を含むオプション（`--no-watch` も）と、`--experimental-config-file`・`--experimental-default-config-file`・`--env-file`・`--env-file-if-exists` が無い

提案しない形（unit は今までどおり NOT APPLICABLE。設定に手で足す）: `npx node --test`・`env node --test`・`cross-env … node --test`・パスつきの `node`、一覧に無いオプションつき（例 `node --unknown-option=value --test`）、値を取るオプションの値が無い形（例 `node --test --import`・`node --test --test-reporter --test`）、監視のオプションつき、`node "--test"`、`node script.js --test`、`echo node --test`、`$(…)` などで組み立てた形。vitest がローカルにあれば、vitest の直接の実行が先に選ばれる（node-test は代替として監査の表に出る）。

### 5.3 Python 系の対象リポジトリ（`aiqh init` の生成例。FastAPI + venv、pytest のみ導入）

```jsonc
{
  "version": 1,
  "project": { "name": "my-fastapi-app", "type": "python" },
  "defaults": { "timeoutSec": 600, "required": true },
  "checks": [
    // unit: python-pytest — .venv/bin/pytest found; tests/ directory present
    { "name": "unit", "kind": "unit", "command": ".venv/bin/python -m pytest -q tests/", "timeoutSec": 900, "description": "Unit tests with pytest through the venv interpreter" },
    // security: builtin-security — git repository; built-in scanner (no external tool)
    { "name": "security", "kind": "security", "command": "aiqh security-scan", "timeoutSec": 300, "description": "..." }
    // lint: NOT APPLICABLE — ruff not installed in .venv   //   to enable: .venv/bin/python -m pip install ruff — aiqh does not install it
    // typecheck / dependency / e2e: NOT APPLICABLE — （同様に有効化の案内）
    // build: NOT APPLICABLE — Python projects have no build step (not applicable)
  ]
}
```
venv は有効化せず `.venv/bin/python -m …` で直接呼ぶ。`build` は Python では該当しない（NOT_APPLICABLE）。

### 5.3a pytest のパーサが選ばれるコマンドの形（v0.14.0、ROADMAP の項目 39、ADR-0028 の決定 12）

verify は check の出力を表示のためだけに読む（判定と終了コードは変えない）。pytest の出力（要約の行と `short test summary info` の `FAILED`・`ERROR` の行）を読むのは、`command`（`npm run <script>`・`npm test` なら作業ディレクトリの package.json の script）が、次の形の単純コマンド 1 つ（前に `cd <1 語>` を置いてよい）のときだけ。設定の欄は無い。

- `pytest …`・`.venv/bin/pytest …`・`py.test …`（実行位置の語の最後の部分）
- `python -m pytest …`・`.venv/bin/python -m pytest -q tests/`（§5.3 の init の形）・`python3 -B -m pytest`（`python`・`python3`・`python3.<数字>` と、値を取らない旗 `-B`・`-E`・`-I`・`-O`・`-OO`・`-P`・`-s`・`-S`・`-u`・`-q`・`-b`・`-bb`・`-d`・`-v`）
- `uv run …`・`poetry run …`・`pipenv run …`・`pdm run …`・`hatch run …`・`rye run …` の後ろが上の形（間に置けるのは `=` を含む旗と `--frozen`・`--locked`・`--no-sync`・`--offline`・`--quiet`・`-q`）
- 前に `名前=値`（例 `PYTHONPATH=.`）を置いてよい

選ばれない形（件数が出ないだけ。`not-applicable`）: `pytest -q && echo …`・`python gen.py && pytest -q`・`pytest -q | tee out.txt` のように前後にほかのコマンドがある形、`coverage run -m pytest`・`tox`・`nox`・`make test`・`env pytest`、`python -X dev -m pytest` のような値を取る旗、`"pytest"` のように引用符で囲んだ語。推奨: pytest は既定のテキストの出力のまま使う（`-q` でも既定の形でもよい）。

### 5.3b `kind: "security"` の標準コマンド

内蔵の `aiqh security-scan`（外部ツール不要）。PATH の `aiqh`（`npm link`）に依存する。本体リポジトリ自身は `npm run security`（ソース実行）を使う。

走査仕様（M1-R1 で改訂。詳細は ARCHITECTURE §6.1b と ADR-0010）:
- 対象: git 追跡ファイル + 未追跡で ignore されないファイル（`git ls-files --others --exclude-standard`）。未追跡の `.env*` は読まない
- サイズ上限なし（64 KiB チャンクの逐次読み）。先頭 8 KiB に NUL を含むファイルはバイナリとしてスキップし件数を表示。読取エラーは exit 2
- 行指向の分類（url-credential / anthropic / openai / aws / github / slack / google / gitlab / jwt）は行単位。private-key は BEGIN 行 → END 行の
  状態機械で検出し、`file:開始行-終了行` で表示。END 行が無い（途中で切れた）PEM も検出する
- `.gitignore` の判定は `git check-ignore --no-index` の結果で、リポジトリ内の `.gitignore` の非否定ルールが `.env` / `.env.local` /
  `.env.production` / `.env.development` を ignore する場合だけ保護ありとする（否定で再包含されたものは報告。`!.env.example` は許容）
- 未追跡で ignore されていない `.env*`（`config/.env.staging` のようなネストも含む）は、中身を読まずに `untracked-env` の finding にする
  （M1-R2-001）。example / sample / template / dist は情報のみ
- 1 行が `security.maxLineBytes`（既定 256 KiB）を超える場合は窓走査に切り替わる（M1-R2-004 → M2-0 → M2-0-R2-001）: 区間ごとに同じ行番号で照合し、
  候補プレフィックス（有界なアンカーが見つかり、区間末尾まで「一致の途中の形」（`partial`）が続く**最も早い**位置。下限は重なり `lineOverlapBytes`
  （最小 256）、上限は `maxCarryBytes` 64 KiB）を次の区間へ持ち越す。上限を超える候補は `oversized-candidate` finding（fail closed）。
  完全性の不変条件「窓なしの finding ⊆ 窓ありの finding ∪ oversized-candidate」は ADR-0013 と性質テスト・構造テスト（M2-0-R3-001）で固定。メモリはファイルサイズに比例しない。
  逆向き（窓ありの finding ⊆ 窓なし）は成り立たない: 窓の境界で正規表現の左右の文脈が失われ、窓なしでは一致しない文字列が finding になることがある（安全側の誤検出。`security.allow` で許容できる。M2-0-R4-001、v0.5.37 で記録）
- **既知の制限（M2-0-R3-002）**: url-credential は scheme（`://` の前）が 64 文字以下のものだけを scanner が検出する（窓走査のアンカーを有界にするため）。
  レポートのマスク（masker）は scheme の長さによらず redact する（v0.3.1 と同じ範囲）
- key-value 分類も走査する（値が秘密らしい場合だけ。§3b の既知の制限を参照）。未走査は bearer / basic
- `security.allow` による抑制は必ず出力に残る（§3b）
- `lstat` / open / read の失敗は exit 2（fail closed）。例外は ENOENT（index にあるが作業ツリーに無い）だけで、これはスキップ
- 値は出力しない（分類・パス・行番号のみ）
- **生の文字（v0.13.0、ADR-0036。判定が厳しくなる変更）**: 双方向の制御文字 U+202A–U+202E・U+2066–U+2069（分類 `bidi-control`）と、行区切り・段落区切り U+2028・U+2029（分類 `line-separator`）を `raw-char` の finding にする（1 つでもあれば exit 1）。禁止文字の集合（75 の符号位置）のうち、この 11 だけを見る
  - 中身: 読むファイル（上の対象。バイナリ・未追跡の `.env*`・symlink・submodule は読まない）の行。同じ行の同じ符号位置は 1 件。行は LF で数える（U+2028・U+2029 では分けない）。不正な UTF-8 のバイトがあっても、正しく符号化された文字は見つける
  - パス名: 2 つの一覧に出たすべてのパス（中身を読まないものも含む）の、リポジトリからの相対のパス。符号位置ごとに 1 件で、行は無い。作業ディレクトリ（ルート）のパスは見ない。未追跡で ignore されたパスは一覧に出ないので見ない
  - 出力: `raw characters checked: bidi-control (U+202A-U+202E, U+2066-U+2069), line-separator (U+2028, U+2029)` の情報の行（`--json` は `scannedRawChars`）、件数の行の最後の `raw characters: N`、`[raw-char] <path>:<line> U+202E bidi-control`（パス名は `[raw-char] <path> U+202E bidi-control (in the path)`）。行の中身は出さない。パスは出口で表記にしてから出す
  - 抑えるのは、その分類を明示した `security.allow` の規則だけ（§3b）
  - 見ないもの（既知の限界）: 方向の印 U+200E・U+200F・U+061C、ゼロ幅の文字、異体字セレクタ、タグ文字（ROADMAP の項目 49）、UTF-16・UTF-32 のファイル（NUL を含むのでバイナリとして読まない）、不正な UTF-8 のバイトそのもの、symlink の先・submodule の中
  - **検出の範囲は、実際に起動する `aiqh security-scan` の版で決まる**: verify の security の check は、check の `command`（`aiqh security-scan`）を PATH で探して起動する。新しい verify が古い `aiqh security-scan` を呼ぶと、生の文字は見つからず check は PASS のまま（verify のパーサは、古い 5 つの内訳の件数の行を `unexpected-summary` にする。判定は変えない。ADR-0028）
  - 版を上げるとき: verify が実際に呼ぶ `aiqh`（手元は PATH の `aiqh` と、`npm run` のスクリプトが呼ぶもの。CI は再利用ワークフローの `uses:` の SHA）の版・commit をそろえる。`--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる。手元は、どの `aiqh` が呼ばれるかを `command -v aiqh` で確かめる

### 5.3c `aiqh init` の書込フラグと部分更新（M1-R1-010）

`--write`（config）、`--write-gitignore`、`--write-scripts` の書込は互いに独立で、いずれかが失敗すると
`aiqh init: failed to update <file>: <理由>` を表示して exit 2 になるが、**他のファイルの書込は取り消されない**。
複数フラグを同時に指定して一部だけ失敗した場合は、`git status` / `git diff` で書き込まれたものを確認して対処する。
`--write` は生成した JSONC を `aiqh verify` と同じパーサ / リゾルバに通し、通らない場合（required 0 件、重複名、空コマンド等）は
何も書かずに exit 2 になる（M1-R1-006）。

`--write`・`--write-gitignore` は、書込先（`aiqh.config.jsonc`・`.gitignore`）が **dangling symlink**（リンク先が未作成）のとき、リンク先を作らずに拒否する
（`aiqh init: failed to write <file>: it is a symbolic link whose target does not exist; remove the link or create the target first` /
`aiqh init: failed to update <file>: …`、exit 2。`--force` でも拒否する。他のファイルの書込は取り消されない。v0.5.29、ADR-0022）。
リンク先が存在する symlink は従来どおり書込の対象で（`--write` は `--force` なしでは already exists、`--force` ではリンク先を上書き、`.gitignore` は追記）、
リンク先がプロジェクトの外でも書いた（ROADMAP のバックログ 23）。**v0.5.37 から**、3 つの書込先（`aiqh.config.jsonc`・`.gitignore`・`--write-scripts` の `package.json`）は、
リンクを解決した先が root の外なら書かずに拒否する（`aiqh init: failed to write <file>: it is a symbolic link to <target>, outside the project root; replace the link with a regular file, or update that file yourself` /
`aiqh init: failed to update <file>: …`、exit 2。`--force` でも拒否する。他のファイルの書込は取り消されない）。root の中を指す symlink は、従来どおりリンク先に書く。
`--write-scripts` にも dangling の拒否を揃えた（`package.json` が dangling なら、監査〈O6〉が先に止める）。

`aiqh init` の対象ディレクトリ（`--cwd`、既定はカレント）は、存在しない（ENOENT）とき `aiqh init: directory not found: <root>`、辿れない・調べられない（EACCES・ENOTDIR・ELOOP など）とき
`aiqh init: directory cannot be examined: <root> (<code>)`、ディレクトリでない（通常ファイルなど）とき `aiqh init: not a directory: <root>` で、いずれも何も監査せず exit 2（v0.5.31、ADR-0022。以前は通常ファイルをリポジトリとして監査し、exit 0 だった）。

`aiqh init` が検出に使う入口（`package.json`・`tsconfig.json`・`pyproject.toml`・lockfile・設定ファイル・venv の bin・root の一覧など）が、読めない（EACCES など）・dangling symlink・ディレクトリ・JSON として不正（`package.json`）・通常ファイルの下（ENOTDIR）のときは、
`aiqh init: cannot audit <root>: <entry> cannot be examined (<code>)` / `<entry> is a symbolic link whose target does not exist` / `<entry> is not valid JSON` / `package.json is not a JSON object` / `package.json has a "<field>" field that is not a JSON object`（v0.5.37、バックログ 26: `scripts`・`dependencies`・`devDependencies`）/ `the top-level entries cannot be listed (<code>)` を表示して exit 2（dry-run も）。
何も監査せず、何も書かない（v0.5.32、ADR-0022。以前は、その入口が無いものとして監査し、`--write` は lint・typecheck・build などを含まない設定を書き、`--write-scripts` は何も言わずに終わった）。本当に無い入口（ENOENT）は、従来どおり「無い」。

`.gitignore` の `artifacts/` 提案は Security Scan と同じ `git check-ignore --no-index` の判定で決める（M1-R2-005）: 代表パス
`artifacts/.aiqh-ignore-probe` がリポジトリ内 `.gitignore` の非否定ルールで ignore されていれば「already ignores」、そうでなければ
追加を提案する（`artifacts/` + `!artifacts/` のような否定は追加提案になる）。git リポジトリでない場合や git が失敗した場合は
確認できないため常に追加を提案し、`--write-gitignore` は同じ行が既にあれば追記しない（冪等）。

---

### 5.4 出力の保持（設定項目ではない。M0 の固定値）

各チェックの stdout / stderr は実行中にストリームごと最大 10MiB をメモリに保持し、超過分は先頭からバイト単位で捨てる。
切り詰め後の先頭が UTF-8 の継続バイトである間は最大 3 バイトまで追加で捨ててコードポイント境界に揃えるため、保持量は上限より
**最大 3 バイト少なくなる**ことがある。レポートにはさらに末尾 200 行 / 64KB だけを書く。レポートの `latest.json`・`history/<ts>.json` は禁止文字を `\uXXXX`（読み戻すと同じデータ）、`latest.md` は `\u{HEX}` にして書く（v0.5.24、ADR-0020）。上限を設定可能にする案は §6 に含める。

## 6. M1 以降の拡張案（未確定）

| 項目 | 案 | 目的 |
|---|---|---|
| `checks[].enabled` | boolean | 一時的に無効化。無効化された check はレポートに SKIPPED と理由を残す |
| `checks[].env` | `{ NAME: "value" }`（値に秘密は不可。`$VAR` 参照のみ許容する方式を検討） | CI 向けのフラグ（`CI=1` 等） |
| `checks[].parser` | `"eslint-json"` / `"pytest"` 等 | 件数・失敗テスト名をレポートに構造化。**採らない**（ADR-0028 の P5: パーサはコマンドから aiqh が選び、設定の欄は作らない。pytest は v0.14.0 から §5.3a のコマンドの形で読む） |
| `checks[].artifacts` | glob 配列 | Playwright のトレース等を verify 出力にコピー |
| `checks[].maxOutputBytes` | integer | 実行時の出力保持上限（既定 10MiB）を check ごとに変更。境界揃えのため最大 3 バイト少なくなる |
| `checks[].dependsOn` | name 配列 | 前段が FAIL のとき SKIPPED にする（例: typecheck 失敗時に build を飛ばす） |
| `matrix` | Node / Python バージョン | Actions での並列実行（M3） |
| ~~`history`~~ | 作らない（v0.11.0、ADR-0034: `aiqh history` は DB も保存先も持たず、読む場所は `--from` で渡す） | — |
| ~~JSON Schema~~ | M1 で同梱済み（`schema/aiqh.config.schema.json`） | — |
| ~~`security.allow`~~ | M2-0 で実装済み（§3b） | — |
| ~~`security.scanKeyValue`~~ | M2-0 で key-value 走査を既定で有効化（値のヒューリスティック付き、§3b）。無効化フラグは設けていない | — |

これらは仕様確定前に ADR を追加する。

（v0.5.40: 以前この表にあった `review`〈パケット生成の入力パス、diff の上限。M2〉は外した。不要: review-packet は CLI のオプション〈`--range`・`--doc` など〉で出荷済みで、設定の欄は計画されていない）
