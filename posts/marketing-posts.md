# Remora Marketing Posts

Links for all posts:
- GitHub: https://github.com/isaacwasserman/remora
- npm: `@isaacwasserman/remora`

---

# Hacker News

---

## HN Post 1 — Show HN: Agent Self-Authoring

**Audience:** AI researchers, agent framework builders
**Angle:** Contrarian — agents should write their own plans, not be constrained by guardrails
**Tone:** Opinionated, thought-provoking

**Title:** Show HN: Remora – A DSL where AI agents write their own workflows

**Body:**

Most agent tooling is about constraining agents — guardrails, chains, strict execution graphs designed by humans. Remora inverts this: the agent receives a task, authors a concrete workflow using a JSON-based DSL (tool calls, loops, conditionals, data extraction steps), and submits it for validation.

The validator returns structured diagnostics — specific error codes, step locations, field paths — so the agent can fix its own mistakes before anything runs. The workflow is a first-class artifact: versionable, diffable, re-runnable deterministically. Not a trace log after the fact.

Named after the remora fish that attaches to sharks rather than constraining them.

Early prototype, TypeScript, compatible with Vercel AI SDK. Looking for feedback from people building real agent systems.

https://github.com/isaacwasserman/remora

---

## HN Post 2 — Show HN: Constrained Tool Schemas

**Audience:** Security-minded developers, AI safety folks
**Tone:** Precise, understated

**Title:** Show HN: Remora – Know exactly what an agent workflow will do before it runs

**Body:**

When an agent authors a Remora workflow, the validator analyzes every tool call and classifies each parameter as static (literal value known before execution) or dynamic (resolved at runtime from previous step outputs). This produces a narrowed input schema per tool.

A workflow that calls `sendEmail` with a fixed template and a dynamic recipient is meaningfully different from one with unconstrained email API access. The constrained schemas make this distinction explicit, so you can pre-approve limited behaviors without needing human-in-the-loop for every execution.

This isn't runtime guardrails — it's static analysis of what the workflow *can* do, determined before it runs.

https://github.com/isaacwasserman/remora

---

## HN Post 3 — Show HN: Workflows as Artifacts

**Audience:** Senior developers, infrastructure engineers
**Tone:** Understated, practical

**Title:** Show HN: Remora – Agent workflows as inspectable, deterministic artifacts

**Body:**

Agent systems today typically produce execution traces — you find out what happened after the fact. Remora takes a different approach: the agent defines a workflow up front using a JSON DSL, it gets validated, and the result is an execution graph you can inspect before anything runs.

Steps are connected by JMESPath expressions for data flow, so you can follow exactly how data moves between tool calls, LLM prompts, and branching logic. No hidden state, no opaque chains. Workflows can be versioned, diffed, and re-run with the same inputs for the same results.

TypeScript, early prototype, Vercel AI SDK compatible. The viewer renders workflows as interactive DAGs if you want to see what your agents are planning.

https://github.com/isaacwasserman/remora

---

## HN Post 4 — Show HN: The Feedback Loop

**Audience:** Developers building with LLMs, TypeScript practitioners
**Tone:** Opinionated, concrete

**Title:** Show HN: Remora – Agents that iterate on validation errors like developers iterate on type errors

**Body:**

The core idea: an agent writes a workflow definition (JSON with tool calls, loops, conditionals), submits it to a validator, gets back structured diagnostics with specific error codes and locations, fixes the issues, and resubmits — all within a single conversation turn. Same feedback loop you get from a type checker, but for agent plans.

The diagnostics aren't vague warnings. `CYCLE_DETECTED` tells you which steps form the cycle. `MISSING_NEXT_STEP` points to the exact field. `EXTRA_TOOL_INPUT_KEY` names the parameter that doesn't exist. The agent reads these and self-corrects.

Available on npm as `@isaacwasserman/remora`. Early prototype — the validator, executor, and workflow viewer work, but expect breaking changes.

https://github.com/isaacwasserman/remora

---
---

# Discord Developer Communities

---

## Discord Post 1 — Quick Intro / Getting Started

