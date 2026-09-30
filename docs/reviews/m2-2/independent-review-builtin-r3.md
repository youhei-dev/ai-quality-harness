<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-builtin-r3-for-claude.md、ChatGPT、2026-09-30 受領、26,529 バイト、対象範囲 v0.5.18..v0.5.19）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: f7270a824bc4c341e099b33861c0c029b302435582054fab10cf64223617510b
-->

# independent review — M2-2 BUILTIN R3

対象: `v0.5.18..v0.5.19`  
レビュー方法: 添付パケットの Request、Diff、変更ファイル全文、Documents、Previous Reviews を読んで静的に判断した。依頼どおり、コード・fixture・テストは実行していない。

## 1. 結論

- **High: 7 件**
- **Medium: 1 件**
- **Low: 0 件**
- **M2-2-BUILTIN-R2-001: 解消**

前回 R2 の指摘そのもの、すなわち「`process[key]` 等で、キーの TypeScript 上の文字列リテラル型だけを根拠に安全扱いする」問題は、v0.5.19 の `writtenKey()` と holder の要素アクセス分岐によって解消している。

ただし、v0.5.19 で新たに明文化した **「型は違反を見つけるためだけに使い、違反でないと決める根拠にはしない」「許可は構文か宣言の解決に基づく」** という広い保証は、現コード全体では成立していない。`writerCall()` の `Safe` 判定、所有者の名前だけによる writer/creator の認可、総称型の cast、fs の fd 判定、fs/child_process の call signature 解決などに、別の許可・見逃し経路が残る。

したがって、**R2-001 は解消だが、v0.5.19 の broader hardening をこの版で完了扱いするのは早い**、という結論である。

---

## 2. M2-2-BUILTIN-R2-001 の判定と根拠

### 判定: **解消**

対象の中心は `tests/structure/output-guard.ts:280-290`。

- `writtenKey()` は、ソースに直接書かれた文字列リテラルまたは置換なしテンプレートリテラルだけを返す（`:157-162`）。
- holder の要素アクセスでは、診断名を決めるためには `literalKey()` の型情報も使うが、**許可するかどうかは `written` が null かで別に判断**している（`:284-290`）。
- キーがソース上の文字列リテラルでなければ、たとえ型が `"platform"` のような安全なリテラル型でも、`written === null` により `dynamic access to ...` が追加される（`:290`）。

このため、Request が列挙した次の形は、コードを読む限り前回のように「型だけを根拠に違反 0」にはならない。

- `as`
- `any` からの代入
- `JSON.parse`
- 引数
- 戻り値
- オーバーロード
- class の readonly プロパティ
- `declare const`
- `process`
- `globalThis.process`
- `globalThis[p]`
- `node:process`

特に `globalThis[p]` についても、最初の `globalThis[p]` 自体が holder の非リテラル要素アクセスになるため、型が安全でも違反になる。`node:process` は holder の規則に加え、現在の `BUILTIN_ALLOWED` 外でもある。

新しい回帰テストでも、前回の形に加えてこれらの偽装を個別 fixture にしている（`tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts:30-82`）。R1 で対照だった3形も同テストへ移されている（`:30-34`）。

**確信の度合い: 確実。** ここは実行結果ではなく、v0.5.19 の分岐そのものから判断できる。

---

## 3. 特に見てほしい点 1〜7 の結果

