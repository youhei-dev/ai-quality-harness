# ADR-0034: `aiqh history` — 履歴を DB 無しで、読み取りだけで集計する（端末の表と `--json`）

- 状態: 採用（v0.11.0。ARCHITECTURE の「履歴 DB」を、DB を持たない集計に置き換える。ADR-0003 の代替案「SQLite に直接保存: M4 の履歴 DB で扱う」〈ADR-0003 の 29 行目〉への答え。HTML のダッシュボードは ADR-0035〈v0.12.0 の予定〉。設計と独立レビューの記録は `docs/reviews/m4-design/`〈設計 R3 の §2 がこの ADR の案〉。v0.11.2 で H・I・N の出力の上限の数え方を直した〈実装レビュー m4-history R1 の M4-H-R1-001。`docs/reviews/m4-history/`〉）
- 日付: 2026-10-18（v0.11.0）

## 文脈
- 計画では、複数プロジェクトの `history/*.json` を、ユーザーローカルの 1 か所（例: `~/.aiqh/history.db`）に取り込む想定だった（ARCHITECTURE の §6.3。v0.11.0 で書き直した）
- `node:sqlite` は、Node 24.13.1 では Stability 1.1（実験的）で、import しただけで標準エラーに `ExperimentalWarning` が出る（aiqh の出口〈ADR-0016〉の外）。`engines` の範囲（`>=24.0.0`）で API が違い、使うには組み込みの一覧（ADR-0019）と書き込みの出口（ADR-0020）の例外が要る（M4 の SP1 の調べ。設計 R3 の §2 の文脈）
- 実際の履歴の量は小さい（下の「上限の値と測り」）。DB 無しの読み込みと集計で足りる
- 履歴の中身は、検証されるリポジトリの設定と道具の出力に由来する。**信頼しない入力**として読む（壊れたファイル・symlink・巨大なファイル・意図して作られた値がありうる）
- 読めないものを「無い」としない（ADR-0022）。使い方の誤りは exit 2（ADR-0021）
- M4 の設計（設計 R1〜R3）と、その独立レビュー R1（High 0 / Medium 4 / Low 1）・R2（High 0 / Medium 3 / Low 0）。人間の決定 D1〜D15・Q1〜Q11（2026-10-17）。設計 R3 は独立レビューを受けず、v0.11.0 の実装レビューで確かめる（人間の決定）

## 脅威モデル
- `aiqh history` は、**利用者が、自分の手元の、自分のディレクトリを読む道具**である
- **信頼しないもの**: 履歴のファイルの**中身**。壊れた・巨大な・意図して作られた値がありうる（決定 C）
- **対象の外とするもの**: 読んでいる最中に、ほかの者（別の利用者・別のプロセス）が、`--from` のディレクトリやその祖先を差し替える場面。ディレクトリの**構造**は、読み始めから読み終わりまで、利用者の制御の下にあるとみなす
- そのうえで、読み始めと読み終わりで、ディレクトリが同じものかを確かめる（決定 B の 7）。これは**検出**であって、**防止**ではない。読んでいる間に差し替えて、読み終わる前に戻した場合は検出しない
- この制限は、Node の `fs` に、ディレクトリの記述子を基準に子を開く API（POSIX の `openat` の類）が無いことによる（Node v24.13.1 の fs の文書と、手元の Node 24.13.1 の `fs.constants`・`fs.Dir` で確かめた。設計 R3 の §2 の B の 7）

## 決定

### A. コマンド
```
aiqh history --from <dir> [--from <dir> …] [--json] [--cwd <dir>]
```
- `--from` は繰り返せる（`src/cli-program.ts` の `collect`）。1 つ以上が要る。0 個は使い方の誤り（`HISTORY ERROR (usage)`・exit 2。`src/commands/history.ts:94`）
- `--cwd` は、相対の `--from` を解決する基準（既定は現在のディレクトリ）
- ファイルを書かない（端末の表と、`--json` の標準出力だけ）。`--html` と `--out` は v0.12.0（ADR-0035）
- モジュール: `src/run-history/read.ts`（B〜D）、`src/run-history/aggregate.ts`（E〜G）、`src/commands/history.ts`（A・H・端末の表）。設計 R3 は `src/history/` としていたが、push の前の走査（警告の 5 条件の 1: `history/` の下の変更）が、ソースのファイルにも毎回当たるので、ディレクトリの名前を `run-history` にした（v0.11.0 の判断。振る舞いは変えない）

