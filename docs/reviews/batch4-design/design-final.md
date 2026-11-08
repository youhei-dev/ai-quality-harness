# aiqh batch4 設計（最終。v0.18.1・v0.18.2・H11 の 5 回目）

作成: 2026-11-07（R1・R2・最終は同じ日）。基準の commit: `3a6295a3ae2ce15d3a1329f50cb825529d9c72c5`（公開リポジトリの main。GitHub の設定の記録の PR #28 の merge）。設計の段では、コード・テスト・docs の追跡しているファイルを変えていない。決めることは `questions-final.md`（B4-D-Q1〜B4-D-Q15。すべて確定）、各回への応答は `response-r1.md`・`response-r2.md`、ADR の追記の案は `adr-0003-addendum-draft-final.md`・`adr-0008-addendum-draft-final.md`・`adr-0026-addendum-draft-final.md`（ADR-0027 の注記を含む）・`adr-0028-addendum-draft-final.md`（どれも同じフォルダ）。設計の段の実測の添付 `batch4-scope-summary-r1.md`・`deps-trial-r1.md`・`import-trial-r1.md`・`golden-probe-r2.md` も同じフォルダ。設計 R1 の本文（`batch4-design-r1.md`）は公開リポジトリの外（R1 からの変更は下の表と `response-r1.md`）。

## R2 からの変更（最終版）

設計 R2 の独立レビュー（batch4-design R2）は指摘なし（High 0 / Medium 0 / Low 0。R1 の 4 件はすべて「解消」）。中身は R2 から変えていない（このフォルダのファイル名に合わせて、参照の名前だけを直した）。R2 のレビュアーが実装の段の確かめとして挙げた 3 点（テストごとに別の一時ディレクトリと後始末、history のファイルの名前は返されたパスから読む、変異を実際に走らせる）は、v0.18.1 の実装で行った（`response-r2.md`）。

## R1 からの変更（R2）

設計 R1 の独立レビュー（batch4-design R1。High 0 / Medium 3 / Low 1）の 4 件を、どれも採用して直した。指摘ごとの判断と実測は `response-r1.md`。

| 指摘 | 重要度 | 対応 | 直した所 |
|---|---|---|---|
| B4-D-R1-001（golden が実際に書かれるファイルのバイト列ではない） | Medium | 採用。golden は使い捨ての場所で `writeReports` が書いた `latest.md`・`latest.json` を読み戻し、Buffer で比べる。期待値は表記だけ（生の文字を置かない）。実測で、`renderMarkdown` の返り値と書かれたファイルは、生の文字を含む stderr の行だけが違った | §2.4.2・§2.4.3・§2.4.7、§5、§3.4 の M14、ADR-0003 の追記の案 r2 の決定 1・4 |
| B4-D-R1-002（`--no-contains origin/main` で手元だけのタグを見る） | Medium | 採用。**根拠の文の向きは逆**（実測: `--no-contains origin/main` は origin/main の祖先を指すタグを 98 個すべて出し、origin/main 自身を指す ref を外す）。ただし「手元だけのタグを正しく見分けられない」という結論は成り立つ（外れるのは、手元の HEAD〈merge の commit〉に誤って付けたタグ）。手元の `refs/tags/v*` とリモートの `--refs` の名前の集合で比べ、送る前に 5 点を 1 つずつ確かめる | §2.2 の 3、付録 B.1 |
| B4-D-R1-003（push の結果が不確定なとき） | Medium | 採用。送り直さず止まり、`git ls-remote` の読み取りで「未作成」「正しく作成済み」「別の対象または確認不能」に分けて人間に知らせる。§2.6 の「タグはできない」の断定を消した | §2.2 の 5・6、§2.6、§5、付録 B.1 |
| B4-D-R1-004（golden の入力の守りが期待値のファイル頼み） | Low | 採用。入力の側を期待値と独立に、固定の数で確かめる（check の数・状態・`parsed` の道具・コマンドと `cwd` の場合の数）。`plain` にも Checks の表・失敗の詳細の `- Command:`・`cwd:` を必ず入れる。期待値を変える commit では、人が差分を読んだことを記録する | §2.4.3・§2.4.5・§2.4.6、§5、§3.4 の M15、ADR-0003 の追記の案 r2 の決定 5・6 |

人間の決定（2026-11-07）: B4-D-Q1〜B4-D-Q15 は、すべて推奨の A で確定。これに伴い **B4-Q2 を決め直した**（1c は「エラーの文の手がかり」ではなく、`--id-prefix` が `-R<数>` で終わるときに使い方の誤り〈exit 2〉にする）。互換性の変更（1a・1c が今通る入力を拒む）は、ADR・README・`--help`・CHANGELOG に書く。

R1 の「指摘なし」の観点に付いていた条件も入れた: 問い 2（moderate 10 件を受け入れる理由と CI での再確認を記録する。§2.5.3）、問い 4（表の外のバックスラッシュを既知の限界に明記、組み合わせのテスト。§3.1）、問い 5（`Problem` の種類の型に `previous`、CLI の出力の経路、再取り込みの早い返りは変えない。§3.3）、問い 6（H11 の比べは出力の互換の一部の根拠で、`latest.md` の一致の直接の確かめではない。反映の前に設定を取り直す、適用先 A の人間の承認。§4）。

## 0. 前提

- **範囲**: 人間の決定（2026-11-07）B4-Q1〜B4-Q12（§1）。範囲の洗い出しの報告は公開リポジトリの外にあり、要点を `batch4-scope-summary-r1.md` に写した
- **表記**: 適用先のリポジトリを「適用先 A（node:test）」「適用先 B（pytest）」と書く。中身・用途は書かない（件数・ファイルの種類・出力の形だけ）
  - 根拠: `docs/reviews/batch3-design/design-final.md:34-35`、`docs/adr/0028-output-parsers-display-only.md:231`（pytest の実物は適用先 B の CI）、`docs/ROADMAP.md:1204`（H11 の 4 回目の A・B の merge）
- **数の印**: 【実測】この設計の段（2026-11-07）に手元で測った値、【記録】ROADMAP・CHANGELOG・ADR・過去の設計・報告から引いた値、【推定】見込み（実装の段で確かめ直す）。測り方は付録 A
- **実測の環境**: macOS（Apple Silicon、AC 電源、`caffeinate -i`）、Node v24.13.1、npm 11.18.0（`min-release-age=7`・`ignore-scripts=true`）。テストの前に負荷のゲート（1 分平均 ≤ 8 かつ 5 分平均 ≤ 12 が 20 秒おきに 3 回）
- **着手前の確認**【実測】: HEAD = origin/main = 基準の commit、作業ツリーは clean、開いている PR 0、タグ v0.18.0 = commit `2e4dab6e2164c0899e4a2f1400de0faecc3dd590` / tag object `a0646d4c21e5a7896671dcc02eddb731705818e4`。ruleset は `main-protection`（branch）と `tag-protection`（tag。規則 `deletion`・`update`、Bypass なし）、`sha_pinning_required: true`。適用先 A・B の呼び出しはどちらも `verify.yml@2e4dab6… # v0.18.0`
- **急ぐもの**【実測。範囲の報告】: 無い。`npm audit --audit-level=high` は 0、自己 CI の unit・unit-minpath は直近の main の 10 本で最大 178 秒（上限 600 秒の 29.7%）、Actions（checkout v7.0.1・setup-node v7.1.0・setup-python v7.1.0）はどれも最新で勧告 0 件、実行時の依存 3 つは最新

## 1. 範囲と決定（B4-Q1〜B4-Q12。人間の決定 2026-11-07）

| 問い | 決定 |
|---|---|
| B4-Q1 範囲 | 主案: v0.18.1（src 不変）→ v0.18.2（src を小さく変える） |
| B4-Q2 review-import v3 | 入れない。1b・1c・1a の注意は v0.18.1 の docs。**決め直し（2026-11-07）: 1c は `--id-prefix` が `-R<数>` で終わるときに使い方の誤り（exit 2）にする**（B4-D-Q8 の A）。1a は import の時点で止める（v0.18.2） |
| B4-Q3 項目 56 | 見張りのまま。見張りの条件を `docs/ops/monitoring.md` に写す（v0.18.1） |
| B4-Q4 docs の記録（候補 8・9） | v0.18.1 に入れる |
| B4-Q5 依存 | B: 範囲の外の開発用の依存を v0.18.1 で上げる。**`@types/node` は上げない（B4-D-Q1 = A で確定）**: eslint 10.14.0・typescript-eslint 8.72.1・vite 8.3.5 |
| B4-Q6 H11 | B: v0.18.2 の後に 1 回（5 回目） |
| B4-Q7 レビュー | 設計 R1 を 1 回（High・Medium 0 なら終える）＋ 各版の実装 R1 |
| B4-Q8 最初のタグ | v0.18.1 のタグで。手順の docs を先に入れてから |
| B4-Q9 C-44 | (ii) 直す（v0.18.2。C-02 の golden でバッククォートの無い値の出力が同じことを示す） |
| B4-Q10 C-57 | 入れない |
| B4-Q11 53-G | 入れない（後の候補） |
| B4-Q12 調べもの | C-06 はコードの読みで閉じて v0.18.1 の docs に記録。C-07 の残り・C-51・C-19 は別の依頼 |

