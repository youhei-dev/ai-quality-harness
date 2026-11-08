# aiqh batch5 設計（最終。v0.18.3・v0.18.4）

作成: 2026-11-08（R1・R2・R3・最終は同じ日）。最終は、設計 R3（`design-r3.md`）と同じ中身で、実装の段の正本にする形（R3 の独立レビューで直すことが出たら、この文書を直す）。基準の commit: `d4f16973d6898172233fbdbce75d409269de4702`（公開リポジトリの main。v0.18.2 の後の記録の PR #32 の merge）。**この文書の行番号は、すべて 2026-11-08 の `d4f1697` の時点**。設計の段では、コード・テスト・docs の追跡しているファイルを変えていない（試しは使い捨ての worktree の中だけ）。決めたことは `questions-final.md`（B5-D-Q1〜B5-D-Q9。すべて確定、2026-11-08）、R1・R2 への応答は `response-r1.md`・`response-r2.md`、ADR の追記の案は `adr-0001-note-draft-final.md`・`adr-0008-addendum-draft-final.md`・`adr-0028-note-draft-final.md`、ci 手順書の文案は `ci-doc-section3-draft-final.md`（どれも最終の形。R3 で R2 の案を写して作った）、各回の差分は `diff-r1-r2/`・`diff-r2-r3/`。R2 で足した問いの元の文は `questions-r2.md`（Q8・Q9 の決定は `questions-final.md` に写した）。設計の段の添付は `batch5-scope-summary-r1.md`（範囲の洗い出しの要点）と `c44-probe-r1.md`（C-44 の残りの試し）。

## R2 からの変更（R3）

設計 R2 の独立レビュー（batch5-design R2。High 0 / Medium 1 / Low 0。R1 の 2 件はどちらも「解消」）の 1 件を、レビュアーの修正案のとおりに直した。判断は `response-r2.md`。

| 指摘 | 重要度 | 対応 | 直した所 |
|---|---|---|---|
| B5-D-R2-001（§2.2 の記録の一覧と §3.4 の文案の参照が R1 のファイル名のまま。ADR-0008 の R1 の案には D13 が無く、ADR-0001 の R1 の案には名前の置き換えが無い） | Medium | 採用。文案の参照を、すべて最終の形の文案（`*-final.md`）に直した。R2 の案を写して最終の文案を作り、参照を機械で抜き出して、(a) 実在すること、(b) R1・R2 の名前を指す参照が履歴の説明のほかに無いことを照らした。中身も、ADR-0008 の最終の案に D13 と停止の条件（決定 3・4）、ADR-0001 の最終の案に名前の置き換え（(2)）、ci 手順書の最終の文案の (3) が `GH_TELEMETRY` を先に読む順であることを、差分と文字列の検索で確かめた（`ref-check-r3.md`） | 冒頭、§2.2 の 1〜6・12・13、§3.4、§2.3。`ref-check-r3.md` |

人間の決定（2026-11-08。R2 の後）:
- **B5-D-Q8 = A**: 公開の文に残る適用先の名前の残り 24 行も、v0.18.3 の記録の commit で「適用先 A（node:test）」「適用先 B（pytest）」の書き方に置き換える。R2 の条件: 名前のほかの文脈を変えないことを差分で確かめる。レビューの原文（`docs/reviews/*/review-r*.md`）は変えない（走査では 0 件）
- **B5-D-Q9 = A**: `docs/reports/M0_REPORT.md:16` のメールの値を、値を書かない言葉（「GitHub の noreply の形のアドレス」）に置き換える
- 設計 R3: B5-D-R2-001 を直して R3 を頼む（R3 なしで終える案は採らない。レビューの終わりは High・Medium 0 の回）
- → 置き換えの決まりと、実装の段の確かめの手順を §2.2.2 に書いた。§2.2 の 12・13、§2.4 の 2、§8 も直した

## R1 からの変更（R2）

設計 R1 の独立レビュー（batch5-design R1。High 0 / Medium 2 / Low 0）の 2 件を、どちらもレビュアーの修正案の向きで採用して直した。指摘ごとの判断は `response-r1.md`。

| 指摘 | 重要度 | 対応 | 直した所 |
|---|---|---|---|
| B5-D-R1-001（vitest・vite の版が、承認した 5.1.0・8.3.6 に実際に上がったことの合否の条件が無い） | Medium | 採用。着手時に registry を読んで選ぶ版を 5.1.0・8.3.6 に固定し（ほかに新しい版が出ていれば止めて人が選ぶ）、独立のゲート D13（lock・`npm ls`・`package.json` の範囲の 3 つで版を照らす。1 つでも違えば止める）を足した。同じ確かめを、release の branch の作業ツリーと、依存の commit の SHA 固定の worktree でも行う。CI の log では版を読めないので、そう書いた | §2.1.3 の 2・5（D13）・7・8、§2.4、§8、ADR-0008 の追記の案 r2 の決定 3・4 |
| B5-D-R1-002（telemetry の確かめが設定だけで、設定より優先する環境変数の実効値を見ない） | Medium | 採用。gh のどのコマンドよりも先に `printenv GH_TELEMETRY` を読み、無効の値（`false`・`0`・`disabled`）でなければ gh を走らせずに止まる。次に設定、次に版。子のシェル・`caffeinate -i` の下での継承も着手前に確かめる。優先の順（環境変数が設定より優先）を手順の文に書いた | §0、§2.1.3 の 1、§2.2 の 4、§8、ci 手順書の文案 r2 の (3) |

人間の決定（2026-11-08）:
- B5-D-Q1〜B5-D-Q7 は、すべて A で確定（`questions-final.md`）。B5-D-Q2 は「telemetry は設定と環境変数 `GH_TELEMETRY` の実効値の両方で確かめる」、B5-D-Q7 は「版の不一致（5.1.0・8.3.6 でない、更新されていない）も停止の条件に含める」という R1 の条件つき（上の 2 件の直し）
- **適用先の名前の置き換え**（v0.18.3 の範囲に足す）: 公開の既存の文の 2 か所（`docs/adr/0001-language-typescript-node.md:15`、`docs/ROADMAP.md:1027`）にある適用先の名前を、v0.18.3 の記録の commit で「適用先 A（node:test）」「適用先 B（pytest）」の書き方に置き換える（§2.2 の 12）。人間の決定の指示書は `:14`・`:1026` と書いたが、名前があるのは、その次の行（`:15`・`:1027`。前の段の報告の行番号の誤り。同じ箇所）
- 決定に合わせて、公開の文（`docs/`・`README.md`・`CHANGELOG.md`・`src/`・`tests/`・`.github/`）を走査した。適用先の名前はほかに **24 行**（合わせて 26 行・11 ファイル）あった。直すかを B5-D-Q8 として問いにした（§2.2.1）。メールアドレスの形は、テストの `example.invalid` の 37 行と、報告の 1 行（GitHub の noreply の形）で、後者を B5-D-Q9 にした

R1 の「指摘なし」の観点に付いていた注意は、実装の段の手順に写した（`response-r1.md` の表）: v0.18.4 の実装レビューでは、変更後の 2 行を入力と実ファイルの双方から独立に照合する（§4.1 の 3）、Ubuntu の CI での確かめは実装の版の run で行う（§2.1.3 の 8）、v0.18.4 の GitHub・Job Summary の描画と、読み戻しの部品が実のレンダラではないことは確かめていない範囲のまま（§8）。

## 0. 前提

- **範囲**: 人間の決定（2026-11-08）B5-Q1〜B5-Q11（§1。すべて推奨の A）と、設計の問い B5-D-Q1〜B5-D-Q7（すべて A。R1 の条件つき）、適用先の名前の置き換え（§1）。範囲の洗い出しの報告は公開リポジトリの外にあり、要点を `batch5-scope-summary-r1.md` に写した
- **表記**: 適用先のリポジトリを「適用先 A（node:test）」「適用先 B（pytest）」と書く。中身・用途は書かない（件数・ファイルの種類・出力の形だけ）
- **数の印**: 【実測】この設計の段（2026-11-08）に手元で測った値、【記録】範囲の洗い出しの報告（取得 2026-11-08T01:43:37Z〈npm の registry〉、ほかは 2026-11-08 10:33〜10:51 JST の GET）・ROADMAP・CHANGELOG・ADR・過去の設計から引いた値、【推定】見込み（実装の段で確かめ直す）。範囲の洗い出しの数値は取り直していない
- **実測の環境**: macOS（Apple Silicon、AC 電源、`caffeinate -i`）、Node v24.13.1、npm 11.18.0（`min-release-age=7`・`ignore-scripts=true`）、gh 2.103.3（telemetry は止めてある）。テストの前に負荷のゲート（1 分平均 ≤ 8 かつ 5 分平均 ≤ 12 が 20 秒おきに 3 回）
- **着手前の確認**【実測: R1 は 2026-11-08T02:04Z、R2 は 03:14Z、R3 は 03:41Z】: HEAD = origin/main = 基準の commit、作業ツリーは clean、開いている PR 0、`gh --version` 2.103.3、`gh config get telemetry` が `disabled`、環境変数 `GH_TELEMETRY` は `false`。R2・R3 の段では、`printenv GH_TELEMETRY` を gh のどのコマンドよりも先に読んだ
- **環境変数の継承**【実測: R2 の段。gh は走らせていない】: このセッションのシェル、`zsh -c`、`caffeinate -i zsh -c`、`bash -c`、起動ファイルを読まない `zsh -f -c` のどれでも `GH_TELEMETRY` は `false`（親のプロセスから継承される）。一方、変数を外してから非対話の `zsh -c` を起こすと空で、対話の `zsh -i -c` でだけ `false` になる（値は対話のシェルの設定で入る。対話のシェルを通らない起動経路には無い）。`DO_NOT_TRACK` は設定されていない
- **急ぐもの**【記録】: 無い。`npm audit --audit-level=high` は 0（moderate 10 は minimatch の勧告 1 つ）、自己 CI の unit・unit-minpath は直近の main の 10 本で最大 172.3 秒（上限 600 秒の 28.7%）、Actions は最新で勧告 0 件、時間のテストの外れ 0（84 本すべて success・再実行 0）、適用先 A の `output-truncated` 0

## 1. 範囲と決定（B5-Q1〜B5-Q11。人間の決定 2026-11-08。すべて A）

