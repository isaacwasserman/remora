import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/demo/",
  resolve: {
    conditions: ["bun"],
    alias: {
      "@remoraflow/core": path.resolve(
        __dirname,
        "../../packages/core/src/lib.ts",
      ),
      "@remoraflow/ui": path.resolve(
        __dirname,
        "../../packages/ui/src/index.ts",
      ),
    },
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
