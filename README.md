# ai-quality-harness (`aiqh`)

AI 駆動開発のための **fail-closed な Quality Gate 実行基盤**。

Claude Code などの実装 AI と、独立したレビュー AI の両方が「問題ありません」と言っても、
それだけでは合格にしません。Lint / 型チェック / ユニットテスト / ビルド / セキュリティスキャン /
依存関係スキャン / E2E といった **機械的に再現可能な結果** だけを判定の根拠にし、
必須チェックが 1 つでも失敗すれば `VERIFY FAILED`（終了コード非ゼロ）で止めます。

> **English summary** — `aiqh` is a small TypeScript CLI that runs a repository's quality checks
> from a single JSONC config, fails closed (any required failure ⇒ non-zero exit), writes JSON +
> Markdown reports with secret masking, and is designed to be applied to itself first.
> Only milestone 0 (the `verify` core) is implemented so far; see `docs/ROADMAP.md`.

## 設計思想

```
人間 → 実装AI → 独立レビューAI → 自動 Quality Gate（aiqh verify） → 人間の業務確認 → 本番
```

- **機械的根拠**: AI の回答は判定材料にしない。テスト・型・静的解析・ビルド・スキャンの結果だけを使う
- **fail closed**: 必須チェックの失敗・タイムアウト・起動失敗・設定不正はすべて非ゼロ終了
- **自己適用**: このリポジトリ自身が最初の適用対象。自分の verify を通せない状態でマイルストーンを終えない
- **設定に秘密を置けない**: 設定はコマンドと構造化フィールドのみ。レポートはパターンマスクを通してから保存

詳細は `docs/ARCHITECTURE.md`、判断の根拠は `docs/adr/` を参照してください。

## 現在の状態

