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

CLI の呼び出し方は次の 2 系統を想定する。

- 本体リポジトリ内: `npm run verify`（Node 24 のネイティブ TypeScript 実行で `src/cli.ts` を直接起動）
- 対象リポジトリ: `npx aiqh verify`（devDependency として `github:youhei-dev/ai-quality-harness#v0.x.y` を導入、または Actions 内で checkout して実行。M1 で確定）

npm レジストリへの公開は行わない（`private: true`）。

---

## 4. CLI コマンド（最終形）

| コマンド | マイルストーン | 入力 | 出力 | 終了コード |
|---|---|---|---|---|
| `aiqh verify` | M0（中核）/ M1（アダプタ） | `aiqh.config.jsonc`、git 状態 | `artifacts/verification/latest.json` / `latest.md` / `history/<timestamp>.json` | 0=PASSED, 1=FAILED, 2=設定・使用法エラー |
| `aiqh init` | M1 | 対象リポジトリの実ファイル（package.json、tsconfig、pyproject 等） | `aiqh.config.jsonc`（提案）、ワークフロー参照ファイル | 0=生成, 2=エラー |
| `aiqh review-packet` | M2 | 依頼文、`git diff`、設計判断（ADR / docs）、最新 verify 結果、既知の懸念 | `artifacts/ai-review/review-packet-<id>.md` | 0 / 2 |
| `aiqh review-import` | M2 | レビューAI の指摘（Markdown） | `artifacts/ai-review/findings-<id>.json`（重要度・対象ファイル・種別・対応状況） | 0 / 2 |
| `aiqh history` | M4 | 履歴 DB | 表 / JSON、ローカルダッシュボード（静的 HTML） | 0 / 2 |

共通オプション（案）: `--config <path>`, `--cwd <dir>`, `--output-dir <dir>`, `--verbose`, `--json`（標準出力に JSON）。

---

## 5. モジュール分割

```
src/
  cli.ts                  … エントリ（bin: aiqh）。サブコマンド登録と終了コード設定        [M0]
  commands/
    verify.ts             … verify のオーケストレーション                                 [M0]
    init.ts               … 監査 → 設定提案 → 配置                                        [M1]
    review-packet.ts      … レビューパケット生成                                           [M2]
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
  adapters/               … 検出器 + 推奨コマンド + 任意の出力パーサ（実行経路は持たない）    [M1]
    lint.ts / typecheck.ts / unit.ts / build.ts / security.ts / dependency.ts / e2e.ts
  review/                 … パケット生成、指摘パーサ、対応状況モデル                          [M2]
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

### 6.2 レビューループ（M2）

```
依頼文 + git diff + ADR + latest.json + 既知の懸念
   ▼ aiqh review-packet
artifacts/ai-review/review-packet-<id>.md ──▶ 人間が Astra / Codex に渡す
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
- **対応プラットフォーム**: POSIX（macOS / Linux）。プロセスグループ制御と `realpath` に依存するため、
  Windows は M0 の対象外（R-011）。Linux CI は M3 で追加する。
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
