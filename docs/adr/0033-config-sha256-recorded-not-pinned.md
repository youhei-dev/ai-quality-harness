# ADR-0033: verify のレポートに、設定ファイルのバイト列の SHA-256 を `configSha256` として記録する（固定ではなく記録）

- 状態: 採用（v0.10.0。M4 の最初の版。独立レビュー R1 の R-006 の対策候補 2〈ROADMAP の「設定ハッシュの固定」〉を「記録」として入れる。候補 3 は docs の手順〈決定 6〉。設計と独立レビューの記録は `docs/reviews/m4-design/`）
- 日付: 2026-10-17（v0.10.0）

## 文脈
- 独立レビュー R1 の R-006（High。`docs/reviews/m0/independent-review-r1.md` の 89〜97 行）: 品質ゲートの方針（設定）を、検証されるリポジトリ自身が変えられる。そのため fail closed は「読み込んだ設定に対して」しか保証されない。対策の候補は、protected policy・config hash の固定・品質ポリシーの変更の別承認
- M0 で信頼境界を文書にした（`docs/ARCHITECTURE.md` の §9.1）。候補 1（CODEOWNERS と必須レビューの手順）は M3 で手順だけ書いた（`docs/reports/M3_COMPLETION.md`）。v0.9.2 から、main への変更は pull request でしか入らない（ADR-0032）
- それまでのレポートには、どの設定で検証したかの記録が無かった。`configPath` は絶対パスで、中身を表さない
- verify は設定を 1 回だけ読む（`src/config/load.ts` の `loadConfig`）。読めない・無い・不正な設定では、レポートを書かずに exit 2 で終わる（`src/commands/verify.ts`）
- M4 の設計（`docs/reviews/m4-design/design-r3.md` の §1。独立レビュー R1・R2 でこの部分への指摘は無い）と、人間の決定 D9・D10・Q9（2026-10-17）

## 決定
1. **ハッシュするもの**: verify が読んだ設定ファイルの**バイト列**の SHA-256
   - `loadConfig` は、ファイルを `Buffer` として 1 回だけ読み、その同じ `Buffer` から SHA-256（`node:crypto` の `createHash`。ADR-0019 の一覧にある）と文字列（`buffer.toString("utf8")`）を作る。文字列は、それまでの `readFileSync(path, "utf8")` と同じ（同じ UTF-8 の復号。BOM・不正な UTF-8・CRLF のファイルで同じ文字列になることをテストで確かめる）
   - 読み込みとハッシュの間に別の読み込みは無い。読んだ後でファイルが変わっても、ハッシュは「検証に使った内容」を表す
   - 読み込みの誤りの扱い（ENOENT だけが「無い」、それ以外は `ConfigError`、エラーの文言、終了コード 2）は変えない
2. **置き場所**: レポート（`latest.json`・`history/<ts>.json`）の最上位、`configPath` の直後に `configSha256`
   - 最上位のキーは `schemaVersion`・`tool`・`project`・`configPath`・**`configSha256`**・`startedAt`・`finishedAt`・`durationMs`・`git`・`verdict`・`exitCode`・`interruptedBy`・`summary`・`categories`・`checks` の 15 個になる
   - ADR-0028 の代替案「最上位に欄を足す」は、最上位のキーを固定したテストの期待値が変わることと、check との対応を失うことで採らなかった。設定のハッシュは run の属性で、check との対応は無い。テストの期待値の変更は、人間が承認した（下の「既存のテストの期待値の変更」）
3. **値の形**: 小文字の 16 進 64 桁（`/^[0-9a-f]{64}$/`。`digest("hex")` の出力）。秘密の形のマスクを通しても変わらない（テストで確かめる）
4. **値が無いとき**: **欄を書かない**（`null` にしない）
   - verify のレポートは、設定を読めたときにしか書かれない。「読めなかったのでハッシュが無い」レポートは存在しない
   - 欄が無いのは、v0.10.0 より前のレポートと、テストが設定のファイル無しで `buildReport` を呼んだものだけで、意味は「記録されていない」
   - `null` にすると「設定が読めなかった」と読める余地が生まれる
   - 型は任意の欄（`configSha256?: string`。`ResolvedConfig` と `VerificationReport`）。verify は必ず書く（テストで固定する）
