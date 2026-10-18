/**
 * aiqh history --html (ADR-0035): the aggregate of ADR-0034 as one static HTML file, dashboard.html. The file is made from the fixed
 * template of this module only:
 * - no script, no external resource, no event attribute; open and close with <details>, the charts as inline SVG
 * - the CSP meta is the first child of <head>: default-src 'none' and style-src with the SHA-256 of the one fixed <style>
 * - every value — numbers too, and the SVG's coordinates — goes through h(): to a string, masked, the forbidden characters and LF / TAB
 *   as `\u{HEX}`, then & < > " ' as references. A value goes into the text of an element or into a double-quoted attribute only
 * - every number shown is the text of an element with data-k="<JSON path>" (the same string as in the --json document, null as "-");
 *   the numbers of the JSON that are not shown are the allowlist HTML_NOT_SHOWN (M4-D-R1-004)
 * The file is written by the command (src/commands/history.ts) through writeAtomic(…, "html"); this module only renders.
 */
import { createHash } from "node:crypto";
import { escapeForDisplay } from "../output.ts";
import { maskSecrets } from "../security/mask.ts";
import type { CountSeries, DayAggregate, HistoryAggregate, ProjectAggregate } from "./aggregate.ts";

/** The name of the file in --out. */
export const DASHBOARD_FILE = "dashboard.html";

/**
 * The JSON paths of the numbers the dashboard shows (ADR-0035 decision 6, the mapping table; `*` is an array index): each one is the
 * text of the element with data-k="<path>", once.
 */
export const HTML_SHOWN: readonly string[] = [
  "sources.*.historyFiles",
  "sources.*.read",
  "sources.*.unread",
  "sources.*.duplicates",
  "sources.*.ignored",
  "sources.*.leftoverTemporary",
  "projects.*.runs",
  "projects.*.interrupted",
  "projects.*.verdicts.PASSED",
  "projects.*.verdicts.FAILED",
  "projects.*.verdicts.ERROR",
  "projects.*.dirty.true",
  "projects.*.dirty.false",
  "projects.*.dirty.unknown",
  "projects.*.durationMs.median",
  "projects.*.durationMs.max",
  "projects.*.days.*.runs",
  "projects.*.days.*.PASSED",
  "projects.*.days.*.FAILED",
  "projects.*.days.*.ERROR",
  "projects.*.toolVersions.*.runs",
  "projects.*.configs.*.runs",
  "projects.*.checks.*.runs",
  "projects.*.checks.*.PASS",
  "projects.*.checks.*.FAIL",
  "projects.*.checks.*.SKIPPED",
  "projects.*.checks.*.failRate",
  "projects.*.checks.*.timedOut",
  "projects.*.checks.*.durationMs.median",
  "projects.*.checks.*.durationMs.max",
  "projects.*.checks.*.maxShareOfTimeout",
  "projects.*.counts.*.days.*.value",
  "projects.*.counts.*.days.*.unknownRuns",
  "failureProne.*.PASS",
  "failureProne.*.FAIL",
  "failureProne.*.failRate",
];

/** The numbers of the JSON the dashboard does not show with data-k (ADR-0035 decision 6, the allowlist), and why. */
export const HTML_NOT_SHOWN: ReadonlyArray<{ path: string; shown: "no" | "label"; reason: string }> = [
  { path: "schemaVersion", shown: "no", reason: "the version of the --json shape" },
  { path: "sources.*.index", shown: "label", reason: "an identifier, not an amount: the label #<n> of the row" },
  { path: "unread.*.source", shown: "label", reason: "the same: #<n>/<file> in the list of unread files" },
  { path: "projects.*.sources.*", shown: "label", reason: "the same: from #<n> under the project's heading" },
  { path: "projects.*.checks.*.lastTimeoutSec", shown: "no", reason: "a value of the config (the last run's timeout); the share maxShareOfTimeout is shown" },
];

declare const htmlBrand: unique symbol;

/** HTML made by h() or by the template tag: the only kind the template takes (the practice of `Safe`, src/output.ts). */
export type HtmlText = string & { readonly [htmlBrand]: true };

const ENTITIES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * The one way a value enters the HTML (ADR-0035 decision 4): to a string (null as "-"; a number checked to be finite — the aggregate
 * checked it, so a non-finite one is a bug of aiqh and throws; a coordinate with one decimal), masked, the forbidden characters and LF /
 * TAB as `\u{HEX}`, then & < > " ' as references.
 */
