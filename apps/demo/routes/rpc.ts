import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { router } from "../server/router";

const handler = new RPCHandler(router, {
  plugins: [new CORSPlugin()],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export default {
  async fetch(request: Request) {
    const { response } = await handler.handle(request, {
      prefix: "/rpc",
      context: {},
    });
    return response ?? new Response("Not found", { status: 404 });
  },
};
