import { toJsonSchema } from "@standard-community/standard-json";
import {
    asSchema,
    type DeepPartial,
    type FlexibleSchema,
    generateText,
    hasToolCall,
    jsonSchema,
    stepCountIs,
    tool,
    wrapLanguageModel,
} from "ai";
import { type } from "arktype";
import dedent from "dedent";
import type { JSONSchema7 } from "json-schema";
import type { StandardSchemaV1 } from "..";
import { createAsyncQueue } from "../execution/execution-engine/async-queue";
import {
    createWorkflowDefinitionSchema,
    type WorkflowDefinition,
} from "../schema";
import {
    type LanguageModel,
    type RemoraflowSettings,
    remoraflowSettingsSchema,
    type StubbedToolSet,
} from "../types";
import { validateWorkflowDefinition } from "../validation";
import { requestedOutputSchemaDiagnostics } from "./output-schema";
import {
    findLastSuccessfulToolCall,
    hasSuccessfulToolCall,
} from "./stop-condition";

export type GenerationOptions = RemoraflowSettings & {};

export type GenerationOutput =
    | { gaveUp: true; reason: string; workflowDefinition: null }
    | { gaveUp: false; reason: null; workflowDefinition: WorkflowDefinition };

export type WorkflowGenerationDiagnosticError = {
    name?: string;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
    url?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    reason?: string;
    cause?: WorkflowGenerationDiagnosticError;
    errors?: WorkflowGenerationDiagnosticError[];
};

export type WorkflowGenerationDiagnosticEvent =
    | {
          type: "generation-start";
          atMs: number;
          provider: string;
          modelId: string;
          maxRetries: number;
          timeoutMs?: number;
      }
    | { type: "step-start"; atMs: number; stepNumber: number }
    | {
          type: "provider-attempt-start";
          atMs: number;
          stepNumber: number;
          attempt: number;
      }
    | {
          type: "provider-attempt-end";
          atMs: number;
          stepNumber: number;
          attempt: number;
          durationMs: number;
          finishReason: { unified: string; raw?: string };
          usage: unknown;
          warnings: unknown;
          providerMetadata: unknown;
          response: {
              id?: string;
              modelId?: string;
              headers?: Record<string, string>;
          };
      }
    | {
          type: "provider-attempt-error";
          atMs: number;
          stepNumber: number;
          attempt: number;
          durationMs: number;
          error: WorkflowGenerationDiagnosticError;
      }
    | {
          type: "step-end";
          atMs: number;
          stepNumber: number;
          finishReason: string;
          rawFinishReason?: string;
          performance: unknown;
          invalidToolCalls: Array<{
              toolCallId: string;
              toolName: string;
              input: unknown;
              error: WorkflowGenerationDiagnosticError;
          }>;
      }
    | {
          type: "generation-error";
          atMs: number;
          error: WorkflowGenerationDiagnosticError;
      };

const DIAGNOSTIC_RESPONSE_HEADERS = new Set([
    "cf-ray",
    "date",
    "request-id",
    "retry-after",
    "retry-after-ms",
    "x-generation-id",
    "x-provider-name",
    "x-ratelimit-limit-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-requests",
    "x-ratelimit-reset-tokens",
    "x-request-id",
]);

const MAX_DIAGNOSTIC_TEXT_LENGTH = 2_000;

function truncateDiagnosticText(value: string): string {
    if (value.length <= MAX_DIAGNOSTIC_TEXT_LENGTH) return value;
    return `${value.slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH)}… [truncated ${value.length - MAX_DIAGNOSTIC_TEXT_LENGTH} characters]`;
}

function compactDiagnosticMessage(message: string): string {
    const validationMessageMarker = "\nError message: ";
    const markerIndex = message.lastIndexOf(validationMessageMarker);
    const relevantMessage =
        markerIndex >= 0
            ? message.slice(markerIndex + validationMessageMarker.length)
            : message;
    return truncateDiagnosticText(relevantMessage.replace(/^Error:\s*/, ""));
}

