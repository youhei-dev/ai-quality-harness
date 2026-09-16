## R3-001

- **ID:** R3-001
- **重要度:** High
- **種別:** セキュリティ
- **対象:** `src/security/mask.ts` — `key-value` rule
- **内容:** 値が `[REDACTED:` で始まると、実際の秘密値であっても key-value マスクを完全に回避できる。
- **根拠:** quoted / unterminated / bare の各value alternativeには、値先頭に `(?!\\[REDACTED:)` が置かれている。これは再マスク防止のためだが、「既に正しくマスク済みか」ではなく、**単に `[REDACTED:` で始まるか**だけで判定している。
  
  独立に同じ正規表現を実行して確認したところ、次はいずれも無加工で残った。
  - `password="[REDACTED:fake] real secret tail"`
  - `password=[REDACTED:fake]real_secret`
  
  つまり既知の `password=` 文脈であっても、値側をこのprefixにするだけで秘密値の後半までレポートへ残る。これは「未知形式をpattern maskerが拾えない」という一般的制約とは異なり、**認識済みkey-value形式の明確なbypass**。
- **修正案:** `[REDACTED:` prefix全般を除外しない。再マスク防止は「値全体がaiqh自身の正規なredaction markerと完全一致する場合」だけに限定する。例えば `password="[REDACTED:key-value]"` はそのまま、`password="[REDACTED:key-value]suffix"` や `[REDACTED:anything]secret` は再度全体をマスクする。
  
  回帰テストとして少なくとも以下を追加する。
  - quoted marker + secret suffix
  - unquoted marker + secret suffix
  - 他category marker + suffix
  - 正規marker単体のidempotence

---

## R3-002

- **ID:** R3-002
- **重要度:** High
- **種別:** バグ
- **対象:** `src/runner/execute.ts` — `terminateActiveChildren()`、`src/cli.ts` — SIGINT/SIGTERM handler、実質的には `runVerify` / `runChecks` との連携
- **内容:** Ctrl+C / SIGTERMでcleanupを開始した後、現在のcheckが早く終了すると、**次のcheckが新しく開始され、そのprocess groupがcleanup対象snapshotに含まれないため生き残るrace condition**がある。
- **根拠:** `terminateActiveChildren()` は開始時に `const targets = [...activeChildren.entries()]` と一度だけsnapshotを取得し、その固定集合だけをTERM/KILLする。
  
  一方CLI handlerは`terminating = true`にはするものの、そのflagは`runVerify` / sequential check executionへ伝達されておらず、新規check開始を止めない。handlerはcleanup終了後に`process.exit()`するだけである。
  
  独立再現では、
  1. check Aを実行
  2. cleanup開始・AへSIGTERM
  3. Aがすぐ終了
  4. cleanup側が50ms pollingしている間に次のcheck Bを開始
  5. cleanupはAのsnapshotしか見ないまま完了
  6. Bのprocess groupがactiveのまま残る
  
  という状態を再現できた。
  
  また「CLI signal path」の回帰テストは実CLIへSIGINT/SIGTERMを送っておらず、`terminateActiveChildren()`を直接呼んでいるだけなので、このraceも130/143のexit codeも検証していない。
- **修正案:** signal受信時に**検証pipeline自体をcancel状態へ移す**必要がある。推奨はAbortSignal等を`runVerify → runChecks → executeCommand`へ通し、signal受信後は新しいcheckを絶対にspawnしないこと。
  
  最小実装なら、共有termination flagをrunner側に持たせ、
  - signal handlerで「新規spawn禁止」を先に設定
  - 実行中groupをcleanup
  - `runChecks`は次check開始前にflagを確認して停止
  - `executeCommand`もspawn直前にflagを確認
  
  とする。
  
  回帰テストは`src/cli.ts`そのものをchild processとして起動し、2check構成の1件目実行中にSIGINT/SIGTERMを送り、以下を確認する。
  - 2件目が起動しない
  - 1件目の子孫が残らない
  - SIGINT → 130
  - SIGTERM → 143

---

## R3-003

- **ID:** R3-003
- **重要度:** Medium
- **種別:** テスト不足
- **対象:** `scripts/package-smoke.ts` — bin / shebang validation
- **内容:** R2-005 smoke testはpackaging経路をかなり広く検証できているが、M0要求である **「binがbuilt `dist/cli.js`を指す」ことそのものは検証していない。**
- **根拠:** smoke testは、
  - tarballに`dist/cli.js`がある
  - installed `dist/cli.js`のshebangが正しい
  - `.bin/aiqh`が存在する
  - `npx --no-install aiqh`が動く
  
  ことを個別に確認している。
  
  しかし `.bin/aiqh` の実リンク先、またはinstalled `package.json` の`bin`値が `dist/cli.js` であることはassertしていない。
  
  そのため例えば将来`bin`を別の正常動作するwrapperへ変更しても、`dist/cli.js`がtarball内に残っていれば、このsmoke testはPASSし得る。これは機能テストとしては問題ないが、元要求の「bin must point at built dist/cli.js」のacceptance testとしては不足。
