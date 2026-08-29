# Getting Started

## Generate a Workflow

To generate your first workflow, use the `generateWorkflow` function.

::: code-group

```ts [generate.ts]
import { generateWorkflow } from "@remoraflow/core";
import { tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { type } from "arktype";
import { listDogs, petDog, giveDogTreat } from "dog-api";

// Choose an LLM to author the workflow
const openrouter = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});
const model = provider.chat("deepseek/deepseek-v4-flash-0731");

// Generate workflow
const { workflowDefinition } = await generateWorkflow({
    model,
    // Tell the agent what the workflow should do
    taskDescription: "Pet all of the dogs and give the best one a treat and write a haiku about it.",
    // Tell the agent what the workflow should output (optional)
    workflowOutputSchema: type({
        bestDogName: "string",
        bestDogHaiku: "string"
    }),
    // Tell the agent what tools it can use
    tools: {
        listDogs: tool({
            description: "Retrieves a list of all of the dogs.",
            outputSchema: type({
                dogs: type({
                    name: "string",
                    score: "number"
                }).array()
            }),
            execute: listDogs
        }),
        petDog: tool({
            description: "Pets a dog by name.",
            inputSchema: type({
                name: "string"
            }),
            outputSchema: type({
                success: "boolean"
            }),
            execute: petDog
        }),
        giveDogTreat: tool({
            description: "Gives a dog a treat by name.",
            inputSchema: type({
                name: "string"
            }),
            outputSchema: type({
                success: "boolean"
            }),
            execute: giveDogTreat
        })
    },
    maxGenerationSteps: 10
});

console.log(workflowDefinition);
```

```json [output.json]

{
    "initialStepId": "list_dogs",
    "steps": [
        {
            "id": "list_dogs",
            "name": "List Dogs",
            "description": "Retrieve all available dogs.",
            "type": "start",
            "params": {},
            "nextStepId": "get_dogs"
        },
        {
            "id": "get_dogs",
            "name": "Get Dogs",
            "description": "Call the listDogs tool.",
            "type": "tool-call",
            "params": {
                "toolName": "listDogs"
            },
            "nextStepId": "dog_loop"
        },
        {
            "id": "dog_loop",
            "name": "Loop Over Dogs",
            "description": "Iterate over each dog and pet them, tracking the best one.",
            "type": "for-each",
            "params": {
                "target": {
                    "type": "jmespath",
                    "expression": "get_dogs.dogs"
                },
                "itemName": "dog",
                "accumulatorName": "bestDog",
                "accumulatorInitialValue": {
                    "type": "jmespath",
                    "expression": "get_dogs.dogs[0]"
                },
                "loopBodyStepId": "pet_dog"
            },
            "nextStepId": "give_best_dog_treat"
        },
        {
            "id": "pet_dog",
            "name": "Pet Dog",
            "description": "Pet the current dog.",
            "type": "tool-call",
            "params": {
                "toolName": "petDog",
                "toolInput": {
                    "name": {
                        "type": "jmespath",
                        "expression": "dog.name"
                    }
                }
            },
            "nextStepId": "update_accumulator"
        },
        {
            "id": "update_accumulator",
            "name": "Update Accumulator",
            "description": "Track the dog with the highest score.",
            "type": "end",
            "params": {
                "output": {
                    "type": "jmespath",
                    "expression": "max_by([bestDog, dog], &score)"
                }
            }
        },
        {
            "id": "give_best_dog_treat",
            "name": "Give Best Dog Treat",
            "description": "Gives a treat to the best dog.",
            "type": "tool-call",
            "params": {
                "toolName": "giveDogTreat",
                "toolInput": {
                    "name": {
                        "type": "jmespath",
                        "expression": "dog_loop.name"
                    }
                }
            },
            "nextStepId": "write_haiku"
        },
        {
            "id": "write_haiku",
            "name": "Write Haiku",
            "description": "Writes a haiku about the best dog.",
            "type": "llm-prompt",
            "params": {
                "prompt": "Write a haiku about a dog named ${dog_loop.name}",
                "outputFormat": {
                    "type": "object",
                    "properties": {
                        "haiku": { "type": "string" }
                    },
                    "required": ["haiku"]
                }
            },
            "nextStepId": "end"
        },
        {
            "id": "end",
            "name": "End",
            "description": "Return the best dog's name.",
            "type": "end",
            "params": {
                "output": {
                    "type": "jmespath",
                    "expression": "{\"bestDogName\": dog_loop.name, \"bestDogHaiku\": write_haiku.haiku}"
                }
            }
        }
    ]
}
```

:::

### DIY

`generateWorkflow` is Remoraflow's reference implementation for workflow generation. It provides intelligent diagnostics, retries, and constraints out-of-the-box, but it's not magic. Because the entire Remoraflow language is described by a JSON schema, you can easily build your own workflow generation procedure using tool calling or structured output. Here's a minimal example:

```typescript
import { workflowDefinitionSchema } from "@remoraflow/core"
import { generateText, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

async function myCustomWorkflowGenerator(task: string, tools: ToolSet) {
    const openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
    });

    const model = provider.chat("deepseek/deepseek-v4-flash-0731");

    const result = await generateText({
        model,
        prompt: `Generate a workflow that completes the following task: "${task}". You have access to these tools: ${JSON.stringify(tools)}`,
        output: Output.object({ schema: workflowDefinitionSchema })
    })

    return result.output
}
```

## Validate Your Workflow

Workflows aren't very useful if they don't, you know, work.

Remoraflow provides a validator that statically analyzes your workflow definition to ensure well-formedness, valid syntax, and (drumroll 🥁)...

TYPE SAFETY!

```ts [validate.ts]
import { validateWorkflowDefinition } from "@remoraflow/core"
import { dogEvaluationWorkflow } from "./dog-evaluation"
import { dogToolSet } from "dog-tools";

const { isValid, diagnostics } = validateWorkflowDefinition(dogEvaluationWorkflow, { tools: dogToolSet })

```

In addition to a boolean `isValid`, the `validateWorkflowDefinition` function returns diagnostics that inform you (or your agent) exactly what's wrong with the definition. Diagnostics can be errors or just warnings; while error diagnostics signal that the definition is invalid and will fail at runtime (e.g. invalid step references), warnings identify patterns in the workflow that may reduce reliability (e.g. unchecked indexing).

## Execute Your Workflow

To execute your workflow, pass it to the `executeWorkflow` function along with your tools and language model.

::: code-group

```ts [execute.ts]
import { dogEvaluationWorkflow } from "./dog-evaluation"
import { dogToolSet } from "dog-tools";
import { createOpenAI } from "@ai-sdk/openai";

const openrouter = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});

const model = provider.chat("deepseek/deepseek-v4-flash-0731");

const { output } = await executeWorkflow({
    workflowDefinition: dogEvaluationWorkflow,
    tools: dogToolSet,
    model,
})
```

```json [output.json]
{
    "bestDogName": "Fido",
    "bestDogHaiku": "Fido wags his tail,\nFetching balls across the grass,\nLoyal, happy friend."
}
```

Read more:
- See [Durable Execution](./durable-execution.md) for how to execute long-running workflows in serverless environments.
- See [Human in the Loop](./human-in-the-loop.md) to learn how workflows can request user input mid-execution.

:::