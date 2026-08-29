interface InsertMatch {
    expressionStart: number;
    expressionEnd: number;
    insertStart: number;
    insertEnd: number;
    expression: string;
}

export function extractTemplateInserts(templateString: string): InsertMatch[] {
    const results: InsertMatch[] = [];
    let insertStart = templateString.indexOf("${");

    while (insertStart !== -1) {
        const expressionStart = insertStart + 2;
        let cursor = expressionStart;
        let braceDepth = 0;
        let quote: "'" | '"' | "`" | null = null;
        let expressionEnd = -1;

        while (cursor < templateString.length) {
            const char = templateString[cursor] as string;

            if (quote) {
                if (char === "\\") {
                    cursor += 2;
                    continue;
                }
                if (char === quote) quote = null;
                cursor += 1;
                continue;
            }

            if (char === "'" || char === '"' || char === "`") {
                quote = char;
            } else if (char === "{") {
                braceDepth += 1;
            } else if (char === "}") {
                if (braceDepth === 0) {
                    expressionEnd = cursor;
                    break;
                }
                braceDepth -= 1;
            }
            cursor += 1;
        }

        if (expressionEnd === -1) break;

        const insertEnd = expressionEnd + 1;
        results.push({
            expressionStart,
            expressionEnd,
            insertStart,
            insertEnd,
            expression: templateString.slice(expressionStart, expressionEnd),
        });

        insertStart = templateString.indexOf("${", insertEnd);
    }

    return results;
}
