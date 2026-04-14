/**
 * VisitSlotCard - 訪問チェック項目の1枠分のカード
 * ①訪問タスク（タスク管理連携）と②次回訪問日時を統合したカード
 * - 当日中の状態をlocalStorageに保存・復元
 * - 訪問完了ボタン（完了時はグレーアウト表示）
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Calendar, ChevronDown, CheckSquare, X, Copy, Check,
  CheckCircle2, Circle, Mic, MicOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";

const NOTIFY_TO_OPTIONS = ["本人", "家族", "その他"] as const;
const NOTIFY_METHOD_OPTIONS = ["口頭", "カレンダー記入", "付箋", "電話", "その他"] as const;

// 訪問タスク チェックリスト定義（タスク管理連携なしの固定項目）
const VISIT_TASKS_BEFORE_DEFAULT = [
  { id: "voice_memo", label: "ボイスメモ（録音）", checked: false, optional: false },
  { id: "limit_mgmt", label: "上限管理票の確認、記載", checked: false, optional: false },
  { id: "fee_sheet", label: "料金表記入", checked: false, optional: false },
  { id: "docs_hand", label: "請求書、領収書、看護計画渡す", checked: false, optional: true },
  { id: "insurance", label: "月初めは保険証、マイナンバーカード確認と読み込み", checked: false, optional: true },
];

type Team = "身体" | "天理" | "郡山北部" | "郡山南部";

type VisitSlotData = {
  team: Team | "";
  patientId: number | null;
  patientName: string;
};

// カードの保存状態（日付付き）
type CardSavedState = {
  date: string; // YYYY-MM-DD
  tasksBefore: Array<{ id: string; checked: boolean }>;
  specialNote: string;
  nextVisitDate: string;
  nextVisitTime: string;
  notifiedTo: string;
  notifiedToOther: string;
  notifyMethod: string;
  notifyMethodOther: string;
  completed: boolean;
  exported: boolean;
};

type Props = {
  slotIndex: number; // 0-7
  slotData: VisitSlotData;
  onSlotChange: (index: number, data: Partial<VisitSlotData>) => void;
  /** 管理者が選択したプロンプト本文（nullなら未選択） */
  selectedPromptBody: string | null;
};

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getCardStorageKey(slotIndex: number) {
  return `hinata_visit_card_${slotIndex}`;
}

