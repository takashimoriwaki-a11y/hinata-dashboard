import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

// Test exact schema from parseVoice in routers.ts
try {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: "明日の14時に田中さんの薬確認をする" }] }],
    config: {
      systemInstruction: "タスクを抽出してJSONで返してください。",
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          dueDateStr: { type: ["string", "null"] },
          assignType: { type: "string", enum: ["all", "team", "personal"] },
          assignTeam: { type: ["string", "null"] },
          assignPersonName: { type: ["string", "null"] },
          patientName: { type: ["string", "null"] },
        },
        required: ["text", "dueDateStr", "assignType", "assignTeam", "assignPersonName", "patientName"],
        additionalProperties: false,
      },
    },
  });
  console.log("SUCCESS:", result.text);
} catch (err) {
  console.error("ERROR:", err.message);
  if (err.status) console.error("Status:", err.status);
  if (err.errorDetails) console.error("Details:", JSON.stringify(err.errorDetails, null, 2));
  console.error("Full error:", err);
}
