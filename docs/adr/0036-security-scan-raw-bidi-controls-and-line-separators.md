# ADR-0036: security の check は、生の双方向の制御文字と行区切りを、出現ごとに finding にする（既定で FAIL、分類を明示した allow でだけ外せる）

- 状態: 採用（v0.13.0。ROADMAP の項目 48。設計と独立レビューの記録は `docs/reviews/item48-design/`〈設計 R2 の記録 `design-r2.md`。レビューは R1: High 0 / Medium 3 / Low 2、R2: High 0 / Medium 0 / Low 1 で閉じた。R2 の Low〈I48-D-R2-001〉は、決定 10 の版を上げるときの案内に入れた〉）
- 日付: 2026-10-19（v0.13.0）。追記: 2026-10-20（v0.13.1。未マージの index で同じパスを 1 回だけ扱う。下の「追記（v0.13.1）」）、2026-10-25（v0.15.0。既知の限界の 1 項に、層 (c) は ADR-0037 の注記だけ）

## 文脈

- ROADMAP の項目 48（Medium）: verify の security の check（`aiqh security-scan`、`src/security/scan.ts`）は秘密の形の走査で、生の文字を確かめていない（`src/security/raw-chars.ts` を使っていない）
- 本体で 2 度起きた
  - v0.3.2 から、テストのソースの文字列の中に生の U+2028・U+2029 があった
  - v0.11.0 で、テストのソースの文字列の中に生の U+202E が入った
  - どちらも、エスケープを書くつもりの入力が生の文字になったもの。自己 verify の 8 つのチェックは通った。見つけたのは `aiqh review-packet` の生の文字の確かめ（ADR-0014）。v0.11.1 で直し、本体だけの再発を防ぐテスト（`tests/no-raw-bidi-in-tracked-files.test.ts`）を足した
- 適用先のリポジトリは、パケットを作らなければ、どこでも止まらない
- これらの文字は「Trojan Source」（CVE-2021-42574）の手口で使われ、画面に見える並びと、コンパイラ・解釈系が読む中身をずらせる
  - 双方向の制御文字は、コメント・文字列の中で表示の順を変える
  - U+2028・U+2029 は、言語によって行の終わりになったりならなかったりする（JavaScript では行の終わりで、`//` のコメントがそこで終わる。行の終わりと認めない言語では、エディタが改行に見せた次の行がコメントの続きになる）
- 実測（2026-10-19。追跡しているファイル）: aiqh 本体・trim-manager・ai-tutor-browser のどれも、この ADR で見つける 11 の符号位置は 0 件。そのほかの見えない文字（この ADR の対象外）は ai-tutor-browser に 10 件
- `FORBIDDEN_RANGES`（75 の符号位置。C0・DEL・C1・U+2028/2029・双方向の制御文字・U+FEFF）は、パケット・docs のテスト・出力の表記が使う。CR・FF・ESC・先頭の BOM はふつうのソースにあるので、そのままソースの走査には使えない（ADR-0020 決定 3: 集合は変えない）

## 決定

1. **見つける文字**: 次の 11 の符号位置。`src/security/raw-chars.ts` に、`FORBIDDEN_RANGES` の部分集合の定数を足す（`FORBIDDEN_RANGES` は変えない）。部分集合であることはテストで固定する
   - 分類 `bidi-control`: U+202A–U+202E（LRE・RLE・PDF・LRO・RLO）、U+2066–U+2069（LRI・RLI・FSI・PDI）
   - 分類 `line-separator`: U+2028、U+2029
   - 方向の印 U+200E・U+200F・U+061C、ゼロ幅の文字、異体字セレクタ、タグ文字などは見ない（ROADMAP の項目 49）
