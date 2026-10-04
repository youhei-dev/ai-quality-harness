# ADR-0022: 読めないものを「無い」としない: パスの包含と書込の前提

- 状態: 採用（ADR-0010・ADR-0015 の「ENOENT だけが無い」を、設定のパスの包含判定と init の書込の前提へ広げる。ADR-0014・0015・0020・0021 は変えない）
- 日付: 2026-10-04（M2-2、v0.5.29。ROADMAP のバックログ 8 の A グループ: O2・O7・O8）

## 文脈
- 原則は既にある: security-scan の lstat（ADR-0010、M1-R2-002）、review-packet の `latest.json` と既定の設定ファイル（ADR-0015、v0.5.1）。**ENOENT だけが「無い」**で、それ以外は読めない・見えないものなので fail closed にする。
  v0.5.1 の洗い出し（`docs/reviews/m2-2/response-r1.md`）が、同じ形の残りを 11 項目（O・P）に分けてバックログ 8 とした。A グループはそのうち書き込み・パスの判定に関わる 3 つ（O2・O7・O8）
- 実測（v0.5.28。実際の CLI。ROADMAP の記述は「コード読解」だったものを再現した）:
  - **O2**: `src/config/load.ts` の `entryExists()` が lstat の失敗をすべて「無い」とし、`realpathNearest()` が親へ上がる。権限で辿れないディレクトリ（EACCES）や通常ファイル（ENOTDIR）の下の `cwd`・`output.dir` が、読込を通る。
    辿れないディレクトリの中に根の外を指す symlink があっても「プロジェクトの中」と判定する。結果は、`cwd` は check の FAIL（exit 1、"working directory does not exist"）、`output.dir` は check を全部走らせた後の report write error（exit 2）。
    外への書き込みは 0 件だった（辿れないので、後の mkdir と cwd の起動が失敗する）
  - **O7・O8**: `existsSync()` は dangling symlink（リンク先が未作成）で false になり、init は「作る」と判断する。`writeFileSync()` は symlink を辿ってリンク先を作る。`init --write` と `--write-gitignore` が、プロジェクトの外にもファイルを作り、
    `wrote …` と表示して exit 0 だった（`--force` でも、リンク先が根の中でも同じ）
  - 対照（変わらないこと）: 未作成の `output.dir`、存在しない `cwd`（CONFIG_SPEC §4 の 7: 読込は通り、その check が FAIL）、根の中を指す symlink、dangling symlink 越しの `output.dir`（v0.5.28 でも拒否）、symlink の輪での書込（ELOOP で失敗）

## 決定
1. **規則**: ENOENT だけが「無い」。lstat・stat の他の失敗（EACCES・ENOTDIR・ELOOP など）は「調べられない」で、「無い」と見なさない。dangling symlink は lstat では「ある」（リンク自体がある）。リンク先が無いことは「無い」ではない
2. **パスの包含判定**（`resolveInsideRoot` → `realpathNearest` → `entryExists`。`checks[].cwd` と `output.dir`）: ENOENT だけ、存在する最も近い祖先へ上がる。他の失敗は `ConfigError`
   （`<label> cannot be resolved: <path> — <entry> cannot be examined (<code>). Fix the permissions or change the setting.`）。設定を読む時点のエラーなので、check は 1 つも走らず、レポートも書かない。終了コードは 2
3. **init の書込の前提**（`src/commands/init.ts` の `assertNotDanglingLink`）: 書込先が symlink で、リンク先が ENOENT（dangling）のとき、書かずに拒否する。lstat でリンクかを見て、リンクなら stat で先を見る。
   設定の書込（`aiqh init: failed to write <file>: …`）と `.gitignore` の追記（`aiqh init: failed to update <file>: …`）の、既存の `try` の中で、書込の直前に呼ぶ。メッセージは `it is a symbolic link whose target does not exist; remove the link or create the target first`。
   lstat・stat の ENOENT 以外の失敗は、そのまま投げる（書込自身のエラーと同じ形で報告される）。**`--force` でも拒否する**（上書きする既存の内容が無い）。終了コードは 2。
   書く内容・書く関数（`writeFileSync`）・外側の関数（`runInit`）は変えない（書き込み箇所の一覧テストの表も変わらない。ADR-0020 決定 7）。設定と `.gitignore` の書込は独立のまま（一方が拒否されても他方は取り消されない。CONFIG_SPEC §5.3c）
4. **ENOTDIR も拒否する**（O2）。通常ファイルの下には何も存在しえないので、判定そのものは健全で、「無い」と扱う案も成り立つ（推論）。それでも拒否にする理由: (a) 「ENOENT だけが無い」を、文書（ADR-0010・0015、ARCHITECTURE、CONFIG_SPEC）のとおり文字どおりに守る。例外を 1 つ作ると、
   B・C・D の各箇所で ENOTDIR の扱いを問い直すことになる。(b) 通常ファイルの下を `cwd`・`output.dir` に指定する設定の誤りを、実行時の check の FAIL（cwd は exit 1）や遅い report write error ではなく、読込で exit 2 にして早く見せる。
   **`targetIdentity`**（`src/commands/review-packet.ts`。review-packet の書込先の同一性を、存在する祖先まで遡って比べる）は ENOENT と ENOTDIR を「無い」として親へ上がるが、そのまま残す: 目的が違い（書込先の早い段階の拒否。最終判定は dev + ino）、
   ENOTDIR は書込の本体が失敗するので判定を誤らせない。この ADR の規則は、設定のパスの包含判定と init の書込の前提に適用する
