# Changelog

M0（verify の中核）の各タグと、対応した独立レビューのラウンド。詳細は `docs/reviews/m0/` と `docs/reports/`。

表記規約（R6-002）: 各タグの主表記は**タグが指す commit の SHA**（`git rev-list -n1 <tag>`、peeled）。注釈付きタグのオブジェクト SHA（`git rev-parse <tag>`）は
`/ tag object <SHA>` として併記する。

## v0.5.9 — M2-2: independent review R6 — the M2-2-R5-001 work is closed (docs only)（commit / tag object の SHA はタグ付与後に `git rev-list -n1 v0.5.9` / `git rev-parse v0.5.9` で確認し、次の release commit で記入）

- 独立レビュー m2-2-r6（`docs/reviews/m2-2/independent-review-r6.md`、ChatGPT、範囲 v0.5.7..v0.5.8）: 前回の M2-2-R5-001 は解消。新しい指摘は High 0 / Medium 0 / Low 0。
  対応記録 `docs/reviews/m2-2/response-r6.md`
- 新しい指摘が無いので、前提の実測（再現）は行っていない。High 0・指摘 0 のため、M2-2-R5-001 の作業（v0.5.8、独立レビュー R6）をここで区切る
- 最初の依頼ではパケットが添付されず、レビュー未実施の出力が返ったため、依頼し直した。収録したのは依頼し直した回の出力（response-r6 の補足）
- ROADMAP: M2-2 の節に R6 の結果と v0.5.9 を書いた。バックログは項目も番号も変えていない（先頭は M2-2-R4-001）
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 624 件（100 ファイル）。`package.json` version 0.5.9（`package-lock.json` は変えていない）
- 注記: v0.5.8 の見出しに commit / tag object の SHA を記入した

## v0.5.8 — commit ea3ef71 / tag object a0e7307 — M2-2: tests end what they start on failure paths (M2-2-R5-001)

- **M2-2-R5-001（Medium、独立レビュー m2-2-r5）を修正**（`tests/` だけ。製品のコードは変えていない）: テストが途中で失敗すると、実行中の `executeCommand()`・CLI を
  止める処理に届かない箇所があった。vitest はテストファイルが終わるとワーカーを止めるので runner のタイマーは働かず、子は自分の寿命まで残った（M2-2-FLAKE-001 の
  回帰テストで約 30 秒）。テストのタイムアウトではテストの中の `finally` も当てにならない（ファイルの最後のテストでは実行されず、途中のテストでは次のテストの実行中に
  遅れて実行される）ので、後始末を `afterEach` に置いた
  - `tests/helpers.ts`: `runCleanups`・`stopper`・`waitReady`・`SETTLE_MARGIN_MS`（5 秒）。止めた相手の確定を猶予 ＋ 5 秒まで待ち、超えたらテストを失敗にする。
    止めるのは runner の AbortController か ChildProcess の handle だけで、ファイルから読んだ pid には signal を送らない
  - 直したテスト: `regression-r4-report`（A・B）、`regression-m2-2-flake-001-timeout-after-abort`、`regression-r2-cli-signal`（後始末のためだけの AbortController）、
    `regression-r3-cli`（CLI を SIGTERM で止めて終了を待つ）。準備の待ちの失敗は「precondition: …」の文言にした。r3-cli の `afterEach` が PASS の回にも消えた後の
    pid へ送っていた SIGKILL と、r4 の B の後始末の SIGKILL（確定の後に消えた pid へ届いていた）をやめた
  - r3-cli が失敗すると、孤立した CLI が消された一時ディレクトリを作り直してレポートを書き、`$TMPDIR/aiqh-r3-cli-*` が残っていた（SP1 で発見）。これも直った
  - 新しい単体テスト `tests/regression-m2-2-r5-001-test-cleanup.test.ts`（M2-2-R5-001、5 件）: 変更前の helpers では 5 件とも FAIL
  - 確かめ（写しで準備を遅らせる・テスト側で待つ 9 ケース。本体のテストに仕掛けは入れていない）: 修正前は失敗から約 2〜30 秒、vitest の終了後も最長約 30 秒残って
    いた子・孫・CLI が、修正後はすべてそのテストの `afterEach` の中で消えた。一時ディレクトリの残り 0、消えた pid への signal 0。後始末の待ちが最も長い r4 の B でも
    20.0 秒（上限 25 秒、`hookTimeout` 30 秒）
  - 製品の動きの期待値（assert の値）は変えていない
- docs: ARCHITECTURE の runner の項目の終わりに、テストの後始末の方針を書いた。response-r5 に対応の記録。ROADMAP: バックログ 1 を外し、2〜20 → 1〜19、テストの
  後始末の残り（低）を 20 に足した。ADR-0017・ARCHITECTURE・M2-2 の節の番号の参照を直した（過去の版の項と `docs/reviews/` は当時の番号のまま）
- テスト 624 件（100 ファイル。619 ＋ 新しい単体テスト 5）。`package.json` version 0.5.8（`package-lock.json` は変えていない）
- 注記: v0.5.7 の見出しに commit / tag object の SHA を記入した

## v0.5.7 — commit 16927aa / tag object 142e04a — M2-2: independent review R5 — the flake and M2-2-FLAKE-001 work is closed (docs only)

- 独立レビュー m2-2-r5（`docs/reviews/m2-2/independent-review-r5.md`、ChatGPT、範囲 v0.5.5..v0.5.6）: 前回の指摘で判定の対象は無し（M2-2-R4-001・002 はバックログのまま）。
  新しい指摘は High 0 / Medium 1 / Low 1。対応記録 `docs/reviews/m2-2/response-r5.md`
  - M2-2-R5-001: テストの前提が崩れて失敗したとき、実行中の `executeCommand()` を止める後始末が無い箇所がある（`regression-r4-report.test.ts` のシナリオ A の
    準備の待ち〈失敗の文言も「precondition: …」でない〉、M2-2-FLAKE-001 の回帰テストの前提の assert）
  - M2-2-R5-002: ARCHITECTURE の `stdoutTail` / `stderrTail` の文言「プロセスグループが終わるまでに取得した出力」が、実装の確定の条件（グループの消滅、または
    SIGKILL の送信）より強い
- 区切る前に R5-001 の前提を実測した（再現した。High の基準には当たらない）: 一時 worktree の写しで子の準備を遅らせると、シナリオ A は「precondition: …」でない
  文言で失敗し、どちらのテストも中断に届かない。vitest はテストファイルが終わるとワーカーを止めるので、runner のタイムアウト・猶予も働かず、子は自分の寿命まで
  残った（M2-2-FLAKE-001 の回帰テストで約 30 秒。vitest の終了の後も）。寿命を超えては残らず、全体の実行 2 回でほかの 617 件の結果は変わらなかった。
  `tests/` 全体の同じ種類の箇所も表にした
- ARCHITECTURE の runner の節の 3 か所を実装の確定の条件に合わせた（出力の末尾は stdout / stderr が閉じるまでに取得した出力。runner は `close` の後、グループの
  消滅または SIGKILL の送信で確定し、SIGKILL の後はグループの消滅を待たない）。§10 の表の「消滅確認の後に終了」はバックログ 18 のまま
- v0.5.6 の SP2 で観測した r4 の B の 23 秒の 1 回（393 回中 1 回、失敗ではない）を、response-r5 とバックログ 18（SIGKILL の経路のグループの消滅の確認）に記録した
- ROADMAP: M2-2-R5-001 をバックログの先頭（1）へ。既存の項目は 2〜20 に（v0.5.6 の 1〜19）。ADR-0017・ARCHITECTURE・M2-2 の節の番号の参照を直した
  （過去の版の項と `docs/reviews/` は当時の番号のまま）
