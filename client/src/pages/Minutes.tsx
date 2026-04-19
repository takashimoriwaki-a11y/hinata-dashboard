/**
 * 議事録ページ
 * 管理者が議事録を投稿し、各スタッフが確認チェックを入れると自分のリストから削除される
 * 投稿はタイトルとドキュメントURLのみ。タイトルは手動または音声入力。
 * ドキュメントリンクをクリックすると自動的に確認チェックが入る。
 * タブ: 「未確認」「確認済み」で切り替え可能。管理者は既読者一覧を確認できる。
 * 機能: 検索絞り込み・期限設定・未確認者へのリマインド通知
 */
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
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
  RotateCcw,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isToday, addDays } from "date-fns";
import { ja } from "date-fns/locale";

// Google Picker APIキー
const PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined;

// Google APIスクリプトを動的ロード
function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
};

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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium">
        <AlertTriangle className="w-3 h-3" />
        期限切れ {format(d, "M/d", { locale: ja })}
      </span>
    );
  }
  if (dueToday) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium">
        <Calendar className="w-3 h-3" />
        今日が期限
      </span>
    );
  }
  if (dueSoon) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
        <Calendar className="w-3 h-3" />
        期限 {format(d, "M月d日", { locale: ja })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
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
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  確認済み（{data?.readers.length ?? 0}名）
                </p>
                {data && data.readers.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {data.readers.map((r) => (
                      <span
                        key={r.userId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs"
                        title={r.checkedAt ? format(new Date(r.checkedAt), "M月d日 HH:mm", { locale: ja }) : ""}
                      >
                        {r.userName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">まだいません</p>
                )}
              </div>
              {/* 未確認スタッフ */}
              <div>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                  <Circle className="w-3 h-3" />
                  未確認（{data?.unread.length ?? 0}名）
                </p>
                {data && data.unread.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {data.unread.map((r) => (
                      <span
                        key={r.userId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs"
                      >
                        {r.userName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">全員確認済みです</p>
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
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

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
  // Google Picker関連
  const [pickerLoading, setPickerLoading] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);

  // URLフラグメントからpicker_tokenを取得してPickerを開く（バックエンドOAuthコールバック後）
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("picker_token=")) return;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const token = params.get("picker_token");
    if (!token) return;
    window.history.replaceState(null, "", window.location.pathname);
    accessTokenRef.current = decodeURIComponent(token);
    tokenExpiryRef.current = Date.now() + 55 * 60 * 1000;
    setCreateOpen(true);
    openPickerWithToken(decodeURIComponent(token));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URLQueryのpicker_errorを処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("picker_error");
    if (!err) return;
    window.history.replaceState(null, "", window.location.pathname);
    toast.error("Driveの認証に失敗しました。再度お試しください。");
  }, []);

  // Google Picker APIでファイルを選択
  const openPickerWithToken = useCallback(async (token: string) => {
    if (!PICKER_API_KEY) {
      toast.error("Picker APIキーが設定されていません");
      return;
    }
    try {
      setPickerLoading(true);
      await loadScript("google-gapi-script", "https://apis.google.com/js/api.js");
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).gapi.load("picker", { callback: resolve, onerror: reject });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      const myDriveView = new google.picker.DocsView()
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);
      const sharedDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false)
        .setEnableDrives(true);
      const picker = new google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(PICKER_API_KEY)
        .setLocale("ja")
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .addView(myDriveView)
        .addView(sharedDriveView)
        .setCallback((data: {
          action: string;
          docs?: Array<{ id: string; name: string; mimeType: string; url: string }>;
        }) => {
          if (data.action === google.picker.Action.PICKED && data.docs && data.docs.length > 0) {
            const doc = data.docs[0];
            const fileUrl = doc.url || `https://drive.google.com/open?id=${doc.id}`;
            setNewDocumentUrl(fileUrl);
            if (!newTitle) setNewTitle(doc.name);
            toast.success(`「${doc.name}」を選択しました`);
          }
          setPickerLoading(false);
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      console.error("[GooglePicker] Error:", err);
      toast.error("Pickerの起動に失敗しました");
      setPickerLoading(false);
    }
  }, [newTitle]);

  // 「Driveから選択」ボタン押下時の処理
  const handleDriveAdd = useCallback(() => {
    if (!PICKER_API_KEY) {
      toast.error("Picker APIキーが設定されていません");
      return;
    }
    if (accessTokenRef.current && Date.now() < tokenExpiryRef.current) {
      openPickerWithToken(accessTokenRef.current);
      return;
    }
    const origin = window.location.origin;
    window.location.href = `/api/auth/google/picker?origin=${encodeURIComponent(origin)}&returnPath=/minutes`;
  }, [openPickerWithToken]);
  // 楽観的更新用: 添付を開いて確認済みになったID（リスト移動対象）
  const [localCheckedIds, setLocalCheckedIds] = useState<Set<number>>(new Set());
  // チェックボタンのみ押した状態（リスト移動なし、チェックマーク表示のみ）
  const [localPreCheckedIds, setLocalPreCheckedIds] = useState<Set<number>>(new Set());
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
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const uncheckMutation = trpc.minutes.uncheck.useMutation({
    onMutate: ({ minutesId }) => {
      // 楽観的更新: 即座にローカルチェックを解除
      setLocalCheckedIds((prev) => {
        const s = new Set(prev);
        s.delete(minutesId);
        return s;
      });
      setLocalPreCheckedIds((prev) => {
        const s = new Set(prev);
        s.delete(minutesId);
        return s;
      });
    },
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
    },
    onError: (e, { minutesId }) => {
      // エラー時はロールバック
      setLocalCheckedIds((prev) => new Set(prev).add(minutesId));
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

  // ドキュメントリンクをクリックしたら確認済みに移動（チェック状態に関わらず）
  const handleDocumentOpen = (minutesId: number, checkedByMe: boolean) => {
    if (!checkedByMe && !localCheckedIds.has(minutesId)) {
      // 未確認の場合: 添付を開いたら確認済みに移動（DBに保存）
      setLocalCheckedIds((prev) => new Set(prev).add(minutesId));
      // プレチェック状態を解除
      setLocalPreCheckedIds((prev) => {
        const s = new Set(prev);
        s.delete(minutesId);
        return s;
      });
      checkMutation.mutate({ minutesId });
    }
    // 既に確認済みの場合は何もしない
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
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          投稿
        </Button>
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
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
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
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold">
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
              <li>添付のドキュメントリンクを開く</li>
              <li>開いた時点で自動的に「確認済み」タブに移動される</li>
            </ol>
            <p className="text-amber-600 dark:text-amber-500 text-xs">※ 確認済みタブの「未確認に戻す」ボタンで元に戻せます</p>
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
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 bg-muted/60 animate-pulse rounded-xl" />
          ))}
        </div>
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
            const isChecked = m.checkedByMe || localCheckedIds.has(m.id) || localPreCheckedIds.has(m.id);
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
                          <a
                            href={m.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleDocumentOpen(m.id, m.checkedByMe)}
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
                    {/* 削除ボタン（投稿者本人または管理者のみ） */}
                    {(isAdmin || m.createdBy === user?.id) && (
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
                {/* 確認済みタブ: 未確認に戻すボタン */}
                {activeTab === "read" && isChecked && (
                  <div className="px-4 pb-3">
                    <button
                      onClick={() => uncheckMutation.mutate({ minutesId: m.id })}
                      disabled={uncheckMutation.isPending}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 border border-amber-300 dark:border-amber-600 rounded-md px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      未確認に戻す
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 投稿ダイアログ（全職員） */}
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
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" />
                  ドキュメントURL（任意）
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDriveAdd}
                  disabled={pickerLoading}
                  className="h-7 text-xs gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950/30"
                >
                  {pickerLoading ? (
                    <><Loader2 className="w-3 h-3 animate-spin" />認証中...</>
                  ) : (
                    <><FolderOpen className="w-3 h-3" />Driveから選択</>
                  )}
                </Button>
              </div>
              <div className="relative">
                <Input
                  placeholder="Google Docs / Sheets / Forms 等のURL（または上のボタンでDriveから選択）"
                  value={newDocumentUrl}
                  onChange={(e) => handleDocUrlChange(e.target.value)}
                  className="text-sm pr-8"
                />
                {isFetchingTitle && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
              {newDocumentUrl && (
                <p className="text-xs text-muted-foreground truncate">
                  選択中: {newDocumentUrl}
                </p>
              )}
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
