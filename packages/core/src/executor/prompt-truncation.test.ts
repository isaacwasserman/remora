import { describe, expect, test } from "bun:test";
import { estimateTokenCount } from "tokenx";
import { DEFAULT_EXECUTOR_LIMITS } from "./executor-types";
import { interpolateTemplateWithLimits } from "./prompt-truncation";

// ─── Helpers ─────────────────────────────────────────────────────

/** Generate a string of approximately N tokens. */
function generateTokens(n: number): string {
  // ~1 token per word for simple words
  const words: string[] = [];
  for (let i = 0; i < n; i++) {
    words.push(`word${i}`);
  }
  return words.join(" ");
}

function makeLimits(overrides?: Partial<typeof DEFAULT_EXECUTOR_LIMITS>) {
  return { ...DEFAULT_EXECUTOR_LIMITS, ...overrides };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("interpolateTemplateWithLimits", () => {
  test("returns plain template with no expressions unchanged", () => {
    const result = interpolateTemplateWithLimits(
      "Hello world",
      {},
      "step1",
      makeLimits(),
    );
    expect(result).toBe("Hello world");
  });

  test("interpolates variables within limits", () => {
    const scope = { data: { name: "Alice" } };
    const result = interpolateTemplateWithLimits(
      "Hello ${data.name}!",
      scope,
      "step1",
      makeLimits(),
    );
    expect(result).toBe("Hello Alice!");
  });

  test("truncates individual variable exceeding per-variable limit", () => {
    const longValue = generateTokens(100);
    const scope = { data: { content: longValue } };
    const result = interpolateTemplateWithLimits(
      "Process: ${data.content}",
      scope,
      "step1",
      makeLimits({ maxPromptVariableTokens: 10 }),
    );

    // Should contain truncation marker
    expect(result).toContain("<truncated_content>");
    expect(result).toContain("</truncated_content>");
    expect(result).toContain("[Content truncated");

    // The total tokens of the variable portion should be reduced
    const variablePart = result.split("<truncated_content>")[1].split("...")[0];
    expect(estimateTokenCount(variablePart)).toBeLessThanOrEqual(12); // ~10 + tolerance
  });

  test("proportionally truncates multiple variables when total exceeds prompt limit", () => {
    // Create two variables — one twice the size of the other
    const bigValue = generateTokens(60);
    const smallValue = generateTokens(30);
    const scope = { big: bigValue, small: smallValue };

    const result = interpolateTemplateWithLimits(
      "A: ${big} B: ${small}",
      scope,
      "step1",
      makeLimits({
        maxPromptTokens: 50,
        maxPromptVariableTokens: 100, // per-variable limit is not the bottleneck
      }),
    );

    // Both should be truncated
    expect(result).toContain("<truncated_content>");

    // Count truncation markers — should be exactly 2
    const truncationCount = (result.match(/<truncated_content>/g) || []).length;
    expect(truncationCount).toBe(2);
  });

  test("only truncates variables, not static text, when over prompt limit", () => {
    const value = generateTokens(50);
    const scope = { data: value };
    const result = interpolateTemplateWithLimits(
      "Static prefix: ${data}",
      scope,
      "step1",
      makeLimits({ maxPromptTokens: 30, maxPromptVariableTokens: 100 }),
    );

    // Should start with the static prefix intact
    expect(result).toStartWith("Static prefix: ");
    // Variable should be truncated
    expect(result).toContain("<truncated_content>");
  });

  test("does not truncate when within limits", () => {
    const scope = { data: { name: "Bob" } };
    const result = interpolateTemplateWithLimits(
      "Hello ${data.name}, welcome!",
      scope,
      "step1",
      makeLimits(),
    );

    expect(result).toBe("Hello Bob, welcome!");
    expect(result).not.toContain("<truncated_content>");
  });

  test("handles multiple expressions in a template", () => {
    const scope = { a: "first", b: "second", c: "third" };
    const result = interpolateTemplateWithLimits(
      "${a} and ${b} and ${c}",
      scope,
      "step1",
      makeLimits(),
    );

    expect(result).toBe("first and second and third");
  });

  test("throws on invalid JMESPath expression", () => {
    expect(() =>
      interpolateTemplateWithLimits(
        "Value: ${[invalid}",
        {},
        "step1",
        makeLimits(),
      ),
    ).toThrow();
  });

  test("truncation disclaimer includes xml tags", () => {
    const longValue = generateTokens(100);
    const scope = { data: longValue };
    const result = interpolateTemplateWithLimits(
      "Content: ${data}",
      scope,
      "step1",
      makeLimits({ maxPromptVariableTokens: 10 }),
    );

    expect(result).toContain("<truncated_content>");
    expect(result).toContain("</truncated_content>");
    expect(result).toContain("...");
    expect(result).toContain(
      "the original data continues beyond what is shown",
    );
  });

  test("per-variable limit is applied before total limit", () => {
    // Two large variables, each 100 tokens
    const val1 = generateTokens(100);
    const val2 = generateTokens(100);
    const scope = { a: val1, b: val2 };

    const result = interpolateTemplateWithLimits(
      "${a} ${b}",
      scope,
      "step1",
      makeLimits({
        maxPromptVariableTokens: 20,
        maxPromptTokens: 1000, // Total limit won't be hit
      }),
    );

    // Both should be truncated to per-variable limit
    const truncationCount = (result.match(/<truncated_content>/g) || []).length;
    expect(truncationCount).toBe(2);
  });

  test("stringifies objects as JSON", () => {
    const scope = { data: { key: "value", num: 42 } };
    const result = interpolateTemplateWithLimits(
      "Data: ${data}",
      scope,
      "step1",
      makeLimits(),
    );

    expect(result).toContain('"key":"value"');
    expect(result).toContain('"num":42');
  });
});
