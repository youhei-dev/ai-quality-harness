# ARCHITECTURE — ai-quality-harness（aiqh）

最終更新: 2026-10-16（v0.9.0。§3 の配布モデル: CI は案 D〈ADR-0031〉、呼び出す側は commit SHA で固定。その前: v0.8.4 の §3 の構成の CODEOWNERS の行〈公開の後〉と対象リポジトリの例〈適用先は個人のリポジトリ 2 つ〉、v0.8.3 のプロジェクトの `CLAUDE.md` の追跡外の注記。初版は 2026-09-15 の M0 設計時点）

本書は ai-quality-harness の**最終形（M4 完了時点）**の構成を描く。
実装済み範囲は各節の「M0 実装範囲」に明記し、それ以外は設計案である。

---

## 1. 目的と思想

ai-quality-harness は、AI 駆動開発において「AI の回答だけを品質保証の根拠にしない」ための
**多層防御の Quality Gate 実行基盤**である。複数プロジェクトに横断適用できる専用ツールとして、
本体を常に本リポジトリ（youhei-dev/ai-quality-harness）に置き、対象リポジトリには
設定ファイルとワークフロー参照だけを置く。

設計原則:

| 原則 | 意味 |
|---|---|
| 機械的根拠 | Lint / 型 / テスト / ビルド / セキュリティ / 依存 / E2E の**再現可能な結果**を判定根拠にする。AI の「問題ありません」は根拠にしない |
| fail closed | 必須チェックが 1 つでも失敗（タイムアウト・起動失敗・設定不正を含む）すれば VERIFY FAILED（終了コード非ゼロ）。全必須チェック成功時のみ VERIFY PASSED |
| 自己適用 | ハーネス自身を最初の適用対象とし、自分の verify を通せない状態でマイルストーンを終えない |
| 設定は秘密を持たない | 設定ファイルには秘密情報を書けない構造にし、レポートはパターンマスクを経由してのみ保存する |
| 単純さ | チェックの実行経路は 1 本（設定 → 子プロセス → 終了コード）に固定し、アダプタは「検出と推奨」であって別の実行経路を作らない |

---

## 2. 開発プロセス全体像と aiqh の担当範囲

```
人間（依頼）
  ↓
実装AI（Claude Code / Fable 系）
  ↓                       ┌──────────────────────────┐
独立レビューAI（Astra / Codex） ←── │ aiqh review-packet（M2） │
  ↓                       │ aiqh review-import（M2） │
自動 Quality Gate ←────────── │ aiqh verify（M0〜M1）     │
  Lint / Type / Unit / Build   │ aiqh init（M1）          │
  Security / Dependency / E2E  │ GitHub Actions 再利用WF（M3）│
  ↓                       │ aiqh history / dashboard（M4）│
人間による実データ・業務確認     └──────────────────────────┘
  ↓
本番（Monitoring / Rollback — M4 で設計テンプレート）
```

aiqh が担うのは「独立レビューAI への入力生成」「Quality Gate の実行と判定」「履歴の記録」である。
人間の業務確認と本番運用は aiqh の外側にあり、aiqh はそこへ**機械的な証拠**を渡す。

---

## 3. 配布モデル

```
youhei-dev/ai-quality-harness（本体・本リポジトリ。Public）
  ├─ src/        … CLI 本体（TypeScript）
  ├─ .github/workflows/verify.yml   … 再利用ワークフロー（`workflow_call` だけ。v0.9.0、ADR-0031）。自分と同じ commit の aiqh のソースを使う（案 D）
  ├─ .github/workflows/ci.yml       … 本体の自己 CI（`verify (ubuntu)`・`reusable (self)`〈verify.yml を自分に当てる。v0.9.0〉・`measure (windows)`。M3 の前半、v0.5.45 で追加。ADR-0025）
  ├─ .github/CODEOWNERS            … 検証のしかたを決めるファイルの持ち主（強制されない: main の ruleset は Code Owners のレビューを必須にしていない。ADR-0025）
  └─ tags: v0.1.0, v0.2.0, …        … 注釈付きタグ（semver の `v0.x.y`）。対象リポジトリは、タグが指す commit の 40 桁の SHA で固定する（タグそのものでは固定しない。v0.9.0 で改めた）

対象リポジトリ（個人のリポジトリ 2 つ: trim-manager, ai-tutor-browser）
  ├─ aiqh.config.jsonc              … 設定 1 枚（秘密情報なし）
  ├─ .github/workflows/quality.yml  … `uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@<40 桁の commit SHA> # vX.Y.Z`（v0.9.0 から。手順は `docs/ops/reusable-workflow.md`）
  └─ artifacts/verification/        … verify の出力（git 管理外）
```

CLI の呼び出し方は次の 3 系統。

- 本体リポジトリ内: `npm run verify`（Node 24 のネイティブ TypeScript 実行で `src/cli.ts` を直接起動）、`npm run verify:dist`
- 対象リポジトリ: **`npm link` で PATH に置いた `aiqh`**（M1 の方針、ADR-0009）。本体で `npm run build && npm link` →
  対象で `aiqh init` / `aiqh verify`。対象の `package.json` に依存は追加しない（`security` チェックのコマンド `aiqh security-scan`
  は PATH の `aiqh` に依存し、`init` の監査レポートが解決元（リンク先と version）を表示する）。git 依存（`allow-git=none`）や
  公開配布（`min-release-age=7`）は M3 で Public 化と一緒に判断 → **決まった結果**（2026-10-16、ADR-0031）: どちらも採らない。CI は下の案 D、手元は `npm link` のまま
- 対象リポジトリの CI（v0.9.0、ADR-0031）: 再利用ワークフロー `verify.yml` が、`job.workflow_sha` の aiqh のソースを checkout し、`npm ci --omit=dev` で実行時の依存だけを入れて、`node <aiqh-src>/src/cli.ts` を起動する `aiqh` を PATH に置く。tarball・npm のパッケージ・GitHub Releases の資産は作らない。対象の `package.json` に依存は足さない

npm レジストリへの公開は行わない（`private: true`）。

---

## 4. CLI コマンド（最終形）

| コマンド | マイルストーン | 入力 | 出力 | 終了コード |
|---|---|---|---|---|
| `aiqh verify` | M0（中核）/ M1（アダプタ） | `aiqh.config.jsonc`、git 状態 | `artifacts/verification/latest.json` / `latest.md` / `history/<timestamp>.json` | 0=PASSED, 1=FAILED, 2=設定・使用法エラー |
| `aiqh init` | M1（実装済み） | 対象リポジトリの実ファイル（package.json、tsconfig、pyproject、venv 等。`.env*` は読まない） | 標準出力に監査表・`aiqh.config.jsonc` 案・追加提案（`.gitignore` の `artifacts/`、scripts）。出力はすべて秘密情報マスクを通す（M1-R1-003）。`--write` は生成物を実行時パーサ / リゾルバで検証してから config のみ書込（M1-R1-006）、`--write-gitignore` / `--write-scripts` は別フラグ、`--force` なしでは上書きしない | 0=完了, 2=監査不能（root が無い・辿れない・ディレクトリでない場合と、検出に使う入口が調べられない場合を含む。ADR-0022） / 既存あり / 検出 0 件 / 生成物が検証不合格 / いずれかの書込失敗（書込先が dangling symlink の拒否を含む。ADR-0022） / 使い方エラー（ADR-0021） |
| `aiqh security-scan` | M1（実装済み） | git 管理下のファイル + 未追跡で ignore されないファイル、`.gitignore` | 標準出力（`--json` 可）: 分類・パス・行番号（PEM は開始–終了行）のみ。値は出力しない。未走査分類と理由を表示 | 0=検出なし, 1=検出あり, 2=非 git / 読取エラー（fail closed）/ 使い方エラー（ADR-0021） |
| `aiqh review-packet` | M2-1（v0.4.0 実装） | commit 範囲 `<from>..<to>`、人間の依頼文・前回レビュー（任意）、`--doc` の文書、`<to>` の verify 結果（`latest.json` が `<to>` かつ clean のときのみ） | `artifacts/ai-review/review-packet-<label>.md`（変更ファイルの全文と差分、実装者の結論なし）、`--zip` でパケットだけを含む ZIP。検査（不正な UTF-8・生文字・秘密の形）に通らなければ何も書かない（ADR-0014） | 0=書いた, 1=検出あり（書かない）, 2=使い方・設定・検査不能・上限・書込エラー（優先順位は ADR-0015） |
| `aiqh review-import` | M2（v0.6.0 で v1: 取り込みだけ） | レビューAI の指摘（Markdown）。v0.6.0: レビューの中の `aiqh-findings` の JSON のブロック 1 つを正本にし、本文の `### <ID>` の見出し・`## 全体の結論` の件数の行・その回の ID と突き合わせる（ADR-0026） | `artifacts/ai-review/findings-<id>.json`（重要度・対象ファイル・種別・対応状況）（v0.6.0 で注記: **`docs/reviews/<label>/findings-r<N>.json`（git 管理）**に変えた。すべて `open`。ADR-0026） | 0 / 2（v0.6.0 で注記: 0 = 取り込んだ・同じレビューを取り込み済み、2 = 読めない・食い違う・使い方・書込のエラーで何も書かない。`open` の件数は表示だけで終了コードに反映しない） |
| `aiqh review-check` | M2-2（v0.7.0: review-import の v2。ADR-0027） | `docs/reviews/<label>/findings-r*.json`（読み取りだけ）。`resolved` の `fixedIn` は git で commit を確かめる | 標準出力: 回ごとの重要度・状態の数、`open` の ID、前の回の評価、警告（終了コードに反映しない）、`REVIEW LOOP: complete` / `incomplete (open N)`。何も書かない | 0=検査に通った（`open` の数・警告にかかわらない）, 2=ファイル・形・状態の欄・前の回の評価の誤り、git が答えない、使い方 |
| `aiqh history` | M4 | 履歴 DB | 表 / JSON、ローカルダッシュボード（静的 HTML） | 0 / 2 |

