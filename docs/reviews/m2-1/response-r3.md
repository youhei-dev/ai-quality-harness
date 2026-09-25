# M2-1 独立レビュー R3 への対応記録（response-r3）— v0.4.3

- 対象レビュー: `docs/reviews/m2-1/independent-review-r3.md`（受領ファイル名 `independent-review-m2-1-r3-for-claude.md`、2026-09-23 付、SHA-256 02b16458…。
  R2 の 8 件は解消 6 / 部分的に解消 2〈R2-002、R2-007〉、新しい指摘は High 1 / Medium 5 / Low 0。対象 v0.4.2 = commit 7f981b2 / tag object 3933494、
  パケット `review-packet-m2-1-r3.md`〈範囲 v0.4.1..v0.4.2〉）
- 対応日: 2026-09-23（確認）、2026-09-25（修正）
- 人間の判断: R3-001（High）を v0.4.3 で直し、独立レビュー R4 を受ける。R3-002〜006（Medium）は M2-2 へ持ち越す（今回は直さない）
- **R3 の依頼の経緯**: R3 は最初の依頼で ChatGPT の安全フィルターに止められた。「防御用ツールのバグを探すレビューで、攻撃手法は求めていない」という前置きを足し、
  「再現手順」を「再現条件」とする表現に変えて再依頼した（人間による操作。レビューの内容・観点は変えていない）

## R2 の 8 件の解消判定（レビュアーの判定）

| ID | 判定 | 補足（レビュアー） |
|---|---|---|
| M2-1-R2-001 | 解消 | `-o` の basename は `OPTION_INVENTORY.output` から `checkValue()`、既定名も ZIP 作成前に検査。ZIP のエントリ名は型上 `Checked` |
| M2-1-R2-002 | 部分的に解消 | 同一性の比較は `writeTogether()` の前の 1 回だけで、判定後に親のシンボリックリンクを差し替えると同じ実体に収束できる → R3-001 |
| M2-1-R2-003 | 解消 | 確定点・戻し処理の失敗の収集・確定後の退避削除の失敗（exit 0 + 警告 + `backupsRetained`） |
| M2-1-R2-004 | 解消 | 期待値は `node:crypto`。静的テストの見逃し → R3-006 |
| M2-1-R2-005 | 解消 | U+0060 を `\u{60}` に |
| M2-1-R2-006 | 解消 | `--range` / `--doc` は git の前に検査 |
| M2-1-R2-007 | 部分的に解消 | 検査できない状態が exit 1 に隠れる経路 → R3-002、壊れた `latest.json` の検査順 → R3-003 |
| M2-1-R2-008 | 解消 | package.json・CHANGELOG・README の版が一致、整合テスト |

## M2-1-R3-001（High）— 修正（fe502bf）

- **経緯**: 人間は当初、R3-001 を Medium に下げて M2-1 を完了とする判断をした（理由: 判定の後・書き込みの前に、別の誰かが出力先フォルダの親のシンボリックリンクを
  同時に差し替えることが条件で、利用者のファイルシステムを他者が同時に書き換えられる状況は aiqh の信頼境界の外。Node の標準 API には `openat` 相当が無く、
  直しても窓を狭めることしかできない）。完了記録の作業の §1（持ち越す 6 件の確認）で、実装 AI が**差し替えなしでも起きる経路**を見つけた:
  出力先の親ディレクトリ名が、APFS では同じ名前として扱われ `toLowerCase()` では別の名前になる組（U+00DF / `ss`、U+03C2 / U+03C3、U+00B5 / U+03BC）のとき、
  実際の `runReviewPacket` で既存ファイルが消え、ZIP の中身が残り、exit 0 になった。前提が崩れたため、人間の判断で High に戻し、完了記録の依頼は取り下げた
- **再現**: レビュアーの経路（判定の後、`writeTogether` の最初の段階 `prepare:packet` で親のシンボリックリンクを A → B に差し替え）も、実際の関数で説明どおり起きた
  （exit 0、`OLD` が消え ZIP の中身が残る）
- **原因**: 同じ実体かどうかを文字列の正規化（realpath + NFC + `toLowerCase()`）で判定していた。ファイルシステムが同じ名前とみなす規則（APFS の大文字小文字の同一視、正規化）と
  JavaScript の文字列変換は一致せず、変換を足しても列挙した規則と実際の規則のずれは残る
- **修正**: ファイルシステムに同じ実体かを問い合わせる。準備段階で親ディレクトリを作った後、その時点の実パスと `dev`+`ino` を記録し、一時ファイルをそこへ書く。
  確定段階（既存ファイルの退避）の直前の段階 `check:same-target` で、(1) 各親の `dev`+`ino` が記録と同じであること（違えば「directory changed during the write」、exit 2）、
  (2) 親の `dev`+`ino` が同じで basename が ASCII の大文字小文字を無視して同じなら同じ実体（exit 2）。どちらも一時ファイルを消し、既存ファイルには触れない。
  basename が ASCII でなければ exit 2（防御。既に `[A-Za-z0-9._-]` に制限済み）。文字列の比較は、ディレクトリを作る前の早い段階の拒否として残した
