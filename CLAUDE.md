# ai-quality-harness — プロジェクト固有ルール（Claude Code）

共通ルール（安全コア・依頼範囲・報告方針）は `~/.claude/CLAUDE.md` と `~/claude-projects/CLAUDE.md` に従う。
本書はこのプロジェクト固有の事項だけを書く。

## プロジェクトの性格

- AI 駆動開発向けの fail-closed な Quality Gate 実行基盤（`aiqh`）。本体は常にこのリポジトリに置き、対象リポジトリには設定ファイルとワークフロー参照だけを置く
- 将来 Public 化してポートフォリオに載せる前提。**会社固有の情報（社名・製品名・取引先・IP アドレス・社内パス・人名）をコード・設定・docs・テストデータのどこにも書かない**。例が必要なら架空の名前を使う
- 設計は `docs/ARCHITECTURE.md`、進行は `docs/ROADMAP.md`、設定仕様は `docs/CONFIG_SPEC.md`、判断の根拠は `docs/adr/`。設計判断を変えるときは ADR を追加する（既存 ADR は「置換」にして残す）

## 絶対ルール

- **fail closed**: 必須チェックが 1 つでも失敗すれば VERIFY FAILED（終了コード非ゼロ）。判定を緩める変更（SKIPPED を PASS 扱いにする、必須 0 件を許す、例外を握りつぶす等）は提案にとどめ、ADR と承認なしに実装しない
- **AI の回答を品質保証の根拠にしない**: 実装 AI・レビュー AI の「問題ない」は判定材料にしない。機械的に再現できる結果だけを Quality Gate に使う
- **マイルストーン終了時の自己 verify 必須**: `npm run verify` が PASSED でない状態でマイルストーンを完了扱いにしない。FAILED のまま報告する場合は FAILED と明記する
- **停止ポイント運用**: 依頼に停止ポイント（設計承認・最終報告）がある場合、承認前に次工程へ進まない。commit / push はユーザーの明示的指示後のみ
- **依存パッケージ**: 追加は承認された一覧の範囲だけ。実行時依存は最小限（ADR-0008）。npm の `min-release-age` 等の保護設定は迂回しない

## 作業ルール

- 作業用の一時ファイルは `tmp/` 配下（git 管理外）。デスクトップやホーム直下に置かない
- `artifacts/` は git 管理外（ADR-0007）。レビューパケットは `artifacts/ai-review/`、verify 出力は `artifacts/verification/`
- 人間向けの報告書は `docs/reports/`（git 管理）
- 停止ポイント・最終報告を Downloads に保存するときのファイル名は「claude提出」を含める（例: `claude提出_aiqh_<内容>_<YYYYMMDD-HHmmss>.md`）。ChatGPT 提出用 ZIP はレビューパケットのみを同梱し、自己評価を含む報告書は入れない
- 他プロジェクト（trim-manager、ai-tutor-browser 等）は設計の参考として読み取りのみ。変更しない
- **テスト用のダミー秘密値は、パターンに一致するリテラルをソースに置かず、実行時に文字列連結で組み立てる**（`tests/helpers.ts` の `fake(prefix, body)` を使う。例: `fake("AKIA", "ABCDEFGHIJKLMNOP")`）。push 前の secret ガード hook が合成値でも停止するため
- タグを付けるときは `package.json` の `version` をタグと一致させる（例: v0.2.0 なら `"version": "0.2.0"`。`aiqh --version` と package smoke test の version 照合がその値になる）
- **リリース手順の順序（M1-R1-001 で固定）**: commit（分割）→ **各 commit 単体の worktree 検証（typecheck / test / `npm run verify`）** → 作業ツリー clean の確認 → push → 注釈付きタグ → タグ push。
  worktree 検証で 1 件でも FAIL なら push もタグもせず停止して報告する。commit 前の自己 verify は新規ファイルが未追跡でも走査される（v0.2.1 以降）が、リリース判定の根拠は commit 済み HEAD での verify とする
- タグの SHA を文書（CHANGELOG・報告書）に書くときは `git rev-list -n1 <tag>` の commit SHA を主表記にする（`git rev-parse <tag>` は注釈付きタグのオブジェクト SHA。併記する場合は `/ tag object <SHA>` と明示）
- `git add -A` / `git add .` は禁止。対象ファイルを明示して stage し、`git diff --cached --name-only` で確認してから commit
- レビュー原文を `docs/reviews/` にコピーする際、Security Scan に一致する例示行（PEM の BEGIN / END 行、URL 認証情報の形など）は分割表記に変え、変更した原文の行番号と無改変の原文の SHA-256 をファイル先頭の注記に記録する（`security.allow` が M2 で入るまでの運用）

## 技術方針（要点）

- TypeScript 5.9 系、ESM、Node 24 以上。開発・テストは Node のネイティブ TypeScript 実行（`node src/cli.ts`）、配布物は `tsc` でビルドした `dist/`（`bin` は `dist/cli.js`）
- `erasableSyntaxOnly`: enum / namespace / パラメータプロパティは使わない。相対 import は `.ts` 拡張子付き
- チェックの実行経路は「設定 → 子プロセス → 終了コード」の 1 本（ADR-0005）。アダプタ（M1）は検出と推奨であり、別の実行経路を作らない
- レポートに書く文字列は必ず `maskDeep` を通す（ADR-0006）。マスクのパターン追加はテスト追加とセット

## コマンド

```bash
npm run verify        # 自己 verify（8 チェック: lint / typecheck / unit / unit-minpath / build / package / security / dependency）
npm run verify:dist   # ビルド済み dist/ で同じことを行う
npm run lint && npm run typecheck && npm test && npm run build
```
