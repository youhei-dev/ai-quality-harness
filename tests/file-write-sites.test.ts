/**
 * Backlog 9 (ADR-0020, decision 7): the places of src/ that write the content of a file with one of the Node fs functions listed below,
 * written out one by one. A new place, a removed one or a rewritten content expression fails this test, and a person reads the table
 * again: each row says where the content comes from and what the author says about it (kind `gate`: converted just before the write;
 * `no-gate`: exempt, with the reason; `not-content`: a copy, a stream or a truncate, whose arguments hold no text of ours).
 *
 * What this test guarantees: every call in src/ of a listed fs function (found by the type checker: the call resolves to a declaration
 * of @types/node fs or fs/promises, not by its spelling) is in the table with the exact text of its content argument, so a new write or
 * a changed expression is visible.
 * What it does not guarantee: that the conversion covers all of the content. The kind `gate` is the author's statement and nothing here
 * reads the expression for a conversion; the real CLI tests of backlog 9 read the files back and carry that.
 * A stream is seen as a call, not as a content: every createWriteStream call is a difference of the table, but what is given to the
 * stream's .write() / .end() is not inspected. If such a call appears in src/, a person adds a row to KNOWN and judges the writes to that
 * stream with it (the output guard does not forbid the stream, ADR-0019). A truncate / ftruncate call is a difference too: it has no
 * content argument, but a longer length fills the new part with NUL bytes (U+0000, one of the forbidden characters).
 * It does not see a write that is not a call of a listed function: a FileHandle's methods (fs/promises is outside the allowed modules of
 * the output guard, ADR-0019, asserted below), a shell redirection of a child process, and the fs functions that are neither listed nor
 * in NOT_CONTENT. NOT_CONTENT holds only the functions that were classified in this work (it is not a list of every fs function).
 * It is an ordinary test, not a structure guard: it does not decide what is allowed, it makes a new write visible. The terminal has the
 * structure guard of tests/structure/output-guard.ts. The scenarios below are compiled in memory with the repository's tsconfig.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { outputViolations } from "./structure/output-guard.ts";
import { createProgram, filesUnder, ownerName, typeErrors, type Program } from "./structure/typescript.ts";

/**
 * The fs functions that write bytes to a file or copy a file, and the position of the argument that holds the content (null: the
 * function takes none). `writev` takes an array of buffers. `createWriteStream` writes later, through the stream. `truncate` and
 * `ftruncate` take no content, but a longer length fills the new part with NUL bytes (U+0000 is a forbidden character), so a call is a
 * row to judge, not a function to leave out.
 */
const FS_WRITERS: ReadonlyMap<string, number | null> = new Map([
  ["writeFileSync", 1],
  ["appendFileSync", 1],
  ["writeFile", 1],
  ["appendFile", 1],
  ["writeSync", 1],
  ["write", 1],
  ["writev", 1],
  ["writevSync", 1],
  ["createWriteStream", null],
  ["copyFileSync", null],
  ["copyFile", null],
  ["cp", null],
  ["cpSync", null],
  ["truncate", null],
  ["truncateSync", null],
  ["ftruncate", null],
  ["ftruncateSync", null],
]);

/** The fs functions that change files, were classified in this work and are not listed, and why (not every fs function: a name in neither table is not looked at). */
const NOT_CONTENT: ReadonlyArray<readonly [names: readonly string[], reason: string]> = [
  [["rename", "renameSync", "link", "linkSync", "symlink", "symlinkSync"], "names or moves a file that already exists; it writes no content"],
  [["mkdir", "mkdirSync", "mkdtemp", "mkdtempSync"], "creates a directory"],
  [["rm", "rmSync", "unlink", "unlinkSync"], "removes a file or a directory"],
  [["open", "openSync"], "opens or creates a file and gives a descriptor (or a FileHandle); the write is a later call: a descriptor is written by write / writeSync / writev (listed), a FileHandle is out of src/ (fs/promises is not an allowed module)"],
];

