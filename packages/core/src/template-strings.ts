interface InsertMatch {
    expressionStart: number;
    expressionEnd: number;
    insertStart: number;
    insertEnd: number;
    expression: string;
}

export function extractTemplateInserts(templateString: string): InsertMatch[] {
    const regex = /\$\{([^}]*)\}/g;
    const results: InsertMatch[] = [];
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: Low stakes
    while ((match = regex.exec(templateString)) !== null) {
        const insertStart = match.index;
        const insertEnd = insertStart + match[0].length;
        const expressionStart = insertStart + 2; // skip past "${"
        const expressionEnd = expressionStart + (match[1]?.length ?? 0);

        results.push({
            expressionStart,
            expressionEnd,
            insertStart,
            insertEnd,
            expression: match[1] as string,
        });
    }

    return results;
}