2. **出現ごとに finding**: 1 つでもあれば finding にする。閉じているか（PDF・PDI で戻しているか）は見ない。同じファイルの同じ行の同じ符号位置は 1 件
3. **判定**: 既定で FAIL（`kind: "raw-char"` の finding → `aiqh security-scan` の exit 1 → check の FAIL）。入り切りのスイッチは作らない
4. **走査の範囲**: 今の security の check と同じファイルの集合（追跡しているファイルと、未追跡で ignore されないファイル。未追跡の `.env*`・symlink・submodule・バイナリ〈先頭 8 KiB に NUL〉は読まない）。行は LF で数える
   - 確かめは、ファイルの走査（`scanFile`）の側だけに置く。`scanString` の経路（`FileScanSink`）には入れない（決定 9）
   - 長い行の窓で同じ文字が 2 回見えても、（ファイル・行・符号位置）で 1 件にする
5. **パス名**: リポジトリからの相対のパス（2 つの一覧に出たすべて）に 11 文字があれば、`line` の無い finding にする。作業ディレクトリ（ルート）のパスは見ない
   - 中身を読まないもの（バイナリ・未追跡の `.env*`・symlink・submodule・作業ツリーから消えた追跡パス）の名前も見る。名前の確かめは、2 つの一覧のパスごとに最初に行い、中身を読むかどうかの分かれ道の影響を受けない。中身の走査の範囲は変えない
   - 未追跡で ignore されたパスは一覧に出ないので、名前も見ない
