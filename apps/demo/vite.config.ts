import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/demo/",
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    conditions: ["bun"],
  },
  plugins: [
    react(),
    tailwindcss(),
    nitro({
      routes: {
        "/rpc/**": "./routes/rpc.ts",
      },
      vercel: {
        functions: {
          runtime: "bun1.x",
        },
      },
      plugins: ["./plugins/bot-id.ts"],
    }),
  ],
});