**Audience:** Junior to mid-level developers, AI hobbyists
**Angle:** Low barrier to entry, "check this out"

hey, been working on something called **Remora** — it's a workflow DSL where AI agents write their own executable plans

the idea is simple: instead of manually defining agent workflows, you describe a task and the agent generates a workflow using a JSON-based DSL with tool calls, loops, conditionals, and data extraction steps. the validator catches errors before anything runs, and the agent fixes them automatically

```ts
import { generateWorkflow } from "@isaacwasserman/remora";

const { workflow } = await generateWorkflow({
  model: yourModel,
  tools: yourToolSet,
  task: "Triage open support tickets — page on-call for critical ones, send a Slack digest for the rest"
});
```

the agent authors the workflow, the validator checks it, the agent iterates on errors, and you get back something you can actually inspect and re-run

early prototype but the core works. would love feedback from anyone building agent stuff

**GitHub:** https://github.com/isaacwasserman/remora
**npm:** `@isaacwasserman/remora`

---

## Discord Post 2 — What Workflows Actually Look Like

**Audience:** Mid-level developers who build automations
**Angle:** Walkthrough of a real workflow

so here's what an agent-written Remora workflow actually looks like — this is an order fulfillment example:

1. `get-orders` — fetch pending orders
2. `for-each` over orders → for each one:
   - `check-inventory` — call the inventory tool with `${currentItem.itemId}`
   - `switch-case` on `inStock`:
     - `true` → `reserve-inventory` → `create-shipment` → `notify-customer`
     - `false` → `flag-for-review`

data flows between steps using JMESPath expressions — so `check-inventory` gets its input from `${get-orders.orders[*]}` and the switch reads `${check-inventory.inStock}`

the key thing is: this isn't some opaque chain. it's a JSON document you can read, version, diff, and re-run. the agent wrote it, but you can inspect every step before it runs

if you've ever debugged an agent that silently did the wrong thing and wished you could see the plan beforehand... that's the problem this solves

https://github.com/isaacwasserman/remora

---

## Discord Post 3 — Diagnostics / Error Handling

**Audience:** Developers frustrated by opaque agent failures
**Angle:** Problem-first — silent failures suck

ever had an agent workflow silently fail or do something unexpected and you have no idea why?

Remora validates workflows before they run and returns structured diagnostics — not vague "something went wrong" messages, actual specific errors:

```
ERROR  CYCLE_DETECTED         step "check" → "process" → "check"
ERROR  MISSING_NEXT_STEP      step "notify" references "send-report" which doesn't exist
ERROR  EXTRA_TOOL_INPUT_KEY   step "create-order" passes "priorty" — did you mean "priority"?
WARN   BRANCH_BODY_ESCAPES    switch case "default" jumps outside the switch
```

the agent reads these, fixes its workflow, and resubmits — all before anything actually executes. basically `tsc` but for agent plans

it's early stage but the validator catches a lot of real issues. worth checking out if you're building anything with agent tool-calling

https://github.com/isaacwasserman/remora

---

## Discord Post 4 — The Workflow Viewer

**Audience:** Frontend devs, visual learners, people building agent UIs
**Angle:** Visual — see what your agents are planning

we built a React component that renders agent workflows as interactive DAGs 👀

it takes a compiled Remora workflow and shows it as a directed graph — tool calls, LLM prompts, loops, conditionals, all laid out visually with data flow between steps. built on React Flow (`@xyflow/react`)

useful for:
- debugging workflows before running them
- showing non-technical stakeholders what an agent will actually do
- building agent UIs where users can see and approve plans

you can try it locally:
```bash
bun install
bun run viewer
```

the plan is to ship the viewer as embeddable React components so you can drop it into your own apps. right now it's a dev tool but it already works for inspecting workflows

https://github.com/isaacwasserman/remora

---
---

# AI / Developer Community Posts

---

## AI/Dev Post 1 — The "Why" Post

**Audience:** AI engineers and researchers building agent systems
**Angle:** The philosophical shift — problem statement first