**M2-2 進行中（波 3）・M3 の前半を開始（v0.6.1: `aiqh review-import` の独立レビュー R1 の Medium 3 件を直した〈名前付きの文字参照〈`&amp;` など 5 つを除く〉のあるレビューは exit 2 で何も書かない。その回の ID は HTML のコメントとタグを取り除いた形でも探す。`writeAtomic` の一時ファイルをランダムな名前で排他的に作り、リンクを追わずに書く。同じレビューの再取り込みでも既存のファイルと前の回を確かめる。ADR-0026 の追記〉。R2 を付ける。v0.6.0: `aiqh review-import` v1 を足した〈独立レビューの md の中の `aiqh-findings` の JSON のブロックを正本にし、本文の見出し・件数の行・その回の ID と食い違えば exit 2 で何も書かない。`docs/reviews/<label>/findings-r<N>.json` にすべて `open` で書く。`open` の件数は終了コードに反映しない。ADR-0026〉。依頼文のひな形〈`docs/ops/review-request-template.md`〉も足した。独立レビューを付ける。v0.5.45: 本体リポジトリの自己 CI を足した〈GitHub Actions。Ubuntu で `npm ci` → `npm run verify`。まだ必須チェックではなく、main への push で続けて 5 回緑になったらタグの前の条件にする。Windows は手動の測定だけ。ADR-0025〉。CODEOWNERS と、CI・Branch Protection の手順書〈`docs/ops/ci-and-branch-protection.md`〉も足した。CLI の動きは変えていない。これで波 2 を終えた。v0.5.44: 独立レビュー（バックログ 20）R1 の High 1 件に対応した〈Node を `--unhandled-rejections=warn` や `--abort-on-uncaught-exception` で動かすと Node・V8 が値を生のまま出すので、その起動を拒否して exit 2 で終える。ADR-0024 決定 6〉。R2 を付ける。v0.5.43: 構造ガード（brand-guard）の広げの抜けを閉じた〈ブランドを持つ入れ物を、文脈の型のあるすべての位置で、深さの上限なしに比べる。テストの構造だけで、動きは変えていない〉。独立レビューを付ける。これで波 1〈v0.5.40〜v0.5.43〉を終えた。v0.5.42: 処理されなかった例外・promise の拒否で、1 行を出口から出し〈マスク〉、実行中のチェックを片付けてから終了コード 2 で終えるようにした〈以前は Node の既定の表示で exit 1、チェックが残った。シグナルが先なら 130 / 143 のまま。ADR-0024〉。独立レビューを付ける。v0.5.41: masker の url-credential を、正規表現でなく「://」を手がかりにした線形の走査にした〈同じ一致・同じ置換。scheme の長さは無制限のまま。64 KiB で数秒かかった形が 1 ms 未満〉。同じ秒に始まった 2 つの verify が同じ履歴の名前を取らないよう、名前を排他的に確保するようにした〈後の方が前の履歴を黙って上書きしえた〉。独立レビューを付ける。v0.5.40: rest2 の計画〈5 つの波〉の波 1 の最初の版。記録の整理だけ〈docs と `CLAUDE.md`。36 を計測の結果で閉じ、13・19 の (c) の数字に注記。CONFIG_SPEC の `review` の欄を外し、日付と例を直した〉。動きは変えていない。v0.5.39: v0.5.38 の独立レビュー（28・5・34）R1〈High 0・Medium 1〉に対応した〈文書とコメントだけ。確認の 25 ms・50 ms はタイマーの設定値で、番号の再利用の窓の上限ではない、と訂正した。動きは変えていない〉。訂正だけを確かめる R2 を付ける。v0.5.38: 信号の経路に触れる残りのバックログを片付けた〈leader が先に終わって出力の pipe が残るとき、leader の終了の後からグループの消滅を確かめる。最初のシグナルが再利用された番号へ届く窓を、消滅から次の確認が実際に走るまでに縮めた〈閉じてはいない。25 ms は確認のタイマーの設定値で、上限ではない〈v0.5.39 で訂正〉。[ADR-0023](docs/adr/0023-unconfirmed-termination-is-not-terminated.md) への追記〉。`test:minpath` を見張り役のプロセスグループで動かし、止まったときに vitest の子孫と一時ディレクトリを残さない〉。終了コード・レポートの欄は変わらない。バックログ 23 の独立レビュー R1〈High 0・Medium 0・Low 1〉で 23 のレビューを終え、Low〈境界のテスト〉を足した。v0.5.37: 残りのバックログのうち信号の経路に触れないものを片付けた〈`package.json` の形の確認、security-scan の root の文言、git の失敗の `unknown` 表示、review-packet の kind `symlink`、root の外を指す symlink への init の書込の拒否、`test:minpath` の最小の環境〉。残りは記録で閉じた。v0.5.36: v0.5.35 の独立レビュー R3〈Low 1〉と、実装者の自レビュー〈S-1〜S-6。独立ではない〉に対応した〈[ADR-0023](docs/adr/0023-unconfirmed-termination-is-not-terminated.md) への追記。グループへ送れず子が既に無いときも、グループの errno を残す〈`errorSummary` が「could not be signalled」になる〉。`terminateActiveChildren` が猶予の間に全グループを調べる。直接送信が ESRCH を返した leader の pid へは、以後送らない〈実装者が信号の経路の一覧の作成中に見つけた〉。終了コード・レポートの欄は変わらない。このバックログの独立レビューは R3 で終えた〉。v0.5.35: v0.5.34 の独立レビュー R2〈High 1・Medium 1〉に対応した〈[ADR-0023](docs/adr/0023-unconfirmed-termination-is-not-terminated.md) への追記。一度「消えた」と確認したプロセスグループの leader へも、子の pid への直接送信をしない〈v0.5.34 は、グループへの送信を飛ばした後、そのまま直接送信に落ちていた。実際の Node では到達しにくい〉。`close` 未着の待ちの起点の説明を、コードに合わせて訂正した〈SIGKILL の前にグループが消えたときは消滅の最初の確認から、SIGKILL を送った後は SIGKILL の時刻から。実装は変えていない〉。利用者に見える変更は無い〉。v0.5.34: v0.5.33 の独立レビュー R1〈High 1・Medium 1〉に対応した〈[ADR-0023](docs/adr/0023-unconfirmed-termination-is-not-terminated.md) への追記。一度「消えた」と確認したプロセスグループへ、以後 signal 0 も SIGKILL も送らない〈以前は、消えたと分かっているグループの番号へも SIGKILL を送った。v0.5.32 から同じ性質があり、v0.5.33 は条件を狭めたが残っていた。OS が同じ番号を別のグループへ再利用していれば、無関係なグループへ届きうる〉。安全弁との関係の表現を狭めた〈定数の関係で、レポートが先に書かれる保証ではない。実装の動きは変えていない〉。利用者に見える変更は無い。独立レビューの 2 回目〈r2〉の指摘は上の v0.5.35 で対応した〉。v0.5.33: バックログ 16・2 を解消し、19 の (a)(b) を直した〈[ADR-0023](docs/adr/0023-unconfirmed-termination-is-not-terminated.md)。`src/runner/execute.ts` ほか。タイムアウト・中断の後、チェックのプロセスグループが消えたことを確かめてから結果を確定し、SIGKILL の後は最大 2 秒で打ち切って、消えていなければ `errorSummary` に `process group still present 2000ms after SIGKILL` と書く〈以前は確認の有無にかかわらず常に `process group terminated`。別のプロセスグループへ移った孫が出力の pipe を握ると、孫が終わるまで返らなかった〉。kill が EPERM で失敗したとき `spawn failed` で早く確定していたのをやめた。終了コードとレポートの欄は変わらない。別のプロセスグループへ移った子孫は止められない〈保証の外〉。独立レビューを 1 回付ける〉。v0.5.32: バックログ 8 の D グループ（O6。バックログ 8 の最後）を解消した〈[ADR-0022](docs/adr/0022-unreadable-is-not-absent.md) への追記。`init` は、`package.json`・`tsconfig.json`・`pyproject.toml` などが、読めない・dangling symlink・ディレクトリ・JSON として不正のとき、または root の一覧・通常ファイルの下の入口が調べられないとき、その入口が無いものとして監査せず、`aiqh init: cannot audit <root>: <entry> …` で exit 2 にする〈以前は exit 0 で、`--write` は lint・typecheck・build などを含まない設定を書き、`--write-scripts` は何も言わずに終わった〉。何も書かない。`verify`・`security-scan`・`review-packet`、既存の設定、健全なリポジトリの `init` は変わらない。独立レビューは付けていない〉。バックログ 8 は完了。v0.5.31: バックログ 8 の C グループ（O3・O4・O5・O9）を解消した〈[ADR-0022](docs/adr/0022-unreadable-is-not-absent.md) への追記。失敗を「無い」「違う」にしない。verify は、git が実行できない・timeout・失敗のとき `git: unavailable (<理由>)` と表示する〈報告の JSON の `git` は null のまま。終了コードは変わらない〉。review-packet は、git が ref の解決・work-tree の確認で失敗したとき git の 1 行を添える〈終了コード 2 のまま〉。check の cwd が読込の後で辿れなくなったときは `working directory cannot be examined: <dir> (<code>)`〈終了コード 1 のまま〉。init は、root が辿れないとき `directory cannot be examined`、**通常ファイルのときは exit 2**〈以前は exit 0 で監査〉にし、dangling や輪の `.gitignore`・`.git` を「無い」と言わない。設定の読込のエラーで同じパスが 2 回出ていた文面を 1 回にした。独立レビューは付けていない〉。v0.5.30: バックログ 8 の B グループ（P3・P11・P4）を解消した〈[ADR-0022](docs/adr/0022-unreadable-is-not-absent.md) への追記。`src/cli.ts`・`src/commands/review-packet.ts`・`src/review/packet.ts` の変更。`package.json` が無い・読めない・version が不正なときは、すべての入口〈`--help`・`init` を含む〉が exit 2〈以前は `0.0.0` として動き、レポートと「Generated by」にも `0.0.0` と書いた。通常の install では影響なし。`dist/` だけをコピーした環境は `package.json` も一緒にコピーする〉。review-packet は、git が ref の解決で失敗したとき、tag object を省いた packet を黙って書かず exit 2 にする〈ref は 1 回だけ引く。通常の入力の packet は変わらない〉。書込の失敗の exit 2 のメッセージは、辿れないが残っている一時ファイルも挙げる。独立レビューは付けていない〉。v0.5.29: バックログ 8 の A グループ（O2・O7・O8）を解消した〈[ADR-0022](docs/adr/0022-unreadable-is-not-absent.md)。`src/config/load.ts` と `src/commands/init.ts` だけの変更。権限で辿れない・通常ファイルの下を通る `cwd`・`output.dir` を読込で exit 2 にする〈ENOENT だけが「無い」。`cwd` のケースは exit 1→2〉。init は、dangling symlink の設定・`.gitignore` への `--write`・`--write-gitignore` を、何も作らず exit 2 で拒否する〈`--force` でも〉。CI で `== 1` だけを失敗とみなしている場合は `!= 0` で見ること。独立レビューは付けていない〉。v0.5.28: バックログ 3・7・4〈テスト基盤の穴〉を解消した〈`src/` は変えていない。オプション一覧の比較が short 別名と値の必須も見る、関数型へのアサーションの検出に名前空間のメンバー・オブジェクトのプロパティ・`string | Checked` を足す、外部コマンドの probe は 1 ツール 1 変数で tool 名を含むだけの変数は probe ではない、の 3 つ。利用者に見える変更は無い。独立レビューは付けていない〉。v0.5.27: バックログ 11「使い方エラーを exit 2 に揃える」を解消した〈ADR-0021。`src/cli-program.ts` だけの変更〉。使い方エラー〈未知のコマンド・オプション、値や必須の引数の欠落、余分な引数、コマンドなしの `aiqh`〉の終了コードを、verify・init・security-scan と本体でも 2 にした〈review-packet は元から 2。メッセージ・出力先は同じで、`--help`・`--version` は 0〉。CI で `== 1` だけを失敗とみなしている場合は `!= 0` で見ること。独立レビューは付けていない。v0.5.26: バックログ 9・10 の独立レビュー 2 回目〈上限の最後〉は新しい指摘 High 1 / Low 1〈`src/` に実在する漏れは 0〉、R1-001 の残りは stream。`truncate` 系〈延長すると NUL が入る〉を書き込み箇所の一覧に入れ、`createWriteStream` の call が表との差分になることをテストで固定し〈stream に渡す内容は検査しない〉、docs の `options.env` の件数を現在の状態に揃えた〈tests と docs だけの版。`src/` は変えていない〉。この最終修正は独立した再レビューを受けていない〈3 回目は行わない〉。v0.5.25: バックログ 9・10 の独立レビュー 1 回目は High 2 / Medium 1 / Low 1〈`src/` に実在する漏れは 0〉。書き込み箇所のテストを、正規表現の判定から、既知の箇所を 1 件ずつ明示した表との照合に作り直し〈`writev`・`writevSync`・`cp` を一覧に足した。stream は既知の限界、`FileHandle` は入口で塞がれている〉、`executeCommand` に渡した `env` も `checkEnv()` を通すようにし〈`src/runner/execute.ts` の +2／−1 行〉、Markdown の `\u{HEX}` が元の文字列と区別できないことを既知の限界に書いた〈ADR-0020〉。独立レビューの 2 回目は差分〈v0.5.24..v0.5.25〉だけで、これが上限。v0.5.24: バックログ 9「ファイルへの出力の禁止文字」と 10「check に NO_COLOR」を解消した〈ADR-0020。`src/` を変えた版〉。verify のレポートと init の設定に、禁止文字を書く直前に形式別に表記にして残す〈JSON は `\uXXXX`、Markdown は `\u{HEX}`。review-packet は fail closed のまま〉。Markdown の構造の崩れ〈フェンス・LF〉も直した。check の環境から `FORCE_COLOR`・`PY_COLORS` を除き `NO_COLOR=1` を足す。独立レビューの 1 回目を受けた〈上の v0.5.25〉。v0.5.23: M2-2 独立レビュー builtin-r6 は High 4 / Medium 0 / Low 0〈R5-001〜004 は解消 2・部分的に解消 2〉。構造ガードが、fs・child の関数を名前で export する形〈再 export〉、`Utf8Stream` を値として import する形、listener の登録を `process["on"]` と書く形、shorthand property・class field・何段もの別名を経由した listener を違反にした〈ADR-0019 の決定 7 と入口の表。tests と docs だけの版。`src/` は変えていない〉。レビューは r6 で終わり、この最終修正は独立した再レビューを受けていない〈自己 verify と回帰テストで確認〉。v0.5.22: M2-2 独立レビュー builtin-r5 は High 2 / Medium 1 / Low 1〈R4-001〜006 は解消 5・部分的に解消 1〉。構造ガードが、fs・child の関数の束を作る import の形〈default import・`import * as`・`{ promises }`・`export *`・動的 `import()`〉を違反にし〈値の入口を塞ぐ〉、`fd` を取る API の options を新しい object literal に限り、listener の `this` の直接の形と計算されたキーの wrapper を直した〈ADR-0019 の決定 7 と入口の表。tests と docs だけの版。`src/` は変えていない〉。独立レビューは m2-2-builtin-r6 を最後の 1 回とする。v0.5.21: M2-2 独立レビュー builtin-r4 は High 4 / Medium 2 / Low 0〈R3-001〜008 は解消 5・部分的に解消 3〉。構造ガードが、型を union・intersection・型パラメーターの枝まで分解し、fs・child の関数を要素アクセス・分割代入でも参照として見るように直した〈ADR-0019 の決定 7。表は、棚卸しした許可の分岐で、すべての許可の一覧ではない〉。条件型・mapped type の総称型の cast などは既知の限界に書いた〈tests と docs だけの版。`src/` は変えていない〉。v0.5.20: M2-2 独立レビュー builtin-r3 は High 7 / Medium 1 / Low 0〈M2-2-BUILTIN-R2-001 は解消〉。許可の根拠が名前・型に基づく箇所を直した〈writer と生成者の認可は最上位の宣言の名前、`stdio` の後ろの spread、fs・child の関数は callee だけ、など。ADR-0019 の決定 7 の表〈v0.5.21 で、表は棚卸しした許可の分岐で、すべての許可の一覧ではないと範囲を狭く明記した〉〉。EventEmitter の `this` などは既知の限界に書いた〈tests と docs、依存関係の 1 件だけの版。`src/` は変えていない〉。v0.5.19: M2-2 独立レビュー builtin-r2 は High 1 / Medium 0 / Low 0〈M2-2-BUILTIN-R1-001 は解消〉。High 1 件〈M2-2-BUILTIN-R2-001: 要素アクセスなどの許可の判定が、キーの型だけを根拠にしていた〉を直した。構造ガードは、要素アクセスのキーなどの許可の根拠を型でなく構文にした〈ソース上の文字列リテラルだけを安全とする。tests と docs だけの版。`src/` は変えていない〉。v0.5.18: M2-2 独立レビュー builtin-r1 は High 0 / Medium 1 / Low 0〈M2-2-R4-002 は部分的に解消〉。Medium 1 件〈M2-2-BUILTIN-R1-001: キーの型が 1 つの文字列リテラルに決まる `process[key]` で `process` のメンバーを取る形を検出しない〉を直した。構造ガードは、キーの型でメンバーが分かるときも、メンバーの名前で違反にする〈tests と docs だけの版。`src/` は変えていない〉。v0.5.17: 構造ガードが、`src/` が実行時に読み込むモジュールを一覧で限り〈組み込みは `node:` 付きの 6 つ〉、`process` の 6 つのメンバー〈`getBuiltinModule` など〉を違反にする〈バックログ 1、M2-2-R4-002。ADR-0019。`src/` は変えていない〉。バックログは番号を詰めず、未処理の例外の表示を 20 に足した。v0.5.16: M2-2 の CLI の catch の独立レビュー R2 は High 0 / Medium 0 / Low 0〈R1-001 は解消〉。CLI の最上位の catch の作業を R2 で終えた〈docs だけの版〉。v0.5.15: M2-2 の CLI の catch の独立レビュー R1 は High 0 / Medium 1 / Low 0。Medium 1 件〈新しい回帰テストの子プロセスの後始末、M2-2-CLI-CATCH-R1-001〉を直した。テストは実行を自分で持ち、失敗・タイムアウトのときも `afterEach` の中で CLI を止めてから一時ディレクトリを消す〈tests だけの版〉。v0.5.14: CLI の最上位の catch を直した。投げられた値を調べると例外になる値でも、catch から例外を出さずに固定の文にして exit 2〈生の文字列は出さない〉。普通の値の出力は変わらない。バックログは 1 を外し、2〜20 は 1〜19 になった。v0.5.13: M2-2 独立レビュー R8 は High 0 / Medium 0 / Low 0〈R7-001〜003 は解消〉。`safeJson()` のレビューを R8 で終えた〈docs だけの版〉。v0.5.12: `safeJson()` の Proxy のときの不足〈M2-2-R7-001〜003〉を直した。配列の `length` とキーを記述子で正確に確かめ、値を調べる操作が投げたら投げられた値を読まずに固定の拒否にする〈exit 2〉。今の通常の出力は変わらない。見つけた CLI の最上位の catch の件はバックログの 1。v0.5.11: M2-2 独立レビュー R7 は High 0 / Medium 3 / Low 0〈R4-001 は解消〉。`safeJson()` の作業〈v0.5.10〉をここで区切り、Medium 3 件〈Proxy のときの不足〉はバックログの先頭へ〈docs だけの版〉。v0.5.10: `safeJson()` の入力を JSON のデータに限った〈M2-2-R4-001、[ADR-0018](docs/adr/0018-safejson-json-data-only.md)〉。JSON のデータでないもの〈関数・`undefined`・getter など〉は、出力の前に拒否して exit 2。今の通常の出力は変わらない。バックログは 1 を外し、2〜20 は 1〜19 になった。v0.5.9: M2-2 独立レビュー R6 は High 0 / Medium 0 / Low 0〈R5-001 は解消〉。テストの失敗の経路の後始末〈M2-2-R5-001〉の作業〈v0.5.8〉をここで区切った〈docs だけの版〉。v0.5.8: テストの失敗の経路の後始末〈M2-2-R5-001〉を直した。テストは始めたものを、失敗・タイムアウトのときも `afterEach` の中で止める〈tests だけの版〉。バックログは 1 を外し、2〜20 は 1〜19 になった。v0.5.7: M2-2 独立レビュー R5 は High 0 / Medium 1 / Low 1。テストの不安定と M2-2-FLAKE-001 の作業〈v0.5.6〉をここで区切り、Medium 1 件〈テストの失敗の経路の後始末〉はバックログの先頭へ、Low 1 件〈ARCHITECTURE の出力の末尾の文言〉は直した〈docs だけの版〉。v0.5.6: 自己 verify の不安定なテスト〈unit-minpath〉を、事象の順を観測で決める形に直した。その調査で見つけた runner の不具合〈中断の後の猶予の間にタイムアウトの時刻が来ると `timedOut` が true になる。M2-2-FLAKE-001〉を修正。バックログは 1 を外し、R4 の 2 件は 1・2 になった。v0.5.5: M2-2 独立レビュー R4 は High 0 / Medium 2。出力の出口の強化〈v0.5.2〜v0.5.4〉をここで区切り、Medium 2 件と構造ガードの既知の限界はバックログの 2・3 へ。リリースの検証で見つかった不安定なテスト〈unit-minpath〉はバックログの先頭へ〈docs だけの版〉。v0.5.4: M2-2 独立レビュー R3 の Medium 3 件を修正。端末への 1 回の書き出しを 1 行にし〈LF・TAB も表記〉、複数行はコマンド自身の書式だけを block で書く。JSON のキーも表記・mask にし、端末に書くのは 2 つの基本関数だけにした〈[ADR-0017](docs/adr/0017-output-lines-blocks-keys-guard.md)〉。v0.5.3: M2-2 独立レビュー R3 は High 0 / Medium 3。M2-1 からの持ち越し作業〈v0.5.0〜v0.5.2〉をここで区切り、Medium 3 件はバックログへ〈docs だけの版〉。v0.5.2: M2-2 独立レビュー R2 を反映。すべてのコマンドの端末への出力を 1 つの出口に通し、制御・区切り・双方向制御文字を表記にしてから秘密の形をマスクする〈R2-001、[ADR-0016](docs/adr/0016-output-boundary.md)〉。v0.5.1: M2-2 独立レビュー R1 を反映。読めない `latest.json` と既定の設定ファイルを「無い」として扱わない〈R1-007 を High として修正〉、`--range` に finding があっても範囲に依存しない検査を行う〈R1-001〉。v0.5.0: M2-1 独立レビュー R3 の Medium 5 件を修正。終了コードの優先順位は [ADR-0015](docs/adr/0015-review-packet-exit-priority.md)、自己 verify は 8 チェック）**。M2-1 は完了（`aiqh review-packet`: 完了ベースライン `v0.4.3`、完了記録 `v0.4.4`。独立レビュー R1〜R4 を反映し、R3 の Medium 5 件は M2-2 の先頭として v0.5.0 で修正。仕様は [ADR-0014](docs/adr/0014-review-packet.md)、総括は [`docs/reports/M2-1_COMPLETION.md`](docs/reports/M2-1_COMPLETION.md)）。M2-0「スキャナ保守」は完了（完了ベースライン `v0.3.3`、記録タグ `v0.3.4`。独立レビュー R1〜R3 を反映し、R4 の 1 件は M2-1 以降へ持ち越し。[`docs/reports/M2-0_COMPLETION.md`](docs/reports/M2-0_COMPLETION.md)）。v0.3.5 で不安定テストを修正し、バックログの順序を review-packet 優先に変更した（「窓走査は正規表現の境界の文脈を保つ」はその後）。M1（完了ベースライン `v0.2.2`、記録タグ `v0.2.3`）では`aiqh verify` の中核（M0、独立レビュー 7 ラウンドを反映した最終版 v0.1.7）に加えて、
チェックアダプタ、`aiqh init`、内蔵の `aiqh security-scan` を実装し、Node 系と Python 系の対象リポジトリに適用済みです。
M1 の独立レビュー R1（10 件、High 3）を v0.2.1、R2（5 件、High 1）を v0.2.2 で反映し、R3（5 件、High 0）は M2-0 へ持ち越しました。
各タグの内容は [`CHANGELOG.md`](CHANGELOG.md)、M0 の総括は [`docs/reports/M0_COMPLETION.md`](docs/reports/M0_COMPLETION.md)、
M1 の総括は [`docs/reports/M1_COMPLETION.md`](docs/reports/M1_COMPLETION.md)（経緯は [`docs/reports/M1_REPORT.md`](docs/reports/M1_REPORT.md)）を参照してください。
**v0.1.3 と v0.2.0 は superseded**（v0.1.3: 確定点の yield が不十分。v0.2.0: 自己 verify の security チェックが FAIL する状態でタグ付けされた）で、
それぞれ v0.1.4 以降 / v0.2.1 以降を使ってください。

