import { Hono } from "hono";
import { cors } from "hono/cors";
import { parseConfig } from "./config";
import type { Credential } from "./types";
import { hashKey, validateClientKey } from "./utils";
import { getAccessToken, rewritePathForVertexAI } from "./vertexai";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Enable CORS for all routes
app.use("/*", cors());

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
