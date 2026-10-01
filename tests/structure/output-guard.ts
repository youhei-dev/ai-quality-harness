/**
 * Output-boundary guard (M2-2, M2-2-R2-001, M2-2-R3-003): with the type checker, every way in the given files to reach
 * the terminal —
 *  - the global `console` (also through `globalThis`, an alias, destructuring, element access or the `node:console` module)
 *  - `process.stdout` / `process.stderr` (also through an alias of `process`, destructuring, element access or the
 *    `node:process` module)
 *  - an object from which the terminal is one property away — `process`, `globalThis` / `global`, the `node:process`
 *    module — used in any other way than reading a property by its name (R3-003): an element access whose key is not
 *    written in the source as a string literal (`process[key]`, `globalThis[key]`: a type is not the value at run time,
 *    so whatever the key's type says, M2-2-BUILTIN-R2-001), a literal key that names the terminal, a member of
 *    PROCESS_MEMBERS, `eval`, `Function`, `require` or `createRequire`, passing it to a function (`Reflect.get(process, …)`,
 *    `Object.getOwnPropertyDescriptor(globalThis, …)`), a type assertion (`process as any`), an alias, a spread,
 *    destructuring with a computed key or a rest element (a value that is discarded, such as the result of
 *    `process.on(…)`, is not a use)
 *  - code the checker cannot see: `Function` (`new Function`, `Function()`, and a call of a value typed `Function`, such
 *    as a function's `constructor`), a read of `.constructor` and a call of a value typed `any` (nothing is checked about
 *    what it calls), `eval`, `require`, `createRequire`, `import()` of a module that is not a string
 *    literal, `node:vm`
 *  - a file descriptor: an fs write whose target is a number, or can be one in any branch of its type (a union, an
 *    intersection, a type parameter's constraint: `string | number`, `PathOrFileDescriptor`; M2-2-BUILTIN-R4-001), `any`,
 *    or an expression whose static type was set by an assertion / `satisfies` (parentheses and `!` alone are not one:
 *    M2-2-BUILTIN-R4-005; a number shown as a `string` by a plain annotation is not seen: M2-2-BUILTIN-R3-005, ADR-0019),
 *    and an `fd` option passed to any call (an argument whose type has an `fd` property in any branch — an object literal,
 *    a variable, a spread — or a computed `fd` name: M2-2-BUILTIN-R4-002); an fs call with an argument whose keys are not
 *    known (a string index signature, a computed name that is not written as a string: rule K, fs calls only); a `/dev/…`
 *    or `/proc/…` path (a literal, or any literal branch of the type; also spelled `/./dev/…`, `//dev/…`, `/x/../dev/…` or
 *    `../../dev/…`) in the first argument of an fs writer (the path or fd; the rest is data and options) and in every argument
 *    of any other fs function (M2-2-BUILTIN-R3-008)
 *  - a child process whose stdio is not written in the source as "pipe" / "ignore" for every stream (inherit, a descriptor,
 *    a stream, a value that only its type says is "pipe", a spread or a computed name after `stdio` that can override it,
 *    or left to Node's default where that passes the terminal through: spawn, spawnSync, execFileSync, execSync, fork).
 *    A wrapper that changes only the static type (`as const`, `satisfies`, `!`, parentheses) is looked through, also on
 *    the options object (M2-2-BUILTIN-R4-004, R4-005)
 *  - an fs / child_process function (fs/promises too) used other than as the callee of a call (M2-2-BUILTIN-R3-006): a copy
 *    typed as another function, `.call` / `.apply` / `Reflect.apply`, a value in an object, and the function taken by an
 *    element access (`fs["writeFileSync"]`) or a destructuring of the module (M2-2-BUILTIN-R4-003). The call rules above see
 *    only a call that resolves to the @types/node declaration
 *  - a module that is not in the allowlist (backlog 1, M2-2-R4-002, ADR-0019): every module a file loads at run time (an import or
 *    `export … from` that is not `import type` / `export type`, and `import()` of a string literal) must be a built-in
 *    of BUILTIN_ALLOWED (written with `node:`), a source file of src/ in the program, or a runtime dependency of
 *    package.json. A built-in without `node:`, a URL (`data:` …) and a file that is not a source file of src/ (a `.mjs`
 *    file, a declaration file, a file outside src/, or one that does not resolve) are violations
 *  - the members of `process` that reach the terminal or another program without a module (PROCESS_MEMBERS:
 *    getBuiltinModule, dlopen, report, emitWarning, execve, stdin, …), found by their declaration like the terminal
 * In src/, only the two writers of src/output.ts (`emitOut`, `emitErr`: top-level declarations, not a local declaration of the
 * same name) may reach the terminal, only as the calls of WRITER_CALLS (`console.log` / `process.stdout.write` for emitOut,
 * `console.error` / `process.stderr.write` for emitErr), with one argument whose type is `Safe` in every branch (M2-2-BUILTIN-R3-001,
 * R3-002). Only safeText / safeJson (top-level declarations) create a `Safe` string: a type assertion to it anywhere else, a
 * type predicate for it and an `any` value where it is expected are violations, and so is a type assertion to a type parameter
 * (or to a union / intersection with one: `as T | undefined`, `NonNullable<T>`) unless a required parameter of the function
 * (no default, not rest) is of type T itself, for each such type parameter (M2-2-BUILTIN-R3-003, R4).
 * A reference is found by the declaration it resolves to (@types/node, the TypeScript library), not by its spelling.
 * ADR-0019, decision 7: a permission rests on the syntax (a string literal; a wrapper that changes only the static type is
 * looked through for stdio and `.constructor`), on the name of a top-level declaration, or on the resolution of a reference to
 * a declaration. Of the static types only two are a ground for a permission (the writer's argument, `Safe` in every branch;
 * the carrier of a generic cast, a parameter of type T itself); every other use of a type is to find a violation, and a type
 * is taken apart into the branches of a union / intersection and the constraint of a type parameter (any one dangerous branch
 * is a violation). What still rests on a static type (the fd target shown as a string by a plain annotation, a conditional or
 * mapped type in a generic cast) is a known limit and is listed in the ADR. The ADR's table covers the permissions that
 * decision 7 concerns, not every permission of this file.
 */
