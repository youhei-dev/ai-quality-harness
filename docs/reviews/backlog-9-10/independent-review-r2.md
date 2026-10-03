# independent review — backlog 9 / 10 R2

対象: `v0.5.24..v0.5.25`

レビュー方法: 添付 ZIP を展開し、Request、Previous Reviews、Diff、変更後全文、ADR-0020、response-r1、ROADMAP、関連する構造ガード、追加テスト、Documents にある `src/` 全37ファイルを静的に読んで判断した。依頼どおり、対象コード・fixture・テストは実行していない。

整合性確認:

- ZIP: **1,249,767 bytes** / SHA-256 `2ba592f7aa5872f1f79d723194035c0c18d2a98477a8df2784b73902ae879482` — 依頼文と一致。
- 内部 Markdown: **1,249,605 bytes / 15,272 lines** / SHA-256 `5f01d60c1d17a90342ea049168d50880b5df4592c9d5a1217bd932d06eb4df90` — 依頼文と一致。

## 1. 結論

### 前回 BACKLOG-9-10-R1-001〜004

- **BACKLOG-9-10-R1-001: 部分的に解消**
- **BACKLOG-9-10-R1-002: 解消**
- **BACKLOG-9-10-R1-003: 解消**
- **BACKLOG-9-10-R1-004: 解消**

R1-001 は、`writev` / `writevSync` の追加と FileHandle の入口側確認は妥当だが、`createWriteStream(...).write()` / `.end()` は依然として「不注意で書ける形」のまま残るため、解消とはしない。ADR-0020 はこの点を正直に既知の限界として記述しているが、Request の分類規則では、これは (i) ではなく、また現 `src/` 0 か所なので狭く塞ぐ規則を入れても現在の `src/` は壊れない。したがって、前回 High の一部が carry-over している。

### 新しい指摘

- **High: 1件**
- **Medium: 0件**
- **Low: 1件**

新規 High は、今回追加された `NOT_CONTENT` の `truncate` / `ftruncate` の分類にある。テスト自身が「延長時は NUL bytes を埋める」と書いている一方、禁止文字集合は U+0000 を含む。つまり、この API は「利用者の text を書かない」だけで、**禁止文字を生のままファイルへ作らない**わけではない。

現在の `src/` 37ファイルには `truncate` / `ftruncate` の利用は 0 か所で、現行 CLI に直ちに残る漏れではない。しかし、この一覧テストは将来の不注意を見せることが目的なので、この分類のままだと普通に追加した `truncate(path, largerSize)` が表にも出ず、生の NUL を作り得る。

Low は docs の件数表現で、v0.5.25 では新しい回帰テストが `executeCommand(..., env)` を実際に1 call site 持つのに、ADR / CHANGELOG / ROADMAP / response が「`src/`・`tests/` に 0 か所」と現在形で書いている点である。これは安全性の漏れではない。

この回が上限であるため、3回目レビューは不要。最終修正として、R1-001 の stream の扱いと R2-001 の `truncate` / `ftruncate` を表・規則へ反映し、R2-002 の docs 件数だけ直すのがよい。

---

## 2. R1-001〜004 の判定

### BACKLOG-9-10-R1-001 — **部分的に解消**

#### 解消した部分

`tests/file-write-sites.test.ts:27-41` の `FS_WRITERS` に、

- `writev`
- `writevSync`
- `cp`

が追加され、内容引数の位置も関数ごとに持つようになった。

`writev` / `writevSync` は第2引数の buffers 配列を content として記録する (`:137-138`)。

FileHandle についても、新しい fixture が `node:fs/promises` の `open()` を通る形を作り、output guard が module allowlist 違反を返すことを確認する構造になっている (`:217-220`)。現在の構造ガード全文を読む限り、`node:fs/promises` は `BUILTIN_ALLOWED` 外で、`{ promises }` 等の入口も別規則で閉じられている。

したがって、R1-001 のうち **writev 系と FileHandle の direct entrance** は解消と判断する。

#### 残る部分

`tests/file-write-sites.test.ts:211-215` は、`createWriteStream()` の call は見えるが、その戻り値の `.write()` / `.end()` は見えないことを明示的に固定している。

