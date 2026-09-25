# ARCHITECTURE — ai-quality-harness（aiqh）

最終更新: 2026-09-15（M0 設計時点）

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
youhei-dev/ai-quality-harness（本体・本リポジトリ）
  ├─ src/        … CLI 本体（TypeScript）
  ├─ .github/workflows/verify.yml   … 再利用可能ワークフロー（workflow_call, M3）
  └─ tags: v0.1.0, v0.2.0, …        … 対象リポジトリはタグでバージョン固定

対象リポジトリ（例: trim-manager, ai-tutor-browser, 将来の会社リポジトリ）
  ├─ aiqh.config.jsonc              … 設定 1 枚（秘密情報なし）
  ├─ .github/workflows/quality.yml  … `uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@v0.3.0`
  └─ artifacts/verification/        … verify の出力（git 管理外）
```

CLI の呼び出し方は次の 2 系統。

- 本体リポジトリ内: `npm run verify`（Node 24 のネイティブ TypeScript 実行で `src/cli.ts` を直接起動）、`npm run verify:dist`
- 対象リポジトリ: **`npm link` で PATH に置いた `aiqh`**（M1 の方針、ADR-0009）。本体で `npm run build && npm link` →
  対象で `aiqh init` / `aiqh verify`。対象の `package.json` に依存は追加しない（`security` チェックのコマンド `aiqh security-scan`
  は PATH の `aiqh` に依存し、`init` の監査レポートが解決元（リンク先と version）を表示する）。git 依存（`allow-git=none`）や
  公開配布（`min-release-age=7`）は M3 で Public 化と一緒に判断

npm レジストリへの公開は行わない（`private: true`）。

---

## 4. CLI コマンド（最終形）

| コマンド | マイルストーン | 入力 | 出力 | 終了コード |
|---|---|---|---|---|
| `aiqh verify` | M0（中核）/ M1（アダプタ） | `aiqh.config.jsonc`、git 状態 | `artifacts/verification/latest.json` / `latest.md` / `history/<timestamp>.json` | 0=PASSED, 1=FAILED, 2=設定・使用法エラー |
| `aiqh init` | M1（実装済み） | 対象リポジトリの実ファイル（package.json、tsconfig、pyproject、venv 等。`.env*` は読まない） | 標準出力に監査表・`aiqh.config.jsonc` 案・追加提案（`.gitignore` の `artifacts/`、scripts）。出力はすべて秘密情報マスクを通す（M1-R1-003）。`--write` は生成物を実行時パーサ / リゾルバで検証してから config のみ書込（M1-R1-006）、`--write-gitignore` / `--write-scripts` は別フラグ、`--force` なしでは上書きしない | 0=完了, 2=監査不能 / 既存あり / 検出 0 件 / 生成物が検証不合格 / いずれかの書込失敗 |
| `aiqh security-scan` | M1（実装済み） | git 管理下のファイル + 未追跡で ignore されないファイル、`.gitignore` | 標準出力（`--json` 可）: 分類・パス・行番号（PEM は開始–終了行）のみ。値は出力しない。未走査分類と理由を表示 | 0=検出なし, 1=検出あり, 2=非 git / 読取エラー（fail closed） |
| `aiqh review-packet` | M2-1（v0.4.0 実装） | commit 範囲 `<from>..<to>`、人間の依頼文・前回レビュー（任意）、`--doc` の文書、`<to>` の verify 結果（`latest.json` が `<to>` かつ clean のときのみ） | `artifacts/ai-review/review-packet-<label>.md`（変更ファイルの全文と差分、実装者の結論なし）、`--zip` でパケットだけを含む ZIP。検査（不正な UTF-8・生文字・秘密の形）に通らなければ何も書かない（ADR-0014） | 0=書いた, 1=検出あり（書かない）, 2=使い方・設定・検査不能・上限・書込エラー（優先順位は ADR-0015） |
| `aiqh review-import` | M2 | レビューAI の指摘（Markdown） | `artifacts/ai-review/findings-<id>.json`（重要度・対象ファイル・種別・対応状況） | 0 / 2 |
| `aiqh history` | M4 | 履歴 DB | 表 / JSON、ローカルダッシュボード（静的 HTML） | 0 / 2 |

共通オプション（案）: `--config <path>`, `--cwd <dir>`, `--output-dir <dir>`, `--verbose`, `--json`（標準出力に JSON）。

---

## 5. モジュール分割

```
src/
  cli.ts                  … エントリ（bin: aiqh）。版の読込・シグナル処理・引数の解析と終了コード設定 [M0]
  cli-program.ts          … サブコマンドとオプションの定義（副作用なし。テストが Command オブジェクトを直接見る、M2-1-R3-005） [M2-2]
  output.ts               … 端末への出力の出口（禁止文字を表記 → マスク。すべての標準出力・標準エラーが通る、ADR-0016） [M2-2]
  commands/
    verify.ts             … verify のオーケストレーション                                 [M0]
    init.ts               … 監査 → 設定提案 → 配置（--write 系フラグでのみ書込）              [M1 実装済み]
    security-scan.ts      … 内蔵 Security Scan の CLI                                      [M1 実装済み]
    review-packet.ts      … review-packet の CLI（入力の読込、書込、終了コード、マスク）      [M2-1 実装済み]
    review-import.ts      … 指摘の構造化保存                                               [M2]
    history.ts            … 履歴照会・ダッシュボード生成                                   [M4]
  config/
    schema.ts             … 設定スキーマ（zod）。型は zod から導出                          [M0]
    load.ts               … JSONC 読込 → スキーマ検証 → パス正規化（cwd の逸脱検査）        [M0]
  runner/
    execute.ts            … 単一コマンドの子プロセス実行（タイムアウト、プロセスグループ kill）[M0]
    run-checks.ts         … チェックの順次実行、fail-fast、所要時間計測                    [M0]
  report/
    verdict.ts            … PASS/FAIL/SKIPPED から最終判定と分類別サマリを算出              [M0]
    build-report.ts       … 実行結果 → レポートオブジェクト（マスク適用）                   [M0]
    markdown.ts           … レポート → Markdown                                            [M0]
    write.ts              … latest.json / latest.md / history/<ts>.json の書込              [M0]
  security/
    mask.ts               … 秘密情報らしき文字列のパターンマスク                            [M0]
  git/
    info.ts               … commit / branch / dirty の取得（非 git でも動作）               [M0]
  adapters/               … 検出器 + 推奨コマンド + 任意の出力パーサ（実行経路は持たない）    [M1 実装済み]
    types.ts              … Adapter / Detection / Suggestion / RepoContext / OutputParser（型のみ）
    context.ts            … 読み取り専用の RepoContext（.env* は読まない）
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
git 情報取得（commit / branch / dirty。非 git なら null）
   ▼
