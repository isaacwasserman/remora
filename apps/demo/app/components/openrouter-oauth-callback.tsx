import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
    exchangeOpenRouterOAuthCode,
    pendingOpenRouterOAuthModelId,
    startOpenRouterOAuth,
} from "../lib/openrouter-oauth.ts";
import {
    DEFAULT_OPENROUTER_MODEL,
    loadOpenRouterConfig,
    saveOpenRouterConfig,
} from "../lib/storage.ts";

interface OpenRouterOAuthCallbackProps {
    onConnected: () => void;
}

export function OpenRouterOAuthCallback({
    onConnected,
}: OpenRouterOAuthCallbackProps) {
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        pendingOpenRouterOAuthModelId()
            .then((modelId) =>
                exchangeOpenRouterOAuthCode().then((apiKey) => ({
                    apiKey,
                    modelId,
                })),
            )
            .then(async ({ apiKey, modelId }) => {
                const config = await loadOpenRouterConfig();
                await saveOpenRouterConfig({
                    apiKey,
                    modelId:
                        modelId ?? config?.modelId ?? DEFAULT_OPENROUTER_MODEL,
                    connectionMethod: "oauth",
                });
                onConnected();
            })
            .catch((error: unknown) => {
                setError(
                    error instanceof Error
                        ? error.message
                        : "OpenRouter connection failed.",
                );
            });
    }, [onConnected]);

    return (
        <main className="min-h-screen grid place-items-center p-6">
            <div className="w-full max-w-sm text-center space-y-4">
                {error ? (
                    <>
                        <h1 className="text-xl font-semibold">
                            Couldn&apos;t connect OpenRouter
                        </h1>
                        <p className="text-sm text-muted-foreground">{error}</p>
                        <Button
                            onClick={() =>
                                void startOpenRouterOAuth(
                                    DEFAULT_OPENROUTER_MODEL,
                                )
                            }
                        >
                            Try again
                        </Button>
                    </>
                ) : (
                    <>
                        <Loader2 className="mx-auto size-6 animate-spin" />
                        <p className="text-sm text-muted-foreground">
                            Connecting your OpenRouter account…
                        </p>
                    </>
                )}
            </div>
        </main>
    );
}
