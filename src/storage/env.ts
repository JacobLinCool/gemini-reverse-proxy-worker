import type { ConfigData, Storage } from "./types";

export class EnvStorage implements Storage {
    type = "env" as const;
    readonly = true;
    private env: CloudflareBindings;

    constructor(env: CloudflareBindings) {
        this.env = env;
    }

    async get(): Promise<ConfigData> {
        const keysStr = this.env.GEMINI_API_KEY || "";
        const baseUrlsStr = this.env.GEMINI_API_BASE_URL || "";

        const keys = keysStr
            .split(";")
            .map((k) => k.trim())
            .filter(Boolean);
        const baseUrls = baseUrlsStr
            .split(";")
            .map((u) => u.trim())
            .filter(Boolean);

        return { keys, baseUrls };
    }

    async set(_data: ConfigData): Promise<void> {
        throw new Error("Environment variables are read-only");
    }
}
