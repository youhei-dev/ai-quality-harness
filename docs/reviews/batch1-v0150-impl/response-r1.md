# batch1-v0150-impl の独立レビュー 1 回目への対応記録（response-r1）— v0.15.0 の記録

- 対象レビュー: `docs/reviews/batch1-v0150-impl/review-r1.md`（受領ファイル名 `independent-review-batch1-v0150-impl-r1-for-claude.md`、2026-10-26 受領、9,696 バイト、SHA-256 `b0979ede51a62e9bc7019c4c0753a81ef484884dacd69027c50f86a93903b897`、
  LF 73 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 層 (c) の文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし / URL なし / レビュアーの側の作業場所を指すリンク〈`sandbox:`〉の行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: v0.15.0（batch1 の 3 版目、最後の版。ROADMAP の項目 49 の層 (c)〈ADR-0037〉と、値が空の `=` の形の node:test の直し〈ADR-0011〉、v0.14.1 の記録）。範囲 `c520d88dccbac6e28e54c91685b2d67c0b8375af..cf8a7ec306c7b72869f9d97ea310bc22765af216`（4 commit、変わったファイル 22 個。merge の commit は含めない）
- レビュー用に作って人間に渡したもの（送付は人間が行った）
  - パケット `review-packet-batch1-v0150-impl-r1.zip`（1,402,387 バイト、SHA-256 `361b874a726531d32eb6e11816c2627e4353c3d67aae495bfd16f18b28145c54`。中は `review-packet-batch1-v0150-impl.md` の 1 ファイル、1,402,221 バイト、SHA-256 `4066c24c5773e898430077e2f31a696a42be18155bdf394a23a8bec918af41df`）
  - 依頼文 `review-request-batch1-v0150-impl-r1.md`（32,439 バイト、SHA-256 `c0404f0f2ccc263ec1d607edda5e0613280d9eb508e8a36bc1513e905b306b78`。問いは 10、読むときの固定の URL は 24 件〈release の commit に固定した 23 件と、v0.14.1 の直しの commit の 1 件〉。パケットの中にバイト単位で同一で 1 回入っている）
- 対応日: 2026-10-26
- 結果（レビュアー）: **High 0 / Medium 0 / Low 0**（指摘なし）。レビュアーはパケットと固定の URL の一部（下の「既知の残余」）を静的に読み、コードとテストは実行していない。依頼文に先に書いた基準（High・Medium が 0 なら、このレビューを終える）に達したので、**batch1-v0150-impl のレビューは R1 で終える**
- **v0.15.0 の `aiqh review-import` でそのまま取り込めた**: v0.15.0 の記録の PR（branch `docs/v0.15.0-record`）の commit で、`aiqh review-import <受領ファイルの写し> --label batch1-v0150-impl --round 1 --id-prefix B1-I150`（写しは受領ファイルと SHA-256 が同じ）。exit 0、`High 0 / Medium 0 / Low 0; open 0`、最後の 2 行は `REVIEW LOOP: complete` と `REVIEW IMPORT: written`。取り込みの前に、写しを取り込みの検査の本体 `readReview`（ファイルに触れない関数）で確かめた（問題 0 件、指摘 0 件）。`findings` と `previous` は空（label `batch1-v0150-impl` の 1 回目）。指摘 0 件の回なので、`### <ID>` の見出しは無く、`## 全体の結論` の件数の行と JSON のブロックで突き合わせた

## 判定表

指摘が 0 件なので、判定・対応・`fixedIn` は無い（findings の実装者の欄に書くものも無い）。

## レビュアーの判定の要約（実装者の評価ではない）

依頼文の問い 1〜5 で確かめを頼んだもの（設計の独立レビュー batch1-design で open だった 4 件、v0.14.1 で直した B1-I140-R1-001、v0.15.0 の `=` の直し）は、レビュアーの判定ですべて「解消」:

