/**
 * M2-1-R3-006 (Medium, fixed in M2-2): the guard that tests/ start no undeclared external command (M2-1-R2-004)
 * matched double-quoted literals after a list of function names, and accepted a probed tool anywhere in a file
 * that had one `it.skipIf(`. Single quotes, variables, template literals, promisify aliases, element access,
 * destructuring and `exec` passed; so did an unguarded python3 next to an unrelated skipIf.
 *  - static: the process guard (tests/structure/process-guard.ts, type checker) reports each of those forms
 *    and accepts a probed tool only as its own probe or under a skipIf / runIf on that probe
 *  - tests/ has no violation, and the guard does see the real calls (git, node, the zip-interop probes)
 *  - a command started from inside a string (`node -e "…execSync(…)"`) is beyond static analysis: the self
 *    verify check `unit-minpath` (scripts/test-minimal-path.ts) runs the whole suite with only node and git on PATH
 * This replaces tests/regression-m2-1-r2-004-external-commands.test.ts (its regular expression and its
 * three-file dynamic run). Before the fix, the old regular expression missed 9 of the 14 violating forms.
 */
import { describe, expect, it } from "vitest";
import { processCalls } from "./structure/process-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const V = 'import { it } from "vitest";';
const CP = (names: string): string => `import { ${names} } from "node:child_process";`;

/** One form per file; `bad` lists the fixture lines (1-based) that must be reported, the others must pass. */
const FORMS: Record<string, { text: string; bad: number[] }> = {
  f01_double: { text: `${CP("spawnSync")}\n${V}\nit("f", () => { spawnSync("shasum", ["-a", "256"]); });\n`, bad: [3] },
  f02_single: { text: `${CP("spawnSync")}\n${V}\nit("f", () => { spawnSync('shasum', ['-a', '256']); });\n`, bad: [3] },
  f03_variable: { text: `${CP("spawnSync")}\n${V}\nconst cmd = "shasum";\nit("f", () => { spawnSync(cmd, ["-a", "256"]); });\n`, bad: [4] },
  f04_template: { text: `${CP("spawnSync")}\n${V}\nit("f", () => { spawnSync(\`shasum\`, ["-a", "256"]); });\n`, bad: [3] },
  f05_promisify: { text: `${CP("execFile")}\nimport { promisify } from "node:util";\n${V}\nconst execFileAsync = promisify(execFile);\nit("f", async () => { await execFileAsync("shasum", ["-a", "256"]); });\n`, bad: [5] },
  f06_namespace: { text: `import * as cp from "node:child_process";\n${V}\nit("f", () => { cp.spawnSync("shasum", ["-a", "256"]); });\n`, bad: [3] },
  f07_element: { text: `import * as cp from "node:child_process";\n${V}\nit("f", () => { cp["spawnSync"]("shasum", ["-a", "256"]); });\n`, bad: [3] },
  f08_destructure: { text: `import * as cp from "node:child_process";\n${V}\nconst { spawnSync: run } = cp;\nit("f", () => { run("shasum", ["-a", "256"]); });\n`, bad: [4] },
  f09_exec: { text: `${CP("exec")}\n${V}\nit("f", () => { exec("shasum -a 256 f"); });\n`, bad: [3] },
  f10_concat: { text: `${CP("spawnSync")}\n${V}\nit("f", () => { spawnSync("sha" + "sum", ["-a", "256"]); });\n`, bad: [3] },
  f12_dynamic_import: { text: `${V}\nit("f", async () => { const cp = await import("node:child_process"); cp.spawnSync("shasum", ["-a", "256"]); });\n`, bad: [2] },
  f13_unrelated_skipif: {
    text: `${CP("spawnSync")}\n${V}\nconst hasUnzip = spawnSync("unzip", ["-v"]).status === 0;\nit.skipIf(!hasUnzip)("guarded", () => { spawnSync("unzip", ["-l", "a.zip"]); });\nit("unguarded", () => { spawnSync("python3", ["-c", "print(1)"]); });\n`,
    bad: [5],
  },
  f14_guarded_ok: { text: `${CP("spawnSync")}\n${V}\nconst hasPython = spawnSync("python3", ["-c", "import zipfile"]).status === 0;\nit.skipIf(!hasPython)("guarded", () => { spawnSync("python3", ["-c", "print(1)"]); });\n`, bad: [] },
  f15_git_node_ok: { text: `${CP("execFileSync, spawnSync")}\n${V}\nit("f", () => { execFileSync("git", ["--version"]); spawnSync(process.execPath, ["-v"]); });\n`, bad: [] },
  f16_require: {
    text: `import { createRequire } from "node:module";\n${V}\nconst require = createRequire(import.meta.url);\nit("f", () => { const cp = require("node:child_process") as typeof import("node:child_process"); cp.spawnSync("shasum", ["-a", "256"]); });\n`,
    bad: [4],
  },
};
/** Beyond static analysis (a command inside a script string): recorded as node; covered by the unit-minpath check. */
const LIMIT = { f11_node_inner: `${CP("spawnSync")}\n${V}\nit("f", () => { spawnSync(process.execPath, ["-e", "require('node:child_process').execSync('shasum -a 256 f')"]); });\n` };

