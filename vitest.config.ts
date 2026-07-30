import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
      "packages/*/src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
    ],
    clearMocks: true,
  },
});
