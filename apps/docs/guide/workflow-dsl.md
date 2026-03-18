# Workflow Definition Language

Workflows are defined as JSON objects with an `initialStepId` and an array of `steps`. Each step has a type, a `nextStepId` for sequencing, and type-specific parameters. Data flows between steps through JMESPath expressions that reference previous step outputs.

## Workflow-Level Fields

| Field | Required | Description |
|---|---|---|
| `initialStepId` | Yes | ID of the first step to execute. |
| `steps` | Yes | Array of step definitions (order doesn't matter — execution order is determined by `nextStepId` and branching). |
| `inputSchema` | No | JSON Schema object declaring the inputs required to run the workflow. The executor validates provided inputs against it. Inputs are available in scope via the `input` identifier (e.g. `input.userId`). |
| `outputSchema` | No | JSON Schema object declaring the shape of the workflow's final output. When present, the value produced by the `end` step's `output` expression is validated against it. |

```json
{
  "initialStepId": "start_step",
  "inputSchema": {
    "type": "object",
    "required": ["userId"],
    "properties": {
      "userId": { "type": "string" }
    }
  },
  "outputSchema": {
    "type": "object",
    "required": ["result"],
    "properties": {
      "result": { "type": "string" }
    }
  },
  "steps": [...]
}
```

## Step Types

### `start`

Entry point of the workflow. Declares an input schema (JSON Schema) that the executor validates provided inputs against. The validated inputs become available in JMESPath scope via this step's ID.

```json
{
  "id": "start",
  "name": "Start",
  "description": "Accepts a user ID",
  "type": "start",
  "params": {
    "inputSchema": {
      "type": "object",
      "required": ["userId"],
      "properties": {
        "userId": { "type": "string" }
      }
    }
  },
  "nextStepId": "fetch_user"
}
```

### `tool-call`

Calls a tool with literal or expression-based arguments. All values in `toolInput` must be wrapped as expression objects.

```json
{
  "id": "fetch_user",
  "name": "Fetch user",
  "description": "Look up user by ID",
  "type": "tool-call",
  "params": {
    "toolName": "get-user",
    "toolInput": {
      "id": { "type": "jmespath", "expression": "start.userId" }
    }
  },
  "nextStepId": "classify"
}
```

### `llm-prompt`

Prompts an LLM with a template string where JMESPath expressions can be embedded using `${...}` syntax. The LLM must produce JSON matching the specified `outputFormat` schema.

```json
{
  "id": "classify",
  "name": "Classify user",
  "description": "Classify user account type",
  "type": "llm-prompt",
  "params": {
    "prompt": "Given this user profile: ${fetch_user}\n\nClassify their account type.",
    "outputFormat": {
      "type": "object",
      "required": ["accountType"],
      "properties": {
        "accountType": {
          "type": "string",
          "enum": ["free", "pro", "enterprise"]
        }
      }
    }
  },
  "nextStepId": "route"
}
```

### `extract-data`

Uses an LLM to extract structured data from unstructured source data (e.g., large tool outputs or LLM responses) into a specified format.

```json
{
  "id": "extract_info",
  "name": "Extract contact info",
  "description": "Extract structured contact info from profile text",
  "type": "extract-data",
  "params": {
    "sourceData": { "type": "jmespath", "expression": "fetch_user.bio" },
    "outputFormat": {
      "type": "object",
      "properties": {
        "email": { "type": "string" },
        "phone": { "type": "string" }
      }
    }
  },
  "nextStepId": "done"
}
```

### `switch-case`

Branches to different step chains based on the value of an expression. Each case's chain runs until a step with no `nextStepId`, then execution continues with this step's `nextStepId`. A case with `type: "default"` serves as the fallback.

```json
{
  "id": "route",
  "name": "Route by account type",
  "description": "Handle different account types",
  "type": "switch-case",
  "params": {
    "switchOn": { "type": "jmespath", "expression": "classify.accountType" },
    "cases": [
      {
        "value": { "type": "literal", "value": "enterprise" },
        "branchBodyStepId": "enterprise_flow"
      },
      {
        "value": { "type": "default" },
        "branchBodyStepId": "default_flow"
      }
    ]
  },
  "nextStepId": "done"
}
```

### `for-each`

Iterates over an array and executes a chain of steps for each item. The current item is available in JMESPath scope via the `itemName`. Once all items are processed, execution continues with `nextStepId`.

```json
{
  "id": "process_tickets",
  "name": "Process each ticket",
  "description": "Handle each open ticket",
  "type": "for-each",
  "params": {
    "target": { "type": "jmespath", "expression": "get_tickets.tickets" },
    "itemName": "ticket",
    "loopBodyStepId": "classify_ticket"
  },
  "nextStepId": "done"
}
```

### `sleep`

Pauses workflow execution for a specified duration.

```json
{
  "id": "wait_a_bit",
  "name": "Wait",
  "description": "Pause before retrying",
  "type": "sleep",
  "params": {
    "durationMs": { "type": "literal", "value": 5000 }
  },
  "nextStepId": "retry_step"
}
```

`durationMs` is an expression that must evaluate to a non-negative number (milliseconds).

### `wait-for-condition`

Repeatedly executes a condition-check chain and polls until a condition expression evaluates to truthy, or until a timeout or attempt limit is reached.

```json
{
  "id": "wait_for_job",
  "name": "Wait for job",
  "description": "Poll until the job is done",
  "type": "wait-for-condition",
  "params": {
    "conditionStepId": "check_job_status",
    "condition": { "type": "jmespath", "expression": "check_job_status.done" },
    "maxAttempts": { "type": "literal", "value": 20 },
    "intervalMs": { "type": "literal", "value": 3000 },
    "backoffMultiplier": { "type": "literal", "value": 1.5 },
    "timeoutMs": { "type": "literal", "value": 120000 }
  },
  "nextStepId": "process_result"
}
```

| Field | Required | Description |
|---|---|---|
| `conditionStepId` | Yes | ID of the first step in the condition-check chain. The chain runs until a step with no `nextStepId`. |
| `condition` | Yes | Expression evaluated after each run of the chain. If truthy, the wait completes with that value as output. |
| `maxAttempts` | No | Maximum polling attempts before failing (default: `10`). |
| `intervalMs` | No | Milliseconds between attempts (default: `1000`). |
| `backoffMultiplier` | No | Multiplier applied to the interval after each attempt (default: `1`, no backoff). |
| `timeoutMs` | No | Hard timeout in milliseconds. If elapsed time exceeds this, the step fails regardless of remaining attempts. |

### `agent-loop`

Delegates work to an autonomous agent with its own tool-calling loop. The agent receives instructions, calls tools as needed, and produces structured output.

::: warning Use sparingly
`agent-loop` sacrifices the determinism that is the core value of the workflow DSL. Prefer explicit `tool-call`, `llm-prompt`, and control flow steps whenever the task can be decomposed into predictable operations.
:::

```json
{
  "id": "research",
  "name": "Research topic",
  "description": "Agent researches the topic autonomously",
  "type": "agent-loop",
  "params": {
    "instructions": "Research ${input.topic} and return a structured summary with key findings and sources.",
    "tools": ["web-search", "fetch-url"],
    "outputFormat": {
      "type": "object",
      "required": ["summary", "sources"],
      "properties": {
        "summary": { "type": "string" },
        "sources": { "type": "array", "items": { "type": "string" } }
      }
    },
    "maxSteps": { "type": "literal", "value": 15 }
  },
  "nextStepId": "done"
}
```

| Field | Required | Description |
|---|---|---|
| `instructions` | Yes | Template string with task instructions. Supports `${...}` JMESPath expressions for data interpolation. |
| `tools` | Yes | Array of tool names from the workflow's tool set the agent may use. |
| `outputFormat` | Yes | JSON Schema specifying the structured output format. |
| `maxSteps` | No | Maximum tool-calling steps the agent may take (default: `10`). |

### `end`

Terminates a branch. Optionally specify an `output` expression whose evaluated value becomes the workflow's output.

```json
{
  "id": "done",
  "name": "Done",
  "description": "Return the final result",
  "type": "end",
  "params": {
    "output": { "type": "jmespath", "expression": "classify.accountType" }
  }
}
```

## Expressions

All dynamic values in workflows use expression objects. There are two types:

### Literal

A static value known at compile time:

```json
{ "type": "literal", "value": "hello@example.com" }
```

### JMESPath

A [JMESPath](https://jmespath.org/) expression evaluated at runtime against the current scope. The scope contains outputs from all previously executed steps (keyed by step ID) and any loop variables.

```json
{ "type": "jmespath", "expression": "fetch_user.email" }
```

Common patterns:
- `stepId.field` — access a field from a previous step's output
- `stepId.items[0]` — array indexing
- `itemName.field` — access a field from the current loop item (inside `for-each`)
- `length(stepId.items)` — JMESPath built-in functions

### Template Strings

`llm-prompt` steps use template strings where JMESPath expressions are embedded in `${...}`:

```
"Summarize this ticket: ${ticket.subject}\n\nBody: ${ticket.body}"
```

## Data Flow

Steps communicate through a shared scope:

1. Each step's output is stored under its step ID
2. Subsequent steps reference previous outputs via JMESPath expressions
3. Loop variables (`itemName` in `for-each`) are added to scope within the loop body
4. The `start` step's output is the validated input data, accessible by its step ID

## Complete Example

A workflow that fetches support tickets, classifies each one, and pages the on-call engineer for critical issues:

```json
{
  "initialStepId": "get_tickets",
  "steps": [
    {
      "id": "get_tickets",
      "name": "Get open tickets",
      "description": "Fetch all currently open support tickets",
      "type": "tool-call",
      "params": {
        "toolName": "get-open-tickets",
        "toolInput": {}
      },
      "nextStepId": "process_each"
    },
    {
      "id": "process_each",
      "name": "Process each ticket",
      "description": "Classify and route each ticket",
      "type": "for-each",
      "params": {
        "target": { "type": "jmespath", "expression": "get_tickets.tickets" },
        "itemName": "ticket",
        "loopBodyStepId": "classify"
      },
      "nextStepId": "done"
    },
    {
      "id": "classify",
      "name": "Classify ticket",
      "description": "Determine ticket severity",
      "type": "llm-prompt",
      "params": {
        "prompt": "Classify this support ticket by severity.\n\nSubject: ${ticket.subject}\nBody: ${ticket.body}",
        "outputFormat": {
          "type": "object",
          "required": ["severity"],
          "properties": {
            "severity": {
              "type": "string",
              "enum": ["critical", "high", "medium", "low"]
            }
          }
        }
      },
      "nextStepId": "check_severity"
    },
    {
      "id": "check_severity",
      "name": "Check if critical",
      "description": "Route critical tickets to paging",
      "type": "switch-case",
      "params": {
        "switchOn": { "type": "jmespath", "expression": "classify.severity" },
        "cases": [
          {
            "value": { "type": "literal", "value": "critical" },
            "branchBodyStepId": "page_engineer"
          }
        ]
      }
    },
    {
      "id": "page_engineer",
      "name": "Page on-call",
      "description": "Page the on-call engineer for critical ticket",
      "type": "tool-call",
      "params": {
        "toolName": "page-oncall",
        "toolInput": {
          "ticketId": { "type": "jmespath", "expression": "ticket.id" },
          "severity": { "type": "literal", "value": "critical" }
        }
      }
    },
    {
      "id": "done",
      "name": "Done",
      "description": "Workflow complete",
      "type": "end"
    }
  ]
}
```
