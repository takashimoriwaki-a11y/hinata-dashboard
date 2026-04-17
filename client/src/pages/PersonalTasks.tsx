/**
 * PersonalTasks - 個人タスク管理ページ（利用者と無関係の個人タスク）
 * - 自分のみ / 個人指定（複数）/ チーム（複数）/ 全職員 への指定
 * - この日時にする（at_time）/ この日時まで（by_deadline）の区別
 * - 繰り返し設定：毎日・毎週・隔週・毎月（N月毎）・第N曜日
 * - 期日順（直近から）表示
 * - 音声入力によるAI自動転記
 */
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, Plus, Check, Trash2, ChevronDown, ChevronUp,
  Clock, Repeat, Users, User, RefreshCw, X, Bell, AlertTriangle,
  Mic, MicOff, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useVoiceInput, formatElapsedTime } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

// ---- 型定義 ----
type AssignType = "self" | "personal" | "team" | "all";
type TeamName = "身体" | "天理" | "郡山北部" | "郡山南部" | "事務員";
type RepeatType = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "nth_weekday";
type TaskKind = "at_time" | "by_deadline";

const TEAMS: TeamName[] = ["身体", "天理", "郡山北部", "郡山南部", "事務員"];
const TEAM_COLORS: Record<TeamName, string> = {
  "身体": "bg-emerald-700/80 text-emerald-100",
  "天理": "bg-sky-700/80 text-sky-100",
  "郡山北部": "bg-orange-700/80 text-orange-100",
  "郡山南部": "bg-rose-700/80 text-rose-100",
  "事務員": "bg-violet-700/80 text-violet-100",
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
  if (diffDays < 0) return "text-red-600 dark:text-red-400 font-semibold";
  if (diffDays === 0) return "text-orange-600 dark:text-orange-400 font-semibold";
  if (diffDays <= 3) return "text-amber-600 dark:text-yellow-400";
  return "text-gray-600 dark:text-gray-400";
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
}

