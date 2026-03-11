/**
 * 議事録ページ
 * 管理者が議事録を投稿し、各スタッフが確認チェックを入れると自分のリストから削除される
 * 投稿はタイトルとドキュメントURLのみ。URL入力後にタイトルを自動取得。
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
import { Circle, CheckCircle2, FileText, Plus, Trash2, ExternalLink, Link as LinkIcon, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export default function Minutes() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const { data: minutesList = [], isLoading } = trpc.minutes.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDocumentUrl, setNewDocumentUrl] = useState("");
  const [newDocumentLabel, setNewDocumentLabel] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const fetchTitleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          if (!newDocumentLabel) setNewDocumentLabel(result.title);
        }
      } catch {
        // タイトル取得失敗は無視
      } finally {
        setIsFetchingTitle(false);
      }
    }, 800);
  };

  const createMutation = trpc.minutes.create.useMutation({
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
      setCreateOpen(false);
      setNewTitle("");
      setNewDocumentUrl("");
      setNewDocumentLabel("");
      toast.success("議事録を投稿しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkMutation = trpc.minutes.check.useMutation({
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
      toast.success("確認済みにしました。リストから削除されました。");
    },
    onError: (e) => toast.error(e.message),
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
    checkMutation.mutate({ minutesId });
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
                    onClick={() => checkMutation.mutate({ minutesId: m.id })}
                    disabled={checkMutation.isPending}
                    className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-emerald-500 transition-colors"
                    title="先にここを押して確認済みにする"
                  >
                    <Circle className="w-5 h-5" />
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
                            {m.documentLabel || "ドキュメントを開く"}
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
        if (!open) { setNewTitle(""); setNewDocumentUrl(""); setNewDocumentLabel(""); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>議事録を投稿</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* ドキュメント添付（先に入力でタイトル自動取得） */}
            <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border border-border">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <LinkIcon className="w-3 h-3" />
                ドキュメントURL（先に入力するとタイトルが自動入力されます）
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
              <Input
                placeholder="ドキュメントの名前（自動取得または手動入力）"
                value={newDocumentLabel}
                onChange={(e) => setNewDocumentLabel(e.target.value)}
                maxLength={200}
                className="text-sm"
              />
            </div>
            {/* タイトル */}
            <Input
              placeholder="議事録のタイトル（自動取得または手動入力）"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={300}
            />
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
                documentLabel: newDocumentLabel || undefined,
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
