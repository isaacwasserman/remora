import type { ToolDefinitionMap } from "@remoraflow/core";
import { createContext, useContext } from "react";

export const ToolSchemasContext = createContext<ToolDefinitionMap | undefined>(
  undefined,
);

export function useToolSchemas(): ToolDefinitionMap | undefined {
  return useContext(ToolSchemasContext);
}

export function useToolDisplayName(toolName: string): string {
  const schemas = useToolSchemas();
  return schemas?.[toolName]?.displayName ?? toolName;
}
