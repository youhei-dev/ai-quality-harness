/**
 * M2-0-R1-001: the window settings must satisfy 0 < lineOverlapBytes <= maxCarryBytes <= maxLineBytes
 * (validated after defaults are applied, ConfigError / exit 2), and LineAssembler.push() must make
 * progress on every iteration or fail with a ScanError instead of looping forever (second line of
 * defence). Anything that could hang runs in a child process with a timeout.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, parseConfigText, resolveConfig } from "../src/config/load.ts";
import { LineAssembler, ScanError } from "../src/security/scan.ts";
import { makeTempDir } from "./helpers.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "src", "cli.ts");
const SCAN_TS = path.join(ROOT, "src", "security", "scan.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const BASE = '"version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true" } ]';
const resolve = (security: string) => resolveConfig(parseConfigText(`{ ${BASE}, "security": { ${security} } }`), "/tmp/aiqh.config.jsonc");

/** Run a node script with a hard timeout; returns the exit status, or "timeout". */
function runWithTimeout(args: string[], cwd: string, ms = 15_000): { status: number | "timeout"; out: string } {
  try {
    // SIGKILL: the CLI registers SIGINT / SIGTERM handlers, and a synchronous infinite loop never
    // runs them, so a hung child would ignore the default SIGTERM of execFileSync.
    const out = execFileSync(process.execPath, args, { cwd, encoding: "utf8", timeout: ms, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, out };
  } catch (err) {
    const e = err as { status?: number | null; signal?: string | null; stdout?: string; stderr?: string; code?: string };
    if (e.signal === "SIGKILL" || e.signal === "SIGTERM" || e.code === "ETIMEDOUT") return { status: "timeout", out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    return { status: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("M2-0-R1-001: cross-field validation of the window settings", () => {
  it("rejects overlap > line, carry > line, overlap > carry (ConfigError)", () => {
    expect(() => resolve('"maxLineBytes": 10, "lineOverlapBytes": 20, "maxCarryBytes": 64')).toThrow(ConfigError);
    expect(() => resolve('"maxLineBytes": 1024, "lineOverlapBytes": 128, "maxCarryBytes": 2048')).toThrow(ConfigError);
    expect(() => resolve('"maxLineBytes": 4096, "lineOverlapBytes": 512, "maxCarryBytes": 256')).toThrow(ConfigError);
  });
  it("rejects a single field that breaks the relation with the defaults", () => {
    expect(() => resolve('"lineOverlapBytes": 100000')).toThrow(ConfigError); // > default carry 64 KiB
    expect(() => resolve('"maxCarryBytes": 300000')).toThrow(ConfigError); // > default line 256 KiB
    expect(() => resolve('"maxLineBytes": 1000')).toThrow(ConfigError); // < default carry 64 KiB
  });
  it("accepts the boundaries overlap == carry and carry == line", () => {
    expect(resolve('"maxLineBytes": 4096, "lineOverlapBytes": 2048, "maxCarryBytes": 2048').security.lineOverlapBytes).toBe(2048);
    expect(resolve('"maxLineBytes": 4096, "lineOverlapBytes": 256, "maxCarryBytes": 4096').security.maxCarryBytes).toBe(4096); // overlap 256 = MIN_LINE_OVERLAP_BYTES (M2-0-R2-001)
  });
  it("the reviewer's reproduction (10 / 20 / 64 with an 11-char line) ends with exit 2 through the CLI", () => {
    const t = makeTempDir("aiqh-r1-001-cli-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
    writeFileSync(path.join(t.dir, "long.txt"), "x".repeat(11));
    writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), `{ ${BASE}, "security": { "maxLineBytes": 10, "lineOverlapBytes": 20, "maxCarryBytes": 64 } }`);
    execFileSync("git", ["add", "--", ".gitignore", "long.txt", "aiqh.config.jsonc"], { cwd: t.dir });
    const r = runWithTimeout([CLI, "security-scan"], t.dir);
    expect(r.status, r.out.slice(-300)).toBe(2);
  });
});

describe("M2-0-R1-001: LineAssembler constructor check (second layer)", () => {
  it("rejects the same relations as the config resolver, before any window is processed", () => {
    expect(() => new LineAssembler(() => {}, { maxLineBytes: 10, lineOverlap: 20, maxCarryBytes: 64 })).toThrow(ScanError);
    expect(() => new LineAssembler(() => {}, { maxLineBytes: 1024, lineOverlap: 128, maxCarryBytes: 2048 })).toThrow(ScanError);
    expect(() => new LineAssembler(() => {}, { maxLineBytes: 4096, lineOverlap: 512, maxCarryBytes: 256 })).toThrow(ScanError);
    expect(() => new LineAssembler(() => {}, { maxLineBytes: 4096, lineOverlap: 2048, maxCarryBytes: 2048 })).not.toThrow();
  });
});

describe("M2-0-R1-001: LineAssembler progress invariant (third layer; constructor check skipped on purpose)", () => {
  function probe(opts: string, pushes: string): { status: number | "timeout"; out: string } {
    const t = makeTempDir("aiqh-r1-001-probe-");
    cleanups.push(t.cleanup);
    mkdirSync(t.dir, { recursive: true });
    const script = path.join(t.dir, "probe.mjs");
    writeFileSync(
      script,
      `import { LineAssembler, ScanError } from ${JSON.stringify(SCAN_TS)};\n` +
        `try { const a = new LineAssembler(() => {}, ${opts}); ${pushes} a.end(); console.log("RETURNED"); }\n` +
        `catch (e) { console.log(e instanceof ScanError ? "SCANERROR " + e.message : "OTHER " + e); }\n`,
    );
    return runWithTimeout([script], t.dir, 10_000);
  }
  it("overlap larger than the window: push() throws ScanError instead of looping", () => {
    const r = probe("{ maxLineBytes: 10, lineOverlap: 20, maxCarryBytes: 64, skipOptionValidation: true }", 'a.push("x".repeat(11));');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^SCANERROR .*no progress/m);
  });
  it("carry larger than the window with a candidate at the start: push() throws ScanError instead of looping", () => {
    const r = probe("{ maxLineBytes: 1024, lineOverlap: 256, maxCarryBytes: 2048, skipOptionValidation: true, carryFrom: () => ({ start: 0, category: \"aws\" }) }", 'a.push("y".repeat(1500));');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^SCANERROR .*no progress/m);
  });
  it("valid settings still return", () => {
    const r = probe("{ maxLineBytes: 4096, lineOverlap: 256, maxCarryBytes: 2048 }", 'a.push("z".repeat(10000));'); // overlap 256 = minimum (M2-0-R2-001)
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^RETURNED/m);
  });
});
