import { $ } from "bun";

await $`rm -rf dist`;

// JS bundles via Bun
const result = await Bun.build({
	entrypoints: ["./src/lib.ts", "./src/viewer/index.ts"],
	outdir: "./dist",
	format: "esm",
	target: "browser",
	external: [
		// Core deps
		"arktype",
		"@jmespath-community/jmespath",
		// AI SDK (peer dep)
		"ai",
		"@ai-sdk/provider-utils",
		// Viewer peer deps
		"react",
		"react-dom",
		"react/jsx-runtime",
		"@xyflow/react",
		// Viewer deps
		"@dagrejs/dagre",
	],
	splitting: true,
	sourcemap: "external",
});

if (!result.success) {
	console.error("Build failed:");
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

console.log(
	"JS build complete:",
	result.outputs.map((o) => o.path),
);

// Type declarations via tsc
await $`bunx tsc --project tsconfig.build.json`;
console.log("Declaration emit complete");
