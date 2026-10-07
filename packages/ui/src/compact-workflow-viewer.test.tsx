import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.document) {
    GlobalRegistrator.register();
}

import { afterEach, describe, expect, mock, test } from "bun:test";
import type {
    ExecutionState,
    ValidatorDiagnostic,
    WorkflowDefinition,
} from "@remoraflow/core";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { CompactWorkflowViewer } from "./compact-workflow-viewer";

const WORKFLOW: WorkflowDefinition = {
    initialStepId: "loop",
    steps: [
        {
            id: "loop",
            name: "Visit each item",
            description: "Loop over items",
            type: "for-each",
            params: {
                target: { type: "jmespath", expression: "input.items" },
                itemName: "item",
                loopBodyStepId: "lookup",
            },
            nextStepId: "finish",
        },
        {
            id: "lookup",
            name: "Look up item",
            description: "Call the lookup tool",
            type: "tool-call",
            params: { toolName: "lookup" },
        },
        {
            id: "finish",
            name: "Finish",
            description: "End the workflow",
            type: "end",
        },
    ],
};

const DIAGNOSTIC: ValidatorDiagnostic = {
    severity: "error",
    message: "Unknown tool.",
    path: ["steps", 1, "params", "toolName"],
};

describe("CompactWorkflowViewer", () => {
    afterEach(cleanup);

    test("nests body steps and unfolds a step's details on click", () => {
        const onStepSelect = mock();
        const { container } = render(
            <CompactWorkflowViewer
                workflow={WORKFLOW}
                diagnostics={[DIAGNOSTIC]}
                onStepSelect={onStepSelect}
            />,
        );
        const loop = container.querySelector('[data-step-id="loop"]');
        const lookup = loop?.querySelector(
            '[data-step-id="lookup"]',
        ) as HTMLElement;
        expect(within(loop as HTMLElement).getByText("Loop body")).toBeTruthy();
        const toggle = within(lookup).getByRole("button", { expanded: false });

        fireEvent.click(toggle);
        expect(onStepSelect).toHaveBeenCalledWith(WORKFLOW.steps[1], [
            DIAGNOSTIC,
        ]);
        expect(within(lookup).getByText("Unknown tool.")).toBeTruthy();

        fireEvent.click(toggle);
        expect(onStepSelect).toHaveBeenLastCalledWith(null, []);
        expect(within(lookup).queryByText("Unknown tool.")).toBeNull();
    });

    test("shows execution status on the steps", () => {
        const executionState = {
            status: "in-progress",
            executionPath: [],
            stepExecutions: [{ stepId: "loop", status: "completed" }],
        } as unknown as ExecutionState;
        const { container } = render(
            <CompactWorkflowViewer
                workflow={WORKFLOW}
                executionState={executionState}
            />,
        );
        const loop = container.querySelector('[data-step-id="loop"] > button');
        expect(
            within(loop as HTMLElement).getByTitle("Completed"),
        ).toBeTruthy();
    });
});
