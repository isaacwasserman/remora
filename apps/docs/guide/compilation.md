# Compilation

The compiler validates a workflow definition through a multi-pass pipeline and produces an execution graph, structured diagnostics, and constrained tool schemas. You should always compile a workflow before executing it.

```ts
import { compileWorkflow } from "@remoraflow/core";

const result = await compileWorkflow(workflow, {
  tools: myTools,
  limits: { maxSleepMs: 60_000 },
});
```

## Compiler Options

`compileWorkflow` accepts an optional second argument with the following fields:

### `tools`

**Type:** `ToolSet` (from the [AI SDK](https://ai-sdk.dev/))
**Default:** `undefined`

When provided, enables two additional compiler passes:

- **Tool validation** — checks that every `tool-call` step references a tool that exists in the set, and that the `toolInput` keys match the tool's input schema (catching missing or extra keys).
- **Constrained schema generation** — produces narrowed input schemas showing which parameters are static vs. dynamic across all call sites. See [Constrained Tool Schemas](#constrained-tool-schemas).

```ts
import { tool } from "ai";
import { z } from "zod";

const tools = {
  "send-email": tool({
    parameters: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async (input) => {
      // ...
    },
  }),
};

const result = await compileWorkflow(workflow, { tools });
```

### `limits`

**Type:** [`CompilerLimits`](/api/lib/interfaces/CompilerLimits)
**Default:** See defaults below

Configures upper bounds that the compiler uses to validate literal sleep/wait values at compile time. If a step specifies a literal duration or attempt count that exceeds these limits, the compiler emits a warning diagnostic.

| Field | Type | Default | Description |
|---|---|---|---|
| `maxAttempts` | `number` | `Infinity` | Upper bound for `wait-for-condition` `maxAttempts` |
| `maxSleepMs` | `number` | `300_000` (5 min) | Upper bound for `sleep` `durationMs` and `wait-for-condition` `intervalMs` |
| `maxBackoffMultiplier` | `number` | `2` | Upper bound for `backoffMultiplier` |
| `minBackoffMultiplier` | `number` | `1` | Lower bound for `backoffMultiplier` |
| `maxTimeoutMs` | `number` | `600_000` (10 min) | Upper bound for `wait-for-condition` `timeoutMs` |

```ts
const result = await compileWorkflow(workflow, {
  limits: {
    maxSleepMs: 60_000,      // Cap sleep to 1 minute
    maxAttempts: 50,          // Cap polling to 50 attempts
    maxTimeoutMs: 120_000,    // Cap wait timeout to 2 minutes
  },
});
```

::: tip
These limits only validate **literal** values at compile time. JMESPath expressions that resolve at runtime are not checked by the compiler — use [executor limits](/guide/execution#executor-limits) to enforce runtime bounds.
:::

## Compiler Result

`compileWorkflow` returns a `CompilerResult` with four fields:

```ts
interface CompilerResult {
  diagnostics: Diagnostic[];
  graph: ExecutionGraph | null;
  workflow: WorkflowDefinition | null;
  constrainedToolSchemas: ConstrainedToolSchemaMap | null;
}
```

### `diagnostics`

An array of structured diagnostics emitted during compilation. Each diagnostic has a severity, location, human-readable message, and machine-readable code:

```ts
interface Diagnostic {
  severity: "error" | "warning";
  location: {
    stepId: string | null;   // null for workflow-level issues
    field: string;           // e.g. "params.toolInput.email"
  };
  message: string;
  code: DiagnosticCode;
}
```

Filter by severity to check for errors:

```ts
const errors = result.diagnostics.filter((d) => d.severity === "error");
const warnings = result.diagnostics.filter((d) => d.severity === "warning");

if (errors.length > 0) {
  console.error("Compilation failed:", errors);
}
```

#### Diagnostic Codes

Every diagnostic has a machine-readable `code` for programmatic handling. The full set:

| Code | Severity | Description |
|---|---|---|
| `INVALID_STEP_ID` | error | Step ID doesn't match `^[a-zA-Z_][a-zA-Z0-9_]+$` |
| `INVALID_ITEM_NAME` | error | `for-each` `itemName` doesn't match the ID pattern |
| `ITEM_NAME_SHADOWS_STEP_ID` | warning | `itemName` collides with a step ID |
| `DUPLICATE_STEP_ID` | error | Two steps share the same ID |
| `MISSING_INITIAL_STEP` | error | `initialStepId` doesn't match any step |
| `MISSING_NEXT_STEP` | error | `nextStepId` references a nonexistent step |
| `MISSING_BRANCH_BODY_STEP` | error | `switch-case` `branchBodyStepId` references a nonexistent step |
| `MISSING_LOOP_BODY_STEP` | error | `for-each` `loopBodyStepId` references a nonexistent step |
| `MISSING_CONDITION_BODY_STEP` | error | `wait-for-condition` `conditionStepId` references a nonexistent step |
| `UNREACHABLE_STEP` | warning | Step is not reachable from `initialStepId` |
| `CYCLE_DETECTED` | error | The step graph contains a cycle |
| `UNCLOSED_TEMPLATE_EXPRESSION` | error | Template string has an unclosed `${` |
| `JMESPATH_SYNTAX_ERROR` | error | JMESPath expression has invalid syntax |
| `JMESPATH_INVALID_ROOT_REFERENCE` | error | Expression references a step or variable that doesn't exist |
| `JMESPATH_FORWARD_REFERENCE` | error | Expression references a step that hasn't executed yet |
| `END_STEP_HAS_NEXT` | warning | An `end` step has a `nextStepId` (it will be ignored) |
| `BRANCH_BODY_ESCAPES` | error | A `switch-case` branch body has a `nextStepId` that exits the branch |
| `LOOP_BODY_ESCAPES` | error | A `for-each` loop body has a `nextStepId` that exits the loop |
| `CONDITION_BODY_ESCAPES` | error | A `wait-for-condition` body escapes its boundary |
| `MULTIPLE_DEFAULT_CASES` | error | `switch-case` has more than one `default` case |
| `UNKNOWN_TOOL` | error | `tool-call` references a tool not in the provided `ToolSet` |
| `MISSING_TOOL_INPUT_KEY` | warning | Required tool input key is missing from `toolInput` |
| `EXTRA_TOOL_INPUT_KEY` | warning | `toolInput` contains a key not in the tool's schema |
| `TOOL_INPUT_TYPE_MISMATCH` | warning | A literal `toolInput` value has a type that doesn't match the tool's input schema |
| `UNSUPPORTED_SCHEMA_KEYWORD` | warning | An `outputFormat` / `outputSchema` field contains a JSON Schema keyword not supported by LLM structured output APIs (e.g. `minimum`, `maximum`, `minLength`, `pattern`) |
| `MISSING_START_STEP` | warning | Workflow has no `start` step |
| `END_STEP_MISSING_OUTPUT` | warning | Workflow has an `outputSchema` but the `end` step has no output expression |
| `END_STEP_UNEXPECTED_OUTPUT` | warning | `end` step has an output expression but the workflow has no `outputSchema` |
| `PATH_MISSING_END_STEP` | warning | An execution path doesn't terminate with an `end` step |
| `LITERAL_OUTPUT_SHAPE_MISMATCH` | warning | A literal output value doesn't match the `outputSchema` |
| `FOREACH_TARGET_NOT_ARRAY` | warning | `for-each` target expression statically resolves to a non-array type |
| `SLEEP_DURATION_EXCEEDS_LIMIT` | warning | Sleep duration exceeds `limits.maxSleepMs` |
| `WAIT_ATTEMPTS_EXCEEDS_LIMIT` | warning | Wait attempts exceed `limits.maxAttempts` |
| `WAIT_INTERVAL_EXCEEDS_LIMIT` | warning | Wait interval exceeds `limits.maxSleepMs` |
| `BACKOFF_MULTIPLIER_OUT_OF_RANGE` | warning | Backoff multiplier outside `[minBackoffMultiplier, maxBackoffMultiplier]` |
| `WAIT_TIMEOUT_EXCEEDS_LIMIT` | warning | Wait timeout exceeds `limits.maxTimeoutMs` |

### `graph`

**Type:** `ExecutionGraph | null`

The compiled DAG representation, or `null` if the workflow has structural errors (cycles, missing steps, duplicate IDs). The graph provides O(1) lookups and topological ordering:

```ts
interface ExecutionGraph {
  stepIndex: Map<string, WorkflowStep>;         // O(1) step lookup by ID
  successors: Map<string, Set<string>>;         // Step → steps it transitions to
  predecessors: Map<string, Set<string>>;       // Step → steps that transition to it
  topologicalOrder: string[];                   // Steps in dependency order
  reachableSteps: Set<string>;                  // Steps reachable from initialStepId
  loopVariablesInScope: Map<string, Set<string>>; // Loop vars available at each step
  bodyOwnership: Map<string, string>;           // Body step → owning for-each/switch
}
```

The graph is primarily an internal structure used by downstream compiler passes and the executor. You can use it for custom analysis:

```ts
if (result.graph) {
  // Check which steps are reachable
  for (const stepId of result.graph.reachableSteps) {
    console.log(`Step ${stepId} is reachable`);
  }

  // Iterate in topological order
  for (const stepId of result.graph.topologicalOrder) {
    const step = result.graph.stepIndex.get(stepId);
    console.log(`${stepId}: ${step?.type}`);
  }

  // Check what loop variables a step can access
  const varsInScope = result.graph.loopVariablesInScope.get("classify_ticket");
  // Set { "ticket" } — from a for-each with itemName "ticket"
}
```

### `workflow`

**Type:** `WorkflowDefinition | null`

The optimized workflow with best-practice transformations applied. This is `null` if the workflow has any errors. Transformations are non-destructive and include:

- Automatically adding `end` steps to paths that don't terminate with one
- Other structural cleanups

Always pass this optimized workflow (not the original) to `executeWorkflow`:

```ts
if (result.workflow) {
  const execution = await executeWorkflow(result.workflow, { tools });
}
```

### `constrainedToolSchemas`

**Type:** `ConstrainedToolSchemaMap | null`

A map from tool names to their constrained schemas. Only produced when `tools` is provided in the compiler options, otherwise `null`.

## Constrained Tool Schemas

When the compiler analyzes a workflow, it determines exactly which tool parameters are static (literal values known at compile time) versus dynamic (JMESPath expressions resolved at runtime). This produces a narrowed input schema for each tool:

```ts
interface ConstrainedToolSchema {
  inputSchema: {
    required: string[];
    properties: Record<string, unknown>;
  };
  outputSchema?: Record<string, unknown>;
  fullyStatic: boolean;   // true when ALL inputs at ALL call sites are literals
  callSites: string[];    // Step IDs that call this tool
}
```

This matters for safety. A human supervisor can review the constrained schemas and approve a limited set of behaviors before execution begins:

```ts
const result = await compileWorkflow(workflow, { tools });

if (result.constrainedToolSchemas) {
  for (const [toolName, schema] of Object.entries(result.constrainedToolSchemas)) {
    if (schema.fullyStatic) {
      console.log(`${toolName}: fully static — safe for unsupervised execution`);
    } else {
      console.log(`${toolName}: has dynamic inputs — review required`);
      console.log("  Call sites:", schema.callSites);
      console.log("  Constrained schema:", schema.inputSchema);
    }
  }
}
```

A workflow that only ever calls `sendEmail` with a specific template and a dynamic recipient is meaningfully different from one with unconstrained access to the email API. The `fullyStatic` flag makes this distinction explicit.

## Compilation Passes

The compiler runs passes in this order:

1. **Graph construction** — builds the DAG, detects cycles, duplicate step IDs, computes topological order and reachability
2. **Reference validation** — verifies all `nextStepId`, `branchBodyStepId`, `loopBodyStepId`, and `conditionStepId` references resolve to existing steps
3. **Limits validation** — checks literal sleep/wait values against configured `CompilerLimits`
4. **Output schema validation** — warns about JSON Schema keywords in `outputFormat` and `outputSchema` fields that LLM structured output APIs don't support (e.g. `minimum`, `maxLength`, `pattern`). These keywords are silently dropped at runtime; the warning lets you catch mismatches at compile time.
5. **Tool validation** — validates `tool-call` step inputs match the provided tool schemas (requires `tools` option), including type checking of literal values
6. **Control flow validation** — checks that branch bodies and loop bodies don't escape their boundaries, validates `switch-case` and `for-each` structure
7. **JMESPath validation** — parses all JMESPath expressions, validates root references against available step IDs and loop variables, detects forward references
8. **For-each target validation** — uses tool output schemas to verify that `for-each` targets resolve to array types
9. **Constrained schema generation** — produces narrowed tool input schemas from all call sites
10. **Best practices** — applies non-destructive transformations (e.g., adding missing end steps)

If a pass produces errors, later passes that depend on a valid graph are skipped. Warnings never prevent subsequent passes from running.

## Feeding Diagnostics to an Agent

Because diagnostics are structured with codes and locations, they're ideal for feeding back to an LLM that authored the workflow. The agent can read the diagnostics and fix its workflow without human intervention:

```ts
const result = await compileWorkflow(agentWorkflow, { tools });
const errors = result.diagnostics.filter((d) => d.severity === "error");

if (errors.length > 0) {
  // Feed structured errors back to the agent
  const feedback = errors.map((d) =>
    `[${d.code}] Step "${d.location.stepId}", field "${d.location.field}": ${d.message}`
  ).join("\n");

  // The agent can use this to fix and resubmit the workflow
}
```

This compile-fix loop is also what the [workflow generator](/guide/getting-started#generate-a-workflow) does internally — it calls the LLM, compiles the result, feeds back any errors, and retries.
