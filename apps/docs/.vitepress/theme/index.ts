import type { EnhanceAppContext } from "vitepress";
import Theme from "vitepress/theme";
import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import "./custom.css";

export default {
  ...Theme,
  enhanceApp({ app, router }: EnhanceAppContext) {
    enhanceAppWithTabs(app);
    router.onAfterRouteChanged = (to) => {
      if (typeof window !== "undefined" && window.posthog) {
        window.posthog.capture("$pageview", {
          $current_url: window.location.origin + to,
        });
      }
    };
    router.onBeforeRouteChange = (to) => {
      if (to.startsWith("/demo")) {
        window.location.href = to;
        return false;
      }
    };
  },
};
