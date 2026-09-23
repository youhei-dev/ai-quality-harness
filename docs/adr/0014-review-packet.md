# ADR-0014: review-packet は機械的に得た事実だけで作り、検査に通らなければ出さない

- 状態: 採用
- 日付: 2026-09-23（M2-1、v0.4.0）

## 文脈
M0〜M2-0 の独立レビューでは、レビューパケットを段階ごとの使い捨てスクリプト（zsh のヒアドキュメント + git コマンド）で作り、
Architecture Decisions / Verification Results / Known Risks の節を実装 AI が手で書いていた。これらの節には実装者の判断や
「すべて PASS」のような要約が入り、「AI の回答を品質保証の根拠にしない」原則と衝突する。秘密の形と生の制御文字は、
パケットを別の一時リポジトリに置いて scanner をかける、Python でバイト検査する、という手作業で確かめていた。
M2-0 R3 のパケットには、生文字を直す commit の差分として生の U+2028 / U+2029 が 1 行残った。

## 決定
1. **内容**: `aiqh review-packet --range <from>..<to>` は次だけを載せる。人間が渡した依頼文（`--request`）と前回レビュー（`--review`）、
   commit メッセージ（Co-Authored-By / Claude-Session の trailer は除去。実装 AI の説明を含み得る旨をパケットに明記）、変更ファイル一覧、
   ファイルごとの差分、`<to>` 時点の**全文**、`--doc` で指定した文書の全文、`<to>` の verify 結果（`latest.json` の `git.commit` が `<to>` で
   `dirty: false` のときだけ）。手書きの節と `--notes` は作らない。作成者の名前・メールアドレスは載せない
2. **範囲**: 両端を最初に完全 SHA に解決し、以降は SHA だけを使う。`<from>` が `<to>` の祖先でなければ exit 2（`git merge-base --is-ancestor`）。
   commit 一覧は `from..to`、差分は `git diff <from> <to>`（2 点のツリー比較、`-M50%`）。commit を含まない範囲も exit 2
3. **git の呼び出し**: シェルを経由せず引数配列で実行し、パスは `-z` で読み、内容は blob id で `git cat-file` から取る。差分はファイルごとに
   `:(literal)` pathspec で求め、利用者・リポジトリの設定で変わり得る項目（色、外部 diff、textconv、アルゴリズム、文脈行数、接頭辞、
   quotePath、relative 等）と `LC_ALL=C` / `TZ=UTC` を明示する。`core.precomposeunicode=false` も指定する（macOS の `git init` の既定 true では NFD のパスの
   pathspec が NFC に変換されて外れる。v0.4.1）。**パスの検査**（v0.4.1、M2-1-R1-001）: `-z` の出力は Buffer のまま NUL で区切り、パスごとに厳格に復号する。
   不正な UTF-8 は `invalid-utf8`、正しい UTF-8 でも LF・TAB 以外の禁止文字を含めば `raw-char`（どちらも出所 `path`、exit 1。`--exclude` した変更も対象）。
   復号できたパスだけを pathspec に使い、テキストの変更ファイルの差分が空なら exit 2（モードだけの変更・rename・空ファイルも差分ヘッダを持つため、空は pathspec の外れを意味する）
