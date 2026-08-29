---
layout: home

hero:
  text: Workflows by agents, for agents.
  image:
    src: /remoraflow-logo.svg
    alt: Remora
  tagline: A JSON-based workflow language where AI agents define, compile, and execute reliable and consistent workflows.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Try the Demo
      link: /demo/
    - theme: alt
      text: View on GitHub
      link: https://github.com/isaacwasserman/remora
    - theme: alt
      text: llms.txt
      link: /llms.txt

features:
  - title: By Agents, For Agents
    icon: 🤖
    details: Purpose-built for agents to author. An agent solves a task once, captures the logic as a validated workflow, and that workflow runs deterministically from that point forward with no re-prompting and no drift.
  - title: Deterministic When it Matters
    icon: 🚠
    details: Tool calls, branching, and data flow execute with fixed logic. THat means no prompt drift and no hallucinated detours. LLM intelligence is scoped to the steps that need it, so the rest of your workflow behaves the same way every time.
  - title: Ahead-of-Time Validation
    icon: 🤝
    details: Validate the control-flow, data-flow, and types before the workflow is ever deployed. Through careful static analysis, Remoraflow catches broken references, type mismatches, and unreachable steps at compile time, eliminating runtime surprises and wasted LLM calls.
  - title: Access Control and Human-in-the-Loop
    icon: 🔐
    details: Define approval policies that determine which tools can run, which inputs they can have, and whether they require a user to sign off. Workflows can also request explicit user input, delegating sensitive decisions to an authority rather than an LLM.
  - title: Durable Execution
    icon: ⏸️
    details: Compatible with Temporal, Inngest, and AWS Durable Execution out of the box. Workflows sleep or block on conditions for long periods without consuming serverless resources, and resume exactly where they left off.
  
---
