import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";

// 変更種別の定義
const CHANGE_TYPES = [
  { value: "visit_change", label: "訪問日時変更", icon: "🔄", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "visit_cancel", label: "訪問キャンセル", icon: "❌", color: "bg-red-100 text-red-800 border-red-200" },
  { value: "visit_add", label: "訪問追加", icon: "✅", color: "bg-green-100 text-green-800 border-green-200" },
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
}: {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (!value) return undefined;
    return new Date(value);
  });

  const pad = (n: number) => String(n).padStart(2, "0");

  const applyDateTime = (date: Date | undefined, h: string, m: string) => {
    if (!date) return;
    const d = new Date(date);
    d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${h}:${m}`;
    onChange(iso);
  };

  const handleDaySelect = (day: Date | undefined) => {
    setSelectedDate(day);
    applyDateTime(day, hour, minute);
  };

  const handleHourChange = (h: string) => {
    setHour(h);
    applyDateTime(selectedDate, h, minute);
  };

  const handleMinuteChange = (m: string) => {
    setMinute(m);
    applyDateTime(selectedDate, hour, m);
  };

  const displayValue = value
    ? formatDatetime(value.includes("T") ? new Date(value).toISOString() : value)
    : "";

  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutes = ["00", "10", "20", "30", "40", "50"];

  return (
    <div className="space-y-1">
      {label && (
        <Label className="text-xs text-muted-foreground">
          {label}{required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
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
            <div className="border-t pt-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium">時刻</span>
              </div>
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
            </div>
          </div>
        </PopoverContent>
      </Popover>
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
  const [query, setQuery] = useState("");
  const [manualInput, setManualInput] = useState("");

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

      {/* 検索入力 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="スタッフ名で絞り込み..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* スタッフ一覧 */}
      <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="col-span-2 text-center text-sm text-muted-foreground py-3">該当なし</p>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onToggle(s.name)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all text-left",
                selected.includes(s.name)
                  ? "bg-primary/10 border-primary text-primary font-medium"
                  : "bg-card border-border text-foreground hover:bg-muted"
              )}
            >
              {selected.includes(s.name) && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{s.name}</span>
            </button>
          ))
        )}
      </div>

      {/* 手動入力 */}
      <div>
        <Label className="text-xs text-muted-foreground">一覧にない場合は手動入力</Label>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="スタッフ名を入力..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddManual(); } }}
          />
          <Button variant="outline" size="sm" onClick={handleAddManual}>追加</Button>
        </div>
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
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [missingVoiceFields, setMissingVoiceFields] = useState<string[]>([]);
  // 音声入力後の利用者候補選択ダイアログ用
  const [voicePatientCandidates, setVoicePatientCandidates] = useState<PatientItem[]>([]);
  const [showVoicePatientDialog, setShowVoicePatientDialog] = useState(false);
  // 候補選択後に適用するその他のフィールドを一時保存
  const [pendingVoiceFields, setPendingVoiceFields] = useState<{ appliedCount: number } | null>(null);
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
    { enabled: changeType === "visit_change" || changeType === "visit_cancel" || changeType === "visit_add" }
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
    setSubmitted(false);
    setLastRecord(null);
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
      if (f.changeType && ["visit_change", "visit_cancel", "visit_add", "meeting_add", "meeting_change"].includes(f.changeType)) {
        setChangeType(prev => prev === "" ? f.changeType as ChangeType : prev);
        applied++;
      } else {
        missing.push("変更種別（日時変更・キャンセル・追加等）");
      }

      if (f.team) {
        if (["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"].includes(f.team)) {
          // チーム名は明示的に話した場合は常に反映（補完時に上書きできるよう）
          setTeam(f.team as Team);
          applied++;
        } else {
          missing.push("チーム名（身体・天理・郡山北部・郡山南部）");
        }
      } else {
        missing.push("チーム名（身体・天理・郡山北部・郡山南部）");
      }

      if (f.fromDatetime) { setFromDatetime(prev => prev.trim() ? prev : f.fromDatetime!); applied++; }
      else { missing.push("変更前日時"); }

      if (f.toDatetime) { setToDatetime(prev => prev.trim() ? prev : f.toDatetime!); applied++; }
      // toDatetimeはキャンセル時は不要なので missing には追加しない

      if (f.staffBefore) { setStaffBefore(prev => prev.trim() ? prev : f.staffBefore!); applied++; }
      if (f.staffAfter) { setStaffAfter(prev => prev.trim() ? prev : f.staffAfter!); applied++; }
      if (f.meetingName) { setMeetingName(prev => prev.trim() ? prev : f.meetingName!); applied++; }
      if (f.meetingStaff && Array.isArray(f.meetingStaff) && f.meetingStaff.length > 0) {
        setMeetingStaff(prev => prev.length > 0 ? prev : f.meetingStaff!);
        applied++;
      }
      if (f.reason) { setReason(prev => prev.trim() ? prev : f.reason!); applied++; }

      // 利用者名処理: patientLastName または patientName で登録利用者から検索して連携
      // ※ 苗字だけ伝えた場合も含め、常に登録利用者から検索し、直接転記しない
      const lastName = (f as Record<string, unknown>).patientLastName as string | null;
      const searchKey = lastName || f.patientName || null;

      if (searchKey) {
        // 1. 苗字の先頭一致検索（スペース区切りの最初のトークン）
        const exactMatches = patientList.filter((p: PatientItem) => {
          const parts = p.name.split(/[　 ]/);
          return parts[0] === searchKey;
        });
        // 2. 完全一致検索（フルネームが渡された場合）
        const fullNameMatches = patientList.filter((p: PatientItem) => p.name === searchKey);
        // 3. 部分一致検索（フォールバック）
        const partialMatches = patientList.filter((p: PatientItem) => p.name.includes(searchKey));

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
        // 利用者名なしのケース
        missing.push("利用者名");
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

  // patientListをrefで保持（クロージャ問題回避）
  const patientListRef = useRef(patientList);
  useEffect(() => { patientListRef.current = patientList; }, [patientList]);

  const handleVoiceResult = useCallback((text: string) => {
    setVoiceError(null);
    setVoiceText(text);
    setIsParsingVoice(true);
    const namesWithKana = patientListRef.current.map((p) => ({ name: p.name, kana: (p as { nameKana?: string | null }).nameKana ?? '' }));
    parseVoice.mutate({ text, patientNamesWithKana: namesWithKana });
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
          <h1 className="text-lg font-bold text-foreground">スケジュール変更連絡</h1>
          <p className="text-xs text-muted-foreground">入力後、スプレッドシートに自動転記されます</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 自動保存インジケーター */}
          {draftSavedAt && !hasDraft && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Save className="w-3 h-3" />
              <span>{formatSavedAt(draftSavedAt)}保存</span>
            </div>
          )}
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

      {/* 音声入力カード */}
      <Card className={cn(
        "border-2 transition-colors duration-300",
        isVoiceRecording
          ? "border-red-400/60 bg-red-50 dark:bg-red-950/20"
          : isParsingVoice
            ? "border-primary/40 bg-primary/10"
            : "border-primary/20 bg-primary/5"
      )}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-primary">音声入力でAI自動転記</p>
                <VoiceHelpDialog mode="schedule" />
              </div>
              {isVoiceRecording ? (
                <p className="text-xs font-medium text-red-600 dark:text-red-400 animate-pulse mt-0.5">
                  🎙️ 話してください...
                </p>
              ) : isParsingVoice ? (
                <p className="text-xs text-primary font-medium animate-pulse mt-0.5">AIが解析中...</p>
              ) : voiceText ? (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">「{voiceText.slice(0, 40)}{voiceText.length > 40 ? "..." : ""}」</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">マイクをタップして話すと各項目に転記</p>
              )}
            </div>
            <VoiceMicButton
              onResult={handleVoiceResult}
              onRecordingChange={(rec) => { setIsVoiceRecording(rec); if (!rec) setVoiceInterimText(""); }}
              onInterimTextChange={setVoiceInterimText}
              size="lg"
              disabled={isParsingVoice}
              previewMode="none"
              context="schedule_change"
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
          {true && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">話しかけの例</p>
              <div className="rounded-lg bg-background/70 border border-border px-3 py-2">
                <span className="text-[11px] text-muted-foreground leading-snug">○○チームの○○さん、次回の訪問は明後日の×時から×月×日の×時に変更。本人の受診のため。</span>
              </div>
            </div>
          )}

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
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{voiceError}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVoiceError(null);
                  if (voiceText) {
                    setIsParsingVoice(true);
                    const namesWithKana2 = patientListRef.current.map((p) => ({ name: p.name, kana: (p as { nameKana?: string | null }).nameKana ?? '' }));
                    parseVoice.mutate({ text: voiceText, patientNamesWithKana: namesWithKana2 });
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
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">💬 聴き取れなかった項目があります</p>
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
                        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                          setTimeout(() => el.focus(), 300);
                        }
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-all ${
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
              <p className="text-[10px] text-amber-700 dark:text-amber-400">項目をタップすると入力欄に移動します。またはマイクで話しかけて追加入力もできます。</p>
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
            <div className="flex justify-end">
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
                  className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-lg"
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
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"/><path d="M10.5 10.677a2 2 0 0 0 2.823 2.823"/><path d="M7.362 5.104C5.054 6.37 3.37 8.555 3.05 11.24A9 9 0 0 0 12 21a9 9 0 0 0 5.877-2.166"/><path d="M12 3c1.8 0 3.5.5 4.9 1.4"/></svg>
                  誤変換を報告する
                </button>
              )}
            </div>
          )}

        </CardContent>
      </Card>

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

      {/* 変更種別選択 */}
      <Card id="sc-change-type-card">
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
                triggerDraftSave({ changeType: type.value, patientName: "", fromDatetime: "", toDatetime: "", staffBefore: "", staffAfter: "", meetingName: "", meetingStaff: [], reason: "" });
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
                />
              ) : (
                <>
                  <DateTimePicker
                    value={fromDatetime}
                    onChange={(v) => { setFromDatetime(v); triggerDraftSave({ fromDatetime: v }); }}
                    label={changeType === "visit_cancel" ? "キャンセルの日" : "変更前の日時"}
                    required={changeType === "visit_change" || changeType === "visit_cancel"}
                    placeholder={changeType === "visit_cancel" ? "キャンセルの日を選択" : "変更前の日時を選択"}
                  />
                  {changeType !== "visit_cancel" && (
                    <DateTimePicker
                      value={toDatetime}
                      onChange={(v) => { setToDatetime(v); triggerDraftSave({ toDatetime: v }); }}
                      label="変更後の日時"
                      required={changeType === "visit_change"}
                      placeholder="変更後の日時を選択"
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
                />
              )}
              <DateTimePicker
                value={toDatetime}
                onChange={(v) => { setToDatetime(v); triggerDraftSave({ toDatetime: v }); }}
                label={changeType === "meeting_change" ? "変更後の日時" : "開催日時"}
                required
                placeholder="日時を選択"
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
                selectedTeam={team || undefined}
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

            {/* 変更理由 */}
            {reason && (
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

      {/* 音声入力後の利用者候補選択ダイアログ */}
      {showVoicePatientDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in-overlay">
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-[90vw] max-w-sm mx-4 overflow-hidden animate-slide-up-modal">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <p className="text-sm font-semibold text-foreground">利用者を選択してください</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                「{voicePatientCandidates[0]?.name.split(/[　 ]/)[0]}」さんが{voicePatientCandidates.length}名登録されています
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {voicePatientCandidates.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPatientName(p.name);
                    // チーム未選択の場合は利用者のチームを自動セット
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
            <div className="px-4 py-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setShowVoicePatientDialog(false);
                  setVoicePatientCandidates([]);
                  setPendingVoiceFields(null);
                }}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                キャンセル（手動で入力）
              </button>
            </div>
          </div>
        </div>
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
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">認識した音声</p>
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