| 機能 | 状態 |
|---|---|
| `aiqh verify`（設定読込・順次実行・fail closed・JSON/Markdown レポート・秘密情報マスク） | M0 実装済み |
| チェックアダプタ（lint / typecheck / unit / build / security / dependency / e2e の検出と推奨設定） | M1 実装済み |
| `aiqh init`（対象リポジトリの監査と設定生成） | M1 実装済み |
| `aiqh security-scan`（内蔵。masker とパターン共有） | M1 実装済み |
| Security Scan の保守（候補の持ち越し、追跡済み `.gitignore`、実生成物のプローブ、`security.allow`、key-value 走査、設定化） | M2-0 実装済み |
| `aiqh review-packet`（commit 範囲から独立レビュー用パケットを生成。全文・差分・検査内蔵・ZIP） | v0.6.1（M2-2: 独立レビュー R1〜R8 を反映〈R3 の 3 件は v0.5.4、R5 の Medium 1 件は v0.5.8 で直し R6 で解消と判定、R4-001 は v0.5.10 で直し R7 で解消と判定、R7 の Medium 3 件は v0.5.12 で直し R8 で解消と判定。R4-002 は v0.5.17 で直し、builtin-r1 の Medium 1 件は v0.5.18 で、builtin-r2 の High 1 件は v0.5.19 で、builtin-r3 の High 7・Medium 1 件は v0.5.20 で、builtin-r4 の High 4・Medium 2 件は v0.5.21 で、builtin-r5 の High 2・Medium 1・Low 1 件は v0.5.22 で、builtin-r6 の High 4 件は v0.5.23 で直した。v0.5.24 でバックログ 9・10〈ファイルへの出力の禁止文字、check の環境〉を解消し、v0.5.25 でその独立レビュー 1 回目の High 2・Medium 1・Low 1 件を、v0.5.26 で 2 回目〈上限の最後〉の High 1・Low 1 件と stream の残りを直し、v0.5.27 でバックログ 11〈使い方エラーを全コマンドで exit 2 に〉を、v0.5.28 でバックログ 3・7・4〈テスト基盤の穴〉を、v0.5.29 でバックログ 8 の A グループ〈O2・O7・O8〉を、v0.5.30 で B グループ〈P3・P11・P4〉を、v0.5.31 で C グループ〈O3・O4・O5・O9〉を、v0.5.32 で D グループ〈O6。バックログ 8 は完了〉を解消した。v0.5.33 でバックログ 16・2〈ADR-0023。タイムアウト・中断の後のプロセスグループの消滅の確認〉と 19 の (a)(b) を、v0.5.34 で独立レビュー R1 の指摘〈消えたと分かったグループへ以後何も送らない〉を、v0.5.35 で独立レビュー R2 の指摘〈消えたと分かったグループの leader へも直接送らない。`close` 未着の待ちの起点の文書の訂正〉を、v0.5.36 で独立レビュー R3 の指摘〈グループの errno を残す〉と自レビューの指摘〈全グループを調べる。消えた leader の pid へ以後送らない〉を直した〉。v0.5.37 でシンボリックリンクを kind `symlink` にした。v0.5.0 で M2-1 R3 の Medium 5 件を修正。M2-1 完了は完了ベースライン v0.4.3、記録 v0.4.4） |
| `aiqh review-import`（レビュー指摘の構造化）と再修正ループ | v0.6.0 で取り込み（v1）を実装（ADR-0026）。状態の検査・前の回の状態の引き継ぎ・ループ未完了の表示は v2、再修正ループの手順書は後 |
| 本体リポジトリの自己 CI（GitHub Actions。Ubuntu の verify、Windows の手動の測定） | v0.5.45（M3 の前半。まだ必須チェックではない。ADR-0025） |
| GitHub Actions 再利用ワークフロー | M3 予定 |
| 履歴 DB・ローカルダッシュボード | M4 予定 |

