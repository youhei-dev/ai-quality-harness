# m4-design の独立レビュー 2 回目への対応記録（response-r2）— 設計 R3（v0.10.0）

- 対象レビュー: `docs/reviews/m4-design/review-r2.md`（受領ファイル名 `independent-review-m4-design-r2-for-claude.md`、2026-10-17 受領、12,118 バイト、SHA-256 `b0b589c512a24d3e3cb44a985dcd351247a9018f3207e6a066579057fc01b14e`、
  LF 128 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: M4 の設計 R2（レビュアーに渡した写し `m4-design-r2.md`、96,220 バイト、SHA-256 `aadf31325d39cf8a91f867dcfbe480b424ac00b52f118a5c2f69730f312b80e2`）と、R1 への応答の下書き（`response-m4-design-r1.md`、20,328 バイト、SHA-256 `587ced9efec4fd7d02329b071dc37392730d8b9d11016ab12e2e3e00b9227ea3`）。基準の commit `fe8de3aeead02b2909c2a15024096a2fc45b687e`
  - 設計 R2 そのものは記録しない（R2 を直した設計 R3 を `docs/reviews/m4-design/design-r3.md` として記録した。R2 からの変更点は、その冒頭の表）
- レビュー用に作って人間に渡したもの（送付は人間が行った）: 依頼文 `review-request-m4-design-r2.md`（12,659 バイト、SHA-256 `8c18a948825683282094878fc4be13f871ea3a0e5b0b34c3d975cd0d2b8c8983`。問いは 4 つ。前の回の 5 件の評価を `previous` に必ず書くよう頼んだ）と、上の添付 2 つ。コードの変更の範囲が無い設計のレビューなので、`aiqh review-packet` のパケットは作っていない
- 対応日: 2026-10-17
- 結果（レビュアー）: **High 0 / Medium 3 / Low 0**。前の回（R1）の 5 件は、解消 3（001・004・005）・部分的に解消 2（002・003）。レビュアーはコードを読んでおらず、実行もしていない（設計の案と応答の静的な読解のみ）
- **人間の決定（2026-10-17）: 設計 R3 の独立レビューは依頼しない**。R2 の 3 件が解消したかは、v0.11.0 の実装レビュー（コードを添付する）で確かめる。依頼文に先に書いた基準（High・Medium が 0 なら終える）には達していないので、設計のレビューのループは、R2 の 3 件を v0.11.0 で確かめるまで「未完了」のまま
- 取り込み: v0.10.0 の記録の commit で、R1 とまとめて `aiqh review-import` で取り込んだ（label `m4-design`、round 2、接頭辞 `M4-D`）。結果は下の「取り込みと review-check」

## 判定表

判定は、人間の方針（2026-10-17。3 件とも受け入れ）のとおり。

| ID | 重要度 | 判定 | 対応 | 変えた節（設計 R3） | 要点 |
|---|---|---|---|---|---|
| M4-D-R2-001 | Medium | VALID | 受け入れ | ADR-0034 の F・G・H・I・M、N（新）、ADR-0035 の決定 5・既知の限界 | `safeJson` は JSON の全体ではなく、文字列とキーを 1 つずつマスクする（コードで確かめた）。集計の JSON の全体を `maskSecrets` に渡さないことを要件にし、最終の出力の実バイト数に上限（32 MiB）を置く |
| M4-D-R2-002 | Medium | VALID | 受け入れ | ADR-0034 の E・G・M、ADR-0035 の決定 6 | `maxShareOfTimeout` を run ごとの割合の最大にした。最後の run の上限は別の属性 `lastTimeoutSec` |
| M4-D-R2-003 | Medium | VALID | 受け入れ | ADR-0034 の C の 5・C の 9（新）・E・G・H・M、ADR-0035 の決定 4 | 数は安全な整数の範囲、`timeoutSec` は設定と同じ正の整数。範囲の外は `bad-shape`。計算の後の有限の確かめ（`non-finite`）は届かないはずの守り |

- **状態**: 3 件とも `open` のまま、`verdict`（VALID）・`action`・`destination`（直す版）を書いた（`docs/ops/review-loop.md` の段取り 6）
  - `destination`: 001 は v0.11.0（端末と `--json`。HTML の上限は v0.12.0）、002 は v0.11.0（HTML の許可リストの欄の名前は v0.12.0）、003 は v0.11.0
  - `resolved` にするのは、その版で ADR-0034（・0035）と回帰テストが入り、v0.11.0 の実装レビューで確かめた後（`fixedIn` は、その commit の 40 桁の SHA）

