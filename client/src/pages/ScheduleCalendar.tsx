import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Pencil,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { toast } from "sonner";

const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";

const CHANGE_TYPE_KEYS = [
  "visit_change",
  "visit_cancel",
  "visit_add",
  "meeting_add",
  "meeting_change",
  "schedule_visit",
  "schedule_short_stay",
  "schedule_special_instruction",
  "schedule_hospitalization",
  "schedule_discharge",
  "schedule_new_contract",
  "schedule_visit_doctor",
  "schedule_other",
] as const;

type ChangeType = (typeof CHANGE_TYPE_KEYS)[number];

const CHANGE_TYPE_LABELS: Record<ChangeType, { label: string; icon: string; color: string; chip: string }> = {
  visit_change: { label: "訪問日時変更", icon: "🔄", color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700", chip: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200" },
  visit_cancel: { label: "訪問キャンセル", icon: "❌", color: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700", chip: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200" },
  visit_add: { label: "訪問追加", icon: "➕", color: "bg-green-100 text-green-900 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700", chip: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200" },
  meeting_add: { label: "会議追加", icon: "📅", color: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700", chip: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200" },
  meeting_change: { label: "会議変更", icon: "📝", color: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700", chip: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200" },
  schedule_visit: { label: "受診", icon: "🏥", color: "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700", chip: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200" },
  schedule_short_stay: { label: "ショートステイ", icon: "🏨", color: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-700", chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200" },
  schedule_special_instruction: { label: "特別指示書", icon: "📋", color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" },
  schedule_hospitalization: { label: "入院", icon: "🏥", color: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700", chip: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200" },
  schedule_discharge: { label: "退院", icon: "🏠", color: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
  schedule_new_contract: { label: "新規契約・面談", icon: "🤝", color: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700", chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200" },
  schedule_visit_doctor: { label: "訪問診療同席", icon: "👨‍⚕️", color: "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-700", chip: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200" },
  schedule_other: { label: "その他のスケジュール", icon: "📝", color: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-700", chip: "bg-slate-100 text-slate-800 dark:bg-slate-900/50 dark:text-slate-200" },
};

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"] as const;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const MAX_CHIPS_PER_DAY = 2;
const MAX_CHIPS_PER_DAY_WEEK = 6;

type TeamFilter = (typeof TEAMS)[number] | "all";
type ChangeTypeFilter = ChangeType | "all";
type ViewMode = "month" | "week";

type CalendarItem = {
  id: number;
  changeType: string;
  team: string | null;
  patientName: string | null;
  meetingName: string | null;
  scheduleFacility: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  scheduleTargetName: string | null;
  fromDatetime: string | null;
  toDatetime: string | null;
  staffBefore: string | null;
  staffAfter: string | null;
  meetingStaff: string | null;
  scheduleStaff: string | null;
  reason: string | null;
  createdByName: string;
  createdAt: Date | string;
  calendarDate: string;
  calendarEndDate?: string;
  displayDateTime: string;
};

function isMultiDayItem(item: CalendarItem): boolean {
  return !!item.calendarEndDate && item.calendarEndDate > item.calendarDate;
}

/** 帯の見た目（開始／途中／終了／週またぎ再開） */
function getRangeBarMeta(item: CalendarItem, dateKey: string, weekday: number) {
  const start = item.calendarDate;
  const end = item.calendarEndDate && item.calendarEndDate >= start
    ? item.calendarEndDate
    : start;
  const isStart = dateKey === start;
  const isEnd = dateKey === end;
  const isWeekStart = weekday === 0;
  const showLabel = isStart || (isWeekStart && dateKey > start && dateKey <= end);
  return {
    showLabel,
    roundLeft: isStart || isWeekStart,
    roundRight: isEnd || weekday === 6,
  };
}

function getJstYearMonth(d = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getJstTodayKey(d = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${y}年${m}月`;
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 指定日を含む週の日曜（YYYY-MM-DD） */
function getSundayOfWeek(dateKey: string): string {
  const d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return formatDateKey(d);
}

function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const d = parseDateKey(weekStart);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return formatDateKey(d);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateKey(d);
}

function buildWeekCells(weekStart: string): Array<{ dateKey: string; day: number; month: number }> {
  return Array.from({ length: 7 }, (_, i) => {
    const dateKey = addDaysToDateKey(weekStart, i);
    const d = parseDateKey(dateKey);
    return {
      dateKey,
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
    };
  });
}

function formatWeekLabel(weekStart: string): string {
  const end = addDaysToDateKey(weekStart, 6);
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (sy === ey) {
    return `${sy}年 ${sm}/${sd}〜${em}/${ed}`;
  }
  return `${sy}/${sm}/${sd}〜${ey}/${em}/${ed}`;
}

function buildMonthCells(yearMonth: string): Array<{ dateKey: string | null; day: number | null }> {
  const [y, m] = yearMonth.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: Array<{ dateKey: string | null; day: number | null }> = [];

  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ dateKey: null, day: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${yearMonth}-${String(day).padStart(2, "0")}`;
    cells.push({ dateKey, day });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ dateKey: null, day: null });
  }
  return cells;
}

/** 開始日〜終了日の各日（YYYY-MM-DD）を返す。異常に長い期間は打ち切る */
function eachDateKeyInRange(start: string, end: string, maxDays = 92): string[] {
  const startMatch = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const endMatch = end.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!startMatch) return [];
  if (!endMatch || end < start) return [start];

  const keys: string[] = [];
  const cur = new Date(Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3])));
  const last = new Date(Date.UTC(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3])));
  let count = 0;
  while (cur <= last && count < maxDays) {
    keys.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
    count += 1;
  }
  return keys;
}

