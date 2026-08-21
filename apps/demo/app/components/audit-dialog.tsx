import type { WorkflowDefinition } from "@remoraflow/core";
import { JsonViewer } from "@remoraflow/ui";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { rpc } from "../lib/rpc-client.ts";

type ToolCallProvenance = "tool-call" | "agent-loop";

interface ToolCallSource {
    provenance: ToolCallProvenance;
    inputSpace: unknown;
    stepIds: string[];
}

interface ToolCallEntry {
    toolName: string;
    sources: ToolCallSource[];
}

function formatStepList(source: ToolCallSource): string {
    const steps = source.stepIds.map((id) => `"${id}"`).join(", ");
    const stepWord = source.stepIds.length === 1 ? "step" : "steps";
    return `${source.provenance} ${stepWord} ${steps}`;
}

export function AuditDialog({
    open,
    onOpenChange,
    workflow,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflow: WorkflowDefinition;
}) {
    const [loading, setLoading] = useState(false);
    const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        (
            rpc.workflow.audit as unknown as (arg: {
                workflow: unknown;
            }) => Promise<{ capabilities: { toolCalls: ToolCallEntry[] } }>
        )({ workflow })
            .then((result) => {
                setToolCalls(result.capabilities.toolCalls);
            })
            .catch(() => {
                setToolCalls([]);
            })
            .finally(() => setLoading(false));
    }, [open, workflow]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Workflow Capability Audit</DialogTitle>
                    <DialogDescription className="whitespace-pre-line">
                        {
                            "All of the tools that this workflow might invoke during execution and their input space. At compile time, Remoraflow determines exactly which params can be passed to tools in `tool-call` steps, increasing the predictability of your workflow. Tools passed to `agent-loop` steps can have their input space constrained by the workflow definition to prevent agents from drifting off course during execution.\n\nThe schemas below represent exactly which tools can be called during the workflow and with which inputs."
                        }
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto min-h-0 min-w-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : toolCalls.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">
                            No tool calls detected in this workflow.
                        </p>
                    ) : (
                        <div className="grid gap-4 min-w-0">
                            {toolCalls.map((tc) => (
                                <div
                                    key={tc.toolName}
                                    className="border border-border rounded-md p-3 min-w-0"
                                >
                                    <h4 className="text-sm font-medium font-mono mb-3 truncate">
                                        {tc.toolName}
                                    </h4>
                                    <div className="grid gap-3 min-w-0">
                                        {tc.sources.map((source) => (
                                            <div
                                                key={source.provenance}
                                                className="space-y-1.5 min-w-0"
                                            >
                                                <h5 className="text-xs text-muted-foreground">
                                                    Called from{" "}
                                                    {formatStepList(source)}
                                                </h5>
                                                <JsonViewer
                                                    value={JSON.stringify(
                                                        source.inputSpace,
                                                        null,
                                                        2,
                                                    )}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <DialogFooter showCloseButton />
            </DialogContent>
        </Dialog>
    );
}
