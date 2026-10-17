# M4 の設計の案（設計 R3）— 設定のハッシュ・`aiqh history`・静的 HTML のダッシュボード

- 版: 設計 R3（2026-10-17）。v0.10.0 で `docs/reviews/m4-design/design-r3.md` として記録する
  - 設計 R2 の独立レビューの結果（High 0 / Medium 3 / Low 0）と、論点 Q10・Q11 の人間の決定を入れた
  - **設計 R3 の独立レビューは依頼しない**（人間の決定、2026-10-17）。R2 の 3 件が解消したかは、v0.11.0 の実装レビュー（コードを添付する）で確かめる
  - R1・R2 の指摘への対応は、`docs/reviews/m4-design/response-r1.md`・`response-r2.md` にもまとめた
- 基準の commit: `fe8de3aeead02b2909c2a15024096a2fc45b687e`（main。v0.9.2 の後の記録の PR の merge）
- 番号: ADR-0033 は v0.10.0 で採用として入れる。ADR-0034・ADR-0035 は、それぞれ v0.11.0・v0.12.0 で入れるまで案
- 表記: 事実（コード・文書で確かめたこと）には、リポジトリの中のファイルと行を付ける。[推定] は確かめていない見込み
- 節の記号（ADR-0034 の A〜L、各 ADR の決定の番号）は R1 のまま残し、足したものは後ろに続けた（R1・R2 のレビューの「対象」の書き方が、そのまま通じるように）

## R2 からの変更点（設計 R3）

| R2 の指摘 | 重要度 | 対応 | 変えた節 | 要点 |
|---|---|---|---|---|
| M4-D-R2-001（最終の JSON とマスク） | Medium | 受け入れ | ADR-0034 の F・G・H・I・M、N（出力の大きさの上限。新）、ADR-0035 の決定 5・既知の限界 | `safeJson` は JSON の全体ではなく、文字列とキーを 1 つずつマスクする（`src/output.ts:119-168`。コードで確かめた）。**集計の JSON の全体を `maskSecrets` に渡さない**ことを要件にした。端末・`--json`・HTML の最終の出力の実バイト数に上限（32 MiB）を置き、超えたら `HISTORY ERROR (output-too-large)`・exit 2・何も出さない。`output.ts` に、上限つきで JSON を出す口を足す案（実装は v0.11.0） |
| M4-D-R2-002（タイムアウトに対する割合） | Medium | 受け入れ | ADR-0034 の E・G・M、ADR-0035 の決定 6 | run ごとに `durationMs / (timeoutSec × 1000)` を計算し、その最大を `maxShareOfTimeout` にする。最後の run の `timeoutSec` は別の属性 `lastTimeoutSec` として持つ |
| M4-D-R2-003（極端な数） | Medium | 受け入れ | ADR-0034 の C の 5・C の 9（新）・E・G・H・M、ADR-0035 の決定 4 | 数は `Number.isSafeInteger` の範囲に限る。`timeoutSec` は設定と同じ「正の整数」（`src/config/schema.ts:21, 73`）で、安全な整数の範囲。範囲の外は `bad-shape`。計算の後にも `Number.isFinite` を確かめ、破綻したら `HISTORY ERROR (non-finite)`・exit 2（届かないはずの守り） |

- **Q10・Q11**: 人間が推奨 (a) に決めた（2026-10-17。§0.4・§5.1）
  - Q10: 集計の数の葉の総数に上限 200,000。超えたら `HISTORY ERROR (too-many-values)`・exit 2・何も出さない。値は v0.11.0 で実例から測って ADR に書く（ADR-0034 の N）
  - Q11: 既知の限界として `docs/CONFIG_SPEC.md` に書き（v0.11.0）、verify は変えない
- **新しい論点**: Q12（M4 の外。設定の `timeoutSec` が約 24.8 日を超えると、check がすぐ時間切れになる）を §5.2 に足した

## R1 からの変更点（設計 R2）

| R1 の指摘 | 重要度 | 対応 | 変えた節 | 要点 |
|---|---|---|---|---|
| M4-D-R1-001（読み取り量の上限） | Medium | 受け入れ | ADR-0034 の B の 5、C の 1、C の表（`too-large`・`unreadable`）、D、H、M（テストの計画。新）、既知の限界 | 事前の `fstat` の大きさに頼らず、記述子から最大「上限 + 1 バイト」までしか読まない。読んだ量で `too-large` を決める。読む前・読んだ後の大きさと読んだ量が違えば `unreadable`（`code` は `size-changed`）。全体の 256 MiB は実際に読んだバイト数の合計で確かめる |
| M4-D-R1-002（祖先のディレクトリの差し替え） | Medium | 一部受け入れ | ADR-0034 の脅威モデル（新）、B の 1・B の 7（新）、H、M、既知の限界 | Node の `fs` には、ディレクトリの記述子を基準に子を開く API が無い（公式の文書で確かめた。B の 7）。記述子を基準にした探索はできないので、脅威モデルの明示的な制限とし、`dev`・`ino` の読み始めと読み終わりの比較で**検出**する（防止ではない） |
| M4-D-R1-003（自由な文字列の長さ） | Medium | 受け入れ | ADR-0034 の C の 5、C の 8（新）、F、M、§4.4 の項目 40 | `project.name`・`checks[].name` は 256 バイト、`tool.version` は 64 バイト、1 run の checks は 256 個まで。超えたら切り詰めずに `bad-shape`（マスクにも渡さない） |
| M4-D-R1-004（HTML と JSON の数の照合） | Medium | 受け入れ | ADR-0034 の G（割合の丸め・キーの規則）、ADR-0035 の決定 4・6・既知の限界、§4.2、§4.5 | 数の葉の対応表（JSON のパス → HTML の表示先）、照合しない数の許可リスト、`data-k` の作り方を明文にした。SVG の図形の大きさは照合しない（図の点の数だけを照合する） |
| M4-D-R1-005（ADR-0029 の注記） | Low | 受け入れ | ADR-0034 の E、§4.3（v0.11.0 の commit (1)・(3)） | ADR-0029 への注記の文を書き、v0.11.0 の docs の commit に入れる。ルールの名前が出ないことのテストは、集計の commit に入れる |
| 問い 2 の言い回し | — | 受け入れ | ADR-0034 の C の 5 | 「メモリに残さない」を「`JSON.parse` の後に、許可リストの外の値を保持しない（解析の間は一時的にメモリにある）」に言い直した |

- **Q1〜Q9**: 人間が推奨どおりに決めた（2026-10-17）。本文の「論点」の書き方を「決定」に直し、§5 の表を「決定済み」にした（§0.4）
- **新しい論点**: Q10（集計の大きさの上限）・Q11（設定が許すが、履歴の読み方が拒むもの）を §5 に足した
- **取り込み**: R1 と R2 の結果の `aiqh review-import` は、v0.10.0 の PR でまとめて行う（§4.3）

## 0. 前提

### 0.1 aiqh と M4

- aiqh は、AI 駆動開発のための fail closed な品質ゲート（`aiqh verify`）。必須のチェックが 1 つでも失敗すれば VERIFY FAILED（終了コード 1）、実行できなければ ERROR（2）
- M3 までに、自己 CI、本体の main の pull request 必須（必須チェック 2 つ。ADR-0032）、再利用ワークフロー（ADR-0031）、個人のリポジトリ 2 つへの適用を終えた
- M4 の当初の計画（`docs/ROADMAP.md:949-964`）は「履歴 DB・ローカルダッシュボード・運用テンプレート」と、独立レビュー R1 の持ち越しの R-010・R-006（候補 2・3）

### 0.2 人間の決定（2026-10-17。M4 SP1 の調査を受けて）

| # | 決定 |
|---|---|
| D1・D12 | DB を持たない。`history/*.json` を読み取りだけで集計する。`node:sqlite`・JSON Lines は M4 では使わない。再検討の条件を ADR に書く |
| D2 | `--from <dir>` を繰り返して、読む場所を指定する |
| D3 | プロジェクトは `project.name` で見分ける |
| D4 | 読めない履歴は一覧に出して集計を続け、終了コードは 2 |
| D5 | `schemaVersion` は 1 だけを読む。足された欄は無くてよい。ほかの版は読めないものとして数える。形はキーの有無で判断する |
| D6 | 端末の表・`--json`・HTML に出すのは、数と状態だけ。出さないもの: tail・command・cwd・絶対パス・errorSummary・`parsed.items` の名前。表示する文字列は、表示のときにもう一度 `maskSecrets` に通す |
| D7 | ダッシュボードは、script の無い静的な HTML 1 ファイル（CSP の meta、インラインの CSS と SVG だけ） |
| D8 | 出力先は `--out`。既定は実行した場所の `artifacts/history/` |
| D9 | 設定のハッシュは、設定ファイルのバイト列の SHA-256 を、レポートの最上位に `configSha256` として足す。`schemaVersion` は 1 のまま |
| D10 | R-006 の候補 3（品質ポリシーの変更の別承認）は、docs の手順だけ |
| D11 | R-010 は M4 では作らず、ADR に行き先を書く |
| D13 | 版は機能ごとに minor を上げる（v0.10.0・v0.11.0・v0.12.0） |
| D14 | 散らばる本体の履歴（SHA 固定の worktree での検証の履歴が worktree と一緒に消えること）は受け入れる |
| D15 | 独立レビューは 3 回（この設計・v0.11.0・v0.12.0） |

### 0.3 いまの履歴の形（事実）

- verify は `src/report/write.ts:16-38` の `writeReports()` で、`latest.json`・`latest.md`・`history/<stamp>.json` を書く
  - 書く順は latest.json → latest.md → history
  - それぞれ `writeAtomic()` で書く（一時ファイル → rename。`src/report/write.ts:100-109`）
  - history の内容は latest.json と同じバイト列
- history の名前は `startedAt` から作る（`20260915T123456Z`。`src/report/write.ts:41-43`）
  - `<stamp>.json`・`<stamp>-2.json`・… を `openSync(…, "wx")` で排他的に取る（N1。`src/report/write.ts:52-70`）
  - 取ってから rename するまでの間に強制終了されると、空のファイルが残る（`docs/ARCHITECTURE.md:124`）
- レポートの形は `src/types.ts:187-203`（最上位 14 キー）と `src/types.ts:150-170`（check ごと 17 欄と、任意の `parsed`）
  - `schemaVersion` は 1 で固定（`src/report/build-report.ts:22`）
  - 欄を足しても 1 のまま（`interruptedBy` は v0.1.2 から、`parsed` は v0.8.0 から。ADR-0028 の決定 9）
- マスク: `buildReport()` が、すべての文字列とキーを `maskSecrets` に通した写しを作る（`src/report/build-report.ts:37`）
  - 秘密の形だけを伏せる。絶対パス（`project.root`・`configPath`）・コマンド・出力の末尾の中のパスやテスト名は残る
- 出力の末尾は、check ごと・ストリームごとに 200 行かつ 64 KiB まで（`src/runner/run-checks.ts:19-21`）
- `parsed` の上限: 読むのは末尾 1 MiB・1 行 4,096、名前は 50 件 × 300（`src/parse/text.ts:12-20`）
- 手元の実例（M4 SP1。aiqh 本体と適用先 2 つ。値は写していない）
  - 245 件、1 件 3,467〜29,159 バイト
  - すべて `schemaVersion: 1`。形は 3 種類（`interruptedBy` 無し／`parsed` 無し／`parsed` あり）
  - `tool.version` が同じ "0.1.0" の中に 2 つの形がある
  - `project.root`・`configPath` は全件が絶対パス、`checks[].cwd` は全件が相対
  - 読み込みと JSON の解析は 11〜77 ms、集計は 1 ms 未満
- `schema/` には設定の JSON Schema しかない。レポートの形の定義は TypeScript の型だけ

### 0.4 設計の論点の決定（Q1〜Q11。人間の決定、2026-10-17。Q1〜Q9 は設計 R1、Q10・Q11 は設計 R2 の推奨どおり）

| # | 決定 | 本文の場所 |
|---|---|---|
| Q1 | security-scan の数（`suppressed`・`allowRulesUsed`・`expiredAllowRules`・`unusedAllowRules`）の日ごとの推移だけを出す。ルールごとの回数は出さず、ADR-0029 に注記する | ADR-0034 の E |
| Q2 | `git.branch`・`checks[].description`・`git.commit` は、3 つとも出さない | ADR-0034 の C の 5・F |
| Q3 | `--from` のパスは番号（`#1`）だけで示す | ADR-0034 の B の 6 |
| Q4 | 全体の上限を超えたら、入力の誤り（exit 2、集計を出さない） | ADR-0034 の D |
| Q5 | 1 ファイルの上限を変えるオプションは作らない | ADR-0034 の C の 1 |
| Q6 | 中断で残った空の履歴のファイルは `empty` として exit 2 | ADR-0034 の C の表 |
| Q7 | 同じ内容の重複は 1 回だけ数え、その数を情報として出す（exit 0） | ADR-0034 の C の 7 |
| Q8 | CSP の style-src は、固定の CSS のハッシュ | ADR-0035 の決定 3 |
| Q9 | v0.10.0 では、`latest.md` に設定のハッシュを出さない（JSON だけ） | ADR-0033 の決定 7 |
| Q10 | 集計の数の葉の総数に上限 200,000。超えたら `HISTORY ERROR (too-many-values)`・exit 2・何も出さない。値は v0.11.0 で実例から測って ADR に書く | ADR-0034 の N |
| Q11 | 設定が許すが履歴の読み方が拒むもの（257 個以上の checks・257 バイト以上の名前）は、既知の限界として `docs/CONFIG_SPEC.md` に書く（v0.11.0）。verify は変えない | ADR-0034 の既知の限界 |

---

## 1. ADR-0033（案）: verify のレポートに、設定ファイルのバイト列の SHA-256 を `configSha256` として記録する

- 状態: 提案（v0.10.0 の予定。R-006 の対策候補 2〈ROADMAP の「設定ハッシュの固定」〉を「記録」として実装する。候補 3 は docs の手順〈決定 6〉）
- 日付: 2026-10-17（設計 R1。設計 R2 で、Q9 の決定を入れた。ほかは R1 のまま）

### 文脈

