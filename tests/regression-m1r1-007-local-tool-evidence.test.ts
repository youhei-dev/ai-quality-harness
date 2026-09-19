/**
 * M1-R1-007: a config file alone does not make a Node tool available; local evidence (dependency in
 * package.json or node_modules/.bin/<tool>) is required, and direct invocations use
 * `npx --no-install` so nothing is fetched from the network.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { NODE_ADAPTERS } from "../src/adapters/node.ts";
import type { Detection } from "../src/adapters/types.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function project(files: Record<string, string>, pkg: Record<string, unknown> = {}, after?: (dir: string) => void): Record<string, Detection | null> {
  const t = makeTempDir("aiqh-r1-007-");
  cleanups.push(t.cleanup);
  writeFileSync(path.join(t.dir, "package.json"), JSON.stringify({ name: "fixture-evidence", private: true, ...pkg }));
  for (const [rel, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(t.dir, rel)), { recursive: true });
    writeFileSync(path.join(t.dir, rel), c);
  }
  after?.(t.dir);
  const ctx = buildRepoContext(t.dir);
  const out: Record<string, Detection | null> = {};
  for (const a of NODE_ADAPTERS) out[a.id] = a.detect(ctx);
  return out;
}

describe("M1-R1-007: config file alone is not enough", () => {
  it("eslint / vitest / jest / playwright / tsc configs without the dependency → unavailable with a hint", () => {
    const d = project({ "eslint.config.js": "export default [];", "vitest.config.ts": "export default {};", "jest.config.js": "module.exports = {};", "playwright.config.ts": "export default {};", "tsconfig.json": "{}" });
    for (const id of ["node-eslint", "node-vitest", "node-jest", "node-playwright", "node-tsc"]) {
      expect(d[id]?.status, id).toBe("unavailable");
      expect(d[id]?.suggestion, id).toBeUndefined();
      expect(d[id]?.enableHint ?? "", id).not.toBe("");
    }
  });
  it("with the dependency declared → available, command uses npx --no-install", () => {
    const d = project(
      { "eslint.config.js": "export default [];", "vitest.config.ts": "export default {};", "playwright.config.ts": "export default {};", "tsconfig.json": "{}" },
      { devDependencies: { eslint: "^10.0.0", vitest: "^5.0.0", "@playwright/test": "^1.50.0", typescript: "^5.9.0" } },
    );
    expect(d["node-eslint"]?.suggestion?.command).toBe("npx --no-install eslint .");
    expect(d["node-vitest"]?.suggestion?.command).toBe("npx --no-install vitest run");
    expect(d["node-playwright"]?.suggestion?.command).toBe("npx --no-install playwright test");
    expect(d["node-tsc"]?.suggestion?.command).toBe("npx --no-install tsc --noEmit");
  });
  it("a project-references tsconfig with typescript installed → npx --no-install tsc -b", () => {
    const d = project({ "tsconfig.json": '{ "references": [{ "path": "./tsconfig.app.json" }] }' }, { devDependencies: { typescript: "^5.9.0" } });
    expect(d["node-tsc"]?.suggestion?.command).toBe("npx --no-install tsc -b");
  });
  it("an executable node_modules/.bin/<tool> counts as local evidence even without a declared dependency", () => {
    const d = project({ "jest.config.js": "module.exports = {};", "node_modules/.bin/jest": "#!/bin/sh\n" }, {}, (dir) => chmodSync(path.join(dir, "node_modules", ".bin", "jest"), 0o755));
    expect(d["node-jest"]?.status).toBe("available");
    expect(d["node-jest"]?.suggestion?.command).toBe("npx --no-install jest");
  });
  it("existing scripts are still preferred and unchanged", () => {
    const d = project({}, { scripts: { lint: "eslint .", test: "vitest run" }, devDependencies: { eslint: "^10.0.0", vitest: "^5.0.0" } });
    expect(d["node-eslint"]?.suggestion?.command).toBe("npm run lint");
    expect(d["node-vitest"]?.suggestion?.command).toBe("npm run test");
  });
});
