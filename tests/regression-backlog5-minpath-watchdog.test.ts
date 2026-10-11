/**
 * Backlog 5 (M2-2-R1-006) and N3 (backlog-rest SP1), fixed in v0.5.38: `npm run test:minpath` stopped alone (a SIGTERM to the script's
 * pid) sent SIGKILL to vitest only, and vitest's workers and their children lived on (measured: up to about 30 s); a SIGKILL to the
 * script left its temporary PATH directory `aiqh-minpath-*` behind (its `finally` does not run). Now vitest runs under a watchdog
 * (scripts/minpath-watchdog.ts) that leads a process group of its own: when the pipe from the script closes, it removes that directory
 * and sends SIGKILL to its group.
 *
 * Real vitest is never stopped here: scripts/ is copied under a temp root whose node_modules/vitest/vitest.mjs is a fake. The fake
 * records its pid, starts a "worker" in its group (and, in one mode, an "outsider" in a group of its own) and waits; every one of them
 * leaves when the marker file disappears (the temp directory is removed in afterEach), so a process the product failed to stop does not
 * outlive the test. The script's TMPDIR is a directory of the test, so the script's `aiqh-minpath-*` is created there. A process is
 * "gone" when signal 0 to its recorded pid answers ESRCH (a reused pid can only make a check fail, not pass: backlog 19 c).
 * Signals go only to the script started here (through its handle, or to its own group while it is still running).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSignalablePid, makeTempDir, runCleanups, waitReady } from "./helpers.ts";

const REPO = path.resolve(import.meta.dirname, "..");
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Mode = "hang" | "outsider" | "exit-0" | "exit-3" | "self-term";

/** The fake vitest (ESM). Its state directory is three levels up from node_modules/vitest: <temp>/state. */
const FAKE_VITEST = [
  'import { spawn } from "node:child_process";',
  'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
  'import path from "node:path";',
  'const state = path.resolve(import.meta.dirname, "..", "..", "..", "state");',
  'const marker = path.join(state, "marker");',
  'const mode = readFileSync(path.join(state, "mode"), "utf8");',
  "const stay = (name) => `const fs = require(\"fs\"); fs.writeFileSync(${JSON.stringify(path.join(state, name + \".pid\"))}, String(process.pid)); setInterval(() => { if (!fs.existsSync(${JSON.stringify(marker)})) process.exit(0); }, 100);`;",
  'if (mode === "exit-0") process.exit(0);',
  'else if (mode === "exit-3") process.exit(3);',
  'else if (mode === "self-term") process.kill(process.pid, "SIGTERM");',
  "else {",
  '  spawn(process.execPath, ["-e", stay("worker")], { stdio: "ignore" });',
  '  if (mode === "outsider") spawn(process.execPath, ["-e", stay("outsider")], { stdio: "ignore", detached: true }).unref();',
  '  writeFileSync(path.join(state, "vitest.pid"), String(process.pid));',
  "  setInterval(() => { if (!existsSync(marker)) process.exit(0); }, 100);",
  "}",
].join("\n");

interface Fake {
  base: string;
  root: string;
  state: string;
  /** The script's TMPDIR. */
  tmp: string;
}

/** scripts/ copied under a temp root, the fake vitest where the script looks for vitest, and its state directory. */
function fakeRoot(mode: Mode): Fake {
  const t = makeTempDir("aiqh-b5-");
  cleanups.push(t.cleanup);
  const root = path.join(t.dir, "root");
  cpSync(path.join(REPO, "scripts"), path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), '{ "type": "module" }\n');
  mkdirSync(path.join(root, "node_modules", "vitest"), { recursive: true });
  writeFileSync(path.join(root, "node_modules", "vitest", "vitest.mjs"), FAKE_VITEST);
  const state = path.join(t.dir, "state");
  mkdirSync(state);
  writeFileSync(path.join(state, "mode"), mode);
  writeFileSync(path.join(state, "marker"), "");
  const tmp = path.join(t.dir, "tmp");
  mkdirSync(tmp);
  return { base: t.dir, root, state, tmp };
}

interface Started {
  child: ChildProcess;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  output: () => string;
}

