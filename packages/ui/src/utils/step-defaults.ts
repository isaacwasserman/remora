import type { WorkflowStep } from "@remoraflow/core";

let counter = 0;

function nextId(type: string, existingIds?: Set<string>): string {
  counter++;
  let id = `${type.replace(/-/g, "_")}_${counter}`;
  if (existingIds) {
    while (existingIds.has(id)) {
      counter++;
      id = `${type.replace(/-/g, "_")}_${counter}`;
    }
  }
  return id;
}

/** Reset the auto-increment counter (useful for tests). */
export function resetStepCounter(): void {
  counter = 0;
}

/** Create a new step with sensible defaults for the given type. */
export function createDefaultStep(
  type: WorkflowStep["type"],
  id?: string,
  existingIds?: Set<string>,
): WorkflowStep {
  const base = {
    id: id ?? nextId(type, existingIds),
    name: defaultName(type),
    description: "",
  };

  switch (type) {
    case "start":
      return { ...base, type: "start" };
    case "end":
      return { ...base, type: "end" };
    case "tool-call":
      return {
        ...base,
        type: "tool-call",
        params: { toolName: "", toolInput: {} },
      };
    case "llm-prompt":
      return {
        ...base,
        type: "llm-prompt",
        params: {
          prompt: "",
          outputFormat: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
      };
    case "extract-data":
      return {
        ...base,
        type: "extract-data",
        params: {
          sourceData: { type: "literal", value: "" },
          outputFormat: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
      };
    case "switch-case":
      return {
        ...base,
        type: "switch-case",
        params: {
          switchOn: { type: "literal", value: "" },
          cases: [{ value: { type: "default" }, branchBodyStepId: "" }],
        },
      };
    case "for-each":
      return {
        ...base,
        type: "for-each",
        params: {
          target: { type: "literal", value: [] },
          itemName: "item",
          loopBodyStepId: "",
        },
      };
    case "sleep":
      return {
        ...base,
        type: "sleep",
        params: { durationMs: { type: "literal", value: 1000 } },
      };
    case "wait-for-condition":
      return {
        ...base,
        type: "wait-for-condition",
        params: {
          conditionStepId: "",
          condition: { type: "literal", value: false },
        },
      };
    case "agent-loop":
      return {
        ...base,
        type: "agent-loop",
        params: {
          instructions: "",
          tools: [],
          outputFormat: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
      };
  }
}

function defaultName(type: WorkflowStep["type"]): string {
  const names: Record<WorkflowStep["type"], string> = {
    start: "Start",
    end: "End",
    "tool-call": "Tool Call",
    "llm-prompt": "LLM Prompt",
    "extract-data": "Extract Data",
    "switch-case": "Switch Case",
    "for-each": "For Each",
    sleep: "Sleep",
    "wait-for-condition": "Wait for Condition",
    "agent-loop": "Agent Loop",
  };
  return names[type];
}
