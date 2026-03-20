import { PostHogProvider } from "@posthog/react";
import { initBotId } from "botid/client/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { QueryProvider } from "./query-provider";

const POSTHOG_OPTIONS = {
  api_host: "/r",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
} as const;

initBotId({
  protect: [
    {
      path: "/*",
      method: "*",
    },
  ],
});

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={POSTHOG_OPTIONS}
      >
        <QueryProvider>
          <App />
        </QueryProvider>
      </PostHogProvider>
    </StrictMode>,
  );
}
