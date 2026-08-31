import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "~/server/utils/router.ts";

const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${protocol}//${location.host}${import.meta.env.BASE_URL}_ws`;

const websocket = new WebSocket(wsUrl);

const link = new RPCLink({ websocket });

export const wsRpc = createORPCClient<RouterClient<AppRouter>>(link);
