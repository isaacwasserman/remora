import type { GenericToolApprovalFunction } from "ai";
import type { ApprovalPolicy, FinalApprovalPolicyDecision } from "./types";

export async function decideApproval(
    environment: "tool-call" | "agent-loop",
    toolName: string,
    toolInput: unknown,
    policies: ApprovalPolicy[],
): Promise<FinalApprovalPolicyDecision> {
    for (const policy of policies) {
        try {
            if (
                policy.scope === "all" ||
                policy.scope === `only-${environment}-steps`
            ) {
                const policyDecision = await policy.decideFn(
                    toolName,
                    toolInput,
                );
                if (policyDecision.decision !== "defer") {
                    return policyDecision as FinalApprovalPolicyDecision;
                }
            }
        } catch (e) {
            return {
                policyId: policy.id,
                decision: "reject" as const,
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }
    return { decision: "allow" as const };
}

export function approvalPoliciesToAISDKToolApprovalConfig(
    policies: ApprovalPolicy[],
    // biome-ignore lint/suspicious/noExplicitAny: AI SDK generic signature
): GenericToolApprovalFunction<any, any, any> {
    return async ({ toolCall }) => {
        const toolName = toolCall.toolName;
        const toolInput = toolCall.input;
        const decision = await decideApproval(
            "agent-loop",
            toolName,
            toolInput,
            policies,
        );
        switch (decision.decision) {
            case "allow":
                return "not-applicable";
            case "reject":
                return "denied";
            case "request":
                return "user-approval";
        }
    };
}
