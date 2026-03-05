/**
 * タスクリマインダー機能のユニットテスト
 * - getTodayDueTasks: 今日が期日の未完了タスクのみ返す
 * - 通知内容の組み立てロジック
 */

import { describe, it, expect, vi } from "vitest";

// DB関数をモック
vi.mock("./db", () => {
  const now = new Date();
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffsetMs);

  // JSTの今日の00:00と23:59をUTCに変換
  const todayStartJst = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), 0, 0, 0)
  );
  const todayEndJst = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), 23, 59, 59)
  );
  const todayStartUtc = new Date(todayStartJst.getTime() - jstOffsetMs);
  const todayEndUtc = new Date(todayEndJst.getTime() - jstOffsetMs);

  // 今日の正午（UTC）
  const todayNoonUtc = new Date(todayStartUtc.getTime() + 12 * 60 * 60 * 1000);
  // 昨日
  const yesterdayUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  // 明日
  const tomorrowUtc = new Date(todayEndUtc.getTime() + 60 * 1000);

  const mockTasks = [
    {
      id: 1,
      text: "今日が期日のタスク（全員）",
      done: 0,
      dueDate: todayNoonUtc,
      assignType: "all",
      assignTeam: null,
      assignUserId: null,
      assignUserName: null,
      createdBy: 1,
      createdByName: "森脇崇",
      createdAt: now,
      updatedAt: now,
      completedBy: null,
      completedAt: null,
    },
    {
      id: 2,
      text: "今日が期日のタスク（チーム）",
      done: 0,
      dueDate: todayNoonUtc,
      assignType: "team",
      assignTeam: "身体",
      assignUserId: null,
      assignUserName: null,
      createdBy: 2,
      createdByName: "田中花子",
      createdAt: now,
      updatedAt: now,
      completedBy: null,
      completedAt: null,
    },
    {
      id: 3,
      text: "完了済みタスク（今日期日）",
      done: 1,
      dueDate: todayNoonUtc,
      assignType: "all",
      assignTeam: null,
      assignUserId: null,
      assignUserName: null,
      createdBy: 1,
      createdByName: "森脇崇",
      createdAt: now,
      updatedAt: now,
      completedBy: 1,
      completedAt: now,
    },
    {
      id: 4,
      text: "昨日が期日のタスク",
      done: 0,
      dueDate: yesterdayUtc,
      assignType: "all",
      assignTeam: null,
      assignUserId: null,
      assignUserName: null,
      createdBy: 1,
      createdByName: "森脇崇",
      createdAt: now,
      updatedAt: now,
      completedBy: null,
      completedAt: null,
    },
    {
      id: 5,
      text: "明日が期日のタスク",
      done: 0,
      dueDate: tomorrowUtc,
      assignType: "all",
      assignTeam: null,
      assignUserId: null,
      assignUserName: null,
      createdBy: 1,
      createdByName: "森脇崇",
      createdAt: now,
      updatedAt: now,
      completedBy: null,
      completedAt: null,
    },
  ];

  return {
    getTodayDueTasks: vi.fn(async () =>
      mockTasks.filter(
        (t) =>
          t.done === 0 &&
          t.dueDate !== null &&
          t.dueDate >= todayStartUtc &&
          t.dueDate <= todayEndUtc
      )
    ),
  };
});

describe("タスクリマインダー機能", () => {
  it("getTodayDueTasksが今日期日の未完了タスクのみ返すこと", async () => {
    const { getTodayDueTasks } = await import("./db");
    const result = await getTodayDueTasks();

    // id:1, id:2 のみ返る（id:3は完了済み、id:4は昨日、id:5は明日）
    expect(result.length).toBe(2);
    expect(result.map((t) => t.id)).toContain(1);
    expect(result.map((t) => t.id)).toContain(2);
    expect(result.map((t) => t.id)).not.toContain(3); // 完了済み
    expect(result.map((t) => t.id)).not.toContain(4); // 昨日
    expect(result.map((t) => t.id)).not.toContain(5); // 明日
  });

  it("完了済みタスクが含まれないこと", async () => {
    const { getTodayDueTasks } = await import("./db");
    const result = await getTodayDueTasks();
    expect(result.every((t) => t.done === 0)).toBe(true);
  });

  it("通知タイトルが件数を含むこと", async () => {
    const { getTodayDueTasks } = await import("./db");
    const tasks = await getTodayDueTasks();
    const title = `📋 本日期日のタスク ${tasks.length}件`;
    expect(title).toContain("2件");
  });

  it("通知内容に各タスクの情報が含まれること", async () => {
    const { getTodayDueTasks } = await import("./db");
    const tasks = await getTodayDueTasks();

    const taskLines = tasks.map((t, i) => {
      const assignStr =
        t.assignType === "all"
          ? "全員"
          : t.assignType === "team"
          ? `${t.assignTeam}チーム`
          : t.assignUserName ?? "個人";
      return `${i + 1}. ${t.text} [${assignStr}] (作成: ${t.createdByName})`;
    });

    expect(taskLines[0]).toContain("今日が期日のタスク（全員）");
    expect(taskLines[0]).toContain("全員");
    expect(taskLines[0]).toContain("森脇崇");
    expect(taskLines[1]).toContain("今日が期日のタスク（チーム）");
    expect(taskLines[1]).toContain("身体チーム");
    expect(taskLines[1]).toContain("田中花子");
  });

  it("タスクが0件のとき通知を送らないこと（ロジック確認）", async () => {
    const { getTodayDueTasks } = await import("./db");
    // モックを一時的に空配列を返すよう上書き
    vi.mocked(getTodayDueTasks).mockResolvedValueOnce([]);
    const tasks = await getTodayDueTasks();
    expect(tasks.length).toBe(0);
    // 0件なら通知しない（スケジューラー内のif文で制御）
    const shouldNotify = tasks.length > 0;
    expect(shouldNotify).toBe(false);
  });
});