| 問い | 決定 |
|---|---|
| B5-Q1 範囲 | 主案: **v0.18.3**（記録 ＋ 開発用の依存。src 不変）→ **v0.18.4**（C-44 の残り。src 1 行） |
| B5-Q2 依存 | vitest 5.1.0（範囲を `~5.1.0` に）と vite 8.3.6（範囲 `~8.3.5` の中、lock だけ）を v0.18.3 で。**v0.18.3 の着手は 2026-11-12T05:40Z（JST 11-12 14:40）以降**。commander 15.1.0 は見張り、`@types/node` は 24.13.6 のまま、minimatch は依存元待ち |
| B5-Q3 H11 | 0 回（verify.yml・実行時の依存・適用先の出力を変えない） |
| B5-Q4 レビュー | 設計 R1（High・Medium 0 なら終える）＋ v0.18.3・v0.18.4 の実装 R1 = 3 回 |
| B5-Q5 tag-protection | 設定と文書の読みで記録して閉じる（ci 手順書 §3 に、確かめた範囲と確かめていない範囲） |
| B5-Q6 gh CLI | 更新済み（人が 2026-11-08 に 2.103.3 へ上げ、telemetry を止めた〈設定と環境変数〉）。手順書に gh の版と telemetry を止めていることを記録 |
| B5-Q7 review-import v3 | 入れない（見張り） |
| B5-Q8 C-44 の残り | v0.18.4 で直す（`src/report/markdown.ts:130` を `codeSpan(oneLine(c.command))` に）。B4-Q9 の「バッククォートの無い値の出力は同じ」を、**`\|` を含むコマンドの FAIL の詳細の 1 行に限って**決め直す |
| B5-Q9 C-57・項目 56・53-G | 入れない（C-57 は入れない、56 は見張り、53-G は後の候補） |
| B5-Q10 調べもの | C-19 は registry の事実（TS 7 は typescript-eslint 8.72.1 の peer `<6.1.0` の外）を v0.18.3 の docs に記録。C-07 の残り・C-51 は別の依頼 |
| B5-Q11 sha_pinning | 記録して閉じる（文書に明記なし、推定は呼ぶ側〈A・B は false〉、`verify.yml` が使う外のアクションはすべて SHA でテストが固定） |

設計の問い（人間の決定 2026-11-08。`questions-final.md`）: B5-D-Q1〜B5-D-Q9 はすべて A。B5-D-Q2 と B5-D-Q7 は R1 の条件つき（R2 の変更の表）、B5-D-Q8 は R2 の条件つき（R3 の変更の表）。

適用先の名前の置き換え（人間の決定 2026-11-08）: `docs/adr/0001-language-typescript-node.md:15` と `docs/ROADMAP.md:1027` の適用先の名前を、v0.18.3 の記録の commit で「適用先 A（node:test）」「適用先 B（pytest）」の書き方に置き換える（§2.2 の 12）。残りの 24 行と、報告の中のメールの値の 1 行も、同じ commit で置き換える（B5-D-Q8・B5-D-Q9 = A。§2.2 の 13・§2.2.2）。過去の commit の履歴に残ることは受け入れる（履歴は書き換えない）。

あわせて（人間の設定。2026-11-08）: GitHub の画面の merge で作られる merge の commit の作者のメールは、GitHub の設定で非公開にした。v0.18.3 の最初の merge で、作者のメールが noreply の形かだけを確かめて記録する（値は書かない。§4.3）。

**範囲の外**（理由は範囲の洗い出しの要点と各決定）: review-import v3（B5-Q7）、C-57・項目 56・53-G（B5-Q9）、C-07 の残り・C-51（B5-Q10。外の文書を読む別の依頼）、commander 15.1.0（実行時の依存。見張り。§2.1.1）、minimatch（依存元待ち）、Windows（ROADMAP の項目 18。人間の未決定）、ROADMAP の項目 15・46・47・50 の残り（見張り）、C-08 のパケットの仕組み（M の案。見張り）、H11（B5-Q3）。

版の中身:
- **v0.18.3**（src を変えない）: 開発用の依存（§2.1）、記録（§2.2）、設計の記録（§2.3）、commit の並び（§2.4）
- **v0.18.4**（src のコードを 1 行）: C-44 の残り（§3）

## 2. v0.18.3（src を変えない）

### 2.1 依存（B5-Q2 = A。ADR-0008 の追記の案）

#### 2.1.1 変えるもの・変えないもの

| 名前 | 種類 | 今の範囲（`package.json`） | 入っている版（lock） | v0.18.3 | 理由 |
|---|---|---|---|---|---|
| vitest | 開発 | `~5.0.3` | 5.0.5 | 範囲 `~5.1.0`、lock 5.1.0 | 範囲の外の minor（2026-11-02T16:12Z 公開。7 日は 11-09T16:12Z）【記録】 |
| vite | 開発 | `~8.3.5` | 8.3.5 | 範囲は変えない、lock だけ 8.3.6 | 範囲の中（2026-11-05T05:40Z 公開。7 日は 11-12T05:40Z）【記録】 |
| commander | **実行時** | `~15.0.0` | 15.0.0 | 変えない（見張り） | 上げると配布物と、適用先が SHA を上げたときの適用先の aiqh が変わる（H11 の対象）。上げる理由（直し・勧告）を確かめていない。7 日は 11-14T01:27Z【記録】 |
| `@types/node` | 開発 | `~24.13.3` | 24.13.6 | 変えない | CI の Node（24.13.1）を超えない（ADR-0008 の追記〈v0.18.1〉の決定 4）。24.13.x の最新 |
| minimatch | 開発（間接） | — | 10.2.6 | 変えない | 依存元の最新が 11 系を許さない。moderate 10 件は残る【記録】 |

- vitest 5.1.0 の peer の vite は `^6.4.0 || ^7.0.0 || ^8.0.0`【記録】で、vite 8.3.6 と合う
- 着手の時刻: 2 つとも 7 日を満たす **2026-11-12T05:40Z 以降**。設計の段では入れて試していない（`min-release-age=7` の待ちの中。人間の決定）

#### 2.1.2 lock の変化の見込み【推定。実装の段で全欄を比べる】

- 今の lock【実測】: ルートを除いて 157 項目（`dev: true` が 154、実行時の依存 3 つ〈commander・jsonc-parser・zod〉）。vitest 5.0.5 は `@vitest/mocker` を `5.0.5` の完全な版で持ち、`@vitest/mocker` が `@vitest/spy` を `5.0.5` の完全な版で持つ（lock の `@vitest/` はこの 2 つ）。vite 8.3.5 は rolldown を `~1.2.14` で持ち（入っているのは 1.2.16）、rolldown の系は 18 項目（rolldown・`@rolldown/pluginutils`・`@oxc-project/types`・環境ごとの binding 15）
- 見込み: vitest で少なくとも 3 項目（vitest・`@vitest/mocker`・`@vitest/spy`。間接の依存の範囲が変わればもっと）、vite で 1 項目（vite 8.3.6 が rolldown の範囲を変えれば、rolldown の系の 18 項目も）。**4〜22 項目ほど、どれも `dev: true`**。追加・削除は、vitest 5.1.0 の依存の一覧が変われば出る
- 例（v0.18.1 の組 2）【記録: batch4 の設計〈最終〉§2.5.1】: eslint・typescript-eslint・vite（8.2.4 → 8.3.5。rolldown 1.2.7 → 1.2.16 と binding を含む）で、版の変更 33 項目、追加・削除 0、同じ版で欄だけ変わったもの 0、33 項目はどれも `dev: true`、実行時の依存 3 つの項目は同じ、ルートの `version` は npm が書いたまま
- `package.json` の差は vitest の範囲の 1 行だけの見込み（vite は範囲を変えない）

#### 2.1.3 手順と完了条件（着手時。2026-11-12T05:40Z 以降）

1. **着手前の確認**（ci 手順書 §8 の手順 8 と §5。文案は `ci-doc-section3-draft-final.md` の (3)。**この順を守る**。B5-D-R1-002）
   1. **gh のどのコマンドよりも先に** `printenv GH_TELEMETRY` を読む。値が `false`・`0`・`disabled` のどれかなら次へ。**未設定・空・`enabled`・`log`・`1`・`true`・そのほかの値なら、gh を一度も走らせずに止まり、人間に知らせる**。環境変数は gh の設定より優先する（GitHub CLI の telemetry の文書。範囲の洗い出しの要約の読み）ので、設定が `disabled` でも、環境変数が無効の値でなければ止まる。`log` は送らずに標準エラーへ出す値だが、手順の出力を変えるので止める
      - 文書の要約は、空の値と `DO_NOT_TRACK=true` でも無効になると読める。手順では、空を未設定と見分けにくいので止める側に置き、`DO_NOT_TRACK` には頼らない（どちらも、止めすぎる側の扱い）
   2. 同じシェルから `zsh -c 'printenv GH_TELEMETRY'` と `caffeinate -i zsh -c 'printenv GH_TELEMETRY'` を読み、1 と同じ値（テストと verify は `caffeinate -i` の下で走らせ、worktree の中のコマンドも同じシェルから起こす。環境変数は作業の場所によらず、起こしたプロセスから継承される）。サブエージェントを使うときは、その依頼文に、gh を使う前に同じ確かめをすることを書く
   3. `gh config get telemetry` が `disabled`
   4. `gh --version` が 2.99.0 以上（設計の段で確かめた版は 2.103.3）
   5. HEAD = origin/main、開いている PR 0、作業の branch が残っていない、`npm audit --audit-level=high` が 0
2. **版を決めて固定する**（B5-D-R1-001。読むだけ。npm の cache と log は作業の場所）: `npm view vitest time dist-tags --json` と `npm view vite time dist-tags --json` を読み、取得の時刻とともに記録する
   - vitest 5.1.0・vite 8.3.6 の公開時刻と、取得の時刻で公開から 7 日を過ぎていること（`min-release-age=7` と同じ考え。npm の設定でも守られる）
   - vitest に 5.1.0 より新しい版、vite に 8.3.6 より新しい版が無いこと（範囲の中か外か、7 日を満たすかに関わらず）。`latest` が 5.1.0・8.3.6 であること
   - **選ぶ版は vitest 5.1.0・vite 8.3.6 に固定する**。新しい版が出ていたら、試しの前に止めて、人間が選ぶ（B5-Q2 は、この 2 つが最新であることを前提に決めた。範囲の中の新しい版は `npm install`・`npm update` が選びうる）
