/**
 * Brand guard (M2-2, M2-1-R3-004): with the type checker, find every way a string can become `Checked` / `Md`
 * without the check. The brands are found by their unique-symbol property, so type aliases, `typeof`,
 * `Parameters<…>` and generics resolve to the same brand as the name `Checked`.
 *
 *  - assertion: `as` / `<T>` to a branded type (except where CREATORS allows it), to `any`, to `never`, or to a
 *    type parameter (or a union / intersection with one: `as T | undefined`, `NonNullable<T>`; M2-2-BUILTIN-R4) unless a
 *    required parameter of the function (no default, not rest) is of type T itself, for each such type parameter (a generic
 *    cast). The creators and the callers of the issuers are the top-level declarations of those names (M2-2-BUILTIN-R3-002)
 *  - type-predicate: `x is Checked` / `asserts x is Checked`
 *  - any-into-brand: an `any` value where a branded type is expected (JSON.parse, catch values, …)
 *  - widened-renderer: a function that takes a branded parameter passed where its parameter is a plain string
 *    (method bivariance, Reflect.apply, Function)
 *  - widened-container: an array / object that holds branded values assigned to a writable type without the brand
 *    (covariance: the plain view can then store an unchecked string)
 *  - ts-directive: `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`
 *  - issuer-call: the issuers (`issue`, `issueMd`) called or referenced outside their allowed callers
 *  - md-not-tag: `md` used other than as a template tag
 */
import ts from "typescript";
import { ownerName, topOwnerName, where, type Program } from "./typescript.ts";

export interface Violation {
  where: string;
  rule: string;
  owner: string;
}

const BRAND = /^__@(checkedBrand|mdBrand|rejectedBrand)@/;

/** The only declarations whose code may assert a brand: the two issuers and the one Rejected value (M2-1-R3-002). */
export const CREATORS: ReadonlyArray<{ file: string; owner: string }> = [
  { file: "src/review/checked.ts", owner: "issue" },
  { file: "src/review/checked.ts", owner: "REJECTED" },
  { file: "src/review/packet.ts", owner: "issueMd" },
];

/** The functions that create a brand, and the only functions that may call them (by file and name). */
export const ISSUERS: Readonly<Record<string, { file: string; callers: readonly string[] }>> = {
  issue: { file: "src/review/checked.ts", callers: ["checkValue"] },
  issueMd: { file: "src/review/packet.ts", callers: ["md", "joinMd", "inlineCode", "cellCode", "plainOrCode"] },
};

