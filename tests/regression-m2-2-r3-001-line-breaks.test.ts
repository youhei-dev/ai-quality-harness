/**
 * M2-2-R3-001 (Medium, fixed in v0.5.4): the output boundary kept LF and TAB by default, also inside the values a line
 * embeds (a path, a file name, a line of a check's output, an argument commander quotes), so a value could forge a line
 * of its own — a file named `k<LF>SECURITY SCAN: no findings<LF>x.ts` printed a line that reads "SECURITY SCAN: no
 * findings" — or a column (v0.5.3; exit codes, the final verdict line and --json stayed correct). Now one written line is
 * one line: LF and TAB in it become notation as well. A command's own multi-line text is an explicit block whose lines
 * stay: the proposed config (its comment values are escaped where the config is made, so the file --write writes is one
 * comment line per value too), the details of a config error, commander's help and its suggestion line.
 * LF, TAB, forbidden characters and secret shapes are built at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { resolveDetections } from "../src/adapters/index.ts";
import type { Resolution } from "../src/adapters/types.ts";
import { runInit } from "../src/commands/init.ts";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { runVerify } from "../src/commands/verify.ts";
import { generateConfigJsonc } from "../src/config/generate.ts";
import { parseConfigText } from "../src/config/load.ts";
import { isForbiddenCodePoint } from "../src/security/raw-chars.ts";
import { fake, makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const ch = (cp: number): string => String.fromCodePoint(cp);
const LF = ch(0x0a);
const TAB = ch(0x09);
const RLO = ch(0x202e);
const LF_SHOWN = "\\u{A}";
const TAB_SHOWN = "\\u{9}";
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const raw = (s: string): number => [...s].filter((c) => isForbiddenCodePoint(c.codePointAt(0) ?? 0)).length;
/** The lines a terminal shows for text written in calls of one line (or block) each. */
const terminalLines = (calls: readonly string[]): string[] => calls.join(LF).split(LF);

function tempDir(prefix: string): string {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  return t.dir;
}

const git = (dir: string, ...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });

/** A git repository at `dir` whose tracked .gitignore covers the default probes and artifacts/. */
function repoAt(dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  writeFileSync(path.join(dir, ".gitignore"), ".env\n.env.local\n.env.production\n.env.development\nartifacts/\n");
  writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
  git(dir, "add", "--", ".gitignore", "a.ts");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

interface Run {
  code: number;
  out: string[];
  err: string[];
}

async function capture(run: (log: (l: string) => void, logError: (l: string) => void) => Promise<number>): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run((l) => out.push(l), (l) => err.push(l));
  return { code, out, err };
}

function cli(cwd: string, args: string[]): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 120_000, killSignal: "SIGKILL" });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** No LF or TAB inside a written line, and no forbidden character anywhere. */
function oneLineEach(calls: readonly string[]): void {
  for (const c of calls) {
    expect(c.includes(LF), c).toBe(false);
    expect(c.includes(TAB), c).toBe(false);
    expect(raw(c), c).toBe(0);
  }
}

