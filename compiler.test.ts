import { test, expect, describe } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import { compileWorkflow } from "./compiler";
import type { Diagnostic, DiagnosticCode } from "./compiler";
import type { WorkflowDefinition } from "./types";
import ticketReviewWorkflow from "./ticket-review-workflow.json";
import headlinesWorkflow from "./workflow.json";

// ─── Helpers ─────────────────────────────────────────────────────

function hasDiagnostic(diagnostics: Diagnostic[], code: DiagnosticCode): boolean {
	return diagnostics.some((d) => d.code === code);
}

function getDiagnostics(diagnostics: Diagnostic[], code: DiagnosticCode): Diagnostic[] {
	return diagnostics.filter((d) => d.code === code);
}

function getFirstDiagnostic(diagnostics: Diagnostic[], code: DiagnosticCode): Diagnostic {
	const diag = diagnostics.find((d) => d.code === code);
	if (!diag) throw new Error(`Expected diagnostic with code '${code}' but none was found`);
	return diag;
}

function errors(diagnostics: Diagnostic[]): Diagnostic[] {
	return diagnostics.filter((d) => d.severity === "error");
}

function warnings(diagnostics: Diagnostic[]): Diagnostic[] {
	return diagnostics.filter((d) => d.severity === "warning");
}

// ─── Minimal valid workflow factory ──────────────────────────────

function makeWorkflow(
	overrides?: Partial<WorkflowDefinition>,
): WorkflowDefinition {
	return {
		initialStepId: "start",
		steps: [
			{
				id: "start",
				name: "Start",
				description: "First step",
				type: "tool-call",
				params: {
					toolName: "do-thing",
					toolInput: {},
				},
				nextStepId: "done",
			},
			{
				id: "done",
				name: "Done",
				description: "End",
				type: "end",
			},
		],
		...overrides,
	} as WorkflowDefinition;
}

// ─── Tool definitions for testing ────────────────────────────────

const testTools = {
	"do-thing": tool({
		inputSchema: type({}),
		execute: async () => ({}),
	}),
	"get-open-tickets": tool({
		inputSchema: type({}),
		execute: async () => ({}),
	}),
	"page-on-call-engineer": tool({
		inputSchema: type({
			ticketId: "string",
			reason: "string",
		}),
		execute: async () => ({}),
	}),
	"send-slack-message": tool({
		inputSchema: type({
			channel: "string",
			message: "string",
		}),
		execute: async () => ({}),
	}),
};

// ─── Integration: Real workflows ─────────────────────────────────

describe("integration: real workflow files", () => {
	test("ticket-review workflow compiles with zero errors", async () => {
		const result = await compileWorkflow(
			ticketReviewWorkflow as WorkflowDefinition,
			{ tools: testTools },
		);
		const errs = errors(result.diagnostics);
		if (errs.length > 0) {
			console.log("Unexpected errors:", errs);
		}
		expect(errs).toHaveLength(0);
		expect(result.graph).not.toBeNull();
	});

	test("headlines workflow produces INVALID_STEP_ID for hyphenated IDs", async () => {
		const result = await compileWorkflow(headlinesWorkflow as WorkflowDefinition);
		// This workflow uses kebab-case step IDs (get-headlines, send-individual-emails, etc.)
		// which are now invalid — step IDs must be valid JMESPath bare identifiers
		expect(hasDiagnostic(result.diagnostics, "INVALID_STEP_ID")).toBe(true);
		const invalidIds = getDiagnostics(result.diagnostics, "INVALID_STEP_ID");
		// All hyphenated step IDs should be flagged
		const flaggedIds = invalidIds.map((d) => d.location.stepId);
		expect(flaggedIds).toContain("get-headlines");
		expect(flaggedIds).toContain("send-individual-emails");
		expect(flaggedIds).toContain("send-headline-email");
		expect(flaggedIds).toContain("check-headline-count");
		expect(flaggedIds).toContain("send-busy-news-email");
		expect(flaggedIds).toContain("end-workflow");
	});

	test("ticket-review workflow without tool definitions still validates structure", async () => {
		const result = await compileWorkflow(
			ticketReviewWorkflow as WorkflowDefinition,
		);
		// No UNKNOWN_TOOL errors since tools aren't provided
		expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(false);
		expect(result.graph).not.toBeNull();
	});

	test("ticket-review workflow validates with real AI SDK tool definitions from example-tasks", async () => {
		const { EXAMPLE_TASKS } = await import("./example-tasks");
		const result = await compileWorkflow(
			ticketReviewWorkflow as WorkflowDefinition,
			{ tools: EXAMPLE_TASKS["ticket-review"].availableTools },
		);
		const errs = errors(result.diagnostics);
		if (errs.length > 0) {
			console.log("Unexpected errors:", errs);
		}
		expect(errs).toHaveLength(0);
		expect(result.graph).not.toBeNull();
	});
});

