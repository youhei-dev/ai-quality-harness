# M2-0 独立レビュー R1 への対応記録（response-r1）— v0.3.1

- 対象レビュー: `docs/reviews/m2-0/independent-review-r1.md`（受領ファイル名 `independent-review-m2-0-r1-for-claude.md`、2026-09-20 付、SHA-256 63dcb1d9…。
  M2-0-R1-001〜003: High 1 / Medium 2。対象 v0.3.0 = commit 8e81d15 / tag object 3e54718）
- 対応日: 2026-09-20
- 人間の判断: 3 件すべて今回のサイクルで対応し `v0.3.1` を付与。R2 で High が無ければ M2-0 完了とし、Medium 以下は M2-1 以降のリストへ積む。
  停止ポイント1 で確定: `LineAssembler` のコンストラクタ検証（追加防御）を採用し、3 層（ConfigError / コンストラクタ ScanError / 進捗不変条件）それぞれにテストを置く
- 原文コピー: スキャナに一致する例示 1 行（原文 234 行目、合成 AWS キーの例）を分割表記に変え、先頭注記に行番号と SHA-256 を記録

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード（修正前も PASS） |
|----|--------|------|------|-----------------|------------|------------|
| M2-0-R1-001 | High | VALID | 修正済み | `securitySchema` は 3 値を個別に正の整数と検証するだけで相互制約が無く、`LineAssembler.push()` の長行ループは `overlap > len` や `carry > line`（候補が先頭）で `from = 0` となり `pending` が縮まず終了しなかった。修正（3 層）: (1) `resolveSecurity()` が既定値適用後に `0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes` を検証し `ConfigError`（判定は `config/window-limits.ts` に一本化。load ↔ scan の循環 import を避けるため独立モジュール）、(2) `LineAssembler` のコンストラクタが同じ関係を `ScanError` で拒否（内部オプション `skipOptionValidation` は不変条件テスト専用で config / CLI から到達不能）、(3) 長行ループの各反復で `pending` が縮まなければ `ScanError`。`regression-m2-0-008` の valid settings を 1024 / 128 / 2048 → 4096 / 128 / 2048 に変更 | `regression-m2-0r1-001-window-limits` 8 件のうち 5 件: overlap > line / carry > line / overlap > carry が受理 → ConfigError; 1 フィールドだけの矛盾（overlap 100000、carry 300000、line 1000）→ ConfigError; CLI 10 / 20 / 64 + 11 文字 → **timeout（15 秒）→ exit 2**; コンストラクタ（第 2 層）: 3 組み合わせ → ScanError; 不変条件（第 3 層、検証をスキップして直接到達）: 10 / 20 / 64 と 1024 / 128 / 2048 + 先頭候補 → **timeout（10 秒）→ ScanError「no progress」** | 境界（overlap == carry、carry == line）は有効; 有効設定（4096 / 128 / 2048）で return |
| M2-0-R1-002 | Medium | VALID | 修正済み | `security-scan.ts` は `maskSecrets` / `maskDeep` を使わず、`describeRule()` が `reason` / `path` / `expires` を、JSON が `result` をそのまま出力していた。修正: text は全行 `maskSecrets`（エラー行も）、JSON は `maskDeep(result)`。`allow[].reason` / `path` はスキーマで `\r` / `\n` を禁止（JSON Schema 再生成） | `regression-m2-0r1-002-scan-output-mask` 3 件: `reason` の合成 AWS キーが text に生で出る → `[REDACTED:aws]`（規則の使用状況 `rule used 1×: #1 …` と `[allowed] …` は残る。config ファイル自体の aws finding は正しく残り exit 1）; JSON に生で出る → `allowUsage[0].reason` がマスク済み、`count` 1、`suppressed` 1; 改行入り `reason` / `path` が通る → スキーマエラー | — |
| M2-0-R1-003 | Medium | VALID | 修正済み | `proposeGitignore()` は `.gitignore` 存在 + `.git` で `canAskGit = true`、追跡済みルールしか数えないため未追跡 `.gitignore` では常に `needed`。書込側は `!canAskGit && hasGitignoreLine` のときだけ止めるので毎回追記（`.gitignore` なしの初回導入でも 2 回目に再追記）。修正: `proposeGitignore()` に `gitignoreTracked`（`git ls-files`）を追加し、書込を 3 分岐に — (a) 追跡済みで未 ignore → 末尾追記（修復）、(b) 未追跡で正規行あり → 追記せず「contains artifacts/ but is not tracked; git add .gitignore …」、(c) 無し / git に聞けない → 1 回だけ作成 / 追記。scanner の「未追跡は保護と数えない」は維持 | `regression-m2-0r1-003-untracked-gitignore-write` 2 件: `.gitignore` なし → 2 回目で 2 行 → 1 行のまま + 案内; 未追跡 + `artifacts/` → 2 行 → 1 行 + 案内 | 追跡済み + 否定 → 修復行 1 本、2 回目で増えない（既存 m2-0-002 と同じ） |

