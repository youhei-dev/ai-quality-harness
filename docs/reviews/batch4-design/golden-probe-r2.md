# golden の試し（R2 の添付。設計 §2.4・付録 A6 の根拠）

- 測った日: 2026-11-07。基準の commit `3a6295a` のソース（`node` で TypeScript をそのまま実行。Node v24.13.1）
- 書いた場所: 作業の場所の下の使い捨てのディレクトリ（`<場所>/plain/`・`<場所>/edge/`）。リポジトリの追跡しているファイルは変えていない（実行の後も `git status --short --untracked-files=all` は空）
- 生の文字（ESC・U+202E）とバッククォートは、スクリプトの中で `String.fromCharCode` で組み立てた（スクリプトの字面には無い）
- 試しの `plain` は 2 つの check（PASS の lint と、`cwd` が `pkg` の FAIL の unit〈コマンドに `|`〉）の簡単な形。設計 §2.4.3 の `plain` の入力のすべてではない。`edge` は §2.4.3 の表の 8 つ

## 結果

| 組 | `latest.md` の行の数（`renderMarkdown` の返り値 / 書かれたファイル） | 違った行 | 書かれた `latest.md` に残る生の文字 | `latest.json` = `jsonForFile` + 改行 | history = `latest.json` | C-44 で変わる条件に当たる行 |
|---|---|---|---|---|---|---|
| `plain` | 58 / 58 | 1 行（51 行目: FAIL の stderr の行） | 0 | 同じ | 同じ | 表 0 行・`- Command:` 0 行 |
| `edge` | 103 / 103 | 4 行（57・70・83・96 行目: 4 つの FAIL の stderr の行） | 0 | 同じ | 同じ | 表 6 行（38・39・40・41・43・44 行目）・`- Command:` 4 行（4 つの FAIL のすべて） |

- 違った行は、どれも生の文字を含む stderr の行で、書かれたファイルでは表記になっていた（`writeAtomic` の Markdown の変換。`src/report/write.ts:104-108`）
- C-44 で変わる条件: 値にバッククォートがある、または空白で始まり空白で終わる（空白だけではない）。表の行はコマンドだけを見る（`cwd` は表に出ない）。`- Command:` の行はコマンドと `cwd` を見る

## スクリプト（commit しない。参考）

````ts
// batch4 design R2: probe (not committed) — build the planned "edge" and "plain" inputs with the base code, write them with
// writeReports into tmp/, and compare the files with renderMarkdown / jsonForFile. Raw characters are built at run time (String.fromCharCode).
// usage: node tmp/batch4-design/scripts/golden-probe.ts <out dir>
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildReport } from "../../../src/report/build-report.ts";
import { renderMarkdown } from "../../../src/report/markdown.ts";
import { writeReports } from "../../../src/report/write.ts";
import { jsonForFile } from "../../../src/security/raw-chars.ts";
import { DEFAULT_SECURITY } from "../../../src/security/scan.ts";
import type { CheckResult } from "../../../src/types.ts";

const out = process.argv[2];
const ESC = String.fromCharCode(0x1b);
const RLO = String.fromCharCode(0x202e);
const BT = String.fromCharCode(0x60);
function check(o: Partial<CheckResult>): CheckResult {
  return { name: "check", kind: "custom", command: "true", cwd: ".", required: true, timeoutSec: 600, description: null, status: "PASS", exitCode: 0, signal: null,
    timedOut: false, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1200, errorSummary: null, stdoutTail: "", stderrTail: "", outputTruncated: false, ...o };
}
const fail = (o: Partial<CheckResult>) => check({ status: "FAIL", exitCode: 1, errorSummary: "exit code 1", stderrTail: `boom ${ESC}[31mred${ESC}[0m and ${RLO}x`, ...o });
const sets: Record<string, CheckResult[]> = {
  plain: [
    check({ name: "lint", kind: "lint", command: "npm run lint" }),
    fail({ name: "unit", kind: "unit", command: "npm test | tee log", cwd: "pkg" }),
  ],
  edge: [
    check({ name: "e1", command: `echo ${BT}date${BT}` }),
    check({ name: "e2", command: `echo ${BT}${BT}x${BT}${BT}` }),
    fail({ name: "e3", command: `${BT}npm${BT} test` }),
    fail({ name: "e4", command: `npm test | grep ${BT}x${BT}` }),
    fail({ name: "e5", command: "npm test", cwd: `dir${BT}x` }),
    check({ name: "e6", command: " npm test " }),
    fail({ name: "e7", command: " npm run lint " }),
    check({ name: "e8", command: "npm test" }),
  ],
};
for (const [name, results] of Object.entries(sets)) {
  const report = buildReport({
    config: { projectRoot: "/proj", configPath: "/proj/aiqh.config.jsonc", project: { name: "demo" }, outputDir: "/proj/artifacts/verification", security: DEFAULT_SECURITY, checks: [] },
    results, git: { commit: "0123456789abcdef0123456789abcdef01234567", branch: "main", dirty: false },
    startedAt: new Date("2026-01-01T00:00:00.000Z"), finishedAt: new Date("2026-01-01T00:01:10.000Z"), toolVersion: "0.0.0-golden", runId: "54545454-5454-4545-8545-545454545454",
  });
  const dir = path.join(out, name);
  const w = writeReports(report, dir);
  const mdFile = readFileSync(w.latestMd, "utf8"), mdRender = renderMarkdown(report);
  const jsonFile = readFileSync(w.latestJson, "utf8"), jsonBuilt = `${jsonForFile(report)}\n`;
  const a = mdRender.split("\n"), b = mdFile.split("\n");
  const diffLines = a.map((l, i) => (l === b[i] ? null : i + 1)).filter((x) => x !== null);
  const rawInFile = [...mdFile].filter((c) => c.charCodeAt(0) === 0x1b || c.charCodeAt(0) === 0x202e).length;
  console.log(`${name}: md lines render=${a.length} file=${b.length}; lines that differ (render vs file): ${JSON.stringify(diffLines)}; raw ESC/RLO left in the md file: ${rawInFile}; json file === jsonForFile+LF: ${jsonFile === jsonBuilt}; history === latest.json: ${readFileSync(w.history, "utf8") === jsonFile}`);
  // the lines C-44 would change: table rows and "- Command:" lines whose command or cwd has a backtick or starts and ends with a space
  const touched = (s: string) => s.includes(BT) || (s.startsWith(" ") && s.endsWith(" ") && !/^ +$/.test(s));
  const rows = b.map((l, i) => [l, i + 1] as const).filter(([l]) => /^\| \d+ \| /.test(l) && results.some((r, k) => l.startsWith(`| ${k + 1} | `) && touched(r.command)));
  const cmd = b.map((l, i) => [l, i + 1] as const).filter(([l]) => l.startsWith("- Command: ")).filter(([l]) => results.some((r) => r.status !== "PASS" && touched(r.command) || (r.status !== "PASS" && touched(r.cwd))) && (l.includes(BT + BT) || /`( |`)|( |`)`/.test(l) || true));
  const fails = results.filter((r) => r.status !== "PASS");
  const cmdTouched = fails.filter((r) => touched(r.command) || touched(r.cwd)).length;
  console.log(`   checks table rows to change: ${rows.length} (lines ${JSON.stringify(rows.map(([, n]) => n))}); "- Command:" lines to change: ${cmdTouched} of ${fails.length} failing checks`);
}
````