共通オプション（案）: `--config <path>`, `--cwd <dir>`, `--output-dir <dir>`, `--verbose`, `--json`（標準出力に JSON）。

---

## 5. モジュール分割

```
src/
  cli.ts                  … エントリ（bin: aiqh）。版の読込・シグナル処理・引数の解析と終了コード設定 [M0]
  cli-program.ts          … サブコマンドとオプションの定義（副作用なし。テストが Command オブジェクトを直接見る、M2-1-R3-005） [M2-2]
  node-options.ts         … 起動を拒否する Node のオプション（`--unhandled-rejections=warn`・`--abort-on-uncaught-exception`。`process.execArgv` と NODE_OPTIONS。ADR-0024 決定 6） [v0.5.44]
  output.ts               … 端末への出力の出口（禁止文字を表記 → マスク。1 回の書き出し = 1 行。すべての標準出力・標準エラーが通る、ADR-0016・0017） [M2-2]
  commands/
    verify.ts             … verify のオーケストレーション                                 [M0]
    init.ts               … 監査 → 設定提案 → 配置（--write 系フラグでのみ書込）              [M1 実装済み]
    security-scan.ts      … 内蔵 Security Scan の CLI                                      [M1 実装済み]
    review-packet.ts      … review-packet の CLI（入力の読込、書込、終了コード、マスク）      [M2-1 実装済み]
    review-check.ts       … findings の状態の検査とループ未完了の表示。読み取りだけ（検査は review/check.ts、ファイルの読み取りは review/findings-file.ts）[M2-2 v2、v0.7.0、ADR-0027]
    review-import.ts      … 指摘の構造化保存（読み取りと検査は review/import.ts）          [M2-2 v1 実装済み、v0.6.0。v0.6.1: 名前付きの文字参照の拒否、HTML を除いた形でも ID を探す、再取り込みでも既存のファイルと前の回を確かめる。ADR-0026 の追記]
    history.ts            … 履歴照会・ダッシュボード生成                                   [M4]
  config/
    schema.ts             … 設定スキーマ（zod）。型は zod から導出                          [M0]
    load.ts               … JSONC 読込 → スキーマ検証 → パス正規化（cwd の逸脱検査）        [M0]
  runner/
    execute.ts            … 単一コマンドの子プロセス実行（タイムアウト、プロセスグループ kill）[M0]
    env.ts                … check の環境（aiqh の環境から FORCE_COLOR・PY_COLORS を除き NO_COLOR=1 を足す。check の子の環境を作る 1 か所）[v0.5.24]
    run-checks.ts         … チェックの順次実行、fail-fast、所要時間計測                    [M0]
  report/
    verdict.ts            … PASS/FAIL/SKIPPED から最終判定と分類別サマリを算出              [M0]
    build-report.ts       … 実行結果 → レポートオブジェクト（マスク適用）                   [M0]
    markdown.ts           … レポート → Markdown                                            [M0]
    write.ts              … latest.json / latest.md / history/<ts>.json の書込。書く直前に禁止文字を形式別に変換（JSON `\uXXXX`・Markdown `\u{HEX}`）[M0 / v0.5.24]。履歴の名前は `wx` で排他的に確保してから中身を rename で置く（同じ秒に始まった 2 つの実行が同じ名前を取らない。取られていれば `-2`・`-3` … の規則で次へ。確保から rename までの間に強制終了されると、空のファイルがその名前に残る: 既知の限界。latest の整合は R-010〈M4〉）[v0.5.41]。`writeAtomic` の一時ファイルは、同じディレクトリのランダムな名前（`.<名前>.tmp-<16 桁の 16 進数>`）を `O_EXCL | O_NOFOLLOW` で排他的に作って閉じ、数値の flag `O_WRONLY | O_TRUNC | O_NOFOLLOW`（作成しない）で開き直して書き、rename する（リンクを追わない。Windows は O_NOFOLLOW が無い）[v0.6.1、ADR-0026 決定 16]
  parse/                  … check の出力を表示のためだけに読む（判定と終了コードは見ない。ADR-0028） [v0.8.0]
    select.ts             … パーサの選び方: コマンドの語と、`npm run <script>` / `npm test` なら作業ディレクトリの package.json の script（設定の欄は無い）
    text.ts               … 入力の準備と上限（各ストリームの末尾 1 MiB・1 行 4,096・名前 50 × 300・1,000 ms）、名前のマスク（行ごと、切る前）
    read.ts               … 選んで読む。例外を投げない（parser-error・time-limit は unparsed）
    vitest.ts / eslint.ts / npm-audit.ts / security-scan.ts … 4 つのパーサ（tool.ts は共通の型）
    describe.ts           … 端末と latest.md の要約の文
  security/
    mask.ts               … 秘密情報らしき文字列のパターンマスク。url-credential は正規表現でなく「://」を手がかりにした線形の走査（同じ一致・同じ置換）[M0 / v0.5.41]
  git/
    info.ts               … commit / branch / dirty の取得（非 git でも動作。git が答えられなかったときも null、理由は標準出力の行。ADR-0022）  [M0]
  adapters/               … 検出器 + 推奨コマンド（実行経路は持たない。出力パーサは parse/）    [M1 実装済み]
    types.ts              … Adapter / Detection / Suggestion / RepoContext（M1 の `OutputParser` の下書きは v0.8.0 で消した。パーサは parse/。ADR-0028）
    context.ts            … 読み取り専用の RepoContext（.env* は読まない。ENOENT 以外の失敗は ExaminationError。ADR-0022 決定 9）
    node.ts / python.ts / builtin.ts / index.ts … Node 7 / Python 7 / 内蔵 security 1、分類ごとの解決
  config/generate.ts      … 解決結果 → コメント付き JSONC                                   [M1]
  config/json-schema.ts   … zod → JSON Schema（schema/ に同梱）                              [M1]
  security/patterns.ts    … 秘密情報パターンの単一定義（masker / scanner で共有、R-012）      [M1]
  security/scan.ts        … 内蔵 Security Scan（値を持たない結果型）                          [M1]
  review/packet.ts        … パケット生成（git 呼び出し、判定、段階ごとの検査、md テンプレートでの組み立て。ADR-0014） [M2-1]
  review/checked.ts       … 検査済みの文字列 Checked と描画前の検査 checkValue（描画関数と ZIP はこの型だけを受け取る。実行時の登録簿、
                            finding で塞がれた値 Rejected。M2-1-R3-004 / R3-002） [M2-1 R2]
  review/outcome.ts       … review-packet の終了コードの優先順位（InspectionError / DeferredError / decideOutcome、ADR-0015） [M2-2]
  review/zip.ts           … 無圧縮 ZIP の書き出し（固定日時、zlib.crc32）                      [M2-1]
  security/raw-chars.ts   … 生文字の禁止集合と厳格な UTF-8 検査（パケットと docs テストで共有）  [M2-1]
  review/                 … 指摘パーサ、対応状況モデル                                        [M2-2 以降]
  history/                … 履歴 DB（SQLite または JSONL）、集計、静的ダッシュボード          [M4]
  types.ts                … 共有型（CheckResult, VerificationReport 等）                   [M0]
tests/                    … Vitest（ユニット + CLI 結合）                                  [M0]
docs/                     … 設計書、ADR、レポート
```

責務境界:

- `config/` はファイルシステムと zod にのみ依存し、実行を行わない
- `runner/` は設定の意味（kind / required）を知らず、コマンドを実行して生の結果を返すだけ
- `report/` は結果を解釈して判定・整形するが、副作用は `write.ts` に閉じ込める
- `security/mask.ts` は純粋関数。レポートに書かれる**全ての文字列値**は深い走査で必ずここを通す
- `adapters/`（M1）は「このリポジトリにはこのツールがある → この check 定義を推奨する」を返す。
  verify の実行はあくまで設定に書かれた command であり、アダプタ固有の実行経路は作らない

---

## 6. データの流れ

### 6.1 `aiqh verify`（M0）