export function CreateTaskForm({ onClose, onCreated, userTeam }: CreateFormProps) {
  const [text, setText] = useState("");
  const [taskKind, setTaskKind] = useState<TaskKind>("by_deadline");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [assignType, setAssignType] = useState<AssignType>("self");
  // 複数チーム選択
  const [selectedTeams, setSelectedTeams] = useState<TeamName[]>([]);
  // 複数個人指定
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedUserNames, setSelectedUserNames] = useState<string[]>([]);
  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [repeatDayOfWeek, setRepeatDayOfWeek] = useState<number>(1);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState<number>(1);
  const [repeatMonthInterval, setRepeatMonthInterval] = useState<number>(1);
  const [repeatNthWeek, setRepeatNthWeek] = useState<number>(1);
  const [repeatNthDayOfWeek, setRepeatNthDayOfWeek] = useState<number>(1);
  const [repeatEndDate, setRepeatEndDate] = useState("");

  // 音声入力状態
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [lastVoiceText, setLastVoiceText] = useState<string | null>(null);

  const staffQuery = trpc.staff.listForForm.useQuery();
  const staffList = (staffQuery.data ?? []) as any[];

  const createMutation = trpc.personalTasks.create.useMutation({
    onSuccess: () => {
      toast.success("タスクを追加しました");
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  // 音声解析ミューテーション
  const parseVoiceMutation = trpc.personalTasks.parseVoice.useMutation({
    onSuccess: (result) => {
      setIsAnalyzing(false);
      if (!result.success || !result.fields) return;
      const f = result.fields as any;
      // テキスト
      if (f.text) setText(f.text);
      // 期日
      if (f.dueDateStr) setDueDate(f.dueDateStr);
      if (f.dueTimeStr) setDueTime(f.dueTimeStr);
      // 指定先
      if (f.assignType) setAssignType(f.assignType as AssignType);
      // 複数チーム
      if (f.assignTeams && Array.isArray(f.assignTeams) && f.assignTeams.length > 0) {
        const validTeams = f.assignTeams.filter((t: string) => TEAMS.includes(t as TeamName)) as TeamName[];
        setSelectedTeams(validTeams);
      }
      // 複数個人
      if (f.assignPersonNames && Array.isArray(f.assignPersonNames) && f.assignPersonNames.length > 0) {
        const matched: { id: number; name: string }[] = [];
        for (const name of f.assignPersonNames) {
          const found = staffList.find((s: any) =>
            s.name === name || s.name.includes(name) || name.includes(s.name.split(" ")[0])
          );
          if (found && !matched.find(m => m.id === found.id)) {
            matched.push({ id: found.id, name: found.name });
          }
        }
        if (matched.length > 0) {
          setSelectedUserIds(matched.map(m => m.id));
          setSelectedUserNames(matched.map(m => m.name));
          toast.success(`担当者「${matched.map(m => m.name).join("・")}」を自動選択しました`);
        }
      }
    },
    onError: (e) => {
      setIsAnalyzing(false);
      setVoiceError(e.message ?? "AI解析に失敗しました");
    },
  });

  // 音声入力フック
  const voice = useVoiceInput({
    onResult: (transcribedText: string) => {
      setLastVoiceText(transcribedText);
      setIsAnalyzing(true);
      setVoiceError(null);
      parseVoiceMutation.mutate({
        text: transcribedText,
        staffNames: staffList.map((s: any) => s.name).filter(Boolean) as string[],
      });
    },
  });

  // チーム選択トグル
  const toggleTeam = useCallback((team: TeamName) => {
    setSelectedTeams(prev =>
      prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
    );
  }, []);

  // 個人指定トグル
  const toggleUser = useCallback((id: number, name: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(id)) {
        setSelectedUserNames(ns => ns.filter(n => n !== name));
        return prev.filter(i => i !== id);
      } else {
        setSelectedUserNames(ns => [...ns, name]);
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
    createMutation.mutate({
      text: text.trim(),
      taskKind,
      dueDate: dueDateObj,
      assignType,
      // 複数チーム
      assignTeams: assignType === "team" && selectedTeams.length > 0 ? selectedTeams : undefined,
      assignTeam: assignType === "team" && selectedTeams.length > 0 ? selectedTeams[0] as any : undefined,
      // 複数個人
      assignUserIds: assignType === "personal" && selectedUserIds.length > 0 ? selectedUserIds : undefined,
      assignUserNames: assignType === "personal" && selectedUserNames.length > 0 ? selectedUserNames : undefined,
      assignUserId: assignType === "personal" && selectedUserIds.length > 0 ? selectedUserIds[0] : undefined,
      assignUserName: assignType === "personal" && selectedUserNames.length > 0 ? selectedUserNames[0] : undefined,
      repeatType,
      repeatDayOfWeek: ["weekly", "biweekly"].includes(repeatType) ? repeatDayOfWeek : undefined,
      repeatDayOfMonth: repeatType === "monthly" ? repeatDayOfMonth : undefined,
      repeatMonthInterval: repeatType === "monthly" ? repeatMonthInterval : undefined,
      repeatNthWeek: repeatType === "nth_weekday" ? repeatNthWeek : undefined,
      repeatNthDayOfWeek: repeatType === "nth_weekday" ? repeatNthDayOfWeek : undefined,
      repeatEndDate: repeatType !== "none" ? repeatEndDateObj : undefined,
    });
  }, [text, taskKind, dueDate, dueTime, assignType, selectedTeams, selectedUserIds, selectedUserNames,
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

        {/* ===== 音声入力AIカード ===== */}
        <div className={cn(
          "rounded-xl border p-3 mb-4 space-y-2 transition-colors duration-300",
          voice.isRecording
            ? (voice.silenceCountdown !== null && voice.silenceCountdown <= 5
                ? "border-orange-400/50 bg-orange-950/20"
                : "border-red-400/50 bg-red-950/20")
            : isAnalyzing
              ? "border-blue-400/30 bg-blue-950/20"
              : "border-blue-400/20 bg-blue-950/10"
        )}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <p className="text-xs text-blue-400 font-medium">AIが解析中...</p>
                </div>
              ) : voice.isRecording ? (
                <div>
                  <p className="text-xs font-semibold text-blue-300">音声入力でAI自動転記</p>
                  <p className={cn(
                    "text-xs font-medium mt-0.5",
                    voice.silenceCountdown !== null && voice.silenceCountdown <= 5
                      ? "text-orange-400"
                      : "text-red-400 animate-pulse"
                  )}>
                    {voice.silenceCountdown !== null && voice.silenceCountdown <= 5
                      ? `あと${voice.silenceCountdown}秒で自動停止`
                      : `🎤 話してください... ${formatElapsedTime(voice.elapsedSeconds)}`}
                  </p>
                </div>
              ) : voiceError ? (
                <div>
                  <p className="text-xs text-red-400 font-medium">{voiceError}</p>
                  {lastVoiceText && (
                    <button
                      onClick={() => {
                        setIsAnalyzing(true);
                        setVoiceError(null);
                        parseVoiceMutation.mutate({
                          text: lastVoiceText,
                          staffNames: staffList.map((s: any) => s.name).filter(Boolean) as string[],
                        });
                      }}
                      className="text-xs text-blue-400 hover:underline mt-0.5"
                    >
                      再試行
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-blue-300">音声入力でAI自動転記</p>
                  <p className="text-xs text-muted-foreground mt-0.5">マイクをタップして話すと各項目に転記</p>
                </div>
              )}
            </div>
            {/* マイクボタン */}
            <button
              type="button"
              onClick={() => { if (!isAnalyzing) voice.toggleVoice(); }}
              disabled={isAnalyzing}
              className={cn(
                "relative flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-200 flex-shrink-0",
                isAnalyzing
                  ? "bg-muted border-muted-foreground/30 text-muted-foreground cursor-wait"
                  : voice.isRecording
                    ? (voice.silenceCountdown !== null && voice.silenceCountdown <= 5
                        ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/40"
                        : "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/40 animate-pulse")
                    : "bg-blue-600 border-blue-500 text-white hover:bg-blue-700 shadow-md shadow-blue-600/30"
              )}
            >
              {isAnalyzing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : voice.isRecording ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          </div>
          {/* 認識中テキスト */}
          {voice.isRecording && voice.interimText && (
            <p className="text-xs text-muted-foreground italic bg-muted/30 rounded-lg px-2 py-1">
              {voice.interimText}
            </p>
          )}
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

          {/* チーム複数選択 */}
          {assignType === "team" && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1.5">複数選択可</p>
              <div className="flex flex-wrap gap-1.5">
                {TEAMS.map(team => (
                  <button
                    key={team}
                    onClick={() => toggleTeam(team)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedTeams.includes(team)
                        ? TEAM_COLORS[team]
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selectedTeams.includes(team) && "✓ "}{team}
                  </button>
                ))}
              </div>
              {selectedTeams.length > 0 && (
                <p className="text-xs text-blue-400 mt-1">
                  選択中: {selectedTeams.join("・")}
                </p>
              )}
            </div>
          )}

          {/* 個人指定複数選択 */}
          {assignType === "personal" && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1.5">複数選択可</p>
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl bg-muted/30 p-2 border border-border">
                {staffList.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">読み込み中...</p>
                ) : staffList.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => toggleUser(s.id, s.name)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                      selectedUserIds.includes(s.id)
                        ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/50"
                        : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5" />
                      {s.name}
                    </span>
                    <span className="text-xs opacity-60">{s.team}</span>
                    {selectedUserIds.includes(s.id) && (
                      <Check className="w-3.5 h-3.5 text-indigo-300 ml-1" />
                    )}
                  </button>
                ))}
              </div>
              {selectedUserNames.length > 0 && (
                <p className="text-xs text-blue-400 mt-1">
                  選択中: {selectedUserNames.join("・")}
                </p>
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
            <input
              type="time"
              value={dueTime}
              onChange={e => setDueTime(e.target.value)}
              className="w-28 bg-muted text-foreground rounded-xl px-3 py-2.5 text-sm border border-border"
            />
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

        {/* 繰り返し：「この日時まで」選択時は非表示 */}
        {taskKind !== "by_deadline" ? (<div className="mb-6">
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
        </div>) : null}

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

  // 複数チーム・複数個人の表示用データ
  const assignTeams: string[] = useMemo(() => {
    try {
      if (task.assignTeams) return JSON.parse(task.assignTeams);
    } catch {}
    return task.assignTeam ? [task.assignTeam] : [];
  }, [task.assignTeams, task.assignTeam]);

  const assignUserNames: string[] = useMemo(() => {
    try {
      if (task.assignUserNames) return JSON.parse(task.assignUserNames);
    } catch {}
    return task.assignUserName ? [task.assignUserName] : [];
  }, [task.assignUserNames, task.assignUserName]);

  return (
    <div className={`rounded-xl border transition-all ${
      isDone
        ? "bg-muted/30 border-border/30 opacity-55"
        : isOverdue
          ? "bg-red-950/30 border-red-800/50"
          : taskKind === "at_time"
            ? "bg-blue-950/30 border-blue-800/40"
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
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200 flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3" />日時指定
              </span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-200 flex items-center gap-1 font-medium">
                <Bell className="w-3 h-3" />期日
              </span>
            )}
            {/* 期日表示 */}
            {dueDateStr && (
              <span className={`text-xs font-medium flex items-center gap-0.5 ${dueDateColor}`}>
                {isOverdue && !isDone && <AlertTriangle className="w-3 h-3" />}
                {dueDateStr}
              </span>
            )}
            {/* 繰り返し */}
            {repeatStr && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-200 flex items-center gap-1 font-medium">
                <Repeat className="w-3 h-3" />{repeatStr}
              </span>
            )}
            {/* 指定先 */}
            {task.assignType === "all" && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 flex items-center gap-1 font-medium">
                <Users className="w-3 h-3" />全職員
              </span>
            )}
            {task.assignType === "team" && assignTeams.map((team: string) => (
              <span key={team} className={`text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium ${TEAM_COLORS[team as TeamName] ?? "bg-gray-200 text-gray-700"}`}>
                <Users className="w-3 h-3" />{team}
              </span>
            ))}
            {task.assignType === "personal" && assignUserNames.map((name: string) => (
              <span key={name} className="text-xs px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200 flex items-center gap-1 font-medium">
                <User className="w-3 h-3" />{name}
              </span>
            ))}
            {/* 作成者（自分以外が作成したタスクの場合に目立つバッジで表示） */}
            {task.createdByName && task.createdBy !== currentUserId && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200 flex items-center gap-1 font-medium">
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
  const [showDone, setShowDone] = useState(false);
  const [filterKind, setFilterKind] = useState<"all" | TaskKind | "delegated">("all");

  const tasksQuery = trpc.personalTasks.getMyTasks.useQuery(
    { showDone },
    { refetchInterval: 30000 }
  );
  const tasks = (tasksQuery.data ?? []) as any[];
  const utils = trpc.useUtils();

  const toggleMutation = trpc.personalTasks.toggleDone.useMutation({
    onMutate: async ({ id, done }) => {
      await utils.personalTasks.getMyTasks.cancel();
      const prev = utils.personalTasks.getMyTasks.getData({ showDone });
      utils.personalTasks.getMyTasks.setData({ showDone }, (old: any) =>
        old?.map((t: any) => t.id === id ? { ...t, done: done ? 1 : 0 } : t)
      );
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      utils.personalTasks.getMyTasks.setData({ showDone }, ctx?.prev);
    },
    onSettled: () => utils.personalTasks.getMyTasks.invalidate(),
  });

  const deleteMutation = trpc.personalTasks.delete.useMutation({
    onSuccess: () => {
      toast.success("タスクを削除しました");
      utils.personalTasks.getMyTasks.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // 「依頼した」タスク判定ヘルパー（自分が作成して他の職員に依頼したタスク）
  const isDelegatedTask = useCallback((t: any) => {
    if (t.createdBy !== user?.id) return false;
    if (t.assignType !== "personal") return false;
    if (t.assignUserIds) {
      try {
        const ids: number[] = JSON.parse(t.assignUserIds);
        return ids.some((id: number) => id !== user?.id);
      } catch {}
    }
    return t.assignUserId !== user?.id;
  }, [user?.id]);

  const filteredTasks = useMemo(() => {
    if (filterKind === "all") {
      // 「すべて」では依頼したタスクを除外（「依頼した」タブにのみ表示）
      return tasks.filter((t: any) => !isDelegatedTask(t));
    }
    if (filterKind === "delegated") {
      // 自分が作成して他のスタッフに依頼したタスク（単一・複数個人指定両対応）
      return tasks.filter((t: any) => isDelegatedTask(t));
    }
    return tasks.filter((t: any) => t.taskKind === filterKind && !isDelegatedTask(t));
  }, [tasks, filterKind, isDelegatedTask]);

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
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(["all", "at_time", "by_deadline", "delegated"] as const).map(kind => (
            <button
              key={kind}
              onClick={() => setFilterKind(kind)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                filterKind === kind
                  ? kind === "delegated" ? "bg-amber-500 text-white" : "bg-indigo-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {kind === "all" && "すべて"}
              {kind === "at_time" && "日時指定"}
              {kind === "by_deadline" && "期日"}
              {kind === "delegated" && "👤 依頼した"}
            </button>
          ))}
          <button
            onClick={() => setShowDone(!showDone)}
            className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              showDone ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {showDone ? "完了を非表示" : "完了を表示"}
          </button>
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
            <p className="text-sm">未完了のタスクはありません</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-3 text-blue-500 text-sm hover:underline"
            >
              タスクを追加する
            </button>
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
        {showDone && doneTasks.length > 0 && (
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
