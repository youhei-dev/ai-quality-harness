/**
 * M1 — the committed JSON Schema is generated from the zod config schema and stays in sync.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateConfigJsonSchema } from "../src/config/json-schema.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("aiqh.config.schema.json", () => {
  it("is committed under schema/ and equals the generator output", () => {
    const file = path.join(ROOT, "schema", "aiqh.config.schema.json");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(generateConfigJsonSchema());
  });
  it("describes the config shape", () => {
    const schema = JSON.parse(generateConfigJsonSchema()) as { properties?: Record<string, unknown>; required?: string[] };
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(["version", "project", "checks"]));
    expect(schema.required).toEqual(expect.arrayContaining(["version", "project", "checks"]));
  });
});
