const SALT = new TextEncoder().encode("remoraflow-demo-storage-v1");

let cachedKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey> {
    if (cachedKey) return cachedKey;
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(window.location.origin),
        "PBKDF2",
        false,
        ["deriveKey"],
    );
    cachedKey = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
    return cachedKey;
}

export async function encryptSecret(plaintext: string): Promise<string> {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode(plaintext),
        ),
    );
    const packed = new Uint8Array(iv.length + ct.length);
    packed.set(iv);
    packed.set(ct, iv.length);
    return btoa(String.fromCharCode(...packed));
}

export async function decryptSecret(encoded: string): Promise<string> {
    const key = await getEncryptionKey();
    const packed = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const iv = packed.slice(0, 12);
    const ct = packed.slice(12);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ct,
    );
    return new TextDecoder().decode(plaintext);
}