- 独立レビュー R1 の R-006（High。`docs/reviews/m0/independent-review-r1.md:89-97`）
  - 品質ゲートの方針（設定）を、検証されるリポジトリ自身が変えられる
  - そのため fail closed は「読み込んだ設定に対して」しか保証されない
  - 対策の候補は、protected policy・config hash の固定・品質ポリシーの変更の別承認
- M0 で信頼境界を文書にした（`docs/ARCHITECTURE.md:409-416`）。候補 1（CODEOWNERS と必須レビューの手順）は M3 で手順だけ書いた（`docs/reports/M3_COMPLETION.md:28`）
- いまのレポートには、どの設定で検証したかの記録が無い。`configPath` は絶対パスで、内容を表さない
- verify は設定を 1 回だけ読む（`src/config/load.ts:35-40` の `loadConfig` → `readConfigTextIfExists`。`readFileSync(path, "utf8")`、`src/config/load.ts:70-80`）
- 読めない・無い・不正な設定では、レポートを書かずに exit 2 で終わる（`src/commands/verify.ts:69-82`）

### 決定

1. **ハッシュするもの**: verify が読んだ設定ファイルの**バイト列**。
   - `loadConfig` は、ファイルを `Buffer` として 1 回だけ読み、その同じ `Buffer` から次の 2 つを作る
     - SHA-256（`node:crypto` の `createHash`。すでに `src/review/packet.ts:358` などで使っている）
     - 文字列（`buffer.toString("utf8")`。いまの `readFileSync(path, "utf8")` と同じ文字列 [推定。テストで確かめる: BOM・不正な UTF-8 を含むファイルで、解析の結果が変わらないこと]）
   - 読んだ後でファイルが変わっても、ハッシュは「検証に使った内容」を表す。読み込みとハッシュの間に別の読み込みは無い
2. **置き場所**: レポートの最上位、`configPath` の直後に `configSha256`
   - 最上位のキーの順は `schemaVersion`・`tool`・`project`・`configPath`・**`configSha256`**・`startedAt`・…・`checks` の 15 個になる
   - ADR-0028:91 は「最上位に欄を足す案」を、check との対応を失うので採らなかった。設定のハッシュは run の属性で、check との対応は無いので、その理由は当たらない
3. **値の形**: 小文字の 16 進 64 桁（`/^[0-9a-f]{64}$/`。`digest("hex")` の出力）
   - マスクで変わらないことを確かめた（`maskSecrets` に値・`configSha256: <値>`・JSON の 1 行を渡しても同じ文字列）
4. **値が無いとき**: **欄を書かない**（`null` にしない）。
   - verify のレポートは、設定を読めたときにしか書かれない（`src/commands/verify.ts:69-82`）。「読めなかったのでハッシュが無い」レポートは存在しない
   - 欄が無いのは、v0.10.0 より前のレポート（と、テストが `buildReport` を設定のファイル無しで呼んだもの）だけで、意味は「記録されていない」
   - `null` にすると「設定が読めなかった」と読める余地が生まれる
   - 型は `configSha256?: string`（`parsed?` と同じ扱い。`src/types.ts:169`）。verify は必ず書く（テストで固定する）
5. **`schemaVersion` は 1 のまま**（足すだけ。ADR-0003:10 の「後方互換の変更」、ADR-0028 の決定 9 の前例）
6. **R-006 の候補 3（品質ポリシーの変更の別承認）は docs の手順にする**（人間の決定 D10）
   - 手順は M4 の運用テンプレートの版で `docs/ops/` に書く
   - 内容: 設定・設定が呼ぶ scripts を変える PR では、説明にその旨と理由を書く。CODEOWNERS を確かめる。merge の後、`aiqh history` でハッシュの変わり目を確かめる
   - aiqh は承認を強制しない
7. **`latest.md` は変えない**（v0.10.0 では JSON だけ。Q9 の決定）。`latest.md` の表と、Job Summary（`.github/workflows/verify.yml:125-130`）の見た目は変わらない

### 守れないこと（既知の限界。誤った安心を与えないために、ROADMAP の「固定」を「記録」と言い換える）

- **設定の外の変更は検出しない**: 次のような変更は、ハッシュに表れない
  - `package.json` の scripts（`npm test` などが指す中身）
  - テストのファイル、lint・テストの道具の設定
  - 環境変数、依存の版
  - R-006 の根拠の「scripts の弱体化」（`docs/reviews/m0/independent-review-r1.md:96`）は残る
- **期待の値はどこにも固定しない**: 同じリポジトリの PR で、設定も（もしあれば）期待の値も一緒に変えられる
  - ハッシュは「いつ変わったか」を後から見せる記録で、変更を止める仕組みではない
  - 止めるのは、pull request の必須化と人のレビュー（ADR-0032）
- **何が変わったか・弱くなったかは分からない**: 空白やコメントだけの変更でも値は変わる
- **security の check の子は、設定を自分でもう一度読む**: `aiqh security-scan` を check のコマンドにしているとき、その子のプロセスは設定を別に読む（`src/config/load.ts:49-55`）
  - verify が読んでから子が読むまでの間に設定が変わると、ハッシュは子が使った内容を表さない
- v0.10.0 より前のレポートには無い（`aiqh history` は「不明」として扱う。ADR-0034）

### 既存のテストの期待値を変える箇所（v0.10.0 の指示書で、この 3 か所の変更が承認された）

| ファイル | 行 | いまの中身 | 変更 |
|---|---|---|---|
| `tests/regression-backlog9-report-json-copy.test.ts` | 75 | `expect(Object.keys(r)).toEqual(["schemaVersion", "tool", "project", "configPath", "startedAt", …, "checks"])`（14 個） | `"configPath"` の後ろに `"configSha256"` を足す（15 個） |
| 同 | 18-33 | 補助関数 `report()` が `buildReport` に渡す設定のリテラル（`configSha256` 無し） | 設定に、固定の 64 桁の値（決まった文字列の SHA-256 など）を足す。足さないと 75 行の期待値と合わない |
| `tests/parse-verify.test.ts` | 74 | `const REPORT_KEYS = ["schemaVersion", "tool", "project", "configPath", "startedAt", …, "checks"]`（14 個） | `"configPath"` の後ろに `"configSha256"` を足す |
| 同 | 141 | `expect(Object.keys(r.report)).toEqual(REPORT_KEYS)`（実際の `runVerify` が書いた latest.json の最上位のキー） | 行は変えない（74 行の定数が変わる）。テストの名前「top-level keys and schemaVersion unchanged」（139 行）は「top-level keys (configSha256 added in v0.10.0) and schemaVersion unchanged」のように直す |

- ほかに、レポートの最上位のキーの並び・全体を固定したテストは見つからなかった
  - `tests/` の `Object.keys(…)` の検索、スナップショットの有無（0 件）、`latest.json` の全体比較を grep した
- 設定のリテラルを `buildReport` に渡すテスト（14 ファイル）は、型を任意にするので変えない
- 新しいテスト（v0.10.0 の指示書のとおり）
  - verify が書いた latest.json と history に、設定ファイルのバイト列の SHA-256（小文字 16 進 64 桁）が入る。最上位で `configPath` の直後
  - 設定を 1 バイト変えると値が変わる
  - `maskSecrets` に通しても値が変わらない。`schemaVersion` は 1 のまま
  - ファイルを 1 回だけ読み、同じ Buffer から文字列とハッシュを作る読み方が、いまの読み方（`readFileSync(path, "utf8")`）と同じ文字列になる（BOM あり・不正な UTF-8・CRLF を含む）。読み込みの誤りの扱い（エラーの文言・終了コード）も変わらない
  - `latest.md` に設定のハッシュが出ない（Q9）
  - 設定が読めないときは、これまでどおりレポートを書かずに exit 2
  - review-packet の Verification の節は変わらない

### ADR-0006・ADR-0007 への注記（v0.10.0 で足す文）

- **ADR-0006 の 8 行目の後ろ**:
  > 注記（v0.10.0）: 「M3 では CI の artifact としてアップロードされる」は、そのとおりにはならなかった。自己 CI（ADR-0025）と再利用ワークフロー（ADR-0031）は、レポートを artifact に上げない。CI では、再利用ワークフローの入力 `job-summary: true` のときだけ、マスク済みの `latest.md` を Job Summary に足す。この ADR のマスクの決定は変えない。
- **ADR-0007 の 19 行目の後ろ**:
  > 注記（v0.10.0）: 「CI ではワークフロー artifact（M3）、ローカルでは履歴 DB（M4）が保存先になる」は、どちらもそのとおりにはならなかった。CI のレポートは artifact に上げない（ADR-0025・0031）。M4 は DB を持たず、各プロジェクトの `history/*.json` を読み取りだけで集計する（ROADMAP の M4。決定の ADR は `aiqh history` の版で足す）。`artifacts/` を git 管理外にする決定は変えない。

### 代替案

- **解決した後の設定（checks の一覧など）をハッシュする**: 空白・コメントの変更に強い。ただし、正規化の規則を自分で決めて保つ必要があり、人が `shasum -a 256` で同じ値を出せない。採らない
- **設定と、それが呼ぶ `package.json` の scripts をまとめてハッシュする**: R-006 の根拠に近づく。ただし、scripts の中身はさらに別のファイルを呼ぶので、どこまで含めても切れ目がある。範囲の説明が難しく、誤った安心を与えやすい。採らない（後で検討）
- **check ごとに置く**: run の属性なので合わない
- **`null` を書く**: 決定 4 の理由で採らない
- **期待のハッシュを固定して、違えば FAIL**（R-006 の「固定」の字義）: 期待の値を同じリポジトリに置くと、同じ PR で変えられ、独立にならない。採らない（人間の決定 D10）

### 影響

- `src/config/load.ts`（読み方を Buffer に）
- `src/types.ts`（`ResolvedConfig` と `VerificationReport` に任意の欄）
- `src/report/build-report.ts`（`configPath` の直後に書く）
- 上の表のテスト 2 ファイル、新しいテスト
- docs: `docs/ARCHITECTURE.md` §7.1（レポートの仕様）、ADR-0006・0007 の注記、README の出力の説明、ROADMAP の M4
- 依存・組み込みのモジュールの一覧（ADR-0019）・書き込みの出口（ADR-0020）は変わらない

---

## 2. ADR-0034（案）: `aiqh history` — 履歴を DB 無しで、読み取りだけで集計する

- 状態: 提案（v0.11.0 の予定。ARCHITECTURE の「履歴 DB」〈`docs/ARCHITECTURE.md:91, 150, 326-329`〉を、DB を持たない集計に置き換える。ADR-0003 の代替案「SQLite に直接保存は M4 で扱う」〈ADR-0003:29〉への答え）
- 日付: 2026-10-17（設計 R1。設計 R2 で、M4-D-R1-001〜005 と Q1〜Q7 の決定を入れた。設計 R3 で、M4-D-R2-001〜003 と Q10・Q11 の決定を入れた）

### 文脈

- 計画では、複数プロジェクトの `history/*.json` をユーザーローカルの 1 か所（例: `~/.aiqh/history.db`）に取り込む想定だった（`docs/ARCHITECTURE.md:326-329`）
- `node:sqlite` について（M4 SP1 で調べた）
  - Node 24.13.1 では Stability 1.1（実験的）
  - `import` しただけで、標準エラーに `ExperimentalWarning` が出る（aiqh の出口〈ADR-0016〉の外）
  - `--no-experimental-sqlite` で import が失敗する
  - `engines` の範囲（`>=24.0.0`）で API が違う
  - 使うには、組み込みの一覧（ADR-0019。`tests/structure/output-guard.ts:90`）と書き込みの出口（ADR-0020）の例外が要る
- いまの量（245 件）では、DB なしの読み込みと解析が 11〜77 ms で済む
- 履歴の中身は、検証されるリポジトリの道具の出力に由来する。**信頼しない入力**として読む（壊れたファイル・symlink・巨大なファイル・意図的に作られた値がありうる）
- 読めないものを「無い」としない（ADR-0022）。使い方の誤りは exit 2（ADR-0021）

### 脅威モデル（設計 R2 で足した。M4-D-R1-002）

- `aiqh history` は、**利用者が、自分の手元の、自分のディレクトリを読む道具**である
- **信頼しないもの**: 履歴のファイルの**中身**（検証されるリポジトリの設定と道具の出力に由来する）。壊れた・巨大な・意図して作られた値がありうる（C）
- **対象の外とするもの**: 読んでいる最中に、ほかの者（別の利用者・別のプロセス）が、`--from` のディレクトリやその祖先を差し替える場面
  - ディレクトリの**構造**は、読み始めから読み終わりまで、利用者の制御の下にあるとみなす
  - そのうえで、読み始めと読み終わりで、ディレクトリが同じものかを確かめる（B の 7）。これは**検出**であって、**防止**ではない（読んでいる間に差し替えて、読み終わる前に戻した場合は検出しない）
- この制限は、Node の `fs` に、ディレクトリの記述子を基準に子を開く API が無いことによる（B の 7 の事実）

### 決定

#### A. コマンド

```
aiqh history --from <dir> [--from <dir> …] [--json] [--cwd <dir>]
```

- `--from` は繰り返せる（`src/cli-program.ts:26` の `collect` の作法）。1 つ以上を必須にする（0 個は使い方の誤り、exit 2）
- `--cwd` は、相対の `--from` を解決する基準（既定は現在のディレクトリ）
- v0.11.0 はファイルを書かない（端末と `--json` の標準出力だけ）。`--html` と `--out` は v0.12.0（ADR-0035）

#### B. 入力（`--from`）

1. **受け付ける 2 つの形**: `<dir>` を `--cwd` から解決し、realpath を取る
   - (a) `<dir>/artifacts/verification/history` が（lstat で）ディレクトリなら、`<dir>` をプロジェクトのルートとみなし、そこを読む
   - (b) そうでなければ、`<dir>` 自身を history のディレクトリとみなす（`output.dir` を変えたプロジェクトは、history のディレクトリを直接渡す）
   - その後の列挙（`readdirSync`）・lstat・open は、すべて**初めに realpath で解決したパス**を基準にする。`--from` の文字列をもう一度解決しない（設計 R2。M4-D-R1-002）
2. **(a) の包含**: history のディレクトリの realpath が、ルートの realpath の中にあること。外を指す symlink（`artifacts`・`verification`・`history` のどこかが外を指す）は入力の誤り（exit 2）
   - `resolveInsideRoot` の考え方（`src/config/load.ts:181-193`、R-005）に合わせる。(b) は利用者が直接指定したディレクトリなので、包含は問わない
