import { CATEGORY_KINDS, type CategoryKind, type ProjectType } from "../types.ts";
import { BUILTIN_ADAPTERS } from "./builtin.ts";
import { NODE_ADAPTERS } from "./node.ts";
import { PYTHON_ADAPTERS } from "./python.ts";
import type { Adapter, Detection, KindResolution, RepoContext, Resolution } from "./types.ts";

export const ALL_ADAPTERS: readonly Adapter[] = [...NODE_ADAPTERS, ...PYTHON_ADAPTERS, ...BUILTIN_ADAPTERS];

/** Run every adapter and pick, per category, the first available detection (adapter order = priority). */
export function resolveDetections(ctx: RepoContext, adapters: readonly Adapter[] = ALL_ADAPTERS): Resolution {
  const byKind = {} as Record<CategoryKind, KindResolution>;
  for (const kind of CATEGORY_KINDS) byKind[kind] = { chosen: null, alternatives: [], unavailable: [] };
  for (const adapter of adapters) {
    const det: Detection | null = adapter.detect(ctx);
    if (det === null) continue;
    const slot = byKind[det.kind];
    if (det.status === "available") {
      if (slot.chosen === null) slot.chosen = det;
      else slot.alternatives.push(det);
    } else {
      slot.unavailable.push(det);
    }
  }
  const projectType: ProjectType = ctx.node && ctx.python ? "mixed" : ctx.node ? "node" : ctx.python ? "python" : "other";
  return { projectType, byKind };
}
