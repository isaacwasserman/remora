import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "~/server/utils/router.ts";

const link = new RPCLink({
    url: `${window.location.origin}${import.meta.env.BASE_URL}api/rpc`,
});

export const rpc = createORPCClient<RouterClient<AppRouter>>(link);
