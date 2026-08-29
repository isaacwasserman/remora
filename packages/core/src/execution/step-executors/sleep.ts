import { evaluateExpressionAgainstScope } from "../expressions/expression";
import type { StepExecutor } from "../types";

export const sleepExecutor: StepExecutor<"sleep"> = {
    stepType: "sleep",
    errorCode: "UNKNOWN",
    execute: async function* ({
        uniqueStepIdPath,
        step,
        scope,
        executionContext,
    }) {
        const durationMs = Number(
            evaluateExpressionAgainstScope(step.params.durationMs, scope),
        );
        yield { scope, output: null, error: null, status: "sleeping" };
        await executionContext.sleep(uniqueStepIdPath, durationMs / 1000);
        yield { scope, output: null, error: null };
    },
};
