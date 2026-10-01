import type { JSONSchema7, JSONSchema7Definition } from "json-schema";
import type { Expression, WorkflowDefinition, WorkflowStep } from "../schema";
import { nestedChains } from "../step-registry";
import type { StepOfType, StepType } from "../step-types";
import { buildStepIndex } from "../utils";

const INDENT = "    ";
const SIMPLE_PATH = /^([A-Za-z_]\w*)((?:\.[A-Za-z_]\w*|\[\d+\])*)$/;
const QUOTED_LITERAL = /'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const ROOT_IDENTIFIER = /(?<![.\w@"])([A-Za-z_]\w*)(?!\s*\()/g;

/** How a chain of steps is described when it reaches its last step. */
type ChainContext = {
    subject: string;
    isWorkflow: boolean;
    exit: string;
};

type StepBlock = {
    kind: "step";
    number: number;
    text: string;
    children: Block[];
};

type Block =
    | { kind: "paragraph"; text: string }
    | {
          kind: "list";
          items: string[];
          lettered: boolean;
          nested: boolean;
      }
    | { kind: "verbatim"; text: string }
    | StepBlock;

type StepWriter = {
    paragraph(text: string): void;
    list(items: string[], options?: { lettered?: boolean }): void;
    verbatim(text: string): void;
    fields(schema: JSONSchema7Definition, options?: { nested?: boolean }): void;
    chain(entryStepId: string, context: ChainContext): void;
};

type StepRenderers = {
    [T in StepType]: (
        step: StepOfType<T>,
        writer: StepWriter,
        context: ChainContext,
    ) => string;
};

type StepNumbering = {
    numbers: Map<string, number>;
    spans: Map<string, { first: number; last: number }>;
    orphanEntryStepIds: string[];
};

function numberSteps(
    workflowDefinition: WorkflowDefinition,
    stepsById: Map<string, WorkflowStep>,
): StepNumbering {
    const numbers = new Map<string, number>();
    const spans = new Map<string, { first: number; last: number }>();

    const visitChain = (entryStepId: string) => {
        const existing = numbers.get(entryStepId);
        if (existing !== undefined) {
            spans.set(entryStepId, { first: existing, last: existing });
            return;
        }
        const first = numbers.size + 1;
        let stepId: string | undefined = entryStepId;
        while (stepId !== undefined && !numbers.has(stepId)) {
            const step = stepsById.get(stepId);
            if (!step) break;
            numbers.set(step.id, numbers.size + 1);
            for (const chain of nestedChains(step)) {
                visitChain(chain.entryPointStepId);
            }
            stepId = step.nextStepId;
        }
        if (numbers.size >= first) {
            spans.set(entryStepId, { first, last: numbers.size });
        }
    };

    visitChain(workflowDefinition.initialStepId);

    const unreached = workflowDefinition.steps.filter(
        (step) => !numbers.has(step.id),
    );
    const referencedByUnreached = new Set(
        unreached.flatMap((step) => [
            ...(step.nextStepId ? [step.nextStepId] : []),
            ...nestedChains(step).map((chain) => chain.entryPointStepId),
        ]),
    );
    const orphanEntryStepIds: string[] = [];
    for (const step of [
        ...unreached.filter((step) => !referencedByUnreached.has(step.id)),
        ...unreached,
    ]) {
        if (numbers.has(step.id)) continue;
        orphanEntryStepIds.push(step.id);
        visitChain(step.id);
    }

    return { numbers, spans, orphanEntryStepIds };
}

function formatLiteral(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
}

function formatNumber(value: number): string {
    return String(Number(value.toFixed(2)));
}

function formatDuration(ms: number): string {
    const units: [string, number][] = [
        ["hour", 3_600_000],
        ["minute", 60_000],
        ["second", 1000],
        ["millisecond", 1],
    ];
    for (const [unit, size] of units) {
        if (ms >= size || size === 1) {
            const amount = formatNumber(ms / size);
            return `${amount} ${unit}${amount === "1" ? "" : "s"}`;
        }
    }
    return `${ms} milliseconds`;
}

function markdownCode(text: string): string {
    return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}

function caseLetter(index: number): string {
    return index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}