/** Start `args` under node with a minimal environment; it is SIGKILLed through its handle in afterEach if it is still running. */
function start(args: string[], cwd: string, env: NodeJS.ProcessEnv, detached: boolean): Started {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached });
  let out = "";
  child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
  // `exit`, not `close`: a process the product failed to stop may hold the pipes.
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  cleanups.push(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });
  return { child, exited, output: () => out };
}

/** Run the copied scripts/test-minimal-path.ts in a group of its own, with PATH (git must be on it) and the test's TMPDIR only. */
function startScript(f: Fake): Started {
  return start([path.join(f.root, "scripts", "test-minimal-path.ts")], f.root, { PATH: process.env.PATH ?? "", TMPDIR: f.tmp }, true);
}

const pidOf = (f: Fake, name: string): Promise<number> => waitReady(path.join(f.state, `${name}.pid`), 8000, `the fake's ${name} was not ready within 8000 ms (overloaded machine?)`);

function gone(pid: number): boolean {
  assertSignalablePid(pid);
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/** The recorded pids that are still present after waiting at most `ms` for all of them to be gone. */
async function leftAfter(pids: number[], ms: number): Promise<number[]> {
  const deadline = performance.now() + ms;
  for (;;) {
    const left = pids.filter((pid) => !gone(pid));
    if (left.length === 0 || performance.now() >= deadline) return left;
    await sleep(25);
  }
}

const minpathDirs = (f: Fake): string[] => readdirSync(f.tmp).filter((n) => n.startsWith("aiqh-minpath-"));

/** Wait at most `ms` until the script's TMPDIR holds no aiqh-minpath-* directory; returns what is left. */
async function minpathLeftAfter(f: Fake, ms: number): Promise<string[]> {
  const deadline = performance.now() + ms;
  while (minpathDirs(f).length > 0 && performance.now() < deadline) await sleep(25);
  return minpathDirs(f);
}

describe("backlog 5 / N3: stopping test:minpath stops vitest and everything left in its group", () => {
  it("a SIGTERM to the script alone: exit 143, vitest and its worker are gone (before: the worker lived on)", async () => {
    const f = fakeRoot("hang");
    const s = startScript(f);
    const pids = [await pidOf(f, "vitest"), await pidOf(f, "worker")];
    s.child.kill("SIGTERM");
    const { code, signal } = await s.exited;
    expect({ code, signal }, s.output()).toEqual({ code: 143, signal: null });
    expect(await leftAfter(pids, 3000), "vitest and its worker are gone").toEqual([]);
    expect(await minpathLeftAfter(f, 3000)).toEqual([]);
  }, 30_000);

  it("a SIGKILL to the script alone: vitest and its worker are gone, and so is aiqh-minpath-* (before: all three were left)", async () => {
    const f = fakeRoot("hang");
    const s = startScript(f);
    const pids = [await pidOf(f, "vitest"), await pidOf(f, "worker")];
    expect(minpathDirs(f), "precondition: the script made its PATH directory").toHaveLength(1);
    s.child.kill("SIGKILL");
    await s.exited;
    expect(await leftAfter(pids, 3000), "vitest and its worker are gone").toEqual([]);
    expect(await minpathLeftAfter(f, 3000), "the watchdog removed the script's PATH directory (N3)").toEqual([]);
  }, 30_000);

  it("a SIGKILL to the script's group, as the runner sends it: vitest and its worker are gone, and so is aiqh-minpath-* (before: the directory was left)", async () => {
    const f = fakeRoot("hang");
    const s = startScript(f);
    const pids = [await pidOf(f, "vitest"), await pidOf(f, "worker")];
    const pgid = s.child.pid ?? 0;
    assertSignalablePid(pgid);
    if (s.child.exitCode !== null || s.child.signalCode !== null) throw new Error("precondition: the script ended before its group was signalled");
    process.kill(-pgid, "SIGKILL"); // the script leads this group (detached) and is still running: the id is not reused
    await s.exited;
    expect(await leftAfter(pids, 3000), "vitest and its worker are gone").toEqual([]);
    expect(await minpathLeftAfter(f, 3000), "the watchdog removed the script's PATH directory (N3)").toEqual([]);
  }, 30_000);
});

describe("backlog 5: exit codes through the watchdog", () => {
  it("control: vitest's exit code is the script's (0 and 3), and the script removes its PATH directory (pass before and after)", async () => {
    for (const [mode, expected] of [["exit-0", 0], ["exit-3", 3]] as const) {
      const f = fakeRoot(mode);
      const s = startScript(f);
      const { code } = await s.exited;
      expect(code, s.output()).toBe(expected);
      expect(minpathDirs(f)).toEqual([]);
    }
  }, 30_000);

  it("vitest ended by a signal n: the script exits 128 + n (143 for SIGTERM; before: 2)", async () => {
    const f = fakeRoot("self-term");
    const s = startScript(f);
    const { code } = await s.exited;
    expect(code, s.output()).toBe(143);
  }, 30_000);
});

describe("backlog 5: the watchdog's SIGKILL stays in its own group", () => {
  const watchdog = (f: Fake): string => path.join(f.root, "scripts", "minpath-watchdog.ts");
  const entry = (f: Fake): string => path.join(f.root, "node_modules", "vitest", "vitest.mjs");

  it("known limit: a process that vitest's side started in another group (detached) is not reached; the rest of the group is", async () => {
    const f = fakeRoot("outsider");
    const dir = path.join(f.tmp, "aiqh-minpath-w1");
    mkdirSync(dir);
    const w = start([watchdog(f), dir, entry(f), "run"], f.root, { PATH: process.env.PATH ?? "" }, true);
    const inGroup = [await pidOf(f, "vitest"), await pidOf(f, "worker")];
    const outsider = await pidOf(f, "outsider");
    w.child.stdin?.end();
    const { signal } = await w.exited;
    expect(signal, `the watchdog ends with its own group: ${w.output()}`).toBe("SIGKILL");
    expect(await leftAfter(inGroup, 3000)).toEqual([]);
    expect(gone(outsider), "the outsider is in another group: not reached (it leaves when the marker disappears)").toBe(false);
    expect(existsSync(dir), "the aiqh-minpath-* directory it was given is removed").toBe(false);
  }, 30_000);

  it("a directory whose name is not aiqh-minpath-* is not removed; the group is still stopped", async () => {
    const f = fakeRoot("hang");
    const dir = path.join(f.tmp, "kept");
    mkdirSync(dir);
    const w = start([watchdog(f), dir, entry(f), "run"], f.root, { PATH: process.env.PATH ?? "" }, true);
    const pids = [await pidOf(f, "vitest"), await pidOf(f, "worker")];
    w.child.stdin?.end();
    await w.exited;
    expect(await leftAfter(pids, 3000)).toEqual([]);
    expect(existsSync(dir)).toBe(true);
  }, 30_000);

  it("started outside a group of its own: refuses (exit 2) before it starts anything, even when its pipe closes at once", async () => {
    // A guard against process.kill(0) in the wrong group. The watchdog is started (not detached) by a node process that leads a group
    // of its own, so that a watchdog without the guard would SIGKILL only that group, never the test's.
    const f = fakeRoot("hang");
    const result = path.join(f.base, "result.json");
    const js = [
      'const { spawn } = require("child_process");',
      `const w = spawn(process.execPath, ${JSON.stringify([watchdog(f), path.join(f.tmp, "aiqh-minpath-w3"), entry(f), "run"])}, { stdio: ["pipe", "ignore", "inherit"] });`,
      "w.stdin.on(\"error\", () => {});",
      "w.stdin.end();",
      `w.on("exit", (code, signal) => { require("fs").writeFileSync(${JSON.stringify(result)}, JSON.stringify({ code, signal })); process.exit(0); });`,
    ].join("\n");
    const sandbox = start(["-e", js], f.root, { PATH: process.env.PATH ?? "" }, true);
    const { code, signal } = await sandbox.exited;
    expect({ code, signal }, `the sandbox group was not stopped: ${sandbox.output()}`).toEqual({ code: 0, signal: null });
    expect(JSON.parse(readFileSync(result, "utf8"))).toEqual({ code: 2, signal: null });
    expect(existsSync(path.join(f.state, "vitest.pid")), "nothing was started").toBe(false);
    expect(sandbox.output()).toMatch(/minpath-watchdog: .*process group/);
  }, 30_000);
});
