import { createRoot } from "react-dom/client";
import { App } from "./app";
import { QueryProvider } from "./query-provider";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <QueryProvider>
      <App />
    </QueryProvider>,
  );
}
