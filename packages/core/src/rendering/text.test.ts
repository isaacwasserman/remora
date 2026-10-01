import { describe, expect, test } from "bun:test";
import dedent from "dedent";
import type { JSONSchema7Definition } from "json-schema";
import type { WorkflowDefinition, WorkflowStep } from "../schema";
import { step, workflow } from "../workflow-fixtures";
import {
    describeJsonSchemaType,
    renderWorkflowAsMarkdown,
    renderWorkflowAsText,
} from "./text";

function described(
    id: string,
    description: string,
    body: Parameters<typeof step>[1],
): WorkflowStep {
    return { ...step(id, body), description };
}

describe("renderWorkflowAsText", () => {
    test("explains the input, each step's description and action, and the output", () => {
        const definition: WorkflowDefinition = {
            ...workflow(
                described("start", "Entry point", {
                    type: "start",
                    nextStepId: "fetch_weather",
                }),
                described("fetch_weather", "Get the current weather", {
                    type: "tool-call",
                    params: {
                        toolName: "get-weather",
                        toolInput: {
                            city: {
                                type: "jmespath",
                                expression: "input.city",
                            },
                            days: { type: "literal", value: 1 },
                        },
                    },
                    nextStepId: "pause",
                }),
                described("pause", "", {
                    type: "sleep",
                    params: { durationMs: { type: "literal", value: 90_000 } },
                    nextStepId: "summarize",
                }),
                described("summarize", "Summarize the weather", {
                    type: "llm-prompt",
                    params: {
                        prompt: "Summarize ${fetch_weather}.\nKeep it short.",
                        outputFormat: { type: "string" },
                    },
                    nextStepId: "done",
                }),
                described("done", "Return the temperature", {
                    type: "end",
                    params: {
                        output: {
                            type: "jmespath",
                            expression: "fetch_weather.temp",
                        },
                    },
                }),
            ),
            inputSchema: {
                type: "object",
                properties: {
                    city: { type: "string", description: "City to look up" },
                    units: { enum: ["metric", "imperial"] },
                },
                required: ["city"],
            },
            outputSchema: {
                type: "object",
                properties: { temperature: { type: "number" } },
                required: ["temperature"],
            },
        };

        expect(renderWorkflowAsText(definition)).toBe(dedent`
            1. The workflow starts with an input that has these fields:
                - city (string): City to look up
                - units ("metric" | "imperial", optional)
            2. Get the current weather. It calls the get-weather tool with:
                - city: city from the input
                - days: 1
            3. It waits 1.5 minutes.
            4. Summarize the weather. It asks the LLM:
                    Summarize \${fetch_weather}.
                    Keep it short.
                The answer is of type string.
            5. Return the temperature. The workflow finishes and returns temp from step 2.
                The result has these fields:
                    - temperature (number)
        `);
    });

    test("lists switch cases with the step each one goes to", () => {
        const definition = workflow(
            described("route", "Pick a handler", {
                type: "switch-case",
                params: {
                    switchOn: { type: "jmespath", expression: "input.kind" },
                    cases: [
                        {
                            value: { type: "literal", value: "bug" },
                            branchBodyStepId: "file_bug",
                        },
                        {
                            value: { type: "default" },
                            branchBodyStepId: "ignore",
                        },
                    ],
                },
                nextStepId: "notify",
            }),
            described("file_bug", "File a bug report", {
                type: "tool-call",
                params: {
                    toolName: "file-bug",
                    toolInput: {
                        title: {
                            type: "template",
                            template: "Bug: ${input.title}",
                        },
                    },
                },
                nextStepId: "bug_end",
            }),
            described("bug_end", "", {
                type: "end",
                params: {
                    output: { type: "jmespath", expression: "file_bug.id" },
                },
            }),
            described("ignore", "", { type: "end" }),
            described("notify", "", {
                type: "tool-call",
                params: {
                    toolName: "notify",
                    toolInput: {
                        message: { type: "jmespath", expression: "route" },
                    },
                },
            }),
        );

        expect(renderWorkflowAsText(definition)).toBe(dedent`
            1. Pick a handler. It checks kind from the input:
                a. If it is "bug", go to step 2.
                b. Otherwise, go to step 4.
                2. File a bug report. It calls the file-bug tool with title set to "Bug: \${input.title}".
                3. The branch finishes with id from step 2.
                    Then it continues at step 5.
                4. The branch finishes with no result.
                    Then it continues at step 5.
            5. It calls the notify tool with message set to the result of step 1.
                The workflow is done.
        `);
    });

    test("branches of a final switch finish the workflow", () => {
        const definition = workflow(
            described("route", "", {
                type: "switch-case",
                params: {
                    switchOn: { type: "jmespath", expression: "input.ok" },
                    cases: [
                        {
                            value: { type: "literal", value: true },
                            branchBodyStepId: "yes",
                        },
                    ],
                },
            }),
            described("yes", "", {
                type: "end",
                params: { output: { type: "literal", value: "ok" } },
            }),
        );

        expect(renderWorkflowAsText(definition)).toBe(dedent`
            1. It checks ok from the input:
                a. If it is true, go to step 2.
                2. The workflow finishes and returns "ok".
        `);
    });

    test("explains loops and waits, and where each pass goes next", () => {
        const definition = workflow(
            described("each_user", "Greet every user", {
                type: "for-each",
                params: {
                    target: { type: "jmespath", expression: "input.users" },
                    itemName: "user",
                    loopBodyStepId: "greet",
                },
                nextStepId: "refine",
            }),
            described("greet", "", {
                type: "end",
                params: {
                    output: { type: "template", template: "Hi ${user}" },
                },
            }),
            described("refine", "Grow the draft", {
                type: "while",
                params: {
                    conditionStepId: "should_refine",
                    loopBodyStepId: "draft",
                    accumulatorName: "draft_text",
                    accumulatorInitialValue: { type: "literal", value: "" },
                },
                nextStepId: "wait",
            }),
            described("should_refine", "", {
                type: "end",
                params: {
                    output: {
                        type: "jmespath",
                        expression: "length(draft_text) < `10`",
                    },
                },
            }),
            described("draft", "", {
                type: "end",
                params: { output: { type: "literal", value: "draft" } },
            }),
            described("wait", "Wait for the job", {
                type: "wait-for-condition",
                params: {
                    conditionStepId: "poll",
                    condition: { type: "jmespath", expression: "poll.ready" },
                    maxAttempts: { type: "literal", value: 5 },
                    intervalMs: { type: "literal", value: 2000 },
                    backoffMultiplier: { type: "literal", value: 2 },
                    timeoutMs: {
                        type: "jmespath",
                        expression: "input.timeout",
                    },
                },
            }),
            described("poll", "", {
                type: "tool-call",
                params: { toolName: "check-status" },
            }),
        );

        expect(renderWorkflowAsText(definition)).toBe(dedent`
            1. Greet every user. It goes through each item in users from the input, naming the current item user. For each item, it runs step 2 and collects the results into a list.
                2. This pass finishes with "Hi \${user}".
                    Then it moves on to the next item (back to step 1).
            3. Grow the draft. It repeats step 5 for as long as the check in step 4 gives a true result, and keeps a running value named draft_text. It starts as "", and each pass replaces it with that pass's result.
                4. The check finishes with length(draft_text) < \`10\`.
                    If the result is true, it runs the loop at step 5. If not, the loop is over.
                5. This pass finishes with "draft".
                    Then it goes back to step 4 to check again.
            6. Wait for the job. It waits until ready from step 7 is true. On each try, it runs step 7 and then checks.
                It tries at most 5 times, waits 2 seconds between tries (each wait is 2 times longer than the one before), and gives up after the number of milliseconds in timeout from the input.
                7. It calls the check-status tool.
                    If ready from step 7 is true, the wait is over. If not, it waits and tries again from step 7.
                The workflow is done.
        `);
    });

    test("names the steps that a complex expression uses", () => {
        const definition = workflow(
            described("a", "", {
                type: "tool-call",
                params: { toolName: "one" },
                nextStepId: "b",
            }),
            described("b", "", {
                type: "end",
                params: {
                    output: {
                        type: "jmespath",
                        expression:
                            "length(a.items) > input.min && 'b' == `\"a\"`",
                    },
                },
            }),
        );

        expect(renderWorkflowAsText(definition)).toEndWith(
            "(using the input and step 1).",
        );
    });

    test("refers back to a step that execution reaches a second time", () => {
        const definition = workflow(
            described("route", "", {
                type: "switch-case",
                params: {
                    switchOn: { type: "jmespath", expression: "input.n" },
                    cases: [
                        {
                            value: { type: "literal", value: 1 },
                            branchBodyStepId: "shared",
                        },
                        {
                            value: { type: "literal", value: 2 },
                            branchBodyStepId: "shared",
                        },
                    ],
                },
            }),
            described("shared", "", {
                type: "tool-call",
                params: { toolName: "one" },
                nextStepId: "missing",
            }),
        );

        expect(renderWorkflowAsText(definition)).toBe(dedent`
            1. It checks n from the input:
                a. If it is 1, go to step 2.
                b. If it is 2, go to step 2.
                2. It calls the one tool.
                    Then it goes to a step that does not exist (missing).
        `);
    });

    test("describes the input first when the initial step is not a start step", () => {
        const definition: WorkflowDefinition = {
            ...workflow(described("done", "", { type: "end" })),
            inputSchema: { type: "array", items: { type: "string" } },
        };

        expect(renderWorkflowAsText(definition)).toBe(dedent`
            The workflow input is of type string[].

            1. The workflow finishes with no result.
        `);
    });

    test("lists unreachable steps after the workflow", () => {
        const definition = workflow(
            described("done", "", { type: "end" }),
            described("orphan_tail", "", { type: "end" }),
            described("orphan_head", "Take a break", {
                type: "sleep",
                params: {
                    durationMs: { type: "jmespath", expression: "input.ms" },
                },
                nextStepId: "orphan_tail",
            }),
        );

        expect(renderWorkflowAsText(definition)).toBe(dedent`
            1. The workflow finishes with no result.

            Nothing leads to these steps, so they never run:
            2. Take a break. It waits for the number of milliseconds in ms from the input.
            3. This part finishes with no result.
                This part ends.
        `);
    });
});