3. **changelog を読む**（読むだけの GET。読む範囲は実装の指示書で決める）: vitest の v5.1.0 の release notes（`gh api repos/vitest-dev/vitest/releases/tags/v5.1.0` の `body`。1 の確かめの後に）、vite の 8.3.6 の changelog（vite のリポジトリの `packages/vite/CHANGELOG.md` の 8.3.6 の節）。見るもの: 破壊的な変更の記載、既定の reporter の要約の行（`Test Files`・`Tests` の行。aiqh の vitest のパーサが読む）、reporter の API（`tests/support/near-limit-reporter.ts` が使う）、`vitest.config.ts` の設定の鍵、CLI の `vitest run`、peer の範囲。気になる記載があれば、試しの前に人間に知らせる
4. **使い捨ての worktree で試す**（release の branch の元の SHA に `git worktree add --detach`。npm の cache と log は作業の場所）: `npm ci` → `npm install --save-dev vitest@~5.1.0` → `npm update vite`（`package.json` は変えない。npm 7 以降の `npm update` は既定で `package.json` の範囲を書き換えない【推定: 実測で `git diff package.json` を見る】）。前後の `package.json`・lock・`npm ls --depth=0`・`npm pack --dry-run --json` を写す。**すぐに D13（版の到達）を確かめ**、外れたら残りの確かめに進まずに止める
5. **完了条件**（すべて満たしてから依存の commit を作る。commit の SHA 固定の worktree でもう一度。D13 は下の 7 の 3 か所すべてで）:

| # | 条件 | 確かめ方 |
|---|---|---|
| D1 | `npm install`・`npm update` が `min-release-age=7`・`ignore-scripts=true`・`allow-remote=none` の下で exit 0 | 終了コード |
| D2 | `package.json` の差は vitest の範囲の 1 行だけ | `git diff package.json` |
| D3 | lock の全欄の比べ: 変わるのは開発用の項目の版（と、版に付く `resolved`・`integrity`）だけ。追加・削除・`dev`・`optional` の印の変化・実行時の依存 3 つの項目の変化・engines・license の変化が 0（追加・削除が出たら、名前と理由を一覧にして人間に知らせる）。ルートの `version` は npm が書いたまま | batch4 の付録 A3 と同じ比べのスクリプト（前後の lock の `packages` を項目ごとに比べる） |
| D4 | `npm audit --audit-level=high` が exit 0、moderate が 10 のまま | `npm audit`（テキストと JSON） |
| D5 | typecheck が exit 0 | `npm run typecheck` |
| D6 | lint が exit 0、新しい指摘 0（抑止は今の 4 つの注釈のまま） | `npm run lint`（テキストと JSON） |
| D7 | 全テストが **3 回**とも exit 0、ファイルと件数が今と同じ（192 ファイル・3,015 件【記録: v0.18.2。設計の段の基準の commit でも、足した 7 件を除いて同じ数】） | `npx vitest run` を負荷のゲートの後に 3 回 |
| D8 | **golden の 4 つの期待値が 1 バイトも変わらない** | 全テストの `tests/report-golden.test.ts`（書かれたファイルと期待値の Buffer の比べ）が PASS、`git diff --stat -- tests/fixtures/` が空 |
| D9 | `npm run verify` が VERIFY PASSED 8/8。端末の unit の下の **`parsed: vitest` の行の形が今と同じ**（件数の欄の並び。v0.18.2 の行と比べ、変わるのは件数の値だけ） | verify の出力を、依存の commit の親（branch の元の main）の SHA 固定の worktree の出力と、件数・時間を伏せて `diff` |
| D10 | `npm run verify:dist` が VERIFY PASSED 8/8 | 同上 |
| D11 | 全テストの終わりに、上限に近いテストの reporter の件数の行が stderr に出る（reporter の API が動く） | 全テストの stderr |
| D12 | `npm pack --dry-run` の項目が今と同じ 4 つ、差は `package.json` の範囲の分だけ | `npm pack --dry-run --json` の前後 |
| D13 | **版の到達**（R2。B5-D-R1-001）: `package-lock.json` の `packages["node_modules/vitest"].version` が `5.1.0`、`packages["node_modules/vite"].version` が `8.3.6`。`npm ls vitest vite --depth=0 --json` の `dependencies.vitest.version` が `5.1.0`、`dependencies.vite.version` が `8.3.6`。`package.json` の `devDependencies.vitest` が `~5.1.0`、`devDependencies.vite` が `~8.3.5` のまま。**1 つでも違えば（更新されていない・別の版・範囲の書き方が違う）止める**（B5-D-Q7） | lock と `package.json` を JSON で読み、値を文字列で比べる一回きりのスクリプト（終了コードと、6 つの値と期待値の表を記録）、`npm ls` の JSON |

6. **外れたとき**（D1〜D13 のどれか。版の不一致〈D13〉と、2 の新しい版を含む）: 規則やテストを緩めず、依存の commit を外して止め、人間が決める（B5-D-Q7 = A。R1 の条件）。記録の commit は依存の commit に依らない形にしておく（§2.4）
7. **版の確かめの 3 か所**（D13）: (a) 4 の試しの worktree、(b) release の branch の作業ツリーで同じコマンドを走らせた後（依存の commit を作る前）、(c) 依存の commit の SHA 固定の worktree で `npm ci` の後。どれも同じ 6 つの値で合うこと。**CI の log では vitest・vite の版を読めない**（`ci.yml:40`・`:69` は `npm ci` と `npm run verify` だけで、`npm ci` は追加した数だけを出し、verify は PASS の check の出力を表示しない。`parsed: vitest` の行に版は無い）。CI の `npm ci` は lock の版をそのまま入れ、`package.json` と lock が合わなければ失敗する【推定: npm ci の決まり】ので、CI の版は (c) の lock の確かめに依る。そのことを v0.18.3 の記録に書く
8. **CI**: PR の run と main の run で、必須の 2 つが success、`npm ci` の moderate が 10、verify の dependency の check の `parsed: npm-audit` が `10 vulnerabilities (10 moderate)`（ROADMAP の v0.18.2 の項と同じ形）。Ubuntu での vitest 5.1.0 は、この run で初めて確かめる

#### 2.1.4 適用先への影響

- 無い見込み: vitest・vite は開発用の依存。再利用ワークフローは aiqh の依存を `npm ci --omit=dev` で入れる（`.github/workflows/verify.yml:107`）。v0.18.3 は H11 を行わない（適用先 A・B の呼び出しは v0.18.2 のまま）

### 2.2 記録（docs だけ）

| # | 書く先（今の行） | 中身 | 文案 |
|---|---|---|---|
| 1 | `docs/adr/0028-output-parsers-display-only.md:176` の下 | GitHub の描画の実測（contents API の HTML の GET。表の中は縦棒だけ、表の外はバックスラッシュと縦棒が字のまま見える）。v0.18.4 で解消する予定 | `adr-0028-note-draft-final.md` の (1) |
| 2 | `docs/ops/ci-and-branch-protection.md:105`（§3 の「試していないこと」）の下 | tag-protection: 確かめた範囲（ruleset の GET、bypass 0・`current_user_can_bypass: never`、rule insights で 2 つのタグの作成が `update`・`deletion` の評価で `pass`、公式の文書の規則の説明）と確かめていない範囲（実際の拒否・エラーの文・API と画面の経路）。B5-Q5 で閉じる | `ci-doc-section3-draft-final.md` の (2) |
| 3 | 同 `:99`（rule insights の箇条の末尾の「… 未確認」）の下 | sha_pinning: B5-Q11 の内容（設定の読み、文書に明記なし、推定は呼ぶ側、どちらでも結果は同じ） | `ci-doc-section3-draft-final.md` の (1) |
| 4 | 同 §5 の `:148` の後と、§8 の手順 8（`:194`）の末尾 | gh CLI の版（2.103.3、前提は 2.99.0 以上）と telemetry を止めていること。確かめの順（R2。B5-D-R1-002）: gh より先に環境変数 `GH_TELEMETRY` の実効値、次に設定、次に版。環境変数が設定より優先すること、無効の値でなければ gh を走らせずに止まること、子のシェルでの継承。手順で使う gh のコマンドに関わる 2.89.0 以後の直し（v2.92.0・v2.97.0・v2.99.0） | `ci-doc-section3-draft-final.md` の (3)。B5-D-Q2 = A（R1 の条件つき） |
| 5 | `docs/adr/0001-language-typescript-node.md:33` の下 | C-19 の一部: TypeScript 7 は typescript-eslint 8.72.1 の peer `<6.1.0` の外（registry の事実、取得 2026-11-08T01:43:37Z）。公式の文書は読んでいない | `adr-0001-note-draft-final.md` の注記 |
| 6 | `docs/adr/0008-dependency-policy.md` の末尾（`:85` の後） | v0.18.3 の依存の形（B5-Q2）、commander 15.1.0 を見張りにした理由、完了条件（D1〜D13、版の固定と到達・版の不一致で止める: 決定 3・4） | `adr-0008-addendum-draft-final.md` |
| 7 | `docs/ROADMAP.md:879`（項目 42）・`:887`（項目 50）・`:893`（項目 56） | 見張りの記録: main の直近 10 本の最大・中央値、50%・72%・80% の線に届かないこと、適用先 A の直近 3 本で `output-truncated` 0 | 付録 B.1 |
| 8 | `docs/ROADMAP.md:890`（項目 53） | 53-G の記録: 84 本すべて success、再実行 0。PASS の check の上限に近い行は CI の log に出ないので、上限への近さは CI から読めない | 付録 B.2 |
| 9 | `docs/ROADMAP.md:1029`（M3 の「適用先の側の残り」の適用先 A の依存の見張り） | 適用先 A の勧告（ID・重さ・公開日・直った版）。deepmerge は low で直った版なし、glob・minimatch は moderate。適用先の名前と依存の道のパッケージの名前は書かない | 付録 B.3 |
| 10 | `docs/ROADMAP.md`（M4 の後の版の末尾。v0.18.2 の項〈`:1227-1247`〉の後、`:1248` の `---` の前） | v0.18.3 の項（依存・記録・設計の記録・CI・タグ・merge の commit の作者のメールの形） | release の commit と、版の後の記録 |
| 11 | `CHANGELOG.md`（`:8` の前に v0.18.3 の見出し）と `README.md:50`（状態の行）・`:66`（review-packet の行の版） | v0.18.3 の項。README の 2 か所の版は `tests/regression-m2-1-r2-008-version-consistency.test.ts` が確かめる | release の commit |
| 12 | `docs/adr/0001-language-typescript-node.md:15`、`docs/ROADMAP.md:1027` | **適用先の名前の置き換え**（人間の決定 2026-11-08）: `:15` の「対象リポジトリ（…）も 5.9 系」の括弧の中の適用先の名前を「適用先 A（node:test）」に。`:1027` の箇条の先頭の `<owner>/<repo>` の形の適用先の名前を「適用先 B（pytest）」に。ほかの文は変えない | `adr-0001-note-draft-final.md` の (2)、下の 2.2.1・2.2.2 |
| 13 | 2.2.1 の残りの 24 行（9 ファイル）と、`docs/reports/M0_REPORT.md:16` | **適用先の名前の残りの置き換えと、メールの値の置き換え**（B5-D-Q8 = A・B5-D-Q9 = A。人間の決定 2026-11-08）: 位置は 2.2.1 の表と `docs/reports/M0_REPORT.md:16`。置き換えの形の決まりと、実装の段の確かめは 2.2.2 | 下の 2.2.2、`questions-final.md` の B5-D-Q8・B5-D-Q9 |

