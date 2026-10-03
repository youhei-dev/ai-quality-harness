# バックログ 9・10 の独立レビュー 2 回目への対応記録（response-r2）— v0.5.26

- 対象レビュー: `docs/reviews/backlog-9-10/independent-review-r2.md`（受領ファイル名 `independent-review-backlog-9-10-r2-for-claude.md`、2026-10-03 受領、21,856 バイト、SHA-256 `564b26b45f7466f489d464e5031cd526b37029c9777c3363372c73870a3faed0`、LF 447 / CR 0 / TAB 0 / U+FFFD なし / 禁止文字 0。
  対象 v0.5.25 = commit 3bc96dc / tag object abeb7b4、範囲 `v0.5.24..v0.5.25`）。**原文は編集していない**（受領ファイルと `cmp` で同一。注記を足さないので、この SHA-256 がファイルのものと一致する。Security Scan に一致する行は無い）
- 対応日: 2026-10-03
- 結果（レビュアー）: 前回の **R1-002・R1-003・R1-004 は解消**、**R1-001 は部分的に解消**（残りは `createWriteStream(...).write()`・`.end()`）。新しい指摘は **High 1（R2-001）/ Medium 0 / Low 1（R2-002）**。
  どちらも「不注意で書ける形」で、**`src/` に実在する漏れは 0**（生の禁止文字が残る現行の書き込み漏れは無い）。レビュアーは対象コード・fixture・テストを実行していない（静的な読解のみ）
- **これが上限の最後のレビューで、3 回目は行わない**（ROADMAP のレビューの方針。レビュアーも「3 回目は不要。最終修正として入れ、自己 verify と回帰テストで閉じる」としている）。**v0.5.26 の修正は、独立した再レビューを受けていない**（自己 verify と回帰テストで確認）

## 人間の判断（この作業の仕様）

1. **R2-001・R1-001（stream）は「表に出す」**: 一覧テスト（`tests/file-write-sites.test.ts`）の表で見えるようにする。`tests/structure/` は変えない。型を許可の根拠にする新しい系統は作らない
   （レビュアーが選択肢にした「`src/` で `createWriteStream` を禁止する構造規則」は採らない）
2. **R2-002 は「現在の状態で書く」**: 「v0.5.25 現在は `src/` 0、回帰テストに 1 call site」に揃える
3. 作業は 3 commit（テスト → docs → リリース）。`src/` は変えない。push・タグは次の承認

## 指摘の判定（実測 M1〜M4 は下の表）

| ID | レビュアーの主張 | 実測 | 判断 | 直した commit |
|---|---|---|---|---|
| R2-001（High） | `truncate`・`truncateSync`・`ftruncate`・`ftruncateSync` を `NOT_CONTENT` で一覧の外に置いているが、延長すると NUL（U+0000。禁止集合に入る）が入る | **確認できた**（M1）。4 形とも拡張部分がすべて 0x00 | 4 つを `FS_WRITERS` に足し（内容の引数なし = `null`）、`NOT_CONTENT` から外した。`src/` に call が出たら表との差分として見える | C1 `394f09a` ＋ C2 |
| R1-001 の残り（stream） | `createWriteStream(...).write()`・`.end()` は不注意で書ける形のまま | **確認できた**（M2）。`createWriteStream` の call は site として見えて表との差分になる。`.write()`・`.end()` は出力ガードの違反にならず、渡す内容は検査されない | 人間の判断（表に出す）。call が差分になることをテストで固定し、「渡す内容は検査しない。出たら人間が表に 1 行足して判断する」を先頭コメントと ADR-0020 に書いた。**構造規則は足していない**（下の「直さなかったもの」） | C1 `394f09a` ＋ C2 |
| R2-002（Low） | docs が「`options.env` を渡す呼び出しは `src/`・`tests/` に 0 か所」と現在形で書くが、v0.5.25 の回帰テストに 1 call site がある | **確認できた**（M3）。docs の記述は 6 行。`src/` は 0、`tests/` は 18 call 中 1（回帰テスト） | 「v0.5.25 現在は `src/` 0、回帰テストに 1 call site」に揃えた。M4 の表の行は本文を書き換えず、訂正の 1 行を足した | C2 |
| 先頭コメントの文言（R2-001 に含める扱い） | 「any fs function that is not listed (the reason of each is in NOT_CONTENT)」は強すぎる | **確認できた**（M4）。fs の関数名 94 種のうち、`NOT_CONTENT` に理由を書いたのは 20、どちらの表にも無いものが 61 | `NOT_CONTENT` の実際の範囲（この作業で分類した関数だけ）に合う文言に直した | C1 `394f09a` |

