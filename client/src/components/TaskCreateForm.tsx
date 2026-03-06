/**
 * TaskCreateForm - タスク新規作成フォーム（共通コンポーネント）
 * Tasks.tsx と Dashboard.tsx の両方から利用する
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Calendar,
  User,
  Users,
  Globe,
  ChevronUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { useVoiceInput } from "@/hooks/useVoiceInput";

type AssignType = "all" | "team" | "personal";
type RepeatType = "none" | "weekly" | "monthly";
const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

interface TaskCreateFormProps {
  /** フォームを閉じるときに呼ばれるコールバック */
  onClose: () => void;
  /** 作成成功後に呼ばれるコールバック */
  onSuccess?: () => void;
}

export default function TaskCreateForm({ onClose, onSuccess }: TaskCreateFormProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [newText, setNewText] = useState("");

  // 音声入力（interimTextを直接取得）
  const taskVoice = useVoiceInput({
    onResult: (text: string) => setNewText(prev => prev + (prev ? " " : "") + text),
  });
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const [newAssignType, setNewAssignType] = useState<AssignType>("all");
  const [newAssignTeam, setNewAssignTeam] = useState<Team>("身体");
  const [newAssignUserId, setNewAssignUserId] = useState<number | null>(null);
  const [newAssignUserName, setNewAssignUserName] = useState<string>("");

  // 繰り返し設定
  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [repeatDayOfWeek, setRepeatDayOfWeek] = useState<number>(1); // 月曜日デフォルト
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState<number>(1); // 1日デフォルト



  // スタッフ一覧（個人指定用）
  const { data: staff = [] } = trpc.tasks.getStaff.useQuery();

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      toast.success("タスクを追加しました");
      onSuccess?.();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleClear = () => {
    setNewText("");
    setNewDueDate("");
    setNewDueTime("");
    setNewAssignType("all");
    setNewAssignTeam("身体");
    setNewAssignUserId(null);
    setNewAssignUserName("");
    setRepeatType("none");
    setRepeatDayOfWeek(1);
    setRepeatDayOfMonth(1);
  };

  const handleAdd = () => {
    if (!newText.trim()) {
      toast.error("タスクの内容を入力してください");
      return;
    }
    let dueDate: Date | undefined;
    if (newDueDate) {
      const dateTimeStr = newDueTime ? `${newDueDate}T${newDueTime}` : `${newDueDate}T00:00`;
      dueDate = new Date(dateTimeStr);
    }
    createTask.mutate({
      text: newText.trim(),
      dueDate,
      assignType: newAssignType,
      assignTeam: newAssignType === "team" ? newAssignTeam : undefined,
      assignUserId: newAssignType === "personal" && newAssignUserId ? newAssignUserId : undefined,
      assignUserName: newAssignType === "personal" ? newAssignUserName : undefined,
      repeatType,
      repeatDayOfWeek: repeatType === "weekly" ? repeatDayOfWeek : undefined,
      repeatDayOfMonth: repeatType === "monthly" ? repeatDayOfMonth : undefined,
    });
  };

  return (
    <Card className="shadow-sm border-primary/20">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-primary" />
          タスクを追加
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* タスク内容 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">内容 *</label>
          <div className="flex gap-1.5">
            <div className="flex-1 space-y-1.5">
              <textarea
                placeholder="タスクの内容を入力..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                rows={2}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              {/* 音声認識中の暫定テキストプレビュー */}
              {taskVoice.isRecording && (
                <div className="px-2 py-1.5 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 min-h-[28px]">
                  {taskVoice.interimText ? (
                    <p className="text-xs text-red-600 dark:text-red-400 italic leading-relaxed">
                      🎤 {taskVoice.interimText}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">話してください...</p>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); taskVoice.toggleVoice(); }}
              className={cn(
                "relative inline-flex items-center justify-center flex-shrink-0 h-10 w-10 rounded-xl self-end",
                "border transition-all duration-200 select-none touch-manipulation",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                taskVoice.isRecording
                  ? "bg-red-500 border-red-400 text-white shadow-md shadow-red-500/40"
                  : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 active:scale-95"
              )}
              aria-label={taskVoice.isRecording ? "録音停止" : "音声入力開始"}
            >
              {taskVoice.isRecording && (
                <span className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
                  <span className="absolute inset-0 animate-ping rounded-[inherit] bg-red-400 opacity-25" />
                </span>
              )}
              {taskVoice.isRecording ? (
                <span className="flex items-end justify-center gap-px h-4">
                  {[0,1,2,3].map((i) => (
                    <span key={i} className="w-0.5 bg-white rounded-full" style={{ height: "60%", animation: "voiceBar 0.5s ease-in-out infinite alternate", animationDelay: `${i * 0.12}s` }} />
                  ))}
                </span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* 期日・時刻 */}
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              <Calendar className="w-3 h-3 inline mr-0.5" />期日（任意）
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="flex-1 text-sm border border-border rounded-lg px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {newDueDate && (
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); setNewDueDate(""); setNewDueTime(""); }}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  title="期日をクリア"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">時刻（任意）</label>
            <div className="flex items-center gap-1.5">
              <select
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
                disabled={!newDueDate}
                className="flex-1 text-sm border border-border rounded-lg px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
              >
                <option value="">時刻を選択...</option>
                {Array.from({ length: 24 * 6 }, (_, i) => {
                  const h = Math.floor(i / 6);
                  const m = (i % 6) * 10;
                  const hh = String(h).padStart(2, "0");
                  const mm = String(m).padStart(2, "0");
                  return (
                    <option key={`${hh}:${mm}`} value={`${hh}:${mm}`}>
                      {hh}:{mm}
                    </option>
                  );
                })}
              </select>
              {newDueTime && (
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); setNewDueTime(""); }}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  title="時刻をクリア"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 指定先 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">指定先</label>
          <div className="flex gap-2 mb-2">
            {([
              { value: "all", label: "全員", icon: Globe },
              { value: "team", label: "チーム", icon: Users },
              { value: "personal", label: "個人", icon: User },
            ] as const).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setNewAssignType(value)}
                className={cn(
                  "flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors flex-1 justify-center",
                  newAssignType === value
                    ? "bg-primary text-white border-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* チーム選択 */}
          {newAssignType === "team" && (
            <div className="flex flex-wrap gap-1.5">
              {TEAMS.map((team) => (
                <button
                  key={team}
                  onClick={() => setNewAssignTeam(team)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    newAssignTeam === team
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-border text-muted-foreground hover:border-blue-600 hover:text-blue-600"
                  )}
                >
                  {team}チーム
                </button>
              ))}
            </div>
          )}

          {/* 個人選択 */}
          {newAssignType === "personal" && (
            <select
              value={newAssignUserId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setNewAssignUserId(id || null);
                const found = staff.find((s) => s.id === id);
                setNewAssignUserName(found?.name ?? "");
              }}
              className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">スタッフを選択...</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? "名前なし"}{s.team ? ` (${s.team})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 繰り返し設定 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">繰り返し</label>
          <div className="flex gap-2 mb-2">
            {([
              { value: "none", label: "なし" },
              { value: "weekly", label: "毎週" },
              { value: "monthly", label: "毎月" },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setRepeatType(value)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg border transition-colors flex-1 justify-center",
                  repeatType === value
                    ? "bg-primary text-white border-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {repeatType === "weekly" && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => setRepeatDayOfWeek(idx)}
                  className={cn(
                    "text-xs w-9 h-9 rounded-full border transition-colors font-medium",
                    repeatDayOfWeek === idx
                      ? "bg-primary text-white border-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          )}
          {repeatType === "monthly" && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">毎月</label>
              <select
                value={repeatDayOfMonth}
                onChange={(e) => setRepeatDayOfMonth(Number(e.target.value))}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}日</option>
                ))}
              </select>
              <label className="text-xs text-muted-foreground">に自動生成</label>
            </div>
          )}
        </div>

        {/* 作成者（自動） */}
        <p className="text-xs text-muted-foreground">
          作成者: <span className="font-medium text-foreground">{user?.name ?? "あなた"}</span>（自動付与）
        </p>

        {/* 追加ボタン */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => { handleClear(); onClose(); }}
          >
            キャンセル
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={handleAdd}
            disabled={createTask.isPending || !newText.trim()}
          >
            {createTask.isPending ? "追加中..." : "タスクを追加"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
