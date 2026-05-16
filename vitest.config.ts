import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config. Pure-logic units only (no DB, no network, no
 * components). Tests live in src/lib/__tests__/*.test.ts.
 *
 * Why not Jest: Vitest is faster, has native ESM/TS, and the
 * config surface is one file. Why not Playwright in the same
 * repo: that runs against a deployed instance, lives elsewhere.
 */
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
