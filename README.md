# Gemini Reverse Proxy Worker

<img src="public/favicon.svg" alt="Gemini Reverse Proxy Worker Icon" width="100" height="100" align="right" />

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Cloudflare Worker that acts as a reverse proxy for the Google Gemini API, supporting both API keys (Google AI Studio) and service account (Vertex AI) authentication.
This simplifies API access with load balancing, JWT validation, and seamless integration with Cloudflare AI Gateway.

## Table of Contents

- [Gemini Reverse Proxy Worker](#gemini-reverse-proxy-worker)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [GEMINI\_API\_KEY](#gemini_api_key)
    - [GEMINI\_API\_BASE\_URL (Optional)](#gemini_api_base_url-optional)
    - [CLIENT\_KEY\_VALIDATION\_SECRET (Optional)](#client_key_validation_secret-optional)
  - [Usage](#usage)
    - [Development](#development)
    - [Testing](#testing)
    - [Deployment](#deployment)
  - [API Usage](#api-usage)
    - [Example Request](#example-request)
    - [Supported Endpoints](#supported-endpoints)
  - [Client Key Validation](#client-key-validation)
  - [Load Balancing](#load-balancing)
  - [Contributing](#contributing)
  - [Issues](#issues)
  - [License](#license)

## Features

- **Multi-Key Support**: Configure multiple API keys or service accounts for load balancing and failover.
- **Authentication Methods**: Supports both Google AI Studio API keys and Vertex AI service account credentials.
- **Load Balancing**: Automatically distributes requests across configured keys to avoid rate limits.
- **Client Key Validation**: Optional JWT-based validation of client-provided API keys.
- **CORS Enabled**: Supports cross-origin requests.
- **AI Gateway Integration**: Includes metadata headers for Cloudflare AI Gateway analytics.
- **Error Handling**: Graceful fallback and error reporting when keys fail.

## Prerequisites

- Node.js
- pnpm
- Cloudflare account
- Google Gemini API access (API key or service account)

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/JacobLinCool/gemini-reverse-proxy-worker.git
    cd gemini-reverse-proxy-worker
    ```

2. Install dependencies:

    ```bash
    pnpm install
    ```

3. Copy the environment file:

    ```bash
    cp .env.example .env
    ```

4. Configure your API keys in `.env` (see Configuration section).

## Configuration

Create a `.env` file based on `.env.example` and configure the following environment variables:

### GEMINI_API_KEY

Your Google Gemini API keys or service account credentials. Separate multiple keys with semicolons (`;`).

- For API keys: `AIzaSy...`
- For service accounts: JSON string of the service account credential.

Example:

```text
GEMINI_API_KEY=AIzaSyDuXjs5aonpprrtKrJVTs0OXwcBuSzVzII;{"type":"service_account",...}
```

### GEMINI_API_BASE_URL (Optional)

Custom base URLs for the Gemini API. Each URL corresponds to the API key at the same index.

Defaults:

- API keys: `https://generativelanguage.googleapis.com/`
- Service accounts: `https://aiplatform.googleapis.com/`

You can also use Cloudflare AI Gateway URLs:

```text
GEMINI_API_BASE_URL=https://gateway.ai.cloudflare.com/v1/xxx/yyy/google-ai-studio/;https://gateway.ai.cloudflare.com/v1/xxx/yyy/google-vertex-ai/
```

### CLIENT_KEY_VALIDATION_SECRET (Optional)

A secret key to enable JWT validation of client-provided API keys. If set, clients must provide a valid JWT in the `x-goog-api-key` header.

## Usage

### Development

Run the worker locally:

```bash
pnpm dev
```

The worker will be available at `http://localhost:8787`.

### Testing

Use the provided test script to verify functionality:

```bash
npx tsx scripts/test.ts
```

Make sure to set your API key in the test script or environment.

### Deployment

Deploy to Cloudflare Workers:

```bash
pnpm deploy
```

Set the environment variables in your Cloudflare dashboard or using Wrangler secrets:

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put GEMINI_API_BASE_URL
wrangler secret put CLIENT_KEY_VALIDATION_SECRET
```

## API Usage

The worker proxies all requests to the Gemini API. Use it as a drop-in replacement for the official Gemini API endpoints.

### Example Request

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYmYiOjE3NjMyMzc1OTcsImV4cCI6MzAwMDAwMDAwMH0.feqzZehlxl2KZ4X1acolO_72oU6mskUGs1lYazA19aE",
    httpOptions: {
        baseUrl: "https://your-cloudflare-worker-url/",
    },
});

const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: ["hi"],
});
```

### Supported Endpoints

All upstream API endpoints are supported.

## Client Key Validation

When `CLIENT_KEY_VALIDATION_SECRET` is set, clients must provide a valid JWT in the `x-goog-api-key` header (`apiKey`).

The JWT payload must include:

- `exp`: Expiration timestamp
- `nbf`: Not before timestamp

The JWT is signed with HMAC-SHA256 using the validation secret.

## Load Balancing

The worker automatically shuffles configured keys for each request to distribute load evenly. If a key fails (non-2xx response), it tries the next key. If all keys fail, it returns a 500 error.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues

If you encounter any issues, please report them on the [GitHub Issues](https://github.com/JacobLinCool/gemini-reverse-proxy-worker/issues) page.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
