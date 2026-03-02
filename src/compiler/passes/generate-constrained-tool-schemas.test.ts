import { describe, expect, test } from "bun:test";
import type { WorkflowDefinition } from "../../types";
import type { ToolDefinitionMap } from "../types";
import { generateConstrainedToolSchemas } from "./generate-constrained-tool-schemas";

// ─── Helpers ─────────────────────────────────────────────────────

function makeWorkflow(steps: WorkflowDefinition["steps"]): WorkflowDefinition {
	return {
		initialStepId: steps[0]?.id ?? "start",
		steps,
	} as WorkflowDefinition;
}

function toolCallStep(
	id: string,
	toolName: string,
	toolInput: Record<
		string,
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string }
	>,
) {
	return {
		id,
		name: id,
		description: id,
		type: "tool-call" as const,
		params: { toolName, toolInput },
	};
}

function literal(value: unknown) {
	return { type: "literal" as const, value };
}

function jmespath(expression: string) {
	return { type: "jmespath" as const, expression };
}

const baseTools: ToolDefinitionMap = {
	"send-email": {
		inputSchema: {
			required: ["to", "subject", "body"],
			properties: {
				to: { type: "string" },
				subject: { type: "string" },
				body: { type: "string" },
			},
		},
	},
	"fetch-data": {
		inputSchema: {
			properties: {},
		},
	},
	"log-event": {
		inputSchema: {
			required: ["level", "message"],
			properties: {
				level: { type: "string", enum: ["info", "warn", "error"] },
				message: { type: "string" },
				metadata: { type: "object" },
			},
		},
	},
};

// ─── Tests ───────────────────────────────────────────────────────

