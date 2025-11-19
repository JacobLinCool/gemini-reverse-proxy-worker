import { Hono } from "hono";
import { cors } from "hono/cors";
import { parseConfig, updateConfig } from "./config";
import { getStorage } from "./storage";
import type { Credential } from "./types";
import { hashKey, validateClientKey } from "./utils";
import { getAccessToken, rewritePathForVertexAI } from "./vertexai";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Enable CORS for all routes
app.use("/*", cors());

// Update configuration
app.post("/_config", async (c) => {
    const secret = c.env.CLIENT_KEY_VALIDATION_SECRET;
    if (!secret) {
        return c.json({ error: "Update not allowed" }, 403);
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const storage = getStorage(c.env);
    if (storage.readonly) {
        return c.json({ error: "Storage is read-only" }, 403);
    }

    try {
        const data = await c.req.json();
        await updateConfig(c.env, data);
        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: (error as Error).message }, 500);
    }
});

// Get configuration
app.get("/_config", async (c) => {
    const secret = c.env.CLIENT_KEY_VALIDATION_SECRET;
    if (!secret) {
        return c.json({ error: "Read not allowed" }, 403);
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    try {
        const config = await parseConfig(c.env);
        const storage = getStorage(c.env);

        // Convert Config to ConfigData format for response
        const keys = config.keys.map((k) =>
            typeof k.key === "string" ? k.key : JSON.stringify(k.key),
        );
        const baseUrls = config.keys.map((k) => k.baseUrl);
        return c.json({ keys, baseUrls, readonly: storage.readonly });
    } catch (error) {
        return c.json({ error: (error as Error).message }, 500);
    }
});

// Get authorization header for a key
async function getAuthHeader(
    key: string | Credential,
): Promise<[key: string, value: string]> {
    if (typeof key === "string") {
        return ["x-goog-api-key", key];
    } else {
        const token = await getAccessToken(key);
        return ["authorization", `Bearer ${token}`];
    }
}

// Proxy all requests to Gemini API
app.all("/*", async (c) => {
    const config = await parseConfig(c.env);

    if (config.keys.length === 0) {
        return c.json({ error: "No API keys configured" }, 500);
    }

    let path = c.req.path;
    const url = new URL(c.req.url);
    const headers = new Headers(c.req.raw.headers);
    const clientKey = headers.get("x-goog-api-key");
    if (!clientKey) {
        return c.json({ error: "Missing API key" }, 400);
    }

    if (c.env.CLIENT_KEY_VALIDATION_SECRET) {
        const isValid = await validateClientKey(
            clientKey,
            c.env.CLIENT_KEY_VALIDATION_SECRET,
        );
        if (!isValid) {
            return c.json({ error: "Invalid API key" }, 403);
        }
    }

    // Try each key until one succeeds
    let lastError: Error | null = null;

    const keyConfigs = config.keys.sort(() => Math.random() - 0.5); // Shuffle keys
    for (const keyConfig of keyConfigs) {
        try {
            // Build target URL with this key's base URL
            if (typeof keyConfig.key === "object") {
                path = rewritePathForVertexAI(
                    path,
                    keyConfig.key.project_id,
                    "global",
                );
            }
            const targetUrl = new URL("." + path, keyConfig.baseUrl);
            targetUrl.search = url.search;

            const authHeader = await getAuthHeader(keyConfig.key);

            // Forward the request
            headers.delete("host");
            headers.delete("x-goog-api-key");
            headers.set(
                "cf-aig-metadata",
                JSON.stringify({
                    clientKey,
                    serverKeyHash: await hashKey(keyConfig.key),
                }),
            );
            headers.set(authHeader[0], authHeader[1]);

            const response = await fetch(targetUrl.toString(), {
                method: c.req.method,
                headers,
                body:
                    c.req.method !== "GET" && c.req.method !== "HEAD"
                        ? c.req.raw.body
                        : undefined,
            });

            // If successful, return the response
            if (response.ok || response.status < 500) {
                // Return response with same headers
                const responseHeaders = new Headers(response.headers);
                responseHeaders.set("Access-Control-Allow-Origin", "*");

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders,
                });
            }

            lastError = new Error(
                `HTTP ${response.status}: ${response.statusText}`,
            );
        } catch (error) {
            lastError = error as Error;
            continue;
        }
    }

    return c.json(
        {
            error: "All API keys failed",
            message: lastError?.message || "Unknown error",
        },
        500,
    );
});

export default app;
