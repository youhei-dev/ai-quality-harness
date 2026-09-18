import { z } from "zod";
import { configSchema } from "./schema.ts";

/** JSON Schema (draft 2020-12) generated from the zod config schema; committed under schema/. */
export function generateConfigJsonSchema(): string {
  const schema = z.toJSONSchema(configSchema, { unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  const withMeta = { $id: "https://github.com/youhei-dev/ai-quality-harness/schema/aiqh.config.schema.json", title: "aiqh.config.jsonc", ...schema };
  return `${JSON.stringify(withMeta, null, 2)}\n`;
}