5. **`schemaVersion` は 1 のまま**（欄を足すだけ。ADR-0003 の「後方互換の変更」、ADR-0028 の決定 9 の前例）
6. **R-006 の候補 3（品質ポリシーの変更の別承認）は docs の手順にする**（人間の決定 D10）
   - 手順は M4 の運用テンプレートの版で `docs/ops/` に書く（設定と、設定が呼ぶ scripts を変える pull request では、説明にその旨と理由を書く。CODEOWNERS を確かめる。merge の後に、ハッシュの変わり目を確かめる）
   - aiqh は承認を強制しない
7. **`latest.md` と端末の出力は変えない**（人間の決定 Q9: v0.10.0 では JSON だけ）。`latest.md` の表と、再利用ワークフローの Job Summary の見た目は変わらない

## 守れないこと（既知の限界）
誤った安心を与えないために、ROADMAP の「設定ハッシュの固定」を「記録」と言い換える。
- **設定の外の変更は検出しない**: `package.json` の scripts（`npm test` などが指す中身）、テストのファイル、lint・テストの道具の設定、環境変数、依存の版の変更は、ハッシュに表れない。R-006 の根拠の「scripts の弱体化」は残る
- **期待の値はどこにも固定しない**: 同じリポジトリの pull request で、設定も一緒に変えられる。ハッシュは「いつ変わったか」を後から見せる記録で、変更を止める仕組みではない。止めるのは、pull request の必須化と人のレビュー（ADR-0032）
- **何が変わったか・弱くなったかは分からない**: 空白やコメントだけの変更でも値は変わる
- **security の check の子は、設定を自分でもう一度読む**: `aiqh security-scan` を check のコマンドにしているとき、その子のプロセスは設定を別に読む（`loadSecurityConfig`）。verify が読んでから子が読むまでの間に設定が変わると、ハッシュは子が使った内容を表さない
- v0.10.0 より前のレポートには無い（M4 の `aiqh history` は「不明」として扱う予定。設計 R3 の ADR-0034 の案）

## 既存のテストの期待値の変更（v0.10.0 の指示書で承認された 3 か所だけ）
- `tests/regression-backlog9-report-json-copy.test.ts`: 最上位のキーの期待の配列に `"configSha256"` を足した（`"configPath"` の後ろ）。補助関数 `report()` が `buildReport` に渡す設定に、固定の 64 桁の値を足した
- `tests/parse-verify.test.ts`: `REPORT_KEYS` に `"configSha256"` を足した（`"configPath"` の後ろ）。最上位のキーのテストの名前に「configSha256 added in v0.10.0」を足した
- ほかに、レポートの最上位のキーの並び・全体を固定したテストは無かった（`Object.keys(…)` の検索、スナップショット 0 件、`latest.json` の全体の比較なし）。`buildReport` に設定のリテラルを渡すほかのテストは、欄が任意なので変えていない

## 代替案
- **解決した後の設定（checks の一覧など）をハッシュする**: 空白・コメントの変更に強い。ただし、正規化の規則を自分で決めて保つ必要があり、人が `shasum -a 256` で同じ値を出せない。採らない
- **設定と、それが呼ぶ `package.json` の scripts をまとめてハッシュする**: R-006 の根拠に近づく。ただし、scripts の中身はさらに別のファイルを呼ぶので、どこまで含めても切れ目がある。範囲の説明が難しく、誤った安心を与えやすい。採らない（後で検討）
- **check ごとに置く**: run の属性なので合わない
- **`null` を書く**: 決定 4 の理由で採らない
- **期待のハッシュを固定して、違えば FAIL**（R-006 の「固定」の字義）: 期待の値を同じリポジトリに置くと、同じ pull request で変えられ、独立にならない。採らない（人間の決定 D10）

## 結果
- `latest.json` と `history/<ts>.json` で、どの設定のバイト列で検証したかを後から確かめられる（人は `shasum -a 256 aiqh.config.jsonc` で同じ値を出せる）
- 変わったファイル: `src/config/load.ts`（Buffer で 1 回読む）、`src/types.ts`（任意の欄）、`src/report/build-report.ts`（`configPath` の直後に書く）。依存・組み込みのモジュールの一覧（ADR-0019）・書き込みの出口（ADR-0020）は変わらない
- docs: `docs/ARCHITECTURE.md` の §7.1、`docs/CONFIG_SPEC.md` の §1、ADR-0006・0007 の注記、ROADMAP の M4