```
aiqh.config.jsonc
   │ jsonc-parser で読込（コメント許容）
   ▼
zod スキーマ検証 ──失敗──▶ 終了コード 2（レポートは書かない。fail closed）
   │ 成功
   ▼
git 情報取得（commit / branch / dirty。非 git なら null。git が答えられなかったとき〈実行不能・timeout・「違う」以外の終了〉も null で、理由は標準出力の `git: unavailable (…)` の行。ADR-0022 決定 8）
   ▼
checks[] を設定順に順次実行
   ├─ spawn(command, { cwd, shell: true, detached: true, env })   … env = checkEnv(options.env ?? process.env) = aiqh の環境〈渡された env もこれが元〉から FORCE_COLOR・PY_COLORS を除き NO_COLOR=1 を足したもの（ADR-0020）
   ├─ stdout / stderr を蓄積（上限あり）
   ├─ timeoutSec 超過 → プロセスグループへ SIGTERM → 猶予後 SIGKILL → グループの消滅を確認（SIGKILL の後は最大 2 秒。ADR-0023）→ status FAIL(timedOut)
   ├─ 起動失敗（ENOENT 等）→ FAIL
   └─ exit code 0 → PASS、それ以外 → FAIL
   ├─ 状態が決まった後で、コマンドから選んだパーサが出力の末尾を読む → checks[].parsed（表示用。判定・分類・終了コードは見ない。ADR-0028。v0.8.0）
   ▼
verdict: 必須チェックが全て PASS → PASSED、それ以外 → FAILED
         分類（lint/typecheck/unit/build/security/dependency/e2e）ごとのサマリ。
         設定に存在しない分類は NOT_APPLICABLE
   ▼
レポートオブジェクト生成 → 全文字列値に mask() を適用
   ▼
artifacts/verification/latest.json
artifacts/verification/latest.md
artifacts/verification/history/<YYYYMMDDTHHmmssZ>.json   … 同じ秒の名前が既にあれば <…>-2.json、-3.json …（名前は排他的に確保。v0.5.41）
   ▼
終了コード 0（PASSED）/ 1（FAILED）
```

### 6.1b `aiqh init` と `aiqh security-scan`（M1）

```
aiqh init
  RepoContext（読み取りのみ: package.json / lockfile / tsconfig / venv の bin / pyproject / requirements / .git。.env* は存在確認のみ。
  ENOENT 以外で調べられない入口〈読めない・dangling symlink・不正な package.json・通常ファイルの下など〉があれば ExaminationError → 監査を止めて exit 2、何も書かない。ADR-0022 決定 9）
   ▼
  全アダプタの detect() → 分類ごとに「採用（最初の available）/ 代替 / unavailable（理由・有効化案内）」
   ▼
  監査表 + aiqh.config.jsonc 案（コメント付き JSONC）+ 追加提案（.gitignore の artifacts/、scripts.verify）
   ▼ --write（既存があれば exit 2、--force で上書き）/ --write-gitignore / --write-scripts（書込先が dangling symlink、または root の外を指す symlink〈v0.5.37〉なら exit 2、ADR-0022）
  書込（config は 1 ファイル。scripts は未定義キーのみ追加）

aiqh security-scan
  git ls-files -z（追跡）+ git ls-files -z --others --exclude-standard（未追跡・非 ignore）
   ▼
  未追跡の .env* は読まずに finding（untracked-env。Git が「ignore されていない」と確定済み。example 系は情報のみ）
  lstat: ENOENT（作業ツリーから削除済み）だけスキップ、他の失敗（EACCES / EPERM / ELOOP …）は ScanError → exit 2
   ▼
  各ファイルを 64 KiB チャンクで逐次読み（サイズ上限なし。先頭 8 KiB に NUL があればバイナリとしてスキップ、読取エラーは exit 2）
   ▼
  LineAssembler: 改行で行を切り出す。1 行が security.maxLineBytes（既定 256 KiB）を超えたら窓走査（下記）
  各行: 正規マーカー [REDACTED:<category>] を除去 → 行指向の分類は行単位で照合（同一ファイル・行・分類の重複は 1 件）
        key-value は一致した値が looksLikeSecretValue を通るときだけ finding（M2-0 §6）
        private-key は BEGIN 行 → END 行の状態機械（開始行と終了行を記録。END が無ければファイル末尾までを検出 = fail closed。
        ブロック finding も block:<category>:<begin>:<end> のキーで重複統合、M1-R3-005）
   ▼
  findings: secret / oversized-candidate（分類 / パス / 行番号のみ）、tracked-env（example 系は情報のみ）、untracked-env、gitignore（下記）
   ▼
  security.allow（M2-0 §7）: secret / oversized-candidate だけを抑制。抑制した finding・使った規則・未使用 / 期限切れの規則を必ず出力
   ▼
  exit 0（残る finding なし）/ 1（あり）/ 2（非 git / stat・読取エラー / 設定エラー）。未走査分類（bearer / basic）と理由を必ず表示
```

**窓走査と候補の持ち越し（M1-R2-004 → M2-0 / M1-R3-001 → M2-0-R2-001 → M2-0-R3-001、ADR-0013）**: 改行のないまま溜めた文字列が `maxLineBytes` を超えたら、
その区間を同じ行番号で行指向パターンに掛ける。次の区間へ持ち越すのは固定の重なりではなく**候補プレフィックス**: 各パターンの**有界な開始アンカー**
（`patterns.ts` の `anchor.start`。url-credential は `scheme://`（scheme は 64 文字以内。scanner 用の `scanPattern` の上限で、masker は無制限）、anthropic は `sk-ant-`、aws は `AKIA` / `ASIA`、jwt は `eyJ`、
key-value はキー名のみ、private-key は固定文字列 `-----BEGIN `（M2-0-R3-001。ラベルは本体と同じく無制限なのでアンカーに含めない）。最長一致は `anchorMaxBytes` で宣言）のうち、完全一致に含まれず、かつアンカー位置から区間末尾までが
「一致の途中で切れた形」（`anchor.partial`、`^…$` 固定）に一致するもの、または区間末尾に達した一致の開始位置。**最も早い**位置を採る
（後ろのアンカーから持ち越すと、それより前から始まる秘密値を落とす）。`partial` に一致しない候補（例: 普通の URL `https://host/path` は `/` で解決）は捨てる。
下限は重なり `lineOverlapBytes`（既定 4 KiB、最小 `MIN_LINE_OVERLAP_BYTES` = 256）、上限は `maxCarryBytes`（64 KiB）。上限を超える候補は
「長すぎて完全走査できない」として **`oversized-candidate` finding（分類・行番号のみ）にし、捨てない（fail closed）**。読み取りチャンク
（64 KiB）≤ `maxCarryBytes` なので、区間の最大長は `maxLineBytes + maxCarryBytes` に収まる（`LineAssembler.maxRetained` を単体テストで固定）。

**完全性の不変条件（ADR-0013）**: 任意の 1 行について、窓なしで行スキャナに渡したときの finding は、窓走査でも同じ分類の finding になるか
`oversized-candidate` になる。窓走査だけが 0 件で終わることはない。根拠は 3 つの性質で、それぞれテストで固定する:
(1) アンカーは本体の接頭辞（本体に一致する任意の文字列の先頭で `anchor.start` が一致する）、(2) `partial` は接頭辞について閉じている
（本体一致のアンカー開始位置からのすべての接頭辞に一致する）、(3) 重なり ≥ アンカー長（全 `anchorMaxBytes` ≤ `MIN_LINE_OVERLAP_BYTES` ≤ `lineOverlapBytes`。
窓の末尾にかかるアンカーは重なり部分に丸ごと残る）。(1)(2) は固定の例示値に加え、本体 regex の文字クラスから生成した秘密値（区切り記号を含む）でも確認する。
埋め草がアンカーに一致しない中立な文字のときは、秘密値が `maxCarryBytes` 以下なら同じ分類の finding（oversized ではない）になることも固定する
（すべてを oversized に逃がす実装を排除）。private-key は BEGIN マーカーが完全一致した時点で候補を解決済みにし（ブロック状態機械が鍵本体を持つ）、
1 行内の鍵で finding が重複しない。
(1) は構造でも固定する（M2-0-R3-001）: scanner の本体（と private-key の block begin）は「アンカー部分式 + 残り」の連結で組み立て、
全パターンで本体の source がアンカーの source で始まること（アンカー直後に量化子なし、トップレベルの `|` なし、フラグ同一。例外リストは空）をテストする。
文字列として接頭辞なので、アンカー側の量化子の上限だけが本体より狭くなることは構造上起きない。性質テストの生成器は、各可変部分の長さを
0、1、`anchorMaxBytes`±1、`lineOverlapBytes`±1、`maxCarryBytes`±1 と（上限のない部分は）`maxCarryBytes` 超から選ぶ。書き換えた正規表現が
以前と同じ言語であることは、凍結した v0.3.2 の参照との差分テスト（一致位置・一致文字列が同一）で固定する。
上限は **JS 文字列長（UTF-16 コード単位）で測る**ため、実メモリはおおむね 2 ×（256 KiB + 64 KiB）バイトが上限で、ファイルサイズに比例しない。
行番号は改行の数だけ進む。PEM の状態機械は BEGIN / END 行の判定だけを使うので影響を受けない。
既知の副作用: minified バンドルのような改行のない長行で、区間末尾までアンカーの継続文字だけが 64 KiB 超続く場合（例: `eyJ` で始まる巨大な
base64 文字列）は oversized-candidate になる。実物でないと分かっているなら `security.allow` で理由つきで許容する。
既知の限界（M2-0-R4-001、v0.5.37 で記録）: 窓は独立した文字列として照合されるので、窓の境界で正規表現の左右の文脈（`\b`・否定後読み・key-value の値の判定）が失われ、窓なしでは一致しない文字列が finding になることがある（安全側の誤検出。ADR-0013 の追記〈v0.5.37〉）。

**masker と scanner のパターンの関係（M2-0-R3-002）**: `SECRET_PATTERNS` は検出方針の単一の定義で、masker は各エントリの `pattern` を、
scanner は `scanPattern ?? pattern` を使う。`scanPattern` を持つのは url-credential だけ（scheme を 64 文字までに限った scanner 用。窓のアンカーを
有界にするため）で、テストで固定する。scanner の都合で共有の `pattern` を狭めない（masker の検出範囲が狭まる退行になる。v0.3.2 で実際に起きた）。
masker の出力は代表入力の完全一致テストで固定する。**既知の制限**: scheme が 64 文字を超える URL 認証情報は scanner では検出しない（masker は redact する）。

