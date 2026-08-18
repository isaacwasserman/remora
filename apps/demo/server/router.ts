import { createOpenAI } from "@ai-sdk/openai";
import { ORPCError } from "@orpc/client";
import { os } from "@orpc/server";
import {
    executeWorkflowStream,
    extractToolSchemas,
    generateWorkflowStream,
    type StubbedToolSet,
    type ToolSet,
    validateWorkflowDefinition,
} from "@remoraflow/core";
import { z } from "zod";
import { logger } from "./logger";
import { DEMO_TOOL_DISPLAY_NAMES, DEMO_TOOLS } from "./tools";

function createModel(apiKey: string, modelId: string) {
    const openrouter = createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
    });
    return openrouter.chat(modelId);
}

const executeProc = os
    .input(
        z.object({
            workflow: z.any(),
            inputs: z.record(z.unknown()).default({}),
            apiKey: z.string().optional(),
            modelId: z.string().default("anthropic/claude-haiku-4.5"),
        }),
    )
    .handler(async function* ({ input }) {
        const { workflow, inputs, apiKey, modelId } = input;

        const { isValid, diagnostics, correctedDefinition } =
            validateWorkflowDefinition(workflow, { tools: DEMO_TOOLS as unknown as StubbedToolSet });

        const errors = diagnostics.filter((d) => d.severity === "error");
        if (!isValid) {
            logger.warn(
                {
                    errorCount: errors.length,
                    errors: errors.map((e) => e.message),
                },
                "workflow validation failed",
            );
            throw new ORPCError("BAD_REQUEST", {
                message: `Invalid workflow: ${errors.map((e) => e.message).join("; ")}`,
            });
        }

        logger.info(
            { modelId, hasApiKey: !!apiKey, inputKeys: Object.keys(inputs) },
            "workflow execution started",
        );

        yield* executeWorkflowStream({
            workflowDefinition: correctedDefinition,
            tools: DEMO_TOOLS as unknown as ToolSet,
            model: createModel(apiKey ?? "", modelId),
            input: inputs,
        });
    });

const generateProc = os
    .input(
        z.object({
            task: z.string(),
            apiKey: z.string(),
            modelId: z.string().default("anthropic/claude-haiku-4.5"),
        }),
    )
    .handler(async function* ({ input }) {
        const { task, apiKey, modelId } = input;
        logger.info({ modelId }, "workflow generation started");

        const model = createModel(apiKey, modelId);
        const result = yield* generateWorkflowStream({
            taskDescription: task,
            tools: DEMO_TOOLS as unknown as StubbedToolSet,
            options: {},
            model,
            maxGenerationSteps: 20,
        });

        logger.info("workflow generation completed");
        return result;
    });

const listToolsProc = os.handler(async () => {
    const schemas = await extractToolSchemas(DEMO_TOOLS as unknown as ToolSet);
    for (const [name, displayName] of Object.entries(DEMO_TOOL_DISPLAY_NAMES)) {
        const schema = schemas[name];
        if (schema) schema.displayName = displayName;
    }
    return schemas;
});

export const router = {
    workflow: {
        execute: executeProc,
        generate: generateProc,
    },
    tools: {
        list: listToolsProc,
    },
};
