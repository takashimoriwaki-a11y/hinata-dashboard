/** 日付の時刻部分を除いたローカル日付 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type TaskDueCheckInput = {
  dueDate?: Date | string | null;
  repeatType?: string | null;
  repeatDayOfWeek?: number | null;
  repeatDayOfMonth?: number | null;
};

/**
 * 利用者タスク（tasks テーブル）が指定日に「今日のタスク」として表示すべきか判定する。
 * - 繰り返し weekly/monthly: 該当曜日・日付のみ表示（開始日より前は非表示）
 * - 繰り返しなし: 期日なしは常に表示、期日ありはその日以前に表示
 */
export function isTaskDueOnDate(task: TaskDueCheckInput, today: Date): boolean {
  if (task.repeatType === "weekly") {
    if (task.repeatDayOfWeek == null) return false;
    if (today.getDay() !== task.repeatDayOfWeek) return false;
    if (task.dueDate) {
      const first = startOfDay(new Date(task.dueDate));
      if (today < first) return false;
    }
    return true;
  }

  if (task.repeatType === "monthly") {
    if (task.repeatDayOfMonth == null) return false;
    if (today.getDate() !== task.repeatDayOfMonth) return false;
    if (task.dueDate) {
      const first = startOfDay(new Date(task.dueDate));
      if (today < first) return false;
    }
    return true;
  }

  if (!task.dueDate) return true;
  const target = startOfDay(new Date(task.dueDate));
  return target.getTime() <= today.getTime();
}
