> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-item48-impl-r1-for-claude.md`（2026-10-20 受領、38,961 バイト、LF 202・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `cbb1f2674a097d4b6f8702c9108e4033d5a1587e4be6618cad8c56decce20956`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.13.1 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# item48 実装レビュー R1 — aiqh v0.13.0

**High・Medium に相当する問題は見つかりませんでした。依頼文の終了条件に従い、この実装レビューは閉じてよいと判断します。** 残る Low は、未マージ時の raw finding の重複と、文書修正の追跡情報です。

## 対象と照合方法

- 依頼: 添付 review-request-item48-impl-r1.md。実装レビューの label は item48-impl、round は 1。
- 範囲: `8870afbf1bf65282f12bba39086d661c88d70851..8bd945666f5774ca9a4b4030bcd77f60794b764a`。merge コミットは含めません。
- 公開リポジトリ: [youhei-dev/ai-quality-harness の固定 head](https://github.com/youhei-dev/ai-quality-harness/tree/8bd945666f5774ca9a4b4030bcd77f60794b764a)。注釈付きタグ v0.13.0 の参照先コミットが、この head であることを Git の参照から確認しました。
- 添付 ZIP の review-packet-item48-impl.md は 1,576,669 バイト、SHA-256 は `3f4624d68e65e5971541a7443a1a3e76fc6332f5ad07b83beee928fc8c30e16c`。全文の 33 ファイルは、パケットの Integrity と公開 head の内容の両方に、バイト数・SHA-256・バイト列で一致しました。公開 base と head のファイル比較でも、変更集合は同じ 33 ファイルでした。
- 変更実装とテスト、今回の文書差分、設計・応答・findings を読み、必要な未変更コードも公開 head から補いました。以下のコードの行番号は、別のコミットを明記した箇所以外、すべて固定 head のものです。

対象の aiqh コードやテストは実行していません。実施した実行確認は、ファイルの照合と、独立した一時リポジトリでの Git の列挙挙動です。実装者のテスト成功の記録と、このレビューで独立に確認した事項を分けて評価します。

## 指摘

### I48-I-R1-001

- **ID**: I48-I-R1-001

- **重要度**: Low

- **種別**: バグ

- **対象**: [src/security/scan.ts:151–154](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L151-L154)。関連箇所: 同ファイル 173–183、404–433、449–461、686–703 行。

- **内容**: 未マージの index に同じパスの stage 1・2・3 があると、同じ作業ツリーのファイルを 3 回走査し、同じファイル・行・符号位置の raw finding が 3 件になります。パス名の finding も同様です。この状態では未抑制の rawChars、または抑制に使った allow 規則の使用回数が重複分だけ増え、設計の「1 件」の契約を満たしません。

- **根拠**: [docs/reviews/item48-design/design-r2.md:113–123](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/design-r2.md#L113-L123) は、本文をファイル・行・符号位置ごと、名前をパス・符号位置ごとに 1 件としています。[src/security/scan.ts:173–183](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L173-L183) は git ls-files -z の結果を一意化せずに返します。[Git の公式仕様](https://git-scm.com/docs/git-ls-files#Documentation/git-ls-files.txt---deduplicate) は、未マージの複数 stage による名前の重複を説明しています。独立した一時リポジトリでも Git 2.51.1 で、実ファイル a.txt は 1 個、通常の列挙は同名 3 件、--deduplicate 付きは 1 件となることを確認しました。head の RawCharSink の seen は scanFile ごとに、checkPathName の seen は呼び出しごとに作られます。そのため、本文 1 行目に U+202E が 1 個あれば同じ finding が 3 件になり、applyAllow もそれぞれを数えます。aiqh を実行した再現ではなく、Git の実測と固定コードの照合による確認です。列挙処理自体は既存ですが、今回加わった raw の件数契約に影響します。検出漏れや FAIL から PASS への変化は生じないため Low とします。

- **修正案**: listFiles の NUL 区切りの結果を、順序を保持する Set などで一意化し、各パスを 1 回処理してください。Git の新しいオプションへの依存を増やさずに直せます。同じパスに未マージの複数 stage を置く回帰テストで、本文の同じ行・符号位置と名前の符号位置がそれぞれ 1 件であり、対応する allow の使用回数も重複しないことを確認してください。

- **確度**: 確認済み

### I48-I-R1-002

- **ID**: I48-I-R1-002

- **重要度**: Low

- **種別**: 文書

- **対象**: [docs/reviews/item48-design/findings-r1.json:35–39](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/findings-r1.json#L35-L39)、同ファイル 107–111 行、[docs/reviews/item48-design/findings-r2.json:56–60](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/findings-r2.json#L56-L60)。対応する説明は response-r1.md:27–28 と response-r2.md:19。

- **内容**: 文書の指摘 I48-D-R1-001・I48-D-R1-005・I48-D-R2-001 の fixedIn が、文書を修正していない実装コミットを指しています。note は「文章が説明する動きを入れたコミット」と説明していますが、fixedIn の既存の意味である「その指摘を直したコミット」とは異なります。本文の訂正は head にそろっており、残っているのは修正の追跡情報の不一致です。

- **根拠**: [docs/ops/review-loop.md:23](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/ops/review-loop.md#L23) は fixedIn を、直したコミットの 40 桁の SHA としています。3 件が指す [7633da4f25c42748b6ee66fcb13cbb6c2a7289e3](https://github.com/youhei-dev/ai-quality-harness/commit/7633da4f25c42748b6ee66fcb13cbb6c2a7289e3) は、公開コミット情報でも親がレビューの base で、差分の 13 ファイルに文書がありません。固定 docs コミット [5fe75f4c5f47933bea5f66232e2e454c418fb3d5](https://github.com/youhei-dev/ai-quality-harness/commit/5fe75f4c5f47933bea5f66232e2e454c418fb3d5) と head も照合し、設計・ADR 等の訂正は docs コミット、実際の CHANGELOG への反映は release コミットであることを確認しました。[src/review/check.ts:98–112](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/review/check.ts#L98-L112) が検査するのは SHA の形、regressionTest の非空、コミットの存在です。[docs/adr/0027-review-check-state-and-loop.md:42–44](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/adr/0027-review-check-state-and-loop.md#L42-L44) も修正内容の意味までは検査しないと明記しています。従って、REVIEW LOOP: complete と警告 0 は、この対応の妥当性を証明しません。依頼文と note に経緯・後続の記録予定が明示され、本文自体は訂正済みなので Low とします。

- **修正案**: 次の記録 PR で、fixedIn と note・応答記録を実際の文書修正に合わせてください。今回宣言した実文書一式への反映完了を基準にすると、I48-D-R1-001 と I48-D-R2-001 は 8bd945666f5774ca9a4b4030bcd77f60794b764a、I48-D-R1-005 は 5fe75f4c5f47933bea5f66232e2e454c418fb3d5 が対応します。前の 2 件の note に、主な文書修正は docs コミット、CHANGELOG への反映完了は release コミットと補足すれば追跡できます。元の実装コミットは、関連する動作・回帰テストの根拠として残せます。文書の追跡情報の訂正のために新しい実行テストを設ける必要はありません。

- **確度**: 確認済み

## 全体の結論

件数: High 0 / Medium 0 / Low 2

**レビューを止める High・Medium はありません。** 依頼文の定める実装レビューの終了条件を満たします。Low は記録して次の版以降で扱う方針に整合します。適用先の呼び出し SHA を上げるという H11 の次工程へ進める、というレビュー判断です。

**I48-D-R2-001 の本文の訂正は「解消」です。** 指定された 6 文書の案内はそろい、版表示・子プロセスの起動経路の固定コードと一致しています。上の文書の Low は fixedIn の追跡情報についてのものであり、設計 R2 の訂正そのものが未解消だという評価ではありません。

### 問い 1 — 設計 R2 と実装の一致

通常の列挙に対する検出・allow・出力、および内容を読む範囲は設計に沿っています。重複する index エントリーによる件数の Low を除き、この問いの各観点は **指摘なし** です。

| 観点 | 評価と根拠 |
|---|---|
| 対象の 11 符号位置 | bidi-control の 9 個と line-separator の 2 個が定義され、75 個の FORBIDDEN_RANGES と既存の findRawChars・escapeRawChars は不変です。[src/security/raw-chars.ts:20–52](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/raw-chars.ts#L20-L52)。 |
| 本文と行番号 | scanFile は秘密用と raw 用の受け手へ同じ行を渡します。11 個はすべて 1 つの UTF-16 コード単位で表せるため、charCodeAt による分類で取りこぼしは生じません。通常の長い行の窓では、行番号と符号位置の seen が重複を除きます。LF による行番号と既存の読み取り・復号を維持しています。[src/security/scan.ts:404–461](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L404-L461)。 |
| allow の候補と順序 | raw-char のときだけ、分類の存在を findIndex の条件に入れています。先頭の分類なし規則を飛ばし、後ろの適合規則を探せます。分類・行・パス・期限の照合も保たれています。[src/security/scan.ts:714–723](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L714-L723)。 |
| allow の使用回数と既存の秘密 | 抑制に使った規則の index にだけ count と suppressed.rule を付けます。期限切れと未使用を分け、raw 以外の秘密に対する分類なし規則の従来の扱いも維持しています。[src/security/scan.ts:686–723](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L686-L723)。 |
| 名前を検査する位置 | tracked と untracked の両ループで、パスごとの最初に名前を検査します。tracked .env の分類、untracked .env の continue、lstat、通常ファイル判定、ENOENT、バイナリ判定より前です。名前の finding に line・endLine は生成しません。[src/security/scan.ts:150–169](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L150-L169)、[src/security/scan.ts:425–461](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L425-L461)。 |
| 内容の走査と review-packet の分離 | scanString と FileScanSink の本体は不変です。review-packet は findRawChars の結果を独立して追加し、allow は scanString の秘密 finding にだけ当てます。raw の allow で packet の 75 文字の検査を抑える経路はありません。[src/review/packet.ts:462–480](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/review/packet.ts#L462-L480)。 |
| 設定・説明文 | 設定の列挙と生成 JSON Schema に同じ 2 分類が追加されています。組み込み check の説明と CLI のヘルプ追加は今回の機能に合い、実行条件を変えていません。[src/config/schema.ts:48–55](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/config/schema.ts#L48-L55)、[schema/aiqh.config.schema.json:130–148](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/schema/aiqh.config.schema.json#L130-L148)、[src/adapters/builtin.ts:16](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/adapters/builtin.ts#L16)、[src/cli-program.ts:102–110](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/cli-program.ts#L102-L110)。 |

### 問い 2 — テストの有効性と旧版での FAIL / PASS

**今回の実装を止めるテスト上の指摘はありません。** 同梱テストは設計で問題にした主要な境界を作り、単なる終了コードの確認にとどまらず、finding の形や規則別の使用回数を比較しています。ただし、旧版の実測ログは同梱されておらず、報告された FAIL 26・PASS 10 を独立に再現したとは扱いません。

| ケース | コードから確認できること |
|---|---|
| T1・T2・T3 | 11 個の明示的な一覧、分類別の個数、75 個の集合との包含、対象外の文字を確認しています。本文の 11 個の検出、同じ行・符号位置の重複除去、U+2028 で LF の行番号を増やさないことも比較しています。 |
| T4 | 65,535 バイトの ASCII の後ろに U+202E を置き、3 バイトの先頭 1 バイトだけが最初の 64 KiB の read に入る配置です。長い行の別 fixture では、独立した LineAssembler で U+202E を含む窓が 2 個になることを先に確かめ、scanRepository の finding は各ファイル 1 件と要求しています。読み取りの切れ目と窓の重なりの両方を作れています。 |
| T5 | 無視されない未追跡、無視される未追跡、未追跡 .env を分けています。(3) は raw の不在と untracked-env の対象ファイルを種類別に確かめ、既存の .gitignore finding が共存しても総件数を 1 に固定しません。 |
| T6 | NUL を含むバイナリ、UTF-16LE、BOM と CRLF、除外する方向の印などを確認します。不正な UTF-8 のケースでは、その後ろの正しく符号化された U+202E を正しい行で検出する assertion があります。 |
| T7・T7a〜T7g | 通常名、端末・JSON、ルートの除外に加え、バイナリ、未追跡 .env、symlink、gitlink、index に残して実体を消したパス、無視されない未追跡、無視された未追跡を作っています。gitlink は mode 160000 と同名 directory の両方を用意し、単なる ENOENT のケースにはなっていません。名前 finding の厳密比較は line・endLine の不在も検査します。 |
| T8・T8a〜T8f | 分類なし規則と後続規則の順序、別パス、期限切れ、secret との混在、本文と名前の行条件を検査します。T8d は規則ごとの count、unused、expired、抑制した secret、残る raw、端末の表示まで確かめます。 |
| T9・T10・T14 | 本文の前後断片を出さないこと、名前と本文の raw 出力、抑制後の件数、情報行、6 内訳の counts・items・summaryText、固定 fixture の rawChars: 0 を検査します。T10 には古い 5 内訳を unexpected-summary とする assertion もあります。 |
| T11 | 古い counts に rawChars が無い場合と、新しい counts の実測 0 を分け、null・unknownRuns と 0 の系列を比較しています。 |
| T12・T13 | scanString の秘密走査へ raw 検査を混ぜていないことと、raw の分類を明示した allow があっても review-packet の独立した raw 検査は残ることを確認します。 |

参照: [tests/regression-item48-raw-chars-scan.test.ts:112–561](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/tests/regression-item48-raw-chars-scan.test.ts#L112-L561)、[tests/parse-security.test.ts:74–154](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/tests/parse-security.test.ts#L74-L154)。

**旧版 FAIL の理由は、最初に到達する assertion を基準に評価しました。**

- T8a〜T8d と T13 は、旧版では新分類の schema 拒否が先に起きます。その FAIL 自体から allow の候補選別や packet の raw 分離まで到達したとはいえません。この失敗経路は設計 §8-1 にも明記されています。一方、T8e は schema を通さず findAllowRule を直接呼び、分類なしの先行規則や名前に対する line 付き規則を飛ばすことを検査します。head 側の T8a〜T8d の詳細な assertion と合わせて、必要な回帰を測れています。
- T10 の依頼文の説明は、実際の assertion の順序に合わせて読む必要があります。[tests/parse-security.test.ts:129–146](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/tests/parse-security.test.ts#L129-L146) は、パースする前の 137 行で code が 1 であることを要求します。旧 scanner は fixture の raw 文字を検出せず code が 0 になるため、最初の失敗はここです。138 行以降の 6 内訳や rawChars の assertion まで到達した証拠にはなりません。FAIL という分類と、head でのテストの有効性は変わりません。
- T14 は旧 fixture に新しい情報行・6 内訳が無いことを見つけるケースです。完成したテスト 2 ファイルだけを旧版へ写し、fixture を旧版のままにしたという依頼文の手順に整合します。既存の不正 summary の例を 6 内訳へ直した分が旧版でも拒否されることを、新機能の検証成功とは数えていません。

参照: [docs/reviews/item48-design/design-r2.md:277–355](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/design-r2.md#L277-L355)、[tests/regression-item48-raw-chars-scan.test.ts:339–468](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/tests/regression-item48-raw-chars-scan.test.ts#L339-L468)、[tests/regression-item48-raw-chars-scan.test.ts:538–560](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/tests/regression-item48-raw-chars-scan.test.ts#L538-L560)。

**テストから確認できる範囲には、次の限定があります。**

- 同梱 T7 群のファイル名に置く対象は U+202E・U+2066・U+2029 の 3 種類です。11 種類すべてを反復しているのは T1、本文の T2、scanString の T12 です。従って、依頼文の「T7 系で全 11 種類の macOS ファイル名の正規化を確認した」という範囲までは、同梱テストから裏づけられません。別の手動確認があった可能性は残り、その実測は未確認です。
- T7c は symlink 名の検査を測れますが、リンク先の本文が plain なので、このケース単独ではリンク先を誤って読んだ実装を区別できません。今回の lstat と通常ファイル判定が不変であることをコードでも照合し、今回の必須追加指摘とはしていません。
- T11 は counts Map を与える aggregate の試験です。history ファイルの読み込みから HTML までを一度に動かす試験ではありません。ただし、既存の [tests/history-read.test.ts:331–344](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/tests/history-read.test.ts#L331-L344) が、更新 fixture から parser が出す全 count キーが COUNT_KEYS に含まれることを確認し、読み込み・HTML の汎用処理も固定コードで照合できるため、新たなテスト不足の指摘とはしていません。
- 未マージの複数 stage による重複列挙は、同梱の新テストで扱われていません。上の raw 件数の Low に対する追加ケースは、この境界を対象にします。

### 問い 3 — I48-D-R2-001 の訂正

**評価は解消、本文への追加指摘なしです。** 次の 3 点が、指定の 6 文書すべてで一致しています。

1. --version は package の版を表示し、dist の更新を証明しない。
2. 版を取り込んだ後に npm run build を行う。
3. 実際の security check と同じ起動経路で、raw characters checked: の情報行と、raw characters を含む 6 内訳の件数行を確認する。

| 文書 | 訂正を確認した箇所 |
|---|---|
| ADR-0036 | [docs/adr/0036-security-scan-raw-bidi-controls-and-line-separators.md:42–43](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/adr/0036-security-scan-raw-bidi-controls-and-line-separators.md#L42-L43) |
| CHANGELOG | [CHANGELOG.md:15–17](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/CHANGELOG.md#L15-L17) |
| README | [README.md:199–202](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/README.md#L199-L202) |
| CONFIG_SPEC | [docs/CONFIG_SPEC.md:267–274](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/CONFIG_SPEC.md#L267-L274) |
| 設計 R2 の記録 | [docs/reviews/item48-design/design-r2.md:264–267](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/design-r2.md#L264-L267)、同 394 行 |
| R1 への応答 | [docs/reviews/item48-design/response-r1.md:47](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/response-r1.md#L47) |

固定コードでも、[src/cli.ts:19–27](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/cli.ts#L19-L27) は実行時に隣接する package.json の version を読み、[src/cli-program.ts:51–54](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/cli-program.ts#L51-L54) がその値を表示します。[package.json:19–28](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/package.json#L19-L28) の bin は dist/cli.js です。従って、package.json が新しくても dist が古い状態は、版表示だけでは区別できません。訂正後の案内は、この実装に合っています。

また、[src/runner/run-checks.ts:48–54](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/runner/run-checks.ts#L48-L54) は設定の command を渡し、[src/runner/execute.ts:150–156](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/runner/execute.ts#L150-L156) は shell を使って起動します。[src/runner/env.ts:8–13](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/runner/env.ts#L8-L13) は PATH を変更しません。CI の [.github/workflows/verify.yml:108–111](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/.github/workflows/verify.yml#L108-L111) は、取り出したソースを起動する aiqh の script を PATH に追加します。実際の子の起動経路をそろえて出力の形を確かめる案内は適切です。設定で別の実行ファイルを明示した場合の限界は、依頼文の既知事項として扱いました。

### 問い 4 — 出力・パーサ・履歴

**この問いの各観点は指摘なしです。**

**端末と JSON。** raw finding が保持するのは分類、相対パス、本文の場合の行番号、U+ 表記、固定的な説明です。本文の周辺文字列を保持・表示する追加経路はありません。[src/commands/security-scan.ts:55–65](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/commands/security-scan.ts#L55-L65)、[src/commands/security-scan.ts:94–121](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/commands/security-scan.ts#L94-L121) は既存の Output を使い、atLine は行番号が無い場合を明示的に扱います。raw のパス名と、その allowed 行に :undefined が付く経路はありません。

未変更の [src/output.ts:30–56](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/output.ts#L30-L56)、[src/output.ts:166–168](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/output.ts#L166-L168)、[src/output.ts:254–260](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/output.ts#L254-L260) を照合し、端末の文字列と JSON 内の文字列・キーが、既存の表記変換と秘密のマスクを通ることも確認しました。allow の path・reason を含む新出力が、この境界を迂回する経路は見つかりませんでした。

**6 内訳と parser。** 端末の件数は抑制後の findings を 6 kind に分けて数えます。パーサは順序付きの 6 ラベル、整数の妥当性、内訳の和、末尾の no findings / findings present との整合を検査します。古い 5 内訳、順序・ラベル・数値・総和の不一致、末尾との矛盾は unexpected-summary の対象です。必要な header・summary・末尾が欠ける場合は no-summary です。情報行を読み飛ばしても判定や counts は変わりません。[src/parse/security-scan.ts:16–57](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/parse/security-scan.ts#L16-L57)、[src/parse/security-scan.ts:80–115](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/parse/security-scan.ts#L80-L115)。

解析結果は表示用であり、解析の失敗から check の合否を変える変更はありません。生の文字を検出するかどうかは実際の scanner のコードで決まる、という H8 と ADR-0028 の P1 の区別も保たれています。

**history と HTML。** rawChars は SECURITY_SCAN_COUNT_KEYS から [src/parse/read.ts:23–29](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/parse/read.ts#L23-L29) の COUNT_KEYS に入り、[src/run-history/read.ts:341–350](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/run-history/read.ts#L341-L350) は保存データに実際に存在するキーだけを残します。[src/run-history/aggregate.ts:257–284](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/run-history/aggregate.ts#L257-L284) は、キーが無い run を unknownRuns に加え、値が無い日は null、実測した 0 は 0 とします。新しい run が一つも rawChars を持たない場合は、その系列自体を作りません。新旧 run が混在する場合、古い run を「検査した結果 0」とは解釈しません。

[src/run-history/html.ts:189–195](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/run-history/html.ts#L189-L195) は集計済みの各 counts 系列を列挙するため、rawChars 専用の表示分岐は不要です。対応表のワイルドカードという説明と一致します。関連する読み込み・集計・HTML のコードが base と head でバイト同一であることも確認しました。

### 問い 5 — 文書と取り込み記録

**文書本文の今回の変更には、追加の指摘はありません。** ADR-0036 の決定・既知の限界、ADR-0012・0014・0020・0028 の注記、ADR-0034 の参照更新、CONFIG_SPEC、ARCHITECTURE、README、ROADMAP、CHANGELOG を、対応する実装と照合しました。11 個の分類、名前と内容の対象の違い、明示分類の allow、packet の独立した 75 文字の検査、6 内訳、子の版による検出能力について整合しています。

ADR-0034 の C の 5 で SECURITY_SCAN_COUNT_KEYS の参照を 24 行から 25 行へ直した点も、新しい [src/parse/security-scan.ts:24–25](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/parse/security-scan.ts#L24-L25) と一致しています。CLI のヘルプへの追加と、版を 0.13.0 に上げたことは、今回の変更目的に沿います。依存関係、lockfile、CI 定義、構造テスト、適用先の変更は、この範囲の差分にはありません。

設計レビューの取り込みについては、次を確認しました。

- review-r1.md と review-r2.md は、先頭の収録注記の後ろが、手元の受領原文とバイト単位で一致しました。R1 原文内の sandbox リンクを注記付きで保存するという決定も踏まえ、原文をそのまま収録したことを問題視していません。
- findings のレビュアー 8 項目、summary、過去回の評価、source の原文ハッシュは、原文末尾の JSON と一致しました。取り込み時の tool.version が 0.12.1 であることも、release 前に取り込んだ記録と整合します。
- 設計 R2 の収録時の変更は、収録注記、変更表、版更新案内の訂正として説明されています。別の設計変更を未記録で入れた形は見つかりませんでした。
- 実装者の状態・対応・テストの記録について残る問題は、上の文書の Low で述べた 3 件の fixedIn です。テスト追加に対応する他の 3 件まで、同じ理由で不適切とは評価していません。

確認対象: 固定 head の [docs/reviews/item48-design/](https://github.com/youhei-dev/ai-quality-harness/tree/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design) の 7 ファイルと、[docs/ops/review-loop.md:18–24](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/ops/review-loop.md#L18-L24) の取り込み・状態更新の契約。

### 確認方法と未確認範囲

**独立に確認したもの**は、添付パケットと公開固定コードの一致、タグの参照先、今回のコードと文書の対応、設計レビュー原文の保存と JSON の対応、文書修正の docs・release 各コミットへの対応、および Git の未マージ index の列挙です。公開の未変更ファイルも必要箇所を読んで補っており、今回の判断のために追加パケットは必要ありません。

**独立には確認していないもの**は、全 2,344 件のテスト実行、10 回連続成功、typecheck・lint・verify・verify:dist、旧版での 36 ケースの実測結果、CI run の成功、macOS で全 11 種類をファイル名にした実測、新旧 dist を組み合わせた実プロセス、追加走査の性能、適用先 2 リポジトリの走査結果です。これらは依頼文の実装者記録として受け取り、こちらで再実行済みという根拠にはしていません。

既存コード全体を全面的に再レビューしたものではありません。依頼文に明示された対象外の文字、文字コードの限界、ルート・symlink の先・submodule 内部・無視された未追跡パス、別実行ファイルを明示する設定、Windows、R-010 は、新しい指摘として数えていません。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "item48-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 2
  },
  "findings": [
    {
      "id": "I48-I-R1-001",
      "severity": "Low",
      "kind": "バグ",
      "target": "[src/security/scan.ts:151–154](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L151-L154)。関連箇所: 同ファイル 173–183、404–433、449–461、686–703 行。",
      "content": "未マージの index に同じパスの stage 1・2・3 があると、同じ作業ツリーのファイルを 3 回走査し、同じファイル・行・符号位置の raw finding が 3 件になります。パス名の finding も同様です。この状態では未抑制の rawChars、または抑制に使った allow 規則の使用回数が重複分だけ増え、設計の「1 件」の契約を満たしません。",
      "evidence": "[docs/reviews/item48-design/design-r2.md:113–123](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/design-r2.md#L113-L123) は、本文をファイル・行・符号位置ごと、名前をパス・符号位置ごとに 1 件としています。[src/security/scan.ts:173–183](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/security/scan.ts#L173-L183) は git ls-files -z の結果を一意化せずに返します。[Git の公式仕様](https://git-scm.com/docs/git-ls-files#Documentation/git-ls-files.txt---deduplicate) は、未マージの複数 stage による名前の重複を説明しています。独立した一時リポジトリでも Git 2.51.1 で、実ファイル a.txt は 1 個、通常の列挙は同名 3 件、--deduplicate 付きは 1 件となることを確認しました。head の RawCharSink の seen は scanFile ごとに、checkPathName の seen は呼び出しごとに作られます。そのため、本文 1 行目に U+202E が 1 個あれば同じ finding が 3 件になり、applyAllow もそれぞれを数えます。aiqh を実行した再現ではなく、Git の実測と固定コードの照合による確認です。列挙処理自体は既存ですが、今回加わった raw の件数契約に影響します。検出漏れや FAIL から PASS への変化は生じないため Low とします。",
      "fix": "listFiles の NUL 区切りの結果を、順序を保持する Set などで一意化し、各パスを 1 回処理してください。Git の新しいオプションへの依存を増やさずに直せます。同じパスに未マージの複数 stage を置く回帰テストで、本文の同じ行・符号位置と名前の符号位置がそれぞれ 1 件であり、対応する allow の使用回数も重複しないことを確認してください。",
      "confidence": "確認済み"
    },
    {
      "id": "I48-I-R1-002",
      "severity": "Low",
      "kind": "文書",
      "target": "[docs/reviews/item48-design/findings-r1.json:35–39](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/findings-r1.json#L35-L39)、同ファイル 107–111 行、[docs/reviews/item48-design/findings-r2.json:56–60](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/reviews/item48-design/findings-r2.json#L56-L60)。対応する説明は response-r1.md:27–28 と response-r2.md:19。",
      "content": "文書の指摘 I48-D-R1-001・I48-D-R1-005・I48-D-R2-001 の fixedIn が、文書を修正していない実装コミットを指しています。note は「文章が説明する動きを入れたコミット」と説明していますが、fixedIn の既存の意味である「その指摘を直したコミット」とは異なります。本文の訂正は head にそろっており、残っているのは修正の追跡情報の不一致です。",
      "evidence": "[docs/ops/review-loop.md:23](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/ops/review-loop.md#L23) は fixedIn を、直したコミットの 40 桁の SHA としています。3 件が指す [7633da4f25c42748b6ee66fcb13cbb6c2a7289e3](https://github.com/youhei-dev/ai-quality-harness/commit/7633da4f25c42748b6ee66fcb13cbb6c2a7289e3) は、公開コミット情報でも親がレビューの base で、差分の 13 ファイルに文書がありません。固定 docs コミット [5fe75f4c5f47933bea5f66232e2e454c418fb3d5](https://github.com/youhei-dev/ai-quality-harness/commit/5fe75f4c5f47933bea5f66232e2e454c418fb3d5) と head も照合し、設計・ADR 等の訂正は docs コミット、実際の CHANGELOG への反映は release コミットであることを確認しました。[src/review/check.ts:98–112](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/src/review/check.ts#L98-L112) が検査するのは SHA の形、regressionTest の非空、コミットの存在です。[docs/adr/0027-review-check-state-and-loop.md:42–44](https://github.com/youhei-dev/ai-quality-harness/blob/8bd945666f5774ca9a4b4030bcd77f60794b764a/docs/adr/0027-review-check-state-and-loop.md#L42-L44) も修正内容の意味までは検査しないと明記しています。従って、REVIEW LOOP: complete と警告 0 は、この対応の妥当性を証明しません。依頼文と note に経緯・後続の記録予定が明示され、本文自体は訂正済みなので Low とします。",
      "fix": "次の記録 PR で、fixedIn と note・応答記録を実際の文書修正に合わせてください。今回宣言した実文書一式への反映完了を基準にすると、I48-D-R1-001 と I48-D-R2-001 は 8bd945666f5774ca9a4b4030bcd77f60794b764a、I48-D-R1-005 は 5fe75f4c5f47933bea5f66232e2e454c418fb3d5 が対応します。前の 2 件の note に、主な文書修正は docs コミット、CHANGELOG への反映完了は release コミットと補足すれば追跡できます。元の実装コミットは、関連する動作・回帰テストの根拠として残せます。文書の追跡情報の訂正のために新しい実行テストを設ける必要はありません。",
      "confidence": "確認済み"
    }
  ]
}
```

