import type { EnhanceAppContext } from "vitepress";
import Theme from "vitepress/theme";
import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import "./custom.css";

export default {
  ...Theme,
  enhanceApp({ app }: EnhanceAppContext) {
    enhanceAppWithTabs(app);
  },
};
