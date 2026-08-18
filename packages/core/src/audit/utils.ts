type PlaceholderPatternMap<T extends string = string> = Partial<
    Record<T, string>
>;

export function templateToRegex<T extends string>(
    template: string,
    typeMap: PlaceholderPatternMap<T> = {},
): string {
    // Safely escapes special regular expression characters in static text segments
    const escapeRegex = (str: string): string =>
        str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Tokenize by matching ${...} placeholders
    const tokenRegex = /\$\{([^}]+)\}/g;

    let result = "^";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: Deal with it
    while ((match = tokenRegex.exec(template)) !== null) {
        // 1. Process literal text preceding the match
        const literalText = template.substring(lastIndex, match.index);
        result += escapeRegex(literalText);

        // 2. Process the placeholder key inside ${...}
        const placeholder = match[1]?.trim() as T;
        const customPattern = typeMap[placeholder];

        if (customPattern) {
            // Wrap in a non-capturing group to preserve group precedence
            result += `(?:${customPattern})`;
        } else {
            // Default: non-empty string match (.+)
            result += ".+";
        }

        lastIndex = tokenRegex.lastIndex;
    }

    // 3. Process any remaining literal text after the last match
    result += escapeRegex(template.substring(lastIndex));
    result += "$";

    return result;
}
