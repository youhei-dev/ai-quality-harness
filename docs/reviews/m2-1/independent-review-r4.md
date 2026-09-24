<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-1-r4-for-claude.md、2026-09-25 付、13,230 バイト）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 3689b1e83ef1a30188d42c0fc2c3ca4cb021255bfc923c00031e78810e62c89f
-->

# independent review — M2-1 R4

## 1. 総評

R4 の対象差分 v0.4.2..v0.4.3 を、Request、R3 原文、Diff、変更ファイルの Full Source、回帰テスト、docs を突き合わせて独立に確認しました。M2-1-R3-001 の中心原因だった「文字列の正規化とファイルシステムの名前同一視のずれによって、packet と ZIP が同一のディレクトリエントリへ二重 install される経路」は、今回の `dev` + `ino` による親ディレクトリ確認と ASCII basename 比較で解消していると判断します。
指定された信頼境界（`check:same-target` 後に他者が出力先や親を同時変更する場合は対象外）の内側では、既存ファイル消失につながる新しい経路は見つけませんでした。新規指摘は **High 0 / Medium 0 / Low 0** です。
R3-002〜006 の Medium 5 件は M2-2 へ持ち越されたままで、ADR-0014、ROADMAP、response-r3、CHANGELOG の記録も実コードの現状に合わせて訂正されています。

## 2. M2-1-R3-001 の解消状況

**判定：解消**

主な根拠は `src/commands/review-packet.ts:391-425, 481-507` です。

準備段階では、各 target の親ディレクトリを作成した後、実際に解決された親へ一時ファイルを書き、その親の `dev` + `ino` を保存しています。

```ts
const dir = realpathSync(path.dirname(t.path));
const id = statSync(dir);
parents.set(t, { dev: id.dev, ino: id.ino });
const tmp = siblingName(path.join(dir, path.basename(t.path)), "tmp");
writeFileSync(tmp, t.data, { flag: "wx" });
tmps.set(t, tmp);
```

その後、既存 target を退避する前に `checkTargetsByIdentity()` が呼ばれます。

```ts
step("check:same-target");
checkTargetsByIdentity(targets, parents);
```

再確認では、各 pathname から現在見える親ディレクトリが準備時と同じ `dev` + `ino` であることを確認し、packet と ZIP の親が同じ実体で、かつ ASCII basename が大文字小文字を無視して同じなら拒否します。

```ts
const now = statSync(path.dirname(t.path));
if (was === undefined || now.dev !== was.dev || now.ino !== was.ino) {
  throw new WriteError(`the ${t.label} target's directory changed during the write; nothing was replaced: ${t.path}`);
}

