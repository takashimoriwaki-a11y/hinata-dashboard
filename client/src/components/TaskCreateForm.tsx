/**
 * TaskCreateForm - タスク新規作成フォーム（共通コンポーネント）
 * Tasks.tsx と Dashboard.tsx の両方から利用する
 */
import { useState, useRef } from "react";
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

type AssignType = "all" | "team" | "personal";
const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

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

  // 音声入力
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 16 * 1024 * 1024) {
          toast.error("音声ファイルが大きすぎます（16MB以下）");
          return;
        }
        toast.info("文字起こし中...");
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: formData, credentials: "include" });
          const data = await res.json();
          if (data.text) {
            setNewText((prev) => prev + (prev ? " " : "") + data.text);
            toast.success("音声入力完了");
          } else {
            toast.error("文字起こしに失敗しました");
          }
        } catch {
          toast.error("音声入力エラー");
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      toast.error("マイクのアクセスが許可されていません");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

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
            <textarea
              placeholder="タスクの内容を入力..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={2}
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <button
              type="button"
              onClick={() => isRecording ? stopRecording() : startRecording()}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors self-end text-base",
                isRecording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-muted text-muted-foreground hover:bg-primary/20"
              )}
              title={isRecording ? "タップして停止" : "タップして開始"}
            >
              🎤
            </button>
          </div>
          {isRecording && (
            <p className="text-[10px] text-red-500 font-medium animate-pulse mt-1">● 録音中...もう一度タップすると停止</p>
          )}
        </div>

        {/* 期日・時刻 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              <Calendar className="w-3 h-3 inline mr-0.5" />期日（任意）
            </label>
            <div className="relative">
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary pr-7"
              />
              {newDueDate && (
                <button
                  type="button"
                  onClick={() => { setNewDueDate(""); setNewDueTime(""); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
                  title="期日をクリア"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">時刻（任意）</label>
            <div className="relative">
              <select
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
                disabled={!newDueDate}
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 pr-7"
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
                  onClick={() => setNewDueTime("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
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