### B. 入力（`--from`）
1. **2 つの形**（`resolveSource`。`src/run-history/read.ts:221`）: `<dir>` を `--cwd` から解決し、realpath を取る
   - (a) `<dir>/artifacts/verification/history` が（lstat で）ディレクトリなら、`<dir>` をプロジェクトのルートとみなし、その history を読む
   - (b) そうでなければ、`<dir>` 自身を history のディレクトリとみなす（`output.dir` を変えたプロジェクトは、history のディレクトリを直接渡す）
   - その後の列挙・lstat・open は、すべて**初めに realpath で解決したパス**を基準にする。`--from` の文字列をもう一度解決しない
2. **(a) の包含**: history のディレクトリの realpath が、ルートの realpath の中にあること。外を指す symlink は入力の誤り（`outside-root`。`src/run-history/read.ts:250`）。(b) は利用者が直接指定したディレクトリなので、包含は問わない
3. **入力の誤り**（exit 2。集計を出さない）: 存在しない（`not-found`）、ディレクトリでない（`not-a-directory`）、調べられない・列挙できない（`unreadable-directory`。ENOENT 以外の errno。ADR-0022）、realpath が同じ `--from` が 2 つ（`duplicate-source`）、履歴の名前のファイルが 1 つも無い（`no-history`）、全体の上限（D）、ディレクトリの差し替え（7 の `directory-changed`）
4. **読む名前**: `^\d{8}T\d{6}Z(?:-[1-9]\d*)?\.json$`（`HISTORY_NAME`。`src/run-history/read.ts:27`）に合う名前だけ。ディレクトリの中を再帰しない
   - `writeAtomic` が残した一時ファイル（`.<履歴の名前>.tmp-<16 桁>`。`src/run-history/read.ts:29`）は読まずに `leftoverTemporary` に数える。それ以外の名前は `ignored` に数える（どちらも情報。終了コードに影響しない）
5. **symlink を辿らない**（`readOne`。`src/run-history/read.ts:263`）: lstat で通常のファイルでなければ `not-regular`。開くときは `O_RDONLY | O_NOFOLLOW`（`src/run-history/read.ts:273`。Windows では 0）で開き、記述子の `fstat` で通常のファイルであることを確かめてから（281 行）、その記述子から読む
   - lstat の後に symlink に替えられ、open が `ELOOP` で失敗したときは `not-regular`。ディレクトリに替えられたときは、記述子の `fstat` で `not-regular`（どちらもテストで確かめた）
   - `O_NOFOLLOW` が拒むのは、パスの最後の要素の symlink だけ。祖先の差し替えは 7 で扱う
   - 出力のガード（ADR-0019。`tests/structure/output-guard.ts`）は、文字列のパスへの `openSync` と、記述子からの `readSync`・`fstatSync`・`closeSync` を止めない（`tests/structure/` は変えていない）
6. **パスを表示しない**（Q3）: 端末・`--json`・エラーの文言では、`--from` を指定の順の番号（`#1`・`#2`…）で示す。読めないファイルは `#<番号>/<ファイル名>`（名前は 4 の正規表現に合うものだけなので、時刻と数字だけ）。入力の誤りの文言にもパスを入れない
7. **ディレクトリの差し替えの検出**（M4-D-R1-002）: 読み始める前に、次のパスを lstat して、種類（ディレクトリ・symlink・その他）・`dev`・`ino` を記録し（`identity`。`src/run-history/read.ts:211`）、すべての `--from` のファイルを読み終わった後に、同じパスを lstat し直して比べる（415 行）。違えば（lstat の失敗を含む）`HISTORY ERROR (directory-changed)`・exit 2・集計を出さない
   - (a) の形: ルート・`artifacts`・`artifacts/verification`・`artifacts/verification/history` と、history の realpath（重なりは 1 つにする）
   - (b) の形: history のディレクトリ 1 つ（祖先は確かめない）
   - **検出であって、防止ではない**（脅威モデル）

### C. 1 ファイルの読み方（信頼しない入力）
1. **大きさ: 1 ファイル 8 MiB**（8,388,608 バイト。`READ_LIMITS.fileBytes`。`src/run-history/read.ts:45`）。上限を変えるオプションは作らない（Q5）
   - 事前の大きさに頼らない（M4-D-R1-001）: 開いた記述子から `readSync` をくり返し、**最大で上限 + 1 バイトまで**読む（282 行）。読む先は、上限 + 1 の大きさの `Buffer` 1 つで、すべてのファイルで使い回す
   - 読んだ量が上限を超えたら `too-large`（読んでいる間に大きくなった場合も）。上限以下なら、読む前の `fstat` の大きさ・読んだ量・読んだ後の `fstat` の大きさを比べ、1 つでも違えば `unreadable`（`code` は固定の語 `size-changed`。293 行）
   - 大きさの変化を新しい分類にしない理由: verify は history を一時ファイル → rename で書く（`src/report/write.ts`）ので、aiqh 自身はその場で追記も切り詰めもしない。変わるのは aiqh の外の何かが書いたときだけで、利用者がすることは `unreadable` と同じ（確かめて読み直す）
