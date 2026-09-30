# M2-2 BUILTIN R3 の独立レビューへの対応記録（response-builtin-r3）— v0.5.20

- 対象レビュー: `docs/reviews/m2-2/independent-review-builtin-r3.md`（受領ファイル名 `independent-review-m2-2-builtin-r3-for-claude.md`、ChatGPT、2026-09-30 受領、
  SHA-256 f7270a82…510b、26,529 バイト。対象 v0.5.19 = commit be06222 / tag object 625ed0d、範囲 v0.5.18..v0.5.19）
- 対応日: 2026-09-30
- 結果（レビュアー）: 前回の M2-2-BUILTIN-R2-001 は「解消」。新しい指摘は High 7 / Medium 1 / Low 0（M2-2-BUILTIN-R3-001〜008）。原文は、v0.5.19 で明文化した広い保証
  （「許可の根拠は型でなく構文か宣言の解決」）が現コード全体では成立していない、という指摘
- 人間の判断
  - 指摘 8 件は 1 件ずつ、次の 3 つの箱に仕分けた。箱 1（直す）= R3-001・002・004・006・007・008、K1（fd option）、K2（brand-guard の呼び出し元の名前）。箱 1（狭く）= R3-003。
    箱 2（既知の限界）= R3-005、EventEmitter の `this`、K3（brand-guard の広げ）。箱 3（指摘が誤り）= なし
  - R3-006 は案 A（fs・child の関数は callee としてだけ使える）。R3-005 は部分規則（target の型アサーション・`satisfies`）を入れ、限界の文を足す。EventEmitter は限界のまま
  - 読み取りの device path の誤検出（r8c・r8d）は直さない（fail closed のまま）。決定 7 の文言は、許可の分岐の表と 1 対 1 で書く（混成の案）
  - holder のキーに wrapper を剥がした式を使う案は採らない（q05 の期待値が変わるため）。dependency の FAIL は別の commit（C0）で `npm audit fix` だけを使って直す
  - **レビューを終える基準**: 「High が 0 なら終える」に加え、**新しい指摘が箱 2 の性質（意図的な偽装が要る形）だけなら、限界として ADR に書いて終える**。r4 の依頼文で、不注意で書ける形か
    意図的な偽装が要る形かを分けて報告してもらう。3 巡目の洗い出しは v0.5.20 の実装の前には行わず、r4 の結果を見て判断する
  - レビューの「未確認の範囲」6 は新しい作業を起こさず、記録だけにする。バックログは項目も番号も変えず、K3 を 21 として末尾に足す
  - 修正の後に独立レビュー m2-2-builtin-r4（範囲 v0.5.19..v0.5.20）を行う

## 指摘の判定（SP1 の実測。fixture 113 形。v0.5.17・v0.5.18・v0.5.19 の写しに当てた）

| ID | 重要度 | 判定 | 再現 | 回帰か既存か | 不注意か意図的か | `src/` の実害 | 箱 |
|---|---|---|---|---|---|---|---|
| R3-001 writerCall / hasSafe | High | VALID | 6/6 形（union の 2 形、`console.trace` の 2 形、`console.warn`、`process.stdout.end`） | 既存（v0.5.17・18 も同じ） | 中間 | 0 | 1 |
| R3-002 ownerName の名前だけの認可 | High | VALID | 7/7 形（output-guard 4、brand-guard 3） | 既存 | 意図的 | 0 | 1 |
| R3-003 genericCast | High | 部分的に VALID | optional・default・rest・callback の 4 形 + brand-guard 1 形。`maskDeep<T>` の正当な形は狭い規則で残る | v0.5.19 で足した規則の穴 | 意図的 | 0（`maskDeep<T>` の 1 か所） | 1（狭く） |
| R3-004 stdio と後続の spread | High | VALID | 3/4 形（1 形は TS2783 で型検査が止める） | 既存 | 不注意寄り | 0 | 1 |
| R3-005 fd を path に見せる | High | VALID | 4/4 形（二重 assertion の 3 形、`JSON.parse` の any を string の注釈へ） | 既存 | 意図的 | 0 | 2（部分規則を入れる） |
| R3-006 値の持ち替え | High | 部分的に VALID（未実測を実測で確認） | 9 形中 8 形（`.bind` の 1 形は今も違反） | 既存 | DI の形は不注意寄り | 0 | 1（案 A） |
| R3-007 `.constructor` と wrapper | High | VALID | 4/4 形 | v0.5.19 の規則の穴 | 意図的 | 0 | 1 |
| R3-008 fs の全引数の device path | Medium | VALID（誤検出） | 誤検出 2 形 + 読み取り 2 形 | v0.5.17 から（正規化は v0.5.19） | 通常の書き込みで出る | 0 | 1（読み取りは直さない） |