4. **変更ファイルの判定順**: `--exclude` に一致 → 除外（一覧に「excluded」と glob を記録。内容は検査も表示もしないが、blob の SHA-256 は求めて Integrity 表に載せる〈v0.4.0 SP3 #6〉）、lock ファイル → 全文・差分なし（name-status・行数なし・
   blob SHA-256）、submodule（表示する側で判定: 削除は旧側、それ以外は新側のモードが 160000。submodule → 通常ファイルの type change は通常ファイルとして扱い、
   旧側は空。status T の行は「(type change)」。v0.4.1、M2-1-R1-005）→ 内容なし、`--max-file-bytes`（既定 512 KiB）超 → exit 2（`--exclude` で明示的に除けば続行）、NUL を含む → バイナリ
   （全文・差分なし、サイズと SHA-256）、NUL を含まないが不正な UTF-8 → finding（exit 1。`--exclude` で除けば続行）、それ以外 → テキスト。
   lock ファイルはパスの最後の要素で判定し、一覧は `src/review/packet.ts` の `LOCK_FILE_NAMES` 1 か所: `package-lock.json`、`npm-shrinkwrap.json`、
   `yarn.lock`、`pnpm-lock.yaml`、`bun.lockb`、`poetry.lock`、`Pipfile.lock`、`uv.lock`、`Cargo.lock`、`Gemfile.lock`、`composer.lock`、`go.sum`。
   含めるオプションは作らない
5. **UTF-8**: 依頼文・レビュー原文・`--doc`・commit メッセージ・`latest.json` は不正な UTF-8 なら exit 1。変更ファイルは NUL の有無で先にバイナリを判定し、
   NUL が無ければ不正な UTF-8 は exit 1（4 の順）
6. **生文字の禁止集合**（`src/security/raw-chars.ts`。追跡中の Markdown を検査するテストも同じ部品を使う）: C0（TAB・LF 以外。CR を含む）、DEL、C1、
   U+2028 / U+2029、双方向制御文字（U+202A–U+202E、U+2066–U+2069）、U+FEFF（ファイル先頭の BOM も含む）
7. **検査（fail closed）**: 2 段で行う。(1) 入力ごとに、不正な UTF-8 → 生文字 → 秘密の形（共有 scanner の `scanString`）を調べる。`security.allow` は
   出所のリポジトリパスと行に適用する（差分の行は hunk から新旧ファイルの行へ対応付ける。依頼文・レビュー・commit メッセージ・verify 結果には
   パスが無いので適用しない）。(2) 組み立てたパケット全体に生文字と秘密の形の検査をもう一度かける（`--exclude` の glob などテンプレートにだけ
   現れる文字列も対象。行→出所の対応表で allow を適用）。1 件でもあれば exit 1 で、パケットも ZIP も書かない。抑止した件数と一覧は
   パケットの Integrity 節に載せる。出力は出所・行・分類またはコードポイントだけで、値・行内容・前後の文脈は出さない（`maskSecrets` / `maskDeep` も通す）。
   差分の中の finding は、差分テキストの行とファイルの行を両方出す（`diff a.ts:7 (a.ts:1)`。`<from>` にしか無い削除行は `(a.ts@from:5)`。v0.4.0 SP3 #1）。
   **安全表示**（v0.4.1、M2-1-R1-002）: review-packet が標準出力・標準エラー・`--json` に出す文字列はすべて `escapeRawChars`（`src/security/raw-chars.ts`。
   禁止文字と LF・TAB を `\u{HEX}` に）を通してから masker に通す。`--cwd`（省略時はカレント）・`--output`・`--zip-output` を解決した完全パスに禁止文字があれば
   exit 2 で、メッセージはオプション名とコードポイントだけ
8. **書き込み**（v0.4.1、M2-1-R1-003 で 2 段階に変更）: パケットと ZIP の中身を両方メモリで作ってから、(1) 準備段階: 書き込み先が無いか通常ファイルであることを
   確かめ、両方の一時ファイル（同じディレクトリ、`.<名前>.tmp-<pid>-<乱数>`、`wx`）を書き終える。失敗したら一時ファイルを消して exit 2（既存ファイルには触れない）。
   (2) 確定段階: 既存のパケット / ZIP を退避名（`.<名前>.bak-<pid>-<乱数>`）へ rename → 新パケット → 新 ZIP の順に rename → 両方成功したら退避を削除。
   途中で失敗したら、新しく置いた分を消し、退避から戻して exit 2。**戻す処理が失敗した場合は、退避ファイルを消さずに残し、その場所を（安全表示を通して）
   標準エラーに出して exit 2**。パケット全体が `--max-packet-bytes`（既定 4 MiB）を超えれば exit 2 で何も書かない。
   出力ファイル名は ASCII（英数字・`.`・`_`・`-`）、`--label` は英小文字・数字・`.`・`-`（1〜64 文字）
