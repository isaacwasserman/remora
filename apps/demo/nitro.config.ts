import { defineConfig } from "nitro";

export default defineConfig({
    serverDir: "./server",
    baseURL: "/demo/",
    features: {
        websocket: true,
    },
});
