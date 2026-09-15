# M0 独立レビュー結果 — Claude Code 修正依頼用

対象: `ai-quality-harness` M0  
レビュー資料: `review-packet-m0.md`  
対象コミット: `776a875`  
レビュー日: 2026-09-15

## Claude Code への依頼

以下は実装担当AIとは独立したレビュー結果です。

各指摘について、実装済みコードを実際に確認したうえで、次のいずれかを判断してください。

- `VALID`: 指摘どおり問題がある
- `PARTIAL`: 一部のみ問題がある
- `INVALID`: 指摘は成立しない

`INVALID` / `PARTIAL` とする場合は、必ず実コード・テスト結果・仕様のいずれかを根拠として説明してください。  
`VALID` の場合は、M0の要求範囲を逸脱しない最小修正を行い、必要な回帰テストを追加してください。

特に **R-001〜R-005 は優先確認対象**です。

---

## R-001

- **ID:** R-001
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/security/mask.ts` — `key-value` rule
- **内容:** 一般的な環境変数形式の秘密情報がマスクされない。特に `AWS_SECRET_ACCESS_KEY=...`、`AWS_SESSION_TOKEN=...` のような名前が漏れる。
- **根拠:** `key-value` 正規表現は `\b` の直後から `secret_key` / `token` 等が始まることを要求している。しかし `_` は正規表現上の word character なので、`AWS_SECRET_ACCESS_KEY` 内の `SECRET_ACCESS_KEY` 等の前には word boundary が成立しない。また AWS 専用ルールが対象にしているのは `AKIA` / `ASIA` で始まるアクセスキーIDのみで、Secret Access Key や Session Token は対象外。
- **独立確認:** review packet掲載の正規表現と同じ条件で、`AWS_SECRET_ACCESS_KEY=...` および `AWS_SESSION_TOKEN=...` が無加工で残ることを確認した。
- **修正案:** `AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN` 等を明示的に追加する。さらに `MY_API_KEY`、`FOO_PASSWORD`、`XXX_TOKEN` のような接頭辞付き環境変数を検出できるルールを検討する。これらをマスクテストへ追加する。

---

## R-002

- **ID:** R-002
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/security/mask.ts` — `bearer` rule
- **内容:** Authorization の認証情報を正しくマスクできないケースがある。特に小文字の `bearer` と短い Basic Authentication が漏れる。
- **根拠:** 正規表現が `/g` のみで `/i` がなく、`Bearer` / `Basic` の大文字小文字を固定している。また資格情報部分に `{16,}` を要求しているため、有効でも短いBasic credentialは対象外になる。
- **独立確認:** review packet掲載ルールと同条件で、`Authorization: bearer abcdefghijklmnopqrstuvwxyz` と `Authorization: Basic dTpw` が無加工で残ることを確認した。
- **修正案:** Basic と Bearer を別ルールに分ける。認証schemeは case-insensitive にする。Basicは妥当なBase64形式を対象にし、不要な16文字以上制約を外す。大文字・小文字・短いBasic・padding有無のテストを追加する。

---

## R-003

