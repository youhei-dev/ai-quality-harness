> 収録の注記（実装者が追記した。原文ではない）: 以下は受領した原文 `independent-review-backlog-23-r1-for-claude.md`（2026-10-11 受領、15,927 バイト、LF 361・CR 0・TAB 0・U+FFFD なし）を**一字も変えずに**収録したもの。無改変の原文の SHA-256: `f1a618a1d17314fad12ab13c97691980d6d129af4123fb800888b4f1dd4bb1ac`。Security Scan に一致する例示行・変更した原文の行番号: なし。

---

# independent review — backlog 23 / R1

対象: バックログ 23 / N1（`v0.5.36..v0.5.37` のうち、`aiqh init` の symlink 書込先の変更だけ）

レビュー方法: 添付パケットの `# Request`、`src/commands/init.ts` の差分と変更後全文、新規 `tests/regression-backlog23-init-symlink-outside.test.ts`、変更された `tests/regression-backlog8a-o7-o8-init-dangling-link.test.ts`、README、CONFIG_SPEC、ARCHITECTURE、ADR-0022、CHANGELOG の該当箇所を静的に読んで判断した。依頼どおり、コード・テストは実行していない。バックログ 6・17・24・25・26 その他はレビュー対象外とした。

## 指摘

### B23-R1-001

- **ID**: B23-R1-001
- **重要度**: Low
- **種別**: テスト
- **対象**:
  - `tests/regression-backlog23-init-symlink-outside.test.ts`
  - `tests/regression-backlog8a-o7-o8-init-dangling-link.test.ts`
- **内容**:

  新しい6件は主要な3書込先について「絶対パスで root 外を指す symlink」を拒否することと、config / `.gitignore` について root 内を指す相対 symlink を通すことを固定している。

  ただし Request が境界例として挙げている次の形は、直接の回帰テストが無い。

  1. **project root 自体が symlink** の場合
  2. **外を指す相対 symlink**（例: project から `../outside/file`）
  3. **多段 symlink**（中の link → 別 link → 外、または一度外へ出る link → 最終的には root 内）
  4. 大文字小文字を区別しない filesystem で、root / target を異なる case の表記から解決した場合

  コードを読む限り、1〜3 は `realpathSync(root)` と `realpathSync(file)` が最終の実体へ解決してから比較するので正しく動くと判断する。4についても、両辺を `realpathSync()` に通してから比較する設計は妥当で、外を内と誤認するコード上の経路は見つからなかった。

  したがってこれは実装バグではなく、**将来 `realpath` を lexical path に置き換える、比較条件を変える等の回帰に対するテストの不足**として Low とする。

- **根拠**:

  **確認済みの事実**:

  - 新テストの外向き3件は、いずれも `symlinkSync(path.join(outside, ...), path.join(proj, ...))` で、絶対パスの target を使っている。
  - root 内 control は、
    - config: `config/aiqh.jsonc`
    - `.gitignore`: `gitignore.shared`
    という相対 symlink を使っている。
  - root 自体を symlink にした test は無い。
  - symlink の target が別 symlink である chain test は無い。
  - case-insensitive filesystem を前提に case を変えた test は無い。
  - `assertLinkInsideRoot()` 自体は `realpathSync(file)` を使うので、file の symlink chain は最終 target まで解決する。
  - root 側も `realpathSync(root)` を使うので、root 自体が symlink でも実 root 同士で比較する。
  - 判定は `rel === ".."` または `rel.startsWith(".." + path.sep)` なので、root 内の名前 `..foo` は誤って outside にはならない。

  **推測**:

  - macOS の通常の case-insensitive filesystem で `realpathSync()` が root と target を同じ filesystem 上の canonical spelling に揃える挙動は一般的だが、このレビューでは実機で case variation を作って確認していない。
  - 現コードに外向き bypass は見つからないため、上記の不足が現在の不具合を隠しているとは判断していない。

- **修正案**:

  軽い回帰テストとして、最低限次の3件を追加すると境界が明確になる。

  1. root 自体を symlink にして、その内側を指す write target が通る
  2. `../outside/file` のような外向き相対 symlink が exit 2
  3. 二段 link の最終 target が外なら exit 2、最終 target が root 内なら通る

  case-insensitive filesystem の test は CI 環境依存になるため、macOS 専用 test にするか、実行環境が case-insensitive と確認できる場合だけ走らせる程度でよい。

- **確度**: 確認済み（テストケースの不足） / case-insensitive filesystem 上の実挙動は未実測

---

## 全体の結論

**High・Medium はありません。**

- High: 0
- Medium: 0
- Low: 1 — B23-R1-001

`assertLinkInsideRoot()` の現在の実装には、root 外を指す symlink を root 内と誤認して書いてしまう経路を見つけなかった。

特に、比較対象を lexical な `root` / link target text のまま扱わず、

