# item48-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.13.1

- 対象レビュー: `docs/reviews/item48-impl/review-r1.md`（受領ファイル名 `independent-review-item48-impl-r1-for-claude.md`、2026-10-20 受領、38,961 バイト、SHA-256 `cbb1f2674a097d4b6f8702c9108e4033d5a1587e4be6618cad8c56decce20956`、
  LF 202 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし / レビュアーの側の作業場所を指すリンク〈`sandbox:`〉の行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.13.0（ROADMAP の項目 48。ADR-0036）。範囲 `8870afbf1bf65282f12bba39086d661c88d70851..8bd945666f5774ca9a4b4030bcd77f60794b764a`（3 commit、変わったファイル 33 個）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-item48-impl-r1.zip`（1,576,823 バイト、SHA-256 `2f66c59cc3cce96e555538577df8031ccd83f9dfbfe8f885222c0712b39298d2`。中は `review-packet-item48-impl.md` の 1 ファイル、1,576,669 バイト、SHA-256 `3f4624d68e65e5971541a7443a1a3e76fc6332f5ad07b83beee928fc8c30e16c`）
  - 依頼文 `review-request-item48-impl-r1.md`（23,487 バイト、SHA-256 `f8bc092989f7e793cf9167699c37882922e14ebee0da3bbcbbb139a9e728cc84`。問いは 5 つ。パケットの中にバイト単位で同一で入っている）
- 対応日: 2026-10-20
- 結果（レビュアー）: **High 0 / Medium 0 / Low 2**。レビュアーはパケットと公開リポジトリの固定の head を読み、aiqh のコードとテストは実行していない（実行したのは、ファイルの照合と、一時リポジトリでの git の未マージの index の一覧だけ）。依頼文に先に書いた基準（High・Medium が 0 なら終える）に達した
- **人間の決定（2026-10-20）**
  - 2 件とも v0.13.1 で直す
  - 実装レビューの R2 は出さない（回帰テスト・CI・`fixedIn`・`review-check` で記録する）。item48-impl のレビューは R1 で終える
- 取り込み: v0.13.1 の記録の commit で、`aiqh review-import <受領ファイルの写し> --label item48-impl --round 1 --id-prefix I48-I`（写しは受領ファイルと SHA-256 が同じ）。exit 0、`High 0 / Medium 0 / Low 2; open 2`、最後の 2 行は `REVIEW LOOP: incomplete (open 2)` と `REVIEW IMPORT: written`。取り込みの前に、写しを取り込みの検査の本体 `readReview`（ファイルに触れない関数）で確かめた（問題 0 件、label `item48-impl`、回 1、ID `I48-I-R1-001`・`I48-I-R1-002`）

## 判定表

| ID | 重要度 | 判定 | 対応 | 直した commit | 状態 |
|---|---|---|---|---|---|
| I48-I-R1-001 | Low | VALID | 受け入れ（v0.13.1） | `20259643dea3a6d41aab199ac8902d2ccf414d1f` | `resolved`（`fixedIn`・`regressionTest`。`docs/ops/review-loop.md` の段取り 8） |
| I48-I-R1-002 | Low | VALID | 受け入れ（v0.13.1） | `c67069654bc25fd2717496d3112571df4e62dfb3` | `resolved`（同上） |

## 指摘ごとの対応

### I48-I-R1-001 — 未マージの index で、同じパスを何度も走査する（受け入れ）

- **指摘の要点**: index に未マージのパス（同じパスの stage 1・2・3）があると、作業ツリーの同じファイルを 3 回走査し、同じファイル・行・符号位置の生の文字の finding が 3 件になる。パス名の finding も同じ。未抑制の `rawChars`、または抑えた allow の規則の回数が重複の分だけ増え、設計の「1 件」に合わない。検出漏れや FAIL から PASS への変化は無い
- **コードで確かめたこと**（`8bd9456`）[事実]
  - `scanRepository` は `listFiles` の 2 つの結果（`src/security/scan.ts:129-130`）を、そのまま 2 つのループ（`:151`・`:156`）に渡す。`listFiles`（`:173-183`）は `git ls-files -z` の結果を一意化せずに返していた（`:182`）
  - `RawCharSink` の `seen`（`:406`）は `scanFile` ごと、`checkPathName`（`:425`）の `seen` は呼び出しごとに作られる。同じパスが 3 回渡ると finding は 3 件で、`applyAllow` もそれぞれを数える。`filesTracked` は一覧の長さ（`:133`）、`filesScanned` は `scanFile` で読んだ回数（`:459`）なので、どちらも 3 倍になる。秘密の形の finding も `scanFile` ごとの `FileScanSink` で、3 件になる
  - 手元（macOS、git 2.50.1）で、`git update-index --index-info` で stage 1・2・3 を置いた一時リポジトリで、`git ls-files -z` が同じパスを 3 回出し、`--others --exclude-standard` には出ないことを確かめた（テストの前提として毎回確かめる）
- **対応**（v0.13.1、commit `2025964`）: `listFiles` が NUL 区切りの結果を、順序を保って一意化する（`Set`。`src/security/scan.ts:177-187`）。`--deduplicate` は使わない（git の新しいオプションに頼らない）
  - 変わらないもの: 判定、未マージのパスが無いときの一覧と順序、finding の形、`scanString` と review-packet の経路、ほかのファイル
  - 今までの動きの直しも含む: 秘密の形の finding・`filesTracked`・`filesScanned` の重複も消える（テストの (4)）。追跡している `.env` の finding も同じループなので重ならない（コードの読み取り。テストは無い）
- **scan.ts の中の、ほかの `git ls-files` の結果の使い道**（読み取りの結果。変えていない）
  - `trackedPaths`（`:667-676`）: `.gitignore` の出所が追跡されているかを `Set` で引く。重複があっても結果は同じ
  - 未追跡の一覧（`--others --exclude-standard`）: index に無いパスだけなので、stage による重複は出ない
  - scan.ts の外: `src/commands/init.ts` の `isTracked` も `git ls-files -z -- <path>` を使うが、`.includes(rel)` で引くだけなので重複の影響は無い（この版の対象外。変えていない）
- **テスト**: `tests/regression-item48-impl-r1-001-unmerged-index.test.ts`（新規、4 件。対象の文字は `String.fromCodePoint` で数から作る。秘密の形の値は `fake()` で組み立てる）
  - 各ケースは、index に同じパスの stage 1・2・3 だけを置いたリポジトリ（作業ツリーには実体が 1 つ、`.gitignore` もほかのファイルも無い）。走査の前に、git がそのパスを 3 回出し、未追跡に出さないことを確かめる
  - (1) 本文の 1 行目の U+202E が 1 件、(2) 名前の U+2066 が 1 件、(3) 分類 `bidi-control` を明示した allow で抑えたとき、`suppressed` が 1 件で、その規則の回数が 1、(4) 秘密の形の finding が 1 件で、`filesTracked`・`filesScanned` が 1
  - テストを先に書き、v0.13.0 の release の commit `8bd9456` の SHA 固定の worktree に写して走らせた。4 件とも FAIL（見込みどおり）。どれも走査の結果の比べ（3 件が出る）で落ち、前提の確かめは通った

    | ケース | `8bd9456` | 直した後 |
    |---|---|---|
    | (1) 本文の U+202E | FAIL（3 件） | PASS |
    | (2) 名前の U+2066 | FAIL（3 件） | PASS |
    | (3) allow の回数 | FAIL（`suppressed` 3 件） | PASS |
    | (4) 秘密の形と件数 | FAIL（3 件） | PASS |

  - 全テストは 174 ファイル・2,344 件から 175 ファイル・2,348 件。既存のテストの期待値と `tests/structure/` は変えていない
- 記録: ADR-0036 の追記（決定 2 と、決定 5 のパス名の finding を、未マージのパスでも守る）、ARCHITECTURE の §6.1b の 1 行

### I48-I-R1-002 — 文書の指摘の `fixedIn`（受け入れ）

- **指摘の要点**: 文書の指摘 I48-D-R1-001・I48-D-R1-005・I48-D-R2-001 の `fixedIn` が、文書を直していない実装の commit `7633da4` を指している。`fixedIn` の意味（その指摘を直した commit。`docs/ops/review-loop.md` の段取り 8）と合わない。`review-check` は SHA の形と commit の存在だけを確かめるので（ADR-0027）、`REVIEW LOOP: complete` はこの対応の妥当さを示さない
- **対応**（v0.13.1、commit `c670696`。レビュアーの修正案のとおり）

  | 指摘 | 前の `fixedIn` | 新しい `fixedIn` |
  |---|---|---|
  | I48-D-R1-001 | `7633da4…` | `8bd945666f5774ca9a4b4030bcd77f60794b764a`（release の commit） |
  | I48-D-R1-005 | `7633da4…` | `5fe75f4c5f47933bea5f66232e2e454c418fb3d5`（docs の commit） |
  | I48-D-R2-001 | `7633da4…` | `8bd945666f5774ca9a4b4030bcd77f60794b764a`（release の commit） |

  - 各件の `note` は v0.13.0 の文を残し、「v0.13.1 で fixedIn を訂正（I48-I-R1-002）」の注記を足した: 主な文書の直しは docs の commit `5fe75f4`、CHANGELOG への反映の完了は release の commit（001・R2-001）。元の実装の commit `7633da4f25c42748b6ee66fcb13cbb6c2a7289e3` は、動きと回帰テストの根拠として残す
  - `docs/reviews/item48-design/response-r1.md` と `response-r2.md` の対応する説明の後ろに、同じ注記を 1 つずつ足した（前の行は変えていない）
  - テストの追加に対応する I48-D-R1-002〜004 は `7633da4` のまま（レビュアーも不適切とは評価していない）
  - 新しい実行のテストは無い（文書の追跡情報の訂正。レビュアーの修正案のとおり）
- **確かめ**: 訂正の後の `aiqh review-check --label item48-design` は exit 0、R1 は resolved 5、R2 は resolved 1、open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`

