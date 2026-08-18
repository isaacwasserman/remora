import { describe, expect, test } from "bun:test";
import { SETTINGS_CONSUMERS } from "./settings-consumers";
import { remoraflowSettingsSchema } from "./types";

/**
 * Builds a settings instance with all optional fields populated, then flattens
 * it to a list of dotted paths. This is the complete settings key set against
 * which the consumer map is checked.
 */
function allSettingsPaths(): string[][] {
    const resolved = remoraflowSettingsSchema.assert({
        stepRetry: { shouldRetry: (_: string) => true },
    });

    function flatten(obj: unknown, prefix: string[] = []): string[][] {
        if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
            return prefix.length > 0 ? [prefix] : [];
        }
        const out: string[][] = [];
        for (const [k, v] of Object.entries(obj)) {
            const path = [...prefix, k];
            if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                out.push(...flatten(v, path));
            } else {
                out.push(path);
            }
        }
        return out;
    }

    return flatten(resolved);
}

describe("SETTINGS_CONSUMERS: every settings field is consumed or marked intentional", () => {
    function findDeclaration(path: string[]): {
        declared: boolean;
        intentionallyUnconsumed?: boolean;
    } {
        for (const decl of Object.values(SETTINGS_CONSUMERS)) {
            if (
                decl.path.length === path.length &&
                decl.path.every((s, i) => s === path[i])
            ) {
                return {
                    declared: true,
                    intentionallyUnconsumed: decl.intentionallyUnconsumed,
                };
            }
        }
        return { declared: false };
    }

    test("every settings field has a consumer declaration", () => {
        for (const path of allSettingsPaths()) {
            const { declared } = findDeclaration(path);
            expect(
                declared,
                `Settings field ${path.join(".")} has no entry in SETTINGS_CONSUMERS`,
            ).toBe(true);
        }
    });

    test("no declared consumer points to a non-existent setting", () => {
        const allPaths = allSettingsPaths().map((p) => p.join("."));
        for (const decl of Object.values(SETTINGS_CONSUMERS)) {
            const joined = decl.path.join(".");
            expect(
                allPaths.includes(joined),
                `SETTINGS_CONSUMERS references ${joined}, but no such settings field exists`,
            ).toBe(true);
        }
    });

    test("every declared setting has at least one consumer or is marked intentional", () => {
        for (const [key, decl] of Object.entries(SETTINGS_CONSUMERS)) {
            if (decl.intentionallyUnconsumed) continue;
            expect(
                decl.consumers.length,
                `Settings field ${key} (${decl.path.join(".")}) has no consumers and is not marked intentionallyUnconsumed`,
            ).toBeGreaterThan(0);
        }
    });
});
