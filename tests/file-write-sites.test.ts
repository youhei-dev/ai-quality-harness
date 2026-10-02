/**
 * Backlog 9 (ADR-0020): the places of src/ that write the content of a file. A new place fails this test until it is added here, with
 * the way it keeps a forbidden character out of the file (a gate before the write), or the reason it is exempt. The terminal has the
 * structure guard of tests/structure/output-guard.ts; this is the small counterpart for the files. It is an ordinary test, not a
 * structure guard: it does not decide what is allowed, it makes a new write visible.
 * The calls are found by the type checker (the call resolves to a declaration of @types/node fs), not by their spelling.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createProgram, filesUnder, ownerName } from "./structure/typescript.ts";

/** The fs functions that write the content of a file (rename, mkdir, rm and unlink move or remove; they write no content). */
const CONTENT_WRITERS = new Set(["writeFileSync", "appendFileSync", "writeSync", "write", "writeFile", "appendFile", "createWriteStream", "copyFileSync", "copyFile", "cpSync"]);
/** A gate: the text is converted by one of these just before it is written. */
const GATE = /escapeRawCharsAsJson\(|escapeForDisplay\(/;

interface Site {
  where: string;
  gated: boolean;
}

function sites(): Site[] {
  const p = createProgram();
  const out: Site[] = [];
  for (const sf of filesUnder(p, "src/")) {
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const d = p.checker.getResolvedSignature(n)?.getDeclaration();
        if (d !== undefined && /@types[\\/]node[\\/]fs(\.d\.ts|[\\/]promises\.d\.ts)$/.test(d.getSourceFile().fileName)) {
          let f: ts.Node | undefined = d;
          while (f !== undefined && !(ts.isFunctionDeclaration(f) && f.name !== undefined)) f = f.parent;
          const name = f !== undefined && ts.isFunctionDeclaration(f) && f.name !== undefined ? f.name.text : "?";
          if (CONTENT_WRITERS.has(name)) {
            const content = n.arguments[1];
            out.push({ where: `${p.rel(sf)}:${ownerName(n)}:${name}`, gated: content !== undefined && GATE.test(content.getText(sf)) });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out.sort((a, b) => a.where.localeCompare(b.where) || Number(a.gated) - Number(b.gated));
}

describe("backlog 9: the places that write the content of a file", () => {
  const found = sites();
  it("are exactly the known ones", () => {
    expect(found.map((s) => s.where)).toEqual([
      "src/commands/init.ts:runInit:writeFileSync", // aiqh.config.jsonc
      "src/commands/init.ts:runInit:writeFileSync", // .gitignore
      "src/commands/init.ts:runInit:writeFileSync", // package.json
      "src/commands/review-packet.ts:writeTogether:writeFileSync", // the packet and its ZIP
      "src/report/write.ts:writeAtomic:writeFileSync", // latest.json, latest.md, history/<ts>.json
    ]);
  });
  it("keep the forbidden characters out through a gate: the report files and the generated config", () => {
    expect(found.filter((s) => s.gated).map((s) => s.where)).toEqual(["src/commands/init.ts:runInit:writeFileSync", "src/report/write.ts:writeAtomic:writeFileSync"]);
  });
  it("are exempt without a gate only where the content is not ours: a user's own .gitignore and package.json (init), and the packet (review-packet: fail closed, ADR-0014)", () => {
    expect(found.filter((s) => !s.gated).map((s) => s.where)).toEqual(["src/commands/init.ts:runInit:writeFileSync", "src/commands/init.ts:runInit:writeFileSync", "src/commands/review-packet.ts:writeTogether:writeFileSync"]);
  });
});
