import { describe, expect, test } from "bun:test";
import type { ExecutionError } from "./execution/types";
import {
    isStepTypeAllowed,
    type StepExecutorMap,
    stepExecutors,
} from "./step-registry";
import { STEP_TYPES, type StepType } from "./step-types";
import { remoraflowSettingsSchema } from "./types";

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

    test("feature flags: only agent-loop and request-intervention are feature-gated", () => {
        const defaults = remoraflowSettingsSchema.assert({});
        for (const stepType of STEP_TYPES) {
            if (stepType === "agent-loop") {
                expect(
                    isStepTypeAllowed(stepType, defaults.features),
                    `"agent-loop" should be allowed by default`,
                ).toBe(true);
                expect(
                    isStepTypeAllowed(stepType, {
                        ...defaults.features,
                        allowAgentLoops: false,
                    }),
                    `"agent-loop" should be disallowed when allowAgentLoops=false`,
                ).toBe(false);
            } else if (stepType === "request-intervention") {
                expect(
                    isStepTypeAllowed(stepType, defaults.features),
                    `"request-intervention" should be disallowed by default`,
                ).toBe(false);
                expect(
                    isStepTypeAllowed(stepType, {
                        ...defaults.features,
                        allowUserIntervention: true,
                    }),
                    `"request-intervention" should be allowed when allowUserIntervention=true`,
                ).toBe(true);
            } else {
                expect(
                    isStepTypeAllowed(stepType, defaults.features),
                    `"${stepType}" should always be allowed`,
                ).toBe(true);
            }
        }
    });
});
