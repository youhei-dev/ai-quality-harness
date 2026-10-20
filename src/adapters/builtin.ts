/** Built-in adapters: the security scan shipped with aiqh (ADR-0010). */
import type { Adapter } from "./types.ts";

export const builtinSecurity: Adapter = {
  id: "builtin-security",
  kind: "security",
  detect(ctx) {
    if (!ctx.git.isRepo) {
      return { kind: "security", adapter: this.id, status: "unavailable", reason: "not a git repository (the scan targets git-tracked files)" };
    }
    return {
      kind: "security",
      adapter: this.id,
      status: "available",
      reason: "git repository; built-in scanner (no external tool)",
      suggestion: { name: "security", kind: "security", command: "aiqh security-scan", timeoutSec: 300, required: true, description: "Secret-shaped strings, raw bidi controls and line separators in tracked files, tracked .env files, .gitignore coverage (values are never printed)" },
      notes: ["needs the aiqh command on PATH (npm link) — see the resolution line in the init report"],
    };
  },
};

export const BUILTIN_ADAPTERS: readonly Adapter[] = [builtinSecurity];