## 必要環境

- Node.js 24 以上（開発時はネイティブ TypeScript 実行を使うため）
- 自己 verify の `package` チェック（配布 smoke test）は `npm pack` した tarball を一時ディレクトリへ
  `npm install --prefer-offline` するため、実行時依存 3 つ（commander / jsonc-parser / zod）が **npm キャッシュにあるか、
  レジストリへ到達できる**必要があります。オフラインかつキャッシュなしの環境ではこのチェックは FAIL になります
  （fail closed）。`npm audit` も同様にレジストリへの到達が必要です

## 対応プラットフォーム（Supported Platforms）

| プラットフォーム | 状態 |
|---|---|
| macOS（POSIX） | 対応。M0 の検証環境 |
| Linux（POSIX） | 対応。v0.5.45 から自己 CI（Ubuntu 24.04）で verify を走らせている（まだ必須チェックではない） |
| Windows | M0 対象外。プロセスグループ制御と realpath 判定が POSIX 前提のため（v0.5.45 の CI の手動の測定では、8 チェックのうち 3 つが FAIL。ROADMAP の M3） |

## 信頼境界（Trust Boundary）

`aiqh.config.jsonc` は**リポジトリ所有者が管理する信頼された入力**です。設定に書いたコマンドはそのまま
shell で実行されます（`package.json` の scripts と同じ信頼レベル）。aiqh が保証する fail closed は
「現在読み込んだ設定に対して」のものであり、**改変された設定や弱体化されたスクリプトに対する独立性は
提供しません**。設定ファイルの変更はコードレビューと Branch Protection で守ってください。
設定改変への対策候補は `docs/ROADMAP.md`（M3 / M4）を参照してください。

