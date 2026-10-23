/**
 * The words of a command line, read without running it (appendix A of the batch1 design, final; item 45, v0.14.0). Used by the
 * node:test detection of `aiqh init` (src/adapters/node.ts).
 * - Simple commands end at `;`, `&&`, `||`, `|`, `&` and newlines outside quotes. The `&` of `>&`, `<&` and `&>` is part of a word.
 * - Words end at blanks outside quotes. `'…'` and `"…"` are parts of a word (the quotes are removed); in double quotes `\` escapes only
 *   `"`, `\`, `$` and the backquote; outside quotes `\` takes the next character as it is. Quotes and `\` mark the word: rules look at
 *   unmarked words only (a marked word may mean something else to the shell than its text).
 * - A quote that is not closed: the whole command is not examined (null). `$(`, a backquote, `(`, `)`, `{`, `}` or `<<` outside quotes:
 *   that simple command is not examined (no rule matches it).
 * One pass over the text.
 */

export interface CommandWord {
  /** The word without its quotes and escapes. */
  text: string;
  /** The word had quotes or a `\` escape. */
  marked: boolean;
  /** How many leading characters of `text` came from neither quotes nor an escape. */
  plainLength: number;
}

export interface SimpleCommand {
  words: CommandWord[];
  /** False when the simple command has `$(`, a backquote, `(`, `)`, `{`, `}` or `<<` outside quotes: no rule examines it. */
  examinable: boolean;
}

const BLANKS = " \t\r";
const UNEXAMINED = "`(){}";
const ASSIGNMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The simple commands of a command line (empty ones left out), or null when a quote is not closed. */
export function simpleCommands(command: string): SimpleCommand[] | null {
  const commands: SimpleCommand[] = [];
  let words: CommandWord[] = [];
  let examinable = true;
  let text = "";
  let marked = false;
  let plainLength = -1;
  let inWord = false;
  const mark = (): void => {
    if (plainLength === -1) plainLength = text.length;
    marked = true;
    inWord = true;
  };
  const endWord = (): void => {
    if (inWord) words.push({ text, marked, plainLength: plainLength === -1 ? text.length : plainLength });
    text = "";
    marked = false;
    plainLength = -1;
    inWord = false;
  };
  const endCommand = (): void => {
    endWord();
    if (words.length > 0 || !examinable) commands.push({ words, examinable });
    words = [];
    examinable = true;
  };
  let i = 0;
  while (i < command.length) {
    const c = command[i] ?? "";
    const next = command[i + 1] ?? "";
    if (c === "'" || c === '"') {
      const close = c;
      mark();
      i += 1;
      for (;;) {
        if (i >= command.length) return null;
        const q = command[i] ?? "";
        if (q === close) break;
        if (close === '"' && q === "\\" && i + 1 < command.length && '"\\$`'.includes(command[i + 1] ?? "")) {
          text += command[i + 1];
          i += 2;
          continue;
        }
        text += q;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === "\\") {
      mark();
      text += i + 1 < command.length ? next : c;
      i += 2;
      continue;
    }
    if (BLANKS.includes(c)) {
      endWord();
    } else if (c === "\n" || c === ";") {
      endCommand();
    } else if (c === "|") {
      endCommand();
      if (next === "|") i += 1;
    } else if (c === "&") {
      const previous = command[i - 1] ?? "";
      if (previous === ">" || previous === "<" || next === ">") {
        text += c;
        inWord = true;
      } else {
        endCommand();
        if (next === "&") i += 1;
      }
    } else {
      if (UNEXAMINED.includes(c) || (c === "$" && next === "(") || (c === "<" && next === "<")) examinable = false;
      text += c;
      inWord = true;
    }
    i += 1;
  }
  endCommand();
  return commands;
}

/** The name of an assignment word `NAME=value` (the name and the `=` unmarked; the value may be quoted), or null. */
export function assignmentName(word: CommandWord): string | null {
  const eq = word.text.indexOf("=");
  if (eq === -1 || eq >= word.plainLength) return null;
  const name = word.text.slice(0, eq);
  return ASSIGNMENT_NAME.test(name) ? name : null;
}

/** The words after the leading assignments, and the names of those assignments. */
export function withoutAssignments(words: readonly CommandWord[]): { names: string[]; rest: CommandWord[] } {
  const names: string[] = [];
  let i = 0;
  for (; i < words.length; i += 1) {
    const w = words[i];
    const name = w === undefined ? null : assignmentName(w);
    if (name === null) break;
    names.push(name);
  }
  return { names, rest: words.slice(i) };
}

/** The last path segment of a word (`.venv/bin/pytest` → `pytest`). */
export function lastPathSegment(text: string): string {
  return text.slice(Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\")) + 1);
}
