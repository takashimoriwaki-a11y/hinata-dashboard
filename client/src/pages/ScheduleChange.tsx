import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CalendarClock,
  Send,
  CheckCircle2,
  X,
  Users,
  FileText,
  Plus,
  Search,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 変更種別の定義
const CHANGE_TYPES = [
  { value: "visit_change", label: "訪問日時変更", icon: "🔄", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "visit_cancel", label: "訪問キャンセル", icon: "❌", color: "bg-red-100 text-red-800 border-red-200" },
  { value: "visit_add", label: "訪問追加", icon: "➕", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "meeting_add", label: "会議追加", icon: "📅", color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "meeting_change", label: "会議変更", icon: "📝", color: "bg-orange-100 text-orange-800 border-orange-200" },
] as const;

type ChangeType = (typeof CHANGE_TYPES)[number]["value"];

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"] as const;
type Team = (typeof TEAMS)[number];

function toLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDatetime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

// ========== 利用者オートコンプリートコンポーネント ==========
type PatientItem = {
  id: number;
  name: string;
  nameKana?: string | null;
  team: string;
};

function PatientAutocomplete({
  patientList,
  value,
  onChange,
}: {
  patientList: PatientItem[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 親からvalueが変わったとき（リセット時など）queryも同期
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // フィルタリング
  const filtered = useMemo(() => {
    if (!query) return patientList.slice(0, 50);
    const q = query.toLowerCase();
    return patientList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.nameKana && p.nameKana.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [patientList, query]);

  const handleSelect = (patient: PatientItem) => {
    setQuery(patient.name);
    onChange(patient.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val); // 手入力も許可
    setOpen(true);
    setHighlighted(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        return;
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) {
        handleSelect(filtered[highlighted]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // ハイライト行が見えるようにスクロール
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.querySelector(`[data-index="${highlighted}"]`) as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlighted]);

  // チームごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, PatientItem[]>();
    for (const p of filtered) {
      if (!map.has(p.team)) map.set(p.team, []);
      map.get(p.team)!.push(p);
    }
    return map;
  }, [filtered]);

  let globalIndex = 0;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-semibold">
          利用者名 <span className="text-destructive">*</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="relative">
          {/* 入力フィールド */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="利用者名またはカナで検索..."
              className={cn(
                "w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-input bg-background",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                "transition-all placeholder:text-muted-foreground",
                value && "border-primary/60 bg-primary/5"
              )}
              autoComplete="off"
            />
            {/* クリアボタン / ドロップダウン矢印 */}
            {value ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onChange("");
                  setOpen(false);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen((o) => !o);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
              </button>
            )}
          </div>

          {/* 選択済み表示 */}
          {value && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg border border-primary/20">
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium text-primary">{value}</span>
              <span className="text-xs text-muted-foreground ml-auto">選択済み</span>
            </div>
          )}

          {/* ドロップダウンリスト */}
          {open && (
            <div
              ref={listRef}
              className={cn(
                "absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg",
                "max-h-72 overflow-y-auto"
              )}
            >
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {query ? `「${query}」に一致する利用者が見つかりません` : "利用者が登録されていません"}
                </div>
              ) : (
                <>
                  {/* 検索ヒット数 */}
                  {query && (
                    <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/30">
                      {filtered.length}件ヒット
                    </div>
                  )}
                  {/* チームごとにグループ表示 */}
                  {Array.from(grouped.entries()).map(([teamName, patients]) => (
                    <div key={teamName}>
                      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/40 sticky top-0">
                        {teamName}チーム
                      </div>
                      {patients.map((p) => {
                        const idx = globalIndex++;
                        return (
                          <button
                            key={p.id}
                            data-index={idx}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); // blur前にonMouseDownで確定
                              handleSelect(p);
                            }}
                            onMouseEnter={() => setHighlighted(idx)}
                            className={cn(
                              "w-full text-left px-4 py-2.5 text-sm transition-colors",
                              "flex items-center justify-between gap-2",
                              highlighted === idx
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted/60 text-foreground"
                            )}
                          >
                            <span className="font-medium">{p.name}</span>
                            {p.nameKana && (
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {p.nameKana}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* 利用者が0件のとき案内 */}
        {patientList.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            ※ チームを選択すると利用者が絞り込まれます。利用者マスタに登録がない場合は直接入力できます。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ========== スタッフオートコンプリートコンポーネント ==========
type StaffItem = {
  id: number;
  name: string;
  team?: string | null;
};

function StaffAutocomplete({
  staffList,
  value,
  onChange,
  placeholder = "スタッフ名で検索...",
  label,
}: {
  staffList: StaffItem[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    if (!query) return staffList.slice(0, 50);
    const q = query.toLowerCase();
    return staffList.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 20);
  }, [staffList, query]);

  const handleSelect = (staff: StaffItem) => {
    setQuery(staff.name);
    onChange(staff.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setOpen(true);
    setHighlighted(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); return; }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) handleSelect(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.querySelector(`[data-index="${highlighted}"]`) as HTMLElement;
      if (item) item.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  return (
    <div className="space-y-1">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              "w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-input bg-background",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
              "transition-all placeholder:text-muted-foreground",
              value && "border-primary/60 bg-primary/5"
            )}
            autoComplete="off"
          />
          {value ? (
            <button
              type="button"
              onClick={() => { setQuery(""); onChange(""); setOpen(false); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>

        {value && (
          <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg border border-primary/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-sm font-medium text-primary">{value}</span>
          </div>
        )}

        {open && (
          <div
            ref={listRef}
            className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto"
          >
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {query ? `「${query}」に一致するスタッフが見つかりません` : "スタッフが登録されていません"}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(""); setQuery(""); setOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/60 border-b"
                >
                  （変更なし）
                </button>
                {filtered.map((s, idx) => (
                  <button
                    key={s.id}
                    data-index={idx}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                    onMouseEnter={() => setHighlighted(idx)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2",
                      highlighted === idx ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground"
                    )}
                  >
                    <span className="font-medium">{s.name}</span>
                    {s.team && <span className="text-xs text-muted-foreground flex-shrink-0">{s.team}</span>}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========== メインコンポーネント ==========

export default function ScheduleChange() {
  const { user } = useAuth();

  // フォーム状態
  const [changeType, setChangeType] = useState<ChangeType | "">("");
  const [team, setTeam] = useState<Team | "">("");
  const [patientName, setPatientName] = useState("");
  const [fromDatetime, setFromDatetime] = useState("");
  const [toDatetime, setToDatetime] = useState("");
  const [staffBefore, setStaffBefore] = useState("");
  const [staffAfter, setStaffAfter] = useState("");
  const [meetingName, setMeetingName] = useState("");
  const [meetingStaff, setMeetingStaff] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [lastRecord, setLastRecord] = useState<{
    changeType: string;
    team?: string;
    patientName?: string;
    fromDatetime?: string;
    toDatetime?: string;
    staffBefore?: string;
    staffAfter?: string;
    meetingName?: string;
    meetingStaff?: string[];
    reason?: string;
  } | null>(null);

  // スタッフ一覧取得
  const { data: staffList = [] } = trpc.staff.listForForm.useQuery();

  // 利用者一覧取得（チームが選択されている場合は絞り込み）
  const patientTeam = useMemo(() => {
    if (!team || team === "事務員" || team === "全チーム") return undefined;
    return team as "身体" | "天理" | "郡山北部" | "郡山南部";
  }, [team]);
  const { data: patientList = [] } = trpc.patients.list.useQuery(
    { team: patientTeam },
    { enabled: changeType === "visit_change" || changeType === "visit_cancel" || changeType === "visit_add" }
  );

  // 送信ミューテーション
  const createAndExport = trpc.scheduleChanges.createAndExport.useMutation({
    onSuccess: (data) => {
      if (data.exported) {
        toast.success("スケジュール変更連絡を送信し、スプレッドシートに転記しました");
      } else {
        toast.success("スケジュール変更連絡を送信しました（スプレッドシート転記は後で実行されます）");
      }
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error(`送信に失敗しました: ${err.message}`);
    },
  });

  const isVisitType = changeType === "visit_change" || changeType === "visit_cancel" || changeType === "visit_add";
  const isMeetingType = changeType === "meeting_add" || changeType === "meeting_change";

  const handleSubmit = () => {
    if (!changeType) {
      toast.error("変更種別を選択してください");
      return;
    }
    if (isVisitType && !patientName) {
      toast.error("利用者名を入力してください");
      return;
    }
    if (isMeetingType && !meetingName) {
      toast.error("会議名を入力してください");
      return;
    }
    if ((changeType === "visit_change" || changeType === "visit_cancel") && !fromDatetime) {
      toast.error("変更前の日時を入力してください");
      return;
    }

    const payload = {
      changeType,
      team: team || undefined,
      patientName: isVisitType ? patientName : undefined,
      fromDatetime: fromDatetime ? new Date(fromDatetime).toISOString() : undefined,
      toDatetime: toDatetime ? new Date(toDatetime).toISOString() : undefined,
      staffBefore: staffBefore || undefined,
      staffAfter: staffAfter || undefined,
      meetingName: isMeetingType ? meetingName : undefined,
      meetingStaff: isMeetingType && meetingStaff.length > 0 ? JSON.stringify(meetingStaff) : undefined,
      reason: reason || undefined,
    };

    setLastRecord({
      changeType,
      team: team || undefined,
      patientName: isVisitType ? patientName : undefined,
      fromDatetime: fromDatetime ? new Date(fromDatetime).toISOString() : undefined,
      toDatetime: toDatetime ? new Date(toDatetime).toISOString() : undefined,
      staffBefore: staffBefore || undefined,
      staffAfter: staffAfter || undefined,
      meetingName: isMeetingType ? meetingName : undefined,
      meetingStaff: isMeetingType ? meetingStaff : undefined,
      reason: reason || undefined,
    });

    createAndExport.mutate(payload);
  };

  const handleReset = () => {
    setChangeType("");
    setTeam("");
    setPatientName("");
    setFromDatetime("");
    setToDatetime("");
    setStaffBefore("");
    setStaffAfter("");
    setMeetingName("");
    setMeetingStaff([]);
    setReason("");
    setSubmitted(false);
    setLastRecord(null);
  };

  const toggleMeetingStaff = (name: string) => {
    setMeetingStaff(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const selectedTypeInfo = CHANGE_TYPES.find(t => t.value === changeType);

  // 送信完了画面
  if (submitted && lastRecord) {
    const typeInfo = CHANGE_TYPES.find(t => t.value === lastRecord.changeType);
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">送信完了</h2>
          <p className="text-sm text-muted-foreground text-center">
            スケジュール変更連絡を送信し、スプレッドシートに転記しました
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">送信内容の確認</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 flex-shrink-0">変更種別</span>
              <Badge variant="outline" className={cn("text-xs", typeInfo?.color)}>
                {typeInfo?.icon} {typeInfo?.label}
              </Badge>
            </div>
            {lastRecord.team && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">チーム</span>
                <span className="font-medium">{lastRecord.team}</span>
              </div>
            )}
            {lastRecord.patientName && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">利用者名</span>
                <span className="font-medium">{lastRecord.patientName}</span>
              </div>
            )}
            {lastRecord.fromDatetime && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">変更前日時</span>
                <span className="font-medium">{formatDatetime(lastRecord.fromDatetime)}</span>
              </div>
            )}
            {lastRecord.toDatetime && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">変更後日時</span>
                <span className="font-medium">{formatDatetime(lastRecord.toDatetime)}</span>
              </div>
            )}
            {lastRecord.staffBefore && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">変更前担当</span>
                <span className="font-medium">{lastRecord.staffBefore}</span>
              </div>
            )}
            {lastRecord.staffAfter && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">変更後担当</span>
                <span className="font-medium">{lastRecord.staffAfter}</span>
              </div>
            )}
            {lastRecord.meetingName && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">会議名</span>
                <span className="font-medium">{lastRecord.meetingName}</span>
              </div>
            )}
            {lastRecord.meetingStaff && lastRecord.meetingStaff.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">参加スタッフ</span>
                <span className="font-medium">{lastRecord.meetingStaff.join("、")}</span>
              </div>
            )}
            {lastRecord.reason && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">変更理由</span>
                <span className="font-medium">{lastRecord.reason}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={handleReset} className="w-full" size="lg">
          <Plus className="w-4 h-4 mr-2" />
          続けて入力する
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 pt-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">スケジュール変更連絡</h1>
          <p className="text-xs text-muted-foreground">入力後、スプレッドシートに自動転記されます</p>
        </div>
      </div>

      {/* 変更種別選択 */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold">変更の種別を選択</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2">
          {CHANGE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => {
                setChangeType(type.value);
                // 種別変更時に関連フィールドをリセット
                setPatientName("");
                setFromDatetime("");
                setToDatetime("");
                setStaffBefore("");
                setStaffAfter("");
                setMeetingName("");
                setMeetingStaff([]);
                setReason("");
              }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                changeType === type.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <span className="text-xl">{type.icon}</span>
              <span className={cn(
                "text-sm font-medium",
                changeType === type.value ? "text-primary" : "text-foreground"
              )}>
                {type.label}
              </span>
              {changeType === type.value && (
                <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
              )}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* 訪問系フォーム */}
      {isVisitType && (
        <>
          {/* チーム選択 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">チーム</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {TEAMS.filter(t => t !== "事務員" && t !== "全チーム").map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTeam(t);
                      setPatientName("");
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                      team === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 利用者選択（オートコンプリート） */}
          <PatientAutocomplete
            patientList={patientList}
            value={patientName}
            onChange={setPatientName}
          />

          {/* 日時変更 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">日時</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  変更前の日時{(changeType === "visit_change" || changeType === "visit_cancel") && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  type="datetime-local"
                  value={fromDatetime}
                  onChange={(e) => setFromDatetime(e.target.value)}
                />
              </div>
              {changeType !== "visit_cancel" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    変更後の日時{changeType === "visit_add" && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={toDatetime}
                    onChange={(e) => setToDatetime(e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* 担当スタッフ変更（オートコンプリート） */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">担当スタッフ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StaffAutocomplete
                staffList={staffList}
                value={staffBefore}
                onChange={setStaffBefore}
                label="変更前の担当スタッフ"
                placeholder="スタッフ名で検索..."
              />
              <StaffAutocomplete
                staffList={staffList}
                value={staffAfter}
                onChange={setStaffAfter}
                label="変更後の担当スタッフ"
                placeholder="スタッフ名で検索..."
              />
            </CardContent>
          </Card>

          {/* 変更理由 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">変更理由・備考</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="変更の理由や特記事項を入力してください..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* 会議系フォーム */}
      {isMeetingType && (
        <>
          {/* チーム選択 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">対象チーム</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {TEAMS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTeam(t)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                      team === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 会議名 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">
                会議名 <span className="text-destructive">*</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="例：ケアカンファレンス、スタッフ会議..."
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* 日時 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">日時</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {changeType === "meeting_change" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">変更前の日時</Label>
                  <Input
                    type="datetime-local"
                    value={fromDatetime}
                    onChange={(e) => setFromDatetime(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {changeType === "meeting_change" ? "変更後の日時" : "開催日時"}
                </Label>
                <Input
                  type="datetime-local"
                  value={toDatetime}
                  onChange={(e) => setToDatetime(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 参加スタッフ（複数選択） */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />
                参加スタッフ
                {meetingStaff.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{meetingStaff.length}名選択中</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {meetingStaff.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-muted/50 rounded-lg">
                  {meetingStaff.map((name) => (
                    <Badge
                      key={name}
                      variant="secondary"
                      className="gap-1 cursor-pointer hover:bg-destructive/10"
                      onClick={() => toggleMeetingStaff(name)}
                    >
                      {name}
                      <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto">
                {staffList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toggleMeetingStaff(s.name)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all text-left",
                      meetingStaff.includes(s.name)
                        ? "bg-primary/10 border-primary text-primary font-medium"
                        : "bg-card border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {meetingStaff.includes(s.name) && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
              {/* 手動入力（スタッフ一覧にない場合） */}
              <div className="pt-1">
                <Label className="text-xs text-muted-foreground">一覧にない場合は手動入力</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="manual-staff-input"
                    placeholder="スタッフ名を入力..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !meetingStaff.includes(val)) {
                          setMeetingStaff(prev => [...prev, val]);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById("manual-staff-input") as HTMLInputElement;
                      const val = input?.value.trim();
                      if (val && !meetingStaff.includes(val)) {
                        setMeetingStaff(prev => [...prev, val]);
                        input.value = "";
                      }
                    }}
                  >
                    追加
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 変更理由・備考 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">変更理由・備考</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="変更の理由や特記事項を入力してください..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* 入力内容プレビュー（変更種別が選択されている場合） */}
      {changeType && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              入力内容の確認
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 flex-shrink-0">種別</span>
              <span className="font-medium">{selectedTypeInfo?.label}</span>
            </div>
            {team && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">チーム</span>
                <span className="font-medium">{team}</span>
              </div>
            )}
            {patientName && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">利用者</span>
                <span className="font-medium">{patientName}</span>
              </div>
            )}
            {fromDatetime && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">変更前</span>
                <span className="font-medium">{formatDatetime(new Date(fromDatetime).toISOString())}</span>
              </div>
            )}
            {toDatetime && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">変更後</span>
                <span className="font-medium">{formatDatetime(new Date(toDatetime).toISOString())}</span>
              </div>
            )}
            {meetingName && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">会議名</span>
                <span className="font-medium">{meetingName}</span>
              </div>
            )}
            {meetingStaff.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">参加者</span>
                <span className="font-medium">{meetingStaff.join("、")}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 送信ボタン */}
      {changeType && (
        <Button
          onClick={handleSubmit}
          disabled={createAndExport.isPending}
          className="w-full"
          size="lg"
        >
          {createAndExport.isPending ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              送信中...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              送信してスプレッドシートに転記
            </>
          )}
        </Button>
      )}
    </div>
  );
}
