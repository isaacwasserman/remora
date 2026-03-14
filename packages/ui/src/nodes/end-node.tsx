import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

function renderExpr(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string }
		| { type: "template"; template: string },
): string {
	if (expr.type === "literal") return JSON.stringify(expr.value);
	if (expr.type === "template") return expr.template;
	return expr.expression;
}

export function EndNode({ data, selected }: NodeProps) {
	const { step, diagnostics, executionSummary, outputSchema } =
		data as unknown as StepNodeData;

	const schema = outputSchema as
		| { properties?: Record<string, { type?: string }> }
		| undefined;
	const schemaProperties = schema?.properties
		? Object.entries(schema.properties)
		: [];

	if (
		step?.type === "end" &&
		(step.params?.output || schemaProperties.length > 0)
	) {
		return (
			<BaseNode
				id={step.id}
				name={step.name}
				typeLabel="End"
				typeLabelColor="text-muted-foreground"
				accent="#6b7280"
				description={step.description}
				diagnostics={diagnostics}
				selected={selected}
				hasSourceEdge={false}
				executionSummary={executionSummary}
			>
				{step.params?.output && (
					<div className="flex gap-1.5 text-[11px]">
						<span className="text-muted-foreground shrink-0">output:</span>
						<span className="font-mono text-muted-foreground truncate">
							{renderExpr(step.params.output)}
						</span>
					</div>
				)}
				{schemaProperties.length > 0 && (
					<div className="mt-1 space-y-0.5">
						<div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
							Output Schema
						</div>
						{schemaProperties.map(([key, val]) => (
							<div key={key} className="flex gap-1.5 text-[11px]">
								<span className="text-muted-foreground font-medium shrink-0">
									{key}
								</span>
								<span className="font-mono text-muted-foreground">
									{val?.type}
								</span>
							</div>
						))}
					</div>
				)}
			</BaseNode>
		);
	}

	const hasErrors = diagnostics?.some((d) => d.severity === "error");

	let ringClass = "";
	if (executionSummary) {
		switch (executionSummary.status) {
			case "running":
				ringClass = "ring-2 ring-blue-400 animate-pulse";
				break;
			case "completed":
				ringClass = "ring-2 ring-green-400";
				break;
			case "failed":
				ringClass = "ring-2 ring-red-500";
				break;
		}
	} else {
		if (hasErrors) ringClass = "ring-2 ring-red-500";
		else if (selected) ringClass = "ring-2 ring-blue-400";
	}

	const hasRing = hasErrors || selected || !!executionSummary;

	return (
		<div
			className={`rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-sm border transition-all duration-150 bg-muted border-border hover:bg-accent ${hasRing ? ringClass : "hover:ring-2 hover:ring-ring"}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!w-2 !h-2 !bg-muted-foreground"
			/>
			<span className="text-xs font-medium text-muted-foreground">End</span>
		</div>
	);
}
