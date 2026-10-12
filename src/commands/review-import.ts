import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, rmdirSync, statSync, type Stats } from "node:fs";
import path from "node:path";
import { ConfigError, resolveInsideRoot } from "../config/load.ts";
import { copyJson, createOutput } from "../output.ts";
import { writeAtomic } from "../report/write.ts";
import { maskSecrets } from "../security/mask.ts";
import { decodeUtf8Strict, findRawChars } from "../security/raw-chars.ts";
import { scanString } from "../security/scan.ts";
import { EXIT_ERROR, EXIT_PASSED } from "../types.ts";
import { ID_PREFIX_PATTERN, LABEL_PATTERN, LIMITS, findingsFileSchema, readReview, type FindingsFile, type Problem, type ReviewInput } from "../review/import.ts";

export interface ReviewImportOptions {
  /** The review file (Markdown with one aiqh-findings block). */
  review: string;
  label: string;
  round: number;
  idPrefix: string;
  /** Round 2 or later without findings-r<round-1>.json (ENOENT only): allowed only with this flag (ADR-0026, D8). */
  allowMissingPrevious?: boolean;
  /** Repository directory (default: the current directory); docs/reviews/ must exist in it. */
  cwd?: string;
  toolVersion: string;
  /** Tests: the import time. */
  now?: () => Date;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

/** A reason to stop before anything is written; the message names the condition, never the reviewer's text. */
class Stop extends Error {
  override readonly name = "Stop";
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** lstat, or null for ENOENT only; every other failure is thrown (ADR-0022: a path that cannot be examined is not absent). */
function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function code(err: unknown): string {
  return (err as NodeJS.ErrnoException).code ?? "error";
}

/** A findings file that exists: a regular file whose JSON is a findings file of schema version 1 (anything else: Stop). */
function readFindingsFile(file: string, kind: "previous" | "existing", what: string): FindingsFile {
  let bytes: Buffer;
  try {
    const st = lstatSync(file);
    if (!st.isFile()) throw new Stop(kind, `${what} is not a regular file`);
    bytes = readFileSync(file);
  } catch (err) {
    if (err instanceof Stop) throw err;
    throw new Stop(kind, `${what} cannot be read (${code(err)})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Stop(kind, `${what} is not valid JSON`);
  }
  const r = findingsFileSchema.safeParse(parsed);
  if (!r.success) throw new Stop(kind, `${what} is not a findings file of schema version 1 (${r.error.issues.length} schema issue(s))`);
  return r.data;
}

/**
 * `aiqh review-import` (ADR-0026): 0 = imported (or the same review was imported before: nothing written), 2 = anything that cannot be
 * read or that does not agree, a usage error or a write error, and nothing written. The number of open findings never changes the exit
 * code (a reviewer's judgment does not become a pass / fail). The terminal gets the conditions, IDs, line numbers and counts only, through
 * the output boundary; the file gets every string through the masker, and its forbidden characters as JSON notation (ADR-0020).
 */
export async function runReviewImport(options: ReviewImportOptions): Promise<number> {
  const output = createOutput({ log: options.log, logError: options.logError });
  const log = output.log;
  const logError = output.error;
  const stop = (kind: string, messages: readonly string[]): number => {
    for (const m of messages) logError(`aiqh review-import: [${kind}] ${m}`);
    logError("REVIEW IMPORT: not written (error)");
    return EXIT_ERROR;
  };
  const problems = (list: readonly Problem[]): number => {
    for (const p of list) logError(`aiqh review-import: [${p.kind}] ${p.message}`);
    logError(`aiqh review-import: ${list.length} problem(s); the review is not imported`);
    logError("REVIEW IMPORT: not written (error)");
    return EXIT_ERROR;
  };

  const { label, round, idPrefix } = options;
  const usage: string[] = [];
  if (!LABEL_PATTERN.test(label) || label.includes("..")) usage.push('--label must be lower-case ASCII letters, digits, "." and "-" (no "..", no path separator)');
  if (!ID_PREFIX_PATTERN.test(idPrefix)) usage.push('--id-prefix must be upper-case ASCII letters and digits in groups joined by "-" (for example B20 or M2-2-RI)');
  if (!Number.isSafeInteger(round) || round < 1 || round > LIMITS.maxRound) usage.push(`--round must be an integer from 1 to ${LIMITS.maxRound}`);
  if (usage.length > 0) return stop("options", usage);

  const root = path.resolve(options.cwd ?? process.cwd());
  try {
    // The repository: docs/reviews/ must be there (run at the repository root, or give --cwd).
    let reviews: Stats | null;
    try {
      reviews = lstatOrNull(path.join(root, "docs", "reviews"));
    } catch (err) {
      throw new Stop("repository", `docs/reviews cannot be examined (${code(err)})`);
    }
    if (reviews === null || !reviews.isDirectory()) throw new Stop("repository", "docs/reviews is not a directory in the repository directory; run at the repository root or give --cwd");
    const rel = path.join("docs", "reviews", label, `findings-r${round}.json`);
    const target = resolveInsideRoot(root, rel, "the findings file");
    const relShown = rel.split(path.sep).join("/");

    // The review: a regular file of at most 1 MiB, strict UTF-8.
    const reviewPath = path.resolve(root, options.review);
    let bytes: Buffer;
    try {
      // stat follows a symbolic link: what is read must be a regular file (a dangling link is ENOENT: cannot be read)
      const st = statSync(reviewPath);
      if (!st.isFile()) throw new Stop("input", "the review is not a regular file");
      if (st.size > LIMITS.inputBytes) throw new Stop("input", `the review is larger than ${LIMITS.inputBytes} bytes`);
      bytes = readFileSync(reviewPath);
    } catch (err) {
      if (err instanceof Stop) throw err;
      throw new Stop("input", `the review cannot be read (${code(err)})`);
    }
    if (bytes.length > LIMITS.inputBytes) throw new Stop("input", `the review is larger than ${LIMITS.inputBytes} bytes`);
    const decoded = decodeUtf8Strict(bytes);
    if (!decoded.ok) throw new Stop("input", `the review is not valid UTF-8 (line ${decoded.line})`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // An existing findings file of this round: the same review is done already (exit 0, nothing written); another one is refused.
    let existing: Stats | null;
    try {
      existing = lstatOrNull(target);
    } catch (err) {
      throw new Stop("existing", `${relShown} cannot be examined (${code(err)})`);
    }
    if (existing !== null) {
      const before = readFindingsFile(target, "existing", relShown);
      if (before.source.sha256 !== sha256) throw new Stop("existing", `${relShown} exists and was imported from another review (sha256 ${before.source.sha256.slice(0, 12)}…); nothing is replaced`);
      log(`aiqh review-import — ${label} R${round} (${idPrefix})`);
      log(`findings: ${relShown} (already imported from this review, sha256 ${sha256.slice(0, 12)}…)`);
      log("REVIEW IMPORT: already imported (same source); nothing written");
      return EXIT_PASSED;
    }

    // The review against its JSON block (every problem is listed).
    const read = readReview(decoded.text, { label, round, idPrefix });
    if (!read.ok) return problems(read.problems);
    const input: ReviewInput = read.input;

    // The previous round (D8, ADR-0022): only ENOENT is "absent", and only --allow-missing-previous lets it pass.
    if (round > 1) {
      const prevRel = path.join("docs", "reviews", label, `findings-r${round - 1}.json`);
      const prevShown = prevRel.split(path.sep).join("/");
      const prevPath = resolveInsideRoot(root, prevRel, "the previous findings file");
      let prev: Stats | null;
      try {
        prev = lstatOrNull(prevPath);
      } catch (err) {
        throw new Stop("previous", `${prevShown} cannot be examined (${code(err)})`);
      }
      if (prev === null) {
        if (options.allowMissingPrevious !== true) throw new Stop("previous", `${prevShown} does not exist; import round ${round - 1} first, or give --allow-missing-previous if it was never imported`);
        log(`previous round: ${prevShown} does not exist (allowed by --allow-missing-previous)`);
      } else {
        const before = readFindingsFile(prevPath, "previous", prevShown);
        if (before.label !== label || before.round !== round - 1 || before.idPrefix !== idPrefix) throw new Stop("previous", `${prevShown} is not round ${round - 1} of ${label} with the prefix ${idPrefix}`);
      }
    }

    // What the terminal may say about the content: counts and lines only.
    const raw = findRawChars(decoded.text);
    const shapes = scanString(decoded.text);

    const findings = [...input.findings]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => ({ ...f, status: "open" as const, verdict: null, action: null, fixedIn: null, regressionTest: null, guard: null, destination: null, note: null }));
    const file: FindingsFile = {
      schemaVersion: 1,
      label,
      round,
      idPrefix,
      source: { name: path.basename(reviewPath), bytes: bytes.length, sha256 },
      summary: input.summary,
      previous: input.previous ?? [],
      importedAt: (options.now?.() ?? new Date()).toISOString(),
      tool: { name: "aiqh", version: options.toolVersion },
      findings,
    };
    const text = `${JSON.stringify(copyJson(file, maskSecrets), null, 2)}\n`;

    // The label's directory (created here when it is new, and removed again when the write fails), then the two-step write.
    const dir = path.dirname(target);
    let created = false;
    try {
      const st = lstatOrNull(dir);
      if (st === null) {
        mkdirSync(dir);
        created = true;
      } else if (!st.isDirectory()) throw new Stop("write", `docs/reviews/${label} is not a directory`);
      writeAtomic(target, text, "json");
    } catch (err) {
      if (created) {
        try {
          rmdirSync(dir);
        } catch {
          // left as an empty directory; the write error is the one reported
        }
      }
      if (err instanceof Stop) throw err;
      throw new Stop("write", `${relShown} could not be written (${code(err)})`);
    }

    const open = findings.filter((f) => f.status === "open").length;
    log(`aiqh review-import — ${label} R${round} (${idPrefix})`);
    log(`findings: ${relShown}`);
    log(`High ${input.summary.high} / Medium ${input.summary.medium} / Low ${input.summary.low}; open ${open}`);
    if (raw.length > 0) log(`forbidden characters in the review: ${raw.length} (written as notation; lines ${[...new Set(raw.map((h) => h.line))].join(", ")})`);
    if (shapes.length > 0) {
      const cats = [...new Set(shapes.map((f) => (f.category !== undefined ? `${f.kind}:${f.category}` : f.kind)))].join(", ");
      log(`secret-shaped strings in the review: ${shapes.length} (${cats}; line ${[...new Set(shapes.map((f) => f.line))].join(", ")}); the stored strings are masked`);
    }
    log("REVIEW IMPORT: written");
    return EXIT_PASSED;
  } catch (err) {
    if (err instanceof Stop) return stop(err.kind, [err.message]);
    // resolveInsideRoot: the findings path leaves the repository (through a symbolic link) or cannot be resolved
    if (err instanceof ConfigError) return stop("path", [err.message]);
    throw err;
  }
}