- 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、テストの不安定と M2-2-FLAKE-001 の作業（v0.5.6、独立レビュー R5）をここで区切る
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 619 件（99 ファイル）。`package.json` version 0.5.7（`package-lock.json` は変えていない）
- 注記: v0.5.6 の見出しに commit / tag object の SHA を記入した

## v0.5.6 — commit 6def387 / tag object 0efff5c — M2-2: the unit-minpath flake fixed; an interruption cancels the pending timeout (M2-2-FLAKE-001)

- **M2-2-FLAKE-001（runner の不具合）を修正**: 中断されたチェックの `timedOut` は「中断前にタイムアウトへ到達していたか」（ARCHITECTURE、R4-002）だが、runner は
  タイムアウトのタイマーを結果の確定のときにだけ止めていたため、中断の後、後始末の猶予（既定 5 秒）の間にタイムアウトの時刻が来ると true になった（R4-002 を実装した v0.1.3 から）。
  中断のときにタイマーを止める（`src/runner/execute.ts` の `onAbort` に 1 行）。タイムアウトと中断がほぼ同時のときは、runner のイベントループで先に処理した方を先とする
  - 影響の範囲: 中断の後の猶予の間にタイムアウトの時刻が来る場合だけ、その check の `timedOut`（true → false）、errorSummary（「; timeout had already been reached」が
    消える）、`latest.md`（「- Timed out after Ns」の行が出なくなり、Summary の文も同じく変わる）、CLI の SKIP の行の理由の文が変わる。status（SKIPPED）・verdict（ERROR）・
    終了コード（130 / 143）は変わらない
  - 回帰テスト `tests/regression-m2-2-flake-001-timeout-after-abort.test.ts`（M2-2-FLAKE-001）: 修正前に 5 回とも FAIL（`exec.timedOut` が true）、修正後に 5 回とも PASS
- **テストの不安定（v0.5.5 のバックログ 1、unit-minpath）を解消**: 原因は確定（負荷の下で、子が SIGTERM を無視する処理を登録する前に 300ms のタイムアウトの SIGTERM で
  終わり、600ms の中断の前に結果が確定した）。同じ前提（子の準備が短いタイムアウトより前）を持つ 4 ファイル 5 件を、事象の順を観測で決める形に直した: 中断が引き金の
  テストは子の準備完了の印を待ってから中断し、タイムアウトが引き金のテストは子の準備に 3 秒の余裕を置き、前提が崩れたら「precondition: …」の文言で FAIL する（SKIP に
  しない）。`regression-r4-report.test.ts` の B は、子がタイムアウトの SIGTERM を受けた印を見てから中断する。製品の動きの期待値は変えていない（足した assert は A の
  `exec.timedOut` が false、B の status SKIPPED と errorSummary）
  - (a) 子の準備を人為的に遅らせた写し（tmp の中だけ）: v0.5.5 の 5 件は 1200ms の遅れで 5 回とも FAIL、直した 5 件は 0ms・1200ms で 5 回とも PASS（修正の前後とも）、
    3500ms（余裕を超える）ではタイムアウトが引き金の 4 件と回帰テストが前提の文言で FAIL
  - (b) 起動の嵐 16（`node -e 0` を繰り返し起動する子 16 本）の下で、直した 4 ファイルと回帰テストを 1 ファイルずつ 393 回（各 76〜82 回。通常 PATH 35〜40 回、
    最小 PATH 38〜42 回）実行して失敗 0（v0.5.5 のテストは同じ条件で `regression-r4-report.test.ts` が 67 回中 3 回失敗）
- docs: ARCHITECTURE の R4-002 の項に、ほぼ同時のときの決め方、exit と close の間の中断の今の挙動（終わっていた check も SKIPPED、verdict は ERROR）を書き、出力の末尾の
  文言を実装に合わせた（中断時点まで → プロセスグループが終わるまでに取得した出力。後始末の猶予の間の出力を含む）。ROADMAP: バックログ 1 を外し、R4 の 2 件を 1・2 へ、
  調査で見つけた kill の EPERM の経路を 3 へ（4 以降は変わらない）。ADR-0017 と ARCHITECTURE の番号の参照を直した（過去の版の項と `docs/reviews/` は当時の番号のまま）
- テスト 619 件（99 ファイル）。`package.json` version 0.5.6（`package-lock.json` は変えていない）
- 注記: v0.5.5 の見出しに commit / tag object の SHA を記入した

## v0.5.5 — commit ea03fc6 / tag object 85ede6d — M2-2: independent review R4 — the output boundary work is closed (docs only)

- 独立レビュー m2-2-r4（`docs/reviews/m2-2/independent-review-r4.md`、ChatGPT、範囲 v0.5.3..v0.5.4）: 前回の 3 件は R3-001 が解消、R3-002・R3-003 が部分的に解消。
  新しい指摘は High 0 / Medium 2 / Low 0。対応記録 `docs/reviews/m2-2/response-r4.md`
  - M2-2-R4-001: `safeJson()` の写しに関数の値の `toJSON` が残ると、`JSON.stringify()` がそれを呼び、戻り値は表記・mask を通らずに出る
  - M2-2-R4-002: 出力の構造ガードが `process.getBuiltinModule(…)` を検出しない（import なしで `node:console`・`node:vm` を取れる）
- 区切る前に 2 件の前提を実測した（どちらも再現。High の基準には当たらない）: `safeJson()` を呼ぶのは `createOutput().json` だけで、今の各コマンドの `--json` は
  JSON のデータだけ（一時 worktree で検査を足し、vitest と通常の出力の比較でコマンドからの呼び出し 35 回に JSON のデータでない値 0 件）。`src/` は
  `process.getBuiltinModule` と同じ種類の方法を 1 つも使わず、読み込む組み込みモジュールは 6 つのまま
- ADR-0017 の既知の限界に 2 件と、同じ種類で検出しない方法（`process.dlopen`、`process.report.writeReport("stdout")`）を追記した（v0.5.5 で追記）。
  「`node:vm` を検出する」と読める記述を「`node:vm` の import を検出する」に、JSON の決定を「JSON のデータについて」に直した。ARCHITECTURE も同じ
- ROADMAP: 2 件と、v0.5.4 で約束した構造ガードの既知の限界（読み込めるモジュールの一覧による限定）をバックログの 2・3 へ。既存の項目は 4〜19 に
- **リリースの検証で起きた不安定なテスト**: 自己 verify の `unit-minpath` が 7 回中 2 回 FAIL した（どちらも `tests/regression-r4-report.test.ts` の
  「R4-002 interrupted checks keep timedOut / outputTruncated > timedOut stays true when an abort overlaps a timeout」、`exec.interruptedBy` が null）。
  2 回目の失敗の直後の負荷平均は 1 分 71.23・5 分 82.17（8 コア）。推定の原因（確定ではない）は、負荷で子が SIGTERM を無視する処理を登録する前にタイムアウトの
  SIGTERM が届き、600ms の中断の前に実行が終わること。テストはこの版では直さず、ROADMAP のバックログの先頭（1）に記録した（`docs/reviews/m2-2/response-r4.md`）。
  v0.5.5 のタグは、負荷の低い状態でのやり直しの検証が PASS した commit に付けた
- 完了基準「High が無ければ区切り、Medium 以下はバックログへ」により、出力の出口の強化（v0.5.2〜v0.5.4、独立レビュー R2〜R4）をここで区切る
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。出力は v0.5.4 と同じ。テスト 618 件（98 ファイル）。`package.json` version 0.5.5
- 注記: v0.5.4 の見出しに commit / tag object の SHA を記入した

## v0.5.4 — commit f33c75f / tag object 29ee54e — M2-2: independent review R3 fixed — one written line is one line; JSON keys through the boundary; only two writers reach the terminal