ADR-0020 も「stream は塞がれていない」と既知の限界にした。

これは前回 R1-001 の一部そのものであり、型偽装や意図的回避を必要としない。普通に file stream を使うだけで成立する。

現 `src/` では `createWriteStream` / file stream `.write()` は **0か所**。

ただし、現在の `src/` で 0 か所なら、最も狭い規則として `createWriteStream` 自体を `src/` で禁止するだけでも現在の正当コードは壊れない。そのため、「塞ぐと普通の `src/` を壊すので (ii)」とも言いにくい。

よって R1-001 は **部分的に解消**。

**確信の度合い: 高。**

---

### BACKLOG-9-10-R1-002 — **解消**

前回問題だった `GATE` の source-text 正規表現は削除された。

新テストは、

- file
- owner
- writer
- content expression の **exact source text**

を `KNOWN` と照合するだけであり、「この expression に gate 名が入っているから安全」とは判断しない。

さらに fixture で、

- 部分だけ gate した expression
- 別行で gate した variable

をどちらも単なる source text として記録し、テスト自身が安全判定をしないことを固定している (`tests/file-write-sites.test.ts:205-209`)。

ADR-0020 も、「gate は author の記述で、このテストは変換が全 content を覆うことを保証しない」と明記した。

`createWriteStream` / copy の第2引数を content と誤認する問題も、`FS_WRITERS` の値を `number | null` にしたことで解消している。

**確信の度合い: 高。**

---

### BACKLOG-9-10-R1-003 — **解消**

コードを変えず docs へ既知の限界として記録する、という前回の修正提案に沿っている。

ADR-0020 は、

- Markdown の `\u{HEX}` は display notation
- 元から同じ literal string があった場合と区別できない
- 元データの忠実な確認は JSON を使う

と明記している。

前回指摘は「生の禁止文字が残る」問題ではなく display ambiguity の Low だったため、この対応で十分。

**確信の度合い: 高。**

---

### BACKLOG-9-10-R1-004 — **解消**

`src/runner/execute.ts:114` は、

`env: checkEnv(options.env ?? process.env)`

となり、`options.env` を渡しても必ず `checkEnv()` を通る。

`ExecuteOptions.env` のコメントも「caller environment / base of check environment」と意味を明示した (`src/runner/execute.ts:15-16`)。

`checkEnv()` は parent を shallow copy し、

- `NO_COLOR = "1"`
- `FORCE_COLOR` delete
- `PY_COLORS` delete

として元 object を mutate しない。

したがって、前回の bypass branch は解消。

新しい regression test も `env` を渡す call を持つため、今後この branch を戻す変更は見えやすくなった。

**確信の度合い: 高。**

---

## 3. 特に見てほしい点 1〜6

1. **R1-001〜004 の解消** — **指摘あり（R1-001 は部分的に解消。R1-002〜004 は解消。新規 BACKLOG-9-10-R2-001 あり）**
2. **書き込み箇所のテストの主張・表・writev・種別** — **指摘あり（BACKLOG-9-10-R2-001）**
3. **stream / FileHandle の限界と分類** — **指摘あり（BACKLOG-9-10-R1-001 の carry-over。stream は不注意で書ける形のまま）**
4. **`checkEnv(options.env ?? process.env)`** — **指摘あり（BACKLOG-9-10-R2-002。実装は問題なし、docs の「tests 0件」が不正確）**
5. **ADR-0020 / response-r1 / CHANGELOG / ROADMAP / 前回原文** — **指摘あり（BACKLOG-9-10-R2-001, BACKLOG-9-10-R2-002）**
6. **v0.5.23 golden fixture を採らなかった判断** — **指摘なし**

---

## 4. 新しい指摘

## BACKLOG-9-10-R2-001

- **重大度: High**
- **分類: 不注意で書ける形**
- **分類の根拠:** `truncate()` / `ftruncate()` でファイルを拡張することは普通のファイル操作であり、型偽装やガード回避を必要としない。
- **確信の度合い: 高**
- **場所:**
  - `tests/file-write-sites.test.ts:43-50`
  - 特に `:46`
  - `src/security/raw-chars.ts:17-25`
  - ADR-0020 決定7と既知の限界
