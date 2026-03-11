/**
 * 議事録ページ
 * 管理者が議事録を投稿し、各スタッフが確認チェックを入れると自分のリストから削除される
 * 投稿はタイトルとドキュメントURLのみ
 */
import { useState } from "react";
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
import { CheckCircle2, Circle, FileText, Plus, Trash2, ExternalLink, Link as LinkIcon } from "lucide-react";
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
              確認チェックを入れると自分のリストから削除されます
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

      {/* 議事録リスト */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">読み込み中...</div>
      ) : minutesList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
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
                    title="確認済みにする（自分のリストから削除）"
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
                      <a
                        href={m.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-accent transition-colors group w-fit max-w-full"
                      >
                        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {m.documentLabel || "ドキュメントを開く"}
                        </span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      </a>
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>議事録を投稿</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="タイトル（例: 2026年3月 定例会議）"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={300}
            />
            {/* ドキュメント添付 */}
            <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border border-border">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <LinkIcon className="w-3 h-3" />
                ドキュメントを添付（任意）
              </p>
              <Input
                placeholder="ドキュメントのURL（Google Docs, Sheets等）"
                value={newDocumentUrl}
                onChange={(e) => setNewDocumentUrl(e.target.value)}
                className="text-sm"
              />
              <Input
                placeholder="ドキュメントの名前（例: 2026年3月 議事録）"
                value={newDocumentLabel}
                onChange={(e) => setNewDocumentLabel(e.target.value)}
                maxLength={200}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => createMutation.mutate({
                title: newTitle,
                content: newTitle, // contentはタイトルと同じ値を使用
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
