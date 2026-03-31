/**
 * マイリンクページ
 * 個人用リンクの管理（追加・編集・削除）とGoogle Driveからのファイル選択
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Link as LinkIcon,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Search,
  Loader2,
  FileText,
  FolderOpen,
  Star,
  GripVertical,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// MIMEタイプからアイコン・ラベルを取得
function getMimeInfo(mimeType: string): { emoji: string; label: string } {
  if (mimeType === "application/vnd.google-apps.spreadsheet") return { emoji: "📊", label: "スプレッドシート" };
  if (mimeType === "application/vnd.google-apps.document") return { emoji: "📄", label: "ドキュメント" };
  if (mimeType === "application/vnd.google-apps.presentation") return { emoji: "📑", label: "スライド" };
  if (mimeType === "application/vnd.google-apps.folder") return { emoji: "📁", label: "フォルダ" };
  if (mimeType === "application/vnd.google-apps.form") return { emoji: "📝", label: "フォーム" };
  if (mimeType.startsWith("image/")) return { emoji: "🖼️", label: "画像" };
  if (mimeType === "application/pdf") return { emoji: "📕", label: "PDF" };
  return { emoji: "🔗", label: "ファイル" };
}

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  modifiedTime: string;
};

export default function MyLinks() {
  const utils = trpc.useUtils();

  // マイリンク一覧
  const { data: links, isLoading } = trpc.myLinks.list.useQuery(undefined, { retry: false });

  const createLink = trpc.myLinks.create.useMutation({
    onSuccess: () => {
      utils.myLinks.list.invalidate();
      toast.success("リンクを追加しました");
      setShowAddDialog(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLink = trpc.myLinks.update.useMutation({
    onSuccess: () => {
      utils.myLinks.list.invalidate();
      toast.success("リンクを更新しました");
      setEditingLink(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLink = trpc.myLinks.delete.useMutation({
    onSuccess: () => {
      utils.myLinks.list.invalidate();
      toast.success("リンクを削除しました");
      setDeleteTargetId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // フォーム状態
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔗");
  const [newDescription, setNewDescription] = useState("");

  // 編集状態
  const [editingLink, setEditingLink] = useState<{ id: number; label: string; url: string; emoji: string; description?: string | null } | null>(null);

  // 削除確認
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Google Drive検索
  const [showDriveSearch, setShowDriveSearch] = useState(false);
  const [driveQuery, setDriveQuery] = useState("");
  const [driveQueryInput, setDriveQueryInput] = useState("");
  const { data: driveFiles, isLoading: driveLoading, error: driveError } = trpc.myLinks.searchDrive.useQuery(
    { query: driveQuery },
    { enabled: driveQuery.length >= 1, retry: false }
  );

  const resetForm = () => {
    setNewLabel("");
    setNewUrl("");
    setNewEmoji("🔗");
    setNewDescription("");
  };

  const handleAdd = () => {
    if (!newLabel.trim()) { toast.error("ラベルを入力してください"); return; }
    if (!newUrl.trim()) { toast.error("URLを入力してください"); return; }
    createLink.mutate({
      label: newLabel.trim(),
      url: newUrl.trim(),
      emoji: newEmoji || "🔗",
      description: newDescription.trim() || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingLink) return;
    if (!editingLink.label.trim()) { toast.error("ラベルを入力してください"); return; }
    if (!editingLink.url.trim()) { toast.error("URLを入力してください"); return; }
    updateLink.mutate({
      id: editingLink.id,
      label: editingLink.label.trim(),
      url: editingLink.url.trim(),
      emoji: editingLink.emoji || "🔗",
      description: editingLink.description?.trim() || undefined,
    });
  };

  const handleSelectDriveFile = (file: DriveFile) => {
    const { emoji } = getMimeInfo(file.mimeType);
    setNewEmoji(emoji);
    setNewLabel(file.name);
    setNewUrl(file.webViewLink);
    setShowDriveSearch(false);
    setDriveQuery("");
    setDriveQueryInput("");
    setShowAddDialog(true);
  };

  const handleDriveSearch = () => {
    if (driveQueryInput.trim().length < 1) return;
    setDriveQuery(driveQueryInput.trim());
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Star className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">マイリンク</h1>
            <p className="text-sm text-muted-foreground">よく使うリンクを登録・管理できます</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDriveSearch(true)}
            className="gap-1.5"
          >
            <FolderOpen className="w-4 h-4" />
            Driveから追加
          </Button>
          <Button
            size="sm"
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            追加
          </Button>
        </div>
      </div>

      {/* リンク一覧 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-primary" />
            登録済みリンク
            {links && links.length > 0 && (
              <Badge variant="secondary" className="ml-1">{links.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !links || links.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <LinkIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">リンクはまだ登録されていません</p>
              <p className="text-xs text-muted-foreground">「追加」または「Driveから追加」ボタンでリンクを登録できます</p>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors group"
                >
                  <span className="text-xl flex-shrink-0">{link.emoji ?? "🔗"}</span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-primary hover:underline flex items-center gap-1 truncate"
                    >
                      {link.label}
                      <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
                    </a>
                    {link.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{link.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 truncate">{link.url}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => setEditingLink({ id: link.id, label: link.label, url: link.url, emoji: link.emoji ?? "🔗", description: link.description })}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTargetId(link.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 追加ダイアログ */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>リンクを追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">絵文字</Label>
                <Input
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  className="w-16 text-center text-lg"
                  maxLength={4}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">ラベル名 <span className="text-destructive">*</span></Label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="例: 業務日報"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">URL <span className="text-destructive">*</span></Label>
              <Input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">メモ（任意）</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="このリンクの説明"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              キャンセル
            </Button>
            <Button onClick={handleAdd} disabled={createLink.isPending}>
              {createLink.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={!!editingLink} onOpenChange={(open) => { if (!open) setEditingLink(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>リンクを編集</DialogTitle>
          </DialogHeader>
          {editingLink && (
            <div className="space-y-4 py-2">
              <div className="flex gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">絵文字</Label>
                  <Input
                    value={editingLink.emoji}
                    onChange={(e) => setEditingLink({ ...editingLink, emoji: e.target.value })}
                    className="w-16 text-center text-lg"
                    maxLength={4}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">ラベル名 <span className="text-destructive">*</span></Label>
                  <Input
                    value={editingLink.label}
                    onChange={(e) => setEditingLink({ ...editingLink, label: e.target.value })}
                    placeholder="例: 業務日報"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL <span className="text-destructive">*</span></Label>
                <Input
                  type="url"
                  value={editingLink.url}
                  onChange={(e) => setEditingLink({ ...editingLink, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">メモ（任意）</Label>
                <Input
                  value={editingLink.description ?? ""}
                  onChange={(e) => setEditingLink({ ...editingLink, description: e.target.value })}
                  placeholder="このリンクの説明"
                  maxLength={200}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLink(null)}>
              キャンセル
            </Button>
            <Button onClick={handleUpdate} disabled={updateLink.isPending}>
              {updateLink.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>リンクを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTargetId !== null && deleteLink.mutate({ id: deleteTargetId })}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Google Drive検索ダイアログ */}
      <Dialog open={showDriveSearch} onOpenChange={(open) => { setShowDriveSearch(open); if (!open) { setDriveQuery(""); setDriveQueryInput(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-500" />
              Google Driveから選択
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={driveQueryInput}
                onChange={(e) => setDriveQueryInput(e.target.value)}
                placeholder="ファイル名で検索..."
                onKeyDown={(e) => e.key === "Enter" && handleDriveSearch()}
              />
              <Button onClick={handleDriveSearch} disabled={driveLoading || driveQueryInput.trim().length < 1}>
                {driveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ※ サービスアカウントがアクセスできるファイルのみ表示されます
            </p>
            {driveError && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3">
                検索エラー: {driveError.message}
              </div>
            )}
            {driveFiles && driveFiles.length === 0 && driveQuery && (
              <p className="text-sm text-muted-foreground text-center py-4">「{driveQuery}」に一致するファイルが見つかりませんでした</p>
            )}
            {driveFiles && driveFiles.length > 0 && (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {driveFiles.map((file) => {
                  const { emoji, label } = getMimeInfo(file.mimeType);
                  return (
                    <button
                      key={file.id}
                      onClick={() => handleSelectDriveFile(file)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="text-xl flex-shrink-0">{emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{label} · {new Date(file.modifiedTime).toLocaleDateString("ja-JP")}</p>
                      </div>
                      <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
