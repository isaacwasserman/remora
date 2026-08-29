import type { UserInterventionAdapter } from "./types";

const missingAdapterError = new Error(
    "Workflow encountered a step that requires user intervention, but no UserInterventionAdapter was provided at execution time.",
);

export const defaultUserInterventionAdapter: UserInterventionAdapter = {
    requestIntervention: async () => {
        throw missingAdapterError;
    },
    getResponse: async () => {
        throw missingAdapterError;
    },
};
