# 見張る項目の手順書

最終更新: 2026-10-19（v0.12.1。初版。M4 の運用テンプレート）

aiqh を品質ゲートに使っているリポジトリ（aiqh 本体と適用先）で、何を見張り、何を見たら何をするか。数の読み方の根拠は ADR-0034（`aiqh history`）・ADR-0035（`--html`）・ADR-0033（`configSha256`）。

- 見張るのは、**機械的に再現できる結果**（必須の check の結論、job の時間、履歴の数）だけ。AI の「問題ない」は見張りの材料にしない
- 判定を緩める変更（必須の check を外す、`required: false` にする、上限を黙って上げる）で見張りの線を消さない。変えるときは `docs/ops/policy-change.md` の手順に従う

## 1. どこで見るか

| 見るもの | どこで |
|---|---|
| 必須の check の結論 | pull request の checks（`gh pr checks <番号>`）と、main への push の run（`gh run list --branch main`・`gh run view <run-id>`） |
| job と check の時間 | run の job の時間（`gh run view <run-id>`）と、ログの `[n/m] <check> … PASS <時間>` の行 |
| 履歴の数（FAIL の率・時間の割合・設定のハッシュの区切り） | `aiqh history --from <dir> [--from <dir> …]`（端末の表）、`--json`、`--html`（`artifacts/history/dashboard.html`） |

- `aiqh history` が読むのは、手元で `aiqh verify` を走らせたときの `artifacts/verification/history/*.json` だけ。**CI の run のレポートは残らない**（再利用ワークフローは artifact を上げない。`docs/ops/reusable-workflow.md` の §2）。CI の結果は、run の結論とログで見る
- `aiqh history` は読むだけで、履歴を直さない・消さない（`--html` の HTML のほかは何も書かない）

## 2. 見張る項目

### 2.1 必須の check の結果

- pull request: 必須の check（aiqh 本体は `verify (ubuntu)` と `reusable (self) / aiqh verify`、適用先は `<呼び出す側の job の名前> / aiqh verify`）がすべて success になってから merge する。aiqh 本体では、走っている間の `mergeStateStatus` は BLOCKED、success の後は CLEAN だった（ROADMAP の各版の「PR の観察」。手順は `docs/ops/ci-and-branch-protection.md` の §8）
- main への push の run: merge の後の run も success かを確かめる（aiqh 本体では、success でなければタグを付けない）
- `VERIFY FAILED`（終了コード 1）は、必須の check が PASS でなかった。check のコマンドが起動できない・見つからない（シェルの 127）・時間切れも、その check の FAIL で、`VERIFY FAILED` になる
- `VERIFY ERROR` は、verify そのものが最後まで進めなかった: 設定を読めない（`VERIFY ERROR (configuration error)`、終了コード 2）、レポートを書けない（`(report write error)`、2）、シグナルで止められた（`(interrupted by …)`、130・143）

### 2.2 job の時間と、上限に対する割合

- check の上限は、設定の `timeoutSec`（無ければ `defaults.timeoutSec`、それも無ければ 600 秒。`docs/CONFIG_SPEC.md`）。check の時間 ÷ 上限を見る
- 線（ROADMAP の項目 42 の線と同じ）: **72% に届いたら対処の案を出す。80% に届いたら対処する**。対処の中身は、届いたときに計測して決める（テストの作業量を減らす、check を分ける、上限を上げる〈設定の変更なので `docs/ops/policy-change.md`〉）
- run ごとにばらつくので、1 回の値でなく、続けての値を見る。aiqh 本体では、release の記録の CI の欄に、`unit`・`unit-minpath` の秒数と割合を書き続けている
- `aiqh history` の check の表の `max share of timeout`（`--json` の `maxShareOfTimeout`）は、run ごとの `durationMs ÷（その run の timeoutSec × 1000）` の最大。上限が途中で変わっても、どの run にも無い割合にならない。時間切れの run では 1 を超えうる
- `timed out`（`timedOut`）が 1 以上なら、その check は上限で止められた。上の線の前に、すぐ見る

### 2.3 FAIL の率と、失敗しやすい check

- `aiqh history` の check の表の `fail rate`（`failRate`）: FAIL ÷（PASS + FAIL）。SKIPPED は数えない。分母が 0 なら `-`（`null`）
- 失敗しやすい check（表の最後、HTML の「Failure-prone checks」、`--json` の `failureProne`）: すべてのプロジェクトで、PASS + FAIL が 3 以上の check を、FAIL の率の高い順に 10 件
- 手元の履歴には、作業の途中の FAIL（直す前に走らせたもの）も入る。率が高いことだけで不具合とはしない。同じ commit で PASS と FAIL が混ざる check は、不安定なテスト（flaky）を疑う
- 不安定なテストを、必須から外したり再実行で通したりして黙らせない。原因を直すか、記録して計画に入れる

