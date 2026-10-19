# 適用先で aiqh を前の版に戻す手順書

最終更新: 2026-10-19（v0.12.1。初版。M4 の運用テンプレート）

再利用ワークフロー `verify.yml` で aiqh を使っている適用先（呼び出す側のリポジトリ）で、新しい版に上げた後に困ったことが起きたとき、前の版に戻す手順。呼び出し方は `docs/ops/reusable-workflow.md`、タグの運用は同じ文書の §6。

- 戻すのは**呼び出す側**の参照だけ。aiqh 本体の側では、版を取り消さない（下の「aiqh 本体の側ですること・しないこと」）
- 戻すのも上げるのと同じく、呼び出す側の pull request で行う（直接の push にしない）

## 1. いつ戻すか

- 上げた後の pull request や main の run で、aiqh の側の原因で job が失敗する（たとえば、前の版では通っていた設定が読めない、`aiqh verify` が ERROR〈終了コード 2〉になる）
- 判定が前の版と変わり、それが aiqh の不具合だと分かった
- 対象のコードの失敗（`VERIFY FAILED` で、check の中身が落ちている）は、戻す理由にしない。fail closed のとおりに直すのは、対象の側

迷うときは、まず失敗のログ（`gh run view <run-id> --log-failed`）と `docs/ops/reusable-workflow.md` の §7 の表で、どこで止まったかを確かめる。

## 2. 前の版の SHA を見つける

呼び出す側が固定するのは、タグが指す **commit** の 40 桁の SHA（注釈付きタグのオブジェクトの SHA ではない）:

```bash
git fetch origin --tags                       # aiqh の手元の clone で、タグを取り込む
git rev-parse 'vX.Y.Z^{commit}'               # 前の版 vX.Y.Z のタグが指す commit の 40 桁の SHA
gh api repos/youhei-dev/ai-quality-harness/commits/vX.Y.Z --jq .sha   # clone が無いときは API で（同じ値）
```

- CHANGELOG の各版の見出しにも、`commit <SHA> / tag object <SHA>` の形で書いてある（前の SHA を使う）
- 呼び出す側の git の履歴（上げた pull request の差分）にも、上げる前の SHA が残っている。どちらで見つけても、上のコマンドで同じ値になることを確かめる

## 3. 戻す pull request

呼び出す側のワークフロー（例: `.github/workflows/quality.yml`）の `uses:` の行を、前の版の SHA と版のコメントに書き換える:

```yaml
    uses: youhei-dev/ai-quality-harness/.github/workflows/verify.yml@<前の版の 40 桁の commit SHA> # vX.Y.Z
```

- branch を作り、この 1 行（と、必要なら下の `with:` と設定）だけを変える commit にする
- **版の間の違いを CHANGELOG で確かめる**。とくに、再利用ワークフローの inputs と既定値、設定の仕様（`docs/CONFIG_SPEC.md`）の変化
  - 新しい版で足した inputs を `with:` で使っていれば、前の版では使えない。同じ pull request で外す
  - 設定（`aiqh.config.jsonc`）が新しい版でだけ通る書き方をしていれば、前の版は設定を読めずに ERROR になる。同じ pull request で設定も戻すか、戻す先の版を選び直す。設定を変えるときは `docs/ops/policy-change.md` の手順に従う
- pull request の説明に、戻す理由（どの run で何が起きたか）と、戻す先の版を書く

## 4. 戻した後の確かめ

- **pull request の CI**: 呼び出す側の必須の check（`<呼び出す側の job の名前> / aiqh verify`）が success になる。失敗するなら、ログで、前の版の aiqh で何が起きたかを見る
- **`aiqh --version` の行**: その job の `aiqh verify` の手順のログの最初に、`aiqh --version` が出す版の行がある。戻す先の版（`X.Y.Z`）になっていることを確かめる。ワークフローは、自分と同じ commit の aiqh のソースを使う（`docs/ops/reusable-workflow.md` の §3 の 5）ので、版の行が違えば、`uses:` の SHA が違う
- merge の後の main の run でも、同じ 2 つを確かめる
- 手元で `aiqh verify` を使っているなら、手元の aiqh も同じ版にそろえる（aiqh の clone で `git switch --detach vX.Y.Z` の後、README の手順で依存を入れてビルドし直す）。CI と手元で版が違うと、結果を比べられない

## 5. aiqh 本体の側ですること・しないこと

- **タグを消さない・動かさない**。呼び出す側は commit の SHA で固定しているので、タグを動かしても呼び出す側は変わらず、記録（CHANGELOG・ROADMAP・報告）と食い違うだけになる
- 問題の版を取り消す・作り直す（同じ版の番号で別の commit を出す）ことをしない。直すときは、**次の版**（たとえば patch の版）を出す
- 問題を記録する: ROADMAP のバックログの項目か、その版の記録に、何が起きたか・どの版で・どの適用先の run で（適用先の名前やデータは公開の文書に書かない）を書く。CHANGELOG の次の版の見出しで、直したことと、問題の版を書く

## 6. 直した版を出すまでの間

- 呼び出す側は、戻した前の版の SHA のままにする。ブランチやタグ（`@main`・`@vX.Y.Z`）を指して、直るのを待つ形にしない
- 戻したことと、上げ直す条件（どの版で直ったら上げるか）を、呼び出す側の issue か pull request の説明に残す
- 直した版が出たら、`docs/ops/reusable-workflow.md` の §6 のとおりに、新しい版の SHA と版のコメントに書き換える pull request を作り、上の §4 と同じ確かめをする
- 戻している間も、ほかの変更の pull request では必須の check が走る。前の版のまま、品質ゲートは止めない
