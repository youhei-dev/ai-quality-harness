/**
 * M2-2-R2-001 (High, fixed in v0.5.2): security-scan printed through the masker alone, so a forbidden raw character in a
 * path (the --cwd directory, a file name, a config error) reached the terminal as it was: v0.5.1 made the unreadable
 * default config a config error that quotes its path, and a U+202E in that path came out on standard error. The same held
 * for security-scan's scan output since M1, for verify and init, for commander's usage errors and for the option parser;
 * only review-packet escaped raw characters. Now every line, JSON document and commander message goes through one
 * boundary (src/output.ts): raw characters become `\u{HEX}`, then the masker. tests/structure/output-guard.ts allows
 * writes to the terminal only there.
 * Forbidden characters and secret shapes are built at run time. The new module is imported inside the tests that use it,
 * so that the other tests of this file still run (and fail) against the code before the fix.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { runVerify } from "../src/commands/verify.ts";
import { maskDeep, maskSecrets } from "../src/security/mask.ts";
import { escapeRawChars, isForbiddenCodePoint } from "../src/security/raw-chars.ts";
import { fake, makeTempDir, nodeEval } from "./helpers.ts";
import { OUTPUT_ALLOWED, outputReferences, outputViolations } from "./structure/output-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const ch = (cp: number): string => String.fromCodePoint(cp);
const RLO = ch(0x202e);
const SHOWN = "\\u{202E}";
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const raw = (s: string): number => [...s].filter((c) => isForbiddenCodePoint(c.codePointAt(0) ?? 0)).length;

interface Run {
  code: number;
  out: string;
  err: string;
}

function tempDir(prefix: string): string {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  return t.dir;
}

/** A git repository at `dir` whose tracked .gitignore covers the four default probes. */
function repoAt(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(dir, ".gitignore"), ".env\n.env.local\n.env.production\n.env.development\n");
  writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", ".gitignore", "a.ts");
  git("commit", "-q", "-m", "base");
  return dir;
}

function loopConfig(dir: string): void {
  symlinkSync(path.join(dir, "loop.jsonc"), path.join(dir, "aiqh.config.jsonc"));
  symlinkSync(path.join(dir, "aiqh.config.jsonc"), path.join(dir, "loop.jsonc"));
}

async function scan(opts: Parameters<typeof runSecurityScan>[0]): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runSecurityScan({ ...opts, log: (l) => out.push(l), logError: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function cli(cwd: string, args: string[]): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 120_000, killSignal: "SIGKILL" });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** No raw forbidden character anywhere, and the U+202E shown as `\u{202E}`. */
function escaped(res: Run): void {
  expect(raw(res.out), res.out).toBe(0);
  expect(raw(res.err), res.err).toBe(0);
  expect(res.out + res.err).toContain(SHOWN);
}

describe("M2-2-R2-001: security-scan (the review's case and the other paths that quote a path)", () => {
  it("a: a --cwd with U+202E and a default config that is a symbolic link loop: exit 2, the config error escaped", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r2-001-"), `cwd${RLO}dir`));
    loopConfig(dir);
    const res = await scan({ cwd: dir });
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/config file could not be read: .*\(ELOOP/);
    escaped(res);
  });

  it("a with --json: the same (the config error is printed, not JSON)", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r2-001-"), `cwd${RLO}dir`));
    loopConfig(dir);
    const res = await scan({ cwd: dir, json: true });
    expect(res.code).toBe(2);
    escaped(res);
  });

  it("b: the same directory with an explicit --config that does not exist: exit 2, escaped", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r2-001-"), `cwd${RLO}dir`));
    const res = await scan({ cwd: dir, configPath: path.join(dir, "missing.jsonc") });
    expect(res.code).toBe(2);
    expect(res.err).toContain("config file not found: ");
    escaped(res);
  });

  it("c: a directory with U+202E that is not a git work tree: exit 2, the scan error escaped (text and --json)", async () => {
    const dir = path.join(tempDir("aiqh-r2-001-"), `nogit${RLO}dir`);
    mkdirSync(dir);
    for (const json of [false, true]) {
      const res = await scan({ cwd: dir, json });
      expect(res.code).toBe(2);
      expect(res.err).toContain("not a git repository");
      escaped(res);
    }
  });

  it("d: a finding in a file whose name has U+202E: exit 1, the file name escaped (text and --json)", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r2-001-"), "plain"));
    const name = `k${RLO}.ts`;
    writeFileSync(path.join(dir, name), `export const k = "${SECRET()}";\n`);
    execFileSync("git", ["add", "--", name], { cwd: dir });
    const text = await scan({ cwd: dir });
    expect(text.code).toBe(1);
    expect(text.out).toContain(`[secret] k${SHOWN}.ts:1 aws (value not shown)`);
    escaped(text);
    const json = await scan({ cwd: dir, json: true });
    expect(json.code).toBe(1);
    escaped(json);
    const parsed = JSON.parse(json.out) as { findings: Array<{ file: string }> };
    expect(parsed.findings.map((f) => f.file)).toContain(`k${SHOWN}.ts`);
    expect(json.out).not.toContain(SECRET());
  });

  it("a normal scan in a directory with U+202E: the heading line escaped", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r2-001-"), `scan${RLO}dir`));
    const res = await scan({ cwd: dir });
    expect(res.code).toBe(0);
    expect(res.out).toContain(`aiqh security-scan — `);
    escaped(res);
  });
});

