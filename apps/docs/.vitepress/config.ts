import { defineConfig } from "vitepress";
import {
    groupIconMdPlugin,
    groupIconVitePlugin,
    localIconLoader,
} from "vitepress-plugin-group-icons";
import llmstxt, {
    copyOrDownloadAsMarkdownButtons,
} from "vitepress-plugin-llms";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";

export default defineConfig({
    title: "Remoraflow",
    description: "Workflows by Agents, for Agents",
    base: "/",
    head: [
        ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ],

    markdown: {
        config(md) {
            md.use(tabsMarkdownPlugin);
            md.use(groupIconMdPlugin);
            md.use(copyOrDownloadAsMarkdownButtons);
        },
    },

    vite: {
        plugins: [
            ...llmstxt(),
            groupIconVitePlugin({
                customIcon: {
                    "lambda durable functions": localIconLoader(
                        import.meta.url,
                        "./assets/aws-lambda.svg",
                    ),
                    "temporal.io": localIconLoader(
                        import.meta.url,
                        "./assets/temporal.svg",
                    ),
                    inngest: localIconLoader(
                        import.meta.url,
                        "./assets/inngest.svg",
                    ),
                },
            }),
        ],
        server: {
            port: 4444,
            strictPort: true,
        },
    },

    themeConfig: {
        logo: "/remoraflow-logo.svg",
        siteTitle: false,

        nav: [
            { text: "Guide", link: "/guide/what-is-remoraflow" },
            { text: "Demo", link: "/demo/", target: "_blank" },
        ],

        sidebar: {
            "/guide/": [
                {
                    text: "Guide",
                    items: [
                        {
                            text: "What is Remoraflow?",
                            link: "/guide/what-is-remoraflow",
                        },
                        {
                            text: "Getting Started",
                            link: "/guide/getting-started",
                        },
                        {
                            text: "Type Safety",
                            link: "/guide/type-safety",
                        },
                        {
                            text: "Durable Execution",
                            link: "/guide/durable-execution",
                        },
                    ],
                },
            ],
        },

        socialLinks: [
            {
                icon: "github",
                link: "https://github.com/isaacwasserman/remora",
            },
        ],
    },
});
