/**
 * PersonalTasks - 個人タスク管理ページ
 * - 自分宛てのタスク（assignType=personal, assignUserId=自分）
 * - 自分が作成した全員・チーム向けタスク
 * - 他スタッフが自分に指定して作成したタスク
 * - 全員向け・チーム向けタスクの一括作成
 * - taskKind: at_time（この日時にする）/ by_deadline（この日時まで）を区別表示
 * - 期日順（直近から）で表示
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { Task } from "../../../drizzle/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  Plus,
  Calendar,
  Clock,
  User,
  Users,
  Globe,
  Trash2,
  ChevronDown,
  ChevronUp,
  UserRound,
  ClipboardList,
  AlertCircle,
  Timer,
  CalendarCheck,
} from "lucide-react";
import TaskCreateForm from "@/components/TaskCreateForm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";

type TaskKind = "at_time" | "by_deadline";

/** 期日表示ヘルパー */
function formatDueDate(date: Date | null | undefined, taskKind: TaskKind): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((taskDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const timeStr = hasTime
    ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日${timeStr}`;

  if (diffDays === 0) return `今日${timeStr}`;
  if (diffDays === 1) return `明日${timeStr}`;
  if (diffDays === -1) return `昨日${timeStr}（期限切れ）`;
  if (diffDays < 0) return `${dateStr}（${Math.abs(diffDays)}日超過）`;
  if (diffDays <= 7) return `${dateStr}（あと${diffDays}日）`;
  return dateStr;
}

/** 期日の緊急度に応じた色クラス */
function getDueDateColor(date: Date | null | undefined, done: boolean): string {
  if (done) return "text-muted-foreground";
  if (!date) return "text-muted-foreground";
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((taskDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-red-600 dark:text-red-400 font-semibold";
  if (diffDays === 0) return "text-orange-600 dark:text-orange-400 font-semibold";
  if (diffDays <= 3) return "text-yellow-600 dark:text-yellow-400";
  return "text-muted-foreground";
}

/** 指定先バッジ */
function AssignBadge({ task }: { task: Task }) {
  if (task.assignType === "all") {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 gap-0.5 border-green-400 text-green-700 dark:text-green-300">
        <Globe className="w-2.5 h-2.5" />全員
      </Badge>
    );
  }
  if (task.assignType === "team") {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 gap-0.5 border-blue-400 text-blue-700 dark:text-blue-300">
        <Users className="w-2.5 h-2.5" />{task.assignTeam}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs px-1.5 py-0 gap-0.5 border-purple-400 text-purple-700 dark:text-purple-300">
      <User className="w-2.5 h-2.5" />{task.assignUserName ?? "個人"}
    </Badge>
  );
}

/** タスクカード */
function TaskCard({
  task,
  onToggle,
  onDelete,
  currentUserId,
}: {
  task: Task;
  onToggle: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
  currentUserId: number | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDone = task.done === 1;
  const taskKind: TaskKind = (task.taskKind as TaskKind) ?? "by_deadline";

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all",
        isDone
          ? "bg-muted/30 border-border/50 opacity-60"
          : taskKind === "at_time"
          ? "bg-orange-50/60 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
          : "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
      )}
    >
      <div className="flex items-start gap-2">
        {/* 完了チェックボタン */}
        <button
          type="button"
          onClick={() => onToggle(task.id, !isDone)}
          className={cn(
            "flex-shrink-0 mt-0.5 transition-colors",
            isDone ? "text-green-500" : "text-muted-foreground hover:text-primary"
          )}
        >
          {isDone ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        {/* タスク内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className={cn("text-sm leading-snug", isDone && "line-through text-muted-foreground")}>
              {task.text}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* 期日・種別バッジ行 */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* タスク種別バッジ */}
            {taskKind === "at_time" ? (
              <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 font-medium">
                <CalendarCheck className="w-3 h-3" />この日時に
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
                <Timer className="w-3 h-3" />この日時まで
              </span>
            )}

            {/* 期日 */}
            {task.dueDate && (
              <span className={cn("text-xs flex items-center gap-0.5", getDueDateColor(task.dueDate, isDone))}>
                <Clock className="w-3 h-3" />
                {formatDueDate(task.dueDate, taskKind)}
              </span>
            )}

            {/* 利用者名 */}
            {task.patientName && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <UserRound className="w-3 h-3" />{task.patientName}
              </span>
            )}
          </div>

          {/* 展開時の詳細 */}
          {expanded && (
            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <AssignBadge task={task} />
                <span className="text-xs text-muted-foreground">
                  作成：{task.createdByName}
                </span>
              </div>
              {task.createdBy === currentUserId && !isDone && (
                <button
                  type="button"
                  onClick={() => onDelete(task.id)}
                  className="flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive transition-colors mt-1"
                >
                  <Trash2 className="w-3 h-3" />削除
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PersonalTasks() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // 自分のタスク一覧（getMine: 自分に関係する全タスク）
  const { data: tasks = [], isLoading } = trpc.tasks.getMine.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // 完了トグル
  const toggleMutation = trpc.tasks.toggle.useMutation({
    onMutate: async ({ id, done }) => {
      await utils.tasks.getMine.cancel();
      const prev = utils.tasks.getMine.getData();
      utils.tasks.getMine.setData(undefined, (old) =>
        old?.map((t) => (t.id === id ? { ...t, done: done ? 1 : 0 } : t))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.tasks.getMine.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.tasks.getMine.invalidate(),
  });

  // 削除
  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      toast.success("タスクを削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // 個人タスク（自分宛て）と全体タスクを分けて期日順にソート
  const { myPersonalTasks, otherTasks, overdueTasks } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const active = tasks.filter((t) => t.done === 0 && !t.deletedAt);
    const completed = tasks.filter((t) => t.done === 1 && !t.deletedAt);

    // 期日順ソート（期日なしは末尾）
    const sortByDue = (a: Task, b: Task) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    };

    // 期限切れタスク（期日が今日より前）
    const overdue = active.filter((t) => {
      if (!t.dueDate) return false;
      const taskDay = new Date(new Date(t.dueDate).getFullYear(), new Date(t.dueDate).getMonth(), new Date(t.dueDate).getDate());
      return taskDay < today;
    }).sort(sortByDue);

    // 自分宛て個人タスク（期限切れ以外）
    const myPersonal = active.filter((t) => {
      if (!t.dueDate) return t.assignType === "personal" && t.assignUserId === user?.id;
      const taskDay = new Date(new Date(t.dueDate).getFullYear(), new Date(t.dueDate).getMonth(), new Date(t.dueDate).getDate());
      return taskDay >= today && t.assignType === "personal" && t.assignUserId === user?.id;
    }).sort(sortByDue);

    // その他（全員・チーム向け）（期限切れ以外）
    const other = active.filter((t) => {
      if (!t.dueDate) return t.assignType !== "personal" || t.assignUserId !== user?.id;
      const taskDay = new Date(new Date(t.dueDate).getFullYear(), new Date(t.dueDate).getMonth(), new Date(t.dueDate).getDate());
      return taskDay >= today && (t.assignType !== "personal" || t.assignUserId !== user?.id);
    }).sort(sortByDue);

    return {
      myPersonalTasks: myPersonal,
      otherTasks: other,
      overdueTasks: overdue,
      completedTasks: completed.sort((a, b) => {
        if (!a.completedAt && !b.completedAt) return 0;
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      }),
    };
  }, [tasks, user?.id]);

  const completedTasks = useMemo(() => {
    return tasks
      .filter((t) => t.done === 1 && !t.deletedAt)
      .sort((a, b) => {
        if (!a.completedAt && !b.completedAt) return 0;
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      });
  }, [tasks]);

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">

        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">個人タスク</h1>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreateForm((v) => !v)}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            {showCreateForm ? "閉じる" : "タスクを追加"}
          </Button>
        </div>

        {/* タスク作成フォーム */}
        {showCreateForm && (
          <TaskCreateForm
            onClose={() => setShowCreateForm(false)}
            onSuccess={() => setShowCreateForm(false)}
          />
        )}

        {/* 凡例 */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-orange-400" />
            この日時に
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-400" />
            この日時まで
          </span>
        </div>

        {isLoading && (
          <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
        )}

        {/* 期限切れタスク */}
        {overdueTasks.length > 0 && (
          <Card className="border-red-300 dark:border-red-800">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                期限切れ（{overdueTasks.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-3">
              {overdueTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={(id, done) => toggleMutation.mutate({ id, done })}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                  currentUserId={user?.id}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* 自分宛て個人タスク */}
        <Card>
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <User className="w-4 h-4 text-purple-500" />
              自分宛てのタスク
              {myPersonalTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{myPersonalTasks.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            {myPersonalTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">自分宛てのタスクはありません</p>
            ) : (
              myPersonalTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={(id, done) => toggleMutation.mutate({ id, done })}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                  currentUserId={user?.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* 全員・チーム向けタスク */}
        <Card>
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-green-500" />
              全員・チーム向けタスク
              {otherTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{otherTasks.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            {otherTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">全員・チーム向けのタスクはありません</p>
            ) : (
              otherTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={(id, done) => toggleMutation.mutate({ id, done })}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                  currentUserId={user?.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* 完了済みタスク */}
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            完了済み（{completedTasks.length}件）
          </button>
          {showCompleted && completedTasks.length > 0 && (
            <div className="mt-2 space-y-2">
              {completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={(id, done) => toggleMutation.mutate({ id, done })}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                  currentUserId={user?.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
