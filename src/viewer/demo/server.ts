import { Glob } from "bun";
import index from "./index.html";

const workflowsDir = new URL("./workflows", import.meta.url).pathname;

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
	},
	development: {
		hmr: true,
		console: true,
	},
	port: 3000,
});

console.log("Workflow viewer running at http://localhost:3000");
