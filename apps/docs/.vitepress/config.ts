import { defineConfig } from "vitepress";
import llmstxt, {
  copyOrDownloadAsMarkdownButtons,
} from "vitepress-plugin-llms";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";

export default defineConfig({
  title: "Remora",
  description: "A workflow DSL for AI agents",
  base: "/remora/",

  markdown: {
    config(md) {
      md.use(tabsMarkdownPlugin);
      md.use(copyOrDownloadAsMarkdownButtons);
    },
  },

  vite: {
    plugins: [llmstxt()],
  },

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/what-is-remora" },
      { text: "API Reference", link: "/api/lib/" },
      { text: "Demo", link: "/demo/", target: "_blank" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "What is Remora?", link: "/guide/what-is-remora" },
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Workflow DSL", link: "/guide/workflow-dsl" },
            { text: "Compilation", link: "/guide/compilation" },
            { text: "Execution", link: "/guide/execution" },
            {
              text: "Execution State",
              link: "/guide/execution-state",
            },
            {
              text: "Component Registry",
              link: "/guide/component-registry",
            },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [{ text: "Overview", link: "/api/lib/" }],
        },
        {
          text: "Functions",
          items: [
            {
              text: "compileWorkflow",
              link: "/api/lib/functions/compileWorkflow",
            },
            {
              text: "executeWorkflow",
              link: "/api/lib/functions/executeWorkflow",
            },
            {
              text: "generateWorkflow",
              link: "/api/lib/functions/generateWorkflow",
            },
            {
              text: "createWorkflowGeneratorTool",
              link: "/api/lib/functions/createWorkflowGeneratorTool",
            },
          ],
        },
        {
          text: "Interfaces",
          collapsed: true,
          items: [
            {
              text: "CompilerResult",
              link: "/api/lib/interfaces/CompilerResult",
            },
            {
              text: "ExecutionResult",
              link: "/api/lib/interfaces/ExecutionResult",
            },
            {
              text: "ExecuteWorkflowOptions",
              link: "/api/lib/interfaces/ExecuteWorkflowOptions",
            },
            {
              text: "ExecutionGraph",
              link: "/api/lib/interfaces/ExecutionGraph",
            },
            {
              text: "Diagnostic",
              link: "/api/lib/interfaces/Diagnostic",
            },
            {
              text: "ConstrainedToolSchema",
              link: "/api/lib/interfaces/ConstrainedToolSchema",
            },
            {
              text: "GenerateWorkflowOptions",
              link: "/api/lib/interfaces/GenerateWorkflowOptions",
            },
            {
              text: "GenerateWorkflowResult",
              link: "/api/lib/interfaces/GenerateWorkflowResult",
            },
          ],
        },
        {
          text: "Error Classes",
          collapsed: true,
          items: [
            {
              text: "StepExecutionError",
              link: "/api/lib/classes/StepExecutionError",
            },
            {
              text: "ConfigurationError",
              link: "/api/lib/classes/ConfigurationError",
            },
            {
              text: "ValidationError",
              link: "/api/lib/classes/ValidationError",
            },
            {
              text: "ExternalServiceError",
              link: "/api/lib/classes/ExternalServiceError",
            },
            {
              text: "ExpressionError",
              link: "/api/lib/classes/ExpressionError",
            },
            {
              text: "OutputQualityError",
              link: "/api/lib/classes/OutputQualityError",
            },
          ],
        },
        {
          text: "Type Aliases",
          collapsed: true,
          items: [
            {
              text: "WorkflowDefinition",
              link: "/api/lib/type-aliases/WorkflowDefinition",
            },
            {
              text: "WorkflowStep",
              link: "/api/lib/type-aliases/WorkflowStep",
            },
            {
              text: "DiagnosticCode",
              link: "/api/lib/type-aliases/DiagnosticCode",
            },
            {
              text: "ErrorCode",
              link: "/api/lib/type-aliases/ErrorCode",
            },
            {
              text: "ErrorCategory",
              link: "/api/lib/type-aliases/ErrorCategory",
            },
          ],
        },
        {
          text: "Viewer",
          items: [
            { text: "Overview", link: "/api/viewer/" },
            {
              text: "WorkflowViewer",
              link: "/api/viewer/functions/WorkflowViewer",
            },
            {
              text: "WorkflowViewerProps",
              link: "/api/viewer/interfaces/WorkflowViewerProps",
            },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/isaacwasserman/remora" },
    ],
  },
});
