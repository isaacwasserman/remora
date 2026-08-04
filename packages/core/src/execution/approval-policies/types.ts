export type ApprovalPolicyDecision = {
    policyId?: string;
    decision: "allow" | "reject" | "defer" | "request";
    reason?: string;
};
export type FinalApprovalPolicyDecision = ApprovalPolicyDecision & {
    decision: Exclude<ApprovalPolicyDecision["decision"], "defer">;
};

export type ApprovalPolicy = {
    id: string;
    type: "approval";
    scope: "all" | "only-tool-call-steps" | "only-agent-loop-steps";
    decideFn: (
        toolName: string,
        toolInput: unknown,
    ) => Promise<ApprovalPolicyDecision> | ApprovalPolicyDecision;
};