**窓設定の制約と進捗不変条件（M2-0-R1-001、M2-0-R2-001）**: 3 値は `MIN_LINE_OVERLAP_BYTES (256) <= lineOverlapBytes <= maxCarryBytes <= maxLineBytes` を満たさなければならない
（そうでないと窓の buffer が縮まず走査が終わらない）。3 層で守る: (1) `resolveSecurity()` が既定値を埋めた後に検証し `ConfigError`（exit 2）、
(2) `LineAssembler` のコンストラクタが同じ関係を検証し `ScanError`（設定を経由しない直接構築も対象。判定は `config/window-limits.ts` に一本化）、
(3) 長行ループの各反復で `pending` が必ず短くなる不変条件を置き、短くならなければ `ScanError`（exit 2。将来の変更に対する保険）。
同期ループ中は CLI のシグナルハンドラも走らないため、「終了しない」状態を作らないことが fail closed の前提になる。

`.gitignore` の判定（M1-R1-005）は自前の文字列一致ではなく Git 自身に委ねる: 代表パス（`security.envProbePaths`、既定 `.env` / `.env.local` /
`.env.production` / `.env.development`）を `git -c core.excludesFile=/dev/null check-ignore --no-index -v -n --stdin -z` に渡し、
**「一致したルールの出所がリポジトリ内の追跡済み `.gitignore`（`git ls-files` で確認、M2-0 / M1-R3-004。ネストは出所ごと）で、かつ否定パターン
（`!` 始まり）でない」場合だけ保護あり**と見なす。未追跡の `.gitignore` はクローン先に存在しないため保護と数えない。
否定で再包含された `.env.production` は未保護として報告する。利用者のグローバル除外（`core.excludesFile`）は `-c` で無効化し、
`.git/info/exclude` 由来の一致は出所で除外する（どちらもクローン固有で、push 先を守らない）。`!.env.example` のような
example 系の否定は代表パスに含まれないため許容される。

走査対象を「追跡 + 未追跡（非 ignore）」にするのは多層防御（M1-R1-001）: 新規ファイルを commit する前の自己 verify でも
そのファイルが走査される。ただしリリース判定の根拠は commit 済み HEAD での verify（CLAUDE.md のリリース手順）。
（注記〈v0.8.3〉: プロジェクトの `CLAUDE.md` は v0.8.3 から git の追跡外〈作業者のローカルの決まり〉。）
未追跡の `.env*` は代表パスのプローブに頼らず、存在そのものを finding にする（M1-R2-001。`git ls-files --others --exclude-standard`
に出た時点で ignore されていないことは Git 自身が確定している）。代表 4 パスのプローブは予防的なカバレッジ確認として残す。

`aiqh init` の `artifacts/` 提案も同じ判定関数（`gitIgnoredByRepoRules`）を共用し、**実際の生成物のパス**（`artifacts/verification/latest.json` /
`latest.md` / `history/probe.json`、`artifacts/ai-review/probe.md`）が**すべて**追跡済み `.gitignore` の非否定ルールで ignore されるときだけ
「already ignores」とする（M1-R2-005 → M2-0 / M1-R3-003。sentinel 1 個を狙ったルールでは保護と見なさない）。`--write-gitignore` の書込は 3 分岐
（M1-R3-002 → M2-0-R1-003）: (a) `.gitignore` が追跡済みで git が「未 ignore」と答えた（後段の否定など）→ 同じ行が既にあっても末尾に `artifacts/` を
追記して修復（追記後は git が保護を確認するので 2 回目は追記しない）、(b) `.gitignore` が未追跡で正規行が既にある → 追記せず
「contains artifacts/ but is not tracked; `git add .gitignore` …」と案内（未追跡のルールはクローン先に無いため保護と数えないが、重複追記は無意味）、
(c) `.gitignore` が無い、または git に聞けない → 作成 / 追記を 1 回だけ（同じ行は二度と追記しない）。

`aiqh security-scan` の出力は他コマンドと同じ出口（`src/output.ts`、ADR-0016・0017）を通る（M2-0-R1-002、v0.5.2 の M2-2-R2-001）: text は全行を禁止文字の表記
（v0.5.4 から 1 行の中の LF・TAB も）→ `maskSecrets`、`--json` は文字列とオブジェクトのキーを表記にしてから mask（キーは v0.5.4 から）。
config 由来の自由文（`allow[].reason` / `path`）に秘密の形があってもそのまま再出力しない。`reason` / `path` はスキーマで改行に加えて
C0 / DEL / C1 制御文字と U+2028 / U+2029 を禁止する（M2-0-R2-002。監査ログへの複数行注入・端末制御の防止、ADR-0012）。v0.5.2 から text 出力側でも、
パス・ファイル名・エラー文を含むすべての出力の禁止文字を表記にする（ADR-0016。スキーマでの禁止はそのまま）。

Python アダプタは venv を「`<venv>/bin/python` が実行可能」なときだけ認識し（`PythonContext.python`、M1-R2-003）、
すべての推奨コマンドはその interpreter から始まる。ツールのバイナリも実行権限（X_OK）で確認する（M1-R1-009）。

アダプタは検出と推奨だけを行い、コマンドの実行・判定・書込はしない（ADR-0011）。Node アダプタはローカルの証拠
（dependencies / devDependencies、または `node_modules/.bin/<tool>`）がある場合だけ available とし、直接実行は
`npx --no-install <tool>` の形で提案してネットワーク取得を起こさない（M1-R1-007）。Detection の `reason` に
package.json のスクリプト本文を入れない（M1-R1-003）。verify の実行経路は M0 のまま。

### 6.2 レビューループ（M2）

```
<from>..<to> + 依頼文（人間）+ 前回レビュー + --doc + latest.json（<to> かつ clean のとき）
   ▼ aiqh review-packet（全文・差分・commit メッセージ。検査に通らなければ exit 1 で何も書かない）
artifacts/ai-review/review-packet-<label>.md（+ --zip）──▶ 人間が Astra / Codex に渡す
                                                     ▼
                                          レビュー結果（Markdown）
   ▼ aiqh review-import
artifacts/ai-review/findings-<id>.json（severity / file / kind / status）
   ▼ 実装AI が再修正 → aiqh verify → 再 review-packet …（status が全て resolved/accepted になるまで）
```

（v0.6.0 で注記: 出力は `docs/reviews/<label>/findings-r<N>.json`（git 管理）。入力はレビューの中の `aiqh-findings` の JSON のブロックで、本文と食い違えば exit 2 で何も書かない。状態は `open`・`resolved`・`deferred`・`accepted`・`invalid` の 5 つで、「未完了」は `open` が 1 つでもあること。v1 は取り込み〈すべて `open`〉だけで、状態の検査・前の回の状態の引き継ぎ・未完了の表示は v2。依頼文のひな形は `docs/ops/review-request-template.md`。ADR-0026。v0.6.1 で注記: 名前付きの文字参照〈5 つを除く〉は exit 2、その回の ID は文字参照を戻し HTML を除いた形でも探す、同じ原文の再取り込みでも既存のファイルと前の回を確かめる〈ADR-0026 の追記〉。v0.7.0 で注記: 状態の検査とループ未完了の表示は `aiqh review-check`〈読み取りだけ。ADR-0027〉。review-import も書いた後に `REVIEW LOOP:` の行を出す。手順は `docs/ops/review-loop.md`）

### 6.3 履歴（M4）

`history/<ts>.json` を複数プロジェクト分取り込み、PASS/FAIL 推移・所要時間・失敗しやすいチェックを集計する。
保存先は各プロジェクトの `artifacts/` ではなく、ユーザーローカルの 1 箇所（例: `~/.aiqh/history.db`）を想定する。

---

## 7. レポート仕様（M0 で確定する部分）

### 7.1 JSON（`latest.json` / `history/<ts>.json`）

```jsonc
{
  "schemaVersion": 1,
  "tool": { "name": "ai-quality-harness", "version": "0.1.0" },
  "project": { "name": "ai-quality-harness", "root": "/abs/path" },
  "configPath": "/abs/path/aiqh.config.jsonc",
  "startedAt": "2026-09-15T12:00:00.000Z",
  "finishedAt": "2026-09-15T12:03:10.000Z",
  "durationMs": 190000,
  "git": { "commit": "abcdef…", "branch": "main", "dirty": false },   // 非 git なら null（git が答えられなかったときも null。理由は標準出力の行）。dirty は取得失敗時 null（unknown）。commit・branch は、git の失敗でも null（標準出力の行で `unknown`。v0.5.37）
  "verdict": "PASSED",                                                 // "PASSED" | "FAILED" | "ERROR"（ERROR は中断時。R3-002）
  "exitCode": 0,                                                       // 0 | 1 | 128+シグナル番号（中断時）
  "interruptedBy": null,                                               // 中断時はシグナル名（"SIGINT" 等）。設定エラー由来の ERROR はレポート自体を書かない
  "summary": { "total": 5, "passed": 5, "failed": 0, "skipped": 0, "requiredFailed": 0 },
  "categories": {                                                      // 7 分類の固定キー
    "lint": "PASS", "typecheck": "PASS", "unit": "PASS", "build": "PASS",
    "security": "NOT_APPLICABLE", "dependency": "PASS", "e2e": "NOT_APPLICABLE"
  },
  "checks": [
    {
      "name": "lint", "kind": "lint", "command": "npm run lint", "cwd": ".",
      "required": true, "timeoutSec": 300,
      "status": "PASS",                       // "PASS" | "FAIL" | "SKIPPED"
      "exitCode": 0, "signal": null, "timedOut": false,
      "startedAt": "…", "durationMs": 4200,
      "errorSummary": null,                   // FAIL 時: 先頭行など短い要約
      "stdoutTail": "…", "stderrTail": "…",   // マスク済み・末尾 N 行
      "outputTruncated": false,
      "parsed": {                             // v0.8.0（ADR-0028）。表示用で判定には使わない。古いレポートには無い。schemaVersion は 1 のまま
        "tool": "vitest",                     // "vitest" | "eslint" | "npm-audit" | "aiqh-security-scan" | null
        "status": "parsed",                   // "parsed" | "unparsed" | "not-applicable"
        "reason": null,                       // 決まった語（no-parser / several-tools / not-run / script-unreadable / no-summary / unexpected-summary / time-limit / parser-error）
        "truncated": false,
        "counts": { "testFiles": 156, "testFilesPassed": 156, "tests": 2036, "testsPassed": 2036 },  // ツールごとの決まったキー（抜粋）
        "items": [],                          // { kind, name }（名前は行ごとにマスクしてから 300 で切る。最大 50）
        "itemsOmitted": 0
      }
    }
  ]
}
```

