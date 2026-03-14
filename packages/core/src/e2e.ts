import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";
import { tool } from "ai";
import { type } from "arktype";
import { executeWorkflow } from "./executor";
import { generateWorkflow } from "./generator";
import type { WorkflowDefinition } from "./types";

// ─── Model Setup ────────────────────────────────────────────────

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const model = openrouter.chat(process.env.OPENROUTER_MODEL_ID ?? "");

const describeE2E = process.env.OPENROUTER_API_KEY ? describe : describe.skip;

// ═════════════════════════════════════════════════════════════════
// E2E Tests
// ═════════════════════════════════════════════════════════════════

describeE2E("e2e: LLM workflow generation and execution", () => {
	// ─────────────────────────────────────────────────────────────
	// Scenario 1: Multi-Warehouse Order Fulfillment
	//
	// Features: for-each, nested switch-case (primary → alternate
	// warehouse fallback), multi-step branch chains, post-loop
	// action, data flow through branches.
	//
	// No in-workflow LLM steps — routing is entirely deterministic
	// via tool outputs, so assertions are exact.
	// ─────────────────────────────────────────────────────────────

	describe("multi-warehouse order fulfillment", () => {
		// ── Configurable mock state ──

		let orderData: {
			orders: Array<{
				id: string;
				customerEmail: string;
				itemId: string;
				quantity: number;
			}>;
		};
		let inventoryData: Record<string, { available: boolean; stock: number }>;

		// ── Call tracking ──

		const inventoryChecks: Array<{
			itemId: string;
			warehouse: string;
		}> = [];
		const reservations: Array<{
			itemId: string;
			quantity: number;
			warehouse: string;
		}> = [];
		const shipments: Array<{ orderId: string; reservationId: string }> = [];
		const customerNotifications: Array<{
			email: string;
			subject: string;
			body: string;
		}> = [];
		const managerNotifications: Array<{ summary: string }> = [];

		// ── Tools ──

		const tools = {
			"get-pending-orders": tool({
				description:
					"Get all pending orders awaiting fulfillment. Returns an array of order objects.",
				inputSchema: type({}),
				outputSchema: type({
					orders: [
						{
							id: "string",
							customerEmail: "string",
							itemId: "string",
							quantity: "number",
						},
						"[]",
					],
				}),
				execute: async () => orderData,
			}),
			"check-inventory": tool({
				description:
					"Check current inventory for an item at a specific warehouse. The warehouse parameter must be either 'primary' or 'alternate'.",
				inputSchema: type({ itemId: "string", warehouse: "string" }),
				outputSchema: type({ available: "boolean", stock: "number" }),
				execute: async (input) => {
					inventoryChecks.push(input);
					return (
						inventoryData[`${input.warehouse}:${input.itemId}`] ?? {
							available: false,
							stock: 0,
						}
					);
				},
			}),
			"reserve-inventory": tool({
				description: "Reserve inventory for an item at a specific warehouse",
				inputSchema: type({
					itemId: "string",
					quantity: "number",
					warehouse: "string",
				}),
				outputSchema: type({ reservationId: "string" }),
				execute: async (input) => {
					reservations.push(input);
					return {
						reservationId: `RSV-${input.itemId}-${input.warehouse}`,
					};
				},
			}),
			"create-shipment": tool({
				description: "Create a shipment for a fulfilled order",
				inputSchema: type({ orderId: "string", reservationId: "string" }),
				outputSchema: type({ trackingNumber: "string" }),
				execute: async (input) => {
					shipments.push(input);
					return { trackingNumber: `TRK-${input.orderId}` };
				},
			}),
			"notify-customer": tool({
				description:
					"Send a notification email to a customer about their order status",
				inputSchema: type({
					email: "string",
					subject: "string",
					body: "string",
				}),
				outputSchema: type({ sent: "boolean" }),
				execute: async (input) => {
					customerNotifications.push(input);
					return { sent: true };
				},
			}),
			"notify-warehouse-manager": tool({
				description:
					"Send a fulfillment summary to the warehouse manager. Call this once after all orders are processed.",
				inputSchema: type({ summary: "string" }),
				outputSchema: type({ sent: "boolean" }),
				execute: async (input) => {
					managerNotifications.push(input);
					return { sent: true };
				},
			}),
		};

		// ── Generate workflow once ──

		let workflow: WorkflowDefinition;

		beforeAll(async () => {
			orderData = { orders: [] };
			inventoryData = {};

			try {
				const result = await generateWorkflow({
					model,
					tools,
					task: `Process all pending orders. For each order: first check the 'primary' warehouse for the order's item. If the item is available at the primary warehouse, reserve inventory there and create a shipment. If it is NOT available at the primary warehouse, check the 'alternate' warehouse. If available at the alternate warehouse, reserve there and create a shipment. If the item is not available at either warehouse, notify the customer that their order is backordered. After processing all orders, notify the warehouse manager with a summary.`,
					maxRetries: 5,
				});

				if (!result.workflow) {
					console.error(
						"Scenario 1 generation failed. Diagnostics:",
						result.diagnostics,
					);
				}
				expect(result.workflow).not.toBeNull();
				if (result.workflow) workflow = result.workflow;
			} catch (e) {
				console.error("Scenario 1 beforeAll error:", e);
				throw e;
			}
		}, 600_000);

		beforeEach(() => {
			inventoryChecks.length = 0;
			reservations.length = 0;
			shipments.length = 0;
			customerNotifications.length = 0;
			managerNotifications.length = 0;
		});

		const STANDARD_ORDERS = {
			orders: [
				{
					id: "ORD-1",
					customerEmail: "alice@test.com",
					itemId: "WIDGET-A",
					quantity: 2,
				},
				{
					id: "ORD-2",
					customerEmail: "bob@test.com",
					itemId: "GADGET-B",
					quantity: 1,
				},
				{
					id: "ORD-3",
					customerEmail: "carol@test.com",
					itemId: "DOOHICK-C",
					quantity: 3,
				},
			],
		};

		test("happy path: all items in stock at primary", async () => {
			orderData = STANDARD_ORDERS;
			inventoryData = {
				"primary:WIDGET-A": { available: true, stock: 50 },
				"primary:GADGET-B": { available: true, stock: 30 },
				"primary:DOOHICK-C": { available: true, stock: 20 },
			};

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			if (!result.success) {
				console.error("Execution failed:", result.error);
			}
			expect(result.success).toBe(true);

			// All 3 items checked at primary
			expect(
				inventoryChecks.filter((c) => c.warehouse === "primary"),
			).toHaveLength(3);
			// No alternate checks needed
			expect(
				inventoryChecks.filter((c) => c.warehouse === "alternate"),
			).toHaveLength(0);
			// All 3 reserved and shipped
			expect(reservations).toHaveLength(3);
			expect(shipments).toHaveLength(3);
			// Manager notified
			expect(managerNotifications).toHaveLength(1);
		}, 120_000);

		test("mixed: primary, alternate fallback, and backorder", async () => {
			orderData = STANDARD_ORDERS;
			inventoryData = {
				"primary:WIDGET-A": { available: true, stock: 50 },
				"primary:GADGET-B": { available: false, stock: 0 },
				"alternate:GADGET-B": { available: true, stock: 20 },
				"primary:DOOHICK-C": { available: false, stock: 0 },
				"alternate:DOOHICK-C": { available: false, stock: 0 },
			};

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			if (!result.success) {
				console.error("Execution failed:", result.error);
			}
			expect(result.success).toBe(true);

			// WIDGET-A reserved from primary
			expect(
				reservations.some(
					(r) => r.itemId === "WIDGET-A" && r.warehouse === "primary",
				),
			).toBe(true);
			// GADGET-B fell back to alternate
			expect(
				reservations.some(
					(r) => r.itemId === "GADGET-B" && r.warehouse === "alternate",
				),
			).toBe(true);
			// DOOHICK-C not reserved at all (backordered)
			expect(reservations.some((r) => r.itemId === "DOOHICK-C")).toBe(false);
			// 2 shipments
			expect(shipments).toHaveLength(2);
			// Carol notified about backorder
			expect(
				customerNotifications.some((n) => n.email === "carol@test.com"),
			).toBe(true);
			// Manager notified
			expect(managerNotifications).toHaveLength(1);
		}, 120_000);

		test("worst case: nothing in stock anywhere", async () => {
			orderData = STANDARD_ORDERS;
			inventoryData = {}; // Everything defaults to unavailable

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			if (!result.success) {
				console.error("Execution failed:", result.error);
			}
			expect(result.success).toBe(true);

			// All checked at primary, then all at alternate
			expect(
				inventoryChecks.filter((c) => c.warehouse === "primary"),
			).toHaveLength(3);
			expect(
				inventoryChecks.filter((c) => c.warehouse === "alternate"),
			).toHaveLength(3);
			// Nothing reserved or shipped
			expect(reservations).toHaveLength(0);
			expect(shipments).toHaveLength(0);
			// All 3 customers notified
			expect(customerNotifications).toHaveLength(3);
			// Manager notified
			expect(managerNotifications).toHaveLength(1);
		}, 120_000);

		test("empty: no pending orders", async () => {
			orderData = { orders: [] };
			inventoryData = {};

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			if (!result.success) {
				console.error("Execution failed:", result.error);
			}
			expect(result.success).toBe(true);

			// No processing
			expect(inventoryChecks).toHaveLength(0);
			expect(reservations).toHaveLength(0);
			expect(shipments).toHaveLength(0);
			expect(customerNotifications).toHaveLength(0);
			// Manager still notified (post-loop step runs for empty loop)
			expect(managerNotifications).toHaveLength(1);
		}, 120_000);
	});

	// ─────────────────────────────────────────────────────────────
	// Scenario 2: Content Publishing with Quality Gates
	//
	// Features: for-each, extract-data (real LLM extracts metadata),
	// nested switch-case (plagiarism gate → quality gate),
	// for-each inside a switch branch (social posts per platform),
	// 3 levels of nesting, post-loop LLM summary.
	// ─────────────────────────────────────────────────────────────

	describe("content publishing with quality gates", () => {
		// ── Configurable mock state ──

		let submissionData: {
			submissions: Array<{
				id: string;
				authorId: string;
				content: string;
				platforms: string[];
			}>;
		};
		let plagiarismResultFn: (content: string) => {
			isPlagiarized: boolean;
			score: number;
		};

		// ── Call tracking ──

		const plagiarismChecks: Array<{ content: string }> = [];
		const publishCalls: Array<{
			submissionId: string;
			title: string;
			category: string;
		}> = [];
		const socialPostCalls: Array<{
			platform: string;
			contentUrl: string;
			message: string;
		}> = [];
		const rejectCalls: Array<{ submissionId: string; reason: string }> = [];
		const revisionCalls: Array<{
			submissionId: string;
			feedback: string;
		}> = [];
		const archiveCalls: Array<{ submissionId: string; reason: string }> = [];

		// ── Tools ──

		const tools = {
			"get-pending-submissions": tool({
				description:
					"Get all pending content submissions for review. Returns an array of submission objects.",
				inputSchema: type({}),
				outputSchema: type({
					submissions: [
						{
							id: "string",
							authorId: "string",
							content: "string",
							platforms: ["string", "[]"],
						},
						"[]",
					],
				}),
				execute: async () => submissionData,
			}),
			"check-plagiarism": tool({
				description:
					"Check a piece of content for plagiarism. Returns whether the content is plagiarized and a similarity score.",
				inputSchema: type({ content: "string" }),
				outputSchema: type({ isPlagiarized: "boolean", score: "number" }),
				execute: async (input) => {
					plagiarismChecks.push(input);
					return plagiarismResultFn(input.content);
				},
			}),
			"publish-content": tool({
				description: "Publish approved content. Returns the published URL.",
				inputSchema: type({
					submissionId: "string",
					title: "string",
					category: "string",
				}),
				outputSchema: type({ url: "string" }),
				execute: async (input) => {
					publishCalls.push(input);
					return { url: `https://example.com/articles/${input.submissionId}` };
				},
			}),
			"schedule-social-post": tool({
				description:
					"Schedule a social media post promoting published content on a specific platform",
				inputSchema: type({
					platform: "string",
					contentUrl: "string",
					message: "string",
				}),
				outputSchema: type({ scheduled: "boolean" }),
				execute: async (input) => {
					socialPostCalls.push(input);
					return { scheduled: true };
				},
			}),
			"reject-submission": tool({
				description:
					"Reject a submission (e.g. for plagiarism or policy violation)",
				inputSchema: type({ submissionId: "string", reason: "string" }),
				outputSchema: type({ rejected: "boolean" }),
				execute: async (input) => {
					rejectCalls.push(input);
					return { rejected: true };
				},
			}),
			"request-revision": tool({
				description: "Send a revision request to the author with feedback",
				inputSchema: type({ submissionId: "string", feedback: "string" }),
				outputSchema: type({ sent: "boolean" }),
				execute: async (input) => {
					revisionCalls.push(input);
					return { sent: true };
				},
			}),
			"archive-content": tool({
				description: "Archive a submission that doesn't meet quality standards",
				inputSchema: type({ submissionId: "string", reason: "string" }),
				outputSchema: type({ archived: "boolean" }),
				execute: async (input) => {
					archiveCalls.push(input);
					return { archived: true };
				},
			}),
		};

		// ── Generate workflow once ──

		let workflow: WorkflowDefinition;

		beforeAll(async () => {
			submissionData = { submissions: [] };
			plagiarismResultFn = () => ({ isPlagiarized: false, score: 0 });

			const result = await generateWorkflow({
				model,
				tools,
				task: `Process content submissions. For each submission: first, use the LLM to extract metadata (title, category, sentiment) from the content. Then check the content for plagiarism. If plagiarized, reject the submission and skip any further evaluation. If not plagiarized, use the LLM to evaluate the content quality and decide: 'publish', 'revise', or 'reject'. If the decision is 'publish', publish the content, then schedule a social media post for each of the submission's target platforms. If 'revise', send a revision request with feedback. If 'reject', archive the content. After processing all submissions, generate an editorial summary.`,
				maxRetries: 5,
			});

			if (!result.workflow) {
				console.error(
					"Scenario 2 generation failed. Diagnostics:",
					result.diagnostics,
				);
			}
			expect(result.workflow).not.toBeNull();
			if (result.workflow) workflow = result.workflow;
		}, 600_000);

		beforeEach(() => {
			plagiarismChecks.length = 0;
			publishCalls.length = 0;
			socialPostCalls.length = 0;
			rejectCalls.length = 0;
			revisionCalls.length = 0;
			archiveCalls.length = 0;
		});

		const STANDARD_SUBMISSIONS = {
			submissions: [
				{
					id: "SUB-1",
					authorId: "AUTH-1",
					content:
						"A comprehensive analysis of renewable energy adoption in Southeast Asia: This thoroughly researched article examines the rapid growth of solar and wind power installations across the ASEAN region, supported by detailed economic data, expert interviews, and satellite imagery analysis. Solar capacity has grown 340% since 2023, with Vietnam and Thailand leading the charge.",
					platforms: ["twitter", "linkedin"],
				},
				{
					id: "SUB-2",
					authorId: "AUTH-2",
					content:
						"This content was directly stolen and plagiarized from another well-known publication. It is a word-for-word copy of an existing published article without any attribution or original contribution.",
					platforms: ["twitter"],
				},
				{
					id: "SUB-3",
					authorId: "AUTH-3",
					content:
						"Some quick thoughts on machine learning. ML is cool. You can use it for things. Neural networks exist. More info needed maybe. The end.",
					platforms: ["twitter", "linkedin", "facebook"],
				},
			],
		};

		test("all original: no plagiarism, mixed quality", async () => {
			submissionData = STANDARD_SUBMISSIONS;
			plagiarismResultFn = () => ({ isPlagiarized: false, score: 0.05 });

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			if (!result.success) {
				console.error("Scenario 2 run 1 failed:", result.error);
				console.error(
					"Step outputs:",
					JSON.stringify(result.stepOutputs, null, 2),
				);
			}
			expect(result.success).toBe(true);

			// All 3 checked for plagiarism
			expect(plagiarismChecks).toHaveLength(3);
			// Each submission got exactly one outcome action
			const totalOutcomes =
				publishCalls.length +
				rejectCalls.length +
				revisionCalls.length +
				archiveCalls.length;
			expect(totalOutcomes).toBe(3);
			// If anything was published, social posts were scheduled
			if (publishCalls.length > 0) {
				expect(socialPostCalls.length).toBeGreaterThan(0);
			}
		}, 300_000);

		test("mixed: one plagiarized, others go through quality gate", async () => {
			submissionData = STANDARD_SUBMISSIONS;
			plagiarismResultFn = (content) => {
				if (content.includes("stolen") || content.includes("plagiarized")) {
					return { isPlagiarized: true, score: 0.92 };
				}
				return { isPlagiarized: false, score: 0.08 };
			};

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			expect(result.success).toBe(true);

			// All 3 checked for plagiarism
			expect(plagiarismChecks).toHaveLength(3);
			// SUB-2 (plagiarized) must NOT have been published
			expect(publishCalls.some((c) => c.submissionId === "SUB-2")).toBe(false);
			// SUB-2 should have been rejected
			expect(rejectCalls.some((c) => c.submissionId === "SUB-2")).toBe(true);
			// The non-plagiarized submissions got some outcome
			const nonPlagiarizedOutcomes =
				publishCalls.filter((c) => c.submissionId !== "SUB-2").length +
				revisionCalls.filter((c) => c.submissionId !== "SUB-2").length +
				archiveCalls.filter((c) => c.submissionId !== "SUB-2").length;
			expect(nonPlagiarizedOutcomes).toBe(2);
		}, 300_000);

		test("all plagiarized: everything rejected, no publications", async () => {
			submissionData = STANDARD_SUBMISSIONS;
			plagiarismResultFn = () => ({ isPlagiarized: true, score: 0.95 });

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			expect(result.success).toBe(true);

			// All checked for plagiarism
			expect(plagiarismChecks).toHaveLength(3);
			// Nothing published
			expect(publishCalls).toHaveLength(0);
			// No social posts
			expect(socialPostCalls).toHaveLength(0);
			// All 3 rejected
			expect(rejectCalls).toHaveLength(3);
		}, 300_000);

		test("single high-quality submission with many platforms", async () => {
			submissionData = {
				submissions: [
					{
						id: "SUB-FEATURED",
						authorId: "AUTH-STAR",
						content:
							"EXCLUSIVE: Award-winning investigative report reveals breakthrough in quantum error correction. After three years of research across 12 institutions, scientists have achieved a 99.9% error correction rate in topological qubits, bringing practical quantum computing within reach. This peer-reviewed study, published in Nature, represents the most significant advance in quantum computing since Shor's algorithm.",
						platforms: ["twitter", "linkedin", "facebook", "instagram"],
					},
				],
			};
			plagiarismResultFn = () => ({ isPlagiarized: false, score: 0.01 });

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			expect(result.success).toBe(true);

			// Plagiarism check ran
			expect(plagiarismChecks).toHaveLength(1);
			// Not plagiarized, so not rejected via plagiarism path
			expect(rejectCalls).toHaveLength(0);
			// Exactly one quality outcome (LLM decides publish/revise/reject)
			const totalOutcomes =
				publishCalls.length + revisionCalls.length + archiveCalls.length;
			expect(totalOutcomes).toBe(1);
			// If published, social posts should match all platforms
			if (publishCalls.length === 1) {
				expect(publishCalls[0]?.submissionId).toBe("SUB-FEATURED");
				expect(socialPostCalls).toHaveLength(4);
				const platforms = new Set(socialPostCalls.map((c) => c.platform));
				expect(platforms).toEqual(
					new Set(["twitter", "linkedin", "facebook", "instagram"]),
				);
			}
		}, 300_000);
	});

	// ─────────────────────────────────────────────────────────────
	// Scenario 3: IT Incident Triage with Multi-Source Diagnosis
	// and Recovery
	//
	// Features: multiple sequential tool calls before LLM analysis
	// (2 data sources combined in one prompt), llm-prompt
	// referencing multiple prior step outputs, deeply nested
	// switch-case (severity → remediation verification),
	// error recovery pattern (attempt → verify → resolve or
	// escalate), post-loop LLM summary.
	// ─────────────────────────────────────────────────────────────

	describe("IT incident triage with diagnosis and recovery", () => {
		// ── Configurable mock state ──

		let incidentData: {
			incidents: Array<{
				id: string;
				service: string;
				description: string;
			}>;
		};
		let logData: Record<string, { logs: string; errorCount: number }>;
		let metricData: Record<
			string,
			{ cpuPercent: number; memoryPercent: number; errorRate: number }
		>;
		let remediationResults: Record<
			string,
			{ success: boolean; details: string }
		>;
		let verifyResults: Record<string, { healthy: boolean }>;

		// ── Call tracking ──

		const logChecks: Array<{ service: string }> = [];
		const metricChecks: Array<{ service: string }> = [];
		const remediations: Array<{ incidentId: string; action: string }> = [];
		const verifications: Array<{ service: string }> = [];
		const resolutions: Array<{ incidentId: string; resolution: string }> = [];
		const escalations: Array<{ incidentId: string; reason: string }> = [];
		const tickets: Array<{
			incidentId: string;
			severity: string;
			team: string;
			description: string;
		}> = [];
		const opsMessages: Array<{ channel: string; message: string }> = [];

		// ── Tools ──

		const tools = {
			"get-active-incidents": tool({
				description:
					"Get all active IT incidents requiring triage. Returns an array of incident objects.",
				inputSchema: type({}),
				outputSchema: type({
					incidents: [
						{ id: "string", service: "string", description: "string" },
						"[]",
					],
				}),
				execute: async () => incidentData,
			}),
			"check-system-logs": tool({
				description:
					"Retrieve recent system logs for a service to help diagnose issues",
				inputSchema: type({ service: "string" }),
				outputSchema: type({ logs: "string", errorCount: "number" }),
				execute: async (input) => {
					logChecks.push(input);
					return (
						logData[input.service] ?? {
							logs: "No logs available",
							errorCount: 0,
						}
					);
				},
			}),
			"check-service-metrics": tool({
				description:
					"Get current performance metrics for a service (CPU, memory, error rate)",
				inputSchema: type({ service: "string" }),
				outputSchema: type({
					cpuPercent: "number",
					memoryPercent: "number",
					errorRate: "number",
				}),
				execute: async (input) => {
					metricChecks.push(input);
					return (
						metricData[input.service] ?? {
							cpuPercent: 0,
							memoryPercent: 0,
							errorRate: 0,
						}
					);
				},
			}),
			"attempt-remediation": tool({
				description:
					"Attempt an automated remediation action for a critical incident",
				inputSchema: type({ incidentId: "string", action: "string" }),
				outputSchema: type({ success: "boolean", details: "string" }),
				execute: async (input) => {
					remediations.push(input);
					return (
						remediationResults[input.incidentId] ?? {
							success: false,
							details: "No remediation available",
						}
					);
				},
			}),
			"verify-fix": tool({
				description:
					"Verify whether a remediation fixed the issue by checking service health",
				inputSchema: type({ service: "string" }),
				outputSchema: type({ healthy: "boolean" }),
				execute: async (input) => {
					verifications.push(input);
					return verifyResults[input.service] ?? { healthy: false };
				},
			}),
			"resolve-incident": tool({
				description:
					"Mark an incident as resolved after successful remediation",
				inputSchema: type({ incidentId: "string", resolution: "string" }),
				outputSchema: type({ resolved: "boolean" }),
				execute: async (input) => {
					resolutions.push(input);
					return { resolved: true };
				},
			}),
			"escalate-incident": tool({
				description:
					"Escalate an incident to the on-call engineer when automated remediation fails",
				inputSchema: type({ incidentId: "string", reason: "string" }),
				outputSchema: type({ escalated: "boolean" }),
				execute: async (input) => {
					escalations.push(input);
					return { escalated: true };
				},
			}),
			"create-ticket": tool({
				description:
					"Create a ticket for non-critical incidents that need attention",
				inputSchema: type({
					incidentId: "string",
					severity: "string",
					team: "string",
					description: "string",
				}),
				outputSchema: type({ ticketId: "string" }),
				execute: async (input) => {
					tickets.push(input);
					return { ticketId: `TKT-${input.incidentId}` };
				},
			}),
			"send-ops-message": tool({
				description:
					"Send a message to the ops channel. Use this once after all incidents are processed to send a triage summary.",
				inputSchema: type({ channel: "string", message: "string" }),
				outputSchema: type({ sent: "boolean" }),
				execute: async (input) => {
					opsMessages.push(input);
					return { sent: true };
				},
			}),
		};

		// ── Generate workflow once ──

		let workflow: WorkflowDefinition;

		beforeAll(async () => {
			incidentData = { incidents: [] };
			logData = {};
			metricData = {};
			remediationResults = {};
			verifyResults = {};

			const result = await generateWorkflow({
				model,
				tools,
				task: `Triage all active IT incidents. For each incident: first, gather diagnostics by checking system logs AND service metrics (two separate tool calls). Then use the LLM to analyze the combined diagnostic data (logs, metrics, and incident description) to determine the severity (exactly one of: 'critical', 'high', 'medium', or 'low') and a recommended remediation action. Based on severity:
- If 'critical': attempt the recommended automated remediation, then verify the fix. If verification shows the service is healthy, resolve the incident. If not healthy, escalate to the on-call engineer.
- If 'high': create a ticket assigned to the appropriate team.
- If 'medium' or 'low': create a ticket for the backlog.
After processing all incidents, send a triage summary to the ops channel.`,
				maxRetries: 5,
			});

			if (!result.workflow) {
				console.error(
					"Scenario 3 generation failed. Diagnostics:",
					result.diagnostics,
				);
			}
			expect(result.workflow).not.toBeNull();
			if (result.workflow) workflow = result.workflow;
		}, 600_000);

		beforeEach(() => {
			logChecks.length = 0;
			metricChecks.length = 0;
			remediations.length = 0;
			verifications.length = 0;
			resolutions.length = 0;
			escalations.length = 0;
			tickets.length = 0;
			opsMessages.length = 0;
		});

		test("mixed severity: critical resolved, high and low get tickets", async () => {
			incidentData = {
				incidents: [
					{
						id: "INC-1",
						service: "payment-api",
						description:
							"Payment API returning 500 errors on all endpoints. Revenue impact: $50k/hour. All customer transactions failing.",
					},
					{
						id: "INC-2",
						service: "search-service",
						description:
							"Search results returning stale data. Users seeing results from 6 hours ago. No data loss.",
					},
					{
						id: "INC-3",
						service: "logging-agent",
						description:
							"Log collection delayed by 2 minutes. No user-facing impact. Monitoring still functional.",
					},
				],
			};
			logData = {
				"payment-api": {
					logs: "CRITICAL: Connection pool exhausted. 15,847 errors in last 5 minutes. All POST /payments returning 500. Database connections maxed out.",
					errorCount: 15847,
				},
				"search-service": {
					logs: "WARNING: Cache invalidation lag detected. Index refresh delayed. Serving stale data for 12% of queries.",
					errorCount: 23,
				},
				"logging-agent": {
					logs: "INFO: Minor collection buffer delay. Buffer at 12% capacity. All logs eventually delivered.",
					errorCount: 0,
				},
			};
			metricData = {
				"payment-api": {
					cpuPercent: 95,
					memoryPercent: 88,
					errorRate: 45,
				},
				"search-service": {
					cpuPercent: 40,
					memoryPercent: 55,
					errorRate: 5,
				},
				"logging-agent": {
					cpuPercent: 15,
					memoryPercent: 30,
					errorRate: 0.1,
				},
			};
			remediationResults = {
				"INC-1": {
					success: true,
					details: "Connection pool reset successfully",
				},
			};
			verifyResults = { "payment-api": { healthy: true } };

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			expect(result.success).toBe(true);

			// Diagnostics gathered for all 3 services
			expect(logChecks).toHaveLength(3);
			expect(metricChecks).toHaveLength(3);
			// Critical incident was remediated and verified
			expect(remediations.some((r) => r.incidentId === "INC-1")).toBe(true);
			expect(verifications.some((v) => v.service === "payment-api")).toBe(true);
			// Critical incident resolved (verification passed)
			expect(resolutions.some((r) => r.incidentId === "INC-1")).toBe(true);
			// Non-critical incidents got tickets
			expect(tickets.length).toBeGreaterThanOrEqual(2);
			// Summary sent
			expect(opsMessages).toHaveLength(1);
		}, 300_000);

		test("all critical: all remediated and verified", async () => {
			incidentData = {
				incidents: [
					{
						id: "INC-1",
						service: "service-a",
						description:
							"Service A completely unresponsive. Timeout on all requests. Customers unable to access the platform.",
					},
					{
						id: "INC-2",
						service: "service-b",
						description:
							"Service B crashing repeatedly with segfaults. Auto-restart failing. Data corruption risk.",
					},
					{
						id: "INC-3",
						service: "service-c",
						description:
							"Service C returning corrupted data on all write operations. Data integrity compromised.",
					},
				],
			};
			logData = {
				"service-a": {
					logs: "CRITICAL: Process killed by OOM killer. 50,000 errors in last 10 minutes. Zero successful requests.",
					errorCount: 50000,
				},
				"service-b": {
					logs: "CRITICAL: Segmentation fault in core module. Crash loop: 47 restarts in 5 minutes.",
					errorCount: 30000,
				},
				"service-c": {
					logs: "CRITICAL: Data corruption detected in write path. Checksums failing on 100% of writes.",
					errorCount: 25000,
				},
			};
			metricData = {
				"service-a": {
					cpuPercent: 99,
					memoryPercent: 98,
					errorRate: 100,
				},
				"service-b": {
					cpuPercent: 85,
					memoryPercent: 92,
					errorRate: 60,
				},
				"service-c": {
					cpuPercent: 92,
					memoryPercent: 80,
					errorRate: 100,
				},
			};
			remediationResults = {
				"INC-1": { success: true, details: "Process restarted" },
				"INC-2": { success: true, details: "Module reloaded" },
				"INC-3": { success: true, details: "Write path cleared" },
			};
			verifyResults = {
				"service-a": { healthy: true },
				"service-b": { healthy: true },
				"service-c": { healthy: true },
			};

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			expect(result.success).toBe(true);

			// Diagnostics for all 3
			expect(logChecks).toHaveLength(3);
			expect(metricChecks).toHaveLength(3);
			// All 3 should be remediated
			expect(remediations).toHaveLength(3);
			// All 3 verified
			expect(verifications).toHaveLength(3);
			// All should be resolved (all verifications pass)
			expect(resolutions).toHaveLength(3);
			expect(escalations).toHaveLength(0);
			// No regular tickets (all were critical)
			expect(tickets).toHaveLength(0);
			// Summary sent
			expect(opsMessages).toHaveLength(1);
		}, 300_000);

		test("all quiet: no remediation needed, only backlog tickets", async () => {
			incidentData = {
				incidents: [
					{
						id: "INC-1",
						service: "service-a",
						description:
							"Minor UI alignment issue on settings page. Cosmetic only.",
					},
					{
						id: "INC-2",
						service: "service-b",
						description:
							"Occasional slow response (>2s) on rarely used admin report. No user impact.",
					},
					{
						id: "INC-3",
						service: "service-c",
						description:
							"Deprecation warning in log output. Library update recommended at next sprint.",
					},
				],
			};
			logData = {
				"service-a": {
					logs: "INFO: All systems nominal. 0 errors in last 24 hours. Uptime: 99.99%.",
					errorCount: 0,
				},
				"service-b": {
					logs: "INFO: Running smoothly. Last error 72 hours ago. Performance within SLA.",
					errorCount: 0,
				},
				"service-c": {
					logs: "INFO: No issues detected. Deprecation notice for logging-lib v2.",
					errorCount: 0,
				},
			};
			metricData = {
				"service-a": {
					cpuPercent: 12,
					memoryPercent: 25,
					errorRate: 0,
				},
				"service-b": {
					cpuPercent: 18,
					memoryPercent: 30,
					errorRate: 0.01,
				},
				"service-c": {
					cpuPercent: 8,
					memoryPercent: 20,
					errorRate: 0,
				},
			};

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			expect(result.success).toBe(true);

			// Diagnostics gathered
			expect(logChecks).toHaveLength(3);
			expect(metricChecks).toHaveLength(3);
			// No remediation for non-critical issues
			expect(remediations).toHaveLength(0);
			expect(verifications).toHaveLength(0);
			expect(resolutions).toHaveLength(0);
			expect(escalations).toHaveLength(0);
			// All get tickets (backlog)
			expect(tickets).toHaveLength(3);
			// Summary sent
			expect(opsMessages).toHaveLength(1);
		}, 300_000);

		test("remediation fails: verification unhealthy → escalation", async () => {
			incidentData = {
				incidents: [
					{
						id: "INC-1",
						service: "payment-api",
						description:
							"Payment API completely down. All transactions failing. Revenue loss: $100k/hour. Highest priority.",
					},
				],
			};
			logData = {
				"payment-api": {
					logs: "CRITICAL: Database primary node unreachable. Failover failed. All queries timing out. 20,000 errors in 3 minutes.",
					errorCount: 20000,
				},
			};
			metricData = {
				"payment-api": {
					cpuPercent: 95,
					memoryPercent: 90,
					errorRate: 100,
				},
			};
			remediationResults = {
				"INC-1": {
					success: true,
					details: "Attempted connection pool reset",
				},
			};
			verifyResults = {
				"payment-api": { healthy: false }, // Fix didn't work!
			};

			const result = await executeWorkflow(workflow, {
				tools,
				model,
				retryDelayMs: 100,
			});
			expect(result.success).toBe(true);

			// Diagnostics gathered
			expect(logChecks).toHaveLength(1);
			expect(metricChecks).toHaveLength(1);
			// Remediation was attempted
			expect(remediations).toHaveLength(1);
			// Verification ran and showed unhealthy
			expect(verifications).toHaveLength(1);
			// NOT resolved — verification failed
			expect(resolutions).toHaveLength(0);
			// ESCALATED because fix didn't work
			expect(escalations).toHaveLength(1);
			expect(escalations[0]?.incidentId).toBe("INC-1");
			// Summary sent
			expect(opsMessages).toHaveLength(1);
		}, 300_000);
	});
});
