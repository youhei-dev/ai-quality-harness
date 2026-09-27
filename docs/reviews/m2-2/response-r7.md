# M2-2 独立レビュー R7 への対応記録（response-r7）— v0.5.11（M2-2-R4-001 の作業の区切り）

- 対象レビュー: `docs/reviews/m2-2/independent-review-r7.md`（受領ファイル名 `independent-review-m2-2-r7-for-claude.md`、ChatGPT、2026-09-27 受領、SHA-256 70f6de9a…。
  対象 v0.5.10 = commit 2af8738 / tag object 46494f0、範囲 v0.5.9..v0.5.10、パケット `review-packet-m2-2-r7.md`。前回のレビューとして r4 と r6 を収録）
- 対応日: 2026-09-27
- 結果（レビュアー）: 前回の M2-2-R4-001 は解消。新しい指摘は High 0 / Medium 3（M2-2-R7-001〜003）/ Low 0。3 件とも、v0.5.10 で作った「JSON のデータだけを
  受け付ける」検査の、Proxy のときの不足
- 人間の判断: 完了基準「High が無ければ区切り、Medium 以下はバックログへ」に従い、M2-2-R4-001 の作業（v0.5.10）を v0.5.11 で区切る。3 件は **Medium のまま、
  1 項目にまとめてバックログの先頭（1）へ（v0.5.11 では修正しない）**。v0.5.11 は docs だけの版。区切る前に 3 件の前提を実測した（M2-2-R1-007 の教訓）

## 前回の指摘の判定（レビュアーの判定）

| ID | 判定 | 補足（レビュアー） |
|---|---|---|
| M2-2-R4-001 | 解消 | JSON のデータでない値を拒否し、記述子の値から普通の配列とプロトタイプの無い object の新しい写しを作る方式で、`JSON.stringify()` が写しの中の利用者のコード（`toJSON` など）を呼ぶ経路は閉じている。回帰テストは、前回の `toJSON` の形と、追加で洗い出した形を、修正前に失敗する形で確かめている |

## 3 件の前提の確認（実装 AI、2026-09-27。`tmp/m2-2/r7-record/`。`src/`・`tests/` は変えていない）

v0.5.10 の `src/output.ts` を `tmp/` のスクリプトから読み込んで試した。禁止文字・LF・TAB・ダミーの秘密の形は実行時に作り、記録では表記と `<SECRET>` にした。

### M2-2-R7-001（Medium）— 再現した

- Proxy の配列（`[1, "a"]`）の `get` のトラップで読まれたキーを数えると、`safeJson()` は受け付け、`get` は **1 回（`"length"`）** 呼ばれた
- 補足: `get` の `"length"` で 0 を返し、`ownKeys()` も `length` だけを見せる Proxy（元の配列は 2 要素）は、`[]` として受け付けられた。出るのは JSON のデータ
  （要素が減るだけで、表記・mask を迂回するものではない）

### M2-2-R7-002（Medium）— 再現した（レビューの 3 形のうち、欠けた添字を別のキーで埋めた形を含む 3 形を受け付けた）

| 形（Proxy の配列） | v0.5.10 の結果 |
|---|---|
| (a) `ownKeys()` が `["length", Symbol(…)]`、記述子のトラップは `"0"` を見せる | **受け付けた**。出力は `[1]`（記述子が見せたデータ） |
| (b) `ownKeys()` が `["length", "extra"]`、記述子のトラップは `"0"` を見せる | **受け付けた**。出力は `[1]`（`"extra"` の値は出ない） |
| (c1) `ownKeys()` が添字 `"1"` を欠く（`["0", "length"]`）、記述子は `"1"` を見せる | 拒否（キーの個数が合わない） |
| (c2) (c1) の欠けた分を `"extra"` で埋めた（`["0", "length", "extra"]`）、記述子は `"1"` を見せる | **受け付けた**。出力は `[1, 2]` |

- 受け付けた出力は、どれも記述子が見せた JSON のデータで、生の禁止文字は 0。`ownKeys()` にだけ見せたキーの値は出ない

### M2-2-R7-003（Medium）— 再現した。端末では表記・mask される

- 目印（`marker-r7` ＋ U+202E ＋ LF ＋ TAB ＋ ダミーの秘密の形）を含む Error を投げるトラップ:

| 投げる所 | `safeJson()` の例外のメッセージ | `createOutput().json()` の sink |
|---|---|---|
| `getPrototypeOf` | 目印がそのまま入る（生の U+202E・LF・TAB、mask されない秘密の形）。種類だけの拒否の形ではない | 0 回 |
| `ownKeys` | 同じ | 0 回 |
| `getOwnPropertyDescriptor` | 同じ | 0 回 |
| 配列の `length` の `get`（R7-001 の経路） | 同じ | 0 回 |
| 配列の要素の `getOwnPropertyDescriptor` | 同じ | 0 回 |
| object の値の中の Proxy（`getPrototypeOf`） | 同じ | 0 回 |
| 対照: 取り消し済みの Proxy | エンジンの固定の文（`Cannot perform 'getPrototypeOf' on a proxy that has been revoked`） | 0 回 |

- **端末までの経路**: 一時 worktree の写しの security-scan の `--json` の値に、上の 4 つのトラップ（`getPrototypeOf`・`ownKeys`・`getOwnPropertyDescriptor`・配列の `length`）を
  持つ Proxy を差し込み、実際の CLI の出力のバイトを調べた（commit していない。worktree は削除した）
  - 4 つとも exit 2、標準出力 0 バイト（JSON は何も出ない）
  - 標準エラーは 2 行: `aiqh: unexpected error: marker-r7 \u{202E}\u{A}\u{9} [REDACTED:aws]` と `VERIFY ERROR (internal error)`
  - 生の禁止文字 0・TAB 0、mask されない秘密の形 0。U+202E・LF・TAB は表記になり、1 行のまま（`writeError()` の `safeText`）
  - 対照（差し込み無し）: exit 0、標準エラー 0 バイト
- 契約（拒否のメッセージは種類だけ）には合わないが、端末に生の禁止文字や mask されない秘密の形は出ない

### 利用者の入力から Proxy などが作られる経路（無い）

- 各コマンドの `--json` の値と、ファイルへの出力の値の出どころを読み取りと実測で確かめた
  - `JSON.parse`（`package.json`、review-packet の `latest.json`）: 普通の object と配列だけ。`__proto__` は自分のキーとして残る
  - jsonc-parser（設定ファイル）: `"__proto__"` というキーで、object のプロトタイプが差し替わる（実測）。ただし、結果は `src/config/load.ts` の `configSchema.safeParse()` に渡すだけで、
    使うのは zod の出力だけ。zod（`z.strictObject`）は、`__proto__` で持ち込んだキーを「Unrecognized key」として拒否し、中身の無い `__proto__`（`{}`・`null`・`[]`）を
    受け付けた場合も、出力は普通の object だけだった（Proxy・accessor・普通でないプロトタイプは 0）
  - git の出力とファイル名: 文字列
- どの入り口も Proxy・accessor を作らず、普通でないプロトタイプはコマンドの値に届かない。v0.5.10 の SP1 の結論（利用者由来の値で表記・mask を迂回する経路は無い）は変わらない

### 同じ種類の洗い出し（`src/output.ts` の `jsonSafe()` と `ownDataValue()`。行番号は v0.5.10）

| 行 | 操作 | 呼ばれうるトラップ | 今の扱い | 指摘 |
|---|---|---|---|---|
| 68 | `Object.getOwnPropertyDescriptor(o, key)` | `getOwnPropertyDescriptor` | 値は記述子から読む。トラップの例外はそのまま伝わる | R7-003 |
| 70〜71 | `"value" in d`、`d.enumerable` | 無し（エンジンが作った新しい記述子） | — | — |
| 93 | `ancestors.includes(value)` | 無し（同一性の比較） | — | — |
| 96 | `Object.getPrototypeOf(value)` | `getPrototypeOf` | 例外はそのまま伝わる | R7-003 |
| 97 | `Reflect.ownKeys(value)` | `ownKeys` | 例外はそのまま伝わる（結果の重複などはエンジンが検査） | R7-003 |
| 99 | `Array.isArray(value)` | 無し（Proxy は元の対象を見る。取り消し済みはエンジンの固定の文） | — | — |
| 101 | `value.length` | **`get`**（記述子以外で値を読む唯一の箇所） | 例外はそのまま伝わる | R7-001、R7-003 |
| 102 | `keys.length !== length + 1` | — | **キーの個数だけで判定**し、集合を照合しない | R7-002 |
| 104 | `ownDataValue(value, String(i))`（`i` は 0〜`length-1`） | `getOwnPropertyDescriptor` | `ownKeys()` に無い添字の記述子も読む | R7-002、R7-003 |
| 109〜110 | object のキー（`for (const k of keys)`） | 無し（`ownKeys()` の結果の配列） | 記述子を読むのは `ownKeys()` で得たキーだけ。個数だけの判定は無い | — |