## 指摘ごとの対応

### M4-D-R2-001 — 最終の JSON とマスク（受け入れ）

- **指摘の要点**: 個々の文字列を 256 バイト以下にしても、`--json` の最終の出力の全体を `safeJson` に渡す経路の長さは抑えられない。`safeJson` が全体の文字列をマスクするなら、マスクの超線形（ROADMAP の項目 40）が巨大な文字列にかかりうる
- **コードで確かめたこと** [事実]
  - `safeJson`（`src/output.ts:166-168`）は `JSON.stringify(copyJsonData(value, (s) => maskSecrets(escapeForDisplay(s, mode))), null, 2)`
  - `copyJsonData`（`src/output.ts:119-160`）は値をたどり、文字列の値（121 行）とオブジェクトのキー（152 行）を 1 つずつ `mapString` に通す。**JSON の全体の文字列はマスクに渡らない**
  - `createOutput` の `json`（`src/output.ts:227`）も、この `safeJson` を使う
- **対応**（設計 R3 の ADR-0034 の F・N）
  - 要件として明記した: 集計の JSON の全体を `maskSecrets` に渡さない。表示する自由な文字列は、集めるときに 1 つずつマスクする（入力は 256 バイト以下）
  - 手元の測り（合成のデータ、数の葉 200,000）: 日の多い形は `safeJson` 606 ms・15,702,823 バイト、長い名前の多い形は 1,954 ms・48,789,023 バイト。数の葉の上限だけでは、出力が 50 MB 近くになりうる
  - **最終の出力の実バイト数に上限 32 MiB**（端末の表・`--json`・HTML のそれぞれ）。超えたら `HISTORY ERROR (output-too-large)`・exit 2・何も出さない。数の葉の上限（Q10 の決定。200,000、`too-many-values`）と両方を置く。値は v0.11.0 で実例から測って ADR に書く
  - 出口の形: ADR-0016 の「出口は 1 つ」を保ち、`src/output.ts` の `Output` に、上限つきで JSON を出す口を足す案（例: `jsonWithin(value, maxBytes)`。中は今の `json` と同じ `safeJson`）。`tests/structure/` の変更が要るときは、v0.11.0 の指示書で承認を得る
- **テストの計画**（ADR-0034 の M）: 数の葉・出力のバイト数の境界（ちょうど上限・上限 + 1）を、端末と `--json` で。既定の上限の近くの負荷（時間は assert しない。別に測って報告と ADR に書く）
- **v0.11.0 の実装レビューで確かめてもらうこと**: 実際の `--json` の経路が JSON の全体をマスクに渡さないこと、出力の上限の口が出力のガード（ADR-0016・0019）を崩していないこと、上限の境界のテスト

### M4-D-R2-002 — タイムアウトに対する割合（受け入れ）

- **指摘の要点**: 「最大の所要時間 ÷ 最後の run の `timeoutSec`」は、run の間で上限が変わると、どの run にも無い割合になる（90 秒・上限 120 秒と 20 秒・上限 30 秒で、本当の最大 0.75 が 3.0 になる）
- **対応**（設計 R3 の ADR-0034 の E・G）
  - run ごとに `durationMs ÷ （その run の timeoutSec × 1000）` を計算し、その最大を `maxShareOfTimeout` にする
  - 最後の run の `timeoutSec` は、割合と関係の無い別の属性として持つ。JSON の欄の名前を `timeoutSec` から `lastTimeoutSec` に変えた（ADR-0035 の照合しない数の許可リストも同じ名前にした）
- **テストの計画**（ADR-0034 の M）: 上限が run の間で変わる 2 件の fixture（指摘の例と、順を逆にしたもの）、上限が同じ run だけの対照、時間切れの run を含むもの
- **v0.11.0 の実装レビューで確かめてもらうこと**: 割合の計算が run ごとであること、上のテスト

### M4-D-R2-003 — 極端な数（受け入れ）

