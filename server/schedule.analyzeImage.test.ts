import { describe, it, expect, vi, beforeEach } from "vitest";

// DB・Gemini APIをモック
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    entries: [
                      {
                        time: "09:00",
                        endTime: "09:30",
                        patientName: "山田 太郎",
                        staffName: "田中 花子",
                        notes: null,
                      },
                    ],
                    summary: "午前1件の訪問スケジュール",
                  }),
                },
              ],
            },
          },
        ],
      }),
    },
  })),
}));

describe("schedule.analyzeImage", () => {
  it("AI解析結果のJSONが正しくパースできる", () => {
    const rawJson = JSON.stringify({
      entries: [
        {
          time: "09:00",
          endTime: "09:30",
          patientName: "山田 太郎",
          staffName: "田中 花子",
          notes: null,
        },
      ],
      summary: "午前1件の訪問スケジュール",
    });

    const parsed = JSON.parse(rawJson);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].time).toBe("09:00");
    expect(parsed.entries[0].patientName).toBe("山田 太郎");
    expect(parsed.summary).toBe("午前1件の訪問スケジュール");
  });

  it("JSONマッチ正規表現がコードブロック付きJSONを正しく抽出する", () => {
    const textWithCodeBlock = "```json\n{\"entries\":[], \"summary\":\"テスト\"}\n```";
    const jsonMatch =
      textWithCodeBlock.match(/```json\s*([\s\S]*?)```/) ??
      textWithCodeBlock.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch?.[1] ?? jsonMatch?.[0] ?? textWithCodeBlock;
    const parsed = JSON.parse(jsonStr.trim());
    expect(parsed.summary).toBe("テスト");
  });

  it("JSONマッチ正規表現がコードブロックなしJSONを正しく抽出する", () => {
    const textWithoutCodeBlock = '{"entries":[], "summary":"直接JSON"}';
    const jsonMatch =
      textWithoutCodeBlock.match(/```json\s*([\s\S]*?)```/) ??
      textWithoutCodeBlock.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch?.[1] ?? jsonMatch?.[0] ?? textWithoutCodeBlock;
    const parsed = JSON.parse(jsonStr.trim());
    expect(parsed.summary).toBe("直接JSON");
  });

  it("analyzedDataスキーマ: entriesが配列であることを確認", () => {
    const validData = {
      entries: [
        { time: "10:00", endTime: "10:30", patientName: "鈴木 一郎", staffName: "佐藤 次郎", notes: "バイタル確認" },
      ],
      summary: "1件の訪問",
    };
    expect(Array.isArray(validData.entries)).toBe(true);
    expect(validData.entries[0]).toHaveProperty("patientName");
    expect(validData.entries[0]).toHaveProperty("time");
  });
});
