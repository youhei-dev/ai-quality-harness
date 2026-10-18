/**
 * The one boundary between aiqh and the terminal (M2-2-R2-001): every line, JSON document and commander message that
 * aiqh writes to standard output or standard error goes through here. Forbidden raw characters (raw-chars.ts: C0
 * controls other than TAB and LF, DEL, C1 controls, U+2028 / U+2029, the bidi controls, U+FEFF) first become the ASCII
 * notation `\u{HEX}`, then the masker redacts secret shapes (it is idempotent, so text a command masked already is
 * unchanged). In a JSON document the object keys go through the same processing as the values (M2-2-R3-002), and only
 * JSON data is accepted: anything else is refused before printing (M2-2-R4-001).
 * One written line is one line (M2-2-R3-001): LF and TAB in a line become notation as well, so a value embedded in it (a
 * path, a file name, an error message, a line of a check's output) cannot start a line or a column of its own. A
 * command's own multi-line text — the proposed config, the details of a config error, commander's help and messages —
 * is written as an explicit block: its lines stay, and each of them is processed like a line.
 * Before v0.5.2 only review-packet escaped raw characters; the other commands passed paths, file names, git output and
 * error messages to the terminal through the masker alone.
 * Only the two writers below (emitOut, emitErr) reach the terminal, and they take only `Safe` strings, which only
 * safeText and safeJson create (M2-2-R3-003). tests/structure/output-guard.ts (type-aware) checks both: `console`,
 * `process.stdout` / `process.stderr` nowhere else in src/, no dynamic or reflective way to reach them, and no `Safe`
 * made by a type assertion elsewhere.
 */
import { maskSecrets } from "./security/mask.ts";
import { escapeRawChars, isForbiddenCodePoint } from "./security/raw-chars.ts";

/**
 * How the strings of a JSON document treat LF and TAB, which are not in the forbidden set (JSON.stringify writes them as
 * `\n` / `\t`, so they never break a line of the document):
 * - keep: they stay (init's `configText` keeps its lines)
 * - escape: they become `\u{A}` / `\u{9}` as well (review-packet, M2-1-R1-002)
 */
export type LineMode = "keep" | "escape";

/** Forbidden raw characters as `\u{HEX}`; LF and TAB as well with "escape". */
export function escapeForDisplay(s: string, mode: LineMode): string {
  if (mode === "escape") return escapeRawChars(s);
  let out = "";
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    out += isForbiddenCodePoint(cp) ? `\\u{${cp.toString(16).toUpperCase()}}` : c;
  }
  return out;
}

declare const safeBrand: unique symbol;

/** A string that went through safeText or safeJson: the only kind the writers accept (M2-2-R3-003). */
export type Safe = string & { readonly [safeBrand]: true };

/**
 * What one written string is (M2-2-R3-001):
 * - line: one line; LF and TAB become notation like the forbidden characters
 * - block: a command's own lines; they stay, and each line is processed like a line (its TAB becomes notation)
 */
export type TextShape = "line" | "block";

/** Text for the terminal: raw characters escaped (for a line, LF and TAB as well), then secret shapes masked. */
export function safeText(s: string, shape: TextShape = "line"): Safe {
  return maskSecrets(shape === "line" ? escapeRawChars(s) : s.split("\n").map(escapeRawChars).join("\n")) as Safe;
}

/** Nesting deeper than this is refused (the copy is recursive; v0.5.9 overflowed the stack at 1,000–2,000 levels of arrays). */
export const MAX_JSON_DEPTH = 100;

/** The refusal of a value that is not JSON data (M2-2-R4-001). The message names the kind only, never a key or a value. */
function notJsonData(what: string): Error {
  return new Error(`JSON output refused: ${what} is not JSON data`);
}

/**
 * One reflective operation on a value that may be a Proxy (M2-2-R7-003): whatever it throws — the trap's own exception, or
 * the engine's error about the trap's answer, which can quote a key — becomes the fixed refusal. The thrown value is never
 * read (reading it could run the value's code again), so nothing of it reaches the message.
 */
function inspect<T>(op: () => T): T {
  try {
    return op();
  } catch {
    throw notJsonData("a value whose structure could not be inspected");
  }
}

/** An own property that is JSON data: a data property (never an accessor, which is not called) and enumerable. */
function ownDataValue(o: object, key: string, missing: string): unknown {
  const d = inspect(() => Object.getOwnPropertyDescriptor(o, key));
  if (d === undefined) throw notJsonData(missing);
  if (!("value" in d)) throw notJsonData("an accessor property");
  if (d.enumerable !== true) throw notJsonData("a non-enumerable property");
  return d.value as unknown;
}