### 2.4 `configSha256` の変わり目（設定がいつ変わったか）

- `aiqh history` のプロジェクトの `config <先頭 12 桁>` の行（HTML の「Config hashes」、`--json` の `configs`）: 同じハッシュが続いた区間ごとに、最初と最後の run と、run の数
- 端末の表は日付だけ（`YYYY-MM-DD .. YYYY-MM-DD`）、HTML と `--json` は時刻まで出す
- 区間の変わり目が、設定を変えた pull request（`docs/ops/policy-change.md`）の merge と合うかを確かめる。合わない変わり目は、記録の無い設定の変更として調べる
- `unknown` の区間は、v0.10.0 より前のレポート（ハッシュの欄が無い）
- ハッシュは**設定ファイルのバイト列**だけを表す。scripts・テストのファイル・道具の設定・依存の版の変更は表れない（ADR-0033 の「守れないこと」）

### 2.5 読めない履歴（`HISTORY INCOMPLETE`）

- 終了コード 2 と `HISTORY INCOMPLETE — unread <u> of <f> history files (listed above)`。集計は、読めたものだけで出る。**数は、読めなかった run を含まない**
- 一覧の行は `#<番号>/<ファイル名>: <理由>`（`unreadable` のときは後ろに ` (<code>)`。例: `unreadable (EACCES)`）。理由は固定の語（`not-regular`・`unreadable`・`too-large`・`empty`・`not-utf8`・`not-json`・`bad-shape` など。ADR-0034 の C の 7）
  - `empty`（0 バイト）は、中断された verify が残しうる
  - `unreadable` の `size-changed` は、読んでいる間に aiqh の外の何かが書き換えた
- 一覧のファイルを確かめ、要らない・壊れたものは、手で別の場所へ移す（消すなら先にコピーを取る）。aiqh は直さない
- `HISTORY ERROR (too-many-files)`・`(too-many-bytes)` は、上限（合わせて 10,000 ファイル・256 MiB）を超えた。古い履歴を別の場所へ移すか、`--from` を分ける

## 3. 何を見たら、何をするか

| 見たもの | すること |
|---|---|
| pull request の必須の check が failure | merge しない。ログ（`gh run view <run-id> --log-failed`）で落ちた check を見て、対象の側で直す。判定を緩めない |
| main の run が failure（merge の後） | タグ・リリースを止める。原因を直す pull request を作る。aiqh の版を上げた直後で aiqh が原因なら `docs/ops/rollback.md` |
| `VERIFY ERROR`（終了コード 2・130・143） | 括弧の中の理由を見る。`configuration error` は設定の誤り（aiqh の版を上げた直後なら、版の間の設定の仕様の違いを CHANGELOG で見る）、`report write error` は `artifacts/` に書けない、`interrupted by …` は verify がシグナルで止められた（CI では job の取り消し。job の上限の時間による取り消しを含む） |
| check の時間が上限の 72% 以上 | 計測して、対処の案（テストを減らす・分ける・上限を上げる）を出す |
| check の時間が上限の 80% 以上、または `timed out` が 1 以上 | 対処する。上限を上げるなら設定の変更の手順（`docs/ops/policy-change.md`） |
| 失敗しやすい check に、main で FAIL が続く check | 不安定か本当の失敗かを調べる。必須から外して黙らせない |
| `config` の区間の変わり目が、設定の pull request と合わない | 記録の無い設定の変更として調べる（誰が・いつ・何を）。必要なら設定を戻す pull request |
| `HISTORY INCOMPLETE`（終了コード 2） | 一覧のファイルを確かめる。数は読めた分だけと読む |
| `HISTORY ERROR (too-many-files)`・`(too-many-bytes)` | 古い履歴を別の場所へ移すか、`--from` を分ける |
| sources の行（`#<n>: … leftover temporary <数>`）の数が 1 以上 | 中断された verify の一時ファイルが残っている。verify が走っていないときに、手で片付ける |

## 4. 確かめていないこと

- 見張りを自動で回す仕組み（定期の実行・通知）は無い。人が見る
- 適用先の CI の分数（請求）は、GitHub の請求の画面で見る（`timing` の API の `billable` が 0 を返した。ROADMAP の項目 46）
