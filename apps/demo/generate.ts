import fs from "node:fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { generateWorkflowStream } from "@remoraflow/core";
import { DEMO_TOOLS } from "./server/tools";

const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter("anthropic/claude-haiku-4.5");

async function main() {
    const tasks: Record<string, string> = {
        "pokemon-lookup": "Look up a pokemon by name and get its stats",
    };

    for (const [taskName, task] of Object.entries(tasks)) {
        const stream = generateWorkflowStream({
            taskDescription: task,
            tools: DEMO_TOOLS,
            options: {},
            model,
            maxGenerationSteps: 20,
        });

        let result: Awaited<ReturnType<typeof stream.return>> | undefined;
        for await (const partial of stream) {
            result = partial;
        }

        if (!result) {
            console.error(`Failed to generate workflow for ${taskName}`);
            continue;
        }

        console.log(`Generated workflow for ${taskName}`);

        const directory = `generated-workflows/${taskName}`;
        await fs.mkdir(directory, { recursive: true });

        await fs.writeFile(
            `${directory}/workflow.json`,
            JSON.stringify(result, null, 2),
        );
    }
}

await main();
