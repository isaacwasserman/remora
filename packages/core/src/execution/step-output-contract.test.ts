import { describe, expect, test } from "bun:test";
import { jsonSchemaToType } from "@ark/json-schema";
import { tool } from "ai";
import { type } from "arktype";
import type { JSONSchema7 } from "json-schema";
import type { WorkflowStep } from "../schema";
import { inferJsonSchema } from "../schemistry";
import {
    type AgentConfig,
    type LanguageModel,
    remoraflowSettingsSchema,
    type ToolSet,
} from "../types";
import type { RemoraflowType } from "../validation/types";
import {
    getStepOutputType,
    type TypeScope,
} from "../validation/variable-reference-validation";
import { step, workflow } from "../workflow-fixtures";
import { createExecutionContext } from "./execution-engine/context";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import { stepExecutors } from "./step-executors";
import { createMockModel, testPolicies } from "./test-support";
import type { ExecutionScope } from "./types";
import type { UserInterventionAdapter } from "./user-intervention/types";
import { createUserInverventionContext } from "./user-intervention/types";

/**
 * Every step type has a two-sided output contract: `getStepOutputType` declares
 * the type bound to `steps.<id>` at validation time, and the step's executor
 * writes the actual value to `scope[step.id]` at run time. Nothing in the type
 * system ties those halves together, so they can drift silently — a workflow
 * type-checks against one shape and receives another.
 *
 * These tests run each executor for real and assert the value it binds, then
 * check the declared half as strongly as that step type allows — see
 * {@link ConformanceKind}, which every case must state so the strength of its
 * check is visible rather than implied. The case table is keyed by
 * `WorkflowStep["type"]`, so adding a step type fails to compile until its
 * contract is covered here.
 */

/**
 * How much the declared half of a case's contract is actually checked.
 *
 * - `verified`: the bound value is validated against the declared type, so the
 *   two halves are checked against each other independently.
 * - `structural`: `getStepOutputType` returns the step's own
 *   `params.outputFormat`, and the executor validates the model's output against
 *   that same schema inside `runLanguageModel`. Both halves come from one
 *   object, so conformance holds by construction and re-checking it here would
 *   only re-test the AI SDK and arktype. The case instead pins that identity, so
 *   a declared type derived from anything else fails and has to be verified for
 *   real.
 * - `unconstrained`: the validator declares `true`, which admits every value, so
 *   there is no conformance to check. The case pins that too, so tightening the
 *   validator fails here and forces a real check.
 */
type ConformanceKind = "verified" | "structural" | "unconstrained";

type ContractCaseBase = {
    /** Steps of the workflow; the first is the step under test. */
    steps: [WorkflowStep, ...WorkflowStep[]];
    scope?: ExecutionScope;
    tools?: ToolSet;
    model?: LanguageModel;
    userInterventionAdapter?: UserInterventionAdapter;
    /**
     * The value the step is expected to bind, asserted for every case so a
     * drift that happens to satisfy a loose schema still shows up.
     */
    expectedOutput: unknown;
};

type ContractCase = ContractCaseBase &
    (
        | { conformance: "verified" }
        | { conformance: "unconstrained" }
        /** The single schema object both halves of the contract come from. */
        | { conformance: "structural"; sharedOutputFormat: JSONSchema7 }
    );

const objectFormat: JSONSchema7 = {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
};

/** An intervention adapter that answers every question immediately. */
function autoAnswering(answer: string): UserInterventionAdapter {
    return {
        requestIntervention: async () => {},
        getResponse: async () => ({ answer }),
    };
}

function refusingIntervention(): UserInterventionAdapter {
    return {
        requestIntervention: async () => {},
        getResponse: async () => {
            throw new Error("unexpected intervention");
        },
    };
}

function numberTool(): ToolSet {
    return {
        double: tool({
            description: "doubles a number",
            inputSchema: type({ n: "number" }),
            outputSchema: type({ doubled: "number" }),
            execute: ({ n }) => ({ doubled: n * 2 }),
        }),
    };
}

