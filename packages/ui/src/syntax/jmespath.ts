export type HighlightMode = {
    className?: string;
    begin?: RegExp;
    end?: RegExp;
    beginScope?: string;
    endScope?: string;
    match?: RegExp;
    relevance?: number;
    keywords?: Record<string, string | RegExp>;
    contains?: HighlightMode[];
};

export type HighlightJs = {
    BACKSLASH_ESCAPE: HighlightMode;
};

export type HighlightLanguage = HighlightMode & {
    name: string;
    aliases: string[];
    disableAutodetect: boolean;
    contains: HighlightMode[];
};

const JMESPATH_KEYWORDS = {
    $pattern: /[A-Za-z_][A-Za-z0-9_]*/,
    built_in:
        "abs avg ceil contains ends_with floor join keys length map max max_by merge min min_by not_null reverse sort sort_by starts_with sum to_array to_number to_string type values",
    literal: "false null true",
};

export const JMESPATH_LANGUAGE = "jmespath";

export function jmespathModes(
    hljs: HighlightJs,
    includeBraces = true,
): HighlightMode[] {
    return [
        {
            className: "string",
            begin: /'/,
            end: /'/,
            contains: [hljs.BACKSLASH_ESCAPE],
            relevance: 0,
        },
        {
            className: "string",
            begin: /"/,
            end: /"/,
            contains: [hljs.BACKSLASH_ESCAPE],
            relevance: 0,
        },
        {
            className: "string",
            begin: /`/,
            end: /`/,
            contains: [
                hljs.BACKSLASH_ESCAPE,
                {
                    className: "string",
                    begin: /"/,
                    end: /"/,
                    contains: [hljs.BACKSLASH_ESCAPE],
                    relevance: 0,
                },
                {
                    className: "number",
                    match: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/,
                    relevance: 0,
                },
                {
                    className: "literal",
                    match: /\b(?:false|null|true)\b/,
                    relevance: 0,
                },
            ],
            relevance: 0,
        },
        {
            className: "number",
            match: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/,
            relevance: 0,
        },
        {
            className: "operator",
            match: /\|\||&&|<=|>=|==|!=|[|!<>=&@]/,
            relevance: 0,
        },
        {
            className: "punctuation",
            match: includeBraces ? /[.[\](){}:,]/ : /[.[\]():,]/,
            relevance: 0,
        },
    ];
}

export function jmespathLanguage(hljs?: HighlightJs): HighlightLanguage {
    return {
        name: "JMESPath",
        aliases: [JMESPATH_LANGUAGE],
        disableAutodetect: true,
        keywords: JMESPATH_KEYWORDS,
        contains: jmespathModes(hljs ?? { BACKSLASH_ESCAPE: {} }),
    };
}

export { JMESPATH_KEYWORDS };
