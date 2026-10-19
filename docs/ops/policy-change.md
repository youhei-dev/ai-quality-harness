# 品質ポリシー（設定）の変更の手順書

最終更新: 2026-10-19（v0.12.1。初版。M4 の運用テンプレート）

品質ゲートの方針（どの check を、必須として、どの上限で走らせるか）を変える pull request の扱い。独立レビュー R1 の R-006（品質ゲートの方針を、検証されるリポジトリ自身が変えられる）の対策候補 3「品質ポリシーの変更の別承認」を、docs の手順にしたもの（人間の決定 D10。ADR-0033 の決定 6）。

- **aiqh は承認を強制しない**。この手順は、人と pull request の流れで守る。止めるのは、main の pull request 必須と人のレビュー（ADR-0032）
- 候補 2「設定のハッシュ」は、固定ではなく記録として入れた（`configSha256`。ADR-0033）。この手順では、その記録を「いつ変わったか」の確かめに使う

## 1. 対象の変更

次のどれかを変える pull request を、品質ポリシーの変更として扱う。

- **設定ファイル**（`aiqh.config.jsonc`）: check の追加・削除、`command`・`cwd`、`required`、`timeoutSec`・`defaults`、`security` の `allow`（秘密の形の finding の例外）・走査の設定など、どの欄でも（欄の一覧は `docs/CONFIG_SPEC.md`）
- **check が呼ぶもの**: `package.json` の scripts（`npm test`・`npm run lint` などが指す中身）、check が直接呼ぶスクリプト、テストや lint の道具の設定（`vitest.config.ts`・`eslint.config.js`・`tsconfig.json`・`pytest.ini` など）、テストを除外・skip する変更
- **呼び出す側のワークフロー**: 再利用ワークフローの `uses:` の SHA、`with:` の `config`・`working-directory`・`setup-command`

aiqh 本体では、`.github/CODEOWNERS` に、このうちの設定と道具のファイル（`aiqh.config.jsonc`・`package.json`・`tsconfig*.json`・`eslint.config.js`・`vitest.config.ts`・`scripts/`・`.github/` など）の持ち主を書いてある（`docs/ops/ci-and-branch-protection.md` の §4。いまは強制されない）。テストのファイルや、テストを除外・skip する変更は、CODEOWNERS の対象の外で、人が差分で見る。

## 2. pull request の手順

1. **品質ポリシーの変更だけの pull request にする**。ほかの変更（機能・直し）と混ぜない。とくに、テストの期待値を変える変更と、そのテストを走らせる check を変える変更を、同じ pull request に入れない
2. **説明に書く**: 品質ポリシーを変えること、何を・なぜ変えるか、ゲートが強くなるか弱くなるか（弱くなるなら、その理由と、代わりの守り）
3. **設定の差分を見る**: pull request の差分で、`aiqh.config.jsonc` と、上の「check が呼ぶもの」の差分を 1 つずつ読む。`required: false`・check の削除・`timeoutSec` の引き上げ・allow のルールの追加・テストの除外は、ゲートを弱くする変更として扱う
4. **`configSha256` の変化を見る**: 変える前と後の設定ファイルのハッシュを、手元で出して説明に書く

   ```bash
   git show origin/main:aiqh.config.jsonc | shasum -a 256   # 変える前（main の設定）
   shasum -a 256 aiqh.config.jsonc                          # 変えた後（作業の branch の設定）
   ```

   - 値は、verify のレポート（`latest.json`・`history/<ts>.json`）の `configSha256` と同じ計算（設定ファイルのバイト列の SHA-256、小文字 16 進 64 桁）
   - 設定ファイルを変えないとき（scripts だけを変えるとき）は、ハッシュは**変わらない**。そのことも説明に書く
5. **必須の check が success になってから merge する**。ただし、この pull request の check は、**変えた後の設定**で走る。弱くした設定は、自分の pull request の check に通る。success は、変更が正しいことの根拠にならない
6. 持ち主（CODEOWNERS）か、変更を書いた人とは別の人が、上の 2〜4 を見てから merge する。1 人のリポジトリでは、merge の前に時間を置いてもう一度読む

## 3. merge の後の確かめ

- main の run の必須の check が success
- 手元で main を取り込んで `aiqh verify` を走らせ、`artifacts/verification/latest.json` の `configSha256` が、手順 4 の「変えた後」の値と同じこと
- `aiqh history` のプロジェクトの `config <先頭 12 桁>` の行（HTML の「Config hashes」）に、新しい区間ができ、その最初の run が merge の後であること（`docs/ops/monitoring.md` の 2.4）
- CI の run のレポートは残らない（再利用ワークフローは artifact を上げない）。ハッシュの区切りが見えるのは、手元で走らせた履歴だけ

## 4. 守れないこと（ADR-0033 の「守れないこと」に沿い、この手順で分かることを足した）

誤った安心を与えないために、この手順で**守れない**ことを書く。

- **同じ pull request で、期待の値も変えられる**: 設定と一緒に、テストの期待値・テストのファイル・除外の一覧を変えれば、check は通る。aiqh はそれを止めない。止めるのは、pull request の必須と人のレビューだけ
- **期待の値はどこにも固定しない**: 設定のハッシュは「いつ変わったか」を後から見せる記録で、変更を止める仕組みではない。期待のハッシュを同じリポジトリに置いても、同じ pull request で変えられるので、独立にならない（ADR-0033 の代替案。人間の決定 D10）
- **設定の外の変更は検出しない**: `package.json` の scripts、テストのファイル、lint・テストの道具の設定、環境変数、依存の版の変更は、ハッシュに表れない。R-006 の根拠の「scripts の弱体化」は残る。上の §1 で対象に入れたのは、人が見るためで、aiqh が検出するからではない
- **何が変わったか・弱くなったかは分からない**: ハッシュは、空白やコメントだけの変更でも変わる。中身は差分で人が読む
- **security の check の子は、設定を自分でもう一度読む**: verify が読んでから子が読むまでの間に設定が変わると、ハッシュは子が使った内容を表さない
- **v0.10.0 より前のレポートには、ハッシュが無い**（`aiqh history` では `unknown` の区間）
- **CODEOWNERS とレビューの必須は、リポジトリの設定に依る**: aiqh 本体の ruleset は、Code Owners のレビューを必須にしていない（1 人のリポジトリでは、自分の pull request を自分で承認できず、締め出されるため。`docs/ops/ci-and-branch-protection.md` の 3-3・§4）
