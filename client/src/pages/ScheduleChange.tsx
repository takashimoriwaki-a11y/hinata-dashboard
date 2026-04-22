import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { formatElapsedTime } from "@/hooks/useVoiceInput";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useOfflineQueueContext } from "@/contexts/OfflineQueueContext";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { VoiceHelpDialog } from "@/components/VoiceHelpDialog";
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
import { Calendar } from "@/components/ui/calendar";
import { ja } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  Send,
  Check,
  CheckCircle2,
  X,
  Users,
  FileText,
  Plus,
  Search,
  ChevronDown,
  Save,
  RotateCcw,
  Calendar as CalendarIcon,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";

// 変更種別の定義
const CHANGE_TYPES = [
  { value: "visit_change", label: "訪問日時変更", icon: "🔄", color: "bg-blue-100 text-blue-800 border-blue-200", group: "visit" },
  { value: "visit_cancel", label: "訪問キャンセル", icon: "❌", color: "bg-red-100 text-red-800 border-red-200", group: "visit" },
  { value: "visit_add", label: "訪問追加", icon: "✅", color: "bg-green-100 text-green-800 border-green-200", group: "visit" },
  { value: "meeting_add", label: "会議追加", icon: "📅", color: "bg-purple-100 text-purple-800 border-purple-200", group: "meeting" },
  { value: "meeting_change", label: "会議変更", icon: "📝", color: "bg-orange-100 text-orange-800 border-orange-200", group: "meeting" },
  { value: "schedule_visit", label: "受診", icon: "🏥", color: "bg-cyan-100 text-cyan-800 border-cyan-200", group: "schedule" },
  { value: "schedule_short_stay", label: "ショートステイ", icon: "🏨", color: "bg-teal-100 text-teal-800 border-teal-200", group: "schedule" },
  { value: "schedule_special_instruction", label: "特別指示書", icon: "📋", color: "bg-amber-100 text-amber-800 border-amber-200", group: "schedule" },
  { value: "schedule_hospitalization", label: "入院", icon: "🏩", color: "bg-rose-100 text-rose-800 border-rose-200", group: "schedule" },
  { value: "schedule_discharge", label: "退院", icon: "🚶", color: "bg-emerald-100 text-emerald-800 border-emerald-200", group: "schedule" },
  { value: "schedule_new_contract", label: "新規契約・面談", icon: "🤝", color: "bg-indigo-100 text-indigo-800 border-indigo-200", group: "schedule" },
  { value: "schedule_visit_doctor", label: "訪問診療同席", icon: "👨‍⚕️", color: "bg-violet-100 text-violet-800 border-violet-200", group: "schedule" },
] as const;

type ChangeType = (typeof CHANGE_TYPES)[number]["value"];

