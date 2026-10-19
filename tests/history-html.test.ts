/**
 * v0.12.0 (ADR-0035 decisions 2–4, 6–8; M4-D-R1-004, M4-D-R2-001, M4-D-R2-002): the content of dashboard.html, made from the same
 * aggregate as --json. No script, no external resource, no event attribute: the element and attribute names are a fixed list, and
 * names that carry markup, references, `javascript:`, `on…=` and raw control / bidi characters (built from code points) stay text.
 * The CSP meta is the first child of <head> and its style-src hash is the SHA-256 of the one <style>. Every number of the mapping table
 * is in the HTML once, as the text of an element with data-k="<JSON path>" (the same string as in the JSON, null as "-"); every
 * numeric leaf of the JSON is in the mapping table or in the allowlist (exactly one of them), and no allowlisted number is shown
 * (lastTimeoutSec: a marker value appears nowhere). An SVG chart has one bar group per day and one point per value, its attributes
 * are a fixed list and its numbers are coordinates of one decimal inside the viewBox; its text holds no number. The fields that are
 * not shown (the same fixture as the terminal and --json) appear nowhere.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHistory } from "../src/commands/history.ts";
import { HTML_NOT_SHOWN, HTML_SHOWN } from "../src/run-history/html.ts";
import { findRawChars } from "../src/security/raw-chars.ts";
import { check, historyDir, put, report, SENTINELS, stamp } from "./history-fixtures.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const cp = (n: number): string => String.fromCodePoint(n);

/** The element names the dashboard may have (HTML and inline SVG). A new element fails this test. */
const ELEMENTS = new Set(["html", "head", "meta", "title", "style", "body", "h1", "h2", "h3", "p", "section", "table", "thead", "tbody", "tr", "th", "td", "details", "summary", "ul", "li", "svg", "g", "rect", "line", "polyline"]);
/** The attribute names the dashboard may have. */
const ATTRIBUTES = new Set(["lang", "http-equiv", "content", "charset", "name", "class", "data-k", "data-chart", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "points", "role"]);
const SVG_ELEMENTS = new Set(["svg", "g", "rect", "line", "polyline", "title"]); // no <text> (ADR-0035 decision 2)
const SVG_ATTRIBUTES = new Set(["viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "points", "class", "data-chart", "role"]);
const SVG_CLASSES = new Set(["chart", "bar-passed", "bar-failed", "bar-error", "series", "axis"]);
const VIEW_BOX = "0 0 600 120";
const MARKER_TIMEOUT = 7919;

interface Tag {
  name: string;
  closing: boolean;
  attributes: Array<[string, string]>;
  /** What is left in the tag after the name and the attributes of the form name="value" (empty for a well-formed tag). */
  rest: string;
}

/** Every tag of the document (the doctype left out). The values in it are escaped, so `<` starts a tag of the template only. */
function tags(html: string): Tag[] {
  const out: Tag[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const attributes: Array<[string, string]> = [];
    const rest = (m[3] ?? "").replace(/\s+([a-zA-Z][a-zA-Z0-9:-]*)="([^"]*)"/g, (_all, n: string, v: string) => {
      attributes.push([n, v]);
      return "";
    });
    out.push({ name: m[2] ?? "", closing: m[1] === "/", attributes, rest: rest.trim() });
  }
  return out;
}

/** The leaves of a JSON value with their dotted paths (keys and array indices). */
function leaves(v: unknown, p: string[] = [], out: Array<{ path: string; value: unknown }> = []): Array<{ path: string; value: unknown }> {
  if (Array.isArray(v)) v.forEach((x, i) => leaves(x, [...p, String(i)], out));
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) leaves(x, [...p, k], out);
  else out.push({ path: p.join("."), value: v });
  return out;
}

/** A pattern of the mapping table or the allowlist (`*` = an array index) as a regular expression of a whole path. */
const pattern = (p: string): RegExp => new RegExp(`^${p.split(".").map((s) => (s === "*" ? "(?:0|[1-9][0-9]*)" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("\\.")}$`);
const SHOWN = HTML_SHOWN.map(pattern);
const NOT_SHOWN = HTML_NOT_SHOWN.map((e) => pattern(e.path));
/** The string fields of the JSON that can be null (not numbers). */
const NULLABLE_STRINGS = ["unread.*.code", "projects.*.configs.*.sha256"].map(pattern);

