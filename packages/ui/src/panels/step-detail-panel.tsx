import type {
  Diagnostic,
  ExecutionPathSegment,
  StepExecutionRecord,
  TraceEntry,
  WorkflowStep,
} from "@remoraflow/core";
import type React from "react";
import { JsonViewer } from "../editors/json-viewer";
import type { StepExecutionSummary } from "../execution-state";
import { SectionHeader, TypeBadge } from "./shared";

function jsonString(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export interface StepDetailPanelProps {
  step: WorkflowStep;
  diagnostics: Diagnostic[];
  executionSummary?: StepExecutionSummary;
  executionRecords?: StepExecutionRecord[];
  onClose: () => void;
}

function renderExpression(
  expr:
    | { type: "literal"; value: unknown }
    | { type: "jmespath"; expression: string }
    | { type: "template"; template: string },
): string {
  if (expr.type === "literal") return JSON.stringify(expr.value);
  if (expr.type === "template") return expr.template;
  return expr.expression;
}

function StatusBadge({ summary }: { summary: StepExecutionSummary }) {
  const colors: Record<string, string> = {
    pending: "bg-muted text-muted-foreground border border-border",
    running:
      "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    completed:
      "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
    failed:
      "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
    skipped: "bg-muted text-muted-foreground border border-border",
  };
  return (
    <span
      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${colors[summary.status]}`}
    >
      {summary.status}
    </span>
  );
}

function ResolvedCode({
  value,
  expression,
}: {
  value: unknown;
  expression?: string;
}) {
  const display = jsonString(value);
  if (typeof value === "string") {
    return (
      <pre
        className="text-xs text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40 rounded-md p-2.5 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] cursor-default border border-emerald-200/60 dark:border-emerald-900/50"
        title={expression}
      >
        {display}
      </pre>
    );
  }
  return <JsonViewer value={display} />;
}

function StepParams({
  step,
  resolvedInputs,
}: {
  step: WorkflowStep;
  resolvedInputs?: unknown;
}) {
  const resolved = resolvedInputs as Record<string, unknown> | undefined;

  switch (step.type) {
    case "tool-call":
      return (
        <div className="space-y-3">
          <div>
            <Label>Tool</Label>
            <div className="text-xs font-mono font-medium text-foreground bg-muted/40 rounded px-2 py-1 inline-block">
              {step.params.toolName}
            </div>
          </div>
          {Object.keys(step.params.toolInput).length > 0 && (
            <div>
              <Label>Inputs</Label>
              <div className="space-y-1.5">
                {Object.entries(step.params.toolInput).map(([key, val]) => {
                  const resolvedVal = resolved?.[key];
                  const hasResolved = resolvedVal !== undefined;
                  return (
                    <div
                      key={key}
                      className="flex gap-2 text-xs items-baseline"
                    >
                      <span className="font-mono font-medium text-muted-foreground shrink-0">
                        {key}
                      </span>
                      <span className="text-muted-foreground/40">=</span>
                      <span
                        className={`font-mono ${hasResolved ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}
                        title={hasResolved ? renderExpression(val) : undefined}
                      >
                        {hasResolved
                          ? typeof resolvedVal === "string"
                            ? resolvedVal
                            : JSON.stringify(resolvedVal)
                          : renderExpression(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );

    case "llm-prompt":
      return (
        <div className="space-y-2">
          <div>
            <Label>Prompt</Label>
            {resolved?.prompt ? (
              <ResolvedCode
                value={resolved.prompt}
                expression={step.params.prompt}
              />
            ) : (
              <pre className="text-xs rounded p-2 whitespace-pre-wrap font-mono text-foreground bg-muted">
                {step.params.prompt}
              </pre>
            )}
          </div>
          <div>
            <Label>Output Format</Label>
            <JsonViewer
              value={JSON.stringify(step.params.outputFormat, null, 2)}
            />
          </div>
        </div>
      );

    case "extract-data":
      return (
        <div className="space-y-2">
          <div>
            <Label>Source</Label>
            {resolved?.sourceData !== undefined ? (
              <ResolvedCode
                value={resolved.sourceData}
                expression={renderExpression(step.params.sourceData)}
              />
            ) : (
              <Code>{renderExpression(step.params.sourceData)}</Code>
            )}
          </div>
          <div>
            <Label>Output Format</Label>
            <JsonViewer
              value={JSON.stringify(step.params.outputFormat, null, 2)}
            />
          </div>
        </div>
      );

    case "switch-case":
      return (
        <div className="space-y-3">
          <div>
            <Label>Switch On</Label>
            {resolved?.switchOn !== undefined ? (
              <ResolvedCode
                value={resolved.switchOn}
                expression={renderExpression(step.params.switchOn)}
              />
            ) : (
              <Code>{renderExpression(step.params.switchOn)}</Code>
            )}
          </div>
          <div>
            <Label>Cases</Label>
            <div className="space-y-1.5">
              {step.params.cases.map((c) => (
                <div
                  key={c.branchBodyStepId}
                  className="text-xs flex items-center gap-2 bg-muted/30 rounded-md px-2.5 py-1.5"
                >
                  <span className="font-mono font-medium text-muted-foreground">
                    {c.value.type === "default"
                      ? "default"
                      : renderExpression(c.value)}
                  </span>
                  <span className="text-muted-foreground/40">&rarr;</span>
                  <span className="font-mono font-medium text-foreground">
                    {c.branchBodyStepId}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case "for-each":
      return (
        <div className="space-y-2">
          <div>
            <Label>Target</Label>
            {resolved?.target !== undefined ? (
              <ResolvedCode
                value={resolved.target}
                expression={renderExpression(step.params.target)}
              />
            ) : (
              <Code>{renderExpression(step.params.target)}</Code>
            )}
          </div>
          <div>
            <Label>Item Variable</Label>
            <Code>{step.params.itemName}</Code>
          </div>
          <div>
            <Label>Loop Body</Label>
            <Code>{step.params.loopBodyStepId}</Code>
          </div>
        </div>
      );

    case "sleep":
      return (
        <div className="space-y-2">
          <div>
            <Label>Duration</Label>
            {resolved?.durationMs !== undefined ? (
              <ResolvedCode
                value={`${resolved.durationMs}ms`}
                expression={renderExpression(step.params.durationMs)}
              />
            ) : (
              <Code>{renderExpression(step.params.durationMs)}ms</Code>
            )}
          </div>
        </div>
      );

    case "wait-for-condition":
      return (
        <div className="space-y-2">
          <div>
            <Label>Condition</Label>
            {resolved?.condition !== undefined ? (
              <ResolvedCode
                value={resolved.condition}
                expression={renderExpression(step.params.condition)}
              />
            ) : (
              <Code>{renderExpression(step.params.condition)}</Code>
            )}
          </div>
          <div>
            <Label>Condition Step</Label>
            <Code>{step.params.conditionStepId}</Code>
          </div>
          {step.params.maxAttempts && (
            <div>
              <Label>Max Attempts</Label>
              <Code>{renderExpression(step.params.maxAttempts)}</Code>
            </div>
          )}
          {step.params.intervalMs && (
            <div>
              <Label>Interval</Label>
              <Code>{renderExpression(step.params.intervalMs)}ms</Code>
            </div>
          )}
          {step.params.timeoutMs && (
            <div>
              <Label>Timeout</Label>
              <Code>{renderExpression(step.params.timeoutMs)}ms</Code>
            </div>
          )}
        </div>
      );

    case "agent-loop":
      return (
        <div className="space-y-2">
          <div>
            <Label>Instructions</Label>
            <pre className="text-xs rounded p-2 whitespace-pre-wrap font-mono text-foreground bg-muted">
              {step.params.instructions}
            </pre>
          </div>
          {step.params.tools.length > 0 && (
            <div>
              <Label>Tools</Label>
              <Code>{step.params.tools.join(", ")}</Code>
            </div>
          )}
          <div>
            <Label>Output Format</Label>
            <JsonViewer
              value={JSON.stringify(step.params.outputFormat, null, 2)}
            />
          </div>
          {step.params.maxSteps && (
            <div>
              <Label>Max Steps</Label>
              <Code>{renderExpression(step.params.maxSteps)}</Code>
            </div>
          )}
        </div>
      );

    case "start":
      return null;

    case "end":
      if (step.params?.output) {
        return (
          <div className="space-y-2">
            <div>
              <Label>Output</Label>
              {resolved?.output !== undefined ? (
                <ResolvedCode
                  value={resolved.output}
                  expression={renderExpression(step.params.output)}
                />
              ) : (
                <Code>{renderExpression(step.params.output)}</Code>
              )}
            </div>
          </div>
        );
      }
      return null;
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium text-muted-foreground mb-1">
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="text-xs rounded-md p-2.5 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] text-foreground bg-muted/60 border border-border/50">
      {children}
    </pre>
  );
}

function formatPathSegment(seg: ExecutionPathSegment): string {
  switch (seg.type) {
    case "for-each":
      return `Iteration ${seg.iterationIndex}: ${formatValue(seg.itemValue)}`;
    case "switch-case":
      return `Case ${seg.matchedCaseIndex}: ${formatValue(seg.matchedValue)}`;
    case "wait-for-condition":
      return `Poll attempt ${seg.pollAttempt}`;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const recordStatusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground border border-border",
  running:
    "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  completed:
    "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  failed:
    "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  skipped: "bg-muted text-muted-foreground border border-border",
};

function TraceSection({ trace }: { trace: TraceEntry[] }) {
  if (trace.length === 0) return null;

  return (
    <details className="text-xs group">
      <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors py-0.5">
        Agent Trace ({trace.length} {trace.length === 1 ? "entry" : "entries"})
      </summary>
      <div className="mt-1.5">
        <JsonViewer value={JSON.stringify(trace, null, 2)} />
      </div>
    </details>
  );
}

function ExecutionRecordCard({ record }: { record: StepExecutionRecord }) {
  const pathLabel =
    record.path.length > 0
      ? record.path.map(formatPathSegment).join(" > ")
      : null;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      {pathLabel && (
        <div className="text-[11px] font-medium text-muted-foreground">
          {pathLabel}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${recordStatusColors[record.status]}`}
        >
          {record.status}
        </span>
        {record.durationMs !== undefined && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {record.durationMs}ms
          </span>
        )}
        {record.retries.length > 0 && (
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
            {record.retries.length}{" "}
            {record.retries.length === 1 ? "retry" : "retries"}
          </span>
        )}
      </div>
      {record.resolvedInputs !== undefined && (
        <details className="text-xs group">
          <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors py-0.5">
            Resolved Inputs
          </summary>
          <div className="mt-1.5">
            <ResolvedCode value={record.resolvedInputs} />
          </div>
        </details>
      )}
      {record.output !== undefined && (
        <details className="text-xs group">
          <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors py-0.5">
            Output
          </summary>
          <div className="mt-1.5">
            <JsonViewer value={jsonString(record.output)} />
          </div>
        </details>
      )}
      {record.trace && record.trace.length > 0 && (
        <TraceSection trace={record.trace} />
      )}
      {record.error && (
        <div className="text-xs p-2.5 rounded-md bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/60">
          <div className="font-semibold font-mono">{record.error.code}</div>
          <div className="mt-1 leading-relaxed">{record.error.message}</div>
        </div>
      )}
    </div>
  );
}

export function StepDetailPanel({
  step,
  diagnostics,
  executionSummary,
  executionRecords,
  onClose,
}: StepDetailPanelProps) {
  return (
    <div className="w-[360px] border-l h-full min-h-0 overflow-y-auto bg-card border-border">
      <div className="sticky top-0 z-10 border-b px-4 py-3 flex items-center justify-between bg-card/95 backdrop-blur-sm border-border">
        <TypeBadge type={step.type} />
        <button
          type="button"
          onClick={onClose}
          className="text-lg leading-none text-muted-foreground hover:text-foreground shrink-0 rounded-md w-7 h-7 flex items-center justify-center hover:bg-muted transition-colors"
        >
          &times;
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        <div className="font-medium text-sm text-foreground">{step.name}</div>

        <div>
          <Label>Step ID</Label>
          <div className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 inline-block">
            {step.id}
          </div>
        </div>

        {step.description && (
          <div>
            <Label>Description</Label>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {step.description}
            </div>
          </div>
        )}

        {step.nextStepId && (
          <div>
            <Label>Next Step</Label>
            <div className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 inline-block">
              {step.nextStepId}
            </div>
          </div>
        )}

        <div className="border-t pt-4 border-border">
          <SectionHeader>Parameters</SectionHeader>
          <div className="mt-1">
            <StepParams
              step={step}
              resolvedInputs={
                executionRecords?.length
                  ? executionRecords[executionRecords.length - 1]
                      ?.resolvedInputs
                  : undefined
              }
            />
          </div>
        </div>

        {executionSummary && (
          <div className="border-t border-border pt-4">
            <SectionHeader>Execution</SectionHeader>
            <div className="mt-1 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge summary={executionSummary} />
                {executionSummary.latestDurationMs !== undefined && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {executionSummary.latestDurationMs}ms
                  </span>
                )}
                {executionSummary.executionCount > 1 && (
                  <span className="text-[11px] text-muted-foreground">
                    ({executionSummary.completedCount}/
                    {executionSummary.executionCount} iterations)
                  </span>
                )}
              </div>

              <div>
                <Label>Output</Label>
                <JsonViewer
                  value={
                    executionSummary.latestOutput !== undefined
                      ? jsonString(executionSummary.latestOutput)
                      : undefined
                  }
                />
              </div>

              {executionSummary.latestTrace &&
                executionSummary.latestTrace.length > 0 && (
                  <TraceSection trace={executionSummary.latestTrace} />
                )}

              {executionSummary.latestError && (
                <div className="text-xs p-2.5 rounded-md bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/60">
                  <div className="font-semibold font-mono">
                    {executionSummary.latestError.code}
                  </div>
                  <div className="mt-1 leading-relaxed">
                    {executionSummary.latestError.message}
                  </div>
                </div>
              )}

              {executionSummary.totalRetries > 0 && (
                <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  {executionSummary.totalRetries}{" "}
                  {executionSummary.totalRetries === 1 ? "retry" : "retries"}{" "}
                  attempted
                </div>
              )}
            </div>
          </div>
        )}

        {executionRecords && executionRecords.length > 0 && (
          <div className="border-t border-border pt-4">
            <SectionHeader>Execution History</SectionHeader>
            <div className="space-y-2 mt-1">
              {executionRecords.map((record, i) => (
                <ExecutionRecordCard
                  key={`${record.stepId}-${i}`}
                  record={record}
                />
              ))}
            </div>
          </div>
        )}

        {diagnostics.length > 0 && (
          <div className="border-t pt-4 border-border">
            <SectionHeader>Diagnostics</SectionHeader>
            <div className="space-y-2 mt-1">
              {diagnostics.map((d) => (
                <div
                  key={`${d.code}-${d.message}`}
                  className={`text-xs p-2.5 rounded-md ${
                    d.severity === "error"
                      ? "bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/60"
                      : "bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/60"
                  }`}
                >
                  <div className="font-semibold font-mono">{d.code}</div>
                  <div className="mt-1 leading-relaxed">{d.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