### Rethinking agent control: let agents commit to plans, then validate the plans

There's a fundamental tension in current agent frameworks: give agents freedom and they become unpredictable. Add guardrails and they lose capability. Most tooling tries to find a sweet spot on this spectrum — constrained enough to be safe, flexible enough to be useful.

Remora takes a different approach entirely. Instead of constraining what an agent *can* do, it asks the agent to commit to a plan up front. The agent receives a task, authors a concrete workflow using a JSON-based DSL (tool calls, loops, switch statements, data extraction steps connected by JMESPath expressions), and submits it for validation. The validator returns structured diagnostics. The agent iterates. The result is a well-defined execution graph — not a set of instructions, but a concrete artifact you can inspect, version, and re-run deterministically.

This reframes the safety question. Instead of "should I let this agent run?" you ask "is this specific plan acceptable?" The constrained tool schema analysis makes this practical: for every tool call in the workflow, the validator determines which parameters are static (literal values) and which are dynamic (resolved at runtime). A workflow that sends emails with a fixed template to dynamic recipients is provably different from one with unconstrained email access.

It's an early prototype (v0.1.0, TypeScript, Vercel AI SDK compatible), but the core validator, executor, and workflow viewer are functional. We're looking for feedback from people who've felt this tension in their own agent systems.

https://github.com/isaacwasserman/remora

---

## AI/Dev Post 2 — The Validator Deep Dive

**Audience:** Senior AI engineers, people building agent infrastructure
**Angle:** Technical depth on validation and diagnostics

### How Remora validates agent-authored workflows

When an agent submits a Remora workflow, it goes through a structured validation pipeline before it can execute. Here's what gets checked:

**Graph construction** — The workflow steps are assembled into a directed acyclic graph. Cycles are detected and reported with the exact step chain that forms the cycle. Duplicate step IDs are caught. Unreachable steps are flagged.

**Reference validation** — Every `nextStepId`, every branch target in a switch-case, every loop body entry point is verified to actually exist. A typo in a step ID becomes a specific `MISSING_NEXT_STEP` error pointing to the exact field, not a runtime crash.

**Control flow validation** — Branch bodies that jump outside their parent switch, loop bodies that escape their for-each, end steps with next-step references — these structural issues get caught with targeted diagnostics.