/** data-k → text, in document order. */
function dataK(html: string): Array<[string, string]> {
  return [...html.matchAll(/\sdata-k="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1] ?? "", m[2] ?? ""]);
}

function get(doc: unknown, p: string): unknown {
  return p.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], doc);
}

/** Runs aiqh history with --json and --html on the same input: the JSON document and the HTML file. */
async function both(from: string[]): Promise<{ code: number; doc: Record<string, unknown>; json: string; html: string; err: string[] }> {
  const t = makeTempDir("aiqh-html-");
  cleanups.push(t.cleanup);
  const written: string[] = [];
  const err: string[] = [];
  const write = (text: string): void => {
    written.push(text);
  };
  const code = await runHistory({ from, json: true, html: true, out: t.dir, toolVersion: "0.0.0-fixed", write, logError: (l) => err.push(l), cwd: "/" });
  const json = written.join("");
  return { code, doc: JSON.parse(json) as Record<string, unknown>, json, html: readFileSync(path.join(t.dir, "dashboard.html"), "utf8"), err };
}

/**
 * Two sources. #1: project alpha on three days — check unit (vitest counts on days 0 and 2, none on day 1: a null value; timeoutSec
 * MARKER_TIMEOUT), check flaky (FAIL, PASS, FAIL, PASS: failure-prone), check skipped (SKIPPED only: failRate null); two aiqh versions;
 * a run without configSha256. #2: project beta, one run. Names without digits (the SVG text test).
 */
function rich(names: { alpha: string; beta: string; unit: string } = { alpha: "alpha", beta: "beta", unit: "unit" }): string[] {
  const a = historyDir(cleanups, "root");
  const b = historyDir(cleanups, "root");
  const counts = { testFiles: 2, testFilesPassed: 2, tests: 20, testsPassed: 20, testsFailed: 0, errors: 0 };
  const vitest = { tool: "vitest", status: "parsed", reason: SENTINELS.reason, truncated: false, counts, items: [{ kind: "failed-test", name: SENTINELS.itemName }], itemsOmitted: 0 };
  const unparsed = { tool: "vitest", status: "unparsed", reason: SENTINELS.reason, truncated: false, counts: {}, items: [], itemsOmitted: 0 };
  for (let i = 0; i < 4; i++) {
    const day = Math.min(i, 2);
    const checks = [
      check({ name: names.unit, timeoutSec: MARKER_TIMEOUT, parsed: day === 1 ? unparsed : vitest }),
      check({ name: "flaky", status: i % 2 === 0 ? "FAIL" : "PASS", exitCode: i % 2 === 0 ? 1 : 0 }),
      check({ name: "skipped", status: "SKIPPED", exitCode: null }),
    ];
    const over: Record<string, unknown> = { project: { name: names.alpha, root: `/abs/${SENTINELS.root}` }, startedAt: new Date(Date.UTC(2026, 0, 1 + day) + i * 1000).toISOString(), verdict: i % 2 === 0 ? "FAILED" : "PASSED", checks };
    if (i === 3) over.tool = { name: "ai-quality-harness", version: "0.12.0-test" };
    const r = report(over);
    if (i === 1) delete r.configSha256;
    put(a.history, stamp(i), r);
  }
  put(b.history, stamp(0), report({ project: { name: names.beta, root: "/x" } }));
  return [a.root, b.root];
}