2. **UTF-8**: 既存の `decodeUtf8Strict`（`src/security/raw-chars.ts`。`TextDecoder` の `fatal`）。不正なら `not-utf8`
3. **JSON**: `JSON.parse`。失敗したら `not-json`。深さの上限は別に設けない（V8 の `JSON.parse` は深い入れ子でもスタックを使い切らない。zod は知らないキーの値をたどらずに捨てる。大きさの上限が時間とメモリを抑える）。読む欄の中の 10,000 段の入れ子は `bad-shape`、読まない欄の中の同じ入れ子は捨てられて読める（テスト）
4. **版**: 最上位がオブジェクトで、自分の持つ `schemaVersion` が数の 1。それ以外は `unknown-version`
5. **形（zod。`REPORT`。`src/run-history/read.ts:164`）**: 集計に使う欄だけを読み、知らないキーは捨てる。合わなければ `bad-shape`
   - 必須: `tool.version`（UTF-8 で 64 バイト以下）、`project.name`（空でない。UTF-8 で 256 バイト以下）、`startedAt`（`toISOString()` の形で、読み戻して同じ文字列）、`durationMs`、`verdict`、`exitCode`、`git`（`null` か `dirty` を持つオブジェクト）、`summary` の 5 つ、`checks`（256 個まで。各要素の `name`〈256 バイト以下〉・`kind`・`required`・`status`・`durationMs`・`timedOut`・`timeoutSec`）
   - 任意: `interruptedBy`（無い → 中断ではない）、`configSha256`（無い → 不明。あれば 64 桁の小文字 16 進）、`checks[].parsed`（無い → 不明。あれば `tool`・`status`・`truncated`・`counts`）
   - **長さと数の上限**（M4-D-R1-003）: `NAME_MAX_BYTES` 256・`VERSION_MAX_BYTES` 64・`CHECKS_MAX` 256（47〜51 行）。超えたら**切り詰めずに `bad-shape`**。その値は `maskSecrets` にも渡らない（マスクの前に切ると、秘密の形の断片が残るおそれがある）。バイトの長さは UTF-8 のバイト数（多バイトの文字で上限を広げられない）。`checks` の数は zod の前に数える（314 行）
   - **数の範囲**（M4-D-R2-003）: `durationMs`・`summary`・`parsed.counts` の値は 0 以上の安全な整数（`COUNT`。135 行）、`exitCode` は安全な整数、`timeoutSec` は設定の規則と同じ正の整数で安全な整数（160 行）。外は `bad-shape`。JSON の `-0` は 0 として読む
   - **読まない欄**（形を確かめない・保持しない）: `project.root`・`configPath`・`finishedAt`・`git.commit`・`git.branch`・`categories`・`checks[].command`・`cwd`・`description`・`exitCode`・`signal`・`startedAt`・`errorSummary`・`stdoutTail`・`stderrTail`・`outputTruncated`・`parsed.reason`・`parsed.items`・`parsed.itemsOmitted`。`JSON.parse` の間は一時的にメモリにあるが、残るのは zod が返した読む欄だけで、集計と出力に混ざりようがない
   - `parsed.counts` のキーは、パーサごとの一覧（`COUNT_KEYS`。`src/parse/read.ts:24`。各パーサが export する: `src/parse/vitest.ts:19`・`src/parse/eslint.ts:68`・`src/parse/npm-audit.ts:12`・`src/parse/security-scan.ts:24`）だけを、自分の持つキーとして読む（337 行）。`__proto__` などのキーは一覧に無いので使わない。一覧がパーサの書くキーをすべて含むことは、パーサの fixture でテストする
6. **重複**（Q7）: バイト列の SHA-256 が同じファイルは 1 回だけ数え、`duplicates` に数を出す（情報。exit 0）
7. **読めないものの分類**（8 つの固定の語。`UNREAD_REASONS`。54 行。決める順もこの順。1 つのファイルは最初に当たった 1 つになる）: `not-regular` → `unreadable`（`code` は errno の名前〈`/^E[A-Z0-9]+$/`〉か `size-changed`）→ `too-large` → `empty`（0 バイト。中断された verify が残しうる。Q6: exit 2）→ `not-utf8` → `not-json` → `unknown-version` → `bad-shape`（どの欄かは出さない）