2 巡目（v0.5.19 の教訓の適用）で、R3 の原文に無い形が 4 種類・14 形（+ R3-001 の兄弟の形 3 形）見つかった。

| 種類 | 形 | 扱い |
|---|---|---|
| K1 fd option（spread・変数・wrapper・計算された名前） | 6 形。実行時に標準出力へ届く | 箱 1: 引数の型が `fd` プロパティを持つ、または計算された名前 `"fd"` なら違反 |
| K2 brand-guard の呼び出し元の名前（R3-002 の兄弟） | 2 形（`md`・`checkValue` の名前の局所の関数） | 箱 1: 最上位の宣言の名前で認可 |
| K3 brand-guard の広げの抜け | 2 形（式本体のアロー関数の戻り値、入れ子 6 段。深さ上限 4） | 箱 2: 限界（バックログ 21） |
| K4 `.call` / `.apply` / `Reflect.apply` で fs・child API を呼ぶ形 | 4 形。実行時に届く | 箱 1: R3-006 の規則（callee 以外の参照を違反）で塞ぐ |

## 修正（v0.5.20）

`tests/structure/output-guard.ts`（先頭の説明コメントを含めて +75 / −22 行）、`typescript.ts`（+18 行）、`brand-guard.ts`（+8 / −11 行）。`src/` は変えない。

1. **R3-001**: writer の許可は、正確な組（`emitOut` = `console.log`・`process.stdout.write`、`emitErr` = `console.error`・`process.stderr.write`。`WRITER_CALLS`）、引数 1 つ、引数の型が全枝で `Safe`（union は全枝、intersection は 1 つでも）
2. **R3-002**: 認可（writer、`Safe`・`Checked`・`Md` の生成者、issuer の呼び出し元）には、囲む**最上位の宣言**（ファイルの直下の関数・class・変数）の名前を使う（`topOwnerName`）。診断には従来の `ownerName`。
   TypeScript は同じ範囲の同名の宣言を許さないので、最上位の宣言の名前が宣言の同一性になる
3. **R3-003**: 総称型の cast は、必須・既定値なし・rest でなく、型が T そのものの引数があるときだけ許す（両ガード）。残る形（必須の T の引数と、cast する別の値〈`<T>(_x: T, raw: string): T => raw as T`〉）は限界に書く
4. **R3-004**: `stdio` より後ろに spread があれば違反。前の spread は許す（後ろの直接指定が最終値）
5. **R3-005**（部分規則）: fs の writer の先頭の引数が、型アサーション・`satisfies` を付けた式（文字列リテラルを除く）なら違反
6. **R3-006**: `@types/node` の `fs` / `child_process` の関数を指す識別子が、呼び出しの callee 以外で使われたら違反（`import` の指定子は除く）
7. **R3-007**: `.constructor` の検出と child の `stdio` の許可に、実行時の値を変えない wrapper（括弧・`as`・`<T>`・`satisfies`・`!`）を剥がした式を使う（`unwrapped`）。holder のキーの許可は今のまま（ソース上のリテラルだけ）
8. **R3-008**: device path の検査は、`FS_WRITERS` の API は先頭の引数だけ、ほかの fs の関数は全引数（`copyFileSync(p, "/dev/stdout")` の第 2 引数などを見逃さない）
9. **K1**: `fd` option は、引数の**型**が `fd` プロパティを持つか、object literal の計算された名前が `"fd"` のとき違反（型は違反を見つけるためだけに使う）

試作（SP1 の `protoAll.patch`。+115 / −21 行）との違い: EventEmitter の規則（`listenerUsesThis`。+37 行）を入れなかったので、ガードは +75 / −22 行。ほかは試作と同じ内容（SP1 の `protoBox1R5.patch` との差は、`stdio` の許可に
`unwrapped` を使う 1 行と、K1 の型による検出）。

## 修正の前後の実測

| 実測 | v0.5.19 のガード | v0.5.20 のガード |
|---|---|---|
| 新しい回帰テスト 116 件（`tests/regression-m2-2-builtin-r3-allow-branches.test.ts`） | **52 件 FAIL** / 64 PASS | 116 PASS |
| 既存のテスト 900 件 | — | 900 PASS（期待値は変えていない） |
| 本物の `src/` への違反（output-guard・brand-guard） | 0 | 0 |

- 修正前の FAIL 52 件の内訳: R3-002 系 9、R3-006 系 8、R3-003 系 7、fd option と stdio の wrapper 7、R3-001 系 6、R3-004 4、R3-007 4、R3-005 の部分規則 3、R3-008 2、K1 の spread・変数 2。SP1 の実測
  （EventEmitter の 6 形を含めて 58 形が変わる）から、EventEmitter の限界の記録 6 形（違反 0 件を期待値にする）を除いた数と一致する（SP1 の下書きの 56 件は 106 形の時点の実測）
