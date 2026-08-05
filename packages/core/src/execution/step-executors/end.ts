import { evaluateExpressionAgainstScope } from "../expressions/expression";
import type { StepExecutor } from "../types";

export const endExecutor: StepExecutor<"end"> = {
    stepType: "end",
    errorCode: "UNKNOWN",
    execute: async function* ({ step, scope }) {
        if (step.params) {
            const output = evaluateExpressionAgainstScope(
                step.params.output,
                scope,
            );
            yield {
                scope: { ...scope, [step.id]: output },
                output: null,
                error: null,
            };
            return;
        }
        yield { scope, output: null, error: null };
    },
};
