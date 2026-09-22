# M2-0 完了報告 — ai-quality-harness（aiqh）

- 完了日: 2026-09-23
- 完了ベースライン: `v0.3.3`（commit cb632cd、M2-0 — independent review R3 applied）。完了記録のタグ: `v0.3.4`（M2-0 complete — scanner maintenance;
  independent reviews R1-R4 recorded。コード変更なし）
- 状態: M2-0「スキャナ保守」の項目（ROADMAP）をすべて実装し、独立レビュー 4 ラウンド（R1: 3 件、R2: 3 件、R3: 3 件、R4: 1 件）のうち R1〜R3 を反映。
  R4（High なし）は事前の基準により M2-1 以降へ持ち越し（`docs/reviews/m2-0/response-r4.md`）
- タグ: `v0.3.0`（commit 8e81d15 / tag object 3e54718）、`v0.3.1`（e25f59f / c2c6985）、`v0.3.2`（cfadf18 / c9be6e1）、`v0.3.3`（cb632cd / 984bfcb）、`v0.3.4`（完了記録）。
  どのタグも削除・付け替えしていない
- 対象リポジトリの固有情報（パス・行番号・設定値・検出の詳細）は本書に書かない。リポジトリ名は従来どおり docs で参照する

## 1. M2-0 で作ったもの

| 領域 | 内容 |
|---|---|
| 窓走査の候補持ち越し（M1-R3-001） | 1 行が `maxLineBytes` を超えたら窓ごとに同じ行番号で照合し、固定の重なりではなく**候補プレフィックス**を次の窓へ持ち越す。持ち越しが `maxCarryBytes` を超える候補は捨てずに `oversized-candidate` finding（分類・行番号のみ、fail closed）。メモリはファイルサイズに比例しない |
| 窓設定の相互制約と 3 層の防御（R1-001） | `MIN_LINE_OVERLAP_BYTES (256) <= lineOverlapBytes <= maxCarryBytes <= maxLineBytes`。(1) `resolveSecurity()` が既定値を埋めた後に検証（ConfigError、exit 2）、(2) `LineAssembler` のコンストラクタ（ScanError）、(3) 長行ループの各反復で buffer が縮む不変条件（ScanError）。同期ループ中は CLI のシグナルハンドラも走らないため、「終わらない」状態を作らないことが fail closed の前提 |
| 完全性の不変条件（R2-001 / R3-001、ADR-0013） | 窓なしの finding は、窓走査でも同じ分類の finding か `oversized-candidate` になる。**有界アンカー**（`anchorMaxBytes` を宣言、最大 67）、**最小重なり** 256、**最も早い未解決アンカー**からの持ち越し、`partial`（接頭辞について閉じた `^…$`、sticky で評価）による解決。private-key のアンカーは固定文字列 `-----BEGIN `（BEGIN マーカーの完成で解決済み、鍵本体はブロック状態機械）。**構造テスト**: scanner の本体を全パターンで「アンカー部分式 + 残り」の連結で組み立て、本体の source がアンカーの source で始まることを確認（例外リストは空） |
| key-value 走査（M2-0 §6、ADR-0012） | 走査対象に追加。値が秘密らしい場合（`looksLikeSecretValue`: 引用リテラルか裸の dotenv 形式、8 文字以上、文字種の混在。参照・プレースホルダ・真偽値・数値・コードらしい裸の値は除外）だけ finding。masker は従来どおり全代入を redact。既知の制限（文字だけの長い合言葉は検出しない）は CONFIG_SPEC に記載 |
| `security.allow`（M2-0 §7） | パス（glob）・分類・行・理由（必須）・期限で secret / oversized-candidate だけを抑制。抑制した finding・使った規則・未使用 / 期限切れの規則を必ず出力（隠さない）。`reason` / `path` は制御文字（C0 / DEL / C1）と U+2028 / U+2029 を禁止（R1-002 / R2-002） |
| 設定化（M2-0 §8） | `.env` 判定の代表パス、example サフィックス、窓走査の 3 値を `security` セクションに。既定値は M1 の挙動 |
| PEM finding の重複統合（M1-R3-005） | `block:<category>:<beginLine>:<endLine>` で統合。窓の重なりでも 1 件 |
| 追跡済み `.gitignore` によるカバレッジ判定（M1-R3-004） | `git check-ignore --no-index -v` の source が追跡済みの `.gitignore` の非否定ルールのときだけ保護と数える（未追跡・`.git/info/exclude`・グローバル設定は数えない） |
| `artifacts/` の判定と `--write-gitignore`（M1-R3-002 / 003、R1-003） | 実際に生成するパス複数で判定（sentinel 1 個と同一視しない）。否定ルールの修復（needed なら追記）、冪等。未追跡の `.gitignore` に行がある場合は重複追記せず `git add` を案内、無ければ 1 回だけ作成 |
| security-scan 出力のマスク境界（R1-002） | テキスト出力は各行 `maskSecrets`、JSON は `maskDeep`（init / verify と同じ境界） |
| masker と scanner のパターンの関係（R3-002） | `SECRET_PATTERNS` は検出方針の単一の定義。masker は `pattern`、scanner は `scanPattern ?? pattern`。`scanPattern` を持つのは url-credential だけ（scheme 64 文字まで。テストで固定）。**既知の制限**: scheme が 64 文字を超える URL 認証情報は scanner では検出しない（masker は redact する）。masker の出力は代表入力の完全一致と、凍結した v0.3.2 / v0.3.1 の参照との差分テストで固定 |
| docs / ADR | ROADMAP、ARCHITECTURE §6.1b、CONFIG_SPEC §3b / §5.3b、ADR-0010 改訂、ADR-0012（`security.allow` と key-value）、ADR-0013（窓走査の完全性、R3 追記）、CHANGELOG、README、`docs/reviews/m2-0/`（R1〜R4 の原文と対応記録） |

