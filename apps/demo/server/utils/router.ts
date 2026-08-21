import { os } from "@orpc/server";
import {
    auditWorkflow,
    executeWorkflowStream,
    extractToolSchemas,
    generateWorkflowStream,
    validateWorkflowDefinition,
    type WorkflowDefinition,
} from "@remoraflow/core";
import { type } from "arktype";
import {
    createInterventionManager,
    type InterventionManager,
} from "./intervention.ts";
import { createModel, type LLMConfig } from "./llm.ts";
import { DEMO_TOOL_DISPLAY_NAMES, DEMO_TOOLS } from "./tools.ts";

const llmConfigType = type({
    apiKey: "string",
    modelId: "string",
    "baseURL?": "string",
});

export interface AppContext {
    interventionManagers?: Map<string, InterventionManager>;
}

const base = os.$context<AppContext>();

export const router = os.router({
    tools: {
        list: base.handler(async () => {
            const schemas = await extractToolSchemas(DEMO_TOOLS);
            for (const [key, displayName] of Object.entries(
                DEMO_TOOL_DISPLAY_NAMES,
            )) {
                if (schemas[key]) {
                    schemas[key].displayName = displayName;
                }
            }
            return schemas;
        }),
    },

    workflow: {
        validate: base
            .input(type({ workflow: "unknown" }))
            .handler(({ input }) => {
                const { isValid, diagnostics } = validateWorkflowDefinition(
                    input.workflow as WorkflowDefinition,
                    { tools: DEMO_TOOLS },
                    {
                        assertToolsHaveExecutionFunctions: false,
                        assertToolsHaveOutputSchemas: false,
                    },
                );
                return { isValid, diagnostics };
            }),

        audit: base
            .input(type({ workflow: "unknown" }))
            .handler(({ input }) => {
                return auditWorkflow(
                    input.workflow as WorkflowDefinition,
                    DEMO_TOOLS,
                );
            }),

        generate: base
            .input(
                type({
                    description: "string",
                    llmConfig: llmConfigType,
                }),
            )
            .handler(async function* ({ input }) {
                const model = createModel(input.llmConfig as LLMConfig);
                const stream = generateWorkflowStream({
                    taskDescription: input.description,
                    tools: DEMO_TOOLS,
                    options: {},
                    model,
                    maxGenerationSteps: 20,
                });
                for await (const partial of stream) {
                    yield { partial };
                }
                const result = await stream.return(undefined as never);
                yield { result: result.value };
            }),

        execute: base
            .input(
                type({
                    workflow: "unknown",
                    "input?": "unknown",
                    "llmConfig?": llmConfigType,
                    "settings?": "unknown",
                }),
            )
            .handler(async function* ({ input, context }) {
                const executionId = crypto.randomUUID();
                const manager = createInterventionManager();

                context.interventionManagers?.set(executionId, manager);

                const llmConfig = input.llmConfig as LLMConfig | undefined;
                const model = llmConfig
                    ? createModel(llmConfig)
                    : createModel({
                          apiKey: "dummy",
                          modelId: "dummy",
                      });

                try {
                    const stream = executeWorkflowStream({
                        workflowDefinition:
                            input.workflow as WorkflowDefinition,
                        tools: DEMO_TOOLS,
                        model,
                        input: input.input,
                        executionOptions: {
                            userInterventionAdapter: manager.adapter,
                            settings: {
                                features: { allowUserIntervention: true },
                                duration: { minPollIntervalSeconds: 0.5 },
                                ...(typeof input.settings === "object"
                                    ? input.settings
                                    : {}),
                            },
                        },
                    });

                    for await (const state of stream) {
                        const pending = manager.pendingRequest();
                        yield {
                            executionId,
                            state,
                            interventionRequest: pending
                                ? {
                                      requestId: pending.requestId,
                                      question: pending.request.question,
                                      choices: pending.request.choices,
                                      allowFreeResponse:
                                          pending.request.allowFreeResponse,
                                  }
                                : undefined,
                        };
                        if (pending) {
                            manager.clearPending();
                        }
                    }
                } finally {
                    context.interventionManagers?.delete(executionId);
                }
            }),
    },

    intervention: {
        respond: base
            .input(
                type({
                    executionId: "string",
                    requestId: "string",
                    answer: "string",
                }),
            )
            .handler(({ input, context }) => {
                const manager = context.interventionManagers?.get(
                    input.executionId,
                );
                if (!manager) {
                    throw new Error(
                        `No active execution with id ${input.executionId}`,
                    );
                }
                manager.respond(input.requestId, input.answer);
                return { ok: true };
            }),
    },
});

export type AppRouter = typeof router;
