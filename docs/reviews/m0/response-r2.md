# M0 独立レビュー R2 への対応記録（response-r2）

- 対象レビュー: `docs/reviews/m0/independent-review-r2.md`（R2-001〜R2-005、R-001〜R-013 の再判定。対象コミット c80231e）
- 対応日: 2026-09-16
- 形式: `response-r1.md` と同じ（M2 の `aiqh review-import` の出力形式の試作）
- 判定の根拠は実コード・テスト結果・仕様のみ。実装 AI の評価は書かない

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠 / 修正内容 | 回帰テスト | 行き先 |
|----|--------|------|------|-----------------|------------|--------|
| R2-001 | High | VALID | 修正済み | 修正前の引用符付き値は `(["'])((?!\[REDACTED:)[^"'\r\n]+?)\2` で、開始引用符の種類を問わず両方の引用符を値の途中で拒否していた（`password="pa'ss word"` は `pa` のみマスク）。修正: `"…"` と `'…'` を別の選択肢にし、反対種類の引用符とバックスラッシュでエスケープされた引用符（`\"` `\'`）を値の一部として扱う。閉じ引用符が同じ行に無い場合は行末までマスク（fail-safe）。置換関数で引用符を再構成（`src/security/mask.ts`） | `tests/regression-r2-mask.test.ts` "R2-001 …"（8 件）: 修正前 7 FAIL・1 PASS（R-003 形式の維持ガード）→ 修正後 8 PASS。R1 の `tests/regression-r1-mask.test.ts` 18 件も PASS | M0 |
| R2-002 | High | VALID | 修正済み | 修正前の `finish()` は leader の `close` で無条件に SIGKILL タイマーを取り消し（`unref()` 済み）、孫が fd 1/2 を閉じていると SIGKILL が送られなかった。CLI ハンドラは SIGTERM のみで 200ms 後に exit。修正: タイムアウト後は「SIGKILL 送信済み」または `kill(-pgid, 0)` が ESRCH を返すまで Promise を解決しない。タイマーは `unref()` しない。`terminateActiveChildren(graceMs)`（全 active グループへ SIGTERM → 猶予 → SIGKILL → 消滅確認、既定猶予 5 秒）を新設し、CLI の SIGINT / SIGTERM はこれを await してから 130 / 143 で終了（`src/runner/execute.ts`、`src/cli.ts`） | `tests/regression-r2-runner.test.ts`（1 件: 孫が fd 1/2 を閉じ SIGTERM 無視、leader 先行終了 → 猶予後に孫 PID が ESRCH）: 修正前 FAIL → 修正後 PASS。`tests/regression-r2-cli-signal.test.ts`（1 件: `terminateActiveChildren`）: 修正前 FAIL（未実装）→ 修正後 PASS。R1 の `regression-r1-runner` も PASS | M0 |
| R2-003 | Medium | VALID | 修正済み | 修正前の `realpathNearest()` は `existsSync()` で祖先を探すため dangling symlink を見落とし、`realpathSync()` 失敗時は字句パスへフォールバックしていた。修正: 祖先探索を `lstatSync()` ベースにして symlink エントリを認識し、`realpathSync()` が失敗したら `ConfigError`（対象パスと「解決先が存在しない。先に作成するか設定を見直す」を含む）。リンク先がルート内向きでも設定読込時点では検証できないため安全側にエラー（`src/config/load.ts`） | `tests/regression-r2-config.test.ts`（5 件: cwd / output.dir × 未作成 target が root 外 / root 内、通常の未作成 output.dir 許容ガード）: 修正前 4 FAIL・1 PASS → 修正後 5 PASS | M0 |
| R2-004 | Medium | VALID | 修正済み | 修正前は `bearer` 規則が文脈を問わず 16 文字以上、`basic` 規則がデコード後に U+FFFD を含むと非マスク（`Authorization: Bearer abc123`、`Authorization: Basic dXNlcjr/` が無加工）。修正: `(Proxy-)Authorization:` ヘッダ文脈の規則を先頭に追加し、Bearer は長さ不問、Basic は base64 構文のみでマスク（デコード判定なし）。一般文中の裸の Bearer / Basic には従来のヒューリスティック（16 文字下限 / デコード判定）を維持（`src/security/mask.ts`） | `tests/regression-r2-mask.test.ts` "R2-004 …"（6 件）: 修正前 3 FAIL・3 PASS（ヘッダ内 `Basic dTpw`、文中の "Basic auth" / "bearer authentication"、冪等性）→ 修正後 6 PASS | M0 |
| R2-005 | Medium | VALID | 修正済み（旧 R-008 の M1 持ち越しを撤回） | 配布 smoke test が存在しなかった。修正: `scripts/package-smoke.ts`（Node 標準 API のみ）を追加し、`npm pack --json` → OS 一時領域の consumer プロジェクト → `npm install --prefer-offline --no-audit --ignore-scripts <tarball>` → tarball 内容（`package.json` / `dist/cli.js` あり、`src/` `tests/` `scripts/` なし）、shebang、実行時依存 3 つ、bin リンク、`aiqh --version` = package.json の version、最小 config（`package` チェックを含めない再帰防止）で `npx --no-install aiqh verify` exit 0、`latest.json`（verdict / tool.version）と `latest.md` を検証し、一時ディレクトリを削除。`aiqh.config.jsonc` に `package`（kind custom、必須、`build` の直後）として登録。`tsconfig.json` の include に `scripts` を追加 | 修正前: テスト不在。スクリプト作成直後の現状ツリー（c80231e 相当 + 未 commit の修正なし）での初回実行は PASS（2,827ms、28 ファイルを pack）。自己 verify の `package` チェックとして毎回実行 | M0 |

INVALID / PARTIAL の判定はなし。不採用もなし。R-010 / R-011 / R-012 / R-013 の持ち越し判断は変更なし（レビュアーも妥当と判定）。

## 回帰テストの実行記録

- 修正前: `npx vitest run tests/regression-r2-*.test.ts` → 4 ファイル 21 件中 16 FAIL / 5 PASS（PASS はガード用）。記録 `tmp/r2-before.txt`（git 管理外）
- 修正後: 同 → 21 件 PASS。全体 `npx vitest run` → 16 ファイル 118 件 PASS（既存 97 件 + R2 21 件）
- 自己 verify: `npm run verify` / `npm run verify:dist` の結果は停止ポイント2の報告に記載

## レビュアーの「見ていない / 独立検証していない範囲」に対する所見

レビュアーは `review-packet-m0-r1.md` の掲載内容（コード全文・diff・テスト）を根拠とし、GitHub 上の commit との一致、97 件のテストログ、`npm audit` の結果、push / tag の実在、Linux、Windows、`npm pack`、masker と push 前 hook の一致、未変更部分は独立実行していないとしている。
対応:
- `npm pack` の配布経路は R2-005 で自己 verify の必須チェックになった
- commit との一致・テストログ・push / tag の実在は、次回のパケット（`review-packet-m0-r2.md`）にコミット範囲と実行記録を含める。レビュアー側で `git show` により照合可能
- Linux / Windows は M3（R-011 後半）、masker と hook の一致は M1（R-012）のまま
