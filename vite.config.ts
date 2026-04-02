import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: ".",
  base: "/narratu-poc/",
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  server: {
    host: true,
    port: 4173,
    strictPort: true,
    watch: {
      ignored: [
        "**/server/**",
        "**/.claude/**",
        "**/node_modules/**",
        "**/SESSION_SUMMARY.md",
        "**/CHANGES.md",
        "**/.kit/**",
      ],
    },
  },
  build: {
    outDir: "docs",
  },
});
