/**
 * Structure tests with the TypeScript type checker (M2-2, M2-1-R3-004 / R3-006): a program over the
 * repository's own files with the options of tsconfig.json, optionally with in-memory fixture files (kept as
 * strings in the tests, so they are neither linted nor type-checked as part of the repository). Text analysis
 * (regular expressions over the source) was bypassed by aliases, quotes and wrappers; the checker resolves
 * types, aliases and declarations instead.
 */
import path from "node:path";
import ts from "typescript";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");

export interface Program {
  program: ts.Program;
  checker: ts.TypeChecker;
  /** Repository-relative path with "/" separators (fixtures: under tests/__fixtures__/). */
  rel: (file: ts.SourceFile) => string;
}

/**
 * A program over the files of tsconfig.json (src, tests, scripts) plus `fixtures` (relative path → source).
 * Fixture paths are resolved against ROOT, so their relative imports reach the real modules.
 */
export function createProgram(fixtures: Record<string, string> = {}): Program {
  const configFile = path.join(ROOT, "tsconfig.json");
  const parsed = ts.getParsedCommandLineOfConfigFile(configFile, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  if (parsed === undefined) throw new Error("tsconfig.json could not be read");
  const virtual = new Map(Object.entries(fixtures).map(([rel, text]) => [path.join(ROOT, rel), text]));
  const host = ts.createCompilerHost(parsed.options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, shouldCreate) => {
    const text = virtual.get(path.resolve(file));
    return text !== undefined ? ts.createSourceFile(file, text, languageVersion, true) : getSourceFile(file, languageVersion, onError, shouldCreate);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (file) => virtual.has(path.resolve(file)) || fileExists(file);
  const readFile = host.readFile.bind(host);
  host.readFile = (file) => virtual.get(path.resolve(file)) ?? readFile(file);
  const program = ts.createProgram({ rootNames: [...parsed.fileNames, ...virtual.keys()], options: parsed.options, host });
  return { program, checker: program.getTypeChecker(), rel: (sf) => path.relative(ROOT, sf.fileName).split(path.sep).join("/") };
}

/** Source files of the program that are the repository's (or fixture) files under `prefix` ("src/", "tests/", …). */
export function filesUnder(p: Program, prefix: string): ts.SourceFile[] {
  return p.program.getSourceFiles().filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes(`${path.sep}node_modules${path.sep}`) && p.rel(sf).startsWith(prefix));
}

/** Type errors of the given files (fixtures must compile: a bypass that does not type-check proves nothing). */
export function typeErrors(p: Program, files: readonly ts.SourceFile[]): string[] {
  return files.flatMap((sf) =>
    [...p.program.getSyntacticDiagnostics(sf), ...p.program.getSemanticDiagnostics(sf)].map((d) => `${p.rel(sf)}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`),
  );
}

/** `file:line` of a node. */
export function where(p: Program, sf: ts.SourceFile, node: ts.Node): string {
  return `${p.rel(sf)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
}

/** The name of the function or variable declaration that encloses `node` ("" at the top level). */
export function ownerName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node; n !== undefined; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) || ts.isMethodDeclaration(n)) && n.name !== undefined && ts.isIdentifier(n.name)) return n.name.text;
  }
  return "";
}
