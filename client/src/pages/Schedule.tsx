/**
 * Schedule - 訪問スケジュール専用ページ
 * スクショアップロード・スケジュール確認（チーム別・日付別スワイプ）
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Calendar, Upload, RefreshCw, ChevronLeft, ChevronRight,
  ImageIcon, X, ZoomIn,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  getTeamButtonClass, getAllTeamButtonStyle, getTeamButtonStyle,
  TEAM_COLOR_VALUES, ALL_TEAM_COLOR,
} from "@shared/teamColors";
import type { TeamName } from "@shared/teamColors";
import { createPortal } from "react-dom";

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
const DAYS = ["今日", "明日", "2日後", "3日後", "4日後"] as const;
type TeamType = typeof TEAMS[number];
type DayType = typeof DAYS[number];

/** 日付ラベル（M/D(曜)形式） */
function getDayLabel(offset: number): string {
  const WDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getMonth() + 1}/${d.getDate()}(${WDAYS[d.getDay()]})`;
}


/** チーム・日付ごとのスケジュールカード */
function TeamDayScheduleCard({
  team,
  day,
  dayLabel,
  screenshots,
}: {
  team: TeamType;
  day: DayType;
  dayLabel: string;
  screenshots: Array<{
    id: number;
    team: string;
    day: string;
    imageUrl: string | null;
    uploadedByName: string | null;
    updatedAt: Date;
  }>;
}) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const screenshot = screenshots.find(s => s.team === team && s.day === day);
  const teamColor = TEAM_COLOR_VALUES[team as TeamName];
  const accentColor = teamColor?.active ?? ALL_TEAM_COLOR.active;


  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("ファイルサイズは10MB以下にしてください");
      return;
    }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await utils.client.schedule.upload.mutate({
        team,
        day,
        imageDataUrl: dataUrl,
        mimeType: file.type || "image/png",
      });
      await utils.schedule.getAll.invalidate();
      toast.success(`${team}チーム（${day}）のスクショをアップロードしました`);
    } catch (err) {
      toast.error("アップロードに失敗しました");
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [team, day, utils]);


  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* カードヘッダー */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ backgroundColor: `${accentColor}18`, borderBottom: `1px solid ${accentColor}30` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-sm font-bold text-foreground">{team}</span>
          <span className="text-xs text-muted-foreground">{dayLabel}</span>

        </div>
        {screenshot?.uploadedByName && (
          <span className="text-[10px] text-muted-foreground">
            {screenshot.uploadedByName}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* スクショ表示 */}
        {screenshot?.imageUrl ? (
          <div className="relative group">
            <img
              src={screenshot.imageUrl}
              alt={`${team}チーム ${day}のスケジュール`}
              className="w-full rounded-lg border object-cover max-h-48 cursor-zoom-in"
              onClick={() => setLightboxSrc(screenshot.imageUrl!)}
            />
            <button
              className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setLightboxSrc(screenshot.imageUrl!)}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-6 cursor-pointer hover:bg-muted/30 transition-colors"
            style={{ borderColor: `${accentColor}40` }}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="w-8 h-8 text-muted-foreground/40 mb-1" />
            <p className="text-xs text-muted-foreground">スクショをアップロード</p>
          </div>
        )}

        {/* ボタン群 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-background hover:bg-muted/50 transition-all active:scale-95 disabled:opacity-50"
          >
            {isUploading ? (
              <><RefreshCw className="w-3 h-3 animate-spin" />アップロード中</>
            ) : (
              <><Upload className="w-3 h-3" />{screenshot ? "更新" : "アップロード"}</>
            )}
          </button>


        </div>


      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ライトボックス */}
      {lightboxSrc && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute top-4 right-4 text-white bg-white/20 rounded-full p-2"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxSrc}
            alt="スケジュール拡大"
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

/** メインページ */
export default function Schedule() {
  const { user } = useAuth();
  const [selectedTeam, setSelectedTeam] = useState<TeamType | "全チーム">("全チーム");
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [dayLabels, setDayLabels] = useState<string[]>(() =>
    [0, 1, 2, 3, 4].map(getDayLabel)
  );

  // 日付ラベルを毎日0時に更新
  useEffect(() => {
    const updateLabels = () => setDayLabels([0, 1, 2, 3, 4].map(getDayLabel));
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(updateLabels, tomorrow.getTime() - now.getTime());
    return () => clearTimeout(timer);
  }, []);

  // ユーザーのチームをデフォルト選択
  useEffect(() => {
    if (user?.team && TEAMS.includes(user.team as TeamType)) {
      setSelectedTeam(user.team as TeamType);
    }
  }, [user?.team]);

  const { data: screenshots = [], isLoading } = trpc.schedule.getAll.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // スワイプ操作（日付切り替え）
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) {
        setSelectedDayIdx(prev => Math.min(prev + 1, DAYS.length - 1));
      } else {
        setSelectedDayIdx(prev => Math.max(prev - 1, 0));
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const currentDay = DAYS[selectedDayIdx];
  const currentDayLabel = dayLabels[selectedDayIdx] ?? currentDay;

  // 表示するチームリスト
  const displayTeams: TeamType[] = selectedTeam === "全チーム" ? [...TEAMS] : [selectedTeam];


  return (
    <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">
      {/* ページタイトル */}
      <div className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">訪問スケジュール</h1>
      </div>

      {/* チーム選択 */}
      <div className="grid grid-cols-5 gap-1.5">
        <button
          onClick={() => setSelectedTeam("全チーム")}
          className={cn(
            "text-xs px-1 py-2 rounded-lg border transition-all font-bold text-center",
            getTeamButtonClass("全チーム", selectedTeam === "全チーム")
          )}
          style={getAllTeamButtonStyle(selectedTeam === "全チーム")}
        >
          全チーム
        </button>
        {TEAMS.map(t => (
          <button
            key={t}
            onClick={() => setSelectedTeam(t)}
            className={cn(
              "text-xs px-1 py-2 rounded-lg transition-all font-bold text-center",
              getTeamButtonClass(t, selectedTeam === t)
            )}
            style={getTeamButtonStyle(t, selectedTeam === t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 日付タブ */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {DAYS.map((d, idx) => (
          <button
            key={d}
            onClick={() => setSelectedDayIdx(idx)}
            className={cn(
              "flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium whitespace-nowrap",
              selectedDayIdx === idx
                ? "bg-primary text-white border-primary"
                : idx === 0
                  ? "border-primary/60 text-primary font-bold hover:bg-primary/10"
                  : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {idx === 0 ? <span className="font-bold">{dayLabels[idx]}</span> : dayLabels[idx]}
          </button>
        ))}
      </div>

      {/* 日付ナビゲーション */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSelectedDayIdx(prev => Math.max(prev - 1, 0))}
          disabled={selectedDayIdx === 0}
          className="p-1.5 rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-foreground">{currentDayLabel}</p>
          <p className="text-xs text-muted-foreground">{currentDay}</p>
        </div>
        <button
          onClick={() => setSelectedDayIdx(prev => Math.min(prev + 1, DAYS.length - 1))}
          disabled={selectedDayIdx === DAYS.length - 1}
          className="p-1.5 rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* スワイプ可能なコンテンツエリア */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="space-y-3"
      >
        {isLoading ? (
          <div className="rounded-xl border p-8 flex items-center justify-center bg-muted/20 animate-pulse">
            <p className="text-xs text-muted-foreground">読み込み中...</p>
          </div>
        ) : (
          displayTeams.map(team => (
            <TeamDayScheduleCard
              key={`${team}-${currentDay}`}
              team={team}
              day={currentDay}
              dayLabel={currentDayLabel}
              screenshots={screenshots.map(s => ({
                id: s.id,
                team: s.team,
                day: s.day,
                imageUrl: s.imageUrl ?? null,
                uploadedByName: s.uploadedByName ?? null,
                updatedAt: s.updatedAt,
              }))}
            />
          ))
        )}
      </div>

      {/* スワイプヒント */}
      <p className="text-center text-[10px] text-muted-foreground/60">
        ← スワイプで日付を切り替え →
      </p>
    </div>
  );
}