function indentLines(text: string, indent: string): string {
    return text
        .split("\n")
        .map((line) => (line.trim() === "" ? "" : `${indent}${line}`))
        .join("\n");
}

function blockToPlainText(block: Block, depth: number): string {
    const indent = (extra = 0) => INDENT.repeat(depth + extra);
    if (block.kind === "paragraph") return `${indent()}${block.text}`;
    if (block.kind === "list") {
        return block.items
            .map(
                (item, index) =>
                    `${indent(block.nested ? 1 : 0)}${block.lettered ? `${caseLetter(index)}.` : "-"} ${item}`,
            )
            .join("\n");
    }
    if (block.kind === "verbatim") {
        return indentLines(block.text.trim(), indent(1));
    }
    const header = `${indent()}${block.number}. ${block.text}`;
    return block.children.length > 0
        ? `${header}\n${toPlainText(block.children, depth + 1)}`
        : header;
}

function toPlainText(blocks: Block[], depth = 0): string {
    return blocks.map((block) => blockToPlainText(block, depth)).join("\n");
}

function blockToMarkdown(block: Block): string {
    if (block.kind === "paragraph") return block.text;
    if (block.kind === "list") {
        return block.items
            .map(
                (item, index) =>
                    `- ${block.lettered ? `${caseLetter(index)}. ` : ""}${item}`,
            )
            .join("\n");
    }
    if (block.kind === "verbatim") {
        const longestBacktickRun = Math.max(
            0,
            ...(block.text.match(/`+/g) ?? []).map((run) => run.length),
        );
        const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
        return `${fence}text\n${block.text.trim()}\n${fence}`;
    }
    // A bullet keeps each step's own number; an ordered list would renumber
    // steps that are not consecutive.
    const header = `* **${block.number}.** ${block.text}`;
    return block.children.length > 0
        ? `${header}\n\n${indentLines(toMarkdown(block.children), "  ")}`
        : header;
}

function toMarkdown(blocks: Block[]): string {
    return blocks.map(blockToMarkdown).join("\n\n");
}

function joinWords(words: string[], conjunction = "and"): string {
    if (words.length <= 1) return words.join("");
    if (words.length === 2) return `${words[0]} ${conjunction} ${words[1]}`;
    return `${words.slice(0, -1).join(", ")}, ${conjunction} ${words.at(-1)}`;
}

function asSentence(text: string): string {
    const trimmed = text.trim();
    if (trimmed === "") return "";
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return /[.!?:]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function hasProperties(schema: JSONSchema7Definition): schema is JSONSchema7 & {
    properties: Record<string, JSONSchema7Definition>;
} {
    return (
        typeof schema === "object" &&
        schema.properties !== undefined &&
        Object.keys(schema.properties).length > 0
    );
}

function wrapUnion(text: string): string {
    return text.includes(" | ") || text.includes(" & ") ? `(${text})` : text;
}

/** A compact, TypeScript-like description of a JSON Schema. */
export function describeJsonSchemaType(
    schema: JSONSchema7Definition | undefined,
): string {
    if (schema === undefined || schema === true) return "any";
    if (schema === false) return "never";
    if (schema.const !== undefined) return formatLiteral(schema.const);
    if (schema.enum) return schema.enum.map(formatLiteral).join(" | ");
    const variants = schema.anyOf ?? schema.oneOf;
    if (variants) return variants.map(describeJsonSchemaType).join(" | ");
    if (schema.allOf) {
        return schema.allOf.map(describeJsonSchemaType).join(" & ");
    }
    if (schema.$ref) return schema.$ref.split("/").at(-1) || "any";

    const types = Array.isArray(schema.type)
        ? schema.type
        : schema.type
          ? [schema.type]
          : schema.properties
            ? ["object" as const]
            : schema.items
              ? ["array" as const]
              : [];
    if (types.length === 0) return "any";

    return types
        .map((typeName) => {
            if (typeName === "object") {
                if (schema.properties) {
                    const required = new Set(schema.required ?? []);
                    const fields = Object.entries(schema.properties).map(
                        ([key, value]) =>
                            `${key}${required.has(key) ? "" : "?"}: ${describeJsonSchemaType(value)}`,
                    );
                    return fields.length > 0
                        ? `{ ${fields.join(", ")} }`
                        : "{}";
                }
                if (typeof schema.additionalProperties === "object") {
                    return `Record<string, ${describeJsonSchemaType(schema.additionalProperties)}>`;
                }
                return "object";
            }
            if (typeName === "array") {
                if (Array.isArray(schema.items)) {
                    return `[${schema.items.map(describeJsonSchemaType).join(", ")}]`;
                }
                return `${wrapUnion(describeJsonSchemaType(schema.items))}[]`;
            }
            return typeName;
        })
        .join(" | ");
}

/**
 * Builds the explanation of a workflow as blocks that each output format
 * serializes. Steps are numbered in the order that execution reaches them.
 * Nested chains (branch bodies, loop bodies, condition checks) are children
 * of the step that owns them, and every jump in control flow refers to its
 * target by step number.
 */
function explainWorkflow(
    workflowDefinition: WorkflowDefinition,
    code: (text: string) => string,
): Block[][] {
    const stepsById: Map<string, WorkflowStep> =
        buildStepIndex(workflowDefinition);
    const { numbers, spans, orphanEntryStepIds } = numberSteps(
        workflowDefinition,
        stepsById,
    );
    const rendered = new Set<string>();

    const describeType = (schema: JSONSchema7Definition): string =>
        code(describeJsonSchemaType(schema));

    const stepRef = (stepId: string): string => {
        const number = numbers.get(stepId);
        return number === undefined
            ? `a step that does not exist (${code(stepId)})`
            : `step ${number}`;
    };

    const stepsRef = (entryStepId: string): string => {
        const span = spans.get(entryStepId);
        if (!span) return stepRef(entryStepId);
        return span.first === span.last
            ? `step ${span.first}`
            : `steps ${span.first}–${span.last}`;
    };

    const describeQuery = (query: string): string => {
        const trimmed = query.trim();
        const match = SIMPLE_PATH.exec(trimmed);
        if (match) {
            const [, root = "", rest = ""] = match;
            const path = rest.replace(/^\./, "");
            if (root === "input") {
                return path ? `${code(path)} from the input` : "the input";
            }
            const number = numbers.get(root);
            if (number !== undefined) {
                return path
                    ? `${code(path)} from step ${number}`
                    : `the result of step ${number}`;
            }
            return code(trimmed);
        }

        let usesInput = false;
        const sourceNumbers = new Set<number>();
        for (const [, identifier = ""] of trimmed
            .replace(QUOTED_LITERAL, "")
            .matchAll(ROOT_IDENTIFIER)) {
            if (identifier === "input") usesInput = true;
            const number = numbers.get(identifier);
            if (number !== undefined) sourceNumbers.add(number);
        }
        const sortedNumbers = [...sourceNumbers]
            .sort((a, b) => a - b)
            .map(String);
        const sources = [
            ...(usesInput ? ["the input"] : []),
            ...(sortedNumbers.length === 1 ? [`step ${sortedNumbers[0]}`] : []),
            ...(sortedNumbers.length > 1
                ? [`steps ${joinWords(sortedNumbers)}`]
                : []),
        ];
        return sources.length > 0
            ? `${code(trimmed)} (using ${joinWords(sources)})`
            : code(trimmed);
    };

    const describeValue = (expression: Expression): string => {
        switch (expression.type) {
            case "literal":
                return code(formatLiteral(expression.value));
            case "template":
                return code(JSON.stringify(expression.template));
            case "jmespath":
                return describeQuery(expression.expression);
        }
    };

    const describeDuration = (expression: Expression): string =>
        expression.type === "literal" && typeof expression.value === "number"
            ? formatDuration(expression.value)
            : `the number of milliseconds in ${describeValue(expression)}`;

    const describeCount = (expression: Expression): string =>
        expression.type === "literal" && typeof expression.value === "number"
            ? formatNumber(expression.value)
            : describeValue(expression);

    const createWriter = (children: Block[]): StepWriter => ({
        paragraph: (text) => {
            children.push({ kind: "paragraph", text });
        },
        list: (items, { lettered = false } = {}) => {
            children.push({ kind: "list", items, lettered, nested: false });
        },
        verbatim: (text) => {
            children.push({ kind: "verbatim", text });
        },
        fields: (schema, { nested = false } = {}) => {
            if (!hasProperties(schema)) return;
            const required = new Set(schema.required ?? []);
            const items = Object.entries(schema.properties).map(
                ([key, value]) => {
                    const optional = required.has(key) ? "" : ", optional";
                    const description =
                        typeof value === "object" && value.description
                            ? `: ${value.description}`
                            : "";
                    return `${code(key)} (${describeType(value)}${optional})${description}`;
                },
            );
            children.push({ kind: "list", items, lettered: false, nested });
        },
        chain: (entryStepId, context) => {
            if (!rendered.has(entryStepId)) {
                children.push(...renderChain(entryStepId, context));
            }
        },
    });

    const describeShape = (
        writer: StepWriter,
        subject: string,
        schema: JSONSchema7Definition,
    ) => {
        if (hasProperties(schema)) {
            writer.paragraph(`${subject} has these fields:`);
            writer.fields(schema, { nested: true });
        } else {
            writer.paragraph(`${subject} is of type ${describeType(schema)}.`);
        }
    };

    const describeCollection = (params: {
        accumulatorName?: string;
        accumulatorInitialValue?: Expression;
    }): string => {
        const { accumulatorName, accumulatorInitialValue } = params;
        if (
            accumulatorName === undefined ||
            accumulatorInitialValue === undefined
        ) {
            return "and collects the results into a list.";
        }
        return `and keeps a running value named ${code(accumulatorName)}. It starts as ${describeValue(accumulatorInitialValue)}, and each pass replaces it with that pass's result.`;
    };

    const renderers: StepRenderers = {
        start: (_step, writer) => {
            const { inputSchema } = workflowDefinition;
            if (!inputSchema) return "The workflow starts. It takes no input.";
            if (!hasProperties(inputSchema)) {
                return `The workflow starts with an input of type ${describeType(inputSchema)}.`;
            }
            writer.fields(inputSchema);
            return "The workflow starts with an input that has these fields:";
        },
        end: (step, writer, context) => {
            const result = step.params
                ? describeValue(step.params.output)
                : undefined;
            if (!context.isWorkflow) {
                return result
                    ? `${context.subject} finishes with ${result}.`
                    : `${context.subject} finishes with no result.`;
            }
            if (workflowDefinition.outputSchema) {
                describeShape(
                    writer,
                    "The result",
                    workflowDefinition.outputSchema,
                );
            }
            return result
                ? `The workflow finishes and returns ${result}.`
                : "The workflow finishes with no result.";
        },
        "tool-call": (step, writer) => {
            const tool = `the ${code(step.params.toolName)} tool`;
            const inputs = Object.entries(step.params.toolInput ?? {});
            const [onlyInput] = inputs;
            if (!onlyInput) return `It calls ${tool}.`;
            if (inputs.length === 1) {
                const [name, value] = onlyInput;
                return `It calls ${tool} with ${code(name)} set to ${describeValue(value)}.`;
            }
            writer.list(
                inputs.map(
                    ([name, value]) => `${code(name)}: ${describeValue(value)}`,
                ),
            );
            return `It calls ${tool} with:`;
        },
        "llm-prompt": (step, writer) => {
            writer.verbatim(step.params.prompt);
            describeShape(writer, "The answer", step.params.outputFormat);
            return "It asks the LLM:";
        },
        "extract-data": (step, writer) => {
            describeShape(
                writer,
                "The extracted data",
                step.params.outputFormat,
            );
            return `It uses the LLM to pull structured data out of ${describeValue(step.params.sourceData)}.`;
        },
        "agent-loop": (step, writer) => {
            const { tools, maxSteps, instructions, inputConstraints } =
                step.params;
            const toolList =
                tools.length > 0
                    ? ` that can use the ${joinWords(tools.map(code))} tool${tools.length === 1 ? "" : "s"}`
                    : " with no tools";
            const limit = maxSteps
                ? `, for at most ${describeCount(maxSteps)} steps`
                : "";
            writer.verbatim(instructions);
            for (const [toolName, schema] of Object.entries(
                inputConstraints ?? {},
            )) {
                writer.paragraph(
                    `The agent may only call ${code(toolName)} with input that matches ${describeType(schema)}.`,
                );
            }
            describeShape(writer, "The answer", step.params.outputFormat);
            return `It hands the task to an AI agent${toolList}${limit}. The agent gets these instructions:`;
        },
        "request-intervention": (step, writer) => {
            const { question, choices, allowFreeResponse } = step.params;
            const questionText =
                question.type === "template"
                    ? question.template
                    : question.type === "literal" &&
                        typeof question.value === "string"
                      ? question.value
                      : undefined;
            const multiLine = questionText?.includes("\n") ?? false;
            if (multiLine && questionText) writer.verbatim(questionText);
            const literalChoices =
                choices.type === "literal" &&
                Array.isArray(choices.value) &&
                choices.value.every((choice) => typeof choice === "string")
                    ? (choices.value as string[])
                    : undefined;
            writer.paragraph(
                literalChoices
                    ? `The choices are ${joinWords(
                          literalChoices.map((choice) =>
                              code(JSON.stringify(choice)),
                          ),
                          "or",
                      )}.`
                    : `The choices come from ${describeValue(choices)}.`,
            );
            writer.paragraph(
                allowFreeResponse
                    ? "The user can also type their own answer."
                    : "The user must pick one of the choices.",
            );
            return multiLine
                ? "It asks the user:"
                : `It asks the user ${describeValue(question)}`;
        },
        sleep: (step) => {
            const { durationMs } = step.params;
            const fixed =
                durationMs.type === "literal" &&
                typeof durationMs.value === "number";
            return `It waits ${fixed ? "" : "for "}${describeDuration(durationMs)}.`;
        },
        "switch-case": (step, writer, context) => {
            const { cases, switchOn } = step.params;
            if (cases.length === 0) {
                return `It checks ${describeValue(switchOn)}, but there are no cases to choose from.`;
            }
            writer.list(
                cases.map((branchCase) => {
                    const condition =
                        branchCase.value.type === "default"
                            ? "Otherwise"
                            : `If it is ${describeValue(branchCase.value)}`;
                    return `${condition}, go to ${stepRef(branchCase.branchBodyStepId)}.`;
                }),
                { lettered: true },
            );
            const branchContext: ChainContext = step.nextStepId
                ? {
                      subject: "The branch",
                      isWorkflow: false,
                      exit: `Then it continues at ${stepRef(step.nextStepId)}.`,
                  }
                : context;
            for (const branchCase of cases) {
                writer.chain(branchCase.branchBodyStepId, branchContext);
            }
            return `It checks ${describeValue(switchOn)}:`;
        },
        "for-each": (step, writer) => {
            const { itemName, loopBodyStepId, target } = step.params;
            writer.chain(loopBodyStepId, {
                subject: "This pass",
                isWorkflow: false,
                exit: `Then it moves on to the next item (back to ${stepRef(step.id)}).`,
            });
            return `It goes through each item in ${describeValue(target)}, naming the current item ${code(itemName)}. For each item, it runs ${stepsRef(loopBodyStepId)} ${describeCollection(step.params)}`;
        },
        while: (step, writer) => {
            const { conditionStepId, loopBodyStepId } = step.params;
            writer.chain(conditionStepId, {
                subject: "The check",
                isWorkflow: false,
                exit: `If the result is true, it runs the loop at ${stepRef(loopBodyStepId)}. If not, the loop is over.`,
            });
            writer.chain(loopBodyStepId, {
                subject: "This pass",
                isWorkflow: false,
                exit: `Then it goes back to ${stepRef(conditionStepId)} to check again.`,
            });
            return `It repeats ${stepsRef(loopBodyStepId)} for as long as the check in ${stepsRef(conditionStepId)} gives a true result, ${describeCollection(step.params)}`;
        },
        "wait-for-condition": (step, writer) => {
            const {
                backoffMultiplier,
                condition,
                conditionStepId,
                intervalMs,
                maxAttempts,
                timeoutMs,
            } = step.params;
            const backoff =
                backoffMultiplier &&
                !(
                    backoffMultiplier.type === "literal" &&
                    backoffMultiplier.value === 1
                )
                    ? ` (each wait is ${describeCount(backoffMultiplier)} times longer than the one before)`
                    : "";
            const limits = [
                ...(maxAttempts
                    ? [`tries at most ${describeCount(maxAttempts)} times`]
                    : []),
                ...(intervalMs
                    ? [
                          `waits ${describeDuration(intervalMs)} between tries${backoff}`,
                      ]
                    : []),
                ...(timeoutMs
                    ? [`gives up after ${describeDuration(timeoutMs)}`]
                    : []),
            ];
            if (limits.length > 0) {
                writer.paragraph(`It ${joinWords(limits)}.`);
            }
            writer.chain(conditionStepId, {
                subject: "The check",
                isWorkflow: false,
                exit: `If ${describeValue(condition)} is true, the wait is over. If not, it waits and tries again from ${stepRef(conditionStepId)}.`,
            });
            return `It waits until ${describeValue(condition)} is true. On each try, it runs ${stepsRef(conditionStepId)} and then checks.`;
        },
    };

    const renderStep = (
        step: WorkflowStep,
        context: ChainContext,
    ): StepBlock => {
        const children: Block[] = [];
        const render = renderers[step.type] as (
            step: WorkflowStep,
            writer: StepWriter,
            context: ChainContext,
        ) => string;
        const summary = render(step, createWriter(children), context);
        const description =
            step.type === "start" ? "" : asSentence(step.description);
        return {
            kind: "step",
            number: numbers.get(step.id) ?? 0,
            text: description ? `${description} ${summary}` : summary,
            children,
        };
    };

    const renderChain = (
        entryStepId: string,
        context: ChainContext,
    ): Block[] => {
        const blocks: Block[] = [];
        let last: StepBlock | undefined;
        let lastStep: WorkflowStep | undefined;
        let stepId: string | undefined = entryStepId;
        while (stepId !== undefined) {
            const step = stepsById.get(stepId);
            if (!step || rendered.has(stepId)) {
                (last?.children ?? blocks).push({
                    kind: "paragraph",
                    text: `Then it goes to ${stepRef(stepId)}.`,
                });
                return blocks;
            }
            rendered.add(step.id);
            last = renderStep(step, context);
            lastStep = step;
            blocks.push(last);
            stepId = step.nextStepId;
        }
        const branchesCarryExit =
            lastStep?.type === "switch-case" &&
            lastStep.params.cases.length > 0;
        const workflowAlreadyEnded =
            lastStep?.type === "end" && context.isWorkflow;
        if (!branchesCarryExit && !workflowAlreadyEnded) {
            (last?.children ?? blocks).push({
                kind: "paragraph",
                text: context.exit,
            });
        }
        return blocks;
    };

    const sections: Block[][] = [];

    const { inputSchema } = workflowDefinition;
    const initialStep = stepsById.get(workflowDefinition.initialStepId);
    if (initialStep?.type !== "start" && inputSchema) {
        const preamble: Block[] = [];
        describeShape(
            createWriter(preamble),
            "The workflow input",
            inputSchema,
        );
        sections.push(preamble);
    }

    sections.push(
        renderChain(workflowDefinition.initialStepId, {
            subject: "The workflow",
            isWorkflow: true,
            exit: "The workflow is done.",
        }),
    );

    if (orphanEntryStepIds.length > 0) {
        sections.push([
            {
                kind: "paragraph",
                text: "Nothing leads to these steps, so they never run:",
            },
            ...orphanEntryStepIds.flatMap((entryStepId) =>
                renderChain(entryStepId, {
                    subject: "This part",
                    isWorkflow: false,
                    exit: "This part ends.",
                }),
            ),
        ]);
    }

    return sections;
}

/** Explains a workflow in plain language as a numbered list of steps. */
export function renderWorkflowAsText(
    workflowDefinition: WorkflowDefinition,
): string {
    return explainWorkflow(workflowDefinition, (text) => text)
        .map((blocks) => toPlainText(blocks))
        .join("\n\n");
}

/**
 * Explains a workflow in plain language as Markdown, with code spans, fenced
 * prompts, and nested bullet lists of numbered steps.
 */
export function renderWorkflowAsMarkdown(
    workflowDefinition: WorkflowDefinition,
): string {
    return explainWorkflow(workflowDefinition, markdownCode)
        .map(toMarkdown)
        .join("\n\n");
}
