# M2-0 独立レビュー R3 への対応記録（response-r3）— v0.3.3

- 対象レビュー: `docs/reviews/m2-0/independent-review-r3.md`（受領ファイル名 `independent-review-m2-0-r3-for-claude.md`、2026-09-23 付、SHA-256 d551c01a…。
  M2-0-R3-001〜003: High 1 / Medium 1 / Low 1。対象 v0.3.2 = commit cfadf18 / tag object c9be6e1）
- 対応日: 2026-09-23
- 人間の判断: High があるため M2-0 は続行。3 件すべて対応し `v0.3.3` を付与（v0.3.2 は残す）。R4 で High が無ければ M2-0 完了（v0.3.3 が完了ベースライン）。
  人間側の振り返り: R2 の追加2（本体とアンカーの上限をそろえる）が url-credential と key-value にしか書かれず private-key が漏れた。url-credential の上限を
  共有パターンに入れたことが R3-002 の退行を招いた。今回は全パターンを機械的に検査する
- 停止ポイント1 で確定: 3 件とも VALID。001 は固定文字列のアンカー、4 分類の「アンカー + 残り」への書き換え、例外リストは空、上限から導いた生成器の長さ。
  002 は案A。R2 のテスト「追加2」の期待値変更。承認書の追加1（凍結した v0.3.2 の参照との正規表現の差分テスト、旧実装との masker 出力の比較）と
  追加2（github の後読みの確認入力）を取り込んだ
- 原文コピー: スキャナに一致する行は無く、言い換えは 0 行（先頭注記に SHA-256 を記録）

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード（修正前も PASS） |
|----|--------|------|------|-----------------|------------|------------|
| M2-0-R3-001 | High | VALID | 修正済み | **実コードで再現**（`tmp/m2-0r3/repro.mjs`、窓境界を `scanString` のチャンクで合わせる）: private-key のアンカー `{0,32}` は本体・block begin のラベル `*` の接頭辞ではない。ラベル 260 文字・4096 / 256 / 2048 で 72 通り中 8 通り、ラベル 5,000 文字・既定設定で 61 通り中 11 通りの切れ目が **0 件**（窓なしでは一致）。修正: アンカーを固定文字列 `-----BEGIN `（`anchorMaxBytes` 11）、`partial` は「`-----BEGIN ` の接頭辞」「`-----BEGIN ` + ラベル + `PRIVATE KEY-----` の接頭辞」「完成したマーカー + 任意」。本体・block begin の正規表現は不変。再発防止: scanner の本体を「アンカー部分式 + 残り」の連結で組み立て（github は後読みで本体の文字クラスを書き分け、key-value は捕捉グループ 1 を区切りだけに、url-credential は scanner 用 `scanPattern`）、構造テストで全パターンを検査（例外リストは空）。生成器の長さを上限から導く | `regression-m2-0r3-001-private-key-anchor`: ラベル 260 文字・重なり 256・全切れ目; ラベル 5,000 文字・既定設定; ラベル > `maxCarryBytes`（切れ目が重なり内 → private-key、切れ目 > `maxCarryBytes` → oversized-candidate）; 構造テスト（修正前は private-key の本体と block begin、url-credential、github、key-value が FAIL）; 上限から導いた長さの性質テスト（1,335 ケース。修正前 11 件失敗） | ラベル 33 文字・最小重なり（下記）; 各行が窓なしで private-key に一致; 例外リストが空。差分テスト `regression-m2-0r3-001-regex-equivalence`（修正後に追加、下記） |
| M2-0-R3-002 | Medium | VALID | 修正済み（案A） | **実コードで再現**: `maskSecrets` は scheme 64 文字を redact、65 / 200 文字は redact せず合成パスワードが残る。修正: masker の `pattern` を v0.3.1 と同じ（scheme 無制限）に戻し、scanner だけが `scanPattern`（scheme 64 文字まで）を使う（`buildScanners()` は `scanPattern ?? pattern`）。**既知の制限**: scheme が 64 文字を超える URL 認証情報は scanner では検出しない（ADR-0013 / CONFIG_SPEC / CHANGELOG に明記）。案B（scanner も無制限）は、アンカーが有界にならず窓末尾の英数字の連続がすべて候補になり oversized の誤検出が増えるため採らない | `regression-m2-0r3-002-url-scheme-mask`: scheme 65 / 5000 文字が v0.3.1 と同じ出力に; 分かれているのは url-credential だけ | scheme 64 文字は redact; masker の代表入力 12 件の出力を完全一致で固定; scanner の制限（64 文字は検出、65 文字は検出しない） |
| M2-0-R3-003 | Low | VALID | 修正済み | `response-r2.md` 16 行目の生の U+2028 / U+2029 を、エスケープ表記（バックスラッシュ + `u2028` / `u2029`）に訂正。原因はツール入力でエスケープ表記が生文字に変わる現象で、docs の編集は Python でエスケープ表記を文字コードから組み立てて行った | `docs-no-raw-separators`: 追跡中の Markdown（tests/ を除く）に U+2028 / U+2029 / U+0080〜U+009F が無い（修正前は `response-r2.md:16` で FAIL）。禁止文字はテスト内で文字コードから組み立てる | — |

