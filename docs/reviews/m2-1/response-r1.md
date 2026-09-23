# M2-1 独立レビュー R1 への対応記録（response-r1）— v0.4.1

- 対象レビュー: `docs/reviews/m2-1/independent-review-r1.md`（受領ファイル名 `independent-review-m2-1-r1-for-claude.md`、2026-09-23 付、SHA-256 df9a30f9…。
  High 3 / Medium 2 / Low 0。対象 v0.4.0 = commit 4e196a3 / tag object 3b7ac13、パケット `review-packet-m2-1-r1.md`〈範囲 v0.3.4..v0.4.0〉）
- 対応日: 2026-09-23
- 人間の判断: 5 件すべてに対応して v0.4.1 を作る。各指摘の方針（パスの厳格な復号と生文字検査、出力パスの拒否と安全表示、2 段階の書き込みと戻し、
  文脈ごとの Markdown 描画、表示する側による submodule 判定）と、相対パスの基準（`--cwd` を基準にする現行どおり）は依頼書による
- 進め方: 5 件すべてを v0.4.0 の実コード（`node src/cli.ts review-packet`）で先に再現した（`tmp/m2-1/r1-fix/repro.mjs`）。回帰テストを先に書いて修正前 FAIL を記録し、
  1 指摘 1 commit で直した

## 判定と対応