B4-D-Q1〜B4-D-Q15（設計の中の問い）は、すべて推奨の A で確定（2026-11-07）。

版の中身:
- **v0.18.1**（src を変えない）: 記録（§2.1）、タグの手順（§2.2）、review-import の使い方の注意と C-08（§2.3）、C-02 golden fixture（tests。§2.4）、開発用の依存の更新（§2.5）、最初のタグの作成（§2.6）
- **v0.18.2**（src を小さく変える）: C-44（`latest.md` のコマンドと作業ディレクトリ。§3.1）、1c（`--id-prefix`。§3.2）、1a（round 1 の `previous`。§3.3）
- **v0.18.2 の後**: 適用先 A・B の呼び出しの SHA を上げる（H11 の 5 回目。§4）

## 2. v0.18.1（src を変えない）

### 2.1 記録

1. **ADR-0028 の決定 14 の既知の限界への注記**（候補 8）: `docs/adr/0028-output-parsers-display-only.md:295` は「適用先 A の実物は設計の段に写しで 1 回確かめた。実装の段でもう一度取る: B3-D-Q7」と未来形のまま。適用先 A の CI の実物（H11 の 4 回目。main の run 41149756296）で `parsed: node-test — tests 113 (pass 113, fail 0); suites 0` が出た事実は ROADMAP:1204-1205 にだけある【記録】。`:231`（pytest の注記）と同じ形の注記を足す（文案は `adr-0028-addendum-draft-final.md` の (1)）
2. **PR #28 の CI の記録**（候補 9）: `docs/ops/ci-and-branch-protection.md:99` の「run の番号は次の記録で書く」と、ROADMAP の M3 の 983 行に、次を書く【記録: GitHub の設定の作業の報告。GET で確かめた】
   - PR #28 の run 42309130764（event pull_request、head `5a7a7a9`）: `verify (ubuntu)` と `reusable (self) / aiqh verify` が success（VERIFY PASSED 4m20s・3m48s）。アクションは SHA で取得され、SHA の固定の決まりによる注釈は 0
   - merge の commit `3a6295a3ae2ce15d3a1329f50cb825529d9c72c5`（親 `39ac8bf` と `5a7a7a9`）
   - main の run 42309849263（event push、head `3a6295a`）: 必須の 2 つが success（VERIFY PASSED 4m34s・4m32s）
   - → `sha_pinning_required: true` の後の最初の 2 本の run で、同じリポジトリの再利用ワークフロー（`./.github/workflows/verify.yml`）が止まらないことを確かめた
3. **C-06 の記録**（B4-Q12。置き場所は B4-D-Q11）: m0 R1 の未確認 3 点（`docs/reviews/m0/response-r1.md:38`）の今を、コードの読みで書く【実測: コードの読み】
   - `markdown.ts` の code fence: 「中の最も長いバッククォートの連なり＋1（最低 3）」（ADR-0020:33、`src/report/markdown.ts` の `fenceFor`）。テストがある（`tests/regression-backlog9-report-file-notation.test.ts:151` など）
   - `schema.ts` の文字列の長さ: 上限があるのは `timeoutSec` だけ（`src/config/schema.ts:28,84`）。ほかの文字列に長さの上限は無い（これは「未確認」ではなく、決めていないこととして記録する）
   - `package.json` の `files`・`prepare`: `files` は `dist`・`schema`・`README.md`、`prepare` は無い。配布物の中身は自己 verify の package の check（`npm run smoke:package`）が毎回確かめる
4. **rule insights が API で読める事実**（範囲の報告 b-2）: `GET repos/youhei-dev/ai-quality-harness/rulesets/rule-suites` は public のリポジトリで HTTP 200【実測: 2026-11-07】。記録は 1 件（`refs/heads/main`、2026-11-07T08:08:36+09:00、`pass`。PR #28 の merge の push）。batch3 の設計（最終）§8.1 の [要確認] の答えとして、ci 手順書 §3 の「実施済み（2026-11-07）」の確かめに 1 行足す。§8.2 の (2)（適用先の run にどちらのリポジトリの `sha_pinning_required` が当たるか）は未確認のまま書く
5. **項目 56 の見張りの条件を `docs/ops/monitoring.md` へ**（B4-Q3、範囲の報告 b-6）: 今は ROADMAP:893 にだけある。§2 に「2.6 node:test の件数が出ない（`output-truncated`）」、§3 の表に 1 行を足す（付録 B の文案）
6. **5,914 と 5,913 の揺れ**（範囲の報告 b-9。B4-D-Q12）【実測・推定】: ADR-0028:279（5,914 単位）は設計の段、:312（5,913 単位）と ROADMAP:1196 は実装の段の実測。設計の段の出力（12,422 バイト・5,914 単位・125 行）を読み直すと、テストごとの時間の値が 113 個あり、桁の数は 5〜10 文字とまちまち。実装の段は 12,421 バイト・5,913 単位【記録】。1 単位の差は時間の桁のゆれで説明できる（実装の段の出力は残っておらず、行ごとには照らしていない）。どちらも直さず、(1) の注記に 1 文足す
7. **区切り記号の表記**（B4-D-Q10）: ROADMAP の v0.18.0 の項（:1205 など）は `parsed: node-test U+2014 tests 113 …` と符号位置で書き、ADR-0028:312・CHANGELOG・README は文字そのもの（U+2014）で書いている【実測】。U+2014 は制御文字でも層 (c) の文字でもない。推奨は、これから書く文は文字そのもの、すでに書いた記録は変えない

### 2.2 タグの手順（B4-Q8。範囲の報告 §5。R2 で 3・5・6 を書き直した: B4-D-R1-002・B4-D-R1-003）

今の正本【実測】: ci 手順書 §8 の手順 7（:178）と `CLAUDE.md`（プロジェクトの、git の追跡外）の手順 7 は、「タグを付ける前に、指す commit が release の commit であることを確かめる」「付けた後、push の前に `git rev-list -n1 vX.Y.Z`」「間違えたら次の版」「ruleset を無効にするかは人間」を持つ。無いのは、コマンドの形（`git tag -a`・`git push`）、送る前の手元だけのタグの確かめ、push の後の `git ls-remote` の確かめ、タグ 1 つだけを名前で送る決まり、手順 7 の中の「断られたら止まる」（今は §3:100 にだけある）と、送った結果が分からないときの扱い。

`tag-protection` は作ることを止めず、消すことと付け替えることを止める。だから、**送ったタグは取り消せない**。とくに、手元にある別の `v*` のタグ（打ち間違い・試しのタグ）を一緒に送ると、消せないまま公開のリポジトリに残る。取り消せない以上、送る前の確かめの正しさが要になる。

手順 7 の文案（ci 手順書 §8 と `CLAUDE.md` に同じ趣旨で。付録 B.1）:

1. **指す commit を確かめる**: release の commit の 40 桁の SHA（PR の merge で `--match-head-commit` に渡した SHA）を `<SHA>` とする。`git log -1 --format=%s <SHA>` が release の commit のメッセージ、`git merge-base --is-ancestor <SHA> origin/main` が 0
2. **付ける**: `git tag -a vX.Y.Z <SHA> -m "vX.Y.Z: <要約>"`（SHA を明示する。手元の main の HEAD は merge の commit なので、HEAD に付けない）
3. **送る前に確かめる**（R2。B4-D-R1-002）
   - **手元だけのタグ**: 手元の `git for-each-ref --format='%(refname)' 'refs/tags/v*'` と、リモートの `git ls-remote --tags --refs origin 'refs/tags/v*'` の 2 列目（ref の名前）を、名前の集合として比べる。手元にだけある名前が `refs/tags/vX.Y.Z` の 1 つだけであること。`--refs` は、注釈付きタグを剥がした行（名前の後ろに `^{}` の付いた行）を出さない。剥がした行を名前と混同しない【実測: `--refs` 付きは 98 行、無しは 196 行。今の手元とリモートは同じ集合】
   - **送る対象を 1 つずつ**: (a) 完全な ref の名前が `refs/tags/vX.Y.Z`、(b) `git cat-file -t refs/tags/vX.Y.Z` が `tag`（注釈付き）、(c) タグの object の SHA（`git rev-parse refs/tags/vX.Y.Z`）を記録する、(d) 剥がした commit（`git rev-parse 'refs/tags/vX.Y.Z^{commit}'`。`git rev-list -n1 vX.Y.Z` と同じ）が `<SHA>`、(e) リモートに同じ名前が無い（`git ls-remote --tags origin refs/tags/vX.Y.Z` が空）
   - **使わない形**: `git tag -l 'v*' --no-contains origin/main` は、手元だけのタグを見分けられない。`--no-contains <commit>` は「その commit を含まないもの」を出すので、origin/main の祖先を指す既存のタグはすべて出て、origin/main 自身とその子孫を指すタグ（手元の HEAD = merge の commit に誤って付けたタグ）は外れる【実測: `--no-contains origin/main` は 98 個のタグをすべて出した。origin/main を指す ref〈`refs/remotes/origin/main`・`refs/heads/main`〉は `--no-contains origin/main` で外れ、`--contains` で出た】。R1 の設計はこの形を使っていた
