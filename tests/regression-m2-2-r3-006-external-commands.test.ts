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
  // M2-2-R1-003: 1 probe variable = 1 tool; a variable that only names a tool is not a probe
  f17_or_mixed_probe: {
    text: `${CP("spawnSync")}\n${V}\nconst hasAny = spawnSync("unzip", ["-v"]).status === 0 || spawnSync("python3", ["-c", "import zipfile"]).status === 0;\nit.skipIf(!hasAny)("mixed", () => { spawnSync("python3", ["-c", "print(1)"]); });\n`,
    bad: [3, 3, 4],
  },
  f18_and_mixed_probe: {
    text: `${CP("spawnSync")}\n${V}\nconst hasBoth = spawnSync("unzip", ["-v"]).status === 0 && spawnSync("python3", ["-c", "import zipfile"]).status === 0;\nit.skipIf(!hasBoth)("mixed", () => { spawnSync("python3", ["-c", "print(1)"]); });\n`,
    bad: [3, 3, 4],
  },
  f19_string_only_variable: { text: `${CP("spawnSync")}\n${V}\nconst note = "python3";\nit.skipIf(!note)("note", () => { spawnSync("python3", ["-c", "print(1)"]); });\n`, bad: [4] },
  f20_one_variable_per_tool_ok: {
    text: `${CP("spawnSync")}\n${V}\nconst hasUnzip = spawnSync("unzip", ["-v"]).status === 0;\nconst hasPython = spawnSync("python3", ["-c", "import zipfile"]).status === 0;\nit.skipIf(!hasUnzip)("u", () => { spawnSync("unzip", ["-l", "a.zip"]); });\nit.skipIf(!hasPython)("p", () => { spawnSync("python3", ["-c", "print(1)"]); });\n`,
    bad: [],
  },
  f22_string_in_array: { text: `${CP("spawnSync")}\n${V}\nconst tools = ["unzip", "python3"];\nit.skipIf(tools.length === 0)("list", () => { spawnSync("unzip", ["-l", "a.zip"]); });\n`, bad: [4] },
  f15_git_node_ok: { text: `${CP("execFileSync, spawnSync")}\n${V}\nit("f", () => { execFileSync("git", ["--version"]); spawnSync(process.execPath, ["-v"]); });\n`, bad: [] },
  // v0.15.1 (item 51): bash is a probed tool like unzip and python3
  f23_bash_guarded_ok: { text: `${CP("spawnSync")}\nimport { describe, it } from "vitest";\nconst hasBash = spawnSync("bash", ["--version"]).status === 0;\ndescribe.skipIf(!hasBash)("guarded", () => { it("runs", () => { spawnSync("bash", ["-e", "step.sh"]); }); });\n`, bad: [] },
  f16_require: {
    text: `import { createRequire } from "node:module";\n${V}\nconst require = createRequire(import.meta.url);\nit("f", () => { const cp = require("node:child_process") as typeof import("node:child_process"); cp.spawnSync("shasum", ["-a", "256"]); });\n`,
    bad: [4],
  },
};
/** Beyond static analysis (a command inside a script string): recorded as node; covered by the unit-minpath check. */
const LIMIT = {
  f11_node_inner: `${CP("spawnSync")}\n${V}\nit("f", () => { spawnSync(process.execPath, ["-e", "require('node:child_process').execSync('shasum -a 256 f')"]); });\n`,
  // Known limit (M2-2-R1-003, recorded in ADR-0014, not fixed): the direction of the skipIf condition is not read, so a python3 call that is
  // skipped when python3 exists (`skipIf(hasPython)`) is accepted as `guarded`. A fix of the guard changes this expectation.
  f21_inverted_skipif: `${CP("spawnSync")}\n${V}\nconst hasPython = spawnSync("python3", ["-c", "import zipfile"]).status === 0;\nit.skipIf(hasPython)("inverted", () => { spawnSync("python3", ["-c", "print(1)"]); });\n`,
};

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

  it("limit: the direction of the skipIf condition is not read (an inverted condition is guarded)", () => {
    expect(processCalls(program, filesUnder(program, `${DIR}/f21_`)).map((c) => `${c.command} ${c.verdict}`)).toEqual(["python3 probe", "python3 guarded"]);
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

  it("v0.15.1 (item 51): the bash probe of the workflow run test and its guarded calls", () => {
    expect(calls.filter((c) => c.where.startsWith("tests/reusable-workflow-run.test.ts:")).map((c) => `${c.command} ${c.verdict}`)).toEqual(["bash probe", "bash guarded", "bash guarded"]);
    expect(processCalls(program, filesUnder(program, `${DIR}/f23_`)).map((c) => `${c.command} ${c.verdict}`)).toEqual(["bash probe", "bash guarded"]);
  });
});
