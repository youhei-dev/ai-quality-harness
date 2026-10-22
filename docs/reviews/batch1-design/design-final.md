# aiqh batch1 設計（最終。ROADMAP の項目 43・45・39・49〈層 (c)〉・41・47）

作成: 2026-10-22（設計 R3 に、R3 の独立レビューの指摘 1 件の直しを入れた最終版。R1 は 2026-10-21、R2 は同じ日、R3 は 2026-10-22）。基準の commit: `a7e4d5300432f4610d49d0fb6b5b9c9c80534514`（main。v0.13.1 の記録の PR #13 の merge。R1〜R3 と同じ）。
この文書の `パス:行` は、すべてこの commit のもの。この最終版は v0.13.2 の docs の commit で `docs/reviews/batch1-design/design-final.md` として入れる。項目 43・41・47-c は v0.13.2、45・39 は v0.14.0、49 の層 (c) は v0.15.0 で実装する（§7）。

## R3 からの変更（最終版）

設計 R3 の独立レビュー（High 0 / Medium 1 / Low 0。R2 の 5 件は 4 件が解消、002 が部分的に解消）を受けて、人間が決めた対応（2026-10-22）を入れた。直した箇所には【R3-001 への対応】の印を付けた（指摘の ID は `B1-D-R3-001`）。

| 指摘 | 重要度 | 人間の決めた対応（要点） | 直した節 |
|---|---|---|---|
| B1-D-R3-001 | Medium | 項目 45 で認める Node のオプションは「既知のブールの旗」と「値を取る旗の明示的な一覧」だけ。未知のオプションの名前は検出しない。`node --unknown-option=value --test` は否定のテストに、`--import=tsx --test`・`--test-reporter=spec --test` は肯定のテストに残す。**R4 は出さず、v0.14.0 の実装レビューで確かめる**（M4 の設計レビューと同じ前例） | §2.4（規則 4〜6）、§2.6（N2c・N5h・N5o）、§2.8 |

そのほかの変更:
- 人間の決定（2026-10-22）: B1-Q1〜B1-Q25 を、設計 R3 の推奨と確定のとおりに**すべて確定**した（R3 で足した細部を含む。`docs/reviews/batch1-design/questions-final.md`）。設計のレビューは R3 で閉じる
- 未知のオプションの起動の結果を、手元の Node v24.13.1 で確かめた（2026-10-22。空のディレクトリで、最小の環境、10 秒の上限）: `node --unknown-option=value --test` と `node --unknown-flag --test` は、どちらも `node: bad option: …` を stderr に出して exit 9 で終わり、テストを探さない。R3-001 の根拠のとおり
- §5.5 の reporter の確かめ（SP4 の最初）の結果を書いた（v0.13.2 の実装の段）


## R2 からの変更

設計 R2 の独立レビュー（High 0 / Medium 4 / Low 1。R1 の 7 件は 4 件が解消、001・003・004 の 3 件が部分的に解消）を受けて、人間が決めた対応（2026-10-22）を入れた。直した箇所には【R2-00N への対応】の印を付けた（指摘の ID は `B1-D-R2-00N`）。R2 で「解消」とされた部分（R1-002・005・006・007 の対応）は変えていない。

| 指摘 | 重要度 | 人間の決めた対応（要点） | 直した節 |
|---|---|---|---|
| B1-D-R2-001 | Medium | 窓から消える位置にある候補で、run の両端が確定しないものは、その時点で finding に確定する（除外しない＝FAIL 側）。未確定の候補を後の窓へ持ち越す仕組みは作らない。不変条件に書き、持ち越しの長さの上限・ファイルの終わり・改行・重なりの中の重複のテストを L16 に足す | §4.5（I5・I6 を書き直した）、§4.7（`LineAssembler` の渡し方）、§4.8（L16 に (a)〜(g)）、§4.10、ADR-0037 の案 R3 の決定 3 |
| B1-D-R2-002 | Medium | Node のオプションを「名前と値」に正規化してから判定する（`--name=value` と `--name value` を同じに扱う）。監視系のオプション（`--watch`・`--watch-path`、それぞれの `=` の形、ほかに監視に当たるもの。手元の `node --help` で確かめる）が 1 つでもあれば拒む。`--test --watch-path=src`、`--watch-path=src --test`、値なし、`=` の形をテストする | §2.4（規則 4・5・7）、§2.6（N2c・N5i・N5l〜N5n）、§2.7、§2.8 |
| B1-D-R2-003 | Medium | 位置ごとの分類・除外の判断と、最後の finding の重複を除く鍵を別の仕様として書く。除いた数は出現した位置の数。finding は既存どおり「行番号＋符号位置」で 1 件（パス名は符号位置で 1 件）。同じ行に除く U+200D と除かない U+200D が混ざるとき、除いた数は除いた位置の数、finding は 1 件。この混在をテストする | §4.5（I9）、§4.7、§4.8（L24）、ADR-0037 の案 R3 の決定 2・3 |
| B1-D-R2-004 | Medium | 読み手の約束を「`startedAt` が違えば確実に別の run。同じでも同じ run の保証はない」に直す。同じミリ秒の `startedAt` を持つ 2 本で 47-c-2 の変種のテストを足す。確実に見分けるには runId か history の一意の鍵が要ることを書き、ROADMAP の新しい項目の文案にする | §6.4（約束 3・4・6）、§6.6（47-c-3）、§6.7、§6.8、付録 B の 6・7 |
| B1-D-R2-005 | Low | 実装の前に調べること（vitest 5 の reporter で各テストの有効な timeout が取れるか）を「SP4 の最初に確かめる」と書き、取れない場合の振る舞いを決めておく。出力は件数を絞り、最後の 1 行に「上限の 50% を超えた件数・省いた件数」を出す。stderr の末尾の上限（200 行・64 KiB）を超えても最後の行が残る形にする。判定は変えない | §5.5（近接の記録）、§5.7、§7、§8 |

そのほかの変更:
- 人間の決定（2026-10-22）: B1-Q5 は細部を含めて A'、B1-Q7 は B-1、B1-Q17 は A'、B1-Q25 は A に**確定**。ほかの Q は推奨どおりで仮決め（R3 の後に確定）。設計の中の該当の所を「確定」に直した（§2.4・§2.5・§3.5・§3.6・§4.4・§4.6・§5.5・§5.6）
- この段で手元だけで確かめたこと（通信なし）: Node v24.13.1 の `node --help` の監視系のオプションと、値を取るオプションの一覧（§2.4）。vitest 5.0.0 の配布物の型定義と実装（`node_modules` の中を読んだだけ。実行していない）から、reporter で各テストの上限と時間が取れる見込み（§5.5）
- R2 のレビューの根拠に書かれた行のうち、基準の commit で位置が少し違うもの: 窓を渡して先頭を捨てる所は `src/security/scan.ts:532-550`（R2 のレビューは `:502-515`）、`RawCharSink` は `:408-426`（重複を除く鍵 `seen` は `:410`・`:420-421`）、パス名の走査は `:429-439`（R2 のレビューは `:384-412`）。指摘の中身は、どれもこの位置のコードに当てはまる
- 決めることは別紙 `batch1-questions-r3.md`。R3 で確定した Q に【R3 で確定】、R3 で変わった Q に【R3 で変更】の印を付けた

## R1 からの変更（R2 で入れたもの）

設計 R1 の独立レビュー（High 0 / Medium 5 / Low 2）を受けて、人間が決めた対応（2026-10-21）を入れた。直した箇所には【R1-00N への対応】の印を付けた（指摘の ID は `B1-D-R1-00N`）。

| 指摘 | 重要度 | 人間の決めた対応（要点） | 直した節 |
|---|---|---|---|
| B1-D-R1-001 | Medium | node:test は、単純コマンドの実行位置が `node` で、`--test` が Node 自身のオプション（スクリプトの名前・`-e` の本文・`--` より前）のときだけ認める。環境変数の前置きは認める。`echo node --test`・`node -e "…--test…"`・`node script.js --test`・引用符の中の `--test` は認めない | §2.4（45-A の規則）、§2.6（N5a〜N5k・N6b・N6c）、§2.8、付録 A |
| B1-D-R1-002 | Medium | B1-Q7 を B に: pytest のパーサは、実行位置が `pytest`／`py.test`、python の `-m pytest`、列挙した wrapper の直後のときだけ選ぶ。誤検出と「判定は変わらないが件数が誤る」ケースを回帰テストに | §3.5（39-A の選び方）、§3.7（Y11〜Y14）、§3.9、付録 A |
| B1-D-R1-003 | Medium | C4 を条件つきで採る: Unicode のデータで完全な RGI の並びの両端を確定し、候補がその完全一致の区間の内側にあるときだけ除外する。文脈が足りないときは除外しない。ADR-0037 の不変条件にする | §4.5、§4.7、§4.8（L13〜L19）、ADR-0037 の案 R2 の決定 3 |
| B1-D-R1-004 | Medium | B1-Q20 の c を「既知の限界として受け入れる・未解決」とする。読み手の約束（`startedAt` を照らす）と、食い違ったときの読み直しの手順を文書にする。競合を意図して再現するテストを足す。ROADMAP の項目は閉じない | §6.4、§6.6、§6.7、§6.8、付録 B |
| B1-D-R1-005 | Medium | 上限は観測した倍率（最大 10.33 倍）を覆う根拠のある値にする。上限に近い遅さを記録に残す仕組みを検討する。負荷のゲート・並列数・各テストと suite の時間の予算を分けて定義する。並列の抑制・program の再利用は ROADMAP の新しい項目 | §5.3、§5.5、§5.7、§5.9、付録 B |
| B1-D-R1-006 | Low | 固定の集合と Unicode の属性の差分をテストで出し、意図して対象外にする符号位置を明示する。先頭 8 KiB とそれ以降の NUL、行の途中の CR、先頭の BOM の境界を回帰テストに。「全分類 FAIL」の表現に対象範囲の注記 | §4.4、§4.8（L20〜L23）、§4.10、ADR-0037 の案 R2 の決定 1・対象範囲 |
| B1-D-R1-007 | Low | v0.13.2 も、テストの差分に絞った実装の独立レビューを 1 回入れる（時間切れの上限、負荷の再現、テストの検出力） | §7 |

そのほかの変更:
- 項目 39 の実出力の確かめ（B1-Q11。人間が承認）を SP2 で行った（§3.4。適用先 B の写しで 1 回）
- R1 の自分の誤りを 2 つ直した: §5.3 の「`createProgram`・`getTypeChecker` を使う 14 ファイル」は、数え直すと 15 ファイル（`tests/*.ts` で `createProgram` を含むもの。`getTypeChecker` を直接書くファイルは 0）。§3.5 の「`pip install pytest` は選ばれるが `no-summary`」は、R2 の選び方では選ばれない（`no-parser`）
- B1-Q24 の 1 回目（今の版で適用先の SHA を上げる）は済んだ（2026-10-21。§7）
- 決めることは別紙 `batch1-questions-r2.md`。R2 で変わった Q に印を付け、B1-Q25（上限に近い遅さの記録）を足した

## 0. 前提

- 人間の決定（2026-10-21）
  - 次の版で、ROADMAP の 6 項目（43・45・39・49 の層 (c)・41・47）をまとめて扱う。版の分け方は §7
  - B1-Q1〜B1-Q24 は推奨どおりで仮決め（R2 の後に確定）。ただし R1 の指摘への対応（上の表）で変わるものは、そちらに従う
- 人間の決定（2026-10-22）
  - B1-Q5（細部を含めて A'）・B1-Q7（B-1）・B1-Q17（A'）・B1-Q25（A）を確定。ほかの Q は推奨どおりで仮決め（R3 の後に確定）
  - （R3 の後）B1-Q1〜B1-Q25 をすべて確定。R3 の指摘 1 件は設計を直し、R4 は出さず v0.14.0 の実装レビューで確かめる（上の「R3 からの変更」）
  - R2 の 5 件は、上の「R2 からの変更」の表のとおりに直す
- 表記: 適用先のリポジトリを「適用先 A」「適用先 B」と書く。中身・用途は書かない（件数・ファイルの種類・符号位置・出力の形だけ）
- 外部の文書（Unicode の UAX・UTS、pytest と Node の出力の形、過去の攻撃の報告など）について、手元の知識で書いたものには **[要確認]** を付けた（この段でも通信していない）
- 実測は、aiqh 本体と適用先 A・B の追跡しているファイルを、読み取りだけで数えた（2026-10-21、SP1）。項目 41 の再現は、基準の commit の SHA 固定の worktree で行った（SP1）。SP2 では、適用先 B の pytest を写しの中で 1 回走らせた（§3.4）。Unicode の属性との差分は、手元の Node v24.13.1（Unicode 17.0、ICU 78.2）の正規表現の属性で出した（§4.4）。SP3 では、手元の Node v24.13.1 の `node --help` と、vitest 5.0.0 の配布物（`node_modules/vitest/dist/`）の型定義と実装を読んだ（§2.4・§5.5。どちらも実行や通信をしていない）
- 決めること（Q）は、`docs/reviews/batch1-design/questions-final.md`（B1-Q1〜B1-Q25。すべて確定）。各節の「決めること」は、その番号を指す
- 層 (c) の ADR は、`docs/reviews/batch1-design/adr-0037-draft-final.md`（ADR-0037 の案の最終。ADR-0037 そのものは v0.15.0 で入れる）
- 各回への応答は、`docs/reviews/batch1-design/response-r1.md`〜`response-r3.md`（v0.13.2 で入れる）

---

## 1. 項目 43: tests の「see CLAUDE.md」の注記

（R1 から変えていない）

### 1.1 ROADMAP の記載（`docs/ROADMAP.md:880`）

`tests/` の 7 つのファイルの先頭のコメント「Dummy secrets are assembled at runtime with fake() (see CLAUDE.md).」が、v0.8.3 で git の追跡外にしたプロジェクトの `CLAUDE.md` を指している。テストの動きと判定には関係しない。Low。行き先は「`tests/` を変える次の版のついで（人間の承認の後）」。

### 1.2 関係するコードと文書

- 注記の 7 か所: `tests/regression-r1-config.test.ts:5`、`tests/regression-r1-git.test.ts:5`、`tests/regression-r1-mask.test.ts:5`、`tests/regression-r1-runner.test.ts:5`、`tests/regression-r1-verify.test.ts:5`、`tests/regression-r2-mask.test.ts:4`、`tests/regression-r3-mask.test.ts:5`
  - `tests/` で文字列 `CLAUDE.md`（大文字小文字を区別）を含む行は、この 7 つだけ。大文字小文字を区別しなければ、ほかに 4 行（fixture の JSON 2 行と、テストのソース 2 行〈`tests/review-check.test.ts:103`・`tests/review-import.test.ts:146`〉。どれもレビューの原文のファイル名 `…-for-claude.md`）が当たる。§1.6 の守りのテストは大文字小文字を区別するので、これらには当たらない
- 作法の説明（追跡されている）: `tests/helpers.ts:77-84`（`fake()` の doc コメントと本体）、`docs/adr/0029-key-value-false-positive-record.md:19`
- ADR-0030 の既知の限界が、この 7 つが残ることを記録している（`docs/adr/0030-public-as-is-mit-claude-md-untracked.md:37`）
- **ROADMAP に載っていない同じ形**（SP1 で見つけた。3 ファイル・5 行。どのファイルにも v0.8.3 の「追跡外」の注記がある）
  - 今の手順として指している 3 行: `docs/ARCHITECTURE.md:291`「（CLAUDE.md のリリース手順）」、`docs/ops/ci-and-branch-protection.md:26`「（プロジェクトの `CLAUDE.md` のリリース手順）」、`docs/ops/review-loop.md:25`（手順 10 の「プロジェクトの `CLAUDE.md`」）
  - 経緯として書いている 2 行: `docs/ops/ci-and-branch-protection.md:46`・`:55`（`CLAUDE.md` のリリースの手順に一文を足した、という記録）
  - 注記: `docs/ARCHITECTURE.md:292`、`docs/ops/ci-and-branch-protection.md:5`（足した一文は同じ文書の 2-1 に写してある）、`docs/ops/review-loop.md:5`
  - 追跡されているリリースの手順は `docs/ops/ci-and-branch-protection.md:151` の「8. リリースの手順」にある

### 1.3 根拠

公開リポジトリには `CLAUDE.md` が無い（`git ls-files` に無い）。読み手は注記の先を辿れない。

### 1.4 案

| 案 | 中身 | 評価 |
|---|---|---|
| 43-A（推奨） | 7 つの注記を「(see fake() in tests/helpers.ts)」に変える | 作法の説明は `tests/helpers.ts:77-81` にある。変更が最小 |
| 43-B | テストの作法の文書（例: `docs/ops/testing.md`）を新しく作り、そこを指す | 文書が 1 つ増える。いま書く中身は `fake()` の 1 つだけ |
| 43-C | 括弧の注記を消すだけ | 作法の手がかりが消える |
| 43-D | 変えない（記録のまま） | 公開の読み手に辿れない参照が残る |

### 1.5 決めること

B1-Q1（案）、B1-Q2（docs の同じ形も直すか）、B1-Q3（再発を止めるテストを足すか）

### 1.6 テストの計画

- 新しいテスト（名前は仮。`tests/regression-item43-no-untracked-doc-ref.test.ts`）: `git ls-files` で得た `src/`・`scripts/`・`tests/` の下の追跡しているファイルに、文字列 `CLAUDE.md`（大文字小文字を区別）が無いこと
  - テストのソースにその文字列をそのまま置かない（自分に当たるので、実行時に組み立てる）
  - 基準の commit: **FAIL**（7 か所）。直した後: PASS
- docs はこのテストの対象にしない。`docs/` の ADR・報告・レビューの記録と、`docs/ops/` の経緯の行は、過去の経緯として `CLAUDE.md` に触れてよい（docs の同じ形は、B1-Q2 で直すなら手で直す）

### 1.7 ADR

要らない。ADR-0030 の既知の限界（`:37`）に、直した版の追記だけ。

### 1.8 影響

コメントと docs だけ。設定・出力・パーサ・判定は変わらない。既存のテストの期待値は変わらない。適用先には関係しない。

---

## 2. 項目 45: `aiqh init` が node:test を検出しない

### 2.1 ROADMAP の記載（`docs/ROADMAP.md:882`）

init の unit の検出は vitest と jest だけで、`scripts.test` が `node --test …` のプロジェクトでは unit を NOT APPLICABLE と提案する（適用先の 1 つでは、unit を設定に手で足した）。node:test を検出の候補（`scripts.test` の `node --test`、テストのファイルの `node:test` の import など）に加えるかを検討する。加えるなら CONFIG_SPEC と init のテストもあわせて直す。Low。

### 2.2 関係するコードと文書

- 検出の本体は `src/adapters/node.ts:76-93` の `testRunner`。vitest 用と jest 用に 2 回使う（`:95-96`）
  1. `scripts.test`、次に `scripts.test:unit` の本文が道具の正規表現（`/\bvitest\b/`・`/\bjest\b/`）に当たれば、`npm run <script>` を提案する（`:78-80`）。この経路は、ローカルの導入を確かめない
  2. 当たらなければ、ローカルに道具があれば直接の実行（`npx --no-install …`）を提案する（`:82-85`）
  3. どちらも無ければ unavailable と、理由・`enableHint`（`:87-92`）
