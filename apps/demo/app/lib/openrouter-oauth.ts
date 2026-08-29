import { decryptSecret, encryptSecret } from "./crypto.ts";

const PKCE_VERIFIER_KEY = "remoraflow-demo:openrouter-pkce-verifier";
const PKCE_MODEL_ID_KEY = "remoraflow-demo:openrouter-pkce-model-id";

function base64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

function callbackURL(): string {
    return new URL(
        `${import.meta.env.BASE_URL}auth/openrouter/callback`,
        window.location.origin,
    ).toString();
}

function createVerifier(): string {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
}

async function createChallenge(verifier: string): Promise<string> {
    const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return base64Url(new Uint8Array(hash));
}

export function isOpenRouterOAuthCallback(): boolean {
    const callbackPath = new URL(callbackURL()).pathname;
    return window.location.pathname === callbackPath;
}

export async function startOpenRouterOAuth(modelId: string): Promise<void> {
    const verifier = createVerifier();
    const challenge = await createChallenge(verifier);
    sessionStorage.setItem(PKCE_VERIFIER_KEY, await encryptSecret(verifier));
    sessionStorage.setItem(PKCE_MODEL_ID_KEY, await encryptSecret(modelId));

    const authorizeURL = new URL("https://openrouter.ai/auth");
    authorizeURL.searchParams.set("callback_url", callbackURL());
    authorizeURL.searchParams.set("code_challenge", challenge);
    authorizeURL.searchParams.set("code_challenge_method", "S256");
    window.location.assign(authorizeURL.toString());
}

export async function exchangeOpenRouterOAuthCode(): Promise<string> {
    const code = new URLSearchParams(window.location.search).get("code");
    const encryptedVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    if (!code || !encryptedVerifier) {
        throw new Error("Missing OpenRouter authorization details.");
    }
    const verifier = await decryptSecret(encryptedVerifier);

    const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            code,
            code_verifier: verifier,
            code_challenge_method: "S256",
        }),
    });
    const data = (await response.json()) as { key?: unknown; error?: unknown };
    if (!response.ok || typeof data.key !== "string") {
        const message =
            typeof data.error === "string"
                ? data.error
                : "OpenRouter could not complete the connection.";
        throw new Error(message);
    }

    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    return data.key;
}

export async function pendingOpenRouterOAuthModelId(): Promise<string | null> {
    const encrypted = sessionStorage.getItem(PKCE_MODEL_ID_KEY);
    sessionStorage.removeItem(PKCE_MODEL_ID_KEY);
    if (!encrypted) return null;
    return decryptSecret(encrypted);
}
