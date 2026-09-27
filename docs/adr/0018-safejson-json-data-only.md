# ADR-0018: `safeJson()` は JSON のデータだけを受け付け、それ以外は出力の前に拒否する

- 状態: 採用（ADR-0017 の決定 3 の JSON のデータについての但し書きと、既知の限界の M2-2-R4-001 を置換）
- 日付: 2026-09-27（M2-2、v0.5.10。M2-2 独立レビュー R4 の M2-2-R4-001）

## 文脈
- ADR-0017 の決定 3 は、JSON のキーも値と同じく表記 → mask にした。ただし、その決定は JSON のデータについてのもので、JSON のデータでない値は処理しないことを
  既知の限界とした（v0.5.5）
- v0.5.9 の `jsonSafe()` は、値を `Object.entries()` と配列の `map()` で写し、写しを `JSON.stringify()` に渡していた。写しに関数が残ると `JSON.stringify()` が
  それを呼び、戻り値は表記・mask を通らずに出た（M2-2-R4-001）
- v0.5.10 の SP1 の洗い出し（`docs/reviews/m2-2/response-r4.md`）では、そのまま出る形は、v0.5.5 の記録の 2 形（自分の `toJSON` の関数、関数を返す数えられる getter）の
  ほかに 6 種類あった: `toJSON` を持つ関数、static `toJSON` を持つクラス、`toJSON` を持つ関数を返す getter、Array のサブクラス（プロトタイプの `toJSON`）、
  配列の `constructor[Symbol.species]` の差し替え、Proxy（`toJSON` を見せるもの、配列の要素、関数）
- ほかの JSON のデータでない値は、次のどれかだった
  - 消える: 関数・`symbol`・`undefined`・数えられないプロパティ
  - 形が変わる: `Date`・`Map`・`Set`・`NaN` など。`String` の object と `Buffer` / `Uint8Array` では、秘密の形が 1 文字（1 バイト）ずつに分かれて mask が効かない
  - 例外: `bigint`。循環参照ととても深い入れ子はスタックが尽きる（`RangeError`）
- 今の各コマンドの `--json` は JSON のデータだけ（v0.5.5 と v0.5.10 の SP1 の実行時の確認で 0 件）。利用者の入力の入り口（jsonc-parser・zod・`JSON.parse`・
  git の出力・ファイル名）は、関数・accessor・クラスのインスタンスを作らない

## 決定
1. **JSON のデータの定義**
   - 文字列、有限の数、真偽値、`null`、配列、object。関数・`symbol`・`bigint`・`undefined`（object の値・配列の要素・最上位のどれでも）は拒否する
   - 数: `NaN`・`Infinity`・`-Infinity` は拒否する。`-0` は受け付ける（`JSON.stringify()` が `0` と書く。従来と同じ出力）
   - 配列: `Array.isArray()` が true で、プロトタイプが `Array.prototype`（サブクラスは拒否）。自分のキーは `0`〜`length-1` の添字と `length` だけ
     （穴・添字でないキー・`symbol` のキーは拒否）。各要素は数えられるデータのプロパティ
   - object: プロトタイプが `Object.prototype` か `null`。自分のプロパティは、文字列のキーの、数えられるデータのプロパティだけ（`symbol` のキー・数えられないもの・
     getter / setter は拒否。getter は呼ばない）。`toJSON`・`__proto__`・`constructor`・`prototype` という名前のキーも、値が JSON のデータなら普通のキー
   - 循環参照は拒否する（祖先の列で判定）。循環でない共有の参照は受け付ける（従来どおり 2 回書く）
   - 深さ: 入れ子の配列・object は 100 段まで（`MAX_JSON_DEPTH`。今の出力は最大 4 段）
2. **方式（1 回の読み取りで検査しながら写す）**: `jsonSafe()` は、各プロパティを記述子（`Object.getOwnPropertyDescriptor`）で 1 回だけ読み、検査してから写す。
   getter と `toJSON` を呼ばず、`map()` を使わない（`Symbol.species` を通らない）。写しは新しい配列とプロトタイプの無い object だけで、`JSON.stringify()` は
   写しだけを見る。文字列とキーは従来どおり表記 → mask