- `scriptUsing`（`src/adapters/node.ts:18-21`。script の本文への正規表現の検査で、語の位置は見ない）、`NODE_ADAPTERS` の順序（`:150`）。`resolveDetections` は種類ごとに最初の available を採る（`src/adapters/index.ts:13-23`）
- 設定案の注記: `src/config/generate.ts:73-80`。監査の表: `src/commands/init.ts:299-307`
- ADR-0011: アダプタは検出と推奨だけ（`docs/adr/0011-adapter-boundary.md:11`）、available にはローカルの証拠が要る（M1-R1-007、`:27-30`）、理由に script の本文を出さない（M1-R1-003、`:31-33`）
- 文書: `README.md:182-184`（ローカルに依存がある場合だけ提案する）、`docs/CONFIG_SPEC.md:218`（例の `unit: NOT APPLICABLE`）。unit の検出の規則を書いた節は CONFIG_SPEC に無い

### 2.3 再現（2026-10-21。基準の commit の `node src/cli.ts init --cwd <fixture>`。書き込みなし）

- fixture（作業用、git 管理外）: `package.json` の `scripts.test` が `node --test "test/**/*.test.ts"`、devDependencies は typescript だけ、`node:test` を import するテストのファイルが 1 つ
- 結果（exit 0）: 監査の表で `unit unavailable node-vitest`。設定案に次の 2 行
  - `// unit: NOT APPLICABLE — no vitest config or dependency (scripts.test does not run vitest) / no jest config or dependency (scripts.test does not run jest)`
  - `//   to enable: install vitest (npm i -D vitest) and add tests; aiqh does not install it`
- 参考（node:test を使う手元の別のプロジェクト。公開しない。形だけ）: `scripts.test` は `node --test "<dir>/**/*.test.ts"` の形。devDependencies にテストの道具は無い。テストのファイル 29 個すべてが `node:test` を import する。git 管理外のディレクトリに `*.test.*` の名前のファイルが約 1,500 ある（引数なしの `node --test` を勧めると、それらまで拾う見込み [要確認]）

### 2.4 案

| 案 | 中身 | 評価 |
|---|---|---|
| 45-A（確定。B1-Q5 の A'。R2 で条件を定め、R3 で監視系の判定を直した） | 新しいアダプタ `node-test`（kind unit）を、`NODE_ADAPTERS` の jest の後に足す。`scripts.test`、次に `scripts.test:unit` の本文を、付録 A の語の分け方で単純コマンドに分け、**どれか 1 つの単純コマンドが下の「45-A の規則」を満たす**とき available。提案は `npm run <script>`（timeout 600）、理由は `package.json scripts.<script> found (runs node --test)`。script が無ければ `null`（unavailable の行を足さない） | node:test は Node の組み込みなので、ローカルの導入の証拠は script そのもの（vitest の script の経路と同じ扱い）。node --test を使わないプロジェクトの出力は変わらない |
| 45-B | A に加え、script が無くても、テストのファイルの `node:test` の import を見て `node --test` を直接提案する | `RepoContext` に再帰の一覧と読み取りが要る（ADR-0011 の境界と ADR-0022「読めないは無いではない」の範囲が広がる）。引数なしの `node --test` は git 管理外のファイルまで拾う見込み [要確認] |
| 45-C | 道具が分からなくても、プレースホルダでない `scripts.test` があれば `npm run test` を提案する | mocha・ava なども拾うが、ほぼすべての Node のプロジェクトの init の出力が変わる。既存のテストの期待値も変わる |
| 45-D | 変えない（CONFIG_SPEC に「node:test は手で足す」と書く） | 適用先 A と同じ手作業が続く |

**45-A の規則**【R1-001 への対応】（R1 の「同じ単純コマンドの中に語 `node` と語 `--test` がある」を、語の位置を見る規則に変えた。最終版で規則 4〜6 を直した【R3-001 への対応】）

1. 単純コマンドに分ける: 付録 A の分け方（引用符の外の `;`・`&&`・`||`・`|`・`&`・改行で区切る。引用符を解いて語にし、引用符か `\` を含んでいた語に「引用あり」の印を付ける）
2. 環境変数の前置きを飛ばす: 先頭から、`名前=値` の形の語（名前は `[A-Za-z_][A-Za-z0-9_]*`。名前の部分に引用符を含まない）を飛ばす。残りの最初の語が**実行位置**
3. 実行位置の語が、印の無い `node` そのもの。パスつきの `node`（例: `/usr/bin/node`）、`nodejs`、`env node`、`npx node`、`cross-env … node` は認めない（検出しないだけ。今と同じ NOT APPLICABLE）
4. Node のオプションを左から読み、1 つずつ**名前と値に正規化する**【R2-002 への対応】（`--name=value` と `--name value` を同じオプションとして扱う）
   - `--名前=値` の 1 語: 名前は最初の `=` の前、値は後ろ（`=` の後ろが空なら、空の値がある）
   - `--名前` の 1 語で、名前が下の「値を別の語で取る」一覧にあるもの: 次の 1 語が値（次の語が無ければ値なし）。短い形 `-r`・`-C` も同じ
   - そのほかの `-` で始まる語: 名前だけ（値なし）
   - **認める名前は 2 つの固定の一覧だけ**【R3-001 への対応】: 下の「値を別の語で取る」一覧（18）と、「既知のブールの旗」の一覧（下）。正規化した名前がどちらにも無ければ、規則 6 のとおり、その単純コマンドは認めない（`=` の形でも 2 語の形でも同じ）
   - 既知のブールの旗の固定の一覧（手元の Node v24.13.1 の `node --help` に、値を取らない形で載っているもの。テストと一緒に使われる見込みのものに絞った 24）: `--experimental-strip-types`・`--no-strip-types`・`--experimental-transform-types`・`--experimental-test-coverage`・`--experimental-test-module-mocks`・`--test-only`・`--test-force-exit`・`--test-update-snapshots`・`--enable-source-maps`・`--no-warnings`・`--no-deprecation`・`--trace-warnings`・`--trace-deprecation`・`--trace-uncaught`・`--pending-deprecation`・`--throw-deprecation`・`--experimental-vm-modules`・`--experimental-require-module`・`--no-experimental-require-module`・`--no-experimental-detect-module`・`--expose-gc`・`--preserve-symlinks`・`--preserve-symlinks-main`・`--frozen-intrinsics`。ブールの旗に `=` で値を付けた形（例: `--no-warnings=1`）は、一覧に無い形として認めない
   - 次のどれかに当たったら、そこで読むのをやめる
     - `--`（オプションの終わり）
     - `-` で始まらない語（スクリプトの名前。以降はスクリプトの引数）
     - 正規化した名前が本文を取るオプション `-e`・`--eval`・`-p`・`--print` のもの（`--eval=…` の形も同じ）。以降は本文とその引数
   - 値を別の語で取る Node のオプションの固定の一覧（R2 と同じ 18）: `--import`・`--require`・`-r`・`--loader`・`--experimental-loader`・`--conditions`・`-C`・`--env-file`・`--input-type`・`--test-reporter`・`--test-reporter-destination`・`--test-name-pattern`・`--test-skip-pattern`・`--test-concurrency`・`--test-timeout`・`--test-shard`・`--watch-path`・`--title`。SP3 で、手元の Node v24.13.1 の `node --help` と照らし、18 個とも値を取るオプション（help の `--名前=...` の形）だった。help で値を取る形のオプション（任意の値のものを含む）は、ほかにもある（数え方によって 67〜71 行）。一覧に無い名前は、`--名前 値` の 2 語の形でも `--名前=値` の 1 語の形でも、規則 6 で「検出しない」向きに倒れる（R3 では `=` の 1 語の形を一覧に無くても読むとしていたが、未知のオプションでは Node が起動しないので誤検出になる。【R3-001 への対応】）
5. 正規化したオプションの中に、名前が `--test` で**値の無い**、印の無い語があれば認める。`--test=…`（値あり）は認めない。`--test-only`・`--test-reporter` などは別の名前で、`--test` ではない
6. 正規化した名前が、規則 4 の 2 つの一覧（値を取る旗・既知のブールの旗）のどちらにも無いオプションがあれば、その単純コマンドは認めない（`=` の形・2 語の形・値の無い形のどれでも。未知のオプションでは Node が `bad option` で起動しないか、意味が分からないので、誤って available にしない向き）【R3-001 への対応】。短い形も、一覧にある `-r`・`-C`（値を取る）と本文を取る `-e`・`-p` のほかは認めない
7. 次のどれかがあれば認めない（検出しないだけ）。監視のモードの check は verify の中で終わらず、check の `timeoutSec` まで待って FAIL になるので【R2-002 への対応】
   - 7a **監視系のオプション**: 実行位置より後ろの**すべての**語のうち `-` で始まるもの（規則 4 で読むのをやめた後ろの語、`--` の後ろの語、引用ありの語も含む。シェルは引用符を取り除くので、`"--watch"` も Node には `--watch` として届く）を規則 4 と同じ形で正規化し、名前に `watch` の文字の並びを含むもの。手元の Node v24.13.1 の `node --help` で監視に当たるのは `--watch`・`--watch-path=...`・`--watch-kill-signal=...`・`--watch-preserve-output` の 4 つ（help の 377〜381 行）。`NODE_OPTIONS` で使える旗の一覧（`process.allowedNodeEnvironmentFlags`）には、ほかに `--no-watch`・`--no-watch-preserve-output` がある。名前で判定するので、`=` の形・値を別の語にした形・値の無い形・将来の `--watch-…` も、同じく拒む
   - 7b **環境変数の前置き `NODE_OPTIONS=…`**: 中を読まずに拒む（Node のオプションを環境から足せるので、監視が入りうる）
   - 7c **別のファイルから Node のオプションや環境を読むオプション**: `--experimental-config-file`・`--experimental-default-config-file`・`--env-file`・`--env-file-if-exists`（名前で判定。`=` の形も同じ）。init はそれらのファイルを読まない（ADR-0011 の境界。環境のファイルは秘密を含みうる）ので、中で監視が入らないと言えない（設定のファイル・環境のファイルの中の `NODE_OPTIONS` で監視が入るかは [要確認]。どちらにしても拒む）
8. どの単純コマンドも認められなければ、このアダプタは `null`

### 2.5 決めること

B1-Q4（案）、B1-Q5（認める形の範囲。R3 で A' に確定し、監視系の判定〈規則 4・5・7〉を直した）、B1-Q6（script が無いときの扱い）

### 2.6 テストの計画

新しいテスト（仮: `tests/regression-item45-node-test-detection.test.ts`）。fixture は `tests/regression-m1r1-007-local-tool-evidence.test.ts:18-31` の `project()` の作法（一時ディレクトリに package.json とファイルを書く）。守りの行は、`NODE_ADAPTERS` を全部回して unit の検出に `node-test` の available が現れないことを確かめる（基準の commit でも動く書き方。まだ無いアダプタを直接呼ばない）。付録 A の分け方そのもののテスト（仮: `tests/command-words.test.ts`）は別に置く。

| # | 入力（`scripts.test` の本文など） | 期待 | 基準の commit で |
|---|---|---|---|
| N1 | `node --test` | unit の chosen が `node-test`、`npm run test` | **FAIL**（NOT APPLICABLE） |
| N2 | `node --experimental-strip-types --test "x/**/*.test.ts"` | 同じ | **FAIL** |
| N2b | `node --import tsx --test`（値を別の語で取るオプションの後） | 同じ | **FAIL** |
| N2c | 正規化【R2-002 への対応】（最終版で未知のオプションの行を N5o に移した【R3-001 への対応】）: `node --import=tsx --test`、`node --test-reporter spec --test`、`node --test-reporter=spec --test`（一覧にあるオプションの 2 つの形が同じに読まれる）、`node --no-warnings --enable-source-maps --test`（既知のブールの旗） | 同じ | **FAIL** |
| N3 | `scripts.test:unit` だけが `node --test` | `npm run test:unit` | **FAIL** |
| N4 | `scripts.test` = `vitest run`（vitest は devDependencies） | vitest が chosen、node-test は null | PASS（守り） |
| N5 | `node build.js`、`node --version`、`node --test-reporter=spec x.js`（語 `--test` が無い） | node-test は現れない | PASS（守り） |
| N5a | `echo node --test`【R1-001 への対応】 | 現れない（実行位置が `echo`） | PASS（守り） |
| N5b | `node -e "console.log('--test')"`、`node --eval="1" --test`【R1-001 への対応】 | 現れない（本文を取るオプションで読むのをやめる） | PASS（守り） |
| N5c | `node script.js --test`【R1-001 への対応】 | 現れない（スクリプトの引数） | PASS（守り） |
| N5d | `node "--test"`、`node '--test'`、`node \--test`【R1-001 への対応】 | 現れない（引用ありの語） | PASS（守り） |
| N5e | `node -- --test`【R1-001 への対応】 | 現れない（オプションの終わりの後） | PASS（守り） |
| N5f | `printf '%s\n' "node --test"`【R1-001 への対応】 | 現れない | PASS（守り） |
| N5g | `/usr/bin/node --test`、`npx node --test`、`env node --test`、`cross-env A=1 node --test`【R1-001 への対応】 | 現れない（知られた限界。§2.8） | PASS（守り） |
| N5h | `node --unknown-option value --test`【R1-001 への対応】 | 現れない（規則 6） | PASS（守り） |
| N5o | 未知のオプション【R3-001 への対応】: `node --unknown-option=value --test`、`node --unknown-flag --test`、`node --test --unknown-flag`、`node -x --test`（一覧に無い短い形）、`node --no-warnings=1 --test`（ブールの旗に値） | 現れない（規則 6。手元の Node v24.13.1 では前の 2 つが `bad option` で exit 9。実装の段で、使う Node でも照らす） | PASS（守り） |
| N5i | 監視系の名前と綴り【R1-001 への対応】（R3 で広げた【R2-002 への対応】）: `node --test --watch`、`node --watch --test`、`node --test --watch-path=src`、`node --watch-path=src --test`、`node --test --watch-path src`、`node --watch-path src --test`、`node --test --watch-path`（値なし。末尾）、`node --test --watch-path=`（`=` の後ろが空）、`node --test --watch=true` | 現れない（規則 7a） | PASS（守り） |
| N5j | 閉じていない引用符を含む本文（例: `node --test "x`）【R1-001 への対応】 | 現れない（付録 A: その単純コマンドを照らさない） | PASS（守り） |
| N5k | `$(echo node) --test`、`` `which node` --test ``【R1-001 への対応】 | 現れない（付録 A: 照らさない形） | PASS（守り） |
| N5l | 監視系のほかの名前と位置【R2-002 への対応】: `node --test --watch-preserve-output`、`node --test --watch-kill-signal=SIGINT`、`node --test --watch-kill-signal SIGINT`、`node --test --no-watch`（名前に `watch` を含む）、`node --test "--watch"`・`node --test '--watch-path=src'`（引用ありの語も Node には監視のオプション）、`node --test test/ --watch`（スクリプトの位置の語の後ろ）、`node --test -- --watch`（`--` の後ろ） | 現れない（規則 7a） | PASS（守り） |
| N5m | 間接に監視を入れうる形【R2-002 への対応】: `NODE_OPTIONS=--watch node --test`、`NODE_OPTIONS="--watch-path=src" node --test`、`NODE_OPTIONS=--max-old-space-size=4096 node --test`（中を読まない）、`node --experimental-config-file=node.config.json --test`、`node --experimental-default-config-file --test`、`node --env-file=.env --test`、`node --env-file .env --test`、`node --env-file-if-exists=.env --test` | 現れない（規則 7b・7c） | PASS（守り） |
| N5n | `--test` に値【R2-002 への対応】: `node --test=1`、`node --test=` | 現れない（規則 5） | PASS（守り） |
| N6 | `node --test && eslint .` のような連結 | 認める（1 つめの単純コマンド） | **FAIL** |
| N6b | `VAR=1 node --test`、`A=1 B=2 node --test`（環境変数の前置き）【R1-001 への対応】 | 認める | **FAIL** |
| N6c | `eslint . && echo node --test`【R1-001 への対応】 | 現れない（2 つめの単純コマンドの実行位置は `echo`） | PASS（守り） |
| N7 | `init --cwd <N1 の fixture>` | 設定案に unit（`npm run test`）があり、`unit: NOT APPLICABLE` が無い | **FAIL** |
| N8 | 理由に script の本文が出ない | `tests/regression-m1r1-003-init-no-script-bodies.test.ts:40-47` が `NODE_ADAPTERS` を全部回すので、足したアダプタも自動で対象になる | — |

既存の守り: `tests/adapters-node.test.ts:67-71`（Node でないプロジェクトで全アダプタが null）、`tests/init.test.ts:121-140`（aiqh 自身の init の unit が `npm run test` のまま）。

### 2.7 ADR

新しい ADR は要らない（推奨）。ADR-0011 に追記: 「Node の組み込みのテストランナー（node:test）は、ローカルの導入の証拠を script の本文に置く。`scripts.test`・`scripts.test:unit` のある単純コマンドが、実行位置の `node` と、Node 自身のオプションの `--test` を持つときだけ提案する。Node のオプションは名前と値に正規化して読み、監視系のオプション・`NODE_OPTIONS` の前置き・別のファイルからオプションを読むオプションがあれば提案しない（規則は batch1 の設計〈最終〉の §2.4）」。

### 2.8 影響

- 設定の互換: 無い（生成だけ。既存の設定の読み方は変わらない）
- 出力の形: node --test のプロジェクトの init の出力（監査の表・設定案・`--json`）だけが変わる
- パーサ: `npm run test` は script の本文 `node --test …` に解かれ、今の選び方では `no-parser`（表示だけ）。node:test の出力のパーサは、この版の範囲の外（必要なら別の項目）
- 既存のテストの期待値: 変わらない見込み（N4・N5 と既存の守りで確かめる）
- 適用先: 適用先 A は unit を手で足した設定を使っているので変わらない（init を使い直すときだけ提案に出る）
- 既知の限界（残す）: vitest がローカルにあれば、`scripts.test` が node --test でも vitest の直接の実行が先に選ばれる（アダプタの順序。今の vitest と jest の関係と同じ）
- 既知の限界（【R1-001 への対応】で増えたもの。どれも「検出しない」向きで、unit は今と同じ NOT APPLICABLE。手で足す）: パスつきの `node`、`npx`・`env`・`cross-env` を挟んだ形、一覧に無い値つきのオプションの後ろの `--test`、引用符で囲んだ `--test`、`--watch` つき、付録 A で照らさない形（コマンドの置き換え・閉じていない引用符など）
- 既知の限界（【R2-002 への対応】で増えたもの。どれも「検出しない」向き）: 名前に `watch` を含むオプション（監視を切る `--no-watch` も含む）、`NODE_OPTIONS` の前置き（中身を問わない）、`--experimental-config-file`・`--experimental-default-config-file`・`--env-file`・`--env-file-if-exists` つき、`--test=…`
- 既知の限界（【R3-001 への対応】で増えたもの。「検出しない」向き）: 2 つの固定の一覧に無い Node のオプション（Node が知っているものでも、一覧に無ければ検出しない）。一覧は Node の版で変わりうるので、実装の段で使う Node の `node --help` と照らし、足すときはテストと一緒に足す
- 残る限界（init からは見えない）: verify を走らせる環境の `NODE_OPTIONS`、npm の設定（`.npmrc` など）が足す Node のオプション。init は提案するだけで、人が設定を見てから使う（ADR-0011）。監視のモードで動いた check は、check の `timeoutSec`（提案は 600 秒）で止まって FAIL になる（fail closed の向き）