describe("generateConstrainedToolSchemas", () => {
	test("single tool, single call site, all literals → fullyStatic with const", () => {
		const workflow = makeWorkflow([
			toolCallStep("send", "send-email", {
				to: literal("alice@example.com"),
				subject: literal("Hello"),
				body: literal("Hi there"),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(result["send-email"]).toEqual({
			inputSchema: {
				required: ["body", "subject", "to"],
				properties: {
					to: { type: "string", const: "alice@example.com" },
					subject: { type: "string", const: "Hello" },
					body: { type: "string", const: "Hi there" },
				},
			},
			fullyStatic: true,
			callSites: ["send"],
		});
	});

	test("single tool, all jmespath → fullyStatic false, original schemas", () => {
		const workflow = makeWorkflow([
			toolCallStep("send", "send-email", {
				to: jmespath("prev.email"),
				subject: jmespath("prev.subject"),
				body: jmespath("prev.body"),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(result["send-email"]).toEqual({
			inputSchema: {
				required: ["body", "subject", "to"],
				properties: {
					to: { type: "string" },
					subject: { type: "string" },
					body: { type: "string" },
				},
			},
			fullyStatic: false,
			callSites: ["send"],
		});
	});

	test("multiple call sites, same literal value → const (not enum)", () => {
		const workflow = makeWorkflow([
			toolCallStep("send1", "send-email", {
				to: literal("alice@example.com"),
				subject: literal("Hello"),
				body: literal("Hi"),
			}),
			toolCallStep("send2", "send-email", {
				to: literal("alice@example.com"),
				subject: literal("Hello"),
				body: literal("Hi"),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(result["send-email"]?.inputSchema.properties.to).toEqual({
			type: "string",
			const: "alice@example.com",
		});
		expect(result["send-email"]?.fullyStatic).toBe(true);
		expect(result["send-email"]?.callSites).toEqual(["send1", "send2"]);
	});

	test("multiple call sites, different literal values → enum", () => {
		const workflow = makeWorkflow([
			toolCallStep("send1", "send-email", {
				to: literal("alice@example.com"),
				subject: literal("Shipped"),
				body: literal("Your order shipped."),
			}),
			toolCallStep("send2", "send-email", {
				to: literal("bob@example.com"),
				subject: literal("Backordered"),
				body: literal("Item is backordered."),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(result["send-email"]?.inputSchema.properties.to).toEqual({
			type: "string",
			enum: ["alice@example.com", "bob@example.com"],
		});
		expect(result["send-email"]?.inputSchema.properties.subject).toEqual({
			type: "string",
			enum: ["Shipped", "Backordered"],
		});
		expect(result["send-email"]?.fullyStatic).toBe(true);
	});

	test("mixed literal/jmespath for same key → original schema preserved", () => {
		const workflow = makeWorkflow([
			toolCallStep("send1", "send-email", {
				to: jmespath("prev.email"),
				subject: literal("Shipped"),
				body: literal("Done"),
			}),
			toolCallStep("send2", "send-email", {
				to: literal("bob@example.com"),
				subject: literal("Backordered"),
				body: literal("Waiting"),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		// `to` has one jmespath call site → original schema
		expect(result["send-email"]?.inputSchema.properties.to).toEqual({
			type: "string",
		});
		// `subject` is all literals → enum
		expect(result["send-email"]?.inputSchema.properties.subject).toEqual({
			type: "string",
			enum: ["Shipped", "Backordered"],
		});
		expect(result["send-email"]?.fullyStatic).toBe(false);
	});

	test("different keys across call sites → union, required only if in all", () => {
		const workflow = makeWorkflow([
			toolCallStep("log1", "log-event", {
				level: literal("info"),
				message: literal("started"),
			}),
			toolCallStep("log2", "log-event", {
				level: literal("error"),
				message: literal("failed"),
				metadata: jmespath("prev.details"),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		// level and message appear in both → required
		// metadata only in log2 → not required
		expect(result["log-event"]?.inputSchema.required).toEqual([
			"level",
			"message",
		]);
		expect(result["log-event"]?.inputSchema.properties.metadata).toEqual({
			type: "object",
		});
		expect(result["log-event"]?.fullyStatic).toBe(false);
	});

	test("empty toolInput → empty properties, fullyStatic true", () => {
		const workflow = makeWorkflow([toolCallStep("fetch", "fetch-data", {})]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(result["fetch-data"]).toEqual({
			inputSchema: {
				required: [],
				properties: {},
			},
			fullyStatic: true,
			callSites: ["fetch"],
		});
	});

	test("only referenced tools appear in output", () => {
		const workflow = makeWorkflow([toolCallStep("fetch", "fetch-data", {})]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(Object.keys(result)).toEqual(["fetch-data"]);
		expect(result["send-email"]).toBeUndefined();
		expect(result["log-event"]).toBeUndefined();
	});

	test("unknown tool (not in ToolDefinitionMap) is skipped", () => {
		const workflow = makeWorkflow([
			toolCallStep("call", "nonexistent-tool", {
				x: literal(1),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(Object.keys(result)).toEqual([]);
	});

	test("extra key not in tool schema is excluded", () => {
		const workflow = makeWorkflow([
			toolCallStep("send", "send-email", {
				to: literal("alice@example.com"),
				subject: literal("Hi"),
				body: literal("Hello"),
				extraField: literal("ignored"),
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(
			result["send-email"]?.inputSchema.properties.extraField,
		).toBeUndefined();
		expect(
			Object.keys(result["send-email"]?.inputSchema.properties ?? {}),
		).toEqual(["to", "subject", "body"]);
	});

	test("non-tool-call steps are ignored", () => {
		const workflow = makeWorkflow([
			{
				id: "start",
				name: "Start",
				description: "Start",
				type: "llm-prompt",
				params: {
					prompt: "hello",
					outputFormat: { type: "object", properties: {} },
				},
			} as unknown as WorkflowDefinition["steps"][number],
			toolCallStep("fetch", "fetch-data", {}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(Object.keys(result)).toEqual(["fetch-data"]);
	});

	test("outputSchema is passed through when present", () => {
		const toolsWithOutput: ToolDefinitionMap = {
			"my-tool": {
				inputSchema: {
					required: ["x"],
					properties: { x: { type: "string" } },
				},
				outputSchema: {
					type: "object",
					properties: { result: { type: "number" } },
				},
			},
		};

		const workflow = makeWorkflow([
			toolCallStep("call", "my-tool", { x: literal("hello") }),
		]);

		const result = generateConstrainedToolSchemas(workflow, toolsWithOutput);

		expect(result["my-tool"]?.outputSchema).toEqual({
			type: "object",
			properties: { result: { type: "number" } },
		});
	});

	test("callSites are sorted alphabetically", () => {
		const workflow = makeWorkflow([
			toolCallStep("z_step", "fetch-data", {}),
			toolCallStep("a_step", "fetch-data", {}),
			toolCallStep("m_step", "fetch-data", {}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		expect(result["fetch-data"]?.callSites).toEqual([
			"a_step",
			"m_step",
			"z_step",
		]);
	});

	test("literal deduplication handles non-primitive values", () => {
		const workflow = makeWorkflow([
			toolCallStep("log1", "log-event", {
				level: literal("info"),
				message: literal("test"),
				metadata: literal({ key: "a" }),
			}),
			toolCallStep("log2", "log-event", {
				level: literal("info"),
				message: literal("test"),
				metadata: literal({ key: "a" }), // same object
			}),
			toolCallStep("log3", "log-event", {
				level: literal("info"),
				message: literal("test"),
				metadata: literal({ key: "b" }), // different object
			}),
		]);

		const result = generateConstrainedToolSchemas(workflow, baseTools);

		// metadata should have 2 distinct values
		expect(result["log-event"]?.inputSchema.properties.metadata).toEqual({
			type: "object",
			enum: [{ key: "a" }, { key: "b" }],
		});
		expect(result["log-event"]?.fullyStatic).toBe(true);
	});
});

// ─── Integration: Example Workflows ──────────────────────────────

describe("integration with example workflows", () => {
	test("content-moderation workflow", async () => {
		const { EXAMPLE_TASKS } = await import("../../example-tasks");
		const { compileWorkflow } = await import("../index");

		const example = EXAMPLE_TASKS["content-moderation"];
		const result = await compileWorkflow(
			example.workflow as unknown as WorkflowDefinition,
			{ tools: example.availableTools },
		);

		expect(result.constrainedToolSchemas).not.toBeNull();
		const schemas = result.constrainedToolSchemas ?? {};

		// fetch-submissions: no inputs, fully static
		expect(schemas["fetch-submissions"]?.fullyStatic).toBe(true);
		expect(schemas["fetch-submissions"]?.inputSchema.properties).toEqual({});

		// publish-content: submissionId is jmespath → not static
		expect(schemas["publish-content"]?.fullyStatic).toBe(false);

		// quarantine-content: reason is jmespath in one call, literal in another
		expect(schemas["quarantine-content"]?.fullyStatic).toBe(false);
		// reason should keep original schema since one call uses jmespath
		expect(
			schemas["quarantine-content"]?.inputSchema.properties.reason,
		).toEqual({ type: "string" });

		// send-notification: userId is jmespath, message is always literal
		expect(schemas["send-notification"]?.fullyStatic).toBe(false);
		expect(
			schemas["send-notification"]?.inputSchema.properties.message,
		).toEqual({
			type: "string",
			enum: [
				"Your submission has been approved and published.",
				"Your submission has been removed for policy violations.",
			],
		});
	});

	test("order-fulfillment workflow", async () => {
		const { EXAMPLE_TASKS } = await import("../../example-tasks");
		const { compileWorkflow } = await import("../index");

		const example = EXAMPLE_TASKS["order-fulfillment"];
		const result = await compileWorkflow(
			example.workflow as unknown as WorkflowDefinition,
			{ tools: example.availableTools },
		);

		expect(result.constrainedToolSchemas).not.toBeNull();
		const schemas = result.constrainedToolSchemas ?? {};

		// get-pending-orders: no inputs
		expect(schemas["get-pending-orders"]?.fullyStatic).toBe(true);

		// check-inventory: itemId is jmespath
		expect(schemas["check-inventory"]?.fullyStatic).toBe(false);

		// notify-customer: called 3 times
		// email: 2 jmespath + 1 literal → original schema
		// subject: 3 different literals → enum
		// body: 1 jmespath + 2 literals → original schema
		expect(schemas["notify-customer"]?.inputSchema.properties.subject).toEqual({
			type: "string",
			enum: ["Order Shipped", "Backorder Notice", "Fulfillment Complete"],
		});
		expect(schemas["notify-customer"]?.inputSchema.properties.email).toEqual({
			type: "string",
		});
		expect(schemas["notify-customer"]?.inputSchema.properties.body).toEqual({
			type: "string",
		});
		expect(schemas["notify-customer"]?.fullyStatic).toBe(false);

		// flag-for-review: orderId is jmespath, reason is literal
		expect(schemas["flag-for-review"]?.inputSchema.properties.reason).toEqual({
			type: "string",
			const: "Out of stock",
		});
	});

	test("compileWorkflow without tools returns null constrainedToolSchemas", async () => {
		const { compileWorkflow } = await import("../index");

		const workflow: WorkflowDefinition = {
			initialStepId: "start",
			steps: [
				{
					id: "start",
					name: "Start",
					description: "Start",
					type: "end",
				},
			],
		} as unknown as WorkflowDefinition;

		const result = await compileWorkflow(workflow);
		expect(result.constrainedToolSchemas).toBeNull();
	});
});