### 7.2 Markdown（`latest.md`）

見出し、最終判定、メタ情報（日時・commit・branch・dirty・所要時間）、チェック一覧表、
分類別サマリ表、失敗チェックの詳細（errorSummary と出力末尾）。人間と独立レビューAI がそのまま読める形にする。
v0.8.0: どれかの check の出力が読まれたときだけ、チェック一覧表の後ろに `## Parsed Output`（ツール・状態・要約の表と、check ごとの名前の一覧。ADR-0028）。
v0.8.1（M2-2-PS-R1-001）: ツールの出力から来る文字列は Markdown の構文として読まれない形で書く。check ごとの名前の一覧は 1 つのコードブロック（fence は出力の末尾と同じ `fenceFor`）の行、失敗の詳細の `- Summary:` の行（`errorSummary`）は 1 つの行内のコード（区切りは中の最長のバッククォートの並び +1。端の規則は ADR-0028 の追記の決定 11）。`latest.json` と端末は変わらない。

---

## 8. ディレクトリ規約

| パス | 管理 | 用途 |
|---|---|---|
| `artifacts/verification/` | git 管理外 | verify の出力（latest / history） |
| `artifacts/ai-review/` | git 管理外 | レビューパケット、取り込んだ指摘 |
| `docs/reports/` | git 管理 | 人間向けのマイルストーン報告（M0_REPORT.md 等） |
| `docs/ops/` | git 管理 | 運用の手順書（CI と Branch Protection。v0.5.45） |
| `docs/reviews/<label>/` | git 管理 | 独立レビューの原文の収録（`review-r<N>.md` など）・対応記録（`response-r<N>.md`）・取り込んだ指摘（`findings-r<N>.json`。v0.6.0、ADR-0026） |
| `.github/` | git 管理 | 自己 CI のワークフローと CODEOWNERS（v0.5.45。ADR-0025） |
| `tmp/` | git 管理外 | 作業用一時ファイル |
| `dist/` | git 管理外 | ビルド成果物 |

`artifacts/` を管理外にする根拠は ADR-0007 を参照。

---

## 9. セキュリティ設計

### 9.1 信頼境界（trust boundary）

`aiqh.config.jsonc` は**リポジトリ所有者が管理する信頼された入力**である。`package.json` の scripts と同じ
信頼レベルであり、設定に書かれた `command` はそのまま shell で実行される。したがって aiqh が保証する
fail closed は「現在読み込んだ設定に対して」のものであり、**改変された設定（必須チェックを常に成功する
コマンドに差し替える等）や弱体化された scripts に対する独立性は提供しない**（独立レビュー R-006）。

この境界を守るのは aiqh ではなく、リポジトリ側の統制（設定ファイルのコードレビュー、Branch Protection、
CODEOWNERS 等）である。設定改変への対策候補（保護されたポリシー、設定ハッシュの固定、品質ポリシー変更時の
別承認）は `docs/ROADMAP.md` の M3 / M4 に記載する。

### 9.2 実装上の対策

- **設定は秘密を持てない**: 設定ファイルには `command` / `cwd` / `timeoutSec` 等の構造化フィールドしかなく、
  秘密値を置く場所がない。環境変数は親プロセスから継承するのみで、設定から注入しない（M1 で名前の許可リスト方式を検討）。
- **子プロセス**: `command` は 9.1 の信頼境界に基づき shell 経由で実行する（ADR-0005）。
- **タイムアウト後の後始末ライフサイクル**（R-004、R2-002、ADR-0023）:
  1. spawn 時にプロセスグループ id（= leader の pid）を保存する
  2. タイムアウト → グループへ SIGTERM（leader の生死にかかわらず `kill(-pgid)`）
  3. 猶予（既定 5 秒、`killGraceMs`）→ グループへ SIGKILL
  4. `close` が来て、かつ `kill(-pgid, 0)` が ESRCH（グループ消滅）を返すまで、runner の Promise は解決しない（25 ms ごとに確認する）。
     leader の `close` だけでは解決しない（孫が stdout/stderr を閉じていても、グループの消滅まで待つ。消えたら猶予の終わりを待たずに解決する）。
     待ちには上限がある: SIGKILL を送った後（SIGKILL の前にグループが消えたのに `close` が来ないときは、消えたと分かった時点から）最大 `confirmMs`（既定 2 秒、
     `DEFAULT_CONFIRM_MS`）で、それでも確定しなければ pipe と子の handle を解放して確定する。このときグループが残っていれば `terminationUnconfirmed` を付け、
     `errorSummary` は「消えていない」と書く（`process group terminated` と書くのは、消えたことを確認できたときだけ）。グループが消えていて `close` だけが来ないとき
     （別のプロセスグループへ移った子孫が pipe を握っているなど）は、消えていないとは書かない。v0.5.33（ADR-0023）より前は、SIGKILL の送信で確定し、グループの消滅を確かめず、
     `close` が来なければ待ち続けた（v0.5.7 で文言を実装に合わせた）。
     一度 ESRCH を見た（signal 0 でも、グループへのシグナルの送信でも）グループには、以後 signal 0 も SIGKILL も送らない（同じ番号が別のグループに再利用されうるため。
     `terminateActiveChildren` と記録を共有する。最初のシグナルの前は、leader が先に終わって `close` が未着のときだけ、leader の `exit` から 25 ms ごとに signal 0 で確かめる〈v0.5.38、ROADMAP 項目 28。それまでは確認なしで送った。グループの消滅から次の確認が実際に走るまでの再利用は残る。25 ms〈`terminateActiveChildren` の確認は 50 ms〉は確認のタイマーの設定値で上限ではなく、イベントループやスケジューラの遅れの分だけ長くなりうる。「最後の確認から送信まで」の窓も同じ。v0.5.39 で訂正〉。グループ経路があるときは、そのグループの leader へも子の pid への直接送信をしない
     〈直接送るのは、グループへの送信が ESRCH 以外で失敗したときだけ。v0.5.35〉。子の pid への直接送信が ESRCH を返したら、その pid へは以後直接送らない〈v0.5.36〉。v0.5.34、ADR-0023 決定 9）
  5. エスカレーション待ちのタイマー（猶予・確認のポーリング）は `unref()` しない（イベントループが空になって SIGKILL 前に終了する経路を塞ぐ）
  6. シグナルはグループへ送り、ESRCH 以外で失敗したら子へ `process.kill(pid, signal)` で送る（`child.kill()` の失敗は `error` イベントになり、spawn の失敗と取り違えるため使わない）。
     どちらにも送れない（EPERM など）ときは errno を覚え、上の 4 の打ち切りで「送れず、消えていない」と書く（グループへ送れず、子が既に無い〈ESRCH〉ときも、グループの errno を覚える。v0.5.36）。`error` イベントで確定するのは、起動に失敗したとき（pid が無いとき）だけ
  7. 別のプロセスグループへ移った子孫（`setsid` 相当）は、この仕組みでは止められない（保証の外）。macOS / Linux が対象で、Windows は対象外（M0 から変わらない）