// ─── Valid workflows ─────────────────────────────────────────────

describe("valid workflows", () => {
	test("minimal workflow: tool-call → end", async () => {
		const result = await compileWorkflow(makeWorkflow());
		expect(errors(result.diagnostics)).toHaveLength(0);
		expect(result.graph).not.toBeNull();
	});

	test("workflow with only an end step as initial step", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "done",
			steps: [
				{
					id: "done",
					name: "Done",
					description: "Only step",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});

	test("workflow with for-each and loop variable references", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get_data",
			steps: [
				{
					id: "get_data",
					name: "Get Data",
					description: "Fetch data",
					type: "tool-call",
					params: {
						toolName: "get-items",
						toolInput: {},
					},
					nextStepId: "loop",
				},
				{
					id: "loop",
					name: "Loop",
					description: "Iterate items",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "get_data.items" },
						itemName: "item",
						loopBodyStepId: "process_item",
					},
					nextStepId: "done",
				},
				{
					id: "process_item",
					name: "Process Item",
					description: "Handle each item",
					type: "tool-call",
					params: {
						toolName: "handle-item",
						toolInput: {
							name: { type: "jmespath", expression: "item.name" },
						},
					},
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});
});

// ─── Step reference validation ───────────────────────────────────

describe("step reference validation", () => {
	test("missing initialStepId", async () => {
		const workflow = makeWorkflow({ initialStepId: "nonexistent" });
		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "MISSING_INITIAL_STEP")).toBe(true);
	});

	test("missing nextStepId reference", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "start",
			steps: [
				{
					id: "start",
					name: "Start",
					description: "First step",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "ghost",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "MISSING_NEXT_STEP")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "MISSING_NEXT_STEP");
		expect(diag.location.stepId).toBe("start");
		expect(diag.message).toContain("ghost");
	});

	test("missing branchBodyStepId reference", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "sw",
			steps: [
				{
					id: "sw",
					name: "Switch",
					description: "Branch",
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: true },
						cases: [
							{
								value: { type: "literal", value: true },
								branchBodyStepId: "nonexistent_branch",
							},
						],
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "MISSING_BRANCH_BODY_STEP")).toBe(true);
	});

	test("missing loopBodyStepId reference", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				{
					id: "loop",
					name: "Loop",
					description: "Iterate",
					type: "for-each",
					params: {
						target: { type: "literal", value: [1, 2] },
						itemName: "x",
						loopBodyStepId: "ghost_body",
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "MISSING_LOOP_BODY_STEP")).toBe(true);
	});

	test("duplicate step IDs", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A1",
					description: "First",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "b",
				},
				{
					id: "a",
					name: "A2",
					description: "Duplicate",
					type: "end",
				},
				{
					id: "b",
					name: "B",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "DUPLICATE_STEP_ID")).toBe(true);
		expect(result.graph).toBeNull();
	});
});

// ─── Graph analysis ──────────────────────────────────────────────

