/**
 * Node adapters: ESLint, tsc, Vitest / Jest, build script, npm / pnpm / yarn audit, Playwright.
 * Existing package.json scripts are preferred over direct invocations. A tool is available only with
 * local evidence (dependency or node_modules/.bin); direct invocations use `npx --no-install` so
 * nothing is fetched from the network (M1-R1-007). Detections never quote script bodies: a script
 * may contain secrets and the reason is printed and copied into the generated config (M1-R1-003).
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
    if (ctx.node.scripts.lint !== undefined) {
      return { kind: "lint", adapter: this.id, status: "available", reason: "package.json scripts.lint found", suggestion: suggestion("lint", "lint", "npm run lint", 300, "Lint via the existing lint script") };
    }
    const installed = ctx.node.hasLocalTool("eslint");
    if (installed) {
      return { kind: "lint", adapter: this.id, status: "available", reason: config !== null ? `${config} found; eslint installed locally` : "eslint installed locally (no config file found)", suggestion: suggestion("lint", "lint", "npx --no-install eslint .", 300, "ESLint over the repository") };
    }
    if (config !== null) {
      return { kind: "lint", adapter: this.id, status: "unavailable", reason: `${config} found but eslint is not installed locally`, enableHint: "install eslint (npm i -D eslint @eslint/js); aiqh does not install it and never lets npx fetch it" };
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
      return { kind: "typecheck", adapter: this.id, status: "available", reason: "package.json scripts.typecheck found", suggestion: suggestion("typecheck", "typecheck", "npm run typecheck", 300, "Type check via the existing typecheck script") };
    }
    const tsconfig = ctx.readText("tsconfig.json");
    if (tsconfig === null) {
      return { kind: "typecheck", adapter: this.id, status: "unavailable", reason: "no tsconfig.json", enableHint: "add a tsconfig.json (and typescript as a devDependency) to enable tsc --noEmit" };
    }
    if (!ctx.node.hasLocalTool("typescript", "tsc")) {
      return { kind: "typecheck", adapter: this.id, status: "unavailable", reason: "tsconfig.json found but typescript is not installed locally", enableHint: "install typescript (npm i -D typescript); aiqh does not install it and never lets npx fetch it" };
    }
    const references = /"references"\s*:/.test(tsconfig);
    return {
      kind: "typecheck",
      adapter: this.id,
      status: "available",
      reason: references ? "tsconfig.json uses project references; typescript installed locally" : "tsconfig.json found; typescript installed locally",
      suggestion: references
        ? suggestion("typecheck", "typecheck", "npx --no-install tsc -b", 300, "Type check all referenced projects (noEmit is taken from the tsconfigs)")
        : suggestion("typecheck", "typecheck", "npx --no-install tsc --noEmit", 300, "Type check without emitting"),
    };
  },
};

function testRunner(ctx: RepoContext, id: string, tool: string, configs: string[], tester: RegExp, npxCommand: string): Detection | null {
  if (!ctx.node) return null;
  const script = scriptUsing(ctx, "test", tester) ?? scriptUsing(ctx, "test:unit", tester);
  if (script !== null) {
    return { kind: "unit", adapter: id, status: "available", reason: `package.json scripts.${script} found (runs ${tool})`, suggestion: suggestion("unit", "unit", `npm run ${script}`, 600, `Unit tests via the existing ${script} script (${tool})`) };
  }
  const config = first(ctx, configs);
  const installed = ctx.node.hasLocalTool(tool);
  if (installed) {
    return { kind: "unit", adapter: id, status: "available", reason: config !== null ? `${config} found; ${tool} installed locally` : `${tool} installed locally`, suggestion: suggestion("unit", "unit", npxCommand, 600, `Unit tests with ${tool}`) };
  }
  if (config !== null) {
    return { kind: "unit", adapter: id, status: "unavailable", reason: `${config} found but ${tool} is not installed locally`, enableHint: `install ${tool} (npm i -D ${tool}); aiqh does not install it and never lets npx fetch it` };
  }
  const testScript = ctx.node.scripts.test;
  const reason = testScript === undefined || NO_TEST_SCRIPT.test(testScript) ? `no ${tool} config or dependency, no test script` : `no ${tool} config or dependency (scripts.test does not run ${tool})`;
  return { kind: "unit", adapter: id, status: "unavailable", reason, enableHint: `install ${tool} (npm i -D ${tool}) and add tests; aiqh does not install it` };
}

export const nodeVitest: Adapter = { id: "node-vitest", kind: "unit", detect: (ctx) => testRunner(ctx, "node-vitest", "vitest", VITEST_CONFIGS, /\bvitest\b/, "npx --no-install vitest run") };
export const nodeJest: Adapter = { id: "node-jest", kind: "unit", detect: (ctx) => testRunner(ctx, "node-jest", "jest", JEST_CONFIGS, /\bjest\b/, "npx --no-install jest") };

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
    return { kind: "build", adapter: this.id, status: "available", reason: `package.json scripts.build found (${framework})`, suggestion: suggestion("build", "build", "npm run build", 900, `Production build via the existing build script (${framework})`) };
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
    const installed = ctx.node.hasLocalTool("@playwright/test", "playwright") || ctx.node.hasLocalTool("playwright");
    const notes = ["browsers are not installed by aiqh: run `npx --no-install playwright install` yourself", "E2E against a live backend needs its own test environment (emulators / test accounts)"];
    if (installed) {
      const script = scriptUsing(ctx, "e2e", /playwright/) ?? scriptUsing(ctx, "test:e2e", /playwright/);
      const command = script !== null ? `npm run ${script}` : "npx --no-install playwright test";
      const reason = script !== null ? `package.json scripts.${script} found (runs playwright)` : config !== null ? `${config} found; playwright installed locally` : "playwright installed locally (no config file found)";
      return { kind: "e2e", adapter: this.id, status: "available", reason, suggestion: { ...suggestion("e2e", "e2e", command, 1200, "Playwright end-to-end tests"), required: false }, notes };
    }
    if (config !== null) {
      return { kind: "e2e", adapter: this.id, status: "unavailable", reason: `${config} found but @playwright/test is not installed locally`, enableHint: "install @playwright/test (npm i -D @playwright/test); aiqh does not install it and never lets npx fetch it", notes };
    }
    return { kind: "e2e", adapter: this.id, status: "unavailable", reason: "no playwright config or dependency", enableHint: "install @playwright/test and add playwright.config.ts (template: npx playwright init); aiqh does not install it", notes };
  },
};

export const NODE_ADAPTERS: readonly Adapter[] = [nodeEslint, nodeTsc, nodeVitest, nodeJest, nodeBuild, nodeAudit, nodePlaywright];
