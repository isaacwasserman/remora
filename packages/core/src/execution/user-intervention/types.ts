import { type ServiceResult, success, unknownFailure } from "../../types";

export type InterventionRequest = {
    type: "multiple-choice";
    question: string;
    choices: string[];
    allowFreeResponse: boolean;
};

export type InterventionResponse = {
    answer: string;
};

export type RequestInterventionInput = {
    interventionRequestId: string;
    request: InterventionRequest;
};

export interface UserInterventionAdapter {
    requestIntervention: (input: RequestInterventionInput) => Promise<void>;
    getResponse: (
        inverventionRequestId: string,
    ) => Promise<InterventionResponse>;
}

export type UserInterventionContext = {
    requestIntervention: (
        input: RequestInterventionInput,
    ) => Promise<ServiceResult<void, "UNKNOWN">>;
    getResponse: (
        interventionRequestId: string,
    ) => Promise<ServiceResult<InterventionResponse | undefined, "UNKNOWN">>;
};

export function createUserInverventionContext(
    adapter: UserInterventionAdapter,
): UserInterventionContext {
    return {
        requestIntervention: async (input) => {
            try {
                await adapter.requestIntervention(input);
                return success();
            } catch (e) {
                return unknownFailure(e);
            }
        },
        getResponse: async (interventionRequestId) => {
            try {
                return success(
                    await adapter.getResponse(interventionRequestId),
                );
            } catch (e) {
                return unknownFailure(e);
            }
        },
    };
}