| # | 結果 | 判定 |
|---|---|---|
| 1 | M2-2-BUILTIN-R2-001 の解消 | **問題なし。解消。** 前節のとおり。 |
| 2 | 許可を返す分岐の棚卸し | **M2-2-BUILTIN-R3-001 / 002 / 003 / 005 / 006**。型または宣言名の扱いを安全許可に使う経路が残る。`process-guard.ts` の `commandOf` は ADR-0019 が明示的に範囲外としているため指摘にはしていない。 |
| 3 | 追加した規則の妥当性 | **M2-2-BUILTIN-R3-001 / 002 / 003 / 004 / 005 / 006 / 007 / 008**。特に stdio の object spread、generic cast、fd の型偽装、`.constructor` の透明な構文 wrapper が不足。fs の path 規則には誤検出もある。 |
| 4 | 塞げない形の記述 | **既知の限界の文章自体は問題なし。** 「悪意あるコードへの保証ではない」「未知の holder 経路は保証しない」と明記しており、名前を書かない `Function`、EventEmitter の `this`、URL/組み立てた path について過大な保証はしていない。ただし EventEmitter `this` には、全面的な「非アロー listener 禁止」より狭く安価な規則候補がある（下記）。実際の `src/` との適合はパケットに該当 source 全文がないため未確認。 |
| 5 | docs とコードの一致 | **M2-2-BUILTIN-R3-001 / 002 / 003 / 005 / 006 / 007**。ADR-0019 決定7、ARCHITECTURE、CHANGELOG の「許可の根拠は型でなく構文か宣言」という記述は現コードより強い。 |
| 6 | R1 の対照3件の置き換え | **問題なし。** `process["platform"]`、`process.exitCode = 1`、`globalThis["process"].platform` は新ルールの正しい対照で、元の型リテラルキー3形は R2 テストの `r1c01/r1c04/r1c05` に移されている。 |
| 7 | 2巡目の軸の外 | **M2-2-BUILTIN-R3-003 / 004 / 005 / 006 / 007**。特に「後から spread で stdio を上書き」「runtime は fd だが static type は path」「API 値を別の call signature に持ち替える」「透明な構文 wrapper 付き constructor」が2巡目の軸外として残る。 |

### 点4: EventEmitter `this` に対する、より狭い規則案

ADR-0019 の「非アロー関数の引数を全部禁止すると `src/` と両立しない」という説明は、**その全面禁止案に対する反論としては妥当**である。ただし、それだけでは「安価な規則がない」とは言えない。

候補は、`process.on` / `process.once` / `process.addListener` / `process.prependListener` など **listener を実際に登録する call だけ**を対象にし、型検査器で listener の宣言を解決して、listener 本体が runtime-bound `this` を参照するときだけ違反にする規則である。object/class method の参照なら解決した method declaration の body を見る。ネストした通常関数では探索を止め、ネストした arrow function では lexical `this` として探索を続ける。

これなら「関数参照を `process.on` / `process.off` に渡す」という書き方そのものは禁止しない。`off` は listener を実行しないので、登録側だけを見ることもできる。

ただし、パケットには `src/cli-signals.ts` / `src/cli.ts` の該当 source 全文がないため、現在の listener が `this` を参照していないことまでは独立確認できない。**source compatibility は未確認**とする。

---

## 4. 指摘の一覧

## M2-2-BUILTIN-R3-001

- **重大度: High**
- **場所:**
  - `tests/structure/output-guard.ts:170-173` (`hasSafe`)
  - `tests/structure/output-guard.ts:347-359` (`writerCall`)
  - `tests/structure/output-guard.ts:399-401` (`outputViolations` の許可除外)
  - ADR-0019「決定7」
  - `docs/ARCHITECTURE.md:458-468`
  - `docs/reviews/m2-2/response-builtin-r2.md:96-115`（型利用の棚卸し #12）
- **内容:** `writerCall()` が、端末呼び出しを違反から除外するという**安全許可そのものを型で決めている**。さらに `hasSafe()` は union / intersection のどちらでも `some()` を使うため、union の1枝に `Safe` があれば、別枝が非 Safe でも許可する。加えて、許可する terminal member 名を確認していない。
- **すり抜ける形:** `src/output.ts` の writer 内で引数の型が `Safe | Error` のような union になると、実行時には `Error` 側でも `hasSafe()` は true になり、`console.log(...)` の terminal finding が除外される。非 Safe のメッセージや stack を端末へ出せる。また、member 名を見ないため、Safe 引数を渡した `console.trace(...)` のような call も writer call として許可され、stack trace など引数以外の情報を端末に生成できる。0引数の terminal method も `every()` の空集合真で許可される。
- **なぜ今のガードをすり抜けるか:** `outputViolations()` は `f.terminal && writerCall(...)` の finding を捨てる。`writerCall()` は file と owner 名、PropertyAccess→Call という形、そして「全 argument で `hasSafe()`」しか見ない。`Safe` だけからなる型か、許可された exact terminal method かを確認しない。
- **確信の度合い: 確実。** 分岐が直接そうなっている。
- **修正の提案:** writer の許可判定を専用の `isSafeOnly()` に分け、union は **全枝**が Safe であることを要求する。さらに、実際に必要な terminal call を declaration / member 単位で allowlist する。現行実装が `emitOut -> console.log`、`emitErr -> console.error` なら、その exact pair と必要な arity だけを許可する。`console.trace`、`console.clear` などは許可しない。

