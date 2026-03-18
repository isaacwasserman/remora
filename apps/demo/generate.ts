import fs from "node:fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { generateWorkflow } from "@remoraflow/core";
import { EXAMPLE_TASKS } from "./example-tasks";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter("anthropic/claude-haiku-4.5");

async function main() {
  for (const [taskName, { availableTools, task }] of Object.entries(
    EXAMPLE_TASKS,
  )) {
    const result = await generateWorkflow({
      model,
      tools: availableTools,
      task,
    });

    if (!result.workflow) {
      console.error(
        `Failed to generate workflow for ${taskName} after ${result.attempts} attempts`,
      );
      for (const d of result.diagnostics) {
        console.error(`  [${d.severity}] ${d.message}`);
      }
      continue;
    }

    console.log(
      `Generated workflow for ${taskName} (${result.attempts} attempt${result.attempts > 1 ? "s" : ""})`,
    );

    const directory = `generated-workflows/${taskName}`;
    await fs.mkdir(directory, { recursive: true });

    await fs.writeFile(
      `${directory}/workflow.json`,
      JSON.stringify(result.workflow, null, 2),
    );
  }
}

await main();