describe("graph analysis", () => {
	test("unreachable step", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "start",
			steps: [
				{
					id: "start",
					name: "Start",
					description: "First",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
				{
					id: "orphan",
					name: "Orphan",
					description: "Never reached",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "UNREACHABLE_STEP")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "UNREACHABLE_STEP");
		expect(diag.location.stepId).toBe("orphan");
	});

	test("simple cycle: A → B → A", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "Step A",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "b",
				},
				{
					id: "b",
					name: "B",
					description: "Step B",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "a",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "CYCLE_DETECTED")).toBe(true);
		expect(result.graph).toBeNull();
	});

	test("self-referencing step", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				{
					id: "loop",
					name: "Loop",
					description: "Loops forever",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "loop",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "CYCLE_DETECTED")).toBe(true);
	});

	test("cycle inside a branch body", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "sw",
			steps: [
				{
					id: "sw",
					name: "Switch",
					description: "Branch",
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: true },
						cases: [
							{
								value: { type: "literal", value: true },
								branchBodyStepId: "branch_a",
							},
						],
					},
					nextStepId: "done",
				},
				{
					id: "branch_a",
					name: "Branch A",
					description: "Branch start",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "branch_b",
				},
				{
					id: "branch_b",
					name: "Branch B",
					description: "Branch end, loops back",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "branch_a",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "CYCLE_DETECTED")).toBe(true);
	});
});

// ─── Control flow validation ─────────────────────────────────────

describe("control flow validation", () => {
	test("end step with nextStepId", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "done",
			steps: [
				{
					id: "done",
					name: "Done",
					description: "End but has next",
					type: "end",
					nextStepId: "extra",
				},
				{
					id: "extra",
					name: "Extra",
					description: "Shouldn't be here",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "END_STEP_HAS_NEXT")).toBe(true);
	});

	test("switch-case with multiple default cases", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "sw",
			steps: [
				{
					id: "sw",
					name: "Switch",
					description: "Two defaults",
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: "x" },
						cases: [
							{
								value: { type: "default" },
								branchBodyStepId: "b1",
							},
							{
								value: { type: "default" },
								branchBodyStepId: "b2",
							},
						],
					},
					nextStepId: "done",
				},
				{
					id: "b1",
					name: "B1",
					description: "Branch 1",
					type: "end",
				},
				{
					id: "b2",
					name: "B2",
					description: "Branch 2",
					type: "end",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "MULTIPLE_DEFAULT_CASES")).toBe(true);
	});

	test("loop body that escapes to main flow", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get_data",
			steps: [
				{
					id: "get_data",
					name: "Get Data",
					description: "Fetch data",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "loop",
				},
				{
					id: "loop",
					name: "Loop",
					description: "Iterate",
					type: "for-each",
					params: {
						target: { type: "literal", value: [1, 2] },
						itemName: "item",
						loopBodyStepId: "body_step",
					},
					nextStepId: "after_loop",
				},
				{
					id: "body_step",
					name: "Body Step",
					description: "In loop body",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "after_loop", // This escapes!
				},
				{
					id: "after_loop",
					name: "After Loop",
					description: "Continue after loop",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "LOOP_BODY_ESCAPES")).toBe(true);
	});

	test("branch body that escapes to main flow", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "sw",
			steps: [
				{
					id: "sw",
					name: "Switch",
					description: "Branch",
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: true },
						cases: [
							{
								value: { type: "literal", value: true },
								branchBodyStepId: "branch_step",
							},
						],
					},
					nextStepId: "after_branch",
				},
				{
					id: "branch_step",
					name: "Branch Step",
					description: "In branch",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "after_branch", // This escapes!
				},
				{
					id: "after_branch",
					name: "After Branch",
					description: "Continue after",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "BRANCH_BODY_ESCAPES")).toBe(true);
	});
});

// ─── JMESPath syntax validation ──────────────────────────────────

