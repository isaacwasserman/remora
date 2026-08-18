/** biome-ignore-all lint/suspicious/noExplicitAny: Necessary for type inference. */
import type { AnyTool, ToolExecutionOptions } from "../../types";
import { UnrecoverableExecutionError } from "../execution-engine/errors";

function isAsyncIterable<T>(x: unknown): x is AsyncIterable<T> {
    return x != null && typeof (x as any)[Symbol.asyncIterator] === "function";
}

function isPromiseLike<T>(x: unknown): x is PromiseLike<T> {
    return x != null && typeof (x as any).then === "function";
}

function assertWithinOutputLimit(value: unknown, maxBytes: number): void {
    if (maxBytes <= 0) return;
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return;
    const byteLength = new TextEncoder().encode(serialized).length;
    if (byteLength > maxBytes) {
        throw new ToolOutputLimitExceededError(byteLength, maxBytes);
    }
}

export class ToolOutputLimitExceededError extends UnrecoverableExecutionError {
    override readonly code = "TOOL_ERROR" as const;

    constructor(
        readonly byteLength: number,
        readonly maxBytes: number,
    ) {
        super(
            `Tool output exceeds maxToolOutputBytes (${byteLength} > ${maxBytes}).`,
        );
    }
}

export async function runTool<TInput, TOutput>(
    t: AnyTool,
    input: TInput,
    options: ToolExecutionOptions,
    maxOutputBytes: number = 0,
): Promise<TOutput | undefined> {
    if (!t.execute) return undefined;

    const result = t.execute(input, options as any);

    let output: TOutput | undefined;
    if (isAsyncIterable<TOutput>(result)) {
        let last: TOutput | undefined;
        for await (const chunk of result) {
            last = chunk;
        }
        output = last;
    } else if (isPromiseLike<TOutput>(result)) {
        output = await result;
    } else {
        output = result as TOutput | undefined;
    }

    assertWithinOutputLimit(output, maxOutputBytes);
    return output;
}
