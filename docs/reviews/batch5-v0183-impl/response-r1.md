# batch5-v0183-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.18.3 の後の記録

- 対象レビュー: `docs/reviews/batch5-v0183-impl/review-r1.md`（受領ファイル名 `independent-review-batch5-v0183-impl-r1-for-claude.md`、2026-11-14 15:16 受領、23,938 バイト、SHA-256 `15210b8ec09cd2a3138c4b1f9aae68ba0aa26a87457ee09dbac6b2d4cc42835a`、
  LF 169 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 末尾に改行あり / 生の文字〈層 (c) を含む〉なし / 文字参照と HTML のタグ・コメントなし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- **受け取り方**: ファイルのダウンロードで保存された（受領ファイルにブラウザのダウンロードの拡張属性があった）
- 対象: v0.18.3（batch5 の 1 版目。src を変えない: 開発用の依存と ADR-0008 の追記）。範囲 `ab524e6bac26f6604162f48ffa8c54b63e1b024c..96b87ebf5894d3a7f5b4d7c26cad80e425e0f6ce`（3 commit と PR #34 の merge の commit、変わったファイル 7 個）。範囲の外で、先に入れた版なしの batch5 の記録の PR #33 の 2 commit（`f901670`・`c80374d`）も対象にした
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-batch5-v0183-impl-r1.zip`（1,309,680 バイト、SHA-256 `342c61da6e66328f57c180668e19c4e0877593c2bad4e53d329d00f76ca40740`。中は `review-packet-batch5-v0183-impl-r1.md` の 1 ファイル、1,309,508 バイト、SHA-256 `ab0bc1d85770ca80cd6b77c93dc0e8711b58e615250ba3dcd9fbd3c8d81274c2`）と、同じ md 本体（ZIP の中の md と同じバイト列）
  - 依頼文 `review-request-batch5-v0183-impl-r1.md`（72,455 バイト、SHA-256 `373fc8711362b9f7dc982a169c48ac739a2fe214510c8c411a31673fe45024c5`。問いは 8。パケットの中にバイト単位で同一で 1 回入っている）
- **レビュアーが読んだもの**: 添付の ZIP を展開でき、md 本体とバイト一致と書いた（原文が書く SHA-256 は、上の md 本体の値と同じ）。パケットの依頼文・D1〜D13・匿名化の 27 行の比べ・差分・変わったファイルの全文・文書の節、公開リポジトリの固定の commit（release の commit `d5e5ff6` ほか）のファイル、公開の Actions の 2 つの run の成功表示を読んだ（原文の「確認範囲」）
- 対応日: 2026-11-14
- 結果（レビュアー）: **High 0 / Medium 1 / Low 2**（B5-I183-R1-001〜003）。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に**達していない**（Medium 1）。人間の決定（2026-11-14）で、3 件をこの記録の PR で直し、**R2 を頼む**（この記録の PR の merge の後に、実装 R2 の依頼を用意する）
- **判定: 3 件とも VALID。この記録の PR で直して `resolved`**（人間の決定 2026-11-14）
- **`aiqh review-import` でそのまま取り込めた**: この記録の branch で `aiqh review-import <受領ファイルの絶対パス> --label batch5-v0183-impl --round 1 --id-prefix B5-I183`（aiqh は 0.18.3。取り込みの前に、作業の場所に `docs/reviews/` があり、`docs/reviews/batch5-v0183-impl/` がまだ無いことを確かめた）。exit 0、`High 0 / Medium 1 / Low 2; open 3`、最後の 2 行は `REVIEW LOOP: incomplete (open 3)` と `REVIEW IMPORT: written`。`previous` は空（label `batch5-v0183-impl` の 1 回目。batch5-design の指摘の扱いは、問い 6 の本文に書いてもらった）

## 判定表

| ID | 重要度 | 判定 | 対応（人間の決定 2026-11-14） | fixedIn |
|---|---|---|---|---|
| B5-I183-R1-001（D3 は lock の変更を版と `resolved`・`integrity` に限るが、開発用の 3 項目の依存の範囲の欄も変わり、例外の承認が無いまま完了扱い） | Medium | VALID | **D3 の例外を承認し、決まりに書き足した**（ADR-0008 の追記〈v0.18.3〉の注記の 1）。今後の D3: lock で変わってよいのは、(1) 版の変わった開発用の項目の `version`・`resolved`・`integrity`、(2) その同じ項目が宣言する依存の範囲の欄。(2) の変更は全部を列挙して記録し、PR の本文に書く。それ以外は停止して人が決める。v0.18.3 の (2) の変更の全列挙（9 個。vitest 6・`@vitest/mocker` 1・vite 2）、(1) だけが変わった 2 項目（`@vitest/spy`・magic-string）、lock の根の 2 つの事実（根の `devDependencies` の vitest は `package.json` の範囲の写し、根の `version` は release の commit で npm が書く）を同じ注記に入れた。v0.18.3 の履歴と設計〈最終〉の本文は書き換えていない（読み替えは `docs/reviews/batch5-design/decisions-20261114.md`） | この記録の PR の 1 つ目の commit |
| B5-I183-R1-002（決定 5 の停止の条件が「registry の値から決まらないとき」だけで、選べる版が非推奨・撤回・重大な勧告付きの場合が抜ける。予防的） | Low | VALID | **足した**（注記の 2）。選ぶ版について、着手時に (a) 非推奨の印、(b) tarball が取れること、(c) その版に当たる勧告を確かめる。非推奨・撤回・重大な安全上の警告があれば、7 日の条件を迂回せず、試しの前に止めて人が選び直す。取れない場合と、取れるが非推奨の場合を分けて記録する。v0.18.3 で選んだ vitest 5.1.0・vite 8.3.6 の今の読み（2026-11-14）: どちらも `npm view … deprecated` の出力が空（非推奨の印なし）、版は取れる。既知の限界に、確かめが着手時と後の 2 点だけであることを足した | この記録の PR の 1 つ目の commit |
| B5-I183-R1-003（置き換えの後の 4 行で、括弧の連続・山括弧の入れ子・助詞の前の空白が読みにくい） | Low | VALID | **指摘の 4 行を直した**（下の表）。レビュアーの修正案の例に沿い、識別子は再掲していない。置き換えの 27 行のうち、ほかの行は変えていない。レビュアーは「別の文書改善 PR で人間の承認を得て」と書いたが、人間の決定で、docs だけの、この記録の PR の別の commit で直した | この記録の PR の 2 つ目の commit |

40 桁の `fixedIn` は `findings-r1.json`。

### B5-I183-R1-003 の 4 行の前と後（変わった所の前後だけを抜き出した）

| 行 | 前 | 後 |
|---|---|---|
| `README.md:50`（山括弧の入れ子） | 「v0.9.1 で波 4 を締めた（個人のリポジトリ 2 つ〈適用先 A〈node:test〉のリポジトリ・適用先 B〈pytest〉のリポジトリ〉の CI に、再利用ワークフロー …」 | 「v0.9.1 で波 4 を締めた（適用先 A〈node:test〉と適用先 B〈pytest〉の 2 つの個人のリポジトリの CI に、再利用ワークフロー …」 |
| `docs/ROADMAP.md:83`（括弧の連続。行の全文） | 「- 適用先 A（node:test）（React + TypeScript + Vite）と 適用先 B（pytest）（Python + FastAPI）への適用」 | 「- 適用先 A（React + TypeScript + Vite、テスト: node:test）と適用先 B（Python + FastAPI、テスト: pytest）への適用」 |
| `docs/ROADMAP.md:883`（助詞の前の空白） | 「…（適用先 A〈node:test〉のリポジトリ では、unit のチェック …」 | 「…（適用先 A〈node:test〉のリポジトリでは、unit のチェック …」 |
| `docs/adr/0031-ci-distribution-reusable-workflow-own-source.md:85`（助詞の前の空白。2 か所） | 「- run: 適用先 A（node:test） の PR #2 の …、適用先 B（pytest） の PR #1 の …」 | 「- run: 適用先 A（node:test）の PR #2 の …、適用先 B（pytest）の PR #1 の …」 |

確かめ: 直しの commit の `git diff -U0` は 3 ファイル・4 つの hunk で、どれも 1 行を 1 行に替えたもの。

## R1 の問い 8 の改善の提案への対応

- 提案（問い 8 の決定 2）: 件数に加えて、`npm audit --json` の勧告の ID・パッケージ・重さの集合の差を確かめ、新しい moderate を人間の判断の対象にする
- 対応（人間の決定 2026-11-14）: **足した**（ADR-0008 の追記の注記の 3。この記録の PR の 1 つ目の commit）。件数に加えて、勧告の集合を着手時と後で比べ、件数が同じでも新しい勧告が現れたら人の判断の対象にする（high・critical は従来どおり 0）。今の main（`96b87eb`）の勧告の集合（2026-11-14）は `GHSA-g3hv-75wg-m249`・minimatch・moderate の 1 つ（件数は moderate 9・high 0・critical 0）。既知の限界の「件数だけでは見分けない」の行を、この比べを足したことに合わせて直した
- findings の外の提案なので、findings には載せていない（B5-I183-R1-002 の `note` から、ここを指す）

## 「指摘なし」の問いに付いた注意の扱い

- 問い 6（findings の遷移）: 「`fixedIn` は、必要な直しが実在する commit を説明とともに指定し、両方を ADR の commit へ機械的に割り当てない」の勧め → **そのとおりにした**。B5-D-R1-001・B5-D-R2-001 を、この記録の PR で `resolved` にし、`fixedIn` は、どちらも指摘の中心の直しが入った commit `c80374d`（PR #33 の 2 つ目。設計〈最終〉と最終の文案）にした。ほかの commit にある直し（ADR-0001 の (2) と ci 手順書は `f901670`、ADR-0008 の追記の決定 3・4 は `e836444`、D13 の実地は `40317d9`、その記録は release の `d5e5ff6`）は、それぞれの `note` に書いた
- 問い 1（D1〜D13）・問い 3・問い 5・問い 7 の範囲の注記（D5〜D7・D9〜D13 の `npm ls` などは実装者の記録への依拠、golden の 4 つの期待値の前後の全バイトと完全な SHA-256 は再計算していない、PR #33 の匿名化の前の差分が無いので正規化の対応の完全性と元の単位は独立に再検算できない、古い側の元の固有名との直接の比べは対象外、CI の run のテスト数や詳細のログ・タグの送信の生ログ・rule insights は独立に取っていない）: **そのまま受け取った**（既知の残余。新しい指摘ではない）
- 問い 7 の「CHANGELOG の v0.18.3 の見出しを release の commit に移したのは適切な補正」: 記録として受け取った（直すものは無い）

## レビュアーの判定の要約（実装者の評価ではない）

問い 1〜8 は、上の 3 件（問い 1・7 の D3 → R1-001、問い 8 → R1-002、問い 3(c) → R1-003）のほかは、どれも新しい指摘なし。要点:

- 問い 1（D1〜D13）: D3 のほかに、記録と確かめられた差分の間で完了条件を否定する事実は無い。D13 は、公開の固定版の lock と `package.json` の 4 つの値を直接読んで一致を確かめた（3 か所の `npm ls` は記録への依拠）。D9 の試しの作業ツリーだけの `(dirty)` は、出力の互換の失敗に数えない
- 問い 2（ADR-0008 と最終の文案）: 差は依頼文の書き直しの表に対応するものに収まり、時制の取り違えも無い
- 問い 3(a)(b)（置き換えの完全性・行数）: 27 行・10 ファイル、名前の単位 44 個とメールの単位 1 個、27/27 の一致、既存の行の変更 30 行の読みに矛盾は無い
- 問い 4（記録の PR と最終の文案）: 言い換え 6 か所は実際の commit の時点に合わせたもので、内容の判断は変えていない
- 問い 5（11 ファイルと 10 ファイル）: `split-note.md` と CHANGELOG で差を明記し、設計の正本を変えずに残した扱いを支持する
- 問い 6: 上の節
- 問い 7（設計との食い違い・文書・タグ）: CHANGELOG・ROADMAP・README の v0.18.3 の記載は時制に合う。PR #34 と main の Actions の公開のページで、必須の 2 つの success を確かめた。タグの手順の報告は ci 手順書 §8 の手順 7 と合う
- 問い 8（決定 1・2）: 決定 1 は基本的に妥当（主な守りは弱まっていない）。決定 2 も妥当だが、件数は同一性の確かめとして十分でない（上の改善の提案）。手続きは条件付きで妥当で、D3 の例外にも同じ水準の明示の承認と記録が要る（→ R1-001）

## レビュアーが独立に確かめられなかったもの（既知の残余として受け入れた。新しい指摘ではない）

| 確かめていないもの | 実装者の側の記録 |
|---|---|
| PR #33 の匿名化の前の差分、元の固有名とメールの値の対応（依頼で対象外） | `docs/reviews/batch5-design/split-note.md` の「置き換えの確かめ」1〜6 |
| 依存の試し・各 SHA 固定の worktree・`npm ls`・audit・テスト・`npm run verify` の生ログ | CHANGELOG・ROADMAP の v0.18.3 の項（D1〜D13、各 commit の検証） |
| タグの push の生ログ、rule insights | ci 手順書 §3 の「確かめたこと（v0.18.3）」と ROADMAP の v0.18.3 の項（この記録の PR） |
| golden の 4 ファイルの前後の完全なバイト列と完全な SHA-256 | v0.18.3 の D8（全テストの golden のテストが PASS、`git diff --stat -- tests/fixtures/` が空） |
| 非公開の適用先 A・B、追跡外の `CLAUDE.md`、PR #33 の既存のレビューの原文と当時の本文のバイト同一性、`tag-protection` の実地の拒否の試し | 適用先への反映（H11）は v0.18.3 では行っていない。拒否の試しは行わないと決めた（ci 手順書 §3 の注記〈batch5 の記録の PR〉） |

## 取り込みと review-check

- `aiqh review-import`（0.18.3）: `findings-r1.json`（3 件、`open`）。exit 0、`REVIEW IMPORT: written`
- 3 件を `resolved` にした（`verdict` VALID、`fixedIn` は直しの commit、`destination` は「v0.18.3 の後の記録の PR」）。レビュアーの 8 項目と `source` は直していない
- `aiqh review-check --label batch5-v0183-impl`: R1 は open 0・resolved 3、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）。**これはすべての回に `open` が無いという表示で、終える基準（High 0・Medium 0）とは別**。R1 は Medium 1 なので、人間の決定のとおり R2 を頼む
- batch5-design: B5-D-R1-001（`findings-r1.json`）と B5-D-R2-001（`findings-r2.json`）を `deferred` から `resolved` にした（上の問い 6 の節）。ほかの finding は変えていない。`aiqh review-check --label batch5-design` は `REVIEW LOOP: complete`（open 0、警告 0）・`REVIEW CHECK: passed`