describe("M2-2-R2-001: verify and init", () => {
  it("verify: a config that does not exist in a directory with U+202E: exit 2, the config error escaped", async () => {
    const dir = path.join(tempDir("aiqh-r2-001-"), `cwd${RLO}dir`);
    mkdirSync(dir);
    const out: string[] = [];
    const err: string[] = [];
    const code = await runVerify({ cwd: dir, toolVersion: "t", log: (l) => out.push(l), logError: (l) => err.push(l) });
    expect(code).toBe(2);
    escaped({ code, out: out.join("\n"), err: err.join("\n") });
  });

  it("verify: a project name with U+202E and a check whose output has U+202E: the heading and the tail escaped", async () => {
    const dir = tempDir("aiqh-r2-001-");
    // The check prints U+202E, built by the child at run time, and fails so that its tail is shown.
    const command = nodeEval("process.stdout.write('out ' + String.fromCodePoint(0x202e) + ' end'); process.exit(3)");
    writeFileSync(path.join(dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: `p${RLO}q` }, checks: [{ name: "c", kind: "unit", command }] }));
    const out: string[] = [];
    const err: string[] = [];
    const code = await runVerify({ cwd: dir, toolVersion: "t", log: (l) => out.push(l), logError: (l) => err.push(l) });
    expect(code).toBe(1);
    const res = { code, out: out.join("\n"), err: err.join("\n") };
    escaped(res);
    expect(res.out).toContain(`aiqh verify — p${SHOWN}q`);
    expect(res.out).toContain(`out ${SHOWN} end`);
  });

  it("init: a directory with U+202E: the root escaped (text and --json)", async () => {
    const dir = path.join(tempDir("aiqh-r2-001-"), `cwd${RLO}dir`);
    mkdirSync(dir);
    for (const json of [false, true]) {
      const out: string[] = [];
      const err: string[] = [];
      const code = await runInit({ cwd: dir, json, toolVersion: "t", log: (l) => out.push(l), logError: (l) => err.push(l) });
      expect(code).toBe(0);
      escaped({ code, out: out.join("\n"), err: err.join("\n") });
    }
  });
});

describe("M2-2-R2-001: the CLI's own output (default sinks, commander, the option parser)", () => {
  it("security-scan through the CLI: standard error escaped (the default sinks go through the boundary)", () => {
    const dir = repoAt(path.join(tempDir("aiqh-r2-001-"), `cwd${RLO}dir`));
    loopConfig(dir);
    const res = cli(dir, ["security-scan", "--cwd", dir]);
    expect(res.code).toBe(2);
    escaped(res);
  });

  it("commander: an unknown option and an unknown command with U+202E are escaped", () => {
    const dir = tempDir("aiqh-r2-001-");
    for (const args of [["security-scan", `--x${RLO}`], [`scan${RLO}`]]) {
      const res = cli(dir, args);
      expect(res.code).toBe(1);
      expect(res.err).toMatch(/^error: unknown (option|command)/);
      escaped(res);
    }
  });

  it("the option parser: --max-file-bytes with U+202E is escaped (exit 2)", () => {
    const res = cli(tempDir("aiqh-r2-001-"), ["review-packet", "--range", "a..b", "--max-file-bytes", `1${RLO}`]);
    expect(res.code).toBe(2);
    expect(res.err).toContain("aiqh: expected a positive integer, got ");
    escaped(res);
  });
});