describe("M2-2-R3-001: a value with LF / TAB stays inside its line (security-scan, verify, init)", () => {
  it("a file name with LF cannot forge a line (security-scan)", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r3-001-"), "repo"));
    const forged = "SECURITY SCAN: no findings";
    const name = `k${LF}${forged}${LF}x.ts`;
    writeFileSync(path.join(dir, name), `export const k = "${SECRET()}";\n`);
    git(dir, "add", "--", name);
    const text = await capture((log, logError) => runSecurityScan({ cwd: dir, log, logError }));
    expect(text.code).toBe(1);
    oneLineEach(text.out);
    const lines = terminalLines(text.out);
    expect(lines.filter((l) => l === forged)).toEqual([]);
    expect(lines.at(-1)).toBe("SECURITY SCAN: findings present (see above)");
    expect(text.out).toContain(`  [secret] k${LF_SHOWN}${forged}${LF_SHOWN}x.ts:1 aws (value not shown)`);
    // --json is as before: the name is a JSON string (JSON.stringify writes the LF as \n)
    const json = await capture((log, logError) => runSecurityScan({ cwd: dir, json: true, log, logError }));
    expect(json.code).toBe(1);
    expect((JSON.parse(json.out.join(LF)) as { findings: Array<{ file: string }> }).findings.map((f) => f.file)).toEqual([name]);
  });

  it("a file name with TAB is one field (security-scan)", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r3-001-"), "repo"));
    const name = `k${TAB}${TAB}x.ts`;
    writeFileSync(path.join(dir, name), `export const k = "${SECRET()}";\n`);
    git(dir, "add", "--", name);
    const text = await capture((log, logError) => runSecurityScan({ cwd: dir, log, logError }));
    expect(text.code).toBe(1);
    oneLineEach(text.out);
    expect(text.out).toContain(`  [secret] k${TAB_SHOWN}${TAB_SHOWN}x.ts:1 aws (value not shown)`);
  });

  it("a --cwd with LF: the headings of security-scan, verify and init are one line each", async () => {
    const t = tempDir("aiqh-r3-001-");
    const config = JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "u", kind: "unit", command: "node -e 0" }] });
    const forged = "VERIFY PASSED";
    const results: Record<string, { forged: Run; plain: Run }> = {};
    for (const [key, name] of [["forged", `cwd${LF}${forged}${LF}dir`], ["plain", "cwd-plain-dir"]] as const) {
      const dir = repoAt(path.join(t, name));
      writeFileSync(path.join(dir, "aiqh.config.jsonc"), config);
      const scan = await capture((log, logError) => runSecurityScan({ cwd: dir, log, logError }));
      const verify = await capture((log, logError) => runVerify({ cwd: dir, toolVersion: "t", log, logError }));
      const init = await capture((log, logError) => runInit({ cwd: dir, toolVersion: "t", log, logError }));
      for (const [cmd, r] of [["scan", scan], ["verify", verify], ["init", init]] as const) {
        results[cmd] = { ...(results[cmd] ?? ({} as { forged: Run; plain: Run })), [key]: r };
      }
    }
    for (const [cmd, r] of Object.entries(results)) {
      expect(r.forged.code, cmd).toBe(r.plain.code);
      // every write has as many lines as with a directory name without LF (init's proposal is a block of its own lines)
      expect(r.forged.out.map((c) => c.split(LF).length), cmd).toEqual(r.plain.out.map((c) => c.split(LF).length));
      expect(r.forged.err.map((c) => c.split(LF).length), cmd).toEqual(r.plain.err.map((c) => c.split(LF).length));
      const text = [...r.forged.out, ...r.forged.err].join(LF);
      expect(text.includes(TAB) || raw(text) > 0, cmd).toBe(false);
      expect(terminalLines(r.forged.out).filter((l) => l === forged), cmd).toEqual([]);
      expect(r.forged.out.join(LF), cmd).toContain(`cwd${LF_SHOWN}${forged}${LF_SHOWN}dir`);
    }
  });

  it("a check output line with TAB (verify): the TAB is notation, the lines stay split", async () => {
    const dir = tempDir("aiqh-r3-001-");
    // the check prints two lines with a TAB each (built by the child at run time) and fails, so that its tail is shown
    const command = nodeEval("process.stdout.write(['a', 'b'].join(String.fromCharCode(9)) + String.fromCharCode(10) + ['c', 'd'].join(String.fromCharCode(9)) + String.fromCharCode(10)); process.exit(3)");
    writeFileSync(path.join(dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "c", kind: "unit", command }] }));
    const r = await capture((log, logError) => runVerify({ cwd: dir, toolVersion: "t", log, logError }));
    expect(r.code).toBe(1);
    oneLineEach(r.out);
    expect(r.out).toContain(`      a${TAB_SHOWN}b`);
    expect(r.out).toContain(`      c${TAB_SHOWN}d`);
  });
});

