# aiqh batch2 設計（最終。ROADMAP の項目 50〜55）

作成: 2026-10-26（R1・R2・最終は同じ日）。基準の commit: `8650a72355e8b606af0ee815044a525b5350e5bd`（公開リポジトリの main。v0.15.0 の後の記録の PR #19 の merge）。この段では、コード・テスト・docs の追跡しているファイルを変えていない。決めることは `docs/reviews/batch2-design/questions-final.md`（B2-Q1〜B2-Q16。すべて確定）、各回への応答は `response-r1.md`・`response-r2.md`（同じフォルダ）。

## R2 からの変更（最終版）

設計 R2 の独立レビュー（batch2-design R2。High 0 / Medium 2 / Low 1）を受けた人間の決定（2026-10-26）: **設計を直して R3 は出さない**。3 件は設計に反映し、各版の実装レビューで確かめる（batch1 の設計 R3 と同じ扱い。B2-Q16 の決め直し）。B2-Q1〜B2-Q15 は R2 で書き換えた中身のまま確定。v0.15.1 の範囲は 53-F・50-A/B・51-A・55-A（B2-Q13 の V1）で、src は変えない。応答は `response-r2.md`。

| 指摘 | 重要度 | 対応（この最終版で直した所） | 確かめる版 |
|---|---|---|---|
| B2-D-R2-001（54 の LF だけの分割では、CRLF の CR が security の check と食い違う） | Medium | 判断の前に、LF の直前の U+000D と、文字列の終わりの U+000D を、`src/security/scan.ts` の `LineAssembler` と同じ条件で、層 (c) の判断から外す（元の文字列と位置は保ち、字面は変えない）。禁止の集合の CR の扱い（パケットは拒む・表示は表記）は今のまま。N8 に CRLF・単独の CR・CR CR LF・終わりの CR・長い行と CRLF の分割を足した（§5.6・§5.8、ADR-0039 の案の決定 1） | v0.17.0 の実装レビュー |
| B2-D-R2-002（53-F の受け入れの条件が、17 の形すべての判定と時間の予算を固定しきれていない） | Medium | 受け入れの条件を 4 つにした: 17 の形 × 5 つの道具の全部の組で測りが完走し、絶対・比・作業量の時計の 3 つを評価できたこと／打ち切り（timeout）は検出の成功に数えず別に記録／テストの時間が 40 秒を超えたら T3 の式で根拠つきで決め直す／二乗の変異は実際の P3 のテストを通して落ちた箇所を記録する（§4.6・§4.8） | v0.15.1 の実装レビュー |
| B2-D-R2-003（50-B の `text` の照らしでは、AST だけの書き換えを見つけられない） | Low | 表は `tests/structure/typescript.ts` の外に出さない（helper の export の一覧をテストで固定する）。AST だけの書き換え（`text` は同じ）は見つけない、を 50-B の残る制限として、この設計と helper の説明に書いた（50 には ADR が無い）。理由は §1.6（TypeScript 自身の束縛が共有の SourceFile に書き込むので、凍らせられず、正当な書き込みと呼び手の書き込みを見分けられない。全ノードの照らしは、使い回しの利益の大半を消す） | v0.15.1 の実装レビュー |

## R1 からの変更（R2）

設計 R1 の独立レビュー（batch2-design R1。High 0 / Medium 3 / Low 2）の 5 件に、すべて対応した（人間の決定 2026-10-26: Low も R2 で直す）。指摘ごとの対応の詳細は `response-r1.md`。

| 指摘 | 重要度 | 対応 | 直した所 |
|---|---|---|---|
| B2-D-R1-001（50-B の SourceFile のキャッシュの同一性と無効化の条件が足りない） | Medium | 鍵を「正規化したパス・今読んだ中身の SHA-256・解析の条件・SourceFile に効く 11 の compiler options」にした（TypeScript の言語サービスの鍵と同じ options）。鍵が作れないときは使い回さない（fail closed）。渡す前に中身を確かめ、書き換えられていれば捨てて作り直す。試作で、有り無しの等価・編集の前後・違う解析の条件・fixture との混在・汚染を確かめた | §1.5・§1.6・§1.8、B2-Q1、付録 A10 |
| B2-D-R1-002（54 の表示と JSON の保存を区別していない。RGI を判断する範囲が決まっていない） | Medium | 判断は元の文字列の上で、LF で分けた 1 行ずつ（run は LF をまたがない）。表示の経路は表記、保存の経路（ファイルの JSON）は値を変えずに、値の上で決めた位置だけを `\uXXXX`（U+FFFF より上はサロゲートの組）で書く JSON の書き手にした。試作で、12 の入力の読み戻しの同一性、ランダムな 400 の文での出口と security の check の一致を確かめた。素朴に広げた形の 2 つの落とし穴（BMP の外のデータの破損、JSON の字面の上の判断のずれ）を確かめて書いた | §5.4〜§5.9、ADR-0039 の案の決定 1・3・4、B2-Q9・B2-Q11、付録 A15 |
| B2-D-R1-003（53 の検出力の主張が弱い） | Medium | CPU 時間の絶対の上限に、256 KiB と 1 MiB の CPU 時間の比（`t(1 MiB) ≤ 8 × t(256 KiB) + 20 ms`、3 回の最小）を足した（53-F）。比の上限は静かなとき・負荷のもとの実測から決めた。待つ時間はテストの timeout が受け持つと書いた。わざと二乗にした変異 2 つを試作し、比だけが見つける形があることを確かめた。受け入れの条件に「二乗の変異で新しいテストが落ちた記録」を入れた | §4.4〜§4.9、B2-Q7、付録 A13・A14 |
| B2-D-R1-004（51 の Job Summary の失敗の道がテストで固定されない） | Low | ワークフローの `run:` の本文を、偽の `aiqh` と仮の `RUNNER_TEMP`・`GITHUB_OUTPUT`・`GITHUB_STEP_SUMMARY` で実際に走らせるテスト（7 つの場面）を足した。古いものを拾わないよう、その run だけの空のディレクトリ（`mktemp -d`）を手順の出力で渡す形にした。bash の probe と `skipIf`、外部コマンドのガードとの関係を書いた。出力先が変わることを CHANGELOG・README に書く方針を入れた | §2.4〜§2.9、B2-Q4、付録 A11 |
| B2-D-R1-005（55 の守りのテストが誤った選び方を固定する） | Low | 守りのテストは、正しく件数が取れる wrapper の形だけにした。誤った選び方は既知の限界として ADR-0028 の決定 13 と ROADMAP に記録するだけで、将来直しても回帰と扱わない | §6.8・§6.9、B2-Q12、付録 B の 6 |

R1 の「候補の漏れ」を候補として足して比べた: 50-B'（不変の写しの寿命に限る。退ける）、54-G（保存の経路は生のまま、表示の経路だけ表記。退ける）、53-F（入力の長さの倍率で比べる。推奨）、53-G（決定的な操作の回数。v0.15.1 の範囲の外として残す）。

R2 で、ほかに見つけて直したこと:
- 項目 52 の既存の期待値の変更に、`tests/config-sha256.test.ts:98`（最上位のキーの数 15）が漏れていた。grep で網羅性を確かめた方法を §3.8 と付録 A12 に書いた
- 項目 52 で、`buildReport` の中で乱数の `runId` を作ると、同じ入力の 2 つのレポートを比べるテスト（`tests/parse-verify.test.ts:150`）が落ちるので、`runId` は必須の入力（呼ぶ側で作る）にし、テストの 15 か所の呼び出しに決まった値を渡すことにした。型の欄は任意（古いレポート）
- 項目 51 で、R1 の固定の名前のディレクトリ（`$RUNNER_TEMP/aiqh-verification`）を、その run だけの空のディレクトリに変えた（一時のディレクトリの古いものも拾わない）

変えた問い: B2-Q1・B2-Q3・B2-Q4・B2-Q7・B2-Q9・B2-Q11・B2-Q12・B2-Q15（`batch2-questions-r2.md` に【R2 で変更】の印）。B2-Q3 は人間の指示の一覧に無かったが、R2 で 51-A の出力先の形が変わったので書き換えた。ほかの問いは R1 のまま（決定どおり）。

## 0. 前提

- 対象: ROADMAP の項目 50〜55。中身は ROADMAP を正本とする（`docs/ROADMAP.md:887`〜`:892`）
  - 50: 型を読むガードのテストの並列の抑制と、TypeScript の program の再利用
  - 51: 再利用ワークフローの Job Summary の場所
  - 52: run の一意の名前（runId）／history の一意の鍵
  - 53: `tests/parse-output.test.ts` の P3「only newlines」の壁時計の上限が、強い負荷で外れる
  - 54: review-packet と出口の表記は、見えない文字の層 (c) を止めない
  - 55: ほかの 4 つの道具のパーサの選び方を、語の位置にそろえるか
- 人間の決定（2026-10-26、R2 の後）: 設計を直して R3 は出さない（B2-Q16 の決め直し）。R2 の 3 件は、この最終版に反映し、各版の実装レビューで確かめる。B2-Q1〜B2-Q15 は R2 の中身のまま確定
- 人間の決定（2026-10-26、R1 の時点）: B2-Q1〜B2-Q16 は、すべて推奨どおりに決めた。R1 の指摘で中身が変わる問い（B2-Q1・Q4・Q7・Q9・Q11・Q12・Q15。R2 の設計で B2-Q3 も変わった）は、R2 の設計に合わせて書き換えた（`batch2-questions-r2.md` の【R2 で変更】）。R1 の指摘 5 件は、すべて R2 で直す（Low も含む）。B2-Q16 の A に従い R2 を依頼する
- 表記: 適用先のリポジトリを「適用先 A」「適用先 B」と書く。中身・用途は書かない（件数・ファイルの種類・出力の形だけ）
- **数の印**（この設計の中の件数・時間・行数）
  - 【実測】: この設計の段（2026-10-26）に、手元で測った値。測り方は付録 A
  - 【記録】: ROADMAP・CHANGELOG・batch1 の設計（`docs/reviews/batch1-design/design-final.md`）・過去の版の作業の記録から引いた値。引いた先を書く
  - 【推定】: 測った値からの計算の見込み。実装の段で測り直す
- **[要確認]**: 外部の事実（TypeScript・vitest・GitHub Actions・Node の仕様の細部）で、手元の配布物を読むか実行するかで確かめていないもの
- 実測の環境: 手元の 8 CPU の機械、Node v24.13.1、npm 11.18.0、TypeScript 5.9.3、vitest 5.0.3。AC 電源で、長い実行は `caffeinate -i` の下。テストと測定の前に、時間の予算 T1 の負荷のゲート（1 分平均 8 以下かつ 5 分平均 12 以下が 20 秒おきに 3 回。`docs/ops/ci-and-branch-protection.md` の 8-1）を通した。測定は基準の commit の SHA 固定の worktree（`node_modules` は実ディレクトリの中に項目ごとのリンク）で行い、worktree の中のファイルは変えていない（数えるための設定と setup のファイルは worktree の外に置いた）
- 着手前の確認（R1: 2026-10-26 09:47、R2: 同じ日 11:12）: main = origin/main = リモートの main = `8650a72`、作業ツリーは clean、開いている PR は 0、`release/*` の branch は無い、`npm audit --audit-level=high` は 0 件
- R2 の試作（付録 A10〜A15）は、どれも `tmp/batch2/r2/` の中だけで、追跡しているファイルは変えていない。src を写して変異を入れたもの（付録 A14）も `tmp/` の中
- 行の参照は基準の commit のファイル。関数名・定数名を先に書き、行は補助として付ける
- ADR の案: ADR-0038（runId。§3）`adr-0038-draft-r2.md`、ADR-0039（層 (c) とパケット・出口。§5。R2 で決定 1・3・4 を書き足した）`adr-0039-draft-r2.md`。55 は ADR-0028 の追記の文案（§6.9）

---

## 1. 項目 50: 型を読むガードのテストの並列の抑制と、program の再利用

### 1.1 ROADMAP の記載（`docs/ROADMAP.md:887`）

TypeScript の program を作るテスト（`tests/*.ts` で `createProgram` を含む 15 ファイル）は、全テストを並列に走らせると CPU を取り合い、負荷のもとで静かなときの 2.33〜10.33 倍に伸びる（batch1 の再現）。v0.13.2 で上限を T3 の式で決め直したが、伸びそのものは残る。案: (a) これらのファイルだけ worker の数を抑える、または順に走らせる。(b) 同じ `src/` の program をファイルごとに作り直しているので、worker の中で 1 つの program を共有する、または `src/` の違反の確かめを 1 つのテストにまとめる。CI の unit の時間（項目 42）が T4 の 50%（300 秒）を超えたら優先を上げる。

### 1.2 関係するコードと文書

- `tests/structure/typescript.ts` の `createProgram`（`:24-46`）: `tsconfig.json` のすべてのファイル（src・tests・scripts）と、メモリの fixture で program を作る。host の `getSourceFile` は、fixture でなければ毎回ディスクから読んで構文解析する（共有の仕組みは無い）
- program を作る 15 ファイル: `tests/file-write-sites.test.ts`、`tests/regression-b21-r1-001-visit-limit.test.ts`、`tests/regression-backlog21-brand-container-context.test.ts`、`tests/regression-m2-2-builtin-r1-001-literal-typed-key.test.ts`・`-r2-001-type-is-not-the-value`・`-r3-allow-branches`・`-r4-union-and-element-forms`・`-r5-entrance-forms`・`-r6-reexport-and-listener-forms`、`tests/regression-m2-2-r1-config-read.test.ts`・`-r2-001-output-boundary`・`-r3-003-output-guard`・`-r3-004-brand-forgery`・`-r3-006-external-commands`・`-r4-002-builtin-allowlist`
- builtin-r3（`tests/regression-m2-2-builtin-r3-allow-branches.test.ts`）
  - `plainProgram`（`:243`）: 源だけの fixture を 1 つの program に
  - `violations()`（`:244-253`）: 編集の fixture ごとに `createProgram({ [file]: edited(x.c) })`
  - 「`every edit of a repository file type-checks: <id>`」の 19 の `it`（`:286-292`）: **同じ編集で、もう一度** `createProgram` を呼ぶ
  - 「src/ has no violation」（`:307-313`）
- `vitest.config.ts`: worker の数・pool・isolate を決めていない（vitest 5.0.3 の既定は pool `forks`・isolate あり。配布物の `resolved.pool ??= "forks"` を読んだ）
- 時間の予算（`docs/ops/ci-and-branch-protection.md:168-179` の 8-1）: T2「1 台の機械で同時に走らせる全テストは 1 本。vitest の worker の数は変えない」、T3（各テストの上限の式）、T4「50%（300 秒）を超えたら、項目 50 を早める」
- CI の見張り: ROADMAP の項目 42（`docs/ROADMAP.md:879`）、v0.15.0 の CI の記録（`:1130`・`:1131`）
- 上限に近い遅さの記録: `tests/support/near-limit-reporter.ts`（v0.13.2）

### 1.3 今の挙動

- **全テストの中の program の数**【実測】: 全テストを 1 回（静か。worktree の外の setup のファイルで `ts.sys.readFile` を包み、`tsconfig.json` を読んだ回数を program の数として数えた。付録 A3）。183 ファイル・2,742 件 PASS。vitest の表示の Duration は 134.08 秒（JSON の記録の、最初のファイルの開始から最後のファイルの終わりまでは 132.3 秒）。数える setup と JSON の reporter を足した形の値で、ふだんの run の値ではない
  - program を作ったのは 15 ファイルで、**合計 72 個**
  - builtin-r3 が 40 個（`plainProgram` 1、`violations()` の編集ごと 19、「every edit」の 19、「src/」1）。builtin-r4・r5 が 6 個ずつ、r6 が 3 個、ほかは 1〜2 個
  - 15 ファイルのファイルごとの時間の和は 196.1 秒で、183 ファイルの和 621.4 秒の 31.6%。最長は builtin-r3 の 68.2 秒
