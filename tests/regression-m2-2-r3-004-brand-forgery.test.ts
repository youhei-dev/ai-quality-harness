/**
 * M2-1-R3-004 (Medium, fixed in M2-2): `Checked` / `Md` were compile-time brands guarded by a test that searched
 * the source for the text `as Checked`. Aliases (`type C = Checked`), `any`, `JSON.parse`, type guards, generic
 * casts, method bivariance and covariant containers all passed `tsc --strict` and that test.
 *  - static: the brand guard (tests/structure/brand-guard.ts, type checker) reports every bypass form of the
 *    fixtures below, and src/ creates the brands only in the issuers, called only by the renderers
 *  - runtime: the renderers, md, the Builder and the ZIP writer throw for a string that never passed the check
 *    (a registry in checked.ts / packet.ts), so a bypass that the static guard misses still fails closed
 *  - the registry changes no output: two packets from the same input are byte-identical, in one process and
 *    in a fresh one
 * Before the fix, the old guard (a regular expression) detected 2 of the 21 forms of the review, and the
 * renderers accepted any string at run time.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { UncheckedValueError, checkValue, type Checked } from "../src/review/checked.ts";
import { inlineCode, md, renderPath, type Md } from "../src/review/packet.ts";
import { createStoredZip } from "../src/review/zip.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import { brandGuard } from "./structure/brand-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const C = 'import { REJECTED, type Checked } from "../../../src/review/checked.ts";';
const P = (names: string): string => `import { ${names} } from "../../../src/review/packet.ts";`;
const RAW = "const raw: string = String(Date.now());";

/** One bypass per file; every file must type-check (a bypass that does not compile proves nothing). */
const FORMS: Record<string, string> = {
  b01_as_any: `${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): Md => inlineCode(raw as any);\n`,
  b02_alias: `${C}\n${P("inlineCode, type Md")}\n${RAW}\ntype A = Checked;\nexport const f = (): Md => inlineCode(raw as A);\nexport const r = REJECTED;\n`,
  b03_json_parse: `${C}\n${P("inlineCode, type Md")}\nexport const f = (): Md => {\n  const x: Checked = JSON.parse('"unchecked"');\n  return inlineCode(x);\n};\nexport const r = REJECTED;\n`,
  b04_md_any: `${P("md, type Md")}\n${RAW}\nexport const f = (): Md => md\`\${raw as any}\`;\n`,
  b05_unknown_as: `${C}\n${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): Md => inlineCode(raw as unknown as Checked);\nexport const r = REJECTED;\n`,
  b07_never: `${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): Md => inlineCode(raw as never);\n`,
  b08_parameters: `${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): Md => inlineCode(raw as Parameters<typeof inlineCode>[0]);\n`,
  b09_type_guard: `${C}\n${P("inlineCode, md, type Md")}\n${RAW}\nfunction isC(_x: string): _x is Checked {\n  return true;\n}\nexport const f = (): Md => (isC(raw) ? inlineCode(raw) : md\`\`);\nexport const r = REJECTED;\n`,
  b10_asserts: `${C}\n${P("inlineCode, type Md")}\n${RAW}\nfunction assertC(_x: string): asserts _x is Checked {}\nexport const f = (): Md => {\n  const v: string = raw;\n  assertC(v);\n  return inlineCode(v);\n};\nexport const r = REJECTED;\n`,
  b11_reflect_apply: `${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): unknown => Reflect.apply(inlineCode, undefined, [raw]);\nexport type T = Md;\n`,
  b12_generic_cast: `${C}\n${P("inlineCode, type Md")}\n${RAW}\nfunction cast<T>(x: unknown): T {\n  return x as T;\n}\nexport const f = (): Md => inlineCode(cast<Checked>(raw));\nexport const r = REJECTED;\n`,
  b13_zip_json_parse: 'import { createStoredZip } from "../../../src/review/zip.ts";\nexport const f = (): Buffer => createStoredZip([{ name: JSON.parse(\'"n.md"\'), data: Buffer.alloc(0) }]);\n',
  b14_ts_ignore: `${P("inlineCode, type Md")}\n${RAW}\n// @ts-ignore -- bypass\nexport const f = (): Md => inlineCode(raw);\n`,
  b15_typeof: `${C}\n${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): Md => inlineCode(raw as typeof REJECTED);\nexport type T = Checked;\n`,
  b16_array_json_parse: `${C}\n${P("renderPath, type Md")}\nexport const f = (): Md => {\n  const arr: Checked[] = JSON.parse('["x"]');\n  return renderPath(arr[0] ?? REJECTED);\n};\n`,
  b17_md_alias: `${P("md, type Md")}\n${RAW}\ntype M = Md;\nexport const f = (): Md => md\`\${raw as M}\`;\n`,
  b18_method_bivariance: `${P("inlineCode, type Md")}\n${RAW}\ninterface Renderer {\n  render(s: string): Md;\n}\nexport const f = (): Md => {\n  const r: Renderer = { render: inlineCode };\n  return r.render(raw);\n};\n`,
  b19_array_covariance: `${C}\n${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): Md => {\n  const cs: Checked[] = [];\n  const ss: string[] = cs;\n  ss.push(raw);\n  return inlineCode(cs[0] ?? REJECTED);\n};\n`,
  b20_property_covariance: `${C}\n${P("inlineCode, type Md")}\n${RAW}\nexport const f = (ok: Checked): Md => {\n  const o: { v: Checked } = { v: ok };\n  const w: { v: string } = o;\n  w.v = raw;\n  return inlineCode(o.v);\n};\nexport const r = REJECTED;\n`,
  b21_catch_value: `${C}\n${P("inlineCode, type Md")}\n${RAW}\nexport const f = (): Md => {\n  try {\n    throw new Error(raw);\n  } catch (e) {\n    return inlineCode(e as Checked);\n  }\n};\nexport const r = REJECTED;\n`,
  b22_map_alias: `${C}\n${P("inlineCode, type Md")}\n${RAW}\ntype A = Checked;\nexport const f = (): Md => {\n  const m = new Map<string, A>();\n  m.set("k", raw as A);\n  return inlineCode(m.get("k") ?? REJECTED);\n};\n`,
  b23_md_direct_call: `${P("md, type Md")}\n${RAW}\nexport const f = (): Md => md([raw] as unknown as TemplateStringsArray);\n`,
};
const FIXTURE_DIR = "tests/__fixtures__/brand";
const fixtures = Object.fromEntries(Object.entries(FORMS).map(([name, text]) => [`${FIXTURE_DIR}/${name}.ts`, text]));
const program = createProgram(fixtures);

