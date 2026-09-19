import { z } from "zod";
import { CHECK_KINDS } from "../types.ts";

export const CHECK_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const DEFAULT_TIMEOUT_SEC = 600;
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
  timeoutSec: z.number().int().positive().optional(),
  description: z.string().optional(),
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
        timeoutSec: z.number().int().positive().optional(),
        required: z.boolean().optional(),
      })
      .optional(),
    checks: z.array(checkSchema).min(1, "checks must contain at least one check"),
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