describe("renderWorkflowAsMarkdown", () => {
    const definition: WorkflowDefinition = {
        ...workflow(
            described("start", "", { type: "start", nextStepId: "route" }),
            described("route", "Pick a handler", {
                type: "switch-case",
                params: {
                    switchOn: { type: "jmespath", expression: "input.kind" },
                    cases: [
                        {
                            value: { type: "literal", value: "bug" },
                            branchBodyStepId: "triage",
                        },
                        {
                            value: { type: "default" },
                            branchBodyStepId: "ignore",
                        },
                    ],
                },
                nextStepId: "done",
            }),
            described("triage", "Triage the bug", {
                type: "llm-prompt",
                params: {
                    prompt: "Triage ${input.title}.\n\nReply in ```json```.",
                    outputFormat: {
                        type: "object",
                        properties: { severity: { type: "string" } },
                        required: ["severity"],
                    },
                },
            }),
            described("ignore", "", { type: "end" }),
            described("done", "", { type: "end" }),
        ),
        inputSchema: {
            type: "object",
            properties: { kind: { type: "string" } },
        },
    };

    test("uses code spans, fenced prompts, and bullets that keep each step's number", () => {
        expect(renderWorkflowAsMarkdown(definition)).toBe(
            dedent`
                * **1.** The workflow starts with an input that has these fields:

                  - \`kind\` (\`string\`, optional)

                * **2.** Pick a handler. It checks \`kind\` from the input:

                  - a. If it is \`"bug"\`, go to step 3.
                  - b. Otherwise, go to step 4.

                  * **3.** Triage the bug. It asks the LLM:

                    ${"````"}text
                    Triage \${input.title}.

                    Reply in \`\`\`json\`\`\`.
                    ${"````"}

                    The answer has these fields:

                    - \`severity\` (\`string\`)

                    Then it continues at step 5.

                  * **4.** The branch finishes with no result.

                    Then it continues at step 5.

                * **5.** The workflow finishes with no result.
            `,
        );
    });
});

describe("describeJsonSchemaType", () => {
    test.each([
        [undefined, "any"],
        [{}, "any"],
        [{ type: "integer" }, "integer"],
        [{ type: ["string", "null"] }, "string | null"],
        [{ const: "a" }, '"a"'],
        [
            { anyOf: [{ type: "string" }, { type: "number" }] },
            "string | number",
        ],
        [{ type: "array", items: { enum: ["a", "b"] } }, '("a" | "b")[]'],
        [
            {
                type: "object",
                properties: { a: { type: "string" }, b: { type: "number" } },
                required: ["a"],
            },
            "{ a: string, b?: number }",
        ],
        [
            { type: "object", additionalProperties: { type: "boolean" } },
            "Record<string, boolean>",
        ],
        [{ $ref: "#/definitions/User" }, "User"],
    ] satisfies [
        JSONSchema7Definition | undefined,
        string,
    ][])("%j is %s", (schema, expected) => {
        expect(describeJsonSchemaType(schema)).toBe(expected);
    });
});
