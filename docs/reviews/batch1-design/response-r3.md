# batch1-design の独立レビュー 3 回目への応答（response-r3）— 設計（最終）

- 対象レビュー: 受領ファイル名 `independent-review-batch1-design-r3-for-claude.md`（2026-10-22 受領、8,420 バイト、SHA-256 `71d8e3988ac8ba355b7288a4749470a8da642a21624df90d5f0b0c0df3edac32`、LF 89 / CR 0 / TAB 0 / U+FFFD なし / BOM なし / 禁止文字なし / 文字参照と HTML のタグ・コメントなし / `maskSecrets` で変わる行なし / 秘密の形〈`scanString`〉なし / 層 (c) の候補の文字・絵文字の範囲の文字なし）
  - 取り込み: `aiqh review-import`（label `batch1-design`・round 3・接頭辞 `B1-D`）で `findings-r3.json`（指摘 1 件、summary High 0 / Medium 1 / Low 0、`previous` は R2 の 5 件）
- 対象: 設計 R3（`batch1-design-r3.md`、145,093 バイト、SHA-256 `7f6155cbdbe7b4da02c48021658ef80d3a5ea4ecfe0ef5d4a92c670c0be3e4c2`。基準の commit `a7e4d5300432f4610d49d0fb6b5b9c9c80534514`）、ADR-0037 の案 R3（`adr-0037-draft-r3.md`、21,686 バイト、SHA-256 `604d0dcde0ed55ca730f80a749cbd5309df4ab08824c900f24b0a982a641cd42`）、R2 への応答の下書き（`response-batch1-design-r2.md`、26,861 バイト、SHA-256 `770b5e5827c0a26d1eb1b13d5fcb94c424e7b6645451891996f396016ec44b3d`）
- 依頼文: `review-request-batch1-design-r3.md`（20,451 バイト、SHA-256 `7c4441dcea85d9fd32fd123d1331d85a26d58bcdd171d929ddfd2a50bd464c68`。範囲は R2 の 5 件が解消したかと、その直しの新しい穴だけ。固定の URL 24）。送付は人間が行った
- 対応日: 2026-10-22
- 結果（レビュアー）: **High 0 / Medium 1 / Low 0**。R2 の 5 件は、解消 4（001・003・004・005）、部分的に解消 1（002）。レビュアーは基準の commit の公開のコードの 9 ファイルを直接読んだが、コード・テストは実行していない

## 判定表

| ID | 重要度 | 判定 | 対応 | 変えた節（設計〈最終〉・決めること〈最終〉） | 要点 |
|---|---|---|---|---|---|
| B1-D-R3-001 | Medium | VALID | 受け入れ（R4 は出さない） | 設計 §2.4（規則 4〜6）・§2.6（N2c・N5o）・§2.8、B1-Q5 | 認める Node のオプションの名前を、値を取る旗の固定の一覧（18）と、既知のブールの旗の固定の一覧（24）だけにした。どちらにも無い名前があれば、`=` の形でも 2 語の形でも検出しない |

- **状態**: `open`（`destination` は v0.14.0）。直した先は設計（最終）の文書だが、振る舞いとテストが入るのは v0.14.0。v0.14.0 の実装と、その実装の独立レビューで確かめてから `resolved` にする（`docs/ops/review-loop.md` の手順 6・8。M4 の設計の指摘 M4-D-R1-004 と同じ扱い）

## 人間の決定（2026-10-22）

- **設計レビューの閉じ方**: B1-D-R3-001 は、設計を直したうえで **R4 は出さず、v0.14.0 の実装レビューで確かめる**（M4 のときの前例と同じ）。直し方: 項目 45 で認める Node のオプションは「既知のブールの旗」と「値を取る旗の明示的な一覧」だけ。未知のオプション名は検出しない。`node --unknown-option=value --test` は否定のテストに、`--import=tsx --test`・`--test-reporter=spec --test` は肯定のテストに残す
- **Q の確定**: B1-Q1〜B1-Q25 は、設計 R3 の推奨と確定のとおり。R3 で足した細部（B1-Q5 の `watch` を含むものはすべて拒む・`NODE_OPTIONS` の前置きと設定のファイルを読むオプションも拒む、B1-Q25 の上限が取れなければ v0.13.2 では reporter を入れない）もそのまま
- **版の分け方（B1-Q22 の V1）**: v0.13.2 = 43・41・47-c（と、B1-Q25 の reporter を入れられれば）、v0.14.0 = 45・39、v0.15.0 = 層 (c)
- **実装レビュー（B1-Q23）**: v0.13.2 は、テストの差分に絞った実装の独立レビューを 1 回

## 指摘ごとの対応

### B1-D-R3-001 — 未知の Node のオプション（受け入れ）

