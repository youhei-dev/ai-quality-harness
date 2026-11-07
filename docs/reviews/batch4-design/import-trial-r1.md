# review-import・review-check の今の振る舞いの実測（R1 の添付。設計 §3.2・§3.3 の根拠）

- 測った日: 2026-11-07。aiqh は基準の commit `3a6295a` のソース（`node src/cli.ts`、Node v24.13.1）
- 場所: 使い捨ての `--cwd`（場合ごとに別の場所。どれも空の `docs/reviews/` だけを持つ。git のリポジトリではない）。手元のパスは `<場所>`、原文の写しは `<原文>` と書く
- 原文: 指摘 0 件のレビュー `docs/reviews/batch3-v0171-impl/review-r1.md` の写し。JSON の `label` を `trial-a` に変え、場合ごとに `previous` を足した（本文は変えていない）。指摘のある原文は `docs/reviews/batch3-design/review-r2.md`（Medium 1 件、ID `B3-D-R2-001`）をそのまま
- 原文はすべて絶対パスで渡した（相対パスは `--cwd` を基準に解かれる。ADR-0026:30。1 回目は相対パスで渡して `[input] the review cannot be read (ENOENT)` の exit 2 になった）

## 1a: round 1 の `previous`

コマンド: `node src/cli.ts review-import <原文> --label trial-a --round 1 --id-prefix TRIAL --cwd <場所>`、続けて `node src/cli.ts review-check --label trial-a --cwd <場所>`

| 場合（JSON の `previous`） | review-import の exit | 出力の最後の行 | 書いたもの | review-check の exit | review-check の出力 |
|---|---|---|---|---|---|
| 無い | 0 | `REVIEW LOOP: complete` / `REVIEW IMPORT: written` | `findings-r1.json` | 0 | `REVIEW LOOP: complete` / `REVIEW CHECK: passed` |
| `[]` | 0 | 同上 | 同上 | 0 | 同上 |
| `[{"id": "B3-D-R2-001", "assessment": "解消（限定した解決方針として）"}]`（別のラベルの ID） | **0** | `REVIEW LOOP: unknown (aiqh review-check --label trial-a shows why)` / `REVIEW IMPORT: written` | `findings-r1.json`（`previous` をそのまま持つ） | **2** | `[previous] findings-r1.json has 1 previous entry (there is no round 0)` / `REVIEW CHECK: failed (error)` |
| `[{"id": "TRIAL-R1-001", "assessment": "解消"}]`（この回の ID） | 2 | `[id-mention] TRIAL-R1-001 (line 71) is an ID of this round that is not a finding of the JSON`、同じ ID の JSON の文字列の中の 1 件、`2 problem(s); the review is not imported` / `REVIEW IMPORT: not written (error)` | 何も書かない | 2 | `[files] docs/reviews/trial-a does not exist (no findings file to check)` |

## 1c: `--id-prefix` が `-R<数>` で終わるとき

| 原文 | コマンドの違い | exit | 出力 |
|---|---|---|---|
| 指摘 0 件（`previous` 無し） | `--id-prefix TRIAL-R1` | **0** | `aiqh review-import — trial-a R1 (TRIAL-R1)` / `REVIEW LOOP: complete` / `REVIEW IMPORT: written`（`idPrefix` は `TRIAL-R1` のまま記録される） |
| 指摘 1 件（`batch3-design` R2） | `--label batch3-design --round 2 --allow-missing-previous --id-prefix B3-D-R2` | 2 | `[id] findings[0].id is not of the form B3-D-R2-R2-NNN` / `1 problem(s); the review is not imported` |
| 同上（対照） | `--id-prefix B3-D` | 0 | `High 0 / Medium 1 / Low 0; open 1` / `REVIEW LOOP: unknown (…)`（前の回が無い場所なので） / `REVIEW IMPORT: written` |

## 1b: `--cwd` に `docs/reviews/` が無いとき

| `--cwd` | exit | 出力 |
|---|---|---|
| 空の場所（`docs/reviews/` 無し） | 2 | `[repository] docs/reviews is not a directory in the repository directory; run at the repository root or give --cwd` / `REVIEW IMPORT: not written (error)` |

## 既存の記録とテスト（読んだだけ）

- `docs/reviews/*/findings-r*.json` の 27 ファイル: round 1 で `previous` が空でないものは 0。接頭辞は 19 種類（`B1-D`・`B1-I132`・`B1-I140`・`B1-I150`・`B2-D`・`B2-I151`・`B2-I160`・`B2-I170`・`B3-D`・`B3-I171`・`B3-I180`・`I48-D`・`I48-I`・`M2-2-PS`・`M2-2-RC`・`M2-2-RI`・`M4-B`・`M4-D`・`M4-H`）で、`-R` と数字で終わるものは 0
- 接頭辞の形の規則: `ID_PREFIX_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){0,7}$/`（`src/review/import.ts:32`）、使い方の検査は `src/commands/review-import.ts:87`
- round 1 の `previous` の検査は review-check だけ（`src/review/check.ts:119-121`）。`src/review/import.ts` は `previous` を形（`{id, assessment}` の配列、200 件まで）だけ確かめる（`:38`・`:58`・`:75`）
- テスト: round 1 に空でない `previous` を取り込んで通ることを期待するものは見当たらない（`tests/review-import.test.ts:191-200` の 3 回の取り込みは、round 1 の `previous` が `[]`）。`tests/review-check.test.ts:448-452` が review-check の側を確かめる
- 実測の後、本体の作業ツリーの `git status --short` は空のまま（何も書いていない）
