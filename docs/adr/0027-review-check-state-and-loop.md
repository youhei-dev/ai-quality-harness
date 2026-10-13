# ADR-0027: review-check は findings の状態を読み取りだけで検査し、ループ未完了を表示する（終了コードは検査の誤りだけ）

- 状態: 採用（review-import v2。ADR-0026 の D11〈v1 は取り込みだけ。状態の検査・前の回の状態の引き継ぎ・ループ未完了の表示は v2〉の v2。ADR-0026 の決定 D1〜D18 は変えない。ROADMAP の M2-2 の完了条件「指摘 JSON に未対応〈open〉が残る間はループ未完了と表示される」を満たす。独立レビュー m2-2-review-check の R1〈指摘なし〉で、このレビューを終えた〈下の「追記（R1 の後）」〉）
- 日付: 2026-10-13（v0.7.0）。追記: 2026-10-14（R1 の後。docs だけで、版は 0.7.0 のまま。R1 の結果、review-check で見た最初のレビューの記録。決定は変えない）

## 文脈
- v0.6.0・v0.6.1 で `aiqh review-import`（取り込み）が入り、`docs/reviews/<label>/findings-r<N>.json` が状態の正本になった（D5）。状態（D4: `open`・`resolved`・`deferred`・`accepted`・`invalid`）と実装者の欄（`verdict`・`fixedIn`・`regressionTest`・`destination`・`note` など）は、実装者が人間の承認の下で手で書く。m2-2-review-import の R1（3 件）で、実装者の欄を手で書いた最初の実例ができた
- 手で書いた状態が、要る欄を欠いていても（`resolved` なのに直した commit が無い、など）気づく仕組みが無い。「ループが終わったか」（`open` が残っていないか）も、ファイルを開いて数えるしかない
- 非目標: レビューAI の判断を自動で合否に反映しない（D7: `open` の件数は終了コードに反映しない）

## 決定（人間の決定。v0.7.0 の指示で決定済み）
1. **新しいコマンド `aiqh review-check --label <label> [--cwd <dir>]`**。読むのは `docs/reviews/<label>/findings-r*.json` だけで、**何も書かない**（読み取りだけ）。`--label` の規則・`docs/reviews/` の扱い・`resolveInsideRoot` は review-import と同じ部品を使う
2. **検査**（どれか 1 つでも当たれば **exit 2**。すべて並べて出す）:
   - ファイル: `findings-r*.json` が 1 つも無い。名前が `findings-` で始まるのに `findings-r<N>.json` の形でない。回が 1 から欠けずに並んでいない。読めない（ENOENT 以外の失敗を含む。ADR-0022）・不正な JSON・スキーマ違反。中の `label`・`round` がファイル名・オプションと合わない。回によって `idPrefix` が違う
   - 取り込んだときの形: ID が `<idPrefix>-R<round>-001` から欠番・重複なし。`summary` と重要度ごとの数が合う
   - 状態ごとに要る欄: `resolved` は `fixedIn` が 40 桁の 16 進で、git がその commit を知っている（git が使えない・失敗のときは exit 2: fail closed）、`regressionTest` が空でない。`deferred` は `destination`、`accepted` と `invalid` は `note` が空でない
   - `verdict` は VALID・PARTIAL・INVALID・`null` だけ。`invalid` なら INVALID、`resolved`・`deferred`・`accepted` なら VALID か PARTIAL
   - 前の回の評価: 回 N の `previous` の ID は回 N−1 の指摘の ID、同じ ID は 1 回だけ
3. **表示**（端末。出口〈`createOutput`〉を通す。レビュアー・実装者の文章は出さない）: 回ごとの重要度の数と状態ごとの数、`open` の ID の一覧、`REVIEW LOOP: incomplete (open N)` か `REVIEW LOOP: complete`、前の回の評価（回 N−1 の指摘の横に、回 N の評価の先頭の語を「解消」「部分的に解消」「未解消」「その他」のどれかで）、警告、最後の行 `REVIEW CHECK: passed` か `REVIEW CHECK: failed (error)`
4. **警告は終了コードに反映しない**（状態は人が決める。非目標）: (a) 食い違い: 評価が「未解消」「部分的に解消」なのに `resolved`、または「解消」なのに `open`。(b) 評価が無い: 最後の回より前の回の指摘で、次の回の `previous` に評価が無いもの（`invalid` を除く）
5. **終了コードは 0 / 2**: 検査に通れば 0（`open` の数・警告にかかわらず。D7）、検査の誤り・使い方の誤りは 2
6. **review-import への追加**: 取り込みの成功（書いた）の後、同じ label の全体の `REVIEW LOOP: …` の行を 1 行出す（`REVIEW IMPORT: written` の直前。既存のテストは最後の行だけを見ているので、期待値は変わらない）。review-check の検査に通らないときは `REVIEW LOOP: unknown (aiqh review-check --label <label> shows why)`。終了コードは変えない。「既に取り込み済み」の経路では出さない

