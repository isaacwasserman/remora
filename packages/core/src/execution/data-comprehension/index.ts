import { tool } from "ai";
import { type } from "arktype";
import dedent from "dedent";
import { search } from "jmespath";
import { estimateTokenCount, sliceByTokens } from "tokenx";
import { summarizeObjectStructure } from "../../schemistry";
import type { ToolSet } from "../../types";

type ScalarSourceData = null | string | number | boolean;
type StructuredSourceData = Record<string, unknown> | unknown[];
type PreparedSourceData = ScalarSourceData | StructuredSourceData;

function sourceDataIsStructured(
    data: PreparedSourceData,
): data is StructuredSourceData {
    if (typeof data === "object" && data !== null) {
        return true;
    }
    return false;
}

function stringifySourceData(data: PreparedSourceData): string {
    return sourceDataIsStructured(data) ? JSON.stringify(data) : String(data);
}

function prepareSourceData(
    rawSourceData: unknown,
):
    | { structured: true; data: StructuredSourceData }
    | { structured: false; data: ScalarSourceData } {
    let sourceData = rawSourceData;
    if (typeof sourceData === "string") {
        try {
            sourceData = JSON.parse(sourceData);
        } catch {}
    }
    if (typeof sourceData === "object" && sourceData !== null) {
        return {
            structured: true,
            data: sourceData as StructuredSourceData,
        };
    } else {
        return {
            structured: false,
            data: sourceData as ScalarSourceData,
        };
    }
}

function measureTokens(data: PreparedSourceData): number {
    const tokenCount = estimateTokenCount(stringifySourceData(data));
    return tokenCount;
}

export type DataPresentationResources = {
    prompt: string;
    tools: ToolSet;
};

function createDataPresentationPrompt(
    rawSourceData: unknown,
    options: { maxDataTokens: number } = {
        maxDataTokens: 8192,
    },
): {
    summarized: boolean;
    type: "object" | "string";
    sourceData: PreparedSourceData;
    serialization: string;
} {
    const { structured, data: sourceData } = prepareSourceData(rawSourceData);
    const sourceDataTokenCount = measureTokens(sourceData);
    const requireSummarization = sourceDataTokenCount > options.maxDataTokens;
    if (requireSummarization) {
        if (structured) {
            const summary = summarizeObjectStructure(sourceData);
            const prompt = dedent`
                <SummarizedData>
                <Disclaimer>
                The data is too large to fit within the context window all at once (full data is ${sourceDataTokenCount} tokens while the maximum is ${options.maxDataTokens}). Instead, below is a summary of the source object's structure.
                </Disclaimer>
                <DataSummary>
                ${summary}
                </DataSummary>
                </SummarizedData>
            `;
            return {
                summarized: true,
                type: "object",
                sourceData,
                serialization: prompt,
            };
        } else {
            const dataString = stringifySourceData(sourceData);
            const startSlice = sliceByTokens(
                dataString,
                0,
                options.maxDataTokens / 2,
            );
            const endSlice = sliceByTokens(
                dataString,
                -1 * (options.maxDataTokens / 2),
            );
            const remaningTokens = sourceDataTokenCount - options.maxDataTokens;
            const serialization = dedent`
                <SummarizedData>
                <Disclaimer>
                The string is too large to fit within the context window all at once (full data is ${sourceDataTokenCount} tokens while the maximum is ${options.maxDataTokens}). Instead, below is the first and last ${options.maxDataTokens} tokens.
                </Disclaimer>
                <DataSummary>
                ${startSlice}...[${remaningTokens} more tokens]...${endSlice}
                </DataSummary>
                </SummarizedData>
            `;
            return {
                summarized: true,
                type: "string",
                sourceData,
                serialization,
            };
        }
    } else {
        return {
            summarized: false,
            type: "string",
            sourceData,
            serialization: stringifySourceData(sourceData),
        };
    }
}

export function createDataPresentationResources(
    rawSourceData: unknown,
    options: { maxDataTokens: number } = {
        maxDataTokens: 8192,
    },
): DataPresentationResources {
    const {
        summarized,
        type: summarizationType,
        sourceData,
        serialization,
    } = createDataPresentationPrompt(rawSourceData, options);
    if (summarized) {
        if (summarizationType === "object") {
            return {
                prompt: serialization,
                tools: {
                    probeData: tool({
                        description:
                            "Query specific sections of the summarized data using jmespath expressions. Use this to read the actual underlying data that isn't accessible in the summary. Note that if the query results are too large, they will be summarized themselves, so try to use specific and targeted queries that fetch only the data you need. Note that calling this tool will probe the original data, not any summarized data that results from one of its calls.",
                        inputSchema: type({
                            jmespathExpression: [
                                "string",
                                "@",
                                'jmespath query to apply to the source data. E.g. `"buzz-buzz".foo.bar` to access sourceData["buzz-buzz"].foo.bar.',
                            ],
                            "stringSlice?": [
                                {
                                    start: "number.integer",
                                    "end?": "number.integer",
                                },
                                "@",
                                "Dictates sliced range returned if the jmespath expression returns a string. Only applied if query returns a string. Supports -1 for standard slice behavior.",
                            ],
                        }),
                        execute: ({ jmespathExpression, stringSlice }) => {
                            const rawQueryData = search(
                                sourceData,
                                jmespathExpression,
                            );
                            const slicedQueryData =
                                typeof rawQueryData === "string" && stringSlice
                                    ? stringSlice.end
                                        ? rawQueryData.slice(
                                              stringSlice.start,
                                              stringSlice.end,
                                          )
                                        : rawQueryData.slice(stringSlice.start)
                                    : rawQueryData;
                            const { serialization } =
                                createDataPresentationPrompt(
                                    slicedQueryData,
                                    options,
                                );
                            return serialization;
                        },
                    }),
                },
            };
        } else {
            return {
                prompt: serialization,
                tools: {
                    sliceData: tool({
                        description:
                            "Query specific sections of the summarized data using string slicing ranges. Use this to read the truncated tokens. Note that if the query results are too large, they will be summarized themselves, so try to use specific and targeted queries that fetch only the data you need. Note that calling this tool will probe the original data, not any summarized data that results from one of its calls.",
                        inputSchema: type({
                            stringSlice: [
                                {
                                    start: "number.integer",
                                    "end?": "number.integer",
                                },
                                "@",
                                "Dictates sliced range returned if the jmespath expression returns a string. Supports -1 for standard slice behavior.",
                            ],
                        }),
                        execute: ({ stringSlice }) => {
                            const slicedQueryData = stringSlice.end
                                ? String(sourceData).slice(
                                      stringSlice.start,
                                      stringSlice.end,
                                  )
                                : String(sourceData).slice(stringSlice.start);
                            const { serialization } =
                                createDataPresentationPrompt(
                                    slicedQueryData,
                                    options,
                                );
                            return serialization;
                        },
                    }),
                },
            };
        }
    } else {
        return { prompt: serialization, tools: {} };
    }
}
