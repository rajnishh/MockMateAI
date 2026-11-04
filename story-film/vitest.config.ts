import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Extra time for hooks and tests: the first test database in each file is built and migrated,
  // which is slow when the machine is also running the app, worker and tunnel.
  test: { include: ["tests/**/*.test.ts"], hookTimeout: 30_000, testTimeout: 20_000 },
});