- 記述子以外で値を読む箇所: 1（101 行）。トラップの例外を固定の種類に変えていない箇所: 4（68・96・97・101 行）。キーの集合を確かめずに個数だけで判定している箇所: 1（102 行）

### docs とコードの不一致（v0.5.11 で直した記述）

| 文書 | 合わない文 | 合わない理由 | 対応 |
|---|---|---|---|
| ADR-0018 の決定 1（25〜26 行） | 配列の「自分のキーは `0`〜`length-1` の添字と `length` だけ」 | Proxy の配列では個数だけを確かめる（R7-002） | 実装の確かめ方を書き足した |
| ADR-0018 の決定 2（31〜33 行） | 「各プロパティを、記述子で 1 回だけ読み」「getter と `toJSON` を呼ばず」 | 配列の `length` は `value.length` で読み、Proxy の配列では `get` のトラップが呼ばれる（R7-001） | `length` が例外であることを書き足した |
| ADR-0018 の決定 3（34〜35 行） | 「種類は固定の語で、キー・値・パスは載せない」 | トラップ自身の例外は変えずに伝わる（R7-003） | 検査が見つけた拒否だけに当てはまると書き足した |
| ADR-0018 の既知の限界（49〜50 行） | 「`get` のトラップは使わない」 | 配列の `length` では使う（R7-001） | 直した |
| ARCHITECTURE の出力の出口（456〜457 行） | 「各プロパティを記述子で 1 回だけ読み、getter と `toJSON` を呼ばない」「メッセージは種類だけ」 | 同じ | ADR-0018 と同じく直し、既知の限界に R7 の 3 件を足した |
| `src/output.ts` の `jsonSafe()` の説明（74〜83 行） | 「each property is read once, getters and toJSON are never called」「Anything else is refused」 | 同じ | この版は `src/` を変えない。バックログ 1 で合わせる |

- 過去の版の記録（CHANGELOG の v0.5.10 の項、ROADMAP の v0.5.10 の記録、response-r4 の v0.5.10 の節）の同じ文は、当時の記録として残した

### High の基準の判定

| 基準 | 結果 |
|---|---|
| 端末に生の禁止文字、または mask されない秘密の形が出る | 当たらない。トラップの例外は、CLI の最上位で `writeError()` を通り、表記・mask された（4 つのトラップすべて、実測） |
| 利用者の入力から、Proxy・accessor・普通でないプロトタイプがコマンドの値に届く | 当たらない（上の経路の確認） |
| 受け付けた値の出力が表記・mask を迂回する | 当たらない。R7-001・R7-002 で受け付けた出力は、記述子が見せた JSON のデータで、表記・mask を通る |

→ High の基準に当たらない。3 件とも Medium のまま。

## 対応

- M2-2-R7-001〜003: **Medium のまま、1 項目にまとめてバックログの先頭（1）へ（v0.5.11 では修正しない）**。重大度はレビュアーの判定のまま。直すときの案（レビューの修正案の要点）:
  1. 配列の `length` を記述子で読む（`length` は数えられないので、専用の確かめ方にする）
  2. 配列のキーの集合を完全に照合する（`Reflect.ownKeys()` が添字 `0`〜`length-1` と `length` だけ。記述子を読むのは `ownKeys()` で得た集合だけ）
  3. トラップの例外（`getPrototypeOf`・`ownKeys`・`getOwnPropertyDescriptor`、配列の `length`）を、固定の種類の拒否に変える
  - 回帰テストはレビューの案（Proxy の配列の 3 形、トラップごとの目印つきの例外、`length` の `get` の回数 0）
  - 先に置く理由: 直前の作業（M2-2-R4-001）の続きで、変更が `src/output.ts` とテストだけに収まる見込みのため
