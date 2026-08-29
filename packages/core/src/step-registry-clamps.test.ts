import { describe, expect, test } from "bun:test";
import { type } from "arktype";
import { resolveDurationLimits } from "./execution/execution-engine/duration-policy";
import { createWorkflowDefinitionSchema } from "./schema";
import {
    type ConstrainedParameter,
    constrainedParameters,
} from "./step-registry";
import { remoraflowSettingsSchema } from "./types";
import { step } from "./workflow-fixtures";

function resolveBound(
    param: ConstrainedParameter,
    options: ReturnType<typeof remoraflowSettingsSchema.assert>,
): number {
    if (param.bound.source === "duration-limits") {
        const limits = resolveDurationLimits(options.duration);
        const val = (limits as Record<string, number | undefined>)[
            param.bound.key
        ];
        if (val === undefined)
            throw new Error(`Unknown duration key: ${param.bound.key}`);
        return val * param.multiplier;
    }
    const val = (options.tokenBudgets as Record<string, number | undefined>)[
        param.bound.key
    ];
    if (val === undefined)
        throw new Error(`Unknown token-budget key: ${param.bound.key}`);
    return val * param.multiplier;
}

type StepBuilder = (value: number) => unknown;

const SLEEP: StepBuilder = (v) =>
    step("st", {
        type: "sleep",
        params: { durationMs: { type: "literal", value: v } },
    });

const WAIT_INTERVAL: StepBuilder = (v) =>
    step("st", {
        type: "wait-for-condition",
        params: {
            conditionStepId: "c0",
            condition: { type: "literal", value: true },
            intervalMs: { type: "literal", value: v },
        },
    });

const WAIT_TIMEOUT: StepBuilder = (v) =>
    step("st", {
        type: "wait-for-condition",
        params: {
            conditionStepId: "c0",
            condition: { type: "literal", value: true },
            intervalMs: { type: "literal", value: 60_000 },
            timeoutMs: { type: "literal", value: v },
        },
    });

const AGENT_MAX_STEPS: StepBuilder = (v) =>
    step("st", {
        type: "agent-loop",
        params: {
            instructions: "do it",
            tools: [],
            outputFormat: { type: "object" },
            maxSteps: { type: "literal", value: v },
        },
    });

function accepts(
    schema: ReturnType<
        typeof createWorkflowDefinitionSchema
    >["workflowStepArktypeSchema"],
    data: unknown,
): boolean {
    const result = schema(data);
    return !(result instanceof type.errors);
}

type ClampCase = {
    label: string;
    stepType: string;
    builder: StepBuilder;
    param: ConstrainedParameter;
};

function buildClampCases(
    options: ReturnType<typeof remoraflowSettingsSchema.assert>,
): ClampCase[] {
    const cases: ClampCase[] = [];
    const byType: Record<string, StepBuilder> = {
        "sleep.params.durationMs": SLEEP,
        "wait-for-condition.params.intervalMs": WAIT_INTERVAL,
        "wait-for-condition.params.timeoutMs": WAIT_TIMEOUT,
        "agent-loop.params.maxSteps": AGENT_MAX_STEPS,
    };
    for (const stepType of [
        "sleep",
        "wait-for-condition",
        "agent-loop",
    ] as const) {
        const params = constrainedParameters({
            type: stepType,
        } as never);
        for (const param of params) {
            const label = `${stepType}.${param.path.join(".")}`;
            const builder = byType[label];
            if (!builder) continue;
            cases.push({ label, stepType, builder, param });
        }
    }
    void options;
    return cases;
}

describe("constrained parameters: schema-baked bound matches the resolved setting bound", () => {
    const options = remoraflowSettingsSchema.assert({});
    const clampCases = buildClampCases(options);

    test.each(
        clampCases.map((c) => [c.label, c] as const),
    )("%s: literal at the bound is accepted", (_label, c) => {
        const bound = resolveBound(c.param, options);
        expect(
            accepts(
                createWorkflowDefinitionSchema(options)
                    .workflowStepArktypeSchema,
                c.builder(bound),
            ),
            `${c.label}: value ${bound} should be accepted`,
        ).toBe(true);
    });

    test.each(
        clampCases.map((c) => [c.label, c] as const),
    )("%s: literal one past the bound is rejected", (_label, c) => {
        const bound = resolveBound(c.param, options);
        const violating = c.param.direction === "max" ? bound + 1 : bound - 1;
        expect(
            accepts(
                createWorkflowDefinitionSchema(options)
                    .workflowStepArktypeSchema,
                c.builder(violating),
            ),
            `${c.label}: value ${violating} should be rejected`,
        ).toBe(false);
    });

    test("a composed duration bound uses the composed value, not the raw policy", () => {
        const opts = remoraflowSettingsSchema.assert({
            duration: { maxDurationSeconds: 10, maxWaitSeconds: 100 },
        });
        const limits = resolveDurationLimits(opts.duration);
        const schema = createWorkflowDefinitionSchema(opts);
        const composedMaxSleepMs = limits.maxSleepSeconds * 1000;
        const rawMaxSleepMs = opts.duration.maxSleepSeconds * 1000;

        expect(rawMaxSleepMs).toBeGreaterThan(composedMaxSleepMs);

        expect(
            accepts(
                schema.workflowStepArktypeSchema,
                SLEEP(composedMaxSleepMs),
            ),
        ).toBe(true);
        expect(
            accepts(
                schema.workflowStepArktypeSchema,
                SLEEP(composedMaxSleepMs + 1),
            ),
        ).toBe(false);
    });
});
