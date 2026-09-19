import { z } from "zod";
import { configSchema } from "./schema.ts";

/**
 * JSON Schema (draft 2020-12) generated from the zod config schema; committed under schema/.
 * The schema is structural (editor completion / validation); the cross-field rules — unique check
 * names, at least one required check — are enforced only by `aiqh` at runtime (M1-R1-008, option B).
 */
export const SCHEMA_DESCRIPTION =
  "Structural schema for aiqh.config.jsonc (editor completion and validation). The final validation is done by aiqh at run time: check names must be unique, at least one check must be required (defaults.required applies), and commands must not be blank.";

export function generateConfigJsonSchema(): string {
  const schema = z.toJSONSchema(configSchema, { unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  const withMeta = { $id: "https://github.com/youhei-dev/ai-quality-harness/schema/aiqh.config.schema.json", title: "aiqh.config.jsonc", description: SCHEMA_DESCRIPTION, ...schema };
  return `${JSON.stringify(withMeta, null, 2)}\n`;
}
