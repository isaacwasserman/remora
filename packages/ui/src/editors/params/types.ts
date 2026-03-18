export type Expression =
  | { type: "literal"; value: unknown }
  | { type: "jmespath"; expression: string }
  | { type: "template"; template: string };

export type StepOnChange = (updates: Record<string, unknown>) => void;
