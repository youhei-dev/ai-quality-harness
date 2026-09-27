<!--
aiqh 記録用の注記: 受領原文（~/Downloads/independent-review-m2-2-cli-catch-r2-for-claude.md、ChatGPT、2026-09-28 受領、13,027 バイト、対象範囲 v0.5.14..v0.5.15）をそのまま収録した。
本体の Security Scan に一致する行は無く、push 前の秘密値ガードの接頭辞も無いため、変更した行は無い（0 行）。禁止集合の生文字と U+FFFD も無い。
無改変の原文の SHA-256: 448a497efabfe091d87535af2b3f41be1fce153aa20436d2d8e312a25690352b
-->

# independent review — M2-2 CLI Catch R2

## 1. 総評

対象範囲 `v0.5.14..v0.5.15` について、Request、前回レビュー原文、変更 diff、変更後の
`tests/regression-m2-2-cli-catch-001-thrown-value.test.ts` 全文、参考資料として収録された
`tests/helpers.ts`、`docs/ARCHITECTURE.md`、`vitest.config.ts`、および今回の対応記録・ROADMAP・CHANGELOG の該当箇所を独立に確認した。

前回指摘 **M2-2-CLI-CATCH-R1-001 は「解消」**と判断する。

今回の修正では、各 `it` が自分の CLI 実行と一時ディレクトリを持ち、`execFile()` の開始直後かつ最初の `await` より前に
`ChildProcess` handle を使う `stopper` を登録している。`afterEach` は `runCleanups()` を await し、LIFO により
CLI の停止・確定待ちを先に、一時ディレクトリ削除を後に実行する。前回問題だった共有 `runs` map と file-wide `afterAll`
cleanup は無くなった。

また、`run()` 内で `writeFileSync()` が失敗する場合には、すでに temp cleanup が登録済みであり、
`execFile()` が同期的に失敗する場合は Promise rejection として `done` に入り、その後 `stopper` も登録される。
開始済み child が stopper 未登録のまま最初の `await` に到達する経路は確認できなかった。

**新しい指摘は High 0 / Medium 0 / Low 0。**

なお、パケットに含まれない範囲や、response に記録された実測そのものを私が再実行していない点は
「未確認の範囲」に分離した。

---

## 2. 前回指摘 M2-2-CLI-CATCH-R1-001 の解消状況

### 判定: 解消

**対象**
- `tests/regression-m2-2-cli-catch-001-thrown-value.test.ts:94-139`
- `tests/helpers.ts` — `runCleanups()` / `stopper()` / `SETTLE_MARGIN_MS`
- `docs/ARCHITECTURE.md` — 「テストの後始末（v0.5.8、M2-2-R5-001）」の節

### 根拠

前回の問題は、実物 CLI を `execFile()` で起動するにもかかわらず、

- ChildProcess handle を保持しない
- `afterEach` がない
- 複数の `it` が `runs` map で同じ実行を共有する
- temp directory は file-wide に1個で `afterAll` だけが消す

という構造だった。

v0.5.15 では次の形に変わっている。

```ts
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});
```

`run(kind)` は、まず実行ごとの一時ディレクトリを作り、その cleanup を積む。

```ts
const tmp = makeTempDir("aiqh-cli-catch-");
cleanups.push(tmp.cleanup);
```

その後 preload / log を書き、CLI を起動する。

```ts
let child: ChildProcess | undefined;
const done = new Promise<Run>((resolve) => {
  child = execFile(...);
});
```

そして**最初の `await` より前**に、CLI cleanup を後から積む。

```ts
cleanups.push(
  stopper(
    done,
    () => child?.kill("SIGKILL"),
    SETTLE_MARGIN_MS,
    "the CLI",
  ),
);
```

`runCleanups()` は後から積んだものから `pop()` して処理するため、afterEach では、

1. CLI が未確定なら ChildProcess handle に SIGKILL
2. `done` の確定を最大5秒待つ
3. その後に temp directory を削除

という順序になる。

前回指摘した「worker の寿命や execFile 自身の20秒 timeoutだけに依存する」構造ではない。

### failure path の確認

#### `writeFileSync()` が失敗する場合

`tmp.cleanup` は preload / log の `writeFileSync()` より前に登録されている。

したがって preload または log の書き込みが同期的に失敗して `run()` が throw しても、Vitest の `afterEach` で
temp cleanup が残っている。

