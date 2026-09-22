/**
 * Window limits of the security scan (M2-0-R1-001, M2-0-R2-001). Shared by the config resolver
 * (ConfigError), the zod schema (`minimum`) and LineAssembler (ScanError); kept in its own module so
 * none of them imports the other.
 */

/**
 * Smallest overlap a window may keep. Every scanned pattern declares an anchor no longer than this
 * (tested: anchorMaxBytes <= MIN_LINE_OVERLAP_BYTES), so an anchor that touches the end of a window
 * is always kept whole for the next window — the first of the three properties behind the
 * completeness invariant (ADR-0013).
 */
export const MIN_LINE_OVERLAP_BYTES = 256;

/** The relation the window limits must satisfy; null when fine. */
export function windowLimitsProblem(s: { maxLineBytes: number; lineOverlapBytes: number; maxCarryBytes: number }): string | null {
  if (!(s.lineOverlapBytes >= MIN_LINE_OVERLAP_BYTES)) return `lineOverlapBytes (${s.lineOverlapBytes}) must be >= ${MIN_LINE_OVERLAP_BYTES}`;
  if (s.lineOverlapBytes > s.maxCarryBytes) return `lineOverlapBytes (${s.lineOverlapBytes}) must be <= maxCarryBytes (${s.maxCarryBytes})`;
  if (s.maxCarryBytes > s.maxLineBytes) return `maxCarryBytes (${s.maxCarryBytes}) must be <= maxLineBytes (${s.maxLineBytes})`;
  return null;
}