function sanitizeDiagnosticHeaders(
    headers: unknown,
): Record<string, string> | undefined {
    if (typeof headers !== "object" || headers === null) return undefined;

    const sanitizedHeaders = Object.fromEntries(
        Object.entries(headers).filter(
            ([name, value]) =>
                DIAGNOSTIC_RESPONSE_HEADERS.has(name.toLowerCase()) &&
                typeof value === "string",
        ),
    ) as Record<string, string>;
    return Object.keys(sanitizedHeaders).length > 0
        ? sanitizedHeaders
        : undefined;
}

function serializeDiagnosticError(
    error: unknown,
    depth = 0,
): WorkflowGenerationDiagnosticError {
    if (!(error instanceof Error)) {
        return { message: String(error) };
    }

    const errorWithMetadata = error as Error & {
        statusCode?: unknown;
        isRetryable?: unknown;
        url?: unknown;
        responseHeaders?: unknown;
        responseBody?: unknown;
        reason?: unknown;
        cause?: unknown;
        errors?: unknown;
    };
    const diagnostic: WorkflowGenerationDiagnosticError = {
        name: error.name,
        message: compactDiagnosticMessage(error.message),
    };

    if (typeof errorWithMetadata.statusCode === "number") {
        diagnostic.statusCode = errorWithMetadata.statusCode;
    }
    if (typeof errorWithMetadata.isRetryable === "boolean") {
        diagnostic.isRetryable = errorWithMetadata.isRetryable;
    }
    if (typeof errorWithMetadata.url === "string") {
        diagnostic.url = errorWithMetadata.url;
    }
    const responseHeaders = sanitizeDiagnosticHeaders(
        errorWithMetadata.responseHeaders,
    );
    if (responseHeaders) {
        diagnostic.responseHeaders = responseHeaders;
    }
    if (typeof errorWithMetadata.responseBody === "string") {
        diagnostic.responseBody = truncateDiagnosticText(
            errorWithMetadata.responseBody,
        );
    }
    if (typeof errorWithMetadata.reason === "string") {
        diagnostic.reason = errorWithMetadata.reason;
    }

    if (depth < 3 && errorWithMetadata.cause !== undefined) {
        diagnostic.cause = serializeDiagnosticError(
            errorWithMetadata.cause,
            depth + 1,
        );
    }
    if (depth < 3 && Array.isArray(errorWithMetadata.errors)) {
        diagnostic.errors = errorWithMetadata.errors.map((nestedError) =>
            serializeDiagnosticError(nestedError, depth + 1),
        );
    }

    return diagnostic;
}

function serializeInvalidToolCallError(
    error: unknown,
): WorkflowGenerationDiagnosticError {
    const rootName = error instanceof Error ? error.name : undefined;
    let mostSpecificError = error;
    for (let depth = 0; depth < 4; depth++) {
        if (!(mostSpecificError instanceof Error)) break;
        const cause = (mostSpecificError as Error & { cause?: unknown }).cause;
        if (cause === undefined) break;
        mostSpecificError = cause;
    }

    const serialized = serializeDiagnosticError(mostSpecificError);
    return {
        ...(rootName ? { name: rootName } : {}),
        message: serialized.message,
    };
}

