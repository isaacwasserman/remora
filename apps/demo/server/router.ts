import { createOpenAI } from "@ai-sdk/openai";
import { os } from "@orpc/server";
import {
  executeWorkflow,
  extractToolSchemas,
  generateWorkflow,
} from "@remoraflow/core";
import { z } from "zod";
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

    // Use a queue to bridge the callback-based onStateChange to an async generator
    type QueueItem = { state: unknown } | { done: true } | { error: unknown };
    const queue: QueueItem[] = [];
    let resolve: (() => void) | null = null;

    function enqueue(item: QueueItem) {
      queue.push(item);
      if (resolve) {
        resolve();
        resolve = null;
      }
    }

    const promise = executeWorkflow(workflow, {
      tools: DEMO_TOOLS,
      model: apiKey ? createModel(apiKey, modelId) : undefined,
      inputs,
      initialState,
      onStateChange: (state) => {
        enqueue({ state: structuredClone(state) });
      },
    });

    promise.then(
      () => enqueue({ done: true }),
      (err) => enqueue({ error: err }),
    );

    while (true) {
      while (queue.length === 0) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }

      const item = queue.shift();
      if (!item) continue;
      if ("done" in item) return;
      if ("error" in item) throw item.error;
      yield item.state;
    }
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
