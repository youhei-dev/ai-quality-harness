/**
 * Found with M2-2-R1-007 (v0.5.1; the human decision on the STOP report, P2 / O1): security-scan and review-packet each
 * had their own readSecurity(), which looked for the default config (`aiqh.config.jsonc` in --cwd) with existsSync().
 * A config file that exists but cannot be reached (behind a directory at mode 000, a symbolic link loop) was "absent",
 * so the defaults were used: review-packet wrote the packet with exit 0, and security-scan dropped the config's extra
 * .env probes and passed (exit 0) where the readable config fails (exit 1). Now both commands use one reader,
 * loadSecurityConfig (src/config/load.ts): the default file is read directly, only ENOENT gives the defaults, any other
 * failure is a config error (exit 2, `config file could not be read: <path> (<code>: …)`). An explicit --config is
 * handled as before (it must exist).
 * The permission cases change mode bits, which root ignores, so they are skipped when running as root; the mode is
 * restored in `finally` before the temporary directory is removed.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { makeTempDir } from "./helpers.ts";
import { ROOT, createProgram } from "./structure/typescript.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Root bypasses mode 000, so the permission cases cannot fail as intended. */
const runsAsRoot = process.getuid?.() === 0;

/** A valid config whose `security` section adds a probe the repository's .gitignore does not cover. */
const CONFIG = JSON.stringify({ version: 1, project: { name: "t" }, checks: [{ name: "u", kind: "unit", command: "echo u" }], security: { envProbePaths: [".env", ".env.staging"] } });

interface Repo {
  dir: string;
  base: string;
  config: string;
}

/** A repository whose tracked .gitignore covers the four default probes (not .env.staging), with one commit after base. */
function repo(): Repo {
  const t = makeTempDir("aiqh-r1-config-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.local\n.env.production\n.env.development\n");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", ".gitignore", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 2;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "change");
  return { dir: t.dir, base, config: path.join(t.dir, "aiqh.config.jsonc") };
}

/** The default config as a symbolic link to a readable file inside `hidden` (a directory that is locked by the caller). */
function configBehind(r: Repo): string {
  const hidden = makeTempDir("aiqh-r1-config-hidden-");
  cleanups.push(hidden.cleanup);
  writeFileSync(path.join(hidden.dir, "real.jsonc"), CONFIG);
  symlinkSync(path.join(hidden.dir, "real.jsonc"), r.config);
  return hidden.dir;
}

/** The default config as a symbolic link loop (ELOOP; no permission needed). */
function configLoop(r: Repo): void {
  const other = path.join(r.dir, "loop.jsonc");
  symlinkSync(other, r.config);
  symlinkSync(r.config, other);
}

async function locked<T>(dir: string, body: () => Promise<T>): Promise<T> {
  chmodSync(dir, 0o000);
  try {
    return await body();
  } finally {
    chmodSync(dir, 0o755);
  }
}

interface Run {
  code: number;
  lines: string[];
}

async function packet(r: Repo, configPath?: string): Promise<Run> {
  const lines: string[] = [];
  const opts: Parameters<typeof runReviewPacket>[0] = { cwd: r.dir, range: `${r.base}..HEAD`, label: "p", toolVersion: "t", log: (l) => lines.push(l), logError: (l) => lines.push(l) };
  if (configPath !== undefined) opts.configPath = configPath;
  return { code: await runReviewPacket(opts), lines };
}

async function scan(r: Repo, configPath?: string): Promise<Run> {
  const lines: string[] = [];
  const opts: Parameters<typeof runSecurityScan>[0] = { cwd: r.dir, log: (l) => lines.push(l), logError: (l) => lines.push(l) };
  if (configPath !== undefined) opts.configPath = configPath;
  return { code: await runSecurityScan(opts), lines };
}

const text = (res: Run): string => res.lines.join("\n");
const written = (r: Repo): boolean => existsSync(path.join(r.dir, "artifacts", "ai-review"));
/** The config error line of either command, without the command's prefix. */
const configError = (res: Run): string => (res.lines.find((l) => l.includes("config file")) ?? "").replace(/^aiqh (review-packet|security-scan): /, "");

