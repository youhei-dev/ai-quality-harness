/**
 * Item 45 (v0.14.0, batch1 design final §2.4 and §2.6): `aiqh init` proposes `npm run <script>` for node:test only when a simple command
 * of scripts.test (then scripts.test:unit) runs `node` at its command position with Node's own `--test` (no value, no mark). Node's
 * options are read as name and value (`--name=value` and `--name value` are the same option); only the 18 options that take a value and
 * the 24 known flags may stand next to `--test` (B1-D-R3-001); `-e` / `--eval` / `-p` / `--print`, `--` and the first word that is not an
 * option end them. Not detected (unit stays NOT APPLICABLE): watch options anywhere (B1-D-R2-002), a NODE_OPTIONS prefix, options that
 * read options or the environment from a file, a node path / npx / env / cross-env, quoted or escaped words, forms appendix A does not
 * examine. Written to run on the base commit too: it never calls the new adapter directly, only every adapter in NODE_ADAPTERS.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { resolveDetections } from "../src/adapters/index.ts";
import { NODE_ADAPTERS } from "../src/adapters/node.ts";
import type { Detection, KindResolution } from "../src/adapters/types.ts";
import { runInit } from "../src/commands/init.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function project(scripts: Record<string, string>, devDependencies: Record<string, string> = { typescript: "^5.9.0" }): string {
  const t = makeTempDir("aiqh-item45-");
  cleanups.push(t.cleanup);
  writeFileSync(path.join(t.dir, "package.json"), JSON.stringify({ name: "fixture-node-test", private: true, type: "module", scripts, devDependencies }));
  mkdirSync(path.join(t.dir, "test"));
  writeFileSync(path.join(t.dir, "test", "a.test.ts"), 'import { test } from "node:test";\ntest("a", () => {});\n');
  return t.dir;
}
/** The unit resolution over the Node adapters, and what any adapter with the id node-test returned (none on the base commit). */
function unitOf(dir: string): { unit: KindResolution; nodeTest: Array<Detection | null> } {
  const ctx = buildRepoContext(dir);
  return { unit: resolveDetections(ctx, NODE_ADAPTERS).byKind.unit, nodeTest: NODE_ADAPTERS.filter((a) => a.id === "node-test").map((a) => a.detect(ctx)) };
}
function expectNodeTest(scripts: Record<string, string>, script: string): void {
  const { unit } = unitOf(project(scripts));
  expect(unit.chosen?.adapter).toBe("node-test");
  expect(unit.chosen?.suggestion?.command).toBe(`npm run ${script}`);
  expect(unit.chosen?.suggestion?.timeoutSec).toBe(600);
  expect(unit.chosen?.reason).toBe(`package.json scripts.${script} found (runs node --test)`);
}
function expectNoNodeTest(body: string): void {
  const { unit, nodeTest } = unitOf(project({ test: body }));
  expect(unit.chosen?.adapter).not.toBe("node-test");
  // B1-Q6: without a node --test script the adapter returns null (no unavailable row is added)
  for (const d of nodeTest) expect(d).toBeNull();
}

describe("item 45: the node-test adapter is one of the Node adapters, after jest", () => {
  it("NODE_ADAPTERS has node-test right after node-jest", () => {
    const ids = NODE_ADAPTERS.map((a) => a.id);
    expect(ids.indexOf("node-test")).toBe(ids.indexOf("node-jest") + 1);
  });
});

describe("item 45: detected (unit is npm run <script>)", () => {
  it.each([
    ["N1", "node --test"],
    ["N2", 'node --experimental-strip-types --test "x/**/*.test.ts"'],
    ["N2b", "node --import tsx --test"],
    ["N2c", "node --import=tsx --test"],
    ["N2c", "node --test-reporter spec --test"],
    ["N2c", "node --test-reporter=spec --test"],
    ["N2c", "node --no-warnings --enable-source-maps --test"],
    ["N6", "node --test && eslint ."],
    ["N6b", "VAR=1 node --test"],
    ["N6b", "A=1 B=2 node --test"],
  ])("%s %j", (_id, body) => {
    expectNodeTest({ test: body }, "test");
  });
  it("N3: only scripts.test:unit runs node --test", () => {
    expectNodeTest({ "test:unit": "node --test", lint: "eslint ." }, "test:unit");
  });
  it("N3: scripts.test is the placeholder and scripts.test:unit runs node --test", () => {
    expectNodeTest({ test: 'echo "Error: no test specified" && exit 1', "test:unit": "node --test test/" }, "test:unit");
  });
});

