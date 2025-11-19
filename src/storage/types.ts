export interface ConfigData {
    keys: string[];
    baseUrls: string[];
}

export interface Storage {
    get(): Promise<ConfigData>;
    set(data: ConfigData): Promise<void>;
    type: "env" | "kv" | "d1";
    readonly: boolean;
}
