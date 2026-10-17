/**
 * v0.10.0 (ADR-0033): verify records the SHA-256 of the config file's bytes as `configSha256` at the top level of the report, right
 * after `configPath` (64 lower-case hexadecimal digits; a record, not a pinned value). The config is read once, as bytes, and the same
 * Buffer gives the text and the hash: the text is the string `readFileSync(path, "utf8")` gave before (BOM, invalid UTF-8 and CRLF
 * included), so the config resolves the same and the errors keep their words. The masker leaves the value alone, schemaVersion stays 1,
 * latest.md and the terminal do not show it (Q9), a report built without a hash has no such key (never null), and a config that
 * cannot be read still ends verify with exit 2 and no report. node:fs is wrapped in this file only to count the reads of the config.
 */
import { createHash } from "node:crypto";
import type * as Fs from "node:fs";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  const counted = (...args: unknown[]): unknown => {
    reads.paths.push(String(args[0]));
    return (real.readFileSync as (...a: unknown[]) => unknown)(...args);
  };
  const readFileSync = counted as unknown as typeof real.readFileSync;
  return { ...real, readFileSync, default: { ...real, readFileSync } };
});

import { runVerify } from "../src/commands/verify.ts";
import * as load from "../src/config/load.ts";
import { ConfigError, loadConfig, parseConfigText, resolveConfig } from "../src/config/load.ts";
import { buildReport } from "../src/report/build-report.ts";
import { maskSecrets } from "../src/security/mask.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { ResolvedConfig, VerificationReport } from "../src/types.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const HEX64 = /^[0-9a-f]{64}$/;
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const CONFIG = (name: string): string =>
  `// a comment\n{ "version": 1, "project": { "name": ${JSON.stringify(name)} }, "checks": [ { "name": "ok", "kind": "custom", "command": "node -e 0" } ] }\n`;

