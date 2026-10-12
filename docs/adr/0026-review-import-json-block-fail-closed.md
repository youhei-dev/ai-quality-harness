# ADR-0026: review-import は、レビューの中の決まった JSON のブロックを正本にし、本文と食い違えば何も書かない

- 状態: 採用（M2-2 の本体〈ROADMAP の項目 15、rest2 の計画の波 3〉の最初の部品。ARCHITECTURE の review-import の出力の置き場所〈`artifacts/ai-review/findings-<id>.json`〉を置き換える。ADR-0007〈artifacts は git 管理外〉は変えない）
- 日付: 2026-10-13（v0.6.0）

## 文脈
- `aiqh review-import` は、独立レビューの原文を読み込み、指摘を構造化したデータ（findings）にする。**一番の危険は読み落とし**で、指摘を 1 件でも取りこぼすと「レビューは終わった」と誤って判断する（fail open）
- 波 3 の SP1（2026-10-13）で、`docs/reviews/` の原文 47 件を調べた。依頼文が「指摘の形式」を指定していたのは 11 回だけで、指定した回でも、要約の置き場所・書き方が揺れていた（厳しい読み取りで読めたのは 47 件中 6 件、指定した 11 回でも 6 回）。fail open になりうる形として、要約が一部の重要度に触れない（6 件）、要約が無い（6 件）、同じ ID の見出しが参照としてもう一度出る（1 件）、指摘ではない位置のその回の ID（例: 「`B35-R1-001` 以降の指摘IDを発行する事項はない」）、前の回の ID を含む見出し、が見つかった
- 人間の決定（2026-10-13）: SP1 の 12 項目をすべて推奨どおりにする。直した指摘の状態の名前は `resolved`。v1 の独立レビューは、新しい依頼文のひな形で行い、返ってきた結果を v1 で取り込んでみる

## 決定
1. **D1 入力の正本**: レビューの md の中の、言語の名前を `aiqh-findings` にした**コードブロック 1 つ**の JSON（下のスキーマ）。本文（ブロックの外のすべての行）の `### <ID>` の見出しと、`## 全体の結論` の件数の行で突き合わせる。ファイルは 1 つのまま（これまでの「ダウンロードできる md」の作法と同じ）
2. **D2 読めない・食い違うとき**: **exit 2 で、何も書かない**。警告して続けることはしない。見つかった食い違いはすべて並べる（1 つずつ直させない）
3. **D3 逃げ道なし**: 「指摘ではない ID」を認めるオプションは作らない。止まったらレビュアーに書き直しを頼む
4. **D4 状態**: `open`・`resolved`・`deferred`・`accepted`・`invalid` の 5 つ。「未完了」= `open` が 1 つでもある
5. **D5 状態の正本**: findings の JSON。実装者が人間の承認の下で直す。検査（`--check`）は v2
6. **D6 置き場所**: **`docs/reviews/<label>/findings-r<N>.json`（git 管理）**。原文・対応記録の隣。ARCHITECTURE の `artifacts/ai-review/findings-<id>.json` から変える（状態は回をまたぐ記録で、git 管理外では失われる）
7. **D7 終了コード**: **0 / 2**。`open` の件数は端末に表示するだけで、終了コードに反映しない（非目標「レビューAI の判断を自動で合否に反映すること」に当たらないように）。1 は使わない
8. **D8 前の回**: 回が 2 以上で、`findings-r<N-1>.json` が無い（**ENOENT だけ**）ときは exit 2。`--allow-missing-previous` でだけ許す。ENOENT 以外の理由で読めない（EACCES・ディレクトリ・不正な JSON・スキーマ違反・label / 回 / 接頭辞の違い）ときは、オプションがあっても exit 2（ADR-0022）
9. **D9 禁止文字**: 止めずに取り込み、ファイルでは表記にする（ADR-0020。JSON は `\uXXXX`）。端末には件数と行番号だけ
10. **D10** 過去の 47 件は取り込まない
11. **D11 v1 の範囲**: 取り込みだけ。状態の検査・前の回の状態の引き継ぎ・ループ未完了の表示は v2
12. **D12 依頼文のひな形**: `docs/ops/review-request-template.md`。JSON の欄を足す（v1 自身の独立レビューが最初）

### 使い方
`aiqh review-import <review.md> --label <label> --round <n> --id-prefix <prefix> [--allow-missing-previous] [--cwd <dir>]`
- `--label`: `docs/reviews/<label>/` の名前。英小文字・数字・`.`・`-`（先頭と末尾は英数字、64 文字まで、`..` は不可）。パスの区切りは通らない
- `--round`: 1〜999 の整数（0 や数でないものは使い方の誤り）
- `--id-prefix`: 英大文字・数字のまとまりを `-` でつないだもの（`B20`、`M2-2-RI`）。ID は `<prefix>-R<round>-<3 桁>`
- `--cwd`: `docs/reviews/` のあるリポジトリのディレクトリ（既定: カレント）。ほかのコマンドと同じ。`docs/reviews/` が無いディレクトリでは止める（サブディレクトリで走らせて別の場所に書くことを防ぐ）
- 出力のパスは `resolveInsideRoot` で、リポジトリの中に収まることを確かめる（symlink で外へ出るものは止める）

