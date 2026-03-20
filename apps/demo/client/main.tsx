import { initBotId } from "botid/client/core";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { QueryProvider } from "./query-provider";

initBotId({
  protect: [
    {
      path: "/",
      method: "*",
    },
  ],
});

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <QueryProvider>
      <App />
    </QueryProvider>,
  );
}
