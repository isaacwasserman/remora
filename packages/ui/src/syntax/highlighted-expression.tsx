import type { CSSProperties, ReactNode } from "react";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/light";
import { cn } from "../lib/utils";
import { findTemplateSyntaxTokens } from "./codemirror-template-highlighting";
import { JMESPATH_LANGUAGE, jmespathLanguage } from "./jmespath";
import {
    REMORA_TEMPLATE_LANGUAGE,
    remoraTemplateLanguage,
} from "./remora-template";

export { JMESPATH_LANGUAGE, REMORA_TEMPLATE_LANGUAGE };

SyntaxHighlighter.registerLanguage(JMESPATH_LANGUAGE, jmespathLanguage);
SyntaxHighlighter.registerLanguage(
    REMORA_TEMPLATE_LANGUAGE,
    remoraTemplateLanguage,
);

export type HighlightedExpressionLanguage =
    | typeof JMESPATH_LANGUAGE
    | typeof REMORA_TEMPLATE_LANGUAGE;

const DISPLAY_STYLE = {
    margin: 0,
};

const OVERLAY_STYLE = {
    background: "transparent",
    margin: 0,
    padding: 0,
};

function renderTemplateTokens(value: string): ReactNode[] {
    const tokens = findTemplateSyntaxTokens(value);
    const nodes: ReactNode[] = [];
    let index = 0;

    for (const token of tokens) {
        if (token.from > index) {
            nodes.push(value.slice(index, token.from));
        }
        nodes.push(
            <span className={token.className} key={`${token.from}-${token.to}`}>
                {value.slice(token.from, token.to)}
            </span>,
        );
        index = token.to;
    }

    if (index < value.length) {
        nodes.push(value.slice(index));
    }

    return nodes;
}

function TemplateSyntaxHighlighter({
    value,
    className,
    style,
    codeStyle,
}: {
    value: string;
    className: string;
    style: CSSProperties;
    codeStyle?: CSSProperties;
}) {
    return (
        <pre className={cn("hljs", className)} style={style}>
            <code
                className={`language-${REMORA_TEMPLATE_LANGUAGE}`}
                style={{ whiteSpace: "pre-wrap", ...codeStyle }}
            >
                {renderTemplateTokens(value)}
            </code>
        </pre>
    );
}

interface HighlightedExpressionProps {
    value: string;
    language: HighlightedExpressionLanguage;
    className?: string;
    mode?: "display" | "overlay";
    overlayKind?: "input" | "textarea" | "code";
    scrollLeft?: number;
    scrollTop?: number;
}

export function HighlightedExpression({
    value,
    language,
    className,
    mode = "display",
    overlayKind = "input",
    scrollLeft = 0,
    scrollTop = 0,
}: HighlightedExpressionProps) {
    if (mode === "overlay") {
        const expressionClassName = cn(
            "rf-highlighted-expression rf-highlighted-expression-overlay",
            overlayKind === "textarea" &&
                "rf-highlighted-expression-overlay-textarea",
            overlayKind === "code" && "rf-highlighted-expression-overlay-code",
        );
        return (
            <div
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute inset-0 overflow-hidden text-xs leading-5",
                    className,
                )}
            >
                {language === REMORA_TEMPLATE_LANGUAGE ? (
                    <TemplateSyntaxHighlighter
                        value={value || " "}
                        className={expressionClassName}
                        style={OVERLAY_STYLE}
                        codeStyle={{
                            display: "block",
                            transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
                        }}
                    />
                ) : (
                    <SyntaxHighlighter
                        language={language}
                        useInlineStyles={false}
                        PreTag="div"
                        CodeTag="span"
                        className={expressionClassName}
                        customStyle={OVERLAY_STYLE}
                        codeTagProps={{
                            style: {
                                display: "block",
                                transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
                            },
                        }}
                    >
                        {value || " "}
                    </SyntaxHighlighter>
                )}
            </div>
        );
    }

    if (language === REMORA_TEMPLATE_LANGUAGE) {
        return (
            <TemplateSyntaxHighlighter
                value={value}
                className={cn(
                    "rf-highlighted-expression text-xs leading-5",
                    className,
                )}
                style={DISPLAY_STYLE}
            />
        );
    }

    return (
        <SyntaxHighlighter
            language={language}
            useInlineStyles={false}
            wrapLongLines
            className={cn(
                "rf-highlighted-expression text-xs leading-5",
                className,
            )}
            customStyle={DISPLAY_STYLE}
        >
            {value}
        </SyntaxHighlighter>
    );
}