// The two fixed lists of the design (§2.4 rule 4). --env-file and --watch-path take a value but are refused by rules 7c and 7a.
const VALUE_OPTIONS = ["--import", "--require", "-r", "--loader", "--experimental-loader", "--conditions", "-C", "--input-type", "--test-reporter", "--test-reporter-destination", "--test-name-pattern", "--test-skip-pattern", "--test-concurrency", "--test-timeout", "--test-shard", "--title"];
const KNOWN_FLAGS = [
  "--experimental-strip-types", "--no-strip-types", "--experimental-transform-types", "--experimental-test-coverage", "--experimental-test-module-mocks", "--test-only",
  "--test-force-exit", "--test-update-snapshots", "--enable-source-maps", "--no-warnings", "--no-deprecation", "--trace-warnings", "--trace-deprecation",
  "--trace-uncaught", "--pending-deprecation", "--throw-deprecation", "--experimental-vm-modules", "--experimental-require-module", "--no-experimental-require-module",
  "--no-experimental-detect-module", "--expose-gc", "--preserve-symlinks", "--preserve-symlinks-main", "--frozen-intrinsics",
];

describe("item 45: the fixed lists (B1-D-R3-001: only these may stand next to --test)", () => {
  it("the lists have the sizes of the design (18 options that take a value, without the 2 refused ones; 24 flags)", () => {
    expect(VALUE_OPTIONS.length + 2).toBe(18);
    expect(KNOWN_FLAGS).toHaveLength(24);
  });
  it.each(VALUE_OPTIONS)("%s v --test and %s=v --test (before and after --test)", (option) => {
    expectNodeTest({ test: `node ${option} v --test` }, "test");
    if (option.startsWith("--")) expectNodeTest({ test: `node ${option}=v --test` }, "test");
    expectNodeTest({ test: `node --test ${option} v` }, "test");
  });
  it.each(KNOWN_FLAGS)("%s --test and --test %s", (flag) => {
    expectNodeTest({ test: `node ${flag} --test` }, "test");
    expectNodeTest({ test: `node --test ${flag}` }, "test");
  });
});

