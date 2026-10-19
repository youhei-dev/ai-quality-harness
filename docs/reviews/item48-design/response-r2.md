# item48-design の独立レビュー 2 回目への対応記録（response-r2）— v0.13.0

- 対象レビュー: `docs/reviews/item48-design/review-r2.md`（受領ファイル名 `independent-review-item48-design-r2-for-claude.md`、2026-10-19 受領、26,604 バイト、SHA-256 `61501400980724c8c7e0fe62743ae28b7065ff267a365c443ef26f47b3bced19`、
  LF 165 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし / レビュアーの側の作業場所を指すリンクの行なし）。**原文の本文は編集していない**（収録したファイルは、先頭に収録の注記を足しただけで、注記の後ろは受領ファイルとバイト単位で同一）
- 対象: 項目 48 の設計 R2（レビュアーに渡した写し `item48-design-r2.md`、60,840 バイト、SHA-256 `085ca297c5e6a8e499707e5e0b7a1ef14fcebf08224d43df9781c2e727683137`）、ADR-0036 の案 R2（`adr-0036-draft-r2.md`、18,775 バイト、SHA-256 `c4de2ded8490000b2aa24e909275b8fa07f71b29a243abf9f20818041d896fbe`）、R1 への応答の下書き（`response-item48-design-r1.md`、19,514 バイト、SHA-256 `01c87acc38a3563c25208bd12d790156a50052f360ca6d4636112708998f0da3`）。基準の commit `8870afbf1bf65282f12bba39086d661c88d70851`
  - 設計 R2 は、I48-D-R2-001 を反映して `docs/reviews/item48-design/design-r2.md` として記録した（冒頭の「R2 の後の変更」の表）
- レビュー用に作って人間に渡したもの（送付は人間が行った）: 依頼文 `review-request-item48-design-r2.md`（28,521 バイト、SHA-256 `82b8844dd5389b6f5e48d42aa3b8babab2dc57c706515c0432b06b8b5857ba57`。問いは 3 つ。基準の commit に固定した URL を 42 個載せ、R1 の 5 件の評価を `previous` に必ず書くよう頼んだ）と、上の添付 3 つ。コードの変更の範囲が無い設計のレビューなので、`aiqh review-packet` のパケットは作っていない
- 対応日: 2026-10-19
- 結果（レビュアー）: **High 0 / Medium 0 / Low 1**。R1 の 5 件はすべて「解消」。レビュアーは、依頼文の 42 個の URL のファイルを基準の commit の公式のアーカイブから読み、設計の参照を照合した（ほかに `src/cli.ts`・`src/cli-program.ts`・`package.json`・`tsconfig.build.json`・`src/runner/run-checks.ts`・`src/commands/review-packet.ts` など）。コード・テストは実行していない
- **人間の決定（2026-10-19）**: 設計のレビューは R2 で閉じる（R3 は依頼しない）。I48-D-R2-001 は、下の「対応」の文で v0.13.0 の文書を直す
- 取り込み: v0.13.0 の PR の docs の commit で、R1 とまとめて `aiqh review-import`（v0.13.0 の作業 branch の版）で取り込んだ（label `item48-design`、round 2、接頭辞 `I48-D`）。結果は下の「取り込みと review-check」

## 判定表

| ID | 重要度 | 判定 | 対応 | 直した場所 | 要点 |
|---|---|---|---|---|---|
| I48-D-R2-001 | Low | VALID | 受け入れ | 設計 R2 の記録（`design-r2.md`）の §6-4・§9 の CHANGELOG の下書き、`response-r1.md` の I48-D-R1-001、ADR-0036 の決定 10、CONFIG_SPEC の §5.3b、README、CHANGELOG | `aiqh --version` で古い `dist/` を見分ける、という説明をやめた |

- **状態**: `resolved`。`destination` は v0.13.0、`fixedIn` は v0.13.0 のテストと実装の commit `7633da4f25c42748b6ee66fcb13cbb6c2a7289e3`（案内が確かめさせる 2 つの行を出す commit）、`regressionTest` は T9（情報の行と、6 つの内訳の件数の行の文）と T14（本体の自己 verify の security の出力の fixture）。案内の文そのものは、同じ PR の docs の commit と release の commit にある（その SHA は記録の PR で書く）

## 指摘ごとの対応

### I48-D-R2-001 — 版の表示で古い `dist/` を見分けられない（受け入れ）