- **program 1 つの費用**【実測】（静か、1 つの node のプロセス。付録 A4）
  - fixture なしの program の作成: 564〜1,059 ms（3 回の測りの 1 回目と 2 回目。1 回目が遅い）。src/ の 58 ファイルの型の誤りの取り出し: 397〜466 ms
  - SourceFile を使い回す host（同じプロセスで、ディスクから読んだファイルの SourceFile を名前で持ち、次の program に渡す）: 1 つめの program の作成 475〜537 ms、2 つめ以降（1 ファイルの編集を fixture にした program）は**41〜51 ms**（5 回の中央値。3 回の測り）。使い回さない同じ形は 471〜585 ms。編集したファイルの型の誤りの数は、どちらも 0 で同じ
  - `oldProgram` を渡す形（TypeScript の構造の再利用）は、root のファイルが 1 つ増えると SourceFile を共有しなかった（共有 0 個）
- **負荷のもと**【記録】
  - batch1 の L2（全テストを 2 本同時、1 分平均 最大 311.65）で、program を作るテストは静かなときの 2.33〜10.33 倍（`docs/reviews/batch1-design/design-final.md` §5.3）
  - v0.13.2 の L2 の 2 回目（1 分平均 最大 213.09）の上限に近い遅さの記録（v0.13.2 の作業の記録。公開リポジトリの外）: builtin-r3 の 1 つの編集「r1b_console_trace」が 30 秒の上限の 73%・81%（2 本）、builtin-r4 の「d08_shorthand_after」が 66%。時間切れは無かった
- **CI**【記録】: v0.15.0 の PR の run（40192730657）で `unit` 133 秒（上限 600 秒の 22.2%）・`unit-minpath` 127 秒、main の run（40193239019）で 180 秒（30.0%）・177 秒（`docs/ROADMAP.md:1130-1131`）。T4 の 50%（300 秒）には届いていない
- **vitest の project ごとの設定**【実測、小さな fixture。付録 A5】: vitest 5.0.3 で、`sequence.groupOrder` が 0 の project（4 ファイル、各 1 秒待つ）が並列に走り終わった後、`groupOrder` 1・`maxWorkers: 1`・`isolate: false` の project の 4 ファイルが、同じ 1 つの worker（同じ pid）で順に走った

### 1.4 問題

- 全テスト 1 回で、ほぼ同じ program を 72 回作る。そのうち builtin-r3 の 19 個は、同じ入力の program の作り直し
- program の作成は CPU を使う。負荷のもとでは取り合いで伸び、T3 の上限に近づく（L2 の 2 回目で最大 81%）
- いまは予防の段: CI の時間は T4 の 50% に届いておらず、時間切れも起きていない

### 1.5 候補

| 候補 | 中身 | 評価 |
|---|---|---|
| **50-A** | builtin-r3 の中で、編集ごとの program を 1 回だけ作り、「every edit」の型の確かめと `violations()` で共有する（ファイルの中の小さな表） | 72 → 53 個【推定】。テストの期待・名前・数は変わらない。いちばん小さい |
| **50-B（R2 で鍵を決めた）**【R1-001 への対応】 | `tests/structure/typescript.ts` の `createProgram` が、ディスクから読んだファイルの SourceFile を、同じプロセスの中で、**鍵が同じときだけ**使い回す。鍵は §1.6 の 4 つ（正規化したパス・今読んだ中身の SHA-256・解析の条件・SourceFile に効く compiler options）。鍵が作れないときは使い回さない。使い回す前に、渡す SourceFile の中身が鍵の中身と同じことを確かめ、違えば捨てて作り直す | 2 つめ以降の作成が約 1/5〜1/7【実測: 試作で 452〜812 ms → 77〜130 ms〈中身の読み直しとハッシュを含む〉】。ディスクの書き換えは中身のハッシュで別の鍵になる。isolate ありのままなので、ファイルをまたいでは効かない |
| 50-B'（R2 で足した。退ける） | 1 回のテストファイルの実行の間だけの「不変の写し」（初めに全部のファイルを 1 回読み、その後はディスクを読まない）に限って使い回す（R1 の候補の漏れ） | 読み直しとハッシュが要らず、さらに速い。だが、写しを作った後にディスクが変わっても気づかない（写しの約束を守るのはテストの側になる）。50-B は読み直しの費用が小さい（上の実測）ので、気づく方を選ぶ |
| 50-C | vitest の project を分け、15 ファイルだけ `maxWorkers` を抑え（例 2）、`isolate: false` にする（50-B の表がファイルをまたいで効く）。`groupOrder` で残りと同時か後に走らせる | 並列の取り合いそのものを抑える。T2「worker の数は変えない」を変える。isolate を外した 15 ファイルの間で、モジュールの状態・`process.env`・mock が残りうる（15 ファイルのうち、git の作業・CLI の実行をするファイルがある）。全体の時間が伸びうる |
| 50-D | 「src/ has no violation」の確かめ（多くのファイルに 1 つずつある）を、1 つのファイルの 1 つの program にまとめる | 速いが、テストの作りの変更が大きい（ROADMAP の記載のとおり） |
| 50-E | 変えない（項目 42 の見張りと、上限に近い遅さの記録で見る） | 今と同じ |

### 1.6 推奨と理由

**50-A と 50-B（R2 の鍵）を、テストだけの版（v0.15.1）で入れる。50-C・50-D は、T4 の 50% の線（項目 42）に届いたときに選び直す（ROADMAP の項目 50 に残す）。**（人間の決定 B2-Q1 の A。R2 で 50-B の中身を決めた）

- 理由
  - どちらもテストの部品の中だけで閉じ、vitest の設定・T2・isolate を変えない。検出の力（fixture と期待）を変えない
  - 作成の CPU の見込み【推定】: 今 72 個 × 約 0.6 秒 ≒ 43 秒。50-A の後は 53 個。50-B で各ファイルの 1 つめだけ全部を解析し（15 × 約 0.5 秒）、残り 38 個が約 0.1 秒（R2 の試作の実測 77〜130 ms から）→ 合わせて約 11 秒。型を調べる時間（program ごとの checker）は減らない。全テストの時間がどれだけ減るかは、実装の段で同じ数え方（付録 A3）と静かな全テストで測る
  - 50-C は効きが大きい見込みだが、isolate を外す影響を 15 ファイルごとに確かめる必要があり、T2 を変える。いまは線に届いていないので、先に安い 2 つで伸びの元を減らす
- **50-B の鍵と決まり**【R1-001 への対応】
  - 根拠: TypeScript 5.9.3 の言語サービスは、SourceFile を program の間で共有するときの鍵に、SourceFile か束縛に効く compiler options（配布物の `sourceFileAffectingCompilerOptions`: `target`・`module`・`jsx`・`importHelpers`・`alwaysStrict`・`noFallthroughCasesInSwitch`・`moduleResolution`・`jsxImportSource`・`allowUnusedLabels`・`allowUnreachableCode`・`moduleDetection` の 11）と、モジュールの形（`impliedNodeFormat`）を使う（`node_modules/typescript/lib/typescript.js` の `getKeyForCompilationSettings`・`getDocumentRegistryBucketKeyWithMode`。配布物を読んだ【実測】）。既定の host の `getSourceFile` は、読んだ中身と解析の条件だけで `createSourceFile` を呼ぶ（同じファイルの `createGetSourceFile`）
  - 鍵（すべてが同じときだけ使い回す）
    1. 正規化したパス（`path.resolve`。大文字と小文字の違いは別の鍵になる。共有が減るだけで安全な向き）
    2. 今 host の `readFile` で読んだ中身の SHA-256（呼ぶたびに読み直す。ディスクの書き換えは別の鍵になり、古いものは使われない）
    3. 解析の条件: `getSourceFile` が受け取る `languageVersion`・`impliedNodeFormat`・`jsDocParsingMode`、helper の `setParentNodes`（`true`）。scriptKind は拡張子から決まる（鍵 1 に入る）
       - 【v0.16.0 で直した。実装レビュー batch2-v0151-impl R1 の B2-I151-R1-001】v0.15.1 は、TypeScript が渡すほかの 3 つ（`setExternalModuleIndicator`・`packageJsonLocations`・`packageJsonScope`）を、知っている欄として受けながら鍵に入れていなかった。v0.16.0 から: `packageJsonLocations`（文字列の配列のまま）と `packageJsonScope`（ディレクトリと package.json の中身の SHA-256）を鍵に入れ、`setExternalModuleIndicator` は有り無しを鍵に入れて、使い回す前にその関数でそのファイルの `externalModuleIndicator` を計算し直し、今の値と違えば使い回さない。形の分からない値は使い回さない。根拠（TypeScript 5.9.3 の配布物）: `getCreateSourceFileOptions` は毎回 `setExternalModuleIndicator` を options から作り（`getSetExternalModuleIndicator`。`module`・`target`・`moduleDetection`・`jsx` とファイルの `impliedNodeFormat` で決まる）、package.json を探す形のときだけ 2 つの package.json の値を渡す。`createSourceFile` は package.json の 2 つを読まず、program が `getSourceFile` の後で SourceFile に書く
    4. 上の 11 の compiler options の値
  - 使い回さない（毎回作る）とき（fail closed）: `shouldCreateNewSourceFile` が真、解析の条件のオブジェクトに知らない欄がある、`languageVersion` が数でない、options の値が文字列にできない、`readFile` が投げた。このときは既定の host と同じく作る（v0.16.0 から、解析の条件の値が分からない形のとき〈`packageJsonLocations` が文字列の配列でない、`packageJsonScope` に package.json の中身が無い、`setExternalModuleIndicator` が関数でない〉と、`setExternalModuleIndicator` の答えが使い回す SourceFile の今の値と違うときも）
  - fixture（メモリの源）と、fixture で上書きした repository のファイル（builtin-r3 の編集）は、表に入れず、表から出さない（今の helper の形のまま、fixture を先に見る）
  - 汚染: 表から渡した SourceFile は、TypeScript が束縛の結果を書き込む共有のオブジェクトで、凍らせられない。呼び手が中身（`text`）を書き換えた場合に備え、渡す前に、その SourceFile の `text` が今読んだ中身と同じことを確かめ、違えば表から捨てて作り直す。ガードは SourceFile を書き換えない（読むだけ）
  - 表を使わない呼び方（`createProgram(fixtures, { reuse: false })` の形）を残し、等しさのテストに使う
  - **表は helper の外に出さない**【R2-003 への対応】: 表は `tests/structure/typescript.ts` のモジュールの中だけの値で、export しない。helper の export の一覧（今の 7 つ〈`ROOT`・`createProgram`・`filesUnder`・`typeErrors`・`where`・`topOwnerName`・`ownerName`〉と型）をテストで固定する。呼び手が表を作ったり、表の中身を取り出したりする口は無い
  - **残る制限: AST だけの書き換えは見つけない**【R2-003 への対応】: 表から渡した SourceFile のノード（フラグ・識別子・親の参照など）だけを呼び手が書き換え、`text` が同じなら、次の program はそれを使う。見つける仕組みは作らない。理由: (1) TypeScript 自身が、束縛のときに共有の SourceFile のノードへ書き込む（言語サービスが SourceFile を共有するのと同じ）ので、凍らせられず、正当な書き込みと呼び手の書き込みを形で見分けられない。(2) 全ノードの写しや照らしを program ごとに行うと、605 の SourceFile（宣言のファイルを含む）を毎回たどることになり、使い回しの利益（作成の 452〜812 ms → 77〜130 ms）の大半を消す。(3) 呼び手は helper を使う 15 のテストファイルとガード（`tests/structure/`）だけで、どれも SourceFile を読むだけ（中身を書き換えるのは、汚染の確かめの T50-5 だけ）。AST を書き換えるテストを足すときは `reuse: false` を使う、と helper の説明に書く
- **R2 の試作の実測**【実測。付録 A10】（基準の commit の worktree の helper と同じ作りに、上の鍵の表を足した試作。テストの外の 1 つの node のプロセス）
  - 有り無しの等価: 5 つの program（そのまま・`src/output.ts` の編集 2 つ〈export を足す・型の誤りを足す〉・リポジトリの横の fixture・最後にもう一度そのまま）で、リポジトリの全ファイル（宣言のファイルと node_modules を除く）の構文と型の誤りの一覧が、表の有り無しで同じ（誤りの数は 0・0・1・1・0）
  - 時間: 表を使う 2 つめ以降の program の作成 77〜130 ms（そのままの形 452〜812 ms）。1 回だけ 1,043 ms（同じプロセスの中の揺れ。記録のまま）
  - 編集の前後（仮のプロジェクト）: 型の誤りのあるファイルを、誤りの無い中身に書き換えると、次の program では別の SourceFile になり、誤りは 1 → 0
  - 違う解析の条件: `jsx` を変えた program、`target` を変えた program では、同じファイルでも別の SourceFile。同じ条件なら同じもの
  - fixture と実ファイルの混在: 実ファイルを fixture で上書きした program では fixture の中身（誤り 1）、外した次の program では実ファイルの中身（誤り 0）で、表の中の実ファイルのものが使われた
  - 汚染: 表の SourceFile の `text` を書き換えた後の program は、それを使わず作り直した（捨てた数 1、誤り 0）

### 1.7 変わる出力

無い（テストの部品だけ）。製品の動き・出力・設定・判定は変わらない。テストの数は、50-B の単体のテストの分だけ増える。

### 1.8 テストの方針

- 直す前に FAIL するテスト（基準の commit の worktree に写して記録する）【R1-001 への対応で足した】
  - T50-1（新しい単体のテスト。仮: `tests/structure-typescript-reuse.test.ts`）: 同じプロセスで fixture の違う 2 つの program を作ると、`src/cli.ts` の SourceFile が同じもの（同一） → 基準では別のもの（**FAIL**）
  - T50-2（編集の前後）: 一時のディレクトリの小さなプロジェクト（`tsconfig.json` を書く）で、ファイルを書き換えた後の program は別の SourceFile で、書き換えた中身の型の誤りになる → 基準でも PASS（使い回さないため。守り）
  - T50-3（違う解析の条件）: 同じファイルを `jsx`・`target` の違う options で読むと、別の SourceFile → 基準でも PASS（守り）
  - T50-4（fixture と実ファイルの混在）: 実ファイルを fixture で上書きした program の後でも、次の program は実ファイルの中身。fixture の中身は表に残らない → 基準でも PASS（守り）
  - T50-5（汚染）: 表から渡した SourceFile の `text` を書き換えた後、次の program はそれを使わない → 基準でも PASS（守り。基準には表が無い）
  - T50-6（有り無しの等価）: 表を使う program と使わない program で、型の誤りの一覧と、ガードの答え（`outputViolations`・`brandGuard`）が同じ。builtin-r3 の全 fixture と 19 の編集、r4〜r6 の fixture、リポジトリそのまま → 基準には表を選ぶ呼び方が無く **FAIL**（呼び方が無い）。実装の後は PASS
  - T50-7（使い回さない条件）: `shouldCreateNewSourceFile` が真・解析の条件に知らない欄があるとき、表を使わない（作った数が増える）→ 基準には表が無いので **FAIL**（呼び方が無い）
- 50-A は作りの整理なので、直す前に FAIL するテストは無い。根拠は、program の数（40 → 21）を付録 A3 の数え方で記録することと、既存の「the edits of repository files are these 19」（`:263-285`）と各 fixture の期待が変わらないこと
- 検出の力: 実装の段で、ガードの規則を 1 つずつ壊す変異（2〜3 個。scratch の worktree で、`git checkout --` で戻す）を当て、表を使う形でも同じテストが FAIL することを確かめる
- 時間: 静かな全テストの前後と、program の数を記録する。L2（全テスト 2 本を同時）は任意（行うなら 30 分以内、T1 の後）
- 既存のテストの期待値の変更: **無い**

### 1.9 文書

