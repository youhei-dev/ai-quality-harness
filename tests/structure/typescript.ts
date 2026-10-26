/**
 * Structure tests with the TypeScript type checker (M2-2, M2-1-R3-004 / R3-006): a program over the
 * repository's own files with the options of tsconfig.json, optionally with in-memory fixture files (kept as
 * strings in the tests, so they are neither linted nor type-checked as part of the repository). Text analysis
 * (regular expressions over the source) was bypassed by aliases, quotes and wrappers; the checker resolves
 * types, aliases and declarations instead.
 */
import { createHash } from "node:crypto";
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
 * The SourceFiles read from disk are reused within this process when their key is the same (`reuse: false` parses every file anew;
 * see REUSED). `configFile`: another tsconfig.json (the tests of the reuse). `onHost`: sees the host before the program is made (the
 * same tests).
 */
export function createProgram(fixtures: Record<string, string> = {}, opts: { reuse?: boolean; configFile?: string; onHost?: (host: ts.CompilerHost) => void } = {}): Program {
  const configFile = opts.configFile ?? path.join(ROOT, "tsconfig.json");
  const parsed = ts.getParsedCommandLineOfConfigFile(configFile, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  if (parsed === undefined) throw new Error("tsconfig.json could not be read");
  const virtual = new Map(Object.entries(fixtures).map(([rel, text]) => [path.join(ROOT, rel), text]));
  const host = ts.createCompilerHost(parsed.options, true);
  const getSourceFile = opts.reuse === false ? host.getSourceFile.bind(host) : reusing(host, parsed.options);
  host.getSourceFile = (file, languageVersion, onError, shouldCreate) => {
    const text = virtual.get(path.resolve(file));
    return text !== undefined ? ts.createSourceFile(file, text, languageVersion, true) : getSourceFile(file, languageVersion, onError, shouldCreate);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (file) => virtual.has(path.resolve(file)) || fileExists(file);
  const readFile = host.readFile.bind(host);
  host.readFile = (file) => virtual.get(path.resolve(file)) ?? readFile(file);
  opts.onHost?.(host);
  const program = ts.createProgram({ rootNames: [...parsed.fileNames, ...virtual.keys()], options: parsed.options, host });
  return { program, checker: program.getTypeChecker(), rel: (sf) => path.relative(ROOT, sf.fileName).split(path.sep).join("/") };
}

/**
 * Item 50 (v0.15.1; batch2 design, final, §1.6, 50-B): the SourceFiles read from disk, reused by the next programs of this process
 * (a test file runs in one process; nothing is shared between test files). A program over the repository parses about 600 files;
 * the reused ones are only checked. A SourceFile is reused only when all of its key is the same: the resolved path, the SHA-256 of
 * the text read now (so a file changed on disk is parsed anew), every parse condition TypeScript passes (languageVersion,
 * impliedNodeFormat, jsDocParsingMode, whether there is a setExternalModuleIndicator, packageJsonLocations, and packageJsonScope as
 * its directory and the SHA-256 of its package.json; parent nodes are always set here) and the compiler options that affect a
 * SourceFile or its binding (the list TypeScript's language service keys on when it shares SourceFiles between programs:
 * sourceFileAffectingCompilerOptions). v0.16.0 (B2-I151-R1-001): the package.json values are not read by the parse (the program writes
 * them onto the SourceFile after getSourceFile), and setExternalModuleIndicator is made from the options of the key and the file's
 * impliedNodeFormat (typescript.js 5.9.3: getCreateSourceFileOptions, getSetExternalModuleIndicator); still, the values are in the
 * key, and before a SourceFile is handed out again the indicator of these conditions is computed for it once more and must be the one
 * it has (otherwise the host parses it, and the table keeps the old one).
 * Not reused (the host's own getSourceFile, as without the table): shouldCreateNewSourceFile, a parse condition or an option value it
 * does not know or of a shape it does not know, a text it cannot read. Fixtures never enter the table. Before a SourceFile is handed
 * out again, its text must still be the text read now; otherwise it is dropped and parsed anew. The table never leaves this module.
 * Known limit: a caller that changes the nodes of a shared SourceFile (not its text) is not noticed. TypeScript itself writes to the
 * nodes when it binds them, so they cannot be frozen, and checking every node of about 600 files for each program would cost most of
 * what the reuse saves. The callers (the structure guards and their tests) only read; a test that changes an AST passes `reuse: false`.
 */
const REUSED = new Map<string, ts.SourceFile>();
const PARSE_KEYS = new Set(["languageVersion", "impliedNodeFormat", "setExternalModuleIndicator", "jsDocParsingMode", "packageJsonLocations", "packageJsonScope"]);
const AFFECTING = ["target", "module", "jsx", "importHelpers", "alwaysStrict", "noFallthroughCasesInSwitch", "moduleResolution", "jsxImportSource", "allowUnusedLabels", "allowUnreachableCode", "moduleDetection"] as const;

function reusing(host: ts.CompilerHost, options: ts.CompilerOptions): ts.CompilerHost["getSourceFile"] {
  const own = host.getSourceFile.bind(host);
  const read = host.readFile.bind(host);
  const values = AFFECTING.map((k) => options[k] ?? null);
  const optionsKey = values.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)) ? JSON.stringify(values) : null;
  return (file, languageVersion, onError, shouldCreate) => {
    const condition = conditionOf(languageVersion);
    if (shouldCreate === true || condition === null || optionsKey === null) return own(file, languageVersion, onError, shouldCreate);
    let text: string | undefined;
    try {
      text = read(file);
    } catch {
      return own(file, languageVersion, onError, shouldCreate);
    }
    if (text === undefined) return undefined;
    const key = JSON.stringify([path.resolve(file), createHash("sha256").update(text).digest("hex"), condition, optionsKey]);
    const known = REUSED.get(key);
    if (known !== undefined && known.text === text) return sameModuleIndicator(known, languageVersion) ? known : own(file, languageVersion, onError, shouldCreate);
    const sf = ts.createSourceFile(file, text, languageVersion, true);
    REUSED.set(key, sf);
    return sf;
  };
}

