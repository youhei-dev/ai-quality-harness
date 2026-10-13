/**
 * `aiqh review-check` (review-import v2, M2-2, ADR-0027): what is checked in the findings files of one label once they are read, without
 * touching files (the command reads them) or git (the command answers whether a SHA is a commit). One problem is enough for exit 2, and
 * every problem is listed. Without a problem, the report shows the counts, the open IDs, the previous round's assessments next to its
 * findings and the warnings — which, like the number of open findings, never change the exit code (D7, the non-goal: a reviewer's
 * judgment does not become a pass / fail; the state is decided by people). A message names a condition, a file, a state and an ID of the
 * expected shape only; never the reviewer's or the implementer's text (an assessment is shown as one of four classes of its first word).
 */
import type { FindingsFile } from "./import.ts";

export interface CheckProblem {
  kind: "label-round" | "prefix" | "id" | "summary" | "state" | "git" | "previous";
  message: string;
}

/** A round whose file was read (the files that could not be read are problems of the command already). */
export interface Round {
  round: number;
  /** `findings-r<N>.json` */
  name: string;
  file: FindingsFile;
}

/** Whether git knows the SHAs as commit objects: the ones it does not know, or why it could not be asked (fail closed). */
export type CommitLookup = (shas: readonly string[]) => { missing: ReadonlySet<string> } | { problem: string };

export type CheckResult = { ok: true; lines: string[]; loop: string } | { ok: false; problems: CheckProblem[] };