`aiqh review-packet` の出力について: aiqh の実行中に、出力先（`-o`・`--zip-output`）とその親ディレクトリを他のプロセスや利用者が同時に変更しないこと。パケットと ZIP が同じファイルにならないことはファイルシステムの同一性（`dev`+`ino`）で確かめますが、
その確認は書き込みの確定の直前の時点のもので、それ以降に他者が出力先を差し替える場合は防げません（ADR-0014）。

## 使い方

### このリポジトリ自身を検証する

```bash
# 依存関係の導入
npm install

# 自己 verify（src/ を Node のネイティブ TypeScript 実行で直接起動）
npm run verify

# ビルド済み JS（配布物）で同じことを行う
npm run verify:dist
```

結果は `artifacts/verification/` に出力されます（git 管理外）。

```
artifacts/verification/
  latest.json            # 機械可読（schemaVersion 1）
  latest.md              # 人間・レビューAI 向け
  history/<UTC timestamp>.json
```

### 対象リポジトリで使う（M1: `npm link` によるローカル配布）

```bash
# 本体で 1 回: ビルドしてグローバルにリンク（~/.local/bin/aiqh -> dist/cli.js）
cd ~/claude-projects/ai-quality-harness && npm run build && npm link

# 対象リポジトリで: 読み取り監査と設定案の表示（何も書かない）
aiqh init

# 承認したら書き込む（config のみ。既存があれば --force なしでは拒否）
aiqh init --write
# 追加で .gitignore に artifacts/、package.json に "verify": "aiqh verify" を入れる場合
aiqh init --write --write-gitignore --write-scripts

# 検証と、内蔵の秘密情報スキャン単体
aiqh verify
aiqh security-scan
```

