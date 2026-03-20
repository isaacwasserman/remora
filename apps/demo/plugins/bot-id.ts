import { checkBotId } from "botid/server";
import { definePlugin } from "nitro";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("request", async (event) => {
    const verification = await checkBotId();
    if (verification.isBot) {
      event.respondWith(
        Response.json({ error: "Access denied" }, { status: 403 }),
      );
    }
  });
});
