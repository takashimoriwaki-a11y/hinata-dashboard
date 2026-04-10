/**
 * Tasks - タスク管理ページ（DB連携版）
 * - 重要度なし
 * - 期日（日時）設定あり
 * - 作成者名自動付与
 * - 個人指定 / チーム指定 / 全員 の3種類
 * - 自分に関係するタスクのみ表示
 * - 作成者のみ編集・削除可能
 */
import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import type { Task } from "../../../drizzle/schema";
import { Card, CardContent } from "@/components/ui/card";
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
  UserRound,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  History,
  AlertTriangle,
} from "lucide-react";
import TaskCreateForm from "@/components/TaskCreateForm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";
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
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <Globe className="w-3 h-3" />全員
      </span>
    );
  }
  if (task.assignType === "team") {
    return (
      <span className="flex items-center gap-0.5 text-xs text-primary">
        <Users className="w-3 h-3" />{task.assignTeam}チーム
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-primary/80">
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

// 日付フィルターの種類
type DateFilter = "all" | "overdue" | "today" | "tomorrow" | "this_week" | "no_date";

// チームフィルターの種類（null = 全員）
type TeamFilter = Team | "all_team" | "personal" | null;

// 並び替えキー
type SortKey = "dueDate" | "createdAt" | "assignType";
type SortDir = "asc" | "desc";

// 指定先の並び順（all < team < personal）
const ASSIGN_ORDER: Record<string, number> = { all: 0, team: 1, personal: 2 };

export default function Tasks() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // タスク一覧取得
  const { data: tasks = [], isLoading } = trpc.tasks.getMine.useQuery(undefined, {
    refetchInterval: 15 * 1000, // 15秒ごとに自動更新（他職員のタスクをリアルタイム反映）
    staleTime: 0,
  });

  // スタッフ一覧（個人指定用）
  const { data: staff = [] } = trpc.tasks.getStaff.useQuery();

  // 完了フィルター（デフォルト: 未完了）
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");

  // 日付フィルター
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  // チームフィルター（localStorage永続化）
  const VALID_TEAMS: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
  const VALID_TEAM_FILTERS = [...VALID_TEAMS, "all_team", "personal"] as const;
  const [teamFilter, setTeamFilterRaw] = useState<TeamFilter>(() => {
    try {
      const saved = localStorage.getItem("tasks_teamFilter");
      if (saved && (VALID_TEAM_FILTERS as readonly string[]).includes(saved)) return saved as TeamFilter;
    } catch {}
    return null;
  });

  const setTeamFilter = (value: TeamFilter) => {
    setTeamFilterRaw(value);
    try {
      if (value === null) localStorage.removeItem("tasks_teamFilter");
      else localStorage.setItem("tasks_teamFilter", value);
      // ホーム画面のフィルター状態をリアルタイム同期するためカスタムイベントを発火
      window.dispatchEvent(new CustomEvent("tasks_teamFilter_changed", { detail: value }));
    } catch {}
  };

  // localStorageに保存済みの場合はユーザーチームで上書きしない、未保存の場合はユーザーチームをデフォルトに設定
  useEffect(() => {
    if (!user?.team) return;
    if (VALID_TEAMS.includes(user.team as Team)) {
      setTeamFilterRaw(prev => {
        if (prev !== null) return prev; // 既に保存済みの場合は維持
        // localStorageに保存されていない場合はユーザーの所属チームを設定
        const newVal = user.team as Team;
        try { localStorage.setItem("tasks_teamFilter", newVal); } catch {}
        return newVal;
      });
    } else if (user.team === "全チーム" || user.team === "事務員") {
      // 全チーム所属・事務員は常に「全チーム」（null）をデフォルトに設定（チーム絞り込みなし）
      setTeamFilterRaw(() => {
        try { localStorage.removeItem("tasks_teamFilter"); } catch {}
        return null;
      });
    }
  }, [user?.team]);


  // 並び替え（localStorageで永続化）
  const [sortKey, setSortKeyRaw] = useState<SortKey>(() => {
    try {
      const saved = localStorage.getItem("tasks_sortKey");
      if (saved === "dueDate" || saved === "createdAt" || saved === "assignType") return saved;
    } catch {}
    return "dueDate";
  });
  const [sortDir, setSortDirRaw] = useState<SortDir>(() => {
    try {
      const saved = localStorage.getItem("tasks_sortDir");
      if (saved === "asc" || saved === "desc") return saved;
    } catch {}
    return "asc";
  });
  const setSortKey = (key: SortKey) => {
    setSortKeyRaw(key);
    try { localStorage.setItem("tasks_sortKey", key); } catch {}
  };
  const setSortDir = (dir: SortDir | ((prev: SortDir) => SortDir)) => {
    setSortDirRaw((prev) => {
      const next = typeof dir === "function" ? dir(prev) : dir;
      try { localStorage.setItem("tasks_sortDir", next); } catch {}
      return next;
    });
  };

  // フィルターパネルの開閉
  const [showFilters, setShowFilters] = useState(false);

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
  // 編集フォームの利用者名
  const [editPatientName, setEditPatientName] = useState<string>("");
  const [editPatientQuery, setEditPatientQuery] = useState<string>("");
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const { data: editPatientResults = [] } = trpc.patients.search.useQuery(
    { query: editPatientQuery },
    { enabled: editPatientQuery.length >= 1 }
  );
  // 編集フォームのチーム別利用者一覧
  const { data: editTeamPatients = [] } = trpc.patients.list.useQuery(
    { team: editAssignTeam },
    { enabled: editAssignType === "team" }
  );

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

  // 削除済みタスクタブの表示状態
  const [showDeletedTab, setShowDeletedTab] = useState(false);

  // 削除済みタスク一覧取得
  const { data: deletedTasks = [], refetch: refetchDeleted } = trpc.tasks.getDeleted.useQuery(
    undefined,
    { enabled: showDeletedTab }
  );

  // タスク削除（ソフトデリート）
  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      if (showDeletedTab) refetchDeleted();
      toast.success("タスクをゴミ箱に移動しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // 削除済みタスクを復元する
  const restoreTask = trpc.tasks.restore.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      refetchDeleted();
      toast.success("タスクを復元しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // 削除済みタスクを完全削除する
  const permanentDeleteTask = trpc.tasks.permanentDelete.useMutation({
    onSuccess: () => {
      refetchDeleted();
      toast.success("タスクを完全に削除しました");
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
  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.text);
    setEditDueDate(toDateInputValue(task.dueDate));
    setEditDueTime(toTimeInputValue(task.dueDate));
    setEditAssignType(task.assignType as AssignType);
    setEditAssignTeam((task.assignTeam as Team) ?? "身体");
    setEditAssignUserId(task.assignUserId ?? null);
    setEditAssignUserName(task.assignUserName ?? "");
    setEditPatientName(task.patientName ?? "");
    setEditPatientQuery("");
    setEditPatientOpen(false);
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
      patientName: editPatientName.trim() || null,
    });
  };

  // 日付フィルターのロジック
  const matchesDateFilter = (task: Task): boolean => {
    if (dateFilter === "all") return true;
    if (dateFilter === "no_date") return !task.dueDate;
    if (!task.dueDate) return false;

    const d = new Date(task.dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (dateFilter === "overdue") return diff < 0;
    if (dateFilter === "today") return diff === 0;
    if (dateFilter === "tomorrow") return diff === 1;
    if (dateFilter === "this_week") return diff >= 0 && diff <= 6;
    return true;
  };

  // チームフィルターのロジック
  const matchesTeamFilter = (task: Task): boolean => {
    if (teamFilter === null) return true;
    if (teamFilter === "all_team") return task.assignType === "all";
    if (teamFilter === "personal") return task.assignType === "personal";
    // チーム名指定
    return task.assignType === "team" && task.assignTeam === teamFilter;
  };

  const filtered = useMemo(() => {
    const base = tasks.filter((t) => {
      if (filter === "active" && t.done !== 0) return false;
      if (filter === "done" && t.done !== 1) return false;
      if (!matchesDateFilter(t)) return false;
      if (!matchesTeamFilter(t)) return false;
      return true;
    });

    // 並び替え
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "dueDate") {
        // 期日なしは常に末尾
        if (!a.dueDate && !b.dueDate) cmp = 0;
        else if (!a.dueDate) cmp = 1;
        else if (!b.dueDate) cmp = -1;
        else cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      } else if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === "assignType") {
        const ao = ASSIGN_ORDER[a.assignType] ?? 0;
        const bo = ASSIGN_ORDER[b.assignType] ?? 0;
        if (ao !== bo) {
          cmp = ao - bo;
        } else if (a.assignType === "team" && b.assignType === "team") {
          cmp = (a.assignTeam ?? "").localeCompare(b.assignTeam ?? "", "ja");
        } else {
          cmp = (a.assignUserName ?? "").localeCompare(b.assignUserName ?? "", "ja");
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tasks, filter, dateFilter, teamFilter, sortKey, sortDir]);

  const activeCount = tasks.filter((t) => t.done === 0).length;
  const doneCount = tasks.filter((t) => t.done === 1).length;

  // 各日付フィルターの件数（完了フィルター適用後）
  const dateFilterCounts = useMemo(() => {
    const base = tasks.filter((t) => {
      if (filter === "active" && t.done !== 0) return false;
      if (filter === "done" && t.done !== 1) return false;
      return true;
    });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const count = (fn: (t: Task) => boolean) => base.filter(fn).length;
    return {
      all: base.length,
      overdue: count((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return Math.floor((target.getTime() - today.getTime()) / 86400000) < 0;
      }),
      today: count((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return Math.floor((target.getTime() - today.getTime()) / 86400000) === 0;
      }),
      tomorrow: count((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return Math.floor((target.getTime() - today.getTime()) / 86400000) === 1;
      }),
      this_week: count((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diff = Math.floor((target.getTime() - today.getTime()) / 86400000);
        return diff >= 0 && diff <= 6;
      }),
      no_date: count((t) => !t.dueDate),
    };
  }, [tasks, filter]);

  // 各チームフィルターの件数（完了フィルター適用後）
  const teamFilterCounts = useMemo(() => {
    const base = tasks.filter((t) => {
      if (filter === "active" && t.done !== 0) return false;
      if (filter === "done" && t.done !== 1) return false;
      return true;
    });
    return {
      all: base.length,
      all_team: base.filter((t) => t.assignType === "all").length,
      personal: base.filter((t) => t.assignType === "personal").length,
      身体: base.filter((t) => t.assignType === "team" && t.assignTeam === "身体").length,
      天理: base.filter((t) => t.assignType === "team" && t.assignTeam === "天理").length,
      郡山北部: base.filter((t) => t.assignType === "team" && t.assignTeam === "郡山北部").length,
      郡山南部: base.filter((t) => t.assignType === "team" && t.assignTeam === "郡山南部").length,
    };
  }, [tasks, filter]);

  // アクティブなフィルター数（バッジ表示用）
  const activeFilterCount = [
    dateFilter !== "all",
    teamFilter !== null,
  ].filter(Boolean).length;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-2">
        <CheckSquare className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">タスク管理</h1>
        <Badge variant="secondary" className="ml-auto">{activeCount}件未完了</Badge>
      </div>

      {/* 現在のフィルター状態を常時表示 */}
      {teamFilter !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <Users className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium text-primary">
            表示中：
            {teamFilter === "all_team" ? "全員向けタスク"
              : teamFilter === "personal" ? "個人指定タスク"
              : `${teamFilter}チームのタスク`}
          </span>
          <button
            onClick={() => setTeamFilter(null)}
            className="ml-auto flex items-center gap-1 text-xs text-primary/70 hover:text-destructive transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            解除
          </button>
        </div>
      )}

      {/* 完了フィルター */}
      <div className="flex flex-wrap gap-2 items-center">
        {(["active", "all", "done"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={!showDeletedTab && filter === f ? "default" : "outline"}
            className="h-7 text-xs px-3"
            onClick={() => { setShowDeletedTab(false); setFilter(f); }}
          >
            {f === "all"
              ? `すべて (${tasks.length})`
              : f === "active"
              ? `未完了 (${activeCount})`
              : `完了 (${doneCount})`}
          </Button>
        ))}
        {/* 削除済みタスクタブ */}
        <Button
          size="sm"
          variant={showDeletedTab ? "destructive" : "outline"}
          className="h-7 text-xs px-3 flex items-center gap-1"
          onClick={() => { setShowDeletedTab((v) => !v); }}
        >
          <Trash2 className="w-3 h-3" />
          ゴミ箱
          {deletedTasks.length > 0 && (
            <span className="ml-0.5 w-4 h-4 rounded-full bg-destructive/20 text-destructive text-xs flex items-center justify-center font-bold">
              {deletedTasks.length}
            </span>
          )}
        </Button>
        {/* フィルターパネル開閉ボタン */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors",
            showFilters || activeFilterCount > 0
              ? "bg-primary/10 border-primary/40 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          絞り込み
          {activeFilterCount > 0 && (
            <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* フィルターパネル */}
      {showFilters && (
        <Card className="shadow-sm border-primary/20">
          <CardContent className="p-3 space-y-3">
            {/* 日付フィルター */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">期日フィルター</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { value: "all", label: "すべて" },
                  { value: "overdue", label: "期限切れ" },
                  { value: "today", label: "今日" },
                  { value: "tomorrow", label: "明日" },
                  { value: "this_week", label: "今週" },
                  { value: "no_date", label: "期日なし" },
                ] as const).map(({ value, label }) => {
                  const count = dateFilterCounts[value];
                  const isActive = dateFilter === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setDateFilter(value)}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border transition-colors flex items-center gap-0.5",
                        isActive
                          ? value === "overdue"
                            ? "bg-red-500 text-white border-red-500"
                            : value === "today"
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-primary text-white border-primary"
                          : value === "overdue" && count > 0
                          ? "border-red-400 text-red-600 hover:bg-red-50"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                      )}
                    >
                      {label}
                      {count > 0 && (
                        <span className={cn(
                          "text-xs font-bold",
                          isActive ? "opacity-80" : ""
                        )}>
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* チームフィルター */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">指定先フィルター</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { value: null, label: "すべて" },
                  { value: "all_team", label: "全員向け" },
                  { value: "身体", label: "身体チーム" },
                  { value: "天理", label: "天理チーム" },
                  { value: "郡山北部", label: "郡山北部チーム" },
                  { value: "郡山南部", label: "郡山南部チーム" },
                  { value: "personal", label: "個人指定" },
                ] as const).map(({ value, label }) => {
                  const countKey = value === null ? "all" : value;
                  const count = teamFilterCounts[countKey as keyof typeof teamFilterCounts];
                  const isActive = teamFilter === value;
                  // チーム名を抽出（「身体チーム」→「身体」、それ以外はそのまま）
                  const teamKey = typeof value === "string" && ["身体","天理","郡山北部","郡山南部"].includes(value) ? value : null;
                  return (
                    <button
                      key={String(value)}
                      onClick={() => setTeamFilter(value)}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border transition-all flex items-center gap-0.5",
                        teamKey
                          ? getTeamButtonClass(teamKey, isActive)
                          : isActive
                            ? "bg-primary text-white border-transparent shadow-md scale-105"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                      )}
                      style={teamKey ? getTeamButtonStyle(teamKey, isActive) : undefined}
                    >
                      {label}
                      {count > 0 && (
                        <span className="text-xs font-bold">({count})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* フィルターリセット */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setDateFilter("all");
                  setTeamFilter(null);
                }}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5 transition-colors"
              >
                <X className="w-3 h-3" />すべてのフィルターをリセット
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* アクティブなフィルターのサマリーバッジ */}
      {!showFilters && activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground">絞り込み中:</span>
          {dateFilter !== "all" && (
            <span className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Calendar className="w-2.5 h-2.5" />
              {dateFilter === "overdue" ? "期限切れ"
                : dateFilter === "today" ? "今日"
                : dateFilter === "tomorrow" ? "明日"
                : dateFilter === "this_week" ? "今週"
                : "期日なし"}
              <button onClick={() => setDateFilter("all")} className="ml-0.5 hover:text-destructive">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
          {teamFilter !== null && (
            <span className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Users className="w-2.5 h-2.5" />
              {teamFilter === "all_team" ? "全員向け"
                : teamFilter === "personal" ? "個人指定"
                : `${teamFilter}チーム`}
              <button onClick={() => setTeamFilter(null)} className="ml-0.5 hover:text-destructive">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

        </div>
      )}

      {/* 並び替えバー */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex-shrink-0">並び替え:</span>
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: "dueDate" as SortKey, label: "期日" },
            { key: "createdAt" as SortKey, label: "作成日" },
            { key: "assignType" as SortKey, label: "指定先" },
          ]).map(({ key, label }) => {
            const isActive = sortKey === key;
            return (
              <button
                key={key}
                onClick={() => {
                  if (sortKey === key) {
                    setSortDir((d) => d === "asc" ? "desc" : "asc");
                  } else {
                    setSortKey(key);
                    setSortDir("asc");
                  }
                }}
                className={cn(
                  "flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border transition-colors",
                  isActive
                    ? "bg-primary/10 border-primary/40 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                )}
              >
                {label}
                {isActive ? (
                  sortDir === "asc"
                    ? <ArrowUp className="w-2.5 h-2.5" />
                    : <ArrowDown className="w-2.5 h-2.5" />
                ) : (
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                )}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length}件</span>
      </div>

      {/* 削除済みタスクパネル */}
      {showDeletedTab && (
        <Card className="shadow-sm border-destructive/30">
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-2 pb-1 border-b border-destructive/20">
              <History className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">ゴミ箱（削除済みタスク）</span>
              <span className="text-xs text-muted-foreground ml-auto">{deletedTasks.length}件</span>
            </div>
            {deletedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">ゴミ箱は空です</p>
            ) : (
              deletedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-2 py-2 px-2 rounded-lg bg-destructive/5 border border-destructive/10"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-through text-muted-foreground">{task.text}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {task.patientName && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground/70">
                          <UserRound className="w-3 h-3" />{task.patientName}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground/70">
                          <Calendar className="w-3 h-3" />{formatDueDate(task.dueDate)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground/60">
                        削除: {task.deletedAt ? new Date(task.deletedAt).toLocaleDateString("ja-JP") : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => restoreTask.mutate({ id: task.id })}
                      disabled={restoreTask.isPending}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                      title="復元"
                    >
                      <RotateCcw className="w-3 h-3" />
                      復元
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("このタスクを完全に削除しますか？この操作は元に戻せません。")) {
                          permanentDeleteTask.mutate({ id: task.id });
                        }
                      }}
                      disabled={permanentDeleteTask.isPending}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                      title="完全削除"
                    >
                      <Trash2 className="w-3 h-3" />
                      完全削除
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="pt-1 border-t border-destructive/20">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                「復元」でタスク一覧に戻します。「完全削除」は元に戻せません。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* タスク一覧（ゴミ箱表示中は非表示） */}
      {!showDeletedTab && (
      <Card className="shadow-sm">
        <CardContent className="p-3 space-y-1.5">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-16 bg-muted/60 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {activeFilterCount > 0
                ? "条件に一致するタスクはありません"
                : filter === "active"
                ? "未完了のタスクはありません"
                : "タスクはありません"}
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
                          step="600"
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
                            type="button"
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
                              type="button"
                              onClick={() => setEditAssignTeam(team)}
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-full border transition-all",
                                getTeamButtonClass(team, editAssignTeam === team)
                              )}
                              style={getTeamButtonStyle(team, editAssignTeam === team)}
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

                    {/* 利用者名 */}
                    <div className="relative">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        <UserRound className="w-3 h-3 inline mr-0.5" />利用者名（任意）
                      </label>
                      {editAssignType === "team" ? (
                        /* チーム指定時：チームの利用者一覧から選択 */
                        <div className="flex items-center gap-1.5">
                          <select
                            value={editPatientName}
                            onChange={(e) => setEditPatientName(e.target.value)}
                            className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
                          >
                            <option value="">{editAssignTeam}チームの利用者を選択...</option>
                            {editTeamPatients.map((p) => (
                              <option key={p.id} value={p.name}>{p.name}{p.nameKana ? ` (${p.nameKana})` : ""}</option>
                            ))}
                          </select>
                          {editPatientName && (
                            <button
                              type="button"
                              onClick={() => setEditPatientName("")}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        /* 全員・個人指定時：フリーテキスト検索 */
                        <div className="relative">
                          <input
                            type="text"
                            value={editPatientOpen ? editPatientQuery : editPatientName}
                            onChange={(e) => {
                              setEditPatientQuery(e.target.value);
                              setEditPatientName(e.target.value);
                              setEditPatientOpen(true);
                            }}
                            onFocus={() => {
                              setEditPatientQuery(editPatientName);
                              setEditPatientOpen(true);
                            }}
                            onBlur={() => setTimeout(() => setEditPatientOpen(false), 150)}
                            placeholder="利用者名を入力または検索..."
                            className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 pr-8"
                          />
                          {editPatientName && (
                            <button
                              type="button"
                              onClick={() => { setEditPatientName(""); setEditPatientQuery(""); }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {editPatientOpen && editPatientResults.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {editPatientResults.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={() => {
                                    setEditPatientName(p.name);
                                    setEditPatientQuery("");
                                    setEditPatientOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                                >
                                  {p.name}
                                  {p.nameKana && <span className="text-xs text-muted-foreground ml-1">({p.nameKana})</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
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
                        <CheckCircle2 className="w-5 h-5 text-primary animate-check-bounce" />
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
                          <span className={cn("flex items-center gap-0.5 text-xs", getDueDateColor(task.dueDate))}>
                            <Calendar className="w-3 h-3" />
                            {formatDueDate(task.dueDate)}
                          </span>
                        )}
                        {/* 指定先 */}
                        <AssignBadge task={task} />
                        {/* 繰り返しアイコン */}
                        {task.repeatType && task.repeatType !== "none" && (
                          <span className="text-xs text-primary/80 font-medium" title={
                            task.repeatType === "weekly"
                              ? `毎週${["日","月","火","水","木","金","土"][task.repeatDayOfWeek ?? 1]}曜日繰り返し`
                              : `毎月${task.repeatDayOfMonth ?? 1}日繰り返し`
                          }>
                            🔄 {task.repeatType === "weekly"
                              ? `毎週${["日","月","火","水","木","金","土"][task.repeatDayOfWeek ?? 1]}`
                              : `毎月${task.repeatDayOfMonth ?? 1}日`}
                          </span>
                        )}
                        {/* 利用者名 */}
                        {task.patientName && (
                          <span className="flex items-center gap-0.5 text-xs text-violet-600 dark:text-violet-400 font-medium">
                            <UserRound className="w-3 h-3" />{task.patientName}
                          </span>
                        )}
                        {/* 作成者 */}
                        <span className="text-xs text-muted-foreground/70">
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
      )}

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