5. **範囲外**（直さない）: 有効な symlink への `--force` 上書き・追記（プロジェクトの外の既存ファイルにも書く）は、ROADMAP のバックログ 23。`proposeGitignore` の提案文（O5）と、O3・O4・O9・O6・P3・P11・P4 は、B・C・D の各版で扱う
6. **出力の境界は変えない**: 新しいメッセージは既存の出口を通る（init は `output.error`、verify は `maskSecrets` の後に出口。ADR-0016・0017）。パスに禁止文字や秘密の形があっても、表記とマスクになる（実 CLI で確認）

## 代替案
- ENOTDIR を「無い」とする（O2 の 1 行差）: 決定 4 の理由で採らない。実測では、通常ファイルの下の `output.dir` は v0.5.28 と同じ挙動のまま（遅い exit 2）、`cwd` も同じ（check の FAIL、exit 1）になる
- dangling 以外の symlink も拒否する（すべての symlink 経由の書込、または根の外を指す symlink のみ）: `.gitignore` を共有ファイルへの symlink にしているなどの既存の使い方を壊す。O7・O8 の原因は「リンクなのに存在確認が false になる」ことなので、dangling に限る最小の変更で直る。有効な symlink は別の項目（バックログ 23）にした
- `writeFileSync()` の flag `"wx"`（排他的な作成）: dangling でも EEXIST で失敗し、lstat と書込の間の競合も無いが、`--force` の経路（上書き）には効かず、理由が open のエラーになる。先に lstat で理由を言えるほうを採る
- 共通の補助関数にまとめる（`load.ts` の `entryExists`、`review-packet.ts` の `lstatOrNull`、init の補助関数）: 判定の置き方（無い／投げる／拒否）が箇所ごとに違う。B・C・D で箇所が揃った後に検討する
- ADR を作らず CONFIG_SPEC・ARCHITECTURE・ADR-0015 に追記する（v0.5.1 の R1-007 と同じ流儀）: 利用者に見える契約（`cwd` の exit 1→2、init の拒否）を変え、原則が複数の ADR・文書に散らばっているので、B・C・D が参照する 1 か所を作った

## 既知の限界
- **有効な symlink への `--force` 上書き・追記は、プロジェクトの外の既存ファイルに書く**（実測: `aiqh.config.jsonc` が外の既存ファイルへの symlink なら `--force` で上書き、`.gitignore` が外の既存ファイルへの symlink なら追記）。直していない（ROADMAP のバックログ 23）
- init の書込は、元から非原子的な `writeFileSync()` で、lstat と書込の間の競合（TOCTOU）は防がない（対話の道具・ローカルの実行が前提）
- 読込の後に権限が変わった場合は、実行時の失敗（check の FAIL、report write error）として残る
- Linux・Windows・root での実行は未確認（実測は macOS の一般ユーザーだけ。権限のテストは root では `skipIf`）。エラーコードの名前は POSIX 共通だが、Linux での挙動は推測
- dry-run の提案文（`proposeGitignore` の `existsSync(".gitignore")`）は、dangling でも「no .gitignore」と書き、書込時に初めて dangling と拒否する（O5。C グループで揃える）
- `package.json` が dangling symlink のとき、init は Node プロジェクトと見なさず、`--write-scripts` は exit 0 で何も書かない（実測。アダプタの検出。O6、D グループ）

## 影響
- **利用者に見える変更**:
  - verify: 権限で辿れないディレクトリ、または通常ファイルの下を通る `checks[].cwd`・`output.dir` は、読込で exit 2（`VERIFY ERROR (configuration error)`。check は走らず、レポートも書かない）。`cwd` のケースは **exit 1 → 2**、`output.dir` は「check を全部走らせた後の report write error（exit 2）」から「早い configuration error（exit 2）」になる。
    symlink の輪（ELOOP）と、根の外の辿れないディレクトリへの symlink のメッセージも変わる（終了コードは 2 のまま）。通常の構成（未作成の `output.dir`、根の中の symlink、存在しない `cwd` の check FAIL）は変わらない
  - init: dangling symlink の設定ファイル・`.gitignore` への `--write`・`--write-gitignore` は、何も作らず exit 2（`--force` でも）。以前は先にファイルを作って exit 0
  - 今回の拒否の終了コードはすべて **2**（ADR-0021 の使い方エラーの 2 とは別の、設定エラー・書込失敗の 2）
  - `== 1` だけを失敗とみなす CI は、`cwd` のケースが失敗として扱われなくなる（`!= 0` で見る。ADR-0021 と同じ注意）
- **B・C・D が参照する規則**: 「ENOENT だけが無い」を、`existsSync()` や catch の握りつぶしの代わりに使う（P3・P11・P4・O3・O4・O5・O9・O6 の各箇所は、この規則に照らして直す）。O4（`checkDirectory` が失敗を全部 "does not exist" と書く）は、EACCES・ENOTDIR・ELOOP の `cwd` が読込で拒否されるようになったため、
  読込の後に権限が変わった場合と、存在しない `cwd` だけが残る
- コード: `src/` は 2 ファイル +39／−6（`src/config/load.ts` +14／−5、`src/commands/init.ts` +25／−1）。新しいテスト 25 件（`tests/regression-backlog8a-o2-untraversable-path.test.ts` 12 件、`tests/regression-backlog8a-o7-o8-init-dangling-link.test.ts` 13 件）で、v0.5.28 の `src/` に当てると 15 件が FAIL
  （残りの 10 件は対照）。既存のテストの期待値の変更は 0 件。テスト 1,449 → 1,474 件（117 → 119 ファイル）。`tests/structure/`・禁止文字の集合・依存関係・`package-lock.json` は変えていない
- 独立レビューは付けない（人間の判断。判定を緩める変更ではなく、強める側だけ）
