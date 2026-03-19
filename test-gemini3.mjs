import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

// Test exact schema from parseVisitVoice
try {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: "明日の14時に田中さんの訪問。家族に口頭で伝えた" }] }],
    config: {
      systemInstruction: "訪問看護記録を抽出してJSONで返してください。",
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          patientName: { type: ["string", "null"] },
          visitDate: { type: ["string", "null"] },
          visitTime: { type: ["string", "null"] },
          notifiedTo: { type: ["string", "null"] },
          notifiedToOther: { type: ["string", "null"] },
          notifyMethod: { type: ["string", "null"] },
          notifyMethodOther: { type: ["string", "null"] },
          team: { type: ["string", "null"] },
        },
        required: ["patientName", "visitDate", "visitTime", "notifiedTo", "notifiedToOther", "notifyMethod", "notifyMethodOther", "team"],
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
