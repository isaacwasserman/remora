import { defineConfig } from "nitro";

export default defineConfig({
    serverDir: "./server",
    baseURL: "/demo/",
    features: {
        websocket: true,
    },
    vercel: {
        functions: {
            runtime: "bun1.x",
        },
    },
});
