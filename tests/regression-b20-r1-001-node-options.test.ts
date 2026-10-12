/**
 * B20-R1-001 (High, independent review backlog-20 R1): under `--unhandled-rejections=warn` Node prints an unhandled rejection's
 * reason and stack itself, beside the CLI's masked line; measured on Node v24.13.1 the same holds for `--abort-on-uncaught-exception`
 * on an uncaught exception (V8 prints it and aborts before the handler, and the running check is left). v0.5.44 refuses to start under
 * those options (ADR-0024): one line through the output boundary, exit 2, no check started, no report. The rule is fail closed:
 * `warn` anywhere (also when a later setting overrides it), the abort name anywhere (also `--no-…`), and NODE_OPTIONS that names the
 * option in a form that cannot be read one way; a dash and an underscore are the same, as Node reads them.
 *
 * The real CLI is started with the options and a module preloaded with --import that raises (rejects or throws) once the check has
 * written its pid, as in the backlog 20 tests; nothing in src/ exists for the test. Before the fix the refused forms run the check and
 * print the fake secret raw, abort on a signal, or leave the check (the record of the failure before the fix). The check leaves by
 * itself once its pid file is removed with the test's directory, so a check that an old CLI leaves behind does not live on. The controls
 * (safe modes and options of the measured table B) pass before and after the fix.
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_KILL_GRACE_MS } from "../src/runner/execute.ts";
import { assertSignalablePid, exitWhenRemoved, fake, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const CLI_EXIT_BOUND_MS = DEFAULT_KILL_GRACE_MS + 3_000;
const SECRET = fake("AKIA", "ABCDEFGHIJKLMNOP");
const MASKED = "aiqh: unexpected error: boom [REDACTED:aws]";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

type Trigger = "reject" | "throw";

interface Run {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  pidFile: string;
  reportDir: string;
}

/** The preloaded module raises once the check has written its pid; its timer does not keep a refused CLI alive. */
function preloadSource(trigger: Trigger, pidFile: string): string {
  return `import { readFileSync } from "node:fs";
const ready = () => { try { return /^[0-9]+$/.test(readFileSync(${JSON.stringify(pidFile)}, "utf8")); } catch { return false; } };
const timer = setInterval(() => {
  if (!ready()) return;
  clearInterval(timer);
  setTimeout(() => {
    if (${JSON.stringify(trigger)} === "reject") { void Promise.reject(new Error(${JSON.stringify(`boom ${SECRET}`)})); return; }
    throw new Error(${JSON.stringify(`boom ${SECRET}`)});
  }, 100);
}, 25);
timer.unref();
`;
}

async function runCli(opts: { nodeArgs?: string[]; nodeOptions?: string; trigger: Trigger; waitForCheck: boolean }): Promise<Run & { checkPid: number | null }> {
  const t = makeTempDir("aiqh-b20o-");
  cleanups.push(t.cleanup);
  const pidFile = path.join(t.dir, "check.pid");
  const preload = path.join(t.dir, "preload.mjs");
  writeFileSync(preload, preloadSource(opts.trigger, pidFile));
  const command = `${nodeEval(`const fs=require("fs"); fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ${exitWhenRemoved(pidFile)} setTimeout(() => {}, 10000)`)}; true`;
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "b20o" }, checks: [{ name: "one", kind: "custom", command, timeoutSec: 30 }] }));
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  if (opts.nodeOptions !== undefined) env.NODE_OPTIONS = opts.nodeOptions;
  const cli = spawn(process.execPath, [...(opts.nodeArgs ?? []), "--import", pathToFileURL(preload).href, CLI, "verify"], { cwd: t.dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  cli.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  cli.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => cli.on("exit", (code, signal) => resolve({ code, signal })));
  cleanups.push(stopper(exited, () => cli.kill("SIGTERM"), CLI_EXIT_BOUND_MS + SETTLE_MARGIN_MS, "the CLI", () => cli.kill("SIGKILL")));
  const checkPid = opts.waitForCheck ? await waitReady(pidFile, 8000, "the check did not write its pid within 8000 ms (overloaded machine?)") : null;
  const { code, signal } = await exited;
  return { code, signal, stdout, stderr, pidFile, reportDir: path.join(t.dir, "artifacts", "verification"), checkPid };
}

