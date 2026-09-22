# ADR-0012: `security.allow` による例外指定と key-value 走査の方針

- 状態: 採用
- 日付: 2026-09-20（M2-0）

## 文脈
Security Scan（ADR-0010）は fail closed で、対象リポジトリのテスト内ダミー値やレビュー原文の例示のように「秘密の形だが秘密ではない」ものも finding にする。
M1 ではこれを連結方式や分割表記で回避してきたが、対象リポジトリのコードを変えられない場合や、記録として原文を残したい場合に例外指定が要る。
一方で例外は隠れた fail open になりやすい。key-value 分類（`password=…` 等）は誤検出が多く M1 では mask 専用だった。

## 決定
- `aiqh.config.jsonc` の `security.allow[]` で例外を指定する。各規則は `path`（glob、必須）、`category`（任意）、`line`（任意）、
  **`reason`（必須、空白のみ不可）**、`expires`（任意、`YYYY-MM-DD`）を持つ。config は信頼された入力（R-006 の trust boundary）で、
  例外はコードレビューで見える。R-006 の位置づけは変えない
- **抑制できるのは秘密の形の finding（`secret` / `oversized-candidate`）だけ**。`tracked-env` / `untracked-env` / `gitignore` の衛生 finding は
  設定では抑制できない（修復するしかない）
- 期限切れの規則は無効（該当 finding は残る）。未使用の規則と期限切れの規則は警告として出力する（設定の腐敗防止）
- 抑制した finding は隠さない: 件数と `[allowed] file:line category by rule #n`、使った規則と理由を scan の出力（text / JSON）に必ず残す。
  verify のレポートには security チェックの出力として残る（実行経路は M0 の 1 本のまま）
- glob の照合は Node 標準の `path.matchesGlob`（依存を追加しない）。パスはリポジトリ相対・`/` 区切り
- key-value 分類を走査対象にする。ただし値が秘密らしい（`looksLikeSecretValue`）ときだけ finding にする。候補は引用符付きリテラルと dotenv / shell 形式の
  裸の値のみで、`()[]{}` や `.` / `->` / `::` を含む識別子連結（式）、補間・参照、プレースホルダ、真偽値・`null` / `None`、数値のみは除外。
  判定の根拠と除外リストは `patterns.ts` に一本化し、masker は従来どおり広くマスクする
- 設定化: `envProbePaths` / `exampleEnvSuffixes` / `maxLineBytes` / `lineOverlapBytes` / `maxCarryBytes`（既定は M1 の値。既定のままの config が M1 と同じ挙動になることをテストで固定）

## 代替案
- finding を隠すだけの allow（件数を出さない）: fail open が見えなくなるため採らない
- 衛生 finding も抑制可能にする: `.env` の ignore 漏れを設定で黙らせる手段になるため採らない
- key-value を走査しない（M1 のまま）: 実際の設定ファイルの秘密を見逃す。走査した上で誤検出を allow と判定関数で抑える
- `security.scanKeyValue` フラグ: 既定で有効にし、抑制は allow で行うためフラグは設けない

## 影響
- 既知の制限: 英字のみの長いパスフレーズは key-value で検出できない。`eyJ` 等の継続文字だけが 64 KiB 超続く長行は oversized-candidate になる
- 対象リポジトリのテスト内ダミー値は、連結方式化か `security.allow`（理由・期限つき）のどちらかで扱う。判断は人間
- レビュー原文コピーの分割表記（CLAUDE.md の規約）は、allow が入っても当面維持する（docs には値を置かない方針のため）

## 追記（v0.3.1、M2-0 独立レビュー R1）
- **窓設定の相互制約**（M2-0-R1-001、High）: `maxLineBytes` / `lineOverlapBytes` / `maxCarryBytes` を個別に正の整数と検証するだけでは、
  `lineOverlapBytes > maxLineBytes` や `maxCarryBytes > maxLineBytes` の組み合わせで `LineAssembler` の窓が縮まず走査が終わらなかった
  （fail closed ではなく「終了しない」。同期ループ中は CLI のシグナルハンドラも走らない）。`0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes` を
  既定値適用後に検証して `ConfigError`、`LineAssembler` のコンストラクタでも `ScanError`、長行ループには進捗不変条件（`ScanError`）の 3 層で守る
- **出力のマスク境界**（M2-0-R1-002）: `security-scan` の text / JSON 出力も `maskSecrets` / `maskDeep` を通す。config が信頼された入力であることと、
  秘密の形を生で出力してよいことは別。`reason` / `path` の改行を禁止
- **未追跡 `.gitignore` での冪等性**（M2-0-R1-003）: 「未追跡のルールは保護と数えない」は維持しつつ、書込側は追跡状態で分岐し、未追跡で正規行がある場合は
  追記せず `git add .gitignore` を案内する

## 追記（v0.3.2、M2-0 独立レビュー R2）
- **`reason` / `path` の文字集合**（M2-0-R2-002）: 改行に加えて C0 制御文字（U+0000〜U+001F）、DEL（U+007F）、C1 制御文字（U+0080〜U+009F）、
  U+2028 / U+2029 をスキーマで禁止する（`u` フラグに依存しない明示範囲。JSON Schema の `pattern` も同じ式）。text 出力側でのエスケープは行わない:
  config は R-006 で信頼された入力であり、禁止文字を入力側で拒否すれば監査出力の 1 行 1 規則は保たれる。マスクは秘密の形に対する防御で、端末制御の
  エスケープ機能ではない
