/**
 * PersonalTasks - 個人タスク管理ページ（利用者と無関係の個人タスク）
 * - 自分のみ / 個人指定（複数） / チーム（複数） / 全職員 への指定
 * - この日時にする（at_time）/ この日時まで（by_deadline）の区別
 * - 繰り返し設定：毎日・毎週・隔週・毎月（N月毎）・第N曜日（by_deadlineのみ）
 * - 期日順（直近から）表示
 * - 「依頼した」フィルター：自分が他者に依頼したタスク
 * - 「すべて」フィルター：自分に関係するタスクのみ（他者への依頼は除外）
 */
import React, { useState, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, Plus, Check, Trash2, ChevronDown, ChevronUp,
  Clock, Repeat, Users, User, RefreshCw, X, Bell, AlertTriangle, Mic, MicOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ---- 音声入力でよみがな検索ユーティリティ ----
function normalizeKana(s: string): string {
  return s.normalize("NFKC").replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase().replace(/\s+/g, "");
}
function matchStaffByKana(query: string, staffList: any[]): any[] {
  const q = normalizeKana(query);
  if (!q) return [];
  // 完全一致（苗字のみ）優先
  const exact = staffList.filter(s => {
    const kana = normalizeKana(s.nameKana || "");
    const name = normalizeKana(s.name || "");
    // よみがなの苗字部分（最初のスペースまで）と比較
    const kanaFamily = kana.split(/\s+/)[0];
    const nameFamily = name.split(/\s+/)[0];
    return kanaFamily === q || nameFamily === q || kana === q || name === q;
  });
  if (exact.length > 0) return exact;
  // 部分一致
  return staffList.filter(s => {
    const kana = normalizeKana(s.nameKana || "");
    const name = normalizeKana(s.name || "");
    return kana.includes(q) || name.includes(q);
  });
}

// ---- 型定義 ----
type AssignType = "self" | "personal" | "team" | "all";
type TeamName = "身体" | "天理" | "郡山北部" | "郡山南部";
type RepeatType = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "nth_weekday";
type TaskKind = "at_time" | "by_deadline";
type FilterMode = "all" | "at_time" | "by_deadline" | "delegated";

const TEAMS: TeamName[] = ["身体", "天理", "郡山北部", "郡山南部"];
const TEAM_COLORS: Record<TeamName, string> = {
  "身体": "bg-emerald-700/80 text-emerald-100",
  "天理": "bg-sky-700/80 text-sky-100",
  "郡山北部": "bg-orange-700/80 text-orange-100",
  "郡山南部": "bg-rose-700/80 text-rose-100",
};
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const NTH_WEEK_LABELS = ["第1", "第2", "第3", "第4", "最終"];
const NTH_WEEK_VALUES = [1, 2, 3, 4, -1];

// ---- ユーティリティ ----
function formatDueDate(date: Date | null | undefined, taskKind: TaskKind): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((taskDay.getTime() - today.getTime()) / 86400000);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const timeStr = hasTime
    ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}${timeStr}`;
  const dayLabel = diffDays === 0 ? "今日" : diffDays === 1 ? "明日" : dateStr;
  const suffix = taskKind === "at_time" ? "に" : "まで";
  if (diffDays < -1) return `${dateStr}${suffix}（${Math.abs(diffDays)}日超過）`;
  if (diffDays === -1) return `昨日${timeStr}${suffix}（期限切れ）`;
  if (diffDays <= 7) return `${dayLabel}${suffix}${diffDays > 1 ? `（あと${diffDays}日）` : ""}`;
  return `${dateStr}${suffix}`;
}

function getDueDateColor(date: Date | null | undefined, done: boolean): string {
  if (done || !date) return "text-gray-500";
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((taskDay.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "text-red-400 font-semibold";
  if (diffDays === 0) return "text-orange-400 font-semibold";
  if (diffDays <= 3) return "text-yellow-400";
  return "text-gray-400";
}

function formatRepeat(task: {
  repeatType: string;
  repeatDayOfWeek?: number | null;
  repeatDayOfMonth?: number | null;
  repeatMonthInterval?: number | null;
  repeatNthWeek?: number | null;
  repeatNthDayOfWeek?: number | null;
}): string {
  switch (task.repeatType) {
    case "daily": return "毎日";
    case "weekly":
      return `毎週${task.repeatDayOfWeek != null ? WEEKDAY_LABELS[task.repeatDayOfWeek] + "曜" : ""}`;
    case "biweekly":
      return `隔週${task.repeatDayOfWeek != null ? WEEKDAY_LABELS[task.repeatDayOfWeek] + "曜" : ""}`;
    case "monthly": {
      const iv = task.repeatMonthInterval ?? 1;
      const d = task.repeatDayOfMonth ? `${task.repeatDayOfMonth}日` : "";
      return iv === 1 ? `毎月${d}` : `${iv}ヶ月毎${d}`;
    }
    case "nth_weekday": {
      const nthIdx = NTH_WEEK_VALUES.indexOf(task.repeatNthWeek ?? 1);
      const nthStr = nthIdx >= 0 ? NTH_WEEK_LABELS[nthIdx] : "第1";
      const dayStr = task.repeatNthDayOfWeek != null ? WEEKDAY_LABELS[task.repeatNthDayOfWeek] + "曜" : "";
      return `毎月${nthStr}${dayStr}`;
    }
    default: return "";
  }
}

// ---- タスク作成フォーム ----
interface CreateFormProps {
  onClose: () => void;
  onCreated: () => void;
  userTeam: string | null;
  defaultDueDate?: string; // YYYY-MM-DD形式のデフォルト日付（ホーム画面から呼ぶ場合に今日の日付を渡す）
}

export function CreateTaskForm({ onClose, onCreated, userTeam, defaultDueDate }: CreateFormProps) {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [taskKind, setTaskKind] = useState<TaskKind>("by_deadline");
  const [dueDate, setDueDate] = useState(defaultDueDate ?? "");
  const [dueTime, setDueTime] = useState("");
  const [assignType, setAssignType] = useState<AssignType>("self");
  // 複数チーム選択
  const [assignTeams, setAssignTeams] = useState<TeamName[]>(userTeam ? [userTeam as TeamName] : []);
  // 複数個人選択
  const [assignUserIds, setAssignUserIds] = useState<number[]>([]);
  const [assignUserNames, setAssignUserNames] = useState<string[]>([]);
  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [repeatDayOfWeek, setRepeatDayOfWeek] = useState<number>(1);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState<number>(1);
  const [repeatMonthInterval, setRepeatMonthInterval] = useState<number>(1);
  const [repeatNthWeek, setRepeatNthWeek] = useState<number>(1);
  const [repeatNthDayOfWeek, setRepeatNthDayOfWeek] = useState<number>(1);
  const [repeatEndDate, setRepeatEndDate] = useState("");

  const staffQuery = trpc.staff.listForForm.useQuery();
  const staffList = (staffQuery.data ?? []) as any[];

  // 音声入力でよみがな職員選択
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceStaffCandidates, setVoiceStaffCandidates] = useState<any[]>([]);
  const voiceRecognitionRef = useRef<any>(null);

  const startStaffVoiceInput = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("このブラウザは音声入力に対応していません");
      return;
    }
    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      setIsVoiceListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    voiceRecognitionRef.current = recognition;
    recognition.onstart = () => setIsVoiceListening(true);
    recognition.onend = () => setIsVoiceListening(false);
    recognition.onerror = () => {
      setIsVoiceListening(false);
      toast.error("音声認識に失敗しました");
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const matches = matchStaffByKana(transcript, staffList);
      if (matches.length === 1) {
        const s = matches[0];
        if (!assignUserIds.includes(s.id)) {
          setAssignUserIds(prev => [...prev, s.id]);
          setAssignUserNames(prev => [...prev, s.name]);
        }
        setVoiceStaffCandidates([]);
        toast.success(`「${s.name}」を選択しました`);
      } else if (matches.length > 1) {
        setVoiceStaffCandidates(matches);
        toast.info(`「${transcript}」の候補が${matches.length}件あります。選択してください`);
      } else {
        toast.warning(`「${transcript}」に一致する職員が見つかりません`);
      }
    };
    recognition.start();
  }, [isVoiceListening, staffList, assignUserIds]);

  const createMutation = trpc.personalTasks.create.useMutation({
    onSuccess: () => {
      utils.personalTasks.getMyTasks.invalidate();
      utils.personalTasks.getTodayTasks.invalidate();
      toast.success("タスクを追加しました");
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleTeam = useCallback((team: TeamName) => {
    setAssignTeams(prev =>
      prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
    );
  }, []);

  const toggleUser = useCallback((id: number, name: string) => {
    setAssignUserIds(prev => {
      if (prev.includes(id)) {
        setAssignUserNames(n => n.filter((_, i) => prev.indexOf(id) !== i));
        return prev.filter(i => i !== id);
      } else {
        setAssignUserNames(n => [...n, name]);
        return [...prev, id];
      }
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!text.trim()) {
      toast.error("内容を入力してください");
      return;
    }
    let dueDateObj: Date | undefined;
    if (dueDate) {
      const [year, month, day] = dueDate.split("-").map(Number);
      const [hours, minutes] = dueTime ? dueTime.split(":").map(Number) : [0, 0];
      dueDateObj = new Date(year, month - 1, day, hours, minutes, 0);
    }
    let repeatEndDateObj: Date | undefined;
    if (repeatEndDate) {
      const [year, month, day] = repeatEndDate.split("-").map(Number);
      repeatEndDateObj = new Date(year, month - 1, day, 23, 59, 59);
    }

    // 複数チーム・複数個人の場合はassignTeams/assignUserIds/assignUserNamesに格納
    const isMultiTeam = assignType === "team" && assignTeams.length > 1;
    const isMultiPersonal = assignType === "personal" && assignUserIds.length > 1;

    createMutation.mutate({
      text: text.trim(),
      taskKind,
      dueDate: dueDateObj,
      assignType,
      assignTeam: assignType === "team" && assignTeams.length === 1 ? assignTeams[0] : undefined,
      assignUserId: assignType === "personal" && assignUserIds.length === 1 ? assignUserIds[0] : undefined,
      assignUserName: assignType === "personal" && assignUserNames.length === 1 ? assignUserNames[0] : undefined,
      assignTeams: isMultiTeam ? assignTeams : undefined,
      assignUserIds: isMultiPersonal ? assignUserIds : undefined,
      assignUserNames: isMultiPersonal ? assignUserNames : undefined,
      repeatType,
      repeatDayOfWeek: ["weekly", "biweekly"].includes(repeatType) ? repeatDayOfWeek : undefined,
      repeatDayOfMonth: repeatType === "monthly" ? repeatDayOfMonth : undefined,
      repeatMonthInterval: repeatType === "monthly" ? repeatMonthInterval : undefined,
      repeatNthWeek: repeatType === "nth_weekday" ? repeatNthWeek : undefined,
      repeatNthDayOfWeek: repeatType === "nth_weekday" ? repeatNthDayOfWeek : undefined,
      repeatEndDate: repeatType !== "none" ? repeatEndDateObj : undefined,
    });
  }, [text, taskKind, dueDate, dueTime, assignType, assignTeams, assignUserIds, assignUserNames,
    repeatType, repeatDayOfWeek, repeatDayOfMonth, repeatMonthInterval, repeatNthWeek,
    repeatNthDayOfWeek, repeatEndDate, createMutation]);

  return (
    <div className="rounded-xl border border-blue-400/30 bg-card shadow-sm mb-3">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-foreground font-bold text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-400" />
            個人タスクを追加
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 種別 */}
        <div className="mb-4">
          <label className="text-muted-foreground text-xs uppercase tracking-wide mb-2 block">種別</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTaskKind("at_time")}
              className={`py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                taskKind === "at_time"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-4 h-4" />
              この日時にする
            </button>
            <button
              onClick={() => setTaskKind("by_deadline")}
              className={`py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                taskKind === "by_deadline"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-900/40"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bell className="w-4 h-4" />
              この日時まで
            </button>
          </div>
        </div>

        {/* 指定先 */}
        <div className="mb-4">
          <label className="text-muted-foreground text-xs uppercase tracking-wide mb-2 block">指定先</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(["self", "personal", "team", "all"] as AssignType[]).map(type => (
              <button
                key={type}
                onClick={() => setAssignType(type)}
                className={`py-2 rounded-xl text-xs font-medium transition-all ${
                  assignType === type
                    ? "bg-indigo-600 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {type === "self" && "自分のみ"}
                {type === "personal" && "個人指定"}
                {type === "team" && "チーム"}
                {type === "all" && "全職員"}
              </button>
            ))}
          </div>
          {assignType === "team" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TEAMS.map(team => (
                <button
                  key={team}
                  onClick={() => toggleTeam(team)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    assignTeams.includes(team) ? TEAM_COLORS[team] : "bg-muted text-muted-foreground"
                  }`}
                >
                  {team}
                </button>
              ))}
              {assignTeams.length > 0 && (
                <span className="text-xs text-muted-foreground self-center">
                  {assignTeams.join("・")}に送信
                </span>
              )}
            </div>
          )}
          {assignType === "personal" && (
            <div className="mt-2 space-y-1">
              <div className="flex flex-wrap gap-1.5 mb-1">
                {assignUserIds.map((id, i) => (
                  <span key={id} className="flex items-center gap-1 bg-indigo-900/50 text-indigo-300 text-xs px-2 py-1 rounded-lg">
                    {assignUserNames[i]}
                    <button onClick={() => toggleUser(id, assignUserNames[i])} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-muted text-foreground rounded-xl px-3 py-2.5 text-sm border border-border"
                  value=""
                  onChange={e => {
                    const id = Number(e.target.value);
                    if (!id) return;
                    const staff = staffList.find((s: any) => s.id === id);
                    if (staff && !assignUserIds.includes(id)) {
                      toggleUser(id, staff.name);
                    }
                  }}
                >
                  <option value="">スタッフを追加...</option>
                  {staffList.filter((s: any) => !assignUserIds.includes(s.id)).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}（{s.team}）</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={startStaffVoiceInput}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-colors flex-shrink-0 ${
                    isVoiceListening
                      ? "bg-red-500 border-red-500 text-white animate-pulse"
                      : "border-border bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  title="よみがな（苗字）で音声検索"
                >
                  {isVoiceListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
              {/* 音声候補リスト */}
              {voiceStaffCandidates.length > 0 && (
                <div className="bg-muted rounded-xl border border-border overflow-hidden mt-1">
                  <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">候補から選択してください</div>
                  {voiceStaffCandidates.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (!assignUserIds.includes(s.id)) {
                          setAssignUserIds(prev => [...prev, s.id]);
                          setAssignUserNames(prev => [...prev, s.name]);
                        }
                        setVoiceStaffCandidates([]);
                        toast.success(`「${s.name}」を選択しました`);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span>{s.name}</span>
                      {s.team && <span className="text-xs text-muted-foreground">（{s.team}）</span>}
                      {s.nameKana && <span className="text-xs text-muted-foreground ml-auto">{s.nameKana}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 期日・時刻 */}
        <div className="mb-4">
          <label className="text-muted-foreground text-xs uppercase tracking-wide mb-2 block">
            {taskKind === "at_time" ? "実施日時" : "期日"}
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="flex-1 bg-muted text-foreground rounded-xl px-3 py-2.5 text-sm border border-border"
            />
            <select
              value={dueTime}
              onChange={e => setDueTime(e.target.value)}
              className="w-28 bg-muted text-foreground rounded-xl px-3 py-2.5 text-sm border border-border"
            >
              <option value="">時刻選択</option>
              {Array.from({ length: 24 * 6 }, (_, i) => {
                const h = Math.floor(i / 6);
                const m = (i % 6) * 10;
                const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>
            {(dueDate || dueTime) && (
              <button onClick={() => { setDueDate(""); setDueTime(""); }}
                className="text-gray-500 hover:text-white px-1">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 内容 */}
        <div className="mb-4">
          <label className="text-muted-foreground text-xs uppercase tracking-wide mb-2 block">内容</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="タスクの内容を入力..."
            className="w-full bg-muted text-foreground rounded-xl px-3 py-2.5 text-sm min-h-[80px] resize-none placeholder-muted-foreground border border-border"
          />
        </div>

        {/* 繰り返し（「この日時にする」の場合のみ表示） */}
        {taskKind === "at_time" && (
          <div className="mb-6">
            <label className="text-muted-foreground text-xs uppercase tracking-wide mb-2 block flex items-center gap-1">
              <Repeat className="w-3.5 h-3.5" />繰り返し
            </label>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {(["none", "daily", "weekly", "biweekly", "monthly", "nth_weekday"] as RepeatType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setRepeatType(type)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${
                    repeatType === type
                      ? "bg-purple-600 text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "none" && "なし"}
                  {type === "daily" && "毎日"}
                  {type === "weekly" && "毎週"}
                  {type === "biweekly" && "隔週"}
                  {type === "monthly" && "毎月"}
                  {type === "nth_weekday" && "第N曜日"}
                </button>
              ))}
            </div>
            {(repeatType === "weekly" || repeatType === "biweekly") && (
              <div className="flex gap-1 mt-1">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button key={i} onClick={() => setRepeatDayOfWeek(i)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      repeatDayOfWeek === i ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"
                    }`}>{label}</button>
                ))}
              </div>
            )}
            {repeatType === "monthly" && (
              <div className="flex gap-2 mt-1 items-center">
                <select value={repeatMonthInterval} onChange={e => setRepeatMonthInterval(Number(e.target.value))}
                  className="bg-muted text-foreground rounded-xl px-2 py-2 text-sm border border-border">
                  {[1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n}ヶ月毎</option>)}
                </select>
                <select value={repeatDayOfMonth} onChange={e => setRepeatDayOfMonth(Number(e.target.value))}
                  className="bg-muted text-foreground rounded-xl px-2 py-2 text-sm border border-border">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}日</option>)}
                </select>
              </div>
            )}
            {repeatType === "nth_weekday" && (
              <div className="flex gap-2 mt-1 items-center flex-wrap">
                <select value={repeatNthWeek} onChange={e => setRepeatNthWeek(Number(e.target.value))}
                  className="bg-muted text-foreground rounded-xl px-2 py-2 text-sm border border-border">
                  {NTH_WEEK_VALUES.map((v, i) => <option key={v} value={v}>{NTH_WEEK_LABELS[i]}</option>)}
                </select>
                <div className="flex gap-1">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <button key={i} onClick={() => setRepeatNthDayOfWeek(i)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        repeatNthDayOfWeek === i ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"
                      }`}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            {repeatType !== "none" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-gray-500 text-xs whitespace-nowrap">終了日（任意）</span>
                <input type="date" value={repeatEndDate} onChange={e => setRepeatEndDate(e.target.value)}
                  className="flex-1 bg-muted text-foreground rounded-xl px-2 py-1.5 text-xs border border-border" />
                {repeatEndDate && (
                  <button onClick={() => setRepeatEndDate("")} className="text-gray-500 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-base"
        >
          {createMutation.isPending ? "追加中..." : "タスクを追加"}
        </Button>
      </div>
    </div>
  );
}

// ---- タスクカード ----
function TaskCard({
  task,
  onToggle,
  onDelete,
  currentUserId,
}: {
  task: any;
  onToggle: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
  currentUserId?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDone = task.done === 1;
  const taskKind: TaskKind = task.taskKind ?? "by_deadline";
  const dueDateStr = formatDueDate(task.dueDate, taskKind);
  const dueDateColor = getDueDateColor(task.dueDate, isDone);
  const repeatStr = formatRepeat(task);
  const isOverdue = dueDateColor.includes("red");

  // 作成者バッジ：自分以外が作成したタスクに「〇〇から依頼」を表示
  const isDelegatedToMe = task.createdBy && currentUserId && task.createdBy !== currentUserId;

  return (
    <div className={`rounded-xl border transition-all ${
      isDone
        ? "bg-muted/30 border-border/30 opacity-55"
        : isOverdue
          ? "bg-red-950/30 border-red-800/50"
          : "bg-card border-border"
    }`}>
      <div className="flex items-start gap-3 p-3">
        {/* 完了ボタン */}
        <button
          onClick={() => onToggle(task.id, !isDone)}
          className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            isDone
              ? "bg-green-600 border-green-600"
              : "border-gray-500 hover:border-green-500 hover:bg-green-900/30"
          }`}
        >
          {isDone && <Check className="w-3.5 h-3.5 text-white" />}
        </button>

        {/* コンテンツ */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.text}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {/* 種別 */}
            {taskKind === "at_time" ? (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />日時指定
              </span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex items-center gap-1">
                <Bell className="w-3 h-3" />期日
              </span>
            )}
            {/* 期日表示 */}
            {dueDateStr && (
              <span className={`text-xs flex items-center gap-0.5 ${dueDateColor}`}>
                {isOverdue && !isDone && <AlertTriangle className="w-3 h-3" />}
                {dueDateStr}
              </span>
            )}
            {/* 繰り返し */}
            {repeatStr && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-purple-900/50 text-purple-300 flex items-center gap-1">
                <Repeat className="w-3 h-3" />{repeatStr}
              </span>
            )}
            {/* 指定先 */}
            {task.assignType === "all" && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-700/60 text-gray-300 flex items-center gap-1">
                <Users className="w-3 h-3" />全職員
              </span>
            )}
            {task.assignType === "team" && task.assignTeam && (
              <span className={`text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 ${TEAM_COLORS[task.assignTeam as TeamName] ?? "bg-gray-700 text-gray-300"}`}>
                <Users className="w-3 h-3" />{task.assignTeam}
              </span>
            )}
            {task.assignType === "personal" && task.assignUserName && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-indigo-900/50 text-indigo-300 flex items-center gap-1">
                <User className="w-3 h-3" />{task.assignUserName}
              </span>
            )}
            {/* 作成者バッジ：他者から依頼されたタスク */}
            {isDelegatedToMe && task.createdByName && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-900/50 text-amber-300 flex items-center gap-1">
                <User className="w-3 h-3" />{task.createdByName}から依頼
              </span>
            )}
          </div>
        </div>

        {/* 展開ボタン */}
        <button onClick={() => setExpanded(!expanded)} className="text-gray-600 hover:text-gray-300 p-1 flex-shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* 展開時操作 */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/40">
          <button
            onClick={() => onDelete(task.id)}
            className="mt-2 flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />削除
          </button>
        </div>
      )}
    </div>
  );
}

