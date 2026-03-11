/**
 * 議事録ページ
 * 管理者が議事録を投稿し、スタッフが確認チェックを入れると全員確認後に自動削除される
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, Circle, FileText, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export default function Minutes() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const { data: minutesList = [], isLoading } = trpc.minutes.list.useQuery();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const createMutation = trpc.minutes.create.useMutation({
    onSuccess: () => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
      setCreateOpen(false);
      setNewTitle("");
      setNewContent("");
      toast.success("議事録を投稿しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkMutation = trpc.minutes.check.useMutation({
    onSuccess: (data) => {
      utils.minutes.list.invalidate();
      utils.minutes.uncheckedCount.invalidate();
      if (data.deleted) {
        toast.success("全員が確認しました。議事録を削除しました。");
      } else {
        toast.success("確認済みにしました");
      }
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

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
              全員が確認するとリストから自動削除されます
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
          {minutesList.map((m) => {
            const isExpanded = expandedIds.has(m.id);
            return (
              <Card
                key={m.id}
                className={`transition-all border-border ${m.checkedByMe ? "opacity-60" : ""}`}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start gap-3">
                    {/* チェックボタン */}
                    <button
                      onClick={() => {
                        if (!m.checkedByMe) checkMutation.mutate({ minutesId: m.id });
                      }}
                      disabled={m.checkedByMe || checkMutation.isPending}
                      className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:cursor-default"
                    >
                      {m.checkedByMe ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    {/* タイトル・メタ情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{m.title}</span>
                        {m.checkedByMe && (
                          <Badge variant="secondary" className="text-xs">確認済み</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m.createdByName} ·{" "}
                        {format(new Date(m.createdAt), "M月d日(E) HH:mm", { locale: ja })}
                      </p>
                    </div>
                    {/* 展開・削除ボタン */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteConfirmId(m.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => toggleExpand(m.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="ml-8 border-l-2 border-border pl-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </p>
                      {!m.checkedByMe && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => checkMutation.mutate({ minutesId: m.id })}
                          disabled={checkMutation.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-500" />
                          確認済みにする
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
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
            <Textarea
              placeholder="議事録の内容を入力してください..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={10}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => createMutation.mutate({ title: newTitle, content: newContent })}
              disabled={!newTitle.trim() || !newContent.trim() || createMutation.isPending}
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
            この操作は取り消せません。確認チェックの記録も削除されます。
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