- ADR-0018 の既知の限界に 3 件を追記し、決定 1〜3 の文を実装に合わせた（決定そのものは変えていない。新しい ADR は作っていない）。ARCHITECTURE も同じ
- バックログの番号: 先頭に 1 項目を足し、既存の項目は 1 つずつ下がった（v0.5.10 の 1〜19 → 2〜20）

## M2-2-R4-001 の作業の区切り

| 版 | 内容 | 独立レビュー | 指摘（High / Medium / Low） |
|---|---|---|---|
| v0.5.10 | M2-2-R4-001 を修正（`safeJson()` は JSON のデータだけ。ADR-0018） | m2-2-r7（v0.5.9..v0.5.10） | 0 / 3 / 0（R4-001 は解消） |
| v0.5.11 | docs だけ（R7 の記録、ADR-0018 の既知の限界、バックログ、ROADMAP の参照の番号、CHANGELOG の v0.5.10 の SHA） | — | — |

- テスト件数: 658（v0.5.10、101 ファイル）→ 658（v0.5.11、docs だけ）
- 残り（M2-2-R7-001〜003、M2-2-R4-002、kill の EPERM の経路など）は ROADMAP のバックログの順に扱う

## 教訓

- **ADR に書いた性質は、その性質を破れる入力で 1 つずつ試す**: v0.5.10 は「二度読み」を Proxy で試したが、`length` の `get`、`ownKeys()` と記述子の食い違い、
  トラップ自身の例外は試さなかった。「記述子で 1 回だけ読む」「種類だけのメッセージ」のそれぞれについて、破る Proxy を作って確かめる
- **個数での判定は、集合の照合の代わりにならない**: 普通の配列では同じ結果でも、答えを選べる相手（Proxy）には、個数を合わせた別のキーを見せられる
- **固定のメッセージを約束するときは、検査が呼ぶ操作が投げる例外まで含める**: 検査が自分で投げる拒否だけでなく、途中で呼ぶ操作（トラップ）の例外も、同じ形に変える

## M2-2-R7-001〜003 の対応（v0.5.12、2026-09-27。`src/` は `src/output.ts` だけ）

SP1（再現・同じ種類の洗い出し・試作と設計）の後、人間の承認を得て実装した。作業の記録は `tmp/m2-2/r7-fix/`（git 管理外）。ADR-0018 の決定は変えず、実装を合わせた。

### 人間の判断（SP1 の承認）

- 方式は 3 件とも案 A
  - R7-001: `length` を記述子から読む専用の関数
  - R7-002: キーの集合の照合（個数 ＋ 正規の添字）
  - R7-003: 値を調べる操作を `inspect()` で包み、投げられた値を束縛しない。元の例外は `cause` にも入れない
- 新しい拒否の種類は `a value whose structure could not be inspected` と `an array whose length is not a valid array length`
- SP1 で見つけた CLI の最上位の catch の弱さ（下の発見 2）は、Medium として ROADMAP のバックログ 1 に入れる
  - 外す R7 の項目と同じ位置に入れるので、ほかの番号は変わらない
  - 理由: 利用者の入力からは届かず、`safeJson()` を通る経路は v0.5.12 で閉じるため。v0.5.12 は `src/output.ts` だけを変える
- v0.5.11 の記録の訂正（下）は、この節と ADR-0018 の既知の限界に書く（v0.5.11 の文は当時の記録として残す）

### 修正の中身

- R7-001: 配列の `length` を、ほかのプロパティと同じく記述子から読む（`arrayLength()`）
  - 数えられないデータのプロパティで、値が 0 以上 2^32−1 以下の整数でなければ、`an array whose length is not a valid array length` で拒否する
  - Proxy の `get` のトラップは呼ばない
- R7-002: 配列の自分のキーは、`length + 1` 個で、どれも `"length"` か、`length` 未満の正規の添字（`^(?:0|[1-9][0-9]*)$`）であることを確かめる
  - エンジンが Proxy の `ownKeys` の重複を拒否するので、これで {`"length"`, `"0"`…`String(length-1)`} とちょうど一致する
  - 記述子を読むのは、その添字だけ
