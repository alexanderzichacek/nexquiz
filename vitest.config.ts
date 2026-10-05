import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Tests run against the shared sources, no build needed.
      "@nexquiz/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
      // `@/…` imports of the web app (same alias as in apps/web/vite.config.ts).
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
  },
});