- **保証の範囲**: `check:same-target` の後から確定までの間に他者が出力先を変更する場合は防げない（信頼境界の外。README と ADR-0014 に明記）
- **回帰テスト**: `tests/regression-m2-1-r3-001-filesystem-identity.test.ts`（11 件: 名前の組 8、差し替え 2〈`prepare:packet` と `check:same-target`〉、衝突のない親の変更 1）。
  各組は、実行環境のファイルシステムが同じディレクトリとして扱うかを先に確かめ（mkdir の後に別名で stat して ino を比べる）、同じ扱いなら exit 2・既存ファイル不変、
  別扱いなら両方書かれて exit 0（ただし早い段階の文字列比較で等しい組は、区別するファイルシステムでも exit 2 = 安全側の拒否）
- **修正前 FAIL**: 7 / 11（名前の組 4〈U+00DF / ss、U+03C2 / U+03C3、U+00B5 / U+03BC、U+FB00 / ff〉、差し替え 2、衝突のない変更 1）。
  代表: `expected +0 to be 2`。修正前も PASS の 4 件は、`toLowerCase()` で一致して文字列比較で既に拒否されていた 3 組（U+212A / k、U+0130 / i + U+0307、
  x + U+FF41 / x + U+FF21）と、APFS でも別扱いの 1 組（x + U+FF21 / xA、両方書き込み）

### 名前の組ごとの結果（macOS APFS、`tmp/m2-1/r3/pairs-before.log` / `pairs-after.log`）

| 親ディレクトリ名の組 | APFS で同じ扱い | v0.4.2 | v0.4.3 |
|---|---|---|---|
| U+00DF / `ss` | はい | exit 0、既存ファイル消失 | exit 2、不変 |
| U+00DF / `SS` | はい | exit 0、消失 | exit 2、不変 |
| U+03C2 / U+03C3 | はい | exit 0、消失 | exit 2、不変 |
| U+00B5 / U+03BC | はい | exit 0、消失 | exit 2、不変 |
| U+FB00 / `ff` | はい | exit 0、消失 | exit 2、不変 |
| U+0345 / U+03B9 | はい | exit 0、消失 | exit 2、不変 |
| U+212A / `k` | はい | exit 2、不変（文字列比較で一致） | exit 2、不変 |
| U+0130 / `i` + U+0307 | はい | exit 2、不変（文字列比較で一致） | exit 2、不変 |
| `x` + U+FF41 / `x` + U+FF21 | はい | exit 2、不変（文字列比較で一致） | exit 2、不変 |
| `A` + U+030A / U+00E5 | はい | exit 2、不変（NFC で一致） | exit 2、不変 |
| `x` + U+FF21 / `xA` | いいえ | exit 0、両方書き込み | exit 0、両方書き込み（誤った拒否なし） |

## R3-002〜006（Medium）— M2-2 へ持ち越し

2026-09-23 に実際のコードで確認した（`tmp/m2-1/r3/`。コードは変えていない）。

| ID | 確認 | レビュアーの説明と違う点 | 今のコードで抜け道が使われているか |
|---|---|---|---|
| M2-1-R3-002 | 確認できた。U+202E を含むパス + 別の変更ファイルの blob の欠損で exit 1（blob の欠損だけなら exit 2）。秘密の形の `-o` + 読めない `--request`（名前は通常）で exit 1（読めない `--request` だけなら exit 2） | レビュアーは aiqh 本体は未実行。blob の欠損だけの対照で最初に失敗するのは `git diff --numstat` | — |
| M2-1-R3-003 | 確認できた。JSON として壊れた `latest.json` の中の秘密の形・U+2028 はどちらも exit 2（`not valid JSON`）で finding にならない | レビュアーは未実行 | — |
| M2-1-R3-004 | 確認できた。型の別名、`const x: Checked = JSON.parse(...)`、`inlineCode(raw as any)`、`md` への `any` を、プロジェクトの strict 設定の `tsc` が exit 0 で通す | なし | 使われていない（`src/` に `as any`・`: any`・別名なし。`as Md` は `packet.ts` の Md を作る側の 5 か所だけ。`JSON.parse` の 4 か所は `Checked`/`Md` を含まない型） |
| M2-1-R3-005 | 確認できた。short-only と `hideHelp()` のオプションは `Command.options` にはあるが、help の解析では得られない | なし | 使われていない（review-packet に非表示・short-only のオプションは無い） |
| M2-1-R3-006 | 確認できた。単一引用符・変数・テンプレート文字列の 3 形式を静的テストの正規表現が見逃す | 追加: `promisify(execFile)` の別名（`execFileAsync`）経由も対象外 | 使われていない（二重引用符以外の第 1 引数はすべて `process.execPath`） |

## 回帰テストの実行記録

- 修正前: `tmp/m2-1/r3/before-r3-001.log`（v0.4.2 のコードに新しいテストを当てた記録: 7 failed | 4 passed）
- 修正後: 新しい回帰テスト 1 ファイル 11 件、既存の R2-002・R2-003・R1-003 のテストを含め全 87 ファイル 466 件が PASS