const CONTRACT_CASES: Record<WorkflowStep["type"], ContractCase> = {
    start: {
        steps: [step("target", { type: "start" })],
        scope: { seed: 1 },
        // `start` binds nothing; a missing key reads as null through JMESPath.
        expectedOutput: undefined,
        conformance: "verified",
    },
    sleep: {
        steps: [
            step("target", {
                type: "sleep",
                params: { durationMs: { type: "literal", value: 0 } },
            }),
        ],
        expectedOutput: undefined,
        conformance: "verified",
    },
    end: {
        steps: [
            step("target", {
                type: "end",
                params: {
                    output: { type: "jmespath", expression: "seed.count" },
                },
            }),
        ],
        scope: { seed: { count: 7 } },
        expectedOutput: 7,
        conformance: "verified",
    },
    "tool-call": {
        steps: [
            step("target", {
                type: "tool-call",
                params: {
                    toolName: "double",
                    toolInput: { n: { type: "jmespath", expression: "seed" } },
                },
            }),
        ],
        scope: { seed: 21 },
        tools: numberTool(),
        expectedOutput: { doubled: 42 },
        conformance: "verified",
    },
    "request-intervention": {
        steps: [
            step("target", {
                type: "request-intervention",
                params: {
                    type: "multiple-choice",
                    question: { type: "literal", value: "Ship it?" },
                    choices: { type: "literal", value: ["yes", "no"] },
                    allowFreeResponse: false,
                },
            }),
        ],
        userInterventionAdapter: autoAnswering("yes"),
        expectedOutput: "yes",
        conformance: "verified",
    },
    "for-each": {
        steps: [
            step("target", {
                type: "for-each",
                params: {
                    target: { type: "literal", value: [1, 2, 3] },
                    itemName: "item",
                    loopBodyStepId: "body",
                },
            }),
            step("body", {
                type: "end",
                params: { output: { type: "jmespath", expression: "item" } },
            }),
        ],
        expectedOutput: [1, 2, 3],
        conformance: "verified",
    },
    "switch-case": {
        steps: [
            step("target", {
                type: "switch-case",
                params: {
                    switchOn: { type: "literal", value: "a" },
                    cases: [
                        {
                            value: { type: "default" },
                            branchBodyStepId: "body",
                        },
                    ],
                },
            }),
            step("body", { type: "start" }),
        ],
        // `switch-case` merges the branch scope but binds nothing under its own id.
        expectedOutput: undefined,
        conformance: "verified",
    },
    "wait-for-condition": {
        steps: [
            step("target", {
                type: "wait-for-condition",
                params: {
                    conditionStepId: "probe",
                    condition: { type: "jmespath", expression: "probe" },
                    intervalMs: { type: "literal", value: 0 },
                },
            }),
            step("probe", {
                type: "end",
                params: { output: { type: "literal", value: "ready" } },
            }),
        ],
        expectedOutput: "ready",
        conformance: "unconstrained",
    },
    "llm-prompt": {
        steps: [
            step("target", {
                type: "llm-prompt",
                params: { prompt: "hi", outputFormat: objectFormat },
            }),
        ],
        model: createMockModel([{ answer: "from-llm" }]),
        expectedOutput: { answer: "from-llm" },
        conformance: "structural",
        sharedOutputFormat: objectFormat,
    },
    "extract-data": {
        steps: [
            step("target", {
                type: "extract-data",
                params: {
                    sourceData: { type: "literal", value: "answer is 4" },
                    outputFormat: objectFormat,
                },
            }),
        ],
        model: createMockModel([{ answer: "4" }]),
        expectedOutput: { answer: "4" },
        conformance: "structural",
        sharedOutputFormat: objectFormat,
    },
    "agent-loop": {
        steps: [
            step("target", {
                type: "agent-loop",
                params: {
                    instructions: "do it",
                    tools: [],
                    outputFormat: objectFormat,
                },
            }),
        ],
        model: createMockModel([{ answer: "from-agent" }]),
        expectedOutput: { answer: "from-agent" },
        conformance: "structural",
        sharedOutputFormat: objectFormat,
    },
};

/**
 * A type scope mirroring `runtimeScope`, so the declared type of any expression
 * over it is derived from the same values the executor actually sees. The extra
 * root parent is required because `scopeToJsonSchema` stops at the rootmost
 * scope.
 */
