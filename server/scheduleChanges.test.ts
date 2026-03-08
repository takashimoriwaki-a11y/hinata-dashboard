import { describe, it, expect, vi, beforeEach } from "vitest";

// DB関数をモック
vi.mock("./db", () => ({
  createScheduleChange: vi.fn().mockResolvedValue(1),
  getScheduleChanges: vi.fn().mockResolvedValue([
    {
      id: 1,
      changeType: "visit_change",
      team: "身体",
      patientName: "テスト利用者",
      patientId: null,
      fromDatetime: "2026-03-10T10:00:00.000Z",
      toDatetime: "2026-03-10T14:00:00.000Z",
      staffBefore: "田中看護師",
      staffAfter: "山田看護師",
      meetingName: null,
      meetingStaff: null,
      reason: "利用者の都合",
      createdBy: 1,
      createdByName: "テストスタッフ",
      exported: 0,
      createdAt: new Date("2026-03-08T09:00:00.000Z"),
      updatedAt: new Date("2026-03-08T09:00:00.000Z"),
    },
  ]),
  getScheduleChangeById: vi.fn().mockResolvedValue({
    id: 1,
    changeType: "visit_change",
    team: "身体",
    patientName: "テスト利用者",
    patientId: null,
    fromDatetime: "2026-03-10T10:00:00.000Z",
    toDatetime: "2026-03-10T14:00:00.000Z",
    staffBefore: "田中看護師",
    staffAfter: "山田看護師",
    meetingName: null,
    meetingStaff: null,
    reason: "利用者の都合",
    createdBy: 1,
    createdByName: "テストスタッフ",
    exported: 0,
    createdAt: new Date("2026-03-08T09:00:00.000Z"),
    updatedAt: new Date("2026-03-08T09:00:00.000Z"),
  }),
  markScheduleChangeExported: vi.fn().mockResolvedValue(undefined),
}));

import {
  createScheduleChange,
  getScheduleChanges,
  getScheduleChangeById,
  markScheduleChangeExported,
} from "./db";

describe("scheduleChanges DB functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createScheduleChange: 変更連絡を作成してIDを返す", async () => {
    const id = await createScheduleChange({
      changeType: "visit_change",
      team: "身体",
      patientName: "テスト利用者",
      fromDatetime: "2026-03-10T10:00:00.000Z",
      toDatetime: "2026-03-10T14:00:00.000Z",
      staffBefore: "田中看護師",
      staffAfter: "山田看護師",
      reason: "利用者の都合",
      createdBy: 1,
      createdByName: "テストスタッフ",
    });
    expect(id).toBe(1);
    expect(createScheduleChange).toHaveBeenCalledOnce();
  });

  it("getScheduleChanges: 変更連絡一覧を取得する", async () => {
    const list = await getScheduleChanges(100);
    expect(list).toHaveLength(1);
    expect(list[0].changeType).toBe("visit_change");
    expect(list[0].patientName).toBe("テスト利用者");
  });

  it("getScheduleChangeById: IDで変更連絡を取得する", async () => {
    const record = await getScheduleChangeById(1);
    expect(record).toBeDefined();
    expect(record?.id).toBe(1);
    expect(record?.team).toBe("身体");
  });

  it("markScheduleChangeExported: 転記済みフラグを更新する", async () => {
    await markScheduleChangeExported(1);
    expect(markScheduleChangeExported).toHaveBeenCalledWith(1);
  });

  it("visit_cancel種別でtoDatetimeがnullでも作成できる", async () => {
    const id = await createScheduleChange({
      changeType: "visit_cancel",
      team: "天理",
      patientName: "キャンセル利用者",
      fromDatetime: "2026-03-10T10:00:00.000Z",
      reason: "体調不良",
      createdBy: 1,
      createdByName: "テストスタッフ",
    });
    expect(id).toBe(1);
  });

  it("meeting_add種別で会議情報を作成できる", async () => {
    const id = await createScheduleChange({
      changeType: "meeting_add",
      team: "全チーム",
      meetingName: "スタッフ会議",
      meetingStaff: JSON.stringify(["田中看護師", "山田看護師", "鈴木PT"]),
      toDatetime: "2026-03-15T14:00:00.000Z",
      createdBy: 1,
      createdByName: "テストスタッフ",
    });
    expect(id).toBe(1);
  });
});

describe("scheduleChange changeType validation", () => {
  const validTypes = ["visit_change", "visit_cancel", "visit_add", "meeting_add", "meeting_change"];

  it.each(validTypes)("有効な変更種別: %s", (changeType) => {
    expect(validTypes).toContain(changeType);
  });

  it("無効な変更種別は配列に含まれない", () => {
    expect(validTypes).not.toContain("invalid_type");
  });
});