- **差分内 / 差分外:** **差分内**。今回 v0.5.25 で新しく導入された `NOT_CONTENT` 分類と ADR の説明。
- **`src/` 実在:** **0か所**。Documents の `src/` 全37ファイルに fs の `truncate` / `truncateSync` / `ftruncate` / `ftruncateSync` call は無い。

### 内容

新しい `NOT_CONTENT` は、

`truncate / truncateSync / ftruncate / ftruncateSync`

を、

> cuts a file or extends it with NUL bytes; the text of the caller is not written

として、書き込み箇所の scan 対象から除外している (`tests/file-write-sites.test.ts:46`)。

しかし backlog 9 の安全条件は、「caller の text がそのまま書かれるか」ではなく、あとで開かれる対象ファイルへ **禁止文字が生のまま残るか**である。

`src/security/raw-chars.ts:18-20` では U+0000 が禁止集合に入っている。

テスト自身が認識しているとおり、truncate 系はファイルを大きくするとき **NUL bytes** を作る。テキストファイルとして読めば、その raw NUL は U+0000 に相当し、backlog 9 が避けたい禁止文字そのものになる。

したがって「caller の text を書かない」ことは、`NOT_CONTENT` として inventory 外へ出す十分な理由ではない。

### ファイルに残る根拠

将来、実装 AI が text report や generated file に対して現在長より大きい size で truncate 系を使えば、拡張領域は NUL bytes になる。

その call は `FS_WRITERS` に無いため `observe()` が site として記録せず、KNOWN table の差分にもならない。

つまり、新しい file mutation を普通に追加しても、この future-safety test が見せないまま raw forbidden byte を作れる。

### 同じ系統がほかに残っているか

少なくとも `truncate` / `truncateSync` / `ftruncate` / `ftruncateSync` の4形は同じ。

より一般には、「caller の text argument を取らないが、結果として forbidden byte を新しく生成する file operation」を `not-content` として除外する場合に同じ問題が起こる。

`rename` / `link` / `symlink` / `mkdir` / `rm` / `unlink` / `open` は、この具体的な NUL 生成とは性質が異なるため、本指摘ではまとめて違反とはしない。

### 修正案

truncate 系を単純な `NOT_CONTENT` から外す。

現在の `src/` では0か所なので、最も安全で簡単なのは、

- file-write inventory で truncate 系も site として見せる
- または構造規則で `src/` から禁止する

のどちらか。

もし「binary / preallocation 用途は将来許したい」なら、その時点で対象 file と目的を表に明示し、人間レビューする方が backlog 9 の思想に合う。

---

## BACKLOG-9-10-R2-002

- **重大度: Low**
- **分類: 不注意で書ける形**
- **分類の根拠:** 修正前の call-site 件数を、その call site を追加する回帰テストを含む v0.5.25 の現状件数として docs に残した bookkeeping error。
- **確信の度合い: 高**
- **場所:**
  - `tests/regression-backlog10-r1-004-options-env.test.ts:23-27`
  - ADR-0020 決定8
  - CHANGELOG v0.5.25
  - ROADMAP v0.5.25
  - `docs/reviews/backlog-9-10/response-r1.md` M4
- **差分内 / 差分外:** **差分内**。新しい regression test と今回更新した docs の食い違い。
- **`src/` 実在:** production `src/` では `options.env` を渡す caller は **0か所**。`tests/` には **1 call site**ある。

### 内容

ADR / CHANGELOG / ROADMAP / response は、

> `options.env` を渡す呼び出しは `src/`・`tests/` に 0 か所

と書いている。

しかし同じ v0.5.25 で追加された `tests/regression-backlog10-r1-004-options-env.test.ts:26` は、

`executeCommand({ ..., env })`

を明示的に呼んでいる。

テストケースは複数あるが source 上の call site は `probe()` 内の1か所。

おそらく「修正を入れる前の既存 caller が0」という M4 の測定結果を、その後 regression test を追加した後も現在形の件数として残したものだと読める。

### ファイル / 端末への到達

**安全性の漏れはない。**

この指摘は docs / bookkeeping の不一致のみ。`executeCommand()` 自体は `checkEnv(options.env ?? process.env)` なので、回帰テストの caller も sanitize される。

