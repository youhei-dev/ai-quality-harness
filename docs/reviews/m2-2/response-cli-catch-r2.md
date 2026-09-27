# M2-2 CLI の最上位の catch の独立レビュー R2 への対応記録（response-cli-catch-r2）— v0.5.16（CLI の catch の作業の終わり）

- 対象レビュー: `docs/reviews/m2-2/independent-review-cli-catch-r2.md`（受領ファイル名 `independent-review-m2-2-cli-catch-r2-for-claude.md`、ChatGPT、2026-09-28 受領、
  SHA-256 448a497e…。対象 v0.5.15 = commit d27f6cd / tag object 1c1a658、範囲 v0.5.14..v0.5.15、パケット `review-packet-m2-2-cli-catch-r2.md`。前回のレビューとして
  cli-catch-r1 を収録。`--doc` で `tests/helpers.ts`・`docs/ARCHITECTURE.md`・`vitest.config.ts` の v0.5.15 時点の全文を載せた）
- 対応日: 2026-09-28
- 結果（レビュアー）: 前回の M2-2-CLI-CATCH-R1-001 は解消。新しい指摘は High 0 / Medium 0 / Low 0
- 人間の判断
  - 事前に決めていた「High が 0 なら CLI の catch の作業を終える」に従い、CLI の catch の作業はここで終える（m2-2-cli-catch-r3 は行わない）
  - v0.5.16 は、docs だけの記録の版とする（`src/`・`tests/` は変えない）。レビューパケットは作らない
  - レビュアーの「未確認の範囲」5.1 は記録だけにする。5.2〜5.5 は依頼文で範囲外としたもので、新しい作業は起こさない（下の節）
  - 次の作業は、バックログから選ぶ（未定）。この回ではバックログの項目も番号も変えない

## 前回の指摘の判定（レビュアーの判定）

| ID | 判定 | 補足（レビュアー） |
|---|---|---|
| M2-2-CLI-CATCH-R1-001 | 解消 | failure・テストのタイムアウトのときの子の後始末の欠落、ワーカーの寿命への依存、一時ディレクトリを子より先に消しうること、実行の持ち主があいまいな共有の 4 つが、どれもコードで直接直されている |

レビュアーが挙げた根拠（要約）:

- **handle の保持**: `execFile()` の戻り値（ChildProcess の handle）を `child` に持つ。`run(kind)` を呼ぶたびに、新しい一時ディレクトリ・preload・記録・ChildProcess・
  stopper を作る
- **最初の await の前の `stopper`**: 起動の直後、await を挟まずに同期で `stopper` を積む。開始済みの子が、`stopper` の無いまま非同期の失敗やテストのタイムアウトへ
  進む経路は見つからなかった
- **LIFO の順序**: 積む順は `tmp.cleanup` → CLI の `stopper`。`runCleanups()` は後から積んだものから `pop()` するので、`afterEach` では CLI の停止（未確定なら handle に
  SIGKILL）と確定の待ち（最大 5 秒）が先で、一時ディレクトリの削除が後になる
- **同期に投げる経路**
  - `writeFileSync()`（preload・記録）が投げるとき: `tmp.cleanup` はそれより前に積まれている。子はまだ起きていないので、子の後始末が無いことは問題にならない
  - `execFile()` が同期に投げるとき: `new Promise()` の executor の中なので `done` の rejection になり、その後に `stopper` も積まれる。テストがその rejection を
    観測して失敗した後も、`afterEach` が実行される
- **5 秒と `hookTimeout` 30 秒の関係**: `stopper` の上限は `SETTLE_MARGIN_MS`（5 秒）。handle に直接 SIGKILL を送るので、製品の runner のような追加の猶予は待たない。
  `vitest.config.ts` の `hookTimeout` は 30 秒で、一時ディレクトリの削除を加えても十分に収まる。`execFile` の `timeout: 20_000`・`killSignal: "SIGKILL"` は二重の安全弁で、
  主な後始末は `afterEach` の `stopper`
- **共有の `cleanups` 配列**: モジュールの `cleanups` は共有だが、concurrent でない `it` と `afterEach` の組み合わせで、毎回のテストの後にすべて `pop()` される。
  このファイルに `.concurrent` などは無く、複数のテストのプロセスの持ち主が混ざる使い方ではない

## 新しい指摘

無し（High 0 / Medium 0 / Low 0）。

## 「特に見てほしい点」1〜6（レビュアーの結果）

