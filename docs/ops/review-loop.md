# 独立レビューの再修正ループの手順書

最終更新: 2026-10-16（v0.8.3。下の注記）。その前: 2026-10-13（v0.7.0。いま実際に回している流れを手順にした。ROADMAP の M2-2「再修正 → 再 verify → 再パケットのループ手順を docs に明文化」）

注記（v0.8.3）: この文書が指すプロジェクトの `CLAUDE.md` は、v0.8.3 から git の追跡外（作業者のローカルの決まり）。手順 10 のタグの前の確かめは、`docs/ops/ci-and-branch-protection.md` の 2-1 にも同じ文がある。

独立レビュー（ChatGPT などのレビュアー）を、依頼 → 取り込み → 直す → 確かめる → 次の回、と回す手順。決定の根拠は ADR-0014（review-packet）・ADR-0026（review-import）・ADR-0027（review-check）。依頼文のひな形は `docs/ops/review-request-template.md`。

- **AI の答えを品質保証の根拠にしない**: レビュアーの「問題ない」も実装者の「直した」も合否にしない。合否は `npm run verify` などの機械的に再現できる結果だけ。review-import と review-check の終了コードは、ファイルが読めて形が合っているかだけで、`open` の数やレビュアーの評価では変わらない（ADR-0026 の D7）
- 誰が何をするか: **人間**はレビュアーへの送付、判定（VALID / PARTIAL / INVALID）と状態・行き先の承認、commit・push・タグの承認。**実装者（Claude Code）**は依頼文・パケットの作成、取り込み、記録、直し、検証、findings の実装者の欄の記入

## 1 回の流れ（label `<label>`、回 `<N>`、接頭辞 `<prefix>`）

| # | すること | コマンド・置き場所 | 止まる・確かめること |
|---|---|---|---|
| 1 | **依頼文とパケットを作る** | 依頼文はひな形で `~/Downloads/aiqh_<label>_r<N>_request.md`。パケットは `aiqh review-packet --range <from>..<to> --label <label> --request <依頼文> --zip-output ~/Downloads/review-packet-<label>[-r<N>].zip`（問いに要る変えていないファイルは `--doc`） | packet-scan（秘密・個人情報・生の制御文字が 0）。依頼文がパケットの中にバイト単位で同一で入っていること。依頼文が「入っている」と書いたファイルが、実際にパケットにあること |
| 2 | **人間がレビュアーに渡す** | ZIP（パケットだけ）を人間が送る。自己評価を含む報告書は入れない | 実装者は送らない（外部への送信は人間） |
| 3 | **結果の md を受け取る** | レビュアーは `independent-review-<label>-r<N>-for-claude.md` を出す。人間が `~/Downloads/` に置く | 同じ名前が 1 つだけか（`(1)` などの別名は SHA-256 を比べる）。バイト数・行数・SHA-256 を記録する |
| 4 | **取り込む** | `aiqh review-import ~/Downloads/independent-review-<label>-r<N>-for-claude.md --label <label> --round <N> --id-prefix <prefix>`（回が 2 以上で前の回を取り込んでいないときだけ `--allow-missing-previous`） | exit 0 で `docs/reviews/<label>/findings-r<N>.json`（すべて `open`）。最後の 2 行は `REVIEW LOOP: …` と `REVIEW IMPORT: written`。**exit 2 なら止める**（下の「止まったとき」） |
| 5 | **原文と対応記録を収録する** | `docs/reviews/<label>/review-r<N>.md`（先頭に収録の注記、その後ろは原文とバイト単位で同一。Security Scan に当たる例示行があれば分割表記にし、行番号と原文の SHA-256 を注記に）と `response-r<N>.md`（判定表、人間の決定、問いへの答えの要約、未確認範囲） | 記録の commit（docs だけ）。単体検証 → push の前の走査 → push |
| 6 | **findings の実装者の欄を書く** | `findings-r<N>.json` の各件に `verdict`（VALID / PARTIAL / INVALID）、`action`、`destination`（直す版）。人間の判定のとおり。`status` は `open` のまま | JSON が状態の正本（D5）。8 項目と `source` は直さない |
| 7 | **直す（テストを先に）** | 回帰テストを先に書き、直す前の SHA で FAIL を記録してから直す。commit は目的ごと | 既存テストの期待値・`tests/structure/`・依存関係などを変える必要が出たら止めて確かめる（プロジェクトの規則） |
| 8 | **`resolved` にする** | 直した後の docs の commit で、`status: "resolved"`、`fixedIn`（直した commit の 40 桁の SHA。タグの object の SHA ではない）、`regressionTest`（テストのファイルと名前、直す前の FAIL の記録）、必要なら `guard`・`note`。直さないものは `deferred`（`destination`）・`accepted`（`note`: 受け入れた理由と書いた場所）・`invalid`（`note`: 理由。`verdict` は INVALID） | 状態を変えるのは人間の承認の下で |
| 9 | **review-check** | `aiqh review-check --label <label>` | exit 0 であること（2 なら欄の不足などを直す）。`REVIEW LOOP: complete` か `incomplete (open N)`。前の回の評価との食い違い・評価の無い指摘の警告を読み、人が状態を決め直すか判断する |
| 10 | **次の回へ** | release（タグの前に、その release commit の `verify (ubuntu)` が success であることを `gh` で確かめる。プロジェクトの `CLAUDE.md`）→ 1 に戻る（回 `<N+1>`。依頼文で、前の回の指摘の評価を JSON の `previous` に必ず書くよう頼む） | 終える基準に達していれば、次の回は依頼しない |

