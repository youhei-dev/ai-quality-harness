/**
 * M1-R1-003: `aiqh init` must not copy package.json script bodies (which may contain secrets) into
 * its console output, its --json output, the proposed config text or a written config.
 */
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { NODE_ADAPTERS } from "../src/adapters/node.ts";
import { runInit } from "../src/commands/init.ts";
import { fake, makeTempDir } from "./helpers.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const TOKEN = fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789");

function target(): string {
  const t = makeTempDir("aiqh-r1-003-");
  cleanups.push(t.cleanup);
  cpSync(path.join(FIX, "node-next-vitest"), t.dir, { recursive: true });
  const file = path.join(t.dir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8")) as { scripts: Record<string, string> };
  pkg.scripts.lint = `eslint . --token=${TOKEN}`;
  pkg.scripts.typecheck = `tsc --noEmit # ${TOKEN}`;
  pkg.scripts.build = `next build && echo ${TOKEN}`;
  pkg.scripts.test = `vitest run --reporter=${TOKEN}`;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return t.dir;
}
async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}) {
  const lines: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...opts });
  return { code, output: lines.join("\n") };
}

describe("M1-R1-003: script bodies never leave package.json", () => {
  it("adapter reasons describe existence only", () => {
    const ctx = buildRepoContext(target());
    for (const a of NODE_ADAPTERS) {
      const d = a.detect(ctx);
      const text = JSON.stringify(d ?? {});
      expect(text, a.id).not.toContain(TOKEN);
    }
  });
  it("proposal output contains no script body", async () => {
    const r = await init(target());
    expect(r.code).toBe(0);
    expect(r.output).not.toContain(TOKEN);
  });
  it("--json output contains no script body", async () => {
    const r = await init(target(), { json: true });
    expect(r.output).not.toContain(TOKEN);
    const parsed = JSON.parse(r.output) as { configText: string };
    expect(parsed.configText).not.toContain(TOKEN);
  });
  it("a written aiqh.config.jsonc contains no script body", async () => {
    const dir = target();
    const r = await init(dir, { write: true });
    expect(r.code).toBe(0);
    expect(readFileSync(path.join(dir, "aiqh.config.jsonc"), "utf8")).not.toContain(TOKEN);
  });
});