---

## M2-2-BUILTIN-R3-002

- **重大度: High**
- **場所:**
  - `tests/structure/typescript.ts:65-70` (`ownerName`)
  - `tests/structure/output-guard.ts:63-68` (`WRITERS`, `SAFE_CREATORS`)
  - `tests/structure/output-guard.ts:351-352` (`writerCall`)
  - `tests/structure/output-guard.ts:379-380` (`Safe` assertion の creator 例外)
  - `tests/structure/brand-guard.ts:29-40, 107-118`（同じ file+owner-name 方式）
  - ADR-0019「決定7」
- **内容:** writer / Safe creator の認可が、宣言 identity ではなく **「ファイル名 + enclosing declaration の名前文字列」**で行われている。ADR-0019 の「宣言の解決に基づく許可」と一致しない。
- **すり抜ける形:** `src/output.ts` の別の scope に、ローカル関数・method・変数として `safeText` という同名 declaration を作り、その中で raw 値を `Safe` へ assertion すると、`ownerName()` は単に `"safeText"` を返すため creator 例外に入る。本物の top-level `safeText` と同じ declaration かは確認されない。同様に `emitOut` / `emitErr` という別 declaration は writer 名として扱われ得る。
- **なぜ今のガードをすり抜けるか:** `SAFE_CREATORS.has(ownerName(n))` と `WRITERS.has(ownerName(f.node))` は symbol / declaration identity を比較していない。`ownerName()` 自体も近い named declaration の text だけを返す。
- **確信の度合い: 確実。** AST 上の判定条件から直接分かる。
- **修正の提案:** `src/output.ts` の許可対象を **actual top-level declaration symbol/node** として解決し、finding の enclosing function declaration がその declaration と同一かを比較する。brand-guard の `issue` / `issueMd` / `REJECTED` も同じ方式にそろえる。少なくとも shadowed declaration / method / nested variable の同名は許可しない回帰 fixture を追加する。

---

## M2-2-BUILTIN-R3-003

- **重大度: High**
- **場所:**
  - `tests/structure/output-guard.ts:361-370` (`genericCast`)
  - `tests/structure/output-guard.ts:379-386` (`safeForgeries`)
  - `tests/structure/brand-guard.ts:107-123`
  - `tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts:103-104`（現 fixture は「どの parameter にも T がない」1形だけ）
  - `docs/reviews/m2-2/response-builtin-r2.md:139-145`（`maskDeep<T>` 誤検出を避けるため条件を緩めた記録）
- **内容:** 「parameter の type のどこかに T が出れば、その関数内の `as T` は許す」という例外は広すぎる。**T の実値を caller が供給したことを保証していない**。
- **すり抜ける形:** generic helper に optional parameter `x?: T`、default parameter、0個でも呼べる rest parameter、または `T` を内側に含む callback parameter を1つ置くだけで、`genericCast()` は「parameter が T を carries している」と判断する。その helper は runtime の raw 値を `as T` して返し、caller が `T=Safe`（または Checked/Md 等）として呼べる。optional parameter なら Safe の実値を1つも渡さずに brand を作れる。
- **なぜ今のガードをすり抜けるか:** `genericCast()` は `fn.parameters.some(...mentions(T)...)` しか見ず、parameter が required か、型が **exactly T** か、実際の assertion value がその parameter から来たかを見ない。brand-guard にも同じ構造がある。
- **確信の度合い: 確実。** optional/default/rest parameter は runtime value を要求しないが、現在の `mentions` 条件を満たす。
- **修正の提案:** 少なくとも例外対象を「optional でない・default なし・rest でない・parameter type がその T そのもの」の required value parameter に狭める。`maskDeep<T>` の正当な形がそれで足りないなら、一般 heuristic を広げるより、レビュー済み declaration を明示 allowlist する方が安全。回帰 fixture は optional/default/rest/callback-carrier を分けて追加する。