- **指摘の要点**: 版の表示（`aiqh --version`）は、実行時に隣の `package.json` の `version` を読む（`src/cli.ts:19-27`、`src/cli-program.ts:51-54`）。`bin` は `dist/cli.js` なので、ソースと `package.json` を更新した後に古い `dist/` が残っていれば、新しい版の番号を表示しながら古い走査で動く。親も子も古いコードなら `unexpected-summary` も出ないので、両方の確かめを通りうる
- **対応**: 版を上げるときの案内を、次の文にした（人間の決定のとおり）
  - `--version` は package の版を示すだけで、`dist/` が新しくなったことの証明にはならない。版を上げた後は `npm run build` をし、実際の security の check と同じ起動の経路（`aiqh verify` の中の security、または `aiqh security-scan`）で、`raw characters checked:` の情報の行と、`raw characters` を含む 6 つの内訳の件数の行が出ることを確かめる
  - どの `aiqh` が呼ばれるかは `command -v aiqh` で確かめる（残した）
- **手元での確かめ（v0.13.0 の作業 branch。2026-10-19）**: `npm run build` の後、PATH の `aiqh`（`npm link` の `dist/cli.js`）で `aiqh security-scan` を走らせ、2 つの行が出ることを確かめた。このとき `aiqh --version` は、まだ `package.json` を上げる前なので `0.12.1` を示した（版の表示が `dist/` の新しさを示さない例）

## R2 の補足への対応（指摘ではない）

- **T5 (3) の確かめ方**: 「untracked-env だけ」を、raw-char が 0 件・untracked-env が 1 件という種類ごとの確かめにした（`.gitignore` の finding が伴いうるので、finding の配列の全体が 1 件、とはしない）。`tests/regression-item48-raw-chars-scan.test.ts` の T5 (3)
- **ADR-0034 の行の参照**: C の 5 の `src/parse/security-scan.ts:24` は、`KINDS` に 1 行足したので 25 行目に動いた。直した。C の 5 のほかの参照（`src/parse/read.ts:24`、`vitest.ts:19`、`eslint.ts:68`、`npm-audit.ts:12`、`src/run-history/read.ts:347`）と E の参照（`src/run-history/aggregate.ts`）は、v0.13.0 でそのファイルを変えていないので、そのまま
- **既存のテスト・fixture の一覧（設計 §8-2・§8-3）**: レビュアーの照合で漏れは見つからなかった。実装の後の全テスト（174 ファイル・2,344 件）でも、§8-2 の外で期待値を変えたテストは無い

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（R1 の 5 件）**: 5 件とも解消（上の `response-r1.md` の「R2 の評価」）
- **問い 2（直しで新しく生じた問題）**: 版の表示による確かめ方（I48-D-R2-001）のほかは指摘なし。shell・PATH の説明、CI の同じ commit の説明（標準の command が起動の script を通る通常の経路について。設定で別の実行ファイルを明示した command までは同じ commit に強制しない）、パス名の確かめの位置と既存の統計、T7d の gitlink の作り方、T8d の記録、変更の前の commit で新しいテストを読み込む計画に指摘なし
- **問い 3（固定のコードとの照合）**: 主要な変更位置、allow の記録、パーサ・履歴の連動、review-packet を変えない理由に指摘なし。§8-2・§8-3 の一覧に新しい漏れなし

## 未確認範囲（原文の要約）

項目 48 の実装のコードと新しいテストの実際の結果、変更の前の worktree での読み込みとケースごとの FAIL / PASS（予備の実測も独立には走らせていない）、生の対象の文字を含むファイル名の macOS・CI での一覧、gitlink の fixture、長い行の重なり、追加の走査の時間、新旧の親子や古い `dist/` を組み合わせた実際のプロセス、CI の PATH の解決。これらの判断は、固定のコードの読解による。v0.13.0 では、このうち実装・新しいテストの結果・変更の前の worktree での FAIL / PASS・名前に文字を置いたテスト（手元の macOS）を確かめた。CI の ubuntu での結果は PR の run、そのほかは実装の独立レビュー（`item48-impl`）で扱う

## 取り込みと review-check

- `aiqh review-import`（v0.13.0 の作業 branch の版）: `findings-r2.json`（指摘 1 件、`open`）。exit 0、`REVIEW IMPORT: written`
- 実装者の欄を書いた後の `aiqh review-check --label item48-design`: R1 は resolved 5、R2 は resolved 1、open 0、警告 0、`REVIEW LOOP: complete`、`REVIEW CHECK: passed`（exit 0）

## この記録の commit で変えたもの（docs だけ）

- `response-r1.md` の「この記録の commit で変えたもの」と同じ（item48-design の R1・R2 の記録はひとつの commit）