type Kind = "gate" | "no-gate" | "not-content";

interface Site {
  file: string;
  owner: string;
  writer: string;
  /** The exact source text of the content argument; "" for a writer that takes none. */
  content: string;
}

interface Known extends Site {
  kind: Kind;
  note: string;
}

/** The places of src/ that write the content of a file today (the text of `content` is the source as it is written). */
const KNOWN: readonly Known[] = [
  { file: "src/commands/init.ts", owner: "runInit", writer: "writeFileSync", content: "escapeRawCharsAsJson(configText)", kind: "gate", note: "aiqh.config.jsonc: the whole text goes through the JSON escape just before the write" },
  { file: "src/commands/init.ts", owner: "runInit", writer: "writeFileSync", content: "`${current}${sep}${GITIGNORE_LINE}\\n`", kind: "no-gate", note: ".gitignore: the user's own file plus one fixed line (ADR-0020, decision 6)" },
  { file: "src/commands/init.ts", owner: "runInit", writer: "writeFileSync", content: "`${JSON.stringify(pkg, null, indent)}\\n`", kind: "no-gate", note: "package.json: the user's own data written back, not our content (ADR-0020, decision 6)" },
  { file: "src/commands/review-packet.ts", owner: "writeTogether", writer: "writeFileSync", content: "t.data", kind: "no-gate", note: "the packet and its ZIP: a forbidden character stops the packet before it is written (fail closed, ADR-0014)" },
  { file: "src/report/write.ts", owner: "writeAtomic", writer: "writeFileSync", content: 'format === "json" ? escapeRawCharsAsJson(content) : escapeForDisplay(content, "keep")', kind: "gate", note: "latest.json, latest.md, history/<ts>.json, and aiqh history's dashboard.html (format html, the Markdown branch; v0.12.0, ADR-0035): both branches convert at the write (ADR-0020, decision 1)" },
];

const FS_DECLARATIONS = /@types[\\/]node[\\/]fs(\.d\.ts|[\\/]promises\.d\.ts)$/;

const key = (s: Site): string => `${s.file} | ${s.owner} | ${s.writer} | ${s.content}`;

/** The name of the function whose declaration `d` is (an overload, or the function around a nested declaration); "?" for a method. */
function declaredName(d: ts.Node): string {
  let f: ts.Node | undefined = d;
  while (f !== undefined && !(ts.isFunctionDeclaration(f) && f.name !== undefined)) f = f.parent;
  return f !== undefined && ts.isFunctionDeclaration(f) && f.name !== undefined ? f.name.text : "?";
}