INVALID / PARTIAL なし。M1-R3 の 5 件の再判定と key-value / allow の判定はレビュアーと一致。

## 回帰テストの実行記録

- 修正前: 新規 3 ファイル 13 テスト → 10 FAIL / 3 PASS（ガード）。記録 `tmp/m2-0r1/before.txt`
- **同期ループ中はシグナルで回復できないことの実証**: 最初の記録では CLI の子プロセス（10 / 20 / 64、11 文字）が `execFileSync` の既定の SIGTERM を無視し、
  vitest 全体が 600 秒を超えた。cli.ts は SIGINT / SIGTERM のハンドラを登録して Node の既定終了動作を解除しており、同期的な無限ループ中は JS のハンドラも
  走らないため、SIGTERM では止まらない（レビュアーの「Ctrl+C で即時回復できない」のとおり）。残留プロセス 4 件（CLI 子プロセス、vitest ワーカー等）を
  手動で SIGKILL し、テストヘルパーを `killSignal: "SIGKILL"` に変えて再記録した（CLI 15 秒、`LineAssembler` 直接 10 秒でタイムアウト、残留なし）
- 修正後: 13 件 PASS。**旧タイムアウト到達テストは速やかに終わる**: `regression-m2-0r1-001` ファイル全体（8 件、子プロセス 4 回を含む）で 810 ms
  （修正前は 15,048 ms / 10,009 ms / 10,008 ms のタイムアウト到達）。CLI の再現は exit 2（ConfigError）で終了
- 全体: 60 ファイル 294 件 PASS を **10 回連続**で確認（`tmp/m2-0r1/ten-1..10.txt`）。実行後の残留プロセスなし
- 自己 verify（v0.3.1 の作業ツリー）: `npm run verify` / `npm run verify:dist` / リンク済み `aiqh verify`（`aiqh --version` = 0.3.1）とも VERIFY PASSED（7 チェック）。
  本体の自己スキャン 0 件（追跡 175 + 未追跡 5）
- 両対象での `aiqh security-scan` 再実行: 件数・内容とも v0.3.0 時と同一（Node 系 1 件、Python 系 19 件）。書込なし

## 教訓

- 設定値の**相互関係**は個別の型検証では守れない。既定値適用後の cross-field 検証を 1 か所に置き、直接構築される部品にも同じ検証を持たせ、
  ループには進捗不変条件を置く（「終了しない」は fail closed ではない）
- 無限ループを再現するテストは子プロセス + タイムアウトで書き、回収は SIGKILL にする（自前のシグナルハンドラは同期ループ中に走らない）
- 出力の秘密情報マスクは「信頼された入力かどうか」とは独立に、**出力する側**の境界で必ず掛ける（init / verify / security-scan を揃える）
- 「保護と数えない」（読み取り側の方針）と「重複追記しない」（書込側の冪等性）は別の関心事。書込側は対象の追跡状態で分岐する
