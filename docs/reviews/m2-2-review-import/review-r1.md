> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-m2-2-review-import-r1-for-claude.md`（2026-10-13 受領、12,107 バイト、LF 99・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `e6b71a89d0470e084a3effd3dd62a0ced4e0568ec71c0fd959df984a3c106064`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文は HTML の名前付きの文字参照（`&hyphen;`）を 2 行に含む（指摘 M2-2-RI-R1-001 の説明。文字参照は禁止文字ではないので、そのまま収録した）。

---

# 独立コードレビュー — m2-2-review-import / R1

対象: v0.5.45..v0.6.0。添付パケットに収録されたコード・差分・テスト・ADR を独立に静的確認。コード・テストは実行していない。

### M2-2-RI-R1-001

- ID: M2-2-RI-R1-001
- 重要度: Medium
- 種別: バグ
- 対象: src/review/import.ts: fold()、readReview() の ID mentions 検査（約115–130行、300–320行）
- 内容: HTML の名前付き文字参照で綴った当回IDが本文にあっても検出されない。JSON と正規形の見出し・件数が一致している状態で、別の指摘を名前付き文字参照のIDで本文に追加すると、その指摘が findings に無いまま exit 0 になり得る。
- 根拠: fold() は数値文字参照（&#45; / &#x2D;）だけを復号し、HTML の名前付き文字参照（&hyphen; など）は復号しない。たとえば正常な1件のレビュー本文に「追加の指摘 M2&hyphen;2&hyphen;RI&hyphen;R1&hyphen;002」を記載しても、fold() 後の文字列は ID の正規表現に一致しない。JSON の findings が001のみ、本文の ### 見出しも001のみ、件数1件なら残りの検査もすべて一致する。Markdown の名前付き文字参照は表示時にハイフンへ復号される。パケット中の実装を静的に追跡した判断で、実行による再現は未実施。
- 修正案: Markdown/HTML の名前付き文字参照も、許可された実体参照の復号をした上でIDを探す。少なくともハイフン類を表す名前付き文字参照を網羅し、本文に未知の当回IDがある場合に exit 2・無書き込みを保証する回帰テストを追加する。
- 確度: 確認済み

### M2-2-RI-R1-002

- ID: M2-2-RI-R1-002
- 重要度: Medium
- 種別: バグ
- 対象: src/report/write.ts: writeAtomic()（約86–94行）、src/commands/review-import.ts: 書き込み処理（約199–222行）
- 内容: 書き込みの一時ファイル名が予測可能で、既存シンボリックリンクを排除せず writeFileSync で追跡する。対象ディレクトリに同名リンクが置かれていると、リポジトリ外のファイルを書き換えてから rename し得る。rename が失敗して exit 2 でも、外部ファイルの変更は戻らない。
- 根拠: writeAtomic は `${target}.tmp-${process.pid}` に対して直接 writeFileSync(tmp, ...) しており、排他作成（wx）・lstat・シンボリックリンク非追跡を行わない。resolveInsideRoot の検査対象は最終 target で、tmp のリンク先ではない。攻撃・事故条件として書き込み先ディレクトリへの事前配置権限とリンク先への書き込み権限が必要。既存テストは tmp 名と同じ「ディレクトリ」による失敗を試すが、シンボリックリンクを試していない。
- 修正案: 一時ファイルを同一ディレクトリでランダムな名前かつ排他作成 wx（可能なら O_NOFOLLOW）で開き、その fd へ書き込んで close、rename する。衝突は上書きせず別名を試し、自分が作成した一時ファイルだけを削除する。外部を指す tmp シンボリックリンクが事前に存在する場合の回帰テストを追加する。
- 確度: 確認済み

### M2-2-RI-R1-003

- ID: M2-2-RI-R1-003
- 重要度: Medium
- 種別: バグ
- 対象: src/commands/review-import.ts: existing source.sha256 一致時の早期 return（約134–153行）
- 内容: 同一原文で再実行すると既存 findings ファイルの形式とハッシュだけを確認して exit 0 するため、前回ファイルの欠落・読取不能・別ラベル等を再検査しない。前回が存在することを要件とする round 2 以降で、初回後に前回のファイルが削除・破損した状態でも「already imported」で成功する。
- 根拠: existing !== null の分岐で readFindingsFile(target) 後、before.source.sha256 === sha256 だけで EXIT_PASSED を返す。一方、前回ファイルの resolveInsideRoot・lstatOrNull・readFindingsFile および label/round/idPrefix 照合はこの return より後にある。たとえば round 2 を正常に取り込み、後で findings-r1.json を消し、同じ review.md を再実行すると、--allow-missing-previous なしでも早期成功する。加えて既存ファイル自身の label/round/idPrefix とコマンド引数の一致も確認しない。静的分岐確認であり、実機実行は未実施。
- 修正案: 同一原文による冪等再実行でも、前回ファイルの ENOENT / 読取不能 / スキーマ / label・round・prefix を通常実行と同じ規則で検査してから成功させる。既存ファイルの識別子も引数と照合する。前回が削除・破損・不一致の場合と既存ファイルの識別子不一致の場合のテストを追加する。
- 確度: 確認済み

## 全体の結論

件数: High 0 / Medium 3 / Low 0

High は確認されなかったが Medium が3件あるため、この版のレビューは未完了と判断する。

**問い1（fail open）:** 名前付き HTML 文字参照を使った当回IDが漏れる経路を確認した。指摘内容をIDなしで書く場合等は依頼書に記された既知の限界として再指摘しない。

**問い2（無書き込み・exit 2）:** 通常の不一致、無効JSON、容量超過、UTF-8不正に対する拒否処理を確認した。一方、一時ファイルのシンボリックリンクによって外部ファイルを変更し得るため、「失敗時に何も書かない」の保証は成立しない。

**問い3（文章の漏洩）:** zod の未知キー名をエラーへ展開しない仕組み、createOutput、copyJson(maskSecrets)、禁止文字の表記変換は確認した。意図的な秘密形状の既知のマスク限界を除き、レビュー文章の直接出力経路は今回の収録範囲では特定しなかった。なお書き込み先リンク問題は任意ファイルの上書きリスクも伴う。

**問い4（open と終了コード）:** 成功側は findings の open 件数に関係なく EXIT_PASSED、拒否側は EXIT_ERROR を返しており、open の件数が終了コードに影響する経路は確認されなかった。

**問い5（前回ファイル）:** 前回を実際に調べる分岐は ENOENT だけを欠落扱いにしている。しかし同一原文再取り込みの早期成功は前回ファイル検査を丸ごと回避する。

**未確認範囲:** 実行・テスト実測、範囲外の src/cli.ts、tests/structure/、tests/file-write-sites.test.ts、テストの生ログ、同時実行やOS固有挙動の実地検証は行っていない。パケット内の Verification は実装側の記録として確認したが独立再実行したものではない。

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "m2-2-review-import",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 3,
    "low": 0
  },
  "findings": [
    {
      "id": "M2-2-RI-R1-001",
      "severity": "Medium",
      "kind": "バグ",
      "target": "src/review/import.ts: fold()、readReview() の ID mentions 検査（約115–130行、300–320行）",
      "content": "HTML の名前付き文字参照で綴った当回IDが本文にあっても検出されない。JSON と正規形の見出し・件数が一致している状態で、別の指摘を名前付き文字参照のIDで本文に追加すると、その指摘が findings に無いまま exit 0 になり得る。",
      "evidence": "fold() は数値文字参照（&#45; / &#x2D;）だけを復号し、HTML の名前付き文字参照（&hyphen; など）は復号しない。たとえば正常な1件のレビュー本文に「追加の指摘 M2&hyphen;2&hyphen;RI&hyphen;R1&hyphen;002」を記載しても、fold() 後の文字列は ID の正規表現に一致しない。JSON の findings が001のみ、本文の ### 見出しも001のみ、件数1件なら残りの検査もすべて一致する。Markdown の名前付き文字参照は表示時にハイフンへ復号される。パケット中の実装を静的に追跡した判断で、実行による再現は未実施。",
      "fix": "Markdown/HTML の名前付き文字参照も、許可された実体参照の復号をした上でIDを探す。少なくともハイフン類を表す名前付き文字参照を網羅し、本文に未知の当回IDがある場合に exit 2・無書き込みを保証する回帰テストを追加する。",
      "confidence": "確認済み"
    },
    {
      "id": "M2-2-RI-R1-002",
      "severity": "Medium",
      "kind": "バグ",
      "target": "src/report/write.ts: writeAtomic()（約86–94行）、src/commands/review-import.ts: 書き込み処理（約199–222行）",
      "content": "書き込みの一時ファイル名が予測可能で、既存シンボリックリンクを排除せず writeFileSync で追跡する。対象ディレクトリに同名リンクが置かれていると、リポジトリ外のファイルを書き換えてから rename し得る。rename が失敗して exit 2 でも、外部ファイルの変更は戻らない。",
      "evidence": "writeAtomic は `${target}.tmp-${process.pid}` に対して直接 writeFileSync(tmp, ...) しており、排他作成（wx）・lstat・シンボリックリンク非追跡を行わない。resolveInsideRoot の検査対象は最終 target で、tmp のリンク先ではない。攻撃・事故条件として書き込み先ディレクトリへの事前配置権限とリンク先への書き込み権限が必要。既存テストは tmp 名と同じ「ディレクトリ」による失敗を試すが、シンボリックリンクを試していない。",
      "fix": "一時ファイルを同一ディレクトリでランダムな名前かつ排他作成 wx（可能なら O_NOFOLLOW）で開き、その fd へ書き込んで close、rename する。衝突は上書きせず別名を試し、自分が作成した一時ファイルだけを削除する。外部を指す tmp シンボリックリンクが事前に存在する場合の回帰テストを追加する。",
      "confidence": "確認済み"
    },
    {
      "id": "M2-2-RI-R1-003",
      "severity": "Medium",
      "kind": "バグ",
      "target": "src/commands/review-import.ts: existing source.sha256 一致時の早期 return（約134–153行）",
      "content": "同一原文で再実行すると既存 findings ファイルの形式とハッシュだけを確認して exit 0 するため、前回ファイルの欠落・読取不能・別ラベル等を再検査しない。前回が存在することを要件とする round 2 以降で、初回後に前回のファイルが削除・破損した状態でも「already imported」で成功する。",
      "evidence": "existing !== null の分岐で readFindingsFile(target) 後、before.source.sha256 === sha256 だけで EXIT_PASSED を返す。一方、前回ファイルの resolveInsideRoot・lstatOrNull・readFindingsFile および label/round/idPrefix 照合はこの return より後にある。たとえば round 2 を正常に取り込み、後で findings-r1.json を消し、同じ review.md を再実行すると、--allow-missing-previous なしでも早期成功する。加えて既存ファイル自身の label/round/idPrefix とコマンド引数の一致も確認しない。静的分岐確認であり、実機実行は未実施。",
      "fix": "同一原文による冪等再実行でも、前回ファイルの ENOENT / 読取不能 / スキーマ / label・round・prefix を通常実行と同じ規則で検査してから成功させる。既存ファイルの識別子も引数と照合する。前回が削除・破損・不一致の場合と既存ファイルの識別子不一致の場合のテストを追加する。",
      "confidence": "確認済み"
    }
  ]
}
```