### D. 全体の上限（超えたら入力の誤り。exit 2、集計を出さない。Q4）
- 履歴の名前のファイルの数: すべての `--from` を合わせて 10,000（列挙の段で数え、超えたら 1 つも読まない。`too-many-files`。369 行）
- **実際に読んだバイト数**の合計: 256 MiB（268,435,456 バイト）。`too-large` のファイルの上限 + 1 バイト、`unreadable` になったファイルの途中までを含む。1 ファイルを読むたびに足し、超えた時点でやめる（`too-many-bytes`。394 行）
- 一部だけを集計すると、どれが抜けたかで推移が変わる。超えたら、利用者が入力を減らす（古い履歴を別の場所へ移す、`--from` を分ける）

### E. 集計（`startedAt` の UTC の順。日は UTC の日付。`src/run-history/aggregate.ts`）
- run は `startedAt`、次に `--from` の番号、次にファイル名の順に並べる（同じ時刻でも順が決まる）
- **プロジェクト**（`project.name` ごと。D3）: 寄与した `--from` の番号、run の数、verdict ごとの数、`dirty` ごとの数（true・false・不明）、中断された run の数、最初と最後の `startedAt`、所要時間の中央値（並べて `floor((n-1)/2)` 番目）と最大、日ごとの run と verdict の数、`tool.version` の区切りと `configSha256` の区切り（同じ値が続く区間。値の無い run は `null` の区間）
- **check**（プロジェクトと check の名前ごと。最初に現れた順）: run の数、PASS・FAIL・SKIPPED の数、FAIL の率（FAIL ÷ 〈PASS + FAIL〉。分母が 0 なら `null`）、時間切れの数、所要時間の中央値と最大、最後の run の `kind`・`required`・`timeoutSec`（`lastTimeoutSec`。243 行）
  - **`maxShareOfTimeout`**（M4-D-R2-002）: **run ごとに** `durationMs ÷ （その run の timeoutSec × 1000）` を計算し、その最大（249 行）。上限が run の間で変わっても、どの run にも無い割合にならない。時間切れの run では 1 を超えうる
- **失敗しやすい check**: すべてのプロジェクトで、PASS + FAIL が 3 以上の check を、FAIL の率の高い順（同じなら FAIL の数、次にプロジェクトの名前、次に check の名前。マスクの前の名前で比べる）に 10 件
- **`parsed.counts` の推移**: プロジェクト・check・パーサの道具・数のキーごとに、その check があった日ごとの値。値は、その日の最後の、`status` が `parsed` で同じ道具の run の値（277 行）。値の無い run は `unknownRuns` に数え（273 行）、0 と混ぜない。その日に値が無ければ `value` は `null`。値の run が `truncated` なら `truncated: true`
- **security-scan の数**（Q1。ADR-0029 の注記）: `suppressed`・`allowRulesUsed`・`expiredAllowRules`・`unusedAllowRules` も、ほかの数と同じ日ごとの推移だけを出す。**ルールごとの回数は出さない**（ルールを見分けるのに `parsed.items` の名前が要り、それは読まない）
- 同じ名前のプロジェクトが別の `--from` から来たときは 1 つに合わせ、寄与した番号を出す

### F. 出す欄の許可リスト（D6）
- 出すのは、E の数と固定の語、次の文字列だけ: プロジェクトの名前・check の名前（入力は 256 バイト以下 → マスク → 200 文字で切る。`NAME_DISPLAY_MAX`）、`tool.version`（64 バイト以下 → マスク → 64 文字。`VERSION_DISPLAY_MAX`）、`configSha256`（`--json` は 64 桁、端末は先頭 12 桁）、check の種類・パーサの道具・数のキー（固定の語）、時刻と日付（形を確かめた ISO の文字列）、読めないファイルの名前（時刻と数字だけ）
- 切るのはマスクの後で、コードポイントの単位（サロゲートの組を割らない。`shown`。`src/run-history/aggregate.ts:149`）
- **出さないもの**: tail・`command`・`cwd`・絶対パス（`project.root`・`configPath`・`--from` のパス）・`errorSummary`・`parsed.items` の名前（allow のルールの名前を含む）・`git.branch`・`git.commit`・`checks[].description`・`parsed.reason`。どれも読まない（C の 5）。目印の文字列を入れた fixture で、端末・`--json`・エラーの文言のどこにも出ないことをテストした
- **マスク**: 名前と版は、集計を作るときに、異なる値ごとに 1 回 `maskSecrets` に通す（古い履歴を、いまのパターンで伏せ直す）。そのうえで、端末は `createOutput`（ADR-0016）、`--json` は `safeJson`（`src/output.ts:166`）を通る（マスクは冪等）
- **集計の JSON の全体を `maskSecrets` に渡さない**（M4-D-R2-001）: `safeJson` は値をたどり、文字列の値とオブジェクトのキーを 1 つずつマスクする（`copyJsonData`。`src/output.ts:119-160`）。`--json` でマスクに渡る 1 つの文字列は、200 文字以下の名前か固定の語・日付・ハッシュ
- 集計のキーはマスクの前の名前で作る（伏せた結果が同じになる 2 つの名前は、表示が同じ 2 行になる。既知の限界）