| 対象 | 由来 | 判定 | レビュアーの主な根拠（原文の要約） |
|---|---|---|---|
| B1-D-R1-003（問い 1） | batch1-design R1 | 解消 | 候補は U+200D・U+FE0F・U+E0020–U+E007F だけ（`isExemptionCandidate`）。run は Emoji と Emoji_Component の和で、sticky な `RGI_Emoji` を run の先頭から順に照らし、区間の内側だけを除く。両端が確かめられることが条件。U+FE0E・U+E0001・U+E0100・U+180B は候補でなく finding の側。I1〜I4・I7・I8 に対応する |
| B1-D-R1-006（問い 2） | batch1-design R1 | 解消 | 8 分類が足され、層 (a)・(b) の 11 の符号位置と `FORBIDDEN_RANGES` は保たれている。L20 が Unicode の属性との差分を、L21〜L23 が NUL・行の途中と末尾の CR・CR LF・先頭と途中の BOM を分けて確かめる。属性の完全な独立の再計算はしていない |
| B1-D-R2-001（問い 3） | batch1-design R2 | 解消 | `LineAssembler` が `offset`・`final`・`tailStart` を渡し、保証された重なりだけを根拠に持ち越す。`RawCharSink.decided` は位置を決め直さず、次の窓の先頭より古い位置だけを捨てる。L16 の (a)〜(g) が境界を固定する。意図して FAIL の向きに倒す既知の誤検出のほかに、明確な欠落は無い |
| B1-D-R2-003（問い 4） | batch1-design R2 | 解消 | `RawCharDecision` が位置と `exempt` を持ち、除いた数は位置で数える。finding の鍵は行と符号位置（パス名は符号位置）。除いても同じ鍵の finding は消えず、allow は後で finding にだけ効く。L24 が固定する（I9 の二層の数え方） |
| B1-I140-R1-001（問い 5） | batch1-v0140-impl R1（v0.14.1 で直した） | 解消 | 値を別の語で取る形で、値が無い・`-` で始まるときは提案しない |
| 値が空の `=` の形（問い 5） | v0.15.0 の直し | 解消 | inline の `--name=` で `=` の後ろが空なら提案しない。N5r（値を取る 18 のオプション）と N2e が対応し、`--import=x` などの正しい形を落とさない守りがある。Node のすべての版の動きの保証ではなく、固定した Node の仕様への対応として解消 |

問い 6〜10 は、どれも「指摘なし」。要点:

- 問い 6（拾いすぎ・拾い漏れ）: RGI の前後の E の文字、余分な U+200D・U+FE0F・タグ文字、キーキャップ・肌の色・旗・連続した並び・パス名の区切りをまたぐ形、長い行・サロゲートの半分・CR LF の分かれ目は、L13〜L18・L16・L22 で確かめた。窓から消える文脈の足りない run を finding にするのは、設計が受け入れた FAIL の向きの限界で、新しい欠陥として起票しない。Unicode の列の総当たりはしていない
- 問い 7（性能）: 読む範囲を一定の窓に限った、線形を志向する作り。ただし L11 の `work.steps` は UTF-16 の初めの走査・Set の操作・割り当て・正規表現の内部の試行を数えないので、それだけで総時間の O(n) の証明にはならない。実装者の中央値 約 0.33 秒は記録として参照するだけで、独立に測っていない
- 問い 8（テストの検出力と、弱めていないか）: L1〜L24、L16 の (a)〜(g)、I5 の分岐のテスト、item48 の 3 か所の変更を確かめた。層 (a)・(b) の 11 の符号位置の確かめは消えておらず、期待の変更は新しい分類に対応したもの。同値の変異については、下の「同値の変異についてのレビュアーの条件」
- 問い 9（既存の利用者への影響の書き方）: CHANGELOG・README・CONFIG_SPEC に、既定で FAIL が増えること、上げる前の走査、`category` 付きの allow、RGI の例外、窓の限界、件数と除いた数の違いが書かれている。適用先 B に allow が要るという記録を、一般の利用者にそのまま当てはまる保証とは扱わない
- 問い 10（ADR と記録）: ADR-0037（採用）と案からの違い、ADR-0011・ADR-0036 の追記、ARCHITECTURE、ROADMAP の項目 49・54、findings の実装者の欄を確かめた。層 (c) の文字を review-packet と出口の表記の集合に加えない既知の限界は項目 54 に残っていて、この版の直しと取り違えていない

## 同値の変異についてのレビュアーの条件（原文の問い 8 のとおり）

v0.15.0 の 22 通りの変異のうち、落ちなかった 1 通り（I1 の候補に U+FE0E と U+200B を加える）を、実装者は「結果を変えない同値の変異」と判断した。レビュアーは、今の `insideSequences` が 2 つの文字を RGI の一致の内側とみなさない限り `exempt` の真偽が変わらないので、観測される finding と除いた数について同値という判断はコード上妥当とした。そのうえで、次の条件を付けた（原文のまま）:

> ただし I1 の内部的な集合の同値性を意味するのではなく、**現在の最終出力についての同値性**である。将来の matcher/Unicode の変更時は再評価が必要。

この記録では、この判断を「今の出力についての同値」として扱う。一致の作り（`insideSequences` と `\p{RGI_Emoji}` の照らし方）か、aiqh を動かす Node の Unicode の版（ADR-0037 の I8）が変わったときは、この変異が同値かを見直す。

## 既知の残余として受け入れたもの（新しい指摘ではない）

レビュアーは、結論が静的なレビューであり、次を独立には確かめていないと明記した。これらは新しい指摘ではなく、既知の残余として受け入れる（人間の指示 2026-10-26）。

- **固定の URL の一部の未照合**: 24 件のうち、GitHub で本文を開いたのは、設計（最終）・ADR-0037 の案（最終）・決めることの一覧（最終）・`src/config/window-limits.ts`・`src/config/schema.ts`・`src/parse/security-scan.ts`・`src/security/patterns.ts` と、v0.14.1 の直しの commit `545eeffffbfb6f88e07d27e4a031c77102813acf` だけ。ほか（設計のレビューの原文と対応記録の各回、`src/output.ts`、`src/review/packet.ts`、`tests/parse-security.test.ts`、fixture、ADR-0012・ADR-0016・ADR-0020 など）は開いていない。パケットに全文の入る変更ファイルのほかは、リンク先の変えていないコードを全面には照らしていない
- **独立の実行なし**: Node 24.13.1 でのテストの再実行、変更の前の FAIL の再現、性能の独立のベンチマークはしていない。テスト・CI・負荷の PASS は実装者の記録（CHANGELOG・ROADMAP の v0.15.0 の項）に依る。PR #18 の run 40192730657 と main の run 40193239019 が success であることは、この記録の PR で `gh run view` で確かめ、CHANGELOG・ROADMAP の v0.15.0 の項に書いた
- **Unicode の全列挙なし**: Node・ICU の RGI のすべての独立の列挙、Unicode の列の総当たり、任意の長さの窓・文字列に対する形式的な証明はしていない。Unicode の属性の完全な独立の再計算もしていない（問い 2）
- **変異のログの未添付**: 22 通りの変異の実行のログはパケットに入っておらず、「21 通りで FAIL」は独立に追認できない。L11 の時間の測定も同じ。どちらも実装者の記録（CHANGELOG・ROADMAP の v0.15.0 の項）に依る
- 非公開の適用先 A・B の中身は確かめていない（実測の件数は実装者の記録）

## 読めた範囲（レビュアーの原文の要約）

ZIP の 1 ファイル `review-packet-batch1-v0150-impl.md` の Metadata・Request・変更ファイルの全文と差分・Verification（`src/security/raw-chars.ts`・`src/security/scan.ts`・`src/commands/security-scan.ts`・`src/adapters/node.ts`・JSON Schema・item45／item48／item49 のテスト・ADR-0037・ADR-0011・ADR-0036・README・CHANGELOG・CONFIG_SPEC・ARCHITECTURE・ROADMAP・findings と response）と、上の固定の URL を読んだ。

## 取り込みと review-check

- `aiqh review-import`（v0.15.0。`tool.version` は 0.15.0）: `findings-r1.json`（指摘 0 件）。exit 0、`REVIEW IMPORT: written`
- `aiqh review-check --label batch1-v0150-impl`: R1 は open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）
- `aiqh review-check --label batch1-design`: 前と同じく open none、警告 4、`REVIEW LOOP: complete`・`REVIEW CHECK: passed`（この記録では触っていない）
- これで batch1 は、設計の独立レビュー（batch1-design、R1〜R3）と、3 つの版の実装の独立レビュー（batch1-v0132-impl・batch1-v0140-impl・batch1-v0150-impl）のループがすべて閉じた（4 つの label の `aiqh review-check` はどれも `REVIEW LOOP: complete`・`REVIEW CHECK: passed`）

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/batch1-v0150-impl/review-r1.md`（原文の収録）・`findings-r1.json`（取り込み）・`response-r1.md`（この記録）
- ROADMAP の項目 54 の扱いは変えない