`aiqh init` は `aiqh` を PATH のどこから解決したか（リンク先と version）を表示します。生成される `aiqh.config.jsonc` の例：

```jsonc
{
  "version": 1,
  "project": { "name": "my-app", "type": "node" },
  "defaults": { "timeoutSec": 600 },
  "checks": [
    { "name": "lint",       "kind": "lint",       "command": "npm run lint" },
    { "name": "typecheck",  "kind": "typecheck",  "command": "npx --no-install tsc --noEmit" },
    { "name": "unit",       "kind": "unit",       "command": "npm test" },
    { "name": "build",      "kind": "build",      "command": "npm run build", "timeoutSec": 900 },
    { "name": "dependency", "kind": "dependency", "command": "npm audit --audit-level=high" }
    // security / e2e を登録しなければ NOT_APPLICABLE として報告される
  ]
}
```

仕様は `docs/CONFIG_SPEC.md`、配布方針は `docs/adr/0009-distribution-npm-link.md` を参照してください。

- `aiqh init` はツールの設定ファイルだけでは check を提案しません。ローカルに依存（`package.json` の dependencies /
  devDependencies、または `node_modules/.bin`）がある場合だけ提案し、直接実行は `npx --no-install <tool>` の形にして
  ネットワーク取得を起こしません。監査表・設定案・`--json` には package.json のスクリプト本文を出しません