INVALID / PARTIAL なし。R2 の 3 件の再判定（R2-001 は元の再現条件は解消・全体は PARTIAL、R2-002 / 003 は解消）はレビュアーと一致。

**依頼書の誤りの記録（人間側が承認時に確認）**: 依頼書にあった「ラベル 33 文字、最小重なり（4096 / 256 / 2048）→ 修正前 0 件」は再現しない（60 通りすべてで検出）。
BEGIN マーカー全体（61 文字）が最小重なり（256）より短いため、マーカーの先頭は必ず重なりに残り、次の窓に丸ごと入る。有効な設定で見逃しが起きるのは
マーカーが重なりより長い場合（ラベルがおよそ 229 文字以上）に限られる。このテストはアンカーの旧上限 +1 の境界を固定するガードとして残した。

## 正規表現の差分（追加1・追加2）

- 凍結した参照: v0.3.2（commit cfadf18）の private-key 本体・block begin、github、key-value、url-credential（共有）の source と、v0.3.1（commit e25f59f）の
  url-credential（masker）の source を、テストファイル内に正規表現リテラルとして置いた。一時スクリプトで、取り出した v0.3.2 / v0.3.1 の `patterns.ts` の source・フラグと
  一字一句一致することを確認した（6 / 6）。自己スキャンは 0 件のまま
- 入力: `tests/regex-equivalence-inputs.ts`（固定シード 20260923）で **4,282 件**（private-key 726、url-credential 128、github 428、key-value 3,000）。
  一致する値とほぼ一致する値（下限 −1 の長さ、後ろに英数字 / `_` が続くもの、`ghx_`、`github_pat__`、`ghp_` の直後の `github_pat_`、逆順、`xghp_`、`_ghp_`、
  key-value の各キー表記・接頭辞・引用・区切り・値の形、ラベルが空・33 / 260 文字の PEM、END なし、BEGIN 2 つ、scheme 1〜200 文字）
- 結果（リポジトリに残すテスト）: 旧と新の一致位置・一致文字列（key-value は値のグループ 2〜6 も）の**差分 0 件**。url-credential の scanner 用は v0.3.2 と全件同一、
  scheme 64 文字以下では v0.3.1 と同一、64 文字超で v0.3.1 と異なる入力は 8 件（文書化した制限）
- 検出力の確認（一時）: github の後読みを外した正規表現では 428 件中 57 件で差分が出る（比較が差を捉えることの確認）
- `maskSecrets` の比較（一時、`tmp/m2-0r3/mask-compare.mjs`。v0.3.2 / v0.3.1 の `patterns.ts` / `mask.ts` を `tmp/` に取り出して実行）: 同じ 4,282 件で、
  **v0.3.1 と新実装の出力は全件同一**。v0.3.2 との差は url-credential の 5 件だけで、すべて scheme が 64 文字を超える入力（R3-002 の修正そのもの）