- 独立レビュー m2-2-r3（範囲 v0.5.1..v0.5.2）の Medium 3 件（v0.5.3 でバックログへ）を修正。SP1 で出口に渡す文字列を AST で全件洗い出し（105 か所と commander の 3 経路）、
  人間の承認の後に実装した。新しい ADR-0017（ADR-0016 の決定 3 と既知の限界を置換）
- M2-2-R3-002: JSON（`--json`）のオブジェクトのキーも値と同じく、禁止文字を表記にしてから秘密の形を mask する。変換の後に 1 つのオブジェクトの 2 つのキーが同じ文字列に
  なったら、合わせずに何も出さない（fail closed、最上位の「unexpected error」で exit 2）。`__proto__` というキーも消えない
- M2-2-R3-001: **1 回の書き出し = 1 行**（1 行の中の LF・TAB も `\u{A}` / `\u{9}` の表記）。複数行はコマンド自身の書式だけを block で書く: init の設定案
  （コメントに入る値は作る所で表記にする。`--write` で書くファイルも同じ）、設定の検証エラー（見出しの 1 行と zod の詳細の block。`ConfigError` に `summary` / `details`）、
  commander の help と `--version`、使い方エラーの提案の行（commander が引用する引数の LF は、引数の一部だけが引用される場合も含めて表記）
- M2-2-R3-003: 端末に書くのは `src/output.ts` の `emitOut` / `emitErr` だけ（引数は `safeText` / `safeJson` だけが作る型 `Safe`）。構造ガード
  `tests/structure/output-guard.ts` は、端末に 1 つのプロパティで届くオブジェクト（`process`・`globalThis`・`node:process`）の動的・反射的な扱い、型検査で中身が
  見えないコード（`Function`・`eval`・`require`・`createRequire`・計算された `import()`・`node:vm`）、fd への書き込みと `/dev/` のパス、`stdio` が pipe / ignore でない
  子プロセス、`safeText` / `safeJson` の外で作る `Safe` を違反にする。SP1 の 22 形、出口の中の 3 形、同じ種類で足した 12 形を回帰テストで固定した
- **出力が変わる条件**:
  - 利用者由来の値に LF・TAB を含むとき（パス、ファイル名、`--cwd`、設定ファイルのパス、Node・git のエラー文、verify の check の出力の末尾の行、commander が
    引用する引数、設定の project 名と check のコマンド）: その文字が `\u{A}` / `\u{9}` の表記になり、1 行のままになる。review-packet は従来どおり
  - 利用者由来の値に禁止文字を含むとき: 従来どおり表記（v0.5.2 から）。加えて、init の設定案のコメントに入る値（アダプタの理由・注記・有効化の案内）の
    LF・TAB・禁止文字は、端末と `--write` で書くファイルの両方で表記になる（今のアダプタの文は aiqh 自身の文で、該当しない）
  - JSON のキーに禁止文字・秘密の形を含むとき: 表記・mask になる。変換の後にキーが衝突するとき: 何も出さず exit 2（今の各コマンドの `--json` のキーは固定の識別子で、
    どちらも起きない）
  - 設定の検証エラーは、見出しの行と zod の詳細を別の書き出しで出す（端末に出るバイトは同じ）
- 禁止文字・秘密の形・利用者由来の LF・TAB の無い出力は v0.5.3 とバイト単位で一致した（同じ fixture で 40 通り: v0.5.2 の 25 通り〈verify の check の出力から TAB を除いた〉に、
  設定の検証エラー 5、引数なしの `aiqh`、提案つきの未知のコマンド・オプション 4、scripts を持つリポジトリなどでの init 3、init の `--write` 2 を足した。
  `--write` が書く `aiqh.config.jsonc`・`.gitignore`・`package.json` も一致）。check の出力に TAB がある verify の 2 通りは、TAB の 2 行だけが表記に変わる
- 既存テストの期待値の変更は 1 件（SP1 の予測どおり: M2-2-R2-001 の対照が固定していた、既定で LF・TAB を残す動き）。回帰テスト 3 ファイル 25 件
  （`regression-m2-2-r3-001-line-breaks`・`regression-m2-2-r3-002-json-keys`・`regression-m2-2-r3-003-output-guard`）。テスト 618 件（98 ファイル）。
  `package.json` version 0.5.4
- 注記: v0.5.3 の見出しに commit / tag object の SHA を記入した

## v0.5.3 — commit e92e999 / tag object dfb1960 — M2-2: independent review R3 — the carry-over work is closed (docs only)

- 独立レビュー m2-2-r3（`docs/reviews/m2-2/independent-review-r3.md`、範囲 v0.5.1..v0.5.2）: 前回の M2-2-R2-001 は解消、新しい指摘は High 0 / Medium 3 / Low 0。
  対応記録 `docs/reviews/m2-2/response-r3.md`
- 3 件の前提を実コードで確かめた（どれも再現。High の基準には当たらない）: R3-001 は利用者由来のパス・ファイル名の LF・TAB で端末の見た目を崩せるが、
  終了コード・最後の判定の行・`--json` の結果は正しい。R3-002 は `safeJson()` がオブジェクトのキーを表記にしないが、各コマンドの `--json` に利用者由来のキーは無い。
  R3-003 は構造ガードが動的な `process[key]` と `src/output.ts` の中の書き出しを検出しないが、今の `src/` に該当は無い
- 3 件は ROADMAP のバックログへ（v0.5.3 では直さない。重大度はレビュアーの判定のまま）。R3-002・R3-001 を先頭、R3-003 を構造ガードの M2-2-R1-003 の直後、
  verify の check への `NO_COLOR`（v0.5.2 の人間の判断）を「ファイルへの出力の禁止文字」の直後に置いた
- 出力の出口の既知の限界 3 点を ADR-0016 と ARCHITECTURE に明記した
- 完了基準「High が無ければ区切り、Medium 以下は次へ」により、M2-1 独立レビュー R3 の持ち越し 5 件から始まった作業（v0.5.0〜v0.5.2、独立レビュー R1〜R3）をここで区切る
- `src/`・`tests/`・`scripts/`・設定は変えていない（docs だけ）。テスト 593 件（95 ファイル）。`package.json` version 0.5.3
- 注記: v0.5.2 の見出しに commit / tag object の SHA を記入した

## v0.5.2 — commit 28999de / tag object 11faa66 — M2-2: independent review R2 — one safe output boundary for every command

- 独立レビュー m2-2-r2（`docs/reviews/m2-2/independent-review-r2.md`、範囲 v0.5.0..v0.5.1）: 前回の 2 件（R1-007、R1-001）は解消、新しい指摘は High 1 / Medium 0 / Low 0。
  対応記録 `docs/reviews/m2-2/response-r2.md`
- M2-2-R2-001（High）: security-scan の出力は masker だけを通していたため、作業フォルダ名などのパスの禁止文字（U+202E など）が生のまま端末に出た。
  レビュアーの経路（読めない既定の設定ファイルのエラー）は v0.5.1 から、走査の出力（作業フォルダのパス、ファイル名）の経路は v0.4.4 でもあった（3 つの版で再現）。
  同じことは verify・init・commander の使い方エラー・`--max-*-bytes` の解析でも起きた
- 修正: すべてのコマンドの標準出力・標準エラーを 1 つの出口 `src/output.ts` に通す（禁止文字を `\u{HEX}` の表記 → masker。JSON は文字列を表記にしてから `maskDeep`）。
  LF と TAB は残す（review-packet は従来どおり表記にする）。commander は `configureOutput` で同じ出口に通す。review-packet の `safeText()`・`escapeDeep()` は共通の出口に置き換えた。
  型情報付きの構造テスト `tests/structure/output-guard.ts` が、`src/output.ts` 以外からの `console`・`process.stdout` / `process.stderr`・fd 1 / 2 への書き込みを禁止する。
  新しい ADR-0016（ADR-0012 の追記の「text 出力側でのエスケープは行わない」を置換）
