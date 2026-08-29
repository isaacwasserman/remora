import { ChevronDown, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
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
import { startOpenRouterOAuth } from "../lib/openrouter-oauth.ts";
import {
    clearOpenRouterConfig,
    DEFAULT_OPENROUTER_MODEL,
    loadOpenRouterConfig,
    type OpenRouterConfig,
    saveOpenRouterConfig,
} from "../lib/storage.ts";

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
    const [config, setConfig] = useState<OpenRouterConfig | null>(null);
    const [modelId, setModelId] = useState(DEFAULT_OPENROUTER_MODEL);
    const [manualKey, setManualKey] = useState("");
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        if (open) {
            loadOpenRouterConfig().then((c) => {
                setConfig(c);
                if (c?.modelId) setModelId(c.modelId);
            });
        }
    }, [open]);

    const saveConfig = async (
        apiKey: string,
        connectionMethod: "oauth" | "api-key",
    ) => {
        const next = {
            apiKey,
            modelId: modelId.trim() || DEFAULT_OPENROUTER_MODEL,
            connectionMethod,
        };
        await saveOpenRouterConfig(next);
        setConfig(next);
        onSaved();
    };

    const handleConnect = async () => {
        setConnecting(true);
        try {
            if (config?.apiKey) {
                await saveConfig(config.apiKey, config.connectionMethod);
            }
            await startOpenRouterOAuth(
                modelId.trim() || DEFAULT_OPENROUTER_MODEL,
            );
        } finally {
            setConnecting(false);
        }
    };

    const handleSaveManualKey = () => {
        if (!manualKey.trim()) return;
        void saveConfig(manualKey.trim(), "api-key");
        setManualKey("");
        setShowManualEntry(false);
    };

    const handleDisconnect = () => {
        clearOpenRouterConfig();
        setConfig(null);
        setManualKey("");
        onSaved();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>OpenRouter</DialogTitle>
                    <DialogDescription>
                        Connect an OpenRouter account to generate and run
                        workflows.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="model-id">Model ID</Label>
                        <Input
                            id="model-id"
                            value={modelId}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                            ) => setModelId(e.target.value)}
                        />
                    </div>
                    {config?.apiKey ? (
                        <div className="rounded-md border p-3 text-sm">
                            Connected via{" "}
                            {config.connectionMethod === "oauth"
                                ? "OpenRouter"
                                : "API key"}
                        </div>
                    ) : null}
                    <Button
                        onClick={() => void handleConnect()}
                        disabled={connecting}
                    >
                        {connecting && (
                            <Loader2 className="size-4 animate-spin" />
                        )}
                        {config?.connectionMethod === "oauth"
                            ? "Reconnect OpenRouter"
                            : "Connect OpenRouter"}
                    </Button>
                    <button
                        type="button"
                        className="flex items-center gap-1 text-left text-sm text-muted-foreground"
                        onClick={() =>
                            setShowManualEntry((visible) => !visible)
                        }
                    >
                        <ChevronDown
                            className={`size-4 transition-transform ${showManualEntry ? "rotate-180" : ""}`}
                        />
                        Use an API key instead
                    </button>
                    {showManualEntry ? (
                        <div className="grid gap-2">
                            <Label htmlFor="api-key">OpenRouter API key</Label>
                            <Input
                                id="api-key"
                                type="password"
                                value={manualKey}
                                onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                ) => setManualKey(e.target.value)}
                            />
                            <Button
                                variant="outline"
                                onClick={handleSaveManualKey}
                                disabled={!manualKey.trim()}
                            >
                                Save API key
                            </Button>
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    {config?.apiKey ? (
                        <Button variant="outline" onClick={handleDisconnect}>
                            Disconnect
                        </Button>
                    ) : null}
                    <Button
                        onClick={() => {
                            if (config?.apiKey) {
                                void saveConfig(
                                    config.apiKey,
                                    config.connectionMethod,
                                );
                            }
                            onOpenChange(false);
                        }}
                    >
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
