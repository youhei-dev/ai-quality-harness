> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch4-v0181-impl-r1-for-claude.md`（2026-11-07 13:45 受領、15,655 バイト、LF 115・CR 0・TAB 0・U+FFFD なし・BOM なし・生の文字〈層 (c) を含む〉なし・**末尾に改行なし**）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `2118e1dcbb961b40ee4cc0c76ea473ce915234800ddd15718830a98cca9a2871`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（`aiqh review-import` でそのまま取り込めた）。ChatGPT のファイルのダウンロードが失敗したため、人間がチャットの本文のコードブロックをコピーし、`pbpaste` でこの名前のファイルに保存したもの（末尾の改行が無いのは、そのため）。レビュアーは、添付の ZIP（`review-packet-batch4-v0181-impl-r1.zip`）を開けず、依頼文の全文と、公開リポジトリの固定の commit（release の commit `7f4bd8f` と依存の commit `783f125`）のファイルを読んだ。読めた範囲・読めなかった範囲は、原文の「確認範囲と未確認範囲」の節のとおり（ZIP の中の 35 ファイルの一覧・差分・Verification の節と公開の写しの一対一の照合は未実施、と書かれている）。

---

# aiqh batch4-v0181-impl R1 独立実装レビュー

対象: `3a6295a3ae2ce15d3a1329f50cb825529d9c72c5..413a656baddd511251c9dcbb8d674bf3ed54bf16`。主な照合先は公開リポジトリの固定 release commit `7f4bd8fa15ec17bfd741dbf9c7d568fb83b8efd8`。レビューは静的読解であり、コード・テストは実行していない。

## 指摘

### B4-I181-R1-001

- **ID**: B4-I181-R1-001
- **重要度**: Low
- **種別**: 文書
- **対象**: docs/ops/monitoring.md:2 と docs/ops/review-loop.md:2
- **内容**: v0.18.1 で本文を更新しているが、冒頭の「最終更新」が旧版のまま。文書を読む人に最新版の変更内容が無いように見える。
- **根拠**: release commit 7f4bd8f の monitoring.md:2 は「最終更新: 2026-10-19（v0.12.1。初版）」だが同:49-52 に v0.18.1 の 2.6 節がある。review-loop.md:2 は「最終更新: 2026-10-22（v0.13.2）」だが同:21-26 には v0.18.1 の取り込みの注意が追加されている。本文の追加は確認できるため機能上の不具合ではない。
- **修正案**: 両ファイルの最終更新欄を v0.18.1 の追記を反映した日付と説明へ更新し、過去の履歴は「その前」として残す。
- **確度**: 確認済み

## 全体の結論

件数: High 0 / Medium 0 / Low 1

確認できた範囲では High・Medium はなく、依頼書の終了条件を満たす。Low は文書の更新履歴の不整合 1 件で、機能・判定・レポートの破損を示すものではない。ただし、依頼書で明示された人間による golden の期待値差分確認は、実装者自身の申告によれば PR #29 の本文にまだ記録されておらず、受け入れ基準の当該項目は未達である。この点は既知の限界として依頼文に書かれているため、新規の指摘件数には含めない。人間の確認が記録されるまでは、設計 §5 の受け入れ条件をすべて満たしたとは扱わない。

### 問い 1. golden の固定の実質

指摘なし。`tests/report-golden.test.ts:23-33,48-63` は、`makeTempDir` でテストごとに分離した一時ディレクトリを用意し、`writeReports(buildReport(input), tmp.dir)` の返すパスから実ファイルを読み出して、固定の fixture の Buffer と比較する。`finally` で後始末し、履歴 JSON と最新 JSON の一致も別に確かめる。`src/report/write.ts:14-33,104-113` の実際の書き込みと表記変換を通る点で、自分の描画関数の返り値との自己比較にはなっていない。`tests/helpers.ts:6-9` の作業ディレクトリ生成は `mkdtempSync` であり、テスト間の名前の衝突を避ける。

入力の独立した条件検査は `tests/report-golden.test.ts:66-99` にあり、plain で 8 件、PASS 5、FAIL 2、SKIPPED 1、4 種の parsed、1 件の pipe と非既定 cwd、禁止文字、時間切れ、optional、切り詰め、秘密形状を数で固定する。edge は E1-E8 の順、PASS 4・FAIL 4、バッククォート・pipe・cwd・端の空白、変更見込みの表 6 行と失敗詳細 4 行を確かめる。期待値の内容検査は同:101-124。M13 は Markdown だけを変える変異であるため、JSON の比較が落ちないという実装者の説明は正しい。M14・M15 の検出件数は依頼書の実装者記録に基づくものであり、独立して再実行したものではない。

ただし人間による diff 確認の PR 記録は未完了である。最初に生成した期待値の内容が正しいかという確認を、今回の独立した節にも記載する。

### 問い 2. B4-D-R1-001

解消。`renderMarkdown` の返り値ではなく、`writeReports` が最新 Markdown、最新 JSON、履歴 JSON として保存したファイルそのものを読む。書き込み段での禁止文字の表記が golden に反映され、M14 の変異でその段を飛ばすと Markdown の比較が落ちる、という提出された検証記録も設計と矛盾しない。

### 問い 3. B4-D-R1-004

解消。`plain` の入力に FAIL と既定値以外の cwd、pipe を含む command、Checks の表と Failure Details を残す条件がテストで独立に固定されている。期待値を書き直しても入力の数が変われば別テストで落ちる。C-44 による差分の予測は edge の表 6 行と失敗詳細 4 行の合計 10 行であり、指定した入力の組み合わせと整合する。今後の v0.18.2 の実装でこの差分だけになることは、その段で別途検証すべきである。

### 問い 4. golden fixture の期待値4ファイルを実際に読んだ結果

この節では、release commit に固定した公開リポジトリ上の `tests/report-golden-input.ts` と、以下の4ファイルの表示内容を実際に開いて照合した。添付 ZIP のバイト列を直接展開していないため、公開 GitHub のファイルと ZIP 内の写しとのバイト単位の同一性は確認していない。

**plain/latest.md（2,988 バイトと依頼文に記録）**: 8 check が PASS 5・FAIL 2・SKIPPED 1 と並び、`VERIFY FAILED`、exit 1、unit・build の FAIL、security の SKIPPED と一致。unit の `- Command:` は `npm test`、pipe のエスケープ、`tee log`、`cwd: pkg` を含む。Markdown 表では pipe にバックスラッシュが付いており、列の区切りを増やさない。eslint・vitest・node-test・pytest の解析要約、vitest の失敗した名前2つ、時間切れの `SIGTERM`、切り詰めの表示、4 個のバッククォートの fence、stdout の `[REDACTED:aws]` を実際に確認した。stderr の ESC と U+202E は `\\u{1B}` と `\\u{202E}` の表記になっており、生の値ではない。入力で組み立てた AWS キー風の文字列は残っていない。

**plain/latest.json（7,214 バイトと依頼文に記録）**: 8 個の checks、summary の `total: 8`、`passed: 5`、`failed: 2`、`skipped: 1`、`requiredFailed: 3`、`verdict: FAILED` と `exitCode: 1` を確認した。最後の数 3 は必須の未 PASS が FAIL 2 と SKIPPED 1 であることと整合する。`cwd: pkg`、unit の `outputTruncated: true`、時間切れの `signal: SIGTERM`、4 種の parsed の具体的件数、機密文字列のマスクと禁止文字の JSON エスケープは入力コードに整合する。生成時の実パスや人名ではなく、架空の `/proj`、固定の時刻・SHA・run ID と版が入っている。

**edge/latest.md（2,880 バイトと依頼文に記録）**: E1-E8 の8行があり、PASS 4・FAIL 4。E1・E2・E3・E4・E5・E6・E7 に、バッククォートの連なり・先頭や末尾・pipe・cwd・両端の空白の条件が含まれ、E8 は対照の `npm test`。旧版の Markdown では、バッククォートを含むコマンドは不完全な code span に見えるが、これは v0.18.2 の C-44 が直す既知の表示上の問題を意図的に固定した fixture である。表の pipe 自体はエスケープされ、8 件の表の列がずれる値は見当たらない。4件の FAIL の stderr に入る ESC と U+202E は表記に変わっている。意図せぬ新たな破損としては扱わない。

**edge/latest.json（6,660 バイトと依頼文に記録）**: 8 個の checks、`total: 8`、`passed: 4`、`failed: 4`、`skipped: 0`、`requiredFailed: 4`、`FAILED`、exit 1。E1-E8 のコマンド・cwd・状態は `edgeInput` と対応し、4つの FAIL の stderr は JSON のエスケープによる U+001B と U+202E の表現で保存されている。Markdown で崩れうる code span の区切りは、JSON の command 文字列では欠落していない。

**4ファイル共通**: 目視した内容に手元の絶対パス、個人名、実在の適用先の名前、未マスクの秘密形状、生の ESC・U+202E は確認しなかった。実パスの代わりの `/proj` と `pkg`、架空の `demo`、固定の git SHA・runId は設計どおりである。JSON にある `\\u001b`、`\\u202e` は raw の制御文字ではなく JSON の escape 表記である。実際のレンダラでの見た目は検証していない。fixture が出力として正しいという判定は、入力コード、既存 writer の仕様、公開された値との読解上の照合であり、独立の再生成や実行による証明ではない。

### 問い 5. 依存の更新の裏返し

指摘なし。依頼書の記録では `package.json` の devDependency 3 本と lock の開発用33項目のみの更新で、実行時の commander・jsonc-parser・zod は不変。固定 commit の依存更新ページも開いて照合した。`@types/node` を上げない決定は CI の Node 24.13.1 に型の版を近づけ、型だけが新 API を許す事態を避ける方向。vitest 5.0.5 の vite peer は 8 系を許す。`npm ci --omit=dev` を使う再利用ワークフローの実行時依存に変更を持ち込まない見込みも合理的。high 0、moderate 10、CI の success は依頼書の実測記録による。moderate 10 を受け入れる理由は ADR-0008 の追記に記録されている。ZIP の lock 全体のバイト比較や Ubuntu での再実行は行っていない。

### 問い 6. B4-D-R1-002 と B4-D-R1-003

- B4-D-R1-002: 解消。ci 手順書 §8 手順7の送信前確認は、ローカルの ref 名とリモートの `--refs` を集合で照合し、同名タグの不存在、注釈付きであること、tag object の SHA と指す commit の SHA を確かめてから単一 ref だけを push する。
- B4-D-R1-003: 解消。結果不明では再送せず、読み取り専用 `ls-remote` の値を未作成・一致して作成済み・相違または確認不能に分ける記述になった。

### 問い 7. タグの手順と実地の結果

指摘なし。依頼書の実装者記録では、release commit が `7f4bd8fa15ec17bfd741dbf9c7d568fb83b8efd8`、注釈付き tag object が `e7a7936577a45f28033dd7ed28579e06356c4c4e`。送信前に 99 個対 98 個の ref 名の集合で新しい `v0.18.1` だけがローカル専用で、送信対象5点を照合している。単一の完全 ref を送る push は exit 0、送信後の remote の2行が tag object と peeled commit に一致、送信後の集合も 99 対 99。送信失敗時の手順6は使わなかった。rule insights の pass の記録も依頼文によれば作成成功と整合する。これらの実地出力は依頼書から得た記録で、私が push や GitHub API の結果を再実行したものではない。手順6は今回不要であっても障害時に必要なので削る理由はない。

### 問い 8. docs の時制

本文の古い現在形について新たな High・Medium は見つからなかった。v0.18.1 のタグが実際に作れたことを後続の記録 PR で書く予定は、設計 §2.6 と依頼書の既知の限界に明示されているので、この版の文が未確認のままでも取り違えではない。一方、更新した文書の冒頭の「最終更新」が旧版を示している点は、指摘欄の Low とした。

### 問い 9. 記録の正しさ

新たな指摘なし（上記の最終更新欄を除く）。公開された ADR-0003、ADR-0008、ci 手順書、monitoring、review-loop、設計最終版、findings-r1 と findings-r2 を照合した。設計 R1 の4件は findings-r1 で `resolved` と記録され、R2 の `previous` は同じ4件を解消と評価している。`fixedIn` には golden と docs の commit の SHA が記録されている。PR #29 の人間の期待値差分確認欄が未記録なのは、既知の未達条件として冒頭に明記した。

### 問い 10. 最終設計との一致

指摘なし。依存、golden、タグ手順、記録という v0.18.1 の範囲は最終設計 §2 と整合する。4 commit の案を5 commit にした理由は、findings の `fixedIn` が実在する commit を指すためで、合理的。M13 が Markdown のテストだけを落とした点は、変異を行った対象が Markdown の出力だけであることに整合する。ADR-0025 を更新しなかった判断も、Actions に更新が無いときは手順書と CHANGELOG に記すという設計に沿う。ただし人の差分確認の記録という受け入れ条件の一部は、依頼文が認めるとおり未達である。

### 確認範囲と未確認範囲

実際に読んだもの: 依頼書 `review-request-batch4-v0181-impl-r1.md` の全文。公開リポジトリの固定 SHA の `tests/report-golden-input.ts`、`tests/report-golden.test.ts`、4 つの `tests/fixtures/report-golden/{plain,edge}/latest.{md,json}`、`src/report/write.ts`、`tests/helpers.ts`、`docs/ops/ci-and-branch-protection.md`、`docs/ops/monitoring.md`、`docs/ops/review-loop.md`、`docs/adr/0003-report-format-json-markdown.md`、`docs/adr/0008-dependency-policy.md`、`docs/reviews/batch4-design/design-final.md`、同 `findings-r1.json` と `findings-r2.json`。GitHub の依存更新 commit ページ `783f12517ccb4b968364a2716c2bd03e207644ca` も開いた。これらは次の URL の固定 commit のファイルを参照した。

固定の公開参照先:
- https://github.com/youhei-dev/ai-quality-harness/tree/7f4bd8fa15ec17bfd741dbf9c7d568fb83b8efd8
- https://github.com/youhei-dev/ai-quality-harness/commit/783f12517ccb4b968364a2716c2bd03e207644ca

読めなかった・読まなかったもの: 添付の ZIP は、この実行環境の Python と container のパスから直接開けなかった。従って ZIP の内部の 35 ファイル一覧、差分、Verification 節と公開 GitHub の写しとの一対一照合は未実施。変更の無い `src/` の全文、`package-lock.json` の全差分、ROADMAP・CHANGELOG・README・ADR-0028・review-request-template・ADR 一覧の全文も個別には精査していない。実装者のローカル検証ログ、CI の生ログ、タグ作成の生ログ、非公開の適用先、追跡外の `CLAUDE.md` は読めない。コード、テスト、npm、Git は実行していない。

このため、結論は上に明記した公開固定 commit のコードとドキュメントおよび依頼書の記録に基づく範囲のものであり、ZIP 全件の監査を終えたという意味ではない。

## 構造化指摘

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch4-v0181-impl",
  "round": 1,
  "summary": {
    "high": 0,
    "medium": 0,
    "low": 1
  },
  "findings": [
    {
      "id": "B4-I181-R1-001",
      "severity": "Low",
      "kind": "文書",
      "target": "docs/ops/monitoring.md:2 と docs/ops/review-loop.md:2",
      "content": "v0.18.1 で本文を更新しているが、冒頭の「最終更新」が旧版のまま。文書を読む人に最新版の変更内容が無いように見える。",
      "evidence": "release commit 7f4bd8f の monitoring.md:2 は「最終更新: 2026-10-19（v0.12.1。初版）」だが同:49-52 に v0.18.1 の 2.6 節がある。review-loop.md:2 は「最終更新: 2026-10-22（v0.13.2）」だが同:21-26 には v0.18.1 の取り込みの注意が追加されている。本文の追加は確認できるため機能上の不具合ではない。",
      "fix": "両ファイルの最終更新欄を v0.18.1 の追記を反映した日付と説明へ更新し、過去の履歴は「その前」として残す。",
      "confidence": "確認済み"
    }
  ]
}
```