- **出力の変化**（禁止文字が `\u{HEX}` の表記で出るようになるコマンドと経路）:
  - security-scan: 走査の見出しの作業フォルダのパス、finding のファイル名、設定・走査のエラー（text・`--json`）
  - verify: 進捗の行（project 名、設定のパス、git のブランチ名、check 名）、失敗した check の出力の末尾（ESC による色付け・CR を含む）、エラー
  - init: root のパス、検出した名前、設定案、エラー（text・`--json`）
  - commander の使い方エラー（未知のオプション名・コマンド名）、`--max-*-bytes` の正でない整数のエラー、`src/cli.ts` の予期しない例外
  - review-packet の出力は変わらない
- 禁止文字も秘密の形も無い出力は v0.5.1 とバイト単位で一致した（同じ fixture で 25 通り: help 6、`--version`、使い方エラー 4、security-scan 6、init 2、review-packet 3、verify 3）
- ファイルへの出力（verify のレポート、init が書く設定）の禁止文字は、ROADMAP のバックログ 7 へ
- 既存テストの期待値の変更は 0 件。回帰テスト 1 ファイル 21 件（`regression-m2-2-r2-001-output-boundary`。構造テストを含む）。テスト 593 件（95 ファイル）。
  `package.json` version 0.5.2
- 注記: v0.5.1 の見出しに commit / tag object の SHA を記入した

## v0.5.1 — commit c15ae92 / tag object 5b018b6 — M2-2: independent review R1 — unreadable is not absent; a rejected range keeps the range-independent checks

- 独立レビュー m2-2-r1（`docs/reviews/m2-2/independent-review-r1.md`、範囲 v0.4.4..v0.5.0）: 前回の 5 件は解消 2 / 部分的に解消 3、新しい指摘は High 0 / Medium 6 / Low 1。
  7 件を修正の前に実コードで確かめ、6 件を再現した（R1-004 は再現せず: 規則 `widened-renderer` が検出する）。対応記録 `docs/reviews/m2-2/response-r1.md`
- M2-2-R1-007（レビュアーは Medium。人間の判断で High として扱う）: `latest.json` を `existsSync()` で探していたため、親を辿れない・親がファイル・symlink のループの
  `latest.json` を「無い」とし、exit 0 でパケットを書いて「does not exist」と記述していた。直接読み、ENOENT だけを「無い」、それ以外は検査不能（exit 2）にした
- 既定の設定ファイル（R1-007 の確認で見つけた同じ種類の箇所）: review-packet と security-scan がそれぞれ `existsSync()` で既定の設定ファイルを探していたため、
  辿れない・ループの設定ファイルを「無い」として既定値を使っていた（review-packet は exit 0 でパケットを書き、security-scan は設定で足した `envProbePaths` が効かず
  exit 1 のところ exit 0）。1 つの関数 `loadSecurityConfig`（`src/config/load.ts`）にまとめ、ENOENT だけ既定値、それ以外は設定の誤り（exit 2）にした。`--config` の扱いは変えていない
- M2-2-R1-001（Medium）: `--range` に finding があるとき、範囲に依存しない検査（作業ツリーの確認、root の取得）まで飛ばしていたため、検査不能が exit 1 の完全な結果に
  隠れていた。範囲の値とその結果を使う処理だけを飛ばし、作業ツリー・root・依頼文とレビュー・`latest.json` の読取と復号と JSON でない場合の全文検査・aiqh の版と
  `git --version`・`--label` があるときの既定の出力名は検査する（ADR-0015 を改訂）。塞がれた値は今までどおり git に渡らない
- **終了コードが変わる組み合わせ**: 読めない `latest.json`（ENOENT 以外）が 0 → 2、読めない既定の設定ファイル（ENOENT 以外。review-packet・security-scan）が 0 → 2、
  `--range` の finding ＋ 範囲に依存しない検査不能（作業ツリー外、無い `--cwd`、読めない `latest.json`）が 1 → 2
- パケットの組み立ては変えていない（版の表記が同じ状態で、v0.5.0 と同じ範囲・入力〈v0.4.4..v0.5.0、`latest.json` あり・なし〉から作ったパケットと ZIP の SHA-256 が一致）
- 保証の記述の訂正（コードは変えていない）: `unit-minpath` は PATH の名前解決で起動する、宣言していないコマンドを検出する（絶対パスでの起動、引き継ぐ環境変数、
  単独で実行してシグナルを受けたときの子孫は対象外。R1-005・006。README・ARCHITECTURE）、オプション一覧の比較は short 別名を見ない（R1-002）、外部コマンドのガードは
  複数のツールの probe を混ぜた変数を誤って許可する（R1-003）、brand のガードの関数型へのアサーション（R1-004）（ADR-0014 §14）。既定の設定ファイルの扱い（CONFIG_SPEC §3b）
- 残り（R1-002〜006、同じ種類の残りの箇所）は ROADMAP のバックログの先頭へ（既存の項目は順序を変えず番号だけ振り直した）
- 既存テストの期待値の変更は 0 件。回帰テスト 3 ファイル 36 件（`regression-m2-2-r1-007-unreadable-parent`、`regression-m2-2-r1-config-read`、
  `regression-m2-2-r1-001-rejected-range-preflight`。権限を使う 7 件は root では skip）。テスト 572 件（94 ファイル）。`package.json` version 0.5.1
- 注記: v0.5.0 の見出しに commit / tag object の SHA を記入した

## v0.5.0 — commit d9793cd / tag object 7557c1e — M2-2: M2-1 independent review R3 Medium findings fixed

- M2-2 の先頭: M2-1 独立レビュー R3 の Medium 5 件（R3-002〜006）を修正。SP1 で 5 件とも実コードで再現してから設計し（人間の承認）、各件の回帰テストの
  修正前 FAIL を記録した。対応記録 `docs/reviews/m2-1/response-r3.md`（「M2-2 での修正」）
- M2-1-R3-002: review-packet の終了コードを「検査不能（exit 2。それまでの finding を不完全な一覧として出す）→ 検出（exit 1）→ 出力しない判断（exit 2。finding が
  無いときだけ）」の順に決める（新しい ADR-0015。ADR-0014 §11 を置換）。finding があっても検査を最後まで続け、finding のある値（文字列でない `Rejected`）に
  依存する処理だけを飛ばす。`--cwd` の禁止文字と `--label` の形の誤りは検査を止めない。**終了コードが変わる組み合わせ**: オプションの値・パスの finding と
  検査不能（読めない `--request` / `--review`、作業ツリー外、解決できない ref、欠けた git object、読めない `latest.json`）が 1 → 2、中身・パスの finding と
  `--cwd` の禁止文字・`--label` の形の誤りが 2 → 1。`--json` は、検査不能のとき `"result": "error"` で `findings` が空でないことがある
- M2-1-R3-003: JSON として壊れた `latest.json`、または `<to>` の結果として描画するのに形が合わない `latest.json` は、全文を生文字と秘密の形で検査してから
  出力しない判断にする（形は zod で確認）。読めない `latest.json` は検査不能（`cannot read …`。以前は `write failed` と表示）。`null` などの `latest.json` での
  内部エラー（`--json` で JSON が出ない、`VERIFY ERROR` と表示）を解消
- M2-1-R3-004: `Checked` / `Md` の偽造を、型情報付きの構造テスト（`tests/structure/brand-guard.ts`）と、実行時の登録簿（描画関数・`md`・組み立て・ZIP の
  エントリ名が確かめる）で防ぐ。brand を作るのは `issue` / `REJECTED` / `issueMd` だけ