### 入力の JSON（schema version 1）
```
{ "schemaVersion": 1, "label": "<label>", "round": <n>,
  "summary": { "high": <n>, "medium": <n>, "low": <n> },
  "findings": [ { "id", "severity": "High|Medium|Low", "kind": "バグ|設計|テスト|文書", "target", "content", "evidence", "fix", "confidence": "確認済み|推測" } ],
  "previous": [ { "id", "assessment" } ] }   ← previous は任意
```
- 未知の欄は拒否する（どの深さでも）。8 項目はどれも空白だけの値を認めない
- `kind`・`confidence` は**日本語の値だけ**（英語の別名は認めない。依頼文の作法のとおりで、迷う形は拒否する）。**1 つだけ**（「バグ / 文書」のような 2 つは拒否。主なものを選び、補足は `evidence` に書く）。`confidence` に補足を付けた形（「確認済み（一部）」）も拒否
- 上限（細部の決定）: 入力のファイル **1 MiB**、`findings` と `previous` は各 **200 件**、`id` **64 文字**、`target` **2,000 文字**、`content`・`evidence`・`fix` 各 **20,000 文字**、`assessment` **4,000 文字**、`label` **64 文字**、回 **999**。保存した findings のファイルでは、マスクで文字列が伸びうるので、文字列の上限を入力の 2 倍にする

### 止める条件（すべて exit 2、何も書かない）
- **入力のファイル**: 無い・読めない・通常のファイルでない（symlink は先を見る）・1 MiB を超える・不正な UTF-8（行番号を出す）
- **ブロック**: `aiqh-findings` の開きのフェンス（行が **ちょうど** `` ```aiqh-findings ``）が 0 個・2 個以上。ほぼ同じ形のフェンス（`` ```aiqh-findings json ``・大文字・`~~~`・空白入り）。閉じのフェンス（行がちょうど `` ``` ``）が無い
- **JSON**: JSON として不正、スキーマ違反、`label`・`round` がオプションと違う、ID の形が `--id-prefix` と回に合わない、ID の重複、001 から連続でない、`summary` と重要度ごとの数が違う
- **本文**: `## 全体の結論` が 0 個・2 個以上。その節の中の `件数: High <n> / Medium <n> / Low <n>`（ちょうどこの形の 1 行）が 0 行・2 行以上、**節の外にある**、数が JSON と違う。`### <ID>`（ID だけの見出し）の集合が JSON の ID の集合と違う（同じ見出しが 2 つも）。**ID だけの見出しなのに `### <ID>` でないもの**（`## <ID>`、空白 2 つ、別の回の ID だけの見出し〈`### B20-R1-003` を R2 で〉）。本文のどこかにある**その回の ID の形**（`<prefix>-R<round>-<数字>`。全角・小文字・`‐` などのハイフンの形は寄せて探す: NFKC と、ハイフンに似た文字を `-` に、英字を大文字に）が JSON に無い
- **前の回と既存のファイル**: 上の D8。出力のファイルが既にあり、`source.sha256` が入力と違う（同じなら何も書かずに exit 0「既に取り込み済み」）。既存のファイルが読めない・findings のファイルでない
- **その他**: 使い方の誤り（ADR-0021）、`docs/reviews/` が無い、パスがリポジトリの外、書き込みの誤り
- 前の回の ID に文を付けた見出し（`### B20-R1-001 の判定`）は止めない（前の回の指摘の判定で、新しい指摘ではない）。JSON にある ID を本文の文の中で書くことも止めない
- 構造の行（フェンス・見出し・件数の行・節）は、行末の CR 1 つを除いて読む（CRLF で保存したレビューも同じに読む）

