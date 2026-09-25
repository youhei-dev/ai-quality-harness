/**
 * The one boundary between aiqh and the terminal (M2-2-R2-001): every line, JSON document and commander message that
 * aiqh writes to standard output or standard error goes through here. Forbidden raw characters (raw-chars.ts: C0
 * controls other than TAB and LF, DEL, C1 controls, U+2028 / U+2029, the bidi controls, U+FEFF) first become the ASCII
 * notation `\u{HEX}`, then the masker redacts secret shapes (it is idempotent, so text a command masked already is
 * unchanged). In a JSON document the object keys go through the same processing as the values (M2-2-R3-002). Before
 * v0.5.2 only review-packet escaped raw characters; the other commands passed paths, file names, git output and error
 * messages to the terminal through the masker alone.
 * tests/structure/output-guard.ts allows `console`, `process.stdout` / `process.stderr` and writes to file descriptors
 * 1 and 2 only in this module.
 */
import { maskSecrets } from "./security/mask.ts";
import { escapeRawChars, isForbiddenCodePoint } from "./security/raw-chars.ts";

/**
 * How one written string treats LF and TAB, which are not in the forbidden set:
 * - keep: they are the output's own lines and columns (multi-line messages, the tails of check output, the proposed
 *   config, help), so they stay
 * - escape: one call is one line (review-packet, M2-1-R1-002), so they become `\u{A}` / `\u{9}` as well
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

/** Text for the terminal: raw characters escaped, then secret shapes masked. */
export function safeText(s: string, mode: LineMode = "keep"): string {
  return maskSecrets(escapeForDisplay(s, mode));
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
export function safeJson(value: unknown, mode: LineMode = "keep"): string {
  return JSON.stringify(jsonSafe(value, mode), null, 2);
}

/** The writers a command is given: the sinks of a test, or the process's standard output and error. */
export interface OutputSinks {
  log?: ((line: string) => void) | undefined;
  logError?: ((line: string) => void) | undefined;
}

export interface Output {
  /** One line (or a block of lines with "keep") to standard output. */
  log: (line: string) => void;
  /** The same to standard error. */
  error: (line: string) => void;
  /** A JSON document to standard output. */
  json: (value: unknown) => void;
}

/** The output of one command run: everything it prints goes through safeText / safeJson. */
export function createOutput(sinks: OutputSinks, mode: LineMode = "keep"): Output {
  const out = sinks.log ?? ((line: string) => console.log(line));
  const err = sinks.logError ?? ((line: string) => console.error(line));
  return {
    log: (line) => out(safeText(line, mode)),
    error: (line) => err(safeText(line, mode)),
    json: (value) => out(safeJson(value, mode)),
  };
}

/** A line to standard error from outside a command run (signals, an unexpected error, an option parser). */
export function writeError(line: string): void {
  console.error(safeText(line));
}

/**
 * commander's own output — help, `--version`, usage errors, which can quote argv — through the same processing; written
 * as given (commander ends its messages with a newline). Set on the program before its commands are added, so that
 * every command inherits it.
 */
export const COMMANDER_OUTPUT = {
  writeOut: (str: string): void => {
    process.stdout.write(safeText(str));
  },
  writeErr: (str: string): void => {
    process.stderr.write(safeText(str));
  },
};
