# ADR-0011: アダプタは「検出＋推奨＋任意パーサ」に限定し、`init` の書込は別フラグに分ける

- 状態: 採用（「出力パーサは `OutputParser` の型だけ定義」は ADR-0028〈v0.8.0〉で置換: パーサは `src/parse/` に置き、verify が check の出力を表示のためだけに読む。アダプタは検出と推奨のまま。M1 の下書きの型は消した）
- 日付: 2026-09-18。追記: 2026-10-14（v0.8.0。状態の行だけ）、2026-10-23（v0.14.0。下の「改訂（v0.14.0、ROADMAP の項目 45）」）、2026-10-25（v0.14.1。下の「改訂（v0.14.1、B1-I140-R1-001）」）

## 文脈
M1 でアダプタと `aiqh init` を加えるにあたり、M0 の性質（実行経路 1 本、fail closed、判定と文言の 1 対 1）を壊さない
責務境界が必要。対象リポジトリへの書込は最小限にしたい。

## 決定
- アダプタ（`src/adapters/`）は `detect(ctx: RepoContext): Detection | null` だけを持つ。**コマンドを実行しない・verify の判定に関与しない・ファイルへ書かない**。`RepoContext` は読み取り専用で、`.env*` は存在確認のみ（内容は読まない）
- `Detection` は available（推奨 `Suggestion`）/ unavailable（理由と有効化の案内 `enableHint`）を返す。アダプタが対象外なら null（例: Python アダプタが Node リポジトリを見た）
- 分類ごとの採用はアダプタの並び順（既存 scripts の再利用 > 設定ファイル検出 > 汎用）。代替は監査表に表示する
- 出力パーサは `OutputParser` の型だけ定義（M1）。実装は M2 のレポート構造化と一緒に行う
- `aiqh init` の書込境界: 既定は表示のみ。`--write` は `aiqh.config.jsonc` 1 ファイルのみ（既存があれば exit 2、`--force` で上書き）。`.gitignore` の `artifacts/` と `package.json` の scripts は**別フラグ**（`--write-gitignore` / `--write-scripts`）でのみ書き、scripts は未定義キーだけ追加する
- 検出 0 件では config を書かない（常に PASS する設定を作らない。ADR-0004 と同じ fail closed）
- 本体への `init` が既存の `aiqh.config.jsonc` と同等の提案を出すことをテストで固定する

## 代替案
- アダプタに実行を持たせる（アダプタごとの実行経路）: fail closed の保証点が増え、M0 の性質を崩す
- `init` が一括で全部書く: 対象リポジトリの規約（scripts の権限方針等）と衝突する

## 影響
- verify は M1 以降も設定に書かれた command だけを実行する。アダプタの追加は verify に影響しない

## 改訂（v0.2.1、M1 独立レビュー R1）
- **ローカル証拠と `npx --no-install`**（M1-R1-007）: 設定ファイルの存在だけでは available にしない。`NodeContext.hasLocalTool(package, bin)`
  （dependencies / devDependencies に名前がある、または実行可能な `node_modules/.bin/<bin>` がある）を必須とし、証拠が無ければ unavailable
  と導入案内を返す。既存 scripts があればそれを推奨し、無い場合の直接実行は `npx --no-install <tool> …` にしてネットワーク取得を起こさない
  （npm 11 で受理を確認）
- **Detection にスクリプト本文を入れない**（M1-R1-003）: `reason` は「`package.json scripts.lint found`」のような存在の記述だけにする。
  本文は秘密を含み得て、`init` の console / `--json` / 生成 config のコメントへ複製されるため。多層防御として `init` の全出力を `maskSecrets`、
  `--json` を `maskDeep`、生成 config のコメント（reason / note / hint）を `maskSecrets` に通す
- **書込前の実行時検証**（M1-R1-006）: `--write` は生成した JSONC を `parseConfigText` → `resolveConfig`（verify と同じ）に通し、通らなければ
  何も書かずに exit 2。required 0 件（Playwright のみ等）を書けた欠陥の修正
- **任意書込の例外処理**（M1-R1-010）: `--write-gitignore` / `--write-scripts` の read / parse / write を try/catch し、
  `aiqh init: failed to update <file>: …` と exit 2 を返す。書込は独立で、部分更新が起き得ることを CONFIG_SPEC §5.3c に明記
- **Python の前提確認**（M1-R1-009）: `venvBin()` は POSIX で `accessSync(X_OK)` により実行権限を確認する。Playwright アダプタは推奨コマンドが
  pytest を実行するため、`pytest` の存在も必須にする

## 改訂（v0.2.2、M1 独立レビュー R2）
- **venv の interpreter 自体も実行可能であること**（M1-R2-003、R1-009 の残り）: venv の検出を「`<venv>/bin/python` が実行可能」基準にし、
  `PythonContext.python`（実行可能な interpreter の相対パス）を全 Python アダプタが使う。python が非実行なら venv なしとして扱い、どのアダプタも
  available にならない
- **`artifacts/` 提案の判定を Git に委ねる**（M1-R2-005）: 行一致では `artifacts/` + `!artifacts/` の否定を見ない。Security Scan の
  `gitIgnoredByRepoRules()` を共用し、代表パス `artifacts/.aiqh-ignore-probe` が ignore されるかで決める。git リポジトリでない・git が失敗した場合は
  安全側に「追加を提案」し、`--write-gitignore` は同じ行が既にあれば追記しない（冪等）

