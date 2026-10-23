/**
 * Items 45 and 39 (v0.14.0): the words of a command line (appendix A of the batch1 design, final). A command is cut into simple commands
 * at `;`, `&&`, `||`, `|`, `&` and newlines outside quotes (the `&` of `>&`, `<&` and `&>` is part of a word); quotes are removed and
 * `\` escapes one character, and both mark the word. A command with a quote that is not closed is not examined at all; a simple command
 * with `$(`, a backquote, `(`, `)`, `{`, `}` or `<<` outside quotes is not examined. Leading `NAME=value` words are assignments only
 * when the name and the `=` carry no mark.
 */
import { describe, expect, it } from "vitest";
import { assignmentName, simpleCommands, type CommandWord } from "../src/command-words.ts";

const words = (command: string): string[][] | null => simpleCommands(command)?.map((c) => c.words.map((w) => w.text)) ?? null;
const marks = (command: string): boolean[][] | null => simpleCommands(command)?.map((c) => c.words.map((w) => w.marked)) ?? null;
const examinable = (command: string): boolean[] | null => simpleCommands(command)?.map((c) => c.examinable) ?? null;
const word = (command: string): CommandWord => {
  const w = simpleCommands(command)?.[0]?.words[0];
  if (w === undefined) throw new Error(command);
  return w;
};

describe("simple commands: the separators outside quotes", () => {
  it.each([
    ["a; b", [["a"], ["b"]]],
    ["a && b", [["a"], ["b"]]],
    ["a || b", [["a"], ["b"]]],
    ["a | b", [["a"], ["b"]]],
    ["a & b", [["a"], ["b"]]],
    ["a\nb", [["a"], ["b"]]],
    ["a;b&&c||d|e&f", [["a"], ["b"], ["c"], ["d"], ["e"], ["f"]]],
    ["node --test && eslint .", [["node", "--test"], ["eslint", "."]]],
  ])("%j", (command, expected) => {
    expect(words(command)).toEqual(expected);
  });
  it("the & of >&, <& and &> is part of a word (2>&1 does not end the command)", () => {
    expect(words("node --test 2>&1 | tee out.txt")).toEqual([["node", "--test", "2>&1"], ["tee", "out.txt"]]);
    expect(words("a >&2")).toEqual([["a", ">&2"]]);
    expect(words("a <&3")).toEqual([["a", "<&3"]]);
    expect(words("a &> log")).toEqual([["a", "&>", "log"]]);
  });
  it("separators inside quotes are text", () => {
    expect(words(`echo "a;b && c" 'x|y&z'`)).toEqual([["echo", "a;b && c", "x|y&z"]]);
  });
  it("empty simple commands and blank text give no simple command", () => {
    expect(words("")).toEqual([]);
    expect(words("   \t ")).toEqual([]);
    expect(words(";;")).toEqual([]);
    expect(words("a ;; b")).toEqual([["a"], ["b"]]);
  });
  it("tabs and carriage returns are blanks", () => {
    expect(words("a\tb\r\nc")).toEqual([["a", "b"], ["c"]]);
  });
});

describe("words: quotes and backslashes are removed and mark the word", () => {
  it("double and single quotes", () => {
    expect(words(`node "a b" 'c d' e`)).toEqual([["node", "a b", "c d", "e"]]);
    expect(marks(`node "a b" 'c d' e`)).toEqual([[false, true, true, false]]);
  });
  it("quotes in the middle of a word join it", () => {
    expect(words(`a"b"c'd'e`)).toEqual([["abcde"]]);
    expect(marks(`a"b"c'd'e`)).toEqual([[true]]);
  });
  it("an empty quoted word is a word", () => {
    expect(words(`echo ""`)).toEqual([["echo", ""]]);
    expect(marks(`echo ''`)).toEqual([[false, true]]);
  });
  it("a backslash outside quotes takes the next character as it is", () => {
    expect(words("node \\--test")).toEqual([["node", "--test"]]);
    expect(marks("node \\--test")).toEqual([[false, true]]);
    expect(words("a\\ b c")).toEqual([["a b", "c"]]);
    expect(words("a\\;b")).toEqual([["a;b"]]);
  });
  it("in double quotes a backslash escapes only \" \\ $ and the backquote; in single quotes it is text", () => {
    expect(words(`"a\\"b" "c\\d" 'e\\f'`)).toEqual([[`a"b`, "c\\d", "e\\f"]]);
  });
  it("the --test of node -e \"…--test…\" is one marked word", () => {
    expect(words(`node -e "console.log('--test')"`)).toEqual([["node", "-e", "console.log('--test')"]]);
    expect(marks(`node -e "console.log('--test')"`)).toEqual([[false, false, true]]);
  });
});

describe("forms that are not examined", () => {
  it.each([`node --test "x`, `echo 'a`, `node --test "a" "b`])("an unclosed quote: the whole command (%j)", (command) => {
    expect(simpleCommands(command)).toBeNull();
  });
  it.each([
    ["$(echo node) --test", [false]],
    ["`which node` --test", [false]],
    ["(cd a && pytest -q)", [false, false]],
    ["{ pytest -q; }", [false, false]],
    ["cat <<EOF", [false]],
    ["echo ${HOME}", [false]],
    ["eslint . && $(x)", [true, false]],
  ])("%j", (command, expected) => {
    expect(examinable(command)).toEqual(expected);
  });
  it("the same characters inside quotes or after a backslash do not stop the examination", () => {
    expect(examinable(`echo '$(x)' "{a}" \\(b\\)`)).toEqual([true]);
  });
});

describe("assignments (the environment prefix)", () => {
  it.each([
    ["VAR=1", "VAR"],
    ["A_1=", "A_1"],
    ["_x=y", "_x"],
    [`A="x y"`, "A"],
    [`NODE_OPTIONS='--watch'`, "NODE_OPTIONS"],
  ])("%j is an assignment of %j", (text, name) => {
    expect(assignmentName(word(text))).toBe(name);
  });
  it.each([`"A"=1`, "A\\=1", "1A=x", "=x", "A-B=1", "--x=1", "plain"])("%j is not an assignment", (text) => {
    expect(assignmentName(word(text))).toBeNull();
  });
});
