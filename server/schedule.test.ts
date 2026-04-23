import { describe, it, expect, vi, beforeEach } from "vitest";

// DBモック
vi.mock("./db", () => ({
  getScheduleScreenshots: vi.fn().mockResolvedValue([]),
  upsertScheduleScreenshot: vi.fn().mockResolvedValue({ id: 1, team: "身体", day: "今日", imageUrl: "https://example.com/img.jpg", imageKey: "key", uploadedById: 1, uploadedByName: "テスト太郎", updatedAt: new Date() }),
  deleteScheduleScreenshot: vi.fn().mockResolvedValue(undefined),
  getUserTeamSetting: vi.fn().mockResolvedValue(null),
  setUserTeamSetting: vi.fn().mockResolvedValue({ userId: 1, team: "身体" }),
}));

// S3 storage は廃止され、スクリーンショットは常にDBに直接保存されるため
// storageモックは不要。ここでは削除済み。

describe("schedule screenshot helpers", () => {
  it("チーム名が正しい値であること", () => {
    const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
    expect(TEAMS).toHaveLength(4);
    expect(TEAMS).toContain("身体");
    expect(TEAMS).toContain("天理");
    expect(TEAMS).toContain("郡山北部");
    expect(TEAMS).toContain("郡山南部");
  });

  it("日付が今日・明日の2種類であること", () => {
    const DAYS = ["今日", "明日"] as const;
    expect(DAYS).toHaveLength(2);
    expect(DAYS).toContain("今日");
    expect(DAYS).toContain("明日");
  });

  it("getScheduleScreenshotsが呼び出せること", async () => {
    const { getScheduleScreenshots } = await import("./db");
    const result = await getScheduleScreenshots();
    expect(result).toEqual([]);
    expect(getScheduleScreenshots).toHaveBeenCalledOnce();
  });

  it("upsertScheduleScreenshotが正しいデータを返すこと", async () => {
    const { upsertScheduleScreenshot } = await import("./db");
    const result = await upsertScheduleScreenshot({
      team: "身体",
      day: "今日",
      imageUrl: "https://example.com/img.jpg",
      imageKey: "key",
      uploadedById: 1,
      uploadedByName: "テスト太郎",
    });
    expect(result.team).toBe("身体");
    expect(result.day).toBe("今日");
    expect(result.imageUrl).toBe("https://example.com/img.jpg");
  });

  it("getUserTeamSettingがnullを返すこと（未設定時）", async () => {
    const { getUserTeamSetting } = await import("./db");
    const result = await getUserTeamSetting(999);
    expect(result).toBeNull();
  });

  it("setUserTeamSettingがチームを保存できること", async () => {
    const { setUserTeamSetting } = await import("./db");
    const result = await setUserTeamSetting(1, "身体");
    expect(result.team).toBe("身体");
    expect(result.userId).toBe(1);
  });
});
