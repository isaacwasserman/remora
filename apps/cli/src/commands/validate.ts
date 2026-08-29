import {
    remoraflowSettingsSchema,
    type ToolSet,
    type ValidatorDiagnostic,
    validateWorkflowDefinition,
    type WorkflowDefinition,
} from "@remoraflow/core";
import { loadConfig } from "../config";
import { loadToolSet } from "../load-tools";

function printDiagnostics(diagnostics: ValidatorDiagnostic[]) {
    for (const d of diagnostics) {
        const color = d.severity === "error" ? "\x1b[31m" : "\x1b[33m";
        const label = d.severity === "error" ? "ERROR" : "WARN ";
        const path = d.path ? ` ${d.path.join(".")}` : "";
        console.log(
            `  ${color}${label}\x1b[0m\x1b[2m${path}\x1b[0m ${d.message}`,
        );
    }
}

export async function runValidate(args: {
    toolsPath: string;
    workflowPath: string;
    configPath?: string;
}) {
    const workflowFile = Bun.file(args.workflowPath);
    if (!(await workflowFile.exists())) {
        console.error(
            `\x1b[31mError: Workflow file not found: ${args.workflowPath}\x1b[0m`,
        );
        process.exit(1);
    }

    let workflowDefinition: WorkflowDefinition;
    try {
        workflowDefinition = await workflowFile.json();
    } catch (e) {
        console.error(
            `\x1b[31mError: Failed to parse workflow file: ${e instanceof Error ? e.message : String(e)}\x1b[0m`,
        );
        process.exit(1);
    }

    let tools: ToolSet;
    try {
        tools = await loadToolSet(args.toolsPath);
    } catch (e) {
        console.error(
            `\x1b[31mError: ${e instanceof Error ? e.message : String(e)}\x1b[0m`,
        );
        process.exit(1);
    }

    const config = await loadConfig(args.configPath);
    const settings = remoraflowSettingsSchema.assert(config?.settings ?? {});

    const { isValid, diagnostics } = validateWorkflowDefinition(
        workflowDefinition,
        { tools, options: settings },
        {
            assertToolsHaveExecutionFunctions: true,
            assertToolsHaveOutputSchemas: false,
        },
    );

    if (diagnostics.length > 0) {
        console.log("");
        printDiagnostics(diagnostics);
        console.log("");
    }

    if (isValid) {
        console.log("\x1b[32mWorkflow is valid.\x1b[0m");
    } else {
        console.log("\x1b[31mWorkflow validation failed.\x1b[0m");
        process.exit(1);
    }
}
