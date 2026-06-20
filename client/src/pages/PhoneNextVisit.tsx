/**
 * PhoneNextVisit - 電話等で次回訪問日時を伝えた際の転記画面
 * 訪問タブの次回訪問日時UIと同様の入力で、同じスプレッドシートへ転記する
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar as UiCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Loader2, Calendar, ChevronDown, X, ExternalLink, Phone, Search,
} from "lucide-react";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

const NOTIFY_TO_OPTIONS = ["本人", "家族", "その他"] as const;
const NOTIFY_METHOD_OPTIONS = ["口頭", "カレンダー記入", "付箋", "電話", "その他"] as const;

const NEXT_VISIT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo/edit";

type PatientItem = {
  id: number;
  name: string;
  nameKana?: string | null;
  team: string;
};

export default function PhoneNextVisit() {
  const [selectedTeam, setSelectedTeam] = useState<Team | "">("");
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState<number | undefined>(undefined);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
  const patientContainerRef = useRef<HTMLDivElement>(null);

  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextVisitTime, setNextVisitTime] = useState("");
  const [nextVisitCalendarOpen, setNextVisitCalendarOpen] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const timeListRef = useRef<HTMLDivElement>(null);

  const [notifiedTo, setNotifiedTo] = useState<string>("");
  const [notifiedToOther, setNotifiedToOther] = useState("");
  const [notifyMethod, setNotifyMethod] = useState<string>("電話");
  const [notifyMethodOther, setNotifyMethodOther] = useState("");

  const [exported, setExported] = useState(false);

  const { data: patients = [] } = trpc.patients.list.useQuery(
    selectedTeam ? { team: selectedTeam } : {},
    { refetchOnWindowFocus: false }
  );

  const timeSlots = useMemo(
    () =>
      Array.from({ length: 24 * 12 }, (_, i) => {
        const h = Math.floor(i / 12);
        const m = (i % 12) * 5;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }),
    []
  );

  useEffect(() => {
    if (!timeDropdownOpen || !timeListRef.current) return;
    const now = new Date();
    const roundedMin = Math.round(now.getMinutes() / 5) * 5;
    const h = roundedMin === 60 ? (now.getHours() + 1) % 24 : now.getHours();
    const m = roundedMin === 60 ? 0 : roundedMin;
    const target = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const el = timeListRef.current.querySelector(`[data-val="${target}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "center" });
  }, [timeDropdownOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (patientContainerRef.current && !patientContainerRef.current.contains(e.target as Node)) {
        setPatientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredPatients = useMemo(() => {
    const list = patients as PatientItem[];
    if (!patientQuery) return list.slice(0, 50);
    const q = patientQuery.toLowerCase();
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.nameKana && p.nameKana.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [patients, patientQuery]);

  const selectedNextVisitDate = useMemo(() => {
    if (!nextVisitDate) return undefined;
    const [year, month, day] = nextVisitDate.split("-").map(Number);
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day);
  }, [nextVisitDate]);

  const formatDateForInput = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const handleSelectPatient = (patient: PatientItem) => {
    setPatientName(patient.name);
    setPatientId(patient.id);
    setPatientQuery(patient.name);
    if (patient.team && TEAMS.includes(patient.team as Team)) {
      setSelectedTeam(patient.team as Team);
    }
    setPatientDropdownOpen(false);
  };

  const handleClearPatient = () => {
    setPatientName("");
    setPatientId(undefined);
    setPatientQuery("");
  };

  const handleResetNextVisitDateTime = () => {
    if (!window.confirm("次回訪問日時をリセットしますか？")) return;
    setNextVisitDate("");
    setNextVisitTime("");
  };

  const exportToSheet = trpc.visitRecords.exportToSheet.useMutation({
    onSuccess: () => {
      toast.success(`${patientName}さんの次回訪問日時を転送しました！`);
      setExported(true);
    },
    onError: (err) => toast.error(`転送エラー: ${err.message}`),
  });

  const createRecord = trpc.visitRecords.create.useMutation({
    onSuccess: (data) => {
      exportToSheet.mutate({ id: data.id });
    },
    onError: (err) => toast.error(`保存エラー: ${err.message}`),
  });

  const handleSaveAndExport = () => {
    if (!selectedTeam) {
      toast.error("チームを選択してください");
      return;
    }
    if (!patientName) {
      toast.error("利用者を選択してください");
      return;
    }
    if (!nextVisitDate) {
      toast.error("次回訪問日を入力してください");
      return;
    }

    const nextVisitAt = new Date(
      nextVisitTime && nextVisitTime !== "unspecified"
        ? `${nextVisitDate}T${nextVisitTime}`
        : `${nextVisitDate}T00:00`
    );

    createRecord.mutate({
      patientId,
      patientName,
      team: selectedTeam,
      nextVisitAt,
      notifiedTo: (notifiedTo as typeof NOTIFY_TO_OPTIONS[number]) || undefined,
      notifiedToOther: notifiedToOther || undefined,
      notifyMethod: (notifyMethod as typeof NOTIFY_METHOD_OPTIONS[number]) || undefined,
      notifyMethodOther: notifyMethodOther || undefined,
    });
  };

  const isPatientSelected = !!patientName && !!selectedTeam;
  const isPending = createRecord.isPending || exportToSheet.isPending;

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Phone className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">次回訪問日時（電話等）</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        訪問現場で伝えられず、電話等で次回訪問日時をお伝えした場合にスプレッドシートへ転記します。
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">チーム</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEAMS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setSelectedTeam(t);
                  handleClearPatient();
                }}
                className={cn(
                  "text-xs px-2 py-2 rounded-md border transition-all font-medium text-center",
                  getTeamButtonClass(t, selectedTeam === t)
                )}
                style={getTeamButtonStyle(t, selectedTeam === t)}
              >
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            利用者名 <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={patientContainerRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setPatientName(e.target.value);
                  setPatientId(undefined);
                  setPatientDropdownOpen(true);
                }}
                onFocus={() => setPatientDropdownOpen(true)}
                placeholder="利用者名またはカナで検索..."
                className={cn(
                  "w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-input bg-background",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                  patientName && "border-primary/60 bg-primary/5"
                )}
                autoComplete="off"
              />
              {patientName && (
                <button
                  type="button"
                  onClick={handleClearPatient}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            {patientDropdownOpen && filteredPatients.length > 0 && (
              <div className="absolute z-50 top-full mt-1 w-full border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                {filteredPatients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                    onClick={() => handleSelectPatient(p)}
                  >
                    <span>{p.name}</span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded", getTeamButtonClass(p.team, false))}>
                      {p.team}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {patientDropdownOpen && patientQuery && filteredPatients.length === 0 && (
              <div className="absolute z-50 top-full mt-1 w-full border rounded-md bg-background shadow-md px-3 py-2 text-sm text-muted-foreground">
                「{patientQuery}」に一致する利用者が見つかりません
              </div>
            )}
          </div>
          {patientName && selectedTeam && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-xs font-medium">{patientName}</span>
              <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", getTeamButtonClass(selectedTeam, true))}>
                {selectedTeam}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              次回訪問日時
            </CardTitle>
            <a
              href={NEXT_VISIT_SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              シート
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2">
            <Popover open={nextVisitCalendarOpen} onOpenChange={setNextVisitCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs",
                    !nextVisitDate && "text-muted-foreground"
                  )}
                >
                  {nextVisitDate ? nextVisitDate.replace(/-/g, "/") : "日付を選択"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                <UiCalendar
                  mode="single"
                  selected={selectedNextVisitDate}
                  onSelect={(date) => {
                    if (!date) return;
                    setNextVisitDate(formatDateForInput(date));
                    setNextVisitCalendarOpen(false);
                  }}
                  locale={ja}
                  weekStartsOn={0}
                  className="rounded-md border-0"
                />
              </PopoverContent>
            </Popover>

            <div className="relative w-28">
              <button
                type="button"
                className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted transition-colors"
                onClick={() => setTimeDropdownOpen((o) => !o)}
              >
                <span className={nextVisitTime ? "" : "text-muted-foreground"}>
                  {nextVisitTime === "unspecified" ? "時間未定" : (nextVisitTime || "時刻")}
                </span>
                <ChevronDown className="w-3 h-3 ml-1 text-muted-foreground" />
              </button>
              {timeDropdownOpen && (
                <div
                  ref={timeListRef}
                  className="absolute z-50 top-full mt-1 w-full border rounded-md bg-background shadow-md max-h-60 overflow-y-auto"
                >
                  <button
                    type="button"
                    data-val="unspecified"
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors border-b",
                      nextVisitTime === "unspecified"
                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 font-medium"
                        : "text-amber-700 dark:text-amber-400"
                    )}
                    onClick={() => {
                      setNextVisitTime("unspecified");
                      setTimeDropdownOpen(false);
                    }}
                  >
                    時間未定
                  </button>
                  {timeSlots.map((val) => (
                    <button
                      key={val}
                      data-val={val}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors",
                        nextVisitTime === val && "bg-primary text-primary-foreground hover:bg-primary"
                      )}
                      onClick={() => {
                        setNextVisitTime(val);
                        setTimeDropdownOpen(false);
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(nextVisitDate || nextVisitTime) && (
              <button
                type="button"
                className="w-fit flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/40 transition-colors"
                onClick={handleResetNextVisitDateTime}
              >
                <X className="w-3.5 h-3.5" />
                次回訪問日時リセット
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">伝達先</label>
              <div className="flex gap-1.5 flex-wrap">
                {NOTIFY_TO_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs border transition-colors",
                      notifiedTo === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    )}
                    onClick={() => setNotifiedTo(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {notifiedTo === "その他" && (
                <Input
                  className="mt-1.5 text-sm"
                  placeholder="伝達先を記入..."
                  value={notifiedToOther}
                  onChange={(e) => setNotifiedToOther(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">伝達方法</label>
              <div className="flex gap-1.5 flex-wrap">
                {NOTIFY_METHOD_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs border transition-colors",
                      notifyMethod === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    )}
                    onClick={() => setNotifyMethod(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {notifyMethod === "その他" && (
                <Input
                  className="mt-1.5 text-sm"
                  placeholder="伝達方法を記入..."
                  value={notifyMethodOther}
                  onChange={(e) => setNotifyMethodOther(e.target.value)}
                />
              )}
            </div>
          </div>

          {exported ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg">
              <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓ 転送済み</span>
              <button
                type="button"
                className="ml-auto text-xs text-muted-foreground hover:underline"
                onClick={() => setExported(false)}
              >
                再転送
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200",
                (!nextVisitDate || !isPatientSelected || isPending)
                  ? "bg-muted border border-border text-muted-foreground cursor-not-allowed opacity-60"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg active:scale-95"
              )}
              onClick={handleSaveAndExport}
              disabled={!nextVisitDate || !isPatientSelected || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  転送中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  スプレッドシートへ転記
                </>
              )}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
