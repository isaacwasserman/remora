import { jsonSchema, type ToolSet, tool } from "ai";
import { type Type, type } from "arktype";
import {
    applyOperation,
    JsonPatchError,
    type Operation,
} from "fast-json-patch";
import { search } from "jmespath";
import type { JSONSchema7 } from "json-schema";
import type { WorkflowDefinition } from "../schema";
import type { ValidatorDiagnostic } from "../validation";

export class WorkflowEditor {
    private workflowDefinitionSchema: Type;
    private diagnose: (draft: unknown) => ValidatorDiagnostic[];
    private submit: (draft: unknown) => boolean;
    private workflowDraft: unknown;

    /**
     * @param submit Called when a write or edit sets `submitIfValid`. Returns
     * whether the draft was accepted.
     */
    constructor(
        workflowDefinitionSchema: Type,
        diagnose: (draft: unknown) => ValidatorDiagnostic[],
        submit: (draft: unknown) => boolean,
        initialDraft?: WorkflowDefinition,
    ) {
        this.workflowDefinitionSchema = workflowDefinitionSchema;
        this.diagnose = diagnose;
        this.submit = submit;
        this.workflowDraft = initialDraft;
    }

    /** Edits can make the draft invalid, so its type is `unknown`. */
    public getDraft(): unknown {
        return this.workflowDraft;
    }

    public requireDraft(): unknown {
        if (this.workflowDraft === undefined) {
            throw new Error(
                "No workflow exists yet. Use write-workflow to write one.",
            );
        }
        return this.workflowDraft;
    }

    public getTools({ strict = false }: { strict?: boolean } = {}): ToolSet {
        const submitIfValid = [
            "boolean",
            "@",
            "Submit the workflow for final validation if it has no errors or warnings. Set this when you expect the workflow to be complete.",
        ] as const;
        const writeWorkflowInputSchema = type({
            "+": "reject",
            definition: this.workflowDefinitionSchema,
            "submitIfValid?": submitIfValid,
        }) as Type<{ definition: WorkflowDefinition; submitIfValid?: boolean }>;
        return {
            "write-workflow": tool({
                description:
                    "Writes a full workflow definition and replaces the current workflow. Returns the validation diagnostics of the new workflow, and whether it was submitted.",
                strict,
                // The workflow definition schema contains predicates that JSON Schema cannot express.
                inputSchema: jsonSchema<typeof writeWorkflowInputSchema.infer>(
                    writeWorkflowInputSchema.toJsonSchema({
                        target: "draft-07",
                        fallback: (ctx) => ctx.base,
                    }) as JSONSchema7,
                    {
                        validate: (value) => {
                            const result = writeWorkflowInputSchema(value);
                            return result instanceof type.errors
                                ? {
                                      success: false,
                                      error: new Error(result.summary),
                                  }
                                : { success: true, value: result };
                        },
                    },
                ),
                execute: ({ definition, submitIfValid }) => {
                    this.workflowDraft = definition;
                    return {
                        diagnostics: this.diagnose(definition),
                        submitted:
                            submitIfValid === true && this.submit(definition),
                    };
                },
            }),
            "read-workflow": tool({
                description:
                    "Returns the current workflow definition, or the part of it that a JMESPath query selects.",
                inputSchema: type({
                    "+": "reject",
                    "jmespathQuery?": [
                        "string",
                        "@",
                        "A JMESPath query that selects the part of the workflow to return. Omit it to return the full workflow.",
                    ],
                }),
                execute: ({ jmespathQuery }) => {
                    const draft = this.requireDraft();
                    return jmespathQuery === undefined
                        ? draft
                        : search(draft, jmespathQuery);
                },
            }),
            "edit-workflow": tool({
                description:
                    "Applies a JSON Patch to the current workflow. Returns the changed workflow, its validation diagnostics, and whether it was submitted.",
                inputSchema: type({
                    "+": "reject",
                    operations: [
                        type({
                            "+": "reject",
                            op: "'add' | 'replace' | 'test'",
                            path: "string",
                            value: "unknown",
                        })
                            .or({
                                "+": "reject",
                                op: "'remove'",
                                path: "string",
                            })
                            .or({
                                "+": "reject",
                                op: "'move' | 'copy'",
                                from: "string",
                                path: "string",
                            })
                            .array()
                            .atLeastLength(1),
                        "@",
                        "A JSON Patch (RFC 6902). Paths are JSON Pointers (RFC 6901), for example /steps/0/params. Use /steps/- to append a step. The operations are applied in sequence. If an operation fails, the workflow does not change.",
                    ],
                    "submitIfValid?": submitIfValid,
                }),
                execute: ({ operations, submitIfValid }) => {
                    let document = structuredClone(this.requireDraft());
                    const tryApply = (operation: Operation) => {
                        try {
                            document = applyOperation(
                                document,
                                operation,
                                true,
                                true,
                            ).newDocument;
                            return undefined;
                        } catch (error) {
                            if (error instanceof JsonPatchError) return error;
                            throw error;
                        }
                    };
                    for (const [index, operation] of (
                        operations as Operation[]
                    ).entries()) {
                        let error = tryApply(operation);
                        // Models often `replace` a field that does not exist yet, which RFC 6902 rejects.
                        if (
                            error?.name === "OPERATION_PATH_UNRESOLVABLE" &&
                            operation.op === "replace" &&
                            !tryApply({ ...operation, op: "add" })
                        ) {
                            error = undefined;
                        }
                        if (error) {
                            // JsonPatchError messages contain the full document, so they are too long for a tool result.
                            throw new Error(
                                `Patch operation ${index} (${JSON.stringify(operation)}) failed with ${error.name}.`,
                            );
                        }
                    }
                    this.workflowDraft = document;
                    return {
                        definition: this.workflowDraft,
                        diagnostics: this.diagnose(this.workflowDraft),
                        submitted:
                            submitIfValid === true &&
                            this.submit(this.workflowDraft),
                    };
                },
            }),
        };
    }
}
