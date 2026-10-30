/**
 * A `node --test` command, read without running it (item 45, v0.14.0). Moved here from src/adapters/node.ts in v0.18.0 (the batch3
 * design, final, §3.2) so that the rules are in one place for the node:test detection of `aiqh init` and the node:test parser selection.
 */
import { withoutAssignments, type SimpleCommand } from "./command-words.ts";

// node:test (item 45, v0.14.0; the rules of the batch1 design, final, §2.4). Node's options that take a value (the next word, or after
// `=`) and the flags known to go with tests (Node v24 `node --help`): no other option may stand next to `--test` (B1-D-R3-001).
const NODE_VALUE_OPTIONS = new Set(["--import", "--require", "-r", "--loader", "--experimental-loader", "--conditions", "-C", "--env-file", "--input-type", "--test-reporter", "--test-reporter-destination", "--test-name-pattern", "--test-skip-pattern", "--test-concurrency", "--test-timeout", "--test-shard", "--watch-path", "--title"]);
const NODE_KNOWN_FLAGS = new Set([
  "--experimental-strip-types", "--no-strip-types", "--experimental-transform-types", "--experimental-test-coverage", "--experimental-test-module-mocks", "--test-only",
  "--test-force-exit", "--test-update-snapshots", "--enable-source-maps", "--no-warnings", "--no-deprecation", "--trace-warnings", "--trace-deprecation",
  "--trace-uncaught", "--pending-deprecation", "--throw-deprecation", "--experimental-vm-modules", "--experimental-require-module", "--no-experimental-require-module",
  "--no-experimental-detect-module", "--expose-gc", "--preserve-symlinks", "--preserve-symlinks-main", "--frozen-intrinsics",
]);
/** Options whose value is a script body: the words after them are not Node's options. */
const NODE_BODY_OPTIONS = new Set(["-e", "--eval", "-p", "--print"]);
/** Options that read Node's options or the environment from a file aiqh does not read (a watch mode could come in through it). */
const NODE_FILE_OPTIONS = new Set(["--experimental-config-file", "--experimental-default-config-file", "--env-file", "--env-file-if-exists"]);

/** The name of an option word: up to its first `=` (`--name=value`), else the whole word. */
function optionName(text: string): string {
  const eq = text.indexOf("=");
  return eq === -1 ? text : text.slice(0, eq);
}

/** One simple command runs `node` with Node's own `--test` and nothing that could make it watch or read options from elsewhere. */
export function runsNodeTest(command: SimpleCommand): boolean {
  if (!command.examinable) return false;
  const { names, rest } = withoutAssignments(command.words);
  // NODE_OPTIONS can add any option, a watch mode too: not read, refused
  if (names.includes("NODE_OPTIONS")) return false;
  const [position, ...after] = rest;
  if (position === undefined || position.marked || position.text !== "node") return false;
  // Every option-like word after node (also quoted ones, after the script and after `--`: the shell passes "--watch" as --watch)
  for (const w of after) {
    if (!w.text.startsWith("-")) continue;
    const name = optionName(w.text);
    if (name.includes("watch") || NODE_FILE_OPTIONS.has(name)) return false;
  }
  let test = false;
  for (let i = 0; i < after.length; i += 1) {
    const w = after[i];
    if (w === undefined || w.text === "--" || !w.text.startsWith("-")) break;
    const name = optionName(w.text);
    if (NODE_BODY_OPTIONS.has(name)) break;
    const inlineValue = name !== w.text;
    if (NODE_VALUE_OPTIONS.has(name)) {
      if (!inlineValue) {
        // B1-I140-R1-001: the value is the next word; none (the end) or one starting with "-" (also "-" alone) is not read as a
        // value but refused (Node v24.13.1 does not start: "requires an argument", exit 9)
        const value = after[i + 1];
        if (value === undefined || value.text.startsWith("-")) return false;
        i += 1;
      } else if (w.text.length === name.length + 1) {
        // v0.15.0: `--name=` with nothing after the `=` is refused too (Node v24.13.1 does not start: "requires an argument")
        return false;
      }
    } else if (name === "--test" && !inlineValue && !w.marked) {
      test = true;
    } else if (!NODE_KNOWN_FLAGS.has(name) || inlineValue) {
      // an option outside the two lists (Node may not start: "bad option"), a value on a flag, a quoted or valued --test
      return false;
    }
  }
  return test;
}

/** The values of `--test-reporter` and `--test-reporter-destination` of a command that runsNodeTest accepts (in order). */
export function nodeTestReporters(command: SimpleCommand): { reporters: string[]; destinations: string[] } {
  const reporters: string[] = [];
  const destinations: string[] = [];
  const { rest } = withoutAssignments(command.words);
  const after = rest.slice(1);
  for (let i = 0; i < after.length; i += 1) {
    const w = after[i];
    if (w === undefined || w.text === "--" || !w.text.startsWith("-")) break;
    const name = optionName(w.text);
    if (NODE_BODY_OPTIONS.has(name)) break;
    if (!NODE_VALUE_OPTIONS.has(name)) continue;
    const value = name !== w.text ? w.text.slice(name.length + 1) : (after[i + 1]?.text ?? "");
    if (name === w.text) i += 1;
    if (name === "--test-reporter") reporters.push(value);
    if (name === "--test-reporter-destination") destinations.push(value);
  }
  return { reporters, destinations };
}
