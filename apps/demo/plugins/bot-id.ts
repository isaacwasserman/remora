import { initBotId } from "botid/client/core";
import { checkBotId } from "botid/server";
import { definePlugin } from "nitro";

export default definePlugin((nitroApp) => {
  initBotId({
    protect: [
      {
        path: "/",
        method: "*",
      },
    ],
  });

  nitroApp.hooks.hook("request", async (event) => {
    const verification = await checkBotId();
    if (verification.isBot) {
      event.respondWith(
        Response.json({ error: "Access denied" }, { status: 403 }),
      );
    }
  });
});