- **レビュアーの主張と実測の食い違い**: 大きな食い違いは無い。補足が 2 つ。(1) R2-001 は、レビュアー自身が「実行していない」と書いた NUL の生成を、実測で確かめた（M1）。(2) R2-002 の「`tests/` に 1 call site」は、型検査器で `executeCommand` の呼び出し 19 件（`src/` 1、`tests/` 18）を数えて確かめた。`src/` の 1 件（`run-checks.ts`）は `env` を渡さない
  （引数の型に `env` があるだけ）
- **レビュアーの提案で、今回は取り入れなかったもの**: (a) `src/` で `createWriteStream` を禁止する構造規則（人間の判断で「表に出す」を選んだ）。(b) v0.5.23 の golden fixture（レビュアー自身が「defect としない。将来の backlog 候補」としている）

## 実測

作業用ファイルは `tmp/r2-fix/`（git 管理外）。探り用の入力は `src/` に置いていない（メモリ上で型検査器に渡した、または `tmp/` の中だけ）。

### M1: truncate 系の NUL

`tmp/r2-fix/` の中の一時ファイル（3 バイトのファイル）に対して、実際の関数を呼び、バイト列をプログラムで数えた（生の禁止文字はコマンド行にもファイルにも書いていない。一時ファイルは削除した）。

| 呼び出し | 結果の長さ | 0x00 の数（全体） | 拡張部分 | 拡張部分のうち 0x00 |
|---|---|---|---|---|
| `truncateSync(path, 4096)` | 4,096 | 4,093 | 4,093 バイト | **4,093** |
| `ftruncateSync(fd, 4096)` | 4,096 | 4,093 | 4,093 バイト | **4,093** |
| `truncate(path, 4096, cb)` | 4,096 | 4,093 | 4,093 バイト | **4,093** |
| `ftruncate(fd, 4096, cb)` | 4,096 | 4,093 | 4,093 バイト | **4,093** |
| 対照: `truncateSync(path, 1)`（縮小）／`(path, 3)`（同じ長さ）／`(path)`（0 へ） | 1／3／0 | 0 | 0 | 0 |

→ 延長すると、4 形とも追加された部分がすべて 0x00（U+0000）になる。縮小・同じ長さでは何も足されない。レビュアーの主張どおり。元の 3 バイトは保たれた。

### M2: stream の見え方

`createWriteStream(p).write(raw)`・`.end(raw)`、`const w = createWriteStream(f, { flags: "a" }); w.write(raw); w.end()` の fixture（型検査を通る）を、v0.5.25 のテストの観察関数のコピーと出力ガード・brand-guard に通した。

| 調べたこと | 結果 |
|---|---|
| 観察関数 | `createWriteStream` の call が 1 つずつ site として見える（内容は ""）。`.write()`・`.end()` は見えない |
| 表（KNOWN）との差分 | 実際の `src/` は差分なし（5 か所）。fixture を足すと、`createWriteStream` の call の数だけ「added」の行が出る（3 行）、removed は 0 |
| 出力ガード・brand-guard | どちらも違反 0（stream は塞がれていない。前回の実測と同じ） |
| 補足 | `const w = createWriteStream(…)` のように変数に束縛した call は、既存の `ownerName` が最寄りの変数宣言を拾うので、owner は外側の関数でなく変数名（`w`）になる。表の行の見分けには足りる |

### M3: docs の「0 か所」

| 場所 | 行 | 記述 |
|---|---|---|
| `docs/adr/0020-file-output-notation-and-check-env.md`（決定 8） | 46 | 「`options.env` を渡す呼び出しは `src/`・`tests/` に 0 か所」 |
| `CHANGELOG.md`（v0.5.25） | 16 | 同上（「0 か所で、変更を入れても既存の 1,355 件の期待値は変わらなかった」） |
| `docs/ROADMAP.md`（v0.5.25） | 397 | 同上 |
| `docs/reviews/backlog-9-10/response-r1.md` | 25（判定の表）・28（食い違いの補足）・85（M4 の表） | 「`src/`・`tests/` ともに 0」「既存の呼び出しが 0 件」「`src/` 0、`tests/` 0」 |

実際の call site 数（型検査器で `executeCommand` の宣言に解決した呼び出し）:

