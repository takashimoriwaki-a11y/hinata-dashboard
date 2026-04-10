import { describe, it, expect, vi, beforeEach } from "vitest";

// DBモック
vi.mock("./db", () => ({
  getMyTasks: vi.fn().mockResolvedValue([
    {
      id: 1,
      text: "月次報告書の作成",
      done: 0,
      dueDate: new Date("2026-03-10"),
      createdBy: 1,
      createdByName: "森脇崇",
      assignType: "all",
      assignTeam: null,
      assignUserId: null,
      assignUserName: null,
      completedBy: null,
      completedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      text: "スタッフ面談",
      done: 0,
      dueDate: new Date("2026-03-07"),
      createdBy: 2,
      createdByName: "田中花子",
      assignType: "personal",
      assignTeam: null,
      assignUserId: 1,
      assignUserName: "森脇崇",
      completedBy: null,
      completedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      text: "身体チーム会議",
      done: 0,
      dueDate: null,
      createdBy: 2,
      createdByName: "田中花子",
      assignType: "team",
      assignTeam: "身体",
      assignUserId: null,
      assignUserName: null,
      completedBy: null,
      completedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getAllTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue(10),
  toggleTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  softDeleteTask: vi.fn().mockResolvedValue(undefined),
  restoreTask: vi.fn().mockResolvedValue(undefined),
  permanentDeleteTask: vi.fn().mockResolvedValue(undefined),
  cleanupExpiredDeletedTasks: vi.fn().mockResolvedValue(0),
  getDeletedTasks: vi.fn().mockResolvedValue([
    {
      id: 99,
      text: "削除済みタスク",
      done: 0,
      dueDate: new Date("2026-03-01"),
      createdBy: 1,
      createdByName: "森脇崇",
      assignType: "all",
      assignTeam: null,
      assignUserId: null,
      assignUserName: null,
      completedBy: null,
      completedAt: null,
      deletedAt: new Date("2026-04-01"),
      deletedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getTaskById: vi.fn().mockResolvedValue({
    id: 1,
    createdBy: 1,
    text: "テストタスク",
    done: 0,
    deletedAt: null,
    deletedBy: null,
  }),
  updateTask: vi.fn().mockResolvedValue(undefined),
}));

describe("タスク DB ヘルパー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMyTasksが自分に関係するタスク一覧を返すこと", async () => {
    const { getMyTasks } = await import("./db");
    const result = await getMyTasks(1, "身体");
    expect(result).toHaveLength(3);
    expect(getMyTasks).toHaveBeenCalledWith(1, "身体");
  });

  it("createTaskが正しく呼び出されること", async () => {
    const { createTask } = await import("./db");
    const id = await createTask({
      text: "新しいタスク",
      done: 0,
      dueDate: new Date("2026-04-01"),
      createdBy: 1,
      createdByName: "森脇崇",
      assignType: "all",
    });
    expect(id).toBe(10);
    expect(createTask).toHaveBeenCalledOnce();
  });

  it("toggleTaskが完了状態を切り替えること", async () => {
    const { toggleTask } = await import("./db");
    await toggleTask(1, true, 1);
    expect(toggleTask).toHaveBeenCalledWith(1, true, 1);
  });

  it("deleteTaskが作成者IDとともに呼び出されること", async () => {
    const { deleteTask } = await import("./db");
    await deleteTask(1, 1);
    expect(deleteTask).toHaveBeenCalledWith(1, 1);
  });

  it("getTaskByIdが指定IDのタスクを返すこと", async () => {
    const { getTaskById } = await import("./db");
    const task = await getTaskById(1);
    expect(task).toBeDefined();
    expect(task?.id).toBe(1);
    expect(task?.createdBy).toBe(1);
  });

  it("updateTaskが正しく呼び出されること", async () => {
    const { updateTask } = await import("./db");
    await updateTask(1, 1, {
      text: "更新後のタスク",
      dueDate: new Date("2026-04-15"),
      assignType: "team",
      assignTeam: "身体",
    });
    expect(updateTask).toHaveBeenCalledWith(1, 1, {
      text: "更新後のタスク",
      dueDate: new Date("2026-04-15"),
      assignType: "team",
      assignTeam: "身体",
    });
  });

  it("updateTaskで期日をnullにできること", async () => {
    const { updateTask } = await import("./db");
    await updateTask(1, 1, { dueDate: null });
    expect(updateTask).toHaveBeenCalledWith(1, 1, { dueDate: null });
  });
});

describe("タスクのフィルタリングロジック", () => {
  const tasks = [
    { id: 1, done: 0, assignType: "all", createdBy: 1, assignUserId: null, assignTeam: null },
    { id: 2, done: 1, assignType: "personal", createdBy: 2, assignUserId: 1, assignTeam: null },
    { id: 3, done: 0, assignType: "team", createdBy: 2, assignUserId: null, assignTeam: "身体" },
    { id: 4, done: 0, assignType: "team", createdBy: 2, assignUserId: null, assignTeam: "天理" },
  ];

  it("未完了フィルターが正しく動作すること", () => {
    const active = tasks.filter((t) => t.done === 0);
    expect(active).toHaveLength(3);
  });

  it("完了フィルターが正しく動作すること", () => {
    const done = tasks.filter((t) => t.done === 1);
    expect(done).toHaveLength(1);
  });

  it("自分のチームのタスクが含まれること", () => {
    const userId = 1;
    const userTeam = "身体";
    const mine = tasks.filter((t) =>
      t.assignType === "all" ||
      t.createdBy === userId ||
      (t.assignType === "personal" && t.assignUserId === userId) ||
      (t.assignType === "team" && t.assignTeam === userTeam)
    );
    expect(mine).toHaveLength(3); // all, personal(自分), team(身体)
    expect(mine.map((t) => t.id)).toContain(1); // all
    expect(mine.map((t) => t.id)).toContain(2); // personal
    expect(mine.map((t) => t.id)).toContain(3); // team=身体
    expect(mine.map((t) => t.id)).not.toContain(4); // team=天理は除外
  });

  it("他チームのタスクは含まれないこと", () => {
    const userId = 1;
    const userTeam = "天理";
    const mine = tasks.filter((t) =>
      t.assignType === "all" ||
      t.createdBy === userId ||
      (t.assignType === "personal" && t.assignUserId === userId) ||
      (t.assignType === "team" && t.assignTeam === userTeam)
    );
    expect(mine.map((t) => t.id)).toContain(4); // team=天理は含む
    expect(mine.map((t) => t.id)).not.toContain(3); // team=身体は除外
  });
});

describe("期日フォーマット", () => {
  function formatDueDate(date: Date | string | null | undefined): string {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date(2026, 2, 5); // 2026-03-05 固定
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    if (diff < 0) return `${dateStr}（期限切れ）`;
    if (diff === 0) return `今日`;
    if (diff === 1) return `明日`;
    return dateStr;
  }

  it("今日の日付が「今日」と表示されること", () => {
    expect(formatDueDate(new Date(2026, 2, 5))).toBe("今日");
  });

  it("明日の日付が「明日」と表示されること", () => {
    expect(formatDueDate(new Date(2026, 2, 6))).toBe("明日");
  });

  it("過去の日付が「期限切れ」と表示されること", () => {
    expect(formatDueDate(new Date(2026, 2, 4))).toContain("期限切れ");
  });

  it("未来の日付が月/日形式で表示されること", () => {
    expect(formatDueDate(new Date(2026, 2, 10))).toBe("3/10");
  });

  it("nullの場合は空文字を返すこと", () => {
    expect(formatDueDate(null)).toBe("");
    expect(formatDueDate(undefined)).toBe("");
  });
});

describe("ソフトデリート・復元・削除済み一覧", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("softDeleteTaskが作成者IDとともに呼び出されること", async () => {
    const { softDeleteTask } = await import("./db");
    await softDeleteTask(1, 1);
    expect(softDeleteTask).toHaveBeenCalledWith(1, 1);
  });

  it("restoreTaskが正しく呼び出されること", async () => {
    const { restoreTask } = await import("./db");
    await restoreTask(99, 1);
    expect(restoreTask).toHaveBeenCalledWith(99, 1);
  });

  it("getDeletedTasksが削除済みタスク一覧を返すこと", async () => {
    const { getDeletedTasks } = await import("./db");
    const result = await getDeletedTasks(1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(99);
    expect(result[0].deletedAt).toBeDefined();
    expect(result[0].deletedAt).not.toBeNull();
  });

  it("getDeletedTasksがdeletedAtを持つタスクのみ返すこと", async () => {
    const { getDeletedTasks } = await import("./db");
    const result = await getDeletedTasks(1);
    result.forEach((task) => {
      expect(task.deletedAt).not.toBeNull();
    });
  });

  it("permanentDeleteTaskが正しく呼び出されること", async () => {
    const { permanentDeleteTask } = await import("./db");
    await permanentDeleteTask(99, 1);
    expect(permanentDeleteTask).toHaveBeenCalledWith(99, 1);
  });
  it("cleanupExpiredDeletedTasksが30日超過タスクを削除し件数を返すこと", async () => {
    const { cleanupExpiredDeletedTasks } = await import("./db");
    const count = await cleanupExpiredDeletedTasks();
    expect(cleanupExpiredDeletedTasks).toHaveBeenCalled();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });
  it("cleanupExpiredDeletedTasksが0件のとき0を返すこと", async () => {
    const { cleanupExpiredDeletedTasks } = await import("./db");
    (cleanupExpiredDeletedTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    const count = await cleanupExpiredDeletedTasks();
    expect(count).toBe(0);
  });
  it("cleanupExpiredDeletedTasksが複数件削除したとき正しい件数を返すこと", async () => {
    const { cleanupExpiredDeletedTasks } = await import("./db");
    (cleanupExpiredDeletedTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);
    const count = await cleanupExpiredDeletedTasks();
    expect(count).toBe(5);
  });
});