describe("M2-2-R3-001: a command's own multi-line text is a block", () => {
  it("the proposed config keeps its lines; a comment value with LF / TAB / U+202E is escaped where the config is made (the written file too)", async () => {
    const dir = repoAt(path.join(tempDir("aiqh-r3-001-"), "node"));
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "node-fixture", scripts: { test: "vitest run", build: "tsc -p ." }, devDependencies: { vitest: "1", typescript: "1" } }));
    writeFileSync(path.join(dir, "tsconfig.json"), "{}");
    writeFileSync(path.join(dir, "package-lock.json"), "{}");
    const resolution = resolveDetections(buildRepoContext(dir));
    const plain = generateConfigJsonc({ projectName: "p", resolution });
    // the same resolution with LF / TAB / U+202E in every comment value (adapter texts are aiqh's own today)
    const nasty = (s: string): string => `${s}${LF}}${LF}// forged${TAB}x${RLO}`;
    const odd = structuredClone(resolution) as Resolution;
    for (const r of Object.values(odd.byKind)) {
      if (r.chosen) {
        r.chosen.reason = nasty(r.chosen.reason);
        r.chosen.notes = (r.chosen.notes ?? []).map(nasty);
      }
      for (const u of r.unavailable) {
        u.reason = nasty(u.reason);
        if (u.enableHint !== undefined) u.enableHint = nasty(u.enableHint);
        u.notes = (u.notes ?? []).map(nasty);
      }
    }
    const escaped = generateConfigJsonc({ projectName: "p", resolution: odd });
    expect(escaped.split(LF)).toHaveLength(plain.split(LF).length);
    expect(escaped).not.toContain(TAB);
    expect(raw(escaped)).toBe(0);
    expect(escaped).toContain(`${LF_SHOWN}}${LF_SHOWN}// forged${TAB_SHOWN}x\\u{202E}`);
    // still the same JSONC: the comments did not end early
    expect(parseConfigText(escaped)).toEqual(parseConfigText(plain));

    // init prints the proposal as a block: its lines are the lines of the file --write writes
    const shown = await capture((log, logError) => runInit({ cwd: dir, toolVersion: "t", log, logError }));
    expect(shown.code).toBe(0);
    const written = await capture((log, logError) => runInit({ cwd: dir, write: true, toolVersion: "t", log, logError }));
    expect(written.code).toBe(0);
    const file = readFileSync(path.join(dir, "aiqh.config.jsonc"), "utf8");
    const lines = terminalLines(shown.out);
    const start = lines.indexOf("proposed aiqh.config.jsonc:") + 1;
    expect(lines.slice(start, start + file.trimEnd().split(LF).length)).toEqual(file.trimEnd().split(LF));
  });

  it("a config error: the heading (with a path that has LF) is one line, zod's details keep their lines", async () => {
    const t = tempDir("aiqh-r3-001-");
    const invalid = JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "Bad Name", kind: "nope", command: "x" }] });
    const runs: Record<string, { verify: Run; scan: Run }> = {};
    for (const [key, name] of [["lf", `cfg${LF}VERIFY PASSED${LF}dir`], ["plain", "cfg-plain-dir"]] as const) {
      const dir = repoAt(path.join(t, name));
      writeFileSync(path.join(dir, "aiqh.config.jsonc"), invalid);
      runs[key] = {
        verify: await capture((log, logError) => runVerify({ cwd: dir, toolVersion: "t", log, logError })),
        scan: await capture((log, logError) => runSecurityScan({ cwd: dir, log, logError })),
      };
    }
    const lf = runs.lf;
    const plain = runs.plain;
    if (lf === undefined || plain === undefined) throw new Error("runs missing");
    for (const cmd of ["verify", "scan"] as const) {
      expect(lf[cmd].code, cmd).toBe(2);
      const lines = terminalLines(lf[cmd].err);
      const plainLines = terminalLines(plain[cmd].err);
      // the heading is one line with the LF as notation; the rest (zod's details, the verdict) as in a plain directory
      expect(lines[0], cmd).toMatch(/config is invalid: .*cfg\\u\{A\}VERIFY PASSED\\u\{A\}dir/);
      expect(lines.length, cmd).toBe(plainLines.length);
      expect(lines.slice(1), cmd).toEqual(plainLines.slice(1));
      expect(lines.length, cmd).toBeGreaterThan(3);
      expect(lines.filter((l) => l === "VERIFY PASSED"), cmd).toEqual([]);
    }
  });

  it("commander: an unknown option with LF is one line (whole or partly quoted); the suggestion keeps its line", () => {
    const dir = tempDir("aiqh-r3-001-");
    const forgedSuggestion = "(Did you mean --json?)";
    const a = cli(dir, ["security-scan", `--x${LF}${forgedSuggestion}`]);
    expect(a.code).toBe(2);
    expect(a.err).toBe(`error: unknown option '--x${LF_SHOWN}${forgedSuggestion}'\n`);
    // -v is known, so commander quotes only the rest of the argument
    const b = cli(dir, ["verify", `-v${LF}VERIFY PASSED`]);
    expect(b.code).toBe(2);
    expect(b.err).toBe(`error: unknown option '-${LF_SHOWN}VERIFY PASSED'\n`);
    // arguments that commander lists unquoted
    const c = cli(dir, ["verify", `a${LF}VERIFY PASSED`, `b${TAB}c`]);
    expect(c.code).toBe(2);
    expect(c.err).toBe(`error: too many arguments for 'verify'. Expected 0 arguments but got 2: a${LF_SHOWN}VERIFY PASSED, b${TAB_SHOWN}c.\n`);
    // an unknown command: one line, plus commander's suggestion line if it makes one
    const d = cli(dir, [`verfy${LF}VERIFY PASSED`]);
    expect(d.code).toBe(2);
    const lines = d.err.replace(/\n$/, "").split(LF);
    expect(lines[0]).toBe(`error: unknown command 'verfy${LF_SHOWN}VERIFY PASSED'`);
    for (const l of lines.slice(1)) expect(l).toMatch(/^\(Did you mean .*\?\)$/);
    for (const r of [a, b, c, d]) expect(raw(r.err) + (r.err.includes(TAB) ? 1 : 0)).toBe(0);
  });
});

