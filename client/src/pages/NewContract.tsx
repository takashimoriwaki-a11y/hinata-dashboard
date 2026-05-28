/**
 * 新規契約ページ
 * 新規契約関連のリンクを管理する（DB: quickAccessLinks category="新規契約"）
 * 管理者（admin / super_admin）はリンクの追加・削除が可能
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink, Link2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const CATEGORY = "新規契約" as const;

export default function NewContract() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "super_admin";
  const utils = trpc.useUtils();

  const { data: allLinks } = trpc.quickAccessLinks.list.useQuery();
  const contractLinks = (allLinks ?? []).filter((l) => l.category === CATEGORY);

  // 追加フォームの状態
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("");

  const createLink = trpc.quickAccessLinks.create.useMutation({
    onSuccess: () => {
      utils.quickAccessLinks.list.invalidate();
      toast.success("リンクを追加しました");
      setShowAddForm(false);
      setNewLabel("");
      setNewHref("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLink = trpc.quickAccessLinks.delete.useMutation({
    onSuccess: () => {
      utils.quickAccessLinks.list.invalidate();
      toast.success("リンクを削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const addLink = () => {
    if (!newLabel.trim() || !newHref.trim()) {
      toast.error("ラベルとURLを入力してください");
      return;
    }
    createLink.mutate({
      category: CATEGORY,
      label: newLabel.trim(),
      href: newHref.trim(),
      emoji: "📄",
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">新規契約</h1>
          <p className="text-sm text-muted-foreground">新規契約関連の書類・フォームへのリンク</p>
        </div>
      </div>

      {/* リンクカード */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">関連リンク</CardTitle>
        </CardHeader>
        <CardContent>
          {contractLinks.length === 0 && !showAddForm ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Link2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">リンクはまだ登録されていません</p>
              {!canManage && (
                <p className="text-xs text-muted-foreground">URLを教えていただければ追加します</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {contractLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-1 group">
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-base">{link.emoji || "📄"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {link.label}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </a>
                  {canManage && (
                    <button
                      onClick={() => deleteLink.mutate({ id: link.id })}
                      className="text-muted-foreground hover:text-destructive p-2"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 管理者用：追加ボタン / 追加フォーム */}
          {canManage && !showAddForm && (
            <div className="flex justify-end mt-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-primary"
                onClick={() => setShowAddForm(true)}
              >
                + 追加
              </Button>
            </div>
          )}

          {canManage && showAddForm && (
            <div className="flex flex-col gap-2 p-3 mt-3 bg-muted/30 rounded-md">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="ラベル（例：新規受付）"
                className="w-full border rounded px-2 py-1 text-sm bg-background"
              />
              <input
                value={newHref}
                onChange={(e) => setNewHref(e.target.value)}
                placeholder="https://docs.google.com/..."
                className="w-full border rounded px-2 py-1 text-sm bg-background"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewLabel("");
                    setNewHref("");
                  }}
                >
                  キャンセル
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={addLink}
                  disabled={createLink.isPending}
                >
                  追加
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}