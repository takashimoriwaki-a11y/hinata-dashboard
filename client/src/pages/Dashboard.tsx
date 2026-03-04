/**
 * Dashboard - メインダッシュボードページ
 * Design: 温かみのある和モダン・ケアUI
 * 機能: 訪問件数表示、ZESTスクリーンショット、業務ツールクイックアクセス、タスク、申し送り、訪問推移グラフ
 */

import { useState, useRef, useCallback } from "react";
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
  { label: "利用者料金一覧（精神郡山）", href: "#", color: "text-emerald-600" },
  { label: "利用者料金一覧（身体）", href: "#", color: "text-blue-600" },
  { label: "利用者料金一覧（天理）", href: "#", color: "text-purple-600" },
  { label: "業務日報", href: "#", color: "text-orange-600" },
  { label: "ひなた勤怠", href: "#", color: "text-rose-600" },
  { label: "退勤時チェックリスト", href: "#", color: "text-amber-600" },
];

const externalLinks = [
  {
    label: "ZEST — 訪問スケジュール管理",
    desc: "スケジュールの確認・変更はZESTで行います",
    href: "https://zest.jp/",
    emoji: "📅",
  },
  {
    label: "NotebookLM — 就業規則・社内マニュアル",
    desc: "AIに質問して就業規則や社内ルールをすぐに確認できます",
    href: "https://notebooklm.google.com/",
    emoji: "📓",
  },
  {
    label: "Gemini — Google AIチャット",
    desc: "GoogleのAIアシスタントで業務相談・文章作成に",
    href: "https://gemini.google.com/",
    emoji: "✨",
  },
  {
    label: "Gemini Gems — MSE看護記録作成サポーター",
    desc: "MSE形式の看護記録作成をAIがサポートします",
    href: "https://gemini.google.com/gems",
    emoji: "💎",
  },
  {
    label: "こころの訪問看護ステーションひなた 公式 Instagram",
    desc: "@kokoronohinata — 日々の活動やお知らせを発信中",
    href: "https://www.instagram.com/kokoronohinata/",
    emoji: "📷",
  },
];

// 初期タスク
const initialTasks = [
  { id: 1, text: "月次報告書の作成", done: false, priority: "high" as const },
  { id: 2, text: "スタッフ面談（山田）", done: false, priority: "medium" as const },
  { id: 3, text: "利用者ケアプラン更新（3名）", done: true, priority: "high" as const },
];

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

// ========== スケジュールスクリーンショット型 ==========
type ScheduleImage = {
  id: number;
  team: string;
  day: string;
  dataUrl: string;
  uploadedAt: string;
};

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
const DAYS = ["今日", "明日"] as const;

// ========== サブコンポーネント ==========