import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import ts from "typescript";
import { starter } from "./process-guard.ts";
import { ROOT, topOwnerName, where, type Program } from "./typescript.ts";

/**
 * The Node built-in modules src/ may load (backlog 1, ADR-0019): exactly the ones src/ uses (a test checks both ways).
 * None of them reaches the terminal except through the rules below (fs: a descriptor or a device path; child_process:
 * stdio). Adding one needs its ways to the terminal and to other programs, and the rules they need, written into
 * ADR-0019 and reviewed independently.
 */
export const BUILTIN_ALLOWED: ReadonlySet<string> = new Set(["node:child_process", "node:crypto", "node:fs", "node:path", "node:string_decoder", "node:zlib"]);
/** The runtime dependencies of package.json (ADR-0008 approves them); src/ may load these packages. */
export const RUNTIME_PACKAGES: ReadonlySet<string> = new Set(Object.keys((JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> }).dependencies ?? {}));
/**
 * Members of `process` that reach the terminal, load code or replace the program, without a module. binding,
 * _linkedBinding and _rawDebug are not declared by @types/node today (a cast is needed, which is a violation already).
 */
export const PROCESS_MEMBERS: ReadonlySet<string> = new Set(["getBuiltinModule", "dlopen", "report", "emitWarning", "execve", "stdin", "binding", "_linkedBinding", "_rawDebug"]);
const PROCESS_TYPES = /[\\/]@types[\\/]node[\\/]process\.d\.ts$/;

/** Repository-relative files that may write to the terminal (only inside WRITERS). */
export const OUTPUT_ALLOWED = new Set(["src/output.ts"]);
/** The two writers of src/output.ts: the only functions of src/ that reach the terminal (R3-003). */
export const WRITERS: ReadonlySet<string> = new Set(["emitOut", "emitErr"]);
/** The terminal calls each writer may make, with exactly one argument that is `Safe` in every branch of its type (M2-2-BUILTIN-R3-001). */
export const WRITER_CALLS: Readonly<Record<string, readonly string[]>> = { emitOut: ["console.log", "process.stdout.write"], emitErr: ["console.error", "process.stderr.write"] };
/** The only functions of src/output.ts that may create a `Safe` string (a type assertion to it). */
export const SAFE_CREATORS: ReadonlySet<string> = new Set(["safeText", "safeJson"]);

export interface OutputReference {
  where: string;
  /** "console", "process.stdout", "process.stderr", "import node:console", "fs <api> to <target>", or the dynamic form. */
  what: string;
}