3. **入力の誤り（exit 2。集計を出さない）**
   - 存在しない、ディレクトリでない、開けない（ENOENT 以外の errno も同じ。ADR-0022）
   - realpath が同じ `--from` が 2 つ
   - 履歴の名前のファイルが 1 つも無い（プロジェクトのルートの取り違えなどで、誤りとして止める）
   - 全体の上限を超える（下の D）
4. **読む名前**: `^\d{8}T\d{6}Z(?:-[1-9]\d*)?\.json$` に合う名前だけ
   - 次の 2 つは読まず、数だけを出す（情報。終了コードに影響しない）
     - ドットで始まるもの（`writeAtomic` の一時ファイル `.<name>.tmp-<16 桁>`）→ `leftoverTemporary`
     - それ以外の名前 → `ignored`
   - ディレクトリの中を再帰しない
5. **symlink は辿らない**: 履歴の名前の項目が通常のファイルでない（symlink・ディレクトリなど）なら、読めないもの `not-regular`
   - 開くときも `O_RDONLY | O_NOFOLLOW`（`src/report/write.ts:84` の `NOFOLLOW` と同じ。Windows では 0）で開き、`fstat` で通常のファイルであることを確かめてから、その記述子から読む（lstat と open の間の差し替えに備える）[実装のときに、出力のガード〈ADR-0019〉が記述子からの読み取りを止めないことを確かめる]
   - 読む量は、`fstat` の大きさに頼らず、記述子から最大「1 ファイルの上限 + 1 バイト」までに限る（C の 1。設計 R2。M4-D-R1-001）
   - `O_NOFOLLOW` が拒むのは、パスの**最後の要素**の symlink だけ。祖先の差し替えは B の 7 で扱う
   - lstat の後に symlink に差し替えられ、open が `ELOOP`（`O_NOFOLLOW` が symlink を拒んだ）で失敗したときは、`unreadable` ではなく `not-regular` にする（設計 R2 で明記した）
