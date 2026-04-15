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
import { Label, SectionHeader, TypeBadge } from "./shared";

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
    pending: "rf:bg-muted rf:text-muted-foreground border rf:border-border",
    running: "rf:bg-blue-500/10 rf:text-blue-600 border rf:border-blue-500/20",
    completed:
      "rf:bg-green-500/10 rf:text-green-600 border rf:border-green-500/20",
    failed:
      "rf:bg-destructive/10 rf:text-destructive border rf:border-destructive/20",
    skipped: "rf:bg-muted rf:text-muted-foreground border rf:border-border",
  };
  return (
    <span
      className={`rf:text-[11px] rf:font-semibold rf:px-2.5 rf:py-0.5 rf:rounded-full ${colors[summary.status]}`}
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
        className="rf:text-xs rf:text-emerald-600 rf:bg-emerald-500/10 rf:rounded-md rf:p-2.5 rf:whitespace-pre-wrap rf:font-mono rf:overflow-auto rf:max-h-[200px] rf:cursor-default border rf:border-emerald-500/20"
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
        <div className="rf:space-y-3">
          <div>
            <Label>Tool</Label>
            <div className="rf:text-xs rf:font-mono rf:font-medium rf:text-foreground rf:bg-muted/40 rounded rf:px-2 rf:py-1 rf:inline-block">
              {step.params.toolName}
            </div>
          </div>
          {Object.keys(step.params.toolInput).length > 0 && (
            <div>
              <Label>Inputs</Label>
              <div className="rf:space-y-1.5">
                {Object.entries(step.params.toolInput).map(([key, val]) => {
                  const resolvedVal = resolved?.[key];
                  const hasResolved = resolvedVal !== undefined;
                  return (
                    <div
                      key={key}
                      className="rf:flex rf:gap-2 rf:text-xs rf:items-baseline"
                    >
                      <span className="rf:font-mono rf:font-medium rf:text-muted-foreground rf:shrink-0">
                        {key}
                      </span>
                      <span className="rf:text-muted-foreground/40">=</span>
                      <span
                        className={`rf:font-mono ${hasResolved ? "rf:text-emerald-600" : "rf:text-foreground"}`}
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
        <div className="rf:space-y-2">
          <div>
            <Label>Prompt</Label>
            {resolved?.prompt ? (
              <ResolvedCode
                value={resolved.prompt}
                expression={step.params.prompt}
              />
            ) : (
              <pre className="rf:text-xs rounded rf:p-2 rf:whitespace-pre-wrap rf:font-mono rf:text-foreground rf:bg-muted">
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
        <div className="rf:space-y-2">
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
        <div className="rf:space-y-3">
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
            <div className="rf:space-y-1.5">
              {step.params.cases.map((c) => (
                <div
                  key={c.branchBodyStepId}
                  className="rf:text-xs rf:flex rf:items-center rf:gap-2 rf:bg-muted/30 rf:rounded-md rf:px-2.5 rf:py-1.5"
                >
                  <span className="rf:font-mono rf:font-medium rf:text-muted-foreground">
                    {c.value.type === "default"
                      ? "default"
                      : renderExpression(c.value)}
                  </span>
                  <span className="rf:text-muted-foreground/40">&rarr;</span>
                  <span className="rf:font-mono rf:font-medium rf:text-foreground">
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
        <div className="rf:space-y-2">
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
        <div className="rf:space-y-2">
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
        <div className="rf:space-y-2">
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
        <div className="rf:space-y-2">
          <div>
            <Label>Instructions</Label>
            <pre className="rf:text-xs rounded rf:p-2 rf:whitespace-pre-wrap rf:font-mono rf:text-foreground rf:bg-muted">
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
          <div className="rf:space-y-2">
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="rf:text-xs rf:rounded-md rf:p-2.5 rf:whitespace-pre-wrap rf:font-mono rf:overflow-auto rf:max-h-[200px] rf:text-foreground rf:bg-muted/60 border rf:border-border/50">
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
  pending: "rf:bg-muted rf:text-muted-foreground border rf:border-border",
  running: "rf:bg-blue-500/10 rf:text-blue-600 border rf:border-blue-500/20",
  completed:
    "rf:bg-green-500/10 rf:text-green-600 border rf:border-green-500/20",
  failed:
    "rf:bg-destructive/10 rf:text-destructive border rf:border-destructive/20",
  skipped: "rf:bg-muted rf:text-muted-foreground border rf:border-border",
};

function TraceSection({ trace }: { trace: TraceEntry[] }) {
  if (trace.length === 0) return null;

  return (
    <details className="rf:text-xs rf:group">
      <summary className="rf:text-[11px] rf:font-medium rf:text-muted-foreground rf:cursor-pointer rf:select-none rf:hover:text-foreground rf:transition-colors rf:py-0.5">
        Agent Trace ({trace.length} {trace.length === 1 ? "entry" : "entries"})
      </summary>
      <div className="rf:mt-1.5">
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
    <div className="border rf:border-border rf:rounded-lg rf:p-3 rf:space-y-2 rf:bg-card">
      {pathLabel && (
        <div className="rf:text-[11px] rf:font-medium rf:text-muted-foreground">
          {pathLabel}
        </div>
      )}
      <div className="rf:flex rf:items-center rf:gap-2">
        <span
          className={`rf:text-[11px] rf:font-semibold rf:px-2.5 rf:py-0.5 rf:rounded-full ${recordStatusColors[record.status]}`}
        >
          {record.status}
        </span>
        {record.durationMs !== undefined && (
          <span className="rf:text-[11px] rf:text-muted-foreground rf:tabular-nums">
            {record.durationMs}ms
          </span>
        )}
        {record.retries.length > 0 && (
          <span className="rf:text-[11px] rf:font-medium rf:text-amber-600">
            {record.retries.length}{" "}
            {record.retries.length === 1 ? "retry" : "retries"}
          </span>
        )}
      </div>
      {record.resolvedInputs !== undefined && (
        <details className="rf:text-xs rf:group">
          <summary className="rf:text-[11px] rf:font-medium rf:text-muted-foreground rf:cursor-pointer rf:select-none rf:hover:text-foreground rf:transition-colors rf:py-0.5">
            Resolved Inputs
          </summary>
          <div className="rf:mt-1.5">
            <ResolvedCode value={record.resolvedInputs} />
          </div>
        </details>
      )}
      {record.output !== undefined && (
        <details className="rf:text-xs rf:group">
          <summary className="rf:text-[11px] rf:font-medium rf:text-muted-foreground rf:cursor-pointer rf:select-none rf:hover:text-foreground rf:transition-colors rf:py-0.5">
            Output
          </summary>
          <div className="rf:mt-1.5">
            <JsonViewer value={jsonString(record.output)} />
          </div>
        </details>
      )}
      {record.trace && record.trace.length > 0 && (
        <TraceSection trace={record.trace} />
      )}
      {record.error && (
        <div className="rf:text-xs rf:p-2.5 rf:rounded-md rf:bg-destructive/10 rf:text-destructive border rf:border-destructive/20">
          <div className="rf:font-semibold rf:font-mono">
            {record.error.code}
          </div>
          <div className="rf:mt-1 rf:leading-relaxed">
            {record.error.message}
          </div>
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
    <div className="rf:w-[360px] rf:border-l rf:h-full rf:min-h-0 rf:overflow-y-auto rf:bg-card rf:border-border">
      <div className="rf:sticky rf:top-0 rf:z-10 rf:border-b rf:px-4 rf:py-3 rf:flex rf:items-center rf:justify-between rf:bg-card/95 rf:backdrop-blur-sm rf:border-border">
        <TypeBadge type={step.type} />
        <button
          type="button"
          onClick={onClose}
          className="rf:text-lg rf:leading-none rf:text-muted-foreground rf:hover:text-foreground rf:shrink-0 rf:rounded-md rf:w-7 rf:h-7 rf:flex rf:items-center rf:justify-center rf:hover:bg-muted rf:transition-colors"
        >
          &times;
        </button>
      </div>

      <div className="rf:px-4 rf:py-4 rf:space-y-4">
        <div className="rf:space-y-3">
          <div>
            <div className="rf:font-medium rf:text-sm rf:text-foreground">
              {step.name}
            </div>
            {step.description && (
              <div className="rf:text-xs rf:text-muted-foreground rf:leading-relaxed rf:mt-1">
                {step.description}
              </div>
            )}
          </div>

          <div className="rf:grid rf:grid-cols-2 rf:gap-3">
            <div>
              <Label>Step ID</Label>
              <div className="rf:text-xs rf:font-mono rf:text-muted-foreground rf:bg-muted/40 rounded rf:px-2 rf:py-1.5 rf:truncate">
                {step.id}
              </div>
            </div>
            {step.nextStepId && (
              <div>
                <Label>Next Step</Label>
                <div className="rf:text-xs rf:font-mono rf:text-muted-foreground rf:bg-muted/40 rounded rf:px-2 rf:py-1.5 rf:truncate">
                  {step.nextStepId}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rf:border-t rf:pt-4 rf:border-border">
          <SectionHeader>Parameters</SectionHeader>
          <div className="rf:mt-2">
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
          <div className="rf:border-t rf:border-border rf:pt-4">
            <SectionHeader>Execution</SectionHeader>
            <div className="rf:mt-2 rf:space-y-3">
              <div className="rf:flex rf:items-center rf:gap-2 rf:flex-wrap">
                <StatusBadge summary={executionSummary} />
                {executionSummary.latestDurationMs !== undefined && (
                  <span className="rf:text-[11px] rf:text-muted-foreground rf:tabular-nums">
                    {executionSummary.latestDurationMs}ms
                  </span>
                )}
                {executionSummary.executionCount > 1 && (
                  <span className="rf:text-[11px] rf:text-muted-foreground">
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
                <div className="rf:text-xs rf:p-2.5 rf:rounded-md rf:bg-destructive/10 rf:text-destructive border rf:border-destructive/20">
                  <div className="rf:font-semibold rf:font-mono">
                    {executionSummary.latestError.code}
                  </div>
                  <div className="rf:mt-1 rf:leading-relaxed">
                    {executionSummary.latestError.message}
                  </div>
                </div>
              )}

              {executionSummary.totalRetries > 0 && (
                <div className="rf:text-[11px] rf:font-medium rf:text-amber-600">
                  {executionSummary.totalRetries}{" "}
                  {executionSummary.totalRetries === 1 ? "retry" : "retries"}{" "}
                  attempted
                </div>
              )}
            </div>
          </div>
        )}

        {executionRecords && executionRecords.length > 0 && (
          <div className="rf:border-t rf:border-border rf:pt-4">
            <SectionHeader>Execution History</SectionHeader>
            <div className="rf:space-y-2 rf:mt-2">
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
          <div className="rf:border-t rf:pt-4 rf:border-border">
            <SectionHeader>Diagnostics</SectionHeader>
            <div className="rf:space-y-2 rf:mt-2">
              {diagnostics.map((d) => (
                <div
                  key={`${d.code}-${d.message}`}
                  className={`rf:text-xs rf:p-2.5 rf:rounded-md ${
                    d.severity === "error"
                      ? "rf:bg-destructive/10 rf:text-destructive border rf:border-destructive/20"
                      : "rf:bg-amber-500/10 rf:text-amber-600 border rf:border-amber-500/20"
                  }`}
                >
                  <div className="rf:font-semibold rf:font-mono">{d.code}</div>
                  <div className="rf:mt-1 rf:leading-relaxed">{d.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
