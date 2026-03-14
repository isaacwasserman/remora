import type { WorkflowDefinition } from "@remoraflow/core";
import { executeWorkflow } from "@remoraflow/core";
import type { ToolSet } from "ai";
import { Glob } from "bun";
import { EXAMPLE_TASKS } from "./example-tasks";
import index from "./index.html";

const workflowsDir = new URL("./workflows", import.meta.url).pathname;

// ─── Mock tool delay wrapper ────────────────────────────────────

function wrapToolsWithDelay(tools: ToolSet, delayMs: number): ToolSet {
	const wrapped: ToolSet = {};
	for (const [name, t] of Object.entries(tools)) {
		if (!t.execute) {
			wrapped[name] = t;
			continue;
		}
		const originalExecute = t.execute;
		wrapped[name] = {
			...t,
			execute: async (...args: unknown[]) => {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				return (originalExecute as (...a: unknown[]) => unknown)(...args);
			},
		};
	}
	return wrapped;
}

const EXECUTABLE_WORKFLOWS: Record<string, { tools: ToolSet }> = {
	"order-fulfillment": {
		tools: wrapToolsWithDelay(
			EXAMPLE_TASKS["order-fulfillment"].availableTools,
			600,
		),
	},
};

// ─── Server ─────────────────────────────────────────────────────

Bun.serve({
	routes: {
		"/": index,
		"/api/workflows": async () => {
			const names: string[] = [];
			const glob = new Glob("*.json");
			for await (const file of glob.scan(workflowsDir)) {
				names.push(file.replace(/\.json$/, ""));
			}
			names.sort();
			return Response.json(names);
		},
		"/api/workflows/:name": async (req) => {
			const file = Bun.file(`${workflowsDir}/${req.params.name}.json`);
			if (!(await file.exists())) {
				return new Response("Not found", { status: 404 });
			}
			return new Response(file, {
				headers: { "Content-Type": "application/json" },
			});
		},
		"/api/executable": () => {
			return Response.json(Object.keys(EXECUTABLE_WORKFLOWS));
		},
		"/api/execute/:name": async (req) => {
			const name = req.params.name;
			const config = EXECUTABLE_WORKFLOWS[name];
			if (!config) {
				return new Response("Workflow not executable", { status: 404 });
			}

			const file = Bun.file(`${workflowsDir}/${name}.json`);
			if (!(await file.exists())) {
				return new Response("Workflow not found", { status: 404 });
			}
			const workflow = (await file.json()) as WorkflowDefinition;

			const stream = new ReadableStream({
				async start(controller) {
					const encoder = new TextEncoder();
					const send = (event: string, data: string) => {
						controller.enqueue(
							encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
						);
					};

					await executeWorkflow(workflow, {
						tools: config.tools,
						onStateChange: (state) => {
							send("state", JSON.stringify(state));
						},
					});

					send("done", "{}");
					controller.close();
				},
			});

			return new Response(stream, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				},
			});
		},
	},
	development: {
		hmr: true,
		console: true,
	},
	port: 3000,
});

console.log("Workflow viewer running at http://localhost:3000");
