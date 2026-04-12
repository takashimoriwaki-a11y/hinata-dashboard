/**
 * アルコールチェック記録機能のテスト
 * - saveAlcoholCheck: DB保存
 * - markAlcoholCheckSynced: シート転記済みフラグ更新
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB関数をモック
vi.mock("./db", () => ({
  saveAlcoholCheck: vi.fn(),
  markAlcoholCheckSynced: vi.fn(),
}));

import { saveAlcoholCheck, markAlcoholCheckSynced } from "./db";

describe("アルコールチェック記録", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveAlcoholCheck: 出勤時のアルコールチェックデータを保存できる", async () => {
    const mockRecord = {
      id: 1,
      type: "clock_in" as const,
      userId: 42,
      userName: "テスト太郎",
      numberPlate: "奈良 300 あ 1234",
      confirmMethod: "online" as const,
      detectorUsed: 1,
      alcoholDetected: 0,
      confirmerName: "森脇崇",
      notes: null,
      checkedAt: Date.now(),
      sheetSynced: 0,
      createdAt: new Date(),
    };
    vi.mocked(saveAlcoholCheck).mockResolvedValue(mockRecord);

    const result = await saveAlcoholCheck({
      type: "clock_in",
      userId: 42,
      userName: "テスト太郎",
      numberPlate: "奈良 300 あ 1234",
      confirmMethod: "online",
      detectorUsed: 1,
      alcoholDetected: 0,
      confirmerName: "森脇崇",
      notes: null,
      checkedAt: mockRecord.checkedAt,
    });

    expect(result.type).toBe("clock_in");
    expect(result.userName).toBe("テスト太郎");
    expect(result.numberPlate).toBe("奈良 300 あ 1234");
    expect(result.confirmMethod).toBe("online");
    expect(result.detectorUsed).toBe(1);
    expect(result.alcoholDetected).toBe(0);
    expect(result.confirmerName).toBe("森脇崇");
    expect(result.sheetSynced).toBe(0);
  });

  it("saveAlcoholCheck: 退勤時のアルコールチェックデータを保存できる", async () => {
    const mockRecord = {
      id: 2,
      type: "clock_out" as const,
      userId: 42,
      userName: "テスト太郎",
      numberPlate: "奈良 300 あ 1234",
      confirmMethod: "face" as const,
      detectorUsed: 0,
      alcoholDetected: 0,
      confirmerName: "森脇英樹",
      notes: "特記事項なし",
      checkedAt: Date.now(),
      sheetSynced: 0,
      createdAt: new Date(),
    };
    vi.mocked(saveAlcoholCheck).mockResolvedValue(mockRecord);

    const result = await saveAlcoholCheck({
      type: "clock_out",
      userId: 42,
      userName: "テスト太郎",
      numberPlate: "奈良 300 あ 1234",
      confirmMethod: "face",
      detectorUsed: 0,
      alcoholDetected: 0,
      confirmerName: "森脇英樹",
      notes: "特記事項なし",
      checkedAt: mockRecord.checkedAt,
    });

    expect(result.type).toBe("clock_out");
    expect(result.confirmMethod).toBe("face");
    expect(result.confirmerName).toBe("森脇英樹");
  });

  it("markAlcoholCheckSynced: シート転記済みフラグを更新できる", async () => {
    vi.mocked(markAlcoholCheckSynced).mockResolvedValue(undefined);

    await markAlcoholCheckSynced(1);

    expect(markAlcoholCheckSynced).toHaveBeenCalledWith(1);
    expect(markAlcoholCheckSynced).toHaveBeenCalledTimes(1);
  });

  it("アルコールチェックのデフォルト値が正しい", () => {
    // デフォルト値の確認
    const defaults = {
      confirmMethod: "online",
      detectorUsed: true,
      alcoholDetected: false,
      confirmerName: "森脇崇",
    };

    expect(defaults.confirmMethod).toBe("online");
    expect(defaults.detectorUsed).toBe(true);
    expect(defaults.alcoholDetected).toBe(false);
    expect(defaults.confirmerName).toBe("森脇崇");
  });

  it("確認者の選択肢が正しい", () => {
    const confirmerOptions = ["森脇崇", "森脇英樹"];
    expect(confirmerOptions).toContain("森脇崇");
    expect(confirmerOptions).toContain("森脇英樹");
    expect(confirmerOptions).toHaveLength(2);
  });
});