## 終える基準

- **その回の結果が High 0・Medium 0 なら、そのレビューを終える**（依頼文の「このレビューの結果の扱い」に前もって書く）。Low は記録して次の版以降で扱う（`deferred` と `destination`、または ROADMAP の項目に）
- 終えた後も、取り込んだ回の findings は残す。review-check が `REVIEW LOOP: complete` を出すのは、すべての回に `open` が 0 件のとき（Low を `deferred` にしたものは `open` ではない）
- 例: m2-2-review-import は R1（Medium 3。v0.6.1 で直して `resolved`）→ R2（指摘なし）で終えた。`aiqh review-check --label m2-2-review-import` は `REVIEW LOOP: complete`、警告 0

## 「ループ未完了」の意味

- `REVIEW LOOP: incomplete (open N)` = その label のどこかの回に、まだ `open`（判定・対応が決まっていない）の指摘が N 件ある、という**表示**。合否ではない（review-import・review-check の終了コードは 0 のまま。非目標: レビュアーの判断を自動で合否にしない）
- 「ループ未完了」のまま次の作業に進むかは人が決める。ROADMAP や報告で、残っている ID を明記する
- `REVIEW LOOP: unknown (…)`（review-import が出す）は、その label の findings のファイルが review-check の検査に通らない状態。`aiqh review-check --label <label>` で理由を見る

## 止まったときの対処

- **review-import が exit 2（取り込めない）**: 端末の `[種類]` と行番号を見る（レビュアーの文章は出ない）。**形の崩れ（見出し・件数の行・JSON のブロック・ID の位置・文字参照など）は、レビュアーに書き直しを頼む**（ADR-0026 の D3: 逃げ道は作らない）。受領ファイルを実装者が直して取り込むことはしない。崩れたまま記録したいときは、人間の判断で原文の収録だけを行う
- **review-check が exit 2**: 多くは実装者の欄の不足（`resolved` の `fixedIn`・`regressionTest`、`deferred` の `destination` など）か、手で直したときの形の崩れ。findings の JSON を直して、もう一度 review-check を通す。`[git]` は git が答えないとき（作業ツリーの外・git が無い）で、作業ツリーの中で走らせ直す。過去のレビュー（review-import の前のもの）の label は findings のファイルが無いので対象外
- **警告**（評価と状態の食い違い、評価の無い指摘）: 誤りではない。人が状態を決め直すか、そのままにする理由を `note` や対応記録に書く
- 想定外のときは、何も直さずに止めて人間に報告する（プロジェクトの規則）
