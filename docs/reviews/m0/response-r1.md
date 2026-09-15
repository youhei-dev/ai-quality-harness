# M0 独立レビュー R1 への対応記録（response-r1）

- 対象レビュー: `docs/reviews/m0/independent-review-r1.md`（R-001〜R-013、対象コミット 776a875）
- 対応日: 2026-09-15
- 形式: M2 で `aiqh review-import` が出力する構造化記録の試作（ID / 重要度 / 判定 / 対応 / 根拠 / 回帰テスト / 行き先）
- 判定の根拠は実コード・テスト結果・仕様のみ。実装 AI の評価は書かない

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト | 行き先 |
|----|--------|------|------|-----------------|------------|--------|
| R-001 | High | VALID | 修正済み | 修正前の key-value 規則は先頭が `\b` で、`AWS_SECRET_ACCESS_KEY` の `_` は word 文字のため境界が成立せず無加工だった。修正: 先頭を `(?<![A-Za-z0-9])` に変更し、識別子末尾のキー名（`…_SECRET_ACCESS_KEY`、`…_SESSION_TOKEN`、`MY_API_KEY`）を対象化。`session[_-]?token` を追加。既存キー一覧は削除なし（`src/security/mask.ts`） | `tests/regression-r1.test.ts` "R-001 key-value rule: prefixed environment variable names"（6 件）: 修正前 6 FAIL → 修正後 6 PASS | M0 |
| R-002 | High | VALID | 修正済み | 修正前は `(Bearer\|Basic)` が大文字小文字固定、資格情報に `{16,}` を要求。修正: `bearer` 規則を `/i` 化（16 文字下限は維持）、`basic` 規則を新設し base64 をデコードして `:` を含む印字可能文字列のときだけマスク（`Basic dTpw` = `u:p` を対象、"Basic auth is used" は非対象）（`src/security/mask.ts`） | 同 "R-002 bearer rule …"（5 件）: 修正前 4 FAIL・1 PASS（誤検出防止ガード）→ 修正後 5 PASS | M0 |
| R-003 | High | VALID | 修正済み | 修正前の値部分 `[^\s"',;]+` は空白・引用符で停止し `password="abc def ghi"` の後半が残った。修正: 引用符付き値（対応する閉じ引用符まで、改行なし）と引用符なし値を分離し、置換関数で引用符を保持。閉じ引用符が無い場合は従来どおり先頭部分をマスク（`src/security/mask.ts`） | 同 "R-003 key-value rule: quoted values containing whitespace"（7 件）: 修正前 6 FAIL・1 PASS（未終端ガード）→ 修正後 7 PASS | M0 |
| R-004 | High | VALID | 修正済み | 修正前の `killTree` は `child.exitCode !== null \|\| child.signalCode !== null` で即 return し、leader（shell）が SIGTERM で先に終了すると SIGKILL がグループへ届かなかった。修正: spawn 時に pgid を保存し、`process.kill(-pgid, signal)` を leader の状態にかかわらず試行（ESRCH は無視、EPERM 等のみ `child.kill()` へフォールバックし、その時だけ child の状態を見る）。既定猶予 5 秒は不変（`src/runner/execute.ts`） | 同 "R-004 killTree: … kills a TERM-ignoring grandchild within the grace period": 修正前 FAIL（孫プロセスが 8,039ms 生存、期待 < 4,000ms）→ 修正後 PASS | M0 |
| R-005 | High | VALID | 修正済み | 修正前の `resolveInsideRoot` は `path.resolve/relative` の字句判定のみ。修正: 字句判定に加え、root と対象を realpath 化して包含判定（未作成パスは存在する最も近い親を realpath 化し残りを連結）。戻り値は従来どおり字句上の絶対パス（`src/config/load.ts`） | 同 "R-005 resolveInsideRoot: symlink escape"（3 件）: 修正前 2 FAIL・1 PASS（root 内 symlink 許容ガード）→ 修正後 3 PASS | M0 |
| R-006 | High | —（設計） | 文書対応 | 設定は「リポジトリ所有者が管理する信頼された入力」であり、改変された設定・弱体化された scripts に対する独立性は提供しないことを `docs/ARCHITECTURE.md` §9.1 と `README.md` に明記。対策候補（CODEOWNERS / 必須レビューによる保護 → M3、設定ハッシュ固定と品質ポリシー変更時の別承認 → M4）を `docs/ROADMAP.md` に記載 | なし（コード変更なし） | M0（文書）/ M3 / M4 |
| R-007 | High | VALID | 修正済み | 修正前はレポート書込失敗時に `VERIFY ${report.verdict} (report not written)` を出力し exit 2 だった。修正: exit 2 の文言を `VERIFY ERROR (...)` に統一（configuration error / report write error / internal error。従来の `VERIFY FAILED (configuration error)` も変更）。exit 0 → PASSED、1 → FAILED、2 → ERROR の対応を `docs/ARCHITECTURE.md` §10 に併記（`src/commands/verify.ts`、`src/cli.ts`） | 同 "R-007 verify: 'PASSED' is printed only when the exit code is 0": 修正前 FAIL → 修正後 PASS。`tests/cli.test.ts` に不変条件 `expectVerdictMatchesExit`（文言と終了コードの 1 対 1、exit≠0 で `PASSED` 非出力）を追加し 6 件の CLI テストに適用 | M0 |
| R-008 | Medium | —（テスト不足） | 持ち越し | 配布形態（git タグ参照 / Actions 内 checkout）が M1 で確定するため、`npm pack` → 一時 dir へ install → `npx --no-install aiqh verify` の smoke test を配布設計と同時に追加する。`docs/ROADMAP.md` M1 に記載 | なし | M1 |
| R-009 | Medium | VALID | 修正済み | 修正前は `git status` 失敗時に `dirty: false`（clean 表示）。修正: `GitInfo.dirty` を `boolean \| null` にし、失敗時は null。Markdown は `unknown`、コンソールは `(dirty: unknown)`（`src/types.ts`、`src/git/info.ts`、`src/report/markdown.ts`、`src/commands/verify.ts`） | 同 "R-009 git info …"（2 件: index を読取不可にして `git status` だけを失敗させ null を確認、Markdown の `unknown` 表示）: 修正前 2 FAIL → 修正後 2 PASS | M0 |
| R-010 | Medium | —（設計） | 持ち越し | `latest.json` と `latest.md` の 2 ファイルはトランザクションではないため並行実行で別 run の組合せになり得る。履歴 DB 導入時に `runs/<runId>/` ＋ 単一の latest ポインタへ変更。`docs/ROADMAP.md` M4 に記載 | なし | M4 |
| R-011 | Medium | —（テスト不足） | 文書対応（前半）/ 持ち越し（後半） | 前半: `README.md` に Supported Platforms（macOS / Linux の POSIX、Windows は M0 対象外）を明記、`docs/ARCHITECTURE.md` §9.2 も更新。後半: Ubuntu CI を M3 で追加（`docs/ROADMAP.md` M3） | なし | M0（文書）/ M3 |
| R-012 | Medium | —（テスト不足） | 持ち越し | masker と push 前 hook の正規表現は別物で整合は未検証。Security Scan アダプタと masker で検出パターンを共有し、実行時生成の合成資格情報コーパスを両方へ入力する互換テストを M1 で追加。push 前 hook は共通設定のため変更しない。`docs/ROADMAP.md` M1 に記載 | なし | M1 |
| R-013 | Low | —（性能） | 持ち越し | 逐次実行の M0 では 10MiB / ストリームの上限は致命的でない。並列実行を導入するときに末尾のみ保持する ring buffer へ変更。`docs/ROADMAP.md`「将来」に記載 | なし | 将来 |