- 回帰テスト 116 件の中身: 113 形（R1 8、R2 11、R3 9、R4 5、R5 6、R6 11、R7 8、R8 7、K1 の fd option 8、wrapper 25、EventEmitter の限界の記録 11、brand-guard の広げ 4）、fixture の型検査 2、`src/` の違反 0 が 1。
  限界の記録（「報告されない」が期待値）: `r5b`（`JSON.parse` の any を string の注釈へ）、`r3i`、`r7g`（`"con" + "structor"`）、EventEmitter の 11 形（うち 6 形は違反にできる形。規則を入れないので違反 0 件を記録）、
  K3 の 3 形。テスト件数は 900（106 ファイル）から 1,016（107 ファイル）

## 「特に見てほしい点」1〜7（レビューの結果と、この版での扱い）

| # | 点 | 結果（レビュアー） | この版での扱い |
|---|---|---|---|
| 1 | M2-2-BUILTIN-R2-001 の解消 | 問題なし。解消 | 変更なし |
| 2 | 許可を返す分岐の棚卸し | R3-001・002・003・005・006 | SP1 で全数棚卸し（表は ADR-0019 決定 7 の表に反映）。箱 1 で直し、直さない分を限界に書いた |
| 3 | 追加した規則の妥当性 | R3-001〜008 | 上の修正 |
| 4 | 塞げない形の記述 | 文章は問題なし。EventEmitter に狭い規則の候補がある | 狭い規則を試作して `src/` と両立することを確かめたが、Record 経由の登録が残るので採らなかった（付録） |
| 5 | docs とコードの一致 | R3-001・002・003・005・006・007 | 決定 7 を許可の分岐の表と 1 対 1 に書き直した。ARCHITECTURE・CHANGELOG の同じ文も直した |
| 6 | R1 の対照 3 件の置き換え | 問題なし | 変更なし |
| 7 | 2 巡目の軸の外 | R3-003・004・005・006・007 | 2 巡目で K1〜K4 を見つけた（上の表） |

## レビュアーの「未確認の範囲」の扱い（新しい作業は起こさない）

人間の判断で、次のとおり記録する。

1. **コード・fixture・テストの実行**: レビュアーは静的に判断した。この版の検証は、commit ごとの一時 worktree（SHA 指定）で行った
2. **`src/` の全文と EventEmitter の規則の適合**: SP1 で実測した（`src/cli-signals.ts`・`src/cli.ts` の listener は `this` を使わず、狭い規則の違反は 0）。規則は入れない
3. **R3-006 の `getResolvedSignature()`**: SP1 で実測した（9 形中 8 形が見逃し）
4. **ADR-0019 が範囲外にした項目**、5. **`process-guard.ts` の `commandOf`**、6. **`file:` URL の文字列**: 記録だけにする

## 対応

- M2-2-BUILTIN-R3-001〜008: 上のとおり（R3-005 は部分規則 + 限界、EventEmitter・K3 は限界）。K1・K2・K4 は箱 1 で同時に直した
- C0: `brace-expansion` の high 3 件（GHSA-q2hr-2g5m-vwhr・GHSA-qhr7-859c-m2p7・GHSA-6j4f-fj2g-mc7p）を `npm audit fix` だけで直した（5.0.9 → 5.0.12。`package-lock.json` の差分は `brace-expansion` の 1 か所。
  `npm` が書き換えた lock の `version`〈0.1.0 → 0.5.19〉の 2 行は、lock を 0.1.0 のままにする既存の運用に合わせて戻した）。`--force` と `min-release-age` の変更は無い
- ADR-0019 の決定 7 の改訂と既知の限界の追加、ARCHITECTURE・CHANGELOG・README の文の訂正、ROADMAP（バックログ 21、打ち切りの基準）。ADR-0017 は、矛盾する行が無いので変えていない
- バックログの既存の項目と番号は変えていない。`src/` は変えていない

## 学んだこと（v0.5.20）

- **広い保証の文は、許可の分岐を全数棚卸ししてから書く**。v0.5.19 の「許可の根拠は型でなく構文か宣言の解決」は、要素アクセスのキーと child の `stdio` について書いた文を、ガード全体へ広げた。実際には writer・生成者の許可は
  名前、fd の判定は型、fs・child の API の判定は call の signature の declaration に基づいていた。今回は軸 A の表（`tests/structure/` の許可を返す分岐 21 か所を、構文・宣言の解決・名前・型に分けた）を作り、
  ADR の文をその表と 1 対 1 に書いた。**保証の文にある許可は表に必ず載せ、表にない許可を文に書かない**
