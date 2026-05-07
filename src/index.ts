import { Hono } from "hono";
import { cors } from "hono/cors";
import { parseConfig } from "./config";
import type { Credential } from "./types";
import { getAccessToken, rewritePathForVertexAI } from "./vertexai";

const app = new Hono<{ Bindings: { KV_STORAGE: KVNamespace, CLIENT_KEY_VALIDATION_SECRET: string } }>();
app.use("/*", cors());

function transformPayload(openAiBody: any, modelName: string) {
    const isClaude = modelName.toLowerCase().includes("claude");
    
    const safeMessages = openAiBody.messages || [];

    if (isClaude) {
        const system = safeMessages.find((m: any) => m.role === "system")?.content;
        const messages = safeMessages.filter((m: any) => m.role !== "system").map((m: any) => {
            let content = Array.isArray(m.content) ? m.content.map((item: any) => {
                if (item.type === "text") return { type: "text", text: item.text };
                if (item.type === "image_url") return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: item.image_url.url.split(",")[1] } };
            }).filter(Boolean) : m.content;
            return { role: m.role === "assistant" ? "assistant" : "user", content };
        });
        return { anthropic_version: "vertex-2023-10-16", messages, system, max_tokens: openAiBody.max_tokens ?? 4096 };
    } else {
        // --- Gemini history ---
        let rawContents = safeMessages.filter((m: any) => m.role !== "system").map((m: any) => {
            
            // A:tool utils
            if (m.role === "tool" || m.role === "function") {
                return {
                    role: "user",
                    parts: [{ text: `[System: Tool '${m.name || 'unknown'}' returned: ${m.content}]` }]
                };
            }

            // B: tools pass thought_signature
            if (m.role === "assistant" && m.tool_calls) {
                let parts: any[] = [];
                if (m.content) parts.push({ text: m.content });
                const calls = m.tool_calls.map((tc: any) => `[Called Tool: ${tc.function.name}, Args: ${tc.function.arguments}]`);
                parts.push({ text: calls.join('\n') });
                return { role: "model", parts: parts };
            }

            // C: remain
            let parts = Array.isArray(m.content) ? m.content.map((item: any) => {
                if (item.type === "text") return { text: item.text };
                if (item.type === "image_url") return { inlineData: { mimeType: "image/jpeg", data: item.image_url.url.split(",")[1] } };
            }).filter(Boolean) : [{ text: m.content || " " }];
            return { role: m.role === "assistant" ? "model" : "user", parts };
        });

        // Resolve Google API errors caused by consecutive identical characters, forcibly merge adjacent User or Model
        const contents: any[] = [];
        for (const item of rawContents) {
            if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
                contents[contents.length - 1].parts.push(...item.parts);
            } else {
                contents.push(item);
            }
        }

        // prevents everything from being filtered out and turning into empty packages
        if (contents.length === 0) contents.push({ role: "user", parts: [{ text: " " }] });

        const systemMsg = safeMessages.find((m: any) => m.role === "system")?.content;

        // Vertex AI standard security prefix,prevent 400 INVALID_ARGUMENT
        const safetySettings = [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        const payload: any = {
            contents,
            safetySettings,
            generationConfig: {
                temperature: openAiBody.temperature ?? 0.7,
                maxOutputTokens: openAiBody.max_tokens ?? 65536,
                topP: openAiBody.top_p ?? 1,
                topK: openAiBody.top_k ?? 1
            }
        };

        if (systemMsg) payload.system_instruction = { parts: [{ text: systemMsg }] };
        
        // clear $schema
        if (openAiBody.tools) {
            payload.tools = [{
                function_declarations: openAiBody.tools.map((t: any) => {
                    let fn = t.function;
                    if (fn && fn.parameters && fn.parameters.$schema) {
                        delete fn.parameters.$schema;
                    }
                    return fn;
                })
            }];
        }

        return payload;
    }
}

