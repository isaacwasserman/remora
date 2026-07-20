import type { StandardSchemaV1 } from "@standard-schema/spec";

export type { StandardSchemaV1 } from "@standard-schema/spec";

export type StandardSchemaValidationIssue = StandardSchemaV1.Issue;

export type StandardSchemaTypeInfer<TSchema extends StandardSchemaV1> = Exclude<
    TSchema["~standard"]["types"],
    undefined
>["input"];

export function validateAgainstStandardSchema<TSchemaInput, TSchemaOutput>(
    value: unknown,
    schema: StandardSchemaV1<TSchemaInput, TSchemaOutput>,
):
    | { value: TSchemaOutput; issues: undefined }
    | { value: undefined; issues: readonly StandardSchemaValidationIssue[] } {
    const result = schema["~standard"].validate(value);
    if (result instanceof Promise) {
        throw new TypeError("Schema validation must be synchronous");
    }

    return result.issues
        ? { value: undefined, issues: result.issues }
        : { value: result.value, issues: undefined };
}
