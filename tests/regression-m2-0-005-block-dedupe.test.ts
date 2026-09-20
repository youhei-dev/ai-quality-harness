/**
 * M2-0 / M1-R3-005: a complete PEM block repeated by the window overlap is reported once.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LineAssembler, scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("M2-0 / M1-R3-005: PEM block findings are merged across windows", () => {
  it("one-line PEM block inside the overlap region → exactly one private-key finding", () => {
    let end = 0;
    const a = new LineAssembler((line) => {
      if (end === 0) end = line.length;
    });
    for (let i = 0; i < 8 && end === 0; i += 1) a.push("-".repeat(64 * 1024));
    const pem = `${fake("-----BEGIN ", "PRIVATE KEY-----")}x${fake("-----END ", "PRIVATE KEY-----")}`;
    const t = makeTempDir("aiqh-m20-005-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
    writeFileSync(path.join(t.dir, "pem.txt"), "-".repeat(end - 2000) + pem + "-".repeat(100_000));
    execFileSync("git", ["add", "--", ".gitignore", "pem.txt"], { cwd: t.dir });
    const keys = scanRepository(t.dir).findings.filter((f) => f.category === "private-key");
    expect(keys.map((k) => [k.line, k.endLine])).toEqual([[1, 1]]);
  });
});
