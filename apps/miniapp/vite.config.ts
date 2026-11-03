import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // shared paketini TS manbasidan to'g'ridan-to'g'ri olamiz (CJS build'siz)
    alias: { "@onatili/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
  },
  server: {
    port: 5180,
    host: "127.0.0.1",
    // cloudflared tunnel orqali ochilganda host tekshiruvi to'smasligi uchun
    allowedHosts: true,
    proxy: { "/api": "http://127.0.0.1:4100" },
  },
});
