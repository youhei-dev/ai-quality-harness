/**
 * aiqh history (ADR-0034): the verify history of one or more projects, aggregated without a database and read only. The terminal shows
 * a table, `--json` the aggregate document; nothing is written to a file. Only numbers and states are shown, with the allowlisted strings
 * (ADR-0034 F); a --from is shown as `#<n>`, never as a path.
 * Exit codes (ADR-0034 H; 1 is not used — a FAILED run in the history is a value of the aggregate, not a failure of this command):
 *   0  every history file was read — last line `HISTORY COMPLETE — …`
 *   2  a history file could not be read (the aggregate and the list are shown) — `HISTORY INCOMPLETE — …`
 *   2  a usage or input error, or a limit of the aggregate or of the output (nothing is shown) — `HISTORY ERROR (<kind>)`
 * The last line goes to standard output, except with --json (standard error) and for HISTORY ERROR (standard error).
 * The output limit is the bytes written to standard output (v0.11.2, M4-H-R1-001): every line of the table with its newline, the last
 * line included, or the --json document with its newline, the same number whatever the writer (src/output.ts `linesWithin`,
 * `jsonWithin`).
 */
import path from "node:path";
import { aggregate, type AggregateDeps, type HistoryAggregate } from "../run-history/aggregate.ts";
import { readHistory, type ReadDeps } from "../run-history/read.ts";
import { createOutput } from "../output.ts";
import { EXIT_ERROR, EXIT_PASSED } from "../types.ts";

/**
 * Bytes written: to standard output, every line and its newline (the last line included) or the --json document and its newline; the
 * HTML file in v0.12.0. More is output-too-large (ADR-0034 H / N).
 */
export const OUTPUT_MAX_BYTES = 32 * 1024 * 1024;

export interface HistoryOptions {
  /** --from, in order (at least one). */
  from: string[];
  /** The directory relative --from paths are resolved against (default: the current directory). */
  cwd?: string;
  json: boolean;
  toolVersion: string;
  log?: (line: string) => void;
  logError?: (line: string) => void;
  /** Standard output as the bytes the terminal gets (the tests of the output limit); it takes the place of `log` (src/output.ts). */
  write?: (text: string) => void;
  /** For tests: the reading, the aggregate and the output limit. Not reachable from the CLI. */
  deps?: { read?: ReadDeps; aggregate?: AggregateDeps; outputMaxBytes?: number };
}

const SHORT_HASH = 12;

/** A ratio as shown (the same text as in the JSON; null as "-"). */
function ratio(x: number | null): string {
  return x === null ? "-" : String(x);
}