describe("ADR-0035 decision 2 / 8: no script, no external resource, no event attribute; names stay text", () => {
  const INJECT = `x</td><script>alert(x)</script>"q" 'a' & &lt; </style></title> javascript:void(x) <svg onload=x> <!-- ]]> ${cp(0x202e)}${cp(0x7)}${cp(0x2028)}\n${cp(0x9)}end`;

  it("the element and attribute names are the fixed lists; a name with markup, references and raw characters is escaped text", async () => {
    const r = await both(rich({ alpha: INJECT, beta: `b ${INJECT}`, unit: `u ${INJECT}` }));
    expect(r.code).toBe(0);
    const all = tags(r.html);
    expect(all.length).toBeGreaterThan(50);
    for (const t of all) {
      expect(ELEMENTS.has(t.name), t.name).toBe(true);
      expect(t.rest, `<${t.name}>`).toBe("");
      for (const [n, v] of t.attributes) {
        expect(ATTRIBUTES.has(n), n).toBe(true);
        expect(/^on/i.test(n), n).toBe(false);
        expect(v.toLowerCase(), n).not.toContain("javascript:");
      }
    }
    expect(r.html.toLowerCase()).not.toContain("<script");
    expect(r.html.match(/<style>/g)).toHaveLength(1);
    expect(r.html.match(/<\/style>/g)).toHaveLength(1);
    expect(r.html.match(/<title>/g)?.length).toBe(r.html.match(/<\/title>/g)?.length);
    expect(findRawChars(r.html.replace(/\n/g, ""))).toEqual([]); // the newlines of the template are the only control characters
    expect(r.html).not.toContain("\t");
    const escaped = "x&lt;/td&gt;&lt;script&gt;alert(x)&lt;/script&gt;&quot;q&quot; &#39;a&#39; &amp; &amp;lt; &lt;/style&gt;&lt;/title&gt; javascript:void(x) &lt;svg onload=x&gt; &lt;!-- ]]&gt; \\u{202E}\\u{7}\\u{2028}\\u{A}\\u{9}end";
    expect(r.html).toContain(`>${escaped}<`);
    expect(r.html).toContain(`>b ${escaped}<`);
  });
});

