# ADR-0030: このリポジトリを、履歴を書き換えずにそのまま Public にする（MIT。プロジェクトの `CLAUDE.md` は追跡外）

- 状態: 採用（v0.8.3 は準備まで。Visibility の切り替えは人間が GitHub の画面で行う。切り替えの後、ADR-0025 の決定 6〈非公開のままでは Branch Protection・rulesets が使えない〉の前提が変わる。ADR-0009〈配布は `npm link`〉は変えない）
- 日付: 2026-10-16（v0.8.3）。注記: 2026-10-16（v0.8.4。切り替えの後。下の「注記（v0.8.4）」）

## 文脈
- このリポジトリは、Public にしてポートフォリオに載せる前提で作ってきた（会社の情報・個人の情報をどこにも書かない規則）。M2-2 の完了（v0.8.2）の後、公開の前に履歴を点検した
- **点検**（2026-10-16。読み取りだけ。M2-2 の完了と履歴の点検の報告の §4。値・一致した行は、どこにも書いていない）:
  - 範囲: リモートの ref から辿れるすべて（commit 333・blob 1,356・タグ 75、commit とタグのメッセージ、履歴のパス 448）、author・committer・tagger、GitHub の metadata、Actions の 16 run の `verify (ubuntu)` のログ
  - 方法: aiqh 自身の scanner（`scanString`）、push の前の走査と同じ分類（個人情報・機密・パス）、社内ホスト風の名前・UNC・プライベートの IPv4、語の照合（会社・取引先・実名の一部・個人のメールアドレスの一部・ほかのプロジェクトの名前・ローカルのディレクトリの名前）
  - 結果: **(C) 履歴の書き換えが要るもの 0 件**（秘密・会社の情報・個人の情報は見つからなかった）。(A) 公開して問題ないもの: scanner の一致 30 はすべて履歴だけにあるテストの偽の値と説明の例、秘密の形の一致はすべて接頭辞だけ・識別子・偽の値の印のある値、メールアドレスは noreply と例示のドメインだけ、author・committer・tagger は GitHub の noreply の 1 種類だけ。(B) 人間の判断が要るもの 3 つ（下）
- **(B) の 3 つ**:
  - B-1: ほかのプロジェクトの名前 2 語（M1 で aiqh を当てた 2 つの対象リポジトリ。HEAD の docs と履歴にある）
  - B-2: すべての commit のメッセージの、Claude のセッションの URL の行（`Claude-Session:`）と Co-Authored-By の行
  - B-3: git 管理の `CLAUDE.md`（AI への作業の決まり）と、開発の記録（`docs/reviews/`・`docs/reports/`）
- 案は 3 つあった: 案 1（そのまま Public にする）、案 2（`git filter-repo` で履歴を書き換える）、案 3（履歴を 1 つにまとめた新しい Public のリポジトリ）

## 決定（人間の決定。2026-10-16）
1. **案 1: いまのリポジトリをそのまま Public にする**。履歴は書き換えない（強制の push もしない）
2. **B-1・B-2 が履歴に残ることを受け入れる**。B-1 の 2 つの名前は公開してよい（README などでも書き換えない）
3. **LICENSE は MIT**。著作権の行は `Copyright (c) 2026 youhei-dev`（GitHub のアカウント名。実名は書かない）。`package.json` に `"license": "MIT"`
4. **開発の記録（`docs/reviews/`・`docs/reports/`）は見せる**。**プロジェクトの `CLAUDE.md` は v0.8.3 から追跡外**: `git rm --cached`（作業者のローカルのファイルとして残す）と、`.gitignore` の `/CLAUDE.md`（直下だけ）。過去の 8 版が履歴に残ることは受け入れる
5. 文書が `CLAUDE.md` を指す箇所は、本文を書き換えずに「v0.8.3 から追跡外（作業者のローカルの決まり）」と注記する（ARCHITECTURE・ADR-0012・ADR-0025・`docs/ops/` の 2 つ）。過去の記録（レビューの原文・報告・CHANGELOG と ROADMAP の過去の項）は変えない
6. `package.json` に `repository`・`bugs`・`homepage`（`https://github.com/youhei-dev/ai-quality-harness`）を足す。`private: true` はそのまま（npm に出すかは波 4 の配布の判断。ADR-0009）
7. **Visibility の切り替えは人間が GitHub の画面で行う**。Claude Code は `gh repo edit` などでリポジトリの設定を変えない。切り替えの後の Branch Protection か rulesets（手順書 `docs/ops/ci-and-branch-protection.md` の §3）と、description・topics は次の指示で行う

