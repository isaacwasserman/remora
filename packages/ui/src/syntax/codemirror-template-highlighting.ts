import { RangeSetBuilder } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";

type Range = { from: number; to: number };
export type TemplateSyntaxToken = Range & { className: string };

const JMESPATH_BUILT_INS = new Set([
    "abs",
    "avg",
    "ceil",
    "contains",
    "ends_with",
    "floor",
    "join",
    "keys",
    "length",
    "map",
    "max",
    "max_by",
    "merge",
    "min",
    "min_by",
    "not_null",
    "reverse",
    "sort",
    "sort_by",
    "starts_with",
    "sum",
    "to_array",
    "to_number",
    "to_string",
    "type",
    "values",
]);

/**
 * Finds Remora template interpolations using the same brace and quote rules as
 * the runtime template parser. In particular, object hashes and braces inside
 * JMESPath string literals do not end an interpolation early.
 */
export function findTemplateInterpolationRanges(value: string): Range[] {
    const ranges: Range[] = [];

    for (let start = value.indexOf("${"); start !== -1; ) {
        let depth = 1;
        let quote: "'" | '"' | "`" | undefined;
        let escaped = false;
        let end = value.length;

        for (let index = start + 2; index < value.length; index += 1) {
            const character = value[index];

            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (character === "\\") {
                    escaped = true;
                } else if (character === quote) {
                    quote = undefined;
                }
                continue;
            }

            if (character === "'" || character === '"' || character === "`") {
                quote = character;
            } else if (character === "{") {
                depth += 1;
            } else if (character === "}") {
                depth -= 1;
                if (depth === 0) {
                    end = index + 1;
                    break;
                }
            }
        }

        ranges.push({ from: start, to: end });
        start = value.indexOf("${", end);
    }

    return ranges;
}

function readQuotedToken(value: string, start: number): number {
    const quote = value[start];
    let escaped = false;

    for (let index = start + 1; index < value.length; index += 1) {
        const character = value[index];
        if (escaped) {
            escaped = false;
        } else if (character === "\\") {
            escaped = true;
        } else if (character === quote) {
            return index + 1;
        }
    }

    return value.length;
}

function findJmespathTokens(
    value: string,
    start: number,
    end: number,
    identifierClassName: string,
): TemplateSyntaxToken[] {
    const tokens: TemplateSyntaxToken[] = [];

    let index = start;
    while (index < end) {
        const rest = value.slice(index, end);
        const character = value[index];

        if (character === "'" || character === '"' || character === "`") {
            const tokenEnd = Math.min(readQuotedToken(value, index), end);
            tokens.push({
                from: index,
                to: tokenEnd,
                className: "rf-jmes-string",
            });
            index = tokenEnd;
            continue;
        }

        const number = rest.match(/^-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/);
        if (number) {
            const tokenEnd = index + number[0].length;
            tokens.push({
                from: index,
                to: tokenEnd,
                className: "rf-jmes-number",
            });
            index = tokenEnd;
            continue;
        }

        const operator = rest.match(/^(?:\|\||&&|<=|>=|==|!=|[|!<>=&@])/);
        if (operator) {
            const tokenEnd = index + operator[0].length;
            tokens.push({
                from: index,
                to: tokenEnd,
                className: "rf-jmes-operator",
            });
            index = tokenEnd;
            continue;
        }

        if (/[.[\](){}:,]/.test(character)) {
            tokens.push({
                from: index,
                to: index + 1,
                className:
                    character === "."
                        ? "rf-jmes-member-separator"
                        : "rf-jmes-punctuation",
            });
            index += 1;
            continue;
        }

        const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
        if (identifier) {
            const tokenEnd = index + identifier[0].length;
            const className =
                identifier[0] === "true" ||
                identifier[0] === "false" ||
                identifier[0] === "null"
                    ? "rf-jmes-literal"
                    : JMESPATH_BUILT_INS.has(identifier[0])
                      ? "rf-jmes-built-in"
                      : identifierClassName;
            tokens.push({ from: index, to: tokenEnd, className });
            index = tokenEnd;
            continue;
        }

        index += 1;
    }

    return tokens;
}

export function findJmespathSyntaxTokens(value: string): TemplateSyntaxToken[] {
    return findJmespathTokens(value, 0, value.length, "rf-jmes-identifier");
}

/** Returns non-overlapping syntax tokens for JMESPath inside `${…}`. */
export function findTemplateSyntaxTokens(value: string): TemplateSyntaxToken[] {
    const tokens: TemplateSyntaxToken[] = [];
    for (const range of findTemplateInterpolationRanges(value)) {
        tokens.push({
            from: range.from,
            to: range.from + 2,
            className: "rf-template-delimiter",
        });
        const contentEnd =
            value[range.to - 1] === "}" ? range.to - 1 : range.to;
        tokens.push(
            ...findJmespathTokens(
                value,
                range.from + 2,
                contentEnd,
                "rf-template-interpolation",
            ),
        );
        if (contentEnd !== range.to) {
            tokens.push({
                from: contentEnd,
                to: range.to,
                className: "rf-template-delimiter",
            });
        }
    }

    return tokens;
}

function buildDecorations(value: string): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const token of findTemplateSyntaxTokens(value)) {
        builder.add(
            token.from,
            token.to,
            Decoration.mark({ class: token.className }),
        );
    }
    return builder.finish();
}

function buildJmespathDecorations(value: string): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const token of findJmespathSyntaxTokens(value)) {
        builder.add(
            token.from,
            token.to,
            Decoration.mark({ class: token.className }),
        );
    }
    return builder.finish();
}

class TemplateHighlightPlugin {
    decorations: DecorationSet;

    constructor(view: { state: { doc: { toString(): string } } }) {
        this.decorations = buildDecorations(view.state.doc.toString());
    }

    update(update: ViewUpdate) {
        if (update.docChanged) {
            this.decorations = buildDecorations(update.state.doc.toString());
        }
    }
}

export const codeMirrorTemplateHighlighting = ViewPlugin.fromClass(
    TemplateHighlightPlugin,
    { decorations: (plugin) => plugin.decorations },
);

class JmespathHighlightPlugin {
    decorations: DecorationSet;

    constructor(view: { state: { doc: { toString(): string } } }) {
        this.decorations = buildJmespathDecorations(view.state.doc.toString());
    }

    update(update: ViewUpdate) {
        if (update.docChanged) {
            this.decorations = buildJmespathDecorations(
                update.state.doc.toString(),
            );
        }
    }
}

export const codeMirrorJmespathHighlighting = ViewPlugin.fromClass(
    JmespathHighlightPlugin,
    { decorations: (plugin) => plugin.decorations },
);
