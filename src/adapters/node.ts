/**
 * Node adapters: ESLint, tsc, Vitest / Jest, build script, npm / pnpm / yarn audit, Playwright.
 * Existing package.json scripts are preferred over direct npx invocations.
 */
import type { Adapter, Detection, RepoContext, Suggestion } from "./types.ts";

const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts", ".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.yml", ".eslintrc.yaml"];
const VITEST_CONFIGS = ["vitest.config.ts", "vitest.config.js", "vitest.config.mts", "vitest.config.mjs", "vitest.workspace.ts"];
const JEST_CONFIGS = ["jest.config.js", "jest.config.ts", "jest.config.cjs", "jest.config.mjs", "jest.config.json"];
const PLAYWRIGHT_CONFIGS = ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"];

function first(ctx: RepoContext, files: string[]): string | null {
  return files.find((f) => ctx.exists(f)) ?? null;
}
function scriptUsing(ctx: RepoContext, name: string, tool: RegExp): string | null {
  const s = ctx.node?.scripts[name];
  return s !== undefined && tool.test(s) ? name : null;
}
const NO_TEST_SCRIPT = /no test specified/;

function suggestion(kind: Suggestion["kind"], name: string, command: string, timeoutSec: number, description: string): Suggestion {
  return { name, kind, command, timeoutSec, description };
}

export const nodeEslint: Adapter = {
  id: "node-eslint",
  kind: "lint",
  detect(ctx) {
    if (!ctx.node) return null;
    const config = first(ctx, ESLINT_CONFIGS);
    const lintScript = ctx.node.scripts.lint;
    if (lintScript !== undefined) {
      return { kind: "lint", adapter: this.id, status: "available", reason: `package.json scripts.lint = ${JSON.stringify(lintScript)}`, suggestion: suggestion("lint", "lint", "npm run lint", 300, "Lint via the existing lint script") };
    }
    if (config !== null || ctx.node.deps.has("eslint")) {
      return { kind: "lint", adapter: this.id, status: "available", reason: config !== null ? `${config} found` : "eslint is a dependency", suggestion: suggestion("lint", "lint", "npx eslint .", 300, "ESLint over the repository") };
    }
    return { kind: "lint", adapter: this.id, status: "unavailable", reason: "no ESLint config, no eslint dependency, no lint script", enableHint: "install eslint (npm i -D eslint @eslint/js) and add eslint.config.js; aiqh does not install it" };
  },
};

export const nodeTsc: Adapter = {
  id: "node-tsc",
  kind: "typecheck",
  detect(ctx) {
    if (!ctx.node) return null;
    if (ctx.node.scripts.typecheck !== undefined) {
      return { kind: "typecheck", adapter: this.id, status: "available", reason: `package.json scripts.typecheck = ${JSON.stringify(ctx.node.scripts.typecheck)}`, suggestion: suggestion("typecheck", "typecheck", "npm run typecheck", 300, "Type check via the existing typecheck script") };
    }
    const tsconfig = ctx.readText("tsconfig.json");
    if (tsconfig === null) {
      return { kind: "typecheck", adapter: this.id, status: "unavailable", reason: "no tsconfig.json", enableHint: "add a tsconfig.json (and typescript as a devDependency) to enable tsc --noEmit" };
    }
    const references = /"references"\s*:/.test(tsconfig);
    return {
      kind: "typecheck",
      adapter: this.id,
      status: "available",
      reason: references ? "tsconfig.json uses project references" : "tsconfig.json found",
      suggestion: references
        ? suggestion("typecheck", "typecheck", "npx tsc -b", 300, "Type check all referenced projects (noEmit is taken from the tsconfigs)")
        : suggestion("typecheck", "typecheck", "npx tsc --noEmit", 300, "Type check without emitting"),
    };
  },
};

function testRunner(ctx: RepoContext, id: string, tool: string, configs: string[], tester: RegExp, npxCommand: string): Detection | null {
  if (!ctx.node) return null;
  const script = scriptUsing(ctx, "test", tester) ?? scriptUsing(ctx, "test:unit", tester);
  if (script !== null) {
    return { kind: "unit", adapter: id, status: "available", reason: `package.json scripts.${script} runs ${tool}`, suggestion: suggestion("unit", "unit", `npm run ${script}`, 600, `Unit tests via the existing ${script} script (${tool})`) };
  }
  const config = first(ctx, configs);
  if (config !== null || ctx.node.deps.has(tool)) {
    return { kind: "unit", adapter: id, status: "available", reason: config !== null ? `${config} found` : `${tool} is a dependency`, suggestion: suggestion("unit", "unit", npxCommand, 600, `Unit tests with ${tool}`) };
  }
  const testScript = ctx.node.scripts.test;
  const reason = testScript === undefined || NO_TEST_SCRIPT.test(testScript) ? `no ${tool} config or dependency, no test script` : `no ${tool} config or dependency (scripts.test does not run ${tool})`;
  return { kind: "unit", adapter: id, status: "unavailable", reason, enableHint: `install ${tool} (npm i -D ${tool}) and add tests; aiqh does not install it` };
}

