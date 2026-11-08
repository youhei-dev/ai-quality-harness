# batch5-design の独立レビュー 1 回目への応答（response-r1）— 設計 R2

- 状態: 確定（batch5 の記録の PR〈版なし。2026-11-08。branch `docs/batch5-design-record`〉の設計の記録の commit で、`docs/reviews/batch5-design/` に、取り込みの結果とともに入れた。設計の段では R2 の添付。人間の決定 2026-11-08 の分け直しで、v0.18.3 の実装の段ではなく、この記録の PR で取り込んだ: `split-note.md`）
- 取り込み: `aiqh review-import ~/Downloads/independent-review-batch5-design-r1-for-claude.md --label batch5-design --round 1 --id-prefix B5-D`（記録の PR の branch の CLI。src は v0.18.2 と同じ）。exit 0、`findings-r1.json` に 2 件（open）。同じ commit で、B5-D-R1-002 を resolved、B5-D-R1-001 を v0.18.3 への deferred にした（下の「状態」）
- 受け取った原文: `independent-review-batch5-design-r1-for-claude.md`（18,063 バイト・122 行、SHA-256 `b7992dffbadfad5536af5b5f1da50e869718be936a8c3100c2c2e209f8c0cec9`）。同じ名前の別のファイル（`(1)` など）は無かった。このファイルは、ChatGPT の画面の本文を人が claude.ai に貼り、claude.ai の側で作った写しの見込みで、**ChatGPT の原文と同じかは確かめられない**（依頼文で頼んだ本文の最後の `~~~~markdown` のブロックも無い）
- JSON のブロック（読むだけ。取り込みはしていない。作業の場所の写しで読んだ）: `aiqh-findings` のブロックは 1 つ、`schemaVersion` 1、`label` は `batch5-design`、`round` は 1、`summary` は High 0・Medium 2・Low 0、指摘 2 件（`B5-D-R1-001`・`B5-D-R1-002`。どちらも Medium・設計・確認済み）、件数の行（`件数: High 0 / Medium 2 / Low 0`）と合う、`previous` は無い。生の制御文字・方向の制御・ゼロ幅の文字は 0
- レビュアーが読んだもの（原文の「実際に読めた範囲」）: ZIP は展開できず、md 本体（`review-packet-batch5-design-r1.md`）を読んだ。固定の URL のうち ADR-0001・`src/report/write.ts`・`tests/reusable-workflow.test.ts` を開き、GitHub CLI の設定と telemetry の文書、GFM の仕様の公開の頁も参照した。ROADMAP・CHANGELOG・README・ADR-0025・版の一致のテスト・設定の schema・aiqh 自身の設定は全文の照合をしていない
- 人間の決定（2026-11-08）: B5-D-Q1〜B5-D-Q7 はすべて A（B5-D-Q2・B5-D-Q7 は下の 2 件の直しを条件に）。公開の既存の文の 2 か所の適用先の名前を、v0.18.3 の記録の commit で A・B の書き方に置き換える（設計 R2 §1・§2.2 の 12）

## 指摘ごとの判断

| 指摘 | 重要度 | 判断 | 確かめたこと（正本・実測） | 直した所 |
|---|---|---|---|---|
| B5-D-R1-001（vitest・vite の版が承認した 5.1.0・8.3.6 に実際に上がったことの合否の条件が無い） | Medium | **採用** | 正本（設計 R1 §2.1.3）: D1 は npm の終了コード、D2 は `package.json` の差、D3 は lock の変更の種類で、最終の版を指定の値と比べる条件は無かった。vite は範囲を変えずに `npm update vite` で上げるので、D2 では到達を判定できない（指摘のとおり）。CI の log: `ci.yml:40`・`:69` は `npm ci` と `npm run verify` だけで、どちらも vitest・vite の版を出さない（PASS の check の出力は表示されず、`parsed: vitest` の行に版は無い） | 設計 R2 §2.1.3 の 2（着手時に registry を読み、選ぶ版を 5.1.0・8.3.6 に固定。どちらかに新しい版が出ていたら止めて人が選ぶ）、5 の D13（lock の `node_modules/vitest`・`node_modules/vite` の版、`npm ls vitest vite --depth=0 --json` の版、`package.json` の範囲 `~5.1.0`・`~8.3.5`。1 つでも違えば止める）、6（外れたときに D13 と新しい版を含める）、7（D13 を試しの worktree・release の branch の作業ツリー・依存の commit の SHA 固定の worktree の 3 か所で。CI の log では版を読めないので、CI の版は lock と `npm ci` の決まりに依ると書く）、§2.4 の 1、§8。ADR-0008 の追記の案 r2 の決定 3・4 |
| B5-D-R1-002（telemetry の確かめが設定だけで、設定より優先する環境変数の実効値を見ない） | Medium | **採用** | 正本（設計 R1 §2.1.3 の 1 と ci 手順書の文案 r1 の (3) の §8 の追加文）: 確かめは `gh --version` と `gh config get telemetry` だけだった。同じ文案の §5 は「環境変数が設定より優先」と書いていた（指摘のとおり、手順と説明が合っていない）。実測（R2 の段。gh は走らせていない）: このセッションの `GH_TELEMETRY` は `false`。`zsh -c`・`caffeinate -i zsh -c`・`bash -c`・起動ファイルを読まない `zsh -f -c` でも `false`（親のプロセスから継承）。変数を外して非対話の `zsh -c` を起こすと空、対話の `zsh -i -c` でだけ `false`（値は対話のシェルの設定で入る）。`DO_NOT_TRACK` は無い | 設計 R2 §2.1.3 の 1（gh のどのコマンドよりも先に `printenv GH_TELEMETRY`。`false`・`0`・`disabled` でなければ gh を走らせずに止まる。空と `DO_NOT_TRACK` は止める側・頼らない側に置く。次に子のシェルと `caffeinate -i` の下で同じ値、次に設定、次に版）、§0（継承の実測）、§2.2 の 4、§8（対話のシェルを通らない起動経路）。ci 手順書の文案 r2 の (3)（§5 の確かめの順と、§8 の手順 8 の追加文） |

