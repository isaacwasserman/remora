import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.document) {
    GlobalRegistrator.register();
}

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { EditContext } from "../edit-context";
import { NodeShell } from "./node-shell";

describe("NodeShell", () => {
    afterEach(cleanup);

    test("shows a source handle for a disconnected node while editing", () => {
        const { container } = render(
            <ReactFlowProvider>
                <EditContext.Provider
                    value={{
                        isEditing: true,
                        onDeleteStep: () => {},
                        onDisconnectStep: () => {},
                        onSelectStepForEditing: () => {},
                        availableToolNames: [],
                        allStepIds: [],
                    }}
                >
                    <NodeShell
                        id="tool_call_3"
                        name="Tool Call"
                        typeLabel="Tool Call"
                        toneColor="#2563eb"
                        accent="#2563eb"
                        description="Call a tool"
                        diagnostics={[]}
                    />
                </EditContext.Provider>
            </ReactFlowProvider>,
        );

        expect(
            container.querySelector(".react-flow__handle.source"),
        ).not.toBeNull();
    });
});