**JMESPath validation** — All data flow expressions are parsed and checked. Forward references (using a step's output before it runs) are caught. Invalid root references are flagged. Syntax errors get clear messages.

**Tool validation** — Every tool call is checked against the available tool schemas. Missing required parameters, extra parameters that don't exist, type mismatches — all caught before execution.

**Constrained schema generation** — For each tool used in the workflow, a narrowed input schema is produced showing exactly which parameters are static vs. dynamic across all call sites.

Every diagnostic has a severity (error/warning), a specific code (like `CYCLE_DETECTED`, `JMESPATH_FORWARD_REFERENCE`, `EXTRA_TOOL_INPUT_KEY`), a step location, and a field path. Agents read these and self-correct within the same conversation turn — the same feedback loop developers get from type checkers.

The result is that by the time a workflow reaches the executor, it's structurally sound. Tool calls reference real tools with valid parameters. Data flows between steps through verified expressions. Control flow is well-formed.

https://github.com/isaacwasserman/remora

---

## AI/Dev Post 3 — Constrained Tool Schemas Explained

**Audience:** AI safety practitioners, enterprise AI teams
**Angle:** Safety through static analysis

### How do you know what an agent workflow will actually do?

Most agent observability is retrospective — you look at logs after execution. Remora's constrained tool schemas give you a prospective answer: before the workflow runs, you know exactly which tools will be called, with which parameters, and whether those parameters are determined at definition time or computed at runtime.

Here's how it works. The validator walks every tool-call step in a workflow and classifies each parameter:

- **Static**: The value is a literal, known before execution. Example: `template: "order-confirmation"`.
- **Dynamic**: The value is a JMESPath expression resolved from previous step outputs at runtime. Example: `recipient: "${get-order.customerEmail}"`.

This produces a `ConstrainedToolSchema` per tool — a narrowed version of the tool's input schema reflecting only what this specific workflow actually uses. If a tool has 15 parameters but the workflow only uses 3 of them (2 static, 1 dynamic), the constrained schema reflects exactly that.

The `fullyStatic` flag is the key governance signal. When a tool invocation is fully static — every parameter is a literal — you know at validation time exactly what it will do. No runtime surprises. For dynamic parameters, you know the shape and source of the data, even if you don't know the exact value.

This enables a practical approval workflow: review the constrained schemas for a workflow, approve the limited set of behaviors, and let it run without human-in-the-loop supervision. When the constrained schemas change (because the agent authored a different workflow), that triggers a new review.

The distinction between "this workflow can send emails with a specific template to dynamically-determined recipients" and "this workflow has unconstrained access to the email API" is the difference between something you can pre-approve and something you can't.

https://github.com/isaacwasserman/remora

---

## AI/Dev Post 4 — From Natural Language to Executable Workflow

**Audience:** Developers evaluating agent frameworks, AI product builders
**Angle:** The complete pipeline, show-don't-tell

### Describe a task. Get back a validated, executable workflow.

Remora includes a workflow generator that bridges the gap between "here's what I want" and "here's a validated execution plan." The pipeline:

1. You provide a task description in natural language, a set of available tools, and an LLM.
2. The generator gives the agent a system prompt explaining the DSL syntax (step types, JMESPath expressions, control flow) and the serialized schemas of all available tools.
3. The agent authors a workflow JSON and submits it via a `createWorkflow` tool call.
4. The validator checks it and returns structured diagnostics.
5. If there are errors, the agent reads them, fixes the workflow, and resubmits.
6. This loop continues until the workflow validates cleanly.

All of this happens within a single `generateText` call — the agent iterates on validation errors the way a developer iterates on type errors, except the feedback loop is automatic.

```ts
import { generateWorkflow } from "@isaacwasserman/remora";
import { openai } from "@ai-sdk/openai";

const { workflow, compiledWorkflow } = await generateWorkflow({
  model: openai("gpt-4o"),
  tools: myToolSet,
  task: "Review pending orders: check inventory for each item, reserve and ship if in stock, flag for review if not"
});

// compiledWorkflow is a validated execution graph ready to run
// workflow is the raw JSON definition — inspectable, versionable
```

The compiled workflow has verified tool calls, validated data flow, and constrained tool schemas. You can inspect it, show it to a stakeholder, render it in the workflow viewer, or hand it to the executor.

What you get isn't a black box — it's a concrete plan you can read.

https://github.com/isaacwasserman/remora

---
---

# LinkedIn

---

## LinkedIn Post 1 — The Executive/Management Pitch

**Audience:** Engineering managers, VPs of Engineering, CTOs
**Angle:** Auditability and governance

**Your AI agents are making decisions you can't audit.**

When an AI agent processes a support ticket, fulfills an order, or moderates content, what exactly did it decide to do? Most agent systems give you logs after the fact — you find out what happened when something goes wrong.

Remora takes a fundamentally different approach. Before an agent executes anything, it authors a concrete workflow — a structured plan specifying every tool call, every decision branch, every data flow. This workflow is validated and produces an execution graph you can inspect before a single action is taken.

More importantly, Remora's constrained tool schema analysis tells you exactly which tools will be called and whether their parameters are fixed values or computed at runtime. This means you can answer a question that matters for governance: "Can this workflow do anything I haven't explicitly reviewed?"

When every parameter of a tool call is a known literal, you have a fully static invocation — deterministic, pre-approvable, no surprises. When parameters are dynamic, you still know their shape and data source. This isn't post-hoc observability. It's pre-execution transparency.

For teams deploying AI agents in production, this is the difference between "we'll review the logs if something goes wrong" and "we reviewed the plan before it ran."

Open source, early prototype: https://github.com/isaacwasserman/remora

---

## LinkedIn Post 2 — The Developer Productivity Angle

**Audience:** Engineering leads, senior developers, AI team leads
**Angle:** Reduced debugging, predictable behavior

**We spent days debugging agent failures that validation could have caught in milliseconds.**

If you're building with AI agents, you've probably experienced this: an agent calls a tool with the wrong parameters, references data that doesn't exist yet, or gets stuck in a loop — and you only find out at runtime, buried in logs.

Remora validates agent workflows before they run. The agent authors a plan using a JSON-based DSL, and the validator catches structural issues immediately: cycles in the execution graph, references to nonexistent steps, tool calls with invalid parameters, data flow expressions that reference outputs that haven't been produced yet.

The diagnostics aren't vague. Each error has a specific code (`CYCLE_DETECTED`, `MISSING_NEXT_STEP`, `EXTRA_TOOL_INPUT_KEY`), points to the exact step and field, and is structured so the agent can read it and self-correct — within the same conversation turn.

The result: by the time a workflow reaches execution, it's structurally sound. And because workflows are JSON artifacts, debugging is reading a document, not scrubbing through chat logs. You can diff two workflow versions to see exactly what changed. You can re-run a workflow with the same inputs and get the same execution path.

For teams that have lost hours to opaque agent failures, this is a meaningful quality-of-life improvement.

https://github.com/isaacwasserman/remora

---

## LinkedIn Post 3 — The Enterprise Compliance Angle

**Audience:** Enterprise architects, compliance officers, risk managers
**Angle:** Regulatory readiness

**Can you explain to a regulator exactly what your AI agent will do before it does it?**

As AI agents move from experiments to production systems — processing customer data, making financial decisions, sending communications — the question of accountability becomes urgent. Audit trails after the fact are necessary but insufficient. Regulators and internal governance teams increasingly want to understand what an AI system *will* do, not just what it *did*.

Remora provides a concrete mechanism for this. When an agent authors a workflow, the validator produces constrained tool schemas — a manifest of every tool invocation, every parameter, and whether each parameter is a static literal or a dynamic value computed at runtime.

This enables a practical governance model:
- **Fully static tool calls** (all parameters are literals) can be reviewed and pre-approved. They will do exactly the same thing every time.
- **Partially dynamic tool calls** have known shapes and data sources, even when exact values aren't determined until runtime. Reviewers can assess the boundaries of what's possible.
- **When a workflow changes**, the constrained schemas change, triggering a new review cycle.

This isn't a conceptual framework — it's structured data produced automatically by the validator. It integrates into existing approval workflows and provides the kind of documentation that compliance teams can actually work with.

Open source (GPL-3.0), auditable, early prototype: https://github.com/isaacwasserman/remora

---

## LinkedIn Post 4 — The Open Source Launch

**Audience:** Open source contributors, AI tooling enthusiasts, early adopters
**Angle:** Transparent early-stage launch, community invitation

**We just published v0.1.0 of an open-source workflow DSL for AI agents.**

Remora lets agents author their own executable workflows using a JSON-based DSL. The agent receives a task, defines a plan with tool calls, loops, conditionals, and data extraction steps, and submits it for validation. The validator returns structured diagnostics, the agent iterates, and the result is an inspectable execution graph that can be reviewed, versioned, and re-run deterministically.

The part we're most interested in feedback on: **constrained tool schemas**. The validator statically analyzes every tool call to determine which parameters are fixed literals vs. dynamic runtime values, producing a narrowed schema per tool. This makes it possible to pre-approve specific behaviors without needing human oversight for every execution.

Being transparent about where things stand: this is an early prototype. The API is unstable and will have breaking changes. The core validator, executor (Vercel AI SDK compatible), and React-based workflow viewer are functional, but there's a lot of work ahead.

Built with TypeScript and Bun. We'd especially value feedback on:
- DSL ergonomics — is the step/expression model intuitive?
- Validator coverage — what else should be caught before execution?
- Constrained schemas — is the static/dynamic distinction useful in practice?
- Viewer embeddability — would you use a React component to display agent workflows in your app?

If you're building agent systems and this resonates, we'd love your input.

https://github.com/isaacwasserman/remora
npm: `@isaacwasserman/remora`
