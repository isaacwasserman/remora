import { describe, expect, test } from "bun:test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { APICallError, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { type } from "arktype";
import { EXAMPLE_TASKS } from "../example-tasks";
import type { WorkflowDefinition } from "../types";
import { executeWorkflow } from ".";

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
		expect(result.error?.message).toContain("no model was provided");
		expect(result.error?.code).toBe("MODEL_NOT_PROVIDED");
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
		expect(result.error?.message).toContain("no model was provided");
		expect(result.error?.code).toBe("MODEL_NOT_PROVIDED");
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
			model: failingModel,
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
			model: failingModel,
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
			model: flakyModel,
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
			model: alwaysFailModel,
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
			model: nonRetryableModel,
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
			model: flakyModel,
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
			model: mockModel,
		});
		expect(result.success).toBe(true);
		expect(result.stepOutputs.summarize).toEqual({
			summary: "Three items found",
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
			model: mockModel,
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
			model: mockModel,
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
			model: mockModel,
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
	test("outputs provided inputs to scope", async () => {
		const workflow = {
			initialStepId: "entry",
			steps: [
				{
					id: "entry",
					name: "Entry",
					description: "Entry point",
					type: "start",
					params: {
						inputSchema: {
							type: "object",
							properties: { name: { type: "string" } },
						},
					},
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
								expression: "entry.name",
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
		expect(result.stepOutputs.entry).toEqual({ name: "World" });
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
					params: { inputSchema: {} },
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
		expect(result.stepOutputs.entry).toEqual({});
	});

	test("validates inputs against schema and fails on mismatch", async () => {
		const workflow = {
			initialStepId: "entry",
			steps: [
				{
					id: "entry",
					name: "Entry",
					description: "Entry point",
					type: "start",
					params: {
						inputSchema: {
							type: "object",
							properties: { name: { type: "string" } },
							required: ["name"],
						},
					},
				},
			],
		} as WorkflowDefinition;

		const result = await executeWorkflow(workflow, {
			tools: testTools,
			inputs: {},
		});
		expect(result.success).toBe(false);
		expect(result.error?.stepId).toBe("entry");
		expect(result.error?.message).toContain("input validation failed");
	});
});
