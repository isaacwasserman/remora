import type { ToolSet } from "ai";
import { asSchema } from "ai";
import type { WorkflowDefinition } from "../types";
import { applyBestPractices } from "./passes/apply-best-practices";
import { buildGraph } from "./passes/build-graph";
import { generateConstrainedToolSchemas } from "./passes/generate-constrained-tool-schemas";
import { validateControlFlow } from "./passes/validate-control-flow";
import { validateForeachTarget } from "./passes/validate-foreach-target";
import { validateJmespath } from "./passes/validate-jmespath";
import { validateReferences } from "./passes/validate-references";
import { validateTools } from "./passes/validate-tools";
import type {
	CompilerResult,
	ConstrainedToolSchemaMap,
	Diagnostic,
	ToolDefinitionMap,
} from "./types";

/**
 * Compiles a workflow definition through a multi-pass validation pipeline,
 * producing an execution graph and structured diagnostics.
 *
 * Passes: graph construction, reference validation, control flow validation,
 * JMESPath validation, tool validation, for-each target validation, and
 * best-practice transformations.
 *
 * @param workflow - The workflow definition to compile.
 * @param options - Optional configuration.
 * @param options.tools - Tool definitions to validate tool-call steps against.
 *   When provided, enables tool input validation and constrained schema generation.
 * @returns A {@link CompilerResult} containing diagnostics, the execution graph
 *   (if structurally valid), an optimized workflow (if error-free), and
 *   constrained tool schemas (if tools were provided).
 */
export async function compileWorkflow(
	workflow: WorkflowDefinition,
	options?: {
		tools?: ToolSet;
	},
): Promise<CompilerResult> {
	const diagnostics: Diagnostic[] = [];

	// Pass 1: Build execution graph
	const graphResult = buildGraph(workflow);
	diagnostics.push(...graphResult.diagnostics);

	// Pass 2: Validate step references
	const refDiagnostics = validateReferences(workflow);
	// Deduplicate MISSING_INITIAL_STEP (emitted by both build-graph and validate-references)
	for (const d of refDiagnostics) {
		if (
			d.code === "MISSING_INITIAL_STEP" &&
			diagnostics.some((e) => e.code === "MISSING_INITIAL_STEP")
		) {
			continue;
		}
		diagnostics.push(d);
	}

	// Pass 3+: Only proceed with graph-dependent passes if we have a valid graph
	if (graphResult.graph) {
		diagnostics.push(...validateControlFlow(workflow, graphResult.graph));

		diagnostics.push(...validateJmespath(workflow, graphResult.graph));
	}

	// Pass 5: Tool validation + constrained schema generation (doesn't require graph)
	let constrainedToolSchemas: ConstrainedToolSchemaMap | null = null;
	if (options?.tools) {
		const toolSchemas = await extractToolSchemas(options.tools);
		diagnostics.push(...validateTools(workflow, toolSchemas));
		constrainedToolSchemas = generateConstrainedToolSchemas(
			workflow,
			toolSchemas,
		);

		// Pass 6: Validate for-each targets resolve to array types
		if (graphResult.graph) {
			diagnostics.push(
				...validateForeachTarget(workflow, graphResult.graph, toolSchemas),
			);
		}
	}

	// Final pass: apply best-practice transformations (non-destructive)
	const hasErrors = diagnostics.some((d) => d.severity === "error");
	let optimizedWorkflow: WorkflowDefinition | null = null;
	if (graphResult.graph && !hasErrors) {
		const bpResult = applyBestPractices(workflow, graphResult.graph);
		optimizedWorkflow = bpResult.workflow;
		diagnostics.push(...bpResult.diagnostics);
	}

	return {
		diagnostics,
		graph: graphResult.graph,
		workflow: optimizedWorkflow,
		constrainedToolSchemas,
	};
}

async function extractToolSchemas(tools: ToolSet): Promise<ToolDefinitionMap> {
	const schemas: ToolDefinitionMap = {};
	for (const [name, toolDef] of Object.entries(tools)) {
		const jsonSchema = await asSchema(toolDef.inputSchema).jsonSchema;
		schemas[name] = {
			inputSchema: jsonSchema as ToolDefinitionMap[string]["inputSchema"],
		};
		if (toolDef.outputSchema) {
			schemas[name].outputSchema = (await asSchema(toolDef.outputSchema)
				.jsonSchema) as Record<string, unknown>;
		}
	}
	return schemas;
}

export type {
	CompilerResult,
	ConstrainedToolSchema,
	ConstrainedToolSchemaMap,
	Diagnostic,
	DiagnosticCode,
	DiagnosticLocation,
	DiagnosticSeverity,
	ExecutionGraph,
} from "./types";
