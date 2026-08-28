# What is Remoraflow?

Remoraflow is a language for defining repeatable and reliable AI workflows.

Most AI "workflows" today are actually just long prompts that describe a procedure to be executed by an AI agent. These prompts describe steps and logic, but they never actually enforce it; at runtime, the agent is _asked_ to follow your prompt, but nothing prevents it from getting derailed or disregarding your instructions entirely. If all you're relying on your workflow to do is summarize your email, then who cares. But if you want to get _real work_ done with AI workflows, you're going to need some stronger guarantees.

Remoraflow is based on the premise that **most of what a workflow does should be deterministic**. Rather than handing an LLM a set of instructions at runtime, we can lock-in the logic ahead of time and only use AI when intelligence is necessary. Not only does this make AI workflows safer and more reliable but it also dramatically improves their token-efficiency, speed, and accuracy.

## Features

### Workflows by Agents, for Agents

Workflows consist of the same tool calls that your agent is used to, glued together deterministically with JMESPath expressions referencing each other. 

The Remoraflow syntax is JSON-based, meaning that the entire grammar can be described by a standard JSON schema. Pass this schema to to your favorite AI agent as a tool or structured output format, and you have yourself a workflow generating machine.

In a hurry? We also provide a reference `generateWorkflow` function that you can pass to your agent as a tool.

### Deterministic Execution (when you want it)

While many flows can be constructed entirely from sequences of tool calls and branching logic, the most advanced flows require the intelligence of an LLM. RemoraFlow provides LLM-based steps that make strong guarantees about their behavior through validation, intelligent retries, and access control.

### Ahead-of-Time Validation

Through careful ahead-of-time validation, the agent (or user) authoring a flow is provided deterministic diagnostics and feedback on whether its workflow works. The compiler provides traceable diagnostics that the agent can fix before the workflow ever runs.

### Access Control and Human-in-the-Loop

When creating automations, we're often asked to choose between utility and safety. We want workflows to be useful, but that means giving them access to sensitive, write-capable, high blast-radius operations. Remoraflow addresses this with approval policies and user interventions. As an application developer building on top of Remoraflow, you can define policies that determine which tools can run, which inputs they can have, and whether they require a user to sign-off on their execution. Additionally, workflows can include explicit requests for user input, allowing the workflow to delegate to an authority for sensitive decisions.

### Durable Execution

Remoraflow is compatible with leading durable execution environments (including Temporal.io, Inngest, and AWS Durable Execution), allowing workflows to sleep or block on conditions for long-periods without consuming serverless resources.

## Use Cases

### Unsupervised Jobs

Agents can construct repeatable workflows to be run as cron jobs, webhook handlers, etc. With Remoraflow, the execution is predictable and can be easily audited.

### Agent Plans

Workflows can be constructed interactively as an alternative to agent "plans".

Traditionally, agents like Claude Code present text-based plans that outline how they're going to complete a task, including subtasks, subtask dependency, logic, and subagent use.

However, text-based plans don't provide any guarantees of the agent's behavior; an agent can present a plan and decide to do something completely different during execution.

Using Remoraflow, agents can construct a workflow instead of a text-based plan, and the resultant workflow can be run with behavioral guarantees and an audit trail.