/** The largest length of an array (2^32 - 1). */
const MAX_ARRAY_LENGTH = 2 ** 32 - 1;

/** An array index in its canonical form: "0", or digits without a leading zero ("01", "1.0", "-0", "+1" and "1e3" are not). */
const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;

/**
 * An array's length, read from its own data descriptor like every other property (M2-2-R7-001): never through a getter or
 * a Proxy's get trap. It is a non-enumerable data property whose value is an integer from 0 to 2^32 - 1.
 */
function arrayLength(a: object): number {
  const d = inspect(() => Object.getOwnPropertyDescriptor(a, "length"));
  const n: unknown = d !== undefined && "value" in d && d.enumerable === false ? d.value : undefined;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_ARRAY_LENGTH) throw notJsonData("an array whose length is not a valid array length");
  return n;
}

/**
 * A copy of JSON data in which every string — object keys included (M2-2-R3-002) — goes through `mapString` (safeJson: escaped, then
 * masked; a report file: masked, backlog 9). JSON data
 * (M2-2-R4-001): a string, a finite number, a boolean, null, an array (prototype Array.prototype, own keys exactly its
 * indices 0 to length - 1 and "length") or an object (prototype Object.prototype or null) whose own properties are
 * enumerable data properties with string keys, all of them JSON data, without a cycle and at most MAX_JSON_DEPTH deep.
 * Anything else is refused, never converted: each property — an array's length included — is read once from its
 * descriptor, so getters, toJSON and a Proxy's get trap are never called (M2-2-R7-001 / R7-002), and JSON.stringify only
 * sees the copy, whose arrays are plain and whose objects have no prototype (so a key such as "__proto__" or "toJSON"
 * stays a key). When an operation that inspects the value throws (a Proxy's trap, or the engine checking a trap's
 * answer), the refusal is the fixed one and the thrown value is not read (M2-2-R7-003). Two keys of one object that
 * become the same string are an error, never a merge. A refusal is fail closed: nothing is printed; the CLI reports it
 * as an unexpected error, exit 2.
 */
function copyJsonData(value: unknown, mapString: (s: string) => string, ancestors: object[] = []): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return mapString(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw notJsonData("a number that is not finite");
    return value;
  }
  if (typeof value !== "object") throw notJsonData(`a value of type ${typeof value}`);
  if (ancestors.includes(value)) throw notJsonData("a circular reference");
  if (ancestors.length >= MAX_JSON_DEPTH) throw notJsonData(`nesting deeper than ${MAX_JSON_DEPTH}`);
  ancestors.push(value);
  const proto: unknown = inspect(() => Object.getPrototypeOf(value));
  const keys = inspect(() => Reflect.ownKeys(value));
  let copy: unknown;
  if (inspect(() => Array.isArray(value))) {
    if (proto !== Array.prototype) throw notJsonData("an array whose prototype is not Array.prototype");
    const length = arrayLength(value);
    // The own keys are exactly "0" to "length-1" and "length" (M2-2-R7-002): there are length + 1 of them, none repeats
    // (the engine refuses a repeated key from a Proxy), and each is "length" or a canonical index below length. Only these
    // indices' descriptors are read.
    if (keys.length !== length + 1) throw notJsonData("an array with a hole or a key that is not an index");
    for (const k of keys) {
      if (k !== "length" && (typeof k !== "string" || !ARRAY_INDEX.test(k) || Number(k) >= length)) throw notJsonData("an array with a hole or a key that is not an index");
    }
    const out: unknown[] = [];
    for (let i = 0; i < length; i++) out.push(copyJsonData(ownDataValue(value, String(i), "an array with a hole"), mapString, ancestors));
    copy = out;
  } else {
    if (proto !== Object.prototype && proto !== null) throw notJsonData("an object whose prototype is not Object.prototype or null");
    const out = Object.create(null) as Record<string, unknown>;
    for (const k of keys) {
      if (typeof k === "symbol") throw notJsonData("a symbol key");
      const v = ownDataValue(value, k, "a property that disappeared while it was read");
      const key = mapString(k);
      if (Object.hasOwn(out, key)) throw new Error(`JSON output refused: two object keys are the same after escaping and masking ("${escapeRawChars(key)}")`);
      out[key] = copyJsonData(v, mapString, ancestors);
    }
    copy = out;
  }
  ancestors.pop();
  return copy;
}

/**
 * A JSON document for the terminal: JSON data only (anything else is refused, M2-2-R4-001), every string and object key
 * escaped, then masked, printed with two-space indentation.
 */
export function safeJson(value: unknown, mode: LineMode = "keep"): Safe {
  return JSON.stringify(copyJsonData(value, (s) => maskSecrets(escapeForDisplay(s, mode))), null, 2) as Safe;
}

