/**
 * M1-R1-008 (option B): the JSON Schema is structural; the runtime keeps the final say. What the
 * schema can express (non-blank command) it expresses; the known divergences (duplicate names,
 * zero required checks) are listed here and must be rejected by the runtime parser.
 */
import { describe, expect, it } from "vitest";
import { generateConfigJsonSchema } from "../src/config/json-schema.ts";
import { ConfigError, parseConfigText } from "../src/config/load.ts";

type Schema = { description?: string; properties: { checks: { items: { properties: { command: { pattern?: string; description?: string } } }; contains?: unknown; minContains?: unknown; uniqueItems?: unknown } } };
const schema = JSON.parse(generateConfigJsonSchema()) as Schema;

describe("M1-R1-008: JSON Schema vs runtime validation", () => {
  it("command has a pattern that rejects whitespace-only strings", () => {
    const pattern = schema.properties.checks.items.properties.command.pattern;
    expect(pattern).toBeDefined();
    const re = new RegExp(pattern ?? "");
    expect(re.test("   ")).toBe(false);
    expect(re.test("")).toBe(false);
    expect(re.test("npm test")).toBe(true);
  });
  it("the schema says that the runtime performs the final semantic validation", () => {
    expect(schema.description ?? "").toMatch(/aiqh/);
    expect(schema.description ?? "").toMatch(/duplicate|required/i);
  });
  const divergences: Array<[string, string]> = [
    ["zero required checks", '{ "version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true", "required": false } ] }'],
    ["duplicate check names", '{ "version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true" }, { "name": "a", "kind": "custom", "command": "true" } ] }'],
  ];
  for (const [label, text] of divergences) {
    it(`known divergence: ${label} — not expressible in the schema, rejected by aiqh`, () => {
      // the schema has no cross-field construct for these
      expect(schema.properties.checks.contains).toBeUndefined();
      expect(schema.properties.checks.uniqueItems).toBeUndefined();
      expect(() => parseConfigText(text, label)).toThrow(ConfigError);
    });
  }
});
