import { createOpenAI } from "@ai-sdk/openai";
import { ORPCError } from "@orpc/client";
import { os } from "@orpc/server";
import {
  compileWorkflow,
  executeWorkflowStream,
  extractToolSchemas,
  generateWorkflow,
} from "@remoraflow/core";
import { z } from "zod";
import { logger } from "./logger";
import { DEMO_TOOLS } from "./tools";

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
      initialState: z.any().optional(),
    }),
  )
  .handler(async function* ({ input }) {
    const { workflow, inputs, apiKey, modelId, initialState } = input;

    const compiled = await compileWorkflow(workflow, { tools: DEMO_TOOLS });
    const errors = compiled.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      logger.warn(
        { errorCount: errors.length, errors: errors.map((e) => e.message) },
        "workflow validation failed",
      );
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid workflow: ${errors.map((e) => e.message).join("; ")}`,
      });
    }
    const validatedWorkflow = compiled.workflow ?? workflow;

    logger.info(
      { modelId, hasApiKey: !!apiKey, inputKeys: Object.keys(inputs) },
      "workflow execution started",
    );

    yield* executeWorkflowStream(validatedWorkflow, {
      tools: DEMO_TOOLS,
      model: apiKey ? createModel(apiKey, modelId) : undefined,
      inputs,
      initialState,
    });
  });

const generateProc = os
  .input(
    z.object({
      task: z.string(),
      apiKey: z.string(),
      modelId: z.string().default("anthropic/claude-haiku-4.5"),
      maxRetries: z.number().default(3),
    }),
  )
  .handler(async ({ input }) => {
    const { task, apiKey, modelId, maxRetries } = input;
    logger.info({ modelId, maxRetries }, "workflow generation started");

    const model = createModel(apiKey, modelId);
    const result = await generateWorkflow({
      model,
      tools: DEMO_TOOLS,
      task,
      maxRetries,
    });

    logger.info("workflow generation completed");
    return result;
  });

const listToolsProc = os.handler(async () => {
  return extractToolSchemas(DEMO_TOOLS);
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
