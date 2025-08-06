import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/index.ts",
      name: "effector-async-combine",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["effector"],
    },
  },
  plugins: [dts({ rollupTypes: true })],
  test: {
    testTimeout: 10000,
    globals: true,
    environment: "jsdom", // Use jsdom for browser-like tests
  },
});
