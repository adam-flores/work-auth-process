import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app builds to dist/ and is served by the Node process in production
// (ADR-0010: one process serves both). `npm run dev` proxies the API to a
// separately running `npm run dev:api`.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