export function preparePrompt({
    taskDescription,
    workflowOutputSchema,
    tools,
    options,
}: {
    taskDescription: string;
    workflowOutputSchema?: StandardSchemaV1;
    tools: StubbedToolSet;
    options: GenerationOptions;
}) {
    const { workflowDefinitionArktypeSchema } =
        createWorkflowDefinitionSchema(options);

    const instructions = dedent`
        You are a workflow generation subagent. You generate workflows from a task description and a set of predefined tools. Workflows are written using a proprietary "Remoraflow" JSON definition.

        Notes:
        - Workflows undergo a validation step after submission. If your workflow fails this validation, remediate and resubmit.
    `;

    const prompt = dedent`
        You have the following tools at your disposal:

        <AvailableTools>
        ${Object.entries(tools)
            .map(
                ([toolName, tool]) => dedent`
                    <Tool>
                        <ToolName>${toolName}</ToolName>
                        <ToolDescription>
                            ${typeof tool.description === "string" ? tool.description : "No static description provided."}
                        </ToolDescription>
                        <ToolInputSchema>
                            ${JSON.stringify(asSchema(tool.inputSchema as FlexibleSchema).jsonSchema)}
                        </ToolInputSchema>
                        <ToolOutputSchema>
                            ${tool.outputSchema ? JSON.stringify(asSchema(tool.outputSchema as FlexibleSchema).jsonSchema) : "{}"}
                        </ToolOutputSchema>
                    </Tool>
                `,
            )
            .join("\n\n")}
        </AvailableTools>

        Generate a workflow based on the following task description:

        <TaskDescription>
        ${taskDescription}
        </TaskDescription>

        ${
            workflowOutputSchema
                ? dedent`
                    The generated workflow must declare and produce output matching this JSON Schema:
                    <RequiredWorkflowOutputSchema>
                        ${JSON.stringify(toJsonSchema(workflowOutputSchema))}
                    </RequiredWorkflowOutputSchema>
                `
                : ""
        }
    `;

    return {
        instructions,
        prompt,
        workflowDefinitionArktypeSchema,
    };
}