この時点では child はまだ起動していないため、child cleanup が無いことは問題にならない。

#### `execFile()` が同期的に失敗する場合

`execFile()` は `new Promise()` の executor 内で呼ばれているため、その同期例外は `done` の rejection になる。
Promise construction 後に stopper が登録され、test がその rejected Promise を await して失敗した後も afterEach が走る。

child の起動に成功した場合は、`execFile()` が handle を返した直後に stopper を同期的に登録しており、その間に `await` は無い。

したがって、**開始済み child が存在するのに stopper 登録前の asynchronous failure / test timeout へ進む経路は確認できなかった。**

### 持ち主

旧 `runs` map は削除されている。

各 test の `run(kind)` 呼び出しごとに、

- 新しい temp directory
- 新しい preload / log
- 新しい ChildProcess
- 新しい stopper

が作られる。

25件の各 `it` が自身の実行を所有し、別の `it` と CLI 実行を共有する形は残っていない。

### 判定理由

前回 R1-001 が問題にしていた、

- failure / test timeout 時の child cleanup 欠落
- worker の寿命への依存
- temp directory を child より先に消す可能性
- 実行の所有者が曖昧な共有

はいずれも、今回のコードで直接修正されている。

したがって **「解消」** と判定する。

---

## 3. 新しい指摘

**新しい指摘なし。**

今回確認した変更範囲では、High / Medium / Low の基準に該当する新しい問題は見つからなかった。

---

## 4. Request「特に見てほしい点」の確認結果

パケットの Request には「特に見てほしい点」が **1〜6** まで記載されているため、その6項目を確認した。

### 1. M2-2-CLI-CATCH-R1-001 の解消

**確認したが問題なし。**

上記のとおり、

- ChildProcess handle を保持
- 起動直後・最初の await 前に stopper 登録
- afterEach で runCleanups を await
- CLI停止・確定待ちの後に temp directory cleanup

になっている。

`writeFileSync()` の同期失敗では child 起動前かつ temp cleanup 登録済み。
`execFile()` の同期失敗は Promise rejection に入り、stopper 登録後に test が rejection を観測する構造である。

開始済み child が cleanup 所有者を持たずに残る新しい経路は確認できなかった。

---

### 2. 持ち主

**確認したが問題なし。**

旧 `runs: Map<string, Promise<Run>>` は削除されている。

各 `it` は `run(kind)` を呼ぶたびに独立した CLI、temp directory、record log、cleanup を持つ。
異なる test が同一 child / Promise を共有する構造は残っていない。

module-level の `cleanups` array は共有だが、通常の非 concurrent `it` と `afterEach` の組み合わせで毎 test 後に
`runCleanups()` が全項目を pop する。今回のファイルには `.concurrent` 等もなく、複数 test の process ownership を混ぜる使い方にはなっていない。

---

### 3. 25件の不変

**確認したが問題なし。**

diff を確認すると、変更は主に、

- imports
- cleanup 説明コメント
- file-wide temp / `afterAll` の削除
- `runs` map の削除
- `run(kind)` の lifecycle / cleanup

に限定されている。

`PRELOAD` の内容には diff がなく、変更後全文でも前回レビューで確認した hostile / ordinary value の定義と
注入方法が維持されている。

`shown()` 以降の assertion / testcase 群にも diff は無い。

変更後の25件は、

- HOSTILE: 11件
- RECORDED: 8件
- `console-error-throws`: 1件
- ORDINARY: 5件

の合計25件で、本文・期待値の目的は維持されている。

---

### 4. 後始末の順序と上限

**確認したが問題なし。**

登録順:

1. `tmp.cleanup`
2. CLI `stopper`

`runCleanups()` は `pop()` で LIFO 実行するため、

1. CLI stopper
2. temp cleanup

の順になる。

CLI stopper の上限は `SETTLE_MARGIN_MS = 5_000`。

この test は ChildProcess handle に直接 SIGKILL を送るため、製品 runner のような追加 grace を待つ設計ではなく、
「SIGKILL 後の確定を最大5秒待つ」という Request の条件と一致する。

`vitest.config.ts` は、

```ts
testTimeout: 30_000,
hookTimeout: 30_000,
```

である。

afterEach cleanup の bounded wait は5秒であり、temp cleanupを加えても hookTimeout 30秒に十分収まる設計になっている。

