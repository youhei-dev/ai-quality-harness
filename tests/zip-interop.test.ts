/**
 * M2-1 R1 (reviewer's note, not a finding): the stored ZIP is also checked by other tools. Each test runs
 * only where its tool is available — `unzip -v` exits 0, or `python3 -c "import zipfile"` exits 0 — and is
 * skipped otherwise (the skip condition is the tool check itself, nothing else). Expected values are computed
 * with Node (node:crypto), never with another external command (M2-1-R2-004).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStoredZip } from "../src/review/zip.ts";
import { checked, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const HAS_UNZIP = spawnSync("unzip", ["-v"], { stdio: "ignore" }).status === 0;
const HAS_PYTHON_ZIPFILE = spawnSync("python3", ["-c", "import zipfile"], { stdio: "ignore" }).status === 0;

function sample(): { file: string; entries: Array<{ name: string; data: Buffer }> } {
  const t = makeTempDir("aiqh-zip-interop-");
  cleanups.push(t.cleanup);
  const entries = [
    { name: checked("review-packet-demo.md"), data: Buffer.from("# Review Packet\n\n" + `${String.fromCodePoint(0x65e5, 0x672c)} \`code\`\n`.repeat(300), "utf8") },
    { name: checked("dir/empty.txt"), data: Buffer.alloc(0) },
    { name: checked("bytes.bin"), data: Buffer.from([0, 1, 2, 250, 251, 255]) },
  ];
  const file = path.join(t.dir, "sample.zip");
  writeFileSync(file, createStoredZip(entries));
  return { file, entries };
}

describe("ZIP interoperability", () => {
  it.skipIf(!HAS_UNZIP)("unzip -t accepts the archive and unzip -p returns each entry byte for byte", () => {
    const { file, entries } = sample();
    const test = spawnSync("unzip", ["-t", file], { encoding: "utf8" });
    expect(test.status, test.stdout + test.stderr).toBe(0);
    expect(test.stdout).toContain("No errors detected");
    for (const e of entries) {
      const out = spawnSync("unzip", ["-p", file, e.name]);
      expect(out.status).toBe(0);
      expect(Buffer.from(out.stdout).equals(e.data), e.name).toBe(true);
    }
  });

  it.skipIf(!HAS_PYTHON_ZIPFILE)("Python zipfile: testzip() is None, names, method 0, 1980-01-01 and contents match", () => {
    const { file, entries } = sample();
    const script = [
      "import sys, zipfile, hashlib, json",
      "z = zipfile.ZipFile(sys.argv[1])",
      "print(json.dumps({'bad': z.testzip(), 'entries': [[i.filename, i.compress_type, list(i.date_time), hashlib.sha256(z.read(i.filename)).hexdigest()] for i in z.infolist()]}))",
    ].join("\n");
    const res = spawnSync("python3", ["-c", script, file], { encoding: "utf8" });
    expect(res.status, res.stderr).toBe(0);
    const parsed = JSON.parse(res.stdout) as { bad: string | null; entries: Array<[string, number, number[], string]> };
    expect(parsed.bad).toBeNull();
    const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
    expect(parsed.entries).toEqual(entries.map((e) => [e.name, 0, [1980, 1, 1, 0, 0, 0], sha(e.data)]));
  });
});