### 同じ系統

CHANGELOG、ROADMAP、ADR-0020、response-r1 に同じ「src/tests 0」の表現が複製されている。

### 修正案

次のどちらかに統一する。

- 「修正前の既存 caller は `src/` 0 / `tests/` 0」
- 「v0.5.25 現在は `src/` 0、回帰テストに1 call site」

後者の方が現在状態の記録として分かりやすい。

---

## 5. 書き込み箇所テストの評価

### 改善された点

前回 R1-002 の原因だった「gate function 名の regex」を完全に捨てたのは正しい。

現テストの主張はかなり狭くなっており、

> 列挙した fs function の call が増減した、または content expression の source text が変わったら見える

という範囲ではコードと合う。

`differences()` は multiset 的に数えるため、同じ key の call が1件増えた場合も検出する (`tests/file-write-sites.test.ts:107-118, 247-248`)。

content argument index も、

- writeFile / appendFile / write / writeSync / writev → 1
- createWriteStream / copy / cp → null

と区別しており、R1-002 の「第2引数は常に content」という誤りは消えている。

### 過大な箇所

`NOT_CONTENT` の `truncate` 系だけは、「caller text ではない」という観点に寄りすぎている。backlog 9 の forbidden-character invariant では、生成される NUL bytes も見る必要がある。

またテスト先頭コメントの、

> any fs function that is not listed (the reason of each is in NOT_CONTENT)

は、文字どおりにはやや強すぎる。`NOT_CONTENT` は「Node fs の全ての未列挙 function」の完全な一覧ではなく、この作業で分類した mutating functions の一部である。

ただし、この文言だけを別 finding には数えず、R2-001 の docs 修正に含めれば十分と考える。

---

## 6. stream / FileHandle

### stream

`createWriteStream("out.txt").write(raw)` / `.end(raw)` は current rule では見えず、output guard でも禁止されない。

これは ADR に正確に書かれている。

問題は分類である。

これは、

- 実装 AI が普通に選べる
- 現 `src/` 0
- 型偽装不要
- raw data がそのまま file stream へ行く

ため、依然として **不注意で書ける形**。

今回の Request のルールでは、これを (i) に分類して終えることはできない。

また `src/` に createWriteStream が0なら、「createWriteStream を src で禁止」という狭い規則は現在の正当コードを壊さないため、現状の証拠だけでは (ii) とする必要もない。

したがって R1-001 は部分解消とした。

### FileHandle

今回の packet 内の current output guard を読む限り、`node:fs/promises` は allowlist 外。

さらに fs の `promises` bundle 入口も既存規則が閉じている。

したがって、今回 fixture にした direct `node:fs/promises` の FileHandle については、「inventory には見えないが入口側で塞がれる」という説明でよい。

---

## 7. `checkEnv(options.env ?? process.env)`

実装自体に新しい問題は見つけなかった。

`options.env` の意味を「完成した child environment」から「parent/base environment」へ変えたが、

- production `src/` caller は0
- new regression test はこの新しい contract を明示的に使う
- `checkEnv()` は input object を mutation せず copy する

ため、現 `src/` との互換問題はない。

バックログ6で environment をさらに最小化するときも、「executeCommand の child env は常に checkEnv を通る」という形になったので、R1-004 より一貫している。

Low の R2-002 は件数記述だけであり、この実装判定には影響しない。

---

## 8. Previous Reviews の原文

Previous Reviews 節と、変更ファイルとして収録された `docs/reviews/backlog-9-10/independent-review-r1.md` を比較した。

レビュー本文は一致している。

packet の Previous Reviews 側には section container の closing fence が末尾に付くため raw substring としては数文字差があるが、保存された review file 本体の内容は response-r1 が記録する SHA-256 `32668ce5d6dee8145a692fa57e2eeb1429995c74eff0e06e56871b4dde15ed53` と一致しており、前回レビュー本文が編集された形は確認しなかった。

---

## 9. v0.5.23 golden fixture を採らなかった判断

**採らなかったことを今回の defect とはしない。**

前回もこれは finding ではなく強化提案だった。

今回の差分は主に、

- write-site inventory
- checkEnv bypass

