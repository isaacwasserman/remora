import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { ExpressionInput } from "./expression-input";
import { useExpressionScope } from "./expression-scope-context";
import { JsonCodeEditor } from "./json-code-editor";
import { TemplateExpressionInput } from "./template-expression-input";

type Expression =
  | { type: "literal"; value: unknown }
  | { type: "jmespath"; expression: string }
  | { type: "template"; template: string };

export interface ExpressionEditorProps {
  value: Expression;
  onChange: (value: Expression) => void;
  label?: string;
  /** Optional JSON Schema hint to constrain literal mode. */
  schemaHint?: {
    type?: string;
    enum?: unknown[];
    /**
     * JSON Schema `default`. When present, rendered as placeholder text in
     * literal inputs to show what the tool will use if the input is left
     * empty or omitted.
     */
    default?: unknown;
  };
}

function formatDefault(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type LiteralType = "string" | "number" | "boolean" | "json";

function inferLiteralType(value: unknown): LiteralType {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "json";
}

function schemaTypeToLiteralType(t: string | undefined): LiteralType | null {
  switch (t) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
    case "array":
      return "json";
    default:
      return null;
  }
}

function defaultValueForSchemaType(t: string | undefined): unknown {
  switch (t) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
}

export function ExpressionEditor({
  value,
  onChange,
  label,
  schemaHint,
}: ExpressionEditorProps) {
  const scopeContext = useExpressionScope();
  const suggestions = scopeContext?.suggestions ?? null;

  const hintedLiteralType = schemaTypeToLiteralType(schemaHint?.type);
  const hasEnum = schemaHint?.enum && schemaHint.enum.length > 0;
  const allowTemplate = !schemaHint?.type || schemaHint.type === "string";
  const defaultHint = formatDefault(schemaHint?.default);
  const defaultJsonHint =
    schemaHint?.default !== undefined
      ? typeof schemaHint.default === "string"
        ? schemaHint.default
        : JSON.stringify(schemaHint.default, null, 2)
      : undefined;

  const [literalType, setLiteralType] = useState<LiteralType>(
    hintedLiteralType ??
      (value.type === "literal" ? inferLiteralType(value.value) : "string"),
  );

  // Only sync literalType from value when the expression type changes to
  // literal from a different type. We must NOT re-infer on every value change,
  // because that would fight the user's tab selection (e.g. switching to JSON
  // sets an empty object, but inferLiteralType would call that "json" only if
  // it's not a string/number/boolean — and the initial default value could
  // be misclassified).
  const prevExprType = useRef(value.type);
  useEffect(() => {
    if (value.type === "literal" && prevExprType.current !== "literal") {
      setLiteralType(hintedLiteralType ?? inferLiteralType(value.value));
    }
    prevExprType.current = value.type;
  }, [value, hintedLiteralType]);

  const handleTypeChange = useCallback(
    (newType: string) => {
      switch (newType) {
        case "literal":
          if (hasEnum) {
            onChange({
              type: "literal",
              value: schemaHint?.enum?.[0],
            });
          } else {
            onChange({
              type: "literal",
              value: defaultValueForSchemaType(schemaHint?.type),
            });
          }
          break;
        case "jmespath":
          onChange({
            type: "jmespath",
            expression: value.type === "jmespath" ? value.expression : "",
          });
          break;
        case "template":
          onChange({
            type: "template",
            template: value.type === "template" ? value.template : "",
          });
          break;
      }
    },
    [value, onChange, hasEnum, schemaHint],
  );

  const handleLiteralChange = useCallback(
    (raw: string, type: LiteralType) => {
      let parsed: unknown;
      switch (type) {
        case "string":
          parsed = raw;
          break;
        case "number":
          parsed = raw === "" ? 0 : Number(raw);
          break;
        case "boolean":
          parsed = raw === "true";
          break;
        case "json":
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          break;
      }
      onChange({ type: "literal", value: parsed });
    },
    [onChange],
  );

  const handleLiteralTypeChange = useCallback(
    (lt: string) => {
      const newType = lt as LiteralType;
      setLiteralType(newType);
      switch (newType) {
        case "boolean":
          onChange({ type: "literal", value: false });
          break;
        case "number":
          onChange({ type: "literal", value: 0 });
          break;
        case "json":
          onChange({ type: "literal", value: {} });
          break;
        case "string":
          onChange({ type: "literal", value: "" });
          break;
      }
    },
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[11px] font-medium text-muted-foreground mb-1">
          {label}
        </div>
      )}
      {(() => {
        // Extract literal value once so TabsContent children (which are
        // always mounted) can reference it without TS narrowing issues.
        const litVal = value.type === "literal" ? value.value : undefined;

        return (
          <Tabs value={value.type} onValueChange={handleTypeChange}>
            <TabsList>
              <TabsTrigger value="literal">Literal</TabsTrigger>
              <TabsTrigger value="jmespath">Expression</TabsTrigger>
              {allowTemplate && (
                <TabsTrigger value="template">String Template</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="literal">
              {hasEnum ? (
                <Select
                  value={String(litVal ?? "")}
                  onValueChange={(val) => {
                    // Try to preserve the original type of the enum value
                    const match = schemaHint?.enum?.find(
                      (e) => String(e) === val,
                    );
                    onChange({
                      type: "literal",
                      value: match ?? val,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs font-mono w-full">
                    <SelectValue
                      placeholder={
                        defaultHint !== undefined
                          ? `default: ${defaultHint}`
                          : "-- select --"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {schemaHint?.enum?.map((v) => (
                      <SelectItem key={String(v)} value={String(v)}>
                        {String(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : hintedLiteralType ? (
                <LiteralWidget
                  type={hintedLiteralType}
                  value={litVal}
                  onChange={(raw) =>
                    handleLiteralChange(raw, hintedLiteralType)
                  }
                  onValueChange={onChange}
                  defaultHint={defaultHint}
                  defaultJsonHint={defaultJsonHint}
                />
              ) : (
                <Tabs
                  value={literalType}
                  onValueChange={handleLiteralTypeChange}
                >
                  <TabsList>
                    <TabsTrigger value="string">string</TabsTrigger>
                    <TabsTrigger value="number">number</TabsTrigger>
                    <TabsTrigger value="boolean">boolean</TabsTrigger>
                    <TabsTrigger value="json">json</TabsTrigger>
                  </TabsList>

                  <TabsContent value="string">
                    <Input
                      type="text"
                      value={String(litVal ?? "")}
                      onChange={(e) =>
                        handleLiteralChange(e.target.value, "string")
                      }
                      className="h-8 text-xs font-mono"
                      placeholder={defaultHint ?? "Enter value..."}
                    />
                  </TabsContent>

                  <TabsContent value="number">
                    <Input
                      type="number"
                      value={String(litVal ?? "")}
                      onChange={(e) =>
                        handleLiteralChange(e.target.value, "number")
                      }
                      className="h-8 text-xs font-mono"
                      placeholder={defaultHint ?? "0"}
                    />
                  </TabsContent>

                  <TabsContent value="boolean">
                    <Select
                      value={litVal === true ? "true" : "false"}
                      onValueChange={(val) =>
                        onChange({
                          type: "literal",
                          value: val === "true",
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs font-mono w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  </TabsContent>

                  <TabsContent value="json">
                    <JsonCodeEditor
                      value={
                        typeof litVal === "string"
                          ? litVal
                          : JSON.stringify(litVal, null, 2)
                      }
                      onChange={(val) => handleLiteralChange(val, "json")}
                      placeholderText={defaultJsonHint ?? '{"key": "value"}'}
                    />
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>

            <TabsContent value="jmespath">
              <ExpressionInput
                value={value.type === "jmespath" ? value.expression : ""}
                onChange={(expression) =>
                  onChange({ type: "jmespath", expression })
                }
                suggestions={suggestions}
                placeholder="stepId.outputKey"
              />
            </TabsContent>

            {allowTemplate && (
              <TabsContent value="template">
                <TemplateExpressionInput
                  value={value.type === "template" ? value.template : ""}
                  onChange={(template) =>
                    onChange({ type: "template", template })
                  }
                  suggestions={suggestions}
                  placeholder="Hello ${stepId.name}, your total is ${order.total}"
                />
              </TabsContent>
            )}
          </Tabs>
        );
      })()}
    </div>
  );
}

/** Renders a single literal input widget without the type sub-tabs. */
function LiteralWidget({
  type,
  value,
  onChange,
  onValueChange,
  defaultHint,
  defaultJsonHint,
}: {
  type: LiteralType;
  value: unknown;
  onChange: (raw: string) => void;
  onValueChange: (expr: Expression) => void;
  defaultHint?: string;
  defaultJsonHint?: string;
}) {
  switch (type) {
    case "string":
      return (
        <Input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs font-mono"
          placeholder={defaultHint ?? "Enter value..."}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs font-mono"
          placeholder={defaultHint ?? "0"}
        />
      );
    case "boolean":
      return (
        <Select
          value={value === true ? "true" : "false"}
          onValueChange={(val) =>
            onValueChange({
              type: "literal",
              value: val === "true",
            })
          }
        >
          <SelectTrigger className="h-8 text-xs font-mono w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      );
    case "json":
      return (
        <JsonCodeEditor
          value={
            typeof value === "string" ? value : JSON.stringify(value, null, 2)
          }
          onChange={onChange}
          placeholderText={defaultJsonHint ?? '{"key": "value"}'}
        />
      );
  }
}
