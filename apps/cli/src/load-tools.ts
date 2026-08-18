import { resolve } from "node:path";
import type { ToolSet } from "@remoraflow/core";
import { jsonSchema } from "ai";
import { analyzeFileFunctions } from "./script-to-tool";

async function discoverToolFiles(toolsPath: string): Promise<string[]> {
    const resolved = resolve(toolsPath);

    if (resolved.endsWith(".ts")) {
        const exists = await Bun.file(resolved).exists();
        if (!exists) throw new Error(`Tool file not found: ${resolved}`);
        return [resolved];
    }

    const entries: string[] = [];
    for await (const path of new Bun.Glob("**/*.ts").scan({
        cwd: resolved,
        absolute: true,
    })) {
        if (path.endsWith(".test.ts") || path.endsWith(".spec.ts")) continue;
        const basename = path.split("/").pop() ?? "";
        if (basename.startsWith("_")) continue;
        entries.push(path);
    }

    if (entries.length === 0) {
        throw new Error(`No .ts files found in: ${resolved}`);
    }

    return entries;
}

async function loadToolsFromFile(
    filePath: string,
): Promise<Record<string, ToolSet[string]>> {
    const schemas = analyzeFileFunctions(filePath);
    const mod = (await import(filePath)) as Record<string, unknown>;
    const exportedKeys = new Set(Object.keys(mod));

    const tools: Record<string, ToolSet[string]> = {};

    for (const schema of schemas) {
        if (!exportedKeys.has(schema.functionName)) continue;

        const fn = mod[schema.functionName];
        if (typeof fn !== "function") continue;

        const paramNames = Object.keys(schema.inputSchema.properties ?? {});

        tools[schema.functionName] = {
            inputSchema: jsonSchema(schema.inputSchema),
            outputSchema: jsonSchema(schema.outputSchema),
            execute: async (input: Record<string, unknown>) => {
                const args = paramNames.map((name) => input[name]);
                return await fn(...args);
            },
        };
    }

    return tools;
}

export async function loadToolSet(toolsPath: string): Promise<ToolSet> {
    const files = await discoverToolFiles(toolsPath);
    const toolSet: ToolSet = {};

    for (const file of files) {
        const fileTools = await loadToolsFromFile(file);
        for (const [name, tool] of Object.entries(fileTools)) {
            if (toolSet[name]) {
                console.warn(
                    `\x1b[33mWarning: duplicate tool name "${name}", later definition wins\x1b[0m`,
                );
            }
            toolSet[name] = tool;
        }
    }

    if (Object.keys(toolSet).length === 0) {
        throw new Error(`No exported functions found in: ${toolsPath}`);
    }

    return toolSet;
}