- 1 の注記は「v0.18.4 で解消する予定」と書き、v0.18.4 で `:176` を「解消」に書き換える（§3.4。案の (2)）。v0.18.3 で `:176` の本文は変えない
- 2・3 は、どれも読み取り（GET）の結果と、要約で読んだ文書の記述。GitHub の設定・ruleset は変えない。文書の引用は「要約。原文の一字一句は照らしていない」と書く（範囲の洗い出しの読みが WebFetch の要約だったため）
- 4 の telemetry は、gh の設定と環境変数の名前・値だけを書く（シェルの設定のファイルのパスは書かない）
- 9 は、適用先 A の `npm audit` の読みの結果。勧告の ID・パッケージの名前（deepmerge・glob・minimatch）・重さ・時刻・直った版だけで、適用先の名前・依存の道の上のパッケージ・用途は書かない
- C-06 は v0.18.1 で閉じた記録がある（範囲の洗い出し）ので、書き足さない

#### 2.2.1 公開の文の走査（R2。2026-11-08。人間の決定の §1-2）

- 範囲: `d4f1697` の追跡しているファイルのうち `docs/`・`README.md`・`CHANGELOG.md`・`src/`・`tests/`・`.github/` の 622 ファイル（`git show` で読んだ）。あわせて、残りの追跡しているファイル 15 個（`scripts/`・設定・`LICENSE` など）も同じ型で読んだ
- 型: 適用先の名前（2 つ）、ほかの個人のプロジェクトの名前・`<owner>/<repo>` の形、別のサービスの名前、人の名前、手元のパス（`/Users/<名前>`・`/home/<名前>`・一時の場所）、手元のホスト名、メールアドレスの形、会社の形の語、IPv4。名前そのものはこの文書に書かない（位置と数だけ）
- 結果【実測】:
  - **適用先の名前: 26 行・11 ファイル**（A の名前 22 か所、B の名前 22 か所。うち 22 か所は `<owner>/<repo>` の形）。人間の決定の 2 か所（`docs/adr/0001-language-typescript-node.md:15`・`docs/ROADMAP.md:1027`）を含む。ほかの 24 行は下の表
  - ほかの個人のプロジェクトの名前・別のサービスの名前・人の名前・手元のパス・手元のホスト名・IPv4: 0 件（`<owner>/<repo>` の形の当たり 14 行は、どれも上の適用先の名前の行）
  - 会社の形の語: 3 行（`docs/ARCHITECTURE.md:610`、`docs/adr/0030-public-as-is-mit-claude-md-untracked.md:10`、`docs/reports/M0_REPORT.md:145`）。どれも「会社の情報を書かない」決まりと点検の説明で、会社の名前ではない（直さない）
  - メールアドレスの形: 38 行。37 行はテストの `example.invalid` の架空の値（`tests/` の 31 ファイル）。1 行は `docs/reports/M0_REPORT.md:16`（M0 の環境の記録の `git config user.email` の値。GitHub の noreply の形で、持ち主の login を含む）→ B5-D-Q9
  - 残りの追跡しているファイル 15 個: 0 件

適用先の名前の残りの 24 行（数は名前の出る回数。名前は書かない）:

| 位置 | A | B | `<owner>/<repo>` の形 | 文書の種類 |
|---|---|---|---|---|
| `CHANGELOG.md:357` | 1 | 0 | 1 | 記録（過去の版の項。M3 の適用） |
| `CHANGELOG.md:358` | 0 | 1 | 1 | 同上 |
| `CHANGELOG.md:387` | 1 | 1 | 2 | 同上（適用先の予定の取り消し） |
| `README.md:50` | 1 | 1 | 2 | 状態の行の中の過去の版（v0.9.1）の説明 |
| `docs/ARCHITECTURE.md:62` | 1 | 1 | 0 | 今の構成の図の説明 |
| `docs/ROADMAP.md:83` | 1 | 1 | 0 | M1 の内容 |
| `docs/ROADMAP.md:98` | 1 | 1 | 0 | M1 の完了条件 |
| `docs/ROADMAP.md:616` | 1 | 1 | 2 | M2-2 の記録（適用先の予定の取り消し） |
| `docs/ROADMAP.md:882` | 1 | 0 | 1 | 項目 45 |
| `docs/ROADMAP.md:919` | 1 | 1 | 2 | M3 の内容 |
| `docs/ROADMAP.md:991` | 2 | 2 | 2 | M3 の波 4 |
| `docs/ROADMAP.md:1003` | 1 | 1 | 0 | 同上 |
| `docs/ROADMAP.md:1006` | 1 | 0 | 1 | 同上 |
| `docs/ROADMAP.md:1010` | 0 | 1 | 1 | 同上 |
| `docs/adr/0031-ci-distribution-reusable-workflow-own-source.md:7` | 1 | 1 | 2 | ADR の文脈 |
| `docs/adr/0031-ci-distribution-reusable-workflow-own-source.md:79` | 1 | 1 | 2 | ADR の追記 |
| `docs/adr/0031-ci-distribution-reusable-workflow-own-source.md:85` | 1 | 1 | 0 | 同上 |
| `docs/adr/0036-security-scan-raw-bidi-controls-and-line-separators.md:17` | 1 | 2 | 0 | ADR の文脈（実測の記録） |
| `docs/reports/M0_REPORT.md:145` | 1 | 1 | 0 | 報告（M0） |
| `docs/reports/M0_REPORT.md:179` | 1 | 0 | 0 | 同上 |
| `docs/reports/M0_REPORT.md:180` | 0 | 1 | 0 | 同上 |
| `docs/reports/M3_COMPLETION.md:25` | 1 | 1 | 2 | 報告（M3） |
| `docs/reviews/item48-design/design-r2.md:60` | 1 | 0 | 0 | 設計の記録（レビューの原文ではない） |
| `docs/reviews/item48-design/design-r2.md:61` | 0 | 1 | 0 | 同上 |

- `docs/reviews/` のレビューの原文（`review-r*.md`。原文とバイト単位で同じに保つ決まりのもの）には当たりが無い
- B5-D-Q8 = A（2026-11-08）: 24 行も、v0.18.3 の記録の commit で置き換える。決まりと確かめは 2.2.2。置き換える前の名前は、過去の commit の履歴に残る（§8）

#### 2.2.2 置き換えの決まりと、実装の段の確かめ（R3。B5-D-Q8・B5-D-Q9 = A）

- **対象**: 適用先の名前の 26 行（決定の 2 か所〈`docs/adr/0001-language-typescript-node.md:15`・`docs/ROADMAP.md:1027`〉と、2.2.1 の表の 24 行。11 ファイル）と、メールの値の 1 行（`docs/reports/M0_REPORT.md:16`）。合わせて **27 行・11 ファイル**（`docs/reports/M0_REPORT.md` は、名前の 3 行とメールの 1 行を持つ）。レビューの原文（`docs/reviews/*/review-r*.md`）は対象に無い（走査で 0 件）
- **置き換える単位**: 適用先の名前の 1 つの出現。`<owner>/` が前に付く形はそれを含め、名前（と `<owner>/`）をちょうど囲むバッククォートがあれば、それも含める。メールの値は、値と、それをちょうど囲むバッククォート
- **置き換えの形**（機械で決まる形にする）:
  1. `<owner>/<repo>` の形の出現: 「適用先 A のリポジトリ」「適用先 B のリポジトリ」
  2. 名前だけの出現: 「適用先 A」「適用先 B」
  3. **各行の、A の最初の出現と B の最初の出現にだけ**、種類を足す: 「適用先 A」の直後に、全角の括弧の外なら「（node:test）」、全角の括弧の中なら「〈node:test〉」（B は「（pytest）」「〈pytest〉」）。1 の形では「適用先 A（node:test）のリポジトリ」のように、「適用先 A」の直後に入れる
  4. メールの値: 「GitHub の noreply の形のアドレス」（値は書かない）
  5. 単位の外の文字（前後の語・句読点・括弧・区切りの「・」「/」・表の縦棒）は変えない
  - 例（形だけ。名前は書かない）: `` `<owner>/<A の名前>` ``: PR #2 → 適用先 A（node:test）のリポジトリ: PR #2。「（`<owner>/<A の名前>`・`<owner>/<B の名前>`）」→「（適用先 A〈node:test〉のリポジトリ・適用先 B〈pytest〉のリポジトリ）」。表のセル「\| <A の名前> \|」→「\| 適用先 A（node:test） \|」
  - `docs/adr/0001-language-typescript-node.md:15` は、この決まりで「対象リポジトリ（適用先 A〈node:test〉）も 5.9 系のため」になる（`adr-0001-note-draft-final.md` の (2) と同じ）
- **確かめ（実装の段。記録の commit を作る前、stage した差分で）**:
  1. `git diff --cached --numstat` で、置き換えの分の変わったファイルが上の 11 ファイル（記録の commit のほかの変更〈ADR-0001・0008・0028 の注記、ci 手順書、ROADMAP の注記〉は、置き換えの行とは別の行）
  2. 置き換えの分の変わった行が、ちょうど **27 行**（`git diff --cached -U0` の、上の 27 の位置の `-` と `+` の行。位置の一覧は 2.2.1 の表と決定の 2 か所と `M0_REPORT.md:16`。記録の commit のほかの変更は、別の行に足すか書き換えるので、この 27 行と重ならない）
  3. **各行で、置き換えた単位のほかの文字が変わっていない**: 前の行の各単位を「A の印」「B の印」「メールの印」に替えたものと、後の行の置き換えの形（上の 1〜4。種類の括弧を含む）を同じ印に替えたものが、文字列として同じ（一回きりのスクリプト。commit しない。結果の 27 行の一致を記録する）
  4. 置き換えた後に、2.2.1 と同じ型で追跡しているファイルを走査し、**適用先の名前が 0 件**、メールアドレスの形が `tests/` の `example.invalid` の 37 行だけ
  5. `git diff --cached --stat -- 'docs/reviews/*/review-r*.md'` が空（レビューの原文を変えない）。`docs/reviews/*/findings-r*.json` も変わらない
  6. 記録の commit の SHA 固定の worktree で、typecheck・lint・全テスト・`npm run verify`（いつもの検証）
