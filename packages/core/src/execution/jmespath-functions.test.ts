import { describe, expect, test } from "bun:test";
import type { Expression } from "../schema";
import { JMESPATH_FUNCTION_NAMES } from "../schemistry";
import { validateWorkflowDefinition } from "../validation";
import { step, workflow } from "../workflow-fixtures";
import { executeWorkflowStream } from ".";
import { createDataPresentationResources } from "./data-comprehension";
import { createMockModel } from "./test-support";
import type { ExecutionState } from "./types";

const functionCases: [string, string, unknown][] = [
    ["abs", "abs(`-2`)", 2],
    ["avg", "avg(`[1,3]`)", 2],
    ["ceil", "ceil(`1.2`)", 2],
    ["contains", "contains('abc', 'b')", true],
    ["ends_with", "ends_with('abc', 'bc')", true],
    ["find_first", "find_first('abcabc', 'b')", 1],
    ["find_last", "find_last('abcabc', 'b')", 4],
    ["floor", "floor(`1.8`)", 1],
    ["from_items", 'from_items(`[["a",1],["b",2]]`)', { a: 1, b: 2 }],
    [
        "group_by",
        'group_by(`[{"kind":"a"},{"kind":"b"},{"kind":"a"}]`, &kind)',
        { a: [{ kind: "a" }, { kind: "a" }], b: [{ kind: "b" }] },
    ],
    [
        "items",
        'items(`{"a":1,"b":2}`)',
        [
            ["a", 1],
            ["b", 2],
        ],
    ],
    ["join", 'join(\',\', `["a","b"]`)', "a,b"],
    ["keys", 'keys(`{"a":1}`)', ["a"]],
    ["length", "length('abc')", 3],
    ["lower", "lower('ABC')", "abc"],
    ["map", 'map(&name, `[{"name":"a"},{"name":"b"}]`)', ["a", "b"]],
    ["max", "max(`[1,3,2]`)", 3],
    ["max_by", 'max_by(`[{"n":1},{"n":3}]`, &n)', { n: 3 }],
    ["merge", 'merge(`{"a":1}`, `{"b":2}`)', { a: 1, b: 2 }],
    ["min", "min(`[1,3,2]`)", 1],
    ["min_by", 'min_by(`[{"n":1},{"n":3}]`, &n)', { n: 1 }],
    ["not_null", "not_null(`null`, 'a')", "a"],
    ["pad_left", "pad_left('a', `3`, '_')", "__a"],
    ["pad_right", "pad_right('a', `3`, '_')", "a__"],
    ["replace", "replace('abcabc', 'ab', 'x')", "xcxc"],
    ["reverse", "reverse('abc')", "cba"],
    ["sort", "sort(`[3,1,2]`)", [1, 2, 3]],
    ["sort_by", 'sort_by(`[{"n":3},{"n":1}]`, &n)', [{ n: 1 }, { n: 3 }]],
    ["split", "split('a,b,c', ',')", ["a", "b", "c"]],
    ["starts_with", "starts_with('abc', 'ab')", true],
    ["sum", "sum(`[1,2,3]`)", 6],
    ["to_array", "to_array('a')", ["a"]],
    ["to_number", "to_number('12')", 12],
    ["to_string", "to_string(`12`)", "12"],
    ["trim", "trim(' abc ')", "abc"],
    ["trim_left", "trim_left(' abc ')", "abc "],
    ["trim_right", "trim_right(' abc ')", " abc"],
    ["type", "type(`[]`)", "array"],
    ["upper", "upper('abc')", "ABC"],
    ["values", 'values(`{"a":1}`)', [1]],
    [
        "zip",
        "zip(`[1,2,3]`, `[4,5]`)",
        [
            [1, 4],
            [2, 5],
        ],
    ],
];

async function execute(output: Expression) {
    const workflowDefinition = workflow(
        step("start", { type: "start", nextStepId: "done" }),
        step("done", { type: "end", params: { output } }),
    );
    const validation = validateWorkflowDefinition(workflowDefinition, {
        tools: {},
    });
    expect(validation.isValid).toBe(true);
    expect(validation.diagnostics).toEqual([]);

    let final: ExecutionState | undefined;
    for await (const state of executeWorkflowStream({
        workflowDefinition,
        tools: {},
        model: createMockModel([]),
        executionOptions: { silenceLogs: true },
    })) {
        final = state;
    }
    expect(final?.status).toBe("success");
    return final?.output;
}

describe("JMESPath runtime and validation parity", () => {
    test("covers every advertised runtime function", () => {
        expect(functionCases.map(([name]) => name).sort()).toEqual([
            ...JMESPATH_FUNCTION_NAMES,
        ]);
    });

    test.each(
        functionCases,
    )("%s validates and executes", async (_, expression, expected) => {
        expect(await execute({ type: "jmespath", expression })).toEqual(
            expected,
        );
    });

    const objectExpression = `{${functionCases.map(([name, expression]) => `${name}: ${expression}`).join(", ")}}`;
    const objectResult = Object.fromEntries(
        functionCases.map(([name, , expected]) => [name, expected]),
    );

    test("functions compose inside object fields", async () => {
        expect(
            await execute({ type: "jmespath", expression: objectExpression }),
        ).toEqual(objectResult);
    });

    test("functions compose inside template object inserts", async () => {
        expect(
            await execute({
                type: "template",
                template: `result=\${${objectExpression}}`,
            }),
        ).toBe(`result=${JSON.stringify(objectResult)}`);
    });

    test.each([
        ["split('a,b,c', ',', `1`)", ["a", "b,c"]],
        ["replace('aaa', 'a', 'b', `2`)", "bba"],
        ["find_first('abcabc', 'b', `2`)", 4],
        ["find_last('abcabc', 'b', `0`, `3`)", 1],
        ["find_first('abc', 'z')", null],
        ["trim('__abc__', '_')", "abc"],
        ["pad_left('a', `3`)", "  a"],
        ["pad_right('a', `3`)", "a  "],
        ["`legacy string`", "legacy string"],
    ])("supports optional arguments and legacy literals: %s", async (expression, expected) => {
        expect(await execute({ type: "jmespath", expression })).toEqual(
            expected,
        );
    });

    test("data probes use the same extended runtime", async () => {
        const resources = createDataPresentationResources(
            { name: "ALICE", padding: "large data ".repeat(2000) },
            { maxDataTokens: 32 },
        );
        const probe = resources.tools.probeData;
        expect(probe?.execute).toBeDefined();
        expect(
            await probe?.execute?.(
                { jmespathExpression: "lower(name)" },
                { toolCallId: "probe", messages: [] },
            ),
        ).toBe("alice");
    });
});
