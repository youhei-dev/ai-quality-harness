> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-batch1-design-r3-for-claude.md`（2026-10-22 受領、8,420 バイト、LF 89・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `71d8e3988ac8ba355b7288a4749470a8da642a21624df90d5f0b0c0df3edac32`。Security Scan に一致する例示行・変更した原文の行番号: なし。原文に文字参照と HTML のタグ・コメントは無い（v0.13.2 の作業 branch の `aiqh review-import` でそのまま取り込めた）。

---

# batch1-design R3 独立設計レビュー

## 指摘

### B1-D-R3-001

- ID: B1-D-R3-001
- 重要度: Medium
- 種別: 設計
- 対象: 設計 §2.4 規則 4〜6、§2.6 N2c、B1-Q5
- 内容: R3 が新たに available とする `node --unknown-option=value --test` は、`--test` があっても Node が未知のオプションで起動を拒む。未知の `--名前=値` を一般に受け入れる契約では、実行できない script を実行可能な node:test と誤検出する。
- 根拠: 設計 R3 §2.4 規則 4 は一覧にない `--名前=値` も正規化し、規則 5 は `--test` があれば認める。§2.6 N2c は `node --unknown-option=value --test` を chosen `node-test` と期待する。基準コード `src/adapters/node.ts` は script の検出結果を unit の提案に使用する。未知のオプションで Node CLI が失敗する点はコマンド構文によるもので、R3 の新しい肯定ケースが誤った証拠になっている。実際の対象Nodeでのこのコマンドの実行は本レビューでは行っていない。
- 修正案: N2c の未知オプションの肯定ケースを削り、未知のオプション名については原則検出しない。認める名前は、対象 Node の既知のブール旗と、値つき旗の明示的一覧に限定する。既知の `--import=tsx --test` と `--test-reporter=spec --test` は肯定テストとして残す。未知の `--unknown-option=value --test` は否定テストにし、実装の対象Nodeの起動結果と照らす。
- 確度: 確認済み

## 全体の結論

件数: High 0 / Medium 1 / Low 0

High はないが Medium が 1 件あるため、事前に定めた設計レビュー終了基準（High・Medium が 0）には達していない。新しい指摘は R2-002 に対する正規化拡張による偽陽性であり、監視オプションの拒否そのものは改善された。

### R2 の指摘別判定

- B1-D-R2-001: 解消。I5(a)〜(c) は窓から消える位置をその窓で finding に確定し、次へ回す候補は保証された重なりに限る。I6 は既決の位置を再判定しない。L16(a)〜(g) に境界と繰り返しを追加した。実装は未検証。
- B1-D-R2-002: 部分的に解消。監視系の等号形・2語形・間接オプションは規則7と否定テストで覆った。ただし名前と値の正規化の追加により未知の値つきオプションを肯定する新しい偽陽性が生じている。
- B1-D-R2-003: 解消。I9 が位置別の除外数と、行・符号位置を鍵とする finding の重複排除を独立に定義し、L24 が混在、パス、窓、allow を検証する計画になった。
- B1-D-R2-004: 解消。時刻が異なれば別run、一致しても同じrunとは限らないという非対称の契約に修正。47-c-3 は同一ミリ秒の衝突を再現し、runIdを別項目として残した。
- B1-D-R2-005: 解消。APIの事前確認、取得不能時の扱い、20行上限と末尾サマリー、tailとの統合テストが具体化した。後続のstderrや早期中断による記録欠落も既知の限界として明記されている。

### 問いへの回答

1. R2 の五件の解消判定は上記のとおり。層 (c) の窓処理と重複鍵、時刻識別の制限、遅いテストの記録仕様は設計として改善した。
2. 新しい穴として、未知の Node オプションを肯定することによる誤った available の提示を指摘する。I5・I6 の未決の脱落、I9 の数の矛盾、run の同一性の誤断定については、新規の High・Medium 指摘なし。
3. 指定された範囲外について、今回明らかな誤りとして追加する指摘なし。

### 実コードとの照合・未確認範囲

固定 commit `a7e4d5300432f4610d49d0fb6b5b9c9c80534514` の GitHub raw 本文を直接読んだ: `src/security/scan.ts`（`LineAssembler`、`RawCharSink` とパス名処理）、`src/config/window-limits.ts`、`src/adapters/node.ts`、`src/report/write.ts`、`src/report/build-report.ts`、`src/report/markdown.ts`、`tests/regression-rest2-n1-history-name-race.test.ts`、`src/runner/run-checks.ts`、`src/runner/execute.ts`。窓の実装では渡した後に `floor` と `from` を決めるので、R3 の提案は `floor` の先行計算と metadata 追加を前提とする。履歴は排他的に名前を確保するが `startedAt` は識別子ではない。stderr は末尾 200 行・64 KiB に縮められる。

指定24 URL のうち上記9ファイルは直接確認し、残り15ファイルはこの回に直接読んでいない。特に ADR-0036、窓の既存テスト、README、ROADMAP、CI設定などは添付の記述からの照合にとどまる。R3 の未実装の動作、Vitest 5 reporter 配布物の内部実装、対象 Node v24.13.1 でのオプション実行、負荷実験、適用先 A・B の内容、Unicode の全 RGI データは実行検証していない。したがって「解消」は設計契約の解消を意味し、実装の PASS を保証しない。

## 機械取り込み用JSON

```aiqh-findings
{
  "schemaVersion": 1,
  "label": "batch1-design",
  "round": 3,
  "summary": {
    "high": 0,
    "medium": 1,
    "low": 0
  },
  "findings": [
    {
      "id": "B1-D-R3-001",
      "severity": "Medium",
      "kind": "設計",
      "target": "設計 §2.4 規則 4〜6、§2.6 N2c、B1-Q5",
      "content": "R3 が新たに available とする `node --unknown-option=value --test` は、`--test` があっても Node が未知のオプションで起動を拒む。未知の `--名前=値` を一般に受け入れる契約では、実行できない script を実行可能な node:test と誤検出する。",
      "evidence": "設計 R3 §2.4 規則 4 は一覧にない `--名前=値` も正規化し、規則 5 は `--test` があれば認める。§2.6 N2c は `node --unknown-option=value --test` を chosen `node-test` と期待する。基準コード `src/adapters/node.ts` は script の検出結果を unit の提案に使用する。未知のオプションで Node CLI が失敗する点はコマンド構文によるもので、R3 の新しい肯定ケースが誤った証拠になっている。実際の対象Nodeでのこのコマンドの実行は本レビューでは行っていない。",
      "fix": "N2c の未知オプションの肯定ケースを削り、未知のオプション名については原則検出しない。認める名前は、対象 Node の既知のブール旗と、値つき旗の明示的一覧に限定する。既知の `--import=tsx --test` と `--test-reporter=spec --test` は肯定テストとして残す。未知の `--unknown-option=value --test` は否定テストにし、実装の対象Nodeの起動結果と照らす。",
      "confidence": "確認済み"
    }
  ],
  "previous": [
    {
      "id": "B1-D-R2-001",
      "assessment": "解消。I5(a)〜(c) は窓から消える位置をその窓で finding に確定し、次へ回す候補は保証された重なりに限る。I6 は既決の位置を再判定しない。L16(a)〜(g) に境界と繰り返しを追加した。実装は未検証。"
    },
    {
      "id": "B1-D-R2-002",
      "assessment": "部分的に解消。監視系の等号形・2語形・間接オプションは規則7と否定テストで覆った。ただし名前と値の正規化の追加により未知の値つきオプションを肯定する新しい偽陽性が生じている。"
    },
    {
      "id": "B1-D-R2-003",
      "assessment": "解消。I9 が位置別の除外数と、行・符号位置を鍵とする finding の重複排除を独立に定義し、L24 が混在、パス、窓、allow を検証する計画になった。"
    },
    {
      "id": "B1-D-R2-004",
      "assessment": "解消。時刻が異なれば別run、一致しても同じrunとは限らないという非対称の契約に修正。47-c-3 は同一ミリ秒の衝突を再現し、runIdを別項目として残した。"
    },
    {
      "id": "B1-D-R2-005",
      "assessment": "解消。APIの事前確認、取得不能時の扱い、20行上限と末尾サマリー、tailとの統合テストが具体化した。後続のstderrや早期中断による記録欠落も既知の限界として明記されている。"
    }
  ]
}
```
