import type { WorkflowDefinition } from "../../types";
import type {
  ConstrainedToolSchema,
  ConstrainedToolSchemaMap,
  ToolDefinitionMap,
} from "../types";

// ─── Internal Types ──────────────────────────────────────────────

interface CallSiteKeyInfo {
  type: "literal";
  value: unknown;
}

interface CallSiteKeyDynamic {
  type: "jmespath";
}

interface CallSiteInfo {
  stepId: string;
  keys: Map<string, CallSiteKeyInfo | CallSiteKeyDynamic>;
}

// ─── Phase 1: Collect Call Sites ─────────────────────────────────

function collectCallSites(
  workflow: WorkflowDefinition,
): Map<string, CallSiteInfo[]> {
  const callSitesByTool = new Map<string, CallSiteInfo[]>();

  for (const step of workflow.steps) {
    if (step.type !== "tool-call") continue;

    const { toolName, toolInput } = step.params;
    const keys = new Map<string, CallSiteKeyInfo | CallSiteKeyDynamic>();

    for (const [key, expr] of Object.entries(toolInput)) {
      const expression = expr as { type: string; value?: unknown };
      if (expression.type === "literal") {
        keys.set(key, { type: "literal", value: expression.value });
      } else {
        keys.set(key, { type: "jmespath" });
      }
    }

    let sites = callSitesByTool.get(toolName);
    if (!sites) {
      sites = [];
      callSitesByTool.set(toolName, sites);
    }
    sites.push({ stepId: step.id, keys });
  }

  return callSitesByTool;
}

// ─── Phase 2–3: Analyze and Constrain Properties ─────────────────

function constrainProperty(
  callSites: CallSiteInfo[],
  key: string,
  originalPropertySchema: unknown,
): { schema: unknown; allLiteral: boolean; providedInAll: boolean } {
  let providedCount = 0;
  let allLiteral = true;
  const literalValues: unknown[] = [];
  const seen = new Set<string>();

  for (const site of callSites) {
    const entry = site.keys.get(key);
    if (!entry) continue;

    providedCount++;

    if (entry.type === "jmespath") {
      allLiteral = false;
    } else {
      const serialized = JSON.stringify(entry.value);
      if (!seen.has(serialized)) {
        seen.add(serialized);
        literalValues.push(entry.value);
      }
    }
  }

  const providedInAll = providedCount === callSites.length;

  if (!allLiteral) {
    return { schema: originalPropertySchema, allLiteral: false, providedInAll };
  }

  const original =
    originalPropertySchema && typeof originalPropertySchema === "object"
      ? (originalPropertySchema as Record<string, unknown>)
      : {};

  if (literalValues.length === 1) {
    return {
      schema: { ...original, const: literalValues[0] },
      allLiteral: true,
      providedInAll,
    };
  }

  return {
    schema: { ...original, enum: literalValues },
    allLiteral: true,
    providedInAll,
  };
}

// ─── Phase 4: Assemble Constrained Schemas ───────────────────────

export function generateConstrainedToolSchemas(
  workflow: WorkflowDefinition,
  tools: ToolDefinitionMap,
): ConstrainedToolSchemaMap {
  const callSitesByTool = collectCallSites(workflow);
  const result: ConstrainedToolSchemaMap = {};

  for (const [toolName, callSites] of callSitesByTool) {
    const toolDef = tools[toolName];
    if (!toolDef) continue; // Unknown tool — already reported by validate-tools

    const originalProperties = toolDef.inputSchema.properties ?? {};

    // Collect all keys used across any call site
    const allUsedKeys = new Set<string>();
    for (const site of callSites) {
      for (const key of site.keys.keys()) {
        allUsedKeys.add(key);
      }
    }

    const constrainedProperties: Record<string, unknown> = {};
    const requiredKeys: string[] = [];
    let fullyStatic = true;

    for (const key of allUsedKeys) {
      const originalProp = originalProperties[key];
      if (originalProp === undefined) continue; // Extra key not in schema — skip

      const { schema, allLiteral, providedInAll } = constrainProperty(
        callSites,
        key,
        originalProp,
      );

      constrainedProperties[key] = schema;

      if (providedInAll) {
        requiredKeys.push(key);
      }

      if (!allLiteral) {
        fullyStatic = false;
      }
    }

    const constrained: ConstrainedToolSchema = {
      inputSchema: {
        required: requiredKeys.sort(),
        properties: constrainedProperties,
      },
      fullyStatic,
      callSites: callSites.map((s) => s.stepId).sort(),
    };

    if (toolDef.outputSchema) {
      constrained.outputSchema = toolDef.outputSchema;
    }

    result[toolName] = constrained;
  }

  // Agent-loop tools are used dynamically — the agent decides what inputs
  // to pass at runtime. Mark them as not fully static and add call sites.
  for (const step of workflow.steps) {
    if (step.type !== "agent-loop") continue;
    for (const toolName of step.params.tools) {
      if (result[toolName]) {
        result[toolName].fullyStatic = false;
        if (!result[toolName].callSites.includes(step.id)) {
          result[toolName].callSites.push(step.id);
          result[toolName].callSites.sort();
        }
      } else if (tools[toolName]) {
        // Tool is only used by agent-loop, not by any tool-call step
        const toolDef = tools[toolName];
        const constrained: ConstrainedToolSchema = {
          inputSchema: {
            required: [],
            properties: {},
          },
          fullyStatic: false,
          callSites: [step.id],
        };
        if (toolDef.outputSchema) {
          constrained.outputSchema = toolDef.outputSchema;
        }
        result[toolName] = constrained;
      }
    }
  }

  return result;
}
