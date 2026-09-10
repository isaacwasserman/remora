import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.document) {
    GlobalRegistrator.register();
}

import { describe, expect, test } from "bun:test";
import type { ValidatorDiagnostic } from "@remoraflow/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorkflowDiagnostics } from "./workflow-diagnostics";

const WARNING: ValidatorDiagnostic = {
    severity: "warning",
    message: "This may not be reachable.",
};

const ERROR: ValidatorDiagnostic = {
    severity: "error",
    message: "The referenced step does not exist.",
};

describe("WorkflowDiagnostics", () => {
    test("renders nothing when there are no diagnostics", () => {
        const { container } = render(<WorkflowDiagnostics diagnostics={[]} />);

        expect(container.innerHTML).toBe("");
    });

    test("replaces the severity-colored count with a neutral panel that closes on outside click", () => {
        render(<WorkflowDiagnostics diagnostics={[WARNING, ERROR]} />);

        const button = screen.getByRole("button", {
            name: "Show 2 diagnostics",
        });
        expect(button.textContent).toBe("2");
        expect(button.getAttribute("data-severity")).toBe("error");
        expect(screen.queryByLabelText("Diagnostics")).toBeNull();

        fireEvent.click(button);

        expect(
            screen.queryByRole("button", { name: "Show 2 diagnostics" }),
        ).toBeNull();
        const panel = screen.getByLabelText("Diagnostics");
        expect(panel.className).toContain("bg-card");
        expect(panel.textContent).toContain(WARNING.message);
        expect(panel.textContent).toContain(ERROR.message);

        fireEvent.pointerDown(document.body);

        expect(screen.queryByLabelText("Diagnostics")).toBeNull();
        expect(
            screen.getByRole("button", { name: "Show 2 diagnostics" }),
        ).toBeDefined();
    });

    test("opens the related step when a step diagnostic is clicked", () => {
        const stepDiagnostic: ValidatorDiagnostic = {
            ...ERROR,
            path: ["steps", 1, "params", "toolName"],
        };
        let selectedStepIndex: number | undefined;
        render(
            <WorkflowDiagnostics
                diagnostics={[stepDiagnostic]}
                onStepDiagnosticClick={(stepIndex) => {
                    selectedStepIndex = stepIndex;
                }}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Show 1 diagnostic" }),
        );
        fireEvent.click(screen.getByText(stepDiagnostic.message));

        expect(selectedStepIndex).toBe(1);
        expect(screen.queryByLabelText("Diagnostics")).toBeNull();
    });
});
