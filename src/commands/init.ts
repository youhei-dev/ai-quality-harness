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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATEGORY_KINDS, EXIT_ERROR, EXIT_PASSED } from "../types.ts";
import { buildRepoContext } from "../adapters/context.ts";
import { resolveDetections } from "../adapters/index.ts";
import type { Resolution } from "../adapters/types.ts";
import { GITIGNORE_LINE, PROPOSED_SCRIPTS, generateConfigJsonc, proposedChecks } from "../config/generate.ts";
import { ConfigError, DEFAULT_CONFIG_FILENAME, parseConfigText, resolveConfig } from "../config/load.ts";
import { createOutput } from "../output.ts";
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
  // Every printed line and the JSON go through the output boundary (src/output.ts, M2-2-R2-001): raw characters in
  // paths and detected names become ASCII notation, then the masker.
  const output = createOutput({ log: options.log, logError: options.logError });
  const log = output.log;
  const logError = output.error;
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
    output.json({
      root,
      projectName,
      projectType: resolution.projectType,
      aiqh,
      schemaPath: schemaPath ?? null,
      audit: auditRows(resolution),
      config: { checks },
      configText,
      proposals: { gitignore: gitignoreProposal, scripts: scriptsProposal },
    });
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
        // Three cases (M1-R3-002 → M2-0-R1-003):
        //  (a) tracked .gitignore and git says the artifact paths are not ignored (a later negation
        //      wins): append the line at the end — the repair — even if the same line exists earlier;
        //      the next run sees coverage, so nothing is appended twice;
        //  (b) untracked .gitignore that already has the canonical line: its rules do not count as
        //      coverage (they do not exist in a clone), but appending again would only duplicate the
        //      line — tell the user to track the file instead;
        //  (c) no .gitignore (or a git repository that cannot be asked): create / append once; the
        //      same line is never added twice.
        const lineExists = hasGitignoreLine(current);
        if (gitignoreProposal.canAskGit && !gitignoreProposal.gitignoreTracked && lineExists) {
          log(`.gitignore contains "${GITIGNORE_LINE}" but is not tracked; git add .gitignore to make the policy reproducible (nothing written)`);
        } else if (!gitignoreProposal.canAskGit && lineExists) {
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

/** The artifact paths aiqh actually writes; all of them must be ignored (M2-0 / M1-R3-003). */
export const GITIGNORE_PROBES = ["artifacts/verification/latest.json", "artifacts/verification/latest.md", "artifacts/verification/history/probe.json", "artifacts/ai-review/probe.md"];

/**
 * Whether `artifacts/` should be proposed for .gitignore. Decided by git itself (check-ignore with
 * the same rule as the security scan: a non-negated rule of a *tracked* repository .gitignore) for
 * every real artifact path. Outside a git repository, or when git fails, the proposal is made
 * (safe side) with a reason; `canAskGit` tells the writer whether appending is the repair.
 */
export function proposeGitignore(root: string): { needed: boolean; reason?: string; canAskGit: boolean; gitignoreTracked: boolean } {
  if (!existsSync(path.join(root, ".gitignore"))) return { needed: true, reason: "no .gitignore", canAskGit: false, gitignoreTracked: false };
  if (!existsSync(path.join(root, ".git"))) return { needed: true, reason: "not a git repository: cannot ask git whether artifacts/ is ignored", canAskGit: false, gitignoreTracked: false };
  try {
    const ignored = gitIgnoredByRepoRules(root, GITIGNORE_PROBES);
    const missing = GITIGNORE_PROBES.filter((p) => !ignored.has(p));
    const gitignoreTracked = isTracked(root, ".gitignore");
    if (missing.length === 0) return { needed: false, canAskGit: true, gitignoreTracked };
    const reason = gitignoreTracked ? `git check-ignore: not ignored by a tracked .gitignore rule: ${missing.join(", ")}` : ".gitignore is not tracked by git, so its rules do not exist in a clone";
    return { needed: true, reason, canAskGit: true, gitignoreTracked };
  } catch {
    return { needed: true, reason: "git check-ignore failed: cannot confirm; add the line if it is missing", canAskGit: false, gitignoreTracked: false };
  }
}

/** Whether `rel` is in the git index (an untracked .gitignore does not exist in a clone). */
function isTracked(root: string, rel: string): boolean {
  try {
    return execFileSync("git", ["ls-files", "-z", "--", rel], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\0").includes(rel);
  } catch {
    return false;
  }
}

function hasGitignoreLine(text: string): boolean {
  return text.split(/\r?\n/).some((l) => l.trim() === GITIGNORE_LINE);
}

function proposeScripts(scripts: Record<string, string> | null, applicable: boolean): { applicable: boolean; missing: string[] } {
  if (!applicable) return { applicable: false, missing: [] };
  return { applicable: true, missing: Object.keys(PROPOSED_SCRIPTS).filter((k) => !(scripts && k in scripts)) };
}