- **過去の記録の文面を変えること**: CHANGELOG の過去の版の項・過去の報告（`docs/reports/`）・過去の設計の記録（`docs/reviews/item48-design/design-r2.md`）・ROADMAP の記録の文も、名前とメールの値だけを変える。v0.18.3 の CHANGELOG の項に 1 行で書く（文案: 「公開の文の適用先の名前〈26 行・11 ファイル。過去の版の項・報告・設計の記録を含む〉を『適用先 A〈node:test〉』『適用先 B〈pytest〉』の書き方に、報告の 1 行のメールの値を言葉に置き換えた〈人間の決定 B5-D-Q8・B5-D-Q9〉。単位の外の文字は変えていない。置き換える前の形は過去の commit に残る」）。名前そのものは書かない
- README の状態の行（`README.md:50`）は、記録の commit で置き換えた後、release の commit で v0.18.3 の説明を足して書き直す（2.の確かめの 27 行は記録の commit だけで数える）

### 2.3 設計の記録（`docs/reviews/batch5-design/`。batch4 と同じ形）

- 入れるもの（B5-D-Q5 = A）: `design-final.md`、`questions-final.md`（B5-D-Q1〜B5-D-Q9）、`adr-0001-note-draft-final.md`・`adr-0008-addendum-draft-final.md`・`adr-0028-note-draft-final.md`・`ci-doc-section3-draft-final.md`、`batch5-scope-summary-r1.md`、`c44-probe-r1.md`、設計 R1・R2・R3 の取り込み（`findings-r<N>.json`・`review-r<N>.md`・`response-r1.md`・`response-r2.md`）
- 設計 R1・R2・R3 の本文（`batch5-design-r1.md`・`batch5-design-r2.md`・`design-r3.md`）は公開リポジトリの外に置き、`design-final.md` に各回からの変更の表を書く（batch4 と同じ）
- 取り込み: `aiqh review-import ~/Downloads/independent-review-batch5-design-r1-for-claude.md --label batch5-design --round 1 --id-prefix B5-D`（受け取ったファイルを絶対パスで。`--cwd` は省略〈リポジトリの直下〉）。round 1 なので JSON に `previous` を書かないよう依頼文で頼んでいる。続けて R2・R3 を `--round 2`・`--round 3` で。`aiqh review-check --label batch5-design` が exit 0（R1・R2 の取り込みは、設計の段に使い捨ての `--cwd` で試し、どちらも exit 0。`response-r2.md`）
- 収録: `review-r1.md` は先頭に収録の注記（受け取ったファイルのバイト数・SHA-256、ダウンロードかコードブロックからの保存か、レビュアーが読めた範囲）。R1 の結果のファイル（18,063 バイト、SHA-256 `b7992dffbadfad5536af5b5f1da50e869718be936a8c3100c2c2e209f8c0cec9`）は、ChatGPT の画面の本文を人が claude.ai に貼り、claude.ai の側で作った写しの見込みで、ChatGPT の原文かは確かめられない（最後の `~~~~markdown` のブロックも無い）。そのことも注記に書く、その後ろは原文とバイト単位で同じ（Security Scan に当たる例示行があれば分割表記にし、行番号と原文の SHA-256 を注記に）

### 2.4 v0.18.3 の commit の並び（B5-D-Q1 = A で確定）

| # | commit | 変えるファイル | その commit の検証（SHA 固定の worktree） |
|---|---|---|---|
| 1 | 依存 | `package.json`・`package-lock.json` | §2.1.3 の D1〜D13（全テストは 3 回。D13 は 7 の 3 か所）、typecheck・lint・全テスト・`npm run verify`・`npm run verify:dist` |
| 2 | 記録 | ADR-0001・0008・0028、`docs/ops/ci-and-branch-protection.md`、`docs/ROADMAP.md`、適用先の名前とメールの値の置き換え（27 行・11 ファイル: `CHANGELOG.md`・`README.md`・`docs/ARCHITECTURE.md`・`docs/ROADMAP.md`・ADR-0001・ADR-0031・ADR-0036・`docs/reports/M0_REPORT.md`・`docs/reports/M3_COMPLETION.md`・`docs/reviews/item48-design/design-r2.md`。§2.2.2） | §2.2.2 の確かめ 1〜5、typecheck・lint・全テスト・`npm run verify`（docs の決まりのテスト〈禁止文字・版の一致など〉を含む） |
| 3 | 設計の記録 | `docs/reviews/batch5-design/`（設計 R1 の取り込みを含む） | 同上。`aiqh review-check --label batch5-design` が exit 0 |
| 4 | release | `package.json`・`package-lock.json`（`npm version 0.18.3 --no-git-tag-version`）、`CHANGELOG.md`、`README.md`（`:50`・`:66`）、ROADMAP の v0.18.3 の項 | typecheck・lint・全テスト・`npm run verify`・`npm run verify:dist`、lock の全欄の比べ（ルートの 2 つの `version` のほかが変わらない） |

- 各 commit の前に、stage した差分を push の前の走査と同じパターンで走査し、当たりを 1 つずつ読んでから commit する（プロジェクトの決まり）
- 2 と 3 は 1 に依らない（1 を外しても 2〜4 で記録だけの v0.18.3 を作れる。B5-D-Q7）。ただし 4 の CHANGELOG・README は、1 の有無で中身が変わる
- 2 の置き換えの確かめは §2.2.2（27 行・単位の外の文字が同じ・走査で 0 件・レビューの原文が変わらない）
- 公開に入れる文（2〜4）は、適用先の名前・手元のパス・URL の手元の部分・人や会社の名前・メールアドレス・生の文字・`\u` の字面の走査をしてから commit する（`\u{A}` のような表記の例は、意図した ASCII の字面として当たりを読む）

## 3. v0.18.4（src のコードを 1 行）

### 3.1 変更（B5-Q8 = A）

1. **今**【実測: コードの読み】: `src/report/markdown.ts:130` は `` lines.push(`- Command: ${codeSpan(cell(c.command))} (cwd: ${codeSpan(oneLine(c.cwd))})`); ``。表の行（`:65`）は `` `… | ${codeSpan(cell(c.command))} |` ``
   - `cell()`（`:201-203`）: `return escapeCell(oneLine(text));`。`escapeCell()`（`:210-212`）: `text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")`
   - `oneLine()`（`:206-208`）: `return escapeRawChars(text);`（`src/security/raw-chars.ts:414-416`。禁止文字の集合〈C0 の TAB・LF 以外、DEL・C1、U+2028・U+2029、方向の制御、U+FEFF〉と Security Scan と同じ判断の見えない文字、**それに LF と TAB** を `\u{HEX}` の表記にする）
   - したがって `cell(x)` と `oneLine(x)` の違いは、**`|` を `\|` にするかどうかだけ**。`escapeCell()` の改行の置き換え（`\r?\n` → 空白）は、`oneLine()` が先に LF を `\u{A}`、CR を `\u{D}` にしているので、当たる文字が残らない【実測: 下の表】
2. **直し**: `:130` を `` lines.push(`- Command: ${codeSpan(oneLine(c.command))} (cwd: ${codeSpan(oneLine(c.cwd))})`); `` にする（コードの変更は 1 行）。表の行（`:65`）は変えない（GFM の表のセルでは `|` のままだとセルが分かれる）
   - 同じ関数の直前の注釈（`:128-129`。「Outside the table the backslash of cell()'s `\|` shows (a known limit, B4-D-Q6 …)」）は、直した後は誤りになるので、同じ commit で書き直す（振る舞いは変えない注釈だけの 2 行）。B5-Q8 の「src 1 行」は、振る舞いを変えるコードの行の数と読む（読み方が違えば人間が決める）
3. **表の外の行の、場合ごとの書き方**【実測: `c44-probe-r1.md` の表 1。1 つの FAIL の check の `latest.md` を `renderMarkdown` で作り、Checks の表のセルと `- Command:` の行を取り出した。`cwd` は `.`】

各場合の、表のセル（v0.18.2・v0.18.4 で同じ）と、`- Command:` の行の code span（v0.18.2 → v0.18.4）。表にすると、セルの中の縦棒で表が崩れるので、箇条書きにした（GFM の表のセルでは、code span の中でも縦棒でセルが分かれる）。