## 回帰テストの実行記録（数え方を併記）

- ソース上の `it(`: **19 件**（`grep -cE '^\s*it(\.skipIf\([^)]*\))?\('` → `regression-m2-0r3-001-private-key-anchor` 8、`regression-m2-0r3-001-regex-equivalence` 5、
  `regression-m2-0r3-002-url-scheme-mask` 5、`docs-no-raw-separators` 1）。vitest の実行数も **19 件**（ループで展開する `it(` はない）。総数 **319 + 19 = 338**
- 修正前（`tmp/m2-0r3/before.txt`、差分テストを除く 14 件）: **8 FAIL / 6 PASS**（ガード）。差分テスト 5 件は停止ポイント1 の後に追加したもので、修正前のコードでは実行していない
  （旧と新を比べるテストのため、修正前は比較対象の新しい形が存在しない）
- 性質テストの修正前の失敗（固定シード 20260923、設定 4096 / 256 / 2048、チャンク 512、11 件）: private-key のラベル 255 / 256 / 257 文字（位置 257）、
  2047 文字（位置 257 / 1432）、2048 文字（257 / 1404）、2049 文字（257 / 795）、2348 文字（257 / 1505）がすべて 0 件。他の分類の失敗は 0 件。
  R2 の生成器はラベルを 20 文字以下でしか作らず、この範囲に届いていなかった
- 修正後: 19 件 PASS。全体 66 ファイル 338 件 PASS を **10 回連続**で確認（`tmp/m2-0r3/ten-1..10.txt`）。残留プロセスなし
- 既存テストの期待値変更: `regression-m2-0r2-001-window-completeness` の「追加2」1 か所（検査対象を scanner 用の `scanPattern` に。承認済み）

## 自己 verify と対象リポジトリ

- `npm run verify` / `npm run verify:dist` / リンク済み `aiqh verify`（`npm run build && npm link` 後、`aiqh --version` = 0.3.3）: いずれも VERIFY PASSED、exit 0、7 チェック
- 本体の自己スキャン: 追跡 186 + 未追跡 6、検出 0 件
- 両対象での `aiqh security-scan`（読み取りのみ、値は出していない）: 件数・finding 行とも v0.3.2 と同一（Node 系 1 件、Python 系 19 件）。`git status` は走査の前後で不変

## 性能の記録

| 対象 | v0.3.2（3 回） | v0.3.3（3 回） |
|---|---|---|
| Node 系の対象 | 0.20 / 0.15 / 0.14 s | 0.17 / 0.15 / 0.15 s |
| Python 系の対象 | 0.23 / 0.18 / 0.20 s | 0.18 / 0.16 / 0.16 s |
| 合成の長い行（R2 と同じ 3 MiB の minified 風と 1 MiB の `eyJ` の行に、`-----BEGIN ` を 5,030 回含む 3 MiB の行（CERTIFICATE と、1,000 文字ラベルの PUBLIC）を追加） | 0.41 / 0.36 / 0.37 s | 0.40 / 0.38 / 0.38 s |

finding は v0.3.2 と同一（key-value 1、oversized-candidate:jwt 1。`-----BEGIN ` を大量に含む行はどちらも finding なし）。

## 教訓

- 「アンカーは本体の接頭辞」のような構造上の性質は、生成テストだけで確かめない。本体をアンカー部分式から組み立て、source の接頭辞関係をテストで固定する
- 生成器の長さは、各上限（`anchorMaxBytes`、重なり、`maxCarryBytes`）の前後と、上限のない部分の上限超を必ず含める
- scanner の都合で masker と共有する定義を狭めない。分ける必要があるなら scanner 用の定義を別に持ち、どれが分かれているかをテストで固定する
- 正規表現を書き換えたら、凍結した旧版との差分（一致位置・一致文字列）を機械的に確かめる。出力固定の数件だけでは足りない
- 依頼書の再現条件も実コードで確かめる（ラベル 33 文字の条件は再現しなかった）