## 2. 検証の構成（完了時点 v0.3.3）

| 項目 | 値 |
|---|---|
| 自己 verify | `npm run verify`（ソース実行）/ `npm run verify:dist`（ビルド済み JS）/ リンク済み `aiqh verify`。7 チェック（lint / typecheck / unit / build / package / security / dependency）すべて PASS、e2e NOT APPLICABLE。security は未追跡ファイル込みで検出 0 件 |
| テスト | 66 ファイル 338 件。完了前に 10 回連続実行で全回 PASS。ダミー秘密値・PEM は実行時連結 |
| タグ別のテスト件数 | v0.3.0: 280 → v0.3.1: 294 → v0.3.2: 319 → v0.3.3: 338（v0.3.4 はコード変更なしで 338） |
| ラウンド別の回帰テスト | M2-0 本体 28 件、R1 14 件、R2 はソース上の `it(` 18 件 / vitest の実行数 25 件、R3 19 件（`it(` 数 = 実行数）。件数は数え方とともに記録する（R2-003） |
| リリース手順（M1-R1 で固定、M2-0 で運用） | commit（指摘単位。複数の指摘にまたがるファイルは**中間版**を `git hash-object -w` + `git update-index --cacheinfo` で stage し、commit 後に HEAD の blob を記録済みチェックサムと照合）→ **各 commit 単体の worktree 検証（typecheck / vitest / `npm run verify`）を push 前に実施** → `git status` clean と作業ツリー・HEAD の blob が検証済み最終版と一致（チェックサム）→ HEAD で 10 回連続テスト → HEAD で `verify` / `verify:dist` / リンク済み `aiqh verify`（R3 から commit 後の HEAD でも 3 つとも実施）→ 1 件でも FAIL なら push せず停止 → push（別コマンド）→ 注釈付きタグ → タグ push |
| 事前確認 | 停止ポイント2 の前に、予定した commit の内容を v0.x に積み上げた worktree で順に検証し、最終状態が作業ツリーとバイト単位で一致することを確認（R2 / R3） |
| セキュリティ検査 | 自己スキャン（未追跡込み）、変更・新規ファイルの秘密の形・個人名・ホームパス・対象固有情報の検索、生の U+2028 / U+2029 / C1 の文字単位の走査（Python）を各ラウンドで実施。レビューパケットは使い捨て git リポジトリにコピーして実 scanner で走査してから ZIP |
| 対象リポジトリでの確認 | 各ラウンドで Node 系・Python 系の対象に `aiqh security-scan` だけを実行（書込なし、値は出さない）。件数・finding 行の不変と実行時間を記録し、走査の前後で `git status` が変わらないことを確認 |

## 3. レビューループの運用と指摘件数の推移

M0 / M1 と同じ運用（パケット → 独立レビュー → **レビュアーの「コード等価の再現」を実コードで再現してから判定** → 回帰テスト先行で「修正前 FAIL」を記録 →
最小修正 → 10 回連続 → 自己 verify → docs → 対応記録 → 停止ポイント2 → 指摘単位の commit → 各 commit の worktree 検証 → push → タグ → 次のパケット）。

指摘件数の推移: **R1: 3（High 1 / Medium 2）→ R2: 3（High 1 / Low 2）→ R3: 3（High 1 / Medium 1 / Low 1）→ R4: 1（High 0 / Medium 1）**。
事前の基準「R4 で High が無ければ M2-0 完了」により M2-0 を完了とし、R4 の 1 件は M2-1 以降へ持ち越した。