| 場所 | `executeCommand` の呼び出し | `env` を渡すもの |
|---|---|---|
| `src/` | 1（`src/runner/run-checks.ts:53`） | **0**（引数は `command`・`cwd`・`timeoutMs`・必要なら `signal`。引数の型に `env` があるだけ） |
| `tests/` | 18 | **1**（`tests/regression-backlog10-r1-004-options-env.test.ts:26`。v0.5.25 で足した回帰テスト） |

→ response-r1 の M4 は**修正前の測定**として正しい（そのとき `tests/` の既存の呼び出しは 0 件）が、現在形のように読める書き方が docs に複製された。

### M4: 一覧テストの現状（v0.5.25）

- `FS_WRITERS`: 13 個。`writeFileSync`・`appendFileSync`・`writeFile`・`appendFile`・`writeSync`・`write`・`writev`・`writevSync`（内容の引数は 1）、`createWriteStream`・`copyFileSync`・`copyFile`・`cp`・`cpSync`（`null`）
- `NOT_CONTENT`: 20 個の名前、5 グループ（`rename`・`link`・`symlink`／**`truncate` 系**／`mkdir`・`mkdtemp`／`rm`・`unlink`／`open`）
- `KNOWN`: 5 行（init 3、review-packet 1、`writeAtomic` 1）。種別は `gate` 2・`no-gate` 3・`not-content` 0
- @types/node の fs と fs/promises が宣言する関数名は 94 種。`FS_WRITERS` 13、`NOT_CONTENT` 20、**どちらにも無いもの 61**（読み取り・stat・`chmod`・`chown`・`utimes`・`fsync`・`opendir` など。名前と Node の仕様からの判断で、これらが内容を書く・禁止文字を作るものは見当たらない。実測はしていない）
- 先頭コメントの「any fs function that is not listed (the reason of each is in NOT_CONTENT)」は、`NOT_CONTENT` の実際の範囲（この作業で分類した 20 個の名前）と**合わない**（61 は理由の無い未分類）

## 直したもの（commit ごと）

- **C1 `394f09a`**（`tests/file-write-sites.test.ts` のみ。`src/`・`tests/structure/` は変えていない）: `truncate`・`truncateSync`・`ftruncate`・`ftruncateSync` を `FS_WRITERS` に足して `NOT_CONTENT` から外した（理由をコメントに）。先頭コメントを、stream の扱い（call は差分、渡す内容は検査しない、出たら表に足して判断）と
  `NOT_CONTENT` の範囲に合う文言に直した。新しいテスト 10 件（truncate 系 4 形と `fs/promises` の `truncate` の site、新しい `createWriteStream`・truncate 系の call が差分になること）。既存の fixture は変えていない。テスト 1,387 → 1,397 件
- **C2（この commit）**: レビュー原文（`cmp` 同一）と本書、response-r1 の M4 への訂正 1 行、ADR-0020（日付、決定 7・8、既知の限界、影響）、CHANGELOG・ROADMAP の「0 か所」の表現、CHANGELOG の v0.5.25 の見出しの SHA
- **C3**: `package.json` の version、CHANGELOG の v0.5.26、README

## 修正前の失敗

- C1: 新テストのうち truncate の定義を v0.5.25 に戻した版（`FS_WRITERS` から 4 つを外す）は、**40 件中 9 件 FAIL**（truncate 系の site が見えない 5、差分にならない 4）。`src/` に truncate 系を呼ぶ新しいファイルを足すと、**v0.5.25 のテストは 4 形とも緑のまま（見逃す）**、新テストは 1 件ずつ FAIL。
  `createWriteStream(f).write(raw)` を足した場合は、v0.5.25 のテストも新テストも 1 件ずつ FAIL（stream の call は元から site だった）
- 既存テストの期待値の変更は、C1 で拡張した `file-write-sites` を除いて 0 件

## 直さなかったもの・既知の限界

- **stream の `.write()`・`.end()` に渡す内容は検査しない**（R1-001 の残り）。レビュアーの分類は「不注意で書ける形」（(i) でも (ii) でもない）。人間の判断で、構造ガードは足さず、一覧テストの表で call を見えるようにした。`src/` に 0 か所。ADR-0020 の既知の限界に、この分類と判断を書いた。
  レビュアーが示した「`src/` で `createWriteStream` を禁止する」規則は、現在の `src/` を壊さないが、採っていない
- 表に無い 61 の fs の関数は、一覧テストの目に入らない（`NOT_CONTENT` は、この作業で分類したものだけ）
- v0.5.23 の golden fixture によるバイト単位の固定（レビュアーも defect としていない将来の backlog 候補）
- **この最終修正は、独立した再レビューを受けていない**。r2 が上限で、3 回目は行わない
