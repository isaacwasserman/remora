import { $ } from "bun";

await $`rm -rf dist`;

const result = await Bun.build({
    entrypoints: [
        "./src/index.ts",
        "./src/execution/execution-engine/durable-execution/lambda-adapter.ts",
        "./src/execution/execution-engine/durable-execution/inngest-adapter.ts",
        "./src/execution/execution-engine/durable-execution/temporal-adapter.ts",
    ],
    outdir: "./dist",
    format: "esm",
    target: "browser",
    external: [
        "arktype",
        "@ark/json-schema",
        "@standard-schema/spec",
        "jmespath",
        "ai",
        "@ai-sdk/provider-utils",
        "@aws/durable-execution-sdk-js",
        "@temporalio/workflow",
        "inngest",
        "zod",
        "dedent",
        "tokenx",
        "capture-console",
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

try {
	await $`bunx tsc --project tsconfig.build.json`;
	console.log("Declaration emit complete");
} catch {
	console.warn("Declaration emit failed (non-fatal) — declarations need isolatedDeclarations fixes before npm publish");
}
