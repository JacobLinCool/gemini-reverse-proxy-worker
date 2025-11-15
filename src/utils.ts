import { Credential } from "./types";

export async function hashKey(key: string | Credential): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
            typeof key === "string" ? key : JSON.stringify(key),
        ),
    );
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function validateClientKey(
    key: string,
    secret: string,
): Promise<boolean> {
    const parts = key.split(".");
    if (parts.length !== 3) {
        return false;
    }

    let [headerB64, payloadB64, signatureB64] = parts;

    // validate date
    const toBase64 = (b64url: string) => {
        let b = b64url.replace(/-/g, "+").replace(/_/g, "/");
        while (b.length % 4 !== 0) b += "=";
        return b;
    };
    const payloadJson = atob(toBase64(payloadB64));
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    if (
        !payload.exp ||
        !payload.nbf ||
        now > payload.exp ||
        now < payload.nbf
    ) {
        return false;
    }

    // validate signature
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(atob(toBase64(signatureB64)), (c) =>
        c.charCodeAt(0),
    );

    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
    );

    const isValid = await crypto.subtle.verify(
        "HMAC",
        cryptoKey,
        signature,
        data,
    );

    return isValid;
}
