# ADR-0029: key-value の誤検出を、何と呼び、どこに・どの形で記録し続けるか（定義だけ。実装しない）

- 状態: 採用（定義だけ。M2-2 の残りの「key-value 誤検出の継続記録」〈ROADMAP の項目 15、出典は `docs/reports/M2-0_COMPLETION.md` の 81 行目〉。実装は人間の決定 P7 によりしない。ADR-0010・0012 の key-value の走査の方針は変えない）
- 日付: 2026-10-14（v0.8.0）。注記: 2026-10-18（v0.11.0。決定 3 の最後の項。ADR-0034）

## 文脈
- key-value の分類（`password=…`・`api_key: "…"` などの値）は誤検出が多いので、M1 では mask 専用だった。M2-0 で走査の対象にしたが、値が秘密らしい（`looksLikeSecretValue`）ときだけ finding にし、残る誤検出は `security.allow` で抑える方針にした（ADR-0010 の §6、ADR-0012）
- M2-0 の完了のときに「key-value 誤検出の継続記録」を後の作業として残した。いま、何を誤検出と呼ぶか、どこに記録するかが決まっていない。記録が無いと、パターンや判定の関数を見直す根拠（どの形が何回起きたか）が集まらない
- v0.8.0 で、verify のレポートの security の check に、`security.allow` で許したもの・使われたルールが項目として入るようになった（ADR-0028 の Q2）。数える材料はレポートに残る
- 人間の決定 P7: 定義を ADR に書くだけ。実装しない

## 決定（定義）
1. **「key-value の誤検出」と呼ぶもの**: `aiqh security-scan` の finding のうち、**分類が `key-value`** で、**人が確かめて秘密ではないと判断したもの**（例: 文書の例示の値、テストの固定値、識別子・ハッシュ値、プレースホルダ）。次のものは含めない（別の扱い）:
   - ほかの分類（aws・github など）の誤検出
   - mask 専用の分類（bearer・basic）がレポートで値を伏せすぎること（走査の finding ではない）
   - aiqh の外の道具（push の前の走査など）の誤検出
   - oversized-candidate（候補が長すぎて調べきれなかったもの。誤検出かどうかは分からない）
2. **扱いの順**（記録はどの場合も行う）:
   1. 値を書き換えられるなら書き換える（テストの値は実行時に組み立てる。`tests/helpers.ts` の `fake()` の作法）
   2. 書き換えられなければ `security.allow` で抑える: `path` はできるだけ狭く、`category: "key-value"`、できれば `line`。`reason` は次の書式で始める:
      `key-value false positive: <分類>: <理由>`（`<分類>` は `example`・`test-fixture`・`identifier`・`hash`・`placeholder`・`other` のどれか）
   3. パターンや `looksLikeSecretValue` を変えるのは、下の見直しの契機に当たったときだけ。変えるときは ADR を足す
3. **記録の場所と形**:
   - **`security.allow` の `reason`**（上の書式）: 設定のファイルに残るので、抑えたものと理由が同じ場所にある。`aiqh security-scan` の端末の出力と、verify のレポートの `parsed.items`（`allowed`・`allow-rule-used`。ADR-0028）に毎回出る
   - **記録の表** `docs/ops/key-value-false-positives.md`: **最初の 1 件が起きたときに作る**（いまは作らない）。1 件 1 行で、列は 日付・リポジトリ（このリポジトリか、対象のリポジトリの架空の名前）・パス・分類・値の形（長さと文字の種類だけ。**値そのものは書かない**）・扱い（書き換え／allow／見直しの提案）・根拠（verify のレポートの commit か、レビューの ID）
   - 履歴の DB（M4）では、レポートの `allowed`・`allow-rule-used` の項目から、ルールごとの使われた回数を時系列で数える（M4 の設計の材料）
   - 注記（v0.11.0）: 決定 3 の最後の項（履歴の DB で、allow のルールごとの使われた回数を時系列で数える）は、そのとおりにはしない。M4 は DB を持たず（ADR-0034）、`aiqh history` は `parsed.items` の名前を出さないので、ルールを見分けられない。M4 では、security-scan の数（`suppressed`・`allowRulesUsed`・`expiredAllowRules`・`unusedAllowRules`）の日ごとの推移だけを出す。決定 4 の「1 つの allow のルールが 1 回の scan で 10 件以上を抑えたとき」は、`aiqh security-scan` の端末の出力か、その run の `latest.md` の Parsed Output で確かめる。決定 1〜5 の定義は変えない。（M4-D-R1-005。テストは `tests/history-aggregate.test.ts` の Q1 の数の推移と、`tests/history-cli.test.ts` の目印のテスト〈ルールの名前が端末・`--json`・エラーの文言に出ない〉）
4. **見直しの契機**: 同じ分類が 3 件（リポジトリをまたいで）に達したとき、または 1 つの allow のルールが 1 回の scan で 10 件以上を抑えたとき。そのときに、パターン・判定の関数を変える案を ADR で出す（人間の判断）
5. **秘密の値は記録に書かない**: 表にも `reason` にも、値・その一部・ハッシュを書かない（形だけ）。秘密だった場合は誤検出ではないので、記録せずに鍵を失効させる手順に移る

## 代替案
- **aiqh が誤検出を自動で記録する**（allow のたびに表に追記する、など）: 書き込みの経路が増え、何を誤検出と判断したかは人にしか分からない。P7 で実装しない
- **誤検出の記録を `security.allow` の `reason` だけにする**: 書き換えで直したもの（allow を使わないもの）が残らない。表と併用する
- **表をいま作る**: 0 件の表は記録ではない。最初の 1 件で作る

## 既知の限界
- 定義だけで、書式（`reason` の先頭の語）を守らせる仕組みは無い（スキーマは `reason` が空でないことしか見ない。ADR-0012）
- 誤検出の判断は人による。aiqh はその判断の正しさを確かめない
- verify のレポートに `allowed` などの項目が入るのは、security の check が `aiqh security-scan` のテキストの出力のときだけ（ADR-0028）

## 影響
- 文書だけ（この ADR）。`src/`・`tests/`・設定の仕様・スキーマは変えない
