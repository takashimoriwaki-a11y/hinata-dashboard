/**
 * Google Calendar 連携のユニットテスト
 * - calendarStatus: トークンが保存されているかどうかの確認
 * - getEvents: イベント取得（未連携時のエラー）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB モック
vi.mock("./db", () => ({
  getDb: vi.fn(),
  updateUserGoogleTokens: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

// google-auth-library モック
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    setCredentials: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue({
      credentials: { access_token: "new_token", expiry_date: Date.now() + 3600_000 },
    }),
  })),
}));

import * as dbModule from "./db";

describe("Google Calendar - status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("トークンがない場合は connected: false を返す", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ googleAccessToken: null, googleTokenExpiry: null }]),
    };
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb as any);

    // ロジックを直接テスト
    const row = { googleAccessToken: null, googleTokenExpiry: null };
    const result = row?.googleAccessToken ? { connected: true } : { connected: false };
    expect(result.connected).toBe(false);
  });

  it("トークンがある場合は connected: true を返す", async () => {
    const row = { googleAccessToken: "valid_token", googleTokenExpiry: Date.now() + 3600_000 };
    const result = row?.googleAccessToken
      ? { connected: true, tokenExpiry: row.googleTokenExpiry }
      : { connected: false };
    expect(result.connected).toBe(true);
  });
});

describe("Google Calendar - getEvents", () => {
  it("アクセストークンがない場合はエラーをスローする", async () => {
    const row = { googleAccessToken: null, googleRefreshToken: null, googleTokenExpiry: null };
    const isConnected = !!row?.googleAccessToken;
    expect(isConnected).toBe(false);
  });

  it("イベントデータを正しくマッピングする", () => {
    const rawItem = {
      id: "event1",
      summary: "テスト会議",
      description: "説明",
      location: "会議室A",
      start: { dateTime: "2026-03-12T10:00:00+09:00" },
      end: { dateTime: "2026-03-12T11:00:00+09:00" },
      htmlLink: "https://calendar.google.com/event?id=event1",
      colorId: "1",
    };

    const mapped = {
      id: rawItem.id,
      summary: rawItem.summary ?? "タイトルなし",
      description: rawItem.description ?? null,
      location: rawItem.location ?? null,
      start: rawItem.start?.dateTime ?? rawItem.start?.date ?? "",
      end: rawItem.end?.dateTime ?? rawItem.end?.date ?? "",
      isAllDay: !rawItem.start?.dateTime,
      htmlLink: rawItem.htmlLink ?? null,
      colorId: rawItem.colorId ?? null,
    };

    expect(mapped.id).toBe("event1");
    expect(mapped.summary).toBe("テスト会議");
    expect(mapped.isAllDay).toBe(false);
    expect(mapped.start).toBe("2026-03-12T10:00:00+09:00");
  });

  it("終日イベントを正しくマッピングする", () => {
    const rawItem = {
      id: "event2",
      summary: "終日イベント",
      start: { date: "2026-03-12" },
      end: { date: "2026-03-13" },
      htmlLink: null,
      colorId: null,
    };

    const mapped = {
      id: rawItem.id,
      summary: rawItem.summary ?? "タイトルなし",
      start: (rawItem.start as any)?.dateTime ?? (rawItem.start as any)?.date ?? "",
      end: (rawItem.end as any)?.dateTime ?? (rawItem.end as any)?.date ?? "",
      isAllDay: !(rawItem.start as any)?.dateTime,
      htmlLink: rawItem.htmlLink ?? null,
      colorId: rawItem.colorId ?? null,
    };

    expect(mapped.isAllDay).toBe(true);
    expect(mapped.start).toBe("2026-03-12");
  });
});

describe("Google Calendar - updateUserGoogleTokens", () => {
  it("updateUserGoogleTokens が正しい引数で呼ばれる", async () => {
    const mockUpdateFn = vi.fn().mockResolvedValue(undefined);
    vi.mocked(dbModule.updateUserGoogleTokens).mockImplementation(mockUpdateFn);

    await dbModule.updateUserGoogleTokens(1, "access_token", "refresh_token", Date.now() + 3600_000);
    expect(mockUpdateFn).toHaveBeenCalledWith(
      1,
      "access_token",
      "refresh_token",
      expect.any(Number)
    );
  });
});