export const nodeVitest: Adapter = { id: "node-vitest", kind: "unit", detect: (ctx) => testRunner(ctx, "node-vitest", "vitest", VITEST_CONFIGS, /\bvitest\b/, "npx vitest run") };
export const nodeJest: Adapter = { id: "node-jest", kind: "unit", detect: (ctx) => testRunner(ctx, "node-jest", "jest", JEST_CONFIGS, /\bjest\b/, "npx jest") };

export const nodeBuild: Adapter = {
  id: "node-build",
  kind: "build",
  detect(ctx) {
    if (!ctx.node) return null;
    const build = ctx.node.scripts.build;
    if (build === undefined) {
      return { kind: "build", adapter: this.id, status: "unavailable", reason: "no build script in package.json", enableHint: "add a build script (e.g. vite build / next build / tsc -p tsconfig.build.json)" };
    }
    const framework = ctx.node.deps.has("next") ? "Next.js" : ctx.node.deps.has("vite") ? "Vite" : /\btsc\b/.test(build) ? "tsc" : "custom";
    return { kind: "build", adapter: this.id, status: "available", reason: `package.json scripts.build = ${JSON.stringify(build)} (${framework})`, suggestion: suggestion("build", "build", "npm run build", 900, `Production build via the existing build script (${framework})`) };
  },
};

export const nodeAudit: Adapter = {
  id: "node-npm-audit",
  kind: "dependency",
  detect(ctx) {
    if (!ctx.node) return null;
    const commands: Record<string, string> = { npm: "npm audit --audit-level=high", pnpm: "pnpm audit --audit-level=high", yarn: "yarn audit --level high" };
    if (ctx.node.lockfile === null) {
      return { kind: "dependency", adapter: this.id, status: "unavailable", reason: "no lockfile (package-lock.json / pnpm-lock.yaml / yarn.lock)", enableHint: "install dependencies with your package manager to create a lockfile; audit needs it" };
    }
    const command = commands[ctx.node.lockfile];
    if (command === undefined) {
      return { kind: "dependency", adapter: this.id, status: "unavailable", reason: `${ctx.node.lockfile} lockfile: no audit command supported yet`, enableHint: "use npm audit against a package-lock.json, or run the package manager's audit manually" };
    }
    return { kind: "dependency", adapter: this.id, status: "available", reason: `${ctx.node.lockfile} lockfile found`, suggestion: suggestion("dependency", "dependency", command, 300, "Known-vulnerability audit of installed dependencies (needs registry access)"), notes: ["requires network access to the package registry"] };
  },
};

export const nodePlaywright: Adapter = {
  id: "node-playwright",
  kind: "e2e",
  detect(ctx) {
    if (!ctx.node) return null;
    const config = first(ctx, PLAYWRIGHT_CONFIGS);
    const hasDep = ctx.node.deps.has("@playwright/test") || ctx.node.deps.has("playwright");
    const notes = ["browsers are not installed by aiqh: run `npx playwright install` yourself", "E2E against a live backend needs its own test environment (emulators / test accounts)"];
    if (config !== null || hasDep) {
      const script = scriptUsing(ctx, "e2e", /playwright/) ?? scriptUsing(ctx, "test:e2e", /playwright/);
      const command = script !== null ? `npm run ${script}` : "npx playwright test";
      return { kind: "e2e", adapter: this.id, status: "available", reason: config !== null ? `${config} found` : "@playwright/test is a dependency", suggestion: { ...suggestion("e2e", "e2e", command, 1200, "Playwright end-to-end tests"), required: false }, notes };
    }
    return { kind: "e2e", adapter: this.id, status: "unavailable", reason: "no playwright config or dependency", enableHint: "install @playwright/test and add playwright.config.ts (template: npx playwright init); aiqh does not install it", notes };
  },
};

export const NODE_ADAPTERS: readonly Adapter[] = [nodeEslint, nodeTsc, nodeVitest, nodeJest, nodeBuild, nodeAudit, nodePlaywright];