### G. `--json` の形
- 最上位は `{"kind": "aiqh-history", "schemaVersion": 1, "tool": {"version"}, "complete", "sources", "unread", "projects", "failureProne"}`（`HistoryAggregate`。`src/run-history/aggregate.ts:103`。各欄の形は設計 R3 の §2 の G のとおり）
- `kind` と `schemaVersion` で、verify のレポート（`schemaVersion` 1）・findings（`schemaVersion` 1、ADR-0026）と見分ける
- **版の規則**: 欄を足すだけなら 1 のまま。欄を消す・名前を変える・型や意味を変えるときは 2 にする。この規則は、verify のレポートについても同じ（ADR-0003 の 10・32 行目、ADR-0028 の決定 9 の作法を、この ADR で言葉にする）
- 生成の時刻は入れない。**同じ入力から同じ出力**（並べた順で作り、`--from` の順も入力の一部。テスト）
- オブジェクトのキーは、すべて固定の語（M4-D-R1-004 の前提）。名前・版・日付などの値をキーにしない。JSON のパスは固定の語と配列の添字だけからできる（ADR-0035 の `data-k` に使う）
- 割合（`failRate`・`maxShareOfTimeout`）は小数 4 桁に丸める（`round4`。138 行）
- 値の無い数は `null`（`failRate` の分母 0、その日に値の無い `value`）
- **すべての数は有限**（M4-D-R2-003）: 集計の後、出力の前に、数の葉のすべてが `Number.isFinite` であることを確かめる（`allFinite`。359 行）。偽なら `HISTORY ERROR (non-finite)`。入力の範囲（C の 5）で防げているはずの、届かないはずの守り（テストは集計の差し替えでだけ確かめる）。範囲の端（`durationMs` 2^53 - 1 と `timeoutSec` 1）でも割合は有限（およそ 9.0 × 10^12。テスト）

### H. 終了コードと最後の行（`src/commands/history.ts:95-116`）
| 終了コード | とき | 最後の行 |
|---|---|---|
| 0 | すべての履歴の名前のファイルを読めた（重複・`ignored`・`leftoverTemporary` は情報。履歴の中の FAILED の run も集計の値） | `HISTORY COMPLETE — projects <p>, runs <r>, sources <s>`（標準出力。`--json` のときは標準エラー） |
| 2 | 読めないものが 1 つ以上あった。集計と一覧は出す（`--json` は `"complete": false`） | `HISTORY INCOMPLETE — unread <u> of <f> history files (listed above)`（同じ） |
| 2 | 使い方・入力の誤り（B・D）、集計と出力の上限（N）、`non-finite`。集計も一覧も出さない | `aiqh: <理由>` の行と `HISTORY ERROR (<種類>)`（**標準エラー**。標準出力は空） |
| 1 | **使わない** | — |

- `<種類>` は固定の語: `usage`・`not-found`・`not-a-directory`・`unreadable-directory`・`outside-root`・`duplicate-source`・`no-history`・`too-many-files`・`too-many-bytes`・`directory-changed`・`too-many-values`・`output-too-large`・`non-finite`
- `HISTORY ERROR` の行を標準エラーに出すのは、設計 R3 の M（テストの計画）の「標準出力は空」に合わせた（設計 R3 の H の表の見出しは「標準出力」と読める書き方だった。実装は M に従い、この表で明記した）
- 1 を使わない理由: ほかのコマンドの 1 は finding・検査の失敗（ADR-0021）。history は品質ゲートではなく、1 を使うと「過去に FAILED があった」と「読めなかった」が混ざる
- 中断（SIGINT・SIGTERM）と処理されなかった例外は、CLI の既存の扱い（ADR-0024・`src/cli-signals.ts`）に従う
- **出力の上限（N）は、標準出力に実際に書くバイト（各行と改行、文書と改行）に当て、書き手の種類によらない**（v0.11.2。M4-H-R1-001）
  - 表は、すべての行と、最後の行（`HISTORY COMPLETE …`・`HISTORY INCOMPLETE …`）と、それぞれの改行を数える。`--json` は、文書と、書くときに足す改行を数える
  - 先に数え、上限以下のときだけ書く。超えたら何も書かずに `HISTORY ERROR (output-too-large)`（標準エラー）・exit 2
  - 数は、書き手が端末（`console.log`）・テストの `log`（1 行ずつ、改行を付けずに受け取る）・テストの `write`（標準出力のバイトをそのまま受け取る）のどれでも同じ。数えるのは出力の API（`src/output.ts` の口 `linesWithin`・`jsonWithin`）で、呼び出す側では数えない
  - 標準エラー（`--json` のときの最後の行、誤りの行）は上限に数えない（固定の文と数だけ）
  - v0.11.1 までは、表の最後の行と `--json` の改行を数えていなかった（上限ちょうどの近くで、上限を超えて書いていた）