- `aiqh init --write` は生成した設定を `aiqh verify` と同じ検証に通し、通らない設定（必須チェック 0 件等）は書きません。
  `--write-gitignore` / `--write-scripts` の失敗は exit 2 で報告されますが、他の書込は取り消されません（`git status` で確認）
- `aiqh init --write` / `--write-gitignore` は、書込先（`aiqh.config.jsonc`・`.gitignore`）が dangling symlink（リンク先が未作成）のとき、
  リンク先を作らずに exit 2 で拒否します（`--force` でも。リンクを消すか、リンク先を作ってください）。v0.5.37 からは、書込先（`--write-scripts` の `package.json` も）が
  プロジェクトの外を指す symlink のときも、書かずに exit 2 で拒否します（プロジェクトの中を指す symlink は、従来どおりリンク先に書きます）
- Security Scan は git 追跡ファイルに加えて、未追跡で ignore されないファイルも走査します（サイズ上限なし。1 行が 256 KiB を
  超えるファイルは窓走査でメモリを抑えます）。未追跡で ignore されていない `.env*` は中身を読まずに finding にします。複数行の
  PEM 秘密鍵は開始行–終了行で報告し、`.gitignore` の判定は `git check-ignore` に委ねます（否定ルールを考慮）。
  検出結果に値は含めません（分類・パス・行番号のみ）
- `aiqh init` の `artifacts/` 提案も `git check-ignore` で判定します。git リポジトリでない場合は常に追加を提案し、
  `--write-gitignore` は同じ行を二度追記しません
- 同梱の JSON Schema は構造の検証・補完用です。チェック名の一意性や必須チェック 1 件以上といった横断規則は `aiqh` が
  実行時に検証します（エディタで valid でも `aiqh` が拒否することがあります）
- `security.allow`（M2-0）で秘密の形の finding を理由つきで許容できます（`path` glob、`category`、`line`、必須の `reason`、任意の `expires`）。
  抑制した finding は件数と一覧が必ず出力され、未使用・期限切れの規則は警告されます。`.env` や `.gitignore` の衛生 finding は抑制できません。
  key-value 分類（`password=…` 等）も走査しますが、値が秘密らしい場合だけ finding になります（英字のみのパスフレーズは検出できません）

## CLI

```
aiqh verify [options]
  -c, --config <path>      設定ファイル（既定: ./aiqh.config.jsonc）
      --cwd <dir>          設定ファイルを探す基準ディレクトリ
  -o, --output-dir <dir>   レポート出力先の上書き
      --fail-fast          必須チェックの最初の失敗で停止（以降は SKIPPED）
  -v, --verbose            失敗チェックの出力を全文表示

aiqh init [--cwd <dir>] [--write] [--force] [--write-gitignore] [--write-scripts] [--json]
aiqh security-scan [--cwd <dir>] [--json]

aiqh review-packet --range <from>..<to> [options]
      --label <name>         タイトルとファイル名（a-z 0-9 . -。既定: <to> の先頭 12 桁）
  -o, --output <file>        既定: <repo>/artifacts/ai-review/review-packet-<label>.md
      --zip                  パケットだけを含む ZIP（無圧縮）も書く / --zip-output <file> で場所を指定
      --request <file|->     人間が書いた依頼文（そのまま載せる。- は標準入力）
      --review <file>        前回レビューの原文（複数可）
      --doc <path>           <to> 時点の全文を載せるリポジトリ内の文書（複数可）
      --exclude <glob>       全文・差分から除く（一覧には excluded として残る。複数可）
      --max-file-bytes <n>   1 ファイルの上限（既定 524288。超えると exit 2）
      --max-packet-bytes <n> パケット全体の上限（既定 4194304。超えると exit 2）
  -c, --config <path>        security セクション（security.allow）を読む設定ファイル
      --json                 結果を JSON で出力

aiqh review-import <review.md> --label <label> --round <n> --id-prefix <prefix> [--allow-missing-previous] [--cwd <dir>]
                             独立レビューの md（aiqh-findings の JSON のブロック 1 つ）を docs/reviews/<label>/findings-r<n>.json に取り込む
```