4. **送る**: `git push origin refs/tags/vX.Y.Z`（完全な ref の名前で 1 つだけ。B4-D-Q14）。`git push --tags`・`--follow-tags`・`--mirror` は使わない
5. **送った後に確かめる**: `git ls-remote --tags origin refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'` の 2 行が、3 の (c) のタグの object の SHA と、`<SHA>`
6. **push が失敗した・時間切れになった・結果が分からないとき**（R2。B4-D-R1-003）: **送り直さず、手元もリモートも変えずに止まる**。読み取りだけの `git ls-remote --tags origin refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'` で、次の 3 つのどれかを確かめて人間に知らせる。ruleset を無効にするか・どうするかは人間が決める
   - **未作成**: 同じ名前の ref がリモートに無い
   - **正しく作成済み**: 2 行があり、タグの object の SHA と剥がした commit が、3 の (c)・(d) で記録した値と同じ（送れていた。5 と同じ状態）
   - **別の対象、または確認できない**: 同じ名前はあるが値が違う、`ls-remote` が失敗した、出力が読めない
   - push の終了コードや文だけで「タグは無い」と決めない（送った後に応答だけが失われることがある）
- 送る前（2〜3）に誤りに気づいたとき: 手元のタグを付け直すには、手元のタグを消す（`git tag -d vX.Y.Z`）必要がある。削除の操作なので、人間の確認を取ってから
- 送った後に誤りに気づいたとき: 直せない（消す・付け替えるは ruleset が止める）。次の版を出す。ruleset を無効にするかは人間が決める

### 2.3 review-import の使い方の注意と C-08（B4-Q2）

`docs/ops/review-loop.md` の「1 回の流れ」の手順 4 と「止まったときの対処」、`docs/ops/review-request-template.md` の「使い方」に足す（付録 B.2）【実測は §3.2・§3.3】:

- **1b**: `--cwd` には `docs/reviews/` があること（無いと `[repository] docs/reviews is not a directory …` で exit 2。ADR-0026:30 の意図したガード）。取り込みの試しを別の場所でするときは、先に `docs/reviews/` を作る。**原文を相対パスで書くと、`--cwd` を基準に解く**（ADR-0026:30）ので、絶対パスで渡す
- **1c**: `--id-prefix` は ID の `-R<回>` より前の部分（ID が `B3-D-R1-001` なら `B3-D`）。誤ると、指摘があれば `[id]` で止まるが、指摘が 0 件なら**誤った接頭辞のまま取り込まれる**（v0.18.2 で止める。§3.2）
- **1a**: round 1 の原文の JSON に `previous` を書かせない。別のラベル（設計のレビュー）の指摘の評価は、依頼文の問いの答え（本文）に書いてもらう（batch3-v0180-impl R1 で使った形）
- **C-08**: レビュアーはコードもテストも走らせない（既知の残余。`docs/reviews/batch3-v0180-impl/response-r1.md:43-52` など 6 ラベル）。実装者の確かめ（各 commit の単体の検証の結果・直す前の FAIL・変異の結果）の要約を、依頼文の「何を変えたか」か「既知の限界」に書く。生のログはパケットに入らない（`--doc` は追跡しているファイルだけ。`src/review/packet.ts:863-881`）ので、数・名前・終了コードだけを書く。色の ESC などの生の制御文字は書かない（パケットが止まる。ADR-0039）

### 2.4 C-02 golden fixture（B4-Q9。B4-D-Q2〜Q4。R2 で 2・3・5・6・7 を書き直した: B4-D-R1-001・B4-D-R1-004）

1. **置き場所**: `tests/report-golden.test.ts`、入力の組み立て `tests/report-golden-input.ts`、期待値 `tests/fixtures/report-golden/plain/latest.{md,json}` と `tests/fixtures/report-golden/edge/latest.{md,json}` の 4 ファイル【推定。名前は実装の段で決める】
2. **作り方（R2。B4-D-R1-001）**: 固定の入力 → `buildReport()`（`src/report/build-report.ts:20`）→ **使い捨ての場所（テストの一時ディレクトリ）で `writeReports(report, dir)` を呼び、書かれた `latest.md`・`latest.json` を読み戻した Buffer** を、期待値のファイルの Buffer とバイト単位で比べる（`Buffer.equals`。違えば、最初に違う行の番号と前後を出す）。`writeReports` が同時に書く history のファイルが、`latest.json` と同じバイト列であることも確かめる
   - 理由【正本と実測。付録 A6】: `writeReports` は `writeAtomic` を通して書き、Markdown は `escapeForDisplay(content, "keep")`、JSON は `escapeRawCharsAsJson` に通してから書く（`src/report/write.ts:104-108`）。基準のコードで、試しの入力（`plain` は 2 つの check〈PASS 1・`cwd` が `.` でない FAIL 1〉の簡単な形、`edge` は下の表の 8 つ）を書くと、`renderMarkdown(report)` の返り値と、書かれた `latest.md` は、生の文字（ESC・U+202E）を含む stderr の行だけが違った（`plain` で 1 行、`edge` で 4 行。行の数は同じ。書かれたファイルに生の文字は 0）。`latest.json` は `jsonForFile(report)` に改行を足したものと同じで、history のファイルも同じだった。R1 の「`renderMarkdown` と `jsonForFile` の返り値を比べる」形では、生の文字を含む入力で、実際のファイルを固められなかった
3. **入力**（2 組。どちらも全部が固定の値。R2 で具体的にした）:
   - 共通: `config`（`projectRoot: "/proj"`・`configPath: "/proj/aiqh.config.jsonc"`・`project.name: "demo"`・`configSha256` は固定の 64 桁）、`git`（固定の 40 桁・`main`・clean）、`startedAt`・`finishedAt`、`toolVersion: "0.0.0-golden"`（`package.json` の版を使わない）、`runId: "54545454-5454-4545-8545-545454545454"`。check の結果は `tests/helpers.ts` の `checkResult()` で作る
   - **両方の組に必ず入れるもの**（B4-D-R1-004）: PASS の check と FAIL の check（Checks の表の行と、失敗の詳細の `- Command:` と `cwd:` の行が必ず出る）、`cwd` が `.` でない FAIL の check、生の文字（ESC・U+202E。テストの中で実行時に組み立てる）を含む stderr
   - `plain`: 上に加えて、`parsed`（eslint・vitest・node-test・pytest の 4 つ。vitest は失敗の名前つき）、stderr に 3 つのバッククォートを含む行（フェンスが 4 つになる）、stdout の末尾、`outputTruncated: true`、時間切れ（`timedOut`・`signal`）、SKIPPED、任意の check、秘密の形（`fake()` で実行時に組み立てる。期待値には `[REDACTED:<category>]`）、`|` を含むコマンド（表のセルの `\|` と、失敗の詳細の `\|`）。どの値にもバッククォートが無く、空白で始まり空白で終わる値も無い
   - `edge`: 次の 8 つ（付録 A6 の試しと同じ）。`parsed` は 1 つ以上

     | # | 状態 | コマンド | `cwd` | v0.18.2 で変わる行 |
     |---|---|---|---|---|
     | E1 | PASS | `echo` の後に、バッククォート 1 つで囲んだ `date` | `.` | 表の行 |
     | E2 | PASS | `echo` の後に、2 つのバッククォートの連なりで囲んだ `x` | `.` | 表の行 |
     | E3 | FAIL | バッククォートで囲んだ `npm` で始まり、` test` が続く | `.` | 表の行・`- Command:` の行 |
     | E4 | FAIL | `npm test`、縦棒、`grep`、バッククォートで囲んだ `x`（縦棒との組み合わせ） | `.` | 表の行・`- Command:` の行 |
     | E5 | FAIL | `npm test` | `dir` とバッククォートと `x` | `- Command:` の行（`cwd:` の部分） |
     | E6 | PASS | 両端が空白の ` npm test ` | `.` | 表の行 |
     | E7 | FAIL | 両端が空白の ` npm run lint ` | `.` | 表の行・`- Command:` の行 |
     | E8 | PASS | `npm test` | `.` | 変わらない（対照） |

     → v0.18.2 の C-44 で変わる行は、Checks の表の 6 行（E1・E2・E3・E4・E6・E7）と `- Command:` の 4 行（E3・E4・E5・E7）の **10 行**【実測: 付録 A6。基準のコードで書いた `edge` の `latest.md`（書き込みの変換の後、103 行）で、変わる条件〈値にバッククォートがある、または空白で始まり空白で終わる〉に当たる行を数えた】。書き込みの変換が変える行（各 FAIL の stderr の行）とは重ならない