- **修正は、回帰テストを先に書き、修正前の FAIL 件数を実測してから入れる**（今回は 116 件中 52 件。SP1 の実測から限界の記録 6 形を除いた数と一致した）
- **「意図的な偽装が要る形」は、直すコストが小さいものだけ直し、残りは限界に書く**（この版の R3-005・EventEmitter・K3）。レビューの依頼文で、不注意で書ける形と意図的な形を分けて報告してもらう。
  新しい指摘が意図的な形だけなら、限界として ADR に書いて終える
- **2 巡目でも新しい形が出る**（4 種類・14 形）。3 巡目は、r4 の結果を見て判断する
- **依存関係の advisory は、コードと無関係に verify を落とす**。リリースの前に verify が PASS であることを確かめ、FAIL のときは修正を別の commit（C0）に分ける

## 付録: EventEmitter の `this` の狭い規則の試作（採らなかった。`tmp/` は git 管理外で失われるため、diff の該当部分を収める）

原文の提案（`process.on` / `once` / `addListener` / `prependListener` の登録 call だけを対象に、listener 本体が `this` を参照するときだけ違反）に沿った試作。SP1 の実測: `src/` の違反 0、誤検出 0
（対照 5 形: アロー関数、`src/cli-signals.ts` と同じ handler の表、`this` を使わない関数・メソッド、class の中のアロー関数）、直接の 6 形（`function (this: 型)`、オブジェクトのメソッドの参照、class のメソッドの参照、`once`、
`globalThis.process.on`、名前つきの関数宣言）を違反にする。**Record に入れて要素アクセスで登録する形は、本体を解決できず残る**（意図的な迂回）。採ると、v0.5.19 の限界の記録 5 件の期待値が変わる。規模 +37 行。
採らなかった理由: 塞げるのが、意図的な偽装が要る形の一部だけで、Record 経由で残る。

```ts
/** The registration methods of an EventEmitter: the listener is called with the emitter (process) as `this`. */
const LISTENER_METHODS = new Set(["on", "once", "addListener", "prependListener", "prependOnceListener"]);

/**
 * Whether the function a listener argument names uses `this` (or declares a `this` parameter): a function expression, a function
 * declaration, or a method reference (`obj.m`, `new A().m`) is resolved to its declaration; an arrow function has the `this` of its
 * place, and a listener that cannot be resolved (an element of a record, a parameter) is not seen. Nested ordinary functions and classes
 * have their own `this`; nested arrow functions do not.
 */
function listenerUsesThis(checker: ts.TypeChecker, e: ts.Expression): boolean {
  const x = unwrapped(e);
  const fns: ts.Node[] = [];
  const add = (d: ts.Node | undefined): void => {
    const f = d !== undefined && ts.isVariableDeclaration(d) && d.initializer !== undefined ? unwrapped(d.initializer) : d;
    if (f !== undefined && (ts.isFunctionExpression(f) || ts.isFunctionDeclaration(f) || ts.isMethodDeclaration(f))) fns.push(f);
  };
  if (ts.isFunctionExpression(x)) fns.push(x);
  else if (!ts.isArrowFunction(x)) {
    const target = ts.isPropertyAccessExpression(x) ? x.name : x;
    for (const d of resolved(checker, checker.getSymbolAtLocation(target))?.declarations ?? []) add(ts.isPropertyAssignment(d) ? d.initializer : d);
  }
  const scan = (n: ts.Node): boolean => {
    if (n.kind === ts.SyntaxKind.ThisKeyword) return true;
    if (ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isClassLike(n) || ts.isAccessor(n)) return false;
    return ts.forEachChild(n, (c) => (scan(c) ? true : undefined)) === true;
  };
  return fns.some((f) => {
    const fn = f as ts.FunctionLikeDeclaration;
    return fn.parameters.some((prm) => ts.isIdentifier(prm.name) && prm.name.text === "this") || (fn.body !== undefined && ts.forEachChild(fn.body, (c) => (scan(c) ? true : undefined)) === true);
  });
}

// ---- in the CallExpression branch of scan(), before the check of a call of a value typed `any`
        // process.on(…, listener): the listener runs with process as `this`
        if (ts.isPropertyAccessExpression(n.expression) && LISTENER_METHODS.has(n.expression.name.text) && holderOf(checker, holders, n.expression.expression) !== null) {
          const listener = n.arguments[1];
          if (listener !== undefined && listenerUsesThis(checker, listener)) add(n, `a listener registered on ${n.expression.expression.getText().slice(0, 30)} that uses this (it is called with the emitter as this)`);
        }
```