---

## M2-2-BUILTIN-R3-004

- **重大度: High**
- **場所:**
  - `tests/structure/output-guard.ts:186-196` (`stdioProblem`)
  - `tests/structure/output-guard.ts:328-330`
  - `tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts:87-92`（stdio fixture）
  - ADR-0019「決定7」の child `stdio` 項
- **内容:** `stdioProblem()` は options object の中から最初の直接 `stdio: ...` PropertyAssignment を見つけるだけで、**その後の object spread が runtime で `stdio` を上書きすることを見ない**。
- **すり抜ける形:** options が `{ stdio: "pipe", ...opts }` のような形で、`opts` が optional な `stdio: "inherit"` を runtime に持てる場合、TypeScript 上も自然に成立し得る。ガードは直接書かれた `"pipe"` だけを見て null（安全）を返すが、JavaScript の object spread では後ろの `opts.stdio` が最終値になる。
- **なぜ今のガードをすり抜けるか:** `options.properties.find(...)` で1つの PropertyAssignment を拾った後、property order、SpreadAssignment、最終的な上書きを解析しない。
- **確信の度合い: 確実。** JS object spread の上書き順と現在の AST 分岐から判断できる。実行はしていない。
- **修正の提案:** 最も単純な fail-closed は、`stdio` の直接 PropertyAssignment より **後ろに SpreadAssignment が1つでもあれば違反**。より精密にするなら、後続 spread の型が `stdio` property を持ち得る場合だけ違反にする。ただし後者は再び型を「安全許可」に使いやすいので、前者を推奨する。後ろではなく前の spread は、最後に直接 `stdio: "pipe"` / `"ignore"` が上書きするため別扱いできる。

---

## M2-2-BUILTIN-R3-005

- **重大度: High**
- **場所:**
  - `tests/structure/output-guard.ts:317-325`
  - `tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts:93-96`（現状は `any` の fd だけ）
  - `docs/reviews/m2-2/response-builtin-r2.md:104-108`（棚卸し #4）
  - ADR-0019「決定7」の fs 項
- **内容:** fs の target が fd かどうかを **static type の `NumberLike` / `any` だけで判定**しているため、runtime が数値 fd でも static type を path として見せれば見逃す。
- **すり抜ける形:** `writeFileSync` / `writeFile` など path と fd の両方を受ける API では、runtime 値が `1` でも、double assertion 等で static type を `string` にすれば call 自体は path overload として型検査できる。runtime では同じ数値 `1` が渡るため stdout fd へ到達するが、`:321-322` は `any` でも `NumberLike` でもないので違反にせず、`:323-325` も device path literal でなければ止めない。
- **なぜ今のガードをすり抜けるか:** 「数値型なら違反」は検出規則に見えるが、path-or-fd API では「数値型でないから fd ではない」という**安全許可を static type に依存**させることになる。
- **確信の度合い: 確実。** `writeFile*` 系が path/file descriptor の両方を受けることを前提にしたガード自身の設計と、分岐から判断できる。
- **修正の提案:** path-or-fd を受ける writer について、非リテラルの target を完全に安全扱いする設計ではこのクラスを静的に閉じにくい。現 `src/` の call site を宣言で allowlist できるなら、fs writer の呼び出し自体を reviewed call sites に限定する方が堅い。一般化を保つなら、少なくとも target に ordinary type assertion / `satisfies` 等が入る場合は fail closed にし、runtime target の種類を型だけで否定しない。これは ADR-0019 の「組み立てた path」の既知の限界とは別で、runtime は path ではなく fd なので、別途記述が必要。

---

## M2-2-BUILTIN-R3-006

- **重大度: High**
- **場所:**
  - `tests/structure/output-guard.ts:125-132` (`fsFunction`)
  - `tests/structure/output-guard.ts:317-330`
  - `tests/structure/process-guard.ts:33-46` (`starter`)
  - `docs/reviews/m2-2/response-builtin-r2.md:107`（棚卸し #6）
  - ADR-0019「決定7」
