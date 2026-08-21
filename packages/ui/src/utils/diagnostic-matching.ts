import type { ValidatorDiagnostic } from "@remoraflow/core";

/**
 * Matches diagnostics whose path (after the `steps[i]` prefix) starts with the
 * given field path segments. The panel receives diagnostics already filtered
 * to the current step, so this compares from `path[2]` onward.
 */
export function matchFieldDiagnostics(
    diagnostics: ValidatorDiagnostic[],
    fieldPath: PropertyKey[],
): ValidatorDiagnostic[] {
    return diagnostics.filter((d) => {
        if (!d.path) return false;
        const rest = d.path.slice(2);
        if (rest.length < fieldPath.length) return false;
        return fieldPath.every((seg, i) => rest[i] === seg);
    });
}

/**
 * Diagnostics that don't belong to a specific field — kept for the step-level
 * summary. Anything under `params.*` or the top-level name/description/id is
 * routed inline; the rest (control flow, missing tool, feature flags, etc.)
 * stays here.
 */
export function stepLevelDiagnostics(
    diagnostics: ValidatorDiagnostic[],
): ValidatorDiagnostic[] {
    const FIELD_ROOTS = new Set(["params", "name", "description", "id"]);
    return diagnostics.filter((d) => {
        if (!d.path || d.path.length <= 2) return true;
        const seg = d.path[2];
        return typeof seg !== "string" || !FIELD_ROOTS.has(seg);
    });
}

/** Diagnostics that are errors (used to ring a field red). */
export function hasErrors(diagnostics: ValidatorDiagnostic[]): boolean {
    return diagnostics.some((d) => d.severity === "error");
}