4. **入れないもの**（ADR-0003 の追記の案 r2 の決定 4）: 実在のパス・ホスト名・会社の名前・人名・適用先の実名、生の制御文字・層 (c) の文字のリテラル（入力に要るものは実行時に組み立てる。**期待値には生の文字を置かず、書き込みの変換の後の表記だけが入る**）、秘密の形のリテラル（`fake()` で組み立てる。プロジェクトの決まり）、揺れる値（時刻・`runId`・commit・時間は固定の値にする。テストの中で `Date.now()`・`randomUUID()`・`process.version`・`os.hostname()` を使わない）
5. **期待値の作り方と変え方**（B4-D-Q3 = A）: 期待値を書き出す道具はリポジトリに入れない。最初の 1 回だけ、使い捨ての場所で一回きりのスクリプトが `tests/report-golden-input.ts` の入力から `writeReports` で書き出し、人が中身を読んでから commit する。以後、期待値を変えてよいのは、出力を変える src の変更と同じ commit の中だけ。その commit のメッセージと CHANGELOG に、変わる行と理由を書く。期待値だけを変える commit は作らない。**期待値を変える（作る）commit では、人が差分を読んだことを PR の本文に書く**（R2。B4-D-R1-004）
6. **「形だけ」にしない守り（R2）**:
   - (a) 期待値は、自分の関数との比べではなく、commit したバイト列（書き込みの変換の後）との比べ
   - (b) **入力の側を、期待値と独立に確かめる**（B4-D-R1-004）: テストは `tests/report-golden-input.ts` の入力について、組ごとの check の数、状態ごとの数（PASS・FAIL・SKIPPED・時間切れ）、`parsed` の道具の集合、コマンドと `cwd` の場合の数（`plain`: `|` を含むコマンドが 1 つ以上、`.` でない `cwd` の FAIL が 1 つ以上、生の文字を含む stderr が 1 つ以上。`edge`: 上の表の E1〜E8 の 8 つの形と、変わる条件に当たる行の数 10）を、固定の数として確かめる。入力を減らすと、期待値を作り直しても落ちる
   - (c) 期待値のファイル自身が、決めた節と形（Summary・Categories・Checks の表、Parsed Output、Failure Details、`<details>` の stderr と stdout、4 つ以上のバッククォートのフェンス、マスクの印、表記の印、`edge` ではバッククォートを含む値）を含むことも確かめる
   - (d) 変異（§3.4 の M13〜M15）で、描画の 1 文字の違い・書き込みの変換の抜け・入力の削減で落ちることを確かめる
   - (e) 決まりを ADR-0003 の追記に書く（B4-D-Q4 = A）
   - **残る限界**: 入力と、入力の確かめ（固定の数）と、期待値を同じ commit で一緒に変えれば、テストは通る。これは手続き（出力を変える src の commit の中だけ・理由と人の確認の記録）で防ぐもので、技術で止める仕組みではない（差分は PR とレビューのパケットで見える）
7. **v0.18.2 で示すこと（R2）**: v0.18.2 の C-44 の commit の差分に、`tests/fixtures/report-golden/` のうち `edge/latest.md` だけが現れ、その差は上の 3 の表の 10 行だけ。`plain/` の 2 つと `edge/latest.json` は差分に現れない。`plain` が Checks の表・失敗の詳細の `- Command:`・`cwd:` の行を持つことは 6 の (b) が入力の側で確かめているので、「`plain` が差分に出ない」ことが、それらの行のバッククォートの無い値が変わらないことの根拠になる

### 2.5 依存の更新（B4-Q5 = B。B4-D-Q1）

#### 2.5.1 試し【実測。付録 A3】（B4-D-Q1 = A で確定したので、v0.18.1 で入れるのは組 2）

使い捨ての worktree（基準の commit に `git worktree add --detach`、`node_modules` は本体の APFS の複製）で、2 つの組を上げて確かめた。片づけは、変えた `package.json`・lock を `git restore --source=HEAD` で戻し（前後の写しは保存）、`git worktree remove`（`--force` なし）。

| 確かめ | 組 1: 4 つ（B4-Q5 のとおり） | 組 2: 3 つ（`@types/node` を上げない。B4-D-Q1 の A） |
|---|---|---|
| コマンド | `npm install --save-dev eslint@~10.14.0 typescript-eslint@~8.72.1 @types/node@~24.19.2 vite@~8.3.5` | `npm install --save-dev eslint@~10.14.0 typescript-eslint@~8.72.1 vite@~8.3.5` |
| `npm install`（`min-release-age=7`・`ignore-scripts=true`・`allow-remote=none`） | exit 0 | exit 0 |
| `package.json` の差 | 4 行の範囲（`~` のまま） | 3 行の範囲（`~` のまま） |
| lock の差（`git diff --stat`） | 324 行（`package.json` と合わせて +166 −166） | 308 行（`package.json` と合わせて +157 −157） |
| lock の全欄の比べ | 版の変更 35、追加 0・削除 0、同じ版で欄だけ変わったもの 0、ルートの `version` は 0.18.0 のまま。変わった 35 項目はどれも `dev: true`（dev・optional の印の変化 0）。実行時の依存 3 つ（commander・jsonc-parser・zod）の項目は前と同じ。engines・license の変化 0 | 版の変更 33（組 1 から `@types/node` と undici-types を除いたもの）、追加 0・削除 0、同じ版で欄だけ変わったもの 0、ルートの `version` は 0.18.0 のまま。33 項目はどれも `dev: true`（印の変化 0）。実行時の依存 3 つの項目は前と同じ。`@types/node` 24.13.6・undici-types 7.18.2 のまま |
| `npm ls` | `--depth=0` exit 0。`--all` の `UNMET OPTIONAL` 47 行（vite などの任意の peer。前から同じ形の見込み） | 組 1 と同じ（`UNMET OPTIONAL` 47 行） |
| `npm audit` | high 0（exit 0）、moderate 10（変わらず） | high 0、moderate 10 |
| typecheck | exit 0 | exit 0 |
| lint | exit 0。264 ファイル、error 0・warning 0（新しい指摘 0。抑止された 4 件は、基準の commit にある 4 つの `eslint-disable-next-line` の注釈のとおり） | exit 0。264 ファイル、error 0・warning 0、抑止 4（同じ） |
| 全テスト | exit 0、189 ファイル・2,944 件 PASS（今と同じ数）、79 秒 | exit 0、189 ファイル・2,944 件 PASS、84 秒 |
| `npm run verify` | exit 0、VERIFY PASSED 8/8（2m55s。unit 1m21s・unit-minpath 1m23s） | exit 0、VERIFY PASSED 8/8（3m41s。unit 1m33s・unit-minpath 1m55s） |
| `npm run verify:dist` | exit 0、VERIFY PASSED 8/8（2m55s。unit 1m27s・unit-minpath 1m18s） | exit 0、VERIFY PASSED 8/8（3m34s。unit 1m20s・unit-minpath 2m00s） |
| `npm pack --dry-run`（`dist/` を作る前） | 4 項目。差は `package.json` の 5 バイトだけ（配布物の中身は verify の package の check が確かめた） | 組 1 と同じ（4 項目、差は `package.json` の 5 バイト） |

- 組 2 の後の lock は、組 1 の後の lock と、ルートの項目（`devDependencies` の `@types/node` の範囲）・`@types/node`・undici-types の 3 つだけが違う【実測】。詳細は `deps-trial-r1.md`
- 時間（全テストの秒・verify の時間）は手元の負荷でゆれる（どの実行も始めは負荷のゲートを通したが、組 1 の `verify:dist` の途中で 1 分平均が 14.95 まで上がったのを見た）。判定には関係しない
- 変わった開発用の項目（組 1）: eslint 10.10.0→10.14.0、typescript-eslint 一式 8.70.1→8.72.1、vite 8.2.4→8.3.5 とその依存（rolldown 1.2.7→1.2.16 と各環境の binding、`@oxc-project/types`、postcss 8.5.28→8.5.32、nanoid 3.3.18→3.3.20）、`@types/node` 24.13.6→24.19.2 と undici-types 7.18.2→7.24.6、`ignore` 7.0.13→7.0.14
- vitest 5.0.5 の peer: `vite` は `^6.4.0 || ^7.0.0 || ^8.0.0`、`@types/node` は `^22.0.0 || >=24.0.0`【実測: `npm view`】。`npm ls` で vitest と `@vitest/mocker` は vite 8.3.5 を使う（重複なし）
- minimatch: 10.2.6 のまま（eslint 10.14.0 は `^10.2.6`、`@eslint/config-array` 0.23.5 は `^10.2.4`、`@typescript-eslint/typescript-estree` 8.72.1 は `^10.2.2`）。勧告 GHSA-g3hv-75wg-m249 の 10 件は消えない
- 適用先への影響: 無い見込み。再利用ワークフローは aiqh の依存を `npm ci --omit=dev` で入れる（`.github/workflows/verify.yml:107`）。lock の変更は `dev: true` の項目だけ

#### 2.5.2 範囲の書き方と lock

- `package.json` の範囲は `~`（npm が `--save-dev pkg@~x.y.z` をそのまま書いた【実測】）。lock のルートの `version` は npm が書いたまま（ADR-0008 の追記〈v0.17.1〉）
- 実装の段では、依存の commit を 1 つにし、lock の全欄の比べ（付録 A3 のスクリプト）を commit の前にもう一度行う

#### 2.5.3 `@types/node` 24.19.2 と、実行の Node 24.13.1 の差（B4-D-Q1）

