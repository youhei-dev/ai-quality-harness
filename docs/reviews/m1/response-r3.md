# M1 独立レビュー R3 への対応記録（response-r3）— M1 完了、M2-0 へ持ち越し

- 対象レビュー: `docs/reviews/m1/independent-review-r3.md`（受領ファイル名 `independent-review-m1-r3-for-claude.md`、2026-09-20 付、SHA-256 62e61fb1…。
  M1-R3-001〜005: High 0 / Medium 4 / Low 1。R2-004 / R2-005 は PARTIAL と再判定、R1-005 / R1-009 の PARTIAL は解消と判定。対象 v0.2.2 = commit f958ac7 / tag object 9506eed）
- 対応日: 2026-09-20
- 人間の判断: 事前の基準「R3 で High が無ければ M1 完了」により **M1 は v0.2.2 を完了ベースライン**とする。R3 の 5 件は修正せず、**M2 の最初のマイルストーン
  M2-0「スキャナ保守」へ持ち越す**（key-value 走査・`security.allow` と同じ塊）。今回はコード変更なし。完了記録（docs）だけを commit し `v0.2.3` を付ける（M0 の v0.1.5 と同じ扱い）
- 原文コピー: スキャナに一致する例示 2 行（原文 53 行目の URL 認証情報の形、236 行目の 1 行 PEM）を分割表記に変え、先頭注記に変更行番号と SHA-256 を記録
- 再現確認は `tmp/m1r3/repro.mjs` / `repro2.mjs`（使い捨て、git 管理外）で v0.2.2 の実コードに対して行った。**回帰テストはリポジトリに追加していない**
  （M2-0 で「修正前 FAIL」の記録とともに追加する。失敗するテストや skip テストを残さないため）

## 判定と対応

| ID | 重要度 | 判定 | 対応 | 根拠（実コード） | 再現確認の結果（v0.2.2、使い捨てスクリプト） | M2-0 で必要なテスト |
|----|--------|------|------|-----------------|------------|------------|
| M1-R3-001 | Medium | VALID | **M2-0 へ持ち越し** | `LineAssembler.push()` は保持が `MAX_LINE_BYTES` を超えると区間を走査し末尾 `LINE_OVERLAP`（4 KiB）だけを残す。開始が重なりより前で終端が次区間にある秘密は、前区間では終端未到達、次区間では先頭が消えて一致しない（Known Risk として記載済みの既知の偽陰性） | 改行なしファイルでは 64 KiB × 5 = 327,680 文字で最初の区間が出る。5,026 文字の url-credential を区間末尾の 4,500 文字前から置く → **0 件**。同じ資格情報を重なり内（3,000 文字前）に置く → 1 件、短い行に置く → 1 件 | 4 KiB 超の url-credential / JWT を区間境界にまたがせて「検出」または「fail closed（finding / ERROR）」を固定。候補プレフィックスを次区間へ持ち越す状態機械、または候補が安全上限を超えたら finding / ERROR |
| M1-R3-002 | Medium | VALID | **M2-0 へ持ち越し** | `runInit()` の `--write-gitignore` は `hasGitignoreLine(current)` が真なら何も書かない。`artifacts/` + `!artifacts/` では `proposeGitignore()` が needed = true でも同じ行があるため追記されず、否定が修復されない | `artifacts/` + `!artifacts/` で `runInit({ writeGitignore: true })` → exit 0、「already contains "artifacts/"; nothing written」、実行後も `git check-ignore artifacts/.aiqh-ignore-probe` は非 ignore、needed = true のまま | 同 .gitignore で書込後に probe が ignore されること、2 回目の実行で行が増えないこと（needed が false になれば追記しない = 冪等） |
| M1-R3-003 | Medium | VALID | **M2-0 へ持ち越し** | `GITIGNORE_PROBE = "artifacts/.aiqh-ignore-probe"` 1 個の固定 sentinel だけで判定。sentinel だけを ignore するルールで needed = false になる | `.gitignore` が `artifacts/.aiqh-ignore-probe` のみ → needed = **false**。`git check-ignore`: probe は ignored、`artifacts/verification/latest.json` は NOT ignored | sentinel のみのルールで needed = true。実生成パス複数（`artifacts/verification/latest.json` / `latest.md`、`artifacts/ai-review/…`）で判定するか、`artifacts/` ルール自体の有効性を判定 |
| M1-R3-004 | Medium | VALID | **M2-0 へ持ち越し** | `gitIgnoredByRepoRules()` は一致元の basename が `.gitignore` かだけを見て、その `.gitignore` が追跡済みかを確認しない。未追跡のローカル `.gitignore` でもカバレッジありになる（グローバル除外・`.git/info/exclude` をクローン固有として数えない設計と不整合） | tracked = `a.txt` のみ、未追跡 `.gitignore`（`.env` / `.env.*`）→ gitignore finding **0 件**、`filesUntracked` = 1（`.gitignore` は未追跡テキストとして走査されるだけ） | 未追跡 `.gitignore` だけが `.env*` を ignore するリポジトリで gitignore finding が残ること。一致元の `.gitignore` が `git ls-files` 上で追跡済みであることを条件に加える（ネストも各 source を個別確認） |
| M1-R3-005 | Low | VALID | **M2-0 へ持ち越し** | `scanFile()` の `seen` による重複統合は行指向 scanner だけに適用され、block scanner（PEM）の finding には適用されない | 改行なし長行の最初の区間末尾（重なり内）に 1 行完結の PEM ブロックを置く → private-key finding **2 件**（どちらも 1-1） | 重なり内の 1 行完結 PEM で finding が 1 件になること（`block:<category>:<beginLine>:<endLine>` で統合） |

