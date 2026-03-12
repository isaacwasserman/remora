---
layout: home

hero:
  name: Remora
  text: Workflows by agents, for agents.
  tagline: A JSON-based workflow DSL where AI agents define, compile, and execute structured workflows.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/isaacwasserman/remora
    - theme: alt
      text: llm.txt
      link: /llm.txt

features:
  - title: Multi-Pass Compiler
    details: 7-pass compiler validates workflow definitions and produces execution graphs with structured diagnostics — errors and warnings with specific codes and locations.
  - title: Runtime Executor
    details: Walks compiled graphs step by step, handling tool calls, LLM prompts, data extraction, branching, and loops with automatic retry for recoverable errors.
  - title: Constrained Tool Schemas
    details: The compiler determines which tool parameters are static vs. dynamic, enabling human supervisors to review and approve a limited set of behaviors ahead of time.
  - title: Agent-Authored
    details: Workflows are JSON objects that agents produce via a single tool call. The compiler gives immediate feedback so agents can iterate within a single conversation turn.
  - title: Vercel AI SDK Compatible
    details: Works with any AI SDK Agent or LanguageModel. Bring your own model provider — Anthropic, OpenAI, or any other AI SDK-compatible provider.
  - title: Visual Workflow Viewer
    details: React component built on React Flow renders compiled workflows as interactive DAGs with step detail panels and minimap navigation.
---
