import { Project, SymbolFlags, type Type } from "ts-morph";

function typeToJSONSchema(
    type: Type,
    visited = new Set<string>(),
): Record<string, any> {
    // Prevent infinite loops on recursive types (e.g., node.children)
    const typeId = type.getText();
    if (visited.has(typeId))
        return { type: "object", description: "Recursive reference" };

    // 1. Primitives
    if (type.isString()) return { type: "string" };
    if (type.isNumber()) return { type: "number" };
    if (type.isBoolean()) return { type: "boolean" };
    if (type.isUndefined() || type.isNull() || type.isVoid())
        return { type: "null" };

    // 2. Arrays
    if (type.isArray()) {
        const elementType = type.getArrayElementTypeOrThrow();
        return {
            type: "array",
            items: typeToJSONSchema(elementType, visited),
        };
    }

    // 3. Unions (e.g. string | number, "a" | "b")
    if (type.isUnion()) {
        // Check if it's a literal union or boolean
        const unionTypes = type.getUnionTypes();
        if (type.isBoolean()) return { type: "boolean" };

        return {
            anyOf: unionTypes.map((t) => typeToJSONSchema(t, visited)),
        };
    }

    // 4. Promise — unwrap to inner type
    if (type.getSymbol()?.getName() === "Promise") {
        const typeArgs = type.getTypeArguments();
        if (typeArgs.length > 0) {
            return typeToJSONSchema(typeArgs[0]!, visited);
        }
    }

    // 5. Objects / Interfaces / Record Types
    if (type.isObject() || type.isInterface()) {
        visited.add(typeId);
        const properties: Record<string, any> = {};
        const required: string[] = [];

        const props = type.getProperties();
        for (const prop of props) {
            const propName = prop.getName();
            const valDeclaration = prop.getValueDeclaration();

            // Determine type & optionality
            const propType = prop.getTypeAtLocation(
                valDeclaration ?? prop.getDeclarations()[0],
            );

            properties[propName] = typeToJSONSchema(propType, new Set(visited));

            // Check if property is required
            const isOptional =
                prop.hasFlags(SymbolFlags.Optional) || propType.isUndefined();
            if (!isOptional) {
                required.push(propName);
            }
        }

        return {
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
            additionalProperties: false,
        };
    }

    // Fallback
    return { type: "any" };
}

export function analyzeFileFunctions(filePath: string) {
    // Initialize ts-morph ONCE
    const project = new Project({
        compilerOptions: { strictNullChecks: true },
    });

    const sourceFile = project.addSourceFileAtPath(filePath);
    const functions = sourceFile.getFunctions();

    return functions.map((fn) => {
        const fnName = fn.getName() ?? "anonymous";

        // 1. Build Input Schema from Function Parameters
        const paramProperties: Record<string, any> = {};
        const requiredParams: string[] = [];

        fn.getParameters().forEach((param) => {
            const paramName = param.getName();
            const paramType = param.getType();

            paramProperties[paramName] = typeToJSONSchema(paramType);

            if (!param.isOptional() && !param.isRestParameter()) {
                requiredParams.push(paramName);
            }
        });

        const inputSchema = {
            type: "object",
            properties: paramProperties,
            ...(requiredParams.length > 0 ? { required: requiredParams } : {}),
            additionalProperties: false,
        };

        // 2. Build Output Schema from Return Type
        const outputSchema = typeToJSONSchema(fn.getReturnType());

        return {
            functionName: fnName,
            inputSchema,
            outputSchema,
        };
    });
}
