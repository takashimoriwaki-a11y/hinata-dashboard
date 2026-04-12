/**
 * 事故ページ
 * 医療事故・虐待・ヒヤリハット関連の書類・フォームへのリンクを提供する
 * 管理者のみリンクの追加・削除が可能
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, AlertTriangle, ClipboardList, ExternalLink, Plus, Trash2, FileSpreadsheet, Link as LinkIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

type Category = "医療事故・虚待" | "ヒヤリハット・アクシデント";

const CATEGORIES: { id: Category; label: string; icon: typeof AlertTriangle; color: string }[] = [
  { id: "医療事故・虚待" as Category, label: "医療事故・虚待", icon: AlertTriangle, color: "#f59e0b" },
  { id: "ヒヤリハット・アクシデント", label: "ヒヤリハット・アクシデント", icon: ClipboardList, color: "#8b5cf6" },
];

function getIconForUrl(href: string) {
  if (href.includes("docs.google.com/spreadsheets")) return FileSpreadsheet;
  if (href.includes("forms.gle") || href.includes("docs.google.com/forms")) return ClipboardList;
  return LinkIcon;
}

export default function TrafficAccident() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const { data: links = [] } = trpc.accidentLinks.getAll.useQuery();

  const createLink = trpc.accidentLinks.create.useMutation({
    onSuccess: () => {
      utils.accidentLinks.getAll.invalidate();
      setShowAddForm(null);
      setNewLabel("");
      setNewHref("");
      setNewDescription("");
      toast.success("リンクを追加しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLink = trpc.accidentLinks.delete.useMutation({
    onSuccess: () => {
      utils.accidentLinks.getAll.invalidate();
      toast.success("リンクを削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const [showAddForm, setShowAddForm] = useState<Category | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleAdd = (category: Category) => {
    if (!newLabel.trim() || !newHref.trim()) return;
    createLink.mutate({ category, label: newLabel.trim(), href: newHref.trim(), description: newDescription.trim() });
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">事故</h1>
          <p className="text-sm text-muted-foreground">事故・緊急時関連の書類・フォームへのリンク</p>
        </div>
      </div>

      {CATEGORIES.map((cat) => {
        const catLinks = links.filter((l) => l.category === cat.id);
        const Icon = cat.icon;
        const isFormOpen = showAddForm === cat.id;

        return (
          <Card key={cat.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: cat.color }} />
                  {cat.label}
                </CardTitle>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-primary px-2"
                    onClick={() => setShowAddForm(isFormOpen ? null : cat.id)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    追加
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 追加フォーム（管理者のみ） */}
              {isAdmin && isFormOpen && (
                <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-md">
                  <input
                    type="text"
                    placeholder="ラベル（例：医療事故・虐待発生時の連絡経路）"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="text-xs border rounded px-2 py-1 bg-background w-full"
                  />
                  <input
                    type="url"
                    placeholder="URL（https://...）"
                    value={newHref}
                    onChange={(e) => setNewHref(e.target.value)}
                    className="text-xs border rounded px-2 py-1 bg-background w-full"
                  />
                  <input
                    type="text"
                    placeholder="説明文（任意）"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="text-xs border rounded px-2 py-1 bg-background w-full"
                  />
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowAddForm(null)}>
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 text-xs"
                      disabled={!newLabel.trim() || !newHref.trim() || createLink.isPending}
                      onClick={() => handleAdd(cat.id)}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              )}

              {catLinks.length === 0 && !isFormOpen && (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  {isAdmin ? "「追加」からリンクを登録してください" : "リンクはまだ登録されていません"}
                </p>
              )}

              {catLinks.map((link) => {
                const LinkIcon2 = getIconForUrl(link.href);
                return (
                  <div key={link.id} className="flex items-center gap-2 group">
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors flex-1 min-w-0"
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: cat.color + "20" }}
                      >
                        <LinkIcon2 className="w-4 h-4" style={{ color: cat.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {link.label}
                        </p>
                        {link.description && (
                          <p className="text-xs text-muted-foreground truncate">{link.description}</p>
                        )}
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    </a>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (confirm(`「${link.label}」を削除しますか？`)) {
                            deleteLink.mutate({ id: link.id });
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