| ID | 重大度 | 判定 | 再現（v0.4.0） | 修正 | 回帰テスト | 修正前 FAIL |
|---|---|---|---|---|---|---|
| M2-1-R1-001 | High | VALID | 再現した。0xFF を含むパス（index に直接登録）で exit 0、パスは U+FFFD に置換され、その差分節は空。macOS はこの名前のファイルを作れない（EILSEQ）ため、レビュアーの手順（ファイル作成）ではなく `git update-index -z --index-info` で登録した | `-z` の出力を Buffer のまま区切り、パスを `decodeUtf8Strict` で復号（不正 → `invalid-utf8`、出所 `path`、exit 1）。正しい UTF-8 でも LF・TAB 以外の禁止文字 → `raw-char`（exit 1）。`--exclude` した変更も対象。復号できたパスだけを pathspec に使い、テキストの変更ファイルの差分が空なら exit 2。git に `core.precomposeunicode=false` を指定 | `tests/regression-m2-1-r1-001-git-paths.test.ts`（8 件） | 修正直前 5 / 7、v0.4.0 に当てて 6 / 8（NFD のケースを後から追加） |
| M2-1-R1-002 | High | VALID | 再現した（レビュアーは未実行）。親ディレクトリに U+2028 を含む `-o` で exit 0、標準出力に生の U+2028 が 2 か所、`--json` にも 1 か所（`JSON.stringify` は U+2028 をエスケープしない） | `--cwd`（省略時はカレント）・`--output`・`--zip-output` を解決した完全パスに禁止文字があれば exit 2（オプション名とコードポイントだけを出す）。安全表示関数 `escapeRawChars`（禁止文字と LF・TAB を `\u{HEX}` に）を 1 か所に置き、標準出力・標準エラーの全行と `--json` の全文字列を通してから masker | `tests/regression-m2-1-r1-002-output-paths.test.ts`（6 件） | 6 / 6 |
| M2-1-R1-003 | High | VALID | 再現した（レビュアーは未実行）。ZIP の親が通常ファイルのとき exit 2 だが、既存パケットは新しい内容に置き換わっていた | 2 段階の書き込み。準備: 両方の中身をメモリで作り、書き込み先が無いか通常ファイルであることを確かめ、両方の一時ファイルを `wx` で書く（失敗なら一時ファイルを消して exit 2）。確定: 既存ファイルを退避名へ rename → 新パケット → 新 ZIP。途中で失敗したら新しく置いた分を消し、退避から戻して exit 2。戻せなければ退避の場所を出して残す（exit 2）。一時・退避の名前は pid と乱数を含む | `tests/regression-m2-1-r1-003-two-phase-write.test.ts`（5 件。注入は関数の引数 `writeHooks`） | 4 / 5（成功時のケースは修正前も PASS） |
| M2-1-R1-004 | Medium | VALID | 再現した（レビュアーは未実行）。依頼文のファイル名・`--exclude` の glob・verify の check 名に LF + `# …` を入れると、トップレベルの見出しが 10 → 13 | 描画を文脈ごとに分けた。インラインコードは LF・TAB・バックスラッシュ・バッククォートを `\n` `\t` `\\` `` \` `` に置き換えて中身からバッククォートをなくし、1 個のバッククォートで囲む。見出しにはインラインコードと固定の文字列だけ。表のセルはさらにパイプを `\|` にする（件名・check 名など JSON 由来の値も同じ）。描画で生文字が見えなくなるため、verify の値・`--exclude`・依頼文とレビューのファイル名は描画前に検査する | `tests/regression-m2-1-r1-004-markdown-structure.test.ts`（1 件） | 1 / 1 |
| M2-1-R1-005 | Medium | VALID | 再現した。`:160000 100644 … T sub` が `submodule` に分類され、全文なし | 表示する側で判定（削除は旧側、それ以外は新側のモードが 160000 のときだけ submodule）。旧側が gitlink のときは旧 blob を読まない。status T の行に「(type change)」 | `tests/regression-m2-1-r1-005-submodule-type-change.test.ts`（4 件） | 2 / 4（submodule の削除・追加は修正前も PASS） |

レビュアーの補足（指摘ではない）: ZIP の他ツールとの互換性テスト `tests/zip-interop.test.ts` を追加した（`unzip -t` / `unzip -p` と Python の `zipfile`。
ツールが無い環境だけ skip。macOS では 2 件とも実行された）。

## 補足の記録

- **R1-001 の「差分が空なのに変更あり」**: モードだけの変更、100% の rename、空ファイルの追加・削除は、どれも差分ヘッダを持ち空にならないことをテストで確認した。
  実際に空になるのは pathspec がファイルを外したときだけで、macOS の `core.precomposeunicode=true`（`git init` の既定）で NFD のパスが NFC に変換される場合がそれに当たった
  （v0.4.0 は黙って空の差分を載せていた）。git に `core.precomposeunicode=false` を渡して解消し、NFD のパスのテストを加えた。ガード（exit 2）は残している
- **R1-003 の戻し失敗時の出力**（注入による例）: `aiqh review-packet: write failed (injected failure at commit:install:zip) and the previous file could not be restored; it is kept at: <tmp>/out/.packet.md.bak-54304-fe13cd33aa12`
- **R1-005 のシンボリックリンク（120000）**: 通常の blob として扱われ、kind は `text`、全文にはリンク先のパス文字列が載る（リンク先のファイルは読まない）。symlink → 通常ファイルは
  `text (type change)`。表に symlink であることは出ていない（今回は変えていない）
- **既存テストの期待値の変更**（描画の変更による）: パスの表示（`\u{A}` + `(escaped)` → `\n`）、allow の一覧と verify の行（値をインラインコードで表示）、
  `--exclude` の glob の生文字は組み立て後ではなく入力段階の finding になる（秘密の形の glob は従来どおり組み立て後の検査で止まる）
- **相対パスの基準**: `--request` / `--review` / `--config` / `-o` / `--zip-output` の相対パスは `--cwd` のディレクトリを基準に解決する（security-scan と同じ。人間の判断で現行どおり）

## 回帰テストの実行記録（数え方を併記）

- 修正直前の記録: `tmp/m2-1/r1-fix/before-001.log`〜`before-005.log`。v0.4.0 の worktree に新しいテストを当てた記録: `tmp/m2-1/r1-fix/before-v040-*.log`
- 修正後: 新しい回帰テスト 5 ファイル 24 件と ZIP 互換 2 件がすべて PASS

## 教訓

- **fail closed の検査は「文字列にした後」ではなく「バイト列のまま」の入力にかける**: `Buffer#toString("utf8")` は不正なバイトを黙って置き換える。git の `-z` の出力は区切ってから厳格に復号する
- **エスケープして描画するなら、検査は描画の前の値にかける**: 描画で `\u{…}` にした後の文字列を検査しても生文字は見つからない（R1-004 の修正中に自分で気づいた）
- **2 つのファイルを更新するコマンドは、両方の準備が終わるまで既存のファイルに触らない**
- **macOS の git は既定で pathspec の Unicode を正規化する**: `:(literal)` でも NFD のパスは外れる。`core.precomposeunicode=false` を明示する
