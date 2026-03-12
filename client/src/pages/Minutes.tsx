/**
 * 議事録ページ
 * 管理者が議事録を投稿し、各スタッフが確認チェックを入れると自分のリストから削除される
 * 投稿はタイトルとドキュメントURLのみ。タイトルは手動または音声入力。
 * ドキュメントリンクをクリックすると自動的に確認チェックが入る。
 * タブ: 「未確認」「確認済み」で切り替え可能。管理者は既読者一覧を確認できる。
 * 機能: 検索絞り込み・期限設定・未確認者へのリマインド通知
 */
import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Circle,
  CheckCircle2,
  FileText,
  Plus,
  Trash2,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Info,
  Mic,
  MicOff,
  Users,
  ChevronDown,
  ChevronUp,
  Search,
  Bell,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isToday, addDays } from "date-fns";
import { ja } from "date-fns/locale";

// SpeechRecognition型定義（TypeScript用）
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionConstructor = { new(): SpeechRecognitionInstance };

// 期限バッジコンポーネント
function DeadlineBadge({ deadline }: { deadline: Date | null | undefined }) {
  if (!deadline) return null;
  const d = new Date(deadline);
  const overdue = isPast(d) && !isToday(d);
  const dueSoon = !overdue && d <= addDays(new Date(), 2);
  const dueToday = isToday(d);

  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[11px] font-medium">
        <AlertTriangle className="w-3 h-3" />
        期限切れ {format(d, "M/d", { locale: ja })}
      </span>
    );
  }
  if (dueToday) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[11px] font-medium">
        <Calendar className="w-3 h-3" />
        今日が期限
      </span>
    );
  }
  if (dueSoon) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
        <Calendar className="w-3 h-3" />
        期限 {format(d, "M月d日", { locale: ja })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px]">
      <Calendar className="w-3 h-3" />
      期限 {format(d, "M月d日", { locale: ja })}
    </span>
  );
}

