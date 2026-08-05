import type { StepExecutor } from "../types";

export const startExecutor: StepExecutor<"start"> = {
    stepType: "start",
    errorCode: "UNKNOWN",
    execute: async function* ({ scope }) {
        yield { scope, output: null, error: null };
    },
};