- LF（`a`・U+000A・`b`）: 表のセル `` `a\u{A}b` ``。`- Command:` は v0.18.2・v0.18.4 とも `` `a\u{A}b` ``（1 行のまま）。**変わらない**
- CR（`a`・U+000D・`b`）: 表のセル `` `a\u{D}b` ``。`- Command:` も同じ。**変わらない**
- CRLF（`a`・U+000D・U+000A・`b`）: 表のセル `` `a\u{D}\u{A}b` ``。`- Command:` も同じ。**変わらない**
- TAB（`a`・U+0009・`b`）: 表のセル `` `a\u{9}b` ``。`- Command:` も同じ。**変わらない**
- 縦棒（`npm test | tee log`）: 表のセル `` `npm test \| tee log` ``（GFM の表では縦棒だけが描かれる）。`- Command:` は v0.18.2 `` `npm test \| tee log` ``（バックスラッシュが見える）→ v0.18.4 `` `npm test | tee log` ``。**変わる**（1 バイト減る）
- バッククォート（`` a `b` c ``）: 表のセル ``` ``a `b` c`` ```。`- Command:` も同じ。**変わらない**
- 両端の空白（前後に空白 1 つずつの `a b`）: 表のセル `` `  a b  ` ``。`- Command:` も同じ。**変わらない**
- 空: 表のセルは空（code span を書かない）。`- Command:` も空（`- Command:` の後に空白 2 つ）。**変わらない**（設定の `command` は空白だけを許さない: `src/config/schema.ts:25`）
- 縦棒と LF（`a |`・U+000A・`b`）: 表のセル `` `a \|\u{A}b` ``。`- Command:` は v0.18.2 `` `a \|\u{A}b` `` → v0.18.4 `` `a |\u{A}b` ``。**変わる**
- 縦棒とバッククォート（`` npm test | grep `x` ``）: 表のセル ``` `` npm test \| grep `x` `` ```。`- Command:` は v0.18.2 ``` `` npm test \| grep `x` `` ``` → v0.18.4 ``` `` npm test | grep `x` `` ```。**変わる**
- コマンドの中のバックスラッシュの後の縦棒（`a \| b`）: 表のセル `` `a \\| b` ``。`- Command:` は v0.18.2 `` `a \\| b` ``（バックスラッシュが 2 つ見える）→ v0.18.4 `` `a \| b` ``（書いたとおり）。**変わる**
- 両端が縦棒（`| x |`）: 表のセル `` `\| x \|` ``。`- Command:` は v0.18.2 `` `\| x \|` `` → v0.18.4 `` `| x |` ``。**変わる**

   - 変わるのは `|` を含むコマンドの `- Command:` の行だけ。`|` 1 つにつき 1 バイト減る。表のセル・`cwd:` の部分・Summary の行・ほかの行は、どの場合も変わらない【実測: 12 の場合の前後の比べで、差は `|` を含む 5 つの場合の `- Command:` の行だけ】
   - v0.18.4 の `- Command:` の行は、CommonMark の code span の規則で読み戻すと、どの場合も `oneLine(command)` と同じ文字列を示す（v0.18.2 では `|` を含む 5 つの場合で違った）
   - `|` が表の外のリストの行に生で現れても、GFM の表にはならない: 表は「見出しの行のすぐ後に区切りの行（`|---|`）」が要るが、`- Command:` の行の後は必ず `- Summary:` の行（`:133`）で、区切りの行にならない【コードの読み】

### 3.2 golden

- 見込みと試し【実測: `c44-probe-r1.md` の 3】: 直した src で、`tests/report-golden-input.ts` の 2 組を使い捨ての場所で `writeReports` に書かせると、期待値との差は **`plain/latest.md:73` と `edge/latest.md:79` の 2 行だけ**（どちらも `\|` → `|`、各 1 バイト減る）。`plain/latest.json`・`edge/latest.json` はバイト単位で同じ（コマンドは JSON では生の値）。history のファイルは `latest.json` と同じ
  - `plain/latest.md:73`: `` - Command: `npm test \| tee log` (cwd: `pkg`) `` → `` - Command: `npm test | tee log` (cwd: `pkg`) ``（2,988 → 2,987 バイト）
  - `edge/latest.md:79`: ``` - Command: `` npm test \| grep `x` `` (cwd: `.`) ``` → ``` - Command: `` npm test | grep `x` `` (cwd: `.`) ```（2,914 → 2,913 バイト）
  - 表の中の同じコマンドの行（`plain:40`・`edge:41`）は変わらない
- 期待値の作り方（ADR-0003 の追記〈v0.18.1〉の決定 5。期待値を書き出す道具はリポジトリに入れない）: 使い捨ての場所で、一回きりのスクリプトが `tests/report-golden-input.ts` の入力から `buildReport` → `writeReports` で書き、書かれた `latest.md` を期待値の場所に写す。`latest.json` は写さない（差が 0 であることを `cmp` で確かめる）。期待値を変えるのは C-44 の commit の中だけで、その commit のメッセージと CHANGELOG に、変わる 2 行と理由を書く
- 人の確認（決定 5 とその注記）: 期待値の差（2 行）を、v0.18.4 の実装の独立レビューの依頼文で、入力と照らした独立した節に書いてもらい、その節を人が読んで確かめ、版の後の記録の PR の本文に書く（v0.18.1・v0.18.2 と同じ形）
- `tests/report-golden.test.ts:9-10` の注釈（「v0.18.2's C-44 changed 10 lines of edge/latest.md …; plain/ and edge/latest.json did not change」）に、v0.18.4 で変わった 2 行を足す。`:90-91`（`plain` には C-44 の値が無い）は変わらない（`plain` のコマンドにはバッククォートも両端の空白も無いまま）

### 3.3 テスト（B5-D-Q3）

1. **直す既存のテスト**【実測: 直した src で、既存のテストを変えずに全テストを走らせた FAIL の一覧。`c44-probe-r1.md` の 4】: **3 か所・6 件**（範囲の洗い出しの報告と指示書は「3 件」としたが、`:121` の `it.each` の 4 件が抜けていた）

- `tests/report-golden.test.ts:116`（名前）・`:123`（1 件）: 今は、名前が「… \| in a cell and outside」で、`plain/latest.md` が `- Command:` の行の `npm test` の後にバックスラッシュと縦棒を持つことを確かめる。直した後は、名前を「… \| in a cell and | outside (v0.18.4)」にし、`- Command:` の行が `npm test | tee log`（バックスラッシュなし）を持つこと、バックスラッシュのある形を持たないこと（`not.toContain` を 1 行足す）を確かめる
- `tests/regression-c44-command-code-span.test.ts:121-123`（`it.each(COMMANDS)` の `- Command:` の期待値。4 件）: 名前の「(the `\|` stays outside the table: the known limit)」を「(outside the table a | is written as it is: v0.18.4)」に、期待値の `cellOf(command)` を `escapeRawChars(command)` にする。`COMMANDS` の 15 件のうち縦棒を含む 4 件（a backtick and \|、backticks just before and after \|、a run of three and \|、spaces at both ends and \|）が今は落ちる。ほかの 11 件は両方の形で同じ
- `tests/regression-c44-command-code-span.test.ts:140-152`（`- Command:` の行のバイト列。1 件）: `describe` の名前「… keeps the bytes of v0.18.1」に「(but for a | outside the table: v0.18.4)」を足し、`:151` の期待値を `escapeRawChars(command)` にする。6 件のうち「a \| and a working directory」の 1 件が今は落ちる。表の行の確かめ（`:150` の `cellOf`）は変えない

   - ファイルの先頭の注釈（`regression-c44…:8-11` の「outside the table the backslash of `\|` stays (the known limit, B4-D-Q6)」）も、v0.18.4 の形に書き直す
   - `tests/markdown.test.ts:53`（`` `npm test \\| tee log` `` を含む）は、表の行で今も満たすので変えない
2. **足す回帰テスト**（B5-D-Q3 = A で確定: 既存のファイルの末尾に `describe`「C-44 (v0.18.4)」。`it` 5 つ・7 件）【実測: 直す前に 6 件 FAIL・1 件 PASS、直した後に 7 件 PASS】

- **T1** 表の外の縦棒: `npm test | tee log`・`cwd` `pkg` の `- Command:` の行が、ちょうど `` - Command: `npm test | tee log` (cwd: `pkg`) ``。読み戻すとコマンドそのもの。直す前は FAIL
- **T2** 縦棒とバッククォート: コマンド `` npm test | grep `x` `` の `- Command:` の行の code span が、ちょうど ``` `` npm test | grep `x` `` ```（2 つのバッククォートと両端の空白で包み、縦棒のまま）。読み戻すとコマンドそのもの。直す前は FAIL
- **T3** 縦棒と LF・CR・TAB（`it.each` 3 件）: `- Command:` の行が 1 つで、次の行が `- Summary:`。読み戻すと `escapeRawChars(command)`（制御は表記、縦棒はそのまま）。直す前は 3 件とも FAIL
- **T4** コマンドの中のバックスラッシュの後の縦棒（`a \| b`）: 読み戻すと、書いたとおりの `a \| b`（バックスラッシュ 1 つ）。直す前は FAIL
- **T5** 表のセルは `\|` のまま（対照）: 表の行の末尾が `` `npm test \| tee log` `` のセル、セルの数が 8、読み戻すとコマンドそのもの。直す前も PASS（表の行を `oneLine` にする変異 V3 で落ちる）

3. **テストを先に書く手順**（B5-D-Q6 = A で確定）: v0.18.3 の release の commit の SHA 固定の worktree に、v0.18.4 の C-44 の commit のテストのファイル（`tests/regression-c44-command-code-span.test.ts`・`tests/report-golden.test.ts`）だけを写して走らせ、FAIL の件数と名前を記録する。設計の段の試し（基準の commit の src と期待値に、直した後の 2 つのテストのファイルを当てた）では、2 ファイル・56 件のうち **12 件 FAIL**（足す 7 件のうち 6 件と、直す既存の 6 件）・44 件 PASS。直した後に全件 PASS。実装の段では、v0.18.3 の release の commit で同じことを記録する

### 3.4 互換性（B4-Q9 の決め直し）

- **決め直しの範囲**: B4-Q9（batch4。v0.18.2）の「C-02 の golden でバッククォートの無い値の出力が同じことを示す」を、**`|` を含むコマンドの、失敗の詳細（FAIL・SKIPPED の check）の `- Command:` の 1 行に限って**決め直す（B5-Q8）。その行では `\|` が `|` になる
  - 変わらないもの: 同じ check の Checks の表の行、`cwd:` の部分（`cwd` は v0.18.2 から `oneLine()`）、Summary の行、`|` を含まないコマンドの行、`latest.json`・history のファイル、端末の出力、判定・終了コード、`schemaVersion`
  - 失敗の詳細に出るのは PASS でない check だけ（`:72`）。PASS の check のコマンドは表の行だけで、変わらない
- **実際の設定に当たる値が無い**【記録: 範囲の洗い出し】: aiqh 自身の `aiqh.config.jsonc` の 8 つ、適用先 A の 5 つ、適用先 B の 2 つの check の `command` に `|` は 0 件。aiqh 自身の Job Summary（`reusable (self)`）と適用先の出力は変わらない見込み。H11 は行わない（B5-Q3）。適用先 A・B は、`latest.md` を job の外に出していない（`job-summary` を使っていない）
- **影響を受けうる読み手**: `latest.md` の `- Command:` の行を文字列で比べる外の道具（`|` を含むコマンドのときだけ）。リポジトリの中の読み手は `latest.md` のこの行を読まない（review-packet は `latest.json`、`aiqh history` は `history/`。README の「組で読む」の段落）【コードの読み: `renderMarkdown` を使うのは `src/report/write.ts:21` だけ】
- **書く所**: README の状態の行（B5-D-Q4 = A で確定）、CHANGELOG の v0.18.4 の項（変わる行と理由。golden の 2 行）、ADR-0028 の `:176` を「解消（v0.18.4）」に書き換え、`:175` に 1 文（`adr-0028-note-draft-final.md` の (2)）
- **ADR-0026〜0028 のほかの注記**【実測: `git grep` で `\|`・「表の外」・`- Command:` を探した】: 当たりは ADR-0028 の `:175`・`:176` だけ。ADR-0026・ADR-0027（review-import・review-check）は、`latest.md` のコマンドの書き方に触れていない。ADR-0003 の追記（golden の決まり）は変えない（決定 5 の手続きのとおりに期待値を変える）
- 新しい ADR は要らない（ADR-0028 の決定〈表示だけ・判定に使わない〉の中の表示の直しで、既知の限界の解消）