describe("jmespath syntax validation", () => {
	test("invalid jmespath in tool-call expression", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "Bad expression",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							data: {
								type: "jmespath",
								expression: "foo[?bar ==",
							},
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR");
		expect(diag.location.stepId).toBe("a");
		expect(diag.location.field).toContain("data");
	});

	test("invalid jmespath in llm-prompt template", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "prev",
			steps: [
				{
					id: "prev",
					name: "Prev",
					description: "Previous step",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "prompt",
				},
				{
					id: "prompt",
					name: "Prompt",
					description: "LLM step with bad template expression",
					type: "llm-prompt",
					params: {
						prompt: "Hello ${foo..bar} world",
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(true);
	});

	test("valid jmespath expressions produce no syntax errors", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch data",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "use",
				},
				{
					id: "use",
					name: "Use",
					description: "Use data",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							a: { type: "jmespath", expression: "get.items" },
							b: { type: "jmespath", expression: "length(get.items)" },
							c: { type: "jmespath", expression: "get.items[?status == 'active']" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(false);
	});

	test("invalid jmespath in for-each target", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				{
					id: "loop",
					name: "Loop",
					description: "Bad target expression",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "[??" },
						itemName: "x",
						loopBodyStepId: "body",
					},
					nextStepId: "done",
				},
				{
					id: "body",
					name: "Body",
					description: "Loop body",
					type: "end",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(true);
	});

	test("invalid jmespath in switch-case switchOn", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "sw",
			steps: [
				{
					id: "sw",
					name: "Switch",
					description: "Bad switchOn",
					type: "switch-case",
					params: {
						switchOn: { type: "jmespath", expression: "..invalid" },
						cases: [
							{
								value: { type: "default" },
								branchBodyStepId: "b",
							},
						],
					},
					nextStepId: "done",
				},
				{
					id: "b",
					name: "Branch",
					description: "Branch body",
					type: "end",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(true);
	});
});

// ─── JMESPath scope/reference validation ─────────────────────────

describe("jmespath scope validation", () => {
	test("referencing a predecessor step is valid", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch data",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "use",
				},
				{
					id: "use",
					name: "Use",
					description: "Use data from get",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							data: { type: "jmespath", expression: "get.result" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(false);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE")).toBe(false);
	});

	test("referencing a non-existent step ID produces error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "Step A",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							data: { type: "jmespath", expression: "phantom.value" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE");
		expect(diag.message).toContain("phantom");
	});

	test("forward reference produces warning", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "References B which hasn't executed yet",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							data: { type: "jmespath", expression: "b.value" },
						},
					},
					nextStepId: "b",
				},
				{
					id: "b",
					name: "B",
					description: "Step B",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE")).toBe(true);
	});

	test("loop variable is valid inside loop body", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch items",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "loop",
				},
				{
					id: "loop",
					name: "Loop",
					description: "Iterate",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "get.items" },
						itemName: "item",
						loopBodyStepId: "body",
					},
					nextStepId: "done",
				},
				{
					id: "body",
					name: "Body",
					description: "Loop body uses item",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							name: { type: "jmespath", expression: "item.name" },
						},
					},
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(false);
	});

	test("loop variable is NOT valid outside loop body", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch items",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "loop",
				},
				{
					id: "loop",
					name: "Loop",
					description: "Iterate",
					type: "for-each",
					params: {
						target: { type: "literal", value: [1, 2] },
						itemName: "item",
						loopBodyStepId: "body",
					},
					nextStepId: "after",
				},
				{
					id: "body",
					name: "Body",
					description: "Loop body",
					type: "end",
				},
				{
					id: "after",
					name: "After",
					description: "After loop, tries to use loop var",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							data: { type: "jmespath", expression: "item.name" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE");
		expect(diag.message).toContain("item");
	});

	test("nested loop: inner body can access both loop variables", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch data",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "outer_loop",
				},
				{
					id: "outer_loop",
					name: "Outer Loop",
					description: "Outer",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "get.groups" },
						itemName: "group",
						loopBodyStepId: "inner_loop",
					},
					nextStepId: "done",
				},
				{
					id: "inner_loop",
					name: "Inner Loop",
					description: "Inner",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "group.items" },
						itemName: "inner_item",
						loopBodyStepId: "process",
					},
				},
				{
					id: "process",
					name: "Process",
					description: "Uses both loop vars",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							group_name: { type: "jmespath", expression: "group.name" },
							item_name: { type: "jmespath", expression: "inner_item.name" },
						},
					},
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		const scopeErrors = getDiagnostics(
			result.diagnostics,
			"JMESPATH_INVALID_ROOT_REFERENCE",
		);
		expect(scopeErrors).toHaveLength(0);
	});

	test("for-each target cannot use its own itemName", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				{
					id: "loop",
					name: "Loop",
					description: "Target uses own itemName",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "item.things" },
						itemName: "item",
						loopBodyStepId: "body",
					},
					nextStepId: "done",
				},
				{
					id: "body",
					name: "Body",
					description: "Loop body",
					type: "end",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		// "item" is not a step ID and is not in scope at the for-each step itself
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(true);
	});

	test("hyphenated step IDs produce INVALID_STEP_ID errors", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get-data",
			steps: [
				{
					id: "get-data",
					name: "Get Data",
					description: "Fetch data",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "INVALID_STEP_ID")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "INVALID_STEP_ID");
		expect(diag.location.stepId).toBe("get-data");
		expect(diag.message).toContain("underscores");
	});
});