- **ID:** R-003
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/security/mask.ts` — `key-value` rule
- **内容:** 引用符付きで空白を含む秘密値は途中までしかマスクされず、秘密値の後半がreportへ残る。
- **根拠:** 値部分が `[^\s"',;]+` のため、空白や引用符で停止する。例えば `password="abc def ghi"` は先頭部分だけが置換対象となり、`def ghi` が残る。
- **独立確認:** review packet掲載ルールと同条件で、`password="abc def ghi"` が `password="[REDACTED:key-value] def ghi"` 相当になることを確認した。
- **修正案:** quoted value と unquoted value を分離して処理する。`password="..."` / `password='...'` は対応する閉じ引用符まで全体を置換する。JSON、dotenv、shell形式、空白を含む値をテストへ追加する。

---

## R-004

- **ID:** R-004
- **重要度:** High
- **種別:** バグ
- **対象:** `src/runner/execute.ts` — `killTree()`
- **内容:** タイムアウト後の `SIGKILL` エスカレーションが実行されず、子孫プロセスが生き残る経路がある。
- **根拠:** `killTree()` は `child.exitCode !== null || child.signalCode !== null` なら即returnする。POSIXではprocess group leaderのshellだけが `SIGTERM` で先に終了し、同groupの子孫がSIGTERMを無視して生存することがある。この状態で5秒後の `killTree(child, "SIGKILL")` が呼ばれても、leaderには既に `signalCode` が設定されているためreturnし、groupへSIGKILLが送られない。
- **独立確認:** POSIX process groupで、leader shellがSIGTERM終了し、TERMを無視する子プロセスが同groupに残る状態を再現した。この状態では現在のguard条件相当だとSIGKILL段階がskipされる。
- **修正案:** POSIXでは保存済みPGIDに対する `process.kill(-pgid, signal)` をgroup leaderの終了状態にかかわらず試す。直接 `child.kill()` するfallback時だけchild状態を確認する。TERM無視childを用いた統合テストを追加する。

---

## R-005

- **ID:** R-005
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/config/load.ts` — `resolveInsideRoot()`
- **内容:** 「project root 内に限定する」という制約をsymlinkで回避できる。
- **根拠:** 現在のチェックは `path.resolve()` と `path.relative()` によるlexical path判定のみで、実ファイルシステム上のsymlink解決後のパスを確認していない。例えば `/repo/link -> /tmp/outside` の場合、文字列上は `/repo/link` がroot内でも、実際の `cwd` はroot外になる。
- **修正案:** project root と対象pathを可能な範囲で `realpath` 化し、実体パスでcontainmentを検証する。未作成output directoryの場合は、存在する最も近い親directoryをrealpath化して判定する。`cwd` / output path両方にsymlink escapeテストを追加する。

---

## R-006

- **ID:** R-006
- **重要度:** High
- **種別:** 設計
- **対象:** `aiqh.config.jsonc` / ADR 0005 / self-verification architecture
- **内容:** 品質ゲートのポリシー自身が検証対象repositoryから自由に変更できるため、「fail closed」は現在読み込んだconfigに対してしか保証されない。
- **根拠:** configはtrusted inputとして扱われ、`shell: true` でcommandが実行される。したがって、検証対象側がconfigをrequired check 1件・常に成功するcommand等へ変更してもschemaを満たせる。`package.json` scripts自体を弱体化することも可能。
- **修正案:** M0で完全解決がscope外なら、trust boundaryをARCHITECTURE/ADR/READMEで明示する。M1以降で、protected policy、config hash固定、quality-policy変更時の別承認等の設計を検討する。「悪意ある/改変されたconfigに対する独立性は提供しない」と明示する。

---

## R-007

- **ID:** R-007
- **重要度:** High
- **種別:** バグ
- **対象:** `src/commands/verify.ts` — report write error handling
- **内容:** report書き込み失敗時でも、consoleに `VERIFY PASSED (report not written)` と表示される可能性がある。
- **根拠:** write failureのcatch内で `report.verdict` をそのまま表示し、その後 `EXIT_ERROR` を返している。検証本体がPASSEDでreport保存だけ失敗した場合、人間やlog parserには「成功」と誤認され得る。
- **修正案:** `VERIFY ERROR (report not written)` または `VERIFY FAILED (report write error)` に固定する。`PASSED` という文字列はexit 0時にしか出力しないinvariantをテスト化する。

---

## R-008

- **ID:** R-008
- **重要度:** Medium
- **種別:** テスト不足
- **対象:** `package.json` / `dist/cli.js` / CLI packaging
- **内容:** Original Requestにある `npx aiqh verify` の実配布形態が検証されていない。
- **根拠:** review packetでは `npm run verify` と手動の `verify:dist` は確認されているが、consuming repositoryからの `npx aiqh` は未確認と明記されている。またdist版確認はfixture変更前のtree。
- **修正案:** `npm pack` → 一時directoryへinstall → `npx --no-install aiqh verify` のsmoke testを追加する。これによりbin、shebang、dist同梱、package metadataをまとめて検証できる。

---

## R-009

- **ID:** R-009
- **重要度:** Medium
- **種別:** バグ
- **対象:** `src/git/info.ts`
- **内容:** Git情報取得失敗を `dirty=false` と扱うため、「不明」を「clean」と誤表示する。
- **根拠:** review packetのKnown Risksに、git command timeout時は該当fieldがnull、`dirty` はfalseになると記載されている。falseは「確認済みclean」に見え、監査情報として意味が異なる。
- **修正案:** `dirty: boolean | null` または `CLEAN | DIRTY | UNKNOWN` とする。将来gate条件へ使用する場合はUNKNOWNをfail側へ倒す。

---

## R-010

- **ID:** R-010
- **重要度:** Medium
- **種別:** 設計
- **対象:** `src/report/write.ts` / `latest.json` / `latest.md`
- **内容:** concurrent run時に `latest.json` と `latest.md` が別runの結果になる可能性がある。
- **根拠:** 個々のfileをatomic renameしても、2file全体はtransactionではない。Run AとRun Bが交差すると、JSONとMarkdownが異なるrun由来になる可能性がある。
- **修正案:** 各runを `runs/<runId>/` に書き、最後に単一の `latest` pointer/manifestだけをatomicに更新する。またはlatest更新全体をlockする。M0で未対応ならknown riskをより具体化する。

---

## R-011

- **ID:** R-011
- **重要度:** Medium
- **種別:** テスト不足
- **対象:** `src/runner/execute.ts` / platform verification
- **内容:** POSIX固有のprocess-group処理を採用しているのにLinuxで未検証。
- **根拠:** 実装はmacOS/Linuxで `detached` とnegative PID signalを使う設計だが、review packetではmacOSのみ検証済み、Linuxは明示的に未確認。
- **修正案:** Ubuntu CIを最低1本追加し、正常終了、non-zero exit、timeout、TERM無視、stdout/stderr大量出力を検証する。WindowsをM0対象外とするならSupported PlatformsをREADMEで明示する。

---

## R-012

- **ID:** R-012
- **重要度:** Medium
- **種別:** テスト不足
- **対象:** `tests/helpers.ts`, `tests/mask.test.ts`, pre-push secret guard
- **内容:** masker用fixtureをsecret guardが検出しない形へ意図的に分割しているため、maskerとpre-push guardの検出仕様の整合性が保証されない。
- **根拠:** `fake(prefix, body)` はscannerへliteralを置かないために導入されており、packet自身もmaskerとlocal pre-push guardが異なるregexを使用し、その一致をテストしていないと記載している。
- **修正案:** 可能ならscanner側へ明示的なtest fixture allowlistを設け、完全なsynthetic credentialを安全にfixtureとして保持する。難しい場合でも、runtime生成したcredential corpusをmaskerとguard双方へ入力するcompatibility testを追加する。

---

## R-013

- **ID:** R-013
- **重要度:** Low
- **種別:** 性能
- **対象:** `src/runner/execute.ts`
- **内容:** 各stream最大10MiBをmemory保持する設計は、reportには200行/64KiB tailしか残さない現在仕様に対して大きく、将来並列実行と相性が悪い。
- **根拠:** M0はsequentialなので致命的ではないが、将来parallel化すると `check数 × stdout/stderr各10MiB + Buffer overhead` へ増える。
- **修正案:** report用途だけならstreaming ring bufferで必要tailのみ保持し、総byte数とtruncated flagを記録する。完全captureが必要ならtemp fileへstreamする。

---

# 指摘なしと判断した観点

review packetに掲載されたコード断片の範囲では、以下について明確な問題は確認しなかった。

1. `computeVerdict()` はrequired checkが1件以上あり、すべてPASSの場合のみPASSEDとなる。
2. requiredな`SKIPPED`もPASSとして扱われず、fail-closedの方向になっている。
3. schemaでもrequired checkが0件になるconfigをrejectしている。
4. check nameの完全一致重複をrejectしている。
5. `../` やabsolute pathによる通常のlexical path traversalは防いでいる。R-005はsymlinkによる別経路。
6. config errorをnon-zero `EXIT_ERROR` にする方針はfail-closed。
7. optional failureをfinal verdict対象外とする挙動はOriginal Requestと整合している。
8. report objectの全stringへdeep maskingする方針自体は妥当。問題は検出ruleの網羅性。
9. lint / typecheck / unit / build / dependency auditをself-applicationする構成はM0要求と対応している。

---

# 未確認範囲

今回の資料はrepository 46filesすべての完全なsourceではなく、`review-packet-m0.md` に掲載された抜粋を主な根拠としている。したがって、以下は「指摘なし」ではなく未確認。

- `src/runner/execute.ts` 全文のevent listener / cleanup / output cap実装
- `src/runner/run-checks.ts` のfail-fast / SKIPPED生成 / status変換
- `src/report/write.ts` の実際のatomic write手順
- `src/report/markdown.ts` のMarkdown escaping / code-fence injection耐性
- `src/report/build-report.ts` とcategory aggregation全体
- `src/config/schema.ts` のtimeout / size / string length等のvalidation全文
- `package.json` のbin / shebang / files / prepare / build / package設定
- 72 unit testsのassertion全文
- `docs/ARCHITECTURE.md` / `ROADMAP.md` / `CONFIG_SPEC.md` / ADR全文
- READMEに個人情報・会社固有情報が本当に存在しないか
- pre-push secret guardそのものの実装

---

# 推奨対応順

1. **R-001〜R-005** を最優先で実コード確認・修正
2. **R-007** を修正
3. **R-008 / R-011 / R-012** でverification coverageを強化
4. **R-006 / R-009 / R-010** をM0で直すか、M1以降へ明示的に持ち越すか判断
5. **R-013** は将来拡張時の最適化候補

特に **R-004** は単なる理論上のKnown Riskではなく、POSIX相当環境で「group leaderのみ終了し、SIGTERMを無視するchildが残る」状態を独立に再現しているため、優先度を下げないこと。
