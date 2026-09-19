# ADR-0010: Security Scan は内蔵実装とし、masker とパターン定義を共有する

- 状態: 採用
- 日付: 2026-09-18

## 文脈
M0 の 7 分類のうち security は NOT APPLICABLE のままだった。外部ツール（gitleaks / semgrep 等）は対象リポジトリに無いものを
無理に導入しない方針。R-012（masker と scanner の検出仕様の整合）が持ち越しになっていた。

## 決定
- `aiqh security-scan` を内蔵する（Node 標準 + `git` のみ）。対象は **git 管理下のファイル**（`git ls-files`）。バイナリ（先頭 8KB に NUL）と 1MiB 超はスキップして件数だけ報告
- 検出 3 種: (1) 秘密情報パターン、(2) git 管理下の `.env` 系（`.env.example` / `.env.sample` / `.env.template` / `.env.dist` は example として情報のみ）、(3) `.gitignore` の `.env` / `.env.*` 欠落
- **値は出力しない**: 結果は分類・パス・行番号・件数のみ。マッチ文字列も行内容も持たない
- パターン定義は `src/security/patterns.ts` に一本化し、masker（レポートのマスク）と scanner が同じ定義を使う。各定義は `scan` フラグを持つ:
  - `scan: true`: private-key / url-credential / anthropic / openai / aws / github / slack / google / gitlab / jwt
  - `scan: false`（マスク専用）: bearer / basic / key-value。ソースコード中の `password=` / `Bearer …` は誤検出が多く、値の漏洩防止はレポート側のマスクで担保する。scanner は未走査分類と理由を**必ず表示**する
- 走査前に aiqh 自身の正規マーカー `[REDACTED:<category>]` を除去する（レポートやテストに正当に現れ、URL 内では認証情報の形になるため）。マーカーの後ろに実際の秘密が続く行は検出を維持
- 互換テスト（R-012）: 実行時連結で生成した合成資格情報コーパスを masker と scanner の両方に入力し、`scan: true` の全分類で「マスクされる」かつ「同じ分類で検出される」、平文は両方で無反応、結果に値が含まれないことを検証
- 既定は必須チェック。終了コードは 0 / 1 / 2（非 git は fail closed）

## 代替案
- 外部ツールの呼び出し: 対象ごとの導入が前提になり、検出仕様の整合も保てない
- key-value を走査に含める: 誤検出が多すぎる。M2 で `security.allow` と抑制方式を設計して再検討

## 影響
- push 前 hook（共通設定）とは別の実装であり、一致は保証しない（hook は変更しない）
- 対象リポジトリのテスト内ダミーキーは検出される。連結方式へ直すか、M2 の `security.allow` で許容する

## 改訂（v0.2.1、M1 独立レビュー R1）
- **走査対象**（M1-R1-001、多層防御）: 追跡ファイルに加えて、未追跡で ignore されないファイル（`git ls-files --others --exclude-standard`）も走査する。
  未追跡の `.env*` は読まない（`.gitignore` の判定で扱う）。リリース判定の根拠は commit 済み HEAD での verify であり、走査対象の拡張はその代替ではない
- **逐次読み・サイズ上限の廃止**（M1-R1-004）: 1 MiB 超のスキップは fail open だった。64 KiB チャンクの逐次読み（`StringDecoder` で UTF-8 境界を保持）に変え、
  テキストはサイズに関係なく走査する。バイナリ判定（先頭 8 KiB の NUL）は維持し件数を表示。読取エラーは ScanError → exit 2（fail closed）
- **private-key の状態機械**（M1-R1-002）: 行単位の走査では複数行 PEM の `[\s\S]*?` パターンが一致しなかった。定義（`patterns.ts`）に
  `scanMode: "block"` と BEGIN / END 行のパターンを持たせ、scanner は BEGIN 行から END 行までを 1 件の finding（開始行・終了行）として記録する。
  END 行が無いまま EOF に達した場合も検出する。masker は従来どおり全文に `pattern` を適用し、互換テストのコーパスは実際の複数行 PEM
  3 種（RSA / EC / 無印）に変更した
- **`.gitignore` 判定を Git に委ねる**（M1-R1-005）: 代表パス（`.env`、`.env.local`、`.env.production`、`.env.development`）を
  `git -c core.excludesFile=/dev/null check-ignore --no-index -v -n --stdin -z` に渡し、**一致ルールの出所がリポジトリ内の `.gitignore` で、
  かつ否定パターンでない**ときだけ保護ありとする。グローバル除外と `.git/info/exclude` はクローン固有のため保護と見なさない。
  `.env.example` 等の否定（`!.env.example`）は代表パスに含まれず許容される。`check-ignore` が exit 128 なら ScanError（exit 2）
- docs や ADR に PEM の BEGIN 行や 「スキーム://ユーザー:パスワード@ホスト」 の形を文字どおり書くと自己スキャンに一致するため、例示は分割表記
  （`"-----BEGIN RSA " + "PRIVATE KEY-----"`）や `<scheme>://<user>:<password>@<host>` の言い換えにする（テストの連結方式と同じ扱い）

## 改訂（v0.2.2、M1 独立レビュー R2）
- **未追跡の `.env*` は存在そのものを finding にする**（M1-R2-001）: 代表 4 パスのプローブだけでは `.env.staging` 等の実在ファイルを見逃す fail open だった。
  `git ls-files --others --exclude-standard` に出た時点で ignore されていないことは Git 自身が確定しているので、中身を読まずに `untracked-env`
  （パスのみ）を報告する。example 系は情報のみ。代表プローブは予防的なカバレッジ確認として残す
- **lstat の失敗は ENOENT だけスキップ**（M1-R2-002）: それ以外（EACCES / EPERM / ELOOP …）はファイルを走査から隠すので ScanError（exit 2）。
  判定は `classifyStatError()` に切り出して単体テストする
- **窓走査**（M1-R2-004）: 改行のない巨大ファイルで保持量がファイルサイズに比例していた。`LineAssembler` が 1 行の保持を `MAX_LINE_BYTES`（256 KiB）に
  抑え、超過時は同じ行番号の区間として行指向パターンに掛け、末尾 `LINE_OVERLAP`（4 KiB。行指向パターンの最長一致を十分に収める）を残して接続する。
  重複 finding は 1 件に統合。上限は JS 文字列長（UTF-16 コード単位）で測るため、実メモリはおおむね 2 ×（上限 + 重なり）バイト。
  上限超過を ERROR にする案は採らない（同梱の minified バンドル等で門が閉じるのを避ける）。重なりより長い単一トークンは検出できないことがある
- `gitIgnoredByRepoRules()` を export し、`aiqh init` の `artifacts/` 提案と判定を共用する（M1-R2-005、ADR-0011）