// ─── Tool validation ─────────────────────────────────────────────

describe("tool validation", () => {
	test("unknown tool produces error", async () => {
		const workflow = makeWorkflow();
		// Override the tool name to something not in testTools
		(workflow.steps[0] as any).params.toolName = "nonexistent-tool";

		const result = await compileWorkflow(workflow, { tools: testTools });
		expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(true);
	});

	test("extra tool input key produces warning", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "step",
			steps: [
				{
					id: "step",
					name: "Step",
					description: "Has extra key",
					type: "tool-call",
					params: {
						toolName: "send-slack-message",
						toolInput: {
							channel: { type: "literal", value: "#general" },
							message: { type: "literal", value: "hi" },
							extraField: { type: "literal", value: "oops" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow, { tools: testTools });
		expect(hasDiagnostic(result.diagnostics, "EXTRA_TOOL_INPUT_KEY")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "EXTRA_TOOL_INPUT_KEY");
		expect(diag.message).toContain("extraField");
	});

	test("missing required tool input key produces error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "step",
			steps: [
				{
					id: "step",
					name: "Step",
					description: "Missing required key",
					type: "tool-call",
					params: {
						toolName: "page-on-call-engineer",
						toolInput: {
							ticketId: { type: "literal", value: "TKT-001" },
							// Missing "reason" which is required
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow, { tools: testTools });
		expect(hasDiagnostic(result.diagnostics, "MISSING_TOOL_INPUT_KEY")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "MISSING_TOOL_INPUT_KEY");
		expect(diag.message).toContain("reason");
	});

	test("tool with empty input schema and no inputs is valid", async () => {
		const workflow = makeWorkflow();
		const result = await compileWorkflow(workflow, { tools: testTools });
		expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(false);
		expect(hasDiagnostic(result.diagnostics, "MISSING_TOOL_INPUT_KEY")).toBe(false);
	});

	test("no tool definitions provided skips tool validation", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "step",
			steps: [
				{
					id: "step",
					name: "Step",
					description: "Unknown tool",
					type: "tool-call",
					params: {
						toolName: "totally-fake-tool",
						toolInput: {},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		// No tools option — no tool errors
		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(false);
	});
});

// ─── Edge cases ──────────────────────────────────────────────────

describe("edge cases", () => {
	test("empty steps array with non-existent initial step", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "nonexistent",
			steps: [],
		} as unknown as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "MISSING_INITIAL_STEP")).toBe(true);
		expect(result.graph).toBeNull();
	});

	test("jmespath expression that is just a function call with no field refs", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "Uses literal-only jmespath",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							// This is valid JMESPath but references no step
							val: { type: "jmespath", expression: "length(`[1,2,3]`)" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		// Should not produce any reference errors since there are no field references
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(false);
	});

	test("literal expressions are not validated as jmespath", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "Uses literals only",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "literal", value: "not jmespath at all {{}}[]" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(false);
	});

	test("multiple errors are reported in a single compilation", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "Multiple issues",
					type: "tool-call",
					params: {
						toolName: "fake-tool",
						toolInput: {
							bad: { type: "jmespath", expression: "nonexistent.field" },
						},
					},
					nextStepId: "ghost",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow, { tools: testTools });
		// Should have: MISSING_NEXT_STEP, UNKNOWN_TOOL, JMESPATH_INVALID_ROOT_REFERENCE
		expect(hasDiagnostic(result.diagnostics, "MISSING_NEXT_STEP")).toBe(true);
		expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(true);
	});

	test("llm-prompt with no template expressions is valid", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				{
					id: "prompt",
					name: "Prompt",
					description: "Simple prompt with no expressions",
					type: "llm-prompt",
					params: {
						prompt: "Hello world, no expressions here",
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});

	test("switch-case with valid step references in all branches", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "sw",
				},
				{
					id: "sw",
					name: "Switch",
					description: "Branch",
					type: "switch-case",
					params: {
						switchOn: { type: "jmespath", expression: "get.status" },
						cases: [
							{
								value: { type: "literal", value: "ok" },
								branchBodyStepId: "handle_ok",
							},
							{
								value: { type: "default" },
								branchBodyStepId: "handle_other",
							},
						],
					},
					nextStepId: "done",
				},
				{
					id: "handle_ok",
					name: "Handle OK",
					description: "OK branch",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "jmespath", expression: "get.data" },
						},
					},
				},
				{
					id: "handle_other",
					name: "Handle Other",
					description: "Default branch",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "jmespath", expression: "get.error" },
						},
					},
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});
});

