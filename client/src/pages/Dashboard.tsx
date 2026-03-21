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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getAllTeamButtonStyle, getTeamButtonStyle } from "@shared/teamColors";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import TaskCreateForm from "@/components/TaskCreateForm";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { VoiceHelpDialog } from "@/components/VoiceHelpDialog";

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

// 業務ツール - スプレッドシート
const spreadsheetLinks = [
  { label: "利用者料金一覧（精神郡山）", href: "https://docs.google.com/spreadsheets/d/1YBK1YOFOhJDnry1b0zQjI5jAU91RnBfLOE-bGve3b5M/edit?usp=sharing", color: "text-emerald-600" },
  { label: "利用者料金一覧（身体）", href: "https://docs.google.com/spreadsheets/d/1W4QLGnhg0wuZqcY96M8kIttrqAO00JxFFaJgUb7YOxA/edit?usp=sharing", color: "text-blue-600" },
  { label: "利用者料金一覧（天理）", href: "https://docs.google.com/spreadsheets/d/15BWxn2MHSLcpcKaMa5q9QcIQiccfjiHhAfMKcCnvsVE/edit?usp=sharing", color: "text-teal-600 dark:text-teal-400" },
  { label: "業務日報", href: "https://docs.google.com/spreadsheets/d/10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs/edit?usp=sharing", color: "text-orange-600" },
  { label: "ひなた勤怠", href: "https://docs.google.com/spreadsheets/d/1e5xvZHvqSneNZIsO1g8h68-Ue9QnoYXCdCPkt-pIwsQ/edit?usp=sharing", color: "text-rose-600" },
  { label: "退勤時チェックリスト", href: "https://docs.google.com/spreadsheets/d/1g_wTtoQCxiHQupPlEmZVMWWxgzG0ZGH23j-xj1AzdUE/edit?usp=sharing", color: "text-amber-600" },
];

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
const DAYS = ["今日", "明日"] as const;
type TeamType = typeof TEAMS[number];
type DayType = typeof DAYS[number];

// チームカラーはshared/teamColors.tsで管理（getTeamButtonClassを使用）

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
    <Card className="fade-in-up stagger-1 shadow-sm flex flex-col">
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
      <CardContent className="space-y-3 px-4 pb-3 flex-1">
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
        <div className="text-center text-[10px] text-muted-foreground/50 py-1">
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
            <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
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
            <div className="text-xs text-muted-foreground py-2 text-center">読み込み中...</div>
          ) : comments && comments.length > 0 ? (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2 bg-background/60 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-semibold text-foreground">{c.userName}</span>
                      <span className="text-[10px] text-muted-foreground">
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
                  {user && user.id === c.userId && editingId !== c.id && (
                    <div className="flex gap-1 flex-shrink-0 mt-0.5">
                      <button
                        onClick={() => handleEditStart(c.id, c.content)}
                        className="text-muted-foreground/50 hover:text-primary transition-colors"
                        title="編集"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: c.id })}
                        className="text-muted-foreground/50 hover:text-destructive transition-colors"
                        disabled={deleteMutation.isPending}
                        title="削除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground/50 py-2 text-center">コメントはまだありません</div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== ZESTスクリーンショットカード（tRPC+S3+DB版）==========

