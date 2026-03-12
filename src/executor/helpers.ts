import { search } from "@jmespath-community/jmespath";
import {
	APICallError,
	JSONParseError,
	NoContentGeneratedError,
	RetryError,
	TypeValidationError,
	tool,
} from "ai";
import { type as arktype } from "arktype";
import { extractTemplateExpressions } from "../compiler/utils/jmespath-helpers";
import type { ErrorCode } from "./errors";
import {
	ExpressionError,
	ExternalServiceError,
	OutputQualityError,
	type StepExecutionError,
} from "./errors";
import type { Expression } from "./executor-types";

// ─── Helpers ─────────────────────────────────────────────────────

export function stripCodeFence(text: string): string {
	const match = text.match(/^```(?:\w*)\s*\n?([\s\S]*?)\n?\s*```\s*$/);
	return match?.[1] ?? text;
}

// ─── Expression Evaluation ───────────────────────────────────────

export function evaluateExpression(
	expr: Expression,
	scope: Record<string, unknown>,
	stepId: string,
): unknown {
	if (expr.type === "literal") {
		return expr.value;
	}
	try {
		return search(scope as Parameters<typeof search>[0], expr.expression);
	} catch (e) {
		throw new ExpressionError(
			stepId,
			"JMESPATH_EVALUATION_ERROR",
			`JMESPath expression '${expr.expression}' failed: ${e instanceof Error ? e.message : String(e)}`,
			expr.expression,
			e,
		);
	}
}

export function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export function interpolateTemplate(
	template: string,
	scope: Record<string, unknown>,
	stepId: string,
): string {
	const { expressions } = extractTemplateExpressions(template);
	if (expressions.length === 0) return template;

	let result = "";
	let lastEnd = 0;
	for (const expr of expressions) {
		result += template.slice(lastEnd, expr.start);
		try {
			const value = search(
				scope as Parameters<typeof search>[0],
				expr.expression,
			);
			result += stringifyValue(value);
		} catch (e) {
			throw new ExpressionError(
				stepId,
				"TEMPLATE_INTERPOLATION_ERROR",
				`Template expression '${expr.expression}' failed: ${e instanceof Error ? e.message : String(e)}`,
				expr.expression,
				e,
			);
		}
		lastEnd = expr.end;
	}
	result += template.slice(lastEnd);
	return result;
}

// ─── LLM Error Classification ───────────────────────────────────

export function classifyLlmError(
	stepId: string,
	e: unknown,
): StepExecutionError {
	if (APICallError.isInstance(e)) {
		const code: ErrorCode =
			e.statusCode === 429 ? "LLM_RATE_LIMITED" : "LLM_API_ERROR";
		return new ExternalServiceError(
			stepId,
			code,
			e.message,
			e,
			e.statusCode,
			e.isRetryable ?? true,
		);
	}
	if (RetryError.isInstance(e)) {
		return new ExternalServiceError(
			stepId,
			"LLM_API_ERROR",
			e.message,
			e,
			undefined,
			false,
		);
	}
	if (NoContentGeneratedError.isInstance(e)) {
		return new ExternalServiceError(
			stepId,
			"LLM_NO_CONTENT",
			e.message,
			e,
			undefined,
			true,
		);
	}
	if (TypeValidationError.isInstance(e)) {
		return new OutputQualityError(
			stepId,
			"LLM_OUTPUT_PARSE_ERROR",
			`LLM output could not be parsed: ${e.message}`,
			e.value,
			e,
		);
	}
	if (JSONParseError.isInstance(e)) {
		return new OutputQualityError(
			stepId,
			"LLM_OUTPUT_PARSE_ERROR",
			`LLM output could not be parsed: ${e.message}`,
			e.text,
			e,
		);
	}
	return new ExternalServiceError(
		stepId,
		"LLM_NETWORK_ERROR",
		e instanceof Error ? e.message : String(e),
		e,
		undefined,
		true,
	);
}

// ─── Shared Probe Tools ──────────────────────────────────────────

export function createProbeDataTool(
	sourceData: unknown,
	limits: { probeResultMaxBytes: number },
) {
	return tool({
		description:
			"Query the available data using a JMESPath expression. Returns the matching subset of the data.",
		inputSchema: arktype({
			expression: [
				"string",
				"@",
				"A JMESPath expression to evaluate against the data. Examples: 'users[0]', 'users[*].name', 'metadata.total', 'users[?age > `30`].name'",
			],
		}),
		execute: async ({ expression }) => {
			try {
				const result = search(
					sourceData as Parameters<typeof search>[0],
					expression,
				);
				const resultStr =
					typeof result === "string" ? result : JSON.stringify(result, null, 2);
				if (
					new TextEncoder().encode(resultStr).byteLength >
					limits.probeResultMaxBytes
				) {
					const truncated = resultStr.slice(0, limits.probeResultMaxBytes);
					return `${truncated}\n\n[TRUNCATED - result exceeded ${limits.probeResultMaxBytes} bytes. Use a more specific JMESPath expression to narrow the result.]`;
				}
				return resultStr;
			} catch (e) {
				return `JMESPath error: ${e instanceof Error ? e.message : String(e)}. Check your expression syntax.`;
			}
		},
	});
}

export function createGiveUpTool() {
	let reason: string | undefined;
	const giveUpTool = tool({
		description:
			"Call this if you determine you cannot complete the task or find/extract the requested data.",
		inputSchema: arktype({
			reason: [
				"string",
				"@",
				"Explanation of why the task cannot be completed",
			],
		}),
		execute: async ({ reason: r }) => {
			reason = r;
			return { acknowledged: true };
		},
	});
	return {
		tool: giveUpTool,
		getReason: () => reason,
	};
}