const NODE_TYPES = /[\\/]@types[\\/]node[\\/]/;
const TS_LIB = /[\\/]typescript[\\/]lib[\\/]lib\.[^\\/]*\.d\.ts$/;
const FS_WRITERS = new Set(["writeSync", "write", "writev", "writevSync", "writeFileSync", "writeFile", "appendFileSync", "appendFile", "createWriteStream", "openSync", "open"]);
/** A device path as written: `/dev/…`, `/proc/…`, or that many `../` up from the working directory (tested after normalizing `.`, `//` and `x/../`). */
const DEVICE_PATH = /^(\/|(\.\.\/)+)(dev|proc)\//;
/** child_process functions whose default stdio (or stderr) is the parent's terminal, so stdio must be given. */
const STDIO_REQUIRED = new Set(["spawn", "spawnSync", "execFileSync", "execSync", "fork"]);
const STDIO_OK = new Set(["pipe", "ignore"]);
const VM_MODULES = new Set(["vm", "node:vm"]);
/** The declaration files of the fs and child_process functions (fs/promises too: `promises.writeFile`). */
const NODE_FUNCTIONS = /[\\/]@types[\\/]node[\\/](fs|child_process|fs[\\/]promises)\.d\.ts$/;
const SAFE_BRAND = /^__@safeBrand@/;

function resolved(checker: ts.TypeChecker, sym: ts.Symbol | undefined): ts.Symbol | undefined {
  return sym !== undefined && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
}

