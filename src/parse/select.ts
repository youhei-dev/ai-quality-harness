/**
 * Which parser reads a check's output (ADR-0028, P5): decided by aiqh from the command alone — no config field, and the command is
 * never changed. The command is split into words (quotes dropped; `;`, `|`, `&`, `(` and `)` end a simple command) and a tool is named
 * by a word's last path segment: `vitest` / `vitest.mjs`, `eslint` / `eslint.js`, `npm` followed by `audit`, `security-scan` with
 * `aiqh` / `cli.ts` / `cli.js` in the same simple command. When the whole command is one `npm run <script>` / `npm run-script <script>`
 * / `npm test` (`t`, `tst`), the script of package.json in the check's directory is read instead (one level; npm's lookup of a parent
 * package.json is not followed). The kind and the name of a check are not used: they do not tell which tool runs. No tool, or more
 * than one: not-applicable. A package.json that exists but cannot be read is unparsed (ADR-0022: unreadable is not absent).
 * pytest (v0.14.0, ADR-0028 decision 12) is chosen by the position of its words instead (src/command-words.ts; batch1 design, final,
 * §3.5, B1-Q7 B-1): one simple command runs it at its command position — `pytest` / `py.test`, a `python` / `python3` / `python3.<n>`
 * with flags that take no value and then `-m pytest`, or one of the wrappers (uv, poetry, pipenv, pdm, hatch, rye) `run` before those —
 * and no other simple command stands before or after it, but a leading `cd <one word>`. Otherwise a line that looks like pytest's
 * summary (echo, a later command) could be shown as its counts.
 */
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { lastPathSegment, simpleCommands, withoutAssignments, type CommandWord, type SimpleCommand } from "../command-words.ts";
import type { ParserTool } from "../types.ts";

/** A package.json larger than this is not read (bytes). */
export const PACKAGE_JSON_MAX = 1024 * 1024;

export type Selection =
  | { kind: "tool"; tool: ParserTool }
  | { kind: "none"; status: "not-applicable"; reason: "no-parser" | "several-tools" }
  | { kind: "none"; status: "unparsed"; reason: "script-unreadable" };

/** package.json of a directory: absent (ENOENT / ENOTDIR), unreadable (anything else, also a link or a directory), or its scripts. */
export type ScriptsRead = { kind: "absent" } | { kind: "unreadable" } | { kind: "read"; scripts: Record<string, unknown> | null };

const NO_PARSER: Selection = { kind: "none", status: "not-applicable", reason: "no-parser" };
const SEVERAL: Selection = { kind: "none", status: "not-applicable", reason: "several-tools" };
const UNREADABLE: Selection = { kind: "none", status: "unparsed", reason: "script-unreadable" };
const OPERATORS = ";|&()";

export function selectParser(command: string, cwdAbsolute: string, readScripts: (dir: string) => ScriptsRead = readPackageScripts): Selection {
  let text = command;
  let segments = segmentsOf(command);
  const script = npmScriptName(segments);
  if (script !== null) {
    const read = readScripts(cwdAbsolute);
    if (read.kind === "unreadable") return UNREADABLE;
    const body = read.kind === "read" && read.scripts !== null && Object.hasOwn(read.scripts, script) ? read.scripts[script] : undefined;
    if (typeof body !== "string") return NO_PARSER;
    text = body;
    segments = segmentsOf(text);
  }
  const tools = toolsIn(segments);
  if (choosesPytest(text)) tools.add("pytest");
  const [only] = tools;
  if (only === undefined) return NO_PARSER;
  return tools.size === 1 ? { kind: "tool", tool: only } : SEVERAL;
}

/** Words of each simple command; quotes are dropped, not interpreted. */
function segmentsOf(command: string): string[][] {
  const segments: string[][] = [];
  let words: string[] = [];
  let word = "";
  const endWord = (): void => {
    if (word.length > 0) words.push(word);
    word = "";
  };
  for (const c of command) {
    if (c === '"' || c === "'") continue;
    if (c.trim() === "") {
      endWord();
    } else if (OPERATORS.includes(c)) {
      endWord();
      if (words.length > 0) segments.push(words);
      words = [];
    } else {
      word += c;
    }
  }
  endWord();
  if (words.length > 0) segments.push(words);
  return segments;
}