## 問いへの答えの要約（レビュアー。実装者の評価ではない）

1. **設計 R2 と実装の一致**: 11 の符号位置、本文と行番号、allow の候補と順序・回数、名前を確かめる位置、review-packet との分離、設定と説明文に指摘なし。未マージの index の重複だけが Low（I48-I-R1-001）
2. **テストの有効性と旧版での FAIL / PASS**: 実装を止める指摘なし。旧版の FAIL 26・PASS 10 は、実測のログが同梱されていないので独立には再現していない（最初に落ちる assertion を基準に評価した）。限定として、T7 群が名前に置く文字は 3 種類、T7c はリンク先が plain、T11 は aggregate の試験、未マージの重複のテストが無い、を挙げた（下の「レビュアーの限定への対応」）
3. **I48-D-R2-001 の訂正**: 解消。6 つの文書（ADR-0036・CHANGELOG・README・CONFIG_SPEC・設計 R2 の記録・R1 への応答）で、`--version` は dist の新しさを示さないこと、`npm run build`、同じ起動の経路で 2 つの行を確かめることがそろう
4. **出力・パーサ・履歴**: 指摘なし
5. **文書と取り込み記録**: 文書の本文に追加の指摘なし。原文の収録はバイト単位で一致。残るのは 3 件の `fixedIn`（I48-I-R1-002）