const DIR = "tests/__fixtures__/process";
const program = createProgram(Object.fromEntries([...Object.entries(FORMS).map(([n, f]) => [`${DIR}/${n}.ts`, f.text]), ...Object.entries(LIMIT).map(([n, t]) => [`${DIR}/${n}.ts`, t])]));

describe("M2-1-R3-006: static — external processes by the type checker", () => {
  it("every fixture type-checks", () => {
    expect(typeErrors(program, filesUnder(program, DIR))).toEqual([]);
  });

  it("each violating form is reported, and only those lines", () => {
    const calls = processCalls(program, filesUnder(program, DIR));
    const bad = (c: { verdict: string }): boolean => c.verdict.startsWith("violation");
    const reported = calls.filter(bad).map((c) => c.where).sort();
    const expected = Object.entries(FORMS).flatMap(([n, f]) => f.bad.map((l) => `${DIR}/${n}.ts:${l}`)).sort();
    expect(reported).toEqual(expected);
  });

  it("a probed tool passes as its own probe or under a skipIf on that probe", () => {
    const calls = processCalls(program, filesUnder(program, `${DIR}/f1`));
    expect(calls.filter((c) => c.where.startsWith(`${DIR}/f13_`) || c.where.startsWith(`${DIR}/f14_`)).map((c) => `${c.command} ${c.verdict}`)).toEqual([
      "unzip probe",
      "unzip guarded",
      "python3 violation: probed tool outside a skipIf / runIf on its own probe",
      "python3 probe",
      "python3 guarded",
    ]);
  });

  it("limit: a command inside a node -e script is seen only as node (the unit-minpath check covers it)", () => {
    expect(processCalls(program, filesUnder(program, `${DIR}/f11_`)).map((c) => `${c.command} ${c.verdict}`)).toEqual(["node declared"]);
  });
});

describe("M2-1-R3-006: tests/ start only declared or probed commands", () => {
  const calls = processCalls(program, filesUnder(program, "tests/").filter((sf) => !program.rel(sf).startsWith("tests/__fixtures__/")));

  it("no violation", () => {
    expect(calls.filter((c) => c.verdict.startsWith("violation")).map((c) => `${c.where} ${c.command} ${c.verdict}`)).toEqual([]);
  });

  it("the guard sees the real calls: git, node and the zip-interop probes", () => {
    expect(calls.filter((c) => c.command === "git").length).toBeGreaterThanOrEqual(80);
    expect(calls.filter((c) => c.command === "node").length).toBeGreaterThanOrEqual(10);
    expect(calls.filter((c) => c.where.startsWith("tests/zip-interop.test.ts:")).map((c) => `${c.command} ${c.verdict}`)).toEqual(["unzip probe", "python3 probe", "unzip guarded", "unzip guarded", "python3 guarded"]);
  });
});
