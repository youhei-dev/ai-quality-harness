/**
 * The one boundary between aiqh and the terminal (M2-2-R2-001): every line, JSON document and commander message that
 * aiqh writes to standard output or standard error goes through here. Forbidden raw characters (raw-chars.ts: C0
 * controls other than TAB and LF, DEL, C1 controls, U+2028 / U+2029, the bidi controls, U+FEFF) first become the ASCII
 * notation `\u{HEX}`, then the masker redacts secret shapes (it is idempotent, so text a command masked already is
 * unchanged). In a JSON document the object keys go through the same processing as the values (M2-2-R3-002).
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

/**
 * A copy of a JSON value in which every string — object keys included (M2-2-R3-002) — is escaped, then masked. Two keys
 * of one object that become the same string are an error, never a merge (fail closed: nothing is printed; the CLI
 * reports it as an unexpected error, exit 2). The objects of the copy have no prototype, so a key such as "__proto__"
 * stays a key.
 */
function jsonSafe(value: unknown, mode: LineMode): unknown {
  if (typeof value === "string") return maskSecrets(escapeForDisplay(value, mode));
  if (Array.isArray(value)) return value.map((v: unknown) => jsonSafe(v, mode));
  if (value !== null && typeof value === "object") {
    const out = Object.create(null) as Record<string, unknown>;
    for (const [k, v] of Object.entries(value)) {
      const key = maskSecrets(escapeForDisplay(k, mode));
      if (Object.hasOwn(out, key)) throw new Error(`JSON output refused: two object keys are the same after escaping and masking ("${escapeRawChars(key)}")`);
      out[key] = jsonSafe(v, mode);
    }
    return out;
  }
  return value;
}

/** A JSON document for the terminal: every string and object key escaped, then masked, printed with two-space indentation. */
export function safeJson(value: unknown, mode: LineMode = "keep"): Safe {
  return JSON.stringify(jsonSafe(value, mode), null, 2) as Safe;
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