const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
/** The version the CLI puts into the packet metadata (the in-process runs use the same, so the bytes can be compared). */
const VERSION = (JSON.parse(readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf8")) as { version: string }).version;

describe("M2-1-R3-004: static — the brand guard with the type checker", () => {
  it("every fixture type-checks (tsc accepts each bypass)", () => {
    expect(typeErrors(program, filesUnder(program, FIXTURE_DIR))).toEqual([]);
  });

  it("every bypass form is reported", () => {
    const violations = brandGuard(program, filesUnder(program, FIXTURE_DIR));
    const missed = Object.keys(FORMS).filter((name) => !violations.some((v) => v.where.startsWith(`${FIXTURE_DIR}/${name}.ts:`)));
    expect(missed).toEqual([]);
  });

  it("src creates the brands only in the issuers, called only by the renderers", () => {
    expect(brandGuard(program, filesUnder(program, "src/"))).toEqual([]);
  });
});

describe("M2-1-R3-004: runtime — a string that never passed the check is rejected", () => {
  const unique = (tag: string): string => `never-checked-${tag}-${process.pid}-${Date.now()}`;
  const forged = (tag: string): Checked => JSON.parse(JSON.stringify(unique(tag)));

  it("inlineCode / renderPath throw for a forged Checked", () => {
    expect(() => inlineCode(forged("inline"))).toThrow(UncheckedValueError);
    expect(() => renderPath(forged("path"))).toThrow(UncheckedValueError);
  });

  it("the ZIP writer throws for a forged entry name", () => {
    expect(() => createStoredZip([{ name: forged("zip"), data: Buffer.alloc(0) }])).toThrow(UncheckedValueError);
  });

  it("md throws for a forged Md and for a direct call", () => {
    const fake: Md = JSON.parse(JSON.stringify(unique("md")));
    expect(() => md`x ${fake} y`).toThrow(UncheckedValueError);
    expect(() => md(Object.assign([unique("tag")], { raw: [unique("tag")] }))).toThrow(UncheckedValueError);
  });

  it("checked values, rendered fragments and numbers pass", () => {
    const r = checkValue("docs/ok.md", DEFAULT_SECURITY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cell = inlineCode(r.value);
    expect(md`a ${cell} b ${3}`).toBe("a `docs/ok.md` b 3");
    expect(createStoredZip([{ name: r.value, data: Buffer.from("x") }]).length).toBeGreaterThan(0);
  });
});

describe("M2-1-R3-004: the registry changes no output", () => {
  function repo(tag: string, content: string): { dir: string; base: string } {
    const t = makeTempDir(`aiqh-r3-004-${tag}-`);
    cleanups.push(t.cleanup);
    const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
    git("init", "-q");
    writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
    git("add", "--", "a.ts");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD").trim();
    mkdirSync(path.join(t.dir, "src"), { recursive: true });
    writeFileSync(path.join(t.dir, "src", "b.ts"), content);
    git("add", "--", "src/b.ts");
    git("commit", "-q", "-m", "change | with `ticks`");
    return { dir: t.dir, base };
  }
  async function build(r: { dir: string; base: string }, out: string): Promise<{ packet: string; zip: string }> {
    const err: string[] = [];
    const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, label: "same", output: out, zip: true, toolVersion: VERSION, log: () => {}, logError: (l) => err.push(l) });
    expect(code, err.join("\n")).toBe(0);
    return { packet: sha(readFileSync(out)), zip: sha(readFileSync(out.replace(/\.md$/, ".zip"))) };
  }

  it("two packets and ZIPs from the same input are byte-identical, with other packets built in between", async () => {
    const a = repo("a", "export const b = `x|y`;\n");
    const other = repo("other", "export const c = 2;\n");
    const first = await build(a, path.join(a.dir, "out1", "packet.md"));
    await build(other, path.join(other.dir, "out", "packet.md"));
    const second = await build(a, path.join(a.dir, "out2", "packet.md"));
    expect(second).toEqual(first);
  });

  it("the packet built in this process equals the one built by a fresh process", async () => {
    const a = repo("fresh", "export const b = 'fresh';\n");
    const inProcess = await build(a, path.join(a.dir, "in", "packet.md"));
    const cli = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
    const out = path.join(a.dir, "cli", "packet.md");
    const r = spawnSync(process.execPath, [cli, "review-packet", "--cwd", a.dir, "--range", `${a.base}..HEAD`, "--label", "same", "-o", out, "--zip"], { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
    expect(r.status, r.stderr).toBe(0);
    expect({ packet: sha(readFileSync(out)), zip: sha(readFileSync(out.replace(/\.md$/, ".zip"))) }).toEqual(inProcess);
  });
});