### 3.5 変異（各変更に、落ちるべきテストを対応させる）【実測: 直した src に 1 つずつ当て、全テスト〈192 ファイル・3,022 件〉を走らせた。`c44-probe-r1.md` の 5】

| # | 変異 | 見込み | 実測（FAIL / 3,022） | 落ちたテスト |
|---|---|---|---|---|
| V1 | `:130` を `cell()` に戻す（v0.18.2 の形） | 新しい 6 件、直した既存の 5 件、golden の 2 つの比べ | **13** | T1〜T4（6 件）、`:121` の 4 件、`:140` の 1 件、golden の `plain`・`edge` の書かれたファイルの比べ 2 件（期待値の中身の確かめ `:116` は期待値のファイルを読むので落ちない） |
| V2 | `:130` の `oneLine()` を、改行を表記にしない形（`escapeRawCharsKeepingLineBreaks`）にする | T3 の LF・TAB の 2 件（CR は禁止文字なので、どちらの形でも表記になる） | **2** | T3 の LF・TAB |
| V3 | 表の行（`:65`）も `oneLine()` にする | T5、表の `\|` を含む既存の件、golden の比べ、期待値の中身の確かめ | **9** | T5、表のセルの `it.each` の `\|` を含む 4 件、`:140` の a \| and a working directory（表の行の確かめ）、`tests/markdown.test.ts` の「lists every check and escapes pipes in commands」、golden の `plain`・`edge` の比べ 2 件 |
| V4 | `:130` の `oneLine()` を外す（`codeSpan(c.command)`。生の値） | T3 の 3 件、生の文字（U+202E）を含む既存の件 | **5** | T3 の LF・CR・TAB（3 件）、生の文字（U+202E）を含む既存の 2 件（`:121` の a raw character and a backtick、`:140` の a raw character）。golden は落ちない（golden のコマンドに制御文字・生の文字が無い） |
| V5 | `:130` を 1 つのバッククォートで包む形に戻す（`` `${oneLine(c.command)}` ``。C-44 の前の形） | バッククォートを含むコマンドの件、両端の空白の件、golden の `edge` | **17** | `:121` の `it.each` のうちバッククォートか両端の空白を含む 14 件、`:133` の 6 つの連なりの件、T2、golden の `edge` の比べ 1 件（1 回目は変異の文の誤り〈テンプレート文字列の中の生のバッククォート〉で `markdown.ts` が構文の誤りになり、65 ファイルが読み込めずに 177 件 FAIL・2,363 件だけ走った。バッククォートをエスケープして走らせ直した値） |

- 等しい変異（振る舞いが変わらないので、どのテストも落ちないもの）: `:130` を `codeSpan(escapeCell(oneLine(c.command)).replace(/\\\|/g, "|"))` のように `|` だけ戻す形は、`oneLine()` と同じ文字列を返す（`escapeCell()` の改行の置き換えは当たらない）。試していない
- 変異の実測は、使い捨ての worktree で、変異ごとに直した形へ戻した（`cmp` で一致を確かめた）

### 3.6 v0.18.4 の commit の並び（B5-D-Q6 = A で確定）

| # | commit | 変えるファイル | 検証 |
|---|---|---|---|
| 1 | C-44 の残り | `src/report/markdown.ts`（`:130` の 1 行と `:128-129` の注釈）、`tests/fixtures/report-golden/plain/latest.md`・`edge/latest.md`（各 1 行）、`tests/regression-c44-command-code-span.test.ts`（直す 2 か所・5 件、足す 7 件、先頭の注釈）、`tests/report-golden.test.ts`（直す 1 件、先頭の注釈） | テストを先に書いた記録（§3.3 の 3）、typecheck・lint・全テスト・`npm run verify`、変異 V1〜V5 を実装の段でもう一度、`git diff --stat -- tests/fixtures/` が 2 ファイル・各 1 行 |
| 2 | 文書 | ADR-0028（`:175` に 1 文、`:176` を解消に）、ROADMAP（v0.18.4 の項の下書き） | typecheck・lint・全テスト・`npm run verify` |
| 3 | release | `npm version 0.18.4 --no-git-tag-version`、CHANGELOG、README（`:50`・`:66`）、ROADMAP の v0.18.4 の項 | 同上と `npm run verify:dist`、lock の全欄の比べ |

## 4. レビューと記録の流れ

### 4.1 流れ

1. 設計 R1（High 0 / Medium 2）→ 設計 R2（High 0 / Medium 1。R1 の 2 件は解消）→ 設計 R3。取り込みは v0.18.3 の実装の段で、R1・R2・R3 の順に（`aiqh review-import … --label batch5-design --round 1 --id-prefix B5-D`、続けて `--round 2`・`--round 3`）。R3 が High・Medium 0 なら設計のレビューを終える
2. v0.18.3（2026-11-12T05:40Z 以降に着手）→ 実装 R1（label `batch5-v0183-impl`、接頭辞 `B5-I183`。依頼文に、D13 の 3 か所の値と、telemetry の確かめの順と結果を書く）→ v0.18.3 の後の記録の PR（取り込み・収録・CI・タグ・merge の commit の作者のメールの形）
3. v0.18.4 → 実装 R1（label `batch5-v0184-impl`、接頭辞 `B5-I184`。依頼文で、golden の期待値の 2 行の差を、入力〈`tests/report-golden-input.ts`〉と実ファイル〈commit した期待値〉の**双方から独立に**照らした独立した節を頼む: §3.2、R1 の問い 4 の注意）→ v0.18.4 の後の記録の PR で batch5 を締める
4. H11 は無し（B5-Q3）。適用先 A・B の呼び出しは v0.18.2 のまま

- 接頭辞は `-R` と数字で終わらない（v0.18.2 の決まり。`B5-D`・`B5-I183`・`B5-I184` はどれも当たらない）
- 各回の依頼文は `docs/ops/review-request-template.md` の形（パケットの md 本体も添付、ダウンロードが失敗したときの全文のコードブロック、round 1 の JSON に `previous` を書かない）。実装者の確かめ（各 commit の検証の結果・直す前の FAIL・変異の結果）は、数・名前・終了コードを依頼文に書く

### 4.2 タグ

- v0.18.3・v0.18.4 のタグは、ruleset `tag-protection` の下の **3 回目・4 回目の作成**。ci 手順書 §8 の手順 7（1〜6）のとおり、release の commit の 40 桁の SHA に注釈付きタグを付け、送る前の確かめ（手元だけのタグの名前の集合、送る対象の 5 点）、`git push origin refs/tags/vX.Y.Z` を 1 回だけ、送った後の `git ls-remote` の 2 行。送るのが失敗した・結果が分からないときは、送り直さずに止まる
- タグを付ける前に、merge の commit の main の run の必須の 2 つが success であることを `gh` で確かめる

### 4.3 版の後の記録の PR と、merge の commit の作者のメール

- 各版の後に、docs だけの記録の PR（branch `docs/v0.18.3-record`・`docs/v0.18.4-record`）で、CHANGELOG の見出しの SHA、ROADMAP の CI・タグ・実装 R1 の結果を書く（v0.18.2 と同じ）
- **merge の commit の作者のメール**（人間の設定 2026-11-08）: v0.18.3 の最初の merge（PR の merge）の後に、`git log -1 --format='%ae' <merge の commit>` を読み、値が GitHub の noreply の形（`users.noreply.github.com` で終わる）かどうかだけを、版の後の記録に「noreply の形だった／ではなかった」と書く。**値そのものは公開の記録に書かない**。ではなかったときは、人間に知らせて止まる（記録の PR の merge の前に）

## 5. 設計の本文で決めたこと（問いにしなかったもの）

| 事柄 | 決めたこと | 理由 |
|---|---|---|
| ADR-0028:176 の注記を、いつ・どう書くか | v0.18.3 で描画の実測の注記（「v0.18.4 で解消する予定」）、v0.18.4 で本文を「解消」に書き換え（v0.18.2 の文は引用で残す） | v0.18.3 と v0.18.4 の間で、実測の事実と予定が両方読める。既存の ADR の文は消さない（プロジェクトの決まり: 置換・注記で残す） |
| `markdown.ts:128-129` の注釈 | v0.18.4 の C-44 の commit で書き直す | 直した後は誤りの注釈になる。振る舞いは変えない（§3.1 の 2） |
| v0.18.4 の golden の人の確認 | 実装 R1 の依頼文で独立した節を頼み、人が読んで確かめる | ADR-0003 の追記の決定 5 の注記（v0.18.1・v0.18.2 と同じ） |
| vitest 5.1.0 の changelog | 着手時に読む（読むだけの GET） | 設計の段では入れて試せない。読む時点の版の記述を見る |
| 依存の commit の作り方 | 試しの worktree の lock を写さず、release の branch で同じコマンドを走らせ、試しの lock と全欄の比べで同じことを確かめる | 写すと、試しの場所の差（cache など）が混ざる見込みを確かめられない |
| C-06 | 書き足さない | v0.18.1 で閉じた記録がある |
| 版の固定のしかた（R2） | `npm install --save-dev vitest@~5.1.0` と `npm update vite` のまま、前の registry の確かめ（§2.1.3 の 2）と後の D13 で挟む | 正確な版を指定する形（`vitest@5.1.0` に保存の接頭辞の設定を足すなど）は、`package.json` の範囲の書き方が変わりうる（vite の範囲は `~8.3.5` のままの決定）。前後の確かめで、npm の選択がずれたら止まる |
| 空の `GH_TELEMETRY`・`DO_NOT_TRACK`（R2） | 空は止める側、`DO_NOT_TRACK` には頼らない | 文書の要約では無効になる値だが、未設定と見分けにくい。止めすぎる側に置く |
| ROADMAP の項目 50 の記録 | 項目 42 の記録の値で、50% の線（300 秒）に届かないことを 1 文 | 項目 50 は「項目 42 が T4 の 50% を超えたら選び直す」 |