/** The script named by a command that is exactly one `npm run <script>` / `npm run-script <script>` / `npm test`, or null. */
function npmScriptName(segments: string[][]): string | null {
  const [words, ...rest] = segments;
  if (words === undefined || rest.length > 0 || lastSegment(words[0] ?? "") !== "npm") return null;
  const sub = words[1];
  const name = words[2];
  if ((sub === "run" || sub === "run-script") && name !== undefined && !name.startsWith("-")) return name;
  if (sub === "test" || sub === "t" || sub === "tst") return "test";
  return null;
}

function lastSegment(word: string): string {
  return word.slice(Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\")) + 1);
}

function toolsIn(segments: string[][]): Set<ParserTool> {
  const tools = new Set<ParserTool>();
  for (const words of segments) {
    const names = words.map(lastSegment);
    if (names.includes("vitest") || names.includes("vitest.mjs")) tools.add("vitest");
    if (names.includes("eslint") || names.includes("eslint.js")) tools.add("eslint");
    const npm = names.indexOf("npm");
    if (npm !== -1 && names.slice(npm + 1).includes("audit")) tools.add("npm-audit");
    if (names.includes("security-scan") && (names.includes("aiqh") || names.includes("cli.ts") || names.includes("cli.js"))) tools.add("aiqh-security-scan");
  }
  return tools;
}

const PYTHON_FLAGS = new Set(["-B", "-E", "-I", "-O", "-OO", "-P", "-s", "-S", "-u", "-q", "-b", "-bb", "-d", "-v"]);
const WRAPPERS = new Set(["uv", "poetry", "pipenv", "pdm", "hatch", "rye"]);
const WRAPPER_FLAGS = new Set(["--frozen", "--locked", "--no-sync", "--offline", "--quiet", "-q"]);

const plain = (w: CommandWord | undefined, text: string): boolean => w !== undefined && !w.marked && w.text === text;

/** P1 / P2 at `words[0]`: pytest itself, or python with flags that take no value and then `-m pytest`. */
function startsPytest(words: readonly CommandWord[]): boolean {
  const [first, ...rest] = words;
  if (first === undefined || first.marked) return false;
  const name = lastPathSegment(first.text);
  if (name === "pytest" || name === "py.test") return true;
  if (name !== "python" && name !== "python3" && !/^python3\.[0-9]+$/.test(name)) return false;
  let i = 0;
  while (i < rest.length && PYTHON_FLAGS.has(rest[i]?.text ?? "")) i += 1;
  return plain(rest[i], "-m") && plain(rest[i + 1], "pytest");
}

/** A simple command that runs pytest at its command position (P1 / P2, or P3: a wrapper's `run` before them). */
function runsPytest(command: SimpleCommand): boolean {
  if (!command.examinable) return false;
  const { rest } = withoutAssignments(command.words);
  const [first, second] = rest;
  if (first !== undefined && !first.marked && WRAPPERS.has(lastPathSegment(first.text)) && plain(second, "run")) {
    let i = 2;
    while (i < rest.length && (rest[i]?.text ?? "").startsWith("-")) {
      const flag = rest[i]?.text ?? "";
      if (!flag.includes("=") && !WRAPPER_FLAGS.has(flag)) return false;
      i += 1;
    }
    return startsPytest(rest.slice(i));
  }
  return startsPytest(rest);
}

/** B-1: the command (or the npm script) is one simple command that runs pytest, after at most a `cd <one word>`. */
function choosesPytest(text: string): boolean {
  const commands = simpleCommands(text);
  if (commands === null) return false;
  const [first, second, ...more] = commands;
  if (first === undefined || more.length > 0) return false;
  if (second === undefined) return runsPytest(first);
  const cd = first.examinable && first.words.length === 2 && plain(first.words[0], "cd");
  return cd && runsPytest(second);
}

/** The scripts of `<dir>/package.json`. A symbolic link, a directory or a FIFO is not read (a FIFO would block), nor a file over PACKAGE_JSON_MAX. */
export function readPackageScripts(dir: string): ScriptsRead {
  const file = path.join(dir, "package.json");
  let size: number;
  try {
    const st = lstatSync(file);
    if (!st.isFile()) return { kind: "unreadable" };
    size = st.size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? { kind: "absent" } : { kind: "unreadable" };
  }
  if (size > PACKAGE_JSON_MAX) return { kind: "unreadable" };
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { kind: "unreadable" };
  }
  const scripts = isRecord(value) ? value.scripts : undefined;
  return { kind: "read", scripts: isRecord(scripts) ? scripts : null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
