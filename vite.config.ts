import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Locally the API runs as `uvicorn app.main:app` on :8000 with routes at /v1/...;
// on Vercel it is mounted at /api, so the dev proxy strips the same prefix.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