function alive(pid: number): boolean {
  assertSignalablePid(pid);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function goneWithin(pid: number | null, ms: number): Promise<boolean> {
  if (pid === null) throw new Error("precondition: the check's pid was not recorded");
  const deadline = Date.now() + ms;
  while (alive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  return !alive(pid);
}

/** The forms that are refused: [what, node arguments, NODE_OPTIONS, the trigger the old CLI would meet, the reason the line names]. */
const REFUSED: Array<{ what: string; nodeArgs?: string[]; nodeOptions?: string; trigger: Trigger; reason: RegExp }> = [
  { what: "argv --unhandled-rejections=warn", nodeArgs: ["--unhandled-rejections=warn"], trigger: "reject", reason: /the node command line sets --unhandled-rejections=warn/ },
  { what: "argv --unhandled-rejections warn", nodeArgs: ["--unhandled-rejections", "warn"], trigger: "reject", reason: /the node command line sets --unhandled-rejections=warn/ },
  { what: "argv --unhandled_rejections=warn", nodeArgs: ["--unhandled_rejections=warn"], trigger: "reject", reason: /the node command line sets --unhandled-rejections=warn/ },
  { what: "NODE_OPTIONS --unhandled-rejections=warn", nodeOptions: "--unhandled-rejections=warn", trigger: "reject", reason: /NODE_OPTIONS sets --unhandled-rejections=warn/ },
  { what: "NODE_OPTIONS --unhandled_rejections warn", nodeOptions: "--unhandled_rejections warn", trigger: "reject", reason: /NODE_OPTIONS sets --unhandled-rejections=warn/ },
  { what: "NODE_OPTIONS warn overridden by a later throw", nodeOptions: "--unhandled-rejections=warn --unhandled-rejections=throw", trigger: "reject", reason: /NODE_OPTIONS sets --unhandled-rejections=warn/ },
  { what: "NODE_OPTIONS warn with the name split by quotes", nodeOptions: '--unhandled-rej"ections=warn"', trigger: "reject", reason: /NODE_OPTIONS names --unhandled-rejections in a form that cannot be read/ },
  { what: "NODE_OPTIONS a quoted safe mode (cannot be read one way)", nodeOptions: '"--unhandled-rejections=throw"', trigger: "reject", reason: /NODE_OPTIONS names --unhandled-rejections in a form that cannot be read/ },
  { what: "argv --abort-on-uncaught-exception", nodeArgs: ["--abort-on-uncaught-exception"], trigger: "throw", reason: /the node command line names --abort-on-uncaught-exception/ },
  { what: "NODE_OPTIONS --abort-on-uncaught-exception", nodeOptions: "--abort-on-uncaught-exception", trigger: "throw", reason: /NODE_OPTIONS names --abort-on-uncaught-exception/ },
  { what: "NODE_OPTIONS --abort_on_uncaught_exception", nodeOptions: "--abort_on_uncaught_exception", trigger: "throw", reason: /NODE_OPTIONS names --abort-on-uncaught-exception/ },
  { what: "argv --no-abort-on-uncaught-exception", nodeArgs: ["--no-abort-on-uncaught-exception"], trigger: "throw", reason: /the node command line names --abort-on-uncaught-exception/ },
  { what: "argv abort overridden by a later --no-", nodeArgs: ["--abort-on-uncaught-exception", "--no-abort-on-uncaught-exception"], trigger: "throw", reason: /the node command line names --abort-on-uncaught-exception/ },
  { what: "NODE_OPTIONS abort with strict, a rejection", nodeOptions: "--abort-on-uncaught-exception --unhandled-rejections=strict", trigger: "reject", reason: /NODE_OPTIONS names --abort-on-uncaught-exception/ },
];

describe("B20-R1-001: under the refused Node options the CLI does not start: one line, exit 2, no check, no report, no raw value", () => {
  for (const c of REFUSED) {
    it(c.what, async () => {
      const r = await runCli({ nodeArgs: c.nodeArgs, nodeOptions: c.nodeOptions, trigger: c.trigger, waitForCheck: false });
      expect(r.stdout + r.stderr, "the fake secret is not printed raw").not.toContain(SECRET);
      expect({ code: r.code, signal: r.signal }).toEqual({ code: 2, signal: null });
      expect(r.stderr).toMatch(c.reason);
      expect(r.stderr.split("\n").filter((l) => l.startsWith("aiqh: refusing to start: ")).length).toBe(1);
      expect(r.stderr).toContain("VERIFY ERROR (Node option error)");
      expect(existsSync(r.pidFile), "the check was not started").toBe(false);
      expect(existsSync(r.reportDir), "no report was written").toBe(false);
    }, 20_000);
  }
});

/** Controls: safe modes and options of the measured table B are not refused; the backlog 20 path works under them. */
const ALLOWED: Array<{ what: string; nodeArgs?: string[]; nodeOptions?: string; trigger: Trigger }> = [
  { what: "argv --unhandled-rejections=warn-with-error-code, a rejection", nodeArgs: ["--unhandled-rejections=warn-with-error-code"], trigger: "reject" },
  { what: "NODE_OPTIONS --unhandled-rejections=none, a rejection", nodeOptions: "--unhandled-rejections=none", trigger: "reject" },
  { what: "NODE_OPTIONS --unhandled-rejections=strict, an exception", nodeOptions: "--unhandled-rejections=strict", trigger: "throw" },
  { what: "argv --unhandled-rejections throw, a rejection", nodeArgs: ["--unhandled-rejections", "throw"], trigger: "reject" },
  { what: "NODE_OPTIONS --trace-uncaught, an exception", nodeOptions: "--trace-uncaught", trigger: "throw" },
  { what: "NODE_OPTIONS --enable-source-maps, a rejection", nodeOptions: "--enable-source-maps", trigger: "reject" },
];

describe("B20-R1-001 controls: not refused, and an unhandled rejection or exception still ends with the masked line, exit 2, the check gone", () => {
  for (const c of ALLOWED) {
    it(c.what, async () => {
      const r = await runCli({ nodeArgs: c.nodeArgs, nodeOptions: c.nodeOptions, trigger: c.trigger, waitForCheck: true });
      expect(r.stdout + r.stderr).not.toContain(SECRET);
      expect(r.stderr).not.toContain("refusing to start");
      expect({ code: r.code, signal: r.signal }).toEqual({ code: 2, signal: null });
      expect(r.stderr.split("\n").filter((l) => l === MASKED)).toEqual([MASKED]);
      expect(await goneWithin(r.checkPid, 2000), "the check's process is gone after the CLI exited").toBe(true);
    }, 20_000);
  }
});
