import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // B1-Q25 (v0.13.2): the default output, and at the end of the run the tests over half of their limit (stderr; the verdict does not change)
    reporters: ["default", "./tests/support/near-limit-reporter.ts"],
  },
});
