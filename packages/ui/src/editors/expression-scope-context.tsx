import type { ScopeBinding } from "@remoraflow/core";
import { createContext, useContext, useMemo } from "react";

export type ExpressionSuggestion = {
    path: string;
    rootKind: "input" | "stepOutput" | "loopVar";
    type?: string;
    description?: string;
};

export type ScopeEntry = { key: string; type?: string };

function rootKindFromBinding(
    binding: ScopeBinding,
): ExpressionSuggestion["rootKind"] {
    switch (binding.origin.kind) {
        case "workflow-input":
            return "input";
        case "step-output":
            return "stepOutput";
        case "loop-variable":
            return "loopVar";
    }
}

function enumerateSchemaKeys(
    schema: unknown,
    prefix: string,
    rootKind: ExpressionSuggestion["rootKind"],
    _description: string | undefined,
    results: ExpressionSuggestion[],
    depth: number,
    maxDepth: number,
): void {
    if (depth > maxDepth) return;
    if (!schema || typeof schema !== "object") return;
    const s = schema as Record<string, unknown>;
    if (s.type === "object" && s.properties) {
        const props = s.properties as Record<string, unknown>;
        for (const key of Object.keys(props)) {
            const path = prefix ? `${prefix}.${key}` : key;
            const propSchema = props[key] as
                | Record<string, unknown>
                | undefined;
            results.push({
                path,
                rootKind,
                type: (propSchema?.type as string) ?? undefined,
                description: (propSchema?.description as string) ?? undefined,
            });
            enumerateSchemaKeys(
                propSchema,
                path,
                rootKind,
                undefined,
                results,
                depth + 1,
                maxDepth,
            );
        }
    }
    if (s.type === "array" && s.items && !Array.isArray(s.items)) {
        const itemPath = `${prefix}[*]`;
        results.push({ path: itemPath, rootKind, type: "array-item" });
        enumerateSchemaKeys(
            s.items,
            itemPath,
            rootKind,
            undefined,
            results,
            depth + 1,
            maxDepth,
        );
    }
}

function enumerateSuggestions(
    bindings: ScopeBinding[],
    maxDepth = 3,
    limit = 300,
): ExpressionSuggestion[] {
    const results: ExpressionSuggestion[] = [];
    for (const binding of bindings) {
        if (results.length >= limit) break;
        const rootKind = rootKindFromBinding(binding);
        results.push({
            path: binding.name,
            rootKind,
            type:
                typeof binding.schema === "object" &&
                binding.schema &&
                "type" in binding.schema
                    ? (binding.schema as { type?: string }).type
                    : undefined,
            description: binding.description,
        });
        enumerateSchemaKeys(
            binding.schema,
            binding.name,
            rootKind,
            binding.description,
            results,
            1,
            maxDepth,
        );
    }
    return results.slice(0, limit);
}

function enumerateSuggestionsFromEntries(
    scope: ScopeEntry[],
): ExpressionSuggestion[] {
    return scope.map((entry) => ({
        path: entry.key,
        rootKind: entry.key === "input" ? "input" : "stepOutput",
        type: entry.type,
    }));
}

interface ExpressionScopeContextValue {
    scope: ScopeEntry[];
    suggestions: ExpressionSuggestion[];
}

const ExpressionScopeContext =
    createContext<ExpressionScopeContextValue | null>(null);

export function ExpressionScopeProvider({
    scope,
    bindings,
    children,
}: {
    scope?: ScopeEntry[];
    bindings?: ScopeBinding[];
    children: React.ReactNode;
}) {
    const value = useMemo<ExpressionScopeContextValue | null>(() => {
        if (bindings && bindings.length > 0) {
            const entries = bindings.map((b) => ({
                key: b.name,
                type:
                    typeof b.schema === "object" &&
                    b.schema &&
                    "type" in b.schema
                        ? (b.schema as { type?: string }).type
                        : undefined,
            }));
            return {
                scope: entries,
                suggestions: enumerateSuggestions(bindings),
            };
        }
        if (scope && scope.length > 0) {
            return {
                scope,
                suggestions: enumerateSuggestionsFromEntries(scope),
            };
        }
        return null;
    }, [scope, bindings]);

    return (
        <ExpressionScopeContext value={value}>
            {children}
        </ExpressionScopeContext>
    );
}

export function useExpressionScope(): ExpressionScopeContextValue | null {
    return useContext(ExpressionScopeContext);
}
