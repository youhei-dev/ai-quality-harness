/**
 * Window limits of the security scan (M2-0-R1-001). Shared by the config resolver (ConfigError) and
 * LineAssembler (ScanError); kept in its own module so neither imports the other.
 */
/** The relation the window limits must satisfy (shared with LineAssembler's own check); null when fine. */
export function windowLimitsProblem(s: { maxLineBytes: number; lineOverlapBytes: number; maxCarryBytes: number }): string | null {
  if (!(s.lineOverlapBytes > 0)) return "lineOverlapBytes must be > 0";
  if (s.lineOverlapBytes > s.maxCarryBytes) return `lineOverlapBytes (${s.lineOverlapBytes}) must be <= maxCarryBytes (${s.maxCarryBytes})`;
  if (s.maxCarryBytes > s.maxLineBytes) return `maxCarryBytes (${s.maxCarryBytes}) must be <= maxLineBytes (${s.maxLineBytes})`;
  return null;
}