| ラウンド | 主な指摘 | 対応したタグ |
|---|---|---|
| R1 | 窓設定の相互制約が無く走査が終わらない（High）、security-scan 出力のマスク漏れ、未追跡 `.gitignore` での `--write-gitignore` の重複追記 | v0.3.1 |
| R2 | アンカーが有界でなく窓境界で url-credential を見逃す（High）、allow の文字種、R1 の件数記録の誤り | v0.3.2 |
| R3 | private-key のアンカーが本体の接頭辞でない（High）、scanner の都合で masker の範囲が狭まった、response-r2 の生の区切り文字 | v0.3.3 |
| R4 | 窓の境界で左右の文脈が失われる誤検出（Medium、持ち越し） | —（v0.3.4 は記録のみ） |

## 4. 学んだこと（M2-1 以降への持ち帰り）

- **性質テストは入力空間の標本**: 生成器の範囲が狭いと見逃す（R3-001。R2 の生成器は private-key のラベルを 20 文字以下でしか作らなかった）。
  **構造による固定**（本体 = アンカー部分式 + 残り、source の接頭辞関係をテスト）と、**上限から導いた長さ**（0、1、アンカー長±1、重なり±1、持ち越し上限±1、上限超）で補った
- **不変条件を片方向だけで固定しない**: 「窓なし ⊆ 窓あり」（見逃し防止）だけでは、逆方向（誤検出）の退行を検出できない（R4-001）。性質テストは双方向にする
- **共有定義を一方の都合で変えない**: scanner のアンカーの都合で共有パターンを狭めたら、masker の範囲も狭まった（R3-002）。分ける必要があれば scanner 用の定義を別に持ち、
  どれが分かれているかをテストで固定する。正規表現の書き換えは、凍結した旧版との差分（一致位置・一致文字列）で機械的に確かめる
- **人間側の依頼書の誤り・漏れも起きる**: R2 の追加事項は「本体とアンカーの上限をそろえる」を url-credential と key-value にしか挙げず、private-key が漏れた。
  R3 の依頼書の「ラベル 33 文字・最小重なりで修正前 0 件」は再現しなかった（マーカーが最小重なりより短い）。どちらも、実コードで確かめる運用が検出した
- **レビュアーの「コード等価の再現」は、実コードで再現を確かめてから判定する**: 窓境界を狙う再現では、チャンクの大きさで窓の境界が変わる（最初の試行では境界が合わず再現しなかった）
- **ツール入力でエスケープ表記が生の区切り文字に変わる**: 文書やコメントに書いた U+2028 / U+2029 のエスケープ表記が、生の文字として書き込まれた（R2 の response、R3 の作業中にも 1 回）。
  docs の編集はエスケープ表記を文字コードから組み立てるスクリプトで行い、書き込み直後に文字単位で検査する。追跡中の Markdown を検査するテストを置いた
- **件数は数え方つきで書く**: ソース上の `it(` 数と vitest の実行数を、コマンドとともに両方記録する（R2-003）
- **中間版の stage とチェックサム照合**: 複数の指摘にまたがるファイルは、事前に worktree で検証した中間版を index に直接登録し、commit 後に HEAD の blob を照合する
- **commit 後の HEAD での verify**: リリース判定の根拠は commit 済み HEAD。`verify:dist` とリンク済み `aiqh verify` も HEAD で実施する（R2 では作業ツリーでのみ実施していた）

## 5. M2-1 開始時の前提

- 基準タグ: `v0.3.4`（コードは v0.3.3 と同一。commit SHA はタグ付与後に `git rev-list -n1 v0.3.4` で確認し CHANGELOG / 最終報告に記載）
- テスト件数: 338（すべて PASS、10 回連続）
- 自己 verify: lint / typecheck / unit / build / package / security / dependency の 7 チェック PASS。e2e は NOT APPLICABLE
- バックログ（ROADMAP の順）:
  1. M2-0-R4-001「窓走査は正規表現の境界の文脈を保つ」（対応方針 (a) / (b) は着手時に決める。性質テストを双方向に）
  2. 既知の制限: scanner は scheme 64 文字超の url-credential を検出しない（masker は redact する）
  3. M2-1 `aiqh review-packet`、M2-2 `aiqh review-import`、再修正ループの手順、出力パーサ、verify レポートへの oversized / allow 警告の構造化、key-value 誤検出の継続記録
  4. 従来の行き先のまま: R-010（M4）、R-011 後半（M3）、R-013（並列化時）、Windows での挙動確認（M3）、配布（M3）
