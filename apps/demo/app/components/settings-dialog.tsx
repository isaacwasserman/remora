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
import type { LLMConfig } from "../lib/storage.ts";
import { loadLLMConfig, saveLLMConfig } from "../lib/storage.ts";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

export function SettingsDialog({
    open,
    onOpenChange,
    onSaved,
}: SettingsDialogProps) {
    const [config, setConfig] = useState<LLMConfig>(() => {
        const saved = loadLLMConfig();
        return saved ?? { apiKey: "", modelId: "", baseURL: "" };
    });

    const handleSave = () => {
        saveLLMConfig(config);
        onSaved();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>LLM Settings</DialogTitle>
                    <DialogDescription>
                        Configure the LLM provider for generation and analysis
                        steps.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="api-key">API Key</Label>
                        <Input
                            id="api-key"
                            type="password"
                            value={config.apiKey}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                                setConfig((c) => ({
                                    ...c,
                                    apiKey: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="model-id">Model ID</Label>
                        <Input
                            id="model-id"
                            placeholder="gpt-4o"
                            value={config.modelId}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                                setConfig((c) => ({
                                    ...c,
                                    modelId: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="base-url">Base URL (optional)</Label>
                        <Input
                            id="base-url"
                            placeholder="https://api.openai.com/v1"
                            value={config.baseURL ?? ""}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                                setConfig((c) => ({
                                    ...c,
                                    baseURL: e.target.value || undefined,
                                }))
                            }
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