// ─── Bug regression: self-reference, shadowing, templates, scoping ──

describe("self-reference and predecessor correctness", () => {
	test("step referencing its own output gets forward reference warning", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "References itself",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "jmespath", expression: "a.result" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE");
		expect(diag.location.stepId).toBe("a");
	});

	test("predecessor transitivity: A→B→C, C can reference A", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "First",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "b",
				},
				{
					id: "b",
					name: "B",
					description: "Second",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "c",
				},
				{
					id: "c",
					name: "C",
					description: "Third — references A (two steps back)",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							from_a: { type: "jmespath", expression: "a.value" },
							from_b: { type: "jmespath", expression: "b.value" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		// Both a and b should be valid predecessors of c
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE")).toBe(false);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(false);
	});

	test("step after switch-case cannot reference branch-only step", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "sw",
			steps: [
				{
					id: "sw",
					name: "Switch",
					description: "Branch",
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: true },
						cases: [
							{
								value: { type: "literal", value: true },
								branchBodyStepId: "branch_only",
							},
						],
					},
					nextStepId: "after_switch",
				},
				{
					id: "branch_only",
					name: "Branch Only",
					description: "Only runs if case matches",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
				},
				{
					id: "after_switch",
					name: "After Switch",
					description: "References branch step — may not have executed",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "jmespath", expression: "branch_only.result" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE");
		expect(diag.message).toContain("branch_only");
	});

	test("multiple roots in one expression: mixed valid and invalid", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "First",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "b",
				},
				{
					id: "b",
					name: "B",
					description: "Uses join with valid and invalid refs",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: {
								type: "jmespath",
								expression: "join(', ', [a.name, nonexistent.name])",
							},
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		// a.name is valid, nonexistent.name is not
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(true);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE")).toBe(false);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE");
		expect(diag.message).toContain("nonexistent");
	});
});