// 予定管理種別の固有フィールド設定
type ScheduleFieldVisibility = {
  endDate: boolean;
  startTime: boolean;
  endTime: boolean;
  facilityName: boolean;
  postDischargeEndDate: boolean;
};
const SCHEDULE_FIELD_CONFIG: Partial<Record<ChangeType, ScheduleFieldVisibility>> = {
  schedule_visit:                 { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  schedule_short_stay:            { endDate: true,  startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  schedule_special_instruction:   { endDate: true,  startTime: false, endTime: false, facilityName: false, postDischargeEndDate: false },
  schedule_hospitalization:       { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  schedule_discharge:             { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: true  },
  schedule_new_contract:          { endDate: false, startTime: false, endTime: false, facilityName: false, postDischargeEndDate: false },
  schedule_visit_doctor:          { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
};
const SCHEDULE_START_DATE_LABEL: Partial<Record<ChangeType, string>> = {
  schedule_visit:          "受診日",
  schedule_short_stay:     "開始日",
  schedule_special_instruction: "開始日",
  schedule_hospitalization:      "入院日",
  schedule_discharge:            "退院日",
  schedule_new_contract:         "予定日",
  schedule_visit_doctor:   "予定日",
};

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
  onTeamSelect,
  id,
}: {
  patientList: PatientItem[];
  value: string;
  onChange: (name: string) => void;
  onTeamSelect?: (team: string) => void;
  id?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 音声入力候補選択ダイアログ用state
  const [voiceCandidates, setVoiceCandidates] = useState<PatientItem[]>([]);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);

  // 音声入力で苗字を受け取り自動検索
  const handleVoiceForPatient = (text: string) => {
    // 苗字だけ抽出（「さん」「の」などを除去、最初の単語を使用）
    const cleaned = text.trim().replace(/さん$|の$|で$/, "").split(/[　 、。，．]/)[0];
    if (!cleaned) return;

    // 登録利用者から苗字で完全一致検索（苗字のみ入力想定なので先頭一致を優先）
    const exactMatches = patientList.filter((p) => {
      const nameParts = p.name.split(/[　 ]/);
      return nameParts[0] === cleaned;
    });
    const partialMatches = exactMatches.length > 0
      ? exactMatches
      : patientList.filter((p) => p.name.includes(cleaned));

    if (partialMatches.length === 1) {
      // 1件のみ→即転記
      setQuery(partialMatches[0].name);
      onChange(partialMatches[0].name);
      setOpen(false);
    } else if (partialMatches.length > 1) {
      // 複数候補→選択ダイアログを表示
      setVoiceCandidates(partialMatches);
      setShowVoiceDialog(true);
      setQuery(cleaned);
    } else {
      // 候補なし→ドロップダウンを開いて手動入力へ
      setQuery(cleaned);
      onChange(cleaned);
      setOpen(true);
      setHighlighted(0);
      inputRef.current?.focus();
    }
  };

  const handleVoiceCandidateSelect = (patient: PatientItem) => {
    setQuery(patient.name);
    onChange(patient.name);
    if (patient.team && onTeamSelect) onTeamSelect(patient.team);
    setShowVoiceDialog(false);
    setVoiceCandidates([]);
    setOpen(false);
  };

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
    if (patient.team && onTeamSelect) onTeamSelect(patient.team);
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
          {/* 入力フィールド + 音声入力ボタン */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                id={id}
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
            {/* 音声入力ボタン */}
            <VoiceMicButton
              onResult={handleVoiceForPatient}
              size="sm"
              previewMode="tooltip"
              context="schedule_change"
            />
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

        {/* 音声入力候補選択ダイアログ */}
        {showVoiceDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in-overlay">
            <div className="bg-popover border border-border rounded-2xl shadow-2xl w-[90vw] max-w-sm mx-4 overflow-hidden animate-slide-up-modal">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-sm font-semibold text-foreground">利用者を選択してください</p>
                <p className="text-xs text-muted-foreground mt-0.5">「{voiceCandidates[0]?.name.split(/[　 ]/)[0]}」さんが{voiceCandidates.length}名登録されています</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {voiceCandidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleVoiceCandidateSelect(p)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-primary/10 active:bg-primary/20 transition-colors border-b border-border/50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      {p.nameKana && (
                        <p className="text-xs text-muted-foreground mt-0.5">{p.nameKana}</p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                      {p.team}
                    </span>
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setShowVoiceDialog(false);
                    setVoiceCandidates([]);
                    setOpen(true);
                    inputRef.current?.focus();
                  }}
                  className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  キャンセル（手動で検索）
                </button>
              </div>
            </div>
          </div>
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

// ========== DateTimePickerコンポーネント ==========
function DateTimePicker({
  value,
  onChange,
  label,
  required,
  placeholder = "日時を選択",
  confidence,
  dateOnly = false,
  defaultTimeUnspecified = false,
}: {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  confidence?: 'high' | 'medium' | 'low' | null;
  dateOnly?: boolean;
  defaultTimeUnspecified?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(() => {
    if (!value) {
      const now = new Date();
      return String(now.getHours()).padStart(2, "0");
    }
    return String(new Date(value).getHours()).padStart(2, "0");
  });
  const [minute, setMinute] = useState(() => {
    if (!value) {
      const now = new Date();
      // 10分刻みに丸める
      return String(Math.round(now.getMinutes() / 10) * 10 % 60).padStart(2, "0");
    }
    const m = new Date(value).getMinutes();
    // 10分刻みに丸める
    return String(Math.round(m / 10) * 10 % 60).padStart(2, "0");
  });
  // 時間未定フラグ（defaultTimeUnspecified=trueの場合、初期状態は未定）
  const [timeUnspecified, setTimeUnspecified] = useState(() => {
    if (!value) return defaultTimeUnspecified;
    // 既存の値が日付のみ（YYYY-MM-DD）形式なら未定
    return !value.includes('T');
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (!value) return undefined;
    return new Date(value);
  });

  // valueが外部から変化した際（音声転記等）に、timeUnspecifiedとselectedDateを同期する
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;
    if (!value) {
      setSelectedDate(undefined);
      setTimeUnspecified(defaultTimeUnspecified ?? false);
      return;
    }
    // 値が日付のみ（YYYY-MM-DD）形式ならtimeUnspecified=true、時刻ありならfalse
    const hasTime = value.includes('T');
    setTimeUnspecified(!hasTime);
    const d = new Date(value);
    setSelectedDate(d);
    if (hasTime) {
      setHour(String(d.getHours()).padStart(2, '0'));
      setMinute(String(d.getMinutes()).padStart(2, '0'));
    }
  }, [value, defaultTimeUnspecified]);

  const pad = (n: number) => String(n).padStart(2, "0");

  const applyDateTime = (date: Date | undefined, h: string, m: string, forceTimeUnspecified?: boolean) => {
    if (!date) return;
    const d = new Date(date);
    d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    // forceTimeUnspecifiedが明示的にfalseの場合はstateを無視（setStateのバッチ更新による古い値参照を防ぐ）
    const useTimeUnspecified = forceTimeUnspecified === false ? false : (forceTimeUnspecified || timeUnspecified);
    if (dateOnly || useTimeUnspecified) {
      // 日付のみモード or 時間未定: YYYY-MM-DD形式で返す
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      onChange(iso);
    } else {
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${h}:${m}`;
      onChange(iso);
    }
  };

  const handleDaySelect = (day: Date | undefined) => {
    setSelectedDate(day);
    if (dateOnly && day) {
      // 日付のみモード: 日付選択後すぐに確定してポップオーバーを閉じる
      const d = new Date(day);
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      onChange(iso);
      setOpen(false);
      return;
    }
    if (timeUnspecified && day && !dateOnly) {
      // 時間未定モードかつ日付時刻モード: 日付選択後は時刻セレクトを表示する（時刻入力できるように）
      setTimeUnspecified(false);
      applyDateTime(day, hour, minute, false);
      return;
    }
    applyDateTime(day, hour, minute);
  };

  const handleHourChange = (h: string) => {
    setHour(h);
    setTimeUnspecified(false);
    applyDateTime(selectedDate, h, minute, false);
  };

  const handleMinuteChange = (m: string) => {
    setMinute(m);
    setTimeUnspecified(false);
    applyDateTime(selectedDate, hour, m, false);
  };

  const handleSetTimeUnspecified = () => {
    setTimeUnspecified(true);
    if (selectedDate) {
      const d = new Date(selectedDate);
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      onChange(iso);
    }
  };

  // 時刻未指定かどうかを判定（YYYY-MM-DD形式 or T00:00:00の場合）
  const isTimeUnspecified = value ? (
    !value.includes('T') || value.split('T')[1]?.startsWith('00:00:00') || value.split('T')[1]?.startsWith('00:00')
  ) : false;

  const displayValue = value
    ? (dateOnly || isTimeUnspecified
        ? (() => { const datePart = value.split('T')[0]; const [y, mo, d] = datePart.split('-'); return `${y}/${mo}/${d}`; })()
        : formatDatetime(value.includes("T") ? new Date(value).toISOString() : value))
    : "";

  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

  // 日付を±1日する
  const adjustDay = (delta: number) => {
    if (!value) return;
    const d = new Date(value);
    d.setDate(d.getDate() + delta);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    if (dateOnly) {
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      onChange(iso);
      setSelectedDate(d);
    } else {
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      onChange(iso);
      setSelectedDate(d);
      setHour(pad2(d.getHours()));
      setMinute(pad2(d.getMinutes()));
    }
  };

  // 時刻を±30分する
  const adjustMinutes = (delta: number) => {
    if (!value) return;
    const d = new Date(value);
    d.setMinutes(d.getMinutes() + delta);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    onChange(iso);
    setSelectedDate(d);
    setHour(pad2(d.getHours()));
    setMinute(pad2(d.getMinutes()));
  };

  const confidenceBadge = confidence === 'medium' ? (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 font-medium border border-yellow-200 dark:border-yellow-700 flex-shrink-0">推測</span>
  ) : confidence === 'low' ? (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-medium border border-orange-200 dark:border-orange-700 flex-shrink-0">要確認</span>
  ) : null;

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">
            {label}{required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {confidenceBadge}
        </div>
      )}
      <Popover open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        // ポップオーバーを開いた時、既存値が日付のみ（YYYY-MM-DD）形式であれば時刻セレクトを表示する
        if (isOpen && !dateOnly && value && !value.includes('T')) {
          setTimeUnspecified(false);
        }
      }}>
        <div className="flex items-center gap-1">
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center h-10 px-3 rounded-md border border-input bg-background text-sm text-left font-normal hover:bg-accent hover:text-accent-foreground transition-colors",
                !value && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="flex-1 truncate">{displayValue || placeholder}</span>
            </button>
          </PopoverTrigger>
          {value && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); setSelectedDate(undefined); }}
              className="h-10 w-10 flex items-center justify-center rounded-md border border-input bg-background hover:bg-destructive/10 hover:text-destructive transition-colors flex-shrink-0"
              aria-label="日時をクリア"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <PopoverContent className="w-auto p-0" align="start" avoidCollisions sideOffset={4}>
          <div className="p-3 space-y-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDaySelect}
              locale={ja}
              weekStartsOn={1}
              className="rounded-md border-0"
            />
            {!dateOnly && (
              <div className="border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium">時刻</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSetTimeUnspecified}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded border transition-colors",
                      timeUnspecified
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border bg-muted/50 hover:bg-muted text-muted-foreground"
                    )}
                  >
                    時間未定
                  </button>
                </div>
                {/* timeUnspecifiedがfalse、またはvalueに時刻情報がある場合は時刻セレクトを表示 */}
                {(!timeUnspecified || (value && value.includes('T'))) && (
                  <div className="flex items-center gap-2 mt-2">
                    <Select value={hour} onValueChange={handleHourChange}>
                      <SelectTrigger className="w-20 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        {hours.map(h => (
                          <SelectItem key={h} value={h}>{h}時</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground font-medium">:</span>
                    <Select value={minute} onValueChange={handleMinuteChange}>
                      <SelectTrigger className="w-20 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        {minutes.map(m => (
                          <SelectItem key={m} value={m}>{m}分</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => setOpen(false)}
                    >
                      決定
                    </Button>
                  </div>
                )}
                {timeUnspecified && (
                  <p className="text-xs text-muted-foreground mt-2">時間を選択すると自動で解除されます</p>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {/* 音声入力後のクイック修正ボタン */}
      {value && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs text-muted-foreground">日付:</span>
          <button
            type="button"
            onClick={() => adjustDay(-1)}
            className="text-xs px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors"
          >−1日</button>
          <button
            type="button"
            onClick={() => adjustDay(1)}
            className="text-xs px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors"
          >+1日</button>
          {!dateOnly && !isTimeUnspecified && (
            <>
              <span className="text-xs text-muted-foreground ml-2">時刻:</span>
              <button
                type="button"
                onClick={() => adjustMinutes(-30)}
                className="text-xs px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors"
              >−30分</button>
              <button
                type="button"
                onClick={() => adjustMinutes(30)}
                className="text-xs px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors"
              >+30分</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ========== 会議参加スタッフ複数選択オートコンプリート ==========
type StaffItem2 = { id: number; name: string; team?: string | null };

function MultiStaffAutocomplete({
  staffList,
  selected,
  onToggle,
  selectedTeam,
}: {
  staffList: StaffItem2[];
  selected: string[];
  onToggle: (name: string) => void;
  selectedTeam?: string;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manualInput, setManualInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // チーム選択時: そのチーム + 全チームのスタッフを優先表示（デフォルト一覧）
  const defaultList = useMemo(() => {
    if (!selectedTeam || selectedTeam === "全チーム") return staffList;
    return staffList.filter(s => s.team === selectedTeam || s.team === "全チーム");
  }, [staffList, selectedTeam]);

  const filtered = useMemo(() => {
    const base = query.trim() ? staffList : defaultList;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return staffList.filter(s => s.name.toLowerCase().includes(q));
  }, [staffList, defaultList, query]);

  const handleAddManual = () => {
    const val = manualInput.trim();
    if (val && !selected.includes(val)) {
      onToggle(val);
      setManualInput("");
    }
  };

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  return (
    <div className="space-y-3">
      {/* 選択済みスタッフのバッジ表示 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-primary/5 rounded-lg border border-primary/20">
          {selected.map((name) => (
            <Badge
              key={name}
              variant="secondary"
              className="gap-1 cursor-pointer bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => onToggle(name)}
            >
              {name}
              <X className="w-3 h-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* プルダウントリガー */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(prev => !prev)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors"
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground"}>
            {selected.length === 0 ? "スタッフを選択..." : `${selected.length}名選択中`}
          </span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", dropdownOpen && "rotate-180")} />
        </button>

        {/* ドロップダウンリスト */}
        {dropdownOpen && (
          <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg">
            {/* 検索入力 */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="スタッフ名で絞り込み..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            {/* スタッフ一覧 */}
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-3">該当なし</p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onToggle(s.name)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors",
                      selected.includes(s.name)
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                      selected.includes(s.name) ? "bg-primary border-primary" : "border-border"
                    )}>
                      {selected.includes(s.name) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span>{s.name}</span>
                    {s.team && <span className="ml-auto text-xs text-muted-foreground">{s.team}</span>}
                  </button>
                ))
              )}
            </div>
            {/* 手動入力 */}
            <div className="p-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">一覧にない場合は手動入力</p>
              <div className="flex gap-1.5">
                <Input
                  className="h-8 text-sm"
                  placeholder="スタッフ名を入力..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddManual(); } }}
                  onClick={(e) => e.stopPropagation()}
                />
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={handleAddManual}>追加</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 下書き自動保存のキー ==========
const DRAFT_KEY = "hinata_schedule_change_draft";

type DraftData = {
  changeType: ChangeType | "";
  team: Team | "";
  patientName: string;
  fromDatetime: string;
  toDatetime: string;
  staffBefore: string;
  staffAfter: string;
  meetingName: string;
  meetingStaff: string[];
  reason: string;
  savedAt: number;
};

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function saveDraft(data: Omit<DraftData, "savedAt">) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // localStorageが使えない場合は無視
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 無視
  }
}

function formatSavedAt(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ========== メインコンポーネント ==========

export default function ScheduleChange() {
  const { user } = useAuth();
  const { isOffline } = useNetworkStatus();
  const { enqueueOffline } = useOfflineQueueContext();
  const [, setLocation] = useLocation();

  // 初期値：下書きがあれば後で復元バナーを表示する
  const [hasDraft, setHasDraft] = useState(() => {
    const d = loadDraft();
    return d !== null && (d.changeType !== "" || d.patientName !== "" || d.meetingName !== "");
  });
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(() => {
    const d = loadDraft();
    return d ? d.savedAt : null;
  });
  const [draftRestored, setDraftRestored] = useState(false);

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
  // 予定管理固有フィールド
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [scheduleEndTime, setScheduleEndTime] = useState("");
  const [scheduleFacilityName, setScheduleFacilityName] = useState("");
  const [schedulePostDischargeEndDate, setSchedulePostDischargeEndDate] = useState("");
  const [scheduleNewContractTargetName, setScheduleNewContractTargetName] = useState(""); // 新規契約・面談の対象者名（直接入力）
  const [scheduleNewContractStaff, setScheduleNewContractStaff] = useState<string[]>([]); // 新規契約・面談の対応スタッフ（複数選択）

  // 退院日が変更されたら退院後3か月終了日を自動計算
  const handleScheduleStartDateChange = (value: string) => {
    setScheduleStartDate(value);
    if (changeType === "schedule_discharge" && value) {
      // 3か月後の同日に設定し、その前日を取得（例: 5/1 → 8/1の前日 = 7/31）
      const d = new Date(value);
      d.setMonth(d.getMonth() + 3);
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      setSchedulePostDischargeEndDate(`${y}-${m}-${day}`);
    }
    // 特別指示書: 開始日から14日後を終了日に自動設定
    if (changeType === "schedule_special_instruction" && value) {
      const d = new Date(value);
      d.setDate(d.getDate() + 13); // 開始日を含めて14日後 = 開始日+13日
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      setScheduleEndDate(`${y}-${m}-${day}`);
    }
  };
  // ログインユーザーの所属チームをデフォルトに設定（初回のみ）
  useEffect(() => {
    if (!user?.team) return;
    const validTeams: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
    if (validTeams.includes(user.team as Team)) {
      setTeam(prev => (prev === "" ? user.team as Team : prev));
    }
    // 「全チーム」「事務員」は未選択のまま（変更連絡は特定チームを選ぶ必要があるため）
  }, [user?.team]);
  // 音声入力関連ステート
  const [voiceText, setVoiceText] = useState("");
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceInterimText, setVoiceInterimText] = useState("");
  // 録音経過時間
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const voiceElapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isVoiceRecording) {
      setVoiceElapsedSeconds(0);
      voiceElapsedTimerRef.current = setInterval(() => setVoiceElapsedSeconds(s => s + 1), 1000);
    } else {
      if (voiceElapsedTimerRef.current) { clearInterval(voiceElapsedTimerRef.current); voiceElapsedTimerRef.current = null; }
    }
    return () => { if (voiceElapsedTimerRef.current) { clearInterval(voiceElapsedTimerRef.current); voiceElapsedTimerRef.current = null; } };
  }, [isVoiceRecording]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [missingVoiceFields, setMissingVoiceFields] = useState<string[]>([]);
  // 音声入力後の利用者候補選択ダイアログ用
  const [voicePatientCandidates, setVoicePatientCandidates] = useState<PatientItem[]>([]);
  const [showVoicePatientDialog, setShowVoicePatientDialog] = useState(false);
  // 候補選択後に適用するその他のフィールドを一時保存
  const [pendingVoiceFields, setPendingVoiceFields] = useState<{ appliedCount: number } | null>(null);
  // 日時解析信頼度スコア
  const [fromDatetimeConfidence, setFromDatetimeConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [toDatetimeConfidence, setToDatetimeConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  // 誤変換報告・転記完了フラグ
  const [voiceTranscribed, setVoiceTranscribed] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackWrongField, setFeedbackWrongField] = useState("");
  const [feedbackWrongValue, setFeedbackWrongValue] = useState("");
  const [feedbackCorrectValue, setFeedbackCorrectValue] = useState("");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  // 下書き自動保存（入力変更から800msデバウンス）
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDraftSave = (data: Omit<DraftData, "savedAt">) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const hasContent = data.changeType !== "" || data.patientName !== "" || data.meetingName !== "";
      if (hasContent) {
        saveDraft(data);
        setDraftSavedAt(Date.now());
        setHasDraft(false); // 復元バナーは非表示に（既に復元済みまたは新規入力中）
      }
    }, 800);
  };
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
    { enabled: changeType === "visit_change" || changeType === "visit_cancel" || changeType === "visit_add" || changeType.startsWith("schedule_") }
  );
  // 音声入力用: チーム絞り込みなしで全利用者を常時取得（changeType未選択時でも苗字マッチングできるように）
  const { data: allPatientListForVoice = [] } = trpc.patients.list.useQuery(
    { team: undefined },
    { staleTime: 60_000 }
  );

  // 下書き保存のトリガー（各入力変更時に呼び出す）
  const triggerDraftSave = useCallback((overrides?: Partial<Omit<DraftData, "savedAt">>) => {
    scheduleDraftSave({
      changeType: overrides?.changeType ?? changeType,
      team: overrides?.team ?? team,
      patientName: overrides?.patientName ?? patientName,
      fromDatetime: overrides?.fromDatetime ?? fromDatetime,
      toDatetime: overrides?.toDatetime ?? toDatetime,
      staffBefore: overrides?.staffBefore ?? staffBefore,
      staffAfter: overrides?.staffAfter ?? staffAfter,
      meetingName: overrides?.meetingName ?? meetingName,
      meetingStaff: overrides?.meetingStaff ?? meetingStaff,
      reason: overrides?.reason ?? reason,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeType, team, patientName, fromDatetime, toDatetime, staffBefore, staffAfter, meetingName, meetingStaff, reason]);

  // 下書き復元処理
  const handleRestoreDraft = () => {
    const draft = loadDraft();
    if (!draft) return;
    setChangeType(draft.changeType);
    setTeam(draft.team);
    setPatientName(draft.patientName);
    setFromDatetime(draft.fromDatetime);
    setToDatetime(draft.toDatetime);
    setStaffBefore(draft.staffBefore);
    setStaffAfter(draft.staffAfter);
    setMeetingName(draft.meetingName);
    setMeetingStaff(draft.meetingStaff);
    setReason(draft.reason);
    setHasDraft(false);
    setDraftRestored(true);
    toast.success("下書きを復元しました");
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setHasDraft(false);
    setDraftSavedAt(null);
    toast("下書きを削除しました");
  };

  // 送信ミューテーション
  const createAndExport = trpc.scheduleChanges.createAndExport.useMutation({
    onSuccess: (data) => {
      if (data.exported) {
        toast.success("スケジュール変更連絡を送信し、スプレッドシートに転記しました");
      } else {
        toast.success("スケジュール変更連絡を送信しました（スプレッドシート転記は後で実行されます）");
      }
      // 確認画面をスキップしてフォームリセット状態に戻る（setSubmitted(true)を呼ばない）
      // 転送後に誤変換報告関連のステートもリセット（転送後は誤変換報告を表示しない）
      setVoiceTranscribed(false);
      setFeedbackSent(false);
      // 転送後にフォームを自動リセット（全フィールドをクリア）
      clearDraft();
      setDraftSavedAt(null);
      setDraftRestored(false);
      setChangeType("");
      // リセット後もログインユーザーの所属チームを再設定（全チーム・事務員は未選択）
      const validTeamsOnReset: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
      setTeam(user?.team && validTeamsOnReset.includes(user.team as Team) ? user.team as Team : "");
      setPatientName("");
      setFromDatetime("");
      setToDatetime("");
      setStaffBefore("");
      setStaffAfter("");
      setMeetingName("");
      setMeetingStaff([]);
      setReason("");
      setScheduleStartDate("");
      setScheduleEndDate("");
      setScheduleStartTime("");
      setScheduleEndTime("");
      setScheduleFacilityName("");
      setSchedulePostDischargeEndDate("");
      setScheduleNewContractTargetName("");
      setScheduleNewContractStaff([]);
      // 音声入力関連のstateも全てリセット
      setVoiceText("");
      setVoiceError(null);
      setMissingVoiceFields([]);
      setVoicePatientCandidates([]);
      setShowVoicePatientDialog(false);
      setPendingVoiceFields(null);
      setVoiceInterimText("");
    },
    onError: (err) => {
      toast.error(`送信に失敗しました: ${err.message}`);
    },
  });

  const isVisitType = changeType === "visit_change" || changeType === "visit_cancel" || changeType === "visit_add";
  const isMeetingType = changeType === "meeting_add" || changeType === "meeting_change";
  const isScheduleType = changeType.startsWith("schedule_");
  const scheduleFieldConfig = isScheduleType ? SCHEDULE_FIELD_CONFIG[changeType as ChangeType] : undefined;
  const scheduleStartDateLabel = isScheduleType ? (SCHEDULE_START_DATE_LABEL[changeType as ChangeType] ?? "予定日") : "予定日";

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
    if (isScheduleType && changeType === "schedule_new_contract" && !scheduleNewContractTargetName) {
      toast.error("対象者名を入力してください");
      return;
    }
    if (isScheduleType && changeType !== "schedule_new_contract" && !patientName) {
      toast.error("利用者名を入力してください");
      return;
    }
    if (isScheduleType && !scheduleStartDate) {
      toast.error(`${scheduleStartDateLabel}を入力してください`);
      return;
    }

    // 予定管理固有フィールドを備考欄にまとめる
    let scheduleNotes = "";
    if (isScheduleType) {
      const parts: string[] = [];
      if (scheduleStartDate) parts.push(`${scheduleStartDateLabel}: ${scheduleStartDate}`);
      if (scheduleFieldConfig?.endDate && scheduleEndDate) parts.push(`終了日: ${scheduleEndDate}`);
      if (scheduleFieldConfig?.startTime && scheduleStartTime) parts.push(`開始時刻: ${scheduleStartTime}`);
      if (scheduleFieldConfig?.endTime && scheduleEndTime) parts.push(`終了時刻: ${scheduleEndTime}`);
      if (scheduleFieldConfig?.facilityName && scheduleFacilityName) parts.push(`施設名: ${scheduleFacilityName}`);
      if (scheduleFieldConfig?.postDischargeEndDate && schedulePostDischargeEndDate) parts.push(`退院後3か月終了日（週５訪問）: ${schedulePostDischargeEndDate}`);
      if (changeType === "schedule_new_contract" && scheduleNewContractStaff.length > 0) parts.push(`対応スタッフ: ${scheduleNewContractStaff.join("、")}`);
      if (reason) parts.push(`備考: ${reason}`);
      scheduleNotes = parts.join(" / ");
    }

    const payload = {
      changeType,
      team: team || undefined,
      patientName: isVisitType ? patientName : (isScheduleType && changeType !== "schedule_new_contract") ? patientName : (changeType === "schedule_new_contract" ? scheduleNewContractTargetName : isMeetingType ? (patientName || undefined) : undefined),
      fromDatetime: fromDatetime ? new Date(fromDatetime).toISOString() : undefined,
      toDatetime: toDatetime ? new Date(toDatetime).toISOString() : undefined,
      staffBefore: staffBefore || undefined,
      staffAfter: staffAfter || undefined,
      meetingName: isMeetingType ? meetingName : undefined,
      meetingStaff: isMeetingType && meetingStaff.length > 0 ? JSON.stringify(meetingStaff) : undefined,
      reason: isScheduleType ? (scheduleNotes || undefined) : (reason || undefined),
      // 予定管理固有フィールド
      scheduleFacility: isScheduleType && scheduleFieldConfig?.facilityName ? (scheduleFacilityName || undefined) : undefined,
      scheduleStartDate: isScheduleType ? (scheduleStartDate || undefined) : undefined,
      scheduleEndDate: isScheduleType && scheduleFieldConfig?.endDate ? (scheduleEndDate || undefined) : undefined,
      schedulePostDischargeEndDate: isScheduleType && scheduleFieldConfig?.postDischargeEndDate ? (schedulePostDischargeEndDate || undefined) : undefined,
      scheduleTargetName: changeType === "schedule_new_contract" ? (scheduleNewContractTargetName || undefined) : undefined,
      scheduleStaff: isScheduleType && scheduleNewContractStaff.length > 0 ? JSON.stringify(scheduleNewContractStaff) : undefined,
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

    // オフライン中はキューに保存して後で送信
    if (isOffline) {
      enqueueOffline("scheduleChanges.createAndExport", payload);
      clearDraft();
      setDraftSavedAt(null);
      setDraftRestored(false);
      setChangeType("");
      const validTeamsOnReset: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
      setTeam(user?.team && validTeamsOnReset.includes(user.team as Team) ? user.team as Team : "");
      setPatientName("");
      setFromDatetime("");
      setToDatetime("");
      setStaffBefore("");
      setStaffAfter("");
      setMeetingName("");
      setMeetingStaff([]);
      setReason("");
      setScheduleStartDate("");
      setScheduleEndDate("");
      setScheduleStartTime("");
      setScheduleEndTime("");
      setScheduleFacilityName("");
      setSchedulePostDischargeEndDate("");
      setScheduleNewContractTargetName("");
      setScheduleNewContractStaff([]);
      setVoiceTranscribed(false);
      setFeedbackSent(false);
      return;
    }
    createAndExport.mutate(payload);
  };

  const handleReset = () => {
    clearDraft(); // リセット時に下書き削除
    setDraftSavedAt(null);
    setDraftRestored(false);
    setChangeType("");
    // リセット後もログインユーザーの所属チームを再設定（全チーム・事務員は未選択）
    const validTeamsOnReset: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
    setTeam(user?.team && validTeamsOnReset.includes(user.team as Team) ? user.team as Team : "");
    setPatientName("");
    setFromDatetime("");
    setToDatetime("");
    setStaffBefore("");
    setStaffAfter("");
    setMeetingName("");
    setMeetingStaff([]);
    setReason("");
    setScheduleStartDate("");
    setScheduleEndDate("");
    setScheduleStartTime("");
    setScheduleEndTime("");
    setScheduleFacilityName("");
    setSchedulePostDischargeEndDate("");
    setScheduleNewContractTargetName("");
    setScheduleNewContractStaff([]);
    setSubmitted(false);
    setLastRecord(null);
    setMissingVoiceFields([]);
    setVoiceText("");
    setVoiceInterimText("");
    setVoiceTranscribed(false);
    setVoicePatientCandidates([]);
  };

  // 音声入力テキストをLLMで解析しフォームに自動転記
  const reportFeedback = trpc.voiceFeedback.report.useMutation({
    onSuccess: () => {
      setShowFeedbackDialog(false);
      setFeedbackSent(true);
      // 8秒後に自動的にフォローアップカードを非表示にする
      setTimeout(() => setFeedbackSent(false), 8000);
    },
    onError: (err) => {
      toast.error(`報告に失敗しました: ${err.message}`);
    },
  });

  const parseVoice = trpc.scheduleChanges.parseVoice.useMutation({
    onSuccess: (data) => {
      const f = data.fields;
      let applied = 0;
      const missing: string[] = [];

      // changeType（空欄のみ上書き）
      const allValidChangeTypes = [
        "visit_change", "visit_cancel", "visit_add", "meeting_add", "meeting_change",
        "schedule_visit", "schedule_short_stay", "schedule_special_instruction",
        "schedule_hospitalization", "schedule_discharge", "schedule_new_contract",
        "schedule_visit_doctor"
      ];
      // 音声入力時のschedule判定: LLMが返したchangeType、または現在選択中のchangeTypeがschedule_系なら予定登録系として扱う
      const isScheduleTypeVoice = (f.changeType?.startsWith("schedule_") ?? false) || changeType.startsWith("schedule_");
      // 音声入力時のmeeting/visit判定: LLMが返したchangeTypeも考慮（changeTypeが未選択の場合でも正しく判定）
      const isMeetingTypeVoice = f.changeType === "meeting_add" || f.changeType === "meeting_change" || changeType === "meeting_add" || changeType === "meeting_change";
      const isVisitCancelVoice = f.changeType === "visit_cancel" || changeType === "visit_cancel";
      const isVisitAddVoice = f.changeType === "visit_add" || changeType === "visit_add";
      if (f.changeType && allValidChangeTypes.includes(f.changeType)) {
        setChangeType(prev => prev === "" ? f.changeType as ChangeType : prev);
        applied++;
      } else {
        missing.push("変更種別（日時変更・キャンセル・追加等・予定登録）");
      }

      // チームが必要かどうかを種別で判断
      // 不要: 新規契約・面談（UIなし）、会議追加（任意）
      const teamNotRequired =
        f.changeType === "schedule_new_contract" ||
        changeType === "schedule_new_contract" ||
        f.changeType === "meeting_add" ||
        changeType === "meeting_add" ||
        f.changeType === "meeting_change" ||
        changeType === "meeting_change";

      if (f.team) {
        if (["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"].includes(f.team)) {
          // チーム名は明示的に話した場合は常に反映（補完時に上書きできるよう）
          setTeam(f.team as Team);
          applied++;
        } else if (!teamNotRequired) {
          missing.push("チーム名（身体・天理・郡山北部・郡山南部）");
        }
      } else if (!teamNotRequired) {
        missing.push("チーム名（身体・天理・郡山北部・郡山南部）");
      }

      if (f.fromDatetime) {
        if (isScheduleTypeVoice) {
          // 予定登録系: fromDatetimeをscheduleStartDateに転記
          // 新規契約・面談・訪問診療同席は時間情報も保持（ISO形式）、それ以外は日付のみ
          const isScheduleWithTimeVoice = [
            "schedule_new_contract", "schedule_visit_doctor", "schedule_visit"
          ].includes(f.changeType || changeType);
          const fromIsoVoice = f.fromDatetime!;
          const fromTimeStrVoice = fromIsoVoice.split('T')[1] || '';
          const fromIsTimeUnspecifiedVoice = fromTimeStrVoice.startsWith('00:00:00') || fromTimeStrVoice.startsWith('00:00');
          let startDateValue: string;
          if (isScheduleWithTimeVoice && !fromIsTimeUnspecifiedVoice) {
            // 時間あり：ISO形式で転記
            startDateValue = fromIsoVoice;
          } else {
            // 時間なし or 時間未指定：日付のみ
            startDateValue = fromIsoVoice.split('T')[0];
          }
          const startDateOnly = fromIsoVoice.split('T')[0];
          setScheduleStartDate(prev => prev.trim() ? prev : startDateValue);
          // 退院の場合、退院後3か月終了日を自動計算（未入力の場合のみ）
          if (f.changeType === "schedule_discharge" && f.fromDatetime) {
            setSchedulePostDischargeEndDate(prev => {
              if (prev.trim()) return prev; // 既に入力済みなら上書きしない
              try {
                const d = new Date(startDateOnly);
                // 3か月後の同日に設定し、その前日を取得（例: 5/1 → 8/1の前日 = 7/31）
                d.setMonth(d.getMonth() + 3);
                d.setDate(d.getDate() - 1);
                const y = d.getFullYear();
                const mo = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                return `${y}-${mo}-${day}`;
              } catch { return prev; }
            });
          }
          // 特別指示書の場合、開始日から14日後を終了日に自動計算（未入力の場合のみ）
          const voiceChangeType = f.changeType || changeType;
          if (voiceChangeType === "schedule_special_instruction" && f.fromDatetime) {
            setScheduleEndDate(prev => {
              if (prev.trim()) return prev; // 既に入力済みなら上書きしない
              try {
                const d = new Date(f.fromDatetime!);
                d.setDate(d.getDate() + 13); // 開始日を含めて14日後
                const y = d.getFullYear();
                const mo = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                return `${y}-${mo}-${day}`;
              } catch { return prev; }
            });
          }
        } else {
          // 時刻未指定の場合（T00:00:00）は日付のみを転記（時刻は未定に）
          const fromIso = f.fromDatetime!;
          const fromTimeStr = fromIso.split('T')[1] || '';
          const fromIsTimeUnspecified = fromTimeStr.startsWith('00:00:00') || fromTimeStr.startsWith('00:00');
          if (fromIsTimeUnspecified) {
            // 日付のみをYYYY-MM-DD形式で転記（DateTimePickerは日付のみを表示、時刻は空欄）
            const dateOnly = fromIso.split('T')[0];
            setFromDatetime(prev => prev.trim() ? prev : dateOnly);
          } else {
            setFromDatetime(prev => prev.trim() ? prev : fromIso);
          }
        }
        applied++;
      } else if (!isScheduleTypeVoice && !isVisitCancelVoice && !isVisitAddVoice && !isMeetingTypeVoice) { missing.push("変更前日時"); }
      // 信頼度スコアを保存
      const fConf = (f as Record<string, unknown>).fromDatetimeConfidence as 'high' | 'medium' | 'low' | null;
      const tConf = (f as Record<string, unknown>).toDatetimeConfidence as 'high' | 'medium' | 'low' | null;
      if (fConf) setFromDatetimeConfidence(fConf);
      if (tConf) setToDatetimeConfidence(tConf);

      if (f.toDatetime) {
        if (isScheduleTypeVoice) {
          // 予定登録系: toDatetimeをscheduleEndDateに転記（日付部分のみ YYYY-MM-DD）
          const endDateOnly = f.toDatetime!.split('T')[0];
          setScheduleEndDate(prev => prev.trim() ? prev : endDateOnly);
        } else {
          // 時刻未指定の場合（T00:00:00）は日付のみを転記
          const toIso = f.toDatetime!;
          const toTimeStr = toIso.split('T')[1] || '';
          const toIsTimeUnspecified = toTimeStr.startsWith('00:00:00') || toTimeStr.startsWith('00:00');
          if (toIsTimeUnspecified) {
            const dateOnly = toIso.split('T')[0];
            setToDatetime(prev => prev.trim() ? prev : dateOnly);
          } else {
            setToDatetime(prev => prev.trim() ? prev : toIso);
          }
        }
        applied++;
      }
      // toDatetimeはキャンセル時は不要なので missing には追加しない

      if (f.staffBefore) { setStaffBefore(prev => prev.trim() ? prev : f.staffBefore!); applied++; }
      if (f.staffAfter) { setStaffAfter(prev => prev.trim() ? prev : f.staffAfter!); applied++; }
      if (f.meetingName) { setMeetingName(prev => prev.trim() ? prev : f.meetingName!); applied++; }
      if (f.meetingStaff && Array.isArray(f.meetingStaff) && f.meetingStaff.length > 0) {
        if (isScheduleTypeVoice && f.changeType === "schedule_new_contract") {
          // 新規契約・面談の対応スタッフ：スタッフリストとファジーマッチング
          const resolvedStaff: string[] = [];
          for (const voiceName of f.meetingStaff!) {
            // 1. 完全一致
            const exactMatch = staffList.find((s: { name: string }) => s.name === voiceName);
            if (exactMatch) { resolvedStaff.push(exactMatch.name); continue; }
            // 2. 苗字先頭一致（苗字のみ言った場合）
            const lastNameMatches = staffList.filter((s: { name: string }) => {
              const parts = s.name.split(/[\s　]/);
              return parts[0] === voiceName;
            });
            if (lastNameMatches.length === 1) { resolvedStaff.push(lastNameMatches[0].name); continue; }
            // 3. 部分一致
            const partialMatches = staffList.filter((s: { name: string }) => s.name.includes(voiceName));
            if (partialMatches.length === 1) { resolvedStaff.push(partialMatches[0].name); continue; }
            // 4. 一致なしの場合は音声認識結果をそのまま使用
            resolvedStaff.push(voiceName);
          }
          if (resolvedStaff.length > 0) {
            setScheduleNewContractStaff(prev => prev.length > 0 ? prev : resolvedStaff);
            applied++;
          }
        } else {
          setMeetingStaff(prev => prev.length > 0 ? prev : f.meetingStaff!);
          applied++;
        }
      }
      if (f.reason) { setReason(prev => prev.trim() ? prev : f.reason!); applied++; }

      // 予定登録系の固有フィールド転記
      const scheduleFacility = (f as Record<string, unknown>).scheduleFacilityName as string | null;
      const schedulePostDischarge = (f as Record<string, unknown>).schedulePostDischargeEndDate as string | null;
      const scheduleTargetNameFromLLM = (f as Record<string, unknown>).scheduleTargetName as string | null;
      if (isScheduleTypeVoice) {
        if (scheduleFacility) {
          setScheduleFacilityName(prev => prev.trim() ? prev : scheduleFacility);
          // 訪問診療同席の場合は医療機関名を備考欄にも転記
          if ((f.changeType || changeType) === "schedule_visit_doctor") {
            setReason(prev => prev.trim() ? prev : `医療機関名: ${scheduleFacility}`);
          }
          applied++;
        }
        if (schedulePostDischarge) { setSchedulePostDischargeEndDate(prev => prev.trim() ? prev : schedulePostDischarge); applied++; }
        // 新規契約・面談の対象者名：LLMがscheduleTargetNameを返した場合はそちらを優先し、なければpatientNameを使用
        if (f.changeType === "schedule_new_contract") {
          const targetName = scheduleTargetNameFromLLM || f.patientName || null;
          if (targetName) {
            setScheduleNewContractTargetName(prev => prev.trim() ? prev : targetName);
            applied++;
          }
        }
      }

        // 利用者名処理: patientLastName または patientName で登録利用者から検索して連携
      // ※ 苗字だけ伝えた場合も含め、常に登録利用者から検索し、直接転記しない
      // ※ 新規契約・面談は利用者DB連携不要（対象者名は直接入力）
      const lastName = (f as Record<string, unknown>).patientLastName as string | null;
      const searchKey = lastName || f.patientName || null;

      if (searchKey && changeType !== "schedule_new_contract") {
        // patientListRef.currentを使用（クロージャ問題回避・最新リストを参照）
        const currentPatientList = patientListRef.current;
        // 1. 苗字の先頭一致検索（スペース区切りの最初のトークン）
        const exactMatches = currentPatientList.filter((p: PatientItem) => {
          const parts = p.name.split(/[　 ]/);
          return parts[0] === searchKey;
        });
        // 2. 完全一致検索（フルネームが渡された場合）
        const fullNameMatches = currentPatientList.filter((p: PatientItem) => p.name === searchKey);
        // 3. 部分一致検索（フォールバック）
        const partialMatches = currentPatientList.filter((p: PatientItem) => p.name.includes(searchKey));

        // 優先順位: フルネーム完全一致 > 苗字先頭一致 > 部分一致
        const candidates = fullNameMatches.length > 0
          ? fullNameMatches
          : exactMatches.length > 0
            ? exactMatches
            : partialMatches;

        if (candidates.length === 1) {
          // 1件一致 → 即転記
          setPatientName(candidates[0].name);
          applied++;
          // チームも自動セット（未選択の場合）
          if (!team && candidates[0].team) {
            setTeam(candidates[0].team as Team);
            // チームが自動セットされた場合は missing からチーム名を除去
            const idx = missing.indexOf("チーム名（身体・天理・郡山北部・郡山南部）");
            if (idx !== -1) missing.splice(idx, 1);
          }
          setMissingVoiceFields(missing);
          setIsParsingVoice(false);
          setVoiceTranscribed(true);
          if (missing.length === 0) {
            toast.success(`音声内容を${applied}項目に自動転記しました`);
          }
          // 転記されたフィールドを黄色フラッシュでハイライト
          const flashScIds: string[] = [];
          if (f.changeType) flashScIds.push("sc-change-type-card");
          if (f.team) flashScIds.push("sc-team-card");
          if (f.patientName || searchKey) flashScIds.push("sc-patient-input");
          if (f.fromDatetime) flashScIds.push("sc-datetime-card");
          if (f.reason) flashScIds.push("sc-reason-card");
          setTimeout(() => {
            flashScIds.forEach((id) => {
              const el = document.getElementById(id);
              if (el) {
                el.classList.remove("field-flash");
                void el.offsetWidth;
                el.classList.add("field-flash");
                el.addEventListener("animationend", () => el.classList.remove("field-flash"), { once: true });
              }
            });
          }, 100);
        } else if (candidates.length > 1) {
          // 複数候補 → 候補選択ダイアログ
          setPendingVoiceFields({ appliedCount: applied });
          setVoicePatientCandidates(candidates);
          setShowVoicePatientDialog(true);
          setMissingVoiceFields(missing);
          setIsParsingVoice(false);
          setVoiceTranscribed(true);
          // 候補選択待ちのときはトーストなし（ダイアログが表示される）
        } else {
          // 候補なし → 登録外の利用者として AI 返却値をそのまま転記
          if (f.patientName) { setPatientName(f.patientName); applied++; }
          else { missing.push("利用者名"); }
          setMissingVoiceFields(missing);
          setIsParsingVoice(false);
          setVoiceTranscribed(true);
          if (missing.length === 0 && applied > 0) {
            toast.success(`音声内容を${applied}項目に自動転記しました（利用者は登録外）`);
          } else if (applied === 0 && missing.length === 0) {
            toast("認識できた項目がありませんでした。もう一度お試しください。");
          }
        }
      } else {
        // 利用者名なしのケース（会議系は利用者名が任意なのでmissingに追加しない）
        if (!isMeetingTypeVoice) missing.push("利用者名");
        setMissingVoiceFields(missing);
        setIsParsingVoice(false);
        setVoiceTranscribed(true);
        if (missing.length === 0 && applied > 0) {
          toast.success(`音声内容を${applied}項目に自動転記しました`);
        }
      }
    },
    onError: (err) => {
      setIsParsingVoice(false);
      setVoiceError(err.message || "AI解析に失敗しました");
    },
  });

  // patientListRef: 音声入力用に全利用者リスト（チーム絞り込みなし）を使用
  const patientListRef = useRef(allPatientListForVoice);
  useEffect(() => { patientListRef.current = allPatientListForVoice; }, [allPatientListForVoice]);
  const staffListRef = useRef(staffList);
  useEffect(() => { staffListRef.current = staffList; }, [staffList]);

  // 音声解析完了後に音声入力カードへ自動スクロール
  useEffect(() => {
    if (voiceTranscribed) {
      setTimeout(() => {
        const el = document.getElementById("sc-voice-card");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [voiceTranscribed]);

  const handleVoiceResult = useCallback((text: string) => {
    setVoiceError(null);
    setVoiceText(text);
    setIsParsingVoice(true);
    // patientListRef.currentは全利用者リスト（チーム絞り込みなし）を参照
    const namesWithKana = patientListRef.current.map((p) => ({ name: p.name, kana: (p as { nameKana?: string | null }).nameKana ?? '' }));
    const staffNames = staffListRef.current.map((s: { name: string }) => s.name);
    parseVoice.mutate({ text, patientNamesWithKana: namesWithKana, staffNames });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        <div className="flex gap-3">
          <Button onClick={handleReset} className="flex-1" size="lg" variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            続けて入力する
          </Button>
          <Button
            onClick={() => setLocation("/")}
            className="flex-1"
            size="lg"
          >
            ホームへ戻る
          </Button>
        </div>
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-foreground">連絡・予定登録</h1>
            {/* 自動保存インジケーター */}
            {draftSavedAt && !hasDraft && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Save className="w-3 h-3" />
                <span>{formatSavedAt(draftSavedAt)}保存</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">入力後、スプレッドシートに自動転記されます</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* リセットボタン */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm("入力内容をリセットしますか？")) {
                handleReset();
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            リセット
          </button>
        </div>
      </div>


      {/* 変更種別選択 */}
      <Card id="sc-change-type-card">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold">種別を選択</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 訪問系 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">📅 訪問変更</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CHANGE_TYPES.filter(t => t.group === "visit").map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    setChangeType(type.value);
                    setPatientName(""); setFromDatetime(""); setToDatetime(""); setStaffBefore(""); setStaffAfter(""); setMeetingName(""); setMeetingStaff([]); setReason("");
                    setScheduleStartDate(""); setScheduleEndDate(""); setScheduleStartTime(""); setScheduleEndTime(""); setScheduleFacilityName(""); setSchedulePostDischargeEndDate("");
                    triggerDraftSave({ changeType: type.value, patientName: "", fromDatetime: "", toDatetime: "", staffBefore: "", staffAfter: "", meetingName: "", meetingStaff: [], reason: "" });
                    setTimeout(() => { document.getElementById("sc-voice-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    changeType === type.value ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <span className="text-xl">{type.icon}</span>
                  <span className={cn("text-sm font-medium", changeType === type.value ? "text-primary" : "text-foreground")}>{type.label}</span>
                  {changeType === type.value && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                </button>
              ))}
            </div>
          </div>
          {/* 会議系 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">📝 会議</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CHANGE_TYPES.filter(t => t.group === "meeting").map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    setChangeType(type.value);
                    setPatientName(""); setFromDatetime(""); setToDatetime(""); setStaffBefore(""); setStaffAfter(""); setMeetingName(""); setMeetingStaff([]); setReason("");
                    setScheduleStartDate(""); setScheduleEndDate(""); setScheduleStartTime(""); setScheduleEndTime(""); setScheduleFacilityName(""); setSchedulePostDischargeEndDate("");
                    triggerDraftSave({ changeType: type.value, patientName: "", fromDatetime: "", toDatetime: "", staffBefore: "", staffAfter: "", meetingName: "", meetingStaff: [], reason: "" });
                    setTimeout(() => { document.getElementById("sc-voice-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    changeType === type.value ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <span className="text-xl">{type.icon}</span>
                  <span className={cn("text-sm font-medium", changeType === type.value ? "text-primary" : "text-foreground")}>{type.label}</span>
                  {changeType === type.value && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                </button>
              ))}
            </div>
          </div>
          {/* 予定管理系 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">📆 予定登録</p>
            <div className="grid grid-cols-2 gap-2">
              {CHANGE_TYPES.filter(t => t.group === "schedule").map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    setChangeType(type.value);
                    setPatientName(""); setFromDatetime(""); setToDatetime(""); setStaffBefore(""); setStaffAfter(""); setMeetingName(""); setMeetingStaff([]); setReason("");
                    setScheduleStartDate(""); setScheduleEndDate(""); setScheduleStartTime(""); setScheduleEndTime(""); setScheduleFacilityName(""); setSchedulePostDischargeEndDate("");
                    triggerDraftSave({ changeType: type.value, patientName: "", fromDatetime: "", toDatetime: "", staffBefore: "", staffAfter: "", meetingName: "", meetingStaff: [], reason: "" });
                    setTimeout(() => { document.getElementById("sc-voice-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    changeType === type.value ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <span className="text-xl">{type.icon}</span>
                  <span className={cn("text-sm font-medium", changeType === type.value ? "text-primary" : "text-foreground")}>{type.label}</span>
                  {changeType === type.value && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* スプレッドシートリンクボタン */}
      <div className="px-1">
        <a
          href="https://docs.google.com/spreadsheets/d/1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU/edit?gid=941601927#gid=941601927"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          スケジュール変更連絡シートを開く
        </a>
      </div>

      {/* 音声入力カード（種別未選択時は非表示） */}
      {changeType && <Card id="sc-voice-card" className={cn(
        "border-2 transition-colors duration-300",
        isVoiceRecording
          ? "border-red-400/60 bg-red-50 dark:bg-red-950/20"
          : isParsingVoice
            ? "border-primary/40 bg-primary/10"
            : "border-primary/20 bg-primary/5"
      )}>
        <CardContent className="p-4 space-y-3">
          {/* 利用者候補選択パネル（最上部インライン表示） */}
          {showVoicePatientDialog && voicePatientCandidates.length > 0 && (
            <div className="rounded-xl border-2 border-primary/60 bg-primary/5 overflow-hidden animate-slide-up-modal">
              <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center gap-2">
                <span className="text-base">👤</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">利用者を選択してください</p>
                  <p className="text-xs text-muted-foreground">
                    「{voicePatientCandidates[0]?.name.split(/[　 ]/)[0]}」さんが{voicePatientCandidates.length}名登録されています
                  </p>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {voicePatientCandidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPatientName(p.name);
                      const validTeams = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"];
                      if (p.team && validTeams.includes(p.team) && !team) {
                        setTeam(p.team as Team);
                        triggerDraftSave({ team: p.team as Team });
                      }
                      const prevApplied = (pendingVoiceFields?.appliedCount as number) ?? 0;
                      toast.success(`音声内容を${prevApplied + 1}項目に自動転記しました`);
                      setShowVoicePatientDialog(false);
                      setVoicePatientCandidates([]);
                      setPendingVoiceFields(null);
                    }}
                    className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-primary/10 active:bg-primary/20 transition-colors border-b border-border/50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      {p.nameKana && (
                        <p className="text-xs text-muted-foreground mt-0.5">{p.nameKana}</p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                      {p.team}
                    </span>
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => {
                    setShowVoicePatientDialog(false);
                    setVoicePatientCandidates([]);
                    setPendingVoiceFields(null);
                  }}
                  className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  キャンセル（手動で入力）
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-primary">音声入力でAI自動転記</p>
                <VoiceHelpDialog mode="schedule" />
              </div>
              {isVoiceRecording ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 animate-pulse">
                    🎩️ 話してください...
                  </p>
                  <span className="text-xs font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                    {formatElapsedTime(voiceElapsedSeconds)}
                  </span>
                </div>
              ) : isParsingVoice ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="flex gap-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay: '0ms'}} />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay: '150ms'}} />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay: '300ms'}} />
                  </div>
                  <p className="text-xs text-primary font-semibold">AI解析中... 各項目に転記しています</p>
                </div>
              ) : voiceText ? (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">「{voiceText.slice(0, 40)}{voiceText.length > 40 ? "..." : ""}」</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">マイクをタップして話すと各項目に転記</p>
              )}
            </div>
            <VoiceMicButton
              onResult={handleVoiceResult}
              onRecordingChange={(rec) => {
                setIsVoiceRecording(rec);
                if (!rec) {
                  setVoiceInterimText("");
                } else {
                  // 録音開始時に前回の転記内容をリセット（やり直し対応）
                  setVoiceText("");
                  setVoiceTranscribed(false);
                  setVoiceError(null);
                  setMissingVoiceFields([]);
                  setFeedbackSent(false);
                }
              }}
              onInterimTextChange={setVoiceInterimText}
              size="lg"
              disabled={isParsingVoice}
              previewMode="none"
              context="schedule_change"
              longTextMode={true}
            />
          </div>

          {/* 録音中の入力テキストボックス */}
          {(isVoiceRecording || voiceText) && (
            <div className={cn(
              "px-3 py-2 rounded-lg border min-h-[36px] transition-colors duration-300",
              isVoiceRecording
                ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                : "bg-muted/40 border-border"
            )}>
              {isVoiceRecording ? (
                voiceInterimText ? (
                  <p className="text-xs text-red-600 dark:text-red-400 italic leading-relaxed">
                    🎤 {voiceInterimText}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">話しかけてください...</p>
                )
              ) : voiceText ? (
                <div className="flex items-start gap-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                    🎤 {voiceText}
                  </p>
                  <button
                    type="button"
                    onClick={() => setVoiceText("")}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                    title="クリア"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* 例文（常時表示） */}
          {(() => {
            // 種別に応じた例文を定義
            const exampleMap: Record<string, { main: string; sub?: string }> = {
              "": {
                main: "○○チームの○○さん、次回の訪問は明後日の14時から来週火曜の15時に変更。本人の受診のため。",
                sub: "日時の言い方の例：「明日の14時」「来週火曜の午後3時」「再来週月曜の午前10時半」「今週金曜の午後」「4月・十六日の15時」",
              },
              visit_change: {
                main: "◯チームの〇〇さん、次回の訪問は◯月◯日から◯月◯日◯時に変更。〇〇のため。",
                sub: "日時の言い方の例：「明日の14時」「来週火曜の午後3時」「再来週月曜の午前10時半」「今週金曜の午後」「4月・十六日の15時」",
              },
              visit_cancel: {
                main: "◯チームの〇〇さん、◯月◯日の訪問はキャンセル。〇〇のため。",
              },
              visit_add: {
                main: "◯チームの〇〇さん、◯月◯日◯時に訪問追加。",
              },
              meeting_add: {
                main: "◯チームの〇〇さん、◯月◯日◯時から担当者会議、場所は〇〇。",
                sub: "チーム名・参加者名・日時・会議名・場所を伝えると自動転記されます。場所は備考欄に入ります。",
              },
              meeting_change: {
                main: "◯チームの〇〇さん、◯月◯日の担当者会議を◯月◯日◯時に変更。",
              },
              schedule_visit: {
                main: "◯チームの〇〇さん、◯月◯日◯時に〇〇クリニックに受診。",
                sub: "施設名（病院・クリニック名）も一緒に伝えると自動転記されます。",
              },
              schedule_short_stay: {
                main: "○○チームの○○さん、○月○日から○月○日まで○○施設にショートステイ。",
                sub: "開始日・終了日・施設名を一緒に伝えると自動転記されます。",
              },
              schedule_special_instruction: {
                main: "○○チームの○○さん、○月○日から特別指示書の期間が始まります。",
                sub: "開始日を伝えると終了日（14日後）が自動計算されます。",
              },
              schedule_hospitalization: {
                main: "○○チームの○○さん、○月○日から○○病院に入院。",
                sub: "入院先の病院名も一緒に伝えると自動転記されます。",
              },
              schedule_discharge: {
                main: "○○チームの○○さん、○月○日に○○病院を退院。",
                sub: "退院日を伝えると退院後3か月終了日（週5訪問）が自動計算されます。",
              },
              schedule_new_contract: {
                main: "◯月◯日◯時に〇〇さんの契約（面談）、対応スタッフは〇〇。",
                sub: "対象者名・対応スタッフ名・日時を一緒に伝えると自動転記されます。",
              },
              schedule_visit_doctor: {
                main: "◯チームの〇〇さん、◯月◯日◯時に〇〇クリニックの訪問診療に同席。",
                sub: "医療機関名も一緒に伝えると備考欄に自動転記されます。",
              },
            };
            const example = exampleMap[changeType] ?? exampleMap[""];
            return (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">話しかけの例</p>
                <div className="rounded-lg bg-background/70 border border-border px-3 py-2 space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-snug">{example.main}</p>
                  {example.sub && (
                    <p className="text-xs text-muted-foreground/70 leading-snug border-t border-border pt-1.5">{example.sub}</p>
                  )}
                </div>
              </div>
            );
          })()}

          {isParsingVoice && (
            <div className="flex items-center gap-2 text-xs text-primary">
              <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>AIが音声内容を解析して各項目に転記中...</span>
            </div>
          )}

          {/* AI解析失敗時のエラー表示と再試行ボタン */}
          {voiceError && !isParsingVoice && (
            <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-destructive">⚠️ AI解析に失敗しました</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{voiceError}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVoiceError(null);
                  if (voiceText) {
                    setIsParsingVoice(true);
                    const namesWithKana2 = patientListRef.current.map((p) => ({ name: p.name, kana: (p as { nameKana?: string | null }).nameKana ?? '' }));
                    const staffNames2 = staffListRef.current.map((s: { name: string }) => s.name);
                    parseVoice.mutate({ text: voiceText, patientNamesWithKana: namesWithKana2, staffNames: staffNames2 });
                  }
                }}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 active:scale-95 transition-all"
              >
                <span className="text-sm">🎤</span>
                もう一度話す
              </button>
            </div>
          )}

          {/* 未転記項目バナー */}
          {missingVoiceFields.length > 0 && !isParsingVoice && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">💬 聴き取れなかった項目があります</p>
                <button
                  type="button"
                  onClick={() => setMissingVoiceFields([])}
                  className="w-5 h-5 flex items-center justify-center rounded-full text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
                  aria-label="閉じる"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {missingVoiceFields.map((field) => {
                  const fieldIdMap: Record<string, string> = {
                    "変更種別（日時変更・キャンセル・追加等）": "sc-change-type-card",
                    "チーム名（身体・天理・郡山北部・郡山南部）": "sc-team-card",
                    "変更前日時": "sc-datetime-card",
                    "利用者名": "sc-patient-input",
                  };
                  const targetId = fieldIdMap[field];
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => {
                        if (!targetId) return;
                        const el = document.getElementById(targetId);
                        if (!el) return;
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        // 枠線点滅ハイライト
                        el.classList.remove("highlight-pulse");
                        void el.offsetWidth; // reflowでアニメーションをリセット
                        el.classList.add("highlight-pulse");
                        el.addEventListener("animationend", () => el.classList.remove("highlight-pulse"), { once: true });
                        // input/textareaは直接フォーカス、Card要素（div）の場合は内部の最初のフォーカス可能要素を探す
                        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                          setTimeout(() => el.focus(), 300);
                        } else {
                          const focusable = el.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
                          if (focusable) setTimeout(() => focusable.focus(), 300);
                        }
                      }}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all ${
                        targetId
                          ? "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 cursor-pointer hover:bg-amber-300 dark:hover:bg-amber-700 active:scale-95"
                          : "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 cursor-default"
                      }`}
                    >
                      {targetId ? "👉 " : ""}{field}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">項目をタップすると入力欄に移動します。またはマイクで話しかけて追加入力もできます。</p>
            </div>
          )}

          {/* 誤変換報告フォローアップカード */}
          {feedbackSent && (
            <div className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">ご報告ありがとうございます</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 leading-relaxed">
                  いただいた情報はAIの音声認識精度の改善に活用します。引き続きご協力をお願いします。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackSent(false)}
                className="text-emerald-500 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-300 flex-shrink-0 mt-0.5"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* 誤変換報告ボタン（報告済みの場合は再報告リンクに変化） */}
          {voiceTranscribed && !isParsingVoice && (
            <div className="flex items-center justify-between gap-2">
              {feedbackSent ? (
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackWrongField("");
                    setFeedbackWrongValue("");
                    setFeedbackCorrectValue("");
                    setFeedbackComment("");
                    setShowFeedbackDialog(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-lg"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  報告済み（再報告する場合はこちら）
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackWrongField("");
                    setFeedbackWrongValue("");
                    setFeedbackCorrectValue("");
                    setFeedbackComment("");
                    setShowFeedbackDialog(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"/><path d="M10.5 10.677a2 2 0 0 0 2.823 2.823"/><path d="M7.362 5.104C5.054 6.37 3.37 8.555 3.05 11.24A9 9 0 0 0 12 21a9 9 0 0 0 5.877-2.166"/><path d="M12 3c1.8 0 3.5.5 4.9 1.4"/></svg>
                  誤変換を報告する
                </button>
              )}
              {/* マイクbotanに統合済み：録音開始時に自動リセットされるため、別途「もう一度話す」ボタンは不要 */}
            </div>
          )}

        </CardContent>
      </Card>}


      {/* 下書き復元バナー */}
      {hasDraft && draftSavedAt && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <RotateCcw className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">下書きがあります</p>
            <p className="text-xs text-amber-600">{formatSavedAt(draftSavedAt)}に保存された入力内容</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2 border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={handleDiscardDraft}
            >
              削除
            </Button>
            <Button
              size="sm"
              className="text-xs h-7 px-2 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleRestoreDraft}
            >
              復元する
            </Button>
          </div>
        </div>
      )}

      {/* 復元完了メッセージ */}
      {draftRestored && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>下書きを復元しました。内容を確認して送信してください。</span>
          <button onClick={() => setDraftRestored(false)} className="ml-auto">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 訪問系フォーム */}
      {isVisitType && (
        <>
          {/* チーム選択 */}
          <Card id="sc-team-card">
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
                      triggerDraftSave({ team: t, patientName: "" });
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                      getTeamButtonClass(t, team === t)
                    )}
                    style={getTeamButtonStyle(t, team === t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 利用者選択（オートコンプリート） */}
          <PatientAutocomplete
            id="sc-patient-input"
            patientList={patientList}
            value={patientName}
            onChange={(v) => { setPatientName(v); triggerDraftSave({ patientName: v }); }}
            onTeamSelect={(t) => {
              const validTeams = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"];
              if (validTeams.includes(t) && !team) {
                setTeam(t as Team);
                triggerDraftSave({ team: t as Team });
              }
            }}
          />

          {/* 日時変更 */}
          <Card id="sc-datetime-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">日時</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 訪問追加は「追加する日時」1つのみ表示 */}
              {changeType === "visit_add" ? (
                <DateTimePicker
                  value={toDatetime}
                  onChange={(v) => { setToDatetime(v); triggerDraftSave({ toDatetime: v }); }}
                  label="追加する日時"
                  required
                  placeholder="追加する日時を選択"
                  confidence={toDatetimeConfidence}
                  defaultTimeUnspecified={true}
                />
              ) : (
                <>
                  <DateTimePicker
                    value={fromDatetime}
                    onChange={(v) => { setFromDatetime(v); triggerDraftSave({ fromDatetime: v }); }}
                    label={changeType === "visit_cancel" ? "キャンセルの日" : "変更前の日時"}
                    required={changeType === "visit_change" || changeType === "visit_cancel"}
                    placeholder={changeType === "visit_cancel" ? "キャンセルの日を選択" : "変更前の日時を選択"}
                    confidence={fromDatetimeConfidence}
                    dateOnly={changeType === "visit_cancel"}
                  />
                  {changeType !== "visit_cancel" && (
                    <DateTimePicker
                      value={toDatetime}
                      onChange={(v) => { setToDatetime(v); triggerDraftSave({ toDatetime: v }); }}
                      label="変更後の日時"
                      required={changeType === "visit_change"}
                      placeholder="変更後の日時を選択"
                      confidence={toDatetimeConfidence}
                      defaultTimeUnspecified={true}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 担当スタッフ変更（オートコンプリート） - キャンセル以外のみ表示 */}
          {changeType !== "visit_cancel" && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">担当スタッフ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StaffAutocomplete
                  staffList={staffList}
                  value={staffBefore}
                  onChange={(v) => { setStaffBefore(v); triggerDraftSave({ staffBefore: v }); }}
                  label="変更前の担当スタッフ"
                  placeholder="スタッフ名で検索..."
                />
                <StaffAutocomplete
                  staffList={staffList}
                  value={staffAfter}
                  onChange={(v) => { setStaffAfter(v); triggerDraftSave({ staffAfter: v }); }}
                  label="変更後の担当スタッフ"
                  placeholder="スタッフ名で検索..."
                />
              </CardContent>
            </Card>
          )}

          {/* 変更理由 / キャンセル理由 */}
          <Card id="sc-reason-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">
                {changeType === "visit_cancel" ? "キャンセル理由・備考" : "変更理由・備考"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={changeType === "visit_cancel" ? "キャンセルの理由や特記事項を入力してください..." : "変更の理由や特記事項を入力してください..."}
                value={reason}
                onChange={(e) => { setReason(e.target.value); triggerDraftSave({ reason: e.target.value }); }}
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
          <Card id="sc-team-card">
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
                      getTeamButtonClass(t, team === t)
                    )}
                    style={getTeamButtonStyle(t, team === t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 利用者名 */}
          <Card id="sc-meeting-patient-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">利用者名 <Badge variant="outline" className="text-xs font-normal">任意</Badge></CardTitle>
            </CardHeader>
            <CardContent>
              <PatientAutocomplete
                patientList={allPatientListForVoice || []}
                value={patientName}
                onChange={(name) => { setPatientName(name); triggerDraftSave({ patientName: name }); }}
                onTeamSelect={(t) => { if (!team) setTeam(t as Team); }}
                id="sc-meeting-patient-input"
              />
            </CardContent>
          </Card>

          {/* 会議名 */}
          <Card id="sc-meeting-name-card">
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
          <Card id="sc-datetime-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">日時</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {changeType === "meeting_change" && (
                <DateTimePicker
                  value={fromDatetime}
                  onChange={(v) => { setFromDatetime(v); triggerDraftSave({ fromDatetime: v }); }}
                  label="変更前の日時"
                  placeholder="変更前の日時を選択"
                  confidence={fromDatetimeConfidence}
                  defaultTimeUnspecified={true}
                />
              )}
              <DateTimePicker
                value={toDatetime}
                onChange={(v) => { setToDatetime(v); triggerDraftSave({ toDatetime: v }); }}
                label={changeType === "meeting_change" ? "変更後の日時" : "開催日時"}
                required
                placeholder="日時を選択"
                confidence={toDatetimeConfidence}
                defaultTimeUnspecified={true}
              />
            </CardContent>
          </Card>

          {/* 参加スタッフ（オートコンプリート複数選択） */}
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
            <CardContent>
              <MultiStaffAutocomplete
                staffList={staffList}
                selected={meetingStaff}
                selectedTeam={undefined}
                onToggle={(name) => {
                  setMeetingStaff(prev =>
                    prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
                  );
                  triggerDraftSave({ meetingStaff: meetingStaff.includes(name) ? meetingStaff.filter(n => n !== name) : [...meetingStaff, name] });
                }}
              />
            </CardContent>
          </Card>

          {/* 備考 */}
          <Card id="sc-reason-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">備考</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="特記事項があれば入力してください..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* 予定管理系フォーム */}
      {isScheduleType && (
        <>
          {/* チーム選択（新規契約・面談以外の種別のみ表示） */}
          {changeType !== "schedule_new_contract" && (
            <Card id="sc-team-card">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">担当チーム</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {TEAMS.filter(t => t !== "事務員" && t !== "全チーム").map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTeam(t); setPatientName(""); }}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                        getTeamButtonClass(t, team === t)
                      )}
                      style={getTeamButtonStyle(t, team === t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

           {/* 利用者名（新規契約・面談は対象者名として直接入力、それ以外は利用者DBから選択） */}
          {changeType === "schedule_new_contract" ? (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">
                  対象者名 <span className="text-destructive">*</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="対象者名を入力してください..."
                  value={scheduleNewContractTargetName}
                  onChange={(e) => setScheduleNewContractTargetName(e.target.value)}
                />
              </CardContent>
            </Card>
          ) : (
            <PatientAutocomplete
              patientList={patientList}
              value={patientName}
              onChange={(name) => setPatientName(name)}
              onTeamSelect={(t) => setTeam(t as Team)}
              id="sc-patient-name"
            />
          )}
          {/* 開始日（DateTimePickerで日付のみ選択） */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">
                {scheduleStartDateLabel} <span className="text-destructive">*</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DateTimePicker
                value={scheduleStartDate}
                onChange={(v) => {
                  // 受診日・新規契約・訪問診療同席は時間ありで保存（時間未定の場合はYYYY-MM-DD形式）
                  const isScheduleWithTime = [
                    "schedule_visit", "schedule_new_contract", "schedule_visit_doctor"
                  ].includes(changeType);
                  if (isScheduleWithTime) {
                    // 時間ありの場合はISO形式、時間未定の場合はYYYY-MM-DD形式
                    handleScheduleStartDateChange(v ? v.split("T")[0] : "");
                    setScheduleStartDate(v);
                  } else {
                    const dateOnly = v ? v.split("T")[0] : "";
                    handleScheduleStartDateChange(dateOnly);
                    setScheduleStartDate(dateOnly);
                  }
                }}
                label=""
                placeholder={`${scheduleStartDateLabel}を選択`}
                dateOnly={![
                  "schedule_visit", "schedule_new_contract", "schedule_visit_doctor"
                ].includes(changeType)}
                defaultTimeUnspecified={[
                  "schedule_visit", "schedule_new_contract", "schedule_visit_doctor"
                ].includes(changeType)}
              />
            </CardContent>
          </Card>

          {/* 終了日（必要な種別のみ） */}
          {scheduleFieldConfig?.endDate && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">終了日</CardTitle>
              </CardHeader>
              <CardContent>
                <DateTimePicker
                  value={scheduleEndDate}
                  onChange={(v) => {
                    const dateOnly = v ? v.split("T")[0] : "";
                    setScheduleEndDate(dateOnly);
                  }}
                  label=""
                  placeholder="終了日を選択"
                  dateOnly={true}
                />
              </CardContent>
            </Card>
          )}

          {/* 開始時刻・終了時刻（必要な種別のみ） */}
          {(scheduleFieldConfig?.startTime || scheduleFieldConfig?.endTime) && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">時刻</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {scheduleFieldConfig?.startTime && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">開始</Label>
                      <Input type="time" step={600} value={scheduleStartTime} onChange={(e) => setScheduleStartTime(e.target.value)} className="w-full" />
                    </div>
                  )}
                  {scheduleFieldConfig?.endTime && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">終了</Label>
                      <Input type="time" step={600} value={scheduleEndTime} onChange={(e) => setScheduleEndTime(e.target.value)} className="w-full" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 施設名 / 医療機関名（必要な種別のみ） */}
          {scheduleFieldConfig?.facilityName && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">
                  {changeType === "schedule_visit_doctor" ? "医療機関名" : "施設名"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder={changeType === "schedule_visit_doctor" ? "例：○○クリニック、○○病院..." : "例：こころクリニック、大和郡山市立病院..."}
                  value={scheduleFacilityName}
                  onChange={(e) => setScheduleFacilityName(e.target.value)}
                />
              </CardContent>
            </Card>
          )}

          {/* 退院後３か月終了日（週５訪問）（退院のみ） */}
          {scheduleFieldConfig?.postDischargeEndDate && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">退院後３か月終了日（週５訪問）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <Input
                    type="date"
                    value={schedulePostDischargeEndDate}
                    onChange={(e) => setSchedulePostDischargeEndDate(e.target.value)}
                    className={`w-auto ${schedulePostDischargeEndDate && scheduleStartDate ? "bg-primary/5 border-primary/30" : ""}`}
                  />
                  {scheduleStartDate && schedulePostDischargeEndDate && (
                    <p className="text-xs text-muted-foreground">退院日（{scheduleStartDate}）から自動計算しました。手動で変更も可能です。</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {/* 対応スタッフ（新規契約・面談のみ） */}
          {changeType === "schedule_new_contract" && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  対応スタッフ
                  {scheduleNewContractStaff.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{scheduleNewContractStaff.length}名選択中</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MultiStaffAutocomplete
                  staffList={staffList}
                  selected={scheduleNewContractStaff}
                  selectedTeam={team || undefined}
                  onToggle={(name) => {
                    setScheduleNewContractStaff(prev =>
                      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
                    );
                  }}
                />
              </CardContent>
            </Card>
          )}
          {/* 備考 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">備考</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="特記事項があれば入力してください..."
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
          <CardContent className="text-sm space-y-3">
            {/* 基本情報 */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("text-xs", selectedTypeInfo?.color)}>
                {selectedTypeInfo?.icon} {selectedTypeInfo?.label}
              </Badge>
              {team && <Badge variant="secondary" className="text-xs">{team}</Badge>}
              {patientName && <Badge variant="secondary" className="text-xs">&#x1F464; {patientName}</Badge>}
              {meetingName && <Badge variant="secondary" className="text-xs">&#x1F4CB; {meetingName}</Badge>}
            </div>

            {/* 日時の変更前→変更後矢印表示 */}
            {(fromDatetime || toDatetime) && (
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">日時</p>
                {changeType === "visit_add" && toDatetime ? (
                  <div className="bg-green-500/10 border border-green-400/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-400 font-semibold mb-0.5">追加する日時</p>
                    <p className="font-semibold text-foreground text-sm">{formatDatetime(new Date(toDatetime).toISOString())}</p>
                  </div>
                ) : fromDatetime && toDatetime ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-0 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-400 font-semibold mb-0.5">変更前</p>
                      <p className="font-semibold text-foreground text-sm">{formatDatetime(new Date(fromDatetime).toISOString())}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0 bg-green-500/10 border border-green-400/30 rounded-lg px-3 py-2">
                      <p className="text-xs text-green-400 font-semibold mb-0.5">変更後</p>
                      <p className="font-semibold text-foreground text-sm">{formatDatetime(new Date(toDatetime).toISOString())}</p>
                    </div>
                  </div>
                ) : fromDatetime ? (
                  <div className="bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-400 font-semibold mb-0.5">キャンセルの日</p>
                    <p className="font-semibold text-foreground text-sm">{formatDatetime(new Date(fromDatetime).toISOString())}</p>
                  </div>
                ) : (
                  <div className="bg-green-500/10 border border-green-400/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-400 font-semibold mb-0.5">日時</p>
                    <p className="font-semibold text-foreground text-sm">{formatDatetime(new Date(toDatetime!).toISOString())}</p>
                  </div>
                )}
              </div>
            )}

            {/* 担当スタッフの変更前→変更後矢印表示 */}
            {(staffBefore || staffAfter) && (
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">担当スタッフ</p>
                {staffBefore && staffAfter ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-0 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-400 font-semibold mb-0.5">変更前</p>
                      <p className="font-semibold text-foreground text-sm">{staffBefore}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0 bg-green-500/10 border border-green-400/30 rounded-lg px-3 py-2">
                      <p className="text-xs text-green-400 font-semibold mb-0.5">変更後</p>
                      <p className="font-semibold text-foreground text-sm">{staffAfter}</p>
                    </div>
                  </div>
                ) : (
                  <p className="font-medium">{staffBefore || staffAfter}</p>
                )}
              </div>
            )}

            {/* 会議参加スタッフ */}
            {meetingStaff.length > 0 && (
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">参加スタッフ ({meetingStaff.length}名)</p>
                <div className="flex flex-wrap gap-1.5">
                  {meetingStaff.map(name => (
                    <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 予定管理情報 */}
            {isScheduleType && scheduleStartDate && (
              <div className="rounded-xl border border-border bg-background p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">予定情報</p>
                {changeType === "schedule_new_contract" && scheduleNewContractTargetName && <p className="text-sm text-foreground">対象者名: {scheduleNewContractTargetName}</p>}
                {scheduleStartDate && <p className="text-sm text-foreground">{scheduleStartDateLabel}: {scheduleStartDate.includes('T') ? formatDatetime(new Date(scheduleStartDate).toISOString()) : scheduleStartDate}</p>}
                {scheduleFieldConfig?.endDate && scheduleEndDate && <p className="text-sm text-foreground">終了日: {scheduleEndDate}</p>}
                {scheduleFieldConfig?.startTime && scheduleStartTime && <p className="text-sm text-foreground">開始: {scheduleStartTime}</p>}
                {scheduleFieldConfig?.endTime && scheduleEndTime && <p className="text-sm text-foreground">終了: {scheduleEndTime}</p>}
                {scheduleFieldConfig?.facilityName && scheduleFacilityName && <p className="text-sm text-foreground">{changeType === "schedule_visit_doctor" ? "医療機関名" : "施設名"}: {scheduleFacilityName}</p>}
                {scheduleFieldConfig?.postDischargeEndDate && schedulePostDischargeEndDate && <p className="text-sm text-foreground">退院後3か月終了日（週５訪問）: {schedulePostDischargeEndDate}</p>}
                {changeType === "schedule_new_contract" && scheduleNewContractStaff.length > 0 && <p className="text-sm text-foreground">対応スタッフ: {scheduleNewContractStaff.join("、")}</p>}
                {reason && <p className="text-sm text-foreground">備考: {reason}</p>}
              </div>
            )}

            {/* 変更理由 */}
            {reason && !isScheduleType && (
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{changeType === "visit_cancel" ? "キャンセル理由・備考" : isMeetingType ? "備考" : "変更理由・備考"}</p>
                <p className="text-sm text-foreground">{reason}</p>
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
              <svg className="w-4 h-4 mr-2 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
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

      {/* リセットボタン */}
      {changeType && (
        <Button
          onClick={() => {
            if (window.confirm("入力内容をリセットしますか？")) {
              handleReset();
            }
          }}
          variant="outline"
          className="w-full text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5"
          size="lg"
          disabled={createAndExport.isPending}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          リセット
        </Button>
      )}

      {/* 誤変換報告ダイアログ */}
      {showFeedbackDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in-overlay">
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up-modal">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">誤変換を報告する</p>
                <p className="text-xs text-muted-foreground mt-0.5">音声転記の誤りを報告してAIの改善に協力してください</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFeedbackDialog(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-4 py-4 space-y-4">
              {/* 元の音声テキスト */}
              {voiceText && (
                <div className="rounded-lg bg-muted/40 border border-border px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">認識した音声</p>
                  <p className="text-xs text-foreground leading-relaxed">「{voiceText}」</p>
                </div>
              )}
              {/* 誤変換した項目 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">誤変換した項目</label>
                <select
                  value={feedbackWrongField}
                  onChange={(e) => setFeedbackWrongField(e.target.value)}
                  className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">選択してください</option>
                  <option value="変更種別">変更種別</option>
                  <option value="チーム">チーム</option>
                  <option value="利用者名">利用者名</option>
                  <option value="変更前日時">変更前日時</option>
                  <option value="変更後日時">変更後日時</option>
                  <option value="担当スタッフ">担当スタッフ</option>
                  <option value="伝達先">伝達先</option>
                  <option value="理由">理由</option>
                  <option value="その他">その他</option>
                </select>
              </div>
              {/* AIが出した誤った値 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">AIが転記した誤った内容</label>
                <input
                  type="text"
                  value={feedbackWrongValue}
                  onChange={(e) => setFeedbackWrongValue(e.target.value)}
                  placeholder="例：天理チームと転記されたが正しくは郡山北部チーム"
                  className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {/* 正しい値 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">正しい内容</label>
                <input
                  type="text"
                  value={feedbackCorrectValue}
                  onChange={(e) => setFeedbackCorrectValue(e.target.value)}
                  placeholder="例：郡山北部チーム"
                  className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {/* 自由コメント */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">その他コメント（任意）</label>
                <textarea
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="例：「北部」と言ったのに「天理」と誤認された。地名を正確に認識してほしい。"
                  rows={3}
                  className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowFeedbackDialog(false)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!feedbackWrongField || reportFeedback.isPending}
                onClick={() => {
                  reportFeedback.mutate({
                    originalText: voiceText,
                    transcribedResult: JSON.stringify({
                      changeType, team, patientName, fromDatetime, toDatetime,
                      staffBefore, staffAfter, meetingName, reason,
                    }),
                    wrongField: feedbackWrongField || undefined,
                    wrongValue: feedbackWrongValue || undefined,
                    correctValue: feedbackCorrectValue || undefined,
                    comment: feedbackComment || undefined,
                  });
                }}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                {reportFeedback.isPending ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    送信中...
                  </span>
                ) : "報告する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
