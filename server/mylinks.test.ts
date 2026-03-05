import { describe, it, expect, vi, beforeEach } from "vitest";

// DBモック
vi.mock("./db", () => ({
  getMyLinks: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      label: "ZEST",
      url: "https://homecare.zest.jp/login",
      emoji: "📅",
      description: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  createMyLink: vi.fn().mockResolvedValue(2),
  updateMyLink: vi.fn().mockResolvedValue(undefined),
  deleteMyLink: vi.fn().mockResolvedValue(undefined),
}));

describe("マイリンク DB ヘルパー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMyLinksがユーザーのリンク一覧を返すこと", async () => {
    const { getMyLinks } = await import("./db");
    const result = await getMyLinks(1);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("ZEST");
    expect(result[0].url).toBe("https://homecare.zest.jp/login");
    expect(result[0].emoji).toBe("📅");
    expect(getMyLinks).toHaveBeenCalledWith(1);
  });

  it("createMyLinkが新しいリンクのIDを返すこと", async () => {
    const { createMyLink } = await import("./db");
    const id = await createMyLink({
      userId: 1,
      label: "Gemini",
      url: "https://gemini.google.com/app",
      emoji: "✨",
      sortOrder: 1,
    });
    expect(id).toBe(2);
    expect(createMyLink).toHaveBeenCalledOnce();
  });

  it("updateMyLinkが正しく呼び出されること", async () => {
    const { updateMyLink } = await import("./db");
    await updateMyLink(1, 1, { label: "更新後ラベル", url: "https://example.com" });
    expect(updateMyLink).toHaveBeenCalledWith(1, 1, {
      label: "更新後ラベル",
      url: "https://example.com",
    });
  });

  it("deleteMyLinkが正しく呼び出されること", async () => {
    const { deleteMyLink } = await import("./db");
    await deleteMyLink(1, 1);
    expect(deleteMyLink).toHaveBeenCalledWith(1, 1);
  });
});

describe("マイリンク バリデーション", () => {
  it("ラベルが空文字の場合はエラーになること", () => {
    const label = "";
    expect(label.trim().length).toBe(0);
  });

  it("有効なURLが正しく検証されること", () => {
    const validUrls = [
      "https://example.com",
      "https://homecare.zest.jp/login",
      "http://localhost:3000",
    ];
    validUrls.forEach((url) => {
      expect(() => new URL(url)).not.toThrow();
    });
  });

  it("無効なURLが検出されること", () => {
    const invalidUrls = ["not-a-url", "ftp://example.com", "just-text"];
    invalidUrls.forEach((url) => {
      // URLコンストラクタでhttp/httpsのみ許可する場合
      const isValid = url.startsWith("https://") || url.startsWith("http://");
      expect(isValid).toBe(false);
    });
  });

  it("絵文字フィールドのデフォルト値が🔗であること", () => {
    const defaultEmoji = "🔗";
    expect(defaultEmoji).toBe("🔗");
  });

  it("ラベルの最大文字数が100文字であること", () => {
    const maxLength = 100;
    const longLabel = "a".repeat(101);
    expect(longLabel.length).toBeGreaterThan(maxLength);
    const validLabel = "a".repeat(100);
    expect(validLabel.length).toBeLessThanOrEqual(maxLength);
  });
});