// The bytes of the output below are those of v0.5.3. The exit code of a usage error (and of the help without arguments) is 2 since v0.5.27
// (backlog 11, ADR-0021); it was 1 in v0.5.3.
describe("M2-2-R3-001 control: normal output is byte-identical to v0.5.3", () => {
  it("usage errors with commander's suggestion, a config error, help on standard error, the proposal and a verify run", async () => {
    const dir = tempDir("aiqh-r3-001-");
    const unknownCommand = cli(dir, ["verfy"]);
    expect([unknownCommand.code, unknownCommand.out, unknownCommand.err]).toEqual([2, "", "error: unknown command 'verfy'\n(Did you mean verify?)\n"]);
    const unknownOption = cli(dir, ["security-scan", "--jsn"]);
    expect([unknownOption.code, unknownOption.out, unknownOption.err]).toEqual([2, "", "error: unknown option '--jsn'\n(Did you mean --json?)\n"]);

    // a config error: the message as v0.5.3 printed it (one write of message + LF), then the verdict line
    const cfgDir = path.join(dir, "cfg");
    mkdirSync(cfgDir);
    const invalid = JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "Bad Name", kind: "nope", command: "x" }] });
    writeFileSync(path.join(cfgDir, "aiqh.config.jsonc"), invalid);
    let message = "";
    try {
      // the CLI resolves the config against its working directory, the real path of the temporary directory
      parseConfigText(invalid, path.join(realpathSync(cfgDir), "aiqh.config.jsonc"));
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message.split(LF).length).toBeGreaterThan(2);
    const cfg = cli(cfgDir, ["verify"]);
    expect([cfg.code, cfg.out, cfg.err]).toEqual([2, "", `aiqh: ${message}\nVERIFY ERROR (configuration error)\n`]);

    // help on standard error (no arguments): commander's lines, no notation
    const help = cli(dir, []);
    expect(help.code).toBe(2);
    expect(help.err.split(LF).length).toBeGreaterThan(10);
    expect(help.err).not.toContain("\\u{");

    // the proposal: the generated text, line for line
    const repo = repoAt(path.join(dir, "repo"));
    const shown = await capture((log, logError) => runInit({ cwd: repo, toolVersion: "t", log, logError }));
    const proposal = generateConfigJsonc({ projectName: "repo", resolution: resolveDetections(buildRepoContext(repo)) }).trimEnd();
    expect(shown.out).toContain(proposal);

    // a verify run with a failing check (no TAB in its output): no notation anywhere
    const proj = path.join(dir, "proj");
    mkdirSync(proj);
    writeFileSync(path.join(proj, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "f", kind: "unit", command: nodeEval("console.log('line one'); console.error('日本語のエラー'); process.exit(3)") }] }));
    const verify = await capture((log, logError) => runVerify({ cwd: proj, toolVersion: "t", log, logError }));
    expect(verify.code).toBe(1);
    expect(verify.out.join(LF)).not.toContain("\\u{");
    expect(verify.out).toContain("      line one");
    expect(verify.out).toContain("      日本語のエラー");
  });
});