function VisitCountCard() {
  const main = (currentMonthData.mainActual / currentMonthData.mainTarget) * 100;
  const total = (currentMonthData.totalActual / currentMonthData.totalTarget) * 100;

  return (
    <Card className="fade-in-up stagger-1 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            訪問件数
          </CardTitle>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {currentMonthData.month}（3/3時点の累計）
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {/* メイン */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">メイン</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {currentMonthData.mainActual}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / {currentMonthData.mainTarget}
              </span>
            </p>
            <Progress value={main} className="h-2" />
            <p className="text-xs font-semibold text-primary">{Math.round(main)}%</p>
          </div>
          {/* サブ */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">サブ</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {currentMonthData.subActual}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / {currentMonthData.subTarget || "—"}
              </span>
            </p>
            <Progress value={0} className="h-2" />
            <p className="text-xs font-semibold text-muted-foreground">—</p>
          </div>
          {/* 合計 */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">合計</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {currentMonthData.totalActual}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / {currentMonthData.totalTarget}
              </span>
            </p>
            <Progress value={total} className="h-2" />
            <p className="text-xs font-semibold text-primary">{Math.round(total)}%</p>
          </div>
        </div>

        <Separator />

        {/* 先月実績 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">2月実績</p>
            <p className="text-lg font-bold tabular-nums">
              {currentMonthData.lastMonthActual.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / {currentMonthData.lastMonthTarget.toLocaleString()} 件
              </span>
            </p>
          </div>
          <div className="text-right">
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
              達成率 {currentMonthData.lastMonthAchievement}%
            </Badge>
            <p className="text-xs text-emerald-600 font-semibold mt-1">🎉 達成！すばらしい！</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ========== ZESTスクリーンショットカード ==========

function ScheduleScreenshotCard() {
  const [images, setImages] = useState<ScheduleImage[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("身体");
  const [selectedDay, setSelectedDay] = useState<string>("今日");
  const [isDragging, setIsDragging] = useState(false);
  const [viewImage, setViewImage] = useState<ScheduleImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentImage = images.find(
    (img) => img.team === selectedTeam && img.day === selectedDay
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
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const now = new Date();
        const timeStr = now.toLocaleString("ja-JP", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        setImages((prev) => {
          const filtered = prev.filter(
            (img) => !(img.team === selectedTeam && img.day === selectedDay)
          );
          return [
            ...filtered,
            {
              id: Date.now(),
              team: selectedTeam,
              day: selectedDay,
              dataUrl,
              uploadedAt: timeStr,
            },
          ];
        });
        toast.success(`${selectedTeam} / ${selectedDay} のスクリーンショットを登録しました`);
      };
      reader.readAsDataURL(file);
    },
    [selectedTeam, selectedDay]
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

  const deleteImage = () => {
    setImages((prev) =>
      prev.filter(
        (img) => !(img.team === selectedTeam && img.day === selectedDay)
      )
    );
    toast.success("削除しました");
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
              href="https://zest.jp/"
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
                  onClick={() => setSelectedTeam(t)}
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
          {currentImage ? (
            /* 登録済み画像表示 */
            <div className="space-y-2">
              <div className="relative group rounded-lg overflow-hidden border border-border">
                <img
                  src={currentImage.dataUrl}
                  alt={`${selectedTeam}チーム ${selectedDay}のスケジュール`}
                  className="w-full object-contain max-h-72 cursor-pointer"
                  onClick={() => setViewImage(currentImage)}
                />
                {/* ホバーオーバーレイ */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => setViewImage(currentImage)}
                    className="bg-white/90 text-foreground text-xs px-3 py-1.5 rounded-full font-medium shadow"
                  >
                    拡大表示
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  {selectedTeam}チーム / {selectedDay} · {currentImage.uploadedAt} 登録
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-primary hover:underline"
                  >
                    更新
                  </button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button
                    onClick={deleteImage}
                    className="text-xs text-destructive hover:underline"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ドロップゾーン */
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
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
                    {isDragging ? "ここにドロップ" : "クリックまたはドラッグ＆ドロップ"}
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
          {images.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">登録済みスクリーンショット</p>
              <div className="flex flex-wrap gap-1.5">
                {images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => {
                      setSelectedTeam(img.team);
                      setSelectedDay(img.day);
                    }}
                    className={cn(
                      "relative w-16 h-11 rounded overflow-hidden border-2 transition-all",
                      img.team === selectedTeam && img.day === selectedDay
                        ? "border-primary shadow-sm"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <img src={img.dataUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 leading-tight">
                      {img.team}/{img.day}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 拡大モーダル */}
      {viewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewImage(null)}
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
                  {viewImage.team}チーム / {viewImage.day}
                </span>
                <span className="text-xs text-muted-foreground">· {viewImage.uploadedAt} 登録</span>
              </div>
              <button
                onClick={() => setViewImage(null)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 画像 */}
            <div className="overflow-auto max-h-[75vh] bg-muted/20">
              <img
                src={viewImage.dataUrl}
                alt={`${viewImage.team}チーム ${viewImage.day}のスケジュール`}
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
                      const found = images.find(
                        (img) => img.team === t && img.day === viewImage.day
                      );
                      if (found) setViewImage(found);
                      else toast.info(`${t}チームの${viewImage.day}のスクリーンショットは未登録です`);
                    }}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded border transition-colors",
                      viewImage.team === t
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
                      const found = images.find(
                        (img) => img.team === viewImage.team && img.day === d
                      );
                      if (found) setViewImage(found);
                      else toast.info(`${viewImage.team}チームの${d}のスクリーンショットは未登録です`);
                    }}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded border transition-colors",
                      viewImage.day === d
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
  const [myLinks, setMyLinks] = useState<{ id: number; label: string; href: string }[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("");

  const addLink = () => {
    if (!newLabel.trim() || !newHref.trim()) {
      toast.error("ラベルとURLを入力してください");
      return;
    }
    setMyLinks((prev) => [
      ...prev,
      { id: Date.now(), label: newLabel, href: newHref },
    ]);
    setNewLabel("");
    setNewHref("");
    setShowAddForm(false);
    toast.success("リンクを追加しました");
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
          <div className="grid grid-cols-2 gap-1.5">
            {spreadsheetLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => { e.preventDefault(); toast.info("スプレッドシートのリンクを設定してください"); }}
                className={cn(
                  "flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-md",
                  "bg-muted/50 hover:bg-muted transition-colors",
                  link.color
                )}
              >
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{link.label}</span>
              </a>
            ))}
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
              <input
                type="text"
                placeholder="ラベル名"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-white"
              />
              <input
                type="url"
                placeholder="https://..."
                value={newHref}
                onChange={(e) => setNewHref(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-white"
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={addLink}>追加</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAddForm(false)}>キャンセル</Button>
              </div>
            </div>
          )}
          {myLinks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              「追加」ボタンからリンクを登録できます
            </p>
          ) : (
            <div className="space-y-1">
              {myLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-1.5">
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-md bg-muted/50 hover:bg-muted text-primary transition-colors truncate"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </a>
                  <button
                    onClick={() => setMyLinks((prev) => prev.filter((l) => l.id !== link.id))}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* 外部リンク */}
        <div className="space-y-1.5">
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
        </div>
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

function MessageBoard({ title, type }: { title: string; type: "notice" | "message" }) {
  const [messages, setMessages] = useState<MessageItem[]>(
    type === "notice" ? initialMessages : []
  );
  const [newMsg, setNewMsg] = useState("");

  const postMessage = () => {
    if (!newMsg.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        author: "森脇崇",
        time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        text: newMsg,
        type,
      },
    ]);
    setNewMsg("");
    toast.success("投稿しました");
  };

  return (
    <Card className="fade-in-up stagger-4 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            {title}はまだありません
          </p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-2 p-2 bg-muted/30 rounded-lg">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                  {msg.author[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-semibold text-foreground">{msg.author}</span>
                    <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Textarea
            placeholder="投稿する..."
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            className="text-xs min-h-[60px] resize-none"
          />
          <Button size="sm" className="h-auto px-2 self-end" onClick={postMessage}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
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

  return (
    <div className="p-3 md:p-4 space-y-3 md:space-y-4 max-w-screen-xl mx-auto">
      {/* ウェルカムバナー */}
      <div className="relative rounded-2xl overflow-hidden shadow-md fade-in-up" style={{background: "linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)"}}>
        {/* 背景装飾 */}
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: "radial-gradient(circle at 80% 20%, white 0%, transparent 60%)"}} />
        <div className="relative p-4">
          {/* 挨拶メッセージ */}
          <div className="mb-3">
            <p className="text-base font-semibold text-white/90 leading-tight mb-0.5">{greeting}</p>
            <p className="text-3xl font-extrabold text-white leading-tight tracking-wide drop-shadow-sm">{userName}さん</p>
          </div>
          {/* 下段：ショートカットボタン */}
          <div className="flex flex-wrap gap-2">
            <a
              href="https://zest.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-all text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm" style={{backgroundColor: '#00b5a3'}} onMouseEnter={e => (e.currentTarget.style.backgroundColor='#009e8e')} onMouseLeave={e => (e.currentTarget.style.backgroundColor='#00b5a3')}
            >
              <Calendar className="w-3.5 h-3.5" />
              ZEST
            </a>
            <a
              href="https://gemini.google.com/"
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

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        {/* 左カラム */}
        <div className="lg:col-span-2 space-y-3 md:space-y-4">
          <VisitCountCard />
          <ScheduleScreenshotCard />
        </div>

        {/* 右カラム */}
        <div className="space-y-3 md:space-y-4">
          <ToolsCard />
          <TasksCard />
          <MessageBoard title="申し送り" type="notice" />
          <MessageBoard title="メッセージ" type="message" />
        </div>
      </div>
    </div>
  );
}
