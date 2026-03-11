/**
 * スケジュール管理ページ
 * スケジュール管理関連のリンクと個人Googleカレンダーを表示する
 */
import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CalendarDays, ExternalLink, Link2, BarChart2,
  ChevronLeft, ChevronRight, CalendarCheck, RefreshCw,
  AlertCircle, Loader2, Calendar
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, addMonths, subMonths, parseISO,
  startOfWeek, endOfWeek
} from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";

const scheduleLinks: { label: string; href: string; description: string }[] = [
  {
    label: "ひなた利用者情報",
    href: "https://docs.google.com/spreadsheets/d/1cJ8f3gFWu0Fqrl3TxthGVk0-9TF4Hg5YJZFO-mWIvjI/edit?gid=349418380#gid=349418380",
    description: "訪問スケジュールの管理・確認",
  },
  {
    label: "ひなた_スケジュール変更連絡",
    href: "https://docs.google.com/spreadsheets/d/1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU/edit?gid=941601927#gid=941601927",
    description: "スケジュール変更連絡管理表",
  },
  {
    label: "ひなた_次回訪問日時",
    href: "https://docs.google.com/spreadsheets/d/1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo/edit?gid=0#gid=0",
    description: "次回訪問日時管理表",
  },
];

// Google Calendarのカラーマッピング
const GOOGLE_COLORS: Record<string, string> = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73",
  "5": "#f6c026", "6": "#f5511d", "7": "#039be5", "8": "#616161",
  "9": "#3f51b5", "10": "#0b8043", "11": "#d60000",
};

function getEventColor(colorId: string | null): string {
  return colorId ? (GOOGLE_COLORS[colorId] ?? "#4285f4") : "#4285f4";
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  htmlLink: string | null;
  colorId: string | null;
  description: string | null;
  location: string | null;
}

function GoogleCalendarView() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // カレンダー連携状態を取得
  const { data: calendarStatus, isLoading: statusLoading } = trpc.calendar.status.useQuery();

  // 表示月のイベントを取得
  const timeMin = useMemo(() => startOfMonth(currentMonth).toISOString(), [currentMonth]);
  const timeMax = useMemo(() => endOfMonth(currentMonth).toISOString(), [currentMonth]);

  const { data: eventsData, isLoading: eventsLoading, error: eventsError, refetch } = trpc.calendar.getEvents.useQuery(
    { timeMin, timeMax, maxResults: 100 },
    { enabled: calendarStatus?.connected === true, retry: false }
  );

  // calendar_connected=1 クエリパラメータがある場合はトースト表示
  useEffect(() => {
    if (window.location.search.includes("calendar_connected=1")) {
      toast.success("Googleカレンダーと連携しました！");
      // URLからパラメータを除去
      const url = new URL(window.location.href);
      url.searchParams.delete("calendar_connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const events: CalendarEvent[] = eventsData?.events ?? [];

  // 月のカレンダーグリッドを生成
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // 選択日のイベント
  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return events.filter(e => {
      const eventDate = parseISO(e.start.substring(0, 10));
      return isSameDay(eventDate, selectedDate);
    });
  }, [selectedDate, events]);

  // 各日のイベント数マップ
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(e => {
      const key = e.start.substring(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [events]);

  // Googleカレンダー連携ボタン
  const handleConnect = () => {
    window.location.href = `/api/auth/google/calendar?origin=${encodeURIComponent(window.location.origin)}`;
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        読み込み中...
      </div>
    );
  }

  // 未連携の場合
  if (!calendarStatus?.connected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Calendar className="w-8 h-8 text-blue-500" />
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Googleカレンダーと連携する</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Googleアカウントと連携すると、このページで自分のカレンダーを確認できます。
          </p>
        </div>
        <Button onClick={handleConnect} className="gap-2">
          <CalendarCheck className="w-4 h-4" />
          Googleカレンダーを連携する
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* カレンダーヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-base font-semibold min-w-[100px] text-center">
            {format(currentMonth, "yyyy年M月", { locale: ja })}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="text-xs">
            今月
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="更新">
            <RefreshCw className={`w-4 h-4 ${eventsLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleConnect} className="text-xs text-muted-foreground">
            再連携
          </Button>
        </div>
      </div>

      {/* エラー表示 */}
      {eventsError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            {eventsError.message.includes("not connected") || eventsError.message.includes("expired")
              ? "カレンダーの認証が切れました。再連携してください。"
              : "カレンダーの読み込みに失敗しました。"}
          </span>
          <Button variant="ghost" size="sm" onClick={handleConnect} className="ml-auto text-xs">
            再連携
          </Button>
        </div>
      )}

      {/* カレンダーグリッド */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 bg-muted/50">
          {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-medium py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}
            >
              {d}
            </div>
          ))}
        </div>
        {/* 日付グリッド */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const dayKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(dayKey) ?? [];
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
            const isTodayDay = isToday(day);
            const dayOfWeek = day.getDay();

            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={[
                  "min-h-[64px] p-1 border-b border-r border-border text-left transition-colors",
                  !isCurrentMonth ? "bg-muted/20 opacity-40" : "hover:bg-accent/50",
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : "",
                  idx % 7 === 6 ? "border-r-0" : "",
                ].join(" ")}
              >
                <div className={[
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mb-1 mx-auto",
                  isTodayDay ? "bg-blue-500 text-white" : (
                    dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : "text-foreground"
                  ),
                ].join(" ")}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map(e => (
                    <div
                      key={e.id}
                      className="text-[10px] truncate rounded px-1 py-0.5 text-white leading-tight"
                      style={{ backgroundColor: getEventColor(e.colorId) }}
                    >
                      {e.isAllDay ? e.summary : `${format(parseISO(e.start), "H:mm")} ${e.summary}`}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 2}件</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 選択日のイベント一覧 */}
      {selectedDate && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold">
              {format(selectedDate, "M月d日(E)", { locale: ja })}のイベント
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">予定はありません</p>
            ) : (
              <div className="space-y-2">
                {selectedDayEvents.map(e => (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                      style={{ backgroundColor: getEventColor(e.colorId) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{e.summary}</span>
                        {e.isAllDay && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">終日</Badge>
                        )}
                      </div>
                      {!e.isAllDay && (
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(e.start), "H:mm")} – {format(parseISO(e.end), "H:mm")}
                        </p>
                      )}
                      {e.location && (
                        <p className="text-xs text-muted-foreground truncate">{e.location}</p>
                      )}
                    </div>
                    {e.htmlLink && (
                      <a
                        href={e.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {eventsLoading && (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          カレンダーを読み込み中...
        </div>
      )}
    </div>
  );
}

export default function ScheduleManagement() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">スケジュール管理</h1>
          <p className="text-sm text-muted-foreground">スケジュール管理関連の書類・ツールへのリンク</p>
        </div>
      </div>

      {/* タブ */}
      <Tabs defaultValue="links">
        <TabsList className="w-full">
          <TabsTrigger value="links" className="flex-1 gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            関連リンク
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex-1 gap-1.5">
            <CalendarCheck className="w-3.5 h-3.5" />
            Googleカレンダー
          </TabsTrigger>
        </TabsList>

        {/* 関連リンクタブ */}
        <TabsContent value="links" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">関連リンク</CardTitle>
            </CardHeader>
            <CardContent>
              {scheduleLinks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">リンクはまだ登録されていません</p>
                  <p className="text-xs text-muted-foreground">URLを教えていただければ追加します</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduleLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                        <BarChart2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {link.label}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{link.description}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Googleカレンダータブ */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <GoogleCalendarView />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
