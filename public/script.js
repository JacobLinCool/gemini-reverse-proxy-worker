// Set the current hostname as the base URL
const baseUrl = window.location.origin + "/";

// Update code example with current hostname
const codeExample = document.getElementById("codeExample");
const rawTemplate = codeExample.textContent;
// Replace the placeholder base URL in the template and keep the template for later updates
const templateWithBase = rawTemplate.replace(
    '"https://your-worker.workers.dev/"',
    `"${baseUrl}"`,
);
codeExample.textContent = templateWithBase;

let lastGeneratedJwt = null;

// Signing UI
const genBtn = document.getElementById("generate");
const secretEl = document.getElementById("secret");
const startDatetimeEl = document.getElementById("startDatetime");
const endDatetimeEl = document.getElementById("endDatetime");
const noteEl = document.getElementById("note");
const copyBtn = document.getElementById("copyJwt");
const signedResult = document.getElementById("signedResult");
const signedCode = document.getElementById("signedCode");
const testBtn = document.getElementById("testRequest");
const testResult = document.getElementById("testResult");
const testOutput = document.getElementById("testOutput");

// Set sensible defaults for datetime inputs: now and +1 hour
function toDatetimeLocalValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

try {
    if (startDatetimeEl && !startDatetimeEl.value) {
        startDatetimeEl.value = toDatetimeLocalValue(new Date());
    }
    if (endDatetimeEl && !endDatetimeEl.value) {
        const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
        endDatetimeEl.value = toDatetimeLocalValue(oneHourLater);
    }
} catch (e) {
    // If anything fails here, silently continue — inputs are optional.
    // This keeps the generator functional in older browsers.
}

// base64url encode for strings or ArrayBuffers
function base64UrlEncode(input) {
    if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
        const bytes = new Uint8Array(input);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; ++i) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    } else {
        const utf8 = new TextEncoder().encode(String(input));
        return base64UrlEncode(utf8);
    }
}

// HMAC-SHA256 signing using Web Crypto
async function hmacSha256(message, secret) {
    const enc = new TextEncoder();
    const keyData = enc.encode(secret);
    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return base64UrlEncode(sig);
}

genBtn.addEventListener("click", async () => {
    const providedSecret =
        secretEl && secretEl.value ? secretEl.value : undefined;
    if (!providedSecret) {
        signedResult.style.display = "block";
        signedCode.textContent = "Error: missing secret";
        return;
    }

    const startVal =
        startDatetimeEl && startDatetimeEl.value ? startDatetimeEl.value : null;
    const endVal =
        endDatetimeEl && endDatetimeEl.value ? endDatetimeEl.value : null;
    if (!startVal || !endVal) {
        signedResult.style.display = "block";
        signedCode.textContent =
            "Error: please provide start and end datetimes";
        return;
    }

    const nbf = Math.floor(new Date(startVal).getTime() / 1000);
    const exp = Math.floor(new Date(endVal).getTime() / 1000);
    if (!(exp > nbf)) {
        signedResult.style.display = "block";
        signedCode.textContent = "Error: end time must be after start time";
        return;
    }

    try {
        const header = { alg: "HS256", typ: "JWT" };
        const providedNote = noteEl && noteEl.value ? noteEl.value : "";

        let allowedEndpoints = [".*"];
        const allowedEndpointsEl = document.getElementById("allowedEndpoints");
        if (allowedEndpointsEl && allowedEndpointsEl.value) {
            try {
                const parsed = JSON.parse(allowedEndpointsEl.value);
                if (Array.isArray(parsed)) {
                    allowedEndpoints = parsed;
                } else {
                    throw new Error("Allowed endpoints must be a JSON array");
                }
            } catch (e) {
                signedResult.style.display = "block";
                signedCode.textContent =
                    "Error parsing allowed endpoints: " + e.message;
                return;
            }
        }

        const payload = {
            nbf,
            exp,
            note: providedNote,
            allowed_endpoints: allowedEndpoints,
        };

        const unsigned =
            base64UrlEncode(JSON.stringify(header)) +
            "." +
            base64UrlEncode(JSON.stringify(payload));
        const signature = await hmacSha256(unsigned, providedSecret);
        const jwt = unsigned + "." + signature;

        lastGeneratedJwt = jwt;

        // show generated token
        signedResult.style.display = "block";
        signedCode.textContent = jwt;

        // show copy button
        if (copyBtn) copyBtn.style.display = "inline-block";

        // update example code by replacing the API key placeholder
        if (codeExample) {
            const updated = templateWithBase.replace(
                'apiKey: "YOUR_API_KEY_HERE",',
                `apiKey: "${jwt}",`,
            );
            codeExample.textContent = updated;
        }
    } catch (e) {
        signedResult.style.display = "block";
        signedCode.textContent =
            "Signing failed: " + (e && e.message ? e.message : e);
    }
});

// Copy JWT to clipboard
if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
        if (!lastGeneratedJwt) return;
        try {
            await navigator.clipboard.writeText(lastGeneratedJwt);
            copyBtn.textContent = "Copied";
            setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
        } catch (e) {
            copyBtn.textContent = "Copy failed";
            setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
        }
    });
}

// Run test request from the browser and show curl snippet
if (testBtn) {
    testBtn.addEventListener("click", async () => {
        testResult.style.display = "none";
        testOutput.textContent = "";
        if (!lastGeneratedJwt) {
            testResult.style.display = "block";
            testOutput.textContent = "Error: generate a token first";
            return;
        }

        const endpoint = `${baseUrl}v1beta/models/gemini-2.0-flash:generateContent`;
        const body = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: "Who are you?" }],
                },
            ],
        };

        try {
            const resp = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "x-goog-api-key": lastGeneratedJwt,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            let text;
            try {
                text = await resp.text();
                // try to pretty-print JSON when possible
                try {
                    const json = JSON.parse(text);
                    text = JSON.stringify(json, null, 2);
                } catch (e) {
                    // not JSON, keep raw text
                }
            } catch (e) {
                text = `Error reading response: ${e && e.message ? e.message : e}`;
            }

            testResult.style.display = "block";
            testOutput.textContent = `HTTP ${resp.status} ${resp.statusText}\n\n${text}`;
        } catch (err) {
            testResult.style.display = "block";
            testOutput.textContent = `Request failed: ${err && err.message ? err.message : err}`;
        }
    });
}
