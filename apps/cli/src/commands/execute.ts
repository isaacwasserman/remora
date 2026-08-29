import {
    type ExecutionOptions,
    executeWorkflowStream,
    type LanguageModel,
    type ToolSet,
    type WorkflowDefinition,
} from "@remoraflow/core";
import { createModelFromConfig, loadConfig } from "../config";
import { createInteractiveAdapter } from "../interactive-adapter";
import { loadToolSet } from "../load-tools";

const LLM_STEP_TYPES = new Set(["llm-prompt", "extract-data", "agent-loop"]);
const MAX_OUTPUT_LENGTH = 500;

function workflowHasLlmSteps(workflow: WorkflowDefinition): boolean {
    return workflow.steps.some((step) => LLM_STEP_TYPES.has(step.type));
}

function collectStepIds(workflow: WorkflowDefinition): Set<string> {
    return new Set(workflow.steps.map((s) => s.id));
}

function truncateOutput(value: unknown): string {
    const json = JSON.stringify(value, null, 2);
    if (json.length <= MAX_OUTPUT_LENGTH) return json;
    return `${json.slice(0, MAX_OUTPUT_LENGTH)}\n... (${json.length} chars)`;
}

export async function runExecute(args: {
    toolsPath: string;
    workflowPath: string;
    interactive: boolean;
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
    const needsModel = workflowHasLlmSteps(workflowDefinition);

    if (needsModel && !config?.model) {
        console.error(
            "\x1b[31mError: This workflow contains LLM steps but no model is configured.\x1b[0m",
        );
        console.error(
            "Create a .remoraflowconfig.json file or pass --config with a model section.",
        );
        process.exit(1);
    }

    let model: LanguageModel | undefined;
    if (config?.model) {
        try {
            model = createModelFromConfig(config.model);
        } catch (e) {
            console.error(
                `\x1b[31mError: ${e instanceof Error ? e.message : String(e)}\x1b[0m`,
            );
            process.exit(1);
        }
    }

    const executionOptions: ExecutionOptions = {
        settings: {
            ...config?.settings,
            features: {
                ...config?.settings?.features,
                ...(args.interactive && { allowUserIntervention: true }),
            },
        },
    };

    if (args.interactive) {
        executionOptions.userInterventionAdapter = createInteractiveAdapter();
    }

    console.log("\x1b[2mStarting workflow execution...\x1b[0m\n");

    const stepIds = collectStepIds(workflowDefinition);

    const stream = executeWorkflowStream({
        workflowDefinition,
        tools,
        model: model as LanguageModel,
        executionOptions,
    });

    let prevScope: Record<string, unknown> = {};

    for await (const state of stream) {
        switch (state.status) {
            case "in-progress": {
                const changedSteps = Object.keys(state.scope).filter(
                    (k) => stepIds.has(k) && state.scope[k] !== prevScope[k],
                );
                prevScope = { ...state.scope };
                for (const stepId of changedSteps) {
                    const output = state.scope[stepId];
                    const outputStr =
                        output != null
                            ? `\x1b[2m${truncateOutput(output)}\x1b[0m`
                            : "";
                    console.log(
                        `\x1b[36m[in-progress]\x1b[0m \x1b[1m${stepId}\x1b[0m${outputStr ? `\n${outputStr}` : ""}`,
                    );
                }
                break;
            }
            case "sleeping":
                console.log("\x1b[36m[sleeping]\x1b[0m waiting...");
                break;
            case "awaiting-condition":
                console.log("\x1b[36m[awaiting-condition]\x1b[0m polling...");
                break;
            case "awaiting-input":
                break;
            case "success":
                console.log("\n\x1b[32m[success]\x1b[0m Workflow completed.");
                if (state.output != null) {
                    console.log("\nOutput:");
                    console.log(JSON.stringify(state.output, null, 2));
                }
                return;
            case "error":
                console.error(
                    `\n\x1b[31m[error]\x1b[0m ${state.error.code}: ${state.error.message}`,
                );
                process.exit(1);
                break;
        }
    }
}
