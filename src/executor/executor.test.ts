import { describe, expect, test } from "bun:test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { APICallError, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { type } from "arktype";
import { EXAMPLE_TASKS } from "../example-tasks";
import type { WorkflowDefinition } from "../types";
import { executeWorkflow } from ".";
import { ExtractionError } from "./errors";

// ─── Test Tools ──────────────────────────────────────────────────

const testTools = {
	echo: tool({
		inputSchema: type({}),
		execute: async () => ({ echoed: true }),
	}),
	greet: tool({
		inputSchema: type({ name: "string" }),
		execute: async ({ name }) => ({ greeting: `Hello, ${name}!` }),
	}),
	add: tool({
		inputSchema: type({ a: "number", b: "number" }),
		execute: async ({ a, b }) => ({ sum: a + b }),
	}),
	getItems: tool({
		inputSchema: type({}),
		execute: async () => ({
			items: [
				{ name: "alpha", category: "a" },
				{ name: "beta", category: "b" },
				{ name: "gamma", category: "a" },
			],
		}),
	}),
	processItem: tool({
		inputSchema: type({ name: "string" }),
		execute: async ({ name }) => ({ processed: name.toUpperCase() }),
	}),
	classify: tool({
		inputSchema: type({ value: "string" }),
		execute: async ({ value }) => ({
			label: value.length > 4 ? "long" : "short",
		}),
	}),
	failingTool: tool({
		inputSchema: type({}),
		execute: async (): Promise<Record<string, never>> => {
			throw new Error("Tool failed intentionally");
		},
	}),
};

// ─── Mock Model Helper ──────────────────────────────────────────

function createMockModel(responses: unknown[]) {
	let callIndex = 0;
	return new MockLanguageModelV3({
		doGenerate: async () =>
			({
				content: [
					{
						type: "text",
						text: JSON.stringify(responses[callIndex++]),
					},
				],
				finishReason: { unified: "stop", raw: undefined },
				usage: {
					inputTokens: {
						total: 10,
						noCache: undefined,
						cacheRead: undefined,
						cacheWrite: undefined,
					},
					outputTokens: { total: 10, text: undefined, reasoning: undefined },
				},
				warnings: [],
			}) as LanguageModelV3GenerateResult,
	});
}

function createMockAgent(responses: unknown[]) {
	let callIndex = 0;
	return {
		version: "agent-v1" as const,
		id: "mock-agent",
		tools: {},
		async generate() {
			return { text: JSON.stringify(responses[callIndex++]) } as Awaited<
				ReturnType<import("ai").Agent["generate"]>
			>;
		},
		async stream(): Promise<never> {
			throw new Error("stream not implemented in mock");
		},
	};
}

// ─── Workflow Helpers ────────────────────────────────────────────

function step(
	id: string,
	overrides: Partial<WorkflowDefinition["steps"][0]> & {
		type: string;
		params?: unknown;
	},
) {
	return {
		id,
		name: id,
		description: id,
		...overrides,
	} as WorkflowDefinition["steps"][0];
}

// ─── Basic Execution ─────────────────────────────────────────────

describe("basic execution", () => {
	test("single tool-call step with literal inputs", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "start",
			steps: [
				step("start", {
					type: "tool-call",
					params: {
						toolName: "echo",
						toolInput: {},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.start).toEqual({ echoed: true });
	});

	test("two-step chain with JMESPath reference", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				step("fetch", {
					type: "tool-call",
					params: {
						toolName: "getItems",
						toolInput: {},
					},
					nextStepId: "process",
				}),
				step("process", {
					type: "tool-call",
					params: {
						toolName: "processItem",
						toolInput: {
							name: {
								type: "jmespath",
								expression: "fetch.items[0].name",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.process).toEqual({ processed: "ALPHA" });
	});

	test("mixed literal and JMESPath inputs", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				step("fetch", {
					type: "tool-call",
					params: {
						toolName: "getItems",
						toolInput: {},
					},
					nextStepId: "compute",
				}),
				step("compute", {
					type: "tool-call",
					params: {
						toolName: "add",
						toolInput: {
							a: { type: "literal", value: 5 },
							b: {
								type: "jmespath",
								expression: "length(fetch.items)",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.compute).toEqual({ sum: 8 });
	});

	test("end step terminates chain", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "done",
			steps: [
				step("done", {
					type: "end",
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.done).toBeUndefined();
	});

	test("multi-step chain executes in order", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "step_a",
			steps: [
				step("step_a", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "step_b",
				}),
				step("step_b", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "World" },
						},
					},
					nextStepId: "step_c",
				}),
				step("step_c", {
					type: "end",
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.step_a).toEqual({ echoed: true });
		expect(result.stepOutputs.step_b).toEqual({
			greeting: "Hello, World!",
		});
		expect(result.stepOutputs.step_c).toBeUndefined();
	});
});

// ─── Template Expressions ────────────────────────────────────────

describe("template expressions", () => {
	test("template expression interpolates values from prior step", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				step("fetch", {
					type: "tool-call",
					params: {
						toolName: "getItems",
						toolInput: {},
					},
					nextStepId: "greet_step",
				}),
				step("greet_step", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: {
								type: "template",
								template: "user ${fetch.items[0].name}",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.greet_step).toEqual({
			greeting: "Hello, user alpha!",
		});
	});

	test("template expression with no embedded expressions returns plain string", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "greet_step",
			steps: [
				step("greet_step", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: {
								type: "template",
								template: "plain text",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.greet_step).toEqual({
			greeting: "Hello, plain text!",
		});
	});

	test("template expression with multiple embedded expressions", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				step("fetch", {
					type: "tool-call",
					params: {
						toolName: "getItems",
						toolInput: {},
					},
					nextStepId: "process",
				}),
				step("process", {
					type: "tool-call",
					params: {
						toolName: "classify",
						toolInput: {
							value: {
								type: "template",
								template: "${fetch.items[0].name}-${fetch.items[1].name}",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		// "alpha-beta" has length > 4, so label is "long"
		expect(result.stepOutputs.process).toEqual({ label: "long" });
	});

	test("template expression with workflow input", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "greet_step",
			inputSchema: {
				type: "object",
				properties: { firstName: { type: "string" } },
			},
			steps: [
				step("greet_step", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: {
								type: "template",
								template: "Dr. ${input.firstName}",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			inputs: { firstName: "Alice" },
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.greet_step).toEqual({
			greeting: "Hello, Dr. Alice!",
		});
	});
});

// ─── Switch-Case ─────────────────────────────────────────────────

describe("switch-case", () => {
	test("correct branch selected by value match", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "check",
			steps: [
				step("check", {
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: "yes" },
						cases: [
							{
								value: { type: "literal", value: "yes" },
								branchBodyStepId: "branch_yes",
							},
							{
								value: { type: "literal", value: "no" },
								branchBodyStepId: "branch_no",
							},
						],
					},
				}),
				step("branch_yes", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "Yes" },
						},
					},
				}),
				step("branch_no", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "No" },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.branch_yes).toEqual({
			greeting: "Hello, Yes!",
		});
		expect(result.stepOutputs.branch_no).toBeUndefined();
	});

	test("default branch when no match", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "check",
			steps: [
				step("check", {
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: "unknown" },
						cases: [
							{
								value: { type: "literal", value: "yes" },
								branchBodyStepId: "branch_yes",
							},
							{
								value: { type: "default" },
								branchBodyStepId: "branch_default",
							},
						],
					},
				}),
				step("branch_yes", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "Yes" },
						},
					},
				}),
				step("branch_default", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "Default" },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.branch_default).toEqual({
			greeting: "Hello, Default!",
		});
		expect(result.stepOutputs.branch_yes).toBeUndefined();
	});

	test("switch output is last step of selected branch", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "check",
			steps: [
				step("check", {
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: "go" },
						cases: [
							{
								value: { type: "literal", value: "go" },
								branchBodyStepId: "branch_first",
							},
						],
					},
					nextStepId: "after_switch",
				}),
				step("branch_first", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "branch_second",
				}),
				step("branch_second", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "BranchEnd" },
						},
					},
				}),
				step("after_switch", {
					type: "end",
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		// Switch-case output equals last step in branch
		expect(result.stepOutputs.check).toEqual({
			greeting: "Hello, BranchEnd!",
		});
		// Execution continues after switch
		expect(result.stepOutputs.after_switch).toBeUndefined();
	});

	test("no matching case and no default returns undefined", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "check",
			steps: [
				step("check", {
					type: "switch-case",
					params: {
						switchOn: { type: "literal", value: "nope" },
						cases: [
							{
								value: { type: "literal", value: "yes" },
								branchBodyStepId: "branch_yes",
							},
						],
					},
				}),
				step("branch_yes", {
					type: "tool-call",
					params: {
						toolName: "echo",
						toolInput: {},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.check).toBeUndefined();
		expect(result.stepOutputs.branch_yes).toBeUndefined();
	});

	test("switch-case with JMESPath on prior step output", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				step("fetch", {
					type: "tool-call",
					params: {
						toolName: "classify",
						toolInput: {
							value: { type: "literal", value: "hello" },
						},
					},
					nextStepId: "branch",
				}),
				step("branch", {
					type: "switch-case",
					params: {
						switchOn: {
							type: "jmespath",
							expression: "fetch.label",
						},
						cases: [
							{
								value: { type: "literal", value: "long" },
								branchBodyStepId: "handle_long",
							},
							{
								value: { type: "literal", value: "short" },
								branchBodyStepId: "handle_short",
							},
						],
					},
				}),
				step("handle_long", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "Long" },
						},
					},
				}),
				step("handle_short", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "Short" },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		// "hello" has 5 chars → "long"
		expect(result.stepOutputs.handle_long).toEqual({
			greeting: "Hello, Long!",
		});
		expect(result.stepOutputs.handle_short).toBeUndefined();
	});
});