describe("M2-2-R2-001 controls: secret shapes stay masked; output without raw characters is unchanged", () => {
  it("a secret shape in a path is still masked, and a U+202E next to it escaped", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r2-001-"), `cwd${RLO}dir`));
    const res = await scan({ cwd: dir, configPath: path.join(dir, `${SECRET()}.jsonc`) });
    expect(res.code).toBe(2);
    expect(res.err).not.toContain(SECRET());
    expect(res.err).toContain("[REDACTED:aws]");
    escaped(res);
  });

  it("a secret shape in a check's output is still masked by verify", async () => {
    const dir = tempDir("aiqh-r2-001-");
    const command = nodeEval(`process.stdout.write('${fake("AK", "IA")}' + 'QWERTYUIOPASDFGH'); process.exit(1)`);
    writeFileSync(path.join(dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "c", kind: "unit", command }] }));
    const out: string[] = [];
    const code = await runVerify({ cwd: dir, toolVersion: "t", log: (l) => out.push(l), logError: () => {} });
    expect(code).toBe(1);
    expect(out.join("\n")).not.toContain(SECRET());
    expect(out.join("\n")).toContain("[REDACTED:aws]");
  });

  it("text and JSON without raw characters come out as before (v0.5.1: the masker alone; review-packet: escapeRawChars first)", async () => {
    const { escapeForDisplay, safeJson, safeText } = await import("../src/output.ts");
    const samples = ["plain ASCII line", "日本語のパス /tmp/作業/a.ts", "tab\tseparated\tcolumns", "multi\nline\nmessage\n", "  $ node -e 0", `key: ${SECRET()}`, "", "emoji 😀 and « quotes »"];
    for (const s of samples) {
      expect(safeText(s)).toBe(maskSecrets(s));
      expect(escapeForDisplay(s, "escape")).toBe(escapeRawChars(s));
    }
    const value = { root: "/tmp/作業", findings: [{ file: "a\tb.ts", line: 1, message: `x ${SECRET()}` }], count: 3, ok: true, none: null };
    expect(safeJson(value)).toBe(JSON.stringify(maskDeep(value), null, 2));
  });

  it("help and --version have no escape notation (commander's output goes through the boundary unchanged)", () => {
    for (const args of [["--help"], ["security-scan", "--help"], ["review-packet", "--help"], ["--version"]]) {
      const res = cli(tempDir("aiqh-r2-001-"), args);
      expect(res.code, args.join(" ")).toBe(0);
      expect(res.out).not.toContain("\\u{");
      expect(raw(res.out)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// static: only src/output.ts writes to the terminal

const P = "tests/__fixtures__/output";
const FORMS: Record<string, string> = {
  o01_console_log: `export const f = (): void => {\n  console.log("x");\n};\n`,
  o02_console_error: `export const f = (): void => {\n  console.error("x");\n};\n`,
  o03_console_warn: `export const f = (): void => {\n  console.warn("x");\n};\n`,
  o04_stdout_write: `export const f = (): boolean => process.stdout.write("x");\n`,
  o05_stderr_write: `export const f = (): boolean => process.stderr.write("x");\n`,
  o06_console_alias: `const c = console;\nexport const f = (): void => {\n  c.log("x");\n};\n`,
  o07_console_destructure: `const { error } = console;\nexport const f = (): void => {\n  error("x");\n};\n`,
  o08_console_element: `export const f = (): void => {\n  console["log"]("x");\n};\n`,
  o09_globalthis_console: `export const f = (): void => {\n  globalThis.console.log("x");\n};\n`,
  o10_stderr_bind: `const w = process.stderr.write.bind(process.stderr);\nexport const f = (): boolean => w("x");\n`,
  o11_process_alias: `const p = process;\nexport const f = (): boolean => p.stdout.write("x");\n`,
  o12_process_destructure: `const { stdout } = process;\nexport const f = (): boolean => stdout.write("x");\n`,
  o13_process_element: `export const f = (): boolean => process["stderr"].write("x");\n`,
  o14_node_process_import: `import { stderr } from "node:process";\nexport const f = (): boolean => stderr.write("x");\n`,
  o15_node_console_import: `import nodeConsole from "node:console";\nexport const f = (): void => {\n  nodeConsole.log("x");\n};\n`,
  o16_fs_fd: `import { writeSync } from "node:fs";\nexport const f = (): number => writeSync(2, "x");\n`,
  o17_fs_fd_const: `import { writeSync } from "node:fs";\nconst FD = 1;\nexport const f = (): number => writeSync(FD, "x");\n`,
  o18_fs_dev_stdout: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("/dev/stdout").end("x");\n};\n`,
};
const ALLOWED_FORM = `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("out.txt", "x");\n  process.exitCode = 1;\n};\n`;
const fixtures = { ...Object.fromEntries(Object.entries(FORMS).map(([name, text]) => [`${P}/${name}.ts`, text])), [`${P}/a01_no_terminal.ts`]: ALLOWED_FORM };
const program = createProgram(fixtures);

describe("M2-2-R2-001: static — only the boundary writes to the terminal (tests/structure/output-guard.ts)", () => {
  it("every fixture type-checks", () => {
    expect(typeErrors(program, filesUnder(program, P))).toEqual([]);
  });

  it("every way of writing to the terminal is reported", () => {
    const refs = outputReferences(program, filesUnder(program, P));
    const missed = Object.keys(FORMS).filter((name) => !refs.some((r) => r.where.startsWith(`${P}/${name}.ts:`)));
    expect(missed).toEqual([]);
  });

  it("a module that does not write to the terminal is not reported (a file write, process.exitCode)", () => {
    expect(outputReferences(program, filesUnder(program, `${P}/a01_no_terminal.ts`))).toEqual([]);
  });

  it("src/ writes to the terminal only in src/output.ts", () => {
    expect([...OUTPUT_ALLOWED]).toEqual(["src/output.ts"]);
    expect(outputViolations(program, filesUnder(program, "src/"))).toEqual([]);
  });

  it("the guard sees the boundary itself (console and both streams in src/output.ts)", () => {
    const refs = outputReferences(program, filesUnder(program, "src/output.ts")).map((r) => r.what);
    expect(new Set(refs)).toEqual(new Set(["console", "process.stdout", "process.stderr"]));
  });
});
