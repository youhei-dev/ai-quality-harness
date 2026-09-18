/** Regenerate schema/aiqh.config.schema.json from the zod schema (npm run schema:gen). */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateConfigJsonSchema } from "../src/config/json-schema.ts";

const out = path.resolve(import.meta.dirname, "..", "schema", "aiqh.config.schema.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, generateConfigJsonSchema());
console.log(`wrote ${out}`);