const VERDICTS = new Set(["VALID", "PARTIAL", "INVALID"]);
const SHA = /^[0-9a-f]{40}$/;
type Status = FindingsFile["findings"][number]["status"];
const STATUS_ORDER: readonly Status[] = ["open", "resolved", "deferred", "accepted", "invalid"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blank(v: string | null): boolean {
  return v === null || !/\S/.test(v);
}

/** The class of an assessment by its first word: 解消, 部分的に解消, 未解消, or その他 (its text is never shown). */
export function assessmentClass(assessment: string): "解消" | "部分的に解消" | "未解消" | "その他" {
  const a = assessment.trim();
  if (a.startsWith("未解消")) return "未解消";
  if (a.startsWith("部分的に解消")) return "部分的に解消";
  if (a.startsWith("解消")) return "解消";
  return "その他";
}

/** Check the rounds of `label` (sorted, 1 to the last without a gap: the command made sure of that) and build the report. */
export function checkRounds(label: string, rounds: readonly Round[], commits: CommitLookup): CheckResult {
  const problems: CheckProblem[] = [];
  const add = (kind: CheckProblem["kind"], message: string): void => {
    problems.push({ kind, message });
  };
  const first = rounds[0];
  if (first === undefined) return { ok: false, problems };

  // The label, the round and the prefix of each file (the schema let only the forms of LABEL_PATTERN and ID_PREFIX_PATTERN through).
  for (const r of rounds) {
    if (r.file.label !== label) add("label-round", `${r.name} has the label ${r.file.label}, not ${label}`);
    if (r.file.round !== r.round) add("label-round", `${r.name} has the round ${r.file.round}, not ${r.round}`);
    if (r.file.idPrefix !== first.file.idPrefix) add("prefix", `${r.name} has the prefix ${r.file.idPrefix}; ${first.name} has ${first.file.idPrefix}`);
  }

  // The shape the import gave: the IDs <prefix>-R<round>-001 … without a gap or a duplicate, and the summary.
  const shown = new Map<FindingsFile["findings"][number], string>();
  const resolved: Array<{ sha: string; who: string }> = [];
  for (const r of rounds) {
    const idPattern = new RegExp(`^${escapeRegExp(r.file.idPrefix)}-R${r.round}-(\\d{3})$`);
    const numbers: number[] = [];
    const ids = new Set<string>();
    r.file.findings.forEach((f, i) => {
      const m = idPattern.exec(f.id);
      if (m === null) add("id", `findings[${i}] of ${r.name} has an ID that is not of the form ${r.file.idPrefix}-R${r.round}-NNN`);
      else {
        if (ids.has(f.id)) add("id", `${f.id} appears more than once in ${r.name}`);
        ids.add(f.id);
        numbers.push(Number(m[1]));
      }
      shown.set(f, m !== null ? f.id : `findings[${i}] of ${r.name}`);
    });
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    if (sorted.some((n, i) => n !== i + 1)) add("id", `the IDs of ${r.name} are not numbered 001 to ${String(sorted.length).padStart(3, "0")} without a gap`);
    const n = (s: string): number => r.file.findings.filter((f) => f.severity === s).length;
    const sum = r.file.summary;
    if (sum.high !== n("High") || sum.medium !== n("Medium") || sum.low !== n("Low")) add("summary", `the summary of ${r.name} is not the number of findings of each severity`);

    // The fields each state needs (D4; the implementer's side) and the verdict that fits the state.
    for (const f of r.file.findings) {
      const who = shown.get(f) ?? f.id;
      if (f.verdict !== null && !VERDICTS.has(f.verdict)) add("state", `the verdict of ${who} is not VALID, PARTIAL, INVALID or null`);
      else if (f.status === "invalid" && f.verdict !== "INVALID") add("state", `${who} is invalid, but its verdict is not INVALID`);
      else if ((f.status === "resolved" || f.status === "deferred" || f.status === "accepted") && f.verdict !== "VALID" && f.verdict !== "PARTIAL") {
        add("state", `${who} is ${f.status}, but its verdict is not VALID or PARTIAL`);
      }
      if (f.status === "resolved") {
        if (f.fixedIn === null || !SHA.test(f.fixedIn)) add("state", `${who} is resolved without a fixedIn of 40 lower-case hexadecimal digits`);
        else resolved.push({ sha: f.fixedIn, who });
        if (blank(f.regressionTest)) add("state", `${who} is resolved without a regressionTest`);
      }
      if (f.status === "deferred" && blank(f.destination)) add("state", `${who} is deferred without a destination`);
      if ((f.status === "accepted" || f.status === "invalid") && blank(f.note)) add("state", `${who} is ${f.status} without a note`);
    }
  }

  // fixedIn must be a commit object of the repository (git cat-file; a git that cannot answer is exit 2: fail closed).
  if (resolved.length > 0) {
    const answer = commits([...new Set(resolved.map((x) => x.sha))]);
    if ("problem" in answer) add("git", `the fixedIn commits cannot be checked: ${answer.problem}`);
    else for (const x of resolved) if (answer.missing.has(x.sha)) add("state", `the fixedIn of ${x.who} is not a commit of this repository`);
  }

  // The previous round's assessments: round N's previous names findings of round N-1, each once; round 1 has none.
  for (const r of rounds) {
    const prev = r.file.previous;
    const anyRound = new RegExp(`^${escapeRegExp(r.file.idPrefix)}-R\\d{1,3}-\\d{3}$`);
    if (r.round === 1) {
      if (prev.length > 0) add("previous", `${r.name} has ${prev.length} previous entr${prev.length === 1 ? "y" : "ies"} (there is no round 0)`);
      continue;
    }
    const before = rounds.find((x) => x.round === r.round - 1);
    if (before === undefined) continue;
    const ids = new Set(before.file.findings.map((f) => f.id));
    const seen = new Set<string>();
    prev.forEach((p, k) => {
      const who = anyRound.test(p.id) ? p.id : `previous[${k}] of ${r.name}`;
      if (seen.has(p.id)) add("previous", `${who} appears more than once in the previous of ${r.name}`);
      seen.add(p.id);
      if (!ids.has(p.id)) add("previous", `${who} in the previous of ${r.name} is not a finding of ${before.name}`);
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  // The report.
  const last = rounds[rounds.length - 1] ?? first;
  const lines = [`aiqh review-check — ${label} (${first.file.idPrefix}), R1 to R${last.round}`];
  const open: string[] = [];
  for (const r of rounds) {
    const per = STATUS_ORDER.map((s) => `${s} ${r.file.findings.filter((f) => f.status === s).length}`).join(", ");
    const sum = r.file.summary;
    lines.push(`R${r.round}: High ${sum.high} / Medium ${sum.medium} / Low ${sum.low}; ${per}`);
    for (const f of r.file.findings) if (f.status === "open") open.push(f.id);
  }
  const warnings: string[] = [];
  for (const r of rounds) {
    if (r.round === 1) continue;
    const before = rounds.find((x) => x.round === r.round - 1);
    if (before === undefined) continue;
    const assessed = new Map(r.file.previous.map((p) => [p.id, assessmentClass(p.assessment)]));
    for (const f of before.file.findings) {
      const c = assessed.get(f.id);
      lines.push(`previous: ${f.id} (R${before.round}, ${f.status}) — R${r.round}: ${c ?? "(no assessment)"}`);
      if (c === undefined) {
        if (f.status !== "invalid") warnings.push(`warning: ${f.id} (R${before.round}, ${f.status}) has no assessment in the previous of R${r.round}`);
      } else if (f.status === "resolved" && (c === "未解消" || c === "部分的に解消")) {
        warnings.push(`warning: ${f.id} (R${before.round}) is resolved, but R${r.round} assesses it ${c}`);
      } else if (f.status === "open" && c === "解消") {
        warnings.push(`warning: ${f.id} (R${before.round}) is open, but R${r.round} assesses it ${c}`);
      }
    }
  }
  lines.push(`open: ${open.length > 0 ? open.join(", ") : "none"}`, ...warnings, `warnings: ${warnings.length}`);
  const loop = open.length > 0 ? `REVIEW LOOP: incomplete (open ${open.length})` : "REVIEW LOOP: complete";
  lines.push(loop);
  return { ok: true, lines, loop };
}
