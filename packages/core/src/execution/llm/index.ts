import {
    generateText,
    type ModelMessage,
    Output,
    stepCountIs,
    type streamText,
    type ToolApprovalConfiguration,
    wrapLanguageModel,
} from "ai";
import type { StandardSchemaV1 } from "../../schemistry";
import type { LanguageModel, ToolSet } from "../../types";
import type { PendingApproval } from "../types";
import {
    createSchemaSanitizationMiddleware,
    createTokenLimitMiddleware,
} from "./middleware";

export type { PendingApproval } from "../types";

export type LanguageModelTurnResult<TOutput> =
    | {
          status: "complete";
          output: TOutput;
          turnMessages: ModelMessage[];
          modelStepsUsed: number;
      }
    | {
          status: "needs-approval";
          approvals: PendingApproval[];
          turnMessages: ModelMessage[];
          modelStepsUsed: number;
      }
    | {
          status: "step-budget-exhausted";
          turnMessages: ModelMessage[];
          modelStepsUsed: number;
      }
    | {
          status: "stalled";
          unresolvedToolCallIds: string[];
          turnMessages: ModelMessage[];
          modelStepsUsed: number;
      };

export async function runLanguageModelTurn<TOutput>({
    model,
    messages,
    tools,
    outputFormat,
    toolApproval,
    maxSteps,
    maxInputTokens = 128_000,
}: {
    model: LanguageModel;
    messages: ModelMessage[];
    tools: ToolSet;
    outputFormat: StandardSchemaV1<TOutput>;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    toolApproval?: ToolApprovalConfiguration<any, any>;
    maxSteps: number;
    maxInputTokens?: number;
}): Promise<LanguageModelTurnResult<TOutput>> {
    const schemaSanitizationMiddleware = createSchemaSanitizationMiddleware();

    const tokenLimitMiddleware = createTokenLimitMiddleware({
        maxInputTokens,
        shouldTruncateMessage: (message) => message.role !== "system",
        onTruncate: ({ phase, budget }) => {
            console.warn(
                `LLM input was truncated ${phase === "proactive" ? `proactively because it exceeded the budget of ${budget} tokens.` : "reactively after the model provider threw a token overage error."}`,
            );
        },
    });

    const result = await generateText({
        model: wrapLanguageModel({
            model,
            middleware: [tokenLimitMiddleware, schemaSanitizationMiddleware],
        }),
        tools: tools as Parameters<typeof streamText>[0]["tools"],
        messages,
        output: Output.object({ schema: outputFormat }),
        stopWhen: stepCountIs(maxSteps),
        toolApproval,
    });

    const turnMessages = JSON.parse(
        JSON.stringify(result.responseMessages),
    ) as ModelMessage[];
    const modelStepsUsed = result.steps.length;

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const contentParts = result.content as Array<Record<string, any>>;

    const respondedTo = new Set(
        contentParts
            .filter((p) => p.type === "tool-approval-response")
            .map((p) => p.approvalId as string),
    );
    const approvals = contentParts
        .filter(
            (p) =>
                p.type === "tool-approval-request" &&
                !respondedTo.has(p.approvalId),
        )
        .map((p) => ({
            approvalId: p.approvalId as string,
            toolCallId: p.toolCall.toolCallId as string,
            toolName: p.toolCall.toolName as string,
            input: p.toolCall.input as unknown,
        }));

    if (approvals.length > 0) {
        return {
            status: "needs-approval",
            approvals,
            turnMessages,
            modelStepsUsed,
        };
    }
    if (result.finishReason === "stop") {
        return {
            status: "complete",
            output: result.output as TOutput,
            turnMessages,
            modelStepsUsed,
        };
    }
    if (modelStepsUsed >= maxSteps) {
        return {
            status: "step-budget-exhausted",
            turnMessages,
            modelStepsUsed,
        };
    }
    const resolved = new Set(result.toolResults.map((r) => r.toolCallId));
    const unresolved = result.toolCalls
        .filter((c) => !resolved.has(c.toolCallId))
        .map((c) => c.toolCallId);
    return {
        status: "stalled",
        unresolvedToolCallIds: unresolved,
        turnMessages,
        modelStepsUsed,
    };
}

export async function runLanguageModel<TOutput>({
    model,
    instructions,
    tools,
    outputFormat,
    maxSteps = 1,
    maxInputTokens = 128_000,
}: {
    model: LanguageModel;
    systemPrompt?: string;
    instructions: string;
    tools: ToolSet;
    outputFormat: StandardSchemaV1<TOutput>;
    maxSteps?: number;
    maxInputTokens?: number;
}) {
    const result = await runLanguageModelTurn({
        model,
        messages: [{ role: "user", content: instructions }],
        tools,
        outputFormat,
        maxSteps,
        maxInputTokens,
    });
    if (result.status !== "complete") {
        throw new Error(
            `Language model did not produce output (status: ${result.status})`,
        );
    }
    return result.output;
}

export function appendApprovalResponses(
    messages: ModelMessage[],
    parts: Array<{
        type: "tool-approval-response";
        approvalId: string;
        approved: boolean;
        reason?: string;
    }>,
): ModelMessage[] {
    const last = messages.at(-1);
    if (last && last.role === "tool") {
        return [
            ...messages.slice(0, -1),
            { ...last, content: [...last.content, ...parts] },
        ];
    }
    return [...messages, { role: "tool", content: parts }];
}