- **指摘の要点**: R3 は一覧に無い `--名前=値` も正規化して読み、`node --unknown-option=value --test` を available とする期待（N2c）にした。Node は未知のオプションで起動を拒むので、実行できない script を node:test と誤検出する
- **対応**（設計〈最終〉の §2.4 の規則 4〜6）
  - 規則 4: 認める名前は 2 つの固定の一覧だけ。値を別の語で取る旗（R3 と同じ 18）と、既知のブールの旗（手元の Node v24.13.1 の `node --help` に値を取らない形で載っているもののうち、テストと一緒に使われる見込みの 24。`--experimental-strip-types`・`--no-warnings`・`--enable-source-maps` など）
  - 規則 6: どちらの一覧にも無い名前のオプションがあれば、その単純コマンドは認めない（`=` の形・2 語の形・値の無い形・一覧に無い短い形のどれでも）。ブールの旗に `=` で値を付けた形も認めない
  - 監視系（規則 7）・`NODE_OPTIONS` の前置き・別のファイルを読むオプションの拒否は R3 のまま
- **手元で確かめたこと**（2026-10-22。Node v24.13.1、空のディレクトリ、最小の環境、10 秒の上限）: `node --unknown-option=value --test` と `node --unknown-flag --test` は、どちらも `node: bad option: …` を stderr に出して exit 9 で終わり、テストを探さなかった
- **テストの計画**（設計〈最終〉の §2.6）: N2c から未知のオプションの行を外し、既知のブールの旗の行（`node --no-warnings --enable-source-maps --test`）を足した。`--import=tsx --test`・`--test-reporter spec --test`・`--test-reporter=spec --test` は肯定のまま。新しい否定の N5o（`--unknown-option=value`・`--unknown-flag`・`--test` の後ろの未知の旗・一覧に無い短い形・ブールの旗に値）。実装の段で、使う Node の起動の結果とも照らす
- **残したもの**: 一覧に無い Node のオプションは、Node が知っているものでも検出しない（unit は今と同じ NOT APPLICABLE。手で足す）。一覧は Node の版で変わりうるので、実装の段で使う Node の `node --help` と照らす

## R2 の 5 件の評価（レビュアー）

| R2 の ID | R3 の評価 | この回の扱い |
|---|---|---|
| B1-D-R2-001 | 解消（実装は未検証） | 変えていない。v0.15.0 で実装する |
| B1-D-R2-002 | 部分的に解消（監視系は覆ったが、正規化で未知の値つきオプションを肯定する偽陽性） | 残りは B1-D-R3-001 で直した。v0.14.0 で実装する |
| B1-D-R2-003 | 解消 | 変えていない。v0.15.0 で実装する |
| B1-D-R2-004 | 解消 | v0.13.2 で実装した（読み手の約束の文書とテスト 47-c-1〜47-c-3） |
| B1-D-R2-005 | 解消 | v0.13.2 の実装の最初に、reporter の API を実行で確かめた（設計〈最終〉の §5.5） |

## 問いへの答え（レビュアーの結論の要約。実装者の評価ではない）

- **問い 1（R2 の 5 件）**: 上の表のとおり
- **問い 2（新しい穴）**: 未知の Node のオプションを肯定することによる誤った available の提示（B1-D-R3-001）。I5・I6 の未決の脱落、I9 の数の矛盾、run の同一性の誤断定については、新しい High・Medium の指摘なし
- **問い 3（範囲の外の明らかな誤り）**: 指摘なし

## 未確認範囲（原文の要約）

固定の 24 の URL のうち 9 ファイル（`src/security/scan.ts`・`src/config/window-limits.ts`・`src/adapters/node.ts`・`src/report/write.ts`・`src/report/build-report.ts`・`src/report/markdown.ts`・`tests/regression-rest2-n1-history-name-race.test.ts`・`src/runner/run-checks.ts`・`src/runner/execute.ts`）は直接読み、残りの 15 は直接読んでいない。R3 の未実装の動き、vitest 5 の reporter の配布物の内部の実装、対象の Node v24.13.1 でのオプションの実行、負荷の実験、適用先 A・B の内容、Unicode の全 RGI のデータは、実行して確かめていない。「解消」は設計の契約の解消を意味し、実装の PASS を保証しない

- このうち、Node v24.13.1 での未知のオプションの起動の結果は、この応答の段で手元で確かめた（上の「手元で確かめたこと」）

## 取り込みと状態（v0.13.2）

- 取り込み: v0.13.2 の作業 branch で、`aiqh review-import`（label `batch1-design`・round 3・接頭辞 `B1-D`）で `findings-r3.json`（1 件）。原文は `review-r3.md`（先頭の収録の注記の後ろは原文とバイト単位で同一）
- 状態: B1-D-R3-001 は **open**（`destination` は v0.14.0）。直した先は設計（最終）`design-final.md`。R4 は出さず、v0.14.0 の実装と、その実装レビューで確かめてから `resolved` にする（人間の決定）
- `aiqh review-check --label batch1-design` が `complete` にならないのは、後の版（v0.14.0・v0.15.0）で確かめる指摘が `open` で残るため
