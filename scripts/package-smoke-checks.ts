/**
 * Bin-target assertions for the distribution smoke test (R3-003).
 * Kept in a side-effect-free module so it can be unit-tested with fixture layouts.
 */
import { existsSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";

/**
 * Verify that the installed package's `bin.<binName>` is exactly `expected` (e.g. "dist/cli.js")
 * and, on POSIX, that `node_modules/.bin/<binName>` is a symlink resolving to that file.
 * Returns a list of problems (empty when everything matches).
 */
export function checkBinTarget(consumerDir: string, pkgName: string, binName: string, expected: string): string[] {
  const problems: string[] = [];
  const installed = path.join(consumerDir, "node_modules", pkgName);
  const pkgJsonPath = path.join(installed, "package.json");
  if (!existsSync(pkgJsonPath)) {
    return [`installed package.json missing: ${pkgJsonPath}`];
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { name?: string; bin?: string | Record<string, string> };

  // package.json "bin": a string means "one command named after the package".
  let actual: string | undefined;
  if (typeof pkg.bin === "string") {
    actual = pkg.name === binName ? pkg.bin : undefined;
    if (actual === undefined) {
      problems.push(`installed bin is the string form ${JSON.stringify(pkg.bin)} (command "${pkg.name ?? "?"}"), not bin.${binName}`);
    }
  } else {
    actual = pkg.bin?.[binName];
  }
  if (actual !== undefined && actual !== expected) {
    problems.push(`installed bin.${binName} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  } else if (actual === undefined && typeof pkg.bin !== "string") {
    problems.push(`installed package.json has no bin.${binName}`);
  }

  // The bin link must resolve to the expected file (POSIX symlink; Windows uses cmd shims).
  const link = path.join(consumerDir, "node_modules", ".bin", binName);
  if (!existsSync(link)) {
    problems.push(`bin link node_modules/.bin/${binName} missing`);
    return problems;
  }
  if (process.platform !== "win32") {
    let target: string;
    try {
      target = readlinkSync(link);
    } catch (err) {
      problems.push(`node_modules/.bin/${binName} is not a symlink (${(err as NodeJS.ErrnoException).code ?? "error"})`);
      return problems;
    }
    const resolved = safeRealpath(path.resolve(path.dirname(link), target));
    const wanted = safeRealpath(path.join(installed, expected));
    if (resolved !== wanted) {
      problems.push(`node_modules/.bin/${binName} -> ${target} resolves to ${resolved}, expected ${wanted}`);
    }
  }
  return problems;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