- **中断機構（R3-002）**: SIGINT / SIGTERM を受けた CLI は次の順で動く。
  1. `AbortController.abort(<シグナル名>)` で中断状態を立てる。この `AbortSignal` は `runVerify → runChecks → executeCommand`
     に渡されており、`runChecks` は各チェックの開始前に、`executeCommand` は spawn の直前と直後に中断を確認する。
     中断後に新しいプロセスが起動することはない
  2. 実行中のグループを後始末する（`terminateActiveChildren`: SIGTERM → 猶予 5 秒〈その間、全グループを調べる。v0.5.36〉→ SIGKILL → 消滅確認〈最大 2 秒〉。CLI はこれを待たない。
     実行中の `executeCommand` 自身も abort を受けて SIGTERM → 猶予 → SIGKILL を行い、上の 4 の条件で確定する〈消滅を確認し、SIGKILL の後は最大 2 秒。
     既定では、猶予 5 秒 + 確認 2 秒 = 7 秒が、5 の安全弁の 8 秒より 1 秒短い。これは定数の関係で、テストで固定しているのもそこまで。レポートが先に書かれる保証ではない〈5 を参照〉）
  3. `runVerify` が未実行チェックを SKIPPED（理由: `run interrupted by SIGINT`）として記録し、
     `verdict: "ERROR"`、`interruptedBy: "SIGINT"` のレポートを書き、`VERIFY ERROR (interrupted by SIGINT)` を出力する。
     未実行チェックは開始表示（`$ <command>`）を出さず `[n/total] name — SKIPPED (reason)` とだけ表示する（R4-003）
  4. 通常の戻り値経路で 128 + シグナル番号（130 / 143）で終了する。ハンドラ内で即 `process.exit()` はしない。
     ハンドラは受信時にバックアップとして `process.exitCode = 130 / 143` を即設定する（R4-001）
  5. 安全弁: 猶予 + 3 秒（既定 8 秒）以内に終了しなければ同じ終了コードで強制終了する。安全弁はシグナル受信から数える最後の強制終了で、runner の確認は SIGKILL のタイマーが実際に動いた時刻から数え、
     レポートの書き込みは runner が返った後で上限が無い。そのため、通常のスケジューリングでは runner の既定の上限が安全弁より 1 秒短いが、極端なイベントループの停止やレポート書き込みの遅れの下では、
     レポートの完了前に安全弁が発火しうる（実測: 1.5 秒の停止で 8,018 ms に発火し、レポートは書かれなかった）。そのときも終了コードはシグナル由来の非 0（130 / 143）のままで、fail closed は保たれる（v0.5.34、ADR-0023 決定 7）
- **検証結果（verdict）の確定点（R4-001 B 案、R5-002 / R5-003 で定義を整理）**: 全チェックの終了コードが揃った後、
  `runVerify` はイベントループを 1 周回す（`yieldFullIteration()`: `setImmediate` を 2 回 await。libuv は保留中の OS シグナルを
  **poll フェーズ**で配送するため、poll 由来の継続から 1 回だけ待つと同じ反復の check フェーズで戻り次の poll を経ない。
  2 回目の immediate は次の反復の poll の後で解決する。v0.1.3 は 1 回だけで 10 回中 4 回取りこぼし、v0.1.4 で修正）。
  **観測可能な意味論**: 全チェック完了後、イベントループを 1 周（poll フェーズを含む）回した時点までに Node が JS へ配送した
  シグナルは中断として扱う。その時点より後に到着し、まだ配送されていないシグナルは確定後のシグナルとして扱い、検証結果を変えない。
  **OS への到着時刻を基準とした完全な保証は JS のイベントループだけでは提供しない**（R5-002）。
  verdict が確定した時点で CLI は `onVerdictFixed` でシグナルハンドラを「確定済み」用に**差し替える**（解除ではない。listener が
  0 になると Node は既定動作に戻りプロセスが強制終了されるため）。差し替えは新ハンドラを `process.on()` で登録してから旧ハンドラを
  `process.off()` する順で行い、listener が 0 件になる瞬間を作らない（R5-001）。差し替え中は一時的に 2 リスナーが
  登録されるが、通常の OS シグナルは非同期に配送されるため、同期的な差し替え完了後のリスナー集合（新ハンドラのみ）で
  処理される。内部フック等から同期的に `process.emit()` した場合のみ両リスナーが実行され得る（R6-003）。確定済みハンドラは stderr に
  `SIGINT received after the verdict was fixed; result unchanged` と出して何もしない
- **CLI の終了結果（R5-003、案 A）**: verdict の確定点とは別。レポートの書込（atomic rename）に成功した後、verdict に対応して
  終了コード 0 / 1 になる。書込に失敗した場合は R-007 どおり `VERIFY ERROR (report write error)`、終了コード 2。
  つまり verdict は確定点で固定されるが、CLI の終了結果はレポート書込の成否を経て決まる
- **出力の末尾保持**: 子プロセスの stdout / stderr はストリームごとにメモリ上限（既定 10MiB）まで保持し、超過分は**先頭からバイト単位**で
  切り詰める。上限より大きい単一チャンクでも末尾が残る（v0.1.3 まではチャンク単位で捨てていたため、単一の大きな write で
  出力が空になる欠陥があった。v0.1.4 で修正）。切り詰め後の先頭が UTF-8 の継続バイトである間は最大 3 バイトまで追加で捨てて
  コードポイント境界に揃えるため、保持量は上限より**最大 3 バイト少なくなる**ことがある（R5-004、v0.1.5）。
- **中断されたチェックのレポート項目（R4-002）**: 中断されたチェックは `status: "SKIPPED"` だが、実行の事実は保持する。
  `timedOut` は「中断前にタイムアウトへ到達していたか」、`outputTruncated` は「取得済み出力が上限（メモリ 10MiB / 末尾 200 行 64KB）で
  切り詰められたか」を表し、`stdoutTail` / `stderrTail` は stdout / stderr が閉じる（`close`）までに取得した出力の末尾（中断の後、後始末の猶予の間に
  取得できた出力を含む。runner は `close` が来て、かつグループが消えたときに結果を確定する。SIGKILL の後の待ちは最大 2 秒で、打ち切るときは pipe を解放するので、
  それ以後に出た出力は取らない。v0.5.33〈ADR-0023〉より前は SIGKILL の送信で確定した。v0.5.6・v0.5.7 で実装に合わせて文言を直した）。`errorSummary` に中断理由（シグナル名）を書く。
  タイムアウトと中断がほぼ同時のときは、runner のイベントループで先に処理した方を先とする（中断を先に処理すると、まだ来ていないタイムアウトは取り消され、
  記録されない。`timedOut: true` は runner がタイムアウトの処理〈SIGTERM〉を実際に行ったことと一致する。v0.5.6、M2-2-FLAKE-001）
- **exit と close の間の中断**: `executeCommand` は子の `exit` ではなく `close`（標準出力・標準エラーが閉じた後）で結果を確定する。そのため、子が OS の上では
  終わっていても、runner が `close` を処理する前に中断が来たチェックは、中断されたチェックとして SKIPPED になる（終了コードは記録しない）。安全側で、
  verdict は中断により ERROR になる。挙動は変えない（v0.5.6 で明記）
- **テストの後始末（v0.5.8、M2-2-R5-001）**: テストの後始末は、失敗・タイムアウトの経路でも `afterEach` の中で終える（ワーカーの寿命に任せない。vitest は
  テストファイルが終わるとワーカーを止めるので、実行中の runner のタイマーは働かず、テストのタイムアウトではテストの中の `finally` も実行されない）。
  止めるのは runner の AbortController か ChildProcess の handle だけで、ファイルから読んだ pid には signal を送らない（`tests/helpers.ts` の `stopper`・
  `runCleanups`。止めた相手の確定は、その猶予 ＋ 5 秒まで待ち、超えたらテストを失敗にする）
- **パスの包含判定**: `cwd` と `output.dir` はプロジェクトルート内に制限する。字句上の判定に加え、
  realpath（symlink 解決後）でも判定し、ルート内の symlink がルート外を指す場合は設定エラーにする（R-005）。
  祖先探索は `lstat` ベースで、dangling symlink（リンク先が未作成）は解決できないため安全側に設定エラーとする（R2-003）。
  祖先探索で調べられないエントリ（lstat の失敗が ENOENT 以外: 権限で辿れないディレクトリの EACCES、通常ファイルの下の ENOTDIR、symlink の輪の ELOOP など）に当たったときも、
  判定を盲目にしないため設定エラーにする（「無い」とするのは ENOENT だけ。v0.5.29、ADR-0022）。読込のエラーなので終了コードは 2 で、check は走らず、レポートも書かない
  （この 2 は、ADR-0021 の使い方エラーとは別の、設定エラー・書込失敗の 2）。
- **配布の受入テスト**: 自己 verify の `package` チェック（`scripts/package-smoke.ts`）が `npm pack` → 一時ディレクトリへ
  install → `npx --no-install aiqh verify` を毎回実行し、bin / shebang / `files` / 実行時依存 / version を検証する（R2-005）。