- **内容:** fs / child_process の API 判定が、call 時点の `getResolvedSignature(call)?.getDeclaration()` が `@types/node` の declaration であることに依存する。元の runtime value が `writeFileSync` / `spawnSync` 等でも、**その値を user-declared の普通の function type に持ち替えると、call signature の declaration は元 API でなくなる**。
- **すり抜ける形:** 例えば imported fs writer を、互換な `(path: string, data: string) => void` のような別名の function type に代入または assertion してから呼ぶ。runtime value は元の fs function のままだが、call の signature は source 側の function type に解決されるため `fsFunction()` は null になり、device path / fd の規則へ入らない。同じ構造で `starter()` も child_process call を見失い得る。
- **なぜ今のガードをすり抜けるか:** response の棚卸し #6 は「`any` なら declaration が取れない」形だけを修正対象にしているが、**非-any の具体的な function type への再型付けでも runtime declaration identity は失われる**。
- **確信の度合い: 可能性が高い。** TypeScript の call signature は retyped callee の signature を使うため、この分岐になると判断する。依頼に従って checker を実行しての確認はしていない。
- **修正の提案:** call の resolved signature だけでなく、fs writer / child starter の **値そのものの provenance**を declaration symbol で追う。fail-closed にするなら、これらの API symbol の参照は、直接 call の callee（および明示的に許した `promisify` 等）以外の「値としての受け渡し・型注釈・assertion・bind」を違反にする。現在の `src/` で必要な alias 形があるなら fixture と declaration allowlist で限定する。

---

## M2-2-BUILTIN-R3-007

- **重大度: High**
- **場所:**
  - `tests/structure/output-guard.ts:157-162` (`writtenKey`)
  - `tests/structure/output-guard.ts:270-271` (`.constructor` rule)
  - `tests/structure/output-guard.ts:314-316`（typed `Function` call rule）
  - `tests/regression-m2-2-builtin-r2-001-type-is-not-the-value.test.ts:97-102, 187-190`
  - ADR-0019「決定7」の `.constructor` 項、既知の限界「名前を書かない経路の Function」
- **内容:** `.constructor` の element-access 規則は `writtenKey()` が literal を返したときだけ発火するが、`writtenKey()` が unwrap するのは ParenthesizedExpression だけで、**runtime-transparent な `as const` / `satisfies` / non-null 等を unwrap しない**。
- **すり抜ける形:** 関数値等から `obj["constructor" as const]` のように、ソースには明示的に `constructor` と書いたまま transparent wrapper を付ける。その結果を ordinary function signature へ cast して呼ぶと、`:271` は `writtenKey === null` で見逃し、`:315-316` も callee が `Function` 型ではなくなっていれば見逃す。
- **なぜ今のガードをすり抜けるか:** 既知の限界は `obj[k]` や `Reflect.get` のように **名前を書かない経路**を外している。しかしこの形は名前をソースに直接書いているため、その既知の限界には当たらず、決定7の「literal key の `.constructor` を違反」に含まれるべき形である。
- **確信の度合い: 確実。** `writtenKey()` の構文条件から判断できる。
- **修正の提案:** `writtenKey()` で runtime-transparent wrapper を限定的に剥がす。少なくとも ParenthesizedExpression に加え、`AsExpression` の `as const`、`SatisfiesExpression`、`NonNullExpression` を unwrap し、その内側が本物の string/no-substitution-template literal のときだけ文字列を返す。一般の変数まで追わないので、R2-001 の「型を値として信じる」問題には戻らない。

---

## M2-2-BUILTIN-R3-008

- **重大度: Medium**
- **場所:**
  - `tests/structure/output-guard.ts:317-325`
  - ADR-0019「決定7」の fs path 項
  - `docs/ARCHITECTURE.md:467-468`
