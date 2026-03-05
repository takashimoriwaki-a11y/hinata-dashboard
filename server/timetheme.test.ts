/**
 * 時間帯テーマ切替ロジックのテスト
 * isNightTime() 関数と同等のロジックをサーバーサイドで検証
 */
import { describe, it, expect } from "vitest";

// ThemeContextと同じロジックを再現
function isNightTime(hour: number, minute: number): boolean {
  const totalMinutes = hour * 60 + minute;
  // 昼: 5:00 (300分) 〜 19:00 (1140分)
  return totalMinutes < 300 || totalMinutes >= 1141;
}

describe("時間帯テーマ切替ロジック", () => {
  it("5:00 は昼モード（境界値）", () => {
    expect(isNightTime(5, 0)).toBe(false);
  });

  it("9:00 は昼モード", () => {
    expect(isNightTime(9, 0)).toBe(false);
  });

  it("12:00 は昼モード", () => {
    expect(isNightTime(12, 0)).toBe(false);
  });

  it("19:00 は昼モード（境界値）", () => {
    expect(isNightTime(19, 0)).toBe(false);
  });

  it("19:01 は夜モード（境界値）", () => {
    expect(isNightTime(19, 1)).toBe(true);
  });

  it("22:00 は夜モード", () => {
    expect(isNightTime(22, 0)).toBe(true);
  });

  it("0:00 は夜モード（深夜）", () => {
    expect(isNightTime(0, 0)).toBe(true);
  });

  it("4:59 は夜モード（境界値）", () => {
    expect(isNightTime(4, 59)).toBe(true);
  });

  it("4:00 は夜モード", () => {
    expect(isNightTime(4, 0)).toBe(true);
  });
});