- **v0.12.0 の HTML のファイル（ADR-0035）にも、同じ決まりを当てる**: 上限は、実際に書くファイルの全部のバイト

### I. 出口
- 端末: `createOutput`（ADR-0016・0017）。表の 1 行は 1 回の `log`。読めないものの一覧は表の後ろ
- 端末の表: すべての行と最後の行を作ってから、`Output` の口 `linesWithin(lines, maxBytes)`（v0.11.2。`src/output.ts:228, 244-251, 258`。ADR-0016 の注記）に渡す（`src/commands/history.ts:112-114`）。口は、`safeText` を通した各行の UTF-8 のバイト数と改行の合計を確かめ、上限（N）の中なら書く。超えたら 1 行も書かない
- `--json`: `Output` の口 `jsonWithin(value, maxBytes)`（`src/output.ts:222, 244-251, 257`。ADR-0016 の注記）。`json` と同じ `safeJson` の文書を作り、そのバイト数と改行の 1 バイトの合計が上限以下のときだけ書き、書いたかを返す（v0.11.2 から改行を数える）
- 書き手 `write`（v0.11.2。`src/output.ts:203`、`HistoryOptions.write`）: 標準出力に書くバイトを、そのまま受け取るテストの書き手。`log` の代わりになり、上限の口が書くものは 1 つの文字列を 1 回で受け取る。境界のテストは、これが受け取ったバイト数で確かめる
- 既定の書き手は、上限を確かめた後に、1 行ずつ `console.log` で書く。書くバイトは数えたものと同じ。行ごとに処理した文字列を 1 つにまとめて処理し直さないのは、マスクに行をまたぐ規則（PEM の鍵の区間、`bearer` の後ろの空白など）があり、まとめると中身が変わりうるため。`Safe` を作るのは、これまでどおり `safeText`・`safeJson` だけ（`tests/structure/output-guard.ts`）
- ファイルは書かない。HTML は ADR-0035（`writeAtomic`。ADR-0020）

### J. 組み込みのモジュール（ADR-0019）
- 使うのは `node:fs`・`node:path`・`node:crypto`（重複の判定）だけで、どれも一覧にある。**一覧に足したものは無く、`tests/structure/` も変えていない**
- `TextDecoder` は既存の `decodeUtf8Strict` を通して使う

### K. 再検討の条件（D1・D12）
次のどれかに当たったら、DB（`node:sqlite` か JSON Lines）や上限の値を改めて検討し、ADR を足す。
1. `node:sqlite` が、aiqh の `engines` の下限と CI の Node の両方で Stability 2（Stable）になり、import で警告が出なくなったとき
2. 実際の入力で `aiqh history` が 5 秒を超える、または全体の上限（10,000 件・256 MiB）か、集計と出力の上限（N）の 10% に、普通の使い方で届くとき
3. 消える場所（SHA 固定の worktree・使い捨ての clone）の履歴を残したい、という要求が出たとき（D14 を見直すとき）

### L. R-010 の行き先（D11）
- **M4 では作らない**。`aiqh history` は `history/` だけを読み、`history/` の名前は N1 で排他的に取るので、`latest.*` の不整合の影響を受けない
- ROADMAP の**項目 47** に残した（v0.10.0。案は (a) `runs/<runId>/` と単一の pointer / manifest の原子的な更新、(b) latest の更新の全体を lock、(c) 記録で閉じる。行き先は M4 の後。人間の判断）。独立レビュー R2 の「roadmap から落とさないこと」（`docs/reviews/m0/independent-review-r2.md` の 218〜224 行）を守る

### M. テストのための差し替え
- 読み込みは、上限の値・1 回の読み取りの大きさと、読む途中の 4 か所の呼び出し（lstat の後、記述子からの 1 回の読み取りの後、1 ファイルを読んだ後、すべてを読んだ後）を引数で差し替えられる（`ReadDeps`。`src/run-history/read.ts:122`）。集計は数の葉の上限と、有限の確かめの前の呼び出し（`AggregateDeps`）。コマンドは、それらと出力の上限（`HistoryOptions.deps`）
- 設定・CLI からは届かない。CLI は既定の値だけを使う（前例: `src/parse/read.ts` の `ReadDeps`）
- テストは `tests/history-read.test.ts`（31 件）・`tests/history-aggregate.test.ts`（17 件）・`tests/history-cli.test.ts`（13 件）・`tests/output-json-within.test.ts`（3 件）。v0.11.2 で `tests/history-output-bytes.test.ts`（7 件。出力の上限の境界を、書き手 `write` が受け取ったバイト数で確かめる）を足し、`history-cli` の 2 件と `output-json-within` の 1 件の境界を、改行と最後の行を数える形にした（人間の承認）。時間は assert しない（ROADMAP の項目 41）