## 6. 既存のテストの期待値が変わるもの

- v0.18.3: 無い【推定】（依存の更新で全テストの結果が同じことを D7 で確かめる。期待値が変わるテストが出たら止める: B5-D-Q7）
- v0.18.4【実測】: §3.3 の 1 の 3 か所・6 件（`tests/report-golden.test.ts:116-125` の 1 件、`tests/regression-c44-command-code-span.test.ts:121-123` の 4 件と `:140-152` の 1 件）と、golden の 2 つの `latest.md`（各 1 行）。ほかは無い（直した src で、既存のテストを変えずに全テストを走らせ、落ちたのはこの 6 件だけ）

## 7. 却下した案（batch5 の範囲外）

範囲の洗い出しの大案の候補は、すべて batch5 の範囲外（人間の決定）: review-import v3（B5-Q7）、C-57・項目 56・53-G（B5-Q9）、C-07 の残り・C-51（B5-Q10）、commander 15.1.0（B5-Q2）、H11（B5-Q3）、tag-protection の実地の確かめ（使い捨ての公開リポジトリ・本物のタグ・aiqh の使い捨てのタグ。B5-Q5）、sha_pinning の実地の確かめ（B5-Q11）。

この設計の中で採らなかった案（理由は `questions-final.md`）:
- 表の行も `oneLine()` にする案（GFM の表のセルが分かれる。変異 V3 で確かめる形）
- `|` を `\|` 以外の形（例: 文字参照）にする案（`latest.md` は文字参照を使わない形で書いてきた〈ADR-0028 の追記〈v0.8.1〉〉。表の外では `|` のままで描画が壊れない: §3.1 の 3）
- テストの commit を直しより先に分ける案（B5-D-Q6 の B）、回帰テストを新しいファイルにする案（B5-D-Q3 の B）
- 依存の commit を、外れた依存だけ外して続ける案（B5-D-Q7 の B）
- 適用先の名前を、決定の 2 か所だけ置き換える案・今の状態を書く文だけ置き換える案（B5-D-Q8 の C・B）、報告のメールの値を残す案（B5-D-Q9 の B）
- telemetry を設定（`gh config get telemetry`）だけで確かめる案（R1 の形。B5-D-R1-002）
- 版を npm の選択に任せ、結果の版を照らさない案（R1 の形。B5-D-R1-001）

## 8. 確かめていないこと

- vitest 5.1.0・vite 8.3.6 を入れた振る舞い（設計の段では入れていない。`min-release-age=7` の待ち）。それぞれの changelog
- lock の変化の項目の数（§2.1.2 は見込み）。vitest 5.1.0 の依存の一覧
- v0.18.4 の出力の、GitHub での描画（v0.18.2 の出力の描画は範囲の洗い出しで GET した。v0.18.4 の形は、同じ描画の規則〈表の外の code span の中の `|` はそのまま〉からの判断）。Job Summary・エディタのプレビューの描画
- 表のセルの中の、コマンドの中のバックスラッシュの後の `|`（`a \| b` は表のセルで `a \\| b` と書く）の GFM の描画（v0.18.2 から変わらず、v0.18.4 でも変えない所）
- v0.18.3 の release の commit での、直す前の FAIL の件数（設計の段は基準の commit で数えた: 12 件。v0.18.3 は src と golden を変えない見込みなので、同じ数の見込み）
- tag-protection の下で消すこと・付け替えることが実際に拒まれるか（B5-Q5 で、確かめない範囲として閉じる）、適用先の run にどちらの `sha_pinning_required` が当たるか（B5-Q11 で同じ）
- GitHub の文書と gh の release notes は、範囲の洗い出しの要約の読みに依る（原文の一字一句は照らしていない）
- Windows・Ubuntu での振る舞い（手元は macOS だけ。Ubuntu は版の PR の run で確かめる）
- **CI の log での vitest・vite の版**（読む方法が無い。§2.1.3 の 7。CI の版は lock と `npm ci` の決まりに依る）
- `GH_TELEMETRY` が無い起動経路（GUI のアプリなど、対話のシェルの設定を通らないもの）は aiqh の手順の外。そこで gh を使っても、設定（`disabled`）は残る（設定の効き方は文書の要約の読み。試していない）
- **置き換える前の適用先の名前は、過去の commit の履歴と、GitHub の過去の commit・タグの表示に残る**（履歴の書き換えはしない。人間の決定で受け入れた）
- R1・R2 の結果のファイルが ChatGPT の原文と同じか（どちらも claude.ai の側で作った写しの見込み。§2.3、`response-r2.md`）
- 過去の記録の文面（CHANGELOG の過去の版の項・過去の報告・過去の設計の記録・ROADMAP の記録）も、名前とメールの値だけを変える（人間の決定 B5-D-Q8・B5-D-Q9。変えたことは v0.18.3 の CHANGELOG の項に 1 行。§2.2.2）。置き換えの決まりの 3（種類を各行の最初の出現にだけ足す）で、行によっては読みにくくなりうる（実装の段の差分で人が読む）

## 付録 A. この段の測り方（どれも commit しない。作業の記録は git 管理外の作業の場所）

- A1（§0）: `git fetch origin --tags`（`--prune` なし）、`git log --oneline -1 --decorate`、`git rev-parse HEAD origin/main`、`git status --short`、`gh pr list --state open`、`gh --version`、`gh config get telemetry`、`printenv GH_TELEMETRY`
- A2（§3。C-44 の残りの試し）: 基準の commit に `git worktree add --detach`、その中で `npm ci`（cache と log は作業の場所。lock・`package.json` の SHA-256 は前後で同じ）。直す前に golden・C-44・`markdown.test.ts` の 3 ファイルを走らせ、§3.3 の 2 の 7 件を足して直す前の FAIL を数え、`:130` を直し、場合ごとの表（`renderMarkdown` の行を取り出す一回きりのスクリプト）、golden の書き直し（`writeReports` で使い捨ての場所に書き、期待値と `diff`・`cmp`）、既存のテストを変えない全テスト（落ちるものの一覧）、既存のテストを直した全テスト・typecheck・lint、変異 V1〜V5（1 つずつ当てて全テスト、戻して `cmp`）。最後に worktree を `git worktree remove`（`--force` なし）。詳細と数は `c44-probe-r1.md`
- A3（§2.1.2）: 基準の commit の `package-lock.json` を読み、項目の数・`dev` の印・vitest と vite の依存の範囲・`@vitest/` と rolldown の系の項目を数えた（npm の registry は読んでいない）
- A6（R3）: R2 の結果を使い捨ての `--cwd` に R1 の取り込みの結果を置いた形で取り込み（round 2）、`review-check`。`design-r3.md`・`design-final.md` のファイル名の参照を抜き出して照らした（`ref-check-r3.md`）
- A5（R2。§0・§2.2.1）: gh より先に `printenv GH_TELEMETRY`、`zsh -c`・`caffeinate -i zsh -c`・`bash -c`・`zsh -f -c`・`env -u GH_TELEMETRY zsh -c`・`env -u GH_TELEMETRY zsh -i -c` で `printenv GH_TELEMETRY`（gh は走らせていない）。公開の文の走査は、追跡しているファイルを `git show HEAD:<path>` で読み、型ごとに位置だけを出す一回きりのスクリプト（名前は出さない）
- A4（§3.4）: `git grep` で ADR・README・ARCHITECTURE・CONFIG_SPEC の `\|`・「表の外」・`- Command:` と、`src/` の `renderMarkdown` の使い手を探した

## 付録 B. ROADMAP の文案（v0.18.3 の記録の commit）

### B.1 項目 42（`:879`）・50（`:887`）・56（`:893`）の末尾に足す注記

> - 項目 42 の末尾: 見張りの値（2026-11-08。batch5 の範囲の洗い出し）: main の push の直近 10 本（run 40955597224〜42432881898、2026-10-29〜11-08、すべて success。2 つの job の 20 の値）で、`unit` は最大 172.3 秒（28.7%）・中央値 145.7 秒（24.3%）、`unit-minpath` は最大 171.3 秒（28.6%）・中央値 141.7 秒（23.6%）。72%・80% の線に届かない。同じ run の 2 つの job の差は最大 59 秒（1 回の値でなく続けて見る）
> - 項目 50 の末尾: （2026-11-08）項目 42 の直近 10 本の最大は 172.3 秒で、T4 の 50%（300 秒）に届かない。選び直さない
> - 項目 56 の末尾: 見張りの値（2026-11-08）: 適用先 A の直近 3 本（v0.18.2 の回の PR と main、v0.18.0 の回の main）の node:test の check は、どれも `parsed: node-test — tests 113 (pass 113, fail 0); suites 0`（`output-truncated` は出ていない）。選び直さない

### B.2 項目 53（`:890`）の末尾に足す注記（53-G）

> - 53-G の見張りの値（2026-11-08。batch5 の範囲の洗い出し。人間の決定 B5-Q9 = A で後の候補のまま）: aiqh のリポジトリの Actions の run は 84 本（2026-10-12T11:19Z〜2026-11-08T01:07Z。53-F を入れた v0.15.1 より前から）で、84 本すべて success、再実行（`run_attempt` が 2 以上）0。PASS の check の上限に近いテストの行は CI の log に出ない（`latest.json` の `stderrTail` にだけ残り、CI では artifact を上げない）ので、上限への近さは CI からは読めない

### B.3 `:1029`（適用先 A の依存の見張り）の末尾に足す注記

> - 注記（2026-11-08。batch5 の範囲の洗い出し。適用先 A の `npm audit --json` を読んだだけ）: 勧告は 3 つ。GHSA-gcqx-w48m-w2h4（deepmerge。low。公開 2026-09-18T18:31:44Z。直った版は無い）、GHSA-3g3m-2fjr-6pw4（glob。moderate。公開 2026-10-30T23:09:11Z。直った版 14.0.2）、GHSA-g3hv-75wg-m249（minimatch。moderate。公開 2026-10-30T23:09:55Z。直った版 11.0.1。aiqh の moderate 10 件と同じ勧告）。moderate 4 件・low 2 件は、勧告のパッケージと依存の道の上のパッケージを数えたもの。glob と minimatch の勧告の公開は、v0.18.0 の回の適用先 A の main の run（2026-10-31T00:21Z）の約 1 時間前で、上の「脆弱性データの側の変化」の推定と矛盾しない（推定のまま。確かめていない）。上げるかは適用先の判断（aiqh の範囲外）
