import type { ConfigData, Storage } from "./types";

const CONFIG_KEY = "config";

export class KVStorage implements Storage {
    type = "kv" as const;
    readonly = false;
    private kv: KVNamespace;

    constructor(kv: KVNamespace) {
        this.kv = kv;
    }

    async get(): Promise<ConfigData> {
        const data = await this.kv.get<ConfigData>(CONFIG_KEY, "json");
        if (!data) {
            return { keys: [], baseUrls: [] };
        }
        return data;
    }

    async set(data: ConfigData): Promise<void> {
        await this.kv.put(CONFIG_KEY, JSON.stringify(data));
    }
}
