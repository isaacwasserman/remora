import type React from "react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { InterventionRequestState } from "../hooks/use-ws-execution.ts";

interface InterventionDialogProps {
    request: InterventionRequestState | null;
    onRespond: (requestId: string, answer: string) => void;
}

export function InterventionDialog({
    request,
    onRespond,
}: InterventionDialogProps) {
    const [selected, setSelected] = useState<string>("");
    const [freeText, setFreeText] = useState("");

    if (!request) return null;

    const handleSubmit = () => {
        const answer = selected === "__free__" ? freeText : selected;
        if (!answer) return;
        onRespond(request.requestId, answer);
        setSelected("");
        setFreeText("");
    };

    return (
        <Dialog open onOpenChange={() => {}}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>Intervention Required</DialogTitle>
                    <DialogDescription>{request.question}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-2 py-2">
                    {request.choices.map((choice) => (
                        <label
                            key={choice}
                            className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-muted/50 transition-colors"
                        >
                            <input
                                type="radio"
                                name="intervention-choice"
                                value={choice}
                                checked={selected === choice}
                                onChange={() => setSelected(choice)}
                                className="accent-primary"
                            />
                            <span className="text-sm">{choice}</span>
                        </label>
                    ))}
                    {request.allowFreeResponse && (
                        <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-muted/50 transition-colors">
                            <input
                                type="radio"
                                name="intervention-choice"
                                value="__free__"
                                checked={selected === "__free__"}
                                onChange={() => setSelected("__free__")}
                                className="accent-primary"
                            />
                            <span className="text-sm">Custom answer</span>
                        </label>
                    )}
                    {selected === "__free__" && (
                        <div className="grid gap-2 pl-6">
                            <Label htmlFor="free-response">Your answer</Label>
                            <Input
                                id="free-response"
                                value={freeText}
                                onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                ) => setFreeText(e.target.value)}
                                onKeyDown={(
                                    e: React.KeyboardEvent<HTMLInputElement>,
                                ) => {
                                    if (e.key === "Enter") handleSubmit();
                                }}
                            />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        onClick={handleSubmit}
                        disabled={
                            !selected ||
                            (selected === "__free__" && !freeText.trim())
                        }
                    >
                        Submit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