3. **失敗の形**: 拒否は `JSON output refused: <種類> is not JSON data` の例外。種類は固定の語で、キー・値・パスは載せない。`JSON.stringify()` の前に投げるので、
   何も出ない。CLI は最上位の「unexpected error」で exit 2（ADR-0017 のキーの衝突と同じ経路。キーの衝突のメッセージは従来どおり、表記・mask の後のキーを載せる）
4. JSON のデータの出力は変えない（v0.5.4 のバイト比較の 42 通り〈`--json` の 5 通りと init `--write` のファイルを含む〉で、v0.5.9 と一致することを確かめた）

## 代替案
- **A. 先に検査し、従来の写し（`Object.entries`）はそのまま**: 検査と写しで 2 回読む。読むたびに値を変える Proxy が、検査では JSON のデータ、写しでは `toJSON` を
  持つ関数を見せると迂回できる（v0.5.10 の SP1 で実測。生の U+202E と mask されない秘密の形が出た）。getter も 2 回呼ばれる
- **C. `JSON.stringify()` を使わず、自前で直列化する**: `toJSON` を探すこと自体が無くなる。ただし、字下げ・文字列のエスケープ（制御文字、孤立したサロゲート）・
  数の表記の再現が要り、バイト一致のリスクと実装の量が大きい
- **D. `JSON.stringify()` の replacer で検査・変換する**: `toJSON` は replacer より先に呼ばれるので防げない。replacer はキーも変えられない
- **E. 決定 2 に加えて、写しの配列のプロトタイプも外す**: 同じプロセスの中の `Array.prototype.toJSON` の汚染にも効く（実測で出力は同じ）が、脅威モデルの外
  （下の既知の限界）。シンプルさを優先して採らない
- **`undefined` の値の object のキーだけを「無い」として省く**: 従来の `JSON.stringify()` の挙動だが、JSON のデータの定義から外れる。fail closed に揃えて拒否する

## 既知の限界
- Proxy は検出しない（検出には `node:util` の読み込みが要る）。トラップ（`ownKeys`・`getPrototypeOf`・`getOwnPropertyDescriptor`）が見せるものを 1 回ずつ読み、
  検査してから写す。`get` のトラップは使わないので、`get` と記述子が食い違う Proxy では、記述子が見せるデータが出る
- 同じプロセスの中のプロトタイプの汚染（`Array.prototype.toJSON`、`BigInt.prototype.toJSON` など）は、脅威モデルの外。写しの配列は `Array.prototype` を持つので、
  そのような定義があれば `JSON.stringify()` が呼ぶ
- ファイルへの出力は対象外（ADR-0016・ADR-0017 と同じ）。verify のレポートを写す `maskDeep()` も同じ構造で、`toJSON` を持つ関数を写し、`JSON.stringify()` が
  それを呼ぶ。また、写しが普通の object なので、`__proto__` という名前のキーは消える。レポートの値とキーに利用者由来の関数・キーは入らないので、今は起きない。
  ROADMAP のバックログ（ファイルへの出力の禁止文字。v0.5.10 の番号で 9）

## 影響
- JSON のデータでない値を `safeJson()` に渡すと、何も出さずに例外になる（CLI は exit 2）。今の各コマンドの `--json` の出力は変わらない
- `--json` を書くのは各コマンドの最後。review-packet は、パケットを書いた後に拒否が起きると exit 2 になる（キーの衝突と同じ。今の値では起きない）。
  init は `--json` を書き込みの前に出す
- 回帰テスト: `tests/regression-m2-2-r4-001-json-data.test.ts`（34 件）。`tests/regression-m2-2-r3-002-json-keys.test.ts` の対照の値から `endLine: undefined` を外した
  （今は拒否する値）
