/**
 * VisitSlotCard - 訪問チェック項目の1枠分のカード
 * ①訪問タスク（タスク管理連携）と②次回訪問日時を統合したカード
 * - 当日中の状態をlocalStorageに保存・復元
 * - 訪問完了ボタン（完了時はグレーアウト表示）
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Calendar, ChevronDown, CheckSquare, X, Copy, Check,
  CheckCircle2, Circle, Mic, MicOff, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";
import { SPREADSHEET_LINKS } from "@/lib/spreadsheetLinks";

// チーム別利用者料金表URLマッピング（静的フォールバック用）
const TEAM_FEE_SHEET_URL_FALLBACK: Record<string, string> = {
  "身体": SPREADSHEET_LINKS.find(l => l.label === "利用者料金一覧（身体）")?.href ?? "",
  "天理": SPREADSHEET_LINKS.find(l => l.label === "利用者料金一覧（天理）")?.href ?? "",
  "郡山北部": SPREADSHEET_LINKS.find(l => l.label === "利用者料金一覧（精神郡山）")?.href ?? "",
  "郡山南部": SPREADSHEET_LINKS.find(l => l.label === "利用者料金一覧（精神郡山）")?.href ?? "",
};
// チーム名 → linkKey マッピング
const TEAM_FEE_LINK_KEY: Record<string, string> = {
  "身体": "fee_shintai",
  "天理": "fee_tenri",
  "郡山北部": "fee_seishin_koriyama",
  "郡山南部": "fee_seishin_koriyama",
};

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

// 完了日時が今日かどうかを判定
function isCompletedToday(completedAt: Date | string | null | undefined): boolean {
  if (!completedAt) return false;
  const d = new Date(completedAt);
  const today = getTodayStr();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return dateStr === today;
}

// 利用者タスクを表示すべきか判定
// 未完了 → 表示、当日完了 → 表示（取り消し線）、翌日以降完了 → 非表示
function shouldShowTask(task: { done: number | boolean; completedAt?: Date | string | null }): boolean {
  if (!task.done) return true; // 未完了は常に表示
  return isCompletedToday(task.completedAt); // 完了済みは当日のみ表示
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

  // 月次利用者料金表URL（DB登録分）
  const { data: monthlyLinks } = trpc.spreadsheetLinks.getCurrent.useQuery();
  // 選択中チームの料金表URL（DB登録分 → 静的フォールバックの順で解決）
  const teamFeeUrl = useMemo(() => {
    if (!slotData.team) return "";
    const linkKey = TEAM_FEE_LINK_KEY[slotData.team];
    const dbUrl = monthlyLinks?.find(l => l.linkKey === linkKey)?.url;
    return dbUrl || TEAM_FEE_SHEET_URL_FALLBACK[slotData.team] || "";
  }, [slotData.team, monthlyLinks]);

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
    onMutate: async ({ id, done }) => {
      // 進行中のリフェッチをキャンセルして楽観的更新が上書きされないようにする
      await utils.tasks.getMine.cancel();
      await utils.tasks.getByPatientName.cancel({ patientName: slotData.patientName });
      // 現在のキャッシュを保存（ロールバック用）
      const prevMine = utils.tasks.getMine.getData();
      const prevByPatient = utils.tasks.getByPatientName.getData({ patientName: slotData.patientName });
      // tasks.getMine キャッシュを楽観的に更新
      utils.tasks.getMine.setData(undefined, (old) =>
        old ? old.map((t) => t.id === id ? { ...t, done: done ? 1 : 0 } : t) : old
      );
      // tasks.getByPatientName キャッシュを楽観的に更新
      utils.tasks.getByPatientName.setData(
        { patientName: slotData.patientName },
        (old) => old ? old.map((t) => t.id === id ? { ...t, done: done ? 1 : 0 } : t) : old
      );
      return { prevMine, prevByPatient };
    },
    onError: (err, _vars, context) => {
      // エラー時はキャッシュをロールバック
      if (context?.prevMine !== undefined) {
        utils.tasks.getMine.setData(undefined, context.prevMine);
      }
      if (context?.prevByPatient !== undefined) {
        utils.tasks.getByPatientName.setData(
          { patientName: slotData.patientName },
          context.prevByPatient
        );
      }
      toast.error(`タスク更新エラー: ${err.message}`);
    },
    onSettled: () => {
      // サーバーから最新データを取得して確定
      utils.tasks.getMine.invalidate();
      utils.tasks.getAll.invalidate();
      utils.tasks.getByPatientName.invalidate({ patientName: slotData.patientName });
      refetchPatientTasks();
    },
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

  // このカードだけリセット（全状態 + localStorage削除）
  const handleResetCard = () => {
    if (!window.confirm(`${slotData.patientName ? slotData.patientName + "さんの" : ""}カード${slotIndex + 1}の入力内容を全てリセットしますか？`)) return;
    setTasksBefore(VISIT_TASKS_BEFORE_DEFAULT.map(t => ({ ...t })));
    setSpecialNote("");
    setNextVisitDate("");
    setNextVisitTime("");
    setNotifiedTo("");
    setNotifiedToOther("");
    setNotifyMethod("");
    setNotifyMethodOther("");
    setCompleted(false);
    setExported(false);
    setSavedRecordId(null);
    try {
      localStorage.removeItem(getCardStorageKey(slotIndex));
    } catch {}
    toast.success(`カード${slotIndex + 1}をリセットしました`);
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
                {patientTasks.filter(t => shouldShowTask(t as any)).length > 0 ? (
                  <div className="space-y-1.5">
                    {patientTasks.filter(t => shouldShowTask(t as any)).map((task) => (
                      <label
                        key={task.id}
                        className={cn(
                          "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none",
                          task.done
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
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
                            task.done ? "line-through text-muted-foreground opacity-60" : "text-foreground"
                          )}>
                            {task.text}
                          </span>
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              期日: {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                            </p>
                          )}
                          {(task as any).taskKind === "next_visit" && !task.dueDate && (
                            <span className="inline-block mt-0.5 text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                              🏥 次回訪問時
                            </span>
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
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className={cn(
                        "text-sm leading-snug flex-1",
                        task.checked ? "line-through text-muted-foreground" : "text-foreground"
                      )}>
                        {task.label}
                        {task.optional && (
                          <span className="ml-2 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                            必要時
                          </span>
                        )}
                      </span>
                      {/* 料金表記入の横にチーム別スプレッドシートボタン（利用者選択時のみ表示） */}
                      {task.id === "fee_sheet" && slotData.patientName && slotData.team && teamFeeUrl && (
                        <a
                          href={teamFeeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          利用者料金表
                        </a>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* メモ（月初め保険証確認と訪問後の間） */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted-foreground">メモ</p>
                <VoiceMicButton
                  size="sm"
                  previewMode="inline"
                  context="clinical_notes"
                  onResult={(text) => setSpecialNote((prev) => prev ? prev + "\n" + text : text)}
                />
              </div>
              <textarea
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
                rows={2}
                placeholder="例：看護記録Ⅱ作成時に使用するキーワード、支援者・家族への連絡等"
                value={specialNote}
                onChange={(e) => setSpecialNote(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">（注）リセットボタンでメモ削除</p>
            </div>
            {/* このカードだけリセットボタン */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleResetCard}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                このカードだけリセット
              </button>
            </div>
          </div>

          {/* ===== ② 次回訪問日時 ===== */}
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                ② 次回訪問日時
              </p>
              <div className="flex items-center gap-1.5">
                {/* 次回訪問日時スプレッドシートリンク */}
                <a
                  href="https://docs.google.com/spreadsheets/d/1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo/edit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
                  title="次回訪問日時スプレッドシートを開く"
                >
                  <ExternalLink className="w-3 h-3" />
                  シート
                </a>
                {/* ZESTリンク */}
                <a
                  href="https://homecare.zest.jp/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  ZEST
                </a>
              </div>
            </div>

            {/* 日付・時刻 + リセットボタン */}
            <div className="flex gap-2 items-center">
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
              {/* 次回訪問日時リセットボタン */}
              {(nextVisitDate || nextVisitTime) && (
                <button
                  type="button"
                  title="次回訪問日時をリセット"
                  className="flex-shrink-0 p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => {
                    if (!window.confirm("次回訪問日時をリセットしますか？")) return;
                    setNextVisitDate("");
                    setNextVisitTime("");
                    setNotifiedTo("");
                    setNotifiedToOther("");
                    setNotifyMethod("");
                    setNotifyMethodOther("");
                    setExported(false);
                    setSavedRecordId(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
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

          {/* ===== ③ 訪問後 ===== */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
              ③ 訪問後
            </p>
            <div className="space-y-1.5">
              {/* 処置内容を録音 */}
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background">
                <span className="text-sm text-foreground">処置内容を録音</span>
              </div>

              {/* ボイスメモをNotebookLMに... + コピーボタン */}
              <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-border bg-background">
                <span className="text-sm text-foreground leading-snug">
                  ボイスメモをNotebookLMにソースとして追加し、指定のプロンプトで文章を作成
                </span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  title={selectedPromptBody ? "プロンプトをコピー" : "管理者がプロンプトを選択していません"}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                    selectedPromptBody
                      ? copied
                        ? "bg-emerald-500 dark:bg-emerald-600 text-white shadow-sm"
                        : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-md hover:shadow-lg active:scale-95"
                      : "bg-muted border border-border text-muted-foreground cursor-not-allowed opacity-60"
                  )}
                >
                  {copied ? (
                    <><Check className="w-4 h-4" />コピー済み</>
                  ) : (
                    <><Copy className="w-4 h-4" />プロンプトをコピー</>
                  )}
                </button>
              </div>
            </div>
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