- 自己 CI の Node は `ci.yml:38,67` の `"24.13.1"`、手元も v24.13.1【実測】。`engines` は `>=24.0.0`。再利用ワークフローの Node は適用先が `node-version` で決める（`verify.yml:12,81`。24 未満なら止める）
- 型が 24.19 になると、24.14〜24.19 で足された API を使うコードが型検査を通り、24.13.1 の実行で、テストの通る道でだけ落ちる。今のコードはそういう API を使っていない（組 1 でも型検査・全テスト・verify が同じ結果）
- **B4-D-Q1 = A で確定**（上げない。型は CI の Node の版を超えない、を ADR-0008 の追記に書く）。R1 の問い 2 も A を支持した
- **moderate 10 件を受け入れる理由と、CI での再確認**（R1 の問い 2 の付帯）: 10 件はすべて minimatch の GHSA-g3hv-75wg-m249（開発用の lint の系統。配布物の実行時の依存には入らない。依存元の最新版がまだ minimatch 10 系を求め、どの更新でも消えない）。自己 verify の dependency の check は `npm audit --audit-level=high`（moderate では落ちない）。各 commit の worktree の検証と、PR の run・main の run で、high 0 と moderate の件数を記録する。ADR-0008 の追記と CHANGELOG に書く
- ADR の置き場所: ADR-0008 の追記（`adr-0008-addendum-draft-final.md`）。ADR-0025 は変えない（Actions は更新が無い。着手前の見直しの結果〈更新なし〉は ci 手順書 §8-2 の記録と CHANGELOG に書く）

#### 2.5.4 lint の新しい指摘

- 組 1・組 2 とも 0 件（規則を緩める必要は無い）。実装の段で新しい指摘が出たら、規則を緩めて通さず、コードを直すか、依存の commit を外して止める（人間の判断）

### 2.6 最初のタグの作成（B4-Q8。R2 で、送った結果が分からないときを書き直した: B4-D-R1-003）

- 順序: v0.18.1 の PR に §2.2 の手順の docs（ci 手順書 §8）を入れる → merge → main の run が success → §2.2 の 1〜6 で `v0.18.1` を作る（`tag-protection` の下で最初の作成）
- 確かめ: §2.2 の 3（送る前）と 5（`git ls-remote`）、rule insights（`GET …/rulesets/rule-suites`）に `refs/tags/v0.18.1` の記録があるか（あれば結果）。記録が無くても、5 が合えば作成は通ったとする（rule insights にタグの push が載るかは未確認）
- **push が失敗した・時間切れになった・結果が分からないとき**: §2.2 の 6 のとおり、送り直さず、手元もリモートも変えずに止まる。`git ls-remote` の読み取りで「未作成」「正しく作成済み」「別の対象、または確認できない」のどれかを確かめて人間に知らせる。push の終了コードだけで「タグは無い」と決めない。v0.18.1 の版の commit は、タグの有無に関係なく main にある
- 記録（B4-D-Q13 = A）: v0.18.1 の後の記録の PR（docs だけ）で、ci 手順書 §3:100 の「新しいタグを作れることは、次の版のタグの push で確かめる」を「v0.18.1（日付）で確かめた」に、rule insights の結果、送る前の 3 の確かめの結果、v0.18.1 の SHA・CI を書く。止まった場合は、3 つの状態のどれだったかと、人間の決定を書く

### 2.7 v0.18.1 の commit の並び（案）

1. 依存（`package.json`・`package-lock.json`。組 2: eslint・typescript-eslint・vite）
2. golden fixture（tests だけ。`tests/report-golden*.ts` と `tests/fixtures/report-golden/`）
3. 文書（§2.1 の記録、§2.2 のタグの手順、§2.3 の注意、ADR-0003・ADR-0008・ADR-0028 の追記、`monitoring.md`、batch4 の設計の記録〈`docs/reviews/batch4-design/`〉、ROADMAP）
4. release の commit（`npm version 0.18.1 --no-git-tag-version`、CHANGELOG、README の状態の行）

各 commit は SHA 固定の worktree で typecheck・lint・全テスト・`npm run verify`（プロジェクトの規則）。プロジェクトの `CLAUDE.md`（追跡外）の手順 7 は、版の commit とは別に、同じ趣旨で直す。

## 3. v0.18.2（src を小さく変える）

### 3.1 C-44（`latest.md` のコマンドと作業ディレクトリ。B4-Q9）

1. **今**【実測: コードの読み】: `src/report/markdown.ts:63`（Checks の表の Command の列）は `` `${cell(c.command)}` ``、`:126`（失敗の詳細）は `` - Command: `${cell(c.command)}` (cwd: `${oneLine(c.cwd)}`) ``。1 つのバッククォートで包むので、バッククォートを含む値は code span をそこで閉じる（ADR-0028:174）。Summary の行（`:129`）だけは `codeSpan()`（`:172-178`）で包んでいる
2. **直し方**: 3 か所を `codeSpan()` で包む
   - 表のセル: `codeSpan(cell(c.command))`（先に `|` を `\|` にし、改行を空白にしてから包む。GFM の表のセルでは `\|` が `|` として描画される）
   - 失敗の詳細: `codeSpan(cell(c.command))` と `codeSpan(oneLine(c.cwd))`（B4-D-Q6 の A。`cell` のまま）
   - `codeSpan()` は、値がバッククォートで始まるか終わるとき、または空白で始まり空白で終わる（空白だけではない）とき、両端に空白を 1 つずつ足す（B4-D-Q5 の A）。空の値は空のまま（設定の `command` は空白だけを許さない: `src/config/schema.ts:25`。`cwd` は既定で `.`）
3. **変わる条件**【コードの読み】: 値にバッククォートがあるか、空白で始まり空白で終わる（空白だけではない）とき**だけ**、その行のバイト列が変わる。ほかの値（`|` を含む値を含む）は今と同じ。判定・終了コード・`latest.json`・端末の出力は変わらない
4. **golden での示し方**（R2）: v0.18.2 の C-44 の commit の差分に、`tests/fixtures/report-golden/` のうち `edge/latest.md` だけが現れ、その差は §2.4.3 の表の 10 行（Checks の表の 6 行と、失敗の詳細の `- Command:` の 4 行。書き込みの変換の後の `latest.md` で数えた）だけ。`plain/` の 2 つと `edge/latest.json` は差分に現れない（`git diff --stat` と、テストの比べの両方で）。`plain` が Checks の表・`- Command:`・`cwd:` の行を持つことは、入力の確かめ（§2.4.6 の (b)）が保証する
5. **描画の確かめ**（B4-D-Q7 = A）: 専用の確かめはしない。v0.18.2 の PR の run の Job Summary（aiqh 自身の `latest.md`）が今までと同じに見えることだけ、人が画面で見る
   - 注記（v0.18.2 の後の記録。設計の本文は変えていない）: 人は 2026-11-08 に、PR #31 の run 42352206921 の `reusable (self) / aiqh verify` の Summary を画面で見た。Summary・Categories・Checks・Parsed Output の表が崩れず、Command の列はコード表記で出ていた（aiqh 自身の check のコマンドにはバッククォートも両端の空白も無く、`cwd` も書いていないので、C-44 の前と同じ見た目になる場合）。この行を満たした
6. **テスト**（`tests/markdown.test.ts` か新しいファイル）: バッククォート 1 つ・連なり（2・3 個）・先頭・末尾・両端・`|` との組み合わせ（表のセルとリストの両方）・両端が空白・空白で始まるだけ（変わらない）・`cwd` のバッククォート。どれも、描画の規則（CommonMark 0.31.2 §6.1）で元の値に戻ることを、code span を外す小さな関数で確かめる【推定。関数は実装の段に作る】。R2: 組み合わせ（先頭がバッククォートで末尾が空白、`|` の直前・直後のバッククォート、3 つの連なりと `|`、両端の空白と `|`）も入れる（R1 の問い 4）
7. **ADR**: ADR-0028 の `:170-175` に注記（`adr-0028-addendum-draft-final.md` の (2)）。表の外の `- Command:` の行では `\|` のバックスラッシュが字のまま見える見込みを、既知の限界として明記する（B4-D-Q6 = A。R1 の問い 4）

### 3.2 1c（`--id-prefix` が `-R<数>` で終わるとき。B4-Q2、B4-D-Q8）

1. **今の振る舞い**【実測。付録 A4。使い捨ての `--cwd`】
   - 指摘 0 件の原文、`--id-prefix TRIAL-R1`: **exit 0**、`REVIEW LOOP: complete`、`REVIEW IMPORT: written`。`findings-r1.json` の `idPrefix` は `TRIAL-R1`
   - 指摘 1 件の原文（`batch3-design` の R2、ID `B3-D-R2-001`）、`--id-prefix B3-D-R2`: **exit 2**、`[id] findings[0].id is not of the form B3-D-R2-R2-NNN`、何も書かない。同じ原文を `B3-D` で: exit 0
   - 形の規則は `ID_PREFIX_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){0,7}$/`（`src/review/import.ts:32`）。`TRIAL-R1` も `B3-D-R2` も通る
   - 今ある 19 の接頭辞（`B1-D`・`B1-I132`・…・`M4-H`）に、`-R` と数字で終わるものは無い
