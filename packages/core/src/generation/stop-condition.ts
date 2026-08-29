import type { StepResult, StopCondition, ToolSet, TypedToolCall } from "ai";

export function findLastSuccessfulToolCall(
    toolName: string,
    steps: Array<StepResult<ToolSet>>,
): TypedToolCall<ToolSet> | undefined {
    for (const step of steps.toReversed()) {
        const successfulToolCallIds = new Set(
            step.toolResults.map((result) => result.toolCallId),
        );
        const matchingCall = step.toolCalls.findLast(
            (toolCall) =>
                toolCall.toolName === toolName &&
                successfulToolCallIds.has(toolCall.toolCallId),
        );
        if (matchingCall) return matchingCall;
    }
    return undefined;
}

export const hasSuccessfulToolCall: (
    toolName: string,
) => StopCondition<ToolSet> =
    (toolName) =>
    ({ steps }) =>
        Boolean(findLastSuccessfulToolCall(toolName, steps));
