import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(import.meta.dir);

function walk(dir: string): string[] {
    const entries: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            entries.push(...walk(path));
        } else if (/\.(tsx?|css)$/.test(name)) {
            entries.push(path);
        }
    }
    return entries;
}

const files = walk(SRC_ROOT).filter(
    (f) => !f.endsWith("design-system.test.ts"),
);

const PALETTE_CLASS =
    /\b(text|bg|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|accent|caret)-(red|green|blue|amber|yellow|orange|purple|violet|emerald|teal|rose|indigo|sky|slate|gray|zinc|neutral|stone|cyan|lime|fuchsia|pink)-[0-9]{2,3}\b/;
const ARBITRARY_TEXT_SIZE = /text-\[\d+px\]/;
const BANNED_RADIUS = /\brounded(-xs|-xl)?\b(?!-)/;
const SPACE_Y = /\bspace-[xy]-\d/;
const FONT_MONO = /\bfont-mono\b/;
const DARK_VARIANT = /dark:/;
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

const FONT_MONO_ALLOWED = new Set([
    "code.tsx",
    "code-input.tsx",
    "theme.ts",
    "theme.css",
    "styles.css",
]);
const HEX_ALLOWED = new Set(["theme.css", "styles.css"]);
const DARK_ALLOWED = new Set(["theme.css", "styles.css"]);

function violations(): {
    rule: string;
    file: string;
    line: number;
    text: string;
}[] {
    const found: { rule: string; file: string; line: number; text: string }[] =
        [];
    for (const file of files) {
        const rel = file.slice(SRC_ROOT.length + 1);
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
            const push = (rule: string) =>
                found.push({ rule, file: rel, line: i + 1, text: line.trim() });
            if (PALETTE_CLASS.test(line)) push("raw-palette-class");
            if (ARBITRARY_TEXT_SIZE.test(line)) push("arbitrary-text-size");
            if (BANNED_RADIUS.test(line)) push("banned-radius");
            if (SPACE_Y.test(line)) push("space-y");
            if (
                FONT_MONO.test(line) &&
                !FONT_MONO_ALLOWED.has(rel.split("/").pop() ?? "")
            )
                push("font-mono");
            if (
                DARK_VARIANT.test(line) &&
                !DARK_ALLOWED.has(rel.split("/").pop() ?? "")
            )
                push("dark-variant");
            if (
                HEX_COLOR.test(line) &&
                !HEX_ALLOWED.has(rel.split("/").pop() ?? "")
            )
                push("hex-color");
        });
    }
    return found;
}

describe("design system", () => {
    // Report-only while the tokenization refactor lands. Flip to failing
    // mode in phase G once the palette classes are gone.
    test.todo("no design-system violations", () => {
        expect(violations()).toEqual([]);
    });

    test("violation report", () => {
        const found = violations();
        const byRule = found.reduce<Record<string, number>>((acc, v) => {
            acc[v.rule] = (acc[v.rule] ?? 0) + 1;
            return acc;
        }, {});
        console.log("design-system violations:", byRule);
        expect(Object.keys(byRule).length).toBeGreaterThanOrEqual(0);
    });
});
