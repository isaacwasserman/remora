import type { ToolSet } from "ai";
import { asSchema } from "ai";
import type { WorkflowDefinition } from "../types";
import type { CompilerResult, Diagnostic, ToolDefinitionMap } from "./types";
import { buildGraph } from "./passes/build-graph";
import { validateReferences } from "./passes/validate-references";
import { validateControlFlow } from "./passes/validate-control-flow";
import { validateJmespath } from "./passes/validate-jmespath";
import { validateTools } from "./passes/validate-tools";

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
		diagnostics.push(
			...validateControlFlow(workflow, graphResult.graph),
		);

		diagnostics.push(
			...validateJmespath(workflow, graphResult.graph),
		);
	}

	// Pass 5: Tool validation (doesn't require graph)
	if (options?.tools) {
		const toolSchemas = await extractToolSchemas(options.tools);
		diagnostics.push(...validateTools(workflow, toolSchemas));
	}

	return {
		diagnostics,
		graph: graphResult.graph,
	};
}

async function extractToolSchemas(tools: ToolSet): Promise<ToolDefinitionMap> {
	const schemas: ToolDefinitionMap = {};
	for (const [name, toolDef] of Object.entries(tools)) {
		const jsonSchema = await asSchema(toolDef.inputSchema).jsonSchema;
		schemas[name] = {
			inputSchema: jsonSchema as ToolDefinitionMap[string]["inputSchema"],
		};
	}
	return schemas;
}

export type {
	Diagnostic,
	DiagnosticCode,
	DiagnosticSeverity,
	DiagnosticLocation,
	CompilerResult,
	ExecutionGraph,
} from "./types";