- R7-003: 値を調べる操作（`Object.getPrototypeOf`・`Reflect.ownKeys`・`Array.isArray`・`Object.getOwnPropertyDescriptor`〈要素と `length`〉）を `inspect()` で包む
  - 操作が何を投げても、値を束縛しない `catch` で受け、`a value whose structure could not be inspected` の拒否にする
  - 対象: トラップの例外、操作の内側の利用者のコード、トラップの答えを検査するエンジンの TypeError、取り消し済みの Proxy
  - 次のものはそのまま: 自分の拒否とキーの衝突の文、利用者の文字列を含まないエンジンの固定の文（RangeError など）
- 新しい回帰テスト `tests/regression-m2-2-r7-json-data-proxy.test.ts`（17 件）。既存テストは変えていない

### SP1 の新しい発見（v0.5.11 の表に無かったもの）

1. エンジン自身がトラップの答えを検査して投げる TypeError のメッセージに、利用者由来のキーがそのまま入る（8 形のうち 3 形）
   - 3 形: `ownKeys` が構成不可のキーを欠く、`getOwnPropertyDescriptor` が無いキーを構成不可と答える、構成不可のキーに `undefined` を返す
   - v0.5.12 では固定の拒否になる
2. 投げられた値を調べると例外になる値（`getPrototypeOf` が投げる Proxy、`message` の getter が投げる Error）では、`src/cli.ts` の最上位の catch の中で例外になった
   - catch は `err instanceof Error ? err.message : String(err)` で値を調べる
   - その結果、Node の未処理の例外の表示として、生の U+202E と mask されない秘密の形が標準エラーに出て、exit 1 になった（一時 worktree の写しの CLI で実測）
   - v0.5.12 で、`safeJson()` を通る経路は固定の拒否（exit 2）になった。CLI の catch そのものは ROADMAP のバックログ 1

### v0.5.11 の記録の訂正

- 対象: 上の「M2-2-R7-003 — 再現した。端末では表記・mask される」と、ADR-0018 の既知の限界の「端末へは CLI の最上位の `writeError()` を通り、表記・mask される（v0.5.11 で実測）」
- これらは、投げられた値が Error・文字列・`toString` を持つ object のときに成り立つ
- 発見 2 の 2 形では成り立たなかった（v0.5.11 は Error だけを試していた）
- v0.5.11 の文は当時の記録として残す

### 修正の前後の実測

| 確かめたこと | v0.5.11 | v0.5.12 |
|---|---|---|
| 新しい回帰テスト（17 件） | 15 件 FAIL。PASS は対照の 2 件（トラップの無い・転送だけの Proxy が普通の値と同じ出力。埋めていない (c1) が個数の判定で拒否される） | 17 件 PASS |
| Proxy の配列の `get` の回数（R7-001） | 1（`length`） | 0 |
| R7-002 のレビューの 3 形（(a)(b)(c2)）と、正規でない添字（`"01"`・`"1.0"`・`"-0"`、`length` 以上） | 受け付けた | 拒否 |
| CLI の `--json` に、投げる Proxy を差し込んだ 6 通り（Error・文字列・`toString`・投げる Proxy・`message` の getter が投げる Error・不変条件の TypeError） | exit 2 が 4 通り（目印が文に入る。表記・mask はされる）、**exit 1 が 2 通り（生の禁止文字・mask されない秘密の形）** | 6 通りとも exit 2、固定の文、生の禁止文字 0、mask されない秘密の形 0（対照は exit 0） |
| v0.5.4 のバイト比較の 42 通り | 基準 | 42 通りすべてバイト単位で一致 |
| `safeJson()` の速さ（finding の object 10 万件と、数の配列 10 万要素。7 回の中央値） | 1,344 ms | 1,396 ms（SP1 の試作。出力は同じ） |

- テスト件数: 658（v0.5.11、101 ファイル）→ 675（v0.5.12、102 ファイル）

### 教訓（v0.5.12）

- **投げられた値は、読まずに捨てる**: 例外の値を調べる（`instanceof`・`.message`・`String()`）こと自体が、利用者のコードを走らせる。境界では値を束縛しない `catch` で受け、
  自分の固定の文に変える
- **エンジンのエラーも利用者の文字列を運ぶ**: 不変条件の TypeError は、問題のキーを引用する。「エンジンの文だから安全」とは言えない
- **端末までの確かめは、投げられる値の種類ごとに行う**: v0.5.11 は Error だけを試して「表記・mask される」とした。Error でない値や、調べると例外になる値で、結果が変わった
