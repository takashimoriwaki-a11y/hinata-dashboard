/**
 * TaskCreateForm - タスク新規作成フォーム（共通コンポーネント）
 * Tasks.tsx と Dashboard.tsx の両方から利用する
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Calendar,
  User,
  Users,
  Globe,
  X,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useVoiceInput } from "@/hooks/useVoiceInput";

type AssignType = "all" | "team" | "personal";
type RepeatType = "none" | "weekly" | "monthly";
const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 音声入力の例文 */
const VOICE_EXAMPLES = [
  "○○チームの○○さんの自立支援医療受給者証を写真撮る",
  "○○チームの○○さんの上限管理表に×月×日□□円と記入する",
  "○○チームの○○さんに×月×日誕生日プレゼントを渡す",
  "○○チームの○○さんに×月×日の訪問時間が△時でいいか確認する",
];

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
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const [newAssignType, setNewAssignType] = useState<AssignType>("all");
  const [newAssignTeam, setNewAssignTeam] = useState<Team>("身体");
  const [newAssignUserId, setNewAssignUserId] = useState<number | null>(null);
  const [newAssignUserName, setNewAssignUserName] = useState<string>("");

  // 繰り返し設定
  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [repeatDayOfWeek, setRepeatDayOfWeek] = useState<number>(1);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState<number>(1);

  // AI解析状態
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [lastVoiceText, setLastVoiceText] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(() => {
    try { return !localStorage.getItem("taskVoiceHintDismissed"); } catch { return true; }
  });

  // スタッフ一覧（個人指定用）
  const { data: staff = [] } = trpc.tasks.getStaff.useQuery();

  // parseVoice mutation
  const parseVoice = trpc.tasks.parseVoice.useMutation({
    onSuccess: (data) => {
      setIsAnalyzing(false);
      setVoiceError(null);
      const f = data.fields;
      const missing: string[] = [];

      // タスク内容（空欄のみ上書き）
      if (f.text) {
        setNewText(prev => prev.trim() ? prev : f.text!);
      } else {
        setNewText(prev => { if (!prev.trim()) missing.push("タスク内容"); return prev; });
      }

      // 期日（空欄のみ上書き）
      if (f.dueDateStr) setNewDueDate(prev => prev.trim() ? prev : f.dueDateStr!);
      // 期日は任意なので未転記でも missing には追加しない

      // 指定先種別（現在が「all」のときのみ上書き）
      const assignType = (f.assignType as AssignType) || "all";
      setNewAssignType(prev => prev === "all" ? assignType : prev);

      // チーム指定: assignTypeがteamのときに設定（常に上書き — チーム名は明示的に話した場合は必ず反映）
      if (assignType === "team") {
        if (f.assignTeam && TEAMS.includes(f.assignTeam as Team)) {
          setNewAssignTeam(f.assignTeam as Team);
        } else {
          // チーム名が認識できなかった場合は missing に追加
          missing.push("チーム名（身体・天理・郡山北部・郡山南部）");
        }
      }

      // 個人指定: assignTypeがpersonalのときに設定（空欄のみ上書き）
      if (assignType === "personal") {
        if (f.assignPersonName) {
          const found = staff.find(s => s.name && s.name.includes(f.assignPersonName!));
          if (found) {
            setNewAssignUserId(prev => prev ?? found.id);
            setNewAssignUserName(prev => prev.trim() ? prev : (found.name ?? ""));
          } else {
            setNewAssignUserName(prev => prev.trim() ? prev : f.assignPersonName!);
          }
        } else {
          missing.push("担当者名");
        }
      }

      setMissingFields(missing);
      if (missing.length === 0) {
        toast.success("AI解析完了！内容を確認してください");
      }
    },
    onError: (e) => {
      setIsAnalyzing(false);
      setVoiceError(e.message ?? "AI解析に失敗しました");
    },
  });

  // 音声入力（認識完了後にAI解析へ）
  const taskVoice = useVoiceInput({
    onResult: (text: string) => {
      setLastVoiceText(text);
      setIsAnalyzing(true);
      setVoiceError(null);
      parseVoice.mutate({ text });
    },
  });

  // 例文タップでAI解析
  const handleExampleTap = (example: string) => {
    if (isAnalyzing || taskVoice.isRecording) return;
    setLastVoiceText(example);
    setIsAnalyzing(true);
    setVoiceError(null);
    parseVoice.mutate({ text: example });
  };

  // エラー時リトライ
  const handleRetry = () => {
    if (!lastVoiceText) return;
    setIsAnalyzing(true);
    setVoiceError(null);
    parseVoice.mutate({ text: lastVoiceText });
  };

  const handleDismissHint = () => {
    setShowHint(false);
    try { localStorage.setItem("taskVoiceHintDismissed", "1"); } catch {}
  };

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
    setVoiceError(null);
    setLastVoiceText(null);
  };

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      toast.success("タスクを追加しました");
      onSuccess?.();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

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

        {/* ===== 音声入力AIカード ===== */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
          {/* ヒントバナー（初回のみ） */}
          {showHint && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" />音声入力のコツ</span>
                <button type="button" onClick={handleDismissHint} className="text-amber-600 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"><X className="w-3.5 h-3.5" /></button>
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                <li>利用者名・期日・担当者を一言で話すだけでOK</li>
                <li>「○○さんの△△を来週金曜までに」のように話す</li>
                <li>下の例文をタップしてお試しください</li>
              </ul>
              <button type="button" onClick={handleDismissHint} className="mt-1 text-amber-700 dark:text-amber-400 font-medium underline underline-offset-2">わかりました！</button>
            </div>
          )}

          {/* マイクボタン + 状態表示 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); if (!isAnalyzing) taskVoice.toggleVoice(); }}
              disabled={isAnalyzing}
              className={cn(
                "relative inline-flex items-center justify-center flex-shrink-0 h-12 w-12 rounded-2xl",
                "border-2 transition-all duration-200 select-none touch-manipulation",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isAnalyzing
                  ? "bg-muted border-muted-foreground/30 text-muted-foreground cursor-wait"
                  : taskVoice.isRecording
                    ? (taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5
                        ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/40"
                        : "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/40")
                    : "bg-primary border-primary text-white hover:bg-primary/90 active:scale-95 shadow-md shadow-primary/30"
              )}
              aria-label={taskVoice.isRecording ? "録音停止" : "音声入力開始"}
            >
              {taskVoice.isRecording && (
                <span className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
                  <span className={cn("absolute inset-0 animate-ping rounded-[inherit] opacity-25",
                    taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5 ? "bg-orange-400" : "bg-red-400")} />
                </span>
              )}
              {isAnalyzing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : taskVoice.isRecording && taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5 ? (
                <span className="text-sm font-bold leading-none">{taskVoice.silenceCountdown}</span>
              ) : taskVoice.isRecording ? (
                <span className="flex items-end justify-center gap-px h-5">
                  {[0,1,2,3].map((i) => (
                    <span key={i} className="w-0.5 bg-white rounded-full" style={{ height: "60%", animation: "voiceBar 0.5s ease-in-out infinite alternate", animationDelay: `${i * 0.12}s` }} />
                  ))}
                </span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              {isAnalyzing ? (
                <p className="text-xs text-primary font-medium animate-pulse">AIが解析中...</p>
              ) : taskVoice.isRecording ? (
                <div>
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    {taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5
                      ? `あと${taskVoice.silenceCountdown}秒で自動停止`
                      : "話してください..."}
                  </p>
                  {taskVoice.interimText && (
                    <p className="text-xs text-muted-foreground italic truncate">{taskVoice.interimText}</p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium text-foreground">音声入力でAI自動転記</p>
                  <p className="text-xs text-muted-foreground">マイクをタップして話すと各項目に転記</p>
                </div>
              )}
            </div>
          </div>

          {/* エラーバナー */}
          {voiceError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-xs text-destructive">{voiceError}</p>
              {lastVoiceText && (
                <button type="button" onClick={handleRetry}
                  className="text-xs text-destructive font-medium underline underline-offset-2 flex-shrink-0">
                  もう一度試す
                </button>
              )}
            </div>
          )}

          {/* 未転記項目バナー */}
          {missingFields.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">聞き取れなかった項目があります</p>
              <div className="flex flex-wrap gap-1">
                {missingFields.map((field) => (
                  <span key={field} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-medium">{field}</span>
                ))}
              </div>
              <p className="text-[10px] text-amber-700 dark:text-amber-400">上記の項目だけもう一度マイクで話してください</p>
            </div>
          )}

          {/* 例文タップ */}
          {!taskVoice.isRecording && !isAnalyzing && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">例文をタップして試す</p>
              <div className="flex flex-col gap-1">
                {VOICE_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleExampleTap(ex)}
                    className="text-left text-xs px-2.5 py-1.5 rounded-lg border border-primary/20 bg-background hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-[0.98]"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              {!showHint && (
                <button type="button"
                  onClick={() => { setShowHint(true); try { localStorage.removeItem("taskVoiceHintDismissed"); } catch {} }}
                  className="text-[10px] text-primary/60 hover:text-primary underline underline-offset-2 transition-colors">
                  💡 ヒントを見る
                </button>
              )}
            </div>
          )}
        </div>

        {/* タスク内容 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">内容 *</label>
          <textarea
            placeholder="タスクの内容を入力..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={2}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
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