## 改訂（v0.14.0、ROADMAP の項目 45）
- **node:test のローカルの証拠は script の本文**: Node の組み込みのテストランナー（node:test）は依存として入らないので、`hasLocalTool` の代わりに、`scripts.test`（次に `scripts.test:unit`）の単純コマンドのどれかが、実行位置の `node` と、Node 自身のオプションの `--test` を持つときだけ、アダプタ `node-test`（kind unit、`NODE_ADAPTERS` の jest の後）が `npm run <script>`（600 秒）を提案する。理由は `package.json scripts.<script> found (runs node --test)` で、本文は出さない（上の M1-R1-003 のまま）。script が無ければ `null`（unavailable の行を足さない。node:test を使わないプロジェクトの出力は変わらない）
- 規則は batch1 の設計（最終。`docs/reviews/batch1-design/design-final.md` の §2.4 と付録 A）。語の分け方は `src/command-words.ts`（引用符と `\` は語に印を付け、印の付いた語は実行位置・`--test` として照らさない。閉じていない引用符・`$(`・バッククォート・括弧・波括弧・`<<` を含む形は照らさない）
  - 環境変数の前置き（`名前=値`）は飛ばす。ただし `NODE_OPTIONS` の前置きは中を読まずに拒む
  - Node のオプションは名前と値に正規化して読む（`--name=value` と `--name value` は同じ）。`--test` の隣に置けるのは、値を取るオプションの固定の一覧（18）と、既知のブールの旗の固定の一覧（24）だけ。一覧に無い名前（`=` の形でも 2 語の形でも）、ブールの旗に付けた値、値のある `--test`、引用ありの `--test` があれば提案しない（B1-D-R3-001。未知のオプションでは Node が `bad option` の exit 9 で起動しない。手元の Node v24.13.1 で確かめた）。`-e`・`--eval`・`-p`・`--print`・`--`・`-` で始まらない語（スクリプトの位置）で読むのをやめる
  - 実行位置より後ろのすべての `-` で始まる語（引用ありの語、スクリプトの位置と `--` の後ろも）のうち、名前に `watch` を含むもの（監視のモードの check は verify の中で終わらない。B1-D-R2-002）と、別のファイルから Node のオプションや環境を読むもの（`--experimental-config-file`・`--experimental-default-config-file`・`--env-file`・`--env-file-if-exists`。init はそれらのファイルを読まない）があれば提案しない。別のファイルを読むオプションを見る範囲は、設計の規則 7c が範囲を書いていないので、7a の監視系と同じ「すべての語」にした（提案しない向き）
- 既知の限界（どれも「提案しない」向きで、unit は今までどおり NOT APPLICABLE。手で足す）: パスつきの `node`、`npx`・`env`・`cross-env` を挟んだ形、2 つの一覧に無いオプション（Node が知っているものでも。一覧は Node の版で変わりうる）、`--test=…`、監視系と別のファイルを読むオプションつき、照らさない形。vitest がローカルにあれば、`scripts.test` が `node --test` でも vitest の直接の実行が先に選ばれる（アダプタの順序。node-test は代替）。init から見えない `NODE_OPTIONS`（verify を走らせる環境）・npm の設定が足す Node のオプションは分からない（監視のモードで動いた check は `timeoutSec` で止まって FAIL）。引用符の中の展開（`"$(…)"`・`$VAR`）は照らさない形に入れていない（設計の付録 A のとおり）
- テスト: `tests/regression-item45-node-test-detection.test.ts`（設計 §2.6 の N1〜N8 と、2 つの一覧の各項目）、`tests/command-words.test.ts`（付録 A の分け方）。node:test の出力のパーサは範囲の外（`npm run test` は `no-parser`）

## 改訂（v0.14.1、B1-I140-R1-001）

- 実装レビュー batch1-v0140-impl R1 の B1-I140-R1-001（Low）を受けて、上の v0.14.0 の規則に 1 つ足す（人間の決定 2026-10-25）。値を取るオプションの一覧（18）の名前が、`=` の形でなく、**次の語を値として取る形**のとき:
  - 次の語が無い（コマンドの末尾）→ 提案しない（`null`）
  - 次の語が `-` で始まる（`-` 1 文字だけの語、引用ありの語も含む）→ 提案しない
- 理由: 提案しない向きは、init の提案が減るだけで、誤った提案を出さない（規則 7c と同じ向き）。Node がその語を実際に値として読むかどうかに頼らない。設計（最終）§2.4 の規則 4 は「次の 1 語が値（次の語が無ければ値なし）」という読み方だけを決めており、この規則は規則 6・7 と同じ「認めない」形の追加で、読み方は変えない
- 手元の Node v24.13.1 での照らし（空のディレクトリ・最小の環境・10 秒の上限。v0.14.0 と同じ方法）: `node --test --test-name-pattern`・`node --test --import`・`node --test-reporter --test`・`node --test --test-reporter --test`・`node --test-name-pattern -x --test` は、どれも exit 9 で起動せず、stderr の 1 行目は `node: <名前> requires an argument`（`-` で始まる語を値として読まない）。`node --test --test-name-pattern -` も同じ
- `=` の形は今までどおり（`--import=x` は値のある形）。**既知の限界**: 値が空の `=` の形（`--import=`・`--test-name-pattern=`）は、今も提案する（`=` の後ろが空なら空の値がある、という規則 4 のまま。手元の Node v24.13.1 は `node: --import= requires an argument` の exit 9 で起動しない）。この版では直さない
- テスト: `tests/regression-item45-node-test-detection.test.ts` の「B1-I140-R1-001 (v0.14.1)」（N5p・N5q の各形、18 個すべての「`--test` の後ろで末尾に値なし」と「値の位置に `--no-warnings`」、守りの N2d）
