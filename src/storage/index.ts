import { D1Storage } from "./d1";
import { EnvStorage } from "./env";
import { KVStorage } from "./kv";
import type { Storage } from "./types";

export * from "./types";

export function getStorage(env: CloudflareBindings): Storage {
    if (env.KV_STORAGE) {
        return new KVStorage(env.KV_STORAGE);
    }
    if (env.D1_STORAGE) {
        return new D1Storage(env.D1_STORAGE);
    }
    return new EnvStorage(env);
}
