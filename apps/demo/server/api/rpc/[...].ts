import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import {
    defineHandler,
    getRequestHeaders,
    getRequestURL,
    readRawBody,
} from "nitro/h3";
import { useRuntimeConfig } from "nitro/runtime-config";
import { router } from "~/server/utils/router.ts";

const handler = new RPCHandler(router, {
    interceptors: [
        onError((error) => {
            console.error("[rpc]", error);
        }),
    ],
});

export default defineHandler(async (event) => {
    const { app } = useRuntimeConfig();
    const url = getRequestURL(event);
    const base = app.baseURL as string;
    if (base && base !== "/" && url.pathname.startsWith(base)) {
        url.pathname = `/${url.pathname.slice(base.length)}` || "/";
    }
    const method = event.method;
    const headers = getRequestHeaders(event);
    const body = method === "GET" ? undefined : await readRawBody(event);

    const request = new Request(url, {
        method,
        headers,
        body,
    });

    const { response } = await handler.handle(request, {
        prefix: "/api/rpc",
        context: {},
    });
    return response ?? new Response("Not found", { status: 404 });
});
