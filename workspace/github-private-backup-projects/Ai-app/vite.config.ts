import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiServerUrl = "http://127.0.0.1:5237";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5112,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiServerUrl,
        changeOrigin: true,
      },
      "/apks": {
        target: apiServerUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
  },
});
