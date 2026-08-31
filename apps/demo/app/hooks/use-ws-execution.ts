import type { ExecutionState, WorkflowDefinition } from "@remoraflow/core";
import { useCallback, useRef, useState } from "react";
import { loadOpenRouterConfig } from "../lib/storage.ts";
import { wsRpc } from "../lib/ws-client.ts";

export interface InterventionRequestState {
    executionId: string;
    requestId: string;
    question: string;
    choices: string[];
    allowFreeResponse: boolean;
}

export function useWSExecution() {
    const [interventionRequest, setInterventionRequest] =
        useState<InterventionRequestState | null>(null);
    const executionIdRef = useRef<string | null>(null);

    const execute = useCallback(async function* (params: {
        workflow: WorkflowDefinition;
        inputs: Record<string, unknown>;
    }): AsyncGenerator<ExecutionState> {
        const llmConfig = await loadOpenRouterConfig();
        const stream = await wsRpc.workflow.execute({
            workflow: params.workflow,
            input: params.inputs,
            llmConfig: llmConfig ?? undefined,
        });
        for await (const update of stream as AsyncIterable<{
            executionId: string;
            state: ExecutionState;
            interventionRequest?: {
                requestId: string;
                question: string;
                choices: string[];
                allowFreeResponse: boolean;
            };
        }>) {
            executionIdRef.current = update.executionId;
            if (update.interventionRequest) {
                setInterventionRequest({
                    executionId: update.executionId,
                    ...update.interventionRequest,
                });
            }
            yield update.state;
        }
        setInterventionRequest(null);
        executionIdRef.current = null;
    }, []);

    const respondToIntervention = useCallback(
        async (requestId: string, answer: string) => {
            const executionId = executionIdRef.current;
            if (!executionId) return;
            await wsRpc.intervention.respond({
                executionId,
                requestId,
                answer,
            });
            setInterventionRequest(null);
        },
        [],
    );

    return { execute, interventionRequest, respondToIntervention };
}