function ScheduleScreenshotCard() {
  const { user } = useAuth();
  const SCHEDULE_TEAM_KEY = "hinata_schedule_team";
  const SCHEDULE_ALL_TEAMS_KEY = "hinata_schedule_all_teams";
  const VALID_SCHEDULE_TEAMS: TeamType[] = ["身体", "天理", "郡山北部", "郡山南部"];

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
            <div className="flex gap-1 flex-wrap">
              {/* 全チームボタン */}
              <button
                onClick={() => {
                  setShowAllTeams(true);
                  setSwipeIndex(0);
                }}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md border transition-all font-medium",
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
                    "text-xs px-2.5 py-1 rounded-md transition-all font-medium",
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
              <div className="flex gap-1 ml-auto">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setSelectedDay(d);
                      setSwipeIndex(DAYS.indexOf(d));
                    }}
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
            <div className="space-y-2">
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
                          {/* チーム・日付ラベル（全チームモード時は常時表示） */}
                          {showAllTeams && (
                            <div className="absolute top-2 left-2 bg-black/65 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none">
                              {team} / {day}
                            </div>
                          )}
                          {/* タップで拡大ヒント */}
                          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 pointer-events-none">
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
                            <div className="text-sm font-semibold text-foreground">{team}チーム / {day}</div>
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
                                <p className="text-[11px] text-primary font-medium mt-1.5">{team}チーム / {day}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">PNG・JPG・WEBP対応 / 最大10MB</p>
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
                <p className="text-[10px] text-muted-foreground">
                  {selectedTeam}チーム / {selectedDay}
                  {currentScreenshot?.uploadedByName && ` ・ ${currentScreenshot.uploadedByName}`}
                  {currentScreenshot && ` ・ ${new Date(currentScreenshot.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 登録`}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-xs text-primary hover:underline"
                >
                  {isUploading ? "更新中..." : currentScreenshot ? "更新" : "登録"}
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
      {viewMeta && (() => {
        // 全チームのスクショ（登録済み・未登録問わず）を取得
        const allTeamSlides = TEAMS.map((team) => ({
          team,
          screenshot: screenshots?.find((s) => s.team === team && s.day === viewMeta.day) ?? null,
        }));
        const registeredCount = allTeamSlides.filter((s) => s.screenshot !== null).length;

        // 各チームセクションのスクロール先IDを生成
        const teamSectionId = (team: string) => `modal-team-${team.replace(/\s/g, "-")}`;

        const scrollToTeam = (team: string, container: HTMLElement | null) => {
          if (!container) return;
          const el = container.querySelector(`#${teamSectionId(team)}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        };

        return (
        <div
          className="fixed inset-0 z-50 bg-black/85 overflow-y-auto"
          id="modal-scroll-container"
          onClick={() => { setViewUrl(null); setViewMeta(null); }}
        >
          <div
            className="relative max-w-2xl w-full mx-auto bg-card text-card-foreground rounded-xl shadow-2xl mt-4 mb-10"
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
                  onClick={() => { setViewUrl(null); setViewMeta(null); }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* 今日/明日タブ */}
              <div className="flex gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setViewMeta({ ...viewMeta, day: d })}
                    className={cn(
                      "px-4 py-1.5 text-xs font-semibold rounded-full transition-colors",
                      viewMeta.day === d
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {/* チームジャンプボタン行 */}
              <div className="flex gap-1 flex-wrap">
                {TEAMS.map((team) => (
                  <button
                    key={team}
                    onClick={() => scrollToTeam(team, document.getElementById("modal-scroll-container"))}
                    className="px-3 py-1 text-[11px] font-medium rounded-full bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-border/50"
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
                        <span className="text-xs text-muted-foreground/60 italic">未登録</span>
                      )}
                    </div>
                    {screenshot && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(screenshot.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 登録
                      </span>
                    )}
                  </div>
                  {screenshot ? (
                    <PinchZoomImage
                      src={screenshot.imageUrl}
                      alt={`${team}\u30c1\u30fc\u30e0 ${viewMeta.day}\u306e\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb`}
                      onClickLightbox={() => {
                        setLightboxSrc(screenshot.imageUrl);
                        setLightboxAlt(`${team}\u30c1\u30fc\u30e0 ${viewMeta.day}\u306e\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb`);
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-24 bg-muted/20 text-muted-foreground/50 gap-1">
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
                        onClick={() => scrollToTeam(nextTeam, document.getElementById("modal-scroll-container"))}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        {nextTeam}チームへ
                      </button>
                    ) : (
                      <button
                        onClick={() => scrollToTeam(TEAMS[0], document.getElementById("modal-scroll-container"))}
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
      })()}

      {/* 個別ライトボックス（1枚フルスクリーン表示） */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[60] bg-black/95"
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
            className="absolute inset-0 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <PinchZoomImage
              src={lightboxSrc}
              alt={lightboxAlt}
              fullscreen
            />
          </div>
          {/* キャプション */}
          <div className="absolute bottom-4 left-0 right-0 text-center text-white/60 text-xs pointer-events-none z-10">
            {lightboxAlt} — ピンチで拡大・ダブルタップでリセット・四隅のクリックまたはESCで閉じる
          </div>
        </div>
      )}
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

function LinkRow({ href, label, color, emoji }: { href: string; label: string; color?: string; emoji?: string }) {
  const { isNight } = useTheme();
  const [isOpening, setIsOpening] = useState(false);
  const utils = trpc.useUtils();
  // 夜間モード時は-600番台を-400番台に変換して視認性を上げる
  const nightColor = color ? color.replace(/-600$/, "-400").replace(/-700$/, "-300") : "text-foreground";

  const isDailyReport = href.includes(DAILY_REPORT_SPREADSHEET_ID);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isDailyReport) return; // 業務日報以外は通常のリンク動作
    e.preventDefault();
    setIsOpening(true);
    try {
      const result = await utils.spreadsheetLinks.getDailyReportSheetGid.fetch();
      if (result.gid !== null) {
        window.open(
          `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit#gid=${result.gid}`,
          "_blank",
          "noopener,noreferrer"
        );
      } else {
        // 本日のタブが見つからない場合は通常のリンクで開く
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } catch {
      // エラー時は通常のリンクで開く
      window.open(href, "_blank", "noopener,noreferrer");
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2 text-sm py-2.5 px-3 rounded-md",
        "bg-muted/50 hover:bg-muted transition-colors font-medium",
        isOpening ? "opacity-60 cursor-wait" : "",
        isNight ? nightColor : (color ?? "text-foreground")
      )}
    >
      {isOpening
        ? <span className="flex-shrink-0 w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : emoji ? <span className="flex-shrink-0">{emoji}</span> : <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />}
      <span className="truncate">{label}</span>
    </a>
  );
}

/** スプレッドシートタブ内の「日々使用」「その他」サブタブ
 * 「日々使用」: 月次DB登録分（5種類）を自動表示
 * 「その他」: quickAccessLinksから取得
 */
function SheetSubTabs({ quickLinks }: { quickLinks: { id: number; label: string; href: string; color: string; emoji: string | null; category: string }[] | undefined }) {
  const [subTab, setSubTab] = useState<"daily" | "other">("daily");

  // 月次リンク（当月分、なければ直近登録）
  const { data: monthlyLinks, isLoading: monthlyLoading } = trpc.spreadsheetLinks.getCurrent.useQuery();

  // 当月年月
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 当月分か直近登録かを判定（バッジ表示用）
  const isCurrentMonth = monthlyLinks && monthlyLinks.length > 0 && monthlyLinks[0].yearMonth === currentYearMonth;

  const otherLinks = quickLinks?.filter((l) => l.category === "スプレッドシート（その他）") ?? [];

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
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                isCurrentMonth
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              )}>
                {isCurrentMonth ? `✔ ${monthlyLinks[0].yearMonth}分` : `⚠ 最新: ${monthlyLinks[0].yearMonth}分`}
              </span>
              {!isCurrentMonth && (
                <span className="text-[10px] text-muted-foreground">当月分は未登録</span>
              )}
            </div>
          )}

          {monthlyLoading ? (
            <p className="text-xs text-muted-foreground text-center py-3">読み込み中...</p>
          ) : !monthlyLinks || monthlyLinks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">リンクはまだ登録されていません</p>
          ) : (
            monthlyLinks.map((link) => (
              <LinkRow
                key={link.id}
                href={link.url}
                label={link.label}
                color={link.color ?? "text-emerald-600"}
                emoji="📊"
              />
            ))
          )}
        </div>
      )}

      {/* その他タブ: quickAccessLinksから取得 */}
      {subTab === "other" && (
        otherLinks.length > 0
          ? otherLinks.map((link) => (
              <LinkRow key={link.id} href={link.href} label={link.label} color={link.color} emoji={link.emoji || undefined} />
            ))
          : <p className="text-xs text-muted-foreground text-center py-3">その他のリンクはまだありません</p>
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
      <span className="ml-auto text-[10px] text-amber-500 font-normal">経営理念</span>
    </button>
  );
}