6. **パスを表示しない**（Q3 の決定）: 端末・`--json`・HTML では、`--from` を指定の順の番号（`#1`・`#2`…）で示し、パスは出さない（D6 の「絶対パス」を、利用者が渡したパスにも広げる）。読めないファイルは `#<番号>/<ファイル名>`（名前は上の正規表現に合うものだけなので、時刻だけ）で示す
7. **ディレクトリの差し替えの検出**（設計 R2。M4-D-R1-002。脅威モデルの節）
   - **記述子を基準にした探索はできない**: Node の `fs` には、ディレクトリの記述子を基準に子を開く API（POSIX の `openat` の類）が無い [事実: Node v24.13.1 の fs の文書 https://nodejs.org/docs/v24.13.1/api/fs.html ]
     - `fs.open()`・`fs.openSync()`・`fsPromises.open()` の `path` は `<string> | <Buffer> | <URL>` だけで、記述子・`FileHandle`・`fs.Dir` を基準に取らない
     - `fs.Dir`（https://nodejs.org/docs/v24.13.1/api/fs.html#class-fsdir ）のメソッドは `close`・`read`・`path`・反復などで、子を開くものは無い。`FileHandle` のメソッドも、その記述子そのものを扱うものだけ
     - 頁の全文に `openat`・`AT_FDCWD`・`O_PATH` の語は無い。相対のパスは `process.cwd()` を基準に解決する、と書かれている（同じ頁の「File paths」）
     - 手元の Node 24.13.1 でも、`fs.constants` に `AT_` で始まる定数と `O_PATH` は無く、`fs.Dir` の prototype にも子を開くメソッドは無かった
   - **やること**（検出。防止ではない）
     1. 読み始める前に、次のパス（どれも、realpath で解決したルートか history のディレクトリから作る）を lstat し、種類・`dev`・`ino` を記録する
        - (a) の形: ルート・`artifacts`・`artifacts/verification`・`artifacts/verification/history` の 4 つ。history はディレクトリ（B の 1 の (a) の条件）。途中の 2 つは、ルートの中を指す symlink でもよい（B の 2）。lstat は途中の要素の symlink を辿るので、4 つのパスは、それぞれの段の実体を表す
        - (b) の形: history のディレクトリ 1 つ（利用者が直接指定したディレクトリなので、祖先は確かめない）
     2. すべての `--from` のファイルを読み終わった後に、同じパスを lstat し直し、種類・`dev`・`ino` が読み始めと同じであることを確かめる
     3. 違えば（lstat の失敗・種類が違う・`dev` か `ino` が違う）、**入力の誤り**（`HISTORY ERROR (directory-changed)`、exit 2、集計を出さない）
   - **検出しないもの**（既知の限界）: 読んでいる間に差し替えて、読み終わる前に元に戻した場合。open はパスの文字列で行うので、その間に読んだファイルが別の場所のものでありうる。脅威モデルで対象の外とした場面

#### C. 1 ファイルの読み方（信頼しない入力）

1. **大きさの上限: 1 ファイル 8 MiB**（8,388,608 バイト）。上限を変えるオプションは作らない（Q5 の決定）
   - 根拠: 実例の最大は 29,159 バイト
   - 理論上の大きさは、check ごとに出力の末尾 2 つ × 64 KiB が JSON の `\uXXXX` で最大 6 倍（約 768 KiB）、`parsed` の名前 50 × 300 で最大約 90 KiB、で 1 check あたり 1 MiB 弱 [推定]
   - 8 MiB を超えるのは、極端な出力の check が 9 つ以上あるときだけ
   - 超えたときも黙って落とさない（一覧に出て exit 2）
   - **読み方**（設計 R2。M4-D-R1-001）: 事前の `fstat` の大きさに頼らない
     1. 開いた記述子から、`readSync` をくり返して、**最大で 8,388,609 バイト（上限 + 1）まで**読む。読む先は、その大きさの `Buffer` 1 つ。ファイルの終わり（`readSync` が 0 を返す）か、上限 + 1 に達したら止める
     2. 読んだ量が上限を超えた（上限 + 1 に達した）ら `too-large`。読んでいる間にファイルが大きくなった場合も同じ
     3. 上限以下なら、読む前の `fstat`（B の 5）の大きさ・読んだ量・読んだ後の `fstat` の大きさの 3 つを比べ、1 つでも違えば `unreadable`（`code` は `size-changed`）。読んでいる間・読んだ後の追記と切り詰めに当たる
     4. 3 つが同じときだけ、その `Buffer` を C の 2 以降に渡す
   - **大きさが変わったことを、新しい分類にせず `unreadable` にする理由**
     - verify は history を一時ファイル → rename で書く（`src/report/write.ts:100-109`）ので、aiqh 自身は history のファイルを、その場で追記も切り詰めもしない。大きさが変わるのは、aiqh の外の何かが、読んでいる最中にそのファイルを書いたときだけ
     - 利用者がすることは `unreadable`（開けない・読めない）と同じで、何が書いているかを確かめて、読み直すこと。分類は利用者のすることで分けている（`empty` は消す、`too-large` は移す、など）
     - 分類の語を増やすと、`--json` の語の集合・HTML の表示・テストが増えるのに、利用者のすることは変わらない
     - `code` に固定の語 `size-changed` を入れて、errno の名前（`EACCES` など）と見分けられるようにする
   - **検出しないもの**（既知の限界）: 読んでいる間に、同じ大きさのまま中身を書き換えた場合。多くは C の 3〜5 の `not-json`・`unknown-version`・`bad-shape` になるが、形の合う別の中身に変わった場合は、その中身を読む（脅威モデルの対象の外）
2. **UTF-8 として厳密に読む**: 既存の `decodeUtf8Strict`（`src/security/raw-chars.ts:135-138`。`TextDecoder` の `fatal`）を使う。不正なら `not-utf8`
3. **JSON**: `JSON.parse`。失敗したら `not-json`
   - 深さの上限は別に設けない
     - V8 の `JSON.parse` は深い入れ子でもスタックを使い切らない（Node 24.13.1 で、配列の入れ子 1,000,000 段が 107 ms で通った）
     - zod の `z.object` は、知らないキーの値をたどらずに捨てる（深い入れ子の知らないキーを持つ値で確かめた）
     - 大きさの上限（8 MiB）が、時間とメモリを抑える
     - この判断は、読む欄（C の 5）の中に深い入れ子を置いた入力の負荷のテストで確かめる（M のテストの計画。R1 のレビューの問い 1 の答えの条件）
   - 読み終わった `Buffer` の文字列は、解析の後に捨てる。`Buffer` は 1 つを使い回す（同時に持つのは 1 ファイル分だけ）
4. **版（D5）**: 最上位がオブジェクトで、`schemaVersion` が数の 1 であること。それ以外（欄が無い・2・文字列の "1"）は `unknown-version`
5. **形（zod）**: 下の欄だけを読み、知らないキーは捨てる（`src/review/packet.ts:1030-1037` の `RENDERED_REPORT` と同じ流儀）。合わなければ `bad-shape`
   - 必須
     - `tool.version`（文字列。UTF-8 で 64 バイト以下）、`project.name`（空でない文字列。UTF-8 で 256 バイト以下）
     - `startedAt`（`toISOString()` の形 `YYYY-MM-DDTHH:mm:ss.sssZ` で、`Date.parse` が有限）
     - `durationMs`（0 以上の安全な整数。C の 9）
     - `verdict`（`PASSED`・`FAILED`・`ERROR`）、`exitCode`（安全な整数。C の 9）
     - `git`（`null` か、`dirty`〈真偽か null〉を持つオブジェクト。`commit`・`branch` は読まない〈Q2 の決定〉）
     - `summary`（5 つの、0 以上の安全な整数）
     - `checks`（配列。**要素は 256 個まで**。各要素の `name`〈空でない文字列。UTF-8 で 256 バイト以下〉・`kind`〈`CHECK_KINDS`〉・`required`〈真偽〉・`status`〈`PASS`・`FAIL`・`SKIPPED`〉・`durationMs`〈0 以上の安全な整数〉・`timedOut`〈真偽〉・`timeoutSec`〈正の安全な整数。C の 9〉）
   - 任意（無ければ下の意味）
     - `interruptedBy`（無い → `null`。v0.1.2 より前）
     - `configSha256`（無い → 不明。あれば `/^[0-9a-f]{64}$/` でなければ `bad-shape`）
     - `checks[].parsed`（無い → 不明。あれば `tool`〈`PARSER_TOOLS` か null〉・`status`〈3 つの語〉・`truncated`〈真偽〉・`counts`〈文字列のキーと、0 以上の安全な整数〉）
   - `parsed.counts` のキーは、パーサごとの既知の一覧（下の E）だけを使い、ほかは捨てる。JSON の `__proto__` などのキーも、この一覧に無いので使わない
   - 読まない欄（形を確かめない・保持しない）: `project.root`・`configPath`・`finishedAt`・`git.commit`・`git.branch`・`categories`・`checks[].command`・`cwd`・`description`・`exitCode`・`signal`・`startedAt`・`errorSummary`・`stdoutTail`・`stderrTail`・`outputTruncated`・`parsed.reason`・`parsed.items`・`parsed.itemsOmitted`
   - 読まない欄の値は、`JSON.parse` の間は一時的にメモリにあるが、**`JSON.parse` の後には、許可リスト（F）の外の値を保持しない**（zod が返す、読む欄だけの値から集計を作り、解析の結果の全体は捨てる。設計 R2 で言い直した。R1 のレビューの問い 2）。そのため、読まない欄の値は集計と出力に混ざりようがない
   - **長さと数の上限**（設計 R2。M4-D-R1-003）: 上の `tool.version`・`project.name`・`checks[].name` のバイトの長さと、`checks` の要素の数は、zod の段で確かめる
     - 超えたら、**切り詰めずに `bad-shape`** にする。その値は `maskSecrets` にも渡さない
     - 切り詰めない理由: マスクの前に切り詰めると、切った位置で秘密の形が崩れ、マスクに当たらない断片が残るおそれがある
     - バイトの長さは UTF-8 のバイト数（`Buffer.byteLength(s, "utf8")`）。文字の数ではない（多バイトの文字で上限を広げられない）
     - 確かめる順は、型 → 長さ → ほかの形。長さを超えた文字列には、正規表現などの重い処理をしない
6. **ファイル名と `startedAt` の食い違い**は見ない（時刻は `startedAt` を使う。名前は一覧の表示だけ）
7. **同じ内容の重複**（Q7 の決定）: バイト列の SHA-256 が同じファイルは 1 回だけ数え、`duplicates` に数を出す（情報。exit 0。別のディレクトリに写した履歴など）
8. **入力の長さの上限と、表示の長さ・マスクの関係**（設計 R2。M4-D-R1-003）

   | 文字列 | 入力の上限（C の 5。超えたら `bad-shape`） | 表示の長さ（F。マスクの後に切る） | 実例 |
   |---|---|---|---|
   | `project.name` | 256 バイト | 200 文字 | 自己の設定は 18 バイト（`aiqh.config.jsonc:5`） |
   | `checks[].name` | 256 バイト | 200 文字 | 自己の設定の最長は 12 バイト（`unit-minpath`、`aiqh.config.jsonc:17`）。設定は `^[a-z0-9][a-z0-9-]*$` だけを許す（`src/config/schema.ts:6`）が、長さの上限は無い |
   | `tool.version` | 64 バイト | 64 文字 | `0.9.2` など |
   | `checks` の数 | 256 個 | — | 実例は 1 run に 2〜8 個（M4 SP1 の調べ） |

   - 2 つの上限は目的が違うので、大小の関係を決めない
     - **入力の上限**は、マスクと集計に渡る量を抑えるためのもの。超えたら読めないものにする
     - **表示の長さ**は、表の幅のためのもの。マスクの後に切るので、秘密の断片は残らない（マスクは `[REDACTED:<分類>]` に置き換え、元の値を残さない。`src/security/mask.ts:5`）
     - マスクで文字列が長くなることがある（例: URL の認証情報の形は `[REDACTED:url-credential]@` に置き換わる。`src/security/mask.ts:31`。27 文字の合成の値が 49 文字になることを手元で確かめた）ので、64 バイトの `tool.version` でも、表示の 64 文字で切ることがありうる
   - **項目 40（masker の private-key の形の超線形。`docs/ROADMAP.md:800`）との関係**: `aiqh history` が `maskSecrets` に渡す文字列は、この 3 つの欄の値と、固定の語だけ。入力の上限で、1 回に渡る長さは 256 バイト以下になる。項目 40 の実測（1 MiB で 3,895 ms、64 KiB で 15 ms）は、その数千倍の長さでの値で、`aiqh history` では当たらない [推定。M の負荷のテストで確かめる]
   - マスクは、集計の結果を作るときに、異なる値ごとに 1 回（F）。異なる値の数は、読む量の上限（D）で抑えられる
9. **数の範囲**（設計 R3。M4-D-R2-003）: 読む数は、すべて zod の段で範囲を確かめ、外なら `bad-shape` にする

   | 欄 | 範囲 | 根拠 |
   |---|---|---|
   | `durationMs`（run・check）、`summary` の 5 つ、`parsed.counts` の値 | 0 以上で、`Number.isSafeInteger` が真（0〜2^53 - 1） | verify が書くのは 0 以上の整数のミリ秒と数。安全な整数の外では、足し算と比べ方が正しくない |
   | `exitCode`（最上位） | `Number.isSafeInteger` が真 | 集計には使わない（形の確かめだけ）。読むのは R1 から |
   | `checks[].timeoutSec` | **正の整数**（1 以上）で、`Number.isSafeInteger` が真 | 設定の決まりと同じ: `timeoutSec: z.number().int().positive().optional()`（check は `src/config/schema.ts:21`、`defaults` は `src/config/schema.ts:73`）。既定は 600（`src/config/schema.ts:8`）。設定のスキーマに上限は無い。安全な整数の上限は、読む側の守り |

   - JSON の `-0` は `0` として受け取る（`Number.isSafeInteger(-0)` は真。`String(-0)` と `JSON.stringify(-0)` はどちらも `"0"`）。`1.0` のような書き方も整数として受け取る（`JSON.parse` の後は区別できない）
   - `1e100`・`9007199254740992`（2^53）・負の数・`0.5`・`1e-100`（`timeoutSec`）は `bad-shape`
   - この範囲で、割合（E）の分母は 1,000 以上、分子は 2^53 - 1 以下なので、割合は有限（最大でおよそ 9.0 × 10^12）[推定。M のテストで確かめる]
   - **届かないはずの守り**: 足し算・割り算・丸め（E・G）の後にも `Number.isFinite` を確かめる。偽なら `HISTORY ERROR (non-finite)`・exit 2・何も出さない（H）。入力の範囲で防げているはずなので、ここに来たら aiqh の誤り

**読めないものの分類**（固定の語。ファイルの中の文字は出さない）:

| 語 | 意味 |
|---|---|
| `empty` | 0 バイト（中断された verify が残す確保のファイル。確かめてから消してよい、と案内する。Q6 の決定: exit 2） |
| `too-large` | 読んだ量が 8 MiB を超えた（記述子から上限 + 1 バイトまで読んで判断する。読んでいる間に大きくなった場合も。C の 1） |
| `not-regular` | 履歴の名前だが、通常のファイルでない（symlink・ディレクトリ・その他） |
| `unreadable` | 開けない・読めない（`code` に errno の名前だけを添える。例: `EACCES`）。または、読む前・読んだ後の大きさと読んだ量が違う（`code` は固定の語 `size-changed`。C の 1） |
| `not-utf8` | UTF-8 として不正 |
| `not-json` | JSON として不正 |
| `unknown-version` | `schemaVersion` が 1 でない・無い |
| `bad-shape` | zod の形に合わない。長さ・数の上限（C の 5）を超えたもの、数の範囲（C の 9）の外のものを含む（どの欄かは出さない [理由: 欄の名前は固定の語だが、値の一部が混ざる形にしないため]） |

- 分類は 8 つのまま（設計 R2 で語を増やしていない）
- 決める順: `not-regular`（lstat・開いた後の `fstat`）→ `unreadable`（開けない・読めない）→ `too-large`（読んだ量）→ `unreadable`（`size-changed`）→ `empty` → `not-utf8` → `not-json` → `unknown-version` → `bad-shape`。1 つのファイルは、最初に当たった 1 つの分類になる（重ならない）

#### D. 全体の上限（超えたら入力の誤り。exit 2、集計を出さない。Q4 の決定）

- 履歴の名前のファイルの数: すべての `--from` を合わせて 10,000（列挙の段で数える。超えたら 1 つも読まない。`HISTORY ERROR (too-many-files)`）
- 大きさの合計: 256 MiB（268,435,456 バイト）
  - **実際に読んだバイト数の合計**で確かめる（設計 R2。M4-D-R1-001。R1 の「読む前に lstat の大きさで数える」をやめた）
  - 数えるのは、C の 1 で記述子から読んだバイト数のすべて（`too-large` の上限 + 1 バイト、`unreadable` になったファイルの途中まで、を含む）
  - 1 ファイルを読むたびに足し、超えた時点で読むのをやめて、入力の誤りにする（`HISTORY ERROR (too-many-bytes)`）
  - 同時に持つのは 1 ファイル分の `Buffer` だけ（C の 3）なので、メモリは合計ではなく 1 ファイルの上限で抑えられる
- 理由: 一部だけを集計すると、どれが抜けたかで推移が変わり、誤った絵になる。超えたら、古い履歴を別の場所へ移すなど、利用者が入力を減らす

#### E. 集計（すべて `startedAt` の UTC で並べ、日は UTC の日付）

- **プロジェクト**（`project.name` ごと。D3）
  - 寄与した `--from` の番号
  - run の数、verdict ごとの数（PASSED・FAILED・ERROR）、`dirty` ごとの数（true・false・不明）、中断された run の数（`interruptedBy` が null でない）
  - 最初と最後の `startedAt`
  - 所要時間の中央値と最大（中央値は、並べて `floor((n-1)/2)` 番目。整数のミリ秒）
  - 日ごと: run の数と verdict ごとの数
  - **`tool.version` の区切り**: 時刻の順で、同じ版が続く区間（版・最初・最後・run の数）
  - **`configSha256` の区切り**: 同じく、同じ値が続く区間。値の無い run は「不明」（`null`）の区間
- **check**（プロジェクトと check の名前ごと）
  - その check があった run の数、PASS・FAIL・SKIPPED の数
  - FAIL の率（FAIL ÷ 〈PASS + FAIL〉。分母が 0 なら `null`）、タイムアウトの数
  - 所要時間の中央値と最大、最後の run の `kind`・`required`、最後の run の `timeoutSec`（JSON の欄の名前は `lastTimeoutSec`。設計 R3）
  - **上限に対する最大の割合**（設計 R3 で直した。M4-D-R2-002）: **run ごとに** `durationMs ÷ （その run の timeoutSec × 1000）` を計算し、その最大を `maxShareOfTimeout` にする。ROADMAP の項目 42 の見張りに使える
    - R2 までの「最大の所要時間 ÷ 最後の run の `timeoutSec`」は、run の間で上限が変わると、どの run にも無い割合になった（例: 90 秒・上限 120 秒の run と、20 秒・上限 30 秒の run では、本当の最大は 0.75 だが、90 ÷ 30 = 3.0 になる）
    - 最後の run の `timeoutSec` は、割合と関係の無い別の属性（`lastTimeoutSec`）として持つ
- **失敗しやすい check**: すべてのプロジェクトで、PASS + FAIL が 3 以上の check を、FAIL の率の高い順（同じなら FAIL の数、次に名前）に 10 件
- **`parsed.counts` の推移**: プロジェクト・check・パーサの道具・数のキーごとに、日ごとの値
  - 値は、その日の最後の、`status` が `parsed` の run の値
  - その日に check はあったが `parsed` が無い、または `parsed` でない run の数を `unknownRuns` に出す。0 と混ぜない
  - その日の値の run が `truncated` なら、`truncated: true`
- **数のキーの一覧**（パーサの道具ごと。`src/parse/` の各パーサが作るもの。ほかのキーは捨てる）
  - vitest（13 個）: `testFiles`・`testFilesFailed`・`testFilesPassed`・`testFilesExpectedFail`・`testFilesSkipped`・`testFilesTodo`・`tests`・`testsFailed`・`testsPassed`・`testsExpectedFail`・`testsSkipped`・`testsTodo`・`errors`（`src/parse/vitest.ts:11-16, 101-104`）
  - eslint（3 個）: `problems`・`errors`・`warnings`
  - npm audit（5 個）: `vulnerabilities`・`low`・`moderate`・`high`・`critical`（`src/parse/npm-audit.ts:20`）
  - aiqh security-scan（10 個）: `findings`・`secretShaped`・`oversizedCandidates`・`trackedEnv`・`untrackedEnv`・`gitignore`・`suppressed`・`allowRulesUsed`・`expiredAllowRules`・`unusedAllowRules`（`src/parse/security-scan.ts:109`）
  - 一覧はパーサの側から export して 1 か所にする（二重に持たない）
- **allow ルール（ADR-0029 の決定 3。Q1 の決定）**: security-scan の `suppressed`・`allowRulesUsed`・`expiredAllowRules`・`unusedAllowRules` の日ごとの推移だけを出す
  - これらの数は、出力の行を数えた値で、名前の 50 件の打ち切り（`itemsOmitted`）の影響を受けない
  - ただし、`parsed.truncated` の run（出力の末尾 1 MiB だけを読んだ）では「少なくとも」の値になるので、`truncated` で示す
  - **ルールごとの回数**（どのルールが何回）は出さない。ルールを見分けるのに `parsed.items` の名前（`allowed`・`allow-rule-used` の項目。`src/parse/security-scan.ts:30-31`）が要り、D6 で出さないため
  - **ADR-0029 への注記**（v0.11.0 の docs の commit で足す文。設計 R2。M4-D-R1-005）。ADR-0029 の 26 行目（決定 3 の「履歴の DB（M4）では、…ルールごとの使われた回数を時系列で数える」）の後ろに:
    > 注記（v0.11.0）: 決定 3 の最後の項（履歴の DB で、allow のルールごとの使われた回数を時系列で数える）は、そのとおりにはしない。M4 は DB を持たず（ADR-0034）、`aiqh history` は `parsed.items` の名前を出さないので、ルールを見分けられない。M4 では、security-scan の数（`suppressed`・`allowRulesUsed`・`expiredAllowRules`・`unusedAllowRules`）の日ごとの推移だけを出す。決定 4 の「1 つの allow のルールが 1 回の scan で 10 件以上を抑えたとき」は、`aiqh security-scan` の端末の出力か、その run の `latest.md` の Parsed Output で確かめる。決定 1〜5 の定義は変えない。
  - 対応するテスト（v0.11.0 の集計の commit。§4.3）: security-scan の `parsed.items` に、`allowed`・`allow-rule-used` の項目と目印の名前を入れた fixture で、4 つの数の推移が出て、目印の名前が端末・`--json` のどこにも出ないこと
- **同じプロジェクトの名前が別の場所から来たとき**
  - 1 つのプロジェクトとして合わせる（D3）。寄与した `--from` の番号を出す
  - 同じ名前の別のプロジェクトも合わさってしまうので、そのときは別々に実行する（既知の限界）

#### F. 出す欄の許可リスト（D6）

出すのは、上の E の集計の値と、次の文字列だけ。

| 文字列 | 由来 | 処理 |
|---|---|---|
| プロジェクトの名前 | `project.name` | 入力は 256 バイト以下（C の 5）→ マスク → 200 文字で切る |
| check の名前 | `checks[].name` | 同じ |
| check の種類 | `checks[].kind` | 固定の語（zod で確かめた） |
| `tool.version` | 同じ | 入力は 64 バイト以下（C の 5）→ マスク → 64 文字で切る |
| `configSha256` | 同じ | 形を確かめた 64 桁（`--json` は全体、端末・HTML は先頭 12 桁） |
| 数のキー・パーサの道具 | E の一覧 | 固定の語 |
| ファイル名（読めないものの一覧だけ） | 名前の正規表現に合うもの | 時刻と数字だけ |
| 時刻・日付 | `startedAt` | 形を確かめた ISO の文字列、その日付 |

- **出さないもの**（D6 と、この設計で足したもの）
  - D6 のもの: tail（`stdoutTail`・`stderrTail`）・`command`・`cwd`・絶対パス（`project.root`・`configPath`、`--from` のパス）・`errorSummary`・`parsed.items` の名前
  - この設計で足したもの: `git.branch`・`checks[].description`・`git.commit`（Q2 の決定）
  - これらは読まない（C の 5）ので、集計の値に入らない
  - 表の「読めないもの」の `code` は、errno の名前（`/^E[A-Z0-9]+$/`）か、固定の語 `size-changed` だけ（C の 1）
- **表示のときのマスクのし直し**: 文字列は、集計の結果を作るときに 1 回 `maskSecrets` に通す
  - 古い履歴は、そのときのパターンでマスクされているので、いまのパターンで伏せ直す
  - そのうえで、端末は `createOutput`（ADR-0016。表記にしてからもう一度マスク）、`--json` は `safeJson`（`src/output.ts:166-168`）を通る（マスクは冪等）
  - 集計のキーはマスクの前の名前で作る（伏せた結果が同じになる 2 つの名前は、表示が同じ 2 行になる。既知の限界）
- **集計の JSON の全体を `maskSecrets` に渡さない**（設計 R3 の要件。M4-D-R2-001）
  - **コードで確かめた `safeJson` の作り** [事実]: `safeJson`（`src/output.ts:166-168`）は `JSON.stringify(copyJsonData(value, (s) => maskSecrets(escapeForDisplay(s, mode))), null, 2)`。`copyJsonData`（`src/output.ts:119-160`）は値をたどり、**文字列の値（121 行）とオブジェクトのキー（152 行）を 1 つずつ** `mapString` に通す。JSON の全体の文字列は、マスクに渡らない。`createOutput` の `json`（`src/output.ts:227`）も、この `safeJson` を使う
  - そのため、`--json` でマスクに渡る 1 つの文字列は、集計の文字列（名前は表示の長さ 200 文字以下。ほかは固定の語・日付・ハッシュ）と、固定の語のキーだけ。マスクの仕事の量は、文字列とキーの数に比例する（1 つの長さは抑えられている）
  - 手元の測り（合成のデータ。数の葉 200,000）[事実]: 日の多い形（100 系列 × 1,000 日）は、マスクに渡る文字列とキーが 500,707 個、`safeJson` が 606 ms、出力が 15,702,823 バイト。長い名前の多い形（200 文字の check の名前 × 100,000 系列）は、1,200,007 個、1,954 ms、48,789,023 バイト。短いキー 1 つのマスクは 1 µs 未満
  - この測りから、数の葉の上限（Q10）だけでは、出力の大きさが 50 MB 近くになりうる。出力の実バイト数にも上限を置く（N）

#### G. `--json` の形

```json
{
  "kind": "aiqh-history",
  "schemaVersion": 1,
  "tool": { "version": "0.11.0" },
  "complete": true,
  "sources": [ { "index": 1, "historyFiles": 0, "read": 0, "unread": 0, "duplicates": 0, "ignored": 0, "leftoverTemporary": 0 } ],
  "unread": [ { "source": 1, "file": "20260101T000000Z.json", "reason": "empty", "code": null } ],
  "projects": [ {
    "name": "…", "sources": [1], "runs": 0,
    "verdicts": { "PASSED": 0, "FAILED": 0, "ERROR": 0 }, "dirty": { "true": 0, "false": 0, "unknown": 0 }, "interrupted": 0,
    "first": "…", "last": "…", "durationMs": { "median": 0, "max": 0 },
    "days": [ { "day": "2026-01-01", "runs": 0, "PASSED": 0, "FAILED": 0, "ERROR": 0 } ],
    "toolVersions": [ { "version": "…", "first": "…", "last": "…", "runs": 0 } ],
    "configs": [ { "sha256": null, "first": "…", "last": "…", "runs": 0 } ],
    "checks": [ { "name": "…", "kind": "unit", "required": true, "runs": 0, "PASS": 0, "FAIL": 0, "SKIPPED": 0, "failRate": null,
                  "timedOut": 0, "durationMs": { "median": 0, "max": 0 }, "lastTimeoutSec": 0, "maxShareOfTimeout": 0 } ],
    "counts": [ { "check": "…", "tool": "vitest", "key": "tests", "days": [ { "day": "…", "value": 0, "unknownRuns": 0, "truncated": false } ] } ]
  } ],
  "failureProne": [ { "project": "…", "check": "…", "PASS": 0, "FAIL": 0, "failRate": 0 } ]
}
```

- `kind` と `schemaVersion` で、verify のレポート（`schemaVersion` 1）・findings（`schemaVersion` 1、ADR-0026）と見分ける
- **版の規則**: 欄を足すだけなら 1 のまま。欄を消す・名前を変える・型や意味を変えるときは 2 にする
  - この規則は、verify のレポートについても、この ADR で明文にする（ADR-0003:10・32、ADR-0028 の決定 9 の作法を言葉にする）
- 生成の時刻は入れない（同じ入力から同じ出力。テストと差分のため）
- 並び: プロジェクトは名前の順、check は最初に現れた順、日・区間は時刻の順
- **オブジェクトのキーは、すべて上の形の固定の語**（設計 R2。M4-D-R1-004）。名前・版・日付などの値をキーにしない（`dirty` の `true`・`false`・`unknown`、`verdicts` の `PASSED` などは固定の語）。そのため、JSON のパスは固定の語と配列の添字だけからできる（ADR-0035 の決定 6 の `data-k`）
- **割合の値**（`failRate`・`maxShareOfTimeout`）は、小数 4 桁に丸める（`Math.round(x * 10000) / 10000`。設計 R2）。HTML が JSON と同じ文字列で数を出せるようにするため（ADR-0035 の決定 6）
- **`maxShareOfTimeout`** は run ごとの割合の最大（E。設計 R3）。`lastTimeoutSec` は最後の run の `timeoutSec`（R2 までの欄の名前 `timeoutSec` を、意味が分かるように変えた）
- **すべての数は有限**（設計 R3。M4-D-R2-003）: 集計を作った後、出力の前に、数の葉のすべてが `Number.isFinite` であることを確かめる（C の 9 の「届かないはずの守り」）。偽なら `HISTORY ERROR (non-finite)`
- **数の書き方**: JSON の数は、`JSON.stringify` の書き方（JavaScript の `String(n)` と同じ）。値が無い数（`failRate` の分母 0、その日に値の無い `value` など）は `null`

#### H. 終了コードと最後の行

| 終了コード | とき | 最後の行（標準出力。`--json` のときは標準エラー） |
|---|---|---|
| 0 | すべての履歴の名前のファイルを読めた（重複・`ignored`・`leftoverTemporary` は情報） | `HISTORY COMPLETE — projects <p>, runs <r>, sources <s>` |
| 2 | 読めないものが 1 つ以上あった（集計と一覧は出す。`--json` は `"complete": false`） | `HISTORY INCOMPLETE — unread <u> of <f> history files (listed above)` |
| 2 | 使い方・入力の誤り（B の 3・7、D）。集計を出さない | `HISTORY ERROR (<種類>)` |
| 1 | **使わない** | — |

- `<種類>` は固定の語（設計 R2 で一覧にした。設計 R3 で 2 つ足した）: `usage`（引数）・`not-found`・`not-a-directory`・`unreadable-directory`（ENOENT 以外の errno）・`outside-root`（B の 2）・`duplicate-source`・`no-history`・`too-many-files`（D）・`too-many-bytes`（D。読んだ量）・`directory-changed`（B の 7）・`too-many-values`（N。Q10 の決定）・`output-too-large`（N。出力の量。設計 R3）・`non-finite`（C の 9・G。設計 R3）
- `too-many-values`・`output-too-large`・`non-finite` のときは、集計も一覧も、標準出力に何も出さない（`--json` のときも、JSON の一部を出さない）。最後の行だけを出す
- どの `--from` で起きたかは、番号（`#1`）で示す。パスは出さない（B の 6）

- 1 を使わない理由
  - ほかのコマンドの 1 は、finding・検査の失敗（ADR-0021）
  - history は品質ゲートではなく、履歴の中の FAILED の run は集計の値。1 を使うと「過去に FAILED があった」と「読めなかった」が混ざる
- 中断（SIGINT・SIGTERM）と処理されなかった例外は、CLI の既存の扱い（ADR-0024・`src/cli-signals.ts`）に従う

#### I. 出口

- 端末: `createOutput`（`src/output.ts:219-229`。ADR-0016・0017）。表の 1 行は 1 回の `log`。`--json` は、上限つきの JSON の口（N。`output.json` と同じ `safeJson` を使う）
- 端末の表は、すべての行を作ってから、行の実バイト数の合計を確かめ、上限（N）の中なら 1 行ずつ `log` する。超えたら 1 行も出さない
- ファイル: v0.11.0 は書かない。HTML は ADR-0035（`writeAtomic`。ADR-0020）
- `src/` の新しいモジュール（予定）: `src/history/read.ts`（B〜D）、`src/history/aggregate.ts`（E・F・G）、`src/commands/history.ts`（A・H・端末の表）

#### J. 組み込みのモジュール（ADR-0019）

- 使うのは `node:fs`・`node:path`・`node:crypto`（重複の判定）だけで、どれも一覧にある（`tests/structure/output-guard.ts:90`）。**一覧に足すものは無い**
- `TextDecoder` は既存の `decodeUtf8Strict` を通して使う

#### K. 再検討の条件（D1・D12）

次のどれかに当たったら、DB（`node:sqlite` か JSON Lines）を改めて検討し、ADR を足す。

1. `node:sqlite` が、aiqh の `engines` の下限と CI の Node の両方で Stability 2（Stable）になり、import で警告が出なくなったとき
2. 実際の入力で `aiqh history` が 5 秒を超える、または全体の上限（10,000 件・256 MiB）に普通の使い方で届くとき
3. 消える場所（SHA 固定の worktree・使い捨ての clone）の履歴を残したい、という要求が出たとき（D14 を見直すとき）

#### L. R-010 の行き先（D11）

- **M4 では作らない**
  - `aiqh history` は `history/` だけを読み、`history/` の名前は N1 で排他的に取るので、`latest.*` の不整合の影響を受けない
- **ROADMAP に新しい項目（47）として残す**
  - 内容: R-010。並行の verify で、latest.json と latest.md が別の run のものになりうる。`docs/reviews/m0/independent-review-r1.md:137-145`
  - 案は 3 つ
    - (a) `runs/<runId>/` と、単一の pointer / manifest の原子的な更新
    - (b) latest の更新の全体を lock する
    - (c) 記録で閉じる（latest.json と latest.md はどちらも `startedAt` を持つので、読む側が組の食い違いを見分けられる）
  - 行き先: M4 の後（人間の判断）
  - レビュー R2 の「roadmap から落とさないこと」（`docs/reviews/m0/independent-review-r2.md:218-224`）を守る
- **(a) を選ぶときに影響する利用側**
  - review-packet の latest.json の読み込み（`src/review/packet.ts:1057`）
  - 再利用ワークフローの Job Summary（`.github/workflows/verify.yml:125-130`）と、それを呼ぶ適用先
  - init の `.gitignore` の判定（`src/commands/init.ts:311`）
  - 書き込み箇所の一覧のテスト（`tests/file-write-sites.test.ts:82`）
  - 最上位のキーのテスト（ADR-0033 の表）

#### M. テストの計画（v0.11.0。設計 R2 で R1 の指摘の分、設計 R3 で R2 の指摘の分を足した）

- **テストのための差し替え**: 読み込み（`src/history/read.ts`）は、上限の値と、読む途中の 2 か所の呼び出し（1 ファイルの読み取りの後、すべてを読み終わった後）を、引数で差し替えられるようにする
  - 前例: `src/parse/read.ts:23`（「For tests: the clock, the parsers and the package.json reader can be replaced. Not reachable from the config or the CLI.」）
  - 設定・CLI からは届かない。CLI は既定の値だけを使う
- **読み取り量の上限（M4-D-R1-001）**
  - 上限 + 100 バイトのファイル → `too-large`。記述子から読んだ量が上限 + 1 バイトを超えないこと（差し替えた読み取りで数える）
  - 上限ちょうどのファイル → 読める。上限 + 1 → `too-large`（境界）
  - **追記の競合**: 1 ファイルを読んだ後の呼び出しで、そのファイルに追記する → `unreadable`（`size-changed`）
  - **切り詰めの競合**: 同じ所で切り詰める → `unreadable`（`size-changed`）
  - **読んでいる間の増大**: 小さな上限に差し替え、読み取りの途中で上限を超えるまで追記する → `too-large`
  - **全体の上限**: 合計の上限を小さく差し替え、読んだバイト数の合計が超えたら `HISTORY ERROR (too-many-bytes)`・exit 2・集計なし。`too-large` のファイルの上限 + 1 バイトも合計に入ること
  - ファイルの数の上限: 数を小さく差し替え、超えたら 1 つも読まずに `HISTORY ERROR (too-many-files)`
- **ディレクトリの差し替えの検出（M4-D-R1-002）**
  - (b) の形: すべてを読み終わった後の呼び出しで、history のディレクトリを別の名前に移し、同じ名前で別のディレクトリ（同じ名前のファイルを写したもの）を置く → `HISTORY ERROR (directory-changed)`・exit 2・集計なし
  - (a) の形: 同じ所で、`artifacts` を移して、同じ形の別のディレクトリを置く（祖先の差し替え）→ 同じ
  - (a) の形: `verification` を、ルートの中の別のディレクトリを指す symlink に置き換える → 同じ
  - 差し替えない場合 → 通常どおり（差し替えのテストの対照）
  - 比べる関数（読み始めと読み終わりの種類・`dev`・`ino`）の単体のテスト
- **長さと数の上限（M4-D-R1-003）**
  - `project.name`・`checks[].name` が 256 バイト → 読める。257 バイト → `bad-shape`。多バイトの文字で、文字の数は 256 以下でもバイトが 257 → `bad-shape`
  - `tool.version` が 64 バイト → 読める。65 → `bad-shape`
  - `checks` が 256 個 → 読める。257 個 → `bad-shape`
  - 上限を超えた値が、マスクに渡らないこと（マスクを数える差し替えは作らず、上限を超えた名前に秘密の形の目印を入れ、出力のどこにも、目印とその `[REDACTED:…]` の形が出ないことで確かめる）
  - **負荷**: 8 MiB 近い 1 ファイルに、(1) 上限を超える長い名前、(2) 上限ちょうどの名前の check 256 個、(3) 読む欄（`checks[].parsed.counts` など）の中の深い入れ子、を置き、`bad-shape` か正しい集計になること。**時間は assert しない**（負荷に弱いテストの教訓。ROADMAP の項目 41）。時間は、別の計測のスクリプトで手元で測り、v0.11.0 の報告に書く
- **8 つの分類**: 分類ごとに 1 つ以上の fixture。決める順（C の表の下）で、2 つの分類に当たりうる入力（例: 0 バイトで、かつ読む前と後で大きさが違う）が、先の分類になること
- **出さない欄**: ADR-0035 の決定 7 の目印のテストの、端末と `--json` の部分を v0.11.0 で先に入れる
- **ルールの名前が出ないこと**（M4-D-R1-005）: E の「対応するテスト」
- **最終の出力の経路（設計 R3。M4-D-R2-001）**
  - 数の葉の上限（N）を小さく差し替え、ちょうど上限 → 出力する。上限 + 1 → `HISTORY ERROR (too-many-values)`・exit 2・標準出力は空
  - 出力のバイト数の上限（N）を小さく差し替え、端末・`--json` のそれぞれで、ちょうど上限 → 出力する。上限 + 1 → `HISTORY ERROR (output-too-large)`・exit 2・標準出力は空
  - `--json` の文字列がマスクに渡るとき、1 つの長さが上限（名前の 200 文字・固定の語）を超えないこと。JSON の全体の文字列がマスクに渡らないこと（`maskSecrets` を数える差し替えは作らず、`safeJson` の作りを使う単体のテストと、上限の境界の出力の比較で確かめる）
  - **負荷**: 既定の上限（数の葉 200,000・出力 32 MiB）の境界の近くの合成の集計（日の多い形と、長い名前の多い形）を、端末・`--json` の出口まで通す。**時間は assert しない**。時間と出力のバイト数を、別の計測のスクリプトで手元で測り、v0.11.0 の報告と ADR に書く（Q10 の値の根拠）
- **タイムアウトに対する割合（設計 R3。M4-D-R2-002）**
  - 上限が run の間で変わる 2 件以上の fixture: run 1 が 90 秒・上限 120 秒、run 2 が 20 秒・上限 30 秒 → `maxShareOfTimeout` は 0.75、`lastTimeoutSec` は 30。順を逆にした fixture → 0.75、`lastTimeoutSec` は 120
  - 上限が同じ run だけ → 最大の所要時間 ÷ 上限と同じ値（R2 までの結果と同じになる対照）
  - 時間切れの run（`timedOut: true`）を含む fixture → 割合が 1 以上になりうることと、その値
- **極端な数（設計 R3。M4-D-R2-003）**
  - 境界: `durationMs`・`summary`・`parsed.counts` が 2^53 - 1 → 読める。2^53・`1e100`・`-1`・`0.5` → `bad-shape`。`-0` → 0 として読める
  - `timeoutSec`: 1 → 読める。0・`0.5`・`1e-100`・負の数・2^53 → `bad-shape`
  - 極大の `durationMs`（2^53 - 1）と極小の `timeoutSec`（1）の組 → 割合は有限で、`--json` と HTML に同じ文字列で出る
  - `non-finite` の守り: 集計の関数に、テストのための差し替えで有限でない値を入れ、`HISTORY ERROR (non-finite)`・exit 2・標準出力は空になること（入力からは届かないので、差し替えでだけ確かめる）

#### N. 集計と出力の大きさの上限（設計 R3。Q10 の決定と M4-D-R2-001）

- **集計の数の葉の総数: 200,000**（Q10 の決定）
  - 集計を作りながら数え、超えた時点でやめる。`HISTORY ERROR (too-many-values)`・exit 2・何も出さない
  - 値は v0.11.0 で実例から測り、ADR に書く（決めた値と、実例の数の葉の数）
- **最終の出力の実バイト数: 32 MiB（33,554,432 バイト）**（設計 R3 の初めの値。v0.11.0 で実例と合成のデータから測り、ADR に書く）
  - 端末の表: すべての行（`safeText` を通した後の文字列）の UTF-8 のバイト数と改行の合計
  - `--json`: `safeJson` が作った文字列の UTF-8 のバイト数
  - HTML（v0.12.0。ADR-0035 の決定 5）: `writeAtomic` に渡す前の文字列の UTF-8 のバイト数
  - 超えたら `HISTORY ERROR (output-too-large)`・exit 2。標準出力に何も出さず、HTML のファイルも書かない
  - 32 MiB にした理由: 上の測りで、日の多い形（数の葉 200,000）は 15.7 MB で通り、長い名前の多い形（同じ 200,000）は 48.8 MB で止まる。実例の集計は数百 KB と見込む [推定]
- **数の葉の上限と、出力のバイト数の上限の両方を置く理由**: 数の葉の数は、集計を作る仕事の量を抑える。出力のバイト数は、文字列の長さ（名前など）を含めた、出す量そのものを抑える。どちらか 1 つでは、もう片方が大きくなりうる（上の測り）
- **出口の形（ADR-0016 の「出口は 1 つ」を保つ案。実装は v0.11.0）**
  - `src/output.ts` の `Output` に、上限つきで JSON を出す口を 1 つ足す（例: `jsonWithin(value, maxBytes): boolean`）
    - 中で `safeJson(value, jsonMode)` を作り（いまの `json` と同じ。文字列とキーを 1 つずつマスクする）、UTF-8 のバイト数が `maxBytes` 以下のときだけ書き、書いたかを返す
    - `Safe` を作るのは、これまでどおり `safeText` と `safeJson` だけ。書くのは、これまでどおり `emitOut`・`emitErr` だけ
  - 端末の表は、行を作る段で `safeText` の結果を集め、合計を確かめてから書く（同じく `Output` に、行の並びを上限つきで書く口を足すか、`safeText` の結果の長さを先に測る。どちらにするかは v0.11.0 で、出力のガードのテスト〈`tests/structure/output-guard.ts`〉に合う方を選ぶ）
  - `tests/structure/` の変更が要るときは、v0.11.0 の指示書で承認を得る（プロジェクトの規則）
  - 上限を超えて書かないときも、上限を確かめる前に、文字列は一度メモリに作られる（数の葉の上限で、大きさはおよそ 50 MB までに抑えられる。上の測り）

### 代替案

- **`node:sqlite`**: 文脈の理由で、いまは採らない（K の 1 で再検討）
- **JSON Lines の索引を足す**: 追記の排他・途中で切れた行・重複・history との二重の記録を持つことになる。いまの量では得が無い
- **history をユーザーローカルへ写す**: 消える場所の履歴を残せる。ただし、写す契機と、写しの置き場所の管理が要る。D14 で受け入れたので採らない（K の 3）
- **読めないものを黙って飛ばす**: ADR-0022 に反する
- **読めないものが 1 つでもあれば集計を出さない**: 中断で残った空のファイル 1 つで、全体が見えなくなる。D4 で、一覧に出して集計を続け、exit 2 にした
- **終了コード 1 を「読めないものがあった」にする**: H の理由で採らない
- **ディレクトリの記述子を基準にした探索**（R1 のレビューの M4-D-R1-002 の修正案の前半）: Node の `fs` に、その API が無い（B の 7）。ネイティブのアドオンや依存の追加は、依存を最小にする方針（ADR-0008）に反する。採らない（脅威モデルの制限と検出にした）
- **大きさが変わったファイルに新しい分類（例: `changed`）を作る**: C の 1 の理由で採らない（`unreadable` と `code` で足りる）
- **長い文字列を切り詰めて読む**: マスクの前に切り詰めると、秘密の断片が残るおそれがある（C の 5）。採らない
- **check の名前に、設定と同じ形（`^[a-z0-9][a-z0-9-]*$`。`src/config/schema.ts:6`）を求める**: レポートの名前はマスクの後の値なので、秘密の形に当たった名前は `[REDACTED:…]` になり、この形に合わない。設定の規則で、レポートの規則ではない。採らない（長さだけを確かめる）

### 既知の限界

- 同じ `project.name` の別のプロジェクトは 1 つに合わさる
- 伏せた結果が同じになる 2 つの名前は、同じ表示の 2 行になる
- ルールごとの allow の回数は出さない（E。Q1 の決定）
- `git.commit` を出さないので、どの commit の run かは HTML・JSON から分からない（Q2 の決定）
- 中断で残った空のファイルは、利用者が消すまで exit 2 を続ける（Q6 の決定）
- `O_NOFOLLOW` が無い環境（Windows）では、開くときの symlink の拒否が lstat だけになる（Windows は対象外）
- 時刻は `startedAt` をそのまま信じる（履歴の中の値は書き換えられうる。集計は表示のためだけで、判定に使わない）
- **ディレクトリの差し替えは、検出であって防止ではない**（脅威モデル・B の 7）: 読んでいる間に差し替えて、読み終わる前に戻した場合は検出しない
- **読んでいる間に、同じ大きさのまま中身を書き換えた場合**は検出しない（C の 1）
- 設定は、256 を超える check と、256 バイトを超える名前を許す（`src/config/schema.ts:13-15, 63, 77` に長さ・数の上限が無い）。そのような run の履歴は `bad-shape` になる（Q11 の決定: 既知の限界として、v0.11.0 で `docs/CONFIG_SPEC.md` に書く。verify は変えない）
- 出力の上限（N）を超える集計は、出せない（`output-too-large`）。`--from` を分けて、別々に実行する
- 上限を超えて書かないときも、上限を確かめる前に、出力の文字列は一度メモリに作られる（N）

### 影響

- 新しいモジュール（I）、`src/cli-program.ts` にコマンド、新しいテスト（M）
- docs: `docs/ARCHITECTURE.md`（91・112・150 行の「履歴 DB」、§6.3）、README、`docs/CONFIG_SPEC.md:295`（history の設定は作らない、と書く。Q11 の決定によっては、履歴の読み方の上限も書く）、ADR-0029 の注記（E）、ROADMAP
- 依存・組み込みのモジュールの一覧・書き込みの出口・verify の振る舞いは変えない

---

## 3. ADR-0035（案）: 静的 HTML のダッシュボード（`aiqh history --html`）

- 状態: 提案（v0.12.0 の予定。ADR-0034 の集計を、1 つの HTML ファイルにする）
- 日付: 2026-10-17（設計 R1。設計 R2 で、M4-D-R1-004 と Q8 の決定を入れた。設計 R3 で、M4-D-R2-001〜003 の分を入れた）

### 文脈

- ROADMAP の M4 は「ローカルダッシュボード（静的 HTML。外部送信なし）」
- HTML は、端末（ADR-0016）・JSON と Markdown のファイル（ADR-0020）と違う、新しい出力の形
- 埋め込む文字列（プロジェクトや check の名前、版の文字列）は、検証されるリポジトリの設定に由来する。HTML の構造を壊す文字（`<`・`&`・`"` など）や、禁止文字を含みうる
- 人がブラウザで開くので、script の実行・外への読み込みが起きないことを、形として保証したい

### 決定

1. **コマンド**: `aiqh history --from … --html [--out <dir>]`
   - `<out>/dashboard.html` を書く。`--out` の既定は `--cwd` の `artifacts/history/`（D8。`artifacts/` は ADR-0007 で git 管理外）
   - `--out` だけ（`--html` 無し）は使い方の誤り（exit 2）
   - `--json` と一緒に使える（同じ集計から作る）
   - 読めないものがあっても HTML は書く。目立つ節で示し、終了コードは 2（ADR-0034 の H）
   - 入力の誤りのときは何も書かない
2. **形**: `<!doctype html>`、UTF-8。要素は固定のひな形から作る
   - **script は一切置かない**（`<script>` 要素は、どの `type` でも置かない）
   - 外の資源（`<link>`・`<img>`・`<iframe>`・`<object>`・`<embed>`・`url(…)`・`@import`・`href`・`src`）を置かない
   - イベントの属性（`on…`）を置かない
   - 開け閉めは `<details>` と `<summary>` で行う（script 無し）
   - 推移の図はインラインの SVG（`<svg>`・`<g>`・`<rect>`・`<line>`・`<polyline>`・`<text>`・`<title>`）
3. **CSP の meta**（`<head>` の最初の子。文言の案。style-src は固定の CSS のハッシュ: Q8 の決定）:
   ```
   <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-<固定の CSS の SHA-256 の base64>'; img-src 'none'; base-uri 'none'; form-action 'none'">
   ```
   - CSS は 1 つの `<style>` 要素の固定の文字列（値を入れない）。その SHA-256 を、生成のときに `node:crypto` で計算して埋める
   - `'unsafe-inline'` より狭い
     - 埋め込みの漏れで別の `<style>` 要素が入っても、ハッシュが合わないので効かない
     - `style` 属性も効かない。ハッシュが `style` 属性に効くのは `'unsafe-hashes'` があるときだけで、`default-src` があると `style` 属性は既定で許されない [事実: MDN の CSP の頁 https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy の `'unsafe-hashes'` の項]
   - `default-src 'none'` で、script・接続・フォント・フレームはすべて止まる
   - `<meta name="referrer" content="no-referrer">` も置く
   - meta の CSP では `frame-ancestors` は効かない [事実: MDN の frame-ancestors の頁 https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors]。ローカルのファイルとして開く前提なので、要らない
4. **値の埋め込みとエスケープ**: 値を入れてよい場所は、要素の本文（HTML の本文・SVG の `<text>`・`<title>`）と、二重引用符で囲んだ属性の値（`data-k`・SVG の座標と大きさ・`class` の固定の語の選択）だけ
   - 要素の名前・属性の名前・CSS・URL には、値を入れない
   - **すべての値（数も）を 1 つの関数 `h(value)` に通す**:
     1. 文字列にする（数は `Number.isFinite` を確かめてから `String`。座標は `toFixed(1)`）。集計の数は、ADR-0034 の C の 9・G で有限であることを確かめてあるので、ここで偽になるのは aiqh の誤り（`h()` は例外を投げ、CLI は予期しない誤りとして exit 2。HTML は書かない。設計 R3）
     2. `maskSecrets`
     3. `escapeForDisplay(s, "escape")`（禁止文字と LF・TAB を `\u{HEX}` の表記に。`src/output.ts:31-39`）
     4. `&` → `&amp;`、`<` → `&lt;`、`>` → `&gt;`、`"` → `&quot;`、`'` → `&#39;`
   - 数も文字列として同じ関数に通すのは、経路を 1 つにして、漏れを型ではなく形で防ぐため
   - `h()` の結果は、ブランドの付いた型（`HtmlText`）にする。ひな形は、その型か固定の文字列だけを受け取る（`Safe` の作法。`src/output.ts:44-56`）
   - **SVG も同じ出口**（設計 R2。M4-D-R1-004）: SVG の `<text>`・`<title>` の本文と、SVG の属性の値（座標・大きさ・`points`・`viewBox`・`class`・`data-chart`）も、すべて `h()` を通す。SVG だけの別の出口は作らない
     - SVG の要素と属性は、決まった一覧だけ（要素は決定 2 の 7 つ。属性は `viewBox`・`width`・`height`・`x`・`y`・`x1`・`y1`・`x2`・`y2`・`points`・`class`・`data-chart`・`role`）
     - SVG の `<text>`・`<title>` に入れるのは、固定の語・日付・名前だけで、**数を入れない**（数は表の `data-k` の要素だけに置く。決定 6）
   - **数の表示の文字列**（設計 R2）: 数は `String(n)`（JSON の数と同じ書き方。割合は ADR-0034 の G で小数 4 桁に丸めてある）。`null` は `-`。単位や百分率の書き換えをしない（JSON と同じ文字列にして、照合を文字列の一致にするため）。座標だけは `toFixed(1)`（照合しない。決定 6）
5. **書き込みの出口**: `writeAtomic(target, content, "html")`
   - `format` の型に `"html"` を足す
   - 内容の式（`format === "json" ? escapeRawCharsAsJson(content) : escapeForDisplay(content, "keep")`）は**変えない**。html は Markdown と同じ枝で、禁止文字を `\u{HEX}` にする（すでに `h()` を通っているので、通常は何も変わらない。最後の門）
   - 書き込み箇所の一覧のテスト（`tests/file-write-sites.test.ts:82`）の行は、内容の式が同じなので変わらない（注記の文だけ「dashboard.html」を足す。比べるのはファイル・関数・書く関数・式で、注記は比べない〈同 180 行〉）
   - ADR-0020 の決定 1 の「形式別」に html を足す
   - **書く前に、HTML の文字列の UTF-8 のバイト数を確かめる**（ADR-0034 の N。32 MiB）。超えたら書かずに `HISTORY ERROR (output-too-large)`・exit 2（設計 R3。M4-D-R2-001）
6. **HTML と `--json` の数の照合**（設計 R2 で書き直した。M4-D-R1-004）
   - **`data-k` の作り方**: HTML に出す数は、すべて `data-k="<JSON のパス>"` を持つ要素の本文に、その数だけを置く（例: `<td data-k="projects.0.runs">12</td>`）
     - パスは、集計の JSON の根からのキーと配列の添字を `.` でつないだもの。添字は 0 から始まる 10 進（先頭の 0 なし）。例: `projects.0.checks.3.durationMs.median`
     - JSON のオブジェクトのキーはすべて固定の語（ADR-0034 の G）なので、パスは固定の語と添字だけからでき、名前などの値を含まない。JSON の中でパスは一意なので、`data-k` も一意になる（1 つの数を HTML に 2 回出さない）
     - `data-k` の値も `h()` を通す（決定 4）
   - **対応表**（HTML に出す数。`*` は配列の添字）

     | JSON のパス | HTML の表示先 |
     |---|---|
     | `sources.*.historyFiles`・`read`・`unread`・`duplicates`・`ignored`・`leftoverTemporary` | 「Sources」の表（`--from` ごとの 1 行） |
     | `projects.*.runs`・`interrupted` | プロジェクトの要約の表 |
     | `projects.*.verdicts.PASSED`・`FAILED`・`ERROR` | 同じ |
     | `projects.*.dirty.true`・`false`・`unknown` | 同じ |
     | `projects.*.durationMs.median`・`max` | 同じ |
     | `projects.*.days.*.runs`・`PASSED`・`FAILED`・`ERROR` | プロジェクトの「Days」の表（`<details>` の中。同じ値から、日ごとの verdict の積み上げ棒の SVG を描く） |
     | `projects.*.toolVersions.*.runs` | 「Tool versions」の表 |
     | `projects.*.configs.*.runs` | 「Config hashes」の表 |
     | `projects.*.checks.*.runs`・`PASS`・`FAIL`・`SKIPPED`・`failRate`・`timedOut`・`maxShareOfTimeout` | 「Checks」の表 |
     | `projects.*.checks.*.durationMs.median`・`max` | 同じ |
     | `projects.*.counts.*.days.*.value`・`unknownRuns` | 「Counts」の表（系列ごとの `<details>` の中。同じ値から折れ線の SVG を描く） |
     | `failureProne.*.PASS`・`FAIL`・`failRate` | 「Failure-prone checks」の表 |

   - **照合しない数の許可リスト**（HTML に `data-k` で出さない数）

     | JSON のパス | 扱い | 理由 |
     |---|---|---|
     | `schemaVersion` | 出さない | `--json` の形の版。HTML には要らない |
     | `sources.*.index` | 数としては出さない。行の札 `#<番号>` として出す | 識別子で、量ではない |
     | `unread.*.source` | 同じ（一覧の `#<番号>/<ファイル名>` の札） | 同じ |
     | `projects.*.sources.*` | 同じ（プロジェクトの見出しの下の `from #<番号>` の札） | 同じ |
     | `projects.*.checks.*.lastTimeoutSec` | 出さない | 設定の値（最後の run の上限）。HTML は割合（`maxShareOfTimeout`）だけを出す。R2 までの欄の名前は `timeoutSec`（ADR-0034 の G） |

     - 札の番号は、`h()` を通した固定の書き方（`#` と数）で、`data-k` を付けない。札の並びが JSON の順と同じことは、別に確かめる（下のテスト 5）
     - 数でない値（`complete`・`required`・`truncated` の真偽、名前・版・日付・ハッシュの先頭）は照合の対象の外。真偽は固定の語で出す
   - **テスト**（同じ fixture から `--json` と HTML を作る）
     1. HTML の `data-k` に**重複が無い**
     2. **対応表のすべてが HTML にある**: JSON の数の葉のうち、パスの形が対応表に当たるものの集合と、HTML の `data-k` の集合が等しく、本文が同じ文字列（`null` は `-`）
     3. **許可リストの外の数が HTML に無い**: (a) JSON の数の葉のすべてのパスが、対応表か許可リストのどちらか 1 つだけに当たる（新しい数の欄を足したら、どちらかに入れるまでテストが落ちる）、(b) `data-k` のどれも、許可リストのパスに当たらない、(c) fixture の最後の run の `timeoutSec`（JSON の `lastTimeoutSec`）に、ほかに現れない目印の数（例: 7919）を置き、HTML のどこにも、その数字の並びが無い
     4. **SVG**: SVG の `<text>`・`<title>` に、決定 8 の注入の名前を入れても、生の `<`・引用符・`on…=` が無い（`h()` を通っている）。SVG の属性が決まった一覧だけで、数の属性（`x`・`y`・`width` など）の値が `toFixed(1)` の形（`^\d+\.\d$`）で `viewBox` の範囲の中にあり、`points` がその組の並びで、`viewBox`・`class`・`role` が固定の値である。SVG の `<text>`・`<title>` に数が無い（fixture の名前に数字を使わず、日付の形のほかに数字の並びが無いことで確かめる）
     5. 札 `#<番号>` の並びが、`sources` の順と同じ
   - **SVG の図形の大きさ（数）は照合しない**: 座標・高さは、表の数を固定の倍率で画素にした値で、丸め（`toFixed(1)`）を含む。照合するのは**図の点の数**だけにする: 各 `<svg>` に、元の配列の JSON のパスを `data-chart`（例: `projects.0.days`）として置き、日ごとの棒（`<g>`）の数、折れ線の点の数（値が `null` の日は点にしない）が、その配列の長さ（`null` を除いた数）と同じであることを確かめる
   - 完了条件の語（§4.2）を「`--json` の数と、対応表のとおりに一致し、出さない数は許可リストにある」に直した
7. **出さない欄が HTML に出ないことの確かめ**（テスト）
   - 履歴の fixture の、出さない欄のすべてに、目印の文字列を入れる
     - 対象: `stdoutTail`・`stderrTail`・`command`・`cwd`・`errorSummary`・`description`・`project.root`・`configPath`・`git.branch`・`git.commit`・`parsed.items[].name`
     - 目印は、欄ごとに違う、ほかに現れない ASCII の文字列
   - HTML・`--json`・端末の出力のどれにも、目印が 1 つも無いことを確かめる
   - あわせて、`--from` のパス（一時ディレクトリの絶対パス）が出ないことも確かめる
   - 集計の JSON のキーのパスの集合が、ADR-0034 の G の一覧と一致することを確かめる（足した欄に気づく）
8. **注入と CSP のテスト**
   - 名前に `</td><script>…`・`"><svg onload=…>`・`<!--`・`]]>`・文字参照の形・禁止文字・LF を入れた fixture で、HTML の中に生の `<script`・`on…=`・閉じていない引用符が無いことを確かめる
   - 名前が実体参照のまま表に出ることも確かめる
   - 生成した HTML の要素の名前が、決まった一覧だけであることを確かめる（正規表現でタグを取り出す。生成するのは自分のひな形なので、取り出しの規則が使える）
   - `<meta http-equiv="Content-Security-Policy"` が `<head>` の最初にあり、`<style>` の SHA-256 が CSP の値と合うことを確かめる

### 代替案

- **`'unsafe-inline'` の style-src**: 簡単だが、埋め込みの漏れのときに `style` 属性が効く。ハッシュにする
- **小さな script で並べ替え・絞り込み**: 外へ出ない script でも、「script が無い」形の保証を失う。`<details>` で足りる
- **Markdown（`latest.md` の拡張）**: 推移の図を描けず、CI では履歴が 1 件しかない（M4 SP1）
- **CI の Job Summary**: CI に履歴が無い（ADR-0031: artifact・cache に上げない）。公開のリポジトリの Job Summary は誰でも見られる

### 既知の限界

- CSP の効き方と `<details>` の見え方は、ブラウザに依る（主なブラウザで手で開いて確かめる予定）
- HTML はローカルのファイルとして開く前提。ほかの人に渡すときに何を含むか（プロジェクトと check の名前、版、ハッシュの先頭）は、利用者が判断する
- 表記にした禁止文字（`\u{HEX}`）は、そのまま文字として見える
- SVG の図形の大きさは `--json` の数と照合しない（照合するのは図の点の数だけ。決定 6）。図の見た目の正しさは、手で開いて確かめる
- 出力の上限（ADR-0034 の N。32 MiB）を超える HTML は書かない（`output-too-large`）。`--from` を分けて別々に作る（設計 R3）

### 影響

- `src/report/write.ts`（`format` の型だけ）、`src/history/html.ts`（新）、`src/commands/history.ts`（`--html`・`--out`）、新しいテスト
- `tests/file-write-sites.test.ts:82` の注記の文
- docs: ADR-0020 の追記、ARCHITECTURE、README
- 組み込みのモジュール: `node:crypto`（CSP のハッシュ）は一覧にある。足すものは無い

---

## 4. 全体の計画

### 4.1 M4 の範囲

**作るもの**

- v0.10.0: 設定のハッシュ `configSha256`（ADR-0033）、ADR-0006・0007 の注記、ROADMAP の M4 の書き直し
- v0.11.0: `aiqh history`（端末の表・`--json`。ADR-0034）
- v0.12.0: `aiqh history --html`（静的 HTML。ADR-0035）
- docs の版: 運用テンプレート（`docs/ops/`）
  - 適用先で aiqh を前の版に戻す手順（呼び出す側の 40 桁の SHA を前の版に戻す PR）
  - 見張る項目（必須 check の結果、job の時間と上限に対する割合、FAIL の率、設定のハッシュの変わり目）
  - 品質ポリシー（設定）の変更の手順（R-006 の候補 3。D10）
- ROADMAP の項目 47（R-010 の行き先）

**作らないもの**

- 履歴 DB（`node:sqlite`・JSON Lines）と、ユーザーローカルの保存先
- R-010 の `runs/<runId>/` と manifest（項目 47）
- CI の Job Summary での推移、artifact・cache への保存
- 外部への送信・公開・ホスティング
- Windows への対応
- 失敗の詳細（tail）の表示
- ルールごとの allow の回数（Q1 の決定）
- `aiqh history` の設定のファイル

### 4.2 完了条件

- [ ] 2 つ以上のプロジェクトの履歴（aiqh 本体と、適用先の手元の履歴の 1 つ以上）が、1 つの HTML で見える（手元で作って確かめる。報告に値は載せない）
- [ ] 同じ集計が `aiqh history --json` で取れ、HTML の数が、ADR-0035 の決定 6 の対応表のとおりに `--json` の数と一致し、HTML に出さない数は許可リストにある（ADR-0035 の決定 6 のテスト 1〜5。設計 R2 で「完全一致」の語を直した）
- [ ] 読めない履歴（8 つの分類）が黙って落ちず、一覧と終了コード 2 に出る（テスト）
- [ ] 読み取り量の上限（1 ファイル・全体）、ディレクトリの差し替えの検出、長さと数の上限が、ADR-0034 の M のテストで確かめられている（設計 R2）
- [ ] 集計の数の葉と出力のバイト数の上限、数の範囲と有限の守り、run ごとのタイムアウトに対する割合が、ADR-0034 の M のテストで確かめられている（設計 R3）
- [ ] HTML に script・外の資源・イベントの属性が無く、出さない欄が HTML・`--json`・端末のどれにも出ない（ADR-0035 の決定 7・8 のテスト）
- [ ] verify のレポートに `configSha256` が入り、`aiqh history` で区切りが見える
- [ ] 運用テンプレートが `docs/ops/` にある
- [ ] R-010 と DB の行き先が ADR（ADR-0034 の K・L）と ROADMAP（項目 47）に記録されている
- [ ] 各版で、本体の自己 verify が PASSED（各 commit の SHA 固定の worktree）、PR の必須の 2 つの checks が success
- [ ] 独立レビュー 3 回（この設計・v0.11.0・v0.12.0）の High・Medium が 0（または、人間の判断で行き先が決まっている）

### 4.3 版の分け方（1 つの PR = 1 つの版。同時に開く PR は 1 つ）

| 段 | 版 | PR の commit（目安） | 独立レビュー |
|---|---|---|---|
| 0 | なし | この設計（R1 → R2 → R3）。レビューの結果で直す。設計の案は commit しない（R3 は v0.10.0 の (1) で記録として入れる） | **設計 R1**（High 0 / Medium 4 / Low 1）→ **設計 R2**（High 0 / Medium 3 / Low 0）。**R3 は依頼しない**（人間の決定。R2 の 3 件は v0.11.0 の実装レビューで確かめる） |
| 1 | v0.10.0 | (1) docs: 設計のレビューの記録（`docs/reviews/m4-design/` に R1・R2 の原文の収録・`response-r1.md`・`response-r2.md`・`design-r3.md`、`aiqh review-import` で取り込んだ `findings-r1.json`・`findings-r2.json`） (2) docs: ADR-0033・ADR-0006/0007 の注記・ROADMAP の M4 と項目 47・ARCHITECTURE・CONFIG_SPEC・ADR の索引 (3) 設定のハッシュとテスト（`src/config/load.ts`・`src/types.ts`・`src/report/build-report.ts`、新しいテスト、ADR-0033 の表の 2 ファイル） (4) release（version・CHANGELOG・README） — 4 | 頼まない（v0.11.0 のレビューで、ハッシュの読み方も見てもらう） |
| 2 | v0.11.0 | (1) docs: ADR-0034・ARCHITECTURE・CONFIG_SPEC・**ADR-0029 の注記（Q1 の決定。ADR-0034 の E の文）** (2) 読み込み（`src/history/read.ts`）とテスト（ADR-0034 の M の、読み取り量・ディレクトリの差し替え・長さと数・8 つの分類） (3) 集計（`src/history/aggregate.ts`）とテスト（**allow ルールの名前が出ないこと**〈ADR-0034 の E の「対応するテスト」〉を含む） (4) コマンド（`src/commands/history.ts`・`src/cli-program.ts`。出力の上限つきの口〈ADR-0034 の N〉を含む）と CLI のテスト (5) release — 5。CONFIG_SPEC には Q11 の決定の既知の限界も書く | **v0.11.0 R1**（コードを添付する。設計 R2 の 3 件〈M4-D-R2-001〜003〉が解消したかも、ここで確かめてもらう） |
| 2' | v0.11.x | レビューの修正（テストを先に） — 2〜3 | 必要なら R2 |
| 3 | v0.12.0 | (1) docs: ADR-0035・ADR-0020 の追記 (2) HTML（`src/history/html.ts`・`writeAtomic` の型）とテスト (3) `--html`・`--out` と CLI のテスト (4) release — 4 | **v0.12.0 R1** |
| 3' | v0.12.x | レビューの修正 — 2〜3 | 必要なら R2 |
| 4 | v0.12.x（docs） | (1) `docs/ops/` の運用テンプレートと ROADMAP（項目 47 を含む） (2) release — 2 | 頼まない |
| 5 | なし（記録の PR） | `docs/reports/M4_COMPLETION.md`、ROADMAP の M4 を完了に — 1〜2 | 頼まない |

- 各 commit を SHA 固定の worktree で検証する（typecheck・lint・全テスト・`npm run verify`）。1 つの PR に 6 個を超える commit を入れない
- ADR-0029 の注記は docs の commit (1)、ルールの名前が出ないことのテストは集計の commit (3) に入れる。テストは集計のコードが無いと型検査が通らず、commit ごとの検証（SHA 固定の worktree）で (1) が落ちるため（設計 R2。M4-D-R1-005）
- 設計の R1・R2 の取り込み（`aiqh review-import`）は、v0.10.0 の (1) でまとめて行う。R1 を先に取り込み、R2 は前の回（R1）の `previous` の評価と合わせて取り込む（`docs/ops/review-loop.md` の段取り 4）
- 項目 41＋43・45・39 の小さな版は、段の間に挟める（同時に開く PR は 1 つ）

### 4.4 残りの項目の振り分け（M4 SP1 の案のまま）

| 項目 | 振り分け |
|---|---|
| 39 pytest の出力パーサ | M4 と別の小さな版（`aiqh history` の後） |
| 40 masker の private-key の超線形 | 後で（`aiqh history` がマスクに渡す文字列は、入力の上限で 256 バイト以下。ADR-0034 の C の 8） |
| 41 負荷に弱いテスト | M4 と別の小さな版（43 と一緒） |
| 42 CI の時間の見張り | 見張りのまま（check の「上限に対する最大の割合」を `aiqh history` でも見られる） |
| 43 tests のコメント | 41 と一緒の小さな版 |
| 45 init が node:test を検出しない | M4 と別の小さな版（急がない） |
| 46 timing の billable | 後で（作業なし） |
| review-import の v3 | 後で |
| key-value の誤検出の記録 | M4 に入れる（security-scan の数の推移として。ルールごとの回数は出さない〈Q1 の決定〉。ADR-0029 に注記〈v0.11.0〉） |
| Windows | 後で |
| ADR-0006・0007 の古い記述 | v0.10.0 で注記 |

### 4.5 ROADMAP の M4 の節の書き直しの案（v0.10.0 で入れる文。`docs/ROADMAP.md:949-964` を置き換える）

```markdown
## M4 — 履歴の集計（`aiqh history`）・ローカルダッシュボード・運用テンプレート

### 内容（2026-10-17 の人間の決定 D1〜D15・Q1〜Q11 と、設計 R1〜R3）
- **設定のハッシュ**（v0.10.0、ADR-0033）: verify のレポートの最上位に `configSha256`（設定ファイルのバイト列の SHA-256、小文字 16 進 64 桁）を足す。`schemaVersion` は 1 のまま。R-006 の対策候補 2 を「固定」ではなく「記録」として入れる（設定の外の変更は検出しない。期待の値は固定しない）
- **`aiqh history`**（v0.11.0、ADR-0034）: `--from <dir>` で指定した 1 つ以上の `history/*.json` を、DB を持たずに読み取りだけで集計する（`node:sqlite`・JSON Lines は使わない。再検討の条件は ADR-0034）。出力は端末の表と `--json`。出すのは数と状態だけ（tail・command・cwd・絶対パス・errorSummary・`parsed.items` の名前などは出さない）。読めない履歴は一覧に出して終了コード 2。履歴は信頼しない入力として、読む量・文字列の長さ・数に上限を置く。ディレクトリの差し替えは検出だけ（脅威モデルの制限。ADR-0034）。allow のルールごとの回数は出さない（ADR-0029 に注記）
- **ローカルダッシュボード**（v0.12.0、ADR-0035）: `aiqh history --html` が、script と外の資源の無い静的 HTML を 1 つ書く（既定 `artifacts/history/`。CSP の meta）
- **運用テンプレート**（docs の版）: ロールバック手順・監視項目、品質ポリシー（設定）の変更の手順（R-006 の対策候補 3。docs の手順だけ）
- **作らないもの**: 履歴 DB とユーザーローカルの保存先、R-010 の `runs/<runId>/`（行き先は項目 47）、CI の Job Summary での推移、外部への送信、Windows
- 独立レビューは 3 回（設計〈R1・R2。R3 は依頼しない〉・v0.11.0・v0.12.0）

### 完了条件
- [ ] 2 つ以上のプロジェクトの履歴が 1 つの HTML で見える
- [ ] 集計が `aiqh history --json` でも取得でき、HTML の数が対応表のとおりに一致し、HTML に出さない数は許可リストにある（テスト。ADR-0035）
- [ ] 読めない履歴が黙って落ちない（一覧と終了コード 2。テスト）
- [ ] HTML に script と外の資源が無く、出さない欄が HTML・JSON・端末に出ない（テスト）
- [ ] verify のレポートに `configSha256` が入り、`aiqh history` で区切りが見える
- [ ] 運用テンプレートが `docs/ops/` にある
- [ ] R-010 と DB の行き先が ADR と ROADMAP に記録されている
- [ ] 本体の自己 verify PASS（各 commit の worktree）と、PR の必須の 2 つの checks が success
```

- あわせて、バックログの項目 18 の「R-010（M4）」を「R-010（項目 47）」に直し、項目 47（R-010 の行き先。ADR-0034 の L の内容）を v0.10.0 で足す（人間の指示〈v0.10.0 の指示書〉。設計 R2 までは v0.11.0 の予定だった）

---

## 5. 設計の論点

### 5.1 決定済み（Q1〜Q11。人間の決定、2026-10-17。Q1〜Q9 は設計 R1、Q10・Q11 は設計 R2 の推奨どおり）

| # | 論点 | 選択肢（R1） | 決定 |
|---|---|---|---|
| Q1 | ADR-0029 の決定 3 の「ルールごとの使われた回数を時系列で数える」は、ルールを `parsed.items` の名前でしか見分けられず、D6（名前を出さない）と両立しない | (a) security-scan の数の推移だけを出し、ルールごとは出さない。ADR-0029 に注記する／(b) allow のルールの名前だけを D6 の例外にして出す／(c) ルールの名前のハッシュで見分ける | **(a)**（ADR-0034 の E。注記の文と、v0.11.0 の commit の割り当ても E と §4.3） |
| Q2 | D6 のどちらの一覧にも無い欄: `git.branch`・`checks[].description`・`git.commit` | (a) 3 つとも出さない／(b) `git.commit` の先頭 12 桁だけ出す／(c) branch も出す | **(a)**（ADR-0034 の C の 5・F） |
| Q3 | `--from` のパスの表示 | (a) 番号（`#1`）だけ／(b) 利用者が打ったとおりに出す | **(a)**（ADR-0034 の B の 6） |
| Q4 | 全体の上限（10,000 件・256 MiB）を超えたとき | (a) 入力の誤り（exit 2、集計を出さない）／(b) 新しい方から上限まで集計する | **(a)**（ADR-0034 の D。設計 R2 で、256 MiB を実際に読んだバイト数で数えるようにした） |
| Q5 | 1 ファイルの上限 8 MiB を変えるオプション | (a) 作らない／(b) `--max-file-bytes` を作る | **(a)**（ADR-0034 の C の 1） |
| Q6 | 中断で残った空の履歴のファイル | (a) `empty` として exit 2／(b) 情報として数えるだけ | **(a)**（ADR-0034 の C の表） |
| Q7 | 同じ内容の重複 | (a) 1 回だけ数え、数を情報として出す（exit 0）／(b) 読めないものとして exit 2 | **(a)**（ADR-0034 の C の 7） |
| Q8 | CSP の style-src | (a) 固定の CSS のハッシュ／(b) `'unsafe-inline'` | **(a)**（ADR-0035 の決定 3） |
| Q9 | v0.10.0 で `latest.md` に設定のハッシュを出すか | (a) 出さない（JSON だけ）／(b) 表に 1 行足す | **(a)**（ADR-0033 の決定 7） |
| Q10 | 集計の大きさの上限（入力の上限は読む量を抑えるが、集計は入力より大きくなりうる） | (a) 集計の数の葉の総数に上限 200,000。超えたら `HISTORY ERROR (too-many-values)`・exit 2・何も出さない／(b) 上限を置かず既知の限界とする／(c) HTML だけ系列の表を省く | **(a)**（ADR-0034 の N。値は v0.11.0 で実例から測って ADR に書く。設計 R3 で、出力のバイト数の上限〈32 MiB〉も足した: M4-D-R2-001） |
| Q11 | 設定が許すが、履歴の読み方が拒むもの（checks の数・名前の長さ。`src/config/schema.ts:13-15, 63, 77` に上限が無い） | (a) 既知の限界として `docs/CONFIG_SPEC.md` に書く。verify は変えない／(b) 設定にも同じ上限を足す／(c) 履歴の読み方の上限を大きくする | **(a)**（v0.11.0 の docs の commit で CONFIG_SPEC に書く。ADR-0034 の既知の限界） |

### 5.2 新しい論点（設計 R3 で出たもの。M4 の外。人間の決定が要る）

| # | 論点 | 選択肢 | 推奨 |
|---|---|---|---|
| Q12 | **設定の `timeoutSec` が大きすぎると、check がすぐ時間切れになる**（設計 R3 の数の範囲を確かめていて見つけた。M4 の外）。設定は `timeoutSec` に上限を置かない（`src/config/schema.ts:21, 73`）。実行は `timeoutMs: check.timeoutSec * 1000`（`src/runner/run-checks.ts:51`）を `setTimeout`（`src/runner/execute.ts:221-224`）に渡す。Node は 2,147,483,647 ms（32 ビットの符号付きの最大）を超える待ち時間を 1 ms にし、`TimeoutOverflowWarning` を標準エラーに出す（手元の Node 24.13.1 で、2,147,483,648 を渡すと 8 ms で動き、警告が出た）。そのため `timeoutSec` が 2,147,484 以上（約 24.8 日）だと、check はすぐ時間切れ（FAIL）になり、Node の警告が aiqh の出口（ADR-0016）の外から出る。fail closed は保たれる（PASS にはならない）が、理由が分かりにくい | (a) 設定のスキーマに上限（2,147,483 秒）を足し、超える設定を設定の誤り（exit 2）にする。小さな別の版で、ADR の追記と回帰テストつき／(b) 実行の側で、長い待ち時間を短い待ち時間の連なりにする／(c) 既知の限界として CONFIG_SPEC に書くだけ | **(a)**。設定の段で止まり、理由が設定の誤りとして出る。24.8 日を超える上限は実用の外。ROADMAP の新しい項目として記録し、M4 と別の小さな版で直す（人間の判断） |

---

## 6. 確かめていないこと

- `buffer.toString("utf8")` が、いまの `readFileSync(path, "utf8")` と、BOM・不正な UTF-8 で同じ文字列になること（v0.10.0 でテストにする）
- 出力のガード（ADR-0019）が、記述子からの読み取り（`O_NOFOLLOW` で開いて読む）を止めないこと
- 8 MiB・10,000 件・256 MiB での時間とメモリ（いまの実例は 245 件・1.86 MB）
- CSP の meta とハッシュの style-src が、主なブラウザでローカルのファイルとして開いたときに意図どおり効くこと
- 1 ファイルの大きさの理論上の最大（推定だけ）
- （設計 R2 で足したもの）
  - ディレクトリの lstat の `dev`・`ino` が、差し替え（rename で移して置き直す・symlink への置き換え）で変わること。macOS と Linux（CI）の両方で、ADR-0034 の M のテストで確かめる
  - `readSync` をくり返す読み方で、追記されているファイルの読み取りが上限 + 1 バイトで止まること（M のテスト）
  - 上限を超えた長い文字列で、zod の段の長さの確かめが重くならないこと（M の負荷のテスト。時間は assert しない）
  - Q10 の数の葉の上限の値（200,000）が、実例と HTML の大きさに照らして妥当か（v0.11.0 で測る）
- （設計 R3 で足したもの）
  - 出力の上限つきの口（ADR-0034 の N）が、出力のガードのテスト（`tests/structure/output-guard.ts`）に合うか。合わなければ v0.11.0 の指示書で承認を得る
  - 出力のバイト数の上限の値（32 MiB）と、数の葉の上限の値（200,000）が、実例に照らして妥当か（v0.11.0 で測る）
  - 端末の表を、行をすべて作ってから書く形にしたときの、時間とメモリ
- （設計 R2 で確かめたもの。上の一覧から外した）
  - Node の `fs` に、ディレクトリの記述子を基準に子を開く API が無いこと（ADR-0034 の B の 7。公式の文書と、手元の Node 24.13.1）
  - マスクで文字列が長くなりうること（ADR-0034 の C の 8。URL の認証情報の形の合成の値で確かめた）
- （設計 R3 で確かめたもの）
  - `safeJson` が JSON の全体ではなく、文字列とキーを 1 つずつマスクすること（`src/output.ts:119-168`。ADR-0034 の F）
  - 数の葉 200,000 の合成の集計での `safeJson` の時間と出力の大きさ（ADR-0034 の F。手元で 1 回ずつ。負荷は 1 分平均 3.4）
  - Node が 32 ビットを超える待ち時間を 1 ms にすること（Q12）
