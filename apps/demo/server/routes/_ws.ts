import { onError } from "@orpc/server";
import { experimental_RPCHandler as RPCHandler } from "@orpc/server/crossws";
import { defineWebSocketHandler } from "nitro";
import { type AppContext, router } from "~/server/utils/router.ts";

const handler = new RPCHandler(router, {
    interceptors: [
        onError((error) => {
            console.error("[ws]", error);
        }),
    ],
});

const peerContexts = new WeakMap<object, AppContext>();

export default defineWebSocketHandler({
    open(peer) {
        peerContexts.set(peer, { interventionManagers: new Map() });
    },
    message(peer, message) {
        handler.message(peer, message, {
            // biome-ignore lint/style/noNonNullAssertion: context is set in open()
            context: peerContexts.get(peer)!,
        });
    },
    close(peer) {
        handler.close(peer);
        peerContexts.delete(peer);
    },
});