- どちらの直しも、レビュアーの修正案の範囲の中（版の固定と独立のゲート、環境変数の先読みと停止の条件）。修正案の「実行するシェルで `GH_TELEMETRY=false` を明示的に設定したうえで起動する」案は採らず、「先に読んで、無効の値でなければ止まる」案にした（明示的に設定する形は、手順が環境を変えることになり、設定し忘れた別の起動経路を見つけられない）

## R1 の「指摘なし」の観点に付いていた注意の扱い

| 観点 | 注意 | 扱い |
|---|---|---|
| 問い 2（互換性） | v0.18.4 の GitHub・Job Summary の描画はなお未確認 | 設計 R2 §8 のまま（確かめていない範囲として残す） |
| 問い 3（golden） | 設計段の試しの生データを独立に再実行したわけではない | 設計 R2 §3.3 の 3・§4.1 の 3（実装の段で、直す前の SHA の FAIL と、golden の書き出しをもう一度行い、記録する） |
| 問い 4（テストと変異） | `spanAt`・`cells` はテスト用のモデルで、実のレンダラの検証ではない。**将来の実装レビューでは、変更後の 2 行を入力と実ファイルの双方から独立に照合すること** | 設計 R2 §4.1 の 3（v0.18.4 の実装 R1 の依頼文で、golden の 2 行の差を、入力〈`tests/report-golden-input.ts`〉と実ファイル〈commit した期待値〉の双方から独立に照らした節を頼む）。モデルの限界は §8 のまま |
| 問い 5（記録と gh） | tag-protection と sha_pinning を「記録して閉じる」のは、人間が明示して残余を受け入れる限り成立する | 人間の決定 B5-Q5・B5-Q11（2026-11-08）で受け入れ済み。ci 手順書の文案の (1)・(2) は、確かめていない範囲を残して書いている（変えていない） |
| 問い 6（依存） | D3 の厳しい lock の比べは安全側の方針として受け入れる。Ubuntu の CI での確かめは実装時に必要 | D3 は変えていない。Ubuntu は設計 R2 §2.1.3 の 8（版の PR と main の run） |
| 問い 7（裏返し） | 2 件の Medium のほかは指摘なし | — |
| 問い 8（見落とし） | R2 では、実効の telemetry の確かめと版の到達を独立のゲートにしたことを優先して照合すればよい | 依頼文 R2 の問い 1 |

## R2 で直したほかのこと（指摘ではない）

- 人間の決定の反映: B5-D-Q1〜B5-D-Q7 を「推奨」から「確定」に（`batch5-questions-final.md`）。適用先の名前の置き換え（2 か所）を v0.18.3 の記録の項目と commit の案に足した（設計 R2 §2.2 の 12・§2.4）
- 公開の文の走査の結果（設計 R2 §2.2.1）と、それによる新しい問い B5-D-Q8（残りの 24 行）・B5-D-Q9（報告のメールアドレスの形の 1 行）（`batch5-questions-r2.md`）
- 人間の決定の指示書と前の段の報告が書いた行番号（`docs/adr/0001-language-typescript-node.md:14`・`docs/ROADMAP.md:1026`）は、名前のある行の 1 つ前の行だった。設計 R2 は `:15`・`:1027` と書いた（同じ箇所）
- `batch5-questions-r1.md` の B5-D-Q5 の見出しの参照「設計 §4.3」は誤り（設計の記録は §2.3）。`batch5-questions-final.md` で直した
- ADR-0008 の追記の案の既知の限界の参照「設計〈最終〉§2.1.2」（changelog を読む手順）は、§2.1.3 の誤り。r2 で直した

## R2 で確かめてほしいこと（依頼文の問いに入れた）

- 2 件の直しで、それぞれの指摘が解消したか
- 直しで新しく生じた危険（停止の条件が厳しすぎて正しい更新まで止める、など）
- 人間の決定（`batch5-questions-final.md`）と適用先の名前の置き換えが、設計に正しく写っているか
- そのほかの見落とし

## 状態（batch5 の記録の PR〈版なし。2026-11-08。branch `docs/batch5-design-record`〉）

| ID | 状態 | fixedIn・行き先 | 確かめ |
|---|---|---|---|
| B5-D-R1-001 | deferred（行き先 v0.18.3） | — | 直した先は設計（最終）§2.1.3 の 2・5（D13）・6・7 と `adr-0008-addendum-draft-final.md` の決定 3・4（どちらもこの commit で収録）。ADR-0008 の追記と D13 の実地の確かめは v0.18.3 に入るので、v0.18.3 の commit で resolved にする。R2 の評価: 解消、R3 の本文: 解消を維持 |
| B5-D-R1-002 | resolved | この記録の PR の 1 つ目の commit（`f901670`。ci 手順書 §5・§8 の手順 8） | 新しい実行のテストは無い（手順の文書）。設計の段の R2・R3 と、この記録の PR の着手前の確かめで、gh より先に `printenv GH_TELEMETRY` → 子のシェル・`caffeinate -i` の下 → 設定 → 版の順で行った。R2 の評価: 解消、R3 の本文: 解消を維持 |

（40 桁の SHA は `findings-r1.json` の `fixedIn`）