export function h(value: string | number | null, form: "text" | "coordinate" = "text"): HtmlText {
  let s: string;
  if (value === null) s = "-";
  else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("dashboard: a number that is not finite (a bug of aiqh)");
    s = form === "coordinate" ? value.toFixed(1) : String(value);
  } else s = value;
  return escapeForDisplay(maskSecrets(s), "escape").replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c) as HtmlText;
}

/** The template: the fixed text of this module, and HtmlText values. */
function html(strings: TemplateStringsArray, ...values: readonly HtmlText[]): HtmlText {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += v + (strings[i + 1] ?? "");
  });
  return out as HtmlText;
}

function join(parts: readonly HtmlText[], separator: "" | "\n" = ""): HtmlText {
  return parts.join(separator) as HtmlText;
}

/** The one style sheet (no value in it); CSP's style-src carries its SHA-256. */
const CSS = html`body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:1.5rem;color:#1b1b1b;background:#fff;line-height:1.4}
h1{font-size:1.5rem}h2{font-size:1.2rem;margin-top:2rem}h3{font-size:1rem}
table{border-collapse:collapse;margin:.5rem 0}th,td{border:1px solid #ccc;padding:.2rem .5rem;text-align:right;font-variant-numeric:tabular-nums}
th{background:#f3f3f3}th.name,td.name{text-align:left}
details{margin:.5rem 0}summary{cursor:pointer}
.status-complete{color:#1a6b2a}.status-incomplete,.warn h2{color:#a01818}
svg.chart{display:block;width:100%;max-width:600px;height:auto;border:1px solid #ddd;background:#fafafa}
.bar-passed{fill:#3c8d40}.bar-failed{fill:#c62828}.bar-error{fill:#ef6c00}
.series{fill:none;stroke:#1565c0;stroke-width:2}.axis{stroke:#999;stroke-width:1}`;

const STYLE_SHA256 = createHash("sha256").update(CSS, "utf8").digest("base64");

/** The SVG's coordinate system (ADR-0035 decision 6: the sizes are not compared with the JSON; the number of bars and points is). */
const WIDTH = 600;
const HEIGHT = 120;
const VIEW_BOX = `0 0 ${WIDTH} ${HEIGHT}`;

/** A number of the mapping table: the element's text is the number, its data-k the JSON path. */
function cell(p: string, value: number | null): HtmlText {
  return html`<td data-k="${h(p)}">${h(value)}</td>`;
}

function text(value: string): HtmlText {
  return html`<td class="name">${h(value)}</td>`;
}

function headRow(names: readonly string[]): HtmlText {
  return html`<thead><tr>${join(names.map((n) => html`<th>${h(n)}</th>`))}</tr></thead>`;
}

function largest(values: readonly number[]): number {
  return values.reduce((a, b) => (b > a ? b : a), 1);
}

/** The runs per day as stacked bars of PASSED, FAILED and ERROR: one <g> per day of the array. */
function daysChart(i: number, p: ProjectAggregate): HtmlText {
  const max = largest(p.days.map((d) => d.runs));
  const step = WIDTH / Math.max(1, p.days.length);
  const groups = p.days.map((d: DayAggregate, j) => {
    const x = j * step + step * 0.1;
    const w = step * 0.8;
    let y = HEIGHT;
    const bars: HtmlText[] = [];
    for (const [k, cls] of [["PASSED", "bar-passed"], ["FAILED", "bar-failed"], ["ERROR", "bar-error"]] as const) {
      if (d[k] === 0) continue;
      const height = (d[k] / max) * (HEIGHT - 10);
      y -= height;
      bars.push(html`<rect class="${h(cls)}" x="${h(x, "coordinate")}" y="${h(y, "coordinate")}" width="${h(w, "coordinate")}" height="${h(height, "coordinate")}"></rect>`);
    }
    return html`<g><title>${h(d.day)}</title>${join(bars)}</g>`;
  });
  return html`<svg class="${h("chart")}" role="${h("img")}" viewBox="${h(VIEW_BOX)}" data-chart="${h(`projects.${i}.days`)}"><title>${h(`${p.name} — verdicts per day`)}</title><line class="${h("axis")}" x1="${h(0, "coordinate")}" y1="${h(HEIGHT, "coordinate")}" x2="${h(WIDTH, "coordinate")}" y2="${h(HEIGHT, "coordinate")}"></line>${join(groups)}</svg>`;
}

