/**
 * Backlog 9 (ADR-0020), through the real CLI as a child process (the lesson of M2-2-R3-002: a function that is right on its own says
 * nothing about whether the exit is connected). A check that prints every forbidden character, an ANSI colour, an invalid byte and a
 * fenced heading to both streams; a project name that holds forbidden characters; an `init --write` for a package.json whose name does.
 * The forbidden characters are built from the code points at run time: this file holds none of them raw.
 */
import { execFile } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, parseConfigText, resolveConfig } from "../src/config/load.ts";
import { FORBIDDEN_RANGES, findRawChars } from "../src/security/raw-chars.ts";
import { makeTempDir } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const FORBIDDEN: number[] = FORBIDDEN_RANGES.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
const chr = (cp: number): string => String.fromCodePoint(cp);
/** A name with one character of each family: bidi, DEL, C1, U+2028, BOM (the ones JSON.stringify leaves raw). */
const WEIRD_NAME = `x${chr(0x202e)}y${chr(0x7f)}${chr(0x85)}${chr(0x2028)}z${chr(0xfeff)}w`;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd, env, timeout: 50_000, killSignal: "SIGKILL" });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** Lines of `md` that start with `prefix` outside every code fence. */
function outsideFence(md: string, prefix: string): number {
  let fence: number | null = null;
  let n = 0;
  for (const l of md.split("\n")) {
    const m = /^(`{3,})(.*)$/.exec(l);
    if (m !== null) {
      const run = (m[1] ?? "").length;
      if (fence === null) {
        fence = run;
        continue;
      }
      if (run >= fence && (m[2] ?? "").trim() === "") {
        fence = null;
        continue;
      }
    }
    if (fence === null && l.startsWith(prefix)) n += 1;
  }
  return n;
}

describe("backlog 9: aiqh verify writes no forbidden character raw (real CLI)", () => {
  it("a check prints all of them; the three report files and the terminal hold none, and the JSON still has the data", async () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const emit = [
      `const cps = ${JSON.stringify(FORBIDDEN)};`,
      "for (const cp of cps) {",
      "  const s = '[' + cp + ']' + String.fromCodePoint(cp) + '[/]\\n';",
      "  process.stdout.write(s);",
      "  process.stderr.write(s);",
      "}",
      "process.stdout.write('[ANSI]\\x1b[31mred\\x1b[0m\\n');",
      "process.stdout.write(Buffer.from([0xff, 0xfe]));",
      "process.stdout.write('\\n```\\n\\n# Injected heading\\n\\n```text\\n');",
      "process.exit(1);",
      "",
    ].join("\n");
    writeFileSync(path.join(tmp.dir, "emit.js"), emit);
    writeFileSync(path.join(tmp.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: WEIRD_NAME, type: "node" }, checks: [{ name: "emit", kind: "custom", command: "node emit.js", timeoutSec: 60 }] }));
    const r = await runCli(["verify", "--cwd", tmp.dir], tmp.dir);
    expect(r.code).toBe(1);
    // the terminal (ADR-0016): nothing raw
    expect(findRawChars(r.stdout)).toEqual([]);
    expect(findRawChars(r.stderr)).toEqual([]);
    const dir = path.join(tmp.dir, "artifacts", "verification");
    const files = ["latest.json", "latest.md", ...readdirSync(path.join(dir, "history")).map((f) => path.join("history", f))];
    expect(files.length).toBe(3);
    for (const f of files) expect(findRawChars(readFileSync(path.join(dir, f), "utf8")), `${f} has a raw forbidden character`).toEqual([]);
    // the data is the same: the name and every character of both tails are back after JSON.parse
    const report = JSON.parse(readFileSync(path.join(dir, "latest.json"), "utf8")) as { project: { name: string }; checks: Array<{ stdoutTail: string; stderrTail: string }> };
    expect(report.project.name).toBe(WEIRD_NAME);
    const check = report.checks[0];
    expect(check).toBeDefined();
    for (const cp of FORBIDDEN) {
      expect(check?.stdoutTail.includes(chr(cp)), `stdoutTail lacks U+${cp.toString(16)}`).toBe(true);
      expect(check?.stderrTail.includes(chr(cp)), `stderrTail lacks U+${cp.toString(16)}`).toBe(true);
    }
    expect(JSON.parse(readFileSync(path.join(dir, files[2] ?? ""), "utf8"))).toEqual(report);
    // Markdown: the notation of the terminal, and the fenced heading stays in its fence
    const md = readFileSync(path.join(dir, "latest.md"), "utf8");
    expect(md).toContain("\\u{1B}[31mred\\u{1B}[0m");
    expect(outsideFence(md, "# Injected heading")).toBe(0);
  }, 60_000);

  it("a name with an LF and a heading does not add a heading to latest.md", async () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    writeFileSync(path.join(tmp.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "ok\n## INJECTED-SECTION", type: "node" }, checks: [{ name: "ok", kind: "custom", command: "node -e 0", timeoutSec: 30 }] }));
    const r = await runCli(["verify", "--cwd", tmp.dir], tmp.dir);
    expect(r.code).toBe(0);
    const md = readFileSync(path.join(tmp.dir, "artifacts", "verification", "latest.md"), "utf8");
    expect(md.split("\n").filter((l) => l.startsWith("## INJECTED-SECTION"))).toEqual([]);
  }, 60_000);
});

describe("backlog 9: aiqh init --write writes no forbidden character raw (real CLI)", () => {
  it("a package.json name with forbidden characters: the config holds none and still reads back as the same name", async () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    writeFileSync(path.join(tmp.dir, "package.json"), `${JSON.stringify({ name: WEIRD_NAME, version: "1.0.0", scripts: { lint: "eslint ." } })}\n`);
    const r = await runCli(["init", "--cwd", tmp.dir, "--write"], tmp.dir);
    expect(r.code).toBe(0);
    expect(findRawChars(r.stdout)).toEqual([]);
    expect(findRawChars(r.stderr)).toEqual([]);
    const file = path.join(tmp.dir, "aiqh.config.jsonc");
    const text = readFileSync(file, "utf8");
    expect(findRawChars(text)).toEqual([]);
    let name: string | undefined;
    try {
      name = resolveConfig(parseConfigText(text, file), file).project.name;
    } catch (err) {
      throw new Error(err instanceof ConfigError ? err.summary : (err as Error).message, { cause: err });
    }
    expect(name).toBe(WEIRD_NAME);
  }, 60_000);
});