6. **不正な UTF-8・UTF-16**: finding にしない。正しく符号化された 11 文字は、不正なバイトがあるファイルでも見つける。UTF-16・UTF-32 はバイナリとして読まない（既知の限界）
7. **finding の形**: `kind: "raw-char"`、`category`（`bidi-control`・`line-separator`）、`file`、`line`・`endLine`（パス名では無い）、`codePoint`（`U+202E` の形）。行の中身と桁は持たない。端末の行は `[raw-char] <path>:<line> U+202E bidi-control`。パスは出口で表記にしてからマスクする（ADR-0016）
8. **allow**: 既存の `security.allow` の `category` に `bidi-control`・`line-separator` を足す。生の文字の finding は、**その分類を明示した規則だけ**が抑える。分類の無い規則は、今と同じく秘密の形の finding だけに効く。この規則は、allow の照合の 1 つの関数（`findAllowRule`。scan と review-packet が共有）の中で保証する。候補の規則を順に見るとき、生の文字の finding には分類を明示した規則だけを候補にする（最初に当たった規則を採ってから分類を確かめて捨てるのではない。先頭に分類の無い規則があっても、後ろにある正しい規則が抑え、使われた回数もその規則に付く）。`line` 付きの規則はその行だけ（パス名の finding には効かない）。`expires` は任意のまま。`reason` の書式は決めない（ADR-0029 は key-value の誤検出の記録で、意図した文字は対象外）。抑えた finding と規則の使われ方は、今と同じく出力に残す
9. **review-packet は変えない**: パケットは 75 の符号位置を別に確かめ、allow では抑えない（ADR-0014）。パケットは `scanString` の finding を（oversized-candidate 以外は）`secret` として扱い allow を当てるので、生の文字の確かめを `scanString` の経路に入れると、同じ文字が 2 回出て、片方が allow で抑えられてしまう。それを避けるため、確かめは決定 4 のとおりファイルの走査の側だけに置く
10. **出力とパーサ**: 件数の行の内訳の最後に `raw characters: N` を足す。出力のパーサ（ADR-0028）の数のキー `rawChars`、項目の種類 `raw-char`、`describe.ts` の表示を足す。パーサは新しい形（6 つの内訳）だけを受け付ける。古い aiqh と新しい aiqh が verify とその子の `aiqh security-scan` で食い違うと、`parsed` は `unexpected-summary` になる
    - **パースの失敗は判定を変えない**（ADR-0028 の P1。判定と終了コードは変わらない）
    - **検出の範囲は、実際に起動する `aiqh security-scan`（子）の版で決まる**。新しい verify と古い security-scan の組み合わせでは、項目 48 の検出は効かない（古い子は生の文字を見ないので、ほかの finding が無ければ PASS のまま）。古い verify と新しい security-scan の組み合わせでは、検出は効き、パースだけが失敗する
    - CI の再利用ワークフローは、同じ commit のソースを親と子の両方に使うので食い違わない（ADR-0031）。検出が効くのは、呼び出し側の `uses:` の SHA が v0.13.0 以降のとき
    - 版を上げるときの案内（CHANGELOG・README・CONFIG_SPEC）: verify が実際に呼ぶ `aiqh`（手元は PATH の `aiqh` と `npm run` のスクリプトが呼ぶもの、CI は再利用ワークフローの SHA）の版・commit をそろえる。`--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる（I48-D-R2-001）。`parsed` の `unexpected-summary` は、親と子の版の食い違いの印として扱う
    - 情報の行（v0.13.0 の文）: `raw characters checked: bidi-control (U+202A-U+202E, U+2066-U+2069), line-separator (U+2028, U+2029)`。`scanned categories:` の行の後ろに出る。`--json` では `scannedRawChars`（分類ごとの符号位置の一覧）。パーサはこの行を読み飛ばす
11. **版**: v0.13.0（判定が厳しくなるので minor を上げる）。CHANGELOG に「判定が厳しくなる変更」の節を置き、見つけ方・直し方・allow の書き方・見ないものを書く

## UTS #55 との違い

- UTS #55（Unicode Source Code Handling）は、方向制御文字を**禁止しない**立場をとる
  - §1.2.3: "The solution is not to forbid the directional formatting characters"
  - §5.1.6: "Implementations should not prohibit the use of the directional formatting characters"。警告が有用なのは、効果が atom（識別子・1 行の文字列・1 行のコメント）をまたぐとき
  - ソースを字句の構造に沿って表示すれば、並べ替えによる見せかけは消える、という考え
- この ADR は、それより厳しくする（出現ごとに finding）。理由:
  - UTS #55 は、主に言語の実装と、ソースを表示する道具に向けた推奨。aiqh はどちらでもなく、リポジトリの品質ゲート（Trojan Source の論文が防御に挙げる「ビルドパイプラインでの走査」）に当たる。aiqh は、レビュアーや利用者がどの道具でソースを見るかを決められない
  - aiqh は言語ごとの字句解析を持たない。atom をまたぐか・閉じているかの判定は、行単位の近似になり、見逃しの説明ができない
  - 出現ごとの方針には前例がある: Rust の lint `text_direction_codepoint_in_literal`・`text_direction_codepoint_in_comment`（既定で deny、9 つの双方向の制御文字の出現そのもの）、GCC の `-Wbidi-chars=any`
  - 実測で、適用先の 3 つは 0 件。正当な使い方（右から左に書く言語の文書など）は、理由つきの allow で残せる
- U+2028・U+2029 については、UTS #55 §3.2 も「言語が行の終わりと認めない行終端は禁止してよい」としており、この ADR の扱い（どの言語のファイルかによらず finding）はその延長にある

## 代替案

- **層 (a) の 9 つだけ**: aiqh で実際に起きた U+2028・U+2029 を見逃す。UAX #31・UTS #55 は、行終端として扱うか、扱わないなら禁止することを推奨している
- **方向の印 U+200E・U+200F・U+061C も見る**: Trojan Source の論文・Rust・clang-tidy は対象外にしている。UTS #55 は自分の変換で U+200E を入れ、字句要素の間の LRM・RLM を許す。右から左に書く言語の文書で正当に使われる。実測は 0 件なので、項目 49 で、データを見て決める
- **ゼロ幅の文字なども見る**: 絵文字の結合（ZWJ）や一部の文字（ZWNJ）で正当に使われる（UAX #31・UTS #39）。実測で、適用先の 1 つに意図したと推定される使い方が 10 件ある。項目 49
- **`FORBIDDEN_RANGES`（75）をそのまま使う**: CR（CRLF のファイル）・FF・ESC・先頭の BOM が、ふつうのソースで誤検出になる。ADR-0020 決定 3 のとおり集合は変えない
- **いつも FAIL（allow でも外せない）**: 右から左に書く言語の文書や、意図して文字を置くテストのデータを持つ適用先に、逃げ道が無い
- **設定で入り切り（`security.rawChars: false` など）**: fail open のスイッチになる。ADR-0012 が `security.scanKeyValue` を採らなかった理由と同じ
- **閉じていないものだけを finding にする**（GCC の既定 `-Wbidi-chars=unpaired`、clang-tidy の misc-misleading-bidirectional、論文の緩める案）: 字句解析を持つコンパイラの方法。aiqh では行単位の近似になり、見逃しの説明ができない
- **禁止しない（UTS #55）**: 上の「UTS #55 との違い」
- **分類の無い allow の規則も生の文字を抑える**: 今ある分類の無い規則（例: `tests/**` に秘密の形のダミーを許す規則）が、黙って生の文字まで抑えるようになる。静かな fail open
- **新しい欄 `security.allowRawChars[]`**: 既存の規則とは干渉しないが、使われた回数・未使用・期限切れの記録と警告、出力のパーサの項目を、もう 1 組作ることになる
- **別のチェック（新しい check の種類）にする**: 適用先が設定に足さないと効かない（既定で入らない）。security の check に入れれば、今の設定のままで効く
- **`scanString` の経路（`FileScanSink`）に入れる**: 決定 9
- **パーサが古い形（5 つの内訳）も受け付ける**: 受け付けても、新しい verify と古い security-scan の組み合わせで検出が効かないことは変わらない（検出は子の版で決まる）。かえって、その組み合わせが `parsed` として見え、食い違いの印（`unexpected-summary`）が消える。パースの失敗は判定を変えないので、新しい形だけを受け付けても判定は緩まない。単純さと、食い違いが見えることを取る
- **件数の行を変えず、別の行で出す**: 生の文字の finding を総数に入れると古いパーサの「内訳の合計 = 総数」が崩れ、入れないと finding が総数に入らない

## 既知の限界

- UTF-16・UTF-32 のファイルは、NUL を含むのでバイナリとして読まず、中の生の文字は見えない
- 不正な UTF-8 は finding にしない。長すぎる符号化などの不正な形で書かれた文字を、それを受け入れる道具が生の文字として読む場合は見逃す（推定）
- 方向の印、ゼロ幅の文字、途中の U+FEFF、異体字セレクタ、タグ文字、11 の外の制御文字、同形異字（CVE-2021-42694）は見ない（項目 49）。**v0.15.0 で、同形異字のほかは層 (c) として見る（ADR-0037）**。この ADR の 11 の符号位置と分類は変えていない
- 言語ごとの字句解析を持たない。閉じた並びや正当な使い方（右から左に書く言語の文書など）も finding にする。始まりと終わりの対応だけでは安全とは判断しない（対応がとれていても、効果が複数の字句の要素〈UTS #55 の atom〉をまたぎうる。UTS #55 §4.1.1・§5.1.6）。正当な使い方は allow で扱う
- ルートのパス、symlink の先、submodule の中は見ない
- allow の `path`・`reason` のスキーマは、双方向の制御文字を禁じていない（端末の出口で表記になる。ADR-0016。この ADR では変えない）

## 資料

（2026-10-19 に読んだ。UTS #55 と Rust の lint の文書は本文で確かめ、ほかは抜粋で確かめた）

- Trojan Source: Invisible Vulnerabilities（Boucher, Anderson）: https://arxiv.org/abs/2111.00169 ・ https://trojansource.codes/
- CVE-2021-42574（NVD）: https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2021-42574
- UAX #9 Unicode Bidirectional Algorithm: https://www.unicode.org/reports/tr9/
- UAX #31 Unicode Identifiers and Syntax（R3a の行末）: https://www.unicode.org/reports/tr31/
- UTS #55 Unicode Source Code Handling: https://www.unicode.org/reports/tr55/
- Rust の lint（deny-by-default）: https://doc.rust-lang.org/rustc/lints/listing/deny-by-default.html
- GCC `-Wbidi-chars`: https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html
- clang-tidy misc-misleading-bidirectional: https://clang.llvm.org/extra/clang-tidy/checks/misc/misleading-bidirectional.html
- ECMAScript の LineTerminator: https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html

## 影響

- `src/security/raw-chars.ts`（部分集合の定数と分類: `RAW_CHAR_CATEGORIES`・`SCANNED_RAW_RANGES`・`scannedRawCategory`）、`src/security/scan.ts`（`FindingKind`・`ScanFinding`・`scanFile` の `RawCharSink`・パス名の `checkPathName`・`findAllowRule`・`ScanResult`）、`src/config/schema.ts`（allow の分類の列挙）、`schema/aiqh.config.schema.json`（生成し直し）、`src/commands/security-scan.ts`（情報の行・件数の行・項目の行・`[allowed]` の行）、`src/parse/security-scan.ts`・`src/parse/describe.ts`（パーサと表示）、`src/adapters/builtin.ts`（`aiqh init` の説明文）、`src/cli-program.ts`（`aiqh security-scan` のヘルプの文）、`src/types.ts`（`AllowRule` の説明）
- テスト: 新しいテスト `tests/regression-item48-raw-chars-scan.test.ts`（設計の §8-1 の T1〜T9・T11〜T13。枝番を含む）と、`tests/parse-security.test.ts` の T10・T14。変更の前の commit `8870afb` に写して走らせ、ケースごとの FAIL / PASS が設計の見込みと一致した（FAIL 26・PASS 10）。既存の期待値: `tests/parse-security.test.ts` と `tests/fixtures/parse/security-self.stdout.txt`（設計の §8-2）だけ
- docs: ADR-0012・0014・0020・0028 の注記、ADR-0034 の行の参照、ADR の一覧、CONFIG_SPEC、ARCHITECTURE、ROADMAP（項目 48 を閉じ、項目 49 を足す）、README、CHANGELOG
- 判定: これまで PASS だったリポジトリが FAIL になりうる。適用先の呼び出しの SHA を上げる前に、新しい `aiqh security-scan` の結果を確かめる
- 版の組み合わせ: 検出が効くのは、実際に起動する `aiqh security-scan` が v0.13.0 以降のときだけ。verify の版だけを上げても効かない（決定 10）
- `aiqh history`: 数のキー `rawChars` の系列が増え、古い run は `unknownRuns`。`findings` の系列は v0.13.0 から生の文字の件数を含む
- 変えないもの: review-packet、`FORBIDDEN_RANGES`、本体の再発を防ぐテストと docs のテスト、依存関係、`package-lock.json`、`tests/structure/`、組み込みのモジュールの一覧

## 追記（v0.13.1）

- 決定 2（同じファイルの同じ行の同じ符号位置は 1 件）と、決定 5 のパス名の finding（設計 R2 の記録 `design-r2.md` の §3-4 では、1 つのパスで符号位置ごとに 1 件）を、index に未マージのパスがあるときにも守るようにした（実装の独立レビュー item48-impl R1 の I48-I-R1-001。Low。`docs/reviews/item48-impl/`）。未マージのパスは `git ls-files -z` に stage（1・2・3）ごとに出るが、作業ツリーのファイルは 1 つなので、`src/security/scan.ts` の `listFiles` が結果を順序を保って一意化し、名前の確かめと中身の走査を 1 回にした（`--deduplicate` は使わない）
  - 判定は変わらない（検出漏れは無く、同じ finding を重ねて数えていた）。秘密の形の finding・`filesTracked`・`filesScanned` の重複も同じ直しで消えた（今までの動きの直し）
  - テスト: `tests/regression-item48-impl-r1-001-unmerged-index.test.ts`（4 件）。v0.13.0 の release の commit `8bd9456` で 4 件とも FAIL
