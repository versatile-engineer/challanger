import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Frontend /api so'rovlarini Rust backendga uzatadi
      "/api": "http://127.0.0.1:3000",
    },
  },
});
