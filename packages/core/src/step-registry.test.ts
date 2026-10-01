import { describe, expect, test } from "bun:test";
import { type } from "arktype";
import type { ExecutionError } from "./execution/types";
import { createWorkflowDefinitionSchema } from "./schema";
import {
    isStepTypeAllowed,
    type StepExecutorMap,
    stepExecutors,
} from "./step-registry";
import { STEP_TYPES, type StepType } from "./step-types";
import { remoraflowSettingsSchema } from "./types";
import { step } from "./workflow-fixtures";

const ERROR_CODES: ReadonlySet<string> = new Set<ExecutionError["code"]>([
    "INVALID_WORKFLOW",
    "UNRECOGNIZED_CASE",
    "MISSING_TOOL",
    "MISSING_TOOL_EXECUTION_FUNCTION",
    "TOOL_ERROR",
    "AGENT_RUN_FAILED",
    "LLM_RUN_FAILED",
    "DATA_EXTRACTION_RUN_FAILED",
    "WAIT_FOR_CONDITION_FAILED",
    "ASK_SUPERVISOR_ERROR",
    "DURATION_LIMIT_EXCEEDED",
    "LOOP_ITERATION_LIMIT_EXCEEDED",
    "TYPE_ERROR",
    "POLICY_DENIED",
    "UNKNOWN",
]);

/**
 * The structural guard. Adding a new step type to `STEP_TYPES` triggers
 * compile-time errors across every `Record<StepType, …>` map (stepExecutors,
 * nestedChains, toolReferences, expressionReferences, blockScopeProcessors,
 * etc., plus the validator dispatch tables). This test catches the parts types
 * cannot check: mistyped error codes, stale STEP_TYPES lists, and wrong
 * feature-flag associations.
 */
describe("step registry structural guard", () => {
    test("STEP_TYPES has no duplicates", () => {
        const seen = new Set<StepType>();
        for (const t of STEP_TYPES) {
            expect(seen.has(t), `STEP_TYPES contains duplicate "${t}"`).toBe(
                false,
            );
            seen.add(t);
        }
    });

    test("every step type in STEP_TYPES has an executor with matching stepType", () => {
        for (const stepType of STEP_TYPES) {
            const executor = (stepExecutors as StepExecutorMap)[stepType];
            expect(executor, `No executor for "${stepType}"`).toBeDefined();
            expect(
                executor.stepType,
                `Executor for "${stepType}" claims stepType "${executor.stepType}"`,
            ).toBe(stepType);
        }
    });

    test("every executor's errorCode is a valid ExecutionError code", () => {
        for (const stepType of STEP_TYPES) {
            const executor = (stepExecutors as StepExecutorMap)[stepType];
            expect(
                ERROR_CODES.has(executor.errorCode),
                `Executor for "${stepType}" has errorCode "${executor.errorCode}" not in ExecutionError["code"]`,
            ).toBe(true);
        }
    });

    test("no executor is registered for a type not in STEP_TYPES", () => {
        const expectedKeys = new Set(STEP_TYPES as readonly string[]);
        for (const key of Object.keys(stepExecutors)) {
            expect(
                expectedKeys.has(key),
                `stepExecutors has key "${key}" not in STEP_TYPES`,
            ).toBe(true);
        }
    });

    test("feature flags gate step types", () => {
        const defaults = remoraflowSettingsSchema.assert({}).features;
        const llmStepTypes = new Set([
            "agent-loop",
            "llm-prompt",
            "extract-data",
        ]);
        for (const stepType of STEP_TYPES) {
            expect(
                isStepTypeAllowed(stepType, defaults),
                `"${stepType}" default`,
            ).toBe(stepType !== "request-intervention");
            expect(
                isStepTypeAllowed(stepType, {
                    ...defaults,
                    allowLlmUse: false,
                }),
                `"${stepType}" when allowLlmUse=false`,
            ).toBe(
                !llmStepTypes.has(stepType) &&
                    stepType !== "request-intervention",
            );
            expect(
                isStepTypeAllowed(stepType, {
                    ...defaults,
                    allowAgentLoops: false,
                }),
                `"${stepType}" when allowAgentLoops=false`,
            ).toBe(
                stepType !== "agent-loop" &&
                    stepType !== "request-intervention",
            );
            expect(
                isStepTypeAllowed(stepType, {
                    ...defaults,
                    allowUserIntervention: true,
                }),
                `"${stepType}" when allowUserIntervention=true`,
            ).toBe(true);
        }
    });

    test("schema excludes LLM step types when allowLlmUse=false", () => {
        const llmSteps = [
            step("agent", {
                type: "agent-loop",
                params: {
                    instructions: "do it",
                    tools: [],
                    outputFormat: { type: "object" },
                },
            }),
            step("prompt", {
                type: "llm-prompt",
                params: { prompt: "hi", outputFormat: { type: "object" } },
            }),
            step("extract", {
                type: "extract-data",
                params: {
                    sourceData: { type: "literal", value: "text" },
                    outputFormat: { type: "object" },
                },
            }),
        ];
        const enabled =
            createWorkflowDefinitionSchema().workflowStepArktypeSchema;
        const disabled = createWorkflowDefinitionSchema({
            features: { allowLlmUse: false, allowAgentLoops: true },
        }).workflowStepArktypeSchema;
        for (const s of llmSteps) {
            expect(enabled(s) instanceof type.errors, s.type).toBe(false);
            expect(disabled(s) instanceof type.errors, s.type).toBe(true);
        }
    });

    test("allowLlmUse=false overrides allowAgentLoops=true", () => {
        const defaults = remoraflowSettingsSchema.assert({}).features;
        expect(
            isStepTypeAllowed("agent-loop", {
                ...defaults,
                allowLlmUse: false,
                allowAgentLoops: true,
            }),
        ).toBe(false);
    });
});
