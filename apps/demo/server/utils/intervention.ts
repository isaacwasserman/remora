import type {
    InterventionRequest,
    InterventionResponse,
    UserInterventionAdapter,
} from "@remoraflow/core";

interface PendingIntervention {
    request: InterventionRequest;
    response?: InterventionResponse;
}

export interface InterventionManager {
    adapter: UserInterventionAdapter;
    respond: (requestId: string, answer: string) => void;
    pendingRequest: () =>
        | { requestId: string; request: InterventionRequest }
        | undefined;
    clearPending: () => void;
}

export function createInterventionManager(): InterventionManager {
    const pending = new Map<string, PendingIntervention>();
    let latestRequestId: string | undefined;

    const adapter: UserInterventionAdapter = {
        requestIntervention: async (input) => {
            pending.set(input.interventionRequestId, {
                request: input.request,
            });
            latestRequestId = input.interventionRequestId;
        },
        getResponse: async (id) => {
            const entry = pending.get(id);
            if (!entry?.response)
                return undefined as unknown as InterventionResponse;
            const response = entry.response;
            pending.delete(id);
            latestRequestId = undefined;
            return response;
        },
    };

    return {
        adapter,
        respond(requestId: string, answer: string) {
            const entry = pending.get(requestId);
            if (entry) {
                entry.response = { answer };
            }
        },
        pendingRequest() {
            if (!latestRequestId) return undefined;
            const entry = pending.get(latestRequestId);
            if (!entry || entry.response) return undefined;
            return { requestId: latestRequestId, request: entry.request };
        },
        clearPending() {
            latestRequestId = undefined;
        },
    };
}