---

## 3. 項目 39: pytest の出力パーサ

### 3.1 ROADMAP の記載（`docs/ROADMAP.md:876`）

ADR-0028 の枠（`src/parse/`、コマンドの語で選ぶ、末尾 1 MiB・1 行 4,096、要約の語と数が合わなければ unexpected）に、pytest の要約の行（`N passed, M failed … in Xs`）と失敗の名前（`FAILED <nodeid>`）を足す。venv の `python -m pytest` の形の選び方、`-q` と既定の出力の違いを下調べで確かめる。v0.9.1 の注記: 適用先の CI で、pytest の件数がログに出ない。このパーサができれば、端末の `parsed:` の行と `latest.md` の Parsed Output に件数が出る。

### 3.2 関係するコードと文書

- ADR-0028 の原則: P1 判定と終了コードを変えない（`docs/adr/0028-output-parsers-display-only.md:13`）、P2 パーサの失敗は verify を止めず結果を変えない（`:14`）、P5 設定の欄を作らずコマンドで選ぶ（`:17`）、P6 最初の版は vitest・eslint・npm audit（`:18`）、P9 互換（`:21`）。決定 2 選び方（`:50-54`）、決定 3 `no-summary`・`unexpected-summary`（`:55-59`）、上限の表（`:60-70`）、既知の限界「pytest は読まない」（`:97`）
- 道具の一覧: `src/types.ts:110-111`（`PARSER_TOOLS`。`:110` のコメント「pytest is not one of them yet」）
- パーサの約束: `src/parse/tool.ts:5-29`。共通の部品と上限: `src/parse/text.ts:12-24`（1 MiB・4,096・1,000 ms・50 件・300 文字・15 桁）
- 手本: vitest のパーサ（`src/parse/vitest.ts:11-50`。語の一覧、`stateOf` で形と数を確かめる、無い語は 0）
- 集まり: `src/parse/read.ts:16-29`（`PARSERS`・`COUNT_KEYS`。history は `COUNT_KEYS` のキーだけを読む）
- 選び方: `src/parse/select.ts:83-98`（単純コマンドの**どの語でも**、最後の部分が道具の名前なら選ぶ）。語の分け方は `:46-70`（`segmentsOf`。引用符を捨てる。`;`・`|`・`&`・`(`・`)` で区切る）。npm の script は 1 段だけ解く（`:73-81`）
- 表示: `src/parse/describe.ts:27-47`（道具ごとの要約の文。知らない道具は「-」）
- 出す場所
  - 端末: `src/commands/verify.ts:116`（PASS・FAIL の行の直後。**PASS の check にも出る**）。出力の末尾は FAIL のときだけ（`:117-120`）
  - `latest.md` の Parsed Output: `src/report/markdown.ts:91-118`
  - `latest.json` と `history/<ts>.json`: `checks[].parsed`
  - history の読み手: `src/run-history/read.ts:157`（`tool` は `PARSER_TOOLS` の enum）、`:342-353`（`COUNT_KEYS` のキーだけ残す）
  - 集計: `src/run-history/aggregate.ts:257-286`（道具ごと・キーごとの系列）
  - ダッシュボード: `src/run-history/html.ts:164-174`・`:189-209`（道具の名前を文字列で扱う）
  - Job Summary: `.github/workflows/verify.yml:125-131`（`job-summary: true` のとき `latest.md` を足す）。`docs/ops/reusable-workflow.md:132` に「pytest の件数は今は出ない」
- init が作る pytest のコマンド: `src/adapters/python.ts:55`（`<venv>/bin/python -m pytest -q`、`tests/` があれば ` tests/`）、e2e は `:79`（`-q tests/e2e`）。check の環境は `PY_COLORS` を除き `NO_COLOR=1`（`src/runner/env.ts:8-12`）
- runner は各ストリームの末尾 10 MiB を保つ（`src/runner/execute.ts:27`）。パーサはその末尾 1 MiB を読む
- テスト: `tests/parse-select.test.ts:50`（`pytest -q` → `no-parser` を固定）、`tests/parse-output.test.ts:230`（P3 の線形の確かめの道具の一覧）、`tests/history-read.test.ts:331-345`（`COUNT_KEYS` がパーサの書くキーを全部持つ。`PARSER_TOOLS` を回す fixture の表）
- 古い案: `docs/CONFIG_SPEC.md:319`（`checks[].parser` = `"pytest"`。P5 と食い違う）

### 3.3 根拠

CI のログで pytest の件数が見えない理由は 2 つ: (1) PASS の check の出力の末尾は表示しない（`src/commands/verify.ts:117-120`）、(2) pytest のパーサが無いので `parsed:` の行も出ない（`tests/parse-select.test.ts:50` が `no-parser` を固定している）。

SP2 で、適用先 B の aiqh の設定の unit の check と同じコマンド（`<venv>/bin/python -m pytest -q tests/`）を、写しの中で 1 回だけ走らせ、要約の行の形と件数だけを確かめた（§3.4 の最初の行。B1-Q11）。既定の形（`-q` なし）と、失敗・エラー・警告のある出力は、実物では確かめていない [要確認]。fixture は合成し、名前は架空にする。

### 3.4 pytest の要約の形

**SP2 の実物（B1-Q11。2026-10-21）**
- やり方: 適用先 B を `git clone --no-hardlinks` で写し、venv を APFS の複製（`cp -c -R`）で写しの中へ。写しの中で、上のコマンドを 1 回。環境は最小（`env -i` で PATH・空の HOME と TMPDIR・LANG・`NO_COLOR=1` など）、`sandbox-exec` で外への通信と元の読み書きを止めた（文書用のアドレスへの接続と、元の一覧の読み取りが、中では EPERM になることを先に確かめた）。元は前後で同じ（HEAD、`git status --porcelain --ignored` の行数とハッシュ、venv を含む木のハッシュ、index の大きさと時刻）
- 結果: exit 0、9.6 秒。pytest 9.0.3（プラグインのパッケージは無し）。stdout 8 行・stderr 0 行
- 要約の行: stdout の**最後の行**。形は `N passed, N skipped in N.NNs`
  - 前後に `=` の並びは無い（`-q` の形）
  - 語の順は passed → skipped（下の表の「語の順」と合う）。語と数の組の区切りは `, `
  - 時間は小数 2 桁と `s`。`(h:mm:ss)` は無い（60 秒未満）
  - 色の制御文字・CR は無い（`NO_COLOR=1` の環境）
  - 件数: passed 443・skipped 1
- ほかの行: 進み具合の行が 7 つ（`.`・`s` の並びと `[ NN%]`／`[100%]`）だけ。`short test summary info` の見出し・`FAILED`・`ERROR` の行・`=` で始まる行・warnings summary は無い（失敗と警告が無いので）
- 合成の fixture との照らし: 下の表の `-q` の形（`1 failed, 3 passed in 0.12s`）、§3.7 の Y1（`-q`、全部 passed）と同じ形。実物にある skipped の組は、Y1b として足す（§3.7）。進み具合の行は要約の形に当たらない（読み方に影響しない）

**形の表**（`-q` の形だけ実物で確かめた。ほかは [要確認]）

| 形 | 例（合成） |
|---|---|
| `-q`（init が作るコマンドの形。**SP2 の実物と同じ形**） | `1 failed, 3 passed in 0.12s` |
| 既定（`-q` なし） | `===== 1 failed, 3 passed in 0.12s =====`（`=` の数は端末の幅で変わる）[要確認] |
| 60 秒以上 | `3 passed in 75.20s (0:01:15)` [要確認] |
| 古い版 | `3 passed in 0.12 seconds` [要確認] |
| 何も集めなかった | `no tests ran in 0.01s`（終了コード 5）[要確認] |
| 語 | failed・passed・skipped・deselected・xfailed・xpassed・warning(s)・error(s)。プラグインが語を足すことがある（例: rerun）[要確認] |
| 語の順 | failed・passed・skipped・deselected・xfailed・xpassed・warnings・errors（passed → skipped の順は実物で確かめた） |
| 失敗の名前 | 節 `short test summary info` の `FAILED <nodeid> - <msg>`・`ERROR <nodeid> - <msg>`（pytest 6 以降は `-r fE` が既定）[要確認] |

### 3.5 案

| 案 | 中身 | 評価 |
|---|---|---|
| 39-A（推奨） | ADR-0028 の枠で `src/parse/pytest.ts` を足す（下の「39-A の中身」） | 既存の 4 つと同じ作り。判定は変わらない |
| 39-B | A と同じだが、知らない語を無視して読む | プラグインの語に強いが、ADR-0028 の決定 3（別の道具の出力をその道具の件数として出さない）の考えから外れる |
| 39-C | `-q` の形だけを読む | init の形には足りるが、手で書いた設定（例: `docs/CONFIG_SPEC.md:124` の `.venv/bin/pytest -q` 以外の既定の形）を読めない |
| 39-D | パーサを作らず、PASS の check の出力の末尾も端末に出す | 全部の check の出力が増える。件数は構造にならない（history・ダッシュボードに出ない） |

39-A の中身:

- **選び方**【R1-002 への対応】（B1-Q7 を B にした。R1 の「どの語でもよい」をやめ、語の位置を見る）: 付録 A の語の分け方で、（npm の script を 1 段解いた後の）コマンドを単純コマンドに分ける。pytest を選ぶのは、次の 2 つを両方満たすとき
  1. ある単純コマンドが、環境変数の前置きを飛ばした後、次のどれか（照らすのは印の無い語だけ）
     - P1: 実行位置の語の最後の部分が `pytest` か `py.test`（`pytest`・`.venv/bin/pytest`・`py.test`）
     - P2: 実行位置の語の最後の部分が `python`・`python3`・`python3.<数字>`（venv の `<venv>/bin/python` を含む）で、その後ろに値を取らない旗（`-B`・`-E`・`-I`・`-O`・`-OO`・`-P`・`-s`・`-S`・`-u`・`-q`・`-b`・`-bb`・`-d`・`-v`）を 0 個以上置き、続けて語 `-m` と語 `pytest`（`-mpytest` の 1 語の形、`-c` や `-X`・`-W` のような値を取る旗があるときは選ばない）
     - P3: 実行位置が既知の wrapper（`uv run`・`poetry run`・`pipenv run`・`pdm run`・`hatch run`・`rye run`）で、wrapper の旗を飛ばした直後が P1 か P2。wrapper の旗として飛ばすのは、`-` で始まり `=` を含む語と、値を取らない旗の固定の一覧（`--frozen`・`--locked`・`--no-sync`・`--offline`・`--quiet`・`-q`）だけ。ほかの旗があれば選ばない
  2. その単純コマンドの前にも後ろにも、ほかの単純コマンドが無い。ただし前に置く `cd <1 語>` は認める（例: `cd backend && .venv/bin/python -m pytest -q`）（B1-Q7 の B-1。R3 で確定）
- 選ばない例（`no-parser`）: `echo "1 passed in 0.10s" pytest`、`printf '%s\n' "3 passed in 0.1s"`、`pip install pytest`（R1 では「選ぶが `no-summary`」と書いた。直した）、`"pytest" -q`（引用あり）、`python -c "import pytest"`、`pytest -q && echo done`、`python gen.py && pytest -q`、`pytest -q | tee out.txt`、`coverage run -m pytest`・`tox`・`nox`・`make test`（一覧に無い。知られた限界）
- 条件 2 の理由（「判定は変わらないが件数が誤る」ケース）: pytest の後ろの単純コマンドが要約に似た行を出すと、「最後の要約の行」がそれになる（例: `pytest -q && echo "9 passed in 0.10s"`）。前の単純コマンドが要約に似た行を出し、pytest が要約を出さずに止まったとき（例: 引数の誤りの exit 4 で、要約を出さないとき [要確認]）も同じ。どちらも判定は変わらない（P1）が、件数が誤って出る。条件 2 で、これらの形を選ばない（表示が出ないだけ）
- ほかの道具（vitest・eslint・npm audit・security-scan）の選び方は変えない（今の `segmentsOf` と「どの語でも」のまま。出力が変わらないように）。揃えるかどうかは付録 B の新しい項目の候補
- **要約**: stdout の、要約の形の**最後の**行（前後の `=` の並びを除いて読む）。形は `<n> <語>` を `, ` でつなぎ、続けて ` in <秒>s` と任意の ` (<h>:<mm>:<ss>)`。または `no tests ran in <秒>s`。B1-Q9 で古い ` seconds` を読むかを決める
- **語と数**: 8 つの語（failed・passed・skipped・deselected・xfailed・xpassed・warning/warnings・error/errors）。知らない語・同じ語の 2 回・16 桁以上は `unexpected-summary`
- **counts**: `passed`・`failed`・`skipped`・`deselected`・`xfailed`・`xpassed`・`errors`・`warnings`（無い語は 0。vitest と同じ作法）
- **items**: 見出し `short test summary info` から要約の行までの、`FAILED ` で始まる行を `failed-test`、`ERROR ` で始まる行を `error`。名前は最初の ` - ` の前まで（無ければ行の残り）。見出しが末尾 1 MiB の外に落ちたら items は無し（counts は読む）
- **表示**: `src/parse/describe.ts` に pytest の要約の文（例: `3 passed, 1 failed, 2 skipped`）
- 上限・マスク・時間・例外の扱いは既存の共通部品（`src/parse/text.ts`）をそのまま使う

### 3.6 決めること

B1-Q7（選び方。R3 で B の B-1 に確定）、B1-Q8（語と知らない語）、B1-Q9（古い形と `=` の形）、B1-Q10（history の互換）、B1-Q11（fixture の出どころ。SP2 で実物を確かめた）

B1-Q10 の中身: `PARSER_TOOLS` に `pytest` を足すと、**古い aiqh（v0.13.x まで）の `aiqh history`** が、新しい aiqh の書いた `parsed.tool: "pytest"` の入ったレポートを読んだとき、enum に合わずファイル全体が `bad-shape` になり、`HISTORY INCOMPLETE`・exit 2 になる（`src/run-history/read.ts:157`、`:327`、`src/commands/history.ts:221`。コードを読んだ推定。実行はしていない）。同じ history のディレクトリを、版の違う aiqh で読むときだけ起きる。
- (i)（推奨）記録だけ（CHANGELOG と ADR-0028 の追記に「古い aiqh の history は、新しい道具の入ったレポートを読めない」と書く）。history の読み手の厳しさ（ADR-0034）は変えない
- (ii) この版の読み手を寛容にする（知らない `parsed.tool` の check は `parsed` が無いものとして読む）。次に道具を足すとき、この版以降の読み手が壊れない。ADR-0034 の「形の合わないファイルは読まない」を変えるので ADR-0034 の追記が要る

### 3.7 テストの計画

- 既存の期待値の変更: `tests/parse-select.test.ts:50` の `pytest -q` を `no-parser` から `pytest` に（基準の commit で新しい期待値は **FAIL**）
- 新しいテスト（仮: `tests/parse-pytest.test.ts`）と、合成の fixture（`tests/fixtures/parse/pytest-*.stdout`、名前は架空）

| # | 入力 | 期待 | 基準の commit で |
|---|---|---|---|
| Y1 | `-q`、全部 passed | `parsed`、`passed` だけ非 0 | **FAIL**（道具が無い） |
| Y1b | `-q`、passed と skipped（SP2 の実物と同じ形 `N passed, N skipped in N.NNs`。前に進み具合の行） | `parsed`、`passed`・`skipped` が非 0 | **FAIL** |
| Y2 | `-q`、failed・passed・skipped・warnings と `short test summary info` の `FAILED` 2 行・`ERROR` 1 行 | counts と items（`failed-test` 2・`error` 1） | **FAIL** |
| Y3 | 既定の形（前後の `=`） | Y2 と同じ counts | **FAIL** |
| Y4 | ` in 75.20s (0:01:15)` | 読める | **FAIL** |
| Y5 | `no tests ran in 0.01s` | `parsed`、counts は全部 0 | **FAIL** |
| Y6 | 知らない語（例: `2 rerun`）・同じ語 2 回・16 桁 | `unexpected-summary` | **FAIL** |
| Y7 | 要約の無い出力（収集の前に止まった、など） | `no-summary` | **FAIL** |
| Y8 | テストが要約に似た行を先に出し、最後に本物の要約 | 最後の要約を読む | **FAIL** |
| Y9 | `FAILED` の名前に秘密の形（`tests/helpers.ts` の `fake()` で組み立てる） | 名前はマスクされる（P4） | **FAIL** |
| Y10 | CRLF、色の制御文字の残り | 読める（`stripControlSequences`） | **FAIL** |
| Y11 | 選ぶ形【R1-002 への対応】: `pytest -q`、`.venv/bin/pytest`、`py.test`、`python -m pytest`、`.venv/bin/python -m pytest -q tests/`（init の形）、`python3 -B -m pytest`、`PYTHONPATH=. pytest -q`、`uv run pytest`、`uv run --frozen python -m pytest`、`poetry run pytest`、`pipenv run pytest`、`cd backend && pytest -q`、`npm run <script>`（script が pytest） | `pytest` | **FAIL** |
| Y12 | 選ばない形（誤検出）【R1-002 への対応】: `echo "1 passed in 0.10s" pytest`、`printf '%s\n' "1 passed in 0.10s" pytest`、`pip install pytest`、`"pytest" -q`、`python -c "import pytest"`、`python -mpytest`、`python -X dev -m pytest`、`uv run --with x pytest`、`coverage run -m pytest`、`env pytest` | `no-parser` | PASS（守り。基準には pytest の道具が無い） |
| Y13 | 件数が誤る形（判定は変わらない）【R1-002 への対応】: `pytest -q && echo "9 passed in 0.10s"`、`python gen.py && pytest -q`、`pytest -q \| tee out.txt`、`pytest -q; echo done` | `no-parser` | PASS（守り） |
| Y14 | verify の通し【R1-002 への対応】: check の command が `echo "1 passed in 0.10s" pytest`（PRINTER の作法） | check は PASS、`latest.json` の `checks[].parsed` は `not-applicable`（`no-parser`）、端末に `parsed: pytest` の行が無い | PASS（守り） |