- M2-1-R3-005: CLI の組み立てを副作用のない `src/cli-program.ts` に分け、`OPTION_INVENTORY` を review-packet の `Command` オブジェクト（非表示・short-only・
  位置引数を含む）と比べる。help と使い方エラーの出力は変わらない（13 通りでバイト一致）
- M2-1-R3-006: テストの外部コマンドを型情報付き AST（`tests/structure/process-guard.ts`）で検査し、PATH を node と git だけにした全テストを自己 verify の
  新しいチェック `unit-minpath`（`npm run test:minpath`）で実行する。**自己 verify は 8 チェック**
- パケットの組み立ては変えていない（版の表記が同じ状態で、v0.4.4 と同じ範囲・入力から作ったパケットと ZIP の SHA-256 が一致）
- 既存テストの期待値の変更は 1 件（`regression-m2-1-r2-007` の「ファイル名の finding + 読めない `--request`」が 1 → 2）。置き換え: `regression-m2-1-r2-checked-inventory` の
  2 件、`regression-m2-1-r2-004-external-commands`（ファイルごと）
- テスト 536 件（91 ファイル）。`package.json` version 0.5.0
- 注記: v0.4.4 の見出しに commit / tag object の SHA を記入し、`docs/reports/M2-1_COMPLETION.md` の空欄も埋めた

## v0.4.4 — commit d21c793 / tag object 07b4cca — M2-1 complete — completion record, R3-002〜006 carried over to M2-2

- 独立レビュー R4（`docs/reviews/m2-1/independent-review-r4.md`）: M2-1-R3-001 は解消、新しい指摘は High 0 / Medium 0 / Low 0。対応記録 `docs/reviews/m2-1/response-r4.md`
- 事前の基準（R<N> で High が無ければ完了）により **M2-1 完了**。完了ベースライン v0.4.3（commit 6cf3199 / tag object 8ee5f54）、完了記録は本タグ
- 完了報告 `docs/reports/M2-1_COMPLETION.md`、ROADMAP（M2-1 完了、次は M2-2。先頭は R3-002〜006）、README
- コード変更なし（`src/` `tests/` `scripts/` は v0.4.3 と同一）。テスト 466 件（87 ファイル）、自己 verify 7 チェック PASS。`package.json` version 0.4.4

## v0.4.3 — commit 6cf3199 / tag object 8ee5f54 — M2-1 independent review R3: High fixed, Medium carried over to M2-2

- 独立レビュー R3（`docs/reviews/m2-1/independent-review-r3.md`。R2 の 8 件は解消 6 / 部分的に解消 2〈R2-002、R2-007〉、新規 High 1 / Medium 5）。対応記録 `docs/reviews/m2-1/response-r3.md`
- M2-1-R3-001（High）: パケットと ZIP の同じ実体の判定を、ファイルシステムの同一性で行う。準備段階で親ディレクトリを作って一時ファイルを書いた後、確定の直前に
  両方の親を `stat` し、`dev`+`ino` と ASCII の basename（大文字小文字を無視）で比べる。親が準備のときから変わっていれば、または同じ実体なら exit 2（既存ファイルは不変）。
  v0.4.2 までの文字列の比較（realpath + NFC + 小文字化）は、APFS が同じ名前として扱う U+00DF / `ss`、U+03C2 / U+03C3、U+00B5 / U+03BC などの親ディレクトリ名で一致せず、
  同時の変更なしに既存ファイルが失われていた（exit 0）。文字列の比較は早い段階の拒否として残した。一度は Medium に下げる判断をしたが、この経路が見つかり High に戻した
- 信頼境界を README と ADR-0014 に明記: aiqh の実行中に、出力先（`-o`・`--zip-output`）とその親ディレクトリを他のプロセスや利用者が同時に変更しないこと
- ADR-0014 の保証の記述を実際に合わせて訂正（`Checked` は型と文字列検査による保証で迂回できる〈R3-004〉、オプション一覧のテストは help の長いオプションのみ〈R3-005〉、
  finding と検査できない状態の終了コードの現状〈R3-002 / R3-003〉）
- R3-002〜006（Medium）は M2-2 の先頭へ持ち越し（ROADMAP）
- テスト 466 件（87 ファイル）。`package.json` version 0.4.3

## v0.4.2 — commit 7f981b2 / tag object 3933494 — M2-1 independent review R2 applied

- 注記（v0.4.3）: この版で対応した M2-1-R2-002 は、独立レビュー R3 で「部分的に解消」と判定された（残りは R3-001 として v0.4.3 で修正）
- 注記（v0.4.3）: この版で対応した M2-1-R2-007 は、独立レビュー R3 で「部分的に解消」と判定された（残りは R3-002・R3-003 として M2-2 へ持ち越し）

- 独立レビュー R2（`docs/reviews/m2-1/independent-review-r2.md`。R1 の 5 件は解消 3 / 部分的に解消 2〈R1-003、R1-004〉、新規 High 4 / Medium 4）の 8 件すべてに対応。
  対応記録 `docs/reviews/m2-1/response-r2.md`。8 件とも v0.4.1 の実コードで再現してから、回帰テストの修正前 FAIL を記録して直した。v0.4.1 の項の
  「5 件すべてに対応」は、R2 の判定では R1-003 と R1-004 が部分的な解消だった（残りの境界は R2-002・R2-003・R2-005・R2-006 として v0.4.2 で直した）
- M2-1-R2-001（High）: `-o` のファイル名（ZIP のエントリ名）を、git を動かす前に生文字と秘密の形で検査する（出所 `output file name`、exit 1）。既定の名前も書き込み前に検査
- M2-1-R2-002（High）: パケットと ZIP の書き込み先を realpath(親) + basename で、NFC・大文字小文字を区別せずに比べ、同じ実体なら exit 2（親のシンボリックリンク、大文字小文字だけの違い）
- M2-1-R2-003（High）: 確定点（両方を置き終えた時点）を定義。確定前は戻し処理の各操作の失敗を集めて、残ったファイルをすべて表示（全部成功したときだけ「restored」、exit 2）。
  確定後の退避ファイルの削除の失敗は exit 0 で警告と場所を出し、最終行 `REVIEW PACKET: written (backup files retained)`、`--json` に `backupsRetained`
- M2-1-R2-004（High）: テストの期待値の SHA-256 を `node:crypto` で計算（`shasum` をやめる）。同じ種類の依存（`rm`、runner 経由の `wc`）も直し、
  テストが git 以外の外部コマンドを skip 条件なしに使わないことを静的・動的に確かめるテストを追加
- M2-1-R2-005（Medium）: インラインコードの中のバッククォートを `\u{60}` に（中身に U+0060 を残さない）
- M2-1-R2-006（Medium）: 描画されるオプションの値（`--range`、`--label`、`--exclude`、`--doc`、依頼文・レビューのファイル名、`-o` のファイル名）を git の前に
  生文字と秘密の形で検査（出所 `range`・`doc path N` など、exit 1）
- M2-1-R2-007（Medium）: すべてのパス（変更一覧と各 commit のファイル一覧）の検査を最初の独立した段階にし、finding があれば中身・大きさに進まず exit 1。
  finding とエラーが同時に起きうる箇所は「検出（exit 1）が先」に統一（上限超過、`--doc` の参照、不正な `latest.json`、`--cwd` のパス）
- M2-1-R2-008（Medium）: README の「現在の状態」を更新。`package.json` の version・CHANGELOG の最新の見出し・README の版が一致するテストを追加。
  ROADMAP のバックログにシンボリックリンク（mode 120000）を kind `symlink` として表示する件を追加
