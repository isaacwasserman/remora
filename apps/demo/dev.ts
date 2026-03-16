import index from "./index.html";

Bun.serve({
	routes: {
		"/": index,
	},
	development: {
		hmr: true,
		console: true,
	},
	port: 3000,
});

console.log("Demo running at http://localhost:3000");
