import { tool } from "ai";
import { type } from "arktype";

export const EXAMPLE_TASKS = {
	"ticket-review": {
		availableTools: {
			"get-open-tickets": tool({
				description: "Get all currently open support tickets",
				inputSchema: type({}),
				outputSchema: type({
					tickets: [
						{
							id: "string",
							subject: "string",
							body: "string",
							submittedAt: "string",
						},
						"[]",
					],
				}),
				execute: async () => ({
					tickets: [
						{
							id: "TKT-001",
							subject: "Production database is down",
							body: "We cannot connect to the primary database. All writes are failing. Revenue impact.",
							submittedAt: "2026-02-28T06:12:00Z",
						},
						{
							id: "TKT-002",
							subject: "Export button not working in Safari",
							body: "When I click the CSV export button in Safari 17, nothing happens. Works fine in Chrome.",
							submittedAt: "2026-02-28T07:45:00Z",
						},
						{
							id: "TKT-003",
							subject: "How do I change my billing email?",
							body: "I need to update the email address that receives our invoices.",
							submittedAt: "2026-02-28T08:03:00Z",
						},
						{
							id: "TKT-004",
							subject: "API returning 500 errors intermittently",
							body: "Our integration has been seeing ~15% error rate on POST /orders for the last 30 minutes.",
							submittedAt: "2026-02-28T08:21:00Z",
						},
					],
				}),
			}),

			"page-on-call-engineer": tool({
				description: "Send an urgent page to the on-call engineer",
				inputSchema: type({
					ticketId: "string",
					reason: "string",
				}),
				outputSchema: type({
					success: "boolean",
				}),
				execute: async ({ ticketId, reason }) => {
					console.log(`Paging on-call for ${ticketId}: ${reason}`);
					return { success: true };
				},
			}),

			"send-slack-message": tool({
				description: "Send a message to a Slack channel",
				inputSchema: type({
					channel: "string",
					message: "string",
				}),
				outputSchema: type({
					success: "boolean",
				}),
				execute: async ({ channel, message }) => {
					console.log(`Slack #${channel}: ${message}`);
					return { success: true };
				},
			}),
		},
		task: `Review all open support tickets. For each ticket, classify it as 'critical' (production impact, data loss, security, or significant revenue impact) or 'routine' (feature requests, how-to questions, minor bugs). For each critical ticket, immediately page the on-call engineer with a brief reason. After processing all tickets, send a single Slack message to the 'support-standup' channel summarizing the routine tickets so the team has a digest for their morning standup.`,
	},
};
