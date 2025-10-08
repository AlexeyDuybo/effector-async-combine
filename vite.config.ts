import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import swc from '@vitejs/plugin-react-swc';

export default defineConfig({
  build: {
    lib: {
      entry: "./src/index.ts",
      name: "effector-async-combine",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["effector", 'react', 'effector-react'],
    },
  },
  plugins: [
    dts({ rollupTypes: true }),
    swc({ 
      plugins: [
        ["@effector/swc-plugin", {}]
      ] 
    })
  ],
  test: {
    testTimeout: 10000,
    globals: true,
    environment: "jsdom", // Use jsdom for browser-like tests
  },
});
