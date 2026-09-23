import { jsonSchema, type ToolSet, tool } from "ai";
import { type Type, type } from "arktype";
import { applyPatch, JsonPatchError, type Operation } from "fast-json-patch";
import { search } from "jmespath";
import type { JSONSchema7 } from "json-schema";
import type { WorkflowDefinition } from "../schema";
import type { ValidatorDiagnostic } from "../validation";

export class WorkflowEditor {
    private workflowDefinitionSchema: Type;
    private diagnose: (draft: unknown) => ValidatorDiagnostic[];
    private workflowDraft: unknown;

    constructor(
        workflowDefinitionSchema: Type,
        diagnose: (draft: unknown) => ValidatorDiagnostic[],
        initialDraft?: WorkflowDefinition,
    ) {
        this.workflowDefinitionSchema = workflowDefinitionSchema;
        this.diagnose = diagnose;
        this.workflowDraft = initialDraft;
    }

    /** Edits can make the draft structurally invalid, so it is not typed as a {@link WorkflowDefinition}. */
    public getDraft(): unknown {
        return this.workflowDraft;
    }

    private requireDraft(): unknown {
        if (this.workflowDraft === undefined) {
            throw new Error(
                "No workflow exists yet. Use write-workflow to write one.",
            );
        }
        return this.workflowDraft;
    }

    public getTools({ strict = false }: { strict?: boolean } = {}): ToolSet {
        const writeWorkflowInputSchema = type({
            "+": "reject",
            definition: this.workflowDefinitionSchema,
        });
        return {
            "write-workflow": tool({
                description:
                    "Writes a full workflow definition and replaces the current workflow. Returns the validation diagnostics of the new workflow.",
                strict,
                // The workflow definition schema contains predicates that JSON Schema cannot express.
                inputSchema: jsonSchema<{ definition: WorkflowDefinition }>(
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
                                : {
                                      success: true,
                                      value: result as {
                                          definition: WorkflowDefinition;
                                      },
                                  };
                        },
                    },
                ),
                execute: ({ definition }) => {
                    this.workflowDraft = definition;
                    return { diagnostics: this.diagnose(definition) };
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
                    "Applies a JSON Patch to the current workflow. Returns the validation diagnostics of the changed workflow.",
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
                }),
                execute: ({ operations }) => {
                    try {
                        this.workflowDraft = applyPatch(
                            this.requireDraft(),
                            operations as Operation[],
                            true,
                            false,
                        ).newDocument;
                    } catch (error) {
                        // JsonPatchError messages contain the full document, so they are too long for a tool result.
                        if (error instanceof JsonPatchError) {
                            throw new Error(
                                `Patch operation ${error.index} (${JSON.stringify(error.operation)}) failed with ${error.name}.`,
                            );
                        }
                        throw error;
                    }
                    return { diagnostics: this.diagnose(this.workflowDraft) };
                },
            }),
        };
    }
}
