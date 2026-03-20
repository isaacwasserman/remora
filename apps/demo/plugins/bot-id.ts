import { checkBotId } from "botid/server";
import { definePlugin } from "nitro";
import { logger } from "../server/logger";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("request", async (event) => {
    const verification = await checkBotId({
      developmentOptions: { bypass: "ALLOWED" },
    });
    if (verification.isBot) {
      logger.warn("bot request blocked");
      event.respondWith(
        Response.json({ error: "Access denied" }, { status: 403 }),
      );
    }
  });
});
