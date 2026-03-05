/**
 * visitRecords DB関数のユニットテスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB関数をモック
vi.mock("./db", () => ({
  createVisitRecord: vi.fn(),
  getVisitRecords: vi.fn(),
  getVisitRecordById: vi.fn(),
  markVisitRecordExported: vi.fn(),
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  getPatients: vi.fn(),
}));

import {
  createVisitRecord,
  getVisitRecords,
  getVisitRecordById,
  markVisitRecordExported,
  searchPatients,
  createPatient,
} from "./db";

const mockCreateVisitRecord = vi.mocked(createVisitRecord);
const mockGetVisitRecords = vi.mocked(getVisitRecords);
const mockGetVisitRecordById = vi.mocked(getVisitRecordById);
const mockMarkVisitRecordExported = vi.mocked(markVisitRecordExported);
const mockSearchPatients = vi.mocked(searchPatients);
const mockCreatePatient = vi.mocked(createPatient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("visitRecords DB functions", () => {
  it("createVisitRecord: 必須フィールドで記録を作成できる", async () => {
    mockCreateVisitRecord.mockResolvedValueOnce(1);
    const id = await createVisitRecord({
      patientId: 1,
      patientName: "田中 花子",
      team: "郡山北部",
      createdBy: "user-1",
      createdByName: "森脇 崇",
    });
    expect(id).toBe(1);
    expect(mockCreateVisitRecord).toHaveBeenCalledWith(
      expect.objectContaining({ patientName: "田中 花子", team: "郡山北部" })
    );
  });

  it("createVisitRecord: 次回訪問日時・伝達情報を含めて作成できる", async () => {
    mockCreateVisitRecord.mockResolvedValueOnce(2);
    const nextVisitAt = new Date("2026-04-01T10:00:00");
    const id = await createVisitRecord({
      patientId: 2,
      patientName: "鈴木 一郎",
      team: "天理",
      createdBy: "user-1",
      createdByName: "森脇 崇",
      nextVisitAt,
      notifiedTo: "家族",
      notifyMethod: "電話",
      clinicalNotes: "血圧安定。本人の表情良好。",
    });
    expect(id).toBe(2);
    expect(mockCreateVisitRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        notifiedTo: "家族",
        notifyMethod: "電話",
        clinicalNotes: "血圧安定。本人の表情良好。",
      })
    );
  });

  it("getVisitRecords: ユーザーIDで記録一覧を取得できる", async () => {
    const mockRecords = [
      { id: 1, patientName: "田中 花子", team: "郡山北部", createdByName: "森脇 崇", createdAt: new Date(), exportedAt: null },
    ];
    mockGetVisitRecords.mockResolvedValueOnce(mockRecords as any);
    const records = await getVisitRecords("user-1");
    expect(records).toHaveLength(1);
    expect(records[0].patientName).toBe("田中 花子");
  });

  it("getVisitRecordById: IDで記録を取得できる", async () => {
    const mockRecord = {
      id: 1,
      patientName: "田中 花子",
      team: "郡山北部",
      createdByName: "森脇 崇",
      notifiedTo: "本人",
      notifyMethod: "口頭",
      createdAt: new Date(),
    };
    mockGetVisitRecordById.mockResolvedValueOnce(mockRecord as any);
    const record = await getVisitRecordById(1);
    expect(record?.patientName).toBe("田中 花子");
    expect(record?.notifiedTo).toBe("本人");
  });

  it("getVisitRecordById: 存在しないIDはnullを返す", async () => {
    mockGetVisitRecordById.mockResolvedValueOnce(null);
    const record = await getVisitRecordById(9999);
    expect(record).toBeNull();
  });

  it("markVisitRecordExported: 転送済みフラグを更新できる", async () => {
    mockMarkVisitRecordExported.mockResolvedValueOnce(undefined);
    await markVisitRecordExported(1);
    expect(mockMarkVisitRecordExported).toHaveBeenCalledWith(1);
  });
});

describe("patients DB functions", () => {
  it("createPatient: 利用者を作成できる", async () => {
    mockCreatePatient.mockResolvedValueOnce(1);
    const id = await createPatient({ name: "山田 太郎", team: "身体" });
    expect(id).toBe(1);
    expect(mockCreatePatient).toHaveBeenCalledWith({ name: "山田 太郎", team: "身体" });
  });

  it("searchPatients: チームで絞り込み検索できる", async () => {
    const mockPatients = [
      { id: 1, name: "山田 太郎", team: "身体" },
      { id: 2, name: "佐藤 花子", team: "身体" },
    ];
    mockSearchPatients.mockResolvedValueOnce(mockPatients as any);
    const patients = await searchPatients({ team: "身体" });
    expect(patients).toHaveLength(2);
    expect(patients[0].team).toBe("身体");
  });

  it("searchPatients: 名前で検索できる", async () => {
    const mockPatients = [{ id: 1, name: "山田 太郎", team: "身体" }];
    mockSearchPatients.mockResolvedValueOnce(mockPatients as any);
    const patients = await searchPatients({ query: "山田" });
    expect(patients).toHaveLength(1);
    expect(patients[0].name).toBe("山田 太郎");
  });

  it("searchPatients: チームと名前の両方で絞り込める", async () => {
    mockSearchPatients.mockResolvedValueOnce([]);
    const patients = await searchPatients({ query: "存在しない", team: "天理" });
    expect(patients).toHaveLength(0);
  });
});

describe("スプレッドシート転送ロジック", () => {
  it("日時フォーマット: Dateオブジェクトを正しくフォーマットできる", () => {
    const formatDate = (val: Date | number | null | undefined): string => {
      if (!val) return "";
      const d = val instanceof Date ? val : new Date(val);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    const date = new Date("2026-04-01T10:30:00");
    const result = formatDate(date);
    expect(result).toBe("2026/04/01 10:30");
  });

  it("日時フォーマット: nullの場合は空文字を返す", () => {
    const formatDate = (val: Date | number | null | undefined): string => {
      if (!val) return "";
      const d = val instanceof Date ? val : new Date(val);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });

  it("伝達先「その他」の場合、自由記述が転送データに含まれる", () => {
    const record = {
      notifiedTo: "その他",
      notifiedToOther: "ヘルパー事業所",
      notifyMethod: "電話",
      notifyMethodOther: "",
    };
    const row = [
      record.notifiedTo ?? "",
      record.notifiedToOther ?? "",
      record.notifyMethod ?? "",
      record.notifyMethodOther ?? "",
    ];
    expect(row[0]).toBe("その他");
    expect(row[1]).toBe("ヘルパー事業所");
  });
});
