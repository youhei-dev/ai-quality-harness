# ADR-0025 の追記の案（最終）: アクションの SHA を更新する手順（v0.17.1）

この案は `docs/adr/0025-self-ci-ubuntu-verify-not-required-yet.md` の末尾（v0.9.2 の注記の後）に足す節の文案。日付の行に「追記: 2026-xx-xx（v0.17.1。アクションの SHA の更新の手順）」を足す。既知の限界の「アクションの SHA を更新する手順（いつ・誰が）は決めていない」（40 行）は、書いた時点の記録として残し、この追記が閉じる。設計は batch3 の設計（最終）の §2.4。


**最終での変更**: R1 の案から変えていない（独立レビュー R1・R2 で指摘なし）。

---

## 追記（v0.17.1: アクションの SHA を更新する手順。人間の決定 B3-Q5）

### 文脈
- 決定 5 で、アクションは完全な commit SHA で固定した（`verify.yml` も同じ。ADR-0031）。更新の手順は決めていなかった（既知の限界）
- batch3 の範囲の洗い出し（2026-10-30）で、setup-node と setup-python に v7.1.0 が出ていた（今は v7.0.0。checkout は v7.0.1 が最新）

### 決定 9: アクションの SHA の更新
- **いつ**: batch の最初の版の着手前の確認で、使っているアクションの最新のリリースを見る（`gh api repos/<owner>/<名前>/releases/latest`）。ほかに、アクションの勧告・非推奨（実行環境の Node の版の終わりなど）を知ったとき（B3-D-Q12 の A。人間の決定）
- **誰が**: 実装する者が、アクションごとに今と新しい SHA・版・公開日・`action.yml` の違いの一覧を出し、人間が承認する（依存の更新と同じ扱い）
- **どう**:
  1. タグの ref を `gh api repos/<owner>/<名前>/git/ref/tags/<タグ>` で読む。object の type が `tag`（注釈付きタグ）なら、`gh api repos/<owner>/<名前>/git/tags/<sha>` で commit まで剥がす。`uses:` に書くのは commit の SHA
  2. 公開から 7 日を満たす版だけ（npm の `min-release-age=7` と同じ考え）
  3. `action.yml` を前の版と比べる（`runs.using`・入力・出力・`post`）。リリースの記述を読む
  4. `uses:` の行は完全な commit SHA と `# vX.Y.Z` のコメント。`.github/workflows/` のすべての同じアクションを同じ SHA にする
  5. PR の run で必須の 2 つが success
  6. CHANGELOG に、前と後の SHA と版を書く
- **適用先**: 再利用ワークフロー `verify.yml` の変更は、適用先が呼び出しの SHA を上げるまで届かない。上げる回（人間の決定 H11）に含める
- v0.17.1 の更新: setup-node `820762786026740c76f36085b0efc47a31fe5020`（v7.0.0）→ `949feb2413d6458794dcd2491c4babbbce0c15c1`（v7.1.0、2026-10-08 公開）、setup-python `5fda3b95a4ea91299a34e894583c3862153e4b97`（v7.0.0）→ `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0`（v7.1.0、2026-10-22 公開）。どちらも軽量タグ。`runs.using` は `node24` のまま、入力が増えただけ（aiqh は使わない）

### 既知の限界（足すもの）
- GitHub の設定 `sha_pinning_required`（完全な SHA を強制する）は、この手順とは別に、人間の承認の後に入れる（B3-Q7。入れたら ci 手順書 §3 に記録する）
- 新しい版の中身（`dist/` の JavaScript）は読んでいない。リリースの記述と `action.yml` の比べだけ
