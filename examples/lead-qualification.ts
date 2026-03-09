/**
 * Lead Qualification Pipeline
 *
 * Trigger: Scheduled (cron)
 *
 * Runs on a schedule (e.g. every morning at 8am) to process the batch of leads
 * that accumulated since the last run. The agent authors a Remora workflow
 * tailored to the current campaign's ICP, then executes it to score, classify,
 * and route each lead.
 *
 * Highlights:
 * - LLM prompts composing with tool calls: the workflow mixes structured API
 *   calls (CRM, enrichment, Slack) with LLM judgment at scoring/qualification,
 *   with clean JMESPath data flow between them.
 * - Agent authorship: the agent can tailor qualification criteria per campaign
 *   by adjusting the LLM prompt — visible right in the workflow JSON, not
 *   buried in chain-of-thought.
 * - Inspectable artifact: the workflow can be versioned per campaign and
 *   re-run on new batches.
 *
 * Usage:
 *   bun examples/lead-qualification.ts
 *
 * Runs the pipeline once immediately (in production, you'd schedule this
 * via cron, e.g. `0 8 * * * bun examples/lead-qualification.ts`).
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
	"get-new-leads": tool({
		description: "Fetch unprocessed leads from the CRM",
		inputSchema: type({}),
		outputSchema: type({
			leads: [
				{
					id: "string",
					name: "string",
					companyDomain: "string",
					source: "string",
					email: "string",
				},
				"[]",
			],
		}),
		execute: async () => ({
			leads: [
				{
					id: "LEAD-001",
					name: "Sarah Chen",
					companyDomain: "techcorp.io",
					source: "inbound-demo-request",
					email: "sarah@techcorp.io",
				},
				{
					id: "LEAD-002",
					name: "James Wilson",
					companyDomain: "smallshop.com",
					source: "webinar-attendee",
					email: "james@smallshop.com",
				},
				{
					id: "LEAD-003",
					name: "Maria Garcia",
					companyDomain: "enterprise-global.com",
					source: "outbound-linkedin",
					email: "mgarcia@enterprise-global.com",
				},
				{
					id: "LEAD-004",
					name: "Alex Kim",
					companyDomain: "startup-ai.dev",
					source: "content-download",
					email: "alex@startup-ai.dev",
				},
			],
		}),
	}),

	"enrich-company": tool({
		description:
			"Pull firmographic data (company size, industry, funding) from enrichment API",
		inputSchema: type({ companyDomain: "string" }),
		outputSchema: type({
			companyName: "string",
			employeeCount: "number",
			industry: "string",
			annualRevenue: "string",
			fundingStage: "string",
		}),
		execute: async ({ companyDomain }) => {
			const data: Record<
				string,
				{
					companyName: string;
					employeeCount: number;
					industry: string;
					annualRevenue: string;
					fundingStage: string;
				}
			> = {
				"techcorp.io": {
					companyName: "TechCorp",
					employeeCount: 450,
					industry: "SaaS",
					annualRevenue: "$25M",
					fundingStage: "Series B",
				},
				"smallshop.com": {
					companyName: "Small Shop LLC",
					employeeCount: 8,
					industry: "Retail",
					annualRevenue: "$500K",
					fundingStage: "Bootstrapped",
				},
				"enterprise-global.com": {
					companyName: "Enterprise Global",
					employeeCount: 12000,
					industry: "Financial Services",
					annualRevenue: "$2.1B",
					fundingStage: "Public",
				},
				"startup-ai.dev": {
					companyName: "Startup AI",
					employeeCount: 35,
					industry: "AI/ML",
					annualRevenue: "$2M",
					fundingStage: "Seed",
				},
			};
			return (
				data[companyDomain] ?? {
					companyName: "Unknown",
					employeeCount: 0,
					industry: "Unknown",
					annualRevenue: "Unknown",
					fundingStage: "Unknown",
				}
			);
		},
	}),

	"assign-to-rep": tool({
		description: "Assign a lead to a sales representative based on tier",
		inputSchema: type({ leadId: "string", repTier: "string" }),
		outputSchema: type({ assignedTo: "string", repName: "string" }),
		execute: async ({ leadId, repTier }) => {
			const rep =
				repTier === "senior_ae"
					? { assignedTo: "rep-senior-01", repName: "Jessica Park (Senior AE)" }
					: { assignedTo: "rep-sdr-03", repName: "Tom Rivera (SDR)" };
			console.log(`  👤 ${leadId} → ${rep.repName}`);
			return rep;
		},
	}),

	"send-slack-notification": tool({
		description: "Send a notification to a Slack channel",
		inputSchema: type({ channel: "string", message: "string" }),
		outputSchema: type({ sent: "boolean" }),
		execute: async ({ channel, message }) => {
			console.log(`  💬 Slack ${channel}: ${message.slice(0, 80)}...`);
			return { sent: true };
		},
	}),

	"enqueue-nurture-sequence": tool({
		description: "Enqueue a lead into an automated email nurture sequence",
		inputSchema: type({ leadId: "string", sequenceType: "string" }),
		outputSchema: type({ enqueuedAt: "string", sequenceId: "string" }),
		execute: async ({ leadId, sequenceType }) => {
			console.log(`  📧 ${leadId} → ${sequenceType} nurture sequence`);
			return {
				enqueuedAt: new Date().toISOString(),
				sequenceId: `SEQ-${sequenceType}-${leadId}`,
			};
		},
	}),

	"update-dashboard": tool({
		description: "Push pipeline summary metrics to the sales dashboard",
		inputSchema: type({ reportData: "unknown" }),
		outputSchema: type({ updated: "boolean" }),
		execute: async () => {
			console.log("  📊 Dashboard updated with pipeline metrics");
			return { updated: true };
		},
	}),
};

// ─── Pipeline run ─────────────────────────────────────────────────

async function runLeadQualificationPipeline() {
	console.log("📅 Scheduled lead qualification pipeline starting...\n");

	// Step 1: Agent generates a workflow for the current campaign
	const result = await generateWorkflow({
		model,
		tools,
		task: `Qualify all new leads from the CRM. For each lead, enrich with company
firmographic data, then use LLM judgment to score (0-100) and classify into tiers:
hot (80+), warm (50-79), or cold (<50) based on this campaign's ICP:
- Target: SaaS/tech companies, 100-5000 employees, Series A+ funding
- Bonus: inbound demo requests score higher than outbound

Assign hot leads to a senior AE (repTier "senior_ae") and notify #hot-leads on Slack.
Assign warm leads to an SDR (repTier "sdr") and enqueue a "standard" nurture sequence.
For cold leads, enqueue a "long-term" drip sequence.
After processing all leads, generate a pipeline summary with conversion projections
and update the dashboard.`,
	});

	if (!result.workflow) {
		console.error("Failed to generate workflow:", result.diagnostics);
		process.exit(1);
	}

	console.log(
		`✅ Workflow generated (${result.attempts} attempt${result.attempts > 1 ? "s" : ""})\n`,
	);

	// Step 2: Print the workflow as a versioned artifact
	console.log("📋 Workflow definition (versionable JSON artifact):");
	console.log(
		`${JSON.stringify(result.workflow, null, 2).slice(0, 500)}\n  ...\n`,
	);

	// Step 3: Compile and show constrained schemas
	const compiled = await compileWorkflow(result.workflow, { tools });
	const errors = compiled.diagnostics.filter((d) => d.severity === "error");
	if (errors.length > 0) {
		console.error("Compilation errors:", errors);
		process.exit(1);
	}

	// Step 4: Execute
	console.log("🚀 Executing pipeline...\n");
	const execution = await executeWorkflow(result.workflow, {
		tools,
		agent: model,
		onStepStart: (_stepId, step) => {
			console.log(`  → ${step.name} (${step.type})`);
		},
	});

	if (!execution.success) {
		console.error("\n❌ Pipeline failed:", execution.error);
		process.exit(1);
	}

	console.log("\n✅ Lead qualification pipeline complete.");
	console.log(`   Processed leads and updated dashboard.\n`);
}

// ─── Entry point (would be triggered by cron in production) ──────

await runLeadQualificationPipeline();
