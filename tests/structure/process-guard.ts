/**
 * External-process guard (M2-2, M2-1-R3-006): with the type checker, every call that resolves to a declaration
 * of `child_process` in @types/node — whatever the quotes, aliases, namespace imports, element access,
 * destructuring, promisify, dynamic import or require — and its command, evaluated by type (a string literal
 * type, including const variables and template literals without substitutions, or `process.execPath`).
 *
 * Rules for tests/ (M2-1-R2-004): git and node (process.execPath, fork) are declared; unzip and python3 are
 * probed tools, allowed only as the probe itself (the initializer of a variable that a skipIf / runIf
 * condition uses) or inside an it / test / describe whose skipIf / runIf condition uses a probe of that same
 * tool; any other command, a command that is not known statically, and a shell (exec, execSync,
 * `shell: true`) are violations. A command started from inside a string (a `node -e` script) cannot be seen
 * here; the suite run with only node and git on PATH (scripts/test-minimal-path.ts) covers it.
 */
import ts from "typescript";
import { where, type Program } from "./typescript.ts";

export const DECLARED = new Set(["git", "node"]);
export const PROBED = new Set(["unzip", "python3"]);
const STARTERS = new Set(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]);
const SHELL = new Set(["exec", "execSync"]);

export interface ProcessCall {
  where: string;
  /** The child_process function (`execFile (promisify)` for a promisified one). */
  api: string;
  /** The command name, or `DYNAMIC(<expression>)`. */
  command: string;
  shell: boolean;
  /** "declared", "probe", "guarded" or the reason it is a violation. */
  verdict: string;
}

/** The child_process function a call resolves to, or null (also used by output-guard.ts for the children's stdio). */
export function starter(checker: ts.TypeChecker, call: ts.CallExpression): string | null {
  const decl = checker.getResolvedSignature(call)?.getDeclaration();
  if (decl === undefined || !/[\\/]@types[\\/]node[\\/]child_process\.d\.ts$/.test(decl.getSourceFile().fileName)) return null;
  let fn: ts.Node | undefined = decl;
  while (fn !== undefined && !(ts.isFunctionDeclaration(fn) && fn.name !== undefined)) fn = fn.parent;
  const name = fn !== undefined && ts.isFunctionDeclaration(fn) && fn.name !== undefined ? fn.name.text : "";
  if (name === "__promisify__") {
    let ns: ts.Node | undefined = fn?.parent;
    while (ns !== undefined && !ts.isModuleDeclaration(ns)) ns = ns.parent;
    return ns !== undefined && ts.isModuleDeclaration(ns) ? `${ns.name.getText()} (promisify)` : null;
  }
  return STARTERS.has(name) ? name : null;
}

function commandOf(checker: ts.TypeChecker, api: string, arg: ts.Expression | undefined): string {
  if (api.startsWith("fork")) return "node";
  if (arg === undefined) return "DYNAMIC()";
  if (ts.isPropertyAccessExpression(arg) && arg.name.text === "execPath" && ts.isIdentifier(arg.expression) && arg.expression.text === "process") return "node";
  const t = checker.getTypeAtLocation(arg);
  if (t.isStringLiteral()) return t.value.trim().split(/\s+/)[0] ?? "";
  return `DYNAMIC(${arg.getText().slice(0, 60)})`;
}

function usesShell(api: string, call: ts.CallExpression): boolean {
  if (SHELL.has(api.split(" ")[0] ?? "")) return true;
  return call.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((prop) => ts.isPropertyAssignment(prop) && prop.name.getText() === "shell" && prop.initializer.kind !== ts.SyntaxKind.FalseKeyword));
}

/** The condition of the it / test / describe `.skipIf(cond)` / `.runIf(cond)` whose callback contains `node`. */
function guardConditions(node: ts.Node): ts.Expression[] {
  const out: ts.Expression[] = [];
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) {
    if (!ts.isCallExpression(n) || !ts.isCallExpression(n.expression)) continue;
    const inner = n.expression;
    if (!ts.isPropertyAccessExpression(inner.expression)) continue;
    const obj = inner.expression.expression;
    const method = inner.expression.name.text;
    if (!ts.isIdentifier(obj) || !["it", "test", "describe"].includes(obj.text) || !["skipIf", "runIf"].includes(method)) continue;
    if (n.arguments.some((a) => a.pos <= node.pos && node.end <= a.end) && inner.arguments[0] !== undefined) out.push(inner.arguments[0]);
  }
  return out;
}

