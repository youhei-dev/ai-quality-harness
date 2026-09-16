/**
 * Distribution smoke test (R2-005, formerly R-008).
 *
 * npm pack → temporary consumer project → install the tarball → minimal aiqh.config.jsonc →
 * `npx --no-install aiqh verify` → exit 0 and a report. In one run this checks: bin, shebang,
 * `files` (dist bundled, src/tests excluded), runtime dependencies resolved, and the version read
 * from the installed package.json.
 *
 * Network: `--prefer-offline` — runtime dependencies come from the npm cache when present and are
 * fetched from the registry only when missing. Registered as the required "package" check in
 * aiqh.config.jsonc, after "build".
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkBinTarget } from "./package-smoke-checks.ts";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
};
const started = Date.now();
const problems: string[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) problems.push(message);
};

function npm(args: string[], cwd: string): string {
  return execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "aiqh-pack-"));
try {
  // 1. npm pack
  const packInfo = JSON.parse(npm(["pack", "--json", "--pack-destination", tmp], root)) as Array<{
    filename: string;
    files: Array<{ path: string }>;
  }>;
  const info = packInfo[0];
  if (!info) throw new Error("npm pack returned no entries");
  const tarball = path.join(tmp, info.filename);
  const packed = info.files.map((f) => f.path);
  check(packed.includes("package.json"), "tarball lacks package.json");
  check(packed.includes("dist/cli.js"), "tarball lacks dist/cli.js");
  check(
    !packed.some((f) => f.startsWith("src/") || f.startsWith("tests/") || f.startsWith("scripts/")),
    "tarball contains src/, tests/ or scripts/",
  );
  console.log(`package-smoke: packed ${info.filename} (${packed.length} files)`);

  // 2. consumer project
  const consumer = path.join(tmp, "consumer");
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "aiqh-smoke-consumer", private: true }));

  // 3. install the tarball (runtime deps from cache when possible)
  npm(["install", "--prefer-offline", "--no-audit", "--no-fund", "--ignore-scripts", tarball], consumer);
  const installed = path.join(consumer, "node_modules", pkg.name);
  check(existsSync(path.join(installed, "dist", "cli.js")), "installed package lacks dist/cli.js");
  const firstLine = readFileSync(path.join(installed, "dist", "cli.js"), "utf8").split("\n")[0];
  check(firstLine === "#!/usr/bin/env node", `dist/cli.js shebang is ${JSON.stringify(firstLine)}`);
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    check(existsSync(path.join(consumer, "node_modules", dep, "package.json")), `runtime dependency not installed: ${dep}`);
  }
  check(existsSync(path.join(consumer, "node_modules", ".bin", "aiqh")), "bin link node_modules/.bin/aiqh missing");
  // R3-003: the M0 requirement is that bin points at the built dist/cli.js — assert the exact
  // value in the installed package.json and the symlink target of node_modules/.bin/aiqh.
  problems.push(...checkBinTarget(consumer, pkg.name, "aiqh", "dist/cli.js"));

  // 4. version comes from the installed package.json
  const version = execFileSync("npx", ["--no-install", "aiqh", "--version"], { cwd: consumer, encoding: "utf8" }).trim();
  check(version === pkg.version, `aiqh --version printed ${version}, expected ${pkg.version}`);

  // 5. minimal config and verify. The consumer config must NOT contain a "package" check
  //    (it would run this smoke test recursively); a single no-op custom check is enough.
  writeFileSync(
    path.join(consumer, "aiqh.config.jsonc"),
    `// smoke config (no package check here: recursion guard)\n${JSON.stringify(
      {
        version: 1,
        project: { name: "aiqh-smoke-consumer" },
        checks: [{ name: "noop", kind: "custom", command: 'node -e "process.exit(0)"' }],
      },
      null,
      2,
    )}\n`,
  );
  const run = spawnSync("npx", ["--no-install", "aiqh", "verify"], { cwd: consumer, encoding: "utf8" });
  check(run.status === 0, `aiqh verify exited with ${run.status}: ${run.stderr.trim().split("\n").slice(-3).join(" | ")}`);
  check(run.stdout.includes("VERIFY PASSED"), "aiqh verify did not print VERIFY PASSED");
  const reportPath = path.join(consumer, "artifacts", "verification", "latest.json");
  check(existsSync(reportPath), "latest.json not written");
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as { verdict: string; tool: { version: string } };
    check(report.verdict === "PASSED", `report verdict is ${report.verdict}`);
    check(report.tool.version === pkg.version, `report tool.version is ${report.tool.version}`);
  }
  check(existsSync(path.join(consumer, "artifacts", "verification", "latest.md")), "latest.md not written");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const elapsed = Date.now() - started;
if (problems.length > 0) {
  for (const p of problems) console.error(`package-smoke: FAIL: ${p}`);
  console.error(`package-smoke: ${problems.length} problem(s) in ${elapsed}ms`);
  process.exitCode = 1;
} else {
  console.log(`package-smoke: PASS (${elapsed}ms)`);
}
