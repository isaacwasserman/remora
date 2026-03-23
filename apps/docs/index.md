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
    details: Purpose-built for agents to author, not just execute. An agent solves a task once, captures the logic as a validated workflow, and that workflow runs deterministically from that point forward — no re-prompting, no drift.
  - title: Deterministic When it Matters
    icon: 🚠
    details: Tool calls, branching, and data flow execute with fixed logic — no prompt drift, no hallucinated detours. LLM intelligence is scoped to the steps that need it, so the rest of your workflow behaves the same way every time.
  - title: Ahead-of-Time Compilation
    icon: 🤝
    details: Validate the control-flow, data-flow, and types before the workflow is ever deployed. Through careful static analysis, RemoraFlow catches broken references, type mismatches, and unreachable steps at compile time, eliminating runtime surprises and wasted LLM calls.
  - title: Constrained Tool Schemas
    icon: 🎛️
    details: The compiler determines which tool parameters are static vs. dynamic, enabling human supervisors to review and approve a limited set of behaviors ahead of time.
  - title: Enterprise Controls, Built In
    icon: 🏢
    details: Block dangerous actions, require manager sign-off for sensitive ones, and let the safe ones through — with built-in approval routing, timeouts, and a full audit trail. Design flexible, cascading policies that every tool call passes through before it executes.
  - title: Runs Anywhere, Durably
    icon: ⛅️
    details: Plug in your favorite durable execution environment and workflows survive restarts, sleep across deployments, and resume exactly where they left off, all without wasting a penny. No framework yet? It runs just as well in a single process out of the box.
  
---