describe("itemName validation", () => {
	test("invalid itemName format produces error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				{
					id: "loop",
					name: "Loop",
					description: "Invalid item name",
					type: "for-each",
					params: {
						target: { type: "literal", value: [1, 2] },
						itemName: "my-item",
						loopBodyStepId: "body",
					},
					nextStepId: "done",
				},
				{
					id: "body",
					name: "Body",
					description: "Loop body",
					type: "end",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "INVALID_ITEM_NAME")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "INVALID_ITEM_NAME");
		expect(diag.message).toContain("my-item");
	});

	test("itemName starting with number produces error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				{
					id: "loop",
					name: "Loop",
					description: "Numeric item name",
					type: "for-each",
					params: {
						target: { type: "literal", value: [1] },
						itemName: "123item",
						loopBodyStepId: "body",
					},
					nextStepId: "done",
				},
				{
					id: "body",
					name: "Body",
					description: "Body",
					type: "end",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "INVALID_ITEM_NAME")).toBe(true);
	});

	test("itemName that shadows a step ID produces warning", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "data",
			steps: [
				{
					id: "data",
					name: "Data",
					description: "Get data",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "loop",
				},
				{
					id: "loop",
					name: "Loop",
					description: "itemName shadows step ID",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "data.items" },
						itemName: "data",
						loopBodyStepId: "body",
					},
					nextStepId: "done",
				},
				{
					id: "body",
					name: "Body",
					description: "Inside loop, 'data' is ambiguous",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "jmespath", expression: "data.name" },
						},
					},
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "ITEM_NAME_SHADOWS_STEP_ID")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "ITEM_NAME_SHADOWS_STEP_ID");
		expect(diag.message).toContain("shadows");
		expect(diag.message).toContain("data");
	});

	test("valid itemName with underscore format passes", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "loop",
				},
				{
					id: "loop",
					name: "Loop",
					description: "Valid item name",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "get.items" },
						itemName: "current_item",
						loopBodyStepId: "body",
					},
					nextStepId: "done",
				},
				{
					id: "body",
					name: "Body",
					description: "Loop body",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "jmespath", expression: "current_item.name" },
						},
					},
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "INVALID_ITEM_NAME")).toBe(false);
		expect(hasDiagnostic(result.diagnostics, "ITEM_NAME_SHADOWS_STEP_ID")).toBe(false);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});
});

