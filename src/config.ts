import { getStorage, type ConfigData } from "./storage";
import type { Config, Credential, KeyConfig } from "./types";

// Default base URLs based on key type
function getDefaultBaseUrl(key: string | Credential): string {
    if (typeof key === "string") {
        return "https://generativelanguage.googleapis.com/";
    } else {
        return "https://aiplatform.googleapis.com/";
    }
}

// Parse API keys from storage
export async function parseConfig(env: CloudflareBindings): Promise<Config> {
    const storage = getStorage(env);
    const data = await storage.get();

    // Fallback to env if storage is empty and type is not env
    if (
        storage.type !== "env" &&
        data.keys.length === 0 &&
        env.GEMINI_API_KEY
    ) {
        const envStorage = getStorage({
            ...env,
            KV_STORAGE: undefined,
            D1_STORAGE: undefined,
        });
        const envData = await envStorage.get();
        data.keys = envData.keys;
        data.baseUrls = envData.baseUrls;
    }

    const keys: KeyConfig[] = [];

    for (let i = 0; i < data.keys.length; i++) {
        const part = data.keys[i];
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
        const baseUrl = data.baseUrls[i] || getDefaultBaseUrl(key);

        keys.push({ key, baseUrl });
    }

    return { keys };
}

export async function updateConfig(
    env: CloudflareBindings,
    data: ConfigData,
): Promise<void> {
    const storage = getStorage(env);
    await storage.set(data);
}
