import type { Config, Credential, KeyConfig } from "./types";

// Default base URLs based on key type
function getDefaultBaseUrl(key: string | Credential): string {
    if (typeof key === "string") {
        return "https://generativelanguage.googleapis.com/";
    } else {
        return "https://aiplatform.googleapis.com/";
    }
}

// Parse API keys from environment variable
export async function parseConfig(env: CloudflareBindings): Promise<Config> {
    const keysStr = env.GEMINI_API_KEY || "";
    const baseUrlsStr = env.GEMINI_API_BASE_URL || "";

    const keyParts = keysStr
        .split(";")
        .map((k: string) => k.trim())
        .filter(Boolean);
    const baseUrlParts = baseUrlsStr
        .split(";")
        .map((u: string) => u.trim())
        .filter(Boolean);

    const keys: KeyConfig[] = [];

    for (let i = 0; i < keyParts.length; i++) {
        const part = keyParts[i];
        let key: string | Credential;

        try {
            // Try to parse as JSON (service account credential)
            const parsed = JSON.parse(part);
            if (parsed.type === "service_account") {
                key = parsed as Credential;
            } else {
                key = part;
            }
        } catch {
            // Treat as regular API key string
            key = part;
        }

        // Use corresponding base URL or default
        const baseUrl = baseUrlParts[i] || getDefaultBaseUrl(key);

        keys.push({ key, baseUrl });
    }

    return { keys };
}
