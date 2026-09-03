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
                            text: "Durable Execution",
                            link: "/guide/durable-execution",
                        },
                        {
                            text: "Human-in-the-Loop",
                            link: "/guide/human-in-the-loop",
                        },
                    ],
                },
            ],
        },

        socialLinks: [
            {
                icon: {
                    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 352L288 352L288 288L320 288L320 352zM608 224L608 416L320 416L320 448L192 448L192 416L32 416L32 224L608 224zM192 256L64 256L64 384L128 384L128 288L160 288L160 384L192 384L192 256zM352 256L224 256L224 416L288 416L288 384L352 384L352 256zM576 256L384 256L384 384L448 384L448 288L480 288L480 384L512 384L512 288L544 288L544 384L576 384L576 256z"/></svg>',
                },
                link: "https://www.npmjs.com/package/@remoraflow/core",
            },
            {
                icon: "github",
                link: "https://github.com/isaacwasserman/remora",
            },
        ],
    },
});
