import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
console.log('API Key present:', !!apiKey);

const ai = new GoogleGenAI({ apiKey });

// Test with json_schema response format (nullable fields)
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
          dueDateStr: { type: "string", nullable: true },
          patientName: { type: "string", nullable: true },
        },
        required: ["text", "dueDateStr", "patientName"],
        additionalProperties: false,
      },
    },
  });
  console.log("SUCCESS:", result.text);
} catch (err) {
  console.error("ERROR:", err.message);
  if (err.status) console.error("Status:", err.status);
  if (err.errorDetails) console.error("Details:", JSON.stringify(err.errorDetails, null, 2));
}

// Test with type array (["string", "null"]) - OpenAI style
try {
  const result2 = await ai.models.generateContent({
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
          patientName: { type: ["string", "null"] },
        },
        required: ["text", "dueDateStr", "patientName"],
        additionalProperties: false,
      },
    },
  });
  console.log("SUCCESS with type array:", result2.text);
} catch (err2) {
  console.error("ERROR with type array:", err2.message);
}
