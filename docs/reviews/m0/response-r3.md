# M0 独立レビュー R3 への対応記録（response-r3）

- 対象レビュー: `docs/reviews/m0/independent-review-r3.md`（R3-001〜R3-003、R2-001〜R2-005 の再判定。対象コミット 29e0f42 = v0.1.1）
- 対応日: 2026-09-16
- 形式: `response-r1.md` / `response-r2.md` と同じ表に、「修正前 FAIL」と「ガード（修正前後とも PASS）」を分けた列を追加
- 判定の根拠は実コード・テスト結果・仕様のみ。実装 AI の評価は書かない

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト（修正前 FAIL → 修正後 PASS） | ガード（修正前後とも PASS） | 行き先 |
|----|--------|------|------|-----------------|------------|------------|--------|
| R3-001 | High | VALID | 修正済み | 修正前は key-value 規則の 4 つの値選択肢すべてに `(?!\[REDACTED:)` の否定先読みがあり、`[REDACTED:` で始まる値は実際の秘密でも無加工だった（`password="[REDACTED:fake] real secret tail"`）。修正: 否定先読みを廃止し、置換関数内で「値全体が `[REDACTED:<category>]` と完全一致し、`<category>` が規則定義から導出した `MASK_CATEGORIES` に含まれる」場合だけ元のまま返す（`isCanonicalMarker`）。分類名のハードコードなし（`src/security/mask.ts`） | `tests/regression-r3-mask.test.ts`: 6 件（引用符付きマーカー＋後続、引用符なしマーカー＋後続、正規マーカー＋後続、他カテゴリマーカー＋後続 ×2、非正規マーカー単体） | 2 件（全 13 分類 × 4 形式の正規マーカー冪等性、R1 の `--token=` 交差ケース）。R1 / R2 のマスク回帰 32 件も維持 | M0 |
| R3-002 | High | VALID | 修正済み | 修正前は `terminateActiveChildren()` が開始時の snapshot のみを対象とし、`cli.ts` の `terminating` フラグが `runVerify` / `runChecks` / `executeCommand` に伝わらないため、check 1 の早期終了後に check 2 が spawn され snapshot 外で生き残った。R2 の CLI 経路テストは関数を直接呼ぶだけで実 CLI にシグナルを送っていなかった。修正: `AbortController` を `runVerify → runChecks → executeCommand` に貫通。シグナルハンドラは `abort(<シグナル名>)` を先に立て → `terminateActiveChildren` → 安全弁（猶予 5s + 3s で強制終了、`unref`）。即 `process.exit()` はしない。`runChecks` は各チェック開始前に、`executeCommand` は spawn 直前・直後に中断を確認し、実行中のものは timeout と同じエスカレーション（TERM → 猶予 → KILL → 消滅確認）。未実行と中断されたチェックは SKIPPED（理由にシグナル名）、レポートは `verdict: "ERROR"`、`interruptedBy: "SIGINT"`、`exitCode` 130 / 143 で書き、`VERIFY ERROR (interrupted by SIGINT)` を出力。`Verdict` 型を 3 値化、Markdown に理由行を追加（`src/runner/execute.ts`、`src/runner/run-checks.ts`、`src/commands/verify.ts`、`src/cli.ts`、`src/types.ts`、`src/report/build-report.ts`、`src/report/markdown.ts`） | `tests/regression-r3-cli.test.ts`: 2 件（実 CLI を子プロセス起動し、check 1 の開始マーカーを待って SIGINT / SIGTERM。修正前は終了コード 130 / 143 だったが check 2 の開始マーカーが存在した）。修正後の追加 assert: 出力に `VERIFY ERROR`、`PASSED` / `VERIFY FAILED` なし、レポート verdict ERROR・interruptedBy・exitCode・両チェック SKIPPED | `tests/cli.test.ts` の不変条件 `expectVerdictMatchesExit` を 130 / 143 → `VERIFY ERROR` に拡張（既存 6 件で適用）。`tests/regression-r2-cli-signal.test.ts` は `terminateActiveChildren` 単体の補助テストとして維持 | M0 |
| R3-003 | Medium | VALID | 修正済み | 修正前の smoke test は `dist/cli.js` の tarball 同梱・shebang・`.bin/aiqh` の存在・`npx` 動作を確認するが、install 後の `package.json` の `bin.aiqh` の実値と `.bin/aiqh` のリンク先は assert していなかった。修正: `scripts/package-smoke-checks.ts` に純粋関数 `checkBinTarget(consumerDir, pkgName, binName, expected)` を追加し、`bin.aiqh === "dist/cli.js"`（文字列形式の `bin` はコマンド名がパッケージ名になるため `aiqh` としては不一致）と、POSIX で `.bin/aiqh` の `readlinkSync` 解決先の realpath が installed `dist/cli.js` に一致することを assert。smoke 本体から呼び出す（`scripts/package-smoke.ts`） | `tests/regression-r3-package.test.ts`: 5 件（修正前はモジュール不在で読込失敗。fixture の consumer レイアウトで正常系 1、異常系 4: 文字列形式 bin、別 wrapper を指す bin、別ファイルへの symlink、リンク欠落） | なし | M0 |

INVALID / PARTIAL なし。不採用なし。R-010 / R-011 / R-012 / R-013 の持ち越しは変更なし。

## 回帰テストの実行記録

- 修正前: `npx vitest run tests/regression-r3-*.test.ts` → 3 ファイル 10 件中 8 FAIL / 2 PASS（ガード）。記録 `tmp/r3-before.txt`（git 管理外）。CLI シナリオ後に残存プロセスなし
- 修正後: 同 → 15 件 PASS（R3-002 のテストに assert を追加したため件数は 10 → 15）。全体 `npx vitest run` → 19 ファイル 133 件 PASS（既存 118 件 + R3 15 件）
- 型変更の追随: `tests/regression-r1-git.test.ts` の手書きレポートリテラルに `interruptedBy: null` を追加（typecheck のみの修正、assert は不変）

## レビュアーの「見ていない範囲」に対する所見

レビュアーは `review-packet-m0-r2.md` の掲載内容を根拠とし、GitHub 上の commit との byte 一致、118 件のテストログ、verify の実行、tarball、`npm audit`、push / tag の実在、Linux / Windows、masker と push 前 hook の一致、未変更ファイルは独立実行していないとしている。R3-001 と R3-002 はレビュアー側で最小再現ロジックにより独立確認されており、本対応でも同じ再現条件が回帰テストになっている。
- push / tag の実在と commit 範囲は次回パケット（`review-packet-m0-r3.md`、commit 範囲 v0.1.1..v0.1.2 から生成）に含める
- Linux / Windows は M3（R-011 後半）、masker と hook の一致は M1（R-012）のまま
