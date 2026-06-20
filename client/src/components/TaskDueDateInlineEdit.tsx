/**
 * タスクの期日・種別のインライン編集
 * 訪問タブ・ホームなどの利用者タスク表示で共通利用
 */
import { useState, useEffect } from "react";
import { Pencil, Check, X, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TaskKind = "at_time" | "by_deadline" | "next_visit";

type Props = {
  taskId: number;
  dueDate: Date | string | null | undefined;
  taskKind?: TaskKind | string | null;
  className?: string;
  onSuccess?: () => void;
  disabled?: boolean;
};

const KIND_OPTIONS = [
  { value: "at_time" as const, label: "📅 この日時に" },
  { value: "by_deadline" as const, label: "⏳ この日時まで" },
  { value: "next_visit" as const, label: "🏥 次回訪問時" },
];

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDueDateDisplay(date: Date | string): string {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString("ja-JP");
  const timeStr = d.getHours() !== 0 || d.getMinutes() !== 0
    ? ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";
  return `${dateStr}${timeStr}`;
}

function normalizeTaskKind(taskKind?: TaskKind | string | null): TaskKind {
  if (taskKind === "at_time" || taskKind === "by_deadline" || taskKind === "next_visit") {
    return taskKind;
  }
  return "by_deadline";
}

export function TaskDueDateInlineEdit({
  taskId,
  dueDate,
  taskKind,
  className,
  onSuccess,
  disabled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const normalizedKind = normalizeTaskKind(taskKind);
  const [editTaskKind, setEditTaskKind] = useState<TaskKind>(normalizedKind);
  const [editDueDate, setEditDueDate] = useState(toDateInputValue(dueDate));
  const [editDueTime, setEditDueTime] = useState(toTimeInputValue(dueDate));
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!editing) {
      setEditTaskKind(normalizeTaskKind(taskKind));
      setEditDueDate(toDateInputValue(dueDate));
      setEditDueTime(toTimeInputValue(dueDate));
    }
  }, [dueDate, taskKind, editing]);

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      utils.tasks.getByPatientName.invalidate();
      onSuccess?.();
      toast.success("期日を更新しました");
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    let nextDueDate: Date | null;
    if (editTaskKind === "next_visit") {
      nextDueDate = null;
    } else if (editDueDate) {
      const dateTimeStr = editDueTime ? `${editDueDate}T${editDueTime}` : `${editDueDate}T00:00`;
      nextDueDate = new Date(dateTimeStr);
    } else {
      nextDueDate = null;
    }

    const currentDueDate = dueDate ? new Date(dueDate).getTime() : null;
    const nextDueDateTime = nextDueDate?.getTime() ?? null;
    const kindChanged = editTaskKind !== normalizedKind;
    const dateChanged = nextDueDateTime !== currentDueDate;

    if (!kindChanged && !dateChanged) {
      setEditing(false);
      return;
    }

    updateTask.mutate({
      id: taskId,
      dueDate: nextDueDate,
      taskKind: editTaskKind,
    });
  };

  const handleCancel = () => {
    setEditTaskKind(normalizedKind);
    setEditDueDate(toDateInputValue(dueDate));
    setEditDueTime(toTimeInputValue(dueDate));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={cn("mt-1 space-y-2", className)}>
        <div className="flex flex-wrap gap-1">
          {KIND_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setEditTaskKind(value)}
              className={cn(
                "text-[10px] px-2 py-1 rounded-full border transition-colors",
                editTaskKind === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {editTaskKind !== "next_visit" && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="time"
              step="600"
              value={editDueTime}
              onChange={(e) => setEditDueTime(e.target.value)}
              disabled={!editDueDate}
              className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
            />
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={updateTask.isPending}
            className="p-1 text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-40"
            title="保存"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={updateTask.isPending}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
            title="キャンセル"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 mt-0.5 group/due", className)}>
      {normalizedKind === "next_visit" && !dueDate ? (
        <span className="inline-block text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
          🏥 次回訪問時
        </span>
      ) : dueDate ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>期日: {formatDueDateDisplay(dueDate)}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">期日なし</p>
      )}
      {!disabled && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-primary opacity-70 sm:opacity-0 sm:group-hover/due:opacity-100 focus:opacity-100 transition-opacity"
          title="期日を編集"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
