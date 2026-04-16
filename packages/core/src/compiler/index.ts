import type { ToolSet } from "ai";
import { asSchema } from "ai";
import type { WorkflowDefinition } from "../types";
import { applyBestPractices } from "./passes/apply-best-practices";
import { buildGraph } from "./passes/build-graph";
import { generateConstrainedToolSchemas } from "./passes/generate-constrained-tool-schemas";
import { validateControlFlow } from "./passes/validate-control-flow";
import { validateExpressionPaths } from "./passes/validate-expression-paths";
import { validateForeachTarget } from "./passes/validate-foreach-target";
import { validateJmespath } from "./passes/validate-jmespath";
import { validateLimits } from "./passes/validate-limits";
import { validateOutputSchemas } from "./passes/validate-output-schemas";
import { validatePromptSize } from "./passes/validate-prompt-size";
import { validateReferences } from "./passes/validate-references";
import { validateToolInputTypes } from "./passes/validate-tool-input-types";
import { validateTools } from "./passes/validate-tools";
import type {
  CompilerLimits,
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
    limits?: CompilerLimits;
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

  // Pass 2b: Validate sleep/wait literal values against configured limits
  diagnostics.push(...validateLimits(workflow, options?.limits));

  // Pass 2c: Validate prompt template sizes against token limits
  diagnostics.push(...validatePromptSize(workflow, options?.limits));

  // Pass 2d: Warn about unsupported JSON Schema keywords in outputFormat
  diagnostics.push(...validateOutputSchemas(workflow));

  // Pass 3: Extract tool schemas (needed by control flow and for-each validation)
  let constrainedToolSchemas: ConstrainedToolSchemaMap | null = null;
  let toolSchemas: ToolDefinitionMap | null = null;
  if (options?.tools) {
    toolSchemas = await extractToolSchemas(options.tools);
    diagnostics.push(...validateTools(workflow, toolSchemas));
    constrainedToolSchemas = generateConstrainedToolSchemas(
      workflow,
      toolSchemas,
    );
  }

  // Pass 4+: Only proceed with graph-dependent passes if we have a valid graph
  if (graphResult.graph) {
    diagnostics.push(
      ...validateControlFlow(workflow, graphResult.graph, toolSchemas),
    );

    diagnostics.push(...validateJmespath(workflow, graphResult.graph));

    // Validate property paths in all expressions against known output schemas
    diagnostics.push(
      ...validateExpressionPaths(workflow, graphResult.graph, toolSchemas),
    );

    // Validate for-each targets resolve to array types
    if (toolSchemas) {
      diagnostics.push(
        ...validateForeachTarget(workflow, graphResult.graph, toolSchemas),
      );
      diagnostics.push(
        ...validateToolInputTypes(workflow, graphResult.graph, toolSchemas),
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

/**
 * Convert a validator-library schema (arktype, zod v4, etc.) to JSON Schema.
 * Prefers the schema's own `toJsonSchema` / `toJSONSchema` method when
 * available so extensions like `default`, `examples`, and `title` — which the
 * AI SDK's `asSchema` wrapper drops — are preserved for UI consumption.
 */
async function toJsonSchemaRich(
  schema: unknown,
): Promise<Record<string, unknown>> {
  // Arktype types are callable (functions), so accept both shapes.
  if (schema && (typeof schema === "object" || typeof schema === "function")) {
    const obj = schema as Record<string, unknown>;
    const native =
      typeof obj.toJsonSchema === "function"
        ? (obj.toJsonSchema as () => Record<string, unknown>)
        : typeof obj.toJSONSchema === "function"
          ? (obj.toJSONSchema as () => Record<string, unknown>)
          : null;
    if (native) {
      try {
        return native.call(obj);
      } catch {
        // Fall through to ai SDK's asSchema if the native converter throws.
      }
    }
  }
  // biome-ignore lint/suspicious/noExplicitAny: schema shape is validator-specific
  return (await asSchema(schema as any).jsonSchema) as Record<string, unknown>;
}

export async function extractToolSchemas(
  tools: ToolSet,
): Promise<ToolDefinitionMap> {
  const schemas: ToolDefinitionMap = {};
  for (const [name, toolDef] of Object.entries(tools)) {
    const jsonSchema = await toJsonSchemaRich(toolDef.inputSchema);
    schemas[name] = {
      description: toolDef.description,
      inputSchema: jsonSchema as ToolDefinitionMap[string]["inputSchema"],
    };
    if (toolDef.outputSchema) {
      schemas[name].outputSchema = await toJsonSchemaRich(toolDef.outputSchema);
    }
  }
  return schemas;
}

export type {
  CompilerLimits,
  CompilerResult,
  ConstrainedToolSchema,
  ConstrainedToolSchemaMap,
  Diagnostic,
  DiagnosticCode,
  DiagnosticLocation,
  DiagnosticSeverity,
  ExecutionGraph,
  ToolDefinitionMap,
  ToolSchemaDefinition,
} from "./types";