function ToolsCard() {
  const [activeTab, setActiveTab] = useState<ToolsTabId>("sheet");

  // 当月スプレッドシートリンク（tRPC + DB）
  const { data: sheetLinks } = trpc.spreadsheetLinks.getCurrent.useQuery();

  // クイックアクセスリンク（tRPC + DB）
  const { data: quickLinks } = trpc.quickAccessLinks.list.useQuery();
  const docLinks: { label: string; href: string; color: string; emoji?: string }[] = quickLinks
    ? quickLinks.filter((l) => l.category === "ドキュメント").map((l) => ({ label: l.label, href: l.href, color: l.color, emoji: l.emoji || undefined }))
    : documentLinks;
  const frmLinks: { label: string; href: string; color: string; emoji?: string }[] = quickLinks
    ? quickLinks.filter((l) => l.category === "フォーム").map((l) => ({ label: l.label, href: l.href, color: l.color, emoji: l.emoji || undefined }))
    : formLinks;
  const othLinks: { label: string; href: string; color: string; emoji?: string }[] = quickLinks
    ? quickLinks.filter((l) => l.category === "その他").map((l) => ({ label: l.label, href: l.href, color: l.color, emoji: l.emoji || undefined }))
    : otherLinks;

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

  const startEdit = (link: { id: number; label: string; url: string; emoji: string | null }) => {
    setEditingId(link.id); setEditLabel(link.label); setEditHref(link.url); setEditEmoji(link.emoji ?? "🔗");
  };

  const saveEdit = () => {
    if (editingId === null) return;
    if (!editLabel.trim() || !editHref.trim()) { toast.error("ラベルとURLを入力してください"); return; }
    updateLink.mutate({ id: editingId, label: editLabel.trim(), url: editHref.trim(), emoji: editEmoji || "🔗" });
  };

  return (
    <Card className="fade-in-up stagger-2 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-primary" />
          全チーム共通ツール
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
                "flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[10px] font-medium transition-all",
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
            <SheetSubTabs quickLinks={quickLinks} />
          )}

          {/* ドキュメント */}
          {activeTab === "doc" && (
            <>
              {docLinks.length > 0
                ? docLinks.map((link) => (
                    <LinkRow key={link.href} href={link.href} label={link.label} color={link.color} emoji={link.emoji} />
                  ))
                : <p className="text-xs text-muted-foreground text-center py-4">ドキュメントリンクはまだありません</p>
              }
            </>
          )}

          {/* フォーム */}
          {activeTab === "form" && (
            <>
              {frmLinks.length > 0
                ? frmLinks.map((link) => (
                    <LinkRow key={link.href} href={link.href} label={link.label} color={link.color} emoji={link.emoji} />
                  ))
                : <p className="text-xs text-muted-foreground text-center py-4">フォームリンクはまだありません</p>
              }
            </>
          )}

          {/* その他 */}
          {activeTab === "other" && (
            <>
              {/* Hinata's Way 固定リンク */}
              <HinatasWayButton />
              {othLinks.map((link) => (
                <LinkRow key={link.href} href={link.href} label={link.label} color={link.color} emoji={link.emoji} />
              ))}
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
                <p className="text-xs text-muted-foreground text-center py-2">読み込み中...</p>
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
                            className="flex-1 flex items-center gap-2 text-sm py-2.5 px-3 rounded-md bg-muted/50 hover:bg-muted text-primary transition-colors min-w-0 font-medium">
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
  { id: "身体" as const, label: "身", title: "身体" },
  { id: "天理" as const, label: "天", title: "天理" },
  { id: "郡山北部" as const, label: "北", title: "郡山北部" },
  { id: "郡山南部" as const, label: "南", title: "郡山南部" },
] as const;
type TeamTabId = "身体" | "天理" | "郡山北部" | "郡山南部";

function TeamToolsCard() {
  const { user } = useAuth();
  const { isNight } = useTheme();
  const utils = trpc.useUtils();

  // ユーザーのチームに基づいてデフォルトタブを決定
  // 全チーム・事務員は「身体」をデフォルト
  const defaultTeam = ((): TeamTabId => {
    const t = user?.team;
    if (t === "身体" || t === "天理" || t === "郡山北部" || t === "郡山南部") return t;
    return "身体";
  })();

  const [activeTeam, setActiveTeam] = useState<TeamTabId>(defaultTeam);

  // ユーザーのチームが変わったときにデフォルトを反映
  useEffect(() => {
    const t = user?.team;
    if (t === "身体" || t === "天理" || t === "郡山北部" || t === "郡山南部") {
      setActiveTeam(t);
    }
  }, [user?.team]);

  const { data: tools = [], isLoading } = trpc.teamTools.list.useQuery(
    { team: activeTeam },
    { retry: false }
  );

  // 管理者用: ツール追加・編集・削除
  const isAdmin = user?.role === "admin";
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔗");
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
    createTool.mutate({ team: activeTeam, label: newLabel.trim(), href: newHref.trim(), emoji: newEmoji || "🔗" });
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
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          チームツール
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* チームタブバー */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
          {TEAM_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTeam(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[10px] font-bold transition-all",
                getTeamButtonClass(tab.id, activeTeam === tab.id)
              )}
              style={getTeamButtonStyle(tab.id, activeTeam === tab.id)}
            >
              <span className="text-base leading-none">{tab.label}</span>
              <span className="leading-none">{tab.title}</span>
            </button>
          ))}
        </div>

        {/* ツールリスト */}
        <div className="flex flex-col gap-1.5">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">読み込み中...</p>
          ) : tools.length === 0 && !showAddForm ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {activeTeam}チームのツールはまだありません
              {isAdmin && <span className="block mt-1 text-primary cursor-pointer" onClick={() => setShowAddForm(true)}>+ 追加する</span>}
            </p>
          ) : (
            tools.map((tool) => (
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
                    {/* チームに応じた文字色を自動適用（colorが未設定の場合はチームカラーを使用） */}
                    {(() => {
                      const teamTextColorMap: Record<TeamTabId, string> = {
                        "身体": "text-blue-600",
                        "天理": "text-emerald-600",
                        "郡山北部": "text-orange-600",
                        "郡山南部": "text-purple-600",
                      };
                      const autoColor = tool.color || teamTextColorMap[activeTeam];
                      return <LinkRow href={tool.href} label={tool.label} color={autoColor} emoji={tool.emoji ?? undefined} />;
                    })()}
                    {isAdmin && (
                      <>
                        <button onClick={() => startEdit(tool)} className="text-muted-foreground hover:text-primary p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="編集">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => deleteTool.mutate({ id: tool.id })} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="削除">
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

        {/* 管理者用追加ボタン */}
        {isAdmin && !showAddForm && tools.length > 0 && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => setShowAddForm(true)}>+ 追加</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function TasksCard() {
  const utils = trpc.useUtils();
  const { isNight } = useTheme();
  const [showForm, setShowForm] = useState(false);

  // DBから未完了タスクを取得
  const { data: tasks = [] } = trpc.tasks.getMine.useQuery();
  const incomplete = tasks
    .filter((t) => t.done === 0)
    .sort((a, b) => {
      // 期日なしは常に末尾、期日ありは昇順
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

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
    onSettled: () => utils.tasks.getMine.invalidate(),
  });

  return (
    <div className="fade-in-up stagger-3 space-y-2">
      <Card className="shadow-sm">
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
              <div key={task.id} className="flex items-start gap-2 group">
                <button
                  onClick={() => toggleTask.mutate({ id: task.id, done: task.done === 0 })}
                  className="flex-shrink-0 mt-0.5"
                >
                  {task.done ? (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={cn("text-sm block", task.done ? "line-through text-muted-foreground" : "text-foreground")}>
                    {task.text}
                  </span>
                  {(task as any).patientName && (
                    <span className="flex items-center gap-0.5 text-[11px] mt-0.5 text-violet-600 dark:text-violet-400 font-medium">
                      <UserRound className="w-3 h-3" />{(task as any).patientName}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className={cn(
                      "flex items-center gap-0.5 text-[11px] mt-0.5",
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
                      <Calendar className="w-3 h-3" />
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
            ))
          )}

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

          {/* 詳細フォーム */}
          {showForm && (
            <TaskCreateForm
              onClose={() => setShowForm(false)}
              onSuccess={() => utils.tasks.getMine.invalidate()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const REACTION_EMOJIS = ["❤️", "👍", "🙏", "✅", "👀"];

function MessageBoard({ title }: { title: string }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { isNight } = useTheme();
  const [, navigate] = useLocation();

  // DBからメッセージ取得
  const { data: messages = [], isLoading } = trpc.messages.getActive.useQuery(undefined, {
    refetchInterval: 30000, // 30秒ごとに自動更新
  });

  // 予約送信待ちメッセージ
  const { data: pendingMessages = [] } = trpc.messages.getPending.useQuery(undefined, {
    refetchInterval: 30000,
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

  const handlePost = () => {
    if (!newMsg.trim()) {
      toast.error("メッセージを入力してください");
      return;
    }
    createMsg.mutate({
      text: newMsg.trim(),
      displayFrom: buildDateTime(displayFrom, displayFromTime),
      displayUntil: buildDateTime(displayUntil, displayUntilTime),
      scheduledAt: buildDateTime(scheduledAt, scheduledAtTime),
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
    <Card className="fade-in-up stagger-4 shadow-sm flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            {title}
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
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
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
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">マイクをタップして話すと各項目に転記</p>
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
                    "relative inline-flex items-center justify-center flex-shrink-0 h-14 w-14 rounded-full",
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
                              if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
                            }
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-medium hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors cursor-pointer underline underline-offset-2"
                        >
                          {fieldName} →
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">項目をタップすると入力欄に移動します。マイクで話すか手動入力で補完できます</p>
                </div>
              )}

              {/* 誤変換報告ボタン（音声転記後・投稿前のみ表示） */}
              {msgVoiceTranscribed && !msgFeedbackSent && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowMsgFeedbackDialog(true)}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
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
                      <p className="text-[10px] text-green-700 dark:text-green-400 mt-0.5">いただいた情報はAIの音声認識精度の改善に活用します。引き続きご協力をお願いします。</p>
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
              const timeOptions = Array.from({ length: 24 * 6 }, (_, i) => {
                const h = Math.floor(i / 6);
                const m = (i % 6) * 10;
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
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayFrom(""); setDisplayFromTime(""); }}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="クリア">
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
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayFromTime(""); }}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="時刻クリア">
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
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayUntil(""); setDisplayUntilTime(""); }}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="クリア">
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
                        <button type="button" onClick={(e) => { e.preventDefault(); setDisplayUntilTime(""); }}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="時刻クリア">
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
                        <button type="button" onClick={(e) => { e.preventDefault(); setScheduledAt(""); setScheduledAtTime(""); }}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="クリア">
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
                        <button type="button" onClick={(e) => { e.preventDefault(); setScheduledAtTime(""); }}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="時刻クリア">
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
                        <span className="text-xs font-semibold text-foreground">
                          {(() => {
                            const parts = (msg.createdByName ?? "不明").trim().split(/\s+/);
                            return parts.length >= 2 ? `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}` : (msg.createdByName ?? "不明");
                          })()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {msg.displayUntil && (
                          <span className={cn("text-[10px] px-1 rounded", isNight ? "text-amber-400 bg-amber-900/40" : "text-amber-600 bg-amber-50")}>
                            → {new Date(msg.displayUntil).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}まで
                          </span>
                        )}
                        {msg.scheduledAt && new Date(msg.scheduledAt) > new Date() && (
                          <span className={cn("text-[10px] px-1 rounded", isNight ? "text-blue-400 bg-blue-900/40" : "text-blue-600 bg-blue-50")}>予約</span>
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
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>
                    {/* 編集・削除ボタン（作成者のみ） */}
                    {msg.createdBy === user?.id && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 transition-all">
                        <button
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditingText(msg.text);
                          }}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="修正"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMsg.mutate({ id: msg.id })}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                            : "bg-card border-border text-muted-foreground hover:border-primary/30"
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
                  "inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full",
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
                    "p-2.5 rounded-lg border",
                    isNight ? "border-blue-800/40 bg-blue-900/20" : "border-blue-100 bg-blue-50/30"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[9px] font-bold text-blue-600">
                        {(msg.createdByName ?? "不明")[0]}
                      </div>
                      <span className="text-[11px] font-semibold text-foreground">
                        {(() => {
                          const parts = (msg.createdByName ?? "不明").trim().split(/\s+/);
                          return parts.length >= 2 ? `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}` : (msg.createdByName ?? "不明");
                        })()}
                      </span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
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
                              "text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors",
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
                              "text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors",
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
                    <p className="text-xs text-foreground/80 leading-relaxed pl-6.5">{msg.text}</p>
                    {(msg.displayFrom || msg.displayUntil) && (
                      <div className="flex flex-wrap gap-1 mt-1 pl-6.5">
                        {msg.displayFrom && (
                          <span className="text-[10px] text-muted-foreground">
                            表示開始: {new Date(msg.displayFrom).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {msg.displayUntil && (
                          <span className="text-[10px] text-muted-foreground">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-background rounded-2xl shadow-xl border border-border p-5 space-y-4">
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
            // シマーエフェクトはカードが表示されてから少し遅れて発火
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
      {/* 光沢シマーオーバーレイ */}
      {shimmerActive && <div className="philosophy-shimmer" />}

      <div className="px-4 py-3 md:px-5 md:py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* 光陽バッジアイコン */}
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
            {/* ラベル */}
            <p
              className={cn(
                "text-[10px] font-semibold tracking-widest",
                isVisible ? "philosophy-text1-visible" : "philosophy-text1-hidden"
              )}
              style={{ color: "#c2410c" }}
            >
              HINATA'S WAY — 株式会社光陽 企業理念
            </p>
            {/* メインコピー */}
            <p
              className={cn(
                "text-sm font-bold leading-snug",
                isVisible ? "philosophy-text2-visible" : "philosophy-text2-hidden"
              )}
              style={{ color: "#7c2d12" }}
            >
              「存在で支え合う」
            </p>
            {/* 説明文 */}
            <p
              className={cn(
                "text-[11px] leading-relaxed mt-0.5",
                isVisible ? "philosophy-text3-visible" : "philosophy-text3-hidden"
              )}
              style={{ color: "#9a3412" }}
            >
              私たちは出会うすべての人々と、お互いの存在がこころの支えになる関係を築きます。
            </p>
            {/* リンク */}
            <p
              className={cn(
                "text-[11px] font-semibold mt-1.5 flex items-center gap-0.5",
                isVisible ? "philosophy-text4-visible" : "philosophy-text4-hidden"
              )}
              style={{ color: "#ea580c" }}
            >
              理念の全文を読む
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </p>
          </div>
        </div>

        {/* 右矢印（パルスアニメーション） */}
        <div className={cn("flex-shrink-0 text-orange-400", isVisible && "philosophy-chevron-pulse")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const greeting = getGreeting();
  const dailyWord = getDailyWord();
  const { user: dashboardUser } = useAuth();
  // ログインユーザーの名前（姓名の場合は名前部分のみ表示）
  const userName = dashboardUser?.name
    ? (dashboardUser.name.includes(' ') || dashboardUser.name.includes('　')
        ? dashboardUser.name.split(/[ 　]/)[1] || dashboardUser.name.split(/[ 　]/)[0]
        : dashboardUser.name)
    : "スタッフ";
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
          {/* 今日の一言（夜モード時は非表示） */}
          {!isNight && dailyWord && (
            <p className="text-xs md:text-sm text-white text-center md:text-left italic leading-snug tracking-wide font-medium" style={{textShadow: '0 1px 4px rgba(0,0,0,0.3)'}}>
              ✦ {dailyWord}
            </p>
          )}
          {/* ショートカットボタン（モバイル: 3列グリッド均等配置 / PC: 折り返し右寄せ） */}
          <div className="grid grid-cols-3 gap-1.5 md:flex md:flex-row md:flex-wrap md:justify-end md:gap-2">
            <a
              href="https://gemini.google.com/app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 transition-all text-white text-xs md:text-sm font-semibold px-2 py-2.5 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap" style={{backgroundColor: '#9b7fd4'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#8a6ec3')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#9b7fd4')}
            >
              <span className="text-sm leading-none">✨</span>
              Gemini
            </a>
            <a
              href="https://homecare.zest.jp/login"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 transition-all text-white text-xs md:text-sm font-semibold px-2 py-2.5 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap" style={{backgroundColor: '#00b5a3'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#009e8e')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#00b5a3')}
            >
              <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
              ZEST
            </a>
            <a
              href="https://login.ibowservice.jp/?action=logout"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 transition-all text-white text-xs md:text-sm font-semibold px-2 py-2.5 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap" style={{backgroundColor: '#4a90d9'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#3a7fc8')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#4a90d9')}
            >
              <ClipboardList className="w-3.5 h-3.5 md:w-4 md:h-4" />
              iBow
            </a>
            <Link
              href="/new-contract"
              className="flex items-center justify-center gap-1 transition-all text-white text-xs md:text-sm font-semibold px-2 py-2.5 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap" style={{backgroundColor: '#e05a2b'}} onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#c94d22')} onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#e05a2b')}
            >
              <FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />
              新規契約
            </Link>
            <Link
              href="/schedule-management"
              className="flex items-center justify-center gap-1 transition-all text-white text-xs md:text-sm font-semibold px-2 py-2.5 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap" style={{backgroundColor: '#7c5cbf'}} onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#6b4dab')} onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#7c5cbf')}
            >
              <CalendarDays className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="leading-tight">スケジュール<br className="md:hidden" />管理</span>
            </Link>
            <Link
              href="/tasks"
              className="flex items-center justify-center gap-1 transition-all text-white text-xs md:text-sm font-semibold px-2 py-2.5 md:px-4 md:py-2 rounded-full shadow-sm whitespace-nowrap" style={{backgroundColor: '#2a9d5c'}} onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#228a4f')} onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.backgroundColor='#2a9d5c')}
            >
              <ListTodo className="w-3.5 h-3.5 md:w-4 md:h-4" />
              タスク
            </Link>
          </div>
        </div>
      </div>

      {/* 経営理念カード（夜モード・昼モード両方表示・フェードインアニメーション付き） */}
      <PhilosophyCard />

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 items-start">
        {/* 左カラム: スケジュールスクリーンショット */}
        <div className="lg:col-span-2 space-y-3 md:space-y-4">
          <ScheduleScreenshotCard />
        </div>

        {/* 右カラム: ツール・タスク */}
        <div className="space-y-3 md:space-y-4">
          <TeamToolsCard />
          <ToolsCard />
          <TasksCard />
        </div>
      </div>

      {/* 下段: メッセージ・訪問件数を横並び（PC版） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 items-start">
        <MessageBoard title="メッセージ" />
        <VisitCountCard />
      </div>
    </div>
  );
}
