# ADR-0013 の追記の案（最終）: masker の private-key を線形の走査に（v0.18.0。ROADMAP の項目 40）

この案は `docs/adr/0013-window-scan-completeness.md` の末尾（v0.5.41 の追記の後）に足す節の文案。日付の行に「追記: 2026-xx-xx（v0.18.0。masker の private-key を線形の走査に: 項目 40）」を足す。設計は batch3 の設計（最終）の §4。


**最終での変更**: R1 の案から変えていない（独立レビュー R1・R2 で指摘なし）。

---

## 追記（v0.18.0: masker の private-key を線形の走査に。ROADMAP の項目 40）
- **問題**: masker の private-key の正規表現（`pattern`。BEGIN の行の印〈5 つのハイフン・`BEGIN `・ラベル `[A-Z0-9 ]*`・`PRIVATE KEY`・5 つのハイフン〉の後に遅延の `[\s\S]*?` と END の行の印、フラグ g）は、END の印が後ろに無い BEGIN の印のたびに、入力の末尾まで END の印を探して戻る。BEGIN の行だけを繰り返した入力では、時間が入力の長さの 2 乗になった（ROADMAP の項目 40 の記録: 64 KiB 15 ms・256 KiB 222 ms・1 MiB 3,895 ms。batch3 の設計の段の CPU 時間: 64 KiB 5.1 ms・256 KiB 73.2 ms）。マスクに渡る文字列は 64 KiB 以下（レポートの末尾）と 1 行 4,096 以下（端末の行・パーサの名前）なので、止まらなくはならないが、ADR-0028 のパーサが入力全体をマスクしない理由の 1 つだった
- **決定**: `maskSecrets` はこの正規表現を実行せず、`src/security/mask.ts` の `maskPrivateKeys` が、同じ一致と同じ置換（`[REDACTED:private-key]`）を線形の時間で求める
  1. ラベルの文字のクラス `[A-Z0-9 ]` は `PRIVATE KEY` の文字を含み、`-` を含まない。そのため印は、頭（`-----BEGIN ` か `-----END `）の後ろのラベルの文字の最も長い連なりが `PRIVATE KEY` で終わり、直後に 5 つのハイフンが続くときだけ一致する。連なりを 1 回読めば決まる
  2. 遅延の本文は、BEGIN の印の終わり以降で最初に END の印が一致する位置まで。`-----END ` の候補を前から順に 1 で調べる
  3. BEGIN の印の終わり以降に END の印が無ければ、それより後ろのどの BEGIN の印にも END の印は無い。走査はそこで止める
  4. 一致した後は、その終わりから次を探す（g の置換と同じ。一致は重ならない）
  - 読む量は入力の長さに比例する（BEGIN の候補の連なりは重ならず、END の探索は一致の終わりから先だけを読む）
- **定義は変えない**: `pattern` は定義として残す。テスト（`tests/regression-item40-private-key-linear.test.ts`）が今の正規表現を正解として持ち、固定の seed のランダムな入力、`tests/regex-equivalence-inputs.ts` の private-key の入力、走査の弱点を狙った入力で、`maskSecrets` の出力が正解の正規表現の masker と完全に一致することを確かめる。時間は、BEGIN の行だけの繰り返しなどの 256 KiB と 1 MiB の CPU 時間の比（`t(1 MiB) ≤ 8 × t(256 KiB) + 20 ms`、3 回の最小。53-F の形。`docs/ops/ci-and-branch-protection.md` の 8-1）で確かめる
- **scanner は変えない**: scanner の private-key は行の単位の block の読み（`scanMode: "block"`。BEGIN の行から END の行まで、無ければファイルの終わりまで。fail closed）で、この正規表現を使わない
- 秘密鍵の印は、ソースでもテストでも部品から組み立てる（BEGIN・END の行の全体を書かない。自己の security の走査に当たらないように）