/**
 * The same copy for data that goes to a file instead of the terminal (backlog 9, ADR-0020): the verify report. `mapString` is applied to every
 * string and key (the report: the masker; the forbidden characters are converted where the file is written). The answer is a copy without
 * prototypes, so a key such as `__proto__` stays a key, and `JSON.stringify` never meets a function.
 */
export function copyJson<T>(value: T, mapString: (s: string) => string): T {
  return copyJsonData(value, mapString) as T;
}

/**
 * The two writers: the only code in src/ that reaches the terminal. `line` ends the text with a newline
 * (console.log / console.error); without it the text is written as given (commander's output ends with its own newline).
 */
function emitOut(text: Safe, line: boolean): void {
  if (line) console.log(text);
  else process.stdout.write(text);
}

function emitErr(text: Safe, line: boolean): void {
  if (line) console.error(text);
  else process.stderr.write(text);
}

/**
 * The writers a command is given: the sinks of a test, or the process's standard output and error. A sink receives one
 * line, one block (its lines joined with LF) or one JSON document per call.
 */
export interface OutputSinks {
  log?: ((line: string) => void) | undefined;
  logError?: ((line: string) => void) | undefined;
}

export interface Output {
  /** One line to standard output: LF, TAB and the forbidden characters in it become notation. */
  log: (line: string) => void;
  /** One line to standard error. */
  error: (line: string) => void;
  /** A command's own multi-line text to standard output: its lines stay, each processed like a line. */
  block: (text: string) => void;
  /** A command's own multi-line text to standard error. */
  errorBlock: (text: string) => void;
  /** A JSON document to standard output. */
  json: (value: unknown) => void;
  /**
   * The same JSON document, written only when its UTF-8 length is at most `maxBytes` (aiqh history, ADR-0034 N). Answers whether it
   * wrote; over the limit nothing reaches the sink.
   */
  jsonWithin: (value: unknown, maxBytes: number) => boolean;
}

/**
 * The output of one command run: everything it prints goes through safeText / safeJson. `jsonMode` is how the strings
 * of its JSON document treat LF and TAB ("escape" for review-packet).
 */
export function createOutput(sinks: OutputSinks, jsonMode: LineMode = "keep"): Output {
  const out = sinks.log ?? ((text: Safe) => emitOut(text, true));
  const err = sinks.logError ?? ((text: Safe) => emitErr(text, true));
  return {
    log: (line) => out(safeText(line)),
    error: (line) => err(safeText(line)),
    block: (text) => out(safeText(text, "block")),
    errorBlock: (text) => err(safeText(text, "block")),
    json: (value) => out(safeJson(value, jsonMode)),
    jsonWithin: (value, maxBytes) => {
      const text = safeJson(value, jsonMode);
      if (Buffer.byteLength(text, "utf8") > maxBytes) return false;
      out(text);
      return true;
    },
  };
}

/** A line to standard error from outside a command run (signals, an unexpected error, an option parser). */
export function writeError(line: string): void {
  emitErr(safeText(line), true);
}

/** The suggestion commander appends to a usage error as the last line of the message, e.g. `(Did you mean --json?)`. */
const COMMANDER_SUGGESTION = /\n\(Did you mean [^\n]*\?\)$/;

/**
 * A usage error of commander (M2-2-R3-001): its message quotes argv — a whole argument, or a part of one (with `-v`
 * known, `-v<LF>x` is reported as `-<LF>x`), or several joined with ", " — so it is one line: every LF becomes notation
 * except commander's own two, the final one and the one before its suggestion. commander ends every such message with
 * its own text (a quote, a period or the suggestion), so an argument cannot end the message as a suggestion line.
 */
function commanderError(str: string): string {
  const end = str.endsWith("\n") ? "\n" : "";
  const body = str.slice(0, str.length - end.length);
  const at = COMMANDER_SUGGESTION.exec(body)?.index ?? body.length;
  return `${escapeRawChars(body.slice(0, at))}${body.slice(at)}${end}`;
}

/**
 * commander's own output — help, `--version`, usage errors, which can quote argv — through the same processing: help and
 * `--version` are commander's blocks, written as given (commander ends them with a newline); a usage error is one line
 * plus commander's suggestion. Set on the program before its commands are added, so that every command inherits it.
 */
export const COMMANDER_OUTPUT = {
  writeOut: (str: string): void => {
    emitOut(safeText(str, "block"), false);
  },
  writeErr: (str: string): void => {
    emitErr(safeText(str, "block"), false);
  },
  outputError: (str: string, write: (str: string) => void): void => {
    write(commanderError(str));
  },
};