INVALID / PARTIAL の判定はなし。不採用もなし。

## 回帰テストの実行記録

- 修正前: `npx vitest run tests/regression-r1.test.ts` → 25 件中 22 FAIL / 3 PASS（PASS の 3 件は退行防止ガード）。記録 `tmp/r1-before.txt`（git 管理外）
- 修正後: 同コマンド → 25 件 PASS。全体 `npx vitest run` → 8 ファイル 97 件 PASS（既存 72 件＋R1 25 件）
- 自己 verify: `npm run verify` → VERIFY PASSED（exit 0）、`npm run verify:dist` → VERIFY PASSED（exit 0）。lint / typecheck / unit / build / dependency すべて PASS、security / e2e は NOT_APPLICABLE

## レビュアーの「未確認範囲」に対する所見

今回のレビューは `review-packet-m0.md` の抜粋を主な根拠としており、`execute.ts` のイベント処理、`run-checks.ts`、`write.ts`、`markdown.ts`、`schema.ts` の全文、72 テストの assertion、docs 全文、README の個人情報有無は未確認とされている。
対応として、次回のパケット（`artifacts/ai-review/review-packet-m0-r1.md`）から変更した `src/` と `tests/` の**ファイル全文**を含める。M2 の `aiqh review-packet` の設計にも「変更ファイルの全文を含める（サイズ上限つき）」を反映する。
未確認範囲のうち R1 で対応していないもの（`markdown.ts` の code-fence injection 耐性、`schema.ts` の文字列長制限、`package.json` の `files` / `prepare`）は次回レビューの確認対象として残る。