function declaredIn(sym: ts.Symbol | undefined, file: RegExp): boolean {
  return (sym?.declarations ?? []).some((d) => file.test(d.getSourceFile().fileName));
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

/** "process.<name>" when `sym` is one of PROCESS_MEMBERS as declared by @types/node, else null. */
function processMember(sym: ts.Symbol | undefined): string | null {
  if (sym === undefined || !PROCESS_MEMBERS.has(sym.name)) return null;
  return (sym.declarations ?? []).some((d) => PROCESS_TYPES.test(d.getSourceFile().fileName)) ? `process.${sym.name}` : null;
}

/** What is wrong with a module a file loads at run time (see the header), or null. */
function moduleProblem(p: Program, spec: ts.StringLiteralLike): string | null {
  const m = spec.text;
  if (m.startsWith("node:")) return BUILTIN_ALLOWED.has(m) ? null : `a built-in module outside the allowlist: ${m}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(m)) return `a module by URL: ${m.slice(0, 40)}`;
  if (isBuiltin(m)) return `a built-in module without node: ${m}`;
  if (m.startsWith(".") || m.startsWith("/")) {
    const target = p.checker.getSymbolAtLocation(spec)?.valueDeclaration;
    return target !== undefined && ts.isSourceFile(target) && !target.isDeclarationFile && p.rel(target).startsWith("src/") ? null : `a module that is not a source file of src/: ${m.slice(0, 40)}`;
  }
  const name = m.startsWith("@") ? m.split("/").slice(0, 2).join("/") : (m.split("/")[0] ?? m);
  return RUNTIME_PACKAGES.has(name) ? null : `a package that is not a runtime dependency: ${name}`;
}

/** The fs function a call resolves to (declared in @types/node fs or fs/promises), or null. */
function fsFunction(checker: ts.TypeChecker, call: ts.CallExpression): string | null {
  const decl = checker.getResolvedSignature(call)?.getDeclaration();
  if (decl === undefined || !/[\\/]@types[\\/]node[\\/]fs(\.d\.ts|[\\/]promises\.d\.ts)$/.test(decl.getSourceFile().fileName)) return null;
  let fn: ts.Node | undefined = decl;
  while (fn !== undefined && !(ts.isFunctionDeclaration(fn) && fn.name !== undefined)) fn = fn.parent;
  return fn !== undefined && ts.isFunctionDeclaration(fn) && fn.name !== undefined ? fn.name.text : null;
}

/** Whether `node` is written in a type (a type annotation, `typeof x` in a type). */
function inTypePosition(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) {
    if (ts.isTypeNode(n)) return true;
    if (ts.isStatement(n) || ts.isExpression(n)) return false;
  }
  return false;
}

/** Whether an identifier names a declaration, a member or an import rather than referring to a value. */
function nameOnly(id: ts.Identifier): boolean {
  const p = id.parent;
  const named =
    ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) ||
    ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isBindingElement(p) ||
    ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isModuleDeclaration(p);
  if (named && (p as ts.NamedDeclaration).name === id) return true;
  if (ts.isBindingElement(p) && p.propertyName === id) return true;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isNamespaceExport(p)) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return true;
  return ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p);
}

/** The string a key names when it is written as one in the source (a string literal or a template literal without substitutions, in parentheses at most), or null. */
function writtenKey(e: ts.Expression): string | null {
  let x = e;
  while (ts.isParenthesizedExpression(x)) x = x.expression;
  return ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) ? x.text : null;
}

/** The expression without the wrappers that change only the static type (parentheses, `as`, `<T>`, `satisfies`, `!`): the value at run time is the same. */
function unwrapped(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isTypeAssertionExpression(x) || ts.isSatisfiesExpression(x) || ts.isNonNullExpression(x)) x = x.expression;
  return x;
}

/** A string literal type's value, or null. */
function literalKey(checker: ts.TypeChecker, e: ts.Expression): string | null {
  const t = checker.getTypeAtLocation(e);
  return t.isStringLiteral() ? t.value : null;
}

/** Every string literal a value of type `t` can be: a literal, the literal branches of a union / intersection, a type parameter's constraint (M2-2-BUILTIN-R4-001). */
function literalValues(checker: ts.TypeChecker, t: ts.Type): string[] {
  if (t.isStringLiteral()) return [t.value];
  if (t.isUnionOrIntersection()) return t.types.flatMap((x) => literalValues(checker, x));
  const c = t.flags & ts.TypeFlags.TypeParameter ? checker.getBaseConstraintOfType(t) : undefined;
  return c !== undefined ? literalValues(checker, c) : [];
}

/** Whether a value of type `t` can be a number (a file descriptor): a number branch of a union / intersection, or a type parameter's constraint (M2-2-BUILTIN-R4-001). */
function mayBeNumber(checker: ts.TypeChecker, t: ts.Type): boolean {
  if ((t.flags & ts.TypeFlags.NumberLike) !== 0) return true;
  if (t.isUnionOrIntersection()) return t.types.some((x) => mayBeNumber(checker, x));
  const c = t.flags & ts.TypeFlags.TypeParameter ? checker.getBaseConstraintOfType(t) : undefined;
  return c !== undefined && mayBeNumber(checker, c);
}

/** Whether `as`, `<T>` or `satisfies` sets the static type of the expression, through parentheses and `!` (M2-2-BUILTIN-R4-005: those two alone do not). */
function typeWrapped(e: ts.Expression): boolean {
  for (let x = e; ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isTypeAssertionExpression(x) || ts.isSatisfiesExpression(x) || ts.isNonNullExpression(x); x = x.expression) {
    if (!ts.isParenthesizedExpression(x) && !ts.isNonNullExpression(x)) return true;
  }
  return false;
}

function hasSafe(t: ts.Type): boolean {
  if (t.isUnionOrIntersection()) return t.types.some(hasSafe);
  return t.getProperties().some((p) => SAFE_BRAND.test(p.getName()));
}

/** A type that is `Safe` in every branch: a union only when all of its members are (an intersection with a `Safe` is one). */
function allSafe(t: ts.Type): boolean {
  if (t.isUnion()) return t.types.every(allSafe);
  if (t.isIntersection()) return t.types.some(allSafe);
  return t.getProperties().some((p) => SAFE_BRAND.test(p.getName()));
}

/** Whether an argument is an object that has an `fd` property (by its type, or a computed `fd` name in an object literal). */
function hasFdProperty(checker: ts.TypeChecker, a: ts.Expression): boolean {
  const lit = unwrapped(a);
  if (ts.isObjectLiteralExpression(lit) && lit.properties.some((prop) => prop.name !== undefined && ts.isComputedPropertyName(prop.name) && writtenKey(prop.name.expression) === "fd")) return true;
  return fdBranch(checker, checker.getTypeAtLocation(a));
}

/** Whether an argument can hold keys that are not known statically: a string index signature (in any branch), or an object literal with a computed name that is not written as a string (M2-2-BUILTIN-R4-002). */
function openKeys(checker: ts.TypeChecker, a: ts.Expression): boolean {
  const lit = unwrapped(a);
  if (ts.isObjectLiteralExpression(lit) && lit.properties.some((prop) => prop.name !== undefined && ts.isComputedPropertyName(prop.name) && writtenKey(prop.name.expression) === null)) return true;
  const open = (t: ts.Type): boolean => {
    if (t.isUnionOrIntersection()) return t.types.some(open);
    const c = t.flags & ts.TypeFlags.TypeParameter ? checker.getBaseConstraintOfType(t) : undefined;
    return c !== undefined ? open(c) : checker.getIndexInfosOfType(t).some((i) => (i.keyType.flags & ts.TypeFlags.String) !== 0);
  };
  return open(checker.getTypeAtLocation(a));
}

/** Whether a type has an `fd` property, also in a branch of a union / intersection or a type parameter's constraint (M2-2-BUILTIN-R4-002). */
function fdBranch(checker: ts.TypeChecker, t: ts.Type): boolean {
  if (t.isUnionOrIntersection()) return t.types.some((x) => fdBranch(checker, x));
  const c = t.flags & ts.TypeFlags.TypeParameter ? checker.getBaseConstraintOfType(t) : undefined;
  if (c !== undefined) return fdBranch(checker, c);
  return (t.flags & ts.TypeFlags.Object) !== 0 && checker.getPropertyOfType(t, "fd") !== undefined;
}

/** The label of an object from which the terminal is one property away (see the header), or null. */
function holderOf(checker: ts.TypeChecker, cache: Map<ts.Type, boolean>, e: ts.Expression): string | null {
  const t = checker.getNonNullableType(checker.getTypeAtLocation(e));
  let holder = cache.get(t);
  if (holder === undefined) {
    holder = checker.getPropertiesOfType(t).some((prop) => terminalSymbol(resolved(checker, prop)) !== null);
    cache.set(t, holder);
  }
  return holder ? e.getText().replace(/\s+/g, " ").slice(0, 40) : null;
}

/** What is wrong with a child process call's stdio, or null when every stream is "pipe" / "ignore". */
function stdioProblem(api: string, call: ts.CallExpression): string | null {
  const name = api.split(" ")[0] ?? "";
  if (!STDIO_REQUIRED.has(name)) return null;
  const options = [...call.arguments].reverse().map(unwrapped).find(ts.isObjectLiteralExpression);
  const stdio = options?.properties.find((prop): prop is ts.PropertyAssignment => ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && prop.name.text === "stdio");
  if (stdio === undefined) return `child process ${name} without stdio (the default passes the terminal through)`;
  const after = options?.properties.slice(options.properties.indexOf(stdio) + 1) ?? [];
  if (after.some(ts.isSpreadAssignment)) return `child process ${name} with a spread after stdio (it can override stdio)`;
  // a computed name after stdio that is not written as another name can be "stdio" at run time (M2-2-BUILTIN-R4-004)
  if (after.some((prop) => prop.name !== undefined && ts.isComputedPropertyName(prop.name) && (writtenKey(prop.name.expression) ?? "stdio") === "stdio")) return `child process ${name} with a computed name after stdio (it can override stdio)`;
  const init = unwrapped(stdio.initializer);
  const ok = (e: ts.Expression): boolean => STDIO_OK.has(writtenKey(unwrapped(e)) ?? "");
  if (ts.isArrayLiteralExpression(init) ? init.elements.every(ok) : ok(init)) return null;
  return `child process ${name} with stdio ${init.getText().slice(0, 40)}`;
}

interface Found extends OutputReference {
  node: ts.Node;
  file: string;
  /** A reference to console / process.stdout / process.stderr (the only kind a writer may have). */
  terminal: boolean;
}

function scan(p: Program, files: readonly ts.SourceFile[]): Found[] {
  const { checker } = p;
  const out: Found[] = [];
  const seen = new Set<string>();
  const holders = new Map<ts.Type, boolean>();
  for (const sf of files) {
    const file = p.rel(sf).split(path.sep).join("/");
    const add = (n: ts.Node, what: string, terminal = false): void => {
      const at = where(p, sf, n);
      const key = `${at} ${what} ${n.pos}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ where: at, what, node: n, file, terminal });
    };
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const m = n.moduleSpecifier.text;
        if (m === "console" || m === "node:console") add(n, "import node:console");
        if (VM_MODULES.has(m)) add(n, "dynamic code: node:vm");
        // the allowlist (backlog 1): `import type` is erased; `import { type X }` still loads the module
        if (n.importClause?.isTypeOnly !== true) {
          const why = moduleProblem(p, n.moduleSpecifier);
          if (why !== null) add(n, why);
        }
      }
      if (ts.isExportDeclaration(n) && !n.isTypeOnly && n.moduleSpecifier !== undefined && ts.isStringLiteral(n.moduleSpecifier)) {
        const why = moduleProblem(p, n.moduleSpecifier);
        if (why !== null) add(n, why);
      }
      if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) add(n, "dynamic code: import = require()");
      if (ts.isIdentifier(n)) {
        const sym = resolved(checker, checker.getSymbolAtLocation(n));
        const what = terminalSymbol(sym);
        if (what !== null) add(n, what, true);
        const member = inTypePosition(n) ? null : processMember(sym);
        if (member !== null) add(n, member);
        // code the checker cannot see
        if (!inTypePosition(n) && sym !== undefined) {
          if ((sym.name === "Function" || sym.name === "eval") && declaredIn(sym, TS_LIB)) add(n, `dynamic code: ${sym.name}`);
          if ((sym.name === "require" || sym.name === "createRequire") && declaredIn(sym, NODE_TYPES)) add(n, `dynamic code: ${sym.name}`);
        }
      }
      // an fs / child_process function used other than as the callee of a call (a retyped copy, `.call`, `Reflect.apply`, a value in an object) is not seen by the call rules (M2-2-BUILTIN-R3-006):
      // named by an identifier, taken by an element access (`fs["writeFileSync"]`) or by a destructuring of the module (M2-2-BUILTIN-R4-003)
      let fnRef: ts.Node | undefined;
      let fnSym: ts.Symbol | undefined;
      if (ts.isIdentifier(n) && !inTypePosition(n) && !ts.isImportSpecifier(n.parent) && !ts.isExportSpecifier(n.parent)) {
        fnRef = ts.isPropertyAccessExpression(n.parent) && n.parent.name === n ? n.parent : n;
        fnSym = checker.getSymbolAtLocation(n);
      } else if (ts.isElementAccessExpression(n) && !inTypePosition(n)) {
        fnRef = n;
        fnSym = checker.getSymbolAtLocation(n.argumentExpression);
      } else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent) && ts.isVariableDeclaration(n.parent.parent) && n.parent.parent.initializer !== undefined) {
        const key = n.propertyName ?? n.name;
        fnRef = n;
        fnSym = ts.isIdentifier(key) || ts.isStringLiteral(key) ? checker.getTypeAtLocation(n.parent.parent.initializer).getProperty(key.text) : undefined;
      }
      const fnDecl = resolved(checker, fnSym)?.declarations?.find(ts.isFunctionDeclaration);
      if (fnRef !== undefined && fnDecl !== undefined && NODE_FUNCTIONS.test(fnDecl.getSourceFile().fileName)) {
        let ref: ts.Node = fnRef;
        while (ts.isParenthesizedExpression(ref.parent)) ref = ref.parent;
        if (!(ts.isCallExpression(ref.parent) && ref.parent.expression === ref)) add(n, `an ${fnDecl.name?.text ?? "fs"} function of fs / child_process used other than as the callee of a call`);
      }
      // process["stdout"], console["log"]: the property named by a string
      if (ts.isElementAccessExpression(n)) {
        const keySym = resolved(checker, checker.getSymbolAtLocation(n.argumentExpression));
        const what = terminalSymbol(keySym);
        if (what !== null) add(n, what, true);
        const member = processMember(keySym);
        if (member !== null) add(n, member);
      }
      // const { stdout } = process; const { log } = console — the property the binding takes
      if (ts.isObjectBindingPattern(n)) {
        const init = ts.isVariableDeclaration(n.parent) ? n.parent.initializer : undefined;
        const type = checker.getTypeAtLocation(init ?? n);
        for (const el of n.elements) {
          const key = el.propertyName ?? el.name;
          if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) continue;
          const prop = resolved(checker, type.getProperty(key.text));
          const what = terminalSymbol(prop);
          if (what !== null) add(el, what, true);
          const member = processMember(prop);
          if (member !== null) add(el, member);
        }
      }
      // `x.constructor` reaches Function without naming it (a cast of it hides the call from the Function rule)
      if ((ts.isPropertyAccessExpression(n) && n.name.text === "constructor") || (ts.isElementAccessExpression(n) && writtenKey(unwrapped(n.argumentExpression)) === "constructor")) add(n, "dynamic code: constructor");
      // process, globalThis, the node:process module: only `x.name` (R3-003)
      if (ts.isExpression(n) && !ts.isParenthesizedExpression(n.parent) && !inTypePosition(n) && !(ts.isIdentifier(n) && nameOnly(n))) {
        const holder = holderOf(checker, holders, n);
        if (holder !== null) {
          const parent = n.parent;
          if ((ts.isPropertyAccessExpression(parent) && parent.expression === n) || ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) {
            // reading a property by its name (the name itself is checked above), or a value that is discarded
            // (`process.on(…)` returns process)
          } else if (ts.isElementAccessExpression(parent) && parent.expression === n) {
            // only a key written in the source as a string literal is safe: a type does not promise the value at run time
            // (M2-2-BUILTIN-R2-001). A key whose type is one string literal (a const, `as const`, a parameter, a narrowed union,
            // …) that names a member of PROCESS_MEMBERS is still reported by the member's name (M2-2-BUILTIN-R1-001)
            const written = writtenKey(parent.argumentExpression);
            const key = written ?? literalKey(checker, parent.argumentExpression);
            const prop = key === null ? undefined : resolved(checker, checker.getNonNullableType(checker.getTypeAtLocation(n)).getProperty(key));
            const member = processMember(prop);
            if (prop !== undefined && !inTypePosition(n) && (((prop.name === "Function" || prop.name === "eval") && declaredIn(prop, TS_LIB)) || ((prop.name === "require" || prop.name === "createRequire") && declaredIn(prop, NODE_TYPES)))) add(parent, `dynamic code: ${prop.name}`);
            if (member !== null) add(parent, member);
            else if (written === null || prop === undefined || terminalSymbol(prop) !== null) add(parent, `dynamic access to ${holder}`);
          } else if (ts.isVariableDeclaration(parent) && parent.initializer === n && ts.isObjectBindingPattern(parent.name)) {
            for (const el of parent.name.elements) {
              const key = el.propertyName ?? el.name;
              if (el.dotDotDotToken !== undefined || !(ts.isIdentifier(key) || ts.isStringLiteral(key))) add(el, `destructuring of ${holder} with a computed key or a rest element`);
            }
          } else {
            add(n, `${holder} used as a value (${ts.SyntaxKind[parent.kind]})`);
          }
        }
      }
      if (ts.isCallExpression(n)) {
        // import() of a module that is not a string literal; import("node:vm")
        if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const spec = n.arguments[0];
          if (spec === undefined || !(ts.isStringLiteral(spec) || ts.isNoSubstitutionTemplateLiteral(spec))) add(n, "dynamic code: import() of a computed module");
          else {
            if (VM_MODULES.has(spec.text)) add(n, "dynamic code: node:vm");
            const why = moduleProblem(p, spec);
            if (why !== null) add(n, why);
          }
        }
        // a call of a value typed `any`: nothing is checked about what it calls (a cast of fs / child_process / Function to any)
        if (n.expression.kind !== ts.SyntaxKind.ImportKeyword && (checker.getTypeAtLocation(n.expression).flags & ts.TypeFlags.Any) !== 0) add(n, "a call of an untyped (any) value");
        // a call of a value typed Function (a function's `constructor`): an untyped call that can run a string
        const callee = checker.getTypeAtLocation(n.expression).getSymbol();
        if (callee?.name === "Function" && declaredIn(callee, TS_LIB)) add(n, "dynamic code: a call of a value typed Function");
        const fs = fsFunction(checker, n);
        if (fs !== null) {
          const first = n.arguments[0];
          const t = first === undefined ? undefined : checker.getTypeAtLocation(first);
          // a target whose static type was set by an assertion or `satisfies` says nothing about the run-time value (a number fd shown as a string)
          if (FS_WRITERS.has(fs) && first !== undefined && typeWrapped(first) && !ts.isStringLiteralLike(unwrapped(first))) add(n, `fs ${fs} to a target whose type was set by an assertion`);
          if (FS_WRITERS.has(fs) && t !== undefined && (t.flags & ts.TypeFlags.Any) !== 0) add(n, `fs ${fs} to an untyped (any) target`);
          if (FS_WRITERS.has(fs) && t !== undefined && (t.flags & ts.TypeFlags.NumberLike) !== 0) add(n, t.isNumberLiteral() ? `fs ${fs} to fd ${t.value}` : `fs ${fs} to a file descriptor`);
          else if (FS_WRITERS.has(fs) && t !== undefined && mayBeNumber(checker, t)) add(n, `fs ${fs} to a target that can be a file descriptor`);
          // the writers take the path (or fd) as the first argument; the rest is data and options. Every other fs function: all arguments
          for (const a of FS_WRITERS.has(fs) ? n.arguments.slice(0, 1) : n.arguments) {
            for (const v of literalValues(checker, checker.getTypeAtLocation(a))) if (DEVICE_PATH.test(path.posix.normalize(v))) add(n, `fs ${fs} to ${v}`);
          }
          // an options object whose keys are not known can hold `fd` (fs calls only: src/ passes records to other calls, e.g. JSON.stringify)
          if (n.arguments.some((a) => openKeys(checker, a))) add(n, `fs ${fs} with an argument whose keys are not known (it can hold fd)`);
        }
        const api = starter(checker, n);
        const problem = api === null ? null : stdioProblem(api, n);
        if (problem !== null) add(n, problem);
      }
      // an `fd` option passed to any call or constructor (fs.createWriteStream, net.Socket, …)
      // (the argument's type is used to find it: an object literal, a variable, a spread — anything whose type has an `fd` property; and a computed name)
      if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && (n.arguments ?? []).some((a) => hasFdProperty(checker, a))) {
        add(n, "an fd option");
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

export function outputReferences(p: Program, files: readonly ts.SourceFile[]): OutputReference[] {
  return scan(p, files).map(({ where: at, what }) => ({ where: at, what }));
}

/**
 * Whether a terminal reference is a write of the writers: `console.log(text)` / `process.stdout.write(text)` inside
 * emitOut / emitErr of src/output.ts, every argument of type `Safe`.
 */
function writerCall(checker: ts.TypeChecker, f: Found): boolean {
  const allowed = WRITER_CALLS[topOwnerName(f.node)];
  if (!OUTPUT_ALLOWED.has(f.file) || allowed === undefined) return false;
  let target: ts.Node = f.node;
  if (ts.isPropertyAccessExpression(target.parent) && target.parent.name === target) target = target.parent;
  const member = target.parent;
  const call = member.parent;
  if (!ts.isPropertyAccessExpression(member) || member.expression !== target || !ts.isCallExpression(call) || call.expression !== member) return false;
  const first = call.arguments[0];
  return allowed.includes(member.getText().replace(/\s+/g, "")) && call.arguments.length === 1 && first !== undefined && allSafe(checker.getTypeAtLocation(first));
}

/** A type assertion to a type parameter that no parameter of the enclosing function mentions: `<T>(x: unknown): T => x as T` turns anything into any type. */
function genericCast(checker: ts.TypeChecker, n: ts.AsExpression | ts.TypeAssertion): boolean {
  // the type parameters of the target and of the branches of a union / intersection (`as T | undefined`, `as NonNullable<T>`: M2-2-BUILTIN-R4 SP1)
  const branches = (t: ts.Type): ts.Type[] => (t.isUnionOrIntersection() ? t.types.flatMap(branches) : [t]);
  const targets = branches(checker.getTypeFromTypeNode(n.type)).filter((t) => (t.flags & ts.TypeFlags.TypeParameter) !== 0 && t.symbol !== undefined);
  if (targets.length === 0) return false;
  let fn: ts.Node | undefined = n.parent;
  while (fn !== undefined && !ts.isFunctionLike(fn)) fn = fn.parent;
  if (fn === undefined || !ts.isFunctionLike(fn)) return true;
  // only a required, non-default, non-rest parameter whose type is T itself shows that the caller supplied a value of T
  const carries = (prm: ts.ParameterDeclaration, target: ts.Type): boolean => prm.questionToken === undefined && prm.initializer === undefined && prm.dotDotDotToken === undefined && prm.type !== undefined && ts.isTypeReferenceNode(prm.type) && checker.getSymbolAtLocation(prm.type.typeName) === target.symbol;
  return targets.some((target) => !fn.parameters.some((prm) => carries(prm, target)));
}

/** `Safe` made without safeText / safeJson: a type assertion elsewhere, a type predicate, an `any` value where it is expected. */
function safeForgeries(p: Program, files: readonly ts.SourceFile[]): OutputReference[] {
  const { checker } = p;
  const out: OutputReference[] = [];
  for (const sf of files) {
    const file = p.rel(sf).split(path.sep).join("/");
    const visit = (n: ts.Node): void => {
      if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && hasSafe(checker.getTypeFromTypeNode(n.type)) && !(OUTPUT_ALLOWED.has(file) && SAFE_CREATORS.has(topOwnerName(n)))) {
        out.push({ where: where(p, sf, n), what: "Safe made by a type assertion" });
      }
      if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && genericCast(checker, n)) out.push({ where: where(p, sf, n), what: "a type assertion to a type parameter that no parameter carries (a generic cast)" });
      if (ts.isTypePredicateNode(n) && n.type !== undefined && hasSafe(checker.getTypeFromTypeNode(n.type))) out.push({ where: where(p, sf, n), what: "Safe made by a type predicate" });
      if (ts.isExpression(n) && !inTypePosition(n) && (checker.getTypeAtLocation(n).flags & ts.TypeFlags.Any) !== 0) {
        const ctx = checker.getContextualType(n);
        if (ctx !== undefined && hasSafe(ctx)) out.push({ where: where(p, sf, n), what: "an any value where Safe is expected" });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/**
 * The violations in the given files: every way to reach the terminal except the writes of the two writers of
 * src/output.ts, and every `Safe` made without safeText / safeJson.
 */
export function outputViolations(p: Program, files: readonly ts.SourceFile[]): OutputReference[] {
  const found = scan(p, files).filter((f) => !(f.terminal && writerCall(p.checker, f)));
  return [...found.map(({ where: at, what }) => ({ where: at, what })), ...safeForgeries(p, files)];
}