## 細部の決定（この ADR で決めた。理由つき）
- **`fixedIn` は commit そのものの SHA**: 指示の確かめ方 `git cat-file -e <sha>^{commit}` は、注釈付きタグの object の SHA も（commit へ剥いて）通す。プロジェクトの規則は「タグの SHA は commit の SHA を主表記にする」なので、`git cat-file -t <sha>` が `commit` であることを求める（狭い方。指示の確かめ方に通るものの一部だけを通す）。16 進は git の出す**小文字だけ**
- git への問い: `resolved` が 1 件でもあるときだけ git を使う（無ければ git の無いディレクトリでも通る）。最初に作業ツリーの中かを 1 回尋ね（`rev-parse --is-inside-work-tree`。git が答えない・作業ツリーの外なら `[git]` で exit 2）、SHA ごとに `cat-file -t`（exit 128 は「その object は無い」= `[state]`。それ以外の失敗は `[git]`）
- 「空でない」は、`null` でなく、空白以外の文字を 1 つ以上含むこと
- 名前の規則: `findings-r<N>.json` の `<N>` は 1〜999 の、先頭に 0 の無い 10 進（review-import が書く形）。`findings-` で始まらないファイル（`review-r1.md`・`response-r1.md` など）は見ない
- `label` のディレクトリが無い（ENOENT）・ディレクトリでない・一覧が取れないは `[files]`。シンボリックリンクでリポジトリの外へ出るものは `[path]`（`resolveInsideRoot`）。findings のファイルがシンボリックリンクなら、先を読まずに `[read]`（review-import の読み方と同じ。読み取りの部品を `src/review/findings-file.ts` にまとめて共有した。誤りの文言は変わらない）
- 誤りの種類（`[…]`）: `options`・`repository`・`path`・`files`・`read`・`label-round`・`prefix`・`id`・`summary`・`state`・`git`・`previous`
- 端末に出すもの: 条件、ファイル名（`findings-` で始まる形の違う名前は JSON の文字列の形で）、状態、数、**期待した形の ID だけ**（形の違う ID は `findings[i] of findings-rN.json` や `previous[k] of …` の位置で示す）、`label`・`idPrefix`（スキーマが形を限っている）。評価の文章・実装者の欄の文章は出さない（評価は 4 つの分類の語だけ）
- 評価の分類は、前後の空白を除いた文字列の先頭で決める（「未解消」「部分的に解消」を先に見る。どちらも「解消」を含むため）
- 回 1 の `previous` は空でなければならない（回 0 は無い）

## 代替案
- **`review-import --check` のフラグにする**: 取り込み（書く）と検査（読むだけ）が 1 つのコマンドに混ざり、オプションの組み合わせ（`--round`・`--id-prefix` が検査では要らない）が分かりにくい。書かないことを確かめる範囲もコマンド全体になる。採らない
- **状態を変える専用のコマンド**（`resolve` など）: 状態の正本を JSON に置いたまま、書き換えを機械にさせる。誤った書き換えの危険と、承認の流れの設計が要る。**v3 へ**
- **`response-rN.md` の生成**（JSON から判定表を作る）: 記録の書式を決め直す必要がある。**v3 へ**
- `open` が残れば exit 1 にする: D7・非目標に反する。採らない
- 警告を exit 2 にする: 評価と状態の食い違いは、人の判断の材料で、検査の誤りではない（状態は人が決める）。採らない

## 既知の限界
- **8 項目と `source` は、取り込んだ後に直さない約束**だが、直したかを完全には調べられない。調べるのは形（スキーマ・ID・`summary`）だけで、原文と照らし合わせはしない（原文を読まない）
- `fixedIn` が「その指摘を直した commit」であることは調べない（その commit が存在することだけ）。`regressionTest`・`destination`・`note` も、空でないことだけ
- `previous` の評価の分類は先頭の語だけで、文章の意味は読まない（「解消とは言えない」は「解消」に分類される）。警告は判断の材料で、合否ではない
- 過去のレビュー（review-import の前のもの。D10 で取り込まない）の label には findings のファイルが無いので、review-check は `[files]` で exit 2 になる。review-import で取り込んだ label だけが対象
- CI は 1 commit だけを checkout する（浅い clone）ので、CI の中で実データ（`docs/reviews/m2-2-review-import/`）に review-check をかけると、`fixedIn` の commit が無く exit 2 になる。テストは、記録を写した fixture の `fixedIn` だけを一時のリポジトリの commit に差し替えて固定した（実データの確かめは手元のリポジトリで行う）
- 同じ label のファイルを、review-check の最中に別の手が書き換えることは信頼境界の外（ADR-0014 と同じ扱い）
- D3・決定 18（脅威モデル）は変えない: わざと形を整えた偽の状態（それらしい `regressionTest` の文字列など）は見抜けない

