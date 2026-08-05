import dedent from "dedent";
import { decideApproval } from "../approval-policies";
import { ApprovalPolicyDeniedError } from "../approval-policies/errors";
import type { ApprovalPolicy } from "../approval-policies/types";
import { RESERVED_SEGMENT } from "../execution-engine/step-path";
import type { ExecutionContext, StepPath } from "../execution-engine/types";
import type {
    ExecutionScope,
    PendingApproval,
    StepExecutionUpdate,
} from "../types";
import type { UserInterventionContext } from "../user-intervention/types";

const APPROVE_CHOICE = "Approve";
const REJECT_CHOICE = "Reject";

export async function* assertApprovalOfToolCallStep({
    scope,
    stepId,
    toolName,
    toolInput,
    approvalPolicies,
    executionContext,
    userInterventionContext,
    uniqueStepIdPath,
}: {
    scope: ExecutionScope;
    stepId: string;
    toolName: string;
    toolInput: unknown;
    approvalPolicies: ApprovalPolicy[];
    executionContext: ExecutionContext;
    userInterventionContext: UserInterventionContext;
    uniqueStepIdPath: StepPath;
}): AsyncGenerator<StepExecutionUpdate> {
    if (approvalPolicies.length > 0) {
        const outcome = await executionContext.step(
            [...uniqueStepIdPath, RESERVED_SEGMENT, "approvalDecision"],
            () =>
                decideApproval(
                    "tool-call",
                    toolName,
                    toolInput,
                    approvalPolicies,
                ),
        );

        if (outcome.decision === "reject") {
            throw new ApprovalPolicyDeniedError({
                stepId,
                toolName: toolName,
                policyId: outcome.policyId,
                reason: outcome.reason,
            });
        }

        if (outcome.decision === "request") {
            const approvalId = await executionContext.step(
                [...uniqueStepIdPath, RESERVED_SEGMENT, "approvalId"],
                async () => crypto.randomUUID(),
            );

            await executionContext.step(
                [...uniqueStepIdPath, RESERVED_SEGMENT, "approvalRequest"],
                async () => {
                    const result =
                        await userInterventionContext.requestIntervention({
                            interventionRequestId: approvalId,
                            request: {
                                type: "multiple-choice",
                                question: dedent`
							The step with ID "${stepId}" is trying to call "${toolName}" with input "${JSON.stringify(toolInput, null, 2).slice(0, 4096)}". Do you approve of this tool call?
						`,
                                choices: [APPROVE_CHOICE, REJECT_CHOICE],
                                allowFreeResponse: false,
                            },
                        });
                    if (result.error) {
                        throw new Error(
                            `Could not request approval: ${result.message}`,
                        );
                    }
                },
            );

            yield {
                scope,
                output: null,
                error: null,
                status: "awaiting-input",
            };

            const { answer } = yield* executionContext.waitFor(
                [...uniqueStepIdPath, RESERVED_SEGMENT, "approvalResponse"],
                async () => {
                    const received =
                        await userInterventionContext.getResponse(approvalId);
                    if (received.error) {
                        throw new Error(
                            `Could not read approval response: ${received.message}`,
                        );
                    }
                    return received.data;
                },
            );

            if (answer !== APPROVE_CHOICE) {
                throw new ApprovalPolicyDeniedError({
                    stepId,
                    toolName,
                    policyId: outcome.policyId,
                    reason: `User chose "${answer}" when asked for approval.`,
                });
            }
        }
    }
}

export async function* resolveApprovalRequests({
    scope,
    approvals,
    executionContext,
    userInterventionContext,
    basePath,
}: {
    scope: ExecutionScope;
    approvals: PendingApproval[];
    executionContext: ExecutionContext;
    userInterventionContext: UserInterventionContext;
    basePath: StepPath;
}): AsyncGenerator<
    StepExecutionUpdate,
    Array<{
        type: "tool-approval-response";
        approvalId: string;
        approved: boolean;
        reason?: string;
    }>
> {
    const asked: Array<{
        approval: PendingApproval;
        interventionId: string;
    }> = [];

    for (const [i, approval] of approvals.entries()) {
        const approvalPath = [...basePath, "approval", String(i)];

        const interventionId = await executionContext.step(
            [...approvalPath, "id"],
            async () => crypto.randomUUID(),
        );

        await executionContext.step([...approvalPath, "request"], async () => {
            const result = await userInterventionContext.requestIntervention({
                interventionRequestId: interventionId,
                request: {
                    type: "multiple-choice",
                    question: `Allow the agent to call "${approval.toolName}" with input ${JSON.stringify(approval.input, null, 2).slice(0, 4096)}?`,
                    choices: [APPROVE_CHOICE, REJECT_CHOICE],
                    allowFreeResponse: false,
                },
            });
            if (result.error) {
                throw new Error(
                    `Could not request approval: ${result.message}`,
                );
            }
        });

        asked.push({ approval, interventionId });
    }

    yield { scope, output: null, error: null, status: "awaiting-input" };

    const responseParts: Array<{
        type: "tool-approval-response";
        approvalId: string;
        approved: boolean;
        reason?: string;
    }> = [];

    for (const [i, { approval, interventionId }] of asked.entries()) {
        const { answer } = yield* executionContext.waitFor(
            [...basePath, "approval", String(i)],
            async () => {
                const received =
                    await userInterventionContext.getResponse(interventionId);
                if (received.error) {
                    throw new Error(
                        `Could not read approval response: ${received.message}`,
                    );
                }
                return received.data;
            },
        );
        responseParts.push({
            type: "tool-approval-response" as const,
            approvalId: approval.approvalId,
            approved: answer === APPROVE_CHOICE,
            ...(answer !== APPROVE_CHOICE ? { reason: answer } : {}),
        });
    }

    return responseParts;
}