- 構造（同じ種類の漏れを防ぐ）: 検査済みの文字列の型 `Checked`（`src/review/checked.ts`、作れるのは `checkValue` だけ）を描画関数と ZIP のエントリ名の引数にし、
  本文は `md` タグ付きテンプレート（描画関数を通した断片と数値だけを埋め込める）で組み立てる。review-packet のオプションの一覧 `OPTION_INVENTORY` から描画する値を検査し、
  一覧と cli.ts のオプションが一致することをテストで確かめる。型を入れた時点で、別の commit の `latest.json` の `git.commit` / `git.dirty` がそのまま
  埋め込まれていた漏れ（LF と `# …` で見出しが増える、数値の commit で `unexpected error`）が見つかり、直した
- ADR-0014 を更新（検査の段階と優先順位、確定点と戻し処理、同じ実体の判定、ZIP のエントリ名、`\u{60}`、検査済みの型と入口の一覧）。ARCHITECTURE を更新
- テスト 455 件（86 ファイル）。`package.json` version 0.4.2

## v0.4.1 — commit c8a185a / tag object 85555ef — M2-1 independent review R1 applied

- 注記（v0.4.3）: この版で対応した M2-1-R1-003 は、独立レビュー R2 で「部分的に解消」と判定された（残りは R2-002・R2-003 として v0.4.2 で修正）
- 注記（v0.4.3）: この版で対応した M2-1-R1-004 は、独立レビュー R2 で「部分的に解消」と判定された（残りは R2-005・R2-006 として v0.4.2 で修正）

- 独立レビュー R1（`docs/reviews/m2-1/independent-review-r1.md`、High 3 / Medium 2）の 5 件すべてに対応。対応記録 `docs/reviews/m2-1/response-r1.md`。
  5 件とも v0.4.0 の実コードで再現してから、回帰テストの修正前 FAIL を記録して直した
- M2-1-R1-001（High）: git の `-z` のパスを Buffer のまま区切り、厳格に復号する。不正な UTF-8 のパスは `invalid-utf8`、LF・TAB 以外の禁止文字を含むパスは `raw-char`（exit 1、
  `--exclude` した変更も対象）。テキストの変更ファイルの差分が空なら exit 2。git に `core.precomposeunicode=false` を指定（macOS の既定で NFD のパスの差分が空になっていた）
- M2-1-R1-002（High）: `--cwd`・`--output`・`--zip-output` を解決した完全パスに禁止文字があれば exit 2（オプション名とコードポイントのみ表示）。
  review-packet の出力（標準出力・標準エラー・`--json`）はすべて安全表示 `escapeRawChars` を通してから masker
- M2-1-R1-003（High）: パケットと ZIP の 2 段階の書き込み（準備で両方の一時ファイル → 確定で既存を退避 → 置き換え → 失敗時は退避から戻す。戻せなければ退避の場所を表示して残す）
- M2-1-R1-004（Medium）: fence の外のメタデータを文脈ごとに描画（インラインコードは LF・TAB・バックスラッシュ・バッククォートを置き換えて 1 個のバッククォートで囲む、
  見出しはインラインコードのみ、表のセルは `|` もエスケープ）。描画前の値を検査（verify の値、`--exclude`、依頼文・レビューのファイル名）
- M2-1-R1-005（Medium）: submodule は表示する側のモードで判定（submodule → 通常ファイルの type change は通常ファイルとして全文・差分を載せる）。status T の行に「(type change)」
- ZIP の他ツールとの互換性テスト（`unzip`、Python の `zipfile`）を追加。ADR-0014 を更新（パスの検査、安全表示、2 段階の書き込みと戻し、描画の規則、submodule、相対パスの基準）
- テスト 415 件（77 ファイル）。`package.json` version 0.4.1

## v0.4.0 — commit 4e196a3 / tag object 3b7ac13 — M2-1 — aiqh review-packet

- 新コマンド `aiqh review-packet --range <from>..<to>`（ADR-0014）: 独立レビュー用の Markdown パケットを機械的に得た事実だけで作る。人間の依頼文・前回レビュー（任意）、
  commit メッセージ（Co-Authored-By / Claude-Session の trailer を除去）、変更ファイル一覧、ファイルごとの差分、`<to>` 時点の変更ファイルの全文、`--doc` の文書、
  `<to>` の verify 結果（`latest.json` が `<to>` かつ clean のときのみ）。実装者の自己評価・手書きの節は載せない。`--zip` でパケットだけを含む無圧縮 ZIP
- fail closed: 不正な UTF-8・生文字（C0〈TAB・LF 以外、CR を含む〉・DEL・C1・U+2028 / U+2029・双方向制御文字・U+FEFF）・秘密の形を、入力ごとと組み立て後の
  2 段で検査し、検出があれば何も書かない（exit 1）。`security.allow` は出所のパスと行に適用。差分の finding は差分の行とファイルの行を両方表示（`diff a.ts:7 (a.ts:1)`、
  削除行は `(a.ts@from:5)`）。使い方・git・範囲・上限・書込のエラーは exit 2（review-packet の commander の使い方エラーも 2）
- 範囲は最初に完全 SHA に解決し、`<from>` が `<to>` の祖先でなければ exit 2。git は引数配列で呼び、パスは `-z`、内容は blob から。lock ファイル 12 種は既定で全文・差分なし、
  除外・lock・バイナリは blob の SHA-256 を記録。同じ入力・同じ aiqh と git の版ならパケットと ZIP はバイト単位で一致（TZ / LANG に依存しない）
- 新規モジュール: `src/security/raw-chars.ts`（禁止集合と厳格な UTF-8。追跡中の Markdown の検査テストもこれを使う）、`src/review/zip.ts`（`zlib.crc32`、固定 DOS 日時）、
  `src/review/packet.ts`、`src/commands/review-packet.ts`。`src/security/scan.ts` から `findAllowRule` を切り出し（挙動同じ）。新規依存なし
- `--cwd` を付けたとき既定の設定は `--cwd` 先の `aiqh.config.jsonc`（プロセスのカレントの設定は使わない。ガードテスト）
- docs: ADR-0014、ARCHITECTURE、CONFIG_SPEC、README、ROADMAP（review-packet の記述と完了条件を改訂、バックログに review-packet テストの分割・並列化と
  他コマンドの使い方エラーの exit 2 化を追加）。`docs/adr/README.md` に 0012・0013 の行を補完
- テスト 389 件（71 ファイル）。`package.json` version 0.4.0

## v0.3.5 — commit cae4b7a / tag object 36922ad — M2-1 preparation — flaky r3-cli test fixed

- テストのみの修正（`src/` の変更なし）。v0.3.4 の worktree 検証で 1 回だけ FAIL した `tests/regression-r3-cli.test.ts` の「check 1's descendants are gone」の原因は、
  pid ファイルを作成と書き込みの間に読む競合（`Number("") = 0` → `process.kill(0, 0)` が自分のプロセスグループに成功 → alive と判定）。調査記録 `docs/reports/M2-1_FLAKY_R3_CLI.md`
- `tests/helpers.ts` に `parsePid` / `waitForPid` / `assertSignalablePid`。pid は中身が正の安全な整数になるまで待って読み、`process.kill` に 0 以下・NaN を渡さない。
  同じ読み方の 4 箇所（execute / regression-r1-runner / regression-r2-runner / regression-r2-cli-signal）も置き換え
- 回帰ケース: check 1 が pid ファイルを空で作り 400ms 後に書く（修正前は pid 0 で FAIL）。判定の失敗メッセージに `pid=<値>` を出す
- ROADMAP: バックログの順序を変更（review-packet → M2-0-R4-001 → scheme 64 文字超の既知の制限）、SIGKILL 経路の消滅確認をバックログに追加。README の次段階の記述を更新
- テスト 339 件（338 + 1）。`package.json` version 0.3.5

