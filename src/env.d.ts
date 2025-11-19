import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

declare global {
    interface CloudflareBindings {
        KV_STORAGE?: KVNamespace;
        D1_STORAGE?: D1Database;
    }
}
