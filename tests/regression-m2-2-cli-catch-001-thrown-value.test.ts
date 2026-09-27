/**
 * ROADMAP backlog 1 (Medium, found in the v0.5.12 SP1: docs/reviews/m2-2/response-r7.md, ADR-0018 known limits): the
 * CLI's top-level catch (src/cli.ts) reports a value thrown out of a command as `aiqh: unexpected error: <message>` and
 * exits 2. Up to v0.5.13 it inspected the value outside a try (`err instanceof Error ? err.message : String(err)`), so a
 * value whose inspection throws made the catch itself throw: Node printed the raw text (forbidden characters, an
 * unmasked secret shape) and the process exited 1.
 * The real CLI runs as a child process (`node --import <preload> src/cli.ts security-scan --json`). The preload, written
 * here into a temporary directory (no test hook in src/), makes process.cwd() throw the chosen value when it is called
 * from src/commands/security-scan.ts (the command's first step), so the value reaches the top-level catch unchanged. It
 * records every operation on the value; none may follow the first failure (the value is not read again).
 * M2-2-CLI-CATCH-R1-001 (v0.5.15): every test starts and owns its run; the run is stopped in afterEach through its
 * ChildProcess handle, also after a failure or a test timeout, before its directory is removed (M2-2-R5-001's rule).
 * Forbidden characters and secret shapes are built at run time; a failing expectation shows the output in notation.
 */
import { type ChildProcess, execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { fake, makeTempDir, runCleanups, SETTLE_MARGIN_MS, stopper } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const RLO = String.fromCodePoint(0x202e);
const LF = String.fromCodePoint(0x0a);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const MARK = (): string => `marker-cc ${RLO}${LF} ${SECRET()}`;
/** The marker as the output boundary writes it: raw characters as notation, the secret masked. */
const MARK_SHOWN = "marker-cc \\u{202E}\\u{A} [REDACTED:aws]";
/** The fixed text for a thrown value that cannot be inspected (the wording is decided with the fix). */
const FIXED = "(the thrown value could not be inspected)";
const VERDICT_LINE = "VERIFY ERROR (internal error)\n";
const report = (message: string): string => `aiqh: unexpected error: ${message}\n${VERDICT_LINE}`;
/** execFile's own limit: a second safety valve only (the clean-up in afterEach is what stops a run). */
const CHILD_TIMEOUT_MS = 20_000;

/**
 * The child's preload. AIQH_CC_KIND picks the value; AIQH_CC_LOG gets "thrown" when it is thrown, one line per operation
 * on a recorded value ("touch <trap>") and one per failure ("fail"). A recorded value is a Proxy whose handler is itself
 * a Proxy, so every operation on it passes through the handler's get.
 */
const PRELOAD = String.raw`
import { appendFileSync } from "node:fs";
const kind = process.env.AIQH_CC_KIND;
const mark = process.env.AIQH_CC_MARK;
const note = (line) => appendFileSync(process.env.AIQH_CC_LOG, line + "\n");
const boom = () => { note("fail"); throw new Error(mark); };
const watched = (target, traps = {}) => new Proxy(target, new Proxy({}, {
  get: (_, trap) => (...args) => {
    note("touch " + String(trap));
    return (Object.hasOwn(traps, trap) ? traps[trap] : Reflect[trap])(...args);
  },
}));
const withMessage = (descriptor) => Object.defineProperty(new Error("x"), "message", descriptor);
const values = {
  "error": () => new Error(mark),
  "string": () => mark,
  "toString": () => ({ toString: () => mark }),
  "symbol": () => Symbol(mark),
  "message-object": () => withMessage({ value: { toString: () => mark } }),
  "getPrototypeOf-throws": () => watched({}, { getPrototypeOf: boom }),
  "revoked": () => { const r = Proxy.revocable({}, {}); r.revoke(); return r.proxy; },
  "message-getter-throws": () => withMessage({ get: boom }),
  "message-getter-throws-watched": () => watched(withMessage({ get: boom })),
  "toString-throws": () => watched({ toString: boom }),
  "toPrimitive-throws": () => watched({ [Symbol.toPrimitive]: boom }),
  "null-prototype": () => Object.create(null),
  "message-symbol": () => withMessage({ value: Symbol(mark) }),
  "message-toString-throws": () => withMessage({ value: watched({ toString: boom }) }),
  "getPrototypeOf-throws-string": () => watched({}, { getPrototypeOf: () => { note("fail"); throw mark; } }),
  "getter-throws-hostile": () => withMessage({ get: () => { note("fail"); throw watched({}, { getPrototypeOf: boom }); } }),
  "console-error-throws": () => new Error(mark),
};
const realCwd = process.cwd;
process.cwd = function cwd() {
  if (new Error().stack.includes("/src/commands/security-scan.ts")) {
    note("thrown");
    throw values[kind]();
  }
  return realCwd.call(process);
};
if (kind === "console-error-throws") {
  const realError = console.error;
  console.error = function error(...args) {
    if (String(args[0]).startsWith("aiqh: unexpected error: ")) {
      note("fail");
      throw watched({}, { getPrototypeOf: boom });
    }
    return realError.apply(console, args);
  };
}
`;

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  /** The preload's record: "thrown", then "touch <trap>" and "fail" lines. */
  log: string[];
}

/**
 * One CLI run, owned by the test that calls it (M2-2-CLI-CATCH-R1-001): its own temporary directory, and a clean-up
 * registered right after the start, before the first await. The clean-ups run newest first: unless the run has ended,
 * SIGKILL through the ChildProcess handle (the CLI's own signal handling is not what this file tests) and a bounded wait
 * for its end, then the directory is removed.
 */
