import type { ConfigData, Storage } from "./types";

const TABLE_NAME = "config";

export class D1Storage implements Storage {
    type = "d1" as const;
    readonly = false;
    private db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    async init(): Promise<void> {
        await this.db
            .prepare(
                `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    data TEXT NOT NULL
                )`,
            )
            .run();
    }

    async get(): Promise<ConfigData> {
        await this.init();
        const result = await this.db
            .prepare(`SELECT data FROM ${TABLE_NAME} WHERE id = 1`)
            .first<{ data: string }>();

        if (!result) {
            return { keys: [], baseUrls: [] };
        }

        return JSON.parse(result.data);
    }

    async set(data: ConfigData): Promise<void> {
        await this.init();
        await this.db
            .prepare(
                `INSERT INTO ${TABLE_NAME} (id, data) VALUES (1, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
            )
            .bind(JSON.stringify(data))
            .run();
    }
}