の修正であり、report renderer / writer 自体は変えていない。

そのため、v0.5.23 golden fixture をこの修正版へ必須条件として追加しなかった判断は許容できる。

ただし、「通常 report が過去版と byte-for-byte 同じ」を今後も release contract として強く主張し続けるなら、静的説明やその時点の比較記録より、固定 golden fixture の方が長期的には強い。将来 backlog として追加する価値はある。

---

## 10. 新しい指摘の件数

| 分類 | High | Medium | Low | 合計 |
|---|---:|---:|---:|---:|
| **不注意で書ける形** | **1** | 0 | **1** | **2** |
| **(i) 意図的な偽装が要る形** | 0 | 0 | 0 | 0 |
| **(ii) 塞ぐと `src/` の正当なコードや普通の書き方まで壊れる形** | 0 | 0 | 0 | 0 |
| **(iii) 実際にはファイルにも端末にも生の禁止文字が残らない誤検出・過剰な変換** | 0 | 0 | 0 | 0 |
| **合計** | **1** | **0** | **1** | **2** |

注意: これは **新規 R2 finding の件数**。これとは別に、前回 R1-001 の stream 部分が High の carry-over として部分的に未解消。

---

## 11. 良い点

- R1-002 の regex gate 判定を捨て、「inventory と安全性判定を分離」したのは正しい。
- exact content expression と call count の両方を見るため、同じ箇所の式変更と duplicate call の追加が見える。
- `writev` / `writevSync` の buffers の位置を明示し、copy / stream creation を content argument と誤認しなくなった。
- FileHandle を inventory 側で無理に追わず、既存 output guard の入口制約との役割分担を明示した点は理解しやすい。
- R1-003 の Markdown ambiguity を「JSON は忠実、Markdown は display-safe」と docs に分けたのは適切。
- R1-004 の修正は小さく、今後の backlog 6 の environment hardening とも整合する。
- 前回レビュー本文は保持されている。

---

## 12. 未確認・読み切らなかった範囲

1. **対象コード・fixture・テストは一切実行していない。** 依頼どおり静的読解のみ。
2. Request、Previous Reviews、11変更ファイルの Diff、変更後 `tests/file-write-sites.test.ts`、新しい `options.env` regression、`src/runner/execute.ts`、ADR-0020、response-r1、ROADMAP、関連 output guard、Documents の `src/` 全37ファイルの file-write / environment 関連箇所を確認した。
3. `src/` 全37ファイルについて、fs write / truncate / stream / FileHandle / executeCommand env の利用を横断確認したが、backlog 9/10 と無関係な業務ロジックを全行別目的でレビューしたわけではない。
4. `@types/node` の宣言全文は packet には無い。今回の R2-001 は、外部宣言に依存せず、新テスト自身が truncate の「extends it with NUL bytes」と明記していることと、`FORBIDDEN_RANGES` が U+0000 を含むことから判断した。
5. 実測数値（1,355/1,387 tests、M1〜M5）は実装側の記録として読んだだけで、結論の根拠にはしていない。
6. actual filesystem で truncate を実行して NUL を確認してはいない。今回の依頼条件に従い実行せず、packet の own description と禁止集合のコードから判断した。

---

## 最終判断

**R1-002・R1-003・R1-004 は解消。R1-001 は部分的に解消。**

v0.5.25 の差分は前回より大幅に改善されており、現在の `src/` に生の禁止文字が残る report/config write は依然として確認されない。

ただし最終版としては、次の2点を直して閉じるのがよい。

1. **R2-001 (High)**: `truncate` / `ftruncate` を `NOT_CONTENT` のまま inventory 外へ置かない。NUL 生成を forbidden-character invariant の対象として扱う。
2. **R1-001 carry-over**: stream `.write()` / `.end()` は「不注意で書ける形」のままなので、少なくとも現 `src/` 0 の `createWriteStream` を禁止するか、将来 write site として必ず見える規則へする。
3. **R2-002 (Low)**: docs の `src/tests 0` を、現在状態に合わせて `src 0 / regression test 1 call site` 等へ直す。

この回が上限なので、**3回目レビューは不要**。上の修正を最終 patch として入れ、自己 verify / regression で閉じるのが妥当。
