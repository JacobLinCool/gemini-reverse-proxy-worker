import type { Credential } from "./types";

export function rewritePathForVertexAI(
    path: string,
    projectId: string,
    location = "global",
): string {
    const segments = path.split("/").filter(Boolean);

    const modelIndex = segments.findIndex((segment) => segment === "models");
    if (modelIndex === -1 || modelIndex + 1 >= segments.length) {
        throw new Error("Invalid Gemini API path");
    }

    const newPath =
        `/v1/projects/${projectId}/locations/${location}/publishers/google/` +
        segments.slice(modelIndex).join("/");
    return newPath;
}

// Get access token for service account
export async function getAccessToken(credential: Credential): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600;

    const header = {
        alg: "RS256",
        typ: "JWT",
    };

    const payload = {
        iss: credential.client_email,
        scope: "https://www.googleapis.com/auth/generative-language.retriever https://www.googleapis.com/auth/cloud-platform",
        aud: credential.token_uri,
        exp: expiry,
        iat: now,
    };

    const encodedHeader = btoa(JSON.stringify(header))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const encodedPayload = btoa(JSON.stringify(payload))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Import private key
    const privateKey = credential.private_key;
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = privateKey
        .substring(pemHeader.length, privateKey.length - pemFooter.length - 1)
        .replace(/\s/g, "");

    const binaryDer = Uint8Array.from(atob(pemContents), (c) =>
        c.charCodeAt(0),
    );

    const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
        },
        false,
        ["sign"],
    );

    // Sign the JWT
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        new TextEncoder().encode(signatureInput),
    );

    const encodedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signature)),
    )
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const jwt = `${signatureInput}.${encodedSignature}`;

    // Exchange JWT for access token
    const response = await fetch(credential.token_uri, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
}
