import { createOpenAI } from "@ai-sdk/openai";
import { os } from "@orpc/server";
import { executeWorkflowStream, generateWorkflow } from "@remoraflow/core";
import { z } from "zod";
import { DEMO_TOOLS } from "../client/tools";

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

    yield* executeWorkflowStream(workflow, {
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
    const model = createModel(apiKey, modelId);
    const result = await generateWorkflow({
      model,
      tools: DEMO_TOOLS,
      task,
      maxRetries,
    });
    return result;
  });

export const router = {
  workflow: {
    execute: executeProc,
    generate: generateProc,
  },
};