// 2. Multidimensional Analysis and Robustness Defense
async function transformResponse(response: Response, modelName: string) {
    const buffer = await response.arrayBuffer();
    const rawText = new TextDecoder("utf-8").decode(buffer);

    let json: any;
    try { json = JSON.parse(rawText); } catch (e) { return { error: "JSON_PARSE_ERROR", raw: rawText }; }

    // Extract and echo Google's underlying interception and error reporting
    if (json.error || (!json.candidates && json.promptFeedback?.blockReason)) {
        const reason = json.error?.message || json.promptFeedback?.blockReason || "Request Blocked by Google";
        return {
            choices: [{ index: 0, message: { role: "assistant", content: `🚨 [Google Error]: ${reason}` }, finish_reason: "error" }]
        };
    }

    const isClaude = modelName.toLowerCase().includes("claude");
    let text = "";
    let tool_calls: any[] | undefined = undefined;
    let finish_reason = "stop";

    if (isClaude) {
        text = json.content?.[0]?.text || "";
    } else {
        const candidate = json.candidates?.[0];
        finish_reason = candidate?.finishReason || "stop";
        if (candidate?.content?.parts) {
            candidate.content.parts.forEach((p: any) => {
                if (p.text) text += p.text;
                //  Translate to OpenAI
                if (p.functionCall) {
                    if (!tool_calls) tool_calls = [];
                    tool_calls.push({ id: `call_${crypto.randomUUID().split('-')[0]}`, type: "function", function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) } });
                }
            });
        }
    }

    return {
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{ index: 0, message: { role: "assistant", content: text || (tool_calls ? "" : " "), tool_calls }, finish_reason: tool_calls ? "tool_calls" : finish_reason }],
        usage: {
            prompt_tokens: json.usageMetadata?.promptTokenCount || 0,
            completion_tokens: json.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: (json.usageMetadata?.promptTokenCount || 0) + (json.usageMetadata?.candidatesTokenCount || 0)
        }
    };
}

// Core Logic of the Routing Gateway
app.all("/*", async (c) => {
    try {
        const config = await parseConfig(c.env);
        const clientKey = c.req.header("x-goog-api-key") || c.req.header("authorization")?.replace("Bearer ", "");

        let isStream = false;
        let requestModel = "gemini-3.1-flash-lite-preview";
        let body: any = null;

        if (c.req.method !== "GET" && c.req.method !== "HEAD") {
            const rawBody = await c.req.json();
            isStream = rawBody.stream === true;
            rawBody.stream = false; 
            requestModel = rawBody.model || requestModel;
            body = transformPayload(rawBody, requestModel);
        }

        const keyConfig = config.keys[Math.floor(Math.random() * config.keys.length)];
        const targetPath = typeof keyConfig.key === "object" ? rewritePathForVertexAI(c.req.path, keyConfig.key.project_id, requestModel) : c.req.path;
        const targetUrl = new URL("." + targetPath, keyConfig.baseUrl);
        const auth = typeof keyConfig.key === "object" ? ["authorization", `Bearer ${await getAccessToken(keyConfig.key)}`] : ["x-goog-api-key", keyConfig.key];

        // inject User-Agent reduce sensitivity of the WAF
        const response = await fetch(targetUrl.toString(), {
            method: c.req.method,
            headers: {
                "Content-Type": "application/json",
                [auth[0]]: auth[1],
                "host": targetUrl.host,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errResult = await transformResponse(response, requestModel);
            return c.json(errResult, response.status);
        }

        const result = await transformResponse(response, requestModel);

        if (isStream) {
            const chunk = { id: result.id, object: "chat.completion.chunk", created: result.created, model: result.model, choices: [{ index: 0, delta: result.choices[0].message, finish_reason: null }] };
            return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream; charset=UTF-8", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
        }

        return c.json(result, 200, { "Content-Type": "application/json; charset=UTF-8" });

    } catch (e: any) {
        return c.json({ error: "Worker_Crash", message: e.message }, 500);
    }
});

export default app;