/** A count's last value per day as a line: one point per day that has a value. */
function seriesChart(i: number, j: number, s: CountSeries): HtmlText {
  const max = largest(s.days.map((d) => d.value ?? 0));
  const n = s.days.length;
  const points: HtmlText[] = [];
  s.days.forEach((d, k) => {
    if (d.value === null) return;
    const x = n > 1 ? (k * WIDTH) / (n - 1) : WIDTH / 2;
    const y = HEIGHT - 5 - (d.value / max) * (HEIGHT - 10);
    points.push(html`${h(x, "coordinate")},${h(y, "coordinate")}`);
  });
  return html`<svg class="${h("chart")}" role="${h("img")}" viewBox="${h(VIEW_BOX)}" data-chart="${h(`projects.${i}.counts.${j}.days`)}"><title>${h(`${s.check} ${s.tool} ${s.key} — last value per day`)}</title><line class="${h("axis")}" x1="${h(0, "coordinate")}" y1="${h(HEIGHT, "coordinate")}" x2="${h(WIDTH, "coordinate")}" y2="${h(HEIGHT, "coordinate")}"></line><polyline class="${h("series")}" points="${join(points.map((pt, k) => (k === 0 ? pt : html` ${pt}`)))}"></polyline></svg>`;
}

function project(i: number, p: ProjectAggregate): HtmlText {
  const at = `projects.${i}`;
  const summary = html`<table>${headRow(["runs", "PASSED", "FAILED", "ERROR", "dirty true", "dirty false", "dirty unknown", "interrupted", "duration median (ms)", "duration max (ms)"])}<tbody><tr>${cell(`${at}.runs`, p.runs)}${cell(`${at}.verdicts.PASSED`, p.verdicts.PASSED)}${cell(`${at}.verdicts.FAILED`, p.verdicts.FAILED)}${cell(`${at}.verdicts.ERROR`, p.verdicts.ERROR)}${cell(`${at}.dirty.true`, p.dirty.true)}${cell(`${at}.dirty.false`, p.dirty.false)}${cell(`${at}.dirty.unknown`, p.dirty.unknown)}${cell(`${at}.interrupted`, p.interrupted)}${cell(`${at}.durationMs.median`, p.durationMs.median)}${cell(`${at}.durationMs.max`, p.durationMs.max)}</tr></tbody></table>`;
  const days = join(p.days.map((d, j) => html`<tr>${text(d.day)}${cell(`${at}.days.${j}.runs`, d.runs)}${cell(`${at}.days.${j}.PASSED`, d.PASSED)}${cell(`${at}.days.${j}.FAILED`, d.FAILED)}${cell(`${at}.days.${j}.ERROR`, d.ERROR)}</tr>`));
  const versions = join(p.toolVersions.map((v, j) => html`<tr>${text(v.version)}${text(v.first)}${text(v.last)}${cell(`${at}.toolVersions.${j}.runs`, v.runs)}</tr>`));
  const configs = join(p.configs.map((c, j) => html`<tr>${text(c.sha256 === null ? "unknown" : c.sha256.slice(0, 12))}${text(c.first)}${text(c.last)}${cell(`${at}.configs.${j}.runs`, c.runs)}</tr>`));
  const checks = join(
    p.checks.map((c, j) => {
      const k = `${at}.checks.${j}`;
      return html`<tr>${text(c.name)}${text(c.kind)}${text(c.required ? "required" : "optional")}${cell(`${k}.runs`, c.runs)}${cell(`${k}.PASS`, c.PASS)}${cell(`${k}.FAIL`, c.FAIL)}${cell(`${k}.SKIPPED`, c.SKIPPED)}${cell(`${k}.failRate`, c.failRate)}${cell(`${k}.timedOut`, c.timedOut)}${cell(`${k}.durationMs.median`, c.durationMs.median)}${cell(`${k}.durationMs.max`, c.durationMs.max)}${cell(`${k}.maxShareOfTimeout`, c.maxShareOfTimeout)}</tr>`;
    }),
  );
  const counts = join(
    p.counts.map((s, j) => {
      const rows = join(s.days.map((d, k) => html`<tr>${text(d.day)}${cell(`${at}.counts.${j}.days.${k}.value`, d.value)}${cell(`${at}.counts.${j}.days.${k}.unknownRuns`, d.unknownRuns)}${text(d.truncated ? "truncated" : "")}</tr>`));
      return html`<details><summary>${h(`${s.check} ${s.tool} ${s.key}`)}</summary>
${seriesChart(i, j, s)}
<table>${headRow(["day", "value", "unknown runs", "truncated"])}<tbody>${rows}</tbody></table></details>`;
    }),
    "\n",
  );
  return html`<section>
<h3>${h(p.name)}</h3>
<p>${h(`from ${p.sources.map((n) => `#${n}`).join(", ")}; period ${p.first} .. ${p.last}`)}</p>
${summary}
<details><summary>Days</summary>
${daysChart(i, p)}
<table>${headRow(["day", "runs", "PASSED", "FAILED", "ERROR"])}<tbody>${days}</tbody></table></details>
<details><summary>Tool versions</summary><table>${headRow(["aiqh", "first", "last", "runs"])}<tbody>${versions}</tbody></table></details>
<details><summary>Config hashes</summary><table>${headRow(["config (prefix)", "first", "last", "runs"])}<tbody>${configs}</tbody></table></details>
<details><summary>Checks</summary><table>${headRow(["check", "kind", "required", "runs", "PASS", "FAIL", "SKIPPED", "fail rate", "timed out", "duration median (ms)", "duration max (ms)", "max share of timeout"])}<tbody>${checks}</tbody></table></details>
<details><summary>Counts</summary>
${counts}
</details>
</section>`;
}