ADR は要らない（テストの部品だけ）。`docs/ops/ci-and-branch-protection.md` の 8-1 は変えない（T2 を変えないため）。ROADMAP の項目 50 の文を「(b) の一部〈program の作り直しの削減〉を v0.15.1 で入れた。(a)〈並列の抑制〉と 1 つのテストへのまとめは、T4 の 50% の線のまま残す」に書き換える（付録 B）。

### 1.10 既存の利用者（適用先 A・B）への影響

無い（aiqh 自身のテストだけ）。

### 1.11 決めること

B2-Q1（50 の範囲）、B2-Q2（50-C・50-D を選び直す条件）、B2-Q15（既存の期待値の変更の一覧。50 は無し）

---

## 2. 項目 51: 再利用ワークフローの Job Summary の場所

### 2.1 ROADMAP の記載（`docs/ROADMAP.md:888`）

Job Summary は、作業のディレクトリの `artifacts/verification/latest.md` だけを読む。verify は設定のファイルのディレクトリ（と `output.dir`）の下に書くので、入力の `config` が下のディレクトリの設定を指すとき、または `output.dir` を変えたとき、Job Summary に何も足されない（エラーにもならない）。コードを読んだ推定で、まだ実行していない。案: ワークフローが verify の出力のディレクトリを知る方法を足し、見つからなければ Job Summary にその旨を書く。

### 2.2 関係するコードと文書

- `.github/workflows/verify.yml`
  - 入力 `config`（`:28-31`。作業のディレクトリからの相対）、`job-summary`（`:32-35`。既定 false）
  - 手順「aiqh verify」（`:118-124`）: `aiqh verify --config "$AIQH_CONFIG"`
  - 手順「Append latest.md to the job summary」（`:125-131`）: `if [ -f artifacts/verification/latest.md ]; then cat … >> "$GITHUB_STEP_SUMMARY"; fi`（無ければ何もしない）
- `src/config/load.ts` の `resolveConfig`（`:119-160`）: 起点は設定のファイルのディレクトリ（`:120`）、出力のディレクトリは `output.dir`（既定 `artifacts/verification`）をその起点から解く（`:142-146`。起点の外は設定の誤り）
- `src/commands/verify.ts`: `--output-dir`（`-o`）で出力のディレクトリを上書きする（`:81-82`。`path.resolve(cwd, …)`。起点の中かどうかは見ない）。終わりに `report:` の 3 行で、書いたパスを出す（`:173-175`）
- `src/cli-program.ts:61`（`-o, --output-dir <dir>`）
- テスト: `tests/reusable-workflow.test.ts` の「uploads no artifact and adds latest.md to the job summary only when job-summary is true」（`:181-189`。手順の条件が `inputs.job-summary` を含むこと、本文が `artifacts/verification/latest.md` を含むこと）、自己適用の `tests/reusable-workflow-self.test.ts`
- 文書: `docs/ops/reusable-workflow.md` の入力の表（`:56-58`）と手順（`:70-71`）、ADR-0031 の決定 6（`docs/adr/0031-ci-distribution-reusable-workflow-own-source.md:44`）
- 自己適用（`.github/workflows/ci.yml` の `reusable-self`）は `setup-command: npm ci` だけで、`job-summary` を使っていない（CI でこの手順を通る run は無い）

### 2.3 今の挙動（再現）【実測】

架空の fixture のリポジトリ（git の作業ツリー、check 1 つ）で、基準の commit の `aiqh verify` を走らせ、ワークフローの手順と同じ判定 `[ -f artifacts/verification/latest.md ]` を、作業のディレクトリで当てた（付録 A6。GitHub では走らせていない）。

| 形 | verify の書いた場所（`report:` の行） | 手順の判定 |
|---|---|---|
| 設定が作業のディレクトリの直下、`output.dir` は既定 | `artifacts/verification/latest.md` | 見つかる（足される） |
| `config: sub/aiqh.config.jsonc`（下のディレクトリ） | `sub/artifacts/verification/latest.md` | **見つからない**（何も足されない、エラーにもならない） |
| `output.dir: "reports/aiqh"` | `reports/aiqh/latest.md` | **見つからない**（同じ） |
| 下のディレクトリの設定に `-o <作業ツリーの外のディレクトリ>` | そのディレクトリの `latest.md`・`latest.json`・`history/` | （ワークフローは今この形を使わない）|

ROADMAP の推定は、2 つの形とも再現した。どちらも verify は exit 0 で、Job Summary の手順は黙って何もしない。

### 2.4 問題

- `job-summary: true` を選んだ呼び出し側で、設定の場所か `output.dir` が既定と違うと、要約が黙って空になる
- 作業のディレクトリに古い `artifacts/verification/latest.md` があると（ADR-0007 は git 管理外とするが、呼び出し側のリポジトリで守られているとは限らない）、今回の run が何も書かなかったときに、古いものが要約に足される（R1 では推測。R2 で、手元でワークフローの本文を走らせて確かめた【実測。§2.8・付録 A11】）
- verify が何も書かなかったとき（設定の誤りなど）、要約には何も出ず、その旨も出ない

### 2.5 候補

| 候補 | 中身 | 評価 |
|---|---|---|
| **51-A（R2 で形を決めた）** | `job-summary: true` のときだけ、手順「aiqh verify」が `mktemp -d "$RUNNER_TEMP/aiqh-verification.XXXXXX"` で**その run だけの空のディレクトリ**を作り、手順の出力 `report-dir` に書いてから、`--output-dir` で verify にそこへ書かせる。要約の手順は `report-dir` の `latest.md` だけを読み、無ければ決まった 1 行を足す | src を変えない。設定の場所・`output.dir` によらない。ディレクトリはその run で作った空のものなので、作業のディレクトリの古いもの・一時のディレクトリの古いものを拾わない。`job-summary: false` の呼び出しは何も変わらない |
| 51-B | 51-A と同じだが、いつも `--output-dir` を渡す | 形が 1 つになるが、すべての呼び出し側のログの `report:` の行（パス）が変わる |
| 51-C | 入力 `report-dir`（要約が読むディレクトリ）を足す | 呼び出し側が場所を 2 回書くことになり、食い違えば同じく空になる（「見つからない」の 1 行は出せる） |
| 51-D | aiqh に、設定から出力のディレクトリを答える口（新しいコマンドか、verify の出力の行）を足し、ワークフローがそれを読む | 新しい CLI の面が増える。表記（パスの禁止文字の `\u{…}`）やマスクで、表示のパスが実際のパスと違いうる |
| 51-E | 文書だけ（`docs/ops/reusable-workflow.md` に、設定は作業のディレクトリの直下・`output.dir` は既定のときだけ要約が出る、と書く） | 黙って空になることも、古いものを拾うことも残る |

### 2.6 推奨と理由

**51-A（R2 の形）。**（人間の決定 B2-Q3 の A）ワークフロー自身が出力の場所を決めるので、設定を読み直す必要も新しい CLI の面も無い。`--output-dir` は今の verify の機能で、起点の外も受ける（`src/commands/verify.ts:81-82`）。レポートは job の外に出ない（ADR-0031 の決定 6 のまま。`$RUNNER_TEMP` は job ごとの一時のディレクトリ [要確認: GitHub の文書]）。`job-summary` を使わない呼び出し側は、ログも含めて何も変わらない。

- 形（案。R2 で、固定の名前のディレクトリを、その run だけの空のディレクトリに変えた）
  - 手順「aiqh verify」に `id: verify` を付ける。入力は `env:` で渡す（今のテストの「run: の中に `${{ }}` を書かない」を守る。`JOB_SUMMARY: ${{ inputs.job-summary }}`）
  - 本文: `aiqh --version` の後、`JOB_SUMMARY` が `true` なら `dir="$(mktemp -d "$RUNNER_TEMP/aiqh-verification.XXXXXX")"`、`echo "report-dir=$dir" >> "$GITHUB_OUTPUT"`、`aiqh verify --config "$AIQH_CONFIG" --output-dir "$dir"`。そうでなければ今と同じ `aiqh verify --config "$AIQH_CONFIG"`。`report-dir` は verify を走らせる**前**に書く（verify が FAILED・ERROR で終わっても、次の手順に場所が渡る）
  - 手順「Append latest.md to the job summary」: `env:` に `REPORT_DIR: ${{ steps.verify.outputs.report-dir }}`。本文: `REPORT_DIR` が空でなく `"$REPORT_DIR/latest.md"` があれば足す。無ければ決まった 1 行（`aiqh: latest.md was not written (see the log of the aiqh verify step)`）を足す。手順の条件は今の `always() && inputs.job-summary && steps.guard.outcome == 'success'` のまま（verify の手順が始まらなかったときは `REPORT_DIR` が空で、1 行になる）
- `--output-dir` を渡すと、`history/` もその一時のディレクトリに書かれる。CI の job では history は残らない（今も job の終わりで捨てられる）ので、変わることは無い
- 同じ job の後の手順が既定の場所を読むことへの影響（R1 の問い 5）: 再利用ワークフローの job は呼び出し側から手順を足せない [要確認: GitHub の文書]。`verify.yml` の中で、要約の手順の後にレポートを読む手順は無い（読んだ）。それでも、`job-summary: true` のとき作業のディレクトリに `artifacts/verification/` が書かれなくなることを、CHANGELOG と README（再利用ワークフローの節）と `docs/ops/reusable-workflow.md` に書く

### 2.7 変わる出力

- `job-summary: true` の呼び出し側: 設定の場所・`output.dir` によらず、要約にその run の `latest.md` が足される。ログの `report:` の 3 行が一時のディレクトリのパスになる。作業のディレクトリの `artifacts/verification/` には書かれない。書かれなかったときは、要約に決まった 1 行
- `job-summary: false`（既定）の呼び出し側: 何も変わらない
- aiqh の CLI・レポートの形・判定: 変わらない

### 2.8 テストの方針

- 既存のテストの期待値の変更: `tests/reusable-workflow.test.ts:188`（要約の手順の本文が `artifacts/verification/latest.md` を含む → `REPORT_DIR` の `latest.md` を読む）。**承認が要る**（B2-Q15）
- 新しいテスト（ワークフローの文を読むテスト。YAML のライブラリを使わない、ADR-0008 のまま）
  - W1: 手順「aiqh verify」は `id: verify` を持ち、`JOB_SUMMARY` の分岐の中でだけ `mktemp -d` のディレクトリを `report-dir` に書いて `--output-dir` を渡し、入力は `env:` から来る → 基準では無いので **FAIL**
  - W2: 要約の手順は `REPORT_DIR`（`steps.verify.outputs.report-dir`）の `latest.md` だけを読み、無いときの 1 行を持つ → **FAIL**
  - W3（守り）: `job-summary` が false のときの verify の呼び方は今と同じ文 → PASS
- **ワークフローの本文を実際に走らせるテスト**【R1-004 への対応で足した】（仮: `tests/reusable-workflow-run.test.ts`）
  - 作り: `verify.yml` から 2 つの手順の `run:` の本文を取り出し（今のテストの `steps()`・`runBlocks()` と同じ読み方）、一時のディレクトリに書いて、GitHub の bash と同じ形（`bash --noprofile --norc -eo pipefail <file>`）で走らせる。PATH の先頭に偽の `aiqh`（bash のスクリプト。`--version` と `verify --config <C> [--output-dir <D>]` を受け、`<D>` か `<C> のディレクトリ>/<output.dir>` に `latest.md` を書く。書くか・終了コードは環境変数で決める）を置き、`RUNNER_TEMP`・`GITHUB_OUTPUT`・`GITHUB_STEP_SUMMARY` は一時のファイル。要約の手順には、verify の手順が書いた `GITHUB_OUTPUT` の `report-dir` を `REPORT_DIR` として渡す
  - 場面と期待（R1 の修正案の「正常・無いとき・古いものを拾わない・output.dir を変えた形」に、下のディレクトリの設定と FAILED を足した 7 つ）

| # | 場面 | 期待（案の本文） | 基準の本文で |
|---|---|---|---|
| W4 | 設定が直下、`output.dir` 既定 | その run の `latest.md` が足される | PASS |
| W5 | 設定が下のディレクトリ | その run の `latest.md` が足される | **FAIL**（空） |
| W6 | `output.dir` を変えた形 | その run の `latest.md` が足される | **FAIL**（空） |
| W7 | verify が書かずに exit 2 | 決まった 1 行 | **FAIL**（何も出ない） |
| W8 | 作業のディレクトリに古い `latest.md`、verify は書かずに exit 2 | 決まった 1 行（古いものを足さない） | **FAIL**（古いものを足す） |
| W9 | 一時のディレクトリの固定の名前の場所に古い `latest.md`、verify は書かずに exit 2 | 決まった 1 行 | **FAIL**（何も出ない。古いものは拾わない） |
| W10 | verify が FAILED（exit 1）で書いた | その run の `latest.md` が足される（手順の条件の `always()` と、先に書いた `report-dir`） | PASS |

  - R2 の試作【実測。付録 A11】: 今の `verify.yml`（基準の commit）から取り出した本文と、案の本文を、この 7 つの場面で走らせた。基準の本文は W5〜W9 の 5 つで期待に合わず（空が 4〈W5・W6・W7・W9〉、古いものを足したのが 1〈W8〉）、案の本文は 7 つとも期待どおり
  - 外部コマンドのガードとの関係: テストは bash を起動する。`tests/structure/process-guard.ts` の `PROBED`（今は `unzip`・`python3`）に `bash` を足し、テストは probe（`spawnSync("bash", ["--version"])` の終了コードを変数に置く）と、その変数を使う `it.skipIf(!HAS_BASH)` の中でだけ bash を起動する（ガードの今の規則の形。`tests/zip-interop.test.ts` と同じ）。ガードの守りのテスト（`tests/regression-m2-2-r3-006-external-commands.test.ts`）に、bash の probe と guarded の fixture を 1 つずつ足す。偽の `aiqh` の中のコマンド（`mkdir`・`printf` など）と本文の `mktemp`・`cat` は、bash から起動するので静的なガードの外。`unit-minpath`（PATH は node と git だけ）では bash が見つからず、probe が偽になって飛ぶ（今の unzip・python3 と同じ）。通常の `unit` では走る
- 実物の確かめ: 自己適用の job に `job-summary: true` を足し（人間の決定 B2-Q4。R2 で「A ＋ 手元のテスト」に変えた）、毎回の CI でこの手順を通す。PR の run の要約の画面を人が 1 回見る

### 2.9 文書

ADR は新しく要らない。ADR-0031 の決定 6 に注記（`job-summary: true` のときは、その run だけの一時のディレクトリにレポートを書いて、そこから足す。作業のディレクトリには書かない。v0.15.1）。`docs/ops/reusable-workflow.md` の入力の表と手順 7・8。CHANGELOG と README（再利用ワークフローの節）に、`job-summary: true` の利用者のレポートの出力先が変わること（作業のディレクトリの `artifacts/verification/` に書かれなくなる。ログの `report:` の行が一時のディレクトリを指す）を書く【R1-004・R1 の問い 5 への対応】。`tests/structure/process-guard.ts` の先頭の説明（probe の道具の一覧）に bash を足す。

### 2.10 既存の利用者（適用先 A・B）への影響

適用先 A・B のワークフロー（読み取りで確かめた）は、どちらも `job-summary` を指定しない（既定 false）。`config`・`working-directory` も既定。**変わらない**。

### 2.11 決めること

B2-Q3（直し方）、B2-Q4（自己適用で通すか）、B2-Q15

---

## 3. 項目 52: run の一意の名前（runId）

### 3.1 ROADMAP の記載（`docs/ROADMAP.md:889`）

今のレポートには run の一意の名前が無い。`startedAt` はミリ秒までの時刻で、同じミリ秒に始めた別の run は同じ値を持てる。history の名前は秒まで＋ぶつかったときの連番で、`latest.*` には書かれない。そのため、`latest.json` と `latest.md` が同じ run のものかを確実には見分けられない（項目 47 の読み手の約束）。案: (a) 一意の `runId` を作り、`latest.json`・`latest.md`・history に同じ値で書く、(b) history の名前を `latest.*` に書く（history を書いた後に latest を書く順に変える必要がある）。どちらも最上位のキーを増やすので、新しい ADR。項目 47 の (a)〈`runs/<runId>/`〉の前提にもなる。外の読み手が組で読む必要が出たら優先を上げる。