/** Variables that some skipIf / runIf condition of the file uses. */
function conditionVariables(checker: ts.TypeChecker, sf: ts.SourceFile): Set<ts.Symbol> {
  const out = new Set<ts.Symbol>();
  const collect = (e: ts.Node): void => {
    if (ts.isIdentifier(e)) {
      const s = checker.getSymbolAtLocation(e);
      if (s !== undefined) out.add(s);
    }
    ts.forEachChild(e, collect);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ["skipIf", "runIf"].includes(n.expression.name.text) && n.arguments[0] !== undefined) collect(n.arguments[0]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The probed tools that child_process calls inside `node` start (a probe is a call, not a mention of the name). */
function probedToolsIn(checker: ts.TypeChecker, node: ts.Node): Set<string> {
  const tools = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const api = starter(checker, n);
      const command = api === null ? "" : commandOf(checker, api, n.arguments[0]);
      if (PROBED.has(command)) tools.add(command);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return tools;
}

/** The initializer of a variable, if `sym` is one. */
function initializerOf(sym: ts.Symbol): ts.Expression | undefined {
  const d = sym.valueDeclaration;
  return d !== undefined && ts.isVariableDeclaration(d) ? d.initializer : undefined;
}

/** Whether the initializer of a variable starts `tool` and no other probed tool (1 tool = 1 variable; a string that only names the tool is not a probe: M2-2-R1-003). */
function probesTool(checker: ts.TypeChecker, sym: ts.Symbol, tool: string): boolean {
  const init = initializerOf(sym);
  if (init === undefined) return false;
  const tools = probedToolsIn(checker, init);
  return tools.size === 1 && tools.has(tool);
}

/** The variable whose initializer contains `node` (its declaration symbol), if any, without crossing a function. */
function initializedVariable(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) {
    if (ts.isVariableDeclaration(n) && n.initializer !== undefined && n.initializer.pos <= node.pos && node.end <= n.initializer.end) return checker.getSymbolAtLocation(n.name);
    if (ts.isFunctionLike(n)) return undefined;
  }
  return undefined;
}

function identifiersOf(checker: ts.TypeChecker, e: ts.Node): ts.Symbol[] {
  const out: ts.Symbol[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const s = checker.getSymbolAtLocation(n);
      if (s !== undefined) out.push(s);
    }
    ts.forEachChild(n, visit);
  };
  visit(e);
  return out;
}

export function processCalls(p: Program, files: readonly ts.SourceFile[]): ProcessCall[] {
  const { checker } = p;
  const out: ProcessCall[] = [];
  for (const sf of files) {
    const condVars = conditionVariables(checker, sf);
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const api = starter(checker, n);
        if (api !== null) {
          const command = commandOf(checker, api, n.arguments[0]);
          const shell = usesShell(api, n);
          let verdict: string;
          if (command.startsWith("DYNAMIC")) verdict = "violation: command not known statically";
          else if (shell) verdict = "violation: shell";
          else if (DECLARED.has(command)) verdict = "declared";
          else if (PROBED.has(command)) {
            const v = initializedVariable(checker, n);
            const init = v === undefined ? undefined : initializerOf(v);
            if (v !== undefined && condVars.has(v)) verdict = init !== undefined && probedToolsIn(checker, init).size > 1 ? "violation: probe variable mixes tools" : "probe";
            else if (guardConditions(n).some((cond) => identifiersOf(checker, cond).some((s) => probesTool(checker, s, command)))) verdict = "guarded";
            else verdict = "violation: probed tool outside a skipIf / runIf on its own probe";
          } else verdict = "violation: undeclared command";
          out.push({ where: where(p, sf, n), api, command, shell, verdict });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}
