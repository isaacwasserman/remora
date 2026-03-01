import type { WorkflowDefinition, WorkflowStep } from "./types";

const MERMAID_RESERVED = new Set([
	"end",
	"start",
	"subgraph",
	"graph",
	"flowchart",
	"direction",
	"click",
	"class",
	"classDef",
	"style",
	"linkStyle",
	"default",
]);

function sanitizeId(id: string): string {
	const sanitized = id.replace(/-/g, "_");
	if (MERMAID_RESERVED.has(sanitized.toLowerCase())) {
		return `id_${sanitized}`;
	}
	return sanitized;
}

function escapeLabel(text: string): string {
	return text.replace(/"/g, "#quot;").replace(/'/g, "#39;");
}

function renderExpression(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string },
): string {
	if (expr.type === "literal") {
		return JSON.stringify(expr.value);
	}
	return `jmespath: ${expr.expression}`;
}

function renderStepDetails(step: WorkflowStep): string {
	const lines: string[] = [step.name];

	switch (step.type) {
		case "tool-call": {
			lines.push(`tool: ${step.params.toolName}`);
			for (const [key, val] of Object.entries(step.params.toolInput)) {
				lines.push(`  ${key}: ${renderExpression(val)}`);
			}
			break;
		}
		case "llm-prompt": {
			lines.push(`prompt: ${step.params.prompt}`);
			break;
		}
		case "switch-case": {
			lines.push(`switch on: ${renderExpression(step.params.switchOn)}`);
			break;
		}
		case "for-each": {
			lines.push(`iterate: ${renderExpression(step.params.target)}`);
			lines.push(`item: ${step.params.itemName}`);
			break;
		}
		case "end": {
			break;
		}
	}

	return lines.join("\n");
}

function nodeShape(step: WorkflowStep, label: string): string {
	const id = sanitizeId(step.id);
	switch (step.type) {
		case "tool-call":
			return `${id}["${label}"]`;
		case "llm-prompt":
			return `${id}(["${label}"])`;
		case "switch-case":
			return `${id}{"${label}"}`;
		case "for-each":
			return `${id}[/"${label}"/]`;
		case "end":
			return `${id}((("${label}")))`;
	}
	throw new Error(`Unknown step type: ${step.type}`);
}

export function workflowToMermaid(workflow: WorkflowDefinition): string {
	const lines: string[] = ["flowchart TD"];

	for (const step of workflow.steps) {
		const label = escapeLabel(renderStepDetails(step));
		lines.push(`  ${nodeShape(step, label)}`);
	}

	lines.push("");

	for (const step of workflow.steps) {
		const id = sanitizeId(step.id);

		switch (step.type) {
			case "switch-case": {
				for (const c of step.params.cases) {
					const caseLabel =
						c.value.type === "default"
							? "default"
							: c.value.type === "literal"
								? String(c.value.value)
								: `jmespath: ${c.value.expression}`;
					lines.push(
						`  ${id} -->|"${escapeLabel(caseLabel)}"| ${sanitizeId(c.branchBodyStepId)}`,
					);
				}
				if (step.nextStepId) {
					lines.push(
						`  ${id} -.->|"after branch"| ${sanitizeId(step.nextStepId)}`,
					);
				}
				break;
			}
			case "for-each": {
				lines.push(
					`  ${id} -->|"for each ${escapeLabel(step.params.itemName)}"| ${sanitizeId(step.params.loopBodyStepId)}`,
				);
				if (step.nextStepId) {
					lines.push(
						`  ${id} -.->|"after loop"| ${sanitizeId(step.nextStepId)}`,
					);
				}
				break;
			}
			default: {
				if (step.nextStepId) {
					lines.push(`  ${id} --> ${sanitizeId(step.nextStepId)}`);
				}
				break;
			}
		}
	}

	return lines.join("\n");
}
