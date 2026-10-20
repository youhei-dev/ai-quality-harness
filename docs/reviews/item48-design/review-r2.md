> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-item48-design-r2-for-claude.md`（2026-10-19 受領、26,604 バイト、LF 165・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `61501400980724c8c7e0fe62743ae28b7065ff267a365c443ef26f47b3bced19`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.13.0 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# item48-design 設計レビュー R2

レビュー日: 2026-10-19

対象: `item48-design-r2.md`、`adr-0036-draft-r2.md`、`response-item48-design-r1.md`

基準コード: `youhei-dev/ai-quality-harness` の commit `8870afbf1bf65282f12bba39086d661c88d70851`。以下のコードへのリンクは、すべてこの commit に固定しています。

## 指摘

### I48-D-R2-001

- **ID**: I48-D-R2-001
- **重要度**: Low
- **種別**: 文書
- **対象**: 設計 §6-4「手元」「版を上げるときの案内」・§9 の CHANGELOG 下書き、応答の I48-D-R1-001 の対応
- **内容**: 旧 `dist/` の判別を `aiqh --version` に頼る説明が、実コードと合いません。設計は、親も子も旧 `dist/` で動く場合を「`aiqh --version` でしか分からない」とし、応答も版表示での確認を案内しています。しかし、ソースと `package.json` を更新した後に旧 `dist/` が残っていれば、新しい版の番号を表示しながら旧 scanner で動く場合があります。
- **根拠**: [src/cli.ts:19–27](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/cli.ts#L19-L27) は、実行時に隣接する `package.json` の `version` を読みます。その値は同ファイル147行目で渡され、[src/cli-program.ts:51–54](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/cli-program.ts#L51-L54) で版表示に使われます。[package.json:19–28](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/package.json#L19-L28) の `bin` は `dist/cli.js` で、build は TypeScript のコンパイルです。[tsconfig.build.json](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tsconfig.build.json) も `src` から `dist` へ出力する構成です。したがって、版表示は読み込まれたビルドの新しさを証明しません。親子とも旧コードなら、旧パーサと旧出力が一致して `unexpected-summary` も出ないという設計の説明と組み合わさり、両方の確認を通過し得ます。これは固定コードから導ける反例で、旧ビルドを使った実行再現はしていません。再ビルドの必要性は既に明記されているため、検出設計を妨げない文書上の問題として扱います。
- **修正案**: `--version` は package の版を確認する情報であり、`dist/` の更新を証明するものではないと訂正してください。更新後の `npm run build` の案内は維持し、実際の security check と同じ起動経路で、`raw characters checked:` の情報行と `raw characters` を含む6内訳の件数行が出ることも確認する案内にしてください。設計 §6-4・§9 と応答の説明をそろえてください。
- **確度**: 確認済み

## 全体の結論

件数: High 0 / Medium 0 / Low 1

**新たな High・Medium の指摘はありません。R1 の5件は、設計文書とテスト計画への対応としてすべて解消と評価します。** 依頼文の終了条件を満たしているため、このR2設計レビューは終了できると判断します。今回の Low は記録し、指定どおり v0.13.0 以降で扱えます。

11文字への限定、既定で FAIL、分類を明示した規則だけによる抑制、パス名検査と内容検査の分離、`scanString` を変えない構成、新しい出力形式だけを受け付けるパーサについて、基本方針の変更は求めません。「解消」は設計段階の評価です。実装の完了や、新しいテストの実測結果を認定するものではありません。

### 問い1: R1 の5件への対応

| 前回の指摘 | 評価と理由 |
|---|---|
| I48-D-R1-001 | 解消。設計 §6-4・§9、ADR の決定10・代替案・影響、応答で、パース失敗が判定を変えない P1 と、検出範囲が実際の子 scanner の版で決まることを分離しています。新しい verify と古い子では検出が効かないと表にも明記し、実際に呼ぶ版・commit をそろえる案内を追加しています。H8 と P1 は維持されています。新たに加えた版表示での確認方法の誤りは、今回の文書指摘として扱います。 |
| I48-D-R1-002 | 解消。設計 §5-2 と ADR の決定8は、分類の明示を候補規則ごとの条件に置き、先頭の分類なし規則を採ってから棄却する実装を除外しています。T8a〜T8f と §5-4 は、規則の順序・パス不一致・期限切れ・秘密との混在・直接呼出し・使用回数を区別して固定する計画です。 |
| I48-D-R1-003 | 解消。設計 §3-4 と ADR の決定5は、追跡・未追跡両ループの各パスで、内容を読むかどうかの分岐より先に名前を検査すると指定しています。T7a〜T7g は、内容を読まない五種類、未追跡通常ファイル、ignore 除外をそれぞれ確かめます。 |
| I48-D-R1-004 | 解消。T5 の ignore 例を未追跡と明示し、三ケースを別の it に分けています。今回の検出・除外に対する旧版の見込みを FAIL / PASS / PASS とした修正は、基準コードの列挙と未追跡 .env の処理に合っています。 |
| I48-D-R1-005 | 解消。設計 §11 と ADR の既知の限界は、閉じた並びを無害とせず、始まりと終わりの対応だけでは安全と判断できないことを明記しています。出現を検出し、意図した利用を明示的な allow で扱う方針も維持されています。 |

allow の変更位置は、基準コードの [findAllowRule と allowMatches](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/security/scan.ts#L644-L653) と一致します。現行版は raw-char を一律に対象外とし、その後の `findIndex` が同じ規則について期限・分類・行・パスを照合しています。この候補判定に分類明示の条件を加える設計なら、先頭の汎用規則を飛ばして、後続の正しい規則を選べます。T8a〜T8e の旧版 FAIL、T8f の旧版 PASS という見込みは、各ケースの目的と整合します。

T5 の見込みも、[追跡・未追跡の列挙と .env の処理](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/security/scan.ts#L119-L155) に照らして妥当です。実装時のアサーションでは、T5(3) の「untracked-env だけ」は、raw-char が0件、untracked-env が1件という種類別の確認にすると明確です。非ignoreの `.env` は [checkGitignore](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/security/scan.ts#L552-L564) の finding も伴い得るため、全 finding 配列が1件という期待とは区別してください。既存の [未追跡ファイルの試験](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tests/regression-m1r1-001-untracked-scan.test.ts#L38-L49) も種類別に確認しています。これは試験を具体化する際の補足であり、FAIL / PASS / PASS の評価は変わりません。

### 問い2: R2 の変更による新しい問題

**版表示による旧ビルドの確認方法を除き、指定された観点に新たな問題は認めません。**

1. **shell・PATH の説明: 指摘なし。** 標準の command は [builtin.ts:16](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/adapters/builtin.ts#L16) の `aiqh security-scan` です。[execute.ts:150–156](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/runner/execute.ts#L150-L156) は shell を使って実行し、[env.ts:8–13](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/runner/env.ts#L8-L13) は親環境を複製して色の変数だけを調整します。親自身の実行ファイルに子を固定する処理はありません。

2. **CI の同一 commit の説明: 標準コマンドが起動スクリプトを使う経路について、指摘なし。** ワークフローは [72–78行目](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/.github/workflows/verify.yml#L72-L78) で `job.workflow_sha` を checkout し、[98–111行目](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/.github/workflows/verify.yml#L98-L111) で HEAD の一致を確認して、そのソースへの絶対パスを使う起動スクリプトを PATH に置きます。[118–124行目](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/.github/workflows/verify.yml#L118-L124) の親と、標準の子が同じスクリプトを解決する場合、説明は成立します。確認した保証範囲はこの通常経路です。[run-checks.ts:48–54](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/runner/run-checks.ts#L48-L54) は設定された command をそのまま渡すため、別の実行ファイルを明示するカスタムコマンドまで同じ commit に強制する仕組みではありません。

3. **パス名検査の位置と既存統計: 指摘なし。** [scan.ts:141–155](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/security/scan.ts#L141-L155) の両ループの先頭で名前を検査し、その後の既存処理を継続する構成なら、追跡 `.env` の分類と未追跡 `.env` の finding は維持できます。`filesScanned`・`skippedBinary` は [scanFile:376–395](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/security/scan.ts#L376-L395) に残るため、名前の finding を加えること自体では変わりません。T7a〜T7g の検査対象と除外対象も、この配置と一致します。

4. **T7d の gitlink fixture: 指摘なし。** index に mode 160000 の項目を置き、同名の空ディレクトリを作れば、列挙対象になった後、上記 `lstat` と非通常ファイルの分岐を通せます。空ディレクトリを作るため、ENOENT の T7e とも区別できます。今回の目的は「内容を読まない項目の名前」であり、別リポジトリや `.gitmodules` は不要です。既存の作成例は [review-packet.test.ts:151](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tests/review-packet.test.ts#L151) と [submodule-type-change.test.ts:58](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tests/regression-m2-1-r1-005-submodule-type-change.test.ts#L58) に実在します。

5. **T8d の使用回数・未使用・期限切れ: 指摘なし。** 秘密の finding が1件という入力条件なら、分類なしの規則0に使用回数1が付き、生の文字は残ります。別パスの規則1は未使用、期限切れの規則2は expired にだけ入り、unused には入りません。[applyAllow:619–637](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/security/scan.ts#L619-L637) が選ばれた規則だけの回数を増やし、期限内で回数0の規則を未使用としているためです。`[allowed]` が1行という期待も [CLI の抑制結果の出力](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/commands/security-scan.ts#L87-L96) と合います。

6. **旧 commit で新しいテストを読み込む計画: 指摘なし。** §8-1 の Vitest での予備実測を材料にしつつ、§13 で旧 worktree 自体では未確認と明示し、§10 で完成したテストを基準 commit にコピーして実際の FAIL / PASS を確認する手順を残しています。この設計段階の計画は妥当です。予備実測だけを、将来のテストファイル全体が読み込めた証拠や、ケースごとの結果の代わりにはできません。基準コードの [package.json:31・50](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/package.json#L27-L50) も、試験コマンドと Vitest の指定に一致します。

7. **CHANGELOG の案内: 版表示の確認方法に Low。** 検出範囲が実際の子 scanner で決まること、新しい親と古い子では検出が効かないことを明示した修正は適切です。ただし、package の版と実行中のビルドは一致しない場合があるため、前掲の文書指摘どおり、`--version` を旧 `dist/` の判別手段とする説明を訂正してください。

### 問い3: 固定コードとの照合

**主要な変更位置、allow の記録、パーサ・履歴の連動、review-packet を変えない理由に指摘なし。** 設計が挙げた主要コードの行参照は、基準 commit の該当処理と一致しています。ADR-0034 の参照箇所については、以下の位置の補足があります。

**既存テスト・fixture・生成物の変更一覧**

§8-2・§8-3 と依頼文の検索結果を照合し、今回確認した範囲で、新たな変更対象の漏れは見つかりませんでした。

| 対象 | 照合結果 |
|---|---|
| `tests/parse-security.test.ts` の counts と不正な件数行 | 73行目の `SECURITY_ZERO` に `rawChars: 0` が必要です。96・98・99・100行目の内訳を6分類へ更新する計画も正しく、特に98・99行目は、単なる内訳数不一致だけで通過して元の検証目的を失うことを防ぎます。97行目の JSON 例は変更不要です。[固定コード](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tests/parse-security.test.ts#L73-L102) |
| 同ファイルの表示の完全一致 | 120行目の `parsed:` の期待に新しい内訳が必要です。118行目の counts は部分一致なので、その期待の変更は不要です。[固定コード](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tests/parse-security.test.ts#L114-L123) |
| `security-self.stdout.txt` | 現在は情報行が7行目、件数行が12行目です。7行目の後ろに情報を1行追加する設計なら、件数行は13行目になります。実装後の出力で取り直す計画は妥当です。[固定 fixture](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tests/fixtures/parse/security-self.stdout.txt#L5-L14) |
| JSON Schema と schema 試験 | allow の分類を生成物へ追加し、生成結果との一致を検査する試験自体は維持する計画で合います。[生成物の分類](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/schema/aiqh.config.schema.json#L130-L147)、[一致試験](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tests/schema.test.ts#L15) |
| §8-3 の14テスト | 出力境界・JSON キーの試験は、追加 finding の件数を厳密に固定していません。既存履歴は `rawChars` を持たない状態を保てます。LF・TAB のパス名、走査前に例外を投げる CLI、既存の走査統計・秘密分類、75文字を対象とする本体の再発防止試験についても、期待を維持できるという説明に指摘なしです。 |

検索語11項目の該当ファイル一覧と、数から11文字を組み立てる候補28ファイルも、固定コードの静的検索と一致しました。後者と scanner 関連語の単純な積集合には `history-html.test.ts` も入りますが、そこでは履歴の tool 名として使われています。実際に scanner を使う4試験を取り出す §8-3 の整理は妥当です。

**パーサ・履歴・HTML の連動**

[security-scan パーサの KINDS と COUNT_KEYS](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/parse/security-scan.ts#L16-L56) は同じ定義から内訳の数・順序・合計と出力キーを決めています。新分類の追加によって古い5内訳を拒否し、`rawChars` がキー一覧へ加わる設計は整合します。[履歴の読み込み](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/run-history/read.ts#L344-L352) は存在するキーだけを保持し、[集計](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/run-history/aggregate.ts#L257-L285) は値がない run を `unknownRuns`、その日に値がなければ `null` とします。古い run の欠落値を0へ補わない説明も正しいです。[HTML の数値対応表](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/run-history/html.ts#L52-L57) と [系列の描画](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/run-history/html.ts#L189-L197) は汎用的な構造で、新系列に固有の分岐を足さない見込みと一致します。

**ADR-0034 の、動く参照と動かない参照**

依頼文と設計 §9 が「E」と呼ぶ `src/parse/security-scan.ts:24` の参照は、固定文書では **C.5 の66行目**にあります。問いへの回答として、更新確認の対象を次のように整理します。U11 の「実装で動いた行へ合わせる」という方針は、そのままで十分です。[ADR-0034 C.5](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/docs/adr/0034-history-aggregate-without-database.md#L60-L66)、[同 E](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/docs/adr/0034-history-aggregate-without-database.md#L75-L83)。

| 参照の場所 | 現在の参照先 | 今回の設計に基づく見込み |
|---|---|---|
| C.5 | `src/parse/security-scan.ts:24` | KINDS に1行追加するだけなら25行目へ移動。最終行番号は実装後に確定する |
| 同じ C.5 の箇条書き | `src/parse/read.ts:24`、`vitest.ts:19`、`eslint.ts:68`、`npm-audit.ts:12`、`src/run-history/read.ts:347` | 現設計では各コードを変更しないため維持 |
| E | `src/run-history/aggregate.ts:243・249・277・273` | 現設計では aggregate.ts を変更しないため、いずれも維持 |

**review-packet の不変性**

指摘なし。[packet.ts:462–480](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/review/packet.ts#L462-L480) は、75文字の raw 検査結果を直接 finding にし、これとは別に `scanString` の結果だけへ allow を照合します。後者は oversized-candidate 以外を secret として扱うため、raw 検査を共通の `FileScanSink` へ入れると、重複と誤った分類を持ち込むという設計 §7 の説明は正しいです。`scanFile` 側だけへ追加する方針と T12・T13 は、この境界を固定する計画として適切です。[scanString の現行経路](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/security/scan.ts#L288-L296)、[パケット全体の再検査](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/review/packet.ts#L991-L997) も照合しました。

### 確認範囲と未確認範囲

**依頼文の固定URL42ファイルは、指定 SHA の GitHub 公式アーカイブから取得してすべて読み、設計の参照箇所を照合しました。読めなかった指定ファイルはありません。**

| 依頼文の区分 | 確認した数 |
|---|---:|
| A: R1 の未確認範囲に挙がったコード | 11 |
| B: 期待値が変わるテスト・fixture・生成物 | 4 |
| C: 期待値を維持する見込みのテスト | 14 |
| D: ADR | 2 |
| E: R2 が新しく参照したファイル | 11 |
| 合計 | 42 |

追加で `src/cli.ts`、`src/cli-program.ts`、`package.json`、`tsconfig.build.json`、`src/runner/run-checks.ts`、`src/commands/review-packet.ts`、既存の allow 回帰テストの必要箇所も確認しました。添付の依頼文と対象3文書も全文確認しています。

以下は未確認です。

- 項目48の実装コード、新規 T1〜T14 と追加ケースの実際の結果。まだ実装前であり、対象コード・テストはこのレビューでは実行していません。
- 旧 worktree へ完成したテストをコピーした際の読込みとケース別の FAIL / PASS。記載された Vitest の予備実測も独立には再実行していません。
- 生の対象文字を含むファイル名の macOS・CI 上の列挙、gitlink fixture の実作成、長い行の重なり、追加走査の性能の実測。
- 新旧の親子や旧 `dist/` を組み合わせた実プロセスの結果、CI 実環境での PATH 解決の実測。これらに関する判断は固定コードの読解によります。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "item48-design",
  "round": 2,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 1
  },
  "findings": [
    {
      "id": "I48-D-R2-001",
      "severity": "Low",
      "kind": "文書",
      "target": "設計 §6-4「手元」「版を上げるときの案内」・§9 の CHANGELOG 下書き、応答の I48-D-R1-001 の対応",
      "content": "旧 `dist/` の判別を `aiqh --version` に頼る説明が、実コードと合いません。設計は、親も子も旧 `dist/` で動く場合を「`aiqh --version` でしか分からない」とし、応答も版表示での確認を案内しています。しかし、ソースと `package.json` を更新した後に旧 `dist/` が残っていれば、新しい版の番号を表示しながら旧 scanner で動く場合があります。",
      "evidence": "[src/cli.ts:19–27](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/cli.ts#L19-L27) は、実行時に隣接する `package.json` の `version` を読みます。その値は同ファイル147行目で渡され、[src/cli-program.ts:51–54](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/src/cli-program.ts#L51-L54) で版表示に使われます。[package.json:19–28](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/package.json#L19-L28) の `bin` は `dist/cli.js` で、build は TypeScript のコンパイルです。[tsconfig.build.json](https://github.com/youhei-dev/ai-quality-harness/blob/8870afbf1bf65282f12bba39086d661c88d70851/tsconfig.build.json) も `src` から `dist` へ出力する構成です。したがって、版表示は読み込まれたビルドの新しさを証明しません。親子とも旧コードなら、旧パーサと旧出力が一致して `unexpected-summary` も出ないという設計の説明と組み合わさり、両方の確認を通過し得ます。これは固定コードから導ける反例で、旧ビルドを使った実行再現はしていません。再ビルドの必要性は既に明記されているため、検出設計を妨げない文書上の問題として扱います。",
      "fix": "`--version` は package の版を確認する情報であり、`dist/` の更新を証明するものではないと訂正してください。更新後の `npm run build` の案内は維持し、実際の security check と同じ起動経路で、`raw characters checked:` の情報行と `raw characters` を含む6内訳の件数行が出ることも確認する案内にしてください。設計 §6-4・§9 と応答の説明をそろえてください。",
      "confidence": "確認済み"
    }
  ],
  "previous": [
    {
      "id": "I48-D-R1-001",
      "assessment": "解消。設計 §6-4・§9、ADR の決定10・代替案・影響、応答で、パース失敗が判定を変えない P1 と、検出範囲が実際の子 scanner の版で決まることを分離しています。新しい verify と古い子では検出が効かないと表にも明記し、実際に呼ぶ版・commit をそろえる案内を追加しています。H8 と P1 は維持されています。新たに加えた版表示での確認方法の誤りは、今回の文書指摘として扱います。"
    },
    {
      "id": "I48-D-R1-002",
      "assessment": "解消。設計 §5-2 と ADR の決定8は、分類の明示を候補規則ごとの条件に置き、先頭の分類なし規則を採ってから棄却する実装を除外しています。T8a〜T8f と §5-4 は、規則の順序・パス不一致・期限切れ・秘密との混在・直接呼出し・使用回数を区別して固定する計画です。"
    },
    {
      "id": "I48-D-R1-003",
      "assessment": "解消。設計 §3-4 と ADR の決定5は、追跡・未追跡両ループの各パスで、内容を読むかどうかの分岐より先に名前を検査すると指定しています。T7a〜T7g は、内容を読まない五種類、未追跡通常ファイル、ignore 除外をそれぞれ確かめます。"
    },
    {
      "id": "I48-D-R1-004",
      "assessment": "解消。T5 の ignore 例を未追跡と明示し、三ケースを別の it に分けています。今回の検出・除外に対する旧版の見込みを FAIL / PASS / PASS とした修正は、基準コードの列挙と未追跡 .env の処理に合っています。"
    },
    {
      "id": "I48-D-R1-005",
      "assessment": "解消。設計 §11 と ADR の既知の限界は、閉じた並びを無害とせず、始まりと終わりの対応だけでは安全と判断できないことを明記しています。出現を検出し、意図した利用を明示的な allow で扱う方針も維持されています。"
    }
  ]
}
```