## 教訓

- **ファイルシステムの同一性は、文字列の正規化ではなくファイルシステム自身（`dev`+`ino`）に問い合わせる**: 大文字小文字・Unicode の同一視の規則はファイルシステムごとに違い、JavaScript の変換では写せない
- **判断を下げる前提は、確かめられるなら確かめる**: 「同時の差し替えが必要」という前提が、確認の工程で崩れた。停止条件を依頼書に書いておいたことで、完了扱いにする前に止まれた
- **正規表現やテキスト解析による構造テストは迂回できる**: 構造の保証には AST や実体（commander の `Command` オブジェクト）を使う（R3-004〜006）

## R3-002〜006（Medium）— M2-2 での修正（v0.5.0）

- 人間の判断（2026-09-25、M2-2 SP1 の承認）: SP1 報告 §8 の 11 項目をすべて推奨案で採用。設計は R3-002 = 早期 return の廃止と `Rejected` 型と判定関数、
  R3-003 = 全文の検査と形の検証（zod）と読取失敗の分類、R3-004 = 型情報付きの構造テストと実行時の登録簿、R3-005 = 副作用のない CLI の factory と
  `Command` オブジェクトとの比較、R3-006 = 型情報付き AST と最小 PATH の全テスト（自己 verify の `unit-minpath`）。終了コードの優先順位は ADR-0015
- 各件とも SP1 で実コードの再現をしてから直した（`tmp/m2-2/repro/`）。修正前 FAIL は、各 commit で足したテストを 1 つ前の commit のコードに当てて記録した
  （`tmp/m2-2/before-<ID>-*.log`）。構造テスト（R3-004・R3-006 の静的検査）はガード自体が修正なので、テストのガードを旧判定（v0.4.4 のテストの正規表現）に
  差し替えた実行も記録した
- 以降の独立レビュー（m2-2-r1 以降）の原文と対応記録は `docs/reviews/m2-2/` に置く

| ID | commit | 修正 | 回帰テスト | 修正前 FAIL |
|---|---|---|---|---|
| M2-1-R3-004 | 9f8d0a3 | brand を作るのは `issue` / `REJECTED` / `issueMd` だけ。型情報付きの構造テスト（`tests/structure/brand-guard.ts`）、実行時の登録簿（描画関数・`md`・組み立て・ZIP のエントリ名） | `tests/regression-m2-2-r3-004-brand-forgery.test.ts`（9 件） | 4 / 9（実行時 3、src の brand の生成箇所 1）。ガードを旧判定にすると、迂回の 22 形のうち 20 形を見逃して FAIL |
| M2-1-R3-006 | 17cdad6 | 型情報付き AST（`tests/structure/process-guard.ts`）、`scripts/test-minimal-path.ts` と自己 verify の `unit-minpath`（8 チェック） | `tests/regression-m2-2-r3-006-external-commands.test.ts`（6 件） | 新しいガードのままでは 0 / 6（ガード自体が修正）。旧判定にすると 5 / 6（違反の 13 行のうち 8 行を見逃す。静的解析の限界の 1 形を含めると 14 形中 9 形） |
| M2-1-R3-005 | 2e46c4b | `src/cli-program.ts`（副作用のない `buildProgram`）、一覧を `Command` オブジェクトと比較 | `tests/regression-m2-2-r3-005-option-inventory.test.ts`（5 件） | 5 / 5（factory が無く import で失敗）。help と使い方エラーの出力 13 通りは分割の前後でバイト一致 |
| M2-1-R3-002 | cb164c0 | `src/review/outcome.ts`（`InspectionError` / `DeferredError` / `EXIT_PRIORITY` / `decideOutcome`）、`Rejected` 型、検査を最後まで続ける `inspectPacket` | `tests/regression-m2-2-r3-002-exit-priority.test.ts`（38 件） | 判定関数の単体テストを除く 36 件中 20 件（検査不能が 1 に隠れる 14 通り、D1・D2・D4、報告の形 3 件）。ファイル全体は `outcome.ts` が無く import で失敗 |
| M2-1-R3-003 | 6b3f235 | `latest.json`: 読めなければ検査不能、JSON でない・形が違えば全文を検査してから出力しない判断 | `tests/regression-m2-2-r3-003-latest-json.test.ts`（16 件） | 12 / 16 |

- 既存テストの期待値の変更: `tests/regression-m2-1-r2-007-findings-before-errors.test.ts` の 1 件（ファイル名の finding + 読めない `--request` が 1 → 2。SP1 で予定したもの）。
  置き換え（SP1 で予定したもの）: `tests/regression-m2-1-r2-checked-inventory.test.ts` の 2 件（`as Checked` の文字列検査、`--help` の解析）、
  `tests/regression-m2-1-r2-004-external-commands.test.ts`（静的な正規表現と 3 ファイルの動的検査。ファイルごと）
- パケットの組み立ては変えていない: 版の表記が同じ状態で、v0.4.4 と M2-2 の実装から同じ範囲・入力で作ったパケットと ZIP の SHA-256 が一致した