function hasBrand(checker: ts.TypeChecker, t: ts.Type, depth = 0, seen = new Set<ts.Type>()): boolean {
  if (depth > 4 || seen.has(t)) return false;
  seen.add(t);
  if (t.isUnionOrIntersection()) return t.types.some((x) => hasBrand(checker, x, depth + 1, seen));
  if (t.getProperties().some((p) => BRAND.test(p.getName()))) return true;
  const args = checker.isArrayType(t) || checker.isTupleType(t) || (t.flags & ts.TypeFlags.Object && ((t as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0) ? checker.getTypeArguments(t as ts.TypeReference) : [];
  if (args.some((a) => hasBrand(checker, a, depth + 1, seen))) return true;
  if (t.flags & ts.TypeFlags.Object) {
    for (const p of t.getProperties().slice(0, 40)) {
      const decl = p.valueDeclaration ?? p.declarations?.[0];
      if (decl !== undefined && hasBrand(checker, checker.getTypeOfSymbolAtLocation(p, decl), depth + 1, seen)) return true;
    }
  }
  return false;
}

/** A branded string itself (not a container of branded strings). */
function isBrandedString(t: ts.Type): boolean {
  if (t.isUnion()) return t.types.every((x) => isBrandedString(x) || (x.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0);
  return t.isIntersection() && t.types.some((x) => (x.flags & ts.TypeFlags.StringLike) !== 0);
}

function takesBrand(checker: ts.TypeChecker, t: ts.Type): boolean {
  return t.getCallSignatures().some((s) => s.getParameters().some((p) => hasBrand(checker, checker.getTypeOfSymbol(p))));
}

/** The contextual function type takes a plain string where the function itself takes a brand (`(s: string | Checked) => Md`): hasBrand sees `Checked` in it, takesBrand alone would call it branded. */
function widensBrandParameter(checker: ts.TypeChecker, source: ts.Type, target: ts.Type): boolean {
  const str = checker.getStringType();
  return source.getCallSignatures().some((s) =>
    target.getCallSignatures().some((t) =>
      s.getParameters().some((sp, i) => {
        const tp = t.getParameters()[i];
        return tp !== undefined && hasBrand(checker, checker.getTypeOfSymbol(sp)) && checker.isTypeAssignableTo(str, checker.getTypeOfSymbol(tp));
      }),
    ),
  );
}

function enclosingFunction(node: ts.Node): ts.SignatureDeclaration | undefined {
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) if (ts.isFunctionLike(n)) return n;
  return undefined;
}

function inTypePosition(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) {
    if (ts.isTypeNode(n)) return true;
    if (ts.isStatement(n) || ts.isExpression(n)) return false;
  }
  return false;
}

/** The declaration name of the function an identifier refers to, if it is one of the issuers or `md`. */
function declaredFunction(p: Program, id: ts.Identifier): { name: string; file: string } | null {
  let sym = p.checker.getSymbolAtLocation(id);
  if (sym !== undefined && sym.flags & ts.SymbolFlags.Alias) sym = p.checker.getAliasedSymbol(sym);
  const decl = sym?.declarations?.find(ts.isFunctionDeclaration);
  if (decl?.name === undefined) return null;
  return { name: decl.name.text, file: p.rel(decl.getSourceFile()) };
}

export function brandGuard(p: Program, files: readonly ts.SourceFile[]): Violation[] {
  const { checker } = p;
  const out: Violation[] = [];
  for (const sf of files) {
    const add = (node: ts.Node, rule: string): void => {
      out.push({ where: where(p, sf, node), rule, owner: ownerName(node) });
    };
    for (const m of sf.text.matchAll(/@ts-(ignore|expect-error|nocheck)/g)) {
      out.push({ where: `${p.rel(sf)}:${sf.getLineAndCharacterOfPosition(m.index).line + 1}`, rule: "ts-directive", owner: "" });
    }
    const visit = (n: ts.Node): void => {
      if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && n.type.getText(sf) !== "const") {
        const target = checker.getTypeFromTypeNode(n.type);
        const owner = topOwnerName(n);
        const creator = CREATORS.some((c) => c.owner === owner && c.file === p.rel(sf));
        if (hasBrand(checker, target) && !creator) add(n, "assertion");
        else if (target.flags & ts.TypeFlags.Any) add(n, "assertion");
        else if (target.flags & ts.TypeFlags.Never) add(n, "assertion");
        else {
          // the type parameters of the target and of the branches of a union / intersection (`as T | undefined`: M2-2-BUILTIN-R4 SP1)
          const branches = (t: ts.Type): ts.Type[] => (t.isUnionOrIntersection() ? t.types.flatMap(branches) : [t]);
          const syms = branches(target).filter((t) => (t.flags & ts.TypeFlags.TypeParameter) !== 0).map((t) => t.getSymbol());
          const fn = enclosingFunction(n);
          // only a required, non-default, non-rest parameter typed T itself shows that the caller supplied a value of T
          const carries = (param: ts.ParameterDeclaration, sym: ts.Symbol | undefined): boolean => param.questionToken === undefined && param.initializer === undefined && param.dotDotDotToken === undefined && param.type !== undefined && ts.isTypeReferenceNode(param.type) && checker.getSymbolAtLocation(param.type.typeName) === sym;
          if (syms.some((sym) => fn === undefined || sym === undefined || !fn.parameters.some((param) => carries(param, sym)))) add(n, "assertion");
        }
      }
      if (ts.isTypePredicateNode(n) && n.type !== undefined && hasBrand(checker, checker.getTypeFromTypeNode(n.type))) add(n, "type-predicate");
      if (ts.isExpression(n) && !inTypePosition(n) && (checker.getTypeAtLocation(n).flags & ts.TypeFlags.Any) !== 0) {
        const ctx = checker.getContextualType(n);
        if (ctx !== undefined && hasBrand(checker, ctx)) add(n, "any-into-brand");
      }
      if (ts.isIdentifier(n) && !inTypePosition(n)) {
        const parent = n.parent;
        const declaration =
          ((ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isParameter(parent) || ts.isPropertyAssignment(parent)) && parent.name === n) ||
          ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) || (ts.isPropertyAccessExpression(parent) && parent.name === n);
        const callee = (ts.isCallExpression(parent) && parent.expression === n) || (ts.isTaggedTemplateExpression(parent) && parent.tag === n);
        const fn = declaredFunction(p, n);
        if (fn !== null && !declaration) {
          const issuer = ISSUERS[fn.name];
          if (issuer !== undefined && issuer.file === fn.file && !(ts.isCallExpression(parent) && parent.expression === n && issuer.callers.includes(topOwnerName(n)))) add(n, "issuer-call");
          if (fn.name === "md" && fn.file === "src/review/packet.ts" && !(ts.isTaggedTemplateExpression(parent) && parent.tag === n)) add(n, "md-not-tag");
        }
        if (!declaration && !callee && takesBrand(checker, checker.getTypeAtLocation(n))) {
          const ctx = checker.getContextualType(n);
          if (ctx !== undefined && (!takesBrand(checker, ctx) || widensBrandParameter(checker, checker.getTypeAtLocation(n), ctx))) add(n, "widened-renderer");
        }
      }
      // a member access that yields a renderer (PKG.inlineCode, o.r): the identifier branch above skips the name of a property access (M2-2-R1-004)
      if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && !inTypePosition(n)) {
        const parent = n.parent;
        const callee = (ts.isCallExpression(parent) && parent.expression === n) || (ts.isTaggedTemplateExpression(parent) && parent.tag === n);
        if (!callee && takesBrand(checker, checker.getTypeAtLocation(n))) {
          const ctx = checker.getContextualType(n);
          if (ctx !== undefined && (!takesBrand(checker, ctx) || widensBrandParameter(checker, checker.getTypeAtLocation(n), ctx))) add(n, "widened-renderer");
        }
      }
      if (ts.isExpression(n) && !inTypePosition(n)) {
        const t = checker.getTypeAtLocation(n);
        if (!isBrandedString(t) && hasBrand(checker, t)) {
          const parent = n.parent;
          let target: ts.Type | undefined;
          if (ts.isVariableDeclaration(parent) && parent.initializer === n && parent.type !== undefined) target = checker.getTypeFromTypeNode(parent.type);
          else if (ts.isBinaryExpression(parent) && parent.right === n && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) target = checker.getTypeAtLocation(parent.left);
          else if ((ts.isCallExpression(parent) && parent.arguments.includes(n)) || ts.isReturnStatement(parent)) target = checker.getContextualType(n);
          if (target !== undefined && !hasBrand(checker, target) && !(target.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))) {
            if (checker.isArrayType(target)) {
              if ((target as ts.TypeReference).target.symbol.getName() === "Array") add(n, "widened-container");
            } else if (target.flags & ts.TypeFlags.Object && !checker.isTupleType(target)) {
              const writable = target.getProperties().some((prop) => {
                const d = prop.valueDeclaration;
                return d !== undefined && (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) && (ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Readonly) === 0;
              });
              if (writable) add(n, "widened-container");
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}
