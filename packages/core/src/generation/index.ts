import {
    asSchema,
    type DeepPartial,
    type FlexibleSchema,
    Output,
    stepCountIs,
    streamText,
} from "ai";
import { type } from "arktype";
import dedent from "dedent";
import {
    createWorkflowDefinitionSchema,
    type WorkflowDefinition,
} from "../schema";
import {
    type LanguageModel,
    type RemoraflowSettings,
    remoraflowSettingsSchema,
    type StubbedToolSet,
} from "../types";
import { validateWorkflowDefinition } from "../validation";

export type GenerationOptions = RemoraflowSettings & {};

export type GenerationOutput =
    | { gaveUp: true; reason: string; workflowDefinition: null }
    | { gaveUp: false; reason: null; workflowDefinition: WorkflowDefinition };

export async function* generateWorkflowStream({
    taskDescription,
    tools,
    options,
    model,
    maxGenerationSteps = 20,
}: {
    taskDescription: string;
    tools: StubbedToolSet;
    options: GenerationOptions;
    model: LanguageModel;
    maxGenerationSteps: number;
}): AsyncGenerator<DeepPartial<WorkflowDefinition>, GenerationOutput> {
    const resolvedOptions = remoraflowSettingsSchema.assert(options);
    const { workflowDefinitionArktypeSchema } =
        createWorkflowDefinitionSchema(resolvedOptions);

    const validationNarrowedSchema = workflowDefinitionArktypeSchema.narrow(
        (definition, ctx) => {
            const { isValid, diagnostics } = validateWorkflowDefinition(
                definition,
                { tools, options: resolvedOptions },
            );
            if (!isValid) {
                return ctx.reject(JSON.stringify(diagnostics));
            } else {
                return true;
            }
        },
    );

    const outputSchema = validationNarrowedSchema.or(
        type({ type: "'give-up'", reason: "string" }).describe(
            "use this if the requested workflow is simply not possible for you to create for some reason",
        ),
    );

    const resultStream = streamText({
        model,
        messages: [
            {
                role: "system",
                content: dedent`
                    You are a workflow generation subagent. You generate workflows from a task description and a set of predefined tools. Workflows are written using a proprietary "Remoraflow" JSON definition.

                    Notes:
                    - Workflows undergo a validation step after submission. If your workflow fails this validation, remediate and resubmit.
                `,
            },
            {
                role: "user",
                content: dedent`
                    You have the following tools at your disposal:

                    <AvailableTools>
                    ${Object.entries(tools)
                        .map(
                            ([toolName, tool]) => dedent`
                        <Tool>
                            <ToolName>${toolName}</ToolName>
                            <ToolDescription>
                                ${tool.description}
                            </ToolDescription>
                            <ToolInputSchema>
                                ${JSON.stringify(asSchema(tool.inputSchema as FlexibleSchema).jsonSchema)}
                            </ToolInputSchema>
                            <ToolOutputSchema>
                                ${tool.outputSchema ? JSON.stringify(asSchema(tool.inputSchema as FlexibleSchema).jsonSchema) : "{}"}
                            </ToolOutputSchema>
                        </Tool>
                    `,
                        )
                        .join("\n\n")}
                    </AvailableTools>

                    Generate a workflow based on the following task description:
                    
                    <TaskDescription>
                    ${taskDescription}
                    </TaskDescription>
                `,
            },
        ],
        stopWhen: [stepCountIs(maxGenerationSteps)],
        output: Output.object({ schema: outputSchema }),
    });

    const partialOutputStream = resultStream.partialOutputStream;

    for await (const partialOutput of partialOutputStream) {
        if (!("type" in partialOutput && partialOutput.type === "give-up")) {
            yield partialOutput as typeof validationNarrowedSchema.inferOut;
        }
    }

    const finalGenerationOutput = await resultStream.output;

    if (
        !(
            "type" in finalGenerationOutput &&
            finalGenerationOutput.type === "give-up"
        )
    ) {
        return {
            gaveUp: false,
            reason: null,
            workflowDefinition: finalGenerationOutput as WorkflowDefinition,
        };
    } else {
        return {
            gaveUp: true,
            reason: finalGenerationOutput.reason,
            workflowDefinition: null,
        };
    }
}