- P3（線形の時間）: `tests/parse-output.test.ts:230` の道具の一覧に pytest を足し、最悪の形（要約に似た行の繰り返し、`=` だけの長い行、`FAILED ` の繰り返し、`, ` の多い行）を足す。作業量の時計（`:240-245`）で確かめ、壁時計に頼らない
- 付録 A の分け方の単体のテスト（仮: `tests/command-words.test.ts`）: 区切り・引用・`\`・環境変数の前置き・照らさない形・`2>&1` の `&` を区切りにしないこと
- history の守り: `tests/history-read.test.ts:331-345` の fixture の表に pytest を足す（足さないと FAIL する守り）
- verify の通しのテスト: `tests/parse-verify.test.ts:33-63` の PRINTER を `pytest` の名前で置き、要約を出させる。`latest.json` の `parsed.tool` が `pytest`、判定と終了コードが変わらない（P1）、**PASS の check でも**端末に `parsed: pytest — …` が出る、`latest.md` の Parsed Output に行がある
- P2: パーサが例外・時間切れでも判定は変わらない（既存の P2 のテスト `tests/parse-output.test.ts:196-211` に pytest の行を足す）

### 3.8 ADR

ADR-0028 に追記（推奨）: 決定 12「pytest のパーサ」。P6（最初の版は 3 つ）を人間の決定で解いたこと、選び方が語の位置を見ること（ほかの 4 つの道具と違う。理由は R1-002）、B1-Q10 の扱い。新しい ADR は要らない。

### 3.9 影響

- 設定の互換: 無い（P5。設定の欄を足さない）。`docs/CONFIG_SPEC.md:319` の古い案は「P5 により採らない」に直す
- 出力の形: `parsed.tool` に新しい値 `pytest`、counts の新しいキー。`schemaVersion` は 1 のまま（P9）。端末に `parsed: pytest — …`。`latest.md` の Parsed Output に行。Job Summary にも出る（`job-summary: true` のとき）
- 選ばれない形【R1-002 への対応】: wrapper の一覧に無い形・後ろや前にほかの単純コマンドがある形は `no-parser`（件数が出ないだけ。判定は変わらない）。CONFIG_SPEC に、パーサが選ばれるコマンドの形を書く
- 古い読み手: B1-Q10
- history: `COUNT_KEYS` に pytest のキーが入り、系列が増える。ダッシュボードは道具の名前を文字列で扱うので、変更は要らない見込み
- 既存のテストの期待値: `tests/parse-select.test.ts:50` だけ（ほかは守りの追加）
- 適用先: pytest を使う適用先 B の CI のログに件数が出る（再利用ワークフローの SHA を上げた後）。適用先 B の unit の check のコマンドは P2 の形（venv の python の `-m pytest -q tests/`）で、選ばれる。設定の変更は要らない

---

## 4. 項目 49: 生の文字の層 (c)

### 4.1 ROADMAP の記載（`docs/ROADMAP.md:886`）

v0.13.0 の security の check は、双方向の制御文字と U+2028・U+2029 の 11 の符号位置（層 (a)・(b)）だけを見る。見ないもの: 方向の印 U+200E・U+200F・U+061C、ゼロ幅の文字（U+200B・U+200C・U+200D・U+2060）、途中の U+FEFF、異体字セレクタ、タグ文字、11 の外の C0・C1 の制御文字、同形異字（CVE-2021-42694）。直すなら、適用先のデータを見て、どの文字を・どの分類で・既定で FAIL にするかを決める（判定を厳しくする変更なので、ADR と人間の承認の後）。

この設計では、ROADMAP の一覧に U+00AD（ソフトハイフン）と、そのほかの既定で無視される文字（ハングルの埋め字など）を足して扱う。同形異字は範囲の外（字の形の比べは、生の文字の走査と別の仕組みが要る）。

### 4.2 関係するコードと文書

- 分類と範囲: `src/security/raw-chars.ts:35`（`RAW_CHAR_CATEGORIES`）、`:42-46`（`SCANNED_RAW_RANGES`）、`:49-52`（`scannedRawCategory`）。禁止文字の集合 `FORBIDDEN_RANGES`（`:20-28`、75 の符号位置。review-packet と出口の表記が使う）
- 中身の走査: `src/security/scan.ts:392-394`（速い判定の範囲 `RAW_LOWEST`・`RAW_HIGHEST`）、`:403-426`（`RawCharSink`。UTF-16 の単位で見る。同じ行・同じ符号位置は 1 件）
- パス名: `src/security/scan.ts:428-439`（`checkPathName`。行の無い finding）
- 読み方: `src/security/scan.ts:574`（`StringDecoder`。不正な UTF-8 で止まらない）、`:587-590`（最初に読んだ塊の先頭 8 KiB〈`BINARY_PROBE_BYTES`、`:78`〉に NUL があればバイナリとして飛ばす）
- 行と窓: `src/security/scan.ts:518-551`（`LineAssembler.push`。LF の前の CR は除いて行にする〈`:525`〉。改行の無いまま `maxLineBytes` を超えた行は窓で渡し、`lineOverlapBytes` 以上を次の窓に持ち越す〈`:532-550`〉）、`:553-559`（`end`。ファイルの最後の CR を除く〈`:555`〉）。窓の限界: `src/config/window-limits.ts:13`（`MIN_LINE_OVERLAP_BYTES` 256）。既定は `maxLineBytes` 256 KiB・`lineOverlapBytes` 4 KiB・`maxCarryBytes` 64 KiB（`src/security/scan.ts:92-94`）
- allow: `src/security/scan.ts:718-727`（`findAllowRule`。生の文字の finding は、分類を明示した規則だけが抑える）、`src/config/schema.ts:50`・`:53`（allow の `category` の enum）
- 判定: `src/commands/security-scan.ts:57`・`:60`（finding が 1 つでもあれば exit 1。警告の段の finding は無い）。何を見たかの行: `:88`
- パーサ: `src/parse/security-scan.ts:16-23`（件数の行の種類。生の文字は合計 `raw characters` の 1 つ）
- ADR-0036: 決定 1（`docs/adr/0036-security-scan-raw-bidi-controls-and-line-separators.md:22-25`）、決定 3 既定で FAIL・入り切りのスイッチを作らない（`:27`）、決定 8 allow（`:36`）、代替案（`:62`・`:63`・`:66`）、既知の限界（`:80`）
- ADR-0012（`docs/adr/0012-security-allow.md:15-17`・`:27-30`）: 抑えるのは理由つきの明示の規則だけ。`security.scanKeyValue` のような入り切りは採らない
- ADR-0004 の決定 4（`docs/adr/0004-fail-closed-verdict.md:14`・`:21-22`）: 新しい check を試すときは check の単位で `required: false` にできる（分類の単位の警告は無い）
- 既存のテストが「層 (c) を見ない」ことを固定している: `tests/regression-item48-raw-chars-scan.test.ts:122`（T1。U+200E〜U+FEFF などを見ない）、`:231`（方向の印・ゼロ幅のファイルが finding にならない守り）

### 4.3 実測（2026-10-21。追跡しているファイル。件数だけ）

（R1 から変えていない）

| 分類 | aiqh 本体 | 適用先 A | 適用先 B |
|---|---|---|---|
| 追跡しているファイル | 503 | 96（うち 4 は不正な UTF-8 で、走査しなかった） | 75 |
| 方向の印 U+200E・U+200F・U+061C | 0 | 0 | 0 |
| ゼロ幅 U+200B | 0 | 0 | 1 |
| ゼロ幅 U+200C・U+2060 | 0 | 0 | 0 |
| ゼロ幅 U+200D | 0 | 0 | 9 |
| 先頭でない U+FEFF | 0 | 0 | 0 |
| U+00AD | 0 | 0 | 0 |
| 異体字セレクタ（U+FE0F だけが出た） | 0 | 3（3 ファイル: .md 1・.svg 1・.ts 1） | 5（3 ファイル: .md 1・.html 4） |
| タグ文字 U+E0000–U+E007F | 0 | 0 | 0 |
| C0・C1・DEL（TAB・LF・CR を除く） | 0 | 0 | 0 |
| 行の途中の CR（LF の前でない） | 0 | 0 | 0 |
| そのほかの既定で無視される文字（R1 の `invisible-other`） | 0 | 0 | 0 |
| パス名の中 | 0 | 0 | 0 |

- 適用先 B のゼロ幅の 10 文字は、3 ファイル（どれも .py）・4 行。意図した使い方（前提）
- 正しい絵文字の並び（Node の正規表現 `\p{RGI_Emoji}`、`v` フラグ。Node v24.13.1、Unicode 17.0）の**中**にあるもの: 適用先 B の U+200D のうち 6。**外**: 4（U+200D 3・U+200B 1。2 ファイル）
- 異体字セレクタ 8 文字（A 3・B 5）は、すべて絵文字の並びの中
- 2026-10-19 の実測（ADR-0036 の `:17`、ROADMAP の `:886`）は「適用先の 1 つは 0 件、もう 1 つは 10 件」。どの文字を数えたかは書かれていないが、異体字セレクタを含めていれば 3 件と 15 件になるので、含めていなかったと推定する。今回の実測で、適用先の両方に U+FE0F があると分かった
- R2 で集合に足した符号位置（§4.4 の差分の表の「入れる」）は、SP1 では数えていない。どれも見えない文字か未割り当ての符号位置で、3 つのリポジトリで 0 件と見込む [要確認: 実装の段で数え直す]

### 4.4 文字の分類（案）

| 分類（`category`） | 符号位置 | 数 | 正当な使い方 | 悪用の形 |
|---|---|---|---|---|
| `bidi-mark` | U+200E・U+200F・U+061C | 3 | 右から左に書く言語の文書 | 中立の文字の並びを変える（埋め込み・上書きより弱い） |
| `zero-width` | U+200B・U+200C・U+200D・U+2060 | 4 | U+200D: 絵文字の並び。U+200C: 一部の文字。U+200B: 改行の位置 | 識別子や文字列に見えない差を作る（U+200C・U+200D を識別子の文字として許す言語がある [要確認]） |
| `bom` | 先頭でない U+FEFF | 1 | ほぼ無い（ファイルの先頭の BOM は除く） | 見えない差 |
| `soft-hyphen` | U+00AD | 1 | 組版 | 表示されない差 |
| `variation-selector` | U+180B–U+180D・U+180F（R2 で足した）、U+FE00–U+FE0F、U+E0100–U+E01EF | 260 | U+FE0F: 絵文字の表示。U+E0100 以上: 漢字の異体字（IVS）。U+180B 以上: モンゴル文字の異体字 | 見えない文字の並びにデータを隠す（2025 年に、公開のパッケージの中で見えない文字に隠したコードの報告がある [要確認]） |
| `tag` | U+E0000–U+E007F | 128 | 一部の旗の絵文字の並び | 見えない文字で文を隠す（AI への指示の注入に使われる、という報告がある [要確認]） |
| `control` | U+0000–U+0008、U+000B、U+000C、行の途中の U+000D、U+000E–U+001F、U+007F–U+009F（TAB と LF は見ない。LF の前の CR とファイルの最後の CR は今も除いて読む） | 63 | 古いソースの改ページ（U+000C）、色の fixture（U+001B） | 端末の表示を書き換えて行を隠す |
| `invisible-other` | U+034F、U+115F・U+1160、U+17B4・U+17B5、U+180E、U+2061–U+2065、U+206A–U+206F、U+3164、U+FFA0、U+FFF0–U+FFFB、U+13430–U+1343F、U+1BCA0–U+1BCA3、U+1D173–U+1D17A、U+E0080–U+E00FF、U+E01F0–U+E0FFF（R2 で U+2065・U+FFF0–U+FFF8・U+13430–U+1343F・U+1BCA0–U+1BCA3・U+E0080–U+E00FF・U+E01F0–U+E0FFF を足した） | 3,787 | ほぼ無い | 見えない識別子（ハングルの埋め字 U+3164 が JavaScript の識別子の文字になる、という報告がある [要確認]） |

- 8 分類の合計は 4,247 の符号位置。層 (a)・(b) の 11 と合わせて 4,258（重なり無し。Node v24.13.1 で数えた）
- 層 (a)・(b) の 11 の符号位置（`bidi-control`・`line-separator`）は変えない
- U+0000 は、ファイルの先頭 8 KiB にあればファイルごとバイナリとして飛ばす（今のまま）。8 KiB より後なら `control` の finding になる（§4.8 の L21）

**Unicode の属性との差分**【R1-006 への対応】（Node v24.13.1・Unicode 17.0 の正規表現の属性で数えた。`\p{Default_Ignorable_Code_Point}`〈以下 DICP〉は 4,174 の符号位置、うち割り当て済み 405。この表と L20 の「集合」は、8 分類と層 (a)・(b) の 11 を合わせた 4,258 の符号位置。8 分類だけで比べると、層 (a)・(b) の 11 の分だけ差が変わる）

| 差分 | 符号位置 | 扱い（B1-Q17 の A'。R3 で確定） |
|---|---|---|
| DICP にあって R1 の集合に無かった（割り当て済み） | U+180B–U+180D・U+180F（Variation_Selector の属性も持つ）、U+1BCA0–U+1BCA3（速記の書式の制御） | 入れる。前者は `variation-selector`（これで `variation-selector` は Variation_Selector の属性と同じ 260 になる）、後者は `invisible-other` |
| DICP にあって R1 の集合に無かった（未割り当て） | U+2065、U+FFF0–U+FFF8、U+E0080–U+E00FF、U+E01F0–U+E0FFF | 入れる（`invisible-other`）。将来、既定で無視される文字が割り当てられる場所で、今はソースに現れないはず |
| 集合にあって DICP に無い | C0・DEL・C1（`control` の 63。行の途中の CR を含む）、U+2028・U+2029（層 (b)）、U+FFF9–U+FFFB（行間の注釈の制御）、U+13430–U+1343F（聖刻文字の書式の制御） | 意図して入れる。どれも見えないか、表示や行の区切りを変える。Unicode は U+FFF9–U+FFFB を DICP から外している [要確認]。U+13430–U+1343F の表示の有無は [要確認] |
| 書式の文字（Cf）で集合に無い | U+0600–U+0605、U+06DD、U+070F、U+0890–U+0891、U+08E2、U+110BD、U+110CD（13。後ろの数字にかかる、前に置く印） | 意図して対象外（表示のある印 [要確認]） |
| 制御文字（Cc）で集合に無い | U+0009（TAB）、U+000A（LF） | 意図して対象外 |

- R2 の集合では「DICP − 集合」が空になる。テスト（§4.8 の L20）で、この 5 行の差分そのものを固定する。Node の Unicode の版が変わって差分が変われば FAIL になり、人が見直す（fail closed の向き）

### 4.5 案と fail closed

**fail closed の原則（ADR-0012・ADR-0036 の考え方）**: 判定を緩める道は、理由つき・期限つきで出力に残る明示の規則（`security.allow`）だけにする。分類ごと・check ごとに見るのをやめるスイッチは、気づかれずに守りが外れる（fail open）ので作らない。finding はすべて FAIL で、警告の段は無い（`src/commands/security-scan.ts:57`・`:60`）。

| 案 | 中身 | 適用先への影響（実測から） | fail closed との関係 |
|---|---|---|---|
| C1 | 層 (c) の全分類を既定で FAIL、分類つきの allow（層 (a)・(b) と同じ作り） | A: 3 件（異体字セレクタ、3 ファイル）、B: 15 件（6 ファイル）で FAIL。規則が 6 つほど要る | 原則どおり。ただし U+FE0F は絵文字にふつうに付くので、利用者が広い規則（`path: "**"`、`category: "variation-selector"`）で抑えやすい。抑えが慣れになり、悪用の形（見えない文字の並び）まで抑える |
| C2 | 層 (c) は数えて表示するだけで、FAIL にしない（警告の段） | A・B とも FAIL しない | 今ある判定は緩めないが、「finding は FAIL」の作りに、判定を変えない新しい段を足す。タグ文字・途中の BOM のように正当な使い方がほぼ無いものも門にならない。CI では PASS の check の出力は表示されない（`src/commands/verify.ts:117-120`）ので、警告は読まれにくい |
| C3 | 層 (c) を設定で入り切り（既定は切り、または既定は入り） | 既定が切りなら影響なし（守りも無し）。既定が入りなら C1 と同じ | 既定が入りで切れるなら、ADR-0012（`security.scanKeyValue` を採らなかった理由、`:27-30`）と ADR-0036 の代替案（`:66`）が退けた fail open のスイッチと同じ。既定が切りなら、入れない利用者には守りが無い |
| **C4（推奨。条件つき）** | 層 (c) の全分類を既定で FAIL、分類つきの allow。ただし、**候補（U+200D・U+FE0F・タグ文字）が、正しい絵文字の並び（Unicode の RGI_Emoji）に完全に一致する区間の内側にあるときだけ** finding にしない（機械的な除外。設定では変えられない。下の不変条件）。除いた数は出力に出す | A: 0 件。B: 4 件（ゼロ幅、2 ファイル）で FAIL → 規則 2 つ（`category: "zero-width"`、理由つき）で通る | 判定を厳しくする向き（今見ていないものを見る）。除外は設定ではなく Unicode のデータで決まり、狭い（完全に一致した並びの内側だけ。並びの外に続く見えない文字、文脈が足りないときは除かない）。除いた数が出力に出るので見える。入り切りのスイッチは作らない |
| C5 | 段階: まず C2（数えるだけ）を出し、データを見てから C4 にする | 1 段目は影響なし | 振る舞いの変更が 2 回になる。データは 3 つのリポジトリで取れているので、段を分ける利点が小さい |

**C4 の不変条件**【R1-003 への対応】（R1 の「候補の前後の決まった幅〈例: 16 符号位置〉だけを調べる」をやめた。ADR-0037 の案 R3 の決定 3 に同じ文を置く。R3 で I5・I6 を書き直し、I9 を足した）

- **I1 候補**: 除外を考えるのは U+200D・U+FE0F・U+E0020–U+E007F（Emoji_Component の属性を持つタグ文字。除くのは RGI の並びに完全に一致したときだけなので、RGI のタグの並びに出ないものも、結果として除かれない）だけ。U+FE0E・U+E0001・U+E0100–U+E01EF・U+180B–U+180F は RGI の並びに現れない（Node v24.13.1 で、どれも下の集合 E の外。実測）ので、絵文字の後ろにあっても除外しない（常に finding）
- **I2 run**: 候補を含む、集合 E（`\p{Emoji}` と `\p{Emoji_Component}` の和）の文字が続く最も長い範囲を run と呼ぶ。E の外の文字は、どの RGI の並びにも現れない（RGI の並びの文字はすべて E に入る。UTS #51 の定義による [要確認]。Node v24.13.1 で、ZWJ の並び・異体字セレクタつき・タグの旗・キーキャップ・肌の色・国旗・虹の旗の見本 7 つで確かめた）
- **I3 区切り**: run の先頭から、`\p{RGI_Emoji}`（`v` フラグ）の最も長い一致を左から順に取る。run の外の文字はどの一致にも入らないので、この区切りは行の頭から区切ったものと同じになる（run の途中から区切り始めない）
- **I4 除外**: 候補が、ある一致の区間の内側（区間の最初から最後のどこか）にあるときだけ除外する。一致の外（一致と一致の間、run の端）の候補は finding
- **I5 窓の中での決め方**【R2-001 への対応】（R2 の「その窓では決めない」だけでは、窓から消える位置の候補が決まらないまま捨てられうる〈`LineAssembler` は窓を渡した後、保つ部分より前を捨てる。`src/security/scan.ts:532-550`〉。消える位置の候補は、その窓で決め切る形にした）。言葉の決め事: 「窓の先頭」は、行の始まりから届いていない窓（前の窓から続く窓）の先頭。「保証された末尾」は、行の終わりまで届いていない窓の最後の `lineOverlapBytes`（既定 4 KiB、最小 256。`src/config/window-limits.ts:13`。単位は今の `LineAssembler` と同じ UTF-16 の単位）で、次の窓の先頭に必ず入る（次の窓は `window.slice(from)` で、`from` は `window.length − lineOverlap` 以下。`src/security/scan.ts:536-544`）。各窓で、候補を含む run ごとに、次の順で当てる
  - (a) run の両端が見える（左の端の前に E の外の文字があるか行の始まり、右の端の後ろに E の外の文字があるか行の終わり）→ I4 で決める
  - (b) (a) でなく、次のどれかに当たる → run の、まだ決めていない候補を、**この窓で finding に確定する**（除外しない。FAIL の向き）
    - その窓が行の最後の渡し（改行で終わった行、またはファイルの終わり）である（このとき見えないのは左の端だけで、その部分はもう無い）
    - run が窓の先頭に接している（左の部分は前の窓で捨てられ、どの窓でも見えない）。窓の先頭がサロゲートの組の後ろ半分だけのとき（組の前半が前の窓の捨てた部分にあるとき）も、その文字は分からないので、run が窓の先頭に接しているとみなす（分からない文字を E の外とみなすと、左の端を誤って確定しうる）
    - run の左の端の前の文字（左の隣）の始まりが、保証された末尾より前にある（この窓の後で、左の隣が捨てられうる）
  - (c) 残り（左の端が見え、右の端が行の終わりまで届いていない窓の末尾に接し、左の隣の始まりから run の終わりまでが保証された末尾の中にある）→ この窓では決めない。左の隣を含めて次の窓の先頭に必ず入るので、次の窓で (a)〜(c) をもう一度当てる
  - **持ち越しの長さの上限**: 決めずに次の窓へ回せるのは、保証された末尾の中の run だけで、その長さは `lineOverlapBytes` で抑えられる。左の隣を含めて `lineOverlapBytes` 以上の長さの run が窓の境目にまたがれば、必ず (b) で finding になる
  - 窓の末尾の CR と、先頭の BOM の扱いは R2 のまま（§4.7）
- **I6 1 回だけ決める・未決の候補を持ち越さない**【R2-001 への対応】: 候補の位置（行番号と、行の中の位置）ごとに、ちょうど 1 回だけ決める
  - 前の窓で決めた位置は、次の窓の重なりの中で決め直さない（結果を変えない。除いた数を 2 回数えない）。保つ部分が `lineOverlapBytes` より長い窓（秘密の形の候補の持ち越し。`src/security/scan.ts:537-538`）で、前の窓で (b) により finding にした位置が次の窓で両端の見える run に入っても、同じ
  - 未決の候補（位置・分類）を、窓の外の状態として持たない。(c) の候補は、`LineAssembler` が次の窓の先頭に必ず入れる文字の中にあるので、次の窓でもう一度見る。持つ状態は「この行で決めた位置」だけで、今の窓の先頭より前の位置は捨てる
  - 行の最後の渡し（改行で終わる行の渡し `src/security/scan.ts:522-530`、ファイルの終わりの渡し `:553-559`）では (c) に当たらないので、決めていない候補は残らない。読み込みの誤り（`ScanError`）で止まったときは exit 2（fail closed の向き）
- **I7 設定では変えられない**: 除外は Unicode のデータ（Node の正規表現の属性）だけで決まる。除いた数を出力に出す
- **I8 Node の版**: `\p{RGI_Emoji}`・`\p{Emoji}`・`\p{Emoji_Component}` は同じ Node（ICU）の Unicode の版から来る。古い Node が新しい絵文字を知らなければ、その並びの候補は finding（FAIL の向き）。新しい Node で除外が増えるのは、完全に一致した並びの内側だけ
- **I9 位置の判断と finding の鍵を分ける**【R2-003 への対応】（R2 の I6・I7 は位置ごとの判断と除いた数を書いたが、finding の数え方との関係を書いていなかった）
  - **位置の判断**: 走査する文字の出現（中身は行番号と行の中の位置、パス名はパス名の中の位置）ごとに、「除く」か「finding の側」のどちらか 1 つを決める。「除く」になるのは、I1 の候補が I4 に当たるときだけ。ほかの出現はすべて「finding の側」
  - **除いた数**: 「除く」と決めた出現の**位置の数**（ファイルとパス名をまたいで足す）。同じ行に同じ符号位置が何度出ても、位置ごとに数える
  - **finding の鍵**（ADR-0036 の決定 2 のまま）: 中身は「ファイル・行番号・符号位置」で 1 件（`src/security/scan.ts:410`・`:420-421` の `seen`）、パス名は「パス・符号位置」で 1 件（`:430-435`）。その鍵の出現に「finding の側」が 1 つでもあれば finding が 1 件。「除く」の出現は finding を作らず、同じ鍵のほかの出現の finding を消しもしない
  - 例: 同じ行に、RGI の並びの中の U+200D が 2 つと、並びの外の U+200D が 1 つ → 除いた数 2、finding 1（その行・U+200D）。並びの外の U+200D が同じ行に 2 つ → 除いた数 0、finding 1
  - `security.allow` は finding だけに効く。除いた出現は finding ではないので allow の対象にならず、allow で finding を抑えても除いた数は変わらない
- 時間: run の長さに比例する見込み（各位置で試す一致の長さは RGI の並びの最も長いもので抑えられる。見本の最長は 10 符号位置・UTF-16 で 15 単位。全体の最長は [要確認]）。§4.8 の L11 で、作業量か広い余裕の壁時計で確かめる

### 4.6 決めること

B1-Q12（方針 C1〜C5。R2 で C4 に条件）、B1-Q13（除外に使う Unicode のデータ）、B1-Q14（方向の印を FAIL に入れるか）、B1-Q15（`control` の範囲）、B1-Q16（漢字の異体字〈IVS〉の扱い）、B1-Q17（`invisible-other` の範囲。R3 で A' に確定）。B1-Q12 の C4' は、R3 で I5・I6 を書き直し、I9 を足した

### 4.7 作り（C4 のとき）

- `RAW_CHAR_CATEGORIES` に 8 分類を足す。allow の `category` の enum も同じ（`schema/aiqh.config.schema.json` は `npm run schema:gen` で作り直す）
- `SCANNED_RAW_RANGES` に範囲を足す（§4.4 の表）。`FORBIDDEN_RANGES`（75 の符号位置）は変えない（ADR-0020 の決定 3 の数のまま。review-packet と出口の表記は変わらない）
- `RawCharSink.onLine` を、UTF-16 の単位から符号位置の走査に変える（タグ文字と U+E0100 以上はサロゲートの組）。速い判定は、表引き（例: BMP は 64 KiB の表、それより上は範囲）に変える
- `LineAssembler` の行の渡し方【R1-003 への対応】（R3 で 3 つめを足した【R2-001 への対応】）: 今の `onLine(line, lineNo, continued)` に、次の 3 つを足す。`RawCharSink` は I5・I6 にこれを使う。秘密の形の scanner（`FileScanSink`）は使わない（振る舞いは変わらない）
  - 窓の先頭の、行の中の位置（行の最初の渡しは 0。次の窓は、前の窓の位置に `from` を足したもの。`src/security/scan.ts:544`）
  - その渡しが行の終わりまで届いたか（改行で終わる行の渡し `:526`、ファイルの終わりの渡し `:556` は届いた。窓の渡し `:535` は届いていない）
  - 届いていない窓の、保証された末尾の始まり（`window.length − lineOverlap`。`:536` の `floor` と同じ値で、`onLine` を呼ぶ前に決まる）。実際の `from`（`:538-542`）はこれより小さいことがある（秘密の形の候補の持ち越し）が、`RawCharSink` は保証された値だけを使う（I5 の (c) は、この値より後ろだけに当てる）
- `RawCharSink` の状態【R2-001・R2-003 への対応】: (1) この行で決めた候補の位置の集まり（I6。今の窓の先頭より前の位置は捨てる。大きさは窓の長さで抑えられる）、(2) finding の鍵の集まり `seen`（今のまま。`:410`）、(3) 除いた数（I9。位置で数える）。未決の候補の一覧は持たない（I6）
- 絵文字の並びの除外: I1〜I9 のとおり。除いた数は位置で数える（重なりで 2 回数えない）。finding は今の鍵で 1 件（I9）
- 行の途中の CR【R1-006 への対応】: 行の終わりまで届いていない窓の末尾の CR は、その窓では決めない（I5 と同じ。次の窓で LF が続けば、`LineAssembler` が除いた行になる）
- 先頭の BOM: ファイルの 1 行目の、行の中の位置 0 の U+FEFF だけを除く（窓の位置ではなく行の中の位置で決める）
- パス名も同じ分類と除外で見る（ADR-0036 の決定 5 と同じ）。パス名は窓に分けないので、run の端はパス名の端か E の外の文字（`/` を含む）。finding の鍵は今のまま「パス・符号位置」（`checkPathName`、`src/security/scan.ts:429-439`）、除いた数は位置で数える（I9）
- allow: `findAllowRule` の「生の文字の finding は分類を明示した規則だけ」はそのまま
- 出力: 件数の行の `raw characters: N` は合計のまま（パーサの形は変わらない、`src/parse/security-scan.ts:16-23`）。`raw characters checked:` の行に分類が増える。除いた数の行を足す（例: `raw characters exempted (emoji sequences): N`）。パーサがその行を飛ばすこと（知らない行で `unexpected-summary` にならないこと）を実装の段で確かめる
- review-packet: 変えない（ADR-0036 の決定 9）。パケットは `FORBIDDEN_RANGES` だけを止めるので、ゼロ幅などはパケットに入る（既知の限界として記録。付録 B の項目の候補）

### 4.8 テストの計画

新しいテスト（仮: `tests/regression-item49-raw-chars-layer-c.test.ts`）。生の文字は `String.fromCodePoint` で実行時に作る（`tests/regression-item48-raw-chars-scan.test.ts:29-32` の作法）。基準の commit では、まだ無い定数の import は `undefined` になり、使う `it` だけが FAIL する（vitest の挙動。記録の作法どおり）。

| # | 内容 | 基準の commit で |
|---|---|---|
| L1 | 分類と符号位置の定義（8 分類・4,247。層 (a)・(b) と重ならない。TAB・LF・LF の前の CR・ファイルの最後の CR・先頭の BOM は見ない） | **FAIL** |
| L2 | 各分類の文字を中身に置くと、分類と符号位置つきの finding、exit 1 | **FAIL** |
| L3 | サロゲートの組の文字（タグ文字 U+E0041、異体字セレクタ U+E0100）を見つける | **FAIL** |
| L4 | 絵文字の並び（U+200D でつないだ家族の並び、U+26A0 + U+FE0F、旗のタグの並び）は finding にならず、除いた数が出る / 数字の間の U+200D は finding | 前半は PASS（今は見ないので）、後半と除いた数は **FAIL** |
| L5 | 先頭の BOM は finding にならない / 1 行目の 2 文字目・2 行目の U+FEFF は finding | 前半 PASS、後半 **FAIL** |
| L6 | 長い行の窓の境目に、絵文字の並びと、並びの外の U+200D を置く（重複も漏れも無い） | **FAIL** |
| L7 | パス名に U+200B → finding。絵文字の並びのパス名 → finding なし | 前半 **FAIL** |
| L8 | allow: `category: "zero-width"` の規則が抑える。分類の無い規則は抑えない。別の分類の規則も抑えない | **FAIL**（今は分類が設定のエラー） |
| L9 | `raw characters checked:` の行に新しい分類、除いた数の行 | **FAIL** |
| L10 | パーサ: 件数の行の形は変わらず、`rawChars` が層 (c) を含む | **FAIL**（層 (c) を数えないので） |
| L11 | 線形の時間: 1 MiB の、絵文字の並びと U+200D の交互、異体字セレクタの長い連続、タグ文字の連続、E の文字だけの長い run（作業量か、広い余裕の壁時計） | **FAIL**（除外が無いので） |
| L12 | review-packet の動きが変わらない（ゼロ幅を含む差分で、パケットの生の文字の確かめの結果が今と同じ） | PASS（守り） |
| L13 | タグ列【R1-003 への対応】: RGI のタグの並び（U+1F3F4、U+E0067 U+E0062 U+E0065 U+E006E U+E0067、U+E007F）→ finding なし・除いた数 6 / RGI に無いタグの並び（U+1F3F4 の後ろに U+E0075 U+E0073 U+E0063 U+E0061 と U+E007F）→ `tag` の finding / 基の無いタグ文字の並び（U+E0041 U+E0042 …）→ finding / RGI の旗の後ろに続く余分なタグ文字 → finding（旗の中のタグは除いたまま） | 「finding なし」は PASS、ほかは **FAIL** |
| L14 | 隣接した余分な制御文字【R1-003 への対応】: 家族の並びの末尾に余分な U+200D → finding / 並びの中で U+200D が 2 つ続く → finding / U+26A0 U+FE0F U+FE0F → 2 つめの U+FE0F が finding / 絵文字の直後の U+200B → `zero-width` の finding（U+200B は候補でない）/ U+2764 U+FE0E → U+FE0E は finding（I1） | **FAIL** |
| L15 | 連続した絵文字【R1-003 への対応】: RGI の並びを 3 つ続けたもの → finding なし、除いた数は 3 つの並びの候補の合計 / 並び・余分な U+200D・並び → finding 1（余分な U+200D だけ） | 前半の「finding なし」は PASS、ほかは **FAIL** |
| L16 | 長い行【R1-003 への対応】: 既定の窓（256 KiB・重なり 4 KiB）で、窓の境目にまたがる RGI の並び → finding なし・除いた数は 1 回分（I6）/ 境目にまたがる、並びの外の U+200D → finding 1 / 小さい窓（`maxLineBytes` 1,024・`lineOverlapBytes` 256・`maxCarryBytes` 256）で、重なりより長い run（E の文字が 300 単位続く中の、並びの内側の U+200D）が境目にまたがる → 除外しない（finding。I5 の (b)）/ 窓の大きさを変えても、I5 の (b) に当たらない入力では finding と除いた数が変わらない / R3 で下の (a)〜(g) を足した【R2-001 への対応】 | **FAIL**（「finding なし」は PASS） |
| L17 | パス名【R1-003 への対応】: 絵文字の並び（U+200D・U+FE0F を含む）のパス名 → finding なし / パス名の中の、並びの外の U+200D → finding / `/` をまたぐ形（絵文字、`/`、U+200D、絵文字）→ U+200D は並びの外（`/` は E の外）→ finding | 「finding なし」は PASS、ほかは **FAIL** |
| L18 | E の外の候補【R1-003 への対応】: U+FE0E・U+E0001・U+E0100・U+180B は、絵文字の後ろでも除かない | **FAIL** |
| L19 | I2 の前提【R1-003 への対応】: 見本の RGI の並び（L4・L13・L15 で使うもの）が `\p{RGI_Emoji}` に一致し、その文字がすべて E に入る | PASS（Node の性質の確かめ。実装の前提が崩れたら FAIL） |
| L20 | Unicode の属性との差分【R1-006 への対応】: §4.4 の差分の表の 5 行そのもの（DICP − 集合 = 空、集合 − DICP = 84 の符号位置、Cf − 集合 = 13、Cc − 集合 = TAB・LF、`variation-selector` = Variation_Selector）。テストの名前に、使った Node の Unicode の版を出す | **FAIL**（定数が無い） |
| L21 | NUL の境界【R1-006 への対応】: ファイルの先頭から 8,191 バイト目（0 から数えて）に NUL → ファイルごとバイナリ（`skippedBinary` 1、そのファイルの finding は 0。中に層 (c) の文字があっても見えない）/ 8,192 バイト目に NUL → `control` の finding（U+0000、行の番号つき） | 前半 PASS、後半 **FAIL** |
| L22 | CR の境界【R1-006 への対応】: 行の途中の CR → `control` の finding（U+000D）/ 行末の CR LF → なし / ファイルの最後の CR（LF なし）→ なし / CR CR LF → 1 つめの CR は finding / 長い行の窓の末尾に CR、次の窓の先頭に LF → なし（§4.7。窓の末尾の CR は次の窓で決める） | 「なし」は PASS、ほかは **FAIL** |
| L23 | BOM の境界【R1-006 への対応】: ファイルの先頭の U+FEFF → なし / 先頭に U+FEFF が 2 つ → 2 つめが finding / 長い 1 行目の、2 つめの窓の先頭の U+FEFF → finding（行の中の位置 0 ではない） | 「なし」は PASS、ほかは **FAIL** |
| L24 | 位置の判断と finding の鍵【R2-003 への対応】（I9）: 同じ行に、U+200D を 2 つ含む RGI の並び（U+1F468 U+200D U+1F469 U+200D U+1F467）と、英字の間の U+200D（`a` U+200D `b`。英字は E の外）→ 除いた数 2・finding 1（その行・U+200D）/ 順を入れ替えても同じ / 並びの外の U+200D が同じ行に 2 つ → 除いた数 0・finding 1 / 同じ並びが同じ行に 2 つだけ → 除いた数 4・finding 0 / パス名に同じ混在（並びと `a` U+200D `b`）→ 除いた数 2・finding 1（パス・U+200D）/ 長い行（小さい窓）で、並びが重なりの中にあって 2 つの窓に入り、同じ行の別の所に並びの外の U+200D → 除いた数 2（4 ではない）・finding 1 / `category: "zero-width"` の規則で finding を抑えても、除いた数は 2 のまま | 「finding 0」は PASS、ほかは **FAIL** |

**L16 に足したケース**【R2-001 への対応】（どれも小さい窓〈`maxLineBytes` 1,024・`lineOverlapBytes` 256・`maxCarryBytes` 256〉で。並びは U+200D を 1 つ含む RGI の並び〈例: U+1F469 U+200D U+1F4BB。符号位置 3・UTF-16 で 5 単位〉を使い、左右には E の外の文字〈英字〉を置く。基準の commit では、どれも層 (c) を見ないので「除いた数」と finding の期待が **FAIL**、「finding なし」は PASS）

- (a) **持ち越しの長さの上限**: 左の隣（英字）、E の文字の続き（数字。単独の数字は RGI の並びではない）、並び、の順に置き、左の隣から run の終わりまでを 300 単位にして、run が窓の末尾に接するようにする（窓の末尾の後ろは次の塊で英字）。`lineOverlapBytes` = 300（`maxCarryBytes` 300）→ I5 の (c) で次の窓に回り、除く（除いた数 1・finding 0）/ `lineOverlapBytes` = 299 → 左の隣が保証された末尾の 1 つ前になり、I5 の (b) でその窓で finding（除いた数 0・finding 1）。境目がちょうど `lineOverlapBytes` にあることを固定する
- (b) **ファイルの終わり**: 改行の無い最後の行で、I5 の (c) で回った候補のある窓の後に、ファイルが終わる → ファイルの終わりの渡しで決まる（並びの内側なら除いた数 1、外なら finding 1。決まらない候補は残らない）。ファイルの最後が CR のときも同じ
- (c) **改行**: I5 の (c) で回った候補の run の直後に、次の塊の先頭で改行が来る → 改行で終わる行の渡しで決まる（行の終わりが右の端になる。除いた数 1・finding 0）
- (d) **重なりの中の重複**: 秘密の形の候補の持ち越しで、保つ部分が重なりより長い窓（実際の `from` が保証された末尾の始まりより小さい）を作り、その差の部分で I5 の (b) により finding にした候補が、次の窓で両端の見える RGI の並びの内側に入る → finding のまま（決め直さない。除いた数 0・finding 1）/ 前の窓で除いた候補が、次の窓の重なりに入る → 除いた数は 1 回分
- (e) **サロゲートの組の分かれ目**: 保証された末尾の始まりが、タグ文字（サロゲートの組）の前半と後半の間に来るように、RGI のタグの並びの旗（L13 の並び）を置く → 次の窓の先頭は組の後半だけになる。その文字を含む run の候補は finding（I5 の (b)。分からない文字を E の外とみなさない）で、旗の中のタグ文字が、次の窓で誤って除かれない
- (f) **もれも重複も無いこと**: 並びを、窓の境目の前後のすべての位置（境目の前 300 単位から後ろ 300 単位まで、1 単位ずつ）に置いて走査する → どの位置でも、結果は「除いた数 1・finding 0」か「除いた数 0・finding 1」のどちらか（もれの「0・0」と、重複の「除いた数 2」「1・1」は無い）。I5 の (a)・(c) に当たる位置は「除いた数 1・finding 0」
- (g) **窓を何度もまたぐ**: 窓 3 つ以上にわたる 1 行で、各境目に (a)〜(c) の形を置く → 各候補が 1 回だけ決まり、I5 の (b) に当たらない候補の結果は、同じ中身を窓に分けずに（大きい窓で）走査した結果と同じ

期待値が変わる既存のテスト（人間の承認が要る）: `tests/regression-item48-raw-chars-scan.test.ts:122`（T1 の「見ない」の一覧）と `:231`（方向の印・ゼロ幅の守り）。そのほか、`raw characters checked:` の行の文を固定しているテスト（例: `tests/parse-security.test.ts` の T10・T14）と、生成した JSON schema を比べるテストを、実装の段で洗う。`LineAssembler` の渡し方を変えるので、窓のテスト（`tests/regression-m1r2-004-long-line-window.test.ts`、`tests/regression-m2-0r2-001-window-completeness.test.ts` など）が今のまま通ることを確かめる。

### 4.9 ADR

新しい ADR が要る（判定を厳しくする変更）。案は `docs/reviews/batch1-design/adr-0037-draft-final.md`（R2 で決定 1・3 と対象範囲の節を直し、R3 で決定 2・3〈I5・I6・I9〉と既知の限界を直した。最終版は R3 と同じ中身）。ADR-0036 の既知の限界（`:80`）に「層 (c) は ADR-0037」の追記。

### 4.10 影響

- 判定: 厳しくなる（今 PASS のリポジトリが FAIL になりうる）。版は minor
- 設定の互換: 新しい分類は enum の追加だけ（古い設定はそのまま読める）。新しい分類を書いた設定を古い aiqh で読むと、設定のエラー（exit 2。fail closed の向き）
- 出力の形: `raw characters checked:` の行が長くなる。除いた数の行が増える（位置の数。I9）。件数の行とパーサの数のキーは変わらない（finding は今の鍵で 1 件。I9）
- 既存のテストの期待値: §4.8 の 2 か所と、文を固定しているもの
- 適用先: A は 0 件。B は 4 件（2 ファイル）で FAIL → B の設定に規則 2 つ（理由つき）を足してから、再利用ワークフローの SHA を上げる（R2 で足した符号位置で件数が増えないことを、実装の段で数え直す）
- **対象範囲の注記**【R1-006 への対応】: 「層 (c) の全分類を既定で FAIL」は、security の check が中身を読むファイルの、UTF-8 として読めた文字と、パス名についての話。次は見ない
  - 最初に読んだ塊の先頭 8 KiB に NUL があるファイル（ファイルごとバイナリとして飛ばす。中の文字はどれも見ない）。UTF-16・UTF-32 のファイルは、ふつう先頭に NUL があるのでここに入る
  - 不正な UTF-8 のバイト（finding にしない）
  - TAB・LF・LF の前の CR・ファイルの最後の CR・ファイルの先頭の BOM
  - ルートのパス、symlink の先、submodule の中、ignore された未追跡のファイル（ADR-0036 と同じ）
  - review-packet（`FORBIDDEN_RANGES` だけを止める。ADR-0036 の決定 9）
  - RGI の並びの完全一致の内側の U+200D・U+FE0F・タグ文字（I1〜I9）。ただし、窓から消える位置で両端が確定しない run の候補は、並びの内側でも finding（I5 の (b)。FAIL の向きの誤り）【R2-001 への対応】

---

## 5. 項目 41: 負荷に弱いテスト

### 5.1 ROADMAP の記載（`docs/ROADMAP.md:878`）

`tests/regression-backlog16-r2-confirm-origin.test.ts` の「close pending, SIGKILL sent, the group seen gone later」が、重い負荷（1 分平均 82.03）のもとで、前提の確かめ「the group ignored SIGTERM and got the SIGKILL」で FAIL した（同じ commit のやり直しは PASS）。leader は「準備できた」の印のファイルを書いた**後**に SIGTERM を無視する設定をするので、その間に SIGTERM が届くと leader が SIGTERM で終わり、SIGKILL が要らなくなる、と推定（未確認）。直すなら、負荷のもとで修正前の FAIL を再現してから直す。

### 5.2 記録にある負荷の失敗（ROADMAP・CHANGELOG・報告・レビューの応答から）

（R1 から変えていない）

| # | テスト | 症状 | 状態 |
|---|---|---|---|
| L1 | `tests/regression-r4-report.test.ts`（R4-002） | 子が SIGTERM を無視する設定の前に SIGTERM で終わった（v0.5.5） | 直した（v0.5.6、M2-2-FLAKE-001。準備の印を待ってから中断する形） |
| L3 | `tests/regression-m2-2-builtin-r3-allow-branches.test.ts`「every edit of a repository file type-checks」 | 30 秒の時間切れ（v0.5.23） | 上限を 120 秒にした |
| L4 | unit-minpath の時間のテスト（名前の記録なし） | 別の作業の負荷で時間切れ（v0.5.41） | 運用（負荷のゲート）だけ |
| L5・L8 | 型を読むガードのテスト 5〜6 件（名前の記録なし） | 30 秒・120 秒の時間切れ（v0.8.0・v0.8.1） | 運用だけ。ROADMAP の項目は無い |
| L6 | 「the leader was not ready within 8000 ms」（ファイルの記録なし） | 準備の待ちの時間切れ（v0.8.0） | 運用だけ |
| L7 | `tests/parse-output.test.ts` の P3 | 1 MiB の線形の読みが 1,000 ms を超えた（v0.8.0） | 直した（作業量の時計） |
| L9 | 項目 41 のテスト | 上の 5.1 | **open** |

### 5.3 再現（2026-10-21、SP1。基準の commit の worktree。テストの実行は合計約 9 分〈Q 約 3 分・L2 約 5 分・順序の実験 20 秒〉、そのうち高い負荷は L2 の約 5 分）

**Q（負荷のゲートの後。1 分平均 8 以下かつ 5 分平均 12 以下が 3 回続くのを待った）**
- 対象のファイルを 5 回: 5 回とも PASS（各 2〜3 秒。開始時の 1 分平均 4.45〜4.66）
- 全テスト 1 回: PASS（175 ファイル・2,348 件・90 秒。開始時の 1 分平均 4.11）

**L2（ゲートを通さない。全テストを 2 本同時に走らせ、その間に対象のファイルを繰り返す）**
- 1 分平均は 12.70 から最大 311.65 まで上がった（対象の 32 回目の開始時の値。15 秒ごとの負荷の記録の最大は 306.21。この機械は 8 CPU）
- 対象のファイル 51 回のうち **1 回 FAIL**（13 回目、開始時の 1 分平均 76.74）。FAIL は ROADMAP の記録と同じ、`:72` の前提「the group ignored SIGTERM and got the SIGKILL」（`sigkillAt` が null）
- 全テスト 2 本は**どちらも FAIL**（各 2 件、各 290 秒）。どれも型を読むガードのテストの時間切れ:
  - `regression-m2-2-builtin-r3-allow-branches.test.ts`「every edit of a repository file type-checks」: 133.0 秒・130.2 秒（上限 120 秒。静かなときは 32.7 秒）
  - `regression-m2-2-builtin-r4-union-and-element-forms.test.ts`「src/ has no violation」: 31.0 秒（上限 30 秒。静かなとき 12.8 秒）
  - `regression-m2-2-builtin-r5-entrance-forms.test.ts`「has no violation」: 32.7 秒（上限 30 秒。静かなとき 12.3 秒）
- 20 秒を超えたテストは 2 本とも 7 件。どれも TypeScript の program を作るガードのテスト（`createProgram` を使う 15 ファイルのうち 7 ファイル）で、静かなときの 2.33〜10.33 倍（上の 3 件のほか、builtin-r6 27.9〜29.1 秒〈Q 8.3 秒〉、backlog21 27.6〜28.5 秒〈Q 2.8 秒〉、builtin-r1-001 23.4〜24.3 秒〈Q 4.0 秒〉、r3-003 21.9〜22.4 秒〈Q 2.8 秒〉）
  - 【R1-005 への対応】の直し: R1 は「`createProgram`・`getTypeChecker` を使う 14 ファイル」「2.3〜10.3 倍」と書いた。数え直すと `tests/*.ts` で `createProgram` を含むファイルは 15（`getTypeChecker` を直接書くファイルは 0）。倍率は vitest の JSON の記録（ミリ秒）から出し直すと 2.33〜10.33 倍（最大は backlog21: 2.76 秒 → 28.5 秒）
- 倍率の傾向（SP2 で記録から出した）: 静かなときに短いテストほど倍率が大きく（2〜3 秒のもので 8〜10 倍）、長いテストほど小さい（12〜33 秒のもので 2.3〜4 倍）。待つ時間で決まるテスト（プロセスの時間のテストなど）は、ほぼ 1 倍

**順序の実験（ゲートの後。負荷の代わりに、leader が印を書いた直後に 400 ms の待ちを入れた。実験だけのテストで、commit しない）**
- 時間・前提の確かめ・期待は、対象のテストと同じ（`KILL_GRACE_MS` 600・`CONFIRM_MS` 1200・`FAKE_ALIVE_MS` 1000）。違いは leader のスクリプトの順序と待ちだけ
- 今の順序（印 → 待ち → SIGTERM を無視する設定）: **5 回とも FAIL**（各 1.29〜1.32 秒）。FAIL はすべて `precondition: the group ignored SIGTERM and got the SIGKILL: expected null not to be null`（L2 の FAIL・ROADMAP の記録と同じ）
- 入れ替えた順序（SIGTERM を無視する設定 → 印 → 待ち）: **5 回とも PASS**（各 1.86〜1.90 秒）
- 開始時の 1 分平均 2.35。実験の前後で `$TMPDIR` の `aiqh-*` は 10 のまま（実験は何も残していない）

### 5.4 原因

（R1 から変えていない）

確かめた（決定的な実験と、負荷のもとの FAIL の文が一致）: leader のスクリプト（`tests/regression-backlog16-r2-confirm-origin.test.ts:39`）は、準備の印を書いた**後**に SIGTERM を無視する設定をする（`:49` の `body`）。テストは印を見るとすぐ中断する（`:53` → `:69`）。印から設定までの間に SIGTERM が届くと、leader は既定の動き（SIGTERM で終わる）になり、グループが猶予の前に消えるので、runner は SIGKILL を送らない（`src/runner/execute.ts:215` の `if (group.gone) return;`）。その結果 `sigkillAt` が null のままで、`:72` の前提が FAIL する。ふだんはこの間がマイクロ秒の単位で、負荷で leader のプロセスがその間に止められたときだけ起きる（L2 で 51 回中 1 回）。製品のコードの不具合ではなく、テストの準備の順序の問題。

同じ形の前例: v0.5.6 の M2-2-FLAKE-001 の調査（`docs/ROADMAP.md:186`）は「子が SIGTERM を無視する処理を登録する前に SIGTERM で終わった」で、そのときは「準備の印を待ってから中断する」形に直した。今回は、その印そのものが設定より先に書かれていた。

### 5.5 案

| 案 | 中身 | 評価 |
|---|---|---|
| 41-A（推奨） | leader の準備の順序を直す（SIGTERM を無視する設定 → 印の書き込み）。同じ形のテストを洗う | 競合そのものを無くす。製品のコードは変えない |
| 41-B | 時間の上限を広げる | 順序の競合なので効かない |
| 41-C | 前提が崩れたら、そのテストだけやり直す | 失敗を隠す（直った扱いにしない決まりに反する） |
| 41-D | 記録のまま（運用の負荷のゲートで避ける） | 負荷のゲートの無い場所（CI の混んだ runner など）で落ちうる |

洗う範囲（grep の目安。SIGTERM を無視する `process.on("SIGTERM", () => {})` の形と、準備の印の `writeFileSync(${JSON.stringify(ready…` の形で数えた）: SIGTERM を無視するコードを含むテストは 11 ファイル。そのうち準備の印を書くのは 7 ファイル（`tests/regression-backlog16-r1-pgid-reuse.test.ts`・`tests/regression-backlog16-r2-confirm-origin.test.ts`・`tests/regression-backlog16-r3-probe-every-target.test.ts`・`tests/regression-backlog16-confirm-termination.test.ts`・`tests/regression-backlog16-r2-direct-signal.test.ts`・`tests/regression-m2-2-flake-001-timeout-after-abort.test.ts`・`tests/regression-r4-report.test.ts`）。順序は実装の段で 1 つずつ確かめる。2 つのファイルにある同じ `leaderWithDaemon`（`tests/regression-backlog16-r1-pgid-reuse.test.ts:62-67`、`tests/regression-backlog16-r2-confirm-origin.test.ts:36-41`）は、印の前に置く準備の部分を受け取る形にする。

型を読むガードのテスト（2 つめの系統。項目 41 の本文には無いが、同じ「負荷に弱いテスト」）【R1-005 への対応】:

| 案 | 中身 | 評価 |
|---|---|---|
| **41-E'（推奨。R2）** | 時間の予算を T1〜T4 に分けて定義し（下の表）、負荷で伸びるテストの上限を T3 の式で決め直す。式で 200 秒を超える builtin-r3 の「every edit」は、編集ごとの `it` に分ける。上限に近い遅さを run の終わりに、件数を絞って出す（B1-Q25。R3 で出し方を直した【R2-005 への対応】） | 観測した最大の倍率（10.33）を覆う。1 つのテストが suite の予算の 1/3 を超えない。ガードの検出の力（違反を見つける fixture と期待）は変えない |
| 41-E（R1 の推奨。退ける） | 上限を、静かなときの 8 倍以上に（builtin-r3 の「every edit」は 300 秒、30 秒の 6 件は 120 秒） | 8 倍は観測した倍率より小さい。300 秒は unit の 600 秒の半分を占めうる（R1-005） |
| 41-F | TypeScript の program を worker の中で共有し、作る回数を減らす | 速くなるが、テストの作りの変更が大きい → 付録 B の新しい項目 |
| 41-G | 運用（負荷のゲート）のまま、記録だけ | 今と同じ |

**時間の予算**【R1-005 への対応】

| 予算 | 定義 | 値と根拠 |
|---|---|---|
| T1 負荷のゲート（手元） | テストと verify（各 commit の worktree の検証を含む）を始める前に、負荷が下がるのを待つ | 1 分平均 8 以下かつ 5 分平均 12 以下が 20 秒おきに 3 回続く（最長 90 分）。リリースの検証で 15 分平均が高いときは、1 分平均 6 以下かつ 5 分平均 8 以下。開始の値を報告に書く。CI には置かない（job ごとに別の runner）。今は運用の決まりだけで追跡している文書に無いので、`docs/ops/ci-and-branch-protection.md:151` の「8. リリースの手順」に書く（v0.13.2） |
| T2 並列数 | 1 台の機械で同時に走らせる全テストは 1 本。vitest の worker の数は変えない | vitest 5.0.0 の既定の worker の数は「CPU の数 − 1」（watch でないとき）。2 本を同時に走らせると、8 CPU で worker が 14 になる（§5.3 の L2 は、これを意図して起こした）。verify は check を 1 つずつ走らせる（`src/runner/run-checks.ts:33`）ので、unit と unit-minpath は重ならない。並列の抑制は付録 B の新しい項目 |
| T3 各テストの上限 | 負荷で伸びるテスト（§5.3 の L2 で、静かなときの 2 倍以上になったもの）の上限 = max(30 秒, 静かなときの時間 × 12 を 10 秒単位に切り上げ)。式が 200 秒を超えるテストは分ける | 12 = 観測した最大の倍率 10.33（8 CPU で全テスト 2 本を同時、1 分平均が最大 311.65）に約 16% の余裕。静かなときの時間は §5.3 の Q の全テストの値。200 秒は T4 の 1/3。待つ時間で決まるテスト（倍率がほぼ 1）は対象外（上限は今のまま） |
| T4 suite の予算 | unit・unit-minpath の check の `timeoutSec` 600（`aiqh.config.jsonc:12`・`:17`） | CI の v0.13.1 の main の run で unit 181 秒（30.2%）。50%（300 秒）を超えたら、CI の見張り（項目 42）に記録し、付録 B の 2 つの項目を早める |

T3 を当てたときの上限（静かなときと L2 の時間は §5.3 の記録。今の上限は、どれも `vitest.config.ts:6` の 30 秒。builtin-r3 の「every edit」だけ 120 秒）:

| テスト | 静か（秒） | L2（秒、2 本） | 倍率 | 新しい上限 |
|---|---|---|---|---|
| builtin-r3「every edit of a repository file type-checks」 | 32.74 | 133.0・130.2 | 3.98〜4.06 | 式で 400 秒（200 秒を超える）→ 編集ごとの `it` に分ける（編集は 19。静かなとき 1 つあたり約 1.7 秒の見込みで、式は 30 秒。実装の段で測り直す） |
| builtin-r4「src/ has no violation」 | 12.83 | 31.0・29.9 | 2.33〜2.41 | 160 秒 |
| builtin-r5「has no violation」 | 12.32 | 29.5・32.7 | 2.40〜2.66 | 150 秒 |
| builtin-r6「has no violation」 | 8.32 | 27.9・29.1 | 3.35〜3.50 | 100 秒 |
| builtin-r2-001「src/ has no violation」 | 6.97 | 18.3・17.8 | 2.55〜2.62 | 90 秒 |
| builtin-r1-001「src/ has no violation」 | 4.04 | 24.3・23.4 | 5.80〜6.01 | 50 秒 |
| b21-r1-001「the same file asked again …」 | 3.52 | 18.5・17.4 | 4.96〜5.27 | 50 秒 |
| parse-output「only newlines」 | 3.14 | 10.6・9.1 | 2.90〜3.39 | 40 秒 |
| m2-1-r1-002「-o and --zip-output with U+2028 …」 | 2.84 | 8.0・7.2 | 2.54〜2.84 | 40 秒 |
| m2-1-r1-002「-o and --zip-output with U+202E …」 | 2.63 | 7.5・8.5 | 2.86〜3.23 | 40 秒 |
| backlog21「the brand guard reports nothing in src/」 | 2.76 | 27.6・28.5 | 10.01〜10.33 | 40 秒 |
| r3-003「src/ has no violation, and every terminal reference …」 | 2.75 | 21.9・22.4 | 7.95〜8.16 | 40 秒 |
| builtin-r5「s09_duplicate_literal_computed …」 | 2.55 | 8.7・8.2 | 3.22〜3.43 | 40 秒 |
| r2-001-output-boundary・r4-002・r3-004 の各 1 件 | 1.91〜2.21 | 11.6〜19.5 | 6.10〜8.81 | 30 秒（式どおり。今のまま） |

- 上限を広げても、ガードのテストの検出の力（違反の fixture と期待）は変わらない。変わるのは、止まったテストを見つけるまでの時間だけで、それも T4 の 600 秒で抑えられる
**上限に近い遅さの記録**（B1-Q25 の A。R3 で確定）【R2-005 への対応】（R2 の「1 行ずつ出す」を、件数を絞って最後に件数の行を出す形にした。判定は変えない）

- **作り**: vitest の reporter（仮: `tests/support/near-limit-reporter.ts`。`vitest.config.ts` の `reporters` に、既定の reporter と並べて登録）。各テストの終わりに時間と上限を集め、run の終わりに stderr に書く
- **reporter の API について、SP3 で分かったこと**（vitest 5.0.0 の配布物の型定義と実装を読んだだけ。実行していない）
  - reporter の入口: `Reporter` の `onTestCaseResult(testCase)`（テストとその hook が終わった後）と `onTestRunEnd(testModules, unhandledErrors, reason)`（`node_modules/vitest/dist/chunks/plugin.d.BbcoZhuj.d.ts:2106`・`:2126`・`:2152`。ファイルの名前の後半は配布物の版ごとに変わる）
  - 各テストの上限: `testCase.options.timeout`（型は `number | undefined`、注記「Only tests have a `timeout` option」。同じファイルの `:295-308`）。実装では、reporter の側の `options` は `timeout: task.timeout` で作られ（`node_modules/vitest/dist/chunks/index.B89dZ0-N.js:18977-18986`）、`task.timeout` はテストを集めるときに `options.timeout ?? runner.config.testTimeout`（テストの引数、`describe` の options、tag の options を重ねたもの。無ければ設定の `testTimeout`）で決まる（`node_modules/vitest/dist/chunks/run.CQOUYP-x.js:2628`・`:2658`）。同じ値が、テストの時計（`withTimeout`）に渡される（同じファイルの `:2683`）。読んだ範囲では、reporter で**有効な上限が取れる見込み**
  - 各テストの時間: `testCase.diagnostic()` の `duration`（ミリ秒。テストが終わった後だけ。`plugin.d.BbcoZhuj.d.ts:360-373`）
  - 分からないこと（**SP4 の最初に確かめる**）: (1) `options.timeout` が、主の process の reporter にそのまま届き、テストの時計と同じ値か（設定の既定・テストの数の引数・`describe` の options の 3 つの形で）、(2) `duration` に `beforeEach`・`afterEach` の hook の時間が入るか、(3) skip・失敗・時間切れのテストで何が見えるか、(4) reporter が stderr に書いた行が、`npm run test` の子の stderr にそのまま出るか。SHA 固定の worktree で、小さな fixture の 3 つのテストに reporter を付けて 1 回走らせて確かめる（テストの段の実行。通信なし）
- **SP4 の最初の確かめの結果**（v0.13.2 の実装の段。2026-10-22。基準の commit の SHA 固定の worktree で、commit しない fixture の 3 つのテスト〈通る・skip・時間切れ〉に probe の reporter を付け、`npm run` から 1 回走らせた。通信なし）【R2-005 への対応】
  - (1) `options.timeout` は主の process の reporter に届き、テストの時計の値と同じだった: `describe` の options の 1500、設定の既定の 4000、テストの数の引数の 300（時間切れのテストの誤りの文も「Test timed out in 300ms」）。worker の側の `task.timeout` も同じ値
  - (2) `duration` には `beforeEach`・`afterEach` の時間が**入る**（本体 50 ms、hook 200 ms と 200 ms で 456 ms）。上限に対する割合は、本体の割合より大きく出る（記録が多めに出る向きで、判定は変わらない）
  - (3) skip のテストは diagnostic が無い（時間を集めない）。時間切れのテストは state が failed で、時間（311 ms）が見える
  - (4) reporter が stderr に書いた行は、`npm run` の子の stderr にそのまま出て、件数の行が stderr の最後の行だった
  - 判断: 上限は 3 つの形とも取れ、テストの時計の値と同じだったので、下の「取れない場合の振る舞い」には当たらない。B1-Q25 の A のとおり、reporter を v0.13.2 に入れた（`tests/support/near-limit-reporter.ts`。(2) は reporter の説明と `docs/ops/ci-and-branch-protection.md` の 8-1 に書いた）
  - 依存の更新（v0.13.2 の最初の commit で vitest を 5.0.3 に上げた。npm の勧告への対応）の後に、同じ probe を vitest 5.0.3 で走らせ直し、同じ結果だった（上限 1500・4000・300、時間 460 ms で hook を含む、skip は diagnostic が無い、時間切れは failed で 309 ms、件数の行が stderr の最後の行）。この節の `node_modules/vitest/dist/chunks/` のファイルと行は、5.0.0 の配布物のもの
- **取れない場合の振る舞い**（あらかじめ決める）
  - 個々のテストで `options.timeout` が正の有限の数でない（`undefined`・0・無限）: そのテストは一覧に出さず、最後の行の「上限の分からないテスト」の数に入れる（黙って落とさない）
  - SP4 の確かめで、`options.timeout` がテストの時計の値と違う、またはどのテストでも取れないと分かった: v0.13.2 では reporter を入れない（近接の記録を出さない）。上限の表をテストの設定に別に持つ形は採らない（テストの中の上限と表が食い違っても気づけず、誤った記録になる）。この場合は v0.13.2 の報告に書き、付録 B に項目を足す。判定と T1〜T4 は変わらない
- **出し方**（stderr。run の終わりに 1 回）
  - 一覧: 上限の 50% を**超えた**テスト（ちょうど 50% は出さない）を、上限に対する割合の大きい順に**最大 20 行**。形は `aiqh-test-slow: <ファイル> > <テストの名前> 41.2 s of 60 s (69%)`。1 行は UTF-8 で 300 バイトまでに切る（長い名前は `…` で切る。文字の途中では切らない）
  - **最後の 1 行**（いつも出す。0 件のときも）: `aiqh-test-slow: summary over-half <X> shown <S> omitted <X−S> unknown-limit <K> of <T> tests`（X は 50% を超えた数、S は一覧に出した数、K は上限の分からない数、T は時間を集めたテストの数）
  - 末尾の上限を超えても最後の行が残る理由: verify は check の stderr の**末尾**を残す（読むときに末尾の 10 MiB、`src/runner/execute.ts:27`・`:401-420`。レポートには末尾の 200 行・64 KiB、`src/runner/run-checks.ts:19`・`:21`・`:191-206`）。reporter が書くのは最大 21 行・約 6.2 KiB（21 × 301 バイト）で、件数の行がその最後なので、reporter の出力がどれだけ多くても件数の行は消えない（一覧の数を絞るのはこのため）。件数の行が落ちるのは、reporter の後に、vitest や npm が 200 行・64 KiB に近い量を stderr に書いたときだけ（ふつうは数行。落ちても判定は変わらず、`outputTruncated` が立つ）
  - run の途中で check が止まったとき（check の時間切れ・中断）は、run の終わりが来ないので何も出ない。そのときは check が FAIL か SKIPPED になる（判定は今のまま）
  - PASS の check の出力は端末に出ない（`src/commands/verify.ts:117-120`）が、`latest.json` の `checks[].stderrTail` に残る

### 5.6 決めること

B1-Q18（順序の直しと洗う範囲）、B1-Q19（型を読むガードのテストの上限。R2 で変更）、B1-Q25（上限に近い遅さの記録。R2 で新設、R3 で A に確定し、出し方と取れない場合の振る舞いを決めた）

### 5.7 テストの計画

- 順序: 直した後、§5.3 の実験と同じ「印の直後の待ち」を入れた形で、直した順序が PASS すること。修正前の FAIL は、そのテストを基準の commit の worktree に写して記録する（実験の結果が、その見込み）
- 負荷のもとの確かめ（実装の段）: 直した後、L2 と同じ負荷（全テスト 2 本を同時）で、対象を 50 回以上。直す前は 51 回で 1 回 FAIL
- 型ガード【R1-005 への対応】: T3 の上限にした後、L2 と同じ負荷で全テスト 2 本が時間切れにならないこと（直す前は 2 本とも FAIL）。各テストの時間を記録し、T3 の式の根拠（倍率）が崩れていないかを見る（新しい上限の 50% を超えたテストは、B1-Q25 の行で分かる）
- 分けた builtin-r3 の「every edit」: 分ける前と同じ 19 の編集が、どれも型の誤り無しであること（期待は今と同じ。分けたことで検出の力が変わらないことを、19 の名前の一覧で確かめる）
- reporter（B1-Q25 で入れるとき）: 出す・出さないを決める部分を関数にして単体のテストを置く（50% ちょうど・超え・上限の無いテスト）
- reporter の出し方【R2-005 への対応】: (1) 50% を超えたテストが 25 件 → 一覧 20 行と最後の行（`over-half 25 shown 20 omitted 5`）、割合の大きい順、(2) 0 件 → 最後の行だけ（`over-half 0 shown 0 omitted 0`）、(3) 上限の分からないテスト → 一覧に出ず、`unknown-limit` に数える、(4) 長い名前 → 1 行 300 バイトまで（文字の途中で切らない）、(5) 最後の行がいつも最後、(6) reporter の出力の前に stderr の行を 300 行置き、後ろに 5 行置いて、verify の末尾の切り方（`tail`、`src/runner/run-checks.ts:192`）を通しても、件数の行が残る。基準の commit には reporter が無いので、どれも **FAIL**
- SP4 の最初の確かめ（上の「分からないこと」の 4 つ）は、テストとして残さない実験（commit しない fixture）。結果を v0.13.2 の報告に書き、取れない場合の振る舞いに当たったかを記録する
- この 2 つの負荷の確かめは、機械を長く重くするので、合計 30 分以内で行う。始める前に T1 のゲートを通し、ほかの重い作業が無いことを確かめる

### 5.8 ADR

要らない（テストと、テストの作りの設定〈`vitest.config.ts`〉と運用の文書だけ）。

### 5.9 影響

`tests/` と `vitest.config.ts`（reporter の登録）と `docs/ops/ci-and-branch-protection.md`（T1）。製品の動き・出力・設定・判定は変わらない。CI の `unit` の時間は、上限を広げても、テストが速く終われば変わらない。テストの数は、builtin-r3 の「every edit」を分けた分だけ増える（1 → 19）。

---

## 6. 項目 47: R-010（`runs/<runId>/`）

### 6.1 ROADMAP の記載（`docs/ROADMAP.md:884`）

並行の verify で、`latest.json` と `latest.md` が別の run のものになりうる（独立レビュー R1 の R-010、`docs/reviews/m0/independent-review-r1.md:137-145`。R2 の「roadmap から落とさないこと」、`docs/reviews/m0/independent-review-r2.md:218-224`）。M4 では作らない（ADR-0034 の L、`docs/adr/0034-history-aggregate-without-database.md:142-144`）。案は (a) `runs/<runId>/` と単一の pointer / manifest の原子的な更新、(b) latest の更新の全体を lock する、(c) 記録で閉じる（どちらも `startedAt` を持つ）。

### 6.2 関係するコードと文書

- 書き込み: `src/report/write.ts:16-38`（`writeReports`。`latest.json` `:26` → `latest.md` `:27` → history の名前を取る `:28` → history を書く `:30`）。`writeAtomic`（`:102-111`。`O_EXCL` の一時ファイルに書いてから `rename`）。`reserveHistoryPath`（`:52-70`。`wx` で名前を取り、ぶつかれば `-2`・`-3`。R1 は doc コメントの始まりから `:45-70` と書いた）
- 呼び出し: `src/commands/verify.ts:150`（書けなければ exit 2、`:151-155`）
- 出力のディレクトリ: 既定 `artifacts/verification`（`src/config/schema.ts:17`）、設定のファイルのディレクトリが起点（`src/config/load.ts:120`・`:142-146`）、`-o`（`src/commands/verify.ts:81-82`）
- lock は src のどこにも無い
- run の名前: `runId` のような欄は無い。`startedAt`（ミリ秒つきの ISO の文字列）が、`latest.json`（`src/report/build-report.ts:28`）と `latest.md` の `| Started | … |`（`src/report/markdown.ts:25`）に**同じ文字列**で入る
- 読み手
  - review-packet: `<root>/artifacts/verification/latest.json` だけを読む（`src/review/packet.ts:1056-1076`。`output.dir` と `-o` は見ない）。commit が範囲の終わりと同じで、作業ツリーが clean のときだけ使う（`:1098`）
  - 再利用ワークフローの Job Summary: 作業のディレクトリの `artifacts/verification/latest.md` だけ（`.github/workflows/verify.yml:125-131`）
  - init の `.gitignore` の確かめ: `src/commands/init.ts:311`（`GITIGNORE_PROBES`）
  - `aiqh history`: `history/` だけ（`src/run-history/read.ts:27`・`:244`）。`latest.*` は読まない
  - テスト: 書き込み箇所の一覧 `tests/file-write-sites.test.ts:82`、最上位のキー `tests/regression-backlog9-report-json-copy.test.ts:76`・`tests/parse-verify.test.ts:74`
  - 文書: `README.md:116-122`、ADR-0003（`docs/adr/0003-report-format-json-markdown.md:10-12`）
- 競合を決定的に起こす前例: `tests/regression-rest2-n1-history-name-race.test.ts:21-30`（`node:fs` を包み、`renameSync` の直前に差し込む。もう 1 つの run の `writeReports` を別の node のプロセスで最後まで走らせる）

### 6.3 根拠（窓）

（R1 から変えていない）

- 各ファイルは `rename` で入れ替わるので、半分だけ書かれたファイルは見えない。組（2 ファイル）は原子的でない
- 例: A が `latest.json` を入れ替え → B が `latest.json` → B が `latest.md` → A が `latest.md`。結果は `latest.json` が B、`latest.md` が A
- 並行でなくても起きる形: `latest.md` の書き込みだけが失敗した（exit 2）、2 つの `rename` の間でプロセスが止められた
- 誰が困るか: リポジトリの中に、2 つを**組で**読む読み手は無い（review-packet は json だけ、Job Summary は md だけ、history は `history/` だけ）。困るのは、`latest.md` を読む人と `latest.json` を読む道具が別の run を見る場合と、外の読み手が 2 つを組で読む場合
- 並行が起きる場面: CI は job ごとに別の checkout なので起きない。手元で、同じ作業ツリーで 2 つの verify（例: 人と AI のエージェント、2 つのエージェント）を同時に走らせると起きる

今回見つけたこと（項目 47 の外。B1-Q21）:
1. `aiqh history` を verify と同時に走らせると、verify が名前を取った直後の空の history のファイル（`src/report/write.ts:50`・`:57`）を `empty` と読み（`src/run-history/read.ts:309`）、`HISTORY INCOMPLETE`・exit 2 になる（`src/commands/history.ts:221`）。一時的で、fail closed の向き。ADR-0034 の `:68` は空のファイルを「止められた verify」とだけ書いている（コードを読んだ推定。実行はしていない）
2. 再利用ワークフローの Job Summary は、作業のディレクトリの `artifacts/verification/latest.md` を読む（`.github/workflows/verify.yml:125-131`）。verify は設定のファイルのディレクトリ（と `output.dir`）の下に書く（`src/config/load.ts:120`・`:142-146`）。入力の `config` が下のディレクトリの設定を指すとき、または `output.dir` を変えたとき、Job Summary に何も足されない（エラーにもならない）（コードを読んだ推定。実行はしていない）

### 6.4 案

| 案 | 中身 | 評価 |
|---|---|---|
| 47-a | `runs/<runId>/` に各 run を書き、最後に単一の pointer（manifest）を原子的に入れ替える | pointer を読む読み手には組が揃う。だが今の読み手（review-packet・Job Summary・init・外の読み手）は `latest.json`・`latest.md` の場所を読むので、互換のために `latest.*` も書き続けることになり、その組の問題は残る。`runs/` は増え続ける（ADR-0007 の `:18` と同じ）。書き込み箇所・文書・テストの変更が大きい。新しい ADR |
| 47-b | latest の更新の全体を lock する（`O_EXCL` の lock ファイル） | 組が揃い、場所は変わらない。止められた verify が残した lock の扱い（古い lock を奪う規則、または ERROR で止める）が要る。`openSync` は出力のガードの書き手の一覧にある（`tests/structure/output-guard.ts:117`）ので、ガードの扱いも要る。新しい ADR |
| **47-c（推奨。R2 で「受け入れ・未解決」に直した）**【R1-004 への対応】 | **既知の限界として受け入れる。解決済みにしない**。並行の verify で組が別の run になりうることと、読み手の約束・食い違ったときの手順（下）を文書にする。競合を意図して再現するテストで、食い違いが起こりうることと、`startedAt` が違えば別の run と分かること、同じでも同じ run とは限らないこと（R3【R2-004 への対応】）を示す。ROADMAP の項目 47 は閉じず、状態を「受け入れ（未解決）」にする | 出力の形も場所も変わらない。小さい。リポジトリの中の読み手は今も組で読んでいない。同じ作業ツリーの並行の実行を支える必要が出たら、47-a か 47-b を新しい ADR で選び直す |
| 47-d | この batch では扱わない（後回し） | R2 の「roadmap から落とさない」は守れるが、項目が残り続ける |

**読み手の約束と、食い違ったときの手順**【R1-004 への対応】（README の出力の節〈`README.md:116-122`〉・ADR-0003 の追記・ADR-0034 の L の追記に書く。v0.13.2）

1. 1 回の verify は、`latest.json`・`latest.md`・`history/<stamp>.json` に、同じ `startedAt` の文字列を書く（`src/report/build-report.ts:28`、`src/report/markdown.ts:25`）
2. 各ファイルは `rename` で入れ替わるので、半分だけのファイルは見えない。組（`latest.json` と `latest.md`）は、同じ出力のディレクトリに並行して書く verify があると、別の run のものになりうる（`src/report/write.ts:26-27`）。`latest.md` の書き込みだけが失敗した run の後も同じ
3. 2 つを組で読む読み手は、`latest.json` の `startedAt` と、`latest.md` の `| Started | … |` の値を照らす【R2-004 への対応】（R2 の「同じ文字列なら同じ run」は誤りだったので直した）
   - **違えば、確実に別の run**（1 回の verify は 3 つのファイルに同じ文字列を書く。約束 1）
   - **同じでも、同じ run の保証はない**。`startedAt` はミリ秒までの時刻（`src/report/build-report.ts:28` の `toISOString()`）で、run の一意の名前は無い。同じミリ秒に始めた別の run は、同じ文字列を持てる
4. 食い違ったら
   - (a) その出力のディレクトリに書く verify が走っていないことを確かめてから、2 つを読み直す
   - (b) まだ食い違うなら、`latest.md` を使わず、run ごとの記録 `history/<stamp>.json` を使う（名前は `startedAt` の秒までで決まり〈`src/report/write.ts:40-43`〉、同じ秒の別の run は `-2` などが付く〈`:52-70`。名前は run ごとに排他で取る〉）。中の `startedAt` で照らすが、約束 3 のとおり、同じ `startedAt` の history が 2 つ以上あれば、どれが `latest.json` の run かは決められない
   - (c) 組が要るなら、並行の無い状態で verify をやり直す（確実なのはこれだけ）
5. リポジトリの中の読み手は組で読まない（review-packet は json だけ、Job Summary は md だけ、`aiqh history` は `history/` だけ）。この約束は外の読み手（人・別の道具）のためのもの
6. 確実に見分けるには、run ごとの一意の名前（runId）か、history の一意の鍵を、`latest.json`・`latest.md`・history に同じ値で書く仕組みが要る。今は無い（v0.13.2 では作らない。付録 B の 7 の新しい項目）【R2-004 への対応】

### 6.5 決めること

B1-Q20（案。R2 で変更、R3 で読み手の約束を直した）、B1-Q21（今回見つけた 2 つの扱い）

### 6.6 テストの計画

- 47-c-1（R1 のまま）: 新しいテスト（仮: `tests/regression-item47-latest-pair-started-at.test.ts`）。1 回の verify の後、`latest.md` の `| Started | … |` の値と `latest.json` の `startedAt` が同じ文字列であること（読み手が組を見分ける手がかりを固定する守り。基準の commit で PASS）
- 47-c-2（R2 で足した）【R1-004 への対応】: 競合の再現（同じファイルか、仮の `tests/regression-item47-latest-pair-race.test.ts`）。`tests/regression-rest2-n1-history-name-race.test.ts:21-30` と同じ作法で `node:fs` を包み、run A の `latest.md` の `rename` の直前に、run B の `writeReports` を別の node のプロセスで最後まで走らせる。期待:
  - `latest.json` の `startedAt` は B、`latest.md` の Started は A（食い違いが起こりうる）
  - `history/` に A と B の 2 つのファイルがあり、それぞれの中の `startedAt` は自分のもの
  - 上の約束 3 の照らし方（テストの中の小さな関数）が「別の run」と判定し、約束 4 (b) の手順で B の history の `startedAt` が `latest.json` の `startedAt` と一致する
  - 差し込みの無い対照: 同じ 2 つの run を順に書けば、組は一致する
  - 基準の commit で PASS（振る舞いを変えないので、直す前の FAIL は無い）。既知の限界を固定するテストで、限界を直すとき（47-a・47-b）は、この期待を ADR とともに変える
- 47-c-3（R3 で足した）【R2-004 への対応】: 47-c-2 の変種。run A と run B に、**同じミリ秒の `startedAt`** を与える。時計は、前例と同じく `buildReport` に `startedAt: new Date("…")` を渡して固定する（`tests/regression-rest2-n1-history-name-race.test.ts:47-57`。前例は同じ秒の別のミリ秒〈`:74-75`〉を使う）。run を見分ける印には、テストの中だけで違う `project.name`（`run-a`・`run-b`）を使う（`latest.md` では見出しの行 `# Verification Report — <名前>`、`src/report/markdown.ts:17`）。期待:
  - 差し込みで、`latest.json` は B（`project.name` が `run-b`）、`latest.md` は A（見出しが `run-a`）になる
  - 約束 3 の照らし方は「違うとは言えない」（`startedAt` が同じ文字列）と判定する。つまり、`startedAt` が同じでも別の run でありうることを固定する
  - `history/` に `<stamp>.json` と `<stamp>-2.json` の 2 つがあり、中の `startedAt` はどちらも同じ。約束 4 (b) の照らしでは候補が 2 つ残り、どちらが `latest.json` の run かを `startedAt` だけでは決められない（`project.name` で見ると、それぞれ自分の run）
  - 基準の commit で PASS（既知の限界を固定するテスト）。runId（付録 B の 7）を入れるときは、この期待を「runId で見分けられる」に変える
- 47-a・47-b を選ぶとき: 2 つの書き手を差し込みで交互に動かすテスト（直す前に FAIL）、止められた run の後の lock・pointer の扱い、書き込み箇所の一覧の更新

### 6.7 ADR

47-c: ADR-0003 と ADR-0034 の L に追記（「受け入れ・未解決」、読み手の約束〈R3 で直した約束 3・4 と、足した 6〉、食い違ったときの手順、再現のテスト 47-c-2・47-c-3 の名前）。新しい ADR は要らない。47-a・47-b と runId（付録 B の 7）: 新しい ADR。

### 6.8 影響

47-c: 文書（README・ADR-0003・ADR-0034・ROADMAP の項目 47 の状態と新しい項目）とテスト 3 つ（47-c-1〜47-c-3）。出力・設定・読み手は変わらない。適用先に関係しない。ROADMAP の項目 47 は「受け入れ（未解決）」として残す（付録 B の 6）。runId・history の一意の鍵は ROADMAP の新しい項目にする（付録 B の 7）。

---

## 7. 版の分け方（案）

決まり: pull request は同時に 1 つ（`docs/ops/ci-and-branch-protection.md:151` の手順）。各版の後に、SHA と CI を記録する PR（`docs/<topic>`）を 1 つ挟む。

| 順 | 版 | 項目 | 種類 | 判定・出力の変化 | 独立レビュー（案） |
|---|---|---|---|---|---|
| 1 | v0.13.2（patch） | 43（注記・docs の同じ形・守りのテスト）、41（テストの順序・型ガードの上限と分け方・上限に近い遅さの記録・負荷のゲートの文書）、47-c（受け入れの文書と、守りと再現のテスト） | tests・`vitest.config.ts`・docs だけ | 無し | **実装 1 回（テストの差分に絞る: 時間切れの上限、負荷の再現、テストの検出力）**【R1-007 への対応】。High・Medium が 0 なら終える |
| 2 | v0.14.0（minor） | 45（node:test の検出）、39（pytest のパーサ） | 生成と表示 | 判定は変わらない。init の出力と `parsed` が増える | 実装 1 回 |
| 3 | v0.15.0（minor） | 49 の層 (c) | 判定を厳しくする | 今 PASS のリポジトリが FAIL になりうる | 実装 1 回（ADR-0037 の案は、この設計で扱った） |

- 1 を先にする理由: 41 の負荷に弱いテストは、後の版の各 commit の検証を揺らす。43・47-c は小さく、同じ「tests と docs だけ」にまとまる
- v0.13.2 の実装（SP4）の最初に、§5.5 の reporter の API の確かめ（「分からないこと」の 4 つ）を行う【R2-005 への対応】。取れない場合は、§5.5 の「取れない場合の振る舞い」のとおり reporter を入れずに進める（ほかの中身は変わらない）
- v0.13.2 の実装のレビュー【R1-007 への対応】: 製品のコードは変えないが、SIGTERM・SIGKILL のテストの準備、型ガードの上限、テストの分け方を変える。機械の検証（各 commit の worktree の verify・CI）の PASS だけでは、負荷のテストを弱めていないことまで評価できないので、テストの差分に絞って 1 回頼む。見てもらう点: (1) T3 の上限が観測した倍率を覆い、止まったテストを見逃さないか、(2) 負荷の再現（L2 と同じ条件）の手順と結果、(3) 順序の直しと分けたテストが、元の前提・期待を弱めていないか（基準の commit での FAIL の記録と、直した後の PASS）
- 2 と 3 を分ける理由: 3 だけが判定を厳しくする（CHANGELOG で目立たせ、適用先 B の allow の準備と合わせる）
- 2 を 45 と 39 の 2 つの版に分ける案（B1-Q22 の V2）もある。どちらも判定を変えないので、1 つにまとめる方がレビューと記録が 1 回で済む
- 適用先の SHA を上げる作業（人間の決定 H11）との順序（B1-Q24）: 1 回目（今の版 v0.13.1 で上げる）は済んだ（2026-10-21。適用先 A は PR #4、適用先 B は PR #2）。残りは、v0.15.0 の後に、適用先 B の allow の規則（2 つ）を足す PR と一緒にもう一度上げる
- 依存: 39 と 49 は別のモジュール（`src/parse/` と `src/security/`）。49 は `raw characters checked:` の行を変えるが、パーサの数の行は変えない。45 と 39 は「unit の表示」でつながり、付録 A の語の分け方を共有する（v0.14.0 で一緒に入る）

---

## 8. 確かめていないこと

- pytest の出力: 既定の形（`-q` なし）、失敗・エラー・警告のある出力、`(h:mm:ss)`、古い ` seconds`、`no tests ran`、引数の誤りで要約を出さない止まり方は、実物で確かめていない（SP2 は `-q` の、passed と skipped だけの 1 回）[要確認]
- node:test の出力の形（パーサは範囲の外）。Node の値を別の語で取るオプションの一覧（§2.4 の規則 4）は、SP3 で手元の Node v24.13.1 の `node --help` と照らした（18 個とも値を取る形）。ほかの版の Node の一覧、`--test` のときに位置の語より後ろの監視のオプションが効くか、設定のファイル・環境のファイルの中の `NODE_OPTIONS` で監視が入るか（§2.4 の規則 7）は確かめていない [要確認]（どれも「検出しない」向きに倒してある）
- RGI の並びの文字がすべて Emoji・Emoji_Component に入ること（UTS #51 の定義。Node の見本 7 つでは確かめた）、RGI の並びの最も長い長さ [要確認]
- Unicode の文書（UAX #31・UTS #39・UTS #51・UTS #55）の推奨の細部、U+FFF9–U+FFFB が DICP から外れている理由、U+13430–U+1343F と前に置く印の表示の有無 [要確認]
- 2025 年の「見えない文字に隠したコード」の報告と、タグ文字による AI への指示の注入の報告の細部 [要確認]
- `\p{RGI_Emoji}` を run ごとに使うときの、最悪の入力での時間（実装の段で測る。§4.8 の L11）
- R2 で足した符号位置の、3 つのリポジトリでの件数（0 件の見込み。実装の段で数え直す）
- vitest 5.0.0 の reporter から、各テストの上限（timeout）と時間が取れるか（B1-Q25）: SP3 で型定義と実装を読み、取れる見込み（§5.5）。実行での確かめは SP4 の最初（§5.5 の 4 つ）
- 層 (c) の I5・I6 の窓の扱い（R3）は、コードを読んで決めた。実装の段で L16 の (a)〜(g) と L24 で確かめる
- builtin-r3 の「every edit」を分けた後の、1 つあたりの時間（約 1.7 秒は 32.74 秒を 19 で割った見込み）
- B1-Q10 の古い aiqh の history の挙動、§6.3 の 2 つの「見つけたこと」（コードを読んだ推定。実行していない）
- 項目 41 の L4・L5・L6・L8 で落ちたテストの名前（記録に無い。SP1 の L2 で、型を読むガードのテスト 3 種類が時間切れになることは確かめた）
- GitHub の runner の CPU の数と、そこでの倍率（T3 の 12 は手元の 8 CPU の機械の値）[要確認]

---

## 付録 A. コマンドの語の分け方（45 と 39 で共有）【R1-001・R1-002 への対応】

- 新しいモジュール（仮: `src/command-words.ts`）。`src/adapters/node.ts`（45）と `src/parse/select.ts`（39 の pytest だけ）が使う。今の `segmentsOf`（`src/parse/select.ts:46-70`。引用符を捨てる）は、vitest・eslint・npm audit・security-scan の選び方にそのまま使う（それらの出力を変えない）
- 区切り: 引用符の外の `;`・`&&`・`||`・`|`・`&`・改行で単純コマンドに分ける。`>&`・`<&`・`&>` の `&` は区切りにしない（`2>&1` は語の一部）
- 語: 引用符の外の空白で分ける。`'…'` と `"…"` の中は 1 語の一部（引用符は取り除く）。引用符の外の `\` は次の 1 文字をそのまま語に入れる。引用符か `\` を含んでいた語に「引用あり」の印を付ける
- 照らすのは印の無い語だけ（実行位置・`node`・`--test`・`-m`・`pytest`・wrapper の語・環境変数の前置きの名前）
- 照らさない形（その単純コマンドは、どの規則にも当たらないものとして扱う＝検出しない・選ばない）: 閉じていない引用符（コマンド全体）、引用符の外の `$(`・`` ` ``・`(`・`)`・`{`・`}`・`<<` を含む単純コマンド
- 環境変数の前置き: 単純コマンドの先頭から、`名前=値` の形の語（名前は `[A-Za-z_][A-Za-z0-9_]*`、名前の部分に印が無い）を飛ばす。値の部分は引用ありでもよい
- 出力に script の本文を出さない（M1-R1-003。理由の文は今の作法のまま）
- 単体のテスト（仮: `tests/command-words.test.ts`）: 区切り・引用・`\`・前置き・照らさない形・`2>&1`・空の単純コマンド（`;;`）・空白だけ

## 付録 B. ROADMAP に足す予定の項目（文案）

人間の承認の後、v0.13.2 の docs の commit で ROADMAP に足す（番号は足すときに決める）。

1. **型を読むガードのテストの並列の抑制**（【R1-005 への対応】。Low）: TypeScript の program を作るテスト（`tests/*.ts` で `createProgram` を含む 15 ファイル）は、全テストを並列に走らせると CPU を取り合い、負荷で静かなときの 2.33〜10.33 倍に伸びる（batch1 SP1 の L2）。v0.13.2 では上限を式で決め直した（設計 R2 の §5.5 の T3）が、伸びそのものは残る。案: これらのファイルだけ worker の数を抑える（vitest の project を分けるなど）、または順に走らせる。CI の unit の時間（項目 42）が T4 の 50% を超えたら優先を上げる
2. **TypeScript の program の再利用**（【R1-005 への対応】。Low）: ガードのテストが、同じ `src/` の program をファイルごとに作り直している（builtin-r4・r5・r6、backlog21、r3-003 など）。案: worker の中で 1 つの program を共有する（`tests/structure/typescript.ts` の部品）、または `src/` の違反の確かめを 1 つのテストにまとめる。速くなるが、テストの作りの変更が大きい。1 と一緒に検討する
3. **再利用ワークフローの Job Summary の場所**（B1-Q21。Low〜Medium）: Job Summary は作業のディレクトリの `artifacts/verification/latest.md` だけを読む（`.github/workflows/verify.yml:125-131`）。verify は設定のファイルのディレクトリ（と `output.dir`）の下に書く（`src/config/load.ts:120`・`:142-146`）ので、入力の `config` が下のディレクトリの設定を指すとき、または `output.dir` を変えたとき、Job Summary に何も足されない（エラーにもならない）。コードを読んだ推定で、まだ実行していない。案: ワークフローが verify の出力のディレクトリを知る方法（`aiqh verify` の出力の行か、入力）を足し、見つからなければ Job Summary にその旨を書く
4. **既存の道具のパーサの選び方を、語の位置で見るか**（【R1-002 への対応】の関連。Low）: vitest・eslint・npm audit・security-scan の選び方は、今も単純コマンドのどの語でもよい（`src/parse/select.ts:83-98`）。`echo vitest …` のような check の出力に要約と同じ形の行があれば、件数を誤って出しうる（判定は変わらない）。pytest と同じ規則（設計 R2 の付録 A）に揃えるかを決める。既存の出力が変わりうるので、別の版で
5. **review-packet と層 (c)**（ADR-0037 の既知の限界。Low）: review-packet は `FORBIDDEN_RANGES`（75 の符号位置。`src/security/raw-chars.ts:20-28`）だけを止め、層 (c) の文字（ゼロ幅・異体字セレクタ・タグ文字など）はパケットに入る。パケットを読むレビュアーの側で、見えない文字が問題になるかを、v0.15.0 の後に決める
6. **項目 47 の状態の書き換え**（【R1-004 への対応】。R3 で約束の文を直した【R2-004 への対応】。新しい項目ではなく、今の項目 47 の文の書き換え）: 「状態: 受け入れ（未解決）。並行の verify で `latest.json` と `latest.md` が別の run になりうることは直さない。読み手の約束（`startedAt` を照らす。違えば確実に別の run、同じでも同じ run の保証はない）と、食い違ったときの手順を README・ADR-0003・ADR-0034 に書き、競合を再現するテスト（`startedAt` が違う組と、同じミリ秒の組）で固定した（v0.13.2）。あわせて、`aiqh history` を verify と同時に走らせると、名前を取った直後の空の history のファイルで exit 2 になりうること（一時的、fail closed の向き）を記録した。確実に見分ける仕組み（runId）は別の項目にした。同じ作業ツリーの並行の実行を支える必要が出たら、47-a か 47-b を新しい ADR で選び直す」
7. **run の一意の名前（runId）／history の一意の鍵**（【R2-004 への対応】。Low）: 今のレポートには run の一意の名前が無い。`startedAt` はミリ秒までの時刻（`src/report/build-report.ts:28`）で、同じミリ秒に始めた別の run は同じ値を持てる。history の名前は秒まで＋ぶつかったときの連番（`src/report/write.ts:40-43`・`:52-70`）で、`latest.*` には書かれない。そのため、`latest.json` と `latest.md` が同じ run のものかを確実には見分けられない（項目 47 の読み手の約束 3、batch1 の設計 R3 の §6.4）。案: (a) run を始めるときに一意の `runId`（例: 時刻・pid・乱数を合わせたもの）を作り、`latest.json`・`latest.md`・history に同じ値で書く、(b) history の名前（排他で取った一意の名前）を、`latest.json`・`latest.md` に書く（history を書いた後に latest を書く順に変える必要がある）。どちらもレポートの最上位のキーを増やす（`tests/regression-backlog9-report-json-copy.test.ts:76`・`tests/parse-verify.test.ts:74` の期待値、ADR-0003 の追記、`schemaVersion` の扱いを決める）ので、新しい ADR。項目 47 の 47-a（`runs/<runId>/`）の前提にもなる。外の読み手が組で読む必要が出たら優先を上げる
