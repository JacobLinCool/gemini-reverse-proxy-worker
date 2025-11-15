import { GoogleGenAI } from "@google/genai";

const c = new GoogleGenAI({
    apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYmYiOjE3NjMyMzc1OTcsImV4cCI6MzAwMDAwMDAwMH0.feqzZehlxl2KZ4X1acolO_72oU6mskUGs1lYazA19aE",
    httpOptions: {
        baseUrl: "http://localhost:8787/",
    },
});

(async () => {
    const response = await c.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: ["hi"],
    });
    console.log(JSON.stringify(response, null, 2));
})();
