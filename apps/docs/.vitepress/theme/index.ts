import posthog from "posthog-js/dist/module.no-external";
import type { EnhanceAppContext } from "vitepress";
import Theme from "vitepress/theme";
import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
// @ts-expect-error TS2882 — virtual module provided by vitepress-plugin-group-icons at build time
import "virtual:group-icons.css";
// @ts-expect-error TS2882 — CSS is handled by vite, not tsc
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