function typeScopeFor(runtimeScope: ExecutionScope): TypeScope {
    return {
        parent: { parent: null, bindings: new Map() },
        bindings: new Map(
            Object.entries(runtimeScope).map(([name, value]) => [
                name,
                inferJsonSchema(value),
            ]),
        ),
    };
}

/** Runs a case's step under test and returns the scope it produced. */
async function runCase(contractCase: ContractCase): Promise<ExecutionScope> {
    const [stepUnderTest] = contractCase.steps;
    const workflowDefinition = workflow(...contractCase.steps);
    const agentConfig: AgentConfig = {
        model: contractCase.model ?? createMockModel([]),
        tools: contractCase.tools ?? {},
    };

    const executor = stepExecutors[
        stepUnderTest.type
    ] as (typeof stepExecutors)[keyof typeof stepExecutors];

    let latestScope: ExecutionScope | null = null;
    for await (const update of executor.execute({
        uniqueStepIdPath: [stepUnderTest.id],
        step: stepUnderTest as never,
        scope: contractCase.scope ?? {},
        workflowDefinition,
        tools: agentConfig.tools,
        model: agentConfig.model,
        settings: remoraflowSettingsSchema.assert({}),
        approvalPolicies: [],
        executionContext: createExecutionContext(
            createInMemoryExecutionEngine().createRun(),
            testPolicies(),
        ),
        userInterventionContext: createUserInverventionContext(
            contractCase.userInterventionAdapter ?? refusingIntervention(),
        ),
    })) {
        if (update.error) {
            throw new Error(
                `${stepUnderTest.type} executor errored: ${update.error.code} — ${update.error.message}`,
            );
        }
        latestScope = update.scope;
    }
    if (!latestScope) {
        throw new Error(`${stepUnderTest.type} executor yielded no scope`);
    }
    return latestScope;
}

/**
 * Validates `value` against a declared `RemoraflowType`. An unconstrained `true`
 * counts as an error: it admits anything, so a case claiming to verify its
 * contract against it verifies nothing.
 */
function conformanceError(
    declared: RemoraflowType,
    value: unknown,
): string | null {
    if (declared === true) {
        return "declared type is `true`, which admits any value — this case is not a verified contract";
    }
    if (declared === false) return "schema `false` admits no value";
    const validator = jsonSchemaToType(
        declared as Parameters<typeof jsonSchemaToType>[0],
    );
    const result = validator(value);
    return result instanceof type.errors ? result.summary : null;
}

const CONFORMANCE_TITLES: Record<ConformanceKind, string> = {
    verified: "binds a value matching its declared output type",
    structural:
        "binds the value described by the `outputFormat` it also declares",
    unconstrained: "binds a value and declares no constraint on it",
};

describe("step output contract (declared type vs. bound value)", () => {
    for (const [stepType, contractCase] of Object.entries(CONTRACT_CASES)) {
        test(`${stepType} ${CONFORMANCE_TITLES[contractCase.conformance]}`, async () => {
            const [stepUnderTest] = contractCase.steps;
            const scope = contractCase.scope ?? {};

            const declared = getStepOutputType(
                stepUnderTest,
                typeScopeFor(scope),
                contractCase.tools ?? {},
            );

            const resultScope = await runCase(contractCase);
            const bound = resultScope[stepUnderTest.id];

            expect(bound).toEqual(contractCase.expectedOutput);

            if (contractCase.conformance === "unconstrained") {
                expect(
                    declared,
                    `${stepType} is recorded as unconstrained but now declares ${JSON.stringify(declared)}; make this case's conformance "verified"`,
                ).toBe(true);
                return;
            }

            if (contractCase.conformance === "structural") {
                expect(
                    declared,
                    `${stepType} is recorded as declaring the step's own outputFormat, which is why its conformance is structural; it now declares ${JSON.stringify(declared)} instead, so conformance has to be verified independently`,
                ).toBe(contractCase.sharedOutputFormat);
                return;
            }

            // A step that binds nothing is read through JMESPath as null, so
            // that is the value its declared type has to admit.
            const observed = bound === undefined ? null : bound;
            const error = conformanceError(declared, observed);
            expect(
                error,
                `${stepType} declares ${JSON.stringify(declared)} but bound ${JSON.stringify(observed)}: ${error}`,
            ).toBeNull();
        });
    }
});
