import path from "node:path";
import { EXIT_ERROR, EXIT_FAILED, EXIT_PASSED } from "../types.ts";
import type { ResolvedSecurity } from "../types.ts";
import { ConfigError, loadSecurityConfig } from "../config/load.ts";
import { createOutput } from "../output.ts";
import { ScanError, scanRepository, type ScanResult } from "../security/scan.ts";

export interface SecurityScanOptions {
  cwd?: string;
  json?: boolean;
  /**
   * Config to read the `security` section from; default <cwd>/aiqh.config.jsonc (does not exist ⇒ defaults; exists but
   * cannot be read ⇒ exit 2). Read by loadSecurityConfig, shared with review-packet.
   */
  configPath?: string;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

/**
 * `aiqh security-scan`: 0 = no findings, 1 = findings, 2 = not a git repository / read error /
 * invalid config (fail closed). Never prints a matched value. Suppressions by `security.allow` are
 * always listed (M2-0 §7).
 */
export async function runSecurityScan(options: SecurityScanOptions): Promise<number> {
  // Every printed line and every JSON value goes through the output boundary (src/output.ts, M2-2-R2-001): raw
  // characters in paths, file names and error messages become ASCII notation, then the masker (M2-0-R1-002), so
  // config-provided free text (allow reasons, paths) cannot re-emit a secret.
  const output = createOutput({ log: options.log, logError: options.logError });
  const log = output.log;
  const logError = output.error;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  let security: ResolvedSecurity;
  try {
    security = loadSecurityConfig(cwd, options.configPath);
  } catch (err) {
    if (err instanceof ConfigError) {
      logError(`aiqh security-scan: ${err.message}`);
      return EXIT_ERROR;
    }
    throw err;
  }
  let result: ScanResult;
  try {
    result = scanRepository(cwd, security);
  } catch (err) {
    if (err instanceof ScanError) {
      logError(`aiqh security-scan: ${err.message}`);
      return EXIT_ERROR;
    }
    throw err;
  }
  if (options.json) {
    output.json(result);
    return result.findings.length === 0 ? EXIT_PASSED : EXIT_FAILED;
  }
  renderText(result, log);
  return result.findings.length === 0 ? EXIT_PASSED : EXIT_FAILED;
}

function describeRule(u: ScanResult["allowUsage"][number]): string {
  return `#${u.rule + 1} path=${u.path}${u.category ? ` category=${u.category}` : ""}${u.line !== null ? ` line=${u.line}` : ""}${u.expires ? ` expires=${u.expires}` : ""} — ${u.reason}`;
}

function renderText(r: ScanResult, log: (line: string) => void): void {
  log(`aiqh security-scan — ${r.root}`);
  log(`tracked files: ${r.filesTracked}, untracked (not ignored): ${r.filesUntracked}, scanned: ${r.filesScanned}, skipped binary: ${r.skippedBinary}`);
  log(`scanned categories: ${r.scannedCategories.join(", ")} (key-value: only values that look like secrets)`);
  log("not scanned (mask-only categories; values in reports are still redacted):");
  for (const u of r.unscannedCategories) log(`  - ${u.category}: ${u.reason}`);
  if (r.exampleEnvFiles.length > 0) log(`example env files (allowed): ${r.exampleEnvFiles.join(", ")}`);
  log("");
  const secrets = r.findings.filter((f) => f.kind === "secret");
  const oversized = r.findings.filter((f) => f.kind === "oversized-candidate");
  const envs = r.findings.filter((f) => f.kind === "tracked-env");
  const untrackedEnvs = r.findings.filter((f) => f.kind === "untracked-env");
  const gi = r.findings.filter((f) => f.kind === "gitignore");
  log(`findings: ${r.findings.length} (secret-shaped: ${secrets.length}, oversized candidates: ${oversized.length}, tracked .env: ${envs.length}, untracked .env not ignored: ${untrackedEnvs.length}, .gitignore: ${gi.length})`);
  for (const f of secrets) log(`  [secret] ${f.file}:${f.line}${f.endLine !== undefined && f.endLine !== f.line ? `-${f.endLine}` : ""} ${f.category} (value not shown)`);
  for (const f of oversized) log(`  [oversized-candidate] ${f.file}:${f.line} ${f.category} — ${f.message}`);
  for (const f of envs) log(`  [tracked-env] ${f.file} — ${f.message}`);
  for (const f of untrackedEnvs) log(`  [untracked-env] ${f.file} — ${f.message} (not read)`);
  for (const f of gi) log(`  [gitignore] ${f.message}`);
  if (r.allowUsage.length > 0) {
    log(`suppressed by security.allow: ${r.suppressed.length}`);
    for (const s of r.suppressed) log(`  [allowed] ${s.file}:${s.line} ${s.category} by rule #${s.rule + 1}`);
    for (const u of r.allowUsage.filter((x) => x.count > 0)) log(`  rule used ${u.count}×: ${describeRule(u)}`);
    for (const i of r.expiredAllows) {
      const u = r.allowUsage[i];
      if (u) log(`  warning: expired allow rule ${describeRule(u)}`);
    }
    for (const i of r.unusedAllows) {
      const u = r.allowUsage[i];
      if (u) log(`  warning: unused allow rule ${describeRule(u)}`);
    }
  }
  log("");
  log(r.findings.length === 0 ? "SECURITY SCAN: no findings" : "SECURITY SCAN: findings present (see above)");
}
