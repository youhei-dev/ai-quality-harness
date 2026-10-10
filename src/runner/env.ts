/**
 * The environment of a check (backlog 10): the parent's, without the variables that force a tool to color its output into a pipe
 * (FORCE_COLOR, PY_COLORS), and with NO_COLOR=1. NO_COLOR alone is not enough: eslint colors when FORCE_COLOR is set whatever NO_COLOR says,
 * pytest when PY_COLORS=1, and Node prints a warning when both FORCE_COLOR and NO_COLOR are set. CLICOLOR_FORCE and NPM_CONFIG_COLOR changed
 * no output when measured, so they are kept. This is the one place that builds a check's environment, and nothing else may build one. ROADMAP
 * backlog 6 (a minimal environment) was closed in v0.5.37 for the test:minpath script only (scripts/test-minimal-path.ts); this function is unchanged.
 */
export function checkEnv(parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...parent, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  delete env.PY_COLORS;
  return env;
}