// ─── For-Each ────────────────────────────────────────────────────

describe("for-each", () => {
	test("iterates over array and collects results", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				step("fetch", {
					type: "tool-call",
					params: { toolName: "getItems", toolInput: {} },
					nextStepId: "loop",
				}),
				step("loop", {
					type: "for-each",
					params: {
						target: {
							type: "jmespath",
							expression: "fetch.items",
						},
						itemName: "item",
						loopBodyStepId: "process",
					},
				}),
				step("process", {
					type: "tool-call",
					params: {
						toolName: "processItem",
						toolInput: {
							name: {
								type: "jmespath",
								expression: "item.name",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.loop).toEqual([
			{ processed: "ALPHA" },
			{ processed: "BETA" },
			{ processed: "GAMMA" },
		]);
	});

	test("loop variable is accessible in body via JMESPath", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				step("loop", {
					type: "for-each",
					params: {
						target: {
							type: "literal",
							value: [{ x: 1 }, { x: 2 }],
						},
						itemName: "entry",
						loopBodyStepId: "use_entry",
					},
				}),
				step("use_entry", {
					type: "tool-call",
					params: {
						toolName: "add",
						toolInput: {
							a: {
								type: "jmespath",
								expression: "entry.x",
							},
							b: { type: "literal", value: 10 },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.loop).toEqual([{ sum: 11 }, { sum: 12 }]);
	});

	test("nested loops with proper variable scoping", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "outer_loop",
			steps: [
				step("outer_loop", {
					type: "for-each",
					params: {
						target: {
							type: "literal",
							value: [
								{
									group: "A",
									members: [{ n: "a1" }, { n: "a2" }],
								},
								{ group: "B", members: [{ n: "b1" }] },
							],
						},
						itemName: "grp",
						loopBodyStepId: "inner_loop",
					},
				}),
				step("inner_loop", {
					type: "for-each",
					params: {
						target: {
							type: "jmespath",
							expression: "grp.members",
						},
						itemName: "member",
						loopBodyStepId: "process_member",
					},
				}),
				step("process_member", {
					type: "tool-call",
					params: {
						toolName: "processItem",
						toolInput: {
							name: {
								type: "jmespath",
								expression: "member.n",
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.outer_loop).toEqual([
			[{ processed: "A1" }, { processed: "A2" }],
			[{ processed: "B1" }],
		]);
	});

	test("empty array produces empty results", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				step("loop", {
					type: "for-each",
					params: {
						target: { type: "literal", value: [] },
						itemName: "item",
						loopBodyStepId: "body",
					},
				}),
				step("body", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.loop).toEqual([]);
		expect(result.stepOutputs.body).toBeUndefined();
	});

	test("for-each continues to nextStepId after loop", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				step("loop", {
					type: "for-each",
					params: {
						target: {
							type: "literal",
							value: [{ n: "x" }],
						},
						itemName: "item",
						loopBodyStepId: "body",
					},
					nextStepId: "after",
				}),
				step("body", {
					type: "tool-call",
					params: {
						toolName: "processItem",
						toolInput: {
							name: {
								type: "jmespath",
								expression: "item.n",
							},
						},
					},
				}),
				step("after", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.loop).toEqual([{ processed: "X" }]);
		expect(result.stepOutputs.after).toEqual({ echoed: true });
	});
});

// ─── Error Handling ──────────────────────────────────────────────

describe("error handling", () => {
	test("tool execution failure returns error result", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "fail",
			steps: [
				step("fail", {
					type: "tool-call",
					params: { toolName: "failingTool", toolInput: {} },
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
		expect(result.error?.stepId).toBe("fail");
		expect(result.error?.message).toContain("Tool failed intentionally");
		expect(result.error?.code).toBe("TOOL_EXECUTION_FAILED");
		expect(result.error?.category).toBe("external-service");
	});

	test("missing tool returns error result", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "call_missing",
			steps: [
				step("call_missing", {
					type: "tool-call",
					params: {
						toolName: "nonexistent_tool",
						toolInput: {},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.message).toContain("not found");
		expect(result.error?.code).toBe("TOOL_NOT_FOUND");
		expect(result.error?.category).toBe("configuration");
	});

	test("tool input validation failure returns error result", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "bad_input",
			steps: [
				step("bad_input", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: 42 },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.stepId).toBe("bad_input");
		expect(result.error?.message).toContain("validation failed");
		expect(result.error?.code).toBe("TOOL_INPUT_VALIDATION_FAILED");
		expect(result.error?.category).toBe("validation");
	});

	test("for-each target not an array returns error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				step("loop", {
					type: "for-each",
					params: {
						target: { type: "literal", value: "not-an-array" },
						itemName: "item",
						loopBodyStepId: "body",
					},
				}),
				step("body", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.message).toContain("must be an array");
		expect(result.error?.code).toBe("FOREACH_TARGET_NOT_ARRAY");
		expect(result.error?.category).toBe("validation");
	});

	test("llm-prompt step without model returns error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				step("prompt", {
					type: "llm-prompt",
					params: {
						prompt: "Hello",
						outputFormat: { type: "object", properties: {} },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.message).toContain("no agent was provided");
		expect(result.error?.code).toBe("AGENT_NOT_PROVIDED");
		expect(result.error?.category).toBe("configuration");
	});

	test("extract-data step without model returns error", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				step("extract", {
					type: "extract-data",
					params: {
						sourceData: { type: "literal", value: "some data" },
						outputFormat: { type: "object", properties: {} },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.message).toContain("no agent was provided");
		expect(result.error?.code).toBe("AGENT_NOT_PROVIDED");
		expect(result.error?.category).toBe("configuration");
	});

	test("partial results are available even on failure", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "ok_step",
			steps: [
				step("ok_step", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "fail_step",
				}),
				step("fail_step", {
					type: "tool-call",
					params: { toolName: "failingTool", toolInput: {} },
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.stepOutputs.ok_step).toEqual({ echoed: true });
		expect(result.error?.stepId).toBe("fail_step");
	});

	test("llm-prompt API error is classified as external-service", async () => {
		const failingModel = new MockLanguageModelV3({
			doGenerate: async () => {
				const error = new Error("Service unavailable");
				Object.assign(error, {
					name: "AI_APICallError",
					statusCode: 503,
					isRetryable: true,
					data: undefined,
					url: "https://api.example.com",
					requestBodyValues: {},
					responseHeaders: {},
					responseBody: undefined,
				});
				throw error;
			},
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				step("prompt", {
					type: "llm-prompt",
					params: {
						prompt: "Hello",
						outputFormat: { type: "object", properties: {} },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: failingModel,
			retryDelayMs: 0,
		});
		expect(result.success).toBe(false);
		expect(result.error?.category).toBe("external-service");
	});

	test("extract-data API error is classified as external-service", async () => {
		const failingModel = new MockLanguageModelV3({
			doGenerate: async () => {
				const error = new Error("Service unavailable");
				Object.assign(error, {
					name: "AI_APICallError",
					statusCode: 500,
					isRetryable: true,
					data: undefined,
					url: "https://api.example.com",
					requestBodyValues: {},
					responseHeaders: {},
					responseBody: undefined,
				});
				throw error;
			},
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				step("extract", {
					type: "extract-data",
					params: {
						sourceData: { type: "literal", value: "some data" },
						outputFormat: { type: "object", properties: {} },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: failingModel,
			retryDelayMs: 0,
		});
		expect(result.success).toBe(false);
		expect(result.error?.category).toBe("external-service");
	});
});

// ─── Error Recovery ──────────────────────────────────────────────

describe("error recovery", () => {
	test("retry succeeds on second attempt", async () => {
		let callCount = 0;
		const flakyModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					throw new Error("Temporary failure");
				}
				return {
					content: [{ type: "text", text: JSON.stringify({ result: "ok" }) }],
					finishReason: { unified: "stop", raw: undefined },
					usage: {
						inputTokens: {
							total: 10,
							noCache: undefined,
							cacheRead: undefined,
							cacheWrite: undefined,
						},
						outputTokens: { total: 10, text: undefined, reasoning: undefined },
					},
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				step("prompt", {
					type: "llm-prompt",
					params: {
						prompt: "Hello",
						outputFormat: {
							type: "object",
							properties: { result: { type: "string" } },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: flakyModel,
			retryDelayMs: 0,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.prompt).toEqual({ result: "ok" });
		expect(callCount).toBe(2);
	});

	test("retry exhausted after max attempts", async () => {
		let callCount = 0;
		const alwaysFailModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				throw new Error("Always fails");
			},
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				step("prompt", {
					type: "llm-prompt",
					params: {
						prompt: "Hello",
						outputFormat: { type: "object", properties: {} },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: alwaysFailModel,
			maxRetries: 2,
			retryDelayMs: 0,
		});
		expect(result.success).toBe(false);
		// 1 initial + 2 retries = 3
		expect(callCount).toBe(3);
	});

	test("non-retryable LLM error skips recovery", async () => {
		let callCount = 0;
		const nonRetryableModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				throw new APICallError({
					message: "Auth failed",
					statusCode: 401,
					isRetryable: false,
					url: "https://api.example.com",
					requestBodyValues: {},
				});
			},
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "prompt",
			steps: [
				step("prompt", {
					type: "llm-prompt",
					params: {
						prompt: "Hello",
						outputFormat: { type: "object", properties: {} },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: nonRetryableModel,
			retryDelayMs: 0,
		});
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("LLM_API_ERROR");
		expect(callCount).toBe(1);
	});

	test("tool execution failure is not retried", async () => {
		let callCount = 0;
		const countingTools = {
			...testTools,
			countingFail: {
				...testTools.failingTool,
				execute: async (): Promise<Record<string, never>> => {
					callCount++;
					throw new Error("Tool failed");
				},
			},
		};

		const workflow: WorkflowDefinition = {
			initialStepId: "fail",
			steps: [
				step("fail", {
					type: "tool-call",
					params: { toolName: "countingFail", toolInput: {} },
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: countingTools,
			retryDelayMs: 0,
		});
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("TOOL_EXECUTION_FAILED");
		expect(callCount).toBe(1);
	});

	test("extract-data retry succeeds on second attempt", async () => {
		let callCount = 0;
		const flakyModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					throw new Error("Temporary failure");
				}
				return {
					content: [{ type: "text", text: JSON.stringify({ name: "Alice" }) }],
					finishReason: { unified: "stop", raw: undefined },
					usage: {
						inputTokens: {
							total: 10,
							noCache: undefined,
							cacheRead: undefined,
							cacheWrite: undefined,
						},
						outputTokens: { total: 10, text: undefined, reasoning: undefined },
					},
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				step("extract", {
					type: "extract-data",
					params: {
						sourceData: { type: "literal", value: "Alice is here" },
						outputFormat: {
							type: "object",
							properties: { name: { type: "string" } },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: flakyModel,
			retryDelayMs: 0,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.extract).toEqual({ name: "Alice" });
		expect(callCount).toBe(2);
	});
});

// ─── Callbacks ───────────────────────────────────────────────────

describe("callbacks", () => {
	test("onStepStart and onStepComplete fire in correct order", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "step_a",
			steps: [
				step("step_a", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "step_b",
				}),
				step("step_b", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "Test" },
						},
					},
				}),
			],
		};

		const events: string[] = [];
		const result = await executeWorkflow(workflow, {
			tools: testTools,
			onStepStart: (stepId) => events.push(`start:${stepId}`),
			onStepComplete: (stepId, output) => {
				events.push(`complete:${stepId}`);
				// Verify output is passed correctly
				if (stepId === "step_a") {
					expect(output).toEqual({ echoed: true });
				}
			},
		});

		expect(result.success).toBe(true);
		expect(events).toEqual([
			"start:step_a",
			"complete:step_a",
			"start:step_b",
			"complete:step_b",
		]);
	});

	test("callbacks fire for all step types including sub-chains", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "loop",
			steps: [
				step("loop", {
					type: "for-each",
					params: {
						target: { type: "literal", value: ["x"] },
						itemName: "item",
						loopBodyStepId: "body",
					},
				}),
				step("body", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
				}),
			],
		};

		const started: string[] = [];
		const completed: string[] = [];
		await executeWorkflow(workflow, {
			tools: testTools,
			onStepStart: (id) => started.push(id),
			onStepComplete: (id) => completed.push(id),
		});

		// for-each starts, body runs inside it, then for-each completes
		expect(started).toEqual(["loop", "body"]);
		expect(completed).toEqual(["body", "loop"]);
	});
});

// ─── LLM Steps ───────────────────────────────────────────────────

describe("llm steps", () => {
	test("llm-prompt step with template interpolation", async () => {
		const mockModel = createMockModel([{ summary: "Three items found" }]);

		const workflow: WorkflowDefinition = {
			initialStepId: "fetch",
			steps: [
				step("fetch", {
					type: "tool-call",
					params: { toolName: "getItems", toolInput: {} },
					nextStepId: "summarize",
				}),
				step("summarize", {
					type: "llm-prompt",
					params: {
						prompt: "Summarize these items: ${fetch.items}",
						outputFormat: {
							type: "object",
							properties: {
								summary: { type: "string" },
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.summarize).toEqual({
			summary: "Three items found",
		});
	});

	test("llm-prompt step works with Agent interface", async () => {
		const mockAgent = createMockAgent([{ summary: "Agent response" }]);

		const workflow: WorkflowDefinition = {
			initialStepId: "summarize",
			steps: [
				step("summarize", {
					type: "llm-prompt",
					params: {
						prompt: "Summarize something",
						outputFormat: {
							type: "object",
							properties: {
								summary: { type: "string" },
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockAgent,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.summarize).toEqual({
			summary: "Agent response",
		});
	});

	test("extract-data step extracts structured data", async () => {
		const mockModel = createMockModel([{ name: "Alice", age: 30 }]);

		const workflow: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				step("extract", {
					type: "extract-data",
					params: {
						sourceData: {
							type: "literal",
							value: "Alice is 30 years old",
						},
						outputFormat: {
							type: "object",
							properties: {
								name: { type: "string" },
								age: { type: "number" },
							},
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.extract).toEqual({ name: "Alice", age: 30 });
	});
});

// ─── Integration ─────────────────────────────────────────────────

describe("integration", () => {
	test("multi-step workflow with tool calls, for-each, and switch-case", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get_data",
			steps: [
				step("get_data", {
					type: "tool-call",
					params: { toolName: "getItems", toolInput: {} },
					nextStepId: "process_all",
				}),
				step("process_all", {
					type: "for-each",
					params: {
						target: {
							type: "jmespath",
							expression: "get_data.items",
						},
						itemName: "item",
						loopBodyStepId: "classify_item",
					},
					nextStepId: "finish",
				}),
				step("classify_item", {
					type: "tool-call",
					params: {
						toolName: "classify",
						toolInput: {
							value: {
								type: "jmespath",
								expression: "item.name",
							},
						},
					},
					nextStepId: "route",
				}),
				step("route", {
					type: "switch-case",
					params: {
						switchOn: {
							type: "jmespath",
							expression: "classify_item.label",
						},
						cases: [
							{
								value: { type: "literal", value: "long" },
								branchBodyStepId: "handle_long",
							},
							{
								value: { type: "default" },
								branchBodyStepId: "handle_short",
							},
						],
					},
				}),
				step("handle_long", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: {
								type: "jmespath",
								expression: "item.name",
							},
						},
					},
				}),
				step("handle_short", {
					type: "tool-call",
					params: {
						toolName: "processItem",
						toolInput: {
							name: {
								type: "jmespath",
								expression: "item.name",
							},
						},
					},
				}),
				step("finish", {
					type: "end",
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);

		// getItems returns alpha (5 chars→long), beta (4→short), gamma (5→long)
		const loopResults = result.stepOutputs.process_all as unknown[];
		expect(loopResults).toHaveLength(3);

		// alpha → long → greet
		expect(loopResults[0]).toEqual({ greeting: "Hello, alpha!" });
		// beta → short → processItem
		expect(loopResults[1]).toEqual({ processed: "BETA" });
		// gamma → long → greet
		expect(loopResults[2]).toEqual({ greeting: "Hello, gamma!" });
	});
});

// ─── Integration: Example Tasks ─────────────────────────────────

describe("integration: example tasks", () => {
	test("order-fulfillment: for-each with multi-step switch branches", async () => {
		const task = EXAMPLE_TASKS["order-fulfillment"];
		const result = await executeWorkflow(task.workflow as WorkflowDefinition, {
			tools: task.availableTools,
		});

		expect(result.success).toBe(true);

		// Two orders processed
		const loopResults = result.stepOutputs.process_orders as unknown[];
		expect(loopResults).toHaveLength(2);

		// ORD-001 (WIDGET-A): in stock → reserve → ship → notify
		expect(result.stepOutputs.reserve_stock).toEqual({
			reservationId: "RSV-WIDGET-A-2",
		});
		expect(result.stepOutputs.ship_order).toEqual({
			trackingNumber: "TRK-ORD-001",
		});
		expect(result.stepOutputs.notify_shipped).toEqual({ sent: true });

		// ORD-002 (GADGET-B): out of stock → flag → notify backorder
		expect(result.stepOutputs.flag_order).toEqual({ flagged: true });
		expect(result.stepOutputs.notify_backorder).toEqual({ sent: true });

		// Final summary step ran
		expect(result.stepOutputs.send_summary).toEqual({ sent: true });

		// Last check_stock result is from the second iteration (GADGET-B)
		expect(result.stepOutputs.check_stock).toEqual({
			available: false,
			stock: 0,
		});
	});

	test("content-moderation: extract-data in loop with 3-branch switch and LLM summary", async () => {
		const task = EXAMPLE_TASKS["content-moderation"];
		const mockModel = createMockModel([
			// extract-data for SUB-001 (clean content)
			{ action: "approve", reason: "Positive review, no issues" },
			// extract-data for SUB-002 (offensive content)
			{ action: "reject", reason: "Contains policy violations" },
			// extract-data for SUB-003 (borderline content)
			{ action: "review", reason: "Borderline claims need verification" },
			// llm-prompt for summary report
			{
				totalProcessed: 3,
				summary: "1 approved, 1 rejected, 1 flagged for review",
			},
		]);

		const result = await executeWorkflow(task.workflow as WorkflowDefinition, {
			tools: task.availableTools,
			agent: mockModel,
		});

		expect(result.success).toBe(true);

		// Three submissions processed
		const loopResults = result.stepOutputs.moderate_all as unknown[];
		expect(loopResults).toHaveLength(3);

		// SUB-001 took "approve" branch: publish → notify
		expect(result.stepOutputs.publish).toEqual({
			publishedUrl: "https://example.com/posts/SUB-001",
		});
		expect(result.stepOutputs.notify_approved).toEqual({ sent: true });

		// SUB-002 took "reject" branch: quarantine → notify
		expect(result.stepOutputs.quarantine_rejected).toEqual({
			quarantineId: "QUA-SUB-002",
		});
		expect(result.stepOutputs.notify_rejected).toEqual({ sent: true });

		// SUB-003 took "default" branch: quarantine for review
		expect(result.stepOutputs.quarantine_review).toEqual({
			quarantineId: "QUA-SUB-003",
		});

		// Summary report generated after loop
		expect(result.stepOutputs.generate_report).toEqual({
			totalProcessed: 3,
			summary: "1 approved, 1 rejected, 1 flagged for review",
		});
	});

	test("course-assignment: nested for-each with LLM-driven inner loop", async () => {
		const task = EXAMPLE_TASKS["course-assignment"];
		const mockModel = createMockModel([
			// LLM picks courses for Alice (grade A): 2 courses
			{ selectedCourseIds: ["CS101", "MATH201"] },
			// LLM picks courses for Bob (grade B): 1 course
			{ selectedCourseIds: ["CS101"] },
		]);

		const result = await executeWorkflow(task.workflow as WorkflowDefinition, {
			tools: task.availableTools,
			agent: mockModel,
		});

		expect(result.success).toBe(true);

		// Two students processed
		const outerResults = result.stepOutputs.assign_students as unknown[];
		expect(outerResults).toHaveLength(2);

		// Inner for-each results: Alice enrolled in 2 courses, Bob in 1
		// enroll_each is overwritten per outer iteration; last value is Bob's
		const lastEnrollEach = result.stepOutputs.enroll_each as unknown[];
		expect(lastEnrollEach).toHaveLength(1);

		// Last enroll call was for Bob in CS101 (proves nested scope works)
		expect(result.stepOutputs.enroll).toEqual({
			enrolled: true,
			enrollmentId: "ENR-STU-002-CS101",
		});

		// Send schedule ran for both students (last value is Bob's)
		expect(result.stepOutputs.send_student_schedule).toEqual({
			sent: true,
		});

		// Verify the initial data fetches succeeded
		const students = result.stepOutputs.get_students as {
			students: unknown[];
		};
		expect(students.students).toHaveLength(2);
		const courses = result.stepOutputs.get_courses as {
			courses: unknown[];
		};
		expect(courses.courses).toHaveLength(3);
	});
});

// ─── Start Step ─────────────────────────────────────────────────

describe("start step", () => {
	test("inputs available via 'input' alias in scope", async () => {
		const workflow = {
			initialStepId: "entry",
			inputSchema: {
				type: "object",
				properties: { name: { type: "string" } },
			},
			steps: [
				{
					id: "entry",
					name: "Entry",
					description: "Entry point",
					type: "start",
					nextStepId: "greet_step",
				},
				{
					id: "greet_step",
					name: "Greet",
					description: "Greet by name",
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: {
								type: "jmespath",
								expression: "input.name",
							},
						},
					},
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			inputs: { name: "World" },
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.input).toEqual({ name: "World" });
		expect(result.stepOutputs.greet_step).toEqual({
			greeting: "Hello, World!",
		});
	});

	test("defaults to empty object when no inputs provided", async () => {
		const workflow = {
			initialStepId: "entry",
			steps: [
				{
					id: "entry",
					name: "Entry",
					description: "Entry point",
					type: "start",
					nextStepId: "do_work",
				},
				{
					id: "do_work",
					name: "Work",
					description: "Do work",
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.input).toEqual({});
	});

	test("validates inputs against schema and fails on mismatch", async () => {
		const workflow = {
			initialStepId: "entry",
			inputSchema: {
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
			},
			steps: [
				{
					id: "entry",
					name: "Entry",
					description: "Entry point",
					type: "start",
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			inputs: {},
		});
		expect(result.success).toBe(false);
		expect(result.error?.stepId).toBe("input");
		expect(result.error?.message).toContain("input validation failed");
	});
});

// ─── Workflow Output ─────────────────────────────────────────────

describe("workflow output", () => {
	test("end step with literal output expression", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "do_work",
			steps: [
				step("do_work", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "done",
				}),
				step("done", {
					type: "end",
					params: {
						output: { type: "literal", value: { result: "finished" } },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.output).toEqual({ result: "finished" });
	});

	test("end step with jmespath output expression", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "greet_step",
			steps: [
				step("greet_step", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "World" },
						},
					},
					nextStepId: "done",
				}),
				step("done", {
					type: "end",
					params: {
						output: {
							type: "jmespath",
							expression: "greet_step.greeting",
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.output).toBe("Hello, World!");
	});

	test("end step without output expression returns undefined (backward compat)", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "do_work",
			steps: [
				step("do_work", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "done",
				}),
				step("done", { type: "end" }),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.output).toBeUndefined();
	});

	test("output validated against outputSchema succeeds", async () => {
		const workflow = {
			initialStepId: "greet_step",
			outputSchema: {
				type: "object",
				properties: {
					greeting: { type: "string" },
				},
				required: ["greeting"],
			},
			steps: [
				step("greet_step", {
					type: "tool-call",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "World" },
						},
					},
					nextStepId: "done",
				}),
				step("done", {
					type: "end",
					params: {
						output: { type: "jmespath", expression: "greet_step" },
					},
				}),
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.output).toEqual({ greeting: "Hello, World!" });
	});

	test("output validation fails on type mismatch", async () => {
		const workflow = {
			initialStepId: "do_work",
			outputSchema: { type: "object" },
			steps: [
				step("do_work", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "done",
				}),
				step("done", {
					type: "end",
					params: {
						output: { type: "literal", value: "not an object" },
					},
				}),
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("WORKFLOW_OUTPUT_VALIDATION_FAILED");
	});

	test("output validation fails on missing required field", async () => {
		const workflow = {
			initialStepId: "do_work",
			outputSchema: {
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
			},
			steps: [
				step("do_work", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "done",
				}),
				step("done", {
					type: "end",
					params: {
						output: { type: "literal", value: {} },
					},
				}),
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("WORKFLOW_OUTPUT_VALIDATION_FAILED");
		expect(result.error?.message).toContain("missing required field(s): name");
	});

	test("branching workflow with different end step outputs", async () => {
		const workflow = {
			initialStepId: "classify_step",
			outputSchema: {
				type: "object",
				properties: { message: { type: "string" } },
				required: ["message"],
			},
			steps: [
				step("classify_step", {
					type: "tool-call",
					params: {
						toolName: "classify",
						toolInput: {
							value: { type: "literal", value: "hi" },
						},
					},
					nextStepId: "branch",
				}),
				step("branch", {
					type: "switch-case",
					params: {
						switchOn: {
							type: "jmespath",
							expression: "classify_step.label",
						},
						cases: [
							{
								value: { type: "literal", value: "short" },
								branchBodyStepId: "end_short",
							},
							{
								value: { type: "literal", value: "long" },
								branchBodyStepId: "end_long",
							},
						],
					},
				}),
				step("end_short", {
					type: "end",
					params: {
						output: {
							type: "literal",
							value: { message: "it was short" },
						},
					},
				}),
				step("end_long", {
					type: "end",
					params: {
						output: {
							type: "literal",
							value: { message: "it was long" },
						},
					},
				}),
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		// "hi" is short (length <= 4)
		expect(result.output).toEqual({ message: "it was short" });
	});

	test("no outputSchema — output still returned without validation", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "do_work",
			steps: [
				step("do_work", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "done",
				}),
				step("done", {
					type: "end",
					params: {
						output: { type: "literal", value: 42 },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.output).toBe(42);
	});

	test("output expression jmespath returns null for missing reference", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "do_work",
			steps: [
				step("do_work", {
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "done",
				}),
				step("done", {
					type: "end",
					params: {
						output: {
							type: "jmespath",
							expression: "nonexistent_step.data",
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.output).toBeNull();
	});
});

// ─── Sleep Step Tests ────────────────────────────────────────────

describe("sleep step", () => {
	test("pauses execution for a literal duration", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "start",
			steps: [
				{
					id: "start",
					name: "Start",
					description: "start",
					type: "start",
					nextStepId: "wait",
				},
				{
					id: "wait",
					name: "Wait",
					description: "wait 10ms",
					type: "sleep",
					params: {
						durationMs: { type: "literal", value: 10 },
					},
					nextStepId: "do_echo",
				},
				{
					id: "do_echo",
					name: "Echo",
					description: "echo",
					type: "tool-call",
					params: {
						toolName: "echo",
						toolInput: {},
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const start = Date.now();
		const result = await executeWorkflow(workflow, { tools: testTools });
		const elapsed = Date.now() - start;

		expect(result.success).toBe(true);
		expect(elapsed).toBeGreaterThanOrEqual(8); // allow some timing slack
		expect(result.stepOutputs.do_echo).toEqual({ echoed: true });
	});

	test("evaluates durationMs from a JMESPath expression", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "get_delay",
			steps: [
				{
					id: "get_delay",
					name: "Get delay",
					description: "get delay",
					type: "tool-call",
					params: {
						toolName: "add",
						toolInput: {
							a: { type: "literal", value: 5 },
							b: { type: "literal", value: 5 },
						},
					},
					nextStepId: "wait",
				},
				{
					id: "wait",
					name: "Wait",
					description: "wait for computed duration",
					type: "sleep",
					params: {
						durationMs: {
							type: "jmespath",
							expression: "get_delay.sum",
						},
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
	});

	test("rejects negative duration", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "wait",
			steps: [
				{
					id: "wait",
					name: "Wait",
					description: "wait negative",
					type: "sleep",
					params: {
						durationMs: { type: "literal", value: -100 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("SLEEP_INVALID_DURATION");
	});

	test("clamps duration to maxSleepMs", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "wait",
			steps: [
				{
					id: "wait",
					name: "Wait",
					description: "wait long",
					type: "sleep",
					params: {
						durationMs: { type: "literal", value: 999999 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const sleepCalls: { name: string; ms: number }[] = [];
		const result = await executeWorkflow(workflow, {
			tools: testTools,
			limits: { maxSleepMs: 50 },
			context: {
				step: (_name, fn) => fn(),
				sleep: async (name, ms) => {
					sleepCalls.push({ name, ms });
				},
				waitForCondition: async () => undefined,
			},
		});

		expect(result.success).toBe(true);
		expect(sleepCalls).toHaveLength(1);
		expect(sleepCalls[0]?.ms).toBe(50);
	});
});

// ─── Wait-for-condition Step Tests ───────────────────────────────

describe("wait-for-condition step", () => {
	let pollCount: number;

	const pollTools = {
		...testTools,
		checkStatus: tool({
			inputSchema: type({}),
			execute: async () => {
				pollCount++;
				return { ready: pollCount >= 3 };
			},
		}),
	};

	test("completes when condition is truthy on first attempt", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "wait_cond",
			steps: [
				{
					id: "check_step",
					name: "Check",
					description: "check ready",
					type: "tool-call",
					params: {
						toolName: "echo",
						toolInput: {},
					},
				},
				{
					id: "wait_cond",
					name: "Wait for condition",
					description: "wait until ready",
					type: "wait-for-condition",
					params: {
						conditionStepId: "check_step",
						condition: {
							type: "literal",
							value: true,
						},
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(true);
		expect(result.stepOutputs.wait_cond).toBe(true);
	});

	test("polls until condition becomes truthy", async () => {
		pollCount = 0;

		const workflow: WorkflowDefinition = {
			initialStepId: "wait_cond",
			steps: [
				{
					id: "check_step",
					name: "Check status",
					description: "poll status",
					type: "tool-call",
					params: {
						toolName: "checkStatus",
						toolInput: {},
					},
				},
				{
					id: "wait_cond",
					name: "Wait for ready",
					description: "wait until status is ready",
					type: "wait-for-condition",
					params: {
						conditionStepId: "check_step",
						condition: {
							type: "jmespath",
							expression: "check_step.ready",
						},
						maxAttempts: { type: "literal", value: 10 },
						intervalMs: { type: "literal", value: 1 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, { tools: pollTools });
		expect(result.success).toBe(true);
		expect(pollCount).toBe(3);
		expect(result.stepOutputs.wait_cond).toBe(true);
	});

	test("fails when max attempts exceeded", async () => {
		const neverReady = {
			...testTools,
			checkStatus: tool({
				inputSchema: type({}),
				execute: async () => ({ ready: false }),
			}),
		};

		const workflow: WorkflowDefinition = {
			initialStepId: "wait_cond",
			steps: [
				{
					id: "check_step",
					name: "Check status",
					description: "poll status",
					type: "tool-call",
					params: {
						toolName: "checkStatus",
						toolInput: {},
					},
				},
				{
					id: "wait_cond",
					name: "Wait for ready",
					description: "wait until status is ready",
					type: "wait-for-condition",
					params: {
						conditionStepId: "check_step",
						condition: {
							type: "jmespath",
							expression: "check_step.ready",
						},
						maxAttempts: { type: "literal", value: 3 },
						intervalMs: { type: "literal", value: 1 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, { tools: neverReady });
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("WAIT_CONDITION_MAX_ATTEMPTS");
	});

	test("clamps maxAttempts to maxWaitAttempts option", async () => {
		let attempts = 0;
		const countingTools = {
			...testTools,
			checkStatus: tool({
				inputSchema: type({}),
				execute: async () => {
					attempts++;
					return { ready: false };
				},
			}),
		};

		const workflow: WorkflowDefinition = {
			initialStepId: "wait_cond",
			steps: [
				{
					id: "check_step",
					name: "Check",
					description: "check",
					type: "tool-call",
					params: {
						toolName: "checkStatus",
						toolInput: {},
					},
				},
				{
					id: "wait_cond",
					name: "Wait",
					description: "wait",
					type: "wait-for-condition",
					params: {
						conditionStepId: "check_step",
						condition: {
							type: "jmespath",
							expression: "check_step.ready",
						},
						maxAttempts: { type: "literal", value: 100 },
						intervalMs: { type: "literal", value: 1 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: countingTools,
			limits: { maxAttempts: 5 },
		});
		expect(result.success).toBe(false);
		expect(attempts).toBe(5);
	});
});

// ─── DurableContext Tests ────────────────────────────────────────

describe("DurableContext injection", () => {
	test("custom context.step wraps all step executions", async () => {
		const stepCalls: string[] = [];

		const workflow: WorkflowDefinition = {
			initialStepId: "start",
			steps: [
				{
					id: "start",
					name: "Start",
					description: "start",
					type: "start",
					nextStepId: "do_echo",
				},
				{
					id: "do_echo",
					name: "Echo",
					description: "echo",
					type: "tool-call",
					params: {
						toolName: "echo",
						toolInput: {},
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			context: {
				step: async (name, fn) => {
					stepCalls.push(name);
					return fn();
				},
				sleep: async () => {},
				waitForCondition: async () => undefined,
			},
		});

		expect(result.success).toBe(true);
		expect(stepCalls).toEqual(["start", "do_echo", "end_step"]);
	});

	test("custom context.sleep is used by sleep steps", async () => {
		const sleepCalls: { name: string; ms: number }[] = [];

		const workflow: WorkflowDefinition = {
			initialStepId: "wait",
			steps: [
				{
					id: "wait",
					name: "Wait",
					description: "wait",
					type: "sleep",
					params: {
						durationMs: { type: "literal", value: 5000 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			context: {
				step: (_name, fn) => fn(),
				sleep: async (name, ms) => {
					sleepCalls.push({ name, ms });
				},
				waitForCondition: async () => undefined,
			},
		});

		expect(result.success).toBe(true);
		expect(sleepCalls).toHaveLength(1);
		expect(sleepCalls[0]).toEqual({ name: "wait", ms: 5000 });
	});

	test("context.step enables idempotent replay", async () => {
		const cache = new Map<string, unknown>();
		let toolExecutions = 0;

		const countingTools = {
			echo: tool({
				inputSchema: type({}),
				execute: async () => {
					toolExecutions++;
					return { echoed: true };
				},
			}),
		};

		const workflow: WorkflowDefinition = {
			initialStepId: "do_echo",
			steps: [
				{
					id: "do_echo",
					name: "Echo",
					description: "echo",
					type: "tool-call",
					params: {
						toolName: "echo",
						toolInput: {},
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		};

		const replayContext = {
			step: async (name: string, fn: () => Promise<unknown>) => {
				if (cache.has(name)) return cache.get(name);
				const result = await fn();
				cache.set(name, result);
				return result;
			},
			sleep: async () => {},
			waitForCondition: async () => undefined,
		};

		// First execution — tool runs
		const result1 = await executeWorkflow(workflow, {
			tools: countingTools,
			context: replayContext,
		});
		expect(result1.success).toBe(true);
		expect(toolExecutions).toBe(1);

		// Second execution — tool is replayed from cache
		toolExecutions = 0;
		const result2 = await executeWorkflow(workflow, {
			tools: countingTools,
			context: replayContext,
		});
		expect(result2.success).toBe(true);
		expect(toolExecutions).toBe(0);
		expect(result2.stepOutputs.do_echo).toEqual({ echoed: true });
	});
});

// ─── Executor Limits Tests ──────────────────────────────────────

describe("executor limits", () => {
	test("soft clamps sleep duration to limits.maxSleepMs", async () => {
		const sleepCalls: { name: string; ms: number }[] = [];
		const workflow: WorkflowDefinition = {
			initialStepId: "sleep_step",
			steps: [
				{
					id: "sleep_step",
					name: "Sleep",
					description: "sleep",
					type: "sleep",
					params: {
						durationMs: { type: "literal", value: 10_000 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			limits: { maxSleepMs: 100 },
			context: {
				step: (_name, fn) => fn(),
				sleep: async (name, ms) => {
					sleepCalls.push({ name, ms });
				},
				waitForCondition: async () => undefined,
			},
		});

		expect(result.success).toBe(true);
		expect(sleepCalls[0]?.ms).toBe(100);
	});

	test("soft clamps wait intervalMs to limits.maxSleepMs", async () => {
		let attempts = 0;
		const waitCalls: { intervalMs: number; backoffMultiplier: number }[] = [];
		const countingTools = {
			...testTools,
			checkStatus: tool({
				inputSchema: type({}),
				execute: async () => {
					attempts++;
					return { ready: attempts >= 2 };
				},
			}),
		};

		const workflow: WorkflowDefinition = {
			initialStepId: "wait_step",
			steps: [
				{
					id: "check_step",
					name: "Check",
					description: "check",
					type: "tool-call",
					params: { toolName: "checkStatus", toolInput: {} },
				},
				{
					id: "wait_step",
					name: "Wait",
					description: "wait",
					type: "wait-for-condition",
					params: {
						conditionStepId: "check_step",
						condition: {
							type: "jmespath",
							expression: "check_step.ready",
						},
						intervalMs: { type: "literal", value: 50_000 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: countingTools,
			limits: { maxSleepMs: 200 },
			context: {
				step: (_name, fn) => fn(),
				sleep: async () => {},
				waitForCondition: async (_name, checkFn, opts) => {
					waitCalls.push({
						intervalMs: opts.intervalMs,
						backoffMultiplier: opts.backoffMultiplier,
					});
					// Just run checkFn until truthy
					let result: unknown;
					for (let i = 0; i < opts.maxAttempts; i++) {
						result = await checkFn();
						if (result) return result;
					}
					return result;
				},
			},
		});

		expect(result.success).toBe(true);
		expect(waitCalls[0]?.intervalMs).toBe(200); // clamped from 50_000
	});

	test("soft clamps backoffMultiplier to range", async () => {
		let attempts = 0;
		const waitCalls: { backoffMultiplier: number }[] = [];
		const countingTools = {
			...testTools,
			checkStatus: tool({
				inputSchema: type({}),
				execute: async () => {
					attempts++;
					return { ready: attempts >= 2 };
				},
			}),
		};

		const workflow: WorkflowDefinition = {
			initialStepId: "wait_step",
			steps: [
				{
					id: "check_step",
					name: "Check",
					description: "check",
					type: "tool-call",
					params: { toolName: "checkStatus", toolInput: {} },
				},
				{
					id: "wait_step",
					name: "Wait",
					description: "wait",
					type: "wait-for-condition",
					params: {
						conditionStepId: "check_step",
						condition: {
							type: "jmespath",
							expression: "check_step.ready",
						},
						backoffMultiplier: { type: "literal", value: 5 },
					},
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: countingTools,
			limits: { maxBackoffMultiplier: 2 },
			context: {
				step: (_name, fn) => fn(),
				sleep: async () => {},
				waitForCondition: async (_name, checkFn, opts) => {
					waitCalls.push({ backoffMultiplier: opts.backoffMultiplier });
					let result: unknown;
					for (let i = 0; i < opts.maxAttempts; i++) {
						result = await checkFn();
						if (result) return result;
					}
					return result;
				},
			},
		});

		expect(result.success).toBe(true);
		expect(waitCalls[0]?.backoffMultiplier).toBe(2); // clamped from 5
	});

	test("total execution timeout fires", async () => {
		// Create a workflow where step() takes longer than maxTotalMs
		const workflow: WorkflowDefinition = {
			initialStepId: "sleep_step",
			steps: [
				{
					id: "sleep_step",
					name: "Sleep",
					description: "sleep",
					type: "sleep",
					params: {
						durationMs: { type: "literal", value: 10 },
					},
					nextStepId: "step_two",
				},
				{
					id: "step_two",
					name: "Step 2",
					description: "second step",
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			limits: { maxTotalMs: 1 }, // 1ms — will expire immediately
			context: {
				step: async (_name, fn) => {
					// Simulate some delay so total time exceeds 1ms
					await new Promise((r) => setTimeout(r, 5));
					return fn();
				},
				sleep: async () => {
					await new Promise((r) => setTimeout(r, 5));
				},
				waitForCondition: async () => undefined,
			},
		});

		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("EXECUTION_TOTAL_TIMEOUT");
	});

	test("active execution timeout fires", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "step_one",
			steps: [
				{
					id: "step_one",
					name: "Step 1",
					description: "first",
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: {
				echo: tool({
					inputSchema: type({}),
					execute: async () => {
						// Simulate slow work
						await new Promise((r) => setTimeout(r, 20));
						return { echoed: true };
					},
				}),
			},
			limits: { maxActiveMs: 1 }, // 1ms — will expire after first step
		});

		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("EXECUTION_ACTIVE_TIMEOUT");
	});

	test("defaults allow normal workflows to complete", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "step_one",
			steps: [
				{
					id: "step_one",
					name: "Step 1",
					description: "first",
					type: "tool-call",
					params: { toolName: "echo", toolInput: {} },
					nextStepId: "end_step",
				},
				{
					id: "end_step",
					name: "End",
					description: "end",
					type: "end",
				},
			],
		} as WorkflowDefinition;

		// With default limits (10 min total, 5 min active), a simple workflow should succeed
		const result = await executeWorkflow(workflow, {
			tools: testTools,
			limits: {},
		});

		expect(result.success).toBe(true);
	});
});

// ─── Agent Loop ──────────────────────────────────────────────────

describe("agent-loop", () => {
	test("basic agent-loop execution with mock model", async () => {
		const mockModel = createMockModel([
			{ summary: "Test summary", confidence: 0.95 },
		]);

		const workflow: WorkflowDefinition = {
			initialStepId: "start_step",
			steps: [
				step("start_step", { type: "start", nextStepId: "agent_step" }),
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Analyze the data and produce a summary.",
						tools: ["echo"],
						outputFormat: {
							type: "object",
							properties: {
								summary: { type: "string" },
								confidence: { type: "number" },
							},
							required: ["summary", "confidence"],
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.agent_step).toEqual({
			summary: "Test summary",
			confidence: 0.95,
		});
	});

	test("agent-loop with template interpolation in instructions", async () => {
		const mockModel = createMockModel([{ result: "processed" }]);

		const workflow: WorkflowDefinition = {
			initialStepId: "start_step",
			steps: [
				step("start_step", {
					type: "start",
					nextStepId: "get_data",
				}),
				step("get_data", {
					type: "tool-call",
					nextStepId: "agent_step",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "World" },
						},
					},
				}),
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Process the greeting: ${get_data.greeting}",
						tools: ["echo"],
						outputFormat: {
							type: "object",
							properties: { result: { type: "string" } },
							required: ["result"],
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.agent_step).toEqual({ result: "processed" });
	});

	test("agent-loop with maxSteps expression", async () => {
		const mockModel = createMockModel([{ done: true }]);

		const workflow: WorkflowDefinition = {
			initialStepId: "agent_step",
			steps: [
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Do something.",
						tools: ["echo"],
						outputFormat: {
							type: "object",
							properties: { done: { type: "boolean" } },
						},
						maxSteps: { type: "literal", value: 5 },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
	});

	test("fails when no agent provided", async () => {
		const workflow: WorkflowDefinition = {
			initialStepId: "agent_step",
			steps: [
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Do something.",
						tools: ["echo"],
						outputFormat: { type: "object" },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, { tools: testTools });
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("AGENT_NOT_PROVIDED");
	});

	test("works when agent is pre-configured Agent (tools list ignored)", async () => {
		const mockAgent = createMockAgent([{ result: "from agent" }]);

		const workflow: WorkflowDefinition = {
			initialStepId: "agent_step",
			steps: [
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Do something.",
						tools: ["echo"],
						outputFormat: {
							type: "object",
							properties: { result: { type: "string" } },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockAgent,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.agent_step).toEqual({ result: "from agent" });
	});

	test("fails when agent-loop references unknown tool", async () => {
		const mockModel = createMockModel([]);

		const workflow: WorkflowDefinition = {
			initialStepId: "agent_step",
			steps: [
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Do something.",
						tools: ["nonexistent_tool"],
						outputFormat: { type: "object" },
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("TOOL_NOT_FOUND");
	});

	test("agent-loop has probe-data and give-up tools available", async () => {
		const defaultUsage = {
			inputTokens: {
				total: 10,
				noCache: undefined,
				cacheRead: undefined,
				cacheWrite: undefined,
			},
			outputTokens: { total: 10, text: undefined, reasoning: undefined },
		};

		let callCount = 0;
		const mockModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					// Agent probes the scope data
					return {
						content: [
							{
								type: "tool-call" as const,
								toolCallId: "probe-1",
								toolName: "probe-data",
								input: JSON.stringify({ expression: "get_data" }),
							},
						],
						finishReason: {
							unified: "tool-calls" as const,
							raw: undefined,
						},
						usage: defaultUsage,
						warnings: [],
					} as LanguageModelV3GenerateResult;
				}
				// Agent responds with the final JSON
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({ result: "Hello, World!" }),
						},
					],
					finishReason: { unified: "stop" as const, raw: undefined },
					usage: defaultUsage,
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "start_step",
			steps: [
				step("start_step", {
					type: "start",
					nextStepId: "get_data",
				}),
				step("get_data", {
					type: "tool-call",
					nextStepId: "agent_step",
					params: {
						toolName: "greet",
						toolInput: {
							name: { type: "literal", value: "World" },
						},
					},
				}),
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Analyze the greeting data.",
						tools: ["echo"],
						outputFormat: {
							type: "object",
							properties: { result: { type: "string" } },
							required: ["result"],
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.agent_step).toEqual({
			result: "Hello, World!",
		});
		// Verify probe-data was called (callCount > 1 means the tool call round-trip happened)
		expect(callCount).toBe(2);
	});

	test("agent-loop give-up throws ExtractionError", async () => {
		const defaultUsage = {
			inputTokens: {
				total: 10,
				noCache: undefined,
				cacheRead: undefined,
				cacheWrite: undefined,
			},
			outputTokens: { total: 10, text: undefined, reasoning: undefined },
		};

		const mockModel = new MockLanguageModelV3({
			doGenerate: async () =>
				({
					content: [
						{
							type: "tool-call" as const,
							toolCallId: "giveup-1",
							toolName: "give-up",
							input: JSON.stringify({
								reason: "Cannot complete the research task",
							}),
						},
					],
					finishReason: {
						unified: "tool-calls" as const,
						raw: undefined,
					},
					usage: defaultUsage,
					warnings: [],
				}) as LanguageModelV3GenerateResult,
		});

		const workflow: WorkflowDefinition = {
			initialStepId: "agent_step",
			steps: [
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Research something impossible.",
						tools: ["echo"],
						outputFormat: {
							type: "object",
							properties: { result: { type: "string" } },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
			maxRetries: 0,
		});
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("EXTRACTION_GAVE_UP");
		expect(result.error?.message).toContain(
			"Cannot complete the research task",
		);
	});

	test("pre-configured Agent does not get probe-data/give-up injected", async () => {
		const mockAgent = createMockAgent([{ result: "from agent" }]);

		const workflow: WorkflowDefinition = {
			initialStepId: "agent_step",
			steps: [
				step("agent_step", {
					type: "agent-loop",
					params: {
						instructions: "Do something.",
						tools: ["echo"],
						outputFormat: {
							type: "object",
							properties: { result: { type: "string" } },
						},
					},
				}),
			],
		};

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockAgent,
		});
		expect(result.success).toBe(true);
		// Pre-configured agent works fine — no probe-data/give-up injected
		// (it uses its own tools, ignoring the step's tools list)
		expect(result.stepOutputs.agent_step).toEqual({ result: "from agent" });
	});
});

// ─── Extract-Data Probe Mode ─────────────────────────────────────

describe("extract-data probe mode", () => {
	// Helper to generate a large JSON object that exceeds 50KB
	function makeLargeData(count: number) {
		const records: Record<string, unknown>[] = [];
		for (let i = 0; i < count; i++) {
			records.push({
				id: i,
				name: `User ${i}`,
				email: `user${i}@example.com`,
				bio: "x".repeat(100),
			});
		}
		return { users: records, metadata: { total: count, page: 1 } };
	}

	const defaultUsage = {
		inputTokens: {
			total: 10,
			noCache: undefined,
			cacheRead: undefined,
			cacheWrite: undefined,
		},
		outputTokens: { total: 10, text: undefined, reasoning: undefined },
	};

	const outputFormat = {
		type: "object",
		properties: {
			total: { type: "number" },
			firstName: { type: "string" },
		},
		required: ["total", "firstName"],
	};

	function makeExtractWorkflow(sourceData: unknown) {
		return {
			initialStepId: "extract",
			steps: [
				step("extract", {
					type: "extract-data",
					params: {
						sourceData: { type: "literal", value: sourceData },
						outputFormat,
					},
				}),
			],
		} as WorkflowDefinition;
	}

	test("small data uses inline mode (no probe)", async () => {
		const mockModel = createMockModel([{ total: 2, firstName: "Alice" }]);
		const workflow = makeExtractWorkflow("Alice is first of 2 users");

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.extract).toEqual({
			total: 2,
			firstName: "Alice",
		});
	});

	test("large data activates probe mode, model submits with data", async () => {
		const largeData = makeLargeData(300); // > 50KB
		const workflow = makeExtractWorkflow(largeData);

		let callCount = 0;
		const mockModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					// First call: model probes the data
					return {
						content: [
							{
								type: "tool-call" as const,
								toolCallId: "probe-1",
								toolName: "probe-data",
								input: JSON.stringify({ expression: "metadata" }),
							},
						],
						finishReason: {
							unified: "tool-calls" as const,
							raw: undefined,
						},
						usage: defaultUsage,
						warnings: [],
					} as LanguageModelV3GenerateResult;
				}
				if (callCount === 2) {
					// Second call: model probes first user
					return {
						content: [
							{
								type: "tool-call" as const,
								toolCallId: "probe-2",
								toolName: "probe-data",
								input: JSON.stringify({ expression: "users[0].name" }),
							},
						],
						finishReason: {
							unified: "tool-calls" as const,
							raw: undefined,
						},
						usage: defaultUsage,
						warnings: [],
					} as LanguageModelV3GenerateResult;
				}
				// Third call: model submits result with data
				return {
					content: [
						{
							type: "tool-call" as const,
							toolCallId: "submit-1",
							toolName: "submit-result",
							input: JSON.stringify({
								data: { total: 300, firstName: "User 0" },
							}),
						},
					],
					finishReason: {
						unified: "tool-calls" as const,
						raw: undefined,
					},
					usage: defaultUsage,
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.extract).toEqual({
			total: 300,
			firstName: "User 0",
		});
	});

	test("large data with submit-result via expression", async () => {
		const largeData = makeLargeData(300);
		const _workflow = makeExtractWorkflow(largeData);

		const outputFormatForExpr = {
			type: "object",
			properties: {
				total: { type: "number" },
			},
			required: ["total"],
		};
		const workflowExpr: WorkflowDefinition = {
			initialStepId: "extract",
			steps: [
				step("extract", {
					type: "extract-data",
					params: {
						sourceData: { type: "literal", value: largeData },
						outputFormat: outputFormatForExpr,
					},
				}),
			],
		};

		let callCount = 0;
		const mockModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					// Model submits via expression
					return {
						content: [
							{
								type: "tool-call" as const,
								toolCallId: "submit-1",
								toolName: "submit-result",
								input: JSON.stringify({ expression: "metadata" }),
							},
						],
						finishReason: {
							unified: "tool-calls" as const,
							raw: undefined,
						},
						usage: defaultUsage,
						warnings: [],
					} as LanguageModelV3GenerateResult;
				}
				// Should not be called again
				throw new Error("Unexpected extra call");
			},
		});

		const result = await executeWorkflow(workflowExpr, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		// metadata is { total: 300, page: 1 }, which matches { total: number }
		expect(result.stepOutputs.extract).toEqual({
			total: 300,
			page: 1,
		});
	});

	test("submit-result with invalid expression retries, loop continues", async () => {
		const largeData = makeLargeData(300);
		const workflow = makeExtractWorkflow(largeData);

		let callCount = 0;
		const mockModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					// First attempt: invalid JMESPath expression
					return {
						content: [
							{
								type: "tool-call" as const,
								toolCallId: "submit-bad",
								toolName: "submit-result",
								input: JSON.stringify({ expression: "invalid[[[" }),
							},
						],
						finishReason: {
							unified: "tool-calls" as const,
							raw: undefined,
						},
						usage: defaultUsage,
						warnings: [],
					} as LanguageModelV3GenerateResult;
				}
				// Second attempt: valid submission
				return {
					content: [
						{
							type: "tool-call" as const,
							toolCallId: "submit-ok",
							toolName: "submit-result",
							input: JSON.stringify({
								data: { total: 300, firstName: "User 0" },
							}),
						},
					],
					finishReason: {
						unified: "tool-calls" as const,
						raw: undefined,
					},
					usage: defaultUsage,
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(true);
		expect(callCount).toBe(2); // retried after invalid expression
		expect(result.stepOutputs.extract).toEqual({
			total: 300,
			firstName: "User 0",
		});
	});

	test("large data with pre-configured Agent falls back to inline mode", async () => {
		const largeData = makeLargeData(300);
		const workflow = makeExtractWorkflow(largeData);

		// createMockAgent returns a pre-configured Agent (not a LanguageModel),
		// so _rawModel will be null and probe mode won't activate
		const mockAgent = createMockAgent([{ total: 300, firstName: "User 0" }]);

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockAgent,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.extract).toEqual({
			total: 300,
			firstName: "User 0",
		});
	});

	test("model calls give-up throws ExtractionError", async () => {
		const largeData = makeLargeData(300);
		const workflow = makeExtractWorkflow(largeData);

		let callCount = 0;
		const mockModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					return {
						content: [
							{
								type: "tool-call" as const,
								toolCallId: "probe-1",
								toolName: "probe-data",
								input: JSON.stringify({ expression: "metadata" }),
							},
						],
						finishReason: {
							unified: "tool-calls" as const,
							raw: undefined,
						},
						usage: defaultUsage,
						warnings: [],
					} as LanguageModelV3GenerateResult;
				}
				// Give up
				return {
					content: [
						{
							type: "tool-call" as const,
							toolCallId: "giveup-1",
							toolName: "give-up",
							input: JSON.stringify({
								reason: "The data does not contain first names",
							}),
						},
					],
					finishReason: {
						unified: "tool-calls" as const,
						raw: undefined,
					},
					usage: defaultUsage,
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
		});
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("EXTRACTION_GAVE_UP");
		expect(result.error).toBeInstanceOf(ExtractionError);
		expect((result.error as ExtractionError).reason).toBe(
			"The data does not contain first names",
		);
	});

	test("model hits step limit without submitting throws OutputQualityError", async () => {
		const largeData = makeLargeData(300);
		const workflow = makeExtractWorkflow(largeData);

		let probeCallCount = 0;
		const mockModel = new MockLanguageModelV3({
			doGenerate: async () => {
				probeCallCount++;
				return {
					content: [
						{
							type: "tool-call" as const,
							toolCallId: `probe-${probeCallCount}`,
							toolName: "probe-data",
							input: JSON.stringify({ expression: "metadata" }),
						},
					],
					finishReason: {
						unified: "tool-calls" as const,
						raw: undefined,
					},
					usage: defaultUsage,
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
			maxRetries: 0,
			limits: { probeMaxSteps: 2 },
		});
		expect(result.success).toBe(false);
		expect(result.error?.code).toBe("LLM_OUTPUT_PARSE_ERROR");
	});

	test("probe-data truncates large results", async () => {
		// Create data where a single probe returns a lot
		const largeData = makeLargeData(300);
		const workflow = makeExtractWorkflow(largeData);

		let callCount = 0;
		const mockModel = new MockLanguageModelV3({
			doGenerate: async () => {
				callCount++;
				if (callCount === 1) {
					// Probe for all users (will be huge)
					return {
						content: [
							{
								type: "tool-call" as const,
								toolCallId: "probe-all",
								toolName: "probe-data",
								input: JSON.stringify({ expression: "users" }),
							},
						],
						finishReason: {
							unified: "tool-calls" as const,
							raw: undefined,
						},
						usage: defaultUsage,
						warnings: [],
					} as LanguageModelV3GenerateResult;
				}
				// Check that the tool result was truncated by inspecting messages
				// Then submit a result
				return {
					content: [
						{
							type: "tool-call" as const,
							toolCallId: "submit-1",
							toolName: "submit-result",
							input: JSON.stringify({
								data: { total: 300, firstName: "User 0" },
							}),
						},
					],
					finishReason: {
						unified: "tool-calls" as const,
						raw: undefined,
					},
					usage: defaultUsage,
					warnings: [],
				} as LanguageModelV3GenerateResult;
			},
		});

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			agent: mockModel,
			limits: { probeResultMaxBytes: 500 },
		});
		expect(result.success).toBe(true);
	});
});