if (
  pa !== undefined && pb !== undefined &&
  pa.dev === pb.dev && pa.ino === pb.ino &&
  path.basename(a.path).toLowerCase() === path.basename(b.path).toLowerCase()
) {
  throw new WriteError("--zip-output resolves to the same file as the packet path ...");
}
```

このため、R3-001 の原因だった「APFS 等が同一視する親名を JavaScript の NFC + `toLowerCase()` が同一視できず、同じ pathname 実体へ packet と ZIP を順に install する」経路は、文字列変換ではなく実際の親ディレクトリ identity によって拒否されます。

最終要素そのものがシンボリックリンクの場合は、`src/commands/review-packet.ts:408-412` の `lstat` と `isFile()` により準備段階で拒否されます。通常ファイルへのハードリンクについては、異なる basename の 2 個のハードリンクが同一 inode を指していても、それらは別ディレクトリエントリなので、各 pathname を別々に backup した後、新しい packet / ZIP を別々に rename して最終的には別ファイルになります。POSIX の最小確認でも、書込み前に同一 inode の 2 pathname が書込み後には packet と ZIP の別 inode になることを確認しました。このため、ハードリンクを「同一 target として一律拒否しない」こと自体は、今回の二重 install / 既存ファイル消失問題にはなりません。

`check:same-target` の後に親ディレクトリを別実体へ差し替える競合窓は残りますが、これは Request で明示された「実行中に出力先とその親ディレクトリを他者が同時に変更する場合」という既知の範囲外です。したがって今回の判定では未解消扱いにしません。

### R3-002〜006 と ADR の訂正

R3-002〜006 は `docs/ROADMAP.md:135-144` に **M2-2 の先頭の Medium 5 件**としてそれぞれ記録されており、今回直した扱いにはなっていません。

ADR-0014 も、R3 で指摘された保証の言い過ぎを実挙動に合わせて訂正しています。

- `docs/adr/0014-review-packet.md:78-82`: R3-002 / R3-003 の未解決挙動を明記。
- `docs/adr/0014-review-packet.md:93-105`: `Checked` / `Md` の型保証が `any`・型別名・`JSON.parse` 等で迂回可能であること、option inventory テストが help に出る long option に限られることを明記。
- `docs/adr/0014-review-packet.md:59-68`: same-target 判定の実装、判定時点、信頼境界を明記。
- `docs/reviews/m2-1/response-r3.md:63-73`: R3-002〜006 を未修正の持ち越しとして記録。
- `CHANGELOG.md:16-18`: ADR の訂正と R3-002〜006 の M2-2 持ち越しを明記。

これらは実コードの現状と一致しています。

## 3. 新しい指摘

**新しい指摘はありません。**

今回の範囲で High / Medium / Low に該当する新規不具合は確認できませんでした。

## 4. 指摘ではないが確認した点

### 1. packet と ZIP が同じファイルへ書かれる経路

`src/commands/review-packet.ts:345-359` の文字列比較は早期拒否として残っていますが、最終判定は `src/commands/review-packet.ts:490-507` のファイルシステム identity です。親ディレクトリがファイルシステム上で同一なら `dev` + `ino` が一致し、basename は出力名制約により ASCII に限定されているため、同一親の case-only alias も拒否されます。

最終要素がシンボリックリンク・ディレクトリ・その他の非通常ファイルなら `lstatOrNull()` + `!st.isFile()` で書込み前に拒否されます。異なる pathname のハードリンクは、rename が inode ではなく個々のディレクトリエントリを置換するため、packet と ZIP が最終的に一つへ潰れる経路にはなりません。既存 target が通常ファイルであるケースも backup → install の対象として扱われます。

指定された macOS / Linux の POSIX 対応範囲では、basename が ASCII に限定されているため、親名の Unicode 同一視問題を `dev` + `ino` で処理した後に、basename 側で今回と同種の Unicode 同一視漏れが残る構造は見つけませんでした。Windows は README 上も対象外です。

**問題：見つけませんでした。**

### 2. 判定したディレクトリと実際に書くディレクトリ、一時ファイル・退避・後片付け

準備時の一時ファイルは、元の文字列 pathname ではなく `realpathSync(path.dirname(t.path))` で得た実ディレクトリの sibling として作られます（`src/commands/review-packet.ts:412-419`）。その後 `statSync(path.dirname(t.path))` で、元の pathname から現在解決される親が同じ `dev` + `ino` かを確認しています（493-497 行）。したがって、準備中に親 symlink が変わった場合は commit 前に拒否されます。

same-target / changed-directory の拒否は prepare の `try` 内で発生し、catch から `removeTmps()` が呼ばれるため、一時ファイルは削除対象になります（421-425 行）。まだ backup は開始されていないため、拒否時に既存ファイルへ触れません。

backup / install は identity check 後に元の pathname へ行います。check 後の外部差し替えまでは pathname と directory object を descriptor で固定していませんが、これは今回明示された信頼境界の外です。外部変更が無いという前提では、check 時に確認した親と rename 時の親は同じです。

**問題：見つけませんでした。**

### 3. 安全側の拒否が通常利用を不当に妨げていないか

早期の `targetIdentity()` は NFC + lowercase による安全側拒否を残しています。そのため、実ファイルシステムが別名として扱う場合でも、文字列変換上同一になる case / normalization 系の pathname は拒否され得ますが、これは Request の「安全側に拒否する仕様」に一致します。

一方、新しい最終判定は、親の `dev` + `ino` が異なり basename も衝突しない通常の 2 出力を拒否しません。回帰テストも、実行環境で親名が別ディレクトリと判定され、かつ早期文字列比較でも一致しないケースでは packet / ZIP の双方が書かれることを確認する構造です（`tests/regression-m2-1-r3-001-filesystem-identity.test.ts:87-108`）。

親が準備後に変わった場合を exit 2 にするのも、判定対象と実書込み対象の不一致を防ぐ fail-closed として妥当です。

**問題：見つけませんでした。**

### 4. 回帰テストが修正前に FAIL し、環境依存で誤 PASS / 自爆しないか

`tests/regression-m2-1-r3-001-filesystem-identity.test.ts:74-108` は、Unicode の名前ペアについて「この環境のファイルシステムが実際に同じディレクトリとして扱うか」をテスト自身が probe して期待値を切り替えています。そのため、APFS と Linux 系ファイルシステムで名前同一視が違っても、一方の環境の規則を固定的に仮定していません。また、早期文字列比較で安全側拒否される組は `stringEqual` も考慮しています。

より重要なのは `tests/regression-m2-1-r3-001-filesystem-identity.test.ts:111-162` の 3 ケースです。v0.4.2 の diff には `step("check:same-target")` も `checkTargetsByIdentity()` も存在しないため、

- `prepare:packet` で親 symlink を A から B へ差し替えるケース
- `check:same-target` を待って差し替えるケース（旧コードでは hook 自体が呼ばれない）
- 衝突しない別ディレクトリへの親変更を検出するケース

は、旧コードでは期待する exit 2 / 既存不変にならず、少なくとも修正前のロジックを直接失敗させる形です。したがって、Unicode ペアがすべて区別されるファイルシステムでも「旧コードで全テストが誤って PASS」する構造ではありません。

後始末は `afterEach` で全 cleanup を実行し、cleanup 自体の例外も握りつぶさずテストを FAIL させます（23-34 行）。テスト用 Unicode は `String.fromCodePoint()` で実行時に作られており、レビュー出力へ生の区切り・双方向制御文字を埋め込む形にもなっていません。

提供物は repository checkout ではなく review packet なので、こちらでは v0.4.2 / v0.4.3 の完全な `npm test` を再実行していません。修正前 FAIL の判定は diff とテストコードの制御フローを独立に追ったものです。加えて、POSIX 上で同一 inode の 2 hardlink pathname をそれぞれ backup して別の一時ファイルを rename すると、最終出力が別 inode になる最小ファイル操作は実行確認しました。

**問題：見つけませんでした。**

### 5. docs の一致、R3-002〜006 の持ち越し、ADR の訂正

README の Trust Boundary は `README.md:66-75` にあり、same-target 判定後の同時差し替えを保証外と明記しています。ADR-0014 は、same-target 実装の詳細を `docs/adr/0014-review-packet.md:51-69`、R3-002 / 003 の未解決状態を 75-82 行、R3-004 / 005 の保証限界を 93-105 行に記録しています。

ROADMAP は `docs/ROADMAP.md:135-144` で R3-002〜006 を M2-2 の先頭へ 5 件すべて列挙し、R3-001 だけ v0.4.3 で直したとしています。response-r3 と CHANGELOG も同じ扱いです。

R3 で問題になった「`Checked` は絶対に偽造できない」「option を追加し忘れれば必ずテストが落ちる」といった言い過ぎは ADR で明示的に限定されており、現コードの保証レベルと一致しています。

**問題：見つけませんでした。**

## 5. 確認範囲

提供された `review-packet-m2-1-r4.md` について、Request、Previous Reviews の R3 原文、v0.4.2..v0.4.3 の Diff、変更された 9 ファイルの Full Source、`tests/regression-m2-1-r3-001-filesystem-identity.test.ts`、ADR-0014、README、response-r3、ROADMAP、CHANGELOG を確認しました。

commit message、response-r3、CHANGELOG、Verification の PASS は正しさの根拠にはせず、コード・テスト・文書の一致確認にのみ使用しました。既知の範囲外として指定された R3-002〜006 の内容自体、check 後の同時変更、M2-0-R4-001、scheme 64 文字超、SIGKILL、他コマンドの終了コード、symlink kind、テスト時間は新規指摘対象から除外しています。