### N. 集計と出力の大きさの上限（Q10、M4-D-R2-001）
- **集計の数の葉: 200,000**（`VALUES_MAX`。`src/run-history/aggregate.ts:21`）。集計を作りながら数え、超えた時点でやめる（`HISTORY ERROR (too-many-values)`）。数の葉は、数と、数の代わりの `null`（`failRate`・`value`）
- **出力の実バイト数: 32 MiB**（33,554,432 バイト。`OUTPUT_MAX_BYTES`。`src/commands/history.ts:24`）。端末は `safeText` の後の各行と改行の合計（最後の行を含む）、`--json` は `safeJson` の文字列の UTF-8 のバイト数と改行の 1 バイト。標準出力に実際に書くバイトで、書き手の種類によらない（v0.11.2。H）。超えたら `HISTORY ERROR (output-too-large)`・何も出さない
- 両方を置く理由: 数の葉は集計を作る仕事の量を抑え、出力のバイト数は名前の長さを含めた出す量そのものを抑える。どちらか 1 つでは、もう片方が大きくなりうる（下の測り: 長い名前の形は、数の葉が上限の中でも 32 MiB を超える）
- 上限を超えて書かないときも、上限を確かめる前に、出力の文字列は一度メモリに作られる。その大きさは数の葉の上限で抑えられる（下の測りの長い名前の形で 38.5 MB。設計 R3 の測りの、1 系列に 1 日だけの形で約 49 MB）

## 上限の値と測り（v0.11.0。2026-10-18、手元の macOS・Node 24.13.1。値は数だけ。時間は Node の起動を含むコマンドの全体）
- **実例**（3 か所の履歴。読むだけ）

  | 履歴 | 履歴のファイル | 合計のバイト | 最大の 1 ファイル | 数の葉 | `--json` のバイト | 表のバイト | 時間（`--json`・表） |
  |---|---|---|---|---|---|---|---|
  | aiqh 本体 | 220 | 1,688,608 | 29,159 | 1,978 | 157,336 | 8,752 | 308 ms・221 ms |
  | 適用先 1 | 21 | 177,506 | 19,490 | 290 | 21,601 | 2,997 | 159 ms・158 ms |
  | 適用先 2 | 5 | 20,162 | 4,939 | 60 | 2,921 | 1,202 | 161 ms・150 ms |
  | 3 つを合わせて（プロジェクト 3） | 246 | 1,886,276 | 29,159 | 2,314 | 180,959 | 12,433 | 187 ms・185 ms |

  どれも exit 0・`HISTORY COMPLETE`（読めないもの・重複は 0）
- **上限の近くの合成の履歴**（`tmp/` の下に作った。1 run に vitest の数を持つ check）

  | 形 | run | 数の葉 | `--json` のバイト（上限なしで作った大きさ） | 結果（`--json`・表） | 時間（`--json`・表） |
  |---|---|---|---|---|---|
  | 日の多い形（1 日 1 run・check 2 つ・3,500 日） | 3,500 | 196,047 | 14,772,032 | 0・0（表は 194,960 バイト） | 1,089 ms・398 ms |
  | 同じ形で 3,600 日 | 3,600 | 201,647 | 15,194,232 | `too-many-values`・同じ | 463 ms・398 ms |
  | 長い名前の多い形（250 バイトの名前の check 10 個 × 550 run） | 550 | 198,025 | 38,541,897 | `output-too-large`・0（表は 19,549,568 バイト） | 1,885 ms・1,644 ms |
  | 同じ形で 560 run | 560 | 201,625 | 39,242,797 | `too-many-values`・同じ | 436 ms・316 ms |

  上限なしで作ったときの内訳（読み込み・集計・`safeJson`）: 日の多い形 3,500 日は 477 ms・45 ms・646 ms、長い名前の形 550 run は 94 ms・122 ms・1,496 ms。そのときのヒープは最大 284 MiB
- **判断: 200,000 と 32 MiB のままにする**
  - 実例の最大（3 つを合わせて）は、数の葉で上限の 1.2%（2,314）、`--json` のバイトで 0.54%（180,959）、ファイルの数で 2.5%（246 / 10,000）、読んだバイトで 0.70%（1,886,276 / 256 MiB）。時間は 0.4 秒未満
  - 上限の近くでも、時間は 2 秒未満（K の 2 の 5 秒より下）、ヒープは 300 MiB 未満
  - 日の多い形は 32 MiB の半分以下で通り、長い名前の形は数の葉が上限の中でも 32 MiB を超えて止まる。2 つの上限が、それぞれの形を受け持つ（N の理由のとおり）
  - 32 MiB を上げると、長い名前の形の出力（約 39 MB）が通るようになるが、そのような履歴は実例に無く、`--from` を分ければ出せる。下げる理由も無い
  - 再検討の条件は K の 2（実例が上限の 10% に届いたとき）