checks[] を設定順に順次実行
   ├─ spawn(command, { cwd, shell: true, detached: true })
   ├─ stdout / stderr を蓄積（上限あり）
   ├─ timeoutSec 超過 → プロセスグループへ SIGTERM → 猶予後 SIGKILL → status FAIL(timedOut)
   ├─ 起動失敗（ENOENT 等）→ FAIL
   └─ exit code 0 → PASS、それ以外 → FAIL
   ▼
verdict: 必須チェックが全て PASS → PASSED、それ以外 → FAILED
         分類（lint/typecheck/unit/build/security/dependency/e2e）ごとのサマリ。
         設定に存在しない分類は NOT_APPLICABLE
   ▼
レポートオブジェクト生成 → 全文字列値に mask() を適用
   ▼
artifacts/verification/latest.json
artifacts/verification/latest.md
artifacts/verification/history/<YYYYMMDDTHHmmssZ>.json
   ▼
終了コード 0（PASSED）/ 1（FAILED）
```

### 6.1b `aiqh init` と `aiqh security-scan`（M1）

```
aiqh init
  RepoContext（読み取りのみ: package.json / lockfile / tsconfig / venv の bin / pyproject / requirements / .git。.env* は存在確認のみ）
   ▼
  全アダプタの detect() → 分類ごとに「採用（最初の available）/ 代替 / unavailable（理由・有効化案内）」
   ▼
  監査表 + aiqh.config.jsonc 案（コメント付き JSONC）+ 追加提案（.gitignore の artifacts/、scripts.verify）
   ▼ --write（既存があれば exit 2、--force で上書き）/ --write-gitignore / --write-scripts
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
未追跡の `.env*` は代表パスのプローブに頼らず、存在そのものを finding にする（M1-R2-001。`git ls-files --others --exclude-standard`
に出た時点で ignore されていないことは Git 自身が確定している）。代表 4 パスのプローブは予防的なカバレッジ確認として残す。