function loadCardState(slotIndex: number): CardSavedState | null {
  try {
    const raw = localStorage.getItem(getCardStorageKey(slotIndex));
    if (!raw) return null;
    const parsed: CardSavedState = JSON.parse(raw);
    // 当日のデータのみ復元
    if (parsed.date !== getTodayStr()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function VisitSlotCard({ slotIndex, slotData, onSlotChange, selectedPromptBody }: Props) {
  const utils = trpc.useUtils();
  const todayStr = useMemo(() => getTodayStr(), []);

  // 保存済み状態の復元
  const savedState = useMemo(() => loadCardState(slotIndex), [slotIndex]);

  // チェックリスト状態（localStorageから復元）
  const [tasksBefore, setTasksBefore] = useState(() => {
    if (savedState?.tasksBefore) {
      return VISIT_TASKS_BEFORE_DEFAULT.map(t => ({
        ...t,
        checked: savedState.tasksBefore.find(s => s.id === t.id)?.checked ?? false,
      }));
    }
    return VISIT_TASKS_BEFORE_DEFAULT.map(t => ({ ...t }));
  });

  // 特記事項
  const [specialNote, setSpecialNote] = useState(savedState?.specialNote ?? "");

  // コピー完了フラグ
  const [copied, setCopied] = useState(false);

  // 訪問完了フラグ
  const [completed, setCompleted] = useState(savedState?.completed ?? false);

  // 次回訪問日時
  const [nextVisitDate, setNextVisitDate] = useState(savedState?.nextVisitDate ?? "");
  const [nextVisitTime, setNextVisitTime] = useState(savedState?.nextVisitTime ?? "");
  const [notifiedTo, setNotifiedTo] = useState<string>(savedState?.notifiedTo ?? "");
  const [notifiedToOther, setNotifiedToOther] = useState(savedState?.notifiedToOther ?? "");
  const [notifyMethod, setNotifyMethod] = useState<string>(savedState?.notifyMethod ?? "");
  const [notifyMethodOther, setNotifyMethodOther] = useState(savedState?.notifyMethodOther ?? "");

  // 転送済み状態
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);
  const [exported, setExported] = useState(savedState?.exported ?? false);

  // 時刻ドロップダウン
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const timeListRef = useRef<HTMLDivElement>(null);
  const timeSlots = useMemo(() => Array.from({ length: 24 * 12 }, (_, i) => {
    const h = Math.floor(i / 12);
    const m = (i % 12) * 5;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }), []);

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

  // タスク管理から利用者のタスクを取得（未完了のみ）
  const { data: patientTasks = [], refetch: refetchPatientTasks } = trpc.tasks.getByPatientName.useQuery(
    { patientName: slotData.patientName },
    { enabled: !!slotData.patientName, refetchOnWindowFocus: false }
  );

  // タスク管理のタスクをチェック済みにする
  const toggleTaskMutation = trpc.tasks.toggle.useMutation({
    onSuccess: () => {
      refetchPatientTasks();
      utils.tasks.getMine.invalidate();
    },
    onError: (err) => toast.error(`タスク更新エラー: ${err.message}`),
  });

  // 保存ミューテーション
  const exportToSheet = trpc.visitRecords.exportToSheet.useMutation({
    onSuccess: () => {
      toast.success(`${slotData.patientName}さんの次回訪問日時を転送しました！`);
      setExported(true);
    },
    onError: (err) => toast.error(`転送エラー: ${err.message}`),
  });

  const createRecord = trpc.visitRecords.create.useMutation({
    onSuccess: (data) => {
      setSavedRecordId(data.id);
      exportToSheet.mutate({ id: data.id });
    },
    onError: (err) => toast.error(`保存エラー: ${err.message}`),
  });

  // localStorageへの状態保存
  const saveToStorage = useCallback(() => {
    try {
      const state: CardSavedState = {
        date: todayStr,
        tasksBefore: tasksBefore.map(t => ({ id: t.id, checked: t.checked })),
        specialNote,
        nextVisitDate,
        nextVisitTime,
        notifiedTo,
        notifiedToOther,
        notifyMethod,
        notifyMethodOther,
        completed,
        exported,
      };
      localStorage.setItem(getCardStorageKey(slotIndex), JSON.stringify(state));
    } catch {}
  }, [slotIndex, todayStr, tasksBefore, specialNote, nextVisitDate, nextVisitTime, notifiedTo, notifiedToOther, notifyMethod, notifyMethodOther, completed, exported]);

  // 状態変更時に自動保存
  useEffect(() => {
    saveToStorage();
  }, [saveToStorage]);

  const handleSaveAndExport = () => {
    if (!slotData.team) {
      toast.error("チームを選択してください");
      return;
    }
    if (!slotData.patientName) {
      toast.error("利用者を選択してください");
      return;
    }
    if (!nextVisitDate) {
      toast.error("次回訪問日を入力してください");
      return;
    }

    const dt = nextVisitTime ? `${nextVisitDate}T${nextVisitTime}` : `${nextVisitDate}T00:00`;
    const nextVisitAt = new Date(dt);

    createRecord.mutate({
      patientId: slotData.patientId ?? undefined,
      patientName: slotData.patientName,
      team: slotData.team as Team,
      nextVisitAt,
      notifiedTo: (notifiedTo as typeof NOTIFY_TO_OPTIONS[number]) || undefined,
      notifiedToOther: notifiedToOther || undefined,
      notifyMethod: (notifyMethod as typeof NOTIFY_METHOD_OPTIONS[number]) || undefined,
      notifyMethodOther: notifyMethodOther || undefined,
    });
  };

  const handleClearPatient = () => {
    onSlotChange(slotIndex, { patientId: null, patientName: "" });
  };

  // プロンプトをコピーする
  const handleCopyPrompt = async () => {
    if (!selectedPromptBody) {
      toast.error("管理者がプロンプトを選択していません");
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedPromptBody);
      setCopied(true);
      toast.success("プロンプトをコピーしました");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  // 訪問完了トグル
  const handleToggleCompleted = () => {
    const next = !completed;
    setCompleted(next);
    if (next) {
      toast.success(`${slotData.patientName ? slotData.patientName + "さんの" : ""}訪問を完了にしました`);
    }
  };

  // チェックリストリセット
  const handleResetChecklist = () => {
    setTasksBefore(VISIT_TASKS_BEFORE_DEFAULT.map(t => ({ ...t })));
    setSpecialNote("");
  };

  const isPatientSelected = !!slotData.patientName;
  const slotNumber = slotIndex + 1;

  return (
    <Card className={cn(
      "shadow-sm border-2 transition-all duration-200",
      completed
        ? "border-muted bg-muted/30 opacity-70"
        : isPatientSelected
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-background"
    )}>
      <CardHeader className="pb-2 pt-3 px-4">
        {/* カード番号・利用者名ヘッダー */}
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
            completed
              ? "bg-muted-foreground/30 text-muted-foreground"
              : isPatientSelected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
          )}>
            {slotNumber}
          </span>
          {isPatientSelected ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {slotData.team && (
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0",
                        getTeamButtonClass(slotData.team as Team, true)
                      )}
                      style={getTeamButtonStyle(slotData.team as Team, true)}
                    >
                      {slotData.team}
                    </span>
                  )}
                  <span className={cn(
                    "text-sm font-semibold truncate",
                    completed ? "text-muted-foreground line-through" : "text-foreground"
                  )}>
                    {slotData.patientName}
                  </span>
                </div>
              </div>
              {/* 訪問完了ボタン */}
              <button
                type="button"
                onClick={handleToggleCompleted}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all",
                  completed
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400"
                    : "bg-background border-border hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400 text-muted-foreground"
                )}
                title={completed ? "完了を取り消す" : "訪問完了にする"}
              >
                {completed ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" />完了</>
                ) : (
                  <><Circle className="w-3.5 h-3.5" />完了</>
                )}
              </button>
              <button
                type="button"
                onClick={handleClearPatient}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                title="利用者をクリア"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">未設定</span>
          )}
        </div>
      </CardHeader>

      {/* 完了時はコンテンツを折りたたみ */}
      {!completed && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* ===== ① 訪問タスク ===== */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" />
              ① 訪問タスク
            </p>

            {/* タスク管理から取得した利用者タスク */}
            {isPatientSelected && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">タスク</p>
                {patientTasks.length > 0 ? (
                  <div className="space-y-1.5">
                    {patientTasks.map((task) => (
                      <label
                        key={task.id}
                        className={cn(
                          "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none",
                          task.done
                            ? "bg-primary/5 border-primary/30"
                            : "bg-background border-border hover:bg-muted/50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={!!task.done}
                          onChange={() => {
                            toggleTaskMutation.mutate({ id: task.id, done: !task.done });
                          }}
                          className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={cn(
                            "text-sm leading-snug",
                            task.done ? "line-through text-muted-foreground" : "text-foreground"
                          )}>
                            {task.text}
                          </span>
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              期日: {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-1.5 px-2 bg-muted/30 rounded-lg">
                    タスクなし
                  </p>
                )}
              </div>
            )}

            {/* 訪問前・訪問中 固定チェックリスト */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">訪問前・訪問中</p>
              <div className="space-y-1.5">
                {tasksBefore.map((task) => (
                  <label
                    key={task.id}
                    className={cn(
                      "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none",
                      task.checked
                        ? "bg-primary/5 border-primary/30"
                        : "bg-background border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={task.checked}
                      onChange={() => setTasksBefore(prev => prev.map(t => t.id === task.id ? { ...t, checked: !t.checked } : t))}
                      className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-sm leading-snug",
                        task.checked ? "line-through text-muted-foreground" : "text-foreground"
                      )}>
                        {task.label}
                      </span>
                      {task.optional && (
                        <span className="ml-2 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                          必要時
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 訪問後 - チェックボックスなしのテキスト表示 */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">訪問後</p>
              <div className="space-y-1.5">
                {/* 処置内容を録音 */}
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background">
                  <span className="text-sm text-foreground">処置内容を録音</span>
                </div>

                {/* ボイスメモをNotebookLMに... + コピーボタン */}
                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-background">
                  <span className="text-sm text-foreground flex-1 leading-snug">
                    ボイスメモをNotebookLMにソースとして追加し、指定のプロンプトで文章を作成
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    title={selectedPromptBody ? "プロンプトをコピー" : "管理者がプロンプトを選択していません"}
                    className={cn(
                      "flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                      selectedPromptBody
                        ? copied
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400"
                          : "bg-background border-border hover:bg-primary/10 hover:border-primary/40 text-foreground"
                        : "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-60"
                    )}
                  >
                    {copied ? (
                      <><Check className="w-3 h-3" />コピー済み</>
                    ) : (
                      <><Copy className="w-3 h-3" />コピー</>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 特記事項 */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">特記事項</p>
              <textarea
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors placeholder:text-muted-foreground"
                rows={2}
                placeholder="例：支援者・家族に連絡"
                value={specialNote}
                onChange={(e) => setSpecialNote(e.target.value)}
              />
            </div>

            {/* チェックリストリセットボタン */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleResetChecklist}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                リセット
              </button>
            </div>
          </div>

          {/* ===== ② 次回訪問日時 ===== */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              ② 次回訪問日時
            </p>

            {/* 日付・時刻 */}
            <div className="flex gap-2">
              <Input
                type="date"
                className="text-sm flex-1"
                value={nextVisitDate}
                onChange={(e) => {
                  setNextVisitDate(e.target.value);
                  setExported(false);
                  setSavedRecordId(null);
                }}
              />
              <div className="relative w-28">
                <button
                  type="button"
                  className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted transition-colors"
                  onClick={() => setTimeDropdownOpen((o) => !o)}
                >
                  <span className={nextVisitTime ? "" : "text-muted-foreground"}>{nextVisitTime || "時刻"}</span>
                  <ChevronDown className="w-3 h-3 ml-1 text-muted-foreground" />
                </button>
                {timeDropdownOpen && (
                  <div
                    ref={timeListRef}
                    className="absolute z-50 top-full mt-1 w-full border rounded-md bg-background shadow-md max-h-60 overflow-y-auto"
                  >
                    {timeSlots.map((val) => (
                      <button
                        key={val}
                        data-val={val}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
                          nextVisitTime === val ? "bg-primary text-primary-foreground hover:bg-primary" : ""
                        }`}
                        onClick={() => { setNextVisitTime(val); setTimeDropdownOpen(false); }}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 伝達先・伝達方法 */}
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">伝達先</label>
                <div className="flex gap-1.5 flex-wrap">
                  {NOTIFY_TO_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${notifiedTo === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
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
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${notifyMethod === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
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

            {/* 転送ボタン */}
            {exported ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg">
                <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓ 転送済み</span>
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground hover:underline"
                  onClick={() => { setExported(false); setSavedRecordId(null); }}
                >
                  再転送
                </button>
              </div>
            ) : (
              <Button
                className="w-full"
                size="sm"
                onClick={handleSaveAndExport}
                disabled={!nextVisitDate || !isPatientSelected || createRecord.isPending || exportToSheet.isPending}
              >
                {createRecord.isPending || exportToSheet.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />転送中...</>
                ) : (
                  <>スプレッドシートへ転送</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      )}

      {/* 完了時のサマリー表示 */}
      {completed && (
        <CardContent className="px-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">訪問完了</span>
              {exported && (
                <span className="text-xs text-muted-foreground">・次回訪問日時転送済み</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleToggleCompleted}
              className="text-xs text-muted-foreground hover:underline"
            >
              取り消す
            </button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
