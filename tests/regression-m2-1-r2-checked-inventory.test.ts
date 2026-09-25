/**
 * M2-1 R2 (structure against the kind of leak in R2-001 / R2-005 / R2-006 / R2-007): user-derived strings
 * reach the packet renderers and the ZIP entry name only as `Checked` values, which only the check function
 * of src/review/checked.ts creates (raw characters and secret shapes); and every option of
 * `aiqh review-packet` is listed in one inventory that decides how its value is checked.
 *  - the inventory's keys equal the options that cli.ts registers (read from `--help`, so a new option
 *    without an inventory entry fails here)
 *  - (M2-2) the text search for `as Checked` was replaced by the brand guard with the type checker and a
 *    run-time registry: tests/regression-m2-2-r3-004-brand-forgery.test.ts (M2-1-R3-004)
 *  - type level (npm run typecheck): a plain string is rejected by inlineCode / createStoredZip, and packet
 *    text is built with the `md` template, which takes only rendered fragments and numbers
 *  - the leak the typed template found: latest.json values of another commit were interpolated as is
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OPTION_INVENTORY, runReviewPacket } from "../src/commands/review-packet.ts";
import { checkValue } from "../src/review/checked.ts";
import { inlineCode, md } from "../src/review/packet.ts";
import { createStoredZip } from "../src/review/zip.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Long option names of `aiqh review-packet --help`, as commander attribute names (camelCase). */
function registeredOptions(): string[] {
  const r = spawnSync(process.execPath, [path.join(ROOT, "src", "cli.ts"), "review-packet", "--help"], { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
  expect(r.status, r.stderr).toBe(0);
  const names = new Set<string>();
  for (const line of r.stdout.split("\n")) {
    const m = /^\s+(?:-\w,\s+)?--([a-z][a-z-]*)/.exec(line);
    if (m?.[1] && m[1] !== "help") names.add(m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));
  }
  return [...names].sort();
}

/** Never called: the @ts-expect-error lines fail `npm run typecheck` if a plain string becomes acceptable. */
function typeLevel(): void {
  // @ts-expect-error a plain string is not a Checked value
  inlineCode("plain");
  // @ts-expect-error a ZIP entry name must be a Checked value
  createStoredZip([{ name: "p.md", data: Buffer.alloc(0) }]);
  const ok = checkValue("x", DEFAULT_SECURITY);
  // @ts-expect-error a Checked value is not Markdown: it goes through a renderer (inlineCode, cellCode, plainOrCode)
  if (ok.ok) void md`${ok.value}`;
  // @ts-expect-error a plain string cannot be interpolated into packet text
  void md`${"plain"}`;
}
void typeLevel;

describe("M2-1 R2: checked strings and the option inventory", () => {
  it("the inventory lists exactly the options registered for review-packet in cli.ts", () => {
    expect(Object.keys(OPTION_INVENTORY).sort()).toEqual(registeredOptions());
  });

  it("found by the typed template: latest.json values for another commit (git.commit, git.dirty) cannot change the Markdown", async () => {
    const t = makeTempDir("aiqh-r2-structure-");
    cleanups.push(t.cleanup);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "base");
    const base = git("rev-parse", "HEAD").trim();
    git("commit", "-q", "--allow-empty", "-m", "change");
    mkdirSync(path.join(t.dir, "artifacts", "verification"), { recursive: true });
    const tick = String.fromCodePoint(0x60);
    for (const [label, gitInfo] of [
      ["dirty", { commit: "abc", dirty: "no\n\n# Fake heading\n" }],
      ["commit", { commit: `x${tick}y${tick} # z`, dirty: false }],
    ] as const) {
      writeFileSync(path.join(t.dir, "artifacts", "verification", "latest.json"), JSON.stringify({ git: gitInfo, verdict: "PASSED" }));
      const err: string[] = [];
      const code = await runReviewPacket({ cwd: t.dir, range: `${base}..HEAD`, label, toolVersion: "t", log: () => {}, logError: (l) => err.push(l) });
      expect(code, err.join("\n")).toBe(0);
      const md = readFileSync(path.join(t.dir, "artifacts", "ai-review", `review-packet-${label}.md`), "utf8");
      const top = md.split("\n").filter((l) => l.startsWith("# "));
      expect(top, label).toHaveLength(10);
      const line = md.split("\n").find((l) => l.startsWith("No verify result for <to>")) ?? "";
      expect([...line.matchAll(/`+/g)].every((m) => m[0].length === 1), line).toBe(true);
      expect([...line.matchAll(/`/g)].length % 2, line).toBe(0);
    }
  });

  it("checkValue: a clean value becomes Checked; raw characters and secret shapes are findings without the value", () => {
    const ok = checkValue("docs/plain.md", DEFAULT_SECURITY);
    expect(ok.ok && inlineCode(ok.value)).toBe("`docs/plain.md`");
    const raw = checkValue(`a${String.fromCodePoint(0x202e)}b`, DEFAULT_SECURITY);
    expect(raw).toEqual({ ok: false, findings: [{ kind: "raw-char", line: 1, detail: "U+202E" }] });
    const secret = checkValue(`x/${fake("AKIA", "QWERTYUIOPASDFGH")}.md`, DEFAULT_SECURITY);
    expect(secret).toEqual({ ok: false, findings: [{ kind: "secret", line: 1, detail: "aws" }] });
  });
});
