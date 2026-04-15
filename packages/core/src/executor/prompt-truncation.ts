import { search } from "@jmespath-community/jmespath";
import { estimateTokenCount, sliceByTokens } from "tokenx";
import { extractTemplateExpressions } from "../compiler/utils/jmespath-helpers";
import { ExpressionError } from "./errors";
import type { ExecutorLimits } from "./executor-types";
import { stringifyValue } from "./helpers";

interface ResolvedVariable {
  /** The stringified value of the resolved expression. */
  value: string;
  /** Token count of this variable's value. */
  tokenCount: number;
  /** Start position in the original template. */
  start: number;
  /** End position in the original template. */
  end: number;
  /** Whether this variable was truncated. */
  truncated: boolean;
}

/**
 * Interpolates a prompt template with token-aware truncation.
 *
 * 1. Resolves each `${...}` expression against the scope
 * 2. Truncates each individual variable to `maxPromptVariableTokens`
 * 3. If the total rendered prompt exceeds `maxPromptTokens`, proportionally
 *    truncates variable portions to fit
 * 4. Appends truncation disclaimers to any modified variables
 */
export function interpolateTemplateWithLimits(
  template: string,
  scope: Record<string, unknown>,
  stepId: string,
  limits: Required<ExecutorLimits>,
): string {
  const maxPromptTokens = limits.maxPromptTokens;
  const maxVariableTokens = limits.maxPromptVariableTokens;

  const { expressions } = extractTemplateExpressions(template);
  if (expressions.length === 0) return template;

  // Resolve all expressions and stringify
  const resolved: ResolvedVariable[] = expressions.map((expr) => {
    let value: unknown;
    try {
      value = search(scope as Parameters<typeof search>[0], expr.expression);
    } catch (e) {
      throw new ExpressionError(
        stepId,
        "TEMPLATE_INTERPOLATION_ERROR",
        `Template expression '${expr.expression}' failed: ${e instanceof Error ? e.message : String(e)}`,
        expr.expression,
        e,
      );
    }
    const stringified = stringifyValue(value);
    return {
      value: stringified,
      tokenCount: estimateTokenCount(stringified),
      start: expr.start,
      end: expr.end,
      truncated: false,
    };
  });

  // Step 1: Truncate each variable to per-variable limit
  for (const variable of resolved) {
    if (variable.tokenCount > maxVariableTokens) {
      variable.value = sliceByTokens(variable.value, 0, maxVariableTokens);
      variable.tokenCount = maxVariableTokens;
      variable.truncated = true;
    }
  }

  // Step 2: Measure total rendered prompt token count
  const staticTokens = measureStaticTokens(template, resolved);
  const totalVariableTokens = resolved.reduce(
    (sum, v) => sum + v.tokenCount,
    0,
  );
  const totalTokens = staticTokens + totalVariableTokens;

  // Step 3: If over limit, proportionally truncate variable portions
  if (totalTokens > maxPromptTokens) {
    const excess = totalTokens - maxPromptTokens;
    distributeTokenReduction(resolved, excess);
  }

  // Step 4: Build the final string with truncation disclaimers
  return buildRenderedPrompt(template, resolved);
}

/**
 * Estimates the token count of the static (non-variable) parts of a template.
 */
function measureStaticTokens(
  template: string,
  variables: ResolvedVariable[],
): number {
  let staticText = "";
  let lastEnd = 0;
  for (const variable of variables) {
    staticText += template.slice(lastEnd, variable.start);
    lastEnd = variable.end;
  }
  staticText += template.slice(lastEnd);
  return estimateTokenCount(staticText);
}

/**
 * Distributes token reductions proportionally across variables based on
 * their current sizes. For example, if we're 1000 tokens over the limit
 * and variable X has 1200 tokens while Y has 600 tokens, X loses ~667
 * tokens and Y loses ~333 tokens.
 */
function distributeTokenReduction(
  variables: ResolvedVariable[],
  excess: number,
): void {
  const totalVariableTokens = variables.reduce(
    (sum, v) => sum + v.tokenCount,
    0,
  );

  if (totalVariableTokens === 0) return;

  let remaining = excess;

  for (const variable of variables) {
    if (variable.tokenCount === 0) continue;

    const share = Math.ceil(
      (variable.tokenCount / totalVariableTokens) * excess,
    );
    const reduction = Math.min(share, variable.tokenCount, remaining);

    if (reduction > 0) {
      const newTokenCount = variable.tokenCount - reduction;
      variable.value = sliceByTokens(variable.value, 0, newTokenCount);
      variable.tokenCount = newTokenCount;
      variable.truncated = true;
      remaining -= reduction;
    }
  }
}

/**
 * Builds the final rendered prompt string, wrapping any truncated variables
 * in XML tags with truncation disclaimers.
 */
function buildRenderedPrompt(
  template: string,
  variables: ResolvedVariable[],
): string {
  let result = "";
  let lastEnd = 0;

  for (const variable of variables) {
    result += template.slice(lastEnd, variable.start);

    if (variable.truncated) {
      result +=
        "<truncated_content>" +
        variable.value +
        "...\n[Content truncated — the original data continues beyond what is shown. Assume there is additional information not included here.]" +
        "</truncated_content>";
    } else {
      result += variable.value;
    }

    lastEnd = variable.end;
  }

  result += template.slice(lastEnd);
  return result;
}
