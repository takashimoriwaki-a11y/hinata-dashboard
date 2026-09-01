/**
 * タスク内容（text）のインライン編集
 * 個人タスク・利用者タスクの表示箇所で共通利用
 */
import { useState, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TaskType = "patient" | "personal";

type Props = {
  taskId: number;
  text: string;
  taskType: TaskType;
  className?: string;
  textClassName?: string;
  onSuccess?: () => void;
  disabled?: boolean;
};

export function TaskTextInlineEdit({
  taskId,
  text,
  taskType,
  className,
  textClassName,
  onSuccess,
  disabled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!editing) setEditText(text);
  }, [text, editing]);

  const patientUpdate = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      utils.tasks.getAll.invalidate();
      onSuccess?.();
      toast.success("タスクを更新しました");
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const personalUpdate = trpc.personalTasks.update.useMutation({
    onSuccess: () => {
      utils.personalTasks.getMyTasks.invalidate();
      utils.personalTasks.getTodayTasks.invalidate();
      onSuccess?.();
      toast.success("タスクを更新しました");
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending = patientUpdate.isPending || personalUpdate.isPending;

  const handleSave = () => {
    const trimmed = editText.trim();
    if (!trimmed) {
      toast.error("タスクの内容を入力してください");
      return;
    }
    if (trimmed === text) {
      setEditing(false);
      return;
    }
    if (taskType === "patient") {
      patientUpdate.mutate({ id: taskId, text: trimmed });
    } else {
      personalUpdate.mutate({ id: taskId, text: trimmed });
    }
  };

  if (editing) {
    return (
      <div className={cn("flex items-start gap-1 flex-1 min-w-0", className)}>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={2}
          autoFocus
          className="flex-1 min-w-0 text-sm border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") {
              setEditText(text);
              setEditing(false);
            }
          }}
        />
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !editText.trim()}
            className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-40"
            title="保存"
          >
            <Check className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => { setEditText(text); setEditing(false); }}
            disabled={isPending}
            className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors"
            title="キャンセル"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-1 flex-1 min-w-0 group/edit", className)}>
      <span className={cn("text-sm block leading-snug flex-1 min-w-0", textClassName)}>{text}</span>
      {!disabled && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-shrink-0 p-1 text-muted-foreground hover:text-primary opacity-70 sm:opacity-0 sm:group-hover/edit:opacity-100 focus:opacity-100 transition-opacity"
          title="内容を編集"
        >
          <Pencil className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
