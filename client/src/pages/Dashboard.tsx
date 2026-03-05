/**
 * Dashboard - メインダッシュボードページ
 * Design: 温かみのある和モダン・ケアUI
 * 機能: 訪問件数表示、ZESTスクリーンショット、業務ツールクイックアクセス、タスク、申し送り、訪問推移グラフ
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Upload,
  Calendar,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

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

// 業務ツール
const spreadsheetLinks = [
  { label: "利用者料金一覧（精神郡山）", href: "https://docs.google.com/spreadsheets/d/1YBK1YOFOhJDnry1b0zQjI5jAU91RnBfLOE-bGve3b5M/edit?usp=sharing", color: "text-emerald-600" },
  { label: "利用者料金一覧（身体）", href: "https://docs.google.com/spreadsheets/d/1W4QLGnhg0wuZqcY96M8kIttrqAO00JxFFaJgUb7YOxA/edit?usp=sharing", color: "text-blue-600" },
  { label: "利用者料金一覧（天理）", href: "https://docs.google.com/spreadsheets/d/15BWxn2MHSLcpcKaMa5q9QcIQiccfjiHhAfMKcCnvsVE/edit?usp=sharing", color: "text-purple-600" },
  { label: "業務日報", href: "https://docs.google.com/spreadsheets/d/10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs/edit?usp=sharing", color: "text-orange-600" },
  { label: "ひなた勤怠", href: "https://docs.google.com/spreadsheets/d/1e5xvZHvqSneNZIsO1g8h68-Ue9QnoYXCdCPkt-pIwsQ/edit?usp=sharing", color: "text-rose-600" },
  { label: "退勤時チェックリスト", href: "https://docs.google.com/spreadsheets/d/1g_wTtoQCxiHQupPlEmZVMWWxgzG0ZGH23j-xj1AzdUE/edit?usp=sharing", color: "text-amber-600" },
];

const externalLinks = [
  {
    label: "ZEST — 訪問スケジュール管理",
    desc: "スケジュールの確認・変更はZESTで行います",
    href: "https://homecare.zest.jp/login",
    emoji: "📅",
  },
  {
    label: "NotebookLM — 就業規則・社内マニュアル",
    desc: "AIに質問して就業規則や社内ルールをすぐに確認できます",
    href: "https://notebooklm.google.com/notebook/4781c6de-6e18-456d-b557-a202c3b03747",
    emoji: "📓",
  },
  {
    label: "Gemini — Google AIチャット",
    desc: "GoogleのAIアシスタントで業務相談・文章作成に",
    href: "https://gemini.google.com/app",
    emoji: "✨",
  },
  {
    label: "Gemini Gems — MSE看護記録作成サポーター",
    desc: "MSE形式の看護記録作成をAIがサポートします",
    href: "https://gemini.google.com/gem/1qqbO6BLZLj9IXwsOjYuePdyQn0QGkifV?usp=sharing",
    emoji: "💎",
  },
  {
    label: "こころの訪問看護ステーションひなた 公式 Instagram",
    desc: "@kokoronohinata — 日々の活動やお知らせを発信中",
    href: "https://www.instagram.com/kokoronohinata/",
    emoji: "📷",
  },
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
const DAYS = ["今日", "明日"] as const;
type TeamType = typeof TEAMS[number];
type DayType = typeof DAYS[number];

// ========== サブコンポーネント ==========

function VisitCountCard() {
  const { isNight } = useTheme();
  const { data: visitData, isLoading, refetch } = trpc.visits.getCurrent.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5分ごとに自動更新
    staleTime: 3 * 60 * 1000,
  });

  // ローディング中はスケルトン表示
  if (isLoading) {
    return (
      <Card className="fade-in-up stagger-1 shadow-sm">
        <CardHeader className="pb-1 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              訪問件数
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

  // データがない場合はフォールバック
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

  return (
    <Card className="fade-in-up stagger-1 shadow-sm">
      <CardHeader className="pb-1 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            訪問件数
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground"
            onClick={() => refetch()}
            title="更新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {data.currentMonth}（{data.lastUpdatedDate}時点の累計）
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-3">
        <div className="grid grid-cols-3 gap-2">
          {/* メイン */}
          <div className="space-y-1.5 border-2 border-orange-400 dark:border-orange-500 rounded-xl p-2.5 bg-orange-50/50 dark:bg-orange-950/30">
            <p className="text-xs font-bold text-orange-600 dark:text-orange-400">メイン</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {data.mainActual}
              <span className="text-sm font-semibold text-orange-500 dark:text-orange-400 ml-1">
                / {data.mainDailyTargetCumul > 0 ? data.mainDailyTargetCumul : "—"}
              </span>
            </p>
            <Progress value={mainPct} className="h-2" indicatorClassName={data.mainDailyTargetCumul > 0 ? getPctBarColor(mainPct) : undefined} />
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-sm font-extrabold",
                data.mainDailyTargetCumul > 0 ? getPctColor(mainPct) : "text-orange-400"
              )}>{data.mainDailyTargetCumul > 0 ? `${Math.round(mainPct)}%` : "—"}</p>
              {data.mainTarget > 0 && (
                <p className="text-[10px] font-medium text-orange-500/80 dark:text-orange-400/80">月目標 {data.mainTarget}</p>
              )}
            </div>
            {(() => {
              const diff = getDiffLabel(data.mainActual, data.mainDailyTargetCumul);
              return diff ? (
                <p className={cn("text-[10px] font-medium", diff.over ? "text-emerald-600" : "text-orange-500 dark:text-orange-400")}>
                  {diff.over ? `目標を${diff.text}` : `目標まで${diff.text}`}
                </p>
              ) : null;
            })()}
          </div>
          {/* サブ */}
          <div className="space-y-1.5 border-2 border-sky-400 dark:border-sky-500 rounded-xl p-2.5 bg-sky-50/50 dark:bg-sky-950/30">
            <p className="text-xs font-bold text-sky-600 dark:text-sky-400">サブ</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {data.subActual}
              <span className="text-sm font-semibold text-sky-500 dark:text-sky-400 ml-1">
                / {data.subDailyTargetCumul > 0 ? data.subDailyTargetCumul : "—"}
              </span>
            </p>
            <Progress value={subPct} className="h-2" indicatorClassName={data.subDailyTargetCumul > 0 ? getPctBarColor(subPct) : undefined} />
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-sm font-extrabold",
                data.subDailyTargetCumul > 0 ? getPctColor(subPct) : "text-sky-400"
              )}>
                {data.subDailyTargetCumul > 0 ? `${Math.round(subPct)}%` : "—"}
              </p>
              {data.subTarget > 0 && (
                <p className="text-[10px] font-medium text-sky-500/80 dark:text-sky-400/80">月目標 {data.subTarget}</p>
              )}
            </div>
            {(() => {
              const diff = getDiffLabel(data.subActual, data.subDailyTargetCumul);
              return diff ? (
                <p className={cn("text-[10px] font-medium", diff.over ? "text-emerald-600" : "text-sky-500 dark:text-sky-400")}>
                  {diff.over ? `目標を${diff.text}` : `目標まで${diff.text}`}
                </p>
              ) : null;
            })()}
          </div>
          {/* 合計（メイン換算） */}
          <div className="space-y-1.5 border-[3px] border-emerald-500 dark:border-emerald-400 rounded-xl p-2.5 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-sm shadow-emerald-200 dark:shadow-emerald-900">
            <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">合計</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {data.totalActualEquiv}
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 ml-1">
                / {data.totalTargetEquiv}
              </span>
            </p>
            <Progress value={totalPct} className="h-2" indicatorClassName={getPctBarColor(totalPct)} />
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-base font-extrabold",
                getPctColor(totalPct)
              )}>{Math.round(totalPct)}%</p>
              {data.mainTarget > 0 && (
                <p className="text-[10px] font-medium text-emerald-600/80 dark:text-emerald-400/80">月目標 {data.mainTarget}</p>
              )}
            </div>
            {(() => {
              const diff = getDiffLabel(data.totalActualEquiv, data.totalTargetEquiv);
              return diff ? (
                <p className={cn("text-[10px] font-medium", diff.over ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-600 dark:text-emerald-400")}>
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
                達成率 {Math.round(prevPct)}%
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-bold tabular-nums text-foreground">{data.prevTotalActual.toLocaleString()} 件</span>
            <span className="text-xs text-muted-foreground">目標 {data.prevTotalTarget.toLocaleString()} 件</span>
          </div>
          {/* 横棒グラフ */}
          <div className="relative h-5 rounded-full overflow-hidden bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(prevPct, 100)}%`,
                background: prevAchieved
                  ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                  : 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
              {data.prevTotalActual.toLocaleString()} / {data.prevTotalTarget.toLocaleString()} 件
            </span>
          </div>
          {/* 達成・未達成メッセージ */}
          {prevAchieved ? (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-base">🎉</span>
              <p className={cn("text-xs font-bold", isNight ? "text-emerald-400" : "text-emerald-700")}>先月は目標達成！みんなで協力したおかげです！🌟</p>
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
  );
}

// ========== ZESTスクリーンショットカード（tRPC+S3+DB版）==========

function ScheduleScreenshotCard() {
  const { user } = { user: null as null | { id: number; name: string | null; team: string | null } }; // useAuthは後で使う
  const [selectedTeam, setSelectedTeam] = useState<TeamType>("身体");
  const [selectedDay, setSelectedDay] = useState<DayType>("今日");
  const [isDragging, setIsDragging] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewMeta, setViewMeta] = useState<{ team: string; day: string; uploadedByName: string | null; updatedAt: Date } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // ユーザーのデフォルトチームを取得
  const { data: myTeamData } = trpc.userSettings.getMyTeam.useQuery();
  const setMyTeamMutation = trpc.userSettings.setMyTeam.useMutation({
    onSuccess: () => utils.userSettings.getMyTeam.invalidate(),
  });

  // ユーザーのチームが取得できたらデフォルト選択を更新
  useEffect(() => {
    if (myTeamData?.team) {
      setSelectedTeam(myTeamData.team as TeamType);
    }
  }, [myTeamData?.team]);

  // 全スクショ一覧を取得（30秒ごとに自動更新）
  const { data: screenshots, isLoading: screenshotsLoading } = trpc.schedule.getAll.useQuery(undefined, {
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
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
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              訪問スケジュール
            </CardTitle>
            <a
              href="https://homecare.zest.jp/login"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              ZESTで確認・変更
            </a>
          </div>

          {/* チーム・日付セレクター */}
          <div className="flex flex-wrap gap-2 mt-2">
            <div className="flex gap-1">
              {TEAMS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleTeamChange(t)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border transition-colors",
                    selectedTeam === t
                      ? "bg-primary text-white border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border transition-colors",
                    selectedDay === d
                      ? "bg-primary text-white border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {screenshotsLoading ? (
            <div className="border rounded-xl p-8 flex items-center justify-center bg-muted/20 animate-pulse">
              <p className="text-xs text-muted-foreground">読み込み中...</p>
            </div>
          ) : currentScreenshot ? (
            /* 登録済み画像表示 */
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img
                  src={currentScreenshot.imageUrl}
                  alt={`${selectedTeam}チーム ${selectedDay}のスケジュール`}
                  className="w-full object-contain max-h-72 cursor-pointer"
                  onClick={() => {
                    setViewUrl(currentScreenshot.imageUrl);
                    setViewMeta({
                      team: currentScreenshot.team,
                      day: currentScreenshot.day,
                      uploadedByName: currentScreenshot.uploadedByName,
                      updatedAt: currentScreenshot.updatedAt,
                    });
                  }}
                />
                {/* 削除ボタン（右上・画像に被らない位置）*/}
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="absolute top-2 right-2 bg-white/90 hover:bg-red-50 text-destructive border border-destructive/30 rounded-full p-1.5 shadow-sm transition-colors"
                  title="削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  {selectedTeam}チーム / {selectedDay}
                  {currentScreenshot.uploadedByName && ` · ${currentScreenshot.uploadedByName}`}
                  {" · "}{new Date(currentScreenshot.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 登録
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-xs text-primary hover:underline"
                >
                  {isUploading ? "更新中..." : "更新"}
                </button>
              </div>
            </div>
          ) : (
            /* ドロップゾーン */
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                isUploading ? "border-primary bg-primary/5 opacity-70 cursor-wait" :
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              )}
            >
              <div className="flex flex-col items-center gap-2.5">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                    isDragging ? "bg-primary/20" : "bg-muted"
                  )}
                >
                  <Upload
                    className={cn(
                      "w-6 h-6 transition-colors",
                      isDragging ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isUploading ? "アップロード中..." : isDragging ? "ここにドロップ" : "クリックまたはドラッグ＆ドロップ"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ZESTのスクリーンショットを登録
                  </p>
                  <p className="text-[11px] text-primary font-medium mt-1.5">
                    {selectedTeam}チーム / {selectedDay}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    PNG・JPG・WEBP対応 / 最大10MB
                  </p>
                </div>
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

          {/* 登録済みサムネイル一覧 */}
          {screenshots && screenshots.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">登録済みスクリーンショット</p>
              <div className="flex flex-wrap gap-1.5">
                {screenshots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedTeam(s.team as TeamType);
                      setSelectedDay(s.day as DayType);
                    }}
                    className={cn(
                      "relative w-16 h-11 rounded overflow-hidden border-2 transition-all",
                      s.team === selectedTeam && s.day === selectedDay
                        ? "border-primary shadow-sm"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 leading-tight">
                      {s.team}/{s.day}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 拡大モーダル */}
      {viewUrl && viewMeta && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => { setViewUrl(null); setViewMeta(null); }}
        >
          <div
            className="relative max-w-4xl w-full bg-white rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">
                  {viewMeta.team}チーム / {viewMeta.day}
                </span>
                {viewMeta.uploadedByName && (
                  <span className="text-xs text-muted-foreground">· {viewMeta.uploadedByName}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  · {new Date(viewMeta.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 登録
                </span>
              </div>
              <button
                onClick={() => { setViewUrl(null); setViewMeta(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 画像 */}
            <div className="overflow-auto max-h-[75vh] bg-muted/20">
              <img
                src={viewUrl}
                alt={`${viewMeta.team}チーム ${viewMeta.day}のスケジュール`}
                className="w-full object-contain"
              />
            </div>

            {/* チーム・日付切り替えボタン */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20">
              <div className="flex gap-1.5">
                {TEAMS.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      const found = screenshots?.find(
                        (s) => s.team === t && s.day === viewMeta.day
                      );
                      if (found) {
                        setViewUrl(found.imageUrl);
                        setViewMeta({ team: found.team, day: found.day, uploadedByName: found.uploadedByName, updatedAt: found.updatedAt });
                      } else toast.info(`${t}チームの${viewMeta.day}のスクリーンショットは未登録です`);
                    }}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded border transition-colors",
                      viewMeta.team === t
                        ? "bg-primary text-white border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      const found = screenshots?.find(
                        (s) => s.team === viewMeta.team && s.day === d
                      );
                      if (found) {
                        setViewUrl(found.imageUrl);
                        setViewMeta({ team: found.team, day: found.day, uploadedByName: found.uploadedByName, updatedAt: found.updatedAt });
                      } else toast.info(`${viewMeta.team}チームの${d}のスクリーンショットは未登録です`);
                    }}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded border transition-colors",
                      viewMeta.day === d
                        ? "bg-primary text-white border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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

function ToolsCard() {
  // 当月スプレッドシートリンク（tRPC + DB）
  const { data: sheetLinks } = trpc.spreadsheetLinks.getCurrent.useQuery();

  // マイリンク（tRPC + DB）
  const utils = trpc.useUtils();
  const { data: myLinksData, isLoading: linksLoading } = trpc.myLinks.list.useQuery(undefined, {
    retry: false,
  });
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
    if (!newLabel.trim() || !newHref.trim()) {
      toast.error("ラベルとURLを入力してください");
      return;
    }
    createLink.mutate({ label: newLabel.trim(), url: newHref.trim(), emoji: newEmoji || "🔗" });
    setNewLabel("");
    setNewHref("");
    setNewEmoji("🔗");
    setShowAddForm(false);
  };

  const startEdit = (link: { id: number; label: string; url: string; emoji: string | null }) => {
    setEditingId(link.id);
    setEditLabel(link.label);
    setEditHref(link.url);
    setEditEmoji(link.emoji ?? "🔗");
  };

  const saveEdit = () => {
    if (editingId === null) return;
    if (!editLabel.trim() || !editHref.trim()) {
      toast.error("ラベルとURLを入力してください");
      return;
    }
    updateLink.mutate({ id: editingId, label: editLabel.trim(), url: editHref.trim(), emoji: editEmoji || "🔗" });
  };

  return (
    <Card className="fade-in-up stagger-2 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-primary" />
          業務ツール クイックアクセス
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* スプレッドシート */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            📊 スプレッドシート
          </p>
          <div className="flex flex-col gap-1.5">
            {sheetLinks && sheetLinks.length > 0 ? (
              sheetLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-md",
                    "bg-muted/50 hover:bg-muted transition-colors",
                    link.color ?? "text-emerald-600"
                  )}
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{link.label}</span>
                </a>
              ))
            ) : (
              // DB未登録時は静的データをフォールバック表示
              spreadsheetLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-md",
                    "bg-muted/50 hover:bg-muted transition-colors",
                    link.color
                  )}
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{link.label}</span>
                </a>
              ))
            )}
          </div>
        </div>

        {/* マイリンク */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              🔖 マイリンク
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-primary px-2"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="w-3 h-3 mr-1" />
              追加
            </Button>
          </div>
          {showAddForm && (
            <div className="space-y-1.5 mb-2 p-2 bg-muted/30 rounded-lg">
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="🔗"
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  className="w-10 text-xs border border-border rounded px-1 py-1 bg-white text-center"
                />
                <input
                  type="text"
                  placeholder="ラベル名"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="flex-1 text-xs border border-border rounded px-2 py-1 bg-white"
                />
              </div>
              <input
                type="url"
                placeholder="https://..."
                value={newHref}
                onChange={(e) => setNewHref(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-white"
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={addLink} disabled={createLink.isPending}>追加</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAddForm(false)}>キャンセル</Button>
              </div>
            </div>
          )}
          {linksLoading ? (
            <p className="text-xs text-muted-foreground text-center py-2">読み込み中...</p>
          ) : !myLinksData || myLinksData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              『追加』ボタンからリンクを登録できます
            </p>
          ) : (
            <div className="space-y-1">
              {myLinksData.map((link) => (
                <div key={link.id}>
                  {editingId === link.id ? (
                    // 編集フォーム
                    <div className="space-y-1 p-2 bg-muted/30 rounded-lg">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          placeholder="絵文字"
                          value={editEmoji}
                          onChange={(e) => setEditEmoji(e.target.value)}
                          className="w-10 text-xs border border-border rounded px-1 py-1 bg-white text-center"
                        />
                        <input
                          type="text"
                          placeholder="ラベル名"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="flex-1 text-xs border border-border rounded px-2 py-1 bg-white"
                        />
                      </div>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={editHref}
                        onChange={(e) => setEditHref(e.target.value)}
                        className="w-full text-xs border border-border rounded px-2 py-1 bg-white"
                      />
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs flex-1" onClick={saveEdit} disabled={updateLink.isPending}>保存</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>キャンセル</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-md bg-muted/50 hover:bg-muted text-primary transition-colors min-w-0"
                      >
                        <span className="flex-shrink-0">{link.emoji ?? "🔗"}</span>
                        <span className="truncate">{link.label}</span>
                      </a>
                      <button
                        onClick={() => startEdit({ id: link.id, label: link.label, url: link.url, emoji: link.emoji ?? "🔗" })}
                        className="text-muted-foreground hover:text-primary p-1 flex-shrink-0"
                        title="編集"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        onClick={() => deleteLink.mutate({ id: link.id })}
                        className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0"
                        title="削除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

function QuickLinksCard() {
  return (
    <Card className="fade-in-up stagger-4 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" />
          AIツール・外部リンク
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {externalLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 hover:bg-muted transition-colors group"
          >
            <span className="text-base flex-shrink-0 mt-0.5">{link.emoji}</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                {link.label}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{link.desc}</p>
            </div>
            <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

function TasksCard() {
  const [tasks, setTasks] = useState(initialTasks);
  const [newTask, setNewTask] = useState("");

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks((prev) => [
      ...prev,
      { id: Date.now(), text: newTask, done: false, priority: "medium" as const },
    ]);
    setNewTask("");
    toast.success("タスクを追加しました");
  };

  const deleteTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const incomplete = tasks.filter((t) => !t.done);

  return (
    <Card className="fade-in-up stagger-3 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            未完了タスク
          </CardTitle>
          <Link href="/tasks">
            <span className="text-xs text-primary hover:underline cursor-pointer">すべて見る</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {incomplete.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            未完了のタスクはありません ✓
          </p>
        ) : (
          incomplete.slice(0, 5).map((task) => (
            <div key={task.id} className="flex items-center gap-2 group">
              <button onClick={() => toggleTask(task.id)} className="flex-shrink-0">
                {task.done ? (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
              </button>
              <span
                className={cn(
                  "flex-1 text-sm",
                  task.done ? "line-through text-muted-foreground" : "text-foreground"
                )}
              >
                {task.text}
              </span>
              {task.priority === "high" && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1">急</Badge>
              )}
              <button
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}

        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            placeholder="新しいタスクを追加..."
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            className="flex-1 text-xs border border-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button size="sm" className="h-7 text-xs px-2" onClick={addTask}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const REACTION_EMOJIS = ["❤️", "👍", "🙏", "✅", "👀"];

function MessageBoard({ title }: { title: string }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();

  // DBからメッセージ取得
  const { data: messages = [], isLoading } = trpc.messages.getActive.useQuery(undefined, {
    refetchInterval: 30000, // 30秒ごとに自動更新
  });

  const [newMsg, setNewMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [displayFrom, setDisplayFrom] = useState("");
  const [displayUntil, setDisplayUntil] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // メッセージ作成
  const createMsg = trpc.messages.create.useMutation({
    onSuccess: () => {
      utils.messages.getActive.invalidate();
      toast.success("投稿しました");
      setNewMsg("");
      setDisplayFrom("");
      setDisplayUntil("");
      setScheduledAt("");
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // メッセージ削除
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
    onSettled: () => utils.messages.getActive.invalidate(),
  });

  // リアクショントグル
  const toggleReaction = trpc.messages.toggleReaction.useMutation({
    onSuccess: () => utils.messages.getActive.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  // 音声入力
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 16 * 1024 * 1024) {
          toast.error("音声ファイルが大きすぎます（16MB以下）");
          return;
        }
        toast.info("文字起こし中...");
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: formData, credentials: "include" });
          const data = await res.json();
          if (data.text) {
            setNewMsg((prev) => prev + (prev ? " " : "") + data.text);
            toast.success("音声入力完了");
          } else {
            toast.error("文字起こしに失敗しました");
          }
        } catch {
          toast.error("音声入力エラー");
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      toast.error("マイクのアクセスが許可されていません");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handlePost = () => {
    if (!newMsg.trim()) {
      toast.error("メッセージを入力してください");
      return;
    }
    createMsg.mutate({
      text: newMsg.trim(),
      displayFrom: displayFrom ? new Date(displayFrom) : undefined,
      displayUntil: displayUntil ? new Date(displayUntil) : undefined,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });
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
    <Card className="fade-in-up stagger-4 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            {title}
          </CardTitle>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            <Plus className="w-3.5 h-3.5" />投稿
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 投稿フォーム */}
        {showForm && (
          <div className="border border-primary/20 rounded-xl p-3 space-y-2 bg-primary/5">
            <div className="flex gap-1.5">
              <Textarea
                placeholder="メッセージを入力..."
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                className="text-xs min-h-[60px] resize-none flex-1"
              />
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={cn(
                  "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors self-end",
                  isRecording
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-muted text-muted-foreground hover:bg-primary/20"
                )}
                title="押して話す"
              >
                🎤
              </button>
            </div>
            {isRecording && (
              <p className="text-[10px] text-red-500 font-medium animate-pulse">● 録音中...指を離すと停止</p>
            )}
            {/* 表示期間・予約 */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">表示開始（任意）</label>
                <input type="datetime-local" value={displayFrom} onChange={(e) => setDisplayFrom(e.target.value)}
                  className="w-full text-[11px] border border-border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">表示終了（任意）</label>
                <input type="datetime-local" value={displayUntil} onChange={(e) => setDisplayUntil(e.target.value)}
                  className="w-full text-[11px] border border-border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">予約送信（任意）</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full text-[11px] border border-border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setShowForm(false)}>キャンセル</Button>
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handlePost} disabled={createMsg.isPending || !newMsg.trim()}>
                {scheduledAt ? "予約送信" : "投稿"}
              </Button>
            </div>
          </div>
        )}

        {/* メッセージ一覧 */}
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-3">読み込み中...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">メッセージはまだありません</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {messages.map((msg) => {
              const reactionCounts = getReactionCounts(msg.reactions ?? []);
              return (
                <div key={msg.id} className="p-2.5 bg-muted/30 rounded-xl group">
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                      {(msg.createdByName ?? "不明")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-semibold text-foreground">{msg.createdByName}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {msg.displayUntil && (
                          <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">
                            → {new Date(msg.displayUntil).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}まで
                          </span>
                        )}
                        {msg.scheduledAt && new Date(msg.scheduledAt) > new Date() && (
                          <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded">予約</span>
                        )}
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                    {/* 削除ボタン（作成者のみ） */}
                    {msg.createdBy === user?.id && (
                      <button
                        onClick={() => deleteMsg.mutate({ id: msg.id })}
                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {/* リアクション */}
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-8">
                    {/* 既存リアクション */}
                    {Object.entries(reactionCounts).map(([emoji, { count, hasMe }]) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction.mutate({ messageId: msg.id, emoji })}
                        className={cn(
                          "flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors",
                          hasMe
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-white border-border text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        {emoji} {count}
                      </button>
                    ))}
                    {/* リアクション追加パレット */}
                    <div className="relative group/react">
                      <button className="text-[11px] px-1.5 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
                        +
                      </button>
                      <div className="absolute bottom-full left-0 mb-1 hidden group-hover/react:flex gap-1 bg-white border border-border rounded-xl shadow-lg p-1.5 z-10">
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
      </CardContent>
    </Card>
  );
}

// ========== メインページ ==========

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

export default function Dashboard() {
  const greeting = getGreeting();
  const userName = "崇";
  const { isNight } = useTheme();

  // 時間帯によるウェルカムバナーのグラデーション
  const bannerGradient = isNight
    ? "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)"
    : "linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)";

  return (
    <div className="p-3 md:p-4 space-y-3 md:space-y-4 max-w-screen-xl mx-auto">
      {/* ウェルカムバナー */}
      <div className="relative rounded-2xl overflow-hidden shadow-md fade-in-up" style={{background: bannerGradient}}>
        {/* 背景装飾 */}
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: "radial-gradient(circle at 80% 20%, white 0%, transparent 60%)"}} />
        <div className="relative px-4 py-2 md:px-5 md:py-2.5 flex flex-col gap-2">
          {/* 挨拶メッセージ（名前とメッセージを横並び） */}
          <div className="flex flex-row items-baseline gap-2 flex-wrap justify-center md:justify-start">
            <p className="text-xl md:text-3xl font-extrabold text-white leading-tight tracking-wide whitespace-nowrap" style={{textShadow: '0 2px 8px rgba(0,0,0,0.2)'}}>{userName}<span className="text-lg md:text-2xl">さん</span></p>
            <p className="text-xl md:text-3xl font-extrabold text-white/90 whitespace-nowrap" style={{textShadow: '0 1px 4px rgba(0,0,0,0.2)'}}>{greeting}</p>
          </div>
          {/* ショートカットボタン（モバイル中央・PC右寄せ） */}
          <div className="flex flex-row items-center gap-2 justify-center md:justify-end">
            <a
              href="https://homecare.zest.jp/login"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-all text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm" style={{backgroundColor: '#00b5a3'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#009e8e')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#00b5a3')}
            >
              <Calendar className="w-3.5 h-3.5" />
              ZEST
            </a>
            <a
              href="https://gemini.google.com/app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-all text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm" style={{backgroundColor: '#9b7fd4'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#8a6ec3')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#9b7fd4')}
            >
              <span className="text-sm leading-none">✨</span>
              Gemini
            </a>
            <Link href="/record">
              <span className="flex items-center gap-1.5 transition-all text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm cursor-pointer" style={{backgroundColor: '#e06060'}}>
                <ClipboardList className="w-3.5 h-3.5" />
                記録
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* 訪問件数カード（ウェルカムバナー直下） */}
      <VisitCountCard />

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        {/* 左カラム */}
        <div className="lg:col-span-2 space-y-3 md:space-y-4">
          <ScheduleScreenshotCard />
        </div>

        {/* 右カラム */}
        <div className="space-y-3 md:space-y-4">
          <ToolsCard />
          <TasksCard />
          <MessageBoard title="メッセージ" />
          <QuickLinksCard />
        </div>
      </div>
    </div>
  );
}