## 代替案
- **案 2: 履歴の書き換え**（`git filter-repo` で語の置き換えとメッセージの行の削除）: すべての commit（333）とタグ（75）の SHA が変わる。CHANGELOG・ROADMAP・報告・ADR に書いた SHA と、過去の報告との対応が切れる。findings の JSON の `fixedIn` は、review-check が commit として解決できることを確かめるので、古い SHA が解決できずに失敗しうる。強制の push と全タグの付け直しが要る。(C) が 0 件なので、得るものより失うものが大きい
- **案 3: 履歴を 1 つにまとめた新しい Public のリポジトリ**: 過去の commit・タグが公開側に無い。docs の中の SHA と findings の `fixedIn` が公開側で解決できない。開発をどちらで続けるかも決める必要がある。B を消す必要が無くなったので採らない
- **`CLAUDE.md` を公開したままにする**: 報告の保存先や提出の作法など、作業者のローカルの運用の決まりまで公開の文書になる。人間は追跡外を選んだ
- **ほかのライセンス（Apache-2.0 など）**: 人間は MIT を選んだ

## 既知の限界
- 点検の語の照合は、与えた語と表記の揺れだけ。言い換え・略称・ほかの名前は調べていない。偽の値の判定は、値の部分の特徴（印・形・場所・文脈）からの推定
- B-2 のセッションの URL が第三者から開けるかは確かめていない
- Actions のログは、16 run の `verify (ubuntu)` のジョブだけを見た（手動の run の `measure (windows)` のジョブのログは見ていない）。公開すると、Actions の実行の記録とログも見えるようになる見込み [推定]
- `CLAUDE.md` を追跡外にしても、過去の版は履歴に残る（`git log -- CLAUDE.md` で読める）。`tests/` の 7 つのファイルのコメント「see CLAUDE.md」は残る（v0.8.3 では `tests/` を変えない）。偽の値の作法（`fake()`）は `tests/helpers.ts` のその関数のコメントにも書いてある
- 点検の後の commit（v0.8.3）は、push の前の走査（分類は点検の一部と同じ）だけで確かめた。点検の全部はやり直していない

## 影響
- 公開の後、Branch Protection か rulesets が使えるようになる（ADR-0025 の決定 6 の前提が変わる）。`verify (ubuntu)` を必須チェックにするか、pull request の流れにするかは、手順書の §3-2 の案 A・B から人間が決める
- 以後の commit・docs もそのまま公開される。会社の情報・個人の情報を書かない規則と、push の前の走査は続ける
- リリースの手順（commit → 各 commit の SHA 固定の worktree での検証 → push → CI の `verify (ubuntu)` の success → 注釈付きタグ）は、作業者のローカルの決まりに残る。公開の文書では、ARCHITECTURE（リリースの判定の根拠は commit 済み HEAD での verify）と、ADR-0025 の追記・手順書の 2-1（タグの前の `verify (ubuntu)` の確かめ）に要点がある

## 注記（v0.8.4）
- 2026-10-16 の 13:50 ごろ（JST）、人間が GitHub の画面で Visibility を Public に切り替えた（決定 7）。人間の確かめ: `visibility` は `public`・`private` は false、ログインなしの表示は 200、main の保護の GET は HTTP 404（`Branch not protected`）
- 決定 7 の「次の指示」の設定は v0.8.4 で行った（人間の指示。`gh api`）: main の ruleset `main-protection`（削除と force push の禁止。必須チェックは未設定。ADR-0025 の「注記（v0.8.4: 公開と ruleset）」）、description、topics。`sha_pinning_required` は変えていない（任意のまま）
