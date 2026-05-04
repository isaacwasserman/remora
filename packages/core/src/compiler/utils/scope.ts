import type { WorkflowDefinition, WorkflowStep } from "../../types";
import type { ExecutionGraph, ToolDefinitionMap } from "../types";
import { getStepOutputSchema, resolveExpressionSchema } from "./schema";

/**
 * A single root identifier that is in scope at a given step. Each entry can be
 * referenced directly in JMESPath (by `name`) or descended into via its JSON
 * Schema.
 */
export interface ScopeEntry {
  /** Root identifier as it appears in JMESPath (e.g. "input", "step1", "item"). */
  name: string;
  /** Where this identifier comes from. */
  kind: "input" | "stepOutput" | "loopVar";
  /** JSON Schema describing the value's shape, or null if unknown. */
  schema: Record<string, unknown> | null;
  /** Optional human-readable description (step description, etc.). */
  description?: string;
}

/**
 * A flattened expression suggestion for a given scope. Suggestions are ready
 * to drop into a JMESPath expression or template `${...}` interpolation.
 */
export interface ExpressionSuggestion {
  /** The full JMESPath path (e.g. "step1.user.name", "step1.items[*].name"). */
  path: string;
  /** JSON Schema `type` of the value at this path, when known. */
  type?: string;
  /** Human-readable description of the value at this path. */
  description?: string;
  /** The root entry this suggestion descends from. */
  rootKind: ScopeEntry["kind"];
}

export interface EnumerateSuggestionsOptions {
  /** Maximum nesting depth to enumerate. Defaults to 4. */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 4;

/**
 * Build the set of root identifiers that are in scope at the given step.
 * Includes:
 * - The workflow's `input` (when an inputSchema is declared).
 * - All predecessor steps' outputs.
 * - Loop variables introduced by enclosing for-each steps.
 */
export function getExpressionScope(
  workflow: WorkflowDefinition,
  graph: ExecutionGraph,
  tools: ToolDefinitionMap | null,
  stepId: string,
): ScopeEntry[] {
  const entries: ScopeEntry[] = [];

  if (workflow.inputSchema) {
    entries.push({
      name: "input",
      kind: "input",
      schema: workflow.inputSchema as Record<string, unknown>,
      description: "Workflow input",
    });
  }

  const predecessors = graph.predecessors.get(stepId);
  if (predecessors) {
    for (const predId of predecessors) {
      const step = graph.stepIndex.get(predId);
      if (!step) continue;
      const schema = getStepOutputSchema(step, tools, workflow, graph);
      entries.push({
        name: predId,
        kind: "stepOutput",
        schema,
        description: step.description || step.name || undefined,
      });
    }
  }

  const loopVars = graph.loopVariablesInScope.get(stepId);
  if (loopVars) {
    for (const varName of loopVars) {
      const itemSchema = resolveLoopVarItemSchema(
        varName,
        stepId,
        workflow,
        graph,
        tools,
      );
      entries.push({
        name: varName,
        kind: "loopVar",
        schema: itemSchema,
        description: "Loop item",
      });
    }
  }

  return entries;
}

/**
 * Resolve the item schema for a loop variable by finding the for-each step
 * that introduced it and inspecting its target array schema.
 */
function resolveLoopVarItemSchema(
  varName: string,
  stepId: string,
  workflow: WorkflowDefinition,
  graph: ExecutionGraph,
  tools: ToolDefinitionMap | null,
): Record<string, unknown> | null {
  // Walk up bodyOwnership until we find a for-each step that defines `varName`.
  let currentBodyId: string | undefined = stepId;
  const visited = new Set<string>();
  while (currentBodyId) {
    if (visited.has(currentBodyId)) break;
    visited.add(currentBodyId);
    const ownerId = graph.bodyOwnership.get(currentBodyId);
    if (!ownerId) break;
    const owner = graph.stepIndex.get(ownerId);
    if (!owner) break;
    if (owner.type === "for-each" && owner.params.itemName === varName) {
      return inferForEachItemSchema(owner, workflow, graph, tools);
    }
    currentBodyId = ownerId;
  }
  return null;
}

function inferForEachItemSchema(
  step: WorkflowStep & { type: "for-each" },
  workflow: WorkflowDefinition,
  graph: ExecutionGraph,
  tools: ToolDefinitionMap | null,
): Record<string, unknown> | null {
  const target = step.params.target as
    | { type: "literal"; value: unknown }
    | { type: "jmespath"; expression: string }
    | { type: "template"; template: string };
  if (target.type !== "jmespath") return null;
  const arraySchema = resolveExpressionSchema(
    target.expression,
    step.id,
    tools,
    workflow,
    graph,
  );
  if (!arraySchema) return null;
  const items = arraySchema.items;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    return items as Record<string, unknown>;
  }
  return null;
}

/**
 * Flatten a scope into a list of suggested JMESPath expressions, including
 * wildcard projections (`[*].field`) for arrays of objects.
 */
export function enumerateSuggestions(
  scope: ScopeEntry[],
  options: EnumerateSuggestionsOptions = {},
): ExpressionSuggestion[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const out: ExpressionSuggestion[] = [];
  for (const entry of scope) {
    walkSchema(entry.schema, entry.name, entry.kind, 0, maxDepth, out, {
      rootDescription: entry.description,
    });
  }
  return out;
}

function walkSchema(
  schema: Record<string, unknown> | null,
  path: string,
  rootKind: ScopeEntry["kind"],
  depth: number,
  maxDepth: number,
  out: ExpressionSuggestion[],
  ctx: { rootDescription?: string },
): void {
  const type =
    schema && typeof schema.type === "string" ? schema.type : undefined;
  const description =
    schema && typeof schema.description === "string"
      ? schema.description
      : depth === 0
        ? ctx.rootDescription
        : undefined;

  out.push({ path, type, description, rootKind });

  if (depth >= maxDepth || !schema) return;

  if (type === "object" || schema.properties) {
    const properties = schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        walkSchema(
          propSchema,
          `${path}.${key}`,
          rootKind,
          depth + 1,
          maxDepth,
          out,
          ctx,
        );
      }
    }
  }

  if (type === "array" || schema.items) {
    const items = schema.items;
    if (items && typeof items === "object" && !Array.isArray(items)) {
      const itemSchema = items as Record<string, unknown>;
      const itemType =
        typeof itemSchema.type === "string" ? itemSchema.type : undefined;
      // Only project into arrays of objects — primitives are reachable as the
      // array itself or via [N], which is more situational.
      if (itemType === "object" || itemSchema.properties) {
        walkSchema(
          itemSchema,
          `${path}[*]`,
          rootKind,
          depth + 1,
          maxDepth,
          out,
          ctx,
        );
      }
    }
  }
}
