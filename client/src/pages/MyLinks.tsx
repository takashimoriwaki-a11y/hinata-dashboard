/**
 * マイリンクページ
 * 個人用リンクの管理（追加・編集・削除）とGoogle Picker APIによるDriveファイル選択
 */
import { useState, useEffect, useCallback } from "react";
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
  Loader2,
  FolderOpen,
  Star,
} from "lucide-react";
import { toast } from "sonner";

// Google Picker APIのAPIキー（VITE環境変数）
const PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined;

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

// Google Picker APIスクリプトを動的ロード
function loadPickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById("google-picker-script")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "google-picker-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google API script load failed"));
    document.head.appendChild(script);
  });
}

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

  // Picker状態
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerToken, setPickerToken] = useState<string | null>(null);

  // URLフラグメントからpicker_tokenを取得（OAuthコールバック後）
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("picker_token=")) {
      const match = hash.match(/picker_token=([^&]+)/);
      if (match) {
        const token = decodeURIComponent(match[1]);
        setPickerToken(token);
        // フラグメントをクリア
        window.history.replaceState(null, "", window.location.pathname);
        // トークンが取得できたらすぐにPickerを開く
        openPickerWithToken(token);
      }
    }
    // picker_errorの確認
    const params = new URLSearchParams(window.location.search);
    if (params.get("picker_error")) {
      toast.error("Driveの認証に失敗しました。再度お試しください。");
      window.history.replaceState(null, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Google Picker APIでファイルを選択
  const openPickerWithToken = useCallback(async (token: string) => {
    if (!PICKER_API_KEY) {
      toast.error("Picker APIキーが設定されていません");
      return;
    }
    setPickerLoading(true);
    try {
      await loadPickerScript();
      // gapi.loadでpickerモジュールをロード
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).gapi.load("picker", { callback: resolve, onerror: reject });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      const picker = new google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(PICKER_API_KEY)
        .setLocale("ja")
        .addView(
          new google.picker.DocsView()
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
        )
        .addView(new google.picker.DocsUploadView())
        .setCallback((data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string; url: string }> }) => {
          if (data.action === google.picker.Action.PICKED && data.docs && data.docs.length > 0) {
            const doc = data.docs[0];
            const { emoji } = getMimeInfo(doc.mimeType);
            setNewEmoji(emoji);
            setNewLabel(doc.name);
            // DriveファイルのURLを構築
            const fileUrl = doc.url || `https://drive.google.com/open?id=${doc.id}`;
            setNewUrl(fileUrl);
            setShowAddDialog(true);
            setPickerToken(null);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      console.error("[GooglePicker] Error:", err);
      toast.error("Pickerの起動に失敗しました");
    } finally {
      setPickerLoading(false);
    }
  }, []);

  // 「Driveから追加」ボタン押下時の処理
  const handleDriveAdd = async () => {
    // すでにトークンがある場合はそのまま開く
    if (pickerToken) {
      openPickerWithToken(pickerToken);
      return;
    }
    // OAuthフローを開始（現在のoriginを渡す）
    const origin = window.location.origin;
    window.location.href = `/api/auth/google/picker?origin=${encodeURIComponent(origin)}`;
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
            onClick={handleDriveAdd}
            disabled={pickerLoading}
            className="gap-1.5"
          >
            {pickerLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
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

      {/* 説明バナー */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <FolderOpen className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>「Driveから追加」を押すとGoogleアカウントでサインインし、自分のDrive内のファイルやフォルダを検索・選択してリンクに追加できます。</span>
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
    </div>
  );
}