9. **再現性**: 本文に実行時刻を入れない（日時は `<to>` の committer 時刻を UTC で）。同じ範囲・同じ入力・同じ aiqh と git の版なら、パケットと ZIP は
   バイト単位で一致する
10. **ZIP**: Node 標準の `zlib.crc32` で自前に書く（新規依存なし、ADR-0008）。無圧縮（store）、固定 DOS 日時 1980-01-01 00:00:00、UTF-8 フラグ、
    Unix モード 0644。中身はパケット 1 ファイルだけ。ZIP64 は扱わない
11. **終了コード**: 0 = 書いた、1 = finding があり書かない、2 = 使い方・git・上限・書込のエラー（commander の使い方エラーも 2 にする。1 は finding 専用）
12. **設定ファイル**: 新しいキーは追加しない。`security.allow` と窓の設定は既存の `security` セクションを使う。既定の場所は `--cwd` で指定したディレクトリ
    （省略時はプロセスのカレント）の `aiqh.config.jsonc`、`--config` で変更可。プロセスのカレントにある別リポジトリの設定を `--cwd` 先に適用しない（fail open を防ぐ。
    テストで固定、v0.4.0 SP3 #5）。リポジトリのサブディレクトリで実行した場合はルートの設定を探さない（allow が効かず、より厳しい側に倒れる）。
    `--request` / `--review` / `--config` / `-o` / `--zip-output` の相対パスは `--cwd` のディレクトリ（省略時はカレント）を基準に解決する（security-scan と同じ）
13. **Markdown の描画**（v0.4.1、M2-1-R1-004）: fence の外に入る値は描画する場所ごとに関数を分ける。インラインコード（パス・glob・ファイル名・ラベル・
    JSON 由来の値）は LF・TAB・バックスラッシュ・バッククォートを `\n` `\t` `\\` `` \` ``、その他の制御・区切り・双方向制御文字を `\u{HEX}` に置き換えて
    **中身からバッククォートをなくし、1 個のバッククォートで囲む**（囲みを長くする方式は採らない）。見出しにはインラインコードと固定の文字列だけを入れる。
    表のセルはさらに `|` を `\|` にする（commit の件名・verify の値も同じ）。描画で生文字は見えなくなるため、verify の値（生文字と秘密の形）、`--exclude` と
    依頼文・レビューのファイル名（生文字）は描画の前の値を検査する

## 代替案
- 差分だけを載せる（ROADMAP の当初案）: レビュアーが変更の前後関係を追えない。全文を載せる
- 検出した値をマスクして出す: レビュー対象のコードを書き換えることになり、何が隠れたかも分からない。出さない（fail closed）
- 生文字を可視の記号に置き換える `--escape-raw`: 置換が内容の忠実さを損なう。作らず、必要なら `--exclude` と依頼文での説明で扱う
- OS の `zip` コマンド: Linux で未導入のことがあり、Windows には無く、mtime が入る。自前で書く
- deflate 圧縮: 出力が zlib の版に依存し得る。store にする

## 影響
- 生文字を直す commit（M2-0 R3 の例）はそのままではパケットにできない。該当ファイルを `--exclude` し、依頼文で説明する
- CRLF のファイル、BOM 付きのファイルを含む範囲はパケットにできない（exit 1）。`--exclude` で除く
- パケットの作成に git 2.x が必要。出力の再現性は git の版に依存する（git の版をメタデータに記録する）
- 本体リポジトリ自身の追跡中 Markdown は、広げた禁止集合でも 0 件（54 ファイル、v0.4.0 時点）