### 出力（`findings-r<N>.json`）
- 欄: `schemaVersion: 1`、`label`、`round`、`idPrefix`、`source`（受領のファイル名〈名前だけ〉・バイト数・SHA-256）、`summary`、`previous`（入力のまま。無ければ `[]`）、`importedAt`（ISO 8601）、`tool`（`{ name: "aiqh", version }`。verify のレポートと同じ形）、`findings`
- `findings` の各件: 入力の 8 項目（ID の順に並べる）、`status: "open"`、実装者の側の欄 `verdict`・`action`・`fixedIn`・`regressionTest`・`guard`・`destination`・`note` は `null`（形は v2 で決める）。M0_COMPLETION の review-import の表の列（ID / 重要度 / 判定 / 対応 / 根拠・修正内容 / 回帰テスト / ガード / 行き先）は、これで全部持てる
- 書き方: 文字列はすべて `copyJson(…, maskSecrets)` を通す。書き込みは verify のレポートと同じ `writeAtomic`（一時ファイル → rename。JSON は書き込みの直前に禁止文字を `\uXXXX` に）。UTF-8、末尾は LF。`docs/reviews/<label>/` が無ければ作り、書き込みに失敗したら消す
- **`writeAtomic` の変更**（v0.6.0）: 書き込みか rename に失敗したとき、一時ファイルを消してから誤りを投げる（以前は残った）。verify のレポートの書き込みにも同じに効く。書き込み箇所の表（`tests/file-write-sites.test.ts`）の行は変わらない（新しい fs の書き込みは足していない）

### 端末への出力
- 出口（`createOutput`）だけを通す。レビュアーの文章は出さない（未知の欄の名前・誤った値も出さない。スキーマの誤りは、この形の欄の名前と配列の番号だけ）
- 成功: `findings: docs/reviews/<label>/findings-r<N>.json`、`High <n> / Medium <n> / Low <n>; open <n>`、`REVIEW IMPORT: written`。禁止文字があれば件数と行番号。秘密の形を `scanString` で見つけたら、件数・分類・行番号（保存した文字列はマスク済み。取り込みは続ける）
- 誤り: `aiqh review-import: [<種類>] <説明>`（種類: `options`・`repository`・`path`・`input`・`existing`・`block`・`json`・`schema`・`label-round`・`id`・`summary`・`conclusion`・`count-line`・`heading`・`id-mention`・`previous`・`write`）を並べ、最後に `REVIEW IMPORT: not written (error)`

## 代替案
- **入力の正本 (a) いまの Markdown の形式を厳しく読む**: 依頼が変わらないが、SP1 では形を指定した回でも 5/11 が要約の置き場所・書き方の揺れで読めなかった。規則を足すほど読み方の抜けが増える
- **(c) Markdown と JSON の両方を受け付ける**: 過去のレビューも取り込めるが、読み方が 2 つになり、テストと抜けの面が倍になる
- **状態の正本 (i) `response-rN.md` の判定表**: 表の列が 22 通りで揃っていない。(iii) 状態を変える専用のコマンド・(iv) JSON から判定表を生成: 使ってから（v2 以降）
- **置き場所 `artifacts/ai-review/`**: git 管理外で、回をまたぐ状態が残らない
- 読めないときに警告して続ける: 読み落としがそのまま「終わった」になる
- 本文から JSON を組み立てる（JSON をレビュアーに書かせない）: (a) と同じ揺れの問題

## 既知の限界
- **ID を書かず、件数の行にも JSON にも入れずに、文章の中だけで書かれた指摘は見つけられない**。突き合わせは「JSON・見出し・件数の行・本文の ID が互いに合うか」で、レビュアーが書いたものを全部読み取れたかの証明ではない
- ID に似た字形のうち、NFKC とハイフンの寄せで同じにならないもの（キリル文字の `Р` など）は、その回の ID として見つけない
- 本文の ID の形の探し方は、接頭辞の前が英大文字・数字・`-` でないことを条件にする（`QB20-R1-001` は `B20` の ID ではない）
- D3 のとおり、指摘ではない文脈でその回の ID を書いたレビューは止まる（書き直しを頼む）
- v2 の範囲（`--check`、前の回の状態の引き継ぎ、ループ未完了の表示）は無い。`previous` は保存するだけで、前の回の状態は変えない
- 過去の 47 件は取り込まない（D10）
- 同じ出力先へ同時に取り込むことは考えていない（一時ファイルの名前はプロセスの番号で分ける）。「既に取り込み済み」の確かめと書き込みのあいだに別の手が書くことは信頼境界の外
- 秘密の形のマスクは ADR-0006 の範囲のまま（マスクのパターンに無い形は残る）

## 影響
- 新規: `src/commands/review-import.ts`、`src/review/import.ts`（読み取りと検査。ファイルを触らない）、`docs/ops/review-request-template.md`、テスト（`tests/review-import.test.ts`・`tests/cli-review-import.test.ts`、fixture は `tests/fixtures/review-import/`）
- 変更: `src/cli-program.ts`（コマンドの登録）、`src/report/write.ts`（`writeAtomic` を export し、失敗時に一時ファイルを消す）
- 文書: ARCHITECTURE（コマンドの表・モジュール・§6.2 のレビューループに注記）、ROADMAP（M2-2）、README（CLI）
- 依存関係・`package-lock.json`・`tests/structure/`・禁止文字の集合・npm の保護設定・既存テストの期待値は変えない（zod は既存の依存）
