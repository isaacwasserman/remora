import type { ExpressionSuggestion, ScopeEntry } from "@remoraflow/core";
import { enumerateSuggestions } from "@remoraflow/core";
import { createContext, useContext, useMemo } from "react";

interface ExpressionScopeContextValue {
  scope: ScopeEntry[];
  suggestions: ExpressionSuggestion[];
}

const ExpressionScopeContext =
  createContext<ExpressionScopeContextValue | null>(null);

export function ExpressionScopeProvider({
  scope,
  children,
}: {
  scope: ScopeEntry[] | undefined;
  children: React.ReactNode;
}) {
  const value = useMemo<ExpressionScopeContextValue | null>(() => {
    if (!scope || scope.length === 0) return null;
    return { scope, suggestions: enumerateSuggestions(scope) };
  }, [scope]);

  return (
    <ExpressionScopeContext.Provider value={value}>
      {children}
    </ExpressionScopeContext.Provider>
  );
}

/** Returns the in-scope expression suggestions for the surrounding step, or null. */
export function useExpressionScope(): ExpressionScopeContextValue | null {
  return useContext(ExpressionScopeContext);
}