/** The dashboard of an aggregate: the whole file. */
export function renderDashboard(a: HistoryAggregate): string {
  const status = a.complete
    ? html`<p class="${h("status-complete")}">${h("COMPLETE: every history file was read")}</p>`
    : html`<p class="${h("status-incomplete")}">${h("INCOMPLETE: some history files could not be read (listed below)")}</p>`;
  const unread =
    a.unread.length === 0
      ? html``
      : html`<section class="${h("warn")}">
<h2>Unread history files</h2>
<ul>${join(a.unread.map((u) => html`<li>${h(`#${u.source}/${u.file}: ${u.reason}${u.code === null ? "" : ` (${u.code})`}`)}</li>`))}</ul>
</section>
`;
  const sources = join(
    a.sources.map((s, i) => html`<tr><th>${h(`#${s.index}`)}</th>${cell(`sources.${i}.historyFiles`, s.historyFiles)}${cell(`sources.${i}.read`, s.read)}${cell(`sources.${i}.unread`, s.unread)}${cell(`sources.${i}.duplicates`, s.duplicates)}${cell(`sources.${i}.ignored`, s.ignored)}${cell(`sources.${i}.leftoverTemporary`, s.leftoverTemporary)}</tr>`),
  );
  const projects = join(a.projects.map((p, i) => project(i, p)), "\n");
  const prone = join(
    a.failureProne.map((f, i) => html`<tr>${text(f.project)}${text(f.check)}${cell(`failureProne.${i}.PASS`, f.PASS)}${cell(`failureProne.${i}.FAIL`, f.FAIL)}${cell(`failureProne.${i}.failRate`, f.failRate)}</tr>`),
  );
  return html`<!doctype html>
<html lang="en">
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${h(STYLE_SHA256)}'; img-src 'none'; base-uri 'none'; form-action 'none'">
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>aiqh history</title>
<style>${CSS}</style>
</head>
<body>
<h1>aiqh history</h1>
${status}
${unread}<h2>Sources</h2>
<table>${headRow(["source", "history files", "read", "unread", "duplicates", "ignored", "leftover temporary"])}<tbody>${sources}</tbody></table>
<h2>Projects</h2>
${projects}
<h2>Failure-prone checks</h2>
<table>${headRow(["project", "check", "PASS", "FAIL", "fail rate"])}<tbody>${prone}</tbody></table>
<p>${h(`aiqh ${a.tool.version}. This file loads nothing from elsewhere and has no script.`)}</p>
</body>
</html>
`;
}
