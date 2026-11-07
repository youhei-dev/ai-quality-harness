# ADR-0026・ADR-0027 の追記の案（最終。v0.18.2: 取り込みの前に止める 2 つ）

対象:
- `docs/adr/0026-review-import-json-block-fail-closed.md` の末尾に足す節（下の「ADR-0026 の追記」）。日付の行に「追記: 2026-11-xx（v0.18.2。`--id-prefix` の形と round 1 の `previous`）」
- `docs/adr/0027-review-check-state-and-loop.md:33`（「回 1 の `previous` は空でなければならない」）の下に注記 1 行（下の「ADR-0027 の注記」）

B4-D-Q8・B4-D-Q9 = A（確定）。B4-Q2 は、1c を使い方の誤りにする形に決め直した。**R1 からの変更**: 決定 2 に `Problem` の種類と CLI の出力の経路、再取り込みを足した。「互換性の変更」の節を足した（R1 の問い 5・7）。

---

## ADR-0026 の追記（v0.18.2: 取り込みの前に止める 2 つ。batch4 の 1a・1c）

### 文脈【実測。2026-11-07、使い捨ての `--cwd` で】

- 指摘が 0 件の原文を `--id-prefix TRIAL-R1`（ID の `-R<回>` まで含めた誤り）で取り込むと、exit 0 で `findings-r1.json` が書かれ、`idPrefix` が誤ったまま残る。誤りは、次の回を正しい接頭辞で取り込むとき（前の回の接頭辞が違う、で exit 2）まで分からない
- 指摘がある原文では、今も `[id] findings[0].id is not of the form B3-D-R2-R2-NNN` で止まる（何も書かない）
- round 1 の原文の JSON に、別のラベルの ID（例 `B3-D-R2-001`）を `previous` に書くと、exit 0 で書かれ、`REVIEW LOOP: unknown`。続く `aiqh review-check` は exit 2（`[previous] findings-r1.json has 1 previous entry (there is no round 0)`）。書かれたファイルを通す道は、レビュアーの評価（`previous`）を消すことしか無い
- 今ある記録（19 ラベル・27 の findings のファイル）に、round 1 で `previous` を持つもの、`-R<数字>` で終わる接頭辞は無い

### 決定

1. **`--id-prefix` が `-R` と数字で終わるときは、使い方の誤り（exit 2。ADR-0021）**。文: `--id-prefix is the part of the ID before -R<round> (for an ID B3-D-R1-001 it is B3-D); it must not end with -R<n>`。`--help` の `--id-prefix` の説明にも「`-R<round>` を含めない」を足す。形の規則（`ID_PREFIX_PATTERN`）そのものは変えない。review-check と、すでにあるファイルの読み方は変えない
2. **round 1 の原文の JSON に、空でない `previous` があるときは取り込まない**（exit 2、何も書かない）
   - 原文の検査（`readReview`）の問題の一覧に入れて、ほかの形の問題と一緒に出す。検査は JSON の形の検査（schema）を通った後で、`round` が 1 かつ `previous` の長さが 0 より大きいときだけ
   - `Problem` の種類の型に `previous` を足す。CLI は、ほかの問題と同じ経路で `[previous]` として出す
   - `previous` が無い・空の配列は、今までどおり通す。round 2 以上の検査は変えない
   - 同じ原文の再取り込み（SHA が同じなら、原文の検査の前に exit 0 で何も書かない）は変えない。この検査は、過去に取り込んだファイルには当たらない
   - ADR-0027 の「回 1 の `previous` は空」を、取り込みの前にも当てる
3. 別のラベル（設計のレビューなど）の指摘への評価は、本文の問いの答えに書いてもらう（JSON の `previous` には入れない）。依頼文のひな形と手順書に書く（v0.18.1 の docs）

### 互換性の変更（R1 の問い 7）

- 今まで exit 0 で書かれていた原文・指定のうち、次の 2 つが exit 2 で何も書かれなくなる（fail closed の向き）: (a) 指摘が 0 件で、`--id-prefix` が `-R<数字>` で終わる指定、(b) round 1 の JSON に空でない `previous` がある原文
- README の review-import の節、`--help`（1c）、CHANGELOG に書く
- ほかの原文の取り込みと、review-check の結果は変わらない

### 既知の限界

- `-R` と数字で終わる接頭辞（例 `M2-R1`）は、これから使えない
- round 1 で別のラベルの評価を機械で読める形に残す道は、まだ無い（label をまたぐ `previous` は review-import v3 の候補。ADR-0027 の「v3 へ」）

---

## ADR-0027 の注記（`:33` の下）

- 注記（v0.18.2）: review-import も、round 1 の空でない `previous` を取り込まない（ADR-0026 の追記〈v0.18.2〉の決定 2）。この ADR の決定は変えない
