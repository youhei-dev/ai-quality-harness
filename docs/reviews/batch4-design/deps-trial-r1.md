# 依存の試しの結果（R1 の添付。設計 §2.5 の根拠）

- 測った日: 2026-11-07（JST 08:56〜09:30）。手元の macOS、Node v24.13.1、npm 11.18.0（`min-release-age=7`・`ignore-scripts=true`・`allow-remote=none`・`allow-git=none`）、AC 電源、`caffeinate -i`
- 場所: 基準の commit `3a6295a` の使い捨ての worktree（組ごとに別。`git worktree add --detach`）。`node_modules` は本体の APFS の複製（`cp -c -R`）。npm の cache と log は作業の場所
- 片づけ: 変えた `package.json`・`package-lock.json` の前後の写しを保存してから、`git restore --source=HEAD -- package.json package-lock.json`、`git worktree remove`（`--force` なし）。どちらの組も外れた。本体の作業ツリーは変えていない（`git status --short` は空）
- テストと verify の前に負荷のゲート（電源 AC、1 分平均 ≤ 8 かつ 5 分平均 ≤ 12 が 20 秒おきに 3 回）

## 1. 結果

| 確かめ | 組 1: 4 つ | 組 2: 3 つ（`@types/node` を上げない） |
|---|---|---|
| `npm install --save-dev …` | `eslint@~10.14.0 typescript-eslint@~8.72.1 @types/node@~24.19.2 vite@~8.3.5`、exit 0 | `eslint@~10.14.0 typescript-eslint@~8.72.1 vite@~8.3.5`、exit 0 |
| `package.json` | 4 行の範囲が変わる（`~` のまま） | 3 行 |
| lock（`git diff --stat`） | 324 行（`package.json` と合わせて 2 ファイル、+166 −166） | 308 行（+157 −157） |
| lock の全欄の比べ | 版の変更 35、追加 0、削除 0、同じ版で欄だけ変わったもの 0。トップの欄・ルートの `version`（0.18.0）は同じ。ルートの項目は `devDependencies` だけ | 版の変更 33、ほかは同じ |
| `dev`・`optional`・`devOptional` の印 | 変わった項目はどれも `dev: true`、印の変化 0 | 同じ |
| 実行時の依存の項目（commander・jsonc-parser・zod） | 前と同じ（`dev` でない項目は 3 つだけで、どれも変わらない） | 同じ |
| `npm ls --depth=0` | exit 0 | exit 0 |
| `npm ls --all` | exit 0。`UNMET OPTIONAL` 47 行（vite などの任意の peer） | 同じ |
| `npm audit --audit-level=high` | exit 0 | exit 0 |
| `npm audit --audit-level=moderate` | moderate 10（high・critical 0） | moderate 10 |
| typecheck | exit 0 | exit 0 |
| lint | exit 0。264 ファイル、error 0・warning 0、抑止 4（基準の commit の 4 つの `eslint-disable-next-line`） | 同じ |
| 全テスト（`vitest run`） | exit 0、189 ファイル・2,944 件 PASS、79 秒（始めの 1 分平均 5.00） | exit 0、189 ファイル・2,944 件 PASS、84 秒（5.19） |
| `npm run verify` | exit 0、8/8、2m55s（unit 1m21s・unit-minpath 1m23s） | exit 0、8/8、3m41s（unit 1m33s・unit-minpath 1m55s） |
| `npm run verify:dist` | exit 0、8/8、2m55s（unit 1m27s・unit-minpath 1m18s。途中で 1 分平均が 14.95 まで上がった） | exit 0、8/8、3m34s（unit 1m20s・unit-minpath 2m00s） |
| `npm pack --dry-run`（`dist/` を作る前） | 4 項目、23,504 → 23,509 バイト（`package.json` の差） | 同じ |

## 2. lock の版の変更（組 1。組 2 は `@types/node` と `undici-types` の 2 行が無い 33 行）

| 項目（`node_modules/` の下） | 前 | 後 | ほかに変わった欄 | 組 2 |
|---|---|---|---|---|
| `@oxc-project/types` | 0.148.0 | 0.156.0 | - | あり |
| `@rolldown/binding-android-arm-eabi` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-android-arm64` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-darwin-arm64` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-darwin-x64` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-freebsd-x64` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-linux-arm-gnueabihf` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-linux-arm64-gnu` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-linux-arm64-musl` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-linux-ppc64-gnu` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-linux-s390x-gnu` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-linux-x64-gnu` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-linux-x64-musl` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-openharmony-arm64` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-win32-arm64-msvc` | 1.2.7 | 1.2.16 | - | あり |
| `@rolldown/binding-win32-x64-msvc` | 1.2.7 | 1.2.16 | - | あり |
| `@types/node` | 24.13.6 | 24.19.2 | [dependencies] | 無し |
| `@typescript-eslint/eslint-plugin` | 8.70.1 | 8.72.1 | [dependencies, peerDependencies] | あり |
| `@typescript-eslint/eslint-plugin/node_modules/ignore` | 7.0.13 | 7.0.14 | - | あり |
| `@typescript-eslint/parser` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `@typescript-eslint/project-service` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `@typescript-eslint/scope-manager` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `@typescript-eslint/tsconfig-utils` | 8.70.1 | 8.72.1 | - | あり |
| `@typescript-eslint/type-utils` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `@typescript-eslint/types` | 8.70.1 | 8.72.1 | - | あり |
| `@typescript-eslint/typescript-estree` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `@typescript-eslint/utils` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `@typescript-eslint/visitor-keys` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `eslint` | 10.10.0 | 10.14.0 | [dependencies] | あり |
| `nanoid` | 3.3.18 | 3.3.20 | - | あり |
| `postcss` | 8.5.28 | 8.5.32 | [dependencies] | あり |
| `rolldown` | 1.2.7 | 1.2.16 | [dependencies, optionalDependencies] | あり |
| `typescript-eslint` | 8.70.1 | 8.72.1 | [dependencies] | あり |
| `undici-types` | 7.18.2 | 7.24.6 | - | 無し |
| `vite` | 8.2.4 | 8.3.5 | [dependencies, peerDependencies] | あり |

（組 1 は 35 行、組 2 は 33 行。組 2 にあって組 1 に無い行: なし）

## 3. 関係する peer と依存（`npm view`・`npm ls`）

- vitest 5.0.5 の `peerDependencies`: `vite` は `^6.4.0 || ^7.0.0 || ^8.0.0`、`@types/node` は `^22.0.0 || >=24.0.0`。vitest は vite を直接の依存に持たない
- vite 8.3.5 の `peerDependencies` の `@types/node`: `^20.19.0 || >=22.12.0`。`engines.node`: `^20.19.0 || >=22.12.0`
- `npm ls`（組 1）: vitest と `@vitest/mocker` は vite 8.3.5、vite と vitest は `@types/node` 24.19.2（どれも重複なし）。minimatch は 10.2.6 のまま（eslint 10.14.0 は `^10.2.6`、`@eslint/config-array` 0.23.5 は `^10.2.4`、`@typescript-eslint/typescript-estree` 8.72.1 は `^10.2.2`）
- 公開日（`npm view <名前> time`）: eslint 10.14.0 は 2026-10-30T14:12Z、typescript-eslint 8.72.1 は 2026-10-26T17:09Z、vite 8.3.5 は 2026-10-21T06:38Z、`@types/node` 24.19.2 は 2026-10-09T18:44Z。どれも 7 日を満たす。vite 8.3.6（2026-11-05）・vitest 5.1.0（2026-11-02）は満たさない