- **修正案:** install後のpackage.jsonを読み、
  - `bin.aiqh === "dist/cli.js"`（package構造に応じて実値）
  
  を明示的にassertする。POSIXでは加えて`.bin/aiqh`のsymlink targetを`readlinkSync()`して`dist/cli.js`へ到達することを確認してもよい。
  
  それ以外は今回確認した範囲では十分。
  - **shebang:** 実`dist/cli.js`の1行目を確認済み
  - **files:** `npm pack --json`の実tarball contentsで確認しており妥当
  - **依存:** consumer側`node_modules`にruntime dependenciesが存在することを確認
  - **version:** packed CLIの`--version`とreport `tool.version`をroot package versionと照合
  - **実CLI:** consumerから`npx --no-install aiqh verify`を実行
  
  これらは実際に検査コードが存在する。

---

# R2-001〜R2-005 の判定

### R2-001 — 元の再現条件は解消

`password="pa'ss word"`、反対quote、escaped quote、unterminated quote→EOLについて、今回のscannerは前回より正しくなっている。追加テストも具体的で、R2-001の再現条件自体は潰れている。 
ただし、R3-001のredaction-marker bypassが別問題として残る。

### R2-002 — timeoutの元バグは解消、CLI全体は未完

leaderの`close`だけでSIGKILL timerを消してしまうR2の元バグについては、`tryFinish()`とnon-unref timerによって解消されている。

一方、CLI signal処理ではR3-002の「cleanup中に次checkが起動するrace」が残るため、**R2-002全体を完全解消とは判定しない**。

### R2-003 — 指摘なし

`lstatSync()`でdangling symlink自体をentryとして認識し、`realpathSync()`不能時はlexical fallbackせずConfigErrorに倒している。R2で問題にした再現条件は解消されている。

root内向きdangling symlinkまでrejectする判断も、fail-closed harnessとしては妥当。通常の「まだ存在しないdirectory」は引き続き許容するテストもある。

TOCTOUは残るがpacket自身が既知リスクとして明記しており、今回のR2修正の欠陥とはしない。

### R2-004 — 指摘なし

Authorization / Proxy-Authorization文脈をprose用heuristicより先に処理し、Bearerを長さ不問、Basicをdecode不要でmaskする変更は、R2の再現条件に合っている。

short Bearer、non-UTF-8 Basic、Proxy-Authorization、prose非誤検出、idempotenceまでテストされているため、R2-004について追加のblockerは確認しなかった。 
### R2-005 — ほぼ解消、bin exact-targetだけ不足

`npm pack → temp consumer → install → npx --no-install aiqh verify`というacceptance pathをself-verifyのrequired checkに入れた判断は妥当。packagingをM0へ戻したことも適切。

R3-003のexact bin-target assertionを加えれば、元要求に対するcoverageはかなり完成度が高い。

---

# 指摘なしと判断した観点

- R2-001のmixed quote処理
- `\\"` / `\\'`をquoted value内部として扱う処理
- unterminated quoteを同一行末までfail-safeにmaskする方針
- R2-004のAuthorization / Proxy-Authorization優先rule
- Authorization内short Bearer
- Authorization内non-UTF-8 Basic
- proseでの`Basic auth` / `bearer authentication`誤検出回避
- R2-003の`lstat`によるdangling symlink認識
- root外dangling symlink拒否
- root内向きdangling symlinkも検証不能として拒否するfail-closed判断
- 通常の未作成output directoryを許容すること
- R2-002の「leader closeでSIGKILL timerを消さない」修正
- SIGKILL timerから`unref()`を外したこと
- package smokeを`build`直後のrequired checkにしたこと
- tarball contentsによる`files`実体検証
- installed runtime dependenciesの確認
- consumer projectからの`npx --no-install aiqh verify`
- packed CLIのversionとreport versionの確認

packet記載では、R2後に118テスト、source/built双方のself verifyがPASSしています。これ自体は実装AIの実行記録であり私がその実ログを再実行したものではありませんが、少なくとも今回追加されたテスト内容との整合は取れています。

# 見ていない範囲

今回のZIPには実repository一式ではなく`review-packet-m0-r2.md`が入っており、私はpacketに全文掲載された変更ファイルをレビューしています。

独立に実行・照合していないもの:

- GitHub上の`29e0f42`とpacket内容のbyte-level一致
- 118テストの実際のVitestログ
- `npm run verify` / `verify:dist`の実行そのもの
- 実際の`npm pack` tarball
- `npm audit`結果
- push / tagの実在
- Linux / Windows
- maskerとpre-push guardのagreement（R-012 / M1）
- R2で変更されていないrepository全ファイル

一方、**R3-001のmask bypassとR3-002のactive-child snapshot raceは、packet掲載ロジック相当を使って独立に再現確認**しています。

## 結論

M0は前回よりかなり完成度が上がっていますが、**R3-001とR3-002はM0完了前に修正するのが妥当**です。

特にR3-002は、Ctrl+C後のcleanupを改善したことで一見解決したように見えますが、pipeline側をcancelしていないため、新規checkがcleanup snapshotの外で起動できるという別の競合条件があります。R3-003は修正量が小さく、package smokeのacceptance coverageを完成させるため同時対応を推奨します。