/** The parse conditions as a key, or null when they hold a field this table does not know or a value of a shape it does not know. */
function conditionOf(v: ts.ScriptTarget | ts.CreateSourceFileOptions): string | null {
  if (typeof v === "number") return JSON.stringify([v]);
  if (typeof v !== "object" || v === null || Object.keys(v).some((k) => !PARSE_KEYS.has(k))) return null;
  const { languageVersion, impliedNodeFormat, jsDocParsingMode, setExternalModuleIndicator } = v;
  const { packageJsonLocations, packageJsonScope } = v as { packageJsonLocations?: unknown; packageJsonScope?: unknown };
  if (typeof languageVersion !== "number" || !["number", "undefined"].includes(typeof impliedNodeFormat) || !["number", "undefined"].includes(typeof jsDocParsingMode)) return null;
  if (!["function", "undefined"].includes(typeof setExternalModuleIndicator)) return null;
  if (packageJsonLocations !== undefined && !(Array.isArray(packageJsonLocations) && packageJsonLocations.every((l) => typeof l === "string"))) return null;
  const scope = scopeOf(packageJsonScope);
  if (scope === null) return null;
  return JSON.stringify([languageVersion, impliedNodeFormat ?? null, jsDocParsingMode ?? null, setExternalModuleIndicator !== undefined, packageJsonLocations ?? null, scope]);
}

/** packageJsonScope as its directory and the SHA-256 of its package.json, [] without a scope, or null for a shape it does not know. */
function scopeOf(scope: unknown): unknown[] | null {
  if (scope === undefined) return [];
  if (typeof scope !== "object" || scope === null) return null;
  const { packageDirectory, contents } = scope as { packageDirectory?: unknown; contents?: { packageJsonContent?: unknown } };
  const content = contents?.packageJsonContent;
  if (typeof packageDirectory !== "string" || typeof content !== "object" || content === null) return null;
  try {
    return [path.resolve(packageDirectory), createHash("sha256").update(JSON.stringify(content)).digest("hex")];
  } catch {
    return null;
  }
}

/**
 * Whether the setExternalModuleIndicator of these conditions gives `known` the externalModuleIndicator it has (true without one: the
 * key then holds that there is none). It is computed on an object over `known`, so `known` does not change; the package.json scope
 * that a program wrote onto `known` is hidden, as it is not there yet when a file is parsed.
 */
function sameModuleIndicator(known: ts.SourceFile, v: ts.ScriptTarget | ts.CreateSourceFileOptions): boolean {
  if (typeof v !== "object" || v.setExternalModuleIndicator === undefined) return true;
  const probe = Object.create(known) as ts.SourceFile & { packageJsonScope?: unknown; externalModuleIndicator?: unknown };
  probe.packageJsonScope = undefined;
  if (v.impliedNodeFormat !== undefined) probe.impliedNodeFormat = v.impliedNodeFormat;
  v.setExternalModuleIndicator(probe);
  return probe.externalModuleIndicator === (known as ts.SourceFile & { externalModuleIndicator?: unknown }).externalModuleIndicator;
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

/**
 * The name of the outermost declaration (a direct child of the file: a function, a class or a variable) that encloses `node`, "" when
 * there is none. Authorizations (a writer, a creator of a brand) use this, not ownerName: a declaration of the same name that is
 * nested in another declaration (a local const, a method) is not the top-level one (M2-2-BUILTIN-R3-002).
 */
export function topOwnerName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node; n !== undefined; n = n.parent) {
    if (n.parent === undefined || !ts.isSourceFile(n.parent)) continue;
    if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) return n.name?.text ?? "";
    if (ts.isVariableStatement(n)) {
      const d = n.declarationList.declarations.find((x) => x.pos <= node.pos && node.end <= x.end);
      return d !== undefined && ts.isIdentifier(d.name) ? d.name.text : "";
    }
    return "";
  }
  return "";
}

/** The name of the function or variable declaration that encloses `node` ("" at the top level). */
export function ownerName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node; n !== undefined; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) || ts.isMethodDeclaration(n)) && n.name !== undefined && ts.isIdentifier(n.name)) return n.name.text;
  }
  return "";
}
