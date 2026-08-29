import { parseArgs } from "node:util";

const USAGE = `
\x1b[1mUsage:\x1b[0m
  bun apps/cli/src/index.ts <command> [options]

\x1b[1mCommands:\x1b[0m
  validate   Validate a workflow definition against its tools
  execute    Execute a workflow

\x1b[1mOptions:\x1b[0m
  -t, --tools <path>      Path to a .ts file or directory of tool functions (required)
  -w, --workflow <path>    Path to a workflow JSON file (required)
  -i, --interactive        Enable user intervention prompts (execute only)
  -c, --config <path>      Path to config file (default: .remoraflowconfig.json in cwd)
  -h, --help               Show this help message
`;

async function main() {
    const { values, positionals } = parseArgs({
        args: Bun.argv.slice(2),
        options: {
            tools: { type: "string", short: "t" },
            workflow: { type: "string", short: "w" },
            interactive: { type: "boolean", short: "i", default: false },
            config: { type: "string", short: "c" },
            help: { type: "boolean", short: "h", default: false },
        },
        allowPositionals: true,
        strict: true,
    });

    if (values.help || positionals.length === 0) {
        console.log(USAGE);
        process.exit(0);
    }

    const command = positionals[0];

    if (!values.tools) {
        console.error("\x1b[31mError: --tools is required\x1b[0m");
        console.log(USAGE);
        process.exit(1);
    }

    if (!values.workflow) {
        console.error("\x1b[31mError: --workflow is required\x1b[0m");
        console.log(USAGE);
        process.exit(1);
    }

    switch (command) {
        case "validate": {
            const { runValidate } = await import("./commands/validate");
            return runValidate({
                toolsPath: values.tools,
                workflowPath: values.workflow,
                configPath: values.config,
            });
        }
        case "execute": {
            const { runExecute } = await import("./commands/execute");
            return runExecute({
                toolsPath: values.tools,
                workflowPath: values.workflow,
                interactive: values.interactive ?? false,
                configPath: values.config,
            });
        }
        default:
            console.error(`\x1b[31mError: Unknown command "${command}"\x1b[0m`);
            console.log(USAGE);
            process.exit(1);
    }
}

main();