export async function* generateWorkflowStream({
    taskDescription,
    workflowOutputSchema,
    tools,
    options,
    model,
    maxGenerationSteps = 20,
    timeoutMs = 5 * 60 * 1000,
    abortSignal,
    onDiagnosticEvent,
}: {
    taskDescription: string;
    workflowOutputSchema?: StandardSchemaV1;
    tools: StubbedToolSet;
    options: GenerationOptions;
    model: LanguageModel;
    maxGenerationSteps: number;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
    onDiagnosticEvent?: (event: WorkflowGenerationDiagnosticEvent) => void;
}): AsyncGenerator<DeepPartial<WorkflowDefinition>, GenerationOutput> {
    const { instructions, prompt, workflowDefinitionArktypeSchema } =
        preparePrompt({
            taskDescription,
            workflowOutputSchema,
            tools,
            options,
        });
    const resolvedOptions = remoraflowSettingsSchema.assert(options);
    const submitWorkflowInputArktypeSchema = type({
        "+": "reject",
        definition: workflowDefinitionArktypeSchema,
        "ignoreWarnings?": [
            "boolean",
            "@",
            "Some workflow definitions will produce warnings during validation. These warnings will cause the workflow to be rejected. You should generally attempt to resolve these warnings, but if they are minor or difficult to fix, you can set this to `true` and the warnings will be ignored while errors will continue to be caught.",
        ],
    });
    const submitWorkflowInputSchema = jsonSchema<{
        definition: WorkflowDefinition;
        ignoreWarnings?: boolean;
    }>(
        submitWorkflowInputArktypeSchema.toJsonSchema({
            target: "draft-07",
            fallback: (ctx) => ctx.base,
        }) as JSONSchema7,
        {
            validate: (value) => {
                const result = submitWorkflowInputArktypeSchema(value);
                return result instanceof type.errors
                    ? { success: false, error: new Error(result.summary) }
                    : { success: true, value: result };
            },
        },
    );

    const yieldQueue = createAsyncQueue<
        | { type: "final-output"; payload: WorkflowDefinition }
        | { type: "intermediate-output"; payload: WorkflowDefinition }
        | { type: "give-up"; payload: string }
        | { type: "error"; payload: string }
    >();
    const generationAbortController = new AbortController();
    const generationAbortSignal = abortSignal
        ? AbortSignal.any([abortSignal, generationAbortController.signal])
        : generationAbortController.signal;
    const acceptedWorkflowDefinitions = new Map<string, WorkflowDefinition>();
    const generationStartedAt = Date.now();
    const providerAttemptsByStep = new Map<number, number>();
    let currentStepNumber = 0;
    const emitDiagnostic = (event: WorkflowGenerationDiagnosticEvent) => {
        try {
            onDiagnosticEvent?.(event);
        } catch {
            // Diagnostic observers must not affect workflow generation.
        }
    };
    const elapsedMs = () => Date.now() - generationStartedAt;
    const diagnosticModel = onDiagnosticEvent
        ? wrapLanguageModel({
              model,
              middleware: {
                  wrapGenerate: async ({ doGenerate }) => {
                      const stepNumber = currentStepNumber;
                      const attempt =
                          (providerAttemptsByStep.get(stepNumber) ?? 0) + 1;
                      providerAttemptsByStep.set(stepNumber, attempt);
                      const attemptStartedAt = Date.now();
                      emitDiagnostic({
                          type: "provider-attempt-start",
                          atMs: elapsedMs(),
                          stepNumber,
                          attempt,
                      });
                      try {
                          const result = await doGenerate();
                          emitDiagnostic({
                              type: "provider-attempt-end",
                              atMs: elapsedMs(),
                              stepNumber,
                              attempt,
                              durationMs: Date.now() - attemptStartedAt,
                              finishReason: {
                                  unified: result.finishReason.unified,
                                  ...(result.finishReason.raw
                                      ? { raw: result.finishReason.raw }
                                      : {}),
                              },
                              usage: result.usage,
                              warnings: result.warnings,
                              providerMetadata: result.providerMetadata,
                              response: {
                                  id: result.response?.id,
                                  modelId: result.response?.modelId,
                                  headers: sanitizeDiagnosticHeaders(
                                      result.response?.headers,
                                  ),
                              },
                          });
                          return result;
                      } catch (error) {
                          emitDiagnostic({
                              type: "provider-attempt-error",
                              atMs: elapsedMs(),
                              stepNumber,
                              attempt,
                              durationMs: Date.now() - attemptStartedAt,
                              error: serializeDiagnosticError(error),
                          });
                          throw error;
                      }
                  },
              },
          })
        : model;

    generateText({
        model: diagnosticModel,
        abortSignal: generationAbortSignal,
        instructions,
        prompt,
        tools: {
            "submit-workflow": tool({
                description: "Submits a candidate workflow for validation",
                strict: true,
                inputSchema: submitWorkflowInputSchema,
                execute: async (
                    { definition, ignoreWarnings },
                    { toolCallId },
                ) => {
                    yieldQueue.push({
                        type: "intermediate-output",
                        payload: definition,
                    });
                    const { isValid, diagnostics, correctedDefinition } =
                        validateWorkflowDefinition(definition, {
                            tools,
                            options: resolvedOptions,
                        });
                    if (
                        !isValid ||
                        (!ignoreWarnings &&
                            diagnostics.some(
                                (diagnostic) =>
                                    diagnostic.severity === "warning",
                            ))
                    ) {
                        throw new Error(
                            `Workflow rejected with the following diagnostics: ${JSON.stringify(diagnostics)}`,
                        );
                    } else if (workflowOutputSchema) {
                        const subsetDiagnostics =
                            requestedOutputSchemaDiagnostics(
                                correctedDefinition.outputSchema,
                                await toJsonSchema(workflowOutputSchema),
                            );
                        if (subsetDiagnostics.length > 0) {
                            throw new Error(
                                `Workflow's output schema must be a valid subset of ${JSON.stringify(workflowOutputSchema)}, but subset validation produced the following diagnostics: ${JSON.stringify(subsetDiagnostics)}`,
                            );
                        }
                    }
                    acceptedWorkflowDefinitions.set(
                        toolCallId,
                        correctedDefinition,
                    );
                    return "Workflow validated successfully.";
                },
            }),
            "give-up": tool({
                description:
                    "Aborts workflow generation. Use this if the requested workflow is simply not possible for you to create for some reason",
                inputSchema: type({
                    reason: "string",
                }),
                execute: () => {
                    return true;
                },
            }),
        },
        timeout: {
            totalMs: timeoutMs,
        },
        onStart: ({ provider, modelId, maxRetries }) => {
            emitDiagnostic({
                type: "generation-start",
                atMs: elapsedMs(),
                provider,
                modelId,
                maxRetries,
                timeoutMs,
            });
        },
        onStepStart: ({ stepNumber }) => {
            currentStepNumber = stepNumber;
            emitDiagnostic({
                type: "step-start",
                atMs: elapsedMs(),
                stepNumber,
            });
        },
        onStepEnd: (step) => {
            emitDiagnostic({
                type: "step-end",
                atMs: elapsedMs(),
                stepNumber: step.stepNumber,
                finishReason: step.finishReason,
                ...(step.rawFinishReason
                    ? { rawFinishReason: step.rawFinishReason }
                    : {}),
                performance: step.performance,
                invalidToolCalls: step.toolCalls
                    .filter((toolCall) => toolCall.invalid)
                    .map((toolCall) => ({
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        input: toolCall.input,
                        error: serializeInvalidToolCallError(toolCall.error),
                    })),
            });
        },
        stopWhen: [
            stepCountIs(maxGenerationSteps),
            hasSuccessfulToolCall("submit-workflow"),
            hasToolCall("give-up"),
        ],
    })
        .then((res) => {
            const successfulSubmission = findLastSuccessfulToolCall(
                "submit-workflow",
                res.steps,
            );
            if (successfulSubmission) {
                const acceptedDefinition = acceptedWorkflowDefinitions.get(
                    successfulSubmission.toolCallId,
                );
                if (!acceptedDefinition) {
                    throw new Error(
                        "A successful workflow submission had no accepted definition.",
                    );
                }
                yieldQueue.push({
                    type: "final-output",
                    payload: acceptedDefinition,
                });
            } else if (hasToolCall("give-up")({ steps: res.steps })) {
                const finalToolCall = res.toolCalls.findLast(
                    (toolCall) => toolCall.toolName === "give-up",
                );
                yieldQueue.push({
                    type: "give-up",
                    payload: (finalToolCall?.input as { reason: string })
                        .reason,
                });
            } else {
                const error = new Error(
                    "Generation ended before a valid workflow could be authored.",
                );
                emitDiagnostic({
                    type: "generation-error",
                    atMs: elapsedMs(),
                    error: serializeDiagnosticError(error),
                });
                yieldQueue.push({
                    type: "error",
                    payload: error.message,
                });
            }
        })
        .catch((error) => {
            emitDiagnostic({
                type: "generation-error",
                atMs: elapsedMs(),
                error: serializeDiagnosticError(error),
            });
            yieldQueue.push({
                type: "error",
                payload: error instanceof Error ? error.message : String(error),
            });
        })
        .finally(() => {
            yieldQueue.close();
        });

    try {
        for await (const item of yieldQueue) {
            switch (item.type) {
                case "intermediate-output": {
                    yield item.payload;
                    break;
                }
                case "final-output": {
                    yield item.payload;
                    return {
                        gaveUp: false,
                        reason: null,
                        workflowDefinition: item.payload,
                    };
                }
                case "give-up": {
                    return {
                        gaveUp: true,
                        reason: item.payload,
                        workflowDefinition: null,
                    };
                }
                case "error": {
                    throw new Error(item.payload);
                }
            }
        }
    } finally {
        generationAbortController.abort();
    }

    throw new Error(
        "Generation ended before a valid workflow could be authored.",
    );
}

export async function generateWorkflow(
    ...args: Parameters<typeof generateWorkflowStream>
): Promise<GenerationOutput> {
    const stream = generateWorkflowStream(...args);
    let result: IteratorResult<
        DeepPartial<WorkflowDefinition>,
        GenerationOutput
    >;
    do {
        result = await stream.next();
    } while (!result.done);
    return result.value;
}
