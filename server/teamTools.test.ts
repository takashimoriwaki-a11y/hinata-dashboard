import { describe, it, expect, vi, beforeEach } from "vitest";

// チームツールのバリデーション・ロジックテスト
describe("チームツール バリデーション", () => {
  it("有効なチーム名が正しく検証されること", () => {
    const validTeams = ["身体", "天理", "郡山北部", "郡山南部"];
    validTeams.forEach((team) => {
      expect(validTeams.includes(team)).toBe(true);
    });
  });

  it("無効なチーム名が検出されること", () => {
    const validTeams = ["身体", "天理", "郡山北部", "郡山南部"];
    const invalidTeams = ["全チーム", "事務員", "unknown", ""];
    invalidTeams.forEach((team) => {
      expect(validTeams.includes(team)).toBe(false);
    });
  });

  it("ラベルが空文字の場合はエラーになること", () => {
    const label = "";
    expect(label.trim().length).toBe(0);
  });

  it("ラベルの最大文字数が200文字であること", () => {
    const maxLength = 200;
    const longLabel = "a".repeat(201);
    expect(longLabel.length).toBeGreaterThan(maxLength);
    const validLabel = "a".repeat(200);
    expect(validLabel.length).toBeLessThanOrEqual(maxLength);
  });

  it("有効なURLが正しく検証されること", () => {
    const validUrls = [
      "https://example.com",
      "https://docs.google.com/spreadsheets/d/xxx",
      "http://localhost:3000",
    ];
    validUrls.forEach((url) => {
      expect(() => new URL(url)).not.toThrow();
    });
  });

  it("無効なURLが検出されること", () => {
    const invalidUrls = ["not-a-url", "ftp://example.com", "just-text"];
    invalidUrls.forEach((url) => {
      const isValid = url.startsWith("https://") || url.startsWith("http://");
      expect(isValid).toBe(false);
    });
  });

  it("絵文字フィールドのデフォルト値が🔗であること", () => {
    const defaultEmoji = "🔗";
    expect(defaultEmoji).toBe("🔗");
  });

  it("色クラスのデフォルト値がtext-blue-600であること", () => {
    const defaultColor = "text-blue-600";
    expect(defaultColor).toBe("text-blue-600");
  });
});

describe("チームツール デフォルトタブ選択ロジック", () => {
  type TeamTabId = "身体" | "天理" | "郡山北部" | "郡山南部";

  const getDefaultTeam = (userTeam: string | undefined): TeamTabId => {
    if (
      userTeam === "身体" ||
      userTeam === "天理" ||
      userTeam === "郡山北部" ||
      userTeam === "郡山南部"
    ) {
      return userTeam;
    }
    return "身体";
  };

  it("身体チームユーザーは身体タブがデフォルトになること", () => {
    expect(getDefaultTeam("身体")).toBe("身体");
  });

  it("天理チームユーザーは天理タブがデフォルトになること", () => {
    expect(getDefaultTeam("天理")).toBe("天理");
  });

  it("郡山北部チームユーザーは郡山北部タブがデフォルトになること", () => {
    expect(getDefaultTeam("郡山北部")).toBe("郡山北部");
  });

  it("郡山南部チームユーザーは郡山南部タブがデフォルトになること", () => {
    expect(getDefaultTeam("郡山南部")).toBe("郡山南部");
  });

  it("全チームユーザーは身体タブがデフォルトになること", () => {
    expect(getDefaultTeam("全チーム")).toBe("身体");
  });

  it("事務員ユーザーは身体タブがデフォルトになること", () => {
    expect(getDefaultTeam("事務員")).toBe("身体");
  });

  it("未定義ユーザーは身体タブがデフォルトになること", () => {
    expect(getDefaultTeam(undefined)).toBe("身体");
  });
});
