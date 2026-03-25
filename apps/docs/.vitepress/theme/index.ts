import posthog from "posthog-js";
import type { EnhanceAppContext } from "vitepress";
import Theme from "vitepress/theme";
import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import "./custom.css";

export default {
  ...Theme,
  enhanceApp({ app, router }: EnhanceAppContext) {
    enhanceAppWithTabs(app);

    if (typeof window !== "undefined") {
      const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
      if (posthogKey) {
        posthog.init(posthogKey, {
          api_host: "/r",
          person_profiles: "identified_only",
          capture_pageview: false,
          disable_session_recording: true,
        });
        router.onAfterRouteChanged = (to) => {
          posthog.capture("$pageview", {
            $current_url: window.location.origin + to,
          });
        };
      }
    }

    router.onBeforeRouteChange = (to) => {
      if (to.startsWith("/demo")) {
        window.location.href = to;
        return false;
      }
    };
  },
};
