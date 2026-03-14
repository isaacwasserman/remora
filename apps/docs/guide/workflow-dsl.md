# Workflow DSL

Workflows are defined as JSON objects with an `initialStepId` and an array of `steps`. Each step has a type, a `nextStepId` for sequencing, and type-specific parameters. Data flows between steps through JMESPath expressions that reference previous step outputs.

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