- **出力のマスク**: レポートに書く全ての文字列値はパターンマスクを通す。値そのものは保存しない（ADR-0006）。
- **端末への出力の出口（v0.5.2、ADR-0016、M2-2-R2-001。v0.5.4、ADR-0017、M2-2-R3-001〜003。v0.5.10、ADR-0018、M2-2-R4-001）**: すべての標準出力・標準エラーは `src/output.ts` を通る
  （各コマンドは `createOutput()`、`src/cli.ts` とオプションの解析は `writeError()`、commander は `configureOutput(COMMANDER_OUTPUT)`）。処理の順序は、禁止文字
  （raw-chars.ts の集合）を `\u{HEX}` の表記にする → masker。**1 回の書き出し = 1 行**（v0.5.4）: 1 行の中の LF・TAB も表記にする。複数行はコマンド自身の書式
  だけを block で書く（init の設定案、設定の検証エラーの zod の詳細、commander の help と使い方エラーの提案の行）。block は行を保ち、各行を 1 行と同じく処理する。
  設定案のコメントに入る値は作る所で表記にする（`--write` で書くファイルも同じ）。`ConfigError` は見出し（1 行）と詳細（block）を分けて持つ。
  JSON は JSON のデータだけを受け付ける（v0.5.10、ADR-0018: 文字列・有限の数・真偽値・null・配列・プロトタイプが `Object.prototype` か null の object。
  各プロパティを記述子で 1 回だけ読み、getter・`toJSON`・Proxy の `get` のトラップを呼ばない。関数・`undefined`・`NaN`・accessor・循環・101 段以上の入れ子などは、
  出力の前に拒否して exit 2。メッセージは種類だけ〈値を調べる操作が投げたときも、投げられた値を読まずに固定の種類にする。v0.5.12〉）。
  キーと文字列を表記にしてから mask し、変換の後にキーが衝突したら出さない（exit 2）。端末に書くのは `emitOut` / `emitErr` の 2 つだけで、
  引数は `safeText` / `safeJson` だけが作る型 `Safe`。型情報付きの構造テスト（`tests/structure/output-guard.ts`）が、`console`・`process.stdout` / `process.stderr` の
  参照を 2 つの基本関数の中だけに限り、端末に 1 つのプロパティで届くオブジェクト（`process`・`globalThis`）の動的・反射的な扱い、型検査で中身が見えないコード
  （`Function`・`eval`・`require`・`createRequire`・計算された `import()`・`node:vm` の読み込み）、fd への書き込みと `/dev/` のパス、`stdio` が pipe / ignore でない子プロセス、
  `safeText` / `safeJson` の外で作る `Safe` を禁止する。v0.5.17 から（ADR-0019）、同じ構造テストが、`src/` が実行時に読み込むモジュールを一覧で限る（組み込みは
  `node:` 付きの child_process・crypto・fs・path・string_decoder・zlib だけ。ほかに許すのは `src/` のソースファイルと package.json の `dependencies`。`import type` は
  見ない）。`process` の `getBuiltinModule`・`dlopen`・`report`・`emitWarning`・`execve`・`stdin` は、宣言で見つけて違反にする（`getBuiltinModule` は名前を問わない。
  要素アクセスのキーは、ソース上の文字列リテラルだけを安全とし、それ以外は型がどうでも違反にする〈型は実行時の値を保証しない〉。キーの型がメンバーの名前 1 つに決まるときは、その名前で
  報告する。v0.5.19、M2-2-BUILTIN-R2-001、ADR-0019 の決定 2・7）。許可の根拠は、構文・最上位の宣言の名前・宣言の解決にし、型を許可の根拠にするのは表に明示した 2 つ（writer の引数が全枝で `Safe`、総称型の cast の carrier）だけで、ほかの型は違反を見つけるために使う。型は union・intersection・型パラメーターの
  constraint の枝まで分解して見て、どれか 1 枝でも危険なら違反にする（ADR-0019 の決定 7。その表は、決定の対象として棚卸しした許可の分岐で、`tests/structure/` のすべての許可の一覧ではない。v0.5.19 で書いた「型は違反を見つけるためだけに使う」は広すぎたので、v0.5.20 で表のとおりに
  範囲を直し、v0.5.21 で表の範囲を狭く明記した）。要素アクセスのキーと child の `stdio` はソース上のリテラル（`stdio` は、値も options の object も計算された名前も wrapper を剥がして見て、後ろの spread・計算された名前は違反）、端末への書き込みの許可（writer）と `Safe`・`Checked`・`Md` の生成者の許可は
  ファイル + 最上位の宣言の名前（writer は `emitOut` = `console.log`・`process.stdout.write`、`emitErr` = `console.error`・`process.stderr.write` の組で、引数は全枝が `Safe` の 1 つ）、fs・child_process の関数は
  呼び出しの callee としてだけ（要素アクセス・分割代入・`fs/promises` の参照も見る。その入口は名前付き import の関数だけで、default import・`import * as`・`{ promises }`・`export *`・動的 `import()` は違反。関数を名前で export する形〈再 export〉も違反。v0.5.22・v0.5.23）、総称型の cast は必須の T の引数があるときだけ許す。型が `any` の値の呼び出しと fs の書き込み先、`.constructor` の読み取り、fd option（型が `fd` を持つ枝のある引数。キーが静的に分からない fs の呼び出しの引数も。`createReadStream`・`createWriteStream` の options は省略・文字列・新しい object literal だけで、`new Utf8Stream` と `Utf8Stream` の値の import・再 export は違反。v0.5.22・v0.5.23）、`this` を使う listener を `process.on` などに渡す形（`process["on"]` の要素アクセスでも。別名は shorthand property・class field を含めて何段でも追う。v0.5.22・v0.5.23）、リテラルのキーの
  `eval`・`Function`・`require`・`createRequire` は違反。fs のリテラルのパスは `.`・`//`・`x/../` を畳んでから、`FS_WRITERS` は先頭の引数だけ・ほかの fs の関数は全引数で `/dev/`・`/proc/` を見る）。
  一覧を変えるときは ADR-0019 に追記し、独立レビューの対象にする。ファイルへの出力（レポート、init が書く設定）は、v0.5.24 から書き込みの出口で形式別に禁止文字を表記にする（JSON は `\uXXXX`、Markdown は `\u{HEX}`。review-packet は fail closed のまま。ADR-0020）。
  既知の限界（ADR-0017）: 設定の検証エラーの詳細の中の設定の値の LF は残る（設定は信頼された入力、R-006）。
  既知の限界（ADR-0019）: 構造テストは次を扱わない。実行時に組み立てたパスへの fs の書き込み（検出するのはリテラルの `/dev/`・`/proc/` のパスと数値の fd だけ）、
  自分自身への SIGUSR1（inspector の起動）、依存のパッケージの中の出力、子プロセスが自分で端末を開くこと。コールバックの中の未処理の例外・拒否の形も
  構造テストは見ない（CLI は v0.5.42 から、それを出口を通した 1 行と exit 2 で終える。ADR-0024）。一覧は端末への出力のためのもので、`src/` がネットワークを使わないことは保証しない。
  構造テストは、悪意のあるコードに対する保証ではなく、実装 AI の不注意・安易な迂回を止める機械的な検査である（ADR-0019 の既知の限界）。名前を書かずに `Function` を得て関数型へ cast する経路
  （`Reflect.get(fn, "constructor")`、`obj[k]`）、EventEmitter の `this` のうち Record・配列・非リテラルの要素アクセス・parameter・戻り値・getter の先の listener（`process.on` に渡した関数は `process` を `this` として呼ばれる。直接解決できる listener は v0.5.22 で違反にした）、URL オブジェクトや実行時に組み立てた fs のパス、
  `process`・`globalThis` を値として得る未知の経路は、塞がない・保証しない。端末への出力の境界は、構造テストのほかに、CLI を子プロセスとして動かして出力を確かめる回帰テストと、
  `src/output.ts` の 2 つの基本関数に支えられている。v0.5.20 の既知の限界（ADR-0019）: path と fd の両方を受ける fs の書き込みの先頭の引数は、静的な型が `string` なら fd として見ない（型アサーション・`satisfies` を
  付けた形だけを違反にする）、総称型の cast の残る形（必須の T の引数と、別の値の cast）、brand-guard の広げのうち写像型〈`Record<K, string>`〉の target（v0.5.43 で、文脈の型のあるすべての位置と深さの上限なしの探索にした。残るのはこの形だけ）、読み取りの device path の誤検出。EventEmitter の `this` は、
  v0.5.20 に試作した狭い規則を v0.5.22 で採った（直接解決できる形だけ。Record 経由の登録は残る。(ii)）。許可モジュールごとの入口と規則は ADR-0019 の入口の表
  （グローバルの `fetch` などは残る）。
  v0.5.4〜v0.5.16 の既知の限界だった `worker_threads`・`node:repl`・`node:test`・`tty.WriteStream`・`util.debuglog`・`process.emitWarning` と、v0.5.5 で追記した
  `process.getBuiltinModule(…)`・`process.dlopen`・`process.report.writeReport("stdout")` は、v0.5.17 で解消した（バックログ 1）。
  `safeJson()` が JSON のデータでない値を処理しない件（同じく v0.5.5 で追記した既知の限界）は、v0.5.10 で解消した（ADR-0018。ファイルへの出力の `maskDeep()` は
  v0.5.24 で同じ JSON データの写しにした: ADR-0020）。
  v0.5.11 で追記（M2-2 独立レビュー R7）した Proxy の 3 件（配列の `length` を `get` で読む、配列のキーを個数だけで確かめる、トラップの例外をそのまま伝える）は、
  v0.5.12 で解消した（ADR-0018）。v0.5.12 で追記: CLI の最上位の catch（`src/cli.ts`）は、調べると例外になる投げられた値（同じプロセスの中で作った Proxy など）では
  それ自体が例外になり、Node の既定の表示で生の文字列が出て exit 1 になる（`safeJson()` を通る経路は v0.5.12 で閉じた。今のコマンドにそのような値は無い）。
  v0.5.14 で解消した: 最上位の catch は最初に exit 2 を決め、投げられた値を調べる操作と 1 行目の組み立てを try の中でだけ行い、失敗したら固定の文
  `(the thrown value could not be inspected)` にする（値は読み直さない。書けない行は飛ばす。ADR-0018）
- **対応プラットフォーム**: POSIX（macOS / Linux）。プロセスグループ制御と `realpath` に依存するため、
  Windows は M0 の対象外（R-011）。Linux CI は M3 で追加する。（v0.5.45 で注記: 自己 CI〈`.github/workflows/ci.yml`〉に Ubuntu の `verify (ubuntu)` を足した。最初は必須にしない。Windows は失敗しても止めない測定のジョブだけで、対象外のまま。ADR-0025）
