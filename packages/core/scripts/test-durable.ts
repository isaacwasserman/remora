const files = [
    "src/execution/execution-engine/durable-execution/lambda-adapter.integration.test.ts",
    "src/execution/execution-engine/durable-execution/inngest-adapter.integration.test.ts",
    "src/execution/execution-engine/durable-execution/temporal-adapter.integration.test.ts",
];

const procs = files.map((f) =>
    Bun.spawn(["bun", "test", f], { stdout: "pipe", stderr: "pipe" }),
);

const results = await Promise.all(
    procs.map(async (proc, i) => {
        const exitCode = await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        return { file: files[i], exitCode, stdout, stderr };
    }),
);

let failed = false;
for (const r of results) {
    process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.exitCode !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
