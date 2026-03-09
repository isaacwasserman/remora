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

	"order-fulfillment": {
		availableTools: {
			"get-pending-orders": tool({
				description: "Get all pending orders awaiting fulfillment",
				inputSchema: type({}),
				outputSchema: type({
					orders: [
						{
							id: "string",
							customerEmail: "string",
							items: [
								{ itemId: "string", name: "string", quantity: "number" },
								"[]",
							],
						},
						"[]",
					],
				}),
				execute: async () => ({
					orders: [
						{
							id: "ORD-001",
							customerEmail: "alice@example.com",
							items: [{ itemId: "WIDGET-A", name: "Widget A", quantity: 2 }],
						},
						{
							id: "ORD-002",
							customerEmail: "bob@example.com",
							items: [{ itemId: "GADGET-B", name: "Gadget B", quantity: 1 }],
						},
					],
				}),
			}),

			"check-inventory": tool({
				description: "Check current inventory for an item",
				inputSchema: type({ itemId: "string" }),
				outputSchema: type({ available: "boolean", stock: "number" }),
				execute: async ({ itemId }) => {
					const inventory: Record<
						string,
						{ available: boolean; stock: number }
					> = {
						"WIDGET-A": { available: true, stock: 50 },
						"GADGET-B": { available: false, stock: 0 },
					};
					return inventory[itemId] ?? { available: false, stock: 0 };
				},
			}),

			"reserve-inventory": tool({
				description: "Reserve inventory for an order",
				inputSchema: type({ itemId: "string", quantity: "number" }),
				outputSchema: type({ reservationId: "string" }),
				execute: async ({ itemId, quantity }) => ({
					reservationId: `RSV-${itemId}-${quantity}`,
				}),
			}),

			"create-shipment": tool({
				description: "Create a shipment for an order",
				inputSchema: type({ orderId: "string", reservationId: "string" }),
				outputSchema: type({ trackingNumber: "string" }),
				execute: async ({ orderId }) => ({
					trackingNumber: `TRK-${orderId}`,
				}),
			}),

			"notify-customer": tool({
				description: "Send a notification email to a customer",
				inputSchema: type({
					email: "string",
					subject: "string",
					body: "string",
				}),
				outputSchema: type({ sent: "boolean" }),
				execute: async () => ({ sent: true }),
			}),

			"flag-for-review": tool({
				description: "Flag an order for manual review",
				inputSchema: type({ orderId: "string", reason: "string" }),
				outputSchema: type({ flagged: "boolean" }),
				execute: async () => ({ flagged: true }),
			}),
		},
		task: "Process all pending orders. For each order, check inventory for the first item. If in stock, reserve inventory, create a shipment, and notify the customer with tracking info. If out of stock, flag the order for review and notify the customer about the backorder.",
		workflow: {
			initialStepId: "get_orders",
			steps: [
				{
					id: "get_orders",
					name: "Get Pending Orders",
					description: "Fetch all pending orders",
					type: "tool-call",
					params: { toolName: "get-pending-orders", toolInput: {} },
					nextStepId: "process_orders",
				},
				{
					id: "process_orders",
					name: "Process Each Order",
					description: "Iterate over each pending order",
					type: "for-each",
					params: {
						target: {
							type: "jmespath",
							expression: "get_orders.orders",
						},
						itemName: "order",
						loopBodyStepId: "check_stock",
					},
					nextStepId: "send_summary",
				},
				{
					id: "check_stock",
					name: "Check Inventory",
					description: "Check stock for the first item in the order",
					type: "tool-call",
					params: {
						toolName: "check-inventory",
						toolInput: {
							itemId: {
								type: "jmespath",
								expression: "order.items[0].itemId",
							},
						},
					},
					nextStepId: "stock_decision",
				},
				{
					id: "stock_decision",
					name: "Stock Decision",
					description: "Branch based on item availability",
					type: "switch-case",
					params: {
						switchOn: {
							type: "jmespath",
							expression: "check_stock.available",
						},
						cases: [
							{
								value: { type: "literal", value: true },
								branchBodyStepId: "reserve_stock",
							},
							{
								value: { type: "default" },
								branchBodyStepId: "flag_order",
							},
						],
					},
				},
				{
					id: "reserve_stock",
					name: "Reserve Inventory",
					description: "Reserve the item in inventory",
					type: "tool-call",
					params: {
						toolName: "reserve-inventory",
						toolInput: {
							itemId: {
								type: "jmespath",
								expression: "order.items[0].itemId",
							},
							quantity: {
								type: "jmespath",
								expression: "order.items[0].quantity",
							},
						},
					},
					nextStepId: "ship_order",
				},
				{
					id: "ship_order",
					name: "Create Shipment",
					description: "Create shipment with reservation",
					type: "tool-call",
					params: {
						toolName: "create-shipment",
						toolInput: {
							orderId: {
								type: "jmespath",
								expression: "order.id",
							},
							reservationId: {
								type: "jmespath",
								expression: "reserve_stock.reservationId",
							},
						},
					},
					nextStepId: "notify_shipped",
				},
				{
					id: "notify_shipped",
					name: "Notify Shipped",
					description: "Notify customer that their order shipped",
					type: "tool-call",
					params: {
						toolName: "notify-customer",
						toolInput: {
							email: {
								type: "jmespath",
								expression: "order.customerEmail",
							},
							subject: {
								type: "literal",
								value: "Order Shipped",
							},
							body: {
								type: "jmespath",
								expression: "ship_order.trackingNumber",
							},
						},
					},
				},
				{
					id: "flag_order",
					name: "Flag for Review",
					description: "Flag order as out of stock",
					type: "tool-call",
					params: {
						toolName: "flag-for-review",
						toolInput: {
							orderId: {
								type: "jmespath",
								expression: "order.id",
							},
							reason: {
								type: "literal",
								value: "Out of stock",
							},
						},
					},
					nextStepId: "notify_backorder",
				},
				{
					id: "notify_backorder",
					name: "Notify Backorder",
					description: "Notify customer about backorder",
					type: "tool-call",
					params: {
						toolName: "notify-customer",
						toolInput: {
							email: {
								type: "jmespath",
								expression: "order.customerEmail",
							},
							subject: {
								type: "literal",
								value: "Backorder Notice",
							},
							body: {
								type: "literal",
								value: "An item in your order is currently out of stock.",
							},
						},
					},
				},
				{
					id: "send_summary",
					name: "Send Summary",
					description: "Send fulfillment summary notification",
					type: "tool-call",
					params: {
						toolName: "notify-customer",
						toolInput: {
							email: {
								type: "literal",
								value: "warehouse@example.com",
							},
							subject: {
								type: "literal",
								value: "Fulfillment Complete",
							},
							body: {
								type: "literal",
								value: "All pending orders have been processed.",
							},
						},
					},
					nextStepId: "done",
				},
				{
					id: "done",
					name: "Done",
					description: "End of workflow",
					type: "end",
				},
			],
		},
	},

	"content-moderation": {
		availableTools: {
			"fetch-submissions": tool({
				description: "Fetch pending user submissions for moderation",
				inputSchema: type({}),
				outputSchema: type({
					submissions: [
						{
							id: "string",
							userId: "string",
							text: "string",
						},
						"[]",
					],
				}),
				execute: async () => ({
					submissions: [
						{
							id: "SUB-001",
							userId: "USR-001",
							text: "Great product, I highly recommend it to everyone!",
						},
						{
							id: "SUB-002",
							userId: "USR-002",
							text: "This is extremely offensive and harmful content that violates policies.",
						},
						{
							id: "SUB-003",
							userId: "USR-003",
							text: "Hmm, this post contains some borderline claims that need checking.",
						},
					],
				}),
			}),

			"publish-content": tool({
				description: "Publish approved content to the public feed",
				inputSchema: type({ submissionId: "string" }),
				outputSchema: type({ publishedUrl: "string" }),
				execute: async ({ submissionId }) => ({
					publishedUrl: `https://example.com/posts/${submissionId}`,
				}),
			}),

			"quarantine-content": tool({
				description:
					"Quarantine content that violates policies or needs review",
				inputSchema: type({ submissionId: "string", reason: "string" }),
				outputSchema: type({ quarantineId: "string" }),
				execute: async ({ submissionId }) => ({
					quarantineId: `QUA-${submissionId}`,
				}),
			}),

			"send-notification": tool({
				description: "Send a notification to a user",
				inputSchema: type({ userId: "string", message: "string" }),
				outputSchema: type({ sent: "boolean" }),
				execute: async () => ({ sent: true }),
			}),
		},
		task: "Moderate all pending user submissions. For each submission, analyze the content to determine whether it should be approved, rejected, or flagged for manual review. Approved content gets published; rejected content gets quarantined with a reason; borderline content gets quarantined for manual review. After processing all submissions, generate a moderation summary report.",
		workflow: {
			initialStepId: "fetch_content",
			steps: [
				{
					id: "fetch_content",
					name: "Fetch Submissions",
					description: "Get all pending submissions",
					type: "tool-call",
					params: { toolName: "fetch-submissions", toolInput: {} },
					nextStepId: "moderate_all",
				},
				{
					id: "moderate_all",
					name: "Moderate Each Submission",
					description: "Iterate over submissions for moderation",
					type: "for-each",
					params: {
						target: {
							type: "jmespath",
							expression: "fetch_content.submissions",
						},
						itemName: "submission",
						loopBodyStepId: "analyze_content",
					},
					nextStepId: "generate_report",
				},
				{
					id: "analyze_content",
					name: "Analyze Content",
					description: "Use LLM to extract moderation decision from submission",
					type: "extract-data",
					params: {
						sourceData: {
							type: "jmespath",
							expression: "submission.text",
						},
						outputFormat: {
							type: "object",
							properties: {
								action: {
									type: "string",
									enum: ["approve", "reject", "review"],
								},
								reason: { type: "string" },
							},
							required: ["action", "reason"],
						},
					},
					nextStepId: "route_content",
				},
				{
					id: "route_content",
					name: "Route Content",
					description: "Branch based on moderation decision",
					type: "switch-case",
					params: {
						switchOn: {
							type: "jmespath",
							expression: "analyze_content.action",
						},
						cases: [
							{
								value: { type: "literal", value: "approve" },
								branchBodyStepId: "publish",
							},
							{
								value: { type: "literal", value: "reject" },
								branchBodyStepId: "quarantine_rejected",
							},
							{
								value: { type: "default" },
								branchBodyStepId: "quarantine_review",
							},
						],
					},
				},
				{
					id: "publish",
					name: "Publish Content",
					description: "Publish the approved content",
					type: "tool-call",
					params: {
						toolName: "publish-content",
						toolInput: {
							submissionId: {
								type: "jmespath",
								expression: "submission.id",
							},
						},
					},
					nextStepId: "notify_approved",
				},
				{
					id: "notify_approved",
					name: "Notify Approved",
					description: "Notify author their content was approved",
					type: "tool-call",
					params: {
						toolName: "send-notification",
						toolInput: {
							userId: {
								type: "jmespath",
								expression: "submission.userId",
							},
							message: {
								type: "literal",
								value: "Your submission has been approved and published.",
							},
						},
					},
				},
				{
					id: "quarantine_rejected",
					name: "Quarantine Rejected",
					description: "Quarantine content that violates policies",
					type: "tool-call",
					params: {
						toolName: "quarantine-content",
						toolInput: {
							submissionId: {
								type: "jmespath",
								expression: "submission.id",
							},
							reason: {
								type: "jmespath",
								expression: "analyze_content.reason",
							},
						},
					},
					nextStepId: "notify_rejected",
				},
				{
					id: "notify_rejected",
					name: "Notify Rejected",
					description: "Notify author their content was rejected",
					type: "tool-call",
					params: {
						toolName: "send-notification",
						toolInput: {
							userId: {
								type: "jmespath",
								expression: "submission.userId",
							},
							message: {
								type: "literal",
								value:
									"Your submission has been removed for policy violations.",
							},
						},
					},
				},
				{
					id: "quarantine_review",
					name: "Quarantine for Review",
					description: "Quarantine borderline content for manual review",
					type: "tool-call",
					params: {
						toolName: "quarantine-content",
						toolInput: {
							submissionId: {
								type: "jmespath",
								expression: "submission.id",
							},
							reason: {
								type: "literal",
								value: "Flagged for manual review",
							},
						},
					},
				},
				{
					id: "generate_report",
					name: "Generate Report",
					description: "Generate a moderation summary report",
					type: "llm-prompt",
					params: {
						prompt:
							"Generate a moderation summary for ${length(moderate_all)} processed submissions.",
						outputFormat: {
							type: "object",
							properties: {
								totalProcessed: { type: "number" },
								summary: { type: "string" },
							},
							required: ["totalProcessed", "summary"],
						},
					},
					nextStepId: "moderation_done",
				},
				{
					id: "moderation_done",
					name: "Done",
					description: "End of workflow",
					type: "end",
				},
			],
		},
	},

	"course-assignment": {
		availableTools: {
			"get-students": tool({
				description: "Get list of students to assign courses to",
				inputSchema: type({}),
				outputSchema: type({
					students: [{ id: "string", name: "string", grade: "string" }, "[]"],
				}),
				execute: async () => ({
					students: [
						{ id: "STU-001", name: "Alice", grade: "A" },
						{ id: "STU-002", name: "Bob", grade: "B" },
					],
				}),
			}),

			"get-available-courses": tool({
				description: "Get list of available courses for enrollment",
				inputSchema: type({}),
				outputSchema: type({
					courses: [{ id: "string", name: "string", capacity: "number" }, "[]"],
				}),
				execute: async () => ({
					courses: [
						{ id: "CS101", name: "Intro to CS", capacity: 30 },
						{ id: "MATH201", name: "Linear Algebra", capacity: 25 },
						{ id: "ENG101", name: "English Composition", capacity: 35 },
					],
				}),
			}),

			"enroll-student": tool({
				description: "Enroll a student in a specific course",
				inputSchema: type({ studentId: "string", courseId: "string" }),
				outputSchema: type({
					enrolled: "boolean",
					enrollmentId: "string",
				}),
				execute: async ({ studentId, courseId }) => ({
					enrolled: true,
					enrollmentId: `ENR-${studentId}-${courseId}`,
				}),
			}),

			"send-schedule": tool({
				description: "Send the finalized course schedule to a student",
				inputSchema: type({
					studentId: "string",
					courseSummary: "string",
				}),
				outputSchema: type({ sent: "boolean" }),
				execute: async () => ({ sent: true }),
			}),
		},
		task: "Assign courses to all students. For each student, use the LLM to pick appropriate courses based on the student's profile and available courses. Then enroll the student in each selected course and send them their finalized schedule.",
		workflow: {
			initialStepId: "get_students",
			steps: [
				{
					id: "get_students",
					name: "Get Students",
					description: "Fetch all students needing course assignment",
					type: "tool-call",
					params: { toolName: "get-students", toolInput: {} },
					nextStepId: "get_courses",
				},
				{
					id: "get_courses",
					name: "Get Courses",
					description: "Fetch all available courses",
					type: "tool-call",
					params: {
						toolName: "get-available-courses",
						toolInput: {},
					},
					nextStepId: "assign_students",
				},
				{
					id: "assign_students",
					name: "Assign Each Student",
					description: "Iterate over students to assign courses",
					type: "for-each",
					params: {
						target: {
							type: "jmespath",
							expression: "get_students.students",
						},
						itemName: "student",
						loopBodyStepId: "pick_courses",
					},
					nextStepId: "assignment_done",
				},
				{
					id: "pick_courses",
					name: "Pick Courses",
					description: "Use LLM to select courses for a student",
					type: "llm-prompt",
					params: {
						prompt:
							"Select appropriate courses for student ${student.name} (grade: ${student.grade}). Available courses: ${get_courses.courses}. Return the IDs of selected courses.",
						outputFormat: {
							type: "object",
							properties: {
								selectedCourseIds: {
									type: "array",
									items: { type: "string" },
								},
							},
							required: ["selectedCourseIds"],
						},
					},
					nextStepId: "enroll_each",
				},
				{
					id: "enroll_each",
					name: "Enroll in Each Course",
					description: "Iterate over selected courses to enroll student",
					type: "for-each",
					params: {
						target: {
							type: "jmespath",
							expression: "pick_courses.selectedCourseIds",
						},
						itemName: "selected_course",
						loopBodyStepId: "enroll",
					},
					nextStepId: "send_student_schedule",
				},
				{
					id: "enroll",
					name: "Enroll Student",
					description: "Enroll the student in one course",
					type: "tool-call",
					params: {
						toolName: "enroll-student",
						toolInput: {
							studentId: {
								type: "jmespath",
								expression: "student.id",
							},
							courseId: {
								type: "jmespath",
								expression: "selected_course",
							},
						},
					},
				},
				{
					id: "send_student_schedule",
					name: "Send Schedule",
					description: "Send the student their course schedule",
					type: "tool-call",
					params: {
						toolName: "send-schedule",
						toolInput: {
							studentId: {
								type: "jmespath",
								expression: "student.id",
							},
							courseSummary: {
								type: "literal",
								value: "Your course enrollment is confirmed.",
							},
						},
					},
				},
				{
					id: "assignment_done",
					name: "Done",
					description: "End of workflow",
					type: "end",
				},
			],
		},
	},

	"incident-response": {
		availableTools: {
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
							recentActivity:
								"1,247 failed SSH attempts in 10 minutes from 3 IPs",
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
				execute: async ({ hostId }) => ({
					quarantined: true,
					ruleId: `QFW-${hostId}`,
				}),
			}),

			"page-security-oncall": tool({
				description: "Send an urgent page to the security on-call engineer",
				inputSchema: type({
					alertId: "string",
					severity: "string",
				}),
				outputSchema: type({ paged: "boolean", oncallEngineer: "string" }),
				execute: async () => ({
					paged: true,
					oncallEngineer: "security-team-lead",
				}),
			}),

			"create-jira-ticket": tool({
				description: "Create a Jira ticket for security incident tracking",
				inputSchema: type({
					title: "string",
					priority: "string",
					description: "string",
				}),
				outputSchema: type({ ticketId: "string", url: "string" }),
				execute: async ({ priority }) => ({
					ticketId: `SEC-${Math.floor(Math.random() * 10000)}`,
					url: `https://jira.example.com/browse/SEC-${priority}`,
				}),
			}),

			"send-slack-alert": tool({
				description: "Send a message to a Slack channel",
				inputSchema: type({
					channel: "string",
					message: "string",
				}),
				outputSchema: type({ sent: "boolean" }),
				execute: async ({ channel, message }) => {
					console.log(`Slack ${channel}: ${message}`);
					return { sent: true };
				},
			}),
		},
		task: `Triage all unacknowledged security alerts. For each alert, enrich it with SIEM context, then classify severity as critical, high, medium, or low. For critical alerts, quarantine the affected host and page the security on-call. For high alerts, create a P1 Jira ticket and alert the #security Slack channel. For medium/low alerts, create a P3 Jira ticket. After processing all alerts, generate an incident summary and post it to #security-digest.`,
	},

	"lead-qualification": {
		availableTools: {
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
				execute: async ({ repTier }) => ({
					assignedTo: repTier === "senior_ae" ? "rep-senior-01" : "rep-sdr-03",
					repName:
						repTier === "senior_ae"
							? "Jessica Park (Senior AE)"
							: "Tom Rivera (SDR)",
				}),
			}),

			"send-slack-notification": tool({
				description: "Send a notification to a Slack channel",
				inputSchema: type({ channel: "string", message: "string" }),
				outputSchema: type({ sent: "boolean" }),
				execute: async ({ channel, message }) => {
					console.log(`Slack ${channel}: ${message}`);
					return { sent: true };
				},
			}),

			"enqueue-nurture-sequence": tool({
				description: "Enqueue a lead into an automated email nurture sequence",
				inputSchema: type({ leadId: "string", sequenceType: "string" }),
				outputSchema: type({ enqueuedAt: "string", sequenceId: "string" }),
				execute: async ({ leadId, sequenceType }) => ({
					enqueuedAt: new Date().toISOString(),
					sequenceId: `SEQ-${sequenceType}-${leadId}`,
				}),
			}),

			"update-dashboard": tool({
				description: "Push pipeline summary metrics to the sales dashboard",
				inputSchema: type({ reportData: "unknown" }),
				outputSchema: type({ updated: "boolean" }),
				execute: async () => ({ updated: true }),
			}),
		},
		task: `Qualify all new leads from the CRM. For each lead, enrich with company firmographic data, then use LLM judgment to score (0-100) and classify into tiers: hot (80+), warm (50-79), or cold (<50). Assign hot leads to a senior AE and notify #hot-leads on Slack. Assign warm leads to an SDR and enqueue a nurture sequence. For cold leads, enqueue a long-term drip sequence. After processing all leads, generate a pipeline summary with conversion projections and update the dashboard.`,
	},

	"compliance-review": {
		availableTools: {
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
				execute: async () => ({
					approved: true,
					approvedAt: new Date().toISOString(),
				}),
			}),

			"create-revision-request": tool({
				description:
					"Create a revision request with specific compliance findings",
				inputSchema: type({
					documentId: "string",
					findings: ["string", "[]"],
				}),
				outputSchema: type({
					requestId: "string",
					created: "boolean",
				}),
				execute: async ({ documentId }) => ({
					requestId: `REV-${documentId}`,
					created: true,
				}),
			}),

			"flag-for-legal-review": tool({
				description: "Escalate a document to the legal team for review",
				inputSchema: type({ documentId: "string", reason: "unknown" }),
				outputSchema: type({ flagged: "boolean", legalTicketId: "string" }),
				execute: async ({ documentId }) => ({
					flagged: true,
					legalTicketId: `LEG-${documentId}`,
				}),
			}),

			"notify-requester": tool({
				description: "Notify the contract requester about the review decision",
				inputSchema: type({ documentId: "string", status: "string" }),
				outputSchema: type({ notified: "boolean" }),
				execute: async () => ({ notified: true }),
			}),

			"file-audit-report": tool({
				description:
					"Archive the compliance review summary as a regulatory audit record",
				inputSchema: type({ report: "unknown" }),
				outputSchema: type({ filed: "boolean", auditId: "string" }),
				execute: async () => ({
					filed: true,
					auditId: `AUD-${Date.now()}`,
				}),
			}),
		},
		task: `Review all pending vendor contracts for compliance. For each document, extract key terms (liability cap, indemnification, data handling provisions, termination terms, auto-renewal) and evaluate them against our compliance policies. Approve compliant contracts, request revisions for those with addressable issues, and flag high-risk contracts for legal review. Notify the requester of each decision. After reviewing all documents, generate a compliance summary with risk distribution and file it as an audit report.`,
	},
};
