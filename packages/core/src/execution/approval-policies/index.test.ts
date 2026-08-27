import { describe, expect, test } from "bun:test";
import type { ApprovalPolicy, ApprovalPolicyDecision } from "./types";
import {
	approvalPoliciesToAISDKToolApprovalConfig,
	decideApproval,
} from "./index";

function policy(
	id: string,
	decision: ApprovalPolicyDecision["decision"],
	scope: ApprovalPolicy["scope"] = "all",
): ApprovalPolicy {
	return {
		id,
		type: "approval",
		scope,
		decideFn: () => ({ policyId: id, decision }),
	};
}

describe("decideApproval", () => {
	test("empty policy list allows", async () => {
		const result = await decideApproval("tool-call", "t", {}, []);
		expect(result.decision).toBe("allow");
	});

	test("single allow", async () => {
		const result = await decideApproval("tool-call", "t", {}, [
			policy("p", "allow"),
		]);
		expect(result).toEqual({ policyId: "p", decision: "allow" });
	});

	test("single reject", async () => {
		const result = await decideApproval("tool-call", "t", {}, [
			policy("p", "reject"),
		]);
		expect(result).toEqual({ policyId: "p", decision: "reject" });
	});

	test("defer falls through to next policy", async () => {
		const result = await decideApproval("tool-call", "t", {}, [
			policy("a", "defer"),
			policy("b", "reject"),
		]);
		expect(result.policyId).toBe("b");
		expect(result.decision).toBe("reject");
	});

	test("all defer defaults to allow", async () => {
		const result = await decideApproval("tool-call", "t", {}, [
			policy("a", "defer"),
			policy("b", "defer"),
		]);
		expect(result.decision).toBe("allow");
	});

	test("first non-defer wins — later policies not called", async () => {
		let called = false;
		const result = await decideApproval("tool-call", "t", {}, [
			policy("a", "allow"),
			{
				id: "b",
				type: "approval",
				scope: "all",
				decideFn: () => {
					called = true;
					return { decision: "reject" };
				},
			},
		]);
		expect(result.decision).toBe("allow");
		expect(called).toBe(false);
	});

	test("scope only-tool-call-steps skips agent-loop environment", async () => {
		const result = await decideApproval("agent-loop", "t", {}, [
			policy("p", "reject", "only-tool-call-steps"),
		]);
		expect(result.decision).toBe("allow");
	});

	test("scope only-agent-loop-steps skips tool-call environment", async () => {
		const result = await decideApproval("tool-call", "t", {}, [
			policy("p", "reject", "only-agent-loop-steps"),
		]);
		expect(result.decision).toBe("allow");
	});

	test("scope all matches both environments", async () => {
		const tc = await decideApproval("tool-call", "t", {}, [
			policy("p", "reject", "all"),
		]);
		const al = await decideApproval("agent-loop", "t", {}, [
			policy("p", "reject", "all"),
		]);
		expect(tc.decision).toBe("reject");
		expect(al.decision).toBe("reject");
	});

	test("throwing decideFn becomes a rejection", async () => {
		const result = await decideApproval("tool-call", "t", {}, [
			{
				id: "broken",
				type: "approval",
				scope: "all",
				decideFn: () => {
					throw new Error("boom");
				},
			},
		]);
		expect(result.decision).toBe("reject");
		expect(result.reason).toBe("boom");
	});
});

describe("approvalPoliciesToAISDKToolApprovalConfig", () => {
	test("maps allow to not-applicable", async () => {
		const fn = approvalPoliciesToAISDKToolApprovalConfig([
			policy("p", "allow"),
		]);
		const result = await fn({
			toolCall: { toolName: "t", input: {} },
		} as never);
		expect(result).toBe("not-applicable");
	});

	test("maps reject to denied", async () => {
		const fn = approvalPoliciesToAISDKToolApprovalConfig([
			policy("p", "reject"),
		]);
		const result = await fn({
			toolCall: { toolName: "t", input: {} },
		} as never);
		expect(result).toBe("denied");
	});

	test("maps request to user-approval", async () => {
		const fn = approvalPoliciesToAISDKToolApprovalConfig([
			policy("p", "request"),
		]);
		const result = await fn({
			toolCall: { toolName: "t", input: {} },
		} as never);
		expect(result).toBe("user-approval");
	});
});