/** The terminal table of an aggregate (one string per line). */
function tableLines(a: HistoryAggregate): string[] {
  const runs = a.projects.reduce((n, p) => n + p.runs, 0);
  const files = a.sources.reduce((n, s) => n + s.historyFiles, 0);
  const lines = [`aiqh history — sources ${a.sources.length}, history files ${files}, runs ${runs}, projects ${a.projects.length}`];
  for (const s of a.sources) {
    lines.push(`  #${s.index}: history files ${s.historyFiles}, read ${s.read}, unread ${s.unread}, duplicates ${s.duplicates}, ignored ${s.ignored}, leftover temporary ${s.leftoverTemporary}`);
  }
  for (const p of a.projects) {
    lines.push("");
    lines.push(`project ${p.name}: runs ${p.runs} (PASSED ${p.verdicts.PASSED}, FAILED ${p.verdicts.FAILED}, ERROR ${p.verdicts.ERROR}), from ${p.sources.map((n) => `#${n}`).join(", ")}`);
    lines.push(`  period ${p.first} .. ${p.last}; duration median ${p.durationMs.median} ms, max ${p.durationMs.max} ms; dirty true ${p.dirty.true}, false ${p.dirty.false}, unknown ${p.dirty.unknown}; interrupted ${p.interrupted}`);
    for (const v of p.toolVersions) lines.push(`  aiqh ${v.version}: runs ${v.runs}, ${v.first.slice(0, 10)} .. ${v.last.slice(0, 10)}`);
    for (const c of p.configs) lines.push(`  config ${c.sha256 === null ? "unknown" : c.sha256.slice(0, SHORT_HASH)}: runs ${c.runs}, ${c.first.slice(0, 10)} .. ${c.last.slice(0, 10)}`);
    for (const d of p.days) lines.push(`  day ${d.day}: runs ${d.runs} (PASSED ${d.PASSED}, FAILED ${d.FAILED}, ERROR ${d.ERROR})`);
    for (const c of p.checks) {
      lines.push(
        `  check ${c.name} (${c.kind}, ${c.required ? "required" : "optional"}): runs ${c.runs}, PASS ${c.PASS}, FAIL ${c.FAIL}, SKIPPED ${c.SKIPPED}, fail rate ${ratio(c.failRate)}, timed out ${c.timedOut}, duration median ${c.durationMs.median} ms, max ${c.durationMs.max} ms, max share of timeout ${ratio(c.maxShareOfTimeout)}`,
      );
    }
    for (const s of p.counts) {
      const last = s.days[s.days.length - 1];
      if (last === undefined) continue;
      lines.push(`  counts ${s.check} ${s.tool} ${s.key}: ${last.day} ${last.value === null ? "-" : String(last.value)}${last.unknownRuns > 0 ? ` (unknown runs ${last.unknownRuns})` : ""}${last.truncated ? " (truncated)" : ""}`);
    }
  }
  if (a.failureProne.length > 0) {
    lines.push("");
    lines.push("failure-prone checks (PASS + FAIL >= 3):");
    for (const f of a.failureProne) lines.push(`  ${f.project} / ${f.check}: FAIL ${f.FAIL} of ${f.PASS + f.FAIL} (rate ${ratio(f.failRate)})`);
  }
  if (a.unread.length > 0) {
    lines.push("");
    lines.push("unread history files:");
    for (const u of a.unread) lines.push(`  #${u.source}/${u.file}: ${u.reason}${u.code === null ? "" : ` (${u.code})`}`);
  }
  return lines;
}

/** The last line of a run that aggregated. */
function lastLine(a: HistoryAggregate): string {
  const runs = a.projects.reduce((n, p) => n + p.runs, 0);
  if (a.complete) return `HISTORY COMPLETE — projects ${a.projects.length}, runs ${runs}, sources ${a.sources.length}`;
  const files = a.sources.reduce((n, s) => n + s.historyFiles, 0);
  return `HISTORY INCOMPLETE — unread ${a.unread.length} of ${files} history files (listed above)`;
}

export async function runHistory(options: HistoryOptions): Promise<number> {
  const output = createOutput({ log: options.log, logError: options.logError, write: options.write });
  const fail = (kind: string, message: string | null): number => {
    if (message !== null) output.error(`aiqh: ${message}`);
    output.error(`HISTORY ERROR (${kind})`);
    return EXIT_ERROR;
  };
  if (options.from.length === 0) return fail("usage", "history needs at least one --from <dir> (a project root or a history directory)");
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const read = readHistory(options.from, cwd, options.deps?.read);
  if (!read.ok) return fail(read.kind, `${read.source === null ? "" : `--from #${read.source} `}${read.detail}`);
  const agg = aggregate(read, options.toolVersion, options.deps?.aggregate);
  if (!agg.ok) return fail(agg.kind, agg.kind === "too-many-values" ? "the aggregate has more values than the limit" : "the aggregate has a number that is not finite (a bug of aiqh)");
  const max = options.deps?.outputMaxBytes ?? OUTPUT_MAX_BYTES;
  if (options.json) {
    if (!output.jsonWithin(agg.value, max)) return fail("output-too-large", `the JSON document with its newline is larger than ${max} bytes`);
    output.error(lastLine(agg.value));
  } else if (!output.linesWithin([...tableLines(agg.value), lastLine(agg.value)], max)) {
    return fail("output-too-large", `the table with its last line is larger than ${max} bytes`);
  }
  return agg.value.complete ? EXIT_PASSED : EXIT_ERROR;
}