### 3.2 関係するコードと文書

- `src/report/build-report.ts` の `buildReport`（`:18-40`）: `startedAt` は `toISOString()`（`:28`）
- `src/report/write.ts` の `writeReports`（`:16-38`）: `latest.json`（`:26`）→ `latest.md`（`:27`）→ history の名前を排他で取る（`:28`、`reserveHistoryPath` `:52-70`）→ history を書く。名前は `historyStamp`（`:41-43`。秒まで）
- `src/report/markdown.ts` の `renderMarkdown`: 表の `| Started | … |`（`:25`）
- 読み手
  - `aiqh history`: `src/run-history/read.ts` の `REPORT`（`:174-187`。zod の object で、読まないキーは捨てる。注記 `:173`）
  - review-packet: `src/review/packet.ts` の `RENDERED_REPORT`（`:1032-1039`。zod の object）
  - Job Summary: `latest.md` をそのまま足す（§2）
- テスト: 最上位のキーの並び `tests/regression-backlog9-report-json-copy.test.ts:76`、`tests/parse-verify.test.ts:74`（`REPORT_KEYS`）・`:141`、項目 47 の `tests/regression-item47-latest-pair-race.test.ts`（47-c-3: 同じミリ秒の組は「見分けられない」、`:117-131`）、`tests/regression-item47-latest-pair-started-at.test.ts`
- 文書: README の「`latest.json` と `latest.md` を組で読むとき」（`README.md:126-131`）、ADR-0003 の注記（`docs/adr/0003-report-format-json-markdown.md:33`）、ADR-0034 の L（`docs/adr/0034-history-aggregate-without-database.md:142-145`）、ADR-0033 の前例（最上位に `configSha256` を足し、`schemaVersion` は 1 のまま。`docs/adr/0033-config-sha256-recorded-not-pinned.md:18-20`・`:27`）、レポートの例（`docs/ARCHITECTURE.md:372` の付近）

### 3.3 今の挙動

- run の一意の名前は無い。読み手の約束は「`startedAt` が違えば確実に別の run、同じでも同じ run の保証はない」（README `:130`）。47-c-3 のテストが、同じミリ秒の 2 つの run の組で「見分けられない」を固定している
- **古い読み手の互換**【実測。付録 A7】: aiqh 本体のある 1 つの history のファイルの写しに、最上位のキー `runId`（架空の UUID の形の値）を `startedAt` の前に足したものを、基準の commit の `aiqh history --json` で読んだ → exit 0（`HISTORY COMPLETE — projects 1, runs 1, sources 1`）。集計の JSON は、足さない写しのものと同じだった。review-packet の `RENDERED_REPORT` も zod の object なので、知らないキーを捨てる（コードを読んだ。実行していない）

### 3.4 問題

- `latest.json` と `latest.md`（と history）が同じ run のものかを、外の読み手が確実に決められない
- 項目 47 の (a)（`runs/<runId>/` と pointer）を選ぶときの前提が無い

### 3.5 候補

| 候補 | 中身 | 評価 |
|---|---|---|
| **52-A** | verify の始めに、乱数の `runId`（Node の `crypto.randomUUID()`。UUID の版 4、小文字 36 文字）を 1 つ作り、`latest.json`・history（同じ JSON）・`latest.md` の表に書く | 書く順・history の名前・端末を変えない。依存を増やさない。衝突は実用上起きない（乱数 122 ビット）。読み手は値の一致だけを見ればよい |
| 52-B | history の名前（排他で取った名前）を `latest.*` に書く。書く順を「名前を取る → history → latest.json → latest.md」に変える | 名前は history のディレクトリの中でだけ一意で、history を消せば同じ名前が再び使われる。書く順を変えると、latest の書き込みに失敗した run の history が残る形になる（今は history の失敗で latest が先に書かれている）。失敗のときの意味が変わる |
| 52-C | 時刻・pid・乱数を合わせた文字列（例: `<秒までの時刻>-<pid>-<乱数 8 桁>`） | 人が読むと並び順が分かるが、`startedAt` が既にあり、組み合わせの形の約束が増える |
| 52-D | 入れない（項目 47 の受け入れのまま） | 外の読み手が組で読む必要が出るまで待つ。今の約束（README）のまま |

### 3.6 推奨と理由

**52-A。** 書く順と名前の規則を変えずに、3 つのファイルを確実に結べる。最上位に欄を足す前例（ADR-0033）があり、古い aiqh の history と review-packet は知らないキーを捨てる（実測と読んだコード）。細部は ADR-0038 の案。

- 作る時: verify の始め（check を走らせる前）に 1 回。中断された run（ERROR）のレポートにも同じ値が入る。`buildReport` の入力に**必須の** `runId` を足す（テストは決まった値を渡す）。`buildReport` の中では作らない（1 つの run に 1 つを、呼ぶ側で保つ。中で乱数を作ると、同じ入力から 2 回作ったレポートの比べ〈`tests/parse-verify.test.ts:150`〉が落ちる）【R2 で確かめた】
- 型: `VerificationReport` の `runId` は**任意の欄**（`runId?: string`。`configSha256` と同じく「古いレポートには無い。null にしない」）。verify が書くレポートには必ず入る。テストの中で手で組み立てるレポート（`tests/history-fixtures.ts`・`tests/regression-r1-git.test.ts`）の型は変えずに済む
- 置き場所: 最上位の `startedAt` の直前（`configSha256` の後）。最上位のキーは 16 になる
- `latest.md`: 表の `| Started | … |` の直前に `| Run ID | <runId> |`
- 端末: 変えない（B2-Q6 で、`report:` の 3 行の前に `run: <runId>` の 1 行を足すかを決める）
- history のファイルの名前・`aiqh history` の出力・review-packet の表示: 変えない（読み手は今のまま知らないキーを捨てる）
- `schemaVersion` は 1 のまま（足すだけの変更。ADR-0003 の「後方互換の変更」、ADR-0033 の決定 5 の前例）
- 読み手の約束の書き換え: 「両方に `runId` があれば、同じ値なら同じ run、違えば別の run。どちらかに無ければ（v0.16.0 より前の版のレポート）、今の `startedAt` の約束」

### 3.7 変わる出力

- `latest.json` と `history/<stamp>.json`: 最上位に `runId`
- `latest.md`: 表に 1 行（Job Summary に足す形では、その行も見える）
- 端末・`aiqh history`・review-packet・判定・終了コード: 変わらない（B2-Q6 で端末に足すなら、その 1 行）

### 3.8 テストの方針

- 直す前に FAIL するテスト
  - R1: 1 回の verify で、`latest.json` の `runId`、`latest.md` の `| Run ID |` の値、history の `runId` が同じ文字列 → 基準には無いので **FAIL**（仮: `tests/regression-item52-run-id.test.ts`）
  - R2: 2 回の verify の `runId` が違う → **FAIL**
  - R3: 形は UUID の版 4（小文字、`8-4-4-4-12`、版の桁が `4`、variant の桁が `8`〜`b`） → **FAIL**
  - R4（47-c-3 の書き換え）: 同じミリ秒の 2 つの run の組で、`runId` で「別の run」と決められる → 今の期待（「見分けられない」）を変える。**既存の期待値の変更**
  - R5（守り）: `runId` の無い古いレポート（写し）を、新しい `aiqh history` が今と同じに読む → PASS
  - R6（守り）: 中断された run（SIGINT など）のレポートにも `runId` があり、3 つのファイルで同じ
- 既存のテストの期待値の変更（**承認が要る**。B2-Q15）
  - `tests/regression-backlog9-report-json-copy.test.ts:76`（最上位のキーの並びに `"runId"` を `"startedAt"` の前に足す）
  - `tests/parse-verify.test.ts:74`（`REPORT_KEYS` に同じ）
  - `tests/regression-item47-latest-pair-race.test.ts` の 47-c-3（`:117-131`）と、ファイルの先頭の説明。47-c-2 には `runId` での判定を足す（期待は今と同じ「別の run」）
  - `tests/config-sha256.test.ts:98`（最上位のキーの数 `toHaveLength(15)` → 16）【R2 で grep で見つけた。R1 の一覧に無かった】。同じテストの `:97`（`configSha256` が `configPath` の直後）は変わらない
  - 網羅性の確かめ（R2）: `tests/*.ts` を、`Object.keys(` でレポート・`REPORT_KEYS`・`"configSha256", "startedAt"`・`| Started |`・`| Finished |`・`toHaveLength(15)`・`renderMarkdown(` の全文の比べ・`latest.json`／`latest.md` の読み込みで grep し、当たった行を 1 つずつ開いた（付録 A12）。ほかに、最上位のキーの並び・数・`latest.md` の表の全体・行の番号を固定したテストは無かった（`latest.md` の表は `toContain` で 1 行ずつ見るものだけ）
- 呼び出しの形の変更（期待値は変えない）: テストの `buildReport(` の 15 か所（11 ファイル）に、決まった `runId` を渡す（必須の入力にするため）
- 互換の確かめ（実装の段）: v0.15.0 の `aiqh history` で、新しい版が書いた history を読む（付録 A7 と同じ形を、実物で）

### 3.9 文書

新しい ADR（ADR-0038 の案）。ADR-0003 の注記（`runId` を足した、`schemaVersion` は 1）、ADR-0034 の L の注記（約束の書き換え。項目 47 は「受け入れ（未解決）」のまま。並行の verify で組が別の run になりうることは直らない。見分けられるようになるだけ）、README の約束（`:126-131`）、`docs/ARCHITECTURE.md` のレポートの例、CHANGELOG。ROADMAP の項目 52 を閉じる。

### 3.10 既存の利用者（適用先 A・B）への影響

再利用ワークフローの SHA を上げた後、レポートに `runId` が入る。設定の変更は要らない。どちらも `job-summary` を使わないので、CI の画面は変わらない。手元で `aiqh history` を古い版で読んでも読める（実測した形）。

### 3.11 決めること

B2-Q5（入れるか・形）、B2-Q6（端末に出すか）、B2-Q15

---

## 4. 項目 53: P3「only newlines」の壁時計の上限

### 4.1 ROADMAP の記載（`docs/ROADMAP.md:890`）

P3 は、パーサの 1 回の読みの壁時計の上限（64〜256 KiB は 1,500 ms、1 MiB は 3,000 ms）を `expect(ms).toBeLessThan(…)` で確かめる。全テストを 2 本同時に走らせた負荷（1 分平均の最大 213）で、1 MiB の「only newlines」の読みが 4,763 ms（npm-audit）と 3,409 ms（eslint）になり、2 本ともこのテストの 1 件だけで FAIL した。前からある負荷への弱さ。線形であることは、同じテストの作業量の時計で確かめているので、壁時計の上限は後ろ盾。案: T3 の考え方で決め直すか、外して作業量の時計に任せるかを決める。どちらも既存のテストの期待値の変更なので、人間の承認の後。

### 4.2 関係するコードと文書

- `tests/parse-output.test.ts` の describe「P3: the worst inputs take linear time」（`:220-284`）
  - 形の表（`:223-242`）。道具の一覧（`:243`）。「only newlines」は stdout が改行だけ・stderr が CR LF だけ（`:225`）。1 MiB で stdout 1,048,577 行・stderr 524,289 行（入力の形から数えた）
  - 作業量の時計 `workClock`（`:249-258`）: パーサが時計を見た回数だけ進む（`CLOCK_EVERY` 行ごとに 1 回）。上限は「入力の 1 行あたり 8 行の読み」
  - 壁時計の上限（`:274`）: `performance.now()` の差を `size <= 256 KiB ? 1500 : 3000` と比べる。`it.each` の上限は 40 秒（`:277`。T3）
  - 4 MiB の入力の確かめ（`:278-283`）も壁時計の 3,000 ms
- `src/parse/read.ts` の `parseOutputAs`（`:66-86`）: `Budget` を作るときに開始の時刻を 1 回読み（`:69`。`src/parse/text.ts:88`）、`prepareStream` で 2 つのストリームを行に分け（`:70-71`）、その後で時計を確かめる（`:73`）。行の分割は、作業量の時計の `tick`（行ごとに数える）の外
- `src/parse/text.ts`: `PARSE_TIME_LIMIT_MS` 1,000（`:16`。製品の時間の上限。実時計）、`prepareStream`（`:30-51`）、`Budget`（`:81-98`。行ごとに `tick`、`CLOCK_EVERY` 行ごとに時計を見る）
- 時間の予算 T3（`docs/ops/ci-and-branch-protection.md:176`）
- 同じ形の確かめ: `tests/regression-backlog35-url-credential-linear.test.ts:147-163`（masker の 64 KiB の入力を壁時計 1,000 ms と比べる）。作業の量で確かめる前例: `tests/regression-item49-raw-chars-layer-c.test.ts:546-567`（L11。1 MiB の入力の仕事の量が 1 単位に 3 回以下で、入力に比例）

### 4.3 今の挙動

- 【記録】v0.13.2 の L2 の 2 回目（1 分平均 最大 213.09）: 2 本の全テストとも、このテストの 1 件だけで FAIL（npm-audit 4,763 ms、eslint 3,409 ms。どちらも 1 MiB の「only newlines」）。テスト「only newlines」全体は 11.5 秒と 7.8 秒。L2 の 1 回目（最大 91.06）は PASS（v0.13.2 の作業の記録）。静かな全テストでは、このテスト全体が 3.14 秒（batch1 の設計 §5.5 の表）
- 【実測】静かなとき、テストの外の 1 つの node のプロセスで、同じ形を 5 つの道具 × 5 回読んだ（付録 A1）: 1 MiB の「only newlines」の 1 回の読みは中央値 63〜83 ms（道具ごと）、最大 88 ms。256 KiB は中央値 18〜36 ms、64 KiB は 4.7〜6.9 ms。ほかの形は 1 MiB でも 8 ms 以下
- 【実測】静かな全テスト（付録 A3 の run）の中で、テスト「only newlines」全体（15 回の読み）は 2,346 ms
- 【実測】壁時計と CPU 時間（付録 A2）: 1 MiB の「only newlines」を 5 つの道具 × 5 回（25 回）
  - 静か（開始の 1 分平均 1.72）: 壁時計の中央値 50.1 ms（最大 61.9）、そのスレッドの CPU 時間の中央値 50.1 ms（最大 60.6）
  - 自分で終わる CPU の負荷（24 個の node のプロセスが 75 秒だけ回る。測りの間の 1 分平均 18.56〜26.52）のもと: 壁時計の中央値 262.5 ms（最大 325.5、静かなときの 5.2 倍）、スレッドの CPU 時間の中央値 76.2 ms（最大 104.0、1.5 倍）
  - 負荷の 24 個のプロセスは、締め切りの時刻に自分で終わった（シグナルは送っていない。終わった後に残りは 0）
- 壁時計の上限が、作業量の時計で見えないものを見ている: (1) `prepareStream`（行の分割と色の制御文字の除去）は、作業量の時計が行を数え始める前に終わる（作業量の時計は、時計を見た回数だけ進むので、行の分割の仕事の量は入らない）、(2) 1 行の中の仕事（1 行は 4,096 単位まで）は、読んだ行の数に入らない。どちらかが入力に対して線形でなくなっても、作業量の時計は気づかない

### 4.4 問題

