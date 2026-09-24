import { describe, expect, test } from "bun:test";
import { asSchema, type FlexibleSchema } from "ai";
import {
    createWorkflowDefinitionSchema,
    type WorkflowDefinition,
} from "../schema";
import { validateWorkflowDefinition } from "../validation";
import { step, workflow } from "../workflow-fixtures";
import { WorkflowEditor } from "./workflow-editor";

describe("WorkflowEditor", () => {
    const executionOptions = {
        toolCallId: "call",
        messages: [],
    } as never;

    function createEditor(initialDraft?: WorkflowDefinition) {
        const submitted: unknown[] = [];
        const editor = new WorkflowEditor(
            createWorkflowDefinitionSchema().workflowDefinitionArktypeSchema,
            (draft) =>
                validateWorkflowDefinition(draft as WorkflowDefinition, {
                    tools: {},
                }).diagnostics,
            (draft) => {
                submitted.push(draft);
                return true;
            },
            initialDraft,
        );
        const tools = editor.getTools();
        const run = (name: string, input: unknown) =>
            tools[name]?.execute?.(input as never, executionOptions);
        return { editor, tools, run, submitted };
    }

    const invalidWorkflow: WorkflowDefinition = workflow(
        step("start", { type: "start", nextStepId: "missing" }),
    );

    test("returns only the write, read, and edit tools", () => {
        expect(Object.keys(createEditor().tools)).toEqual([
            "write-workflow",
            "read-workflow",
            "edit-workflow",
        ]);
    });

    test("write returns error diagnostics without throwing", async () => {
        const { editor, run } = createEditor();
        const result = await run("write-workflow", {
            definition: invalidWorkflow,
        });
        expect(result.diagnostics).toMatchObject([
            { severity: "error", path: ["steps", 0, "nextStepId"] },
        ]);
        expect(editor.getDraft()).toEqual(invalidWorkflow);
    });

    test("edit applies a patch and returns new diagnostics", async () => {
        const { editor, run, submitted } = createEditor(invalidWorkflow);
        const result = await run("edit-workflow", {
            operations: [
                {
                    op: "add",
                    path: "/steps/-",
                    value: step("done", { type: "end" }),
                },
                { op: "replace", path: "/steps/0/nextStepId", value: "done" },
            ],
        });
        const fixed = workflow(
            step("start", { type: "start", nextStepId: "done" }),
            step("done", { type: "end" }),
        );
        expect(result).toEqual({
            definition: fixed,
            diagnostics: [],
            submitted: false,
        });
        expect(editor.getDraft()).toEqual(fixed);
        expect(submitted).toEqual([]);
    });

    test("submitIfValid submits a write or an edit", async () => {
        const { run, submitted } = createEditor();
        expect(
            await run("write-workflow", {
                definition: invalidWorkflow,
                submitIfValid: true,
            }),
        ).toMatchObject({ submitted: true });
        expect(
            await run("edit-workflow", {
                operations: [
                    { op: "replace", path: "/steps/0/name", value: "Begin" },
                ],
                submitIfValid: true,
            }),
        ).toMatchObject({ submitted: true });
        expect(submitted).toMatchObject([
            invalidWorkflow,
            { steps: [{ name: "Begin" }] },
        ]);
    });

    test("edit that makes the structure invalid returns diagnostics", async () => {
        const { editor, run } = createEditor(invalidWorkflow);
        const result = await run("edit-workflow", {
            operations: [
                { op: "replace", path: "/steps/0/type", value: "unknown" },
            ],
        });
        expect(result.diagnostics).toMatchObject([
            {
                severity: "error",
                message: expect.stringContaining("steps[0].type must be"),
            },
        ]);
        expect(editor.getDraft()).toMatchObject({
            steps: [{ type: "unknown" }],
        });
    });

    test("failed patch does not change the draft", async () => {
        const { editor, run } = createEditor(invalidWorkflow);
        expect(() =>
            run("edit-workflow", {
                operations: [
                    { op: "remove", path: "/steps/0/nextStepId" },
                    { op: "test", path: "/initialStepId", value: "other" },
                ],
            }),
        ).toThrow(
            'Patch operation 1 ({"op":"test","path":"/initialStepId","value":"other"}) failed with TEST_OPERATION_FAILED.',
        );
        expect(editor.getDraft()).toEqual(invalidWorkflow);
    });

    test("replace adds a field that does not exist yet", async () => {
        const { editor, run } = createEditor(
            workflow(step("start", { type: "start" })),
        );
        await run("edit-workflow", {
            operations: [
                { op: "replace", path: "/steps/0/nextStepId", value: "done" },
            ],
        });
        expect(editor.getDraft()).toMatchObject({
            steps: [{ nextStepId: "done" }],
        });
    });

    test("replace under a missing parent reports the original error", async () => {
        const { editor, run } = createEditor(invalidWorkflow);
        expect(() =>
            run("edit-workflow", {
                operations: [
                    { op: "replace", path: "/steps/0/name", value: "Begin" },
                    { op: "replace", path: "/steps/5/name", value: "x" },
                ],
            }),
        ).toThrow(
            'Patch operation 1 ({"op":"replace","path":"/steps/5/name","value":"x"}) failed with OPERATION_PATH_UNRESOLVABLE.',
        );
        expect(editor.getDraft()).toEqual(invalidWorkflow);
    });

    test("edit input schema accepts only JSON Patch operations", async () => {
        const { tools } = createEditor();
        const validate = (value: unknown) =>
            asSchema(
                tools["edit-workflow"]?.inputSchema as FlexibleSchema,
            ).validate?.(value);

        expect(
            await validate({
                operations: [{ op: "move", from: "/a", path: "/b" }],
            }),
        ).toMatchObject({ success: true });
        expect(
            await validate({
                operations: [{ op: "remove", path: "/a", value: 1 }],
            }),
        ).toMatchObject({ success: false });
        expect(
            await validate({ operations: [{ op: "merge", path: "/a" }] }),
        ).toMatchObject({ success: false });
        expect(await validate({ operations: [] })).toMatchObject({
            success: false,
        });
    });

    test("read returns the full draft or a query result", async () => {
        const { run } = createEditor(invalidWorkflow);
        expect(await run("read-workflow", {})).toEqual(invalidWorkflow);
        expect(
            await run("read-workflow", { jmespathQuery: "steps[*].id" }),
        ).toEqual(["start"]);
    });

    test("read and edit fail before a write", () => {
        const { run } = createEditor();
        expect(() => run("read-workflow", {})).toThrow("write-workflow");
        expect(() =>
            run("edit-workflow", {
                operations: [{ op: "add", path: "/steps/-", value: {} }],
            }),
        ).toThrow("write-workflow");
    });

    test("tool input schemas convert to JSON Schema", async () => {
        for (const tool of Object.values(createEditor().tools)) {
            expect(
                await asSchema(tool.inputSchema as FlexibleSchema).jsonSchema,
            ).toMatchObject({ type: "object", additionalProperties: false });
        }
    });
});