2. **直し方**（B4-D-Q8 = A。B4-Q2 の決め直し）: `src/commands/review-import.ts:87` の使い方の検査に、`/-R\d+$/` に当たる接頭辞を使い方の誤り（exit 2。ADR-0021）として足す。文は `adr-0026-addendum-draft-final.md` の決定 1。`--help` の `--id-prefix` の説明に「`-R<round>` を含めない」を足す
3. **裏返し**: `-R` と数字で終わる接頭辞（例 `M2-R1`）は使えなくなる。`M2-2-RI` のような `-R` の後が数字でないものは通る（変異の表のとおり、`-R` だけで拒むと既存の `M2-2-RI` が落ちる）
4. **テスト**: `TRIAL-R1`・`B3-D-R12` を拒む（exit 2・何も書かない・文）、`M2-2-RI`・`B3-D`・`B20`・`R1`（先頭の `R1` は `-` の後ではない）を通す、`--help` の文
5. **互換性の変更として書く**（R1 の問い 7）: 今まで exit 0 だった入力（指摘 0 件で `-R<数>` で終わる接頭辞）が exit 2 になることを、ADR-0026 の追記・README の review-import の節・`--help` の `--id-prefix` の説明・CHANGELOG に書く

### 3.3 1a（round 1 の `previous`。B4-Q2、B4-D-Q9）

1. **今の振る舞い**【実測。付録 A4】（同じ 0 件の原文の JSON の `label` だけを変え、`previous` を足した写し）

   | 場合 | review-import | 書いたもの | 続く review-check |
   |---|---|---|---|
   | `previous` が無い | exit 0、`REVIEW LOOP: complete` | `findings-r1.json` | exit 0 |
   | `previous: []` | exit 0、`complete` | 同上 | exit 0 |
   | `previous` に別のラベルの ID（`B3-D-R2-001`） | **exit 0**、`REVIEW LOOP: unknown (aiqh review-check --label … shows why)` | `findings-r1.json`（`previous` をそのまま持つ） | **exit 2**、`[previous] findings-r1.json has 1 previous entry (there is no round 0)` |
   | `previous` にこの回の ID（`TRIAL-R1-001`） | exit 2、`[id-mention]` 2 件（JSON の指摘に無いこの回の ID） | 何も書かない | （ファイルが無い） |

   → 範囲の報告の推定（「import は通して、review-check が exit 2」）は、別のラベルの ID のときに当たっていた
2. **直し方**（B4-D-Q9 = A）: `src/review/import.ts` の原文の検査（`readReview` の問題の一覧）に、「`round` が 1 で `previous` が空でない」を種類 `previous` の問題として足す。ほかの形の問題と一緒に出し、何も書かない（exit 2）。`previous` が無い・空の配列は通す。round 2 以上は変えない
   - R2（R1 の問い 5）: `Problem` の種類の型（`src/review/import.ts:105`。今は `block`〜`entity` の 11 種）に `previous` を足し、CLI の問題の出力（`src/commands/review-import.ts:77`・`:167` の `[種類]` の一覧）に `[previous]` として出ることをテストで確かめる。検査は JSON の形の検査（schema）を通った後で、`round` が 1 かつ `previous` の長さが 0 より大きいときだけ
   - 同じ原文の再取り込み（`src/commands/review-import.ts:146-161`。SHA が同じなら `readReview` の前に exit 0、何も書かない）は変えない。この新しい検査は、過去に取り込んだファイルには当たらない（R1 の問い 5）
3. **既存の記録・テスト**【実測】: round 1 で `previous` を持つ findings のファイルは 0（27 ファイル）。テストで、round 1 に空でない `previous` を取り込んで通ることを期待するものは見当たらない（`tests/review-import.test.ts:191-200` の backlog-16-2-19 の 3 回は、round 1 の `previous` が `[]`）。review-check の `tests/review-check.test.ts:448-452`（R1 with previous entries）は変わらない
4. **裏返し**: 今まで取り込めた（が review-check で止まる）原文が、取り込みの時点で止まる。正しい使い方（round 1 で `previous` を書かない、round 2 以上で前の回の ID を書く）は止めない。別のラベルの評価を JSON で残したい使い方は、今もできない（review-import v3 の候補のまま）
5. **ADR と互換性の記録**: ADR-0026 の追記と ADR-0027:33 の注記（`adr-0026-addendum-draft-final.md`）。今まで exit 0 で書かれていた形（round 1 の空でない `previous`）が exit 2 になることを、README の review-import の節と CHANGELOG にも書く（R1 の問い 7）

### 3.4 変異の候補（各変更に、落ちるべきテストを対応させる）

| # | 変異 | 落ちるべきテスト |
|---|---|---|
| M1 | 表のセルを 1 つのバッククォートに戻す | C-44 の表のセルのテスト、golden の `edge/latest.md` |
| M2 | 失敗の詳細の `- Command:` を戻す | C-44 の失敗の詳細のテスト、golden の `edge` |
| M3 | `cwd:` を戻す | `cwd` のバッククォートのテスト、golden の `edge` |
| M4 | `codeSpan()` の区切りを「最も長い連なり」と同じ長さにする（+1 を外す） | 連なりのテスト（Summary の既存のテストも） |
| M5 | `codeSpan()` の空白を足す条件を外す | 先頭・末尾のバッククォート、両端が空白のテスト |
| M6 | 表のセルで `cell()` を外す（`\|` にしない） | `|` との組み合わせのテスト、golden の `plain`（`|` を含むコマンド） |
| M7 | 1c の検査を外す | 1c の拒む場合のテスト |
| M8 | 1c の正規表現を `/-R/`（数字なし）にする | `M2-2-RI` を通すテスト（既存の接頭辞） |
| M9 | 1c の正規表現から `$` を外す | `B3-D-R1X` のような途中の形を通すテスト（実装の段で決める） |
| M10 | 1a の検査を外す | 1a の拒む場合のテスト |
| M11 | 1a を round 2 以上にも当てる | round 2 の `previous` を通す既存のテスト（`tests/review-import.test.ts:191-200`） |
| M12 | 1a を「2 件以上」で止める（`> 1`） | 1 件の `previous` を拒むテスト |
| M13 | golden の描画を 1 文字変える（例 Summary の区切りの `·`） | golden の 4 つの比べ |
| M14 | golden の比べを、書かれたファイルではなく `renderMarkdown` の返り値にする（書き込みの変換を抜く） | `plain`・`edge` の `latest.md` の比べ（生の文字を含む stderr の行が、期待値の表記と合わない） |
| M15 | `plain` の入力から FAIL の check（または `.` でない `cwd`）を外し、期待値を作り直す | 入力の確かめ（§2.4.6 の (b)） |
| M16 | 1a の問題の種類を `previous` 以外にする | CLI の出力の `[previous]` を確かめるテスト |

### 3.5 v0.18.2 の commit の並び（案）

1. テストを先に（C-44・1a・1c。v0.18.1 の release の commit の SHA 固定の worktree で FAIL を記録する）
2. C-44（`src/report/markdown.ts` と、golden の `edge/latest.md`）
3. 1c・1a（`src/commands/review-import.ts`・`src/review/import.ts`、`--help` の文）
4. 文書（ADR-0026・0027・0028 の追記、`docs/ops/review-loop.md`、README）
5. release の commit

## 4. H11 の 5 回目（v0.18.2 の後。B4-Q6 = B）

1. **前もって読んだこと**【実測: 2026-11-07、`gh api` の GET で適用先の main の `aiqh.config.jsonc` を読んだ。書いていない】
   - 適用先 A（check 5 つ: typecheck・unit・build・security・dependency）、適用先 B（check 2 つ: unit・security）。どの check の `command` にも `cwd` にもバッククォートは無く、`|` も無い。両端が空白の値も無い。ファイルの中のバッククォート（A・B とも 4 つ）は注釈の中だけ
   - → v0.18.2 で、適用先の `latest.md` は v0.18.0 と同じバイト列になる見込み（時刻・時間・`runId`・commit・版の名前などの、run ごとに変わる値を除く）【推定】
2. **手順**: 適用先 A → B の順に、`quality.yml:14` の `uses:` を v0.18.2 の release の commit の SHA と `# v0.18.2` に上げる（1 行だけ）。PR の run が success になってから、merge は人間が GitHub の画面で行う。main の run の success を確かめる。適用先 A は main の merge で本番のデプロイが走るので、merge の前に人間の承認を取る（アプリとそのバックエンドには触らない。R1 の問い 6）
3. **比べること**（B4-D-Q15 の A）: 適用先の CI のログの verify の行を、v0.18.0 の回（A の main の run 41149756296、B の main の run 41149773836）と比べる
   - A: unit の下の `parsed: node-test — tests <n> (pass <n>, fail <n>); suites <n>` が、適用先の `npm test` の要約と一致する（件数は、その時点の適用先のテストの数）
   - B: `parsed: pytest — <n> passed, …` の行の形が同じ
   - 各 check の状態・終了コード・判定の行が同じ（時間を除く）。`aiqh --version` は 0.18.2
   - `latest.md` は適用先の CI では見えない（`job-summary` を使っていない）。同じ見込みは §4.1 のコードの読みと golden で示す
   - この比べは、出力の互換の**一部の根拠**で、`latest.md` のファイルが同じことを直接確かめるものではない。run ごとに変わる値（時刻・`runId`・commit・時間・tool の版）を含むレポート全体は、バイト単位では同じにならない（R1 の問い 6）
