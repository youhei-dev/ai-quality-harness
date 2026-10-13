import { readdirSync, type Stats } from "node:fs";
import path from "node:path";
import { ConfigError, resolveInsideRoot } from "../config/load.ts";
import { isCommitObject, workTree } from "../git/info.ts";
import { createOutput } from "../output.ts";
import { checkRounds, type CheckProblem, type CommitLookup, type Round } from "../review/check.ts";
import { errorCode, lstatOrNull, readFindingsFile } from "../review/findings-file.ts";
import { LABEL_PATTERN } from "../review/import.ts";
import { EXIT_ERROR, EXIT_PASSED } from "../types.ts";

export interface ReviewCheckOptions {
  label: string;
  /** Repository directory (default: the current directory); docs/reviews/ must exist in it. */
  cwd?: string;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

/** A problem of the files or of the command (the checks of the files' contents are CheckProblem of src/review/check.ts). */
interface Problem {
  kind: CheckProblem["kind"] | "options" | "repository" | "path" | "files" | "read";
  message: string;
}

/** The result of looking at one label: the problems (exit 2), or the report lines with the loop line among them. */
export type Inspection = { ok: true; lines: string[]; loop: string } | { ok: false; problems: Problem[] };

const ROUND_FILE = /^findings-r([1-9][0-9]{0,2})\.json$/;

/** git, asked once for the work tree and once per SHA (only when a finding is resolved). */
function gitCommits(root: string): CommitLookup {
  return (shas) => {
    const wt = workTree(root);
    if (wt.problem !== null) return { problem: wt.problem };
    if (!wt.inside) return { problem: "the repository directory is not inside a git work tree" };
    const missing = new Set<string>();
    for (const sha of shas) {
      const a = isCommitObject(root, sha);
      if ("problem" in a) return { problem: a.problem };
      if (!a.commit) missing.add(sha);
    }
    return { missing };
  };
}

/**
 * Read and check docs/reviews/<label>/findings-r*.json under `root` (ADR-0027): the files (at least one; every name that starts with
 * "findings-" is findings-r<N>.json; the rounds are 1 to the last without a gap; each is a regular file of schema version 1), then
 * checkRounds. Reads only: nothing is written, and only ENOENT of the label's directory is "absent" (ADR-0022).
 */
export function inspectLabel(root: string, label: string): Inspection {
  const problems: Problem[] = [];
  let reviews: Stats | null;
  try {
    reviews = lstatOrNull(path.join(root, "docs", "reviews"));
  } catch (err) {
    return { ok: false, problems: [{ kind: "repository", message: `docs/reviews cannot be examined (${errorCode(err)})` }] };
  }
  if (reviews === null || !reviews.isDirectory()) {
    return { ok: false, problems: [{ kind: "repository", message: "docs/reviews is not a directory in the repository directory; run at the repository root or give --cwd" }] };
  }
  const relDir = ["docs", "reviews", label].join("/");
  let dir: string;
  try {
    dir = resolveInsideRoot(root, path.join("docs", "reviews", label), "the label's directory");
  } catch (err) {
    if (err instanceof ConfigError) return { ok: false, problems: [{ kind: "path", message: err.message }] };
    throw err;
  }
  let names: string[];
  try {
    const st = lstatOrNull(dir);
    if (st === null) return { ok: false, problems: [{ kind: "files", message: `${relDir} does not exist (no findings file to check)` }] };
    if (!st.isDirectory()) return { ok: false, problems: [{ kind: "files", message: `${relDir} is not a directory` }] };
    names = readdirSync(dir);
  } catch (err) {
    return { ok: false, problems: [{ kind: "files", message: `${relDir} cannot be listed (${errorCode(err)})` }] };
  }

  const found = new Map<number, string>();
  for (const name of names.sort()) {
    if (!name.startsWith("findings-")) continue;
    const m = ROUND_FILE.exec(name);
    if (m === null) problems.push({ kind: "files", message: `${JSON.stringify(name)} in ${relDir} starts with "findings-" but is not findings-r<N>.json` });
    else found.set(Number(m[1]), name);
  }
  if (found.size === 0 && problems.length === 0) problems.push({ kind: "files", message: `${relDir} has no findings-r<N>.json` });
  const last = Math.max(0, ...found.keys());
  for (let k = 1; k <= last; k += 1) {
    if (!found.has(k)) problems.push({ kind: "files", message: `findings-r${k}.json is missing: the rounds of ${relDir} are not 1 to ${last} without a gap` });
  }
  const rounds: Round[] = [];
  for (const [round, name] of [...found].sort((a, b) => a[0] - b[0])) {
    const r = readFindingsFile(path.join(dir, name), `${relDir}/${name}`);
    if (r.ok) rounds.push({ round, name, file: r.file });
    else problems.push({ kind: "read", message: r.reason });
  }
  if (problems.length > 0) return { ok: false, problems };

  const checked = checkRounds(label, rounds, gitCommits(root));
  return checked.ok ? checked : { ok: false, problems: checked.problems };
}

/**
 * `aiqh review-check` (review-import v2, ADR-0027): 0 = the findings files of the label pass the checks — whatever the number of open
 * findings and the warnings (D7, the non-goal) — and 2 = a problem (every one listed) or a usage error. Reads only. The terminal gets
 * conditions, file names, states, counts and IDs of the expected shape, through the output boundary; never the reviewer's text.
 */
export async function runReviewCheck(options: ReviewCheckOptions): Promise<number> {
  const output = createOutput({ log: options.log, logError: options.logError });
  const fail = (problems: readonly Problem[]): number => {
    for (const p of problems) output.error(`aiqh review-check: [${p.kind}] ${p.message}`);
    output.error("REVIEW CHECK: failed (error)");
    return EXIT_ERROR;
  };
  const { label } = options;
  if (!LABEL_PATTERN.test(label) || label.includes("..")) {
    return fail([{ kind: "options", message: '--label must be lower-case ASCII letters, digits, "." and "-" (no "..", no path separator)' }]);
  }
  const r = inspectLabel(path.resolve(options.cwd ?? process.cwd()), label);
  if (!r.ok) return fail(r.problems);
  for (const line of r.lines) output.log(line);
  output.log("REVIEW CHECK: passed");
  return EXIT_PASSED;
}
