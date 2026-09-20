/**
 * M2-0 §6: the key-value category is scanned, but only values that look like secrets are findings
 * (looksLikeSecretValue). The masker keeps masking broadly (unchanged).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { maskSecrets } from "../src/security/mask.ts";
import { looksLikeSecretValue, SCANNED_CATEGORIES } from "../src/security/patterns.ts";
import { scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const SECRET = fake("Zq7", "x9Lm2Pw4Rt"); // 13 chars, letters + digits
function repo(files: Record<string, string>): string {
  const t = makeTempDir("aiqh-m20-006-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  for (const [rel, c] of Object.entries(files)) writeFileSync(path.join(t.dir, rel), c);
  execFileSync("git", ["add", "--", ".gitignore", ...Object.keys(files)], { cwd: t.dir });
  return t.dir;
}
const kv = (dir: string) => scanRepository(dir).findings.filter((f) => f.kind === "secret" && f.category === "key-value").map((f) => [f.file, f.line]);

describe("M2-0 §6: looksLikeSecretValue", () => {
  it("accepts secret-like values", () => {
    for (const v of [SECRET, fake("Ab12", "cd34ef56"), fake("p@ss", "W0rd!2024")]) expect(looksLikeSecretValue(v), v).toBe(true);
  });
  it("rejects interpolations, placeholders, plain words and literals", () => {
    for (const v of ["${API_KEY}", "process.env.SECRET", 'os.environ["X"]', "%(password)s", "{{ secret }}", "<your-key-here>", "xxxxxxxx", "changeme", "example1234", "dummy-value-1", "placeholder", "your-api-key-1", "********", "REDACTED", "true", "false", "null", "None", "1234567890", "string", "password", "request.form[", "abc"]) {
      expect(looksLikeSecretValue(v), v).toBe(false);
    }
  });
});

describe("M2-0 §6: key-value scanning", () => {
  it("key-value is a scanned category", () => {
    expect(SCANNED_CATEGORIES).toContain("key-value");
  });
  it("detects secret-like assignments in code, JSON, dotenv and shell forms; reports file:line only", () => {
    const dir = repo({
      "a.py": `password = "${SECRET}"\n`,
      "b.json": `{ "api_key": "${SECRET}" }\n`,
      "c.env.txt": `DB_PASSWORD=${SECRET}\n`,
      "d.sh": `export TOKEN='${SECRET}'\n`,
    });
    const r = scanRepository(dir);
    expect(kv(dir).sort()).toEqual([["a.py", 1], ["b.json", 1], ["c.env.txt", 1], ["d.sh", 1]]);
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });
  it("does not flag ordinary code", () => {
    const dir = repo({
      "views.py": 'password = request.form["password"]\n',
      "auth.ts": "const password = getPassword();\nconst token = config.get('auth.token1');\nconst secret = this.secret2;\nauth_token = Config::token3;\napi_key = cfg->key4;\n",
      "types.ts": "token: string;\n",
      "config.js": "const apiKey = `api_key=${API_KEY}`;\n",
      "settings.ini": "secret=changeme\n",
      "sample.env.txt": ["PASSWORD=<your-password>", "TOKEN=", "API_KEY=xxxxxxxxxxxx", ""].join("\n"),
    });
    expect(kv(dir)).toEqual([]);
  });
  it("the masker still masks broadly (behaviour unchanged)", () => {
    expect(maskSecrets("password=changeme")).toContain("[REDACTED:key-value]");
    expect(maskSecrets('token: "string"')).toContain("[REDACTED:key-value]");
  });
});