describe("ADR-0035 decision 3: the CSP meta", () => {
  it("is the first child of <head>; its style-src hash is the SHA-256 of the one <style>; the referrer meta is there", async () => {
    const r = await both(rich());
    const head = /<head>\s*(<meta [^>]*>)/.exec(r.html);
    const style = /<style>([\s\S]*?)<\/style>/.exec(r.html)?.[1] ?? "";
    const hash = createHash("sha256").update(style, "utf8").digest("base64");
    expect(head?.[1]).toBe(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${hash}'; img-src 'none'; base-uri 'none'; form-action 'none'">`);
    expect(r.html).toContain('<meta name="referrer" content="no-referrer">');
    expect(r.html.startsWith("<!doctype html>\n")).toBe(true);
    expect(style.length).toBeGreaterThan(100);
  });
});

describe("ADR-0035 decision 6 (M4-D-R1-004): the mapping table and the allowlist", () => {
  it("every numeric leaf of the JSON is in exactly one of the mapping table and the allowlist", async () => {
    const r = await both(rich());
    const ls = leaves(r.doc);
    const numeric = ls.filter((l) => typeof l.value === "number");
    expect(numeric.length).toBeGreaterThan(60);
    for (const l of numeric) expect(SHOWN.filter((re) => re.test(l.path)).length + NOT_SHOWN.filter((re) => re.test(l.path)).length, l.path).toBe(1);
    for (const l of ls.filter((x) => x.value === null)) expect(SHOWN.some((re) => re.test(l.path)) || NULLABLE_STRINGS.some((re) => re.test(l.path)), l.path).toBe(true);
    expect(ls.some((l) => l.value === null && /\.failRate$/.test(l.path))).toBe(true); // the fixture has a null failRate
    expect(ls.some((l) => l.value === null && /\.value$/.test(l.path))).toBe(true); // and a day without a value
  });

  it("the mapping table is all in the HTML, once, with the JSON's string (null as -); no allowlisted number is shown", async () => {
    const r = await both(rich());
    const shown = dataK(r.html);
    const keys = shown.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
    const expected = leaves(r.doc)
      .filter((l) => (typeof l.value === "number" || l.value === null) && SHOWN.some((re) => re.test(l.path)))
      .map((l): [string, string] => [l.path, l.value === null ? "-" : String(l.value)]);
    expect(new Map(shown)).toEqual(new Map(expected));
    for (const k of keys) expect(NOT_SHOWN.some((re) => re.test(k)), k).toBe(false);
    expect(get(r.doc, "projects.0.checks.0.lastTimeoutSec")).toBe(MARKER_TIMEOUT);
    expect(r.html).not.toContain(String(MARKER_TIMEOUT));
    expect(HTML_NOT_SHOWN.map((e) => e.path)).toContain("projects.*.checks.*.lastTimeoutSec");
  });

  it("the source labels #<n> are in the order of sources and carry no data-k", async () => {
    const r = await both(rich());
    const rows = [...r.html.matchAll(/<th>#(\d+)<\/th><td data-k="sources\.(\d+)\.historyFiles"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const sources = r.doc.sources as Array<{ index: number }>;
    expect(rows).toEqual(sources.map((s, i) => [s.index, i]));
  });
});

describe("ADR-0035 decisions 4 and 6: SVG", () => {
  it("one bar group per day, one point per value; fixed attributes; coordinates of one decimal inside the viewBox; no number in its text", async () => {
    const r = await both(rich());
    const charts = [...r.html.matchAll(/<svg([^>]*)>([\s\S]*?)<\/svg>/g)];
    const expectedCharts: string[] = [];
    (r.doc.projects as Array<{ counts: unknown[] }>).forEach((p, i) => {
      expectedCharts.push(`projects.${i}.days`);
      p.counts.forEach((_s, j) => expectedCharts.push(`projects.${i}.counts.${j}.days`));
    });
    const seen: string[] = [];
    for (const c of charts) {
      const svg = `<svg${c[1] ?? ""}>${c[2] ?? ""}</svg>`;
      const ts = tags(svg);
      const root = ts[0];
      const chart = root?.attributes.find(([n]) => n === "data-chart")?.[1] ?? "";
      seen.push(chart);
      expect(root?.attributes.find(([n]) => n === "viewBox")?.[1]).toBe(VIEW_BOX);
      expect(root?.attributes.find(([n]) => n === "role")?.[1]).toBe("img");
      for (const t of ts) {
        expect(SVG_ELEMENTS.has(t.name), t.name).toBe(true);
        for (const [n, v] of t.attributes) {
          expect(SVG_ATTRIBUTES.has(n), n).toBe(true);
          if (["x", "y", "width", "height", "x1", "y1", "x2", "y2"].includes(n)) {
            expect(v, `${n}=${v}`).toMatch(/^\d+\.\d$/);
            const max = ["x", "width", "x1", "x2"].includes(n) ? 600 : 120;
            expect(Number(v), `${n}=${v}`).toBeLessThanOrEqual(max);
          }
          if (n === "points") for (const pair of v.split(" ")) expect(pair).toMatch(/^\d+\.\d,\d+\.\d$/);
          if (n === "class") expect(SVG_CLASSES.has(v), v).toBe(true);
        }
      }
      const series = get(r.doc, chart) as Array<{ value?: number | null }>;
      expect(Array.isArray(series), chart).toBe(true);
      if (/^projects\.\d+\.days$/.test(chart)) expect(svg.match(/<g[ >]/g)?.length ?? 0, chart).toBe(series.length);
      else {
        const points = /points="([^"]*)"/.exec(svg)?.[1] ?? "";
        expect(points === "" ? 0 : points.split(" ").length, chart).toBe(series.filter((d) => d.value !== null).length);
      }
      const text = [...svg.matchAll(/<(text|title)>([^<]*)<\/\1>/g)].map((m) => m[2] ?? "").join(" ");
      expect(text.replace(/\d{4}-\d{2}-\d{2}/g, ""), chart).not.toMatch(/\d/);
    }
    expect(seen.sort()).toEqual(expectedCharts.sort());
  });
});

describe("ADR-0035 decision 7: the fields that are not shown appear nowhere (the same fixture as the terminal and --json)", () => {
  it("no marker of a hidden field, and no --from path, in the HTML, the JSON, the table or the errors", async () => {
    const h = historyDir(cleanups, "root");
    const items = [{ kind: "allowed", name: SENTINELS.allowRule }, { kind: "allow-rule-used", name: SENTINELS.allowRule }];
    const scan = check({ name: "security", kind: "security", parsed: { tool: "aiqh-security-scan", status: "parsed", reason: SENTINELS.reason, truncated: false, counts: { findings: 0, suppressed: 2, allowRulesUsed: 1, expiredAllowRules: 0, unusedAllowRules: 0 }, items, itemsOmitted: 0 } });
    for (let i = 0; i < 3; i++) put(h.history, stamp(i), report({ startedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), checks: [check({ status: i === 0 ? "FAIL" : "PASS" }), scan] }));
    put(h.history, stamp(9), "{");
    const r = await both([h.root]);
    const table: string[] = [];
    await runHistory({ from: [h.root], json: false, toolVersion: "0.0.0-fixed", log: (l) => table.push(l), logError: (l) => table.push(l), cwd: "/" });
    const text = [r.html, r.json, ...r.err, ...table].join("\n");
    for (const s of Object.values(SENTINELS)) expect(text, s).not.toContain(s);
    expect(text).not.toContain(h.root);
    expect(r.html).toContain("aiqh-security-scan");
  });
});
