/**
 * 議事録ページ
 * 管理者が議事録を投稿し、各スタッフが確認チェックを入れると自分のリストから削除される
 * 投稿はタイトルとドキュメントURLのみ。タイトルは手動または音声入力。
 * ドキュメントリンクをクリックすると自動的に確認チェックが入る。
 */
import { useState, useRef } from "react";
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
import { Circle, CheckCircle2, FileText, Plus, Trash2, ExternalLink, Link as LinkIcon, Loader2, Info, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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

export default function Minutes() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const { data: minutesList = [], isLoading } = trpc.minutes.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDocumentUrl, setNewDocumentUrl] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
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
      toast.success("議事録を投稿しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkMutation = trpc.minutes.check.useMutation({
    onMutate: ({ minutesId }) => {
      // 楽観的更新: 即座にチェックマークを表示
      setCheckedIds((prev) => new Set(prev).add(minutesId));
    },
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
      toast.success("確認済みにしました。リストから削除されました。");
    },
    onError: (e, { minutesId }) => {
      // エラー時はロールバック
      setCheckedIds((prev) => { const s = new Set(prev); s.delete(minutesId); return s; });
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
    if (!checkedIds.has(minutesId)) {
      checkMutation.mutate({ minutesId });
    }
  };

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

      {/* 操作説明バナー */}
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

      {/* 議事録リスト */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">読み込み中...</div>
      ) : minutesList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>未確認の議事録はありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {minutesList.map((m) => (
            <Card key={m.id} className="border-border">
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-start gap-3">
                  {/* チェックボタン */}
                  <button
                    onClick={() => {
                      if (!checkedIds.has(m.id)) {
                        checkMutation.mutate({ minutesId: m.id });
                      }
                    }}
                    disabled={checkMutation.isPending && checkedIds.has(m.id)}
                    className={`mt-0.5 flex-shrink-0 transition-colors ${
                      checkedIds.has(m.id)
                        ? "text-emerald-500 cursor-default"
                        : "text-muted-foreground hover:text-emerald-500"
                    }`}
                    title={checkedIds.has(m.id) ? "確認済み" : "先にここを押して確認済みにする"}
                  >
                    {checkedIds.has(m.id)
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
                    </div>
                    {/* 添付ドキュメントリンク */}
                    {m.documentUrl && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          先に左の ○ を押してから開いてください
                        </p>
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
                  </div>
                  {/* 削除ボタン（adminのみ） */}
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteConfirmId(m.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* 投稿ダイアログ（adminのみ） */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setNewTitle("");
          setNewDocumentUrl("");
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
              })}
              disabled={!newTitle.trim() || createMutation.isPending}
            >
              投稿する
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