// 既読者パネルコンポーネント（管理者のみ表示）
function ReadersPanel({ minutesId }: { minutesId: number }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.minutes.getReaders.useQuery(
    { minutesId },
    { enabled: open }
  );

  const sendReminderMutation = trpc.minutes.sendReminder.useMutation({
    onSuccess: (result) => {
      if (result.sent === 0) {
        toast.success("全員確認済みです。リマインドは不要です。");
      } else {
        toast.success(`${result.sent}名にリマインド通知を送りました`);
      }
      utils.minutes.getReaders.invalidate({ minutesId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Users className="w-3.5 h-3.5" />
        <span>既読者を確認</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-lg bg-muted/40 border border-border space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              読み込み中...
            </div>
          ) : (
            <>
              {/* 確認済みスタッフ */}
              <div>
                <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  確認済み（{data?.readers.length ?? 0}名）
                </p>
                {data && data.readers.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {data.readers.map((r) => (
                      <span
                        key={r.userId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[11px]"
                        title={r.checkedAt ? format(new Date(r.checkedAt), "M月d日 HH:mm", { locale: ja }) : ""}
                      >
                        {r.userName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">まだいません</p>
                )}
              </div>
              {/* 未確認スタッフ */}
              <div>
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                  <Circle className="w-3 h-3" />
                  未確認（{data?.unread.length ?? 0}名）
                </p>
                {data && data.unread.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {data.unread.map((r) => (
                      <span
                        key={r.userId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[11px]"
                      >
                        {r.userName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">全員確認済みです</p>
                )}
              </div>
              {/* リマインド送信ボタン（未確認者がいる場合のみ） */}
              {data && data.unread.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-1 text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20"
                  onClick={() => sendReminderMutation.mutate({ minutesId })}
                  disabled={sendReminderMutation.isPending}
                >
                  {sendReminderMutation.isPending ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />送信中...</>
                  ) : (
                    <><Bell className="w-3 h-3 mr-1.5" />未確認者 {data.unread.length}名にリマインドを送る</>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Minutes() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  // タブ: "unread" | "read"
  const [activeTab, setActiveTab] = useState<"unread" | "read">("unread");
  // 検索キーワード
  const [searchQuery, setSearchQuery] = useState("");

  const { data: minutesList = [], isLoading } = trpc.minutes.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDocumentUrl, setNewDocumentUrl] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  // 楽観的更新用: チェックしたIDをローカルで管理
  const [localCheckedIds, setLocalCheckedIds] = useState<Set<number>>(new Set());
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const fetchTitleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // URLが有効かどうか確認
  const isValidUrl = (url: string) => {
    try { new URL(url); return true; } catch { return false; }
  };

  // URL入力時にデバウンスしてタイトルを自動取得
  const handleDocUrlChange = (url: string) => {
    setNewDocumentUrl(url);
    if (fetchTitleTimeout.current) clearTimeout(fetchTitleTimeout.current);
    if (!isValidUrl(url)) return;
    setIsFetchingTitle(true);
    fetchTitleTimeout.current = setTimeout(async () => {
      try {
        const result = await utils.minutes.fetchDocTitle.fetch({ url });
        if (result?.title) {
          if (!newTitle) setNewTitle(result.title);
        }
      } catch {
        // タイトル取得失敗は無視
      } finally {
        setIsFetchingTitle(false);
      }
    }, 800);
  };

  // 音声入力の開始・停止
  const startVoiceInput = () => {
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      toast.error("このブラウザは音声入力に対応していません");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error("音声入力に失敗しました。マイクの許可を確認してください。");
    };
    recognition.onresult = (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => {
      const transcript = e.results[0][0].transcript;
      setNewTitle((prev) => prev ? prev + transcript : transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const createMutation = trpc.minutes.create.useMutation({
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
      setCreateOpen(false);
      setNewTitle("");
      setNewDocumentUrl("");
      setNewDeadline("");
      toast.success("議事録を投稿しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkMutation = trpc.minutes.check.useMutation({
    onMutate: ({ minutesId }) => {
      // 楽観的更新: 即座にリストから非表示にする
      setLocalCheckedIds((prev) => new Set(prev).add(minutesId));
    },
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
    },
    onError: (e, { minutesId }) => {
      // エラー時はロールバック
      setLocalCheckedIds((prev) => {
        const s = new Set(prev);
        s.delete(minutesId);
        return s;
      });
      toast.error(e.message);
    },
  });

  const deleteMutation = trpc.minutes.delete.useMutation({
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
      setDeleteConfirmId(null);
      toast.success("議事録を削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // ドキュメントリンクをクリックしたら自動チェック（確認済みにする）
  const handleDocumentOpen = (minutesId: number) => {
    if (!localCheckedIds.has(minutesId)) {
      checkMutation.mutate({ minutesId });
    }
  };

  // 未確認リスト: サーバーで既読 or ローカルでチェック済みのものを除外
  const unreadList = minutesList.filter(
    (m) => !m.checkedByMe && !localCheckedIds.has(m.id)
  );

  // 確認済みリスト: サーバーで既読 or ローカルでチェック済みのもの
  const readList = minutesList.filter(
    (m) => m.checkedByMe || localCheckedIds.has(m.id)
  );

  // 現在のタブに応じたリストに検索フィルタを適用
  const baseList = activeTab === "unread" ? unreadList : readList;
  const currentList = useMemo(() => {
    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.trim().toLowerCase();
    return baseList.filter((m) =>
      m.title.toLowerCase().includes(q) ||
      (m.createdByName && m.createdByName.toLowerCase().includes(q))
    );
  }, [baseList, searchQuery]);

  // 期限切れ・期限近い議事録の数（未確認タブのみ）
  const urgentCount = useMemo(() => {
    return unreadList.filter((m) => {
      if (!m.deadline) return false;
      const d = new Date(m.deadline);
      return d <= addDays(new Date(), 2);
    }).length;
  }, [unreadList]);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">議事録</h1>
            <p className="text-sm text-muted-foreground">
              ドキュメントを開くと自動で確認済みになります
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            投稿
          </Button>
        )}
      </div>

      {/* 期限が近い/切れた議事録の警告バナー */}
      {urgentCount > 0 && activeTab === "unread" && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-800 dark:text-red-300 font-medium">
            期限が近い、または期限切れの議事録が <span className="font-bold">{urgentCount}件</span> あります
          </p>
        </div>
      )}

      {/* タブ切り替え */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border">
        <button
          onClick={() => setActiveTab("unread")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${
            activeTab === "unread"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Circle className="w-3.5 h-3.5" />
          未確認
          {unreadList.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {unreadList.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("read")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${
            activeTab === "read"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          確認済み
          {readList.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
              {readList.length}
            </span>
          )}
        </button>
      </div>

      {/* 検索バー */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="タイトルや投稿者で絞り込み..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* 操作説明バナー（未確認タブのみ・検索なし時） */}
      {activeTab === "unread" && !searchQuery && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-semibold">確認の手順</p>
            <ol className="list-decimal list-inside space-y-0.5 text-amber-700 dark:text-amber-400">
              <li>まず左の <span className="inline-flex items-center gap-0.5 font-medium">○ チェックボタン</span> を押して確認済みにする</li>
              <li>その後、ドキュメントリンクを開いて内容を確認する</li>
            </ol>
            <p className="text-amber-600 dark:text-amber-500 text-[11px]">※ ドキュメントを開いた時点でも自動的に確認済みになります</p>
          </div>
        </div>
      )}

      {/* 検索結果件数 */}
      {searchQuery && (
        <p className="text-xs text-muted-foreground">
          「{searchQuery}」の検索結果: {currentList.length}件
        </p>
      )}

      {/* 議事録リスト */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">読み込み中...</div>
      ) : currentList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery ? (
              <>
                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>「{searchQuery}」に一致する議事録はありません</p>
              </>
            ) : activeTab === "unread" ? (
              <>
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>未確認の議事録はありません</p>
              </>
            ) : (
              <>
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>確認済みの議事録はありません</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {currentList.map((m) => {
            const isChecked = m.checkedByMe || localCheckedIds.has(m.id);
            const deadline = m.deadline ? new Date(m.deadline) : null;
            const isOverdue = deadline && isPast(deadline) && !isToday(deadline);
            return (
              <Card
                key={m.id}
                className={`border-border ${isChecked ? "opacity-80" : ""} ${
                  isOverdue && !isChecked ? "border-red-300 dark:border-red-700/60" : ""
                }`}
              >
                <CardHeader className="pb-3 pt-4 px-4">
                  <div className="flex items-start gap-3">
                    {/* チェックボタン（未確認タブのみ操作可能） */}
                    <button
                      onClick={() => {
                        if (!isChecked && activeTab === "unread") {
                          checkMutation.mutate({ minutesId: m.id });
                        }
                      }}
                      disabled={isChecked}
                      className={`mt-0.5 flex-shrink-0 transition-colors ${
                        isChecked
                          ? "text-emerald-500 cursor-default"
                          : "text-muted-foreground hover:text-emerald-500"
                      }`}
                      title={isChecked ? "確認済み" : "先にここを押して確認済みにする"}
                    >
                      {isChecked
                        ? <CheckCircle2 className="w-5 h-5" />
                        : <Circle className="w-5 h-5" />
                      }
                    </button>
                    {/* タイトル・メタ情報 */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <span className="font-semibold text-sm text-foreground">{m.title}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.createdByName} ·{" "}
                          {format(new Date(m.createdAt), "M月d日(E) HH:mm", { locale: ja })}
                        </p>
                        {/* 期限バッジ */}
                        {deadline && !isChecked && (
                          <div className="mt-1">
                            <DeadlineBadge deadline={deadline} />
                          </div>
                        )}
                      </div>
                      {/* 添付ドキュメントリンク */}
                      {m.documentUrl && (
                        <div className="space-y-1">
                          {!isChecked && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                              <Info className="w-3 h-3" />
                              先に左の ○ を押してから開いてください
                            </p>
                          )}
                          <a
                            href={m.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleDocumentOpen(m.id)}
                            className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-accent transition-colors group w-fit max-w-full"
                          >
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                              {m.documentLabel || m.title || "ドキュメントを開く"}
                            </span>
                            <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          </a>
                        </div>
                      )}
                      {!m.documentUrl && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          ドキュメントなし
                        </Badge>
                      )}
                      {/* 既読者確認パネル（管理者のみ） */}
                      {isAdmin && <ReadersPanel minutesId={m.id} />}
                    </div>
                    {/* 削除ボタン（adminのみ） */}
                    {isAdmin && (
                      <button
                        onClick={() => setDeleteConfirmId(m.id)}
                        className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {/* 投稿ダイアログ（adminのみ） */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setNewTitle("");
          setNewDocumentUrl("");
          setNewDeadline("");
          recognitionRef.current?.stop();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>議事録を投稿</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* タイトル（音声入力対応） */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" />
                議事録タイトル <span className="text-destructive">*</span>
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="タイトルを入力（または右のマイクで音声入力）"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={300}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={startVoiceInput}
                  title={isListening ? "音声入力停止" : "音声入力開始"}
                  className={isListening
                    ? "bg-red-100 border-red-400 text-red-600 animate-pulse dark:bg-red-900/30 dark:border-red-600"
                    : ""}
                >
                  {isListening
                    ? <MicOff className="h-4 w-4" />
                    : <Mic className="h-4 w-4" />
                  }
                </Button>
              </div>
              {isListening && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  録音中... もう一度押すと停止します
                </p>
              )}
            </div>

            {/* 確認期限（任意） */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                確認期限（任意）
              </p>
              <Input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
                className="text-sm"
              />
              {newDeadline && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(newDeadline), "M月d日(E)まで", { locale: ja })}
                  </p>
                  <button
                    onClick={() => setNewDeadline("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕ クリア
                  </button>
                </div>
              )}
            </div>

            {/* ドキュメントURL（任意） */}
            <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border border-border">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <LinkIcon className="w-3 h-3" />
                ドキュメントURL（任意）
              </p>
              <div className="relative">
                <Input
                  placeholder="Google Docs / Sheets / Forms 等のURL"
                  value={newDocumentUrl}
                  onChange={(e) => handleDocUrlChange(e.target.value)}
                  className="text-sm pr-8"
                />
                {isFetchingTitle && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => createMutation.mutate({
                title: newTitle,
                content: newTitle,
                documentUrl: newDocumentUrl || undefined,
                documentLabel: newTitle || undefined,
                deadline: newDeadline ? new Date(newDeadline) : undefined,
              })}
              disabled={!newTitle.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />投稿中...</>
              ) : "投稿する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>議事録を削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            この操作は取り消せません。全スタッフの確認記録も削除されます。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId !== null && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
