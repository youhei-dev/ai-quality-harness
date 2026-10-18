import { z } from "zod";
import { CHECK_KINDS } from "../types.ts";
import { SECRET_CATEGORIES } from "../security/patterns.ts";
import { MIN_LINE_OVERLAP_BYTES } from "./window-limits.ts";

export const CHECK_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const DEFAULT_TIMEOUT_SEC = 600;
/**
 * The largest timeoutSec (v0.10.1, Q12 of the M4 design): a check is waited with setTimeout(…, timeoutSec * 1000), and a Node.js
 * timer cannot wait longer than 2,147,483,647 ms — a longer delay becomes 1 ms, so the check timed out at once.
 */
export const MAX_TIMEOUT_SEC = Math.floor(2_147_483_647 / 1000);
const TIMEOUT_TOO_LONG = `timeoutSec must be at most ${MAX_TIMEOUT_SEC} (seconds): a Node.js timer cannot wait longer than 2147483647 ms`;
export const DEFAULT_REQUIRED = true;
export const DEFAULT_OUTPUT_DIR = "artifacts/verification";

const checkSchema = z.strictObject({
  name: z
    .string()
    .regex(CHECK_NAME_PATTERN, "name must match ^[a-z0-9][a-z0-9-]*$"),
  kind: z.enum(CHECK_KINDS),
  // A regex (not a refine) so the constraint also lands in the generated JSON Schema (M1-R1-008).
  command: z.string().regex(/\S/, "command must not be blank"),
  cwd: z.string().optional(),
  required: z.boolean().optional(),
  timeoutSec: z.number().int().positive().max(MAX_TIMEOUT_SEC, TIMEOUT_TOO_LONG).optional(),
  description: z.string().optional(),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** `security.allow[]` entry (M2-0 §7): path glob, optional category / line, mandatory reason, optional expiry. */
/**
 * Free text of an allow rule must stay on one printable line (M2-0-R1-002 / R2-002): no C0 control
 * characters (U+0000–U+001F, which includes CR / LF / TAB / ESC), no DEL (U+007F), no C1 controls
 * (U+0080–U+009F, which includes NEL), no U+2028 / U+2029 line separators. Written as explicit
 * ranges without the `u` flag so the generated JSON Schema `pattern` is the same expression.
 */
// eslint-disable-next-line no-control-regex -- the control ranges are the point of this rule (M2-0-R2-002)
const ONE_PRINTABLE_LINE = /^[^\u0000-\u001F\u007F-\u009F\u2028\u2029]*$/;
const allowRuleSchema = z.strictObject({
  path: z.string().regex(/\S/, "allow.path must not be blank").regex(ONE_PRINTABLE_LINE, "allow.path must not contain control characters or line separators"),
  category: z.enum(SECRET_CATEGORIES as [string, ...string[]]).optional(),
  line: z.number().int().positive().optional(),
  reason: z.string().regex(/\S/, "allow.reason is mandatory and must not be blank").regex(ONE_PRINTABLE_LINE, "allow.reason must not contain control characters or line separators"),
  expires: z.string().regex(ISO_DATE, "allow.expires must be YYYY-MM-DD").refine(isRealDate, "allow.expires must be a real date").optional(),
});

/** `security` section (M2-0 §7 / §8). Every field is optional; defaults live in src/security/scan.ts. */
const securitySchema = z.strictObject({
  allow: z.array(allowRuleSchema).optional(),
  envProbePaths: z.array(z.string().min(1)).min(1).optional(),
  exampleEnvSuffixes: z.array(z.string().min(1)).optional(),
  maxLineBytes: z.number().int().positive().optional(),
  lineOverlapBytes: z.number().int().min(MIN_LINE_OVERLAP_BYTES).optional(),
  maxCarryBytes: z.number().int().positive().optional(),
});

export const configSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    project: z.strictObject({
      name: z.string().min(1, "project.name must not be empty"),
      type: z.enum(["node", "python", "mixed", "other"]).optional(),
    }),
    output: z
      .strictObject({
        dir: z.string().min(1).optional(),
      })
      .optional(),
    defaults: z
      .strictObject({
        timeoutSec: z.number().int().positive().max(MAX_TIMEOUT_SEC, TIMEOUT_TOO_LONG).optional(),
        required: z.boolean().optional(),
      })
      .optional(),
    checks: z.array(checkSchema).min(1, "checks must contain at least one check"),
    security: securitySchema.optional(),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    cfg.checks.forEach((check, index) => {
      if (seen.has(check.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["checks", index, "name"],
          message: `duplicate check name "${check.name}"`,
        });
      }
      seen.add(check.name);
    });

    const defaultRequired = cfg.defaults?.required ?? DEFAULT_REQUIRED;
    const hasRequired = cfg.checks.some((c) => c.required ?? defaultRequired);
    if (!hasRequired) {
      ctx.addIssue({
        code: "custom",
        path: ["checks"],
        message:
          "at least one check must be required (a config with zero required checks would always pass)",
      });
    }
  });

export type RawConfig = z.infer<typeof configSchema>;
export type RawCheck = RawConfig["checks"][number];
