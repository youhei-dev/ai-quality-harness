# M2-0 独立レビュー R2 への対応記録（response-r2）— v0.3.2

- 対象レビュー: `docs/reviews/m2-0/independent-review-r2.md`（受領ファイル名 `independent-review-m2-0-r2-for-claude.md`、2026-09-20 付、SHA-256 4d1593ce…。
  M2-0-R2-001〜003: High 1 / Low 2。対象 v0.3.1 = commit e25f59f / tag object c2c6985）
- 対応日: 2026-09-23
- 人間の判断: 「R2 で High が無ければ完了」に該当しないため M2-0 は続行。3 件すべて対応し `v0.3.2` を付与。R3 で High が無ければ M2-0 完了（v0.3.2 が完了ベースライン）。
  v0.3.1 は残す。停止ポイント1 で確定: 有界アンカー、`MIN_LINE_OVERLAP_BYTES = 256`、最も早い未解決アンカーからの持ち越し、`partial` の採用、
  既存テストの有効設定 128 → 256。承認書の追加 1〜5（3 つの性質のテスト、本体とアンカーの上限をそろえる、「oversized で逃げていない」判定、private-key の副作用、件数の記録の仕方）を取り込んだ
- 原文コピー: スキャナに一致する例示 1 行（原文 422 行目、URL 認証情報の形）を言い換え、先頭注記に行番号と SHA-256 を記録

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード（修正前も PASS） |
|----|--------|------|------|-----------------|------------|------------|
| M2-0-R2-001 | High | VALID | 修正済み | **実コードで再現**（`tmp/m2-0r2/repro-001.mjs`、既定設定）: 500,000 文字の行の位置 322,000 に `https://` + 10,000 文字のユーザー名 + `:` + 合成パスワード + `@host.example` → 窓走査 0 件、窓なしの正規表現は一致。原因: url-credential のアンカーが `scheme://user:`（ユーザー名無制限）で、アンカーが窓境界をまたぐと候補が無く重なり 4 KiB しか残らない。修正（ADR-0013）: (1) アンカーを有界な接頭辞に — url-credential `scheme://`（scheme `{0,63}`、本体の regex も同じ上限）、key-value はキー名のみ（本体・アンカー・`partial` は同じ `KEY_VALUE_KEYS`）、固定接頭辞は現状どおり、private-key に BEGIN マーカー（`anchorMaxBytes` 59）。各アンカーは `anchorMaxBytes` を宣言（最大 67）。(2) `MIN_LINE_OVERLAP_BYTES = 256`（`config/window-limits.ts`。相互制約の下限、zod `.min(定数)`、JSON Schema `minimum`）。(3) 持ち越しは「完全一致に含まれず `partial` が末尾まで一致する**最も早い**アンカー」から。(4) `partial`（`^…$`、接頭辞について閉じた regex）で解決済み候補を捨てる。判定は sticky regex でアンカー位置から行い部分文字列を作らない。(5) private-key は BEGIN の完全一致を解決済みと扱い、ブロック状態機械が鍵本体を持つ | `regression-m2-0r2-001-window-completeness`: レビュアー再現 → 0 件 → url-credential 1 件; `lineOverlapBytes` 1 / 255 → ConfigError（256 は有効）; アンカー有界（`anchorMaxBytes` 宣言、無制限量化子なし、最長一致 ≤ 上限 ≤ 256）; `partial` の全接頭辞一致（固定例示）; 固定アンカー 8 分類 × 全切断位置（最小重なり）; key-value の空白 600 文字 / 引用値が切れ目をまたぐ; 性質テスト（固定シード 20260920、200 ケース。修正前は 5 ケース失敗: case 106 key-value、112 / 127 / 130 / 146 url-credential — パラメータは停止ポイント1 報告）; 追加1 性質 1（アンカーは本体の接頭辞）・性質 2（`partial` は接頭辞について閉じている）を本体 regex の文字クラスから生成した秘密値（区切り記号を必ず含む）各 30 件で確認; 性質 3（全 `anchorMaxBytes` ≤ 256 ≤ `LINE_OVERLAP`）; 追加2（scheme 65 文字は本体も不一致、キー名一覧の共有）; 追加3（中立埋め草 `,` で 120 ケース: 秘密値 ≤ `maxCarryBytes` なら同じ分類の finding、超なら oversized）; 追加4（BEGIN 入り 300 KiB の 1 行、END あり / なし → private-key 1 件のみ） | ユーザー名 > `maxCarryBytes` → secret または oversized（修正前は配置が重なり内で検出）; 既存の m1-r3-001（m2-0-001）、m2-0-008、R1-001 の 3 層テストを維持（有効設定は 128 → 256 に変更） |
| M2-0-R2-002 | Low | VALID | 修正済み | `allowRuleSchema` は `/^[^\r\n]*$/` のみ。修正: `/^[^\u0000-\u001F\u007F-\u009F\u2028\u2029]*$/`（`u` フラグ非依存の明示範囲、JSON Schema の `pattern` も同じ式）。text 出力側のエスケープは行わない（ADR-0012 追記） | `regression-m2-0r2-002-control-chars` 2 件: U+2028 / U+2029 / ESC / NEL / DEL / CSI 入りの `reason` と `path` が通る → スキーマエラー; TAB も C0 として拒否 | 日本語・記号・空白の通常 `reason` は有効 |
| M2-0-R2-003 | Low | VALID | docs 訂正 | 修正前ログ `tmp/m2-0r1/before.txt` は 13 件（10 FAIL / 3 PASS）、現在の `it(` 数は 8 + 3 + 3 = 14。差の 1 件は R1 停止ポイント1 の補足 1 に従って修正中に追加した「LineAssembler constructor check (second layer)」。response-r1 に「訂正（R2-003）」節を追記（元の記述は残す）。CHANGELOG の 14 / 294 は正しい | — | — |

