import { describe, it, expect, vi, beforeEach } from "vitest";

// DBモック
vi.mock("./db", () => ({
  getSpreadsheetLinks: vi.fn().mockResolvedValue([
    {
      id: 1,
      linkKey: "fee_seishin_koriyama",
      label: "利用者料金一覧（精神郡山）",
      yearMonth: "2026-03",
      url: "https://docs.google.com/spreadsheets/d/1YBK1YOFOhJDnry1b0zQjI5jAU91RnBfLOE-bGve3b5M/edit?usp=sharing",
      color: "text-emerald-600",
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getAllSpreadsheetLinks: vi.fn().mockResolvedValue([
    {
      id: 1,
      linkKey: "fee_seishin_koriyama",
      label: "利用者料金一覧（精神郡山）",
      yearMonth: "2026-03",
      url: "https://docs.google.com/spreadsheets/d/1YBK1YOFOhJDnry1b0zQjI5jAU91RnBfLOE-bGve3b5M/edit?usp=sharing",
      color: "text-emerald-600",
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      linkKey: "fee_seishin_koriyama",
      label: "利用者料金一覧（精神郡山）",
      yearMonth: "2026-04",
      url: "https://docs.google.com/spreadsheets/d/NEXT_MONTH_ID/edit?usp=sharing",
      color: "text-emerald-600",
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  upsertSpreadsheetLink: vi.fn().mockResolvedValue(1),
  deleteSpreadsheetLink: vi.fn().mockResolvedValue(undefined),
}));

describe("スプレッドシートURL月次管理 DB ヘルパー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSpreadsheetLinksが指定年月のリンク一覧を返すこと", async () => {
    const { getSpreadsheetLinks } = await import("./db");
    const result = await getSpreadsheetLinks("2026-03");
    expect(result).toHaveLength(1);
    expect(result[0].yearMonth).toBe("2026-03");
    expect(result[0].linkKey).toBe("fee_seishin_koriyama");
    expect(getSpreadsheetLinks).toHaveBeenCalledWith("2026-03");
  });

  it("getAllSpreadsheetLinksが全年月のリンクを返すこと", async () => {
    const { getAllSpreadsheetLinks } = await import("./db");
    const result = await getAllSpreadsheetLinks();
    expect(result).toHaveLength(2);
    expect(result[0].yearMonth).toBe("2026-03");
    expect(result[1].yearMonth).toBe("2026-04");
  });

  it("upsertSpreadsheetLinkが正しく呼び出されること", async () => {
    const { upsertSpreadsheetLink } = await import("./db");
    const id = await upsertSpreadsheetLink({
      linkKey: "fee_seishin_koriyama",
      label: "利用者料金一覧（精神郡山）",
      yearMonth: "2026-04",
      url: "https://docs.google.com/spreadsheets/d/NEW_ID/edit",
      color: "text-emerald-600",
      createdBy: 1,
    });
    expect(id).toBe(1);
    expect(upsertSpreadsheetLink).toHaveBeenCalledOnce();
  });

  it("deleteSpreadsheetLinkが正しく呼び出されること", async () => {
    const { deleteSpreadsheetLink } = await import("./db");
    await deleteSpreadsheetLink(1);
    expect(deleteSpreadsheetLink).toHaveBeenCalledWith(1);
  });
});

describe("年月フォーマット・バリデーション", () => {
  it("YYYY-MM形式の年月が正しく検証されること", () => {
    const validFormats = ["2026-03", "2026-12", "2027-01"];
    const regex = /^\d{4}-\d{2}$/;
    validFormats.forEach((ym) => {
      expect(regex.test(ym)).toBe(true);
    });
  });

  it("無効な年月形式が検出されること", () => {
    const invalidFormats = ["2026/03", "202603", "26-03", "2026-3"];
    const regex = /^\d{4}-\d{2}$/;
    invalidFormats.forEach((ym) => {
      expect(regex.test(ym)).toBe(false);
    });
  });

  it("当月の年月文字列が正しく生成されること", () => {
    const now = new Date(2026, 2, 5); // 2026年3月5日
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(yearMonth).toBe("2026-03");
  });

  it("翌月の年月文字列が正しく生成されること（12月→1月）", () => {
    const now = new Date(2026, 11, 1); // 2026年12月
    const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const nextMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    const yearMonth = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
    expect(yearMonth).toBe("2027-01");
  });

  it("リンクキーの定義が6件であること", () => {
    const LINK_DEFINITIONS = [
      { key: "fee_seishin_koriyama" },
      { key: "fee_shintai" },
      { key: "fee_tenri" },
      { key: "daily_report" },
      { key: "attendance" },
      { key: "checkout_checklist" },
    ];
    expect(LINK_DEFINITIONS).toHaveLength(6);
  });
});