- 上限は、数十 ms で終わる 1 回の読みに対する絶対の壁時計。強い負荷のもとでは、スレッドが CPU を待つ時間が入り、静かなときの数十倍になりうる（L2 の 2 回目の 4,763 ms は、静かな 1 プロセスの中央値の約 57〜75 倍【推定: 4,763 / 83.3〜63.3】）
- T3 の倍率 12（観測した最大 10.33 に余裕）は、数秒〜数十秒のテスト全体の伸びから決めた値で、短い操作ほど倍率が大きい（batch1 の設計 §5.3 の「短いテストほど倍率が大きい」と同じ向き）。1 回の読みの上限には当てはまらない
- 【R1-003 への対応で足した】絶対の上限（1 MiB で 3,000 ms）だけでは、線形でない道を見つける力が、入力の長さと機械の速さに依る。静かなときの読みは 1 MiB で最大 88 ms なので、上限まで約 34 倍の幅があり、その間に収まる二乗の道（1 MiB で数百 ms〜3 秒）は見つからない（R2 の試作で、そういう形を作れた。§4.8）

### 4.5 候補

| 候補 | 中身 | 評価 |
|---|---|---|
| 53-A（R1 の推奨） | 1 回の読みの上限を、壁時計ではなく、**そのスレッドの CPU 時間**（`process.threadCpuUsage()`）で確かめる。上限の数（1,500 ms・3,000 ms）は今のまま。作業量の時計と、テストの 40 秒の上限は残す | CPU を待つ時間は入らない（実測で、負荷のもとの伸びが壁時計 5.2 倍に対して 1.5 倍）。ただし、絶対の上限の内に収まる二乗の道は見つからない（R1-003） |
| **53-F（R2 の推奨）**【R1-003 への対応】 | 53-A に加え、**入力の大きさ N と 4N の CPU 時間の比**で増え方を確かめる。各形・各道具で、256 KiB と 1 MiB を 3 回ずつ読み、それぞれの最小の CPU 時間 `t(256 KiB)`・`t(1 MiB)` が `t(1 MiB) ≤ 8 × t(256 KiB) + 20 ms` を満たす（線形なら約 4 倍、二乗なら約 16 倍）。絶対の上限は 3 回の最小に当てる。待つ時間の確かめは、テスト全体の上限（`it.each` の timeout）が受け持つ | 静かなとき・負荷のもとの 85 の組すべてで満たした【実測】。わざと二乗にした変異で、絶対の上限の内に収まる形（1 MiB で 913〜1,792 ms）を比が見つけた【実測】。製品のコードは変えない |
| 53-G（R2 で足した） | 決定的な操作の回数で増え方を見る（製品の `src/parse/` に、行の分割と 1 行の読みの仕事を数える引数を足す。ADR-0037 の `decideRawChars` の `work` と同じ作り） | 機械の速さに依らず最も確か。だが製品のコード（`src/parse/text.ts`・各パーサ）を変えるので、v0.15.1（src を変えない版）に入らない。数える場所の漏れ（数えていない仕事）は見つけられない |
| 53-B | 壁時計の上限を外し、作業量の時計と 40 秒の上限だけにする | 負荷に強いが、`prepareStream` と 1 行の中の仕事が線形でなくなったときの後ろ盾が、テスト全体の 40 秒（15 回の読みの和）だけになる |
| 53-C | T3 の考え方で決め直す（静かな 1 回の読みの時間 × 12 を上限に） | 静かな 1 回は約 85 ms で、× 12 は約 1 秒。今の 3,000 ms より**厳しく**なり、強い負荷ではやはり外れる（観測は約 57〜75 倍） |
| 53-D | 同じ読みを 3 回行い、最も短いものを壁時計の上限と比べる | 3 回とも待たされれば外れる。増え方は見ない |
| 53-E | 今のまま（負荷のゲート T1 で避ける） | L2 のような負荷では外れ続ける |

### 4.6 推奨と理由

**53-F（CPU 時間の絶対の上限 ＋ 256 KiB と 1 MiB の比）。**（人間の決定 B2-Q7 の A を、R2 で 53-F の中身に書き換えた）確かめたいのは「線形でない道が無い」ことで、CPU の仕事の量の性質。CPU 時間なら機械の混み具合で入る待ちが入らず、比なら機械の速さにも依らない。53-G（決定的な回数）は最も確かだが、製品のコードを変えるので、v0.15.1 の範囲の外（後で選び直せる。ROADMAP に残す）。

- 比の上限の決め方【実測。付録 A13】: 基準の commit の worktree の `src/` を、テストの外の 1 つの node のプロセスから、P3 の 17 の形 × 5 つの道具（85 の組）について、256 KiB と 1 MiB を 3 回ずつ読み、そのスレッドの CPU 時間を測った
  - 静か（開始の 1 分平均 2.21）: 最小どうしの比の最大 5.00（0.01 ms と 0.05 ms のごく短い読み）。1 MiB の最小が 20 ms 以上の組（5 つ、すべて「only newlines」）では 4.15〜4.28。1 回の読みの最大 86.47 ms（1 MiB）・23.57 ms（256 KiB）
  - 自分で終わる負荷のもと（24 個の node が 150 秒で自分で終わる。測りの間の 1 分平均 34.31〜53.54）: 比の最大 6.44。20 ms 以上の組では 4.79〜5.55。1 回の読みの最大 124.07 ms（1 MiB）
  - `t(1 MiB) ≤ 8 × t(256 KiB) + 20 ms` は、静か・負荷のもとの両方で、3 回の最小どうしでも、1 回目どうしでも、85 の組すべてで満たした（外れ 0）
  - 8 は線形の 4 倍の 2 倍、二乗の 16 倍の半分。足す 20 ms は、ごく短い読みの揺れ（0.01 ms 台の比が 5 になる）を比の判定から外すため。二乗の道は `t(256 KiB)` が 2.5 ms を超えれば（`16t > 8t + 20`）、つまり 1 MiB で約 40 ms を超えれば比で落ちる
- 作り: テストの中に `cpuMs(fn)`（`process.threadCpuUsage()` の前後の user と system の和）を置く。各形・各道具で 64 KiB を 1 回、256 KiB と 1 MiB を 3 回ずつ読む。絶対の上限（64〜256 KiB は 1,500 ms、1 MiB は 3,000 ms）は、64 KiB の 1 回と、256 KiB・1 MiB の 3 回の最小に当てる。比は 3 回の最小どうし。作業量の時計（`time-limit` にならない）は、どの読みでも確かめる。4 MiB の確かめ（`:282`）も CPU 時間にする
- 待つ時間（スレッドが止まる・CPU を待つ）の確かめは、この形では受け持たない。テスト全体の上限（`it.each` の timeout。T3 で決める）と、suite の上限（T4）が受け持つ（R1-003 の指摘のとおり、役割をテストの timeout に移すことを明記する）
- テストの時間【推定】: 1 つの道具あたり読みが 3 回から 7 回になる。静かな全テストの中の「only newlines」は今 2,346 ms【実測】で、1 MiB と 256 KiB の読みの増え（5 つの道具 × 2 回 × 約 95 ms ≒ 1 秒）を足すと約 3.3 秒、T3 の式（× 12 を 10 秒単位に切り上げ）で 40 秒のまま。実装の段で静かな全テストで測り直し、式が 40 秒を超えれば上限を直す（その場合は既存の期待値の変更。B2-Q15 の条件つきの項）
- `process.threadCpuUsage()` は Node 23.9 から [要確認: Node の文書]。手元の Node v24.13.1 にある【実測】。aiqh は Node 24 以上（`package.json` の `engines`）、CI は 24.13.1（`.github/workflows/ci.yml`）
- vitest の worker（pool `forks`。1 つのテストファイルを 1 つのプロセスで走らせる）の中で、そのスレッドの値はほかのテストファイルの仕事を含まない
- 残る弱さ: CPU 時間も、キャッシュの取り合いなどで伸びる（実測で 1.5 倍、比の最大 6.44）。L2 と同じ強さ（1 分平均 200 以上）での比は測っていない（§8）。比の確かめは 256 KiB と 1 MiB の間の増え方だけを見るので、1 MiB より大きい入力でだけ現れる道は見ない（パーサは末尾 1 MiB だけを読むので、入力はそれより大きくならない。`PARSE_INPUT_MAX`）

### 4.7 変わる出力

無い（テストだけ）。

### 4.8 テストの方針

- 直す前に FAIL するテスト（決定的に作る）
  - T53-1（待ちを数えない）: パーサの読みの途中で、スレッドが 3,500 ms 止まる（`Atomics.wait`。`ReadDeps.parsers` で本物のパーサを包む）形を P3 と同じ測り方で測ると、上限の 3,000 ms の内に入る → 基準の測り方（壁時計）では **FAIL**、CPU 時間では PASS
  - T53-2（CPU を使う遅さは数える）【R1-003 への対応で足した。待ちと CPU 消費を分ける】: パーサの読みの途中で、CPU を 3,500 ms 使う（決まった時刻まで計算で回る）形を測ると、測った値が上限の 3,000 ms を超え、確かめが「外れ」と判定する → 基準の測り方でも新しい測り方でも PASS（守り。CPU 時間に替えても、CPU を使う遅さは見逃さない）
  - T53-3（比の確かめそのもの）: 比の判定の関数に、線形（`t(4N) = 4t(N)`）・二乗（`16t(N)`）・ごく短い読み（`0.01 ms` と `0.05 ms`）の数を渡し、二乗だけが外れる → 基準には比の確かめが無いので **FAIL**（関数が無い）
- **受け入れの条件**【R1-003・R2-002 への対応】（実装の段で、4 つすべてを報告に書く）
  1. P3 の 17 の形 × 5 つの道具の**全部の組で測りが完走し**、CPU の絶対の上限・比・作業量の時計の 3 つすべてを評価できたこと（どの組も、打ち切りや例外で評価が欠けていない）
  2. 打ち切り（テストの timeout・測りの打ち切り）は**検出の成功に数えない**。変異の記録では、絶対・比・作業量の時計の外れと、打ち切りを別に数える
  3. テストの時間が T3 の上限（今の 40 秒）を超えるなら、静かな全テストで測った時間から、T3 の式（× 12 を 10 秒単位に切り上げ）で根拠つきで上限を決め直す（B2-Q15 の 1 の条件つきの `:277`）
  4. 二乗の変異（MUT-1・MUT-2）は、写しの worktree の `src/` に入れ、**実際の P3 のテスト**（vitest でテストファイルを走らせる）を通して、落ちた形・道具・確かめ（絶対・比・作業量の時計・timeout）を記録する
- 検出の力の受け入れの条件【R1-003 への対応】: **わざと二乗にした変異で、新しいテストが実際に落ちた記録**を、実装の段の報告に入れる。設計の段で試作して測った【実測。付録 A14】:
  - 変異は、`src/` を `tmp/` に写したものの `prepareStream` の終わりに、二乗の仕事を足した 2 つ（追跡しているファイルは変えていない）。MUT-1: 行ごとに、前の全部の行を数える（行の数の二乗）。MUT-2: 同じことを空でない行だけに行う（空の行だけの「only newlines」には効かない）。どちらも作業量の時計の外
  - 測り方: 各形を 1 つの子プロセスで、上の 53-F の確かめ（256 KiB と 1 MiB を 3 回ずつ）で読む。子プロセスは 60 秒で打ち切る（打ち切りは、テストの `it.each` の上限で落ちるのと同じ扱いにした）
  - MUT-2: 17 の形のうち、**比で落ちた 8**、絶対の上限（3,000 ms）で落ちた 3、60 秒の打ち切り 4、作業量の時計 0。比だけが見つけた形が 4（「summary lines again and again」1 MiB の CPU 1,792 ms、「section headers」1,442 ms、「pytest summary lines again and again」913 ms、「pytest headings without a summary」1,148 ms。どれも絶対の上限の内）。見つからなかった形 9（空でない行が少なく、二乗の仕事が小さい形。テスト全体としては、8 の形で落ちる）
  - MUT-1: 17 の形のうち、**比で落ちた 8**、絶対の上限で落ちた 3、60 秒の打ち切り 3（行の多い「only newlines」〈約 157 万行〉など）、作業量の時計 0。比だけが見つけた形が 5（「summary lines again and again」1 MiB の CPU 1,495 ms、「section headers」1,281 ms、「pytest summary lines again and again」584 ms、「pytest FAILED lines after the heading」2,467 ms、「pytest headings without a summary」865 ms。どれも絶対の上限の内）。見つからなかった形 8
  - 結論: 絶対の上限だけでは、MUT-1 の 5 つ・MUT-2 の 4 つの形を見逃す。比を足すと見つかる。作業量の時計は、どちらの変異にも気づかない（行の分割は時計の外）
- 負荷のもとの確かめ（任意）: L2 と同じ形（全テスト 2 本を同時、30 分以内、T1 の後）で、新しい確かめ（絶対・比）が外れないことと、比の最大を記録する
- 既存のテストの期待値の変更: `tests/parse-output.test.ts:274` と `:282` の測り方（壁時計 → CPU 時間。数は同じ）。比の確かめは足すもの（既存の期待を変えない）。テストの時間が延びて T3 の式が 40 秒を超えたときだけ、`:277` の上限の数（条件つき）。**承認が要る**（ROADMAP の記載どおり。B2-Q15）

### 4.9 文書

ADR は要らない（テストだけ）。`docs/ops/ci-and-branch-protection.md` の 8-1 の T3 の後に、決まりを 1 つ足す: 「製品の時間の上限に届かないこと・線形であることを確かめるテストは、作業量の時計か、そのスレッドの CPU 時間（絶対の上限と、入力の大きさを 4 倍にしたときの比）で確かめる。壁時計の絶対の上限は使わない。待つ時間はテストの timeout が受け持つ（項目 53）」。CHANGELOG。ROADMAP の項目 53 を閉じ、53-G（決定的な回数）を後の候補として書く。

### 4.10 既存の利用者（適用先 A・B）への影響

無い。

### 4.11 決めること

B2-Q7（直し方）、B2-Q8（同じ形の backlog 35 の確かめ）、B2-Q15

---

## 5. 項目 54: review-packet と出口の表記は、層 (c) を止めない

### 5.1 ROADMAP の記載（`docs/ROADMAP.md:891`）

review-packet は禁止文字の集合 `FORBIDDEN_RANGES`（75 の符号位置）だけを止め、層 (c) の文字（ゼロ幅・異体字セレクタ・タグ文字など）はパケットに入る。端末とレポートの出口の表記（`\u{…}`。ADR-0016・ADR-0020 の決定 3）も同じ集合だけに効くので、層 (c) の文字を名前に持つパスは、security の check の finding の行にその文字のまま出る。パケットを読むレビュアーの側と、出力を読む人の側で、見えない文字が問題になるかを決める（`FORBIDDEN_RANGES` を変えると、パケット・出口・docs のテストの判定が変わる）。

### 5.2 関係するコードと文書

- `src/security/raw-chars.ts`: `FORBIDDEN_RANGES`（`:22-30`。C0〈TAB・LF 以外〉・DEL・C1・U+2028・U+2029・双方向の制御文字・U+FEFF）、`findRawChars`（`:296-311`）、`escapeRawChars`（`:318-325`。端末・Markdown の `\u{…}`）、`escapeRawCharsAsJson`（`:332-339`。JSON の `\uXXXX`。データは同じ）、層 (c) の判断 `decideRawChars`（`:221`。ADR-0037 の I1〜I9）
- `src/security/scan.ts` の `scanRawCharText`（`:312-324`。文字列を security の check と同じ道で調べる入口）
- 禁止の集合の関数（`findRawChars`・`escapeRawChars`・`escapeRawCharsAsJson`・`isForbiddenCodePoint`・`FORBIDDEN_RANGES`）を使う src（9 ファイル。`raw-chars.ts` を import する src は 12 で、残りの 3 つ〈`src/config/schema.ts`・`src/run-history/read.ts`・`src/security/scan.ts`〉は別の export だけを使う）

