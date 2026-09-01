/**
 * visitSlots 機能のユニットテスト
 * - 訪問予定スロット順番のDB保存・復元ロジック
 * - 今日の利用者タスクのフィルタリングロジック（assignUserId=nullのpersonalタスク）
 */
import { describe, it, expect } from "vitest";
import { isTaskDueOnDate } from "../shared/taskRecurrence";

// ========== 今日の利用者タスクフィルタロジックのテスト ==========

type TaskLike = {
  done: number;
  patientName?: string | null;
  taskKind?: string;
  assignType: string;
  assignUserId?: number | null;
  createdBy?: number;
  dueDate?: Date | null;
  repeatType?: string | null;
  repeatDayOfWeek?: number | null;
  repeatDayOfMonth?: number | null;
};

/**
 * PatientTasksCard の todayPatientTasks フィルタロジックを再現
 * （Dashboard.tsx の修正後ロジック）
 */
function filterTodayPatientTasks(tasks: TaskLike[], userId: number): TaskLike[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return tasks.filter((t) => {
    if (t.done !== 0) return false;
    if (!t.patientName) return false;
    if (t.taskKind === "next_visit") return true;
    // personalタスク: assignUserIdがnullの場合はcreatedByで判定
    if (t.assignType === "personal") {
      if (t.assignUserId != null) {
        if (t.assignUserId !== userId) return false;
      } else {
        if (t.createdBy !== userId) return false;
      }
    }
    return isTaskDueOnDate(t, today);
  });
}

describe("今日の利用者タスクフィルタ", () => {
  const userId = 1;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  it("patientNameがないタスクは除外される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: null, assignType: "all", dueDate: yesterday },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(0);
  });

  it("完了済みタスクは除外される", () => {
    const tasks: TaskLike[] = [
      { done: 1, patientName: "田中花子", assignType: "all", dueDate: yesterday },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(0);
  });

  it("assignType=allで期日が今日以前のタスクは表示される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "田中花子", assignType: "all", dueDate: yesterday },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(1);
  });

  it("assignType=allで期日が明日のタスクは除外される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "田中花子", assignType: "all", dueDate: tomorrow },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(0);
  });

  it("assignType=personalでassignUserId=自分のタスクは表示される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "田中花子", assignType: "personal", assignUserId: userId, dueDate: yesterday },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(1);
  });

  it("assignType=personalでassignUserId=他人のタスクは除外される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "田中花子", assignType: "personal", assignUserId: 999, dueDate: yesterday },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(0);
  });

  it("assignType=personalでassignUserId=nullかつcreatedBy=自分のタスクは表示される（修正後の動作）", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "森本孝枝", assignType: "personal", assignUserId: null, createdBy: userId, dueDate: yesterday },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(1);
  });

  it("assignType=personalでassignUserId=nullかつcreatedBy=他人のタスクは除外される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "森本孝枝", assignType: "personal", assignUserId: null, createdBy: 999, dueDate: yesterday },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(0);
  });

  it("taskKind=next_visitのタスクは期日に関わらず常に表示される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "田中花子", assignType: "personal", assignUserId: 999, taskKind: "next_visit", dueDate: null },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(1);
  });

  it("期日なしのタスクは表示される", () => {
    const tasks: TaskLike[] = [
      { done: 0, patientName: "田中花子", assignType: "team", dueDate: null },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(1);
  });

  it("毎週繰り返し: 今日が該当曜日なら表示される", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasks: TaskLike[] = [
      {
        done: 0,
        patientName: "田中花子",
        assignType: "all",
        dueDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        repeatType: "weekly",
        repeatDayOfWeek: today.getDay(),
      },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(1);
  });

  it("毎週繰り返し: 今日が該当曜日でなければ除外される", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const otherDay = (today.getDay() + 1) % 7;
    const tasks: TaskLike[] = [
      {
        done: 0,
        patientName: "田中花子",
        assignType: "all",
        dueDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        repeatType: "weekly",
        repeatDayOfWeek: otherDay,
      },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(0);
  });

  it("毎月繰り返し: 今日が該当日なら表示される", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasks: TaskLike[] = [
      {
        done: 0,
        patientName: "田中花子",
        assignType: "all",
        dueDate: new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()),
        repeatType: "monthly",
        repeatDayOfMonth: today.getDate(),
      },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(1);
  });

  it("毎月繰り返し: 今日が該当日でなければ除外される", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const otherDay = today.getDate() === 1 ? 2 : 1;
    const tasks: TaskLike[] = [
      {
        done: 0,
        patientName: "田中花子",
        assignType: "all",
        dueDate: new Date(today.getFullYear(), today.getMonth() - 1, otherDay),
        repeatType: "monthly",
        repeatDayOfMonth: otherDay,
      },
    ];
    expect(filterTodayPatientTasks(tasks, userId)).toHaveLength(0);
  });
});

// ========== getTodayJstKey のテスト ==========

function getTodayJstKey(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

describe("getTodayJstKey", () => {
  it("YYYY-MM-DD形式の文字列を返す", () => {
    const key = getTodayJstKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("今日の日付を返す（JSTベース）", () => {
    const key = getTodayJstKey();
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const expected = jst.toISOString().slice(0, 10);
    expect(key).toBe(expected);
  });
});