- **指摘の要点**: 数の確かめが「0 以上の整数」「正の数」だけで、安全な整数の範囲と、計算の結果の有限を保証しない。`durationMs` が `1e100`、`timeoutSec` が `1e-100` のような JSON の値で、割合が非常に大きく、または `Infinity` になりうる
- **対応**（設計 R3 の ADR-0034 の C の 5・C の 9・G・H）
  - `durationMs`・`summary`・`parsed.counts` の値は、0 以上で `Number.isSafeInteger` が真。`exitCode` は `Number.isSafeInteger` が真
  - `timeoutSec` は、設定の決まりと同じ**正の整数**: `timeoutSec: z.number().int().positive().optional()`（check は `src/config/schema.ts:21`、`defaults` は同 73 行。既定 600 は同 8 行）。設定のスキーマに上限は無いので、読む側の守りとして安全な整数の範囲も求める
  - 範囲の外は `bad-shape`。この範囲で、割合の分母は 1,000 以上なので、割合は有限
  - 足し算・割り算・丸めの後にも `Number.isFinite` を確かめ、偽なら `HISTORY ERROR (non-finite)`・exit 2・何も出さない。入力の範囲で防げているはずの、届かないはずの守り
- **テストの計画**（ADR-0034 の M）: 2^53 - 1 と 2^53、`1e100`、`-1`、`0.5`、`-0` の境界。`timeoutSec` の 1・0・`0.5`・`1e-100`・負の数。極大の `durationMs` と極小の `timeoutSec` の組。`non-finite` の守りは、テストのための差し替えでだけ確かめる
- **v0.11.0 の実装レビューで確かめてもらうこと**: zod の範囲の確かめ、有限の守り、上のテスト

## 前の回（R1）の指摘の評価（R2 の `previous`）と、その扱い

| R1 の ID | R2 の評価 | 扱い |
|---|---|---|
| M4-D-R1-001 | 解消 | 設計では直した。`open` のまま（`destination` は v0.11.0。ADR-0034 と回帰テストが入ってから `resolved`） |
| M4-D-R1-002 | 部分的に解消（設計で定めた対象の範囲のもとでは容認できる、とレビュアー） | 同じ。残りの「戻された差し替えは防げない」は、脅威モデルの制限として ADR-0034 に書く |
| M4-D-R1-003 | 部分的に解消（最終の JSON の経路は新しい指摘 M4-D-R2-001 で扱う） | 同じ。M4-D-R2-001 の対応で、最終の出力の経路も扱った |
| M4-D-R1-004 | 解消 | 設計では直した。`open` のまま（`destination` は v0.12.0） |
| M4-D-R1-005 | 解消 | 設計では直した。`open` のまま（`destination` は v0.11.0） |

- `review-check` は、「解消」と評価された R1 の 3 件（001・004・005）が `open` のままなので、警告を 3 つ出す（評価と状態の食い違い。誤りではない。`docs/ops/review-loop.md` の「止まったときの対処」）。`open` のままにする理由: 設計の指摘で、直した先（ADR-0034・0035）とその回帰テストが v0.11.0・v0.12.0 で入るまで、`resolved` に要る `fixedIn` と `regressionTest` が無い。各件の `note` にも書いた

## 人間の決定（2026-10-17）

- 設計 R3 の独立レビューは依頼しない。R2 の 3 件は v0.11.0 の実装レビューで確かめる
- **Q10**（集計の大きさの上限）: 推奨 (a)。集計の数の葉の総数に上限 200,000、超えたら `HISTORY ERROR (too-many-values)`・exit 2・何も出さない。値は v0.11.0 で実例から測って ADR に書く
- **Q11**（設定が許すが、履歴の読み方が拒むもの）: 推奨 (a)。既知の限界として `docs/CONFIG_SPEC.md` に書き（v0.11.0）、verify は変えない
- R2 の 3 件への対応の方針: 上の「指摘ごとの対応」のとおり

## 設計 R3 で新しく出た論点（設計 R3 の §5.2。M4 の外）

