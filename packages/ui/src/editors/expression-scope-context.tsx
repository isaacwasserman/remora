import { createContext, useContext, useMemo } from "react";

export type ExpressionSuggestion = {
    path: string;
    rootKind: "input" | "stepOutput" | "loopVar";
    type?: string;
    description?: string;
};
export type ScopeEntry = { key: string; type?: string };

function enumerateSuggestions(_scope: ScopeEntry[]): ExpressionSuggestion[] {
    return [];
}

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