/** Every call in `files` of a listed fs function, with the text of its content argument. */
function observe(p: Program, files: readonly ts.SourceFile[]): Site[] {
  const out: Site[] = [];
  for (const sf of files) {
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const d = p.checker.getResolvedSignature(n)?.getDeclaration();
        if (d !== undefined && FS_DECLARATIONS.test(d.getSourceFile().fileName)) {
          const writer = declaredName(d);
          const at = FS_WRITERS.get(writer);
          if (at !== undefined) out.push({ file: p.rel(sf), owner: ownerName(n), writer, content: at === null ? "" : (n.arguments[at]?.getText(sf) ?? "(missing)") });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out.sort((a, b) => key(a).localeCompare(key(b)));
}

/** The rows that were found and are not in the table (added), and the rows of the table that were not found (removed). */
function differences(observed: readonly Site[], known: readonly Site[] = KNOWN): { added: string[]; removed: string[] } {
  const minus = (from: readonly string[], other: readonly string[]): string[] => {
    const rest = [...other];
    return from.filter((x) => {
      const i = rest.indexOf(x);
      if (i < 0) return true;
      rest.splice(i, 1);
      return false;
    });
  };
  return { added: minus(observed.map(key), known.map(key)), removed: minus(known.map(key), observed.map(key)) };
}

/** A scenario: one call of a listed function. The function is imported by its own name; `content` is the text the scan reports. */
interface Case {
  name: string;
  params: string;
  statement: string;
  content: string;
  about: string;
}

const NODE_FS: readonly Case[] = [
  { name: "writeFileSync", params: "f: string, raw: string", statement: 'writeFileSync(f, raw, "utf8");', content: "raw", about: "the content is the second argument" },
  { name: "appendFileSync", params: "f: string, raw: string", statement: "appendFileSync(f, raw);", content: "raw", about: "the content is the second argument" },
  { name: "writeFile", params: "f: string, raw: string", statement: "writeFile(f, raw, () => {});", content: "raw", about: "the content is the second argument" },
  { name: "appendFile", params: "f: string, raw: string", statement: "appendFile(f, raw, () => {});", content: "raw", about: "the content is the second argument" },
  { name: "writeSync", params: "fd: number, raw: string", statement: "writeSync(fd, raw);", content: "raw", about: "the content is the second argument" },
  { name: "write", params: "fd: number, raw: string", statement: "write(fd, raw, () => {});", content: "raw", about: "the content is the second argument" },
  { name: "writev", params: "fd: number, raw: string", statement: "writev(fd, [Buffer.from(raw)], () => {});", content: "[Buffer.from(raw)]", about: "the content is the array of buffers" },
  { name: "writevSync", params: "fd: number, raw: string", statement: "writevSync(fd, [Buffer.from(raw)]);", content: "[Buffer.from(raw)]", about: "the content is the array of buffers" },
  { name: "createWriteStream", params: "f: string", statement: 'createWriteStream(f, { flags: "a" });', content: "", about: "no content: it comes later from the stream" },
  { name: "copyFileSync", params: "f: string, g: string", statement: "copyFileSync(f, g);", content: "", about: "the second argument is the destination" },
  { name: "copyFile", params: "f: string, g: string", statement: "copyFile(f, g, () => {});", content: "", about: "the second argument is the destination" },
  { name: "cp", params: "f: string, g: string", statement: "cp(f, g, () => {});", content: "", about: "the second argument is the destination" },
  { name: "cpSync", params: "f: string, g: string", statement: "cpSync(f, g);", content: "", about: "the second argument is the destination" },
  { name: "truncateSync", params: "f: string", statement: "truncateSync(f, 4096);", content: "", about: "no content: a longer length fills the new part with NUL bytes" },
  { name: "truncate", params: "f: string", statement: "truncate(f, 4096, () => {});", content: "", about: "no content: a longer length fills the new part with NUL bytes" },
  { name: "ftruncateSync", params: "fd: number", statement: "ftruncateSync(fd, 4096);", content: "", about: "no content: a longer length fills the new part with NUL bytes" },
  { name: "ftruncate", params: "fd: number", statement: "ftruncate(fd, 4096, () => {});", content: "", about: "no content: a longer length fills the new part with NUL bytes" },
];
// the same names of node:fs/promises (they return a promise)
const FS_PROMISES: readonly Case[] = [
  { name: "writeFile", params: "f: string, raw: string", statement: "void writeFile(f, raw);", content: "raw", about: "the content is the second argument" },
  { name: "appendFile", params: "f: string, raw: string", statement: "void appendFile(f, raw);", content: "raw", about: "the content is the second argument" },
  { name: "copyFile", params: "f: string, g: string", statement: "void copyFile(f, g);", content: "", about: "the second argument is the destination" },
  { name: "cp", params: "f: string, g: string", statement: "void cp(f, g);", content: "", about: "the second argument is the destination" },
  { name: "truncate", params: "f: string", statement: "void truncate(f, 4096);", content: "", about: "no content: a longer length fills the new part with NUL bytes" },
];

const FIXTURES: Record<string, string> = {};
for (const c of NODE_FS) FIXTURES[`src/__fixture/fs_${c.name}.ts`] = `import { ${c.name} } from "node:fs";\nexport function w(${c.params}): void {\n  ${c.statement}\n}\n`;
for (const c of FS_PROMISES) FIXTURES[`src/__fixture/promises_${c.name}.ts`] = `import { ${c.name} } from "node:fs/promises";\nexport function w(${c.params}): void {\n  ${c.statement}\n}\n`;
// a conversion of part of the content, and a conversion made on another line: the scan records the text and judges neither
FIXTURES["src/__fixture/partial.ts"] = 'import { writeFileSync } from "node:fs";\nimport { escapeRawCharsAsJson } from "../security/raw-chars.ts";\nexport function w(f: string, raw: string, body: string): void {\n  writeFileSync(f, "# " + raw + "\\n" + escapeRawCharsAsJson(body), "utf8");\n}\n';
FIXTURES["src/__fixture/variable.ts"] = 'import { writeFileSync } from "node:fs";\nimport { escapeRawCharsAsJson } from "../security/raw-chars.ts";\nexport function w(f: string, body: string): void {\n  const safe = escapeRawCharsAsJson(body);\n  writeFileSync(f, safe, "utf8");\n}\n';
// the writes that are outside this test: a stream's methods after createWriteStream, and the methods of a FileHandle
FIXTURES["src/__fixture/stream.ts"] = 'import { createWriteStream } from "node:fs";\nexport function s(f: string, raw: string): void {\n  createWriteStream(f).write(raw);\n}\nexport function e(f: string, raw: string): void {\n  createWriteStream(f).end(raw);\n}\n';
FIXTURES["src/__fixture/filehandle.ts"] = 'import { open } from "node:fs/promises";\nexport async function h(f: string, raw: string): Promise<void> {\n  const fh = await open(f, "w");\n  await fh.write(raw);\n  await fh.writeFile(raw);\n  await fh.appendFile(raw);\n  await fh.close();\n}\n';

const real = createProgram();
const found = observe(real, filesUnder(real, "src/"));
// what the scan would find if src/ matched the table; independent of the real scan, so that one change of src/ fails one test only
const today: Site[] = KNOWN.map(({ file, owner, writer, content }) => ({ file, owner, writer, content }));

describe("backlog 9: the places that write the content of a file", () => {
  it("are exactly the known ones: the file, the function, the writer and the text of the content", () => {
    expect(differences(found)).toEqual({ added: [], removed: [] });
  });
  it("have a table that agrees with itself: a not-content row is a writer without a content argument, every other row names its content, every row says why", () => {
    for (const k of KNOWN) {
      expect(FS_WRITERS.has(k.writer), key(k)).toBe(true);
      if (k.kind === "not-content") {
        expect(FS_WRITERS.get(k.writer), key(k)).toBeNull();
        expect(k.content, key(k)).toBe("");
      } else {
        expect(FS_WRITERS.get(k.writer), key(k)).toBe(1);
        expect(k.content, key(k)).not.toBe("");
      }
      expect(k.note.length, key(k)).toBeGreaterThan(0);
    }
  });
  it("list no function as both a writer and a function that writes no content of ours", () => {
    const names = NOT_CONTENT.flatMap(([n]) => n);
    expect(names.filter((n) => FS_WRITERS.has(n))).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
    expect(NOT_CONTENT.every(([, reason]) => reason.length > 0)).toBe(true);
  });
});

describe("backlog 9: what the scan of the write places sees (scenarios compiled in memory)", () => {
  const p = createProgram(FIXTURES);
  const fixtureFiles = filesUnder(p, "src/__fixture/");
  const seen = (name: string): Site[] => observe(p, fixtureFiles.filter((sf) => p.rel(sf) === `src/__fixture/${name}.ts`));

  it("compile (a scenario that does not type-check proves nothing)", () => {
    expect(typeErrors(p, fixtureFiles)).toEqual([]);
  });
  it.each(NODE_FS)("sees $name of node:fs ($about)", ({ name, content }) => {
    expect(seen(`fs_${name}`)).toEqual([{ file: `src/__fixture/fs_${name}.ts`, owner: "w", writer: name, content }]);
  });
  it.each(FS_PROMISES)("sees $name of node:fs/promises ($about)", ({ name, content }) => {
    expect(seen(`promises_${name}`)).toEqual([{ file: `src/__fixture/promises_${name}.ts`, owner: "w", writer: name, content }]);
  });
  it("records a conversion of part of the content as the whole text and judges nothing: a person reads the row", () => {
    expect(seen("partial").map((s) => s.content)).toEqual(['"# " + raw + "\\n" + escapeRawCharsAsJson(body)']);
  });
  it("records a conversion made on another line as the name of the variable: it does not follow the data", () => {
    expect(seen("variable").map((s) => s.content)).toEqual(["safe"]);
  });
  it("sees the createWriteStream call of a stream and not the .write() / .end() calls of the stream: those writes are outside this test", () => {
    expect(seen("stream")).toEqual([
      { file: "src/__fixture/stream.ts", owner: "e", writer: "createWriteStream", content: "" },
      { file: "src/__fixture/stream.ts", owner: "s", writer: "createWriteStream", content: "" },
    ]);
  });
  it("sees nothing of a FileHandle, whose entrance is closed by the output guard (fs/promises is not an allowed module, ADR-0019)", () => {
    expect(seen("filehandle")).toEqual([]);
    const fh = fixtureFiles.filter((sf) => p.rel(sf) === "src/__fixture/filehandle.ts");
    expect(outputViolations(p, fh).map((v) => v.what)).toContain("a built-in module outside the allowlist: node:fs/promises");
  });
  // a new call of these shows as rows of the table (added), whatever is given to the stream or how long the file is made
  it.each([
    { what: "createWriteStream (two calls)", fixture: "stream", rows: 2 },
    { what: "truncateSync", fixture: "fs_truncateSync", rows: 1 },
    { what: "truncate", fixture: "fs_truncate", rows: 1 },
    { what: "ftruncateSync", fixture: "fs_ftruncateSync", rows: 1 },
    { what: "ftruncate", fixture: "fs_ftruncate", rows: 1 },
  ])("shows a new call of $what as added rows of the table and removes none", ({ fixture, rows }) => {
    const sites = seen(fixture);
    expect(sites).toHaveLength(rows);
    expect(differences([...today, ...sites])).toEqual({ added: sites.map(key), removed: [] });
  });
});

describe("backlog 9: a change of the places shows as a difference of the table", () => {
  const first = (): Site => {
    const f = today[0];
    if (f === undefined) throw new Error("the table is empty");
    return f;
  };

  it("a table and a scan that agree have no difference", () => {
    expect(differences(today)).toEqual({ added: [], removed: [] });
  });
  it("a new call of a listed function in a known file is an added row", () => {
    const extra: Site = { file: "src/report/write.ts", owner: "writeAtomic", writer: "writevSync", content: "[Buffer.from(content)]" };
    expect(differences([...today, extra])).toEqual({ added: [key(extra)], removed: [] });
  });
  it("a call that is gone is a removed row", () => {
    expect(differences(today.slice(1))).toEqual({ added: [], removed: [key(first())] });
  });
  it("a rewritten content expression is one removed row and one added row", () => {
    const changed: Site = { ...first(), content: `"# " + ${first().content}` };
    expect(differences([changed, ...today.slice(1)])).toEqual({ added: [key(changed)], removed: [key(first())] });
  });
  it("a second call with the same text as a known row is an added row (the rows are counted)", () => {
    expect(differences([...today, first()])).toEqual({ added: [key(first())], removed: [] });
  });
});