function tempDir(): string {
  const t = makeTempDir("aiqh-config-sha256-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** A project whose config file holds exactly `bytes`. */
function project(bytes: Buffer | string): { dir: string; file: string } {
  const dir = tempDir();
  const file = path.join(dir, "aiqh.config.jsonc");
  writeFileSync(file, bytes);
  return { dir, file };
}

async function verify(dir: string): Promise<{ code: number; lines: string[]; report: VerificationReport | null; json: string; md: string; history: string[] }> {
  const lines: string[] = [];
  const code = await runVerify({ cwd: dir, toolVersion: "0.0.0-test", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  const out = path.join(dir, "artifacts", "verification");
  const latest = path.join(out, "latest.json");
  if (!existsSync(latest)) return { code, lines, report: null, json: "", md: "", history: [] };
  const json = readFileSync(latest, "utf8");
  const md = readFileSync(path.join(out, "latest.md"), "utf8");
  const history = readdirSync(path.join(out, "history")).map((n) => readFileSync(path.join(out, "history", n), "utf8"));
  return { code, lines, report: JSON.parse(json) as VerificationReport, json, md, history };
}

/** readConfigFile of src/config/load.ts (v0.10.0): looked up at run time, so that a missing export fails these tests one by one. */
function readConfigFile(file: string): { text: string; sha256: string } {
  const f = (load as { readConfigFile?: (p: string) => { text: string; sha256: string } }).readConfigFile;
  if (f === undefined) throw new Error("readConfigFile does not exist");
  return f(file);
}

/** What happens to a config file: the resolved config, or the error's class and message. */
function outcome(run: () => ResolvedConfig): { config: ResolvedConfig } | { error: string; message: string } {
  try {
    return { config: run() };
  } catch (err) {
    return { error: (err as Error).name, message: (err as Error).message };
  }
}

describe("ADR-0033: configSha256 in the report", () => {
  it("verify writes the SHA-256 of the config file's bytes, right after configPath, in latest.json and in the history file", async () => {
    const { dir, file } = project(CONFIG("demo"));
    const r = await verify(dir);
    expect(r.code).toBe(0);
    const report = r.report as VerificationReport;
    const expected = sha256(readFileSync(file));
    expect(report.configSha256).toBe(expected);
    expect(report.configSha256).toMatch(HEX64);
    const keys = Object.keys(report);
    expect(keys.indexOf("configSha256")).toBe(keys.indexOf("configPath") + 1);
    expect(keys).toHaveLength(15);
    expect(report.schemaVersion).toBe(1);
    expect(r.history).toHaveLength(1);
    expect((JSON.parse(r.history[0] ?? "{}") as VerificationReport).configSha256).toBe(expected);
  });

  it("the same bytes give the same value; one changed byte changes it", async () => {
    const a = project(CONFIG("demo"));
    const b = project(CONFIG("demo"));
    const c = project(CONFIG("demp"));
    const [ra, rb, rc] = [await verify(a.dir), await verify(b.dir), await verify(c.dir)];
    expect(ra.report?.configSha256).toBe(rb.report?.configSha256);
    expect(rc.report?.configSha256).not.toBe(ra.report?.configSha256);
    expect(rc.report?.configSha256).toBe(sha256(readFileSync(c.file)));
  });

  it("the masker leaves the value unchanged: the value, a JSON line with it, and latest.json as written", async () => {
    for (let i = 0; i < 2000; i++) {
      const v = sha256(Buffer.from(String(i)));
      expect(maskSecrets(v)).toBe(v);
      expect(maskSecrets(`  "configSha256": "${v}",`)).toBe(`  "configSha256": "${v}",`);
    }
    const { dir, file } = project(CONFIG("demo"));
    const r = await verify(dir);
    expect(r.json).toContain(`"configSha256": "${sha256(readFileSync(file))}"`);
  });

  it("latest.md and the terminal do not show it (Q9: JSON only in v0.10.0)", async () => {
    const { dir, file } = project(CONFIG("demo"));
    const r = await verify(dir);
    const value = sha256(readFileSync(file));
    expect(r.md).not.toContain(value);
    expect(r.md).not.toContain(value.slice(0, 12));
    expect(r.md).not.toContain("configSha256");
    expect(r.lines.join("\n")).not.toContain(value.slice(0, 12));
    expect(r.lines.join("\n")).not.toContain("configSha256");
  });

  it("a report built from a config without a hash has no configSha256 key (absent, never null)", () => {
    const config: ResolvedConfig = { projectRoot: "/p", configPath: "/p/aiqh.config.jsonc", project: { name: "p" }, outputDir: "/p/a", security: DEFAULT_SECURITY, checks: [] };
    const r = buildReport({ config, results: [checkResult({ name: "unit", kind: "unit" })], git: null, startedAt: new Date(0), finishedAt: new Date(1000), toolVersion: "t" });
    expect(Object.keys(r)).not.toContain("configSha256");
    expect(JSON.stringify(r)).not.toContain("configSha256");
  });
});

describe("ADR-0033: the config is read once, as bytes, and the text is the one readFileSync(path, \"utf8\") gave", () => {
  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  const CASES: Array<[string, Buffer]> = [
    ["plain", Buffer.from(CONFIG("demo"))],
    ["CRLF line ends", Buffer.from(CONFIG("demo").replace(/\n/g, "\r\n"))],
    ["a BOM before the text", Buffer.concat([BOM, Buffer.from(CONFIG("demo"))])],
    ["invalid UTF-8 inside the project name", Buffer.concat([Buffer.from(CONFIG("de").slice(0, CONFIG("de").indexOf('"de"') + 3)), Buffer.from([0xc3, 0x28, 0xff]), Buffer.from(CONFIG("de").slice(CONFIG("de").indexOf('"de"') + 3))])],
  ];

  it.each(CASES)("%s: the text equals readFileSync(path, \"utf8\") and the hash is the SHA-256 of the same bytes", (_label, bytes) => {
    const { file } = project(bytes);
    const read = readConfigFile(file);
    expect(read.text).toBe(readFileSync(file, "utf8"));
    expect(read.sha256).toBe(sha256(bytes));
  });

  it.each(CASES)("%s: loadConfig resolves the config as before (or fails with the same words), and records the hash", (_label, bytes) => {
    const { file } = project(bytes);
    const before = outcome(() => resolveConfig(parseConfigText(readFileSync(file, "utf8"), file), file));
    const now = outcome(() => loadConfig(file));
    if ("config" in before) {
      expect("config" in now).toBe(true);
      if (!("config" in now)) return;
      const { configSha256, ...rest } = now.config;
      expect(rest).toEqual(before.config);
      expect(configSha256).toBe(sha256(bytes));
    } else {
      expect(now).toEqual(before);
    }
  });

  it("loadConfig reads the config file exactly once", () => {
    const { file } = project(CONFIG("demo"));
    reads.paths = [];
    const config = loadConfig(file);
    expect(reads.paths.filter((p) => path.resolve(p) === path.resolve(file))).toHaveLength(1);
    expect(config.configSha256).toBe(sha256(Buffer.from(CONFIG("demo"))));
  });

  it("the errors keep their words: a missing file, a directory, an unreadable file", () => {
    const dir = tempDir();
    const missing = path.join(dir, "missing.jsonc");
    expect(() => loadConfig(missing)).toThrow(ConfigError);
    expect(() => loadConfig(missing)).toThrow(`config file not found: ${missing}`);

    const asDir = path.join(dir, "dir.jsonc");
    mkdirSync(asDir);
    const dirMessage = outcome(() => {
      readFileSync(asDir, "utf8");
      throw new Error("a directory was read");
    });
    expect("message" in dirMessage).toBe(true);
    if ("message" in dirMessage) expect(() => loadConfig(asDir)).toThrow(`config file could not be read: ${asDir} (${dirMessage.message})`);

    if (process.getuid?.() === 0) return; // root reads a file without permissions
    const locked = path.join(dir, "locked.jsonc");
    writeFileSync(locked, CONFIG("demo"));
    chmodSync(locked, 0o000);
    cleanups.push(() => chmodSync(locked, 0o600));
    const lockedMessage = outcome(() => {
      readFileSync(locked, "utf8");
      throw new Error("a file without permissions was read");
    });
    expect("message" in lockedMessage).toBe(true);
    if ("message" in lockedMessage) {
      expect(() => loadConfig(locked)).toThrow(ConfigError);
      expect(() => loadConfig(locked)).toThrow(`config file could not be read: ${locked} (${lockedMessage.message})`);
    }
  });

  it.each([
    ["missing", (): void => undefined],
    ["a directory", (dir: string): void => mkdirSync(path.join(dir, "aiqh.config.jsonc"))],
    ["not JSONC", (dir: string): void => writeFileSync(path.join(dir, "aiqh.config.jsonc"), "{ nope")],
    ["invalid", (dir: string): void => writeFileSync(path.join(dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks: [] }))],
  ])("verify still ends with exit 2 and writes no report when the config is %s", async (_label, make) => {
    const dir = tempDir();
    make(dir);
    const r = await verify(dir);
    expect(r.code).toBe(2);
    expect(r.report).toBeNull();
    expect(existsSync(path.join(dir, "artifacts"))).toBe(false);
    expect(r.lines.at(-1)).toBe("VERIFY ERROR (configuration error)");
  });
});
