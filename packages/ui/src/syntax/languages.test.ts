import { describe, expect, test } from "bun:test";
import hljs from "highlight.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    findTemplateInterpolationRanges,
    findTemplateSyntaxTokens,
} from "./codemirror-template-highlighting";
import {
    REMORA_TEMPLATE_LANGUAGE as HIGHLIGHTED_TEMPLATE_LANGUAGE,
    HighlightedExpression,
} from "./highlighted-expression";
import { JMESPATH_LANGUAGE, jmespathLanguage } from "./jmespath";
import {
    REMORA_TEMPLATE_LANGUAGE,
    remoraTemplateLanguage,
} from "./remora-template";

type HighlightLanguageFactory = Parameters<typeof hljs.registerLanguage>[1];

hljs.registerLanguage(
    JMESPATH_LANGUAGE,
    jmespathLanguage as unknown as HighlightLanguageFactory,
);
hljs.registerLanguage(
    REMORA_TEMPLATE_LANGUAGE,
    remoraTemplateLanguage as unknown as HighlightLanguageFactory,
);

function highlightJmespath(value: string) {
    return hljs.highlight(value, { language: JMESPATH_LANGUAGE }).value;
}

function highlightTemplate(value: string) {
    return hljs.highlight(value, { language: REMORA_TEMPLATE_LANGUAGE }).value;
}

function countOccurrences(value: string, text: string): number {
    return value.split(text).length - 1;
}

describe("JMESPath syntax highlighting", () => {
    test("highlights every standard built-in function", () => {
        const functions = [
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
        ];
        const html = highlightJmespath(
            functions.map((name) => `${name}(@)`).join(" | "),
        );

        for (const name of functions) {
            expect(html).toContain(
                `<span class="hljs-built_in">${name}</span>`,
            );
        }
    });

    test("highlights JSON literals, strings, operators, and punctuation", () => {
        const html = highlightJmespath(
            "items[?price >= `10`] || values(@) && contains('}', \"name\") | {key: [0:5:2]}",
        );

        expect(html).toContain("hljs-string");
        expect(html).toContain("hljs-number");
        expect(html).toContain("hljs-operator");
        expect(html).toContain("hljs-punctuation");
    });

    test("does not tokenize keywords inside strings", () => {
        const html = highlightJmespath(
            "contains('sort_by true null', \"length false\")",
        );

        expect(countOccurrences(html, "hljs-built_in")).toBe(1);
        expect(countOccurrences(html, "hljs-literal")).toBe(0);
    });
});

describe("Remora template syntax highlighting", () => {
    test("highlights every interpolation in the prompt fixture without leaking into prose", () => {
        const template = `Analyze the Pokémon \${fetch_pokemon.name} (types: \${fetch_pokemon.types}).
Stats: HP=\${fetch_pokemon.stats.hp}, ATK=\${fetch_pokemon.stats.attack}, DEF=\${fetch_pokemon.stats.defense}, SPD=\${fetch_pokemon.stats.speed}. Type matchups — strong against: \${fetch_type.double_damage_to}, weak against: \${fetch_type.double_damage_from}, resists: \${fetch_type.half_damage_from}.
Provide a competitive analysis with a rating from 1–10, a recommended role, and key observations.`;
        const html = highlightTemplate(template);

        expect(countOccurrences(html, "hljs-subst")).toBe(9);
        expect(html).toContain("Stats: HP=");
        expect(html).toContain("rating from 1–10");
        expect(html).not.toContain("Stats<span");
        expect(html).not.toContain("rating from <span");
    });

    test("keeps nested multi-select hashes within one interpolation", () => {
        const html = highlightTemplate(
            "Summary: ${{name: user.name, stats: {count: length(items)}}}",
        );

        expect(countOccurrences(html, "hljs-subst")).toBe(1);
        expect(html).toContain("hljs-built_in");
        expect(html).toContain("stats");
    });

    test("does not terminate an interpolation at braces in JMESPath strings", () => {
        const html = highlightTemplate("Message: ${contains(message, '}')}");

        expect(countOccurrences(html, "hljs-subst")).toBe(1);
        expect(html).toContain("hljs-string");
    });

    test("highlights an unfinished interpolation without affecting prior prose", () => {
        const template = "Message: ${unterminated";
        const html = highlightTemplate(template);

        expect(html).toContain("Message: ");
        expect(countOccurrences(html, "hljs-subst")).toBe(1);
    });
});

describe("React syntax highlighter integration", () => {
    test("renders all template interpolations through the shared token renderer", () => {
        const html = renderToStaticMarkup(
            createElement(HighlightedExpression, {
                value: "A ${first.value}, B ${second.value}",
                language: HIGHLIGHTED_TEMPLATE_LANGUAGE,
            }),
        );

        expect(countOccurrences(html, "${")).toBe(2);
        expect(html).toContain("rf-template-interpolation");
        expect(html).toContain("rf-template-delimiter");
        expect(html).toContain("rf-jmes-member-separator");
        expect(html).not.toContain("background:transparent");
    });

    test("uses the same renderer for edit overlays", () => {
        const html = renderToStaticMarkup(
            createElement(HighlightedExpression, {
                value: "${first.value}",
                language: HIGHLIGHTED_TEMPLATE_LANGUAGE,
                mode: "overlay",
                overlayKind: "code",
            }),
        );

        expect(html).toContain("rf-highlighted-expression-overlay-code");
        expect(html).toContain("rf-template-interpolation");
    });
});

describe("CodeMirror template highlighting", () => {
    test("keeps hashes and quoted braces inside an interpolation", () => {
        const template =
            "Summary: ${{name: user.name, note: contains(message, '}')}}";

        expect(findTemplateInterpolationRanges(template)).toEqual([
            { from: 9, to: template.length },
        ]);
    });

    test("applies JMESPath token categories within an interpolation", () => {
        const template =
            "${contains(items[?item.price >= 10], 'rare') && active == true}";
        const classNames = findTemplateSyntaxTokens(template).map(
            (token) => token.className,
        );

        expect(classNames).toContain("rf-jmes-built-in");
        expect(classNames).toContain("rf-jmes-string");
        expect(classNames).toContain("rf-jmes-number");
        expect(classNames).toContain("rf-jmes-literal");
        expect(classNames).toContain("rf-jmes-operator");
        expect(classNames).toContain("rf-jmes-punctuation");
        expect(classNames).toContain("rf-jmes-member-separator");
        expect(classNames).toContain("rf-template-delimiter");
    });
});
