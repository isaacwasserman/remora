import type { WorkflowDefinition } from "@remoraflow/core";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { rpc } from "../lib/rpc-client.ts";
import { loadOpenRouterConfig } from "../lib/storage.ts";

interface NewWorkflowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (workflow: WorkflowDefinition) => void;
}

const BLANK_WORKFLOW: WorkflowDefinition = {
    initialStepId: "start",
    steps: [
        {
            id: "start",
            name: "Start",
            description: "Entry point",
            type: "start",
            nextStepId: "end",
        },
        {
            id: "end",
            name: "End",
            description: "Workflow output",
            type: "end",
            params: {
                output: { type: "jmespath", expression: "input" },
            },
        },
    ],
};

export function NewWorkflowDialog({
    open,
    onOpenChange,
    onCreated,
}: NewWorkflowDialogProps) {
    const [description, setDescription] = useState("");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleBlank = () => {
        onCreated(structuredClone(BLANK_WORKFLOW));
        onOpenChange(false);
    };

    const handleGenerate = async () => {
        const llmConfig = loadOpenRouterConfig();
        if (!llmConfig?.apiKey) {
            setError("Connect OpenRouter before generating a workflow.");
            return;
        }
        setError(null);
        setGenerating(true);
        try {
            let workflow: WorkflowDefinition | null = null;
            const generateFn = rpc.workflow.generate as unknown as (arg: {
                description: string;
                llmConfig: unknown;
            }) => Promise<
                AsyncIterable<{
                    partial?: unknown;
                    result?: WorkflowDefinition;
                }>
            >;
            const stream = await generateFn({ description, llmConfig });
            for await (const chunk of stream) {
                if (chunk.result) {
                    workflow = chunk.result;
                }
            }
            if (workflow) {
                onCreated(workflow);
                onOpenChange(false);
                setDescription("");
            } else {
                setError("Generation did not produce a workflow.");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed.");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Workflow</DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="blank">
                    <TabsList>
                        <TabsTrigger value="blank">Blank</TabsTrigger>
                        <TabsTrigger value="generate">Generate</TabsTrigger>
                    </TabsList>
                    <TabsContent value="blank">
                        <p className="text-sm text-muted-foreground py-4">
                            Create a minimal workflow with a start and end step.
                        </p>
                        <DialogFooter>
                            <Button onClick={handleBlank}>Create</Button>
                        </DialogFooter>
                    </TabsContent>
                    <TabsContent value="generate">
                        <div className="grid gap-3 py-2">
                            <Textarea
                                placeholder="Describe the workflow you want to create..."
                                value={description}
                                onChange={(
                                    e: React.ChangeEvent<HTMLTextAreaElement>,
                                ) => setDescription(e.target.value)}
                                rows={4}
                                disabled={generating}
                            />
                            {error && (
                                <p className="text-xs text-destructive">
                                    {error}
                                </p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button
                                onClick={handleGenerate}
                                disabled={generating || !description.trim()}
                            >
                                {generating && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {generating ? "Generating..." : "Generate"}
                            </Button>
                        </DialogFooter>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
