# M0 / R5 独立レビュー R6 — Claude Code 修正依頼用

対象: `ai-quality-harness` M0 / R5  
レビュー資料: `review-packet-m0-r5.md`  
対象バージョン: `v0.1.5`（packet記載）  

## Claude Code への依頼

以下は R5 対応後の独立レビュー結果です。

各指摘について実コードを確認し、次のいずれかを判定してください。

- `VALID`: 指摘どおり問題がある
- `PARTIAL`: 一部のみ問題がある
- `INVALID`: 指摘は成立しない

`INVALID` / `PARTIAL` と判断する場合は、必ず実コード・テスト結果・仕様のいずれかを根拠として説明してください。

`VALID` の場合は、M0 の要求範囲を逸脱しない最小修正を行い、必要な回帰テストを追加してください。

今回の優先順位:

1. R6-001
2. R6-002
3. R6-003

---

## R6-001

- **ID:** R6-001
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/runner/run-checks.ts` — `tail()`
- **内容:** R5-004 で `OutputBuffer` の UTF-8 境界切断は修正されたが、最終レポート用の 64 KiB tail 処理には同じ問題が残っている。
- **根拠:** R5 の UTF-8 対応で変更されたのは `src/runner/execute.ts` の `OutputBuffer`。一方、`run-checks.ts` の `tail()` は依然として次の方式:
  - UTF-8 文字列を `Buffer.from(out, "utf8")`
  - `buf.subarray(buf.length - TAIL_BYTES)`
  - `.toString("utf8")`

  つまり任意 byte 位置で切断するため、マルチバイト文字の continuation byte から始まる可能性がある。
- **独立確認:** 同じロジックで `"あ"` を大量に並べ 64 KiB 境界で切断したところ、
  - 先頭に `U+FFFD (�)` が入る
  - 切断前の Buffer は 65,536 bytes でも、文字列化後に再エンコードすると 65,538 bytes になる

  ことを確認した。
- **影響:** 実行時の 10 MiB capture は UTF-8 safe でも、report に保存する 64 KiB tail で再び文字化け・byte上限超過が起こる。
- **修正案:**
  - UTF-8 safe な front trim を共通 helper に切り出し、`OutputBuffer` と `tail()` の両方で使用する。
  - 最小修正なら `tail()` でも byte trim 後、先頭が continuation byte (`0x80..0xBF`) の間は最大 3 bytes 追加で捨てる。
- **追加すべき回帰テスト:**
  - 64 KiB を超える `"あ"` 等の multibyte stdout
  - `tail.text` に `�` が含まれない
  - `Buffer.byteLength(tail.text, "utf8") <= TAIL_BYTES`
  - stream 最後の marker が保持される
  - stderr についても同等の guard を検討

---

## R6-002

- **ID:** R6-002
- **重要度:** Medium
- **種別:** ドキュメント
- **対象:** `CHANGELOG.md` — v0.1.0〜v0.1.4 の hash 表記
- **内容:** CHANGELOG の tag 横に記載された hash と、同じ review packet 内でその tag の commit として扱われている hash が一致しておらず、監査時に混乱する。
- **根拠:** packet 本文では R5 対象コミットを `37a5b50 = v0.1.4` としている。一方、CHANGELOG では `v0.1.4 — 4b7c943` と記載されている。
- **推測:** annotated tag を使用しているため、
  - `4b7c943` = tag object SHA
  - `37a5b50` = peeled commit SHA

  である可能性が高い。この場合 Git 上では両方正しいが、CHANGELOG 側に区別が書かれていない。
- **修正案:**
  - audit trail の主表記は peeled commit SHA に統一する。
  - 推奨形式:
    - `v0.1.4 — commit 37a5b50`
  - tag object も残すなら:
    - `v0.1.4 — commit 37a5b50 / tag object 4b7c943`
  - v0.1.0〜v0.1.4 も同じルールで統一する。
- **理由:** 品質ハーネスでは「tag がどの commit を指すか」が監査上重要。tag object と commit object を混在表記すると履歴確認時に誤解しやすい。

---

## R6-003

- **ID:** R6-003
- **重要度:** Low
- **種別:** ドキュメント
- **対象:** `review-packet-m0-r5.md` / Known Risks — R5-001
- **内容:** 「handler swap 中に signal が来ると before / after 両 handler が実行される」という Known Risk の説明は、通常の OS signal については正確ではない。
- **根拠:** R5 修正後は、
  1. next handler を `process.on()`
  2. previous handler を `process.off()`

  の順に同一同期 call stack 内で実行する。

  Node の signal event は asynchronous dispatch なので、OS signal がこの同期区間で到着しても、JS listener が実行されるのは call stack が戻った後。その時点では old handler が削除済みで、通常は new handler だけが実行される。
- **独立確認:** 同じ順序で
  - before 登録
  - after 追加
  - `process.kill(...)`
  - before 削除

  を同一同期 stack 内で実行したところ、複数回試して実行されたのは after handler のみだった。
- **修正案:** Known Risk の説明を次のように修正する。

  > swap 中は一時的に before / after の2 listener が登録される。ただし通常の OS signal event は非同期 dispatch のため、同期 swap が完了した後の listener 集合で処理される。内部 test hook 等から同期的に `process.emit()` を行った場合のみ両 listener が実行され得る。

- **補足:** 実コードの add-before-remove 方針そのものには問題なし。これはドキュメント精度の指摘。

---

# R5-001〜R5-004 の判定

## R5-001 — 解消

新 handler を先に登録し、その後 old handler を削除する構造へ変更されており、listener=0 の瞬間はなくなっている。

`src/cli-signals.ts` に helper を分離し、handler 参照も保持しているため、前回の `off → on` race は解消。

回帰テストでも swap 中の SIGINT / SIGTERM listener 数が 1 以上であることを確認している。

**追加指摘:** なし。R6-003 は説明精度のみ。

---

## R5-002 — 妥当

「OS に届いた時刻」ではなく「Node が JS へ dispatch 済みか」を基準とした observable semantics に文書を修正しており、実装可能な保証と説明が一致した。

2 回の `setImmediate` による event-loop yield の実装は維持されている。

**追加指摘:** なし。

---

## R5-003 — 解消

`verdict fixing point` と `CLI outcome` を分離して定義したことは妥当。

現在の意味:
- verdict は checks + yield 後に固定
- report write 成功時に CLI outcome は 0 / 1
- report write failure は R-007 に従い `VERIFY ERROR`, exit 2

コードと文書の意味が一致している。

**追加指摘:** なし。

---

## R5-004 — OutputBuffer 側は解消

`OutputBuffer.push()` は byte trim 後、先頭が UTF-8 continuation byte の場合に最大 3 bytes 追加で捨て、code-point boundary へ揃えている。

R5 regression test も以下を確認しており、前回の具体的再現条件は解消:
- U+FFFD が無い
- UTF-8 再エンコード後も byte cap 以下
- stream 末尾 marker を保持

**追加指摘:** R6-001。最終 report tail の別経路に同じ問題が残る。

---

# M0 完了判断

今回、新たな Critical / High の問題は確認していない。

R1〜R5 で以下の主要論点は大きく改善された。

- fail-closed verdict
- config validation
- secret masking
- quoted secret handling
- Authorization masking
- process group timeout / escalation
- CLI interruption
- symlink / dangling symlink containment
- git dirty unknown
- exit code / wording consistency
- packaging smoke test
- bin / shebang / runtime dependencies / version
- signal finalization semantics
- output capture tail retention

packet 記載では v0.1.5 で:
- 141 tests
- 10 回連続 full-suite PASS
- source / built の self verify PASS
- lint / typecheck / package / dependency PASS

となっている。

技術的には **M0 完了を止める Critical / High は今回なし**。

ただし R6-001 は report 出力仕様そのものなので、可能なら M1 へ持ち越さず、小さな maintenance fix として修正する方がきれい。

v0.1.5 を immutable baseline として既に固定する場合は:
- v0.1.6 = M0 maintenance fix
- CHANGELOG に R6-001 を記録

でもよい。

---

# 指摘なしと判断した観点

- add-before-remove の signal handler swap
- listener=0 race の解消
- handler references の保持
- R5-002 observable semantics
- 2回 `setImmediate` の維持
- verdict fixing point / CLI outcome の分離
- report write error → exit 2
- OutputBuffer の UTF-8 boundary alignment
- multibyte OutputBuffer regression test
- v0.1.3 を削除・force-moveせず superseded として残す運用
- v0.1.5 を新しい tag として追加する方針
- R1〜R4 regression tests を維持する方針

---

# 見ていない / 独立実行していない範囲

今回のレビューは `review-packet-m0-r5.md` を主な根拠としている。

独立実行していないもの:

- GitHub 上の `55e2e0f` と packet の byte-level 一致
- 141 tests × 10 回の実ログ
- `npm run verify`
- `npm run verify:dist`
- 実 tarball
- `npm audit`
- tag の実在と tag object / commit object の対応
- Linux
- Windows
- safety valve の実発火
- masker と pre-push guard / Security Scan の pattern agreement
- R5 で変更されていない repository 全体

独立確認したもの:

- 64 KiB report tail の UTF-8 任意 byte 切断
- 同じ切断による U+FFFD 発生と再エンコード byte 数増加
- signal handler add-before-remove の通常 OS signal dispatch 挙動

---

# 推奨対応順

1. **R6-001** — コード修正 + regression test
2. **R6-002** — CHANGELOG の commit / tag object 表記統一
3. **R6-003** — Known Risk の説明修正

R6-001 の修正規模は小さく、R5-004 で導入した UTF-8 safe trim を共通化すれば重複も減らせる。