describe("the default config that exists but cannot be read is a config error (review-packet)", () => {
  it.skipIf(runsAsRoot)("a symbolic link into a directory at mode 000: exit 2, nothing written (skipped as root: root bypasses mode 000)", async () => {
    const r = repo();
    const hidden = configBehind(r);
    const res = await locked(hidden, () => packet(r));
    expect(res.code, text(res)).toBe(2);
    expect(configError(res)).toMatch(/^config file could not be read: .*aiqh\.config\.jsonc \(EACCES/);
    expect(written(r)).toBe(false);
  });

  it("a symbolic link loop (ELOOP): exit 2, nothing written", async () => {
    const r = repo();
    configLoop(r);
    const res = await packet(r);
    expect(res.code, text(res)).toBe(2);
    expect(configError(res)).toMatch(/^config file could not be read: .*aiqh\.config\.jsonc \(ELOOP/);
    expect(written(r)).toBe(false);
  });

  it("control: no default config (ENOENT): the defaults, exit 0 as before", async () => {
    const r = repo();
    const res = await packet(r);
    expect(res.code, text(res)).toBe(0);
    expect(written(r)).toBe(true);
  });

  it("control: a readable default config is used; an invalid one is exit 2 as before", async () => {
    const r = repo();
    writeFileSync(r.config, CONFIG);
    expect((await packet(r)).code).toBe(0);
    writeFileSync(r.config, "{ not json");
    const bad = await packet(r);
    expect(bad.code).toBe(2);
    expect(text(bad)).toContain("config is not valid JSONC");
  });
});

describe("the default config that exists but cannot be read is a config error (security-scan)", () => {
  it("S-a (control): the readable config adds .env.staging, which .gitignore does not cover: exit 1", async () => {
    const r = repo();
    writeFileSync(r.config, CONFIG);
    const res = await scan(r);
    expect(res.code, text(res)).toBe(1);
    expect(text(res)).toContain(".gitignore does not ignore .env.* (not ignored: .env.staging)");
  });

  it.skipIf(runsAsRoot)("S-b: the same config through a symbolic link into a directory at mode 000: exit 2, not the defaults' exit 0 (skipped as root: root bypasses mode 000)", async () => {
    const r = repo();
    const hidden = configBehind(r);
    const res = await locked(hidden, () => scan(r));
    expect(res.code, text(res)).toBe(2);
    expect(configError(res)).toMatch(/^config file could not be read: .*aiqh\.config\.jsonc \(EACCES/);
    expect(text(res)).not.toContain("SECURITY SCAN: no findings");
  });

  it("a symbolic link loop (ELOOP): exit 2", async () => {
    const r = repo();
    configLoop(r);
    const res = await scan(r);
    expect(res.code, text(res)).toBe(2);
    expect(configError(res)).toMatch(/^config file could not be read: .*aiqh\.config\.jsonc \(ELOOP/);
  });

  it("control: no default config (ENOENT): the defaults, exit 0 as before", async () => {
    const r = repo();
    const res = await scan(r);
    expect(res.code, text(res)).toBe(0);
  });
});

describe("an explicit --config is handled as before", () => {
  it("a --config that does not exist: exit 2, config file not found (both commands)", async () => {
    const r = repo();
    const missing = path.join(r.dir, "nowhere", "cfg.jsonc");
    for (const res of [await packet(r, missing), await scan(r, missing)]) {
      expect(res.code, text(res)).toBe(2);
      expect(configError(res)).toBe(`config file not found: ${missing}`);
    }
    expect(written(r)).toBe(false);
  });

  it("a readable --config elsewhere is used (security-scan: its probe fails; review-packet: written)", async () => {
    const r = repo();
    const d = makeTempDir("aiqh-r1-config-explicit-");
    cleanups.push(d.cleanup);
    const cfg = path.join(d.dir, "cfg.jsonc");
    writeFileSync(cfg, CONFIG);
    expect((await scan(r, cfg)).code).toBe(1);
    expect((await packet(r, cfg)).code).toBe(0);
  });

  it("a --config that is a symbolic link loop: exit 2, could not be read (both commands)", async () => {
    const r = repo();
    const d = makeTempDir("aiqh-r1-config-explicit-");
    cleanups.push(d.cleanup);
    const cfg = path.join(d.dir, "cfg.jsonc");
    mkdirSync(d.dir, { recursive: true });
    symlinkSync(path.join(d.dir, "other.jsonc"), cfg);
    symlinkSync(cfg, path.join(d.dir, "other.jsonc"));
    for (const res of [await packet(r, cfg), await scan(r, cfg)]) {
      expect(res.code, text(res)).toBe(2);
      expect(configError(res)).toMatch(/^config file could not be read: .*cfg\.jsonc \(ELOOP/);
    }
  });
});

describe("one reader for both commands", () => {
  it("the same default config gives the same error text in review-packet and security-scan", async () => {
    const r = repo();
    configLoop(r);
    const a = configError(await packet(r));
    const b = configError(await scan(r));
    expect(a).toMatch(/^config file could not be read: /);
    expect(a).toBe(b);
  });

  it("both commands call loadSecurityConfig and read the config no other way (type checker)", () => {
    const p = createProgram();
    const load = path.join(ROOT, "src", "config", "load.ts");
    const scanModule = path.join(ROOT, "src", "security", "scan.ts");
    /** Where a referenced symbol is declared: `<file>#<name>` for the ones this test looks at. */
    const declared = (node: ts.Identifier): string | null => {
      let sym = p.checker.getSymbolAtLocation(node);
      if (sym !== undefined && sym.flags & ts.SymbolFlags.Alias) sym = p.checker.getAliasedSymbol(sym);
      const decl = sym?.declarations?.[0];
      if (decl === undefined) return null;
      const file = path.resolve(decl.getSourceFile().fileName);
      return file === load || file === scanModule ? `${path.relative(ROOT, file)}#${sym?.name ?? ""}` : null;
    };
    for (const rel of ["src/commands/review-packet.ts", "src/commands/security-scan.ts"]) {
      const sf = p.program.getSourceFile(path.join(ROOT, rel));
      expect(sf, rel).toBeDefined();
      if (sf === undefined) continue;
      const calls: string[] = [];
      const refs = new Set<string>();
      const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
          const d = declared(n.expression);
          if (d !== null) calls.push(d);
        }
        if (ts.isIdentifier(n) && !ts.isImportSpecifier(n.parent)) {
          const d = declared(n);
          if (d !== null) refs.add(d);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
      expect(calls.filter((c) => c === "src/config/load.ts#loadSecurityConfig"), rel).toHaveLength(1);
      const own = ["src/config/load.ts#loadConfig", "src/config/load.ts#DEFAULT_CONFIG_FILENAME", "src/security/scan.ts#DEFAULT_SECURITY"].filter((s) => refs.has(s));
      expect(own, rel).toEqual([]);
    }
  });
});