## 代替案
- **`node:sqlite`**: 文脈の理由で、いまは採らない（K の 1）
- **JSON Lines の索引**: 追記の排他・途中で切れた行・重複・history との二重の記録を持つことになる。いまの量では得が無い
- **history をユーザーローカルへ写す**: 写す契機と写しの管理が要る。D14 で受け入れたので採らない（K の 3）
- **読めないものを黙って飛ばす**: ADR-0022 に反する
- **読めないものが 1 つでもあれば集計を出さない**: 中断で残った空のファイル 1 つで全体が見えなくなる。D4 で、一覧に出して集計を続け、exit 2 にした
- **終了コード 1 を「読めないものがあった」にする**: H の理由で採らない
- **ディレクトリの記述子を基準にした探索**（M4-D-R1-002 の修正案の前半）: Node の `fs` にその API が無い。ネイティブのアドオンや依存の追加は ADR-0008 に反する。脅威モデルの制限と検出にした
- **大きさが変わったファイルに新しい分類を作る**: C の 1 の理由で採らない
- **長い文字列を切り詰めて読む**: マスクの前に切ると、秘密の断片が残るおそれがある（C の 5）
- **check の名前に設定と同じ形（`^[a-z0-9][a-z0-9-]*$`）を求める**: レポートの名前はマスクの後の値で、`[REDACTED:…]` を含みうる。長さだけを確かめる
- **出力を `Output` の外で測る**: `Safe` を作るのは `safeText`・`safeJson` だけで、書くのは `emitOut`・`emitErr` だけ（ADR-0016・0019）。`--json` は `Output` に口を 1 つ足し、表は `safeText` の結果の長さを先に測る形にした（どちらも出力のガードを変えずに済む）

## 既知の限界
- 同じ `project.name` の別のプロジェクトは 1 つに合わさる（別々に実行する）
- 伏せた結果が同じになる 2 つの名前は、同じ表示の 2 行になる
- ルールごとの allow の回数は出さない（Q1）
- `git.commit` を出さないので、どの commit の run かは分からない（Q2）
- 中断で残った空のファイルは、利用者が消すまで exit 2 を続ける（Q6）
- `O_NOFOLLOW` が無い環境（Windows）では、開くときの symlink の拒否が lstat だけになる（Windows は対象外）
- 時刻は `startedAt` をそのまま信じる（集計は表示のためだけで、判定に使わない）
- **ディレクトリの差し替えは、検出であって防止ではない**（脅威モデル）
- **読んでいる間に、同じ大きさのまま中身を書き換えた場合**は検出しない（多くは `not-json`・`bad-shape` になる）
- 設定は、256 を超える check と、256 バイトを超える名前を許す。そのような run の履歴は `bad-shape` になる（Q11。`docs/CONFIG_SPEC.md` の §4c）
- 出力の上限を超える集計は出せない（`--from` を分ける）
- 上限を超えて書かないときも、出力の文字列は一度メモリに作られる（N）

## 影響
- 新しいモジュール（A）、`src/cli-program.ts` にコマンド、`src/output.ts` に口 1 つ（ADR-0016 の注記）、各パーサの数のキーの一覧の export
- docs: ARCHITECTURE（§4 の表・§5 のモジュール・§6.3）、README、`docs/CONFIG_SPEC.md`（§4c と §6 の `history` の行）、ADR-0016・0029 の注記、ROADMAP
- 依存・組み込みのモジュールの一覧・書き込みの出口・`tests/structure/`・verify の振る舞いは変えない
- v0.11.2: `src/output.ts` に口 `linesWithin` と書き手 `write`、`jsonWithin` が改行を数える（ADR-0016 の注記）。上限の中の出力のバイトは v0.11.1 と同じ（CLI の標準出力と `write` が受け取るバイトを比べるテスト）。依存・組み込みのモジュールの一覧・`tests/structure/` は変えない
- 設計の独立レビューの指摘: M4-D-R1-001・002・003 と M4-D-R2-003 を `resolved`、M4-D-R2-001・002 は v0.11.0 の部分を直して `open` のまま（HTML の部分は v0.12.0）、M4-D-R1-005 は注記を足した commit の SHA を後で書く（`docs/reviews/m4-design/findings-r1.json`・`findings-r2.json` の `note`）