function run(kind: string): Promise<Run> {
  const tmp = makeTempDir("aiqh-cli-catch-");
  cleanups.push(tmp.cleanup);
  const preload = path.join(tmp.dir, "preload.mjs");
  const log = path.join(tmp.dir, "record.log");
  writeFileSync(preload, PRELOAD);
  writeFileSync(log, "");
  let child: ChildProcess | undefined;
  const done = new Promise<Run>((resolve) => {
    child = execFile(
      process.execPath,
      ["--import", pathToFileURL(preload).href, CLI, "security-scan", "--json"],
      {
        cwd: tmp.dir,
        env: { ...process.env, NO_COLOR: "1", AIQH_CC_KIND: kind, AIQH_CC_MARK: MARK(), AIQH_CC_LOG: log },
        timeout: CHILD_TIMEOUT_MS,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        const lines = readFileSync(log, "utf8").split("\n").filter((l) => l !== "");
        resolve({ code, stdout, stderr, log: lines });
      },
    );
  });
  cleanups.push(stopper(done, () => child?.kill("SIGKILL"), SETTLE_MARGIN_MS, "the CLI"));
  return done;
}

/** The text with the secret replaced and every character outside printable ASCII as notation (safe to show). */
function shown(text: string): string {
  return [...text.replaceAll(SECRET(), "<SECRET>")]
    .map((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp >= 0x20 && cp <= 0x7e ? c : `<U+${cp.toString(16).toUpperCase()}>`;
    })
    .join("");
}

/** The value was thrown from the command; exactly these bytes on standard error, nothing on standard output, exit 2. */
function expectReport(r: Run, stderr: string): void {
  expect(r.log[0]).toBe("thrown");
  expect({ code: r.code, stdout: shown(r.stdout), stderr: shown(r.stderr) }).toEqual({ code: 2, stdout: "", stderr: shown(stderr) });
  expect(r.stderr === stderr).toBe(true);
}

/** Nothing of the thrown value reached standard error: no marker, no raw or notated RLO, no secret, raw or masked. */
function expectNoTrace(text: string): void {
  expect(text.includes("marker-cc")).toBe(false);
  expect(text.includes(RLO)).toBe(false);
  expect(text.includes("\\u{202E}")).toBe(false);
  expect(text.includes(SECRET())).toBe(false);
  expect(text.includes("[REDACTED")).toBe(false);
}

/** Lines of the record after the first failure (none: the value is not read again). */
function afterFirstFailure(r: Run): string[] {
  const first = r.log.indexOf("fail");
  expect(first).toBeGreaterThanOrEqual(0);
  return r.log.slice(first + 1);
}

const HOSTILE: Array<[string, string]> = [
  ["getPrototypeOf-throws", "a Proxy whose getPrototypeOf throws (instanceof fails)"],
  ["revoked", "a revoked Proxy (instanceof fails with the engine's TypeError)"],
  ["message-getter-throws", "an Error whose message getter throws"],
  ["message-getter-throws-watched", "the same Error seen through a recording Proxy"],
  ["toString-throws", "an object whose toString throws"],
  ["toPrimitive-throws", "an object whose Symbol.toPrimitive throws"],
  ["null-prototype", "an object with no prototype (String() cannot convert it)"],
  ["message-symbol", "an Error whose message is a symbol (the template cannot convert it)"],
  ["message-toString-throws", "an Error whose message is an object whose toString throws"],
  ["getPrototypeOf-throws-string", "a Proxy whose getPrototypeOf throws a string"],
  ["getter-throws-hostile", "an Error whose message getter throws a Proxy whose getPrototypeOf throws"],
];

/** The kinds that record their failure: nothing may touch the value (or what it threw) afterwards. */
const RECORDED = [
  "getPrototypeOf-throws",
  "message-getter-throws",
  "message-getter-throws-watched",
  "toString-throws",
  "toPrimitive-throws",
  "message-toString-throws",
  "getPrototypeOf-throws-string",
  "getter-throws-hostile",
];

const ORDINARY: Array<[string, string, string]> = [
  ["error", "an Error", MARK_SHOWN],
  ["string", "a string", MARK_SHOWN],
  ["toString", "an object with toString", MARK_SHOWN],
  ["symbol", "a symbol", `Symbol(${MARK_SHOWN})`],
  ["message-object", "an Error whose message is an object with toString", MARK_SHOWN],
];

describe("CLI top-level catch: a thrown value whose inspection throws becomes the fixed text", () => {
  for (const [kind, what] of HOSTILE) {
    it(`${what}: exit 2, the fixed text, nothing of the value`, async () => {
      const r = await run(kind);
      expectReport(r, report(FIXED));
      expectNoTrace(r.stderr);
    });
  }
});

describe("CLI top-level catch: the value is not read again after the inspection fails", () => {
  for (const kind of RECORDED) {
    it(`${kind}: no operation after the first failure`, async () => {
      expect(afterFirstFailure(await run(kind))).toEqual([]);
    });
  }
});

describe("CLI top-level catch: a report line that cannot be written", () => {
  it("console.error throws on the first line: exit 2, the verdict line still written, what it threw untouched", async () => {
    const r = await run("console-error-throws");
    expectReport(r, VERDICT_LINE);
    expectNoTrace(r.stderr);
    expect(afterFirstFailure(r)).toEqual([]);
  });
});

describe("CLI top-level catch: an ordinary thrown value is reported as before (same bytes as v0.5.13)", () => {
  for (const [kind, what, message] of ORDINARY) {
    it(`${what}: exit 2 and the same two lines`, async () => {
      expectReport(await run(kind), report(message));
    });
  }
});