4. **記録の順番**: H11 を先に済ませ、v0.18.2 の記録の PR に H11 の 5 回目の結果を入れる（batch3 と同じ）
5. **反映の前に必ず**: 適用先の設定をもう一度読む（GET。R1 の問い 6）。バッククォート・両端の空白を含む値が増えていたら、変わる行を予測し直してから進める

## 5. 受け入れの基準（R2 で v0.18.1 の 2・3・5 と v0.18.2 の 2・3・6 を直した）

### v0.18.1
1. 各 commit を SHA 固定の worktree で検証して、typecheck・lint・全テスト・`npm run verify`（8/8）が通る。HEAD で `npm run verify:dist` も通る
2. golden: **使い捨ての場所で `writeReports` が書いたファイル**の 4 つの比べ（と、history のファイルが `latest.json` と同じ）、入力の確かめ（§2.4.6 の (b)）、期待値の中身の確かめ（(c)）が通る。変異 M13〜M15 で落ちる。期待値を作った commit の PR の本文に、人が差分を読んだ記録がある
   - 注記（v0.18.1 の後の記録。人間の決定 2026-11-07。設計の本文は変えていない）: この基準と §2.4.5 の「人が差分を読んだ」記録は、「人、または人が結果を確かめた独立レビューで、期待値の中身を読んだ記録」と読む（ADR-0003 の追記〈v0.18.1〉の決定 5 の注記）。v0.18.1 の期待値は、実装の独立レビュー batch4-v0181-impl R1 の問い 4（レビュアーが 4 つの期待値のファイルを開き、入力と照らした節）を人が読んで確かめ、v0.18.1 の後の記録の PR の本文に書いた（期待値を作った PR #29 の本文は書き換えていない）。v0.18.2 の期待値の差分（v0.18.2 の 2）も、実装の独立レビュー batch4-v0182-impl R1 で差分を読む独立した節を頼み、その節を人が読んで確かめる
3. 依存（組 2: eslint・typescript-eslint・vite）: `npm audit --audit-level=high` が 0、moderate の件数が 10 のまま（受け入れる理由を ADR-0008 の追記と CHANGELOG に書き、各 commit の検証・PR の run・main の run で件数を記録する）。lock の全欄の比べで、変わるのは開発用の項目の版だけ（実行時の依存の項目は同じ）。lint の新しい指摘 0。`@types/node` は 24.13.6 のまま
4. PR の run と、merge の後の main の run で、必須の 2 つが success
5. `v0.18.1` のタグを §2.2 の手順で作る: 送る前の 3 の確かめ（手元だけのタグの名前の集合、送る対象の 5 点）がすべて合う。送った後の `git ls-remote` で、タグの object と `^{}` の commit が 3 で記録した値と合う。push の結果が不確定なら、§2.2 の 6 の 3 つの状態のどれかを確かめて記録し、止まる
6. §2.1 の記録が入る（ADR-0028 の注記、ci 手順書 §3 と ROADMAP の M3 の行の run 番号、C-06、rule insights、monitoring の 2.6）

### v0.18.2
1. テストを先に書き、v0.18.1 の release の commit の worktree で C-44・1a・1c のテストが FAIL、直した後に PASS
2. golden: `plain/` の 2 つと `edge/latest.json` が差分に出ない。`edge/latest.md` の差が §2.4.3 の表の 10 行だけ
   - 注記（v0.18.2 の後の記録。人間の決定 2026-11-08。設計の本文は変えていない）: 差は §2.4.3 の 10 行だけだった。人の確認は、実装の独立レビュー batch4-v0182-impl R1 の問い 2（差分を入力と照らした独立した節）を人が読んで確かめた（v0.18.1 の 2 の注記と同じ形。v0.18.2 の後の記録の PR の本文に書いた。期待値を変えた PR #31 の本文は書き換えていない）
3. 変異 M1〜M12・M16 がそれぞれ落ちる
4. 1a・1c: §3.2・§3.3 の実測の表の各場合が、決めた終了コードと文になる。1a の問題が CLI の出力に `[previous]` として出る。同じ原文の再取り込みは、今までどおり exit 0 で何も書かない。今ある 19 ラベルの `aiqh review-check` の結果は変わらない
5. v0.18.1 と同じ 1・4 の検証
6. 互換性の変更（1a・1c が今通る入力を拒む）が、ADR-0026 の追記・README・CHANGELOG（1c は `--help` の説明も）に書かれている

### H11 の 5 回目
1. 反映の前に、適用先 A・B の設定をもう一度読み（GET）、§4.1 の前提（`command`・`cwd` にバッククォートと両端の空白が無い）が変わっていないことを確かめる
2. 適用先 A・B の PR の run と main の run が success。変えたのは `uses:` の 1 行だけ。適用先 A の merge の前に人間の承認がある
3. §4.3 の比べで、verify の行が v0.18.0 の回と同じ（時間・版を除く）。A の `parsed: node-test` の件数が適用先の要約と一致する（これは出力の互換の一部の根拠で、`latest.md` の一致の直接の確かめではない）
   - 注記（v0.18.2 の後の記録。設計の本文は変えていない）: 各 check の名前・コマンド・状態・判定の行と、A の `parsed: node-test`・B の `parsed: pytest` の行は、v0.18.0 の回と同じだった（A の件数は v0.18.0 の回と同じ 113。その回に適用先の要約と一致し、その後、適用先 A の main で変わったのは呼び出しの 1 行だけ）。違ったのは、`git:` の行（run ごとに変わる値）と、**適用先 A の dependency の check の `parsed: npm-audit` の件数の行**（同じ lock で起きた。aiqh の変更ではない。ROADMAP の v0.18.2 の項）

## 6. 既存のテストの期待値が変わるもの

- v0.18.1: 無い（tests は足すだけ。依存の試しの組 1・組 2 で、全テスト 2,944 件が同じ結果）
- v0.18.2【推定】: C-44 で `tests/markdown.test.ts` の、コマンドを 1 つのバッククォートで包む形を期待する行があれば変わる（`npm test | tee log` などバッククォートの無い値は変わらない）。1c で `--help` の文を比べるテストがあれば変わる（`tests/cli-review-import.test.ts:38` は名前の有無だけ）。実装の段で全テストを走らせて一覧にする

## 7. 却下した案（batch4 の範囲外）

範囲の報告 §6 の大案の候補は、すべて batch4 の範囲外（人間の決定）: review-import v3（状態を変えるコマンド・判定表の生成・label をまたぐ `previous`。B4-Q2）、項目 56（runner で要約の組を数える。B4-Q3）、53-G（B4-Q11）、C-57（Job Summary をログにも出す。B4-Q10）、C-07 の残り・C-51・C-19 の調べ（別の依頼。B4-Q12）、C-08 のパケットの仕組み（M の案。S の運用だけを v0.18.1 で）。

この設計の中で採らなかった案（理由は `questions-final.md`）:
- golden を `aiqh verify` の通しの出力で、揺れる値を置き換えて固める案（B4-D-Q2 の B）
- 期待値を書き出す道具・vitest の snapshot（B4-D-Q3 の B・C）
- C-44 で、表の外の行の `|` を `\|` にしない直し（B4-D-Q6 の B。B4-Q9 の条件を超える）
- 1c を文だけ直す案（B4-D-Q8 の B。指摘 0 件の誤りが残る）
- golden を `renderMarkdown` と `jsonForFile` の返り値で比べる案（R1 の形。書き込みの変換を固められない。B4-D-R1-001）
- `git tag --no-contains origin/main` で手元だけのタグを見る案（R1 の形。手元の HEAD に誤って付けたタグを外す。B4-D-R1-002）
- push が断られたら「タグはできない」と決める案（R1 の形。応答だけが失われる場合がある。B4-D-R1-003）

## 8. 確かめていないこと

- C-44 の実際の描画（GitHub・エディタ）。表の外の `\|` の見え方（推定）
- 1a・1c の直した後の振る舞い（実装していない。今の振る舞いだけを測った）
- golden の試し（付録 A6）は、基準のコードで書いた出力を数えただけ。C-44 の直しを入れた後の出力は作っていない（変わる 10 行は、変わる条件から数えた）。試しの `plain` は 2 つの check の簡単な形で、§2.4.3 の `plain` の入力のすべては作っていない
- rule insights にタグの push が載るか（§2.6）
- `tag-protection` の下でタグを作れること、断られたときのエラーの形、push の応答が失われる場合の実際の出方
- 適用先の run に、どちらのリポジトリの `sha_pinning_required` が当たるか
- 適用先の H11 の時点の設定（§4.5。反映の前に読み直す）
- `@types/node` 24.14〜24.19 で足された API の一覧（型の差は読んでいない。B4-D-Q1 は「新しい API を型で許すかどうか」の向きで決めた）
- 外部の文書（Node・GitHub・CommonMark・GFM）は、この段では通信して読んでいない（CommonMark 0.31.2 §6.1 は、v0.8.1 の ADR-0028 の追記で引いた版の記述に依る。`git ls-remote --refs`・`git tag --no-contains` の意味は、手元の git 2.50.1 の実測に依る）
- 依存の試しは手元の macOS だけ（Ubuntu の CI では、実装の版の PR の run で確かめる）