## 影響
- 新規: `src/commands/review-check.ts`（読み取り・git・表示）、`src/review/check.ts`（検査。ファイルにも git にも触れない）、`src/review/findings-file.ts`（findings のファイルの読み取り。review-import と共有）、テスト（`tests/review-check.test.ts`・`tests/cli-review-check.test.ts`、fixture `tests/fixtures/review-check/`）
- 変更: `src/cli-program.ts`（コマンドの登録）、`src/git/info.ts`（`workTree`・`isCommitObject`）、`src/commands/review-import.ts`（読み取りの部品の共有、ループの行）
- 文書: ARCHITECTURE（コマンドの表・モジュール）、ROADMAP（M2-2 の完了条件の注記）、README（CLI）、依頼文のひな形の使い方、再修正ループの手順書（`docs/ops/review-loop.md`）
- 依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合・npm の保護設定・既存テストの期待値・書き込み箇所の表は変えない（review-check は fs の書き込みを持たない）

## 追記（R1 の後: 独立レビュー m2-2-review-check R1 の結果と、review-check で見た最初のレビュー。2026-10-14、docs だけ）

### 文脈
- v0.7.0 の独立レビュー R1（範囲 `v0.6.1..v0.7.0`、接頭辞 `M2-2-RC`）は **High 0・Medium 0・Low 0**。依頼文に先に書いた基準（High・Medium が 0）に達したので、`m2-2-review-check` のレビューは R1 で終えた（人間の判断。記録は `docs/reviews/m2-2-review-check/response-r1.md`）
- レビュアーは静的な読解だけで、コード・テストは実行していない。問い 1〜5（状態の欄と `fixedIn` の実在、読めない・欠けた・形の違うファイル、`open` と警告の終了コード、書き込みと文章の端末出力、`formatDuration` と B21-R1-001 のテスト）のどれにも、要る欄が無いのに通る・異常を「問題なし」とする・終了コードが変わる・書き込む・文章を出す経路を特定しなかった

### R1 の結果（`docs/reviews/m2-2-review-check/findings-r1.json`）
- v0.7.0 の `aiqh review-import` で取り込んだ: exit 0、`High 0 / Medium 0 / Low 0; open 0`、`REVIEW LOOP: complete`（決定 6 の行が実際の取り込みで出た最初の回）
- `findings` と `previous` は空（回 1）。`source`: `independent-review-m2-2-review-check-r1-for-claude.md`、4,839 バイト、SHA-256 `fdb95d4e31d5dad91b0e3c1169310ac5e886705cc84fb5f76403ebc838338e1a`（受領ファイルと一致）

### review-check で見た最初のレビュー
- review-check ができてから取り込んだ最初のレビューで、取り込みの直後に `aiqh review-check --label m2-2-review-check` にかけた最初の回: exit 0、`R1: High 0 / Medium 0 / Low 0; open 0, resolved 0, deferred 0, accepted 0, invalid 0`、`open: none`、`warnings: 0`、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`
- 指摘 0 件の回なので、働いたのはファイル・名前・回・label・接頭辞・`summary` の検査と表示だけ。状態ごとに要る欄の検査、`fixedIn` の git への問い、前の回の評価の突き合わせは、この回では使われていない。それらを実データで使ったのは、v0.7.0 を作るときに後から review-check にかけた m2-2-review-import（R1・R2。`resolved` 3 件。exit 0・`complete`・警告 0）
- この回も、レビュアーに出力の形の書き直しを頼む必要は無かった（review-import で取り込んだレビューは、m2-2-review-import の R1・R2 とあわせて 3 回とも、そのまま取り込めた）

### レビュアーの但し書きの位置づけ（決定は変えない）
- 「`REVIEW LOOP: complete` は全回の `open` が 0 という意味で、レビューの中身の正しさを自動で保証しない」: 非目標と既知の限界のとおり（D7。AI の答えを品質保証の根拠にしない）
- 「`formatDuration` は負数・非有限値に新しい保証を付けていない」「B21-R1-001 のテストは実行による再現を確かめていない」: この ADR の範囲の外（項目 38・37）。受け止めは `response-r1.md`

### 影響
- 文書だけ（この ADR、`docs/reviews/m2-2-review-check/` の R1 の 3 ファイル、CHANGELOG の v0.7.0 の見出しの SHA、ROADMAP）。`src/`・`tests/`・依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合は変えない
