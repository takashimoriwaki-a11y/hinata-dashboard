import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CalendarClock,
  ExternalLink,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";

const CHANGE_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  visit_change: { label: "訪問日時変更", icon: "🔄", color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700" },
  visit_cancel: { label: "訪問キャンセル", icon: "❌", color: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700" },
  visit_add: { label: "訪問追加", icon: "➕", color: "bg-green-100 text-green-900 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700" },
  meeting_add: { label: "会議追加", icon: "📅", color: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700" },
  meeting_change: { label: "会議変更", icon: "📝", color: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700" },
  // 予定管理種別
  schedule_outpatient: { label: "受診", icon: "🏥", color: "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700" },
  schedule_short_stay: { label: "ショートステイ", icon: "🏨", color: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-700" },
  schedule_special_instruction: { label: "特別指示書", icon: "📋", color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700" },
  schedule_hospitalization: { label: "入院", icon: "🏥", color: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700" },
  schedule_discharge: { label: "退院", icon: "🏠", color: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700" },
  schedule_new_contract: { label: "新規契約・面談", icon: "🤝", color: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700" },
  schedule_home_visit_doctor: { label: "訪問診療同席", icon: "👨‍⚕️", color: "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-700" },
  schedule_other: { label: "その他のスケジュール", icon: "📝", color: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-700" },
};

// 予定管理種別かどうかを判定するヘルパー
const SCHEDULE_TYPE_KEYS = ["schedule_outpatient", "schedule_short_stay", "schedule_special_instruction", "schedule_hospitalization", "schedule_discharge", "schedule_new_contract", "schedule_home_visit_doctor", "schedule_other"];

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"] as const;

function formatDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function formatCreatedAt(date: Date | string | null | undefined): string {
  if (!date) return "—";
  try {
    const d = new Date(date as string);
    const pad = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "たった今";
    if (diffMin < 60) return `${diffMin}分前`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}時間前`;
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(date);
  }
}

interface HistoryRecord {
  id: number;
  changeType: string;
  team?: string | null;
  patientName?: string | null;
  fromDatetime?: string | null;
  toDatetime?: string | null;
  staffBefore?: string | null;
  staffAfter?: string | null;
  meetingName?: string | null;
  meetingStaff?: string | null;
  reason?: string | null;
  createdByName?: string | null;
  exported: number;
  createdAt: Date | string;
}

function HistoryCard({ record }: { record: HistoryRecord }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = CHANGE_TYPE_LABELS[record.changeType] ?? { label: record.changeType, icon: "📋", color: "bg-muted text-muted-foreground border-border" };
  const isVisit = ["visit_change", "visit_cancel", "visit_add"].includes(record.changeType);
  const isMeeting = ["meeting_add", "meeting_change"].includes(record.changeType);
  const isSchedule = SCHEDULE_TYPE_KEYS.includes(record.changeType);

  const meetingStaffList = useMemo(() => {
    if (!record.meetingStaff) return [];
    try { return JSON.parse(record.meetingStaff) as string[]; } catch { return [record.meetingStaff]; }
  }, [record.meetingStaff]);

  return (
    <Card className={cn(
      "border transition-all",
      record.exported ? "border-border" : "border-amber-300 bg-amber-50/30"
    )}>
      <CardContent className="p-4">
        {/* ヘッダー行 */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn("text-xs shrink-0", typeInfo.color)}>
                {typeInfo.icon} {typeInfo.label}
              </Badge>
              {record.team && (
                <Badge variant="secondary" className="text-xs shrink-0">{record.team}</Badge>
              )}
              {!record.exported && (
                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700 shrink-0">
                  <Clock className="w-3 h-3 mr-1" />
                  転記待ち
                </Badge>
              )}
              {record.exported === 1 && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700 shrink-0">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  転記済
                </Badge>
              )}
            </div>

            {/* メインコンテンツ */}
            <div className="mt-2 space-y-1">
              {isVisit && record.patientName && (
                <p className="text-sm font-semibold text-foreground">{record.patientName}</p>
              )}
              {isMeeting && record.meetingName && (
                <p className="text-sm font-semibold text-foreground">{record.meetingName}</p>
              )}
              {isSchedule && record.patientName && (
                <p className="text-sm font-semibold text-foreground">{record.patientName}</p>
              )}
              {record.fromDatetime && (
                <p className="text-xs text-muted-foreground">
                  {isSchedule ? "開始日時" : "変更前"}: <span className="text-foreground font-medium">{formatDatetime(record.fromDatetime)}</span>
                </p>
              )}
              {record.toDatetime && (
                <p className="text-xs text-muted-foreground">
                  {isSchedule ? "終了日時" : record.changeType === "visit_cancel" ? "キャンセル日時" : "変更後"}: <span className="text-foreground font-medium">{formatDatetime(record.toDatetime)}</span>
                </p>
              )}
            </div>
          </div>

          {/* 右側：日時・入力者 */}
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-muted-foreground">{formatCreatedAt(record.createdAt)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{record.createdByName ?? "不明"}</p>
          </div>
        </div>

        {/* 展開ボタン */}
        {(record.staffBefore || record.staffAfter || record.reason || meetingStaffList.length > 0 || isSchedule) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "閉じる" : "詳細を表示"}
          </button>
        )}

        {/* 展開詳細 */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-1.5 text-sm">
            {record.staffBefore && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0 text-xs">変更前担当</span>
                <span className="text-xs">{record.staffBefore}</span>
              </div>
            )}
            {record.staffAfter && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0 text-xs">変更後担当</span>
                <span className="text-xs">{record.staffAfter}</span>
              </div>
            )}
            {meetingStaffList.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0 text-xs">{isSchedule ? "対応スタッフ" : "参加スタッフ"}</span>
                <span className="text-xs">{meetingStaffList.join("、")}</span>
              </div>
            )}
            {record.reason && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0 text-xs">理由・備考</span>
                <span className="text-xs">{record.reason}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ScheduleChangeHistory() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: records = [], isLoading, refetch, isFetching } = trpc.scheduleChanges.list.useQuery(
    { limit: 200 },
    { refetchInterval: 60000 } // 1分ごとに自動更新
  );

  // フィルタリング
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterType !== "all" && r.changeType !== filterType) return false;
      if (filterTeam !== "all" && r.team !== filterTeam) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchTarget = [
          r.patientName,
          r.meetingName,
          r.createdByName,
          r.staffBefore,
          r.staffAfter,
          r.reason,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!searchTarget.includes(q)) return false;
      }
      return true;
    });
  }, [records, filterType, filterTeam, searchQuery]);

  const pendingCount = records.filter(r => !r.exported).length;

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">変更連絡 履歴</h1>
            <p className="text-xs text-muted-foreground">
              {records.length}件
              {pendingCount > 0 && (
                <span className="ml-1 text-amber-600 font-medium">（転記待ち {pendingCount}件）</span>
              )}
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
            size="sm"
            onClick={() => navigate("/schedule-change")}
            className="h-8 text-xs"
          >
            新規入力
          </Button>
        </div>
      </div>

      {/* スプレッドシートリンク */}
      <a
        href={SPREADSHEET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:hover:bg-green-950/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
          <ExternalLink className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">スプレッドシートを開く</p>
          <p className="text-xs text-green-600 dark:text-green-400 truncate">ひなた_スケジュール変更連絡</p>
        </div>
        <ExternalLink className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
      </a>

      {/* 検索・フィルター */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="利用者名・会議名・担当者で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn("h-9 px-3 gap-1.5", (filterType !== "all" || filterTeam !== "all") && "border-primary text-primary")}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="text-xs">絞り込み</span>
            {(filterType !== "all" || filterTeam !== "all") && (
              <Badge variant="secondary" className="text-xs h-4 px-1 ml-0.5">
                {[filterType !== "all" ? 1 : 0, filterTeam !== "all" ? 1 : 0].reduce((a, b) => a + b, 0)}
              </Badge>
            )}
          </Button>
        </div>

        {showFilters && (
          <div className="flex gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="変更種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての種別</SelectItem>
                {Object.entries(CHANGE_TYPE_LABELS).map(([value, info]) => (
                  <SelectItem key={value} value={value}>
                    {info.icon} {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="チーム" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのチーム</SelectItem>
                {TEAMS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* アクティブフィルター表示 */}
        {(filterType !== "all" || filterTeam !== "all") && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">絞り込み中:</span>
            {filterType !== "all" && (
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-destructive/10"
                onClick={() => setFilterType("all")}
              >
                {CHANGE_TYPE_LABELS[filterType]?.label} ×
              </Badge>
            )}
            {filterTeam !== "all" && (
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-destructive/10"
                onClick={() => setFilterTeam("all")}
              >
                {filterTeam} ×
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* 一覧 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarClock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {records.length === 0
                ? "変更連絡の記録がありません"
                : "条件に一致する記録がありません"}
            </p>
            {records.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate("/schedule-change")}
              >
                変更連絡を入力する
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground px-1">
            {filtered.length}件を表示{filtered.length !== records.length && `（全${records.length}件中）`}
          </p>
          {filtered.map((record) => (
            <HistoryCard key={record.id} record={record as HistoryRecord} />
          ))}
        </div>
      )}
    </div>
  );
}