## v0.3.4 — commit 8aa3042 / tag object e5a343d — M2-0 complete — completion record, R4 carried over to M2-1+

- コード変更なし。M2-0 の完了ベースラインは v0.3.3（commit cb632cd）
- 独立レビュー R4（`docs/reviews/m2-0/independent-review-r4.md`、High 0 / Medium 1）を記録（`docs/reviews/m2-0/response-r4.md`）。事前の基準「R4 で High が無ければ M2-0 完了」により完了
- M2-0-R4-001（窓の境界で左右の文脈が失われる誤検出）は VALID。修正せず M2-1 以降のバックログの先頭に設計課題「窓走査は正規表現の境界の文脈を保つ」として持ち越し。
  回帰テストは追加していない（修正時に修正前 FAIL とともに追加する）
- 完了報告 `docs/reports/M2-0_COMPLETION.md`、ROADMAP（M2-0 完了、M2-1 以降のバックログ）、README。テスト 338 件、自己 verify 7 チェック PASS。`package.json` version 0.3.4

## v0.3.3 — commit cb632cd / tag object 984bfcb — M2-0 independent review R3 applied

- 独立レビュー R3（`docs/reviews/m2-0/independent-review-r3.md`、High 1 / Medium 1 / Low 1）の 3 件をすべて反映（`docs/reviews/m2-0/response-r3.md`）
- M2-0-R3-001（High）: private-key のアンカーを固定文字列 `-----BEGIN ` に（本体の真の接頭辞）。長い BEGIN ラベルが窓境界をまたぐと 0 件になる見逃しを修正。
  scanner の本体を「アンカー + 残り」で組み立てる構造テスト（全パターン、例外なし）、上限から導いた長さの性質テスト、凍結した v0.3.2 の参照との正規表現の差分テストを追加
- M2-0-R3-002（Medium）: masker の url-credential を scheme 無制限に戻した（v0.3.1 と同じ範囲を redact）。scanner は `scanPattern` で scheme 64 文字まで。
  **既知の制限: scheme が 64 文字を超える URL 認証情報は scanner では検出しない**（masker は redact する）。v0.3.2 の masker は scheme 65 文字以上を redact しなかった
- M2-0-R3-003（Low）: response-r2 の生の U+2028 / U+2029 をエスケープ表記に訂正。追跡中の Markdown に生の区切り文字・C1 制御文字が無いことをテストで確認
- テストを追加 → 338 件、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.3.3

## v0.3.2 — commit cfadf18 / tag object c9be6e1 — M2-0 independent review R2 applied

- 独立レビュー R2（`docs/reviews/m2-0/independent-review-r2.md`、High 1 / Low 2）の 3 件をすべて反映（`docs/reviews/m2-0/response-r2.md`）
- M2-0-R2-001（High）: 窓走査の完全性不変条件（ADR-0013）。アンカーを有界な接頭辞に（url-credential は `scheme://`、key-value はキー名のみ、private-key に BEGIN マーカー）、
  `MIN_LINE_OVERLAP_BYTES` = 256、最も早い未解決アンカーからの持ち越し、`partial` による解決。既定設定で見逃していた URL 認証情報を検出
- M2-0-R2-002: `allow[].reason` / `path` に C0 / DEL / C1 / U+2028 / U+2029 を禁止（JSON Schema 更新）
- M2-0-R2-003: response-r1 の回帰テスト件数を訂正（修正前 13、最終 14）
- テスト: ソース上の `it(` 18 件（`grep -cE '^\s*it(\.skipIf\([^)]*\))?\(' tests/regression-m2-0r2-*.test.ts`）、vitest の実行数 25 件（固定アンカーのループが 1 つの `it(` から 8 件を生成）を追加 → 294 + 25 = 319 件、10 回連続 PASS。
  自己 verify 7 チェック PASS。`package.json` version 0.3.2

## v0.3.1 — commit e25f59f / tag object c2c6985 — M2-0 independent review R1 applied

- 独立レビュー R1（`docs/reviews/m2-0/independent-review-r1.md`、High 1 / Medium 2）の 3 件をすべて反映（`docs/reviews/m2-0/response-r1.md`）
- M2-0-R1-001（High）: 窓設定の相互制約 `0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes` を `resolveSecurity()`（ConfigError）と `LineAssembler` の
  コンストラクタ（ScanError）で検証し、長行ループに進捗不変条件（ScanError）を追加。無効な組み合わせで走査が終わらなくなる問題の修正
- M2-0-R1-002: `security-scan` の text / JSON 出力を `maskSecrets` / `maskDeep` に通す。`allow[].reason` / `path` の改行を禁止（JSON Schema 更新）
- M2-0-R1-003: `--write-gitignore` を未追跡 `.gitignore` でも冪等に（追記せず `git add .gitignore` を案内。追跡済みの否定修復は維持）
- テスト 294 件（回帰 14 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.3.1

## v0.3.0 — commit 8e81d15 / tag object 3e54718 — M2-0 scanner maintenance

- M1 独立レビュー R3 の持ち越し 5 件をすべて修正: M1-R3-001（候補プレフィックスの持ち越し、`oversized-candidate` finding）、002（`--write-gitignore` が否定ルールを修復）、
  003（`artifacts/` 提案は実生成物 4 パスで判定）、004（追跡済み `.gitignore` だけを保護と数える）、005（PEM ブロック finding の重複統合）
- key-value 分類を走査対象に（`looksLikeSecretValue` で値が秘密らしいときだけ finding。masker は不変）
- `security` セクション: `allow`（path / category / line / 必須 reason / expires。抑制は必ず出力に残す、衛生 finding は抑制不可）、`envProbePaths`、`exampleEnvSuffixes`、
  `maxLineBytes` / `lineOverlapBytes` / `maxCarryBytes`。`aiqh security-scan --config <path>`。JSON Schema 更新。ADR-0012、ADR-0010 改訂
- テスト 280 件（回帰 28 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS（key-value 走査込みで検出 0 件）。`package.json` version 0.3.0

## v0.2.3 — commit 2da4c76 / tag object 474fc27 — M1 complete — completion record, R3 carried over to M2-0

- コード変更なし。独立レビュー R3（`docs/reviews/m1/independent-review-r3.md`、High 0 / Medium 4 / Low 1）を受領し、5 件すべてを VALID と判定したうえで
  **M2-0「スキャナ保守」へ持ち越し**（`docs/reviews/m1/response-r3.md`）。事前の基準「R3 で High が無ければ M1 完了」により **M1 の完了ベースラインは v0.2.2**
- `docs/reports/M1_COMPLETION.md` を新設、ROADMAP に M1 完了と M2-0 を記載、README を更新。`package.json` version 0.2.3。テスト 252 件・自己 verify 7 チェック PASS は v0.2.2 と同じ

## v0.2.2 — commit f958ac7 / tag object 9506eed — M1 independent review R2 applied

- 独立レビュー R2（`docs/reviews/m1/independent-review-r2.md`、High 1 / Medium 4）の 5 件をすべて反映（`docs/reviews/m1/response-r2.md`）。R1-005 / R1-009 の PARTIAL を解消
- M1-R2-001: 未追跡で ignore されていない `.env*` を中身を読まずに finding（`untracked-env`）にする
- M1-R2-002: `lstat` の失敗は ENOENT だけスキップ、他は exit 2（`classifyStatError`）
- M1-R2-003: venv の interpreter が実行可能なときだけ venv と認識（`PythonContext.python`）
- M1-R2-004: 1 行が 256 KiB を超えるファイルは窓走査（`LineAssembler`、重なり 4 KiB）でメモリを抑える
- M1-R2-005: `init` の `artifacts/` 提案を `git check-ignore` で判定。非 git は追加提案、書込は冪等
- テスト 252 件（回帰 21 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS。`package.json` version 0.2.2

