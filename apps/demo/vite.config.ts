import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
    base: "/demo/",
    plugins: [react(), tailwindcss(), nitro()],
    resolve: {
        alias: {
            "@remoraflow/core": new URL(
                "../../packages/core/src/index.ts",
                import.meta.url,
            ).pathname,
            "@remoraflow/ui": new URL(
                "../../packages/ui/src/index.ts",
                import.meta.url,
            ).pathname,
        },
        tsconfigPaths: true,
    },
});
