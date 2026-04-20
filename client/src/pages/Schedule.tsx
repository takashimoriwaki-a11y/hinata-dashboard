/**
 * Schedule - 訪問スケジュール専用ページ
 * スクショアップロード・AI解析・タイムライン表示（チーム別・日付別スワイプ）
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Calendar, Upload, RefreshCw, ChevronLeft, ChevronRight,
  Clock, User, Sparkles, ImageIcon, X, ZoomIn,
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

/** AI解析結果の型 */
interface ScheduleEntry {
  time: string | null;
  endTime: string | null;
  patientName: string;
  staffName: string | null;
  notes: string | null;
}
interface AnalyzedSchedule {
  entries: ScheduleEntry[];
  summary: string;
}

/** タイムライン表示コンポーネント（8:30〜19:00） */
function ScheduleTimeline({
  entries,
  summary,
  teamName,
  dayLabel,
}: {
  entries: ScheduleEntry[];
  summary: string;
  teamName: string;
  dayLabel: string;
}) {
  const teamColor = TEAM_COLOR_VALUES[teamName as TeamName];
  const accentColor = teamColor?.active ?? ALL_TEAM_COLOR.active;

  // 時刻を分に変換
  const toMinutes = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  const START_MIN = 8 * 60 + 30;  // 8:30
  const END_MIN = 19 * 60;         // 19:00
  const TOTAL_MIN = END_MIN - START_MIN;

  // 時刻ラベル（1時間ごと）
  const hourLabels: { label: string; pct: number }[] = [];
  for (let h = 9; h <= 19; h++) {
    const min = h * 60;
    if (min >= START_MIN && min <= END_MIN) {
      hourLabels.push({ label: `${h}:00`, pct: ((min - START_MIN) / TOTAL_MIN) * 100 });
    }
  }

  // 時刻のある訪問エントリーと時刻のないエントリーを分離
  const timedEntries = entries.filter(e => toMinutes(e.time) !== null);
  const untimedEntries = entries.filter(e => toMinutes(e.time) === null);

  return (
    <div className="space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold"
          style={{ backgroundColor: accentColor }}
        >
          {teamName}
        </div>
        <span className="text-sm font-semibold text-foreground">{dayLabel}</span>
        {summary && (
          <span className="text-xs text-muted-foreground ml-auto max-w-[200px] truncate">{summary}</span>
        )}
      </div>

      {/* ガントチャート風タイムライン */}
      {timedEntries.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* 時刻ラベル行 */}
          <div className="relative h-6 border-b bg-muted/30 overflow-hidden">
            {hourLabels.map(({ label, pct }) => (
              <div
                key={label}
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: `${pct}%` }}
              >
                <div className="absolute top-0 bottom-0 w-px bg-border/60" />
                <span className="text-[9px] text-muted-foreground pl-0.5 select-none whitespace-nowrap">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* 訪問バー */}
          <div className="relative py-2 space-y-1.5 px-2">
            {timedEntries.map((entry, i) => {
              const startMin = toMinutes(entry.time)!;
              const endMin = entry.endTime ? (toMinutes(entry.endTime) ?? startMin + 60) : startMin + 60;
              const clampedStart = Math.max(startMin, START_MIN);
              const clampedEnd = Math.min(endMin, END_MIN);
              const leftPct = ((clampedStart - START_MIN) / TOTAL_MIN) * 100;
              const widthPct = Math.max(((clampedEnd - clampedStart) / TOTAL_MIN) * 100, 5);

              return (
                <div key={i} className="relative h-10">
                  {/* 時刻ラベル（左端固定） */}
                  <div className="absolute left-0 top-0 bottom-0 flex items-center w-11 flex-shrink-0 z-10">
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: accentColor }}>
                      {entry.time}
                    </span>
                  </div>
                  {/* バー（左端12px分を除いたエリア） */}
                  <div className="absolute top-0 bottom-0 left-11 right-0">
                    <div
                      className="absolute top-1 bottom-1 rounded-md flex items-center px-2 overflow-hidden"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: `${accentColor}22`,
                        borderLeft: `3px solid ${accentColor}`,
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate text-foreground leading-tight">
                          {entry.patientName}
                        </p>
                        {entry.staffName && (
                          <p className="text-[10px] text-muted-foreground truncate leading-tight">
                            {entry.staffName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* リスト形式（時刻ありエントリー） */}
      <div className="space-y-1.5">
        {timedEntries.map((entry, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 border bg-card"
            style={{ borderLeftWidth: "3px", borderLeftColor: accentColor }}
          >
            {/* 時刻 */}
            <div className="flex-shrink-0 min-w-[52px]">
              <span className="text-sm font-bold tabular-nums" style={{ color: accentColor }}>
                {entry.time ?? "--:--"}
              </span>
              {entry.endTime && (
                <div className="text-[10px] text-muted-foreground tabular-nums">〜{entry.endTime}</div>
              )}
            </div>
            <div className="flex-shrink-0 w-px self-stretch bg-border my-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{entry.patientName}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                {entry.staffName && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {entry.staffName}
                  </span>
                )}
                {entry.notes && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">{entry.notes}</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* 時刻なしエントリー（その他の予定） */}
        {untimedEntries.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              その他の予定
            </p>
            {untimedEntries.map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2 border bg-muted/30 mb-1.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{entry.patientName}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    {entry.staffName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {entry.staffName}
                      </span>
                    )}
                    {entry.notes && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">{entry.notes}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
    analyzedData?: string | null;
  }>;
}) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedResult, setAnalyzedResult] = useState<AnalyzedSchedule | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const screenshot = screenshots.find(s => s.team === team && s.day === day);
  const teamColor = TEAM_COLOR_VALUES[team as TeamName];
  const accentColor = teamColor?.active ?? ALL_TEAM_COLOR.active;

  // 既存の解析データを読み込む
  useEffect(() => {
    if (screenshot?.analyzedData) {
      try {
        const parsed = JSON.parse(screenshot.analyzedData) as AnalyzedSchedule;
        if (parsed.entries) {
          setAnalyzedResult(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, [screenshot?.analyzedData]);

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

  const handleAnalyze = useCallback(async () => {
    if (!screenshot?.imageUrl) {
      toast.error("先にスクショをアップロードしてください");
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await utils.client.schedule.analyzeImage.mutate({
        team,
        day,
        imageUrl: screenshot.imageUrl,
      });
      const parsed = JSON.parse(result.analyzedData) as AnalyzedSchedule;
      setAnalyzedResult(parsed);
      setShowTimeline(true);
      await utils.schedule.getAll.invalidate();
      toast.success("AI解析が完了しました");
    } catch (err) {
      toast.error("AI解析に失敗しました。もう一度お試しください");
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [team, day, screenshot, utils]);

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
          {analyzedResult && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: accentColor }}
            >
              AI解析済み
            </span>
          )}
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

          {screenshot?.imageUrl && (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: `${accentColor}18`,
                color: accentColor,
                border: `1px solid ${accentColor}40`,
              }}
            >
              {isAnalyzing ? (
                <><RefreshCw className="w-3 h-3 animate-spin" />AI解析中...</>
              ) : (
                <><Sparkles className="w-3 h-3" />AIでスケジュール解析</>
              )}
            </button>
          )}

          {analyzedResult && (
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-all active:scale-95 ml-auto"
            >
              {showTimeline ? "閉じる" : "タイムライン表示"}
            </button>
          )}
        </div>

        {/* タイムライン表示 */}
        {showTimeline && analyzedResult && (
          <div className="mt-1 pt-2 border-t border-border/50">
            <ScheduleTimeline
              entries={analyzedResult.entries}
              summary={analyzedResult.summary}
              teamName={team}
              dayLabel={dayLabel}
            />
          </div>
        )}
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

  // getAll の結果に analyzedData を含める（型拡張）
  type ScreenshotWithAnalysis = typeof screenshots[number] & { analyzedData?: string | null };
  const screenshotsWithAnalysis = screenshots as ScreenshotWithAnalysis[];

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
              screenshots={screenshotsWithAnalysis.map(s => ({
                id: s.id,
                team: s.team,
                day: s.day,
                imageUrl: s.imageUrl ?? null,
                uploadedByName: s.uploadedByName ?? null,
                updatedAt: s.updatedAt,
                analyzedData: s.analyzedData ?? null,
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
