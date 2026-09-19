/**
 * `aiqh init` (M1): read-only audit → proposal → optional writes.
 *   --write            write aiqh.config.jsonc (refuses to overwrite without --force)
 *   --force            overwrite an existing aiqh.config.jsonc
 *   --write-gitignore  append "artifacts/" to .gitignore (once)
 *   --write-scripts    add missing scripts (verify) to package.json, existing keys untouched
 * Exit codes: 0 done, 2 audit impossible / refused overwrite / nothing to configure / generated
 * config rejected by the runtime validator / write error (any of the three files, M1-R1-010).
 * Every line printed and every JSON value passes through the secret masker (M1-R1-003).
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATEGORY_KINDS, EXIT_ERROR, EXIT_PASSED } from "../types.ts";
import { buildRepoContext } from "../adapters/context.ts";
import { resolveDetections } from "../adapters/index.ts";
import type { Resolution } from "../adapters/types.ts";
import { GITIGNORE_LINE, PROPOSED_SCRIPTS, generateConfigJsonc, proposedChecks } from "../config/generate.ts";
import { ConfigError, DEFAULT_CONFIG_FILENAME, parseConfigText, resolveConfig } from "../config/load.ts";
import { maskDeep, maskSecrets } from "../security/mask.ts";
import { gitIgnoredByRepoRules } from "../security/scan.ts";

export interface InitOptions {
  cwd?: string;
  write?: boolean;
  force?: boolean;
  writeGitignore?: boolean;
  writeScripts?: boolean;
  json?: boolean;
  toolVersion: string;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

export interface AiqhResolution {
  found: boolean;
  path?: string;
  realpath?: string;
  version?: string;
}

/** Where a bare `aiqh` command would resolve from (PATH lookup, no execution). */
export function resolveAiqhOnPath(env: NodeJS.ProcessEnv = process.env): AiqhResolution {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter((d) => d.length > 0);
  for (const dir of dirs) {
    const candidate = path.join(dir, "aiqh");
    if (!existsSync(candidate)) continue;
    let real = candidate;
    try {
      real = realpathSync(candidate);
    } catch {
      // keep the link path
    }
    let version: string | undefined;
    try {
      const pkg = JSON.parse(readFileSync(path.join(path.dirname(real), "..", "package.json"), "utf8")) as { version?: string };
      version = pkg.version;
    } catch {
      // version unknown
    }
    const out: AiqhResolution = { found: true, path: candidate, realpath: real };
    if (version !== undefined) out.version = version;
    return out;
  }
  return { found: false };
}

/** A schema path is written only when the file is resolvable from the target repository. */
function resolvableSchemaPath(root: string): string | undefined {
  const rel = path.join("node_modules", "ai-quality-harness", "schema", "aiqh.config.schema.json");
  return existsSync(path.join(root, rel)) ? `./${rel}` : undefined;
}

