# M0 / R1 独立レビュー R2 — Claude Code 修正依頼用

対象: `ai-quality-harness` M0 / R1  
レビュー資料: `review-packet-m0-r1.md`  
対象コミット: `c80231e`（packet記載）  
レビュー観点:
- 各修正がレビュー指摘 R-001〜R-013 の再現条件を本当に潰しているか
- 修正で新たな漏れや退行を生んでいないか
- 特にマスク規則、`killTree`、`realpath` 判定
- R-008 / R-010 / R-011 / R-012 / R-013 の持ち越し判断が妥当か

## Claude Code への依頼

以下は R1 修正後の独立レビュー結果です。

各指摘について、実コードを確認して次のいずれかを判定してください。

- `VALID`: 指摘どおり問題がある
- `PARTIAL`: 一部のみ問題がある
- `INVALID`: 指摘は成立しない

`INVALID` / `PARTIAL` と判断する場合は、必ず実コード・テスト結果・仕様のいずれかを根拠として説明してください。

`VALID` の場合は、M0 の要求範囲を逸脱しない最小修正を行い、回帰テストを追加してください。

優先度は次の順です。

1. R2-001
2. R2-002
3. R2-003
4. R2-004
5. R2-005

---

## R2-001

- **ID:** R2-001
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/security/mask.ts` — `key-value` rule
- **内容:** R-003 の「引用符付き値を閉じ引用符までマスクする」修正が不完全。値の中に反対種類の引用符が含まれるだけで、秘密値の後半が漏れる。
- **根拠:** 現在の quoted value 部分は `[^"'\r\n]+?` となっており、開始引用符が `"` でも `'` でも、両方の引用符を値の途中で許容しない。本来は `"` で開始した値なら `'` は普通の値文字として扱えるべきで、逆も同様。
- **独立確認:** 掲載コード相当で以下を確認。
  - `password="pa'ss word"` → `password="[REDACTED:key-value]'ss word"` 相当になり、`'ss word` が残る。
  - `password="'secret value'"` のようなケースでは、値全体が無加工で残る経路もある。
- **既存テストの不足:** R1 テストには空白入り quoted value はあるが、値内に反対種類の quote を含むケースがない。
- **修正案:**
  - single quote と double quote を別 alternative に分ける。
  - double quote 値では `'` を通常文字として許容し、single quote 値では `"` を通常文字として許容する。
  - escaped quote も考慮する。
  - 正規表現が複雑になりすぎる場合は、`key=` 検出後に小さな scanner で quoted value を読む方が安全。
- **追加すべき回帰テスト:**
  - `password="pa'ss word"`
  - `password='pa"ss word'`
  - `password="abc\"def ghi"`
  - `password='abc\'def ghi'`
  - 閉じ quote がない場合の fail-safe 方針

---

## R2-002

- **ID:** R2-002
- **重要度:** High
- **種別:** バグ
- **対象:** `src/runner/execute.ts` — timeout / `finish()` / `killTree()`
- **内容:** R-004 の SIGKILL 修正は通常の回帰テストでは成功するが、TERM を無視する子孫が stdout/stderr を閉じると、SIGKILL timer が cancel され、子孫が生存する経路がある。
- **根拠:** timeout 時は SIGTERM 後に SIGKILL timer を設定するが、ChildProcess の `close` が来ると `finish()` が無条件で `clearTimeout(killTimer)` し、`activeChildren` からも削除する。R1 の `killTree()` 自体は leader 終了後も PGID を kill するよう正しく改善されているが、SIGKILL が呼ばれる前に timer 自体が消える経路が残る。
- **独立確認:** TERM を無視する grandchild が stdout/stderr を閉じて同じ process group に残るケースでは、shell leader の `close` → SIGKILL timer clear → grandchild 生存となる状態を再現。
- **既存テストの不足:** R1 regression test は grandchild が stdio pipe を保持したままなので、Node の `close` が SIGKILL まで遅れ、この経路を検出しない。
- **追加懸念:** CLI の SIGINT / SIGTERM 経路も SIGTERM のみ送り、200ms 後に親を終了するため、TERM を無視する子孫を残す可能性がある。
- **修正案:**
  1. timeout 済みの場合、leader の `close` だけを理由に SIGKILL timer を cancel しない。
  2. SIGTERM 後に PGID が残っている間は escalation を維持する。
  3. SIGKILL 後、または group 不存在確認後に cleanup 完了とする。
  4. timeout cleanup 用 SIGKILL timer の `unref()` も再検討する。
  5. CLI signal handling も同じ process-group cleanup 経路へ統合する。
- **追加すべき回帰テスト:**
  - grandchild が fd 1 / 2 を閉じる
  - SIGTERM を無視する
  - leader は先に終了する
  - grace 後に grandchild PID が消えていることを確認する

---

## R2-003

- **ID:** R2-003
- **重要度:** Medium
- **種別:** セキュリティ
- **対象:** `src/config/load.ts` — `realpathNearest()`
- **内容:** R-005 の通常 symlink escape は修正できているが、dangling symlink（リンク自体は存在するがリンク先がまだ存在しない）を普通の「未作成 path」と誤認する。
- **根拠:** `realpathNearest()` は `existsSync()` を使って existing ancestor を探す。Node の `existsSync()` は dangling symlink に対して false になるため、symlink entry 自体を見落として親へ上がり、その symlink 名を単なる未作成 segment として再連結する。また `realpathSync()` 失敗時も lexical path へ fallback する。
- **独立確認:** 
  - `root/link -> /outside/future`
  - `/outside/future` はまだ存在しない
  - この状態では current implementation 相当の realpath check を通過する
  - 後で `/outside/future` が作られると、同じ `root/link` は root 外へ解決される
- **R1 修正で正しく潰れている範囲:** 既に存在する root 外 symlink、およびその下の未作成 leaf は拒否できている。
- **修正案:**
  - ancestor 探索を `existsSync()` ではなく `lstatSync()` ベースにする。
  - dangling symlink も filesystem entry として認識する。
  - symlink の `realpath` が解決不能なら安全側に `ConfigError` とする。
  - `realpathSync()` 例外を無条件で lexical path に戻さない。
- **追加すべき回帰テスト:**
  - root 内 dangling symlink → root 外の未作成 target
  - root 内 dangling symlink → root 内の未作成 target
  - broken symlink を `cwd` と `output.dir` の両方で確認

---

## R2-004

- **ID:** R2-004
- **重要度:** Medium
- **種別:** セキュリティ
- **対象:** `src/security/mask.ts` — `bearer` / `basic`
- **内容:** R-002 の指定された再現ケースは修正されているが、明示的な Authorization credential でも heuristic によりマスクされないケースが残る。ADR の「取りこぼしより誤検出を選ぶ」という方針とも逆向き。
- **根拠:**
  - Bearer は現在も 16 文字以上の下限があるため、`Authorization: Bearer abc123` のような短い credential は無加工。
  - Basic は UTF-8 decode 後に replacement character 等があると credential ではないと判定するため、byte credential としては妥当でも UTF-8 として invalid な値を漏らす可能性がある。
- **独立確認:** `Authorization: Basic dXNlcjr/` のように decode bytes が `user:` + non-UTF-8 byte になる値は現行ロジック相当ではそのまま残る。
- **修正案:** Authorization header と一般文章を分けて扱う。
  - `Authorization: Bearer <token>` は token 長に依存せずマスク。
  - `Authorization: Basic <token>` は syntactically base64 ならマスク。
  - 一般文章中の裸の `Bearer ...` / `Basic ...` にだけ現在の誤検出抑制 heuristic を適用する。
- **追加すべき回帰テスト:**
  - short Bearer in Authorization header
  - short Basic
  - non-UTF-8 Basic payload
  - prose 中の `Basic auth`
  - prose 中の `bearer authentication`

---

## R2-005

- **ID:** R2-005
- **重要度:** Medium
- **種別:** テスト不足
- **対象:** R-008 carry-over / `package.json` / distribution smoke test
- **内容:** R-008 を M1 へ持ち越す判断は弱い。`npx aiqh verify` は元の M0 要求そのものなので、M0 の受入テストとして今確認すべき。
- **根拠:** M0 原要求には CLI として `npx aiqh verify` が明記され、`bin` は built `dist/cli.js` を指すことも要求されている。R1 では配布設計が M1 で決まるため持ち越しとしているが、既に v0.1.0 tag と built dist が存在する以上、package smoke test 自体は実施可能。
- **修正案:** M1 へ持ち越さず M0 で次を追加する。
  1. `npm pack`
  2. temporary directory 作成
  3. tarball install
  4. minimal `aiqh.config.jsonc` を作成
  5. `npx --no-install aiqh verify`
  6. exit 0 / report output を確認
- **理由:** 新機能追加ではなく、既存 M0 要求の acceptance test なので scope 拡大には当たらない。
- **同時に確認できる項目:**
  - `bin`
  - shebang
  - `dist/` 同梱
  - `package.json` の `files`
  - runtime dependency 同梱
  - 実 package からの version 読み込み

---

# R-001〜R-013 に対する今回の判定

## 修正済みと判断

以下は、元の R1 指摘の具体的再現条件については解消されていると判断する。

### R-001
`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`、`MY_API_KEY`、`FOO_PASSWORD`、`XXX_TOKEN` 等の prefixed key-value は対象化されている。

**今回の追加指摘:** なし。

### R-002
lowercase `bearer` と short Basic `dTpw` という前回の具体的再現条件は解消。

**今回の追加指摘:** R2-004（Authorization 文脈でも heuristic による漏れ）。

### R-003
`password="abc def ghi"` の単純 quoted whitespace ケースは解消。

**今回の追加指摘:** R2-001（quote 内に反対種類の quote があるケース）。

### R-004
保存した PGID へ leader の終了状態に関係なく signal を送る変更自体は正しい。

**今回の追加指摘:** R2-002（`close` が escalation timer を消す lifecycle 問題）。

### R-005
既存の root 外 symlink、およびその配下の未作成 leaf は拒否できている。

**今回の追加指摘:** R2-003（dangling symlink）。

### R-006
trust boundary を README / ARCHITECTURE に明示し、M3 / M4 の mitigation に繋げた判断は妥当。

### R-007
report write failure を `VERIFY ERROR` に統一し、exit 0 / 1 / 2 と PASSED / FAILED / ERROR を固定した変更は妥当。

### R-009
`dirty: null` と `unknown` 表示への変更は妥当。

---

# 持ち越し判断

## R-008

**M0 で解消推奨。**

理由:
- `npx aiqh verify` は M0 原要求。
- packaging test は新機能ではなく acceptance test。
- `v0.1.0` / dist が既にあるため今すぐ検証可能。

→ R2-005 として指摘。

## R-010

**M4 持ち越しで妥当。**

M0 は逐次実行であり、concurrent `latest.json` / `latest.md` の不整合は現在の主要ユースケースでは即時 blocker ではない。

ただし roadmap から落とさないこと。

## R-011

**M3 持ち越しは許容。**

- Linux は「設計上対応、未 CI 検証」と明記済み。
- Windows は M0 対象外と文書化済み。

未検証を隠していない点は妥当。

## R-012

**M1 持ち越しで妥当。**

Security Scan adapter 自体が M1 なので、masker と scanner の共通 corpus / compatibility test を M1 で入れるのは自然。

pre-push hook は project 外共通設定という前提なら、M0 で直接変更しない判断も妥当。

## R-013

**将来 / parallel execution 導入時で妥当。**

M0 は sequential execution なので、10 MiB × stdout / stderr は理想的ではないが、現時点では correctness blocker ではない。

---

# 指摘なしと判断した観点

今回の R1 修正について、以下は妥当と判断する。

- `GitInfo.dirty` の tri-state 化
- `dirty: null` を Markdown で `unknown` と表示
- exit code 0 / 1 / 2 と `PASSED` / `FAILED` / `ERROR` の対応
- report write failure で `PASSED` を出さない変更
- leader 終了後にも PGID へ signal を送る `killTree()` の基本方針
- 既に存在する外向き symlink を realpath で拒否する方針
- key-value prefix 拡張で `AWS_*` 等をマスクする変更
- false positive を許容する ADR 方針に照らし、`CSRF_TOKEN` 等までマスクすること自体
- R-006 の trust boundary 文書化
- R-010 / R-011 / R-012 / R-013 の持ち越し先を ROADMAP に明記したこと

---

# 見ていない / 独立検証していない範囲

今回レビューした根拠は `review-packet-m0-r1.md` に掲載されたコード全文・diff・テスト内容。

以下は独立実行していない。

- GitHub 上の commit `c80231e` と packet 掲載内容が完全一致するか
- 実際の 97 tests の実行ログ
- `npm audit` の実行結果
- push / tag の実在確認
- Linux での process-group 動作
- Windows
- `npm pack` packaging
- masker と pre-push hook regex の一致
- repo 全ファイルの未変更部分

一方、R2-001〜R2-004 については、packet 掲載コード相当の最小再現ロジックで境界条件を独立確認した。

---

# 推奨対応順

1. **R2-001** — quoted secret の実漏洩
2. **R2-002** — timeout 後に process が残る lifecycle 問題
3. **R2-003** — dangling symlink による containment bypass
4. **R2-004** — Authorization credential の検出漏れ
5. **R2-005** — M0 packaging acceptance test

特に R2-001 と R2-002 は、R1 で修正したロジック自体をもう一段修正する必要があるため、M0 / R1 完了判定前に対応することを推奨する。