| # | 点 | 結果（レビュアー） |
|---|---|---|
| 1 | M2-2-CLI-CATCH-R1-001 の解消 | 問題なし（handle を持ち、起動の直後・最初の await の前に `stopper` を積み、`afterEach` で `runCleanups` を await し、CLI の停止と確定の待ちの後に一時ディレクトリを消す。同期に投げる 2 つの経路も確かめた） |
| 2 | 持ち主 | 問題なし（`runs` の map は消え、各 `it` が独立した CLI・一時ディレクトリ・記録・後始末を持つ。共有の `cleanups` 配列は、concurrent でないので混ざらない） |
| 3 | 25 件の不変 | 問題なし（`PRELOAD` と `shown()` 以降に差分なし。表の行ごとに HOSTILE 11・RECORDED 8・`console-error-throws` 1・ORDINARY 5 の 25 件） |
| 4 | 後始末の順序と上限 | 問題なし（LIFO で `stopper` → 一時ディレクトリ。上限 5 秒は `hookTimeout` 30 秒に収まる） |
| 5 | 確かめ方 | 方法は妥当（テストの本体が正常に終わらない状態で、`afterEach` の子の後始末と、一時ディレクトリの削除の順を直接観測する条件）。「終わらない CLI」を本体の常設のテストに足さない判断も不合理でない。ただし、実測値そのものは独立に再実行していない → 下の「未確認の範囲」5.1 |
| 6 | docs とコードの一致 | 問題なし（response-cli-catch-r1 の修正の中身、ROADMAP の v0.5.15 の記録、CHANGELOG。ARCHITECTURE はこの範囲で変えておらず、v0.5.8 の方針に今回の修正が従うようになった。バックログ 19 の既知の例外は、依頼文で範囲外） |

## レビュアーの「未確認の範囲」の扱い（新しい作業は起こさない）

レビュアーは、パケットに含まれないことと、依頼文で範囲外としたことを断定しなかった。人間の判断で、次のとおり記録する。

1. **5.1 修正の前後の実測値そのもの**（修正前は CLI が vitest の終了の後に約 37〜38 秒残った、修正後は `afterEach` の中で消えた、一時ディレクトリは子の後に消えた、
   監視の SIGKILL は 0）
   - 記録だけにする。実測の条件と方法は、レビュアーが妥当と判定した
   - 数値は `docs/reviews/m2-2/response-cli-catch-r1.md` の「修正の前後の実測」と、SP2 の報告（git 管理外）に残っている
2. **5.2 `src/` 全体の棚卸し**（throw・catch・`AbortSignal.reason` の棚卸し、`src/output.ts` の全文）
   - 依頼文で範囲外とした。前回の「未確認の範囲」4.1・4.2 で、扱いは response-cli-catch-r1 に記録してある
3. **5.3 製品の `src/cli.ts` の最上位の catch**
   - この範囲で変えておらず、依頼文で範囲外とした（cli-catch-r1 で新しい不具合は無いと判定された）
4. **5.4 ROADMAP のバックログ 19 (a)(b)(c) と、ほかの既知のバックログ**
   - 依頼文で範囲外とした
5. **5.5 Windows、所要時間、過去の記録の言い回し**
   - 依頼文で範囲外とした

## 対応

- M2-2-CLI-CATCH-R1-001: 解消（レビュアーの判定をそのまま記録する）
- 新しい指摘が無いので、バックログは項目も番号も変えない
- `src/`・`tests/` は変えていない

## CLI の最上位の catch の作業の区切り

v0.5.12 の SP1 で見つけ、ROADMAP のバックログ 1 に入れた「CLI の最上位の catch: 投げられた値を調べると例外になる場合の扱い」の作業を、cli-catch-r2 で終える。

| 版 | 内容 | 独立レビュー | 指摘（High / Medium / Low） |
|---|---|---|---|
| v0.5.14 | バックログ 1 を修正（最上位の catch は、最初に exit 2 を決め、投げられた値を調べる操作を try の中でだけ行う。新しい回帰テスト 25 件） | m2-2-cli-catch-r1（v0.5.13..v0.5.14） | 0 / 1 / 0（製品コードに新しい不具合なし。Medium 1 件は回帰テストの子プロセスの後始末） |
| v0.5.15 | M2-2-CLI-CATCH-R1-001: 回帰テストの各 `it` が自分の実行を持ち、`afterEach` で handle に SIGKILL を送ってから一時ディレクトリを消す（`tests/` だけ） | m2-2-cli-catch-r2（v0.5.14..v0.5.15） | 0 / 0 / 0（R1-001 は解消） |
| v0.5.16 | docs だけ（r2 の記録、ROADMAP、CHANGELOG の v0.5.15 の SHA） | —（r3 は行わない） | — |

- テスト件数: 675（v0.5.13、102 ファイル）→ 700（v0.5.14、103 ファイル）→ 700（v0.5.15）→ 700（v0.5.16、docs だけ）
- 残り（M2-2-R4-002、バックログ 19 のテストの後始末の低の残りなど）は、ROADMAP のバックログの順に扱う

## 学んだこと（v0.5.16）

- **前回「未確認の範囲」になったものは、次のパケットに `--doc` で全文を載せると確かめてもらえる**。r1 では、パケットが変更したファイルの全文しか含まないため、
  変えていないファイルの中身が「未確認の範囲」になった。r2 では `tests/helpers.ts`・`docs/ARCHITECTURE.md`・`vitest.config.ts` を載せ、`stopper`・`runCleanups` の
  順序と、上限 5 秒と `hookTimeout` 30 秒の関係まで確認された
