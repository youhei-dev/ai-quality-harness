# ADR-0021: 使い方エラーは全コマンドで exit 2 にする（1 は finding・検査の失敗専用）

- 状態: 採用（ADR-0014 決定 11 の「commander の使い方エラーも 2 にする」を、review-packet から全コマンドと `aiqh` 本体へ広げる）
- 日付: 2026-10-03（M2-2、v0.5.27。ROADMAP のバックログ 11）

## 文脈
- 終了コード 1 は「finding・失敗」（verify の `VERIFY FAILED`、security-scan と review-packet の検出）、2 は「ツール・設定・使い方のエラー」と決めている（ARCHITECTURE §10、ADR-0015）。
  review-packet は v0.4.0 で commander の使い方エラーも 2 にした（ADR-0014 決定 11）が、verify・init・security-scan と `aiqh` 本体は commander の既定（exit 1）のままだった
- 実測（v0.5.26。実際の CLI を空のディレクトリで、本処理が走らない 35 形に対して実行）: 18 形が 1 を返していた
  - 本体: 未知のコマンド（2 形）、本体の未知のオプション、コマンドなしの `aiqh`（stderr に help を出して 1）
  - verify・init・security-scan: 未知のオプション（5 形）、オプションの値の欠落（6 形）、余分な引数（3 形）
  - `aiqh help foo`（未知の help の対象）も 1 だった。review-packet の 8 形は 2、`--help`・`-h`・`help`・`--version`・`-V`・各コマンドの `--help` は 0
- CI が `verify` の終了コード 1 を「品質ゲートの失敗」として扱うと、オプションの打ち間違いも同じ 1 になり、区別できない。ARCHITECTURE §4 の verify の行は「2=設定・使用法エラー」と書いていたが、実際の使い方エラーは 1 だった

## 決定
1. **規則**: commander が使い方エラーで終了を求めるときの終了コードは 2。commander の非ゼロはすべて 2 にし、0 はそのまま 0。**1 は finding・検査の失敗専用**（`VERIFY FAILED`、security-scan・review-packet の検出）
2. **範囲**: verify・init・security-scan・review-packet と、`aiqh` 本体（ルート）。使い方エラーは、未知のコマンド、未知のオプション（本体・各コマンド）、オプションの値の欠落、必須オプションや引数の欠落、余分な引数、
   コマンドなしの `aiqh`、未知の help の対象（`aiqh help foo`）。review-packet の値の形の誤り（`--max-*-bytes`）は元から 2（`src/cli-program.ts` の `positiveInt`）
3. **引数なしの help も 2**: commander は引数なしの `aiqh` で help を標準エラーに出して終了を求める（エラー扱い）。CI で引数なしを呼ぶ誤りを、品質ゲートの失敗（1）と区別するため、特別扱いをしない。
   `--help`・`-h`・`help`・`help <コマンド>`・`--version`・`-V`・各コマンドの `--help` は 0
4. **出力は変えない**: 使い方エラーは `VERIFY` の最終行を出さず、commander の `error: …` の 1 行（引数なしと未知の help の対象は help）を標準エラーに出すだけ（標準出力は空）。文面・出力先・バイト数は同じで、
   禁止文字は表記に、秘密の形はマスクされる（ADR-0016/0017）。終了コードを決める override は何も書かないので、二重に出ない
5. **実装**: ルートの `Command` に `exitOverride` を 1 つ（`src/cli-program.ts`）。**コマンドを足す前に置く**: commander はサブコマンドを作るとき（`.command()`）にルートの設定を写す
   （`copyInheritedSettings`）ので、後に置くとサブコマンドを覆えない。サブコマンドだけに置くと本体のエラーを覆えない（commander だけの実験で、3 つの置き方を確かめた）。review-packet だけにあった override は外し、継承させる
6. **ARCHITECTURE の「終了コードと最終行の文言は 1 対 1」** は verify の実行結果についての規則で、使い方エラーは別の行（§10 の表）に書く: 終了コード 2、最終行は commander の `error:` 行、レポートは書かない

## 代替案
- ADR-0014 決定 11 の拡張: review-packet の ADR に全コマンドの規則が入り、探しにくい。利用者に見える契約（終了コード）を変える決定なので、独立した ADR にした
- 引数なしの help だけ 1 のまま（`err.code === "commander.help"` を 1 にする）: 特別扱いが 1 つ増え、CI で引数なしを呼ぶ誤りが品質ゲートの失敗と混ざる。試作で 1 を返せることは確かめた（採らない）
- verify・init・security-scan の 3 コマンドだけ（本体を含めない）: ルートの override を置けば本体も自動で含まれ、除外には特別扱いが要る
- 各サブコマンドに override を付ける: コマンドを足すたびに付け忘れうる。ルート 1 か所で全部覆えるので採らない
- `process.exit` ではなく例外を投げて最上位で終了コードを決める: commander の既定の `exitOverride()` は例外を投げるが、`src/cli.ts` の `parseAsync` の最上位の catch は「unexpected error」の 2 行を書いて exit 2 にする作りなので、使い方エラーの文面が変わってしまう（コードを読んだ範囲。試していない）

## 既知の限界
- **100 KB 級の引数で stderr が 65,536 バイトで切れる**: override は commander が文面を書いた直後に `process.exit` を呼ぶので、64 KiB を超えるメッセージ（約 100,000 文字の引数）は、pipe では 65,536 バイトで切れる
  （実測。読み手が速くても遅くても同じ）。**変更の前後で同じ**で、commander の既定の終了、既存の review-packet の exit 2 の経路、素の Node の `process.exit(2)` でも同じ（自然終了なら 100,000 バイト）。
  `process.exit` と pipe の性質による。終了コードは正しい。通常のメッセージは 100 バイト前後（実測の最大 86 バイト、help は 1,089 バイト）で影響しない。直さない
- **終了コード 2 は、`VERIFY ERROR` の最終行がある場合とない場合がある**: 使い方エラーは `VERIFY` の最終行を出さない（review-packet と同じ）。最終行だけで判定している CI は、`error:` の行も見ること
- **`== 1` だけを失敗とみなす CI**: 使い方の誤りを失敗として扱わなくなる（これまで 1 に混ざっていたのが 2 に分かれる）。「0 以外」で止める CI は動きが変わらない

## 影響
- v0.5.27（バックログ 11）: `src/cli-program.ts` +5／−4 行。既存テストの期待値 8 行（使い方エラーの終了コード 1→2。`regression-m2-2-r3-001-line-breaks.test.ts` の 7 行、`regression-m2-2-r2-001-output-boundary.test.ts` の 1 行）と、
  新しいテスト 36 件（`tests/regression-backlog11-usage-errors.test.ts`。v0.5.26 の `src/` に当てると 19 件が FAIL）。テスト 1,397 → 1,433 件
- 利用者に見える変更: 使い方エラーの終了コードが 1→2（メッセージ・出力先・バイト数は同じ）。CHANGELOG・README に書く
- 独立レビューは付けない（出力の境界と fail closed は変えない。人間の判断）
