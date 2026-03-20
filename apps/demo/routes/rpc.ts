import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { logger } from "../server/logger";
import { router } from "../server/router";

const handler = new RPCHandler(router, {
  plugins: [
    new CORSPlugin({
      origin: (origin) => {
        if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
          return origin;
        }
        const allowed: string[] = [];
        for (const host of [
          process.env.VERCEL_URL,
          process.env.VERCEL_BRANCH_URL,
          process.env.VERCEL_PROJECT_PRODUCTION_URL,
        ]) {
          if (host) allowed.push(`https://${host}`);
        }
        return allowed;
      },
    }),
  ],
  interceptors: [
    onError((error) => {
      logger.error({ err: error }, "rpc error");
    }),
  ],
});

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const procedure = url.pathname.replace(/^\/rpc\/?/, "");
    const start = performance.now();

    const { response } = await handler.handle(request, {
      prefix: "/rpc",
      context: {},
    });

    const status = response?.status ?? 404;
    const duration = Math.round(performance.now() - start);

    logger.info(
      {
        method: request.method,
        procedure,
        status,
        duration,
      },
      "rpc request",
    );

    return response ?? new Response("Not found", { status: 404 });
  },
};
