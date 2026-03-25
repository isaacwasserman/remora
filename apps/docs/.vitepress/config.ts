import { defineConfig } from "vitepress";
import llmstxt, {
  copyOrDownloadAsMarkdownButtons,
} from "vitepress-plugin-llms";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";

export default defineConfig({
  title: "Remora",
  description: "A workflow language for AI agents",
  base: "/",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  ],
  transformHead() {
    const posthogKey = process.env.VITE_PUBLIC_POSTHOG_KEY;
    if (!posthogKey) return [];
    return [
      [
        "script",
        {},
        `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        posthog.init('${posthogKey}',{api_host:'https://us.i.posthog.com', person_profiles: 'identified_only'})`,
      ],
    ];
  },

  markdown: {
    config(md) {
      md.use(tabsMarkdownPlugin);
      md.use(copyOrDownloadAsMarkdownButtons);
    },
  },

  vite: {
    plugins: [llmstxt()],
    server: {
      port: 5173,
      strictPort: true,
    },
  },

  themeConfig: {
    logo: "/remoraflow-logo.svg",
    siteTitle: false,

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
            {
              text: "Workflow Definitions",
              link: "/guide/workflow-definitions",
            },
            { text: "Compilation", link: "/guide/compilation" },
            { text: "Execution", link: "/guide/execution" },
            {
              text: "Policies & Approvals",
              link: "/guide/policies",
            },
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
