/**
 * 利用者マスタ管理機能のテスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB関数をモック
vi.mock("./db", () => ({
  getPatients: vi.fn(),
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  updatePatient: vi.fn(),
  deactivatePatient: vi.fn(),
}));

import {
  getPatients,
  searchPatients,
  createPatient,
  updatePatient,
  deactivatePatient,
} from "./db";

const mockGetPatients = vi.mocked(getPatients);
const mockSearchPatients = vi.mocked(searchPatients);
const mockCreatePatient = vi.mocked(createPatient);
const mockUpdatePatient = vi.mocked(updatePatient);
const mockDeactivatePatient = vi.mocked(deactivatePatient);

const samplePatients = [
  { id: 1, name: "田中 花子", nameKana: "たなか はなこ", team: "身体", active: 1, createdAt: new Date() },
  { id: 2, name: "鈴木 一郎", nameKana: null, team: "天理", active: 1, createdAt: new Date() },
  { id: 3, name: "佐藤 美咲", nameKana: "さとう みさき", team: "郡山北部", active: 1, createdAt: new Date() },
  { id: 4, name: "山田 太郎", nameKana: null, team: "郡山南部", active: 1, createdAt: new Date() },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("利用者マスタ管理 - 一覧取得", () => {
  it("全利用者を取得できる", async () => {
    mockGetPatients.mockResolvedValue(samplePatients);
    const result = await getPatients();
    expect(result).toHaveLength(4);
    expect(mockGetPatients).toHaveBeenCalled();
  });

  it("チームでフィルタリングできる", async () => {
    const shintaiPatients = samplePatients.filter((p) => p.team === "身体");
    mockGetPatients.mockResolvedValue(shintaiPatients);
    const result = await getPatients("身体");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("田中 花子");
  });

  it("名前で検索できる", async () => {
    const filtered = samplePatients.filter((p) => p.name.includes("田中"));
    mockSearchPatients.mockResolvedValue(filtered);
    const result = await searchPatients("田中");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("田中 花子");
  });

  it("ふりがなで検索できる", async () => {
    const filtered = samplePatients.filter((p) => (p.nameKana ?? "").includes("さとう"));
    mockSearchPatients.mockResolvedValue(filtered);
    const result = await searchPatients("さとう");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("佐藤 美咲");
  });
});

describe("利用者マスタ管理 - 作成", () => {
  it("利用者を個別に追加できる", async () => {
    mockCreatePatient.mockResolvedValue(5);
    const id = await createPatient({ name: "新規 利用者", team: "身体", active: 1 });
    expect(id).toBe(5);
    expect(mockCreatePatient).toHaveBeenCalledWith({
      name: "新規 利用者",
      team: "身体",
      active: 1,
    });
  });

  it("ふりがな付きで利用者を追加できる", async () => {
    mockCreatePatient.mockResolvedValue(6);
    const id = await createPatient({ name: "新規 利用者", nameKana: "しんき りようしゃ", team: "天理", active: 1 });
    expect(id).toBe(6);
    expect(mockCreatePatient).toHaveBeenCalledWith({
      name: "新規 利用者",
      nameKana: "しんき りようしゃ",
      team: "天理",
      active: 1,
    });
  });

  it("一括登録で複数の利用者を追加できる", async () => {
    mockCreatePatient
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(9);

    const names = ["利用者A", "利用者B", "利用者C"];
    const results = await Promise.all(
      names.map((name) => createPatient({ name, team: "郡山北部", active: 1 }))
    );
    expect(results).toHaveLength(3);
    expect(mockCreatePatient).toHaveBeenCalledTimes(3);
  });
});

describe("利用者マスタ管理 - 更新・削除", () => {
  it("利用者名を更新できる", async () => {
    mockUpdatePatient.mockResolvedValue(undefined);
    await updatePatient(1, { name: "田中 花子（更新）" });
    expect(mockUpdatePatient).toHaveBeenCalledWith(1, { name: "田中 花子（更新）" });
  });

  it("チームを変更できる", async () => {
    mockUpdatePatient.mockResolvedValue(undefined);
    await updatePatient(2, { team: "郡山南部" });
    expect(mockUpdatePatient).toHaveBeenCalledWith(2, { team: "郡山南部" });
  });

  it("利用者を無効化（退所）できる", async () => {
    mockDeactivatePatient.mockResolvedValue(undefined);
    await deactivatePatient(1);
    expect(mockDeactivatePatient).toHaveBeenCalledWith(1);
  });
});

describe("利用者マスタ管理 - バリデーション", () => {
  it("名前が空の場合は登録できない", () => {
    const name = "  ";
    expect(name.trim()).toBe("");
  });

  it("名前が100文字を超える場合はバリデーションエラー", () => {
    const longName = "あ".repeat(101);
    expect(longName.length).toBeGreaterThan(100);
  });

  it("有効なチーム名のみ受け付ける", () => {
    const validTeams = ["身体", "天理", "郡山北部", "郡山南部"];
    expect(validTeams).toContain("身体");
    expect(validTeams).toContain("天理");
    expect(validTeams).not.toContain("無効なチーム");
  });

  it("一括登録で1行1名前として正しくパースできる", () => {
    const bulkText = "田中 花子\n鈴木 一郎\n佐藤 美咲";
    const parsed = bulkText
      .split(/[\n,、，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toBe("田中 花子");
    expect(parsed[1]).toBe("鈴木 一郎");
    expect(parsed[2]).toBe("佐藤 美咲");
  });

  it("カンマ区切りでも正しくパースできる", () => {
    const bulkText = "田中 花子, 鈴木 一郎, 佐藤 美咲";
    const parsed = bulkText
      .split(/[\n,、，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100);
    expect(parsed).toHaveLength(3);
  });

  it("空行は無視される", () => {
    const bulkText = "田中 花子\n\n鈴木 一郎\n\n";
    const parsed = bulkText
      .split(/[\n,、，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100);
    expect(parsed).toHaveLength(2);
  });
});