- **内容:** device path の検査が fs call の **全 argument** に対して行われているため、path/target ではない data や option string まで path として扱う。
- **誤って違反になる形:** 安全な通常ファイルを target にして、書き込む data の文字列が `/dev/stdout` や正規化後に `/dev/...` になる場合でも、2番目の argument の literal type に `DEVICE_PATH` が一致して `fs ... to ...` を追加する。v0.5.19 の normalize により、data が `/tmp/../dev/stdout` のような形でも同じ誤検出範囲が広がる。
- **なぜ今のガードで誤検出するか:** `for (const a of n.arguments)` として argument の意味を区別していない。docs は「fs の書き込み先」「path」を規則として説明しているため、コードの方が広い。
- **確信の度合い: 確実。** loop が全 argument を見ることから直接分かる。
- **修正の提案:** 現 `FS_WRITERS` では device path / fd の target は基本的に第1 argument なので、path 判定は API ごとに **path argument の index**を定義してそこだけに適用する。必要なら API 名→path argument index の table にする。data / encoding / flags / options は path 判定から除外する。

---

## 5. 良い点

- 前回 R2 の核心だった「キーの型が安全なリテラル型なら許す」は、`writtenKey` と `written === null` の fail-closed 分岐により、きれいに切り離されている。**前回指摘そのものの直し方は妥当**。
- R1 の旧対照3件を「安全な対照」のまま残さず、新しい R2 regression 側へ違反 fixture として移したのは正しい。テストの意味を新仕様に合わせている。
- `stdio` をソース上の literal に限る方向自体は、型の偽装を安全許可に使わないための単純で良い方針である。今回の問題は object spread の最終値を見ていない点。
- fs path の `.`、`//`、`x/../` の normalization は、「同じ literal path の綴り違い」という狭い問題には有効で、実行時に組み立てる path を既知の限界として分けた文書化も分かりやすい。
- ADR-0019 の既知の限界は、構造ガードを「悪意あるコードへの完全保証」と言っておらず、EventEmitter `this`、runtime path、依存内部の出力などを保証外として明示している。この部分の書き方は適切。

---

## 6. 未確認の範囲

1. **コード、fixture、テストは一切実行していない。** 依頼どおり、すべてパケット内のコード・差分・docs を読んだ静的判断である。
2. `src/` の全文は Request で範囲外であり、パケットにも今回判断に必要な source 全文としては載っていない。そのため、response-builtin-r2 が述べる `src/cli-signals.ts` / `src/cli.ts` の listener 実装が `this` を使わないこと、上で提案した狭い EventEmitter 規則が現 `src/` に違反 0 になることは**未確認**。
3. M2-2-BUILTIN-R3-006 の `getResolvedSignature()` が user-declared function type の declaration を返す点は TypeScript の通常の checker 挙動から判断したが、今回 checker を実行して再現はしていないため、確信度を「可能性が高い」とした。
4. ADR-0019 が既知の範囲外にした項目そのもの（runtime constructed fs path、SIGUSR1、未処理例外、dependency 内部出力、子が自分で tty を開く、名前を書かない `Function`、EventEmitter `this`、network）は、新規 finding にはしていない。点4の文言妥当性と、EventEmitter にもっと狭い規則が作れるかだけを見た。
5. `process-guard.ts:48-55` の `commandOf()` が文字列リテラル型を信じる点は確認したが、ADR-0019 が「tests/ の外部コマンドの宣言で、`src/` の出力保証ではない」と明示しており Request でも既知の扱いなので、新規 finding にはしていない。
6. `file:` URL **文字列**を fs が実行時に URL として扱うかどうかはパケット内の資料だけでは独立確認できない。パケットが既知の限界としているのは `new URL("file:///dev/stdout")` の **URL object** であり、そこは今回の指摘対象にしていない。

---

## 最終判断

**M2-2-BUILTIN-R2-001 は解消。** ただし、新しい broad policy「許可の根拠は型でなく構文か宣言」は現実装ではまだ満たされておらず、High 7 / Medium 1 を新規指摘とする。

優先順位としては、まず `writerCall` / creator の許可そのもの（R3-001, R3-002）、generic brand forge（R3-003）、stdio spread（R3-004）、fs fd 偽装（R3-005）を閉じるべきである。その後、API declaration identity（R3-006）と constructor wrapper（R3-007）を回帰 fixture で固定し、fs argument の誤検出（R3-008）を整理するのがよい。