export async function runInit(options: InitOptions): Promise<number> {
  const rawLog = options.log ?? ((line: string) => console.log(line));
  const rawLogError = options.logError ?? ((line: string) => console.error(line));
  const log = (line: string): void => rawLog(maskSecrets(line));
  const logError = (line: string): void => rawLogError(maskSecrets(line));
  const root = path.resolve(options.cwd ?? process.cwd());
  if (!existsSync(root)) {
    logError(`aiqh init: directory not found: ${root}`);
    return EXIT_ERROR;
  }
  const ctx = buildRepoContext(root);
  const resolution = resolveDetections(ctx);
  const projectName = ctx.node?.packageJson.name ?? ctx.dirName;
  const aiqh = resolveAiqhOnPath();
  const schemaPath = resolvableSchemaPath(root);
  const genOpts: Parameters<typeof generateConfigJsonc>[0] = { projectName, resolution };
  if (schemaPath !== undefined) genOpts.schemaPath = schemaPath;
  const configText = generateConfigJsonc(genOpts);
  const checks = proposedChecks(resolution);
  const configFile = path.join(root, DEFAULT_CONFIG_FILENAME);
  const gitignoreProposal = proposeGitignore(root);
  const scriptsProposal = proposeScripts(ctx.node?.packageJson.scripts ?? null, ctx.node !== null);

  if (options.json) {
    rawLog(
      JSON.stringify(
        maskDeep({
          root,
          projectName,
          projectType: resolution.projectType,
          aiqh,
          schemaPath: schemaPath ?? null,
          audit: auditRows(resolution),
          config: { checks },
          configText,
          proposals: { gitignore: gitignoreProposal, scripts: scriptsProposal },
        }),
        null,
        2,
      ),
    );
  } else {
    log(`aiqh init — ${root}`);
    log(`project: ${projectName} (${resolution.projectType})`);
    log(aiqh.found ? `aiqh resolved from PATH: ${aiqh.path} -> ${aiqh.realpath}${aiqh.version ? ` (version ${aiqh.version})` : ""}` : "aiqh not found on PATH: the \"security\" check (aiqh security-scan) needs it — run `npm link` in ai-quality-harness");
    log(schemaPath ? `$schema: ${schemaPath}` : "$schema: omitted (no schema file resolvable from this repository)");
    log("");
    log("audit:");
    for (const row of auditRows(resolution)) {
      log(`  ${row.kind.padEnd(10)} ${row.status.padEnd(12)} ${row.adapter ?? "-"}`);
      log(`             ${row.reason}`);
      if (row.command) log(`             command: ${row.command}`);
      if (row.enableHint) log(`             to enable: ${row.enableHint}`);
      for (const n of row.notes) log(`             note: ${n}`);
      for (const a of row.alternatives) log(`             alternative: ${a}`);
    }
    log("");
    log(`proposed ${DEFAULT_CONFIG_FILENAME}:`);
    log(configText.trimEnd());
    log("");
    log("additional proposals (not written unless the matching flag is given):");
    log(gitignoreProposal.needed ? `  - .gitignore: add "${GITIGNORE_LINE}" (--write-gitignore)${gitignoreProposal.reason ? ` — ${gitignoreProposal.reason}` : ""}` : `  - .gitignore: already ignores ${GITIGNORE_LINE} (confirmed with git check-ignore)`);
    if (scriptsProposal.applicable) {
      log(scriptsProposal.missing.length > 0 ? `  - package.json scripts: add ${scriptsProposal.missing.map((k) => `"${k}": ${JSON.stringify(PROPOSED_SCRIPTS[k])}`).join(", ")} (--write-scripts)` : "  - package.json scripts: nothing to add");
    }
    log("");
  }

  let exit = EXIT_PASSED;
  if (options.write) {
    if (checks.length === 0) {
      logError("aiqh init: no check could be detected; refusing to write a config that would have nothing to verify");
      return EXIT_ERROR;
    }
    if (existsSync(configFile) && !options.force) {
      logError(`aiqh init: ${DEFAULT_CONFIG_FILENAME} already exists (use --force to overwrite; git diff can restore it)`);
      return EXIT_ERROR;
    }
    // The generated text must pass the same parser / resolver `aiqh verify` uses (M1-R1-006):
    // zero required checks, duplicate names or a blank command are refused here, never written.
    try {
      resolveConfig(parseConfigText(configText, DEFAULT_CONFIG_FILENAME), configFile);
    } catch (err) {
      const message = err instanceof ConfigError ? err.message : (err as Error).message;
      logError(`aiqh init: refusing to write a config that aiqh verify would reject: ${message}`);
      return EXIT_ERROR;
    }
    try {
      writeFileSync(configFile, configText, "utf8");
      log(`wrote ${configFile}`);
    } catch (err) {
      logError(`aiqh init: failed to write ${configFile}: ${(err as Error).message}`);
      exit = EXIT_ERROR;
    }
  }
  // The optional writes are independent: a failure in one is reported (exit 2) and does not undo
  // the others, so a run with several flags can leave a partial update (documented in CONFIG_SPEC).
  if (options.writeGitignore) {
    if (gitignoreProposal.needed) {
      const file = path.join(root, ".gitignore");
      try {
        const current = existsSync(file) ? readFileSync(file, "utf8") : "";
        // Idempotent append: outside a git repository the proposal is always made (cannot ask git),
        // but the same line is never added twice (M1-R2-005).
        if (hasGitignoreLine(current)) {
          log(`.gitignore already contains "${GITIGNORE_LINE}"; nothing written`);
        } else {
          const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
          writeFileSync(file, `${current}${sep}${GITIGNORE_LINE}\n`, "utf8");
          log(`appended "${GITIGNORE_LINE}" to ${file}`);
        }
      } catch (err) {
        logError(`aiqh init: failed to update ${file}: ${(err as Error).message}`);
        exit = EXIT_ERROR;
      }
    } else {
      log(`.gitignore already ignores ${GITIGNORE_LINE}; nothing written`);
    }
  }
  if (options.writeScripts && scriptsProposal.applicable && scriptsProposal.missing.length > 0) {
    const file = path.join(root, "package.json");
    try {
      const text = readFileSync(file, "utf8");
      const indent = /^(\s+)"/m.exec(text)?.[1] ?? "  ";
      const pkg = JSON.parse(text) as Record<string, unknown>;
      const scripts = { ...((pkg.scripts as Record<string, string> | undefined) ?? {}) };
      for (const key of scriptsProposal.missing) scripts[key] = PROPOSED_SCRIPTS[key] ?? "";
      pkg.scripts = scripts;
      writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`, "utf8");
      log(`added scripts ${scriptsProposal.missing.join(", ")} to ${file}`);
    } catch (err) {
      logError(`aiqh init: failed to update ${file}: ${(err as Error).message}`);
      exit = EXIT_ERROR;
    }
  }
  return exit;
}

interface AuditRow {
  kind: string;
  status: string;
  adapter: string | null;
  reason: string;
  command: string | null;
  enableHint: string | null;
  notes: string[];
  alternatives: string[];
}

function auditRows(resolution: Resolution): AuditRow[] {
  return CATEGORY_KINDS.map((kind) => {
    const r = resolution.byKind[kind];
    if (r.chosen) {
      return { kind, status: "available", adapter: r.chosen.adapter, reason: r.chosen.reason, command: r.chosen.suggestion?.command ?? null, enableHint: null, notes: r.chosen.notes ?? [], alternatives: r.alternatives.map((a) => `${a.adapter}: ${a.suggestion?.command ?? ""}`) };
    }
    const first = r.unavailable[0];
    return { kind, status: r.unavailable.length > 0 ? "unavailable" : "not-applicable", adapter: first?.adapter ?? null, reason: r.unavailable.map((u) => u.reason).join(" / ") || "no adapter applies", command: null, enableHint: r.unavailable.find((u) => u.enableHint)?.enableHint ?? null, notes: r.unavailable.flatMap((u) => u.notes ?? []), alternatives: [] };
  });
}

/** Representative path under artifacts/ whose ignore status decides the proposal (M1-R2-005). */
const GITIGNORE_PROBE = "artifacts/.aiqh-ignore-probe";

/**
 * Whether `artifacts/` should be proposed for .gitignore. Decided by git itself (check-ignore with
 * the same rule as the security scan: a non-negated rule of a repository .gitignore). Outside a git
 * repository, or when git fails, the proposal is made (safe side) with a reason.
 */
export function proposeGitignore(root: string): { needed: boolean; reason?: string } {
  if (!existsSync(path.join(root, ".gitignore"))) return { needed: true, reason: "no .gitignore" };
  if (!existsSync(path.join(root, ".git"))) return { needed: true, reason: "not a git repository: cannot ask git whether artifacts/ is ignored" };
  try {
    return gitIgnoredByRepoRules(root, [GITIGNORE_PROBE]).has(GITIGNORE_PROBE) ? { needed: false } : { needed: true, reason: "git check-ignore: artifacts/ is not ignored by a .gitignore rule" };
  } catch {
    return { needed: true, reason: "git check-ignore failed: cannot confirm; add the line if it is missing" };
  }
}

function hasGitignoreLine(text: string): boolean {
  return text.split(/\r?\n/).some((l) => l.trim() === GITIGNORE_LINE);
}

function proposeScripts(scripts: Record<string, string> | null, applicable: boolean): { applicable: boolean; missing: string[] } {
  if (!applicable) return { applicable: false, missing: [] };
  return { applicable: true, missing: Object.keys(PROPOSED_SCRIPTS).filter((k) => !(scripts && k in scripts)) };
}
