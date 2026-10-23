> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch1-v0132-impl-r1-for-claude.md`（2026-10-23 受領、8,410 バイト、LF 55・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `d1aa7b1bd912e810602ca4d4e8193469beb4809066717f4b70c69471dbfc6f4d`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.13.2 の `aiqh review-import` でそのまま取り込めた）。

---

# batch1-v0132-impl R1 独立実装レビュー

対象: `a7e4d5300432f4610d49d0fb6b5b9c9c80534514..d1568347c2aafae697e300e0eee6f8d8a2b54951`。対象は v0.13.2 のテスト・設定・開発依存・関連文書。実装者の PASS 記録は証拠の一部として扱い、設計の正否をそれだけで判定していない。製品のテストや高負荷試験はこの独立レビューでは実行していない。

## 全体の結論

件数: High 0 / Medium 0 / Low 0

**依頼文に定められた High・Medium 0 の終了条件を満たす。** 提示された変更範囲について、新たな指摘として採番すべき重大な退行やテストの弱体化は確認できなかった。ただし、再現ログを独立に再実行したという意味ではなく、負荷結果の定量値、`npm audit` の現在の結果、依存の全ロックエントリ差分は実装者の記録にも依存する。既知の parse-output の壁時計の負荷 FAIL は解消していないが、人間がこの版では変更せず ROADMAP 項目 53 に残すと決めた事柄であり、今回の新規指摘にはしない。

### 問い 1 — 41 の順序と 400 ms のテスト

指摘なし。`regression-backlog16-r2-confirm-origin.test.ts` の `leaderWithDaemon` は `beforeReady` を ready の書き込みより前に実行する。新しい 400 ms の停止は ready 書き込み直後なので、テストが ready を見て中断しても SIGTERM handler の設定後である。新テストは `interruptedBy` と SIGKILL の観測を検査し、旧順序なら SIGKILL の前提が崩れるという問題に直接対応する。既存の本来の `CONFIRM_MS`、偽の alive probe、経過時間の期待を削っていない。`regression-backlog16-r1-pgid-reuse.test.ts` も同様に順序を変更している。固定 URL の残る 5 ファイルを照合し、印より後で SIGTERM handler を初めて設定するという同型の順序は確認しなかった。旧順序で 5 回 FAIL、修正後 5 回 PASS、負荷時の 31 回・34 回 PASS は実装者の記録であり、当方の再実行ではない。

### 問い 2 — 時間上限、負荷再現、19 ケース

指摘なし。T3 の 12 倍は記録された最大 10.33 倍を上回るが、あくまで当該 8 CPU 環境の観測に対する余裕であって他環境での保証ではない。上限を広げても各 assertion の内容は残る。`regression-m2-2-builtin-r3-allow-branches.test.ts` では、従来まとめていたリポジトリ編集を 19 個の `it` に分け、19 ID を期待値として固定し、各編集について `createProgram` と `typeErrors(...).length === 0` を維持している。動的な ID 固定は編集の脱落を検出する。ループや `it.each` への一律 40 秒の適用は最長ケースに合わせた保守的な時間予算であり、個別ケースの assertion 自体を変更していない。高負荷での型ガード時間切れ 0 件、2 回目の parse-output 壁時計 FAIL は提出された実行記録に基づく。負荷を独立再現してはいない。

### 問い 3 — 43 の守りのテスト

指摘なし。新テストは `git ls-files -z` を `src`・`scripts`・`tests` に限定し、追跡ファイルの行を大文字小文字区別で検査する。検査対象名を実行時に組み立てるため自身が誤検出を起こさない。docs と未追跡ファイルを含めないのは指定範囲そのものである。件数が 250 超で `tests/helpers.ts` を含むという前提の assert もある。旧 tree で 7 箇所 FAIL、新 tree で PASS という観測は実装者の記録であり、意図に沿う。

### 問い 4 — 47-c の限界固定

指摘なし。`regression-item47-latest-pair-race.test.ts` は A の `latest.md` rename の直前に別プロセス B の `writeReports` 完了を差し込み、A の `latest.md` と B の `latest.json` が残ることを実際に assert する。異なる時刻では `startedAt` 不一致を検出する。同じミリ秒では異なる project 名でも `startedAt` は一致し、history の候補が 2 件残ることを固定する。順次書く対照テストもある。`src/report/write.ts` の書き込み順序および history 名の衝突時の連番規則に整合する。テスト名と文書は「受け入れ・未解決」であり、修正済みとは扱っていない。

### 問い 5 — near-limit reporter

指摘なし。`onTestCaseResult` が diagnostic を持つ終了テストだけを収集し、`onTestRunEnd` が stderr に最大 20 行と summary 1 行を出す。`nearLimitLines` は割合の降順、正の有限 timeout のみを分母に使い、未知の上限を `unknown-limit` に数える。hook 時間を含む duration であることを仕様・テストで明記し、skip は diagnostic が無いので集計しない。`near-limit-reporter.test.ts` は 50% 境界、25 件の切り捨て、0 件、未知上限、UTF-8 の 300 バイト制限、末尾を切る `tail` と終了時 1 度の stderr 書き込みを確認する。reporter 自身は合否を変更する API を呼ばない。`run-checks.ts` の末尾 200 行・64 KiB の条件では、後続 stderr が短ければ summary が残る。後続出力や異常終了で失われる限界は依頼文が明示しており、無条件の保存保証とはしない。

### 問い 6 — 依存の更新

指摘なし。ただし独立検証範囲に留保がある。固定 URL の前後の `package-lock.json` を開いてルートの devDependencies（vitest と vite）と license の追加、実行時 dependencies の名前が不変であることを確認した。パケットの `package.json` にも変更が反映されている。実装者が示す 8 エントリのバージョン更新、36 エントリの peer 印の除去、`why-is-node-running` の major 更新は、開発依存の解決グラフに伴うものとして整合的。ただしロック全件をプログラムで機械差分・ハッシュ比較していないため、「8 件だけ」と断定する独立の検証結果ではない。Vitest 自体は開発時・検証時の挙動を変えうるので、「実行時依存が同じ」は「テストの動作が絶対に同じ」と同義ではない。旧 tree と devDependency 更新後の両方でテストを確かめたという実装者記録は、このリスクに対応する。

### 問い 7 — parse-output の壁時計

指摘なし（この版で変更しないと決定済みの既知の限界）。`parse-output.test.ts` の P3 は作業量の時計で線形性を検査しつつ、別途 3,000 ms の壁時計を確認しており、極端な並行負荷では後者だけ 4,763 ms・3,409 ms で FAIL したという記録は矛盾しない。`src/parse/read.ts` と `src/parse/text.ts` は今回の対象差分に含まれず、`it.each` のタイムアウトを 40 秒に変更しても壁時計の 3 秒 assertion は残る。したがってこの結果を v0.13.2 で解消したと称してはならないが、人間の判断により ROADMAP 項目 53 に分離して追跡する扱いは妥当。

### 読み取り範囲と未確認

ZIP 内の `review-packet-batch1-v0132-impl.md` を展開して読み、対象の主要なテスト・reporter・設定・差分と最終検証記録を確認した。GitHub では指定コミット固定 URL の 13 件（前後の `package-lock.json` 2 件、未変更の 5 テスト、`tests/helpers.ts`、`src/report/write.ts`、既存の競合テスト、`src/runner/run-checks.ts`、`src/parse/read.ts`、`src/parse/text.ts`）を開いて照合した。13 件すべてについて逐行の完全監査や、ロック全エントリの機械差分は実施していない。手元の Node/Vitest でのコード・テスト実行、旧版へのテスト移植、実際の CPU 高負荷試験、`npm audit` の再実行、CI ログの独立検証、macOS 固有の process group の再現は未実施。従って結論は設計と実コードの静的レビューに関するものであり、負荷時に必ず PASS するという保証ではない。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch1-v0132-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "findings": []
}
```
