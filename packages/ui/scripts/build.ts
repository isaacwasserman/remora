import { $ } from "bun";

await $`rm -rf dist`;

const result = await Bun.build({
	entrypoints: ["./src/index.ts"],
	outdir: "./dist",
	format: "esm",
	target: "browser",
	external: [
		"@remoraflow/core",
		"react",
		"react-dom",
		"react/jsx-runtime",
		"@xyflow/react",
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

await $`bunx tsc --project tsconfig.build.json`;
console.log("Declaration emit complete");