## 付録 A. この段の測り方（どれも commit しない。作業の記録は git 管理外の作業の場所）

- A1（§0）: `git fetch origin --tags --prune` の後、`git rev-parse`・`git status --short`・`gh pr list`・`gh api …/rulesets`・`…/actions/permissions`・適用先の `quality.yml` の `uses:` の行（GET）
- A2（§2.1.6）: 設計の段（batch3）に取った適用先 A の `npm test` の stdout を読み直し、バイト・UTF-16 の単位・行・テストごとの時間の値の数と桁を数えた（中身は写さない）
- A3（§2.5）: 基準の commit に `git worktree add --detach`、`node_modules` は本体の APFS の複製（`cp -c -R`）。前の `package.json`・lock・`npm ls --depth=0`・`npm pack --dry-run --json` を保存、`npm install --save-dev …`、後の写しと `git diff --stat`、lock の全欄の比べ（項目ごとの版・ほかの欄・追加・削除・ルート・`dev` と `optional` の印・実行時の依存の項目）、`npm ls --all`、`npm audit`（high と moderate の JSON）、typecheck、lint（テキストと JSON）、負荷のゲートの後に全テスト・`npm run verify`・`npm run verify:dist`。片づけは `git restore --source=HEAD -- package.json package-lock.json` と `git worktree remove`（`--force` なし）。npm の cache と log は作業の場所
- A4（§3.2・§3.3）: 0 件のレビューの原文（`docs/reviews/batch3-v0171-impl/review-r1.md`）の写しの JSON の `label` を変え、`previous` を足した写しを作った。使い捨ての `--cwd`（それぞれ `docs/reviews/` だけを持つ空の場所。git のリポジトリではない）で `node src/cli.ts review-import <原文の絶対パス> --label trial-a --round 1 --id-prefix TRIAL --cwd <場所>` と `review-check`。1c は同じ原文を `--id-prefix TRIAL-R1` で、指摘のある原文は `docs/reviews/batch3-design/review-r2.md` を `--round 2 --allow-missing-previous` と `B3-D-R2`・`B3-D` で
- A6（§2.4。R2）: 使い捨ての場所（作業の場所の下）で、一回きりのスクリプト（commit しない。中身は `golden-probe-r2.md`）が、基準のコードの `buildReport`・`writeReports`・`renderMarkdown`・`jsonForFile` を読み込み、試しの `plain`（2 つの check）と `edge`（§2.4.3 の表の 8 つ）を書いた。生の文字（ESC・U+202E）は実行時に組み立てた。`renderMarkdown` の返り値と書かれた `latest.md` の行ごとの違い、書かれたファイルに残る生の文字の数、`latest.json` と `jsonForFile` の返り値に改行を足したものの一致、history のファイルと `latest.json` の一致、C-44 で変わる条件に当たる行の数を出した
- A7（§2.2。R2）: 読むだけで、`git tag -l 'v*' --no-contains origin/main`・`--contains`・`--merged`・`--no-merged` の数、`git merge-base --is-ancestor v0.18.0 origin/main`、`git for-each-ref --no-contains origin/main`・`--contains origin/main` を `refs/remotes/origin/main` と `refs/heads/main` に当てた結果、`git ls-remote --tags --refs origin 'refs/tags/v*'` と `--refs` 無しの行の数、手元の `refs/tags/v*` との名前の集合の比べ。タグは作っていない（手元にも）
- A5（§4.1）: `gh api -H 'Accept: application/vnd.github.raw' repos/<owner>/<適用先>/contents/aiqh.config.jsonc?ref=main` を読み、`jsonc-parser` で check ごとの `command`・`cwd` のバッククォート・`|`・両端の空白を数えた（中身は写さない）

## 付録 B. 文案（実装の版で直す）

### B.1 ci 手順書 §8 の手順 7（と `CLAUDE.md` の手順 7。R2 で 3・5・6 を書き直した）

> 7. 手元の main を fast-forward し（`git switch main && git merge --ff-only origin/main`）、版を出すときは、release の commit（branch の commit。merge の後も main の履歴に残る）に注釈付きタグを付けて送る。タグは ruleset `tag-protection`（§3）により、送った後は消せず、付け替えられない。次の順で一続きに行う
>    1. 指す commit を確かめる: release の commit の 40 桁の SHA（merge で `--match-head-commit` に渡した SHA）を `<SHA>` とする。`git log -1 --format=%s <SHA>` が release の commit のメッセージ、`git merge-base --is-ancestor <SHA> origin/main` が 0
>    2. 付ける: `git tag -a vX.Y.Z <SHA> -m "vX.Y.Z: <要約>"`（SHA を明示する。HEAD は merge の commit なので HEAD に付けない）
>    3. 送る前に確かめる:
>       - 手元だけのタグ: `git for-each-ref --format='%(refname)' 'refs/tags/v*'` と `git ls-remote --tags --refs origin 'refs/tags/v*'` の ref の名前を集合として比べ、手元にだけあるのが `refs/tags/vX.Y.Z` の 1 つだけ（`--refs` は剥がした行〈`^{}`〉を出さない。`git tag --no-contains origin/main` では見分けられないので使わない）
>       - 送る対象: 完全な ref の名前が `refs/tags/vX.Y.Z`、`git cat-file -t refs/tags/vX.Y.Z` が `tag`、タグの object の SHA（`git rev-parse refs/tags/vX.Y.Z`）を書き留める、`git rev-parse 'refs/tags/vX.Y.Z^{commit}'` が `<SHA>`、`git ls-remote --tags origin refs/tags/vX.Y.Z` が空（リモートに同じ名前が無い）
>    4. 送る: `git push origin refs/tags/vX.Y.Z`（このタグ 1 つだけを完全な名前で）。`git push --tags`・`--follow-tags`・`--mirror` は使わない（手元の別の `v*` のタグも送られ、作ることは止められないので、消せないまま残る）
>    5. 送った後に確かめる: `git ls-remote --tags origin refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'` の 2 行が、3 で書き留めたタグの object の SHA と `<SHA>`
>    6. 送るのが失敗した・時間切れになった・結果が分からないときは、送り直さず、手元もリモートも変えずに止まる（言い換えて送り直さない）。読み取りだけの `git ls-remote --tags origin refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'` で、**未作成**（同じ名前が無い）・**正しく作成済み**（2 行が 3 で書き留めた値と同じ）・**別の対象、または確認できない**（値が違う、`ls-remote` が失敗した）のどれかを確かめて、人間に知らせる。終了コードだけで「タグは無い」と決めない。ruleset を無効にするか・どうするかは人間が決める
>    - 送る前に誤りに気づいたら: 手元のタグを付け直すには `git tag -d vX.Y.Z` が要る。削除の操作なので、人間の確認を取ってから
>    - 送った後に誤りに気づいたら: 直せない。次の版を出す

### B.2 `docs/ops/review-loop.md` の手順 4 と「止まったときの対処」、ひな形の「使い方」に足す箇条

> - `--cwd` には `docs/reviews/` が要る（無いと `[repository]` で exit 2。サブディレクトリで走らせて別の場所に書くのを防ぐ。ADR-0026）。原文を相対パスで書くと `--cwd` を基準に解くので、受け取ったファイルは絶対パスで渡す
> - `--id-prefix` は ID の `-R<回>` より前の部分（ID が `B3-D-R1-001` なら `B3-D`）。v0.18.1 までは、指摘が 0 件の回は誤った接頭辞でも取り込まれる（v0.18.2 から止まる）
> - round 1 の依頼では、JSON に `previous` を書かないよう頼む。別のラベル（設計のレビュー）の指摘の評価は、問いの答え（本文）に書いてもらう
> - レビュアーはコードもテストも走らせない。実装者の確かめ（各 commit の検証の結果、直す前の FAIL、変異の結果）は、数・名前・終了コードを依頼文に書く（生のログはパケットに入らない。色の ESC などの生の制御文字は書かない）

### B.3 `docs/ops/monitoring.md` に足す節と表の行

> ### 2.6 node:test の件数が出ない（`output-truncated`）
>
> - node:test の check（`parsed` の `tool` が `node-test`）で、端末と `latest.md` に件数が出ず、理由が `output-truncated` のとき: stdout が読む窓（末尾 1,048,576 UTF-16 単位）より長かったか、runner が先頭を捨てた（ADR-0028 の決定 14）。判定・終了コードには影響しない
> - 見張りの条件（ROADMAP の項目 56）: `output-truncated` が出たら、項目 56（runner が stdout を流しながら要約の組を数える案）を選び直す。テストの出力（`console.log` など）を減らすのは、適用先の判断
>
> | node:test の check の `parsed` が `output-truncated` | 判定には影響しない。ROADMAP の項目 56 を選び直す（記録して計画に入れる） |
