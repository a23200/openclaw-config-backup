import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("@react-three/drei") ||
            id.includes("three-stdlib") ||
            id.includes("troika-")
          ) {
            return "three-drei";
          }
          if (id.includes("@react-three/fiber")) {
            return "three-fiber";
          }
          if (
            id.includes("/three/") ||
            id.includes("camera-controls") ||
            id.includes("meshline") ||
            id.includes("maath")
          ) {
            return "three-core";
          }
          if (id.includes("lucide-react")) {
            return "ui-icons";
          }
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) {
            return "react-core";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
})
