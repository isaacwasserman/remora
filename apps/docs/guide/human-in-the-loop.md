# Human in the Loop

Automations are only as useful as they are trustworthy. For workflows to be truly useful, they need to be able to take action, but for workflows to safely take action, we often need an extra layer of accountability. That's why human-in-the-loop flows are a first-class citizen in Remoraflow.

## Features

### `request-intervention` Steps

Remoraflow features a built-in `request-intervention` step type that allows user-dependent decisions to be baked in to sensitive workflows. These steps tell the executor to pause execution and reach out to the user with a multiple-choice or free-response question whose answer can be used to determine next steps.

```json [Example Step]
{
    "id": "pet-dog-request",
    "name": "Pet Dog Request",
    "description": "Request permission to pet the dog.",
    "type": "request-intervention",
    "params": {
        "type": "multiple-choice",
        "question": {
            "type": "literal",
            "value": "Hey, can I pet this dog?"
        },
        "choices": {
            "type": "literal",
            "value": [
                "Yes.",
                "No.",
            ]
        },
        "allowFreeResponse": false,
    }
}
```

### Policy-Driven Approval Requests

Approval policies to configure what tools are allowed to run and with which inputs. Policies are defined as functions over the tool's name and input, and are evaluated in the order given.

```ts
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
    executionOptions: {
        approvalPolicies: [
            {
                id: "dog-petting-safety";
                decideFn: (toolName, toolInput) => {
                    if (toolName === "petDog") {
                        const dogName = toolInput.name;
                        if (dogIsFoamingAtMouth(name)) {

                            return {
                                decision: "reject",
                                reason: "Dog has rabies."
                            }
                        }
                    }
                    return {
                        decision: "defer";
                    }
                };
            },
            {
                id: "dog-petting-utility";
                decideFn: (toolName, toolInput) => {
                    if (toolName === "petDog") {
                        const dogName = toolInput.name;
                        if (getDogCuteness(name) > 0.7) {
                            return {
                                decision: "approve"
                            }
                        }
                        else {
                            return {
                                decision: "request",
                                reason: "Dog is less than 70% cute. Is it worth it?"
                            }
                        }
                    }
                    return {
                        decision: "defer";
                    }
                };
            }
        ]
    }
})
```

## Usage

To use Remoraflow's human-in-the-loop features, you'll need to provide the execution function a `UserInterventionAdapter`.

```ts
import { dogEvaluationWorkflow } from "./dog-evaluation"
import { dogToolSet } from "dog-tools";
import { createOpenAI } from "@ai-sdk/openai";

import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const openrouter = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});

const model = provider.chat("deepseek/deepseek-v4-flash-0731");

const responses = Map<string, string>()

const { output } = await executeWorkflow({
    workflowDefinition: dogEvaluationWorkflow,
    tools: dogToolSet,
    model,
    executionOptions: {
        userInterventionAdapter: {
            // Implement the interface using command line prompts
            requestIntervention: async ({ id, prompt }) => {
                const rl = readline.createInterface({ input, output });
                const userAnswer = await rl.question(`${prompt} `);
                rl.close();
                
                responses.set(id, { id, userAnswer });
            },

            getResponse: async (id) => {
                return responses.get(id);
            }
        }
    }
})
```