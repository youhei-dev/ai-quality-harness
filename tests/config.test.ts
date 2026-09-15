import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseConfigText, resolveInsideRoot } from "../src/config/load.ts";
import { makeTempDir } from "./helpers.ts";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");

const BASE = {
  version: 1,
  project: { name: "p" },
  checks: [{ name: "a", kind: "lint", command: "echo a" }],
};

function withChecks(checks: unknown[]): string {
  return JSON.stringify({ ...BASE, checks });
}

describe("loadConfig", () => {
  it("loads a JSONC file with comments and trailing commas, applying defaults", () => {
    const cfg = loadConfig(path.join(FIXTURES, "valid.jsonc"));
    expect(cfg.projectRoot).toBe(FIXTURES);
    expect(cfg.project).toEqual({ name: "fixture-project", type: "node" });
    expect(cfg.outputDir).toBe(path.join(FIXTURES, "artifacts", "verification"));
    expect(cfg.checks).toHaveLength(2);

    const [lint, unit] = cfg.checks;
    expect(lint).toMatchObject({ name: "lint", required: true, timeoutSec: 30, cwd: "." });
    expect(lint?.cwdAbsolute).toBe(FIXTURES);
    expect(unit).toMatchObject({ name: "unit", required: false, timeoutSec: 5, cwd: "sub" });
    expect(unit?.cwdAbsolute).toBe(path.join(FIXTURES, "sub"));
  });

  it("throws ConfigError for a missing file", () => {
    expect(() => loadConfig(path.join(FIXTURES, "does-not-exist.jsonc"))).toThrow(ConfigError);
    expect(() => loadConfig(path.join(FIXTURES, "does-not-exist.jsonc"))).toThrow(/not found/);
  });
});

describe("parseConfigText", () => {
  it("rejects syntactically broken JSONC", () => {
    expect(() => parseConfigText("{ version: 1 ")).toThrow(/not valid JSONC/);
  });

  it("rejects an empty document", () => {
    expect(() => parseConfigText("")).toThrow(ConfigError);
  });

  it("rejects an unsupported version", () => {
    expect(() => parseConfigText(JSON.stringify({ ...BASE, version: 2 }))).toThrow(/version/);
  });

  it("rejects an empty project name", () => {
    expect(() => parseConfigText(JSON.stringify({ ...BASE, project: { name: "" } }))).toThrow(
      /project.name/,
    );
  });

  it("rejects zero checks", () => {
    expect(() => parseConfigText(withChecks([]))).toThrow(/at least one check/);
  });

  it("rejects duplicate check names", () => {
    expect(() =>
      parseConfigText(
        withChecks([
          { name: "a", kind: "lint", command: "x" },
          { name: "a", kind: "unit", command: "y" },
        ]),
      ),
    ).toThrow(/duplicate check name "a"/);
  });

  it("rejects invalid check names", () => {
    expect(() => parseConfigText(withChecks([{ name: "Bad Name", kind: "lint", command: "x" }]))).toThrow(
      /name must match/,
    );
  });

  it("rejects an unknown kind", () => {
    expect(() => parseConfigText(withChecks([{ name: "a", kind: "fuzz", command: "x" }]))).toThrow(
      ConfigError,
    );
  });

  it("rejects a blank command", () => {
    expect(() => parseConfigText(withChecks([{ name: "a", kind: "lint", command: "   " }]))).toThrow(
      /command must not be blank/,
    );
  });

  it("rejects a non-positive timeout", () => {
    expect(() =>
      parseConfigText(withChecks([{ name: "a", kind: "lint", command: "x", timeoutSec: 0 }])),
    ).toThrow(ConfigError);
  });

  it("rejects unknown fields (typo protection)", () => {
    expect(() =>
      parseConfigText(withChecks([{ name: "a", kind: "lint", command: "x", requird: true }])),
    ).toThrow(/Unrecognized key/);
    expect(() => parseConfigText(JSON.stringify({ ...BASE, extra: 1 }))).toThrow(/Unrecognized key/);
  });

  it("rejects a config whose checks are all optional (fail closed)", () => {
    expect(() =>
      parseConfigText(withChecks([{ name: "a", kind: "lint", command: "x", required: false }])),
    ).toThrow(/at least one check must be required/);
    expect(() =>
      parseConfigText(JSON.stringify({ ...BASE, defaults: { required: false } })),
    ).toThrow(/at least one check must be required/);
  });

  it("accepts defaults.required=false when one check opts back in", () => {
    const raw = parseConfigText(
      JSON.stringify({
        ...BASE,
        defaults: { required: false },
        checks: [
          { name: "a", kind: "lint", command: "x" },
          { name: "b", kind: "unit", command: "y", required: true },
        ],
      }),
    );
    expect(raw.checks).toHaveLength(2);
  });
});

describe("resolveInsideRoot", () => {
  const root = path.resolve("/tmp/aiqh-root");

  it("resolves relative paths inside the root", () => {
    expect(resolveInsideRoot(root, ".", "x")).toBe(root);
    expect(resolveInsideRoot(root, "sub/dir", "x")).toBe(path.join(root, "sub", "dir"));
    expect(resolveInsideRoot(root, "sub/../other", "x")).toBe(path.join(root, "other"));
  });

  it("rejects escaping and absolute paths", () => {
    expect(() => resolveInsideRoot(root, "..", "cwd")).toThrow(/escapes the project root/);
    expect(() => resolveInsideRoot(root, "../sibling", "cwd")).toThrow(/escapes the project root/);
    expect(() => resolveInsideRoot(root, "sub/../../x", "cwd")).toThrow(/escapes the project root/);
    expect(() => resolveInsideRoot(root, "/etc", "cwd")).toThrow(/must be a relative path/);
  });

  it("is enforced for checks[].cwd and output.dir when loading", () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const file = path.join(tmp.dir, "aiqh.config.jsonc");
    writeFileSync(file, withChecks([{ name: "a", kind: "lint", command: "x", cwd: "../.." }]));
    expect(() => loadConfig(file)).toThrow(/escapes the project root/);

    writeFileSync(file, JSON.stringify({ ...BASE, output: { dir: "/var/tmp/out" } }));
    expect(() => loadConfig(file)).toThrow(/output.dir must be a relative path/);
  });
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