describe("template expression edge cases", () => {
	test("unclosed template expression produces error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				{
					id: "prompt",
					name: "Prompt",
					description: "Unclosed template",
					type: "llm-prompt",
					params: {
						prompt: "Hello ${user.name world",
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "UNCLOSED_TEMPLATE_EXPRESSION")).toBe(true);
	});

	test("empty template expression ${} is a JMESPath syntax error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "prev",
			steps: [
				{
					id: "prev",
					name: "Prev",
					description: "Previous step",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "prompt",
				},
				{
					id: "prompt",
					name: "Prompt",
					description: "Empty template expression",
					type: "llm-prompt",
					params: {
						prompt: "Hello ${} world",
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(true);
	});

	test("$ without { is not treated as template expression", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				{
					id: "prompt",
					name: "Prompt",
					description: "Dollar sign without brace",
					type: "llm-prompt",
					params: {
						prompt: "Price is $100 and $200",
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(false);
		expect(hasDiagnostic(result.diagnostics, "UNCLOSED_TEMPLATE_EXPRESSION")).toBe(false);
	});

	test("multiple template expressions with one invalid", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "a",
			steps: [
				{
					id: "a",
					name: "A",
					description: "Fetch",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "prompt",
				},
				{
					id: "prompt",
					name: "Prompt",
					description: "Mixed valid and invalid template expressions",
					type: "llm-prompt",
					params: {
						prompt: "Hello ${a.name}, your balance is ${..invalid}",
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		// First expression is valid, second has bad JMESPath syntax
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(true);
		// The valid one should not trigger reference errors
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(false);
	});
});

describe("nested control flow scoping", () => {
	test("for-each inside switch-case branch has correct loop scope", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "sw",
				},
				{
					id: "sw",
					name: "Switch",
					description: "Branch",
					type: "switch-case",
					params: {
						switchOn: { type: "jmespath", expression: "get.type" },
						cases: [
							{
								value: { type: "literal", value: "list" },
								branchBodyStepId: "loop_in_branch",
							},
							{
								value: { type: "default" },
								branchBodyStepId: "default_handler",
							},
						],
					},
					nextStepId: "done",
				},
				{
					id: "loop_in_branch",
					name: "Loop In Branch",
					description: "For-each nested inside a switch-case branch",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "get.items" },
						itemName: "item",
						loopBodyStepId: "process_item",
					},
				},
				{
					id: "process_item",
					name: "Process Item",
					description: "Uses loop var and step output",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							item_name: { type: "jmespath", expression: "item.name" },
							source: { type: "jmespath", expression: "get.source" },
						},
					},
				},
				{
					id: "default_handler",
					name: "Default Handler",
					description: "Default branch",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		// process_item should be able to access both "item" (loop var) and "get" (predecessor)
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(false);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE")).toBe(false);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});

	test("loop variable from branch-nested loop is not available after switch-case", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "sw",
			steps: [
				{
					id: "sw",
					name: "Switch",
					description: "Branch with loop inside",
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: true },
						cases: [
							{
								value: { type: "literal", value: true },
								branchBodyStepId: "loop",
							},
						],
					},
					nextStepId: "after",
				},
				{
					id: "loop",
					name: "Loop",
					description: "Loop in branch",
					type: "for-each",
					params: {
						target: { type: "literal", value: [1] },
						itemName: "x",
						loopBodyStepId: "body",
					},
				},
				{
					id: "body",
					name: "Body",
					description: "Loop body",
					type: "end",
				},
				{
					id: "after",
					name: "After",
					description: "After switch — tries to use loop var from branch",
					type: "tool-call",
					params: {
						toolName: "do-thing",
						toolInput: {
							val: { type: "jmespath", expression: "x.value" },
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		// "x" is a loop variable only inside the branch's loop body, not after the switch
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE");
		expect(diag.message).toContain("x");
	});
});

// ─── extract-data step validation ───────────────────────────────

describe("extract-data step validation", () => {
	test("valid extract-data with jmespath sourceData referencing predecessor", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				{
					id: "fetch",
					name: "Fetch",
					description: "Get raw data",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "extract",
				},
				{
					id: "extract",
					name: "Extract",
					description: "Extract structured data from raw output",
					type: "extract-data",
					params: {
						sourceData: { type: "jmespath", expression: "fetch.rawOutput" },
						outputFormat: { type: "object", properties: { name: { type: "string" } } },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});

	test("extract-data with invalid jmespath syntax produces error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				{
					id: "extract",
					name: "Extract",
					description: "Bad expression",
					type: "extract-data",
					params: {
						sourceData: { type: "jmespath", expression: "foo[??" },
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR");
		expect(diag.location.stepId).toBe("extract");
		expect(diag.location.field).toBe("params.sourceData.expression");
	});

	test("extract-data referencing non-existent step produces error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				{
					id: "extract",
					name: "Extract",
					description: "References unknown step",
					type: "extract-data",
					params: {
						sourceData: { type: "jmespath", expression: "ghost.data" },
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(true);
		const diag = getFirstDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE");
		expect(diag.message).toContain("ghost");
	});

	test("extract-data with literal sourceData is valid and not checked as jmespath", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				{
					id: "extract",
					name: "Extract",
					description: "Literal source data",
					type: "extract-data",
					params: {
						sourceData: { type: "literal", value: { raw: "some text" } },
						outputFormat: { type: "object" },
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});

	test("extract-data inside for-each body can use loop variable", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get",
			steps: [
				{
					id: "get",
					name: "Get",
					description: "Fetch list",
					type: "tool-call",
					params: { toolName: "do-thing", toolInput: {} },
					nextStepId: "loop",
				},
				{
					id: "loop",
					name: "Loop",
					description: "Iterate",
					type: "for-each",
					params: {
						target: { type: "jmespath", expression: "get.items" },
						itemName: "item",
						loopBodyStepId: "extract",
					},
					nextStepId: "done",
				},
				{
					id: "extract",
					name: "Extract",
					description: "Extract from each item",
					type: "extract-data",
					params: {
						sourceData: { type: "jmespath", expression: "item.rawContent" },
						outputFormat: { type: "object", properties: { title: { type: "string" } } },
					},
				},
				{
					id: "done",
					name: "Done",
					description: "End",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE")).toBe(false);
		expect(errors(result.diagnostics)).toHaveLength(0);
	});
});
