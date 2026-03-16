import { useCallback, useEffect, useState } from "react";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { JsonCodeEditor } from "./json-code-editor";

type Expression =
	| { type: "literal"; value: unknown }
	| { type: "jmespath"; expression: string }
	| { type: "template"; template: string };

export interface ExpressionEditorProps {
	value: Expression;
	onChange: (value: Expression) => void;
	label?: string;
}

const TAB_CLASSES =
	"px-2 py-1 text-[11px] font-medium rounded transition-colors";
const ACTIVE_TAB = "bg-foreground text-background";
const INACTIVE_TAB =
	"text-muted-foreground hover:text-foreground hover:bg-muted/50";

type LiteralType = "string" | "number" | "boolean" | "json";

function inferLiteralType(value: unknown): LiteralType {
	if (typeof value === "string") return "string";
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	return "json";
}

export function ExpressionEditor({
	value,
	onChange,
	label,
}: ExpressionEditorProps) {
	const [literalType, setLiteralType] = useState<LiteralType>(
		value.type === "literal" ? inferLiteralType(value.value) : "string",
	);

	useEffect(() => {
		if (value.type === "literal") {
			setLiteralType(inferLiteralType(value.value));
		}
	}, [value]);

	const handleTypeChange = useCallback(
		(newType: Expression["type"]) => {
			switch (newType) {
				case "literal":
					onChange({ type: "literal", value: "" });
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
		[value, onChange],
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

	return (
		<div className="space-y-1.5">
			{label && (
				<div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</div>
			)}
			<div className="flex gap-1">
				{(["literal", "jmespath", "template"] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => handleTypeChange(t)}
						className={`${TAB_CLASSES} ${value.type === t ? ACTIVE_TAB : INACTIVE_TAB}`}
					>
						{t === "jmespath"
							? "JMESPath"
							: t === "literal"
								? "Literal"
								: "Template"}
					</button>
				))}
			</div>

			{value.type === "literal" && (
				<div className="space-y-1">
					<div className="flex gap-1">
						{(["string", "number", "boolean", "json"] as const).map((lt) => (
							<button
								key={lt}
								type="button"
								onClick={() => {
									setLiteralType(lt);
									handleLiteralChange(
										lt === "boolean" ? "false" : lt === "number" ? "0" : "",
										lt,
									);
								}}
								className={`${TAB_CLASSES} ${literalType === lt ? "bg-muted text-foreground" : INACTIVE_TAB}`}
							>
								{lt}
							</button>
						))}
					</div>
					{literalType === "boolean" ? (
						<Select
							value={value.value === true ? "true" : "false"}
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
					) : literalType === "json" ? (
						<JsonCodeEditor
							value={
								typeof value.value === "string"
									? value.value
									: JSON.stringify(value.value, null, 2)
							}
							onChange={(val) => handleLiteralChange(val, "json")}
							placeholderText='{"key": "value"}'
						/>
					) : (
						<Input
							type={literalType === "number" ? "number" : "text"}
							value={String(value.value ?? "")}
							onChange={(e) => handleLiteralChange(e.target.value, literalType)}
							className="h-8 text-xs font-mono"
							placeholder={literalType === "number" ? "0" : "Enter value..."}
						/>
					)}
				</div>
			)}

			{value.type === "jmespath" && (
				<Input
					value={value.expression}
					onChange={(e) =>
						onChange({ type: "jmespath", expression: e.target.value })
					}
					className="h-8 text-xs font-mono"
					placeholder="stepId.outputKey"
				/>
			)}

			{value.type === "template" && (
				<Textarea
					value={value.template}
					onChange={(e) =>
						onChange({ type: "template", template: e.target.value })
					}
					rows={3}
					className="text-xs font-mono resize-y"
					placeholder="Hello ${stepId.name}, your total is ${order.total}"
				/>
			)}
		</div>
	);
}