describe("item 45: not detected (unit stays as before)", () => {
  it.each([
    ["N5", "node build.js"],
    ["N5", "node --version"],
    ["N5", "node --test-reporter=spec x.js"],
    ["N5a", "echo node --test"],
    ["N5b", `node -e "console.log('--test')"`],
    ["N5b", 'node --eval="1" --test'],
    ["N5b", "node -p 1 --test"],
    ["N5b", "node --print=1 --test"],
    ["N5c", "node script.js --test"],
    ["N5d", 'node "--test"'],
    ["N5d", "node '--test'"],
    ["N5d", "node \\--test"],
    ["N5e", "node -- --test"],
    ["N5f", `printf '%s\\n' "node --test"`],
    ["N5g", "/usr/bin/node --test"],
    ["N5g", "npx node --test"],
    ["N5g", "env node --test"],
    ["N5g", "cross-env A=1 node --test"],
    ["N5g", "nodejs --test"],
    ["N5g", '"node" --test'],
    ["N5h", "node --unknown-option value --test"],
    ["N5o", "node --unknown-option=value --test"],
    ["N5o", "node --unknown-flag --test"],
    ["N5o", "node --test --unknown-flag"],
    ["N5o", "node -x --test"],
    ["N5o", "node --no-warnings=1 --test"],
    ["N5i", "node --test --watch"],
    ["N5i", "node --watch --test"],
    ["N5i", "node --test --watch-path=src"],
    ["N5i", "node --watch-path=src --test"],
    ["N5i", "node --test --watch-path src"],
    ["N5i", "node --watch-path src --test"],
    ["N5i", "node --test --watch-path"],
    ["N5i", "node --test --watch-path="],
    ["N5i", "node --test --watch=true"],
    ["N5j", 'node --test "x'],
    ["N5k", "$(echo node) --test"],
    ["N5k", "`which node` --test"],
    ["N5k", "node --test $(cat flags.txt)"],
    ["N5k", "node --test `cat flags.txt`"],
    ["N5k", "node --test {a,b}.test.js"],
    ["N5k", "node --test <<EOF"],
    ["N5l", "node --test --watch-preserve-output"],
    ["N5l", "node --test --watch-kill-signal=SIGINT"],
    ["N5l", "node --test --watch-kill-signal SIGINT"],
    ["N5l", "node --test --no-watch"],
    ["N5l", 'node --test "--watch"'],
    ["N5l", "node --test '--watch-path=src'"],
    ["N5l", "node --test test/ --watch"],
    ["N5l", "node --test -- --watch"],
    ["N5m", "NODE_OPTIONS=--watch node --test"],
    ["N5m", 'NODE_OPTIONS="--watch-path=src" node --test'],
    ["N5m", "NODE_OPTIONS=--max-old-space-size=4096 node --test"],
    ["N5m", "node --experimental-config-file=node.config.json --test"],
    ["N5m", "node --experimental-default-config-file --test"],
    ["N5m", "node --env-file=.env --test"],
    ["N5m", "node --env-file .env --test"],
    ["N5m", "node --env-file-if-exists=.env --test"],
    ["N5m", "node --test test/ --env-file=.env"],
    ["N5n", "node --test=1"],
    ["N5n", "node --test="],
    ["N6c", "eslint . && echo node --test"],
    ["N5k", "(node --test)"],
  ])("%s %j", (_id, body) => {
    expectNoNodeTest(body);
  });
  it("N4: scripts.test runs vitest (vitest installed): vitest is chosen, node-test returns null", () => {
    const { unit, nodeTest } = unitOf(project({ test: "vitest run" }, { vitest: "^5.0.0" }));
    expect(unit.chosen?.adapter).toBe("node-vitest");
    expect(unit.chosen?.suggestion?.command).toBe("npm run test");
    for (const d of nodeTest) expect(d).toBeNull();
  });
  it("no scripts at all: node-test returns null", () => {
    const { nodeTest } = unitOf(project({}));
    for (const d of nodeTest) expect(d).toBeNull();
  });
});

describe("item 45: known limit kept (design §2.8)", () => {
  it("vitest installed locally is chosen before a node --test script (adapter order); node-test is an alternative", () => {
    const { unit } = unitOf(project({ test: "node --test" }, { vitest: "^5.0.0" }));
    expect(unit.chosen?.adapter).toBe("node-vitest");
    expect(unit.chosen?.suggestion?.command).toBe("npx --no-install vitest run");
    expect(unit.alternatives.map((d) => d.adapter)).toContain("node-test");
  });
});

describe("item 45: aiqh init", () => {
  async function init(dir: string): Promise<{ code: number; output: string; configText: string }> {
    const lines: string[] = [];
    const code = await runInit({ cwd: dir, toolVersion: "0.0.0", json: true, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    const output = lines.join("\n");
    return { code, output, configText: (JSON.parse(output) as { configText: string }).configText };
  }
  it("N7: the proposed config has the unit check npm run test and no unit: NOT APPLICABLE", async () => {
    const r = await init(project({ test: "node --test" }));
    expect(r.code).toBe(0);
    expect(r.configText).toContain('"command": "npm run test"');
    expect(r.configText).toContain("// unit: node-test — package.json scripts.test found (runs node --test)");
    expect(r.configText).not.toContain("unit: NOT APPLICABLE");
  });
  it("N8: the script body is not in the detection, the init output or the proposed config", async () => {
    const hidden = fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789");
    const dir = project({ test: `node --test --test-name-pattern=${hidden}` });
    const { unit } = unitOf(dir);
    expect(unit.chosen?.adapter).toBe("node-test");
    expect(JSON.stringify(unit)).not.toContain(hidden);
    const r = await init(dir);
    expect(r.output).not.toContain(hidden);
    expect(r.configText).not.toContain(hidden);
  });
});
