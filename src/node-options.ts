/**
 * Node options under which aiqh does not start (B20-R1-001, ADR-0024). With `--unhandled-rejections=warn` Node prints an unhandled
 * rejection's reason and stack itself, beside the masked line of the CLI's handler; with `--abort-on-uncaught-exception` V8 prints an
 * uncaught exception and aborts before the handler runs, and the running checks are left behind. Both were measured on Node v24.13.1.
 *
 * The rule is fail closed and does not imitate Node's reading (the later of two settings wins, `--no-` turns a flag off):
 *  - R1: any `unhandled-rejections` setting whose mode is exactly `warn`, wherever it is (also when a later one overrides it)
 *  - R2: the name `abort-on-uncaught-exception` anywhere (also `--no-abort-on-uncaught-exception`)
 *  - R3: NODE_OPTIONS names `unhandled-rejections` in a form that cannot be read one way: a quote or a backslash in NODE_OPTIONS
 *    (Node removes them, even inside a name), white space other than a space, a missing mode, a mode Node does not know, or the name
 *    inside a token of another shape
 * A dash and an underscore are the same in a name, as Node reads them; names and modes are compared case-sensitively, as Node does
 * (Node refuses `--UNHANDLED-REJECTIONS` and `WARN` itself and does not start).
 */

const UNHANDLED = "unhandled-rejections";
const ABORT = "abort-on-uncaught-exception";
const MODES: readonly string[] = ["throw", "strict", "warn", "warn-with-error-code", "none"];

/** The name part of an option token with underscores read as dashes (the value after `=` is kept as written). */
function normalizedName(token: string): string {
  const eq = token.indexOf("=");
  return (eq < 0 ? token : token.slice(0, eq)).replaceAll("_", "-");
}

/**
 * The mode of every `unhandled-rejections` setting in `tokens`, or null when one of them cannot be read. With `strict` (NODE_OPTIONS,
 * R3) a token of another shape that contains the name cannot be read either; on the command line Node has already read the options, so
 * such a token is the value of another option (a file name, say) and is left alone.
 */
function unhandledModes(tokens: readonly string[], strict: boolean): string[] | null {
  const modes: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const name = normalizedName(token);
    if (name === `--${UNHANDLED}`) {
      const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : tokens[++i];
      if (value === undefined || !MODES.includes(value)) return null;
      modes.push(value);
    } else if (strict && name.includes(UNHANDLED)) {
      return null;
    }
  }
  return modes;
}

/**
 * The line to refuse with, or null when the options are allowed. `execArgv` is `process.execArgv` (already split by the shell and
 * read by Node); `nodeOptions` is the NODE_OPTIONS environment variable as Node read it at start.
 */
export function refusedNodeOption(execArgv: readonly string[], nodeOptions: string | undefined): string | null {
  const sources: Array<{ where: string; tokens: readonly string[] | null; text: string; strict: boolean }> = [{ where: "the node command line", tokens: execArgv, text: execArgv.join(" ").replace(/["'\\]/g, ""), strict: false }];
  if (nodeOptions !== undefined && nodeOptions !== "") {
    const unreadable = /["'\\]|[^\S ]/.test(nodeOptions);
    sources.push({ where: "NODE_OPTIONS", tokens: unreadable ? null : nodeOptions.split(" ").filter((t) => t !== ""), text: nodeOptions.replace(/["'\\]/g, ""), strict: true });
  }
  for (const s of sources) {
    const text = s.text.replaceAll("_", "-");
    if (text.includes(ABORT)) return `aiqh: refusing to start: ${s.where} names --${ABORT} (an uncaught exception would abort unmasked and leave the checks running; ADR-0024)`;
    if (s.strict && !text.includes(UNHANDLED)) continue;
    const modes = s.tokens === null ? null : unhandledModes(s.tokens, s.strict);
    if (modes === null) return `aiqh: refusing to start: ${s.where} names --${UNHANDLED} in a form that cannot be read one way (ADR-0024)`;
    if (modes.includes("warn")) return `aiqh: refusing to start: ${s.where} sets --${UNHANDLED}=warn (Node would print an unhandled rejection unmasked; ADR-0024)`;
  }
  return null;
}
