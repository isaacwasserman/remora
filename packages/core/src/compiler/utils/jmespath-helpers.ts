import { compile } from "@jmespath-community/jmespath";

/**
 * Validate that a JMESPath expression is syntactically valid.
 */
export function validateJmespathSyntax(
  expression: string,
): { valid: true } | { valid: false; error: string } {
  try {
    compile(expression);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

interface ASTNode {
  type: string;
  name?: string;
  left?: ASTNode;
  right?: ASTNode;
  children?: ASTNode[];
  condition?: ASTNode;
  [key: string]: unknown;
}

/**
 * Extract root identifiers from a JMESPath AST.
 * A "root identifier" is a Field node that represents a top-level
 * reference (e.g., `stepId` in `stepId.field`, `foo` in `length(foo.bar)`).
 *
 * We walk the AST and collect Field nodes that appear in "root position" —
 * meaning they are the leftmost leaf in a chain of Subexpressions,
 * or standalone fields, or the first field in a function argument.
 */
export function extractRootIdentifiers(expression: string): string[] {
  let ast: ASTNode;
  try {
    ast = compile(expression) as unknown as ASTNode;
  } catch {
    return [];
  }

  const roots = new Set<string>();
  collectRoots(ast, roots);
  return [...roots];
}

function collectRoots(node: ASTNode, roots: Set<string>): void {
  if (!node || typeof node !== "object") return;

  switch (node.type) {
    case "Field":
      // Standalone field — this IS a root reference
      if (node.name) roots.add(node.name);
      break;

    case "Subexpression":
      // Only the leftmost field in the chain is a root
      if (node.left) collectLeftmostRoot(node.left, roots);
      break;

    case "FilterProjection":
      // Only the left side contains root references.
      // The condition and right are relative to the filtered items,
      // NOT root-level references.
      if (node.left) collectLeftmostRoot(node.left, roots);
      break;

    case "Projection":
    case "Flatten":
      // The left side contains the root; right is relative
      if (node.left) collectLeftmostRoot(node.left, roots);
      break;

    case "Function":
      // Recurse into function arguments
      if (node.children) {
        for (const child of node.children) {
          collectRoots(child, roots);
        }
      }
      break;

    case "MultiSelectList":
    case "MultiSelectHash":
      if (node.children) {
        for (const child of node.children) {
          collectRoots(child, roots);
        }
      }
      break;

    case "Comparator":
    case "And":
    case "Or":
    case "Arithmetic":
      if (node.left) collectRoots(node.left, roots);
      if (node.right) collectRoots(node.right, roots);
      break;

    case "Not":
    case "Negate":
      if (node.children?.[0]) collectRoots(node.children[0], roots);
      break;

    case "Pipe":
      // Only the left side of a pipe has root references from the data
      if (node.left) collectRoots(node.left, roots);
      break;

    case "IndexExpression":
      if (node.left) collectLeftmostRoot(node.left, roots);
      break;

    case "ValueProjection":
    case "Slice":
      if (node.left) collectLeftmostRoot(node.left, roots);
      break;

    case "Literal":
    case "Current":
    case "Identity":
    case "Expref":
      // No root references
      break;

    case "KeyValuePair": {
      const kvValue = (node as Record<string, ASTNode>).value;
      if (kvValue) {
        collectRoots(kvValue, roots);
      }
      break;
    }

    default:
      // Unknown node type — try to recurse into known fields
      if (node.left) collectRoots(node.left, roots);
      if (node.right) collectRoots(node.right, roots);
      if (node.children) {
        for (const child of node.children) {
          collectRoots(child, roots);
        }
      }
      break;
  }
}

/**
 * Follow the left side of subexpressions/projections to find the
 * leftmost root field.
 */
function collectLeftmostRoot(node: ASTNode, roots: Set<string>): void {
  if (!node) return;

  switch (node.type) {
    case "Field":
      if (node.name) roots.add(node.name);
      break;
    case "Subexpression":
      if (node.left) collectLeftmostRoot(node.left, roots);
      break;
    case "FilterProjection":
    case "Projection":
    case "Flatten":
    case "IndexExpression":
    case "ValueProjection":
    case "Slice":
      if (node.left) collectLeftmostRoot(node.left, roots);
      break;
    default:
      // For other types (like Arithmetic for hyphenated IDs), fall through
      collectRoots(node, roots);
      break;
  }
}

export interface TemplateExpression {
  expression: string;
  start: number;
  end: number;
}

export interface TemplateExtractionResult {
  expressions: TemplateExpression[];
  unclosed: number[]; // start positions of unclosed ${
}

/**
 * Extract all ${...} template expressions from an llm-prompt template string.
 * Also reports positions of unclosed ${ sequences.
 */
export function extractTemplateExpressions(
  template: string,
): TemplateExtractionResult {
  const expressions: TemplateExpression[] = [];
  const unclosed: number[] = [];
  let i = 0;

  while (i < template.length) {
    if (template[i] === "$" && template[i + 1] === "{") {
      const start = i;
      i += 2; // Skip ${
      let depth = 1;
      const exprStart = i;

      while (i < template.length && depth > 0) {
        if (template[i] === "{") depth++;
        else if (template[i] === "}") depth--;
        if (depth > 0) i++;
      }

      if (depth === 0) {
        const expression = template.slice(exprStart, i);
        expressions.push({ expression, start, end: i + 1 });
        i++; // Skip closing }
      } else {
        unclosed.push(start);
      }
    } else {
      i++;
    }
  }

  return { expressions, unclosed };
}