| 使う所 | 今の振る舞い |
|---|---|
| review-packet の入力の確かめ `checkText`（`src/review/packet.ts:462-482`）。呼ぶ所: 依頼文（`:657`）、レビューの原文（`:662`）、全文（`:815`・`:827`）、差分（`:828`。古い側の行も）、commit のメッセージ（`:850`）、`--doc`（`:876`）、パケットの全体（`:997`）、`latest.json`（`:1080`）、表示する値（`:1109`） | 禁止の文字があれば `raw-char` の finding でパケットを書かない（allow では抑えない。ADR-0036 の決定 9） |
| パケットのインラインのコードの表記 `escapeInline`（`src/review/packet.ts:263-274`。禁止の文字の判定は `:270`） | 禁止の文字・バッククォートを `\u{…}` |
| 表示する値の確かめ `checkValue`（`src/review/checked.ts:52-59`） | 禁止の文字があれば拒む |
| パスのオプション `rawCharsIn`（`src/commands/review-packet.ts:312-317`） | 禁止の文字のあるパスを拒む |
| review-import（`src/commands/review-import.ts:171`・`:217`） | 禁止の文字は JSON の `\uXXXX` で書き、件数の行を出す |
| 端末の出口（`src/output.ts` の `escapeForDisplay` `:31-39`・`safeText` `:53-56`・`:283`） | 禁止の文字を `\u{…}`（1 行の値は LF・TAB も） |
| `latest.md`（`src/report/markdown.ts:201`）・ファイルの出口（`src/report/write.ts` の `writeAtomic` `:102-111`） | Markdown は `\u{…}`、JSON は `\uXXXX` |
| init の設定（`src/commands/init.ts:223`）・設定の生成（`src/config/generate.ts:36`） | 同じ |

- ADR: ADR-0014 の決定 6（パケットの禁止の集合は、追跡している Markdown のテストと同じ部品）、ADR-0016（端末の出口）、ADR-0020 の決定 3（集合は 75 のまま。変えるのは別の依頼。`docs/adr/0020-file-output-notation-and-check-env.md:30`）と既知の限界（集合の外の U+200B などは表記にならない。`docs/adr/0020-file-output-notation-and-check-env.md:66`）、ADR-0036 の決定 9（review-packet は変えない。`docs/adr/0036-security-scan-raw-bidi-controls-and-line-separators.md:37`）、ADR-0037 の決定 7（`docs/adr/0037-security-scan-layer-c-invisible-characters.md:56`）と既知の限界（`docs/adr/0037-security-scan-layer-c-invisible-characters.md:99-100`）
- 今の振る舞いを固定しているテスト: `tests/regression-item49-raw-chars-layer-c.test.ts:473-474`（パスの中のゼロ幅の文字が、finding の行にそのまま出る）、`tests/regression-backlog9-report-file-notation.test.ts:103-105`（JSON の表記は U+200B を変えない）。追跡している docs の禁止の文字のテスト（`tests/docs-no-raw-separators.test.ts`）と、追跡しているファイルの生の文字のテスト（`tests/no-raw-bidi-in-tracked-files.test.ts`）は `FORBIDDEN_RANGES` を使う

### 5.3 今の挙動（実測。数だけ）【実測。付録 A8】

数え方: 基準の commit の `scanRawCharText`（security の check と同じ判断）で、層 (c) の finding（RGI の並びの外）と、除いた数（RGI の並びの内側）を数えた。実行時に組み立てた見本 2 つ（ゼロ幅 1 つと双方向の制御文字 1 つ、RGI の並びの中の U+200D と U+FE0F）で、数え方が動くことを先に確かめた。

| 対象 | ファイル | 層 (c) の finding | 除いた数 |
|---|---|---|---|
| aiqh の全 433 commit の `git log -p` の差分（12.9 MB） | 1 | 0（層 (a)・(b) の 10 件は、v0.11.1 で直した既知のもの） | 0 |
| aiqh の全 commit のメッセージ | 1 | 0 | 0 |
| aiqh の `docs/reviews/`（基準の commit） | 153 | 0 | 0 |
| 手元に受け取ったレビューの原文（`independent-review-*-for-claude.md`） | 55 | 0 | 0 |
| aiqh の手元のレポート（`artifacts/verification/` の latest と history） | 229 | 0 | 0 |
| 適用先 A の追跡しているファイル（基準の commit の `aiqh security-scan --json`、読み取りだけ） | — | 0 | 3 |
| 適用先 A の手元のレポート | 23 | 0 | 0 |
| 適用先 B の追跡しているファイル（同じ） | — | 0 | 11 |
| 適用先 B の手元のレポート | 7 | 0 | 0 |

- 適用先 A・B は 2026-10-26 に v0.15.0 を呼ぶ形に上げてある（読み取りで確かめた）。走査の前後で、両方の作業ツリーの状態（`git status --porcelain --ignored`）は同じだった
- つまり、今の aiqh・適用先 A・B の出力とパケットの入力に、RGI の並びの外の層 (c) の文字は無い。RGI の並びの内側の文字（除いた数）は、適用先 A・B の追跡しているファイルにある

### 5.4 問題

- **レビュアー（AI）の側**: パケットの入力のうち、security の check が見ないもの（commit のメッセージ、依頼文、レビューの原文、`latest.json` の値、範囲の始まりより前に入った差分の古い側の行）に層 (c) の文字があると、生のままレビュアーに渡る。タグ文字は、見えない文字の並びに文を隠せる [要確認: タグ文字による AI への指示の注入の報告]。security の check は追跡しているファイルの中身とパス名だけを見る
- **出力を読む人の側**: 層 (c) の文字を名前に持つパスは、finding の行に生のまま出る（check は FAIL になるが、どこにどの文字があるかが画面で見えない）。check の出力の末尾・テストの名前なども同じ
- **review-import**: レビューの原文の層 (c) の文字は、findings の JSON に生のまま入る。次の verify の security の check で FAIL になる（fail closed だが、遅れて気づく）
- **出口の経路が 2 つある**【R1-002 への対応で書いた】（コードを読んだ）
  - 表示の経路: 端末の行（`src/output.ts` の `safeText`）と、端末の `--json`（`safeJson` `:166-168`。文字列の値とキーを `escapeForDisplay` で表記〈`\u{…}` の文字の並び〉にしてからマスクし、`JSON.stringify`）。値そのものが表記の文字列に変わる（読む人のための形で、今の禁止の集合でも同じ）
  - 保存の経路: ファイルの JSON。verify のレポート（`buildReport` の `copyJson(report, maskSecrets)` → `writeReports` の `JSON.stringify(report, null, 2)` → `writeAtomic(…, "json")` の `escapeRawCharsAsJson`）と、review-import の findings（`JSON.stringify(copyJson(file, maskSecrets), null, 2)` → 同じ `writeAtomic(…, "json")`）。マスクの後の値は変えず、文字の並びの中の禁止の文字だけを `\uXXXX` にする（読み戻したデータは同じ）。Markdown のファイル（`latest.md`）は表示の経路と同じく `\u{…}`
- **保存の経路を広げるときの落とし穴**【R2 の試作で確かめた。付録 A15】
  - 今の `escapeRawCharsAsJson` は `cp.toString(16).padStart(4, "0")` で書く。禁止の集合は BMP の中だけなので正しいが、そのまま層 (c) に広げると、U+FFFF より上の文字（タグ文字 U+E0041 など）が `\ue0041` になり、読み戻すと U+E004 と `1` に変わる（データが壊れる）。BMP の外は、サロゲートの組の 2 つの `\uXXXX` で書く必要がある
  - JSON の文字の並びの上で RGI の判断をすると、値の上の判断とずれる。例: 値 U+0007 U+FE0F U+20E3 は、値の上では U+FE0F が並びの外（finding）だが、`JSON.stringify` の後は U+0007 が `\u0007` になり、その `7` が U+FE0F U+20E3 と keycap の並びを作るので、文字の並びの上では U+FE0F が除かれる（生のまま残る）

### 5.5 候補

| 候補 | 中身 | 評価 |
|---|---|---|
| **54-A（R2 で JSON の約束を足した）** | 「見せない文字」の判断を 1 つにする: 禁止の集合（75。今のまま）と、層 (c) の文字のうち完全な RGI の並びの内側に無いもの。判断は**元の文字列の上**で、LF で分けた 1 行ずつを、行の終わりまで届いた 1 つの窓として当てる。パケットの確かめ・`checkValue`・パスのオプションは拒み、表示の経路は表記（`\u{…}`）にし、保存の経路は**値を変えずに** `\uXXXX` で書く（§5.6） | security の check・パケット・出口が「見えない文字」を同じに決める。RGI の並びの絵文字はそのまま残る。今の出力は変わらない（実測 0）。`FORBIDDEN_RANGES` を変えないので、docs のテストは変わらない |
| 54-G（R2 で足した。退ける） | 保存の経路と表示の経路を分け、保存の経路（ファイルの JSON）では層 (c) を生のまま書き、表示の経路だけを表記にする（R1 の候補の漏れ） | 保存のデータの字面も変えないので、JSON の作りが今と同じで簡単。だが、追跡しているファイルに書く findings の JSON に生の文字が入り、次の verify で FAIL になる（今と同じ遅い気づき）。ファイルをエディタで開く人には見えないまま。54-A は値を変えずに字面だけを表記にできる（試作で確かめた）ので、そちらを選ぶ |
| 54-B | パケットの側だけ（パケットの確かめ・`checkValue`・パスのオプション・review-import）。端末・ファイルの出口は今のまま | AI のレビュアーへの道を先に塞ぐ。出口の表記は既知の限界に残る |
| 54-C | 出口の表記だけ。パケットは今のまま | 人の読む側だけ。パケットの道は残る |
| 54-D | 受け入れて閉じる（ADR-0037 の既知の限界のまま。理由を書く） | 今の出力に例は無い（実測 0）。道は残る |
| 54-E | batch2 から外す（後の batch で決める。B2-Q9 の E） | 54 の実装はこの batch でいちばん大きい。決めるまで、今の既知の限界のまま |
| 54-F（退ける） | `FORBIDDEN_RANGES` そのものに層 (c) を足す（RGI の除外なし） | 絵文字に付く U+FE0F・U+200D も、パケットで拒まれ、端末・ファイルで表記になる。適用先 A・B の追跡しているファイルの RGI の並び（3・11）を含むパケットが作れなくなる。docs のテストも変わる |

### 5.6 推奨と理由

**54-A（R2 の JSON の約束つき）を、この batch の最後の版（v0.17.0）で、新しい ADR（ADR-0039 の案）とともに入れる。**（人間の決定 B2-Q9 の A。R2 で中身を書き足した）

- 理由
  - aiqh は AI のレビューのループを中心に使う。パケットはレビュアーへの入口で、security の check が見ない入力（commit のメッセージ・依頼文・レビューの原文）を含む。層 (c) を security の check で既定で FAIL にした（ADR-0037）のと同じ判断を、入口と出口にも当てると、「見えない文字」の決まりが 1 つになる
  - RGI の並びの内側を除くので、絵文字は今のまま残る（54-F の欠点を避ける）
  - 保存の経路で値を変えない書き方ができる（R2 の試作）ので、54-G のように保存の字面を生のまま残す必要は無い
  - 今の aiqh・適用先 A・B の出力とパケットの入力には、該当する文字が無い（実測 0）。今の利用者の出力は変わらない
- **判断の単位**【R1-002 への対応】
  - 判断の関数を 1 つ足す（仮: `findDisplayRawChars(text)`）。入力は**元の文字列**（表記・マスク・`JSON.stringify` の前）。LF で分けた 1 行ずつを、`decideRawChars` に「行の終わりまで届いた最後の窓」（`final: true`・`offset: 0`）として渡し、禁止の集合の文字と、`decideRawChars` が「finding の側」と決めた文字の位置を返す
  - LF は E（Emoji・Emoji_Component）の外なので、run は LF をまたがない。だから 1 行ずつに分けても、文字列全体でも、run と RGI の区切りは同じ（複数行で判断が変わらない）
  - **CR の扱い**【R2-001 への対応】: `decideRawChars` に渡す前に、`src/security/scan.ts` の `LineAssembler` と同じ条件で、LF の直前の U+000D（1 つ）と、文字列の終わりの U+000D（1 つ。ファイルの最後の CR に当たる）を、層 (c) の判断から外す。元の文字列と位置は保ち（外した CR の位置は判断に渡さないだけ）、出力の字面は変えない。行の途中の CR（単独の CR、CR CR LF の前の CR）は、今の security の check と同じく `control` の finding の側。CR は E の外なので、外しても run と RGI の区切りは変わらない。禁止の集合（75）の CR の扱いは今のまま（パケットの確かめは CR を拒み、表示の経路は `\u{…}` にする。ADR-0014 の C0）。N8 が比べるのは、層 (c) の判断（`decideRawChars` の finding の側）と security の check の finding
  - 表記（禁止の集合の分と層 (c) の分）は、元の位置で決めた後に、1 回の走査でまとめて当てる（禁止の文字を先に表記にしてから層 (c) を決める、という 2 段にしない。表記の字面〈数字など〉が隣の文字と並びを作らないように）
  - パケットの確かめ（ファイルの中身・差分・依頼文などの文字列）、出口、security の check（`scanRawCharText`）は、同じ文字列について同じ「行と符号位置」を決める。R2 の試作で、RGI の並び・連続した並び・並びの外の U+200D・U+FE0F・タグ文字・keycap の部品・LF を混ぜたランダムな 400 の文（2,654 の「行と符号位置」の組）で、出口の判断と security の check の finding が 0 件の食い違いだった【実測。付録 A15】
