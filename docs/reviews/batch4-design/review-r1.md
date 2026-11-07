> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch4-design-r1-for-claude.md`（2026-11-07 10:02 受領、17,074 バイト、LF 142・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `16e3ff52bf429511d219efb19db1542ff71eab3623777359902ffd54e6215a90`。Security Scan に一致する例示行・変更した原文の行番号: なし。ChatGPT のダウンロードが失敗したため、本文をチャットから人間が保存したもの。

---


# aiqh batch4-design R1 独立設計レビュー

対象: v0.18.1・v0.18.2・H11 の 5 回目の設計案。基準 commit: `3a6295a3ae2ce15d3a1329f50cb825529d9c72c5`。

## 指摘

### B4-D-R1-001

- **ID**: B4-D-R1-001
- **重要度**: Medium
- **種別**: 設計
- **対象**: 設計 §2.4.2-§2.4.3、§5、ADR-0003 追記の決定 1・4
- **内容**: golden の latest.md の比較対象が renderMarkdown(report) だけでは、実際に writeReports が保存する latest.md のバイト列と一致しない入力がある。制御文字を含む edge 入力を予定しているため、ファイルの golden という目的に穴がある。
- **根拠**: base/src/report/write.ts:20-25 は renderMarkdown の返り値を writeAtomic に渡し、同ファイル:108-113 は Markdown 書き込み時に escapeForDisplay(content, "keep") を適用する。一方 base/src/report/markdown.ts:135-154 は stderrTail・stdoutTail を fence 内に生のまま置く。base/tests/regression-backlog9-report-file-notation.test.ts は、実ファイルで U+001B や U+202E が表記化されることを確認する。設計 §2.4.3 は実行時に制御文字を組み立てる入力を含める。
- **修正案**: latest.md の golden は使い捨てディレクトリで writeReports を呼び、実際に読み戻したファイルの Buffer と期待値を比較する。少なくとも escapeForDisplay(renderMarkdown(report), "keep") を比較側に含め、実ファイルとの一致を別テストで固定する。JSON も writeReports との一致を確かめる。生の文字を fixture に置かず期待値には表記だけを置く。
- **確度**: 確認済み

### B4-D-R1-002

- **ID**: B4-D-R1-002
- **重要度**: Medium
- **種別**: 設計
- **対象**: 設計 §2.2 手順 3、付録 B.1、B4-D-Q14
- **内容**: 未公開のローカルタグを検査する手順に git tag --no-contains origin/main を使うのは不適切。release commit を指す通常のタグを列挙できず、別のローカルタグの有無についても正しい差集合が得られない。取り消せないタグの事前確認として誤った安心につながる。
- **根拠**: 設計 §2.2 手順 1 はタグの対象 SHA が origin/main の祖先であることを必須とし、手順 3 は git tag -l 'v*' --no-contains origin/main の結果でローカル専用タグを調べる。--no-contains は指定 commit を含まないタグへの絞り込みなので、origin/main の祖先を指す release タグは通常この一覧に出ない。base/docs/ops/ci-and-branch-protection.md §3・§8 にある tag-protection は削除・更新を禁止する。
- **修正案**: ローカルの refs/tags/v* を列挙し、リモートの refs/tags/v* とタグ名の集合で比較する。注釈付きタグの剥がした行をタグ名と混同しない。さらに送る対象の完全 ref、タグ object SHA、剥がした commit SHA、リモートに同名タグが無いことを、push 前に個別に確かめる。送る操作は今の単一の完全 ref のままでよい。
- **確度**: 確認済み

### B4-D-R1-003

- **ID**: B4-D-R1-003
- **重要度**: Medium
- **種別**: 設計
- **対象**: 設計 §2.2 手順 5-6、§2.6、付録 B.1
- **内容**: タグ push がネットワーク誤り等で非ゼロになった場合、リモートでは作成済みという不確定状態がありうる。現在の文案は拒否された場合にタグが無いかのように読め、最初の作成の扱いと事後の確認が一致していない。
- **根拠**: 設計 §2.2 手順 6 はネットワークの誤りも含めて『断られたら止まる』とするが、§2.6 では『断られたら: タグはできない』と記す。push の送信成功後に応答だけ失われた場合、終了状態だけでは remote ref の不存在を証明できない。base/docs/ops/ci-and-branch-protection.md §3 は更新と削除を不可としている。
- **修正案**: push が失敗・タイムアウト・応答不明なら再送も変更もせず止める点は維持し、読み取り専用の git ls-remote で同名 ref の有無と tag object・peeled commit を確認する。『未作成』『正しく作成済み』『別の対象または確認不能』を区別して人間へ報告し、§2.6 の『タグはできない』という断定を削る。
- **確度**: 確認済み

### B4-D-R1-004

- **ID**: B4-D-R1-004
- **重要度**: Low
- **種別**: テスト
- **対象**: 設計 §2.4.6、§3.1.4、§5、ADR-0003 追記の決定 6
- **内容**: golden の入力が意味を保つガードは、期待値ファイル自身に節や印があることを確認するだけでは、入力側を弱めた場合や plain の対象を減らした場合を十分に検出できない。正しい出力変更を拒む一方、fixture とガードを同時に変更すれば形だけ通る余地が残る。
- **根拠**: ADR-0003 追記の決定 6 は『期待値のファイル自身』にある要素を確かめる。設計 §3.1.4 は plain.* と edge.latest.json が差分にないことを根拠にするが、差分なしだけでは、plain に各表示箇所が維持されたことを保証しない。
- **修正案**: 入力について必須 check の個数・状態・parsed の道具・Command と cwd のケース数を独立して assert する。plain にも Checks の表と失敗詳細の Command、cwd を必ず含める。expected fixture の変更を正当な仕様変更で許す手順は維持し、人の差分確認を必須にする。
- **確度**: 確認済み

## 全体の結論

件数: High 0 / Medium 3 / Low 1

High は 0、Medium は 3。依頼書に定められた終了条件には達しないため、設計を修正して R2 を依頼する判断が妥当。今回の指摘は未実装の設計に対するもの。実装上の不具合が発生したと断定するものではない。

### 問い 1. golden fixture
固定入力 2 組、時刻・runId・版の固定、バッククォートの有無による差分の分離は妥当。ただし実際の Markdown ファイルの最終書き込み変換を比較しない点を Medium とした。期待値だけを更新しない規約は有益だが、手続きであり技術的な更新禁止機構ではない。入力ガードの独立性は Low の改善余地がある。raw の禁止文字を追跡ファイルに残さない方針は維持する。

### 問い 2. 依存の更新
指摘なし。自己 CI が Node 24.13.1 のままなら @types/node 24.19 系へ先行させない B4-D-Q1 の A を支持する。engines >=24.0.0 までの互換を保証しないことは既知の限界として正しく残している。vite・vitest の peer 範囲、macOS の試行結果、実行時依存 3 件の不変は提出された deps-trial の記録と整合する。ただし npm レジストリの現時点の監査結果をこのレビューで再実測したわけではない。moderate 10 件を受け入れる理由と CI での再確認を記録に残す。

### 問い 3. タグの手順
Medium 2 件。完全な ref を一つだけ push する選択 B4-D-Q14 の A、release SHA を明示して注釈付きタグを作る方法、push 後に object と peeled commit を照合する方向は支持する。ただし --no-contains の使用と、push の結果が不確定なときの扱いを直す。タグが保護されている以上、実際の送信よりも前の確認の正しさが重要。

### 問い 4. C-44
指摘なし。既存 codeSpan を共有し、表では cell の処理を先に行い、失敗詳細の cwd を oneLine で包む設計は、基準の markdown.ts と整合する。B4-D-Q5 の A を支持する。B4-D-Q6 の A は『表の外ではバックスラッシュが見える』という既知の表示限界を明示する条件で受け入れ可能。バッククォートと区切り・端の空白・縦棒の組み合わせのテストを実施すること。実レンダラの見た目は未確認。

### 問い 5. 1a と 1c
指摘なし。readReview の JSON schema を通った後、target.round が 1 で previous の配列長が 0 より大きいときだけ問題を追加すれば、欄省略と空配列、round 2 以降は維持される。Problem の種類の型にも previous を追加し、CLI の problems 出力経路の整合を確かめること。既存の同一原文の再取り込みは既存ファイルの SHA 一致で早期 return するため、過去の保存ファイルを新条件で再検証しないという既存動作を維持する。1c は末尾の -R と数字だけを拒むことに賛成。

### 問い 6. H11 の 5 回目
指摘なし。提出された設定調査に従えば、変更対象の command と cwd の文字条件が既存のままなら、描画方式の変更による latest.md の実質的な差分が無いという予測は合理的。ただし毎回変わる時刻・runId・commit・所要時間・tool version を含むレポート全体はバイト同一ではない。CI ログで check・parsed・判定を比較することは、出力互換の一部の根拠であり latest.md の実ファイルの一致の直接検証ではない。適用先への反映前に設定を再取得する工程と、本番デプロイを伴う適用先 A の人間による承認を維持する。

### 問い 7. 裏返しの影響
golden が正当な仕様変更を妨げる危険は、変更理由の記録と同一 commit の期待値変更を許す決まりで緩和されている。一方で書き込みの実ファイルを固定できない逆効果がある。タグの確認を厳格化しても未公開タグの差分の判定が誤れば誤った安心を生む。1a・1c が現在通る入力を拒むことは意図された互換性変更であり、ADR・README・help に記載すべき。

### 問い 8. 見落とし
上記 Medium と Low 以外に、提示資料の範囲で新たな High・Medium に相当する問題は特定しなかった。v0.18.1 の依存更新に合わせた全検証、release の version 整合、v0.18.2 の変更前 FAIL と変更後 PASS、既存レビュー状態の検査、H11 の比較を受け入れ条件として維持する。

### 読めた範囲・未確認範囲
読めたもの: 添付の依頼書、統合Markdown中の設計書、questions、ADR 追記案 4 つ、scope summary、deps trial、import trial、および base/ のコード・テスト・ADR・手順書の関連箇所。統合された添付を根拠とし、元の ZIP の圧縮状態やバイト単位の同一性は検証していない。

固定 URL: GitHub 上の基準 commit の ROADMAP、CHANGELOG、README、batch3 最終設計を開いた。その他の固定 URL は今回のレビューで個別の全文検証を行っていない。設計の実測については提出された結果の記録を参照したのみで、npm install、テスト、CI、git push、GitHub の ruleset の実操作は行っていない。外部 Markdown レンダラでの描画、適用先 A・B の実データ、タグ保護下の初回作成については未確認。

## 構造化指摘

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch4-design",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 3,
    "low": 1
  },
  "findings": [
    {
      "id": "B4-D-R1-001",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §2.4.2-§2.4.3、§5、ADR-0003 追記の決定 1・4",
      "content": "golden の latest.md の比較対象が renderMarkdown(report) だけでは、実際に writeReports が保存する latest.md のバイト列と一致しない入力がある。制御文字を含む edge 入力を予定しているため、ファイルの golden という目的に穴がある。",
      "evidence": "base/src/report/write.ts:20-25 は renderMarkdown の返り値を writeAtomic に渡し、同ファイル:108-113 は Markdown 書き込み時に escapeForDisplay(content, \"keep\") を適用する。一方 base/src/report/markdown.ts:135-154 は stderrTail・stdoutTail を fence 内に生のまま置く。base/tests/regression-backlog9-report-file-notation.test.ts は、実ファイルで U+001B や U+202E が表記化されることを確認する。設計 §2.4.3 は実行時に制御文字を組み立てる入力を含める。",
      "fix": "latest.md の golden は使い捨てディレクトリで writeReports を呼び、実際に読み戻したファイルの Buffer と期待値を比較する。少なくとも escapeForDisplay(renderMarkdown(report), \"keep\") を比較側に含め、実ファイルとの一致を別テストで固定する。JSON も writeReports との一致を確かめる。生の文字を fixture に置かず期待値には表記だけを置く。",
      "confidence": "確認済み"
    },
    {
      "id": "B4-D-R1-002",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §2.2 手順 3、付録 B.1、B4-D-Q14",
      "content": "未公開のローカルタグを検査する手順に git tag --no-contains origin/main を使うのは不適切。release commit を指す通常のタグを列挙できず、別のローカルタグの有無についても正しい差集合が得られない。取り消せないタグの事前確認として誤った安心につながる。",
      "evidence": "設計 §2.2 手順 1 はタグの対象 SHA が origin/main の祖先であることを必須とし、手順 3 は git tag -l 'v*' --no-contains origin/main の結果でローカル専用タグを調べる。--no-contains は指定 commit を含まないタグへの絞り込みなので、origin/main の祖先を指す release タグは通常この一覧に出ない。base/docs/ops/ci-and-branch-protection.md §3・§8 にある tag-protection は削除・更新を禁止する。",
      "fix": "ローカルの refs/tags/v* を列挙し、リモートの refs/tags/v* とタグ名の集合で比較する。注釈付きタグの剥がした行をタグ名と混同しない。さらに送る対象の完全 ref、タグ object SHA、剥がした commit SHA、リモートに同名タグが無いことを、push 前に個別に確かめる。送る操作は今の単一の完全 ref のままでよい。",
      "confidence": "確認済み"
    },
    {
      "id": "B4-D-R1-003",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §2.2 手順 5-6、§2.6、付録 B.1",
      "content": "タグ push がネットワーク誤り等で非ゼロになった場合、リモートでは作成済みという不確定状態がありうる。現在の文案は拒否された場合にタグが無いかのように読め、最初の作成の扱いと事後の確認が一致していない。",
      "evidence": "設計 §2.2 手順 6 はネットワークの誤りも含めて『断られたら止まる』とするが、§2.6 では『断られたら: タグはできない』と記す。push の送信成功後に応答だけ失われた場合、終了状態だけでは remote ref の不存在を証明できない。base/docs/ops/ci-and-branch-protection.md §3 は更新と削除を不可としている。",
      "fix": "push が失敗・タイムアウト・応答不明なら再送も変更もせず止める点は維持し、読み取り専用の git ls-remote で同名 ref の有無と tag object・peeled commit を確認する。『未作成』『正しく作成済み』『別の対象または確認不能』を区別して人間へ報告し、§2.6 の『タグはできない』という断定を削る。",
      "confidence": "確認済み"
    },
    {
      "id": "B4-D-R1-004",
      "severity": "Low",
      "kind": "テスト",
      "target": "設計 §2.4.6、§3.1.4、§5、ADR-0003 追記の決定 6",
      "content": "golden の入力が意味を保つガードは、期待値ファイル自身に節や印があることを確認するだけでは、入力側を弱めた場合や plain の対象を減らした場合を十分に検出できない。正しい出力変更を拒む一方、fixture とガードを同時に変更すれば形だけ通る余地が残る。",
      "evidence": "ADR-0003 追記の決定 6 は『期待値のファイル自身』にある要素を確かめる。設計 §3.1.4 は plain.* と edge.latest.json が差分にないことを根拠にするが、差分なしだけでは、plain に各表示箇所が維持されたことを保証しない。",
      "fix": "入力について必須 check の個数・状態・parsed の道具・Command と cwd のケース数を独立して assert する。plain にも Checks の表と失敗詳細の Command、cwd を必ず含める。expected fixture の変更を正当な仕様変更で許す手順は維持し、人の差分確認を必須にする。",
      "confidence": "確認済み"
    }
  ]
}
```