- `realpathSync(root)`
- `realpathSync(file)`

という最終実体同士にした上で `path.relative()` を使っている点は、この用途に合っている。

Request の結果の扱いに従えば、**High・Medium が 0 なので、この R1 でレビューを終了してよい**と判断する。

---

## 問い1 — 内外の判定は正しいか

### 結論: **問題なし**

`assertLinkInsideRoot()` は write target 自身が symbolic link の場合だけ、

1. `target = realpathSync(file)`
2. `realRoot = realpathSync(root)`
3. `rel = path.relative(realRoot, target)`
4. `rel === ".."` / `../` で始まる / absolute なら outside

と判定する。

この方法について、外を内と誤認する形は見つからなかった。

### `..foo`

正しく inside と扱う。

たとえば root 内の `..foo/x` への relative は `..foo/x` であり、

- `rel === ".."` ではない
- `".." + path.sep` では始まらない

ので reject されない。これは正しい。

### root 自体が symlink

正しく扱える設計。

root の lexical path ではなく `realpathSync(root)` を比較に使うので、root 自体が symlink でも実体の directory を基準にする。

write target の realpath も同じ実体 root 配下なら relative は inside になる。

### link chain: 中 → 外

`realpathSync(file)` は link chain の最終実体まで解決するので、最終 target が root 外なら relative は `..` 側になり reject される。

### link chain: 外を経由 → 最終的に中

判定するのは最終実体なので allow される。

これは write が最終的に root 内 file へ届くため、今回の「root 外への書込を止める」という保証に照らして妥当。

### 外を指す相対 link

symlink に保存されている text が相対か絶対かは判定に使っていない。

`realpathSync(file)` 後の絶対実体を比較するので、`../outside/file` でも final target が root 外なら reject される。

### sibling や prefix が似た directory

たとえば root `/x/proj` に対して target `/x/proj2/file` は `path.relative()` では `../proj2/file` になる。単純な文字列 prefix 判定ではないため、`proj` / `proj2` の取り違えはない。

### 補足

TOCTOU と hardlink は Request の既知の限界なので再指摘しない。

---

## 問い2 — 大文字小文字を区別しない filesystem

### 結論: **外を内と誤認する実装上の問題は見つからない。実機 case variation は未確認**

重要なのは、比較前に root と target の両方を `realpathSync()` に通していること。

このため、利用者が `cwd` を異なる case で指定した lexical spelling を、そのまま `path.relative()` に入れてはいない。

少なくともコードから、case の違いだけで **root 外の別 file が root 内の descendant に変わる**経路は見つからない。

一方、case-insensitive / case-preserving filesystem で `realpathSync()` がどの spelling を返すかを、このレビューでは macOS 実機で試していない。そのため case variation の回帰 test が無い点は B23-R1-001 に含めた。

仮に spelling の不一致が出たとしても、考えやすい失敗方向は inside target を lexical に `..` と見てしまう **false reject** であり、外 target を inside として通す根拠は見つからない。

---

## 問い3 — 拒否の位置と順序

### 結論: **妥当**

### config の `--write`、`--force` なし

既存 file がある場合は、

`already exists (use --force...)`

が先に働き、symlink outside の検査まで行かない。

これは Request が明示している既存順序とコードが一致する。

`--force` の場合は existing check を通過し、dangling check → outside check → write になる。

したがって outside link を `--force` で上書きする旧問題は止まる。

### `.gitignore`

`gitignoreProposal.needed` の branch に入った後、

1. dangling check
2. outside check
3. content read
4. 実際に append が要るか判定

の順。

そのため outside symlink で、target file にすでに `artifacts/` があり、結果的に write が不要になる場合でも exit 2 になる。

これは Request の説明どおり。

少し保守的だが、「`--write-gitignore` で root 外の linked file を write target として扱わない」という契約として一貫している。安全性を弱める問題ではない。

### 独立した writes

symlink outside を実際の write block 内で catch した場合は `exit = EXIT_ERROR` にして次の optional write へ進むので、他の write は取り消されない。

新テストも、config が拒否されても `.gitignore` が更新されるケースを固定している。

ただし config の従来の `already exists`（`--force` なし）は block に入る前に `return EXIT_ERROR` する。この既存挙動と今回の outside-link failure は別であり、今回変更していない。

---

## 問い4 — 既存の使い方を壊す範囲と文書

### 結論: **十分に文書化されている**

モノレポ等で project root より上にある共有 `.gitignore` / config / `package.json` へ symlink している場合、今回から exit 2 になる。

文書はこの breaking behavior を少なくとも次の形で説明している。

### README

- v0.5.37 から3 write targets が root 外を指す symlink のとき拒否
- root 内 symlink は従来どおり

を明記。

### CONFIG_SPEC

§5.3c で、

