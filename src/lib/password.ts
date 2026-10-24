const HASH_ITERATIONS = 100000;

export async function hashPassword(password: string): Promise<string> {
    const saltBytes = crypto.getRandomValues(new Uint8Array(32));
    const salt = Array.from(saltBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );

    const hashBuffer = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: new TextEncoder().encode(salt),
            iterations: HASH_ITERATIONS,
            hash: "SHA-256",
        },
        keyMaterial,
        512,
    );

    const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `${salt}:${hash}`;
}

export async function verifyPassword(
    password: string,
    storedHash: string,
): Promise<boolean> {
    try {
        const [salt, expectedHash] = storedHash.split(":");

        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveBits"],
        );

        const hashBuffer = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: new TextEncoder().encode(salt),
                iterations: HASH_ITERATIONS,
                hash: "SHA-256",
            },
            keyMaterial,
            512,
        );

        const computedHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        return computedHash === expectedHash;
    } catch (error) {
        console.error("[Password] Verification failed:", error);
        return false;
    }
}