## v0.2.1 — commit 630f2e3 / tag object df8f41c — M1 independent review R1 applied

- 独立レビュー R1（`docs/reviews/m1/independent-review-r1.md`、High 3 / Medium 6 / Low 1）の 10 件をすべて反映（`docs/reviews/m1/response-r1.md`）
- M1-R1-001: v0.2.0 が自己 verify（security）で FAIL する状態でタグ付けされていた。`patterns.ts` の説明コメント修正、docs の訂正、
  リリース手順の順序（commit → 各 commit の worktree 検証 → clean 確認 → push → タグ）を CLAUDE.md に固定。scanner は未追跡（非 ignore）ファイルも走査
- M1-R1-002 / 004: scanner を逐次読み（サイズ上限なし）にし、private-key を BEGIN → END の状態機械で検出（開始行–終了行、END 無しも検出）
- M1-R1-003: `init` が package.json のスクリプト本文を出力・複製しない。出力は全て mask
- M1-R1-005: `.gitignore` 判定を `git check-ignore --no-index` に委ね、否定ルールを考慮
- M1-R1-006: `init --write` は生成物を実行時パーサで検証してから書く（required 0 件を拒否）
- M1-R1-007: Node アダプタはローカル証拠（依存 / `node_modules/.bin`）を必須にし、直接実行は `npx --no-install`
- M1-R1-008: JSON Schema は構造検証用と明記し、`command` に `pattern` を追加。既知の差をテストで固定
- M1-R1-009: `venvBin` の実行権限確認、Python Playwright は pytest 必須
- M1-R1-010: `--write-gitignore` / `--write-scripts` の失敗を init 固有の exit 2 に
- テスト 231 件（回帰 34 件を追加）、10 回連続 PASS。自己 verify 7 チェック PASS（security PASS、未追跡込みで 0 件）。`package.json` version 0.2.1

## v0.2.0 — commit 680869d / tag object 2e2685f — M1 — **superseded / known-bad: self verify security FAIL**

- **既知の不具合**: 自己 verify の必須チェック `security` が FAIL する状態でタグ付けされた（`src/security/patterns.ts` の説明コメントが
  url-credential パターンに一致。タグ付与前の自己 verify は当該ファイルが未追跡で走査外だったため PASS していた）。**v0.2.1 以降を使う**。
  タグは削除・付け替えしない（監査性のため）

- チェックアダプタ（Node 7 / Python 7 / 内蔵 security 1）: 検出＋推奨のみ、実行経路は M0 の 1 本のまま（ADR-0011）
- `aiqh init`: 読み取り監査 → 監査表と `aiqh.config.jsonc` 案 → `--write`（既存は `--force` なしで拒否）/ `--write-gitignore` / `--write-scripts`。`aiqh` の PATH 解決元と version を表示、`$schema` は解決できる場合のみ
- `aiqh security-scan`（内蔵、ADR-0010）: git 管理下ファイルの秘密情報パターン・追跡 `.env` 系・`.gitignore` 欠落。値は出力しない。masker とパターン定義を共有し互換テストを追加（R-012 解消）
- 自己 verify が 7 チェック（security PASS）に。JSON Schema を同梱。配布は `npm link`（ADR-0009）
- 対象 2 リポジトリ（Node 系 / Python 系）へ `aiqh init --write` と `aiqh verify` を適用（結果は最終報告）
- テスト 197 件、10 回連続 PASS。`package.json` version 0.2.0

## v0.1.7 — M0 maintenance（commit / tag object の SHA はタグ付与後に `git rev-list -n1 v0.1.7` / `git rev-parse v0.1.7` で確認。最終報告と `docs/reports/M0_COMPLETION.md` §7 に記載）

- 最終独立レビュー（R7-001、Medium）を反映: `OutputBuffer` の UTF-8 境界揃えを、先頭チャンク 1 回の確認ではなく「先頭バイトが継続バイトである間、1 バイトずつ最大 3 回、チャンクをまたいで捨てる」に戻し、さらに切り詰め済み（`truncated`）の間は毎回揃える。R6-001 の共通ヘルパー化で入った退行と、その作業中に見つけた第 2 経路の修正。回帰テスト 5 件（固定チャンク境界 4 件、固定シード 500 回の網羅 1 件）
- テスト 148 件、10 回連続 PASS。**M1 は v0.1.7 を基準に始める。これ以降の M0 レビューは行わない**

## v0.1.6 — commit 8092f9f / tag object 10fd4d9 — M0 maintenance

- 独立レビュー R6（3 件）を反映: レポート用 64KiB 末尾切り出しの UTF-8 境界揃え（R6-001、共通ヘルパー `src/runner/utf8-trim.ts`）、CHANGELOG のタグ横 SHA を peeled commit SHA に統一（R6-002）、ハンドラ差し替え中の Known Risk の説明精度（R6-003）
- テスト 143 件、10 回連続 PASS。M1 は v0.1.6 を基準に始める。R7 は行わない

## v0.1.5 — commit 55e2e0f / tag object df678ca — M0 complete

- 独立レビュー R5（4 件）を反映: シグナルハンドラ差し替えの原子性（R5-001）、確定点の観測可能な意味論への表現変更（R5-002）、verdict の確定点と CLI 終了結果の分離（R5-003、案 A、`onFinalized` → `onVerdictFixed`）、出力末尾の UTF-8 境界揃え（R5-004）
- M0 完了の記録: `docs/reports/M0_COMPLETION.md`、ROADMAP、README。テスト 141 件、自己 verify 6 チェック

## v0.1.4 — commit 37a5b50 / tag object 4b7c943

- 独立レビュー R4（3 件）の追加修正: 確定点の yield を 1 周（poll フェーズを含む）に修正（`yieldFullIteration`）
- 検証中に発見した欠陥の修正: 出力バッファが上限より大きい単一チャンクを丸ごと捨てて空になる問題（バイト単位の切り詰めへ）
- テスト 139 件、10 回連続 PASS

## v0.1.3 — commit c238f0b / tag object 26806d0 — **superseded**

- 独立レビュー R4（3 件）を反映: 確定点（B 案）、中断チェックの事実保持（timedOut / outputTruncated）、未起動チェックの表示（SKIPPED のみ）
- **superseded — 確定点の yield が不十分（`setImmediate` 1 回。確定点直前のシグナルを 10 回中 4 回取りこぼす）。v0.1.4 以降を使用すること。** タグは履歴として残す

## v0.1.2 — commit 24ed514 / tag object 677d834

- 独立レビュー R3（3 件）を反映: `[REDACTED:` 接頭辞によるマスク回避の防止、SIGINT / SIGTERM でのパイプライン中断（AbortSignal、130 / 143、verdict ERROR）、配布 smoke test の bin 実体検証
- テスト 133 件

## v0.1.1 — commit 29e0f42 / tag object 99dad83

- 独立レビュー R1（13 件）と R2（5 件）を反映: マスク規則の拡張（接頭辞付きキー、引用符付き値、Authorization ヘッダ）、プロセスグループ kill のエスカレーション、symlink / dangling symlink の包含判定、exit code と文言の 1 対 1（PASSED / FAILED / ERROR）、git dirty の 3 値化、配布 smoke test（package チェック）
- テスト 118 件

## v0.1.0 — commit c80231e / tag object a1e6dba

- M0 初回: 設計書（ARCHITECTURE / ROADMAP / CONFIG_SPEC / ADR 0001-0008）、fail-closed な `aiqh verify`（JSONC 設定、順次実行、JSON / Markdown / history レポート、秘密情報マスク）、自己 verify（lint / typecheck / unit / build / dependency）
- テスト 72 件