- 3つの対象
- outside target の拒否
- 文言
- exit 2
- `--force` でも拒否
- 他 write は rollback しない
- root 内 link は通す

まで記録している。

### CHANGELOG

v0.5.37 の利用者に見える変更として、

- backlog 23 / N1
- root 外 symlink を exit 2
- root 内 symlink は従来どおり
- 既存テストの期待値を1件変更

を記録している。

### 案内文

runtime message は、

`replace the link with a regular file, or update that file yourself`

なので、意図的に project 外の shared file を使っている利用者にも「自分でその shared file を更新する」という代替手段が分かる。

README / CONFIG_SPEC が「monorepo」という単語まで明示してはいないが、契約は「project root の外」で十分明確で、High / Medium / Low の文書不備とは判断しない。

---

## 問い5 — 出力の境界

### 結論: **問題なし**

error message には `realpathSync(file)` の絶対 target path が入るため、ホーム directory 名等を含む可能性はある。

ただしこの CLI はすでに、

- `aiqh init — <root>`
- `failed to write <absolute file>`
- root / cwd 関連 error

等で project の絶対 path を利用者自身の terminal に表示する設計。

今回だけ新たに秘密値を出力する種類の変更ではない。

また `runInit()` の `logError` は `createOutput()` の output boundary を通るため、raw control characters 等について既存の terminal boundary を迂回しない。

symlink target の絶対 path を「外へ送信する」コードも今回対象には無く、ローカル terminal の診断情報。

したがって、新規のセキュリティ境界問題とは判断しない。

---

## 問い6 — N1: `--write-scripts` の dangling check

### 結論: **通常の初期状態では O6 が先に止めるためほぼ冗長。ただし残す害はなく、追加の late check として意味がある**

`runInit()` は write phase より前に、

- `buildRepoContext(root)`
- `resolveDetections(ctx)`

を実行する。

`package.json` が最初から dangling symlink なら、O6 の `ExaminationError` によりここで `cannot audit ...`、exit 2 になり、`--write-scripts` block まで到達しない。

したがって、**開始時点から dangling の package.json に対し、今回追加した `assertNotDanglingLink(file)` が利用者に見える最初の拒否として効く通常経路はない**。

ただし残すことに実害は見つからない。

むしろ audit 後から write phase までの間に `package.json` が dangling link に差し替わった場合には、late check が write 前に拒否できる。この race 全体を完全に閉じるものではない（Request の TOCTOU 限界）が、検査を重ねる方向。

また config / `.gitignore` と write target policy が揃うので、将来 audit order が変わった場合にも `--write-scripts` 自身が dangling target を黙って扱わない。

追加の `lstat` / `stat` が正常な package.json で意味のある副作用を起こすコードは見つからない。

---

## 問い7 — テスト

### 結論: **主要な契約は固定しているが、境界の回帰テストが少し足りない（B23-R1-001 / Low）**

新規6件で固定しているもの:

1. config outside → exit 2 / outside unchanged
2. `.gitignore` outside → exit 2 / outside unchanged
3. `package.json` outside → exit 2 / outside unchanged
4. 1 write failureでも他 writeは継続
5. config inside link → pass
6. `.gitignore` inside link → pass

既存変更1件で、

7. 従来 pass していた outside `.gitignore` append が exit 2 / unchanged

を固定している。

したがって3 write targets の主契約と互換性変更は十分見える。

不足しているのは、判定ロジックの境界そのもの:

- root 自体が symlink
- outside への relative symlink
- multi-hop symlink
- case-insensitive filesystem の case variation

で、B23-R1-001 とした。

`..foo` についても専用 test は無いが、判定条件が `rel === ".."` / `rel.startsWith(".." + path.sep)` と明示的なので、専用 test を必須とはしない。追加するなら cheap control として有用。

---

## 未確認範囲

1. **コード・テストは実行していない。**
2. macOS の case-insensitive filesystem 上で、異なる case spelling を使った root / target の `realpathSync()` 戻り値を実測していない。
3. root 自体が symlink、outside relative symlink、multi-hop symlink の各ケースを実際に作って `runInit()` を動かしていない。コードから判断した。
4. TOCTOU は Request の既知の限界として再指摘していない。
5. hardlink は Request の既知の限界として再指摘していない。
6. Windows は Request の対象外なので評価していない。
7. v0.5.37 の他の backlog 6・17・24・25・26 等は、この依頼どおりレビュー対象外。
8. filesystem 固有の mount / bind mount / network filesystem の特殊な realpath semantics は評価していない。

## 最終判定

**High 0 / Medium 0 / Low 1。**

Low はテスト境界の不足のみで、現在の実装に root 外へ書いてしまう bypass は確認できなかった。

したがって、Request であらかじめ決められた結果の扱いに従い、**この R1 でバックログ23の独立レビューを終了してよい**と判断する。