相対パス（`--request` / `--review` / `--config` / `-o` / `--zip-output`）は `--cwd` のディレクトリ（省略時はカレント）を基準に解決します。
`--config` を省略したときは `--cwd` のディレクトリの `aiqh.config.jsonc` を読み、無ければ既定値、あるのに読めない・不正なら `2` です（`aiqh security-scan` も同じ。v0.5.1）。
`aiqh review-packet` の終了コード: `0` = 書いた、`1` = 不正な UTF-8・生の制御 / 区切り / 双方向制御文字・秘密の形のいずれかを検出（何も書かない。
値は表示しない）、`2` = 使い方・設定・検査不能（読めない入力、作業ツリー外、git の失敗など）・上限・書込のエラー。検査そのものができないときは finding があっても
`2` で、それまでの finding を「検査が完了していないため不完全」と明記して出します。上限超過など検査を妨げないエラーは finding が無いときだけ `2` です（ADR-0015）。
`<from>` は `<to>` の祖先であること。lock ファイルは既定で全文・差分を載せない（ADR-0014）。
`aiqh review-import`（v0.6.0、ADR-0026）: レビューの中の `aiqh-findings` の JSON を正本にし、本文の `### <ID>` の見出し・`## 全体の結論` の件数の行・その回の ID と突き合わせます。食い違い・読めない入力・前の回の findings のファイルが無い（`--allow-missing-previous` を除く）・読めないときは `2` で何も書きません。取り込んだ指摘はすべて `open` で、`open` の件数は表示するだけで終了コードには反映しません（`0` = 取り込んだ・同じレビューを取り込み済み）。依頼文のひな形は `docs/ops/review-request-template.md` です。
`<review.md>` を相対パスで書いたときは、`--cwd` のディレクトリ（省略時はカレント）を基準に解決します。v0.6.1: 名前付きの文字参照（`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` 以外。`;` の無い古い形の一部も）があれば `2`（`[entity]`）です。その回の ID は、文字参照を戻し、HTML のコメントとタグを取り除いた形でも探します（タグは止めません）。同じレビューを取り込み直すときも、既存のファイルの label・回・接頭辞と前の回の findings のファイルを確かめます（ADR-0026 の追記）。

終了コード（最終行の文言と 1 対 1）: `0` = `VERIFY PASSED`、`1` = `VERIFY FAILED`、`2` = `VERIFY ERROR`（設定エラー・レポート書込エラー・内部エラー）。使い方エラー（未知のコマンド・オプション、欠落・余分な引数、コマンドなし）も `2` です（全コマンド共通。`VERIFY` の最終行は出さず、`error: …` の 1 行だけを標準エラーに出す。ADR-0021）。

## 開発

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build       # tsc → dist/
```

`npm run verify` は上記に `npm run test:minpath`（PATH を node と git の symlink だけにした全テスト）、
`npm run smoke:package`（配布 smoke test）、`npm run security`（内蔵スキャン）、`npm audit --audit-level=high` を加えた 8 つを順に実行します。
`test:minpath` が保証するのは、**PATH の名前解決で起動する、テストが宣言していないコマンドを検出する**ことだけです（v0.5.1 で記述を訂正。M2-2-R1-005・006）。
絶対パスでの起動は防ぎません（保証の外。v0.5.37 で決めた、バックログ 6）。vitest に渡す環境変数は PATH（node と git）・`NO_COLOR`・`FORCE_COLOR` だけで、ほかは引き継ぎません（v0.5.37）。vitest は見張り役（`scripts/minpath-watchdog.ts`）が先頭の別のプロセスグループで動き、
`test:minpath` が止まると（単独で SIGINT・SIGTERM を受けたときも、自己 verify の runner にプロセスグループごと止められたときも）、見張り役がそのグループごと止め、一時ディレクトリを消します（v0.5.38）。
テストが自分で別のプロセスグループにした子は止めません。
本体リポジトリの CI（`.github/workflows/ci.yml`）は Ubuntu で `npm ci` → `npm run verify` を走らせます（まだ必須チェックではなく、Windows は失敗しても止めない測定のジョブだけです。手順は `docs/ops/ci-and-branch-protection.md`、決定は ADR-0025）。

```bash
# 配布 smoke test 単体（npm pack → 一時ディレクトリへ install → npx --no-install aiqh verify）
npm run smoke:package
```

Ctrl+C（SIGINT）/ SIGTERM で中断すると、実行中のチェックのプロセスグループへ SIGTERM → 最大 5 秒 → SIGKILL の順で
後始末し、SIGKILL の後はグループが消えたことを最大 2 秒確かめてから、それぞれ終了コード 130 / 143 で終了します。
消えたことを確認できなかったときは、レポートの `errorSummary` にそう書きます（終了コードは変わりません）。
これは通常のスケジューリングでの動きです。イベントループが極端に止まったときやレポートの書き込みが遅れたときは、
CLI の安全弁（シグナルの受信から 8 秒）が先に終了させ、レポートが書かれないことがあります（そのときも終了コードは 130 / 143 です）。
別のプロセスグループへ移った子プロセス（`setsid` 相当）は止められません（保証の外です）。タイムアウトも同じ順で止めます。
aiqh の中で処理されなかった例外・promise の拒否（コールバックの中など）が起きたときは、`aiqh: unexpected error: …` の 1 行を標準エラーへ出し（禁止文字は表記、秘密の形はマスク）、
同じ順で実行中のチェックを片付けてから終了コード 2 で終了します（先にシグナルで中断していたときは 130 / 143 のまま。レポートは書かれないことがあります。ADR-0024）。
ただし Node を `--unhandled-rejections=warn` や `--abort-on-uncaught-exception`（`NODE_OPTIONS` での指定、下線の綴り、否定の形を含む）で動かすと、Node 自身が値を生のまま出すので、aiqh は何も実行せずに理由の 1 行を出して終了コード 2 で終了します（ADR-0024 決定 6）。

## リポジトリ構成

```
src/                 CLI 本体（TypeScript, ESM）
tests/               Vitest（ユニット + CLI 結合テスト）
docs/                ARCHITECTURE / ROADMAP / CONFIG_SPEC / adr / reports
aiqh.config.jsonc    このリポジトリ自身の検証設定
artifacts/           verify 出力・レビューパケット（git 管理外）
```

## ライセンス

未定（Public 化の際に決定します）。
