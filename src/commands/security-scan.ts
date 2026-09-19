import { EXIT_ERROR, EXIT_FAILED, EXIT_PASSED } from "../types.ts";
import { ScanError, scanRepository, type ScanResult } from "../security/scan.ts";

export interface SecurityScanOptions {
  cwd?: string;
  json?: boolean;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

/**
 * `aiqh security-scan`: 0 = no findings, 1 = findings, 2 = not a git repository / read error (fail closed).
 * Never prints a matched value.
 */
export async function runSecurityScan(options: SecurityScanOptions): Promise<number> {
  const log = options.log ?? ((line: string) => console.log(line));
  const logError = options.logError ?? ((line: string) => console.error(line));
  let result: ScanResult;
  try {
    result = scanRepository(options.cwd ?? process.cwd());
  } catch (err) {
    if (err instanceof ScanError) {
      logError(`aiqh security-scan: ${err.message}`);
      return EXIT_ERROR;
    }
    throw err;
  }
  if (options.json) {
    log(JSON.stringify(result, null, 2));
    return result.findings.length === 0 ? EXIT_PASSED : EXIT_FAILED;
  }
  renderText(result, log);
  return result.findings.length === 0 ? EXIT_PASSED : EXIT_FAILED;
}

function renderText(r: ScanResult, log: (line: string) => void): void {
  log(`aiqh security-scan — ${r.root}`);
  log(`tracked files: ${r.filesTracked}, untracked (not ignored): ${r.filesUntracked}, scanned: ${r.filesScanned}, skipped binary: ${r.skippedBinary}`);
  log(`scanned categories: ${r.scannedCategories.join(", ")}`);
  log("not scanned (mask-only categories; values in reports are still redacted):");
  for (const u of r.unscannedCategories) log(`  - ${u.category}: ${u.reason}`);
  if (r.exampleEnvFiles.length > 0) log(`example env files (allowed): ${r.exampleEnvFiles.join(", ")}`);
  log("");
  const secrets = r.findings.filter((f) => f.kind === "secret");
  const envs = r.findings.filter((f) => f.kind === "tracked-env");
  const untrackedEnvs = r.findings.filter((f) => f.kind === "untracked-env");
  const gi = r.findings.filter((f) => f.kind === "gitignore");
  log(`findings: ${r.findings.length} (secret-shaped: ${secrets.length}, tracked .env: ${envs.length}, untracked .env not ignored: ${untrackedEnvs.length}, .gitignore: ${gi.length})`);
  for (const f of secrets) log(`  [secret] ${f.file}:${f.line}${f.endLine !== undefined && f.endLine !== f.line ? `-${f.endLine}` : ""} ${f.category} (value not shown)`);
  for (const f of envs) log(`  [tracked-env] ${f.file} — ${f.message}`);
  for (const f of untrackedEnvs) log(`  [untracked-env] ${f.file} — ${f.message} (not read)`);
  for (const f of gi) log(`  [gitignore] ${f.message}`);
  log("");
  log(r.findings.length === 0 ? "SECURITY SCAN: no findings" : "SECURITY SCAN: findings present (see above)");
}
