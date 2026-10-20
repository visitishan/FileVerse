import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const env = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!env.TAURI_ENV_DEBUG,
  },
});