INVALID / PARTIAL なし。R1 の 3 件の再判定（解消）はレビュアーと一致。

## 回帰テストの実行記録（数え方を併記）

- ソース上の `it(`: **18 件**（`grep -cE '^\s*it(\.skipIf\([^)]*\))?\(' tests/regression-m2-0r2-*.test.ts` → 16 + 2）
- vitest の実行数: **25 件**（固定アンカーの describe が 1 つの `it(` をループで 8 件に展開）。総数 **294 + 25 = 319**
- 修正前（`tmp/m2-0r2/before.txt`、追加1〜4 のテストを足す前の 19 件時点）: 18 FAIL / 1 PASS（ガード）。性質テストの修正前失敗例は使い捨てスクリプト `tmp/m2-0r2/property-prefix.mjs`（同じ生成器・同じシード）で記録: 5 ケース
- 修正後: 25 件 PASS。全体 62 ファイル 319 件 PASS を **10 回連続**で確認（`tmp/m2-0r2/ten-1..10.txt`）。残留プロセスなし
- 自己 verify（v0.3.2 の作業ツリー）: `npm run verify` / `npm run verify:dist` / リンク済み `aiqh verify`（`aiqh --version` = 0.3.2）とも VERIFY PASSED（7 チェック）。本体の自己スキャン 0 件（追跡 181 + 未追跡 4）
- 両対象での `aiqh security-scan`: 件数・finding 行とも v0.3.1 時と同一（Node 系 1 件、Python 系 19 件）。書込なし

## 性能の記録

- 合成の長い 1 行（3 MiB の minified 風: 普通の URL 300 個と `token:` 300 個を含む 1 行、および `eyJ` で始まる 1 MiB の base64 風 1 行）: 修正後 0.23〜0.28 s、v0.3.1 は 0.27〜0.29 s（3 回ずつ）。finding は両者同じ（key-value 1、oversized-candidate 1）
- 本体・両対象（`time aiqh security-scan`）: 停止ポイント2 報告に 3 回計測の値を記載。本体・両対象には 256 KiB 超の行が無いため窓走査は発動しない

## 教訓

- 「アンカーが見つかってから持ち越す」設計は、アンカー自体の長さが有界でなければ窓境界で破れる。アンカー長 ≤ 重なり という不変条件を定数と性質テストで固定する
- 「窓なし ⊆ 窓あり ∪ oversized」だけでは全部を oversized にする実装が通る。中立な埋め草で「同じ分類の finding」を要求する判定を必ず添える
- `partial` のような補助 regex は本体と別に書き写すと文字クラスの差で fail open になる。生成器は本体 regex の文字クラスから文字を引き、区切り記号を必ず含める
- 件数は「ソース上の `it(` 数」と「vitest の実行数」を数え方とともに両方書く