`execFile` の `timeout: 20_000` / `killSignal: "SIGKILL"` も残っているが、コメントどおり二重の安全弁であり、
主 cleanup は afterEach の stopper である。

---

### 5. 確かめ方

**方法として妥当と判断する。ただし実測値自体は独立再実行していない。**

対応記録では、v0.5.14 の一時 worktree と修正版の一時 worktreeだけに test-only の仕掛けを入れ、

- CLI 内で40秒同期停止
- S1: 起動後0.5秒で test failure
- S2: test timeout 2秒
- `ps` による CLI の100ms間隔監視
- vitest終了後も最大60秒追跡
- temp directory消滅時刻の観測

という条件で修正前後を比較している。

この条件は前回指摘の本質である、

- test body が正常 completion しない
- worker 内 timer に依存してはいけない
- afterEach の child cleanup が効くか
- directory cleanup が child cleanup より後か

を直接観測するものなので、確認方法として適切。

また、この再現用の「終わらないCLI」fixtureを本体の恒久テストに追加せず、一時 worktree の写しだけで使った判断も、
今回の修正自体が lifecycle wiring の小変更であり、既存共通 helper の契約テストが別途存在することを踏まえると不合理ではない。

ただし、response に記録された秒数・`ps` 観測・残存0件等は今回私自身が再実行して検証した値ではない。
この点は「未確認の範囲」に明記する。

---

### 6. docs とコードの一致

**確認したが問題なし。**

#### `response-cli-catch-r1.md`

記載された v0.5.15 の修正内容、

- 各 `it` が自分の実行を持つ
- temp directory は実行ごと
- ChildProcess handle を保持
- stopper は起動直後
- afterEach で runCleanups
- SIGKILL + 5秒
- execFile timeout は二重の安全弁
- preload / 25件の本文・期待値は不変

はコードと一致する。

#### ROADMAP

v0.5.15 の記録として R1-001 の修正内容と実測が追記されている。
今回対象外とされた backlog 19 (a)(b)(c) の番号・内容は変えていない。

#### CHANGELOG

パケットに記載された v0.5.15 の変更趣旨は、今回の test-only 修正と整合する。

#### ARCHITECTURE

この範囲では変更していない。
既存の v0.5.8 方針、

> failure / timeout でも afterEach 内で cleanupし、worker寿命に任せない

に今回の修正が従うようになった。

ROADMAP backlog 19 に既知の例外が残ることは Request で明示的に今回範囲外とされているため、新規指摘にはしない。

---

## 5. 未確認の範囲

パケットに含まれていないこと、または Request で明示的に範囲外とされたことについては断定しない。

### 5.1 修正前後の実測値そのもの

`response-cli-catch-r1.md` に、

- 修正前は CLI が vitest 終了後約37〜38秒残った
- 修正後は afterEach 内で消えた
- temp directory は修正後 child の後に消えた
- 監視側 SIGKILL は0

と記録されている。

条件・方法は妥当と判断したが、今回の独立レビューではその一時 worktree / test-only fixtureを実際に再構築・再実行していない。
したがって**数値と観測結果そのものは独立実測未確認**。

### 5.2 `src/` 全体の棚卸し

前回レビューで未確認だった、

- repo全体の throw / catch / `AbortSignal.reason` 棚卸し
- `src/output.ts` 全文

は Request で明示的に今回範囲外。

今回も判定していない。

### 5.3 製品 `src/cli.ts` の最上位 catch

今回の範囲では変更しておらず、Request でも対象外。
前回レビューで「新しい製品コード不具合なし」とした判定を今回再レビューしたものではない。

### 5.4 ROADMAP backlog 19 (a)(b)(c) その他の既知 backlog

Request により対象外。

特に、

- 孫まで timeout で止めるテスト
- CLIをすぐ await する既存test
- signal 0 probe

は今回の新規指摘にはしていない。

### 5.5 Windows、所要時間、過去記録の言い回し

Request により対象外。

---

## 6. 新規指摘件数

| 重要度 | 件数 |
|---|---:|
| High | 0 |
| Medium | 0 |
| Low | 0 |

**合計: 0件**

---

## 7. 結論

- **M2-2-CLI-CATCH-R1-001: 解消**
- **新規 High: 0**
- **新規 Medium: 0**
- **新規 Low: 0**

今回の変更範囲について、追加修正を要求する新しい不具合は確認しなかった。
