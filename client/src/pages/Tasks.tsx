/**
 * Tasks - タスク管理ページ（DB連携版）
 * - 重要度なし
 * - 期日（日時）設定あり
 * - 作成者名自動付与
 * - 個人指定 / チーム指定 / 全員 の3種類
 * - 自分に関係するタスクのみ表示
 * - 作成者のみ編集・削除可能
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckSquare,
  Plus,
  Circle,
  CheckCircle2,
  Trash2,
  Calendar,
  User,
  Users,
  Globe,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Check,
} from "lucide-react";
import TaskCreateForm from "@/components/TaskCreateForm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";

type AssignType = "all" | "team" | "personal";

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

// 期日の表示フォーマット
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
function formatDueDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const wday = WEEKDAYS[d.getDay()];
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日（${wday}）`;
  const timeStr = d.getHours() !== 0 || d.getMinutes() !== 0
    ? ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";

  if (diff < 0) return `${dateStr}${timeStr}（期限切れ）`;
  if (diff === 0) return `今日（${wday}）${timeStr}`;
  if (diff === 1) return `明日（${wday}）${timeStr}`;
  return `${dateStr}${timeStr}`;
}

function getDueDateColor(date: Date | string | null | undefined): string {
  if (!date) return "text-muted-foreground";
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "text-red-600 font-semibold";
  if (diff === 0) return "text-orange-600 font-semibold";
  if (diff <= 2) return "text-amber-600";
  return "text-muted-foreground";
}

// 指定先バッジ
function AssignBadge({ task }: { task: { assignType: string; assignTeam?: string | null; assignUserName?: string | null } }) {
  if (task.assignType === "all") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Globe className="w-3 h-3" />全員
      </span>
    );
  }
  if (task.assignType === "team") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-primary">
        <Users className="w-3 h-3" />{task.assignTeam}チーム
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-primary/80">
      <User className="w-3 h-3" />{task.assignUserName ?? "個人"}
    </span>
  );
}

// 日付をinput[type=date]用の文字列に変換
function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 時刻をinput[type=time]用の文字列に変換
function toTimeInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Tasks() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // タスク一覧取得
  const { data: tasks = [], isLoading } = trpc.tasks.getMine.useQuery();

  // スタッフ一覧（個人指定用）
  const { data: staff = [] } = trpc.tasks.getStaff.useQuery();

  // フィルター
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");

  // 新規作成フォームの開閉
  const [showForm, setShowForm] = useState(false);



  // 編集中のタスクID
  const [editingId, setEditingId] = useState<number | null>(null);
  // 編集フォームの状態
  const [editText, setEditText] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editAssignType, setEditAssignType] = useState<AssignType>("all");
  const [editAssignTeam, setEditAssignTeam] = useState<Team>("身体");
  const [editAssignUserId, setEditAssignUserId] = useState<number | null>(null);
  const [editAssignUserName, setEditAssignUserName] = useState<string>("");



  // タスク完了切り替え
  const toggleTask = trpc.tasks.toggle.useMutation({
    onMutate: async ({ id, done }) => {
      await utils.tasks.getMine.cancel();
      const prev = utils.tasks.getMine.getData();
      utils.tasks.getMine.setData(undefined, (old) =>
        old?.map((t) => t.id === id ? { ...t, done: done ? 1 : 0 } : t)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.tasks.getMine.setData(undefined, ctx.prev);
      toast.error("更新に失敗しました");
    },
    onSettled: () => utils.tasks.getMine.invalidate(),
  });

  // タスク削除
  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      toast.success("タスクを削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // タスク更新
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      toast.success("タスクを更新しました");
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // 編集開始
  const startEdit = (task: typeof tasks[number]) => {
    setEditingId(task.id);
    setEditText(task.text);
    setEditDueDate(toDateInputValue(task.dueDate));
    setEditDueTime(toTimeInputValue(task.dueDate));
    setEditAssignType(task.assignType as AssignType);
    setEditAssignTeam((task.assignTeam as Team) ?? "身体");
    setEditAssignUserId(task.assignUserId ?? null);
    setEditAssignUserName(task.assignUserName ?? "");
  };

  // 編集保存
  const handleUpdate = () => {
    if (!editingId) return;
    if (!editText.trim()) {
      toast.error("タスクの内容を入力してください");
      return;
    }

    let dueDate: Date | null | undefined;
    if (editDueDate) {
      const dateTimeStr = editDueTime ? `${editDueDate}T${editDueTime}` : `${editDueDate}T00:00`;
      dueDate = new Date(dateTimeStr);
    } else {
      dueDate = null; // 期日クリア
    }

    updateTask.mutate({
      id: editingId,
      text: editText.trim(),
      dueDate,
      assignType: editAssignType,
      assignTeam: editAssignType === "team" ? editAssignTeam : null,
      assignUserId: editAssignType === "personal" && editAssignUserId ? editAssignUserId : null,
      assignUserName: editAssignType === "personal" ? editAssignUserName : null,
    });
  };

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "active") return t.done === 0;
      if (filter === "done") return t.done === 1;
      return true;
    });
  }, [tasks, filter]);

  const activeCount = tasks.filter((t) => t.done === 0).length;
  const doneCount = tasks.filter((t) => t.done === 1).length;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-2">
        <CheckSquare className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">タスク管理</h1>
        <Badge variant="secondary" className="ml-auto">{activeCount}件未完了</Badge>
      </div>

      {/* フィルター */}
      <div className="flex gap-2">
        {(["active", "all", "done"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className="h-7 text-xs px-3"
            onClick={() => setFilter(f)}
          >
            {f === "all"
              ? `すべて (${tasks.length})`
              : f === "active"
              ? `未完了 (${activeCount})`
              : `完了 (${doneCount})`}
          </Button>
        ))}
      </div>

      {/* タスク一覧 */}
      <Card className="shadow-sm">
        <CardContent className="p-3 space-y-1.5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {filter === "active" ? "未完了のタスクはありません" : "タスクはありません"}
            </p>
          ) : (
            filtered.map((task) => (
              <div key={task.id}>
                {editingId === task.id ? (
                  /* ===== インライン編集フォーム ===== */
                  <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                    {/* 内容 */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">内容 *</label>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      />
                    </div>

                    {/* 期日・時刻 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          <Calendar className="w-3 h-3 inline mr-0.5" />期日（任意）
                        </label>
                        <input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">時刻（任意）</label>
                        <input
                          type="time"
                          value={editDueTime}
                          onChange={(e) => setEditDueTime(e.target.value)}
                          disabled={!editDueDate}
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                        />
                      </div>
                    </div>

                    {/* 指定先 */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">指定先</label>
                      <div className="flex gap-2 mb-2">
                        {([
                          { value: "all", label: "全員", icon: Globe },
                          { value: "team", label: "チーム", icon: Users },
                          { value: "personal", label: "個人", icon: User },
                        ] as const).map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            onClick={() => setEditAssignType(value)}
                            className={cn(
                              "flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors flex-1 justify-center",
                              editAssignType === value
                                ? "bg-primary text-white border-primary"
                                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                            )}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </button>
                        ))}
                      </div>
                      {editAssignType === "team" && (
                        <div className="flex flex-wrap gap-1.5">
                          {TEAMS.map((team) => (
                            <button
                              key={team}
                              onClick={() => setEditAssignTeam(team)}
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                                editAssignTeam === team
                                  ? "bg-primary text-white border-primary"
                                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                              )}
                            >
                              {team}チーム
                            </button>
                          ))}
                        </div>
                      )}
                      {editAssignType === "personal" && (
                        <select
                          value={editAssignUserId ?? ""}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            setEditAssignUserId(id || null);
                            const found = staff.find((s) => s.id === id);
                            setEditAssignUserName(found?.name ?? "");
                          }}
                          className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">スタッフを選択...</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name ?? "名前なし"}{s.team ? ` (${s.team})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 保存・キャンセル */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="w-3.5 h-3.5 mr-1" />キャンセル
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-8"
                        onClick={handleUpdate}
                        disabled={updateTask.isPending || !editText.trim()}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {updateTask.isPending ? "保存中..." : "保存"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ===== 通常表示 ===== */
                  <div
                    className={cn(
                      "flex items-start gap-2.5 p-2.5 rounded-lg group transition-colors",
                      task.done ? "bg-muted/20" : "bg-card hover:bg-muted/30"
                    )}
                  >
                    {/* 完了チェック */}
                    <button
                      onClick={() => toggleTask.mutate({ id: task.id, done: task.done === 0 })}
                      className="flex-shrink-0 mt-0.5"
                    >
                      {task.done ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                    </button>

                    {/* タスク内容 */}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", task.done && "line-through text-muted-foreground")}>
                        {task.text}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        {/* 期日 */}
                        {task.dueDate && (
                          <span className={cn("flex items-center gap-0.5 text-[11px]", getDueDateColor(task.dueDate))}>
                            <Calendar className="w-3 h-3" />
                            {formatDueDate(task.dueDate)}
                          </span>
                        )}
                        {/* 指定先 */}
                        <AssignBadge task={task} />
                        {/* 繰り返しアイコン */}
                        {task.repeatType && task.repeatType !== "none" && (
                          <span className="text-[10px] text-primary/80 font-medium" title={
                            task.repeatType === "weekly"
                              ? `毎週${["\u65e5","\u6708","\u706b","\u6c34","\u6728","\u91d1","\u571f"][task.repeatDayOfWeek ?? 1]}曜日繰り返し`
                              : `毎月${task.repeatDayOfMonth ?? 1}日繰り返し`
                          }>
                            🔄 {task.repeatType === "weekly"
                              ? `毎週${["\u65e5","\u6708","\u706b","\u6c34","\u6728","\u91d1","\u571f"][task.repeatDayOfWeek ?? 1]}`
                              : `毎月${task.repeatDayOfMonth ?? 1}日`}
                          </span>
                        )}
                        {/* 作成者 */}
                        <span className="text-[10px] text-muted-foreground/70">
                          作成: {task.createdByName}
                        </span>
                      </div>
                    </div>

                    {/* 編集・削除ボタン（作成者のみ） */}
                    {task.createdBy === user?.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => startEdit(task)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="編集（作成者のみ）"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTask.mutate({ id: task.id })}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="削除（作成者のみ）"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 新規追加ボタン */}
      <button
        onClick={() => setShowForm((v) => !v)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-primary/30 text-primary hover:border-primary hover:bg-primary/5 transition-colors text-sm font-medium"
      >
        {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showForm ? "フォームを閉じる" : "新しいタスクを追加"}
      </button>

      {/* 新規追加フォーム（TaskCreateFormを共通利用） */}
      {showForm && (
        <TaskCreateForm
          onClose={() => setShowForm(false)}
          onSuccess={() => utils.tasks.getMine.invalidate()}
        />
      )}
    </div>
  );
}