- **保存の経路（ファイルの JSON）の約束**【R1-002 への対応】
  - 文字列の値とキーそのものは変えない（マスクの後の値のまま）。`JSON.stringify` の後の字面を書き換えるのではなく、**値の上で決めた位置**の符号位置だけを `\uXXXX` で書く JSON の書き手を足す（仮: `jsonForFile(value, 2)`。`JSON.stringify(value, null, 2)` と同じ形・同じキーの順・同じ字下げで、文字列のトークンの中だけが違う）。U+FFFF より上は、サロゲートの組の 2 つの `\uXXXX`。それ以外の字は `JSON.stringify` と同じ（`"`・`\`・制御文字の書き方を含む）
  - 読み戻したデータは、書く前の値と同じ（`JSON.parse` の後の深い同一性）。表記にする文字が 1 つも無い値では、字面も `JSON.stringify(value, null, 2)` と同じ
  - 使う所: `writeReports` の `latest.json`・history と、review-import の findings。どちらも、今 `JSON.stringify` している所を `jsonForFile` に替える（変数の名前は今のまま。書き込み箇所の一覧のテスト〈`tests/file-write-sites.test.ts`〉の表が、内容の式の変数名で見ているかを実装の段で確かめる）。`writeAtomic` の json の分岐の `escapeRawCharsAsJson`（禁止の集合。BMP の中だけ）は、最後の門として残す（`jsonForFile` の出力には禁止の文字が無いので、何も変えない）
  - R2 の試作【実測。付録 A15】: キー・配列・サロゲートの組・片方だけのサロゲート・もとから `\u` の字面を含む文字列・RGI の並び（U+200D・U+FE0F・旗のタグ文字）・連続した並び・並びの外の U+200D・U+FE0F・U+200B・U+00AD・U+200E・U+E0041・複数行・U+0007 の隣の keycap の部品・U+FFFF より上の異体字セレクタと見えない文字の、12 の入力すべてで、読み戻したデータが元と同じ。書いた字面に、判断が表記にする文字は残っていない。表記にする文字の無い 5 つの入力では、字面が `JSON.stringify(value, null, 2)` と同じ
- **表示の経路（端末の行・端末の `--json`・`latest.md`）**: 今の禁止の集合と同じく、値を表記の文字列にする（`\u{HEX}`）。端末の `--json` の値は表記の文字列になる（今の禁止の集合でも同じ。読む人のための形）。この違い（ファイルの JSON はデータを変えない、端末の `--json` は表示のために変える）を ADR-0039 に書く
- パケット: `findRawChars` の代わりに `findDisplayRawChars` を使う。finding の `detail` は符号位置と分類（例: `U+200B zero-width`）。allow では抑えない（禁止の集合と同じ。ADR-0036 の決定 9 の理由のまま。人間の決定 B2-Q10 の A）
- review-import: 保存の経路（findings の JSON は `jsonForFile`）。端末には件数の行を出す（禁止の集合と同じ。人間の決定 B2-Q11 の A。R2 で JSON の約束を足した）
- `escapeForDisplay`（`src/output.ts:31-39`）と、パケットのインラインのコードの表記 `escapeInline`（`src/review/packet.ts:263-274`）も同じ判断の関数を使う
- `FORBIDDEN_RANGES`・`SCANNED_RAW_RANGES`・security の check の判定・docs のテストは変えない
- 時間: 1 行の大半は、層 (c) の候補が 1 つも無いことを 1 回の走査で確かめて返す（ADR-0037 の実装と同じ作り）。最悪の入力で線形であることを、仕事の量で確かめる（L11 と同じ作り）

### 5.7 変わる出力

- 層 (c) の文字（RGI の並びの外）を含むときだけ: 端末と `latest.md` に `\u{…}`、端末の `--json` の値が表記の文字列、`latest.json`・history・findings の JSON の字面に `\uXXXX`（読んだデータは同じ）、パケットは書かれず `raw-char` の finding、review-import は件数の行
- 該当する文字が無いとき（今の aiqh・適用先 A・B のすべて。実測）: 変わらない（ファイルの JSON の字面も同じ）
- 判定（verify の終了コード）: 変わらない。パケット（review-packet の終了コード）は、該当する文字があるとき厳しくなる

### 5.8 テストの方針

- 直す前に FAIL するテスト
  - N1: 名前に U+200B を持つ追跡しているファイルの finding の行が、`\u{…}` の表記で出る → 基準では生のまま（**FAIL**。今の期待 `tests/regression-item49-raw-chars-layer-c.test.ts:473-474` を変える）
  - N2: commit のメッセージ・依頼文・レビューの原文・差分の古い側の行に U+200B・タグ文字（U+E0041 など）があるとき、パケットを書かず `raw-char` の finding → 基準では書かれる（**FAIL**）
  - N3: review-import で、レビューの原文の U+200B が findings の JSON の字面に `\uXXXX` で入り、件数の行が出る。読み戻したデータは原文と同じ → 基準では生のまま（**FAIL**）
  - N4（保存の経路の約束）【R1-002 への対応で広げた】: `jsonForFile` について、(a) `JSON.parse(jsonForFile(v))` と `v` の深い同一性（キー・配列・入れ子）、(b) 字面に判断が表記にする文字が残らない、(c) 表記にする文字が無い値では `JSON.stringify(v, null, 2)` と同じ字面。入力は、キーの中の U+200B・配列・サロゲートの組・片方だけのサロゲート・もとから `\u` の字面を含む文字列・U+200D／U+FE0F（並びの中と外）・旗のタグ文字の並び・U+E0041（BMP の外）・U+E0100・行の境目をまたぐ文字列・U+0007 の隣の keycap の部品 → 基準には `jsonForFile` が無く **FAIL**。今の期待 `tests/regression-backlog9-report-file-notation.test.ts:104`（JSON の表記は U+200B を変えない）を変える
  - N8（判断の範囲）【R1-002 への対応で足した】: 同じ文字列について、パケットの確かめ（`findDisplayRawChars`）・出口の表記・security の check（`scanRawCharText`）が、同じ「行と符号位置」を決める。複数行の文字列、連続した RGI の並び、行の始まり・終わりの並び、keycap の部品を含む。CR について【R2-001 への対応で足した】: CRLF、単独の CR、CR CR LF、文字列の終わりの CR、`lineOverlapBytes` より長い行の窓の境目で CR と LF が分かれる形（`scanRawCharText` に小さな窓の設定を渡す）→ 基準には `findDisplayRawChars` が無く **FAIL**
- 守り（基準で PASS）
  - N5: RGI の並び（U+200D・U+FE0F・旗のタグ文字の並び）は、パケット・端末・ファイルのどこでもそのまま
  - N6: 禁止の集合の文字の振る舞いは今と同じ（既存のテストがそのまま通る）
  - N7: 表示の経路（端末の `--json`）では、値が表記の文字列になる（禁止の集合と同じ形。今の振る舞いを層 (c) に広げたことの確かめ）
- 線形: 1 MiB の最悪の形 6 種で、判断と `jsonForFile` の仕事の量が 1 単位に決まった回数以下で、入力に比例（L11 と同じ作り）
- 既存のテストの期待値の変更（**承認が要る**。B2-Q15）: 上の N1・N4 の 2 か所
- 網羅性の確かめ（R2）: `tests/*.ts` を、層 (c) の符号位置（`0x200b`・`0x200d`・`0xfe0f`・`0xe00`〜・`u200b` など 19 の形）で grep した。当たったのは 4 ファイル（item49 の 28 行、item48 の 2 行、backlog9 の file notation の 1 行、review-import の 1 行）で、1 つずつ開いた（付録 A12）。出口を通して「そのまま」を期待するのは上の 2 か所だけ。item48・item49 のほかの行は security の check の走査の結果（変えない）、review-import の 1 行は ID の書き方の見つけ方（取り込みを止める。出口を通らない）

### 5.9 文書

新しい ADR（ADR-0039 の案。R2 で決定 1・3・4 に判断の単位と保存の経路の約束を書いた）。ADR-0014 の決定 6・ADR-0016・ADR-0020 の決定 3 と既知の限界・ADR-0036 の決定 9・ADR-0037 の決定 7 と既知の限界に、ADR-0039 で置換・追記した旨の注記。CHANGELOG（パケットが厳しくなる、出口の表記が広がる、ファイルの JSON はデータを変えない、端末の `--json` は表示のために値を表記にする）。ROADMAP の項目 54 を閉じる。

### 5.10 既存の利用者（適用先 A・B）への影響

実測では、どちらの出力・追跡しているファイル（RGI の並びの外）にも該当する文字は無い。SHA を上げても出力は変わらない見込み。適用先は review-packet を CI で使っていない（ワークフローを読んだ）。

### 5.11 決めること

B2-Q9（方針）、B2-Q10（パケットの allow）、B2-Q11（review-import）、B2-Q15

---

## 6. 項目 55: ほかの 4 つの道具のパーサの選び方

### 6.1 ROADMAP の記載（`docs/ROADMAP.md:892`）

vitest・eslint・npm audit・security-scan のパーサの選び方は、今も単純コマンドのどの語でもよい（`src/parse/select.ts` の `toolsIn`）。pytest だけは v0.14.0 から語の位置で選ぶ。`echo vitest …` のような check の出力に要約と同じ形の行があれば、件数を誤って出しうる（判定は変わらない）。pytest と同じ規則に揃えるかを決める。既存の出力が変わりうるので、別の版で。

### 6.2 関係するコードと文書

- `src/parse/select.ts`: `selectParser`（`:36-53`）、`segmentsOf`（`:56-79`。引用符を捨てる、`;`・`|`・`&`・`(`・`)` で区切る）、`npmScriptName`（`:82-90`）、`toolsIn`（`:96-107`。どの語でも、語の最後の部分で決める）、pytest の `choosesPytest`（`:145-153`。B-1）
- `src/command-words.ts`（`simpleCommands` `:34`、`withoutAssignments` `:125`、`lastPathSegment` `:138`）
- ADR-0028 の決定 2（`docs/adr/0028-output-parsers-display-only.md:50-54`）、決定 3（`:55`。別の道具の出力を、その道具の件数として出さない）、決定 12（追記 `:208-`。pytest は語の位置、ほかの 4 つは変えない）
- テスト: `tests/parse-select.test.ts:27-60`（選ばれる形 15・選ばれない形 8）、`:62-110`（npm の script 11 と package.json の読み方）
- batch1 の設計（最終）§3.5（ほかの 4 つは変えない）、付録 B の 4

### 6.3 今の挙動と、候補の規則での違い【実測。付録 A9】

基準の commit の `selectParser` と、試作の 2 つの規則（この設計のためだけの試作で、製品のコードではない）を、決まった入力で比べた。

- 試作の規則「位置」: 単純コマンドの実行位置（`名前=値` の前置きを飛ばした後）の語が道具。決まった起動の形だけを飛ばす: `npx`（値を取らない旗 `--no-install`・`--yes`・`-y`・`--no`・`--quiet`・`-q`）、`node <道具の入口のファイル>`（`vitest.mjs`・`eslint.js`・`cli.ts`／`cli.js` と `security-scan`）、パスつきの実行の語（`./node_modules/.bin/vitest`）。`npm` は `-` で始まる語の後の `audit`。ほかの単純コマンドがあってもよい（2 つの道具なら `several-tools`）
- 試作の規則「B-1」: 「位置」に加え、pytest と同じく、ほかの単純コマンドが前にも後ろにも無い（前の `cd <1 語>` だけは認める）
- pytest の規則は、どちらでも変えない

| 入力の組 | 入力の数 | 「位置」で変わる | 「B-1」で変わる |
|---|---|---|---|
| `tests/parse-select.test.ts` の選ばれる形 | 15 | 1（`"vitest" run`: vitest → no-parser） | 1（同じ） |
| 同じ、選ばれない形 | 8 | 0 | 2（`eslint . && vitest run`・`vitest run; npm audit`: several-tools → no-parser） |
| 同じ、npm の script | 11 | 0 | 1（`npm run both`: several-tools → no-parser） |
| aiqh 本体の設定の 8 つの check | 8 | 0 | 0 |
| 適用先 A の設定の 5 つの check | 5 | 0 | 0 |
| 適用先 B の設定の 2 つの check | 2 | 0 | 0 |
| 例の形（この設計で選んだ 22） | 22 | 12 | 16 |

例の形で変わったもの:

- どちらの規則でも no-parser になる（今は道具が選ばれる）: `echo vitest run`、`echo ' Test Files  1 passed (1)' vitest`、`printf '%s\n' eslint`（今の誤った選び方が直る）／`cross-env CI=1 vitest run`、`pnpm exec vitest run`、`pnpm vitest`、`yarn vitest`、`bunx vitest`、`npm exec vitest`、`timeout 600 vitest run`、`npm --prefix web audit`、`sh -c 'vitest run'`（起動の形の一覧に無いので、件数が出なくなる）
- 「B-1」だけで no-parser になる: `vitest run && echo done`、`vitest run; echo ' Test Files  9 passed (9)'`（後ろの単純コマンドが要約の形を出す。今は偽の件数が出る）、`npm run build && vitest run`、`vitest run | tee out.txt`
- 変わらない: `cd web && vitest run`、`CI=1 vitest run`、`npx --yes eslint .`、`npm audit --json`、`npx --no-install aiqh security-scan`、`make lint`（今も no-parser）

### 6.4 問題

- 今の「どの語でも」は、道具の名前を引数に持つだけのコマンド（`echo` など）でも道具を選ぶ。道具でない単純コマンドが、その道具の要約と同じ形の行を出したときだけ、誤った件数が出る（判定は変わらない。P1）
- 揃えると、起動の形の一覧に無い wrapper（`cross-env`・`pnpm`・`yarn`・`bunx`・`npm exec`・`timeout`・`sh -c`・値を取る npm の旗）で件数が出なくなる。一覧を広げると、それぞれの旗の形を持つことになる（pytest・node:test で持った一覧と同じ種類の保守）

### 6.5 候補

| 候補 | 中身 | 評価 |
|---|---|---|
| **55-A** | 揃えない。今の「どの語でも」を保ち、理由と既知の限界を ADR-0028 の決定として書き、項目 55 を閉じる。守りのテスト（wrapper の形が選ばれること、誤った選び方の例）を足す | 出力は変わらない。誤りが起きるのは、道具でないコマンドが要約の形を出す形だけ。pytest は要約が短い 1 行（`N passed in Xs`）で、ほかのコマンドが同じ形を出しやすいので B-1 にした（B1-Q7）。ほかの 4 つの要約は、vitest は 2 行の組・eslint は U+2716 の印の後ろの `N problems (…)`・npm audit と security-scan は固有の文で、偶然に出る形ではない |
| 55-B | 語の位置だけ揃える（試作の「位置」。起動の形は固定の一覧。ほかの単純コマンドは認める） | `echo`・`printf` の誤った選び方（例の 3 つ）は直る。一覧に無い wrapper の件数が消える（例の 22 のうち 9）。後ろのコマンドの偽の要約は残る |
| 55-C | pytest と同じ B-1 に揃える | 後ろの単純コマンドの偽の要約の形も防ぐ。正しい件数が出うる形で消えるものが最も多い（例の 22 のうち 12。ほかに偽の要約の形 1 つが正しく消える）。既存のテストの期待値の変更が 4 |
| 55-D | 実行位置が出力のコマンド（`echo`・`printf` など、固定の一覧）の単純コマンドだけを、道具を選ぶ語から外す | 消える形が無く、`echo` の誤りだけ直る。一覧の作りが場当たり。後ろのコマンドの偽の要約は残る |

### 6.6 推奨と理由

**55-A（揃えない）。**

- 3 つの設定（aiqh・適用先 A・B）はどの候補でも変わらず、直す利益が実際の設定には無い（実測）
- 揃える候補（B・C）は、今件数が出ている wrapper の形で件数を消す。誤った件数（表示だけ）を防ぐ代わりに、正しい件数（表示だけ）を失う
- 誤った件数が出るには、check の設定（リポジトリで見える）に、道具でないコマンドが道具の要約と同じ形の行を出す形を書く必要がある。判定と終了コードは変わらない（ADR-0028 の P1）
- ADR-0028 の決定 3（別の道具の出力を、その道具の件数として出さない）との食い違いは、既知の限界として書く（pytest は要約の形の偶然の一致が起きやすいので、規則を厳しくした、と理由を分ける）
- 後で揃えるとき（例: 利用者の設定で誤りが起きた）のために、試作の比べ方（付録 A9）と、変わる形の一覧を ADR-0028 の追記に残す

### 6.7 変わる出力

55-A: 無い。55-B・C を選ぶとき: §6.3 の「変わる」の形で、`parsed` が `not-applicable`（`no-parser`）になり、端末の `parsed:` の行と `latest.md` の Parsed Output が出なくなる（判定は変わらない）。

### 6.8 テストの方針

- 55-A: 守りのテストは、**正しく件数が取れる wrapper の形が選ばれる**ことだけにする（基準で PASS）【R1-005 への対応で直した】。`tests/parse-select.test.ts` に、`cross-env CI=1 vitest run`・`pnpm exec vitest run`・`npm exec vitest`・`timeout 600 vitest run`・`npm --prefix web audit` が今の道具を選ぶこと。今は正しく件数が出る形なので、選び方を変える日に、件数が消えることがテストの差分に出る
- 誤った選び方（`echo vitest run` が vitest を選ぶ、`printf … eslint` が eslint を選ぶ、など）は、**テストで固定しない**。既知の限界として ADR-0028 の決定 13 と ROADMAP に記録するだけにする。将来その誤りを直しても回帰とは扱わない（その形の期待を足す・変えるのは、直す版の設計で決める）【R1-005 への対応】
- 55-B・C を選ぶとき: 直す前に FAIL するテストは、`echo vitest run` などが no-parser になること（基準では vitest。**FAIL**）。既存のテストの期待値の変更は、55-B で 1（`"vitest" run`）、55-C で 4（`"vitest" run` の 1 と、several-tools → no-parser の 3）

### 6.9 文書（55-A の文案。ADR-0028 の追記「決定 13」。R2 で既知の限界の扱いを足した）

「ほかの 4 つの道具（vitest・eslint・npm audit・security-scan）の選び方は、語の位置で見ない（v0.15.1 で決めた。ROADMAP の項目 55）。理由: (1) 誤った件数が出るのは、道具でない単純コマンドが道具の要約と同じ形の行を出すときだけで、4 つの要約は偶然に出る形ではない（pytest の 1 行の要約とは違う）、(2) 語の位置で見ると、起動の形の一覧に無い wrapper の件数が出なくなる（batch2 の設計の試作で、例の 22 の形のうち 9〜12）、(3) 判定は変わらない（P1）。既知の限界: `echo vitest …` のような形でも vitest のパーサが選ばれ、出力に要約の形の行があれば、その件数が出る。この限界は記録だけで、テストで固定しない。守りのテストが固定するのは、正しく件数が取れる wrapper の形が選ばれることだけ。将来この限界を直しても、それ自体は回帰と扱わない。」

ROADMAP の項目 55 は、同じ既知の限界を書いて閉じる（付録 B の 6）。

### 6.10 既存の利用者（適用先 A・B）への影響

どの候補でも、適用先 A・B の設定の check の選ばれ方は変わらない（実測）。

### 6.11 決めること

B2-Q12、B2-Q15

---

## 7. 版の分け方（案）

決まり（今のまま）: pull request は同時に 1 つ（`docs/ops/ci-and-branch-protection.md` の §8）。各版の後に、SHA と CI を記録する PR（`docs/<topic>`）を 1 つ挟む。

| 順 | 版 | 項目 | 種類 | 判定・出力の変化 | 独立レビュー（案） |
|---|---|---|---|---|---|
| 1 | **v0.15.1**（patch） | 53-F（CPU 時間の絶対の上限と比）、50-A・50-B（program の作り直しの削減。R2 の鍵）、51-A（ワークフローの Job Summary。R2 の形）、55-A（ADR-0028 の決定 13 と守りのテスト） | tests・ワークフロー・docs だけ。src は変えない | aiqh の CLI の出力・判定は変わらない。`job-summary: true` の呼び出し側の要約が出るようになり、そのレポートは作業のディレクトリに書かれなくなる | 実装 1 回（テストの差分とワークフロー: 測り方の置き換えが検出を弱めていないか〈二乗の変異で落ちた記録〉、SourceFile の使い回しの等しさと鍵、ワークフローの本文の実行のテスト） |
| 2 | **v0.16.0**（minor） | 52-A（runId。ADR-0038） | レポートの形 | 最上位のキーと `latest.md` の行が増える。判定は変わらない | 実装 1 回 |
| 3 | **v0.17.0**（minor） | 54-A（層 (c) のパケットと出口。ADR-0039） | パケットが厳しくなり、出口の表記が広がる | 該当する文字があるときだけ。verify の判定は変わらない | 実装 1 回 |

- 1 を先にする理由: 53 と 50 は、後の版の各 commit の検証（負荷のもとのテスト）を安定させる（batch1 で 41 を先にしたのと同じ）。51・55-A も小さく、src を変えない同じ版にまとまる。R1 の問い 6 の「50-B と 53-A は検出力の条件を確定してから実装する」は、R2 の §1.6（鍵）と §4.6（比の上限と変異の記録）で決めた
- 3 に進む条件（R1 の問い 6）: ADR-0039 の案の保存の経路の約束（値を変えない JSON の書き手）が設計で確定していること。R2 で決めた（§5.6）
- 2 と 3 を分ける理由: どちらも出力を変えるが、変わる場所と読み手が違う（2 はレポートの形、3 はパケットと表記）。CHANGELOG とレビューの焦点を分ける
- 別の分け方（B2-Q13）
  - V2: 2 と 3 を 1 つの v0.16.0 にする（レビューと記録が 1 回減る。変更が大きくなる）
  - V3: 1 を v0.15.1（53・50）と v0.15.2（51・55-A）に分ける（テストだけの版とワークフローの版を分ける。PR と記録が 1 回増える）
  - 54 を batch2 から外すとき（B2-Q9 の E）: 3 が無くなる
- 依存: 52 と 54 は別のモジュール（`src/report/` と `src/security/`・`src/review/`・`src/output.ts`）。54 の JSON の表記はレポートのファイルの出口（`writeAtomic`）を通るので、2 の後に 3 を入れると、`runId` の入ったレポートで 3 の守りのテストを書ける。51 は 52 の `latest.md` の新しい行をそのまま要約に出す
- 適用先の SHA を上げる時期（B2-Q14）: v0.15.1 は適用先の出力を変えない（`job-summary` を使っていないため）。v0.16.0 でレポートに `runId` が入る。推奨は、batch2 の最後の版の後に 1 回上げる

---

## 8. 確かめていないこと

- 53: L2 と同じ強さ（1 分平均 200 以上）の負荷での、1 回の読みの CPU 時間と比（測ったのは自分で終わる 24 個の負荷、1 分平均 18〜54）。比の確かめを足した後のテストの時間（【推定】だけ）。二乗の変異は 2 つの形（行の数の二乗）だけで、1 行の中の二乗は試していない（1 行は 4,096 単位までなので、入力の長さに対しては線形になり、比では見えない。絶対の上限が受け持つ）。GitHub の runner での `process.threadCpuUsage()` の振る舞い [要確認]。`process.threadCpuUsage()` が Node 23.9 からあること [要確認: Node の文書]
- 50: TypeScript の SourceFile を、鍵の同じ program の間で共有してよいこと（言語サービスの鍵と同じ options を使い、試作で等価を確かめたが、TypeScript の文書の約束としては確かめていない）[要確認]。試作の等価は 5 つの program（ガードの答えは比べていない。型の誤りの一覧だけ）。50-A・50-B の後の、全テストの時間の減り（【推定】だけ）。vitest の project ごとの `maxWorkers` を、本物の 15 ファイルで試していない（小さな fixture だけ）
- 51: GitHub Actions での実行（手元でワークフローの本文を bash で走らせただけ。macOS の bash と `mktemp`）。`$RUNNER_TEMP` が job ごとで、job の終わりに捨てられること、再利用ワークフローの job に呼び出し側が手順を足せないこと [要確認: GitHub の文書]
- 52: review-packet が `runId` の入った `latest.json` を今と同じに表示すること（コードを読んだだけ）。UUID の衝突は計算の見込み
- 54: タグ文字による AI への指示の注入の報告の細部 [要確認]。出口の判断と `jsonForFile` を足したときの、端末とファイルの出力の時間（大きな check の出力の末尾）。試作の JSON の書き手は 12 の入力とランダムな 400 の文で確かめただけ（実装の段で、性質のテストとして入れる）。適用先が review-packet を手元で使っているか（CI では使っていない）
- 55: 3 つの設定のほかの、実際の利用者の設定（例の 22 の形は、この設計で選んだもの）。npm・pnpm・yarn・bunx の旗の形 [要確認]
- 全体: 付録 A の測りは、どれも 1〜3 回。実装の段で、各 commit の worktree の検証の中で測り直す

---

## 付録 A. この段の測り方（どれも commit しない。作業の記録は git 管理外の `tmp/batch2/`）

- A1（53）: worktree の `src/parse/read.ts` の `parseOutputAs` を、テストの外の 1 つの node のプロセスから呼び、P3 の 4 つの形（only newlines・pytest の要約の繰り返し・vitest の要約の繰り返し・eslint の行）× 3 つの大きさ × 5 つの道具 × 5 回の、1 回の読みの壁時計（`performance.now()`）。作業量の時計はテストと同じ形で渡した。T1 の後、開始の 1 分平均 2.84
- A2（53）: 1 MiB の「only newlines」を 5 つの道具 × 5 回、壁時計・`process.threadCpuUsage()`・`process.cpuUsage()` を同時に。静か（T1 の後）と、自分で終わる CPU の負荷（node のプロセス 24 個が、決まった時刻まで計算して終わる。シグナルは送らない）のもと。負荷のプロセスの終わりを確かめた
- A3（50）: worktree の外の vitest の設定（`--root` に worktree、`setupFiles` に worktree の外のファイル）。setup のファイルで `ts.sys.readFile` を包み、ファイルごとに `tsconfig.json` を読んだ回数（= `tests/structure/typescript.ts` の `createProgram` の回数。1 回ごとに 1 回読む）を数えた。TypeScript の export は getter なので、`ts.createProgram` そのものは包めなかった（1 回目の試みは、全ファイルの setup の誤りで止まった。テストの結果は使っていない）。2 回目で全テスト PASS、vitest の JSON の reporter でファイルごとの時間
- A4（50）: worktree の `tests/structure/typescript.ts` の `createProgram` と、同じ作りで SourceFile を使い回す host を、1 つの node のプロセスで。3 回
- A5（50）: 架空の 8 つのテストファイル（各 1 秒待つ）と、2 つの project（`groupOrder` 0 と 1、1 は `maxWorkers: 1`・`isolate: false`）。始まり・終わりの時刻と pid を記録
- A6（51）: 架空の fixture のリポジトリ 4 つ（git の作業ツリー、check は `node -e 0` 1 つ）で、基準の commit の `aiqh verify`。`GIT_CEILING_DIRECTORIES` で外のリポジトリを見ないようにした
- A7（52）: aiqh 本体の手元の history のファイル 1 つの写しと、最上位に `runId`（架空の値）を足した写しを、別々のディレクトリから `aiqh history --from <history のディレクトリ> --json` で読んだ
- A8（54）: worktree の `scanRawCharText` と `findRawChars` で、ファイルごとに数だけを出す（中身は出さない）。見本 2 つで先に確かめた。適用先 A・B は、元のリポジトリで基準の commit の `aiqh security-scan --cwd <適用先> --json` を読み取りだけで走らせ、前後で `git status --porcelain --ignored` の要約が同じことを確かめた
- A9（55）: worktree の `selectParser` と `src/command-words.ts` を使う、この設計のためだけの試作の規則 2 つ。npm の script は、`tests/parse-select.test.ts` の表、aiqh の `package.json`、適用先 A の `package.json`（git の HEAD から読んだ写し）

（R2 で足した測り。どれも基準の commit の worktree〈R2 で作り直した〉と `tmp/batch2/r2/` の中だけ）

- A10（50。R1-001）: `tmp/batch2/r2/proto50/` に、§1.6 の鍵の SourceFile の表の試作（`cache.ts`）と確かめ（`check.ts`）。テストの helper と同じ作りの program を、表の有り無しで作り、リポジトリの全ファイル（宣言のファイルと node_modules を除く）の構文と型の誤りの一覧を比べた（5 つの program）。編集の前後・違う解析の条件・fixture との混在・汚染は、`tmp/` の中の仮の小さなプロジェクト（`tsconfig.json`・`package.json`・2 つの源）で。T1 の後
- A11（51。R1-004）: `tmp/batch2/r2/proto51/`。基準の commit の `verify.yml` から 2 つの手順の `run:` の本文を取り出し（Python で、手順の名前の後の `run: |` のブロック）、案の本文と一緒に、偽の `aiqh`（bash）と仮の `RUNNER_TEMP`・`GITHUB_OUTPUT`・`GITHUB_STEP_SUMMARY` で、`bash --noprofile --norc -eo pipefail` で 7 つの場面を走らせた。環境は `env -i` で最小にした
- A12（52・54・53。B2-Q15 の網羅性）: 基準の commit の `tests/*.ts` を `git grep` した。52: `Object.keys(` でレポートを見る行・`REPORT_KEYS`・`"configSha256", "startedAt"`・`| Started |`・`| Finished |`・`toHaveLength(15)`・`renderMarkdown(` の全文の比べ・`latest.json`／`latest.md` の読み込み・`.split("\n")[` の行の番号の比べ。54: 層 (c) の符号位置の 19 の形（`0x200b`・`0x200c`・`0x200d`・`0x2060`・`0xfe0`〜・`0xad`・`0x00ad`・`0x200e`・`0x200f`・`0x061c`・`0xe00`〜・`0xe01`〜・`0x180b`〜`0x180f`・`0x034f`・`0x3164`・`u200b`・`u200d`・`ufe0f`・`u{200b}`）。53: `tests/parse-output.test.ts` の `toBeLessThan(`。51: `artifacts/verification/latest.md`・`aiqh verify --config`・`GITHUB_STEP_SUMMARY`・`job-summary`・`output-dir`・`RUNNER_TEMP`。当たった行は 1 つずつ開いた
- A13（53。R1-003）: `tmp/batch2/r2/proto53/ratio.ts`。worktree の `src/` を、テストの外の 1 つの node のプロセスから、P3 の 17 の形（テストの表の写し）× 5 つの道具について、256 KiB と 1 MiB を 3 回ずつ読み、そのスレッドの CPU 時間（`process.threadCpuUsage()`）。静か（T1 の後、開始の 1 分平均 2.21）と、自分で終わる負荷（node 24 個が 150 秒で自分で終わる。測りの間の 1 分平均 34.31〜53.54）。負荷のプロセスは全部自分で終わった（残り 0）
- A14（53。R1-003）: worktree の `src/` を `tmp/batch2/r2/proto53/mut1/`・`mut2/` に写し、`prepareStream` の終わりに二乗の仕事を足した（MUT-1: 行ごとに前の全部の行を数える。MUT-2: 空でない行だけで同じ）。各形を 1 つの子プロセスで A13 と同じく読み、子プロセスは 60 秒で打ち切った（打ち切りは spawnSync の timeout。打ち切った子プロセスは残っていない）。判定は §4.6 の 3 つ（絶対・比・作業量の時計）
- A15（54。R1-002）: `tmp/batch2/r2/proto54/`。`check.ts` は、元の文字列の上で決める判断（禁止の集合と `decideRawChars` の finding の側。LF で分けた 1 行ずつ、`final: true`）と、その位置だけを `\uXXXX` で書く JSON の書き手の試作で、12 の入力の読み戻しの同一性・字面に残る文字・`JSON.stringify` との字面の一致を確かめた。素朴に広げた 4 桁の書き方の破損と、JSON の字面の上の判断のずれ（keycap の例）も同じスクリプトで確かめた。`agree.ts` は、決まった種から作ったランダムな 400 の文（RGI の並び・連続した並び・並びの外の U+200D・U+FE0F・U+200B・U+E0041・keycap の部品・LF を混ぜた）で、出口の判断の「行と符号位置」と `scanRawCharText` の finding を比べた（1 回目は比べの鍵の形の違いで全部が食い違いに見え、鍵の形を揃えて比べ直した）

## 付録 B. ROADMAP の文の案（実装の版の docs の commit で直す）

1. 項目 50: 「v0.15.1 で、program の作り直しを減らした（builtin-r3 の編集ごとの program を 1 回に。`tests/structure/typescript.ts` で、同じプロセスの中で、パス・中身のハッシュ・解析の条件・SourceFile に効く options が同じときだけ SourceFile を使い回す）。並列の抑制（vitest の project を分ける）と、`src/` の確かめを 1 つにまとめる案は残す。CI の unit の時間（項目 42）が T4 の 50% を超えたら選び直す」
2. 項目 51: 閉じる（v0.15.1。`job-summary: true` のとき、その run だけの一時のディレクトリにレポートを書いて、そこから足す。書かれなかったときは 1 行。作業のディレクトリには書かない）
3. 項目 52: 閉じる（v0.16.0。ADR-0038）。項目 47 の文に「v0.16.0 から `runId` で組を見分けられる。並行の verify で組が別の run になりうることは、受け入れ（未解決）のまま」を足す
4. 項目 53: 閉じる（v0.15.1。CPU 時間の絶対の上限と、256 KiB と 1 MiB の比。決定的な操作の回数で見る案〈53-G。製品のコードを変える〉は後の候補）。B2-Q8 で backlog 35 の確かめを変えないなら、「同じ形の `tests/regression-backlog35-url-credential-linear.test.ts` の壁時計の確かめは、記録に外れが無いので変えていない」を足す
5. 項目 54: 閉じる（v0.17.0。ADR-0039）。B2-Q9 で E なら「batch2 から外した」と書いて残す
6. 項目 55: 閉じる（v0.15.1。揃えない。ADR-0028 の決定 13）。既知の限界: 「`echo vitest …` のような形でも vitest のパーサが選ばれ、出力に要約の形の行があれば、その件数が出る。記録だけで、テストで固定しない。直しても回帰と扱わない」