INVALID / PARTIAL: なし。R2-004 / R2-005 のレビュアー再判定（PARTIAL）は妥当で、その残りが 001 / 005（R2-004）と 002 / 003（R2-005）。
R1-005 / R1-009 の PARTIAL は解消（レビュアー判定と一致）。High なし → 人間の事前基準により M1 完了。

## M2-0「スキャナ保守」の項目（ROADMAP に転記）

1. M1-R3-001（窓境界をまたぐ長いトークン）
2. M1-R3-002（`--write-gitignore` が否定ルールを実際に修復する）
3. M1-R3-004（カバレッジに使う `.gitignore` が追跡済みであること）
4. M1-R3-003（固定 sentinel 1 個をディレクトリ全体のカバレッジと同一視しない）
5. M1-R3-005（PEM ブロック finding の重複統合）
6. key-value 分類の走査（誤検出抑制つき）と `security.allow`
7. `.env` 判定の代表パス・example サフィックスの設定化、窓走査の上限 / 重なりの設定化

## レビュアーの「見ていない範囲」に対する所見

- v0.2.2 のタグ・7 commit の worktree 検証・10 回連続実行は本体側で実施済み（M1R2 最終報告）。今回の再現はレビュアーと同様に v0.2.2 の実コードを直接呼び出して行い、
  レビュアーが「packet 掲載アルゴリズムでの再現」とした 001 は実リポジトリでも再現した

## 教訓

- 有限の重なりでは長さ上限のないパターンを完全には走査できない。「検出できないことがある」と書いた Known Risk は、次のレビューで具体的な再現条件として返ってくる。
  境界条件は Known Risk に書くだけでなく、fail closed（finding / ERROR）に倒すか状態機械で塞ぐ
- 「判定」と「修復」の両方が同じ意味論を持つこと（提案は Git に聞くのに書込は行一致、では修復できない）
- 代表パス 1 個の sentinel は、その sentinel だけを狙ったルールに弱い。実生成物のパスで判定する
- 「クローン先に存在するか」を保護の条件にするなら、`.gitignore` 自体の追跡状態も条件に含める
- 重複統合のような横断的な処理は、走査経路（行指向 / ブロック）ごとに漏れがないかを確認する
