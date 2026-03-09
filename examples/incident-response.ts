/**
 * Security Incident Response Triage
 *
 * Trigger: Event-driven (webhook)
 *
 * A SIEM or monitoring system fires a webhook when alerts breach a threshold.
 * An agent authors and executes a Remora workflow in response, triaging each
 * alert by severity and taking graduated actions — from creating tickets to
 * quarantining hosts and paging on-call engineers.
 *
 * Highlights:
 * - Constrained tool schemas: the compiler narrows `quarantine-host` so it can
 *   only target host IDs from enrichment data, never arbitrary inputs. A human
 *   supervisor can review and approve this constrained surface before granting
 *   the agent autonomy.
 * - Event-driven execution: the workflow runs within seconds of the triggering
 *   webhook event.
 *
 * Usage:
 *   bun examples/incident-response.ts
 *
 * Then POST to http://localhost:3001/webhook/alert to trigger the workflow.
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
	"get-active-alerts": tool({
		description:
			"Get all unacknowledged security alerts from the monitoring system",
		inputSchema: type({}),
		outputSchema: type({
			alerts: [
				{
					id: "string",
					title: "string",
					source: "string",
					timestamp: "string",
				},
				"[]",
			],
		}),
		execute: async () => ({
			alerts: [
				{
					id: "ALT-001",
					title: "Brute force SSH login attempts detected",
					source: "ids",
					timestamp: "2026-03-09T02:15:00Z",
				},
				{
					id: "ALT-002",
					title: "Unusual data exfiltration volume on db-prod-03",
					source: "dlp",
					timestamp: "2026-03-09T02:18:00Z",
				},
				{
					id: "ALT-003",
					title: "Expired TLS certificate on staging endpoint",
					source: "cert-monitor",
					timestamp: "2026-03-09T02:20:00Z",
				},
				{
					id: "ALT-004",
					title: "Failed authentication spike from IP 203.0.113.42",
					source: "waf",
					timestamp: "2026-03-09T02:22:00Z",
				},
			],
		}),
	}),

	"enrich-alert": tool({
		description:
			"Enrich a security alert with context from the SIEM (affected host, user, recent activity)",
		inputSchema: type({ alertId: "string" }),
		outputSchema: type({
			hostId: "string",
			hostname: "string",
			userId: "string",
			recentActivity: "string",
			affectedService: "string",
		}),
		execute: async ({ alertId }) => {
			const data: Record<
				string,
				{
					hostId: string;
					hostname: string;
					userId: string;
					recentActivity: string;
					affectedService: string;
				}
			> = {
				"ALT-001": {
					hostId: "HOST-042",
					hostname: "bastion-prod-01",
					userId: "unknown",
					recentActivity: "1,247 failed SSH attempts in 10 minutes from 3 IPs",
					affectedService: "ssh-gateway",
				},
				"ALT-002": {
					hostId: "HOST-103",
					hostname: "db-prod-03",
					userId: "svc-etl-pipeline",
					recentActivity:
						"4.2 GB outbound transfer to unknown external IP over 15 minutes",
					affectedService: "customer-database",
				},
				"ALT-003": {
					hostId: "HOST-201",
					hostname: "staging-web-01",
					userId: "n/a",
					recentActivity:
						"TLS certificate expired 2 hours ago, 12 connection warnings logged",
					affectedService: "staging-api",
				},
				"ALT-004": {
					hostId: "HOST-042",
					hostname: "bastion-prod-01",
					userId: "unknown",
					recentActivity: "342 failed OAuth token requests in 5 minutes",
					affectedService: "auth-service",
				},
			};
			return (
				data[alertId] ?? {
					hostId: "unknown",
					hostname: "unknown",
					userId: "unknown",
					recentActivity: "No data available",
					affectedService: "unknown",
				}
			);
		},
	}),

	"quarantine-host": tool({
		description:
			"Isolate a host from the network by applying quarantine firewall rules",
		inputSchema: type({ hostId: "string" }),
		outputSchema: type({ quarantined: "boolean", ruleId: "string" }),
		execute: async ({ hostId }) => {
			console.log(`  🔒 Quarantining host ${hostId}`);
			return { quarantined: true, ruleId: `QFW-${hostId}` };
		},
	}),

	"page-security-oncall": tool({
		description: "Send an urgent page to the security on-call engineer",
		inputSchema: type({ alertId: "string", severity: "string" }),
		outputSchema: type({ paged: "boolean", oncallEngineer: "string" }),
		execute: async ({ alertId, severity }) => {
			console.log(`  📟 Paging on-call for ${alertId} (${severity})`);
			return { paged: true, oncallEngineer: "security-team-lead" };
		},
	}),

	"create-jira-ticket": tool({
		description: "Create a Jira ticket for security incident tracking",
		inputSchema: type({
			title: "string",
			priority: "string",
			description: "string",
		}),
		outputSchema: type({ ticketId: "string", url: "string" }),
		execute: async ({ title, priority }) => {
			const ticketId = `SEC-${Math.floor(Math.random() * 10000)}`;
			console.log(`  🎫 Created ${priority} ticket ${ticketId}: ${title}`);
			return {
				ticketId,
				url: `https://jira.example.com/browse/${ticketId}`,
			};
		},
	}),

	"send-slack-alert": tool({
		description: "Send a message to a Slack channel",
		inputSchema: type({ channel: "string", message: "string" }),
		outputSchema: type({ sent: "boolean" }),
		execute: async ({ channel, message }) => {
			console.log(`  💬 Slack ${channel}: ${message.slice(0, 80)}...`);
			return { sent: true };
		},
	}),
};

// ─── Workflow generation + execution ──────────────────────────────

async function handleIncidentWebhook() {
	console.log(
		"\n⚡ Webhook received — generating incident response workflow...\n",
	);

	// Step 1: Agent generates the workflow
	const result = await generateWorkflow({
		model,
		tools,
		task: `Triage all unacknowledged security alerts. For each alert, enrich it
with SIEM context, then classify severity as critical, high, medium, or low.
For critical alerts, quarantine the affected host and page the security on-call.
For high alerts, create a P1 Jira ticket and alert the #security Slack channel.
For medium/low alerts, create a P3 Jira ticket. After processing all alerts,
generate an incident summary and post it to #security-digest.`,
	});

	if (!result.workflow) {
		console.error("Failed to generate workflow:", result.diagnostics);
		return { success: false, error: "Workflow generation failed" };
	}

	console.log(
		`✅ Workflow generated (${result.attempts} attempt${result.attempts > 1 ? "s" : ""})\n`,
	);

	// Step 2: Compile to inspect constrained tool schemas
	const compiled = await compileWorkflow(result.workflow, { tools });
	console.log("🔒 Constrained tool schemas:");
	for (const [toolName, schema] of Object.entries(
		compiled.constrainedToolSchemas,
	)) {
		const params = Object.keys(
			(schema.inputSchema as Record<string, unknown>).properties ?? {},
		);
		const constrained = Object.entries(
			(schema.inputSchema as Record<string, unknown>).properties ?? {},
		)
			.filter(
				([_, v]) =>
					(v as Record<string, unknown>).const !== undefined ||
					(v as Record<string, unknown>).enum !== undefined,
			)
			.map(([k]) => k);

		console.log(
			`   ${toolName}(${params.join(", ")}) — static: [${constrained.join(", ") || "none"}]`,
		);
	}
	console.log();

	// Step 3: Execute the workflow
	console.log("🚀 Executing workflow...\n");
	const execution = await executeWorkflow(result.workflow, {
		tools,
		agent: model,
		onStepStart: (_stepId, step) => {
			console.log(`  → ${step.name} (${step.type})`);
		},
	});

	if (!execution.success) {
		console.error("\n❌ Workflow execution failed:", execution.error);
		return { success: false, error: execution.error?.message };
	}

	console.log("\n✅ Incident response complete.");
	return { success: true, stepOutputs: execution.stepOutputs };
}

// ─── Webhook server ───────────────────────────────────────────────

Bun.serve({
	port: 3001,
	routes: {
		"/webhook/alert": {
			POST: async () => {
				const result = await handleIncidentWebhook();
				return Response.json(result, {
					status: result.success ? 200 : 500,
				});
			},
		},
	},
});

console.log(
	"🛡️  Incident Response webhook server running on http://localhost:3001",
);
console.log("   POST /webhook/alert to trigger the workflow\n");
console.log("   Example: curl -X POST http://localhost:3001/webhook/alert\n");
