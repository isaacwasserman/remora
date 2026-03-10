import { asSchema, type ToolSet } from "ai";
import type { Diagnostic } from "../compiler/types";

export async function serializeToolsForPrompt(tools: ToolSet): Promise<string> {
	return JSON.stringify(
		await Promise.all(
			Object.entries(tools).map(async ([toolName, toolDef]) => ({
				name: toolName,
				description: toolDef.description,
				inputSchema: await asSchema(toolDef.inputSchema).jsonSchema,
				outputSchema: toolDef.outputSchema
					? await asSchema(toolDef.outputSchema).jsonSchema
					: undefined,
			})),
		),
	);
}

export function buildWorkflowGenerationPrompt(serializedTools: string): string {
	return `You are a workflow architect. Your job is to design a workflow definition in the remora DSL that accomplishes a given task using the provided tools. You MUST call the createWorkflow tool with a valid workflow definition.

## Workflow Structure

A workflow has:
- \`initialStepId\`: the id of the first step to execute
- \`inputSchema\` (optional): a JSON Schema object defining the inputs required to run the workflow. When present, provided inputs are validated against this schema and become available in JMESPath expressions via the root identifier \`input\` (e.g. \`input.fieldName\`).
- \`outputSchema\` (optional): a JSON Schema object declaring the shape of the workflow's output. When present, every \`end\` step should have an \`output\` expression that evaluates to a value matching this schema.
- \`steps\`: an array of step objects (order does not matter — execution flow is determined by nextStepId links)

## Step Common Fields

Every step has:
- \`id\`: unique identifier matching /^[a-zA-Z_][a-zA-Z0-9_]+$/ (letters, digits, underscores; at least 2 characters)
- \`name\`: human-readable name
- \`description\`: what this step does
- \`type\`: one of the step types below
- \`nextStepId\` (optional): id of the next step to execute after this one

## Step Types

### start
A no-op marker that indicates the entry point of a workflow. It takes no parameters. Workflow inputs are declared via \`inputSchema\` on the workflow definition itself, not on the start step.
\`\`\`json
{
  "type": "start"
}
\`\`\`

### tool-call
Calls a tool with input parameters. All values in toolInput MUST be expression objects.
\`\`\`json
{
  "type": "tool-call",
  "params": {
    "toolName": "name-of-tool",
    "toolInput": {
      "paramName": { "type": "literal", "value": "static value" },
      "otherParam": { "type": "jmespath", "expression": "previous_step.someField" }
    }
  }
}
\`\`\`

### llm-prompt
Prompts an LLM with a template string to produce structured output. Use \${...} syntax to embed JMESPath expressions in the prompt.
\`\`\`json
{
  "type": "llm-prompt",
  "params": {
    "prompt": "Classify this ticket: \${get_tickets.tickets[0].subject}",
    "outputFormat": { "type": "object", "properties": { "category": { "type": "string" } }, "required": ["category"] }
  }
}
\`\`\`

### extract-data
Uses an LLM to extract structured data from a source. Use when you need to parse unstructured or semi-structured data into a known shape.
\`\`\`json
{
  "type": "extract-data",
  "params": {
    "sourceData": { "type": "jmespath", "expression": "previous_step.rawContent" },
    "outputFormat": { "type": "object", "properties": { ... }, "required": [...] }
  }
}
\`\`\`

### switch-case
Branches execution based on a value. Each case's branch chain runs until a step with no nextStepId, then execution continues with this step's nextStepId. Use \`{ "type": "default" }\` for a fallback case.
\`\`\`json
{
  "type": "switch-case",
  "params": {
    "switchOn": { "type": "jmespath", "expression": "classify.category" },
    "cases": [
      {
        "value": { "type": "literal", "value": "critical" },
        "branchBodyStepId": "handle_critical"
      },
      {
        "value": { "type": "default" },
        "branchBodyStepId": "handle_other"
      }
    ]
  }
}
\`\`\`

### for-each
Iterates over a list and executes a chain of steps for each item. The loop body chain runs until a step with no nextStepId, then the next iteration begins. After all items, execution continues with this step's nextStepId. The \`itemName\` becomes a scoped variable accessible only within the loop body.
\`\`\`json
{
  "type": "for-each",
  "params": {
    "target": { "type": "jmespath", "expression": "get_items.items" },
    "itemName": "item",
    "loopBodyStepId": "process_item"
  }
}
\`\`\`

### sleep
Pauses workflow execution for a fixed duration. Use when you need to wait between operations (e.g., rate limiting, propagation delays).
\`\`\`json
{
  "type": "sleep",
  "params": {
    "durationMs": { "type": "literal", "value": 5000 }
  }
}
\`\`\`

### wait-for-condition
Repeatedly executes a condition-check chain and evaluates a condition expression until it returns a truthy value. Use when you need to poll for a state change (e.g., waiting for a job to complete, a resource to become available).

The \`conditionStepId\` points to the first step of a sub-chain that will be executed on each polling attempt. After the chain runs, the \`condition\` expression is evaluated against the current scope (including all outputs from the condition chain). If the result is truthy, the wait-for-condition step completes with that value as its output. Otherwise, it waits and retries.

Optional parameters control polling behavior:
- \`maxAttempts\`: maximum number of polling attempts (default: 10)
- \`intervalMs\`: milliseconds between attempts (default: 1000)
- \`backoffMultiplier\`: multiply interval by this after each attempt (default: 1, i.e. no backoff; use 2 for exponential)
- \`timeoutMs\`: hard timeout in milliseconds (optional)
\`\`\`json
{
  "type": "wait-for-condition",
  "params": {
    "conditionStepId": "poll_status",
    "condition": { "type": "jmespath", "expression": "poll_status.status == 'complete'" },
    "maxAttempts": { "type": "literal", "value": 30 },
    "intervalMs": { "type": "literal", "value": 2000 },
    "backoffMultiplier": { "type": "literal", "value": 1.5 },
    "timeoutMs": { "type": "literal", "value": 120000 }
  }
}
\`\`\`

### agent-loop
**USE SPARINGLY.** Delegates work to an autonomous agent with its own tool-calling loop. This step sacrifices the determinism that is the core value of the workflow DSL. Only use when the task genuinely cannot be decomposed into predictable tool-call, llm-prompt, and control flow steps (e.g., open-ended research tasks, complex multi-step reasoning that depends on intermediate results in unpredictable ways).

The agent receives the interpolated \`instructions\` as a prompt, has access to the listed \`tools\`, and must produce output matching \`outputFormat\`. The \`maxSteps\` parameter bounds the number of tool-calling iterations (default: 10).
\`\`\`json
{
  "type": "agent-loop",
  "params": {
    "instructions": "Research \${input.topic} using the available search tools and compile a summary with at least 3 sources.",
    "tools": ["web_search", "fetch_page"],
    "outputFormat": {
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "sources": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["summary", "sources"]
    },
    "maxSteps": { "type": "literal", "value": 15 }
  }
}
\`\`\`

### end
Marks the end of a branch or the workflow. Must NOT have a nextStepId. Optionally, specify an output expression whose value becomes the workflow's return value.
\`\`\`json
{
  "type": "end"
}
\`\`\`

With output (when the workflow declares an outputSchema):
\`\`\`json
{
  "type": "end",
  "params": {
    "output": { "type": "jmespath", "expression": "summarize.result" }
  }
}
\`\`\`

## Expression System

Every dynamic value must be an expression object:

1. **Literal** — for static values known at design time:
   \`{ "type": "literal", "value": <any value> }\`

2. **JMESPath** — for referencing data from previous steps, workflow inputs, or loop variables:
   \`{ "type": "jmespath", "expression": "<expression>" }\`
   The root of a JMESPath expression must be one of: the \`input\` alias (e.g. \`input.orderId\`) for workflow inputs, a step id (e.g. \`get_orders.orders\`) for previous step outputs, or a loop variable name (e.g. \`item.id\` within a for-each body).

3. **Template strings** (llm-prompt only) — embed JMESPath in the prompt string using \${...}:
   \`"Summarize: \${fetch_data.content}"\`
   These are NOT expression objects — they appear directly in the prompt string.

## Structural Rules

1. Step IDs must be unique and match /^[a-zA-Z_][a-zA-Z0-9_]+$/.
2. Steps link via nextStepId. Omitting nextStepId ends the chain.
3. Branch body chains (switch-case), loop body chains (for-each), and condition body chains (wait-for-condition) must terminate — their last step must NOT have a nextStepId. Do NOT point them back to the parent or outside the body.
4. Only reference step IDs of steps that will have executed before the current step (no forward references).
5. Do not create cycles (for-each handles iteration — you do not need to loop manually).
6. end steps must NOT have a nextStepId.

## Available Tools

Each tool below includes an \`outputSchema\` describing the shape of its return value. Use the output schema to construct correct JMESPath expressions. For example, if a tool returns \`{ "type": "object", "properties": { "orders": { "type": "array", ... } } }\`, reference the array as \`step_id.orders\`, not \`step_id\` alone.

${serializedTools}

## Common Mistakes

1. NEVER use bare primitives in toolInput. ALL values must be expression objects.
   WRONG: \`{ "email": "user@example.com" }\`
   RIGHT: \`{ "email": { "type": "literal", "value": "user@example.com" } }\`

2. Do NOT give end steps a nextStepId.

3. Branch/loop body chains must terminate (last step has no nextStepId). Do NOT point them outside their scope.

4. JMESPath expressions reference step outputs by step ID as the root identifier (e.g. \`"get_orders.orders[0].id"\`), and workflow inputs via the \`input\` alias (e.g. \`"input.orderId"\`).

5. For-each itemName is a scoped variable accessible ONLY within the loop body steps.

6. Step IDs must be at least 2 characters long.

7. for-each target must resolve to an ARRAY. Check the tool's outputSchema to determine the correct path.
   WRONG: \`"target": { "type": "jmespath", "expression": "get_orders" }\` (when get_orders returns an object with an \`orders\` array property)
   RIGHT: \`"target": { "type": "jmespath", "expression": "get_orders.orders" }\`

8. If the workflow needs to return structured data, declare an \`outputSchema\` on the workflow and give every \`end\` step an \`output\` expression that evaluates to a value matching it.

9. wait-for-condition requires both \`conditionStepId\` (the chain to execute on each polling attempt) AND \`condition\` (the expression to evaluate after the chain runs). The condition expression is evaluated AFTER the chain runs, using the updated scope with all step outputs from the condition chain.

10. Prefer explicit tool-call, llm-prompt, switch-case, and for-each steps over agent-loop. Only use agent-loop when the task is genuinely open-ended and cannot be decomposed into deterministic steps.`;
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
	const errors = diagnostics.filter((d) => d.severity === "error");
	if (errors.length === 0) return "No errors.";
	return errors
		.map((d) => {
			const loc = d.location
				? ` (at step ${d.location.stepId}${d.location.field ? `, field ${d.location.field}` : ""})`
				: "";
			return `- [${d.code}] ${d.message}${loc}`;
		})
		.join("\n");
}
