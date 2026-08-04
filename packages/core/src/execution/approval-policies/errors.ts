import { UnrecoverableExecutionError } from "../execution-engine/errors";

export class ApprovalPolicyDeniedError extends UnrecoverableExecutionError {
    override readonly code = "POLICY_DENIED";
    public stepId: string;
    public toolName: string;
    public policyId?: string;
    public reason?: string;

    constructor({
        stepId,
        toolName,
        policyId,
        reason,
    }: {
        stepId: string;
        toolName: string;
        policyId?: string;
        reason?: string;
    }) {
        super(
            `Step "${stepId}" failed after its call to tool "${toolName}" was rejected by policy "${policyId}" with reason "${reason}".`,
        );
        this.stepId = stepId;
        this.toolName = toolName;
        this.policyId = policyId;
        this.reason = reason;
    }
}
