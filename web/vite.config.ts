import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin API calls in dev, so no CORS setup is needed.
    proxy: { "/api": "http://localhost:3001" },
  },
});
