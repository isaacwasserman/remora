import {
    type HighlightJs,
    type HighlightLanguage,
    type HighlightMode,
    JMESPATH_KEYWORDS,
    jmespathModes,
} from "./jmespath";

export const REMORA_TEMPLATE_LANGUAGE = "remora-template";

export function remoraTemplateLanguage(hljs?: HighlightJs): HighlightLanguage {
    const languageApi = hljs ?? { BACKSLASH_ESCAPE: {} };
    const nestedHash: HighlightMode = {
        className: "punctuation",
        begin: /\{/,
        end: /\}/,
        relevance: 0,
        keywords: JMESPATH_KEYWORDS,
        contains: [],
    };

    nestedHash.contains = [nestedHash, ...jmespathModes(languageApi, false)];

    return {
        name: "Remora JMESPath Template",
        aliases: [REMORA_TEMPLATE_LANGUAGE],
        disableAutodetect: true,
        contains: [
            {
                className: "subst",
                begin: /\$\{/,
                end: /\}/,
                relevance: 10,
                keywords: JMESPATH_KEYWORDS,
                contains: [nestedHash, ...jmespathModes(languageApi, false)],
            },
        ],
    };
}