- **Q12**: 設定の `timeoutSec` に上限が無く（`src/config/schema.ts:21, 73`）、実行は `timeoutSec * 1000` を `setTimeout` に渡す（`src/runner/run-checks.ts:51`、`src/runner/execute.ts:221-224`）。Node は 2,147,483,647 ms を超える待ち時間を 1 ms にし、警告を出す（手元の Node 24.13.1 で確かめた）。そのため約 24.8 日以上の `timeoutSec` では、check がすぐ時間切れ（FAIL）になる。fail closed は保たれるが、理由が分かりにくい。推奨は、設定のスキーマに上限（2,147,483 秒）を足す小さな別の版（人間の判断）

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（R1 の 5 件）**: 001・004・005 は解消。002 は部分的に解消（対象の外と明示した競合を防がない点が残る）。003 は部分的に解消（個々の文字列の上限はあるが、最終の JSON の経路が未確認）
- **問い 2（脅威モデルと検出）**: 指摘なし。Node の標準の `fs` に `openat` に当たる公開の API が無いという説明は合理的で、`dev`・`ino` の比較を防止ではなく事後の検出と明記している。対象の外の競合への完全さは主張できない
- **問い 3（新しい穴・Q10・Q11）**: 指摘あり（001〜003）。Q10 の上限の考えには賛成だが、数の葉の数だけでは最終の出力の安全を保証できない。Q11 の文書化に反対しない
- **問い 4（Q1〜Q9）**: 指摘なし

## 未確認範囲（原文の要約）

添付は設計の文書と応答の文書で、基準の commit の実コード（`safeJson`・`maskSecrets`・`output.json` の内部、zod の schema）、実行時のテストの結果、macOS と Linux での `dev`・`ino`、ブラウザでの CSP と SVG の動作は、独立に確かめていない。コードに依る指摘は確度を分けた。

## 取り込みと review-check

- 取り込み（v0.9.2 のコード。branch `release/v0.10.0` の上で。R1 を先に、R2 を後に）
  - R1: `aiqh review-import <受領ファイル> --label m4-design --round 1 --id-prefix M4-D` → exit 0、`High 0 / Medium 4 / Low 1; open 5`、`REVIEW LOOP: incomplete (open 5)`、`REVIEW IMPORT: written`
  - R2: `aiqh review-import <受領ファイル> --label m4-design --round 2 --id-prefix M4-D` → exit 0、`High 0 / Medium 3 / Low 0; open 3`、`REVIEW LOOP: incomplete (open 8)`、`REVIEW IMPORT: written`。`previous` に R1 の 5 件
  - どちらも、source の SHA-256 とバイト数は受領ファイルと一致した。標準エラー出力は空
- 実装者の欄を書いた後の `aiqh review-check --label m4-design` の出力（そのまま。終了コード 0、標準エラー出力は空）:

```
aiqh review-check — m4-design (M4-D), R1 to R2
R1: High 0 / Medium 4 / Low 1; open 5, resolved 0, deferred 0, accepted 0, invalid 0
R2: High 0 / Medium 3 / Low 0; open 3, resolved 0, deferred 0, accepted 0, invalid 0
previous: M4-D-R1-001 (R1, open) — R2: 解消
previous: M4-D-R1-002 (R1, open) — R2: 部分的に解消
previous: M4-D-R1-003 (R1, open) — R2: 部分的に解消
previous: M4-D-R1-004 (R1, open) — R2: 解消
previous: M4-D-R1-005 (R1, open) — R2: 解消
open: M4-D-R1-001, M4-D-R1-002, M4-D-R1-003, M4-D-R1-004, M4-D-R1-005, M4-D-R2-001, M4-D-R2-002, M4-D-R2-003
warning: M4-D-R1-001 (R1) is open, but R2 assesses it 解消
warning: M4-D-R1-004 (R1) is open, but R2 assesses it 解消
warning: M4-D-R1-005 (R1) is open, but R2 assesses it 解消
warnings: 3
REVIEW LOOP: incomplete (open 8)
REVIEW CHECK: passed
```

- 警告の 3 つは、R2 で「解消」と評価された R1 の 3 件が `open` のままであることによる（上の「前の回（R1）の指摘の評価と、その扱い」）
- 書いた後のファイルが取り込みと同じ検査に通ることを、一時のコピーで同じ原文を取り込み直して確かめた（R1・R2 とも `already imported (same source); nothing written`、exit 0、コピーは変わらない）

## この記録の commit で変えたもの（docs だけ）

- `docs/reviews/m4-design/review-r2.md`（新規。R2 の原文の収録）
- `docs/reviews/m4-design/response-r2.md`（新規。この記録）
- `docs/reviews/m4-design/findings-r2.json`（新規。`aiqh review-import` で取り込み、`verdict`・`action`・`destination`・`note` を書いた。`status` は `open`）
- `docs/reviews/m4-design/design-r3.md`（新規。設計 R3。R1・R2 の指摘と Q1〜Q11 の決定を入れた設計の案）
