/**
 * Dashboard - メインダッシュボードページ
 * Design: 温かみのある和モダン・ケアUI
 * 機能: 訪問件数表示、ZESTスクリーンショット、業務ツールクイックアクセス、タスク、申し送り、訪問推移グラフ
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useCountUp, useAnimatedProgress } from "@/hooks/useCountUp";
import { Confetti } from "@/components/Confetti";
import { createPortal } from "react-dom";
import { useAuth } from "@/_core/hooks/useAuth";
import { AttendanceCheckModal } from "@/components/AttendanceCheckModal";
import { ImprovementBox } from "@/components/ImprovementBox";
import { AlcoholCheckModal } from "@/components/AlcoholCheckModal";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  ExternalLink,
  Plus,
  CheckCircle2,
  Circle,
  Send,
  RefreshCw,
  TrendingUp,
  Users,
  Activity,
  Link as LinkIcon,
  Trash2,
  MessageSquare,
  ClipboardList,
  ClipboardEdit,
  Upload,
  Calendar,
  CalendarClock,
  X,
  History,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Pencil,
  ListTodo,
  UserRound,
  Home,
  FileText,
  CalendarDays,
  SmilePlus,
  Car,
  Target,
  BookmarkPlus,
  Check,
  AlertTriangle,
  LogIn,
  LogOut,
  Bell,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn, openLink } from "@/lib/utils";
import { getTeamButtonClass, getAllTeamButtonStyle, getTeamButtonStyle, getTeamTextStyle, getTeamTextStyleNight, TEAM_COLOR_VALUES, ALL_TEAM_COLOR } from "@shared/teamColors";
import type { TeamName } from "@shared/teamColors";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import TaskCreateForm from "@/components/TaskCreateForm";
import { CreateTaskForm } from "@/pages/PersonalTasks";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { VoiceHelpDialog } from "@/components/VoiceHelpDialog";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useOfflineQueueContext } from "@/contexts/OfflineQueueContext";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SPREADSHEET_LINKS as spreadsheetLinks } from "@/lib/spreadsheetLinks";

// ========== データ定義 ==========

// 2025年1〜11月推移データ（Google Driveより）
const trendData = [
  { month: "1月", 利用者数: 187, 平均訪問回数: 6.37, 平日平均訪問件数: 54.09, 新規: 4, 終了: 0 },
  { month: "2月", 利用者数: 185, 平均訪問回数: 6.36, 平日平均訪問件数: 58.7, 新規: 4, 終了: 6 },
  { month: "3月", 利用者数: 186, 平均訪問回数: 6.77, 平日平均訪問件数: 59.95, 新規: 6, 終了: 5 },
  { month: "4月", 利用者数: 190, 平均訪問回数: 6.98, 平日平均訪問件数: 60.0, 新規: 6, 終了: 2 },
  { month: "5月", 利用者数: 188, 平均訪問回数: 7.05, 平日平均訪問件数: 59.91, 新規: 6, 終了: 8 },
  { month: "6月", 利用者数: 191, 平均訪問回数: 6.73, 平日平均訪問件数: 61.1, 新規: 6, 終了: 3 },
  { month: "7月", 利用者数: 197, 平均訪問回数: 7.12, 平日平均訪問件数: 60.87, 新規: 11, 終了: 5 },
  { month: "8月", 利用者数: 193, 平均訪問回数: 6.78, 平日平均訪問件数: 62.19, 新規: 3, 終了: 7 },
  { month: "9月", 利用者数: 198, 平均訪問回数: 7.09, 平日平均訪問件数: 63.73, 新規: 7, 終了: 2 },
  { month: "10月", 利用者数: 190, 平均訪問回数: 7.74, 平日平均訪問件数: 63.7, 新規: 6, 終了: 14 },
  { month: "11月", 利用者数: 185, 平均訪問回数: 6.74, 平日平均訪問件数: 61.3, 新規: 3, 終了: 8 },
];

// 今月の訪問件数（3月実績）
const currentMonthData = {
  month: "3月",
  mainActual: 137,
  mainTarget: 144,
  subActual: 13,
  subTarget: 0,
  totalActual: 144,
  totalTarget: 144,
  lastMonthActual: 1322,
  lastMonthTarget: 1298,
  lastMonthAchievement: 102,
};

// 業務ツール - ドキュメント
const documentLinks: { label: string; href: string; color: string }[] = [
  // ドキュメントリンクをここに追加できます
];

// 業務ツール - フォーム
const formLinks: { label: string; href: string; color: string }[] = [
  // フォームリンクをここに追加できます
];

// 業務ツール - その他
const otherLinks = [
  { label: "NotebookLM — 就業規則・社内マニュアル", href: "https://notebooklm.google.com/notebook/4781c6de-6e18-456d-b557-a202c3b03747", color: "text-blue-600" },
  { label: "ひなた 公式 Instagram", href: "https://www.instagram.com/kokoronohinata/", color: "text-pink-600" },
];



// 初期タスク（サンプルなし）
const initialTasks: { id: number; text: string; done: boolean; priority: "high" | "medium" | "low" }[] = [];

// メッセージ型
type MessageItem = {
  id: number;
  author: string;
  time: string;
  text: string;
  type: "notice" | "message";
};

// 初期申し送り
const initialMessages: MessageItem[] = [
  {
    id: 1,
    author: "山田看護師",
    time: "09:15",
    text: "田中様、昨日より血圧が高め。本日訪問時に要確認。",
    type: "notice",
  },
  {
    id: 2,
    author: "佐藤作業療法士",
    time: "08:30",
    text: "鈴木様の次回訪問日時を木曜午後に変更しました。",
    type: "notice",
  },
];

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
const DAYS = ["今日", "明日", "2日後", "3日後", "4日後"] as const;
type TeamType = typeof TEAMS[number];
type DayType = typeof DAYS[number];

// チームカラーはshared/teamColors.tsで管理（getTeamButtonClassを使用）

// ========== サブコンポーネント ==========


// ============================
// チーム目標カード
// ============================
const TEAM_BADGE_COLORS: Record<string, string> = {
  "身体": "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/25 dark:text-blue-300 dark:border-blue-400/50",
  "天理": "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/25 dark:text-purple-300 dark:border-purple-400/50",
  "郡山北部": "bg-green-100 text-green-700 border-green-300 dark:bg-green-500/25 dark:text-green-300 dark:border-green-400/50",
  "郡山南部": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/25 dark:text-orange-300 dark:border-orange-400/50",
  "全チーム": "bg-muted text-foreground border-border",
};

// ============================
// 残業申請承認カード（管理者専用）
// ============================
function OvertimeApprovalCard() {
  const utils = trpc.useUtils();
  const { data: approvals = [], isLoading } = trpc.overtime.getAll.useQuery({ status: "pending" });
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const approveMut = trpc.overtime.approve.useMutation({
    onSuccess: () => {
      utils.overtime.getAll.invalidate();
      toast.success("残業申請を処理しました");
    },
    onError: (e) => toast.error(`処理に失敗しました: ${e.message}`),
  });

  const toJST = (ms: number) =>
    new Date(ms).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <Card className="shadow-sm border-l-4 border-l-amber-400">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
          <Bell className="w-4 h-4 text-amber-500" />
          <span>残業申請 承認</span>
          {pendingCount > 0 && (
            <Badge className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {pendingCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : approvals.length === 0 ? (
          <div className="flex items-center gap-2 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <p className="text-sm text-muted-foreground">承認待ちの残業申請はありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/40 p-3 space-y-2"
              >
                {/* 申請者・日付・時間 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{a.applicantName}</span>
                      <span className="text-xs text-muted-foreground">{a.applicationDate}</span>
                    </div>
                    <p className="text-sm text-foreground mt-0.5">
                      {toJST(a.requestedStartAt)} ～ {toJST(a.requestedEndAt)}
                    </p>
                    {a.requestedReason && (
                      <p className="text-xs text-muted-foreground mt-0.5">理由: {a.requestedReason}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline shrink-0 mt-0.5"
                    onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  >
                    {expandedId === a.id ? "閉じる" : "コメント"}
                  </button>
                </div>

                {/* コメント入力（展開時のみ） */}
                {expandedId === a.id && (
                  <input
                    type="text"
                    placeholder="コメント（任意）"
                    value={commentInputs[a.id] ?? ""}
                    onChange={(e) => setCommentInputs((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    className="w-full border rounded px-3 py-1.5 text-sm bg-background text-foreground"
                  />
                )}

                {/* 承認・却下ボタン */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={approveMut.isPending}
                    onClick={() => approveMut.mutate({
                      id: a.id,
                      status: "approved",
                      approverComment: commentInputs[a.id] || undefined,
                    })}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 select-none"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    承認
                  </button>
                  <button
                    type="button"
                    disabled={approveMut.isPending}
                    onClick={() => approveMut.mutate({
                      id: a.id,
                      status: "rejected",
                      approverComment: commentInputs[a.id] || undefined,
                    })}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 select-none"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    却下
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamGoalsCard() {
  const { data: goals = [], isLoading } = trpc.teamGoals.getActive.useQuery();

  if (isLoading) return (
    <Card className="fade-in-up shadow-sm border-l-4 border-l-primary/60">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          チーム目標
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        {[1,2].map(i => (
          <div key={i} className="rounded-lg bg-muted/40 p-3 space-y-2 animate-pulse">
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
  if (goals.length === 0) return null;

  return (
    <Card className="fade-in-up shadow-sm border-l-4 border-l-primary/60">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          チーム目標
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        {goals.map(g => (
          <div key={g.id} className="rounded-lg bg-muted/40 p-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", TEAM_BADGE_COLORS[g.team] ?? "bg-gray-100 text-gray-800")}>
                {g.team}
              </span>
              {(g.startDate || g.endDate) && (
                <span className="text-xs text-muted-foreground">
                  {g.startDate ? String(g.startDate).slice(0, 10).replace(/-/g, "/") : ""}
                  {" 〜 "}
                  {g.endDate ? String(g.endDate).slice(0, 10).replace(/-/g, "/") : ""}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold leading-snug line-clamp-2">{g.title}</p>
            {g.body && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{g.body}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function VisitCountCard() {
  const { isNight } = useTheme();
  const [refetchCount, setRefetchCount] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevAchievedRef = useRef(false);
  const { data: visitData, isLoading, refetch } = trpc.visits.getCurrent.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5分ごとに自動更新
    staleTime: 3 * 60 * 1000,
  });

  // データがない場合はフォールバック（isLoadingの場合も含む）
  const data = visitData ?? {
    currentMonth: "3月",
    lastUpdatedDate: "—",
    mainActual: 0,
    subActual: 0,
    totalActualEquiv: 0,
    mainTarget: 0,
    subTarget: 0,
    mainDailyTargetCumul: 0,
    subDailyTargetCumul: 0,
    totalTargetEquiv: 0,
    diff: 0,
    dailyTarget: 0,
    dailyPoints: [],
    prevMonth: "2月",
    prevTotalTarget: 0,
    prevTotalActual: 0,
    prevDiff: 0,
  };

  const mainPct = data.mainDailyTargetCumul > 0 ? (data.mainActual / data.mainDailyTargetCumul) * 100 : 0;
  const subPct = data.subDailyTargetCumul > 0 ? (data.subActual / data.subDailyTargetCumul) * 100 : 0;
  const totalPct = data.totalTargetEquiv > 0 ? (data.totalActualEquiv / data.totalTargetEquiv) * 100 : 0;
  const prevPct = data.prevTotalTarget > 0 ? (data.prevTotalActual / data.prevTotalTarget) * 100 : 0;
  const prevAchieved = prevPct >= 100;

  // 目標差分ラベル: プラスは超過、マイナスは不足
  const getDiffLabel = (actual: number, target: number) => {
    if (target <= 0) return null;
    const diff = Math.round((actual - target) * 10) / 10;
    if (diff >= 0) return { text: `${diff}件超過`, over: true };
    return { text: `あと${Math.abs(diff)}件`, over: false };
  };

  // 達成率に応じた色分け: 70%未満=赤, 70〜89%=オレンジ, 90〜99%=黄緑, 100%以上=緑
  const getPctColor = (pct: number) => {
    if (pct >= 100) return "text-emerald-600";
    if (pct >= 90)  return "text-lime-500";
    if (pct >= 70)  return "text-orange-500";
    return "text-red-500";
  };
  // プログレスバー用（bg-*クラス）
  const getPctBarColor = (pct: number) => {
    if (pct >= 100) return "bg-emerald-500";
    if (pct >= 90)  return "bg-lime-500";
    if (pct >= 70)  return "bg-orange-500";
    return "bg-red-500";
  };

  // 100%達成時に紙吹雪を表示
  useEffect(() => {
    const isAchieved = totalPct >= 100;
    if (isAchieved && !prevAchievedRef.current) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      prevAchievedRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!isAchieved) {
      prevAchievedRef.current = false;
    }
  }, [totalPct]);

  // カウントアップアニメーション（refetchCountが変わるたびに0から再カウント）
  const animatedMain = useCountUp(data.mainActual, 900, 100, refetchCount);
  const animatedSub = useCountUp(data.subActual, 900, 200, refetchCount);
  const animatedTotal = useCountUp(data.totalActualEquiv, 900, 300, refetchCount);
  // プログレスバーアニメーション（同様にrefetchCountで再トリガー）
  const animatedMainPct = useAnimatedProgress(mainPct, 900, 100, refetchCount);
  const animatedSubPct = useAnimatedProgress(subPct, 900, 200, refetchCount);
  const animatedTotalPct = useAnimatedProgress(totalPct, 900, 300, refetchCount);
  // 先月実績カウントアップ
  const animatedPrevActual = useCountUp(data.prevTotalActual, 1000, 400, refetchCount);
  const animatedPrevPct = useAnimatedProgress(prevPct, 1000, 400, refetchCount);

  // ローディング中はスケルトン表示（早期リターンを使わずフックルール違反を防止）
  if (isLoading) {
    return (
      <Card className="fade-in-up stagger-1 shadow-sm">
        <CardHeader className="pb-1 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Activity className="w-5 h-5 text-primary" />
              <span className="tracking-wide">訪問件数</span>
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">読み込み中...</p>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {["メイン", "サブ", "合計"].map((label) => (
              <div key={label} className="space-y-1.5 border border-border rounded-xl p-2.5 bg-muted/20 animate-pulse">
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <div className="h-8 bg-muted rounded" />
                <div className="h-2 bg-muted rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Confetti active={showConfetti} duration={4000} />
    <Card className="fade-in-up stagger-1 shadow-sm flex flex-col">
      <CardHeader className="pb-1 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Activity className="w-5 h-5 text-primary" />
            <span className="tracking-wide">訪問件数</span>
          </CardTitle>
          <button
            onClick={() => { refetch(); setRefetchCount(c => c + 1); }}
            title="更新"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>更新</span>
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {data.currentMonth}（{data.lastUpdatedDate}時点の累計）
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-3 flex-1">
        <div className="grid grid-cols-3 gap-2">
          {/* メイン */}
          <div className="space-y-1.5 border-2 border-orange-400 dark:border-orange-500 rounded-xl p-2.5 bg-orange-50/50 dark:bg-orange-950/30">
            <p className="text-xs font-bold text-orange-600 dark:text-orange-400">メイン</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {animatedMain}
              <span className="text-sm font-semibold text-orange-500 dark:text-orange-400 ml-1">
                / {data.mainDailyTargetCumul > 0 ? data.mainDailyTargetCumul : "—"}
              </span>
            </p>
            <Progress value={animatedMainPct} className="h-2" indicatorClassName={data.mainDailyTargetCumul > 0 ? getPctBarColor(mainPct) : undefined} />
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-sm font-extrabold",
                data.mainDailyTargetCumul > 0 ? getPctColor(mainPct) : "text-orange-400"
              )}>{data.mainDailyTargetCumul > 0 ? `${Math.round(mainPct)}%` : "—"}</p>
              {data.mainTarget > 0 && (
                <p className="text-xs font-medium text-orange-500/80 dark:text-orange-400/80">月目標 {data.mainTarget}</p>
              )}
            </div>
            {(() => {
              const diff = getDiffLabel(data.mainActual, data.mainDailyTargetCumul);
              return diff ? (
                <p className={cn("text-xs font-medium", diff.over ? "text-emerald-600" : "text-orange-500 dark:text-orange-400")}>
                  {diff.over ? `目標を${diff.text}` : `目標まで${diff.text}`}
                </p>
              ) : null;
            })()}
          </div>
          {/* サブ */}
          <div className="space-y-1.5 border-2 border-sky-400 dark:border-sky-500 rounded-xl p-2.5 bg-sky-50/50 dark:bg-sky-950/30">
            <p className="text-xs font-bold text-sky-600 dark:text-sky-400">サブ</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {animatedSub}
              <span className="text-sm font-semibold text-sky-500 dark:text-sky-400 ml-1">
                / {data.subDailyTargetCumul > 0 ? data.subDailyTargetCumul : "—"}
              </span>
            </p>
            <Progress value={animatedSubPct} className="h-2" indicatorClassName={data.subDailyTargetCumul > 0 ? getPctBarColor(subPct) : undefined} />
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-sm font-extrabold",
                data.subDailyTargetCumul > 0 ? getPctColor(subPct) : "text-sky-400"
              )}>
                {data.subDailyTargetCumul > 0 ? `${Math.round(subPct)}%` : "—"}
              </p>
              {data.subTarget > 0 && (
                <p className="text-xs font-medium text-sky-500/80 dark:text-sky-400/80">月目標 {data.subTarget}</p>
              )}
            </div>
            {(() => {
              const diff = getDiffLabel(data.subActual, data.subDailyTargetCumul);
              return diff ? (
                <p className={cn("text-xs font-medium", diff.over ? "text-emerald-600" : "text-sky-500 dark:text-sky-400")}>
                  {diff.over ? `目標を${diff.text}` : `目標まで${diff.text}`}
                </p>
              ) : null;
            })()}
          </div>
          {/* 合計（メイン換算） */}
          <div className="space-y-1.5 border-[3px] border-emerald-500 dark:border-emerald-400 rounded-xl p-2.5 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-sm shadow-emerald-200 dark:shadow-emerald-900">
            <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">合計</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {animatedTotal}
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 ml-1">
                / {data.totalTargetEquiv}
              </span>
            </p>
            <Progress value={animatedTotalPct} className="h-2" indicatorClassName={getPctBarColor(totalPct)} />
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-base font-extrabold",
                getPctColor(totalPct)
              )}>{Math.round(totalPct)}%</p>
              {data.mainTarget > 0 && (
                <p className="text-xs font-medium text-emerald-600/80 dark:text-emerald-400/80">月目標 {data.mainTarget}</p>
              )}
            </div>
            {(() => {
              const diff = getDiffLabel(data.totalActualEquiv, data.totalTargetEquiv);
              return diff ? (
                <p className={cn("text-xs font-medium", diff.over ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {diff.over ? `目標を${diff.text}` : `目標まで${diff.text}`}
                </p>
              ) : null;
            })()}
          </div>
        </div>

        <Separator />

        {/* 先月実績 */}
        <div className={cn(
          "space-y-2 border rounded-xl p-3 transition-all duration-500",
          isNight
            ? (prevAchieved
              ? "border-emerald-800/60 bg-gradient-to-br from-emerald-950/60 to-green-950/60"
              : "border-amber-800/60 bg-gradient-to-br from-amber-950/60 to-orange-950/60")
            : (prevAchieved
              ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50"
              : "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50")
        )}>
          <div className="flex items-center justify-between">
            <p className={cn(
              "text-xs font-semibold",
              isNight
                ? (prevAchieved ? "text-emerald-400" : "text-amber-400")
                : (prevAchieved ? "text-emerald-700" : "text-amber-700")
            )}>{data.prevMonth}実績</p>
            <div className="flex items-center gap-2">
              <Badge className={cn(
                "border-0 text-sm font-extrabold px-3 py-1",
                isNight
                  ? (prevAchieved ? "bg-emerald-800/80 text-emerald-200" : "bg-amber-800/80 text-amber-200")
                  : (prevAchieved ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")
              )}>
                達成率 {Math.round(animatedPrevPct)}%
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-bold tabular-nums text-foreground">{animatedPrevActual.toLocaleString()} 件</span>
            <span className="text-xs text-muted-foreground">目標 {data.prevTotalTarget.toLocaleString()} 件</span>
          </div>
          {/* 横棒グラフ */}
          <div className="relative h-5 rounded-full overflow-hidden bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(animatedPrevPct, 100)}%`,
                background: prevAchieved
                  ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                  : 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
              {animatedPrevActual.toLocaleString()} / {data.prevTotalTarget.toLocaleString()} 件
            </span>
          </div>
          {/* 達成・未達成メッセージ */}
          {prevAchieved ? (
            <div className="flex items-center gap-1.5 pt-0.5 overflow-hidden">
              <span className="text-base flex-shrink-0">🎉</span>
              <p className={cn("text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis", isNight ? "text-emerald-400" : "text-emerald-700")}>先月は目標達成！みんなで協力したおかげです！🌟</p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-base">💪</span>
              <p className={cn("text-xs font-bold", isNight ? "text-amber-400" : "text-amber-700")}>今月こそ達成しよう！あと{Math.round(data.prevTotalTarget - data.prevTotalActual).toLocaleString()}件だった！</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
}

// ========== 曜日別件数カード ==========

function DailyByTeamCard() {
  const { isNight } = useTheme();
  const { data, isLoading, refetch } = trpc.visits.getDailyByTeam.useQuery(undefined, {
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  const teamColors: Record<string, { bg: string; text: string; bgNight: string; textNight: string }> = {
    "郡山北部": { bg: "bg-orange-50", text: "text-orange-700", bgNight: "bg-orange-900/30", textNight: "text-orange-200" },
    "郡山南部": { bg: "bg-yellow-50", text: "text-yellow-700", bgNight: "bg-yellow-900/30", textNight: "text-yellow-200" },
    "身体":    { bg: "bg-rose-50",   text: "text-rose-700",   bgNight: "bg-rose-900/30",   textNight: "text-rose-200" },
    "天理":    { bg: "bg-purple-50", text: "text-purple-700", bgNight: "bg-purple-900/30", textNight: "text-purple-200" },
  };

  const days = [
    { key: "mon" as const, label: "月" },
    { key: "tue" as const, label: "火" },
    { key: "wed" as const, label: "水" },
    { key: "thu" as const, label: "木" },
    { key: "fri" as const, label: "金" },
  ];

  // 今日の曜日を取得（月=0, 火=1, 水=2, 木=3, 金=4）
  const todayDayIndex = (() => {
    const d = new Date().getDay(); // 0=日, 1=月, ..., 5=金, 6=土
    return d >= 1 && d <= 5 ? d - 1 : -1;
  })();

  // 差引がマイナスの曜日インデックスセット
  const negDayIndices = new Set<number>(
    data?.diff
      ? days
          .map((d, i) => ({ i, val: data.diff![d.key] }))
          .filter(({ val }) => typeof val === "number" && val < 0)
          .map(({ i }) => i)
      : []
  );

  return (
    <Card className="fade-in-up shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-lg font-bold text-foreground tracking-wide">
            <CalendarDays className="w-5 h-5 text-primary" />
            曜日別件数
          </span>
          <button
            onClick={() => refetch()}
            title="更新"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>更新</span>
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">読み込み中...</span>
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-2">データを取得できませんでした</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-1.5 pr-2 font-medium text-muted-foreground text-xs w-20">チーム</th>
                  {days.map((d, i) => (
                    <th
                      key={d.key}
                      className={`text-center py-1.5 px-1 font-medium text-xs w-10 ${
                        i === todayDayIndex
                          ? "text-primary font-bold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {i === todayDayIndex ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-primary text-primary">
                          {d.label}
                        </span>
                      ) : (
                        d.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.teams.map((team) => {
                  const colors = teamColors[team.name] ?? { bg: "bg-muted", text: "text-foreground", bgNight: "bg-muted", textNight: "text-foreground" };
                  return (
                    <tr key={team.name} className="border-t border-border/40">
                      <td className="py-1.5 pr-2">
                        <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${
                          isNight ? colors.bgNight : colors.bg
                        } ${isNight ? colors.textNight : colors.text}`}>
                          {team.name}
                        </span>
                      </td>
                      {days.map((d, i) => (
                        <td
                          key={d.key}
                          className={`text-center py-1.5 px-1 tabular-nums font-medium ${
                            negDayIndices.has(i)
                              ? isNight
                                ? "bg-red-900/20"
                                : "bg-red-50"
                              : ""
                          } text-foreground`}
                        >
                          {team[d.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {data.total && (
                  <tr className="border-t-2 border-primary/40 bg-primary/10 dark:bg-primary/20">
                    <td className="py-2 pr-2 pl-1 rounded-l-md">
                      <span className="text-sm font-extrabold text-primary">合計</span>
                    </td>
                    {days.map((d, i) => (
                      <td
                        key={d.key}
                        className={`text-center py-2 px-1 tabular-nums font-extrabold text-sm ${
                          negDayIndices.has(i)
                            ? isNight
                              ? "bg-red-900/20"
                              : "bg-red-50"
                            : ""
                        } text-foreground`}
                      >
                        {data.total![d.key]}
                      </td>
                    ))}
                  </tr>
                )}
                {data.target && (
                  <tr className="border-t border-border/40 bg-muted/30">
                    <td className="py-1.5 pr-2 pl-1">
                      <span className="text-xs font-semibold text-muted-foreground">目標</span>
                    </td>
                    {days.map((d, i) => (
                      <td
                        key={d.key}
                        className={`text-center py-1.5 px-1 tabular-nums text-xs font-medium ${
                          negDayIndices.has(i)
                            ? isNight
                              ? "bg-red-900/20"
                              : "bg-red-50"
                            : ""
                        } text-muted-foreground`}
                      >
                        {data.target![d.key]}
                      </td>
                    ))}
                  </tr>
                )}
                {data.diff && (
                  <tr className="border-t border-border/40">
                    <td className="py-1.5 pr-2 pl-1">
                      <span className="text-xs font-semibold text-muted-foreground">差引</span>
                    </td>
                    {days.map((d, i) => {
                      const val = data.diff![d.key];
                      const isPositive = val > 0;
                      const isNegative = val < 0;
                      return (
                        <td
                          key={d.key}
                          className={`text-center py-1.5 px-1 tabular-nums text-xs font-bold ${
                            negDayIndices.has(i)
                              ? isNight
                                ? "bg-red-900/20"
                                : "bg-red-50"
                              : ""
                          } ${
                            isPositive
                              ? "text-blue-600 dark:text-blue-400"
                              : isNegative
                              ? "text-red-500 dark:text-red-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {isPositive ? `+${val}` : val}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {data.target && data.total && (
                  <tr className="border-t border-border/40 bg-muted/20">
                    <td className="py-1.5 pr-2 pl-1">
                      <span className="text-xs font-semibold text-muted-foreground">達成率</span>
                    </td>
                    {days.map((d, i) => {
                      const total = data.total![d.key];
                      const target = data.target![d.key];
                      const rate = target > 0 ? Math.round((total / target) * 100) : null;
                      const isOver = rate !== null && rate >= 100;
                      const isLow = rate !== null && rate < 80;
                      return (
                        <td
                          key={d.key}
                          className={`text-center py-1.5 px-1 tabular-nums text-xs font-bold ${
                            negDayIndices.has(i)
                              ? isNight
                                ? "bg-red-900/20"
                                : "bg-red-50"
                              : ""
                          } ${
                            isOver
                              ? "text-blue-600 dark:text-blue-400"
                              : isLow
                              ? "text-red-500 dark:text-red-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {rate !== null ? `${rate}%` : "-"}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">見込み件数タブより取得</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ========== ピンチズーム対応画像コンポーネント ==========

function PinchZoomImage({ src, alt, onClickLightbox, fullscreen }: { src: string; alt: string; onClickLightbox?: () => void; fullscreen?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const scaleRef = useRef(1);
  const lastDistRef = useRef<number | null>(null);
  const translateRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  // ピンチ中かどうかのフラグ（モーダルスクロールとの競合を防ぐ）
  const isPinchingRef = useRef(false);

  const applyTransform = useCallback(() => {
    if (!imgRef.current) return;
    imgRef.current.style.transform = `translate(${translateRef.current.x}px, ${translateRef.current.y}px) scale(${scaleRef.current})`;
  }, []);

  const clampTranslate = useCallback((scale: number) => {
    if (!containerRef.current || !imgRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const imgNaturalW = imgRef.current.naturalWidth || containerW;
    const imgNaturalH = imgRef.current.naturalHeight || containerH;
    const displayedW = Math.min(containerW, imgNaturalW) * scale;
    const displayedH = (displayedW / imgNaturalW) * imgNaturalH;
    const maxX = Math.max(0, (displayedW - containerW) / 2);
    const maxY = Math.max(0, (displayedH - containerH) / 2);
    translateRef.current.x = Math.max(-maxX, Math.min(maxX, translateRef.current.x));
    translateRef.current.y = Math.max(-maxY, Math.min(maxY, translateRef.current.y));
  }, []);

  // ネイティブタッチイベントをuseEffectで登録（passive:falseでpreventDefault可能にする）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // ピンチ開始
        isPinchingRef.current = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastDistRef.current = Math.sqrt(dx * dx + dy * dy);
        lastTouchRef.current = null;
        e.preventDefault();
      } else if (e.touches.length === 1 && scaleRef.current > 1) {
        // 拡大中の1本指パン
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        // scale>1時は親スクロールを止めてパン操作を優先
        e.preventDefault();
      } else {
        // scale=1 の1本指タッチ → モーダルのスクロールに委ねる
        lastTouchRef.current = null;
        isPinchingRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastDistRef.current !== null) {
          const delta = dist / lastDistRef.current;
          scaleRef.current = Math.max(1, Math.min(4, scaleRef.current * delta));
          clampTranslate(scaleRef.current);
          applyTransform();
        }
        lastDistRef.current = dist;
      } else if (e.touches.length === 1 && scaleRef.current > 1 && lastTouchRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        translateRef.current.x += dx;
        translateRef.current.y += dy;
        clampTranslate(scaleRef.current);
        applyTransform();
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      // scale=1 の1本指は何もしない → 親要素のスクロールが動く
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastDistRef.current = null;
        isPinchingRef.current = false;
      }
      if (e.touches.length === 0) {
        if (scaleRef.current <= 1) {
          scaleRef.current = 1;
          translateRef.current = { x: 0, y: 0 };
          applyTransform();
        }
        lastTouchRef.current = null;
      }
    };

    // passive: false にして必要な場合のみ preventDefault を呼べるようにする
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [applyTransform, clampTranslate]);

  const handleDoubleClick = useCallback(() => {
    if (scaleRef.current > 1) {
      scaleRef.current = 1;
      translateRef.current = { x: 0, y: 0 };
    } else {
      scaleRef.current = 2;
    }
    applyTransform();
  }, [applyTransform]);

  return (
    <div
      ref={containerRef}
      // touch-auto: scale=1時はブラウザのネイティブスクロールを許可
      // touch-none はuseEffectのネイティブイベントで必要な場合のみ制御
      className={fullscreen
        ? "overflow-hidden touch-none select-none relative w-full h-full flex items-center justify-center"
        : "overflow-hidden bg-muted/10 touch-auto select-none relative group/pz"}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={fullscreen
          ? "max-w-full max-h-full object-contain transition-none origin-center"
          : "w-full object-contain transition-none origin-center"}
        style={{ willChange: "transform" }}
        onDoubleClick={handleDoubleClick}
        draggable={false}
      />
      {/* ライトボックスで全画面表示ボタン */}
      {onClickLightbox && (
        <button
          onClick={onClickLightbox}
          className="absolute top-2 left-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/pz:opacity-100 transition-opacity"
          title="全画面で表示"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}
      {!fullscreen && (
        <div className="text-center text-xs text-muted-foreground py-1">
          ピンチで拡大・ダブルタップでリセット
        </div>
      )}
    </div>
  );
}

// ========== スケジュールコメントセクション ==========

function ScheduleCommentSection({ team, day }: { team: string; day: string }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [commentText, setCommentText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);

  const REACTION_EMOJIS = ["👍", "✅", "❤️", "🙏", "😊", "💪"];

  const { data: comments, isLoading } = trpc.schedule.getComments.useQuery(
    { team: team as any, day: day as any },
    { staleTime: 30 * 1000 }
  );

  const addMutation = trpc.schedule.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      utils.schedule.getComments.invalidate({ team: team as any, day: day as any });
      toast.success("コメントを投稿しました");
    },
    onError: (e) => toast.error(`投稿失敗: ${e.message}`),
  });

  const deleteMutation = trpc.schedule.deleteComment.useMutation({
    onSuccess: () => {
      utils.schedule.getComments.invalidate({ team: team as any, day: day as any });
      toast.success("削除しました");
    },
    onError: (e) => toast.error(`削除失敗: ${e.message}`),
  });

  const updateMutation = trpc.schedule.updateComment.useMutation({
    onSuccess: () => {
      setEditingId(null);
      setEditText("");
      utils.schedule.getComments.invalidate({ team: team as any, day: day as any });
      toast.success("編集しました");
    },
    onError: (e) => toast.error(`編集失敗: ${e.message}`),
  });

  const toggleReactionMutation = trpc.schedule.toggleReaction.useMutation({
    onSuccess: () => {
      utils.schedule.getComments.invalidate({ team: team as any, day: day as any });
    },
    onError: (e) => toast.error(`リアクション失敗: ${e.message}`),
  });

  const handleSubmit = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    addMutation.mutate({ team: team as any, day: day as any, content: trimmed });
  };

  const handleEditStart = (id: number, content: string) => {
    setEditingId(id);
    setEditText(content);
  };

  const handleEditSave = () => {
    if (!editingId) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    updateMutation.mutate({ id: editingId, content: trimmed });
  };

  const handleToggleReaction = (commentId: number, emoji: string) => {
    if (!user) return;
    toggleReactionMutation.mutate({ commentId, emoji });
  };

  const commentCount = comments?.length ?? 0;

  return (
    <div className="border-t border-border/50 bg-muted/10">
      {/* コメントアコーディオンヘッダー */}
      <button
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="font-medium">申し送り・コメント</span>
          {commentCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 text-xs font-bold rounded-full bg-primary text-primary-foreground">
              {commentCount > 9 ? "9+" : commentCount}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* コメント投稿フォーム（ログイン時のみ） */}
          {user && (
            <div className="flex gap-2">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="申し送り事項を入力..."
                className="text-xs min-h-[60px] resize-none flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
                }}
              />
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!commentText.trim() || addMutation.isPending}
                className="self-end"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          {/* コメント一覧 */}
          {isLoading ? (
            <div className="space-y-1.5 py-1">
              {[1,2].map(i => (
                <div key={i} className="h-8 bg-muted/60 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : comments && comments.length > 0 ? (
            <div className="space-y-2">
              {comments.map((c) => {
                // リアクションを絵文字ごとにグループ化
                const reactionGroups = REACTION_EMOJIS.map((emoji) => {
                  const reactors = (c.reactions ?? []).filter((r) => r.emoji === emoji);
                  const hasReacted = reactors.some((r) => r.userId === user?.id);
                  return { emoji, count: reactors.length, hasReacted, names: reactors.map((r) => r.userName) };
                }).filter((g) => g.count > 0 || false);

                return (
                  <div key={c.id} className="bg-background/60 rounded-lg px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-foreground">{c.userName}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(c.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {editingId === c.id ? (
                          <div className="flex gap-2 mt-1">
                            <Textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="text-xs min-h-[50px] resize-none flex-1"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleEditSave();
                                if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                              }}
                            />
                            <div className="flex flex-col gap-1">
                              <Button size="sm" onClick={handleEditSave} disabled={!editText.trim() || updateMutation.isPending} className="h-7 px-2">
                                <Send className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditText(""); }} className="h-7 px-2">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-foreground whitespace-pre-wrap break-words">{c.content}</p>
                        )}
                      </div>
                      {/* 全スタッフが編集・削除可能 */}
                      {user && editingId !== c.id && (
                        <div className="flex gap-1 flex-shrink-0 mt-0.5">
                          <button
                            onClick={() => handleEditStart(c.id, c.content)}
                            className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="編集"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingCommentId(c.id)}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            disabled={deleteMutation.isPending}
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* リアクション表示エリア */}
                    {editingId !== c.id && (
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        {/* 既存リアクションバッジ */}
                        {reactionGroups.map(({ emoji, count, hasReacted, names }) => (
                          <Popover key={emoji}>
                            <PopoverTrigger asChild>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleReaction(c.id, emoji); }}
                                className={cn(
                                  "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-colors",
                                  hasReacted
                                    ? "bg-primary/15 border-primary/40 text-primary font-medium"
                                    : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <span>{emoji}</span>
                                <span>{count}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="w-auto max-w-[200px] p-2">
                              <div className="text-xs text-muted-foreground">
                                <p className="font-semibold text-foreground mb-1">{emoji} リアクションしたスタッフ</p>
                                {names.map((name, i) => (
                                  <p key={i} className="leading-5">{name}</p>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ))}
                        {/* リアクション追加ボタン */}
                        {user && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted transition-colors">
                                <SmilePlus className="w-3 h-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="w-auto p-2">
                              <div className="flex gap-1">
                                {REACTION_EMOJIS.map((emoji) => {
                                  const alreadyReacted = (c.reactions ?? []).some((r) => r.emoji === emoji && r.userId === user.id);
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => handleToggleReaction(c.id, emoji)}
                                      className={cn(
                                        "text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-muted",
                                        alreadyReacted && "bg-primary/15 ring-1 ring-primary/40"
                                      )}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
           ) : (
            <div className="text-xs text-muted-foreground py-2 text-center">コメントはまだありません</div>
          )}
        </div>
      )}
      {/* 申し送りコメント削除確認ダイアログ */}
      <AlertDialog open={deletingCommentId !== null} onOpenChange={(open) => { if (!open) setDeletingCommentId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>コメントを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。本当に削除しますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingCommentId(null)}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingCommentId !== null) {
                  deleteMutation.mutate({ id: deletingCommentId });
                  setDeletingCommentId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
// ========== 全チームスケジュールモーダル（スクロール位置保持対応） ==========

type ScheduleAllTeamsModalProps = {
  viewMeta: { team: string; day: string; uploadedByName: string | null; updatedAt: Date };
  screenshots: Array<{ id: number; team: string; day: string; imageUrl: string | null | undefined; uploadedByName: string | null | undefined; updatedAt: Date }>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onDayChange: (d: DayType) => void;
  onLightbox: (src: string, alt: string) => void;
};

function ScheduleAllTeamsModal({ viewMeta, screenshots, scrollRef, onClose, onDayChange, onLightbox }: ScheduleAllTeamsModalProps) {
  const allTeamSlides = TEAMS.map((team) => ({
    team,
    screenshot: screenshots.find((s) => s.team === team && s.day === viewMeta.day) ?? null,
  }));
  const registeredCount = allTeamSlides.filter((s) => s.screenshot !== null).length;

  // 各日付にスクショが1枚以上あるかチェック（未アップ日付はタブをグレーアウト）
  const dayHasScreenshot = (d: DayType) =>
    screenshots.some((s) => s.day === d && s.imageUrl);

  // 「前の日付へ」「次の日付へ」スキップ（スクショがある日付のみ）
  const daysWithScreenshot = DAYS.filter(dayHasScreenshot);
  const currentDayIdx = daysWithScreenshot.indexOf(viewMeta.day as DayType);
  const prevDay = currentDayIdx > 0 ? daysWithScreenshot[currentDayIdx - 1] : null;
  const nextDay = currentDayIdx < daysWithScreenshot.length - 1 ? daysWithScreenshot[currentDayIdx + 1] : null;

  const teamSectionId = (team: string) => `modal-team-${team.replace(/\s/g, "-")}`;

  const scrollToTeam = (team: string) => {
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector(`#${teamSectionId(team)}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ESCキーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // スワイプで日付切り替え（スクショある日付のみスキップ）
  const modalSwipeTouchStartX = useRef<number | null>(null);
  const modalSwipeTouchStartY = useRef<number | null>(null);
  const handleModalSwipeTouchStart = (e: React.TouchEvent) => {
    modalSwipeTouchStartX.current = e.touches[0].clientX;
    modalSwipeTouchStartY.current = e.touches[0].clientY;
  };
  const handleModalSwipeTouchEnd = (e: React.TouchEvent) => {
    if (modalSwipeTouchStartX.current === null || modalSwipeTouchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - modalSwipeTouchStartX.current;
    const dy = e.changedTouches[0].clientY - modalSwipeTouchStartY.current;
    modalSwipeTouchStartX.current = null;
    modalSwipeTouchStartY.current = null;
    // 水平スワイプが垂直より大きく、5px以上の場合のみ反応
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 50) return;
    if (dx < 0 && nextDay) {
      onDayChange(nextDay);
    } else if (dx > 0 && prevDay) {
      onDayChange(prevDay);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="fixed inset-0 z-[80] bg-black/85 overflow-y-auto animate-fade-in-overlay"
      onClick={onClose}
      onTouchStart={handleModalSwipeTouchStart}
      onTouchEnd={handleModalSwipeTouchEnd}
    >
      <div
        className="relative max-w-2xl w-full mx-auto bg-card text-card-foreground rounded-xl shadow-2xl mt-4 mb-10 animate-slide-up-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー（sticky） */}
        <div className="flex flex-col gap-2 px-4 pt-3 pb-2 border-b border-border sticky top-0 bg-card z-10 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">訪問スケジュール（全チーム）</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {registeredCount}/{TEAMS.length}チーム登録済み
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* 今日/明日/2日後/3日後/4日後タブ（スクショなしはグレーアウト） */}
          <div className="flex gap-1 flex-wrap items-center">
            {prevDay && (
              <button
                onClick={() => onDayChange(prevDay)}
                className="flex items-center gap-0.5 px-2 py-1.5 text-xs font-medium rounded-full bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-border/50"
                title={`${prevDay}へ`}
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
            )}
            {DAYS.map((d, idx) => {
              const hasData = dayHasScreenshot(d);
              const isToday = idx === 0;
              return (
                <button
                  key={d}
                  onClick={() => hasData ? onDayChange(d) : undefined}
                  disabled={!hasData}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-full transition-colors",
                    viewMeta.day === d
                      ? "bg-primary text-primary-foreground font-bold"
                      : hasData
                        ? isToday
                          ? "bg-primary/10 text-primary font-bold border border-primary/40 hover:bg-primary/20"
                          : "bg-muted text-muted-foreground font-semibold hover:bg-muted/80"
                        : "bg-muted/30 text-muted-foreground/40 cursor-not-allowed line-through font-semibold"
                  )}
                  title={!hasData ? `${d}：スクショ未登録` : d}
                >
                  {getDayLabel(idx)}
                </button>
              );
            })}
            {nextDay && (
              <button
                onClick={() => onDayChange(nextDay)}
                className="flex items-center gap-0.5 px-2 py-1.5 text-xs font-medium rounded-full bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-border/50"
                title={`${nextDay}へ`}
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {/* チームジャンプボタン行 */}
          <div className="flex gap-1 flex-wrap">
            {TEAMS.map((team) => (
              <button
                key={team}
                onClick={() => scrollToTeam(team)}
                className="px-3 py-1 text-xs font-medium rounded-full bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-border/50"
              >
                {team}
              </button>
            ))}
          </div>
        </div>

        {/* 全チームの画像を縦スクロールで表示（未登録チームも含む） */}
        <div className="divide-y divide-border">
          {allTeamSlides.map(({ team, screenshot }, idx) => {
            const nextTeam = allTeamSlides[idx + 1]?.team ?? null;
            const isLast = idx === allTeamSlides.length - 1;
            return (
              <div key={team} id={teamSectionId(team)}>
                {/* チーム名ラベル */}
                <div className="flex items-center justify-between px-4 py-2 bg-muted/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{team}チーム</span>
                    {screenshot?.uploadedByName && (
                      <span className="text-xs text-muted-foreground">· {screenshot.uploadedByName}</span>
                    )}
                    {!screenshot && (
                      <span className="text-xs text-muted-foreground italic">未登録</span>
                    )}
                  </div>
                  {screenshot && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(screenshot.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 登録
                    </span>
                  )}
                </div>
                {screenshot?.imageUrl ? (
                  <PinchZoomImage
                    src={screenshot.imageUrl}
                    alt={`${team}チーム ${viewMeta.day}のスケジュール`}
                    onClickLightbox={() => {
                      if (screenshot.imageUrl) onLightbox(screenshot.imageUrl, `${team}チーム ${viewMeta.day}のスケジュール`);
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-24 bg-muted/20 text-muted-foreground gap-1">
                    <Calendar className="w-6 h-6 opacity-30" />
                    <span className="text-xs">まだ登録されていません</span>
                  </div>
                )}
                {/* 申し送り・コメントセクション */}
                <ScheduleCommentSection team={team} day={viewMeta.day} />
                {/* 次のチームへボタン */}
                <div className="flex justify-end px-3 py-2 bg-muted/20">
                  {!isLast && nextTeam ? (
                    <button
                      onClick={() => scrollToTeam(nextTeam)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      {nextTeam}チームへ
                    </button>
                  ) : (
                    <button
                      onClick={() => scrollToTeam(TEAMS[0])}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                      先頭に戻る
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ========== ZESTスクリーンショットカード（tRPC+S3+DB版）==========

// 今日から offset 日後の日付を「M/D(曜)」形式で返す
function getDayLabel(offset: number): string {
  const WDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getMonth() + 1}/${d.getDate()}(${WDAYS[d.getDay()]})`;
}

function ScheduleScreenshotCard() {
  const { user } = useAuth();
  const SCHEDULE_TEAM_KEY = "hinata_schedule_team";
  const SCHEDULE_ALL_TEAMS_KEY = "hinata_schedule_all_teams";
  const VALID_SCHEDULE_TEAMS: TeamType[] = ["身体", "天理", "郡山北部", "郡山南部"];

  // 実際の日付ラベルを状態管理（日付変更時に自動更新）
  const [dayLabels, setDayLabels] = useState<string[]>(() =>
    [0, 1, 2, 3, 4].map(getDayLabel)
  );

  // 日付変更を監視して自動更新
  useEffect(() => {
    const updateLabels = () => setDayLabels([0, 1, 2, 3, 4].map(getDayLabel));
    // 翌日0時0分1秒に更新するタイマーを設定
    const scheduleNextUpdate = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      return setTimeout(() => {
        updateLabels();
        // 以降は24時間ごとに更新
        const interval = setInterval(updateLabels, 24 * 60 * 60 * 1000);
        return () => clearInterval(interval);
      }, msUntilMidnight);
    };
    const timer = scheduleNextUpdate();
    return () => clearTimeout(timer);
  }, []);

  const [selectedTeam, setSelectedTeamRaw] = useState<TeamType>(() => {
    try {
      const saved = localStorage.getItem(SCHEDULE_TEAM_KEY);
      if (saved && VALID_SCHEDULE_TEAMS.includes(saved as TeamType)) return saved as TeamType;
    } catch {}
    return "身体";
  });
  const setSelectedTeam = (value: TeamType) => {
    setSelectedTeamRaw(value);
    try { localStorage.setItem(SCHEDULE_TEAM_KEY, value); } catch {}
  };

  // 初回ロード時、localStorageに保存値がない場合はユーザーの所属チームをデフォルト選択
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCHEDULE_TEAM_KEY);
      if (!saved || !VALID_SCHEDULE_TEAMS.includes(saved as TeamType)) {
        const t = user?.team;
        if (t && VALID_SCHEDULE_TEAMS.includes(t as TeamType)) {
          setSelectedTeamRaw(t as TeamType);
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.team]);

  // デフォルトで全チームモードを有効にする
  const [selectedDay, setSelectedDay] = useState<DayType>("今日");
  const [isDragging, setIsDragging] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewMeta, setViewMeta] = useState<{ team: string; day: string; uploadedByName: string | null; updatedAt: Date } | null>(null);
  const [modalSlideIndex, setModalSlideIndex] = useState(0);
  const modalTouchStartX = useRef<number | null>(null);
  const modalTouchStartY = useRef<number | null>(null);
  // 個別ライトボックス（1枚フルスクリーン表示）
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  // 全チームモード（localStorage永続化）
  const [showAllTeams, setShowAllTeamsRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(SCHEDULE_ALL_TEAMS_KEY);
      if (saved === "false") return false;
    } catch {}
    return true; // デフォルトで全チーム表示
  });
  const setShowAllTeams = (value: boolean) => {
    setShowAllTeamsRaw(value);
    try { localStorage.setItem(SCHEDULE_ALL_TEAMS_KEY, String(value)); } catch {}
  };

  // スワイプ用state
  const [swipeIndex, setSwipeIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // ユーザーのデフォルトチームを取得
  const { data: myTeamData } = trpc.userSettings.getMyTeam.useQuery();
  // invalidateしない：チーム切替後にmyTeamDataが再取得されてuseEffectが再実行されるのを防ぐ
  const setMyTeamMutation = trpc.userSettings.setMyTeam.useMutation();
  // 初回のみデフォルトチームを設定するフラグ（手動切替後は上書きしない）
  const teamInitializedRef = useRef(false);
  // ユーザーのチームが取得できたら初回のみデフォルト選択を更新
  useEffect(() => {
    if (teamInitializedRef.current) return; // 既に初期化済みなら何もしない
    const validTeams: TeamType[] = ["身体", "天理", "郡山北部", "郡山南部"];
    // auth.meのteamを優先、なければuserSettings.getMyTeamを使用
    const team = (user?.team && validTeams.includes(user.team as TeamType))
      ? user.team as TeamType
      : (myTeamData?.team && validTeams.includes(myTeamData.team as TeamType))
        ? myTeamData.team as TeamType
        : null;
    if (team) {
      teamInitializedRef.current = true;
      // localStorageに保存済みの場合はその値を尊重（手動変更を上書きしない）
      const hasSavedPrefs = (() => {
        try {
          return localStorage.getItem("hinata_schedule_team") !== null ||
                 localStorage.getItem("hinata_schedule_all_teams") !== null;
        } catch { return false; }
      })();
      if (!hasSavedPrefs) {
        // 初回アクセス（localStorage未保存）の場合はデフォルト設定
        setSelectedTeam(team);
        setShowAllTeams(false);
      }
    } else if (!teamInitializedRef.current) {
      // 全チーム所属・事務員の場合は「全チーム」表示をデフォルトに設定
      const isAllOrAdmin = (user?.team === "全チーム" || user?.team === "事務員") ||
                           (myTeamData?.team === "全チーム" || myTeamData?.team === "事務員");
      if (isAllOrAdmin) {
        teamInitializedRef.current = true;
        const hasSavedPrefs = (() => {
          try {
            return localStorage.getItem("hinata_schedule_team") !== null ||
                   localStorage.getItem("hinata_schedule_all_teams") !== null;
          } catch { return false; }
        })();
        if (!hasSavedPrefs) {
          setShowAllTeams(true);
        }
      }
    }
  }, [user?.team, myTeamData?.team]);

  // ESCキーでモーダル・ライトボックスを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxSrc) {
          setLightboxSrc(null);
        } else if (viewMeta) {
          setViewUrl(null);
          setViewMeta(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxSrc, viewMeta]);

  // 全スクショ一覧を取得（30秒ごとに自動更新、SSEによる即時更新も対応）
  const { data: screenshots, isLoading: screenshotsLoading } = trpc.schedule.getAll.useQuery(undefined, {
    refetchInterval: 30 * 1000,
    staleTime: 0,
  });

  const uploadMutation = trpc.schedule.upload.useMutation({
    onSuccess: () => {
      utils.schedule.getAll.invalidate();
      toast.success(`${selectedTeam} / ${selectedDay} のスクリーンショットを登録しました`);
      setIsUploading(false);
    },
    onError: (e) => {
      toast.error(`アップロード失敗: ${e.message}`);
      setIsUploading(false);
    },
  });

  const deleteMutation = trpc.schedule.delete.useMutation({
    onSuccess: () => {
      utils.schedule.getAll.invalidate();
      toast.success("削除しました");
    },
    onError: (e) => toast.error(`削除失敗: ${e.message}`),
  });

  // 現在選択中のスクショ
  const currentScreenshot = screenshots?.find(
    (s) => s.team === selectedTeam && s.day === selectedDay
  );

  // スワイプ用：全チームモードは全チーム×全日程を並べる、単一チームモードは選択中チームの「今日」「明日」
  const swipeSlides = showAllTeams
    ? TEAMS.flatMap((team) =>
        DAYS.map((day) => ({
          team,
          day,
          screenshot: screenshots?.find((s) => s.team === team && s.day === day) ?? null,
        }))
      )
    : DAYS.map((day) => ({
        team: selectedTeam,
        day,
        screenshot: screenshots?.find((s) => s.team === selectedTeam && s.day === day) ?? null,
      }));

  // スワイプインデックスを選択日に同期（全チームモードでは先頭から開始）
  const currentSlideIndex = showAllTeams
    ? swipeIndex
    : DAYS.indexOf(selectedDay);

  const goToSlide = (idx: number) => {
    const maxIdx = swipeSlides.length - 1;
    const clamped = Math.max(0, Math.min(maxIdx, idx));
    setSwipeIndex(clamped);
    if (!showAllTeams) {
      setSelectedDay(DAYS[clamped]);
    } else {
      // 全チームモードでは選択中スライドのチーム・日に同期
      const slide = swipeSlides[clamped];
      if (slide) {
        setSelectedTeam(slide.team as TeamType);
        setSelectedDay(slide.day as DayType);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // 水平方向のスワイプが垂直より大きい場合のみ反応
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) goToSlide(currentSlideIndex + 1);
      else goToSlide(currentSlideIndex - 1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("画像ファイルを選択してください");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("ファイルサイズは10MB以下にしてください");
        return;
      }
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        uploadMutation.mutate({
          team: selectedTeam,
          day: selectedDay,
          imageDataUrl: dataUrl,
          mimeType: file.type,
        });
      };
      reader.readAsDataURL(file);
    },
    [selectedTeam, selectedDay, uploadMutation]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDelete = () => {
    deleteMutation.mutate({ team: selectedTeam, day: selectedDay });
  };

  const handleTeamChange = (t: TeamType) => {
    setSelectedTeam(t);
    // チームをデフォルトとして保存
    setMyTeamMutation.mutate({ team: t });
  };

  return (
    <>
      <Card className="fade-in-up stagger-2 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Calendar className="w-5 h-5 text-primary" />
              <span className="tracking-wide">訪問スケジュール</span>
            </CardTitle>
            <button
              onClick={() => openLink("https://homecare.zest.jp/login")}
              className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              ZESTで確認・変更
            </button>
          </div>

          {/* チーム・日付セレクター */}
          <div className="flex flex-wrap gap-2 mt-2">
            <div className="grid grid-cols-5 gap-1 w-full">
              {/* 全チームボタン */}
              <button
                onClick={() => {
                  setShowAllTeams(true);
                  setSwipeIndex(0);
                }}
                className={cn(
                  "text-xs px-1 py-1.5 rounded-md border transition-all font-medium text-center",
                  getTeamButtonClass("全チーム", showAllTeams)
                )}
                style={getAllTeamButtonStyle(showAllTeams)}
              >
                全チーム
              </button>
              {TEAMS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setShowAllTeams(false);
                    setSwipeIndex(DAYS.indexOf(selectedDay));
                    handleTeamChange(t);
                  }}
                  className={cn(
                    "text-xs px-1 py-1.5 rounded-md transition-all font-medium text-center",
                    getTeamButtonClass(t, !showAllTeams && selectedTeam === t)
                  )}
                  style={getTeamButtonStyle(t, !showAllTeams && selectedTeam === t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {/* 単一チームモードのみ日付ボタンを表示 */}
            {!showAllTeams && (
              <div className="flex gap-1 ml-auto flex-wrap">
                {DAYS.map((d, idx) => {
                  const isToday = idx === 0;
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        setSelectedDay(d);
                        setSwipeIndex(DAYS.indexOf(d));
                      }}
                      className={cn(
                        "text-xs px-2 py-1 rounded-md border transition-colors",
                        selectedDay === d
                          ? "bg-primary text-white border-primary"
                          : isToday
                            ? "border-primary/60 text-primary font-bold hover:bg-primary/10"
                            : "border-border text-muted-foreground hover:bg-muted"
                      )}
                      title={d}
                    >
                      {isToday ? (
                        <span className="font-bold">{dayLabels[idx] ?? d}</span>
                      ) : (
                        dayLabels[idx] ?? d
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {screenshotsLoading ? (
            <div className="border rounded-xl p-8 flex items-center justify-center bg-muted/20 animate-pulse">
              <p className="text-xs text-muted-foreground">読み込み中...</p>
            </div>
          ) : (
            /* スワイプカルーセル */
            <div key={showAllTeams ? "all" : `${selectedTeam}-${selectedDay}`} className="space-y-2 animate-fade-in-overlay">
              <div
                className="relative overflow-hidden rounded-lg border border-border touch-pan-y"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* スライドコンテナ */}
                <div
                  className="flex transition-transform duration-300 ease-in-out"
                  style={{ transform: `translateX(-${currentSlideIndex * 100}%)` }}
                >
                  {swipeSlides.map(({ team, day, screenshot }, slideIdx) => (
                    <div key={`${team}-${day}`} className="w-full flex-shrink-0">
                      {screenshot ? (
                        <div
                          className="relative cursor-pointer group"
                          onClick={() => {
                            setViewUrl(screenshot.imageUrl);
                            setViewMeta({
                              team: screenshot.team,
                              day: screenshot.day,
                              uploadedByName: screenshot.uploadedByName,
                              updatedAt: screenshot.updatedAt,
                            });
                            setModalSlideIndex(slideIdx);
                          }}
                        >
                          <img
                            src={screenshot.imageUrl}
                            alt={`${team}チーム ${day}のスケジュール`}
                            className="w-full object-contain max-h-72"
                          />
                          {/* チーム・日仔ラベル（全チームモード時はチームカラーで常時表示） */}
                          {showAllTeams && (
                            <div
                              className="absolute top-2 left-2 text-white text-xs font-bold px-2.5 py-1 rounded-full pointer-events-none shadow-md"
                              style={{ backgroundColor: TEAM_COLOR_VALUES[team as TeamName]?.active ?? '#06b6d4' }}
                            >
                              {team} / {getDayLabel(DAYS.indexOf(day as DayType))}
                            </div>
                          )}
                          {/* タップで拡大ヒント */}
                          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 pointer-events-none">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                            タップで拡大
                          </div>
                          {/* 削除ボタン */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate({ team, day });
                            }}
                            disabled={deleteMutation.isPending}
                            className="absolute top-2 right-2 bg-black/30 hover:bg-red-500/80 text-white/70 hover:text-white rounded-full p-1.5 shadow transition-all duration-200 opacity-70 hover:opacity-100"
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        /* 未登録プレースホルダー（全チームモードではコンパクトな表示、単一チームモードではドロップゾーン） */
                        showAllTeams ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-10 bg-muted/20 rounded-lg">
                            <div className="text-sm font-semibold text-foreground">{team}チーム / {getDayLabel(DAYS.indexOf(day as DayType))}</div>
                            <p className="text-xs text-muted-foreground">未登録</p>
                          </div>
                        ) : (
                          <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => !isUploading && fileInputRef.current?.click()}
                            className={cn(
                              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
                              isUploading ? "border-primary bg-primary/5 opacity-70 cursor-wait" :
                              isDragging
                                ? "border-primary bg-primary/5 scale-[1.01]"
                                : "border-border hover:border-primary/50 hover:bg-muted/30"
                            )}
                          >
                            <div className="flex flex-col items-center gap-2.5">
                              <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors", isDragging ? "bg-primary/20" : "bg-muted")}>
                                <Upload className={cn("w-6 h-6 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {isUploading ? "アップロード中..." : isDragging ? "ここにドロップ" : "クリックまたはドラッグ＆ドロップ"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">ZESTのスクリーンショットを登録</p>
                                <p className="text-xs text-primary font-medium mt-1.5">{team}チーム / {day}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">PNG・JPG・WEBP対応 / 最大10MB</p>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>

                {/* 左右矢印ボタン */}
                {currentSlideIndex > 0 && (
                  <button
                    onClick={() => goToSlide(currentSlideIndex - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors z-10"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                {currentSlideIndex < swipeSlides.length - 1 && (
                  <button
                    onClick={() => goToSlide(currentSlideIndex + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors z-10"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* ページインジケーター（ドット） */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {swipeSlides.map(({ team, day }, idx) => (
                  <button
                    key={`${team}-${day}`}
                    onClick={() => goToSlide(idx)}
                    className={cn(
                      "transition-all rounded-full",
                      idx === currentSlideIndex
                        ? "w-6 h-2 bg-primary"
                        : "w-2 h-2 bg-muted-foreground/40 hover:bg-muted-foreground/70"
                    )}
                    title={showAllTeams ? `${team} / ${day}` : day}
                  />
                ))}
              </div>

              {/* メタ情報行 */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {selectedTeam}チーム / {dayLabels[DAYS.indexOf(selectedDay)] ?? selectedDay}
                  {currentScreenshot?.uploadedByName && ` ・ ${currentScreenshot.uploadedByName}`}
                  {currentScreenshot && ` ・ ${new Date(currentScreenshot.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 登録`}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95",
                    isUploading
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : currentScreenshot
                        ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                        : "bg-primary text-primary-foreground shadow-sm hover:opacity-90"
                  )}
                >
                  {isUploading ? (
                    <><RefreshCw className="w-3 h-3 animate-spin" /> 更新中...</>
                  ) : currentScreenshot ? (
                    <><RefreshCw className="w-3 h-3" /> 更新</>
                  ) : (
                    <><Upload className="w-3 h-3" /> 登録</>
                  )}
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </CardContent>
      </Card>

      {/* 拡大モーダル（縦スクロールで全チームの今日分を一覧表示） */}
      {viewMeta && createPortal((
        <ScheduleAllTeamsModal
          viewMeta={viewMeta}
          screenshots={screenshots ?? []}
          scrollRef={modalScrollRef}
          onClose={() => { setViewUrl(null); setViewMeta(null); }}
          onDayChange={(d) => setViewMeta({ ...viewMeta, day: d })}
          onLightbox={(src, alt) => { setLightboxSrc(src); setLightboxAlt(alt); }}
        />
      ), document.body)}



      {/* 個別ライトボックス（1枚フルスクリーン表示） */}
      {lightboxSrc && createPortal((
        <div
          className="fixed inset-0 z-[90] bg-black/95 animate-fade-in-overlay"
          onClick={() => setLightboxSrc(null)}
        >
          {/* 閉じるボタン */}
          <button
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors z-10"
            onClick={() => setLightboxSrc(null)}
            title="閉じる（ESC）"
          >
            <X className="w-6 h-6" />
          </button>
          {/* ピンチズーム・ダブルタップ対応画像（クリックで閉じないようstopPropagation） */}
          <div
            className="absolute inset-0 flex items-center justify-center animate-scale-up-image"
            onClick={(e) => e.stopPropagation()}
          >
            <PinchZoomImage
              src={lightboxSrc}
              alt={lightboxAlt}
              fullscreen
            />
          </div>
          {/* キャプション */}
          <div className="absolute bottom-4 left-0 right-0 text-center text-white/85 text-xs pointer-events-none z-10">
            {lightboxAlt} — ピンチで拡大・ダブルタップでリセット・四隅のクリックまたはESCで閉じる
          </div>
        </div>
      ), document.body)}
    </>
  );
}

// ========== スクリーンショットアップロード履歴カード ==========
function ScreenshotUploadHistoryCard() {
  const { isNight } = useTheme();
  const { data: logs, isLoading } = trpc.schedule.getUploadLogs.useQuery(
    { limit: 10 },
    { refetchInterval: 30 * 1000, staleTime: 15 * 1000 }
  );

  const teamColors: Record<string, string> = {
    "身体": "bg-blue-100 text-blue-700",
    "天理": "bg-green-100 text-green-700",
    "郡山北部": "bg-orange-100 text-orange-700",
    "郡山南部": "bg-purple-100 text-purple-700",
  };

  const teamColorsDark: Record<string, string> = {
    "身体": "bg-blue-900/40 text-blue-300",
    "天理": "bg-green-900/40 text-green-300",
    "郡山北部": "bg-orange-900/40 text-orange-300",
    "郡山南部": "bg-purple-900/40 text-purple-300",
  };

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "たった今";
    if (diffMin < 60) return `${diffMin}分前`;
    if (diffHour < 24) return `${diffHour}時間前`;
    if (diffDay < 7) return `${diffDay}日前`;
    return new Date(date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  }

  return (
    <Card className={cn("fade-in-up shadow-sm", isNight ? "bg-slate-800/60 border-slate-700" : "")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          スケジュール更新履歴
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <History className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">まだアップロード履歴がありません</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                  isNight ? "bg-slate-700/50" : "bg-muted/40"
                )}
              >
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap",
                  isNight
                    ? (teamColorsDark[log.team] ?? "bg-slate-600 text-slate-300")
                    : (teamColors[log.team] ?? "bg-muted text-muted-foreground")
                )}>
                  {log.team}
                </span>
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded border whitespace-nowrap",
                  isNight ? "border-slate-600 text-slate-400" : "border-border text-muted-foreground"
                )}>
                  {log.day}
                </span>
                <span className={cn("flex-1 text-xs font-medium truncate", isNight ? "text-slate-200" : "text-foreground")}>
                  {log.uploadedByName ?? "不明"}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendChart() {
  return (
    <Card className="fade-in-up stagger-2 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          2025年 訪問件数推移
        </CardTitle>
        <p className="text-xs text-muted-foreground">1日平均訪問件数（目標: 71件/日）</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[45, 75]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e0d8" }}
              formatter={(value: number) => [`${value} 件/日`, "平日平均訪問件数"]}
            />
            <Bar dataKey="平日平均訪問件数" fill="#F97316" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey={() => 71}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PatientTrendChart() {
  return (
    <Card className="fade-in-up stagger-3 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          利用者数推移
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[175, 205]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e0d8" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="利用者数" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="新規" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} />
            <Line type="monotone" dataKey="終了" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// タブ定義
const TOOLS_TABS = [
  { id: "sheet", label: "📊", title: "スプレッドシート" },
  { id: "doc",   label: "📄", title: "ドキュメント" },
  { id: "form",  label: "📝", title: "フォーム" },
  { id: "other", label: "🔗", title: "その他" },
  { id: "mine",  label: "⭐", title: "マイリンク" },
] as const;
type ToolsTabId = typeof TOOLS_TABS[number]["id"];

// リンク行コンポーネント
const DAILY_REPORT_SPREADSHEET_ID = "10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs";

function LinkRow({ href, label, color, colorStyle, emoji, onAddToMyLinks, isInMyLinks }: { href: string; label: string; color?: string; colorStyle?: React.CSSProperties; emoji?: string; onAddToMyLinks?: () => void; isInMyLinks?: boolean }) {
  const { isNight } = useTheme();
  const [isOpening, setIsOpening] = useState(false);
  const utils = trpc.useUtils();
  // colorStyle優先。colorが指定されている場合は夜間モード変換を適用
  const nightColor = color ? color.replace(/-600$/, "-400").replace(/-700$/, "-300") : undefined;

  const isDailyReport = href.includes(DAILY_REPORT_SPREADSHEET_ID);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isDailyReport) return; // 業務日報以外は通常のリンク動作
    e.preventDefault();
    setIsOpening(true);
    try {
      // hrefからスプレッドシートIDを抽出（当月URLが差し替えられている場合はそちらを優先）
      const spreadsheetIdMatch = href.match(/\/spreadsheets\/d\/([^/?#]+)/);
      const spreadsheetId = spreadsheetIdMatch ? spreadsheetIdMatch[1] : DAILY_REPORT_SPREADSHEET_ID;
      const result = await utils.spreadsheetLinks.getDailyReportSheetGid.fetch({ spreadsheetId });
      if (result.gid !== null) {
        window.open(
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${result.gid}`,
          "_blank",
          "noopener,noreferrer"
        );
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    } finally {
      setIsOpening(false);
    }
  };

  // colorStyle が渡された場合、昇夜モード共にチームカラーを適用する
  // 昇モード: colorStyle（チームの昇色）、夜モード: colorStyle（チームの夜色）
  const resolvedStyle: React.CSSProperties = colorStyle ? colorStyle : {};

  return (
    <div className="flex items-center gap-1">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        onPointerDown={() => {}}
        className={cn(
          "flex-1 flex items-center gap-2 text-sm py-2.5 px-3 rounded-md min-w-0",
          "bg-muted/50 hover:bg-muted transition-all duration-200 font-medium hover:-translate-y-0.5 hover:shadow-sm active:scale-95 select-none",
          isOpening ? "opacity-60 cursor-wait" : "",
          // colorStyleがある場合: 昇夜モード共にインラインスタイルに任せる（Tailwindクラスで色を上書きしない）
          // colorStyleがない場合: Tailwindクラスで色を適用（後方互换）
          colorStyle
            ? ""
            : (isNight ? (nightColor ?? "text-foreground") : (color ?? "text-foreground")),
        )}
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', ...resolvedStyle }}
      >
        {isOpening
          ? <span className="flex-shrink-0 w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : emoji ? <span className="flex-shrink-0">{emoji}</span> : <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className="truncate">{label}</span>
      </a>
      {onAddToMyLinks && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToMyLinks(); }}
          title={isInMyLinks ? "マイリンクに登録済み" : "マイリンクに追加"}
          className={cn(
            "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors",
            isInMyLinks
              ? "text-amber-500 bg-amber-50 dark:bg-amber-950/30"
              : "text-muted-foreground hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          )}
        >
          {isInMyLinks ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

/** スプレッドシートタブ内の「日々使用」「その他」サブタブ
 * 「日々使用」: 月次DB登録分（5種類）を自動表示
 * 「その他」: quickAccessLinksから取得
 */
function SheetSubTabs({ quickLinks, isAdmin = false }: { quickLinks: { id: number; label: string; href: string; color: string; emoji: string | null; category: string }[] | undefined; isAdmin?: boolean }) {
  const [subTab, setSubTab] = useState<"daily" | "other">("daily");
  // その他タブ用リンク（spreadsheetLinksテーブルのdisplayTarget=otherから取得）
  const { data: otherSheetLinks = [] } = trpc.spreadsheetLinks.getOther.useQuery();
  const deleteSheetLink = trpc.spreadsheetLinks.delete.useMutation({
    onSuccess: () => { utils.spreadsheetLinks.getOther.invalidate(); toast.success("削除しました"); },
    onError: (e) => toast.error(e.message),
  });
  const updateSheetLink = trpc.spreadsheetLinks.upsert.useMutation({
    onSuccess: () => { utils.spreadsheetLinks.getOther.invalidate(); toast.success("更新しました"); setEditingOtherId(null); },
    onError: (e) => toast.error(e.message),
  });
  const [editingOtherId, setEditingOtherId] = useState<number | null>(null);
  const [editOtherLabel, setEditOtherLabel] = useState("");
  const [editOtherUrl, setEditOtherUrl] = useState("");
  const [editOtherEmoji, setEditOtherEmoji] = useState("📁");
  const startEditOther = (link: { id: number; label: string; url: string; emoji?: string | null }) => {
    setEditingOtherId(link.id); setEditOtherLabel(link.label); setEditOtherUrl(link.url); setEditOtherEmoji(link.emoji ?? "📁");
  };
  const saveEditOther = (link: { linkKey: string; yearMonth: string }) => {
    if (!editOtherLabel.trim() || !editOtherUrl.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    updateSheetLink.mutate({ linkKey: link.linkKey, label: editOtherLabel.trim(), yearMonth: link.yearMonth, url: editOtherUrl.trim(), displayTarget: "other" });
  };
  // 月次リンク（当月分、なければ直近登録）
  const { data: monthlyLinks, isLoading: monthlyLoading } = trpc.spreadsheetLinks.getCurrent.useQuery();
  const utils = trpc.useUtils();
  // ソース追加フォームの状態
  const [showAddSourceForm, setShowAddSourceForm] = useState(false);
  const [newSourceLabel, setNewSourceLabel] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceEmoji, setNewSourceEmoji] = useState("📊");
  const upsertLink = trpc.spreadsheetLinks.upsert.useMutation({
    onSuccess: () => {
      utils.spreadsheetLinks.getCurrent.invalidate();
      toast.success("ソースを追加しました");
      setShowAddSourceForm(false);
      setNewSourceLabel("");
      setNewSourceUrl("");
      setNewSourceEmoji("📊");
    },
    onError: (e) => toast.error(e.message),
  });
  const addSource = () => {
    if (!newSourceLabel.trim() || !newSourceUrl.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // linkKeyはラベルをスネークケース化して使用
    const linkKey = `custom_${Date.now()}`;
    upsertLink.mutate({ linkKey, label: newSourceLabel.trim(), yearMonth, url: newSourceUrl.trim(), displayTarget: "common" });
  };
  // 当月年月（マウント時に一度計算）
  const currentYearMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  // 当月分か直近登録かを判定（バッジ表示用）
  const isCurrentMonth = monthlyLinks && monthlyLinks.length > 0 && monthlyLinks[0].yearMonth === currentYearMonth;
  // useMemoでフィルタリングをメモ化
  const otherLinks = useMemo(() => quickLinks?.filter((l) => l.category === "スプレッドシート（その他）") ?? [], [quickLinks]);

  return (
    <div className="space-y-2">
      {/* サブタブバー */}
      <div className="flex gap-1 bg-muted/30 rounded-md p-0.5">
        <button
          onClick={() => setSubTab("daily")}
          className={cn(
            "flex-1 py-1 text-xs font-medium rounded transition-all",
            subTab === "daily" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          📅 日々使用
        </button>
        <button
          onClick={() => setSubTab("other")}
          className={cn(
            "flex-1 py-1 text-xs font-medium rounded transition-all",
            subTab === "other" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          📁 その他
        </button>
      </div>

      {/* 日々使用タブ: 月次DB登録分 */}
      {subTab === "daily" && (
        <div className="space-y-1.5">
          {/* 年月バッジ */}
          {monthlyLinks && monthlyLinks.length > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              <span className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                isCurrentMonth
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              )}>
                {isCurrentMonth ? `✔ ${monthlyLinks[0].yearMonth}分` : `⚠ 最新: ${monthlyLinks[0].yearMonth}分`}
              </span>
              {!isCurrentMonth && (
                <span className="text-xs text-muted-foreground">当月分は未登録</span>
              )}
            </div>
          )}

          {monthlyLoading ? (
            <div className="space-y-2 py-1">
              {[1,2,3].map(i => (
                <div key={i} className="h-9 bg-muted/60 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !monthlyLinks || monthlyLinks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">リンクはまだ登録されていません</p>
          ) : (
            <>
              {monthlyLinks
                .filter((link) => (link.displayTarget ?? "common") === "common")
                .map((link) => (
                  <LinkRow
                    key={link.id}
                    href={link.url}
                    label={link.label}
                    emoji="📊"

                  />
                ))}
            </>
          )}

          {/* 管理者向けソース追加ボタン */}
          {isAdmin && (
            <>
              {showAddSourceForm ? (
                <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md mt-1">
                  <div className="flex gap-1">
                    <input value={newSourceEmoji} onChange={e => setNewSourceEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-sm bg-background" placeholder="📊" />
                    <input value={newSourceLabel} onChange={e => setNewSourceLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm bg-background" placeholder="ラベル（例：勤怠管理表）" />
                  </div>
                  <input value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)} className="border rounded px-2 py-1 text-sm bg-background" placeholder="https://docs.google.com/..." />
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setShowAddSourceForm(false); setNewSourceLabel(""); setNewSourceUrl(""); setNewSourceEmoji("📊"); }}>キャンセル</Button>
                    <Button size="sm" className="h-6 text-xs" onClick={addSource} disabled={upsertLink.isPending}>追加</Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => setShowAddSourceForm(true)}>+ 追加</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* その他タブ: spreadsheetLinksのdisplayTarget=otherから取得 */}
      {subTab === "other" && (
        <div className="space-y-1.5">
          {otherSheetLinks.length > 0
            ? otherSheetLinks.map((link) => (
                <div key={link.id}>
                  {editingOtherId === link.id ? (
                    <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md">
                      <div className="flex gap-1">
                        <input value={editOtherEmoji} onChange={e => setEditOtherEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-sm bg-background" placeholder="📁" />
                        <input value={editOtherLabel} onChange={e => setEditOtherLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm bg-background" placeholder="ラベル" />
                      </div>
                      <input value={editOtherUrl} onChange={e => setEditOtherUrl(e.target.value)} className="border rounded px-2 py-1 text-sm bg-background" placeholder="https://..." />
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingOtherId(null)}>キャンセル</Button>
                        <Button size="sm" className="h-6 text-xs" onClick={() => saveEditOther(link)} disabled={updateSheetLink.isPending}>保存</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group">
                      <LinkRow
                        href={link.url}
                        label={link.label}
                        emoji={(link as any).emoji ?? undefined}
                      />
                      {isAdmin && (
                        <>
                          <button onClick={() => startEditOther(link)} onPointerDown={() => {}} style={{ touchAction: 'manipulation' }} className="text-muted-foreground hover:text-primary p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all active:scale-95" title="編集">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => deleteSheetLink.mutate({ id: link.id })} onPointerDown={() => {}} style={{ touchAction: 'manipulation' }} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all active:scale-95" title="削除">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            : <p className="text-xs text-muted-foreground text-center py-3">その他のリンクはまだありません</p>
          }
          {isAdmin && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => setShowAddSourceForm(true)}>+ 追加</Button>
            </div>
          )}
          {isAdmin && showAddSourceForm && (
            <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md mt-1">
              <div className="flex gap-1">
                <input value={newSourceEmoji} onChange={e => setNewSourceEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-sm bg-background" placeholder="📁" />
                <input value={newSourceLabel} onChange={e => setNewSourceLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm bg-background" placeholder="ラベル" />
              </div>
              <input value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)} className="border rounded px-2 py-1 text-sm bg-background" placeholder="https://..." />
              <div className="flex gap-1 justify-end">
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setShowAddSourceForm(false); setNewSourceLabel(""); setNewSourceUrl(""); setNewSourceEmoji("📁"); }}>キャンセル</Button>
                <Button size="sm" className="h-6 text-xs" onClick={() => {
                  if (!newSourceLabel.trim() || !newSourceUrl.trim()) { toast.error("ラベルとURLを入力してください"); return; }
                  const now = new Date();
                  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                  const linkKey = `custom_sheet_other_${Date.now()}`;
                  upsertLink.mutate({ linkKey, label: newSourceLabel.trim(), yearMonth, url: newSourceUrl.trim(), displayTarget: "other" });
                }} disabled={upsertLink.isPending}>追加</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HinatasWayButton() {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate("/hinatas-way")}
      className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-md w-full text-left bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200 transition-colors font-medium text-amber-700 select-none touch-manipulation active:scale-95"
    >
      <span className="flex-shrink-0">📖</span>
      <span className="truncate">Hinata's Way</span>
      <span className="ml-auto text-xs text-amber-500 font-normal">経営理念</span>
    </button>
  );
}

function ToolsCard() {
  const { user } = useAuth();
  const canManageTools = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<ToolsTabId>("sheet");

  // 当月スプレッドシートリンク（tRPC + DB）
  const { data: sheetLinks } = trpc.spreadsheetLinks.getCurrent.useQuery();

  // クイックアクセスリンク（tRPC + DB）
  const { data: quickLinks } = trpc.quickAccessLinks.list.useQuery();
  // useMemoでフィルタリング処理をメモ化（quickLinksが変わらない限り再計算しない）
  const docLinks = useMemo<{ label: string; href: string; color: string; emoji?: string }[]>(() =>
    quickLinks
      ? quickLinks.filter((l) => l.category === "ドキュメント").map((l) => ({ label: l.label, href: l.href, color: l.color, emoji: l.emoji || undefined }))
      : documentLinks,
    [quickLinks]
  );
  const frmLinks = useMemo<{ label: string; href: string; color: string; emoji?: string }[]>(() =>
    quickLinks
      ? quickLinks.filter((l) => l.category === "フォーム").map((l) => ({ label: l.label, href: l.href, color: l.color, emoji: l.emoji || undefined }))
      : formLinks,
    [quickLinks]
  );
  const othLinks = useMemo<{ label: string; href: string; color: string; emoji?: string }[]>(() =>
    quickLinks
      ? quickLinks.filter((l) => l.category === "その他").map((l) => ({ label: l.label, href: l.href, color: l.color, emoji: l.emoji || undefined }))
      : otherLinks,
    [quickLinks]
  );

  // マイリンク（tRPC + DB）
  const utils = trpc.useUtils();
  const { data: myLinksData, isLoading: linksLoading } = trpc.myLinks.list.useQuery(undefined, { retry: false });
  const createLink = trpc.myLinks.create.useMutation({
    onSuccess: () => { utils.myLinks.list.invalidate(); toast.success("リンクを追加しました"); },
    onError: (e) => toast.error(e.message),
  });
  const updateLink = trpc.myLinks.update.useMutation({
    onSuccess: () => { utils.myLinks.list.invalidate(); setEditingId(null); toast.success("リンクを更新しました"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteLink = trpc.myLinks.delete.useMutation({
    onSuccess: () => { utils.myLinks.list.invalidate(); toast.success("リンクを削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔗");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editHref, setEditHref] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  const addLink = () => {
    if (!newLabel.trim() || !newHref.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    createLink.mutate({ label: newLabel.trim(), url: newHref.trim(), emoji: newEmoji || "🔗" });
    setNewLabel(""); setNewHref(""); setNewEmoji("🔗"); setShowAddForm(false);
  };

  // 共有ドライブからマイリンクに追加
  const addToMyLinks = (label: string, url: string, emoji: string) => {
    if (myLinksData?.some((ml) => ml.url === url)) {
      toast.info("すでにマイリンクに登録されています");
      return;
    }
    createLink.mutate({ label, url, emoji });
  };

  const startEdit = (link: { id: number; label: string; url: string; emoji: string | null }) => {
    setEditingId(link.id); setEditLabel(link.label); setEditHref(link.url); setEditEmoji(link.emoji ?? "🔗");
  };

  const saveEdit = () => {
    if (editingId === null) return;
    if (!editLabel.trim() || !editHref.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    updateLink.mutate({ id: editingId, label: editLabel.trim(), url: editHref.trim(), emoji: editEmoji || "🔗" });
  };

  // 全チーム共通ツール管理者用追加フォーム
  const [showQAAddForm, setShowQAAddForm] = useState(false);
  const [qaNewLabel, setQANewLabel] = useState("");
  const [qaNewHref, setQANewHref] = useState("");
  const [qaNewEmoji, setQANewEmoji] = useState("🔗");
  const [qaNewCategory, setQANewCategory] = useState<"スプレッドシート" | "ドキュメント" | "フォーム" | "その他">("その他");
  const [qaEditingId, setQAEditingId] = useState<number | null>(null);
  const [qaEditLabel, setQAEditLabel] = useState("");
  const [qaEditHref, setQAEditHref] = useState("");
  const [qaEditEmoji, setQAEditEmoji] = useState("");

  const createQALink = trpc.quickAccessLinks.create.useMutation({
    onSuccess: () => { utils.quickAccessLinks.list.invalidate(); toast.success("ツールを追加しました"); setShowQAAddForm(false); setQANewLabel(""); setQANewHref(""); setQANewEmoji("🔗"); },
    onError: (e) => toast.error(e.message),
  });
  const updateQALink = trpc.quickAccessLinks.update.useMutation({
    onSuccess: () => { utils.quickAccessLinks.list.invalidate(); setQAEditingId(null); toast.success("ツールを更新しました"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteQALink = trpc.quickAccessLinks.delete.useMutation({
    onSuccess: () => { utils.quickAccessLinks.list.invalidate(); toast.success("ツールを削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const addQATool = () => {
    if (!qaNewLabel.trim() || !qaNewHref.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    createQALink.mutate({ category: qaNewCategory, label: qaNewLabel.trim(), href: qaNewHref.trim(), emoji: qaNewEmoji || "🔗" });
  };

  const startQAEdit = (link: { id: number; label: string; href: string; emoji: string | null }) => {
    setQAEditingId(link.id); setQAEditLabel(link.label); setQAEditHref(link.href); setQAEditEmoji(link.emoji ?? "🔗");
  };

  const saveQAEdit = () => {
    if (qaEditingId === null) return;
    if (!qaEditLabel.trim() || !qaEditHref.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    updateQALink.mutate({ id: qaEditingId, label: qaEditLabel.trim(), href: qaEditHref.trim(), emoji: qaEditEmoji || "🔗" });
  };

  return (
    <Card className="fade-in-up stagger-2 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
          <LinkIcon className="w-5 h-5 text-primary" />
          <span className="tracking-wide">全チーム共通ツール</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* タブバー */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
          {TOOLS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md text-xs font-medium transition-all",
                activeTab === tab.id
                  ? "bg-card shadow-sm text-primary"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              <span className="text-base leading-none">{tab.label}</span>
              <span className="leading-none">{tab.title}</span>
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className="flex flex-col gap-1.5">

          {/* スプレッドシート */}
          {activeTab === "sheet" && (
            <SheetSubTabs quickLinks={quickLinks} isAdmin={canManageTools} />
          )}

          {/* ドキュメント */}
          {activeTab === "doc" && (
            <>
              {quickLinks
                ? quickLinks.filter((l) => l.category === "ドキュメント").map((link) => (
                    <div key={link.id} className="flex items-center gap-1 group">
                      {qaEditingId === link.id ? (
                        <div className="flex-1 space-y-1 p-2 bg-muted/30 rounded-md">
                          <div className="flex gap-1">
                            <input value={qaEditEmoji} onChange={e => setQAEditEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-xs bg-background" placeholder="🔗" />
                            <input value={qaEditLabel} onChange={e => setQAEditLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs bg-background" placeholder="ラベル" />
                          </div>
                          <input value={qaEditHref} onChange={e => setQAEditHref(e.target.value)} className="w-full border rounded px-2 py-1 text-xs bg-background" placeholder="https://..." />
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setQAEditingId(null)}>キャンセル</Button>
                            <Button size="sm" className="h-6 text-xs" onClick={saveQAEdit} disabled={updateQALink.isPending}>保存</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <LinkRow
                            href={link.href}
                            label={link.label}
                            emoji={link.emoji || undefined}

                          />
                          {canManageTools && (
                            <>
                              <button onClick={() => startQAEdit({ id: link.id, label: link.label, href: link.href, emoji: link.emoji })} className="text-muted-foreground hover:text-primary p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" title="編集">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => deleteQALink.mutate({ id: link.id })} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" title="削除">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))
                : docLinks.map((link) => (
                    <LinkRow
                      key={link.href}
                      href={link.href}
                      label={link.label}
                      emoji={link.emoji}

                    />
                  ))
              }
              {quickLinks && quickLinks.filter((l) => l.category === "ドキュメント").length === 0 && !showQAAddForm && (
                <p className="text-xs text-muted-foreground text-center py-4">ドキュメントリンクはまだありません</p>
              )}
              {canManageTools && !showQAAddForm && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => { setQANewCategory("ドキュメント"); setShowQAAddForm(true); }}>+ 追加</Button>
                </div>
              )}
              {canManageTools && showQAAddForm && qaNewCategory === "ドキュメント" && (
                <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md">
                  <div className="flex gap-1">
                    <input value={qaNewEmoji} onChange={e => setQANewEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-xs bg-background" placeholder="🔗" />
                    <input value={qaNewLabel} onChange={e => setQANewLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs bg-background" placeholder="ラベル" />
                  </div>
                  <input value={qaNewHref} onChange={e => setQANewHref(e.target.value)} className="w-full border rounded px-2 py-1 text-xs bg-background" placeholder="https://..." />
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowQAAddForm(false)}>キャンセル</Button>
                    <Button size="sm" className="h-6 text-xs" onClick={addQATool} disabled={createQALink.isPending}>追加</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* フォーム */}
          {activeTab === "form" && (
            <>
              {quickLinks
                ? quickLinks.filter((l) => l.category === "フォーム").map((link) => (
                    <div key={link.id} className="flex items-center gap-1 group">
                      {qaEditingId === link.id ? (
                        <div className="flex-1 space-y-1 p-2 bg-muted/30 rounded-md">
                          <div className="flex gap-1">
                            <input value={qaEditEmoji} onChange={e => setQAEditEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-xs bg-background" placeholder="🔗" />
                            <input value={qaEditLabel} onChange={e => setQAEditLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs bg-background" placeholder="ラベル" />
                          </div>
                          <input value={qaEditHref} onChange={e => setQAEditHref(e.target.value)} className="w-full border rounded px-2 py-1 text-xs bg-background" placeholder="https://..." />
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setQAEditingId(null)}>キャンセル</Button>
                            <Button size="sm" className="h-6 text-xs" onClick={saveQAEdit} disabled={updateQALink.isPending}>保存</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <LinkRow
                            href={link.href}
                            label={link.label}
                            emoji={link.emoji || undefined}

                          />
                          {canManageTools && (
                            <>
                              <button onClick={() => startQAEdit({ id: link.id, label: link.label, href: link.href, emoji: link.emoji })} className="text-muted-foreground hover:text-primary p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" title="編集">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => deleteQALink.mutate({ id: link.id })} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" title="削除">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))
                : frmLinks.map((link) => (
                    <LinkRow
                      key={link.href}
                      href={link.href}
                      label={link.label}
                      emoji={link.emoji}

                    />
                  ))
              }
              {quickLinks && quickLinks.filter((l) => l.category === "フォーム").length === 0 && !showQAAddForm && (
                <p className="text-xs text-muted-foreground text-center py-4">フォームリンクはまだありません</p>
              )}
              {canManageTools && !showQAAddForm && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => { setQANewCategory("フォーム"); setShowQAAddForm(true); }}>+ 追加</Button>
                </div>
              )}
              {canManageTools && showQAAddForm && qaNewCategory === "フォーム" && (
                <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md">
                  <div className="flex gap-1">
                    <input value={qaNewEmoji} onChange={e => setQANewEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-xs bg-background" placeholder="🔗" />
                    <input value={qaNewLabel} onChange={e => setQANewLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs bg-background" placeholder="ラベル" />
                  </div>
                  <input value={qaNewHref} onChange={e => setQANewHref(e.target.value)} className="w-full border rounded px-2 py-1 text-xs bg-background" placeholder="https://..." />
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowQAAddForm(false)}>キャンセル</Button>
                    <Button size="sm" className="h-6 text-xs" onClick={addQATool} disabled={createQALink.isPending}>追加</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* その他 */}
          {activeTab === "other" && (
            <>
              {/* Hinata's Way 固定リンク */}
              <HinatasWayButton />
              {quickLinks
                ? quickLinks.filter((l) => l.category === "その他").map((link) => (
                    <div key={link.id} className="flex items-center gap-1 group">
                      {qaEditingId === link.id ? (
                        <div className="flex-1 space-y-1 p-2 bg-muted/30 rounded-md">
                          <div className="flex gap-1">
                            <input value={qaEditEmoji} onChange={e => setQAEditEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-xs bg-background" placeholder="🔗" />
                            <input value={qaEditLabel} onChange={e => setQAEditLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs bg-background" placeholder="ラベル" />
                          </div>
                          <input value={qaEditHref} onChange={e => setQAEditHref(e.target.value)} className="w-full border rounded px-2 py-1 text-xs bg-background" placeholder="https://..." />
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setQAEditingId(null)}>キャンセル</Button>
                            <Button size="sm" className="h-6 text-xs" onClick={saveQAEdit} disabled={updateQALink.isPending}>保存</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <LinkRow
                            href={link.href}
                            label={link.label}
                            emoji={link.emoji || undefined}

                          />
                          {canManageTools && (
                            <>
                              <button onClick={() => startQAEdit({ id: link.id, label: link.label, href: link.href, emoji: link.emoji })} className="text-muted-foreground hover:text-primary p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" title="編集">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => deleteQALink.mutate({ id: link.id })} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" title="削除">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))
                : othLinks.map((link) => (
                    <LinkRow
                      key={link.href}
                      href={link.href}
                      label={link.label}
                      emoji={link.emoji}

                    />
                  ))
              }
              {canManageTools && !showQAAddForm && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => { setQANewCategory("その他"); setShowQAAddForm(true); }}>+ 追加</Button>
                </div>
              )}
              {canManageTools && showQAAddForm && qaNewCategory === "その他" && (
                <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md">
                  <div className="flex gap-1">
                    <input value={qaNewEmoji} onChange={e => setQANewEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-xs bg-background" placeholder="🔗" />
                    <input value={qaNewLabel} onChange={e => setQANewLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs bg-background" placeholder="ラベル" />
                  </div>
                  <input value={qaNewHref} onChange={e => setQANewHref(e.target.value)} className="w-full border rounded px-2 py-1 text-xs bg-background" placeholder="https://..." />
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowQAAddForm(false)}>キャンセル</Button>
                    <Button size="sm" className="h-6 text-xs" onClick={addQATool} disabled={createQALink.isPending}>追加</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* マイリンク */}
          {activeTab === "mine" && (
            <>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => setShowAddForm(!showAddForm)}>
                  <Plus className="w-3 h-3 mr-1" />追加
                </Button>
              </div>
              {showAddForm && (
                <div className="space-y-1.5 mb-1 p-2 bg-muted/30 rounded-lg">
                  <div className="flex gap-1">
                    <input type="text" placeholder="🔗" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)}
                      className="w-10 text-xs border border-border rounded px-1 py-1 bg-background text-foreground text-center" />
                    <input type="text" placeholder="ラベル名" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                      className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background text-foreground" />
                  </div>
                  <input type="url" placeholder="https://..." value={newHref} onChange={(e) => setNewHref(e.target.value)}
                    className="w-full text-xs border border-border rounded px-2 py-1 bg-background text-foreground" />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs flex-1" onClick={addLink} disabled={createLink.isPending}>追加</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAddForm(false)}>キャンセル</Button>
                  </div>
                </div>
              )}
              {linksLoading ? (
                <div className="space-y-1.5 py-1">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-9 bg-muted/60 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : !myLinksData || myLinksData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">『追加』ボタンからリンクを登録できます</p>
              ) : (
                <div className="space-y-1">
                  {myLinksData.map((link) => (
                    <div key={link.id}>
                      {editingId === link.id ? (
                        <div className="space-y-1 p-2 bg-muted/30 rounded-lg">
                          <div className="flex gap-1">
                            <input type="text" placeholder="絵文字" value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)}
                              className="w-10 text-xs border border-border rounded px-1 py-1 bg-background text-foreground text-center" />
                            <input type="text" placeholder="ラベル名" value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                              className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background text-foreground" />
                          </div>
                          <input type="url" placeholder="https://..." value={editHref} onChange={(e) => setEditHref(e.target.value)}
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background text-foreground" />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 text-xs flex-1" onClick={saveEdit} disabled={updateLink.isPending}>保存</Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>キャンセル</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center gap-2 text-sm py-2.5 px-3 rounded-md bg-muted/50 hover:bg-muted text-foreground transition-colors min-w-0 font-medium">
                            <span className="flex-shrink-0">{link.emoji ?? "🔗"}</span>
                            <span className="truncate">{link.label}</span>
                          </a>
                          <button onClick={() => startEdit({ id: link.id, label: link.label, url: link.url, emoji: link.emoji ?? "🔗" })}
                            className="text-muted-foreground hover:text-primary p-1 flex-shrink-0" title="編集">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => deleteLink.mutate({ id: link.id })}
                            className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0" title="削除">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </CardContent>
    </Card>
  );
}



// ========== チームツールカード ==========
const TEAM_TABS = [
  { id: "全チーム" as const, label: "全", title: "全チーム" },
  { id: "身体" as const, label: "身", title: "身体" },
  { id: "天理" as const, label: "天", title: "天理" },
  { id: "郡山北部" as const, label: "北", title: "郡山北部" },
  { id: "郡山南部" as const, label: "南", title: "郡山南部" },
] as const;
type TeamTabId = "全チーム" | "身体" | "天理" | "郡山北部" | "郡山南部";

function TeamToolsCard() {
  const { user } = useAuth();
  const { isNight } = useTheme();
  const utils = trpc.useUtils();

    // ユーザーのチームに基づいてデフォルトタブを決定
  // 全チーム・事務員は「全チーム」をデフォルト
  const defaultTeam = ((): TeamTabId => {
    const t = user?.team;
    if (t === "身体" || t === "天理" || t === "郡山北部" || t === "郡山南部") return t;
    // 全チーム・事務員は全チームをデフォルトに
    if (t === "全チーム" || t === "事務員") return "全チーム";
    return "全チーム";
  })();
  const [activeTeam, setActiveTeam] = useState<TeamTabId>(defaultTeam);
  // ユーザーのチームが変わったときにデフォルトを反映
  useEffect(() => {
    const t = user?.team;
    if (t === "身体" || t === "天理" || t === "郡山北部" || t === "郡山南部") {
      setActiveTeam(t);
    } else if (t === "全チーム" || t === "事務員" || !t) {
      setActiveTeam("全チーム");
    }
  }, [user?.team]);

  const { data: tools = [], isLoading } = trpc.teamTools.list.useQuery(
    { team: activeTeam },
    { retry: false }
  );

  // 全チームの目標を表示（チームタブに関わらず全目標を確認できる）

  // 月次利用者料金一覧（DB登録分）
  const { data: monthlyLinks } = trpc.spreadsheetLinks.getCurrent.useQuery();
  // チームに対応するlinkKeyを決定
  const teamFeeKey = useMemo(() => {
    if (activeTeam === "身体") return "fee_shintai";
    if (activeTeam === "天理") return "fee_tenri";
    // 郡山北部・郡山南部は精神郡山
    return "fee_seishin_koriyama";
  }, [activeTeam]);
  // 当該チームの月次利用者料金リンク
  const teamFeeLink = useMemo(() => {
    return monthlyLinks?.find((l) => l.linkKey === teamFeeKey) ?? null;
  }, [monthlyLinks, teamFeeKey]);

  // 管理者のみ: ツール追加・編集・削除
  const isAdmin = user?.role === "admin";
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔗");
  const [newTargetTeam, setNewTargetTeam] = useState<TeamTabId>("身体"); // 全チームタブ時のチーム選択
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editHref, setEditHref] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  const createTool = trpc.teamTools.create.useMutation({
    onSuccess: () => { utils.teamTools.list.invalidate(); toast.success("ツールを追加しました"); setShowAddForm(false); setNewLabel(""); setNewHref(""); setNewEmoji("🔗"); },
    onError: (e) => toast.error(e.message),
  });
  const updateTool = trpc.teamTools.update.useMutation({
    onSuccess: () => { utils.teamTools.list.invalidate(); setEditingId(null); toast.success("ツールを更新しました"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteTool = trpc.teamTools.delete.useMutation({
    onSuccess: () => { utils.teamTools.list.invalidate(); toast.success("ツールを削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const addTool = () => {
    if (!newLabel.trim() || !newHref.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    const targetTeam: Exclude<TeamTabId, "全チーム"> = (activeTeam === "全チーム" ? newTargetTeam : activeTeam) as Exclude<TeamTabId, "全チーム">;
    createTool.mutate({ team: targetTeam, label: newLabel.trim(), href: newHref.trim(), emoji: newEmoji || "🔗" });
  };

  const startEdit = (tool: { id: number; label: string; href: string; emoji: string }) => {
    setEditingId(tool.id); setEditLabel(tool.label); setEditHref(tool.href); setEditEmoji(tool.emoji ?? "🔗");
  };

  const saveEdit = () => {
    if (editingId === null) return;
    if (!editLabel.trim() || !editHref.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    updateTool.mutate({ id: editingId, label: editLabel.trim(), href: editHref.trim(), emoji: editEmoji || "🔗" });
  };

  return (
    <Card className="fade-in-up stagger-1 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
          <Users className="w-5 h-5 text-primary" />
          <span className="tracking-wide">チームツール</span>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs px-2 border-primary text-primary hover:bg-primary hover:text-white"
              onClick={() => setShowAddForm((v) => !v)}
            >
              {showAddForm ? "キャンセル" : "追加"}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* チームタブバー */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
          {TEAM_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTeam(tab.id)}
              onPointerDown={() => {}}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md text-xs font-bold transition-colors",
                getTeamButtonClass(tab.id, activeTeam === tab.id)
              )}
              style={{ ...getTeamButtonStyle(tab.id, activeTeam === tab.id), touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="text-base leading-none">{tab.label}</span>
              <span className="leading-none">{tab.title}</span>
            </button>
          ))}
        </div>

        {/* ツールリスト */}
        <div className="flex flex-col gap-1.5">
          {/* 月次利用者料金一覧（DB登録分を先頭に表示） */}
          {activeTeam === "全チーム" ? (
            // 全チームタブ時：各チームの料金リンクをチームカラーで表示
            ["fee_shintai", "fee_tenri", "fee_seishin_koriyama"].map((key) => {
              const link = monthlyLinks?.find((l) => l.linkKey === key);
              if (!link) return null;
              const teamForKey = key === "fee_shintai" ? "身体" : key === "fee_tenri" ? "天理" : "郡山北部";
              return (
                <LinkRow
                  key={key}
                  href={link.url}
                  label={link.label}
                  colorStyle={isNight ? getTeamTextStyleNight(teamForKey) : getTeamTextStyle(teamForKey)}
                  emoji="📊"
                />
              );
            })
          ) : (
            teamFeeLink && (
              <LinkRow
                href={teamFeeLink.url}
                label={teamFeeLink.label}
                colorStyle={isNight ? getTeamTextStyleNight(activeTeam) : getTeamTextStyle(activeTeam)}
                emoji="📊"
              />
            )
          )}
          {isLoading ? (
            <div className="space-y-2 py-1">
              {[1,2,3].map(i => (
                <div key={i} className="h-10 bg-muted/60 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : tools.length === 0 && !showAddForm && !teamFeeLink && activeTeam !== "全チーム" ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {activeTeam}チームのツールはまだありません
              {isAdmin && <span className="block mt-1 text-primary cursor-pointer" onClick={() => setShowAddForm(true)} onPointerDown={() => {}} style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}>+ 追加する</span>}
            </p>
          ) : (
            tools
              // 月次URLが登録されている場合、静的な利用者料金一覧リンクは非表示
              .filter((tool) => !(teamFeeLink && tool.label.includes("利用者料金一覧")))
              .map((tool) => (
              <div key={tool.id}>
                {editingId === tool.id ? (
                  <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md">
                    <div className="flex gap-1">
                      <input value={editEmoji} onChange={e => setEditEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-sm bg-background" placeholder="🔗" />
                      <input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm bg-background" placeholder="ラベル" />
                    </div>
                    <input value={editHref} onChange={e => setEditHref(e.target.value)} className="border rounded px-2 py-1 text-sm bg-background" placeholder="https://..." />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>キャンセル</Button>
                      <Button size="sm" className="h-6 text-xs" onClick={saveEdit} disabled={updateTool.isPending}>保存</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 group">
                    {/* チームに応じた文字色：インラインスタイルで夜間モード対応 */}
                    <LinkRow
                      href={tool.href}
                      label={tool.label}
                      colorStyle={isNight ? getTeamTextStyleNight(activeTeam === "全チーム" ? (tool as any).team ?? activeTeam : activeTeam) : getTeamTextStyle(activeTeam === "全チーム" ? (tool as any).team ?? activeTeam : activeTeam)}
                      emoji={tool.emoji ?? undefined}
                    />
                    {isAdmin && (
                      <>
                        <button onClick={() => startEdit(tool)} onPointerDown={() => {}} style={{ touchAction: 'manipulation' }} className="text-muted-foreground hover:text-primary p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all active:scale-95 touch-manipulation" title="編集">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => deleteTool.mutate({ id: tool.id })} onPointerDown={() => {}} style={{ touchAction: 'manipulation' }} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all active:scale-95 touch-manipulation" title="削除">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {/* 追加フォーム */}
          {isAdmin && showAddForm && (
            <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md">
              {/* 全チームタブ時はチーム選択ドロップダウンを表示 */}
              {activeTeam === "全チーム" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">追加先チーム：</span>
                  <select
                    value={newTargetTeam}
                    onChange={e => setNewTargetTeam(e.target.value as TeamTabId)}
                    className="flex-1 border rounded px-2 py-1 text-sm bg-background"
                  >
                    <option value="身体">身体</option>
                    <option value="天理">天理</option>
                    <option value="郡山北部">郡山北部</option>
                    <option value="郡山南部">郡山南部</option>
                  </select>
                </div>
              )}
              <div className="flex gap-1">
                <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} className="w-10 text-center border rounded px-1 py-1 text-sm bg-background" placeholder="🔗" />
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm bg-background" placeholder="ラベル" />
              </div>
              <input value={newHref} onChange={e => setNewHref(e.target.value)} className="border rounded px-2 py-1 text-sm bg-background" placeholder="https://..." />
              <div className="flex gap-1 justify-end">
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setShowAddForm(false); setNewLabel(""); setNewHref(""); setNewEmoji("🔗"); }}>キャンセル</Button>
                <Button size="sm" className="h-6 text-xs" onClick={addTool} disabled={createTool.isPending}>追加</Button>
              </div>
            </div>
          )}
        </div>




      </CardContent>
    </Card>
  );
}


function TasksCard() {
  const utils = trpc.useUtils();
  const { isNight } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(true);

  const { user } = useAuth();
  // 新しい personal_tasks テーブルから今日の個人タスクを取得
  const { data: personalTasksData = [] } = trpc.personalTasks.getMyTasks.useQuery(
    { showDone: true },
    { refetchInterval: 15 * 1000, staleTime: 0 }
  );

  // 今日の個人タスク（at_time・by_deadline両方表示、今日が期日のものを含む、5件上限・他職員への依頼タスク除外）
  const todayPersonalTasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
    return personalTasksData
      .filter((t) => {
        if (hideCompleted && t.done) return false;
        if (!t.dueDate) return false;
        // 自分が作成した他職員への依頼タスクを除外
        if (t.assignType === "personal" && t.assignUserId !== user?.id && t.createdBy === user?.id) return false;
        // 今日が期日のタスク（at_time・by_deadline両方）または期限切れのタスクを表示
        const due = new Date(t.dueDate).getTime();
        return due <= todayEnd;
      })
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      })
      .slice(0, 5);
  }, [personalTasksData, user?.id, hideCompleted]);

  // 期限切れタスク（今日より前の期日で未完了）のカウント
  const overdueCount = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return personalTasksData.filter((t) => {
      if (t.done) return false;
      if (!t.dueDate) return false;
      if (t.assignType === "personal" && t.assignUserId !== user?.id && t.createdBy === user?.id) return false;
      const due = new Date(t.dueDate).getTime();
      return due < todayStart;
    }).length;
  }, [personalTasksData, user?.id]);

  const toggleTask = trpc.personalTasks.toggleDone.useMutation({
    onMutate: async ({ id, done }) => {
      await utils.personalTasks.getMyTasks.cancel();
      const prev = utils.personalTasks.getMyTasks.getData({ showDone: true });
      utils.personalTasks.getMyTasks.setData(
        { showDone: true },
        (old) => old?.map((t) => t.id === id ? { ...t, done: done ? 1 : 0 } : t)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.personalTasks.getMyTasks.setData({ showDone: true }, ctx.prev);
    },
    onSettled: () => {
      // 全キャッシュを無効化して「個人タスク」ページとも同期
      utils.personalTasks.getMyTasks.invalidate();
      utils.personalTasks.getTodayTasks.invalidate();
    },
  });

  return (
    <div className="fade-in-up stagger-3 space-y-2">
      {/* 期限切れタスク警告バッジ */}
      {overdueCount > 0 && (
        <Link href="/tasks">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 cursor-pointer hover:bg-red-500/25 transition-colors">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs font-semibold">期限切れ {overdueCount}件の未完了タスクがあります</span>
            <span className="ml-auto text-xs opacity-70">確認 &rsaquo;</span>
          </div>
        </Link>
      )}
      <Card id="today-tasks" className="shadow-sm">
        <CardHeader className="pb-2">
          {/* 1行目：タイトル + 「すべて見る」 */}
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-bold flex items-center gap-1.5 text-foreground min-w-0">
              <ClipboardList className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="tracking-wide whitespace-nowrap">今日の個人タスク</span>
              {todayPersonalTasks.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex-shrink-0">
                  {todayPersonalTasks.length}
                </span>
              )}
            </CardTitle>
            <Link href="/personal-tasks">
              <span className="text-xs text-primary hover:underline cursor-pointer whitespace-nowrap flex-shrink-0">すべて見る</span>
            </Link>
          </div>
          {/* 2行目：「完了済みを非表示」チェックボックス */}
          <div className="flex items-center gap-1 mt-1">
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="w-3 h-3 cursor-pointer"
              />
              完了済みを非表示
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* 今日の個人タスクリスト */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
          {todayPersonalTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              今日の個人タスクはありません ✓
            </p>
          ) : (
            todayPersonalTasks.map((task) => {
              const taskKind = task.taskKind as "at_time" | "by_deadline";
              return (
              <div key={task.id} className={cn(
                "flex items-start gap-2 group animate-list-item-in rounded-lg p-2 -mx-1",
                "bg-muted/20 border border-border/40"
              )}>
                <button
                  onClick={() => toggleTask.mutate({ id: task.id, done: task.done === 0 })}
                  className="flex-shrink-0 mt-0.5"
                >
                  {task.done ? (
                    <CheckCircle2 className="w-4 h-4 text-primary animate-check-bounce" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={cn("text-sm block transition-colors duration-300", task.done ? "animate-strike text-muted-foreground" : "text-foreground")}>
                    {task.text}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {/* 作成者バッジ（他者から依頼されたタスク） */}
                    {task.createdBy !== user?.id && task.createdByName && (
                      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium">
                        {task.createdByName}から依頼
                      </span>
                    )}
                    {/* タスク種別バッジ */}
                    {taskKind === "at_time" ? (
                      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0 rounded-full bg-muted text-muted-foreground font-medium">
                        📅この日時に
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0 rounded-full bg-muted text-muted-foreground font-medium">
                        ⏳この日時まで
                      </span>
                    )}
                    {task.dueDate && (
                      <span className={cn(
                        "flex items-center gap-0.5 text-xs",
                        (() => {
                          const d = new Date(task.dueDate);
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                          const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          if (diff < 0) return isNight ? "text-red-400 font-semibold" : "text-red-600 font-semibold";
                          if (diff === 0) return isNight ? "text-orange-400 font-semibold" : "text-orange-600 font-semibold";
                          if (diff <= 2) return isNight ? "text-amber-400" : "text-amber-600";
                          return "text-muted-foreground";
                        })()
                      )}>
                        <Clock className="w-3 h-3" />
                        {(() => {
                          const WDAYS = ["日", "月", "火", "水", "木", "金", "土"];
                          const d = new Date(task.dueDate);
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                          const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          const wday = WDAYS[d.getDay()];
                          const timeStr = d.getHours() !== 0 || d.getMinutes() !== 0
                            ? ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
                            : "";
                          if (diff < 0) return `${d.getMonth()+1}月${d.getDate()}日（${wday}）${timeStr}（期限切れ）`;
                          if (diff === 0) return `今日（${wday}）${timeStr}`;
                          if (diff === 1) return `明日（${wday}）${timeStr}`;
                          return `${d.getMonth()+1}月${d.getDate()}日（${wday}）${timeStr}`;
                        })()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })
          )}
          </div>

          {/* カード内の新規追加ボタン */}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="w-full flex items-center justify-center gap-2 py-2 mt-1 rounded-lg border border-dashed border-primary/40 text-primary hover:border-primary hover:bg-primary/5 transition-colors text-xs font-medium"
          >
            {showForm ? (
              <><X className="w-3.5 h-3.5" />フォームを閉じる</>
            ) : (
              <><Plus className="w-3.5 h-3.5" />新しいタスクを追加</>
            )}
          </button>

          {/* 詳細フォーム（PersonalTasksページと同じモーダルフォームを使用） */}
          {showForm && user && (
            <CreateTaskForm
              onClose={() => setShowForm(false)}
              onCreated={() => {
                utils.personalTasks.getMyTasks.invalidate();
                utils.personalTasks.getTodayTasks.invalidate();
                setShowForm(false);
              }}
              userTeam={user.team ?? null}
              defaultDueDate={(() => {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, "0");
                const d = String(now.getDate()).padStart(2, "0");
                return `${y}-${m}-${d}`;
              })()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// 今日の利用者タスクカード（patientNameが設定されているタスクを表示）
function PatientTasksCard() {
  const utils = trpc.useUtils();
  const { isNight } = useTheme();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>("全チーム");

  const { data: tasks = [] } = trpc.tasks.getMine.useQuery(undefined, {
    refetchInterval: 15 * 1000,
    staleTime: 0,
  });

  // 今日の利用者タスク（patientNameが設定されていて、今日が期日 or 期日なし or 次回訪問時）
  const todayPatientTasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
    return tasks
      .filter((t) => {
        if (t.done !== 0) return false;
        if (!(t as any).patientName) return false; // 利用者名なしは除外
        // next_visitタスクは期日なしで登録されるため、assignTypeに関わらず常に表示
        if ((t as any).taskKind === "next_visit") return true;
        // assignTypeフィルター（自分宛て or 自分のチーム or 全員）
        const userTeam = (user as any)?.team;
        if (t.assignType === "personal" && t.assignUserId !== user?.id) return false;
        if (t.assignType === "team" && t.assignTeam !== userTeam) return false;
        if (!t.dueDate) return true; // 期日なしは表示
        const due = new Date(t.dueDate).getTime();
        return due >= todayStart && due <= todayEnd;
      })
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [tasks, user?.id, (user as any)?.team]);

  // チームフィルター後のタスク
  const filteredPatientTasks = useMemo(() => {
    if (selectedTeam === "全チーム") return todayPatientTasks;
    return todayPatientTasks.filter((t) => t.assignTeam === selectedTeam);
  }, [todayPatientTasks, selectedTeam]);

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
    },
    onSettled: () => {
      utils.tasks.getMine.invalidate();
      utils.tasks.getAll.invalidate();
    },
  });

  return (
    <Card id="today-patient-tasks" className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <UserRound className="w-5 h-5 text-violet-500" />
            <span className="tracking-wide">今日の利用者タスク</span>
          </CardTitle>
          <Link href="/tasks">
            <span className="text-xs text-primary hover:underline cursor-pointer">すべて見る</span>
          </Link>
        </div>
        {/* チームフィルターボタン */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            onClick={() => setSelectedTeam("全チーム")}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
              selectedTeam === "全チーム"
                ? "text-white border-transparent"
                : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
            )}
            style={selectedTeam === "全チーム" ? { backgroundColor: ALL_TEAM_COLOR.active, borderColor: ALL_TEAM_COLOR.active } : {}}
          >
            全チーム
            {todayPatientTasks.length > 0 && (
              <span className={cn(
                "ml-1 rounded-full px-1",
                selectedTeam === "全チーム" ? "bg-white/30" : "bg-muted text-foreground"
              )}>{todayPatientTasks.length}</span>
            )}
          </button>
          {TEAMS.map((team) => {
            const count = todayPatientTasks.filter((t) => t.assignTeam === team).length;
            const isActive = selectedTeam === team;
            const colors = TEAM_COLOR_VALUES[team as TeamName];
            return (
              <button
                key={team}
                onClick={() => setSelectedTeam(team)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                  isActive
                    ? "text-white border-transparent"
                    : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
                )}
                style={isActive ? { backgroundColor: colors?.active, borderColor: colors?.active } : {}}
              >
                {team}
                {count > 0 && (
                  <span className={cn(
                    "ml-1 rounded-full px-1",
                    isActive ? "bg-white/30" : "bg-muted text-foreground"
                  )}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
          {filteredPatientTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {selectedTeam === "全チーム" ? "今日の利用者タスクはありません ✓" : `${selectedTeam}チームの今日の利用者タスクはありません ✓`}
            </p>
          ) : (
            filteredPatientTasks.map((task) => {
              const taskKind = (task as any).taskKind as "at_time" | "by_deadline" | undefined;
              return (
                <div key={task.id} className={cn(
                  "flex items-start gap-2 group animate-list-item-in rounded-lg p-2 -mx-1",
                  taskKind === "at_time"
                    ? "bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-800/40"
                    : "bg-violet-50/40 dark:bg-violet-950/10 border border-violet-200/40 dark:border-violet-800/30"
                )}>
                  <button
                    onClick={() => toggleTask.mutate({ id: task.id, done: task.done === 0 })}
                    className="flex-shrink-0 mt-0.5"
                  >
                    {task.done ? (
                      <CheckCircle2 className="w-4 h-4 text-primary animate-check-bounce" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="flex items-center gap-0.5 text-xs text-violet-600 dark:text-violet-400 font-semibold">
                        <UserRound className="w-3 h-3" />{(task as any).patientName}
                      </span>
                      {taskKind === "at_time" ? (
                        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 font-medium">
                          📅この日時に
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 font-medium">
                          ⏳この日時まで
                        </span>
                      )}
                    </div>
                    <span className={cn("text-sm block transition-colors duration-300", task.done ? "animate-strike text-muted-foreground" : "text-foreground")}>
                      {task.text}
                    </span>
                    {task.dueDate && (
                      <span className={cn(
                        "flex items-center gap-0.5 text-xs mt-0.5",
                        (() => {
                          const d = new Date(task.dueDate);
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                          const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          if (diff < 0) return isNight ? "text-red-400 font-semibold" : "text-red-600 font-semibold";
                          if (diff === 0) return isNight ? "text-orange-400 font-semibold" : "text-orange-600 font-semibold";
                          if (diff <= 2) return isNight ? "text-amber-400" : "text-amber-600";
                          return "text-muted-foreground";
                        })()
                      )}>
                        <Clock className="w-3 h-3" />
                        {(() => {
                          const WDAYS = ["日", "月", "火", "水", "木", "金", "土"];
                          const d = new Date(task.dueDate);
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                          const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          const wday = WDAYS[d.getDay()];
                          const timeStr = d.getHours() !== 0 || d.getMinutes() !== 0
                            ? ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
                            : "";
                          if (diff < 0) return `${d.getMonth()+1}月${d.getDate()}日（${wday}）${timeStr}（期限切れ）`;
                          if (diff === 0) return `今日（${wday}）${timeStr}`;
                          if (diff === 1) return `明日（${wday}）${timeStr}`;
                          return `${d.getMonth()+1}月${d.getDate()}日（${wday}）${timeStr}`;
                        })()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {/* カード内の新規追加ボタン */}
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-center gap-2 py-2 mt-1 rounded-lg border border-dashed border-violet-400/50 text-violet-600 dark:text-violet-400 hover:border-violet-500 hover:bg-violet-50/30 dark:hover:bg-violet-950/20 transition-colors text-xs font-medium"
        >
          {showForm ? (
            <><X className="w-3.5 h-3.5" />フォームを閉じる</>
          ) : (
            <><Plus className="w-3.5 h-3.5" />新しいタスクを追加</>
          )}
        </button>
        {/* 詳細フォーム */}
        {showForm && (
          <TaskCreateForm
            onClose={() => setShowForm(false)}
            onSuccess={() => utils.tasks.getMine.invalidate()}
            defaultDueDate={new Date().toISOString().split('T')[0]}
            requirePatientName={true}
          />
        )}
      </CardContent>
    </Card>
  );
}
function MessageBoard({ title }: { title: string }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { isNight } = useTheme();
  const [, navigate] = useLocation();
  const REACTION_EMOJIS = ["👍", "✅", "❤️", "🙏", "😊", "💪"];
  // DBからメッセージ取得得
  const { data: messages = [], isLoading } = trpc.messages.getActive.useQuery(undefined, {
    refetchInterval: 15000, // 15秒ごとに自動更新
  });

  // 予約送信待ちメッセージ
  const { data: pendingMessages = [] } = trpc.messages.getPending.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const [showPending, setShowPending] = useState(false);

  const [newMsg, setNewMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [displayFrom, setDisplayFrom] = useState("");
  const [displayFromTime, setDisplayFromTime] = useState("");
  const [displayUntil, setDisplayUntil] = useState("");
  const [displayUntilTime, setDisplayUntilTime] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledAtTime, setScheduledAtTime] = useState("");
  // 音声入力 AI 自動転記
  const [isAnalyzingMsg, setIsAnalyzingMsg] = useState(false);
  const [msgVoiceError, setMsgVoiceError] = useState<string | null>(null);
  const [lastMsgVoiceText, setLastMsgVoiceText] = useState<string | null>(null);
  const [missingMsgFields, setMissingMsgFields] = useState<string[]>([]);
  // バッジ点滅アニメーション用
  const [badgePulse, setBadgePulse] = useState(false);
  const prevMsgCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const prev = prevMsgCountRef.current;
    if (prev !== null && messages.length > prev) {
      setBadgePulse(true);
      const t = setTimeout(() => setBadgePulse(false), 2000);
      return () => clearTimeout(t);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, isLoading]);
  // 誤変換報告機能
  const [msgVoiceTranscribed, setMsgVoiceTranscribed] = useState(false);
  const [showMsgFeedbackDialog, setShowMsgFeedbackDialog] = useState(false);
  const [msgFeedbackWrongField, setMsgFeedbackWrongField] = useState("");
  const [msgFeedbackWrongValue, setMsgFeedbackWrongValue] = useState("");
  const [msgFeedbackCorrectValue, setMsgFeedbackCorrectValue] = useState("");
  const [msgFeedbackComment, setMsgFeedbackComment] = useState("");
  const [msgFeedbackSent, setMsgFeedbackSent] = useState(false);
  const msgVoice = useVoiceInput({
    onResult: (text: string) => {
      setLastMsgVoiceText(text);
      setIsAnalyzingMsg(true);
      setMsgVoiceError(null);
      setMissingMsgFields([]);
      parseMsgVoice.mutate({ text });
    },
  });
  const parseMsgVoice = trpc.messages.parseVoice.useMutation({
    onSuccess: (data) => {
      setIsAnalyzingMsg(false);
      const f = data.fields;
      const missing: string[] = [];
      // 本文（空欄のみ上書き）
      if (f.text) setNewMsg(prev => prev.trim() ? prev : f.text!);
      else missing.push("メッセージ本文");
      // 表示開始（空欄のみ上書き）
      if (f.displayFromDate) {
        setDisplayFrom(prev => prev.trim() ? prev : f.displayFromDate!);
        if (f.displayFromTime) setDisplayFromTime(prev => prev.trim() ? prev : f.displayFromTime!);
      }
      // 表示終了（空欄のみ上書き）
      if (f.displayUntilDate) {
        setDisplayUntil(prev => prev.trim() ? prev : f.displayUntilDate!);
        if (f.displayUntilTime) setDisplayUntilTime(prev => prev.trim() ? prev : f.displayUntilTime!);
      }
      // 予約送信（空欄のみ上書き）
      if (f.scheduledAtDate) {
        setScheduledAt(prev => prev.trim() ? prev : f.scheduledAtDate!);
        if (f.scheduledAtTime) setScheduledAtTime(prev => prev.trim() ? prev : f.scheduledAtTime!);
      }
      setMissingMsgFields(missing);
      setMsgVoiceTranscribed(true); // 誤変換報告ボタンを表示する
      if (missing.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (toast as any).success("AIが各項目に転記しました");
      }
      // 転記されたフィールドを黄色フラッシュでハイライト
      const flashMsgIds: string[] = [];
      if (f.text) flashMsgIds.push("msg-content-textarea");
      if (f.displayFromDate) flashMsgIds.push("msg-display-from");
      if (f.displayUntilDate) flashMsgIds.push("msg-display-until");
      if (f.scheduledAtDate) flashMsgIds.push("msg-scheduled-at");
      setTimeout(() => {
        flashMsgIds.forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            el.classList.remove("field-flash");
            void el.offsetWidth;
            el.classList.add("field-flash");
            el.addEventListener("animationend", () => el.classList.remove("field-flash"), { once: true });
          }
        });
      }, 100);
    },
    onError: (e) => {
      setIsAnalyzingMsg(false);
      setMsgVoiceError(e.message || "AI解析に失敗しました。もう一度お試しください");
    },
  });

  // 誤変換報告 mutation
  const reportMsgFeedback = trpc.voiceFeedback.report.useMutation({
    onSuccess: () => {
      setShowMsgFeedbackDialog(false);
      setMsgFeedbackSent(true);
      setTimeout(() => setMsgFeedbackSent(false), 8000);
    },
    onError: (err) => {
      toast.error(`報告に失敗しました: ${err.message}`);
    },
  });

  // メッセージ作成
  const createMsg = trpc.messages.create.useMutation({
    onSuccess: () => {
      utils.messages.getActive.invalidate();
      toast.success("投稿しました");
      setNewMsg("");
      setDisplayFrom(""); setDisplayFromTime("");
      setDisplayUntil(""); setDisplayUntilTime("");
      setScheduledAt(""); setScheduledAtTime("");
      setShowForm(false);
      // 投稿後は誤変換報告を非表示にする
      setMsgVoiceTranscribed(false);
      setMsgFeedbackSent(false);
      // ホーム画面へ遷移
      navigate("/");
    },
    onError: (e) => toast.error(e.message),
  });

  // メッセージ編集state
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  // メッセージ削除確認ダイアログ用state
  const [deleteMsgId, setDeleteMsgId] = useState<number | null>(null);
  const [deleteMsgText, setDeleteMsgText] = useState("");

  // メッセージ編集mutation
  const updateMsg = trpc.messages.update.useMutation({
    onMutate: async ({ id, text }) => {
      await utils.messages.getActive.cancel();
      const prev = utils.messages.getActive.getData();
      utils.messages.getActive.setData(undefined, (old) =>
        old?.map((m) => m.id === id ? { ...m, text } : m)
      );
      return { prev };
    },
    onSuccess: () => {
      setEditingMsgId(null);
      setEditingText("");
      toast.success("メッセージを修正しました");
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.messages.getActive.setData(undefined, ctx.prev);
      toast.error("修正に失敗しました");
    },
    onSettled: () => utils.messages.getActive.invalidate(),
  });

  // メッセージ削除（通常削除・予約送信キャンセル共用）
  const deleteMsg = trpc.messages.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.messages.getActive.cancel();
      const prev = utils.messages.getActive.getData();
      utils.messages.getActive.setData(undefined, (old) => old?.filter((m) => m.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.messages.getActive.setData(undefined, ctx.prev);
      toast.error("削除に失敗しました");
    },
    onSettled: () => {
      utils.messages.getActive.invalidate();
      utils.messages.getPending.invalidate();
    },
  });

  // 予約送信キャンセル確認ダイアログ用state
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelTargetText, setCancelTargetText] = useState("");

  // 予約送信編集ダイアログ用state
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [editDisplayFrom, setEditDisplayFrom] = useState("");
  const [editDisplayUntil, setEditDisplayUntil] = useState("");

  // 予約送信編集用日時変換ヘルパー
  const buildEditDateTime = (date: string, time: string): Date | undefined => {
    if (!date) return undefined;
    const t = time || "00:00";
    return new Date(`${date}T${t}:00`);
  };

  // リアクショントグル
  const toggleReaction = trpc.messages.toggleReaction.useMutation({
    onSuccess: () => utils.messages.getActive.invalidate(),
    onError: (e) => toast.error(e.message),
  });


  const buildDateTime = (date: string, time: string): Date | undefined => {
    if (!date) return undefined;
    const t = time || "00:00";
    return new Date(`${date}T${t}:00`);
  };

  const { isOffline } = useNetworkStatus();
  const { enqueueOffline } = useOfflineQueueContext();

  const handlePost = () => {
    if (!newMsg.trim()) {
      toast.error("メッセージを入力してください");
      return;
    }
    const payload = {
      text: newMsg.trim(),
      displayFrom: buildDateTime(displayFrom, displayFromTime),
      displayUntil: buildDateTime(displayUntil, displayUntilTime),
      scheduledAt: buildDateTime(scheduledAt, scheduledAtTime),
    };
    // オフライン中はキューに保存して後で送信
    if (isOffline) {
      enqueueOffline("messages.create", payload);
      setNewMsg("");
      setDisplayFrom(""); setDisplayFromTime("");
      setDisplayUntil(""); setDisplayUntilTime("");
      setScheduledAt(""); setScheduledAtTime("");
      setShowForm(false);
      return;
    }
    createMsg.mutate(payload);
  };

  // リアクション集計ヘルパー
  const getReactionCounts = (reactions: { emoji: string; userId: number }[]) => {
    const counts: Record<string, { count: number; hasMe: boolean }> = {};
    for (const r of reactions) {
      if (!counts[r.emoji]) counts[r.emoji] = { count: 0, hasMe: false };
      counts[r.emoji].count++;
      if (r.userId === user?.id) counts[r.emoji].hasMe = true;
    }
    return counts;
  };

  return (
    <Card className="fade-in-up stagger-4 shadow-sm flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <MessageSquare className="w-5 h-5 text-primary" />
            <span className="tracking-wide">{title}</span>
            {!isLoading && messages.length > 0 && (
              <span className={cn(
                "ml-1 inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1.5 rounded-full text-xs font-bold transition-all",
                isNight ? "bg-red-800/60 text-red-200" : "bg-red-100 text-red-700",
                badgePulse && "animate-badge-pulse"
              )}>
                {messages.length}
              </span>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 overflow-auto">
        {/* 投稿フォーム */}
        {showForm && (
          <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-primary/5">
            {/* ===== 音声入力 AI カード ===== */}
            <div className={cn(
              "rounded-xl border p-3 space-y-2 transition-colors duration-300",
              msgVoice.isRecording
                ? (msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5
                    ? "border-orange-400/50 bg-orange-50 dark:bg-orange-950/20"
                    : "border-red-400/50 bg-red-50 dark:bg-red-950/20")
                : isAnalyzingMsg
                  ? "border-primary/30 bg-primary/10"
                  : "border-primary/20 bg-primary/5"
            )}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0 pr-2">
                  {isAnalyzingMsg ? (
                    <p className="text-xs text-primary font-medium animate-pulse">AIが解析中...</p>
                  ) : msgVoice.isRecording ? (
                    <div>
                      <p className="text-xs font-semibold text-primary">音声入力でAI自動転記</p>
                      <p className={cn(
                        "text-xs font-medium mt-0.5",
                        msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5
                          ? "text-orange-600 dark:text-orange-400"
                          : "text-red-600 dark:text-red-400 animate-pulse"
                      )}>
                        {msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5
                          ? `あと${msgVoice.silenceCountdown}秒で自動停止`
                          : "🎤 話してください..."}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-primary">音声入力でAI自動転記</p>
                        <VoiceHelpDialog mode="message" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">マイクをタップして話すと各項目に転記</p>
                    </div>
                  )}
                </div>
                {/* 外側リング波形ラッパー */}
                <span className="relative inline-flex items-center justify-center flex-shrink-0">
                  {msgVoice.isRecording && !(msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5) && (
                    <>
                      <span className="absolute inset-0 pointer-events-none rounded-full" style={{ animation: "voiceRing 1.4s ease-out infinite", backgroundColor: "rgba(239, 68, 68, 0.35)" }} />
                      <span className="absolute inset-0 pointer-events-none rounded-full" style={{ animation: "voiceRing2 1.4s ease-out 0.5s infinite", backgroundColor: "rgba(239, 68, 68, 0.25)" }} />
                    </>
                  )}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); if (!isAnalyzingMsg) msgVoice.toggleVoice(); }}
                  disabled={isAnalyzingMsg}
                  className={cn(
                    "relative inline-flex items-center justify-center flex-shrink-0 h-12 w-12 rounded-full",
                    "border-2 transition-all duration-200 select-none touch-manipulation",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isAnalyzingMsg
                      ? "bg-muted border-muted-foreground/30 text-muted-foreground cursor-wait"
                      : msgVoice.isRecording
                        ? (msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5
                            ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/40"
                            : "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/40")
                        : "bg-primary border-primary text-white hover:bg-primary/90 active:scale-95 shadow-md shadow-primary/30"
                  )}
                  aria-label={msgVoice.isRecording ? "録音停止" : "音声入力開始"}
                >
                  {msgVoice.isRecording && (
                    <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                      <span className={cn("absolute inset-0 animate-ping rounded-full opacity-25",
                        msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5 ? "bg-orange-400" : "bg-red-400")} />
                    </span>
                  )}
                  {isAnalyzingMsg ? (
                    <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  ) : msgVoice.isRecording && msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5 ? (
                    <span className="text-sm font-bold leading-none">{msgVoice.silenceCountdown}</span>
                  ) : msgVoice.isRecording ? (
                    <span className="flex items-end justify-center gap-px h-5">
                      {[0,1,2,3].map((i) => (
                        <span key={i} className="w-0.5 bg-white rounded-full" style={{ height: "60%", animation: "voiceBar 0.5s ease-in-out infinite alternate", animationDelay: `${i * 0.12}s` }} />
                      ))}
                    </span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  )}
                </button>
                </span>
              </div>
              {/* 録音中の入力テキストボックス */}
              {(msgVoice.isRecording || lastMsgVoiceText) && (
                <div className={cn(
                  "px-3 py-2 rounded-lg border min-h-[36px] transition-colors duration-300",
                  msgVoice.isRecording
                    ? (msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5
                        ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                        : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800")
                    : "bg-muted/40 border-border"
                )}>
                  {msgVoice.isRecording ? (
                    msgVoice.interimText ? (
                      <p className="text-xs text-red-600 dark:text-red-400 italic leading-relaxed">
                        🎤 {msgVoice.interimText}
                      </p>
                    ) : msgVoice.silenceCountdown !== null && msgVoice.silenceCountdown <= 5 ? (
                      <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                        あと{msgVoice.silenceCountdown}秒で自動停止します
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">話しかけてください...</p>
                    )
                  ) : lastMsgVoiceText ? (
                    <div className="flex items-start gap-1.5">
                      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                        🎤 {lastMsgVoiceText}
                      </p>
                      <button
                        type="button"
                        onClick={() => setLastMsgVoiceText(null)}
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                        title="クリア"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
              {/* エラーバナー */}
              {msgVoiceError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-destructive">{msgVoiceError}</p>
                  {lastMsgVoiceText && (
                    <button type="button" onClick={() => { setIsAnalyzingMsg(true); setMsgVoiceError(null); parseMsgVoice.mutate({ text: lastMsgVoiceText! }); }}
                      className="text-xs text-destructive font-medium underline underline-offset-2 flex-shrink-0">
                      もう一度試す
                    </button>
                  )}
                </div>
              )}
              {/* 未転記項目バナー */}
              {missingMsgFields.length > 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">聴き取れなかった項目があります</p>
                  <div className="flex flex-wrap gap-1">
                    {missingMsgFields.map((fieldName) => {
                      const fieldIdMap: Record<string, string> = {
                        "メッセージ本文": "msg-content-textarea",
                        "表示開始": "msg-display-from",
                        "表示終了": "msg-display-until",
                        "予約送信": "msg-scheduled-at",
                      };
                      const targetId = fieldIdMap[fieldName];
                      return (
                        <button
                          key={fieldName}
                          type="button"
                          onClick={() => {
                            if (targetId) {
                              const el = document.getElementById(targetId);
                              if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              // スクロール完了待機後にフォーカスを当てる
                              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
                                setTimeout(() => el.focus(), 300);
                              } else {
                                const focusable = el.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
                                if (focusable) setTimeout(() => focusable.focus(), 300);
                              }
                            }
                            }
                          }}
                          className="text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-medium hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors cursor-pointer underline underline-offset-2"
                        >
                          {fieldName} →
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400">項目をタップすると入力欄に移動します。マイクで話すか手動入力で補完できます</p>
                </div>
              )}

              {/* 誤変換報告ボタン（音声転記後・投稿前のみ表示） */}
              {msgVoiceTranscribed && !msgFeedbackSent && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowMsgFeedbackDialog(true)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    誤変換を報告する（投稿前に）
                  </button>
                </div>
              )}

              {/* 報告済みフォローアップカード */}
              {msgFeedbackSent && (
                <div className="relative rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setMsgFeedbackSent(false)}
                    className="absolute top-1.5 right-1.5 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
                    aria-label="閉じる"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-start gap-2 pr-4">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-green-800 dark:text-green-300">ご報告ありがとうございます</p>
                      <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">いただいた情報はAIの音声認識精度の改善に活用します。引き続きご協力をお願いします。</p>
                    </div>
                  </div>
                </div>
              )}
            </div>            {/* テキストエリア */}
            <Textarea
              id="msg-content-textarea"
              placeholder="メッセージを入力..."
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              className="text-sm min-h-[80px] resize-none w-full" />
            {/* 表示期間・予約 */}
            {(() => {
              const timeOptions = Array.from({ length: 24 * 12 }, (_, i) => {
                const h = Math.floor(i / 12);
                const m = (i % 12) * 5;
                return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              });
              return (
<>
                  {/* 表示開始 */}
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">表示開始（任意）</label>
                    <div className="flex items-center gap-1.5">
                      <input id="msg-display-from" type="date" value={displayFrom} onChange={(e) => setDisplayFrom(e.target.value)}
                        className="flex-1 text-sm border border-border rounded px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                      {displayFrom && (
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayFrom(""); setDisplayFromTime(""); }} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all active:scale-95 touch-manipulation" title="クリア">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <select value={displayFromTime} onChange={(e) => setDisplayFromTime(e.target.value)}
                        disabled={!displayFrom}
                        className="flex-1 text-sm border border-border rounded px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40">
                        <option value="">時刻選択...</option>
                        {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {displayFromTime && (
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayFromTime(""); }} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all active:scale-95 touch-manipulation" title="時刻クリア">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 表示終了 */}
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">表示終了（任意）</label>
                    <div className="flex items-center gap-1.5">
                      <input id="msg-display-until" type="date" value={displayUntil} onChange={(e) => setDisplayUntil(e.target.value)}
                        className="flex-1 text-sm border border-border rounded px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                      {displayUntil && (
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayUntil(""); setDisplayUntilTime(""); }} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all active:scale-95 touch-manipulation" title="クリア">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <select value={displayUntilTime} onChange={(e) => setDisplayUntilTime(e.target.value)}
                        disabled={!displayUntil}
                        className="flex-1 text-sm border border-border rounded px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40">
                        <option value="">時刻選択...</option>
                        {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {displayUntilTime && (
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayUntilTime(""); }} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all active:scale-95 touch-manipulation" title="時刻クリア">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 予約送信 */}
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">予約送信（任意）</label>
                    <div className="flex items-center gap-1.5">
                      <input id="msg-scheduled-at" type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                        className="flex-1 text-sm border border-border rounded px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                      {scheduledAt && (
                        <button type="button" onClick={(e) => { e.preventDefault(); setScheduledAt(""); setScheduledAtTime(""); }} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all active:scale-95 touch-manipulation" title="クリア">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <select value={scheduledAtTime} onChange={(e) => setScheduledAtTime(e.target.value)}
                        disabled={!scheduledAt}
                        className="flex-1 text-sm border border-border rounded px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40">
                        <option value="">時刻選択...</option>
                        {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {scheduledAtTime && (
                        <button type="button" onClick={(e) => { e.preventDefault(); setScheduledAtTime(""); }} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all active:scale-95 touch-manipulation" title="時刻クリア">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="flex gap-2">
              <Button variant="outline" size="default" className="flex-1 text-sm" onClick={() => {
                setNewMsg("");
                setDisplayFrom(""); setDisplayFromTime("");
                setDisplayUntil(""); setDisplayUntilTime("");
                setScheduledAt(""); setScheduledAtTime("");
                setShowForm(false);
              }}>キャンセル</Button>
              <Button size="default" className="flex-1 text-sm" onClick={handlePost} disabled={createMsg.isPending || !newMsg.trim()}>
                {scheduledAt ? "予約送信" : "投稿"}
              </Button>
            </div>
          </div>
        )}

        {/* メッセージ一覧 */}
        {isLoading ? (
          <div className="space-y-2 py-1">
            {[1,2].map(i => (
              <div key={i} className="h-14 bg-muted/60 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">メッセージはまだありません</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {messages.map((msg) => {
              const reactionCounts = getReactionCounts(msg.reactions ?? []);
              return (
                <div key={msg.id} className={cn("p-2.5 rounded-xl group animate-list-item-in", isNight ? "bg-red-950/30" : "bg-red-50")}>
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {(msg.createdByName ?? "不明")[0]}
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-foreground">
                          {msg.createdByName ?? "不明"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {msg.displayUntil && (
                          <span className={cn("text-xs px-1 rounded", isNight ? "text-amber-400 bg-amber-900/40" : "text-amber-600 bg-amber-50")}>
                            → {new Date(msg.displayUntil).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}まで
                          </span>
                        )}
                        {msg.scheduledAt && new Date(msg.scheduledAt) > new Date() && (
                          <span className={cn("text-xs px-1 rounded", isNight ? "text-blue-400 bg-blue-900/40" : "text-blue-600 bg-blue-50")}>予約</span>
                        )}
                      </div>
                      {editingMsgId === msg.id ? (
                        <div className="mt-1">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full text-sm bg-background border border-border rounded-lg p-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex gap-2 mt-1.5">
                            <button
                              onClick={() => updateMsg.mutate({ id: msg.id, text: editingText.trim() })}
                              disabled={!editingText.trim() || updateMsg.isPending}
                              className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => { setEditingMsgId(null); setEditingText(""); }}
                              className="text-xs px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-base font-semibold text-red-600 dark:text-red-400 leading-relaxed whitespace-pre-wrap w-full">{msg.text}</p>
                      )}
                      {/* 編集・削除ボタン（作成者のみ・本文の下に表示） */}
                      {msg.createdBy === user?.id && editingMsgId !== msg.id && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onPointerDown={() => {}}
                            onClick={() => {
                              setEditingMsgId(msg.id);
                              setEditingText(msg.text);
                            }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-primary/10 min-h-[32px] touch-manipulation"
                            style={{ touchAction: 'manipulation' }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            編集
                          </button>
                          <button
                            onPointerDown={() => {}}
                            onClick={() => {
                              setDeleteMsgId(msg.id);
                              setDeleteMsgText(msg.text);
                            }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10 min-h-[32px] touch-manipulation"
                            style={{ touchAction: 'manipulation' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            削除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* リアクション */}
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-8">
                    {/* 既存リアクション */}
                    {Object.entries(reactionCounts).map(([emoji, { count, hasMe }]) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction.mutate({ messageId: msg.id, emoji })}
                        className={cn(
                          "flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors",
                          hasMe
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-card border-border text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        {emoji} {count}
                      </button>
                    ))}
                    {/* リアクション追加パレット */}
                    <div className="relative group/react">
                      <button className="text-xs px-1.5 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
                        +
                      </button>
                      <div className="absolute bottom-full left-0 mb-1 hidden group-hover/react:flex gap-1 bg-card border border-border rounded-xl shadow-lg p-1.5 z-10">
                        {REACTION_EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => toggleReaction.mutate({ messageId: msg.id, emoji: e })}
                            className="text-base hover:scale-125 transition-transform"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* 予約送信確認セクション */}
        {pendingMessages.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowPending((v) => !v)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors",
                isNight
                  ? "bg-blue-900/30 text-blue-300 hover:bg-blue-900/50"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              )}
            >
              <div className="flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>予約送信待ち</span>
                <span className={cn(
                  "inline-flex items-center justify-center w-4 h-4 text-xs font-bold rounded-full",
                  isNight ? "bg-blue-700 text-white" : "bg-blue-600 text-white"
                )}>{pendingMessages.length}</span>
              </div>
              {showPending ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showPending && (
              <div className={cn(
                "mt-1.5 rounded-xl border p-3 space-y-2",
                isNight ? "border-blue-800/50 bg-blue-950/30" : "border-blue-100 bg-blue-50/50"
              )}>
                {pendingMessages.map((msg) => (
                  <div key={msg.id} className={cn(
                    "p-2.5 rounded-lg border animate-list-item-in",
                    isNight ? "border-blue-800/40 bg-blue-900/20" : "border-blue-100 bg-blue-50/30"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-600">
                        {(msg.createdByName ?? "不明")[0]}
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {msg.createdByName ?? "不明"}
                      </span>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded-full font-medium",
                        isNight ? "bg-blue-800/60 text-blue-300" : "bg-blue-100 text-blue-700"
                      )}>
                        送信予定: {new Date(msg.scheduledAt!).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {/* 自分または管理者の場合に編集・キャンセルボタンを表示 */}
                      {(msg.createdBy === user?.id || user?.role === "admin") && (
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium border transition-colors",
                              isNight
                                ? "border-blue-700/50 text-blue-400 hover:bg-blue-900/40"
                                : "border-blue-200 text-blue-500 hover:bg-blue-50"
                            )}
                            onClick={() => {
                              // 編集ダイアログを開く（現在値で初期化）
                              setEditTargetId(msg.id);
                              setEditText(msg.text);
                              if (msg.scheduledAt) {
                                const d = new Date(msg.scheduledAt);
                                setEditScheduledDate(d.toISOString().slice(0, 10));
                                setEditScheduledTime(d.toTimeString().slice(0, 5));
                              } else {
                                setEditScheduledDate("");
                                setEditScheduledTime("");
                              }
                              if (msg.displayFrom) {
                                const d = new Date(msg.displayFrom);
                                setEditDisplayFrom(d.toISOString().slice(0, 10));
                              } else {
                                setEditDisplayFrom("");
                              }
                              if (msg.displayUntil) {
                                const d = new Date(msg.displayUntil);
                                setEditDisplayUntil(d.toISOString().slice(0, 10));
                              } else {
                                setEditDisplayUntil("");
                              }
                            }}
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium border transition-colors",
                              isNight
                                ? "border-red-700/50 text-red-400 hover:bg-red-900/40"
                                : "border-red-200 text-red-500 hover:bg-red-50"
                            )}
                            onClick={() => {
                              setCancelTargetId(msg.id);
                              setCancelTargetText(msg.text);
                            }}
                          >
                            キャンセル
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed pl-6.5">{msg.text}</p>
                    {(msg.displayFrom || msg.displayUntil) && (
                      <div className="flex flex-wrap gap-1 mt-1 pl-6.5">
                        {msg.displayFrom && (
                          <span className="text-xs text-muted-foreground">
                            表示開始: {new Date(msg.displayFrom).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {msg.displayUntil && (
                          <span className="text-xs text-muted-foreground">
                            表示終了: {new Date(msg.displayUntil).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 新しい投稿ボタン */}
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-primary/30 text-primary hover:border-primary hover:bg-primary/5 transition-colors text-sm font-medium mt-2"
        >
          {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "フォームを閉じる" : "新しい投稿"}
        </button>
      </CardContent>

      {/* メッセージ削除確認ダイアログ */}
      <AlertDialog open={deleteMsgId !== null} onOpenChange={(open) => { if (!open) { setDeleteMsgId(null); setDeleteMsgText(""); } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">メッセージを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMsgText && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-foreground/80 line-clamp-3 my-1">
              {deleteMsgText}
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => { setDeleteMsgId(null); setDeleteMsgText(""); }}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMsg.isPending}
              onClick={() => {
                if (deleteMsgId === null) return;
                deleteMsg.mutate(
                  { id: deleteMsgId },
                  {
                    onSuccess: () => {
                      toast.success("メッセージを削除しました");
                      setDeleteMsgId(null);
                      setDeleteMsgText("");
                    },
                    onError: (e) => toast.error(`削除失敗: ${e.message}`),
                  }
                );
              }}
            >
              {deleteMsg.isPending ? "削除中…" : "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 予約送信キャンセル確認ダイアログ */}
      <Dialog open={cancelTargetId !== null} onOpenChange={(open) => { if (!open) { setCancelTargetId(null); setCancelTargetText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">予約送信をキャンセルしますか？</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3">以下のメッセージの予約送信をキャンセルします。この操作は元に戻せません。</p>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-foreground/80 line-clamp-3">
              {cancelTargetText}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCancelTargetId(null); setCancelTargetText(""); }}
            >
              戻る
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMsg.isPending}
              onClick={() => {
                if (cancelTargetId === null) return;
                deleteMsg.mutate(
                  { id: cancelTargetId },
                  {
                    onSuccess: () => {
                      toast.success("予約送信をキャンセルしました");
                      setCancelTargetId(null);
                      setCancelTargetText("");
                    },
                    onError: (e) => toast.error(e.message),
                  }
                );
              }}
            >
              {deleteMsg.isPending ? "キャンセル中…" : "キャンセルする"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 予約送信編集ダイアログ */}
      <Dialog open={editTargetId !== null} onOpenChange={(open) => { if (!open) setEditTargetId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">予約送信を編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">メッセージ</label>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                maxLength={1000}
                className="text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">送信予約日時</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={editScheduledDate}
                  onChange={(e) => setEditScheduledDate(e.target.value)}
                  className="flex-1 text-xs border rounded-md px-2 py-1.5 bg-background text-foreground"
                />
                <input
                  type="time"
                  step="600"
                  value={editScheduledTime}
                  onChange={(e) => setEditScheduledTime(e.target.value)}
                  className="w-28 text-xs border rounded-md px-2 py-1.5 bg-background text-foreground"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">表示開始日</label>
                <input
                  type="date"
                  value={editDisplayFrom}
                  onChange={(e) => setEditDisplayFrom(e.target.value)}
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background text-foreground"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">表示終了日</label>
                <input
                  type="date"
                  value={editDisplayUntil}
                  onChange={(e) => setEditDisplayUntil(e.target.value)}
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background text-foreground"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditTargetId(null)}
            >
              戻る
            </Button>
            <Button
              size="sm"
              disabled={!editText.trim() || updateMsg.isPending}
              onClick={() => {
                if (editTargetId === null) return;
                updateMsg.mutate({
                  id: editTargetId,
                  text: editText.trim(),
                  scheduledAt: buildEditDateTime(editScheduledDate, editScheduledTime),
                  displayFrom: editDisplayFrom ? buildEditDateTime(editDisplayFrom, "00:00") : null,
                  displayUntil: editDisplayUntil ? buildEditDateTime(editDisplayUntil, "23:59") : null,
                }, {
                  onSuccess: () => {
                    toast.success("予約送信を更新しました");
                    setEditTargetId(null);
                    utils.messages.getPending.invalidate();
                  },
                });
              }}
            >
              {updateMsg.isPending ? "更新中…" : "保存する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 誤変換報告ダイアログ */}
      {showMsgFeedbackDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in-overlay">
          <div className="w-full max-w-sm bg-background rounded-2xl shadow-xl border border-border p-5 space-y-4 animate-slide-up-modal">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">誤変換を報告</h3>
              <button
                type="button"
                onClick={() => setShowMsgFeedbackDialog(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">音声入力で誤った転記があった場合はご報告ください。AIの改善に活用します。</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">誤変換した項目</label>
                <select
                  value={msgFeedbackWrongField}
                  onChange={(e) => setMsgFeedbackWrongField(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">選んでください</option>
                  <option value="メッセージ本文">メッセージ本文</option>
                  <option value="表示開始日時">表示開始日時</option>
                  <option value="表示終了日時">表示終了日時</option>
                  <option value="予約送信日時">予約送信日時</option>
                  <option value="その他">その他</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">AIが転記した誤った内容</label>
                <input
                  type="text"
                  value={msgFeedbackWrongValue}
                  onChange={(e) => setMsgFeedbackWrongValue(e.target.value)}
                  placeholder="例: 3月、4日"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">正しい内容</label>
                <input
                  type="text"
                  value={msgFeedbackCorrectValue}
                  onChange={(e) => setMsgFeedbackCorrectValue(e.target.value)}
                  placeholder="例: 3月、4日"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">コメント（任意）</label>
                <textarea
                  value={msgFeedbackComment}
                  onChange={(e) => setMsgFeedbackComment(e.target.value)}
                  placeholder="その他気になった点があればご記入ください"
                  rows={2}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShowMsgFeedbackDialog(false)}
              >
                キャンセル
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!msgFeedbackWrongField || reportMsgFeedback.isPending}
                onClick={() => {
                  reportMsgFeedback.mutate({
                    originalText: lastMsgVoiceText ?? "",
                    transcribedResult: `メッセージ: ${newMsg}`,
                    wrongField: msgFeedbackWrongField,
                    wrongValue: msgFeedbackWrongValue,
                    correctValue: msgFeedbackCorrectValue,
                    comment: msgFeedbackComment,
                  });
                }}
              >
                {reportMsgFeedback.isPending ? "送信中..." : "報告する"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
// ========== メインページ ==========

const DAILY_WORDS: Record<number, string> = {
  1: "今週も『存在で支え合う』精神で、丁寧な訪問をはじめましょう", // 月
  2: "当事者の希望に寄り添い、伴走型の支援を大切に", // 火
  3: "自分らしさと笑顔を大切に。今日も丁寧にケアを届けましょう", // 水
  4: "地域の方々の安心感と幸福感のために、今日も一歩一歩", // 木
  5: "丁寧であたたかい、心と身体のケアを届ける1日に", // 金
  6: "それぞれの人の生活や人生に明かりを灯す仕事をしています", // 土
  0: "仲間と支えあいながら、今日も笑顔でいきましょう", // 日
};

function getDailyWord(): string {
  const day = new Date().getDay(); // 0=日, 1=月, ..., 6=土
  return DAILY_WORDS[day] ?? "";
}

function getGreeting(): string {
  const now = new Date();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  // 5:00～9:00
  if (totalMinutes >= 300 && totalMinutes <= 540) return "おはようございます！";
  // 9:01～17:00
  if (totalMinutes >= 541 && totalMinutes <= 1020) return "お仕事がんばって！";
  // 17:01～19:00
  if (totalMinutes >= 1021 && totalMinutes <= 1140) return "おつかれさまでした！";
  // 19:01～23:59
  if (totalMinutes >= 1141 && totalMinutes <= 1439) return "時間外にありがとう！";
  // 0:00～4:59
  return "夜中にありがとう！";
}

const LOGO_MARK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_mark_bf1d0229.png";
const LOGO_TEXT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_text_9eb540dd.svg";

// ========== 理念カードアニメーション ==========
// チーム目標テロップ（横スクロール）
function PhilosophyCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shimmerActive, setShimmerActive] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
            setTimeout(() => setShimmerActive(true), 100);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -20px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);
  return (
    <div
      ref={cardRef}
      className={cn(
        "relative rounded-2xl overflow-hidden shadow-sm cursor-pointer select-none transition-[box-shadow,transform] duration-300 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]",
        isVisible ? "philosophy-card-visible" : "philosophy-card-hidden"
      )}
      style={{ background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)", border: "1px solid #fdba74" }}
      onClick={() => { window.location.href = "/hinatas-way"; }}
    >
      {shimmerActive && <div className="philosophy-shimmer" />}
      <div className="px-4 py-3 md:px-5 md:py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
              isVisible ? "philosophy-icon-visible" : "philosophy-icon-hidden"
            )}
            style={{ background: "linear-gradient(135deg, #f97316, #fbbf24)" }}
          >
            <span className="text-white text-xs font-bold tracking-tight">光陽</span>
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-xs font-semibold tracking-widest",
                isVisible ? "philosophy-text1-visible" : "philosophy-text1-hidden"
              )}
              style={{ color: "#c2410c" }}
            >
              私たちの理念
            </p>
            <p
              className={cn(
                "text-sm font-bold leading-snug",
                isVisible ? "philosophy-text2-visible" : "philosophy-text2-hidden"
              )}
              style={{ color: "#7c2d12" }}
            >
              「存在で支え合う」
            </p>
            <p
              className={cn(
                "text-xs leading-relaxed mt-0.5",
                isVisible ? "philosophy-text3-visible" : "philosophy-text3-hidden"
              )}
              style={{ color: "#9a3412" }}
            >
              私たちは出会うすべての人々と、お互いの存在がこころの支えになる関係を築きます。
            </p>
            <p
              className={cn(
                "text-xs font-semibold mt-1.5 flex items-center gap-0.5",
                isVisible ? "philosophy-text4-visible" : "philosophy-text4-hidden"
              )}
              style={{ color: "#ea580c" }}
            >
              理念の全文を読む
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </p>
          </div>
        </div>
        <div className={cn("flex-shrink-0 text-orange-400", isVisible && "philosophy-chevron-pulse")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
    </div>
  );
}
function TeamGoalsTicker() {
  const { data: goals = [] } = trpc.teamGoals.getActive.useQuery();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // 複数の目標がある場合は一定間隔で切り替え（useEffectはreturn nullより前に呼ぶ）
  useEffect(() => {
    if (goals.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % goals.length);
        setVisible(true);
      }, 400);
    }, 10000);
    return () => clearInterval(interval);
  }, [goals.length]);

  const g = goals[currentIndex];
  const startStr = g?.startDate ? (() => { const d = new Date(g.startDate); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; })() : null;
  const endStr = g?.endDate ? (() => { const d = new Date(g.endDate); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; })() : null;

  return (
    <div className="rounded-xl bg-card border border-border shadow-sm">
      <div className="flex items-center gap-3 py-1.5 px-4 min-h-[34px]">
        {!g ? (
          <span className="text-xs text-muted-foreground">チーム目標は未登録です</span>
        ) : (
          <>
            {/* チームバッジ */}
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 transition-opacity duration-300",
                visible ? "opacity-100" : "opacity-0",
                TEAM_BADGE_COLORS[g.team] ?? "bg-muted/60 text-foreground border-border"
              )}
            >
              {g.team}
            </span>
            {/* 目標内容 */}
            <span
              className={cn(
                "text-sm font-semibold text-foreground flex-1 transition-opacity duration-300",
                visible ? "opacity-100" : "opacity-0"
              )}
            >
              {g.title}
            </span>
            {/* 期間 */}
            {(startStr || endStr) && (
              <span
                className={cn(
                  "text-xs text-muted-foreground flex-shrink-0 transition-opacity duration-300",
                  visible ? "opacity-100" : "opacity-0"
                )}
              >
                {startStr ?? ""}{startStr && endStr ? " 〜 " : ""}{endStr ?? ""}
              </span>
            )}
            {/* ページインジケータ（複数の場合のみ） */}
            {goals.length > 1 && (
              <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                {goals.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setVisible(false); setTimeout(() => { setCurrentIndex(i); setVisible(true); }, 400); }}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all duration-300",
                      i === currentIndex ? "bg-orange-500 dark:bg-orange-400 w-3" : "bg-orange-300/60 dark:bg-muted-foreground/40"
                    )}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const greeting = getGreeting();
  const dailyWord = getDailyWord();
  const { user: dashboardUser } = useAuth();
  // 出退勤打刻
  const [attendanceModalType, setAttendanceModalType] = useState<"clock_in" | "clock_out" | null>(null);
  const [alcoholCheckModalType, setAlcoholCheckModalType] = useState<"clock_in" | "clock_out" | null>(null);
  // 出勤完了フラグ（出勤画面で全タスク完了後にtrueになる）
  // localStorageに保存済みの当日状態を読み込んで初期値に反映
  const [clockInAllDone, setClockInAllDone] = useState(() => {
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      // 完了フラグ専用キー（完了後に保存される）を優先確認
      if (localStorage.getItem(`attendance_done_clock_in_${dateStr}`) === "true") return true;
      // モーダル進行中の状態（まだ完了フラグが保存されていない場合）
      const saved = localStorage.getItem(`attendance_clock_in_${dateStr}`);
      if (saved) {
        const state = JSON.parse(saved);
        return state.clockInDone === true && state.alcoholRecorded === true;
      }
    } catch {}
    return false;
  });
  const [clockOutAllDone, setClockOutAllDone] = useState(() => {
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      // 完了フラグ専用キー（完了後に保存される）を優先確認
      if (localStorage.getItem(`attendance_done_clock_out_${dateStr}`) === "true") return true;
      // モーダル進行中の状態
      const saved = localStorage.getItem(`attendance_clock_out_${dateStr}`);
      if (saved) {
        const state = JSON.parse(saved);
        return state.clockOutDone === true && state.alcoholRecorded === true;
      }
    } catch {}
    return false;
  });
  const { data: todayAttendance, refetch: refetchAttendance } = trpc.attendance.today.useQuery();
  // 退勤時チェックリストURL（全チーム共通ツールのcheckout_checklistリンク）
  const { data: allLinks } = trpc.spreadsheetLinks.getCurrent.useQuery();
  // 承認残業時間サマリー（当日・今月）
  const overtimeSummaryDate = (() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    };
  })();
  const { data: overtimeSummary } = trpc.overtime.getMyApprovedSummary.useQuery(
    overtimeSummaryDate,
    { enabled: !!dashboardUser }
  );
  const checkoutChecklistUrl = allLinks?.find((l) => l.linkKey === "checkout_checklist")?.url ?? null;
  const clockMutation = trpc.attendance.clock.useMutation({
    onSuccess: () => { void refetchAttendance(); },
    onError: (e) => toast.error(`打刻に失敗しました: ${e.message}`),
  });
  const lastClockType = todayAttendance && todayAttendance.length > 0
    ? todayAttendance[todayAttendance.length - 1].type
    : null;
  // ボタンクリック → モーダルを開く
  const handleClockIn = () => {
    setAttendanceModalType("clock_in");
  };
  const handleClockOut = () => {
    setAttendanceModalType("clock_out");
  };
  // 出退勤ボタン: AttendanceCheckModal → AlcoholCheckModal の順に表示
  const handleAlcoholCheckIn = () => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setAttendanceModalType("clock_in");
  };
  const handleAlcoholCheckOut = () => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setAttendanceModalType("clock_out");
  };
  // 出勤モーダルで全タスク完了時のコールバック
  const handleClockInConfirm = () => {
    setClockInAllDone(true);
    setAttendanceModalType(null);
    void refetchAttendance();
  };
  // 退勤モーダルで全タスク完了時のコールバック
  const handleClockOutConfirm = () => {
    setClockOutAllDone(true);
    setAttendanceModalType(null);
    void refetchAttendance();
  };
  // 出勤・退勤の打刻状態をlocalStorageからリセットする
  const handleResetAttendance = () => {
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      localStorage.removeItem(`attendance_done_clock_in_${dateStr}`);
      localStorage.removeItem(`attendance_done_clock_out_${dateStr}`);
      localStorage.removeItem(`attendance_clock_in_${dateStr}`);
      localStorage.removeItem(`attendance_clock_out_${dateStr}`);
      setClockInAllDone(false);
      setClockOutAllDone(false);
      toast.success("打刻状態をリセットしました");
    } catch {
      toast.error("リセットに失敗しました");
    }
  };
  // 緊急訪問看護用追加出勤ボタン（退勤後や出勤前に再度出勤打刻が必要な場合）
  const handleEmergencyClockIn = () => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setAttendanceModalType("clock_in");
  };
  const handleEmergencyClockOut = () => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setAttendanceModalType("clock_out");
  };
  // 当日の打刻履歴数（複数回打刻判定用）
  const clockInCount = todayAttendance?.filter((r) => r.type === "clock_in").length ?? 0;
  const clockOutCount = todayAttendance?.filter((r) => r.type === "clock_out").length ?? 0;
  // 毎朝8時以降は緊急出退勤ボタンを非表示にする
  const currentHour = new Date().getHours();
  const isAfter8AM = currentHour >= 8;
  // 緊急訪問看護の追加打刻が必要か（退勤後または出勤前の再出勤）
  const needsEmergencyClockIn = clockInAllDone && clockOutAllDone && !isAfter8AM;
  const needsEmergencyClockOut = clockInCount > clockOutCount && clockInAllDone && clockOutAllDone && !isAfter8AM;
  // ログインユーザーの名前（姓名の場合は名前部分のみ表示）
  const userName = dashboardUser?.name
    ? (dashboardUser.name.includes(' ') || dashboardUser.name.includes('　')
        ? dashboardUser.name.split(/[ 　]/)[1] || dashboardUser.name.split(/[ 　]/)[0]
        : dashboardUser.name)
    : "スタッフ";
  const { isNight } = useTheme();
  // スクロール連動アニメーション
  const scrollContainerRef = useScrollReveal();
  // 月別背景画像マップ（1〜12月））
  const MONTHLY_BANNER_IMAGES: Record<number, string> = {
    1: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_jan-Fu5TZMeS6CZ4gmRUtFPEeA.webp',
    2: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_feb-Xa5NDqzMhPoAejtph4JKfS.webp',
    3: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_mar-nd9pku83re4FKeYUbiXVyD.webp',
    4: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_apr-dM2SbcegqUdXeCRWs6MQ55.webp',
    5: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_may-Kr8nsemNUajNR6fMnS9dmD.webp',
    6: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_jun-QpNR6MtdSEmWXA3U6rgvrM.webp',
    7: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_jul-R6eyP98BvmjJHH69y98YYU.webp',
    8: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_aug-hLvVt9V6o22juQKartQJdF.webp',
    9: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_sep-oLtSqbpPT9wp4GNkRL9aMG.webp',
    10: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_oct-CvmHNym4GMryjZmy7sxWQF.webp',
    11: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_nov-cFdGeHoBsQkUpwhhEmVb4T.webp',
    12: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/banner_dec-f3iNPRUfnQUbFYXacgJDfz.webp',
  };
  const currentMonth = new Date().getMonth() + 1; // 1〜12
  const bannerBgImage = MONTHLY_BANNER_IMAGES[currentMonth];

  // 時間帯によるウェルカムバナーのグラデーション（背景画像上のオーバーレイ）
  const bannerOverlay = isNight
    ? "linear-gradient(135deg, rgba(30,27,75,0.75) 0%, rgba(49,46,129,0.65) 50%, rgba(76,29,149,0.70) 100%)"
    : "linear-gradient(135deg, rgba(249,115,22,0.55) 0%, rgba(251,146,60,0.45) 50%, rgba(251,191,36,0.50) 100%)";

  return (
    <div ref={scrollContainerRef as React.RefObject<HTMLDivElement>} className="p-3 md:p-4 pb-6 md:pb-4 space-y-3 md:space-y-4 max-w-screen-xl mx-auto">
      {/* ウェルカムバナー */}
      <div className="relative rounded-2xl overflow-hidden shadow-md fade-in-up">
        {/* 月別背景画像 */}
        <div className="absolute inset-0" style={{backgroundImage: `url(${bannerBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center'}} />
        {/* 時間帯オーバーレイ（文字の読みやすさを確保） */}
        <div className="absolute inset-0" style={{background: bannerOverlay}} />
        <div className="relative px-4 py-4 md:px-5 md:py-5 flex flex-col gap-2.5">
          {/* 挨拶メッセージ（名前とメッセージを横並び） */}
          <div className="flex flex-row items-baseline gap-2 flex-wrap justify-center">
            <p className="text-xl md:text-3xl font-extrabold text-white leading-tight tracking-wide whitespace-nowrap" style={{textShadow: '0 2px 8px rgba(0,0,0,0.2)'}}>{userName}<span className="text-lg md:text-2xl">さん</span></p>
            <p className="text-xl md:text-3xl font-extrabold text-white/90 whitespace-nowrap" style={{textShadow: '0 1px 4px rgba(0,0,0,0.2)'}}>{greeting}</p>
          </div>
          {/* 今日の一言（夜モード時は非表示） */}
          {!isNight && dailyWord && (
            <p className="text-xs md:text-sm text-white text-center italic leading-snug tracking-wide font-medium" style={{textShadow: '0 1px 4px rgba(0,0,0,0.3)'}}>
              ✦ {dailyWord}
            </p>
          )}

          {/* ショートカットボタン（モバイル: 3列グリッド均等配置 / PC: 折り返し右寄せ） */}
          <div className="grid grid-cols-3 gap-1.5 md:flex md:flex-row md:flex-wrap md:justify-center md:gap-2 items-stretch">
            {/* 1. 出勤 */}
            <button
              type="button"
              onPointerDown={() => {}}
              onClick={handleAlcoholCheckIn}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px] relative" style={{backgroundColor: clockInAllDone ? '#22c55e' : '#d95f5f', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}}
            >
              {clockInAllDone ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  出勤済み
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  出勤
                </>
              )}
            </button>
            {/* 2. 退勤 */}
            <button
              type="button"
              onPointerDown={() => {}}
              onClick={handleAlcoholCheckOut}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px] relative" style={{backgroundColor: clockOutAllDone ? '#22c55e' : '#3b8fd4', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}}
            >
              {clockOutAllDone ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  退勤済み
                </>
              ) : (
                <>
                  <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  退勤
                </>
              )}
            </button>
            {/* 2b. 緊急出勤（退勤後または追加出勤が必要な場合） */}
            {needsEmergencyClockIn && (
              <button
                type="button"
                onPointerDown={() => {}}
                onClick={handleEmergencyClockIn}
                className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px] relative"
                style={{backgroundColor: '#e07b39', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}}
                title="緊急訪問看護などで再度出勤打刻が必要な場合"
              >
                <LogIn className="w-3.5 h-3.5 md:w-4 md:h-4" />
                緊急出勤
              </button>
            )}
            {/* 2c. 緊急退勤（緊急出勤後に退勤打刻が必要な場合） */}
            {needsEmergencyClockOut && (
              <button
                type="button"
                onPointerDown={() => {}}
                onClick={handleEmergencyClockOut}
                className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px] relative"
                style={{backgroundColor: '#e07b39', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}}
                title="緊急訪問看護後の退勤打刻"
              >
                <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
                緊急退勤
              </button>
            )}
            {/* 2d. リセットボタン（出勤済みまたは退勤済みの場合のみ表示） */}
            {(clockInAllDone || clockOutAllDone) && (
              <button
                type="button"
                onPointerDown={() => {}}
                onClick={handleResetAttendance}
                className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px] relative"
                style={{backgroundColor: '#6b7280', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}}
                title="出勤・退勤の打刻済み表示をリセットします（テスト・誤操作時に使用）"
              >
                <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                リセット
              </button>
            )}
            {/* 3. Gemini */}
            <button
              onClick={() => openLink("https://gemini.google.com/app")}
              onPointerDown={() => {}}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px]" style={{backgroundColor: '#7c6fcd', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#6a5eb8')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#7c6fcd')}
            >
              <span className="text-sm leading-none">✨</span>
              Gemini
            </button>
            {/* 4. ZEST */}
            <button
              onClick={() => openLink("https://homecare.zest.jp/login")}
              onPointerDown={() => {}}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px]" style={{backgroundColor: '#0ea5a0', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#0c9490')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#0ea5a0')}
            >
              <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
              ZEST
            </button>
            {/* 5. 日程管理 */}
            <Link
              href="/schedule-management"
              onPointerDown={() => {}}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px]" style={{backgroundColor: '#3a9e6e', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}} onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#2e8a5c')} onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#3a9e6e')}
            >
              <CalendarDays className="w-3.5 h-3.5 md:w-4 md:h-4" />
              日程管理
            </Link>
            {/* 6. 訪問 */}
            <Link
              href="/record#record-condition"
              onPointerDown={() => {}}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px]" style={{backgroundColor: '#b06a1a', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}} onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#9a5c14')} onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#b06a1a')}
            >
              <ClipboardEdit className="w-3.5 h-3.5 md:w-4 md:h-4" />
              訪問
            </Link>
            {/* 7. 業務改善 */}
            <button
              onClick={() => {
                const el = document.getElementById('improvement-box');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              onPointerDown={() => {}}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px]" style={{backgroundColor: '#c0392b', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#a93226')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#c0392b')}
            >
              <span className="text-sm leading-none">💡</span>
              業務改善
            </button>
            {/* 8. 個人タスク */}
            <Link
              href="/personal-tasks"
              onPointerDown={() => {}}
              className="flex items-center justify-center gap-1 transition-all duration-200 text-white text-xs md:text-sm font-semibold px-2 py-2 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0 active:shadow-sm select-none min-h-[40px]" style={{backgroundColor: '#1a6b9e', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'}} onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#155a87')} onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#1a6b9e')}
            >
              <ListTodo className="w-3.5 h-3.5 md:w-4 md:h-4" />
              個人タスク
            </Link>
          </div>

          {/* 承認残業時間表示（承認済みの残業申請がある場合のみ表示） */}
          {overtimeSummary && overtimeSummary.monthTotalMinutes > 0 && (
            <div className="mt-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2.5 space-y-1.5">
              {/* 今月のトータル残業時間 */}
              {overtimeSummary.monthTotalMinutes > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/70">今月のトータル残業時間</span>
                  <span className="text-xs font-bold text-yellow-200 ml-auto">
                    {Math.floor(overtimeSummary.monthTotalMinutes / 60) > 0 ? `${Math.floor(overtimeSummary.monthTotalMinutes / 60)}時間` : ""}{overtimeSummary.monthTotalMinutes % 60 > 0 ? `${overtimeSummary.monthTotalMinutes % 60}分` : ""}{overtimeSummary.monthTotalMinutes === 0 ? "0分" : ""}
                    <span className="text-white/50 font-normal ml-0.5">({overtimeSummary.monthApprovedCount}件)</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 企業理念カード（夜モード・昼モード両方表示・フェードインアニメーション付き） */}
      <PhilosophyCard />

      {/* メインコンテンツ: PC版2カラム、モバイル1カラム */}
      {/* 並び順（モバイル）: 理念→訪問スケジュール→メッセージ→今日の個人タスク→今日の利用者タスク→チームツール→全チーム共通ツール→訪問件数→曜日別件数→新規契約 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 items-start">
        {/* 左カラム */}
        <div className="space-y-3 md:space-y-4">
          {/* 1. 訪問スケジュール */}
          <ScheduleScreenshotCard />
          {/* 2. メッセージ */}
          <div data-scroll-reveal data-delay="100"><MessageBoard title="メッセージ" /></div>
          {/* 3. 今日の個人タスク（モバイルのみ） */}
          <div className="lg:hidden">
            <TasksCard />
          </div>
          {/* 4. 今日の利用者タスク（モバイルのみ） */}
          <div className="lg:hidden">
            <PatientTasksCard />
          </div>
          {/* 5. チームツール（モバイルのみ） */}
          <div className="lg:hidden">
            <TeamToolsCard />
          </div>
          {/* 6. 全チーム共通ツール（モバイルのみ） */}
          <div className="lg:hidden">
            <ToolsCard />
          </div>
          {/* 7. 訪問件数 */}
          <div data-scroll-reveal data-delay="200"><VisitCountCard /></div>
          {/* 8. 曜日別件数 */}
          <div data-scroll-reveal data-delay="300"><DailyByTeamCard /></div>
          {/* 9. 新規契約 */}
          <Card data-scroll-reveal data-delay="400" className="shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                <FileText className="w-5 h-5 text-primary" />
                <span className="tracking-wide">新規契約</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <Link
                href="/new-contract"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                新規契約ページを開く
              </Link>
            </CardContent>
          </Card>
          {/* 業務改善意見笥 */}
          <div id="improvement-box" data-scroll-reveal data-delay="500">
            <ImprovementBox isNightMode={isNight} />
          </div>
        </div>
        {/* 右カラム（PCのみ）: 個人タスク・利用者タスク・チームツール・全チーム共通ツール */}
        <div className="hidden lg:block space-y-3 md:space-y-4">
          <TasksCard />
          <PatientTasksCard />
          <TeamToolsCard />
          <ToolsCard />
        </div>
      </div>

      {/* 出退勤手順確認モーダル（アルコールチェック統合済み） */}
      {attendanceModalType && (
        <AttendanceCheckModal
          type={attendanceModalType}
          onClose={() => setAttendanceModalType(null)}
          onConfirm={attendanceModalType === "clock_in" ? handleClockInConfirm : handleClockOutConfirm}
          checkoutChecklistUrl={checkoutChecklistUrl}
          isEmergency={
            // 緊急打刻判定: 出勤済みかつ退勤済みの後に再度出勤する場合、または緊急退勤の場合
            (attendanceModalType === "clock_in" && needsEmergencyClockIn) ||
            (attendanceModalType === "clock_out" && needsEmergencyClockOut)
          }
        />
      )}
      {/* アルコールチェックモーダル */}
      {alcoholCheckModalType && (
        <AlcoholCheckModal
          clockType={alcoholCheckModalType}
          onClose={() => setAlcoholCheckModalType(null)}
        />
      )}
    </div>
  );
}