`aiqh init` の `artifacts/` 提案も同じ判定関数（`gitIgnoredByRepoRules`）を共用し、**実際の生成物のパス**（`artifacts/verification/latest.json` /
`latest.md` / `history/probe.json`、`artifacts/ai-review/probe.md`）が**すべて**追跡済み `.gitignore` の非否定ルールで ignore されるときだけ
「already ignores」とする（M1-R2-005 → M2-0 / M1-R3-003。sentinel 1 個を狙ったルールでは保護と見なさない）。`--write-gitignore` の書込は 3 分岐
（M1-R3-002 → M2-0-R1-003）: (a) `.gitignore` が追跡済みで git が「未 ignore」と答えた（後段の否定など）→ 同じ行が既にあっても末尾に `artifacts/` を
追記して修復（追記後は git が保護を確認するので 2 回目は追記しない）、(b) `.gitignore` が未追跡で正規行が既にある → 追記せず
「contains artifacts/ but is not tracked; `git add .gitignore` …」と案内（未追跡のルールはクローン先に無いため保護と数えないが、重複追記は無意味）、
(c) `.gitignore` が無い、または git に聞けない → 作成 / 追記を 1 回だけ（同じ行は二度と追記しない）。

`aiqh security-scan` の出力は他コマンドと同じ出口（`src/output.ts`、ADR-0016）を通る（M2-0-R1-002、v0.5.2 の M2-2-R2-001）: text は全行を禁止文字の表記 →
`maskSecrets`、`--json` は文字列を表記にしてから `maskDeep(result)`。
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
  "git": { "commit": "abcdef…", "branch": "main", "dirty": false },   // 非 git なら null。dirty は取得失敗時 null（unknown）
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
      "outputTruncated": false
    }
  ]
}
```

### 7.2 Markdown（`latest.md`）

見出し、最終判定、メタ情報（日時・commit・branch・dirty・所要時間）、チェック一覧表、
分類別サマリ表、失敗チェックの詳細（errorSummary と出力末尾）。人間と独立レビューAI がそのまま読める形にする。

---

## 8. ディレクトリ規約

| パス | 管理 | 用途 |
|---|---|---|
| `artifacts/verification/` | git 管理外 | verify の出力（latest / history） |
| `artifacts/ai-review/` | git 管理外 | レビューパケット、取り込んだ指摘 |
| `docs/reports/` | git 管理 | 人間向けのマイルストーン報告（M0_REPORT.md 等） |
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
- **タイムアウト後の後始末ライフサイクル**（R-004、R2-002）:
  1. spawn 時にプロセスグループ id（= leader の pid）を保存する
  2. タイムアウト → グループへ SIGTERM（leader の生死にかかわらず `kill(-pgid)`）
  3. 猶予（既定 5 秒、`killGraceMs`）→ グループへ SIGKILL
  4. 「SIGKILL 送信済み」または `kill(-pgid, 0)` が ESRCH（グループ消滅）を返すまで、runner の Promise は解決しない。
     leader の `close` だけでは解決しない（孫が stdout/stderr を閉じていても、後始末が完了するまで待つ）
  5. エスカレーション待ちのタイマーは `unref()` しない（イベントループが空になって SIGKILL 前に終了する経路を塞ぐ）
- **中断機構（R3-002）**: SIGINT / SIGTERM を受けた CLI は次の順で動く。
  1. `AbortController.abort(<シグナル名>)` で中断状態を立てる。この `AbortSignal` は `runVerify → runChecks → executeCommand`
     に渡されており、`runChecks` は各チェックの開始前に、`executeCommand` は spawn の直前と直後に中断を確認する。
     中断後に新しいプロセスが起動することはない
  2. 実行中のグループを後始末する（`terminateActiveChildren`: SIGTERM → 猶予 5 秒 → SIGKILL → 消滅確認。
     実行中の `executeCommand` 自身も abort を受けて同じエスカレーションを行う）
  3. `runVerify` が未実行チェックを SKIPPED（理由: `run interrupted by SIGINT`）として記録し、
     `verdict: "ERROR"`、`interruptedBy: "SIGINT"` のレポートを書き、`VERIFY ERROR (interrupted by SIGINT)` を出力する。
     未実行チェックは開始表示（`$ <command>`）を出さず `[n/total] name — SKIPPED (reason)` とだけ表示する（R4-003）
  4. 通常の戻り値経路で 128 + シグナル番号（130 / 143）で終了する。ハンドラ内で即 `process.exit()` はしない。
     ハンドラは受信時にバックアップとして `process.exitCode = 130 / 143` を即設定する（R4-001）
  5. 安全弁: 猶予 + 3 秒（既定 8 秒）以内に終了しなければ同じ終了コードで強制終了する
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
  切り詰められたか」を表し、`stdoutTail` / `stderrTail` は中断時点までの末尾。`errorSummary` に中断理由（シグナル名）を書く
- **パスの包含判定**: `cwd` と `output.dir` はプロジェクトルート内に制限する。字句上の判定に加え、
  realpath（symlink 解決後）でも判定し、ルート内の symlink がルート外を指す場合は設定エラーにする（R-005）。
  祖先探索は `lstat` ベースで、dangling symlink（リンク先が未作成）は解決できないため安全側に設定エラーとする（R2-003）。
- **配布の受入テスト**: 自己 verify の `package` チェック（`scripts/package-smoke.ts`）が `npm pack` → 一時ディレクトリへ
  install → `npx --no-install aiqh verify` を毎回実行し、bin / shebang / `files` / 実行時依存 / version を検証する（R2-005）。
- **出力のマスク**: レポートに書く全ての文字列値はパターンマスクを通す。値そのものは保存しない（ADR-0006）。
- **端末への出力の出口（v0.5.2、ADR-0016、M2-2-R2-001）**: すべての標準出力・標準エラーは `src/output.ts` を通る（各コマンドは `createOutput()`、
  `src/cli.ts` とオプションの解析は `writeError()`、commander は `configureOutput(COMMANDER_OUTPUT)`）。処理の順序は、禁止文字（raw-chars.ts の集合）を
  `\u{HEX}` の表記にする → masker。JSON は文字列を再帰的に表記にしてから `maskDeep`。LF と TAB は残す（review-packet は 1 回の書き出し = 1 行なので表記にする）。
  型情報付きの構造テスト（`tests/structure/output-guard.ts`）が、`console`・`process.stdout` / `process.stderr`・fd 1 / 2 への書き込みを `src/output.ts` 以外で禁止する。
  ファイルへの出力（レポート、init が書く設定）は対象外（ROADMAP のバックログ）。
  既知の限界（v0.5.3、ADR-0016）: 既定のモードでは利用者由来の値（パス、ファイル名）の LF・TAB も残り、端末の見た目を崩せる（終了コードと `--json` の結果は
  変わらない）。`safeJson()` はオブジェクトのキーを表記にしない（今の各コマンドの `--json` のキーは固定）。構造テストは動的なキーの `process[key]` と、
  `src/output.ts` の中の書き出しを見ない
- **対応プラットフォーム**: POSIX（macOS / Linux）。プロセスグループ制御と `realpath` に依存するため、
  Windows は M0 の対象外（R-011）。Linux CI は M3 で追加する。
- **レビューパケットの検査（M2-1、ADR-0014）**: `aiqh review-packet` は、描画されるオプションの値（入口の一覧から、git の前）→ すべてのパス →
  入力ごと（不正な UTF-8 → 生文字 → 秘密の形）→ 組み立てたパケット全体、の順に検査し、1 件でもあれば exit 1 で何も書かない。
  finding があっても検査は最後まで続け、finding のある値は git に渡さない。終了コードは検査不能（exit 2）→ 検出（exit 1）→ 出力しない判断（exit 2）の順（v0.5.0、ADR-0015）。
  `--range` に finding があっても、範囲に依存しない検査（作業ツリー、root、依頼文・レビュー、`latest.json` の読取）は行う。`latest.json` と既定の設定ファイルは
  ENOENT のときだけ「無い」とし、それ以外の読取の失敗は exit 2（v0.5.1、M2-2-R1-001 / R1-007）。
  描画する値は検査済みの型 `Checked` だけが描画関数と ZIP のエントリ名に渡る（v0.4.2。v0.5.0 から型情報付きの構造テストと実行時の登録簿で固定）。`security.allow` は出所のリポジトリパスと行に適用する。
  出力は出所・行・分類またはコードポイントのみ。git はシェルを経由せず引数配列で呼び、パスは `-z` で読む。書き込みはパケットと ZIP の 2 段階
  （準備 → 確定。確定点の前の失敗は戻し、後の退避削除の失敗は警告）
- **テストが起動する外部コマンド（M2-1-R2-004 / R3-006）**: テストが起動してよいのは git と node（`process.execPath`）で、unzip / python3 は
  その有無を確かめる probe と、それを条件にした `skipIf` / `runIf` の中だけ。`tests/structure/process-guard.ts`（型情報付き）が child_process の宣言に
  解決される呼び出しをすべて調べる。文字列の中からの起動（`node -e` のスクリプトなど）は静的には見えない。自己 verify の `unit-minpath`
  （`scripts/test-minimal-path.ts`: PATH を node と git の symlink だけを置いた一時ディレクトリにして全テストを実行、終了後に削除）は、そのうち
  **PATH の名前解決で起動する、宣言していないコマンド**を検出する（v0.5.1 で保証の記述を狭めた。M2-2-R1-005・006）: 絶対パスでの起動は防がない。
  環境変数は PATH 以外を引き継ぐ。単独で実行してシグナルを受けたとき、止めるのは vitest の直接の子プロセスだけ（自己 verify の中では runner が
  プロセスグループごと止める）。
  runner 経由でテストが実行するコマンド（`tests/helpers.ts` の `nodeEval`）は、`process.execPath` ではなく PATH 上の `node` を使う前提である
  （`unit-minpath` でも PATH に node を置く）。
- **会社固有情報の排除**: コード・設定・docs・テストデータに実在の社名・製品名・IP・社内パス・人名を書かない。

---

## 10. 終了コードと失敗モード

終了コードと最終行の文言は 1 対 1 に固定する（R-007）。`PASSED` という語は終了コード 0 のときにしか出力しない。

| 状況 | 終了コード | 最終行の文言 | レポート |
|---|---|---|---|
| 全必須チェック PASS | 0 | `VERIFY PASSED — …` | 書く |
| 必須チェックに FAIL / SKIPPED あり | 1 | `VERIFY FAILED — …` | 書く |
| 設定ファイル不在・不正 | 2 | `VERIFY ERROR (configuration error)` | 書かない |
| レポート書込失敗 | 2 | `VERIFY ERROR (report write error)` | 部分的に書かれる可能性あり。標準エラーに理由を出す |
| 予期しない例外 | 2 | `VERIFY ERROR (internal error)` | 書かない |
| SIGINT 受信（Ctrl+C）、verdict 確定前 | 130（128 + 2） | `VERIFY ERROR (interrupted by SIGINT)` | 書く（`verdict: "ERROR"`、`interruptedBy: "SIGINT"`、未実行チェックは SKIPPED）。新規チェックは起動せず、実行中のグループへ SIGTERM → 最大 5 秒 → SIGKILL → 消滅確認の後に終了。安全弁 8 秒 |
| SIGINT / SIGTERM 受信、verdict 確定後 | 確定結果の 0 / 1（書込失敗時 2） | 確定結果の行（stderr に `… received after the verdict was fixed; result unchanged` を追加） | 確定済みの結果で書く |
| SIGTERM 受信 | 143（128 + 15） | `VERIFY ERROR (interrupted by SIGTERM)` | 同上 |

いずれの失敗でも終了コードは非ゼロであり、CI ではゲートを通過しない。
この対応（130 / 143 でも `ERROR` 文言であること、`PASSED` は 0 のときだけであること）は `tests/cli.test.ts` と
`tests/regression-r3-cli.test.ts` の不変条件テストで固定している。