## レビュアーの限定への対応（指摘ではない）

- **T7 群の 11 種類**: v0.13.0 の依頼文（「手元の全テストで、名前に 11 文字を置いたテスト〈T7 系〉も通った」）と、I48-D-R1-003 の `note` の同じ趣旨の文は誤りだった。T7 群が名前に置くのは U+202E・U+2066・U+2029 の 3 種類で、11 種類すべてを名前に置くテストは無い。v0.13.0 の作業の記録にも、11 種類を名前に置いた別の確かめは見つからなかった
  - 2026-10-20 に、使い捨てのリポジトリ（macOS、git 2.50.1。commit したテストではない）で、11 種類をそれぞれファイル名に置いて確かめた: ディスクの上の名前と `git ls-files -z` の名前は 11 とも書いた名前と同じ（正規化で変わらない）、`scanRepository` の名前の finding は 11 種類で 1 件ずつ
  - I48-D-R1-003 の `note` に、この訂正の注記を足した（前の文は残した）。ubuntu の git での 11 種類の名前は確かめていない
- **T7c（symlink）**: リンク先の本文は plain のまま。`lstat` と通常のファイルの判定は v0.13.0 で変えていない（レビュアーもコードで照合し、指摘にしていない）。この版でもテストは足していない
- **T11（履歴）**: レビュアーの評価のとおり、既存の `tests/history-read.test.ts` と固定のコードの照合で足りるとし、この版でもテストは足していない
- **未マージの重複**: I48-I-R1-001 のテストで足した

## 未確認範囲（レビュアーの原文の要約）

全 2,344 件のテストの実行、10 回続けての成功、typecheck・lint・verify・verify:dist、旧版での 36 ケースの実測、CI の run の成功、macOS で 11 種類をファイル名にした実測、新旧の dist を組み合わせた実際のプロセス、追加の走査の時間、適用先の 2 つのリポジトリの走査の結果は、実装者の記録として受け取り、レビュアーは再実行していない。既存のコード全体の再レビューではない。依頼文で対象外とした文字・文字コードの限界・ルート・symlink の先・submodule の中・ignore された未追跡のパス・別の実行ファイルを明示する設定・Windows・R-010 は、指摘として数えていない

## 取り込みと review-check

- `aiqh review-import`（v0.13.1 の作業 branch の版。`tool.version` は 0.13.0）: `findings-r1.json`（指摘 2 件、すべて `open`）。exit 0、`REVIEW IMPORT: written`
- 実装者の欄を書いた後の `aiqh review-check --label item48-impl`: R1 は resolved 2、open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）。`--label item48-design` も同じく complete・passed・警告 0

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/item48-impl/review-r1.md`（原文の収録）・`findings-r1.json`（取り込みと、実装者の欄）・`response-r1.md`（この記録）
- `docs/reviews/item48-design/findings-r1.json`（I48-D-R1-003 の `note` に、上の T7 群の訂正の注記）
- ADR-0036 の追記と日付、ADR の一覧、ARCHITECTURE の §6.1b と最終更新、ROADMAP（v0.13.1 の項、「次:」の段落、終わったレビュー）