- **レビューパケットの検査（M2-1、ADR-0014）**: `aiqh review-packet` は、描画されるオプションの値（入口の一覧から、git の前）→ すべてのパス →
  入力ごと（不正な UTF-8 → 生文字 → 秘密の形）→ 組み立てたパケット全体、の順に検査し、1 件でもあれば exit 1 で何も書かない。
  finding があっても検査は最後まで続け、finding のある値は git に渡さない。終了コードは検査不能（exit 2）→ 検出（exit 1）→ 出力しない判断（exit 2）の順（v0.5.0、ADR-0015）。
  `--range` に finding があっても、範囲に依存しない検査（作業ツリー、root、依頼文・レビュー、`latest.json` の読取）は行う。`latest.json` と既定の設定ファイルは
  ENOENT のときだけ「無い」とし、それ以外の読取の失敗は exit 2（v0.5.1、M2-2-R1-001 / R1-007）。
  描画する値は検査済みの型 `Checked` だけが描画関数と ZIP のエントリ名に渡る（v0.4.2。v0.5.0 から型情報付きの構造テストと実行時の登録簿で固定）。`security.allow` は出所のリポジトリパスと行に適用する。
  出力は出所・行・分類またはコードポイントのみ。git はシェルを経由せず引数配列で呼び、パスは `-z` で読む。書き込みはパケットと ZIP の 2 段階
  （準備 → 確定。確定点の前の失敗は戻し、後の退避削除の失敗は警告）
- **テストが起動する外部コマンド（M2-1-R2-004 / R3-006）**: テストが起動してよいのは git と node（`process.execPath`）で、unzip / python3 は
  その有無を確かめる probe と、それを条件にした `skipIf` / `runIf` の中だけ。probe は「そのツールだけを起動する child_process の呼び出し」を初期値に持つ変数 1 つにつき
  1 ツールで、複数のツールを起動する変数と、tool 名を文字列として含むだけの変数は probe ではない（v0.5.28、M2-2-R1-003。`skipIf` の条件の向きは読まない。ADR-0014）。
  `tests/structure/process-guard.ts`（型情報付き）が child_process の宣言に解決される呼び出しをすべて調べる。文字列の中からの起動（`node -e` のスクリプトなど）は静的には見えない。自己 verify の `unit-minpath`
  （`scripts/test-minimal-path.ts`: PATH を node と git の symlink だけを置いた一時ディレクトリにして全テストを実行、終了後に削除）は、そのうち
  **PATH の名前解決で起動する、宣言していないコマンド**を検出する（v0.5.1 で保証の記述を狭めた。M2-2-R1-005・006）: 絶対パスでの起動は防がない（保証の外。v0.5.37 で決めた、バックログ 6。runner のシェル `/bin/sh` も絶対パスで起動される）。
  vitest に渡す環境変数は PATH・`NO_COLOR`・`FORCE_COLOR` だけで、ほかは引き継がない（v0.5.37。実測で、ほかの変数は要らなかった）。
  **止め方（v0.5.38、ROADMAP 項目 5・N3）**: vitest は、見張り役（`scripts/minpath-watchdog.ts`）が先頭の別のプロセスグループ（detached）で動く。スクリプトは見張り役の stdin に pipe をつなぎ、止めるとき（SIGINT・SIGTERM・時間切れ）はその pipe を閉じる。
  pipe は、スクリプトがどの形で終わっても閉じる（runner がスクリプトのグループへ SIGKILL を送ったときも。その SIGKILL は見張り役のグループには届かない）。見張り役は pipe の終わりを見ると、スクリプトの一時ディレクトリ（絶対パスで、名前が `aiqh-minpath-` で始まるものだけ）を消し
  （SIGKILL の後はスクリプトの `finally` が走らない: N3）、`process.kill(0, "SIGKILL")` で自分のグループ（vitest・worker・その子孫のうちグループに残ったもの）を止める。送る時点で見張り役自身がグループの中にいるので、番号が別のグループを指すことは無い。
  見張り役は、自分がグループの先頭でなければ（detached で起動されていなければ）、何も起動せずに exit 2 で終わる（`kill(0)` が呼び出し元のグループに届かないように）。
  終了コード: vitest のもの（vitest がシグナル n で終わったときは 128 + n。v0.5.37 までは 2）、git が無い・見張り役か vitest を起動できないときは 2、スクリプトが SIGINT / SIGTERM を受けたときは 130 / 143。
  残るもの: テストが自分で別のプロセスグループ（detached）にした子は止めない（以前と同じ）。runner のグループへの SIGKILL の後、見張り役が止めるまで vitest は短いあいだ残る（backlog-rest の SP1 の試作の実測で、最大約 0.6 秒。250 ms 間隔の計測）。
  その間 vitest は出力の pipe を握るので、runner の `close` はその分遅れる（`confirmMs` の範囲）。Windows は対象外。
  採らなかった案: vitest を別のグループにしてそこへ SIGKILL を送るだけ（v0.5.33 の SP1。runner のグループへの SIGKILL が届かず、8 件が 40 秒以上残った）、worker が IPC の切断で自分で終わる（試作。同期の処理の最中は切断に気づけず、部分的にしか効かなかった）。
  テスト（`tests/regression-backlog5-minpath-watchdog.test.ts`）は、`scripts/` を一時ディレクトリへ写し、`node_modules/vitest/vitest.mjs` を偽物にして確かめる（本物の vitest は止めない）。
  runner 経由でテストが実行するコマンド（`tests/helpers.ts` の `nodeEval`）は、`process.execPath` ではなく PATH 上の `node` を使う前提である
  （`unit-minpath` でも PATH に node を置く）。
- **会社固有情報の排除**: コード・設定・docs・テストデータに実在の社名・製品名・IP・社内パス・人名を書かない。

---

## 10. 終了コードと失敗モード

verify の実行結果について、終了コードと最終行の文言は 1 対 1 に固定する（R-007）。`PASSED` という語は終了コード 0 のときにしか出力しない。使い方エラー（下の表の「使い方エラー」の行）は `VERIFY` の最終行を出さない（ADR-0021）。

| 状況 | 終了コード | 最終行の文言 | レポート |
|---|---|---|---|
| 全必須チェック PASS | 0 | `VERIFY PASSED — …` | 書く |
| 必須チェックに FAIL / SKIPPED あり | 1 | `VERIFY FAILED — …` | 書く |
| 設定ファイル不在・不正（`cwd`・`output.dir` の途中のエントリを調べられない場合を含む。ADR-0022） | 2 | `VERIFY ERROR (configuration error)` | 書かない |
| レポート書込失敗 | 2 | `VERIFY ERROR (report write error)` | 部分的に書かれる可能性あり。標準エラーに理由を出す |
| 予期しない例外（`package.json` の version が読めない場合を含む。ADR-0022） | 2 | `VERIFY ERROR (internal error)` | 書かない |
| 処理されなかった例外・promise の拒否（コールバックの中など。ADR-0024） | 2（シグナルが先に中断していたときは 130 / 143 のまま） | `VERIFY ERROR (internal error)`（標準エラー。先に `aiqh: unexpected error: …` の 1 行） | 保証しない（判定の確定の前なら `interruptedBy: "internal error"` で書かれることがある）。新規チェックは起動せず、実行中のグループは SIGINT と同じ順で片付けてから終了。安全弁 8 秒。判定の確定の後（PASSED を書いた後）でも 2 |
| 拒否する Node の起動オプション（`--unhandled-rejections=warn`、`--abort-on-uncaught-exception`。起動の引数と `NODE_OPTIONS`。ADR-0024 決定 6） | 2 | 理由の 1 行（`aiqh: refusing to start: …`）。verify は続けて `VERIFY ERROR (Node option error)` | 書かない（コマンドを読まず、check を起動しない）。これらのオプションでは Node・V8 が例外・拒否の値を生のまま出すため |
| 使い方エラー（未知のコマンド・オプション、欠落・余分な引数、コマンドなしの `aiqh`、未知の help の対象。全コマンドと本体で共通、ADR-0021） | 2 | commander の `error: …` の 1 行（コマンドなし・未知の help の対象は help）を標準エラーに出す。`VERIFY` の最終行は出ない | 書かない |
| SIGINT 受信（Ctrl+C）、verdict 確定前 | 130（128 + 2） | `VERIFY ERROR (interrupted by SIGINT)` | 書く（`verdict: "ERROR"`、`interruptedBy: "SIGINT"`、未実行チェックは SKIPPED）。新規チェックは起動せず、実行中のグループへ SIGTERM → 最大 5 秒 → SIGKILL → 消滅確認（最大 2 秒。消えなかったときはレポートの `errorSummary` にそう書く。終了コードは変わらない）の後に終了。安全弁 8 秒（最後の強制終了。極端な停止ではレポートの完了前に発火しうる。終了コードは同じ。ADR-0023 決定 7） |
| SIGINT / SIGTERM 受信、verdict 確定後 | 確定結果の 0 / 1（書込失敗時 2） | 確定結果の行（stderr に `… received after the verdict was fixed; result unchanged` を追加） | 確定済みの結果で書く |
| SIGTERM 受信 | 143（128 + 15） | `VERIFY ERROR (interrupted by SIGTERM)` | 同上 |

いずれの失敗でも終了コードは非ゼロであり、CI ではゲートを通過しない。
この対応（130 / 143 でも `ERROR` 文言であること、`PASSED` は 0 のときだけであること）は `tests/cli.test.ts` と
`tests/regression-r3-cli.test.ts` の不変条件テストで固定している。
