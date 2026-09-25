/**
 * Output-boundary guard (M2-2, M2-2-R2-001): with the type checker, every reference in the given files to something that
 * writes to the terminal —
 *  - the global `console` (also through `globalThis`, an alias, destructuring, element access or the `node:console` module)
 *  - `process.stdout` / `process.stderr` (also through an alias of `process`, destructuring, element access or the
 *    `node:process` module)
 *  - an fs write to file descriptor 1 / 2 or to /dev/stdout, /dev/stderr, /dev/fd/1, /dev/fd/2
 * src/output.ts, the boundary itself, is the only module of src/ allowed to have any: every other module prints
 * through createOutput / writeError / COMMANDER_OUTPUT, which escape raw characters and then mask secret shapes.
 * A reference is found by the declaration it resolves to (@types/node), not by its spelling.
 */
import path from "node:path";
import ts from "typescript";
import { where, type Program } from "./typescript.ts";

/** Repository-relative files that may write to the terminal. */
export const OUTPUT_ALLOWED = new Set(["src/output.ts"]);

export interface OutputReference {
  where: string;
  /** "console", "process.stdout", "process.stderr", "import node:console", "fs <api> to <target>". */
  what: string;
}

const NODE_TYPES = /[\\/]@types[\\/]node[\\/]/;
const FS_WRITERS = new Set(["writeSync", "write", "writeFileSync", "writeFile", "appendFileSync", "appendFile", "createWriteStream", "openSync", "open"]);
const STD_PATHS = new Set(["/dev/stdout", "/dev/stderr", "/dev/fd/1", "/dev/fd/2", "/proc/self/fd/1", "/proc/self/fd/2"]);

function resolved(checker: ts.TypeChecker, sym: ts.Symbol | undefined): ts.Symbol | undefined {
  return sym !== undefined && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
}

/** "console" / "process.stdout" / "process.stderr" when `sym` is one of them as declared by @types/node, else null. */
function terminalSymbol(sym: ts.Symbol | undefined): string | null {
  if (sym === undefined) return null;
  const files = (sym.declarations ?? []).map((d) => d.getSourceFile().fileName);
  if (!files.some((f) => NODE_TYPES.test(f))) return null;
  if (sym.name === "console" && files.some((f) => /[\\/](globals|console)\.d\.ts$/.test(f))) return "console";
  if ((sym.name === "stdout" || sym.name === "stderr") && files.some((f) => /[\\/]process\.d\.ts$/.test(f))) return `process.${sym.name}`;
  return null;
}

/** The fs function a call resolves to (declared in @types/node fs), or null. */
function fsWriter(checker: ts.TypeChecker, call: ts.CallExpression): string | null {
  const decl = checker.getResolvedSignature(call)?.getDeclaration();
  if (decl === undefined || !/[\\/]@types[\\/]node[\\/]fs(\.d\.ts|[\\/]promises\.d\.ts)$/.test(decl.getSourceFile().fileName)) return null;
  let fn: ts.Node | undefined = decl;
  while (fn !== undefined && !(ts.isFunctionDeclaration(fn) && fn.name !== undefined)) fn = fn.parent;
  const name = fn !== undefined && ts.isFunctionDeclaration(fn) && fn.name !== undefined ? fn.name.text : "";
  return FS_WRITERS.has(name) ? name : null;
}

/** The terminal target of an fs call's first argument, by its type: fd 1 / 2 or a /dev path. */
function stdTarget(checker: ts.TypeChecker, arg: ts.Expression | undefined): string | null {
  if (arg === undefined) return null;
  const t = checker.getTypeAtLocation(arg);
  if (t.isNumberLiteral() && (t.value === 1 || t.value === 2)) return `fd ${t.value}`;
  if (t.isStringLiteral() && STD_PATHS.has(t.value)) return t.value;
  return null;
}

export function outputReferences(p: Program, files: readonly ts.SourceFile[]): OutputReference[] {
  const { checker } = p;
  const out: OutputReference[] = [];
  const seen = new Set<string>();
  const add = (sf: ts.SourceFile, n: ts.Node, what: string): void => {
    const at = where(p, sf, n);
    const key = `${at} ${what} ${n.pos}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ where: at, what });
  };
  for (const sf of files) {
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && (n.moduleSpecifier.text === "console" || n.moduleSpecifier.text === "node:console")) {
        add(sf, n, "import node:console");
      }
      if (ts.isIdentifier(n)) {
        const what = terminalSymbol(resolved(checker, checker.getSymbolAtLocation(n)));
        if (what !== null) add(sf, n, what);
      }
      // process["stdout"], console["log"]: the property named by a string
      if (ts.isElementAccessExpression(n)) {
        const what = terminalSymbol(resolved(checker, checker.getSymbolAtLocation(n.argumentExpression)));
        if (what !== null) add(sf, n, what);
      }
      // const { stdout } = process; const { log } = console — the property the binding takes
      if (ts.isObjectBindingPattern(n)) {
        const init = ts.isVariableDeclaration(n.parent) ? n.parent.initializer : undefined;
        const type = checker.getTypeAtLocation(init ?? n);
        for (const el of n.elements) {
          const key = el.propertyName ?? el.name;
          if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) continue;
          const what = terminalSymbol(resolved(checker, type.getProperty(key.text)));
          if (what !== null) add(sf, el, what);
        }
      }
      if (ts.isCallExpression(n)) {
        const api = fsWriter(checker, n);
        const target = api !== null ? stdTarget(checker, n.arguments[0]) : null;
        if (api !== null && target !== null) add(sf, n, `fs ${api} to ${target}`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/** The references in files that are not allowed to write to the terminal. */
export function outputViolations(p: Program, files: readonly ts.SourceFile[]): OutputReference[] {
  return outputReferences(p, files.filter((sf) => !OUTPUT_ALLOWED.has(p.rel(sf).split(path.sep).join("/"))));
}
