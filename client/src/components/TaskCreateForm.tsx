/**
 * TaskCreateForm - タスク新規作成フォーム（共通コンポーネント）
 * Tasks.tsx と Dashboard.tsx の両方から利用する
 */
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Calendar,
  User,
  Users,
  Globe,
  X,
  Loader2,
  UserRound,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";
import { trpc } from "@/lib/trpc";
import { VoiceHelpDialog } from "@/components/VoiceHelpDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { useVoiceInput } from "@/hooks/useVoiceInput";

type AssignType = "all" | "team" | "personal";
type RepeatType = "none" | "weekly" | "monthly";
const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 音声入力の例文 */
const VOICE_EXAMPLES = [
  "○○チームの○○さん、×月×日に自立支援医療の受給者証の写真を撮る",
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
  const [_newAssignType, setNewAssignType] = useState<AssignType>("all");
  const [newAssignTeam, setNewAssignTeam] = useState<Team>("身体");
  const [newAssignUserId, setNewAssignUserId] = useState<number | null>(null);
  const [newAssignUserName, setNewAssignUserName] = useState<string>("");

  // 利用者名選択
  const [patientName, setPatientName] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  // 複数候補ダイアログ
  const [patientCandidates, setPatientCandidates] = useState<Array<{ id: number; name: string; nameKana?: string | null; team?: string | null }>>([]);
  const [showCandidateDialog, setShowCandidateDialog] = useState(false);
  // 音声転記待機検索クエリ
  const [pendingPatientSearch, setPendingPatientSearch] = useState<string | null>(null);
  // AIが返した利用者名（allPatientsロード後にマッチング処理するために保持）— チーム情報も保持
  const [pendingAiPatient, setPendingAiPatient] = useState<{ name: string; assignType: AssignType; assignTeam: Team | null } | null>(null);

  // 繰り返し設定
  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [repeatDayOfWeek, setRepeatDayOfWeek] = useState<number>(1);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState<number>(1);

  // AI解析状態
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [lastVoiceText, setLastVoiceText] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  // 誤変換報告機能
  const [voiceTranscribed, setVoiceTranscribed] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackWrongField, setFeedbackWrongField] = useState("");
  const [feedbackWrongValue, setFeedbackWrongValue] = useState("");
  const [feedbackCorrectValue, setFeedbackCorrectValue] = useState("");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  // 全チームユーザーの判定（デフォルト設定用）
  const isAllTeamUser = user?.team === "全チーム" || user?.team === "事務員";
  // assignTypeはすべてのユーザーが変更可能
  const newAssignType: AssignType = _newAssignType;
  const setAssignTypeSafe = (type: AssignType | ((prev: AssignType) => AssignType)) => {
    if (typeof type === "function") {
      setNewAssignType(type);
    } else {
      setNewAssignType(type);
    }
  };

  // ログインユーザーの所属チームをデフォルトに設定
  useEffect(() => {
    if (!user?.team) return;
    // usersテーブルのteam列は「身体」「天理」「郡山北部」「郡山南部」「事務員」「全チーム」
    // TaskCreateFormのTeam型は「身体」「天理」「郡山北部」「郡山南部」のみ
    const validTeams: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
    if (user.team === "全チーム" || user.team === "事務員") {
      // 全チーム所属・事務員は必ず「全員」をデフォルトに設定（先に判定してteam上書きを防ぐ）
      setAssignTypeSafe("all");
    } else if (validTeams.includes(user.team as Team)) {
      setNewAssignTeam(user.team as Team);
      setAssignTypeSafe("team");
    }
  }, [user?.team]);

  // スタッフ一覧（個人指定用）
  const { data: staff = [] } = trpc.tasks.getStaff.useQuery();

  // 全利用者一覧（音声転記AI用）— チーム絞り込みなし、常に全件取得
  const { data: allPatients = [] } = trpc.patients.list.useQuery({});
  // allPatientsRef: クロージャ問題を回避するために最新値をRefで保持
  const allPatientsRef = useRef(allPatients);
  useEffect(() => { allPatientsRef.current = allPatients; }, [allPatients]);
  // pendingTeamPatientRef: チーム変更後にteamPatientsが再フェッチされるまで利用者名を保留する
  const pendingTeamPatientRef = useRef<string | null>(null);

  // parseVoice mutation
  const parseVoice = trpc.tasks.parseVoice.useMutation({
    onSuccess: (data) => {
      setIsAnalyzing(false);
      setVoiceError(null);
      const f = data.fields;
      const missing: string[] = [];
      // タスク内容（空欄のみ上書き））
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
      // チーム名を明示した場合のみ上書き、それ以外は現在の値を維持
      if (assignType === "team") {
        setAssignTypeSafe("team");
        if (f.assignTeam && TEAMS.includes(f.assignTeam as Team)) {
          setNewAssignTeam(f.assignTeam as Team);
        } else {
          // チーム名が認識できなかった場合は missing に追加
          missing.push("チーム名（身体・天理・郡山北部・郡山南部）");
        }
      } else if (assignType === "personal") {
        setAssignTypeSafe("personal");
      }
      // assignType === "all" の場合は現在の選択（チーム・個人）を維持する

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

      // 利用者名自動転記: AIが返した名前を最新のallPatientsで即座にマッチング
      if (f.patientName) {
        const aiName = f.patientName.trim();
        const latestPatients = allPatientsRef.current;
        const applyPatient = (name: string) => {
          // チーム・個人の設定は上の144-156行目で既に処理済みのため、ここでは利用者名のみセット
          // （setAssignTypeSafeを再度呼ぶと現在のチーム選択が上書きされる問題を防ぐ）
          setPatientName(name);
          toast.success(`利用者「${name}」を自動選択しました`);
        };
        if (latestPatients.length > 0) {
          // 完全一致
          const exactMatch = latestPatients.find((p) => p.name === aiName);
          if (exactMatch) {
            applyPatient(exactMatch.name);
          } else {
            // 部分一致
            const partialMatch = latestPatients.filter(
              (p) => p.name.includes(aiName) || aiName.includes(p.name.split('\u3000')[0].split(' ')[0])
            );
            if (partialMatch.length === 1) {
              applyPatient(partialMatch[0].name);
            } else if (partialMatch.length > 1) {
              setPatientCandidates(partialMatch);
              setShowCandidateDialog(true);
            } else {
              // 一致なし→useEffectフォールバックへ（チーム情報も保持）
              setPendingAiPatient({ name: aiName, assignType, assignTeam: (f.assignTeam as Team | null) ?? null });
            }
          }
        } else {
          // まだロードされていない→useEffectフォールバックへ（チーム情報も保持）
          setPendingAiPatient({ name: aiName, assignType, assignTeam: (f.assignTeam as Team | null) ?? null });
        }
      }

      setMissingFields(missing);
      setVoiceTranscribed(true); // 誤変換報告ボタンを表示する
      if (missing.length === 0) {
        toast.success("AI解析完了！内容を確認してください");
      }
      // 転記されたフィールドを黄色フラッシュでハイライト
      const flashIds: string[] = [];
      if (f.text) flashIds.push("task-content-textarea");
      if (f.dueDateStr) flashIds.push("task-due-date");
      if (f.assignType && f.assignType !== "all") flashIds.push("task-assign-type");
      if (f.assignTeam) flashIds.push("task-assign-team");
      if (f.patientName) flashIds.push("task-patient-name");
      setTimeout(() => {
        flashIds.forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            el.classList.remove("field-flash");
            void el.offsetWidth;
            el.classList.add("field-flash");
            el.addEventListener("animationend", () => el.classList.remove("field-flash"), { once: true });
          }
        });
      }, 100);
    },
    onError: (e) => {
      setIsAnalyzing(false);
      setVoiceError(e.message ?? "AI解析に失敗しました");
    },
  });

   // 音声入力（認識完了後AI解析へ）
  const taskVoice = useVoiceInput({
    onResult: (text: string) => {
      setLastVoiceText(text);
      setIsAnalyzing(true);
      setVoiceError(null);
      parseVoice.mutate({
        text,
        patientNamesWithKana: allPatientsRef.current.map((p) => ({ name: p.name, kana: p.nameKana ?? '' })),
        staffNames: staff.map((s) => s.name).filter(Boolean) as string[],
      });
    },
    context: "task",
  });

  // エラー時リトライ
  const handleRetry = () => {
    if (!lastVoiceText) return;
    setIsAnalyzing(true);
    setVoiceError(null);
    parseVoice.mutate({
      text: lastVoiceText,
      patientNamesWithKana: allPatientsRef.current.map((p) => ({ name: p.name, kana: p.nameKana ?? '' })),
      staffNames: staff.map((s) => s.name).filter(Boolean) as string[],
    });
  };


  // 利用者検索クエリ（フリーテキスト入力時）
  const { data: patientResults = [] } = trpc.patients.search.useQuery(
    { query: patientQuery },
    { enabled: patientQuery.length >= 1 }
  );

  // チーム別利用者一覧（チーム選択時のドロップダウン用）
  const { data: teamPatients = [] } = trpc.patients.list.useQuery(
    { team: newAssignTeam },
    { enabled: newAssignType === "team" }
  );

  // 音声転記待機検索（pendingPatientSearchがセットされたときに検索）
  const { data: pendingSearchResults = [], isFetched: pendingSearchFetched } = trpc.patients.search.useQuery(
    { query: pendingPatientSearch ?? "" },
    { enabled: !!pendingPatientSearch }
  );

  // AIが返した利用者名をallPatientsが揃ってからマッチング（クロージャ問題の回避）
  useEffect(() => {
    if (!pendingAiPatient || patientName.trim()) return;
    if (allPatients.length === 0) return; // まだロードされていない
    const { name: aiName, assignType: pendingAssignType, assignTeam: pendingAssignTeam } = pendingAiPatient;
    const applyPatientEffect = (name: string) => {
      // チーム情報を必要な場合のみ設定（現在のチーム選択を上書きしない）
      if (pendingAssignType === "team" && pendingAssignTeam && TEAMS.includes(pendingAssignTeam)) {
        setAssignTypeSafe("team");
        setNewAssignTeam(pendingAssignTeam);
      }
      // pendingAssignType === "all" の場合は現在のチーム選択を維持（setAssignTypeSafe("all")を呼ばない）
      setPatientName(name);
      toast.success(`利用者「${name}」を自動選択しました`);
      setPendingAiPatient(null);
    };
    // 完全一致
    const exactMatch = allPatients.find((p) => p.name === aiName);
    if (exactMatch) {
      applyPatientEffect(exactMatch.name);
      return;
    }
    // 部分一致
    const partialMatch = allPatients.filter(
      (p) => p.name.includes(aiName) || aiName.includes(p.name.split('\u3000')[0].split(' ')[0])
    );
    if (partialMatch.length === 1) {
      applyPatientEffect(partialMatch[0].name);
    } else if (partialMatch.length > 1) {
      setPatientCandidates(partialMatch);
      setShowCandidateDialog(true);
      setPendingAiPatient(null);
    } else {
      // 一致なし→サーバー検索にフォールバック
      setPendingPatientSearch(aiName);
      setPendingAiPatient(null);
    }
  }, [pendingAiPatient, allPatients, patientName]);

  // teamPatientsが更新されたとき、patientNameがドロップダウンに反映されるよう再セットする
  // （Reactの状態更新は非同期なので、setNewAssignTeamの直後はteamPatientsが古いチームのデータのままで、
  //  patientNameがドロップダウンに反映されない問題を修正）
  useEffect(() => {
    if (newAssignType !== "team" || teamPatients.length === 0) return;
    const pending = pendingTeamPatientRef.current;
    if (pending) {
      const found = teamPatients.find((p) => p.name === pending);
      if (found) {
        setPatientName(found.name);
        pendingTeamPatientRef.current = null;
      }
    }
  }, [teamPatients, newAssignType]);

  // pendingPatientSearchの結果が返ったら自動選択 or 候補ダイアログ表示
  useEffect(() => {
    if (!pendingPatientSearch || !pendingSearchFetched) return;
    if (pendingSearchResults.length === 1) {
      // 1件のみ→自動選択
      setPatientName(pendingSearchResults[0].name);
      setAssignTypeSafe("all"); // 別チームの利用者でも表示できるようフリーテキストモードに切り替え
      toast.success(`利用者「${pendingSearchResults[0].name}」を自動選択しました`);
    } else if (pendingSearchResults.length > 1) {
      // 複数候補→候補ダイアログ表示
      setPatientCandidates(pendingSearchResults);
      setShowCandidateDialog(true);
    } else {
      // 該当なし→入力欄に苗字をそのまま設定
      setPatientName(pendingPatientSearch);
      setAssignTypeSafe("all");
    }
    setPendingPatientSearch(null);
  }, [pendingPatientSearch, pendingSearchFetched, pendingSearchResults]);

  const handleClear = () => {
    setNewText("");
    setNewDueDate("");
    setNewDueTime("");
    setAssignTypeSafe("all");
    setNewAssignTeam("身体");
    setNewAssignUserId(null);
    setNewAssignUserName("");
    setPatientName("");
    setPatientQuery("");
    setRepeatType("none");
    setRepeatDayOfWeek(1);
    setRepeatDayOfMonth(1);
    setVoiceError(null);
    setLastVoiceText(null);
    setPendingAiPatient(null);
    setPendingPatientSearch(null);
  };

  const reportFeedback = trpc.voiceFeedback.report.useMutation({
    onSuccess: () => {
      setShowFeedbackDialog(false);
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 8000);
    },
    onError: (err) => {
      toast.error(`報告に失敗しました: ${err.message}`);
    },
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.getMine.invalidate();
      toast.success("タスクを追加しました");
      // 追加後は誤変換報告を非表示にする
      setVoiceTranscribed(false);
      setFeedbackSent(false);
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
      patientName: patientName.trim() || undefined,
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
        <div className={cn(
          "rounded-xl border p-3 space-y-2 transition-colors duration-300",
          taskVoice.isRecording
            ? (taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5
                ? "border-orange-400/50 bg-orange-50 dark:bg-orange-950/20"
                : "border-red-400/50 bg-red-50 dark:bg-red-950/20")
            : isAnalyzing
              ? "border-primary/30 bg-primary/10"
              : "border-primary/20 bg-primary/5"
        )}>

          {/* テキスト + 右側マイクボタン */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              {isAnalyzing ? (
                <p className="text-xs text-primary font-medium animate-pulse">AIが解析中...</p>
              ) : taskVoice.isRecording ? (
                <div>
                  <p className="text-xs font-semibold text-primary">音声入力でAI自動転記</p>
                  <p className={cn(
                    "text-xs font-medium mt-0.5",
                    taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-red-600 dark:text-red-400 animate-pulse"
                  )}>
                    {taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5
                      ? `あと${taskVoice.silenceCountdown}秒で自動停止`
                      : "🎤 話してください..."}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-primary">音声入力でAI自動転記</p>
                    <VoiceHelpDialog mode="task" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">マイクをタップして話すと各項目に転記</p>
                </div>
              )}
            </div>
            {/* 外側リング波形ラッパー */}
            <span className="relative inline-flex items-center justify-center flex-shrink-0">
              {taskVoice.isRecording && !( taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5) && (
                <>
                  <span className="absolute inset-0 pointer-events-none rounded-full" style={{ animation: "voiceRing 1.4s ease-out infinite", backgroundColor: "rgba(239, 68, 68, 0.35)" }} />
                  <span className="absolute inset-0 pointer-events-none rounded-full" style={{ animation: "voiceRing2 1.4s ease-out 0.5s infinite", backgroundColor: "rgba(239, 68, 68, 0.25)" }} />
                </>
              )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); if (!isAnalyzing) taskVoice.toggleVoice(); }}
              disabled={isAnalyzing}
              className={cn(
                "relative inline-flex items-center justify-center flex-shrink-0 h-14 w-14 rounded-full",
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
                <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                  <span className={cn("absolute inset-0 animate-ping rounded-full opacity-25",
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
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              )}
            </button>
            </span>
          </div>

          {/* 録音中の入力テキストボックス */}
          {(taskVoice.isRecording || lastVoiceText) && (
            <div className={cn(
              "px-3 py-2 rounded-lg border min-h-[36px] transition-colors duration-300",
              taskVoice.isRecording
                ? (taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5
                    ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                    : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800")
                : "bg-muted/40 border-border"
            )}>
              {taskVoice.isRecording ? (
                taskVoice.interimText ? (
                  <p className="text-xs text-red-600 dark:text-red-400 italic leading-relaxed">
                    🎤 {taskVoice.interimText}
                  </p>
                ) : taskVoice.silenceCountdown !== null && taskVoice.silenceCountdown <= 5 ? (
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    あと{taskVoice.silenceCountdown}秒で自動停止します
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">話しかけてください...</p>
                )
              ) : lastVoiceText ? (
                <div className="flex items-start gap-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                    🎤 {lastVoiceText}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLastVoiceText(null)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                    title="クリア"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : null}
            </div>
          )}

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
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">聴き取れなかった項目があります</p>
              <div className="flex flex-wrap gap-1">
                {missingFields.map((field) => {
                  const fieldIdMap: Record<string, string> = {
                    "タスク内容": "task-content-textarea",
                    "期日": "task-due-date",
                    "指定先": "task-assign-type",
                    "チーム名": "task-assign-team",
                    "担当者": "task-assign-user",
                  };
                  const targetId = fieldIdMap[field];
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => {
                        if (targetId) {
                          const el = document.getElementById(targetId);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                            // 枠線点滅ハイライト
                            el.classList.remove("highlight-pulse");
                            void el.offsetWidth;
                            el.classList.add("highlight-pulse");
                            el.addEventListener("animationend", () => el.classList.remove("highlight-pulse"), { once: true });
                            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
                              setTimeout(() => el.focus(), 300);
                            }
                          }
                        }
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-medium hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors cursor-pointer underline underline-offset-2"
                    >
                      {field} →
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-amber-700 dark:text-amber-400">項目をタップすると入力欄に移動します。マイクで話すか手動入力で補完できます</p>
            </div>
          )}

          {/* 例文（常時表示） */}
          {true && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">例文</p>
              <div className="flex flex-col gap-1">
                {VOICE_EXAMPLES.map((ex, i) => (
                  <p
                    key={i}
                    className="text-left text-xs px-2.5 py-1.5 rounded-lg border border-primary/20 bg-background text-muted-foreground select-text"
                  >
                    {ex}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* 誤変換報告ボタン（音声転記後・タスク追加前のみ表示） */}
          {voiceTranscribed && !feedbackSent && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowFeedbackDialog(true)}
                className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                誤変換を報告する（タスク追加前に）
              </button>
            </div>
          )}

          {/* 報告済みフォローアップカード */}
          {feedbackSent && (
            <div className="relative rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setFeedbackSent(false)}
                className="absolute top-1.5 right-1.5 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
                aria-label="閉じる"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-start gap-2 pr-4">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-green-800 dark:text-green-300">ご報告ありがとうございます</p>
                  <p className="text-[10px] text-green-700 dark:text-green-400 mt-0.5">いただいた情報はAIの音声認識精度の改善に活用します。引き続きご協力をお願いします。</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 指定先 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">指定先</label>
          <div id="task-assign-type" className="flex gap-2 mb-2">
            {([
              { value: "all", label: "全員", icon: Globe },
              { value: "team", label: "チーム", icon: Users },
              { value: "personal", label: "個人", icon: User },
            ] as const).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setAssignTypeSafe(value)}
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
            <div id="task-assign-team" className="flex flex-wrap gap-1.5">
              {TEAMS.map((team) => (
                <button
                  key={team}
                  onClick={() => setNewAssignTeam(team)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-all",
                    getTeamButtonClass(team, newAssignTeam === team)
                  )}
                  style={getTeamButtonStyle(team, newAssignTeam === team)}
                >
                  {team}チーム
                </button>
              ))}
            </div>
          )}

          {/* 個人選択 */}
          {newAssignType === "personal" && (
            <select
              id="task-assign-user"
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

        {/* 利用者名（任意） */}
        <div id="task-patient-name" className="relative">
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <UserRound className="w-3.5 h-3.5" />利用者名（任意）
          </label>
          {newAssignType === "team" ? (
            /* チーム指定時：チームの利用者一覧から選択 */
            <div className="flex items-center gap-1.5">
              <select
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{newAssignTeam}チームの利用者を選択...</option>
                {/* AI転記でセットされた利用者名がteamPatientsにまだ含まれていない場合でも表示できるようオプションを追加 */}
                {patientName && !teamPatients.some((p) => p.name === patientName) && (
                  <option value={patientName}>{patientName}</option>
                )}
                {teamPatients.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}{p.nameKana ? ` (${p.nameKana})` : ""}</option>
                ))}
              </select>
              {patientName && (
                <button
                  type="button"
                  onClick={() => setPatientName("")}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            /* 全員・個人指定時：フリーテキスト検索 */
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="利用者名を入力または検索..."
                value={patientName}
                onChange={(e) => {
                  setPatientName(e.target.value);
                  setPatientQuery(e.target.value);
                  setShowPatientDropdown(true);
                }}
                onFocus={() => { if (patientQuery) setShowPatientDropdown(true); }}
                onBlur={() => setTimeout(() => setShowPatientDropdown(false), 150)}
                className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {patientName && (
                <button
                  type="button"
                  onClick={() => { setPatientName(""); setPatientQuery(""); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          {/* フリーテキスト検索結果ドロップダウン */}
          {showPatientDropdown && patientResults.length > 0 && newAssignType !== "team" && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {patientResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPatientName(p.name);
                    setPatientQuery("");
                    setShowPatientDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between"
                >
                  <span>{p.name}</span>
                  {p.nameKana && <span className="text-xs text-muted-foreground">{p.nameKana}</span>}
                  {p.team && <span className="text-xs text-muted-foreground ml-auto pl-2">{p.team}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 複数候補ダイアログ */}
        {showCandidateDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCandidateDialog(false)}>
            <div className="bg-popover border border-border rounded-xl shadow-xl p-4 w-72 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold mb-1">利用者を選択してください</p>
              <p className="text-xs text-muted-foreground mb-3">同じ苗字の利用者が複数います</p>
              <div className="space-y-1.5">
                {patientCandidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPatientName(p.name);
                      setShowCandidateDialog(false);
                      setPatientCandidates([]);
                    }}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium">{p.name}</span>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {p.nameKana && <span>{p.nameKana}</span>}
                      {p.team && <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">{p.team}</span>}
                    </div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setShowCandidateDialog(false); setPatientCandidates([]); }}
                className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >キャンセル</button>
            </div>
          </div>
        )}

        {/* 期日・時刻 */}
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              <Calendar className="w-3 h-3 inline mr-0.5" />期日（任意）
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="task-due-date"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="flex-1 text-sm border border-border rounded-lg px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {newDueDate && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setNewDueDate(""); setNewDueTime(""); }}
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
                  onClick={(e) => { e.preventDefault(); setNewDueTime(""); }}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  title="時刻をクリア"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* タスク内容 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">内容 *</label>
          <textarea
            id="task-content-textarea"
            placeholder="タスクの内容を入力..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={2}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
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

      {/* 誤変換報告ダイアログ */}
      {showFeedbackDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-background rounded-2xl shadow-xl border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">誤変換を報告</h3>
              <button
                type="button"
                onClick={() => setShowFeedbackDialog(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">音声入力で誤った転記があった場合はご報告ください。AIの改善に活用します。</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">誤変換した項目</label>
                <select
                  value={feedbackWrongField}
                  onChange={(e) => setFeedbackWrongField(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">選んでください</option>
                  <option value="タスク内容">タスク内容</option>
                  <option value="期日">期日</option>
                  <option value="指定先チーム">指定先チーム</option>
                  <option value="指定先個人">指定先個人</option>
                  <option value="利用者名">利用者名</option>
                  <option value="その他">その他</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">AIが転記した誤った内容</label>
                <input
                  type="text"
                  value={feedbackWrongValue}
                  onChange={(e) => setFeedbackWrongValue(e.target.value)}
                  placeholder="例: 郡山北部チーム"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">正しい内容</label>
                <input
                  type="text"
                  value={feedbackCorrectValue}
                  onChange={(e) => setFeedbackCorrectValue(e.target.value)}
                  placeholder="例: 郡山南部チーム"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">コメント（任意）</label>
                <textarea
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="その他気になった点があればご記入ください"
                  rows={2}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShowFeedbackDialog(false)}
              >
                キャンセル
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!feedbackWrongField || reportFeedback.isPending}
                onClick={() => {
                  reportFeedback.mutate({
                    originalText: lastVoiceText ?? "",
                    transcribedResult: `タスク: ${newText}`,
                    wrongField: feedbackWrongField,
                    wrongValue: feedbackWrongValue,
                    correctValue: feedbackCorrectValue,
                    comment: feedbackComment,
                  });
                }}
              >
                {reportFeedback.isPending ? "送信中..." : "報告する"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
