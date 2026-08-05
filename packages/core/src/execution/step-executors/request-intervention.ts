import { rethrowIfUnrecoverable } from "../execution-engine/errors";
import { RESERVED_SEGMENT } from "../execution-engine/step-path";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import type { StepExecutor } from "../types";
import { stepIndex } from "./shared";

export const requestInterventionExecutor: StepExecutor<"request-intervention"> =
    {
        stepType: "request-intervention",
        execute: async function* ({
            uniqueStepIdPath,
            step,
            scope,
            executionContext,
            userInterventionContext,
            workflowDefinition,
        }) {
            try {
                const questionText = evaluateExpressionAgainstScope(
                    step.params.question,
                    scope,
                );
                const choicesArray = evaluateExpressionAgainstScope(
                    step.params.choices,
                    scope,
                );
                if (typeof questionText !== "string") {
                    yield {
                        scope,
                        output: null,
                        error: {
                            code: "TYPE_ERROR",
                            path: [
                                "steps",
                                stepIndex(workflowDefinition, step.id),
                                "params",
                                "question",
                            ],
                            message: `Question expression in step "${step.id}" did not resolve to a string.`,
                        },
                    };
                    return;
                }
                if (
                    !Array.isArray(choicesArray) ||
                    !choicesArray.every((item) => typeof item === "string")
                ) {
                    yield {
                        scope,
                        output: null,
                        error: {
                            code: "TYPE_ERROR",
                            path: [
                                "steps",
                                stepIndex(workflowDefinition, step.id),
                                "params",
                                "choices",
                            ],
                            message: `Choices expression in step "${step.id}" did not resolve to an array of strings.`,
                        },
                    };
                    return;
                }
                if (
                    choicesArray.length === 0 &&
                    !step.params.allowFreeResponse
                ) {
                    yield {
                        scope,
                        output: null,
                        error: {
                            code: "TYPE_ERROR",
                            path: [
                                "steps",
                                stepIndex(workflowDefinition, step.id),
                                "params",
                                "choices",
                            ],
                            message: `Choices expression in step "${step.id}" resolved to an empty array, and the step does not allow a free response, so the question would be unanswerable.`,
                        },
                    };
                    return;
                }
                const questionId = await executionContext.step(
                    [...uniqueStepIdPath, RESERVED_SEGMENT, "questionId"],
                    async () => crypto.randomUUID(),
                );

                await executionContext.step(
                    [...uniqueStepIdPath, RESERVED_SEGMENT, "request"],
                    async () => {
                        const requested =
                            await userInterventionContext.requestIntervention({
                                interventionRequestId: questionId,
                                request: {
                                    type: "multiple-choice",
                                    question: questionText,
                                    choices: choicesArray,
                                    allowFreeResponse:
                                        step.params.allowFreeResponse,
                                },
                            });
                        if (requested.error) {
                            throw new Error(
                                `Could not ask the supervising user: ${requested.message}`,
                            );
                        }
                    },
                );

                yield {
                    scope,
                    output: null,
                    error: null,
                    status: "awaiting-input",
                };

                const { answer } = yield* executionContext.waitFor(
                    uniqueStepIdPath,
                    async () => {
                        const received =
                            await userInterventionContext.getResponse(
                                questionId,
                            );
                        if (received.error) {
                            throw new Error(
                                `Could not read the supervising user's answer: ${received.message}`,
                            );
                        }
                        return received.data;
                    },
                );
                yield {
                    scope: { ...scope, [step.id]: answer },
                    output: null,
                    error: null,
                };
            } catch (e) {
                rethrowIfUnrecoverable(e);
                const errorMessage = e instanceof Error ? e.message : String(e);
                yield {
                    scope: null,
                    output: null,
                    error: {
                        code: "ASK_SUPERVISOR_ERROR",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `An unknown error occurred while requesting an answer from the user in step "${step.id}": "${errorMessage}".`,
                    },
                };
            }
        },
    };
