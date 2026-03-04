/**
 * Tasks - タスク管理ページ
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Plus, Circle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Priority = "high" | "medium" | "low";

interface Task {
  id: number;
  text: string;
  done: boolean;
  priority: Priority;
  category: string;
  dueDate?: string;
}

const initialTasks: Task[] = [
  { id: 1, text: "月次報告書の作成", done: false, priority: "high", category: "事務", dueDate: "2026-03-10" },
  { id: 2, text: "スタッフ面談（山田）", done: false, priority: "medium", category: "人事", dueDate: "2026-03-07" },
  { id: 3, text: "利用者ケアプラン更新（3名）", done: true, priority: "high", category: "看護", dueDate: "2026-03-05" },
  { id: 4, text: "研修資料の準備", done: false, priority: "low", category: "教育", dueDate: "2026-03-15" },
  { id: 5, text: "医療安全会議の議事録作成", done: false, priority: "medium", category: "事務", dueDate: "2026-03-08" },
];

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  high: { label: "急", className: "bg-red-100 text-red-700" },
  medium: { label: "中", className: "bg-amber-100 text-amber-700" },
  low: { label: "低", className: "bg-gray-100 text-gray-600" },
};

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  const toggleTask = (id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const deleteTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast.success("タスクを削除しました");
  };

  const addTask = () => {
    if (!newText.trim()) return;
    setTasks((prev) => [
      ...prev,
      { id: Date.now(), text: newText, done: false, priority: newPriority, category: "その他" },
    ]);
    setNewText("");
    toast.success("タスクを追加しました");
  };

  const filtered = tasks.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  const activeCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <CheckSquare className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">タスク管理</h1>
        <Badge variant="secondary" className="ml-auto">{activeCount}件未完了</Badge>
      </div>

      {/* フィルター */}
      <div className="flex gap-2">
        {(["all", "active", "done"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className="h-7 text-xs px-3"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? `すべて (${tasks.length})` : f === "active" ? `未完了 (${activeCount})` : `完了 (${doneCount})`}
          </Button>
        ))}
      </div>

      {/* タスク一覧 */}
      <Card className="shadow-sm">
        <CardContent className="p-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">タスクはありません</p>
          ) : (
            filtered.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-2.5 p-2.5 rounded-lg group transition-colors",
                  task.done ? "bg-muted/20" : "bg-white hover:bg-muted/30"
                )}
              >
                <button onClick={() => toggleTask(task.id)} className="flex-shrink-0">
                  {task.done ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", task.done && "line-through text-muted-foreground")}>
                    {task.text}
                  </p>
                  {task.dueDate && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">期限: {task.dueDate}</p>
                  )}
                </div>
                <Badge className={cn("text-[10px] h-4 px-1.5 border-0 flex-shrink-0", priorityConfig[task.priority].className)}>
                  {priorityConfig[task.priority].label}
                </Badge>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 新規追加 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1">
            <Plus className="w-4 h-4" />
            新しいタスクを追加
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <input
            type="text"
            placeholder="タスクの内容を入力..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <div className="flex gap-1">
              {(["high", "medium", "low"] as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setNewPriority(p)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border transition-colors",
                    newPriority === p
                      ? `${priorityConfig[p].className} border-transparent`
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {priorityConfig[p].label}
                </button>
              ))}
            </div>
            <Button size="sm" className="ml-auto" onClick={addTask}>
              追加
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
