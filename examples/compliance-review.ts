/**
 * Compliance Document Review
 *
 * Trigger: Human-initiated (manual invocation)
 *
 * A compliance officer kicks off the review when a new batch of vendor contracts
 * lands. They can provide focus context (e.g. "prioritize GDPR data handling
 * clauses") which the agent incorporates into the workflow it generates.
 *
 * Highlights:
 * - Inspectable, auditable artifacts: the workflow JSON is a permanent record
 *   of the exact process followed. Regulators or internal auditors can inspect
 *   every decision, and the workflow can be re-run deterministically.
 * - Deterministic re-execution: unlike opaque chain-of-thought, a Remora
 *   workflow can be re-run on new documents to verify the same process applies.
 * - Rich control flow: extract-data → llm-prompt → switch-case composition
 *   handles the full review lifecycle.
 *
 * Usage:
 *   bun examples/compliance-review.ts
 *   bun examples/compliance-review.ts "Focus on GDPR data handling clauses"
 *
 * The optional argument lets the compliance officer provide review context.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { tool } from "ai";
import { type } from "arktype";
import { compileWorkflow, executeWorkflow, generateWorkflow } from "../src/lib";

// ─── Model ────────────────────────────────────────────────────────

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter("anthropic/claude-haiku-4.5");

// ─── Tools ────────────────────────────────────────────────────────

const tools = {
	"get-pending-documents": tool({
		description: "Fetch vendor contracts awaiting compliance review",
		inputSchema: type({}),
		outputSchema: type({
			documents: [
				{
					id: "string",
					vendorName: "string",
					contractType: "string",
					content: "string",
				},
				"[]",
			],
		}),
		execute: async () => ({
			documents: [
				{
					id: "DOC-001",
					vendorName: "CloudStore Inc.",
					contractType: "SaaS Agreement",
					content:
						"This SaaS Agreement includes a liability cap of $500,000. The vendor provides full indemnification for IP infringement claims. Data is processed in US-East regions with AES-256 encryption at rest. Either party may terminate with 90 days written notice. The agreement auto-renews annually unless cancelled 60 days prior to renewal date.",
				},
				{
					id: "DOC-002",
					vendorName: "DataPipe Systems",
					contractType: "Data Processing Agreement",
					content:
						"Liability is capped at fees paid in the prior 12 months. No indemnification is provided by the vendor. Data may be transferred to subprocessors in any jurisdiction without prior notice. Termination requires 180 days notice and payment of remaining contract term. No auto-renewal clause.",
				},
				{
					id: "DOC-003",
					vendorName: "SecureAuth Corp",
					contractType: "Enterprise License Agreement",
					content:
						"Unlimited liability for data breaches caused by vendor negligence. Full mutual indemnification for third-party claims. All data processing occurs within customer-designated region with SOC2 Type II compliance. Either party may terminate for cause with 30 days cure period. Auto-renews for successive 1-year terms with 30-day opt-out window.",
				},
			],
		}),
	}),

	"get-compliance-policies": tool({
		description:
			"Load current organizational compliance rules and risk thresholds",
		inputSchema: type({}),
		outputSchema: type({
			policies: {
				minLiabilityCap: "string",
				requireIndemnification: "boolean",
				approvedDataRegions: ["string", "[]"],
				maxTerminationNoticeDays: "number",
				requireAutoRenewalOptOut: "boolean",
			},
		}),
		execute: async () => ({
			policies: {
				minLiabilityCap: "$1,000,000 or unlimited for data breaches",
				requireIndemnification: true,
				approvedDataRegions: ["US-East", "US-West", "EU-West"],
				maxTerminationNoticeDays: 90,
				requireAutoRenewalOptOut: true,
			},
		}),
	}),

	"stamp-approved": tool({
		description: "Mark a document as compliance-approved",
		inputSchema: type({ documentId: "string" }),
		outputSchema: type({ approved: "boolean", approvedAt: "string" }),
		execute: async ({ documentId }) => {
			console.log(`  ✅ ${documentId} stamped as approved`);
			return { approved: true, approvedAt: new Date().toISOString() };
		},
	}),

	"create-revision-request": tool({
		description: "Create a revision request with specific compliance findings",
		inputSchema: type({ documentId: "string", findings: ["string", "[]"] }),
		outputSchema: type({ requestId: "string", created: "boolean" }),
		execute: async ({ documentId, findings }) => {
			console.log(
				`  📝 ${documentId} revision requested (${findings.length} findings)`,
			);
			return { requestId: `REV-${documentId}`, created: true };
		},
	}),

	"flag-for-legal-review": tool({
		description: "Escalate a document to the legal team for review",
		inputSchema: type({ documentId: "string", reason: "unknown" }),
		outputSchema: type({ flagged: "boolean", legalTicketId: "string" }),
		execute: async ({ documentId }) => {
			console.log(`  ⚖️  ${documentId} escalated to legal`);
			return { flagged: true, legalTicketId: `LEG-${documentId}` };
		},
	}),

	"notify-requester": tool({
		description: "Notify the contract requester about the review decision",
		inputSchema: type({ documentId: "string", status: "string" }),
		outputSchema: type({ notified: "boolean" }),
		execute: async ({ documentId, status }) => {
			console.log(`  📨 ${documentId} → requester notified: "${status}"`);
			return { notified: true };
		},
	}),

	"file-audit-report": tool({
		description:
			"Archive the compliance review summary as a regulatory audit record",
		inputSchema: type({ report: "unknown" }),
		outputSchema: type({ filed: "boolean", auditId: "string" }),
		execute: async () => {
			const auditId = `AUD-${Date.now()}`;
			console.log(`  🗄️  Audit report filed: ${auditId}`);
			return { filed: true, auditId };
		},
	}),
};

// ─── Review pipeline ──────────────────────────────────────────────

async function runComplianceReview(focusContext?: string) {
	console.log("📋 Compliance review initiated by officer\n");

	if (focusContext) {
		console.log(`   Review context: "${focusContext}"\n`);
	}

	// Step 1: Agent generates workflow, incorporating the officer's focus context
	const baseTask = `Review all pending vendor contracts for compliance. For each
document, extract key terms (liability cap, indemnification, data handling provisions,
termination terms, auto-renewal) and evaluate them against our compliance policies.
Approve compliant contracts, request revisions for those with addressable issues,
and flag high-risk contracts for legal review. Notify the requester of each decision.
After reviewing all documents, generate a compliance summary with risk distribution
and file it as an audit report.`;

	const task = focusContext
		? `${baseTask}\n\nAdditional context from the compliance officer: ${focusContext}`
		: baseTask;

	const result = await generateWorkflow({ model, tools, task });

	if (!result.workflow) {
		console.error("Failed to generate workflow:", result.diagnostics);
		process.exit(1);
	}

	console.log(
		`✅ Workflow generated (${result.attempts} attempt${result.attempts > 1 ? "s" : ""})\n`,
	);

	// Step 2: Compile — the compiled workflow is itself an audit artifact
	const compiled = await compileWorkflow(result.workflow, { tools });
	const errors = compiled.diagnostics.filter((d) => d.severity === "error");
	if (errors.length > 0) {
		console.error("Compilation errors:", errors);
		process.exit(1);
	}

	// Step 3: Save the workflow as an audit artifact
	const auditPath = `compliance-review-${new Date().toISOString().slice(0, 10)}.json`;
	await Bun.write(
		auditPath,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				focusContext: focusContext ?? null,
				workflow: result.workflow,
				constrainedToolSchemas: compiled.constrainedToolSchemas,
			},
			null,
			2,
		),
	);
	console.log(`🗂️  Workflow saved as audit artifact: ${auditPath}\n`);

	// Step 4: Execute
	console.log("🚀 Executing compliance review...\n");
	const execution = await executeWorkflow(result.workflow, {
		tools,
		agent: model,
		onStepStart: (_stepId, step) => {
			console.log(`  → ${step.name} (${step.type})`);
		},
	});

	if (!execution.success) {
		console.error("\n❌ Review failed:", execution.error);
		process.exit(1);
	}

	console.log("\n✅ Compliance review complete.");
	console.log(`   Audit artifact saved to ${auditPath}`);
	console.log(
		"   This workflow can be re-run deterministically for verification.\n",
	);
}

// ─── Entry point (human-initiated via CLI) ────────────────────────

const focusContext = process.argv[2];
await runComplianceReview(focusContext);