// ---- メインページ ----
export default function PersonalTasks() {
  const { user, loading: authLoading } = useAuth();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const tasksQuery = trpc.personalTasks.getMyTasks.useQuery(
    { showDone: true },
    { refetchInterval: 5000, refetchOnWindowFocus: true }
  );
  const tasks = (tasksQuery.data ?? []) as any[];
  const utils = trpc.useUtils();

  const toggleMutation = trpc.personalTasks.toggleDone.useMutation({
    onMutate: async ({ id, done }) => {
      await utils.personalTasks.getMyTasks.cancel();
      const prev = utils.personalTasks.getMyTasks.getData({ showDone: true });
      utils.personalTasks.getMyTasks.setData({ showDone: true }, (old: any) =>
        old?.map((t: any) => t.id === id ? { ...t, done: done ? 1 : 0 } : t)
      );
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      utils.personalTasks.getMyTasks.setData({ showDone: true }, ctx?.prev);
    },
    onSettled: () => {
      // 全キャッシュを無効化してホーム画面の「今日の個人タスク」とも同期
      utils.personalTasks.getMyTasks.invalidate();
      utils.personalTasks.getTodayTasks.invalidate();
    },
  });

  const deleteMutation = trpc.personalTasks.delete.useMutation({
    onSuccess: () => {
      toast.success("タスクを削除しました");
      utils.personalTasks.getMyTasks.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredTasks = useMemo(() => {
    const currentUserId = user?.id;
    if (filterMode === "delegated") {
      // 「依頼した」：自分が作成して他者に割り当てたタスク
      return tasks.filter((t: any) =>
        t.createdBy === currentUserId &&
        t.assignType !== "self" &&
        t.assignUserId !== currentUserId
      );
    }
    if (filterMode === "at_time") {
      return tasks.filter((t: any) =>
        t.taskKind === "at_time" &&
        // 他者への依頼タスクは除外（自分が担当のもの or 自分が作成したもの）
        (t.assignUserId === currentUserId || t.createdBy === currentUserId || t.assignType === "self")
      );
    }
    if (filterMode === "by_deadline") {
      return tasks.filter((t: any) =>
        t.taskKind === "by_deadline" &&
        (t.assignUserId === currentUserId || t.createdBy === currentUserId || t.assignType === "self")
      );
    }
    // 「すべて」：自分に関係するタスク（他者への依頼は除外）
    return tasks.filter((t: any) =>
      t.assignUserId === currentUserId ||
      t.createdBy === currentUserId ||
      t.assignType === "self" ||
      t.assignType === "all" ||
      (t.assignType === "team" && t.assignTeam === user?.team)
    );
  }, [tasks, filterMode, user]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a: any, b: any) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [filteredTasks]);

  const pendingTasks = sortedTasks.filter((t: any) => t.done !== 1);
  const doneTasks = sortedTasks.filter((t: any) => t.done === 1);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }
  return (
    <div>
      <div className="max-w-lg mx-auto px-3 py-4 pb-24">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-400" />
            <h1 className="text-foreground font-bold text-lg">個人タスク</h1>
            {pendingTasks.length > 0 && (
              <Badge className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pendingTasks.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => tasksQuery.refetch()}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${tasksQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />追加
            </button>
          </div>
        </div>

        {/* フィルター */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {(["all", "at_time", "by_deadline", "delegated"] as FilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                filterMode === mode
                  ? "bg-indigo-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "all" && "すべて"}
              {mode === "at_time" && "日時指定"}
              {mode === "by_deadline" && "期日"}
              {mode === "delegated" && "依頼した"}
            </button>
          ))}

        </div>

        {/* 作成フォーム（インライン展開） */}
        {showCreateForm && user && (
          <CreateTaskForm
            onClose={() => setShowCreateForm(false)}
            onCreated={() => {
              utils.personalTasks.getMyTasks.invalidate();
              utils.personalTasks.getTodayTasks.invalidate();
            }}
            userTeam={user.team ?? null}
          />
        )}

        {/* 未完了タスク */}
        {tasksQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : pendingTasks.length === 0 ? (
          <div className="text-center py-14 text-gray-600">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">
              {filterMode === "delegated" ? "依頼したタスクはありません" : "未完了のタスクはありません"}
            </p>
            {filterMode !== "delegated" && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="mt-3 text-blue-500 text-sm hover:underline"
              >
                タスクを追加する
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {pendingTasks.map((task: any) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={(id, done) => toggleMutation.mutate({ id, done })}
                onDelete={(id) => deleteMutation.mutate({ id })}
                currentUserId={user?.id}
              />
            ))}
          </div>
        )}

        {/* 完了済みタスク */}
        {doneTasks.length > 0 && (
          <div className="mt-6">
            <h2 className="text-gray-600 text-xs font-medium mb-2 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />完了済み（{doneTasks.length}件）
            </h2>
            <div className="space-y-2">
              {doneTasks.map((task: any) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={(id, done) => toggleMutation.mutate({ id, done })}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                  currentUserId={user?.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
