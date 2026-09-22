# ADR-0013: 窓走査の完全性不変条件と有界アンカー

- 状態: 採用
- 日付: 2026-09-23（M2-0 独立レビュー R2、v0.3.2）

## 文脈
M2-0 の窓走査（M1-R3-001）は「完成したアンカーが見つかれば候補を持ち越す」設計だったが、アンカー自体（url-credential の `scheme://user:`、
key-value の `キー名\s*[:=]\s*`）が無制限長で、アンカーが窓境界をまたぐと持ち越せず、既定設定でも実在の URL 認証情報を 0 件で見逃した
（M2-0-R2-001、High。実コードで再現）。`lineOverlapBytes` に下限が無く、固定長アンカーも短い重なりでは分断され得た。

## 決定
**不変条件**: 任意の 1 行について、その行を窓なしで行スキャナに渡したときに得られる finding は、窓走査でも同じ分類の finding として得られるか
`oversized-candidate` finding になる。窓走査だけが 0 件で終わることはない。窓の設定（有効範囲内の任意の `maxLineBytes` / `lineOverlapBytes` /
`maxCarryBytes`）、行の長さ、秘密値の位置によらず成り立つ。

根拠となる 3 つの性質（それぞれテストで固定。固定の例示値に加え、本体 regex の文字クラスから生成した秘密値（区切り記号を必ず含む）でも確認）:
1. **アンカーは本体の接頭辞**: 本体パターンに一致する任意の文字列の先頭位置で `anchor.start` が一致する。アンカーは有界（無制限量化子なし、最長一致
   `anchorMaxBytes` を宣言）。url-credential のアンカーは `scheme://`（scheme 64 文字以内。本体の regex も同じ上限）、key-value はキー名のみ
   （本体・アンカー・`partial` は同じ `KEY_VALUE_KEYS` から作る）、固定接頭辞（`sk-ant-`、`AKIA` …）は現状どおり、private-key は BEGIN マーカー
2. **`partial` は接頭辞について閉じている**: 本体に一致する任意の文字列の、アンカー開始位置からのすべての接頭辞（1 文字〜全長）に `partial`（`^…$`）が一致する。
   `partial` に一致しない候補は「もう一致し得ない」ので捨てる（普通の URL `https://host/path` は `/` で解決。接頭辞アンカーだけだと長い 1 行の
   すべての URL が候補になり `oversized-candidate` の誤検出が増えるため）
3. **重なり ≥ アンカー長**: 全パターンの `anchorMaxBytes` ≤ `MIN_LINE_OVERLAP_BYTES`（256、`config/window-limits.ts`）≤ `lineOverlapBytes`。
   窓の末尾にかかるアンカーは重なり部分に丸ごと残るため、アンカーは必ずどこかの窓に丸ごと入る

持ち越しの開始位置は「完全一致に含まれず、`partial` が末尾まで一致する**最も早い**アンカー」または「区間末尾に達した一致の開始」。`maxCarryBytes` 超は
`oversized-candidate`（fail closed）。private-key は BEGIN マーカーの完全一致を「解決済み」と扱う（ブロック状態機械が鍵本体を持つ）ので、
1 行内の鍵で `private-key` と `oversized-candidate` が重複しない。

「oversized に逃げていない」判定: 埋め草がどのアンカーにも一致せず `\b` を壊さない中立な文字（`,`）のとき、秘密値が `maxCarryBytes` 以下なら
同じ分類の finding（oversized ではない）、超えるなら `oversized-candidate` になることを性質テストで固定する。

## 代替案
- 重なりを大きくするだけ: より長いユーザー名 / 空白で再発する
- 解決の仕組みを入れず常に最も早いアンカーから持ち越す: 不変条件は満たすが、長い 1 行の普通の URL が全部候補になり oversized の誤検出が増える
- 部分アンカー（`https:/` のように切れたアンカー自体）を状態機械で保持する: 重なり ≥ アンカー長 で不要

## 影響
- `lineOverlapBytes = 1` などは無効になる（ConfigError / コンストラクタ ScanError）。既定 4096 は有効
- `partial` の判定はアンカー位置から窓末尾に対して sticky regex で行う（部分文字列を作らない）。合成の長い 1 行での実行時間は response-r2 に記録
- 性質テストの生成器は本体 regex の文字クラスから文字を引く。`partial` の文字クラスが本体より狭い誤りはここで捕捉される

## 追記（v0.3.3、M2-0 独立レビュー R3）
- **private-key のアンカー（M2-0-R3-001）**: v0.3.2 のアンカー `-----BEGIN [A-Z0-9 ]{0,32}PRIVATE KEY-----` は、ラベルが無制限の本体・block begin の
  接頭辞ではなかった（性質 1 の違反）。BEGIN マーカーが重なりより長く窓境界をまたぐと 0 件になった（最小重なりでラベル 260 文字、既定設定で 5,000 文字）。
  アンカーを固定文字列 `-----BEGIN `（`anchorMaxBytes` 11）にし、`partial` は「`-----BEGIN ` の接頭辞」「`-----BEGIN ` + ラベル + `PRIVATE KEY-----` の接頭辞」
  「完成した BEGIN マーカー + 任意」。本体と block begin の正規表現は変えない（ラベル長を狭めない）。ラベルが `maxCarryBytes` を超える候補は oversized-candidate
- **構造による固定**: 性質 1 を生成テストだけに頼ったことが漏れの原因（R2 の生成器はラベルを 20 文字以下でしか作らなかった）。scanner の本体を
  「アンカー部分式 + 残り」の連結で組み立て、全パターンで本体の source がアンカーの source で始まることをテストする（アンカー直後に量化子なし、
  トップレベルの `|` なし、フラグ同一、例外リストは空）。この形にするため github（後読みで本体の文字クラスを書き分ける）と key-value（捕捉グループ 1 を
  区切りだけにする）も書き換えた。一致する言語が変わらないことは、凍結した v0.3.2 の参照との差分テストで固定する
- **生成器の長さ**: 各可変部分の長さを 0、1、`anchorMaxBytes`±1、`lineOverlapBytes`±1、`maxCarryBytes`±1、（上限のない部分は）`maxCarryBytes` 超から選ぶ
- **masker と scanner のパターンの関係（M2-0-R3-002）**: v0.3.2 は url-credential の scheme 上限を masker と共有の `pattern` に入れたため、masker の検出範囲が
  v0.3.1 より狭まった（scheme 65 文字以上を redact しない）。masker の `pattern` は scheme 無制限に戻し、scanner だけが `scanPattern`（scheme 64 文字まで）を使う。
  不変条件は scanner 用のパターンについて成り立てばよい。**既知の制限**: scheme が 64 文字を超える URL 認証情報は scanner では検出しない（masker は redact する）。
  採らなかった案: scanner も無制限にして scheme 部分から持ち越す（アンカーが有界にならず、窓末尾の英数字の連続がすべて候補になり oversized の誤検出が増える）