function getTypeInfo(changeType: string) {
  return CHANGE_TYPE_LABELS[changeType as ChangeType];
}

function shortName(item: CalendarItem): string {
  const raw =
    item.patientName ||
    item.meetingName ||
    item.scheduleTargetName ||
    getTypeInfo(item.changeType)?.label ||
    "";
  const name = raw.replace(/\s+/g, "");
  return name.length > 4 ? `${name.slice(0, 4)}…` : name;
}

function parseStaffList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // plain text
  }
  return value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
}

function defaultTeamFilter(userTeam: string | null | undefined): TeamFilter {
  if (userTeam && (TEAMS as readonly string[]).includes(userTeam)) {
    return userTeam as TeamFilter;
  }
  return "all";
}

export default function ScheduleCalendar() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [yearMonth, setYearMonth] = useState(getJstYearMonth);
  const [weekStart, setWeekStart] = useState(() => getSundayOfWeek(getJstTodayKey()));
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeTypeFilter>("all");
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [teamInitialized, setTeamInitialized] = useState(false);

  // ユーザー情報が届いたら、初期チームを自分の所属に合わせる（1回だけ）
  useEffect(() => {
    if (teamInitialized || !user?.team) return;
    setTeamFilter(defaultTeamFilter(user.team));
    setTeamInitialized(true);
  }, [user?.team, teamInitialized]);

  const weekEnd = useMemo(() => addDaysToDateKey(weekStart, 6), [weekStart]);
  const fetchMonths = useMemo(() => {
    if (viewMode === "month") return [yearMonth];
    const m1 = weekStart.slice(0, 7);
    const m2 = weekEnd.slice(0, 7);
    return m1 === m2 ? [m1] : [m1, m2];
  }, [viewMode, yearMonth, weekStart, weekEnd]);

  const primaryInput = useMemo(() => {
    const input: {
      yearMonth: string;
      team?: (typeof TEAMS)[number];
      changeType?: ChangeType;
    } = { yearMonth: fetchMonths[0] };
    if (teamFilter !== "all") input.team = teamFilter;
    if (changeTypeFilter !== "all") input.changeType = changeTypeFilter;
    return input;
  }, [fetchMonths, teamFilter, changeTypeFilter]);

  const secondaryInput = useMemo(() => {
    const ym = fetchMonths[1] ?? fetchMonths[0];
    const input: {
      yearMonth: string;
      team?: (typeof TEAMS)[number];
      changeType?: ChangeType;
    } = { yearMonth: ym };
    if (teamFilter !== "all") input.team = teamFilter;
    if (changeTypeFilter !== "all") input.changeType = changeTypeFilter;
    return input;
  }, [fetchMonths, teamFilter, changeTypeFilter]);

  const primaryQuery = trpc.scheduleChanges.listActiveForCalendar.useQuery(
    primaryInput,
    { refetchInterval: 60000 }
  );
  const secondaryQuery = trpc.scheduleChanges.listActiveForCalendar.useQuery(
    secondaryInput,
    {
      enabled: fetchMonths.length > 1,
      refetchInterval: 60000,
    }
  );

  const items = useMemo(() => {
    const map = new Map<number, CalendarItem>();
    for (const item of (primaryQuery.data ?? []) as CalendarItem[]) {
      map.set(item.id, item);
    }
    if (fetchMonths.length > 1) {
      for (const item of (secondaryQuery.data ?? []) as CalendarItem[]) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }, [primaryQuery.data, secondaryQuery.data, fetchMonths.length]);

  const isLoading = primaryQuery.isLoading || (fetchMonths.length > 1 && secondaryQuery.isLoading);
  const isFetching = primaryQuery.isFetching || (fetchMonths.length > 1 && secondaryQuery.isFetching);
  const refetch = () => {
    void primaryQuery.refetch();
    if (fetchMonths.length > 1) void secondaryQuery.refetch();
  };

  const closeSheet = () => {
    setSelectedDateKey(null);
    setSelectedItemId(null);
  };

  const utils = trpc.useUtils();
  const cancelMutation = trpc.scheduleChanges.cancel.useMutation({
    onSuccess: () => {
      toast.success("予定を取り消しました（スプレッドシートにも追記します）");
      void utils.scheduleChanges.listActiveForCalendar.invalidate();
      void utils.scheduleChanges.list.invalidate();
      closeSheet();
    },
    onError: (err) => toast.error(`取消エラー: ${err.message}`),
  });

  const todayKey = getJstTodayKey();
  const monthCells = useMemo(() => buildMonthCells(yearMonth), [yearMonth]);
  const weekCells = useMemo(() => buildWeekCells(weekStart), [weekStart]);

  const visibleDateKeys = useMemo(() => {
    if (viewMode === "week") {
      return new Set(weekCells.map((c) => c.dateKey));
    }
    return null;
  }, [viewMode, weekCells]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const start = item.calendarDate;
      const end = item.calendarEndDate && item.calendarEndDate >= start
        ? item.calendarEndDate
        : start;
      for (const dateKey of eachDateKeyInRange(start, end)) {
        if (viewMode === "month") {
          if (!dateKey.startsWith(yearMonth)) continue;
        } else if (visibleDateKeys && !visibleDateKeys.has(dateKey)) {
          continue;
        }
        const list = map.get(dateKey) ?? [];
        if (!list.some((x) => x.id === item.id)) {
          list.push(item);
          map.set(dateKey, list);
        }
      }
    }
    return map;
  }, [items, viewMode, yearMonth, visibleDateKeys]);

  const selectedDayItems = selectedDateKey ? (itemsByDate.get(selectedDateKey) ?? []) : [];
  const maxChips = viewMode === "week" ? MAX_CHIPS_PER_DAY_WEEK : MAX_CHIPS_PER_DAY;

  const openDay = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    setSelectedItemId(null);
  };

  const handleEdit = (item: CalendarItem) => {
    navigate(`/schedule-change?editId=${item.id}&from=calendar`);
  };

  const handleCancel = (item: CalendarItem) => {
    const label = getTypeInfo(item.changeType)?.label ?? item.changeType;
    const target = item.patientName || item.meetingName || item.scheduleTargetName || label;
    if (!window.confirm(`「${target}」の${label}を取り消しますか？\nスプレッドシートにも取消行が追記されます。`)) {
      return;
    }
    cancelMutation.mutate({ id: item.id });
  };

  const switchToMonth = () => {
    setYearMonth(weekStart.slice(0, 7));
    setViewMode("month");
  };

  const switchToWeek = () => {
    // 表示中の月の今日、または月の1日を含む週へ
    const today = getJstTodayKey();
    const anchor = today.startsWith(yearMonth) ? today : `${yearMonth}-01`;
    setWeekStart(getSundayOfWeek(anchor));
    setViewMode("week");
  };

  const renderDayCell = (
    dateKey: string,
    dayLabel: string | number,
    weekday: number,
    opts?: { minHeightClass?: string; showMonth?: number },
  ) => {
    const dayItems = itemsByDate.get(dateKey) ?? [];
    const rangeItems = dayItems.filter(isMultiDayItem);
    const singleItems = dayItems.filter((item) => !isMultiDayItem(item));
    const visibleRanges = rangeItems.slice(0, maxChips);
    const remainingSlots = Math.max(0, maxChips - visibleRanges.length);
    const visibleSingles = singleItems.slice(0, remainingSlots);
    const overflow = dayItems.length - visibleRanges.length - visibleSingles.length;
    const isToday = dateKey === todayKey;

    return (
      <button
        key={dateKey}
        type="button"
        onClick={() => openDay(dateKey)}
        className={cn(
          "border-b border-r border-border/60 p-1 text-left align-top transition-colors hover:bg-muted/40 overflow-hidden",
          opts?.minHeightClass ?? "min-h-[72px]",
          isToday && "bg-primary/5",
        )}
      >
        <div
          className={cn(
            "mb-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold",
            isToday && "bg-primary text-primary-foreground",
            !isToday && weekday === 0 && "text-red-500",
            !isToday && weekday === 6 && "text-blue-500",
            !isToday && weekday !== 0 && weekday !== 6 && "text-foreground",
          )}
        >
          {opts?.showMonth != null ? `${opts.showMonth}/${dayLabel}` : dayLabel}
        </div>
        <div className="space-y-0.5">
          {visibleRanges.map((item) => {
            const info = getTypeInfo(item.changeType);
            const meta = getRangeBarMeta(item, dateKey, weekday);
            return (
              <div
                key={`bar-${item.id}`}
                className={cn(
                  "h-3.5 text-[9px] leading-3.5 truncate",
                  info?.chip ?? "bg-muted text-foreground",
                  meta.roundLeft ? "rounded-l-sm pl-0.5" : "-ml-1 pl-1",
                  meta.roundRight ? "rounded-r-sm pr-0.5" : "-mr-1 pr-1",
                )}
                title={`${info?.label ?? item.changeType} ${shortName(item)}（${item.displayDateTime}）`}
              >
                {meta.showLabel ? (
                  <>{info?.icon} {shortName(item)}</>
                ) : (
                  <span className="opacity-0">.</span>
                )}
              </div>
            );
          })}
          {visibleSingles.map((item) => {
            const info = getTypeInfo(item.changeType);
            return (
              <div
                key={item.id}
                className={cn(
                  "truncate rounded px-0.5 py-px text-[9px] leading-tight",
                  info?.chip ?? "bg-muted text-foreground",
                )}
                title={`${info?.label ?? item.changeType} ${shortName(item)}`}
              >
                {info?.icon} {shortName(item)}
              </div>
            );
          })}
          {overflow > 0 && (
            <div className="text-[9px] text-muted-foreground px-0.5">+{overflow}</div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <CalendarDays className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">予定カレンダー</h1>
            <p className="text-xs text-muted-foreground">
              有効な予定のみ表示 · {items.length}件
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-2"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/schedule-change-history")}
            className="h-8 text-xs"
          >
            履歴
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v as TeamFilter)}>
          <SelectTrigger className="h-9 text-xs flex-1">
            <SelectValue placeholder="チーム" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのチーム</SelectItem>
            {TEAMS.map((team) => (
              <SelectItem key={team} value={team}>{team}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={changeTypeFilter} onValueChange={(v) => setChangeTypeFilter(v as ChangeTypeFilter)}>
          <SelectTrigger className="h-9 text-xs flex-1">
            <SelectValue placeholder="種別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての種別</SelectItem>
            {CHANGE_TYPE_KEYS.map((value) => {
              const info = CHANGE_TYPE_LABELS[value];
              return (
                <SelectItem key={value} value={value}>
                  {info.icon} {info.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
        <button
          type="button"
          onClick={switchToMonth}
          className={cn(
            "flex-1 h-8 text-xs rounded-md transition-colors",
            viewMode === "month" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground",
          )}
        >
          月
        </button>
        <button
          type="button"
          onClick={switchToWeek}
          className={cn(
            "flex-1 h-8 text-xs rounded-md transition-colors",
            viewMode === "week" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground",
          )}
        >
          週（日曜始まり）
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-2 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => {
            if (viewMode === "month") setYearMonth((ym) => shiftYearMonth(ym, -1));
            else setWeekStart((ws) => shiftWeek(ws, -1));
          }}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-sm font-semibold text-foreground text-center px-1">
          {viewMode === "month" ? formatYearMonthLabel(yearMonth) : formatWeekLabel(weekStart)}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              if (viewMode === "month") {
                setYearMonth(getJstYearMonth());
              } else {
                setWeekStart(getSundayOfWeek(getJstTodayKey()));
              }
            }}
          >
            {viewMode === "month" ? "今月" : "今週"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              if (viewMode === "month") setYearMonth((ym) => shiftYearMonth(ym, 1));
              else setWeekStart((ws) => shiftWeek(ws, 1));
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAYS.map((label, idx) => (
            <div
              key={label}
              className={cn(
                "py-1.5 text-center text-[11px] font-medium text-muted-foreground",
                idx === 0 && "text-red-500",
                idx === 6 && "text-blue-500",
              )}
            >
              {label}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : viewMode === "month" ? (
          <div className="grid grid-cols-7">
            {monthCells.map((cell, idx) => {
              if (!cell.dateKey || cell.day == null) {
                return <div key={`empty-${idx}`} className="min-h-[72px] border-b border-r border-border/60 bg-muted/10" />;
              }
              return renderDayCell(cell.dateKey, cell.day, idx % 7, { minHeightClass: "min-h-[72px]" });
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {weekCells.map((cell, idx) =>
              renderDayCell(cell.dateKey, cell.day, idx, {
                minHeightClass: "min-h-[140px]",
                showMonth: cell.month,
              }),
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => navigate("/schedule-change")}
        >
          変更連絡を入力
        </Button>
        <a
          href={SPREADSHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 text-xs font-medium px-3 rounded-md border border-border bg-card hover:bg-muted/50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          シートを開く
        </a>
      </div>

      <Sheet open={!!selectedDateKey} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>
              {selectedDateKey
                ? `${Number(selectedDateKey.slice(5, 7))}/${Number(selectedDateKey.slice(8, 10))} の予定`
                : "予定詳細"}
            </SheetTitle>
            <SheetDescription>
              {selectedDayItems.length === 0
                ? "この日の有効な予定はありません"
                : `${selectedDayItems.length}件（タップで詳細）`}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2 pb-6">
            {selectedDayItems.map((item) => {
              const info = getTypeInfo(item.changeType);
              const isOpen = selectedItemId === item.id;
              const staff = parseStaffList(item.meetingStaff || item.scheduleStaff);
              return (
                <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    type="button"
                    className="w-full text-left p-3"
                    onClick={() => setSelectedItemId(isOpen ? null : item.id)}
                  >
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className={cn("text-[10px] border", info?.color)}>
                        {info?.icon} {info?.label ?? item.changeType}
                      </Badge>
                      {item.team && (
                        <span className="text-[10px] text-muted-foreground mt-0.5">{item.team}</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                      {item.patientName || item.meetingName || item.scheduleTargetName || "（名称なし）"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.displayDateTime || "—"}
                      {item.scheduleFacility ? ` · ${item.scheduleFacility}` : ""}
                    </p>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 space-y-1.5 text-xs border-t border-border pt-2">
                      {item.fromDatetime && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">変更前</span>
                          <span>{item.fromDatetime}</span>
                        </div>
                      )}
                      {item.toDatetime && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">変更後</span>
                          <span>{item.toDatetime}</span>
                        </div>
                      )}
                      {item.scheduleEndDate && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">終了日</span>
                          <span>{item.scheduleEndDate}</span>
                        </div>
                      )}
                      {(item.staffBefore || item.staffAfter) && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">担当</span>
                          <span>
                            {[item.staffBefore, item.staffAfter].filter(Boolean).join(" → ") || "—"}
                          </span>
                        </div>
                      )}
                      {staff.length > 0 && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">スタッフ</span>
                          <span>{staff.join("、")}</span>
                        </div>
                      )}
                      {item.reason && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">理由・備考</span>
                          <span className="whitespace-pre-wrap">{item.reason}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-20 flex-shrink-0">入力者</span>
                        <span>{item.createdByName}</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => handleEdit(item)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          修正
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                          disabled={cancelMutation.isPending}
                          onClick={() => handleCancel(item)}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
